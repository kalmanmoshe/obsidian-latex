import { findUsdInputFiles, isExtensionTex, LatexAbstractSyntaxTree } from "src/ast/LatexAbstractSyntaxTree";
import { resolvePathRelToVault, extractBasenameAndExtension, getFileContent, isValidFileBasename, CODE_BLOCK_NAME_SEPARATOR } from "../resolvers/paths";
import { Node, String as StringClass } from '../../ast/typs/astNodes';
import { DependencyConfig } from "src/dependency/LatexDependency";

export interface LatexDependencyNode<TAst extends LatexAbstractSyntaxTree, TDep extends DependencyConfig<TAst>> {
	dependency: TDep;
	dependencies: LatexDependencyNode<TAst, TDep>[];
}

export interface ParsedLatexFile<TAst extends LatexAbstractSyntaxTree, TDep extends DependencyConfig<TAst>> {
	content: string;
	path: string;
	ast: TAst;
	dependencies: LatexDependencyNode<TAst, TDep>[];
}

export interface LatexParserAdapter<TAst extends LatexAbstractSyntaxTree, TDep extends DependencyConfig<TAst>> {
	parseContentToAst(content: string): TAst;

	createDependency(
		content: string,
		path: string,
		config?: {
			isTex?: boolean;
			ast?: TAst;
			autoUse?: boolean;
		},
	): TDep;

	getDependencyFromGraph(path: string): TDep | undefined;
}

export class LatexDependencyParser<TAst extends LatexAbstractSyntaxTree, TDep extends DependencyConfig<TAst>> {
	constructor(
		private adapter: LatexParserAdapter<TAst, TDep>,
		private possibleNames: string[] = [],
	) { }

	async parseFile(content: string | TAst, path: string): Promise<ParsedLatexFile<TAst, TDep>> {
		let ast: TAst;
		if (typeof content === 'string') {
			ast = this.adapter.parseContentToAst(content);
		} else {
			ast = content;
		}
		console.log(`Got AST for file: ${path}`, ast.clone());
		let filePath = path;
		if (filePath.contains(CODE_BLOCK_NAME_SEPARATOR)) {
			filePath = filePath.split(CODE_BLOCK_NAME_SEPARATOR)[0];
			console.warn(`Path contains code block separator. Using only the file path: ${filePath}`);
		}

		const dependencies = await this.collectDependencies(ast, filePath);

		return {
			content: ast.toString(),
			path,
			ast,
			dependencies,
		};
	}

	private async collectDependencies(
		ast: TAst,
		basePath: string,
	): Promise<LatexDependencyNode<TAst, TDep>[]> {
		const dependencies: LatexDependencyNode<TAst, TDep>[] = [];

		const macros = [...findUsdInputFiles(ast._getMutableContent())];

		for (const macro of macros) {
			const dependencyPath = macro.toStringArgsContent();

			console.log(`Found dependency macro with path: ${dependencyPath} in file: ${basePath}`);

			const dep = await this.resolveDependency(dependencyPath, basePath);

			let childDependencies: LatexDependencyNode<TAst, TDep>[] = [];

			if (dep.isTex && this.adapter.getDependencyFromGraph(dep.path) === undefined) {
				const parsedDep = await this.parseFile(dep.content, dep.path);
				childDependencies = parsedDep.dependencies;
				dep.ast = parsedDep.ast;
				dep.content = parsedDep.content;
			}

			macro.args![0].content = [new StringClass(dep.name)];

			dependencies.push({
				dependency: dep,
				dependencies: childDependencies,
			});
		}

		return dependencies;
	}

	async resolveDependency(
		filePath: string,
		basePath: string,
	): Promise<TDep> {
		const resolvedPath = resolvePathRelToVault(filePath, basePath);
		const { basename, extension } = extractBasenameAndExtension(resolvedPath);

		if (this.isNameConflict(basename)) {
			throw new Error(`Name conflict detected for dependency: ${basename}`);
		}

		const possibleDep = this.adapter.getDependencyFromGraph(resolvedPath);
		if (possibleDep) {
			return possibleDep;
		}

		const content = await getFileContent(resolvedPath);

		return this.adapter.createDependency(content, resolvedPath, {
			isTex: isExtensionTex(extension)
		});
	}

	private isNameConflict(basename: string): boolean {
		return isValidFileBasename(basename) && this.possibleNames.includes(basename);
	}
}