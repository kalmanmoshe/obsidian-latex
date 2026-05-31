import { MarkdownPostProcessorContext } from 'obsidian';
import * as temp from 'temp';
import {
  CompileResult,
  CompileStatus,
  EngineStatus,
} from './compiler/base/compilerBase/engine';
import LatexRender from '../main';
import { CompilerType } from 'src/settings/settings.js';
import async from 'async';
import { pdfToHtml, pdfToOptimizedSVG, pdfToSVG } from './pdfToHtml/pdfToHtml';
import parseLatexLog, {
  createErrorDisplay,
  errorDiv,
} from './logs/HumanReadableLogs';
import { VFSstatus, VirtualFileSystem } from './VirtualFileSystem';
import { ProcessedLog } from './logs/latex-log-parser';
import PdfTeXCompiler from './compiler/swiftlatexpdftex/PdfTeXCompiler';
import { LatexTask } from './task/latexTask';
import { PdfXeTeXCompiler } from './compiler/swiftlatexxetex/pdfXeTeXCompiler';
import LatexCompiler from './compiler/base/compilerBase/compiler';
import CompilerCache from './cache/compilerCache';
import { hashLatexContent } from './cache/resultFileCache';
import { SVG_ID_KEY } from 'src/svg/nodes';
import { LatexRenderQueue } from './LatexRenderQueue';

temp.track();

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

