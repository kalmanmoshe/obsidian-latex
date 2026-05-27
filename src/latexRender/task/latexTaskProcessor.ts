import LatexRender from 'src/main';
import { VirtualFileSystem } from '../VirtualFileSystem';
import { TFile } from 'obsidian';
import { extractCodeBlockName } from '../resolvers/latexSourceFromFile';
import {
	isExtensionTex,
	LatexAbstractSyntaxTree
} from '../../ast/parse';
import { Argument, Macro, String as StringClass } from '../../ast/typs/astNodes';
import {
	CODE_BLOCK_NAME_SEPARATOR,
	extractBasenameAndExtension,
	findRelativeFile,
	getFileContent,
	isValidFileBasename,
	resolvePathRelToVault,
} from '../resolvers/paths';
import { ProcessableLatexTask } from './latexTask';

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
}

export function createDpendency(
	content: string,
	path: string,
	config: {
		isTex?: boolean;
		ast?: LatexAbstractSyntaxTree;
		autoUse?: boolean;
	} = {},
): LatexDependency {
	let { isTex, ast, autoUse } = config;
	const { basename, extension } = extractBasenameAndExtension(path);
	isTex = isTex || isExtensionTex(extension);
	if (isTex && !ast) ast = LatexAbstractSyntaxTree.parse(content);
	return { content, ast, isTex, path, basename, extension, autoUse };
}


type VFSLatexDependency = LatexDependency & { inVFS: boolean };

/**
 * Class to handle LaTeX tasks, processing the source code,
 * managing dependencies, and interacting with the virtual file system.
 */
export class LatexTaskProcessor {
	task: ProcessableLatexTask;
	plugin: LatexRender;
	vfs: VirtualFileSystem;
	isError: boolean = false;
	err: string | null = null;
	// a flat arr representation of all dependencies found in the source, including nested ones, with an additional flag to indicate if they are already in the VFS (like auto-use files) to avoid duplicates.
	dependencies: VFSLatexDependency[] = [];

	static create(plugin: LatexRender, task: ProcessableLatexTask) {
		const processor = new LatexTaskProcessor();
		processor.task = task;
		processor.plugin = plugin;
		processor.vfs = plugin.swiftlatexRender.vfs;
		return processor;
	}

	private setError(err: string) {
		if (this.err !== null) {
			const errorMessage =
				'Error already set: ' + this.err + '. New error: ' + err;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
		this.err = err;
		this.isError = true;
	}

	private isNameConflict(basename: string): boolean {
		console.log(
			'Checking name conflict for basename:',
			basename,
			'Possible names:',
			this.task.getPossibleNames(),
		);
		return (
			isValidFileBasename(basename) &&
			this.task.getPossibleNames().includes(basename)
		);
	}

	private async resolveDependency(
		filePath: string,
		basePath: string,
	) {
		// i need to check if the dep is in auto use file so i dont add it twice
		let path = resolvePathRelToVault(filePath, basePath);
		const codeBlockName = path.split(CODE_BLOCK_NAME_SEPARATOR).pop();
		if (codeBlockName) {
			if (!isValidFileBasename(codeBlockName)) {
				throw new Error(`Invalid code block name: ${codeBlockName}`);
			}
		}
		const { basename, extension } = extractBasenameAndExtension(path);
		if (this.isNameConflict(basename)) {
			throw new Error(
				`Name conflict detected for code block: ${codeBlockName}`,
			);
		}

		if (this.vfs.hasFile(basename + '.' + extension)) {

		}

		const content = await getFileContent(path);

		const dependency = createDpendency(content, path, {
			isTex: isExtensionTex(extension)
		});
		console.log('Resolved dependency:', dependency, basename, extension);
		return dependency;
	}

	/**
	 * Processes input files in the LaTeX AST, extracting dependencies and
	 * normalizing file names.
	 * @param ast The LaTeX abstract syntax tree.
	 * @param basePath The base path for resolving relative file paths.
	 * @returns An array of dependencies found in the input files.
	 */
	private async processInputFiles(
		ast: LatexAbstractSyntaxTree,
		basePath: string,
	): Promise<VFSLatexDependency[] | undefined> {
		const usedFiles: VFSLatexDependency[] = [];
		const inputFilesMacros = ast.getDependencyMacros();
		
		for (const macro of inputFilesMacros) {
			const args = macro.args!;
			const filePath = macro.toStringArgsContent();

			const dependency = await this.resolveDependency(
				filePath,
				basePath,
			);
			const name = dependency.basename + '.' + dependency.extension;
			// Replace the macro argument with normalized name
			args[0].content = [new StringClass(name)];

			// Avoid circular includes
			if (this.vfs.hasFile(name)) continue;

			if (dependency.isTex) {
				// Recursively process the content
				const nestedAst = LatexAbstractSyntaxTree.parse(
					dependency.content
				);
				const processedFiles = await this.processInputFiles(
					nestedAst,
					basePath,
				);
				if (!processedFiles) {
					return;
				}
				usedFiles.push(...processedFiles);
				dependency.ast = nestedAst;
				dependency.content = nestedAst.toString();
			}

			const vfsDep = { ...dependency, inVFS: false };
			usedFiles.push(vfsDep);
		}

		return usedFiles;
	}

	/**
	 * Processes the LaTeX task source code, parsing it into an AST,
	 * extracting dependencies, and preparing the final source code.
	 * @returns An object containing the processed source, used files, and AST.
	 */
	async processTaskSource() {
		const startTime = performance.now();
		try {
			const ast = LatexAbstractSyntaxTree.parse(this.task.getContent());
			if (this.plugin.settings.compilerVfsEnabled) {
				const files = await this.processInputFiles(
					ast,
					this.task.sourcePath,
				);
				if (files !== undefined) {
					this.dependencies.push(...files);
				}
				const autoUseFiles = this.collectAutoUseDependencies();
				ast.addDependenciesToPreamble(autoUseFiles);
				this.dependencies.push(...autoUseFiles);
			}
			ast.verifyProperDocumentStructure();
			this.task.setAst(ast);
			this.task.processingTime = performance.now() - startTime;
			this.task.processed = true;
		} catch (e) {
			if (typeof e !== 'string' && 'abort' in e) {
				e = e.message;
			}
			this.setError(e);
		}
	}

	private collectAutoUseDependencies() {
		const files: VFSLatexDependency[] = [];

		this.vfs.getAutoUseFileNames().forEach((name) => {
			if (
				this.dependencies.some(
					(dep) => this.getDependencyVfsName(dep) === name,
				)
			) {
				return;
			}
			const file = this.vfs.getFile(name).content;

			const dependency = createDpendency(file, name, {
				isTex: true,
				autoUse: true,
			});

			const vfsDep = { ...dependency, inVFS: true };
			files.push(vfsDep);
		});

		return files;
	}

	private creatVFSLatexDependencyfromVFS(name: string): VFSLatexDependency {
		
	}

	private getDependencyVfsName(dep: LatexDependency) {
		return dep.basename + '.' + dep.extension;
	}

	async processTask(): Promise<boolean> {
		await this.processTaskSource();
		if (this.isError) {
			return false;
		}
		for (const dep of this.dependencies) {
			if (!dep.inVFS)
				this.vfs.addVirtualFileSystemFile({
					name: dep.basename + '.' + dep.extension,
					content: dep.content,
				});
		}
		return true;
	}

	static async processTask(plugin: LatexRender, task: ProcessableLatexTask) {
		const latexTask = LatexTaskProcessor.create(plugin, task);
		await latexTask.processTask();
		return latexTask;
	}
}
