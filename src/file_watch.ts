// credit to The amazing people at obsidian latex suite which this code is heavily influenced from

import { Vault, TFile, TFolder, TAbstractFile, Notice, debounce } from "obsidian";
import Moshe from "src/main";

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
	const dir = plugin.app.vault.getAbstractFileByPath(folderPath);
	const isFolder = dir instanceof TFolder;

	return (isFolder && isInFolder(file, dir));
}

const refreshFromFiles = debounce(async (plugin: Moshe) => {
	if (!(plugin.settings.preambleEnabled||plugin.settings.explicitPreambleEnabled)) {return;}
	await plugin.processLatexPreambles(false, true);

}, 500, true);


const filePathMatch=(plugin: Moshe, file: TFile)=>{
	const {
		preambleEnabled,
		corePreambleFileLocation,
		explicitPreambleEnabled,
		explicitPreambleFileLocation,
	} = plugin.settings;
	const match = (enabled: boolean, dir: string) => ({
		enabled,
		isInFolder: fileIsInFolder(plugin, dir, file),
		isFile: file.path === dir,
	});
	return {
		core: match(preambleEnabled, corePreambleFileLocation),
		explicit: match(explicitPreambleEnabled, explicitPreambleFileLocation),
	};
}

const shouldRefreshFile = (match: { enabled: any; isFile: any; isInFolder: any; }) =>
	match.enabled && (match.isFile || match.isInFolder);
export const onFileChange = async (plugin: Moshe, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	const fileMatches = Object.values(filePathMatch(plugin, file));
	if (fileMatches.some(shouldRefreshFile)) {
		refreshFromFiles(plugin);
	}
};

const isFolderMonitored = (match: { enabled: boolean; isInFolder: boolean }) =>
	match.enabled && match.isInFolder;
export const onFileCreate = (plugin: Moshe, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	const monitoredFolders = Object.values(filePathMatch(plugin, file));
	if (monitoredFolders.some(isFolderMonitored)) {
		refreshFromFiles(plugin);
	}
};


export const onFileDelete = (plugin: Moshe, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	console.log("file deleted",plugin.settings);
	const match = (file: TFile) =>{
		const {
			preambleEnabled,
			corePreambleFileLocation,
			explicitPreambleEnabled,
			explicitPreambleFileLocation,
		} = plugin.settings;
		const possibleDirectories = [
			preambleEnabled && corePreambleFileLocation,
			explicitPreambleEnabled && explicitPreambleFileLocation
		].filter((path): path is string => Boolean(path));
		const validatedDirectories=possibleDirectories.map((path)=>plugin.app.vault.getAbstractFileByPath(path)).filter((dir)=>dir instanceof TFolder);
		return validatedDirectories.some((dir) => file.path.startsWith(dir.path));
	};
	if (match(file)) {
		refreshFromFiles(plugin);
	}
}






const normalizePath = (path: string) => path.replace(/\\/g, "/").toLowerCase();

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

const intersection = <T>(sets: Set<T>[]): Set<T> => {
    return sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))));
};
interface FileSets {
	corePreambleFiles: Set<TFile>;
	mathjaxPreambleFiles: Set<TFile>;
	explicitPreambleFiles: Set<TFile>;
}

export function getFileSets(plugin: Moshe):FileSets {
	const locations=[plugin.settings.corePreambleFileLocation,plugin.settings.mathjaxPreambleFileLocation,plugin.settings.explicitPreambleFileLocation];
	const [corePreambleFiles,mathjaxPreambleFiles,explicitPreambleFiles]=locations.map((path)=>getFilesWithin(plugin.app.vault, path));
	if(intersection([corePreambleFiles, explicitPreambleFiles]).size>0)
		new Notice("Core and explicit preamble files overlap. This may cause unexpected behavior");
	return {corePreambleFiles, mathjaxPreambleFiles, explicitPreambleFiles};
}
export type PreambleFile={path: string; name: string; content: string};
export async function getPreambleFromFiles(plugin: Moshe, files: Set<TFile>): Promise<PreambleFile[]> {
    const fileContents: { path: string; name: string; content: string }[] = [];

    for (const file of files) {
        try {
            fileContents.push({
                path: file.path,
                name: file.name,
                content: await plugin.app.vault.cachedRead(file)
            });
        } catch (e) {
            console.error(`Failed to fetch ${file.path} from memfs: ${e}`);
            new Notice(`Failed to fetch ${file.path} from memfs: ${e}`);
        }
    }
    return fileContents;
}
