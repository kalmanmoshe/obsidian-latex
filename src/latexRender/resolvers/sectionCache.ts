import { App, Notice, SectionCache, TFile } from "obsidian";
import { getInnermostSection } from "./findSection";
import { parseNestedCodeBlocks, shiftSections } from "obsidian-dev-utils";
/**
 * get the sections of a file from the metadata cache with the option to account for nested code blocks.
 * @param file
 * @param app
 * @param accountForNestedCodeBlocks
 * @returns
 */
export function getFileSections(
  file: TFile,
  app: App,
  accountForNestedCodeBlocks = false,
): Promise<SectionCache[]> | SectionCache[] | undefined {
  const fileCache = app.metadataCache.getFileCache(file);
  if (!fileCache?.sections) return undefined;

  if (!accountForNestedCodeBlocks) {
    return fileCache.sections;
  }
  return getFileSectionsWithNested(file, app, fileCache.sections);
}

async function getFileSectionsWithNested(
  file: TFile,
  app: App,
  sectionsBase: SectionCache[],
): Promise<SectionCache[]> {
  const sections: SectionCache[] = [];
  const source = await app.vault.read(file);
  const lines = source.split("\n");
  for (const section of sectionsBase) {
    sections.push(section);
    if (section.type !== "code") continue;

    const startPos = section.position.start;
    const content = lines
      .slice(startPos.line + 1, section.position.end.line)
      .join("\n");
    const nestedCodeBlocks = shiftSections(
      startPos.line + 1,
      parseNestedCodeBlocks(content),
    ).map((section) => createSectionCache(source, section.start, section.end));

    sections.push(...nestedCodeBlocks);
  }

  return sections.sort((a, b) => a.position.start.line - b.position.start.line);
}

function createSectionCache(
  source: string,
  startLine: number,
  endLine: number,
): SectionCache {
  return {
    type: "code",
    position: {
      start: {
        line: startLine,
        col: 0,
        offset: getOffsetForLine(source, startLine),
      },
      end: {
        line: endLine,
        col: source.split("\n")[endLine].trim().length,
        offset: getOffsetForLine(source, endLine),
      },
    },
  };
}
function getOffsetForLine(source: string, lineNumber: number): number {
  return source
    .split("\n")
    .slice(0, lineNumber)
    .reduce((acc, curr) => acc + curr.length + 1, 0); // +1 for \n
}
// u can Always use editor.offsetToPos(offset) to get the line number
// this is for when you dont have access to the editor
export function getLineFromOffset(source: string, offset: number): number {
  const lines = source.split("\n");
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + 1;
    if (total + lineLength > offset) {
      return i;
    }
    total += lineLength;
  }
  return lines.length - 1;
}

function findMultiLineStartIndex(text: string, searchString: string): number {
  const textLines = text.split("\n"); // Split the full text into lines
  const searchLines = searchString.split("\n"); // Split the search string into lines
  const searchLength = searchLines.length;

  for (let i = 0; i <= textLines.length - searchLength; i++) {
    let match = true;

    for (let j = 0; j < searchLength; j++) {
      if (textLines[i + j] !== searchLines[j]) {
        match = false;
        break;
      }
    }

    if (match) {
      return i;
    }
  }
  return -1;
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

export function getSectionCacheOfString(
  sectionsCache: SectionCache[],
  source: string,
  target: string,
  exact = true,
): SectionCache | undefined {
  let sourceIndex = findMultiLineStartIndex(source, target);
  if (sourceIndex <= 0) return;
  const codeBlockStartLine = sourceIndex - 1;
  const section = exact
    ? sectionsCache.find(
        (section) => section.position.start.line === codeBlockStartLine,
      )
    : sectionsCache.find(
        (section) =>
          section.position.start.line >= codeBlockStartLine &&
          section.position.end.line >= codeBlockStartLine,
      );
  return section;
}

export function getSectionCacheOfStringFuzzy(
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
export function getBestFitSectionCatch(
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
  const section = getInnermostSection(sectionsCache, indexInDoc);
  if (!section) return undefined;
  const slicedSource = target
    .split("\n")
    .slice(start, end + 1)
    .join("\n");
  return { source: slicedSource, section };
}
export function findPartialMatchInText(
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
