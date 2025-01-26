import { EditorView } from "@codemirror/view";
import { replaceRange, setCursor, getCharacterAtPos, Direction } from "src/utils/editor_utils";
import { Context } from "src/utils/context";
import { start } from "repl";


export const tabout = (view: EditorView, ctx: Context,dir: Direction):boolean => {
	console.log("tabout",ctx,dir);
	if(ctx.mode.inMath()) return taboutMathjax(view,ctx,dir);
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
}/*
const htmlTags:Array<{start: tagConstruction,end?: string}> = [
	{start: {open: '<div',close: '>'}, end: '</div>'},
	{start: {open: '<p',close: '>'}, end: '</p>'},
	{start: {open: '<span',close: '>'}, end:  '</span>'},
	{start: {open: '<a',close: '>'}, end: '</a>'},
	{start: {open: '<h1',close: '>'}, end: '</h1>'},
	{start: {open: '<h2',close: '>'}, end: '</h2>'},
	{start: {open: '<h3',close: '>'}, end: },
	{start: {open: '<h4',close: '>'}, end: },
	{start: {open: '<h5',close: '>'}, end: },
	{start: {open: '<h6',close: '>'}, end: },
	{start: {open: '<header',close: '>'}, end: },
	{start: {open: '<footer',close: '>'}, end: },
	{start: {open: '<main',close: '>'}, end: },
	{start: {open: '<section',close: '>'}, end: },
	{start: {open: '<article',close: '>'}, end:	},
	{start: {open: '<aside',close: '>'}, end:},
	{start: {open: '<nav',close: '>'}, end: },
	{start: {open: '<figure',close: '>'}, end: },
	{start: {open: '<figcaption',close: '>'}, end: },
	{start: {open: '<blockquote',close: '>'}, end: },
	{start: {open: '<cite',close: '>'}, end: },
	{start: {open: '<code',close: '>'}, end: },
	{start: {open: '<em',close: '>'}, end: },
	{start: {open: '<strong',close: '>'}, end: },
	{start: {open: '<small',close: '>'}, end: },
	{start: {open: '<sub',close: '>'}, end: },
	{start: {open: '<sup',close: '>'}, end: {open: '</sup',close: '>'}},
	{start: {open: '<ins',close: '>'}, end: {open: '</ins',close: '>'}},
	{start: {open: '<del',close: '>'}, end: {open: '</del',close: '>'}},
	{start: {open: '<mark',close: '>'}, end: {open: '</mark',close: '>'}},
]*/
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