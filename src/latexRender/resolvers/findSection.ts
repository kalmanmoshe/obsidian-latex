import {
  Editor,
  MarkdownSectionInformation,
  Notice,
  SectionCache,
  TFile,
} from "obsidian";
import { TransactionLogger } from "../cache/transactionLogger";
import {getFileSections,} from "./sectionCache";
import { EditorView } from "@codemirror/view";
import { extractSectionSource } from "./sectionUtils";

/**
 * Tries to resolve the relevant section using the latest transaction log entry (source mode only).
 */
function getSectionFromTransaction(
  sections: SectionCache[],
  fileText: string,
  logger: TransactionLogger,
  editor?: Editor,
): (MarkdownSectionInformation & { source: string }) | undefined {
  if (!editor) return;
  const latestChange = logger.getLatestChange();
  if (!latestChange || !logger.hasRecentChanges()) return;

  const lineIndex = editor.offsetToPos(latestChange.from).line;
  const section = findInnermostSection(sections, lineIndex);
  if (!section) return;

  return {
    lineStart: section.position.start.line,
    lineEnd: section.position.end.line,
    text: fileText,
    source: extractSectionSource(fileText, section),
  };
}

export async function getCurrentCursorLocationSection(file: TFile, editor: Editor,) {
  const sections = await getFileSections(file, true);
  if (!sections) return;
  const selection = ((editor as any).cm as EditorView).state.selection;
  const head = selection.main.head;
  const lineIndex = editor.offsetToPos(head).line;
  const section = findInnermostSection(sections, lineIndex);
  return section;
}


/**
 * Tries to find a section by exact or fuzzy string match against the file content.
 * i need to faze this out
 */
export function getSectionFromMatching(sections: SectionCache[], fileText: string, source: string,): (MarkdownSectionInformation & { source?: string }) | undefined {
  let sectionCache: SectionCache | undefined;
  let fuzzyResult: { source: string; section: SectionCache } | undefined;
  sectionCache = extractSectionCacheOfString(sections, fileText, source);
  if (!sectionCache || !sectionCache.position) return;
  return {
    lineStart: sectionCache?.position.start.line,
    lineEnd: sectionCache?.position.end.line,
    text: fileText,
    source: fuzzyResult?.source ?? extractSectionSource(fileText, sectionCache),
  }
  if (!sectionCache) {
    fuzzyResult = getSectionCacheOfStringFuzzy(sections, fileText, source);
    sectionCache = fuzzyResult?.section;
  }
  if (!sectionCache) {
    const bestFit = getBestFitSectionCatch(sections, fileText, source);
    sectionCache = bestFit?.section;
  }
  if (!sectionCache) return;

  return {
    lineStart: sectionCache.position.start.line,
    lineEnd: sectionCache.position.end.line,
    text: fileText,
    source: fuzzyResult?.source ?? extractSectionSource(fileText, sectionCache),
  };
}

function extractSectionCacheOfString(sectionsCache: SectionCache[], fileText: string, target: string, exact = true,): SectionCache | undefined {
  const sourceIndexes = getAllLineStartIndexesOfString(fileText, target);
  console.log("sourceIndexes", sourceIndexes);
  const sourceIndex = extractSectionCheck(sourceIndexes);
  if (!sourceIndex) return;
  const codeBlockDelimiterIndex = sourceIndex - 1;
  const possibleSection = findInnermostSection(sectionsCache, codeBlockDelimiterIndex);
  if (!exact || !possibleSection) return possibleSection;
  if (possibleSection.position.start.line === codeBlockDelimiterIndex) {
    return possibleSection
  }
}

function extractSectionCheck(indexes: number[]) {
  if (indexes.length === 0) {
    return undefined;
  }
  if (indexes.length > 1) {
    throw new Error("LatexRender: Multiple sections found with the same source. Please ensure unique section headers.",);
  }
  const index = indexes[0];
  if (index <= 0) {
    throw new Error("LatexRender: Invalid section index found. This should not happen.",)
  }
  return index;
}


/*
function getTaskSectionInfoFromMatching(sections: SectionCache[], fileText: string, source: string,): TaskSectionInformation | undefined {
  const section = getSectionFromMatching(sections, fileText, source);
  if (!section) return;
  const codeBlock = section.source || extractSectionSource(fileText, section);
  return {
    lineStart: section.lineStart,
    lineEnd: section.lineEnd,
    codeBlock,
  };
}*/




/**
 * Returns the most nested (deepest) section that contains a given line.
 */
