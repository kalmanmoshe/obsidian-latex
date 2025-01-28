import { __awaiter } from "tslib";
import { FileSystemAdapter, TFile, MarkdownPreviewRenderer } from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
//import {PdfTeXEngine} from './PdfTeXEngine';
import { PdfTeXEngine } from './PdfTeXEngine.js';
import { PDFDocument } from 'pdf-lib';
const waitFor = (condFunc) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve) => {
        if (condFunc()) {
            resolve();
        }
        else {
            setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                yield waitFor(condFunc);
                resolve();
            }), 100);
        }
    });
});
export class LatexRender {
    constructor(app, plugin) {
        this.cache = [];
        this.packageCache = [{}, {}, {}, {}];
        this.app = app;
        this.plugin = plugin;
        this.onload();
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("SwiftLaTeX: Loading SwiftLaTeX plugin");
            yield this.loadCache();
            this.pluginFolderPath = path.join(this.getVaultPath(), this.app.vault.configDir, "plugins/moshe-math/");
            // initialize the latex compiler
            console.log("SwiftLaTeX: Initializing LaTeX compiler");
            this.pdfEngine = new PdfTeXEngine();
            console.log("SwiftLaTeX: Loading LaTeX engine");
            yield this.pdfEngine.loadEngine();
            console.log("SwiftLaTeX: Loading cache");
            yield this.loadPackageCache();
            this.pdfEngine.setTexliveEndpoint(this.package_url);
            this.addSyntaxHighlighting();
            console.log("SwiftLaTeX: Registering post processors");
            if (true) {
                const pdfBlockProcessor = MarkdownPreviewRenderer.createCodeBlockPostProcessor("latex", (source, el, ctx) => this.renderLatexToElement(source, el, ctx, false));
                MarkdownPreviewRenderer.registerPostProcessor(pdfBlockProcessor);
                const svgBlockProcessor = MarkdownPreviewRenderer.createCodeBlockPostProcessor("latexsvg", (source, el, ctx) => this.renderLatexToElement(source, el, ctx, true));
                MarkdownPreviewRenderer.registerPostProcessor(svgBlockProcessor);
            }
            else {
                this.plugin.registerMarkdownCodeBlockProcessor("latex", (source, el, ctx) => this.renderLatexToElement(source, el, ctx, false));
                this.plugin.registerMarkdownCodeBlockProcessor("latexsvg", (source, el, ctx) => this.renderLatexToElement(source, el, ctx, true));
            }
        });
    }
    onunload() {
        this.unloadCache();
    }
    getVaultPath() {
        if (this.app.vault.adapter instanceof FileSystemAdapter) {
            return this.app.vault.adapter.getBasePath();
        }
        else {
            throw new Error("Moshe: Could not get vault path.");
        }
    }
    loadCache() {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheFolderParentPath = path.join(this.getVaultPath(), this.app.vault.configDir, "swiftlatex-render-cache");
            if (!fs.existsSync(cacheFolderParentPath)) {
                fs.mkdirSync(cacheFolderParentPath);
            }
            this.cacheFolderPath = path.join(cacheFolderParentPath, "pdf-cache");
            if (!fs.existsSync(this.cacheFolderPath)) {
                fs.mkdirSync(this.cacheFolderPath);
                this.cacheMap = new Map();
            }
            else {
                this.cacheMap = new Map(this.cache);
                // For some reason `this.cache` at this point is actually `Map<string, Array<string>>`
                for (const [k, v] of this.cacheMap) {
                    this.cacheMap.set(k, new Set(v));
                }
            }
        });
    }
    loadPackageCache() {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheFolderParentPath = path.join(this.getVaultPath(), this.app.vault.configDir, "swiftlatex-render-cache");
            if (!fs.existsSync(cacheFolderParentPath)) {
                fs.mkdirSync(cacheFolderParentPath);
            }
            this.packageCacheFolderPath = path.join(cacheFolderParentPath, "package-cache");
            if (!fs.existsSync(this.packageCacheFolderPath)) {
                fs.mkdirSync(this.packageCacheFolderPath);
            }
            console.log("SwiftLaTeX: Loading package cache");
            // add files in the package cache folder to the cache list
            const packageFiles = fs.readdirSync(this.packageCacheFolderPath);
            for (const file of packageFiles) {
                const filename = path.basename(file);
                const value = "/tex/" + filename;
                const packageValues = Object.values(this.packageCache[1]);
                if (!packageValues.includes(value)) {
                    const key = "26/" + filename;
                    this.packageCache[1][key] = value;
                }
            }
            // move packages to the VFS
            for (const [key, val] of Object.entries(this.packageCache[1])) {
                const filename = path.basename(val);
                let read_success = false;
                try {
                    const srccode = fs.readFileSync(path.join(this.packageCacheFolderPath, filename));
                    this.pdfEngine.writeTexFSFile(filename, srccode);
                }
                catch (e) {
                    // when unable to read file, remove this from the cache
                    console.log(`Unable to read file ${filename} from package cache`);
                    delete this.packageCache[1][key];
                }
            }
            // write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
            this.pdfEngine.writeCacheData({}, this.packageCache[1], this.packageCache[2], this.packageCache[3]);
        });
    }
    unloadCache() {
        fs.rmdirSync(this.cacheFolderPath, { recursive: true });
    }
    addSyntaxHighlighting() {
        // @ts-ignore
        window.CodeMirror.modeInfo.push({ name: "latexsvg", mime: "text/x-latex", mode: "stex" });
    }
    formatLatexSource(source) {
        return source;
    }
    hashLatexSource(source) {
        return Md5.hashStr(source.trim());
    }
    pdfToHtml(pdfData) {
        return __awaiter(this, void 0, void 0, function* () {
            const { width, height } = yield this.getPdfDimensions(pdfData);
            const ratio = width / height;
            const pdfblob = new Blob([pdfData], { type: 'application/pdf' });
            const objectURL = URL.createObjectURL(pdfblob);
            return {
                attr: {
                    data: `${objectURL}#view=FitH&toolbar=0`,
                    type: 'application/pdf',
                    class: 'block-lanuage-latex',
                    style: `width:100%; aspect-ratio:${ratio}`
                }
            };
        });
    }
    svgToHtml(svg) {
        if (false) {
            svg = this.colorSVGinDarkMode(svg);
        }
        return svg;
    }
    getPdfDimensions(pdf) {
        return __awaiter(this, void 0, void 0, function* () {
            const pdfDoc = yield PDFDocument.load(pdf);
            const firstPage = pdfDoc.getPages()[0];
            const { width, height } = firstPage.getSize();
            return { width, height };
        });
    }
    /*
    pdfToSVG(pdfData: any) {
        return PdfToCairo().then((pdftocairo: any) => {
            pdftocairo.FS.writeFile('input.pdf', pdfData);
            pdftocairo._convertPdfToSvg();
            let svg = pdftocairo.FS.readFile('input.svg', {encoding:'utf8'});

            // Generate a unique ID for each SVG to avoid conflicts
            const id = Md5.hashStr(svg.trim()).toString();
            const randomString = Math.random().toString(36).substring(2, 10);
            const uniqueId = id.concat(randomString);
            const svgoConfig:Config =  {
                plugins: ['sortAttrs', { name: 'prefixIds', params: { prefix: uniqueId } }]
            };
            svg = optimize(svg, svgoConfig).data;

            return svg;
    });
    }*/
    colorSVGinDarkMode(svg) {
        // Replace the color "black" with currentColor (the current text color)
        // so that diagram axes, etc are visible in dark mode
        // And replace "white" with the background color
        svg = svg.replace(/rgb\(0%, 0%, 0%\)/g, "currentColor")
            .replace(/rgb\(100%, 100%, 100%\)/g, "var(--background-primary)");
        return svg;
    }
    renderLatexToElement(source_1, el_1, ctx_1) {
        return __awaiter(this, arguments, void 0, function* (source, el, ctx, outputSVG = false) {
            console.log("renderLatexToElement called");
            return new Promise((resolve, reject) => {
                let md5Hash = this.hashLatexSource(source);
                let pdfPath = path.join(this.cacheFolderPath, `${md5Hash}.pdf`);
                // PDF file has already been cached
                // Could have a case where pdfCache has the key but the cached file has been deleted
                if (this.cacheMap.has(md5Hash) && fs.existsSync(pdfPath)) {
                    // console.log("Using cached PDF: ", md5Hash);
                    let pdfData = fs.readFileSync(pdfPath);
                    if (outputSVG) {
                        throw new Error(); //this.pdfToSVG(pdfData).then((svg: string) => { el.innerHTML = this.svgToHtml(svg);})
                    }
                    else {
                        this.pdfToHtml(pdfData).then((htmlData) => { el.createEl("object", htmlData); resolve(); });
                    }
                    this.addFileToCache(md5Hash, ctx.sourcePath);
                    resolve();
                }
                else {
                    // console.log("Rendering PDF: ", md5Hash);
                    this.renderLatexToPDF(source, md5Hash).then((r) => {
                        this.addFileToCache(md5Hash, ctx.sourcePath);
                        if (outputSVG) {
                            throw new Error(); //this.pdfToSVG(r.pdf).then((svg: string) => { el.innerHTML = this.svgToHtml(svg);})
                        }
                        else {
                            this.pdfToHtml(r.pdf).then((htmlData) => { el.createEl("object", htmlData); resolve(); });
                        }
                        fs.writeFileSync(pdfPath, r.pdf);
                        resolve();
                    }).catch(err => {
                        let errorDiv = el.createEl('div', { text: `${err}`, attr: { class: 'block-latex-error' } });
                        reject(err);
                    });
                }
            }).then(() => {
                this.pdfEngine.flushCache();
                setTimeout(() => this.cleanUpCache(), 1000);
            });
        });
    }
    renderLatexToPDF(source, md5Hash) {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            source = this.formatLatexSource(source);
            temp.mkdir("obsidian-swiftlatex-renderer", (err, dirPath) => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield waitFor(() => this.pdfEngine.isReady());
                }
                catch (err) {
                    reject(err);
                    return;
                }
                if (err)
                    reject(err);
                this.pdfEngine.writeMemFSFile("main.tex", source);
                this.pdfEngine.setEngineMainFile("main.tex");
                this.pdfEngine.compileLaTeX().then((r) => {
                    if (r.status != 0) {
                        // manage latex errors
                        reject(r.log);
                    }
                    // update the list of package files in the cache
                    this.fetchPackageCacheData();
                    resolve(r);
                });
            }));
        }));
    }
    fetchPackageCacheData() {
        this.pdfEngine.fetchCacheData().then((r) => {
            for (var i = 0; i < r.length; i++) {
                if (i === 1) { // currently only dealing with texlive200_cache
                    // get diffs
                    const newFileNames = this.getNewPackageFileNames(this.packageCache[i], r[i]);
                    // fetch new package files
                    this.pdfEngine.fetchTexFiles(newFileNames, this.packageCacheFolderPath);
                }
            }
            this.packageCache = r;
        });
    }
    getNewPackageFileNames(oldCacheData, newCacheData) {
        // based on the old and new package files in package cache data,
        // return the new package files
        let newKeys = Object.keys(newCacheData).filter(key => !(key in oldCacheData));
        let newPackageFiles = newKeys.map(key => path.basename(newCacheData[key]));
        return newPackageFiles;
    }
    saveCache() {
        return __awaiter(this, void 0, void 0, function* () {
            let temp = new Map();
            for (const [k, v] of this.cacheMap) {
                temp.set(k, [...v]);
            }
            this.cache = [...temp];
        });
    }
    addFileToCache(hash, file_path) {
        var _a;
        if (!this.cacheMap.has(hash)) {
            this.cacheMap.set(hash, new Set());
        }
        (_a = this.cacheMap.get(hash)) === null || _a === void 0 ? void 0 : _a.add(file_path);
    }
    cleanUpCache() {
        return __awaiter(this, void 0, void 0, function* () {
            let file_paths = new Set();
            for (const fps of this.cacheMap.values()) {
                for (const fp of fps) {
                    file_paths.add(fp);
                }
            }
            for (const file_path of file_paths) {
                let file = this.app.vault.getAbstractFileByPath(file_path);
                if (file == null) {
                    this.removeFileFromCache(file_path);
                }
                else {
                    if (file instanceof TFile) {
                        yield this.removeUnusedCachesForFile(file);
                    }
                }
            }
            yield this.saveCache();
        });
    }
    removeUnusedCachesForFile(file) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let hashes_in_file = yield this.getLatexHashesFromFile(file);
            let hashes_in_cache = this.getLatexHashesFromCacheForFile(file);
            for (const hash of hashes_in_cache) {
                if (!hashes_in_file.contains(hash)) {
                    (_a = this.cacheMap.get(hash)) === null || _a === void 0 ? void 0 : _a.delete(file.path);
                    if (((_b = this.cacheMap.get(hash)) === null || _b === void 0 ? void 0 : _b.size) == 0) {
                        this.removePDFFromCache(hash);
                    }
                }
            }
        });
    }
    removePDFFromCache(key) {
        this.cacheMap.delete(key);
        fs.rmSync(path.join(this.cacheFolderPath, `${key}.pdf`));
    }
    removeFileFromCache(file_path) {
        var _a, _b;
        for (const hash of this.cacheMap.keys()) {
            (_a = this.cacheMap.get(hash)) === null || _a === void 0 ? void 0 : _a.delete(file_path);
            if (((_b = this.cacheMap.get(hash)) === null || _b === void 0 ? void 0 : _b.size) == 0) {
                this.removePDFFromCache(hash);
            }
        }
    }
    getLatexHashesFromCacheForFile(file) {
        let hashes = [];
        let path = file.path;
        for (const [k, v] of this.cacheMap.entries()) {
            if (v.has(path)) {
                hashes.push(k);
            }
        }
        return hashes;
    }
    getLatexHashesFromFile(file) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let hashes = [];
            let sections = (_a = this.app.metadataCache.getFileCache(file)) === null || _a === void 0 ? void 0 : _a.sections;
            if (sections != undefined) {
                let lines = (yield this.app.vault.read(file)).split('\n');
                for (const section of sections) {
                    if (section.type != "code" && lines[section.position.start.line].match("``` *latex") == null)
                        continue;
                    let source = lines.slice(section.position.start.line + 1, section.position.end.line).join("\n");
                    let hash = this.hashLatexSource(source);
                    hashes.push(hash);
                }
            }
            return hashes;
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9sYXRleFJlbmRlci9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPLEVBQU8saUJBQWlCLEVBQWlGLEtBQUssRUFBeUIsdUJBQXVCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDeEwsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUM3QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sQ0FBQztBQUM3QixPQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sQ0FBQztBQUM3Qiw4Q0FBOEM7QUFDOUMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2pELE9BQU8sRUFBQyxXQUFXLEVBQUMsTUFBTSxTQUFTLENBQUM7QUFTcEMsTUFBTSxPQUFPLEdBQUcsQ0FBTyxRQUF1QixFQUFFLEVBQUU7SUFDakQsT0FBTyxJQUFJLE9BQU8sQ0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFO1FBQ25DLElBQUksUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsQ0FBQztRQUNULENBQUM7YUFDSSxDQUFDO1lBQ1AsVUFBVSxDQUFDLEdBQVMsRUFBRTtnQkFDcEIsTUFBTSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3hCLE9BQU8sRUFBRSxDQUFDO1lBQ1osQ0FBQyxDQUFBLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDUCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDRixDQUFDLENBQUEsQ0FBQztBQUdKLE1BQU0sT0FBTyxXQUFXO0lBV3ZCLFlBQVksR0FBUSxFQUFFLE1BQWE7UUFObkMsVUFBSyxHQUFpQixFQUFFLENBQUM7UUFDekIsaUJBQVksR0FBNkIsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztR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QUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNoRyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNuQixDQUFDO1lBQ0YsQ0FBQztZQUNELE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQztLQUFBO0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIEZpbGVTeXN0ZW1BZGFwdGVyLCBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBQbHVnaW4sIFBsdWdpblNldHRpbmdUYWIsIFNlY3Rpb25DYWNoZSwgU2V0dGluZywgVEZpbGUsIFRGb2xkZXIsIE1hcmtkb3duVmlldywgTWFya2Rvd25QcmV2aWV3UmVuZGVyZXIgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBNZDUgfSBmcm9tICd0cy1tZDUnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgdGVtcCBmcm9tICd0ZW1wJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG4vL2ltcG9ydCB7UGRmVGVYRW5naW5lfSBmcm9tICcuL1BkZlRlWEVuZ2luZSc7XG5pbXBvcnQgeyBQZGZUZVhFbmdpbmUgfSBmcm9tICcuL1BkZlRlWEVuZ2luZS5qcyc7XG5pbXBvcnQge1BERkRvY3VtZW50fSBmcm9tICdwZGYtbGliJztcbmltcG9ydCB7Q29uZmlnLCBvcHRpbWl6ZX0gZnJvbSAnc3Znbyc7XG5pbXBvcnQgTW9zaGUgZnJvbSAnc3JjL21haW4uanMnO1xuXG5cblxudHlwZSBTdHJpbmdNYXAgPSB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuXG5cbmNvbnN0IHdhaXRGb3IgPSBhc3luYyAoY29uZEZ1bmM6ICgpID0+IGJvb2xlYW4pID0+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG5cdCAgaWYgKGNvbmRGdW5jKCkpIHtcblx0XHRyZXNvbHZlKCk7XG5cdCAgfVxuXHQgIGVsc2Uge1xuXHRcdHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuXHRcdCAgYXdhaXQgd2FpdEZvcihjb25kRnVuYyk7XG5cdFx0ICByZXNvbHZlKCk7XG5cdFx0fSwgMTAwKTtcblx0ICB9XG5cdH0pO1xuICB9O1xuICBcblxuZXhwb3J0IGNsYXNzIExhdGV4UmVuZGVyIHtcblx0YXBwOiBBcHA7XG5cdHBsdWdpbjogTW9zaGU7XG5cdGNhY2hlRm9sZGVyUGF0aDogc3RyaW5nO1xuXHRwYWNrYWdlQ2FjaGVGb2xkZXJQYXRoOiBzdHJpbmc7XG5cdGNhY2hlOiBbYW55LCBhbnldW10gPSBbXTtcblx0cGFja2FnZUNhY2hlOiB7IFtrZXk6IHN0cmluZ106IGFueSB9W10gPSBbe30sIHt9LCB7fSwge31dO1xuXHRwbHVnaW5Gb2xkZXJQYXRoOiBzdHJpbmc7XG5cdHBkZkVuZ2luZTogYW55O1xuXHRwYWNrYWdlX3VybDogYGh0dHBzOi8vdGV4bGl2ZTIuc3dpZnRsYXRleC5jb20vYDtcblx0Y2FjaGVNYXA6IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PjsgLy8gS2V5OiBtZDUgaGFzaCBvZiBsYXRleCBzb3VyY2UuIFZhbHVlOiBTZXQgb2YgZmlsZSBwYXRoIG5hbWVzLlxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBNb3NoZSkge1xuXHRcdHRoaXMuYXBwPWFwcDtcblx0XHR0aGlzLnBsdWdpbj1wbHVnaW47XG5cdFx0dGhpcy5vbmxvYWQoKTtcblx0fVxuXG5cdGFzeW5jIG9ubG9hZCgpIHtcblx0XHRjb25zb2xlLmxvZyhcIlN3aWZ0TGFUZVg6IExvYWRpbmcgU3dpZnRMYVRlWCBwbHVnaW5cIik7XG5cdFx0YXdhaXQgdGhpcy5sb2FkQ2FjaGUoKTtcblx0XHR0aGlzLnBsdWdpbkZvbGRlclBhdGggPSBwYXRoLmpvaW4odGhpcy5nZXRWYXVsdFBhdGgoKSwgdGhpcy5hcHAudmF1bHQuY29uZmlnRGlyLCBcInBsdWdpbnMvbW9zaGUtbWF0aC9cIik7XG5cdFx0Ly8gaW5pdGlhbGl6ZSB0aGUgbGF0ZXggY29tcGlsZXJcblx0XHRjb25zb2xlLmxvZyhcIlN3aWZ0TGFUZVg6IEluaXRpYWxpemluZyBMYVRlWCBjb21waWxlclwiKTtcblx0XHR0aGlzLnBkZkVuZ2luZSA9IG5ldyBQZGZUZVhFbmdpbmUoKTtcblx0XHRjb25zb2xlLmxvZyhcIlN3aWZ0TGFUZVg6IExvYWRpbmcgTGFUZVggZW5naW5lXCIpO1xuXHRcdGF3YWl0IHRoaXMucGRmRW5naW5lLmxvYWRFbmdpbmUoKTtcblx0XHRjb25zb2xlLmxvZyhcIlN3aWZ0TGFUZVg6IExvYWRpbmcgY2FjaGVcIik7XG5cdFx0YXdhaXQgdGhpcy5sb2FkUGFja2FnZUNhY2hlKCk7XG5cblx0XHR0aGlzLnBkZkVuZ2luZS5zZXRUZXhsaXZlRW5kcG9pbnQodGhpcy5wYWNrYWdlX3VybCk7XG5cblx0XHR0aGlzLmFkZFN5bnRheEhpZ2hsaWdodGluZygpO1xuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogUmVnaXN0ZXJpbmcgcG9zdCBwcm9jZXNzb3JzXCIpO1xuXHRcdGlmICh0cnVlKSB7XG5cdFx0XHRjb25zdCBwZGZCbG9ja1Byb2Nlc3NvciA9IE1hcmtkb3duUHJldmlld1JlbmRlcmVyLmNyZWF0ZUNvZGVCbG9ja1Bvc3RQcm9jZXNzb3IoXCJsYXRleFwiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB0aGlzLnJlbmRlckxhdGV4VG9FbGVtZW50KHNvdXJjZSwgZWwsIGN0eCwgZmFsc2UpKTtcblx0XHRcdE1hcmtkb3duUHJldmlld1JlbmRlcmVyLnJlZ2lzdGVyUG9zdFByb2Nlc3NvcihwZGZCbG9ja1Byb2Nlc3Nvcik7XG5cdFx0XHRjb25zdCBzdmdCbG9ja1Byb2Nlc3NvciA9IE1hcmtkb3duUHJldmlld1JlbmRlcmVyLmNyZWF0ZUNvZGVCbG9ja1Bvc3RQcm9jZXNzb3IoXCJsYXRleHN2Z1wiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB0aGlzLnJlbmRlckxhdGV4VG9FbGVtZW50KHNvdXJjZSwgZWwsIGN0eCwgdHJ1ZSkpO1xuXHRcdFx0TWFya2Rvd25QcmV2aWV3UmVuZGVyZXIucmVnaXN0ZXJQb3N0UHJvY2Vzc29yKHN2Z0Jsb2NrUHJvY2Vzc29yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcImxhdGV4XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHRoaXMucmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlLCBlbCwgY3R4LCBmYWxzZSkpO1xuXHRcdFx0dGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcImxhdGV4c3ZnXCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHRoaXMucmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlLCBlbCwgY3R4LCB0cnVlKSk7XG5cdFx0fVxuXHR9XG5cblx0b251bmxvYWQoKSB7XG5cdFx0dGhpcy51bmxvYWRDYWNoZSgpO1xuXHR9XG5cblxuXHRnZXRWYXVsdFBhdGgoKSB7XG5cdFx0aWYgKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIgaW5zdGFuY2VvZiBGaWxlU3lzdGVtQWRhcHRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZ2V0QmFzZVBhdGgoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiTW9zaGU6IENvdWxkIG5vdCBnZXQgdmF1bHQgcGF0aC5cIik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbG9hZENhY2hlKCkge1xuXHRcdGNvbnN0IGNhY2hlRm9sZGVyUGFyZW50UGF0aCA9IHBhdGguam9pbih0aGlzLmdldFZhdWx0UGF0aCgpLCB0aGlzLmFwcC52YXVsdC5jb25maWdEaXIsIFwic3dpZnRsYXRleC1yZW5kZXItY2FjaGVcIik7XG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCkpIHtcblx0XHRcdGZzLm1rZGlyU3luYyhjYWNoZUZvbGRlclBhcmVudFBhdGgpO1xuXHRcdH1cblx0XHR0aGlzLmNhY2hlRm9sZGVyUGF0aCA9IHBhdGguam9pbihjYWNoZUZvbGRlclBhcmVudFBhdGgsIFwicGRmLWNhY2hlXCIpO1xuXHRcdGlmICghZnMuZXhpc3RzU3luYyh0aGlzLmNhY2hlRm9sZGVyUGF0aCkpIHtcblx0XHRcdGZzLm1rZGlyU3luYyh0aGlzLmNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0XHR0aGlzLmNhY2hlTWFwID0gbmV3IE1hcCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNhY2hlTWFwID0gbmV3IE1hcCh0aGlzLmNhY2hlKTtcblx0XHRcdC8vIEZvciBzb21lIHJlYXNvbiBgdGhpcy5jYWNoZWAgYXQgdGhpcyBwb2ludCBpcyBhY3R1YWxseSBgTWFwPHN0cmluZywgQXJyYXk8c3RyaW5nPj5gXG5cdFx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLmNhY2hlTWFwKSB7XG5cdFx0XHRcdHRoaXMuY2FjaGVNYXAuc2V0KGssIG5ldyBTZXQodikpXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblxuXHRhc3luYyBsb2FkUGFja2FnZUNhY2hlKCkge1xuXHRcdGNvbnN0IGNhY2hlRm9sZGVyUGFyZW50UGF0aCA9IHBhdGguam9pbih0aGlzLmdldFZhdWx0UGF0aCgpLCB0aGlzLmFwcC52YXVsdC5jb25maWdEaXIsIFwic3dpZnRsYXRleC1yZW5kZXItY2FjaGVcIik7XG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCkpIHtcblx0XHRcdGZzLm1rZGlyU3luYyhjYWNoZUZvbGRlclBhcmVudFBhdGgpO1xuXHRcdH1cblx0XHR0aGlzLnBhY2thZ2VDYWNoZUZvbGRlclBhdGggPSBwYXRoLmpvaW4oY2FjaGVGb2xkZXJQYXJlbnRQYXRoLCBcInBhY2thZ2UtY2FjaGVcIik7XG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCkpIHtcblx0XHRcdGZzLm1rZGlyU3luYyh0aGlzLnBhY2thZ2VDYWNoZUZvbGRlclBhdGgpO1xuXHRcdH1cblx0XHRjb25zb2xlLmxvZyhcIlN3aWZ0TGFUZVg6IExvYWRpbmcgcGFja2FnZSBjYWNoZVwiKTtcblxuXHRcdC8vIGFkZCBmaWxlcyBpbiB0aGUgcGFja2FnZSBjYWNoZSBmb2xkZXIgdG8gdGhlIGNhY2hlIGxpc3Rcblx0XHRjb25zdCBwYWNrYWdlRmlsZXMgPSBmcy5yZWFkZGlyU3luYyh0aGlzLnBhY2thZ2VDYWNoZUZvbGRlclBhdGgpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBwYWNrYWdlRmlsZXMpIHtcblx0XHRcdGNvbnN0IGZpbGVuYW1lID0gcGF0aC5iYXNlbmFtZShmaWxlKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gXCIvdGV4L1wiK2ZpbGVuYW1lO1xuXHRcdFx0Y29uc3QgcGFja2FnZVZhbHVlcyA9IE9iamVjdC52YWx1ZXModGhpcy5wYWNrYWdlQ2FjaGVbMV0pO1xuXHRcdFx0aWYgKCFwYWNrYWdlVmFsdWVzLmluY2x1ZGVzKHZhbHVlKSkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBcIjI2L1wiICsgZmlsZW5hbWVcblx0XHRcdFx0dGhpcy5wYWNrYWdlQ2FjaGVbMV1ba2V5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBtb3ZlIHBhY2thZ2VzIHRvIHRoZSBWRlNcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbF0gb2YgT2JqZWN0LmVudHJpZXModGhpcy5wYWNrYWdlQ2FjaGVbMV0pKSB7XG5cdFx0XHRjb25zdCBmaWxlbmFtZSA9IHBhdGguYmFzZW5hbWUodmFsKTtcblx0XHRcdGxldCByZWFkX3N1Y2Nlc3MgPSBmYWxzZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNyY2NvZGUgPSBmcy5yZWFkRmlsZVN5bmMocGF0aC5qb2luKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCwgZmlsZW5hbWUpKTtcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUud3JpdGVUZXhGU0ZpbGUoZmlsZW5hbWUsIHNyY2NvZGUpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyB3aGVuIHVuYWJsZSB0byByZWFkIGZpbGUsIHJlbW92ZSB0aGlzIGZyb20gdGhlIGNhY2hlXG5cdFx0XHRcdGNvbnNvbGUubG9nKGBVbmFibGUgdG8gcmVhZCBmaWxlICR7ZmlsZW5hbWV9IGZyb20gcGFja2FnZSBjYWNoZWApXG5cdFx0XHRcdGRlbGV0ZSB0aGlzLnBhY2thZ2VDYWNoZVsxXVtrZXldO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHdyaXRlIGNhY2hlIGRhdGEgdG8gdGhlIFZGUywgZXhjZXB0IGRvbid0IHdyaXRlIHRoZSB0ZXhsaXZlNDA0X2NhY2hlIGJlY2F1c2UgdGhpcyB3aWxsIGNhdXNlIHByb2JsZW1zIHdoZW4gc3dpdGNoaW5nIGJldHdlZW4gdGV4bGl2ZSBzb3VyY2VzXG5cdFx0dGhpcy5wZGZFbmdpbmUud3JpdGVDYWNoZURhdGEoe30sXG5cdFx0XHR0aGlzLnBhY2thZ2VDYWNoZVsxXSxcblx0XHRcdHRoaXMucGFja2FnZUNhY2hlWzJdLFxuXHRcdFx0dGhpcy5wYWNrYWdlQ2FjaGVbM10pO1xuXHR9XG5cblx0dW5sb2FkQ2FjaGUoKSB7XG5cdFx0ZnMucm1kaXJTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0fVxuXG5cdGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcblx0XHQvLyBAdHMtaWdub3JlXG5cdFx0d2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJsYXRleHN2Z1wiLCBtaW1lOiBcInRleHQveC1sYXRleFwiLCBtb2RlOiBcInN0ZXhcIn0pO1xuXHR9XG5cblx0Zm9ybWF0TGF0ZXhTb3VyY2Uoc291cmNlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gc291cmNlO1xuXHR9XG5cblx0aGFzaExhdGV4U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIE1kNS5oYXNoU3RyKHNvdXJjZS50cmltKCkpO1xuXHR9XG5cblx0YXN5bmMgcGRmVG9IdG1sKHBkZkRhdGE6IGFueSkge1xuXHRcdGNvbnN0IHt3aWR0aCwgaGVpZ2h0fSA9IGF3YWl0IHRoaXMuZ2V0UGRmRGltZW5zaW9ucyhwZGZEYXRhKTtcblx0XHRjb25zdCByYXRpbyA9IHdpZHRoIC8gaGVpZ2h0O1xuXHRcdGNvbnN0IHBkZmJsb2IgPSBuZXcgQmxvYihbcGRmRGF0YV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL3BkZicgfSk7XG5cdFx0Y29uc3Qgb2JqZWN0VVJMID0gVVJMLmNyZWF0ZU9iamVjdFVSTChwZGZibG9iKTtcblx0XHRyZXR1cm4gIHtcblx0XHRcdGF0dHI6IHtcblx0XHRcdCAgZGF0YTogYCR7b2JqZWN0VVJMfSN2aWV3PUZpdEgmdG9vbGJhcj0wYCxcblx0XHRcdCAgdHlwZTogJ2FwcGxpY2F0aW9uL3BkZicsXG5cdFx0XHQgIGNsYXNzOiAnYmxvY2stbGFudWFnZS1sYXRleCcsXG5cdFx0XHQgIHN0eWxlOiBgd2lkdGg6MTAwJTsgYXNwZWN0LXJhdGlvOiR7cmF0aW99YFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRzdmdUb0h0bWwoc3ZnOiBhbnkpIHtcblx0XHRpZiAoZmFsc2UpIHtcblx0XHRcdHN2ZyA9IHRoaXMuY29sb3JTVkdpbkRhcmtNb2RlKHN2Zyk7XG5cdFx0fVxuXHRcdHJldHVybiBzdmc7XG5cdH1cblx0XG5cdGFzeW5jIGdldFBkZkRpbWVuc2lvbnMocGRmOiBhbnkpOiBQcm9taXNlPHt3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcn0+IHtcblx0XHRjb25zdCBwZGZEb2MgPSBhd2FpdCBQREZEb2N1bWVudC5sb2FkKHBkZik7XG5cdFx0Y29uc3QgZmlyc3RQYWdlID0gcGRmRG9jLmdldFBhZ2VzKClbMF07XG5cdFx0Y29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gZmlyc3RQYWdlLmdldFNpemUoKTtcblx0XHRyZXR1cm4ge3dpZHRoLCBoZWlnaHR9O1xuXHR9XG5cdC8qXG5cdHBkZlRvU1ZHKHBkZkRhdGE6IGFueSkge1xuXHRcdHJldHVybiBQZGZUb0NhaXJvKCkudGhlbigocGRmdG9jYWlybzogYW55KSA9PiB7XG5cdFx0XHRwZGZ0b2NhaXJvLkZTLndyaXRlRmlsZSgnaW5wdXQucGRmJywgcGRmRGF0YSk7XG5cdFx0XHRwZGZ0b2NhaXJvLl9jb252ZXJ0UGRmVG9TdmcoKTtcblx0XHRcdGxldCBzdmcgPSBwZGZ0b2NhaXJvLkZTLnJlYWRGaWxlKCdpbnB1dC5zdmcnLCB7ZW5jb2Rpbmc6J3V0ZjgnfSk7XG5cblx0XHRcdC8vIEdlbmVyYXRlIGEgdW5pcXVlIElEIGZvciBlYWNoIFNWRyB0byBhdm9pZCBjb25mbGljdHNcblx0XHRcdGNvbnN0IGlkID0gTWQ1Lmhhc2hTdHIoc3ZnLnRyaW0oKSkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHJhbmRvbVN0cmluZyA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygyLCAxMCk7XG5cdFx0XHRjb25zdCB1bmlxdWVJZCA9IGlkLmNvbmNhdChyYW5kb21TdHJpbmcpO1xuXHRcdFx0Y29uc3Qgc3Znb0NvbmZpZzpDb25maWcgPSAge1xuXHRcdFx0XHRwbHVnaW5zOiBbJ3NvcnRBdHRycycsIHsgbmFtZTogJ3ByZWZpeElkcycsIHBhcmFtczogeyBwcmVmaXg6IHVuaXF1ZUlkIH0gfV1cblx0XHRcdH07XG5cdFx0XHRzdmcgPSBvcHRpbWl6ZShzdmcsIHN2Z29Db25maWcpLmRhdGE7IFxuXG5cdFx0XHRyZXR1cm4gc3ZnO1xuXHR9KTtcblx0fSovXG5cblx0Y29sb3JTVkdpbkRhcmtNb2RlKHN2Zzogc3RyaW5nKSB7XG5cdFx0Ly8gUmVwbGFjZSB0aGUgY29sb3IgXCJibGFja1wiIHdpdGggY3VycmVudENvbG9yICh0aGUgY3VycmVudCB0ZXh0IGNvbG9yKVxuXHRcdC8vIHNvIHRoYXQgZGlhZ3JhbSBheGVzLCBldGMgYXJlIHZpc2libGUgaW4gZGFyayBtb2RlXG5cdFx0Ly8gQW5kIHJlcGxhY2UgXCJ3aGl0ZVwiIHdpdGggdGhlIGJhY2tncm91bmQgY29sb3JcblxuXHRcdHN2ZyA9IHN2Zy5yZXBsYWNlKC9yZ2JcXCgwJSwgMCUsIDAlXFwpL2csIFwiY3VycmVudENvbG9yXCIpXG5cdFx0XHRcdC5yZXBsYWNlKC9yZ2JcXCgxMDAlLCAxMDAlLCAxMDAlXFwpL2csIFwidmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KVwiKTtcblxuXHRcdHJldHVybiBzdmc7XG5cdH1cblxuXG5cdGFzeW5jIHJlbmRlckxhdGV4VG9FbGVtZW50KHNvdXJjZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCwgb3V0cHV0U1ZHOiBib29sZWFuID0gZmFsc2UpIHtcblx0XHRjb25zb2xlLmxvZyhcInJlbmRlckxhdGV4VG9FbGVtZW50IGNhbGxlZFwiKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0bGV0IG1kNUhhc2ggPSB0aGlzLmhhc2hMYXRleFNvdXJjZShzb3VyY2UpO1xuXHRcdFx0bGV0IHBkZlBhdGggPSBwYXRoLmpvaW4odGhpcy5jYWNoZUZvbGRlclBhdGgsIGAke21kNUhhc2h9LnBkZmApO1xuXG5cdFx0XHQvLyBQREYgZmlsZSBoYXMgYWxyZWFkeSBiZWVuIGNhY2hlZFxuXHRcdFx0Ly8gQ291bGQgaGF2ZSBhIGNhc2Ugd2hlcmUgcGRmQ2FjaGUgaGFzIHRoZSBrZXkgYnV0IHRoZSBjYWNoZWQgZmlsZSBoYXMgYmVlbiBkZWxldGVkXG5cdFx0XHRpZiAodGhpcy5jYWNoZU1hcC5oYXMobWQ1SGFzaCkgJiYgZnMuZXhpc3RzU3luYyhwZGZQYXRoKSkge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZyhcIlVzaW5nIGNhY2hlZCBQREY6IFwiLCBtZDVIYXNoKTtcblx0XHRcdFx0bGV0IHBkZkRhdGEgPSBmcy5yZWFkRmlsZVN5bmMocGRmUGF0aCk7XG5cdFx0XHRcdGlmIChvdXRwdXRTVkcpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoKS8vdGhpcy5wZGZUb1NWRyhwZGZEYXRhKS50aGVuKChzdmc6IHN0cmluZykgPT4geyBlbC5pbm5lckhUTUwgPSB0aGlzLnN2Z1RvSHRtbChzdmcpO30pXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5wZGZUb0h0bWwocGRmRGF0YSkudGhlbigoaHRtbERhdGEpPT57ZWwuY3JlYXRlRWwoXCJvYmplY3RcIiwgaHRtbERhdGEpOyByZXNvbHZlKCk7fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5hZGRGaWxlVG9DYWNoZShtZDVIYXNoLCBjdHguc291cmNlUGF0aCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZyhcIlJlbmRlcmluZyBQREY6IFwiLCBtZDVIYXNoKTtcblx0XHRcdFx0XG5cdFx0XHRcdHRoaXMucmVuZGVyTGF0ZXhUb1BERihzb3VyY2UsIG1kNUhhc2gpLnRoZW4oKHI6IGFueSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuYWRkRmlsZVRvQ2FjaGUobWQ1SGFzaCwgY3R4LnNvdXJjZVBhdGgpO1xuXHRcdFx0XHRcdGlmIChvdXRwdXRTVkcpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcigpOy8vdGhpcy5wZGZUb1NWRyhyLnBkZikudGhlbigoc3ZnOiBzdHJpbmcpID0+IHsgZWwuaW5uZXJIVE1MID0gdGhpcy5zdmdUb0h0bWwoc3ZnKTt9KVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBkZlRvSHRtbChyLnBkZikudGhlbigoaHRtbERhdGEpPT57ZWwuY3JlYXRlRWwoXCJvYmplY3RcIiwgaHRtbERhdGEpOyByZXNvbHZlKCk7fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZzLndyaXRlRmlsZVN5bmMocGRmUGF0aCwgci5wZGYpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQpLmNhdGNoKGVyciA9PiB7IFxuXHRcdFx0XHRcdGxldCBlcnJvckRpdiA9IGVsLmNyZWF0ZUVsKCdkaXYnLCB7IHRleHQ6IGAke2Vycn1gLCBhdHRyOiB7IGNsYXNzOiAnYmxvY2stbGF0ZXgtZXJyb3InIH0gfSk7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7IFxuXHRcdFx0XHR9KTtcdFx0XHRcdFxuXHRcdFx0fVxuXHRcdH0pLnRoZW4oKCkgPT4geyBcblx0XHRcdHRoaXMucGRmRW5naW5lLmZsdXNoQ2FjaGUoKTtcblx0XHRcdCBzZXRUaW1lb3V0KCgpID0+IHRoaXMuY2xlYW5VcENhY2hlKCksIDEwMDApO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVuZGVyTGF0ZXhUb1BERihzb3VyY2U6IHN0cmluZywgbWQ1SGFzaDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHNvdXJjZSA9IHRoaXMuZm9ybWF0TGF0ZXhTb3VyY2Uoc291cmNlKTtcblxuXHRcdFx0dGVtcC5ta2RpcihcIm9ic2lkaWFuLXN3aWZ0bGF0ZXgtcmVuZGVyZXJcIiwgYXN5bmMgKGVyciwgZGlyUGF0aCkgPT4ge1xuXHRcdFx0XHRcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB3YWl0Rm9yKCgpID0+IHRoaXMucGRmRW5naW5lLmlzUmVhZHkoKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlcnIpIHJlamVjdChlcnIpO1xuXHRcdFx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZU1lbUZTRmlsZShcIm1haW4udGV4XCIsIHNvdXJjZSk7XG5cdFx0XHRcdHRoaXMucGRmRW5naW5lLnNldEVuZ2luZU1haW5GaWxlKFwibWFpbi50ZXhcIik7XG5cdFx0XHRcdHRoaXMucGRmRW5naW5lLmNvbXBpbGVMYVRlWCgpLnRoZW4oKHI6IGFueSkgPT4ge1xuXHRcdFx0XHRpZiAoci5zdGF0dXMgIT0gMCkge1xuXHRcdFx0XHRcdC8vIG1hbmFnZSBsYXRleCBlcnJvcnNcblx0XHRcdFx0XHRyZWplY3Qoci5sb2cpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIHVwZGF0ZSB0aGUgbGlzdCBvZiBwYWNrYWdlIGZpbGVzIGluIHRoZSBjYWNoZVxuXHRcdFx0XHR0aGlzLmZldGNoUGFja2FnZUNhY2hlRGF0YSgpXG5cdFx0XHRcdHJlc29sdmUocik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSlcblx0XHR9KTtcblx0fVxuXG5cdGZldGNoUGFja2FnZUNhY2hlRGF0YSgpOiB2b2lkIHtcblx0XHR0aGlzLnBkZkVuZ2luZS5mZXRjaENhY2hlRGF0YSgpLnRoZW4oKHI6IFN0cmluZ01hcFtdKSA9PiB7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGkgPT09IDEpIHsgLy8gY3VycmVudGx5IG9ubHkgZGVhbGluZyB3aXRoIHRleGxpdmUyMDBfY2FjaGVcblx0XHRcdFx0XHQvLyBnZXQgZGlmZnNcblx0XHRcdFx0XHRjb25zdCBuZXdGaWxlTmFtZXMgPSB0aGlzLmdldE5ld1BhY2thZ2VGaWxlTmFtZXModGhpcy5wYWNrYWdlQ2FjaGVbaV0sIHJbaV0pO1xuXHRcdFx0XHRcdC8vIGZldGNoIG5ldyBwYWNrYWdlIGZpbGVzXG5cdFx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuZmV0Y2hUZXhGaWxlcyhuZXdGaWxlTmFtZXMsIHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMucGFja2FnZUNhY2hlID0gcjtcblx0XHR9KTtcblx0fVxuXG5cdGdldE5ld1BhY2thZ2VGaWxlTmFtZXMob2xkQ2FjaGVEYXRhOiBTdHJpbmdNYXAsIG5ld0NhY2hlRGF0YTogU3RyaW5nTWFwKTogc3RyaW5nW10ge1xuXHRcdC8vIGJhc2VkIG9uIHRoZSBvbGQgYW5kIG5ldyBwYWNrYWdlIGZpbGVzIGluIHBhY2thZ2UgY2FjaGUgZGF0YSxcblx0XHQvLyByZXR1cm4gdGhlIG5ldyBwYWNrYWdlIGZpbGVzXG5cdFx0bGV0IG5ld0tleXMgPSBPYmplY3Qua2V5cyhuZXdDYWNoZURhdGEpLmZpbHRlcihrZXkgPT4gIShrZXkgaW4gb2xkQ2FjaGVEYXRhKSk7XG5cdFx0bGV0IG5ld1BhY2thZ2VGaWxlcyA9IG5ld0tleXMubWFwKGtleSA9PiBwYXRoLmJhc2VuYW1lKG5ld0NhY2hlRGF0YVtrZXldKSk7XHRcdFxuXHRcdHJldHVybiBuZXdQYWNrYWdlRmlsZXM7XG5cdH1cblxuXHRhc3luYyBzYXZlQ2FjaGUoKSB7XG5cdFx0bGV0IHRlbXAgPSBuZXcgTWFwKCk7XG5cdFx0Zm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy5jYWNoZU1hcCkge1xuXHRcdFx0dGVtcC5zZXQoaywgWy4uLnZdKVxuXHRcdH1cblx0XHR0aGlzLmNhY2hlID0gWy4uLnRlbXBdO1xuXG5cdH1cblxuXHRhZGRGaWxlVG9DYWNoZShoYXNoOiBzdHJpbmcsIGZpbGVfcGF0aDogc3RyaW5nKSB7XG5cdFx0aWYgKCF0aGlzLmNhY2hlTWFwLmhhcyhoYXNoKSkge1xuXHRcdFx0dGhpcy5jYWNoZU1hcC5zZXQoaGFzaCwgbmV3IFNldCgpKTtcblx0XHR9XG5cdFx0dGhpcy5jYWNoZU1hcC5nZXQoaGFzaCk/LmFkZChmaWxlX3BhdGgpO1xuXHR9XG5cblx0YXN5bmMgY2xlYW5VcENhY2hlKCkge1xuXHRcdGxldCBmaWxlX3BhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBmcHMgb2YgdGhpcy5jYWNoZU1hcC52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBmcCBvZiBmcHMpIHtcblx0XHRcdFx0ZmlsZV9wYXRocy5hZGQoZnApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZmlsZV9wYXRoIG9mIGZpbGVfcGF0aHMpIHtcblx0XHRcdGxldCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVfcGF0aCk7XG5cdFx0XHRpZiAoZmlsZSA9PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRmlsZUZyb21DYWNoZShmaWxlX3BhdGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVtb3ZlVW51c2VkQ2FjaGVzRm9yRmlsZShmaWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnNhdmVDYWNoZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlVW51c2VkQ2FjaGVzRm9yRmlsZShmaWxlOiBURmlsZSkge1xuXHRcdGxldCBoYXNoZXNfaW5fZmlsZSA9IGF3YWl0IHRoaXMuZ2V0TGF0ZXhIYXNoZXNGcm9tRmlsZShmaWxlKTtcblx0XHRsZXQgaGFzaGVzX2luX2NhY2hlID0gdGhpcy5nZXRMYXRleEhhc2hlc0Zyb21DYWNoZUZvckZpbGUoZmlsZSk7XG5cdFx0Zm9yIChjb25zdCBoYXNoIG9mIGhhc2hlc19pbl9jYWNoZSkge1xuXHRcdFx0aWYgKCFoYXNoZXNfaW5fZmlsZS5jb250YWlucyhoYXNoKSkge1xuXHRcdFx0XHR0aGlzLmNhY2hlTWFwLmdldChoYXNoKT8uZGVsZXRlKGZpbGUucGF0aCk7XG5cdFx0XHRcdGlmICh0aGlzLmNhY2hlTWFwLmdldChoYXNoKT8uc2l6ZSA9PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW1vdmVQREZGcm9tQ2FjaGUoaGFzaCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZW1vdmVQREZGcm9tQ2FjaGUoa2V5OiBzdHJpbmcpIHtcblx0XHR0aGlzLmNhY2hlTWFwLmRlbGV0ZShrZXkpO1xuXHRcdGZzLnJtU3luYyhwYXRoLmpvaW4odGhpcy5jYWNoZUZvbGRlclBhdGgsIGAke2tleX0ucGRmYCkpO1xuXHR9XG5cblx0cmVtb3ZlRmlsZUZyb21DYWNoZShmaWxlX3BhdGg6IHN0cmluZykge1xuXHRcdGZvciAoY29uc3QgaGFzaCBvZiB0aGlzLmNhY2hlTWFwLmtleXMoKSkge1xuXHRcdFx0dGhpcy5jYWNoZU1hcC5nZXQoaGFzaCk/LmRlbGV0ZShmaWxlX3BhdGgpO1xuXHRcdFx0aWYgKHRoaXMuY2FjaGVNYXAuZ2V0KGhhc2gpPy5zaXplID09IDApIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVQREZGcm9tQ2FjaGUoaGFzaCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0TGF0ZXhIYXNoZXNGcm9tQ2FjaGVGb3JGaWxlKGZpbGU6IFRGaWxlKSB7XG5cdFx0bGV0IGhhc2hlczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgcGF0aCA9IGZpbGUucGF0aDtcblx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLmNhY2hlTWFwLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKHYuaGFzKHBhdGgpKSB7XG5cdFx0XHRcdGhhc2hlcy5wdXNoKGspO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGFzaGVzO1xuXHR9XG5cblx0YXN5bmMgZ2V0TGF0ZXhIYXNoZXNGcm9tRmlsZShmaWxlOiBURmlsZSkge1xuXHRcdGxldCBoYXNoZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHNlY3Rpb25zID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LnNlY3Rpb25zXG5cdFx0aWYgKHNlY3Rpb25zICE9IHVuZGVmaW5lZCkge1xuXHRcdFx0bGV0IGxpbmVzID0gKGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSkpLnNwbGl0KCdcXG4nKTtcblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBzZWN0aW9ucykge1xuXHRcdFx0XHRpZiAoc2VjdGlvbi50eXBlICE9IFwiY29kZVwiICYmIGxpbmVzW3NlY3Rpb24ucG9zaXRpb24uc3RhcnQubGluZV0ubWF0Y2goXCJgYGAgKmxhdGV4XCIpID09IG51bGwpIGNvbnRpbnVlO1xuXHRcdFx0XHRsZXQgc291cmNlID0gbGluZXMuc2xpY2Uoc2VjdGlvbi5wb3NpdGlvbi5zdGFydC5saW5lICsgMSwgc2VjdGlvbi5wb3NpdGlvbi5lbmQubGluZSkuam9pbihcIlxcblwiKTtcblx0XHRcdFx0bGV0IGhhc2ggPSB0aGlzLmhhc2hMYXRleFNvdXJjZShzb3VyY2UpO1xuXHRcdFx0XHRoYXNoZXMucHVzaChoYXNoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGhhc2hlcztcblx0fVxufVxuXG4iXX0=