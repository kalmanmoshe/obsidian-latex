import Moshe from "src/main";
import { ProcessedLog } from "../logs/latex-log-parser";
import parseLatexLog from "../logs/HumanReadableLogs";
import { MarkdownView, Notice } from "obsidian";
import { getSectionFromMatching } from "./findSection";
import { getFileSectionsFromPath, latexCodeBlockNamesRegex } from "../swiftlatexRender";
import { LatexTaskProcessor } from "../utils/latexTask";

export default class LogCache {
  private plugin: Moshe;
  private cache?: Map<string, ProcessedLog>;
  constructor(plugin: Moshe) {
    this.plugin = plugin;
  }

  addLog(log: ProcessedLog | string, hash: string): void {
    if (!this.plugin.settings.saveLogs) return (this.cache = undefined);
    if (!this.cache) this.cache = new Map();
    if (typeof log === "string") log = parseLatexLog(log);
    this.cache.set(hash, log);
  }
  getLog(hash: string): ProcessedLog | undefined {
    if (!this.plugin.settings.saveLogs||!this.cache) return undefined;
    return this.cache.get(hash);
  }
  /**
   * 
   */
  async forceGetLog(hash: string,config: {source: string,sourcePath: string}): Promise<ProcessedLog | undefined> {
    if (!this.cache) return undefined;
    let log = this.cache.get(hash);
    if (log) return log;

    let cause="";
    if (!this.plugin.settings.saveLogs) {
      cause = "This may be because log saving is disabled in the settings.\n";
    }
    new Notice(
      "No logs were found for this SVG element.\n" + cause +
      "Re-rendering the SVG to generate logs. This may take a moment...",
    );
    const { source, sourcePath } = config;
    //await this.assignLatexSource();
    const { file, sections } = await getFileSectionsFromPath(
      sourcePath,
      this.plugin.app,
    );
    const editor =
      this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const fileText =
      editor?.getValue() ?? (await this.plugin.app.vault.cachedRead(file));
    const sectionFromMatching = getSectionFromMatching(
      sections,
      fileText,
      source,
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
      md5Hash: hash,
      source: source,
      el: el,
      sourcePath: sourcePath,
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
  removeLog(log: ProcessedLog, hash: string): void {
    if (!this.plugin.settings.saveLogs || !this.cache)
      return (this.cache = undefined);
    this.cache.delete(hash);
  }
}
