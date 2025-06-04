import { MarkdownPostProcessorContext, TFile, App, MarkdownSectionInformation, MarkdownView,} from 'obsidian';
import { Md5 } from 'ts-md5';
import * as fs from 'fs';
import * as temp from 'temp';
import * as path from 'path';
import LatexEngine,{CompileResult} from './engine';
import Moshe from '../main';
import { CompilerType, StringMap } from 'src/settings/settings.js';
import async from 'async';
import { pdfToHtml, pdfToSVG } from './pdfToHtml/pdfToHtml';
import parseLatexLog, {createErrorDisplay, errorDiv} from './logs/HumanReadableLogs';
import { VirtualFileSystem } from './VirtualFileSystem';
import { getFileSections,} from './cache/sectionCache';
import { SvgContextMenu } from './svgContextMenu';
import { cacheFileFormat, SvgCache } from './cache/svgCache';
import { createTransactionLogger } from './cache/transactionLogger';
import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getSectionFromMatching, getSectionFromTransaction } from './cache/findSection';
import { ProcessedLog } from './logs/latex-log-parser';
import PdfTeXEngine from './swiftlatexpdftex/PdfTeXEngine';
import { svgDisplayModule } from './utils/svgDisplayModule';
import { LatexTask } from './utils/latexTask';
import { PdfXeTeXEngine } from './swiftlatexxetex/pdfXeTeXEngine';

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
 * add command to rerender all fils using (\input{}) this file
 * add resove tab indentasins setting
 * The goust bubble happens when I do ctrl z 
 * add replac all & replace in selection
 * 
 */

