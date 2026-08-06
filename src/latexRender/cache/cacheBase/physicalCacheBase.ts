import LatexCompilerPlugin from 'src/main';
import { CacheBase, CacheContent, CacheFileExtensions } from './cacheBase';
import { normalizePath } from 'obsidian';
import { mkdirRecursive } from '../compilerCache';

export abstract class PhysicalCacheBase extends CacheBase {
	protected cacheFolderPath: string;
	private readyPromise?: Promise<void>;

	constructor(plugin: LatexCompilerPlugin, cacheFileExtensions: CacheFileExtensions) {
		super(plugin, cacheFileExtensions);
	}

	private async ensureReady() {
		if (!this.readyPromise) {
			this.readyPromise = this.validateDir();
		}
		await this.readyPromise;
	}

	private async validateDir() {
		this.cacheFolderPath = this.getCacheFolderPath();
		await mkdirRecursive(this.plugin.app.vault.adapter, this.cacheFolderPath);
	}

	/**
	 * Generates the absolute file path in the cache directory for a given file name.
	 * Example: "someFile.pdf" -> "/home/user/vault/.obsidian/plugins/plugin/cache/someFile.pdf"
	 * @param fileName The name of the cache file.
	 */
	getCacheFilePath(fileName: string): string {
		this.ensureIsValidFileName(fileName);
		return normalizePath(`${this.getCacheFolderPath()}/${fileName}`);
	}

	async deleteCache() {
		const folder = this.getCacheFolderPath();

		if (await this.plugin.app.vault.adapter.exists(folder)) {
			await this.plugin.app.vault.adapter.rmdir(folder, true);
		}
	}

	async clearCache() {
		await this.deleteCache();
		this.readyPromise = undefined; // Reset the ready promise to allow re-creation of the directory
		await this.ensureReady(); // Recreate the directory after clearing
	}

	protected getCacheFolderPath(): string {
		if (!this.cacheFolderPath) this.setCacheFolderPath();
		return this.cacheFolderPath;
	}

	protected abstract setCacheFolderPath(): void;

	private async getExistingCacheFilePath(
		fileName: string,
	): Promise<string | undefined> {
		await this.ensureReady();

		const filePath = this.getCacheFilePath(fileName);

		if (!(await this.plugin.app.vault.adapter.exists(filePath))) {
			return undefined;
		}

		return filePath;
	}

	async addFile(
		fileName: string,
		content: string | Uint8Array,
	): Promise<void> {
		await this.ensureReady();
		const filePath = this.getCacheFilePath(fileName);

		if (typeof content === "string") {
			await this.plugin.app.vault.adapter.write(filePath, content);
			return;
		}

		await this.plugin.app.vault.adapter.writeBinary(
			filePath,
			content.buffer.slice(
				content.byteOffset,
				content.byteOffset + content.byteLength,
			) as ArrayBuffer,
		);
	}

	async fileExists(fileName: string): Promise<boolean> {
		return (await this.getExistingCacheFilePath(fileName)) !== undefined;
	}

	async deleteFile(fileName: string): Promise<boolean> {
		const filePath = await this.getExistingCacheFilePath(fileName);
		if (!filePath) return false;

		await this.plugin.app.vault.adapter.remove(filePath);
		return true;
	}

	async getFileAsString(fileName: string): Promise<string | undefined> {
		const filePath = await this.getExistingCacheFilePath(fileName);
		if (!filePath) return undefined;

		return this.plugin.app.vault.adapter.read(filePath);
	}

	async getFileAsBinary(fileName: string): Promise<Uint8Array | undefined> {
		const filePath = await this.getExistingCacheFilePath(fileName);
		if (!filePath) return undefined;

		const buffer = await this.plugin.app.vault.adapter.readBinary(filePath);
		return new Uint8Array(buffer);
	}

	async getFiles() {
		const files = await this.listCacheFiles();
		const fileMap = new Map<string, CacheContent>();
		for (const file of files) {
			const content = await this.getFile(file);
			if (content) {
				fileMap.set(file, content);
			}
		}
		return fileMap;
	}

	/**
	 *
	 * @returns An array of file names (with extension) in the cache directory.
	 */
	async listCacheFiles() {
		await this.ensureReady();

		const listed = await this.plugin.app.vault.adapter.list(
			this.getCacheFolderPath(),
		);

		return listed.files
			.map((path) => path.split(/[\\/]/).pop()!)
			.filter((file) => this.isValidFileName(file));
	}

	async purgeInvalidCacheFiles() {
		await this.ensureReady();

		const listed = await this.plugin.app.vault.adapter.list(
			this.getCacheFolderPath(),
		);

		for (const filePath of listed.files) {
			const fileName = filePath.split(/[\\/]/).pop()!;
			if (!this.isValidFileName(fileName)) {
				await this.plugin.app.vault.adapter.remove(filePath);
			}
		}
	}
}
