import { App, MarkdownSectionInformation, SectionCache, TAbstractFile, TFile, TFolder } from "obsidian";
import Moshe from "src/main";
import { hashLatexSource, latexCodeBlockNamesRegex } from "../swiftlatexRender";
import { getFileSections } from "./sectionCache";

export async function getLatexSourceFromHash(
  hash: string,
  plugin: Moshe,
  file?: TFile,
): Promise<string> {
  // Cache for file content to avoid multiple disk reads.
  const fileContentCache = new Map<string, string>();

  // Helper function that reads a file and caches its content.
  const readFile = async (file: TFile): Promise<string> => {
    if (!fileContentCache.has(file.path)) {
      const content = await plugin.app.vault.read(file);
      fileContentCache.set(file.path, content);
    }
    return fileContentCache.get(file.path)!;
  };

  const findLatexSourceFromHashInFile = async (
    hash: string,
    file?: TFile,
  ): Promise<string | undefined> => {
    if (!file) return;
    const content = await readFile(file);
    const sections = await getFileSections(file, plugin.app, true);
    if (!sections) return;
    const blockSections = await getLatexCodeBlocksFromString(content, sections);
    for (const section of blockSections) {
      const codeSection = section.content.split("\n").slice(1, -1).join("\n");
      if (hashLatexSource(codeSection) === hash) {
        return codeSection;
      }
    }
  };

  // Check provided file first.
  const fromProvidedFile = await findLatexSourceFromHashInFile(hash, file);
  if (fromProvidedFile) return fromProvidedFile;

  // Use cache to narrow down file paths.
  const cachedFilePaths = Array.from(
    plugin.settings.cache.find(
      (entry: [string, Set<string>]) => entry[0] === hash,
    )?.[1] || [],
  );
  for (const filePath of cachedFilePaths) {
    const fileFromCache = plugin.app.metadataCache.getFirstLinkpathDest(
      filePath,
      file ? file.path : "",
    );
    if (!fileFromCache) continue;
    const source = await findLatexSourceFromHashInFile(hash, fileFromCache);
    if (source) return source;
  }

  // If still not found, search all files in parallel.
  const allFiles = plugin.app.vault.getFiles();
  const checkPromises = allFiles.map((file) =>
    findLatexSourceFromHashInFile(hash, file),
  );
  const results = await Promise.all(checkPromises);
  const found = results.find((source) => source !== undefined);
  if (found) return found;

  throw new Error("Latex source not found for hash: " + hash);
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
 * @param text - The full text of the code block
 * @returns The extracted name if matched, otherwise undefined
 */
export function extractCodeBlockName(text: string): string | undefined {
  const nameMatch = text.split("\n")[0]
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
  const codeBlocks = await getLatexCodeBlocksFromFile(app, file);
  const hashes = codeBlocks.map((block) => hashLatexSource(block.content.split("\n").slice(1, -1).join("\n")));
  return hashes;
}

/**
 * Converts code sections into LaTeX code block objects containing start line, end line, and full content.
 * The content includes both the opening and closing code block delimiters (i.e., the ``` lines).
 *
 * @param string - The full text content of the file.
 * @param sections - An array of SectionCache items representing code block positions.
 * @returns An array of objects with { lineStart, lineEnd, content } for each LaTeX/TikZ code block.
 */
export function getLatexCodeBlocksFromString(string: string, sections: SectionCache[]):MarkdownSectionInformation[] {
  const lines = string.split("\n");
  // Filter sections that are code blocks with latex or tikz language hints.
  sections = sections.filter((section: SectionCache) =>section.type === "code");
  let codeBlocks: { lineStart: number; lineEnd: number; content: string }[] =[];
  for (const section of sections) {
    const content = lines.slice(section.position.start.line, section.position.end.line + 1).join("\n");
    if (!content.split("\n")[0].match(latexCodeBlockNamesRegex)) continue;
    codeBlocks.push({
      lineStart: section.position.start.line,
      lineEnd: section.position.end.line,
      content,
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
export async function getLatexCodeBlocksFromFile(app: App,file: TFile){
  const sections = await getFileSections(file, app, true);
  if (!sections) return [];
  const content = await app.vault.read(file);
  return getLatexCodeBlocksFromString(content, sections);
}