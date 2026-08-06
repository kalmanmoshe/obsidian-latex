import LatexCompilerPlugin from 'src/main';
import { FileSystemAdapter, normalizePath, Notice, TFile } from 'obsidian';
import { getLatexHashesFromFile } from '../resolvers/latexSourceFromFile';
import { CacheBase, CacheContent, CacheFileType } from './cacheBase/cacheBase';
import {
	CacheEntry,
	CacheEntryJson,
	CacheJson,
	CacheMap,
	ResultFileFormat,
} from 'src/settings/settings';
import {
	ResultFilePhysicalCache,
	ResultFileVirtualCache,
} from './resultFileCacheTypes';
import { extractStemAndExtension, isValidFileStem } from '../resolvers/paths';
import { optimizeSVG } from '../pdfConversion/optimizeSVG';
import { getDependencyHash } from './compilerCache';
import { insertSvg } from '../pdfConversion/pdfToSVG';
import { LatexRenderMode } from 'src/latexRender/task/latexTask';
import { insertPdf } from '../pdfConversion/pdfToHtml';

export const resultFileCacheFormats = new Map<ResultFileFormat, CacheFileType>([
	['svg', CacheFileType.Text],
	['pdf', CacheFileType.Binary],
]);

function getResultFileFormat(renderMode: LatexRenderMode): ResultFileFormat {
	return renderMode === LatexRenderMode.PDF ? 'pdf' : 'svg'
}

function getRenderModeForCodeBlock(
	codeBlockLanguage: string,
): LatexRenderMode {
	switch (codeBlockLanguage.toLowerCase()) {
		case 'latex':
			return LatexRenderMode.PDF;

		case 'tikz':
		case 'latexsvg':
			return LatexRenderMode.SVG;

		default:
			throw new Error(
				`Unsupported LaTeX code block language: ${codeBlockLanguage}`,
			);
	}
}

function getResultFormatForCodeBlock(codeBlockLanguage: string): ResultFileFormat {
	return getResultFileFormat(
		getRenderModeForCodeBlock(codeBlockLanguage),
	);
}

export default class ResultFileCache {
	private plugin: LatexCompilerPlugin;
	/**
	 * Raw source hash -> cached dependency/format variants.
	 */
	private cacheMap: CacheMap;
	private cache: CacheBase;

	constructor(plugin: LatexCompilerPlugin) {
		this.plugin = plugin;

		if (this.plugin.settings.physicalCache) {
			this.cache = new ResultFilePhysicalCache(this.plugin, resultFileCacheFormats);
		} else {
			this.cache = new ResultFileVirtualCache(this.plugin, resultFileCacheFormats);
		}

		void this.onload();
	}

	private async onload() {
		this.loadCache();
		await this.cleanUpCache();
		await this.finishProcessDirtyFiles();
	}

	isPhysicalCache(): boolean {
		return (this.cache instanceof ResultFilePhysicalCache);
	}

