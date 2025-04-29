import * as fs from "fs";
import * as path from "path";

import Worker from "./swiftlatexpdftex/mainSwiftlatex.worker";
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
    fetchWorkFiles = "fetchWorkFiles",
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
    private unexpectedCommandCheck(expected: string,cmd: string,): void {
        if(cmd!==expected)
            throw new Error(`Unexpected command: ${cmd}, expected: ${expected}`);
    }

    async compileLaTeX(): Promise<CompileResult> {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        const startCompileTime = performance.now();

        const result = await new Promise<CompileResult>((resolve) => {
            console.log("compileLaTeX",this.latexWorkerStatus);
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                console.log("compileLaTeX onmessage",ev);
                const data = ev.data;
                this.unexpectedCommandCheck("compile",data.cmd);

                this.latexWorkerStatus = EngineStatus.Ready;
                console.log(`Engine compilation finished in ${performance.now() - startCompileTime} ms`);
                //console.log("data.myLog",data);
                const compileResult = new CompileResult(data.pdf?Buffer.from(new Uint8Array(data.pdf)):undefined, data.status, data.log);
                resolve(compileResult);
            };
            console.log("compileLaTeX postMessage",this.latexWorkerStatus);
            this.latexWorker!.postMessage({ cmd: "compilelatex" });
        });

        this.latexWorker!.onmessage = null;
        return result;
    }

    async compileFormat(): Promise<void> {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;

        await new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
            const data = ev.data;
            this.unexpectedCommandCheck("compile",data.cmd);

            this.latexWorkerStatus = EngineStatus.Ready;

            if (data.result === "ok") {
                const formatBlob = new Blob([data.pdf], { type: "application/octet-stream" });
                const formatURL = URL.createObjectURL(formatBlob);
                setTimeout(() => URL.revokeObjectURL(formatURL), 30000);
                console.log(`Download format file via ${formatURL}`);
                resolve();
            } else {
                reject(data.log);
            }
            };

            this.latexWorker!.postMessage({ cmd: "compileformat" });
        });

        this.latexWorker!.onmessage = null;
    }

    async fetchCacheData(): Promise<any[]> {
        this.task
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        return new Promise<any[]>((resolve, reject) => {
            if (!this.latexWorker) {
                this.latexWorkerStatus = EngineStatus.Error;
                reject(new Error("Latex worker not initialized."));
                return;
            }
            const onMessageHandler = (ev: MessageEvent<any>) => {
                const data = ev.data;
                this.unexpectedCommandCheck("fetchcache", data.cmd);
                
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                this.latexWorker!.onerror = null;
                if (data.result === "ok") {
                    resolve([
                        data.texlive404_cache,
                        data.texlive200_cache,
                        data.pk404_cache,
                        data.pk200_cache,
                    ]);
                } else {
                    reject(new Error("Failed to fetch cache data"));
                }
            };
            this.latexWorker!.onmessage = (ev) => onMessageHandler(ev);
            this.latexWorker!.onerror = (err) => {
                this.latexWorkerStatus = EngineStatus.Error;
                this.latexWorker!.onmessage = null;
                reject(new Error(`Worker error: ${err.message}`));
            };
            this.latexWorker!.postMessage({ cmd: "fetchcache" });
        });
    }
    

    writeCacheData(texlive404_cache: any, texlive200_cache: any, pk404_cache: any, pk200_cache: any) {
        return this.task({ cmd: LatexWorkerCommands.writecache, texlive404_cache, texlive200_cache, pk404_cache, pk200_cache });
    }

    async fetchWorkFiles() {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker!.postMessage({ cmd: LatexWorkerCommands.fetchWorkFiles });
        return new Promise<void>((resolve, reject) => {
          this.latexWorker!.onmessage = (event: MessageEvent) => {
            this.unexpectedCommandCheck(LatexWorkerCommands.fetchWorkFiles,event.data.cmd);
            this.latexWorkerStatus = EngineStatus.Ready;
            this.latexWorker!.onmessage = null;
            console.log("event.data",event.data);
            if (event.data.result === "ok") {
                resolve();
            } else {
                reject(new Error("Failed to fetch work files"));
            }
          };
        });
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
                    console.log("task onmessage 1",command===ev.data.cmd);
                    //Issue here 
                    this.unexpectedCommandCheck(command, ev.data.cmd);
                    this.latexWorkerStatus = EngineStatus.Ready;
                    this.latexWorker!.onmessage = null;
                    this.latexWorker!.onerror = null;
                    const data = ev.data; delete data.result;
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
            console.log("postMessage",task);
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