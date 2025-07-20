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
import { getPoseFromEl } from "./resolvers/temp";

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

  codeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    // obsidian dose not attach the el to the DOM yet, so we need to wait for the next frame (witch will hapen ones we are dose with the prosising)
    requestAnimationFrame(() => {
      console.warn(getPoseFromEl(ctx.sourcePath, el));
    });

    return
    const isLangTikz = el.classList.contains("block-language-tikz");
    el.classList.remove(...["block-language-tikz", "block-language-latex"]);
    el.classList.add(...["block-language-latexsvg", `overflow-${this.plugin.settings.overflowStrategy}`]);
    const md5Hash = hashLatexSource(source);
    addMenu(this.plugin, el, ctx.sourcePath);

    // PDF file has already been cached
    // Could have a case where pdfCache has the key but the cached file has been deleted
    if (!this.cache.restoreFromCache(el, md5Hash)) {
      //Reliable enough for repeated entries
      LatexTask.createAsync(this.plugin, isLangTikz, source, el, ctx).then((task) => {
        if (typeof task === "string") {
          const errorMessage = "Error creating task: " + task;
          this.handleError(el, errorMessage, { hash: md5Hash });
          return;
        }
        if (task.restoreFromCache()) return;
        this.addToQueue(task);
      })
    }
  }
  addToQueue(task: LatexTask) {
    const blockId = task.getBlockId();
    console.log("Adding task to queue for block ID:", blockId, task, "Queue length:", this.queue.length());
    this.queue.remove((node) => node.data.getBlockId() === blockId);
    task.el.appendChild(createWaitingCountdown(this.queue.length()));
    this.queue.push(task);
  }

  abortAllTasks() {
    this.queue.kill();
    console.log("All tasks aborted and cache cleared.");
    this.configQueue();
  }
  /**
   * Processes and renders the given LaTeX task.
   *
   * @param task The task to process and render.
   * @returns `true` if the task was compiled and rendered; `false` if it was restored from cache or failed during processing.
   */
  async processAndRenderLatexTask(task: LatexTask): Promise<boolean> {
    if (this.cache.restoreFromCache(task.el, task.md5Hash)) {
      console.log("fund in catch for", task.getBlockId());
      return false;
    }
    if (task.isProcess()) {
      const processor = await task.process();
      task.log()
      const { el, md5Hash } = processor.task;
      if (processor.isError) {
        const errorMessage = "Error processing task: " + processor.err;
        this.handleError(el, errorMessage, { hash: md5Hash, });
        return false
      }
    }
    await this.renderLatexToElement(task.getProcessedContent(), task.el, task.md5Hash, task.sourcePath,);
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
      if (this.cache.restoreFromCache(task.el, task.md5Hash)) {
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
    md5Hash: string,
    sourcePath: string,
  ): Promise<void> {
    try {
      const result = await this.renderLatexToPDF(source, { md5Hash });
      el.innerHTML = "";
      await this.translatePDF(result.pdf, el, md5Hash);
      this.cache.addFile(el.innerHTML, md5Hash, sourcePath);
    } catch (err) {
      this.handleError(el, err as string, { parseErr: true, hash: md5Hash });
    } finally {
      await waitFor(() => this.compiler.isReady());
      await this.cache.afterRenderCleanUp();
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

export function hashLatexSource(source: string) {
  return Md5.hashStr(source.replace(/\s/g, ""));
}

export async function getFileSectionsFromPath(path: string) {
  const file = app.vault.getAbstractFileByPath(path) as TFile;
  //we cant use the file cache
  const sections = await getFileSections(file, true);
  if (!sections) throw new Error("No sections found in metadata");
  return { file, sections };
}

export function addMenu(plugin: Moshe, el: HTMLElement, filePath: string) {
  el.addEventListener("contextmenu", (event) => {
    if (!event.target) return;
    const clickedElement = event.target as HTMLElement;
    const menu = new SvgContextMenu(plugin, clickedElement, filePath);
    menu.open(event);
  });
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