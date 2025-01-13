import { FileSystemAdapter, TFile, MarkdownPreviewRenderer } from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
import { PdfTeXEngine } from './PdfTeXEngine.js';
import { PDFDocument } from 'pdf-lib';
import PdfToCairo from "./pdftocairo.js";
import { optimize } from 'svgo';
const DEFAULT_SETTINGS = {
    package_url: `https://texlive2.swiftlatex.com/`,
    timeout: 10000,
    enableCache: true,
    invertColorsInDarkMode: true,
    cache: [],
    packageCache: [{}, {}, {}, {}],
    onlyRenderInReadingMode: false,
};
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
export class SwiftlatexRender {
    settings;
    cacheFolderPath;
    packageCacheFolderPath;
    pluginFolderPath;
    pdfEngine;
    app;
    plugin;
    cache; // Key: md5 hash of latex source. Value: Set of file path names.
    constructor(app, plugin) {
        this.app = this.app;
        this.plugin = this.plugin;
    }
    async onload() {
        await this.loadSettings();
        if (this.settings.enableCache)
            await this.loadCache();
        this.pluginFolderPath = path.join(this.getVaultPath(), this.app.vault.configDir, "plugins/swiftlatex-render/");
        // initialize the latex compiler
        this.pdfEngine = new PdfTeXEngine();
        await this.pdfEngine.loadEngine();
        await this.loadPackageCache();
        this.pdfEngine.setTexliveEndpoint(this.settings.package_url);
        this.addSyntaxHighlighting();
        if (this.settings.onlyRenderInReadingMode) {
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
        if (this.settings.enableCache)
            this.unloadCache();
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
    }
    async saveSettings() {
        await this.plugin.saveData(this.settings);
    }
    getVaultPath() {
        if (this.app.vault.adapter instanceof FileSystemAdapter) {
            return this.app.vault.adapter.getBasePath();
        }
        else {
            throw new Error("SwiftLaTeX: Could not get vault path.");
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
            this.cache = new Map();
        }
        else {
            this.cache = new Map(this.settings.cache);
            // For some reason `this.cache` at this point is actually `Map<string, Array<string>>`
            for (const [k, v] of this.cache) {
                this.cache.set(k, new Set(v));
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
            const packageValues = Object.values(this.settings.packageCache[1]);
            if (!packageValues.includes(value)) {
                const key = "26/" + filename;
                this.settings.packageCache[1][key] = value;
            }
        }
        // move packages to the VFS
        for (const [key, val] of Object.entries(this.settings.packageCache[1])) {
            const filename = path.basename(val);
            let read_success = false;
            try {
                const srccode = fs.readFileSync(path.join(this.packageCacheFolderPath, filename));
                this.pdfEngine.writeTexFSFile(filename, srccode);
            }
            catch (e) {
                // when unable to read file, remove this from the cache
                console.log(`Unable to read file ${filename} from package cache`);
                delete this.settings.packageCache[1][key];
            }
        }
        // write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
        this.pdfEngine.writeCacheData({}, this.settings.packageCache[1], this.settings.packageCache[2], this.settings.packageCache[3]);
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
        if (this.settings.invertColorsInDarkMode) {
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
    pdfToSVG(pdfData) {
        return PdfToCairo().then((pdftocairo) => {
            pdftocairo.FS.writeFile('input.pdf', pdfData);
            pdftocairo._convertPdfToSvg();
            let svg = pdftocairo.FS.readFile('input.svg', { encoding: 'utf8' });
            // Generate a unique ID for each SVG to avoid conflicts
            const id = Md5.hashStr(svg.trim()).toString();
            const randomString = Math.random().toString(36).substring(2, 10);
            const uniqueId = id.concat(randomString);
            const svgoConfig = {
                plugins: ['sortAttrs', { name: 'prefixIds', params: { prefix: uniqueId } }]
            };
            svg = optimize(svg, svgoConfig).data;
            return svg;
        });
    }
    colorSVGinDarkMode(svg) {
        // Replace the color "black" with currentColor (the current text color)
        // so that diagram axes, etc are visible in dark mode
        // And replace "white" with the background color
        svg = svg.replace(/rgb\(0%, 0%, 0%\)/g, "currentColor")
            .replace(/rgb\(100%, 100%, 100%\)/g, "var(--background-primary)");
        return svg;
    }
    async renderLatexToElement(source, el, ctx, outputSVG = false) {
        return new Promise((resolve, reject) => {
            let md5Hash = this.hashLatexSource(source);
            let pdfPath = path.join(this.cacheFolderPath, `${md5Hash}.pdf`);
            // PDF file has already been cached
            // Could have a case where pdfCache has the key but the cached file has been deleted
            if (this.settings.enableCache && this.cache.has(md5Hash) && fs.existsSync(pdfPath)) {
                // console.log("Using cached PDF: ", md5Hash);
                let pdfData = fs.readFileSync(pdfPath);
                if (outputSVG) {
                    this.pdfToSVG(pdfData).then((svg) => { el.innerHTML = this.svgToHtml(svg); });
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
                    if (this.settings.enableCache)
                        this.addFileToCache(md5Hash, ctx.sourcePath);
                    if (outputSVG) {
                        this.pdfToSVG(r.pdf).then((svg) => { el.innerHTML = this.svgToHtml(svg); });
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
            if (this.settings.enableCache)
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
                    const newFileNames = this.getNewPackageFileNames(this.settings.packageCache[i], r[i]);
                    // fetch new package files
                    this.pdfEngine.fetchTexFiles(newFileNames, this.packageCacheFolderPath);
                }
            }
            this.settings.packageCache = r;
            this.saveSettings().then(); // hmm
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
        for (const [k, v] of this.cache) {
            temp.set(k, [...v]);
        }
        this.settings.cache = [...temp];
        await this.saveSettings();
    }
    addFileToCache(hash, file_path) {
        if (!this.cache.has(hash)) {
            this.cache.set(hash, new Set());
        }
        this.cache.get(hash)?.add(file_path);
    }
    async cleanUpCache() {
        let file_paths = new Set();
        for (const fps of this.cache.values()) {
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
                this.cache.get(hash)?.delete(file.path);
                if (this.cache.get(hash)?.size == 0) {
                    this.removePDFFromCache(hash);
                }
            }
        }
    }
    removePDFFromCache(key) {
        this.cache.delete(key);
        fs.rmSync(path.join(this.cacheFolderPath, `${key}.pdf`));
    }
    removeFileFromCache(file_path) {
        for (const hash of this.cache.keys()) {
            this.cache.get(hash)?.delete(file_path);
            if (this.cache.get(hash)?.size == 0) {
                this.removePDFFromCache(hash);
            }
        }
    }
    getLatexHashesFromCacheForFile(file) {
        let hashes = [];
        let path = file.path;
        for (const [k, v] of this.cache.entries()) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9sYXRleFJlbmRlci9oLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBTyxpQkFBaUIsRUFBaUYsS0FBSyxFQUF5Qix1QkFBdUIsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN4TCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sRUFBQyxZQUFZLEVBQUMsTUFBTSxtQkFBbUIsQ0FBQztBQUMvQyxPQUFPLEVBQUMsV0FBVyxFQUFDLE1BQU0sU0FBUyxDQUFDO0FBQ3BDLE9BQU8sVUFBVSxNQUFNLGlCQUFpQixDQUFDO0FBQ3pDLE9BQU8sRUFBQyxRQUFRLEVBQVMsTUFBTSxNQUFNLENBQUM7QUFhdEMsTUFBTSxnQkFBZ0IsR0FBNkI7SUFDbEQsV0FBVyxFQUFFLGtDQUFrQztJQUMvQyxPQUFPLEVBQUUsS0FBSztJQUNkLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLHNCQUFzQixFQUFFLElBQUk7SUFDNUIsS0FBSyxFQUFFLEVBQUU7SUFDVCxZQUFZLEVBQUUsQ0FBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7SUFDM0IsdUJBQXVCLEVBQUUsS0FBSztDQUM5QixDQUFBO0FBS0QsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLFFBQXVCLEVBQUUsRUFBRTtJQUNqRCxPQUFPLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDbkMsSUFBSSxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxDQUFDO1FBQ1QsQ0FBQzthQUNJLENBQUM7WUFDUCxVQUFVLENBQUMsS0FBSyxJQUFJLEVB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LElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztDQUNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBGaWxlU3lzdGVtQWRhcHRlciwgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZWN0aW9uQ2FjaGUsIFNldHRpbmcsIFRGaWxlLCBURm9sZGVyLCBNYXJrZG93blZpZXcsIE1hcmtkb3duUHJldmlld1JlbmRlcmVyIH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgeyBNZDUgfSBmcm9tICd0cy1tZDUnO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCAqIGFzIHRlbXAgZnJvbSAndGVtcCc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7UGRmVGVYRW5naW5lfSBmcm9tICcuL1BkZlRlWEVuZ2luZS5qcyc7XHJcbmltcG9ydCB7UERGRG9jdW1lbnR9IGZyb20gJ3BkZi1saWInO1xyXG5pbXBvcnQgUGRmVG9DYWlybyBmcm9tIFwiLi9wZGZ0b2NhaXJvLmpzXCI7XHJcbmltcG9ydCB7b3B0aW1pemUsQ29uZmlnIH0gZnJvbSAnc3Znbyc7XHJcbmltcG9ydCBNb3NoZSBmcm9tICdzcmMvbWFpbi5qcyc7XHJcblxyXG5pbnRlcmZhY2UgU3dpZnRsYXRleFJlbmRlclNldHRpbmdzIHtcclxuXHRwYWNrYWdlX3VybDogc3RyaW5nLFxyXG5cdHRpbWVvdXQ6IG51bWJlcixcclxuXHRlbmFibGVDYWNoZTogYm9vbGVhbixcclxuXHRpbnZlcnRDb2xvcnNJbkRhcmtNb2RlOiBib29sZWFuO1xyXG5cdGNhY2hlOiBBcnJheTxbc3RyaW5nLCBTZXQ8c3RyaW5nPl0+O1xyXG5cdHBhY2thZ2VDYWNoZTogQXJyYXk8U3RyaW5nTWFwPjtcclxuXHRvbmx5UmVuZGVySW5SZWFkaW5nTW9kZTogYm9vbGVhbjtcclxufVxyXG5cclxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogU3dpZnRsYXRleFJlbmRlclNldHRpbmdzID0ge1xyXG5cdHBhY2thZ2VfdXJsOiBgaHR0cHM6Ly90ZXhsaXZlMi5zd2lmdGxhdGV4LmNvbS9gLFxyXG5cdHRpbWVvdXQ6IDEwMDAwLFxyXG5cdGVuYWJsZUNhY2hlOiB0cnVlLFxyXG5cdGludmVydENvbG9yc0luRGFya01vZGU6IHRydWUsXHJcblx0Y2FjaGU6IFtdLFxyXG5cdHBhY2thZ2VDYWNoZTogW3t9LHt9LHt9LHt9XSxcclxuXHRvbmx5UmVuZGVySW5SZWFkaW5nTW9kZTogZmFsc2UsXHJcbn1cclxuXHJcbnR5cGUgU3RyaW5nTWFwID0geyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcclxuXHJcblxyXG5jb25zdCB3YWl0Rm9yID0gYXN5bmMgKGNvbmRGdW5jOiAoKSA9PiBib29sZWFuKSA9PiB7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XHJcblx0ICBpZiAoY29uZEZ1bmMoKSkge1xyXG5cdFx0cmVzb2x2ZSgpO1xyXG5cdCAgfVxyXG5cdCAgZWxzZSB7XHJcblx0XHRzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcclxuXHRcdCAgYXdhaXQgd2FpdEZvcihjb25kRnVuYyk7XHJcblx0XHQgIHJlc29sdmUoKTtcclxuXHRcdH0sIDEwMCk7XHJcblx0ICB9XHJcblx0fSk7XHJcbiAgfTtcclxuICBcclxuXHJcbmV4cG9ydCBjbGFzcyBTd2lmdGxhdGV4UmVuZGVyIHtcclxuXHRzZXR0aW5nczogU3dpZnRsYXRleFJlbmRlclNldHRpbmdzO1xyXG5cdGNhY2hlRm9sZGVyUGF0aDogc3RyaW5nO1xyXG5cdHBhY2thZ2VDYWNoZUZvbGRlclBhdGg6IHN0cmluZztcclxuXHRwbHVnaW5Gb2xkZXJQYXRoOiBzdHJpbmc7XHJcblx0cGRmRW5naW5lOiBhbnk7XHJcblx0YXBwOiBBcHA7XHJcblx0cGx1Z2luOiBNb3NoZTtcclxuXHRjYWNoZTogTWFwPHN0cmluZywgU2V0PHN0cmluZz4+OyAvLyBLZXk6IG1kNSBoYXNoIG9mIGxhdGV4IHNvdXJjZS4gVmFsdWU6IFNldCBvZiBmaWxlIHBhdGggbmFtZXMuXHJcblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTW9zaGUpIHtcclxuXHRcdHRoaXMuYXBwPXRoaXMuYXBwO1xyXG5cdFx0dGhpcy5wbHVnaW49dGhpcy5wbHVnaW47XHJcblx0fVxyXG5cdGFzeW5jIG9ubG9hZCgpIHtcclxuXHRcdGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5lbmFibGVDYWNoZSkgYXdhaXQgdGhpcy5sb2FkQ2FjaGUoKTtcclxuXHRcdHRoaXMucGx1Z2luRm9sZGVyUGF0aCA9IHBhdGguam9pbih0aGlzLmdldFZhdWx0UGF0aCgpLCB0aGlzLmFwcC52YXVsdC5jb25maWdEaXIsIFwicGx1Z2lucy9zd2lmdGxhdGV4LXJlbmRlci9cIik7XHJcblx0XHQvLyBpbml0aWFsaXplIHRoZSBsYXRleCBjb21waWxlclxyXG5cdFx0dGhpcy5wZGZFbmdpbmUgPSBuZXcgUGRmVGVYRW5naW5lKCk7XHJcblx0XHRhd2FpdCB0aGlzLnBkZkVuZ2luZS5sb2FkRW5naW5lKCk7XHJcblx0XHRhd2FpdCB0aGlzLmxvYWRQYWNrYWdlQ2FjaGUoKTtcclxuXHRcdHRoaXMucGRmRW5naW5lLnNldFRleGxpdmVFbmRwb2ludCh0aGlzLnNldHRpbmdzLnBhY2thZ2VfdXJsKTtcclxuXHJcblx0XHR0aGlzLmFkZFN5bnRheEhpZ2hsaWdodGluZygpO1xyXG5cdFx0aWYgKHRoaXMuc2V0dGluZ3Mub25seVJlbmRlckluUmVhZGluZ01vZGUpIHtcclxuXHRcdFx0Y29uc3QgcGRmQmxvY2tQcm9jZXNzb3IgPSBNYXJrZG93blByZXZpZXdSZW5kZXJlci5jcmVhdGVDb2RlQmxvY2tQb3N0UHJvY2Vzc29yKFwibGF0ZXhcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIGZhbHNlKSk7XHJcblx0XHRcdE1hcmtkb3duUHJldmlld1JlbmRlcmVyLnJlZ2lzdGVyUG9zdFByb2Nlc3NvcihwZGZCbG9ja1Byb2Nlc3Nvcik7XHJcblx0XHRcdGNvbnN0IHN2Z0Jsb2NrUHJvY2Vzc29yID0gTWFya2Rvd25QcmV2aWV3UmVuZGVyZXIuY3JlYXRlQ29kZUJsb2NrUG9zdFByb2Nlc3NvcihcImxhdGV4c3ZnXCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHRoaXMucmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlLCBlbCwgY3R4LCB0cnVlKSk7XHJcblx0XHRcdE1hcmtkb3duUHJldmlld1JlbmRlcmVyLnJlZ2lzdGVyUG9zdFByb2Nlc3NvcihzdmdCbG9ja1Byb2Nlc3Nvcik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibGF0ZXhcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIGZhbHNlKSk7XHJcblx0XHRcdHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJsYXRleHN2Z1wiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB0aGlzLnJlbmRlckxhdGV4VG9FbGVtZW50KHNvdXJjZSwgZWwsIGN0eCwgdHJ1ZSkpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0b251bmxvYWQoKSB7XHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5lbmFibGVDYWNoZSkgdGhpcy51bmxvYWRDYWNoZSgpO1xyXG5cdH1cclxuXHJcblx0YXN5bmMgbG9hZFNldHRpbmdzKCkge1xyXG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMucGx1Z2luLmxvYWREYXRhKCkpO1xyXG5cdH1cclxuXHJcblxyXG5cdGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcclxuXHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xyXG5cdH1cclxuXHJcblx0Z2V0VmF1bHRQYXRoKCkge1xyXG5cdFx0aWYgKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIgaW5zdGFuY2VvZiBGaWxlU3lzdGVtQWRhcHRlcikge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5hcHAudmF1bHQuYWRhcHRlci5nZXRCYXNlUGF0aCgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiU3dpZnRMYVRlWDogQ291bGQgbm90IGdldCB2YXVsdCBwYXRoLlwiKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGFzeW5jIGxvYWRDYWNoZSgpIHtcclxuXHRcdGNvbnN0IGNhY2hlRm9sZGVyUGFyZW50UGF0aCA9IHBhdGguam9pbih0aGlzLmdldFZhdWx0UGF0aCgpLCB0aGlzLmFwcC52YXVsdC5jb25maWdEaXIsIFwic3dpZnRsYXRleC1yZW5kZXItY2FjaGVcIik7XHJcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xyXG5cdFx0XHRmcy5ta2RpclN5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKTtcclxuXHRcdH1cclxuXHRcdHRoaXMuY2FjaGVGb2xkZXJQYXRoID0gcGF0aC5qb2luKGNhY2hlRm9sZGVyUGFyZW50UGF0aCwgXCJwZGYtY2FjaGVcIik7XHJcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5jYWNoZUZvbGRlclBhdGgpKSB7XHJcblx0XHRcdGZzLm1rZGlyU3luYyh0aGlzLmNhY2hlRm9sZGVyUGF0aCk7XHJcblx0XHRcdHRoaXMuY2FjaGUgPSBuZXcgTWFwKCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLmNhY2hlID0gbmV3IE1hcCh0aGlzLnNldHRpbmdzLmNhY2hlKTtcclxuXHRcdFx0Ly8gRm9yIHNvbWUgcmVhc29uIGB0aGlzLmNhY2hlYCBhdCB0aGlzIHBvaW50IGlzIGFjdHVhbGx5IGBNYXA8c3RyaW5nLCBBcnJheTxzdHJpbmc+PmBcclxuXHRcdFx0Zm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy5jYWNoZSkge1xyXG5cdFx0XHRcdHRoaXMuY2FjaGUuc2V0KGssIG5ldyBTZXQodikpXHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblxyXG5cclxuXHRhc3luYyBsb2FkUGFja2FnZUNhY2hlKCkge1xyXG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcclxuXHRcdGlmICghZnMuZXhpc3RzU3luYyhjYWNoZUZvbGRlclBhcmVudFBhdGgpKSB7XHJcblx0XHRcdGZzLm1rZGlyU3luYyhjYWNoZUZvbGRlclBhcmVudFBhdGgpO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoID0gcGF0aC5qb2luKGNhY2hlRm9sZGVyUGFyZW50UGF0aCwgXCJwYWNrYWdlLWNhY2hlXCIpO1xyXG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCkpIHtcclxuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XHJcblx0XHR9XHJcblx0XHRjb25zb2xlLmxvZyhcIlN3aWZ0TGFUZVg6IExvYWRpbmcgcGFja2FnZSBjYWNoZVwiKTtcclxuXHJcblx0XHQvLyBhZGQgZmlsZXMgaW4gdGhlIHBhY2thZ2UgY2FjaGUgZm9sZGVyIHRvIHRoZSBjYWNoZSBsaXN0XHJcblx0XHRjb25zdCBwYWNrYWdlRmlsZXMgPSBmcy5yZWFkZGlyU3luYyh0aGlzLnBhY2thZ2VDYWNoZUZvbGRlclBhdGgpO1xyXG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIHBhY2thZ2VGaWxlcykge1xyXG5cdFx0XHRjb25zdCBmaWxlbmFtZSA9IHBhdGguYmFzZW5hbWUoZmlsZSk7XHJcblx0XHRcdGNvbnN0IHZhbHVlID0gXCIvdGV4L1wiK2ZpbGVuYW1lO1xyXG5cdFx0XHRjb25zdCBwYWNrYWdlVmFsdWVzID0gT2JqZWN0LnZhbHVlcyh0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVsxXSk7XHJcblx0XHRcdGlmICghcGFja2FnZVZhbHVlcy5pbmNsdWRlcyh2YWx1ZSkpIHtcclxuXHRcdFx0XHRjb25zdCBrZXkgPSBcIjI2L1wiICsgZmlsZW5hbWVcclxuXHRcdFx0XHR0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVsxXVtrZXldID0gdmFsdWU7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdC8vIG1vdmUgcGFja2FnZXMgdG8gdGhlIFZGU1xyXG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWxdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMuc2V0dGluZ3MucGFja2FnZUNhY2hlWzFdKSkge1xyXG5cdFx0XHRjb25zdCBmaWxlbmFtZSA9IHBhdGguYmFzZW5hbWUodmFsKTtcclxuXHRcdFx0bGV0IHJlYWRfc3VjY2VzcyA9IGZhbHNlO1xyXG5cdFx0XHR0cnkge1xyXG5cdFx0XHRcdGNvbnN0IHNyY2NvZGUgPSBmcy5yZWFkRmlsZVN5bmMocGF0aC5qb2luKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCwgZmlsZW5hbWUpKTtcclxuXHRcdFx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZVRleEZTRmlsZShmaWxlbmFtZSwgc3JjY29kZSk7XHJcblx0XHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0XHQvLyB3aGVuIHVuYWJsZSB0byByZWFkIGZpbGUsIHJlbW92ZSB0aGlzIGZyb20gdGhlIGNhY2hlXHJcblx0XHRcdFx0Y29uc29sZS5sb2coYFVuYWJsZSB0byByZWFkIGZpbGUgJHtmaWxlbmFtZX0gZnJvbSBwYWNrYWdlIGNhY2hlYClcclxuXHRcdFx0XHRkZWxldGUgdGhpcy5zZXR0aW5ncy5wYWNrYWdlQ2FjaGVbMV1ba2V5XTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdC8vIHdyaXRlIGNhY2hlIGRhdGEgdG8gdGhlIFZGUywgZXhjZXB0IGRvbid0IHdyaXRlIHRoZSB0ZXhsaXZlNDA0X2NhY2hlIGJlY2F1c2UgdGhpcyB3aWxsIGNhdXNlIHByb2JsZW1zIHdoZW4gc3dpdGNoaW5nIGJldHdlZW4gdGV4bGl2ZSBzb3VyY2VzXHJcblx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZUNhY2hlRGF0YSh7fSxcclxuXHRcdFx0dGhpcy5zZXR0aW5ncy5wYWNrYWdlQ2FjaGVbMV0sXHJcblx0XHRcdHRoaXMuc2V0dGluZ3MucGFja2FnZUNhY2hlWzJdLFxyXG5cdFx0XHR0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVszXSk7XHJcblx0fVxyXG5cclxuXHR1bmxvYWRDYWNoZSgpIHtcclxuXHRcdGZzLnJtZGlyU3luYyh0aGlzLmNhY2hlRm9sZGVyUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcblx0fVxyXG5cclxuXHRhZGRTeW50YXhIaWdobGlnaHRpbmcoKSB7XHJcblx0XHQvLyBAdHMtaWdub3JlXHJcblx0XHR3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5wdXNoKHtuYW1lOiBcImxhdGV4c3ZnXCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XHJcblx0fVxyXG5cclxuXHRmb3JtYXRMYXRleFNvdXJjZShzb3VyY2U6IHN0cmluZykge1xyXG5cdFx0cmV0dXJuIHNvdXJjZTtcclxuXHR9XHJcblxyXG5cdGhhc2hMYXRleFNvdXJjZShzb3VyY2U6IHN0cmluZykge1xyXG5cdFx0cmV0dXJuIE1kNS5oYXNoU3RyKHNvdXJjZS50cmltKCkpO1xyXG5cdH1cclxuXHJcblx0YXN5bmMgcGRmVG9IdG1sKHBkZkRhdGE6IGFueSkge1xyXG5cdFx0Y29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gYXdhaXQgdGhpcy5nZXRQZGZEaW1lbnNpb25zKHBkZkRhdGEpO1xyXG5cdFx0Y29uc3QgcmF0aW8gPSB3aWR0aCAvIGhlaWdodDtcclxuXHRcdGNvbnN0IHBkZmJsb2IgPSBuZXcgQmxvYihbcGRmRGF0YV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL3BkZicgfSk7XHJcblx0XHRjb25zdCBvYmplY3RVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKHBkZmJsb2IpO1xyXG5cdFx0cmV0dXJuICB7XHJcblx0XHRcdGF0dHI6IHtcclxuXHRcdFx0ICBkYXRhOiBgJHtvYmplY3RVUkx9I3ZpZXc9Rml0SCZ0b29sYmFyPTBgLFxyXG5cdFx0XHQgIHR5cGU6ICdhcHBsaWNhdGlvbi9wZGYnLFxyXG5cdFx0XHQgIGNsYXNzOiAnYmxvY2stbGFudWFnZS1sYXRleCcsXHJcblx0XHRcdCAgc3R5bGU6IGB3aWR0aDoxMDAlOyBhc3BlY3QtcmF0aW86JHtyYXRpb31gXHJcblx0XHRcdH1cclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRzdmdUb0h0bWwoc3ZnOiBhbnkpIHtcclxuXHRcdGlmICh0aGlzLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpIHtcclxuXHRcdFx0c3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiBzdmc7XHJcblx0fVxyXG5cdFxyXG5cdGFzeW5jIGdldFBkZkRpbWVuc2lvbnMocGRmOiBhbnkpOiBQcm9taXNlPHt3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcn0+IHtcclxuXHRcdGNvbnN0IHBkZkRvYyA9IGF3YWl0IFBERkRvY3VtZW50LmxvYWQocGRmKTtcclxuXHRcdGNvbnN0IGZpcnN0UGFnZSA9IHBkZkRvYy5nZXRQYWdlcygpWzBdO1xyXG5cdFx0Y29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gZmlyc3RQYWdlLmdldFNpemUoKTtcclxuXHRcdHJldHVybiB7d2lkdGgsIGhlaWdodH07XHJcblx0fVxyXG5cclxuXHRwZGZUb1NWRyhwZGZEYXRhOiBhbnkpIHtcclxuXHRcdHJldHVybiBQZGZUb0NhaXJvKCkudGhlbigocGRmdG9jYWlybzogYW55KSA9PiB7XHJcblx0XHRcdHBkZnRvY2Fpcm8uRlMud3JpdGVGaWxlKCdpbnB1dC5wZGYnLCBwZGZEYXRhKTtcclxuXHRcdFx0cGRmdG9jYWlyby5fY29udmVydFBkZlRvU3ZnKCk7XHJcblx0XHRcdGxldCBzdmcgPSBwZGZ0b2NhaXJvLkZTLnJlYWRGaWxlKCdpbnB1dC5zdmcnLCB7ZW5jb2Rpbmc6J3V0ZjgnfSk7XHJcblxyXG5cdFx0XHQvLyBHZW5lcmF0ZSBhIHVuaXF1ZSBJRCBmb3IgZWFjaCBTVkcgdG8gYXZvaWQgY29uZmxpY3RzXHJcblx0XHRcdGNvbnN0IGlkID0gTWQ1Lmhhc2hTdHIoc3ZnLnRyaW0oKSkudG9TdHJpbmcoKTtcclxuXHRcdFx0Y29uc3QgcmFuZG9tU3RyaW5nID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDEwKTtcclxuXHRcdFx0Y29uc3QgdW5pcXVlSWQgPSBpZC5jb25jYXQocmFuZG9tU3RyaW5nKTtcclxuXHRcdFx0Y29uc3Qgc3Znb0NvbmZpZzogQ29uZmlnID0gIHtcclxuXHRcdFx0XHRwbHVnaW5zOiBbJ3NvcnRBdHRycycsIHsgbmFtZTogJ3ByZWZpeElkcycsIHBhcmFtczogeyBwcmVmaXg6IHVuaXF1ZUlkIH0gfV1cclxuXHRcdFx0fTtcclxuXHRcdFx0c3ZnID0gb3B0aW1pemUoc3ZnLCBzdmdvQ29uZmlnKS5kYXRhOyBcclxuXHJcblx0XHRcdHJldHVybiBzdmc7XHJcblx0fSk7XHJcblx0fVxyXG5cclxuXHRjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcclxuXHRcdC8vIFJlcGxhY2UgdGhlIGNvbG9yIFwiYmxhY2tcIiB3aXRoIGN1cnJlbnRDb2xvciAodGhlIGN1cnJlbnQgdGV4dCBjb2xvcilcclxuXHRcdC8vIHNvIHRoYXQgZGlhZ3JhbSBheGVzLCBldGMgYXJlIHZpc2libGUgaW4gZGFyayBtb2RlXHJcblx0XHQvLyBBbmQgcmVwbGFjZSBcIndoaXRlXCIgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvclxyXG5cclxuXHRcdHN2ZyA9IHN2Zy5yZXBsYWNlKC9yZ2JcXCgwJSwgMCUsIDAlXFwpL2csIFwiY3VycmVudENvbG9yXCIpXHJcblx0XHRcdFx0LnJlcGxhY2UoL3JnYlxcKDEwMCUsIDEwMCUsIDEwMCVcXCkvZywgXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXCIpO1xyXG5cclxuXHRcdHJldHVybiBzdmc7XHJcblx0fVxyXG5cclxuXHJcblx0YXN5bmMgcmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBvdXRwdXRTVkc6IGJvb2xlYW4gPSBmYWxzZSkge1xyXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuXHRcdFx0bGV0IG1kNUhhc2ggPSB0aGlzLmhhc2hMYXRleFNvdXJjZShzb3VyY2UpO1xyXG5cdFx0XHRsZXQgcGRmUGF0aCA9IHBhdGguam9pbih0aGlzLmNhY2hlRm9sZGVyUGF0aCwgYCR7bWQ1SGFzaH0ucGRmYCk7XHJcblxyXG5cdFx0XHQvLyBQREYgZmlsZSBoYXMgYWxyZWFkeSBiZWVuIGNhY2hlZFxyXG5cdFx0XHQvLyBDb3VsZCBoYXZlIGEgY2FzZSB3aGVyZSBwZGZDYWNoZSBoYXMgdGhlIGtleSBidXQgdGhlIGNhY2hlZCBmaWxlIGhhcyBiZWVuIGRlbGV0ZWRcclxuXHRcdFx0aWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlQ2FjaGUgJiYgdGhpcy5jYWNoZS5oYXMobWQ1SGFzaCkgJiYgZnMuZXhpc3RzU3luYyhwZGZQYXRoKSkge1xyXG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKFwiVXNpbmcgY2FjaGVkIFBERjogXCIsIG1kNUhhc2gpO1xyXG5cdFx0XHRcdGxldCBwZGZEYXRhID0gZnMucmVhZEZpbGVTeW5jKHBkZlBhdGgpO1xyXG5cdFx0XHRcdGlmIChvdXRwdXRTVkcpIHtcclxuXHRcdFx0XHRcdHRoaXMucGRmVG9TVkcocGRmRGF0YSkudGhlbigoc3ZnOiBzdHJpbmcpID0+IHsgZWwuaW5uZXJIVE1MID0gdGhpcy5zdmdUb0h0bWwoc3ZnKTt9KVxyXG5cdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHR0aGlzLnBkZlRvSHRtbChwZGZEYXRhKS50aGVuKChodG1sRGF0YSk9PntlbC5jcmVhdGVFbChcIm9iamVjdFwiLCBodG1sRGF0YSk7IHJlc29sdmUoKTt9KTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0dGhpcy5hZGRGaWxlVG9DYWNoZShtZDVIYXNoLCBjdHguc291cmNlUGF0aCk7XHJcblx0XHRcdFx0cmVzb2x2ZSgpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKFwiUmVuZGVyaW5nIFBERjogXCIsIG1kNUhhc2gpO1xyXG5cclxuXHRcdFx0XHR0aGlzLnJlbmRlckxhdGV4VG9QREYoc291cmNlLCBtZDVIYXNoKS50aGVuKChyOiBhbnkpID0+IHtcclxuXHRcdFx0XHRcdGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZUNhY2hlKSB0aGlzLmFkZEZpbGVUb0NhY2hlKG1kNUhhc2gsIGN0eC5zb3VyY2VQYXRoKTtcclxuXHRcdFx0XHRcdGlmIChvdXRwdXRTVkcpIHtcclxuXHRcdFx0XHRcdFx0dGhpcy5wZGZUb1NWRyhyLnBkZikudGhlbigoc3ZnOiBzdHJpbmcpID0+IHsgZWwuaW5uZXJIVE1MID0gdGhpcy5zdmdUb0h0bWwoc3ZnKTt9KVxyXG5cdFx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdFx0dGhpcy5wZGZUb0h0bWwoci5wZGYpLnRoZW4oKGh0bWxEYXRhKT0+e2VsLmNyZWF0ZUVsKFwib2JqZWN0XCIsIGh0bWxEYXRhKTsgcmVzb2x2ZSgpO30pO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZnMud3JpdGVGaWxlU3luYyhwZGZQYXRoLCByLnBkZik7XHJcblx0XHRcdFx0XHRyZXNvbHZlKCk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdCkuY2F0Y2goZXJyID0+IHsgXHJcblx0XHRcdFx0XHRsZXQgZXJyb3JEaXYgPSBlbC5jcmVhdGVFbCgnZGl2JywgeyB0ZXh0OiBgJHtlcnJ9YCwgYXR0cjogeyBjbGFzczogJ2Jsb2NrLWxhdGV4LWVycm9yJyB9IH0pO1xyXG5cdFx0XHRcdFx0cmVqZWN0KGVycik7IFxyXG5cdFx0XHRcdH0pO1x0XHRcdFx0XHJcblx0XHRcdH1cclxuXHRcdH0pLnRoZW4oKCkgPT4geyBcclxuXHRcdFx0dGhpcy5wZGZFbmdpbmUuZmx1c2hDYWNoZSgpO1xyXG5cdFx0XHRpZiAodGhpcy5zZXR0aW5ncy5lbmFibGVDYWNoZSkgc2V0VGltZW91dCgoKSA9PiB0aGlzLmNsZWFuVXBDYWNoZSgpLCAxMDAwKTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0cmVuZGVyTGF0ZXhUb1BERihzb3VyY2U6IHN0cmluZywgbWQ1SGFzaDogc3RyaW5nKSB7XHJcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG5cdFx0XHRzb3VyY2UgPSB0aGlzLmZvcm1hdExhdGV4U291cmNlKHNvdXJjZSk7XHJcblxyXG5cdFx0XHR0ZW1wLm1rZGlyKFwib2JzaWRpYW4tc3dpZnRsYXRleC1yZW5kZXJlclwiLCBhc3luYyAoZXJyLCBkaXJQYXRoKSA9PiB7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRcdGF3YWl0IHdhaXRGb3IoKCkgPT4gdGhpcy5wZGZFbmdpbmUuaXNSZWFkeSgpKTtcclxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcclxuXHRcdFx0XHRcdHJlamVjdChlcnIpO1xyXG5cdFx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0aWYgKGVycikgcmVqZWN0KGVycik7XHJcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUud3JpdGVNZW1GU0ZpbGUoXCJtYWluLnRleFwiLCBzb3VyY2UpO1xyXG5cdFx0XHRcdHRoaXMucGRmRW5naW5lLnNldEVuZ2luZU1haW5GaWxlKFwibWFpbi50ZXhcIik7XHJcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuY29tcGlsZUxhVGVYKCkudGhlbigocjogYW55KSA9PiB7XHJcblx0XHRcdFx0aWYgKHIuc3RhdHVzICE9IDApIHtcclxuXHRcdFx0XHRcdC8vIG1hbmFnZSBsYXRleCBlcnJvcnNcclxuXHRcdFx0XHRcdHJlamVjdChyLmxvZyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdC8vIHVwZGF0ZSB0aGUgbGlzdCBvZiBwYWNrYWdlIGZpbGVzIGluIHRoZSBjYWNoZVxyXG5cdFx0XHRcdHRoaXMuZmV0Y2hQYWNrYWdlQ2FjaGVEYXRhKClcclxuXHRcdFx0XHRyZXNvbHZlKHIpO1xyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHR9KVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRmZXRjaFBhY2thZ2VDYWNoZURhdGEoKTogdm9pZCB7XHJcblx0XHR0aGlzLnBkZkVuZ2luZS5mZXRjaENhY2hlRGF0YSgpLnRoZW4oKHI6IFN0cmluZ01hcFtdKSA9PiB7XHJcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgci5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRcdGlmIChpID09PSAxKSB7IC8vIGN1cnJlbnRseSBvbmx5IGRlYWxpbmcgd2l0aCB0ZXhsaXZlMjAwX2NhY2hlXHJcblx0XHRcdFx0XHQvLyBnZXQgZGlmZnNcclxuXHRcdFx0XHRcdGNvbnN0IG5ld0ZpbGVOYW1lcyA9IHRoaXMuZ2V0TmV3UGFja2FnZUZpbGVOYW1lcyh0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVtpXSwgcltpXSk7XHJcblx0XHRcdFx0XHQvLyBmZXRjaCBuZXcgcGFja2FnZSBmaWxlc1xyXG5cdFx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuZmV0Y2hUZXhGaWxlcyhuZXdGaWxlTmFtZXMsIHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHRcdHRoaXMuc2V0dGluZ3MucGFja2FnZUNhY2hlID0gcjtcclxuXHRcdFx0dGhpcy5zYXZlU2V0dGluZ3MoKS50aGVuKCk7IC8vIGhtbVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRnZXROZXdQYWNrYWdlRmlsZU5hbWVzKG9sZENhY2hlRGF0YTogU3RyaW5nTWFwLCBuZXdDYWNoZURhdGE6IFN0cmluZ01hcCk6IHN0cmluZ1tdIHtcclxuXHRcdC8vIGJhc2VkIG9uIHRoZSBvbGQgYW5kIG5ldyBwYWNrYWdlIGZpbGVzIGluIHBhY2thZ2UgY2FjaGUgZGF0YSxcclxuXHRcdC8vIHJldHVybiB0aGUgbmV3IHBhY2thZ2UgZmlsZXNcclxuXHRcdGxldCBuZXdLZXlzID0gT2JqZWN0LmtleXMobmV3Q2FjaGVEYXRhKS5maWx0ZXIoa2V5ID0+ICEoa2V5IGluIG9sZENhY2hlRGF0YSkpO1xyXG5cdFx0bGV0IG5ld1BhY2thZ2VGaWxlcyA9IG5ld0tleXMubWFwKGtleSA9PiBwYXRoLmJhc2VuYW1lKG5ld0NhY2hlRGF0YVtrZXldKSk7XHRcdFxyXG5cdFx0cmV0dXJuIG5ld1BhY2thZ2VGaWxlcztcclxuXHR9XHJcblxyXG5cdGFzeW5jIHNhdmVDYWNoZSgpIHtcclxuXHRcdGxldCB0ZW1wID0gbmV3IE1hcCgpO1xyXG5cdFx0Zm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy5jYWNoZSkge1xyXG5cdFx0XHR0ZW1wLnNldChrLCBbLi4udl0pXHJcblx0XHR9XHJcblx0XHR0aGlzLnNldHRpbmdzLmNhY2hlID0gWy4uLnRlbXBdO1xyXG5cdFx0YXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcclxuXHJcblx0fVxyXG5cclxuXHRhZGRGaWxlVG9DYWNoZShoYXNoOiBzdHJpbmcsIGZpbGVfcGF0aDogc3RyaW5nKSB7XHJcblx0XHRpZiAoIXRoaXMuY2FjaGUuaGFzKGhhc2gpKSB7XHJcblx0XHRcdHRoaXMuY2FjaGUuc2V0KGhhc2gsIG5ldyBTZXQoKSk7XHJcblx0XHR9XHJcblx0XHR0aGlzLmNhY2hlLmdldChoYXNoKT8uYWRkKGZpbGVfcGF0aCk7XHJcblx0fVxyXG5cclxuXHRhc3luYyBjbGVhblVwQ2FjaGUoKSB7XHJcblx0XHRsZXQgZmlsZV9wYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG5cdFx0Zm9yIChjb25zdCBmcHMgb2YgdGhpcy5jYWNoZS52YWx1ZXMoKSkge1xyXG5cdFx0XHRmb3IgKGNvbnN0IGZwIG9mIGZwcykge1xyXG5cdFx0XHRcdGZpbGVfcGF0aHMuYWRkKGZwKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdGZvciAoY29uc3QgZmlsZV9wYXRoIG9mIGZpbGVfcGF0aHMpIHtcclxuXHRcdFx0bGV0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZV9wYXRoKTtcclxuXHRcdFx0aWYgKGZpbGUgPT0gbnVsbCkge1xyXG5cdFx0XHRcdHRoaXMucmVtb3ZlRmlsZUZyb21DYWNoZShmaWxlX3BhdGgpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVtb3ZlVW51c2VkQ2FjaGVzRm9yRmlsZShmaWxlKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGF3YWl0IHRoaXMuc2F2ZUNhY2hlKCk7XHJcblx0fVxyXG5cclxuXHRhc3luYyByZW1vdmVVbnVzZWRDYWNoZXNGb3JGaWxlKGZpbGU6IFRGaWxlKSB7XHJcblx0XHRsZXQgaGFzaGVzX2luX2ZpbGUgPSBhd2FpdCB0aGlzLmdldExhdGV4SGFzaGVzRnJvbUZpbGUoZmlsZSk7XHJcblx0XHRsZXQgaGFzaGVzX2luX2NhY2hlID0gdGhpcy5nZXRMYXRleEhhc2hlc0Zyb21DYWNoZUZvckZpbGUoZmlsZSk7XHJcblx0XHRmb3IgKGNvbnN0IGhhc2ggb2YgaGFzaGVzX2luX2NhY2hlKSB7XHJcblx0XHRcdGlmICghaGFzaGVzX2luX2ZpbGUuY29udGFpbnMoaGFzaCkpIHtcclxuXHRcdFx0XHR0aGlzLmNhY2hlLmdldChoYXNoKT8uZGVsZXRlKGZpbGUucGF0aCk7XHJcblx0XHRcdFx0aWYgKHRoaXMuY2FjaGUuZ2V0KGhhc2gpPy5zaXplID09IDApIHtcclxuXHRcdFx0XHRcdHRoaXMucmVtb3ZlUERGRnJvbUNhY2hlKGhhc2gpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cmVtb3ZlUERGRnJvbUNhY2hlKGtleTogc3RyaW5nKSB7XHJcblx0XHR0aGlzLmNhY2hlLmRlbGV0ZShrZXkpO1xyXG5cdFx0ZnMucm1TeW5jKHBhdGguam9pbih0aGlzLmNhY2hlRm9sZGVyUGF0aCwgYCR7a2V5fS5wZGZgKSk7XHJcblx0fVxyXG5cclxuXHRyZW1vdmVGaWxlRnJvbUNhY2hlKGZpbGVfcGF0aDogc3RyaW5nKSB7XHJcblx0XHRmb3IgKGNvbnN0IGhhc2ggb2YgdGhpcy5jYWNoZS5rZXlzKCkpIHtcclxuXHRcdFx0dGhpcy5jYWNoZS5nZXQoaGFzaCk/LmRlbGV0ZShmaWxlX3BhdGgpO1xyXG5cdFx0XHRpZiAodGhpcy5jYWNoZS5nZXQoaGFzaCk/LnNpemUgPT0gMCkge1xyXG5cdFx0XHRcdHRoaXMucmVtb3ZlUERGRnJvbUNhY2hlKGhhc2gpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRnZXRMYXRleEhhc2hlc0Zyb21DYWNoZUZvckZpbGUoZmlsZTogVEZpbGUpIHtcclxuXHRcdGxldCBoYXNoZXM6IHN0cmluZ1tdID0gW107XHJcblx0XHRsZXQgcGF0aCA9IGZpbGUucGF0aDtcclxuXHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMuY2FjaGUuZW50cmllcygpKSB7XHJcblx0XHRcdGlmICh2LmhhcyhwYXRoKSkge1xyXG5cdFx0XHRcdGhhc2hlcy5wdXNoKGspO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gaGFzaGVzO1xyXG5cdH1cclxuXHJcblx0YXN5bmMgZ2V0TGF0ZXhIYXNoZXNGcm9tRmlsZShmaWxlOiBURmlsZSkge1xyXG5cdFx0bGV0IGhhc2hlczogc3RyaW5nW10gPSBbXTtcclxuXHRcdGxldCBzZWN0aW9ucyA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5zZWN0aW9uc1xyXG5cdFx0aWYgKHNlY3Rpb25zICE9IHVuZGVmaW5lZCkge1xyXG5cdFx0XHRsZXQgbGluZXMgPSAoYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKSkuc3BsaXQoJ1xcbicpO1xyXG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2Ygc2VjdGlvbnMpIHtcclxuXHRcdFx0XHRpZiAoc2VjdGlvbi50eXBlICE9IFwiY29kZVwiICYmIGxpbmVzW3NlY3Rpb24ucG9zaXRpb24uc3RhcnQubGluZV0ubWF0Y2goXCJgYGAgKmxhdGV4XCIpID09IG51bGwpIGNvbnRpbnVlO1xyXG5cdFx0XHRcdGxldCBzb3VyY2UgPSBsaW5lcy5zbGljZShzZWN0aW9uLnBvc2l0aW9uLnN0YXJ0LmxpbmUgKyAxLCBzZWN0aW9uLnBvc2l0aW9uLmVuZC5saW5lKS5qb2luKFwiXFxuXCIpO1xyXG5cdFx0XHRcdGxldCBoYXNoID0gdGhpcy5oYXNoTGF0ZXhTb3VyY2Uoc291cmNlKTtcclxuXHRcdFx0XHRoYXNoZXMucHVzaChoYXNoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGhhc2hlcztcclxuXHR9XHJcbn1cclxuIl19