import { App, SectionCache, TAbstractFile, TFile, TFolder } from "obsidian";
import Moshe from "src/main";
import { hashLatexSource, latexCodeBlockNamesRegex } from "../main";
import { getFileSections } from "./sectionCache";
import { parseNestedCodeBlocks, shiftSections } from "obsidian-dev-utils";

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

export function findRelativeFile(
  filePath: string,
  currentDir: TAbstractFile | null,
) {
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
      if (!currentDir.parent)
        throw new Error(
          `Reached root without resolving full path from: ${sourcePath}`,
        );
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
    currentDir.children.find(
      (child) =>
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

export async function getLatexHashesFromFile(file: TFile, app: App) {
  const hashes: string[] = [];
  const sections = await getFileSections(file, app, true);
  if (!sections) return [];
  const lines = (await app.vault.read(file)).split("\n");
  for (const section of sections) {
    if (
      section.type != "code" &&
      lines[section.position.start.line].match(latexCodeBlockNamesRegex) == null
    )
      continue;
    let source = lines
      .slice(section.position.start.line + 1, section.position.end.line)
      .join("\n");
    const hash = hashLatexSource(source);
    hashes.push(hash);
  }
  return hashes;
}

/**
 * converts the sections into code block information with startLine Endline and content
 * @param string
 * @param sections
 * @param accountForNestedCodeBlocks
 * @returns { lineStart: number; lineEnd: number; content: string }[]
 */
export async function getLatexCodeBlocksFromString(
  string: String,
  sections: SectionCache[],
  accountForNestedCodeBlocks = false,
) {
  const lines = string.split("\n");
  // Filter sections that are code blocks with latex or tikz language hints.
  sections = sections.filter(
    (section: SectionCache) =>
      section.type === "code" && //nested code blocks can be in none latex/tikz named code blocks
      (accountForNestedCodeBlocks ||
        lines[section.position.start.line].match(latexCodeBlockNamesRegex)),
  );
  let codeBlocks: { lineStart: number; lineEnd: number; content: string }[] =
    [];
  for (const section of sections) {
    const content = lines
      .slice(section.position.start.line, section.position.end.line + 1)
      .join("\n");
    const startPos = section.position.start;
    if (accountForNestedCodeBlocks) {
      const nestedCodeBlocks = shiftSections(
        startPos.line,
        parseNestedCodeBlocks(content),
      ).map((block) => ({
        lineStart: block.start,
        lineEnd: block.end,
        content: lines.slice(block.start, block.end + 1).join("\n"),
      }));
      codeBlocks.push(...nestedCodeBlocks);
    }
    codeBlocks.push({
      lineStart: section.position.start.line,
      lineEnd: section.position.end.line,
      content,
    });
  }
  if (accountForNestedCodeBlocks) {
    codeBlocks = codeBlocks
      .filter((block) => lines[block.lineStart].match(latexCodeBlockNamesRegex))
      .sort((a, b) => a.lineStart - b.lineStart);
  }
  return codeBlocks;
}
