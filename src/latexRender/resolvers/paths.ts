import { App, normalizePath, TAbstractFile, TFile, TFolder } from 'obsidian';
import { getLatexTaskSectionInfosFromFile } from './taskSectionInformation';
import { extractCodeBlockMetadata, extractCodeBlockName } from './latexSourceFromFile';
import { codeBlockToContent } from 'obsidian-dev-utils';
import { LatexSourceType } from 'src/dependency/LatexDependency';
import { getLatexCodeBlockDefinition } from '../codeBlockTypes';

export const CODE_BLOCK_NAME_SEPARATOR = '#';
const TRADITIONAL_PATH_SEPARATORS = ['/', '\\'];
const PATH_SEPARATORS = [...TRADITIONAL_PATH_SEPARATORS, CODE_BLOCK_NAME_SEPARATOR];
const PATH_SEPARATORS_REGEX = new RegExp(PATH_SEPARATORS.join('|'), 'g');
const CODE_BLOCK_NAME_SEPARATOR_REGEX = new RegExp(CODE_BLOCK_NAME_SEPARATOR, 'g');

export function resolvePathRelToVault(path: string, currentPath: string, app: App): string {
	const { file, remainingPath } = findRelativeFile(path, currentPath, app);
	const absPath = file.path;
	if (!remainingPath) return absPath;

	if (!(file instanceof TFile)) {
		throw new Error(`Invalid path: ${remainingPath}`);
	}

	if (!isValidFileStem(remainingPath)) {
		throw new Error(`Invalid file stem: ${remainingPath}`);
	}

	const codeBlockName = remainingPath + '.tex';
	return absPath + CODE_BLOCK_NAME_SEPARATOR + codeBlockName;
}

export async function resolveDependencyContent(path: string, app: App): Promise<{ content: string, sourceType: LatexSourceType }> {
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
	if (parts.length === 0) return {
		content: fileText,
		sourceType: LatexSourceType.File
	};

	const codeBlockStem = extractStemAndExtension(parts.shift()!).stem;

	const codeBlocks = await getLatexTaskSectionInfosFromFile(file, app);
	const potentialTargets = codeBlocks.filter(
		(block) => extractCodeBlockName(block.codeBlock) === codeBlockStem,
	);
	const target = potentialTargets.shift();
	if (!target) {
		throw new Error(
			'No code block found with name: ' + codeBlockStem + ' in file: ' + file.path,
		);
	}
	if (potentialTargets.length > 0) {
		throw new Error(
			`Multiple code blocks found with name: ${codeBlockStem} in file: ${file.path}`,
		);
	}

	const language = extractCodeBlockMetadata(target.codeBlock).language ?? "";
	return {
		content: codeBlockToContent(target.codeBlock),
		sourceType: getLatexCodeBlockDefinition(language).sourceType,
	};
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
function findRelativeFile(filePath: string, currentPath: string, app: App) {
	if (currentPath.contains(CODE_BLOCK_NAME_SEPARATOR)) {
		throw new Error(
			`Current path must be a file and not contain code block separator: ${CODE_BLOCK_NAME_SEPARATOR}`,
		);
	}

	const start = app.vault.getAbstractFileByPath(currentPath);
	if (!(start instanceof TFile)) {
		throw new Error('Source file not found');
	}

	const [rawFilePath, remainingPath] = filePath.split(CODE_BLOCK_NAME_SEPARATOR, 2);

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
		const next = current.children.find((c) => c instanceof TFolder && c.name === parts[0]);

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
			(c.name === fileName || (c.basename === fileName && c.name.endsWith('.md'))),
	);

	if (!file) {
		console.error(`File not found: ${fileName} in folder: ${current.path}`, {
			filePath,
			currentPath,
			current,
			parts,
			fileName,
			children: current.children.map((c) => c.name),
		});
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
	} else if (fileOrFolder instanceof TFolder) {
		return fileOrFolder; // can be only TFolder here
	} else {
		throw new Error(`Invalid file or folder: ${fileOrFolder.path}`);
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
				throw new Error(`Reached root without resolving full path from: ${start.path}`);
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

export function extractStemAndExtension(path: string) {
	if (path.split(CODE_BLOCK_NAME_SEPARATOR).length > 2) {
		throw new Error(
			"Invalid path format. Use '" +
			CODE_BLOCK_NAME_SEPARATOR +
			"' to separate file path and code block name.",
		);
	}
	const parts = path
		.split(CODE_BLOCK_NAME_SEPARATOR_REGEX)
		.pop()
		?.split(PATH_SEPARATORS_REGEX)
		.pop()
		?.split('.');
	if (!parts || parts.length < 2) {
		throw new Error(`Invalid path format. Expected a file name with extension: ${path}`);
	}

	const extension = parts.pop()!;
	const stem = parts.join('.');

	return { stem, extension };
}

/**
 * Extracts the file name from a full cache file path.
 * Example: "/home/user/.obsidian/latex-render-cache/someFile.pdf" -> "someFile.pdf"
 * @param path The full path to the cache file.
 */
export function extractFileName(path: string): string {
	const parts = path.split(PATH_SEPARATORS_REGEX);
	return parts.pop()!;
}

export function isValidFileStem(stem: unknown): boolean {
	if (typeof stem !== 'string') return false;

	if (
		stem === '' ||
		stem.length > 255 ||
		/[<>:"/\\|?*]/.test(stem) ||
		/[. ]$/.test(stem)
	) {
		return false;
	}

	// Check for control characters (ASCII codes 0-31)
	if ([...stem].some((char) => char.charCodeAt(0) < 32)) {
		return false;
	}

	const upper = stem.toUpperCase();
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

export function joinPaths(...paths: string[]): string {
	return normalizePath(
		paths
			.filter(Boolean)
			.map((p) => p.replace(/^\/+|\/+$/g, ''))
			.join('/'),
	);
}
