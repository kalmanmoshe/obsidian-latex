import { EditorState, SelectionRange } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Direction, escalateToToken, findMatchingBracket, getCharacterAtPos, getCloseBracket } from "src/editor utilities/editor_utils";
import { syntaxTree } from "@codemirror/language";

interface Environment {
	openSymbol: string;
	closeSymbol: string;
}

export interface Bounds {
	start: number;
	end: number;
}


export class Context {
	state: EditorState;
	mode!: Mode;
	pos: number;
	ranges: SelectionRange[];
	codeblockLanguage: string;
	boundsCache: Map<number, Bounds>;

	static fromState(state: EditorState):Context {
		const ctx = new Context();
		const sel = state.selection;
		ctx.state = state;
		ctx.pos = sel.main.to;
		ctx.ranges = Array.from(sel.ranges).reverse();
		ctx.mode = new Mode();
		ctx.boundsCache = new Map();

		const codeblockLanguage = langIfWithinCodeblock(state);
		const inCode = codeblockLanguage !== null;

		const settings = {forceMathLanguages: 'Fake language'};
		const forceMath = codeblockLanguage?settings.forceMathLanguages.contains(codeblockLanguage):false;
		ctx.mode.codeMath = forceMath;
		ctx.mode.code = inCode && !forceMath;
		if (ctx.mode.code&&codeblockLanguage) ctx.codeblockLanguage = codeblockLanguage;

		// first, check if math mode should be "generally" on
		const inMath = forceMath || isWithinEquation(state);

		if (inMath && !forceMath) {
			const inInlineEquation = isWithinInlineEquation(state);

			ctx.mode.blockMath = !inInlineEquation;
			ctx.mode.inlineMath = inInlineEquation;
		}

		if (inMath) {
			ctx.mode.textEnv = ctx.inTextEnvironment();
		}

		ctx.mode.text = !inCode && !inMath;

		return ctx;
	}

	static fromView(view: EditorView):Context {
		return Context.fromState(view.state);
	}

	isWithinEnvironment(pos: number, env: Environment): boolean {
		if (!this.mode.inMath()) return false;

		const bounds = this.getInnerBounds();
		if (!bounds) return false;

		const {start, end} = bounds;
		const text = this.state.sliceDoc(start, end);
		// pos referred to the absolute position in the whole document, but we just sliced the text
		// so now pos must be relative to the start in order to be any useful
		pos -= start;

		const openBracket = env.openSymbol.slice(-1);
		const closeBracket = getCloseBracket(openBracket);

		// Take care when the open symbol ends with a bracket {, [, or (
		// as then the closing symbol, }, ] or ), is not unique to this open symbol
		let offset;
		let openSearchSymbol;

		if (["{", "[", "("].contains(openBracket) && env.closeSymbol === closeBracket) {
			offset = env.openSymbol.length - 1;
			openSearchSymbol = openBracket;
		} else {
			offset = 0;
			openSearchSymbol = env.openSymbol;
		}

		let left = text.lastIndexOf(env.openSymbol, pos - 1);

		while (left != -1) {
			const right = findMatchingBracket(text, left + offset, openSearchSymbol, env.closeSymbol, false);

			if (right === -1) return false;

			// Check whether the cursor lies inside the environment symbols
			if ((right >= pos) && (pos >= left + env.openSymbol.length)) {
				return true;
			}

			if (left <= 0) return false;

			// Find the next open symbol
			left = text.lastIndexOf(env.openSymbol, left - 1);
		}

		return false;
	}

	inTextEnvironment(): boolean {
		return (
			this.isWithinEnvironment(this.pos, {openSymbol: "\\text{", closeSymbol: "}"}) ||
			this.isWithinEnvironment(this.pos, {openSymbol: "\\tag{", closeSymbol: "}"}) ||
			this.isWithinEnvironment(this.pos, {openSymbol: "\\begin{", closeSymbol: "}"}) ||
			this.isWithinEnvironment(this.pos, {openSymbol: "\\end{", closeSymbol: "}"})
		);
	}

