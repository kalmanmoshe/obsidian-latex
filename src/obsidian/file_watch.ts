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

const refreshFromFiles = debounce(async (plugin: Moshe,mathjax=false) => {
	if (!(plugin.settings.pdfTexEnginevirtualFileSystemFilesEnabled||plugin.settings.mathjaxPreamblePreambleEnabled)) {return;}
	if(mathjax)
		await plugin.loadMathJax();
	else
		await plugin.processLatexPreambles(false, true);
}, 500, true);


const filePathMatch=(plugin: Moshe, file: TFile)=>{
	const {
		pdfTexEnginevirtualFileSystemFilesEnabled,
		virtualFilesFileLocation,
		mathjaxPreamblePreambleEnabled,
		mathjaxPreambleFileLocation,
	} = plugin.settings;
	const match = (enabled: boolean, dir: string) => ({
		enabled,
		isInFolder: fileIsInFolder(plugin, dir, file),
		isFile: file.path === dir,
	});
	return {
		explicit: match(pdfTexEnginevirtualFileSystemFilesEnabled, virtualFilesFileLocation),
		mathJax: match(mathjaxPreamblePreambleEnabled, mathjaxPreambleFileLocation),
	};
}

const shouldRefreshFile = (match: { enabled: any; isFile: any; isInFolder: any; },) =>
	match.enabled && (match.isFile || match.isInFolder);

export const onFileChange = async (plugin: Moshe, file: TAbstractFile) => {
	console.debug(`File change detected: ${file.path}`);
	if (!(file instanceof TFile)) return;
	const fileMatches = Object.values(filePathMatch(plugin, file));
	if (fileMatches.some(shouldRefreshFile)) {
		refreshFromFiles(plugin,shouldRefreshFile(fileMatches[1]));
	}
};

const isFolderMonitored = (match: { enabled: boolean; isInFolder: boolean }) =>
	match.enabled && match.isInFolder;

export const onFileCreate = (plugin: Moshe, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	const monitoredFolders = Object.values(filePathMatch(plugin, file));
	if (monitoredFolders.some(isFolderMonitored)) {
		refreshFromFiles(plugin,isFolderMonitored(monitoredFolders[1]));
	}
};


export const onFileDelete = (plugin: Moshe, file: TAbstractFile) => {
	if (!(file instanceof TFile)) return;
	const match = (file: TFile) =>{
		const {
			pdfTexEnginevirtualFileSystemFilesEnabled,
			virtualFilesFileLocation,
			mathjaxPreamblePreambleEnabled,
			mathjaxPreambleFileLocation
		} = plugin.settings;
		const possibleDirectories = [
			pdfTexEnginevirtualFileSystemFilesEnabled &&virtualFilesFileLocation,mathjaxPreamblePreambleEnabled &&mathjaxPreambleFileLocation
		].filter((path): path is string => Boolean(path));
		const validatedDirectories=possibleDirectories.map((path)=>plugin.app.vault.getAbstractFileByPath(path)).filter((dir)=>dir instanceof TFolder);
		return validatedDirectories.some((dir) => file.path.startsWith(dir.path));
	};
	if (match(file)) {
		// There's no point passing mathjax over here as.it won't do anything you cannot.delete the file from catch. Only change it
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

interface FileSets {
	mathjaxPreambleFiles: Set<TFile>;
	latexVirtualFiles: Set<TFile>;
}

export function getFileSets(plugin: Moshe):FileSets {
	const locations=[plugin.settings.mathjaxPreambleFileLocation,plugin.settings.virtualFilesFileLocation];
	const [mathjaxPreambleFiles,latexVirtualFiles]=locations.map((path)=>getFilesWithin(plugin.app.vault, path));
	return {mathjaxPreambleFiles, latexVirtualFiles};
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
