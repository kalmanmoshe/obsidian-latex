import { LatexAbstractSyntaxTree } from 'src/ast/LatexAbstractSyntaxTree';
import LatexCompiler from './compiler/base/compilerBase/compiler';
import { create } from 'domain';
import { LatexDependencyNode, LatexDependencyParser } from './task/LatexDependencyParser';
import { Notice } from 'obsidian';
import { DependencyGraphStore } from 'src/dependency/DependencyGraphStore';
import { createDependency, DependencyConfig, LatexDependency } from 'src/dependency/LatexDependency';

export enum VFSstatus {
	undefined,
	outdated,
	uptodate,
	error,
}



/**
 * Pauses without blocking external code execution until a given condition returns true, or until a timeout occurs.
 */
async function nonBlockingWaitUntil(
	condition: () => boolean,
	timeoutMs = 10000,
	checkInterval = 500,
): Promise<void> {
	const startTime = performance.now();
	const maxWaitTime = startTime + timeoutMs;

	while (!condition()) {
		if (performance.now() >= maxWaitTime) {
			throw new Error('Timeout waiting for condition.');
		}
		// Yield control to allow external code execution.
		await new Promise((resolve) => setTimeout(resolve, checkInterval));
	}
}

type VirtualFile = {
	name: string;
	/**
	 * path of the file with the root being the vault root.
	 */
	path: string;
	content: string;
	autoUse?: boolean
};
type LatexDependencyNodeWithDeps = LatexDependency & {
	dependencies: LatexDependencyNode<LatexAbstractSyntaxTree, DependencyConfig<LatexAbstractSyntaxTree>>[];
};

function hasDeps(file: VirtualFile | LatexDependencyNodeWithDeps): file is LatexDependencyNodeWithDeps {
	return 'dependencies' in file;
}

// i need to add the enabled state to the virtual file system
export class VirtualFileSystem {
	/**
	 * a flat map of file paths to their corresponding dependencies. This is used to quickly check if a file is already in the virtual file system and to get its content and other information.
	 */
	private graph: DependencyGraphStore<LatexAbstractSyntaxTree, LatexDependency> = new DependencyGraphStore();

	private parser: LatexDependencyParser<LatexAbstractSyntaxTree, LatexDependency>;

	private status: VFSstatus = VFSstatus.undefined;
	/**
	 * whether the virtual file system is enabled. If disabled, the virtual file system will flush the pdf engine and no longer update the files in said engine.
	 */
	private vfsEnabled: boolean = false;
	private compiler: LatexCompiler;

	constructor() {
		const parserAdapter = {
			parseContentToAst: LatexAbstractSyntaxTree.parse,
			createDependency,
			getDependencyFromGraph: this.getFile.bind(this)
		};

		this.parser = new LatexDependencyParser(parserAdapter);
	}

	/**
	 * update the pointer to the PDF engine
	 * @param pdfEngine
	 */
	setPdfCompiler(compiler: LatexCompiler) {
		if (compiler !== this.compiler) {
			console.log('New compiler instance attached');
			// Compiler memory is fresh/empty now,
			// so the VFS contents must be reloaded.
			this.status = VFSstatus.outdated;
		} else {
			console.log("proceding vfs like normal")
		}
		this.compiler = compiler;
	}

	getEnabled() {
		return this.vfsEnabled;
	}

	/**
	 * enable or disable the virtual file system
	 * @param enabled
	 */
	async setEnabled(enabled: boolean) {
		if (this.vfsEnabled && !enabled) {
			this.graph.flush();
			this.status = VFSstatus.undefined;
			await this.compiler.flushWorkCache();
		}
		this.vfsEnabled = enabled;
	}

	private checkEnabled(force = true) {
		if (this.vfsEnabled) return true;
		if (force) {
			throw new Error(
				'Virtual file system is not enabled. Please enable it before using it.',
			);
		}
		return false;
	}

	getSnapshot() {
		return {
			enabled: this.vfsEnabled,
			status: this.status,
			...this.graph.getSnapshot(),
		};
	}

	/**
	 * set the coor virtual files
	 * @param coorVirtualFiles
	 */
	setCoorVirtualFiles(coorVirtualFilePaths: Set<string>) {
		this.checkEnabled();
		for (const file of this.graph.getFiles()) {
			file.autoUse = coorVirtualFilePaths.has(file.path);
			coorVirtualFilePaths.delete(file.path);
		}
		for (const filePath of coorVirtualFilePaths)
			throw new Error('File not found in virtual file system: ' + filePath);
	}

	/**
	 * get the coor virtual files
	 */
	getAutoUseFilePaths() {
		this.checkEnabled();
		return this.graph.getFiles()
			.filter((file) => file.autoUse)
			.map((file) => file.path);
	}

	getAutoUseFiles() {
		this.checkEnabled();
		return this.graph.getFiles().filter((file) => file.autoUse);
	}

