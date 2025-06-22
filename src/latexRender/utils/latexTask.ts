import Moshe from "src/main";
import { latexCodeBlockNamesRegex, Task } from "../main";
import { VirtualFileSystem } from "../VirtualFileSystem";
import { TFile } from "obsidian";
import { getFileSections } from "../cache/sectionCache";
import {
  findRelativeFile,
  getLatexCodeBlocksFromString,
} from "../cache/latexSourceFromFile";
import {
  createDpendency,
  isExtensionTex,
  LatexAbstractSyntaxTree,
  LatexDependency,
} from "../parse/parse";
import { String as StringClass } from "../parse/typs/ast-types-post";
import path from "path";

type ProcessableTask = Partial<Omit<Task, "source" | "sourcePath" | "el">> &
  Pick<Task, "source" | "sourcePath" | "el">;
type MinProcessableTask = Partial<Omit<Task, "source" | "sourcePath">> &
  Pick<Task, "source" | "sourcePath">;

type InputFile = {
  name: string;
  content: string;
  dependencies: InputFile[];
};
type VFSLatexDependency = LatexDependency & { inVFS: boolean };
export class LatexTask {
  task: MinProcessableTask;
  plugin: Moshe;
  vfs: VirtualFileSystem;
  abort: boolean = false;
  err: string | null = null;
  static create(plugin: Moshe, task: MinProcessableTask) {
    const latexTask = new LatexTask();
    latexTask.task = task;
    latexTask.plugin = plugin;
    latexTask.vfs = plugin.swiftlatexRender.vfs;
    return latexTask;
  }
  async getFileContent(file: TFile, remainingPath?: string): Promise<string> {
    const fileContent = await this.plugin.app.vault.read(file);
    if (!remainingPath) return fileContent;
    const sections = await getFileSections(file, this.plugin.app, true);
    const err = () => {
      throw new Error(
        "No code block found with name: " +
          remainingPath +
          " in file: " +
          file.path,
      );
    };
    if (!sections) err();
    const codeBlocks = await getLatexCodeBlocksFromString(
      fileContent,
      sections!,
      true,
    );
    const target = codeBlocks.find((block) =>
      block.content
        .split("\n")[0]
        .replace(latexCodeBlockNamesRegex, "")
        .trim()
        .match(new RegExp("name: *" + remainingPath)),
    );
    if (!target) err();
    return target!.content.split("\n").slice(1, -1).join("\n");
  }
  private async processInputFiles(
    ast: LatexAbstractSyntaxTree,
    basePath: string,
  ): Promise<VFSLatexDependency[]> {
    const usedFiles: VFSLatexDependency[] = [];
    const inputFilesMacros = ast
      .usdInputFiles()
      .filter((macro) => macro.args && macro.args.length === 1);
    for (const macro of inputFilesMacros) {
      const args = macro.args!;
      const filePath = args[0].content.map((node) => node.toString()).join("");
      const dir = findRelativeFile(
        filePath,
        this.plugin.app.vault.getAbstractFileByPath(basePath),
      );
      const name = (dir.remainingPath || dir.file.basename) + ".tex";

      // Replace the macro argument with normalized name
      args[0].content = [new StringClass(name)];

      // Avoid circular includes
      if (this.vfs.hasFile(name)) continue;

      let content = "";
      try {
        content = await this.getFileContent(dir.file, dir.remainingPath);
      } catch (e) {
        return e;
      }
      const ext = path.extname(name);
      const baseDependency: Partial<VFSLatexDependency> & {
        name: string;
        extension: string;
        isTex: boolean;
      } = {
        name,
        extension: ext,
        isTex: isExtensionTex(ext),
      };

      if (baseDependency.isTex) {
        // Recursively process the content
        const nestedAst = LatexAbstractSyntaxTree.parse(content);
        usedFiles.push(
          ...(await this.processInputFiles(nestedAst, dir.file.path)),
        );
        baseDependency.ast = nestedAst;
        baseDependency.source = nestedAst.toString();
      } else {
        baseDependency.source = content;
      }

      const dependency = {
        ...createDpendency(
          baseDependency.source,
          baseDependency.name,
          baseDependency.extension,
          baseDependency,
        ),
        inVFS: false,
      };
      usedFiles.push(dependency);
      ast.addDependency(
        content,
        dependency.name,
        dependency.extension,
        dependency,
      );
    }
    return usedFiles;
  } /**
   * They're somewhere a bug over here that infinitely adds document Environments
   */
  async processTaskSource() {
    const usedFiles: VFSLatexDependency[] = [];
    const startTime = performance.now();
    const process = {
      abort: false,
      source: undefined as string | undefined,
      usedFiles,
      ast: null as LatexAbstractSyntaxTree | null,
    };
    try {
      const ast = LatexAbstractSyntaxTree.parse(this.task.source);
      usedFiles.push(
        ...(await this.processInputFiles(ast, this.task.sourcePath)),
      );

      this.vfs.getAutoUseFileNames().forEach((name) => {
        ast.addInputFileToPramble(name);
        const file = this.vfs.getFile(name).content;
        const dependency = {
          ...createDpendency(file, name, path.extname(name), {
            isTex: true,
            autoUse: true,
          }),
          inVFS: true,
        };
        usedFiles.push(dependency);
        ast.addDependency(
          file,
          dependency.name,
          dependency.extension,
          dependency,
        );
      });
      ast.verifyProperDocumentStructure();
      const totalDuration = performance.now() - startTime;
      console.log(
        `[TIMER] Total processing time: ${totalDuration.toFixed(2)} ms`,
      );
      // ── Final task update ────────────────────────
      return { ...process, source: ast.toString(), ast };
    } catch (e) {
      let abort = false;
      if (typeof e !== "string" && "abort" in e) {
        abort = e.abort;
        e = e.message;
      }
      this.err = "Error processing task: " + e;
      return { ...process, abort };
    }
  }
  async processTask(): Promise<boolean> {
    const { usedFiles, abort, source, ast } = await this.processTaskSource();
    if (this.err) {
      console.error("Error processing task:", this.err);
      this.task.el &&
        this.plugin.swiftlatexRender.handleError(this.task.el, this.err, {
          hash: this.task.md5Hash,
        });
      return !!abort;
    }
    //this is just for ts types
    if (!source) throw new Error("Unexpected error: source is undefined");
    for (const dep of usedFiles) {
      if (!dep.inVFS)
        this.vfs.addVirtualFileSystemFile({
          name: dep.name,
          content: dep.source,
        });
    }
    this.task.source = source;
    return !!this.err;
  }
  static async processTask(plugin: Moshe, task: MinProcessableTask) {
    const latexTask = LatexTask.create(plugin, task);
    await latexTask.processTask();
    return latexTask;
  }
}
