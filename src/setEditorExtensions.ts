import Moshe from "./main";
import { getTikzSuggestions, Latex } from "./utilities";
import { EditorView, ViewPlugin, ViewUpdate ,Decoration, tooltips, } from "@codemirror/view";
import { EditorState, Prec,Extension } from "@codemirror/state";
import { Context } from "./utils/context";
import { getCharacterAtPos, isComposing, replaceRange, setCursor } from "./editor utilities/editor_utils";
import { keyboardAutoReplaceHebrewToEnglishTriggers } from "./staticData/mathParserStaticData";
import {  Suggestor } from "./suggestor";
import { RtlForc } from "./editorDecorations";
import { setSelectionToNextTabstop } from "./snippets/snippet_management";

import { runSnippets } from "./features/run_snippets";
import { getLatexSuiteConfig, getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { runAutoFraction } from "./features/autofraction";
import { runMatrixShortcuts } from "./features/matrix_shortcuts";
import { shouldTaboutByCloseBracket, tabout } from "./features/tabout";
import { snippetExtensions } from "./snippets/codemirror/extensions";
import { colorPairedBracketsPluginLowestPrec, highlightCursorBracketsPlugin } from "./editor_extensions/highlight_brackets";
import { mkConcealPlugin } from "./editor_extensions/conceal";
import { cursorTooltipBaseTheme, cursorTooltipField, handleMathTooltip } from "./editor_extensions/math_tooltip";
import { context } from "esbuild-wasm";
import { removeAllTabstops, tabstopsStateField } from "./snippets/codemirror/tabstops_state_field";
import { clearSnippetQueue, snippetQueueStateField } from "./snippets/codemirror/snippet_queue_state_field";
import { handleUndoRedo, snippetInvertedEffects } from "./snippets/codemirror/history";


/*
class="cm-gutters" aria-hidden="true" style="min-height: 7865px; position: sticky;"
spellcheck="false" autocorrect="off" translate="no" contenteditable="true"

*/



export class EditorExtensions {
    private suggestor: Suggestor = new Suggestor();
    
	private onScroll (event: Event,view: EditorView) {
		console.log(this.suggestor)
		this.suggestor.updatePositionFromView(view);
	}
	closeSuggestor(){
		if(this.suggestor)this.suggestor.close()
	}
	private onMove(event: MouseEvent,view: EditorView){
		const suggestionItems = document.body.querySelectorAll(".suggestion-item");

		const clickedSuggestion = Array.from(suggestionItems).find((item) =>
			item.contains(event.target as Node)
		);
		if (clickedSuggestion) {
			const index = Array.from(suggestionItems).indexOf(clickedSuggestion);
			this.suggestor.selectionIndex=index
			this.suggestor.updateSelection(suggestionItems)
		}
	}
	private onClick (event: MouseEvent,view: EditorView) {
		if(!this.suggestor||!this.suggestor.isSuggesterDeployed()){return}
		const suggestionItems = document.body.querySelectorAll(".suggestion-item");
	
		// Check if the click is on a suggestion item
		const clickedSuggestion = Array.from(suggestionItems).find((item) =>
			item.contains(event.target as Node)
		);
		if (clickedSuggestion) {
			this.suggestor.selectDropdownItem(clickedSuggestion,view);
		}
		const dropdownItem = document.body.querySelector(".suggestion-dropdown");
		const clickedDropdown = Array.from(suggestionItems).find((item) =>
			item.contains(event.target as Node)
		);
		if(!clickedDropdown){
			this.suggestor.close()
		}
	}
	private onKeydown = (event: KeyboardEvent, view: EditorView) => {
		let key = event.key;
		let trigger
		const ctx = Context.fromView(view);
		if (!(event.ctrlKey || event.metaKey) && ctx.shouldTranslate()) {
		  trigger = keyboardAutoReplaceHebrewToEnglishTriggers.find((trigger2) => trigger2.key === event.key && trigger2.code === event.code);
		  key = trigger?.replacement||key;
		}
		if(ctx.codeblockLanguage==="tikz"){
			this.suggestor.open(ctx,view)
		}
		if(this.suggestor.isSuggesterDeployed()){
			handleDropdownNavigation(event,view,this.suggestor)
		}
		
		const success = handleKeydown(key, event.shiftKey, event.ctrlKey || event.metaKey, isComposing(view, event), view);
		if (success) 
		  event.preventDefault();
		else if (key !== event.key&&trigger) {
			event.preventDefault();
			key = trigger.replacement;
			replaceRange(view,view.state.selection.main.from,view.state.selection.main.to,key)
			setCursor(view,view.state.selection.main.from+key.length)
	  }
	};
}

const handleUpdate = (update: ViewUpdate) => {
	const settings = getLatexSuiteConfig(update.state);

	// The math tooltip handler is driven by view updates because it utilizes
	// information about visual line, which is not available in EditorState
	if (settings.mathPreviewEnabled) {
		handleMathTooltip(update);
	}

	handleUndoRedo(update);
}

const handleDropdownNavigation=(event: KeyboardEvent,view:EditorView,suggestor: Suggestor)=>{
	const items = suggestor.getAlldropdownItems();
	switch (true) {
		case event.key === "ArrowDown":
			suggestor.selectionIndex = (suggestor.selectionIndex + 1) % items.length;
			suggestor.updateSelection(items);
			event.preventDefault();
			break;
		case event.key === "ArrowUp":
			suggestor.selectionIndex = (suggestor.selectionIndex - 1 + items.length) % items.length;
			suggestor.updateSelection(items);
			event.preventDefault();
			break;
		case event.key === "ArrowLeft"||event.key === "ArrowRight":
			suggestor.close();
			break;
		case event.key === "Backspace":
			suggestor.close();
			//suggestor.deploySuggestor(ctx,view)
			break;
		default:
			break;
	}
	if (event.key === "ArrowDown") {
		
	}else if (event.key === "Enter") {
		const selectedItem = items[suggestor.selectionIndex];
		suggestor.selectDropdownItem(selectedItem,view);
		event.preventDefault();
	} /*else if (event.key === "Escape") {
		dropdown.remove();
		event.preventDefault();
	}*/
}


export const handleKeydown = (key: string, shiftKey: boolean, ctrlKey: boolean, isIME: boolean, view: EditorView) => {
	const settings = getLatexSuiteConfig(view);
	const ctx = Context.fromView(view);

	let success = false;

	/*
	* When backspace is pressed, if the cursor is inside an empty inline math,
	* delete both $ symbols, not just the first one.
	*/
	if (settings.autoDelete$ && key === "Backspace" && ctx.mode.inMath()) {
		const charAtPos = getCharacterAtPos(view, ctx.pos);
		const charAtPrevPos = getCharacterAtPos(view, ctx.pos - 1);

		if (charAtPos === "$" && charAtPrevPos === "$") {
			replaceRange(view, ctx.pos - 1, ctx.pos + 1, "");
			// Note: not sure if removeAllTabstops is necessary
			removeAllTabstops(view);
			return true;
		}
	}
	
	if (settings.snippetsEnabled) {

		// Prevent IME from triggering keydown events.
		if (settings.suppressSnippetTriggerOnIME && isIME) return;

		// Allows Ctrl + z for undo, instead of triggering a snippet ending with z
		if (!ctrlKey) {
			try {
				success = runSnippets(view, ctx, key);
				if (success) return true;
			}
			catch (e) {
				clearSnippetQueue(view);
				console.error(e);
			}
		}
	}

	if (key === "Tab") {
		success = setSelectionToNextTabstop(view);

		if (success) return true;
	}
	if (ctx.mode.strictlyInMath()) {
		if (key === "/") {
			success = runAutoFraction(view, ctx);

			if (success) return true;
		}
	}

	if (settings.matrixShortcutsEnabled && ctx.mode.blockMath) {
		if (["Tab", "Enter"].contains(key)) {
			success = runMatrixShortcuts(view, ctx, key, shiftKey);
			if (success) return true;
		}
	}
	if (key === "Tab"&&shiftKey) {
		success = tabout(view, ctx,-1);
		if (success) return true;
	}
	else if (key === "Tab" || shouldTaboutByCloseBracket(view, key)) {
		success = tabout(view, ctx,1);
		if (success) return true;
	}

	return false;
}