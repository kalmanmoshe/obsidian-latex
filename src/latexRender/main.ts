
import { MarkdownPostProcessorContext, TFile, Modal, App, Menu,  Notice, MarkdownSectionInformation,} from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
import {CompileResult, PdfTeXEngine} from './PdfTeXEngine';
import Moshe from '../main';
import { StringMap } from 'src/settings/settings.js';
import async from 'async';
import { LatexAbstractSyntaxTree } from './parse/parse';
import { pdfToHtml, pdfToSVG } from './pdfToHtml/pdfToHtml';
import {createErrorDisplay, errorDiv} from './log-parser/HumanReadableLogs';
import { String as StringClass } from './parse/typs/ast-types-post';
import { VirtualFileSystem } from './VirtualFileSystem';
import { findRelativeFile, getLatexCodeBlocksFromString, getLatexHashesFromFile, getLatexSourceFromHash } from './latexSourceFromFile';
import { getFileSections, getSectionCacheOfString } from './sectionCache';
import { SvgContextMenu } from './svgContextMenu';

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


export const latexCodeBlockNamesRegex = /(`|~){3,} *(latex|tikz)/;
type Task = { source: string, el: HTMLElement,md5Hash:string, sourcePath: string , blockId: string,process: boolean};
const cacheFileFormat="svg"

export class PackageCache {
	packageCacheFolderPath: string;
}
export class SvgCache {
	private plugin: Moshe;
	constructor() {
		
	}
	
}
export class SwiftlatexRender {
	plugin: Moshe;
	cacheFolderPath: string;
	packageCacheFolderPath: string;
	virtualFileSystem: VirtualFileSystem=new VirtualFileSystem();
	pdfEngine: PdfTeXEngine;
	cache: Map<string, Set<string>>;
	queue: async.QueueObject<Task>;
	async onload(plugin: Moshe) {
		this.plugin = plugin;
		this.validateCatchDirectory();
		await this.loadCache();
		// initialize the latex compiler
		this.initializePDfEngine();

		await this.pdfEngine.loadEngine();
		await this.loadPackageCache();
		await this.pdfEngine.setTexliveEndpoint(this.plugin.settings.package_url);
		this.configQueue();
		this.plugin.addRibbonIcon("dice", "Moshe Math", () => {
			new svgDisplayModule(this.plugin.app, this.cacheFolderPath,this.cache).open();
		})
	}
	private initializePDfEngine(){
		this.pdfEngine = new PdfTeXEngine();
		this.virtualFileSystem.setPdfEngine(this.pdfEngine);
	}
	async getFileContent(file: TFile,remainingPath?: string): Promise<string> {
		const fileContent = await this.plugin.app.vault.read(file);
		if(!remainingPath)return fileContent;
		const sections = await getFileSections(file,this.plugin.app,true);
		const err= ()=>{throw new Error("No code block found with name: "+remainingPath+" in file: "+file.path)};
		if(!sections)err();
		const codeBlocks = await getLatexCodeBlocksFromString(fileContent,sections!,true);
		const target = codeBlocks.find((block) => 
			block.content
			.split("\n")[0]
			.replace(latexCodeBlockNamesRegex,"").trim()
			.match(new RegExp("name: *"+remainingPath))
		);
		if(!target)err();
		return target!.content.split("\n").slice(1,-1).join("\n");
	}
	configQueue() {
		const processTask = async (task: Task): Promise<void> => {
			const startTime = performance.now();
			try {
				// ── AST Parsing ──────────────────────────────
				const startAstTime = performance.now();
				const ast = LatexAbstractSyntaxTree.parse(task.source);
				const astDuration = performance.now() - startAstTime;
				console.log(`[TIMER] AST parsing: ${astDuration.toFixed(2)} ms`);
		
				// ── Input File Macros ────────────────────────
				const inputFilesMacros = ast.usdInputFiles();
		
				const startInputFilesTime = performance.now();
				for (const macro of inputFilesMacros) {
					const args = macro.args;
					if (!args || args.length !== 1) continue;
		
					const filePath = args[0].content.map(node => node.toString()).join("");
					const dir = findRelativeFile(filePath, this.plugin.app.vault.getAbstractFileByPath(task.sourcePath));
					const name = (dir.remainingPath || dir.file.basename) + ".tex";
		
					args[0].content = [new StringClass(name)];
		
					const startGetFile = performance.now();
					const content = await this.getFileContent(dir.file, dir.remainingPath);
					const fileLoadDuration = performance.now() - startGetFile;
					console.log(`[TIMER] Loaded file '${name}' in ${fileLoadDuration.toFixed(2)} ms`);
		
					this.virtualFileSystem.addVirtualFileSystemFile({ name, content });
				}
				const inputFilesDuration = performance.now() - startInputFilesTime;
				console.log(`[TIMER] Input file processing total: ${inputFilesDuration.toFixed(2)} ms`);
		
				// ── Update AST with virtual files ────────────
				const startPreambleUpdateTime = performance.now();
				this.virtualFileSystem.getAutoUseFileNames().forEach((name) => {
					ast.addInputFileToPramble(name);
				});
				const preambleUpdateDuration = performance.now() - startPreambleUpdateTime;
				console.log(`[TIMER] Preamble update: ${preambleUpdateDuration.toFixed(2)} ms`);
		
				// ── Final task update ────────────────────────
				task.source = ast.toString();
				console.log("task.source", this.virtualFileSystem, ast, task.source.split('\n'));
			}
			catch (e) {
				const err = "Error processing task: " + e;
				this.handleError(task.el, err);
			}
		
			const totalDuration = performance.now() - startTime;
			console.log(`[TIMER] Total processing time: ${totalDuration.toFixed(2)} ms`);
		};
		
		this.queue = async.queue(async (task, done) => {
			try {
		  
			  if (task.process) await processTask(task);
		  
			  await this.renderLatexToElement(task.source, task.el, task.md5Hash, task.sourcePath);
			} catch (err) {
			  console.error("Error rendering/compiling:", typeof err === "string" ? [err.split("\n")] : err);
			  this.handleError(task.el, "Render error: " + err);
			} finally {
			  setTimeout(() => {
				updateQueueCountdown(this.queue);
				done();
			  }, this.plugin.settings.pdfEngineCooldown);
			}
		  }, 1);// Concurrency is set to 1, so tasks run one at a time
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
				await this.pdfEngine.writeTexFSFile(filename, srccode);
			} catch (e) {
				// when unable to read file, remove this from the cache
				console.warn(`Unable to read file ${filename} from package cache`,e)
				delete this.plugin.settings.packageCache[1][key];
			}
		}
		await this.plugin.saveSettings()

		// write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
		await this.pdfEngine.writeCacheData(
			{},
			this.plugin.settings.packageCache[1],
			this.plugin.settings.packageCache[2],
			this.plugin.settings.packageCache[3]
	);
	}
	async onunload() {
		await this.pdfEngine.flushWorkCache();
		this.pdfEngine.closeWorker();
		await this.cleanUpCache();
	}
	private async unloadCache() {
		await this.pdfEngine.flushCache();
		fs.rmdirSync(this.cacheFolderPath, { recursive: true });
	}
	
	universalCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const isLangTikz = el.classList.contains("block-language-tikz");
		el.classList.remove("block-language-tikz");
		el.classList.remove("block-language-latex");
		el.classList.add("block-language-latexsvg")
		const md5Hash = hashLatexSource(source);
		addMenu(this.plugin,el,ctx.sourcePath)
		
		// PDF file has already been cached
		// Could have a case where pdfCache has the key but the cached file has been deleted
		const dataPath = path.join(this.cacheFolderPath, `${md5Hash}.${cacheFileFormat}`);
		if (this.cache.has(md5Hash) && fs.existsSync(dataPath)) {
			const data = fs.readFileSync(dataPath, 'utf8');
			el.innerHTML = data
		}
		else {
			//Reliable enough for repeated entries
			this.ensureContextSectionInfo(source, el, ctx).then((sectionInfo) => {
				const blockId = getBlockId(ctx.sourcePath,sectionInfo.lineStart)
				this.queue.remove(node => node.data.blockId === blockId);
				el.appendChild(createWaitingCountdown(this.queue.length()));
				this.queue.push({ source, el, md5Hash, sourcePath: ctx.sourcePath, blockId, process:isLangTikz });

			}).catch((err) => this.handleError(el, err as string));
		}
	}
	/**
	 * when programmatically parsing nested code blocks or simulating a rendering environment the section info is not available
	 * so we rebuild it here
	 * **If you encounter problems, check how the document is rendered in a reading view as the sections are based off that**
	 * @param ctx 
	 * @param el
	 */
	private async ensureContextSectionInfo(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext):Promise<MarkdownSectionInformation> {
		const sectionInfo = ctx.getSectionInfo(el);
		if (sectionInfo) return sectionInfo;

		const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile;
		const sections=await getFileSections(file,this.plugin.app,true);
		if(!sections)throw new Error("No sections found in metadata");
		const fileText = await this.plugin.app.vault.read(file);
		const sectionCache=getSectionCacheOfString(sections,fileText,source);
		if(!sectionCache)throw new Error("Section cache not found");
		return {
			lineStart: sectionCache.position.start.line,
			lineEnd: sectionCache.position.end.line,
			text: fileText,
		}
	}
	private handleError(el: HTMLElement, err: string,parseErr: boolean=false): void {
		el.innerHTML = "";
		const child = parseErr? createErrorDisplay(err) : errorDiv({title: err});
		el.appendChild(child);
		throw err;
	}
	private async renderLatexToElement(source: string, el: HTMLElement,md5Hash: string, sourcePath: string): Promise<void> {
		try {
			const dataPath = path.join(this.cacheFolderPath, `${md5Hash}.${cacheFileFormat}`);
			const result = await this.renderLatexToPDF(source);
			el.innerHTML = "";
			await this.translatePDF(result.pdf, el,md5Hash);
			await fs.promises.writeFile(dataPath, el.innerHTML, "utf8");
			this.addFileToCache(md5Hash, sourcePath);
		} catch (err) {
			this.handleError(el, err as string,true);
		} finally {
			await waitFor(() => this.pdfEngine.isReady());
			await this.cleanUpCache();
			await this.removeUntraceablePDFs();
			await this.removeHashsWithNoCorrespondingPDF()
		}
	}
	  
	
	private async translatePDF(pdfData: Buffer<ArrayBufferLike>, el: HTMLElement,hash: string, outputSVG = true): Promise<void> {
		return new Promise<void>((resolve) => {
			const config ={
				invertColorsInDarkMode: this.plugin.settings.invertColorsInDarkMode,
				sourceHash: hash
			};
			if (outputSVG)
				pdfToSVG(pdfData,config).then((svg: string) => { el.innerHTML = svg; resolve();});
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
				await this.virtualFileSystem.loadVirtualFileSystemFiles();
				await this.pdfEngine.writeMemFSFile("main.tex", source);
				await this.pdfEngine.setEngineMainFile("main.tex");
				await this.pdfEngine.compileLaTeX().then(async (result: CompileResult) => {
					if (result.status != 0) {
						// manage latex errors
						reject(result.log);
					}
					// update the list of package files in the cache
					await this.fetchPackageCacheData()
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
	async fetchPackageCacheData(): Promise<void> {
		try {
			const cacheData: StringMap[] = await this.pdfEngine.fetchCacheData();
			const newFileNames = getNewPackageFileNames(
				this.plugin.settings.packageCache[1],
				cacheData[1]
			);
			await this.pdfEngine.fetchTexFiles(newFileNames, this.packageCacheFolderPath);
			this.plugin.settings.packageCache = cacheData;
			await this.plugin.saveSettings();
	
		} catch (err) {
			console.error("Error fetching package cache data:", err);
		}
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

	/**
	 * Removes PDFS that don't have a reference to them in the catch, Aka will never be used as there will never be reached
	 */
	private async removeUntraceablePDFs(){
		const cacheFolderfiles = fs.readdirSync(this.cacheFolderPath);
		const cacheFiles = [...this.cache.keys()];
		const filesToRemove = cacheFolderfiles.filter(file => !cacheFiles.includes(file.split(".")[0]));
		for (const file of filesToRemove) {
			await this.removePDFFromCache(file);
		}
	}
	private async removeHashsWithNoCorrespondingPDF(){
		const cacheFolderfiles = fs.readdirSync(this.cacheFolderPath).map(file => file.split(".")[0]);
		const cacheFiles = [...this.cache.keys()];
		const filesToRemove = cacheFiles.filter(file => !cacheFolderfiles.includes(file));
		for (const file of filesToRemove) {
			await this.removePDFFromCache(file);
		}
	}
	/**
	 * Remove all unused cachet svgs from the cache and file system.
	*/
	private getFilePathsFromCache(): string[] {
		return [...new Set([...this.cache.values()].flatMap(set => [...set]))];
	}
	/**
	 * Iterates over the filed paths in the catch
	 * and removes the cache entries for the files that do not exist.
	 * Also removes the ones that do not exist in the vault.
	 */
	private async cleanUpCache(): Promise<void> {
	
		const filePathsToRemove: string[] = [];
		// Collect file paths safely first
		for (const filePath of this.getFilePathsFromCache()) {
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (!file) {
				filePathsToRemove.push(filePath);
			} else if (file instanceof TFile) {
				try {
					await this.removeUnusedCachesForFile(file);
				} catch (err) {
					console.error(`Error removing cache for file ${filePath}:`, err);
				}
			}
		}
		for (const filePath of filePathsToRemove) {
			this.removeFileFromCache(filePath);
		}
		await this.plugin.saveSettings();
	}
	

	private async removeUnusedCachesForFile(file: TFile) {
		const hashes_in_file = await getLatexHashesFromFile(file,this.plugin.app);
		const hashes_in_cache = this.getLatexHashesFromCacheForFile(file);
		for (const hash of hashes_in_cache) {
			if (!hashes_in_file.contains(hash)) {
				this.cache.get(hash)?.delete(file.path);
				if (this.cache.get(hash)?.size == 0) {
					await this.removePDFFromCache(hash);
				}
			}
		}
	}

	async removePDFFromCache(key: string) {
		if(this.cache.has(key))
			this.cache.delete(key);
		const filePath=path.join(this.cacheFolderPath, `${key}.${cacheFileFormat}`);
		if (fs.existsSync(filePath)) {
			fs.rmSync(filePath);
		}
		await this.saveCache();
	}

	private async removeFileFromCache(file_path: string) {
		for (const hash of this.cache.keys()) {
			this.cache.get(hash)?.delete(file_path);
			if (this.cache.get(hash)?.size == 0) {
				this.removePDFFromCache(hash);
			}
		}
		await this.saveCache();
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


const updateQueueCountdown = (queue: async.QueueObject<Task>) => {
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

export function hashLatexSource(source: string) {
	return Md5.hashStr(source.replace(/\s/g, ''))
}
export function getBlockId(path: string,lineStart: number): string {
	return `${path.replace(/ /g, '_')}_${lineStart}`;
};
	



function getNewPackageFileNames(oldCacheData: StringMap, newCacheData: StringMap): string[] 
{
	// based on the old and new package files in package cache data,
	// return the new package files
	let newKeys = Object.keys(newCacheData).filter(key => !(key in oldCacheData));
	let newPackageFiles = newKeys.map(key => path.basename(newCacheData[key]));		
	return newPackageFiles;
}









export function addMenu(plugin: Moshe,el: HTMLElement,filePath: string) {
	el.addEventListener("contextmenu", (event) => {
		if(!event.target)return
		const clickedElement = event.target as HTMLElement;
		const menu = new SvgContextMenu(plugin,clickedElement,filePath);
		menu.open(event)
	});
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




export function createWaitingCountdown(index: number){
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