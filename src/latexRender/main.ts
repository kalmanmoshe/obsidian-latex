
import { FileSystemAdapter, MarkdownPostProcessorContext, TFile, MarkdownPreviewRenderer } from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
import {CompileResult, PdfTeXEngine} from './PdfTeXEngine';
import {PDFDocument} from 'pdf-lib';
import {Config,optimize} from 'svgo';
import Moshe from '../main';
import { StringMap } from 'src/settings/settings.js';
import { getPreamble } from 'src/tikzjax/interpret/tokenizeTikzjax';
const { exec } = require('child_process');
let parse: any;
import('@unified-latex/unified-latex-util-parse').then(module => {
	parse = module.parse;
});

const waitFor = async (condFunc: () => boolean) => {
	return new Promise<void>((resolve) => {
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
	plugin: Moshe;
	cacheFolderPath: string;
	packageCacheFolderPath: string;
	pluginFolderPath: string;
	pdfEngine: PdfTeXEngine;

	cache: Map<string, Set<string>>; // Key: md5 hash of latex source. Value: Set of file path names.
	async onload(plugin: Moshe) {
		this.plugin = plugin;
		await this.loadCache();
		this.pluginFolderPath = path.join(this.getVaultPath(), this.plugin.app.vault.configDir, "plugins/swiftlatex-render/");
		// initialize the latex compiler
		this.pdfEngine = new PdfTeXEngine();
		await this.pdfEngine.loadEngine();
		await this.loadPackageCache();
		this.pdfEngine.setTexliveEndpoint(this.plugin.settings.package_url);
		
		
	}
	universalCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext){
		source=getPreamble(this.plugin.app)+source+"\n\\end{tikzpicture}\\end{document}"
		if(!this.pdfEngine.isReady()){
			throw new Error("SwiftLaTeX: Engine is not ready yet!");
		}
		try {
			const ast = parse(source);
			console.log(ast);
			this.renderLatexToElement(source, el, ctx);
		} catch (e) {
			console.error(e);
		}
	}

	getVaultPath() {
		if (this.plugin.app.vault.adapter instanceof FileSystemAdapter) {
			return this.plugin.app.vault.adapter.getBasePath();
		} else {
			throw new Error("SwiftLaTeX: Could not get vault path.");
		}
	}

	async loadCache() {
		const cacheFolderParentPath = path.join(this.getVaultPath(), this.plugin.app.vault.configDir, "swiftlatex-render-cache");
		if (!fs.existsSync(cacheFolderParentPath)) {
			fs.mkdirSync(cacheFolderParentPath);
		}
		this.cacheFolderPath = path.join(cacheFolderParentPath, "pdf-cache");
		if (!fs.existsSync(this.cacheFolderPath)) {
			fs.mkdirSync(this.cacheFolderPath);
			this.cache = new Map();
		} else {
			this.cache = new Map(this.plugin.settings.cache);
			// For some reason `this.cache` at this point is actually `Map<string, Array<string>>`
			for (const [k, v] of this.cache) {
				this.cache.set(k, new Set(v))
			}
		}
	}
	

	async loadPackageCache() {
		const cacheFolderParentPath = path.join(this.getVaultPath(), this.plugin.app.vault.configDir, "swiftlatex-render-cache");
		if (!fs.existsSync(cacheFolderParentPath)) {
			fs.mkdirSync(cacheFolderParentPath);
		}
		this.packageCacheFolderPath = path.join(cacheFolderParentPath, "package-cache");
		if (!fs.existsSync(this.packageCacheFolderPath)) {
			fs.mkdirSync(this.packageCacheFolderPath);
		}

		// add files in the package cache folder to the cache list
		const packageFiles = fs.readdirSync(this.packageCacheFolderPath);
		for (const file of packageFiles) {
			const filename = path.basename(file);
			const value = "/tex/"+filename;
			const packageValues = Object.values(this.plugin.settings.packageCache[1]);
			if (!packageValues.includes(value)) {
				const key = "26/" + filename
				this.plugin.settings.packageCache[1][key] = value;
			}
		}
		// move packages to the VFS
		for (const [key, val] of Object.entries(this.plugin.settings.packageCache[1])) {
			const filename = path.basename(val);
			//const read_success = false;
			try {
				const srccode = fs.readFileSync(path.join(this.packageCacheFolderPath, filename));
				this.pdfEngine.writeTexFSFile(filename, srccode);
			} catch (e) {
				// when unable to read file, remove this from the cache
				console.warn(`Unable to read file ${filename} from package cache`,e)
				delete this.plugin.settings.packageCache[1][key];
			}
		}

		// write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
		this.pdfEngine.writeCacheData(
			{},
			this.plugin.settings.packageCache[1],
			this.plugin.settings.packageCache[2],
			this.plugin.settings.packageCache[3]
	);
	}

	unloadCache() {
		fs.rmdirSync(this.cacheFolderPath, { recursive: true });
	}


	hashLatexSource(source: string) {
		return Md5.hashStr(source.replace(/\s/g, ''))
	}

	async pdfToHtml(pdfData: Buffer<ArrayBufferLike>) {
		const {width, height} = await this.getPdfDimensions(pdfData);
		const ratio = width / height;
		const pdfblob = new Blob([pdfData], { type: 'application/pdf' });
		const objectURL = URL.createObjectURL(pdfblob);
		return  {
			attr: {
			data: `${objectURL}#view=FitH&toolbar=0`,
			type: 'application/pdf',
			class: 'block-lanuage-latex',
			style: `width:100%; aspect-ratio:${ratio}`
			}
		};
	}
	
	async getPdfDimensions(pdf: any): Promise<{width: number, height: number}> {
		const pdfDoc = await PDFDocument.load(pdf);
		const firstPage = pdfDoc.getPages()[0];
		const {width, height} = firstPage.getSize();
		return {width, height};
	}

	pdfToSVG(pdfData: Buffer<ArrayBufferLike>) {
		return new Promise((resolve, reject) => {
			fs.writeFileSync('input.pdf', pdfData);

			exec('pdftocairo -svg input.pdf output.svg', (error: { message: any; }, stdout: any, stderr: any) => {

				if (error){console.error(`Error: ${error.message}`);reject(error);return;}
				if (stderr){console.error(`stderr: ${stderr}`);}
			
				// Read the output SVG file
				fs.readFile('output.svg', 'utf8', (err, svg) => {
					if (err) {console.error(`Error reading SVG: ${err.message}`);reject(err);return;}
					// Generate a unique ID for each SVG to avoid conflicts
					const id = Md5.hashStr(svg.trim()).toString();
					const randomString = Math.random().toString(36).substring(2, 10);
					const uniqueId = id.concat(randomString);
					// Optimize the SVG
					const svgoConfig:Config = {
					plugins: ['sortAttrs', { name: 'prefixIds', params: { prefix: uniqueId } }]
					};
					svg = optimize(svg, svgoConfig).data;
			
					resolve(svg);
				});
			});
		});
	}



	private async renderLatexToElement(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		return new Promise<void>((resolve, reject) => {
			const md5Hash = this.hashLatexSource(source);
			const pdfPath = path.join(this.cacheFolderPath, `${md5Hash}.svg`);

			// PDF file has already been cached
			// Could have a case where pdfCache has the key but the cached file has been deleted
			if (this.cache.has(md5Hash) && fs.existsSync(pdfPath)) {
				const pdfData = fs.readFileSync(pdfPath);
				this.translatePDF(pdfData, el);
			}
			else {
				this.renderLatexToPDF(source, md5Hash).then((result: CompileResult) => {
					this.translatePDF(result.pdf, el);
					fs.writeFileSync(pdfPath,el.innerHTML);
				}
				).catch(err => {
					console.warn();
					const errorDiv = el.createEl('div', { text: `swiftlatexError`/*text: `${err}`*/, attr: { class: 'block-latex-error' } });
					reject(err); 
				});				
			}
			this.addFileToPDFCache(md5Hash, ctx.sourcePath);
			resolve();
		}).then(() => { 
			this.pdfEngine.flushCache();
			setTimeout(() => this.cleanUpCache(), 1000);
		});

	}

	private async translatePDF(pdfData: Buffer<ArrayBufferLike>, el: HTMLElement, outputSVG = true): Promise<void> {
		return new Promise<void>((resolve) => { 
			if (outputSVG)
				this.pdfToSVG(pdfData).then((svg: string) => {el.innerHTML = svg;resolve();});
			else
				this.pdfToHtml(pdfData).then((htmlData) => {el.createEl("object", htmlData);resolve();});
		});
	}

	private renderLatexToPDF(source: string, md5Hash: string): Promise<CompileResult> {
		return new Promise(async (resolve, reject) => {
			temp.mkdir("obsidian-swiftlatex-renderer", async (err: any, dirPath: any) => {
				
				try {
					await waitFor(() => this.pdfEngine.isReady());
				} catch (err) {
					reject(err);
					return;
				}
				if (err) reject(err);

				this.pdfEngine.writeMemFSFile("main.tex", source);
				this.pdfEngine.setEngineMainFile("main.tex");
				this.pdfEngine.compileLaTeX().then((result: CompileResult) => {
					if (result.status != 0) {
						// manage latex errors
						reject(result.log);
					}
					// update the list of package files in the cache
					this.fetchPackageCacheData()
					resolve(result);
				});
			})
		});
	}
	/**
	 * There are four catches:
	 * 1. texlive404_cache - Not found files
	 * 2. texlive200_cache
	 * 3. pk404_cache - Not found files
	 * 4. pk200_cache
	 * currently only dealing with texlive200_cache
	 */
	fetchPackageCacheData(): void {
		this.pdfEngine.fetchCacheData().then((r: StringMap[]) => {
			const newFileNames = this.getNewPackageFileNames(this.plugin.settings.packageCache[1], r[1]);
			this.pdfEngine.fetchTexFiles(newFileNames, this.packageCacheFolderPath);
			this.plugin.settings.packageCache = r;
			this.plugin.saveSettings().then();
		});
	}

	getNewPackageFileNames(oldCacheData: StringMap, newCacheData: StringMap): string[] 
	{
		// based on the old and new package files in package cache data,
		// return the new package files
		let newKeys = Object.keys(newCacheData).filter(key => !(key in oldCacheData));
		let newPackageFiles = newKeys.map(key => path.basename(newCacheData[key]));		
		return newPackageFiles;
	}

	private async saveCache() {
		const temp = new Map();
		for (const [k, v] of this.cache) {
			temp.set(k, [...v])
		}
		this.plugin.settings.cache = [...temp];
		await this.plugin.saveSettings();

	}

	private addFileToPDFCache(hash: string, file_path: string) {
		if (!this.cache.has(hash)) {
			this.cache.set(hash, new Set());
		}
		this.cache.get(hash)?.add(file_path);
	}

	private async cleanUpCache() {
		const file_paths = new Set<string>();
		for (const fps of this.cache.values()) {
			for (const fp of fps) {
				file_paths.add(fp);
			}
		}

		for (const file_path of file_paths) {
			const file = this.plugin.app.vault.getAbstractFileByPath(file_path);
			if (file == null) {
				this.removeFileFromCache(file_path);
			} else {
				if (file instanceof TFile) {
					await this.removeUnusedCachesForFile(file);
				}
			}
		}
		await this.saveCache();
	}

	async removeUnusedCachesForFile(file: TFile) {
		const hashes_in_file = await this.getLatexHashesFromFile(file);
		const hashes_in_cache = this.getLatexHashesFromCacheForFile(file);
		for (const hash of hashes_in_cache) {
			if (!hashes_in_file.contains(hash)) {
				this.cache.get(hash)?.delete(file.path);
				if (this.cache.get(hash)?.size == 0) {
					this.removePDFFromCache(hash);
				}
			}
		}
	}

	removePDFFromCache(key: string) {
		if(this.cache.has(key))
			this.cache.delete(key);
		const filePath=path.join(this.cacheFolderPath, `${key}.pdf`)
		if (fs.existsSync(filePath)) {
			fs.rmSync(filePath);
		}
	}

	removeFileFromCache(file_path: string) {
		for (const hash of this.cache.keys()) {
			this.cache.get(hash)?.delete(file_path);
			if (this.cache.get(hash)?.size == 0) {
				this.removePDFFromCache(hash);
			}
		}
	}

	getLatexHashesFromCacheForFile(file: TFile) {
		const hashes: string[] = [];
		const path = file.path;
		for (const [k, v] of this.cache.entries()) {
			if (v.has(path)) {
				hashes.push(k);
			}
		}
		return hashes;
	}

	async getLatexHashesFromFile(file: TFile) {
		const hashes: string[] = [];
		const sections = this.plugin.app.metadataCache.getFileCache(file)?.sections
		if (sections != undefined) {
			const lines = (await this.plugin.app.vault.read(file)).split('\n');
			for (const section of sections) {
				if (section.type != "code" && lines[section.position.start.line].match("``` *latex") == null) continue;
				const source = lines.slice(section.position.start.line + 1, section.position.end.line).join("\n");
				const hash = this.hashLatexSource(source);
				hashes.push(hash);
			}
		}
		return hashes;
	}
}
class swiftlatexError {
	version: number;
	static interpret(error: string): swiftlatexError {

		return new swiftlatexError();
	}
}