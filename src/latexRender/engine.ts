import * as fs from "fs";
import * as path from "path";

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

export enum EngineCommands {
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
    Compilepdf = "compilepdf",
}

export default abstract class LatexEngine {
    
    protected latexWorker: Worker | undefined = undefined
    protected latexWorkerStatus: EngineStatus = EngineStatus.Init;

    abstract loadEngine(): Promise<void>

    isReady(): boolean {
        return this.latexWorkerStatus === EngineStatus.Ready;
    }
    getEngineStatus(): EngineStatus {return this.latexWorkerStatus;}

    protected checkEngineStatus(): void {
        if (!this.isReady()) {
            throw new Error("Engine is still spinning or not ready yet! engineStatus: " + EngineStatus[this.latexWorkerStatus]);
        }
    }

    async compileLaTeX(): Promise<CompileResult> {
        const startCompileTime = performance.now();
        const data = await this.task<{pdf?: Uint8Array;status: number;log: string}>({
            cmd: EngineCommands.Compilelatex,
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
            cmd: EngineCommands.Compileformat,
        });
        const formatBlob = new Blob([data.pdf], { type: "application/octet-stream" });
        const formatURL = URL.createObjectURL(formatBlob);
        setTimeout(() => URL.revokeObjectURL(formatURL), 30000);
        console.log('Download format file via ' + formatURL);
    }

    async fetchCacheData() {
        const recordToString = (record: Record<string, number>) => {
            return Object.fromEntries(
                Object.entries(record).map(([key, value]) => [key, String(value)])
            );
        };
        return this.task<{texlive404: Record<string,number>,texlive200: Record<string,string>,pk404: Record<string,number>,pk200: Record<string,string>}>(
            { cmd: EngineCommands.FetchCache, texlive404_cache: [], texlive200_cache: [], pk404_cache: [], pk200_cache: [] }
        ).then(data =>[
            recordToString(data.texlive404),
            data.texlive200,
            recordToString(data.pk404),
            data.pk200,
        ])
    }
    

    writeCacheData(texlive404_cache: any, texlive200_cache: any, pk404_cache: any, pk200_cache: any) {
        return this.task({ cmd: EngineCommands.writecache, texlive404_cache, texlive200_cache, pk404_cache, pk200_cache });
    }

    async fetchWorkFiles() {
        return this.task<{ file: String[] }>({ cmd: EngineCommands.FetchWorkFiles });
    }
    
    /**
     * Fetches a list of TeX files from a virtual file system and writes them to the specified host directory.
     *
     * @param filenames - An array of filenames to fetch from the virtual file system.
     * @param hostDir - The directory on the host system where the fetched files will be saved.
     */
    async fetchTexFiles(filenames: string[], hostDir: string): Promise<void> {
        for (const filename of filenames) {
            const data = await this.task<{ content: Uint8Array<any> }>({ cmd: "fetchfile", filename });
            const fileContent = new Uint8Array(data.content);
            await fs.promises.writeFile(path.join(hostDir, filename), fileContent);
        }
    }
    
    
    task<T = void>(task: any): Promise<T> {
        const command = task.cmd;
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        //console.debug("Task started:", command);
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
                    //console.debug("Task completed:", command);
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
        return this.task({ cmd: EngineCommands.Writetexfile, url: filename, src: srcCode });
    }

    setEngineMainFile(filename: string) {
        return this.task({ cmd: EngineCommands.Setmainfile, url: filename });
    }
    /**
     * Writes a file to the in-memory filesystem managed by the LaTeX worker.
     * 
     * @param filename - The name (or URL path) of the file to be written.
     * @param srcCode - The source code or content to write into the file.
     */
    writeMemFSFile(filename: string, srcCode: string|Buffer<ArrayBufferLike>
    ) {
        return this.task({ cmd: EngineCommands.Writefile, url: filename, src: srcCode });
    }

    /**
     * Removes a file to the in-memory filesystem managed by the LaTeX worker.
     * 
     * @param filename - The name (or URL path) of the file to be removed.
     */
    removeMemFSFile(filename: string) {
        return this.task({ cmd: EngineCommands.Removefile, url: filename });
    }

    makeMemFSFolder(folder: string) {
        if (!folder || folder === "/") return Promise.resolve();
        return this.task({ cmd: "mkdir", url: folder });
    }
    

    flushWorkCache(): Promise<void> {
        return this.task({ cmd: EngineCommands.FlushWorkDirectory });
    }
    
    flushCache(): Promise<void> {
        return this.task({ cmd: EngineCommands.Flushcatche });
    }
    

    setTexliveEndpoint(url: string): Promise<void> {
        return this.task({ cmd: EngineCommands.Settexliveurl, url });
    }


    closeWorker(): void {
        if (this.latexWorker) {
            this.latexWorker.postMessage({ cmd: "grace" });
            this.latexWorker=undefined;
        }
    }
}