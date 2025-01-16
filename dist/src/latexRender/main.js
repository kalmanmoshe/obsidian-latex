import { FileSystemAdapter, TFile, MarkdownPreviewRenderer } from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
import { PdfTeXEngine } from './PdfTeXEngine';
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9sYXRleFJlbmRlci9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBTyxpQkFBaUIsRUFBaUYsS0FBSyxFQUF5Qix1QkFBdUIsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN4TCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sRUFBQyxZQUFZLEVBQUMsTUFBTSxnQkFBZ0IsQ0FBQztBQUM1QyxPQUFPLEVBQUMsV0FBVyxFQUFDLE1BQU0sU0FBUyxDQUFDO0FBU3BDLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxRQUF1QixFQUFFLEVBQUU7SUFDakQsT0FBTyxJQUFJLE9BQU8sQ0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFO1FBQ25DLElBQUksUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsQ0FBQztRQUNULENBQUM7YUFDSSxDQUFDO1lBQ1AsVUFBVSxDQUFDLEtBQUssSUFBSSxFQUFFO2dCQUNwQixNQUFNLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDeEIsT0FBTyxFQUFFLENBQUM7WUFDWixDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDUCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDRixDQUFDLENBQUM7QUFHSixNQUFNLE9BQU8sV0FBVztJQUN2QixHQUFHLENBQU07SUFDVCxNQUFNLENBQVE7SUFDZCxlQUFlLENBQVM7SUFDeEIsc0JBQXNCLENBQVM7SUFDL0IsS0FBSyxHQUFpQixFQUFFLENBQUM7SUFDekIsWUFBWSxHQUE2QixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFB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LENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDaEcsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDeEMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztDQUNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBGaWxlU3lzdGVtQWRhcHRlciwgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZWN0aW9uQ2FjaGUsIFNldHRpbmcsIFRGaWxlLCBURm9sZGVyLCBNYXJrZG93blZpZXcsIE1hcmtkb3duUHJldmlld1JlbmRlcmVyIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgTWQ1IH0gZnJvbSAndHMtbWQ1JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHRlbXAgZnJvbSAndGVtcCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHtQZGZUZVhFbmdpbmV9IGZyb20gJy4vUGRmVGVYRW5naW5lJztcbmltcG9ydCB7UERGRG9jdW1lbnR9IGZyb20gJ3BkZi1saWInO1xuaW1wb3J0IHtDb25maWcsIG9wdGltaXplfSBmcm9tICdzdmdvJztcbmltcG9ydCBNb3NoZSBmcm9tICdzcmMvbWFpbi5qcyc7XG5cblxuXG50eXBlIFN0cmluZ01hcCA9IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG5cblxuY29uc3Qgd2FpdEZvciA9IGFzeW5jIChjb25kRnVuYzogKCkgPT4gYm9vbGVhbikgPT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcblx0ICBpZiAoY29uZEZ1bmMoKSkge1xuXHRcdHJlc29sdmUoKTtcblx0ICB9XG5cdCAgZWxzZSB7XG5cdFx0c2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0ICBhd2FpdCB3YWl0Rm9yKGNvbmRGdW5jKTtcblx0XHQgIHJlc29sdmUoKTtcblx0XHR9LCAxMDApO1xuXHQgIH1cblx0fSk7XG4gIH07XG4gIFxuXG5leHBvcnQgY2xhc3MgTGF0ZXhSZW5kZXIge1xuXHRhcHA6IEFwcDtcblx0cGx1Z2luOiBNb3NoZTtcblx0Y2FjaGVGb2xkZXJQYXRoOiBzdHJpbmc7XG5cdHBhY2thZ2VDYWNoZUZvbGRlclBhdGg6IHN0cmluZztcblx0Y2FjaGU6IFthbnksIGFueV1bXSA9IFtdO1xuXHRwYWNrYWdlQ2FjaGU6IHsgW2tleTogc3RyaW5nXTogYW55IH1bXSA9IFt7fSwge30sIHt9LCB7fV07XG5cdHBsdWdpbkZvbGRlclBhdGg6IHN0cmluZztcblx0cGRmRW5naW5lOiBhbnk7XG5cdHBhY2thZ2VfdXJsOiBgaHR0cHM6Ly90ZXhsaXZlMi5zd2lmdGxhdGV4LmNvbS9gO1xuXHRjYWNoZU1hcDogTWFwPHN0cmluZywgU2V0PHN0cmluZz4+OyAvLyBLZXk6IG1kNSBoYXNoIG9mIGxhdGV4IHNvdXJjZS4gVmFsdWU6IFNldCBvZiBmaWxlIHBhdGggbmFtZXMuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE1vc2hlKSB7XG5cdFx0dGhpcy5hcHA9YXBwO1xuXHRcdHRoaXMucGx1Z2luPXBsdWdpbjtcblx0XHR0aGlzLm9ubG9hZCgpO1xuXHR9XG5cblx0YXN5bmMgb25sb2FkKCkge1xuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBTd2lmdExhVGVYIHBsdWdpblwiKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRDYWNoZSgpO1xuXHRcdHRoaXMucGx1Z2luRm9sZGVyUGF0aCA9IHBhdGguam9pbih0aGlzLmdldFZhdWx0UGF0aCgpLCB0aGlzLmFwcC52YXVsdC5jb25maWdEaXIsIFwicGx1Z2lucy9tb3NoZS1tYXRoL1wiKTtcblx0XHQvLyBpbml0aWFsaXplIHRoZSBsYXRleCBjb21waWxlclxuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogSW5pdGlhbGl6aW5nIExhVGVYIGNvbXBpbGVyXCIpO1xuXHRcdHRoaXMucGRmRW5naW5lID0gbmV3IFBkZlRlWEVuZ2luZSgpO1xuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBMYVRlWCBlbmdpbmVcIik7XG5cdFx0YXdhaXQgdGhpcy5wZGZFbmdpbmUubG9hZEVuZ2luZSgpO1xuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBjYWNoZVwiKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRQYWNrYWdlQ2FjaGUoKTtcblxuXHRcdHRoaXMucGRmRW5naW5lLnNldFRleGxpdmVFbmRwb2ludCh0aGlzLnBhY2thZ2VfdXJsKTtcblxuXHRcdHRoaXMuYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCk7XG5cdFx0Y29uc29sZS5sb2coXCJTd2lmdExhVGVYOiBSZWdpc3RlcmluZyBwb3N0IHByb2Nlc3NvcnNcIik7XG5cdFx0aWYgKHRydWUpIHtcblx0XHRcdGNvbnN0IHBkZkJsb2NrUHJvY2Vzc29yID0gTWFya2Rvd25QcmV2aWV3UmVuZGVyZXIuY3JlYXRlQ29kZUJsb2NrUG9zdFByb2Nlc3NvcihcImxhdGV4XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHRoaXMucmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlLCBlbCwgY3R4LCBmYWxzZSkpO1xuXHRcdFx0TWFya2Rvd25QcmV2aWV3UmVuZGVyZXIucmVnaXN0ZXJQb3N0UHJvY2Vzc29yKHBkZkJsb2NrUHJvY2Vzc29yKTtcblx0XHRcdGNvbnN0IHN2Z0Jsb2NrUHJvY2Vzc29yID0gTWFya2Rvd25QcmV2aWV3UmVuZGVyZXIuY3JlYXRlQ29kZUJsb2NrUG9zdFByb2Nlc3NvcihcImxhdGV4c3ZnXCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHRoaXMucmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlLCBlbCwgY3R4LCB0cnVlKSk7XG5cdFx0XHRNYXJrZG93blByZXZpZXdSZW5kZXJlci5yZWdpc3RlclBvc3RQcm9jZXNzb3Ioc3ZnQmxvY2tQcm9jZXNzb3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibGF0ZXhcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIGZhbHNlKSk7XG5cdFx0XHR0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibGF0ZXhzdmdcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4gdGhpcy5yZW5kZXJMYXRleFRvRWxlbWVudChzb3VyY2UsIGVsLCBjdHgsIHRydWUpKTtcblx0XHR9XG5cdH1cblxuXHRvbnVubG9hZCgpIHtcblx0XHR0aGlzLnVubG9hZENhY2hlKCk7XG5cdH1cblxuXG5cdGdldFZhdWx0UGF0aCgpIHtcblx0XHRpZiAodGhpcy5hcHAudmF1bHQuYWRhcHRlciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1BZGFwdGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hcHAudmF1bHQuYWRhcHRlci5nZXRCYXNlUGF0aCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJNb3NoZTogQ291bGQgbm90IGdldCB2YXVsdCBwYXRoLlwiKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2FkQ2FjaGUoKSB7XG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMuY2FjaGVGb2xkZXJQYXRoID0gcGF0aC5qb2luKGNhY2hlRm9sZGVyUGFyZW50UGF0aCwgXCJwZGYtY2FjaGVcIik7XG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMuY2FjaGVGb2xkZXJQYXRoKTtcblx0XHRcdHRoaXMuY2FjaGVNYXAgPSBuZXcgTWFwKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2FjaGVNYXAgPSBuZXcgTWFwKHRoaXMuY2FjaGUpO1xuXHRcdFx0Ly8gRm9yIHNvbWUgcmVhc29uIGB0aGlzLmNhY2hlYCBhdCB0aGlzIHBvaW50IGlzIGFjdHVhbGx5IGBNYXA8c3RyaW5nLCBBcnJheTxzdHJpbmc+PmBcblx0XHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMuY2FjaGVNYXApIHtcblx0XHRcdFx0dGhpcy5jYWNoZU1hcC5zZXQoaywgbmV3IFNldCh2KSlcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGFzeW5jIGxvYWRQYWNrYWdlQ2FjaGUoKSB7XG5cdFx0Y29uc3QgY2FjaGVGb2xkZXJQYXJlbnRQYXRoID0gcGF0aC5qb2luKHRoaXMuZ2V0VmF1bHRQYXRoKCksIHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpciwgXCJzd2lmdGxhdGV4LXJlbmRlci1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoY2FjaGVGb2xkZXJQYXJlbnRQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGNhY2hlRm9sZGVyUGFyZW50UGF0aCk7XG5cdFx0fVxuXHRcdHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCA9IHBhdGguam9pbihjYWNoZUZvbGRlclBhcmVudFBhdGgsIFwicGFja2FnZS1jYWNoZVwiKTtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0fVxuXHRcdGNvbnNvbGUubG9nKFwiU3dpZnRMYVRlWDogTG9hZGluZyBwYWNrYWdlIGNhY2hlXCIpO1xuXG5cdFx0Ly8gYWRkIGZpbGVzIGluIHRoZSBwYWNrYWdlIGNhY2hlIGZvbGRlciB0byB0aGUgY2FjaGUgbGlzdFxuXHRcdGNvbnN0IHBhY2thZ2VGaWxlcyA9IGZzLnJlYWRkaXJTeW5jKHRoaXMucGFja2FnZUNhY2hlRm9sZGVyUGF0aCk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIHBhY2thZ2VGaWxlcykge1xuXHRcdFx0Y29uc3QgZmlsZW5hbWUgPSBwYXRoLmJhc2VuYW1lKGZpbGUpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBcIi90ZXgvXCIrZmlsZW5hbWU7XG5cdFx0XHRjb25zdCBwYWNrYWdlVmFsdWVzID0gT2JqZWN0LnZhbHVlcyh0aGlzLnBhY2thZ2VDYWNoZVsxXSk7XG5cdFx0XHRpZiAoIXBhY2thZ2VWYWx1ZXMuaW5jbHVkZXModmFsdWUpKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IFwiMjYvXCIgKyBmaWxlbmFtZVxuXHRcdFx0XHR0aGlzLnBhY2thZ2VDYWNoZVsxXVtrZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIG1vdmUgcGFja2FnZXMgdG8gdGhlIFZGU1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnBhY2thZ2VDYWNoZVsxXSkpIHtcblx0XHRcdGNvbnN0IGZpbGVuYW1lID0gcGF0aC5iYXNlbmFtZSh2YWwpO1xuXHRcdFx0bGV0IHJlYWRfc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3JjY29kZSA9IGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoLCBmaWxlbmFtZSkpO1xuXHRcdFx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZVRleEZTRmlsZShmaWxlbmFtZSwgc3JjY29kZSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIHdoZW4gdW5hYmxlIHRvIHJlYWQgZmlsZSwgcmVtb3ZlIHRoaXMgZnJvbSB0aGUgY2FjaGVcblx0XHRcdFx0Y29uc29sZS5sb2coYFVuYWJsZSB0byByZWFkIGZpbGUgJHtmaWxlbmFtZX0gZnJvbSBwYWNrYWdlIGNhY2hlYClcblx0XHRcdFx0ZGVsZXRlIHRoaXMucGFja2FnZUNhY2hlWzFdW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gd3JpdGUgY2FjaGUgZGF0YSB0byB0aGUgVkZTLCBleGNlcHQgZG9uJ3Qgd3JpdGUgdGhlIHRleGxpdmU0MDRfY2FjaGUgYmVjYXVzZSB0aGlzIHdpbGwgY2F1c2UgcHJvYmxlbXMgd2hlbiBzd2l0Y2hpbmcgYmV0d2VlbiB0ZXhsaXZlIHNvdXJjZXNcblx0XHR0aGlzLnBkZkVuZ2luZS53cml0ZUNhY2hlRGF0YSh7fSxcblx0XHRcdHRoaXMucGFja2FnZUNhY2hlWzFdLFxuXHRcdFx0dGhpcy5wYWNrYWdlQ2FjaGVbMl0sXG5cdFx0XHR0aGlzLnBhY2thZ2VDYWNoZVszXSk7XG5cdH1cblxuXHR1bmxvYWRDYWNoZSgpIHtcblx0XHRmcy5ybWRpclN5bmModGhpcy5jYWNoZUZvbGRlclBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHR9XG5cblx0YWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuXHRcdC8vIEB0cy1pZ25vcmVcblx0XHR3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5wdXNoKHtuYW1lOiBcImxhdGV4c3ZnXCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XG5cdH1cblxuXHRmb3JtYXRMYXRleFNvdXJjZShzb3VyY2U6IHN0cmluZykge1xuXHRcdHJldHVybiBzb3VyY2U7XG5cdH1cblxuXHRoYXNoTGF0ZXhTb3VyY2Uoc291cmNlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gTWQ1Lmhhc2hTdHIoc291cmNlLnRyaW0oKSk7XG5cdH1cblxuXHRhc3luYyBwZGZUb0h0bWwocGRmRGF0YTogYW55KSB7XG5cdFx0Y29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gYXdhaXQgdGhpcy5nZXRQZGZEaW1lbnNpb25zKHBkZkRhdGEpO1xuXHRcdGNvbnN0IHJhdGlvID0gd2lkdGggLyBoZWlnaHQ7XG5cdFx0Y29uc3QgcGRmYmxvYiA9IG5ldyBCbG9iKFtwZGZEYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vcGRmJyB9KTtcblx0XHRjb25zdCBvYmplY3RVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKHBkZmJsb2IpO1xuXHRcdHJldHVybiAge1xuXHRcdFx0YXR0cjoge1xuXHRcdFx0ICBkYXRhOiBgJHtvYmplY3RVUkx9I3ZpZXc9Rml0SCZ0b29sYmFyPTBgLFxuXHRcdFx0ICB0eXBlOiAnYXBwbGljYXRpb24vcGRmJyxcblx0XHRcdCAgY2xhc3M6ICdibG9jay1sYW51YWdlLWxhdGV4Jyxcblx0XHRcdCAgc3R5bGU6IGB3aWR0aDoxMDAlOyBhc3BlY3QtcmF0aW86JHtyYXRpb31gXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHN2Z1RvSHRtbChzdmc6IGFueSkge1xuXHRcdGlmIChmYWxzZSkge1xuXHRcdFx0c3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN2Zztcblx0fVxuXHRcblx0YXN5bmMgZ2V0UGRmRGltZW5zaW9ucyhwZGY6IGFueSk6IFByb21pc2U8e3dpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyfT4ge1xuXHRcdGNvbnN0IHBkZkRvYyA9IGF3YWl0IFBERkRvY3VtZW50LmxvYWQocGRmKTtcblx0XHRjb25zdCBmaXJzdFBhZ2UgPSBwZGZEb2MuZ2V0UGFnZXMoKVswXTtcblx0XHRjb25zdCB7d2lkdGgsIGhlaWdodH0gPSBmaXJzdFBhZ2UuZ2V0U2l6ZSgpO1xuXHRcdHJldHVybiB7d2lkdGgsIGhlaWdodH07XG5cdH1cblx0Lypcblx0cGRmVG9TVkcocGRmRGF0YTogYW55KSB7XG5cdFx0cmV0dXJuIFBkZlRvQ2Fpcm8oKS50aGVuKChwZGZ0b2NhaXJvOiBhbnkpID0+IHtcblx0XHRcdHBkZnRvY2Fpcm8uRlMud3JpdGVGaWxlKCdpbnB1dC5wZGYnLCBwZGZEYXRhKTtcblx0XHRcdHBkZnRvY2Fpcm8uX2NvbnZlcnRQZGZUb1N2ZygpO1xuXHRcdFx0bGV0IHN2ZyA9IHBkZnRvY2Fpcm8uRlMucmVhZEZpbGUoJ2lucHV0LnN2ZycsIHtlbmNvZGluZzondXRmOCd9KTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSB1bmlxdWUgSUQgZm9yIGVhY2ggU1ZHIHRvIGF2b2lkIGNvbmZsaWN0c1xuXHRcdFx0Y29uc3QgaWQgPSBNZDUuaGFzaFN0cihzdmcudHJpbSgpKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgcmFuZG9tU3RyaW5nID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDEwKTtcblx0XHRcdGNvbnN0IHVuaXF1ZUlkID0gaWQuY29uY2F0KHJhbmRvbVN0cmluZyk7XG5cdFx0XHRjb25zdCBzdmdvQ29uZmlnOkNvbmZpZyA9ICB7XG5cdFx0XHRcdHBsdWdpbnM6IFsnc29ydEF0dHJzJywgeyBuYW1lOiAncHJlZml4SWRzJywgcGFyYW1zOiB7IHByZWZpeDogdW5pcXVlSWQgfSB9XVxuXHRcdFx0fTtcblx0XHRcdHN2ZyA9IG9wdGltaXplKHN2Zywgc3Znb0NvbmZpZykuZGF0YTsgXG5cblx0XHRcdHJldHVybiBzdmc7XG5cdH0pO1xuXHR9Ki9cblxuXHRjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcblx0XHQvLyBSZXBsYWNlIHRoZSBjb2xvciBcImJsYWNrXCIgd2l0aCBjdXJyZW50Q29sb3IgKHRoZSBjdXJyZW50IHRleHQgY29sb3IpXG5cdFx0Ly8gc28gdGhhdCBkaWFncmFtIGF4ZXMsIGV0YyBhcmUgdmlzaWJsZSBpbiBkYXJrIG1vZGVcblx0XHQvLyBBbmQgcmVwbGFjZSBcIndoaXRlXCIgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvclxuXG5cdFx0c3ZnID0gc3ZnLnJlcGxhY2UoL3JnYlxcKDAlLCAwJSwgMCVcXCkvZywgXCJjdXJyZW50Q29sb3JcIilcblx0XHRcdFx0LnJlcGxhY2UoL3JnYlxcKDEwMCUsIDEwMCUsIDEwMCVcXCkvZywgXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXCIpO1xuXG5cdFx0cmV0dXJuIHN2Zztcblx0fVxuXG5cblx0YXN5bmMgcmVuZGVyTGF0ZXhUb0VsZW1lbnQoc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBvdXRwdXRTVkc6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdGNvbnNvbGUubG9nKFwicmVuZGVyTGF0ZXhUb0VsZW1lbnQgY2FsbGVkXCIpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRsZXQgbWQ1SGFzaCA9IHRoaXMuaGFzaExhdGV4U291cmNlKHNvdXJjZSk7XG5cdFx0XHRsZXQgcGRmUGF0aCA9IHBhdGguam9pbih0aGlzLmNhY2hlRm9sZGVyUGF0aCwgYCR7bWQ1SGFzaH0ucGRmYCk7XG5cblx0XHRcdC8vIFBERiBmaWxlIGhhcyBhbHJlYWR5IGJlZW4gY2FjaGVkXG5cdFx0XHQvLyBDb3VsZCBoYXZlIGEgY2FzZSB3aGVyZSBwZGZDYWNoZSBoYXMgdGhlIGtleSBidXQgdGhlIGNhY2hlZCBmaWxlIGhhcyBiZWVuIGRlbGV0ZWRcblx0XHRcdGlmICh0aGlzLmNhY2hlTWFwLmhhcyhtZDVIYXNoKSAmJiBmcy5leGlzdHNTeW5jKHBkZlBhdGgpKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKFwiVXNpbmcgY2FjaGVkIFBERjogXCIsIG1kNUhhc2gpO1xuXHRcdFx0XHRsZXQgcGRmRGF0YSA9IGZzLnJlYWRGaWxlU3luYyhwZGZQYXRoKTtcblx0XHRcdFx0aWYgKG91dHB1dFNWRykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcigpLy90aGlzLnBkZlRvU1ZHKHBkZkRhdGEpLnRoZW4oKHN2Zzogc3RyaW5nKSA9PiB7IGVsLmlubmVySFRNTCA9IHRoaXMuc3ZnVG9IdG1sKHN2Zyk7fSlcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnBkZlRvSHRtbChwZGZEYXRhKS50aGVuKChodG1sRGF0YSk9PntlbC5jcmVhdGVFbChcIm9iamVjdFwiLCBodG1sRGF0YSk7IHJlc29sdmUoKTt9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmFkZEZpbGVUb0NhY2hlKG1kNUhhc2gsIGN0eC5zb3VyY2VQYXRoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKFwiUmVuZGVyaW5nIFBERjogXCIsIG1kNUhhc2gpO1xuXHRcdFx0XHRcblx0XHRcdFx0dGhpcy5yZW5kZXJMYXRleFRvUERGKHNvdXJjZSwgbWQ1SGFzaCkudGhlbigocjogYW55KSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5hZGRGaWxlVG9DYWNoZShtZDVIYXNoLCBjdHguc291cmNlUGF0aCk7XG5cdFx0XHRcdFx0aWYgKG91dHB1dFNWRykge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCk7Ly90aGlzLnBkZlRvU1ZHKHIucGRmKS50aGVuKChzdmc6IHN0cmluZykgPT4geyBlbC5pbm5lckhUTUwgPSB0aGlzLnN2Z1RvSHRtbChzdmcpO30pXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMucGRmVG9IdG1sKHIucGRmKS50aGVuKChodG1sRGF0YSk9PntlbC5jcmVhdGVFbChcIm9iamVjdFwiLCBodG1sRGF0YSk7IHJlc29sdmUoKTt9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZnMud3JpdGVGaWxlU3luYyhwZGZQYXRoLCByLnBkZik7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdCkuY2F0Y2goZXJyID0+IHsgXG5cdFx0XHRcdFx0bGV0IGVycm9yRGl2ID0gZWwuY3JlYXRlRWwoJ2RpdicsIHsgdGV4dDogYCR7ZXJyfWAsIGF0dHI6IHsgY2xhc3M6ICdibG9jay1sYXRleC1lcnJvcicgfSB9KTtcblx0XHRcdFx0XHRyZWplY3QoZXJyKTsgXG5cdFx0XHRcdH0pO1x0XHRcdFx0XG5cdFx0XHR9XG5cdFx0fSkudGhlbigoKSA9PiB7IFxuXHRcdFx0dGhpcy5wZGZFbmdpbmUuZmx1c2hDYWNoZSgpO1xuXHRcdFx0IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5jbGVhblVwQ2FjaGUoKSwgMTAwMCk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZW5kZXJMYXRleFRvUERGKHNvdXJjZTogc3RyaW5nLCBtZDVIYXNoOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0c291cmNlID0gdGhpcy5mb3JtYXRMYXRleFNvdXJjZShzb3VyY2UpO1xuXG5cdFx0XHR0ZW1wLm1rZGlyKFwib2JzaWRpYW4tc3dpZnRsYXRleC1yZW5kZXJlclwiLCBhc3luYyAoZXJyLCBkaXJQYXRoKSA9PiB7XG5cdFx0XHRcdFxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHdhaXRGb3IoKCkgPT4gdGhpcy5wZGZFbmdpbmUuaXNSZWFkeSgpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVycikgcmVqZWN0KGVycik7XG5cdFx0XHRcdHRoaXMucGRmRW5naW5lLndyaXRlTWVtRlNGaWxlKFwibWFpbi50ZXhcIiwgc291cmNlKTtcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuc2V0RW5naW5lTWFpbkZpbGUoXCJtYWluLnRleFwiKTtcblx0XHRcdFx0dGhpcy5wZGZFbmdpbmUuY29tcGlsZUxhVGVYKCkudGhlbigocjogYW55KSA9PiB7XG5cdFx0XHRcdGlmIChyLnN0YXR1cyAhPSAwKSB7XG5cdFx0XHRcdFx0Ly8gbWFuYWdlIGxhdGV4IGVycm9yc1xuXHRcdFx0XHRcdHJlamVjdChyLmxvZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gdXBkYXRlIHRoZSBsaXN0IG9mIHBhY2thZ2UgZmlsZXMgaW4gdGhlIGNhY2hlXG5cdFx0XHRcdHRoaXMuZmV0Y2hQYWNrYWdlQ2FjaGVEYXRhKClcblx0XHRcdFx0cmVzb2x2ZShyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KVxuXHRcdH0pO1xuXHR9XG5cblx0ZmV0Y2hQYWNrYWdlQ2FjaGVEYXRhKCk6IHZvaWQge1xuXHRcdHRoaXMucGRmRW5naW5lLmZldGNoQ2FjaGVEYXRhKCkudGhlbigocjogU3RyaW5nTWFwW10pID0+IHtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgci5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoaSA9PT0gMSkgeyAvLyBjdXJyZW50bHkgb25seSBkZWFsaW5nIHdpdGggdGV4bGl2ZTIwMF9jYWNoZVxuXHRcdFx0XHRcdC8vIGdldCBkaWZmc1xuXHRcdFx0XHRcdGNvbnN0IG5ld0ZpbGVOYW1lcyA9IHRoaXMuZ2V0TmV3UGFja2FnZUZpbGVOYW1lcyh0aGlzLnBhY2thZ2VDYWNoZVtpXSwgcltpXSk7XG5cdFx0XHRcdFx0Ly8gZmV0Y2ggbmV3IHBhY2thZ2UgZmlsZXNcblx0XHRcdFx0XHR0aGlzLnBkZkVuZ2luZS5mZXRjaFRleEZpbGVzKG5ld0ZpbGVOYW1lcywgdGhpcy5wYWNrYWdlQ2FjaGVGb2xkZXJQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5wYWNrYWdlQ2FjaGUgPSByO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0TmV3UGFja2FnZUZpbGVOYW1lcyhvbGRDYWNoZURhdGE6IFN0cmluZ01hcCwgbmV3Q2FjaGVEYXRhOiBTdHJpbmdNYXApOiBzdHJpbmdbXSB7XG5cdFx0Ly8gYmFzZWQgb24gdGhlIG9sZCBhbmQgbmV3IHBhY2thZ2UgZmlsZXMgaW4gcGFja2FnZSBjYWNoZSBkYXRhLFxuXHRcdC8vIHJldHVybiB0aGUgbmV3IHBhY2thZ2UgZmlsZXNcblx0XHRsZXQgbmV3S2V5cyA9IE9iamVjdC5rZXlzKG5ld0NhY2hlRGF0YSkuZmlsdGVyKGtleSA9PiAhKGtleSBpbiBvbGRDYWNoZURhdGEpKTtcblx0XHRsZXQgbmV3UGFja2FnZUZpbGVzID0gbmV3S2V5cy5tYXAoa2V5ID0+IHBhdGguYmFzZW5hbWUobmV3Q2FjaGVEYXRhW2tleV0pKTtcdFx0XG5cdFx0cmV0dXJuIG5ld1BhY2thZ2VGaWxlcztcblx0fVxuXG5cdGFzeW5jIHNhdmVDYWNoZSgpIHtcblx0XHRsZXQgdGVtcCA9IG5ldyBNYXAoKTtcblx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLmNhY2hlTWFwKSB7XG5cdFx0XHR0ZW1wLnNldChrLCBbLi4udl0pXG5cdFx0fVxuXHRcdHRoaXMuY2FjaGUgPSBbLi4udGVtcF07XG5cblx0fVxuXG5cdGFkZEZpbGVUb0NhY2hlKGhhc2g6IHN0cmluZywgZmlsZV9wYXRoOiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuY2FjaGVNYXAuaGFzKGhhc2gpKSB7XG5cdFx0XHR0aGlzLmNhY2hlTWFwLnNldChoYXNoLCBuZXcgU2V0KCkpO1xuXHRcdH1cblx0XHR0aGlzLmNhY2hlTWFwLmdldChoYXNoKT8uYWRkKGZpbGVfcGF0aCk7XG5cdH1cblxuXHRhc3luYyBjbGVhblVwQ2FjaGUoKSB7XG5cdFx0bGV0IGZpbGVfcGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGZwcyBvZiB0aGlzLmNhY2hlTWFwLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZwIG9mIGZwcykge1xuXHRcdFx0XHRmaWxlX3BhdGhzLmFkZChmcCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBmaWxlX3BhdGggb2YgZmlsZV9wYXRocykge1xuXHRcdFx0bGV0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZV9wYXRoKTtcblx0XHRcdGlmIChmaWxlID09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVGaWxlRnJvbUNhY2hlKGZpbGVfcGF0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZW1vdmVVbnVzZWRDYWNoZXNGb3JGaWxlKGZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuc2F2ZUNhY2hlKCk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVVbnVzZWRDYWNoZXNGb3JGaWxlKGZpbGU6IFRGaWxlKSB7XG5cdFx0bGV0IGhhc2hlc19pbl9maWxlID0gYXdhaXQgdGhpcy5nZXRMYXRleEhhc2hlc0Zyb21GaWxlKGZpbGUpO1xuXHRcdGxldCBoYXNoZXNfaW5fY2FjaGUgPSB0aGlzLmdldExhdGV4SGFzaGVzRnJvbUNhY2hlRm9yRmlsZShmaWxlKTtcblx0XHRmb3IgKGNvbnN0IGhhc2ggb2YgaGFzaGVzX2luX2NhY2hlKSB7XG5cdFx0XHRpZiAoIWhhc2hlc19pbl9maWxlLmNvbnRhaW5zKGhhc2gpKSB7XG5cdFx0XHRcdHRoaXMuY2FjaGVNYXAuZ2V0KGhhc2gpPy5kZWxldGUoZmlsZS5wYXRoKTtcblx0XHRcdFx0aWYgKHRoaXMuY2FjaGVNYXAuZ2V0KGhhc2gpPy5zaXplID09IDApIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZVBERkZyb21DYWNoZShoYXNoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlbW92ZVBERkZyb21DYWNoZShrZXk6IHN0cmluZykge1xuXHRcdHRoaXMuY2FjaGVNYXAuZGVsZXRlKGtleSk7XG5cdFx0ZnMucm1TeW5jKHBhdGguam9pbih0aGlzLmNhY2hlRm9sZGVyUGF0aCwgYCR7a2V5fS5wZGZgKSk7XG5cdH1cblxuXHRyZW1vdmVGaWxlRnJvbUNhY2hlKGZpbGVfcGF0aDogc3RyaW5nKSB7XG5cdFx0Zm9yIChjb25zdCBoYXNoIG9mIHRoaXMuY2FjaGVNYXAua2V5cygpKSB7XG5cdFx0XHR0aGlzLmNhY2hlTWFwLmdldChoYXNoKT8uZGVsZXRlKGZpbGVfcGF0aCk7XG5cdFx0XHRpZiAodGhpcy5jYWNoZU1hcC5nZXQoaGFzaCk/LnNpemUgPT0gMCkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZVBERkZyb21DYWNoZShoYXNoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRMYXRleEhhc2hlc0Zyb21DYWNoZUZvckZpbGUoZmlsZTogVEZpbGUpIHtcblx0XHRsZXQgaGFzaGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBwYXRoID0gZmlsZS5wYXRoO1xuXHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMuY2FjaGVNYXAuZW50cmllcygpKSB7XG5cdFx0XHRpZiAodi5oYXMocGF0aCkpIHtcblx0XHRcdFx0aGFzaGVzLnB1c2goayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBoYXNoZXM7XG5cdH1cblxuXHRhc3luYyBnZXRMYXRleEhhc2hlc0Zyb21GaWxlKGZpbGU6IFRGaWxlKSB7XG5cdFx0bGV0IGhhc2hlczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgc2VjdGlvbnMgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKT8uc2VjdGlvbnNcblx0XHRpZiAoc2VjdGlvbnMgIT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRsZXQgbGluZXMgPSAoYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKSkuc3BsaXQoJ1xcbicpO1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHNlY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChzZWN0aW9uLnR5cGUgIT0gXCJjb2RlXCIgJiYgbGluZXNbc2VjdGlvbi5wb3NpdGlvbi5zdGFydC5saW5lXS5tYXRjaChcImBgYCAqbGF0ZXhcIikgPT0gbnVsbCkgY29udGludWU7XG5cdFx0XHRcdGxldCBzb3VyY2UgPSBsaW5lcy5zbGljZShzZWN0aW9uLnBvc2l0aW9uLnN0YXJ0LmxpbmUgKyAxLCBzZWN0aW9uLnBvc2l0aW9uLmVuZC5saW5lKS5qb2luKFwiXFxuXCIpO1xuXHRcdFx0XHRsZXQgaGFzaCA9IHRoaXMuaGFzaExhdGV4U291cmNlKHNvdXJjZSk7XG5cdFx0XHRcdGhhc2hlcy5wdXNoKGhhc2gpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGFzaGVzO1xuXHR9XG59XG5cbiJdfQ==