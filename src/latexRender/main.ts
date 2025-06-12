import { MarkdownPostProcessorContext, TFile, App, MarkdownSectionInformation, MarkdownView,} from 'obsidian';
import { Md5 } from 'ts-md5';
import * as temp from 'temp';
import {CompileResult} from './compiler/base/compilerBase/engine';
import Moshe from '../main';
import { CompilerType, StringMap } from 'src/settings/settings.js';
import async from 'async';
import { pdfToHtml, pdfToSVG } from './pdfToHtml/pdfToHtml';
import parseLatexLog, {createErrorDisplay, errorDiv} from './logs/HumanReadableLogs';
import { VirtualFileSystem } from './VirtualFileSystem';
import { getFileSections,} from './cache/sectionCache';
import { SvgContextMenu } from './svgContextMenu';
import { createTransactionLogger } from './cache/transactionLogger';
import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getSectionFromMatching, getSectionFromTransaction } from './cache/findSection';
import { ProcessedLog } from './logs/latex-log-parser';
import PdfTeXCompiler from './compiler/swiftlatexpdftex/PdfTeXEngine';
import { svgDisplayModule } from './utils/svgDisplayModule';
import { LatexTask } from './utils/latexTask';
import { PdfXeTeXCompiler } from './compiler/swiftlatexxetex/pdfXeTeXCompiler';
import LatexCompiler from './compiler/base/compilerBase/compiler';
import CompilerCache from './cache/compilerCache';

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


/**
 * add option for Persistent preamble.so it won't get deleted.after use Instead, saved until overwritten
 */

export class SwiftlatexRender {
	plugin: Moshe;
	vfs: VirtualFileSystem = new VirtualFileSystem();
	pdfTexCompiler?: PdfTeXCompiler;
	pdfXetexCompiler?: PdfXeTeXCompiler;
	compiler: LatexCompiler;
	cache: CompilerCache;
	queue: QueueObject<Task>;
	logger = createTransactionLogger();
	async onload(plugin: Moshe) {
		this.plugin = plugin;
		this.bindTransactionLogger();
		this.cache = new CompilerCache(this.plugin);
		await this.loadCompiler();
		this.configQueue();
		
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
	switchCompiler():Promise<void> {
		if (this.compiler===undefined) return this.loadCompiler();
		const isTex = this.compiler instanceof PdfTeXCompiler&&this.plugin.settings.compiler === CompilerType.TeX;
		const isXeTeX = this.compiler instanceof PdfXeTeXCompiler&&this.plugin.settings.compiler === CompilerType.XeTeX;
		if(isTex||isXeTeX) return Promise.resolve();
		this.compiler.closeWorker();
		this.compiler = (undefined as any);
		this.pdfTexCompiler = undefined ;
		this.pdfXetexCompiler = undefined;
		return this.loadCompiler()
	}
	async loadCompiler(){
		if (this.plugin.settings.compiler === CompilerType.TeX) {
			this.compiler = this.pdfTexCompiler = new PdfTeXCompiler();
		}else{
			this.compiler = this.pdfXetexCompiler = new PdfXeTeXCompiler();
		}
		//console.log("Loading compiler:", this.compiler.constructor.name);
		this.vfs.setPdfCompiler(this.compiler);
		await this.compiler.loadEngine();
		await this.cache.loadPackageCache();
		await this.compiler.setTexliveEndpoint(this.plugin.settings.package_url);
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
		if (!this.cache.restoreFromCache(el,md5Hash)) {
			//Reliable enough for repeated entries
			this.ensureContextSectionInfo(source, el, ctx).then((sectionInfo) => {
				source = sectionInfo.source || source;

				const finalHash = hashLatexSource(source);
				if (md5Hash !== finalHash && this.cache.restoreFromCache(el, finalHash)) return;

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
				let abort = false;
				if (this.cache.restoreFromCache(task.el, task.md5Hash)) {cooldown=false;console.log("fund in catch for",task.blockId);return done()};
				if (task.process) abort = (await LatexTask.processTask(this.plugin,task)).abort;
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
			if (this.cache.restoreFromCache(task.el, task.md5Hash)) {
				blockIdsToRemove.add(task.blockId);
			}
			taskNode = taskNode.next;
		}
		if(blockIdsToRemove.size === 0) return;
		console.log("Removing tasks from queue:", blockIdsToRemove);
		this.queue._tasks.remove(node => blockIdsToRemove.has(node.data.blockId));
		console.log("Queue after removal:", this.queue._tasks.length);
	}
	
	async onunload() {
		this.compiler.closeWorker();
	}
	

	handleError(el: HTMLElement, err: string,options: {parseErr?:boolean,hash?:string,throw?: boolean}={}): void {
		el.innerHTML = "";
		let child: HTMLElement;
		if(options.parseErr){
			const processedError:ProcessedLog = (options.hash&&this.cache.getLog(options.hash))||parseLatexLog(err);
			child = createErrorDisplay(processedError);
		} else child = errorDiv({title: err});
		if(options.hash) child.id = options.hash;
		el.appendChild(child);
		if(options.throw) throw err;
	}
	private async renderLatexToElement(source: string, el: HTMLElement,md5Hash: string, sourcePath: string): Promise<void> {
		try {
			const result = await this.renderLatexToPDF(source,md5Hash);
			el.innerHTML = "";
			await this.translatePDF(result.pdf, el,md5Hash);
			this.cache.addFile(el.innerHTML,md5Hash, sourcePath);
		} catch (err) {
			this.handleError(el, err as string,{parseErr: true,hash: md5Hash});
		} finally {
			await waitFor(() => this.compiler.isReady());
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
					await waitFor(() => this.compiler.isReady());
				} catch (err) {
					reject(err);
					return;
				}
				if (err) reject(err);
				await this.vfs.loadVirtualFileSystemFiles();
				await this.compiler.writeMemFSFile("main.tex", source);
				await this.compiler.setEngineMainFile("main.tex");
				await this.compiler.compileLaTeX().then(async (result: CompileResult) => {
					this.vfs.removeVirtualFileSystemFiles();
					this.cache.addLog(result.log,md5Hash);
					if (result.status != 0) {
						// manage latex errors
						reject(result.log);
					}
					// update the list of package files in the cache
					await this.cache.fetchPackageCacheData()
					resolve(result);
				});
			})
		});
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



