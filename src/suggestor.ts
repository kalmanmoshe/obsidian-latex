import NumeralsPlugin from "./main";
import {
    EditorSuggest,
    EditorPosition,
    Editor,
    TFile,
    EditorSuggestTriggerInfo,
    EditorSuggestContext,
    setIcon,
 } from "obsidian";

import { getTikzSuggestions, Latex } from "./utilities";
import { EditorView, ViewPlugin, ViewUpdate ,Decoration, } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { EditorState, Prec } from "@codemirror/state";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import Moshe from "./main";
import { context } from "esbuild-wasm";
import { Context } from "./editor utilities/context";
import { Position } from "./mathEngine";
import { replaceRange, setCursor } from "./editor utilities/editor_utils";
import moshe from "./main";


export class EditorExtensions extends Moshe{
	shouldListenForTransaction: boolean;
	private monitor() {
		this.registerEditorExtension([
			Prec.highest(EditorView.domEventHandlers({
				"keydown": (event, view) => this.onKeydown(event, view),
			})),
			EditorView.updateListener.of((update) => {
				if (this.shouldListenForTransaction && update.docChanged) {
					this.onTransaction(update.view);
					this.listenForTransaction = false; 
				}
			}),
		]);
	}
	private decorat(){

	}
}



class RtlForc {
	decorations: RangeSet<Decoration>;
  
	constructor(view: EditorView) {
	  this.decorations = this.computeDecorations(view);
	}
  
	update(update: ViewUpdate) {
	  if (update.docChanged || update.viewportChanged) {
		this.decorations = this.computeDecorations(update.view);
	  }
	}
  
