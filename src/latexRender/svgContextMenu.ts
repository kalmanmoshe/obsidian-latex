import { Menu, Notice, TFile } from "obsidian";
import { LatexAbstractSyntaxTree } from "./parse/parse";
import Moshe from "src/main";
import { getLatexSourceFromHash } from "./latexSourceFromFile";
import { getFileSections, getSectionCacheOfString } from "./sectionCache";
import { addMenu, createWaitingCountdown, getBlockId } from "./main";
/**add:
 * - Reveal in file explorer
 * - show log
 * - show logs (soch as \print{} \message{"hello world"} and more)
 * - properties (such as size, dependencies, hash, date created, )
 */
export class SvgContextMenu extends Menu {
	plugin: Moshe;
	triggeringElement: SVGElement;
	sourcePath: string;
	isError: boolean;
	source: string;
	constructor(plugin: Moshe,trigeringElement: HTMLElement,sourcePath: string) {
		super();
    	this.plugin = plugin;
		const el=this.insureIsSVG(trigeringElement);
		if(!el&&!this.isError)
			console.error("No svg element found in the hierarchy")
		else if(el)
			this.triggeringElement = el;
		this.sourcePath = sourcePath;
		this.addDisplayItems();
	}
	private insureIsSVG(el: HTMLElement): SVGElement|null {
		if (el instanceof SVGElement) {
			return el;
		}
		if(el.classList.contains("moshe-swift-latex-error-cause")||el.classList.contains("moshe-swift-latex-error-container")){
			this.isError=true;
			return null;
		}
		for (const child of Array.from(el.children)) {
			const svg = this.insureIsSVG(child as HTMLElement);
			if (svg) return svg;
		}
		return null;
	}
	private addDisplayItems(){
		if(this.isError)return;
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

	}
	private getHash(){
		if(this.isError)return null;
		const hash = this.triggeringElement.id;
		if (hash===undefined) throw new Error("No hash found for SVG element got: "+hash);
		return hash;
	}
	private async assignLatexSource(){
		if(this.source!==undefined)return true ;
		const file=await this.getFile();
		const hash=this.getHash();
		if(!hash)return false;
		this.source = await getLatexSourceFromHash(hash,this.plugin,file);
		return true;
	}
	private async getFile(){
		const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
		if (!file) throw new Error("File not found");
		if(!(file instanceof TFile))throw new Error("File is not a TFile");
		return file;
	}
	private async removeAndReRender(){
		if(this.isError){
			new Notice("this is in err message the PDF never existed in the first place");
			return;
		}
		this.assignLatexSource()
		const hash=this.getHash();if(!hash)return;

		await this.plugin.swiftlatexRender.removePDFFromCache(hash);
		const parentEl=this.triggeringElement.parentNode;
		if(!parentEl)throw new Error("No parent element found for SVG element");
		if(!(parentEl instanceof HTMLElement))throw new Error("Parent element is not an HTMLElement");
		parentEl.removeChild(this.triggeringElement);

		
		const file=await this.getFile();
		if(!file)throw new Error("No file found");

		const sections=await getFileSections(file,this.plugin.app,true);
		if(!sections)throw new Error("No sections found in metadata");


		addMenu(this.plugin,parentEl,this.sourcePath)
		const queue=this.plugin.swiftlatexRender.queue;
		const fileText = await this.plugin.app.vault.read(file);
		const sectionCache=getSectionCacheOfString(sections,fileText,this.source);
		if(!sectionCache)throw new Error("Section cache not found");
		const blockId = getBlockId(this.sourcePath,sectionCache.position.start.line);
		queue.remove(node => node.data.blockId === blockId);
		parentEl.appendChild(createWaitingCountdown(queue.length()));
		
		this.plugin.swiftlatexRender.queue.push({
			source: this.source,
			el: parentEl,
			md5Hash: hash,
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