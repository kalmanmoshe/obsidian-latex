export enum EngineStatus {
  Init,
  Ready,
  Busy,
  Error,
  Unresponsive,
}

export enum CompileStatus {
  Success = 0,
  ProcessingError,
  CompileError,
  FileNotFound = -253,
  EngineCrashed = -254,
}

export class CompileResult {
  pdf: Uint8Array;
  status: number = -254;
  log: string = 'No log';

  constructor(
    pdf: Uint8Array | undefined,
    status: number,
    log: string,
  ) {
    if (pdf) this.pdf = pdf;
    this.status = status;
    this.log = log;
  }
  
}

export enum EngineCommands {
  Compilelatex = 'compilelatex',
  Grace = 'grace',
  Settexliveurl = 'settexliveurl',
  Mkdir = 'mkdir',
  Compileformat = 'compileformat',
  Writecache = 'writecache',
  Fetchfile = 'fetchfile',
  FetchWorkFiles = 'fetchWorkFiles',
  FetchCache = 'fetchcache',
  Writetexfile = 'writetexfile',
  Setmainfile = 'setmainfile',
  Writefile = 'writefile',
  Flushcatche = 'flushcache',
  FlushWorkDirectory = 'flushworkcache',
  Removefile = 'removefile',
  Compilepdf = 'compilepdf',
}

export default class LatexEngine {

  protected worker: Worker | undefined;
  protected engineStatus: EngineStatus = EngineStatus.Init;
  protected tasks: string[] = [];

  constructor(
		private readonly WorkerClass: any,
	) {}

  async loadEngine(): Promise<void> {
    if (this.worker) {
      throw new Error('Other instance is running, abort()');
    }

    this.engineStatus = EngineStatus.Init;

    await new Promise<void>((resolve, reject) => {
      this.worker = new this.WorkerClass();

      this.worker!.onmessage = (ev: MessageEvent<any>) => {
        const data = ev.data;

        this.worker!.onmessage = null;
        this.worker!.onerror = null;

        if (data.result === 'ok') {
          this.engineStatus = EngineStatus.Ready;
          resolve();
        } else {
          this.engineStatus = EngineStatus.Error;
          reject(new Error('Engine failed to initialize'));
        }
      };

      this.worker!.onerror = (err) => {
        this.worker!.onmessage = null;
        this.worker!.onerror = null;

        this.engineStatus = EngineStatus.Error;
        reject(new Error(`Worker init error: ${err.message}`));
      };
    });
  }

  isReady(): boolean {
    return this.engineStatus === EngineStatus.Ready;
  }

  getEngineStatus(): EngineStatus {
    return this.engineStatus;
  }

  protected checkEngineStatus(cmd?: string): this is { worker: Worker } {
    if (!this.isReady()) {
      const errorMessage =
        `Engine is not ready! engineStatus: ${EngineStatus[this.engineStatus]}, last task: ${this.tasks[this.tasks.length - 1]}.` +
        (cmd ? `, Attempted command: ${cmd}` : '');
      throw new Error(errorMessage);
    }
    if (this.worker === undefined) {
      throw new Error(
        'Engine is not initialized! Please call loadEngine() first.',
      );
    }
    return true;
  }

  async compileLaTeX(): Promise<CompileResult> {
    const startCompileTime = performance.now();
    const data = await this.task<{
      pdf?: Uint8Array;
      status: number;
      log: string;
    }>({
      cmd: EngineCommands.Compilelatex,
    });
    console.log(
      `Engine compilation finished in ${performance.now() - startCompileTime} ms`,
    );
    return new CompileResult(
      data.pdf ? new Uint8Array(data.pdf) : undefined,
      data.status,
      data.log,
    );
  }

  async compilePDF(): Promise<CompileResult> {
    const startCompileTime = performance.now();
    const data = await this.task<{
      pdf?: Uint8Array;
      status: number;
      log: string;
    }>({ cmd: EngineCommands.Compilepdf });

    console.log(
      'Engine compilation finish ' +
      (performance.now() - startCompileTime),
    );
    return new CompileResult(
      data.pdf ? new Uint8Array(data.pdf) : undefined,
      data.status,
      data.log,
    );
  }

  getCompiler() {
    return this.worker;
  }

  async compileFormat(): Promise<void> {
    const data = await this.task<{ pdf: Uint8Array; log?: string }>({
      cmd: EngineCommands.Compileformat,
    });
    const formatBlob = new Blob([new Uint8Array(data.pdf)], {
      type: 'application/octet-stream',
    });
    const formatURL = URL.createObjectURL(formatBlob);
    setTimeout(() => URL.revokeObjectURL(formatURL), 30000);
    console.log('Download format file via ' + formatURL);
  }

