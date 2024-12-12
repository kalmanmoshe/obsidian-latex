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

import { getMathJsSymbols, Latex } from "./utilities";
import { EditorView, ViewPlugin, ViewUpdate ,Decoration, } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { SyntaxNode, TreeCursor } from "@lezer/common";


const numeralsDirectives = [
	"@hideRows",
	"@Sum",
	"@Total",
]


export class Suggestor {

	private monitor(){
		registerCodeMirrorExtensions() {
			this.registerEditorExtension([
			  Prec.highest(EditorView.domEventHandlers({ "keydown": this.onKeydown.bind(this) })),
			  EditorView.updateListener.of(this.handleUpdate.bind(this)),
		
			]);
		  }
	}
	private onKeydown(event: KeyboardEvent) {
		// Log key presses to the console
		console.log("Key pressed:", event.key);
	}
}



export class NumeralsSuggestor extends EditorSuggest<string> {
	plugin: NumeralsPlugin;
	
	/**
	 * Time of last suggestion list update
	 * @type {number}
	 * @private */
	private lastSuggestionListUpdate: number = 0;

	/**
	 * List of possible suggestions based on current code block
	 * @type {string[]}
	 * @private */
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
			);*/

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
		}*/
		//suggestionTitle.setText(value);

	}

	/**
	 * Called when a suggestion is selected. Replaces the current word with the selected suggestion
	 * @param value The selected suggestion
	 * @param evt The event that triggered the selection
	 * @returns void
	 */

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