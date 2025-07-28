import Moshe from "src/main";
import * as fs from "fs";
import { Notice, TFile } from "obsidian";
import { getLatexHashesFromFile } from "../resolvers/latexSourceFromFile";
import * as path from "path";
import { CacheBase } from "./cacheBase/cacheBase";
import { CacheArray, CacheMap } from "src/settings/settings";
import { PhysicalCacheBase } from "./cacheBase/physicalCacheBase";
import { VirtualCacheBase } from "./cacheBase/virtualCacheBase";

export const cacheFileFormat = "svg";

export default class ResultFileCache {
	private plugin: Moshe;
	/**
	 * Map of cached files. hash -> Set of file paths that contain this hash.
	 */
	private cacheMap: CacheMap;;
	private virtualCache?: CompiledFileVirtualCache;
	private physicalCache?: CompiledFilePhysicalCache;
	private cache: CacheBase;

	constructor(plugin: Moshe) {
		this.plugin = plugin;

		if (this.plugin.settings.physicalCache) {
			this.physicalCache = new CompiledFilePhysicalCache(this.plugin, [cacheFileFormat]);
			this.cache = this.physicalCache;
		} else {
			this.virtualCache = new CompiledFileVirtualCache(this.plugin);
			this.cache = this.virtualCache;
		}

		this.loadCache();
	}

	changeCacheDirectory() {
		if (this.physicalCache) {
			this.physicalCache.changeCacheDirectory();
		} else {
			const message = "Physical cache is not enabled, cannot change cache directory.";
			new Notice(message);
			throw new Error(message);
		}
	}

	private togglePhysicalCacheOff() {
		if (!this.physicalCache) {
			console.warn("Physical cache is already disabled, nothing to do.");
			this.virtualCache = new CompiledFileVirtualCache(this.plugin);
			this.cache = this.virtualCache;
			return;
		}
		const fileNames = this.physicalCache.listCacheFiles();
		this.virtualCache = new CompiledFileVirtualCache(this.plugin);
		for (const name of fileNames) {
			const content = this.physicalCache.getFile(name);
			if (!content) {
				console.warn(`File ${name} not found in cache, skipping.`);
				continue;
			}
			this.virtualCache.addFile(name, content);
		}
		this.physicalCache.deleteCache();
		this.physicalCache = undefined;
		this.cache = this.virtualCache;
	}

	private togglePhysicalCacheOn() {
		if (!this.virtualCache) {
			console.warn("Virtual cache is already disabled, nothing to do.");
			this.physicalCache = new CompiledFilePhysicalCache(this.plugin, [cacheFileFormat]);
			this.cache = this.physicalCache;
			return;
		}
		this.physicalCache = new CompiledFilePhysicalCache(this.plugin, [cacheFileFormat]);
		const fileNames = this.cache.listCacheFiles();
		for (const fileName of fileNames || []) {
			const content = this.virtualCache.getFile(fileName)!;
			this.physicalCache.addFile(fileName, content);
		}
		this.cache = this.physicalCache;
		this.virtualCache = undefined;
	}
	/**
	 * Toggles the use of physical (on-disk) cache.
	 */
	togglePhysicalCache() {
		if (this.plugin.settings.physicalCache) {
			this.togglePhysicalCacheOn();
		} else {
			this.togglePhysicalCacheOff();
		}
	}

	private loadCache() {
		const cache: CacheMap = new Map();
		for (const [k, v] of this.plugin.settings.cache || []) {
			const innerMap = new Map<string, Set<string>>();
			for (const [innerK, innerV] of v) {
				innerMap.set(innerK, new Set(innerV));
			}
			cache.set(k, innerMap);
		}
		this.cacheMap = cache;
	}

	private async saveCache() {
		const arr: CacheArray = []
		for (const [k, v] of (this.cacheMap as CacheMap)) {
			const innerArr: Array<[string, Array<string>]> = [];
			for (const [innerK, innerV] of v) {
				innerArr.push([innerK, Array.from(innerV)]);
			}
			arr.push([k, innerArr]);
		}
		this.plugin.settings.cache = arr;
		await this.plugin.saveSettings();
	}

	/**
	 * Adds a file to the compiled file cache.
	 * @param content The file content.
	 * @param rawHash The raw hash key for the file.
	 * @param resolvedHash The resolved hash key for the file.
	 * @param filePath The file path.
	 */
	async addFile(content: string, rawHash: string, resolvedHash: string, filePath: string) {
		await this.cache.addFile(resolvedHash, content);

		const dir = this.dirFromFilePath(filePath);

		let resolvedMap = this.cacheMap.get(rawHash);
		if (!resolvedMap) {
			resolvedMap = new Map<string, Set<string>>();
			this.cacheMap.set(rawHash, resolvedMap);
		}

		let pathSet = resolvedMap.get(resolvedHash);
		if (!pathSet) {
			pathSet = new Set<string>();
			resolvedMap.set(resolvedHash, pathSet);
		}

		pathSet.add(dir);
		this.saveCache();
	}

