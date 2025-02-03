
import { Vault, TFile, TFolder, TAbstractFile, Notice, debounce } from "obsidian";
import { Snippet } from "../snippets/snippets";
import { parseSnippets, parseSnippetVariables, type SnippetVariables } from "../snippets/parse";
// @ts-ignore
import differenceImplementation from "set.prototype.difference";
// @ts-ignore
import intersectionImplementation from "set.prototype.intersection";
import { sortSnippets } from "src/snippets/sort";
import Moshe from "../main";

const difference: <T>(self: Set<T>, other: Set<T>) => Set<T> = differenceImplementation;
const intersection: <T>(self: Set<T>, other: Set<T>) => Set<T> = intersectionImplementation;


function isInFolder(file: TFile, dir: TFolder) {
	let cur = file.parent;
	let cnt = 0;

	while (cur && (!cur.isRoot()) && (cnt < 100)) {

		if (cur.path === dir.path) return true;

		cur = cur.parent;
		cnt++;
	}

	return false;
}

function fileIsInFolder(plugin: Moshe, folderPath: string, file: TFile) {
	const snippetDir = plugin.app.vault.getAbstractFileByPath(folderPath);
	const isFolder = snippetDir instanceof TFolder;

	return (isFolder && isInFolder(file, snippetDir));
}

const refreshFromFiles = debounce(async (plugin: Moshe) => {
	if (!(plugin.settings.loadSnippetVariablesFromFile || plugin.settings.loadSnippetsFromFile)) {
		return;
	}

	await plugin.processSettings(false, true);

}, 500, true);


const filePathMatch=(plugin: Moshe, file: TFile)=>{
	const {
		snippetVariablesFileLocation: snippetVariablesDir,
		snippetsFileLocation: snippetsDir,
		loadSnippetVariablesFromFile,
		loadSnippetsFromFile,
	  } = plugin.settings;
	const match = (enabled: boolean, dir: string) => ({
		enabled,
		isInFolder: fileIsInFolder(plugin, dir, file),
		isFile: file.path === dir,
	  });
	return {
    snippetVariables: match(loadSnippetVariablesFromFile, snippetVariablesDir),
    snippets: match(loadSnippetsFromFile, snippetsDir),
  };
}

export const onFileChange = async (plugin: Moshe, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	const {snippetVariables, snippets} = filePathMatch(plugin, file);
	if (snippetVariables.enabled &&snippetVariables.isFile
		|| snippets.enabled &&snippets.isFile
		|| snippetVariables.isInFolder
		|| snippets.isInFolder
	) {
		refreshFromFiles(plugin);
	}
}


export const onFileCreate = (plugin: Moshe, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	const {snippetVariables, snippets} = filePathMatch(plugin, file);
	
	const shouldLoadSnippetVars = snippetVariables.enabled && snippetVariables.isInFolder;
	const shouldLoadSnippets = snippets.enabled && snippets.isInFolder;

	if (shouldLoadSnippetVars || shouldLoadSnippets) {
		refreshFromFiles(plugin);
	}
}

export const onFileDelete = (plugin: Moshe, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;

	const snippetVariablesDir = plugin.app.vault.getAbstractFileByPath(plugin.settings.snippetVariablesFileLocation);
	const snippetDir = plugin.app.vault.getAbstractFileByPath(plugin.settings.snippetsFileLocation);

	if (plugin.settings.loadSnippetVariablesFromFile && snippetVariablesDir instanceof TFolder && file.path.contains(snippetVariablesDir.path)
		|| plugin.settings.loadSnippetsFromFile && snippetDir instanceof TFolder && file.path.contains(snippetDir.path)
	) {
		refreshFromFiles(plugin);
	}
}

function* generateFilesWithin(fileOrFolder: TAbstractFile): Generator<TFile> {
	if (fileOrFolder instanceof TFile)
		yield fileOrFolder;

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
	definitelyVariableFiles: Set<TFile>;
	definitelySnippetFiles: Set<TFile>;
	snippetOrVariableFiles: Set<TFile>;
}

export function getFileSets(plugin: Moshe): FileSets {
	const variablesFolder =
		plugin.settings.loadSnippetVariablesFromFile
		? getFilesWithin(plugin.app.vault, plugin.settings.snippetVariablesFileLocation)
		: new Set<TFile>();

	const snippetsFolder =
		plugin.settings.loadSnippetsFromFile
		? getFilesWithin(plugin.app.vault, plugin.settings.snippetsFileLocation)
			: new Set<TFile>();

	const definitelyVariableFiles = difference(variablesFolder, snippetsFolder);
	const definitelySnippetFiles = difference(snippetsFolder, variablesFolder);
	const snippetOrVariableFiles = intersection(variablesFolder, snippetsFolder);

	return {definitelyVariableFiles, definitelySnippetFiles, snippetOrVariableFiles};
}

export async function getVariablesFromFiles(plugin: Moshe, files: FileSets) {
	const snippetVariables: SnippetVariables = {};

	for (const file of files.definitelyVariableFiles) {
		const content = await plugin.app.vault.cachedRead(file);
		try {
			Object.assign(snippetVariables, await parseSnippetVariables(content));
		} catch (e) {
			new Notice(`Failed to parse variable file ${file.name}: ${e}`);
			console.log(`Failed to parse variable file ${file.name}: ${e}`);
			files.definitelyVariableFiles.delete(file);
		}
	}

	return snippetVariables;
}

export async function tryGetVariablesFromUnknownFiles(plugin: Moshe, files: FileSets) {
	const snippetVariables: SnippetVariables = {};

	for (const file of files.snippetOrVariableFiles) {
		const content = await plugin.app.vault.cachedRead(file);
		try {
			Object.assign(snippetVariables, await parseSnippetVariables(content));
			files.definitelyVariableFiles.add(file);
		} catch (e) {
			// No error here, we just assume this is a snippets file.
			// If it's not, then an error will be raised later, while parsing it.
			files.definitelySnippetFiles.add(file);
		}
		files.snippetOrVariableFiles.delete(file);
	}

	return snippetVariables;
}

export async function getPreambleFromFiles(
	plugin: Moshe,
	files: FileSets,
	preamble: SnippetVariables
) {


}

export async function getSnippetsFromFiles(
	plugin: Moshe,
	files: FileSets,
	snippetVariables: SnippetVariables
) {
	const snippets: Snippet[] = [];

	for (const file of files.definitelySnippetFiles) {
		const content = await plugin.app.vault.cachedRead(file);
		try {
			snippets.push(...await parseSnippets(content, snippetVariables));
		} catch (e) {
			new Notice(`Failed to parse snippet file ${file.name}: ${e}`);
			console.log(`Failed to parse snippet file ${file.name}: ${e}`);
			files.definitelySnippetFiles.delete(file);
		}
	}

	return sortSnippets(snippets);
}
