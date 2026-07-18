import { clearFolder } from './compilerCache';
import { PhysicalCacheBase } from './cacheBase/physicalCacheBase';
import { extractFileName, joinPaths } from '../resolvers/paths';
import LatexRender from 'src/main';
import { CacheFileExtensions, CacheFileType } from './cacheBase/cacheBase';

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

	constructor(plugin: LatexRender) {
		super(plugin, packageCacheFormat);
	}

	setCacheFolderPath(): void {
		this.cacheFolderPath = joinPaths(
			this.plugin.getDefaultCacheDir(),
			'package-cache',
		);
	}

	async loadPackageCache() {
		console.log("loading package cache")
		// add files in the package cache folder to the cache list
		const packageFiles = await this.listCacheFiles();
		console.log("currnt cache dir: ", this.cacheFolderPath)
		const packageValues = Object.values(this.plugin.settings.packageCache[1]);

		for (const fileName of packageFiles) {
			const value = '/tex/' + fileName;

			if (!packageValues.includes(value)) {
				const key = '26/' + fileName;
				this.plugin.settings.packageCache[1][key] = value;
			}
		}
		
		let totalReadTime = 0;
		let totalWriteTime = 0;
		let fileCount = 0;

		for (const [key, val] of Object.entries(
			this.plugin.settings.packageCache[1] as Record<string, string>,
		)) {
			const fileName = extractFileName(val);

			try {
				let start = performance.now();
				const content = await this.getFile(fileName);
				totalReadTime += performance.now() - start;

				if (!content) {
					throw new Error(
						`Package cache file not found: ${fileName}`,
					);
				}

				start = performance.now();
				await this.compiler().writeTexFSFile(fileName, content);
				totalWriteTime += performance.now() - start;

				fileCount++;
			} catch (error) {
				delete this.plugin.settings.packageCache[1][key];
			}
		}

		console.log({
			fileCount,
			totalReadTime,
			totalWriteTime,
			averageReadTime: totalReadTime / fileCount,
			averageWriteTime: totalWriteTime / fileCount,
		});


		await this.plugin.saveSettings();

		// write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
		await this.writePackageCacheIndex();
	}

	async writePackageCacheIndex() {
		return this.compiler().writePackageCacheIndex(
			{},
			this.plugin.settings.packageCache[1],
			this.plugin.settings.packageCache[2],
			this.plugin.settings.packageCache[3],
		);
	}

	/**
	 * There are four catches:
	 * 1. texlive404_cache - Not found files
	 * 2. texlive200_cache
	 * 3. pk404_cache - Not found files
	 * 4. pk200_cache
	 * currently only dealing with texlive200_cache
	 */
	async fetchPackageCacheData(): Promise<void> {
		try {
			const cacheData = await this.compiler().fetchCacheData();
			const mergedCacheData = Object.assign(
				{},
				cacheData.texlive200,
				cacheData.font200,
			);

			const newFileNames = this.getNewPackageFileNames(
				this.plugin.settings.packageCache[1] as Record<string, string>,
				mergedCacheData,
			);
			const files = await this.compiler().fetchTexFiles(newFileNames);
			for (const file of files) {
				await this.addFile(file.name, file.content);
			}
			this.plugin.settings.packageCache = [
				cacheData.texlive404,
				cacheData.texlive200,
				cacheData.font404,
				cacheData.font200,
			];
			await this.plugin.saveSettings();
		} catch (err) {
			console.error('Error fetching package cache data:', err);
		}
	}
	
	private getNewPackageFileNames(
		oldCacheData: Record<string, string>,
		newCacheData: Record<string, string>,
	): string[] {
		// based on the old and new package files in package cache data,
		// return the new package files
		return Object.keys(newCacheData)
				.filter((key) => !(key in oldCacheData))
				.map((key) => extractFileName(newCacheData[key]));
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
		if (!this.plugin.swiftlatexRender.isNotIos()) {
			throw new Error('Package cache is not supported on iOS.');
		}
		return this.plugin.swiftlatexRender.compiler;
	}
}