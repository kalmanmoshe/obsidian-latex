import Moshe from "src/main";
import CompiledFileCache , { cacheFileFormat } from "./fileCache";
import { ProcessedLog } from "../logs/latex-log-parser";
import path from "path";
import * as fs from 'fs';
import PackageCache from "./packageCache";
import LogCache from "./logCache";

interface BaseCache {
    add(content: string, path: string): void;
    has(hash: string, dataPath: string): boolean;
    remove(hash: string): Promise<void>;
}
export default class CompilerCache {
    private plugin: Moshe;
    private cache: CompiledFileCache;
    private packageCache: PackageCache;
    private logCache: LogCache;
    
    constructor(plugin: Moshe)
    {
        this.plugin = plugin;
        this.validateCatchDirectory();
        this.cache = new CompiledFileCache(this.plugin)
        this.packageCache = new PackageCache(this.plugin);
        this.logCache = new LogCache(this.plugin);
    }
    
    getCachedSvgs() {return this.cache.getCache()}
    getPackageCacheFolderPath() {return this.packageCache.cacheFolderPath;}
    hasFile(hash: string, dataPath: string) {return this.cache.hasFile(hash, dataPath);}
    fetchPackageCacheData() {return this.packageCache.fetchPackageCacheData();}
    afterRenderCleanUp() {return this.cache.afterRenderCleanUp();}
    getLog(hash: string) {return this.logCache.getLog(hash);}
    addLog(log: ProcessedLog|string,hash: string) {this.logCache.addLog(log,hash);}
    
    private getCacheFolderParentPath() {
        return path.join(this.plugin.getVaultPath(), this.plugin.app.vault.configDir, "swiftlatex-render-cache");
    }
    private validateCatchDirectory(){
        const cacheFolderParentPath = this.getCacheFolderParentPath();
        if (!fs.existsSync(cacheFolderParentPath)) {
            fs.mkdirSync(cacheFolderParentPath, { recursive: true });
        }
    }
    restoreFromCache(el: HTMLElement,hash: string){
        return this.cache.restoreFromCache(el, hash);
    }
        
    loadPackageCache() {return this.packageCache.loadPackageCache();}
    addFile(content: string,hash: string, file_path: string) {this.cache.addFile(content, hash, file_path);}

    async removeFile(key: string){return this.cache.removeFileFromCache(key);}
    togglePhysicalCache(){return this.cache.togglePhysicalCache();}
    changeCacheDirectory(){this.cache.changeCacheDirectory();}
    removeAllCachedFiles() {return this.cache.removeAllCached();}
    private compiler(){
        return this.plugin.swiftlatexRender.compiler;
    }
    private async unloadCache() {
		await this.compiler().flushCache();
		this.cache.unloadCache()
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