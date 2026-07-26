import { LatexAbstractSyntaxTree } from 'src/ast/LatexAbstractSyntaxTree';
import { DependencyConfig } from './LatexDependency';
import { LatexDependencyNode } from 'src/latexRender/task/LatexDependencyParser';

export class DependencyGraphStore<
	TAst extends LatexAbstractSyntaxTree,
	TDep extends DependencyConfig<TAst>,
> {
	/**
	 * a flat map of file paths to their corresponding dependencies. This is used to quickly check if a file is already in the virtual file system and to get its content and other information.
	 */
	private filesByPath: Map<string, TDep> = new Map();
	/**
	 * a map of file paths to the set of file paths that they depend on. This is used to quickly get the dependencies of a file and to update the virtual file system when a file is added, removed or updated.
	 */
	private dependenciesByOwner: Map<string, Set<string>> = new Map();
	/**
	 * a map of file paths to the set of file paths that reference them. This is used to quickly get the files that reference a given file and to update the virtual file system when a file is added, removed or updated.
	 */
	private referencedBy: Map<string, Set<string>> = new Map();
	/**
     * Root files may exist on their own.
        Dependency files must be reachable from a root.
     */
	private rootFiles: Set<string> = new Set();

	addOrReplaceFile(newDep: TDep, dependencies: LatexDependencyNode<TAst, TDep>[]) {
		this.removeFileAndUnusedDependencies(newDep.path);

		this.dependenciesByOwner.set(newDep.path, new Set());
		this.filesByPath.set(newDep.path, newDep);
		this.rootFiles.add(newDep.path);

		for (const childNode of dependencies) {
			this.addDependencyTree(newDep.path, childNode);
		}

		// remove dependency files no longer referenced
		this.garbageCollectDependencies();
	}

	private addDependencyTree(ownerPath: string, node: LatexDependencyNode<TAst, TDep>) {
		const dep = node.dependency;

		this.filesByPath.set(dep.path, dep);
		this.addEdge(ownerPath, dep.path);

		if (!this.dependenciesByOwner.has(dep.path)) {
			this.dependenciesByOwner.set(dep.path, new Set());
		}

		for (const childNode of node.dependencies) {
			this.addDependencyTree(dep.path, childNode);
		}
	}

	/**
	 *
	 * @param predicate
	 * @returns the files it removed from the graph based on the predicate
	 */
	removeFiles(predicate: (file: TDep) => boolean) {
		const filesToRemove = Array.from(this.filesByPath.values()).filter((file) =>
			predicate(file),
		);

		for (const file of filesToRemove) {
			this.removeFileAndUnusedDependencies(file.path);
		}
		return filesToRemove;
	}

	getReferencingFiles(path: string) {
		return Array.from(this.referencedBy.get(path) ?? []);
	}

	getDependentFiles(path: string) {
		return Array.from(this.dependenciesByOwner.get(path) ?? []);
	}

	hasFile(path: string) {
		return this.filesByPath.has(path);
	}

	getFile(path: string) {
		return this.filesByPath.get(path);
	}

	getFiles() {
		return Array.from(this.filesByPath.values());
	}

	getRootFilePaths() {
		return Array.from(this.rootFiles);
	}

	flush() {
		this.filesByPath.clear();
		this.dependenciesByOwner.clear();
		this.referencedBy.clear();
		this.rootFiles.clear();
	}

	private addEdge(ownerPath: string, dependencyPath: string) {
		let deps = this.dependenciesByOwner.get(ownerPath);
		if (!deps) {
			deps = new Set();
			this.dependenciesByOwner.set(ownerPath, deps);
		}
		deps.add(dependencyPath);

		let owners = this.referencedBy.get(dependencyPath);
		if (!owners) {
			owners = new Set();
			this.referencedBy.set(dependencyPath, owners);
		}
		owners.add(ownerPath);
	}

	private removeFileAndUnusedDependencies(path: string) {
		this.disconnectFile(path);
		this.filesByPath.delete(path);
		this.rootFiles.delete(path);
		this.garbageCollectDependencies();
	}

	// removes a node from the dependency graph.
	private disconnectFile(path: string) {
		const dependencies = this.dependenciesByOwner.get(path);

		if (dependencies) {
			for (const dependencyPath of [...dependencies]) {
				this.removeEdge(path, dependencyPath);
			}

			this.dependenciesByOwner.delete(path);
		}

		const owners = this.referencedBy.get(path);

		if (owners) {
			for (const ownerPath of owners) {
				this.dependenciesByOwner.get(ownerPath)?.delete(path);
			}

			this.referencedBy.delete(path);
		}
	}

	// removes a dependency reference between two files.
	// Does not remove the dependency file itself.
	private removeEdge(ownerPath: string, dependencyPath: string) {
		this.dependenciesByOwner.get(ownerPath)?.delete(dependencyPath);

		const owners = this.referencedBy.get(dependencyPath);
		owners?.delete(ownerPath);

		if (owners && owners.size === 0) {
			this.referencedBy.delete(dependencyPath);
		}
	}

	private garbageCollectDependencies() {
		let removedSomething = true;

		while (removedSomething) {
			removedSomething = false;

			const pathsToRemove: string[] = [];

			for (const [path] of this.filesByPath) {
				const isRootFile = this.rootFiles.has(path);

				const owners = this.referencedBy.get(path);
				const hasOwners = owners !== undefined && owners.size > 0;

				if (!isRootFile && !hasOwners) {
					pathsToRemove.push(path);
				}
			}

			for (const path of pathsToRemove) {
				this.disconnectFile(path);
				this.filesByPath.delete(path);
				removedSomething = true;
			}
		}
	}
}
