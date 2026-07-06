import { TAbstractFile, TFile, TFolder } from 'obsidian';
import { getLatexTaskSectionInfosFromFile } from './taskSectionInformation';
import { extractCodeBlockName } from './latexSourceFromFile';
import { codeBlockToContent } from 'obsidian-dev-utils';

export const CODE_BLOCK_NAME_SEPARATOR = '#';
const TRADITIONAL_PATH_SEPARATORS = ['/', '\\'];
const PATH_SEPARATORS = [
	...TRADITIONAL_PATH_SEPARATORS,
	CODE_BLOCK_NAME_SEPARATOR,
];
const PATH_SEPARATORS_REGEX = new RegExp(PATH_SEPARATORS.join('|'), 'g');
const CODE_BLOCK_NAME_SEPARATOR_REGEX = new RegExp(
	CODE_BLOCK_NAME_SEPARATOR,
	'g',
);

export function resolvePathRelToVault(
	path: string,
	currentPath: string,
): string {
	const { file, remainingPath } = findRelativeFile(path, currentPath);
	const absPath = file.path;
	if (!remainingPath) return absPath;

	if (!(file instanceof TFile)) {
		throw new Error(`Invalid path: ${remainingPath}`);
	}
	
	if (!isValidFileBasename(remainingPath)) {
		throw new Error(`Invalid file basename: ${remainingPath}`);
	}
	
	const codeBlockName = remainingPath + '.tex';
	return absPath + CODE_BLOCK_NAME_SEPARATOR + codeBlockName;
}

/**
 *
 * @param path The path to the file, relative to the vault root.
 * @returns
 */
export async function getFileContent(path: string): Promise<string> {
	const parts = path.split(CODE_BLOCK_NAME_SEPARATOR);
	if (parts.length > 2 || parts.length === 0) {
		throw new Error(
			"Invalid path format. Use '" +
				CODE_BLOCK_NAME_SEPARATOR +
				"' to separate file path and code block name.",
		);
	}
	const filePath = parts.shift()!;
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		throw new Error(`File not found: ${filePath}`);
	}
	const fileText = await app.vault.read(file);
	if (parts.length === 0) return fileText;
	const codeBlockBaseName = extractBasenameAndExtension(
		parts.shift()!,
	).basename;

	const codeBlocks = await getLatexTaskSectionInfosFromFile(file);
	const potentialTargets = codeBlocks.filter(
		(block) => extractCodeBlockName(block.codeBlock) === codeBlockBaseName,
	);
	const target = potentialTargets.shift();
	if (!target) {
		throw new Error(
			'No code block found with name: ' +
				codeBlockBaseName +
				' in file: ' +
				file.path,
		);
	}
	if (potentialTargets.length > 0) {
		throw new Error(
			`Multiple code blocks found with name: ${codeBlockBaseName} in file: ${file.path}`,
		);
	}
	return codeBlockToContent(target.codeBlock);
}

/**
 * Finds a file relative to the current file.
 *
 * The path is resolved from the folder containing `currentPath`.
 * It supports `.` and `..` path segments.
 *
 * Code block / section references must be explicit using
 * `CODE_BLOCK_NAME_SEPARATOR`, for example:
 *
 * - `#blockName`
 * - `file.md#blockName`
 * - `../folder/file.md#blockName`
 *
 * @param filePath Path to the target file, optionally followed by a code block name.
 * @param currentPath Path of the source file used as the relative starting point.
 * @returns The resolved file and optional code block / section name.
 */
export function findRelativeFile(filePath: string, currentPath: string) {
	if (currentPath.contains(CODE_BLOCK_NAME_SEPARATOR)) {
		throw new Error(
			`Current path must be a file and not contain code block separator: ${CODE_BLOCK_NAME_SEPARATOR}`,
		);
	}

	const start = app.vault.getAbstractFileByPath(currentPath);
	if (!(start instanceof TFile)) {
		throw new Error('Source file not found');
	}

	const [rawFilePath, remainingPath] = filePath.split(
		CODE_BLOCK_NAME_SEPARATOR,
		2,
	);

	// "#block" means block inside the current file
	if (!rawFilePath) {
		return {
			file: start,
			remainingPath,
		};
	}

	let current = resolveFolder(start);

	const resolved = resolveStartingFolder(rawFilePath, current, start);

	current = resolved.folder;
	const parts = resolved.parts;

	while (parts.length > 1 && current instanceof TFolder) {
		const next = current.children.find(
			(c) => c instanceof TFolder && c.name === parts[0],
		);

		if (!(next instanceof TFolder)) break;

		current = next;
		parts.shift();
	}

	if (!(current instanceof TFolder)) {
		throw new Error(`Invalid folder: ${parts[0]}`);
	}
	
	const fileName = parts.shift();

	if (!fileName) {
		throw new Error(`File path is empty: ${filePath}`);
	}

	const file = current.children.find(
		(c) =>
			c instanceof TFile &&
			(c.name === fileName ||
				(c.basename === fileName && c.name.endsWith('.md'))),
	);

	if (!file) {
		throw new Error(`File not found: ${fileName}`);
	}

	if (parts.length > 0) {
		throw new Error(`Path not found: ${parts.join('/')}`);
	}

	return {
		file,
		remainingPath,
	};
}

function resolveFolder(fileOrFolder: TAbstractFile): TFolder {
	if (fileOrFolder instanceof TFile) {
		if (!fileOrFolder.parent) {
			throw new Error(`Source file has no parent folder: ${fileOrFolder.path}`);
		}
		return fileOrFolder.parent;
	} else {
		return fileOrFolder as TFolder; // can be only TFolder here
	}
}

function resolveStartingFolder(
	filePath: string,
	current: TFolder,
	start: TAbstractFile,
): { folder: TFolder; parts: string[] } {
	const parts = filePath.split(/[\\/]+/).filter(Boolean);

	while (parts.length > 0) {
		const part = parts[0];

		if (part === '.') {
			parts.shift();
			continue;
		}

		if (part === '..') {
			if (!current.parent) {
				throw new Error(
					`Reached root without resolving full path from: ${start.path}`,
				);
			}

			current = current.parent;
			parts.shift();
			continue;
		}

		break;
	}

	return {
		folder: current,
		parts,
	};
}

export function extractBasenameAndExtension(path: string) {
	if (path.split(CODE_BLOCK_NAME_SEPARATOR).length > 2) {
		throw new Error(
			"Invalid path format. Use '" +
				CODE_BLOCK_NAME_SEPARATOR +
				"' to separate file path and code block name.",
		);
	}
	const parts = path
		.split(CODE_BLOCK_NAME_SEPARATOR_REGEX)
		.pop()!
		.split(PATH_SEPARATORS_REGEX)
		.pop()
		?.split('.')!;
	const extension = parts.pop()!;
	const basename = parts.join('.');

	return { basename, extension };
}

export function extractDir(path: string): string {
	const parts = path.split(PATH_SEPARATORS_REGEX);
	parts.pop();
	return parts.join('/');
}

export function isValidFileBasename(basename: any): boolean {
	if (typeof basename !== 'string') return false;
	basename = basename.trim();
	if (
		basename === '' ||
		basename.length > 255 ||
		/[<>:"/\\|?*\x00-\x1F]/.test(basename) ||
		/[. ]$/.test(basename)
	) {
		return false;
	}

	const upper = basename.toUpperCase();
	const reserved = [
		'CON',
		'PRN',
		'AUX',
		'NUL',
		...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
		...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
	];
	if (reserved.includes(upper)) return false;
	return true;
}
