import Moshe from "src/main";
import { VirtualFileSystem } from "../VirtualFileSystem";
import { MarkdownPostProcessorContext, MarkdownSectionInformation, MarkdownView, TFile } from "obsidian";
import { getFileSections, getFileSectionsFromPath } from "../resolvers/sectionCache";
import { extractCodeBlockMetadata, extractCodeBlockName } from "../resolvers/latexSourceFromFile";
import {
  createDpendency,
  isExtensionTex,
  LatexAbstractSyntaxTree,
  LatexDependency,
} from "../../ast/parse";
import { String as StringClass } from "../../ast/typs/ast-types-post";
import path from "path";
import { getSectionsFromMatching } from "../resolvers/findSection";
import { TaskSectionInformation } from "../resolvers/taskSectionInformation";
import { codeBlockToContent, sectionToTaskSectionInfo } from "../resolvers/sectionUtils";
import { hashLatexContent } from "../cache/resultFileCache";
import { CODE_BLOCK_NAME_SEPARATOR, extractBasenameAndExtension, findRelativeFile, getFileContent, isValidFileBasename, resolvePathRelToVault } from "../resolvers/paths";
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
interface VFSLatexBaseDependency extends LatexDependency {
  basename: string;
  extension: string;
  isTex: boolean;
}

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
  rawHash: string;
  resolvedHash: string
  protected blockId: string;
  el: HTMLElement;
  protected sectionInfos?: TaskSectionInformation[];
  protected onCompiled?: (task: LatexTask) => void;
  private error: string;

  constructor(plugin: Moshe, source: string, el: HTMLElement) {
    this.plugin = plugin;
    this.setSource(source);
    this.el = el;
  }
  set onCompiledCallback(callback: (task: LatexTask) => void) {
    this.onCompiled = callback;
  }
  isError() {
    return !!this.error;
  }
  static baseCreate(plugin: Moshe, process: boolean, content: string, el: HTMLElement, sourcePath: string, sectionInfo: TaskSectionInformation | TaskSectionInformation[]): LatexTask {
    const task = createTask(plugin, process, content, el);
    task.sourcePath = sourcePath;
    const sectionInfos = Array.isArray(sectionInfo) ? sectionInfo : [sectionInfo];
    task.setSectionInfos(sectionInfos);
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
    const content = codeBlockToContent(sectionInfo.codeBlock);
    const metadata = extractCodeBlockMetadata(sectionInfo.codeBlock);
    const isProcess = metadata.language === "tikz";
    return LatexTask.baseCreate(plugin, isProcess, content, document.createElement("div"), path, sectionInfo);
  }
  static fromSectionInfos(plugin: Moshe, path: string, sectionInfos: TaskSectionInformation[]): LatexTask {
    if (sectionInfos.length === 0) {
      throw new Error("No section information provided for creating a task.");
    }
    const contents = sectionInfos.map(sec => codeBlockToContent(sec.codeBlock));
    if (!contents.every(c => c === contents[0])) {
      throw new Error("All section contents must be the same for creating a task from multiple sections.");
    }
    const content = contents[0];
    const metadatas = sectionInfos.map(sec => extractCodeBlockMetadata(sec.codeBlock));
    if (!metadatas.every(meta => meta.language === metadatas[0].language)) {
      throw new Error("All section metadata languages must be the same for creating a task from multiple sections.");
    }
    const isProcess = metadatas[0].language === "tikz";
    return LatexTask.baseCreate(plugin, isProcess, content, document.createElement("div"), path, sectionInfos);
  }
  static create(plugin: Moshe, content: string, el: HTMLElement, sourcePath: string, sectionInfo: TaskSectionInformation): LatexTask {
    return this.baseCreate(plugin, false, content, el, sourcePath, sectionInfo);
  }
  static async createAsync(plugin: Moshe, process: boolean, content: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const task = createTask(plugin, process, content, el);
    task.sourcePath = ctx.sourcePath;
    try {
      await task.ensureSectionInfo(ctx);
    } catch (err) {
      console.error("Error while ensuring section info for task:", err);
      return { isError: true, result: err };
    }
    return { isError: false, result: task }
  }
  isProcess(): this is ProcessableLatexTask { return this instanceof ProcessableLatexTask; }
  getCacheStatus() {
    return this.plugin.swiftlatexRender.cache.cacheStatusForHash(this.rawHash);
  }
  getCacheStatusAsNum() {
    return this.plugin.swiftlatexRender.cache.cacheStatusForHashAsNum(this.rawHash);
  }
  restoreFromCache() {
    return this.plugin.swiftlatexRender.cache.resultFileCache.restoreFromCache(this.el, this.rawHash, this.sourcePath);
  }
  setSource(source: string) {
    this.content = source;
    this.rawHash = hashLatexContent(source);
    if (!this.resolvedHash) {
      this.resolvedHash = this.rawHash;
    }
  }
  getContent() { return this.content; }
  getProcessedContent() { return this.getContent(); }
  setSectionInfos(infos: (TaskSectionInformation | MarkdownSectionInformation)[]) {
    for (const info of infos) {
      const taskInfo = "text" in info ? sectionToTaskSectionInfo(info) : info;
      this.sectionInfos ??= [];
      this.sectionInfos.push(taskInfo as TaskSectionInformation);
    }

    this.sectionInfos!.sort((a, b) => a.lineStart - b.lineStart);

    const numberKey = this.sectionInfos!.map(sec => sec.lineStart).join("|");
    this.blockId = this.sourcePath.replace(/ /g, "_") + "||" + numberKey;
  }
  getBlockId() {
    if (!this.blockId) {
      throw new Error("Block ID is not set. Call setSectionInfo first.");
    }
    return this.blockId
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
    if (sectionFromContext) { this.setSectionInfos([sectionFromContext]); return; };
    const { file, sections } = await getFileSectionsFromPath(ctx.sourcePath);
    const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const fileText = editor?.getValue() ?? (await app.vault.cachedRead(file));
    // i want to move the logger to the plugin thats why i have the err for now, as a reminder
    let sectionInfos = getSectionsFromMatching(sections, fileText, this.content);

    if (!sectionInfos) {
      console.warn(sectionInfos, sections, fileText.split("\n"), this.content.split("\n"));
      throw new Error("No section information found for the task. This might be due to virtual rendering or nested codeBlock environments.")
    }

    this.setSectionInfos(sectionInfos);
    const sectionInfosContent = this.sectionInfos?.map(sec => codeBlockToContent(sec.codeBlock)) || [];
    if (sectionInfosContent.some(secContent => secContent !== this.content)) {
      throw new Error("Section information does not match the task content. This might be due to virtual rendering or nested codeBlock environments.");
    }
  }
  getDependencyPaths(): string[] {
    return []
  }
}
//Create a block ID that is generated from all possible solutions. 

