import Moshe from "src/main";
import CompiledFileCache from "./compiledFileCache";
import { ProcessedLog } from "../logs/latex-log-parser";
import path from "path";
import * as fs from "fs";
import PackageCache from "./packageCache";
import LogCache from "./logCache";

/**
 * Manages caching for LaTeX files, logs, and packages.
 */
export default class CompilerCache {
  /** Reference to the main plugin instance. */
  private plugin: Moshe;
  /** Handles caching of compiled files. */
  private cache: CompiledFileCache;
  /** Handles caching of LaTeX packages. */
  private packageCache: PackageCache;
  /** Handles caching of compilation logs. */
  private logCache: LogCache;

  /**
   * Initializes the compiler cache and ensures the cache directory exists.
   * @param plugin The main plugin instance.
   */
  constructor(plugin: Moshe) {
    this.plugin = plugin;
    this.validateCatchDirectory();
    this.cache = new CompiledFileCache(this.plugin);
    this.packageCache = new PackageCache(this.plugin);
    this.logCache = new LogCache(this.plugin);
  }

  /**
   * Fetches cached package data.
   */
  fetchPackageCacheData() {
    return this.packageCache.fetchPackageCacheData();
  }
  /**
   * Cleans up after rendering (e.g., clears temporary cache).
   */
  afterRenderCleanUp() {
    return this.cache.afterRenderCleanUp();
  }
  /**
   * Retrieves a cached log by hash.
   * @param hash The hash key for the log.
   */
  getLog(hash: string) {
    return this.logCache.getLog(hash);
  }
  /**
   * Returns a map of all cached files with their names and content.
   * The key is the file name (with extension), and the value is the file content.
   */
  getCompiledFiles() {
    return this.cache.getCachedFiles();
  }
  getCacheMap() {return this.cache.getCacheMap();}
  /**
   * Adds a log to the log cache.
   * @param log The log object or string.
   * @param hash The hash key for the log.
   */
  addLog(log: ProcessedLog | string, hash: string) {
    this.logCache.addLog(log, hash);
  }

  /**
   * Restores a cached file to a DOM element.
   * @param el The target HTML element.
   * @param hash The hash key for the cached file.
   */
  restoreFromCache(el: HTMLElement, hash: string) {
    return this.cache.restoreFromCache(el, hash);
  }

  /**
   * Loads the package cache from disk.
   */
  loadPackageCache() {
    return this.packageCache.loadPackageCache();
  }
  /**
   * Adds a file to the compiled file cache.
   * @param content The file content.
   * @param hash The hash key for the file.
   * @param file_path The file path.
   */
  addFile(content: string, hash: string, file_path: string) {
    this.cache.addFile(content, hash, file_path);
  }

  /**
   * Removes a file from the compiled file cache.
   * @param key The cache key.
   */
  removeFile(key: string) {
    return this.cache.removeFileFromCache(key);
  }
  /**
   * Toggles the use of physical (on-disk) cache.
   */
  togglePhysicalCache() {
    return this.cache.togglePhysicalCache();
  }
  /**
   * Changes the cache directory location.
   */
  changeCacheDirectory() {
    this.cache.changeCacheDirectory();
  }
  /**
   * Removes all cached files from the compiled file cache.
   */
  removeAllCachedFiles() {
    return this.cache.removeAllCached();
  }
  /**
   * Removes all cached packages.
   */
  removeAllCachedPackages() {
    return this.packageCache.removeAllCachedPackages();
  }
  /**
   * @returns An array of file paths from the cache that contain codeBlocks of compiled files.
   */
  getFilePathsFromCache() {
    return this.cache.getFilePathsFromCache();
  }
  /**
   * Gets the parent path for the cache folder.
   * @returns The absolute path to the cache folder parent.
   */
  private getCacheFolderParentPath() {
    return path.join(
      this.plugin.getVaultPath(),
      this.plugin.app.vault.configDir,
      "swiftlatex-render-cache",
    );
  }
  /**
   * Ensures the cache directory exists, creating it if necessary.
   */
  private validateCatchDirectory() {
    const cacheFolderParentPath = this.getCacheFolderParentPath();
    if (!fs.existsSync(cacheFolderParentPath)) {
      fs.mkdirSync(cacheFolderParentPath, { recursive: true });
    }
  }

  /**
   * Gets the compiler instance from the plugin.
   */
  private compiler() {
    return this.plugin.swiftlatexRender.compiler;
  }
  /**
   * Unloads the cache and flushes the compiler cache.
   */
  private async unloadCache() {
    await this.compiler().flushCache();
    this.cache.unloadCache();
  }
}

/**
 * Recursively clears all files and folders in the given folder path.
 * @param folderPath The path to the folder to clear.
 */
export function clearFolder(folderPath: string) {
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