	getFileFromResolvedHash(resolvedHash: string) {
		return this.cache.getFile(this.hashToFileName(resolvedHash));
	}

	getFileFromRawHash(rawHash: string, path: string): string | undefined {
		const innerMap = this.cacheMap.get(rawHash);
		if (!innerMap || innerMap.size === 0) { return undefined; }
		const dir = this.dirFromFilePath(path);
		let key;
		for (const [resolvedHash, dirs] of innerMap.entries()) {
			if (dirs.has(dir) || rawHash === resolvedHash) {
				key = resolvedHash;
				break;
			}
		}
		if (key) {
			return this.cache.getFile(this.hashToFileName(key));
		}
	}

	/**
	 * Checks if the raw hash has a differing inner hash.
	 * This is used to determine if the raw hash has multiple resolved hashes associated with it.
	 * @param rawHash The raw hash to check.
	 * @returns true if the raw hash has a differing inner hash, false otherwise.
	 */
	private hasDifferingInnerHash(rawHash: string) {
		const innerMap = this.cacheMap.get(rawHash);
		if (!innerMap || innerMap.size !== 1) return false;
		return !innerMap.has(rawHash);
	}

	/**
	 * retrieves the directory path from a file path.
	 * It normalizes the file path and checks if it starts with the vault path.
	 * @param filePath 
	 * @returns 
	 */
	private dirFromFilePath(filePath: string): string {
		const dir = path.dirname(filePath);
		const basePath = path.normalize(this.plugin.getVaultPath());
		const normalizedDir = path.normalize(dir);

		if (!normalizedDir.startsWith(basePath)) {
			throw new Error(`File path ${filePath} does not start with vault path ${basePath}`);
		}
		return path.relative(basePath, normalizedDir);
	}

	/**
	 * Restores the cached content for a given element and hash.
	 * If the content is found in the cache, it sets the innerHTML of the element to the cached content.
	 * @param el 
	 * @param rawHash 
	 * @returns 
	 */
	restoreFromCache(el: HTMLElement, rawHash: string) {
		// if the resolve hash is the same as the raw hash, we can directly get the file from the cache so we dont have to check
		const data = this.cache.getFile(this.hashToFileName(rawHash));
		if (data === undefined) return false;
		el.innerHTML = data;
		return true;
	}

	hasHash(hash: string): boolean {
		return this.cacheMap.has(hash) || this.cache.fileExists(hash);
	}


	getAllFilePathsFromCache(): string[] {
		return [
			...new Set(
				[...this.cacheMap.values()]                      // get all inner maps
					.flatMap(innerMap => [...innerMap.values()])  // get all Set<string>
					.flatMap(set => [...set])                     // flatten to string[]
			)
		];
	}

	/**
	 * Retrieves file paths from the cache for a given hash.
	 * @param rawHash 
	 * @returns 
	 */
	getCachedFilePathsForRawHash(rawHash: string): string[] {
		if (!this.cacheMap.has(rawHash)) return [];
		return [...this.cacheMap.get(rawHash)!.values()].flatMap(pathsSet => [...pathsSet.values()])
	}

	/**
	 * Cleans up the cache by removing files that are no longer referenced.
	 * This includes files that are no longer present in the vault or have been deleted.
	 * It also removes unused caches for files that are still present but no longer have any LaTeX hashes associated with them.
	 */
	async cleanUpCache(): Promise<void> {
		const cacheFolderFiles = this.cache.listCacheFiles();
		const cacheHashes = [...this.cacheMap.keys()];
		const filePathsToRemove: string[] = [];
		const hashesToRemove: string[] = [];

		for (const filePath of this.getAllFilePathsFromCache()) {
			const file = app.vault.getAbstractFileByPath(filePath);
			if (!file) {
				filePathsToRemove.push(filePath);
			} else if (file instanceof TFile) {
				try {
					await this.removeUnusedCachesForFile(file);
				} catch (err) {
					console.error(`Error removing cache for file ${filePath}:`, err);
				}
			}
		}

		for (const file of cacheFolderFiles) {
			const hash = file.split(".")[0];
			if (!cacheHashes.includes(hash)) {
				hashesToRemove.push(hash);
			}
		}

		for (const hash of hashesToRemove) {
			await this.removeFileFromCache(hash);
		}

		for (const filePath of filePathsToRemove) {
			this.removeFileFromCache(filePath);
		}

		await this.plugin.saveSettings();
	}
	/**
	 * Removes unused caches for a specific file.
	 * This checks the LaTeX hashes in the file and removes any hashes from the cache that are not present in the file.
	 * If a hash is no longer referenced by any file, it is removed from the cache.
	 */
	private async removeUnusedCachesForFile(file: TFile) {
		const hashesInFile = await getLatexHashesFromFile(file);
		const rawHashesInCache = this.getHashesFromCacheForFile(file).rawHashes;
		for (const hash of rawHashesInCache) {
			// if the hash (from the cache) is not present in the file, remove it from the cache
			if (!hashesInFile.contains(hash)) {
				this.cacheMap.get(hash)?.delete(file.path);
				if (this.cacheMap.get(hash)?.size == 0) {
					await this.removeFileFromCache(hash);
				}
			}
		}
	}
	/**
	 * Removes a file from the compiled file cache.
	 * @param key The cache key.
	 */
	async removeFileFromCache(key: string) {
		if (this.cacheMap.has(key)) this.cacheMap.delete(key);
		this.cache.deleteFile(key);
		await this.saveCache();
	}

