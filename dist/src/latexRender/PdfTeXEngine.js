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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGRmVGVYRW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xhdGV4UmVuZGVyL1BkZlRlWEVuZ2luZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7a0ZBY2tGO0FBR2xGLE1BQU0sQ0FBTixJQUFZLFlBS1g7QUFMRCxXQUFZLFlBQVk7SUFDdkIsK0NBQVEsQ0FBQTtJQUNSLGlEQUFLLENBQUE7SUFDTCwrQ0FBSSxDQUFBO0lBQ0osaURBQUssQ0FBQTtBQUNOLENBQUMsRUFMVyxZQUFZLEtBQVosWUFBWSxRQUt2QjtBQUVELE1BQU0sV0FBVyxHQUFHLHFCQUFxQixDQUFDO0FBRTFDLE1BQU0sT0FBTyxhQUFhO0lBQ3pCLEdBQUcsR0FBMkIsU0FBUyxDQUFDO0lBQ3hDLE1BQU0sR0FBVyxDQUFDLEdBQUcsQ0FBQztJQUN0QixHQUFHLEdBQVcsUUFBUSxDQUFDO0NBQ3ZCO0FBRUQsTUFBTSxPQUFPLFlBQVk7SUFDaEIsV0FBVyxHQUF1QixTQUFTLENBQUM7SUFDN0MsaUJBQWlCLEdBQWlCLFlBQVksQ0FBQyxJQUFJLENBQUM7SUFDM0Q7SUFFQSxDQUFDO0lBRU0sS0FBSyxDQUFDLFVBQVU7UUFDdEIsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBQ0QsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7UUFDM0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDM0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMzQyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FB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RSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLFdBQVcsR0FBRyxTQUFTLENBQUM7UUFDOUIsQ0FBQztJQUNGLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTkgRWxsaW90dCBXZW4uXHJcbiAqXHJcbiAqIFRoaXMgcHJvZ3JhbSBhbmQgdGhlIGFjY29tcGFueWluZyBtYXRlcmlhbHMgYXJlIG1hZGUgYXZhaWxhYmxlIHVuZGVyIHRoZVxyXG4gKiB0ZXJtcyBvZiB0aGUgRWNsaXBzZSBQdWJsaWMgTGljZW5zZSB2LiAyLjAgd2hpY2ggaXMgYXZhaWxhYmxlIGF0XHJcbiAqIGh0dHA6Ly93d3cuZWNsaXBzZS5vcmcvbGVnYWwvZXBsLTIuMC5cclxuICpcclxuICogVGhpcyBTb3VyY2UgQ29kZSBtYXkgYWxzbyBiZSBtYWRlIGF2YWlsYWJsZSB1bmRlciB0aGUgZm9sbG93aW5nIFNlY29uZGFyeVxyXG4gKiBMaWNlbnNlcyB3aGVuIHRoZSBjb25kaXRpb25zIGZvciBzdWNoIGF2YWlsYWJpbGl0eSBzZXQgZm9ydGggaW4gdGhlIEVjbGlwc2VcclxuICogUHVibGljIExpY2Vuc2Ugdi4gMi4wIGFyZSBzYXRpc2ZpZWQ6IEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlLCB2ZXJzaW9uIDJcclxuICogd2l0aCB0aGUgR05VIENsYXNzcGF0aCBFeGNlcHRpb24gd2hpY2ggaXMgYXZhaWxhYmxlIGF0XHJcbiAqIGh0dHBzOi8vd3d3LmdudS5vcmcvc29mdHdhcmUvY2xhc3NwYXRoL2xpY2Vuc2UuaHRtbC5cclxuICpcclxuICogU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IEVQTC0yLjAgT1IgR1BMLTIuMCBXSVRIIENsYXNzcGF0aC1leGNlcHRpb24tMi4wXHJcbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcblxyXG5leHBvcnQgZW51bSBFbmdpbmVTdGF0dXMge1xyXG5cdEluaXQgPSAxLFxyXG5cdFJlYWR5LFxyXG5cdEJ1c3ksXHJcblx0RXJyb3JcclxufVxyXG5cclxuY29uc3QgRU5HSU5FX1BBVEggPSAnc3dpZnRsYXRleHBkZnRleC5qcyc7XHJcblxyXG5leHBvcnQgY2xhc3MgQ29tcGlsZVJlc3VsdCB7XHJcblx0cGRmOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xyXG5cdHN0YXR1czogbnVtYmVyID0gLTI1NDtcclxuXHRsb2c6IHN0cmluZyA9ICdObyBsb2cnO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgUGRmVGVYRW5naW5lIHtcclxuXHRwcml2YXRlIGxhdGV4V29ya2VyOiBXb3JrZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XHJcblx0cHVibGljIGxhdGV4V29ya2VyU3RhdHVzOiBFbmdpbmVTdGF0dXMgPSBFbmdpbmVTdGF0dXMuSW5pdDtcclxuXHRjb25zdHJ1Y3RvcigpIHtcclxuXHJcblx0fVxyXG5cclxuXHRwdWJsaWMgYXN5bmMgbG9hZEVuZ2luZSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdPdGhlciBpbnN0YW5jZSBpcyBydW5uaW5nLCBhYm9ydCgpJyk7XHJcblx0XHR9XHJcblx0XHR0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLkluaXQ7XHJcblx0XHRjb25zb2xlLmxvZygnTG9hZGluZyBlbmdpbmUnKTtcclxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlciA9IG5ldyBXb3JrZXIoRU5HSU5FX1BBVEgpO1xyXG5cdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIGxvYWRlZCcpO1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLm9ubWVzc2FnZSA9IChldjogYW55KSA9PiB7XHJcblx0XHRcdFx0Y29uc29sZS5sb2coJ0VuZ2luZSBzdGF0dXM6ICcgKyBldik7XHJcblx0XHRcdFx0Y29uc3QgZGF0YTogYW55ID0gZXZbJ2RhdGEnXTtcclxuXHRcdFx0XHRjb25zdCBjbWQ6IHN0cmluZyA9IGRhdGFbJ3Jlc3VsdCddIGFzIHN0cmluZztcclxuXHRcdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIHN0YXR1czogJyArIGNtZCk7XHJcblx0XHRcdFx0aWYgKGNtZCA9PT0gJ29rJykge1xyXG5cdFx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcclxuXHRcdFx0XHRcdHJlc29sdmUoKTtcclxuXHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5FcnJvcjtcclxuXHRcdFx0XHRcdHJlamVjdCgpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fTtcclxuXHRcdH0pO1xyXG5cdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKF86IGFueSkgPT4ge1xyXG5cdFx0fTtcclxuXHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9uZXJyb3IgPSAoXzogYW55KSA9PiB7XHJcblx0XHR9O1xyXG5cdH1cclxuXHJcblx0cHVibGljIGlzUmVhZHkoKTogYm9vbGVhbiB7XHJcblx0XHRyZXR1cm4gdGhpcy5sYXRleFdvcmtlclN0YXR1cyA9PT0gRW5naW5lU3RhdHVzLlJlYWR5O1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBjaGVja0VuZ2luZVN0YXR1cygpOiB2b2lkIHtcclxuXHRcdGlmICghdGhpcy5pc1JlYWR5KCkpIHtcclxuXHRcdFx0dGhyb3cgRXJyb3IoJ0VuZ2luZSBpcyBzdGlsbCBzcGlubmluZyBvciBub3QgcmVhZHkgeWV0IScpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHVibGljIGFzeW5jIGNvbXBpbGVMYVRlWCgpOiBQcm9taXNlPENvbXBpbGVSZXN1bHQ+IHtcclxuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcclxuXHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuQnVzeTtcclxuXHRcdGNvbnN0IHN0YXJ0X2NvbXBpbGVfdGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG5cdFx0Y29uc3QgcmVzOiBDb21waWxlUmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIF8pID0+IHtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKGV2OiBhbnkpID0+IHtcclxuXHRcdFx0XHRjb25zdCBkYXRhOiBhbnkgPSBldlsnZGF0YSddO1xyXG5cdFx0XHRcdGNvbnN0IGNtZDogc3RyaW5nID0gZGF0YVsnY21kJ10gYXMgc3RyaW5nO1xyXG5cdFx0XHRcdGlmIChjbWQgIT09IFwiY29tcGlsZVwiKSByZXR1cm47XHJcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmcgPSBkYXRhWydyZXN1bHQnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0Y29uc3QgbG9nOiBzdHJpbmcgPSBkYXRhWydsb2cnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0Y29uc3Qgc3RhdHVzOiBudW1iZXIgPSBkYXRhWydzdGF0dXMnXSBhcyBudW1iZXI7XHJcblx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcclxuXHRcdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIGNvbXBpbGF0aW9uIGZpbmlzaCAnICsgKHBlcmZvcm1hbmNlLm5vdygpIC0gc3RhcnRfY29tcGlsZV90aW1lKSk7XHJcblx0XHRcdFx0Y29uc3QgbmljZV9yZXBvcnQgPSBuZXcgQ29tcGlsZVJlc3VsdCgpO1xyXG5cdFx0XHRcdG5pY2VfcmVwb3J0LnN0YXR1cyA9IHN0YXR1cztcclxuXHRcdFx0XHRuaWNlX3JlcG9ydC5sb2cgPSBsb2c7XHJcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gJ29rJykge1xyXG5cdFx0XHRcdFx0Y29uc3QgcGRmOiBVaW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoZGF0YVsncGRmJ10pO1xyXG5cdFx0XHRcdFx0bmljZV9yZXBvcnQucGRmID0gcGRmO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRyZXNvbHZlKG5pY2VfcmVwb3J0KTtcclxuXHRcdFx0fTtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlciEucG9zdE1lc3NhZ2UoeyAnY21kJzogJ2NvbXBpbGVsYXRleCcgfSk7XHJcblx0XHRcdGNvbnNvbGUubG9nKCdFbmdpbmUgY29tcGlsYXRpb24gc3RhcnQnKTtcclxuXHRcdH0pO1xyXG5cdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKF86IGFueSkgPT4ge1xyXG5cdFx0fTtcclxuXHJcblx0XHRyZXR1cm4gcmVzO1xyXG5cdH1cclxuXHJcblx0LyogSW50ZXJuYWwgVXNlICovXHJcblx0cHVibGljIGFzeW5jIGNvbXBpbGVGb3JtYXQoKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XHJcblx0XHR0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLkJ1c3k7XHJcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9ubWVzc2FnZSA9IChldjogYW55KSA9PiB7XHJcblx0XHRcdFx0Y29uc3QgZGF0YTogYW55ID0gZXZbJ2RhdGEnXTtcclxuXHRcdFx0XHRjb25zdCBjbWQ6IHN0cmluZyA9ICBkYXRhWydjbWQnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0aWYgKGNtZCAhPT0gXCJjb21waWxlXCIpIHJldHVybjtcclxuXHRcdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZyA9IGRhdGFbJ3Jlc3VsdCddIGFzIHN0cmluZztcclxuXHRcdFx0XHRjb25zdCBsb2c6IHN0cmluZyA9ICBkYXRhWydsb2cnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0Ly8gY29uc3Qgc3RhdHVzOiBudW1iZXIgPSBkYXRhWydzdGF0dXMnXSBhcyBudW1iZXI7XHJcblx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcclxuXHRcdFx0XHRpZiAocmVzdWx0ID09PSAnb2snKSB7XHJcblx0XHRcdFx0XHRjb25zdCBmb3JtYXRBcnJheSA9IGRhdGFbJ3BkZiddOyAvKiBQREYgZm9yIHJlc3VsdCAqL1xyXG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0QmxvYiA9IG5ldyBCbG9iKFtmb3JtYXRBcnJheV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbScgfSk7XHJcblx0XHRcdFx0XHRjb25zdCBmb3JtYXRVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGZvcm1hdEJsb2IpO1xyXG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7IFVSTC5yZXZva2VPYmplY3RVUkwoZm9ybWF0VVJMKTsgfSwgMzAwMDApO1xyXG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ0Rvd25sb2FkIGZvcm1hdCBmaWxlIHZpYSAnICsgZm9ybWF0VVJMKTtcclxuXHRcdFx0XHRcdHJlc29sdmUoKTtcclxuXHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0cmVqZWN0KGxvZyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9O1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyIS5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnY29tcGlsZWZvcm1hdCcgfSk7XHJcblx0XHR9KTtcclxuXHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9ubWVzc2FnZSA9IChfOiBhbnkpID0+IHtcclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0RW5naW5lTWFpbkZpbGUoZmlsZW5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdzZXRtYWluZmlsZScsICd1cmwnOiBmaWxlbmFtZSB9KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyB3cml0ZU1lbUZTRmlsZShmaWxlbmFtZTogc3RyaW5nLCBzcmNjb2RlOiBzdHJpbmcgfCBVaW50OEFycmF5KTogdm9pZCB7XHJcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XHJcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ3dyaXRlZmlsZScsICd1cmwnOiBmaWxlbmFtZSwgJ3NyYyc6IHNyY2NvZGUgfSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgbWFrZU1lbUZTRm9sZGVyKGZvbGRlcjogc3RyaW5nKTogdm9pZCB7XHJcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XHJcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdGlmIChmb2xkZXIgPT09ICcnIHx8IGZvbGRlciA9PT0gJy8nKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ21rZGlyJywgJ3VybCc6IGZvbGRlciB9KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBmbHVzaENhY2hlKCk6IHZvaWQge1xyXG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHQvLyBjb25zb2xlLndhcm4oJ0ZsdXNoaW5nJyk7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ2ZsdXNoY2FjaGUnIH0pO1xyXG5cdFx0fVxyXG5cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXRUZXhsaXZlRW5kcG9pbnQodXJsOiBzdHJpbmcpOiB2b2lkIHtcclxuXHRcdGNvbnNvbGUubG9nKCdTZXR0aW5nIHRleGxpdmUgdXJsIHRvICcgKyB1cmwpO1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdzZXR0ZXhsaXZldXJsJywgJ3VybCc6IHVybCB9KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBjbG9zZVdvcmtlcigpOiB2b2lkIHtcclxuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnZ3JhY2UnIH0pO1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyID0gdW5kZWZpbmVkO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG4iXX0=