	getBounds(pos: number = this.pos): Bounds|null {
		// yes, I also want the cache to work over the produced range instead of just that one through
		// a BTree or the like, but that'd be probably overkill
		if (this.boundsCache.has(pos)) {
			return this.boundsCache.get(pos)||null;
		}

		let bounds;
		if (this.mode.codeMath) {
			// means a codeblock language triggered the math mode -> use the codeblock bounds instead
			bounds = getCodeblockBounds(this.state, pos);
		} else {
			bounds = getEquationBounds(this.state);
		}
		if(bounds!==null)
			this.boundsCache.set(pos, bounds);
		return bounds;
	}

	// Accounts for equations within text environments, e.g. $$\text{... $...$}$$
	getInnerBounds(pos: number = this.pos): Bounds|null {
		let bounds;
		if (this.mode.codeMath) {
			// means a codeblock language triggered the math mode -> use the codeblock bounds instead
			bounds = getCodeblockBounds(this.state, pos);
		} else {
			bounds = getInnerEquationBounds(this.state);
		}

		return bounds;
	}

}

const isWithinEquation = (state: EditorState):boolean => {
	const pos = state.selection.main.to;
	const tree = syntaxTree(state);

	let syntaxNode = tree.resolveInner(pos, -1);
	if (syntaxNode.name.contains("math-end")) return false;

	if (!syntaxNode.parent) {
		syntaxNode = tree.resolveInner(pos, 1);
		if (syntaxNode.name.contains("math-begin")) return false;
	}

	// Account/allow for being on an empty line in a equation
	if (!syntaxNode.parent) {
		const left = tree.resolveInner(pos - 1, -1);
		const right = tree.resolveInner(pos + 1, 1);

		return (left.name.contains("math") && right.name.contains("math") && !(left.name.contains("math-end")));
	}

	return (syntaxNode.name.contains("math"));
}

const isWithinInlineEquation = (state: EditorState):boolean => {
	const pos = state.selection.main.to;
	const tree = syntaxTree(state);

	let syntaxNode = tree.resolveInner(pos, -1);
	if (syntaxNode.name.contains("math-end")) return false;

	if (!syntaxNode.parent) {
		syntaxNode = tree.resolveInner(pos, 1);
		if (syntaxNode.name.contains("math-begin")) return false;
	}

	// Account/allow for being on an empty line in a equation
	if (!syntaxNode.parent) syntaxNode = tree.resolveInner(pos - 1, -1);

	const cursor = syntaxNode.cursor();
	const res = escalateToToken(cursor, Direction.Backward, "math-begin");

	return !res?.name.contains("math-block");
}

/**
 * Figures out where this equation starts and where it ends.
 *
 * **Note:** If you intend to use this directly, check out Context.getBounds instead, which caches and also takes care of codeblock languages which should behave like math mode.
 */
export const getEquationBounds = (state: EditorState, pos?: number):Bounds|null => {
	if (!pos) pos = state.selection.main.to;
	const tree = syntaxTree(state);

	let syntaxNode = tree.resolveInner(pos, -1);

	if (!syntaxNode.parent) {
		syntaxNode = tree.resolveInner(pos, 1);
	}

	// Account/allow for being on an empty line in a equation
	if (!syntaxNode.parent) syntaxNode = tree.resolveInner(pos - 1, -1);

	const cursor = syntaxNode.cursor();
	const begin = escalateToToken(cursor, Direction.Backward, "math-begin");
	const end = escalateToToken(cursor, Direction.Forward, "math-end");

	if (begin && end) {
		return {start: begin.to, end: end.from};
	}
	else {
		return null;
	}
}

