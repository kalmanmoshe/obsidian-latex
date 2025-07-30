import {
  MarkdownPostProcessorContext,
  TFile,
  App,
} from "obsidian";
import { Md5 } from "ts-md5";
import * as temp from "temp";
import { CompileResult, CompileStatus } from "./compiler/base/compilerBase/engine";
import Moshe from "../main";
import { CompilerType } from "src/settings/settings.js";
import async from "async";
import { pdfToHtml, pdfToSVG } from "./pdfToHtml/pdfToHtml";
import parseLatexLog, { createErrorDisplay, errorDiv } from "./logs/HumanReadableLogs";
import { VirtualFileSystem } from "./VirtualFileSystem";
import { getFileSections } from "./resolvers/sectionCache";
import { SvgContextMenu } from "./svgContextMenu";
import { ProcessedLog } from "./logs/latex-log-parser";
import PdfTeXCompiler from "./compiler/swiftlatexpdftex/PdfTeXEngine";
import { LatexTask } from "./utils/latexTask";
import { PdfXeTeXCompiler } from "./compiler/swiftlatexxetex/pdfXeTeXCompiler";
import LatexCompiler from "./compiler/base/compilerBase/compiler";
import CompilerCache from "./cache/compilerCache";
import { dir } from "console";

temp.track();

export enum RenderLoaderClasses {
  ParentContainer = "moshe-latex-render-loader-parent-container",
  Loader = "moshe-latex-render-loader",
  Countdown = "moshe-latex-render-countdown",
}
export const waitFor = async (condFunc: () => boolean) => {
  return new Promise<void>((resolve) => {
    if (condFunc()) {
      resolve();
    } else {
      setTimeout(async () => {
        await waitFor(condFunc);
        resolve();
      }, 100);
    }
  });
};
/**
 * add command to rerender all fils using (\input{}) this file
 * add resove tab indentasins setting
 * The goust bubble happens when I do ctrl z
 * add replac all & replace in selection
 *
 */

