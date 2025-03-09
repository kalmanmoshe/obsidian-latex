
export type StringMap = { [key: string]: string };

interface MosheMathBasicSettings {
	mathjaxPreamblePreambleEnabled: boolean;
	mathjaxPreambleFileLocation: string;
	pdfTexEnginevirtualFileSystemFilesEnabled: boolean;
	autoloadedVirtualFileSystemFiles: string[];
	virtualFilesFromCodeBlocks: boolean;
	virtualFilesFileLocation: string;
	

    invertColorsInDarkMode: boolean;
    numberFormatting: number;
	
	package_url: string,
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
}

/**
 * Settings that require further processing (e.g. conversion to an array) before being used.
 */

interface MosheMathRawSettings {
}


interface MosheMathParsedSettings {
}

export type MosheMathPluginSettings = MosheMathBasicSettings & MosheMathRawSettings;
export type MosheMathettings = MosheMathBasicSettings & MosheMathParsedSettings;

export const DEFAULT_SETTINGS: MosheMathPluginSettings = {
	mathjaxPreamblePreambleEnabled: false,
	mathjaxPreambleFileLocation: "",
	pdfTexEnginevirtualFileSystemFilesEnabled: false,
	autoloadedVirtualFileSystemFiles: [],
	virtualFilesFromCodeBlocks: false,
	virtualFilesFileLocation: "",
    // stile settings
    invertColorsInDarkMode: true,
    numberFormatting: 3000,

	package_url: `https://texlive2.swiftlatex.com/`,
	cache: [],
	packageCache: [{},{},{},{}],
	pdfEngineCooldown: 1000,
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






