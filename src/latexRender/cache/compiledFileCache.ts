import Moshe from "src/main";
import * as fs from "fs";
import { Notice, TFile } from "obsidian";
import { getLatexHashesFromFile } from "../resolvers/latexSourceFromFile";
import * as path from "path";
import { CacheBase, PhysicalCacheBase, VirtualCacheBase } from "./cacheBase";

export const cacheFileFormat = "svg";

export default class CompiledFileCache {
  private plugin: Moshe;
  /**
   * Map of cached files. hash -> Set of file paths that contain this hash.
   */
  private cacheMap: Map<string, Set<string>>;
  private virtualCache?: CompiledFileVirtualCache;
  private physicalCache?: CompiledFilePhysicalCache;
  private cache: CacheBase;

  constructor(plugin: Moshe) {
    this.plugin = plugin;

    if (this.plugin.settings.physicalCache) {
      this.physicalCache = new CompiledFilePhysicalCache(this.plugin);
      this.cache = this.physicalCache;
    } else {
      this.virtualCache = new CompiledFileVirtualCache(this.plugin);
      this.cache = this.virtualCache;
    }

    this.loadCache();
  }
  changeCacheDirectory() {
    if (this.physicalCache) {
      this.physicalCache.changeCacheDirectory();
    } else {
      const message =
        "Physical cache is not enabled, cannot change cache directory.";
      new Notice(message);
      throw new Error(message);
    }
  }
  togglePhysicalCacheOff() {
    if (!this.physicalCache) {
      console.warn("Physical cache is already disabled, nothing to do.");
      this.virtualCache = new CompiledFileVirtualCache(this.plugin);
      this.cache = this.virtualCache;
      return;
    }
    const filePaths = this.physicalCache.listCacheFiles();
    this.virtualCache = new CompiledFileVirtualCache(this.plugin);
    for (const name of filePaths) {
      const content = this.physicalCache.getFile(name);
      if (!content) {
        console.warn(`File ${name} not found in cache, skipping.`);
        continue;
      }
      this.virtualCache.addFile(name, content);
    }
    this.physicalCache.deleteCacheDirectory();
    this.physicalCache = undefined;
    this.cache = this.virtualCache;
  }

  togglePhysicalCacheOn() {
    if (!this.virtualCache) {
      console.warn("Virtual cache is already disabled, nothing to do.");
      this.physicalCache = new CompiledFilePhysicalCache(this.plugin);
      this.cache = this.physicalCache;
      return;
    }
    this.physicalCache = new CompiledFilePhysicalCache(this.plugin);
    const filePaths = this.cache.listCacheFiles();
    for (const name of filePaths || []) {
      const content = this.virtualCache.getFile(name)!;
      this.physicalCache.addFile(name, content);
    }
    this.cache = this.physicalCache;
    this.virtualCache = undefined;
  }

  togglePhysicalCache() {
    if (this.plugin.settings.physicalCache) {
      this.togglePhysicalCacheOn();
    } else {
      this.togglePhysicalCacheOff();
    }
  }

  private loadCache() {
    const cache = new Map(this.plugin.settings.cache);
    for (const [k, v] of cache) {
      cache.set(k, new Set(v));
    }
    this.cacheMap = cache;
  }

  private async saveCache() {
    let temp = new Map();
    for (const [k, v] of this.cacheMap) {
      temp.set(k, [...v]);
    }
    this.plugin.settings.cache = [...temp];
    await this.plugin.saveSettings();
  }

  async addFile(content: string, hash: string, file_path: string) {
    await this.cache.addFile(hash, content);
    if (!this.cacheMap.has(hash)) {
      this.cacheMap.set(hash, new Set());
    }
    this.cacheMap.get(hash)!.add(file_path);
    this.saveCache();
  }
  /**
   * Restores the cached content for a given element and hash.
   * If the content is found in the cache, it sets the innerHTML of the element to the cached content.
   * @param el 
   * @param hash 
   * @returns 
   */
  restoreFromCache(el: HTMLElement, hash: string) {
    const data = this.cache.getFile(hash);
    if (data === undefined) return false;
    el.innerHTML = data;
    return true;
  }

  fileExists(hash: string, dataPath: string) {
    return this.cacheMap.has(hash) && this.cache.fileExists(dataPath);
  }

  hasHash(hash: string): boolean {
    return this.cacheMap.has(hash);
  }


  getFilePathsFromCache(): string[] {
    return [...new Set([...this.cacheMap.values()].flatMap((set) => [...set]))];
  }
  getFilePathsFromCacheForHash(hash: string): string[] {
    if (!this.cacheMap.has(hash)) return [];
    return [...this.cacheMap.get(hash)!];
  }

