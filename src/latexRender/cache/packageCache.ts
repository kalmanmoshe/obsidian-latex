import { clearFolder } from './compilerCache';
import { PhysicalCacheBase } from './cacheBase/physicalCacheBase';
import { extractFileName, joinPaths } from '../resolvers/paths';
import LatexCompilerPlugin from 'src/main';
import { CacheFileExtensions, CacheFileType } from './cacheBase/cacheBase';
import { StringMap } from 'src/settings/settings';

export const packageCacheFormat: CacheFileExtensions = new Map([
	["tex", CacheFileType.Text],
	["sty", CacheFileType.Text],
	["cls", CacheFileType.Text],
	["clo", CacheFileType.Text],
	["cfg", CacheFileType.Text],
	["def", CacheFileType.Text],
	["fd", CacheFileType.Text],
	["ldf", CacheFileType.Text],
	["mkii", CacheFileType.Text],
	["dict", CacheFileType.Text],

	["pdf", CacheFileType.Binary],
	["fmt", CacheFileType.Binary],
	["ttf", CacheFileType.Binary],
	["pfb", CacheFileType.Binary],
	["tfm", CacheFileType.Binary],
	["ofm", CacheFileType.Binary],
	["otf", CacheFileType.Binary],
	["enc", CacheFileType.Binary],
	["map", CacheFileType.Binary],
	["tec", CacheFileType.Binary],
	["txt", CacheFileType.Binary],
]);

export default class PackageCache extends PhysicalCacheBase {

	constructor(plugin: LatexCompilerPlugin) {
		super(plugin, packageCacheFormat);
	}

	setCacheFolderPath(): void {
		this.cacheFolderPath = joinPaths(
			this.plugin.getDefaultCacheDir(),
			'package-cache',
		);
	}

	async loadPackageCache() {
		// add files in the package cache folder to the cache list
		const packageFiles = await this.listCacheFiles();
		const packageValues = Object.values(this.plugin.settings.packageCache[1]);

		for (const fileName of packageFiles) {
			const value = '/tex/' + fileName;

			if (!packageValues.includes(value)) {
				const key = '26/' + fileName;
				this.plugin.settings.packageCache[1][key] = value;
			}
		}

		for (const [key, val] of Object.entries(
			this.plugin.settings.packageCache[1] as Record<string, string>,
		)) {
			const fileName = extractFileName(val);

			try {
				const content = await this.getFile(fileName);

				if (!content) {
					throw new Error(
						`Package cache file not found: ${fileName}`,
					);
				}

				await this.compiler().writeTexFSFile(fileName, content);

			} catch (error) {
				delete this.plugin.settings.packageCache[1][key];
			}
		}


		await this.plugin.saveSettings();

		// write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
		await this.writePackageCacheIndex();
	}

	async writePackageCacheIndex() {
		return this.compiler().writePackageCacheIndex({
			missingPackages: this.plugin.settings.packageCache[0],
			cachedPackages: this.plugin.settings.packageCache[1],
			missingFonts: this.plugin.settings.packageCache[2],
			cachedFonts: this.plugin.settings.packageCache[3],
		});
	}

	async fetchPackageCacheData(): Promise<void> {
		try {
			const cacheData = await this.compiler().fetchCacheData();

			const knownFileNames = new Set(
				Object.values({
					...this.plugin.settings.packageCache[1],
					...this.plugin.settings.packageCache[3],
				}).map((path) => extractFileName(String(path))),
			);

			const files: {
				name: string;
				content: Uint8Array<ArrayBuffer>;
			}[] = [];

			for (const [engineIndex, engineCacheData] of cacheData.entries()) {

				const engineCachedFiles: StringMap = {
					...engineCacheData.cachedPackages,
					...engineCacheData.cachedFonts,
				};

				const newFileNames = [
					...new Set(
						Object.values(engineCachedFiles)
							.map((path) => extractFileName(String(path)))
							.filter(
								(fileName) => !knownFileNames.has(fileName),
							),
					),
				];

				/*
				* Mark them before processing the next engine so another
				* worker does not report the same shared file as new.
				*/
				for (const fileName of newFileNames) {
					knownFileNames.add(fileName);
				}

				if (newFileNames.length === 0) { continue; }

				const engineFiles = await this.compiler().fetchTexFiles(
					engineIndex,
					newFileNames,
				);

				files.push(...engineFiles);
			}

			for (const file of files) {
				await this.addFile(file.name, file.content);
			}

			this.plugin.settings.packageCache = [
				Object.assign({}, ...cacheData.map((data) => data.missingPackages)),
				Object.assign({}, ...cacheData.map((data) => data.cachedPackages)),
				Object.assign({}, ...cacheData.map((data) => data.missingFonts)),
				Object.assign({}, ...cacheData.map((data) => data.cachedFonts)),
			];

			await this.plugin.saveSettings();
		} catch (err) {
			console.error('Error fetching package cache data:', err);
		}
	}

	/**
	 * Remove all cached package files from the file system and update the settings.
	 */
	async removeAllCachedPackages(): Promise<void> {
		await clearFolder(this.plugin.app.vault.adapter, this.getCacheFolderPath());
		this.plugin.settings.packageCache = [{}, {}, {}, {}];
		this.plugin.saveSettings()
	}

	private compiler() {
		if (!this.plugin.latexRenderer.isNotIos()) {
			throw new Error('Package cache is not supported on iOS.');
		}
		return this.plugin.latexRenderer.compiler;
	}
}