import Moshe from "src/main";
import { Notice } from "obsidian";
import path from "path";

export abstract class CacheBase {

  constructor(protected plugin: Moshe, protected cacheFileExtensions: string[]) {}
  /**
   * Extracts the file name from a full cache file path.
   * Example: "/home/user/.obsidian/latex-render-cache/someFile.pdf" -> "someFile.pdf"
   * @param filePath The full path to the cache file.
   */
  extractFileName(filePath: string): string{
    return path.basename(filePath);
  };
  /**
   * Returns a map of all cached files with their names and content.
   * The key is the file name (with extension), and the value is the file content.
   */
  abstract getFiles(): Map<string, string>;
  /**
   * Checks if the file is a valid cache file that is in the cache directory.
   * @param fileName - the name of the file to check including extension.
   */
  abstract fileExists(fileName: string): boolean;

  abstract getFile(fileName: string): string | undefined;

  abstract deleteFile(fileName: string): Promise<void> | void;

  abstract addFile(fileName: string, content: string | Uint8Array<ArrayBuffer>,)
    : Promise<void> | void;
  
  /**
   * Returns list of cached file names (with extension).
   */
  abstract listCacheFiles(): string[];

  abstract clearCache(): void;
  abstract deleteCache(): void;


  /**
   * Checks if the provided file basename is valid.
   * @param basename - the basename of the file to check.
   * @returns 
   */
  isValidFileBasename(basename: any): boolean {
    if (!basename || typeof basename !== "string"|| basename.trim() === ""||basename.length > 32|| basename.length < 3) {
      return false;
    }
    if (basename.includes("/") || basename.includes("\\")) {
      return false;
    }
    return true;
  }
  
  isValidFileName(fileName: any) {
    if (!fileName || typeof fileName !== "string" || fileName.trim() === "") {
      return false;
    }
    const [basename, extension] = extractBasenameAndExtension(fileName);
    return this.isValidFileBasename(basename) && this.cacheFileExtensions.includes(extension);
  }

  /**
   * Ensures the provided file name is valid, throwing an error if not.
   * @param fileName - the name of the file to validate.
   * @returns The validated file name.
   */
  ensureIsValidFileName(fileName: string): string {
    const [basename, extension] = extractBasenameAndExtension(fileName);
    this.ensureIsValidFileExtension(extension!);
    this.ensureIsValidFileBasename(basename);
    
    return fileName;
  }

  ensureIsValidFileBasename(basename: string): string {
    if (!this.isValidFileBasename(basename)) {
      throw new Error(`Invalid file basename: ${basename}`);
    }
    return basename;
  }

  ensureIsValidFileExtension(extension: string): string {
    if (!this.cacheFileExtensions.includes(extension)) {
      throw new Error(`Invalid file extension: ${extension}. Valid extensions are: ${this.cacheFileExtensions.join(", ")}`);
    }
    return extension;
  }

}

function extractBasenameAndExtension(fileName: string): [string, string] {
  const parts = fileName.split(".");
  const extension = parts.pop()!;
  const basename = parts.join(".");
  return [basename, extension];
}