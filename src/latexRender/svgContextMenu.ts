import { MarkdownView, Menu, Modal, Notice, TFile } from "obsidian";
import { LatexAbstractSyntaxTree } from "./parse/parse";
import Moshe from "src/main";
import { getLatexSourceFromHash } from "./cache/latexSourceFromFile";
import { getFileSections, } from "./cache/sectionCache";
import { addMenu, createWaitingCountdown, getBlockId, getFileSectionsFromPath, hashLatexSource, latexCodeBlockNamesRegex } from "./main";
import parseLatexLog from "./log-parser/HumanReadableLogs";
import { getSectionFromMatching } from "./cache/findSection";
import { LogDisplayModal } from "./logDisplayModal";
/**add:
 * - Reveal in file explorer
 * - show log
 * - show logs (soch as \print{} \message{"hello world"} and more)
 * - properties (such as size, dependencies, hash, date created, )
 */
export class SvgContextMenu extends Menu {
	plugin: Moshe;
	triggeringElement: HTMLElement|SVGElement;
	sourcePath: string;
	isError: boolean;
	source: string;
	private sourceAssignmentPromise: Promise<boolean> | null = null;
	constructor(plugin: Moshe,trigeringElement: HTMLElement,sourcePath: string) {
		super();
    	this.plugin = plugin;
		const el=this.insureIsSVG(trigeringElement);
		if(!el)
			console.error("No element found in the hierarchy")
		else if(el)
			this.triggeringElement = el;
		this.sourcePath = sourcePath;
		this.addDisplayItems();
	}
	private insureIsSVG(el: HTMLElement) {
		const isSvgContainer = (el: HTMLElement) => el.classList.contains("block-language-latexsvg");
		// Climb up the DOM until we find a valid container or reach the top
		while (el && (!el.parentElement || !isSvgContainer(el)) && 
			   !Array.from(el.children).some(child => isSvgContainer(child as HTMLElement))) {
			el = el.parentElement!;
		}
		if (!isSvgContainer(el) && el) {
			const childContainer = Array.from(el.children).find(child =>
				isSvgContainer(child as HTMLElement)
			) as HTMLElement | undefined;
			if (childContainer) el = childContainer;
		}
		const svg = Array.from(el.children).find(child => child instanceof SVGElement) as SVGElement | undefined;
		this.isError = !svg;
		return svg ?? Array.from(el.children).find(child =>child.classList.contains("moshe-swift-latex-error-container")&&child instanceof HTMLElement)as HTMLElement?? null;
	}
	
	private addDisplayItems(){
		
		if(!this.isError)
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
			item.setTitle("Copy parsed source");
			item.setIcon("copy");
			item.onClick(async () => {
				const source = await this.getparsedSource();
				await navigator.clipboard.writeText(source);
			});
		});
		if(!this.isError)
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
			item.onClick(async () => await this.removeAndReRender());
		});
		this.addItem((item) => {
			item.setTitle("Show logs");
			item.setIcon("info");
			item.onClick(async () => {
				this.showLogs();
			});
		});
	}
	private codeBlockLanguage(){
		if (!this.source) return undefined;

	}
	private async showLogs() {
		const hash = this.getHash();
		this.assignLatexSource();
		let log = this.plugin.swiftlatexRender.getLog(hash);
		if (!log) {
			let cause = "This may be because ";
			if (!this.plugin.settings.saveLogs) {
				cause += "log saving is disabled in the settings.";
			} else {
				cause = "";
			}
			new Notice(
				"No logs were found for this SVG element.\n" +
				(cause ? cause + "\n" : "") +
				"Re-rendering the SVG to generate logs. This may take a moment..."
			);
			await this.assignLatexSource();
			const {file,sections} = await getFileSectionsFromPath(this.sourcePath, this.plugin.app);
			const editor = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
			const fileText = editor?.getValue() ?? await this.plugin.app.vault.cachedRead(file);
			const sectionFromMatching = getSectionFromMatching(sections, fileText, this.source);
			if (!sectionFromMatching) throw new Error("No section found for this source");
			const shouldProcess = fileText.split("\n")[sectionFromMatching.lineStart].match(latexCodeBlockNamesRegex)?.[2]==="tikz"
			const el = document.createElement("div");
			const task = {md5Hash: hash, source: this.source, el: el, sourcePath: this.sourcePath}
			if(shouldProcess){
				this.plugin.swiftlatexRender.processTask(task);
			}
			try{
				const newCompile = await this.plugin.swiftlatexRender.renderLatexToPDF(task.source,task.md5Hash);
				log = parseLatexLog(newCompile.log);
			}catch(err){
				log= parseLatexLog(err);
			}
		}
		console.log("log", log);
		const modal = new LogDisplayModal(this.plugin, log);
		modal.open();
	}
	
	private getHash(){
		const hash = this.triggeringElement.id;
		if (hash===undefined) throw new Error("No hash found for SVG element");
		return hash;
	}
	assignLatexSource(): Promise<boolean> {
		if (this.source !== undefined) return Promise.resolve(true);
		if (!this.sourceAssignmentPromise) {
			this.sourceAssignmentPromise = (async () => {
				const file = await this.getFile();
				const hash = this.getHash();
				if (!hash) return false;
				this.source = await getLatexSourceFromHash(hash, this.plugin, file);
				return true;
			})();
		}
		return this.sourceAssignmentPromise;
	}
	private async getFile(){
		const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
		if (!file) throw new Error("File not found");
		if(!(file instanceof TFile))throw new Error("File is not a TFile");
		return file;
	}
	/**
	 * Can't be saved as contains dynamic content.
	 */
	
	private async removeAndReRender(){
		let hash=this.getHash()
		if(!this.isError&&hash){
			await this.plugin.swiftlatexRender.cache.removePDFFromCache(hash);
		}

		const parentEl=this.triggeringElement.parentNode;
		if(!parentEl)throw new Error("No parent element found for SVG element");
		if(!(parentEl instanceof HTMLElement))throw new Error("Parent element is not an HTMLElement");
		parentEl.removeChild(this.triggeringElement);

		this.assignLatexSource()
		const file=await this.getFile();
		if(!file)throw new Error("No file found");

		const sections=await getFileSections(file,this.plugin.app,true);
		if(!sections)throw new Error("No sections found in metadata");


		addMenu(this.plugin,parentEl,this.sourcePath)
		
		const fileText = await this.plugin.app.vault.read(file);
		
		await this.assignLatexSource();
		const sectionCache=getSectionFromMatching(sections,fileText,this.source);
		if(!sectionCache)throw new Error("Section cache not found");

		const blockId = getBlockId(this.sourcePath,sectionCache.lineStart);
		const queue=this.plugin.swiftlatexRender.queue;
		queue.remove(node => node.data.blockId === blockId);
		parentEl.appendChild(createWaitingCountdown(queue.length()));
		console.log("parentEl",parentEl)
		this.plugin.swiftlatexRender.queue.push({
			source: this.source,
			el: parentEl,
			md5Hash: hash??hashLatexSource(this.source),
			sourcePath: this.sourcePath,
			blockId,
			process: true
		})
		new Notice("SVG removed from cache. Re-rendering...");
	}
	
	async open(event: MouseEvent) {
		console.log("open")
		this.showAtPosition({ x: event.pageX, y: event.pageY });
	}
	private async getparsedSource(){
		await this.assignLatexSource()
		const ast = LatexAbstractSyntaxTree.parse(this.source);
		return ast.toString();
	}
}