	async removeMdFileCacheDataFromCache(file_path: string) {
		for (const h of this.cacheMap.keys()) {
			this.cacheMap.get(h)?.delete(file_path);
			if (this.cacheMap.get(h)?.size == 0) {
				await this.removeFileFromCache(h);
			}
		}
		await this.saveCache();
	}

	private getHashesFromCacheForFile(file: TFile) {
		const rawHashesSet = new Set<string>(), resolvedHashesSet = new Set<string>();
		const path = file.path;

		for (const [k, v] of this.cacheMap.entries()) {
			for (const [innerK, innerV] of v.entries()) {
				// Check if the Set for the inner hash contains the file path
				if (innerV.has(path)) {
					resolvedHashesSet.add(innerK);
					rawHashesSet.add(k);
				}
			}
		}

		return { rawHashes: [...rawHashesSet], resolvedHashes: [...resolvedHashesSet] };
	}

	/**
	 * Removes all cached files from the compiled file cache.
	 */
	removeAllCached(): void {
		this.cache.clearCache();
		this.cacheMap.clear();
		this.saveCache();
	}

	/**
	 * Returns a map of all cached files with their names and content.
	 * The key is the file name (with extension), and the value is the file content.
	 */
	getCachedFiles() {
		return this.cache.getFiles();
	}

	private hashToFileName(hash: string): string {
		return `${hash}.${cacheFileFormat}`;
	}
}
// This is just for naming consistency with the physical cache.
class CompiledFileVirtualCache extends VirtualCacheBase {}

class CompiledFilePhysicalCache extends PhysicalCacheBase {

	extractFileName(filePath: string): string {
		const fileName = path.basename(filePath);
		if (fileName.endsWith(`.${cacheFileFormat}`)) {
			return fileName.slice(0, -cacheFileFormat.length - 1);
		}
		return fileName;
	}
	isValidCacheFile(fileName: string): boolean {
		return fileName.endsWith(`.${cacheFileFormat}`);
	}

	setCacheFolderPath() {
		let folderPath = "";
		const cacheDir = this.plugin.settings.physicalCacheLocation;
		const basePath = this.plugin.getVaultPath();
		if (cacheDir)
			folderPath = path.join(basePath, cacheDir === "/" ? "" : cacheDir);
		else
			folderPath = path.join(
				basePath,
				app.vault.configDir,
				"swiftlatex-render-cache",
			);

		folderPath = path.join(folderPath, "pdf-cache");
		this.cacheFolderPath = folderPath;
	}

	/**
	 * Changes the cache directory location.
	 */
	changeCacheDirectory() {
		if (!this.plugin.settings.physicalCache) {
			new Notice(
				"Physical cache is not enabled, cannot change cache directory.",
			);
			return;
		}

		const oldCacheFiles = this.listCacheFiles();
		const oldCacheFolderPath = this.cacheFolderPath;
		this.setCacheFolderPath();
		const newCacheFolderPath = this.getCacheFolderPath();

		if (newCacheFolderPath === oldCacheFolderPath) {
			new Notice("Cache directory is already set to the specified location.");
			return;
		}
		if (!fs.existsSync(newCacheFolderPath)) {
			fs.mkdirSync(newCacheFolderPath, { recursive: true });
		}
		for (const file of oldCacheFiles) {
			const oldPath = path.join(oldCacheFolderPath, file);
			const newPath = path.join(newCacheFolderPath, file);
			try {
				fs.renameSync(oldPath, newPath);
			} catch (err) {
				console.error(`Failed to move file ${file}:`, err);
			}
		}
		fs.rmdirSync(oldCacheFolderPath, { recursive: true });
	}
}