	async addOrReplaceFile(file: VirtualFile | LatexDependencyNodeWithDeps) {
		let newDep: LatexDependencyNodeWithDeps;
		
		if (hasDeps(file)) {
			newDep = file;
		} else {
			const dep = createDependency(file.content, file.path, {
				autoUse: file.autoUse,
			});

			newDep = Object.assign(dep, {
				dependencies: [],
			});
		}

		if (!newDep.isTex) {
			this.graph.addOrReplaceFile(newDep, []);
			this.status = VFSstatus.outdated;
			return;
		}

		try {
			// Already parsed: do NOT parse again.
			if (hasDeps(file)) {
				this.graph.addOrReplaceFile(newDep, newDep.dependencies);
				this.status = VFSstatus.outdated;
				return;
			}

			const parsed = await this.parser.parseFile(newDep.ast!!, newDep.path);

			newDep.ast = parsed.ast;
			newDep.content = parsed.content;

			this.graph.addOrReplaceFile(newDep, parsed.dependencies);
			this.status = VFSstatus.outdated;
		} catch (err) {
			console.error('Error parsing virtual file system file:', err);
			this.status = VFSstatus.error;

			new Notice(
				`Error parsing virtual file system file: ${file.path}. Check console for details.`,
			);
		}
	}

	/**
	 * add a virtual file system file replacing any existing file with the same path
	 * @param file
	 */
	async addOrReplaceFiles(
		files: VirtualFile[] | (LatexDependency & {dependencies: LatexDependencyNodeWithDeps[]})[]
	) {
		for (const file of files) {
			await this.addOrReplaceFile(file);
		}
	}

	hasFile(path: string) {
		this.checkEnabled();
		return this.graph.hasFile(path);
	}

	getFile(path: string) {
		this.checkEnabled();
		return this.graph.getFile(path);
	}

	/**
	 * if a file is not in the pdf engine or is outdated. load the virtual file system files into the pdf engine.
	 * @returns Promise<void>
	 */
	async loadVirtualFileSystemFiles() {
		if (!this.checkEnabled(false) || this.status === VFSstatus.uptodate) {
			return;
		}

		if (this.status === VFSstatus.undefined) {
			console.warn(
				'Virtual file system status is undefined. Waiting until it is outdated.',
			);
			await nonBlockingWaitUntil(
				() => this.status === VFSstatus.outdated,
			);
		}
		try {
			await this.compiler.flushWorkCache();
			for (const file of this.graph.getFiles()) {
				console.debug('Loading virtual file system file:', file.path);
				await this.compiler.writeMemFSFile(file.name, file.content);
				console.debug('Loaded virtual file system file:', file.path);
			}
			this.status = VFSstatus.uptodate;
		} catch (err) {
			console.error('Error loading virtual filesystem files:', err);
			this.status = VFSstatus.error;
			throw err;
		}
	}

	async removeNonAutoUseFiles() {
		await this.removeFiles({ nonAutoUseOnly: true });
	}

	async removeAutoUseFiles() {
		await this.removeFiles({ autoUseOnly: true });
	}

	async flush() {
		await this.removeFiles();
	}

	private async removeFiles(options: {
		autoUseOnly?: boolean;
		nonAutoUseOnly?: boolean;
	} = {}) {
		if (!this.checkEnabled(false)) return;

		const { autoUseOnly = false, nonAutoUseOnly = false } = options;

		if (autoUseOnly && nonAutoUseOnly) {
			throw new Error('Cannot remove both auto-use-only and non-auto-use-only files.');
		}

		const shouldRemove = (file: LatexDependency) => {
			const neededForAutoUse = this.isNeededForAutoUse(file);

			if (autoUseOnly) return neededForAutoUse;
			if (nonAutoUseOnly) return !neededForAutoUse;

			return true;
		};

		this.status = VFSstatus.outdated;

		const filesToRemove = this.graph.removeFiles(shouldRemove);

		try {
			for (const file of filesToRemove) {
				await this.compiler.removeMemFSFile(file.name);
			}
		} finally {
			this.status = VFSstatus.uptodate;
		}
	}

	isNeededForAutoUse(
		file: LatexDependency | string,
		visited = new Set<string>(),
	): boolean {
		if (typeof file === 'string') {
			const fileObj = this.graph.getFile(file);
			if (!fileObj) return false;
			file = fileObj;
		}
		if (file.autoUse) return true;

		if (visited.has(file.path)) return false;
		visited.add(file.path);

		const owners = this.graph.getReferencingFiles(file.path);
		if (owners.length === 0) return false;

		for (const ownerPath of owners) {
			const ownerFile = this.graph.getFile(ownerPath);
			if (ownerFile && this.isNeededForAutoUse(ownerFile, visited)) {
				return true;
			}
		}

		return false;
	}

	getClonedFiles() {
		return Array.from(this.graph.getFiles()).map((file) => ({ ...file }));
	}

	getParser() {
		return this.parser;
	}

}
