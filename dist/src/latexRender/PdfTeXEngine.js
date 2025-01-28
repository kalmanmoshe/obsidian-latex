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
import { __awaiter } from "tslib";
export var EngineStatus;
(function (EngineStatus) {
    EngineStatus[EngineStatus["Init"] = 1] = "Init";
    EngineStatus[EngineStatus["Ready"] = 2] = "Ready";
    EngineStatus[EngineStatus["Busy"] = 3] = "Busy";
    EngineStatus[EngineStatus["Error"] = 4] = "Error";
})(EngineStatus || (EngineStatus = {}));
const ENGINE_PATH = './swiftlatexpdftex.worker.js';
export class CompileResult {
    constructor() {
        this.pdf = undefined;
        this.status = -254;
        this.log = 'No log';
    }
}
export class PdfTeXEngine {
    constructor() {
        this.latexWorker = undefined;
        this.latexWorkerStatus = EngineStatus.Init;
    }
    loadEngine() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.latexWorker !== undefined) {
                throw new Error('Other instance is running, abort()');
            }
            this.latexWorkerStatus = EngineStatus.Init;
            console.log('Loading engine');
            yield new Promise((resolve, reject) => {
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
        });
    }
    isReady() {
        return this.latexWorkerStatus === EngineStatus.Ready;
    }
    checkEngineStatus() {
        if (!this.isReady()) {
            throw Error('Engine is still spinning or not ready yet!');
        }
    }
    compileLaTeX() {
        return __awaiter(this, void 0, void 0, function* () {
            this.checkEngineStatus();
            this.latexWorkerStatus = EngineStatus.Busy;
            const start_compile_time = performance.now();
            const res = yield new Promise((resolve, _) => {
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
        });
    }
    /* Internal Use */
    compileFormat() {
        return __awaiter(this, void 0, void 0, function* () {
            this.checkEngineStatus();
            this.latexWorkerStatus = EngineStatus.Busy;
            yield new Promise((resolve, reject) => {
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
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGRmVGVYRW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xhdGV4UmVuZGVyL1BkZlRlWEVuZ2luZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7a0ZBY2tGOztBQUdsRixNQUFNLENBQU4sSUFBWSxZQUtYO0FBTEQsV0FBWSxZQUFZO0lBQ3ZCLCtDQUFRLENBQUE7SUFDUixpREFBSyxDQUFBO0lBQ0wsK0NBQUksQ0FBQTtJQUNKLGlEQUFLLENBQUE7QUFDTixDQUFDLEVBTFcsWUFBWSxLQUFaLFlBQVksUUFLdkI7QUFFRCxNQUFNLFdBQVcsR0FBRyw4QkFBOEIsQ0FBQztBQUVuRCxNQUFNLE9BQU8sYUFBYTtJQUExQjtRQUNDLFFBQUcsR0FBMkIsU0FBUyxDQUFDO1FBQ3hDLFdBQU0sR0FBVyxDQUFDLEdBQUcsQ0FBQztRQUN0QixRQUFHLEdBQVcsUUFBUSxDQUFDO0lBQ3hCLENBQUM7Q0FBQTtBQUVELE1BQU0sT0FBTyxZQUFZO0lBR3hCO1FBRlEsZ0JBQVcsR0FBdUIsU0FBUyxDQUFDO1FBQzdDLHNCQUFpQixHQUFpQixZQUFZLENBQUMsSUFBSSxDQUFDO0lBRzNELENBQUM7SUFFWSxVQUFVOztZQUN0QixJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztZQUN2RCxDQUFDO1lBQ0QsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7WUFDM0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzlCLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7Z0JBQzNDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBRTNDLE9BQU8sQ0FBQyxHQUFHLENB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LENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxXQUFXLEdBQUcsU0FBUyxDQUFDO1FBQzlCLENBQUM7SUFDRixDQUFDO0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICogQ29weXJpZ2h0IChDKSAyMDE5IEVsbGlvdHQgV2VuLlxyXG4gKlxyXG4gKiBUaGlzIHByb2dyYW0gYW5kIHRoZSBhY2NvbXBhbnlpbmcgbWF0ZXJpYWxzIGFyZSBtYWRlIGF2YWlsYWJsZSB1bmRlciB0aGVcclxuICogdGVybXMgb2YgdGhlIEVjbGlwc2UgUHVibGljIExpY2Vuc2Ugdi4gMi4wIHdoaWNoIGlzIGF2YWlsYWJsZSBhdFxyXG4gKiBodHRwOi8vd3d3LmVjbGlwc2Uub3JnL2xlZ2FsL2VwbC0yLjAuXHJcbiAqXHJcbiAqIFRoaXMgU291cmNlIENvZGUgbWF5IGFsc28gYmUgbWFkZSBhdmFpbGFibGUgdW5kZXIgdGhlIGZvbGxvd2luZyBTZWNvbmRhcnlcclxuICogTGljZW5zZXMgd2hlbiB0aGUgY29uZGl0aW9ucyBmb3Igc3VjaCBhdmFpbGFiaWxpdHkgc2V0IGZvcnRoIGluIHRoZSBFY2xpcHNlXHJcbiAqIFB1YmxpYyBMaWNlbnNlIHYuIDIuMCBhcmUgc2F0aXNmaWVkOiBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSwgdmVyc2lvbiAyXHJcbiAqIHdpdGggdGhlIEdOVSBDbGFzc3BhdGggRXhjZXB0aW9uIHdoaWNoIGlzIGF2YWlsYWJsZSBhdFxyXG4gKiBodHRwczovL3d3dy5nbnUub3JnL3NvZnR3YXJlL2NsYXNzcGF0aC9saWNlbnNlLmh0bWwuXHJcbiAqXHJcbiAqIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBFUEwtMi4wIE9SIEdQTC0yLjAgV0lUSCBDbGFzc3BhdGgtZXhjZXB0aW9uLTIuMFxyXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcblxyXG5cclxuZXhwb3J0IGVudW0gRW5naW5lU3RhdHVzIHtcclxuXHRJbml0ID0gMSxcclxuXHRSZWFkeSxcclxuXHRCdXN5LFxyXG5cdEVycm9yXHJcbn1cclxuXHJcbmNvbnN0IEVOR0lORV9QQVRIID0gJy4vc3dpZnRsYXRleHBkZnRleC53b3JrZXIuanMnO1xyXG5cclxuZXhwb3J0IGNsYXNzIENvbXBpbGVSZXN1bHQge1xyXG5cdHBkZjogVWludDhBcnJheSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcclxuXHRzdGF0dXM6IG51bWJlciA9IC0yNTQ7XHJcblx0bG9nOiBzdHJpbmcgPSAnTm8gbG9nJztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFBkZlRlWEVuZ2luZSB7XHJcblx0cHJpdmF0ZSBsYXRleFdvcmtlcjogV29ya2VyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xyXG5cdHB1YmxpYyBsYXRleFdvcmtlclN0YXR1czogRW5naW5lU3RhdHVzID0gRW5naW5lU3RhdHVzLkluaXQ7XHJcblx0Y29uc3RydWN0b3IoKSB7XHJcblxyXG5cdH1cclxuXHJcblx0cHVibGljIGFzeW5jIGxvYWRFbmdpbmUoKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcignT3RoZXIgaW5zdGFuY2UgaXMgcnVubmluZywgYWJvcnQoKScpO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5Jbml0O1xyXG5cdFx0Y29uc29sZS5sb2coJ0xvYWRpbmcgZW5naW5lJyk7XHJcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIgPSBuZXcgV29ya2VyKEVOR0lORV9QQVRIKTtcclxuXHJcblx0XHRcdGNvbnNvbGUubG9nKCdFbmdpbmUgbG9hZGVkJyx0aGlzLmxhdGV4V29ya2VyKTtcclxuXHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIub25tZXNzYWdlID0gKGV2OiBhbnkpID0+IHtcclxuXHJcblx0XHRcdFx0Y29uc29sZS5sb2coJ0VuZ2luZSBzdGF0dXM6ICcgKyBldik7XHJcblxyXG5cdFx0XHRcdGNvbnN0IGRhdGE6IGFueSA9IGV2WydkYXRhJ107XHJcblx0XHRcdFx0Y29uc3QgY21kOiBzdHJpbmcgPSBkYXRhWydyZXN1bHQnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0aWYgKGNtZCA9PT0gJ29rJykge1xyXG5cdFx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcclxuXHRcdFx0XHRcdHJlc29sdmUoKTtcclxuXHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5FcnJvcjtcclxuXHRcdFx0XHRcdHJlamVjdCgpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fTtcclxuXHRcdH0pO1xyXG5cdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKF86IGFueSkgPT4ge1xyXG5cdFx0fTtcclxuXHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9uZXJyb3IgPSAoXzogYW55KSA9PiB7XHJcblx0XHR9O1xyXG5cdH1cclxuXHJcblx0cHVibGljIGlzUmVhZHkoKTogYm9vbGVhbiB7XHJcblx0XHRyZXR1cm4gdGhpcy5sYXRleFdvcmtlclN0YXR1cyA9PT0gRW5naW5lU3RhdHVzLlJlYWR5O1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBjaGVja0VuZ2luZVN0YXR1cygpOiB2b2lkIHtcclxuXHRcdGlmICghdGhpcy5pc1JlYWR5KCkpIHtcclxuXHRcdFx0dGhyb3cgRXJyb3IoJ0VuZ2luZSBpcyBzdGlsbCBzcGlubmluZyBvciBub3QgcmVhZHkgeWV0IScpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHVibGljIGFzeW5jIGNvbXBpbGVMYVRlWCgpOiBQcm9taXNlPENvbXBpbGVSZXN1bHQ+IHtcclxuXHRcdHRoaXMuY2hlY2tFbmdpbmVTdGF0dXMoKTtcclxuXHRcdHRoaXMubGF0ZXhXb3JrZXJTdGF0dXMgPSBFbmdpbmVTdGF0dXMuQnVzeTtcclxuXHRcdGNvbnN0IHN0YXJ0X2NvbXBpbGVfdGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG5cdFx0Y29uc3QgcmVzOiBDb21waWxlUmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIF8pID0+IHtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKGV2OiBhbnkpID0+IHtcclxuXHRcdFx0XHRjb25zdCBkYXRhOiBhbnkgPSBldlsnZGF0YSddO1xyXG5cdFx0XHRcdGNvbnN0IGNtZDogc3RyaW5nID0gZGF0YVsnY21kJ10gYXMgc3RyaW5nO1xyXG5cdFx0XHRcdGlmIChjbWQgIT09IFwiY29tcGlsZVwiKSByZXR1cm47XHJcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmcgPSBkYXRhWydyZXN1bHQnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0Y29uc3QgbG9nOiBzdHJpbmcgPSBkYXRhWydsb2cnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0Y29uc3Qgc3RhdHVzOiBudW1iZXIgPSBkYXRhWydzdGF0dXMnXSBhcyBudW1iZXI7XHJcblx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcclxuXHRcdFx0XHRjb25zb2xlLmxvZygnRW5naW5lIGNvbXBpbGF0aW9uIGZpbmlzaCAnICsgKHBlcmZvcm1hbmNlLm5vdygpIC0gc3RhcnRfY29tcGlsZV90aW1lKSk7XHJcblx0XHRcdFx0Y29uc3QgbmljZV9yZXBvcnQgPSBuZXcgQ29tcGlsZVJlc3VsdCgpO1xyXG5cdFx0XHRcdG5pY2VfcmVwb3J0LnN0YXR1cyA9IHN0YXR1cztcclxuXHRcdFx0XHRuaWNlX3JlcG9ydC5sb2cgPSBsb2c7XHJcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gJ29rJykge1xyXG5cdFx0XHRcdFx0Y29uc3QgcGRmOiBVaW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoZGF0YVsncGRmJ10pO1xyXG5cdFx0XHRcdFx0bmljZV9yZXBvcnQucGRmID0gcGRmO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRyZXNvbHZlKG5pY2VfcmVwb3J0KTtcclxuXHRcdFx0fTtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlciEucG9zdE1lc3NhZ2UoeyAnY21kJzogJ2NvbXBpbGVsYXRleCcgfSk7XHJcblx0XHRcdGNvbnNvbGUubG9nKCdFbmdpbmUgY29tcGlsYXRpb24gc3RhcnQnKTtcclxuXHRcdH0pO1xyXG5cdFx0dGhpcy5sYXRleFdvcmtlciEub25tZXNzYWdlID0gKF86IGFueSkgPT4ge1xyXG5cdFx0fTtcclxuXHJcblx0XHRyZXR1cm4gcmVzO1xyXG5cdH1cclxuXHJcblx0LyogSW50ZXJuYWwgVXNlICovXHJcblx0cHVibGljIGFzeW5jIGNvbXBpbGVGb3JtYXQoKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XHJcblx0XHR0aGlzLmxhdGV4V29ya2VyU3RhdHVzID0gRW5naW5lU3RhdHVzLkJ1c3k7XHJcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9ubWVzc2FnZSA9IChldjogYW55KSA9PiB7XHJcblx0XHRcdFx0Y29uc3QgZGF0YTogYW55ID0gZXZbJ2RhdGEnXTtcclxuXHRcdFx0XHRjb25zdCBjbWQ6IHN0cmluZyA9ICBkYXRhWydjbWQnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0aWYgKGNtZCAhPT0gXCJjb21waWxlXCIpIHJldHVybjtcclxuXHRcdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZyA9IGRhdGFbJ3Jlc3VsdCddIGFzIHN0cmluZztcclxuXHRcdFx0XHRjb25zdCBsb2c6IHN0cmluZyA9ICBkYXRhWydsb2cnXSBhcyBzdHJpbmc7XHJcblx0XHRcdFx0Ly8gY29uc3Qgc3RhdHVzOiBudW1iZXIgPSBkYXRhWydzdGF0dXMnXSBhcyBudW1iZXI7XHJcblx0XHRcdFx0dGhpcy5sYXRleFdvcmtlclN0YXR1cyA9IEVuZ2luZVN0YXR1cy5SZWFkeTtcclxuXHRcdFx0XHRpZiAocmVzdWx0ID09PSAnb2snKSB7XHJcblx0XHRcdFx0XHRjb25zdCBmb3JtYXRBcnJheSA9IGRhdGFbJ3BkZiddOyAvKiBQREYgZm9yIHJlc3VsdCAqL1xyXG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0QmxvYiA9IG5ldyBCbG9iKFtmb3JtYXRBcnJheV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbScgfSk7XHJcblx0XHRcdFx0XHRjb25zdCBmb3JtYXRVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGZvcm1hdEJsb2IpO1xyXG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7IFVSTC5yZXZva2VPYmplY3RVUkwoZm9ybWF0VVJMKTsgfSwgMzAwMDApO1xyXG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ0Rvd25sb2FkIGZvcm1hdCBmaWxlIHZpYSAnICsgZm9ybWF0VVJMKTtcclxuXHRcdFx0XHRcdHJlc29sdmUoKTtcclxuXHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0cmVqZWN0KGxvZyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9O1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyIS5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnY29tcGlsZWZvcm1hdCcgfSk7XHJcblx0XHR9KTtcclxuXHRcdHRoaXMubGF0ZXhXb3JrZXIhLm9ubWVzc2FnZSA9IChfOiBhbnkpID0+IHtcclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0RW5naW5lTWFpbkZpbGUoZmlsZW5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdzZXRtYWluZmlsZScsICd1cmwnOiBmaWxlbmFtZSB9KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyB3cml0ZU1lbUZTRmlsZShmaWxlbmFtZTogc3RyaW5nLCBzcmNjb2RlOiBzdHJpbmcgfCBVaW50OEFycmF5KTogdm9pZCB7XHJcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XHJcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ3dyaXRlZmlsZScsICd1cmwnOiBmaWxlbmFtZSwgJ3NyYyc6IHNyY2NvZGUgfSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgbWFrZU1lbUZTRm9sZGVyKGZvbGRlcjogc3RyaW5nKTogdm9pZCB7XHJcblx0XHR0aGlzLmNoZWNrRW5naW5lU3RhdHVzKCk7XHJcblx0XHRpZiAodGhpcy5sYXRleFdvcmtlciAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdGlmIChmb2xkZXIgPT09ICcnIHx8IGZvbGRlciA9PT0gJy8nKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ21rZGlyJywgJ3VybCc6IGZvbGRlciB9KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBmbHVzaENhY2hlKCk6IHZvaWQge1xyXG5cdFx0dGhpcy5jaGVja0VuZ2luZVN0YXR1cygpO1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHQvLyBjb25zb2xlLndhcm4oJ0ZsdXNoaW5nJyk7XHJcblx0XHRcdHRoaXMubGF0ZXhXb3JrZXIucG9zdE1lc3NhZ2UoeyAnY21kJzogJ2ZsdXNoY2FjaGUnIH0pO1xyXG5cdFx0fVxyXG5cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXRUZXhsaXZlRW5kcG9pbnQodXJsOiBzdHJpbmcpOiB2b2lkIHtcclxuXHRcdGNvbnNvbGUubG9nKCdTZXR0aW5nIHRleGxpdmUgdXJsIHRvICcgKyB1cmwpO1xyXG5cdFx0aWYgKHRoaXMubGF0ZXhXb3JrZXIgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyLnBvc3RNZXNzYWdlKHsgJ2NtZCc6ICdzZXR0ZXhsaXZldXJsJywgJ3VybCc6IHVybCB9KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBjbG9zZVdvcmtlcigpOiB2b2lkIHtcclxuXHRcdGlmICh0aGlzLmxhdGV4V29ya2VyICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0dGhpcy5sYXRleFdvcmtlci5wb3N0TWVzc2FnZSh7ICdjbWQnOiAnZ3JhY2UnIH0pO1xyXG5cdFx0XHR0aGlzLmxhdGV4V29ya2VyID0gdW5kZWZpbmVkO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG4iXX0=