	private async finishProcessDirtyFiles() {
		const dirtyFiles = this.plugin.settings.dirtyResultFiles;
		for (const fileName of dirtyFiles) {
			if (!fileName.endsWith('.svg')) {
				continue;
			}
			const content = await this.cache.getFileAsString(fileName);
			if (content === undefined) {
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
		if (this.isPhysicalCache()) {
			await (this.cache as ResultFilePhysicalCache).changeCacheDirectory();
		} else {
			const message =
				'Physical cache is not enabled, cannot change cache directory.';
			new Notice(message);
			throw new Error(message);
		}
	}

	private async togglePhysicalCacheOff() {
		if (!this.isPhysicalCache()) {
			console.warn('Physical cache is already disabled, nothing to do.');
			return;
		}
		const physicalCache = this.cache as ResultFilePhysicalCache;
		const fileNames = await physicalCache.listCacheFiles();
		this.cache = new ResultFileVirtualCache(this.plugin, resultFileCacheFormats);
		for (const name of fileNames) {
			const content = await physicalCache.getFile(name);
			if (content === undefined) {
				console.warn(`File ${name} not found in cache, skipping.`);
				continue;
			}
			await this.cache.addFile(name, content);
		}
		await physicalCache.deleteCache();
	}

	private async togglePhysicalCacheOn() {
		if (this.isPhysicalCache()) {
			console.warn('Virtual cache is already disabled, nothing to do.');
			return;
		}
		const virtualCache = this.cache as ResultFileVirtualCache;
		this.cache = new ResultFilePhysicalCache(this.plugin, resultFileCacheFormats);
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
		await this.cleanUpCache();
	}

	private loadCache() {
		const raw: CacheJson = this.plugin.settings.cache || {};
		const cache: CacheMap = new Map();

		for (const [hash, entryList] of Object.entries(raw)) {
			const parsedEntries: CacheEntry[] = entryList.map((entry) => {
				const [format, depsHash, dependencies, referencedBy] = entry;
				return {
					format,
					depsHash,
					dependencies,
					referencedBy: new Set(referencedBy),
				};
			});

			cache.set(hash, parsedEntries);
		}

		this.cacheMap = cache;
	}

	private async saveCache() {
		const result: CacheJson = {};

		for (const [hash, entries] of this.cacheMap) {
			const serializedEntries: CacheEntryJson[] = entries.map((entry) => [
				entry.format,
				entry.depsHash,
				entry.dependencies,
				[...entry.referencedBy]
			])
			result[hash] = serializedEntries;
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
	 * @param format The format of the result file (svg, pdf).
	 */
	async addFile(
		content: string | Uint8Array,
		rawHash: string,
		dependencies: string[],
		filePath: string,
		format: ResultFileFormat
	) {
		if (!this.isValidFileContent(content)) {
			// This should never happen, but if it does, we want to know about it.
			// (PDFs must have headers and SVGs must have a root element, so empty content is invalid.)
			throw new Error(`Cannot add empty content to cache for ${filePath} with raw hash ${rawHash}.`);
		}
		const depsHash = getDependencyHash(dependencies);
		const stem = this.getFileStem(rawHash, depsHash);

		let entries = this.cacheMap.get(rawHash);
		if (!entries) {
			entries = [];
			this.cacheMap.set(rawHash, entries);
		}

		await this.removeInvalidCacheEntries(rawHash, entries);
		let targetEntry = entries.find((e) => e.depsHash === depsHash && e.format === format);

		if (targetEntry) {
			targetEntry.referencedBy.add(filePath);
		} else {
			targetEntry = {
				format,
				dependencies,
				depsHash,
				referencedBy: new Set([filePath]),
			};
			entries.push(targetEntry);
		}

		// A file path should not remain attached to an old dependency variant once the same raw hash and format has been resolved to a new dependency variant.
		const staleEntries = entries.filter(
			(entry) =>
				entry !== targetEntry &&
				entry.format === format &&
				entry.referencedBy.has(filePath),
		);

		for (const staleEntry of staleEntries) {
			staleEntry.referencedBy.delete(filePath);

			if (staleEntry.referencedBy.size === 0) {
				await this.removeResultFileFromCache(
					rawHash,
					staleEntry.depsHash,
					staleEntry.format,
				);
			}
		}

		const fileName = this.stemToFileName(stem, format);
		await this.cache.addFile(fileName, content);

		if (
			format === 'svg' &&
			!this.plugin.settings.dirtyResultFiles.includes(fileName)
		) {
			this.plugin.settings.dirtyResultFiles.push(fileName);
		}

		await this.saveCache();
	}

	private async removeInvalidCacheEntries(rawHash: string, entries: CacheEntry[]) {
		const entriesToRemove = new Set<CacheEntry>();
		for (const entry of entries) {
			const fileName = this.hashesToFileName(
				rawHash,
				entry.depsHash,
				entry.format,
			);
			if (entry.referencedBy.size === 0) {
				await this.cache.deleteFile(fileName);
				entriesToRemove.add(entry);
				continue;
			}

			if (
				!(await this.cache.fileExists(fileName))
			) {
				entriesToRemove.add(entry);
				continue;
			}
		}

		for (let index = entries.length - 1; index >= 0; index--) {
			if (entriesToRemove.has(entries[index])) {
				entries.splice(index, 1);
			}
		}
	}

	private async getResultFileFromRawHash(
		rawHash: string,
		filePath: string,
		format: ResultFileFormat,
		resolveDeps?: () => Promise<string[]>,
	): Promise<{ stem: string, data: CacheContent } | undefined> {
		const cacheEntries = this.cacheMap.get(rawHash)?.filter((entry) => entry.format === format);
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
	) {
		const stem = this.getFileStem(rawHash, entry.depsHash);
		const fileName = this.stemToFileName(stem, entry.format);
		const data = await this.cache.getFile(fileName);

		if (data === undefined) { return undefined; }
		if (!this.isValidFileContent(data)) {
			await this.removeResultFileFromCache(rawHash, entry.depsHash, entry.format);
			console.error("Cache entry for", fileName, "is empty. Removed from cache.");
			return undefined;
		}

		return { stem, data };
	}

	/**
	 * Restores the cached content for a given element and hash.
	 * If the content is found in the cache, it sets the innerHTML of the element to the cached content.
	 */
	async restoreFromCache(
		el: HTMLElement,
		rawHash: string,
		filePath: string,
		format: ResultFileFormat,
		resolveDeps: () => Promise<string[]>,
	): Promise<boolean> {
		// if the resolve hash is the same as the raw hash, we can directly get the file from the cache so we dont have to check
		const result = await this.getResultFileFromRawHash(rawHash, filePath, format, resolveDeps);
		if (result === undefined) return false;

		const { stem, data } = result;

		if (format === 'svg') {
			if (typeof data !== 'string') {
				console.warn(`Expected SVG cache entry ${stem} to contain text data.`);
				return false;
			}

			insertSvg(data, el);
			return true;
		}

		if (!(data instanceof Uint8Array)) {
			console.warn(
				`Expected PDF cache entry ${stem} to contain binary data.`,
			);
			return false;
		}
		
		await insertPdf(
			data,
			el,
			stem,
			filePath,
			this.plugin,
		);

		return true;
	}

	hasRawHash(rawHash: string): boolean {
		return this.cacheMap.has(rawHash);
	}

	getAllReferencingFilePathsFromCache(): string[] {
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

	private async cleanUpCache(): Promise<void> {
		await this.cache.purgeInvalidCacheFiles();
		await this.ensureCacheIndexMatchesStoredFiles();
		await this.ensureCacheIndexMatchesVault();
		await this.saveCache();
	}

	/**
	 * remove files that are in the cache but no longer have a matching entry in the cache map.
	 */
	private async ensureCacheIndexMatchesStoredFiles(): Promise<void> {
		const storedFileNames = new Set(await this.cache.listCacheFiles());

		for (const resultFile of storedFileNames) {
			try {
				const { rawHash, depsHash, format } = this.nameToHashes(resultFile);

				const hasMatchingEntry =
					this.cacheMap
						.get(rawHash)
						?.some(
							(entry) =>
								entry.depsHash === depsHash &&
								entry.format === format,
						) ?? false;

				if (!hasMatchingEntry) {
					await this.cache.deleteFile(resultFile);
				}
			} catch (err) {
				console.warn(
					`Removing invalid cache file ${resultFile}:`,
					err,
				);

				await this.cache.deleteFile(resultFile);
			}
		}

		const rawHashesToRemove: string[] = [];

		for (const [rawHash, entries] of this.cacheMap) {
			const validEntries = entries.filter((entry) => {
				const fileName = this.hashesToFileName(
					rawHash,
					entry.depsHash,
					entry.format,
				);

				return storedFileNames.has(fileName);
			});

			if (validEntries.length === 0) {
				rawHashesToRemove.push(rawHash);
			} else if (validEntries.length !== entries.length) {
				this.cacheMap.set(rawHash, validEntries);
			}
		}

		for (const rawHash of rawHashesToRemove) {
			this.cacheMap.delete(rawHash);
		}
	}

	private async ensureCacheIndexMatchesVault() {
		const filePathsToRemove: string[] = [];
		// Find files that dont exsist anymaor if file dose exist, remove unused caches for it.
		for (const filePath of this.getAllReferencingFilePathsFromCache()) {
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (!file) {
				filePathsToRemove.push(filePath);
			} else if (file instanceof TFile) {
				try {
					await this.removeUnusedCacheReferencesForFile(file);
				} catch (err) {
					console.error(
						`Error removing cache for file ${filePath}:`,
						err,
					);
				}
			}
		}
		console.warn("cleanUpcache",this,filePathsToRemove)
		for (const filePath of filePathsToRemove) {
			await this.removeReferencingFileFromCache(filePath);
		}
	}

	/**
	 * Removes unused caches for a specific file.
	 * This checks the LaTeX hashes in the file and removes any hashes from the cache that are not present in the file.
	 * If a hash is no longer referenced by any file, it is removed from the cache.
	 */
	private async removeUnusedCacheReferencesForFile(
		file: TFile,
	): Promise<void> {
		const referencesInFile = await this.getReferencesInFile(file);

		const cachedReferences = this.getCachedReferencesForFile(file.path);

		for (const [rawHash, cachedFormats] of cachedReferences) {
			const formatsInFile = referencesInFile.get(rawHash);

			for (const format of cachedFormats) {
				if (!formatsInFile?.has(format)) {
					await this.removeReference(
						rawHash,
						file.path,
						format,
					);
				}
			}
		}
	}

	private async getReferencesInFile(
		file: TFile,
	): Promise<Map<string, Set<ResultFileFormat>>> {
		const hashes = await getLatexHashesFromFile(
			file,
			this.plugin.app,
		);

		const references = new Map<string, Set<ResultFileFormat>>();

		for (const { hash, name } of hashes) {
			const format = getResultFormatForCodeBlock(name);
			addFormatReference(references, hash, format);
		}

		return references;
	}

	private getCachedReferencesForFile(
		filePath: string,
	): Map<string, Set<ResultFileFormat>> {
		const references = new Map<string, Set<ResultFileFormat>>();

		for (const [rawHash, entries] of this.cacheMap) {
			for (const entry of entries) {
				if (!entry.referencedBy.has(filePath)) {
					continue;
				}
				addFormatReference(references, rawHash, entry.format);
			}
		}

		return references;
	}

	private async removeReference(
		rawHash: string,
		filePath: string,
		format?: ResultFileFormat,
	): Promise<void> {
		const entries = this.cacheMap.get(rawHash);
		if (!entries) return;

		const entriesToRemove: CacheEntry[] = [];

		for (const entry of entries) {
			if (format !== undefined && entry.format !== format) {
				continue;
			}

			if (!entry.referencedBy.delete(filePath)) {
				continue;
			}

			if (entry.referencedBy.size === 0) {
				entriesToRemove.push(entry);
			}
		}

		for (const entry of entriesToRemove) {
			await this.removeResultFileFromCache(
				rawHash,
				entry.depsHash,
				entry.format,
			);
		}
	}

	async removeResultFileFromCache(
		rawHash: string,
		depsHash: string,
		format: ResultFileFormat,
	): Promise<boolean> {
		const fileName = this.hashesToFileName(rawHash, depsHash, format);
		const fileRemoved = await this.cache.deleteFile(fileName);

		const entries = this.cacheMap.get(rawHash);
		if (!entries) {
			return fileRemoved;
		}

		const index = entries.findIndex(
			(entry) =>
				entry.depsHash === depsHash &&
				entry.format === format,
		);

		if (index !== -1) {
			entries.splice(index, 1);
		}

		if (entries.length === 0) {
			this.cacheMap.delete(rawHash);
		}

		return fileRemoved || index !== -1;
	}

	private async removeReferencingFileFromCache(
		filePath: string,
	): Promise<void> {
		for (const rawHash of [...this.cacheMap.keys()]) {
			await this.removeReference(rawHash, filePath);
		}
	}

	/**
	 * Removes all cached files from the compiled file cache.
	 */
	async removeAllCached(): Promise<void> {
		await this.cache.clearCache();
		this.cacheMap.clear();
		this.plugin.settings.dirtyResultFiles = [];
		await this.saveCache();
	}

	private stemToFileName(hash: string, format: ResultFileFormat): string {
		return `${hash}.${format}`;
	}

	getFileStem(rawHash: string, deps: string | string[]): string {
		const depsHash = Array.isArray(deps)
			? getDependencyHash(deps)
			: deps;
		return `${rawHash}-${depsHash}`;
	}

	hashesToFileName(rawHash: string, depsHash: string, format: ResultFileFormat): string {
		return this.stemToFileName(this.getFileStem(rawHash, depsHash), format);
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
		const { stem, extension } = extractStemAndExtension(fileName);
		if (extension !== 'svg' && extension !== 'pdf') {
			throw new Error(`Unsupported cache format: ${extension}`);
		}
		return {
			...this.stemToHashes(stem),
			format: extension,
		};
	}

	getAbsolutePathFromStem(stem: string, format: ResultFileFormat): string {
		if (!this.isPhysicalCache()) {
			throw new Error(
				'Physical cache is not enabled, cannot get absolute path from stem.',
			);
		}
		const adapter = this.plugin.app.vault.adapter;

		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error(
				'Vault adapter is not a FileSystemAdapter, cannot get absolute path.',
			);
		}
		const fileName = this.stemToFileName(stem, format);
		const relativePath = (this.cache as ResultFilePhysicalCache).getCacheFilePath(fileName);

		return adapter.getFullPath(normalizePath(relativePath));
	}

	private isValidFileContent(content: CacheContent): boolean {
		if (typeof content === "string") {
			return content.length > 0;
		} else {
			return content.buffer.byteLength > 0;
		}
	}
}

function addFormatReference(
	map: Map<string, Set<ResultFileFormat>>,
	rawHash: string,
	format: ResultFileFormat,
): void {
	let formats = map.get(rawHash);

	if (!formats) {
		formats = new Set<ResultFileFormat>();
		map.set(rawHash, formats);
	}

	formats.add(format);
}