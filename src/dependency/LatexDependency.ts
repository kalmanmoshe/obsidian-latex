import { MathJaxAbstractSyntaxTree } from 'src/ast/mathJaxAbstractSyntaxTree';
import { LatexAbstractSyntaxTree, isExtensionTex } from 'src/ast/LatexAbstractSyntaxTree';
import { extractStemAndExtension } from 'src/latexRender/resolvers/paths';

export interface DependencyConfig<TAst extends LatexAbstractSyntaxTree> {
	content: string;
	stem: string;
	path: string;
	extension: string;
	isTex: boolean;
	ast?: TAst;
	readonly name: string;
}

/**
 * Dependencies themselves and the final source of the AST are not referenced by the path but only by base name and extension.IE. somePath/dir/file.tex -> file.tex So if multiple files are referenced.With same names.This will cause a conflict and they will be overridden.Even if the paths are different.This is just because I was lazy and I didn't want to implement.Directories in the VFS.
 */
export class LatexDependency implements DependencyConfig<LatexAbstractSyntaxTree> {
	constructor(
		public content: string,
		public stem: string,
		public path: string,
		public extension: string,
		public isTex: boolean,
		public ast?: LatexAbstractSyntaxTree,
		public autoUse?: boolean,
	) {}

	get name(): string {
		return `${this.stem}.${this.extension}`;
	}
}

export class MathJaxDependency implements DependencyConfig<MathJaxAbstractSyntaxTree> {
	constructor(
		public content: string,
		public stem: string,
		public path: string,
		public extension: string,
		public isTex: boolean,
		public ast?: MathJaxAbstractSyntaxTree,
	) {}

	get name(): string {
		return `${this.stem}.${this.extension}`;
	}
}

export function createDependency(
	content: string,
	path: string,
	config: {
		isTex?: boolean;
		ast?: LatexAbstractSyntaxTree;
		autoUse?: boolean;
	} = {},
): LatexDependency {
	let { isTex, ast, autoUse } = config;
	const { stem, extension } = extractStemAndExtension(path);
	isTex = isTex || isExtensionTex(extension);
	if (isTex && !ast) ast = LatexAbstractSyntaxTree.parse(content);
	return new LatexDependency(content, stem, path, extension, isTex, ast, autoUse);
}

export function createMathJaxDependency(
	content: string,
	path: string,
	config: {
		isTex?: boolean;
		ast?: MathJaxAbstractSyntaxTree;
	} = {},
): MathJaxDependency {
	let { isTex, ast } = config;
	const { stem, extension } = extractStemAndExtension(path);
	isTex = isTex || isExtensionTex(extension);
	if (isTex && !ast) ast = MathJaxAbstractSyntaxTree.parse(content);
	return new MathJaxDependency(content, stem, path, extension, isTex, ast);
}
