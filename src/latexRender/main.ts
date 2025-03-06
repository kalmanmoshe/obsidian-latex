
import { FileSystemAdapter, MarkdownPostProcessorContext, TFile, MarkdownPreviewRenderer, Modal, App } from 'obsidian';
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
import { LatexAbstractSyntaxTree } from './parse/parse';
import { PreambleFile } from 'src/file_watch';
import LatexParser, { errorDiv } from './swiftlatexpdftex/log';
const PdfToCairo = require("./pdftocairo.js")
export const waitFor = async (condFunc: () => boolean) => {
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
	coorPreambleFiles: PreambleFile[];
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
		this.plugin.addRibbonIcon("dice", "Moshe Math", () => {
			new svgDisplayModule(this.plugin.app, this.cacheFolderPath,this.cache).open();
		  })
	}
	configQueue() {
		const WAIT_TIME_MS = 4 * 1000; // Replace X with your desired seconds
		
		this.queue = async.queue((task, done) => {
			task.source=getPreamble(this.plugin.app)+task.source+"\n\\end{tikzpicture}\\end{document}"
			
			const ast = new LatexAbstractSyntaxTree();
			try {
				ast.parse(task.source);
				ast.a();
				ast.cleanUpDefs()
				const myAst = ast.myAst;
				//console.log(a,ast2)
				ast.deleteComments();
				task.source = ast.toString();
			} catch (e) {
				console.error("Error parsing latex", e);
				ast.parse(task.source);
				ast.deleteComments();
				task.source = ast.toString();
			}

			this.renderLatexToElement(task.source, task.el,task.md5Hash, task.sourcePath).then(() => {
				// Wait X seconds before marking the task as done
				setTimeout(() =>{updateCountdown(this.queue);done();}, WAIT_TIME_MS);
			})
			.catch((err) => {
				console.error('Error processing task:', err);
				// Optionally, delay even on errors:
				setTimeout(() => {updateCountdown(this.queue);done(err);}, WAIT_TIME_MS);
			});
		}, 1); // Concurrency is set to 1, so tasks run one at a time
	}
	
	private validateCatchDirectory(){
		const cacheFolderParentPath = path.join(this.plugin.getVaultPath(), this.plugin.app.vault.configDir, "swiftlatex-render-cache");
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
	setCoorPreambles(preambleFiles: PreambleFile[]){
		this.coorPreambleFiles=preambleFiles;
		preambleFiles.forEach(file => {
			this.pdfEngine.writeMemFSFile("coorPreamble.tex", file.content);
		});
	}
	private updateExplicitPreambleFilesInWorker(){
		if(!this.plugin.settings.explicitPreambleEnabled)throw new Error("Explicit preamble is not enabled");
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
		this.plugin.saveSettings()

		// write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
		this.pdfEngine.writeCacheData(
			{},
			this.plugin.settings.packageCache[1],
			this.plugin.settings.packageCache[2],
			this.plugin.settings.packageCache[3]
	);
	}
	onunload() {
		this.pdfEngine.cleanWorkirectory();
		this.pdfEngine.closeWorker();
		this.cleanUpCache();
	}
	private unloadCache() {
		this.pdfEngine.flushCache();
		fs.rmdirSync(this.cacheFolderPath, { recursive: true });
	}
	
	universalCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		el.classList.remove("block-language-tikz");
		el.classList.add("block-language-latexsvg");
		const md5Hash = hashLatexSource(source);
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
			this.queue.push({ source, el,md5Hash, sourcePath: ctx.sourcePath, blockId }).then(() => {
				console.log(this.queue);
			})
			
		}
	}
	private async renderLatexToElement(source: string, el: HTMLElement,md5Hash:string, sourcePath: string,) {
		return new Promise<void>((resolve, reject) => {
			const dataPath = path.join(this.cacheFolderPath, `${md5Hash}.${catchFileFormat}`);
			this.renderLatexToPDF(source).then((result: CompileResult) => {
					el.innerHTML = ""
					this.translatePDF(result.pdf, el).then(() => {
						fs.writeFileSync(dataPath,el.innerHTML);
					});
				}).catch(err => {
					el.innerHTML = "";
					const log=LatexParser.parse(err)
					console.error("LaTeX Error:", log, err);
					const { message, content, line } = log.errors[0];
					el.appendChild(errorDiv(message, content, line));
					reject(err); 
				});		
			this.addFileToCache(md5Hash, sourcePath);
			resolve();
		}).then(() => {
				waitFor(() => this.pdfEngine.isReady()).then(() => {
					this.pdfEngine.fetchWorkFiles().then((r) => {
					console.log("this.pdfEngine.fetchWorkFiles()",r);
				});
			});
			this.pdfEngine.cleanWorkirectory();
			setTimeout(() => this.cleanUpCache(), 1000);
		});
	}

	private async translatePDF(pdfData: Buffer<ArrayBufferLike>, el: HTMLElement, outputSVG = true): Promise<void> {
		return new Promise<void>((resolve) => { 
			if (outputSVG)
				pdfToSVG(pdfData,this.plugin.settings).then((svg: string) => { el.innerHTML = svg; resolve();});
			else
				pdfToHtml(pdfData).then((htmlData) => {el.createEl("object", htmlData);resolve();});
		});
	}

	private renderLatexToPDF(source: string): Promise<CompileResult> {
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
			const newFileNames = getNewPackageFileNames(this.plugin.settings.packageCache[1], r[1]);
			this.pdfEngine.fetchTexFiles(newFileNames, this.packageCacheFolderPath);
			this.plugin.settings.packageCache = r;

		});
		this.plugin.saveSettings().then();
	}

	private async saveCache() {
		let temp = new Map();
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
		this.saveCache();
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
			if(file==null) this.removeFileFromCache(file_path);
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
		this.saveCache();
	}

	private removeFileFromCache(file_path: string) {
		for (const hash of this.cache.keys()) {
			this.cache.get(hash)?.delete(file_path);
			if (this.cache.get(hash)?.size == 0) {
				this.removePDFFromCache(hash);
			}
		}
		this.saveCache();
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
				if (section.type != "code" && lines[section.position.start.line].match("``` *(latex|tikz)") == null) continue;
				let source = lines.slice(section.position.start.line + 1, section.position.end.line).join("\n");
				const hash = hashLatexSource(source);
				hashes.push(hash);
			}
		}
		return hashes;
	}
	/**
	 * Remove all cached SVG files from the file system and update the settings.
	 */
	public removeAllCachedSvgs(): void {
		if (fs.existsSync(this.cacheFolderPath)) {
			const files = fs.readdirSync(this.cacheFolderPath);
			// Loop through each file and remove if it has a .svg extension
			for (const file of files) {
				if (file.endsWith('.svg')) {
					const fullPath = path.join(this.cacheFolderPath, file);
					try {
						fs.rmSync(fullPath);
						console.log(`Removed cached SVG: ${fullPath}`);
					} catch (err) {
						console.error(`Failed to remove SVG file ${fullPath}:`, err);
					}
				}
			}
		}

		for (const [hash, fileSet] of this.cache.entries()) {
			if(this.cache.delete(hash))
				console.log(`Removed cache entry for ${hash}`);
		}
		this.saveCache();
	}
	
	/**
	 * Remove all cached package files from the file system and update the settings.
	 */
	public removeAllCachedPackages(): void {
		// Remove all files in the package cache folder
		if (fs.existsSync(this.packageCacheFolderPath)) {
			const packageFiles = fs.readdirSync(this.packageCacheFolderPath);
			for (const file of packageFiles) {
				const fullPath = path.join(this.packageCacheFolderPath, file);
				try {
					fs.rmSync(fullPath);
					console.log(`Removed cached package file: ${fullPath}`);
				} catch (err) {
					console.error(`Failed to remove package file ${fullPath}:`, err);
				}
			}
		}
		this.plugin.settings.packageCache=[{}, {}, {}, {}];
		this.plugin.saveSettings().then(() => {
			console.log("Package cache settings updated.");
		});
	}
}



