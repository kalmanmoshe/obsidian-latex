import Moshe from "src/main";
import ResultFileCache from "./resultFileCache";
import { ProcessedLog } from "../logs/latex-log-parser";
import path from "path";
import * as fs from "fs";
import PackageCache from "./packageCache";
import LogCache from "./logCache";

export enum CacheStatus {
  NotCached = "NotCached",
  Cached = "Cached",
  Error = "Error",
}
/**
 * Manages caching for LaTeX files, logs, and packages.
 */
export default class CompilerCache {
  /** Reference to the main plugin instance. */
  private plugin: Moshe;
  /** Handles caching of compiled files. */
  resultFileCache: ResultFileCache;
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
    this.resultFileCache = new ResultFileCache(this.plugin);
    this.packageCache = new PackageCache(this.plugin, [".sty", ".cls", ".tex"]);
    this.logCache = new LogCache(this.plugin);
  }

  /**
   * Fetches cached package data.
   */
  fetchPackageCacheData() {
    return this.packageCache.fetchPackageCacheData();
  }
  
  /**
   * Retrieves a cached log by hash.
   * @param hash The hash key for the log.
   */
  getLog(hash: string) {
    return this.logCache.getLog(hash);
  }
  async forceGetLog(hash: string, config: { source: string, sourcePath: string }) {
    const log = this.getLog(hash) || await this.logCache.forceGetLog(hash, config);
    if (!log) {
      throw new Error("No log found for this hash, nor was one able to be produced.")
    }
    return log
  }

  /**
   * Adds a log to the log cache.
   * @param log The log object or string.
   * @param hash The hash key for the log.
   */
  addLog(log: ProcessedLog | string, hash: string) {
    this.logCache.addLog(log, hash);
  }

  /**
   * Loads the package cache from disk.
   */
  loadPackageCache() {
    return this.packageCache.loadPackageCache();
  }

  /**
   * Removes all cached packages.
   */
  removeAllCachedPackages() {
    return this.packageCache.removeAllCachedPackages();
  }

  /**
   * Gets the parent path for the cache folder.
   * @returns The absolute path to the cache folder parent.
   */
  private getCacheFolderParentPath() {
    return path.join(
      this.plugin.getVaultPath(),
      app.vault.configDir,
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
  cacheStatusForHash(hash: string) {
    switch (true) {
      case this.resultFileCache.hasHash(hash):
        return CacheStatus.Cached;
      case this.logCache.hasLog(hash)://We have only the log - this means its in error state
        return CacheStatus.Error;
      default:
        return CacheStatus.NotCached;
    }
  }
  cacheStatusForHashAsNum(hash: string): number {
    const status = this.cacheStatusForHash(hash);
    const statusToNum: Record<CacheStatus, number> = {
      [CacheStatus.Cached]: 0,
      [CacheStatus.Error]: 2,
      [CacheStatus.NotCached]: 4,
    };
    return statusToNum[status];
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
    this.resultFileCache.removeAllCached();
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
