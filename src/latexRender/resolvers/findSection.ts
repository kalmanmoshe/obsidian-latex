import {
  Editor,
  MarkdownSectionInformation,
  SectionCache,
  TFile,
} from "obsidian";
import { TransactionLogger } from "../cache/transactionLogger";
import {
  getBestFitSectionCatch,
  getFileSections,
  getSectionCacheOfString,
  getSectionCacheOfStringFuzzy,
} from "./sectionCache";
import Moshe from "src/main";
import { EditorView } from "@codemirror/view";

/**
 * Tries to resolve the relevant section using the latest transaction log entry (source mode only).
 */
export function getSectionFromTransaction(
  sections: SectionCache[],
  fileText: string,
  logger: TransactionLogger,
  editor?: Editor,
): (MarkdownSectionInformation & { source: string }) | undefined {
  if (!editor) return;
  const latestChange = logger.getLatestChange();
  if (!latestChange || !logger.hasRecentChanges()) return;

  const lineIndex = editor.offsetToPos(latestChange.from).line;
  const section = getInnermostSection(sections, lineIndex);
  if (!section) return;

  return {
    lineStart: section.position.start.line,
    lineEnd: section.position.end.line,
    text: fileText,
    source: extractSectionSource(fileText, section),
  };
}
export async function getCurrentCursorLocationSection(
  file: TFile,
  plugin: Moshe,
  editor: Editor,
) {
  const sections = await getFileSections(file, plugin.app, true);
  if (!sections) return;
  const selection = ((editor as any).cm as EditorView).state.selection;
  const head = selection.main.head;
  const lineIndex = editor.offsetToPos(head).line;
  const section = getInnermostSection(sections, lineIndex);
  return section;
}

/**
 * Tries to find a section by exact or fuzzy string match against the file content.
 */
export function getSectionFromMatching(
  sections: SectionCache[],
  fileText: string,
  source: string,
): (MarkdownSectionInformation & { source?: string }) | undefined {
  let sectionCache: SectionCache | undefined;
  let fuzzyResult: { source: string; section: SectionCache } | undefined;
  sectionCache = getSectionCacheOfString(sections, fileText, source, false);
  if (!sectionCache) {
    fuzzyResult = getSectionCacheOfStringFuzzy(sections, fileText, source);
    sectionCache = fuzzyResult?.section;
  }
  if (!sectionCache) {
    const bestFit = getBestFitSectionCatch(sections, fileText, source);
  }
  if (!sectionCache) return;

  return {
    lineStart: sectionCache.position.start.line,
    lineEnd: sectionCache.position.end.line,
    text: fileText,
    source: fuzzyResult?.source ?? extractSectionSource(fileText, sectionCache),
  };
}

/**
 * Extracts the raw markdown content of a section from the file.
 */
function extractSectionSource(fileText: string, section: SectionCache): string {
  const lines = fileText.split("\n");
  return lines
    .slice(section.position.start.line + 1, section.position.end.line)
    .join("\n");
}

/**
 * Returns the most nested (deepest) section that contains a given line.
 */
export function getInnermostSection(
  sections: SectionCache[],
  lineIndex: number,
  lineEnd?: number,
): SectionCache | undefined {
  return sections
    .filter(
      (sec) =>
        sec.position.start.line <= lineIndex &&
        sec.position.end.line >= lineIndex &&
        (lineEnd ? sec.position.end.line <= lineEnd : true),
    )
    .sort((a, b) => b.position.start.line - a.position.start.line)[0];
}
