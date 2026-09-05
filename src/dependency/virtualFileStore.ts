export interface VirtualFile {
	path: string;
	content: string | Uint8Array;
	autoUse?: boolean;
}

export class VirtualFileStore {
	private filesByPath = new Map<string, VirtualFile>();

	addOrReplace(file: VirtualFile): void {
		this.filesByPath.set(
			file.path,
			file,
		);
	}

	remove(path: string): VirtualFile | undefined {
		const file = this.filesByPath.get(path);

		if (file) {
			this.filesByPath.delete(path);
		}

		return file;
	}

	removeWhere(
		predicate: (file: VirtualFile) => boolean,
	): VirtualFile[] {
		const removed: VirtualFile[] = [];

		for (
			const file of
			this.filesByPath.values()
		) {
			if (!predicate(file)) {
				continue;
			}

			this.filesByPath.delete(file.path);
			removed.push(file);
		}

		return removed;
	}

	get(path: string): VirtualFile | undefined {
		return this.filesByPath.get(path);
	}

	has(path: string): boolean {
		return this.filesByPath.has(path);
	}

	getAll(): VirtualFile[] {
		return [
			...this.filesByPath.values(),
		];
	}

	getAutoUseFilePaths(): string[] {
		return this.getAll()
			.filter((file) => file.autoUse)
			.map((file) => file.path);
	}

	clear(): void {
		this.filesByPath.clear();
	}
}