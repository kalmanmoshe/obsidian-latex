
import { EditorView, ViewPlugin, ViewUpdate  } from "@codemirror/view";
import { Context } from "./utils/context";
import { keyboardAutoReplaceHebrewToEnglishTriggers } from "./staticData/mathParserStaticData";
import { setSelectionToNextTabstop } from "./snippets/snippet_management"; 
import { runSnippets } from "./features/run_snippets";
import { getLatexSuiteConfig, getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { runAutoFraction } from "./features/autofraction";
import { runMatrixShortcuts } from "./features/matrix_shortcuts";
import { shouldTaboutByCloseBracket, tabout } from "./features/tabout";
import {  handleMathTooltip } from "./editor_extensions/math_tooltip";
import { removeAllTabstops, tabstopsStateField } from "./snippets/codemirror/tabstops_state_field";
import { clearSnippetQueue, snippetQueueStateField } from "./snippets/codemirror/snippet_queue_state_field";
import { handleUndoRedo, snippetInvertedEffects } from "./snippets/codemirror/history";
import { suggestor } from "./suggestor";
import { Direction, getCharacterAtPos, isComposing, replaceRange, setCursor } from "./utils/editor_utils";

/*
class="cm-gutters" aria-hidden="true" style="min-height: 7865px; position: sticky;"
spellcheck="false" autocorrect="off" translate="no" contenteditable="true"

*/


export const onKeydown = (event: KeyboardEvent, view: EditorView) => {
	let key = event.key;
	let trigger
	const ctx = Context.fromView(view);
	if (!(event.ctrlKey || event.metaKey) && ctx.shouldTranslate()) {
	  trigger = keyboardAutoReplaceHebrewToEnglishTriggers.find((trigger2) => trigger2.key === event.key && trigger2.code === event.code);
	  key = trigger?.replacement||key;
	}
	if(suggestor.isSuggesterDeployed()){
		suggestor.handleDropdownNavigation(event,view)
	}
	
	const success = handleKeydown(key, event.shiftKey, event.ctrlKey || event.metaKey, isComposing(view, event), view,ctx);
	if (success)
	  event.preventDefault();
	else if (key !== event.key&&trigger) {
		event.preventDefault();
		key = trigger.replacement;
		replaceRange(view,view.state.selection.main.from,view.state.selection.main.to,key)
		setCursor(view,view.state.selection.main.from+key.length)
  }
};

export const onTransaction = (update: ViewUpdate) => {
	const settings = getLatexSuiteConfig(update.state);

	// The math tooltip handler is driven by view updates because it utilizes
	// information about visual line, which is not available in EditorState
	if (settings.mathPreviewEnabled) {
		handleMathTooltip(update);
	}

	handleUndoRedo(update);

}



export const handleKeydown = (key: string, shiftKey: boolean, ctrlKey: boolean, isIME: boolean, view: EditorView, ctx: Context) => {
	const settings = getLatexSuiteConfig(view);

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
	if (key === "Tab" && shiftKey) {
		const dir=shiftKey?Direction.Backward:Direction.Forward
		success = tabout(view, ctx,dir);
		if (success) return true;
	}/*
	if (key === "Tab" || shouldTaboutByCloseBracket(view, key)) {
		success = tabout(view, ctx,Direction.Forward);
		if (success) return true;
	}*/
	return false;
}