  async fetchCacheData() {
    const recordToString = (record: Record<string, number>) => {
      return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
          key,
          String(value),
        ]),
      );
    };
    return this.task<{
      texlive404: Record<string, number>;
      texlive200: Record<string, string>;
      font404: Record<string, number>;
      font200: Record<string, string>;
    }>({ cmd: EngineCommands.FetchCache }).then((data) => {
      if (!data) {
        throw new Error('No cache data received from the worker.');
      }
      return [
        recordToString(data.texlive404),
        data.texlive200,
        recordToString(data.font404),
        data.font200,
      ];
    });
  }

  writeCacheData(
    texlive404_cache: any,
    texlive200_cache: any,
    font404_cache: any,
    font200_cache: any,
  ) {
    return this.task({
      cmd: EngineCommands.Writecache,
      texlive404_cache,
      texlive200_cache,
      font404_cache,
      font200_cache,
    });
  }

  async fetchWorkFiles() {
    return this.task<{ file: String[] }>({
      cmd: EngineCommands.FetchWorkFiles,
    });
  }

  /**
   * Fetches a list of TeX files from a virtual file system and returns them contents.
   *
   * @param filenames - An array of filenames to fetch from the virtual file system.
   */
  async fetchTexFiles(fileNames: string[]) {
    const files = [];
    for (const fileName of fileNames) {
      const data = await this.task<{ content: Uint8Array<any> }>({
        cmd: EngineCommands.Fetchfile,
        fileName,
      });
      const fileContent = new Uint8Array(data.content);
      files.push({ name: fileName, content: fileContent });
    }
    return files;
  }

  task<T = void>(task: any, timeoutMs = 15000): Promise<T> {
    const command = task.cmd;
  
    this.checkEngineStatus(command);
    this.engineStatus = EngineStatus.Busy;
    this.tasks.push(command);
  
    const worker = this.worker!;
  
    return new Promise<T>((resolve, reject) => {
      let settled = false;
  
      const cleanup = () => {
        worker.onmessage = null;
        worker.onerror = null;
      };
  
      const ok = (v: T) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(v);
      };
  
      const fail = (e: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      };
  
      const timer = window.setTimeout(() => {
        // Mark as unresponsive so closeWorker() terminates.
        this.engineStatus = EngineStatus.Unresponsive;
        fail(new Error(`Engine timeout on cmd=${command} after ${timeoutMs}ms`));
      }, timeoutMs);
  
      worker.onmessage = (ev: MessageEvent<any>) => {
        try {
          // IMPORTANT: don't throw on other messages
          if (ev.data?.cmd !== command) return;
  
          window.clearTimeout(timer);
  
          this.engineStatus = EngineStatus.Ready;
  
          const data = { ...ev.data };
          delete (data as any).result;
          delete (data as any).cmd;
  
          ok((Object.keys(data).length ? (data as T) : (undefined as T)));
        } catch (err) {
          window.clearTimeout(timer);
          this.engineStatus = EngineStatus.Error;
          fail(err);
        }
      };
  
      worker.onerror = (err: ErrorEvent) => {
        window.clearTimeout(timer);
        this.engineStatus = EngineStatus.Error;
        console.error("Worker error:", err);
        fail(new Error(`Worker error: ${err.message}`));
      };
  
      worker.postMessage(task);
    });
  }
  
  /**
   *
   */
  writeTexFSFile(filename: string, srcCode: Uint8Array) {
    return this.task({
      cmd: EngineCommands.Writetexfile,
      url: filename,
      src: srcCode,
    });
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
  writeMemFSFile(
    filename: string,
    srcCode: string | Uint8Array,
  ) {
    return this.task({
      cmd: EngineCommands.Writefile,
      url: filename,
      src: srcCode,
    });
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
    if (!folder || folder === '/') return Promise.resolve();
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
    if (this.worker) {
      if (this.engineStatus === EngineStatus.Unresponsive) {
        try {
          // If it’s hung, it will never process "grace" anyway.
          // Terminate is the only reliable stop.
          this.worker.terminate();
        } catch { }
      } else {
        this.worker.postMessage({ cmd: EngineCommands.Grace });
      }
      this.worker = undefined;
    }
    this.engineStatus = EngineStatus.Init;
  }

}
