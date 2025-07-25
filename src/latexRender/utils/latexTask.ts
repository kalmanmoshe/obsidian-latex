import Moshe from "src/main";
import { getFileSectionsFromPath, hashLatexSource, } from "../swiftlatexRender";
import { VirtualFileSystem } from "../VirtualFileSystem";
import { MarkdownPostProcessorContext, MarkdownSectionInformation, MarkdownView, TFile } from "obsidian";
import { getFileSections } from "../resolvers/sectionCache";
import {
  extractCodeBlockMetadata,
  extractCodeBlockName,
  findRelativeFile,
} from "../resolvers/latexSourceFromFile";
import {
  createDpendency,
  isExtensionTex,
  LatexAbstractSyntaxTree,
  LatexDependency,
} from "../parse/parse";
import { String as StringClass } from "../parse/typs/ast-types-post";
import path from "path";
import { getSectionFromMatching } from "../resolvers/findSection";
import { getLatexTaskSectionInfosFromString, sectionToTaskSectionInfo, TaskSectionInformation } from "../resolvers/taskSectionInformation";
import { TransactionLogger } from "../cache/transactionLogger";
/**
 * Be careful of catching this as the file may change and until you don't generate a new one it will be static.
 */

/*interface TaskSectionInformation extends MarkdownSectionInformation{
  /**
   * The file text where the task (source) is located. (i checked this and this is correct)
   */
//text: string;
/*}*/


/**nameing conventions:
 * - Task: a general task that can be processed or not.
 * text - The full text of a file
 * codeBlock - The source code of a codeBlock including the code block delimiters.
 * content - The content of the code block without the delimiters.
 */
type InputFile = {
  name: string;
  content: string;
  dependencies: InputFile[];
};

type VFSLatexDependency = LatexDependency & { inVFS: boolean };


export function createTask(plugin: Moshe, process: boolean, content: string, el: HTMLElement): LatexTask | ProcessableLatexTask {
  return process
    ? new ProcessableLatexTask(plugin, content, el)
    : new LatexTask(plugin, content, el);
}
export class BaseTask {
  plugin: Moshe;
  content: string;
  sourcePath: string;
  md5Hash: string;
}
export class LatexTask {
  plugin: Moshe;
  protected content: string;
  sourcePath: string;
  md5Hash: string;
  protected blockId: string;
  el: HTMLElement;
  protected sectionInfo?: TaskSectionInformation;
  protected onCompiled?: (task: LatexTask) => void;

