import { MarkdownView, Menu, Modal, Notice, TFile } from "obsidian";
import Moshe from "src/main";
import { getLatexSourceFromHash } from "./cache/latexSourceFromFile";
import { getFileSections } from "./cache/sectionCache";
import {
  addMenu,
  getFileSectionsFromPath,
  latexCodeBlockNamesRegex,
} from "./swiftlatexRender";
import parseLatexLog from "./logs/HumanReadableLogs";
import { getSectionFromMatching } from "./cache/findSection";
import { LogDisplayModal } from "./logs/logDisplayModal";
import { LatexTask, LatexTaskProcessor, ProcessableLatexTask } from "./utils/latexTask";
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
   * the container element that holds the SVG/err has class block-language-latexsvg
   */
  containerEl: HTMLElement;
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
      el &&!this.isSvgContainer(el) &&
      !Array.from(el.children).some((child) =>this.isSvgContainer(child as HTMLElement))
    ) {
      if (!el.parentElement) break;
      el = el.parentElement;
    }
    
    if (!this.isSvgContainer(el) && el) {
      const childContainer = Array.from(el.children).find((child) =>this.isSvgContainer(child as HTMLElement)) as HTMLElement | undefined;
      if (childContainer) el = childContainer;
    }
    if (!this.isSvgContainer(el) && el) {
      throw new Error( "No valid SVG container found in the hierarchy. Please ensure the element is a valid SVG container.")
    }
    const svg = Array.from(el.children).find((child) => child instanceof SVGElement);
    this.isError = !svg;
    this.svgEl = svg
    this.containerEl = el;
    console.log("svg", svg, "el", el, "isError", this.isError);
    const hash = this.containerEl.id;
    if (hash === undefined) throw new Error("No hash found for SVG element");
    /*
    return ( svg ??Array.from(el.children).find((child) =>
          child.classList.contains("moshe-swift-latex-error-container") &&child instanceof HTMLElement,
      ) as HTMLElement ??null);*/
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
      let cause = "This may be because ";
      if (!this.plugin.settings.saveLogs) {
        cause += "log saving is disabled in the settings.";
      } else {
        cause = "";
      }
      new Notice(
        "No logs were found for this SVG element.\n" +
          (cause ? cause + "\n" : "") +
          "Re-rendering the SVG to generate logs. This may take a moment...",
      );
      await this.assignLatexSource();
      const { file, sections } = await getFileSectionsFromPath(
        this.sourcePath,
        this.plugin.app,
      );
      const editor =
        this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      const fileText =
        editor?.getValue() ?? (await this.plugin.app.vault.cachedRead(file));
      const sectionFromMatching = getSectionFromMatching(
        sections,
        fileText,
        this.source,
      );
      if (!sectionFromMatching)
        throw new Error("No section found for this source");
      const shouldProcess =
        fileText
          .split("\n")
          [
            sectionFromMatching.lineStart
          ].match(latexCodeBlockNamesRegex)?.[2] === "tikz";
      const el = document.createElement("div");
      const task = {
        md5Hash: this.hash,
        source: this.source,
        el: el,
        sourcePath: this.sourcePath,
      };
      if (shouldProcess) {
        const result = LatexTaskProcessor.processTask(this.plugin, task);
      }
      try {
        const newCompile = await this.plugin.swiftlatexRender.renderLatexToPDF(
          task.source,
          task.md5Hash,
        );
        log = parseLatexLog(newCompile.log);
      } catch (err) {
        log = parseLatexLog(err);
      }
    }
    console.log("log", log);
    const modal = new LogDisplayModal(this.plugin, log);
    modal.open();
  }
  /*private async showLogs() {
    const hash = this.getHash();
    this.assignLatexSource();
    const log = this.plugin.swiftlatexRender.cache.getLog(hash);
    if(!log) throw new Error("")
    console.log("log", log);
    const modal = new LogDisplayModal(this.plugin, log);
    modal.open();
  }*/
  assignLatexSource(): Promise<boolean> {
    if (this.source !== undefined) return Promise.resolve(true);
    if (!this.sourceAssignmentPromise) {
      this.sourceAssignmentPromise = (async () => {
        const file = await this.getFile();
        const hash = this.hash;
        if (!hash) return false;
        this.source = await getLatexSourceFromHash(hash, this.plugin, file);
        return true;
      })();
    }
    return this.sourceAssignmentPromise;
  }
  private async getFile() {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!file) throw new Error("File not found");
    if (!(file instanceof TFile)) throw new Error("File is not a TFile");
    return file;
  }
  async getSectionInfo() {
    const file = await this.getFile();
    if (!file) throw new Error("No file found");

    const sections = await getFileSections(file, this.plugin.app, true);
    if (!sections) throw new Error("No sections found in metadata");
    const fileText = await this.plugin.app.vault.read(file);
    await this.assignLatexSource();
    const sectionCache = getSectionFromMatching(
      sections,
      fileText,
      this.source,
    );
    if (!sectionCache) throw new Error("Section cache not found");
    const lang = fileText
      .split("\n")
      [sectionCache.lineStart].match(latexCodeBlockNamesRegex)?.[2];
    if (lang !== "tikz" && lang !== "latex") {
      throw new Error("Code block is not a tikz or latex code block");
    }
    this.codeBlockLanguage = lang;
    return {
      lineStart: sectionCache.lineStart,
      lineEnd: sectionCache.lineEnd,
      text: fileText
    };
  }
  /**
   * Can't be saved as contains dynamic content.
   */

  private async removeAndReRender() {
    let hash = this.hash;
    const parentEl = this.containerEl;
    if (!this.isError && hash) {
      await this.plugin.swiftlatexRender.cache.removeFile(hash);
    }
    if (this.svgEl) {
      parentEl.removeChild(this.svgEl);
    }
    this.assignLatexSource();

    addMenu(this.plugin, parentEl, this.sourcePath);
    const sectionInfo = await this.getSectionInfo();
    const isProcess = this.codeBlockLanguage === "tikz"
    const task = LatexTask.baseCreate(this.plugin, isProcess, this.source, parentEl,this.sourcePath,sectionInfo)
    this.plugin.swiftlatexRender.addToQueue(task)
    new Notice("SVG removed from cache. Re-rendering...");
  }

  async open(event: MouseEvent) {
    this.showAtPosition({ x: event.pageX, y: event.pageY });
  }
  private async getParsedSource() {
    await this.assignLatexSource();
    const sectionInfo = await this.getSectionInfo();
    const task = ProcessableLatexTask.create(this.plugin, this.source, document.createElement("div"), this.sourcePath, sectionInfo);
    if (this.codeBlockLanguage !== "tikz") return task.getSource(false);
    await task.process();
    return task.getSource(true);
  }
}
