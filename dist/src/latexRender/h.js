import { FileSystemAdapter, TFile, MarkdownPreviewRenderer } from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
import { PdfTeXEngine } from './PdfTeXEngine.js';
import { PDFDocument } from 'pdf-lib';
const PdfToCairo = require("./pdftocairo.js");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9sYXRleFJlbmRlci9oLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBTyxpQkFBaUIsRUFBaUYsS0FBSyxFQUF5Qix1QkFBdUIsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN4TCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sRUFBQyxZQUFZLEVBQUMsTUFBTSxtQkFBbUIsQ0FBQztBQUMvQyxPQUFPLEVBQUMsV0FBVyxFQUFDLE1BQU0sU0FBUyxDQUFDO0FBQ3BDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFBO0FBQzdDLE9BQU8sRUFBQyxRQUFRLEVBQVMsTUFBTSxNQUFNLENBQUM7QUFhdEMsTUFBTSxnQkFBZ0IsR0FBNkI7SUFDbEQsV0FBVyxFQUFFLGtDQUFrQztJQUMvQyxPQUFPLEVBQUUsS0FBSztJQUNkLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLHNCQUFzQixFQUFFLElBQUk7SUFDNUIsS0FBSyxFQUFFLEVBQUU7SUFDVCxZQUFZLEVBQUUsQ0FBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7SUFDM0IsdUJBQXVCLEVBQUUsS0FBSztDQUM5QixDQUFBO0FBS0QsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLFFBQXVCLEVBQUUsRUFBRTtJQUNqRCxPQUFPLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDbkMsSUFBSSxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxDQUFDO1FBQ1QsQ0FBQzthQUNJLENBQUM7WUFDUCxVQUFVLENB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QkFDeEMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztDQUNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBGaWxlU3lzdGVtQWRhcHRlciwgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZWN0aW9uQ2FjaGUsIFNldHRpbmcsIFRGaWxlLCBURm9sZGVyLCBNYXJrZG93blZpZXcsIE1hcmtkb3duUHJldmlld1JlbmRlcmVyIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgTWQ1IH0gZnJvbSAndHMtbWQ1JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHRlbXAgZnJvbSAndGVtcCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHtQZGZUZVhFbmdpbmV9IGZyb20gJy4vUGRmVGVYRW5naW5lLmpzJztcbmltcG9ydCB7UERGRG9jdW1lbnR9IGZyb20gJ3BkZi1saWInO1xuY29uc3QgUGRmVG9DYWlybyA9IHJlcXVpcmUoXCIuL3BkZnRvY2Fpcm8uanNcIilcbmltcG9ydCB7b3B0aW1pemUsQ29uZmlnIH0gZnJvbSAnc3Znbyc7XG5pbXBvcnQgTW9zaGUgZnJvbSAnc3JjL21haW4uanMnO1xuXG5pbnRlcmZhY2UgU3dpZnRsYXRleFJlbmRlclNldHRpbmdzIHtcblx0cGFja2FnZV91cmw6IHN0cmluZyxcblx0dGltZW91dDogbnVtYmVyLFxuXHRlbmFibGVDYWNoZTogYm9vbGVhbixcblx0aW52ZXJ0Q29sb3JzSW5EYXJrTW9kZTogYm9vbGVhbjtcblx0Y2FjaGU6IEFycmF5PFtzdHJpbmcsIFNldDxzdHJpbmc+XT47XG5cdHBhY2thZ2VDYWNoZTogQXJyYXk8U3RyaW5nTWFwPjtcblx0b25seVJlbmRlckluUmVhZGluZ01vZGU6IGJvb2xlYW47XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFN3aWZ0bGF0ZXhSZW5kZXJTZXR0aW5ncyA9IHtcblx0cGFja2FnZV91cmw6IGBodHRwczovL3RleGxpdmUyLnN3aWZ0bGF0ZXguY29tL2AsXG5cdHRpbWVvdXQ6IDEwMDAwLFxuXHRlbmFibGVDYWNoZTogdHJ1ZSxcblx0aW52ZXJ0Q29sb3JzSW5EYXJrTW9kZTogdHJ1ZSxcblx0Y2FjaGU6IFtdLFxuXHRwYWNrYWdlQ2FjaGU6IFt7fSx7fSx7fSx7fV0sXG5cdG9ubHlSZW5kZXJJblJlYWRpbmdNb2RlOiBmYWxzZSxcbn1cblxudHlwZSBTdHJpbmdNYXAgPSB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuXG5cbmNvbnN0IHdhaXRGb3IgPSBhc3luYyAoY29uZEZ1bmM6ICgpID0+IGJvb2xlYW4pID0+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG5cdCAgaWYgKGNvbmRGdW5jKCkpIHtcblx0XHRyZXNvbHZlKCk7XG5cdCAgfVxuXHQgIGVsc2Uge1xuXHRcdHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuXHRcdCAgYXdhaXQgd2FpdEZvcihjb25kRnVuYyk7XG5cdFx0ICByZXNvbHZlKCk7XG5cdFx0fSwgMTAwKTtcblx0ICB9XG5cdH0pO1xuICB9O1xuICBcblxuZXhwb3J0IGNsYXNzIFN3aWZ0bGF0ZXhSZW5kZXIge1xuXHRzZXR0aW5nczogU3dpZnRsYXRleFJlbmRlclNldHRpbmdzO1xuXHRjYWNoZUZvbGRlclBhdGg6IHN0cmluZztcblx0cGFja2FnZUNhY2hlRm9sZGVyUGF0aDogc3RyaW5nO1xuXHRwbHVnaW5Gb2xkZXJQYXRoOiBzdHJpbmc7XG5cdHBkZkVuZ2luZTogYW55O1xuXHRhcHA6IEFwcDtcblx0cGx1Z2luOiBNb3NoZTtcblx0Y2FjaGU6IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PjsgLy8gS2V5OiBtZDUgaGFzaCBvZiBsYXRleCBzb3VyY2UuIFZhbHVlOiBTZXQgb2YgZmlsZSBwYXRoIG5hbWVzLlxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBNb3NoZSkge1xuXHRcdHRoaXMuYXBwPXRoaXMuYXBwO1xuXHRcdHRoaXMucGx1Z2luPXRoaXMucGx1Z2luO1xuXHR9XG5cdGFzeW5jIG9ubG9hZCgpIHtcblx0XHRhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuXHRcdGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZUNhY2hlKSBhd2FpdCB0aGlzLmxvYWRDYWNoZSgpO1xuXHRcdHRoaXMucGx1Z2luRm9sZGVyUGF0aCA9IHBhdGguam9pbih0aGlzLmdldFZhdWx0UGF0aCgpLCB0aGlzLmFwcC52YXVsdC5jb25maWdEaXIsIFwicGx1Z2lucy9zd2lmdGxhdGV4LXJlbmRlci9cIik7XG5cdFx0Ly8gaW5pdGlhbGl6ZSB0aGUgbGF0ZXggY29tcGlsZXJcblx0XHR0aGlzLnBkZkVuZ2luZSA9IG5ldyBQZGZUZVhFbmdpbmUoKTtcblx0XHRhd2FpdCB0aGlzLnBkZkVuZ2luZS5sb2FkRW5naW5lKCk7XG5cdFx0YXdhaXQgdGhpcy5sb2FkUGFja2FnZUNhY2hlKCk7XG5cdFx0dGhpcy5wZGZFbmdpbmUuc2V0VGV4bGl2ZUVuZHBvaW50KHRoaXMuc2V0dGluZ3MucGFja2FnZV91cmwpO1xuXG5cdFx0dGhpcy5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5vbmx5UmVuZGVySW5SZWFkaW5nTW9kZSkge1xuXHRcdFx0Y29uc3QgcGRmQmxvY2tQcm9jZXNzb3IgPSBNYXJrZG93blByZXZpZXdSZW5kZXJlci5jcmVhdGVDb2RlQmxvY2tQb3N0UHJvY2Vzc29yKFwibGF0ZXhcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIGZhbHNlKSk7XG5cdFx0XHRNYXJrZG93blByZXZpZXdSZW5kZXJlci5yZWdpc3RlclBvc3RQcm9jZXNzb3IocGRmQmxvY2tQcm9jZXNzb3IpO1xuXHRcdFx0Y29uc3Qgc3ZnQmxvY2tQcm9jZXNzb3IgPSBNYXJrZG93blByZXZpZXdSZW5kZXJlci5jcmVhdGVDb2RlQmxvY2tQb3N0UHJvY2Vzc29yKFwibGF0ZXhzdmdcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIHRydWUpKTtcblx0XHRcdE1hcmtkb3duUHJldmlld1JlbmRlcmVyLnJlZ2lzdGVyUG9zdFByb2Nlc3NvcihzdmdCbG9ja1Byb2Nlc3Nvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJsYXRleFwiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB0aGlzLnJlbmRlckxhdGV4VG9FbGVtZW50KHNvdXJjZSwgZWwsIGN0eCwgZmFsc2UpKTtcblx0XHRcdHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJsYXRleHN2Z1wiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB0aGlzLnJlbmRlckxhdGV4VG9FbGVtZW50KHNvdXJjZSwgZWwsIGN0eCwgdHJ1ZSkpO1xuXHRcdH1cblx0fVxuXG5cdG9udW5sb2FkKCkge1xuXHRcdGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZUNhY2hlKSB0aGlzLnVubG9hZENhY2hlKCk7XG5cdH1cblxuXHRhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMucGx1Z2luLmxvYWREYXRhKCkpO1xuXHR9XG5cblxuXHRhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG5cdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG5cdH1cblxuXHRnZXRWYXVsdFBhdGgoKSB7XG5cdFx0aWYgKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIgaW5zdGFuY2VvZiBGaWxlU3lzdGVtQWRhcHRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZ2V0QmFzZVBhdGgoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiU3dpZnRMYVRlWDogQ291bGQgbm90IGdldCB2YXVsdCBwYXRoLlwiKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2FkQ2FjaGUoKSB7XG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMuY2FjaGVGb2xkZXJQYXRoID0gcGF0aC5qb2luKGNhY2hlRm9sZGVyUGFyZW50UGF0aCwgXCJwZGYtY2FjaGVcIik7XG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoKTtcblx0XHRcdHRoaXMuY2FjaGUgPSBuZXcgTWFwKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2FjaGUgPSBuZXcgTWFwKHRoaXMuc2V0dGluZ3MuY2FjaGUpO1xuXHRcdFx0Ly8gRm9yIHNvbWUgcmVhc29uIGB0aGlzLmNhY2hlYCBhdCB0aGlzIHBvaW50IGlzIGFjdHVhbGx5IGBNYXA8c3RyaW5nLCBBcnJheTxzdHJpbmc+PmBcblx0XHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMuY2FjaGUpIHtcblx0XHRcdFx0dGhpcy5jYWNoZS5zZXQoaywgbmV3IFNldCh2KSlcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGFzeW5jIGxvYWRQYWNrYWdlQ2FjaGUoKSB7XG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCA9IHBhdGguam9pbihjYWNoZUZvbGRlclBhcmVudFBhdGgsIFwicGFja2FnZS1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0fVxuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBwYWNrYWdlIGNhY2hlXCIpO1xuXG5cdFx0Ly8gYWRkIGZpbGVzIGluIHRoZSBwYWNrYWdlIGNhY2hlIGZvbGRlciB0byB0aGUgY2FjaGUgbGlzdFxuXHRcdGNvbnN0IHBhY2thZ2VGaWxlcyA9IGZzLnJlYWRkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIHBhY2thZ2VGaWxlcykge1xuXHRcdFx0Y29uc3QgZmlsZW5hbWUgPSBwYXRoLmJhc2VuYW1lKGZpbGUpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBcIi90ZXgvXCIrZmlsZW5hbWU7XG5cdFx0XHRjb25zdCBwYWNrYWdlVmFsdWVzID0gT2JqZWN0LnZhbHVlcyh0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVsxXSk7XG5cdFx0XHRpZiAoIXBhY2thZ2VWYWx1ZXMuaW5jbHVkZXModmFsdWUpKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IFwiMjYvXCIgKyBmaWxlbmFtZVxuXHRcdFx0XHR0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVsxXVtrZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIG1vdmUgcGFja2FnZXMgdG8gdGhlIFZGU1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVsxXSkpIHtcblx0XHRcdGNvbnN0IGZpbGVuYW1lID0gcGF0aC5iYXNlbmFtZSh2YWwpO1xuXHRcdFx0bGV0IHJlYWRfc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3JjY29kZSA9IGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoLCBmaWxlbmFtZSkpO1xuXHRcdFx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZVRleEZTRmlsZShmaWxlbmFtZSwgc3JjY29kZSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIHdoZW4gdW5hYmxlIHRvIHJlYWQgZmlsZSwgcmVtb3ZlIHRoaXMgZnJvbSB0aGUgY2FjaGVcblx0XHRcdFx0Y29uc29sZS5sb2coYFVuYWJsZSB0byByZWFkIGZpbGUgJHtmaWxlbmFtZX0gZnJvbSBwYWNrYWdlIGNhY2hlYClcblx0XHRcdFx0ZGVsZXRlIHRoaXMuc2V0dGluZ3MucGFja2FnZUNhY2hlWzFdW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gd3JpdGUgY2FjaGUgZGF0YSB0byB0aGUgVkZTLCBleGNlcHQgZG9uJ3Qgd3JpdGUgdGhlIHRleGxpdmU0MDRfY2FjaGUgYmVjYXVzZSB0aGlzIHdpbGwgY2F1c2UgcHJvYmxlbXMgd2hlbiBzd2l0Y2hpbmcgYmV0d2VlbiB0ZXhsaXZlIHNvdXJjZXNcblx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZUNhY2hlRGF0YSh7fSxcblx0XHRcdHRoaXMuc2V0dGluZ3MucGFja2FnZUNhY2hlWzFdLFxuXHRcdFx0dGhpcy5zZXR0aW5ncy5wYWNrYWdlQ2FjaGVbMl0sXG5cdFx0XHR0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVszXSk7XG5cdH1cblxuXHR1bmxvYWRDYWNoZSgpIHtcblx0XHRmcy5ybWRpclN5bmModGhpcy5jYWNoZUZvbGRlclBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHR9XG5cblx0YWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuXHRcdC8vIEB0cy1pZ25vcmVcblx0XHR3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5wdXNoKHtuYW1lOiBcImxhdGV4c3ZnXCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XG5cdH1cblxuXHRmb3JtYXRMYXRleFNvdXJjZShzb3VyY2U6IHN0cmluZykge1xuXHRcdHJldHVybiBzb3VyY2U7XG5cdH1cblxuXHRoYXNoTGF0ZXhTb3VyY2Uoc291cmNlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gTWQ1Lmhhc2hTdHIoc291cmNlLnRyaW0oKSk7XG5cdH1cblxuXHRhc3luYyBwZGZUb0h0bWwocGRmRGF0YTogYW55KSB7XG5cdFx0Y29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gYXdhaXQgdGhpcy5nZXRQZGZEaW1lbnNpb25zKHBkZkRhdGEpO1xuXHRcdGNvbnN0IHJhdGlvID0gd2lkdGggLyBoZWlnaHQ7XG5cdFx0Y29uc3QgcGRmYmxvYiA9IG5ldyBCbG9iKFtwZGZEYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vcGRmJyB9KTtcblx0XHRjb25zdCBvYmplY3RVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKHBkZmJsb2IpO1xuXHRcdHJldHVybiAge1xuXHRcdFx0YXR0cjoge1xuXHRcdFx0ICBkYXRhOiBgJHtvYmplY3RVUkx9I3ZpZXc9Rml0SCZ0b29sYmFyPTBgLFxuXHRcdFx0ICB0eXBlOiAnYXBwbGljYXRpb24vcGRmJyxcblx0XHRcdCAgY2xhc3M6ICdibG9jay1sYW51YWdlLWxhdGV4Jyxcblx0XHRcdCAgc3R5bGU6IGB3aWR0aDoxMDAlOyBhc3BlY3QtcmF0aW86JHtyYXRpb31gXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHN2Z1RvSHRtbChzdmc6IGFueSkge1xuXHRcdGlmICh0aGlzLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpIHtcblx0XHRcdHN2ZyA9IHRoaXMuY29sb3JTVkdpbkRhcmtNb2RlKHN2Zyk7XG5cdFx0fVxuXHRcdHJldHVybiBzdmc7XG5cdH1cblx0XG5cdGFzeW5jIGdldFBkZkRpbWVuc2lvbnMocGRmOiBhbnkpOiBQcm9taXNlPHt3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcn0+IHtcblx0XHRjb25zdCBwZGZEb2MgPSBhd2FpdCBQREZEb2N1bWVudC5sb2FkKHBkZik7XG5cdFx0Y29uc3QgZmlyc3RQYWdlID0gcGRmRG9jLmdldFBhZ2VzKClbMF07XG5cdFx0Y29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gZmlyc3RQYWdlLmdldFNpemUoKTtcblx0XHRyZXR1cm4ge3dpZHRoLCBoZWlnaHR9O1xuXHR9XG5cblx0cGRmVG9TVkcocGRmRGF0YTogYW55KSB7XG5cdFx0cmV0dXJuIFBkZlRvQ2Fpcm8oKS50aGVuKChwZGZ0b2NhaXJvOiBhbnkpID0+IHtcblx0XHRcdHBkZnRvY2Fpcm8uRlMud3JpdGVGaWxlKCdpbnB1dC5wZGYnLCBwZGZEYXRhKTtcblx0XHRcdHBkZnRvY2Fpcm8uX2NvbnZlcnRQZGZUb1N2ZygpO1xuXHRcdFx0bGV0IHN2ZyA9IHBkZnRvY2Fpcm8uRlMucmVhZEZpbGUoJ2lucHV0LnN2ZycsIHtlbmNvZGluZzondXRmOCd9KTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSB1bmlxdWUgSUQgZm9yIGVhY2ggU1ZHIHRvIGF2b2lkIGNvbmZsaWN0c1xuXHRcdFx0Y29uc3QgaWQgPSBNZDUuaGFzaFN0cihzdmcudHJpbSgpKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgcmFuZG9tU3RyaW5nID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDEwKTtcblx0XHRcdGNvbnN0IHVuaXF1ZUlkID0gaWQuY29uY2F0KHJhbmRvbVN0cmluZyk7XG5cdFx0XHRjb25zdCBzdmdvQ29uZmlnOiBDb25maWcgPSAge1xuXHRcdFx0XHRwbHVnaW5zOiBbJ3NvcnRBdHRycycsIHsgbmFtZTogJ3ByZWZpeElkcycsIHBhcmFtczogeyBwcmVmaXg6IHVuaXF1ZUlkIH0gfV1cblx0XHRcdH07XG5cdFx0XHRzdmcgPSBvcHRpbWl6ZShzdmcsIHN2Z29Db25maWcpLmRhdGE7IFxuXG5cdFx0XHRyZXR1cm4gc3ZnO1xuXHR9KTtcblx0fVxuXG5cdGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xuXHRcdC8vIFJlcGxhY2UgdGhlIGNvbG9yIFwiYmxhY2tcIiB3aXRoIGN1cnJlbnRDb2xvciAodGhlIGN1cnJlbnQgdGV4dCBjb2xvcilcblx0XHQvLyBzbyB0aGF0IGRpYWdyYW0gYXhlcywgZXRjIGFyZSB2aXNpYmxlIGluIGRhcmsgbW9kZVxuXHRcdC8vIEFuZCByZXBsYWNlIFwid2hpdGVcIiB3aXRoIHRoZSBiYWNrZ3JvdW5kIGNvbG9yXG5cblx0XHRzdmcgPSBzdmcucmVwbGFjZSgvcmdiXFwoMCUsIDAlLCAwJVxcKS9nLCBcImN1cnJlbnRDb2xvclwiKVxuXHRcdFx0XHQucmVwbGFjZSgvcmdiXFwoMTAwJSwgMTAwJSwgMTAwJVxcKS9nLCBcInZhcigtLWJhY2tncm91bmQtcHJpbWFyeSlcIik7XG5cblx0XHRyZXR1cm4gc3ZnO1xuXHR9XG5cblxuXHRhc3luYyByZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsIG91dHB1dFNWRzogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxldCBtZDVIYXNoID0gdGhpcy5oYXNoTGF0ZXhTb3VyY2Uoc291cmNlKTtcblx0XHRcdGxldCBwZGZQYXRoID0gcGF0aC5qb2luKHRoaXMuY2FjaGVGb2xkZXJQYXRoLCBgJHttZDVIYXNofS5wZGZgKTtcblxuXHRcdFx0Ly8gUERGIGZpbGUgaGFzIGFscmVhZHkgYmVlbiBjYWNoZWRcblx0XHRcdC8vIENvdWxkIGhhdmUgYSBjYXNlIHdoZXJlIHBkZkNhY2hlIGhhcyB0aGUga2V5IGJ1dCB0aGUgY2FjaGVkIGZpbGUgaGFzIGJlZW4gZGVsZXRlZFxuXHRcdFx0aWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlQ2FjaGUgJiYgdGhpcy5jYWNoZS5oYXMobWQ1SGFzaCkgJiYgZnMuZXhpc3RzU3luYyhwZGZQYXRoKSkge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZyhcIlVzaW5nIGNhY2hlZCBQREY6IFwiLCBtZDVIYXNoKTtcblx0XHRcdFx0bGV0IHBkZkRhdGEgPSBmcy5yZWFkRmlsZVN5bmMocGRmUGF0aCk7XG5cdFx0XHRcdGlmIChvdXRwdXRTVkcpIHtcblx0XHRcdFx0XHR0aGlzLnBkZlRvU1ZHKHBkZkRhdGEpLnRoZW4oKHN2Zzogc3RyaW5nKSA9PiB7IGVsLmlubmVySFRNTCA9IHRoaXMuc3ZnVG9IdG1sKHN2Zyk7fSlcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnBkZlRvSHRtbChwZGZEYXRhKS50aGVuKChodG1sRGF0YSk9PntlbC5jcmVhdGVFbChcIm9iamVjdFwiLCBodG1sRGF0YSk7IHJlc29sdmUoKTt9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmFkZEZpbGVUb0NhY2hlKG1kNUhhc2gsIGN0eC5zb3VyY2VQYXRoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKFwiUmVuZGVyaW5nIFBERjogXCIsIG1kNUhhc2gpO1xuXG5cdFx0XHRcdHRoaXMucmVuZGVyTGF0ZXhUb1BERihzb3VyY2UsIG1kNUhhc2gpLnRoZW4oKHI6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZUNhY2hlKSB0aGlzLmFkZEZpbGVUb0NhY2hlKG1kNUhhc2gsIGN0eC5zb3VyY2VQYXRoKTtcblx0XHRcdFx0XHRpZiAob3V0cHV0U1ZHKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBkZlRvU1ZHKHIucGRmKS50aGVuKChzdmc6IHN0cmluZykgPT4geyBlbC5pbm5lckhUTUwgPSB0aGlzLnN2Z1RvSHRtbChzdmcpO30pXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMucGRmVG9IdG1sKHIucGRmKS50aGVuKChodG1sRGF0YSk9PntlbC5jcmVhdGVFbChcIm9iamVjdFwiLCBodG1sRGF0YSk7IHJlc29sdmUoKTt9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZnMud3JpdGVGaWxlU3luYyhwZGZQYXRoLCByLnBkZik7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdCkuY2F0Y2goZXJyID0+IHsgXG5cdFx0XHRcdFx0bGV0IGVycm9yRGl2ID0gZWwuY3JlYXRlRWwoJ2RpdicsIHsgdGV4dDogYCR7ZXJyfWAsIGF0dHI6IHsgY2xhc3M6ICdibG9jay1sYXRleC1lcnJvcicgfSB9KTtcblx0XHRcdFx0XHRyZWplY3QoZXJyKTsgXG5cdFx0XHRcdH0pO1x0XHRcdFx0XG5cdFx0XHR9XG5cdFx0fSkudGhlbigoKSA9PiB7IFxuXHRcdFx0dGhpcy5wZGZFbmdpbmUuZmx1c2hDYWNoZSgpO1xuXHRcdFx0aWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlQ2FjaGUpIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5jbGVhblVwQ2FjaGUoKSwgMTAwMCk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZW5kZXJMYXRleFRvUERGKHNvdXJjZTogc3RyaW5nLCBtZDVIYXNoOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0c291cmNlID0gdGhpcy5mb3JtYXRMYXRleFNvdXJjZShzb3VyY2UpO1xuXG5cdFx0XHR0ZW1wLm1rZGlyKFwib2JzaWRpYW4tc3dpZnRsYXRleC1yZW5kZXJlclwiLCBhc3luYyAoZXJyLCBkaXJQYXRoKSA9PiB7XG5cdFx0XHRcdFxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHdhaXRGb3IoKCkgPT4gdGhpcy5wZGZFbmdpbmUuaXNSZWFkeSgpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVycikgcmVqZWN0KGVycik7XG5cdFx0XHRcdHRoaXMucGRmRW5naW5lLndyaXRlTWVtRlNGaWxlKFwibWFpbi50ZXhcIiwgc291cmNlKTtcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuc2V0RW5naW5lTWFpbkZpbGUoXCJtYWluLnRleFwiKTtcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuY29tcGlsZUxhVGVYKCkudGhlbigocjogYW55KSA9PiB7XG5cdFx0XHRcdGlmIChyLnN0YXR1cyAhPSAwKSB7XG5cdFx0XHRcdFx0Ly8gbWFuYWdlIGxhdGV4IGVycm9yc1xuXHRcdFx0XHRcdHJlamVjdChyLmxvZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gdXBkYXRlIHRoZSBsaXN0IG9mIHBhY2thZ2UgZmlsZXMgaW4gdGhlIGNhY2hlXG5cdFx0XHRcdHRoaXMuZmV0Y2hQYWNrYWdlQ2FjaGVEYXRhKClcblx0XHRcdFx0cmVzb2x2ZShyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KVxuXHRcdH0pO1xuXHR9XG5cblx0ZmV0Y2hQYWNrYWdlQ2FjaGVEYXRhKCk6IHZvaWQge1xuXHRcdHRoaXMucGRmRW5naW5lLmZldGNoQ2FjaGVEYXRhKCkudGhlbigocjogU3RyaW5nTWFwW10pID0+IHtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgci5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoaSA9PT0gMSkgeyAvLyBjdXJyZW50bHkgb25seSBkZWFsaW5nIHdpdGggdGV4bGl2ZTIwMF9jYWNoZVxuXHRcdFx0XHRcdC8vIGdldCBkaWZmc1xuXHRcdFx0XHRcdGNvbnN0IG5ld0ZpbGVOYW1lcyA9IHRoaXMuZ2V0TmV3UGFja2FnZUZpbGVOYW1lcyh0aGlzLnNldHRpbmdzLnBhY2thZ2VDYWNoZVtpXSwgcltpXSk7XG5cdFx0XHRcdFx0Ly8gZmV0Y2ggbmV3IHBhY2thZ2UgZmlsZXNcblx0XHRcdFx0XHR0aGlzLnBkZkVuZ2luZS5mZXRjaFRleEZpbGVzKG5ld0ZpbGVOYW1lcywgdGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZXR0aW5ncy5wYWNrYWdlQ2FjaGUgPSByO1xuXHRcdFx0dGhpcy5zYXZlU2V0dGluZ3MoKS50aGVuKCk7IC8vIGhtbVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0TmV3UGFja2FnZUZpbGVOYW1lcyhvbGRDYWNoZURhdGE6IFN0cmluZ01hcCwgbmV3Q2FjaGVEYXRhOiBTdHJpbmdNYXApOiBzdHJpbmdbXSB7XG5cdFx0Ly8gYmFzZWQgb24gdGhlIG9sZCBhbmQgbmV3IHBhY2thZ2UgZmlsZXMgaW4gcGFja2FnZSBjYWNoZSBkYXRhLFxuXHRcdC8vIHJldHVybiB0aGUgbmV3IHBhY2thZ2UgZmlsZXNcblx0XHRsZXQgbmV3S2V5cyA9IE9iamVjdC5rZXlzKG5ld0NhY2hlRGF0YSkuZmlsdGVyKGtleSA9PiAhKGtleSBpbiBvbGRDYWNoZURhdGEpKTtcblx0XHRsZXQgbmV3UGFja2FnZUZpbGVzID0gbmV3S2V5cy5tYXAoa2V5ID0+IHBhdGguYmFzZW5hbWUobmV3Q2FjaGVEYXRhW2tleV0pKTtcdFx0XG5cdFx0cmV0dXJuIG5ld1BhY2thZ2VGaWxlcztcblx0fVxuXG5cdGFzeW5jIHNhdmVDYWNoZSgpIHtcblx0XHRsZXQgdGVtcCA9IG5ldyBNYXAoKTtcblx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLmNhY2hlKSB7XG5cdFx0XHR0ZW1wLnNldChrLCBbLi4udl0pXG5cdFx0fVxuXHRcdHRoaXMuc2V0dGluZ3MuY2FjaGUgPSBbLi4udGVtcF07XG5cdFx0YXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcblxuXHR9XG5cblx0YWRkRmlsZVRvQ2FjaGUoaGFzaDogc3RyaW5nLCBmaWxlX3BhdGg6IHN0cmluZykge1xuXHRcdGlmICghdGhpcy5jYWNoZS5oYXMoaGFzaCkpIHtcblx0XHRcdHRoaXMuY2FjaGUuc2V0KGhhc2gsIG5ldyBTZXQoKSk7XG5cdFx0fVxuXHRcdHRoaXMuY2FjaGUuZ2V0KGhhc2gpPy5hZGQoZmlsZV9wYXRoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFuVXBDYWNoZSgpIHtcblx0XHRsZXQgZmlsZV9wYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZnBzIG9mIHRoaXMuY2FjaGUudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3QgZnAgb2YgZnBzKSB7XG5cdFx0XHRcdGZpbGVfcGF0aHMuYWRkKGZwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGZpbGVfcGF0aCBvZiBmaWxlX3BhdGhzKSB7XG5cdFx0XHRsZXQgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlX3BhdGgpO1xuXHRcdFx0aWYgKGZpbGUgPT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUZpbGVGcm9tQ2FjaGUoZmlsZV9wYXRoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlbW92ZVVudXNlZENhY2hlc0ZvckZpbGUoZmlsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5zYXZlQ2FjaGUoKTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZVVudXNlZENhY2hlc0ZvckZpbGUoZmlsZTogVEZpbGUpIHtcblx0XHRsZXQgaGFzaGVzX2luX2ZpbGUgPSBhd2FpdCB0aGlzLmdldExhdGV4SGFzaGVzRnJvbUZpbGUoZmlsZSk7XG5cdFx0bGV0IGhhc2hlc19pbl9jYWNoZSA9IHRoaXMuZ2V0TGF0ZXhIYXNoZXNGcm9tQ2FjaGVGb3JGaWxlKGZpbGUpO1xuXHRcdGZvciAoY29uc3QgaGFzaCBvZiBoYXNoZXNfaW5fY2FjaGUpIHtcblx0XHRcdGlmICghaGFzaGVzX2luX2ZpbGUuY29udGFpbnMoaGFzaCkpIHtcblx0XHRcdFx0dGhpcy5jYWNoZS5nZXQoaGFzaCk/LmRlbGV0ZShmaWxlLnBhdGgpO1xuXHRcdFx0XHRpZiAodGhpcy5jYWNoZS5nZXQoaGFzaCk/LnNpemUgPT0gMCkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlUERGRnJvbUNhY2hlKGhhc2gpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlUERGRnJvbUNhY2hlKGtleTogc3RyaW5nKSB7XG5cdFx0dGhpcy5jYWNoZS5kZWxldGUoa2V5KTtcblx0XHRmcy5ybVN5bmMocGF0aC5qb2luKHRoaXMuY2FjaGVGb2xkZXJQYXRoLCBgJHtrZXl9LnBkZmApKTtcblx0fVxuXG5cdHJlbW92ZUZpbGVGcm9tQ2FjaGUoZmlsZV9wYXRoOiBzdHJpbmcpIHtcblx0XHRmb3IgKGNvbnN0IGhhc2ggb2YgdGhpcy5jYWNoZS5rZXlzKCkpIHtcblx0XHRcdHRoaXMuY2FjaGUuZ2V0KGhhc2gpPy5kZWxldGUoZmlsZV9wYXRoKTtcblx0XHRcdGlmICh0aGlzLmNhY2hlLmdldChoYXNoKT8uc2l6ZSA9PSAwKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlUERGRnJvbUNhY2hlKGhhc2gpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldExhdGV4SGFzaGVzRnJvbUNhY2hlRm9yRmlsZShmaWxlOiBURmlsZSkge1xuXHRcdGxldCBoYXNoZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHBhdGggPSBmaWxlLnBhdGg7XG5cdFx0Zm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy5jYWNoZS5lbnRyaWVzKCkpIHtcblx0XHRcdGlmICh2LmhhcyhwYXRoKSkge1xuXHRcdFx0XHRoYXNoZXMucHVzaChrKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGhhc2hlcztcblx0fVxuXG5cdGFzeW5jIGdldExhdGV4SGFzaGVzRnJvbUZpbGUoZmlsZTogVEZpbGUpIHtcblx0XHRsZXQgaGFzaGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBzZWN0aW9ucyA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5zZWN0aW9uc1xuXHRcdGlmIChzZWN0aW9ucyAhPSB1bmRlZmluZWQpIHtcblx0XHRcdGxldCBsaW5lcyA9IChhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpKS5zcGxpdCgnXFxuJyk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2Ygc2VjdGlvbnMpIHtcblx0XHRcdFx0aWYgKHNlY3Rpb24udHlwZSAhPSBcImNvZGVcIiAmJiBsaW5lc1tzZWN0aW9uLnBvc2l0aW9uLnN0YXJ0LmxpbmVdLm1hdGNoKFwiYGBgICpsYXRleFwiKSA9PSBudWxsKSBjb250aW51ZTtcblx0XHRcdFx0bGV0IHNvdXJjZSA9IGxpbmVzLnNsaWNlKHNlY3Rpb24ucG9zaXRpb24uc3RhcnQubGluZSArIDEsIHNlY3Rpb24ucG9zaXRpb24uZW5kLmxpbmUpLmpvaW4oXCJcXG5cIik7XG5cdFx0XHRcdGxldCBoYXNoID0gdGhpcy5oYXNoTGF0ZXhTb3VyY2Uoc291cmNlKTtcblx0XHRcdFx0aGFzaGVzLnB1c2goaGFzaCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBoYXNoZXM7XG5cdH1cbn1cbiJdfQ==