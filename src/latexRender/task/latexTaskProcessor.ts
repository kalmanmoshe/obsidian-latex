import Moshe from "src/main";
import { VirtualFileSystem } from "../VirtualFileSystem";
import { TFile } from "obsidian";
import { extractCodeBlockName } from "../resolvers/latexSourceFromFile";
import {
  createDpendency,
  isExtensionTex,
  LatexAbstractSyntaxTree,
  LatexDependency,
} from "../../ast/parse";
import { String as StringClass } from "../../ast/typs/ast-types-post";
import { CODE_BLOCK_NAME_SEPARATOR, extractBasenameAndExtension, findRelativeFile, getFileContent, isValidFileBasename, resolvePathRelToVault } from "../resolvers/paths";
import { ProcessableLatexTask } from "./latexTask";

type VFSLatexDependency = LatexDependency & { inVFS: boolean };
interface VFSLatexBaseDependency extends LatexDependency {
  basename: string;
  extension: string;
  isTex: boolean;
}

/**
 * Class to handle LaTeX tasks, processing the source code,
 * managing dependencies, and interacting with the virtual file system.
 */
export class LatexTaskProcessor {
  task: ProcessableLatexTask;
  plugin: Moshe;
  vfs: VirtualFileSystem;
  isError: boolean = false;
  err: string | null = null;
  dependencies: VFSLatexDependency[] = [];
  static create(plugin: Moshe, task: ProcessableLatexTask) {
    const latexTask = new LatexTaskProcessor();
    latexTask.task = task;
    latexTask.plugin = plugin;
    latexTask.vfs = plugin.swiftlatexRender.vfs;
    return latexTask;
  }
  private setError(err: string) {
    if (this.err !== null) {
      const errorMessage = "Error already set: " + this.err + ". New error: " + err;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    this.err = err;
    this.isError = true;
  }
  private isNameConflict(basename: string): boolean {
    console.log("Checking name conflict for basename:", basename, "Possible names:", this.task.possibleNames);
    return isValidFileBasename(basename) && this.task.possibleNames !== undefined && this.task.possibleNames.includes(basename);
  }

  private async resolveDependency(filePath: string, basePath: string) {
    let path = resolvePathRelToVault(filePath, basePath);
    const codeBlockName = path.split(CODE_BLOCK_NAME_SEPARATOR).pop();
    if (codeBlockName) {
      if (!isValidFileBasename(codeBlockName)) {
        throw new Error(`Invalid code block name: ${codeBlockName}`);
      }
    }
    const { basename, extension } = extractBasenameAndExtension(path);
    if (this.isNameConflict(basename)) {
      throw new Error(`Name conflict detected for code block: ${codeBlockName}`);
    }
    const content = await getFileContent(path);

    const dependency = createDpendency(content, path, { isTex: isExtensionTex(extension) });
    console.log("Resolved dependency:", dependency, basename, extension);
    return dependency;
  }

  /**
   * Processes input files in the LaTeX AST, extracting dependencies and
   * normalizing file names.
   * @param ast The LaTeX abstract syntax tree.
   * @param basePath The base path for resolving relative file paths.
   * @returns An array of dependencies found in the input files.
   */
  private async processInputFiles(ast: LatexAbstractSyntaxTree, basePath: string): Promise<VFSLatexDependency[] | undefined> {
    const usedFiles: VFSLatexDependency[] = [];
    const inputFilesMacros = ast.usdInputFiles()
      .filter((macro) => macro.args && macro.args.length === 1);
    for (const macro of inputFilesMacros) {
      const args = macro.args!;
      const filePath = args[0].content.map((node) => node.toString()).join("").trim();
      console.log("Processing input file:", filePath);
      const dependency = await this.resolveDependency(filePath, basePath);
      const name = dependency.basename + "." + dependency.extension;
      // Replace the macro argument with normalized name
      args[0].content = [new StringClass(name)];

      // Avoid circular includes
      if (this.vfs.hasFile(name)) continue;

      if (dependency.isTex) {
        // Recursively process the content
        const nestedAst = LatexAbstractSyntaxTree.parse(dependency.content);
        const processedFiles = await this.processInputFiles(nestedAst, basePath);
        if (!processedFiles) { return; }
        usedFiles.push(...processedFiles);
        dependency.ast = nestedAst;
        dependency.content = nestedAst.toString();
      }

      const vfsDep = { ...dependency, inVFS: false }
      usedFiles.push(vfsDep);
      ast.addDependency(dependency);
    }

    return usedFiles;
  }
  /**
   * Processes the LaTeX task source code, parsing it into an AST,
   * extracting dependencies, and preparing the final source code.
   * @returns An object containing the processed source, used files, and AST.
   */
  async processTaskSource() {
    const startTime = performance.now();
    try {
      const ast = LatexAbstractSyntaxTree.parse(this.task.getContent());
      this.nameTaskCodeBlock();
      if (this.plugin.settings.compilerVfsEnabled) {
        const files = await this.processInputFiles(ast, this.task.sourcePath)
        if (!files) { return }
        this.dependencies.push(...files);
        this.dependencies.push(...this.addAutoUseFilesToAst(ast));
      }
      ast.verifyProperDocumentStructure();
      this.task.setAst(ast);
      this.task.processingTime = performance.now() - startTime;
      // ── Final task update ────────────────────────
    } catch (e) {
      if (typeof e !== "string" && "abort" in e) {
        e = e.message;
      }
      this.setError(e);
    }
  }
  private nameTaskCodeBlock() {
    const file = app.vault.getAbstractFileByPath(this.task.sourcePath);
    if (!file || !(file instanceof TFile)) {
      this.setError("Source path is not a valid file.");
      return;
    }
    const names = []
    for (const section of this.task.sectionInfos) {
      const line = section.codeBlock.split("\n")[0];
      const name = extractCodeBlockName(line);
      if (name) names.push(name);
    }
    this.task.possibleNames = names;
  }

  private addAutoUseFilesToAst(ast: LatexAbstractSyntaxTree) {
    const files: VFSLatexDependency[] = [];
    this.vfs.getAutoUseFileNames().forEach((name) => {
      ast.addInputFileToPramble(name);
      const file = this.vfs.getFile(name).content;
      const dependency = createDpendency(file, name, { isTex: true, autoUse: true });
      const vfsDep = { ...dependency, inVFS: true };
      files.push(vfsDep);
      ast.addDependency(dependency);
    });
    return files
  }

  async processTask(): Promise<boolean> {
    await this.processTaskSource();
    if (this.isError) { return false; }
    for (const dep of this.dependencies) {
      if (!dep.inVFS) this.vfs.addVirtualFileSystemFile({ name: dep.basename + "." + dep.extension, content: dep.content });
    }
    return true;
  }

  static async processTask(plugin: Moshe, task: ProcessableLatexTask) {
    const latexTask = LatexTaskProcessor.create(plugin, task);
    await latexTask.processTask();
    return latexTask;
  }
}
