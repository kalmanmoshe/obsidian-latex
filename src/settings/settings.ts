import { Snippet } from "../snippets/snippets";
import { Environment } from "../snippets/environment";

export type StringMap = { [key: string]: string };

interface LatexSuiteBasicSettings {
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
	snippetsEnabled: boolean;
	snippetsTrigger: "Tab" | " "
	suppressSnippetTriggerOnIME: boolean;
	removeSnippetWhitespace: boolean;
	autoDelete$: boolean;
	loadPreambleFromFile: boolean;
	loadSnippetsFromFile: boolean;
	loadSnippetVariablesFromFile: boolean;
	snippetsFileLocation: string;
	preambleFileLocation: string;
	snippetVariablesFileLocation: string;
	concealEnabled: boolean;
	concealRevealTimeout: number;
	colorPairedBracketsEnabled: boolean;
	highlightCursorBracketsEnabled: boolean;
	mathPreviewEnabled: boolean;
	mathPreviewPositionIsAbove: boolean;
	matrixShortcutsEnabled: boolean;
	taboutEnabled: boolean;
	autoEnlargeBrackets: boolean;
	wordDelimiters: string;
	package_url: string,
	timeout: number,
	cache: Array<[string, Set<string>]>;
	packageCache: Array<StringMap>;
	onlyRenderInReadingMode: boolean;
}

/**
 * Settings that require further processing (e.g. conversion to an array) before being used.
 */

interface LatexSuiteRawSettings {
	autofractionExcludedEnvs: string;
	matrixShortcutsEnvNames: string;
	autoEnlargeBracketsTriggers: string;
	forceMathLanguages: string;
	forceTranslateLanguages: string;
	suggestorLanguages: string;
}

interface LatexSuiteParsedSettings {
	autofractionExcludedEnvs: Environment[];
	matrixShortcutsEnvNames: string[];
	autoEnlargeBracketsTriggers: string[];
	forceMathLanguages: string[];
	forceTranslateLanguages: string[];
	suggestorLanguages: string[];
}

export type LatexSuitePluginSettings = {snippets: string, snippetVariables: string} & LatexSuiteBasicSettings & LatexSuiteRawSettings;
export type LatexSuiteCMSettings = {snippets: Snippet[]} & LatexSuiteBasicSettings & LatexSuiteParsedSettings;

export const DEFAULT_SETTINGS: LatexSuitePluginSettings = {
	snippets: '[]',
	snippetVariables: '{}',

	// Basic settings
	snippetsEnabled: true,
	snippetsTrigger: "Tab",
	suppressSnippetTriggerOnIME: true,
	removeSnippetWhitespace: true,
	autoDelete$: true,
	loadPreambleFromFile: true,
	loadSnippetsFromFile: true,
	loadSnippetVariablesFromFile: false,
	preambleFileLocation: "",
	snippetsFileLocation: "",
	snippetVariablesFileLocation: "",
	concealEnabled: false,
	concealRevealTimeout: 0,
	colorPairedBracketsEnabled: true,
	highlightCursorBracketsEnabled: true,
	mathPreviewEnabled: true,
	mathPreviewPositionIsAbove: true,
	matrixShortcutsEnabled: true,
	taboutEnabled: true,
	autoEnlargeBrackets: true,
	wordDelimiters: "., +-\\n\t:;!?\\/{}[]()=~$",

    // stile settings
    invertColorsInDarkMode: false,
    numberFormatting: ".000",
    background: "#44475A",
    evenRowBackground: "#f9f9f9",
    oddRowBackground: "#747688",
    infoModalBackground: "#002B36",
    fontSize: "0.85em",
    rowPadding: "5px 10px",
    iconSize: "14px",
    sessionHistory: [],

	// Raw settings
	autofractionExcludedEnvs:
	`[
		["^{", "}"],
		["\\\\pu{", "}"]
	]`,
	matrixShortcutsEnvNames: "pmatrix, cases, align, gather, bmatrix, Bmatrix, vmatrix, Vmatrix, array, matrix",
	autoEnlargeBracketsTriggers: "sum, int, frac, prod, bigcup, bigcap",
	forceMathLanguages: "math",
	forceTranslateLanguages: 'tikz',
	suggestorLanguages: 'tikz',
	package_url: `https://texlive2.swiftlatex.com/`,
	timeout: 10000,
	cache: [],
	packageCache: [{},{},{},{}],
	onlyRenderInReadingMode: false,
}

export function processLatexSuiteSettings(snippets: Snippet[], settings: LatexSuitePluginSettings):LatexSuiteCMSettings {

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

		// Override raw settings with parsed settings
		snippets: snippets,
		autofractionExcludedEnvs: getAutofractionExcludedEnvs(settings.autofractionExcludedEnvs),
		matrixShortcutsEnvNames: strToArray(settings.matrixShortcutsEnvNames),
		autoEnlargeBracketsTriggers: strToArray(settings.autoEnlargeBracketsTriggers),
		forceMathLanguages: strToArray(settings.forceMathLanguages),
		forceTranslateLanguages: strToArray(settings.forceTranslateLanguages),
		suggestorLanguages: strToArray(settings.suggestorLanguages),
	}
}






