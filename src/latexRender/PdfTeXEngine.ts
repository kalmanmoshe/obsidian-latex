import * as fs from "fs";
import * as path from "path";

import Worker from "./swiftlatexpdftex/mainSwiftlatex.worker";
import { StringMap } from "src/settings/settings";
export enum EngineStatus {
    Init,
    Ready,
    Busy,
    Error,
}
  
  
export class CompileResult {
    pdf: Buffer<ArrayBufferLike>;
    status: number = -254;
    log: string = "No log";
    constructor(pdf: Buffer<ArrayBufferLike>|undefined, status: number, log: string) {
      if(pdf)this.pdf = pdf;
      this.status = status;
      this.log = log
    }
}

export enum LatexWorkerCommands {
    Compilelatex = "compilelatex",
    Grace = "grace",
    Settexliveurl = "settexliveurl",
    Mkdir = "mkdir",
    Compileformat = "compileformat",
    writecache = "writecache",
    Fetchfile = "fetchfile",
    FetchWorkFiles = "fetchWorkFiles",
    FetchCache= "fetchcache",
    Writetexfile = "writetexfile",
    Setmainfile = "setmainfile",
    Writefile = "writefile",
    Flushcatche = "flushcache",
    FlushWorkDirectory="flushworkcache",
    Removefile = "removefile",
}

export default class PdfTeXEngine {
    private latexWorker: Worker | undefined = undefined
    private latexWorkerStatus: EngineStatus = EngineStatus.Init;

    async loadEngine(): Promise<void> {
        if (this.latexWorker) {throw new Error("Other instance is running, abort()");}

        this.latexWorkerStatus = EngineStatus.Init;

        await new Promise<void>((resolve, reject) => {
            //@ts-expect-error
            this.latexWorker = new Worker(Worker);
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                const data = ev.data;
                if (data.result === "ok") {
                    this.latexWorkerStatus = EngineStatus.Ready;
                    resolve();
                } else {
                    this.latexWorkerStatus = EngineStatus.Error;
                    reject();
                }
            };
        });

