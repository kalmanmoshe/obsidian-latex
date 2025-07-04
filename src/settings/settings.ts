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
  cache: Array<[string, Set<string>]>;
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
