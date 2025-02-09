import { getTikzSuggestions,  } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { Context } from "./utils/context";
import { expandSnippets } from "./snippets/snippet_management";
import { queueSnippet } from "./snippets/codemirror/snippet_queue_state_field";
import { setCursor } from "./utils/editor_utils";
import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import Moshe from "./main";


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
export class Suggestor extends EditorSuggest<string>{
	private plugin: Moshe;
	/**
	 * Time of last suggestion list update
	 * @type {number}
	 * @private */
	private lastSuggestionListUpdate = 0;
	/**
	 * List of possible suggestions based on current code block
	 * @type {string[]}
	 * @private */
	private localSuggestionCache: string[] = [];
	constructor(plugin: Moshe) {
		super(plugin.app);
		this.plugin = plugin;
	}
	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile,) {
		const currentFileToCursor = editor.getRange({line: 0, ch: 0}, cursor);
		const indexOfLastCodeBlockStart = currentFileToCursor.lastIndexOf('```');
		const isMathBlock = currentFileToCursor.slice(indexOfLastCodeBlockStart + 3, indexOfLastCodeBlockStart + 7).toLowerCase() === 'tikz';
		if (!isMathBlock) { return null; }
		const currentLineToCursor = editor.getLine(cursor.line).slice(0, cursor.ch);

		const currentLineLastWordStart = currentLineToCursor.search(/[:]?[$@\w\u0370-\u03FF]+$/);
		// if there is no word, return null
		if (currentLineLastWordStart === -1) {
			return null;
		}

		return {
			start: {line: cursor.line, ch: currentLineLastWordStart},
			end: cursor,
			query: currentLineToCursor.slice(currentLineLastWordStart)
		};
	}
	getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
		let localSymbols: string [] = [];	

		// check if the last suggestion list update was less than 200ms ago
		if (performance.now() - this.lastSuggestionListUpdate > 200) {
			const currentFileToStart = context.editor.getRange({line: 0, ch: 0}, context.start);
			const indexOfLastCodeBlockStart = currentFileToStart.lastIndexOf('```');
	
			if (indexOfLastCodeBlockStart > -1) {
				//technically there is a risk we aren't in a math block, but we shouldn't have been triggered if we weren't
				const lastCodeBlockStart = currentFileToStart.lastIndexOf('```');
				const lastCodeBlockStartToCursor = currentFileToStart.slice(lastCodeBlockStart);
	
				// Return all variable names in the last codeblock up to the cursor
				const matches = lastCodeBlockStartToCursor.matchAll(/^\s*(\S*?)\s*=.*$/gm);
				// create array from first capture group of matches and remove duplicates
				localSymbols = [...new Set(Array.from(matches, (match) => 'v|' + match[1]))];
			}


			this.localSuggestionCache = localSymbols;
			this.lastSuggestionListUpdate = performance.now();
		} else {
			localSymbols = this.localSuggestionCache
		}

		const query_lower = context.query.toLowerCase();

		// case-insensitive filter local suggestions based on query. Don't return value if full match
		const local_suggestions = localSymbols.filter((value) => value.slice(0, -1).toLowerCase().startsWith(query_lower, 2));
		local_suggestions.sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
		
		// case-insensitive filter mathjs suggestions based on query. Don't return value if full match
		let suggestions = local_suggestions;

		suggestions = suggestions.concat(["1","2","3","4"]);
		return suggestions;
	}
	renderSuggestion(value: string, el: HTMLElement): void {
		el.addClasses(["suggestion-item"]);
		Object.assign(el, {
			className: "suggestion-item",
			innerText: value
		})
	}
	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) return;
		const view = getEditorViewFromEvent(evt);
		if (!view) return;
		const editor = this.context.editor;
		const start = this.context.start;
		const end = editor.getCursor();
		queueSnippet(view,start.ch,end.ch,value);
		setCursor(view,end.ch);
		this.close();
	}
	
}

function getEditorViewFromEvent(evt: MouseEvent | KeyboardEvent): EditorView | null {
	// Ensure that evt.target is a Node (or HTMLElement)
	const target = evt.target as Node | null;
	if (!target) return null;
  
	// Attempt to find the CodeMirror editor view from the event's target element.
	const info = EditorView.findFromDOM(target as HTMLElement);
	return info ? info : null;
  }

class Suggesto {
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
		//this.selectionIndex=(suggestor.selectionIndex +number + items.length) % items.length
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
				//suggestor.close();
				break;
			case event.key === "Backspace":
				//suggestor.close();
				break;
			case event.key === "Enter":
				//suggestor.selectDropdownItem(view);
				event.preventDefault();
				break;
			case event.key === "Escape":
				//suggestor.close();
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