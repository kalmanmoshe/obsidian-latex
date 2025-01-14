import { FileSystemAdapter, TFile, MarkdownPreviewRenderer } from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
import { PdfTeXEngine } from './PdfTeXEngine.js';
import { PDFDocument } from 'pdf-lib';
import PdfToCairo from "./pdftocairo.js";
import { optimize } from 'svgo';
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
    }
    async onload() {
        await this.loadCache();
        this.pluginFolderPath = path.join(this.getVaultPath(), this.app.vault.configDir, "plugins/moshe-math/");
        // initialize the latex compiler
        this.pdfEngine = new PdfTeXEngine();
        await this.pdfEngine.loadEngine();
        //await this.loadPackageCache();
        //this.pdfEngine.setTexliveEndpoint(this.package_url);
        //this.addSyntaxHighlighting();
        if (false) {
            const pdfBlockProcessor = MarkdownPreviewRenderer.createCodeBlockPostProcessor("latex", (source, el, ctx) => this.renderLatexToElement(source, el, ctx, false));
            MarkdownPreviewRenderer.registerPostProcessor(pdfBlockProcessor);
            const svgBlockProcessor = MarkdownPreviewRenderer.createCodeBlockPostProcessor("latexsvg", (source, el, ctx) => this.renderLatexToElement(source, el, ctx, true));
            MarkdownPreviewRenderer.registerPostProcessor(svgBlockProcessor);
        }
        else {
            //this.plugin.registerMarkdownCodeBlockProcessor("latex", (source, el, ctx) => this.renderLatexToElement(source, el, ctx, false));
            //this.plugin.registerMarkdownCodeBlockProcessor("latexsvg", (source, el, ctx) => this.renderLatexToElement(source, el, ctx, true));
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
            if (this.cacheMap.has(md5Hash) && fs.existsSync(pdfPath)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9sYXRleFJlbmRlci9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBTyxpQkFBaUIsRUFBaUYsS0FBSyxFQUF5Qix1QkFBdUIsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN4TCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sRUFBQyxZQUFZLEVBQUMsTUFBTSxtQkFBbUIsQ0FBQztBQUMvQyxPQUFPLEVBQUMsV0FBVyxFQUFDLE1BQU0sU0FBUyxDQUFDO0FBQ3BDLE9BQU8sVUFBVSxNQUFNLGlCQUFpQixDQUFDO0FBQ3pDLE9BQU8sRUFBUyxRQUFRLEVBQUMsTUFBTSxNQUFNLENBQUM7QUFPdEMsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLFFBQXVCLEVBQUUsRUFBRTtJQUNqRCxPQUFPLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDbkMsSUFBSSxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxDQUFDO1FBQ1QsQ0FBQzthQUNJLENBQUM7WUFDUCxVQUFVLENBQUMsS0FBSyxJQUFJLEVBQUU7Z0JBQ3BCLE1BQU0sT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN4QixPQUFPLEVBQUUsQ0FBQztZQUNaLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNQLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNGLENBQUMsQ0FBQztBQUdKLE1BQU0sT0FBTyxXQUFXO0lBQ3ZCLEdBQUcsQ0FBTTtJQUNULE1BQU0sQ0FBUTtJQUNkLGVBQWUsQ0FBUztJQUN4QixzQkFBc0IsQ0FB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LFNBQVMsRUFBRSxDQUFDO1lBQzNCLElBQUksS0FBSyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUQsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDaEMsSUFBSSxPQUFPLENBQUMsSUFBSSxJQUFJLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLElBQUk7b0JBQUUsU0FBUztnQkFDdkcsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDaEcsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDeEMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztDQUNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBGaWxlU3lzdGVtQWRhcHRlciwgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZWN0aW9uQ2FjaGUsIFNldHRpbmcsIFRGaWxlLCBURm9sZGVyLCBNYXJrZG93blZpZXcsIE1hcmtkb3duUHJldmlld1JlbmRlcmVyIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgTWQ1IH0gZnJvbSAndHMtbWQ1JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHRlbXAgZnJvbSAndGVtcCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHtQZGZUZVhFbmdpbmV9IGZyb20gJy4vUGRmVGVYRW5naW5lLmpzJztcbmltcG9ydCB7UERGRG9jdW1lbnR9IGZyb20gJ3BkZi1saWInO1xuaW1wb3J0IFBkZlRvQ2Fpcm8gZnJvbSBcIi4vcGRmdG9jYWlyby5qc1wiO1xuaW1wb3J0IHtDb25maWcsIG9wdGltaXplfSBmcm9tICdzdmdvJztcbmltcG9ydCBNb3NoZSBmcm9tICdzcmMvbWFpbi5qcyc7XG5cblxudHlwZSBTdHJpbmdNYXAgPSB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuXG5cbmNvbnN0IHdhaXRGb3IgPSBhc3luYyAoY29uZEZ1bmM6ICgpID0+IGJvb2xlYW4pID0+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG5cdCAgaWYgKGNvbmRGdW5jKCkpIHtcblx0XHRyZXNvbHZlKCk7XG5cdCAgfVxuXHQgIGVsc2Uge1xuXHRcdHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuXHRcdCAgYXdhaXQgd2FpdEZvcihjb25kRnVuYyk7XG5cdFx0ICByZXNvbHZlKCk7XG5cdFx0fSwgMTAwKTtcblx0ICB9XG5cdH0pO1xuICB9O1xuICBcblxuZXhwb3J0IGNsYXNzIExhdGV4UmVuZGVyIHtcblx0YXBwOiBBcHA7XG5cdHBsdWdpbjogTW9zaGU7XG5cdGNhY2hlRm9sZGVyUGF0aDogc3RyaW5nO1xuXHRwYWNrYWdlQ2FjaGVGb2xkZXJQYXRoOiBzdHJpbmc7XG5cdGNhY2hlOiBbYW55LCBhbnldW10gPSBbXTtcblx0cGFja2FnZUNhY2hlOiB7IFtrZXk6IHN0cmluZ106IGFueSB9W10gPSBbe30sIHt9LCB7fSwge31dO1xuXHRwbHVnaW5Gb2xkZXJQYXRoOiBzdHJpbmc7XG5cdHBkZkVuZ2luZTogYW55O1xuXHRwYWNrYWdlX3VybDogYGh0dHBzOi8vdGV4bGl2ZTIuc3dpZnRsYXRleC5jb20vYDtcblx0Y2FjaGVNYXA6IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PjsgLy8gS2V5OiBtZDUgaGFzaCBvZiBsYXRleCBzb3VyY2UuIFZhbHVlOiBTZXQgb2YgZmlsZSBwYXRoIG5hbWVzLlxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBNb3NoZSkge1xuXHRcdHRoaXMuYXBwPWFwcDtcblx0XHR0aGlzLnBsdWdpbj1wbHVnaW47XG5cdH1cblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkQ2FjaGUoKTtcblx0XHR0aGlzLnBsdWdpbkZvbGRlclBhdGggPSBwYXRoLmpvaW4odGhpcy5nZXRWYXVsdFBhdGgoKSwgdGhpcy5hcHAudmF1bHQuY29uZmlnRGlyLCBcInBsdWdpbnMvbW9zaGUtbWF0aC9cIik7XG5cdFx0Ly8gaW5pdGlhbGl6ZSB0aGUgbGF0ZXggY29tcGlsZXJcblx0XHR0aGlzLnBkZkVuZ2luZSA9IG5ldyBQZGZUZVhFbmdpbmUoKTtcblx0XHRhd2FpdCB0aGlzLnBkZkVuZ2luZS5sb2FkRW5naW5lKCk7XG5cdFx0Ly9hd2FpdCB0aGlzLmxvYWRQYWNrYWdlQ2FjaGUoKTtcblx0XHQvL3RoaXMucGRmRW5naW5lLnNldFRleGxpdmVFbmRwb2ludCh0aGlzLnBhY2thZ2VfdXJsKTtcblxuXHRcdC8vdGhpcy5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcblxuXHRcdGlmIChmYWxzZSkge1xuXHRcdFx0Y29uc3QgcGRmQmxvY2tQcm9jZXNzb3IgPSBNYXJrZG93blByZXZpZXdSZW5kZXJlci5jcmVhdGVDb2RlQmxvY2tQb3N0UHJvY2Vzc29yKFwibGF0ZXhcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIGZhbHNlKSk7XG5cdFx0XHRNYXJrZG93blByZXZpZXdSZW5kZXJlci5yZWdpc3RlclBvc3RQcm9jZXNzb3IocGRmQmxvY2tQcm9jZXNzb3IpO1xuXHRcdFx0Y29uc3Qgc3ZnQmxvY2tQcm9jZXNzb3IgPSBNYXJrZG93blByZXZpZXdSZW5kZXJlci5jcmVhdGVDb2RlQmxvY2tQb3N0UHJvY2Vzc29yKFwibGF0ZXhzdmdcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIHRydWUpKTtcblx0XHRcdE1hcmtkb3duUHJldmlld1JlbmRlcmVyLnJlZ2lzdGVyUG9zdFByb2Nlc3NvcihzdmdCbG9ja1Byb2Nlc3Nvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vdGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcImxhdGV4XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHRoaXMucmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlLCBlbCwgY3R4LCBmYWxzZSkpO1xuXHRcdFx0Ly90aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibGF0ZXhzdmdcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIHRydWUpKTtcblx0XHR9XG5cdH1cblxuXHRvbnVubG9hZCgpIHtcblx0XHR0aGlzLnVubG9hZENhY2hlKCk7XG5cdH1cblxuXG5cdGdldFZhdWx0UGF0aCgpIHtcblx0XHRpZiAodGhpcy5hcHAudmF1bHQuYWRhcHRlciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1BZGFwdGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hcHAudmF1bHQuYWRhcHRlci5nZXRCYXNlUGF0aCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJNb3NoZTogQ291bGQgbm90IGdldCB2YXVsdCBwYXRoLlwiKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2FkQ2FjaGUoKSB7XG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMuY2FjaGVGb2xkZXJQYXRoID0gcGF0aC5qb2luKGNhY2hlRm9sZGVyUGFyZW50UGF0aCwgXCJwZGYtY2FjaGVcIik7XG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoKTtcblx0XHRcdHRoaXMuY2FjaGVNYXAgPSBuZXcgTWFwKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2FjaGVNYXAgPSBuZXcgTWFwKHRoaXMuY2FjaGUpO1xuXHRcdFx0Ly8gRm9yIHNvbWUgcmVhc29uIGB0aGlzLmNhY2hlYCBhdCB0aGlzIHBvaW50IGlzIGFjdHVhbGx5IGBNYXA8c3RyaW5nLCBBcnJheTxzdHJpbmc+PmBcblx0XHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMuY2FjaGVNYXApIHtcblx0XHRcdFx0dGhpcy5jYWNoZU1hcC5zZXQoaywgbmV3IFNldCh2KSlcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGFzeW5jIGxvYWRQYWNrYWdlQ2FjaGUoKSB7XG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCA9IHBhdGguam9pbihjYWNoZUZvbGRlclBhcmVudFBhdGgsIFwicGFja2FnZS1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0fVxuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBwYWNrYWdlIGNhY2hlXCIpO1xuXG5cdFx0Ly8gYWRkIGZpbGVzIGluIHRoZSBwYWNrYWdlIGNhY2hlIGZvbGRlciB0byB0aGUgY2FjaGUgbGlzdFxuXHRcdGNvbnN0IHBhY2thZ2VGaWxlcyA9IGZzLnJlYWRkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIHBhY2thZ2VGaWxlcykge1xuXHRcdFx0Y29uc3QgZmlsZW5hbWUgPSBwYXRoLmJhc2VuYW1lKGZpbGUpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBcIi90ZXgvXCIrZmlsZW5hbWU7XG5cdFx0XHRjb25zdCBwYWNrYWdlVmFsdWVzID0gT2JqZWN0LnZhbHVlcyh0aGlzLnBhY2thZ2VDYWNoZVsxXSk7XG5cdFx0XHRpZiAoIXBhY2thZ2VWYWx1ZXMuaW5jbHVkZXModmFsdWUpKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IFwiMjYvXCIgKyBmaWxlbmFtZVxuXHRcdFx0XHR0aGlzLnBhY2thZ2VDYWNoZVsxXVtrZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIG1vdmUgcGFja2FnZXMgdG8gdGhlIFZGU1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnBhY2thZ2VDYWNoZVsxXSkpIHtcblx0XHRcdGNvbnN0IGZpbGVuYW1lID0gcGF0aC5iYXNlbmFtZSh2YWwpO1xuXHRcdFx0bGV0IHJlYWRfc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3JjY29kZSA9IGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoLCBmaWxlbmFtZSkpO1xuXHRcdFx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZVRleEZTRmlsZShmaWxlbmFtZSwgc3JjY29kZSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIHdoZW4gdW5hYmxlIHRvIHJlYWQgZmlsZSwgcmVtb3ZlIHRoaXMgZnJvbSB0aGUgY2FjaGVcblx0XHRcdFx0Y29uc29sZS5sb2coYFVuYWJsZSB0byByZWFkIGZpbGUgJHtmaWxlbmFtZX0gZnJvbSBwYWNrYWdlIGNhY2hlYClcblx0XHRcdFx0ZGVsZXRlIHRoaXMucGFja2FnZUNhY2hlWzFdW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gd3JpdGUgY2FjaGUgZGF0YSB0byB0aGUgVkZTLCBleGNlcHQgZG9uJ3Qgd3JpdGUgdGhlIHRleGxpdmU0MDRfY2FjaGUgYmVjYXVzZSB0aGlzIHdpbGwgY2F1c2UgcHJvYmxlbXMgd2hlbiBzd2l0Y2hpbmcgYmV0d2VlbiB0ZXhsaXZlIHNvdXJjZXNcblx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZUNhY2hlRGF0YSh7fSxcblx0XHRcdHRoaXMucGFja2FnZUNhY2hlWzFdLFxuXHRcdFx0dGhpcy5wYWNrYWdlQ2FjaGVbMl0sXG5cdFx0XHR0aGlzLnBhY2thZ2VDYWNoZVszXSk7XG5cdH1cblxuXHR1bmxvYWRDYWNoZSgpIHtcblx0XHRmcy5ybWRpclN5bmModGhpcy5jYWNoZUZvbGRlclBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHR9XG5cblx0YWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuXHRcdC8vIEB0cy1pZ25vcmVcblx0XHR3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5wdXNoKHtuYW1lOiBcImxhdGV4c3ZnXCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XG5cdH1cblxuXHRmb3JtYXRMYXRleFNvdXJjZShzb3VyY2U6IHN0cmluZykge1xuXHRcdHJldHVybiBzb3VyY2U7XG5cdH1cblxuXHRoYXNoTGF0ZXhTb3VyY2Uoc291cmNlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gTWQ1Lmhhc2hTdHIoc291cmNlLnRyaW0oKSk7XG5cdH1cblxuXHRhc3luYyBwZGZUb0h0bWwocGRmRGF0YTogYW55KSB7XG5cdFx0Y29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gYXdhaXQgdGhpcy5nZXRQZGZEaW1lbnNpb25zKHBkZkRhdGEpO1xuXHRcdGNvbnN0IHJhdGlvID0gd2lkdGggLyBoZWlnaHQ7XG5cdFx0Y29uc3QgcGRmYmxvYiA9IG5ldyBCbG9iKFtwZGZEYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vcGRmJyB9KTtcblx0XHRjb25zdCBvYmplY3RVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKHBkZmJsb2IpO1xuXHRcdHJldHVybiAge1xuXHRcdFx0YXR0cjoge1xuXHRcdFx0ICBkYXRhOiBgJHtvYmplY3RVUkx9I3ZpZXc9Rml0SCZ0b29sYmFyPTBgLFxuXHRcdFx0ICB0eXBlOiAnYXBwbGljYXRpb24vcGRmJyxcblx0XHRcdCAgY2xhc3M6ICdibG9jay1sYW51YWdlLWxhdGV4Jyxcblx0XHRcdCAgc3R5bGU6IGB3aWR0aDoxMDAlOyBhc3BlY3QtcmF0aW86JHtyYXRpb31gXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHN2Z1RvSHRtbChzdmc6IGFueSkge1xuXHRcdGlmIChmYWxzZSkge1xuXHRcdFx0c3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN2Zztcblx0fVxuXHRcblx0YXN5bmMgZ2V0UGRmRGltZW5zaW9ucyhwZGY6IGFueSk6IFByb21pc2U8e3dpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyfT4ge1xuXHRcdGNvbnN0IHBkZkRvYyA9IGF3YWl0IFBERkRvY3VtZW50LmxvYWQocGRmKTtcblx0XHRjb25zdCBmaXJzdFBhZ2UgPSBwZGZEb2MuZ2V0UGFnZXMoKVswXTtcblx0XHRjb25zdCB7d2lkdGgsIGhlaWdodH0gPSBmaXJzdFBhZ2UuZ2V0U2l6ZSgpO1xuXHRcdHJldHVybiB7d2lkdGgsIGhlaWdodH07XG5cdH1cblxuXHRwZGZUb1NWRyhwZGZEYXRhOiBhbnkpIHtcblx0XHRyZXR1cm4gUGRmVG9DYWlybygpLnRoZW4oKHBkZnRvY2Fpcm86IGFueSkgPT4ge1xuXHRcdFx0cGRmdG9jYWlyby5GUy53cml0ZUZpbGUoJ2lucHV0LnBkZicsIHBkZkRhdGEpO1xuXHRcdFx0cGRmdG9jYWlyby5fY29udmVydFBkZlRvU3ZnKCk7XG5cdFx0XHRsZXQgc3ZnID0gcGRmdG9jYWlyby5GUy5yZWFkRmlsZSgnaW5wdXQuc3ZnJywge2VuY29kaW5nOid1dGY4J30pO1xuXG5cdFx0XHQvLyBHZW5lcmF0ZSBhIHVuaXF1ZSBJRCBmb3IgZWFjaCBTVkcgdG8gYXZvaWQgY29uZmxpY3RzXG5cdFx0XHRjb25zdCBpZCA9IE1kNS5oYXNoU3RyKHN2Zy50cmltKCkpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCByYW5kb21TdHJpbmcgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoMiwgMTApO1xuXHRcdFx0Y29uc3QgdW5pcXVlSWQgPSBpZC5jb25jYXQocmFuZG9tU3RyaW5nKTtcblx0XHRcdGNvbnN0IHN2Z29Db25maWc6Q29uZmlnID0gIHtcblx0XHRcdFx0cGx1Z2luczogWydzb3J0QXR0cnMnLCB7IG5hbWU6ICdwcmVmaXhJZHMnLCBwYXJhbXM6IHsgcHJlZml4OiB1bmlxdWVJZCB9IH1dXG5cdFx0XHR9O1xuXHRcdFx0c3ZnID0gb3B0aW1pemUoc3ZnLCBzdmdvQ29uZmlnKS5kYXRhOyBcblxuXHRcdFx0cmV0dXJuIHN2Zztcblx0fSk7XG5cdH1cblxuXHRjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcblx0XHQvLyBSZXBsYWNlIHRoZSBjb2xvciBcImJsYWNrXCIgd2l0aCBjdXJyZW50Q29sb3IgKHRoZSBjdXJyZW50IHRleHQgY29sb3IpXG5cdFx0Ly8gc28gdGhhdCBkaWFncmFtIGF4ZXMsIGV0YyBhcmUgdmlzaWJsZSBpbiBkYXJrIG1vZGVcblx0XHQvLyBBbmQgcmVwbGFjZSBcIndoaXRlXCIgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvclxuXG5cdFx0c3ZnID0gc3ZnLnJlcGxhY2UoL3JnYlxcKDAlLCAwJSwgMCVcXCkvZywgXCJjdXJyZW50Q29sb3JcIilcblx0XHRcdFx0LnJlcGxhY2UoL3JnYlxcKDEwMCUsIDEwMCUsIDEwMCVcXCkvZywgXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXCIpO1xuXG5cdFx0cmV0dXJuIHN2Zztcblx0fVxuXG5cblx0YXN5bmMgcmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBvdXRwdXRTVkc6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRsZXQgbWQ1SGFzaCA9IHRoaXMuaGFzaExhdGV4U291cmNlKHNvdXJjZSk7XG5cdFx0XHRsZXQgcGRmUGF0aCA9IHBhdGguam9pbih0aGlzLmNhY2hlRm9sZGVyUGF0aCwgYCR7bWQ1SGFzaH0ucGRmYCk7XG5cblx0XHRcdC8vIFBERiBmaWxlIGhhcyBhbHJlYWR5IGJlZW4gY2FjaGVkXG5cdFx0XHQvLyBDb3VsZCBoYXZlIGEgY2FzZSB3aGVyZSBwZGZDYWNoZSBoYXMgdGhlIGtleSBidXQgdGhlIGNhY2hlZCBmaWxlIGhhcyBiZWVuIGRlbGV0ZWRcblx0XHRcdGlmICh0aGlzLmNhY2hlTWFwLmhhcyhtZDVIYXNoKSAmJiBmcy5leGlzdHNTeW5jKHBkZlBhdGgpKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKFwiVXNpbmcgY2FjaGVkIFBERjogXCIsIG1kNUhhc2gpO1xuXHRcdFx0XHRsZXQgcGRmRGF0YSA9IGZzLnJlYWRGaWxlU3luYyhwZGZQYXRoKTtcblx0XHRcdFx0aWYgKG91dHB1dFNWRykge1xuXHRcdFx0XHRcdHRoaXMucGRmVG9TVkcocGRmRGF0YSkudGhlbigoc3ZnOiBzdHJpbmcpID0+IHsgZWwuaW5uZXJIVE1MID0gdGhpcy5zdmdUb0h0bWwoc3ZnKTt9KVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucGRmVG9IdG1sKHBkZkRhdGEpLnRoZW4oKGh0bWxEYXRhKT0+e2VsLmNyZWF0ZUVsKFwib2JqZWN0XCIsIGh0bWxEYXRhKTsgcmVzb2x2ZSgpO30pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuYWRkRmlsZVRvQ2FjaGUobWQ1SGFzaCwgY3R4LnNvdXJjZVBhdGgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coXCJSZW5kZXJpbmcgUERGOiBcIiwgbWQ1SGFzaCk7XG5cblx0XHRcdFx0dGhpcy5yZW5kZXJMYXRleFRvUERGKHNvdXJjZSwgbWQ1SGFzaCkudGhlbigocjogYW55KSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5hZGRGaWxlVG9DYWNoZShtZDVIYXNoLCBjdHguc291cmNlUGF0aCk7XG5cdFx0XHRcdFx0aWYgKG91dHB1dFNWRykge1xuXHRcdFx0XHRcdFx0dGhpcy5wZGZUb1NWRyhyLnBkZikudGhlbigoc3ZnOiBzdHJpbmcpID0+IHsgZWwuaW5uZXJIVE1MID0gdGhpcy5zdmdUb0h0bWwoc3ZnKTt9KVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBkZlRvSHRtbChyLnBkZikudGhlbigoaHRtbERhdGEpPT57ZWwuY3JlYXRlRWwoXCJvYmplY3RcIiwgaHRtbERhdGEpOyByZXNvbHZlKCk7fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZzLndyaXRlRmlsZVN5bmMocGRmUGF0aCwgci5wZGYpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQpLmNhdGNoKGVyciA9PiB7IFxuXHRcdFx0XHRcdGxldCBlcnJvckRpdiA9IGVsLmNyZWF0ZUVsKCdkaXYnLCB7IHRleHQ6IGAke2Vycn1gLCBhdHRyOiB7IGNsYXNzOiAnYmxvY2stbGF0ZXgtZXJyb3InIH0gfSk7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7IFxuXHRcdFx0XHR9KTtcdFx0XHRcdFxuXHRcdFx0fVxuXHRcdH0pLnRoZW4oKCkgPT4geyBcblx0XHRcdHRoaXMucGRmRW5naW5lLmZsdXNoQ2FjaGUoKTtcblx0XHRcdCBzZXRUaW1lb3V0KCgpID0+IHRoaXMuY2xlYW5VcENhY2hlKCksIDEwMDApO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVuZGVyTGF0ZXhUb1BERihzb3VyY2U6IHN0cmluZywgbWQ1SGFzaDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHNvdXJjZSA9IHRoaXMuZm9ybWF0TGF0ZXhTb3VyY2Uoc291cmNlKTtcblxuXHRcdFx0dGVtcC5ta2RpcihcIm9ic2lkaWFuLXN3aWZ0bGF0ZXgtcmVuZGVyZXJcIiwgYXN5bmMgKGVyciwgZGlyUGF0aCkgPT4ge1xuXHRcdFx0XHRcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB3YWl0Rm9yKCgpID0+IHRoaXMucGRmRW5naW5lLmlzUmVhZHkoKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlcnIpIHJlamVjdChlcnIpO1xuXHRcdFx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZU1lbUZTRmlsZShcIm1haW4udGV4XCIsIHNvdXJjZSk7XG5cdFx0XHRcdHRoaXMucGRmRW5naW5lLnNldEVuZ2luZU1haW5GaWxlKFwibWFpbi50ZXhcIik7XG5cdFx0XHRcdHRoaXMucGRmRW5naW5lLmNvbXBpbGVMYVRlWCgpLnRoZW4oKHI6IGFueSkgPT4ge1xuXHRcdFx0XHRpZiAoci5zdGF0dXMgIT0gMCkge1xuXHRcdFx0XHRcdC8vIG1hbmFnZSBsYXRleCBlcnJvcnNcblx0XHRcdFx0XHRyZWplY3Qoci5sb2cpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIHVwZGF0ZSB0aGUgbGlzdCBvZiBwYWNrYWdlIGZpbGVzIGluIHRoZSBjYWNoZVxuXHRcdFx0XHR0aGlzLmZldGNoUGFja2FnZUNhY2hlRGF0YSgpXG5cdFx0XHRcdHJlc29sdmUocik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSlcblx0XHR9KTtcblx0fVxuXG5cdGZldGNoUGFja2FnZUNhY2hlRGF0YSgpOiB2b2lkIHtcblx0XHR0aGlzLnBkZkVuZ2luZS5mZXRjaENhY2hlRGF0YSgpLnRoZW4oKHI6IFN0cmluZ01hcFtdKSA9PiB7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGkgPT09IDEpIHsgLy8gY3VycmVudGx5IG9ubHkgZGVhbGluZyB3aXRoIHRleGxpdmUyMDBfY2FjaGVcblx0XHRcdFx0XHQvLyBnZXQgZGlmZnNcblx0XHRcdFx0XHRjb25zdCBuZXdGaWxlTmFtZXMgPSB0aGlzLmdldE5ld1BhY2thZ2VGaWxlTmFtZXModGhpcy5wYWNrYWdlQ2FjaGVbaV0sIHJbaV0pO1xuXHRcdFx0XHRcdC8vIGZldGNoIG5ldyBwYWNrYWdlIGZpbGVzXG5cdFx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuZmV0Y2hUZXhGaWxlcyhuZXdGaWxlTmFtZXMsIHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMucGFja2FnZUNhY2hlID0gcjtcblx0XHR9KTtcblx0fVxuXG5cdGdldE5ld1BhY2thZ2VGaWxlTmFtZXMob2xkQ2FjaGVEYXRhOiBTdHJpbmdNYXAsIG5ld0NhY2hlRGF0YTogU3RyaW5nTWFwKTogc3RyaW5nW10ge1xuXHRcdC8vIGJhc2VkIG9uIHRoZSBvbGQgYW5kIG5ldyBwYWNrYWdlIGZpbGVzIGluIHBhY2thZ2UgY2FjaGUgZGF0YSxcblx0XHQvLyByZXR1cm4gdGhlIG5ldyBwYWNrYWdlIGZpbGVzXG5cdFx0bGV0IG5ld0tleXMgPSBPYmplY3Qua2V5cyhuZXdDYWNoZURhdGEpLmZpbHRlcihrZXkgPT4gIShrZXkgaW4gb2xkQ2FjaGVEYXRhKSk7XG5cdFx0bGV0IG5ld1BhY2thZ2VGaWxlcyA9IG5ld0tleXMubWFwKGtleSA9PiBwYXRoLmJhc2VuYW1lKG5ld0NhY2hlRGF0YVtrZXldKSk7XHRcdFxuXHRcdHJldHVybiBuZXdQYWNrYWdlRmlsZXM7XG5cdH1cblxuXHRhc3luYyBzYXZlQ2FjaGUoKSB7XG5cdFx0bGV0IHRlbXAgPSBuZXcgTWFwKCk7XG5cdFx0Zm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy5jYWNoZU1hcCkge1xuXHRcdFx0dGVtcC5zZXQoaywgWy4uLnZdKVxuXHRcdH1cblx0XHR0aGlzLmNhY2hlID0gWy4uLnRlbXBdO1xuXG5cdH1cblxuXHRhZGRGaWxlVG9DYWNoZShoYXNoOiBzdHJpbmcsIGZpbGVfcGF0aDogc3RyaW5nKSB7XG5cdFx0aWYgKCF0aGlzLmNhY2hlTWFwLmhhcyhoYXNoKSkge1xuXHRcdFx0dGhpcy5jYWNoZU1hcC5zZXQoaGFzaCwgbmV3IFNldCgpKTtcblx0XHR9XG5cdFx0dGhpcy5jYWNoZU1hcC5nZXQoaGFzaCk/LmFkZChmaWxlX3BhdGgpO1xuXHR9XG5cblx0YXN5bmMgY2xlYW5VcENhY2hlKCkge1xuXHRcdGxldCBmaWxlX3BhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBmcHMgb2YgdGhpcy5jYWNoZU1hcC52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBmcCBvZiBmcHMpIHtcblx0XHRcdFx0ZmlsZV9wYXRocy5hZGQoZnApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZmlsZV9wYXRoIG9mIGZpbGVfcGF0aHMpIHtcblx0XHRcdGxldCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVfcGF0aCk7XG5cdFx0XHRpZiAoZmlsZSA9PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRmlsZUZyb21DYWNoZShmaWxlX3BhdGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVtb3ZlVW51c2VkQ2FjaGVzRm9yRmlsZShmaWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnNhdmVDYWNoZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlVW51c2VkQ2FjaGVzRm9yRmlsZShmaWxlOiBURmlsZSkge1xuXHRcdGxldCBoYXNoZXNfaW5fZmlsZSA9IGF3YWl0IHRoaXMuZ2V0TGF0ZXhIYXNoZXNGcm9tRmlsZShmaWxlKTtcblx0XHRsZXQgaGFzaGVzX2luX2NhY2hlID0gdGhpcy5nZXRMYXRleEhhc2hlc0Zyb21DYWNoZUZvckZpbGUoZmlsZSk7XG5cdFx0Zm9yIChjb25zdCBoYXNoIG9mIGhhc2hlc19pbl9jYWNoZSkge1xuXHRcdFx0aWYgKCFoYXNoZXNfaW5fZmlsZS5jb250YWlucyhoYXNoKSkge1xuXHRcdFx0XHR0aGlzLmNhY2hlTWFwLmdldChoYXNoKT8uZGVsZXRlKGZpbGUucGF0aCk7XG5cdFx0XHRcdGlmICh0aGlzLmNhY2hlTWFwLmdldChoYXNoKT8uc2l6ZSA9PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW1vdmVQREZGcm9tQ2FjaGUoaGFzaCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZW1vdmVQREZGcm9tQ2FjaGUoa2V5OiBzdHJpbmcpIHtcblx0XHR0aGlzLmNhY2hlTWFwLmRlbGV0ZShrZXkpO1xuXHRcdGZzLnJtU3luYyhwYXRoLmpvaW4odGhpcy5jYWNoZUZvbGRlclBhdGgsIGAke2tleX0ucGRmYCkpO1xuXHR9XG5cblx0cmVtb3ZlRmlsZUZyb21DYWNoZShmaWxlX3BhdGg6IHN0cmluZykge1xuXHRcdGZvciAoY29uc3QgaGFzaCBvZiB0aGlzLmNhY2hlTWFwLmtleXMoKSkge1xuXHRcdFx0dGhpcy5jYWNoZU1hcC5nZXQoaGFzaCk/LmRlbGV0ZShmaWxlX3BhdGgpO1xuXHRcdFx0aWYgKHRoaXMuY2FjaGVNYXAuZ2V0KGhhc2gpPy5zaXplID09IDApIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVQREZGcm9tQ2FjaGUoaGFzaCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0TGF0ZXhIYXNoZXNGcm9tQ2FjaGVGb3JGaWxlKGZpbGU6IFRGaWxlKSB7XG5cdFx0bGV0IGhhc2hlczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgcGF0aCA9IGZpbGUucGF0aDtcblx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLmNhY2hlTWFwLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKHYuaGFzKHBhdGgpKSB7XG5cdFx0XHRcdGhhc2hlcy5wdXNoKGspO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGFzaGVzO1xuXHR9XG5cblx0YXN5bmMgZ2V0TGF0ZXhIYXNoZXNGcm9tRmlsZShmaWxlOiBURmlsZSkge1xuXHRcdGxldCBoYXNoZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHNlY3Rpb25zID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LnNlY3Rpb25zXG5cdFx0aWYgKHNlY3Rpb25zICE9IHVuZGVmaW5lZCkge1xuXHRcdFx0bGV0IGxpbmVzID0gKGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSkpLnNwbGl0KCdcXG4nKTtcblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBzZWN0aW9ucykge1xuXHRcdFx0XHRpZiAoc2VjdGlvbi50eXBlICE9IFwiY29kZVwiICYmIGxpbmVzW3NlY3Rpb24ucG9zaXRpb24uc3RhcnQubGluZV0ubWF0Y2goXCJgYGAgKmxhdGV4XCIpID09IG51bGwpIGNvbnRpbnVlO1xuXHRcdFx0XHRsZXQgc291cmNlID0gbGluZXMuc2xpY2Uoc2VjdGlvbi5wb3NpdGlvbi5zdGFydC5saW5lICsgMSwgc2VjdGlvbi5wb3NpdGlvbi5lbmQubGluZSkuam9pbihcIlxcblwiKTtcblx0XHRcdFx0bGV0IGhhc2ggPSB0aGlzLmhhc2hMYXRleFNvdXJjZShzb3VyY2UpO1xuXHRcdFx0XHRoYXNoZXMucHVzaChoYXNoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGhhc2hlcztcblx0fVxufVxuXG4iXX0=