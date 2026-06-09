import { isExtensionTex, LatexAbstractSyntaxTree } from "src/ast/parse";
import { resolvePathRelToVault, extractBasenameAndExtension, getFileContent, isValidFileBasename } from "../resolvers/paths";
import { String as StringClass } from '../../ast/typs/astNodes';
import { LatexDependency, createDependency } from "src/dependency/LatexDependency";
import { VirtualFileSystem } from "../VirtualFileSystem";

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
		private possibleNames: string[] = [],
	) {}

	async parseFile(content: string, path: string): Promise<ParsedLatexFile> {
		const ast = LatexAbstractSyntaxTree.parse(content);

		const dependencies = await this.collectDependencies(ast, path);

		return {
			content: ast.toString(),
			path,
			ast,
			dependencies,
		};
	}

	private async collectDependencies(
		ast: LatexAbstractSyntaxTree,
		basePath: string,
	): Promise<LatexDependencyNode[]> {
		const dependencies: LatexDependencyNode[] = [];

		for (const macro of ast.getDependencyMacros()) {
			const args = macro.args!;
			const dependencyPath = macro.toStringArgsContent();

			const dep = await this.resolveDependency(dependencyPath, basePath);

			args[0].content = [new StringClass(dep.name)];

			let childDependencies: LatexDependencyNode[] = [];

			if (dep.isTex && !dep.inVFS) {
				const parsedDep = await this.parseFile(dep.content, dep.path);

				childDependencies = parsedDep.dependencies;

				dep.ast = parsedDep.ast;
				dep.content = parsedDep.content;
			}

			dependencies.push({
				dependency: dep,
				dependencies: childDependencies,
			});
		}

		return dependencies;
	}

	private async resolveDependency(
		filePath: string,
		basePath: string,
	): Promise<LatexDependency> {
		const resolvedPath = resolvePathRelToVault(filePath, basePath);
		const { basename, extension } = extractBasenameAndExtension(resolvedPath);
        console.warn(`Resolving dependency: `, { filePath, basePath, resolvedPath, basename, extension });
		if (this.isNameConflict(basename)) {
			throw new Error(`Name conflict detected for dependency: ${basename}`);
		}

		if (this.vfs.hasFile(filePath)) {
			return this.vfs.getFile(filePath)!!;
		}

		const content = await getFileContent(resolvedPath);

		return createDependency(content, resolvedPath, {
			isTex: isExtensionTex(extension),
			inVFS: false,
		});
	}

	private isNameConflict(basename: string): boolean {
		return isValidFileBasename(basename) && this.possibleNames.includes(basename);
	}
}