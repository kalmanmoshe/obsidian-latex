import path from "path";
import { StringMap } from "src/settings/settings";
import { clearFolder } from "./compilerCache";
import * as fs from "fs";
import { PhysicalCacheBase } from "./cacheBase";
export default class PackageCache extends PhysicalCacheBase {
  setCacheFolderPath(): void {
    const basePath = this.plugin.getVaultPath();
    this.cacheFolderPath = path.join(
      basePath,
      this.plugin.app.vault.configDir,
      "swiftlatex-render-cache",
      "package-cache",
    );
  }
  getCacheFilePath(fileName: string): string {
    return path.join(this.getCacheFolderPath(), fileName);
  }
  extractFileName(filePath: string): string {
    return path.basename(filePath);
  }
  isValidCacheFile(fileName: string): boolean {
    const validExtensions = [".sty", ".cls", ".tex"];
    return validExtensions.includes(path.extname(fileName).toLowerCase());
  }
  async loadPackageCache() {
    // add files in the package cache folder to the cache list
    const packageFiles = fs.readdirSync(this.getCacheFolderPath());
    for (const file of packageFiles) {
      const filename = path.basename(file);
      const value = "/tex/" + filename;
      const packageValues = Object.values(this.plugin.settings.packageCache[1]);
      if (!packageValues.includes(value)) {
        const key = "26/" + filename;
        this.plugin.settings.packageCache[1][key] = value;
      }
    }
    // move packages to the VFS
    for (const [key, val] of Object.entries(
      this.plugin.settings.packageCache[1] as Record<string, string>,
    )) {
      const filename = path.basename(val);
      //const read_success = false;
      try {
        const srccode = fs.readFileSync(
          path.join(this.getCacheFolderPath(), filename),
        );
        await this.compiler().writeTexFSFile(filename, srccode);
      } catch (e) {
        // when unable to read file, remove this from the cache
        //nsole.warn(`Unable to read file ${filename} from package cache`,e)
        delete this.plugin.settings.packageCache[1][key];
      }
    }
    await this.plugin.saveSettings();

    // write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
    await this.compiler().writeCacheData(
      {},
      this.plugin.settings.packageCache[1],
      this.plugin.settings.packageCache[2],
      this.plugin.settings.packageCache[3],
    );
  }
  /**
   * There are four catches:
   * 1. texlive404_cache - Not found files
   * 2. texlive200_cache
   * 3. pk404_cache - Not found files
   * 4. pk200_cache
   * currently only dealing with texlive200_cache
   */
  async fetchPackageCacheData(): Promise<void> {
    try {
      const cacheData: StringMap[] = await this.compiler().fetchCacheData();
      console.log("Cache data fetched:", cacheData);

      const newFileNames = getNewPackageFileNames(
        this.plugin.settings.packageCache[1] as Record<string, string>,
        cacheData[1] as Record<string, string>,
      );
      const files = await this.compiler().fetchTexFiles(newFileNames);
      for (const file of files) {
        this.addFile(file.name, file.content);
      }
      this.plugin.settings.packageCache = cacheData;
      await this.plugin.saveSettings();
    } catch (err) {
      console.error("Error fetching package cache data:", err);
    }
  }
  /**
   * Remove all cached package files from the file system and update the settings.
   */
  removeAllCachedPackages(): void {
    clearFolder(this.getCacheFolderPath());
    this.plugin.settings.packageCache = [{}, {}, {}, {}];
    this.plugin.saveSettings().then(() => {
      console.log("Package cache settings updated.");
    });
  }
  compiler() {
    return this.plugin.swiftlatexRender.compiler;
  }
}

function getNewPackageFileNames(
  oldCacheData: Record<string, string>,
  newCacheData: Record<string, string>,
): string[] {
  // based on the old and new package files in package cache data,
  // return the new package files
  let newKeys = Object.keys(newCacheData).filter(
    (key) => !(key in oldCacheData),
  );
  let newPackageFiles = newKeys.map((key) => path.basename(newCacheData[key]));
  return newPackageFiles;
}
