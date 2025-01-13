"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};let EngineStatus;
(function (EngineStatus) {
    EngineStatus[EngineStatus["Init"] = 1] = "Init";
    EngineStatus[EngineStatus["Ready"] = 2] = "Ready";
    EngineStatus[EngineStatus["Busy"] = 3] = "Busy";
    EngineStatus[EngineStatus["Error"] = 4] = "Error";
})(EngineStatus || (EngineStatus = {}));

import fs from "fs";
import path from "path";
import { createLatexWorker } from "./swiftlatexpdftex.worker";

class CompileResult {
    constructor() {
        this.pdf = undefined;
        this.status = -254;
        this.log = 'No log';
    }
}

class PdfTeXEngine {
    constructor() {
        this.latexWorker = undefined;
        this.latexWorkerStatus = EngineStatus.Init;
    }

    async loadEngine() {
        if (this.latexWorker !== undefined) {
            throw new Error('Other instance is running, abort()');
        }
        this.latexWorkerStatus = EngineStatus.Init;

        await new Promise((resolve, reject) => {
            this.latexWorker = createLatexWorker();
            this.latexWorker.onmessage = (ev) => {
                const data = ev['data'];
                const cmd = data['result'];
                if (cmd === 'ok') {
                    this.latexWorkerStatus = EngineStatus.Ready;
                    resolve();
                } else {
                    this.latexWorkerStatus = EngineStatus.Error;
                    reject();
                }
            };
        });

        this.latexWorker.onmessage = () => {};
        this.latexWorker.onerror = () => {};
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

        const res = await new Promise((resolve) => {
            this.latexWorker.onmessage = (ev) => {
                const data = ev['data'];
                const cmd = data['cmd'];
                if (cmd !== "compile") return;

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

            this.latexWorker.postMessage({ cmd: 'compilelatex' });
            console.log('Engine compilation start');
        });

        this.latexWorker.onmessage = () => {};
        return res;
    }

    async fetchTexFiles(filenames, host_dir) {
        const resolves = new Map();

        this.latexWorker.onmessage = (ev) => {
            const data = ev['data'];
            const cmd = data['cmd'];
            if (cmd !== "fetchfile") return;

            const result = data['result'];
            const fileContent = new Uint8Array(data['content']);
            const fname = data['filename'];

            fs.writeFileSync(path.join(host_dir, fname), fileContent);

            if (result === 'ok') {
                resolves.get(fname)();
            } else {
                console.log(`Failed to fetch ${fname} from memfs`);
            }
        };

        const promises = filenames.map((filename) => 
            new Promise((resolve) => {
                resolves.set(filename, resolve);
                this.latexWorker.postMessage({ cmd: 'fetchfile', filename });
            })
        );

        await Promise.all(promises);

        this.latexWorker.onmessage = () => {};
    }

    writeCacheData(texlive404_cache, texlive200_cache, pk404_cache, pk200_cache) {
        this.checkEngineStatus();
        if (this.latexWorker !== undefined) {
            this.latexWorker.postMessage({
                cmd: 'writecache',
                texlive404_cache,
                texlive200_cache,
                pk404_cache,
                pk200_cache,
            });
        }
    }

    closeWorker() {
        if (this.latexWorker !== undefined) {
            this.latexWorker.postMessage({ cmd: 'grace' });
            this.latexWorker = undefined;
        }
    }
}

export { PdfTeXEngine, CompileResult, EngineStatus };