import Moshe from "src/main";
import { getFileSectionsFromPath, hashLatexSource, latexCodeBlockNamesRegex, Task } from "../swiftlatexRender";
import { VirtualFileSystem } from "../VirtualFileSystem";
import { MarkdownPostProcessorContext, MarkdownSectionInformation, MarkdownView, TFile } from "obsidian";
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
import { getSectionFromMatching, getSectionFromTransaction } from "../cache/findSection";
/**
 * Be careful of catching this as the file may change and until you don't generate a new one it will be static.
 */
interface TaskSectionInformation extends MarkdownSectionInformation{
  /**
   * The file text where the task (source) is located.
   */
  text: string;
}
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
class BaseTask {
  surce: string;
  sourcePath: string;
}
class _ProcessableTask extends BaseTask {
  el: HTMLElement | null;
}
class ProcessedTask extends _ProcessableTask {
  ast: LatexAbstractSyntaxTree | null;
  md5Hash: string;
  processed: boolean;
  processingTime: number;
}
export function createTask(plugin: Moshe, process: boolean, source: string, el: HTMLElement): LatexTask | ProcessableLatexTask {
  return process
    ? new ProcessableLatexTask(plugin, source, el)
    : new LatexTask(plugin, source, el);
}

export class LatexTask{
  plugin: Moshe;
  protected source: string;
  sourcePath: string;
  md5Hash: string;
  blockId: string;
  el: HTMLElement;
  sectionInfo?: TaskSectionInformation;
  
  constructor(plugin: Moshe, source: string, el: HTMLElement) {
    this.plugin = plugin;
    this.setSource(source);
    this.el = el;
  }
  static baseCreate(plugin: Moshe, process: boolean,source: string, el: HTMLElement,sourcePath: string, sectionInfo: TaskSectionInformation): LatexTask  {
    const task = createTask(plugin, process, source, el);
    Object.assign(task, {sourcePath,sectionInfo});
    return task;
  }
  static create(plugin: Moshe, source: string, el: HTMLElement, sourcePath: string, sectionInfo: TaskSectionInformation): LatexTask {
    return this.baseCreate(plugin, false, source, el, sourcePath, sectionInfo);
  }
  static async createAsync(plugin: Moshe, process: boolean, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const task = createTask(plugin, process, source, el);
    task.sourcePath = ctx.sourcePath; 
    try {
      await task.ensureSectionInfo(ctx);
    } catch (err ) {
      return err as string;
    }
    return task;
  }
  isProcess(): this is ProcessableLatexTask { return this instanceof ProcessableLatexTask;}
  restoreFromCache() {
    return this.plugin.swiftlatexRender.cache.restoreFromCache(this.el, this.md5Hash);
  }
  setSource(source: string) { 
    this.source = source;
    this.md5Hash = hashLatexSource(source);
  }
  getSource(){return this.source;}
  getBlockId() { 
    if (!this.sectionInfo) throw new Error("Section information is not set for this task.");
    return `${this.sourcePath.replace(/ /g, "_")}_${this.sectionInfo.lineStart}`;
  }
  async initialize(ctx: MarkdownPostProcessorContext) {
    await this.ensureSectionInfo(ctx);
  }
  /**
   * sets the section information for the task.
   * Attempts to locate the Markdown section that corresponds to a rendered code block,
   * even when section info is unavailable (e.g., virtual rendering or nested codeBlock environments).
   * @param ctx 
   * @returns 
   */
  private async ensureSectionInfo(ctx: MarkdownPostProcessorContext) {
    const sectionFromContext = ctx.getSectionInfo(this.el);
    if (sectionFromContext) { this.sectionInfo = sectionFromContext; return; };
    
    const { file, sections } = await getFileSectionsFromPath(ctx.sourcePath, this.plugin.app);
    const editor = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const fileText = editor?.getValue() ?? (await this.plugin.app.vault.cachedRead(file));
    // i want to move the logger to the plugin thats why i have the err for now, as a reminder
    let sectionInfo: (MarkdownSectionInformation&{source?: string})|undefined = getSectionFromTransaction(sections,fileText,this.plugin.logger,editor);
    if (!sectionInfo) {
     sectionInfo = getSectionFromMatching(sections,fileText,this.source);
    }
    if (!sectionInfo) {
      throw new Error( "No section information found for the task. This might be due to virtual rendering or nested codeBlock environments.")
    }
    this.sectionInfo = sectionInfo;
    if (sectionInfo.source&& sectionInfo.source !== this.source) {
      this.setSource(sectionInfo.source);
    }
  }
}

