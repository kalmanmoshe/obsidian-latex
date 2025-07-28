import { App, MarkdownSectionInformation, SectionCache, TAbstractFile, TFile, TFolder } from "obsidian";
import Moshe from "src/main";
import { hashLatexContent, latexCodeBlockNamesRegex } from "../swiftlatexRender";
import { getFileSections } from "./sectionCache";
import { getLatexTaskSectionInfosFromFile, TaskSectionInformation } from "./taskSectionInformation";
/** rooles: 
 * - find = Might be undefined
 * - get = Will always return a value or throw an error
 * - getAll = Will always return an array, might be empty
 * - extract = Will always return a value And ensure no conflicts or throw an error
 * - codeBlock = the code block text including the opening and closing code block delimiters (i.e., the ``` lines).
 * - content = the content of the code block without the opening and closing delimiters.
 * - sectionInfo = MarkdownSectionInformation
 * - taskSectionInfo = TaskSectionInformation
 */
/**
 * 
 * 
 * @param section 
 * @returns 
 */


export async function extractAllSectionsByFile() {
	const files = app.vault.getFiles().filter(f => f.extension === "md");
	const sectionsByFile = await Promise.all(
		files.map(async file => ({
			file,
			codeBlockSections: await getLatexTaskSectionInfosFromFile(file as TFile)
		}))
	);
	return sectionsByFile
}


function getDirRoot(currentDir: TAbstractFile): TFolder {
	while (currentDir.parent) {
		currentDir = currentDir.parent;
	}
	if (!(currentDir instanceof TFolder) || !currentDir.isRoot())
		throw new Error("Root not found");
	return currentDir;
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
export const codeBlockLanguageRegex = /[`~]{3,} *([a-zA-Z0-9_\-+.#\/]+)/;

export function extractCodeBlockMetadata(text: string): { language?: string; name?: string; } {
	const language = text.match(codeBlockLanguageRegex)?.[1];
	const name = extractCodeBlockName(text);
	return { language, name };
}
/**
 * Extracts the language of a code block from its opening line.
 */
export function extractCodeBlockLanguage(codeBlock: string): string | undefined {
	const match = codeBlock.match(codeBlockLanguageRegex);
	return match ? match[1] : undefined;
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
export async function getLatexHashesFromFile(file: TFile) {
	const codeBlocks = await getLatexTaskSectionInfosFromFile(file);
	const hashes = codeBlocks.map((block) => hashLatexContent(block.codeBlock.split("\n").slice(1, -1).join("\n")));
	return hashes;
}
