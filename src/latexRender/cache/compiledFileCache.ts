import Moshe from "src/main";
import * as fs from "fs";
import { Notice, TFile } from "obsidian";
import { getLatexHashesFromFile } from "./latexSourceFromFile";
import * as path from "path";
import { CacheBase, PhysicalCacheBase, VirtualCacheBase } from "./cacheBase";

export const cacheFileFormat = "svg";

export default class CompiledFileCache {
  private plugin: Moshe;
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

  restoreFromCache(el: HTMLElement, hash: string) {
    const data = this.cache.getFile(hash);
    if (data === undefined) return false;
    el.innerHTML = data;
    return true;
  }

  hasFile(hash: string, dataPath: string) {
    return this.cacheMap.has(hash) && this.cache.fileExists(dataPath);
  }

  private async removeUntraceableFiles() {
    const cacheFolderFiles = this.cache.listCacheFiles();
    const cacheHashes = [...this.cacheMap.keys()];
    const filesToRemove = cacheFolderFiles.filter(
      (file) => !cacheHashes.includes(file.split(".")[0]),
    );
    for (const file of filesToRemove) {
      await this.removeMdFileCacheDataFromCache(file);
    }
  }

  private async removeHashsWithNoCorrespondingPDF() {
    const cacheFolderHashes = this.cache
      .listCacheFiles()
      .map((file) => file.split(".")[0]);
    const cacheHashes = [...this.cacheMap.keys()];
    const hashesToRemove = cacheHashes.filter(
      (hash) => !cacheFolderHashes.includes(hash),
    );
    for (const hash of hashesToRemove) {
      await this.removeMdFileCacheDataFromCache(hash);
    }
  }

  private getFilePathsFromCache(): string[] {
    return [...new Set([...this.cacheMap.values()].flatMap((set) => [...set]))];
  }

  async afterRenderCleanUp() {
    await this.cleanUpCache();
    await this.removeUntraceableFiles();
    await this.removeHashsWithNoCorrespondingPDF();
  }

  private async cleanUpCache(): Promise<void> {
    const filePathsToRemove: string[] = [];
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
    const hashes_in_file = await getLatexHashesFromFile(file, this.plugin.app);
    const hashes_in_cache = this.getLatexHashesFromCacheForFile(file);
    for (const hash of hashes_in_cache) {
      if (!hashes_in_file.contains(hash)) {
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
