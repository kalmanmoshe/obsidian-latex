
import { Notice } from "obsidian";
import { createDependency, LatexDependency } from "./LatexDependency";
import { LatexDependencyNode, LatexDependencyParser, ParsedLatexFile } from "src/latexRender/task/LatexDependencyParser";

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

export class DependencyGraphStore {
	/**
     * a flat map of file paths to their corresponding dependencies. This is used to quickly check if a file is already in the virtual file system and to get its content and other information.
     */
    private filesByPath: Map<string, LatexDependency> = new Map();
    /**
     * a map of file paths to the set of file paths that they depend on. This is used to quickly get the dependencies of a file and to update the virtual file system when a file is added, removed or updated.
     */
    private dependenciesByOwner: Map<string, Set<string>> = new Map();
    /**
     * a map of file paths to the set of file paths that reference them. This is used to quickly get the files that reference a given file and to update the virtual file system when a file is added, removed or updated.
     */
    private referencedBy: Map<string, Set<string>> = new Map();
    
    addOrReplaceFile(newDep: LatexDependency, dependencies: LatexDependencyNode[]) {
        const oldDeps = this.dependenciesByOwner.get(newDep.path) ?? new Set();

        // remove old dependency edges
        for (const childPath of [...oldDeps]) {
            this.removeEdge(newDep.path, childPath);
        }

        this.dependenciesByOwner.set(newDep.path, new Set());
	    this.filesByPath.set(newDep.path, newDep);

        for (const childNode of dependencies) {
            this.addDependencyTree(newDep.path, childNode);
        }

        // remove dependency files no longer referenced
        this.garbageCollectDependencies();
    }

    private addDependencyTree(ownerPath: string, node: LatexDependencyNode) {
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
	removeFiles(predicate: (file: LatexDependency) => boolean) {

        const filesToRemove = Array.from(this.filesByPath.values())
            .filter((file) => predicate(file));

        for (const file of filesToRemove) {
            this.removeFileFromGraph(file.path);
            this.filesByPath.delete(file.path);
        }
        return filesToRemove;
        
    }

    getReferencingFiles(path: string) {
        return Array.from(this.referencedBy.get(path) ?? []);
    }
	
    getSnapshot() {
        return {
            fileCount: this.filesByPath.size,
            files: Array.from(this.filesByPath.values()).map((file) => ({
                ...file,
                contentLength: file.content.length,
                referencedBy: Array.from(this.referencedBy.get(file.path) ?? []),
                dependencies: Array.from(this.dependenciesByOwner.get(file.path) ?? []),
                autoUse: file.autoUse,
            })),
            autoUseFiles: Array.from(this.filesByPath.values())
                .filter((file) => file.autoUse)
                .map((file) => file.name),
        };
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

    flush() {
        this.filesByPath.clear();
        this.dependenciesByOwner.clear();
        this.referencedBy.clear();
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

    // removes a node from the dependency graph.
    private removeFileFromGraph(path: string) {
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
        const pathsToRemove: string[] = [];

        for (const [path, file] of this.filesByPath) {
            const isRootFile = file.inVFS === true;
            const isAutoUse = file.autoUse === true;
            const hasOwners = this.referencedBy.has(path);

            if (!isRootFile && !isAutoUse && !hasOwners) {
                pathsToRemove.push(path);
            }
        }

        for (const path of pathsToRemove) {
            this.removeFileFromGraph(path);
            this.filesByPath.delete(path);
        }
    }
}
