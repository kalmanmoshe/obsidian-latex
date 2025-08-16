import { Menu, Notice, TFile, Platform } from "obsidian";
import Moshe from "src/main";
import { LogDisplayModal } from "./logs/logDisplayModal";
import { LatexTask } from "./task/latexTask";
import { ErrorClasses } from "./logs/HumanReadableLogs";
import { findTaskSectionInfoFromHashInFile, TaskSectionInformation } from "./resolvers/taskSectionInformation";
import { SVG_ID_KEY } from "src/svg/nodes";
import { exec } from 'child_process';
import { codeBlockToContent } from "obsidian-dev-utils";

function revealFileWithFocus(path: string) {
  if (Platform.isWin) {
    const winPath = path.replace(/\//g, "\\");
    exec(`start "" explorer.exe /select,"${winPath}"`);
    //exec(`explorer.exe /select,"${path.replace(/\//g, '\\')}"`);
  } else if (Platform.isMacOS) {
    const script = `
			tell application "Finder"
				reveal POSIX file "${path}"
				activate
			end tell
		`;
    exec(`osascript -e '${script.replace(/\n/g, '')}'`);
  } else {
    // Fallback for Linux or just use shell.showItemInFolder
    const { shell } = require('electron');
    shell.showItemInFolder(path);
  }
}

/**add:
 * - show logs (soch as \print{} \message{"hello world"} and more)
 * - properties (such as size, dependencies, hash, date created, )
 */
export class SvgContextMenu extends Menu {
  plugin: Moshe;
  svgEl?: SVGElement;
  /**
   * the container element that holds the SVG/err container.
   */
  containerEl?: HTMLElement;
  /**
   * The parent el of the code block has class block-language-latexsvg
   */
  blockEl: HTMLElement;
  sourcePath: string;
  isError: boolean;
  content: string;
  private sourceAssignmentPromise: Promise<boolean> | null = null;
  basename: string;
  rawHash: string
  depsHash: string;
  private resultFileCache;
  constructor(
    plugin: Moshe,
    trigeringElement: HTMLElement,
    sourcePath: string,
  ) {
    super();
    this.plugin = plugin;
    this.resultFileCache = this.plugin.swiftlatexRender.cache.resultFileCache;
    this.assignElements(trigeringElement);
    this.sourcePath = sourcePath;
    this.addDisplayItems();
    console.log("SvgContextMenu created for", this.blockEl, this.svgEl, this.containerEl, this.basename);
  }

  private isSvgContainer(el: HTMLElement) {
    return el.classList.contains("block-language-latexsvg");
  }

  /**
   * Ensures the provided element is an SVG or a valid container for SVG elements.
   * If the element is not valid, it climbs up the DOM hierarchy to find a suitable container.
   * @param el - The element to validate and process.
   * @returns The validated SVG element or container, or null if none is found.
   */
  private assignElements(el: HTMLElement) {
    // Climb up the DOM until we find a valid container or reach the top
    /*
    while el is defined and dose not have a parent element or is not an SVG container
    and none of its children are SVG containers, keep climbing up the DOM.
    */
    while (
      el && !this.isSvgContainer(el) &&
      !Array.from(el.children).some((child) => this.isSvgContainer(child as HTMLElement))
    ) {
      if (!el.parentElement) break;
      el = el.parentElement;
    }

    if (!this.isSvgContainer(el) && el) {
      const childContainer = Array.from(el.children).find((child) => this.isSvgContainer(child as HTMLElement)) as HTMLElement | undefined;
      if (childContainer) el = childContainer;
    }
    if (!this.isSvgContainer(el) && el) {
      throw new Error("No valid SVG container found in the hierarchy. Please ensure the element is a valid SVG container.")
    }
    const svg = Array.from(el.children).find((child) => child instanceof SVGElement);
    const errorContainer = Array.from(el.children).find((child) => child.classList.contains(ErrorClasses.Container));
    if (!svg && !errorContainer) {
      throw new Error("No SVG element or error container found in the provided element.");
    }
    this.blockEl = el;
    this.isError = !svg;
    this.svgEl = svg
    this.containerEl = errorContainer as HTMLElement || undefined;
    const basename = this.svgEl?.getAttribute(SVG_ID_KEY) ?? this.containerEl?.getAttribute(SVG_ID_KEY);
    if (!basename) {
      console.error("No basename found for SVG element", this.svgEl, this.containerEl);
      throw new Error("No basename found for SVG element")
    };
    this.basename = basename;
    ({ rawHash: this.rawHash, depsHash: this.depsHash } = this.resultFileCache.basenameToHashes(this.basename));
  }

  private addDisplayItems() {
    if (!this.isError)
      this.addItem((item) => {
        item.setTitle("Copy SVG");
        item.setIcon("copy");
        item.onClick(async () => {
          const svg = this.svgEl;
          console.log("svg", svg);
          if (svg) {
            const svgString = new XMLSerializer().serializeToString(svg);
            await navigator.clipboard.writeText(svgString);
          }
        });
      });
    if (!this.isError)
      this.addItem((item) => {
        item.setTitle("properties");
        item.setIcon("settings");
        item.onClick(async () => {
          console.log("properties");
        });
      });
    this.addItem((item) => {
      item.setTitle("remove & re-render");
      item.setIcon("trash");
      item.onClick(async () => await this.removeAndReRender());
    });
    this.addItem((item) => {
      item.setTitle("Show logs");
      item.setIcon("info");
      item.onClick(async () => {
        this.showLogs();
      });
    });
    if (!this.isError)
      this.addItem((item) => {
        item.setTitle("Reveal in file explorer");
        item.setIcon("folder");
        item.onClick(async () => {
          this.revealFileInExplorer();
        });
      });
    this.addDebugDisplayItems();
  }
  private addDebugDisplayItems() {
    this.addItem((item) => {
      item.setTitle("Copy parsed source");
      item.setIcon("copy");
      item.onClick(async () => {
        const source = await this.getParsedSource();
        if (!source) return;
        await navigator.clipboard.writeText(source);
      });
    });
    if (!this.isError)
    this.addItem((item) => {
      item.setTitle("copy raw svg")
      item.setIcon("copy");
      item.onClick(async () => {
        const rawSvg = await this.getRawSvg();
        if (!rawSvg) {
          new Notice("Failed to get raw SVG content.");
          return;
        }
        await navigator.clipboard.writeText(rawSvg);
      })
    })
  }

  private revealFileInExplorer() {
    if (this.isError) {
      throw new Error("Can't reveal file in explorer, this is an error container.");
    }
    try {
      if (!this.resultFileCache.isPhysicalCatch()) {
        new Notice("Result file cache is not physical, can't open file in explorer.");
        return;
      }
      const filePath = this.resultFileCache.getAbsolutePathFromBasename(this.basename);
      revealFileWithFocus(filePath);
    } catch (err) {
      console.error("Failed to open file in explorer:", err);
    }
  }
  private async showLogs() {
    this.assignLatexContent();
    let log = this.plugin.swiftlatexRender.cache.getLog(this.basename);
    if (!log) {
      await this.assignLatexContent();
      log = await this.plugin.swiftlatexRender.cache.forceGetLog(this.basename, { source: this.content, sourcePath: this.sourcePath })
    }
    console.log("log", log);
    const modal = new LogDisplayModal(log);
    modal.open();
  }

  assignLatexContent(): Promise<boolean> {
    if (this.content !== undefined) return Promise.resolve(true);
    if (!this.sourceAssignmentPromise) {
      this.sourceAssignmentPromise = (async () => {
        const info = await this.getSectionInfo();
        this.content = codeBlockToContent(info.codeBlock);
        return true;
      })();
    }
    return this.sourceAssignmentPromise;
  }

  private async getFile() {
    console.log("Getting file for source path:", this.sourcePath);
    const file = app.vault.getAbstractFileByPath(this.sourcePath);
    if (!file) throw new Error("File not found");
    if (!(file instanceof TFile)) throw new Error("File is not a TFile");
    return file;
  }

  private async assignMetadata() {

  }

  async getTask(): Promise<LatexTask> {
    await this.assignLatexContent();
    const file = await this.getFile();
    const sectionInfos = await findTaskSectionInfoFromHashInFile(file, this.rawHash);
    if (!sectionInfos) throw new Error("No section info found for hash: " + this.rawHash + " in file: " + file.path);
    const task = LatexTask.fromSectionInfos(this.plugin, this.sourcePath, sectionInfos,this.blockEl);
    return task;
  }

  async getSectionInfo(): Promise<TaskSectionInformation> {
    const file = await this.getFile();
    const sectionInfos = await findTaskSectionInfoFromHashInFile(file, this.rawHash);
    if (!sectionInfos) throw new Error("No section info found for hash: " + this.rawHash + " in file: " + file.path);
    const sectionInfo = sectionInfos[0]; 
    this.content = codeBlockToContent(sectionInfo.codeBlock);
    return sectionInfo;
  }

  /**
   * Cleans the block element by removing all its children.
   */
  private cleanBlockEl() {
    while (this.blockEl.firstChild) {
      this.blockEl.removeChild(this.blockEl.firstChild);
    }
  }
  /**
   * Can't be saved as contains dynamic content.
  */
  private async removeAndReRender() {

    if (!this.isError) {
      const success = this.resultFileCache.removeResultFileFromCache(this.basename);
      if (!success) {
        console.error("Failed to remove result file from cache:", this.basename);
      }
    }
    this.cleanBlockEl();
    const task = await this.getTask();
    this.plugin.swiftlatexRender.addToQueue(task);
    new Notice("SVG removed from cache. Re-rendering...");
  }

  async open(event: MouseEvent) {
    this.showAtPosition({ x: event.pageX, y: event.pageY });
  }

  private async getParsedSource() {
    const task = await this.getTask();
    if (task.isProcess()) {
      const processor = await task.process();
      if (processor.isError) {
        new Notice("Failed to process task");
        console.error("Failed to process task:", processor.err);
        return undefined;
      }
    }
    return task.getProcessedContent();
  }

  private async getRawSvg() {
    const task = await this.getTask();
    const result = await this.plugin.swiftlatexRender.detachedProcessAndRenderToResultFile(task);
    return result;
  }
}
