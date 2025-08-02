export type StringMap = Record<string, string | number>;

export enum CompilerType {
  TeX = "tex",
  XeTeX = "xetex",
}

export enum OverflowStrategy {
  Downscale = "downscale",
  Scroll = "scroll",
  Hidden = "hidden",
}



/**
 * Represents a single compilation entry for a code block.
 */
export type CacheEntry = {
  /** List of resolved file paths that this code block depends on */
  dependencies: string[];

  /** A deterministic hash computed from the sorted list of dependencies */
  depsHash: string;

  /** Set of file paths that reference this specific source+dependency combination */
  referencedBy: Set<string>;
};

/**
 * In-memory cache structure for tracking compiled code blocks.
 *
 * Structure:
 * - Key: raw hash of the standardized code block (quick to compute).
 * - Value: array of CacheEntry objects, each corresponding to a unique set of dependencies.
 *
 * Type: Map<RawHash, CacheEntry[]>
 */
export type CacheMap = Map<string, CacheEntry[]>;

/**
 * JSON-serializable version of a CacheEntry (Set → Array).
 */
export type CacheEntryJson = [deps: string[], depsHash: string, referencedBy: string[]];
// OR for common case:
export type ShortCacheEntryJson = string[]; // means nodeps
/*export type CacheEntryJson = [string[], string, string[]]{
  dependencies: string[];
  depsHash: string;
  referencedBy: string[];
};*/

/**
 * JSON-safe cache structure for persisting CacheMap to disk.
 *
 * Structure:
 * - Array of [RawHash, CacheEntryJson[]] tuples.
 */
export type CacheJson = Array<[rawHash: string, entries: (CacheEntryJson | ShortCacheEntryJson)[]]>;

export interface MosheMathPluginSettings {
  mathjaxPreambleEnabled: boolean;
  mathjaxPreambleFileLocation: string;
  compilerVfsEnabled: boolean;
  autoloadedVfsFilesDir: string;
  virtualFilesFromCodeBlocks: boolean;

  invertColorsInDarkMode: boolean;
  autoRemoveWhitespace: boolean;

  dirtyResultFiles: string[];

  package_url: string;
  physicalCache: boolean;
  physicalCacheLocation: string;
  cache: CacheJson;
  /**
   * There are four catches:
   * 1. texlive404_cache - Not found files
   * 2. texlive200_cache
   * 3. pk404_cache - Not found files
   * 4. pk200_cache - idk
   *
   * currently only dealing with texlive200_cache
   */
  packageCache: Array<StringMap>;
  pdfEngineCooldown: number;
  saveLogs: boolean;
  /**
   * What to do when the content overflows the container.
   * "auto" - downscale the content.
   * "scroll" - add a scrollbar.
   * "hidden" - do nothing, content will overflow.
   */
  overflowStrategy: OverflowStrategy;
  compiler: CompilerType;
}

export const DEFAULT_SETTINGS: MosheMathPluginSettings = {
  mathjaxPreambleEnabled: false,
  mathjaxPreambleFileLocation: "",
  compilerVfsEnabled: false,
  autoloadedVfsFilesDir: "",
  virtualFilesFromCodeBlocks: false,
  // style settings
  invertColorsInDarkMode: true,
  autoRemoveWhitespace: true,
  dirtyResultFiles: [],

  package_url: "http://46.101.255.60:3000/"/*`https://texlive2.swiftlatex.com/`*/,
  physicalCache: true,
  physicalCacheLocation: "",
  cache: [],
  packageCache: [{}, {}, {}, {}],
  pdfEngineCooldown: 1000,
  saveLogs: false,
  overflowStrategy: OverflowStrategy.Downscale,
  compiler: CompilerType.TeX,
};
