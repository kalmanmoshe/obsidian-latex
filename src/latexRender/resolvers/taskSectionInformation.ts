import { MarkdownSectionInformation, SectionCache, TFile } from "obsidian";
import { Line } from "@codemirror/state";
import { getFileSections } from "./sectionCache";
import Moshe from "src/main";
import { hashLatexSource, latexCodeBlockNamesRegex } from "../swiftlatexRender";
export interface TaskSectionInformation {
    /**
     * The line start of the source in the file. (zero-based index)
     */
    lineStart: number;
    /**
     * The line end of the source in the file. (zero-based index)
     */
    lineEnd: number;
    /**
     * the source code of the task (the code block) including the delimiters.
     */
    codeBlock: string;
}

/**
 * Returns the most nested (deepest) section info that contains a given line.
 */
function findInnermostSectionInfo(
    sectionInfos: TaskSectionInformation[],
    lineIndex: number,
    lineEnd?: number,
): TaskSectionInformation | undefined {
    return sectionInfos.filter((sec) =>
        sec.lineStart <= lineIndex &&
        sec.lineEnd >= lineIndex &&
        (lineEnd ? sec.lineEnd <= lineEnd : true)
    ).sort((a, b) => b.lineStart - a.lineStart)[0];
}

export function sectionToTaskSectionInfo(section: MarkdownSectionInformation): TaskSectionInformation {
    return {
        lineStart: section.lineStart,
        lineEnd: section.lineEnd,
        codeBlock: section.text.split("\n").slice(section.lineStart, section.lineEnd + 1).join("\n"),
    };
}

export async function codeMirrorLineToTaskSectionInfo(file: TFile, line: Line) {
    const sectionInfos = await getLatexTaskSectionInfosFromFile(file);
    return findInnermostSectionInfo(sectionInfos, line.number);
}

export async function findTaskSectionInfoFromContentInFile(file: TFile, content: string) {
    const blockSections = await getLatexTaskSectionInfosFromFile(file)
    for (const section of blockSections) {
        const sectionContent = section.codeBlock.split("\n").slice(1, -1).join("\n");
        if (sectionContent === content) {
            return section;
        }
    }
}
export async function getTaskSectionInfoFromHash(plugin: Moshe, hash: string): Promise<TaskSectionInformation> {
    const filePathsCache = new Set<string>();

    // Use cache to narrow down file paths.
    const cachedFilePaths = plugin.swiftlatexRender.cache.getCachedFilePathsForHash(hash);
    for (const filePath of cachedFilePaths) {
        if (filePathsCache.has(filePath)) continue;
        filePathsCache.add(filePath);
        const fileFromCache = app.metadataCache.getFirstLinkpathDest(filePath, "");
        if (!fileFromCache) continue;
        const info = await findTaskSectionInfoFromHashInFile(fileFromCache, hash);
        if (info) return info;
    }

    // If still not found, search all files in parallel.
    const allFiles = app.vault.getFiles();
    for (const file of allFiles) {
        if (filePathsCache.has(file.path)) continue; // Skip already checked files
        filePathsCache.add(file.path);
        const info = await findTaskSectionInfoFromHashInFile(file, hash);
        if (info) { return info }
    }
    throw new Error("Latex info not found for hash: " + hash);
}

/**
 * extracts all latex code blocks from a file.
 * @param plugin 
 * @param file 
 * @returns 
 */
export async function getLatexTaskSectionInfosFromFile(file: TFile) {
    const sections = await getFileSections(file, true);
    if (!sections) return [];
    const fileText = await app.vault.read(file);
    return getLatexTaskSectionInfosFromString(fileText, sections);
}

/**
 * Converts code sections into LaTeX code block objects containing start line, end line, and the full code block text.
 * including both the opening and closing code block delimiters (i.e., the ``` lines).
 *
 * @param string - The full text of the file.
 * @param sections - An array of SectionCache items representing code block positions.
 * @returns An array of TaskSectionInformation one for each LaTeX/TikZ code block.
 */
export function getLatexTaskSectionInfosFromString(string: string, sections: SectionCache[]): TaskSectionInformation[] {
    const lines = string.split("\n");
    // Filter sections that are code blocks with latex or tikz language hints.
    sections = sections.filter((section: SectionCache) => section.type === "code");
    let codeBlocks: { lineStart: number; lineEnd: number; codeBlock: string }[] = [];
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

export async function findTaskSectionInfoFromHashInFile(file: TFile, hash: string) {
    const blockSections = await getLatexTaskSectionInfosFromFile(file)
    for (const section of blockSections) {
        const sectionContent = section.codeBlock.split("\n").slice(1, -1).join("\n");
        if (hashLatexSource(sectionContent) === hash) {
            return section;
        }
    }
}