export class ProcessableLatexTask extends LatexTask {
  name?: string;
  processed: boolean = false;
  processingTime: number = 0;
  ast: LatexAbstractSyntaxTree | null = null;
  sectionInfo: TaskSectionInformation;
  astSource: string | null = null;
  constructor(plugin: Moshe, source: string, el: HTMLElement ) {
    super(plugin, source, el);
  }
  static create(plugin: Moshe, source: string, el: HTMLElement, sourcePath: string, info: TaskSectionInformation): ProcessableLatexTask {
    return super.baseCreate(plugin,true, source, el, sourcePath, info) as ProcessableLatexTask;
  }
  /**
   * returns the source code of the task. 
   * @param fromAst - if true, returns the source from the AST, otherwise returns the original source. defaults to true.
   * @returns 
   */
  getSource(fromAst: boolean = true): string {
    if (!fromAst) return this.source;
    if (!this.ast) throw new Error("AST is not set for this task.");
    if (!this.astSource) this.astSource = this.ast.toString();
    return this.astSource;
  }
  /**
   * Logs the task information to the console.
   * (for debugging purposes rm later)
   */
  log() {
    console.log(`[TIMER] Total processing time: ${this.processingTime.toFixed(2)} ms`);
    console.log("ast", this.ast?.clone());
    console.log("task", this);
  }
  async process() {
    const processor = await LatexTaskProcessor.processTask(this.plugin, this);
    console.log("finished processing task", processor);
    return processor;
  }
}
/**
 * Attempts to extract the name of a LaTeX code block from the first line of the given text.
 * @param text - The full text of the code block
 * @returns The extracted name if matched, otherwise undefined
 */
