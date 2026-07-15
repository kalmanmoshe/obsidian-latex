import { String, Macro, Argument, Ast, Node, DependencyMacro } from './typs/astNodes';
import { parse } from './autoParse/ast-types-pre';
import { LatexDependency } from 'src/dependency/LatexDependency';
import { verifyEnvironmentWrap } from './verifyEnvironmentWrap';



//I need to Stop using the AST for inputs and only add and remove inputs through the dependencies.
export class LatexAbstractSyntaxTree {
	protected content: Node[];

	constructor(content: Node[]) {
		this.content = content;
	}

	static parse(latex: string) {
		const content = parse(latex).content;
		return new LatexAbstractSyntaxTree(content);
	}

	verifyProperDocumentStructure() {
		const environmentVerified = verifyEnvironmentWrap(this);
		if (environmentVerified) this.replaceContent(environmentVerified);
		this.verifyDocumentclass();
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
			const name = dependency.stem + '.' + dependency.extension;
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

		this.spliceContent(index, 0, ...macros);
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

	getDependencyMacros() {
		return findUsdInputFiles(this.content);
	}

	usdInputFiles() {
		return findUsdInputFiles(this.content).filter(
			(macro) => macro.args && macro.args.length === 1,
		);
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

	replaceContent(nodes: Node[]) {
		this.content = nodes;
	}

	spliceContent(index: number, deleteCount: number, ...nodes: Node[]) {
		return this.content.splice(index, deleteCount, ...nodes);
	}

	getClonedContent() { return this.content.map(node => node.clone()); }

	/** Internal use only. Mutates AST directly. */
	_getMutableContent(): Node[] {
		return this.content;
	}

	clone(): this {
		return new LatexAbstractSyntaxTree(
			this.content.map((node) => node.clone())
		) as this;
	}

	reParse() {
		const latex = this.toString();
		const newAst = parse(latex);
		this.replaceContent(newAst.content);
	}
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


export function findUsdInputFiles(ast: Ast): Macro[] {
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

export async function inlineDependencies<TAst extends LatexAbstractSyntaxTree>(
	ast: TAst,
	resolveDependency: (
		inputPath: string,
	) => Promise<TAst | undefined>,
	seen = new Set<string>(),
): Promise<TAst> {
	const cloned = ast.clone();

	const replaceInArray = async (nodes: Node[]) => {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];

			if (node instanceof DependencyMacro && node.content === 'input') {
				const inputPath = node.toStringArgsContent();

				if (seen.has(inputPath)) {
					throw new Error(`Circular dependency detected: ${inputPath}`);
				}

				seen.add(inputPath);

				const depAst = await resolveDependency(inputPath);

				seen.delete(inputPath);

				if (!depAst) continue;

				const inlinedDep = await inlineDependencies(
					depAst,
					resolveDependency,
					seen,
				);

				nodes.splice(i, 1, ...inlinedDep.getClonedContent());
				i--;
				continue;
			}

			await replaceInsideNode(node);
		}
	};

	const replaceInsideNode = async (node: Node) => {
		if ('content' in node && Array.isArray(node.content)) {
			await replaceInArray(node.content);
		}

		if ('args' in node && Array.isArray(node.args)) {
			for (const arg of node.args) {
				await replaceInsideNode(arg);
			}
		}
	};

	await replaceInArray(cloned._getMutableContent());

	return cloned;
}