import { TFile } from "obsidian";
import { latexCodeBlockNamesRegex } from "../swiftlatexRender";
import { getLatexTaskSectionInfosFromFile } from "./taskSectionInformation";
import { codeBlockToContent } from "./sectionUtils";
import { hashLatexContent } from "../cache/resultFileCache";
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
	const hashes = codeBlocks.map((block) => hashLatexContent(codeBlockToContent(block.codeBlock)));
	return hashes;
}
