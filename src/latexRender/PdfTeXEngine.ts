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

import fs from 'fs';
import path from 'path';
import SwiftLatexWorker from './swiftlatexpdftex.worker.js';

export enum EngineStatus {
    Init = 1,
    Ready,
    Busy,
    Error
}

export class CompileResult {
    pdf?: Uint8Array;
    status: number = -254;
    log: string = 'No log';
}
export class PdfTeXEngine {
  private latexWorker?: Worker;
  private latexWorkerStatus: EngineStatus;
  async loadEngine(): Promise<void> {
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
