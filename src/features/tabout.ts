import { EditorView } from "@codemirror/view";
import { replaceRange, setCursor, getCharacterAtPos, Direction } from "src/utils/editor_utils";
import { Context } from "src/utils/context";
import { start } from "repl";


export const tabout = (view: EditorView, ctx: Context,dir: Direction):boolean => {
	if(ctx.mode.inMath()) return taboutMathjax(view,ctx,dir);
	if(ctx.mode.text) return taboutText(view,ctx,dir);
	if(ctx.mode.html) return taboutHtml(view,ctx,dir);
	return false;
}
const taboutHtml=(view: EditorView, ctx: Context,dir: Direction):boolean=>{
	const Params=ctxTaboutParams(view,ctx);
	if(!Params) return false;
	const {start,end,pos,doc,text}=Params;

	return false;
}
interface tagConstruction{
	open: string,
	close: string
}
const taboutText=(view: EditorView,ctx: Context,dir: Direction):boolean=>{
	const Params=ctxTaboutParams(view,ctx);
	if(!Params) return false;
	const {start,end,pos,doc,text}=Params;

	// Move to the next closing bracket: }, ), ], >, |, or \\rangle
	const chars = [
		["{", "(", "[", "<"],
		[],
		["}", ")", "]", ">"]
	];
	console.log("tabout",ctx,dir);
	const success=findTarget(view,dir,chars[dir + 1],start,end,pos,text);
	console.log("tabout",success);
	if(success) return true;
	return false;
}
const findTarget=(view: EditorView,dir: number,chars: Array<string>,start: number,end: number,pos: number,text: string)=>{
	const searchEnd = dir === 1 ? end+1 : start-1;
	const modifier = dir === 1 ? 0 : -1;

	for (let i = pos+modifier; i !== searchEnd; i += dir) {
		const match = chars.find(s => text.startsWith(s, i));
		if (match !== undefined) {
			setCursor(view, i + match.length+modifier);
			return true;
		}
	}
}
const taboutMathjax=(view: EditorView,ctx: Context,dir: Direction):boolean=>{

	const Params=ctxTaboutParams(view,ctx);
	if(!Params) return false;
	const {start,end,pos,doc,text}=Params;

	// Move to the next closing bracket: }, ), ], >, |, or \\rangle
	const chars = [
		["{", "(", "[", "<"],
		[],
		["}", ")", "]", ">"]
	];

	const success=findTarget(view,dir,chars[dir + 1].concat(["\\rangle", "|", "$"]),start,end,pos,text);
	if(success) return true;


	const textBtwnCursorAndEnd = doc.sliceString(pos, end);
	const atEnd = textBtwnCursorAndEnd.trim().length === 0;

	if (!atEnd) return false;


	// Check whether we're in inline math or a block eqn
	if (ctx.mode.inlineMath || ctx.mode.codeMath) {
		setCursor(view, end + 1);
	}
	else {
		// First, locate the $$ symbol
		const dollarLine = doc.lineAt(end+2);

		// If there's no line after the equation, create one

		if (dollarLine.number === doc.lines) {
			replaceRange(view, dollarLine.to, dollarLine.to, "\n");
		}

		// Finally, move outside the $$ symbol
		setCursor(view, dollarLine.to + 1);


		// Trim whitespace at beginning / end of equation
		const line = doc.lineAt(pos);
		replaceRange(view, line.from, line.to, line.text.trim());

	}

	return true;
}
const ctxTaboutParams=(view: EditorView, ctx: Context)=>{
	const result = ctx.getBounds();
	if (!result) return false;
	const { start, end } = result;
	
	const pos = view.state.selection.main.to;
	const doc = view.state.doc;
	const text = doc.toString();

	return {start,end,pos,doc,text};
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