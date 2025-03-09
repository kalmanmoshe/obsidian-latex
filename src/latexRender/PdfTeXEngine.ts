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

enum latexWorkerCommands {
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
}

export class PdfTeXEngine {
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
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                const data = ev.data;
                this.unexpectedCommandCheck("compile",data.cmd);

                this.latexWorkerStatus = EngineStatus.Ready;
                console.log(`Engine compilation finished in ${performance.now() - startCompileTime} ms`);
                //console.log("data.myLog",data);
                const compileResult = new CompileResult(data.pdf?Buffer.from(new Uint8Array(data.pdf)):undefined, data.status, data.log);
                resolve(compileResult);
            };

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
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker!.postMessage({ cmd: latexWorkerCommands.writecache, texlive404_cache, texlive200_cache, pk404_cache, pk200_cache });
        return new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                this.unexpectedCommandCheck("writecache",ev.data.cmd);
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                if (ev.data.result === "ok") {
                    console.log("Cache data written successfully");
                } else {
                    console.error("Failed to write cache data");
                }
                resolve();
            };
        });
    }

    async fetchWorkFiles() {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker!.postMessage({ cmd: latexWorkerCommands.fetchWorkFiles });
        return new Promise<void>((resolve, reject) => {
          this.latexWorker!.onmessage = (event: MessageEvent) => {
            this.unexpectedCommandCheck(latexWorkerCommands.fetchWorkFiles,event.data.cmd);
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
      

    async fetchTexFiles(filenames: string[], hostDir: string): Promise<void> {
        this.checkEngineStatus();
    
        if (!this.latexWorker) {
            throw new Error("Worker is not loaded");
        }
    
        const fetchSingleFile = (filename: string): Promise<void> => {
            return new Promise<void>((resolve, reject) => {
                const messageHandler = (ev: MessageEvent<any>) => {
                    const data = ev.data;
                    this.unexpectedCommandCheck("fetchfile",data.cmd);
                    this.latexWorker!.removeEventListener('message', messageHandler);
    
                    if (data.result === "ok") {
                        const fileContent = new Uint8Array(data.content);
                        fs.promises.writeFile(path.join(hostDir, filename), fileContent)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        reject(new Error(`Failed to fetch ${filename} from memfs`));
                    }
                };
                this.latexWorker!.addEventListener('message', messageHandler);
                this.latexWorker!.postMessage({ cmd: "fetchfile", filename });
            });
        };
        for (const filename of filenames) {
            this.latexWorkerStatus = EngineStatus.Busy;
            try {
                await fetchSingleFile(filename);
            } catch (err) {
                console.error(err);
                throw err;
            } finally {
                this.latexWorkerStatus = EngineStatus.Ready;
            }
        }
    }
    
    /**
     * 
     */
    writeTexFSFile(filename: string, srcCode: Buffer<ArrayBufferLike>) {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker?.postMessage({ cmd: "writetexfile", url: filename, src: srcCode });
        return new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                this.unexpectedCommandCheck("writetexfile",ev.data.cmd);
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                resolve();
            };
        });
    }

    setEngineMainFile(filename: string) {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker?.postMessage({ cmd: "setmainfile", url: filename });
        return new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                this.unexpectedCommandCheck("setmainfile",ev.data.cmd);
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                resolve();
            };
        });
    }
    /**
     * Writes a file to the in-memory filesystem managed by the LaTeX worker.
     * 
     * @param filename - The name (or URL path) of the file to be written.
     * @param srcCode - The source code or content to write into the file.
     */
    writeMemFSFile(filename: string, srcCode: string) {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker?.postMessage({ cmd: "writefile", url: filename, src: srcCode });
        return new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                this.unexpectedCommandCheck("writefile",ev.data.cmd);
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                resolve();
            };
        });
    }

    makeMemFSFolder(folder: string) {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        if (!folder || folder === "/") return;
        this.latexWorker?.postMessage({ cmd: "mkdir", url: folder });
        return new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                this.unexpectedCommandCheck("mkdir",ev.data.cmd);
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                resolve();
            };
        });
    }

    flushWorkCache() {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker?.postMessage({ cmd: latexWorkerCommands.FlushWorkDirectory });
        return new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                this.unexpectedCommandCheck("flushworkcache",ev.data.cmd);
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                resolve();
            };
        });
    }
    flushCache() {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker?.postMessage({ cmd: latexWorkerCommands.Flushcatche });
        return new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                this.unexpectedCommandCheck("flushcache",ev.data.cmd);
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                resolve();
            };
        });
    }

    setTexliveEndpoint(url: string) {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        this.latexWorker?.postMessage({ cmd: "settexliveurl", url });
        return new Promise<void>((resolve, reject) => {
            this.latexWorker!.onmessage = (ev:MessageEvent<any>) => {
                this.unexpectedCommandCheck("settexliveurl",ev.data.cmd);
                this.latexWorkerStatus = EngineStatus.Ready;
                this.latexWorker!.onmessage = null;
                resolve();
            };
        });
    }

    closeWorker(): void {
        if (this.latexWorker) {
            this.latexWorker.postMessage({ cmd: "grace" });
            this.latexWorker=undefined;
        }
    }
}
export default PdfTeXEngine;