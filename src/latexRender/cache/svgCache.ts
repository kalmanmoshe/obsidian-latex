import Moshe from "src/main";
import * as fs from 'fs';
import { TFile } from "obsidian";
import { getLatexHashesFromFile } from "./latexSourceFromFile";
import * as path from 'path';
import { clearFolder } from "../main";
export const cacheFileFormat="svg"
export class SvgCache {
    private plugin: Moshe;
    private cacheFolderPath: string;
    private cache: Map<string, Set<string>>;
    constructor(plugin: Moshe,cache: Map<string, Set<string>>,folderPath: string) {
        this.plugin = plugin;
        this.cache = cache;
        this.cacheFolderPath = folderPath;
    }

    private async saveCache() {
        let temp = new Map();
        for (const [k, v] of this.cache) {
            temp.set(k, [...v])
        }
        this.plugin.settings.cache = [...temp];
        await this.plugin.saveSettings();
    }
    
    addFile(hash: string, file_path: string) {
        if (!this.cache.has(hash)) {
            this.cache.set(hash, new Set());
        }
        this.cache.get(hash)!.add(file_path);
        this.saveCache();
    }
    hasFile(hash: string, dataPath: string) {
        return this.cache.has(hash) && fs.existsSync(dataPath)
    }
    /**
     * Removes PDFS that don't have a reference to them in the catch, Aka will never be used as there will never be reached
     */
    private async removeUntraceablePDFs(){
        const cacheFolderfiles = fs.readdirSync(this.cacheFolderPath);
        const cacheFiles = [...this.cache.keys()];
        const filesToRemove = cacheFolderfiles.filter(file => !cacheFiles.includes(file.split(".")[0]));
        for (const file of filesToRemove) {
            await this.removePDFFromCache(file);
        }
    }
    private async removeHashsWithNoCorrespondingPDF(){
        const cacheFolderfiles = fs.readdirSync(this.cacheFolderPath).map(file => file.split(".")[0]);
        const cacheFiles = [...this.cache.keys()];
        const filesToRemove = cacheFiles.filter(file => !cacheFolderfiles.includes(file));
        for (const file of filesToRemove) {
            await this.removePDFFromCache(file);
        }
    }
    /**
     * Remove all unused cachet svgs from the cache and file system.
    */
    private getFilePathsFromCache(): string[] {
        return [...new Set([...this.cache.values()].flatMap(set => [...set]))];
    }
    async afterRenderCleanUp(){
        await this.cleanUpCache();
        await this.removeUntraceablePDFs();
        await this.removeHashsWithNoCorrespondingPDF()
    }
    /**
     * Iterates over the file paths in the catch
     * and removes the cache entries for the files that do not exist.
     * Also removes the ones that do not exist in the vault.
     */
    private async cleanUpCache(): Promise<void> {
        const filePathsToRemove: string[] = [];
        // Collect file paths safely first
        for (const filePath of this.getFilePathsFromCache()) {
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
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
        for (const filePath of filePathsToRemove) {
            this.removeFileFromCache(filePath);
        }
        await this.plugin.saveSettings();
    }
    

    private async removeUnusedCachesForFile(file: TFile) {
        const hashes_in_file = await getLatexHashesFromFile(file,this.plugin.app);
        const hashes_in_cache = this.getLatexHashesFromCacheForFile(file);
        for (const hash of hashes_in_cache) {
            if (!hashes_in_file.contains(hash)) {
                this.cache.get(hash)?.delete(file.path);
                if (this.cache.get(hash)?.size == 0) {
                    await this.removePDFFromCache(hash);
                }
            }
        }
    }
    /**
     * Removes a PDF from the cache and deletes the corresponding file from the file system.
     * @param key The hash key of the PDF to be removed from the cache.
     */
    async removePDFFromCache(key: string) {
        if(this.cache.has(key))
            this.cache.delete(key);
        const filePath=path.join(this.cacheFolderPath, `${key}.${cacheFileFormat}`);
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
        }
        await this.saveCache();
    }
    /**
     * Removes a specific file from the cache. if the hase (the svg) in which the file is stored is empty, remove it from the cache as well.
     *
     * @param file_path - The path of the file to be removed from the cache.
     */
    private async removeFileFromCache(file_path: string) {
        for (const hash of this.cache.keys()) {
            this.cache.get(hash)?.delete(file_path);
            if (this.cache.get(hash)?.size == 0) {
                await this.removePDFFromCache(hash);
            }
        }
        await this.saveCache();
    }

    private getLatexHashesFromCacheForFile(file: TFile) {
        const hashes: string[] = [];
        const path = file.path;
        for (const [k, v] of this.cache.entries()) {
            if (v.has(path)) {
                hashes.push(k);
            }
        }
        return hashes;
    }

    /**
     * Remove all cached SVG files from the file system and update the settings.
     */
    public removeAllCachedSvgs(): void {
        clearFolder(this.cacheFolderPath);
        for (const [hash, fileSet] of this.cache.entries()) {
            if(this.cache.delete(hash))
                console.log(`Removed cache entry for ${hash}`);
        }
        this.saveCache();
    }
    getCache(): Map<string, Set<string>> {return this.cache}
}