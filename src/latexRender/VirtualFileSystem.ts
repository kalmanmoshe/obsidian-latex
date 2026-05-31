import LatexCompiler from './compiler/base/compilerBase/compiler';

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

// i need to add the enabled state to the virtual file system
export class VirtualFileSystem {
	private files: VirtualFile[] = [];
	private status: VFSstatus = VFSstatus.undefined;
	/**
	 * whether the virtual file system is enabled. If disabled, the virtual file system will flush the pdf engine and no longer update the files in said engine.
	 */
	private vfsEnabled: boolean = false;
	private autoUseEnabled: boolean = false;
	private compiler: LatexCompiler;
	constructor() {}

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
			console.log("proceding vps like normal")
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
			this.files = [];
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

	private checkAutoUseState(force = true) {
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
			autoUseEnabled: this.autoUseEnabled,
			status: this.status,
			fileCount: this.files.length,
			files: this.files.map((file) => ({
				name: file.name,
				path: file.path,
				autoUse: !!file.autoUse,
				contentLength: file.content.length,
			})),
			autoUseFiles: this.files
				.filter((file) => file.autoUse)
				.map((file) => file.name),
		};
	}

	/**
	 * set the coor virtual files
	 * @param files
	 */
	setCoorVirtualFiles(files: Set<string>) {
		this.checkEnabled();
		for (const file of this.files) {
			file.autoUse = files.has(file.name);
			files.delete(file.name);
		}
		for (const file of files)
			throw new Error('File not found in virtual file system: ' + file);
	}

	/**
	 * get the coor virtual files
	 */
	getAutoUseFilePaths() {
		this.checkEnabled();
		return this.files
			.filter((file) => file.autoUse)
			.map((file) => file.path);
	} 
	
	/**
	 * set the virtual file system files
	 * @param files
	 */
	setVirtualFileSystemFiles(files: VirtualFile[]) {
		this.checkEnabled();
		this.files = files;
		this.status = VFSstatus.outdated;
	}

	hasFile(path: string) {
		this.checkEnabled();
		return this.files.some((file) => file.path === path);
	}

	getFile(path: string) {
		this.checkEnabled();
		const file = this.files.find((file) => file.path === path);
		if (!file)
			throw new Error('File not found in virtual file system: ' + path);
		return file;
	}

	/**
	 * add a virtual file system file
	 * @param file
	 */
	addVirtualFileSystemFile(file: VirtualFile) {
		this.checkEnabled();
		this.files = this.files.filter((f) => f.name !== file.name);
		this.files.push(file);
		this.status = VFSstatus.outdated;
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
			for (const file of [this.files].flat()) {
				console.debug('Loading virtual file system file:', file.name);
				await this.compiler.writeMemFSFile(file.name, file.content);
				console.debug('Loaded virtual file system file:', file.name);
			}
			this.status = VFSstatus.uptodate;
		} catch (err) {
			console.error('Error loading virtual filesystem files:', err);
			this.status = VFSstatus.error;
			throw err;
		}
	}

	async removeVirtualFileSystemFiles() {
		if (!this.checkEnabled(false)) return;
		const remove: string[] = [];
		this.files = this.files.filter((file) => {
			return file.autoUse || (remove.push(file.name) && false);
		});
		this.status = VFSstatus.outdated;
		for (const file of remove) {
			await this.compiler.removeMemFSFile(file);
		}
	}
	
	getClonedFiles() {
		return this.files.map((file) => ({ ...file }));
	}

	/**
	 * this is only used for testing purposes
	 */
	getFiles() {
		return this.files;
	}
}
