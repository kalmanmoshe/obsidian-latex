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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGRmVGVYRW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xhdGV4UmVuZGVyL1BkZlRlWEVuZ2luZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7a0ZBY2tGO0FBR2xGLE1BQU0sQ0FBTixJQUFZLFlBS1g7QUFMRCxXQUFZLFlBQVk7SUFDdkIsK0NBQVEsQ0FBQTtJQUNSLGlEQUFLLENBQUE7SUFDTCwrQ0FBSSxDQUFBO0lBQ0osaURBQUssQ0FBQTtBQUNOLENBQUMsRUFMVyxZQUFZLEtBQVosWUFBWSxRQUt2QjtBQUVELE1BQU0sV0FBVyxHQUFHLDhCQUE4QixDQUFDO0FBRW5ELE1BQU0sT0FBTyxhQUFhO0lBQ3pCLEdBQUcsR0FBMkIsU0FBUyxDQUFDO0lBQ3hDLE1BQU0sR0FBVyxDQUFDLEdBQUcsQ0FBQztJQUN0QixHQUFHLEdBQVcsUUFBUSxDQUFDO0NBQ3ZCO0FBRUQsTUFBTSxPQUFPLFlBQVk7SUFDaEIsV0FBVyxHQUF1QixTQUFTLENBQUM7SUFDN0MsaUJBQWlCLEdBQWlCLFlBQVksQ0FBQyxJQUFJLENBQUM7SUFDM0Q7SUFFQSxDQUFDO0lBRU0sS0FBSyxDQUFDLFVBQVU7UUFDdEIsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBQ0QsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7UUFDM0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDM0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUUzQyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFB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QUFXLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztDQUNEIiwic291cmNlc0NvbnRlbnQiOlsiLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAqIENvcHlyaWdodCAoQykgMjAxOSBFbGxpb3R0IFdlbi5cclxuICpcclxuICogVGhpcyBwcm9ncmFtIGFuZCB0aGUgYWNjb21wYW55aW5nIG1hdGVyaWFscyBhcmUgbWFkZSBhdmFpbGFibGUgdW5kZXIgdGhlXHJcbiAqIHRlcm1zIG9mIHRoZSBFY2xpcHNlIFB1YmxpYyBMaWNlbnNlIHYuIDIuMCB3aGljaCBpcyBhdmFpbGFibGUgYXRcclxuICogaHR0cDovL3d3dy5lY2xpcHNlLm9yZy9sZWdhbC9lcGwtMi4wLlxyXG4gKlxyXG4gKiBUaGlzIFNvdXJjZSBDb2RlIG1heSBhbHNvIGJlIG1hZGUgYXZhaWxhYmxlIHVuZGVyIHRoZSBmb2xsb3dpbmcgU2Vjb25kYXJ5XHJcbiAqIExpY2Vuc2VzIHdoZW4gdGhlIGNvbmRpdGlvbnMgZm9yIHN1Y2ggYXZhaWxhYmlsaXR5IHNldCBmb3J0aCBpbiB0aGUgRWNsaXBzZVxyXG4gKiBQdWJsaWMgTGljZW5zZSB2LiAyLjAgYXJlIHNhdGlzZmllZDogR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UsIHZlcnNpb24gMlxyXG4gKiB3aXRoIHRoZSBHTlUgQ2xhc3NwYXRoIEV4Y2VwdGlvbiB3aGljaCBpcyBhdmFpbGFibGUgYXRcclxuICogaHR0cHM6Ly93d3cuZ251Lm9yZy9zb2Z0d2FyZS9jbGFzc3BhdGgvbGljZW5zZS5odG1sLlxyXG4gKlxyXG4gKiBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogRVBMLTIuMCBPUiBHUEwtMi4wIFdJVEggQ2xhc3NwYXRoLWV4Y2VwdGlvbi0yLjBcclxuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5cclxuXHJcbmV4cG9ydCBlbnVtIEVuZ2luZVN0YXR1cyB7XHJcblx0SW5pdCA9IDEsXHJcblx0UmVhZHksXHJcblx0QnVzeSxcclxuXHRFcnJvclxyXG59XHJcblxyXG5jb25zdCBFTkdJTkVfUEFUSCA9ICcuL3N3aWZ0bGF0ZXhwZGZ0ZXgud29ya2VyLmpzJztcclxuXHJcbmV4cG9ydCBjbGFzcyBDb21waWxlUmVzdWx0IHtcclxuXHRwZGY6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XHJcblx0c3RhdHVzOiBudW1iZXIgPSAtMjU0O1xyXG5cdGxvZzogc3RyaW5nID0gJ05vIGxvZyc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBQZGZUZVhFbmdpbmUge1xyXG5cdHByaXZhdGUgbGF0ZXhXb3JrZXI6IFdvcmtlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcclxuXHRwdWJsaWMgbGF0ZXhXb3JrZXJTdGF0dXM6IEVuZ2luZVN0YXR1cyA9IEVuZ2luZVN0YXR1cy5Jbml0O1xyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBhc3luYyBsb2FkRW5naW5lKCk6IFByb21pc2U8dm9pZD4ge1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ090aGVyIGluc3RhbmNlIGlzIHJ1bm5pbmcsIGFib3J0KCknKTtcclxuXHRcdH1cclxuXHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuSW5pdDtcclxuXHRcdGNvbnNvbGUubG9nKCdMb2FkaW5nIGVuZ2luZScpO1xyXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyID0gbmV3IFdvcmtlcihFTkdJTkVfUEFUSCk7XHJcblxyXG5cdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIGxvYWRlZCcsdGhpcy5sYXRleFdvcmtlcik7XHJcblxyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLm9ubWVzc2FnZSA9IChldjogYW55KSA9PiB7XHJcblxyXG5cdFx0XHRcdGNvbnNvbGUubG9nKCdFbmdpbmUgc3RhdHVzOiAnICsgZXYpO1xyXG5cclxuXHRcdFx0XHRjb25zdCBkYXRhOiBhbnkgPSBldlsnZGF0YSddO1xyXG5cdFx0XHRcdGNvbnN0IGNtZDogc3RyaW5nID0gZGF0YVsncmVzdWx0J10gYXMgc3RyaW5nO1xyXG5cdFx0XHRcdGlmIChjbWQgPT09ICdvaycpIHtcclxuXHRcdFx0XHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuUmVhZHk7XHJcblx0XHRcdFx0XHRyZXNvbHZlKCk7XHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuRXJyb3I7XHJcblx0XHRcdFx0XHRyZWplY3QoKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH07XHJcblx0XHR9KTtcclxuXHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9ubWVzc2FnZSA9IChfOiBhbnkpID0+IHtcclxuXHRcdH07XHJcblx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbmVycm9yID0gKF86IGFueSkgPT4ge1xyXG5cdFx0fTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBpc1JlYWR5KCk6IGJvb2xlYW4ge1xyXG5cdFx0cmV0dXJuIHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPT09IEVuZ2luZVN0YXR1cy5SZWFkeTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgY2hlY2tFbmdpbmVTdGF0dXMoKTogdm9pZCB7XHJcblx0XHRpZiAoIXRoaXMuaXNSZWFkeSgpKSB7XHJcblx0XHRcdHRocm93IEVycm9yKCdFbmdpbmUgaXMgc3RpbGwgc3Bpbm5pbmcgb3Igbm90IHJlYWR5IHlldCEnKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBhc3luYyBjb21waWxlTGFUZVgoKTogUHJvbWlzZTxDb21waWxlUmVzdWx0PiB7XHJcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XHJcblx0XHR0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLkJ1c3k7XHJcblx0XHRjb25zdCBzdGFydF9jb21waWxlX3RpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuXHRcdGNvbnN0IHJlczogQ29tcGlsZVJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCBfKSA9PiB7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9ubWVzc2FnZSA9IChldjogYW55KSA9PiB7XHJcblx0XHRcdFx0Y29uc3QgZGF0YTogYW55ID0gZXZbJ2RhdGEnXTtcclxuXHRcdFx0XHRjb25zdCBjbWQ6IHN0cmluZyA9IGRhdGFbJ2NtZCddIGFzIHN0cmluZztcclxuXHRcdFx0XHRpZiAoY21kICE9PSBcImNvbXBpbGVcIikgcmV0dXJuO1xyXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nID0gZGF0YVsncmVzdWx0J10gYXMgc3RyaW5nO1xyXG5cdFx0XHRcdGNvbnN0IGxvZzogc3RyaW5nID0gZGF0YVsnbG9nJ10gYXMgc3RyaW5nO1xyXG5cdFx0XHRcdGNvbnN0IHN0YXR1czogbnVtYmVyID0gZGF0YVsnc3RhdHVzJ10gYXMgbnVtYmVyO1xyXG5cdFx0XHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuUmVhZHk7XHJcblx0XHRcdFx0Y29uc29sZS5sb2coJ0VuZ2luZSBjb21waWxhdGlvbiBmaW5pc2ggJyArIChwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0X2NvbXBpbGVfdGltZSkpO1xyXG5cdFx0XHRcdGNvbnN0IG5pY2VfcmVwb3J0ID0gbmV3IENvbXBpbGVSZXN1bHQoKTtcclxuXHRcdFx0XHRuaWNlX3JlcG9ydC5zdGF0dXMgPSBzdGF0dXM7XHJcblx0XHRcdFx0bmljZV9yZXBvcnQubG9nID0gbG9nO1xyXG5cdFx0XHRcdGlmIChyZXN1bHQgPT09ICdvaycpIHtcclxuXHRcdFx0XHRcdGNvbnN0IHBkZjogVWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGRhdGFbJ3BkZiddKTtcclxuXHRcdFx0XHRcdG5pY2VfcmVwb3J0LnBkZiA9IHBkZjtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0cmVzb2x2ZShuaWNlX3JlcG9ydCk7XHJcblx0XHRcdH07XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIhLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdjb21waWxlbGF0ZXgnIH0pO1xyXG5cdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIGNvbXBpbGF0aW9uIHN0YXJ0Jyk7XHJcblx0XHR9KTtcclxuXHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9ubWVzc2FnZSA9IChfOiBhbnkpID0+IHtcclxuXHRcdH07XHJcblxyXG5cdFx0cmV0dXJuIHJlcztcclxuXHR9XHJcblxyXG5cdC8qIEludGVybmFsIFVzZSAqL1xyXG5cdHB1YmxpYyBhc3luYyBjb21waWxlRm9ybWF0KCk6IFByb21pc2U8dm9pZD4ge1xyXG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xyXG5cdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5CdXN5O1xyXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbm1lc3NhZ2UgPSAoZXY6IGFueSkgPT4ge1xyXG5cdFx0XHRcdGNvbnN0IGRhdGE6IGFueSA9IGV2WydkYXRhJ107XHJcblx0XHRcdFx0Y29uc3QgY21kOiBzdHJpbmcgPSAgZGF0YVsnY21kJ10gYXMgc3RyaW5nO1xyXG5cdFx0XHRcdGlmIChjbWQgIT09IFwiY29tcGlsZVwiKSByZXR1cm47XHJcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmcgPSBkYXRhWydyZXN1bHQnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0Y29uc3QgbG9nOiBzdHJpbmcgPSAgZGF0YVsnbG9nJ10gYXMgc3RyaW5nO1xyXG5cdFx0XHRcdC8vIGNvbnN0IHN0YXR1czogbnVtYmVyID0gZGF0YVsnc3RhdHVzJ10gYXMgbnVtYmVyO1xyXG5cdFx0XHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuUmVhZHk7XHJcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gJ29rJykge1xyXG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0QXJyYXkgPSBkYXRhWydwZGYnXTsgLyogUERGIGZvciByZXN1bHQgKi9cclxuXHRcdFx0XHRcdGNvbnN0IGZvcm1hdEJsb2IgPSBuZXcgQmxvYihbZm9ybWF0QXJyYXldLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nIH0pO1xyXG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0VVJMID0gVVJMLmNyZWF0ZU9iamVjdFVSTChmb3JtYXRCbG9iKTtcclxuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4geyBVUkwucmV2b2tlT2JqZWN0VVJMKGZvcm1hdFVSTCk7IH0sIDMwMDAwKTtcclxuXHRcdFx0XHRcdGNvbnNvbGUubG9nKCdEb3dubG9hZCBmb3JtYXQgZmlsZSB2aWEgJyArIGZvcm1hdFVSTCk7XHJcblx0XHRcdFx0XHRyZXNvbHZlKCk7XHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdHJlamVjdChsb2cpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fTtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlciEucG9zdE1lc3NhZ2UoeyAnY21kJzogJ2NvbXBpbGVmb3JtYXQnIH0pO1xyXG5cdFx0fSk7XHJcblx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbm1lc3NhZ2UgPSAoXzogYW55KSA9PiB7XHJcblx0XHR9O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldEVuZ2luZU1haW5GaWxlKGZpbGVuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcclxuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnc2V0bWFpbmZpbGUnLCAndXJsJzogZmlsZW5hbWUgfSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgd3JpdGVNZW1GU0ZpbGUoZmlsZW5hbWU6IHN0cmluZywgc3JjY29kZTogc3RyaW5nIHwgVWludDhBcnJheSk6IHZvaWQge1xyXG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICd3cml0ZWZpbGUnLCAndXJsJzogZmlsZW5hbWUsICdzcmMnOiBzcmNjb2RlIH0pO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHVibGljIG1ha2VNZW1GU0ZvbGRlcihmb2xkZXI6IHN0cmluZyk6IHZvaWQge1xyXG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHRpZiAoZm9sZGVyID09PSAnJyB8fCBmb2xkZXIgPT09ICcvJykge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdta2RpcicsICd1cmwnOiBmb2xkZXIgfSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgZmx1c2hDYWNoZSgpOiB2b2lkIHtcclxuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcclxuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0Ly8gY29uc29sZS53YXJuKCdGbHVzaGluZycpO1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdmbHVzaGNhY2hlJyB9KTtcclxuXHRcdH1cclxuXHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0VGV4bGl2ZUVuZHBvaW50KHVybDogc3RyaW5nKTogdm9pZCB7XHJcblx0XHRjb25zb2xlLmxvZygnU2V0dGluZyB0ZXhsaXZlIHVybCB0byAnICsgdXJsKTtcclxuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnc2V0dGV4bGl2ZXVybCcsICd1cmwnOiB1cmwgfSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgY2xvc2VXb3JrZXIoKTogdm9pZCB7XHJcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ2dyYWNlJyB9KTtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlciA9IHVuZGVmaW5lZDtcclxuXHRcdH1cclxuXHR9XHJcbn1cclxuIl19