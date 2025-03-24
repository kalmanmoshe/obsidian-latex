import { App, SectionCache, TAbstractFile, TFile, TFolder } from "obsidian";
import Moshe from "src/main";
import { hashLatexSource, latexCodeBlockNamesRegex } from "./main";

export async function getLatexSourceFromHash(hash: string, plugin: Moshe, file?: TFile): Promise<string> {
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
  
    const findLatexSourceFromHashInFile = async (hash: string, file?: TFile): Promise<string | undefined> => {
      if (!file) return;
      const content = await readFile(file);
      const fileCache = plugin.app.metadataCache.getFileCache(file);
      if (!fileCache?.sections) return;
      const sections = await getLatexCodeBlocksFromString(content, fileCache.sections);
      for (const section of sections) {
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
    const cachedFilePaths = Array.from(plugin.settings.cache.find((entry: [string, Set<string>]) => entry[0] === hash)?.[1] || []);
    for (const filePath of cachedFilePaths) {
      const fileFromCache = plugin.app.metadataCache.getFirstLinkpathDest(filePath, file ? file.path : "");
      if(!fileFromCache) continue;
      const source = await findLatexSourceFromHashInFile(hash, fileFromCache);
      if (source) return source;
    }
  
    // If still not found, search all files in parallel.
    const allFiles = plugin.app.vault.getFiles();
    const checkPromises = allFiles.map(file => findLatexSourceFromHashInFile(hash, file));
    const results = await Promise.all(checkPromises);
    const found = results.find(source => source !== undefined);
    if (found) return found;
  
    throw new Error("Latex source not found for hash: " + hash);
}



export function findRelativeFile(filePath: string, currentDir: TAbstractFile | null) {
    if (!currentDir) {
        throw new Error(`Source file not found`);
    }
    const sourcePath = currentDir.path;
    const separator = filePath.includes("\\") ? "\\" : "/";
    const leadingDotsRegex = new RegExp("^\\.{1,2}(" + separator + ")?");
    const leadingPrefix = filePath.match(leadingDotsRegex)?.[0] || "";
    filePath = filePath.replace(leadingDotsRegex, "");
    if(leadingPrefix&&leadingPrefix[1]){
        for (let i = 0; i < leadingPrefix[1].length; i++) {
            if (!currentDir.parent) throw new Error(`Reached root without resolving full path from: ${sourcePath}`);
            currentDir = currentDir.parent;
        }
    }
    else {
        const pathParts = sourcePath.split(separator).filter(Boolean);
        
    }
    // if dir is the correct file return it
    if (currentDir instanceof TFile) {
        return { file: currentDir, remainingPath: filePath };
    }
    const pathParts = filePath.split(separator).filter(Boolean);
    while (pathParts.length > 1 && currentDir instanceof TFolder) {
        const nextFolder: TAbstractFile|undefined = currentDir.children.find(
            (child) => child instanceof TFolder && child.name === pathParts[0]
        );
        if(!nextFolder||!(nextFolder instanceof TFolder))break;
        currentDir = nextFolder;
        pathParts.shift();
        
    }
    if (!(currentDir instanceof TFolder)) {
        console.log("currentDir",currentDir)
        throw new Error(`Invalid folder: ${pathParts[0]}`);
    }
    const fileName = pathParts[0];
    const file =
        currentDir.children.find(
            (child) => child instanceof TFile && child.name === fileName
        ) ??
        currentDir.children.find(
            (child) =>
                child instanceof TFile &&
                child.basename === fileName &&
                child.name.endsWith(".md")
        );
    if (!file) {
        throw new Error(`File not found: ${fileName}`);
    }
    pathParts.shift();
    if(pathParts.length>1||!(file instanceof TFile))throw new Error("Path not found");
    return {
        file,
        remainingPath: pathParts.length>0 ? pathParts[0] : undefined,
    };
}




export async function getLatexHashesFromFile(file: TFile,app:App) {
    const hashes: string[] = [];
    const sections = app.metadataCache.getFileCache(file)?.sections
    if (sections != undefined) {
        const lines = (await app.vault.read(file)).split('\n');
        for (const section of sections) {
            if (section.type != "code" && lines[section.position.start.line].match(latexCodeBlockNamesRegex) == null) continue;
            let source = lines.slice(section.position.start.line + 1, section.position.end.line).join("\n");
            const hash = hashLatexSource(source);
            hashes.push(hash);
        }
    }
    return hashes;
}


export async function getLatexCodeBlocksFromString(string: String,sections: SectionCache[]) {
    const lines = string.split('\n');
    // Filter sections that are code blocks with latex or tikz language hints.
    sections = sections.filter((section: SectionCache) =>
    section.type === "code" &&
    lines[section.position.start.line].match(latexCodeBlockNamesRegex)
    );
    const codeBlocks: {lineStart: number, lineEnd: number, content: string}[] = sections.map((section) => {
    return {
        lineStart: section.position.start.line,
        lineEnd: section.position.end.line,
        content: lines.slice(section.position.start.line, section.position.end.line+1).join("\n")
    }
    });
    return codeBlocks;
}

export function findMultiLineStartIndex(text: string, searchString: string) {
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
            return i; // Return the 0-based start line index
        }
    }
    return -1; // Return -1 if not found
}

export function getSectionCacheFromString(sectionsCache: SectionCache[],source: string,target: string){
    const sourceIndex=findMultiLineStartIndex(source,target);
    if(sourceIndex===-1)throw new Error("source not found in file");
    if(sourceIndex===0)throw new Error("source index is 0 which is invalid (i don't know why this happens)");
    const codeBlockStartLine=sourceIndex-1;
    return sectionsCache.find((section)=>section.position.start.line===codeBlockStartLine);
}