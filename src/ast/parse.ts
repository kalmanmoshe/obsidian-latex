import { Root, String, Macro, Argument, Ast, Node } from './typs/astNodes';
import { migrateToClassStructure, parse } from './autoParse/ast-types-pre';
import { claenUpPaths } from './cleanUpAst';
import { EnvironmentWrap } from './verifyEnvironmentWrap';
import { extractBasenameAndExtension } from 'src/latexRender/resolvers/paths';

/**
 * Assignments:
 * - Auto load librarys
 * - Auto load packages
 */

function insureRenderInfoexists(node: Node) {
	if (!node.renderInfo) node.renderInfo = {};
}
/**
 * Dependencies themselves and the final source of the AST are not referenced by the path but only by base name and extension.IE. somePath/dir/file.tex -> file.tex So if multiple files are referenced.With same names.This will cause a conflict and they will be overridden.Even if the paths are different.This is just because I was lazy and I didn't want to implement.Directories in the VFS.
 */
export interface LatexDependency {
	content: string;
	basename: string;
	/**
	 * The path to the file relative to the vault root.
	 */
	path: string;
	extension: string;
	ast?: LatexAbstractSyntaxTree;
	isTex: boolean;
	autoUse?: boolean;
	ref: Macro;
}

//I need to Stop using the AST for inputs and only add and remove inputs through the dependencies.
export class LatexAbstractSyntaxTree {
	private content: Node[];
	/**
	 * @key {string} The name of the file, e.g. "file.tex"
	 */
	private dependencies: Map<string, LatexDependency> = new Map();
	constructor(content: Node[], dependencies?: Map<string, LatexDependency>) {
		this.content = content;
		if (dependencies) this.dependencies = dependencies;
	}
	static parse(latex: string) {
		const autoAst = parse(latex);
		const classAst = migrateToClassStructure(autoAst);
		if (!(classAst instanceof Root)) throw new Error('Root not found');
		const content = classAst.content;
		return new LatexAbstractSyntaxTree(content);
	}
	verifyProperDocumentStructure() {
		this.content = new EnvironmentWrap(this).verify();
		this.verifyDocumentclass();
		this.cleanUp();
	}
	verifydocstructure() {}
	parseArguments() {}

	hasDocumentclass() {
		return this.content.some(
			(node) => node instanceof Macro && node.content === 'documentclass',
		);
	}

	verifyDocumentclass() {
		const documentclass = this.content.find(
			(node) => node instanceof Macro && node.content === 'documentclass',
		); /*[this,...Array.from(this.dependencies.values()).map(dep=>dep.ast)]
        .find(ast=> ast?.content.find(node=>node instanceof Macro&&node.content==="documentclass"))*/
		if (!documentclass) {
			this.content.unshift(
				new Macro('documentclass', undefined, [
					new Argument('[', ']', [new String('tikz,border=2mm')]),
					new Argument('{', '}', [new String('standalone')]),
				]),
			);
		}
	}

	find(
		predicate: (node: Node) => boolean,
	): { tree: LatexAbstractSyntaxTree; node: Node } | undefined {
		const node = this.content.find(predicate);

		if (node) {
			return { tree: this, node };
		}

		for (const [name, dependency] of this.dependencies.entries()) {
			if (dependency.ast) {
				const result = dependency.ast.find(predicate);
				if (result) return result;
			}
		}
	}

	toString() {
		return this.content.map((node) => node.toString()).join('');
	}

	private getAddInputFileIndex(isAutoUseFile = false) {
		const startIndex = this.content.findIndex((node) => {
			if (!node.isMacro()) return true;
			if (node.content === 'documentclass') return false;
			if (this.isDependency(node)) {
				const a = this.getDependencyData(node);
				// If the file is auto use, then we want the index to be after only the auto use files.
				return isAutoUseFile
					? !this.getDependencyData(node)?.autoUse
					: false;
			}
		});
		return startIndex === -1 ? 0 : startIndex;
	}

	addDependencyToPramble(dependency: LatexDependency) {
		const index = this.getAddInputFileIndex(dependency.autoUse);
		this.content.splice(index, 0, dependency.ref);
		this.dependencies.set(
			dependency.basename + '.' + dependency.extension,
			dependency,
		);
	}

