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
export type ResultFileFormat = 'svg' | 'pdf';

/**
 * Runtime representation of one cached compilation result.
 */
export interface CacheEntry {
	/** The stored output format. */
	format: ResultFileFormat;

	/** Hash of the resolved dependency state. */
	depsHash: string;

	/** Resolved vault paths used by this compilation. */
	dependencies: string[];

	/** Vault files currently referencing (they have a code block with a rawHash of this entry with the same format and depsHash) this result. */
	referencedBy: Set<string>;
}

export type CacheMap = Map<string, CacheEntry[]>;

/**
 * Compact persisted representation:
 *
 * [
 *   format,
 *   dependency hash,
 *   dependency paths,
 *   referencing file paths
 * ]
 */
export type CacheEntryJson = [
	format: ResultFileFormat,
	depsHash: string,
	dependencies: string[],
	referencedBy: string[],
];

/**
 * Raw source hash -> serialized result entries.
 */
export type CacheJson = Record<string, CacheEntryJson[]>;

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
	cache: {},
	packageCache: [{}, {}, {}, {}],
	saveLogs: false,
	overflowStrategy: OverflowStrategy.Downscale,
	compiler: CompilerType.PdfTeX,
};

export const SOURCE_REVERIFICATION_TIME_MS = 1000;