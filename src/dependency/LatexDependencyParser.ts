import {
	isTexSourceExtension,
	LatexAbstractSyntaxTree,
} from 'src/ast/latexAbstractSyntaxTree';
import {
	resolvePathRelToVault,
	extractStemAndExtension,
	resolveDependencyContent,
	isValidFileStem,
	CODE_BLOCK_NAME_SEPARATOR,
} from '../latexRender/resolvers/paths';
import { createDependency, LatexDependency, LatexSourceType } from 'src/dependency/LatexDependency';
import { VirtualFileSystem } from './VirtualFileSystem';
import { App } from 'obsidian';
import { findLatexInputReferences } from './LatexInputScanner';

export interface LatexDependencyNode {
	dependency: LatexDependency;
	dependencies: LatexDependencyNode[];
}

export interface ParsedLatexFile {
	content: string;
	path: string;
	dependencies: LatexDependencyNode[];
}

interface SourceReplacement {
	start: number;
	end: number;
	value: string;
}

export class LatexDependencyParser {
	constructor(
		private vfs: VirtualFileSystem,
		private app: App,
		//TODO: make this a arg in parse file as its not a global config but a per file config
		private possibleNames: string[] = [],
	) { }

	async parseFile(
		content: string,
		sourcePath: string,
		sourceType: LatexSourceType,
		isDependency = false,
	): Promise<ParsedLatexFile> {

		const basePath = getBasePath(sourcePath);

		const {
			dependencies,
			replacements,
		} = await this.collectDependencies(content, basePath);

		const resolvedContent = applyReplacements(
			content,
			replacements,
		);

		if (
			isDependency ||
			sourceType !== LatexSourceType.TikzCodeBlock
		) {
			return {
				content: resolvedContent,
				path: sourcePath,
				dependencies,
			};
		}

		// From this point onward source fidelity is intentionally irrelevant.
		const processedAst = LatexAbstractSyntaxTree.parse(resolvedContent);

		this.processTikzCodeBlock(
			processedAst,
			dependencies,
		);

		return {
			content: processedAst.toString(),
			path: sourcePath,
			dependencies,
		};
	}

	private processTikzCodeBlock(
		ast: LatexAbstractSyntaxTree,
		dependencies: LatexDependencyNode[],
	) {
		// we want in the preamble the surface level dependencies only, and not dependencies referenced within those. LaTex will automatically include those referenced dependencies when compiling the surface level dependencies.
		const surfaceDependencyPaths = dependencies.map((depNode) => depNode.dependency.path);

		if (this.vfs.getEnabled()) {
			const newAutoUseFiles = this.vfs
				.getAutoUseFiles()
				.filter((file) => surfaceDependencyPaths.every((depPath) => depPath !== file.path));

			ast.addDependenciesToPreamble(newAutoUseFiles);
		}
		ast.verifyProperDocumentStructure();
	}

	async collectSurfaceDependencyPaths(content: string, sourcePath: string): Promise<string[]> {
		const basePath = getBasePath(sourcePath);

		const paths: string[] = [];
		for (const ref of findLatexInputReferences(content)) {
			const resolvedPath = resolvePathRelToVault(ref.path, basePath, this.app);
			paths.push(resolvedPath);
		}

		return [...new Set(paths)].sort();
	}

	private async collectDependencies(
		content: string,
		basePath: string
	) {
		const dependencies: LatexDependencyNode[] = [];
		const replacements: SourceReplacement[] = [];

		for (const ref of findLatexInputReferences(content)) {

			const dependency = await this.resolveDependency(ref.path, basePath);

			let childDependencies: LatexDependencyNode[] = [];

			if (dependency.isTex && this.vfs.getFile(dependency.path) === undefined) {
				const parsedDep = await this.parseFile(dependency.content, dependency.path, dependency.sourceType, true);
				childDependencies = parsedDep.dependencies;
				dependency.content = parsedDep.content;
			}
			
			replacements.push({
				value: dependency.name,
				start: ref.pathStart,
				end: ref.pathEnd,
			});

			dependencies.push({
				dependency: dependency,
				dependencies: childDependencies,
			});
		}

		return {
			replacements,
			dependencies
		};
	}

	async resolveDependency(filePath: string, basePath: string): Promise<LatexDependency> {
		const resolvedPath = resolvePathRelToVault(filePath, basePath, this.app);
		const { stem, extension } = extractStemAndExtension(resolvedPath);

		if (this.isNameConflict(stem)) {
			throw new Error(`Name conflict detected for dependency: ${stem}`);
		}

		const possibleDep = this.vfs.getFile(resolvedPath);
		if (possibleDep) {
			return possibleDep;
		}

		const { content, sourceType } = await resolveDependencyContent(resolvedPath, this.app);

		return createDependency(content, resolvedPath, sourceType, {
			isTex: isTexSourceExtension(extension),
		});
	}

	private isNameConflict(stem: string): boolean {
		return isValidFileStem(stem) && this.possibleNames.includes(stem);
	}
}

function applyReplacements(source: string, replacements: SourceReplacement[]): string {
	return replacements
		.toSorted((a, b) => b.start - a.start)
		.reduce(
			(result, replacement) =>
				result.slice(0, replacement.start) +
				replacement.value +
				result.slice(replacement.end),
			source,
		);
}

function getBasePath(sourcePath: string): string {
	if (sourcePath.contains(CODE_BLOCK_NAME_SEPARATOR)) {
		sourcePath = sourcePath.split(CODE_BLOCK_NAME_SEPARATOR)[0];
	}
	return sourcePath;
}
