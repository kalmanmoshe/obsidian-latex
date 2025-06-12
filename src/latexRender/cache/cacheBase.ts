import Moshe from "src/main";
import * as fs from 'fs';
import { Notice } from "obsidian";

export abstract class CacheBase {
    constructor(protected plugin: Moshe) {
        
    }
    /**
     * Generates the absolute file path in the cache directory for a given file name.
     * Example: "someFile.pdf" -> "/home/user/.obsidian/latex-render-cache/someFile.pdf"
     * @param fileName The name of the cache file.
     */
    abstract getCacheFilePath(fileName: string): string;
    /**
     * Extracts the file name from a full cache file path.
     * Example: "/home/user/.obsidian/latex-render-cache/someFile.pdf" -> "someFile.pdf"
     * @param filePath The full path to the cache file.
     */
    abstract extractFileName(filePath: string): string;
    abstract isValidCacheFile(fileName: string): boolean;

    abstract fileExists(name: string): boolean;
    abstract getFile(name: string): string | undefined;
    abstract deleteFile(name: string): Promise<void>| void;
    abstract addFile(name: string, content: string|Uint8Array<ArrayBuffer>): Promise<void> | void;
    /**
     * Returns list of cached file names (hash + .extension).
     */
    abstract listCacheFiles(): string[];
}
export abstract class VirtualCacheBase extends CacheBase {
    /**
     * @key: hash of the file with extension
     * @value: content of the file
     */
    protected cache: Map<string, string> = new Map();
    constructor(plugin: Moshe) {
        super(plugin);
        this.cache = new Map();
    }
    fileExists(name: string): boolean {
        return this.cache.has(this.getCacheFilePath(name)) || false;
    }
    getFile(name: string): string | undefined {
        return this.cache.get(this.getCacheFilePath(name));
    }
    addFile(name: string, content: string | Uint8Array<ArrayBuffer>) {
        content = typeof content === "string" ? content : new TextDecoder().decode(content);
        this.cache.set(this.getCacheFilePath(name), content);
    }
    deleteFile(name: string): Promise<void> | void {
        name = this.getCacheFilePath(name);
        if (this.cache.has(name)) {
            this.cache.delete(name);
        } else {
            new Notice(`File ${name} does not exist in the cache.`);
        }
    }
    listCacheFiles() {
        return [...(this.cache.keys() || [])].map(key => this.extractFileName(key));
    }
}

export abstract class PhysicalCacheBase extends CacheBase {
    protected cacheFolderPath: string;
    constructor(plugin: Moshe) {
        super(plugin);
        this.validateDir();
    }
    protected deleteCacheDirectory() {
        const path = this.getCacheFolderPath();
        if (fs.existsSync(path)) {
            fs.rmSync(path, { recursive: true, force: true });
        }
    }
    private validateDir() {
        this.cacheFolderPath = this.getCacheFolderPath();
        if (!fs.existsSync(this.cacheFolderPath)) {
            fs.mkdirSync(this.cacheFolderPath, { recursive: true });
        }
    }
    protected getCacheFolderPath(): string {
        if (!this.cacheFolderPath)
            this.setCacheFolderPath();
        return this.cacheFolderPath;
    }
    protected abstract setCacheFolderPath() : void;
    fileExists(name: string) {
        const filePath = this.getCacheFilePath(name);
        return fs.existsSync(filePath);
    }
    addFile(name: string, content: string | Uint8Array<ArrayBuffer>): Promise<void> {
        const filePath = this.getCacheFilePath(name);
        return fs.promises.writeFile(filePath, content, "utf8");
    }
    deleteFile(name: string) {
        const filePath = this.getCacheFilePath(name);
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
        }
    }
    /**
     * Reads cached content by hash
     */
    getFile(hash: string): string | undefined {
        const filePath = this.getCacheFilePath(hash);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, "utf8");
        } else {
            return undefined;
        }
    }
    listCacheFiles() {
        if (!fs.existsSync(this.getCacheFolderPath())) { return []; }
        const files = fs.readdirSync(this.getCacheFolderPath()).filter(file => {
            if (!this.isValidCacheFile(file)) {
                const message = `Invalid cache file: ${file}`;
                new Notice(message, 5000);
                console.warn(message);
                return false;
            }
            return true
        });
        return files;
    }
}