export const latexCodeBlockNamesRegex = /(`|~){3,} *(latex|tikz)/;
export type Task = { source: string, el: HTMLElement,md5Hash:string, sourcePath: string , blockId: string,process: boolean};
type InternalTask<T> = {
	data: T;
	callback: Function;
	next: InternalTask<T> | null;
};
type QueueObject<T> = async.QueueObject<T> &{
	_tasks: {
		head: InternalTask<T> | null;
		tail: InternalTask<T> | null;
		length: number;
		remove: (testFn: (node: InternalTask<T>) => boolean) => void;
	};
}
export function clearFolder(folderPath: string){
	if (fs.existsSync(folderPath)) {
		const packageFiles = fs.readdirSync(folderPath);
		for (const file of packageFiles) {
			const fullPath = path.join(folderPath, file);
			try {
				fs.rmSync(fullPath, { recursive: true, force: true });
			} catch (err) {
				console.error(`Failed to remove file ${fullPath}:`, err);
			}
		}
	}
}

/**
 * add option for Persistent preamble.so it won't get deleted.after use Instead, saved until overwritten
 */

export class SwiftlatexRender {
	plugin: Moshe;
	cacheFolderPath: string;
	packageCacheFolderPath: string;
	virtualFileSystem: VirtualFileSystem=new VirtualFileSystem();
	pdfTexEngine: PdfTeXEngine;
	pdfXetexEngine: PdfTeXEngine;
	engine: LatexEngine;
	cache: SvgCache;
	private logCache: Map<string, ProcessedLog>|undefined;
	queue: QueueObject<Task>;
	logger = createTransactionLogger();
	async onload(plugin: Moshe) {
		this.plugin = plugin;
		this.bindTransactionLogger();
		this.validateCatchDirectory();
		this.loadCache();
		await this.loadEngine();
		this.configQueue();
		this.plugin.addRibbonIcon("dice", "Moshe Math", () => {
			new svgDisplayModule(this.plugin.app, this.cacheFolderPath,this.cache.getCache()).open();
		})
		console.log("SwiftlatexRender loaded");
	}
	private bindTransactionLogger() {
		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) return;
		const editor = markdownView.editor;
		const cmView = (editor as any).cm as EditorView;

		cmView.dispatch({
			effects: StateEffect.appendConfig.of([this.logger.extension])
		});
	}
	switchEngine():Promise<void> {
		if (this.engine===undefined) return this.loadEngine();
		const isTex = this.engine instanceof PdfTeXEngine&&this.plugin.settings.compiler === CompilerType.TeX;
		const isXeTeX = this.engine instanceof PdfXeTeXEngine&&this.plugin.settings.compiler === CompilerType.XeTeX;
		if(isTex||isXeTeX) return Promise.resolve();
		this.engine.closeWorker();
		this.engine = (undefined as any);
		this.pdfTexEngine = (undefined as any);
		this.pdfXetexEngine = (undefined as any);
		return this.loadEngine()
	}
	async loadEngine(){
		if (this.plugin.settings.compiler === CompilerType.TeX) {
			this.engine = this.pdfTexEngine = new PdfTeXEngine();
		}else{
			this.engine = this.pdfXetexEngine = new PdfXeTeXEngine();
		}
		this.virtualFileSystem.setPdfEngine(this.engine);
		await this.engine.loadEngine();
		await this.loadPackageCache();
		await this.engine.setTexliveEndpoint(this.plugin.settings.package_url);
	}
	/**
	 * Restores the cached HTML content for a given hash and sets it as the innerHTML of the provided element.
	 *
	 * @param el - The HTML element to restore the cached content into.
	 * @param hash - The unique hash identifying the cached content file.
	 * @returns `true` if the cache was successfully restored and applied to the element, `false` otherwise.
	 */
	private restoreFromCache(el: HTMLElement,hash: string){
		const dataPath = path.join(this.cacheFolderPath, `${hash}.${cacheFileFormat}`);
		if(!this.cache.hasFile(hash,dataPath))return false;
		const data = fs.readFileSync(dataPath, 'utf8');
		el.innerHTML = data
		return true;
	}
	universalCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const isLangTikz = el.classList.contains("block-language-tikz");
		el.classList.remove("block-language-tikz");
		el.classList.remove("block-language-latex");
		el.classList.add("block-language-latexsvg");
		el.classList.add(`overflow-${this.plugin.settings.overflowStrategy}`);
		const md5Hash = hashLatexSource(source);
		addMenu(this.plugin,el,ctx.sourcePath)
		
		// PDF file has already been cached
		// Could have a case where pdfCache has the key but the cached file has been deleted
		if (!this.restoreFromCache(el,md5Hash)) {
			//Reliable enough for repeated entries
			this.ensureContextSectionInfo(source, el, ctx).then((sectionInfo) => {
				source = sectionInfo.source || source;

				const finalHash = hashLatexSource(source);
				if (md5Hash !== finalHash && this.restoreFromCache(el, finalHash)) return;

				const blockId = getBlockId(ctx.sourcePath,sectionInfo.lineStart)
				this.queue.remove(node => node.data.blockId === blockId);
				el.appendChild(createWaitingCountdown(this.queue.length()));
				this.queue.push({ source, el, md5Hash, sourcePath: ctx.sourcePath, blockId, process:isLangTikz });

			}).catch((err) => {
				err = "Error queuing task: " + err;
				this.handleError(el, err as string,{hash: md5Hash})
			});
		}
	}
	/**
	* Attempts to locate the Markdown section that corresponds to a rendered code block,
	* even when section info is unavailable (e.g., virtual rendering or nested codeBlock environments).
	*/
	private async ensureContextSectionInfo(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): Promise<MarkdownSectionInformation & { source?: string }> {
	
		const sectionFromContext = ctx.getSectionInfo(el);
		if (sectionFromContext) return sectionFromContext;
	
		const { file, sections } = await getFileSectionsFromPath(ctx.sourcePath, this.plugin.app);
	
		const editor = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		const fileText = editor?.getValue() ?? await this.plugin.app.vault.cachedRead(file);
	
		const sectionFromTransaction = getSectionFromTransaction(sections, fileText, this.logger, editor);
		if (sectionFromTransaction) return sectionFromTransaction;
	
		const sectionFromMatching = getSectionFromMatching(sections, fileText, source);
		if (sectionFromMatching) return sectionFromMatching;
		return {
			lineStart: Math.floor(Math.random() * 1000) * -1,
			lineEnd: 0,
			text: fileText,
		};
	}	
	
	
	configQueue() {
		this.queue = async.queue(async (task, done) => {
			let cooldown = true;
			try {
				let abort;
				if (this.restoreFromCache(task.el, task.md5Hash)) {cooldown=false;console.log("fund in cahtch for",task.blockId);return done()};
				if (task.process) abort = await LatexTask.create(this.plugin,task).processTask();
				if(abort) {cooldown=false;return done()};
			 	await this.renderLatexToElement(task.source, task.el, task.md5Hash, task.sourcePath);
				this.reCheckQueue(); // only re-check the queue after a valide rendering
			} catch (err) {
			  console.error("Error rendering/compiling:", typeof err === "string" ? [err.split("\n")] : err);
			  //this.handleError(task.el, "Render error: " + err);
			} finally {
				updateQueueCountdown(this.queue);
				if(cooldown) 
					setTimeout(() => done(), this.plugin.settings.pdfEngineCooldown);
			}
		  }, 1) as QueueObject<Task>;// Concurrency is set to 1, so tasks run one at a time
	}
	/**
	 * Re-checks the queue to see if any tasks can be removed based on whether their PDF has been restored from cache.
	 * If a task's PDF cannot be restored, it is removed from the queue.
	 * solves edge case where head is in the processing state.when a similar task is registered to the universal method 
	 */
	private reCheckQueue() {
		const blockIdsToRemove = new Set<string>();
		let taskNode = this.queue._tasks.head;

		while (taskNode) {
			const task = taskNode.data;
			if (this.restoreFromCache(task.el, task.md5Hash)) {
				blockIdsToRemove.add(task.blockId);
			}
			taskNode = taskNode.next;
		}
		if(blockIdsToRemove.size === 0) return;
		console.log("Removing tasks from queue:", blockIdsToRemove);
		this.queue._tasks.remove(node => blockIdsToRemove.has(node.data.blockId));
		console.log("Queue after removal:", this.queue._tasks.length);
	}
	
	private validateCatchDirectory(){
		const cacheFolderParentPath = path.join(this.plugin.getVaultPath(), this.plugin.app.vault.configDir, "swiftlatex-render-cache");
		this.packageCacheFolderPath = path.join(cacheFolderParentPath, "package-cache");
		this.cacheFolderPath = path.join(cacheFolderParentPath, "pdf-cache");
		for (const path of [cacheFolderParentPath,this.cacheFolderPath, this.packageCacheFolderPath]) {
			if (!fs.existsSync(path)) {
				fs.mkdirSync(path, { recursive: true });
			}
		}
	}

	private loadCache() {
		const cache = new Map(this.plugin.settings.cache);
		// For some reason `this.cache` at this point is actually `Map<string, Array<string>>`
		for (const [k, v] of cache) {
			cache.set(k, new Set(v))
		}
		this.cache = new SvgCache(this.plugin,cache,this.cacheFolderPath);
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
		for (const [key, val] of Object.entries(this.plugin.settings.packageCache[1] as Record<string,string>)) {
			const filename = path.basename(val);
			//const read_success = false;
			try {
				const srccode = fs.readFileSync(path.join(this.packageCacheFolderPath, filename));
				await this.engine.writeTexFSFile(filename, srccode);
			} catch (e) {
				// when unable to read file, remove this from the cache
				console.warn(`Unable to read file ${filename} from package cache`,e)
				delete this.plugin.settings.packageCache[1][key];
			}
		}
		await this.plugin.saveSettings()

		// write cache data to the VFS, except don't write the texlive404_cache because this will cause problems when switching between texlive sources
		await this.engine.writeCacheData(
			{},
			this.plugin.settings.packageCache[1],
			this.plugin.settings.packageCache[2],
			this.plugin.settings.packageCache[3]
		)
	}
	async onunload() {
		await this.engine.flushWorkCache();
		this.engine.closeWorker();
	}
	private async unloadCache() {
		await this.engine.flushCache();
		fs.rmdirSync(this.cacheFolderPath, { recursive: true });
	}

	handleError(el: HTMLElement, err: string,options: {parseErr?:boolean,hash?:string,throw?: boolean}={}): void {
		el.innerHTML = "";
		let child: HTMLElement;
		if(options.parseErr){
			const processedError:ProcessedLog = (options.hash&&this.getLog(options.hash))||parseLatexLog(err);
			child = createErrorDisplay(processedError);
		} else child = errorDiv({title: err});
		if(options.hash) child.id = options.hash;
		el.appendChild(child);
		if(options.throw) throw err;
	}
	private async renderLatexToElement(source: string, el: HTMLElement,md5Hash: string, sourcePath: string): Promise<void> {
		try {
			const dataPath = path.join(this.cacheFolderPath, `${md5Hash}.${cacheFileFormat}`);
			const result = await this.renderLatexToPDF(source,md5Hash);
			el.innerHTML = "";
			await this.translatePDF(result.pdf, el,md5Hash);
			await fs.promises.writeFile(dataPath, el.innerHTML, "utf8");
			this.cache.addFile(md5Hash, sourcePath);
		} catch (err) {
			this.handleError(el, err as string,{parseErr: true,hash: md5Hash});
		} finally {
			await waitFor(() => this.engine.isReady());
			await this.cache.afterRenderCleanUp();
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

	renderLatexToPDF(source: string,md5Hash: string): Promise<CompileResult> {
		return new Promise(async (resolve, reject) => {
			temp.mkdir("obsidian-swiftlatex-renderer", async (err: any, dirPath: any) => {
				try {
					await waitFor(() => this.engine.isReady());
				} catch (err) {
					reject(err);
					return;
				}
				if (err) reject(err);
				await this.virtualFileSystem.loadVirtualFileSystemFiles();
				await this.engine.writeMemFSFile("main.tex", source);
				await this.engine.setEngineMainFile("main.tex");
				await this.engine.compileLaTeX().then(async (result: CompileResult) => {
					this.virtualFileSystem.removeVirtualFileSystemFiles();
					this.addLog(result.log,md5Hash);
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
			const cacheData: StringMap[] = await this.engine.fetchCacheData();
			console.log("Cache data fetched:", cacheData);
			
			const newFileNames = getNewPackageFileNames(
				this.plugin.settings.packageCache[1] as Record<string,string>,
				cacheData[1] as Record<string,string>
			);
			await this.engine.fetchTexFiles(newFileNames, this.packageCacheFolderPath);
			this.plugin.settings.packageCache = cacheData;
			await this.plugin.saveSettings();
	
		} catch (err) {
			console.error("Error fetching package cache data:", err);
		}
	}
	
	
	/**
	 * Remove all cached package files from the file system and update the settings.
	 */
	public removeAllCachedPackages(): void {
		clearFolder(this.packageCacheFolderPath);
		this.plugin.settings.packageCache=[{}, {}, {}, {}];
		this.plugin.saveSettings().then(() => {
			console.log("Package cache settings updated.");
		});
	}
	addLog(log: ProcessedLog|string,hash: string): void {
		if (!this.plugin.settings.saveLogs) return this.logCache=undefined;
		if (!this.logCache) this.logCache = new Map();
		if (typeof log === "string") log = parseLatexLog(log);
		this.logCache.set(hash, log);
	}
	getLog(hash: string): ProcessedLog | undefined {
		if (!this.plugin.settings.saveLogs||!this.logCache) return undefined;
		return this.logCache.get(hash);
	}
	removeLog(log: ProcessedLog,hash: string): void {
		if (!this.plugin.settings.saveLogs||!this.logCache) return this.logCache=undefined;
		this.logCache.delete(hash);
	}
}


const updateQueueCountdown = (queue: QueueObject<Task>) => {
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
	



function getNewPackageFileNames(oldCacheData: Record<string,string>, newCacheData: Record<string,string>): string[] 
{
	// based on the old and new package files in package cache data,
	// return the new package files
	let newKeys = Object.keys(newCacheData).filter(key => !(key in oldCacheData));
	let newPackageFiles = newKeys.map(key => path.basename(newCacheData[key]));		
	return newPackageFiles;
}





export async function getFileSectionsFromPath(path: string, app: App) {
	const file = app.vault.getAbstractFileByPath(path) as TFile;
	//we cant use the file cache
	const sections = await getFileSections(file, app, true);
	if (!sections) throw new Error("No sections found in metadata");
	return {file,sections};
}



export function addMenu(plugin: Moshe,el: HTMLElement,filePath: string) {
	el.addEventListener("contextmenu", (event) => {
		if(!event.target)return
		const clickedElement = event.target as HTMLElement;
		const menu = new SvgContextMenu(plugin,clickedElement,filePath);
		menu.open(event)
	});
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