const updateCountdown = (queue: async.QueueObject<Task>) => {
	//@ts-ignore
	let taskNode = queue._tasks.head;
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
function pdfToSVG(pdfData: any,config: {invertColorsInDarkMode?:boolean}) {
	const hashSVG = (svg: any) => {
		const id = Md5.hashStr(svg.trim()).toString();
		const randomString = Math.random().toString(36).substring(2, 10);
		return id.concat(randomString);
	};
	return PdfToCairo().then((pdftocairo: any) => {
		pdftocairo.FS.writeFile('input.pdf', pdfData);
		pdftocairo._convertPdfToSvg();
		let svg = pdftocairo.FS.readFile('input.svg', {encoding:'utf8'});
		const svgoConfig:Config =  {
			plugins: ['sortAttrs', { name: 'prefixIds', params: { prefix: hashSVG(svg) } }]
		};
		svg = optimize(svg, svgoConfig).data; 
		if (config.invertColorsInDarkMode) {
			svg = colorSVGinDarkMode(svg);
		}
		return svg;
	});
}



function hashLatexSource(source: string) {
	return Md5.hashStr(source.replace(/\s/g, ''))
}
function colorSVGinDarkMode(svg: string) {
	// Replace the color "black" with currentColor (the current text color)
	// so that diagram axes, etc are visible in dark mode
	// and replace "white" with the background color
	if (document.body.classList.contains('theme-dark')) {
	svg = svg.replace(/rgb\(0%, 0%, 0%\)/g, "currentColor")
				.replace(/rgb\(100%, 100%, 100%\)/g, "var(--background-primary)");
	} else {
	svg = svg.replace(/rgb\(100%, 100%, 100%\)/g, "currentColor")
				.replace(/rgb\(0%, 0%, 0%\)/g, "var(--background-primary)");
	}
	
	return svg;
}
	

async function pdfToHtml(pdfData: Buffer<ArrayBufferLike>) {
	const {width, height} = await getPdfDimensions(pdfData);
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

async function  getPdfDimensions(pdf: any): Promise<{width: number, height: number}> {
	const pdfDoc = await PDFDocument.load(pdf);
	const firstPage = pdfDoc.getPages()[0];
	const {width, height} = firstPage.getSize();
	return {width, height};
}



function getNewPackageFileNames(oldCacheData: StringMap, newCacheData: StringMap): string[] 
{
	// based on the old and new package files in package cache data,
	// return the new package files
	let newKeys = Object.keys(newCacheData).filter(key => !(key in oldCacheData));
	let newPackageFiles = newKeys.map(key => path.basename(newCacheData[key]));		
	return newPackageFiles;
}










































enum latexErrors{
	undefinedControlSequence="LaTeX does not recognize a command in your document"
}




class svgDisplayModule extends Modal {
	cacheFolderPath: string;
	cache: Map<string, Set<string>>;

	constructor(app: App, cacheFolderPath: string, cache: Map<string, Set<string>>) {
		super(app);
		this.cacheFolderPath = cacheFolderPath;
		this.cache = cache;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Cached SVGs", cls: "info-modal-title" });
		const svgContainer = contentEl.createDiv({ cls: "info-modal-main-container" });

		// Iterate through each cached SVG entry
		for (const [hash, fileSet] of this.cache.entries()) {
			// Create a container for each SVG entry
			const entryContainer = svgContainer.createDiv({ cls: "svg-entry" });

			// Display the hash for identification
			entryContainer.createEl("h3", { text: `SVG Hash: ${hash}` });

			// Check if there is a conflict (i.e. the same hash appears in multiple files)
			if (fileSet.size > 1) {
				entryContainer.createEl("p", { text: "Conflict detected: SVG found in multiple files:" });
				const fileList = entryContainer.createEl("ul");
				fileSet.forEach(fileName => {
					fileList.createEl("li", { text: fileName });
				});
			} else {
				// Only one file in which the SVG is referenced
				const [fileName] = Array.from(fileSet);
				entryContainer.createEl("p", { text: `Found in file: ${fileName}` });
			}

			// Construct the SVG file path from the hash
			const svgPath = path.join(this.cacheFolderPath, `${hash}.svg`);

			// Check if the SVG file exists
			if (fs.existsSync(svgPath)) {
				try {
					// Read and display the SVG content
					const svg = fs.readFileSync(svgPath, 'utf8');
					const svgEl = entryContainer.createDiv({ cls: "svg-display" });
					svgEl.innerHTML = svg;
				} catch (err) {
					entryContainer.createEl("p", { text: "Error reading SVG file." });
				}
			} else {
				// Inform the user that the SVG file is not found in the cache folder
				entryContainer.createEl("p", { text: "SVG file not found in cache." });
			}
		}
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