	/**
	 * Taks a macro that is allready in the document (ast) and adds the dependency data to it.
	 * @param macro
	 * @param dependency
	 */
	addDependencyDataForMacro(macro: Macro, dependency: LatexDependency) {}

	cleanUp() {
		claenUpPaths(this.content);
	}
	removeAllWhitespace() {}
	/**
	 * In latex empty lines can cause errors
	 * This methd remove all empty lines from the document.
	 */
	removeEmptyLines() {}
	usdPackages() {}
	usdLibraries() {}

	getUnresolvedDependencyMacros() {
		return findUsdInputFiles(this.content).filter(
			(macro) => !this.isResolvedDependency(macro),
		);
	}

	private isDependency(macro: Macro): macro is Macro & { args: Argument[] } {
		return (
			macro.args !== undefined &&
			macro.args.length === 1 &&
			macro.content === 'input'
		);
	}
	/**
	 *
	 * @param macro
	 * @returns {LatexDependency | null} If the macro is a resolved dependency, returns the dependency data, otherwise returns null.
	 */
	private getDependencyData(macro: Macro): LatexDependency | null {
		if (!this.isDependency(macro)) return null;
		const filePath = macro.toStringArgsContent();
		const { basename, extension } = extractBasenameAndExtension(filePath);
		const name = basename + '.' + extension;
		return this.dependencies.get(name) || null;
	}

	isResolvedDependency(macro: Macro) {
		return (
			this.isDependency(macro) &&
			this.dependencies.has(macro.toStringArgsContent())
		);
	}

	usdInputFiles() {
		return findUsdInputFiles(this.content).filter(
			(macro) => macro.args && macro.args.length === 1,
		);
	}

	isAutoUseFile(basename: string) {}

	getDependencies() {
		return Array.from(this.dependencies.values());
	}

	getInputFilesPaths() {
		return this.usdInputFiles().map((input) => {
			const args = input.args;
			if (!args || args.length !== 1)
				throw new Error('Unexpected input file format');
			return input.toStringArgsContent();
		});
	}

	isInputFile(filePath: string) {
		return this.getInputFilesPaths().some((path) => filePath === path);
	}

	usdCommands() {}
	usdEnvironments() {}
	clone() {
		return new LatexAbstractSyntaxTree(
			this.content.map((node) => node.clone()),
			cloneMap(this.dependencies),
		);
	}
}

function cloneMap<T, V>(map: Map<T, V>): Map<T, V> {
	const newMap = new Map<T, V>();
	for (const [key, value] of map.entries()) {
		newMap.set(key, value);
	}
	return newMap;
}

//a

//a Macro is in esins in emplmntsin of a newCommand

class DefineMacro {
	//type
}
const texExtensions = [
	'latex',
	'tex',
	'sty',
	'cls',
	'texlive',
	'texmf',
	'texmf',
	'cnf',
];
export function isExtensionTex(extension: string) {
	return extension
		.split('.')
		.some((ext) => texExtensions.includes(ext.toLowerCase()));
}

export function createDpendency(
	content: string,
	path: string,
	config: {
		isTex?: boolean;
		ast?: LatexAbstractSyntaxTree;
		macro?: Macro;
		autoUse?: boolean;
	} = {},
): LatexDependency {
	let { isTex, ast, autoUse, macro } = config;
	const { basename, extension } = extractBasenameAndExtension(path);
	isTex = isTex || isExtensionTex(extension);
	if (isTex && !ast) ast = LatexAbstractSyntaxTree.parse(content);
	const name = basename + '.' + extension;
	const ref =
		macro ||
		new Macro('input', undefined, [
			new Argument('{', '}', [new String(name)]),
		]);
	return { content, ref, ast, isTex, path, basename, extension, autoUse };
}

function findUsdInputFiles(ast: Ast): Macro[] {
	const inputMacros: Macro[] = [];
	if (ast instanceof Macro && ast.content === 'input') inputMacros.push(ast);
	if (Array.isArray(ast)) {
		inputMacros.push(...ast.map(findUsdInputFiles).flat());
	}
	if ('content' in ast && ast.content && Array.isArray(ast.content)) {
		inputMacros.push(...ast.content.map(findUsdInputFiles).flat());
	}
	if ('args' in ast && ast.args) {
		inputMacros.push(...ast.args.map(findUsdInputFiles).flat());
	}
	return inputMacros;
}
