import { Menu, Notice, TFile } from "obsidian";
import Moshe from "src/main";
import { extractCodeBlockLanguage } from "./resolvers/latexSourceFromFile";
import { addMenu } from "./swiftlatexRender";
import { codeBlockToContent } from "./resolvers/findSection";
import { LogDisplayModal } from "./logs/logDisplayModal";
import { LatexTask } from "./utils/latexTask";
import { ErrorClasses } from "./logs/HumanReadableLogs";
import { findTaskSectionInfoFromHashInFile, TaskSectionInformation } from "./resolvers/taskSectionInformation";
/**add:
 * - Reveal in file explorer
 * - show log
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
  source: string;
  codeBlockLanguage: "tikz" | "latex";
  private sourceAssignmentPromise: Promise<boolean> | null = null;
  hash: string;
  constructor(
    plugin: Moshe,
    trigeringElement: HTMLElement,
    sourcePath: string,
  ) {
    super();
    this.plugin = plugin;
    this.assignElements(trigeringElement);
    this.sourcePath = sourcePath;
    this.addDisplayItems();
    console.log("SvgContextMenu created for", this.blockEl, this.svgEl, this.containerEl, this.hash);
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
    const hash = this.svgEl?.id ?? this.containerEl.id;
    if (hash === undefined) {
      console.error("No hash found for SVG element", this.svgEl, this.containerEl);
      throw new Error("No hash found for SVG element")
    };
    this.hash = hash
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
    this.addItem((item) => {
      item.setTitle("Copy parsed source");
      item.setIcon("copy");
      item.onClick(async () => {
        const source = await this.getParsedSource();
        await navigator.clipboard.writeText(source);
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
  }
  private getCodeBlockLanguage() {
    if (!this.source) return undefined;
  }
  private async showLogs() {
    this.assignLatexSource();
    let log = this.plugin.swiftlatexRender.cache.getLog(this.hash);
    if (!log) {
      await this.assignLatexSource();
      log = await this.plugin.swiftlatexRender.cache.forceGetLog(this.hash, { source: this.source, sourcePath: this.sourcePath })
    }
    console.log("log", log);
    const modal = new LogDisplayModal(this.plugin, log);
    modal.open();
  }
  assignLatexSource(): Promise<boolean> {
    if (this.source !== undefined) return Promise.resolve(true);
    console.log("assignLatexSource", this.sourceAssignmentPromise);
    if (!this.sourceAssignmentPromise) {
      this.sourceAssignmentPromise = (async () => {
        const file = await this.getFile();
        const hash = this.hash;
        if (!hash) return false;
        const info = await findTaskSectionInfoFromHashInFile(file, hash);
        if (!info) throw new Error("No info found for hash: " + hash);
        this.source = codeBlockToContent(info.codeBlock);
        return true;
      })();
    }
    return this.sourceAssignmentPromise;
  }
  private async getFile() {
    const file = app.vault.getAbstractFileByPath(this.sourcePath);
    if (!file) throw new Error("File not found");
    if (!(file instanceof TFile)) throw new Error("File is not a TFile");
    return file;
  }
  private async assignMetadata() {

  }
  async getSectionInfo(): Promise<TaskSectionInformation> {
    const file = await this.getFile();
    if (!file) throw new Error("No file found");
    const sectionInfo = await findTaskSectionInfoFromHashInFile(file, this.hash);
    if (!sectionInfo) throw new Error("No section info found for hash: " + this.hash + " in file: " + file.path);
    this.source = codeBlockToContent(sectionInfo.codeBlock);
    const lang = extractCodeBlockLanguage(sectionInfo.codeBlock);
    if (lang !== "tikz" && lang !== "latex") {
      throw new Error("Code block is not a tikz or latex code block");
    }
    this.codeBlockLanguage = lang;
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
    let hash = this.hash;
    const parentEl = this.blockEl;
    if (!this.isError && hash) {
      await this.plugin.swiftlatexRender.cache.removeFile(hash);
    }
    this.cleanBlockEl();
    const sectionInfo = await this.getSectionInfo();
    const shouldProcess = this.codeBlockLanguage === "tikz";
    addMenu(this.plugin, parentEl, this.sourcePath);
    const task = LatexTask.baseCreate(this.plugin, shouldProcess, this.source, this.blockEl, this.sourcePath, sectionInfo);
    this.plugin.swiftlatexRender.addToQueue(task);
    new Notice("SVG removed from cache. Re-rendering...");
  }

  async open(event: MouseEvent) {
    this.showAtPosition({ x: event.pageX, y: event.pageY });
  }
  private async getParsedSource() {
    await this.assignLatexSource();
    const sectionInfo = await this.getSectionInfo();
    const task = LatexTask.fromSectionInfo(this.plugin, this.sourcePath, sectionInfo);
    if (task.isProcess()) await task.process();
    return task.getProcessedContent();
  }
}
