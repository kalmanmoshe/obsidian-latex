// credit to The amazing people at obsidian latex suite which this code is influenced from

import { dir } from "console";
import { on } from "events";
import { Vault, TFile, TFolder, TAbstractFile, Notice, debounce, } from "obsidian";
import Moshe from "src/main";

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


/**
 * Checks if the file is either the specified path or within the directory of the specified path.
 * @param plugin - The plugin instance.
 * @param dir - The directory path to check against.
 * @param file - The file to validate.
 * @returns {boolean} - True if the file matches the path or is within the directory, false otherwise.
 */
function isFileInDir(dir: TAbstractFile, file: TFile): boolean {
  if (dir instanceof TFolder) {
    return isFileInFolder(dir, file);
  }
  return dir instanceof TFile && dir.path === file.path;
}

const refreshFromFiles = debounce(
  async (plugin: Moshe, mathjax = false) => {
    if (!(plugin.settings.compilerVfsEnabled ||
      plugin.settings.mathjaxPreambleEnabled
    )) { return; }

    if (mathjax) await plugin.loadMathJax();
    else await plugin.processLatexPreambles(false, true);
  },
  500,
  true,
);
/**
 * chack if the file is a vfs/mathjax preamble file
 * @param plugin 
 * @param file 
 * @returns 
 */
const filePathConfig = (plugin: Moshe, file: TFile) => {
  const {
    compilerVfsEnabled,
    autoloadedVfsFilesDir,
    mathjaxPreambleEnabled,
    mathjaxPreambleFileLocation,
  } = plugin.settings;
  const match = (enabled: boolean, dir: string) => {
    const possibleFolder = app.vault.getAbstractFileByPath(dir);
    let isInFolder = false;
    if (possibleFolder && possibleFolder instanceof TFolder) {
      isInFolder = isFileInFolder(possibleFolder, file);
    }
    return { enabled, isInFolder, isFile: file.path === dir }
  };
  return {
    autoLoaded: match(compilerVfsEnabled, autoloadedVfsFilesDir),
    mathJax: match(mathjaxPreambleEnabled, mathjaxPreambleFileLocation),
  };
};

const isDirMonitored = (match: {
  enabled: any;
  isFile: any;
  isInFolder: any;
}): boolean => match.enabled && (match.isFile || match.isInFolder);

export const onFileChange = (plugin: Moshe, file: TAbstractFile) => {
  if (!(file instanceof TFile)) return;
  const fileConfig = filePathConfig(plugin, file);
  const shouldRefreshFile = Object.values(fileConfig).some(config => isDirMonitored(config));
  if (shouldRefreshFile) {
    refreshFromFiles(plugin, isDirMonitored(fileConfig.mathJax));
  }
};

export const onFileCreate = (plugin: Moshe, file: TAbstractFile) => {
  onFileChange(plugin, file);
};

function getActiveDirectories(plugin: Moshe): string[] {
  const {
    compilerVfsEnabled,
    autoloadedVfsFilesDir,
    mathjaxPreambleEnabled,
    mathjaxPreambleFileLocation,
  } = plugin.settings;

  return [
    compilerVfsEnabled && autoloadedVfsFilesDir,
    mathjaxPreambleEnabled && mathjaxPreambleFileLocation,
  ].filter((path): path is string => Boolean(path))// Chack if the dir is enabled;
}

export const onFileDelete = (plugin: Moshe, file: TAbstractFile) => {
  if (!(file instanceof TFile)) return;
  const directories = getActiveDirectories(plugin)
    .map((path) => app.vault.getAbstractFileByPath(path))// Get the TAbstractFile
    .filter(dir => dir !== null);

  if (directories.some(dir => isFileInDir(dir, file))) {
    // There's no point passing mathjax over here as it won't do anything you cannot delete the file from catch Only change it
    refreshFromFiles(plugin);
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

export function getFileSets(plugin: Moshe): FileSets {
  const locations = [
    plugin.settings.mathjaxPreambleFileLocation,
    plugin.settings.autoloadedVfsFilesDir
  ];
  const [mathjaxPreambleFiles, latexVirtualFiles] = locations.map((path) => getFilesWithin(app.vault, path));
  return { mathjaxPreambleFiles, latexVirtualFiles };
}
export type PreambleFile = { path: string; name: string; content: string };

export async function getPreambleFromFiles(
  plugin: Moshe,
  files: Set<TFile>,
): Promise<PreambleFile[]> {
  const fileContents: { path: string; name: string; content: string }[] = [];

  for (const file of files) {
    try {
      fileContents.push({
        path: file.path,
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
