import * as fs from "fs";
import * as path from "path";
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
    
    protected compiler: Worker | undefined;
    protected compilerStatus: EngineStatus = EngineStatus.Init;
    abstract loadEngine(): Promise<void>

    isReady(): boolean {
        return this.compilerStatus === EngineStatus.Ready;
    }
    getEngineStatus(): EngineStatus {return this.compilerStatus;}
    tasks: string[]=[];
    protected checkEngineStatus(): this is {compiler: Worker} {
        if (!this.isReady()) {
            console.log("last task", this.tasks[this.tasks.length - 1]);
            throw new Error("Engine is still spinning or not ready yet! engineStatus: " + EngineStatus[this.compilerStatus]);
        }
        if(this.compiler===undefined){
            throw new Error("Engine is not initialized! Please call loadEngine() first.");
        }
        return true;
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
    async compilePDF(): Promise<CompileResult> {
        const startCompileTime = performance.now();
        const data = await this.task<{pdf?: Uint8Array;status: number;log: string}>({cmd: EngineCommands.Compilepdf});
        console.log('Engine compilation finish ' + (performance.now() - startCompileTime));
        return new CompileResult(
            data.pdf ? Buffer.from(new Uint8Array(data.pdf)) : undefined,
            data.status,
            data.log
        );
    }
    getCompiler() {return this.compiler;}

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
        return this.task<{texlive404: Record<string,number>,texlive200: Record<string,string>,font404: Record<string,number>,font200: Record<string,string>}>(
            { cmd: EngineCommands.FetchCache }
        ).then(data =>{
            if(!data) {
                throw new Error("No cache data received from the worker.");
            }
            return [
                recordToString(data.texlive404),
                data.texlive200,
                recordToString(data.font404),
                data.font200,
            ]
        })
    }
    

    writeCacheData(texlive404_cache: any, texlive200_cache: any, font404_cache: any, font200_cache: any) {
        return this.task({ cmd: EngineCommands.writecache, texlive404_cache, texlive200_cache, font404_cache, font200_cache });
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
            const data = await this.task<{ content: Uint8Array<any> }>({ cmd: EngineCommands.Fetchfile, filename });
            const fileContent = new Uint8Array(data.content);
            await fs.promises.writeFile(path.join(hostDir, filename), fileContent);
        }
    }
    
    
    task<T = void>(task: any): Promise<T> {
        const command = task.cmd;
        if(!this.checkEngineStatus()) return Promise.reject();
        this.compilerStatus = EngineStatus.Busy;
        this.tasks.push(command);
        return new Promise<T>((resolve, reject) => {
            this.compiler.onmessage = (ev: MessageEvent<any>) => {
                try {
                    if(ev.data.cmd!==command){
                        throw new Error(`Unexpected command: ${ev.data.cmd}, expected: ${command}`);
                    }
                    //console.log("Task completed:", ev.data);
                    this.compilerStatus = EngineStatus.Ready;
                    this.compiler.onmessage = null;
                    this.compiler.onerror = null;
                    const data = ev.data; delete data.result;delete data.cmd;
                    //console.debug("Task completed:", command);
                    if (Array.from(Object.keys(data)).length > 0) {
                        resolve(data as T);
                    } else {
                        resolve(undefined as T);
                    }
                } catch (err) {
                    console.error("Error in task", err);
                    this.compilerStatus = EngineStatus.Error;
                    this.compiler.onmessage = null;
                    this.compiler.onerror = null;
                    reject(err);
                }
            };
            this.compiler.onerror = (err: ErrorEvent) => {
                this.compilerStatus = EngineStatus.Error;
                this.compiler.onmessage = null;
                this.compiler.onerror = null;
                console.error("Worker error:", err);
                reject(new Error(`Worker error: ${err.message}`));
            };
            this.compiler!.postMessage(task);
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
        return this.task({ cmd: EngineCommands.Mkdir, url: folder });
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
        if (this.compiler) {
            this.compiler.postMessage({ cmd: EngineCommands.Grace });
            this.compiler=undefined;
        }
        this.compilerStatus = EngineStatus.Init;
    }
}

