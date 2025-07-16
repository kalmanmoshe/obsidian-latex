import { App, MarkdownSectionInformation, SectionCache, TAbstractFile, TFile, TFolder } from "obsidian";
import Moshe from "src/main";
import { hashLatexSource, latexCodeBlockNamesRegex } from "../swiftlatexRender";
import { getFileSections } from "./sectionCache";
import { TaskSectionInformation } from "../utils/latexTask";

export function sectionToTaskInfo(section: MarkdownSectionInformation): TaskSectionInformation {
  return {
    lineStart: section.lineStart,
    lineEnd: section.lineEnd,
    codeBlock: section.text.split("\n").slice(section.lineStart, section.lineEnd + 1).join("\n"),
  };
}
export async function findSectionInfoFromHashInFile(plugin: Moshe,file: TFile, hash: string) {
  const blockSections = await getLatexCodeBlockSectionsFromFile(plugin.app, file)
  for (const section of blockSections) {
    const codeSection = section.codeBlock.split("\n").slice(1, -1).join("\n");
    if (hashLatexSource(codeSection) === hash) {
      return section;
    }
  }
}

export async function getSectionInfoFromHash(plugin: Moshe,hash: string): Promise<TaskSectionInformation> {
  const filePathsCache = new Set<string>();

  // Use cache to narrow down file paths.
  const cachedFilePaths = plugin.swiftlatexRender.cache.getCachedFilePathsForHash(hash);
  for (const filePath of cachedFilePaths) {
    if(filePathsCache.has(filePath)) continue;
    filePathsCache.add(filePath);
    const fileFromCache = plugin.app.metadataCache.getFirstLinkpathDest(filePath, "");
    if (!fileFromCache) continue;
    const info = await findSectionInfoFromHashInFile(plugin, fileFromCache, hash);
    if (info) return info;
  }

  // If still not found, search all files in parallel.
  const allFiles = plugin.app.vault.getFiles();
  for (const file of allFiles) {
    if (filePathsCache.has(file.path)) continue; // Skip already checked files
    filePathsCache.add(file.path);
    const info = await findSectionInfoFromHashInFile(plugin, file, hash);
    if (info) {return info}
  }
  throw new Error("Latex info not found for hash: " + hash);
}

function getDirRoot(currentDir: TAbstractFile): TFolder {
  while (currentDir.parent) {
    currentDir = currentDir.parent;
  }
  if (!(currentDir instanceof TFolder) || !currentDir.isRoot())
    throw new Error("Root not found");
  return currentDir;
}

export function findRelativeFile( filePath: string, currentDir: TAbstractFile | null ) {
  if (!currentDir) {
    throw new Error(`Source file not found`);
  }
  const sourcePath = currentDir.path;
  const separator = filePath.includes("\\") ? "\\" : "/";
  const leadingDotsRegex = new RegExp("^\\.{1,2}(" + separator + ")?");
  const leadingPrefix = filePath.match(leadingDotsRegex)?.[0] || "";
  filePath = filePath.replace(leadingDotsRegex, "");
  if (leadingPrefix && leadingPrefix[1]) {
    for (let i = 0; i < leadingPrefix[1].length; i++) {
      if (!currentDir.parent) throw new Error(`Reached root without resolving full path from: ${sourcePath}`);
      currentDir = currentDir.parent;
    }
  } else if (filePath.includes(separator)) {
    currentDir = getDirRoot(currentDir);
  }
  // if dir is the correct file return it
  if (currentDir instanceof TFile) {
    return { file: currentDir, remainingPath: filePath };
  }
  const pathParts = filePath.split(separator).filter(Boolean);
  while (pathParts.length > 1 && currentDir instanceof TFolder) {
    const nextFolder: TAbstractFile | undefined = currentDir.children.find(
      (child) => child instanceof TFolder && child.name === pathParts[0],
    );
    if (!nextFolder || !(nextFolder instanceof TFolder)) break;
    currentDir = nextFolder;
    pathParts.shift();
  }
  if (!(currentDir instanceof TFolder)) {
    throw new Error(`Invalid folder: ${pathParts[0]}`);
  }
  const fileName = pathParts[0];
  const file =
    currentDir.children.find(
      (child) => child instanceof TFile && child.name === fileName,
    ) ??
    currentDir.children.find((child) =>
      child instanceof TFile &&
      child.basename === fileName &&
      child.name.endsWith(".md"),
    );
  if (!file) {
    throw new Error(`File not found: ${fileName}`);
  }
  pathParts.shift();
  if (pathParts.length > 1 || !(file instanceof TFile))
    throw new Error("Path not found");
  return {
    file,
    remainingPath: pathParts.length > 0 ? pathParts[0] : undefined,
  };
}
export const codeBlockNameRegex = /[`~]{3,} *([a-zA-Z0-9_\-+.#\/]+)/;

export function extractCodeBlockMetadata(text: string): { language?: string;  name?: string; } {
  const language = text.match(codeBlockNameRegex)?.[1];
  const name = extractCodeBlockName(text);
  return {language, name};
}
/**
 * Attempts to extract the name of a LaTeX code block from the first line of the given text.
 * @param codeBlock - The full text of the code block
 * @returns The extracted name if matched, otherwise undefined
 */
export function extractCodeBlockName(codeBlock: string): string | undefined {
  const nameMatch = codeBlock.split("\n")[0]
    .replace(latexCodeBlockNamesRegex, "")
    .trim()
    .match(/name: *([\w-]+)/); // Match names with letters, numbers, underscores, and dashes
  return nameMatch ? nameMatch[1] : undefined;
}
/**
 * Extracts all latex code blocks from a file and returns their hashes.
 * @param file 
 * @param app 
 * @returns 
 */
export async function getLatexHashesFromFile(app: App,file: TFile) {
  const codeBlocks = await getLatexCodeBlockSectionsFromFile(app, file);
  const hashes = codeBlocks.map((block) => hashLatexSource(block.codeBlock.split("\n").slice(1, -1).join("\n")));
  return hashes;
}

/**
 * Converts code sections into LaTeX code block objects containing start line, end line, and the full code block text.
 * including both the opening and closing code block delimiters (i.e., the ``` lines).
 *
 * @param string - The full text of the file.
 * @param sections - An array of SectionCache items representing code block positions.
 * @returns An array of TaskSectionInformation one for each LaTeX/TikZ code block.
 */
export function getLatexCodeBlocksFromString(string: string, sections: SectionCache[]):TaskSectionInformation[] {
  const lines = string.split("\n");
  // Filter sections that are code blocks with latex or tikz language hints.
  sections = sections.filter((section: SectionCache) =>section.type === "code");
  let codeBlocks: { lineStart: number; lineEnd: number; codeBlock: string }[] =[];
  for (const section of sections) {
    const codeBlock = lines.slice(section.position.start.line, section.position.end.line + 1).join("\n");
    if (!codeBlock.split("\n")[0].match(latexCodeBlockNamesRegex)) continue;
    codeBlocks.push({
      lineStart: section.position.start.line,
      lineEnd: section.position.end.line,
      codeBlock: codeBlock,
    });
  }
  codeBlocks = codeBlocks.sort((a, b) => a.lineStart - b.lineStart);
  return codeBlocks;
}
/**
 * extracts all latex code blocks from a file.
 * @param plugin 
 * @param file 
 * @returns 
 */
export async function getLatexCodeBlockSectionsFromFile(app: App,file: TFile){
  const sections = await getFileSections(file, app, true);
  if (!sections) return [];
  const fileText = await app.vault.read(file);
  return getLatexCodeBlocksFromString(fileText, sections);
}