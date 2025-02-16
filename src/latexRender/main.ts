
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
import async from 'async';
import { LatexabstractSyntaxTree } from './parse/parse';
const PdfToCairo = require("./pdftocairo.js")
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

type Task = { source: string, el: HTMLElement,md5Hash:string, sourcePath: string , blockId: string};
const catchFileFormat="svg"

export class SwiftlatexRender {
	plugin: Moshe;
	cacheFolderPath: string;
	packageCacheFolderPath: string;
	pdfEngine: PdfTeXEngine;
	cache: Map<string, Set<string>>;
	queue: async.QueueObject<Task>;
	async onload(plugin: Moshe) {
		this.plugin = plugin;
		this.validateCatchDirectory();
		await this.loadCache();
		// initialize the latex compiler
		this.pdfEngine = new PdfTeXEngine();
		await this.pdfEngine.loadEngine();
		await this.loadPackageCache();
		this.pdfEngine.setTexliveEndpoint(this.plugin.settings.package_url);
		this.configQueue();
	}
	configQueue() {
		const WAIT_TIME_MS = 4 * 1000; // Replace X with your desired seconds
		
		this.queue = async.queue((task, done) => {
			task.source=getPreamble(this.plugin.app)+task.source+"\n\\end{tikzpicture}\\end{document}"

			const ast = new LatexabstractSyntaxTree();
			try {
				ast.prase(task.source);
				ast.a();
				console.log("source", ast.ast,ast.myAst);
				ast.deleteComments();
				task.source = ast.toString();
				console.log(ast.cleanUpDefs());
			} catch (e) {
				console.error("Error parsing latex", e);
				ast.prase(task.source);
				ast.deleteComments();
				task.source = ast.toString();
			}

			this.renderLatexToElement(task.source, task.el,task.md5Hash, task.sourcePath)
			.then(() => {
				// Wait X seconds before marking the task as done
				setTimeout(() =>{done();updateCountdown();}, WAIT_TIME_MS);
			})
			.catch((err) => {
				console.error('Error processing task:', err);
				// Optionally, delay even on errors:
				setTimeout(() => {done(err);updateCountdown();}, WAIT_TIME_MS);
			});
		}, 1); // Concurrency is set to 1, so tasks run one at a time
		const updateCountdown = () => {
			//@ts-ignore
			let taskNode = this.queue._tasks.head;
			let index = 0;
			while (taskNode) {
				const task = taskNode.data;
				const countdown = task.el.querySelector(".moshe-latex-render-countdown");
				if (countdown) 
					countdown.textContent = index.toString();
				else 
					console.warn(`Countdown not found for task ${index}`);
				taskNode = taskNode.next;
				index++;
			}
		};
	}
	  
	

	private getVaultPath() {
		if (this.plugin.app.vault.adapter instanceof FileSystemAdapter) {
			return this.plugin.app.vault.adapter.getBasePath();
		} else {
			throw new Error("SwiftLaTeX: Could not get vault path.");
		}
	}
	
	private validateCatchDirectory(){
		const cacheFolderParentPath = path.join(this.getVaultPath(), this.plugin.app.vault.configDir, "swiftlatex-render-cache");
		this.packageCacheFolderPath = path.join(cacheFolderParentPath, "package-cache");
		this.cacheFolderPath = path.join(cacheFolderParentPath, "pdf-cache");

		//if swiftlatex-render-cache folder does not exist, create it
		if (!fs.existsSync(cacheFolderParentPath)) {
			fs.mkdirSync(cacheFolderParentPath);
		}
		if (!fs.existsSync(this.packageCacheFolderPath)) {
			fs.mkdirSync(this.packageCacheFolderPath);
		}
		if (!fs.existsSync(this.cacheFolderPath)) {
			fs.mkdirSync(this.cacheFolderPath);
			this.cache = new Map();
		}
	}

