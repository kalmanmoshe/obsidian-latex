import LatexRender from "src/main";
import { CacheBase } from "./cacheBase";
import { Notice } from "obsidian";
import { cacheFileFormat } from "../resultFileCache";

export abstract class VirtualCacheBase extends CacheBase {
    /**
     * @key: name of the file with extension
     * @value: content of the file
     */
    protected cache: Map<string, string> = new Map();
    constructor(plugin: LatexRender) {
        super(plugin, [cacheFileFormat]);
        this.cache = new Map();
    }
    fileExists(fileName: string): boolean {
        return this.cache.has(fileName) || false;
    }
    getFile(fileName: string): string | undefined {
        return this.cache.get(fileName);
    }
    getFiles(): Map<string, string> {
        const newCache = new Map<string, string>();
        this.cache.forEach((value, key) => newCache.set(this.extractFileName(key), value));
        return newCache;
    }
    addFile(fileName: string, content: string | Uint8Array<ArrayBuffer>) {
        content = typeof content === "string" ? content : new TextDecoder().decode(content);
        this.cache.set(fileName, content);
    }
    deleteFile(fileName: string) {
        if (this.cache.has(fileName)) {
            this.cache.delete(fileName);
            return true;
        }
        return false;
    }

    listCacheFiles() {
        return [...(this.cache.keys() || [])]
    }

    deleteCache(): void {
        this.cache.clear();
        this.cache = (undefined as any);
    }
    clearCache(): void {
        this.cache.clear();
    }
    cleanCache(): void {
        const keys = [...this.cache.keys()];
        keys.forEach(key => {
            if (!this.isValidFileName(key)) {
                this.cache.delete(key);
            }
        });
    }
}
