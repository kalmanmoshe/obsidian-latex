import Moshe from "src/main";
import { CacheBase } from "./cacheBase";
import * as fs from "fs";
import { Notice } from "obsidian";
import path from "path";

export abstract class PhysicalCacheBase extends CacheBase {
    protected cacheFolderPath: string;
    constructor(plugin: Moshe, cacheFileExtensions: string[]) {
        super(plugin, cacheFileExtensions);
        this.validateDir();
    }

    /**
     * Generates the absolute file path in the cache directory for a given file name.
     * Example: "someFile.pdf" -> "/home/user/.obsidian/latex-render-cache/someFile.pdf"
     * @param fileName The name of the cache file.
     */
    getCacheFilePath(fileName: string): string {
        this.ensureIsValidFileName(fileName);
        return path.join(this.getCacheFolderPath(), fileName);
    }

    deleteCache() {
        const path = this.getCacheFolderPath();
        if (fs.existsSync(path)) {
            fs.rmSync(path, { recursive: true, force: true });
        }
    }
    clearCache() {
        this.deleteCache();
        this.validateDir(); // Recreate the directory after clearing
    }

    private validateDir() {
        this.cacheFolderPath = this.getCacheFolderPath();
        if (!fs.existsSync(this.cacheFolderPath)) {
            fs.mkdirSync(this.cacheFolderPath, { recursive: true });
        }
    }

    protected getCacheFolderPath(): string {
        if (!this.cacheFolderPath) this.setCacheFolderPath();
        return this.cacheFolderPath;
    }

    protected abstract setCacheFolderPath(): void;

    fileExists(fileName: string) {
        const filePath = this.getCacheFilePath(fileName);
        return fs.existsSync(filePath);
    }

    addFile(fileName: string, content: string | Uint8Array<ArrayBuffer>): Promise<void> {
        const filePath = this.getCacheFilePath(fileName);
        return fs.promises.writeFile(filePath, content, "utf8");
    }

    deleteFile(fileName: string) {
        const filePath = this.getCacheFilePath(fileName);
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
        }
    }

    /**
     * Reads cached content by name
     */
    getFile(fileName: string): string | undefined {
        const filePath = this.getCacheFilePath(fileName);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, "utf8");
        } else {
            return undefined;
        }
    }

    getFiles() {
        const files = this.listCacheFiles();
        const fileMap = new Map<string, string>();
        for (const file of files) {
            const content = this.getFile(file);
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
    listCacheFiles() {
        if (!fs.existsSync(this.getCacheFolderPath())) {
            return [];
        }
        const files = fs.readdirSync(this.getCacheFolderPath()).filter((file) => {
            if (!this.isValidFileName(file)) {
                const message = `Invalid cache file: ${file}`;
                new Notice(message, 5000);
                console.warn(message);
                return false;
            }
            return true;
        });
        return files;
    }
}