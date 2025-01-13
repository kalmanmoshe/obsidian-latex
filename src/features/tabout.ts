import { EditorView } from "@codemirror/view";
import { replaceRange, setCursor, getCharacterAtPos } from "src/utils/editor_utils";
import { Context } from "src/utils/context";
import { match } from "assert";


export const tabout = (view: EditorView, ctx: Context,dir: 1|-1):boolean => {
    if (!ctx.mode.inMath()) return false;

	const result = ctx.getBounds();
	if (!result) return false;
	const { start, end } = result;
	
	const pos = view.state.selection.main.to;
	const d = view.state.doc;
	const text = d.toString();
	// Move to the next closing bracket: }, ), ], >, |, or \\rangle
	const chars = [
		["{", "(", "[", "<"],
		[],
		["}", ")", "]", ">"]
	];
	
	const searchEnd = dir === 1 ? end+1 : start-1;
	const modifier = dir === 1 ? 0 : -1;
	for (let i = pos+modifier; i !== searchEnd; i += dir) {
		const targetChars = chars[dir + 1].concat(["\\rangle", "|", "$"]);
		const match = targetChars.find(s => text.startsWith(s, i));
		if (match !== undefined) {
			setCursor(view, i + match.length+modifier);
			return true;
		}
	}


	const textBtwnCursorAndEnd = d.sliceString(pos, end);
	const atEnd = textBtwnCursorAndEnd.trim().length === 0;

	if (!atEnd) return false;


	// Check whether we're in inline math or a block eqn
	if (ctx.mode.inlineMath || ctx.mode.codeMath) {
		setCursor(view, end + 1);
	}
	else {
		// First, locate the $$ symbol
		const dollarLine = d.lineAt(end+2);

		// If there's no line after the equation, create one

		if (dollarLine.number === d.lines) {
			replaceRange(view, dollarLine.to, dollarLine.to, "\n");
		}

		// Finally, move outside the $$ symbol
		setCursor(view, dollarLine.to + 1);


		// Trim whitespace at beginning / end of equation
		const line = d.lineAt(pos);
		replaceRange(view, line.from, line.to, line.text.trim());

	}

	return true;
}


export const shouldTaboutByCloseBracket = (view: EditorView, keyPressed: string) => {
	const sel = view.state.selection.main;
	if (!sel.empty) return;
	const pos = sel.from;

	const c = getCharacterAtPos(view, pos);
	const brackets = [")", "]", "}"];

	if ((c === keyPressed) && brackets.contains(c)) {
		return true;
	}
	else {
		return false;
	}
}