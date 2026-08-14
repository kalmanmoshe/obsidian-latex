import {
	findUsdInputFiles,
	isExtensionTex,
	LatexAbstractSyntaxTree,
} from 'src/ast/latexAbstractSyntaxTree';
import {
	resolvePathRelToVault,
	extractStemAndExtension,
	resolveDependencyContent,
	isValidFileStem,
	CODE_BLOCK_NAME_SEPARATOR,
} from '../latexRender/resolvers/paths';
import { String as StringClass } from '../ast/typs/astNodes';
import { createDependency, LatexDependency, LatexSourceType } from 'src/dependency/LatexDependency';
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

	async parseFile(
		content: string | LatexAbstractSyntaxTree,
		sourcePath: string,
		sourceType: LatexSourceType,
		// means that it's a depndency of another file, and not a standalone file.
		isDependency: boolean = false
	): Promise<ParsedLatexFile> {
		let ast: LatexAbstractSyntaxTree;
		if (typeof content === 'string') {
			ast = LatexAbstractSyntaxTree.parse(content);
		} else {
			ast = content;
		}

		let filePath = sourcePath;
		if (filePath.contains(CODE_BLOCK_NAME_SEPARATOR)) {
			filePath = filePath.split(CODE_BLOCK_NAME_SEPARATOR)[0];
		}

		const dependencies = await this.collectDependencies(ast, filePath, this.app);

		if (!isDependency) {
			//the auto use files are added with name only, so collect deps will fall to resolve them 
			// so process must come affter collect
			await this.processAst(ast, dependencies, sourceType);
		}

		return {
			content: ast.toString(),
			path: sourcePath,
			ast,
			dependencies,
		};
	}

	private async processAst(
		ast: LatexAbstractSyntaxTree,
		dependencies: LatexDependencyNode[],
		sourceType: LatexSourceType,
	) {
		switch (sourceType) {
			case LatexSourceType.File:
			case LatexSourceType.LatexCodeBlock:
				break;
			case LatexSourceType.TikzCodeBlock:
				await this.processTikzCodeBlock(ast, dependencies, this.vfs);
				break;
			default:
				throw new Error(`Unknown source type: ${sourceType as any}`);
		}
	}

	private async processTikzCodeBlock(
		ast: LatexAbstractSyntaxTree,
		dependencies: LatexDependencyNode[],
		vfs: VirtualFileSystem,
	) {
		// we want in the preamble the surface level dependencies only, and not dependencies referenced within those. LaTex will automatically include those referenced dependencies when compiling the surface level dependencies.
		const surfaceDependencyPaths = dependencies.map((depNode) => depNode.dependency.path);

		if (vfs.getEnabled()) {
			const newAutoUseFiles = vfs
				.getAutoUseFiles()
				.filter((file) => surfaceDependencyPaths.every((depPath) => depPath !== file.path));

			ast.addDependenciesToPreamble(newAutoUseFiles);
		}
		ast.verifyProperDocumentStructure();
	}

	async collectSurfaceDependencyPaths(ast: LatexAbstractSyntaxTree, sourcePath: string, app: App): Promise<string[]> {

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
				const parsedDep = await this.parseFile(dep.content, dep.path, dep.sourceType, true);
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

		const { content, sourceType } = await resolveDependencyContent(resolvedPath, app);

		return createDependency(content, resolvedPath, sourceType, {
			isTex: isExtensionTex(extension),
		});
	}

	private isNameConflict(stem: string): boolean {
		return isValidFileStem(stem) && this.possibleNames.includes(stem);
	}
}