export const latexCodeBlockNamesRegex = /(`|~){3,} *(latex|tikz)/;

type InternalTask<T> = {
  data: T;
  callback: Function;
  next: InternalTask<T> | null;
};
type QueueObject<T> = async.QueueObject<T> & {
  _tasks: {
    head: InternalTask<T> | null;
    tail: InternalTask<T> | null;
    length: number;
    remove: (testFn: (node: InternalTask<T>) => boolean) => void;
  };
};

/**
 * add option for Persistent preamble.so it won't get deleted.after use Instead, saved until overwritten
 */
export class SwiftlatexRender {
  plugin: Moshe;
  vfs: VirtualFileSystem = new VirtualFileSystem();
  pdfTexCompiler?: PdfTeXCompiler;
  pdfXetexCompiler?: PdfXeTeXCompiler;
  compiler: LatexCompiler;
  cache: CompilerCache;
  queue: QueueObject<LatexTask>;

  async onload(plugin: Moshe) {
    this.plugin = plugin;
    this.cache = new CompilerCache(this.plugin);
    await this.loadCompiler();
    this.configQueue();
    console.log("SwiftlatexRender loaded");
  }

  switchCompiler(): Promise<void> {
    if (this.compiler === undefined) return this.loadCompiler();
    const isTex =
      this.compiler instanceof PdfTeXCompiler &&
      this.plugin.settings.compiler === CompilerType.TeX;
    const isXeTeX =
      this.compiler instanceof PdfXeTeXCompiler &&
      this.plugin.settings.compiler === CompilerType.XeTeX;
    if (isTex || isXeTeX) return Promise.resolve();
    this.compiler.closeWorker();
    this.compiler = undefined as any;
    this.pdfTexCompiler = undefined;
    this.pdfXetexCompiler = undefined;
    return this.loadCompiler();
  }

  async loadCompiler() {
    if (this.plugin.settings.compiler === CompilerType.TeX) {
      this.compiler = this.pdfTexCompiler = new PdfTeXCompiler();
    } else {
      this.compiler = this.pdfXetexCompiler = new PdfXeTeXCompiler();
    }
    this.vfs.setPdfCompiler(this.compiler);
    await this.compiler.loadEngine();
    await this.cache.loadPackageCache();
    await this.compiler.setTexliveEndpoint(this.plugin.settings.package_url);
  }
  // i have to also cache the files refrenced my the hash and thar loction becose thar can i a file that is Referencing the same files.But because it's in a different directory, those files in actuality are different, leading to a different render. 
  async codeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const isLangTikz = el.classList.contains("block-language-tikz");
    el.classList.remove(...["block-language-tikz", "block-language-latex"]);
    el.classList.add(...["block-language-latexsvg", `overflow-${this.plugin.settings.overflowStrategy}`]);
    const md5Hash = hashLatexContent(source);
    addMenu(this.plugin, el, ctx.sourcePath);

    // PDF file has already been cached
    // Could have a case where pdfCache has the key but the cached file has been deleted
    if (!this.cache.resultFileCache.restoreFromCache(el, md5Hash, ctx.sourcePath)) {
      //Reliable enough for repeated entries
      const createResult = await LatexTask.createAsync(this.plugin, isLangTikz, source, el, ctx)
      if (createResult.isError) {
        const errorMessage = "Error creating task: " + createResult.result;
        this.handleError(el, errorMessage, { hash: md5Hash });
        return;
      }
      const task = createResult.result as LatexTask;
      if (task.restoreFromCache()) return;
      this.addToQueue(task);
    }
  }
  addToQueue(task: LatexTask) {
    const blockId = task.getBlockId();
    this.queue.remove((node) => node.data.getBlockId() === blockId);
    task.el.appendChild(createWaitingCountdown(this.queue.length()));
    this.queue.push(task);
  }

  rebuildQueue() {
    this.abortAllTasks();
    this.configQueue();
  }

  abortAllTasks() {
    abortAllTasks(this.queue);
    this.queue.kill();
    console.log("All tasks aborted.");
  }

  /**
   * Processes and renders the given LaTeX task.
   *
   * @param task The task to process and render.
   * @returns `true` if the task was compiled and rendered; `false` if it was restored from cache or failed during processing.
   */
  async processAndRenderLatexTask(task: LatexTask): Promise<boolean> {
    if (this.cache.resultFileCache.restoreFromCache(task.el, task.rawHash, task.sourcePath)) {
      console.log("fund in catch for", task.getBlockId());
      return false;
    }
    if (task.isProcess()) {
      const processor = await task.process();
      task.log()
      const { el, rawHash: md5Hash } = processor.task;
      if (processor.isError) {
        const errorMessage = "Error processing task: " + processor.err;
        this.handleError(el, errorMessage, { hash: md5Hash, });
        return false
      }
    }
    await this.renderLatexToElement(task.getProcessedContent(), task.el, task.rawHash, task.resolvedHash, task.sourcePath,);
    this.reCheckQueue(); // only re-check the queue after a valide rendering
    return true;
  }
  async detachedProcessAndRender(task: LatexTask) {
    if (task.isProcess()) {
      const processor = await task.process();
      task.log()
      if (processor.isError) {
        return new CompileResult(undefined, CompileStatus.PocessingError, processor.err!);
      }
    }
    try {
      return await this.renderLatexToPDF(task.getProcessedContent(), { strict: true, });
    } catch (err) {
      return new CompileResult(undefined, CompileStatus.CompileError, err as string);
    }
  }

  configQueue() {
    this.queue = async.queue(async (task, done) => {
      const didRender = await this.processAndRenderLatexTask(task);
      updateQueueCountdown(this.queue);
      if (didRender) {
        setTimeout(() => done(), this.plugin.settings.pdfEngineCooldown);
      } else {
        done();
      }
    }, 1) as QueueObject<LatexTask>; // Concurrency is set to 1, so tasks run one at a time
  }

  /**
   * Re-checks the queue to see if any tasks can be removed based on whether their PDF has been restored from cache.
   * If a task's PDF cannot be restored, it is removed from the queue.
   * solves edge case where head is in the processing state.when a similar task is registered to the universal method
   */
  private reCheckQueue() {
    const blockIdsToRemove = new Set<string>();
    let taskNode = this.queue._tasks.head;

    while (taskNode) {
      const task = taskNode.data;
      if (this.cache.resultFileCache.restoreFromCache(task.el, task.rawHash, task.sourcePath)) {
        blockIdsToRemove.add(task.getBlockId());
      }
      taskNode = taskNode.next;
    }
    if (blockIdsToRemove.size === 0) return;
    console.log("Removing tasks from queue:", blockIdsToRemove);
    this.queue._tasks.remove((node) => blockIdsToRemove.has(node.data.getBlockId()));
    console.log("Queue after removal:", this.queue._tasks.length);
  }

  async onunload() {
    this.compiler.closeWorker();
  }

  private handleError(el: HTMLElement, err: string, options: { parseErr?: boolean; hash?: string; throw?: boolean } = {}): void {
    el.innerHTML = "";
    let child: HTMLElement;
    if (options.parseErr) {
      const processedError: ProcessedLog = (options.hash && this.cache.getLog(options.hash)) || parseLatexLog(err);
      console.error("Parsing error:", options.hash, processedError);
      child = createErrorDisplay(processedError);
    } else {
      child = errorDiv({ title: err })
    };
    if (options.hash) child.id = options.hash;
    el.appendChild(child);
    if (options.throw) throw err;
  }

  private async renderLatexToElement(
    source: string,
    el: HTMLElement,
    rawHash: string,
    resolvedHash: string,
    sourcePath: string,
  ): Promise<void> {
    try {
      const result = await this.renderLatexToPDF(source, { md5Hash: rawHash });
      el.innerHTML = "";
      await this.translatePDF(result.pdf, el, rawHash);
      this.cache.resultFileCache.addFile(el.innerHTML, rawHash, resolvedHash, sourcePath);
    } catch (err) {
      this.handleError(el, err as string, { parseErr: true, hash: rawHash });
    } finally {
      await waitFor(() => this.compiler.isReady());
      await this.cache.resultFileCache.cleanUpCache();
    }
  }

  renderLatexToPDF(source: string, config: { strict?: boolean, md5Hash?: string } = {}): Promise<CompileResult> {
    return new Promise((resolve, reject) => {
      temp.mkdir("obsidian-swiftlatex-renderer", async (mkdirErr: any) => {
        if (mkdirErr) {
          reject(mkdirErr);
          return;
        }

        try {
          await waitFor(() => this.compiler.isReady());

          if (this.vfs.getEnabled()) {
            console.log("Rendering LaTeX to PDF", source.split("\n"), this.vfs.clone());
          }

          await this.vfs.loadVirtualFileSystemFiles();
          await this.compiler.writeMemFSFile("main.tex", source);
          await this.compiler.setEngineMainFile("main.tex");
          const result = await this.compiler.compileLaTeX();

          await this.vfs.removeVirtualFileSystemFiles();

          if (config.md5Hash) this.cache.addLog(result.log, config.md5Hash);

          if (result.status !== 0) {
            reject(result.log);
            return;
          }

          if (!config.strict) await this.cache.fetchPackageCacheData();

          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private async translatePDF(pdfData: Buffer<ArrayBufferLike>, el: HTMLElement, hash: string, outputSVG = true,): Promise<void> {
    return new Promise<void>((resolve) => {
      const config = {
        invertColorsInDarkMode: this.plugin.settings.invertColorsInDarkMode,
        sourceHash: hash
      };
      if (outputSVG) pdfToSVG(pdfData, config).then((svg: string) => { el.innerHTML = svg; resolve(); });
      else pdfToHtml(pdfData).then((htmlData) => { el.createEl("object", htmlData); resolve(); });
    });
  }
}

const updateQueueCountdown = (queue: QueueObject<LatexTask>) => {
  let taskNode = queue._tasks.head;
  let index = 0;
  while (taskNode) {
    const task = taskNode.data;
    const countdown = task.el.querySelector(RenderLoaderClasses.Countdown);
    if (countdown) countdown.textContent = index.toString();
    else console.warn(`Countdown not found for task ${index}`);
    taskNode = taskNode.next;
    index++;
  }
};

export function hashLatexContent(content: string) {
  return Md5.hashStr(content.replace(/\s/g, ""));
}



export function addMenu(plugin: Moshe, el: HTMLElement, filePath: string) {
  el.addEventListener("contextmenu", (event) => {
    if (!event.target) return;
    const clickedElement = event.target as HTMLElement;
    const menu = new SvgContextMenu(plugin, clickedElement, filePath);
    menu.open(event);
  });
}

function abortAllTasks(queue: QueueObject<LatexTask>) {
  let head = queue._tasks.head;
  while (head) {
    head.data.el.innerHTML = "";
    head = head.next;
  }
}
export function createWaitingCountdown(index: number) {
  const parentContainer = Object.assign(document.createElement("div"), {
    className: RenderLoaderClasses.ParentContainer,
  });

  const loader = Object.assign(document.createElement("div"), {
    className: RenderLoaderClasses.Loader,
  });

  const countdown = Object.assign(document.createElement("div"), {
    className: RenderLoaderClasses.Countdown,
    textContent: index.toString(),
  });
  parentContainer.appendChild(loader);
  parentContainer.appendChild(countdown);
  return parentContainer;
}