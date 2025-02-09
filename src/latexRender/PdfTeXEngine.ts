import * as fs from "fs";
import * as path from "path";
//@ts-ignore
import Worker from "./swiftlatexpdftex.worker";
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

enum latexWorkerCommands {
  Compilelatex = "compilelatex",
  grace = "grace",
  settexliveurl = "settexliveurl",
  flushcache = "flushcache",
  mkdir = "mkdir",
  compileformat = "compileformat",
  fetchcache = "fetchcache",
  writecache = "writecache",
  fetchFSRoot = "fetchFSRoot",
  fetchfile = "fetchfile",
  writetexfile = "writetexfile",
  setmainfile = "setmainfile",
  writefile = "writefile",
}

export class PdfTeXEngine {
    private latexWorker: Worker | undefined = undefined
    private latexWorkerStatus: EngineStatus = EngineStatus.Init;

    async loadEngine(): Promise<void> {
        if (this.latexWorker) {throw new Error("Other instance is running, abort()");}

        this.latexWorkerStatus = EngineStatus.Init;

        await new Promise<void>((resolve, reject) => {
        this.latexWorker = new Worker(Worker);
        //console.log("Engine loaded", this.latexWorker);
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
        throw new Error("Engine is still spinning or not ready yet!");
    }
    }

    async compileLaTeX(): Promise<CompileResult> {
    this.checkEngineStatus();
    this.latexWorkerStatus = EngineStatus.Busy;
    const startCompileTime = performance.now();

    const result = await new Promise<CompileResult>((resolve) => {
        this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
        const data = ev.data;
        if (data.cmd !== "compile") return;

        this.latexWorkerStatus = EngineStatus.Ready;
        console.log(`Engine compilation finished in ${performance.now() - startCompileTime} ms`);

        const compileResult = new CompileResult(data.pdf?Buffer.from(new Uint8Array(data.pdf)):undefined, data.status, data.log);
        resolve(compileResult);
        };

        this.latexWorker!.postMessage({ cmd: "compilelatex" });
    });

    this.latexWorker!.onmessage = () => {};
    return result;
    }

    async compileFormat(): Promise<void> {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;

        await new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
            const data = ev.data;
            if (data.cmd !== "compile") return;

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

        this.latexWorker!.onmessage = () => {};
    }

    async fetchCacheData(): Promise<any[]> {
        return new Promise<any[]>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
            const data = ev.data;
            if (data.cmd !== "fetchcache") return;

            if (data.result === "ok") {
                resolve([data.texlive404_cache, data.texlive200_cache, data.pk404_cache, data.pk200_cache]);
            } else {
                reject("Failed to fetch cache data");
            }
            };

            this.latexWorker!.postMessage({ cmd: "fetchcache" });
        });
    }

    writeCacheData(texlive404_cache: any, texlive200_cache: any, pk404_cache: any, pk200_cache: any): void {
        this.checkEngineStatus();
        this.latexWorker?.postMessage({ cmd: latexWorkerCommands.writecache, texlive404_cache, texlive200_cache, pk404_cache, pk200_cache });
    }

    async fetchTexFiles(filenames: string[], hostDir: string): Promise<void> {
        this.latexWorker!.postMessage({ cmd: "fetchcache" });
        this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
            if (ev.data.cmd === "fetchcache") {
              if (ev.data.result === "ok") {
                // e.data.texlive404_cache, e.data.texlive200_cache, etc.
              } else {
                console.error("Failed to fetch cache data");
              }
            }
          };

        const resolves = new Map<string, () => void>();
        if(this.latexWorker===undefined)throw new Error("Worker is not loaded");

        this.latexWorker.onmessage = (ev:MessageEvent<any>) => {
            const data = ev.data;
            if (data.cmd !== "fetchfile") return;

            const fileContent = new Uint8Array(data.content);
            fs.writeFileSync(path.join(hostDir, data.filename), fileContent);
            
            if (data.result === "ok") {
            resolves.get(data.filename)?.();
            } else {
            
            console.error(`Failed to fetch ${data.filename} from memfs`);
            }
        };

        const promises = filenames.map(
            (filename) =>
            new Promise<void>((resolve) => {
                resolves.set(filename, resolve);
                this.latexWorker!.postMessage({ cmd: "fetchfile", filename });
            })
        );

        await Promise.all(promises);
            this.latexWorker!.onmessage = () => {};
    }

    writeTexFSFile(filename: string, srcCode: Buffer<ArrayBufferLike>): void {
        this.checkEngineStatus();
        this.latexWorker?.postMessage({ cmd: "writetexfile", url: filename, src: srcCode });
    }

    setEngineMainFile(filename: string): void {
        this.checkEngineStatus();
        this.latexWorker?.postMessage({ cmd: "setmainfile", url: filename });
    }

    writeMemFSFile(filename: string, srcCode: string): void {
        this.checkEngineStatus();
        this.latexWorker?.postMessage({ cmd: "writefile", url: filename, src: srcCode });
    }

    makeMemFSFolder(folder: string): void {
        this.checkEngineStatus();
        if (!folder || folder === "/") return;
        this.latexWorker?.postMessage({ cmd: "mkdir", url: folder });
    }

    flushCache(): void {
        this.checkEngineStatus();
        this.latexWorker?.postMessage({ cmd: "flushcache" });
    }

    setTexliveEndpoint(url: string): void {
        this.latexWorker?.postMessage({ cmd: "settexliveurl", url });
    }

    closeWorker(): void {
        if (this.latexWorker) {
            this.latexWorker.postMessage({ cmd: "grace" });
            this.latexWorker=undefined;
        }
    }
}
export default PdfTeXEngine;