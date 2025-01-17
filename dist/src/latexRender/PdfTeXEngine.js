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
const ENGINE_PATH = 'swiftlatexpdftex.js';
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
            console.log('Engine loaded');
            this.latexWorker.onmessage = (ev) => {
                console.log('Engine status: ' + ev);
                const data = ev['data'];
                const cmd = data['result'];
                console.log('Engine status: ' + cmd);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGRmVGVYRW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xhdGV4UmVuZGVyL1BkZlRlWEVuZ2luZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7a0ZBY2tGO0FBR2xGLE1BQU0sQ0FBTixJQUFZLFlBS1g7QUFMRCxXQUFZLFlBQVk7SUFDdkIsK0NBQVEsQ0FBQTtJQUNSLGlEQUFLLENBQUE7SUFDTCwrQ0FBSSxDQUFBO0lBQ0osaURBQUssQ0FBQTtBQUNOLENBQUMsRUFMVyxZQUFZLEtBQVosWUFBWSxRQUt2QjtBQUVELE1BQU0sV0FBVyxHQUFHLHFCQUFxQixDQUFDO0FBRTFDLE1BQU0sT0FBTyxhQUFhO0lBQ3pCLEdBQUcsR0FBMkIsU0FBUyxDQUFDO0lBQ3hDLE1BQU0sR0FBVyxDQUFDLEdBQUcsQ0FBQztJQUN0QixHQUFHLEdBQVcsUUFBUSxDQUFDO0NBQ3ZCO0FBRUQsTUFBTSxPQUFPLFlBQVk7SUFDaEIsV0FBVyxHQUF1QixTQUFTLENBQUM7SUFDN0MsaUJBQWlCLEdBQWlCLFlBQVksQ0FBQyxJQUFJLENBQUM7SUFDM0Q7SUFFQSxDQUFDO0lBRU0sS0FBSyxDQUFDLFVBQVU7UUFDdEIsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBQ0QsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7UUFDM0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDM0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMzQyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FB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RSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLFdBQVcsR0FBRyxTQUFTLENBQUM7UUFDOUIsQ0FBQztJQUNGLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICogQ29weXJpZ2h0IChDKSAyMDE5IEVsbGlvdHQgV2VuLlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBhbmQgdGhlIGFjY29tcGFueWluZyBtYXRlcmlhbHMgYXJlIG1hZGUgYXZhaWxhYmxlIHVuZGVyIHRoZVxuICogdGVybXMgb2YgdGhlIEVjbGlwc2UgUHVibGljIExpY2Vuc2Ugdi4gMi4wIHdoaWNoIGlzIGF2YWlsYWJsZSBhdFxuICogaHR0cDovL3d3dy5lY2xpcHNlLm9yZy9sZWdhbC9lcGwtMi4wLlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgbWF5IGFsc28gYmUgbWFkZSBhdmFpbGFibGUgdW5kZXIgdGhlIGZvbGxvd2luZyBTZWNvbmRhcnlcbiAqIExpY2Vuc2VzIHdoZW4gdGhlIGNvbmRpdGlvbnMgZm9yIHN1Y2ggYXZhaWxhYmlsaXR5IHNldCBmb3J0aCBpbiB0aGUgRWNsaXBzZVxuICogUHVibGljIExpY2Vuc2Ugdi4gMi4wIGFyZSBzYXRpc2ZpZWQ6IEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlLCB2ZXJzaW9uIDJcbiAqIHdpdGggdGhlIEdOVSBDbGFzc3BhdGggRXhjZXB0aW9uIHdoaWNoIGlzIGF2YWlsYWJsZSBhdFxuICogaHR0cHM6Ly93d3cuZ251Lm9yZy9zb2Z0d2FyZS9jbGFzc3BhdGgvbGljZW5zZS5odG1sLlxuICpcbiAqIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBFUEwtMi4wIE9SIEdQTC0yLjAgV0lUSCBDbGFzc3BhdGgtZXhjZXB0aW9uLTIuMFxuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5cbmV4cG9ydCBlbnVtIEVuZ2luZVN0YXR1cyB7XG5cdEluaXQgPSAxLFxuXHRSZWFkeSxcblx0QnVzeSxcblx0RXJyb3Jcbn1cblxuY29uc3QgRU5HSU5FX1BBVEggPSAnc3dpZnRsYXRleHBkZnRleC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDb21waWxlUmVzdWx0IHtcblx0cGRmOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRzdGF0dXM6IG51bWJlciA9IC0yNTQ7XG5cdGxvZzogc3RyaW5nID0gJ05vIGxvZyc7XG59XG5cbmV4cG9ydCBjbGFzcyBQZGZUZVhFbmdpbmUge1xuXHRwcml2YXRlIGxhdGV4V29ya2VyOiBXb3JrZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHB1YmxpYyBsYXRleFdvcmtlclN0YXR1czogRW5naW5lU3RhdHVzID0gRW5naW5lU3RhdHVzLkluaXQ7XG5cdGNvbnN0cnVjdG9yKCkge1xuXG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgbG9hZEVuZ2luZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ090aGVyIGluc3RhbmNlIGlzIHJ1bm5pbmcsIGFib3J0KCknKTtcblx0XHR9XG5cdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5Jbml0O1xuXHRcdGNvbnNvbGUubG9nKCdMb2FkaW5nIGVuZ2luZScpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIgPSBuZXcgV29ya2VyKEVOR0lORV9QQVRIKTtcblx0XHRcdGNvbnNvbGUubG9nKCdFbmdpbmUgbG9hZGVkJyk7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLm9ubWVzc2FnZSA9IChldjogYW55KSA9PiB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKCdFbmdpbmUgc3RhdHVzOiAnICsgZXYpO1xuXHRcdFx0XHRjb25zdCBkYXRhOiBhbnkgPSBldlsnZGF0YSddO1xuXHRcdFx0XHRjb25zdCBjbWQ6IHN0cmluZyA9IGRhdGFbJ3Jlc3VsdCddIGFzIHN0cmluZztcblx0XHRcdFx0Y29uc29sZS5sb2coJ0VuZ2luZSBzdGF0dXM6ICcgKyBjbWQpO1xuXHRcdFx0XHRpZiAoY21kID09PSAnb2snKSB7XG5cdFx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5FcnJvcjtcblx0XHRcdFx0XHRyZWplY3QoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbm1lc3NhZ2UgPSAoXzogYW55KSA9PiB7XG5cdFx0fTtcblx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbmVycm9yID0gKF86IGFueSkgPT4ge1xuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgaXNSZWFkeSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5sYXRleFdvcmtlclN0YXR1cyA9PT0gRW5naW5lU3RhdHVzLlJlYWR5O1xuXHR9XG5cblx0cHJpdmF0ZSBjaGVja0VuZ2luZVN0YXR1cygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNSZWFkeSgpKSB7XG5cdFx0XHR0aHJvdyBFcnJvcignRW5naW5lIGlzIHN0aWxsIHNwaW5uaW5nIG9yIG5vdCByZWFkeSB5ZXQhJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGNvbXBpbGVMYVRlWCgpOiBQcm9taXNlPENvbXBpbGVSZXN1bHQ+IHtcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XG5cdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5CdXN5O1xuXHRcdGNvbnN0IHN0YXJ0X2NvbXBpbGVfdGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXHRcdGNvbnN0IHJlczogQ29tcGlsZVJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCBfKSA9PiB7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbm1lc3NhZ2UgPSAoZXY6IGFueSkgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhOiBhbnkgPSBldlsnZGF0YSddO1xuXHRcdFx0XHRjb25zdCBjbWQ6IHN0cmluZyA9IGRhdGFbJ2NtZCddIGFzIHN0cmluZztcblx0XHRcdFx0aWYgKGNtZCAhPT0gXCJjb21waWxlXCIpIHJldHVybjtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmcgPSBkYXRhWydyZXN1bHQnXSBhcyBzdHJpbmc7XG5cdFx0XHRcdGNvbnN0IGxvZzogc3RyaW5nID0gZGF0YVsnbG9nJ10gYXMgc3RyaW5nO1xuXHRcdFx0XHRjb25zdCBzdGF0dXM6IG51bWJlciA9IGRhdGFbJ3N0YXR1cyddIGFzIG51bWJlcjtcblx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcblx0XHRcdFx0Y29uc29sZS5sb2coJ0VuZ2luZSBjb21waWxhdGlvbiBmaW5pc2ggJyArIChwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0X2NvbXBpbGVfdGltZSkpO1xuXHRcdFx0XHRjb25zdCBuaWNlX3JlcG9ydCA9IG5ldyBDb21waWxlUmVzdWx0KCk7XG5cdFx0XHRcdG5pY2VfcmVwb3J0LnN0YXR1cyA9IHN0YXR1cztcblx0XHRcdFx0bmljZV9yZXBvcnQubG9nID0gbG9nO1xuXHRcdFx0XHRpZiAocmVzdWx0ID09PSAnb2snKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGRmOiBVaW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoZGF0YVsncGRmJ10pO1xuXHRcdFx0XHRcdG5pY2VfcmVwb3J0LnBkZiA9IHBkZjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKG5pY2VfcmVwb3J0KTtcblx0XHRcdH07XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyIS5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnY29tcGlsZWxhdGV4JyB9KTtcblx0XHRcdGNvbnNvbGUubG9nKCdFbmdpbmUgY29tcGlsYXRpb24gc3RhcnQnKTtcblx0XHR9KTtcblx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbm1lc3NhZ2UgPSAoXzogYW55KSA9PiB7XG5cdFx0fTtcblxuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHQvKiBJbnRlcm5hbCBVc2UgKi9cblx0cHVibGljIGFzeW5jIGNvbXBpbGVGb3JtYXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuQnVzeTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbm1lc3NhZ2UgPSAoZXY6IGFueSkgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhOiBhbnkgPSBldlsnZGF0YSddO1xuXHRcdFx0XHRjb25zdCBjbWQ6IHN0cmluZyA9ICBkYXRhWydjbWQnXSBhcyBzdHJpbmc7XG5cdFx0XHRcdGlmIChjbWQgIT09IFwiY29tcGlsZVwiKSByZXR1cm47XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nID0gZGF0YVsncmVzdWx0J10gYXMgc3RyaW5nO1xuXHRcdFx0XHRjb25zdCBsb2c6IHN0cmluZyA9ICBkYXRhWydsb2cnXSBhcyBzdHJpbmc7XG5cdFx0XHRcdC8vIGNvbnN0IHN0YXR1czogbnVtYmVyID0gZGF0YVsnc3RhdHVzJ10gYXMgbnVtYmVyO1xuXHRcdFx0XHR0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLlJlYWR5O1xuXHRcdFx0XHRpZiAocmVzdWx0ID09PSAnb2snKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0QXJyYXkgPSBkYXRhWydwZGYnXTsgLyogUERGIGZvciByZXN1bHQgKi9cblx0XHRcdFx0XHRjb25zdCBmb3JtYXRCbG9iID0gbmV3IEJsb2IoW2Zvcm1hdEFycmF5XSwgeyB0eXBlOiAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJyB9KTtcblx0XHRcdFx0XHRjb25zdCBmb3JtYXRVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGZvcm1hdEJsb2IpO1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4geyBVUkwucmV2b2tlT2JqZWN0VVJMKGZvcm1hdFVSTCk7IH0sIDMwMDAwKTtcblx0XHRcdFx0XHRjb25zb2xlLmxvZygnRG93bmxvYWQgZm9ybWF0IGZpbGUgdmlhICcgKyBmb3JtYXRVUkwpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZWplY3QobG9nKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIhLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdjb21waWxlZm9ybWF0JyB9KTtcblx0XHR9KTtcblx0XHR0aGlzLmxhdGV4V29ya2VyIS5vbm1lc3NhZ2UgPSAoXzogYW55KSA9PiB7XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzZXRFbmdpbmVNYWluRmlsZShmaWxlbmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ3NldG1haW5maWxlJywgJ3VybCc6IGZpbGVuYW1lIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB3cml0ZU1lbUZTRmlsZShmaWxlbmFtZTogc3RyaW5nLCBzcmNjb2RlOiBzdHJpbmcgfCBVaW50OEFycmF5KTogdm9pZCB7XG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ3dyaXRlZmlsZScsICd1cmwnOiBmaWxlbmFtZSwgJ3NyYyc6IHNyY2NvZGUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG1ha2VNZW1GU0ZvbGRlcihmb2xkZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoZm9sZGVyID09PSAnJyB8fCBmb2xkZXIgPT09ICcvJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdta2RpcicsICd1cmwnOiBmb2xkZXIgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZsdXNoQ2FjaGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIGNvbnNvbGUud2FybignRmx1c2hpbmcnKTtcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ2ZsdXNoY2FjaGUnIH0pO1xuXHRcdH1cblxuXHR9XG5cblx0cHVibGljIHNldFRleGxpdmVFbmRwb2ludCh1cmw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnNvbGUubG9nKCdTZXR0aW5nIHRleGxpdmUgdXJsIHRvICcgKyB1cmwpO1xuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ3NldHRleGxpdmV1cmwnLCAndXJsJzogdXJsIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbG9zZVdvcmtlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdncmFjZScgfSk7XG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuIl19