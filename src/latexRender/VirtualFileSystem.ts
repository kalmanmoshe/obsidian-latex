import LatexCompiler from "./compiler/base/compilerBase/compiler";


export enum VirtualFileSystemFilesStatus{
    undefined,
    outdated,
    uptodate,
    error,
}
/**
 * Pauses without blocking external code execution until a given condition returns true, or until a timeout occurs.
 */
async function nonBlockingWaitUntil(condition: () => boolean, timeoutMs = 10000, checkInterval = 500): Promise<void> {
    const startTime = performance.now();
    const maxWaitTime = startTime + timeoutMs;

    while (!condition()) {
        if (performance.now() >= maxWaitTime) {
            throw new Error("Timeout waiting for condition.");
        }
        // Yield control to allow external code execution.
        await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
}
type VirtualFile = { name: string, content: string, autoUse?: boolean };

export class VirtualFileSystem{
    private files: VirtualFile[]=[]
    private status: VirtualFileSystemFilesStatus=VirtualFileSystemFilesStatus.undefined;
    /**
     * whether the virtual file system is enabled. If disabled, the virtual file system will flush the pdf engine and no longer update the files in said engine.
     */
    private enabled: boolean=false;
    private compiler: LatexCompiler;
    constructor(){}
    /**
     * update the pointer to the PDF engine
     * @param pdfEngine 
     */
    setPdfCompiler(compiler: LatexCompiler){
        this.compiler=compiler;
    }
    /**
     * enable or disable the virtual file system
     * @param enabled
     */
    async setEnabled(enabled: boolean){
        if(this.enabled&&!enabled){
            this.files=[];
            this.status=VirtualFileSystemFilesStatus.undefined;
            await this.compiler.flushWorkCache()
        }
        this.enabled=enabled
    }
    /**
     * set the coor virtual files
     * @param files
     */
    setCoorVirtualFiles(files: Set<string>){
        for (const file of this.files) {
            file.autoUse=files.has(file.name);
            files.delete(file.name);
        }
        for (const file of files) 
            throw new Error("File not found in virtual file system: "+file);
    }
    /**
     * get the coor virtual files
     */
    getAutoUseFileNames(){
        return this.files.filter(file=>file.autoUse).map(file=>file.name);
    }
    /**
     * set the virtual file system files
     * @param files 
     */
    setVirtualFileSystemFiles(files: VirtualFile[]){
        this.files=files;
        this.status=VirtualFileSystemFilesStatus.outdated;
    }
    hasFile(name: string){
        return this.files.some(file => file.name === name);
    }
    getFile(name: string){
        const file = this.files.find(file => file.name === name);
        if (!file) throw new Error("File not found in virtual file system: "+name);
        return file;
    }
    /**
     * add a virtual file system file
     * @param file 
     */
    addVirtualFileSystemFile(file: VirtualFile){
        this.files = this.files.filter(f => f.name !== file.name);
        this.files.push(file);
        this.status=VirtualFileSystemFilesStatus.outdated;
    }
    /**
     * if a file is not in the pdf engine or is outdated. load the virtual file system files into the pdf engine.
     * @returns Promise<void>
     */
    async loadVirtualFileSystemFiles() {
        if(this.enabled===false||this.status === VirtualFileSystemFilesStatus.uptodate)return;
        if (this.status === VirtualFileSystemFilesStatus.undefined){
            await nonBlockingWaitUntil(() => 
                this.status === VirtualFileSystemFilesStatus.outdated
            );
        }
        try {
            await this.compiler.flushWorkCache();
            for (const file of [this.files].flat()) {
                console.debug("Loading virtual file system file:", file.name);
                await this.compiler.writeMemFSFile(file.name, file.content);
            }
            this.status = VirtualFileSystemFilesStatus.uptodate;
        } catch (err) {
            console.error("Error loading virtual filesystem files:", err);
            this.status = VirtualFileSystemFilesStatus.error;
            throw err;
        }
    }
    async removeVirtualFileSystemFiles() {
        const remove: string[] = []
        this.files = this.files.filter(file => {
            return file.autoUse || remove.push(file.name) && false;
        });
        this.status = VirtualFileSystemFilesStatus.outdated;
        for (const file of remove) {
            await this.compiler.removeMemFSFile(file);
        }
    }
}