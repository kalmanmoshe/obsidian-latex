export type StringMap = Record<string, string | number>;

export enum CompilerType {
	PdfTeX = 'PdfTeX',
	XeTeX = 'XeTeX',
}
/**
 * What to do when the content overflows the container.
 * "Downscale" - downscale the content.
 * "scroll" - add a scrollbar.
 * "hidden" - do nothing, content will overflow.
 */
export enum OverflowStrategy {
	Downscale = 'downscale',
	Scroll = 'scroll',
	Hidden = 'hidden',
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

/**
 * JSON-safe cache structure for persisting CacheMap to disk.
 *
 * Structure:
 * - Array of [RawHash, CacheEntryJson[]] tuples.
 */
export type CacheJson = Array<[rawHash: string, entries: (CacheEntryJson | ShortCacheEntryJson)[]]>;

export interface PackageCacheData {
	missingPackages: StringMap;
	cachedPackages: StringMap;
	missingFonts: StringMap;
	cachedFonts: StringMap;
}

export interface LatexCompilerPluginSettings {
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
	packageCache: Array<StringMap>;
	saveLogs: boolean;
	overflowStrategy: OverflowStrategy;
	compiler: CompilerType;
}

export const DEFAULT_SETTINGS: LatexCompilerPluginSettings = {
	compilerVfsEnabled: false,
	autoloadedVfsFilesDir: '',
	virtualFilesFromCodeBlocks: false,
	// style settings
	invertColorsInDarkMode: true,
	autoRemoveWhitespace: true,
	dirtyResultFiles: [],
	//its the public mirror of `https://texlive2.swiftlatex.com/` (which is down and not maintained any more) maintained by Texlyre
	package_url: 'https://texlive.texlyre.org/',
	physicalCache: true,
	physicalCacheLocation: '',
	cache: [],
	packageCache: [{}, {}, {}, {}],
	saveLogs: false,
	overflowStrategy: OverflowStrategy.Downscale,
	compiler: CompilerType.PdfTeX,
};

export const SOURCE_REVERIFICATION_TIME_MS = 1000;