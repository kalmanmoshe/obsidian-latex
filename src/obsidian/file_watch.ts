// credit to The amazing people at obsidian latex suite which this code is influenced from

import { dir } from 'console';
import { on } from 'events';
import {
	Vault,
	TFile,
	TFolder,
	TAbstractFile,
	Notice,
	debounce,
} from 'obsidian';
import LatexRender from 'src/main';

/**
 * Checks if a file is located within a specified folder.
 * @param dir - The folder to check against.
 * @param file - The file to check.
 * @returns {boolean} - True if the file is within the folder, false otherwise.
 */
function isFileInFolder(dir: TFolder, file: TFile) {
	let cur = file.parent;
	let cnt = 0;

	while (cur && !cur.isRoot() && cnt < 100) {
		if (cur.path === dir.path) return true;

		cur = cur.parent;
		cnt++;
	}

	return false;
}

const REFRESH_TIMEOUT_MS = 500;

const refreshMathJaxFromFiles = debounce(
	async (plugin: LatexRender) => {
		if (!plugin.settings.mathjaxPreambleEnabled) {
			return;
		}
		await plugin.loadMathJax();
	},
	REFRESH_TIMEOUT_MS,
	true,
)

const refreshLatexFromFiles = debounce(
	async (plugin: LatexRender) => {
		if (!plugin.settings.mathjaxPreambleEnabled) {
			return;
		}
		await plugin.processLatexPreambles(false, true);
	},
	REFRESH_TIMEOUT_MS,
	true,
)


/** 
 * chack if the file is a vfs/mathjax preamble file
 * @param plugin
 * @param file
 * @returns
 */
const checkFileMonitoringStatus = (plugin: LatexRender, file: TFile) => {
	const {
		compilerVfsEnabled,
		mathjaxPreambleEnabled,
		mathjaxPreambleFileLocation,
	} = plugin.settings;
	const match = (enabled: boolean, dir: string) => {
		const possibleFolder = app.vault.getAbstractFileByPath(dir);
		let isInFolder = false;
		if (possibleFolder && possibleFolder instanceof TFolder) {
			isInFolder = isFileInFolder(possibleFolder, file);
		}
		return enabled && (isInFolder || file.path === dir);
	};
	return {
		autoLoadedMonitored: compilerVfsEnabled && plugin.swiftlatexRender.vfs.isNeededForAutoUse(file.path),
		mathJaxMonitored: match(mathjaxPreambleEnabled, mathjaxPreambleFileLocation),
	};
};

export const onFileChange = (plugin: LatexRender, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	const fileMonitoringStatus = checkFileMonitoringStatus(plugin, file);

	if (fileMonitoringStatus.mathJaxMonitored) {
		refreshMathJaxFromFiles(plugin);
	} 

	if (fileMonitoringStatus.autoLoadedMonitored) {
		refreshLatexFromFiles(plugin);
	}
	
};

export const onFileCreate = (plugin: LatexRender, file: TAbstractFile) => {
	onFileChange(plugin, file);
};

export const onFileDelete = (plugin: LatexRender, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	// There's no point checking mathjax over here as it won't do anything you cannot delete the file from cache Only change it
	const wasVfsFile =
		plugin.settings.compilerVfsEnabled &&
		plugin.swiftlatexRender.vfs.hasFile(file.path);

	if (wasVfsFile) {
		refreshLatexFromFiles(plugin);
	}
	
};

function* generateFilesWithin(fileOrFolder: TAbstractFile): Generator<TFile> {
	if (fileOrFolder instanceof TFile) yield fileOrFolder;
	else if (fileOrFolder instanceof TFolder)
		for (const child of fileOrFolder.children)
			yield* generateFilesWithin(child);
}

function getFilesWithin(vault: Vault, path: string): Set<TFile> {
	const fileOrFolder = vault.getAbstractFileByPath(path);

	if (fileOrFolder === null) {
		return new Set();
	}
	const files = generateFilesWithin(fileOrFolder);
	return new Set(files);
}

interface FileSets {
	mathjaxPreambleFiles: Set<TFile>;
	latexVirtualFiles: Set<TFile>;
}

export function getFileSets(plugin: LatexRender): FileSets {
	const locations = [
		plugin.settings.mathjaxPreambleFileLocation,
		plugin.settings.autoloadedVfsFilesDir,
	];
	const [mathjaxPreambleFiles, latexVirtualFiles] = locations.map((path) =>
		getFilesWithin(app.vault, path),
	);
	return { mathjaxPreambleFiles, latexVirtualFiles };
}

export type PreambleFile = { path: string; name: string; content: string };

export async function getPreambleFromFiles(
	plugin: LatexRender,
	files: Set<TFile>,
): Promise<PreambleFile[]> {
	const fileContents: { path: string; name: string; content: string }[] = [];

	for (const file of files) {
		try {
			fileContents.push({
				path: file.path, //path to the root of the vault
				name: file.name,
				content: await app.vault.cachedRead(file),
			});
		} catch (e) {
			console.error(`Failed to fetch ${file.path} from memfs: ${e}`);
			new Notice(`Failed to fetch ${file.path} from memfs: ${e}`);
		}
	}
	return fileContents;
}
