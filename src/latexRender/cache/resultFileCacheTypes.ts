
import * as fs from "fs";
import { Notice } from "obsidian";
import * as path from "path";
import { PhysicalCacheBase } from "./cacheBase/physicalCacheBase";
import { VirtualCacheBase } from "./cacheBase/virtualCacheBase";
import { cacheFileFormat } from "./resultFileCache";

// This is just for naming consistency with the physical cache.
export class ResultFileVirtualCache extends VirtualCacheBase { }

export class ResultFilePhysicalCache extends PhysicalCacheBase {

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

    setCacheFolderPath() {
        let folderPath = "";
        const cacheDir = this.plugin.settings.physicalCacheLocation;
        const basePath = this.plugin.getVaultPath();
        if (cacheDir)
            folderPath = path.join(basePath, cacheDir === "/" ? "" : cacheDir);
        else
            folderPath = path.join(
                basePath,
                app.vault.configDir,
                "swiftlatex-render-cache",
            );

        folderPath = path.join(folderPath, "pdf-cache");
        this.cacheFolderPath = folderPath;
    }

    /**
     * Changes the cache directory location.
     */
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
