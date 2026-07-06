import { inlineDependencies } from 'src/ast/LatexAbstractSyntaxTree';
import { LatexDependencyParser } from './task/LatexDependencyParser';
import { Notice } from 'obsidian';
import { DependencyGraphStore } from 'src/dependency/DependencyGraphStore';
import { createMathJaxDependency, MathJaxDependency } from 'src/dependency/LatexDependency';
import { MathJaxAbstractSyntaxTree } from 'src/ast/mathJaxAbstractSyntaxTree';

export enum VFSstatus {
    undefined,
    outdated,
    uptodate,
    error,
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
export class MathjaxVFS {
    /**
     * a flat map of file paths to their corresponding dependencies. This is used to quickly check if a file is already in the virtual file system and to get its content and other information.
     */
    private graph: DependencyGraphStore<MathJaxAbstractSyntaxTree, MathJaxDependency> = new DependencyGraphStore();

    private parser: LatexDependencyParser<MathJaxAbstractSyntaxTree, MathJaxDependency>;
    /**
     * whether the virtual file system is enabled. If disabled, the virtual file system will flush the pdf engine and no longer update the files in said engine.
     */
    private vfsEnabled: boolean = false;

    constructor() {
        const parserAdapter = {
            parseContentToAst: MathJaxAbstractSyntaxTree.parse,
            createDependency: createMathJaxDependency,
            getDependencyFromGraph: this.getFile.bind(this)
        };

        this.parser = new LatexDependencyParser(parserAdapter);

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

    async addOrReplaceFile(file: VirtualFile) {
        const newDep = createMathJaxDependency(file.content, file.path);

        if (!newDep.isTex) {
            this.graph.addOrReplaceFile(newDep, []);
            return;
        }

        try {
            const parsed = await this.parser.parseFile(newDep.ast!!, newDep.path);

            newDep.ast = parsed.ast;
            newDep.content = parsed.content;

            this.graph.addOrReplaceFile(newDep, parsed.dependencies);
        } catch (err) {
            console.error('Error parsing virtual file system file:', err);

            new Notice(
                `Error parsing virtual file system file: ${file.path}. Check console for details.`,
            );
        }
    }

    /**
     * add a virtual file system file replacing any existing file with the same path
     * @param file
     */
    async addOrReplaceFiles(files: VirtualFile[]) {
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

    getRootFilePaths() {
        this.checkEnabled();
        return this.graph.getRootFilePaths();
    }

    async getFileWithInlinedDependencies(path: string): Promise<MathJaxAbstractSyntaxTree | undefined> {
        this.checkEnabled();

        const file = this.graph.getFile(path);
        if (!file?.ast) return undefined;

        return await inlineDependencies(file.ast, async (inputPath) => {
            const dep = await this.parser.resolveDependency(inputPath, path);

            if (!dep.ast && dep.isTex) {
                const parsed = await this.parser.parseFile(dep.content, dep.path);
                dep.ast = parsed.ast;
                dep.content = parsed.content;
            }

            return dep.ast;
        });
    }

    flush() {
        if (!this.checkEnabled(false)) return;
        this.graph.flush();
        //TODO: maby do something with the removed files
    }

    getClonedFiles() {
        return Array.from(this.graph.getFiles()).map((file) => ({ ...file }));
    }

    getParser() {
        return this.parser;
    }

}