// Accounts for equations within text environments, e.g. $$\text{... $...$}$$
const getInnerEquationBounds = (state: EditorState, pos?: number):Bounds|null => {
	if (!pos) pos = state.selection.main.to;
	let text = state.doc.toString();

	// ignore \$
	text = text.replaceAll("\\$", "\\R");

	const left = text.lastIndexOf("$", pos-1);
	const right = text.indexOf("$", pos);

	if (left === -1 || right === -1) return null;

	return {start: left + 1, end: right};
}

/**
 * Figures out where this codeblock starts and where it ends.
 *
 * **Note:** If you intend to use this directly, check out Context.getBounds instead, which caches and also takes care of codeblock languages which should behave like math mode.
 */
const getCodeblockBounds = (state: EditorState, pos: number = state.selection.main.from):Bounds|null => {
	const tree = syntaxTree(state);

	let cursor = tree.cursorAt(pos, -1);
	const blockBegin = escalateToToken(cursor, Direction.Backward, "HyperMD-codeblock-begin");

	cursor = tree.cursorAt(pos, -1);
	const blockEnd = escalateToToken(cursor, Direction.Forward, "HyperMD-codeblock-end");
	return (blockBegin && blockEnd) ? { start: blockBegin.to + 1, end: blockEnd.from - 1 } : null;

}

const findFirstNonNewlineBefore = (state: EditorState, pos: number): number => {
    let currentPos = pos;
    while (currentPos >= 0) {
        const char = getCharacterAtPos(state, currentPos-1);
        if (char !== "\n") {
            return currentPos;
        }
        currentPos--;
    }
    return 0;
};

const langIfWithinCodeblock = (state: EditorState): string | null => {
	const tree = syntaxTree(state);

	const pos = state.selection.ranges[0].from;


	const adjustedPos =pos === 0 ? 0 : findFirstNonNewlineBefore(state, pos);
	const cursor = tree.cursorAt(adjustedPos, -1);
	
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






export class Mode {
	text: boolean;
	inlineMath: boolean;
	blockMath: boolean;
	codeMath: boolean;
	code: boolean;
	textEnv: boolean;

	/**
	 * Whether the state is inside an equation bounded by $ or $$ delimeters.
	 */
	inEquation():boolean {
		return this.inlineMath || this.blockMath;
	}

	/**
	 * Whether the state is in any math mode.
	 *
	 * The equation may be bounded by $ or $$ delimeters, or it may be an equation inside a `math` codeblock.
	 */
	inMath():boolean {
		return this.inlineMath || this.blockMath || this.codeMath;
	}

	/**
	 * Whether the state is strictly in math mode.
	 *
	 * Returns false when the state is within math, but inside a text environment, such as \text{}.
	 */
	strictlyInMath():boolean {
		return this.inMath() && !this.textEnv;
	}

	constructor() {
		this.text = false;
		this.blockMath = false;
		this.inlineMath = false;
		this.code = false;
		this.textEnv = false;
	}

	invert() {
		this.text = !this.text;
		this.blockMath = !this.blockMath;
		this.inlineMath = !this.inlineMath;
		this.codeMath = !this.codeMath;
		this.code = !this.code;
		this.textEnv = !this.textEnv;
	}

	static fromSource(source: string): Mode {
		const mode = new Mode();

		for (const flag_char of source) {
			switch (flag_char) {
				case "m":
					mode.blockMath = true;
					mode.inlineMath = true;
					break;
				case "n":
					mode.inlineMath = true;
					break;
				case "M":
					mode.blockMath = true;
					break;
				case "t":
					mode.text = true;
					break;
				case "c":
					mode.code = true;
					break;
			}
		}


		if (!(mode.text ||
			mode.inlineMath ||
			mode.blockMath ||
			mode.codeMath ||
			mode.code ||
			mode.textEnv)
		) {
			// for backwards compat we need to assume that this is a catchall mode then
			mode.invert();
			return mode;
		}

		return mode;
	}
}