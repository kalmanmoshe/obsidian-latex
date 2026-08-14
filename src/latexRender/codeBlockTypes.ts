import { LatexSourceType } from 'src/dependency/LatexDependency';
import { LatexRenderMode } from './task/latexTask';
import { ResultFileFormat } from 'src/settings/settings';

export interface LatexCodeBlockDefinition {
	renderMode: LatexRenderMode;
	sourceType: LatexSourceType;
	resultFormat: ResultFileFormat;
}

export const LATEX_CODE_BLOCKS = {
	latex: {
		renderMode: LatexRenderMode.PDF,
		sourceType: LatexSourceType.LatexCodeBlock,
		resultFormat: 'pdf',
	},

	latexsvg: {
		renderMode: LatexRenderMode.SVG,
		sourceType: LatexSourceType.LatexCodeBlock,
		resultFormat: 'svg',
	},

	tikz: {
		renderMode: LatexRenderMode.TIKZJAX_SVG,
		sourceType: LatexSourceType.TikzCodeBlock,
		resultFormat: 'svg',
	},
} satisfies Record<string, LatexCodeBlockDefinition>;

export type LatexCodeBlockLanguage = keyof typeof LATEX_CODE_BLOCKS;

const codeBlockLanguagePattern = Object.keys(LATEX_CODE_BLOCKS).join('|');

export const latexCodeBlockLanguageRegex =
	new RegExp(
		`(\`|~){3,} *(${codeBlockLanguagePattern})`,
		'i',
	);

export function getSourceTypeFromCodeBlockLanguage(codeBlockName: string): LatexSourceType {
	switch (codeBlockName) {
		case 'tikz':
			return LatexSourceType.TikzCodeBlock;
		case 'latex':
		case 'latexsvg':
			return LatexSourceType.LatexCodeBlock;
		default:
			throw new Error(`Unknown code block name: ${codeBlockName}`);
	}
}

export function getLatexCodeBlockDefinition(
	language: string,
): LatexCodeBlockDefinition {
	const definition =
		LATEX_CODE_BLOCKS[
			language.toLowerCase() as LatexCodeBlockLanguage
		];

	if (!definition) {
		throw new Error(
			`Unsupported LaTeX code block language: ${language}`,
		);
	}

	return definition;
}