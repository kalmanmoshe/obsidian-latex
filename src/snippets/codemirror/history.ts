import { ViewUpdate } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { invertedEffects, undo, redo } from "@codemirror/commands";
import { removeAllTabstops } from "./tabstops_state_field";

// Effects that mark the beginning and end of transactions to insert snippets
export const startSnippet = StateEffect.define();
export const endSnippet = StateEffect.define();
export const undidStartSnippet = StateEffect.define();
export const undidEndSnippet = StateEffect.define();


// Enables undoing and redoing snippets, taking care of the tabstops
export const snippetInvertedEffects = invertedEffects.of((tr: { effects: any; }) => {
	const effects = [];

	for (const effect of tr.effects) {
		if (effect.is(startSnippet)) {
			effects.push(undidStartSnippet.of(null));
		}
		else if (effect.is(undidStartSnippet)) {
			effects.push(startSnippet.of(null));
		}
		else if (effect.is(endSnippet)) {
			effects.push(undidEndSnippet.of(null));
		}
		else if (effect.is(undidEndSnippet)) {
			effects.push(endSnippet.of(null));
		}
	}


	return effects;
});


export const handleUndoRedo = (update: ViewUpdate) => {
	// Flags to track if we need to run certain operations.
	let hasUndo = false;
	let hasRedo = false;
	let startSnippetFound = false;
	let undidEndSnippetFound = false;
  
	// Single pass over transactions and their effects.
	for (const tr of update.transactions) {
	  // Check if the transaction was triggered by undo/redo.
	  if (tr.isUserEvent("undo")) hasUndo = true;
	  if (tr.isUserEvent("redo")) hasRedo = true;
  
	  // If we already have both events and have seen both effects, we could even break early:
	  // if (hasUndo && hasRedo && startSnippetFound && undidEndSnippetFound) break;
  
	  // Check for specific snippet-related effects.
	  for (const effect of tr.effects) {
		if (effect.is(startSnippet)) {
		  startSnippetFound = true;
		} else if (effect.is(undidEndSnippet)) {
		  undidEndSnippetFound = true;
		}
	  }
	}
  
	// If there are no undo or redo events, skip further processing.
	if (!hasUndo && !hasRedo) return;
  
	// Trigger the snippet expansion/selection changes only once if needed.
	if (startSnippetFound && hasRedo) {
	  redo(update.view);
	}
	if (undidEndSnippetFound && hasUndo) {
	  undo(update.view);
	}
  
	// Remove tabstops if there was an undo.
	if (hasUndo) {
	  removeAllTabstops(update.view);
	}
  };
  