	private async loadCache() {
		this.cache = new Map(this.plugin.settings.cache);
		// For some reason `this.cache` at this point is actually `Map<string, Array<string>>`
		for (const [k, v] of this.cache) {
			this.cache.set(k, new Set(v))
		}
	}

	private async loadPackageCache() {
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
	onunload() {
		this.pdfEngine.flushCache();
		this.pdfEngine.closeWorker();
		this.cleanUpCache();
	}
	private unloadCache() {
		this.pdfEngine.flushCache();
		fs.rmdirSync(this.cacheFolderPath, { recursive: true });
	}

	private hashLatexSource(source: string) {
		//i need to also remove all comments
		return Md5.hashStr(source.replace(/\s/g, ''))
	}

	private async pdfToHtml(pdfData: Buffer<ArrayBufferLike>) {
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
	
	private async getPdfDimensions(pdf: any): Promise<{width: number, height: number}> {
		const pdfDoc = await PDFDocument.load(pdf);
		const firstPage = pdfDoc.getPages()[0];
		const {width, height} = firstPage.getSize();
		return {width, height};
	}
	private pdfToSVG(pdfData: any) {
		return PdfToCairo().then((pdftocairo: any) => {
			pdftocairo.FS.writeFile('input.pdf', pdfData);
			pdftocairo._convertPdfToSvg();
			let svg = pdftocairo.FS.readFile('input.svg', {encoding:'utf8'});
			const id = Md5.hashStr(svg.trim()).toString();
			const randomString = Math.random().toString(36).substring(2, 10);
			const uniqueId = id.concat(randomString);
			const svgoConfig:Config =  {
				plugins: ['sortAttrs', { name: 'prefixIds', params: { prefix: uniqueId } }]
			};
			svg = optimize(svg, svgoConfig).data; 
			svg = this.colorSVGinDarkMode(svg);

			return svg;
		});
	}
	universalCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const md5Hash = this.hashLatexSource(source);
		// PDF file has already been cached
		// Could have a case where pdfCache has the key but the cached file has been deleted
		const dataPath = path.join(this.cacheFolderPath, `${md5Hash}.${catchFileFormat}`);
		if (this.cache.has(md5Hash) && fs.existsSync(dataPath)) {
			const data = fs.readFileSync(dataPath, 'utf8');
			el.innerHTML = data
		}
		else {
			//Reliable enough for repeated entries
			const blockId = `${ctx.sourcePath.replace(/[^\wא-ת]/g, '_')}_${ctx.getSectionInfo(el)?.lineStart}`;
			this.queue.remove(node => node.data.blockId === blockId);
			el.appendChild(createWaitingCountdown(this.queue.length()));
			this.queue.push({ source, el,md5Hash, sourcePath: ctx.sourcePath, blockId });
		}
	}
	private async renderLatexToElement(source: string, el: HTMLElement,md5Hash:string, sourcePath: string,) {
		return new Promise<void>((resolve, reject) => {
			const dataPath = path.join(this.cacheFolderPath, `${md5Hash}.${catchFileFormat}`);
			this.renderLatexToPDF(source, md5Hash).then((result: CompileResult) => {
					el.innerHTML = ""
					this.translatePDF(result.pdf, el).then(() => {
						fs.writeFileSync(dataPath,el.innerHTML);
					});
				}).catch(err => {
					el.innerHTML = "";
					SwiftlatexError.interpret(err);
					const errorDiv = el.createEl('div', { text: `swiftlatexError`/*text: `${err}`*/, attr: { class: 'block-latex-error' } });
					reject(err); 
				});		
			this.addFileToCache(md5Hash, sourcePath);
			resolve();
		}).then(() => { 
			//this.pdfEngine.flushCache();
			setTimeout(() => this.cleanUpCache(), 1000);
		});

	}

	private async translatePDF(pdfData: Buffer<ArrayBufferLike>, el: HTMLElement, outputSVG = true): Promise<void> {
		return new Promise<void>((resolve) => { 
			if (outputSVG)
				this.pdfToSVG(pdfData).then((svg: string) => { el.innerHTML = svg; resolve();});
			else
				this.pdfToHtml(pdfData).then((htmlData) => {el.createEl("object", htmlData);resolve();});
		});
	}
	private colorSVGinDarkMode(svg: string) {
		// Replace the color "black" with currentColor (the current text color)
		// so that diagram axes, etc are visible in dark mode
		// and replace "white" with the background color
		if (this.plugin.settings.invertColorsInDarkMode) {
		  if (document.body.classList.contains('theme-dark')) {
			svg = svg.replace(/rgb\(0%, 0%, 0%\)/g, "currentColor")
					 .replace(/rgb\(100%, 100%, 100%\)/g, "var(--background-primary)");
		  } else {
			svg = svg.replace(/rgb\(100%, 100%, 100%\)/g, "currentColor")
					 .replace(/rgb\(0%, 0%, 0%\)/g, "var(--background-primary)");
		  }
		}
		return svg;
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

	private getNewPackageFileNames(oldCacheData: StringMap, newCacheData: StringMap): string[] 
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

	private addFileToCache(hash: string, file_path: string) {
		if (!this.cache.has(hash)) {
			this.cache.set(hash, new Set());
		}
		this.cache.get(hash)!.add(file_path);
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
			if (file instanceof TFile) {
				await this.removeUnusedCachesForFile(file);
			}
		}
		await this.saveCache();
	}

	private async removeUnusedCachesForFile(file: TFile) {
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

	private removePDFFromCache(key: string) {
		if(this.cache.has(key))
			this.cache.delete(key);
		const filePath=path.join(this.cacheFolderPath, `${key}.${catchFileFormat}`);
		if (fs.existsSync(filePath)) {
			fs.rmSync(filePath);
		}
	}

	private removeFileFromCache(file_path: string) {
		for (const hash of this.cache.keys()) {
			this.cache.get(hash)?.delete(file_path);
			if (this.cache.get(hash)?.size == 0) {
				this.removePDFFromCache(hash);
			}
		}
	}

	private getLatexHashesFromCacheForFile(file: TFile) {
		const hashes: string[] = [];
		const path = file.path;
		for (const [k, v] of this.cache.entries()) {
			if (v.has(path)) {
				hashes.push(k);
			}
		}
		return hashes;
	}

	private async getLatexHashesFromFile(file: TFile) {
		const hashes: string[] = [];
		const sections = this.plugin.app.metadataCache.getFileCache(file)?.sections
		if (sections != undefined) {
			const lines = (await this.plugin.app.vault.read(file)).split('\n');
			for (const section of sections) {
				if (section.type != "code" && lines[section.position.start.line].match("``` *latex") == null) continue;
				let source = lines.slice(section.position.start.line + 1, section.position.end.line).join("\n");
				const hash = this.hashLatexSource(source);
				hashes.push(hash);
			}
		}
		return hashes;
	}
}


enum latexErrors{
	undefinedControlSequence="LaTeX does not recognize a command in your document"
}



class SwiftlatexError {
	version: number;
	static interpret(error: string): SwiftlatexError {
		let a=error.split("\n")
		let version=a[0];
		a=a.filter((line)=>!line.includes("(/tex/"))

		console.error(a);
		return new SwiftlatexError();
	}
}



function createWaitingCountdown(index: number){
	const parentContainer = Object.assign(document.createElement("div"), { 
		className: "moshe-latex-render-loader-parent-container" 
	});
	const loader = Object.assign(document.createElement("div"), { 
		className: "moshe-latex-render-loader" 
	});
	const countdown = Object.assign(document.createElement("div"), { 
		className: "moshe-latex-render-countdown", 
		textContent: index.toString()
	});
	parentContainer.appendChild(loader);
	parentContainer.appendChild(countdown);
	return parentContainer;
}