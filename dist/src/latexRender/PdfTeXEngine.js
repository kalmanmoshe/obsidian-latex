/********************************************************************************
 * Copyright (C) 2019 Elliott Wen.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
export var EngineStatus;
(function (EngineStatus) {
    EngineStatus[EngineStatus["Init"] = 1] = "Init";
    EngineStatus[EngineStatus["Ready"] = 2] = "Ready";
    EngineStatus[EngineStatus["Busy"] = 3] = "Busy";
    EngineStatus[EngineStatus["Error"] = 4] = "Error";
})(EngineStatus || (EngineStatus = {}));
export class CompileResult {
    pdf;
    status = -254;
    log = 'No log';
}
export class PdfTeXEngine {
    latexWorker;
    latexWorkerStatus;
    async loadEngine() {
        if (this.latexWorker) {
            throw new Error('Other instance is running, abort()');
        }
        this.latexWorkerStatus = EngineStatus.Init;
        //const worker = new SwiftLatexWorker(); 
    }
}
/*
export class PdfTeXEngine {
  private latexWorker?: Worker;
  private latexWorkerStatus: EngineStatus = EngineStatus.Init;

  async loadEngine(): Promise<void> {
    if (this.latexWorker) {
        throw new Error('Other instance is running, abort()');
    }

    this.latexWorkerStatus = EngineStatus.Init;

    const worker = new SwiftLatexWorker(); // Create a local worker instance

    await new Promise<void>((resolve, reject) => {
        // Assign the worker to the class property
        this.latexWorker = worker;

        worker.onmessage = (ev: MessageEvent) => {
            const data = ev.data;
            const cmd = data.result;
            if (cmd === 'ok') {
                this.latexWorkerStatus = EngineStatus.Ready;
                resolve();
            } else {
                this.latexWorkerStatus = EngineStatus.Error;
                reject(new Error('Engine failed to initialize'));
            }
        };

        worker.onerror = (error: Event) => {
            this.latexWorkerStatus = EngineStatus.Error;
            reject(new Error(`Worker error: ${error}`));
        };
    });

    // Reset handlers after the promise resolves
    worker.onmessage = null;
    worker.onerror = null;
}



  isReady(): boolean {
      return this.latexWorkerStatus === EngineStatus.Ready;
  }

  private checkEngineStatus(): void {
      if (!this.isReady()) {
          throw new Error('Engine is still spinning or not ready yet!');
      }
  }

  async compileLaTeX(): Promise<CompileResult> {
      this.checkEngineStatus();
      this.latexWorkerStatus = EngineStatus.Busy;

      const startCompileTime = performance.now();

      const result = await new Promise<CompileResult>((resolve) => {
          if (!this.latexWorker) return;

          this.latexWorker.onmessage = (ev) => {
              const data = ev.data;
              const cmd = data.cmd;

              if (cmd !== 'compile') return;

              const { result, log, status } = data;
              this.latexWorkerStatus = EngineStatus.Ready;

              const compileResult = new CompileResult();
              compileResult.status = status;
              compileResult.log = log;

              if (result === 'ok') {
                  compileResult.pdf = new Uint8Array(data.pdf);
              }

              resolve(compileResult);
          };

          this.latexWorker.postMessage({ cmd: 'compilelatex' });
          console.log('Engine compilation start');
      });
      if(this.latexWorker)
      this.latexWorker.onmessage = () => {};

      console.log('Engine compilation finish', performance.now() - startCompileTime);

      return result;
  }

  async compileFormat(): Promise<void> {
      this.checkEngineStatus();
      this.latexWorkerStatus = EngineStatus.Busy;

      await new Promise<void>((resolve, reject) => {
          if (!this.latexWorker) return;

          this.latexWorker.onmessage = (ev) => {
              const data = ev.data;
              const cmd = data.cmd;

              if (cmd !== 'compile') return;

              const { result, log } = data;

              this.latexWorkerStatus = EngineStatus.Ready;

              if (result === 'ok') {
                  const formatArray = data.pdf;
                  const formatBlob = new Blob([formatArray], { type: 'application/octet-stream' });
                  const formatURL = URL.createObjectURL(formatBlob);

                  setTimeout(() => URL.revokeObjectURL(formatURL), 30000);
                  console.log('Download format file via', formatURL);
                  resolve();
              } else {
                  reject(log);
              }
          };

          this.latexWorker.postMessage({ cmd: 'compileformat' });
      });
      if(this.latexWorker) this.latexWorker.onmessage = () => {};
  }

  async fetchCacheData(): Promise<any[]> {
      return new Promise((resolve, reject) => {
          if (!this.latexWorker) return;

          this.latexWorker.onmessage = (ev) => {
              const data = ev.data;
              const cmd = data.cmd;

              if (cmd !== 'fetchcache') return;

              const { result, texlive404_cache, texlive200_cache, pk404_cache, pk200_cache } = data;

              if (result === 'ok') {
                  resolve([texlive404_cache, texlive200_cache, pk404_cache, pk200_cache]);
              } else {
                  reject('Failed to fetch cache data');
              }
          };

          this.latexWorker.postMessage({ cmd: 'fetchcache' });
      });
  }

  writeCacheData(texlive404_cache: any, texlive200_cache: any, pk404_cache: any, pk200_cache: any): void {
      this.checkEngineStatus();

      if (this.latexWorker) {
          this.latexWorker.postMessage({
              cmd: 'writecache',
              texlive404_cache,
              texlive200_cache,
              pk404_cache,
              pk200_cache
          });
      }
  }

  async fetchTexFiles(filenames: string[], hostDir: string): Promise<void> {
      const resolves = new Map<string, () => void>();

      if (this.latexWorker) {
          this.latexWorker.onmessage = (ev) => {
              const data = ev.data;
              const cmd = data.cmd;

              if (cmd !== 'fetchfile') return;

              const { result, content, filename } = data;

              fs.writeFileSync(path.join(hostDir, filename), new Uint8Array(content));

              if (result === 'ok') {
                  resolves.get(filename)?.();
              } else {
                  console.log(`Failed to fetch ${filename} from memfs`);
              }
          };

          const promises = filenames.map(
              (filename) =>
                  new Promise<void>((resolve) => {
                      resolves.set(filename, resolve);
                      this.latexWorker!.postMessage({ cmd: 'fetchfile', filename });
                  })
          );

          await Promise.all(promises);

          this.latexWorker.onmessage = () => {};
      }
  }

  writeTexFSFile(filename: string, srcCode: string): void {
      this.checkEngineStatus();

      if (this.latexWorker) {
          this.latexWorker.postMessage({ cmd: 'writetexfile', url: filename, src: srcCode });
      }
  }

  setEngineMainFile(filename: string): void {
      this.checkEngineStatus();

      if (this.latexWorker) {
          this.latexWorker.postMessage({ cmd: 'setmainfile', url: filename });
      }
  }

  writeMemFSFile(filename: string, srcCode: string): void {
      this.checkEngineStatus();

      if (this.latexWorker) {
          this.latexWorker.postMessage({ cmd: 'writefile', url: filename, src: srcCode });
      }
  }

  makeMemFSFolder(folder: string): void {
      this.checkEngineStatus();

      if (this.latexWorker && folder && folder !== '/') {
          this.latexWorker.postMessage({ cmd: 'mkdir', url: folder });
      }
  }

  flushCache(): void {
      this.checkEngineStatus();

      if (this.latexWorker) {
          this.latexWorker.postMessage({ cmd: 'flushcache' });
      }
  }

  setTexliveEndpoint(url: string): void {
      if (this.latexWorker) {
          this.latexWorker.postMessage({ cmd: 'settexliveurl', url });
      }
  }

  closeWorker(): void {
      if (this.latexWorker) {
          this.latexWorker.postMessage({ cmd: 'grace' });
          this.latexWorker = undefined;
      }
  }
}*/
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGRmVGVYRW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xhdGV4UmVuZGVyL1BkZlRlWEVuZ2luZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7a0ZBY2tGO0FBTWxGLE1BQU0sQ0FBTixJQUFZLFlBS1g7QUFMRCxXQUFZLFlBQVk7SUFDcEIsK0NBQVEsQ0FBQTtJQUNSLGlEQUFLLENBQUE7SUFDTCwrQ0FBSSxDQUFBO0lBQ0osaURBQUssQ0FBQTtBQUNULENBQUMsRUFMVyxZQUFZLEtBQVosWUFBWSxRQUt2QjtBQUVELE1BQU0sT0FBTyxhQUFhO0lBQ3RCLEdBQUcsQ0FBYztJQUNqQixNQUFNLEdBQVcsQ0FBQyxHQUFHLENBQUM7SUFDdEIsR0FBRyxHQUFXLFFBQVEsQ0FBQztDQUMxQjtBQUNELE1BQU0sT0FBTyxZQUFZO0lBQ2YsV0FBVyxDQUFVO0lBQ3JCLGlCQUFpQixDQUFlO0lBQ3hDLEtBQUssQ0FBQyxVQUFVO1FBQ2QsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbkIsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFFRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQztRQUUzQyx5Q0FBeUM7SUFDM0MsQ0FBQztDQUNGO0FBQ0Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTRQRyIsInNvdXJjZXNDb250ZW50IjpbIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICogQ29weXJpZ2h0IChDKSAyMDE5IEVsbGlvdHQgV2VuLlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBhbmQgdGhlIGFjY29tcGFueWluZyBtYXRlcmlhbHMgYXJlIG1hZGUgYXZhaWxhYmxlIHVuZGVyIHRoZVxuICogdGVybXMgb2YgdGhlIEVjbGlwc2UgUHVibGljIExpY2Vuc2Ugdi4gMi4wIHdoaWNoIGlzIGF2YWlsYWJsZSBhdFxuICogaHR0cDovL3d3dy5lY2xpcHNlLm9yZy9sZWdhbC9lcGwtMi4wLlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgbWF5IGFsc28gYmUgbWFkZSBhdmFpbGFibGUgdW5kZXIgdGhlIGZvbGxvd2luZyBTZWNvbmRhcnlcbiAqIExpY2Vuc2VzIHdoZW4gdGhlIGNvbmRpdGlvbnMgZm9yIHN1Y2ggYXZhaWxhYmlsaXR5IHNldCBmb3J0aCBpbiB0aGUgRWNsaXBzZVxuICogUHVibGljIExpY2Vuc2Ugdi4gMi4wIGFyZSBzYXRpc2ZpZWQ6IEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlLCB2ZXJzaW9uIDJcbiAqIHdpdGggdGhlIEdOVSBDbGFzc3BhdGggRXhjZXB0aW9uIHdoaWNoIGlzIGF2YWlsYWJsZSBhdFxuICogaHR0cHM6Ly93d3cuZ251Lm9yZy9zb2Z0d2FyZS9jbGFzc3BhdGgvbGljZW5zZS5odG1sLlxuICpcbiAqIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBFUEwtMi4wIE9SIEdQTC0yLjAgV0lUSCBDbGFzc3BhdGgtZXhjZXB0aW9uLTIuMFxuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgU3dpZnRMYXRleFdvcmtlciBmcm9tICcuL3N3aWZ0bGF0ZXhwZGZ0ZXgud29ya2VyLmpzJztcblxuZXhwb3J0IGVudW0gRW5naW5lU3RhdHVzIHtcbiAgICBJbml0ID0gMSxcbiAgICBSZWFkeSxcbiAgICBCdXN5LFxuICAgIEVycm9yXG59XG5cbmV4cG9ydCBjbGFzcyBDb21waWxlUmVzdWx0IHtcbiAgICBwZGY/OiBVaW50OEFycmF5O1xuICAgIHN0YXR1czogbnVtYmVyID0gLTI1NDtcbiAgICBsb2c6IHN0cmluZyA9ICdObyBsb2cnO1xufVxuZXhwb3J0IGNsYXNzIFBkZlRlWEVuZ2luZSB7XG4gIHByaXZhdGUgbGF0ZXhXb3JrZXI/OiBXb3JrZXI7XG4gIHByaXZhdGUgbGF0ZXhXb3JrZXJTdGF0dXM6IEVuZ2luZVN0YXR1cztcbiAgYXN5bmMgbG9hZEVuZ2luZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5sYXRleFdvcmtlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ090aGVyIGluc3RhbmNlIGlzIHJ1bm5pbmcsIGFib3J0KCknKTtcbiAgICB9XG5cbiAgICB0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLkluaXQ7XG5cbiAgICAvL2NvbnN0IHdvcmtlciA9IG5ldyBTd2lmdExhdGV4V29ya2VyKCk7IFxuICB9XG59XG4vKlxuZXhwb3J0IGNsYXNzIFBkZlRlWEVuZ2luZSB7XG4gIHByaXZhdGUgbGF0ZXhXb3JrZXI/OiBXb3JrZXI7XG4gIHByaXZhdGUgbGF0ZXhXb3JrZXJTdGF0dXM6IEVuZ2luZVN0YXR1cyA9IEVuZ2luZVN0YXR1cy5Jbml0O1xuXG4gIGFzeW5jIGxvYWRFbmdpbmUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMubGF0ZXhXb3JrZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdPdGhlciBpbnN0YW5jZSBpcyBydW5uaW5nLCBhYm9ydCgpJyk7XG4gICAgfVxuXG4gICAgdGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5Jbml0O1xuXG4gICAgY29uc3Qgd29ya2VyID0gbmV3IFN3aWZ0TGF0ZXhXb3JrZXIoKTsgLy8gQ3JlYXRlIGEgbG9jYWwgd29ya2VyIGluc3RhbmNlXG5cbiAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIC8vIEFzc2lnbiB0aGUgd29ya2VyIHRvIHRoZSBjbGFzcyBwcm9wZXJ0eVxuICAgICAgICB0aGlzLmxhdGV4V29ya2VyID0gd29ya2VyO1xuXG4gICAgICAgIHdvcmtlci5vbm1lc3NhZ2UgPSAoZXY6IE1lc3NhZ2VFdmVudCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGV2LmRhdGE7XG4gICAgICAgICAgICBjb25zdCBjbWQgPSBkYXRhLnJlc3VsdDtcbiAgICAgICAgICAgIGlmIChjbWQgPT09ICdvaycpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLlJlYWR5O1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5FcnJvcjtcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdFbmdpbmUgZmFpbGVkIHRvIGluaXRpYWxpemUnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgd29ya2VyLm9uZXJyb3IgPSAoZXJyb3I6IEV2ZW50KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLkVycm9yO1xuICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgV29ya2VyIGVycm9yOiAke2Vycm9yfWApKTtcbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIC8vIFJlc2V0IGhhbmRsZXJzIGFmdGVyIHRoZSBwcm9taXNlIHJlc29sdmVzXG4gICAgd29ya2VyLm9ubWVzc2FnZSA9IG51bGw7XG4gICAgd29ya2VyLm9uZXJyb3IgPSBudWxsO1xufVxuXG5cblxuICBpc1JlYWR5KCk6IGJvb2xlYW4ge1xuICAgICAgcmV0dXJuIHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPT09IEVuZ2luZVN0YXR1cy5SZWFkeTtcbiAgfVxuXG4gIHByaXZhdGUgY2hlY2tFbmdpbmVTdGF0dXMoKTogdm9pZCB7XG4gICAgICBpZiAoIXRoaXMuaXNSZWFkeSgpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFbmdpbmUgaXMgc3RpbGwgc3Bpbm5pbmcgb3Igbm90IHJlYWR5IHlldCEnKTtcbiAgICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNvbXBpbGVMYVRlWCgpOiBQcm9taXNlPENvbXBpbGVSZXN1bHQ+IHtcbiAgICAgIHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcbiAgICAgIHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuQnVzeTtcblxuICAgICAgY29uc3Qgc3RhcnRDb21waWxlVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTxDb21waWxlUmVzdWx0PigocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5sYXRleFdvcmtlcikgcmV0dXJuO1xuXG4gICAgICAgICAgdGhpcy5sYXRleFdvcmtlci5vbm1lc3NhZ2UgPSAoZXYpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGV2LmRhdGE7XG4gICAgICAgICAgICAgIGNvbnN0IGNtZCA9IGRhdGEuY21kO1xuXG4gICAgICAgICAgICAgIGlmIChjbWQgIT09ICdjb21waWxlJykgcmV0dXJuO1xuXG4gICAgICAgICAgICAgIGNvbnN0IHsgcmVzdWx0LCBsb2csIHN0YXR1cyB9ID0gZGF0YTtcbiAgICAgICAgICAgICAgdGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcblxuICAgICAgICAgICAgICBjb25zdCBjb21waWxlUmVzdWx0ID0gbmV3IENvbXBpbGVSZXN1bHQoKTtcbiAgICAgICAgICAgICAgY29tcGlsZVJlc3VsdC5zdGF0dXMgPSBzdGF0dXM7XG4gICAgICAgICAgICAgIGNvbXBpbGVSZXN1bHQubG9nID0gbG9nO1xuXG4gICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09ICdvaycpIHtcbiAgICAgICAgICAgICAgICAgIGNvbXBpbGVSZXN1bHQucGRmID0gbmV3IFVpbnQ4QXJyYXkoZGF0YS5wZGYpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmVzb2x2ZShjb21waWxlUmVzdWx0KTtcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgdGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7IGNtZDogJ2NvbXBpbGVsYXRleCcgfSk7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0VuZ2luZSBjb21waWxhdGlvbiBzdGFydCcpO1xuICAgICAgfSk7XG4gICAgICBpZih0aGlzLmxhdGV4V29ya2VyKVxuICAgICAgdGhpcy5sYXRleFdvcmtlci5vbm1lc3NhZ2UgPSAoKSA9PiB7fTtcblxuICAgICAgY29uc29sZS5sb2coJ0VuZ2luZSBjb21waWxhdGlvbiBmaW5pc2gnLCBwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0Q29tcGlsZVRpbWUpO1xuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgY29tcGlsZUZvcm1hdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgIHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcbiAgICAgIHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuQnVzeTtcblxuICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5sYXRleFdvcmtlcikgcmV0dXJuO1xuXG4gICAgICAgICAgdGhpcy5sYXRleFdvcmtlci5vbm1lc3NhZ2UgPSAoZXYpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGV2LmRhdGE7XG4gICAgICAgICAgICAgIGNvbnN0IGNtZCA9IGRhdGEuY21kO1xuXG4gICAgICAgICAgICAgIGlmIChjbWQgIT09ICdjb21waWxlJykgcmV0dXJuO1xuXG4gICAgICAgICAgICAgIGNvbnN0IHsgcmVzdWx0LCBsb2cgfSA9IGRhdGE7XG5cbiAgICAgICAgICAgICAgdGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcblxuICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSAnb2snKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBmb3JtYXRBcnJheSA9IGRhdGEucGRmO1xuICAgICAgICAgICAgICAgICAgY29uc3QgZm9ybWF0QmxvYiA9IG5ldyBCbG9iKFtmb3JtYXRBcnJheV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbScgfSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBmb3JtYXRVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGZvcm1hdEJsb2IpO1xuXG4gICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwoZm9ybWF0VVJMKSwgMzAwMDApO1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0Rvd25sb2FkIGZvcm1hdCBmaWxlIHZpYScsIGZvcm1hdFVSTCk7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZWplY3QobG9nKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG5cbiAgICAgICAgICB0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgY21kOiAnY29tcGlsZWZvcm1hdCcgfSk7XG4gICAgICB9KTtcbiAgICAgIGlmKHRoaXMubGF0ZXhXb3JrZXIpIHRoaXMubGF0ZXhXb3JrZXIub25tZXNzYWdlID0gKCkgPT4ge307XG4gIH1cblxuICBhc3luYyBmZXRjaENhY2hlRGF0YSgpOiBQcm9taXNlPGFueVtdPiB7XG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5sYXRleFdvcmtlcikgcmV0dXJuO1xuXG4gICAgICAgICAgdGhpcy5sYXRleFdvcmtlci5vbm1lc3NhZ2UgPSAoZXYpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGV2LmRhdGE7XG4gICAgICAgICAgICAgIGNvbnN0IGNtZCA9IGRhdGEuY21kO1xuXG4gICAgICAgICAgICAgIGlmIChjbWQgIT09ICdmZXRjaGNhY2hlJykgcmV0dXJuO1xuXG4gICAgICAgICAgICAgIGNvbnN0IHsgcmVzdWx0LCB0ZXhsaXZlNDA0X2NhY2hlLCB0ZXhsaXZlMjAwX2NhY2hlLCBwazQwNF9jYWNoZSwgcGsyMDBfY2FjaGUgfSA9IGRhdGE7XG5cbiAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ29rJykge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZShbdGV4bGl2ZTQwNF9jYWNoZSwgdGV4bGl2ZTIwMF9jYWNoZSwgcGs0MDRfY2FjaGUsIHBrMjAwX2NhY2hlXSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZWplY3QoJ0ZhaWxlZCB0byBmZXRjaCBjYWNoZSBkYXRhJyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgdGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7IGNtZDogJ2ZldGNoY2FjaGUnIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICB3cml0ZUNhY2hlRGF0YSh0ZXhsaXZlNDA0X2NhY2hlOiBhbnksIHRleGxpdmUyMDBfY2FjaGU6IGFueSwgcGs0MDRfY2FjaGU6IGFueSwgcGsyMDBfY2FjaGU6IGFueSk6IHZvaWQge1xuICAgICAgdGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXG4gICAgICBpZiAodGhpcy5sYXRleFdvcmtlcikge1xuICAgICAgICAgIHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICBjbWQ6ICd3cml0ZWNhY2hlJyxcbiAgICAgICAgICAgICAgdGV4bGl2ZTQwNF9jYWNoZSxcbiAgICAgICAgICAgICAgdGV4bGl2ZTIwMF9jYWNoZSxcbiAgICAgICAgICAgICAgcGs0MDRfY2FjaGUsXG4gICAgICAgICAgICAgIHBrMjAwX2NhY2hlXG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gIH1cblxuICBhc3luYyBmZXRjaFRleEZpbGVzKGZpbGVuYW1lczogc3RyaW5nW10sIGhvc3REaXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgY29uc3QgcmVzb2x2ZXMgPSBuZXcgTWFwPHN0cmluZywgKCkgPT4gdm9pZD4oKTtcblxuICAgICAgaWYgKHRoaXMubGF0ZXhXb3JrZXIpIHtcbiAgICAgICAgICB0aGlzLmxhdGV4V29ya2VyLm9ubWVzc2FnZSA9IChldikgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBkYXRhID0gZXYuZGF0YTtcbiAgICAgICAgICAgICAgY29uc3QgY21kID0gZGF0YS5jbWQ7XG5cbiAgICAgICAgICAgICAgaWYgKGNtZCAhPT0gJ2ZldGNoZmlsZScpIHJldHVybjtcblxuICAgICAgICAgICAgICBjb25zdCB7IHJlc3VsdCwgY29udGVudCwgZmlsZW5hbWUgfSA9IGRhdGE7XG5cbiAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oaG9zdERpciwgZmlsZW5hbWUpLCBuZXcgVWludDhBcnJheShjb250ZW50KSk7XG5cbiAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ29rJykge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZXMuZ2V0KGZpbGVuYW1lKT8uKCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRmFpbGVkIHRvIGZldGNoICR7ZmlsZW5hbWV9IGZyb20gbWVtZnNgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBjb25zdCBwcm9taXNlcyA9IGZpbGVuYW1lcy5tYXAoXG4gICAgICAgICAgICAgIChmaWxlbmFtZSkgPT5cbiAgICAgICAgICAgICAgICAgIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXMuc2V0KGZpbGVuYW1lLCByZXNvbHZlKTtcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdGV4V29ya2VyIS5wb3N0TWVzc2FnZSh7IGNtZDogJ2ZldGNoZmlsZScsIGZpbGVuYW1lIH0pO1xuICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG4gICAgICAgICAgdGhpcy5sYXRleFdvcmtlci5vbm1lc3NhZ2UgPSAoKSA9PiB7fTtcbiAgICAgIH1cbiAgfVxuXG4gIHdyaXRlVGV4RlNGaWxlKGZpbGVuYW1lOiBzdHJpbmcsIHNyY0NvZGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgdGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXG4gICAgICBpZiAodGhpcy5sYXRleFdvcmtlcikge1xuICAgICAgICAgIHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyBjbWQ6ICd3cml0ZXRleGZpbGUnLCB1cmw6IGZpbGVuYW1lLCBzcmM6IHNyY0NvZGUgfSk7XG4gICAgICB9XG4gIH1cblxuICBzZXRFbmdpbmVNYWluRmlsZShmaWxlbmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICB0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XG5cbiAgICAgIGlmICh0aGlzLmxhdGV4V29ya2VyKSB7XG4gICAgICAgICAgdGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7IGNtZDogJ3NldG1haW5maWxlJywgdXJsOiBmaWxlbmFtZSB9KTtcbiAgICAgIH1cbiAgfVxuXG4gIHdyaXRlTWVtRlNGaWxlKGZpbGVuYW1lOiBzdHJpbmcsIHNyY0NvZGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgdGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXG4gICAgICBpZiAodGhpcy5sYXRleFdvcmtlcikge1xuICAgICAgICAgIHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyBjbWQ6ICd3cml0ZWZpbGUnLCB1cmw6IGZpbGVuYW1lLCBzcmM6IHNyY0NvZGUgfSk7XG4gICAgICB9XG4gIH1cblxuICBtYWtlTWVtRlNGb2xkZXIoZm9sZGVyOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgIHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcblxuICAgICAgaWYgKHRoaXMubGF0ZXhXb3JrZXIgJiYgZm9sZGVyICYmIGZvbGRlciAhPT0gJy8nKSB7XG4gICAgICAgICAgdGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7IGNtZDogJ21rZGlyJywgdXJsOiBmb2xkZXIgfSk7XG4gICAgICB9XG4gIH1cblxuICBmbHVzaENhY2hlKCk6IHZvaWQge1xuICAgICAgdGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXG4gICAgICBpZiAodGhpcy5sYXRleFdvcmtlcikge1xuICAgICAgICAgIHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyBjbWQ6ICdmbHVzaGNhY2hlJyB9KTtcbiAgICAgIH1cbiAgfVxuXG4gIHNldFRleGxpdmVFbmRwb2ludCh1cmw6IHN0cmluZyk6IHZvaWQge1xuICAgICAgaWYgKHRoaXMubGF0ZXhXb3JrZXIpIHtcbiAgICAgICAgICB0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgY21kOiAnc2V0dGV4bGl2ZXVybCcsIHVybCB9KTtcbiAgICAgIH1cbiAgfVxuXG4gIGNsb3NlV29ya2VyKCk6IHZvaWQge1xuICAgICAgaWYgKHRoaXMubGF0ZXhXb3JrZXIpIHtcbiAgICAgICAgICB0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgY21kOiAnZ3JhY2UnIH0pO1xuICAgICAgICAgIHRoaXMubGF0ZXhXb3JrZXIgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gIH1cbn0qL1xuIl19