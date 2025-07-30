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
 * A cache map for tracking code block compilations.
 *
 * Structure:
 * - Outer key: Raw hash of the standardized code block (quick to compute).
 * - Outer value: A map keyed by the resolved hash (includes path resolution).
 *   - Inner key: Hash representing the fully resolved version of the code block.
 *   - Inner value: A set of file paths that reference this resolved version.
 * 
 * Map<RawHash, Map<ResolvedHash, Set<FilePath>>>;
 */
export type CacheMap = Map<string, Map<string, Set<string>>>;

// Because we store the cache in a json file, we cannot use Map directly.
export type CacheArray = Array<[string, Array<[string, Array<string>]>]>;
export interface MosheMathPluginSettings {
  mathjaxPreambleEnabled: boolean;
  mathjaxPreambleFileLocation: string;
  compilerVfsEnabled: boolean;
  autoloadedVfsFilesDir: string;
  virtualFilesFromCodeBlocks: boolean;

  invertColorsInDarkMode: boolean;

  package_url: string;
  physicalCache: boolean;
  physicalCacheLocation: string;
  cache: CacheArray;
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
  // stile settings
  invertColorsInDarkMode: true,

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
