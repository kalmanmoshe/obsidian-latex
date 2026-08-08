import { App, TFile } from 'obsidian';
import { latexCodeBlockLanguageRegex } from '../latexRenderer';
import { getLatexTaskSectionInfosFromFile } from './taskSectionInformation';
import { codeBlockLanguageRegex, codeBlockToContent } from 'obsidian-dev-utils';
import { hashLatexContent } from '../cache/compilerCache';
import { extractCodeBlockLanguage } from 'obsidian-dev-utils';
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

export async function extractAllSectionsByFile(app: App) {
	const files = app.vault.getFiles().filter((f) => f.extension === 'md');
	const sectionsByFile = await Promise.all(
		files.map(async (file) => ({
			file,
			codeBlockSections: await getLatexTaskSectionInfosFromFile(file, app),
		})),
	);
	return sectionsByFile;
}

export function extractCodeBlockMetadata(text: string): {
	language?: string;
	name?: string;
} {
	const language = text.match(codeBlockLanguageRegex)?.[1];
	const name = extractCodeBlockName(text);
	return { language, name };
}

/**
 * Attempts to extract the name of a LaTeX code block from the first line of the given text.
 * @param codeBlock - The full text of the code block
 * @returns The extracted name if matched, otherwise undefined
 */
export function extractCodeBlockName(codeBlock: string): string | undefined {
	const nameMatch = codeBlock
		.split('\n')[0]
		.replace(latexCodeBlockLanguageRegex, '')
		.trim()
		.match(/name: *([-\wא-ת.]+)/); // Match names with letters, numbers, underscores, dashes, and Hebrew characters
	return nameMatch ? nameMatch[1] : undefined;
}
/**
 * Extracts all latex code blocks from a file and returns their hashes.
 * @param file
 * @param app
 * @returns
 */
export async function getLatexHashesFromFile(file: TFile, app: App) {
	const codeBlocks = await getLatexTaskSectionInfosFromFile(file, app);
	const hashes = codeBlocks.map((block) => ({
		hash: hashLatexContent(codeBlockToContent(block.codeBlock)),
		name: extractCodeBlockLanguage(block.codeBlock)! //(the code blocks are already filtered to be latex or tikz, so this should always return a value)
	}));
	return hashes;
}