        this.latexWorker!.onmessage = () => {};
        this.latexWorker!.onerror = () => {};
    }

    isReady(): boolean {
        return this.latexWorkerStatus === EngineStatus.Ready;
    }
    getEngineStatus(): EngineStatus {return this.latexWorkerStatus;}

    private checkEngineStatus(): void {
        if (!this.isReady()) {
            throw new Error("Engine is still spinning or not ready yet! engineStatus: " + EngineStatus[this.latexWorkerStatus]);
        }
    }

    async compileLaTeX(): Promise<CompileResult> {
        const startCompileTime = performance.now();
    
        const data = await this.task<{pdf?: Uint8Array;status: number;log: string;cmd: string;}>({
            cmd: LatexWorkerCommands.Compilelatex,
        });
    
        console.log(`Engine compilation finished in ${performance.now() - startCompileTime} ms`);
        return new CompileResult(
            data.pdf ? Buffer.from(new Uint8Array(data.pdf)) : undefined,
            data.status,
            data.log
        );

    }
    

    async compileFormat(): Promise<void> {
        const data = await this.task<{ pdf: Uint8Array, log?: string }>({
            cmd: LatexWorkerCommands.Compileformat,
        });
        const formatBlob = new Blob([data.pdf], { type: "application/octet-stream" });
        const formatURL = URL.createObjectURL(formatBlob);
        setTimeout(() => URL.revokeObjectURL(formatURL), 30000);
    }

    async fetchCacheData() {
        const recordToString = (record: Record<string, number>) => {
            return Object.fromEntries(
                Object.entries(record).map(([key, value]) => [key, String(value)])
            );
        };
        return this.task<{texlive404: Record<string,number>,texlive200: Record<string,string>,pk404: Record<string,number>,pk200: Record<string,string>}>(
            { cmd: LatexWorkerCommands.FetchCache, texlive404_cache: [], texlive200_cache: [], pk404_cache: [], pk200_cache: [] }
        ).then(data =>[
            recordToString(data.texlive404),
            data.texlive200,
            recordToString(data.pk404),
            data.pk200,
        ])
    }
    

    writeCacheData(texlive404_cache: any, texlive200_cache: any, pk404_cache: any, pk200_cache: any) {
        return this.task({ cmd: LatexWorkerCommands.writecache, texlive404_cache, texlive200_cache, pk404_cache, pk200_cache });
    }

    async fetchWorkFiles() {
        return this.task<{ file: String[] }>({ cmd: LatexWorkerCommands.FetchWorkFiles });
    }
    
    /**
     * Fetches a list of TeX files from a virtual file system and writes them to the specified host directory.
     *
     * @param filenames - An array of filenames to fetch from the virtual file system.
     * @param hostDir - The directory on the host system where the fetched files will be saved.
     */
    async fetchTexFiles(filenames: string[], hostDir: string): Promise<void> {
        await Promise.all(
            filenames.map(async (filename) => {
                const data = await this.task<{ content: Uint8Array<any> }>({ cmd: "fetchfile", filename });
                const fileContent = new Uint8Array(data.content);
                fs.promises.writeFile(path.join(hostDir, filename), fileContent);
            })
        );
    }
    
    
    private task<T = void>(task: any): Promise<T> {
        const command = task.cmd;
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        return new Promise<T>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev: MessageEvent<any>) => {
                try {
                    if(ev.data.cmd!==command){
                        throw new Error(`Unexpected command: ${ev.data.cmd}, expected: ${command}`);
                    }
                    this.latexWorkerStatus = EngineStatus.Ready;
                    this.latexWorker!.onmessage = null;
                    this.latexWorker!.onerror = null;
                    const data = ev.data; delete data.result;delete data.cmd;
                    if (Array.from(Object.keys(data)).length > 0) {
                        resolve(data as T);
                    } else {
                        resolve(undefined as T);
                    }
                } catch (err) {
                    console.error("Error in task", err);
                    this.latexWorkerStatus = EngineStatus.Error;
                    this.latexWorker!.onmessage = null;
                    this.latexWorker!.onerror = null;
                    reject(err);
                }
            };
            this.latexWorker!.onerror = (err: ErrorEvent) => {
                this.latexWorkerStatus = EngineStatus.Error;
                this.latexWorker!.onmessage = null;
                this.latexWorker!.onerror = null;
                console.error("Worker error:", err);
                reject(new Error(`Worker error: ${err.message}`));
            };
            this.latexWorker!.postMessage(task);
        });
    }
    
    
    /**
     * 
     */
    writeTexFSFile(filename: string, srcCode: Buffer<ArrayBufferLike>) {
        return this.task({ cmd: LatexWorkerCommands.Writetexfile, url: filename, src: srcCode });
    }

    setEngineMainFile(filename: string) {
        return this.task({ cmd: LatexWorkerCommands.Setmainfile, url: filename });
    }
    /**
     * Writes a file to the in-memory filesystem managed by the LaTeX worker.
     * 
     * @param filename - The name (or URL path) of the file to be written.
     * @param srcCode - The source code or content to write into the file.
     */
    writeMemFSFile(filename: string, srcCode: string) {
        return this.task({ cmd: LatexWorkerCommands.Writefile, url: filename, src: srcCode });
    }

    /**
     * Removes a file to the in-memory filesystem managed by the LaTeX worker.
     * 
     * @param filename - The name (or URL path) of the file to be removed.
     */
    removeMemFSFile(filename: string) {
        return this.task({ cmd: LatexWorkerCommands.Removefile, url: filename });
    }

    makeMemFSFolder(folder: string) {
        if (!folder || folder === "/") return Promise.resolve();
        return this.task({ cmd: "mkdir", url: folder });
    }
    

    flushWorkCache(): Promise<void> {
        return this.task({ cmd: LatexWorkerCommands.FlushWorkDirectory });
    }
    
    flushCache(): Promise<void> {
        return this.task({ cmd: LatexWorkerCommands.Flushcatche });
    }
    

    setTexliveEndpoint(url: string): Promise<void> {
        return this.task({ cmd: LatexWorkerCommands.Settexliveurl, url });
    }


    closeWorker(): void {
        if (this.latexWorker) {
            this.latexWorker.postMessage({ cmd: "grace" });
            this.latexWorker=undefined;
        }
    }
}