
import { FileSystemAdapter, MarkdownPostProcessorContext, TFile, MarkdownPreviewRenderer, Modal, App, Menu, SectionCache, Notice, MarkdownView, MarkdownRenderer } from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
import {CompileResult, PdfTeXEngine} from './PdfTeXEngine';
import Moshe from '../main';
import { StringMap } from 'src/settings/settings.js';
import async from 'async';
import { LatexAbstractSyntaxTree } from './parse/parse';
import { VirtualFile } from 'src/obsidian/file_watch';
import { pdfToHtml, pdfToSVG } from './pdfToHtml';
import {createErrorDisplay} from './log-parser/HumanReadableLogs';
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
/**
 * Pauses without blocking external code execution until a given condition returns true, or until a timeout occurs.
 */
async function nonBlockingWaitUntil(condition: () => boolean, timeoutMs = 10000, checkInterval = 500): Promise<void> {
    const startTime = performance.now();
    const maxWaitTime = startTime + timeoutMs;

    while (!condition()) {
        if (performance.now() >= maxWaitTime) {
            throw new Error("Timeout waiting for condition.");
        }
        // Yield control to allow external code execution.
        await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
}


type Task = { source: string, el: HTMLElement,md5Hash:string, sourcePath: string , blockId: string,process: boolean};
const cacheFileFormat="svg"

enum VirtualFileSystemFilesStatus{
	undefined,
	outdated,
	uptodate,
	error,
}
function createFilePath(file: VirtualFile): string {
	return path.join(file.path, file.name);
}
export class SwiftlatexRender {
	plugin: Moshe;
	cacheFolderPath: string;
	packageCacheFolderPath: string;
	pdfEngine: PdfTeXEngine;
	cache: Map<string, Set<string>>;
	queue: async.QueueObject<Task>;
	private virtualFileSystemFiles: VirtualFile[]
	private coorVirtualFiles: Set<string> = new Set();
	private virtualFileSystemFilesStatus: VirtualFileSystemFilesStatus=VirtualFileSystemFilesStatus.undefined;
	private virtualFileSystemEnabled: boolean;
	async onload(plugin: Moshe) {
		this.plugin = plugin;
		this.validateCatchDirectory();
		await this.loadCache();
		// initialize the latex compiler
		this.pdfEngine = new PdfTeXEngine();
		await this.pdfEngine.loadEngine();
		await this.loadPackageCache();
		await this.pdfEngine.setTexliveEndpoint(this.plugin.settings.package_url);
		this.configQueue();
		this.plugin.addRibbonIcon("dice", "Moshe Math", () => {
			new svgDisplayModule(this.plugin.app, this.cacheFolderPath,this.cache).open();
		})
	}
	async setVirtualFileSystemEnabled(enabled: boolean){
		this.virtualFileSystemEnabled=enabled
		if(!enabled){
			this.virtualFileSystemFiles=[];
			this.virtualFileSystemFilesStatus=VirtualFileSystemFilesStatus.undefined;
			this.coorVirtualFiles=new Set();
			await this.pdfEngine.flushWorkCache()
		}
	}
	setCoorVirtualFiles(files: Set<string>){
		if(this.virtualFileSystemEnabled)
			this.coorVirtualFiles=files;
	}
	tidyLatexSource(tikzSource: string) {

		// Remove non-breaking space characters, otherwise we get errors
		const remove = "&nbsp;";
		tikzSource = tikzSource.replaceAll(remove, "");
		let lines = tikzSource.split("\n");
		// Trim whitespace that is inserted when pasting in code, otherwise TikZJax complains
		lines = lines.map(line => line.trim());
		// Remove empty lines
		lines = lines.filter(line => line);
		return lines.join("\n");
	}
	configQueue() {
		const processTask = (task: Task): void => {
			try{
				const ast = LatexAbstractSyntaxTree.parse(task.source);
				ast.verifyEnvironmentWrap()
				ast.verifyDocumentclass();
				this.coorVirtualFiles.forEach((name) => {
					ast.addInputFileToPramble(name);
				});
				task.source = ast.toString();
				console.log("task.source",ast,task.source.split('\n'),)
			}
			catch(e){
				console.error("Error processing task: "+e);
				return;
			}
			let coorPreambles=""
			this.coorVirtualFiles.forEach((name) => {
				coorPreambles+=`\\input{${name}}`
			});
			//task.source="\\documentclass{standalone}"+coorPreambles+"\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}"+task.source+"\n\\end{tikzpicture}\\end{document}"
			//task.source = this.tidyLatexSource(task.source);
			
			/*
			const ast = new LatexAbstractSyntaxTree();
			try {
				ast.parse(task.source);
				ast.a();
				ast.cleanUp()
				const myAst = ast.myAst;
				ast.usdInputFiles()
				console.log("myAst",myAst,ast.usdInputFiles())
				ast.deleteComments();
				task.source = ast.toString();
			} catch (e) {
				console.error("Error parsing latex", e);
				ast.parse(task.source);
				ast.deleteComments();
				task.source = ast.toString();
			}
			*/
		}
		this.queue = async.queue((task, done) => {
			if(task.process)processTask(task)
				
			this.renderLatexToElement(task.source, task.el,task.md5Hash, task.sourcePath).then(() => {
				// Wait X seconds before marking the task as done
				setTimeout(() =>{updateQueueCountdown(this.queue);done();}, this.plugin.settings.pdfEngineCooldown);
			})
			.catch((err) => {
				console.error("Error processing task:",[ err.split("\n")]);
				// Optionally, delay even on errors:
				setTimeout(() => {updateQueueCountdown(this.queue);done(err);}, this.plugin.settings.pdfEngineCooldown);
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
	setVirtualFileSystemFiles(files: VirtualFile[]){
		if(!this.virtualFileSystemEnabled) throw new Error("Virtual file system is not enabled");
		this.virtualFileSystemFiles=files;
		this.virtualFileSystemFilesStatus=VirtualFileSystemFilesStatus.outdated;
	}

	private async loadVirtualFileSystemFiles() {
		if(this.virtualFileSystemEnabled===false||this.virtualFileSystemFilesStatus === VirtualFileSystemFilesStatus.uptodate)return;
		if (this.virtualFileSystemFilesStatus === VirtualFileSystemFilesStatus.undefined){
			await nonBlockingWaitUntil(() => 
				this.virtualFileSystemFilesStatus === VirtualFileSystemFilesStatus.outdated
			);
		}
		try {
			await this.pdfEngine.flushWorkCache();
			for (const file of this.virtualFileSystemFiles) {
				await this.pdfEngine.writeMemFSFile(file.name, file.content);
			}
			this.virtualFileSystemFilesStatus = VirtualFileSystemFilesStatus.uptodate;
		} catch (err) {
			console.error("Error loading virtual filesystem files:", err);
			this.virtualFileSystemFilesStatus = VirtualFileSystemFilesStatus.error;
			throw err;
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
		el.classList.add("block-language-latexsvg");
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
			const blockId = `${ctx.sourcePath.replace(/[^\wא-ת]/g, '_')}_${ctx.getSectionInfo(el)?.lineStart}`;
			this.queue.remove(node => node.data.blockId === blockId);
			el.appendChild(createWaitingCountdown(this.queue.length()));
			this.queue.push({ source, el, md5Hash, sourcePath: ctx.sourcePath, blockId, process:isLangTikz });
		}
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
			el.innerHTML = "";
			el.appendChild(createErrorDisplay(err));
			throw err;
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
				await this.loadVirtualFileSystemFiles();
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
  

async function getLatexHashesFromFile(file: TFile,app:App) {
	const hashes: string[] = [];
	const sections = app.metadataCache.getFileCache(file)?.sections
	if (sections != undefined) {
		const lines = (await app.vault.read(file)).split('\n');
		for (const section of sections) {
			if (section.type != "code" && lines[section.position.start.line].match("``` *(latex|tikz)") == null) continue;
			let source = lines.slice(section.position.start.line + 1, section.position.end.line).join("\n");
			const hash = hashLatexSource(source);
			hashes.push(hash);
		}
	}
	return hashes;
}

async function getLatexSourceFromHash(hash: string, plugin: Moshe, file?: TFile): Promise<string> {
	// Cache for file content to avoid multiple disk reads.
	const fileContentCache = new Map<string, string>();
  
	// Helper function that reads a file and caches its content.
	const readFile = async (file: TFile): Promise<string> => {
	  if (!fileContentCache.has(file.path)) {
		const content = await plugin.app.vault.read(file);
		fileContentCache.set(file.path, content);
	  }
	  return fileContentCache.get(file.path)!;
	};
  
	const findLatexSourceFromHashInFile = async (hash: string, file?: TFile): Promise<string | undefined> => {
	  if (!file) return;
	  const content = await readFile(file);
	  const lines = content.split('\n');
	  const fileCache = plugin.app.metadataCache.getFileCache(file);
	  if (!fileCache?.sections) return;
	  // Filter sections that are code blocks with latex or tikz language hints.
	  const sections = fileCache.sections.filter((section: SectionCache) =>
		section.type === "code" &&
		lines[section.position.start.line].match(/``` *(latex|tikz)/)
	  );
	  for (const section of sections) {
		// Extract section content.
		const codeSection = lines.slice(section.position.start.line + 1, section.position.end.line).join("\n");
		if (hashLatexSource(codeSection) === hash) {
		  return codeSection;
		}
	  }
	};
  
	// Check provided file first.
	const fromProvidedFile = await findLatexSourceFromHashInFile(hash, file);
	if (fromProvidedFile) return fromProvidedFile;
  
	// Use cache to narrow down file paths.
	const cachedFilePaths = Array.from(plugin.settings.cache.find((entry: [string, Set<string>]) => entry[0] === hash)?.[1] || []);
	for (const filePath of cachedFilePaths) {
	  const fileFromCache = plugin.app.metadataCache.getFirstLinkpathDest(filePath, file ? file.path : "");
	  if(!fileFromCache) continue;
	  const source = await findLatexSourceFromHashInFile(hash, fileFromCache);
	  if (source) return source;
	}
  
	// If still not found, search all files in parallel.
	const allFiles = plugin.app.vault.getFiles();
	const checkPromises = allFiles.map(file => findLatexSourceFromHashInFile(hash, file));
	const results = await Promise.all(checkPromises);
	const found = results.find(source => source !== undefined);
	if (found) return found;
  
	throw new Error("Latex source not found for hash: " + hash);
}
  





function hashLatexSource(source: string) {
	return Md5.hashStr(source.replace(/\s/g, ''))
}
function getBlockId(path: string,lineStart: number): string {
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









function addMenu(plugin: Moshe,el: HTMLElement,filePath: string) {
	el.addEventListener("contextmenu", (event) => {
		if(!event.target)return
		const clickedElement = event.target as HTMLElement;
		const menu = new SvgContextMenu(plugin,clickedElement,filePath);
		menu.open(event)
	});
}

function findMultiLineStartIndex(text: string, searchString: string) {
    const textLines = text.split("\n"); // Split the full text into lines
    const searchLines = searchString.split("\n"); // Split the search string into lines
    const searchLength = searchLines.length;

    for (let i = 0; i <= textLines.length - searchLength; i++) {
        let match = true;
        
        for (let j = 0; j < searchLength; j++) {
            if (textLines[i + j] !== searchLines[j]) {
                match = false;
                break;
            }
        }

        if (match) {
            return i; // Return the 0-based start line index
        }
    }
    return -1; // Return -1 if not found
}

function getSectionCacheFromString(sectionsCache: SectionCache[],source: string,target: string){
	const sourceIndex=findMultiLineStartIndex(source,target);
	if(sourceIndex===-1)throw new Error("source not found in file");
	if(sourceIndex===0)throw new Error("source index is 0 which is invalid (i don't know why this happens)");
	const codeBlockStartLine=sourceIndex-1;
	return sectionsCache.find((section)=>section.position.start.line===codeBlockStartLine);
}

class SvgContextMenu extends Menu {
	plugin: Moshe;
	triggeringElement: SVGElement;
	sourcePath: string;
	constructor(plugin: Moshe,trigeringElement: HTMLElement,sourcePath: string) {
		super();
    	this.plugin = plugin;
		const el=this.insureIsSVG(trigeringElement);
		if(!el)
			console.error("No svg element found in the hierarchy")
		else
			this.triggeringElement = el;
		this.sourcePath = sourcePath;
		this.addDisplayItems();
	}
	private insureIsSVG(el: HTMLElement): SVGElement|null {
		if (el instanceof SVGElement) {
			return el;
		}
		for (const child of Array.from(el.children)) {
			const svg = this.insureIsSVG(child as HTMLElement);
			if (svg) return svg;
		}
		return null;
	}
	private addDisplayItems(){
		this.addItem((item) => {
			item.setTitle("Copy SVG");
			item.setIcon("copy");
			item.onClick(async () => {
				const svg = this.triggeringElement;
				console.log("svg",svg)
				if (svg) {
					const svgString = new XMLSerializer().serializeToString(svg);
					await navigator.clipboard.writeText(svgString);
				}
			});
		});
		this.addItem((item) => {
			item.setTitle("properties");
			item.setIcon("settings");
			item.onClick(async () => {
				console.log("properties")
			});
		});
		this.addItem((item) => {
			item.setTitle("remove & re-render");
			item.setIcon("trash");
			item.onClick(async () => {
				const hash = this.triggeringElement.id;
				if (hash===undefined) throw new Error("No hash found for SVG element got: "+hash);
				await this.plugin.swiftlatexRender.removePDFFromCache(hash);
				const parentEl=this.triggeringElement.parentNode;
				if(!parentEl)throw new Error("No parent element found for SVG element");
				if(!(parentEl instanceof HTMLElement))throw new Error("Parent element is not an HTMLElement");
				parentEl.removeChild(this.triggeringElement);

				
				const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
				if (!file) throw new Error("File not found");
				if(!(file instanceof TFile))throw new Error("File is not a TFile");

				const metadata = this.plugin.app.metadataCache.getFileCache(file);
				if (!metadata) throw new Error("No metadata found for file");
				const sections=metadata.sections;
				if(!sections)throw new Error("No sections found in metadata");


				const source = await getLatexSourceFromHash(hash,this.plugin,file);
				const md5Hash = hashLatexSource(source);
				addMenu(this.plugin,parentEl,this.sourcePath)
				const queue=this.plugin.swiftlatexRender.queue;
				const fileText = await this.plugin.app.vault.read(file);
				const sectionCache=getSectionCacheFromString(sections,fileText,source);
				if(!sectionCache)throw new Error("Section cache not found");
				const blockId = getBlockId(this.sourcePath,sectionCache.position.start.line);
				queue.remove(node => node.data.blockId === blockId);
				parentEl.appendChild(createWaitingCountdown(queue.length()));
				
				this.plugin.swiftlatexRender.queue.push({
					source,
					el: parentEl,
					md5Hash: hash,
					sourcePath: this.sourcePath,
					blockId,
					process: true
				})
				new Notice("SVG removed from cache. Re-rendering...");
			});
		});

	}
	private async retrieveLatexSource(): Promise<string> {
		const hash = this.triggeringElement.id;
		if (!hash) throw new Error("No hash found for SVG element");
		const activeFile=this.plugin.app.workspace.getActiveFile();
		if(!activeFile)throw new Error("No active file found");
		return await getLatexSourceFromHash(hash, this.plugin, activeFile);
	}
	
	async open(event: MouseEvent) {
		console.log("open")
		
		const id=this.triggeringElement.id;
		//if(!id)return;
		//const source=await getLatexSourceFromHash(id,this.plugin)
		this.showAtPosition({ x: event.pageX, y: event.pageY });
	}
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