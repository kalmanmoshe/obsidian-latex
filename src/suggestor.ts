import { getTikzSuggestions,  } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { Context } from "./utils/context";
import { replaceRange, setCursor } from "./editor utilities/editor_utils";
import { expandSnippets } from "./snippets/snippet_management";
import { queueSnippet } from "./snippets/codemirror/snippet_queue_state_field";

class SuggestorTrigger{
	text: string
	codeBlockText: string;
	constructor(ctx: Context, view: EditorView){
		this.text=this.getCurrentLineText(ctx.pos, view)
		const source=this.getCodeBlockText(ctx,view)
		if(!source)return
		//const tokens=new BasicTikzTokens(source)
		//console.log(tokens)
	}
	setTrigger(trigger: string){

	}
	getCurrentLineText(pos: number, view: EditorView): string {
		const line = view.state.doc.lineAt(pos);
		//const cursorOffsetInLine = (pos+2) - line.from;I don't know why I had this here
		const textUpToCursor = line.text.slice(0, pos- line.from).trim();
		const words = textUpToCursor.split(/([\s,\[\](){};]|--\+\+|--\+|--)+/);
		const word=words[words.length - 1]||'';
		/* Checks that need to be made
		1. In what command are we in if any.
		2. Are we inputting a Variable a coordinate or formatting.
		3. if Formatting Are we starting to type a command or are we inputting a value to a command
		*/
		return words[words.length - 1] || "";
	}
	getCodeBlockText(ctx: Context,view: EditorView){
		const doc = view.state.doc;
		const s = doc.lineAt(ctx.pos);

		const bounds=ctx.getBounds()
		if(bounds===null)
			throw new Error("No bounds found")

		const betweenText = doc.sliceString(bounds.start, bounds.end).trim();
		return betweenText
	}
}

class Suggestor {
	private trigger: SuggestorTrigger;
	selectionIndex: number;
	private context: Context;
	private suggestions = [];
	private containerEl: HTMLElement;

	open(context: Context,view: EditorView){
		// If the suggestor is already deployed, close it
		this.close();
		this.context=context;
		this.createContainerEl(view);
		this.updatePositionFromView(view);
		document.body.appendChild(this.containerEl);
	}
	close(){
		document.body.querySelectorAll(".suggestion-item").forEach(node => node.remove());
		document.body.querySelector(".suggestion-dropdown")?.remove();
	}
	isSuggesterDeployed(): boolean {return !!document.body.querySelector(".suggestion-dropdown");}

	updatePositionFromView(view: EditorView): boolean{
		const coords=view.coordsAtPos(view.state.selection.main.head)
		if (!coords) return false;
		this.updatePosition(coords.left,coords.bottom)
		return true;
	}
	
	
	createContainerEl(view: EditorView){
		const suggestions=this.getSuggestions(view)
		if(suggestions.length<1)return;
		this.containerEl = document.createElement("div");
		this.containerEl.addClass("suggestion-dropdown")

		suggestions.forEach((suggestion) => {
			this.renderSuggestion(suggestion);
		});
	}

	renderSuggestion(suggestion: string){
		this.containerEl.appendChild(
			Object.assign(document.createElement("div"), {
				className: "suggestion-item",
				innerText: suggestion
			})
		);
	}

	updatePosition(left: number,top: number){
		if (!this.containerEl) return false;
		Object.assign(this.containerEl.style,{
			position: "absolute",
			left: `${left}px`,
			top: `${top}px`,
		});
		return true;
	}

	getAlldropdownItems(){return document.body.querySelectorAll(".suggestion-item")}
	private dropdownifAnyDeployed(){return document.body.querySelector(".suggestion-dropdown")}

	private handleDropdownNavigation(event: KeyboardEvent,view:EditorView) {
		const dropdown = this.dropdownifAnyDeployed();
		if (!dropdown || this.selectionIndex === undefined) return;
	
		const items = this.getAlldropdownItems();

		if (items.length === 0) return;
		
	}

	private getSuggestions(view: EditorView) {
		this.trigger=new SuggestorTrigger(this.context, view)
		const allSuggestions = getTikzSuggestions().map(s => s.trigger||s.replacement);
	
		const filteredSuggestions = allSuggestions.filter((suggestion) =>
			suggestion.toLowerCase().startsWith(this.trigger.text.toLowerCase())
		);
	
		const sortedSuggestions = filteredSuggestions.sort((a, b) => {
			const lowerLastWord = this.trigger.text.toLowerCase();
			const aLower = a.toLowerCase();
			const bLower = b.toLowerCase();
	

			const aExactMatch = aLower === lowerLastWord ? -1 : 0;
			const bExactMatch = bLower === lowerLastWord ? -1 : 0;
			if (aExactMatch !== bExactMatch) return aExactMatch - bExactMatch;
	
			if (a.length !== b.length) return a.length - b.length;
	
			return aLower.localeCompare(bLower);
		});
		return sortedSuggestions;
	}

	updateSelection(items: NodeListOf<Element>) {
		items.forEach((item, index) => {
			if (index === this.selectionIndex) {
				item.classList.add("selected");
				item.scrollIntoView({ block: "nearest" });
			} else {
				item.classList.remove("selected");
			}
		});
	}

	selectDropdownItem(item: Element,view: EditorView) {
		this.close()
		if(!this.context)return ;
		const selectedText = item.textContent || "";
		const pos=this.context.pos;
		queueSnippet(view,pos-this.trigger.text.length,pos,selectedText)
		const success = expandSnippets(view);
		view.focus();
		setCursor(view,calculateNewCursorPosition(this.trigger.text,selectedText,pos))
		console.log(`Selected: ${selectedText}`);
		return success;
	}
}


function calculateNewCursorPosition(triggerText: string, selectedText: string, originalPos: number): number {
    const lengthDifference = selectedText.length - triggerText.length;
    return originalPos + lengthDifference;
}

export const suggestor = new Suggestor();