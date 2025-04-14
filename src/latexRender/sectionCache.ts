import { App, SectionCache, TFile } from "obsidian";
/**
 * get the sections of a file from the metadata cache with the option to account for nested code blocks.
 * @param file 
 * @param app 
 * @param accountForNestedCodeBlocks 
 * @returns 
 */
export function getFileSections(file: TFile,app: App,accountForNestedCodeBlocks = false): Promise<SectionCache[]> | SectionCache[] | undefined {
    const fileCache = app.metadataCache.getFileCache(file);
    if (!fileCache?.sections) return undefined;
  
    if (!accountForNestedCodeBlocks) {
      return fileCache.sections;
    }
    return getFileSectionsWithNested(file, app, fileCache.sections);
}
  
async function getFileSectionsWithNested(file: TFile,app: App,sectionsBase: SectionCache[]): Promise<SectionCache[]> {
    const sections: SectionCache[] = [];
    const source = await app.vault.read(file);
    const lines = source.split("\n");
    for (const section of sectionsBase) {
      sections.push(section);
      if (section.type !== "code") continue;
  
      const startPos = section.position.start;
      const content = lines.slice(startPos.line + 1, section.position.end.line).join("\n");
      const nestedCodeBlocks = parseNestedCodeBlocks(
        content,
        startPos.line + 1,
        getOffsetForLine(source, startPos.line + 1)
      );
      sections.push(...nestedCodeBlocks);
    }

    return sections.sort((a, b) => a.position.start.line - b.position.start.line);
}


function getOffsetForLine(source: string, lineNumber: number): number {
	return source
		.split("\n")
		.slice(0, lineNumber)
		.reduce((acc, curr) => acc + curr.length + 1, 0); // +1 for \n
}


function findMultiLineStartIndex(text: string, searchString: string) {
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

export function getSectionCacheOfString(sectionsCache: SectionCache[],source: string,target: string):SectionCache|undefined {
    const sourceIndex=findMultiLineStartIndex(source,target);
    console.log("sourceIndex",sourceIndex);
    if(sourceIndex===-1)throw new Error("source not found in file");
    if(sourceIndex===0)throw new Error("source index is 0 which is invalid (i don't know why this happens)");
    const codeBlockStartLine=sourceIndex-1;
    const section=sectionsCache.find((section)=>section.position.start.line===codeBlockStartLine);
    return section;
}

const codeBlockDeliminatorRegex = /^\s*(`|~){3,}/;
export function parseNestedCodeBlocks(source: string, lineShiftFactor: number,offsetShiftFactor: number): SectionCache[] {
    const codeBlocks: SectionCache[] = [];
    const lines = source.split("\n");
    let index = 0;

    while (index < lines.length) {
        // Find the next code block start
        const startLineIndex = lines.slice(index).findIndex(line => line.match(codeBlockDeliminatorRegex));
        if (startLineIndex === -1) break;

        const absoluteStartIndex = index + startLineIndex;
        const deliminator = lines[absoluteStartIndex].trim().match(codeBlockDeliminatorRegex)?.[0] || null;

        // Find the matching end delimiter
        const remainingLines = lines.slice(absoluteStartIndex + 1);
        const relativeEndIndex = remainingLines.findIndex(line => line.trim() === deliminator);
        if (!deliminator||relativeEndIndex === -1) break;
        const absoluteEndIndex = absoluteStartIndex + 1 + relativeEndIndex;
        const content = lines.slice(absoluteStartIndex, absoluteEndIndex+1).join("\n");
        codeBlocks.push(...parseNestedCodeBlocks(content.split("\n").slice(1, -1).join("\n"), lineShiftFactor + absoluteStartIndex + 1, offsetShiftFactor + getOffsetForLine(source, absoluteStartIndex)));

        // Add current block
        codeBlocks.push({
            type: "code",
            position: {
                start: { line: lineShiftFactor+absoluteStartIndex, col: 0, offset: offsetShiftFactor + getOffsetForLine(source, absoluteStartIndex) },
                end: { line: lineShiftFactor + absoluteEndIndex, col: deliminator.length,offset: offsetShiftFactor+getOffsetForLine(source, absoluteEndIndex)+deliminator.length },
            },
        });

        // Move index to after the end of this block
        index = absoluteEndIndex + 1;
    }
    return codeBlocks;
}