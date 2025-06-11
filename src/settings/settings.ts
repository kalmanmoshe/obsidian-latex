
export type StringMap = Record<string,string|number>;

export enum CompilerType {
	TeX = "tex",
	XeTeX = "xetex",
}

interface MosheMathBasicSettings {
	mathjaxPreamblePreambleEnabled: boolean;
	mathjaxPreambleFileLocation: string;
	pdfTexEnginevirtualFileSystemFilesEnabled: boolean;
	autoloadedVirtualFileSystemFiles: string[];
	virtualFilesFromCodeBlocks: boolean;
	virtualFilesFileLocation: string;
	

    invertColorsInDarkMode: boolean;
	
	package_url: string,
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
	overflowStrategy: "downscale" | "scroll" | "hidden";
	compiler: CompilerType;
}

export type MosheMathPluginSettings = MosheMathBasicSettings;
export type MosheMathettings = MosheMathBasicSettings;

export const DEFAULT_SETTINGS: MosheMathPluginSettings = {
	mathjaxPreamblePreambleEnabled: false,
	mathjaxPreambleFileLocation: "",
	pdfTexEnginevirtualFileSystemFilesEnabled: false,
	autoloadedVirtualFileSystemFiles: [],
	virtualFilesFromCodeBlocks: false,
	virtualFilesFileLocation: "",
    // stile settings
    invertColorsInDarkMode: true,

	package_url: `https://texlive2.swiftlatex.com/`,
	physicalCache: true,
	physicalCacheLocation: "",
	cache: [],
	packageCache: [{},{},{},{}],
	pdfEngineCooldown: 1000,
	saveLogs: false,
	overflowStrategy: "downscale",
	compiler: CompilerType.TeX,
}

export function processMosheMathSettings(settings: MosheMathPluginSettings):MosheMathettings {

	function strToArray(str: string) {
		return str.replace(/\s/g,"").split(",");
	}

	function getAutofractionExcludedEnvs(envsStr: string) {
		let envs = [];

		try {
			const envsJSON = JSON.parse(envsStr);
			envs = envsJSON.map(function(env: string[]) {
				return {openSymbol: env[0], closeSymbol: env[1]};
			});
		}
		catch (e) {
			console.log(e);
		}

		return envs;
	}

	return {
		...settings,
	}
}