function extractCodeBlockName(text: string): string | undefined {
  const nameMatch = text.split("\n")[0]
    .replace(latexCodeBlockNamesRegex, "")
    .trim()
    .match(/name: *([\w-]+)/); // Match names with letters, numbers, underscores, and dashes
  return nameMatch ? nameMatch[1] : undefined;
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
  /**
   * 
   * @param file 
   * @param remainingPath 
   * @returns 
   */
  private async getFileContent(file: TFile, remainingPath?: string): Promise<string|void> {
    const fileContent = await this.plugin.app.vault.read(file);
    if (!remainingPath) return fileContent;
    if (!this.task.name) { 
      this.setError("Task name is not set. Cannot extract code block content."); return;};
    if (remainingPath === this.task.name) {
      this.setError("Cannot reference the code block name directly (a code block cannot input itself). Use a different name or path.");
      return;
    }
    const sections = await getFileSections(file, this.plugin.app, true);
    const err = "No code block found with name: " + remainingPath + " in file: " + file.path;
    if (!sections) {this.setError(err); return; };

    const codeBlocks = await getLatexCodeBlocksFromString(fileContent, sections!, true);
    const potentialTargets = codeBlocks.filter((block) => extractCodeBlockName(block.content) === remainingPath);
    
    if (potentialTargets.length === 0) {this.setError(err); return; };
    if (potentialTargets.length > 1) {
      this.setError(`Multiple code blocks found with name: ${remainingPath} in file: ${file.path}`);
      return;
    }
    const target = potentialTargets[0];
    return target.content.split("\n").slice(1, -1).join("\n");
  }
  /**
   * Processes input files in the LaTeX AST, extracting dependencies and
   * normalizing file names.
   * @param ast The LaTeX abstract syntax tree.
   * @param basePath The base path for resolving relative file paths.
   * @returns An array of dependencies found in the input files.
   */
  private async processInputFiles(ast: LatexAbstractSyntaxTree,basePath: string): Promise<VFSLatexDependency[]|void> {
    const usedFiles: VFSLatexDependency[] = [];
    const inputFilesMacros = ast.usdInputFiles()
      .filter((macro) => macro.args && macro.args.length === 1);
    
    for (const macro of inputFilesMacros) {
      const args = macro.args!;
      const filePath = args[0].content.map((node) => node.toString()).join("");
      const dir = findRelativeFile(filePath,this.plugin.app.vault.getAbstractFileByPath(basePath),);
      const name = (dir.remainingPath || dir.file.basename) + ".tex";
      // Replace the macro argument with normalized name
      args[0].content = [new StringClass(name)];

      // Avoid circular includes
      if (this.vfs.hasFile(name)) continue;
      const content = await this.getFileContent(dir.file, dir.remainingPath);
      if (!content) {return;}
      
      const ext = path.extname(name);
      const baseDependency: Partial<VFSLatexDependency> & {
        name: string; extension: string; isTex: boolean;
      } = { name, extension: ext, isTex: isExtensionTex(ext), };

      if (baseDependency.isTex) {
        // Recursively process the content
        const nestedAst = LatexAbstractSyntaxTree.parse(content);
        const processedFiles = await this.processInputFiles(nestedAst, dir.file.path)
        if (!processedFiles) { return; }
        usedFiles.push(...processedFiles);
        baseDependency.ast = nestedAst;
        baseDependency.source = nestedAst.toString();
      } else {
        baseDependency.source = content;
      }
      const { source, name: depName, extension } = baseDependency;
      const dependency = {
        ...createDpendency(source,depName,extension,baseDependency),
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
  }
  /**
   * Processes the LaTeX task source code, parsing it into an AST,
   * extracting dependencies, and preparing the final source code.
   * @returns An object containing the processed source, used files, and AST.
   */
  async processTaskSource() {
    const startTime = performance.now();
    try {
      const ast = this.task.ast = LatexAbstractSyntaxTree.parse(this.task.getSource(false));
      this.nameTaskCodeBlock();
      if (this.plugin.settings.compilerVfsEnabled) {
        const files = await this.processInputFiles(ast, this.task.sourcePath)
        if (!files){return}
        this.dependencies.push(...files);
        this.dependencies.push(...this.addAutoUseFilesToAst(ast));
      }
      ast.verifyProperDocumentStructure();
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
    const file = this.plugin.app.vault.getAbstractFileByPath(this.task.sourcePath);
    if (!file || !(file instanceof TFile)) {
      this.setError("Source path is not a valid file.");
      return;
    }
    const fileText = this.task.sectionInfo.text
    const line = fileText.split("\n")[this.task.sectionInfo.lineStart];
    this.task.name = extractCodeBlockName(line);
  }
  private addAutoUseFilesToAst(ast: LatexAbstractSyntaxTree) {
    const files: VFSLatexDependency[] = [];
    this.vfs.getAutoUseFileNames().forEach((name) => {
      ast.addInputFileToPramble(name);
      const file = this.vfs.getFile(name).content;
      const dependency = {
        ...createDpendency(file, name, path.extname(name), {isTex: true,autoUse: true}),
        inVFS: true,
      };
      files.push(dependency);
      ast.addDependency(file,dependency.name,dependency.extension,dependency);
    });
    return files
  }
  async processTask(): Promise<boolean> {
    await this.processTaskSource();
    if (this.isError){return false;}
    for (const dep of this.dependencies) {
      if (!dep.inVFS) this.vfs.addVirtualFileSystemFile({name: dep.name,content: dep.source});
    }
    return true;
  }

  static async processTask(plugin: Moshe, task: ProcessableLatexTask) {
    const latexTask = LatexTaskProcessor.create(plugin, task);
    await latexTask.processTask();
    return latexTask;
  }
}
