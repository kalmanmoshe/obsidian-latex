import Moshe from "../../main";
import * as fs from "fs";
import { Notice, TFile } from "obsidian";
import { getLatexHashesFromFile } from "./latexSourceFromFile";
import * as path from "path";

export const cacheFileFormat = "svg";

export default class CompiledFileCache {
  private plugin: Moshe;
  private cacheMap: Map<string, Set<string>>;
  private virtualCache?: VirtualCache;
  private physicalCache?: PhysicalCache;
  private cache: FileCache;

  constructor(plugin: Moshe) {
    this.plugin = plugin;

    if (this.plugin.settings.physicalCache) {
      this.physicalCache = new PhysicalCache(this.plugin);
      this.cache = this.physicalCache;
    } else {
      this.virtualCache = new VirtualCache(this.plugin);
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
      this.virtualCache = new VirtualCache(this.plugin);
      this.cache = this.virtualCache;
      return;
    }
    const filePaths = this.physicalCache.listCacheFiles();
    this.virtualCache = new VirtualCache(this.plugin);
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
      this.physicalCache = new PhysicalCache(this.plugin);
      this.cache = this.physicalCache;
      return;
    }
    this.physicalCache = new PhysicalCache(this.plugin);
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

  getCache(): Map<string, Set<string>> {
    return this.cacheMap;
  }
}
interface FileCache {
  fileExists(name: string): boolean;
  getFile(name: string): string | undefined;
  deleteFile(name: string): Promise<void> | void;
  addFile(name: string, content: string): Promise<void> | void;
  /**
   * Returns list of cached file names (hash + .extension).
   */
  listCacheFiles(): string[];
}
class VirtualCache implements FileCache {
  /**
   * @key: hash of the file without extension
   * @value: content of the file
   */
  private cache: Map<string, string>;
  private createCachePath(name: string): string {
    if (name.endsWith(`.${cacheFileFormat}`)) {
      name = name.slice(0, -cacheFileFormat.length - 1);
    }
    return name;
  }
  constructor(private plugin: Moshe) {
    this.cache = new Map();
  }
  fileExists(name: string) {
    return this.cache.has(this.createCachePath(name)) || false;
  }
  getFile(name: string): string | undefined {
    return this.cache.get(this.createCachePath(name));
  }
  addFile(name: string, content: string): Promise<void> | void {
    this.cache.set(this.createCachePath(name), content);
  }
  deleteFile(name: string): Promise<void> | void {
    name = this.createCachePath(name);
    if (this.cache.has(name)) {
      this.cache.delete(name);
    } else {
      new Notice(`File ${name} does not exist in the cache.`);
    }
  }
  listCacheFiles() {
    return [...(this.cache.keys() || [])].map(
      (hash) => `${hash}.${cacheFileFormat}`,
    );
  }
}
class PhysicalCache implements FileCache {
  private cacheFolderPath: string;

  constructor(private plugin: Moshe) {
    this.validateDir();
  }
  deleteCacheDirectory() {
    fs.rmdirSync(this.getCacheFolderPath(), { recursive: true });
  }
  validateDir() {
    this.cacheFolderPath = this.getCacheFolderPath();
    if (!fs.existsSync(this.cacheFolderPath)) {
      fs.mkdirSync(this.cacheFolderPath, { recursive: true });
    }
  }
  private createCachePath(hash: string): string {
    if (!hash.endsWith(`.${cacheFileFormat}`)) {
      hash = `${hash}.${cacheFileFormat}`;
    }
    return path.join(this.getCacheFolderPath(), hash);
  }

  fileExists(name: string) {
    const filePath = this.createCachePath(name);
    return fs.existsSync(filePath);
  }
  addFile(name: string, content: string): Promise<void> {
    const filePath = this.createCachePath(name);
    return fs.promises.writeFile(filePath, content, "utf8");
  }
  deleteFile(name: string) {
    const filePath = this.createCachePath(name);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  }
  /**
   * Reads cached content by hash
   */
  getFile(hash: string): string | undefined {
    const filePath = this.createCachePath(hash);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8");
    } else {
      return undefined;
    }
  }
  listCacheFiles() {
    return fs.existsSync(this.getCacheFolderPath())
      ? fs
          .readdirSync(this.getCacheFolderPath())
          .filter((f) => f.endsWith(`.${cacheFileFormat}`))
      : [];
  }
  private getCacheFolderPath() {
    if (!this.cacheFolderPath) this.setCacheFolderPath();
    return this.cacheFolderPath;
  }

  private setCacheFolderPath() {
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