  constructor(plugin: Moshe, source: string, el: HTMLElement) {
    this.plugin = plugin;
    this.setSource(source);
    this.el = el;
  }
  set onCompiledCallback(callback: (task: LatexTask) => void) {
    this.onCompiled = callback;
  }
  static baseCreate(plugin: Moshe, process: boolean, source: string, el: HTMLElement, sourcePath: string, sectionInfo: TaskSectionInformation): LatexTask {
    const task = createTask(plugin, process, source, el);
    task.sourcePath = sourcePath;
    task.setSectionInfo(sectionInfo);
    return task;
  }
  /**
   * this method creates a LatexTask from a section information object. it creates a temp div element to hold the task.
   * @param plugin 
   * @param path 
   * @param sectionInfo 
   * @returns 
   */
  static fromSectionInfo(plugin: Moshe, path: string, sectionInfo: TaskSectionInformation): LatexTask {
    const content = sectionInfo.codeBlock.split("\n").slice(1, -1).join("\n");
    const metadata = extractCodeBlockMetadata(sectionInfo.codeBlock);
    const isProcess = metadata.language === "tikz";
    return LatexTask.baseCreate(plugin, isProcess, content, document.createElement("div"), path, sectionInfo);
  }
  static create(plugin: Moshe, source: string, el: HTMLElement, sourcePath: string, sectionInfo: TaskSectionInformation): LatexTask {
    return this.baseCreate(plugin, false, source, el, sourcePath, sectionInfo);
  }
  static async createAsync(plugin: Moshe, process: boolean, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const task = createTask(plugin, process, source, el);
    task.sourcePath = ctx.sourcePath;
    try {
      await task.ensureSectionInfo(ctx);
    } catch (err) {
      return err as string;
    }
    return task;
  }
  isProcess(): this is ProcessableLatexTask { return this instanceof ProcessableLatexTask; }
  getCacheStatus() {
    return this.plugin.swiftlatexRender.cache.cacheStatusForHash(this.md5Hash);
  }
  getCacheStatusAsNum() {
    return this.plugin.swiftlatexRender.cache.cacheStatusForHashAsNum(this.md5Hash);
  }
  restoreFromCache() {
    return this.plugin.swiftlatexRender.cache.restoreFromCache(this.el, this.md5Hash);
  }
  setSource(source: string) {
    this.content = source;
    this.md5Hash = hashLatexSource(source);
  }
  getContent() { return this.content; }
  getProcessedContent() { return this.getContent(); }
  setSectionInfo(info: TaskSectionInformation | MarkdownSectionInformation) {
    if ("text" in info) { // if it's a MarkdownSectionInformation
      info = sectionToTaskSectionInfo(info);
    }
    this.sectionInfo = info;
    this.blockId = `${this.sourcePath.replace(/ /g, "_")}_${this.sectionInfo.lineStart}`
  }
  getBlockId() {
    if (!this.blockId) {
      throw new Error("Block ID is not set. Call setSectionInfo first.");
    }
    return this.blockId
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
    if (sectionFromContext) { this.setSectionInfo(sectionFromContext); return; };

    const { file, sections } = await getFileSectionsFromPath(ctx.sourcePath);
    const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const fileText = editor?.getValue() ?? (await app.vault.cachedRead(file));
    // i want to move the logger to the plugin thats why i have the err for now, as a reminder
    let sectionInfo: (MarkdownSectionInformation & { source?: string }) | undefined = getSectionFromTransaction(sections, fileText, this.plugin.logger, editor);
    if (!sectionInfo) {
      sectionInfo = getSectionFromMatching(sections, fileText, this.content);
    }
    if (!sectionInfo) {
      throw new Error("No section information found for the task. This might be due to virtual rendering or nested codeBlock environments.")
    }
    this.setSectionInfo(sectionInfo);
    if (sectionInfo.source && sectionInfo.source !== this.content) {
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
  constructor(plugin: Moshe, source: string, el: HTMLElement) {
    super(plugin, source, el);
  }
  static create(plugin: Moshe, source: string, el: HTMLElement, sourcePath: string, info: TaskSectionInformation): ProcessableLatexTask {
    return super.baseCreate(plugin, true, source, el, sourcePath, info) as ProcessableLatexTask;
  }
  /**
   * returns the source code of the task. 
   * @param fromAst - if true, returns the source from the AST, otherwise returns the original source. defaults to true.
   * @returns 
   */
  getContent(): string {
    return this.content;
  }
  getProcessedContent(): string {
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
  private isNameConflict(name: string): boolean {
    if (this.task.name !== undefined && name === this.task.name) {
      return true;
    }
    return false
  }
  /**
   * 
   * @param file 
   * @param remainingPath 
   * @returns 
   */
  private async getFileContent(file: TFile, remainingPath?: string): Promise<string | void> {
    const fileText = await app.vault.read(file);
    if (!remainingPath) return fileText;
    if (this.isNameConflict(remainingPath)) {
      this.setError("Cannot reference the code block name directly (a code block cannot input itself). Use a different name or path.");
      return;
    }
    const sections = await getFileSections(file, true);
    const err = "No code block found with name: " + remainingPath + " in file: " + file.path;;
    if (!sections) { this.setError(err); return; };
    //error it returns 3 times the same code block
    const codeBlocks = await getLatexTaskSectionInfosFromString(fileText, sections!);
    const potentialTargets = codeBlocks.filter((block) => extractCodeBlockName(block.codeBlock) === remainingPath);
    const target = potentialTargets.shift();
    if (!target) { this.setError(err); return; };
    if (potentialTargets.length > 0) {
      this.setError(`Multiple code blocks found with name: ${remainingPath} in file: ${file.path}`);
      return;
    }
    return target.codeBlock.split("\n").slice(1, -1).join("\n");
  }
  /**
   * Processes input files in the LaTeX AST, extracting dependencies and
   * normalizing file names.
   * @param ast The LaTeX abstract syntax tree.
   * @param basePath The base path for resolving relative file paths.
   * @returns An array of dependencies found in the input files.
   */
  private async processInputFiles(ast: LatexAbstractSyntaxTree, basePath: string): Promise<VFSLatexDependency[] | void> {
    const usedFiles: VFSLatexDependency[] = [];
    const inputFilesMacros = ast.usdInputFiles()
      .filter((macro) => macro.args && macro.args.length === 1);
    for (const macro of inputFilesMacros) {
      const args = macro.args!;
      const filePath = args[0].content.map((node) => node.toString()).join("").trim();
      const dir = findRelativeFile(filePath, app.vault.getAbstractFileByPath(basePath),);
      const name = (dir.remainingPath || dir.file.basename) + ".tex";
      // Replace the macro argument with normalized name
      args[0].content = [new StringClass(name)];

      // Avoid circular includes
      if (this.vfs.hasFile(name)) continue;
      const content = await this.getFileContent(dir.file, dir.remainingPath);
      if (!content) { return; }

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
        ...createDpendency(source, depName, extension, baseDependency),
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
      const ast = this.task.ast = LatexAbstractSyntaxTree.parse(this.task.getContent());
      this.nameTaskCodeBlock();
      if (this.plugin.settings.compilerVfsEnabled) {
        const files = await this.processInputFiles(ast, this.task.sourcePath)
        if (!files) { return }
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
    const file = app.vault.getAbstractFileByPath(this.task.sourcePath);
    if (!file || !(file instanceof TFile)) {
      this.setError("Source path is not a valid file.");
      return;
    }
    const line = this.task.sectionInfo.codeBlock.split("\n")[0];
    this.task.name = extractCodeBlockName(line);
  }
  private addAutoUseFilesToAst(ast: LatexAbstractSyntaxTree) {
    const files: VFSLatexDependency[] = [];
    this.vfs.getAutoUseFileNames().forEach((name) => {
      ast.addInputFileToPramble(name);
      const file = this.vfs.getFile(name).content;
      const dependency = {
        ...createDpendency(file, name, path.extname(name), { isTex: true, autoUse: true }),
        inVFS: true,
      };
      files.push(dependency);
      ast.addDependency(file, dependency.name, dependency.extension, dependency);
    });
    return files
  }
  async processTask(): Promise<boolean> {
    await this.processTaskSource();
    if (this.isError) { return false; }
    for (const dep of this.dependencies) {
      if (!dep.inVFS) this.vfs.addVirtualFileSystemFile({ name: dep.name, content: dep.source });
    }
    return true;
  }

  static async processTask(plugin: Moshe, task: ProcessableLatexTask) {
    const latexTask = LatexTaskProcessor.create(plugin, task);
    await latexTask.processTask();
    return latexTask;
  }
}
function getSectionFromTransaction(sections: import("obsidian").SectionCache[], fileText: string, logger: TransactionLogger, editor: import("obsidian").Editor | undefined): (MarkdownSectionInformation & { source?: string; }) | undefined {
  throw new Error("Function not implemented.");
}