	computeDecorations(view: EditorView): RangeSet<Decoration> {
	  const widgets = [];
	  for (let { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to; ) {
		  const line = view.state.doc.lineAt(pos);
		  const content = line.text.trim();
		  if (
			content
			  .replace(/[#:\s"=-\d\[\].\+\-]*/g, "")
			  .replace(/<[a-z]+[\w\s\d]*>/g, "")
			  .match(/^[א-ת]/)
		  ) {
			widgets.push(
			  Decoration.line({
				class: "custom-rtl-line",
			  }).range(line.from)
			);
		  }
		  pos = line.to + 1;
		}
	  }
	  return Decoration.set(widgets);
	}
  }


class SuggestorTrigger{
	text: string
	constructor(pos: number, view: EditorView){
		this.text=this.getCurrentLineText(pos, view)
	}
	setTrigger(trigger: string){

	}
	getCurrentLineText(pos: number, view: EditorView): string {
		const line = view.state.doc.lineAt(pos);
		console.log('line.text.slice(0, (pos+2) - line.from).trim()',line.text)
		const cursorOffsetInLine = (pos+2) - line.from;
		const textUpToCursor = line.text.slice(0, cursorOffsetInLine).trim();
	
		const words = textUpToCursor.split(/\s+/);
		return words[words.length - 1] || "";
	}
}

export class Suggestor {
	private plugin: Moshe;
	private trigger: SuggestorTrigger;
	private selectionIndex?: number;
	private context: Context;
	private listenForTransaction: boolean;
	constructor(plugin: Moshe){
		this.plugin=plugin
		this.monitor();
	}

	private monitor() {
		this.plugin.registerEditorExtension([
			Prec.highest(EditorView.domEventHandlers({
				"keydown": (event, view) => this.onKeydown(event, view),
			})),
			EditorView.updateListener.of((update) => {
				if (this.listenForTransaction && update.docChanged) {
					this.onTransaction(update.view);
					this.listenForTransaction = false; 
				}
			}),
		]);
	}

	private onKeydown(event: KeyboardEvent, view: EditorView) {
		this.handleDropdownNavigation(event,view);
		if(this.isValueKey(event))
			this.listenForTransaction = true;
	}

	private onTransaction(view: EditorView) {
		this.context  = Context.fromView(view);
		if (this.context.codeblockLanguage === "tikz") {
			this.deployDropdown(view)
		}
	}

	private getAlldropdownItems(){return document.body.querySelectorAll(".suggestion-item")}
	private dropdownifAnyDeployed(){return document.body.querySelector(".suggestion-dropdown")}

	private handleDropdownNavigation(event: KeyboardEvent,view:EditorView) {
		const dropdown = this.dropdownifAnyDeployed();
		if (!dropdown || this.selectionIndex === undefined) return;
	
		const items = this.getAlldropdownItems();

		if (items.length === 0) return;
		if (event.key === "ArrowDown") {
			this.selectionIndex = (this.selectionIndex + 1) % items.length;
			this.updateSelection(items);
			event.preventDefault();
		} else if (event.key === "ArrowUp") {
			this.selectionIndex = (this.selectionIndex - 1 + items.length) % items.length;
			this.updateSelection(items);
			event.preventDefault();
		} else if (event.key === "Enter") {
			const selectedItem = items[this.selectionIndex];
			if (selectedItem&&this.context) {
				this.selectDropdownItem(selectedItem,view);
			}
			dropdown.remove();
			event.preventDefault();
		} else if (event.key === "Escape") {
			dropdown.remove();
			event.preventDefault();
		}
	}

	private isValueKey(event: KeyboardEvent){
		return event.code.contains('Key')&&!event.ctrlKey
	}

	

	private getSuggestions(view: EditorView) {
		this.trigger=new SuggestorTrigger(this.context.pos, view)
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

	private deployDropdown(view: EditorView){
		const existingDropdown = this.dropdownifAnyDeployed();
		if (existingDropdown) existingDropdown.remove();

		const suggestions=this.getSuggestions(view)
		if(suggestions.length<1)return;

		const suggestionDropdown = createFloatingSuggestionDropdown(suggestions,view, this.context.pos);
		if (!suggestionDropdown) return;
		document.body.appendChild(suggestionDropdown);

		this.selectionIndex=0;
		this.updateSelection(this.getAlldropdownItems());

		const handleOutsideClick = (event: MouseEvent) => {
			const suggestionItems = suggestionDropdown.querySelectorAll(".suggestion-item"); // Adjust selector as needed

			// Check if the click is on a suggestion item
			const clickedSuggestion = Array.from(suggestionItems).find((item) =>
				item.contains(event.target as Node)
			);
		
			if (clickedSuggestion) {
				// Handle selection of the clicked suggestion
				this.selectDropdownItem(clickedSuggestion,view);
				suggestionDropdown.remove();
				document.removeEventListener("click", handleOutsideClick);
				return;
			}
		
			// If click is outside the dropdown, close it
			if (!suggestionDropdown.contains(event.target as Node)) {
				suggestionDropdown.remove();
				document.removeEventListener("click", handleOutsideClick);
			}
		};
		document.addEventListener("click", handleOutsideClick);
	}

	private updateSelection(items: NodeListOf<Element>) {
		items.forEach((item, index) => {
			if (index === this.selectionIndex) {
				item.classList.add("selected");
				item.scrollIntoView({ block: "nearest" });
			} else {
				item.classList.remove("selected");
			}
		});
	}

	private selectDropdownItem(item: Element,view: EditorView) {
		if(!this.context)return ;
		const selectedText = item.textContent || "";
		const pos=this.context.pos;
		replaceRange(view,pos-this.trigger.text.length,pos,selectedText)
		view.focus();
		setCursor(view,calculateNewCursorPosition(this.trigger.text,selectedText,pos))
		console.log(`Selected: ${selectedText}`);
	}
}
function calculateNewCursorPosition(triggerText: string, selectedText: string, originalPos: number): number {
    const lengthDifference = selectedText.length - triggerText.length;
    return originalPos + lengthDifference;
}

function createFloatingSuggestionDropdown(suggestions: any[],editorView: EditorView, position: number) {

    const coordinates = editorView.coordsAtPos(position);
    if (!coordinates) return;

    const suggestionDropdown = createSuggestionDropdown(suggestions);

    suggestionDropdown.style.position = "absolute";
    suggestionDropdown.style.left = `${coordinates.left}px`;
    suggestionDropdown.style.top = `${coordinates.bottom}px`;
	return suggestionDropdown;
}

// Creates a suggestion dropdown container with suggestion items
function createSuggestionDropdown(suggestions: string[]) {
    const dropdownContainer = document.createElement("div");
    dropdownContainer.className = "suggestion-dropdown";

    suggestions.forEach((suggestion) => {
        const item = createSuggestionItem(suggestion)
		item.addEventListener("click", () => {
            selectSuggestion(suggestion);
            dropdownContainer.remove();
        });
		dropdownContainer.appendChild(item)
    });

    return dropdownContainer;
}

function selectSuggestion(suggestion: string) {
    console.log(`Selected: ${suggestion}`);
}

function createSuggestionItem(displayText: string): HTMLElement {
	// Create the outer suggestion item container
	const container = document.createElement("div");
	container.classList.add("suggestion-item");
	container.innerText=displayText
  	return container
	// Create the icon container
	const icon = document.createElement("div");
	icon.classList.add("icon");
	icon.textContent = "ƒ"; // Placeholder icon content
  
	// Create the details container
	const details = document.createElement("div");
	details.classList.add("details");
  
	// Add a name span to details
	const name = document.createElement("span");
	name.classList.add("name");
	name.textContent = "function"; // Placeholder name content
  
	// Add a type span to details
	const type = document.createElement("span");
	type.classList.add("type");
	type.textContent = "Keyword"; // Placeholder type content
  
	// Append name and type to details
	details.appendChild(name);
	details.appendChild(type);
  
	// Append icon and details to the container
	container.appendChild(icon);
	container.appendChild(details);
  
	return container;
}

const onKeydown = (event: KeyboardEvent, view: EditorView) => {
	let key = event.key;
	const ctx = Context.fromView(view);
	if (!(event.ctrlKey || event.metaKey) && (ctx.mode.inMath() && (!ctx.inTextEnvironment() || ctx.codeblockLanguage.match(/(tikz)/)))) {
	  const trigger = getTriggers().find((trigger2) => trigger2.key === event.key && trigger2.code === event.code);
	  if (trigger) {
		key = trigger.replacement;
	  }
	}
  
	const success = handleKeydown(key, event.shiftKey, event.ctrlKey || event.metaKey, isComposing(view, event), view, ctx);
	if (success) {
	  event.preventDefault();
	} else if (key !== event.key) {
	  event.preventDefault();
	  const { from } = view.state.selection.main;
	  view.dispatch({
		changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert: key },
		selection: { anchor: from + key.length }
	  });
	}
};

const handleKeydown = (key: string, shiftKey: boolean, ctrlKey: boolean, isIME: any, view: EditorView | EditorState, ctx: Context) => {
	const settings = getLatexSuiteConfig(view);
	let success = false;
	if (settings.autoDelete$ && key === "Backspace" && ctx.mode.inMath()) {
	  const charAtPos = getCharacterAtPos(view, ctx.pos);
	  const charAtPrevPos = getCharacterAtPos(view, ctx.pos - 1);
	  if (charAtPos === "$" && charAtPrevPos === "$") {
		replaceRange(view, ctx.pos - 1, ctx.pos + 1, "");
		removeAllTabstops(view);
		return true;
	  }
	}
	if (settings.snippetsEnabled) {
	  if (settings.suppressSnippetTriggerOnIME && isIME)
		return;
	  if (!ctrlKey) {
		try {
		  success = runSnippets(view, ctx, key);
		  if (success)
			return true;
		} catch (e) {
		  clearSnippetQueue(view);
		  console.error(e);
		}
	  }
	}
	if (key === "Tab") {
	  success = setSelectionToNextTabstop(view);
	  if (success)
		return true;
	}
	if (settings.autofractionEnabled && ctx.mode.strictlyInMath()) {
	  if (key === "/") {
		success = runAutoFraction(view, ctx);
		if (success)
		  return true;
	  }
	}
	if (settings.matrixShortcutsEnabled && ctx.mode.blockMath) {
	  if (["Tab", "Enter"].contains(key)) {
		success = runMatrixShortcuts(view, ctx, key, shiftKey);
		if (success)
		  return true;
	  }
	}
	if (settings.taboutEnabled) {
	  if (key === "Tab" || shouldTaboutByCloseBracket(view, key)) {
		success = tabout(view, ctx);
		if (success)
		  return true;
	  }
	}
	return false;
  };


function getTriggers() {
	return [
	  { key: "\u05D0", code: "KeyT", replacement: "t" },
	  { key: "\u05D1", code: "KeyC", replacement: "c" },
	  { key: "\u05D2", code: "KeyD", replacement: "d" },
	  { key: "\u05D3", code: "KeyS", replacement: "s" },
	  { key: "\u05D4", code: "KeyV", replacement: "v" },
	  { key: "\u05D5", code: "KeyU", replacement: "u" },
	  { key: "\u05D6", code: "KeyZ", replacement: "z" },
	  { key: "\u05D7", code: "KeyJ", replacement: "j" },
	  { key: "\u05D8", code: "KeyY", replacement: "y" },
	  { key: "ך", code: "KeyL", replacement: "l" },
	  { key: "\u05D9", code: "KeyH", replacement: "h" },
	  { key: "\u05DB", code: "KeyF", replacement: "f" },
	  { key: "\u05DC", code: "KeyK", replacement: "k" },
	  { key: "\u05DE", code: "KeyN", replacement: "n" },
	  { key: "\u05DD", code: "KeyO", replacement: "o" },
	  { key: "\u05E0", code: "KeyB", replacement: "b" },
	  { key: "\u05DF", code: "KeyI", replacement: "i" },
	  { key: "\u05E1", code: "KeyX", replacement: "x" },
	  { key: "\u05E2", code: "KeyG", replacement: "g" },
	  { key: "\u05E4", code: "KeyP", replacement: "p" },
	  { key: "\u05E6", code: "KeyM", replacement: "m" },
	  { key: "\u05E8", code: "KeyR", replacement: "r" },
	  { key: "\u05E7", code: "KeyE", replacement: "e" },
	  { key: "\u05E9", code: "KeyA", replacement: "a" },
	  { key: "\u05EA", code: "KeyC", replacement: "c" },
	  { key: "ת", code: "Comma", replacement: "," },
	  { key: "'", code: "KeyW", replacement: "w" },
	  { key: "\u05E5", code: "Period", replacement: "." },
	  { key: ".", code: "Slash", replacement: "/" },
	  { key: "]", code: "BracketLeft", replacement: "[" },
	  { key: "[", code: "BracketRight", replacement: "]" },
	  { key: "}", code: "BracketLeft", replacement: "{" },
	  { key: "{", code: "BracketRight", replacement: "}" },
	  { key: ")", code: "Digit9", replacement: "(" },
	  { key: "(", code: "Digit0", replacement: ")" },
	  { key: ">", code: "Comma", replacement: "<" },
	  { key: "<", code: "Period", replacement: ">" }
	];
  }

/*
export class NumeralsSuggestor extends EditorSuggest<string> {
	plugin: NumeralsPlugin;
	
	/**
	 * Time of last suggestion list update
	 * @type {number}
	 * @private 
	private lastSuggestionListUpdate: number = 0;

	/**
	 * List of possible suggestions based on current code block
	 * @type {string[]}
	 * @private 
	private localSuggestionCache: string[] = [];

	//empty constructor
	constructor(plugin: NumeralsPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {

		const cmEditor = editor as any;
		const view = cmEditor.cm ? (cmEditor.cm as EditorView) : null;
		if (view === null) return null;
		const codeblockLeng=langIfWithinCodeblock(view.state)
		const isMathBlock=codeblockLeng?.contains('tikz')

		const pos = view.state.selection.ranges[0].from;
		const line = view.state.doc.lineAt(pos);
		//const domNode = view.domAtPos(line.from).node;
		if (!isMathBlock) {
			return null;
		}
		

		// Get last word in current line
		const currentLine = view.state.doc.lineAt(pos).text;
		const currentLineLastWordStart = currentLine.search(/[:]?[$@\w\u0370-\u03FF]+$/);
		// if there is no word, return null
		if (currentLineLastWordStart === -1) {
			return null;
		}

		return {
			start: {line: cursor.line, ch: currentLineLastWordStart},
			end: cursor,
			query: currentLine.slice(currentLineLastWordStart)
		};
	}

	getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
		let localSymbols: string [] = [];	

		localSymbols = this.localSuggestionCache
		const query = context.query.toLowerCase();

		const local_suggestions = localSymbols.filter((value) => value.slice(0, -1).toLowerCase().startsWith(query, 2));
		local_suggestions.sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
		
		// case-insensitive filter mathjs suggestions based on query. Don't return value if full match
		let suggestions: string[] = [];

		const mathjs_suggestions = getMathJsSymbols().filter((obj: Latex) => obj.value.slice(0, -1).toLowerCase().startsWith(query, 2));

		suggestions = mathjs_suggestions.map((o:Latex)=>o.value)//local_suggestions.concat(mathjs_suggestions);

		/*suggestions = suggestions.concat(
			numeralsDirectives
				.filter((value) => value.slice(0,-1).toLowerCase().startsWith(query, 0))
				.map((value) => 'm|' + value)
			);

		return suggestions;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value)/*
		el.addClasses(['mod-complex', 'numerals-suggestion']);
		const suggestionContent = el.createDiv({cls: 'suggestion-content'});
		const suggestionTitle = suggestionContent.createDiv({cls: 'suggestion-title'});
		const suggestionNote = suggestionContent.createDiv({cls: 'suggestion-note'});
		const suggestionAux = el.createDiv({cls: 'suggestion-aux'});
		const suggestionFlair = suggestionAux.createDiv({cls: 'suggestion-flair'});*/

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		/*
		const [iconType, suggestionText, noteText] = value.split('|');

		if (iconType === 'f') {
			setIcon(suggestionFlair, 'function-square');		
		} else if (iconType === 'c') {
			setIcon(suggestionFlair, 'locate-fixed');
		} else if (iconType === 'v') {
			setIcon(suggestionFlair, 'file-code');
		} else if (iconType === 'p') {
			setIcon(suggestionFlair, 'box');
		} else if (iconType === 'm') {
			setIcon(suggestionFlair, 'sparkles');			
		} else if (iconType === 'g') {
			setIcon(suggestionFlair, 'case-lower'); // Assuming 'symbol' is a valid icon name
		}
		suggestionTitle.setText(suggestionText);
		if (noteText) {
			suggestionNote.setText(noteText);
		}
		//suggestionTitle.setText(value);

	}

	/**
	 * Called when a suggestion is selected. Replaces the current word with the selected suggestion
	 * @param value The selected suggestion
	 * @param evt The event that triggered the selection
	 * @returns void
	 

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		if (this.context) {
			const editor = this.context.editor;
			
			const cmEditor = editor as any;
			const view = cmEditor.cm ? (cmEditor.cm as EditorView) : null;
			if (view === null) return;
	
			const cursor = view.state.selection.main;
			const from = cursor.from;
			const to = cursor.to; 
	
			view.dispatch({
				changes: { from, to, insert: value },
				selection: { anchor: from + value.length }
			});
			
			this.close();
		}
	}
}
*/

export function getCharacterAtPos(viewOrState: EditorView | EditorState, pos: number) {
	const state = viewOrState instanceof EditorView ? viewOrState.state : viewOrState;
	const doc = state.doc;
	return doc.slice(pos, pos+1).toString();
}


 
const langIfWithinCodeblock = (state: EditorState): string | null => {
	const tree = syntaxTree(state);

	const pos = state.selection.ranges[0].from;

	/*
	* get a tree cursor at the position
	*
	* A newline does not belong to any syntax nodes except for the Document,
	* which corresponds to the whole document. So, we change the `mode` of the
	* `cursorAt` depending on whether the character just before the cursor is a
	* newline.
	*/
	const cursor =
		pos === 0 || getCharacterAtPos(state, pos - 1) === "\n"
		? tree.cursorAt(pos, 1)
		: tree.cursorAt(pos, -1);

	// check if we're in a codeblock atm at all
	const inCodeblock = cursor.name.contains("codeblock");
	if (!inCodeblock) {
		return null;
	}

	// locate the start of the block
	const codeblockBegin = escalateToToken(cursor, Direction.Backward, "HyperMD-codeblock_HyperMD-codeblock-begin");

	if (codeblockBegin == null) {
		console.warn("unable to locate start of the codeblock even though inside one");
		return "";
	}

	// extract the language
	// codeblocks may start and end with an arbitrary number of backticks
	const language = state.sliceDoc(codeblockBegin.from, codeblockBegin.to).replace(/`+/, "");

	return language;
}


export function escalateToToken(cursor: TreeCursor, dir: Direction, target: string): SyntaxNode | null {
	// Allow the starting node to be a match
	if (cursor.name.contains(target)) {
		return cursor.node;
	}

	while (
		(cursor.name != "Document") &&
		((dir == Direction.Backward && cursor.prev())
		|| (dir == Direction.Forward && cursor.next())
		|| cursor.parent())
	) {
		if (cursor.name.contains(target)) {
			return cursor.node;
		}
	}

	return null;
}

export enum Direction {
	Backward,
	Forward,
}