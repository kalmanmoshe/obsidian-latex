import LatexCompilerPlugin from 'src/main';
import { normalizePath, Notice, TFile } from 'obsidian';
import { getLatexHashesFromFile } from '../resolvers/latexSourceFromFile';
import { CacheBase, CacheFileType } from './cacheBase/cacheBase';
import {
	CacheEntry,
	CacheEntryJson,
	CacheJson,
	CacheMap,
} from 'src/settings/settings';
import {
	ResultFilePhysicalCache,
	ResultFileVirtualCache,
} from './resultFileCacheTypes';
import { isValidFileStem } from '../resolvers/paths';
import { optimizeSVG } from '../pdfToHtml/optimizeSVG';
import { getDependencyHash } from './compilerCache';


export const resultFileCacheFormat = new Map([
	['svg', CacheFileType.Text],
]);

export default class ResultFileCache {
	private plugin: LatexCompilerPlugin;
	/**
	 * Map of cached files. hash -> Set of file paths that contain this hash.
	 */
	private cacheMap: CacheMap;
	private cache: CacheBase;

	constructor(plugin: LatexCompilerPlugin) {
		this.plugin = plugin;

		if (this.plugin.settings.physicalCache) {
			this.cache = new ResultFilePhysicalCache(this.plugin, resultFileCacheFormat);
		} else {
			this.cache = new ResultFileVirtualCache(this.plugin, resultFileCacheFormat);
		}

		this.onload();
	}

	private async onload() {
		this.loadCache();
		await this.cleanUpCache();
		await this.finishProcessDirtyFiles();
	}

	isPhysicalCatch(): boolean {
		return (this.cache instanceof ResultFilePhysicalCache);
	}

	private async finishProcessDirtyFiles() {
		const dirtyFiles = this.plugin.settings.dirtyResultFiles;
		for (const fileName of dirtyFiles) {
			const content = await this.cache.getFileAsString(fileName);
			if (!content) {
				continue;
			}
			try {
				const cleanSvg = optimizeSVG(content, true);
				await this.cache.addFile(fileName, cleanSvg);
			} catch (err) {
				console.warn(`Failed to process ${fileName}:`, err);
			}
		}
		this.plugin.settings.dirtyResultFiles = [];
		await this.plugin.saveSettings();
	}

	async changeCacheDirectory() {
		if (this.isPhysicalCatch()) {
			await (this.cache as ResultFilePhysicalCache).changeCacheDirectory();
		} else {
			const message =
				'Physical cache is not enabled, cannot change cache directory.';
			new Notice(message);
			throw new Error(message);
		}
	}

	private async togglePhysicalCacheOff() {
		if (!this.isPhysicalCatch()) {
			console.warn('Physical cache is already disabled, nothing to do.');
			return;
		}
		const physicalCache = this.cache as ResultFilePhysicalCache;
		const fileNames = await physicalCache.listCacheFiles();
		this.cache = new ResultFileVirtualCache(this.plugin, resultFileCacheFormat);
		for (const name of fileNames) {
			const content = await physicalCache.getFile(name);
			if (!content) {
				console.warn(`File ${name} not found in cache, skipping.`);
				continue;
			}
			await this.cache.addFile(name, content);
		}
		await physicalCache.deleteCache();
		this.cache = new ResultFileVirtualCache(this.plugin, resultFileCacheFormat);
	}

	private async togglePhysicalCacheOn() {
		if (this.isPhysicalCatch()) {
			console.warn('Virtual cache is already disabled, nothing to do.');
			return;
		}
		const virtualCache = this.cache as ResultFileVirtualCache;
		this.cache = new ResultFilePhysicalCache(this.plugin, resultFileCacheFormat);
		const fileNames = await virtualCache.listCacheFiles();
		for (const fileName of fileNames || []) {
			const content = (await virtualCache.getFile(fileName))!;
			await (this.cache as ResultFilePhysicalCache).addFile(fileName, content);
		}
	}

	/**
	 * Toggles the use of physical (on-disk) cache.
	 */
	async togglePhysicalCache() {
		if (this.plugin.settings.physicalCache) {
			await this.togglePhysicalCacheOn();
		} else {
			await this.togglePhysicalCacheOff();
		}
		this.cleanUpCache();
	}

