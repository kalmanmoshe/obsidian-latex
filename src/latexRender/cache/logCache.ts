import Moshe from "src/main";
import { ProcessedLog } from "../logs/latex-log-parser";
import parseLatexLog from "../logs/HumanReadableLogs";
import { MarkdownView, Notice } from "obsidian";
import { getSectionsFromMatching } from "../resolvers/findSection";
import { LatexTask } from "../utils/latexTask";
import { getFileSectionsFromPath } from "../resolvers/sectionCache";
import { sectionToTaskSectionInfo } from "../resolvers/sectionUtils";

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
    if (!this.cacheEnabled()) return undefined;
    return this.cache!.get(hash);
  }
  private cacheEnabled() {
    return this.plugin.settings.saveLogs && this.cache !== undefined;
  }
  hasLog(hash: string): boolean {
    return this.cacheEnabled() && this.cache!.has(hash);
  }
  /**
   * 
   */
  async forceGetLog(hash: string, config: { source: string, sourcePath: string }): Promise<ProcessedLog | undefined> {
    if (this.hasLog(hash)) return this.cache!.get(hash);

    let cause = "";
    if (!this.plugin.settings.saveLogs) {
      cause = "This may be because log saving is disabled in the settings.\n";
    }
    new Notice(
      "No logs were found for this SVG element.\n" + cause +
      "Re-rendering the SVG to generate logs. This may take a moment...",
    );
    const { source, sourcePath } = config;
    const { file, sections } = await getFileSectionsFromPath(sourcePath,);
    const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const fileText = editor?.getValue() ?? (await app.vault.cachedRead(file));
    const sectionsFromMatching = getSectionsFromMatching(sections, fileText, source);
    if (!sectionsFromMatching) throw new Error("No section found for this source");
    const sectionInfos = sectionsFromMatching.map(secFromMatch => sectionToTaskSectionInfo(secFromMatch));
    const task = LatexTask.fromSectionInfos(this.plugin, sourcePath, sectionInfos);
    const result = await this.plugin.swiftlatexRender.detachedProcessAndRender(task);
    return parseLatexLog(result.log);
  }
  removeLog(log: ProcessedLog, hash: string): void {
    if (!this.plugin.settings.saveLogs || !this.cache)
      return (this.cache = undefined);
    this.cache.delete(hash);
  }
}