function findInnermostSection(
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

function getSectionCacheOfStringFuzzy(
  sectionsCache: SectionCache[],
  source: string,
  target: string,
  fuzzyMatchCurrency = 1,
): { source: string; section: SectionCache } | undefined {
  const matches = findMultiLineStartIndicesFuzzy(
    source,
    target,
    fuzzyMatchCurrency,
  );
  if (matches.length === 0) return undefined;
  // Filter for best matches (lowest distance)
  const minDistance = Math.min(...matches.map((m) => m.distance));
  const bestMatches = matches.filter((m) => m.distance === minDistance);
  if (bestMatches.length !== 1) {
    new Notice(
      "LatexRender: Couldn't determine the source of the code block. Possibly due to a nested or duplicated block.",
    );
    return undefined;
  }
  const codeBlockStartLine = bestMatches[0].index - 1;
  const section = sectionsCache.find(
    (s) => s.position.start.line === codeBlockStartLine,
  );
  if (!section) return undefined;
  const lines = source.split("\n");
  const slicedSource = lines
    .slice(section.position.start.line + 1, section.position.end.line)
    .join("\n");
  return { source: slicedSource, section };
}

function getBestFitSectionCatch(
  sectionsCache: SectionCache[],
  source: string,
  target: string,
): { source: string; section: SectionCache } | undefined {
  const matches = findPartialMatchInText(source, target);
  console.log("matches", matches);
  if (matches.length === 0) return undefined;
  if (matches.length !== 1) {
    new Notice(
      "LatexRender: Couldn't determine the source of the code block. Possibly due to a nested or duplicated block.",
    );
    return undefined;
  }
  const { indexInDoc, start, end } = matches[0];
  const section = findInnermostSection(sectionsCache, indexInDoc);
  if (!section) return undefined;
  const slicedSource = target
    .split("\n")
    .slice(start, end + 1)
    .join("\n");
  return { source: slicedSource, section };
}

function findPartialMatchInText(
  text: string,
  target: string,
): { indexInDoc: number; start: number; end: number }[] {
  const textLines = text.split("\n");
  const targetLines = target.split("\n");
  const matches = [];

  for (let i = 0; i < textLines.length; i++) {
    // Try to align with any line in target
    const index = targetLines.findIndex((line) => line === textLines[i]);
    if (index === -1) continue;

    let endIndex = index;

    for (
      let j = 1;
      i + j < textLines.length && index + j < targetLines.length;
      j++
    ) {
      if (textLines[i + j] === targetLines[index + j]) {
        endIndex = index + j;
      } else {
        break;
      }
    }

    matches.push({ indexInDoc: i, start: index, end: endIndex });
  }
  if (matches.length === 0) return [];
  const maxLength = Math.max(...matches.map((m) => m.end - m.start + 1));
  return matches.filter((m) => m.end - m.start + 1 === maxLength);
}


/**
 * zero-based index of the first line of a multi-line string in a file text.
 * @param fileText 
 * @param searchString 
 * @returns 
 */
function getAllLineStartIndexesOfString(fileText: string, searchString: string): number[] {
  const textLines = fileText.split("\n"); // Split the full text into lines
  const searchLines = searchString.split("\n"); // Split the search string into lines
  const searchLength = searchLines.length;
  const indexes: number[] = [];
  for (let i = 0; i <= textLines.length - searchLength; i++) {
    let match = true;

    for (let j = 0; j < searchLength; j++) {
      if (textLines[i + j] !== searchLines[j]) {
        match = false;
        break;
      }
    }

    if (match) {
      indexes.push(i);
    }
  }
  return indexes;
}

/**
 * Strategy: Slide a window over text lines and compare sequences to targetLines
 * Accumulate distance over the window and if within fuzzyMatchCurrency, return start index
 */
function findMultiLineStartIndicesFuzzy(
  text: string,
  target: string,
  fuzzyMatchCurrency: number,
): { index: number; distance: number }[] {
  if (fuzzyMatchCurrency <= 0)
    throw new Error("fuzzyMatchCurrency must be greater than 0");
  const textLines = text.split("\n"),
    targetLines = target.split("\n"),
    searchLength = targetLines.length;
  const matches: { index: number; distance: number }[] = [];

  for (let i = 0; i <= textLines.length - searchLength; i++) {
    let totalDistance = 0;
    let earlyExit = false;

    for (let j = 0; j < searchLength; j++) {
      const line = textLines[i + j];
      const targetLine = targetLines[j];

      if (line === targetLine) {
        continue;
      }

      const distance = levenshteinWithEarlyStop(
        line,
        targetLine,
        fuzzyMatchCurrency - totalDistance,
      );
      totalDistance += distance;
      if (totalDistance > fuzzyMatchCurrency) {
        earlyExit = true;
        break; // Stop further calculation
      }
    }

    if (!earlyExit && totalDistance >= 0) {
      matches.push({ index: i, distance: totalDistance });
    }
  }

  return matches.sort((a, b) => a.distance - b.distance);
}

// Levenshtein with early exit if distance exceeds threshold
function levenshteinWithEarlyStop(
  a: string,
  b: string,
  threshold: number,
): number {
  const m = a.length;
  const n = b.length;

  if (Math.abs(m - n) > threshold) return threshold + 1;

  const dp = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    let rowMin = Number.MAX_SAFE_INTEGER;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] =
          1 +
          Math.min(
            dp[i - 1][j], // deletion
            dp[i][j - 1], // insertion
            dp[i - 1][j - 1], // substitution
          );
      }
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    // Early stop if this row already exceeds threshold
    if (rowMin > threshold) return threshold + 1;
  }

  return dp[m][n];
}