	private loadCache() {
		const raw: CacheJson = this.plugin.settings.cache || [];
		const cache: CacheMap = new Map();

		for (const [hash, entryList] of raw) {
			const parsedEntries: CacheEntry[] = entryList.map((entry) => {
				if (Array.isArray(entry[0])) {
					const [dependencies, depsHash, referencedBy] =
						entry as CacheEntryJson;
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
						depsHash: 'nodeps',
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
			const serializedEntries = entries.map((entry) => {
				if (
					entry.dependencies.length === 0 &&
					entry.depsHash === 'nodeps'
				) {
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

	/**
	 * Adds a file to the compiled file cache.
	 * @param content The file content.
	 * @param rawHash The raw hash key for the file.
	 * @param dependencies The list of dependencies for the file (as relative paths to the vault root).
	 * @param filePath The file path.
	 */
	async addFile(
		content: string,
		rawHash: string,
		dependencies: string[],
		filePath: string,
	) {
		const depsHash = getDependencyHash(dependencies);
		const stem = this.getFileStem(rawHash, depsHash);
		console.warn(`Adding file to cache: ${stem} for path: ${filePath}`, {
			rawHash,
			depsHash,
			dependencies,
			filePath,
		});
		let entries = this.cacheMap.get(rawHash);
		if (!entries) {
			entries = [];
			this.cacheMap.set(rawHash, entries);
		}

		await this.removeNonExistentEntry(rawHash, entries);
		let entry = entries.find((e) => e.depsHash === depsHash);

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

		if (
			this.cacheMap
				.get(rawHash)
				?.filter((e) => e.referencedBy.has(filePath)).length !== 1
		) {
			throw new Error(
				`File ${filePath} is already referenced by another hash or dependency combination.`,
			);
		}

		const fileName = this.stemToFileName(stem);
		await this.cache.addFile(fileName, content);
		if (!this.plugin.settings.dirtyResultFiles.includes(fileName))
			this.plugin.settings.dirtyResultFiles.push(fileName);
		await this.saveCache();
	}

	private async removeNonExistentEntry(rawHash: string, entries: CacheEntry[]) {
		const depsHashesToRemove: string[] = [];
		for (const entry of entries) {
			if (entry.referencedBy.size === 0) {
				await this.cache.deleteFile(
					this.hashesToFileName(rawHash, entry.depsHash),
				);
				depsHashesToRemove.push(entry.depsHash);
				continue;
			}

			if (
				!(await this.cache.fileExists(this.hashesToFileName(entry.depsHash, entry.depsHash),))
			) {
				depsHashesToRemove.push(entry.depsHash);
				continue;
			}
		}

		const indexes = entries
			.map((e, i) => (depsHashesToRemove.includes(e.depsHash) ? i : -1))
			.filter((i) => i !== -1);

		for (const index of indexes.reverse()) {
			entries.splice(index, 1);
		}
	}

	private async getResultFileFromRawHash(
		rawHash: string,
		filePath: string,
		resolveDeps?: () => Promise<string[]>,
	): Promise<string | undefined> {
		const cacheEntries = this.cacheMap.get(rawHash);
		if (!cacheEntries?.length) return undefined;

		// Safe fast case: only one possible result, and it has no deps.
		if (
			cacheEntries.length === 1 &&
			cacheEntries[0].dependencies.length === 0
		) {
			cacheEntries[0].referencedBy.add(filePath);
			return await this.getResultFileFromEntry(rawHash, cacheEntries[0]);
		}

		// Fast known case: this exact file already used one entry before.
		const pathMatches = cacheEntries.filter((entry) =>
			entry.referencedBy.has(filePath),
		);

		if (pathMatches.length === 1) {
			return await this.getResultFileFromEntry(rawHash, pathMatches[0]);
		}

		// Ambiguous / unknown case: now pay the cost of resolving deps.
		if (!resolveDeps) return undefined;

		const dependencyPaths = await resolveDeps();
		const depsHash = getDependencyHash(dependencyPaths);

		const exactEntry = cacheEntries.find(
			(entry) => entry.depsHash === depsHash,
		);

		if (!exactEntry) return undefined;

		exactEntry.referencedBy.add(filePath);
		return await this.getResultFileFromEntry(rawHash, exactEntry);
	}

	private async getResultFileFromEntry(
		rawHash: string,
		entry: CacheEntry,
	): Promise<string | undefined> {
		const stem = this.getFileStem(rawHash, entry.depsHash);
		return await this.cache.getFileAsString(this.stemToFileName(stem));
	}

	/**
	 * Restores the cached content for a given element and hash.
	 * If the content is found in the cache, it sets the innerHTML of the element to the cached content.
	 */
	async restoreFromCache(
		el: HTMLElement,
		rawHash: string,
		filePath: string,
		resolveDeps: () => Promise<string[]>,
	): Promise<boolean> {
		// if the resolve hash is the same as the raw hash, we can directly get the file from the cache so we dont have to check
		const data = await this.getResultFileFromRawHash(rawHash, filePath, resolveDeps);
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
					.map((cacheEntries) =>
						cacheEntries.map((cacheEntry) => [
							...cacheEntry.referencedBy,
						]),
					)
					.flat()
					.flat(),
			),
		];
	}

	getCachedFilePathsForRawHash(rawHash: string): string[] {
		const cacheEntries = this.cacheMap.get(rawHash);
		return cacheEntries
			? [...cacheEntries.flatMap((entry) => [...entry.referencedBy])]
			: [];
	}

	/**
	 * Cleans up the cache by removing files that are no longer referenced.
	 * This includes files that are no longer present in the vault or have been deleted.
	 * It also removes unused caches for files that are still present but no longer have any LaTeX hashes associated with them.
	 */
	private async cleanUpCache(): Promise<void> {
		await this.cache.cleanCache();
		const resultFileNames = await this.cache.listCacheFiles();
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
					console.error(
						`Error removing cache for file ${filePath}:`,
						err,
					);
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
			await this.removeRawHashFromCache(hash);
		}

		for (const filePath of filePathsToRemove) {
			await this.removeReferencingFileFromCache(filePath);
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
		const rawHashesInCache =
			this.getRawHashesFromCacheForReferencingFile(file).rawHashes;

		for (const hash of rawHashesInCache) {
			// if the hash (from the cache) is not present in the file, remove it from the cache
			if (!rawHashesInFile.contains(hash)) {
				await this.removeRawHashFromCache(hash);
			}
		}
	}

	private async removeRawHashFromCache(rawHash: string): Promise<void> {
		const entries = this.cacheMap.get(rawHash);
		this.cacheMap.delete(rawHash);
		if (entries) {
			for (const entry of entries) {
				await this.removeResultFileFromCache(
					this.getFileStem(rawHash, entry.depsHash),
				);
			}
		}
		const resultFileNames = await this.cache.listCacheFiles();
		for (const resultFile of resultFileNames) {
			const { rawHash: rHash } = this.nameToHashes(resultFile);
			if (rHash === rawHash) {
				await this.cache.deleteFile(resultFile);
			}
		}
		this.saveCache();
	}

	async removeResultFileFromCache(stem: string): Promise<boolean> {
		const catchRemoveSuccess = await this.cache.deleteFile(
			this.stemToFileName(stem),
		);
		const { rawHash, depsHash } = this.stemToHashes(stem);
		const entries = this.cacheMap.get(rawHash);
		if (!entries) return false;
		const noEntries = entries.length === 0;
		const wasOnlyEntry =
			entries.length === 1 && entries[0].depsHash === depsHash;
		if (noEntries || wasOnlyEntry) {
			this.cacheMap.delete(rawHash);
			return wasOnlyEntry;
		}
		return catchRemoveSuccess;
	}

	private async removeReferencingFileFromCache(path: string): Promise<void> {
		const referencingEntries: { rawHash: string; entry: CacheEntry }[] = [];
		for (const [rawHash, entries] of this.cacheMap.entries()) {
			const entry = entries.find((e) => e.referencedBy.has(path));
			if (entry) {
				referencingEntries.push({ rawHash, entry });
			}
		}

		for (const { rawHash, entry } of referencingEntries) {
			entry.referencedBy.delete(path);
			if (entry.referencedBy.size === 0) {
				await this.removeResultFileFromCache(
					this.getFileStem(rawHash, entry.depsHash),
				);
			}
		}
	}

	private getRawHashesFromCacheForReferencingFile(file: TFile) {
		const rawHashesSet = new Set<string>(),
			depHashesSet = new Set<string>();

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
	async removeAllCached(): Promise<void> {
		await this.cache.clearCache();
		this.cacheMap.clear();
		this.plugin.settings.dirtyResultFiles = [];
		this.saveCache();
	}

	private stemToFileName(hash: string): string {
		if (resultFileCacheFormat.size !== 1) {
			throw new Error('Result file cache format must have exactly one entry.');
		}
		return `${hash}.${resultFileCacheFormat.keys().next().value}`;
	}

	getFileStem(rawHash: string, deps: string | string[]): string {
		const depsHash = Array.isArray(deps)
			? getDependencyHash(deps)
			: deps;
		return `${rawHash}-${depsHash}`;
	}

	hashesToFileName(rawHash: string, depsHash: string): string {
		return this.stemToFileName(this.getFileStem(rawHash, depsHash));
	}

	stemToHashes(stem: string) {
		if (!isValidFileStem(stem)) {
			throw new Error(`Invalid file stem: ${stem}`);
		}
		const parts = stem.split('-');
		if (parts.length !== 2) {
			throw new Error(`Invalid file stem format: ${stem}`);
		}
		const [rawHash, depsHash] = parts;
		return { rawHash, depsHash };
	}

	nameToHashes(fileName: string) {
		const parts = fileName.split(/[\\/]/).pop()?.split('.');
		parts?.pop(); // Remove the file extension
		if (!parts) throw new Error(`Invalid file name: ${fileName}`);
		return this.stemToHashes(parts.join('.'));
	}

	getAbsolutePathFromStem(stem: string): string {
		if (!this.isPhysicalCatch()) {
			throw new Error(
				'Physical cache is not enabled, cannot get absolute path from stem.',
			);
		}
		const fileName = this.stemToFileName(stem);
		//@ts-ignore (Obsidian doesn't expose this API)
		const vaultPath = this.plugin.app.vault.adapter.basePath;
		const vaultRelativeFilePath = (this.cache as ResultFilePhysicalCache).getCacheFilePath(fileName);

		return normalizePath(`${vaultPath}/${vaultRelativeFilePath}`);
	}
}
