import { Root, String, Macro, Argument, Ast, Node, DependencyMacro } from './typs/astNodes';
import { migrateToClassStructure, parse } from './autoParse/ast-types-pre';
import { claenUpPaths } from './cleanUpAst';
import { EnvironmentWrap } from './verifyEnvironmentWrap';
import { LatexDependency } from 'src/dependency/LatexDependency';

/**
 * Assignments:
 * - Auto load librarys
 * - Auto load packages
 */

function insureRenderInfoexists(node: Node) {
	if (!node.renderInfo) node.renderInfo = {};
}

//I need to Stop using the AST for inputs and only add and remove inputs through the dependencies.
export class LatexAbstractSyntaxTree {

	protected content: Node[];

	constructor(content: Node[]) {
		this.content = content;
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

	hasDocumentclass() {
		return this.content.some(
			(node) => node instanceof Macro && node.content === 'documentclass',
		);
	}

	verifyDocumentclass() {
		//TODO: i need to look also in the dependencies
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
	}

	toString() {
		return this.content.map((node) => node.toString()).join('');
	}

	addDependenciesToPreamble(dependencies: LatexDependency[]) {
		const macros: Macro[] = [];
		for (const dependency of dependencies) {
			const name = dependency.basename + '.' + dependency.extension;
			macros.push(
				new DependencyMacro(
					'input',
					dependency.autoUse ?? false,
					undefined,
					[
						new Argument('{', '}', [new String(name)]),
					],
				),
			);
		}
		const index = this.getAddInputFileIndex(dependencies.some(dep => dep.autoUse));

		this.content.splice(index, 0, ...macros);
	}

	private getAddInputFileIndex(isAutoUseFile = false) {
		//i want it to go after the documentclass and after the auto use files
		//the start index is
		const startIndex = this.content.findIndex((node) => {
			if (!node.isMacro()) return true;
			if (node.content === 'documentclass') return false;
			if (node instanceof DependencyMacro) {
				// If the file is auto use, then we want the index to be after only the auto use files.
				return isAutoUseFile
					? !node.autoUse
					: false;
			}
			// important: normal macro like pgfplotsset
			// should be the insertion point
			return true;
		});
		return startIndex === -1 ? 0 : startIndex;
	}

	cleanUp() {
		claenUpPaths(this.content);
	}

	getDependencyMacros() {
		return findUsdInputFiles(this.content);
	}

	usdInputFiles() {
		return findUsdInputFiles(this.content).filter(
			(macro) => macro.args && macro.args.length === 1,
		);
	}

	isAutoUseFile(basename: string) { }

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

	getContent() { return this.content; }
	
	getClonedContent() { return this.content.map(node => node.clone()); }
	
	clone() {
		return new LatexAbstractSyntaxTree(
			this.content.map((node) => node.clone())
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