export const latexCodeBlockNamesRegex = /(`|~){3,} *(latex|tikz)/;


type HandleErrorOptions = {
  /**
   * If true, the error will be parsed and displayed as a log.
   */
  parseErr?: boolean;
  /**
   * If true, the error will be thrown after handling.
   */
  throw?: boolean;
};

/**
 * add command to rerender all fils using (\input{}) this file
 * add resove tab indentasins setting
 * The goust bubble happens when I do ctrl z
 * add replac all & replace in selection
 *
 */
/**
 * add option for Persistent preamble.so it won't get deleted.after use Instead, saved until overwritten
 */
export class SwiftlatexRender {
  plugin: LatexRender;
  vfs: VirtualFileSystem = new VirtualFileSystem();
  pdfTexCompiler?: PdfTeXCompiler;
  pdfXetexCompiler?: PdfXeTeXCompiler;
  compiler: LatexCompiler;
  cache: CompilerCache;
  queue: LatexRenderQueue;

  async onload(plugin: LatexRender) {
    this.plugin = plugin;
    this.cache = new CompilerCache(this.plugin);
    await this.loadCompiler();

    this.queue = new LatexRenderQueue({
      renderTask: this.processAndRenderLatexTask.bind(this),
      getCooldown: () => this.plugin.settings.pdfEngineCooldown,
    });

    console.log('SwiftlatexRender loaded');
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
    this.compiler.closeWorkers();
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
    await this.compiler.loadEngines();
    await this.cache.loadPackageCache();
    await this.compiler.setTexliveEndpoint(
      this.plugin.settings.package_url,
    );
  }

  async restartCompiler() {
    this.compiler.closeWorkers();
    this.queue.abortAllWaiting();
    await this.loadCompiler();
  }

  async testCodeBlockProcessor(
    source: string,
    el: HTMLElement,
  ) {
    el.empty();
    el.addClass('swiftlatex-queue-debug');

    const title = el.createEl('h4', {
      text: 'SwiftLaTeX Queue Debug',
    });

    const status = el.createDiv({
      cls: 'swiftlatex-queue-debug-status',
    });

    const list = el.createEl('ol', {
      cls: 'swiftlatex-queue-debug-list',
    });

    const compilerStatus = el.createEl('ol', {
      cls: 'swiftlatex-queue-debug-compiler-status',
    });

    const renderState = () => {

      status.empty();
      list.empty();
      compilerStatus.empty();

      const snapshot = this.queue.getSnapshot();
      status.createEl('div', {
        text: `Current task: ${snapshot.currentTask ? (snapshot.currentTask.getBlockId() + "||" + snapshot.currentTask.uuid) :
          'No Information'
          }`,
      });

      status.createEl('div', {
        text: `Queue length: ${snapshot.length}`,
      });

      status.createEl('div', {
        text: `Running: ${snapshot.running}`,
      });

      status.createEl('div', {
        text: `Idle: ${snapshot.idle}`,
      });

      const waitingTasks = snapshot.waiting;

      if (waitingTasks.length === 0) {
        list.createEl('li', {
          text: 'No waiting tasks',
        });
      } else {
        waitingTasks.forEach((task, index) => {
          list.createEl('li', {
            text: `#${index} — ${task ? (task.getBlockId() + "||" + task.uuid) :
              'No Information'}`,
          });
        });
      }

      const enginesStatus = this.compiler.getEnginesStatus();
      enginesStatus.forEach((engineStatus) => {
        compilerStatus.createEl('div', {
          text: `Engine ${engineStatus.name}: ${EngineStatus[engineStatus.status]}`,
        });
      });
    };

    renderState();

    const interval = window.setInterval(renderState, 250);

    el.createEl('button', {
      text: 'Stop live queue debug',
    }).onclick = () => {
      window.clearInterval(interval);
    };
  }

  async testVfsCodeBlockProcessor(
    source: string,
    el: HTMLElement,
  ) {
    el.empty();
    el.addClass('swiftlatex-vfs-debug');

    el.createEl('h4', {
      text: 'SwiftLaTeX VFS Debug',
    });

    const status = el.createDiv({
      cls: 'swiftlatex-vfs-debug-status',
    });

    const fileList = el.createEl('ol', {
      cls: 'swiftlatex-vfs-debug-file-list',
    });

    const autoUseList = el.createEl('ol', {
      cls: 'swiftlatex-vfs-debug-auto-use-list',
    });

    const renderState = () => {
      status.empty();
      fileList.empty();
      autoUseList.empty();

      const snapshot = this.vfs.getSnapshot();

      status.createEl('div', {
        text: `Enabled: ${snapshot.enabled}`,
      });

      status.createEl('div', {
        text: `Auto-use enabled: ${snapshot.autoUseEnabled}`,
      });

      status.createEl('div', {
        text: `Status: ${VFSstatus[snapshot.status]}`,
      });

      status.createEl('div', {
        text: `File count: ${snapshot.fileCount}`,
      });

      if (snapshot.files.length === 0) {
        fileList.createEl('li', {
          text: 'No virtual files',
        });
      } else {
        snapshot.files.forEach((file, index) => {
          fileList.createEl('li', {
            text: `#${index} — ${file.path} | autoUse: ${file.autoUse} | length: ${file.contentLength}`,
          });
        });
      }

      if (snapshot.autoUseFiles.length === 0) {
        autoUseList.createEl('li', {
          text: 'No auto-use files',
        });
      } else {
        snapshot.autoUseFiles.forEach((name, index) => {
          autoUseList.createEl('li', {
            text: `#${index} — ${name}`,
          });
        });
      }
    };

    renderState();

    const interval = window.setInterval(renderState, 250);

    el.createEl('button', {
      text: 'Stop live VFS debug',
    }).onclick = () => {
      window.clearInterval(interval);
    };
  }

  // i have to also cache the files refrenced my the hash and thar loction becose thar can i a file that is Referencing the same files.But because it's in a different directory, those files in actuality are different, leading to a different render.
  async codeBlockProcessor(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ) {
    const isLangTikz = el.classList.contains('block-language-tikz');
    el.classList.remove(...['block-language-tikz', 'block-language-latex']);
    el.classList.add(
      ...[
        'block-language-latexsvg',
        `overflow-${this.plugin.settings.overflowStrategy}`,
      ],
    );
    const md5Hash = hashLatexContent(source);

    // PDF file has already been cached
    // Could have a case where pdfCache has the key but the cached file has been deleted
    if (
      !this.cache.resultFileCache.restoreFromCache(
        el,
        md5Hash,
        ctx.sourcePath,
      )
    ) {
      //Reliable enough for repeated entries
      const createResult = await LatexTask.createAsync(
        this.plugin,
        isLangTikz,
        source,
        el,
        ctx,
      );
      if (createResult.isError) {
        const errorMessage =
          'Error creating task: ' + createResult.result;
        this.handleError(
          el,
          errorMessage,
          this.cache.resultFileCache.getFileBaseName(md5Hash, []),
          ctx.sourcePath,
        );
        return;
      }
      const task = createResult.result as LatexTask;
      console.log('Registering task:', task.getDebugInfo());
      if (task.restoreFromCache()) return;
      console.log('Adding task to queue:', task.getDebugInfo());
      this.queue.push(task);
    }
  }

  /**
   * Processes and renders the given LaTeX task.
   *
   * @param task The task to process and render.
   * @returns `true` if the task was compiled and rendered; `false` if it was restored from cache or failed during processing.
   */
  async processAndRenderLatexTask(task: LatexTask): Promise<boolean> {
    if (
      this.cache.resultFileCache.restoreFromCache(
        task.el,
        task.rawHash,
        task.sourcePath,
      )
    ) {
      console.log('Found in catch for', task.getBlockId());
      return false;
    }

    if (
      task.hasSourceChangeTimeExceededMargin() &&
      !(await task.verifySource())
    ) {
      const errorMessage =
        'Error processing task: ' +
        'Source files have changed and could not be resolved.';
      this.handleErrorForTask(task, errorMessage);
      return false; // If the source change time exceeds the margin and the source could not be resolved, skip processing.
    }

    if (task.isProcess()) {
      const processor = await task.process();
      task.log();
      if (processor.isError) {
        const errorMessage = 'Error processing task: ' + processor.err;
        this.handleErrorForTask(task, errorMessage);
        return false;
      }
    }
    console.log('Processing and rendering task:', task.getDebugInfo());
    await this.renderLatexToElement(task);
    this.reCheckQueue(); // only re-check the queue after a valide rendering
    return true;
  }

  async detachedProcessAndRender(task: LatexTask) {
    if (task.isProcess()) {
      const processor = await task.process();
      task.log();
      if (processor.isError) {
        return new CompileResult(
          undefined,
          CompileStatus.ProcessingError,
          processor.err!,
        );
      }
    }
    try {
      return await this.renderLatexToPDF(task.getProcessedContent(), {
        strict: true,
      });
    } catch (err) {
      return new CompileResult(
        undefined,
        CompileStatus.CompileError,
        toErrorString(err),
      );
    }
  }

  async detachedProcessAndRenderToResultFile(task: LatexTask) {
    const compileResult = await this.detachedProcessAndRender(task);
    if (compileResult.status === CompileStatus.CompileError) {
      return;
    }
    const resultFile = pdfToSVG(compileResult.pdf);
    return resultFile;
  }

  /**
   * Re-checks the queue to see if any tasks can be removed based on whether their PDF has been restored from cache.
   * If a task's PDF cannot be restored, it is removed from the queue.
   * Solves edge case where head is in the processing state when a similar task is registered to the universal method
   */
  private reCheckQueue() {
    const blockIdsToRemove = new Set<string>();
    const waitingTasks = this.queue.getWaitingTasks();

    waitingTasks.forEach((task) => {

      if (
        this.cache.resultFileCache.restoreFromCache(
          task.el,
          task.rawHash,
          task.sourcePath,
        )
      ) {
        blockIdsToRemove.add(task.getBlockId());
      }

    });

    if (blockIdsToRemove.size === 0) return;

    console.log('Removing tasks from queue:', blockIdsToRemove);
    this.queue.removeFromWaiting((task) => blockIdsToRemove.has(task.getBlockId()));
    console.log('Queue after removal:', this.queue.length());
  }

  async onunload() {
    this.compiler.closeWorkers();
  }

  private handleErrorForTask(
    task: LatexTask,
    err: string,
    options: HandleErrorOptions = {},
  ): void {
    const el = task.el;
    const basename = task.getBaseName();
    const path = task.sourcePath;
    this.handleError(el, err, basename, path, options);
  }

  private handleError(
    el: HTMLElement,
    err: string,
    hash: string,
    path: string,
    options: HandleErrorOptions = {},
  ): void {
    el.innerHTML = '';
    let child: HTMLElement;
    if (options.parseErr) {
      const processedError: ProcessedLog = this.cache.getLog(hash) || parseLatexLog(err);
      child = createErrorDisplay(processedError);
    } else {
      child = errorDiv({ title: err });
    }
    child.setAttribute(SVG_ID_KEY, hash);
    el.appendChild(child);
    addMenu(this.plugin, el, path);
    if (options.throw) throw err;
  }

  private async renderLatexToElement(task: LatexTask): Promise<void> {
    const { el, content, rawHash, sourcePath, dependencyPaths, basename } =
      task.getRenderData();
    try {
      const result = await this.renderLatexToPDF(content, { md5Hash: rawHash })
      el.innerHTML = '';
      await this.translatePDF(result.pdf, el, basename);
      addMenu(this.plugin, el, sourcePath);

      this.cache.resultFileCache.addFile(
        el.innerHTML,
        rawHash,
        dependencyPaths,
        sourcePath,
      );
    } catch (err) {
      this.handleErrorForTask(task, toErrorString(err), {
        parseErr: true,
      });
    } finally {
      if (!this.compiler.isResponsive()) {
        console.warn('Compiler is unresponsive.');
        return;
      }
      await this.compiler.waitUntilReady();
    }
  }

  renderLatexToPDF(
    source: string,
    config: { strict?: boolean; md5Hash?: string } = {},
  ): Promise<CompileResult> {

    return new Promise((resolve, reject) => {
      temp.mkdir(
        'obsidian-swiftlatex-renderer',
        async (mkdirErr: any) => {
          if (mkdirErr) {
            reject(mkdirErr);
            return;
          }

          try {
            await this.compiler.waitUntilReady();

            if (this.vfs.getEnabled()) {
              console.log(
                'Rendering LaTeX to PDF',
                source.split('\n'),
                this.vfs.getClonedFiles(),
              );
            }

            await this.vfs.loadVirtualFileSystemFiles();

            await this.compiler.writeMemFSFile('main.tex', source);
            await this.compiler.setEngineMainFile('main.tex');

            const result = await this.compiler.compileLaTeX();
            console.log('Compilation result:', result);

            await this.vfs.removeVirtualFileSystemFiles();

            if (config.md5Hash)
              this.cache.addLog(result.log, config.md5Hash);

            if (result.status !== 0) {
              reject(result.log);
              return;
            }

            if (!config.strict)
              await this.cache.fetchPackageCacheData();

            resolve(result);
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  }

  private async translatePDF(
    pdfData: Buffer<ArrayBufferLike>,
    el: HTMLElement,
    hash: string,
    outputSVG = true,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const config = {
        invertColorsInDarkMode:
          this.plugin.settings.invertColorsInDarkMode,
        autoRemoveWhitespace: this.plugin.settings.autoRemoveWhitespace,
        basename: hash,
      };
      if (outputSVG)
        pdfToOptimizedSVG(pdfData, config).then((svg: string) => {
          el.innerHTML = svg;
          resolve();
        });
      else
        pdfToHtml(pdfData).then((htmlData) => {
          el.createEl('object', htmlData);
          resolve();
        });
    });
  }
}



export function addMenu(
  plugin: LatexRender,
  el: HTMLElement,
  filePath: string,
) {
  plugin.menuDecider.add(el, filePath);
}

export class TimeoutError extends Error {
  constructor(message = 'Timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function toErrorString(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.stack ?? e.message ?? String(e);
  try {
    return JSON.stringify(e, null, 2);
  } catch {
    return String(e);
  }
}
