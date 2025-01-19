import { FileSystemAdapter, TFile, MarkdownPreviewRenderer } from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
//import {PdfTeXEngine} from './PdfTeXEngine';
import { PdfTeXEngine } from './PdfTeXEngine.js';
import { PDFDocument } from 'pdf-lib';
const waitFor = async (condFunc) => {
    return new Promise((resolve) => {
        if (condFunc()) {
            resolve();
        }
        else {
            setTimeout(async () => {
                await waitFor(condFunc);
                resolve();
            }, 100);
        }
    });
};
export class LatexRender {
    app;
    plugin;
    cacheFolderPath;
    packageCacheFolderPath;
    cache = [];
    packageCache = [{}, {}, {}, {}];
    pluginFolderPath;
    pdfEngine;
    package_url;
    cacheMap; // Key: md5 hash of latex source. Value: Set of file path names.
    constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        this.onload();
    }
    async onload() {
        console.log("SwiftLaTeX: Loading SwiftLaTeX plugin");
        await this.loadCache();
        this.pluginFolderPath = path.join(this.getVaultPath(), this.app.vault.configDir, "plugins/moshe-math/");
        // initialize the latex compiler
        console.log("SwiftLaTeX: Initializing LaTeX compiler");
        this.pdfEngine = new PdfTeXEngine();
        console.log("SwiftLaTeX: Loading LaTeX engine");
        await this.pdfEngine.loadEngine();
        console.log("SwiftLaTeX: Loading cache");
        await this.loadPackageCache();
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
    async loadCache() {
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
    }
    async loadPackageCache() {
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
    async pdfToHtml(pdfData) {
        const { width, height } = await this.getPdfDimensions(pdfData);
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
    }
    svgToHtml(svg) {
        if (false) {
            svg = this.colorSVGinDarkMode(svg);
        }
        return svg;
    }
    async getPdfDimensions(pdf) {
        const pdfDoc = await PDFDocument.load(pdf);
        const firstPage = pdfDoc.getPages()[0];
        const { width, height } = firstPage.getSize();
        return { width, height };
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
    async renderLatexToElement(source, el, ctx, outputSVG = false) {
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
    }
    renderLatexToPDF(source, md5Hash) {
        return new Promise(async (resolve, reject) => {
            source = this.formatLatexSource(source);
            temp.mkdir("obsidian-swiftlatex-renderer", async (err, dirPath) => {
                try {
                    await waitFor(() => this.pdfEngine.isReady());
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
            });
        });
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
    async saveCache() {
        let temp = new Map();
        for (const [k, v] of this.cacheMap) {
            temp.set(k, [...v]);
        }
        this.cache = [...temp];
    }
    addFileToCache(hash, file_path) {
        if (!this.cacheMap.has(hash)) {
            this.cacheMap.set(hash, new Set());
        }
        this.cacheMap.get(hash)?.add(file_path);
    }
    async cleanUpCache() {
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
                    await this.removeUnusedCachesForFile(file);
                }
            }
        }
        await this.saveCache();
    }
    async removeUnusedCachesForFile(file) {
        let hashes_in_file = await this.getLatexHashesFromFile(file);
        let hashes_in_cache = this.getLatexHashesFromCacheForFile(file);
        for (const hash of hashes_in_cache) {
            if (!hashes_in_file.contains(hash)) {
                this.cacheMap.get(hash)?.delete(file.path);
                if (this.cacheMap.get(hash)?.size == 0) {
                    this.removePDFFromCache(hash);
                }
            }
        }
    }
    removePDFFromCache(key) {
        this.cacheMap.delete(key);
        fs.rmSync(path.join(this.cacheFolderPath, `${key}.pdf`));
    }
    removeFileFromCache(file_path) {
        for (const hash of this.cacheMap.keys()) {
            this.cacheMap.get(hash)?.delete(file_path);
            if (this.cacheMap.get(hash)?.size == 0) {
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
    async getLatexHashesFromFile(file) {
        let hashes = [];
        let sections = this.app.metadataCache.getFileCache(file)?.sections;
        if (sections != undefined) {
            let lines = (await this.app.vault.read(file)).split('\n');
            for (const section of sections) {
                if (section.type != "code" && lines[section.position.start.line].match("``` *latex") == null)
                    continue;
                let source = lines.slice(section.position.start.line + 1, section.position.end.line).join("\n");
                let hash = this.hashLatexSource(source);
                hashes.push(hash);
            }
        }
        return hashes;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9sYXRleFJlbmRlci9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBTyxpQkFBaUIsRUFBaUYsS0FBSyxFQUF5Qix1QkFBdUIsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN4TCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLDhDQUE4QztBQUM5QyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDakQsT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLFNBQVMsQ0FBQztBQVNwQyxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsUUFBdUIsRUFBRSxFQUFFO0lBQ2pELE9BQU8sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRTtRQUNuQyxJQUFJLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLENBQUM7UUFDVCxDQUFDO2FBQ0ksQ0FBQztZQUNQLFVBQVUsQ0FBQyxLQUFLLElBQUksRUFBRTtnQkFDcEIsTUFBTSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3hCLE9BQU8sRUFBRSxDQUFDO1lBQ1osQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBR0osTUFBTSxPQUFPLFdBQVc7SUFDdkIsR0FBRyxDQUFNO0lBQ1QsTUFBTSxDQUFRO0lBQ2QsZUFBZSxDQUFTO0lBQ3hCLHNCQUFzQixDQUFTO0lBQy9CLEtBQUssR0FBaUIsRUFBRSxDQUFDO0lBQ3pCLFlBQVksR0FBNkIsQ0FBQyxFQUFFLEVBQUUs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QUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2hHLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkIsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcCwgRmlsZVN5c3RlbUFkYXB0ZXIsIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsIFBsdWdpbiwgUGx1Z2luU2V0dGluZ1RhYiwgU2VjdGlvbkNhY2hlLCBTZXR0aW5nLCBURmlsZSwgVEZvbGRlciwgTWFya2Rvd25WaWV3LCBNYXJrZG93blByZXZpZXdSZW5kZXJlciB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB7IE1kNSB9IGZyb20gJ3RzLW1kNSc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyB0ZW1wIGZyb20gJ3RlbXAnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbi8vaW1wb3J0IHtQZGZUZVhFbmdpbmV9IGZyb20gJy4vUGRmVGVYRW5naW5lJztcbmltcG9ydCB7IFBkZlRlWEVuZ2luZSB9IGZyb20gJy4vUGRmVGVYRW5naW5lLmpzJztcbmltcG9ydCB7UERGRG9jdW1lbnR9IGZyb20gJ3BkZi1saWInO1xuaW1wb3J0IHtDb25maWcsIG9wdGltaXplfSBmcm9tICdzdmdvJztcbmltcG9ydCBNb3NoZSBmcm9tICdzcmMvbWFpbi5qcyc7XG5cblxuXG50eXBlIFN0cmluZ01hcCA9IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG5cblxuY29uc3Qgd2FpdEZvciA9IGFzeW5jIChjb25kRnVuYzogKCkgPT4gYm9vbGVhbikgPT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcblx0ICBpZiAoY29uZEZ1bmMoKSkge1xuXHRcdHJlc29sdmUoKTtcblx0ICB9XG5cdCAgZWxzZSB7XG5cdFx0c2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0ICBhd2FpdCB3YWl0Rm9yKGNvbmRGdW5jKTtcblx0XHQgIHJlc29sdmUoKTtcblx0XHR9LCAxMDApO1xuXHQgIH1cblx0fSk7XG4gIH07XG4gIFxuXG5leHBvcnQgY2xhc3MgTGF0ZXhSZW5kZXIge1xuXHRhcHA6IEFwcDtcblx0cGx1Z2luOiBNb3NoZTtcblx0Y2FjaGVGb2xkZXJQYXRoOiBzdHJpbmc7XG5cdHBhY2thZ2VDYWNoZUZvbGRlclBhdGg6IHN0cmluZztcblx0Y2FjaGU6IFthbnksIGFueV1bXSA9IFtdO1xuXHRwYWNrYWdlQ2FjaGU6IHsgW2tleTogc3RyaW5nXTogYW55IH1bXSA9IFt7fSwge30sIHt9LCB7fV07XG5cdHBsdWdpbkZvbGRlclBhdGg6IHN0cmluZztcblx0cGRmRW5naW5lOiBhbnk7XG5cdHBhY2thZ2VfdXJsOiBgaHR0cHM6Ly90ZXhsaXZlMi5zd2lmdGxhdGV4LmNvbS9gO1xuXHRjYWNoZU1hcDogTWFwPHN0cmluZywgU2V0PHN0cmluZz4+OyAvLyBLZXk6IG1kNSBoYXNoIG9mIGxhdGV4IHNvdXJjZS4gVmFsdWU6IFNldCBvZiBmaWxlIHBhdGggbmFtZXMuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE1vc2hlKSB7XG5cdFx0dGhpcy5hcHA9YXBwO1xuXHRcdHRoaXMucGx1Z2luPXBsdWdpbjtcblx0XHR0aGlzLm9ubG9hZCgpO1xuXHR9XG5cblx0YXN5bmMgb25sb2FkKCkge1xuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBTd2lmdExhVGVYIHBsdWdpblwiKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRDYWNoZSgpO1xuXHRcdHRoaXMucGx1Z2luRm9sZGVyUGF0aCA9IHBhdGguam9pbih0aGlzLmdldFZhdWx0UGF0aCgpLCB0aGlzLmFwcC52YXVsdC5jb25maWdEaXIsIFwicGx1Z2lucy9tb3NoZS1tYXRoL1wiKTtcblx0XHQvLyBpbml0aWFsaXplIHRoZSBsYXRleCBjb21waWxlclxuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogSW5pdGlhbGl6aW5nIExhVGVYIGNvbXBpbGVyXCIpO1xuXHRcdHRoaXMucGRmRW5naW5lID0gbmV3IFBkZlRlWEVuZ2luZSgpO1xuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBMYVRlWCBlbmdpbmVcIik7XG5cdFx0YXdhaXQgdGhpcy5wZGZFbmdpbmUubG9hZEVuZ2luZSgpO1xuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBjYWNoZVwiKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRQYWNrYWdlQ2FjaGUoKTtcblxuXHRcdHRoaXMucGRmRW5naW5lLnNldFRleGxpdmVFbmRwb2ludCh0aGlzLnBhY2thZ2VfdXJsKTtcblxuXHRcdHRoaXMuYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCk7XG5cdFx0Y29uc29sZS5sb2coXCJTd2lmdExhVGVYOiBSZWdpc3RlcmluZyBwb3N0IHByb2Nlc3NvcnNcIik7XG5cdFx0aWYgKHRydWUpIHtcblx0XHRcdGNvbnN0IHBkZkJsb2NrUHJvY2Vzc29yID0gTWFya2Rvd25QcmV2aWV3UmVuZGVyZXIuY3JlYXRlQ29kZUJsb2NrUG9zdFByb2Nlc3NvcihcImxhdGV4XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHRoaXMucmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlLCBlbCwgY3R4LCBmYWxzZSkpO1xuXHRcdFx0TWFya2Rvd25QcmV2aWV3UmVuZGVyZXIucmVnaXN0ZXJQb3N0UHJvY2Vzc29yKHBkZkJsb2NrUHJvY2Vzc29yKTtcblx0XHRcdGNvbnN0IHN2Z0Jsb2NrUHJvY2Vzc29yID0gTWFya2Rvd25QcmV2aWV3UmVuZGVyZXIuY3JlYXRlQ29kZUJsb2NrUG9zdFByb2Nlc3NvcihcImxhdGV4c3ZnXCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHRoaXMucmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlLCBlbCwgY3R4LCB0cnVlKSk7XG5cdFx0XHRNYXJrZG93blByZXZpZXdSZW5kZXJlci5yZWdpc3RlclBvc3RQcm9jZXNzb3Ioc3ZnQmxvY2tQcm9jZXNzb3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibGF0ZXhcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIGZhbHNlKSk7XG5cdFx0XHR0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibGF0ZXhzdmdcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIHRydWUpKTtcblx0XHR9XG5cdH1cblxuXHRvbnVubG9hZCgpIHtcblx0XHR0aGlzLnVubG9hZENhY2hlKCk7XG5cdH1cblxuXG5cdGdldFZhdWx0UGF0aCgpIHtcblx0XHRpZiAodGhpcy5hcHAudmF1bHQuYWRhcHRlciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1BZGFwdGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hcHAudmF1bHQuYWRhcHRlci5nZXRCYXNlUGF0aCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJNb3NoZTogQ291bGQgbm90IGdldCB2YXVsdCBwYXRoLlwiKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2FkQ2FjaGUoKSB7XG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMuY2FjaGVGb2xkZXJQYXRoID0gcGF0aC5qb2luKGNhY2hlRm9sZGVyUGFyZW50UGF0aCwgXCJwZGYtY2FjaGVcIik7XG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoKTtcblx0XHRcdHRoaXMuY2FjaGVNYXAgPSBuZXcgTWFwKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2FjaGVNYXAgPSBuZXcgTWFwKHRoaXMuY2FjaGUpO1xuXHRcdFx0Ly8gRm9yIHNvbWUgcmVhc29uIGB0aGlzLmNhY2hlYCBhdCB0aGlzIHBvaW50IGlzIGFjdHVhbGx5IGBNYXA8c3RyaW5nLCBBcnJheTxzdHJpbmc+PmBcblx0XHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMuY2FjaGVNYXApIHtcblx0XHRcdFx0dGhpcy5jYWNoZU1hcC5zZXQoaywgbmV3IFNldCh2KSlcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGFzeW5jIGxvYWRQYWNrYWdlQ2FjaGUoKSB7XG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCA9IHBhdGguam9pbihjYWNoZUZvbGRlclBhcmVudFBhdGgsIFwicGFja2FnZS1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0fVxuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBwYWNrYWdlIGNhY2hlXCIpO1xuXG5cdFx0Ly8gYWRkIGZpbGVzIGluIHRoZSBwYWNrYWdlIGNhY2hlIGZvbGRlciB0byB0aGUgY2FjaGUgbGlzdFxuXHRcdGNvbnN0IHBhY2thZ2VGaWxlcyA9IGZzLnJlYWRkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIHBhY2thZ2VGaWxlcykge1xuXHRcdFx0Y29uc3QgZmlsZW5hbWUgPSBwYXRoLmJhc2VuYW1lKGZpbGUpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBcIi90ZXgvXCIrZmlsZW5hbWU7XG5cdFx0XHRjb25zdCBwYWNrYWdlVmFsdWVzID0gT2JqZWN0LnZhbHVlcyh0aGlzLnBhY2thZ2VDYWNoZVsxXSk7XG5cdFx0XHRpZiAoIXBhY2thZ2VWYWx1ZXMuaW5jbHVkZXModmFsdWUpKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IFwiMjYvXCIgKyBmaWxlbmFtZVxuXHRcdFx0XHR0aGlzLnBhY2thZ2VDYWNoZVsxXVtrZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIG1vdmUgcGFja2FnZXMgdG8gdGhlIFZGU1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnBhY2thZ2VDYWNoZVsxXSkpIHtcblx0XHRcdGNvbnN0IGZpbGVuYW1lID0gcGF0aC5iYXNlbmFtZSh2YWwpO1xuXHRcdFx0bGV0IHJlYWRfc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3JjY29kZSA9IGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoLCBmaWxlbmFtZSkpO1xuXHRcdFx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZVRleEZTRmlsZShmaWxlbmFtZSwgc3JjY29kZSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIHdoZW4gdW5hYmxlIHRvIHJlYWQgZmlsZSwgcmVtb3ZlIHRoaXMgZnJvbSB0aGUgY2FjaGVcblx0XHRcdFx0Y29uc29sZS5sb2coYFVuYWJsZSB0byByZWFkIGZpbGUgJHtmaWxlbmFtZX0gZnJvbSBwYWNrYWdlIGNhY2hlYClcblx0XHRcdFx0ZGVsZXRlIHRoaXMucGFja2FnZUNhY2hlWzFdW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gd3JpdGUgY2FjaGUgZGF0YSB0byB0aGUgVkZTLCBleGNlcHQgZG9uJ3Qgd3JpdGUgdGhlIHRleGxpdmU0MDRfY2FjaGUgYmVjYXVzZSB0aGlzIHdpbGwgY2F1c2UgcHJvYmxlbXMgd2hlbiBzd2l0Y2hpbmcgYmV0d2VlbiB0ZXhsaXZlIHNvdXJjZXNcblx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZUNhY2hlRGF0YSh7fSxcblx0XHRcdHRoaXMucGFja2FnZUNhY2hlWzFdLFxuXHRcdFx0dGhpcy5wYWNrYWdlQ2FjaGVbMl0sXG5cdFx0XHR0aGlzLnBhY2thZ2VDYWNoZVszXSk7XG5cdH1cblxuXHR1bmxvYWRDYWNoZSgpIHtcblx0XHRmcy5ybWRpclN5bmModGhpcy5jYWNoZUZvbGRlclBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHR9XG5cblx0YWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuXHRcdC8vIEB0cy1pZ25vcmVcblx0XHR3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5wdXNoKHtuYW1lOiBcImxhdGV4c3ZnXCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XG5cdH1cblxuXHRmb3JtYXRMYXRleFNvdXJjZShzb3VyY2U6IHN0cmluZykge1xuXHRcdHJldHVybiBzb3VyY2U7XG5cdH1cblxuXHRoYXNoTGF0ZXhTb3VyY2Uoc291cmNlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gTWQ1Lmhhc2hTdHIoc291cmNlLnRyaW0oKSk7XG5cdH1cblxuXHRhc3luYyBwZGZUb0h0bWwocGRmRGF0YTogYW55KSB7XG5cdFx0Y29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gYXdhaXQgdGhpcy5nZXRQZGZEaW1lbnNpb25zKHBkZkRhdGEpO1xuXHRcdGNvbnN0IHJhdGlvID0gd2lkdGggLyBoZWlnaHQ7XG5cdFx0Y29uc3QgcGRmYmxvYiA9IG5ldyBCbG9iKFtwZGZEYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vcGRmJyB9KTtcblx0XHRjb25zdCBvYmplY3RVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKHBkZmJsb2IpO1xuXHRcdHJldHVybiAge1xuXHRcdFx0YXR0cjoge1xuXHRcdFx0ICBkYXRhOiBgJHtvYmplY3RVUkx9I3ZpZXc9Rml0SCZ0b29sYmFyPTBgLFxuXHRcdFx0ICB0eXBlOiAnYXBwbGljYXRpb24vcGRmJyxcblx0XHRcdCAgY2xhc3M6ICdibG9jay1sYW51YWdlLWxhdGV4Jyxcblx0XHRcdCAgc3R5bGU6IGB3aWR0aDoxMDAlOyBhc3BlY3QtcmF0aW86JHtyYXRpb31gXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHN2Z1RvSHRtbChzdmc6IGFueSkge1xuXHRcdGlmIChmYWxzZSkge1xuXHRcdFx0c3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN2Zztcblx0fVxuXHRcblx0YXN5bmMgZ2V0UGRmRGltZW5zaW9ucyhwZGY6IGFueSk6IFByb21pc2U8e3dpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyfT4ge1xuXHRcdGNvbnN0IHBkZkRvYyA9IGF3YWl0IFBERkRvY3VtZW50LmxvYWQocGRmKTtcblx0XHRjb25zdCBmaXJzdFBhZ2UgPSBwZGZEb2MuZ2V0UGFnZXMoKVswXTtcblx0XHRjb25zdCB7d2lkdGgsIGhlaWdodH0gPSBmaXJzdFBhZ2UuZ2V0U2l6ZSgpO1xuXHRcdHJldHVybiB7d2lkdGgsIGhlaWdodH07XG5cdH1cblx0Lypcblx0cGRmVG9TVkcocGRmRGF0YTogYW55KSB7XG5cdFx0cmV0dXJuIFBkZlRvQ2Fpcm8oKS50aGVuKChwZGZ0b2NhaXJvOiBhbnkpID0+IHtcblx0XHRcdHBkZnRvY2Fpcm8uRlMud3JpdGVGaWxlKCdpbnB1dC5wZGYnLCBwZGZEYXRhKTtcblx0XHRcdHBkZnRvY2Fpcm8uX2NvbnZlcnRQZGZUb1N2ZygpO1xuXHRcdFx0bGV0IHN2ZyA9IHBkZnRvY2Fpcm8uRlMucmVhZEZpbGUoJ2lucHV0LnN2ZycsIHtlbmNvZGluZzondXRmOCd9KTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSB1bmlxdWUgSUQgZm9yIGVhY2ggU1ZHIHRvIGF2b2lkIGNvbmZsaWN0c1xuXHRcdFx0Y29uc3QgaWQgPSBNZDUuaGFzaFN0cihzdmcudHJpbSgpKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgcmFuZG9tU3RyaW5nID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDEwKTtcblx0XHRcdGNvbnN0IHVuaXF1ZUlkID0gaWQuY29uY2F0KHJhbmRvbVN0cmluZyk7XG5cdFx0XHRjb25zdCBzdmdvQ29uZmlnOkNvbmZpZyA9ICB7XG5cdFx0XHRcdHBsdWdpbnM6IFsnc29ydEF0dHJzJywgeyBuYW1lOiAncHJlZml4SWRzJywgcGFyYW1zOiB7IHByZWZpeDogdW5pcXVlSWQgfSB9XVxuXHRcdFx0fTtcblx0XHRcdHN2ZyA9IG9wdGltaXplKHN2Zywgc3Znb0NvbmZpZykuZGF0YTsgXG5cblx0XHRcdHJldHVybiBzdmc7XG5cdH0pO1xuXHR9Ki9cblxuXHRjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcblx0XHQvLyBSZXBsYWNlIHRoZSBjb2xvciBcImJsYWNrXCIgd2l0aCBjdXJyZW50Q29sb3IgKHRoZSBjdXJyZW50IHRleHQgY29sb3IpXG5cdFx0Ly8gc28gdGhhdCBkaWFncmFtIGF4ZXMsIGV0YyBhcmUgdmlzaWJsZSBpbiBkYXJrIG1vZGVcblx0XHQvLyBBbmQgcmVwbGFjZSBcIndoaXRlXCIgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvclxuXG5cdFx0c3ZnID0gc3ZnLnJlcGxhY2UoL3JnYlxcKDAlLCAwJSwgMCVcXCkvZywgXCJjdXJyZW50Q29sb3JcIilcblx0XHRcdFx0LnJlcGxhY2UoL3JnYlxcKDEwMCUsIDEwMCUsIDEwMCVcXCkvZywgXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXCIpO1xuXG5cdFx0cmV0dXJuIHN2Zztcblx0fVxuXG5cblx0YXN5bmMgcmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBvdXRwdXRTVkc6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdGNvbnNvbGUubG9nKFwicmVuZGVyTGF0ZXhUb0VsZW1lbnQgY2FsbGVkXCIpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRsZXQgbWQ1SGFzaCA9IHRoaXMuaGFzaExhdGV4U291cmNlKHNvdXJjZSk7XG5cdFx0XHRsZXQgcGRmUGF0aCA9IHBhdGguam9pbih0aGlzLmNhY2hlRm9sZGVyUGF0aCwgYCR7bWQ1SGFzaH0ucGRmYCk7XG5cblx0XHRcdC8vIFBERiBmaWxlIGhhcyBhbHJlYWR5IGJlZW4gY2FjaGVkXG5cdFx0XHQvLyBDb3VsZCBoYXZlIGEgY2FzZSB3aGVyZSBwZGZDYWNoZSBoYXMgdGhlIGtleSBidXQgdGhlIGNhY2hlZCBmaWxlIGhhcyBiZWVuIGRlbGV0ZWRcblx0XHRcdGlmICh0aGlzLmNhY2hlTWFwLmhhcyhtZDVIYXNoKSAmJiBmcy5leGlzdHNTeW5jKHBkZlBhdGgpKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKFwiVXNpbmcgY2FjaGVkIFBERjogXCIsIG1kNUhhc2gpO1xuXHRcdFx0XHRsZXQgcGRmRGF0YSA9IGZzLnJlYWRGaWxlU3luYyhwZGZQYXRoKTtcblx0XHRcdFx0aWYgKG91dHB1dFNWRykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcigpLy90aGlzLnBkZlRvU1ZHKHBkZkRhdGEpLnRoZW4oKHN2Zzogc3RyaW5nKSA9PiB7IGVsLmlubmVySFRNTCA9IHRoaXMuc3ZnVG9IdG1sKHN2Zyk7fSlcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnBkZlRvSHRtbChwZGZEYXRhKS50aGVuKChodG1sRGF0YSk9PntlbC5jcmVhdGVFbChcIm9iamVjdFwiLCBodG1sRGF0YSk7IHJlc29sdmUoKTt9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmFkZEZpbGVUb0NhY2hlKG1kNUhhc2gsIGN0eC5zb3VyY2VQYXRoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKFwiUmVuZGVyaW5nIFBERjogXCIsIG1kNUhhc2gpO1xuXHRcdFx0XHRcblx0XHRcdFx0dGhpcy5yZW5kZXJMYXRleFRvUERGKHNvdXJjZSwgbWQ1SGFzaCkudGhlbigocjogYW55KSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5hZGRGaWxlVG9DYWNoZShtZDVIYXNoLCBjdHguc291cmNlUGF0aCk7XG5cdFx0XHRcdFx0aWYgKG91dHB1dFNWRykge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCk7Ly90aGlzLnBkZlRvU1ZHKHIucGRmKS50aGVuKChzdmc6IHN0cmluZykgPT4geyBlbC5pbm5lckhUTUwgPSB0aGlzLnN2Z1RvSHRtbChzdmcpO30pXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMucGRmVG9IdG1sKHIucGRmKS50aGVuKChodG1sRGF0YSk9PntlbC5jcmVhdGVFbChcIm9iamVjdFwiLCBodG1sRGF0YSk7IHJlc29sdmUoKTt9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZnMud3JpdGVGaWxlU3luYyhwZGZQYXRoLCByLnBkZik7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdCkuY2F0Y2goZXJyID0+IHsgXG5cdFx0XHRcdFx0bGV0IGVycm9yRGl2ID0gZWwuY3JlYXRlRWwoJ2RpdicsIHsgdGV4dDogYCR7ZXJyfWAsIGF0dHI6IHsgY2xhc3M6ICdibG9jay1sYXRleC1lcnJvcicgfSB9KTtcblx0XHRcdFx0XHRyZWplY3QoZXJyKTsgXG5cdFx0XHRcdH0pO1x0XHRcdFx0XG5cdFx0XHR9XG5cdFx0fSkudGhlbigoKSA9PiB7IFxuXHRcdFx0dGhpcy5wZGZFbmdpbmUuZmx1c2hDYWNoZSgpO1xuXHRcdFx0IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5jbGVhblVwQ2FjaGUoKSwgMTAwMCk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZW5kZXJMYXRleFRvUERGKHNvdXJjZTogc3RyaW5nLCBtZDVIYXNoOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0c291cmNlID0gdGhpcy5mb3JtYXRMYXRleFNvdXJjZShzb3VyY2UpO1xuXG5cdFx0XHR0ZW1wLm1rZGlyKFwib2JzaWRpYW4tc3dpZnRsYXRleC1yZW5kZXJlclwiLCBhc3luYyAoZXJyLCBkaXJQYXRoKSA9PiB7XG5cdFx0XHRcdFxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHdhaXRGb3IoKCkgPT4gdGhpcy5wZGZFbmdpbmUuaXNSZWFkeSgpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVycikgcmVqZWN0KGVycik7XG5cdFx0XHRcdHRoaXMucGRmRW5naW5lLndyaXRlTWVtRlNGaWxlKFwibWFpbi50ZXhcIiwgc291cmNlKTtcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuc2V0RW5naW5lTWFpbkZpbGUoXCJtYWluLnRleFwiKTtcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuY29tcGlsZUxhVGVYKCkudGhlbigocjogYW55KSA9PiB7XG5cdFx0XHRcdGlmIChyLnN0YXR1cyAhPSAwKSB7XG5cdFx0XHRcdFx0Ly8gbWFuYWdlIGxhdGV4IGVycm9yc1xuXHRcdFx0XHRcdHJlamVjdChyLmxvZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gdXBkYXRlIHRoZSBsaXN0IG9mIHBhY2thZ2UgZmlsZXMgaW4gdGhlIGNhY2hlXG5cdFx0XHRcdHRoaXMuZmV0Y2hQYWNrYWdlQ2FjaGVEYXRhKClcblx0XHRcdFx0cmVzb2x2ZShyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KVxuXHRcdH0pO1xuXHR9XG5cblx0ZmV0Y2hQYWNrYWdlQ2FjaGVEYXRhKCk6IHZvaWQge1xuXHRcdHRoaXMucGRmRW5naW5lLmZldGNoQ2FjaGVEYXRhKCkudGhlbigocjogU3RyaW5nTWFwW10pID0+IHtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgci5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoaSA9PT0gMSkgeyAvLyBjdXJyZW50bHkgb25seSBkZWFsaW5nIHdpdGggdGV4bGl2ZTIwMF9jYWNoZVxuXHRcdFx0XHRcdC8vIGdldCBkaWZmc1xuXHRcdFx0XHRcdGNvbnN0IG5ld0ZpbGVOYW1lcyA9IHRoaXMuZ2V0TmV3UGFja2FnZUZpbGVOYW1lcyh0aGlzLnBhY2thZ2VDYWNoZVtpXSwgcltpXSk7XG5cdFx0XHRcdFx0Ly8gZmV0Y2ggbmV3IHBhY2thZ2UgZmlsZXNcblx0XHRcdFx0XHR0aGlzLnBkZkVuZ2luZS5mZXRjaFRleEZpbGVzKG5ld0ZpbGVOYW1lcywgdGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5wYWNrYWdlQ2FjaGUgPSByO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0TmV3UGFja2FnZUZpbGVOYW1lcyhvbGRDYWNoZURhdGE6IFN0cmluZ01hcCwgbmV3Q2FjaGVEYXRhOiBTdHJpbmdNYXApOiBzdHJpbmdbXSB7XG5cdFx0Ly8gYmFzZWQgb24gdGhlIG9sZCBhbmQgbmV3IHBhY2thZ2UgZmlsZXMgaW4gcGFja2FnZSBjYWNoZSBkYXRhLFxuXHRcdC8vIHJldHVybiB0aGUgbmV3IHBhY2thZ2UgZmlsZXNcblx0XHRsZXQgbmV3S2V5cyA9IE9iamVjdC5rZXlzKG5ld0NhY2hlRGF0YSkuZmlsdGVyKGtleSA9PiAhKGtleSBpbiBvbGRDYWNoZURhdGEpKTtcblx0XHRsZXQgbmV3UGFja2FnZUZpbGVzID0gbmV3S2V5cy5tYXAoa2V5ID0+IHBhdGguYmFzZW5hbWUobmV3Q2FjaGVEYXRhW2tleV0pKTtcdFx0XG5cdFx0cmV0dXJuIG5ld1BhY2thZ2VGaWxlcztcblx0fVxuXG5cdGFzeW5jIHNhdmVDYWNoZSgpIHtcblx0XHRsZXQgdGVtcCA9IG5ldyBNYXAoKTtcblx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLmNhY2hlTWFwKSB7XG5cdFx0XHR0ZW1wLnNldChrLCBbLi4udl0pXG5cdFx0fVxuXHRcdHRoaXMuY2FjaGUgPSBbLi4udGVtcF07XG5cblx0fVxuXG5cdGFkZEZpbGVUb0NhY2hlKGhhc2g6IHN0cmluZywgZmlsZV9wYXRoOiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuY2FjaGVNYXAuaGFzKGhhc2gpKSB7XG5cdFx0XHR0aGlzLmNhY2hlTWFwLnNldChoYXNoLCBuZXcgU2V0KCkpO1xuXHRcdH1cblx0XHR0aGlzLmNhY2hlTWFwLmdldChoYXNoKT8uYWRkKGZpbGVfcGF0aCk7XG5cdH1cblxuXHRhc3luYyBjbGVhblVwQ2FjaGUoKSB7XG5cdFx0bGV0IGZpbGVfcGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGZwcyBvZiB0aGlzLmNhY2hlTWFwLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZwIG9mIGZwcykge1xuXHRcdFx0XHRmaWxlX3BhdGhzLmFkZChmcCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBmaWxlX3BhdGggb2YgZmlsZV9wYXRocykge1xuXHRcdFx0bGV0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZV9wYXRoKTtcblx0XHRcdGlmIChmaWxlID09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVGaWxlRnJvbUNhY2hlKGZpbGVfcGF0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZW1vdmVVbnVzZWRDYWNoZXNGb3JGaWxlKGZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuc2F2ZUNhY2hlKCk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVVbnVzZWRDYWNoZXNGb3JGaWxlKGZpbGU6IFRGaWxlKSB7XG5cdFx0bGV0IGhhc2hlc19pbl9maWxlID0gYXdhaXQgdGhpcy5nZXRMYXRleEhhc2hlc0Zyb21GaWxlKGZpbGUpO1xuXHRcdGxldCBoYXNoZXNfaW5fY2FjaGUgPSB0aGlzLmdldExhdGV4SGFzaGVzRnJvbUNhY2hlRm9yRmlsZShmaWxlKTtcblx0XHRmb3IgKGNvbnN0IGhhc2ggb2YgaGFzaGVzX2luX2NhY2hlKSB7XG5cdFx0XHRpZiAoIWhhc2hlc19pbl9maWxlLmNvbnRhaW5zKGhhc2gpKSB7XG5cdFx0XHRcdHRoaXMuY2FjaGVNYXAuZ2V0KGhhc2gpPy5kZWxldGUoZmlsZS5wYXRoKTtcblx0XHRcdFx0aWYgKHRoaXMuY2FjaGVNYXAuZ2V0KGhhc2gpPy5zaXplID09IDApIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZVBERkZyb21DYWNoZShoYXNoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlbW92ZVBERkZyb21DYWNoZShrZXk6IHN0cmluZykge1xuXHRcdHRoaXMuY2FjaGVNYXAuZGVsZXRlKGtleSk7XG5cdFx0ZnMucm1TeW5jKHBhdGguam9pbih0aGlzLmNhY2hlRm9sZGVyUGF0aCwgYCR7a2V5fS5wZGZgKSk7XG5cdH1cblxuXHRyZW1vdmVGaWxlRnJvbUNhY2hlKGZpbGVfcGF0aDogc3RyaW5nKSB7XG5cdFx0Zm9yIChjb25zdCBoYXNoIG9mIHRoaXMuY2FjaGVNYXAua2V5cygpKSB7XG5cdFx0XHR0aGlzLmNhY2hlTWFwLmdldChoYXNoKT8uZGVsZXRlKGZpbGVfcGF0aCk7XG5cdFx0XHRpZiAodGhpcy5jYWNoZU1hcC5nZXQoaGFzaCk/LnNpemUgPT0gMCkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZVBERkZyb21DYWNoZShoYXNoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRMYXRleEhhc2hlc0Zyb21DYWNoZUZvckZpbGUoZmlsZTogVEZpbGUpIHtcblx0XHRsZXQgaGFzaGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBwYXRoID0gZmlsZS5wYXRoO1xuXHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMuY2FjaGVNYXAuZW50cmllcygpKSB7XG5cdFx0XHRpZiAodi5oYXMocGF0aCkpIHtcblx0XHRcdFx0aGFzaGVzLnB1c2goayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBoYXNoZXM7XG5cdH1cblxuXHRhc3luYyBnZXRMYXRleEhhc2hlc0Zyb21GaWxlKGZpbGU6IFRGaWxlKSB7XG5cdFx0bGV0IGhhc2hlczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgc2VjdGlvbnMgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKT8uc2VjdGlvbnNcblx0XHRpZiAoc2VjdGlvbnMgIT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRsZXQgbGluZXMgPSAoYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKSkuc3BsaXQoJ1xcbicpO1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHNlY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChzZWN0aW9uLnR5cGUgIT0gXCJjb2RlXCIgJiYgbGluZXNbc2VjdGlvbi5wb3NpdGlvbi5zdGFydC5saW5lXS5tYXRjaChcImBgYCAqbGF0ZXhcIikgPT0gbnVsbCkgY29udGludWU7XG5cdFx0XHRcdGxldCBzb3VyY2UgPSBsaW5lcy5zbGljZShzZWN0aW9uLnBvc2l0aW9uLnN0YXJ0LmxpbmUgKyAxLCBzZWN0aW9uLnBvc2l0aW9uLmVuZC5saW5lKS5qb2luKFwiXFxuXCIpO1xuXHRcdFx0XHRsZXQgaGFzaCA9IHRoaXMuaGFzaExhdGV4U291cmNlKHNvdXJjZSk7XG5cdFx0XHRcdGhhc2hlcy5wdXNoKGhhc2gpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGFzaGVzO1xuXHR9XG59XG5cbiJdfQ==