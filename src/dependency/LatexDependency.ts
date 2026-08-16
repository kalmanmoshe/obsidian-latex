import { isTexSourceExtension } from 'src/ast/latexAbstractSyntaxTree';
import { extractStemAndExtension } from 'src/latexRender/resolvers/paths';

export enum LatexSourceType {
	File,
	LatexCodeBlock,
	TikzCodeBlock,
}

/**
 * Dependencies themselves and the final source of the AST are not referenced by the path but only by base name and extension.IE. somePath/dir/file.tex -> file.tex So if multiple files are referenced.With same names.This will cause a conflict and they will be overridden.Even if the paths are different.This is just because I was lazy and I didn't want to implement.Directories in the VFS.
 */
export class LatexDependency {
	constructor(
		public content: string,
		public stem: string,
		public path: string,
		public extension: string,
		public isTex: boolean,
		public sourceType: LatexSourceType,
		public autoUse?: boolean,
	) { }

	get name(): string {
		return `${this.stem}.${this.extension}`;
	}
}

export function createDependency(
	content: string,
	vaultRootedPath: string,
	sourceType: LatexSourceType,
	config: {
		isTex?: boolean;
		autoUse?: boolean;
	} = {},
): LatexDependency {
	let { isTex, autoUse } = config;
	const { stem, extension } = extractStemAndExtension(vaultRootedPath);
	isTex = isTex || isTexSourceExtension(extension);
	return new LatexDependency(content, stem, vaultRootedPath, extension, isTex, sourceType, autoUse);
}