export class ProcessableLatexTask extends LatexTask {
  /**
   * Because we can't guarantee one section information per task, there may be situations where there are multiple. we don't have enough information to prefer one over the other, so we must consider them all.
   */
  possibleNames?: string[];
  processed: boolean = false;
  processingTime: number = 0;
  private ast: LatexAbstractSyntaxTree | null = null;
  sectionInfos: TaskSectionInformation[];
  private astContent: string | null = null;
  constructor(plugin: Moshe, content: string, el: HTMLElement) {
    super(plugin, content, el);
  }
  static create(plugin: Moshe, content: string, el: HTMLElement, sourcePath: string, info: TaskSectionInformation): ProcessableLatexTask {
    return super.baseCreate(plugin, true, content, el, sourcePath, info) as ProcessableLatexTask;
  }

  getProcessedContent(): string {
    if (!this.ast || !this.astContent) throw new Error("AST is not set for this task.");
    return this.astContent;
  }
  getDependencyPaths(): string[] {
    if (!this.ast) throw new Error("AST is not set for this task.");
    const dependencies = [...this.ast.dependencies.values()].filter((dep) => !dep.autoUse);

    const paths = dependencies.map((dep) => dep.path);
    if (!paths) throw new Error("No dependencies found for this task.");
    if (paths.length !== new Set(paths).size) {
      throw new Error("Duplicate dependency paths found: " + paths);
    }
    return paths;
  }

  setAst(ast: LatexAbstractSyntaxTree) {
    this.ast = ast;
    this.astContent = ast.toString();
    this.resolvedHash = hashLatexContent(this.astContent);
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
  private isNameConflict(basename: string): boolean {
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
    console.log("Resolved dependency:", dependency,basename, extension);
    return dependency;
  }

  /**
   * Processes input files in the LaTeX AST, extracting dependencies and
   * normalizing file names.
   * @param ast The LaTeX abstract syntax tree.
   * @param basePath The base path for resolving relative file paths.
   * @returns An array of dependencies found in the input files.
   */
  private async processInputFiles(ast: LatexAbstractSyntaxTree, basePath: string): Promise<VFSLatexDependency[]| undefined> {
    const usedFiles: VFSLatexDependency[] = [];
    const inputFilesMacros = ast.usdInputFiles()
      .filter((macro) => macro.args && macro.args.length === 1);
    for (const macro of inputFilesMacros) {
      const args = macro.args!;
      const filePath = args[0].content.map((node) => node.toString()).join("").trim();
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
      if (!dep.inVFS) this.vfs.addVirtualFileSystemFile({ name: dep.basename +"."+ dep.extension, content: dep.content });
    }
    return true;
  }

  static async processTask(plugin: Moshe, task: ProcessableLatexTask) {
    const latexTask = LatexTaskProcessor.create(plugin, task);
    await latexTask.processTask();
    return latexTask;
  }
}
