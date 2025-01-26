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
const ENGINE_PATH = './swiftlatexpdftex.worker.js';
export class CompileResult {
    pdf = undefined;
    status = -254;
    log = 'No log';
}
export class PdfTeXEngine {
    latexWorker = undefined;
    latexWorkerStatus = EngineStatus.Init;
    constructor() {
    }
    async loadEngine() {
        if (this.latexWorker !== undefined) {
            throw new Error('Other instance is running, abort()');
        }
        this.latexWorkerStatus = EngineStatus.Init;
        console.log('Loading engine');
        await new Promise((resolve, reject) => {
            this.latexWorker = new Worker(ENGINE_PATH);
            console.log('Engine loaded', this.latexWorker);
            this.latexWorker.onmessage = (ev) => {
                console.log('Engine status: ' + ev);
                const data = ev['data'];
                const cmd = data['result'];
                if (cmd === 'ok') {
                    this.latexWorkerStatus = EngineStatus.Ready;
                    resolve();
                }
                else {
                    this.latexWorkerStatus = EngineStatus.Error;
                    reject();
                }
            };
        });
        this.latexWorker.onmessage = (_) => {
        };
        this.latexWorker.onerror = (_) => {
        };
    }
    isReady() {
        return this.latexWorkerStatus === EngineStatus.Ready;
    }
    checkEngineStatus() {
        if (!this.isReady()) {
            throw Error('Engine is still spinning or not ready yet!');
        }
    }
    async compileLaTeX() {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        const start_compile_time = performance.now();
        const res = await new Promise((resolve, _) => {
            this.latexWorker.onmessage = (ev) => {
                const data = ev['data'];
                const cmd = data['cmd'];
                if (cmd !== "compile")
                    return;
                const result = data['result'];
                const log = data['log'];
                const status = data['status'];
                this.latexWorkerStatus = EngineStatus.Ready;
                console.log('Engine compilation finish ' + (performance.now() - start_compile_time));
                const nice_report = new CompileResult();
                nice_report.status = status;
                nice_report.log = log;
                if (result === 'ok') {
                    const pdf = new Uint8Array(data['pdf']);
                    nice_report.pdf = pdf;
                }
                resolve(nice_report);
            };
            this.latexWorker.postMessage({ 'cmd': 'compilelatex' });
            console.log('Engine compilation start');
        });
        this.latexWorker.onmessage = (_) => {
        };
        return res;
    }
    /* Internal Use */
    async compileFormat() {
        this.checkEngineStatus();
        this.latexWorkerStatus = EngineStatus.Busy;
        await new Promise((resolve, reject) => {
            this.latexWorker.onmessage = (ev) => {
                const data = ev['data'];
                const cmd = data['cmd'];
                if (cmd !== "compile")
                    return;
                const result = data['result'];
                const log = data['log'];
                // const status: number = data['status'] as number;
                this.latexWorkerStatus = EngineStatus.Ready;
                if (result === 'ok') {
                    const formatArray = data['pdf']; /* PDF for result */
                    const formatBlob = new Blob([formatArray], { type: 'application/octet-stream' });
                    const formatURL = URL.createObjectURL(formatBlob);
                    setTimeout(() => { URL.revokeObjectURL(formatURL); }, 30000);
                    console.log('Download format file via ' + formatURL);
                    resolve();
                }
                else {
                    reject(log);
                }
            };
            this.latexWorker.postMessage({ 'cmd': 'compileformat' });
        });
        this.latexWorker.onmessage = (_) => {
        };
    }
    setEngineMainFile(filename) {
        this.checkEngineStatus();
        if (this.latexWorker !== undefined) {
            this.latexWorker.postMessage({ 'cmd': 'setmainfile', 'url': filename });
        }
    }
    writeMemFSFile(filename, srccode) {
        this.checkEngineStatus();
        if (this.latexWorker !== undefined) {
            this.latexWorker.postMessage({ 'cmd': 'writefile', 'url': filename, 'src': srccode });
        }
    }
    makeMemFSFolder(folder) {
        this.checkEngineStatus();
        if (this.latexWorker !== undefined) {
            if (folder === '' || folder === '/') {
                return;
            }
            this.latexWorker.postMessage({ 'cmd': 'mkdir', 'url': folder });
        }
    }
    flushCache() {
        this.checkEngineStatus();
        if (this.latexWorker !== undefined) {
            // console.warn('Flushing');
            this.latexWorker.postMessage({ 'cmd': 'flushcache' });
        }
    }
    setTexliveEndpoint(url) {
        console.log('Setting texlive url to ' + url);
        if (this.latexWorker !== undefined) {
            this.latexWorker.postMessage({ 'cmd': 'settexliveurl', 'url': url });
        }
    }
    closeWorker() {
        if (this.latexWorker !== undefined) {
            this.latexWorker.postMessage({ 'cmd': 'grace' });
            this.latexWorker = undefined;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGRmVGVYRW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xhdGV4UmVuZGVyL1BkZlRlWEVuZ2luZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7a0ZBY2tGO0FBR2xGLE1BQU0sQ0FBTixJQUFZLFlBS1g7QUFMRCxXQUFZLFlBQVk7SUFDdkIsK0NBQVEsQ0FBQTtJQUNSLGlEQUFLLENBQUE7SUFDTCwrQ0FBSSxDQUFBO0lBQ0osaURBQUssQ0FBQTtBQUNOLENBQUMsRUFMVyxZQUFZLEtBQVosWUFBWSxRQUt2QjtBQUVELE1BQU0sV0FBVyxHQUFHLDhCQUE4QixDQUFDO0FBRW5ELE1BQU0sT0FBTyxhQUFhO0lBQ3pCLEdBQUcsR0FBMkIsU0FBUyxDQUFDO0lBQ3hDLE1BQU0sR0FBVyxDQUFDLEdBQUcsQ0FBQztJQUN0QixHQUFHLEdBQVcsUUFBUSxDQUFDO0NBQ3ZCO0FBRUQsTUFBTSxPQUFPLFlBQVk7SUFDaEIsV0FBVyxHQUF1QixTQUFTLENBQUM7SUFDN0MsaUJBQWlCLEdBQWlCLFlBQVksQ0FBQyxJQUFJLENBQUM7SUFDM0Q7SUFFQSxDQUFDO0lBRU0sS0FBSyxDQUFDLFVBQVU7UUFDdEIsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBQ0QsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7UUFDM0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDM0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUUzQyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFB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QUFXLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztDQUNEIiwic291cmNlc0NvbnRlbnQiOlsiLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTkgRWxsaW90dCBXZW4uXG4gKlxuICogVGhpcyBwcm9ncmFtIGFuZCB0aGUgYWNjb21wYW55aW5nIG1hdGVyaWFscyBhcmUgbWFkZSBhdmFpbGFibGUgdW5kZXIgdGhlXG4gKiB0ZXJtcyBvZiB0aGUgRWNsaXBzZSBQdWJsaWMgTGljZW5zZSB2LiAyLjAgd2hpY2ggaXMgYXZhaWxhYmxlIGF0XG4gKiBodHRwOi8vd3d3LmVjbGlwc2Uub3JnL2xlZ2FsL2VwbC0yLjAuXG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBtYXkgYWxzbyBiZSBtYWRlIGF2YWlsYWJsZSB1bmRlciB0aGUgZm9sbG93aW5nIFNlY29uZGFyeVxuICogTGljZW5zZXMgd2hlbiB0aGUgY29uZGl0aW9ucyBmb3Igc3VjaCBhdmFpbGFiaWxpdHkgc2V0IGZvcnRoIGluIHRoZSBFY2xpcHNlXG4gKiBQdWJsaWMgTGljZW5zZSB2LiAyLjAgYXJlIHNhdGlzZmllZDogR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UsIHZlcnNpb24gMlxuICogd2l0aCB0aGUgR05VIENsYXNzcGF0aCBFeGNlcHRpb24gd2hpY2ggaXMgYXZhaWxhYmxlIGF0XG4gKiBodHRwczovL3d3dy5nbnUub3JnL3NvZnR3YXJlL2NsYXNzcGF0aC9saWNlbnNlLmh0bWwuXG4gKlxuICogU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IEVQTC0yLjAgT1IgR1BMLTIuMCBXSVRIIENsYXNzcGF0aC1leGNlcHRpb24tMi4wXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cblxuZXhwb3J0IGVudW0gRW5naW5lU3RhdHVzIHtcblx0SW5pdCA9IDEsXG5cdFJlYWR5LFxuXHRCdXN5LFxuXHRFcnJvclxufVxuXG5jb25zdCBFTkdJTkVfUEFUSCA9ICcuL3N3aWZ0bGF0ZXhwZGZ0ZXgud29ya2VyLmpzJztcblxuZXhwb3J0IGNsYXNzIENvbXBpbGVSZXN1bHQge1xuXHRwZGY6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHN0YXR1czogbnVtYmVyID0gLTI1NDtcblx0bG9nOiBzdHJpbmcgPSAnTm8gbG9nJztcbn1cblxuZXhwb3J0IGNsYXNzIFBkZlRlWEVuZ2luZSB7XG5cdHByaXZhdGUgbGF0ZXhXb3JrZXI6IFdvcmtlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHVibGljIGxhdGV4V29ya2VyU3RhdHVzOiBFbmdpbmVTdGF0dXMgPSBFbmdpbmVTdGF0dXMuSW5pdDtcblx0Y29uc3RydWN0b3IoKSB7XG5cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBsb2FkRW5naW5lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignT3RoZXIgaW5zdGFuY2UgaXMgcnVubmluZywgYWJvcnQoKScpO1xuXHRcdH1cblx0XHR0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLkluaXQ7XG5cdFx0Y29uc29sZS5sb2coJ0xvYWRpbmcgZW5naW5lJyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5sYXRleFdvcmtlciA9IG5ldyBXb3JrZXIoRU5HSU5FX1BBVEgpO1xuXG5cdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIGxvYWRlZCcsdGhpcy5sYXRleFdvcmtlcik7XG5cblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIub25tZXNzYWdlID0gKGV2OiBhbnkpID0+IHtcblxuXHRcdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIHN0YXR1czogJyArIGV2KTtcblxuXHRcdFx0XHRjb25zdCBkYXRhOiBhbnkgPSBldlsnZGF0YSddO1xuXHRcdFx0XHRjb25zdCBjbWQ6IHN0cmluZyA9IGRhdGFbJ3Jlc3VsdCddIGFzIHN0cmluZztcblx0XHRcdFx0aWYgKGNtZCA9PT0gJ29rJykge1xuXHRcdFx0XHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuUmVhZHk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuRXJyb3I7XG5cdFx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKF86IGFueSkgPT4ge1xuXHRcdH07XG5cdFx0dGhpcy5sYXRleFdvcmtlciEub25lcnJvciA9IChfOiBhbnkpID0+IHtcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGlzUmVhZHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPT09IEVuZ2luZVN0YXR1cy5SZWFkeTtcblx0fVxuXG5cdHByaXZhdGUgY2hlY2tFbmdpbmVTdGF0dXMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUmVhZHkoKSkge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ0VuZ2luZSBpcyBzdGlsbCBzcGlubmluZyBvciBub3QgcmVhZHkgeWV0IScpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21waWxlTGFUZVgoKTogUHJvbWlzZTxDb21waWxlUmVzdWx0PiB7XG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuQnVzeTtcblx0XHRjb25zdCBzdGFydF9jb21waWxlX3RpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHRjb25zdCByZXM6IENvbXBpbGVSZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgXykgPT4ge1xuXHRcdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKGV2OiBhbnkpID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YTogYW55ID0gZXZbJ2RhdGEnXTtcblx0XHRcdFx0Y29uc3QgY21kOiBzdHJpbmcgPSBkYXRhWydjbWQnXSBhcyBzdHJpbmc7XG5cdFx0XHRcdGlmIChjbWQgIT09IFwiY29tcGlsZVwiKSByZXR1cm47XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nID0gZGF0YVsncmVzdWx0J10gYXMgc3RyaW5nO1xuXHRcdFx0XHRjb25zdCBsb2c6IHN0cmluZyA9IGRhdGFbJ2xvZyddIGFzIHN0cmluZztcblx0XHRcdFx0Y29uc3Qgc3RhdHVzOiBudW1iZXIgPSBkYXRhWydzdGF0dXMnXSBhcyBudW1iZXI7XG5cdFx0XHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuUmVhZHk7XG5cdFx0XHRcdGNvbnNvbGUubG9nKCdFbmdpbmUgY29tcGlsYXRpb24gZmluaXNoICcgKyAocGVyZm9ybWFuY2Uubm93KCkgLSBzdGFydF9jb21waWxlX3RpbWUpKTtcblx0XHRcdFx0Y29uc3QgbmljZV9yZXBvcnQgPSBuZXcgQ29tcGlsZVJlc3VsdCgpO1xuXHRcdFx0XHRuaWNlX3JlcG9ydC5zdGF0dXMgPSBzdGF0dXM7XG5cdFx0XHRcdG5pY2VfcmVwb3J0LmxvZyA9IGxvZztcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gJ29rJykge1xuXHRcdFx0XHRcdGNvbnN0IHBkZjogVWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGRhdGFbJ3BkZiddKTtcblx0XHRcdFx0XHRuaWNlX3JlcG9ydC5wZGYgPSBwZGY7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZShuaWNlX3JlcG9ydCk7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5sYXRleFdvcmtlciEucG9zdE1lc3NhZ2UoeyAnY21kJzogJ2NvbXBpbGVsYXRleCcgfSk7XG5cdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIGNvbXBpbGF0aW9uIHN0YXJ0Jyk7XG5cdFx0fSk7XG5cdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKF86IGFueSkgPT4ge1xuXHRcdH07XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0LyogSW50ZXJuYWwgVXNlICovXG5cdHB1YmxpYyBhc3luYyBjb21waWxlRm9ybWF0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcblx0XHR0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLkJ1c3k7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKGV2OiBhbnkpID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YTogYW55ID0gZXZbJ2RhdGEnXTtcblx0XHRcdFx0Y29uc3QgY21kOiBzdHJpbmcgPSAgZGF0YVsnY21kJ10gYXMgc3RyaW5nO1xuXHRcdFx0XHRpZiAoY21kICE9PSBcImNvbXBpbGVcIikgcmV0dXJuO1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZyA9IGRhdGFbJ3Jlc3VsdCddIGFzIHN0cmluZztcblx0XHRcdFx0Y29uc3QgbG9nOiBzdHJpbmcgPSAgZGF0YVsnbG9nJ10gYXMgc3RyaW5nO1xuXHRcdFx0XHQvLyBjb25zdCBzdGF0dXM6IG51bWJlciA9IGRhdGFbJ3N0YXR1cyddIGFzIG51bWJlcjtcblx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gJ29rJykge1xuXHRcdFx0XHRcdGNvbnN0IGZvcm1hdEFycmF5ID0gZGF0YVsncGRmJ107IC8qIFBERiBmb3IgcmVzdWx0ICovXG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0QmxvYiA9IG5ldyBCbG9iKFtmb3JtYXRBcnJheV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbScgfSk7XG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0VVJMID0gVVJMLmNyZWF0ZU9iamVjdFVSTChmb3JtYXRCbG9iKTtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHsgVVJMLnJldm9rZU9iamVjdFVSTChmb3JtYXRVUkwpOyB9LCAzMDAwMCk7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ0Rvd25sb2FkIGZvcm1hdCBmaWxlIHZpYSAnICsgZm9ybWF0VVJMKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVqZWN0KGxvZyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyIS5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnY29tcGlsZWZvcm1hdCcgfSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKF86IGFueSkgPT4ge1xuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc2V0RW5naW5lTWFpbkZpbGUoZmlsZW5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdzZXRtYWluZmlsZScsICd1cmwnOiBmaWxlbmFtZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVNZW1GU0ZpbGUoZmlsZW5hbWU6IHN0cmluZywgc3JjY29kZTogc3RyaW5nIHwgVWludDhBcnJheSk6IHZvaWQge1xuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICd3cml0ZWZpbGUnLCAndXJsJzogZmlsZW5hbWUsICdzcmMnOiBzcmNjb2RlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBtYWtlTWVtRlNGb2xkZXIoZm9sZGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKGZvbGRlciA9PT0gJycgfHwgZm9sZGVyID09PSAnLycpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnbWtkaXInLCAndXJsJzogZm9sZGVyIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmbHVzaENhY2hlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBjb25zb2xlLndhcm4oJ0ZsdXNoaW5nJyk7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdmbHVzaGNhY2hlJyB9KTtcblx0XHR9XG5cblx0fVxuXG5cdHB1YmxpYyBzZXRUZXhsaXZlRW5kcG9pbnQodXJsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zb2xlLmxvZygnU2V0dGluZyB0ZXhsaXZlIHVybCB0byAnICsgdXJsKTtcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdzZXR0ZXhsaXZldXJsJywgJ3VybCc6IHVybCB9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY2xvc2VXb3JrZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnZ3JhY2UnIH0pO1xuXHRcdFx0dGhpcy5sYXRleFdvcmtlciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdfQ==