import { Snippet, StringSnippet } from "src/snippets/snippets";
import { Options } from "src/editor utilities/options";

export interface MoshePluginSettings {
    invertColorsInDarkMode: boolean;
    numberFormatting: string
    background: string;
    evenRowBackground: string;
    oddRowBackground: string;
    infoModalBackground: string;
    fontSize: string;
    rowPadding: string;
    iconSize: string;
    sessionHistory: { input: string, result: string }[]; 
    snippets: string;
    snippetsTrigger: string,
    snippetsEnabled: boolean;
    loadSnippetsFromFile: boolean;
    snippetsFileLocation: string;
    colorPairedBracketsEnabled: boolean,
    highlightCursorBracketsEnabled: boolean,
    mathPreviewEnabled: boolean,
    mathPreviewPositionIsAbove: boolean,
    taboutEnabled: boolean,
}

export type MosheCMSettings = {snippets: Snippet[],} & MoshePluginSettings;



export const DEFAULT_SETTINGS: MoshePluginSettings = {
    invertColorsInDarkMode: true,
    numberFormatting: ".000",
    background: "#44475A",
    evenRowBackground: "#f9f9f9",
    oddRowBackground: "#747688",
    infoModalBackground: "#002B36",
    fontSize: "0.85em",
    rowPadding: "5px 10px",
    iconSize: "14px",
    sessionHistory: [],
    snippets: '[{trigger: \'cd\',replacement: \'\\cdot\',options: Amc}]',//[new StringSnippet({trigger: 'cd',replacement: '\\cdot',options: new Options()})],
    snippetsTrigger: "tab",
    snippetsEnabled: true,
    loadSnippetsFromFile: false,
    snippetsFileLocation: "",
    colorPairedBracketsEnabled: true,
    highlightCursorBracketsEnabled: true,
    mathPreviewEnabled: true,
    mathPreviewPositionIsAbove: true,
    taboutEnabled: true,
};
/*
export function processMosheSettings(snippets: Snippet[], settings: MoshePluginSettings):MosheCMSettings {

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

		snippets: snippets,
	}
}*/


  