  async afterRenderCleanUp() {
    await this.cleanUpCache();
  }
  /**
   * Cleans up the cache by removing files that are no longer referenced.
   * This includes files that are no longer present in the vault or have been deleted.
   * It also removes unused caches for files that are still present but no longer have any LaTeX hashes associated with them.
   */
  private async cleanUpCache(): Promise<void> {
    const cacheFolderFiles = this.cache.listCacheFiles();
    const cacheHashes = [...this.cacheMap.keys()];
    const filePathsToRemove: string[] = [];
    const hashesToRemove: string[] = [];

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

    for (const file of cacheFolderFiles) {
      const hash = file.split(".")[0];
      if (!cacheHashes.includes(hash)) {
        hashesToRemove.push(hash);
      }
    }

    for (const hash of hashesToRemove) {
      await this.removeFileFromCache(hash);
    }

    for (const filePath of filePathsToRemove) {
      this.removeFileFromCache(filePath);
    }

    await this.plugin.saveSettings();
  }
  /**
   * Removes unused caches for a specific file.
   * This checks the LaTeX hashes in the file and removes any hashes from the cache that are not present in the file.
   * If a hash is no longer referenced by any file, it is removed from the cache.
   */
  private async removeUnusedCachesForFile(file: TFile) {
    const hashesInFile = await getLatexHashesFromFile(this.plugin.app,file);
    const hashesInCache = this.getLatexHashesFromCacheForFile(file);
    for (const hash of hashesInCache) {
      // if the hash (from the cache) is not present in the file, remove it from the cache
      if (!hashesInFile.contains(hash)) {
        this.cacheMap.get(hash)?.delete(file.path);
        if (this.cacheMap.get(hash)?.size == 0) {
          await this.removeFileFromCache(hash);
        }
      }
    }
  }

  async removeFileFromCache(key: string) {
    if (this.cacheMap.has(key)) this.cacheMap.delete(key);
    this.cache.deleteFile(key);
    await this.saveCache();
  }

  async removeMdFileCacheDataFromCache(file_path: string) {
    for (const h of this.cacheMap.keys()) {
      this.cacheMap.get(h)?.delete(file_path);
      if (this.cacheMap.get(h)?.size == 0) {
        await this.removeFileFromCache(h);
      }
    }
    await this.saveCache();
  }

  private getLatexHashesFromCacheForFile(file: TFile) {
    const hashes: string[] = [];
    const path = file.path;
    for (const [k, v] of this.cacheMap.entries()) {
      if (v.has(path)) {
        hashes.push(k);
      }
    }
    return hashes;
  }

  public removeAllCached(): void {
    const hashes = this.cache
      .listCacheFiles()
      .map((file) => file.split(".")[0]);
    for (const hash of hashes) {
      this.cache.deleteFile(hash);
    }
    for (const [hash, fileSet] of this.cacheMap.entries()) {
      if (this.cacheMap.delete(hash))
        console.log(`Removed cache entry for ${hash}`);
    }
    this.saveCache();
  }

  unloadCache() {
    this.removeAllCached();
  }
  /**
   * Returns a map of all cached files with their names and content.
   * The key is the file name (with extension), and the value is the file content.
   */
  getCachedFiles(){
    return this.cache.getFiles();
  }
}

class CompiledFileVirtualCache extends VirtualCacheBase {
  getCacheFilePath(fileName: string): string {
    if (fileName.endsWith(`.${cacheFileFormat}`)) {
      fileName = fileName.slice(0, -cacheFileFormat.length - 1);
    }
    return fileName;
  }
  extractFileName(fileName: string) {
    return fileName;
  }
  isValidCacheFile(fileName: string) {
    return fileName.endsWith(`.${cacheFileFormat}`);
  }
}

class CompiledFilePhysicalCache extends PhysicalCacheBase {
  getCacheFilePath(fileName: string): string {
    if (!fileName.endsWith(`.${cacheFileFormat}`)) {
      fileName = `${fileName}.${cacheFileFormat}`;
    }
    return path.join(this.getCacheFolderPath(), fileName);
  }
  extractFileName(filePath: string): string {
    const fileName = path.basename(filePath);
    if (fileName.endsWith(`.${cacheFileFormat}`)) {
      return fileName.slice(0, -cacheFileFormat.length - 1);
    }
    return fileName;
  }
  isValidCacheFile(fileName: string): boolean {
    return fileName.endsWith(`.${cacheFileFormat}`);
  }

  deleteCacheDirectory() {
    fs.rmdirSync(this.getCacheFolderPath(), { recursive: true });
  }

  setCacheFolderPath() {
    let folderPath = "";
    const cacheDir = this.plugin.settings.physicalCacheLocation;
    const basePath = this.plugin.getVaultPath();
    if (cacheDir)
      folderPath = path.join(basePath, cacheDir === "/" ? "" : cacheDir);
    else
      folderPath = path.join(
        basePath,
        this.plugin.app.vault.configDir,
        "swiftlatex-render-cache",
      );

    folderPath = path.join(folderPath, "pdf-cache");
    this.cacheFolderPath = folderPath;
  }

  changeCacheDirectory() {
    if (!this.plugin.settings.physicalCache) {
      new Notice(
        "Physical cache is not enabled, cannot change cache directory.",
      );
      return;
    }

    const oldCacheFiles = this.listCacheFiles();
    const oldCacheFolderPath = this.cacheFolderPath;
    this.setCacheFolderPath();
    const newCacheFolderPath = this.getCacheFolderPath();

    if (newCacheFolderPath === oldCacheFolderPath) {
      new Notice("Cache directory is already set to the specified location.");
      return;
    }
    if (!fs.existsSync(newCacheFolderPath)) {
      fs.mkdirSync(newCacheFolderPath, { recursive: true });
    }
    for (const file of oldCacheFiles) {
      const oldPath = path.join(oldCacheFolderPath, file);
      const newPath = path.join(newCacheFolderPath, file);
      try {
        fs.renameSync(oldPath, newPath);
      } catch (err) {
        console.error(`Failed to move file ${file}:`, err);
      }
    }
    fs.rmdirSync(oldCacheFolderPath, { recursive: true });
  }
}
