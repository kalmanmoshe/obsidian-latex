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
	constructor(text?: string ,codeBlockText?: string ,suggestions?: any[]){
		if(text)this.text=text
		if(codeBlockText)this.codeBlockText=codeBlockText
		if(suggestions)this.suggestions=suggestions
	}
	init(ctx: EditorSuggestContext,query: string){
		this.text = query
		const codeBlockText = this.getCodeBlockText(ctx)
		if (!codeBlockText) return;
		this.filteredSuggestions()
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
	getCodeBlockText(ctx: EditorSuggestContext) {
		const currentFileToStart = ctx.editor.getRange({line: 0, ch: 0}, ctx.start);
		const indexOfLastCodeBlockStart = currentFileToStart.lastIndexOf('```');
		const lastCodeBlockStart = currentFileToStart.lastIndexOf('```');
		if(indexOfLastCodeBlockStart===-1||lastCodeBlockStart===-1)return false
		this.codeBlockText = currentFileToStart.slice(lastCodeBlockStart);
		return true;
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
	getSuggestions(context: EditorSuggestContext): any[] | Promise<any[]> {
		const trigger = new SuggestorTrigger();
		trigger.init(context, context.query);
		return trigger.getSuggestions();
	}

	renderSuggestion(value: any, el: HTMLElement): void {
		el.addClasses(["suggestion-item"]);
		Object.assign(el, {
			className: "suggestion-item",
			innerText: value
		})
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		const view = getEditorViewFromEvent(evt);
		if (!view) return;
		if(!this.context) return;
		const editor = this.context.editor;
		const start = this.context.start;
		const end = editor.getCursor();
		const startIndex = this.getDocIndex(editor, start.line, start.ch);
    	const endIndex = this.getDocIndex(editor, end.line, end.ch);
		console.log("editor,start,end", editor, startIndex, endIndex);
		queueSnippet(view, startIndex, endIndex, value);
		expandSnippets(view);
		this.close();
	}
	getDocIndex(editor: Editor, line: number, ch: number): number {
		let text = editor.getValue();
		let lines = text.split("\n");
		let index = 0;
		for (let i = 0; i < line; i++) {
			index += lines[i].length + 1;
		}
		return index + ch;
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
