import Moshe from "src/main";
import * as fs from "fs";
import { Notice, TFile } from "obsidian";
import { getLatexHashesFromFile } from "../resolvers/latexSourceFromFile";
import * as path from "path";
import { CacheBase } from "./cacheBase/cacheBase";
import { CacheEntry, CacheEntryJson, CacheJson, CacheMap } from "src/settings/settings";

export const cacheFileFormat = "svg";
import crypto from "crypto";
import { ResultFilePhysicalCache, ResultFileVirtualCache } from "./resultFileCacheTypes";
import { CODE_BLOCK_NAME_SEPARATOR, extractDir } from "../resolvers/paths";
import { optimizeSVG } from "../pdfToHtml/optimizeSVG";
import { addMenu } from "../swiftlatexRender";

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

		this.onload();
	}

	private async onload() {
		this.loadCache();
		await this.cleanUpCache();
		await this.finishProcessDirtyFiles();
	}

	private async finishProcessDirtyFiles() {
		const dirtyFiles = this.plugin.settings.dirtyResultFiles;
		for (const fileName of dirtyFiles) {
			const content = this.cache.getFile(fileName);
			if (!content) {
				throw new Error(`File ${fileName} not found in cache, cannot process dirty file.`);
			}
			try {
				const cleanSvg = optimizeSVG(content, true);
				this.cache.addFile(fileName, cleanSvg);
			} catch (err) {
				console.warn(`Failed to process ${fileName}:`, err);
			}
		}
		this.plugin.settings.dirtyResultFiles = [];
		await this.plugin.saveSettings();
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
		const raw: CacheJson = this.plugin.settings.cache || [];
		const cache: CacheMap = new Map();

		for (const [hash, entryList] of raw) {
			const parsedEntries: CacheEntry[] = entryList.map(entry => {
				if (Array.isArray(entry[0])) {
					const [dependencies, depsHash, referencedBy] = entry as CacheEntryJson;
					return {
						dependencies,
						depsHash,
						referencedBy: new Set(referencedBy),
					};
				} else {
					// Short form: referencedBy only
					const referencedBy = entry as string[];
					return {
						dependencies: [],
						depsHash: "nodeps",
						referencedBy: new Set(referencedBy),
					};
				}
			});

			cache.set(hash, parsedEntries);
		}

		this.cacheMap = cache;
	}

	private async saveCache() {
		const result: CacheJson = [];

		for (const [hash, entries] of this.cacheMap) {
			const serializedEntries = entries.map(entry => {
				if (entry.dependencies.length === 0 && entry.depsHash === "nodeps") {
					// Short form
					return [...entry.referencedBy];
				} else {
					// Full form
					return [
						entry.dependencies,
						entry.depsHash,
						[...entry.referencedBy],
					] as CacheEntryJson;
				}
			});

			result.push([hash, serializedEntries]);
		}

		this.plugin.settings.cache = result;
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
		const fileName = this.basenameToFileName(basename);
		this.cache.addFile(fileName, content);
		if (!this.plugin.settings.dirtyResultFiles.includes(fileName))
			this.plugin.settings.dirtyResultFiles.push(fileName);
		await this.saveCache();
	}


	
	
	private getResultFileFromRawHash(rawHash: string, path: string): string | undefined {
		const cacheEntries = this.cacheMap.get(rawHash);
		if (!cacheEntries || cacheEntries.length === 0) { return undefined; }
		let entry = this.findEntryForPath(cacheEntries, path)
		if (!entry) { return undefined } // No entry found for this path
		const basename = this.getFileBaseName(rawHash, entry.depsHash);
		return this.cache.getFile(this.basenameToFileName(basename));
	}

	private findEntryForPath(cacheEntries: CacheEntry[], filePath: string): CacheEntry | undefined {
		if (cacheEntries[0]?.dependencies.length === 0) {
			if (cacheEntries.length > 1) throw new Error("Cant have multiple entries with no dependencies");
			cacheEntries[0].referencedBy.add(filePath);
			return cacheEntries[0];
		}
		// if a dependency is a code block within the file, it cant be a match
		// it can be that the code block useis in absolute path, but because we cannot check that, we will just return undefined.
		for (const entry of cacheEntries) {
			if (entry.referencedBy.has(filePath)) {
				return entry;
			}
			const directory = extractDir(filePath);
			if (entry.dependencies.every(dep => path.dirname(dep) === directory)) {
				entry.referencedBy.add(filePath);
				return entry; // Found an entry that matches the file path
			}
		}
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
		addMenu(this.plugin, el, filePath);
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
		this.plugin.settings.dirtyResultFiles = [];
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
	getFileBaseName(rawHash: string, deps: string | string[]): string {
		const depsHash = Array.isArray(deps) ? this.getDependencyHash(deps) : deps;
		return `${rawHash}-${depsHash}`;
	}
	nameToHashes(fileName: string) {
		const parts = fileName.split(/[\\/]/).pop()?.split(".").shift();
		if (!parts) throw new Error(`Invalid file name: ${fileName}`);
		const [rawHash, depsHash] = parts?.split("-");
		if (!rawHash || !depsHash) {
			throw new Error(`Invalid file name format: ${fileName}`);
		}
		return { rawHash, depsHash };
	}
}