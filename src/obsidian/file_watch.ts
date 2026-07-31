// credit to The amazing people at obsidian latex suite which this code is influenced from

import { Vault, TFile, TFolder, TAbstractFile, Notice, debounce } from 'obsidian';
import LatexCompilerPlugin from 'src/main';

const REFRESH_TIMEOUT_MS = 500;

const refreshLatexFromFiles = debounce(
	async (plugin: LatexCompilerPlugin) => {
		if (!plugin.settings.compilerVfsEnabled) {
			return;
		}
		await plugin.processLatexPreambles(false, true);
	},
	REFRESH_TIMEOUT_MS,
	true,
);

export const onFileChange = (plugin: LatexCompilerPlugin, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;

	const { compilerVfsEnabled } = plugin.settings;
	const fileIsMonitored = compilerVfsEnabled && plugin.latexRenderer.vfs.isNeededForAutoUse(file.path)

	if (fileIsMonitored) {
		refreshLatexFromFiles(plugin);
	}
};

export const onFileCreate = (plugin: LatexCompilerPlugin, file: TAbstractFile) => {
	onFileChange(plugin, file);
};

export const onFileDelete = (plugin: LatexCompilerPlugin, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	const wasVfsFile =
		plugin.settings.compilerVfsEnabled && plugin.latexRenderer.vfs.hasFile(file.path);

	if (wasVfsFile) {
		refreshLatexFromFiles(plugin);
	}
};

function* generateFilesWithin(fileOrFolder: TAbstractFile): Generator<TFile> {
	if (fileOrFolder instanceof TFile) yield fileOrFolder;
	else if (fileOrFolder instanceof TFolder)
		for (const child of fileOrFolder.children) yield* generateFilesWithin(child);
}

export function getFilesWithin(vault: Vault, path: string): Set<TFile> {
	const fileOrFolder = vault.getAbstractFileByPath(path);

	if (fileOrFolder === null) {
		return new Set();
	}
	const files = generateFilesWithin(fileOrFolder);
	return new Set(files);
}

export async function getPreambleFromFiles(files: Set<TFile>) {
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
