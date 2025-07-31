import Moshe from "src/main";
import * as fs from "fs";
import { Notice, TFile } from "obsidian";
import { getLatexHashesFromFile } from "../resolvers/latexSourceFromFile";
import * as path from "path";
import { CacheBase } from "./cacheBase/cacheBase";
import { CacheEntry, CacheJson, CacheMap } from "src/settings/settings";

export const cacheFileFormat = "svg";
import crypto from "crypto";
import { ResultFilePhysicalCache, ResultFileVirtualCache } from "./resultFileCacheTypes";

export function hashString(input: string, length: number = 16): string {
	return crypto.createHash("sha256")
		.update(input)
		.digest("hex")
		.slice(0, length);
}
export function hashLatexContent(content: string) {
	return hashString(content.replace(/\s/g, ""), 16);
}

export default class ResultFileCache {
	private plugin: Moshe;
	/**
	 * Map of cached files. hash -> Set of file paths that contain this hash.
	 */
	private cacheMap: CacheMap;;
	private virtualCache?: ResultFileVirtualCache;
	private physicalCache?: ResultFilePhysicalCache;
	private cache: CacheBase;

	constructor(plugin: Moshe) {
		this.plugin = plugin;

		if (this.plugin.settings.physicalCache) {
			this.physicalCache = new ResultFilePhysicalCache(this.plugin, [cacheFileFormat]);
			this.cache = this.physicalCache;
		} else {
			this.virtualCache = new ResultFileVirtualCache(this.plugin);
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
			this.virtualCache = new ResultFileVirtualCache(this.plugin);
			this.cache = this.virtualCache;
			return;
		}
		const fileNames = this.physicalCache.listCacheFiles();
		this.virtualCache = new ResultFileVirtualCache(this.plugin);
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
			this.physicalCache = new ResultFilePhysicalCache(this.plugin, [cacheFileFormat]);
			this.cache = this.physicalCache;
			return;
		}
		this.physicalCache = new ResultFilePhysicalCache(this.plugin, [cacheFileFormat]);
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
		this.cleanUpCache();
	}

	private loadCache() {
		const cache: CacheMap = new Map();
		for (const [k, v] of this.plugin.settings.cache || []) {
			const cacheEntries = v.map((entry) => ({ ...entry, referencedBy: new Set(entry.referencedBy) }));
			cache.set(k, cacheEntries);
		}
		this.cacheMap = cache;
		this.cleanUpCache();
	}

	private async saveCache() {
		const arr: CacheJson = []
		for (const [k, v] of this.cacheMap) {
			const cacheEntriesJson = [];
			for (const entry of v) {
				cacheEntriesJson.push({
					dependencies: entry.dependencies,
					depsHash: entry.depsHash,
					referencedBy: [...entry.referencedBy],
				});
			}
			arr.push([k, cacheEntriesJson]);
		}
		this.plugin.settings.cache = arr;
		await this.plugin.saveSettings();
	}

	private getDependencyHash(dependencies: string[]): string {
		if (dependencies.length === 0) { return "nodeps"; }
		const sorted = [...dependencies].sort();
		const joined = sorted.join("\n");
		return hashString(joined, 16);
	}

	/**
	 * Adds a file to the compiled file cache.
	 * @param content The file content.
	 * @param rawHash The raw hash key for the file.
	 * @param dependencies The list of dependencies for the file (as relative paths to the vault root).
	 * @param filePath The file path.
	 */
	async addFile(content: string, rawHash: string, dependencies: string[], filePath: string) {
		const depsHash = this.getDependencyHash(dependencies);
		const basename = this.getFileBaseName(rawHash, depsHash);

		let entries = this.cacheMap.get(rawHash);
		if (!entries) {
			entries = [];
			this.cacheMap.set(rawHash, entries);
		}

		let entry = entries.find(e => e.depsHash === depsHash);

		if (entry) {
			entry.referencedBy.add(filePath);
		} else {
			entry = {
				dependencies,
				depsHash,
				referencedBy: new Set([filePath]),
			};
			entries.push(entry);
		}
		if (this.cacheMap.get(rawHash)?.filter(e => e.referencedBy.has(filePath)).length !== 1) {
			throw new Error(`File ${filePath} is already referenced by another hash or dependency combination.`);
		}
		this.cache.addFile(this.basenameToFileName(basename), content);
		await this.saveCache();
	}
	
	private getResultFileFromRawHash(rawHash: string, path: string): string | undefined {
		const cacheEntries = this.cacheMap.get(rawHash);
		if (!cacheEntries || cacheEntries.length === 0) { return undefined; }
		let entry = cacheEntries.find(e => e.referencedBy.has(path)) || this.tempName(cacheEntries, path);
		// i need to add dep to file problom mathcing
		//if (!entry) { return undefined } // No entry found for this path
		const depsHash = entry ? entry.depsHash : this.getDependencyHash([]);
		const basename = this.getFileBaseName(rawHash, depsHash);
		return this.cache.getFile(this.basenameToFileName(basename));
	}
	private tempName(cacheEntries: CacheEntry[], filePath: string): CacheEntry|undefined {
		// if a dependency is a code block within the file, it cant be a match
		// it can be that the code block useis in absolute path, but because we cannot check that, we will just return undefined.
		for (const entry of cacheEntries) {
			if (entry.referencedBy.has(filePath)) {
				return entry;
			}
			this.isDependencyCodeBlock(entry.dependencies[0])
		}
	}

	private isDependencyCodeBlock(dependency: string): boolean {
		const name = path.basename(dependency);
		const dir = path.dirname(dependency);
		const vaultPath = this.plugin.getVaultPath();
		const relativePath = path.relative(vaultPath, dir);
		const dirT = app.vault.getAbstractFileByPath(relativePath);
		throw new Error(`Dependency ${dependency} is not a valid file in the vault.`);
	}

	/**
	 * Given a file path that may be relative or absolute, returns the directory path
	 * relative to the vault base path.
	 *
	 * @param filePath - The file path (can be absolute or relative to the vault)
	 * @returns The directory containing the file, as a path relative to the vault
	 */
	private dirFromFilePath(filePath: string): string {
		const basePath = path.normalize(this.plugin.getVaultPath());

		const absolutePath = path.isAbsolute(filePath)
			? path.normalize(filePath)
			: path.normalize(path.join(basePath, filePath));

		if (!fs.existsSync(absolutePath)) {
			throw new Error(`File path ${absolutePath} does not exist in vault`);
		}

		const dir = path.dirname(absolutePath);
		return path.relative(basePath, path.normalize(dir));
	}


	/**
	 * Restores the cached content for a given element and hash.
	 * If the content is found in the cache, it sets the innerHTML of the element to the cached content.
	 * @param el 
	 * @param rawHash 
	 * @returns 
	 */
	restoreFromCache(el: HTMLElement, rawHash: string, filePath: string): boolean {
		// if the resolve hash is the same as the raw hash, we can directly get the file from the cache so we dont have to check
		const data = this.getResultFileFromRawHash(rawHash, filePath);
		if (data === undefined) return false;
		el.innerHTML = data;
		return true;
	}

	hasRawHash(rawHash: string): boolean {
		return this.cacheMap.has(rawHash);
	}


	getAllFilePathsFromCache(): string[] {
		return [
			...new Set(
				[...this.cacheMap.values()]
					.map(cacheEntries => cacheEntries.map(cacheEntry => [...cacheEntry.referencedBy]))
					.flat().flat()
			)
		];
	}

	getCachedFilePathsForRawHash(rawHash: string): string[] {
		const cacheEntries = this.cacheMap.get(rawHash);
		return cacheEntries ? [...cacheEntries.flatMap(entry => [...entry.referencedBy])] : [];
	}

	/**
	 * Cleans up the cache by removing files that are no longer referenced.
	 * This includes files that are no longer present in the vault or have been deleted.
	 * It also removes unused caches for files that are still present but no longer have any LaTeX hashes associated with them.
	 */
	private async cleanUpCache(): Promise<void> {
		this.cache.cleanCache();
		const resultFileNames = this.cache.listCacheFiles();
		const filePathsToRemove: string[] = [];
		const rawHashesToRemove: string[] = [];
		// Find files that dont exsist anymaor if file dose exist, remove unused caches for it.
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
		// make Or that all files in the cache are valid files and still present in the vault.
		for (const resultFile of resultFileNames) {
			const rawHash = this.nameToHashes(resultFile).rawHash;
			if (!rawHash || !this.cacheMap.has(rawHash)) {
				rawHashesToRemove.push(rawHash);
			}
		}

		for (const hash of rawHashesToRemove) {
			this.removeRawHashFromCache(hash);
		}

		for (const filePath of filePathsToRemove) {
			this.removeReferencingFileFromCache(filePath);
		}
		await this.saveCache();
	}

	/**
	 * Removes unused caches for a specific file.
	 * This checks the LaTeX hashes in the file and removes any hashes from the cache that are not present in the file.
	 * If a hash is no longer referenced by any file, it is removed from the cache.
	 */
	private async removeUnusedCachesForFile(file: TFile) {
		const rawHashesInFile = await getLatexHashesFromFile(file);
		const rawHashesInCache = this.getRawHashesFromCacheForReferencingFile(file).rawHashes;
		console.log("rawHashesInCache", rawHashesInCache)
		for (const hash of rawHashesInCache) {
			// if the hash (from the cache) is not present in the file, remove it from the cache
			if (!rawHashesInFile.contains(hash)) {
				this.removeRawHashFromCache(hash);
			}
		}
	}

	private removeRawHashFromCache(rawHash: string): void {
		const entries = this.cacheMap.get(rawHash);
		this.cacheMap.delete(rawHash);
		if (entries) {
			for (const entry of entries) {
				this.removeResultFileFromCache(this.getFileBaseName(rawHash, entry.depsHash));
			}
		}
		const resultFileNames = this.cache.listCacheFiles();
		for (const resultFile of resultFileNames) {
			const { rawHash: rHash } = this.nameToHashes(resultFile);
			if (rHash === rawHash) {
				this.cache.deleteFile(resultFile);
			}
		}
		this.saveCache();
	}

	removeResultFileFromCache(basename: string): void {
		this.cache.deleteFile(this.basenameToFileName(basename));
		const { rawHash, depsHash } = this.nameToHashes(basename);
		const entries = this.cacheMap.get(rawHash);
		if (!entries) return;
		const noEntries = entries.length === 0
		const wasOnlyEntry = entries.length === 1 && entries[0].depsHash === depsHash;
		if (noEntries||wasOnlyEntry) {
			this.cacheMap.delete(rawHash);
			return;
		}
	}

	private removeReferencingFileFromCache(path: string): void {
		const referencingEntries: { rawHash: string, entry: CacheEntry }[] = [];
		for (const [rawHash, entries] of this.cacheMap.entries()) {
			const entry = entries.find(e => e.referencedBy.has(path));
			if (entry) {
				referencingEntries.push({ rawHash, entry });
			}
		}

		for (const { rawHash, entry } of referencingEntries) {
			entry.referencedBy.delete(path);
			if (entry.referencedBy.size === 0) {
				this.removeResultFileFromCache(this.getFileBaseName(rawHash, entry.depsHash));
			}
		}
	}
	
	private getRawHashesFromCacheForReferencingFile(file: TFile) {
		const rawHashesSet = new Set<string>(), depHashesSet = new Set<string>();

		for (const [k, v] of this.cacheMap.entries()) {
			for (const entry of v) {
				if (entry.referencedBy.has(file.path)) {
					rawHashesSet.add(k);
					depHashesSet.add(entry.depsHash);
				}
			}
		}

		return { rawHashes: [...rawHashesSet], depHashes: [...depHashesSet] };
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
	private getCachedFiles() {
		return this.cache.getFiles();
	}

	private basenameToFileName(hash: string): string {
		return `${hash}.${cacheFileFormat}`;
	}
	private getFileBaseName(rawHash: string, depsHash: string): string {
		return `${rawHash}-${depsHash}`;
	}
	private nameToHashes(fileName: string) {
		const parts = fileName.split(/[\\/]/).pop()?.split(".").shift();
		if (!parts) throw new Error(`Invalid file name: ${fileName}`);
		const [rawHash, depsHash] = parts?.split("-");
		if (!rawHash || !depsHash) {
			throw new Error(`Invalid file name format: ${fileName}`);
		}
		return { rawHash, depsHash };
	}
	private getResolvedHashes() {
		return [...this.cacheMap.values()].map(innerMap => [...innerMap.keys()]).flat();
	}
}