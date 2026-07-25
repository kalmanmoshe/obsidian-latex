import { SectionCache, TFile } from 'obsidian';
import { parseNestedCodeBlocks, shiftSections } from 'obsidian-dev-utils';
import { getEditorTextForPath } from '../task/latexTask';

//get a better name later
export async function getFileSectionsFromPath(path: string) {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) throw new Error('File not found');
	//we cant use the file cache
	const source = getEditorTextForPath(file.path) ?? await app.vault.read(file);
	const sections = await getCodeBlockSectionsFromFile(file);
	if (!sections) throw new Error('No sections found in metadata');
	return {
		file,
		fileText: source,
		sections: parseCodeBlockSections(source)
	};
}

async function getCodeBlockSectionsFromFile(
	file: TFile,
): Promise<SectionCache[]> {
	const source = getEditorTextForPath(file.path) ?? await app.vault.read(file);
	return parseCodeBlockSections(source);
}

function parseCodeBlockSections(fileText: string) {
	const nestedCodeBlocks = shiftSections(
		0,
		parseNestedCodeBlocks(fileText),
	).map((section) =>
		createSectionCache(fileText, section.start, section.end),
	);
	return nestedCodeBlocks.sort(
		(a, b) => a.position.start.line - b.position.start.line,
	);
}

function createSectionCache(
	source: string,
	startLine: number,
	endLine: number,
): SectionCache {
	return {
		type: 'code',
		position: {
			start: {
				line: startLine,
				col: 0,
				offset: getOffsetForLine(source, startLine),
			},
			end: {
				line: endLine,
				col: source.split('\n')[endLine].trim().length,
				offset: getOffsetForLine(source, endLine),
			},
		},
	};
}

function getOffsetForLine(source: string, lineNumber: number): number {
	return source
		.split('\n')
		.slice(0, lineNumber)
		.reduce((acc, curr) => acc + curr.length + 1, 0); // +1 for \n
}