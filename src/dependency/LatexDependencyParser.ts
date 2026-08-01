import {
	findUsdInputFiles,
	isExtensionTex,
	LatexAbstractSyntaxTree,
} from 'src/ast/LatexAbstractSyntaxTree';
import {
	resolvePathRelToVault,
	extractStemAndExtension,
	getFileContent,
	isValidFileStem,
	CODE_BLOCK_NAME_SEPARATOR,
} from '../latexRender/resolvers/paths';
import { String as StringClass } from '../ast/typs/astNodes';
import { createDependency, LatexDependency } from 'src/dependency/LatexDependency';
import { VirtualFileSystem } from './VirtualFileSystem';
import { App } from 'obsidian';

export interface LatexDependencyNode {
	dependency: LatexDependency;
	dependencies: LatexDependencyNode[];
}

export interface ParsedLatexFile {
	content: string;
	path: string;
	ast: LatexAbstractSyntaxTree;
	dependencies: LatexDependencyNode[];
}

export class LatexDependencyParser {
	constructor(
		private vfs: VirtualFileSystem,
		private app: App,
		private possibleNames: string[] = [],
	) { }

	async parseFile(content: string | LatexAbstractSyntaxTree, path: string): Promise<ParsedLatexFile> {
		let ast: LatexAbstractSyntaxTree;
		if (typeof content === 'string') {
			ast = LatexAbstractSyntaxTree.parse(content);
		} else {
			ast = content;
		}

		let filePath = path;
		if (filePath.contains(CODE_BLOCK_NAME_SEPARATOR)) {
			filePath = filePath.split(CODE_BLOCK_NAME_SEPARATOR)[0];
		}

		const dependencies = await this.collectDependencies(ast, filePath, this.app);

		return {
			content: ast.toString(),
			path,
			ast,
			dependencies,
		};
	}

	async collectSurfaceDependencyPaths(content: string, sourcePath: string, app: App): Promise<string[]> {
		const ast = LatexAbstractSyntaxTree.parse(content);

		let basePath = sourcePath;
		if (basePath.contains(CODE_BLOCK_NAME_SEPARATOR)) {
			basePath = basePath.split(CODE_BLOCK_NAME_SEPARATOR)[0];
		}

		const paths: string[] = [];

		for (const macro of findUsdInputFiles(ast._getMutableContent())) {
			const rawPath = macro.toStringArgsContent();
			const resolvedPath = resolvePathRelToVault(rawPath, basePath, app);
			paths.push(resolvedPath);
		}

		return [...new Set(paths)].sort();
	}

	private async collectDependencies(
		ast: LatexAbstractSyntaxTree,
		basePath: string,
		app: App
	): Promise<LatexDependencyNode[]> {
		const dependencies: LatexDependencyNode[] = [];

		const macros = [...findUsdInputFiles(ast._getMutableContent())];

		for (const macro of macros) {
			const dependencyPath = macro.toStringArgsContent();

			const dep = await this.resolveDependency(dependencyPath, basePath, app);

			let childDependencies: LatexDependencyNode[] = [];

			if (dep.isTex && this.vfs.getFile(dep.path) === undefined) {
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

	async resolveDependency(filePath: string, basePath: string, app: App): Promise<LatexDependency> {
		const resolvedPath = resolvePathRelToVault(filePath, basePath, app);
		const { stem, extension } = extractStemAndExtension(resolvedPath);

		if (this.isNameConflict(stem)) {
			throw new Error(`Name conflict detected for dependency: ${stem}`);
		}

		const possibleDep = this.vfs.getFile(resolvedPath);
		if (possibleDep) {
			return possibleDep;
		}

		const content = await getFileContent(resolvedPath, app);

		return createDependency(content, resolvedPath, {
			isTex: isExtensionTex(extension),
		});
	}

	private isNameConflict(stem: string): boolean {
		return isValidFileStem(stem) && this.possibleNames.includes(stem);
	}
}
