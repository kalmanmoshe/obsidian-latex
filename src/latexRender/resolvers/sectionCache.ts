import { SectionCache, TFile } from "obsidian";
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
  accountForNestedCodeBlocks = false,
): Promise<SectionCache[]> | SectionCache[] | undefined {
  const fileCache = app.metadataCache.getFileCache(file);
  if (!fileCache?.sections) return undefined;

  if (!accountForNestedCodeBlocks) {
    return fileCache.sections;
  }
  return getFileSectionsWithNested(file, fileCache.sections);
}

export async function getFileSectionsFromPath(path: string) {
  const file = app.vault.getAbstractFileByPath(path) as TFile;
  //we cant use the file cache
  const sections = await getFileSections(file, true);
  if (!sections) throw new Error("No sections found in metadata");
  return { file, sections };
}

async function getFileSectionsWithNested(file: TFile, sectionsBase: SectionCache[],): Promise<SectionCache[]> {
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