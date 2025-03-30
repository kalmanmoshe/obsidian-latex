
import PdfTeXEngine from "./PdfTeXEngine";

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
type VirtualFile={name: string,content: string,autoUse?: boolean};
export class VirtualFileSystem{
    private files: VirtualFile[]
    private status: VirtualFileSystemFilesStatus=VirtualFileSystemFilesStatus.undefined;
    /**
     * whether the virtual file system is enabled. If disabled, the virtual file system will flush the pdf engine and no longer update the files in said engine.
     */
    private enabled: boolean;
    private pdfEngine: PdfTeXEngine;
    constructor(){
        this.enabled=false;
        this.status=VirtualFileSystemFilesStatus.undefined;
        this.files=[];
    }
    /**
     * update the pointer to the PDF engine
     * @param pdfEngine 
     */
    setPdfEngine(pdfEngine: PdfTeXEngine){
        this.pdfEngine=pdfEngine;
    }
    /**
     * enable or disable the virtual file system
     * @param enabled
     */
    async setEnabled(enabled: boolean){
        this.enabled=enabled
        if(!enabled){
            this.files=[];
            this.status=VirtualFileSystemFilesStatus.undefined;
            await this.pdfEngine.flushWorkCache()
        }
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
    /**
     * set the virtual file system files
     * @param files 
     */
    setExplicitVirtualFileSystemFiles(files: {name: string,content: string}[]){
        this.files=this.files.filter(file=>file.autoUse);
        this.files.push(...files);
        this.status=VirtualFileSystemFilesStatus.outdated;
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
            await this.pdfEngine.flushWorkCache();
            for (const file of [this.files].flat()) {
                await this.pdfEngine.writeMemFSFile(file.name, file.content);
            }
            this.status = VirtualFileSystemFilesStatus.uptodate;
        } catch (err) {
            console.error("Error loading virtual filesystem files:", err);
            this.status = VirtualFileSystemFilesStatus.error;
            throw err;
        }
    }
}