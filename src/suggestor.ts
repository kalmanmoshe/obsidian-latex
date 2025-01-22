import { getTikzSuggestions,  } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { Context } from "./utils/context";
import { replaceRange, setCursor } from "./editor utilities/editor_utils";
import { expandSnippets } from "./snippets/snippet_management";
import { queueSnippet } from "./snippets/codemirror/snippet_queue_state_field";

class SuggestorTrigger{
	private text: string
	private codeBlockText: string;
	private suggestions: string[]=[];
	constructor(ctx: Context, view: EditorView){
		this.text=this.getCurrentLineText(ctx.pos, view)
		const source=this.getCodeBlockText(ctx,view)
		this.filteredSuggestions()
		if(!source)return
		//const tokens=new BasicTikzTokens(source)
		//console.log(tokens)
	}
	getSuggestions(){return this.suggestions}
	getText(){return this.text}
	setTrigger(trigger: string){

	}
	hasValue(){
		return this.text&&this.text.length>0&&this.suggestions.length!==1&&this.suggestions[0]!==this.text
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
	private filteredSuggestions() {
		const allSuggestions = getTikzSuggestions().map(s => s.trigger || s.replacement);
	
		const filteredSuggestions = allSuggestions.filter((suggestion) =>
			suggestion.toLowerCase().startsWith(this.text.toLowerCase())
		);
	
		const sortedSuggestions = filteredSuggestions.sort((a, b) => {
			const lowerLastWord = this.text.toLowerCase();
			const aLower = a.toLowerCase();
			const bLower = b.toLowerCase();
	
			const aExactMatch = aLower === lowerLastWord ? -1 : 0;
			const bExactMatch = bLower === lowerLastWord ? -1 : 0;
			if (aExactMatch !== bExactMatch) return aExactMatch - bExactMatch;
	
			if (a.length !== b.length) return a.length - b.length;
	
			return aLower.localeCompare(bLower);
		});
		this.suggestions = sortedSuggestions;
	}
	getCodeBlockText(ctx: Context,view: EditorView){
		const doc = view.state.doc;
		
		const bounds=ctx.getBounds()
		if(bounds===null)
			throw new Error("No bounds found")


		const betweenText = doc.sliceString(bounds.start, bounds.end).trim();
		return betweenText
	}
}

class Suggestor {
	private trigger: SuggestorTrigger;
	private selectionIndex: number=0;
	private context: Context;
	private containerEl: HTMLElement;

	open(context: Context,view: EditorView){
		// If the suggestor is already deployed, close it
		this.close();
		this.context=context;
		this.trigger=new SuggestorTrigger(this.context, view)
		if(!this.trigger.hasValue())return false;
		this.createContainerEl();
		this.updatePositionFromView(view);
		document.body.appendChild(this.containerEl);
		this.updateSelection();
		return true;
	}
	close(){
		document.body.querySelectorAll(".suggestion-item").forEach(node => node.remove());
		document.body.querySelector(".suggestion-dropdown")?.remove();
	}
	isSuggesterDeployed(): boolean {return !!document.body.querySelector(".suggestion-dropdown");}
	setSelectionIndex(number: number){
		this.selectionIndex=number
		this.updateSelection()
	}
	moveSelectionIndex(number: number){
		const items=this.getAlldropdownItems()
		this.selectionIndex=(suggestor.selectionIndex +number + items.length) % items.length
		this.updateSelection(items)
	}

	updatePositionFromView(view: EditorView): boolean{
		const coords=view.coordsAtPos(view.state.selection.main.head)
		if (!coords) return false;
		this.updatePosition(coords.left,coords.bottom)
		return true;
	}
	
	
	createContainerEl(){
		const suggestions=this.trigger.getSuggestions()
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
	private getDropdown(){return document.body.querySelector(".suggestion-dropdown")}

	handleDropdownNavigation(event: KeyboardEvent,view:EditorView) {
		const dropdown = this.getDropdown();
		if (!dropdown) return;
	
		const items = this.getAlldropdownItems();

		if (items.length === 0) return;
		switch (true) {
			case event.key === "ArrowDown":
				this.moveSelectionIndex(1)
				event.preventDefault();
				break;
			case event.key === "ArrowUp":
				this.moveSelectionIndex(-1)
				event.preventDefault();
				break;
			case event.key === "ArrowLeft"||event.key === "ArrowRight":
				suggestor.close();
				break;
			case event.key === "Backspace":
				suggestor.close();
				break;
			case event.key === "Enter":
				suggestor.selectDropdownItem(view);
				event.preventDefault();
				break;
			case event.key === "Escape":
				suggestor.close();
				event.preventDefault();
				break;
			default:
				return false;
		}
		return true;
	}

	updateSelection(items: NodeListOf<Element>=this.getAlldropdownItems()) {
		items.forEach((item, index) => {
			if (index === this.selectionIndex) {
				item.classList.add("selected");
				item.scrollIntoView({ block: "nearest" });
			} else {
				item.classList.remove("selected");
			}
		});
	}

	selectDropdownItem(view: EditorView,item: Element=this.getAlldropdownItems()[this.selectionIndex]) {
		this.close()
		if(!this.context)return;

		const trigger=this.trigger.getText()

		const selectedText = item.textContent || "";
		const pos=this.context.pos;
		queueSnippet(view,pos-trigger.length,pos,selectedText)
		const success = expandSnippets(view);
		view.focus();
		setCursor(view,calculateNewCursorPosition(trigger,selectedText,pos))
		return success;
	}
}


function calculateNewCursorPosition(triggerText: string, selectedText: string, originalPos: number): number {
	console.log('calculateNewCursorPosition',triggerText,selectedText,originalPos)
    const lengthDifference = selectedText.length - triggerText.length;
    return originalPos + lengthDifference;
}

export const suggestor = new Suggestor();