import Moshe from "src/main";
import { cacheFileFormat, FileCache } from "./fileCache";
import { ProcessedLog } from "../logs/latex-log-parser";
import path from "path";
import * as fs from 'fs';
import { Notice } from "obsidian";
import PackageCache from "./packageCache";
import LogCache from "./logCache";

export default class CompilerCache {
    private plugin: Moshe;
    private cache: FileCache;
    private packageCache: PackageCache;
    private logCache: LogCache;
    
    constructor(plugin: Moshe)
    {
        this.plugin = plugin;
        this.validateCatchDirectory();
        this.cache = new FileCache(this.plugin)
        this.packageCache = new PackageCache(this.plugin);
        this.logCache = new LogCache(this.plugin);
    }
    
    getCachedSvgs() {return this.cache.getCache()}
    getPackageCacheFolderPath() {return this.packageCache.cacheFolderPath;}
    getCacheFolderPath() {return this.cache.cacheFolderPath;}
    hasFile(hash: string, dataPath: string) {return this.cache.hasFile(hash, dataPath);}
    fetchPackageCacheData() {return this.packageCache.fetchPackageCacheData();}
    afterRenderCleanUp() {return this.cache.afterRenderCleanUp();}
    getLog(hash: string) {return this.logCache.getLog(hash);}
    addLog(log: ProcessedLog|string,hash: string) {this.logCache.addLog(log,hash);}
    /**
     * Restores the cached HTML content for a given hash and sets it as the innerHTML of the provided element.
     *
     * @param el - The HTML element to restore the cached content into.
     * @param hash - The unique hash identifying the cached content file.
     * @returns `true` if the cache was successfully restored and applied to the element, `false` otherwise.
     */
    restoreFromCache(el: HTMLElement,hash: string){
        const dataPath = path.join(this.cache.getCacheFolderPath(), `${hash}.${cacheFileFormat}`);
        if(!this.hasFile(hash,dataPath))return false;
        const data = fs.readFileSync(dataPath, 'utf8');
        el.innerHTML = data
        return true;
    }
    private getCacheFolderParentPath() {
        return path.join(this.plugin.getVaultPath(), this.plugin.app.vault.configDir, "swiftlatex-render-cache");
    }
    private validateCatchDirectory(){
        const cacheFolderParentPath = this.getCacheFolderParentPath();
        if (!fs.existsSync(cacheFolderParentPath)) {
            fs.mkdirSync(cacheFolderParentPath, { recursive: true });
        }
    }
        
    loadPackageCache() {return this.packageCache.loadPackageCache();}
    addFile(content: string,hash: string, file_path: string) {this.cache.addFile(content, hash, file_path);}

    async removeFile(key: string){return this.cache.removePDFFromCache(key);}
    changeCacheDirectory(){this.cache.changeCacheDirectory();}
    removeAllCachedFiles() {return this.cache.removeAllCached();}
    private compiler(){
        return this.plugin.swiftlatexRender.compiler;
    }
    private async unloadCache() {
		await this.compiler().flushCache();
		fs.rmdirSync(this.cache.cacheFolderPath, { recursive: true });
	}
}


export function clearFolder(folderPath: string){
    if (fs.existsSync(folderPath)) {
        const packageFiles = fs.readdirSync(folderPath);
        for (const file of packageFiles) {
            const fullPath = path.join(folderPath, file);
            try {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } catch (err) {
                console.error(`Failed to remove file ${fullPath}:`, err);
            }
        }
    }
}