import { extractFileName } from 'src/latexRender/resolvers/paths';
import { CacheBase, CacheContent, CacheFileType } from './cacheBase';

export abstract class VirtualCacheBase extends CacheBase {
	/**
	 * @key: name of the file with extension
	 * @value: content of the file
	 */
	protected cache: Map<string, CacheContent> = new Map();

	async fileExists(fileName: string) {
		return this.cache.has(fileName) || false;
	}

	async getFileAsString(fileName: string): Promise<string | undefined> {
		if (this.getFileType(fileName) !== CacheFileType.Text) {
			throw new Error(`"${fileName}" is not a text cache file.`);
		}

		const content = this.cache.get(fileName);

		if (content === undefined) return undefined;

		if (typeof content !== "string") {
			throw new Error(`"${fileName}" contains binary data.`);
		}

		return content;
	}

	async getFileAsBinary(fileName: string): Promise<Uint8Array | undefined> {
		if (this.getFileType(fileName) !== CacheFileType.Binary) {
			throw new Error(`"${fileName}" is not a binary cache file.`);
		}

		const content = this.cache.get(fileName);

		if (content === undefined) return undefined;

		if (!(content instanceof Uint8Array)) {
			throw new Error(`"${fileName}" contains text data.`);
		}

		return content;
	}

	async getFiles(): Promise<Map<string, CacheContent>> {
		const newCache = new Map<string, CacheContent>();
		this.cache.forEach((value, key) =>
			newCache.set(extractFileName(key), value),
		);
		return newCache;
	}

	async addFile(fileName: string, content: CacheContent) {
		content =
			typeof content === 'string'
				? content
				: new TextDecoder().decode(content);
		this.cache.set(fileName, content);
	}

	async deleteFile(fileName: string) {
		if (this.cache.has(fileName)) {
			this.cache.delete(fileName);
			return true;
		}
		return false;
	}

	async listCacheFiles() {
		return [...(this.cache.keys() || [])];
	}

	async deleteCache() {
		this.cache.clear();
		this.cache = undefined as any;
	}

	async clearCache() {
		this.cache.clear();
	}

	async cleanCache(): Promise<void> {
		const keys = [...this.cache.keys()];
		keys.forEach((key) => {
			if (!this.isValidFileName(key)) {
				this.cache.delete(key);
			}
		});
	}
}
