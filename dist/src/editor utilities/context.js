import { Direction, escalateToToken, findMatchingBracket, getCharacterAtPos, getCloseBracket } from "src/editor utilities/editor_utils";
import { syntaxTree } from "@codemirror/language";
export class Context {
    state;
    mode;
    pos;
    ranges;
    codeblockLanguage;
    boundsCache;
    static fromState(state) {
        const ctx = new Context();
        const sel = state.selection;
        ctx.state = state;
        ctx.pos = sel.main.to;
        ctx.ranges = Array.from(sel.ranges).reverse();
        ctx.mode = new Mode();
        ctx.boundsCache = new Map();
        const codeblockLanguage = langIfWithinCodeblock(state);
        const inCode = codeblockLanguage !== null;
        const settings = { forceMathLanguages: 'Fake language' };
        const forceMath = codeblockLanguage ? settings.forceMathLanguages.contains(codeblockLanguage) : false;
        ctx.mode.codeMath = forceMath;
        ctx.mode.code = inCode && !forceMath;
        if (ctx.mode.code && codeblockLanguage)
            ctx.codeblockLanguage = codeblockLanguage;
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
    static fromView(view) {
        return Context.fromState(view.state);
    }
    isWithinEnvironment(pos, env) {
        if (!this.mode.inMath())
            return false;
        const bounds = this.getInnerBounds();
        if (!bounds)
            return false;
        const { start, end } = bounds;
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
        }
        else {
            offset = 0;
            openSearchSymbol = env.openSymbol;
        }
        let left = text.lastIndexOf(env.openSymbol, pos - 1);
        while (left != -1) {
            const right = findMatchingBracket(text, left + offset, openSearchSymbol, env.closeSymbol, false);
            if (right === -1)
                return false;
            // Check whether the cursor lies inside the environment symbols
            if ((right >= pos) && (pos >= left + env.openSymbol.length)) {
                return true;
            }
            if (left <= 0)
                return false;
            // Find the next open symbol
            left = text.lastIndexOf(env.openSymbol, left - 1);
        }
        return false;
    }
    inTextEnvironment() {
        return (this.isWithinEnvironment(this.pos, { openSymbol: "\\text{", closeSymbol: "}" }) ||
            this.isWithinEnvironment(this.pos, { openSymbol: "\\tag{", closeSymbol: "}" }) ||
            this.isWithinEnvironment(this.pos, { openSymbol: "\\begin{", closeSymbol: "}" }) ||
            this.isWithinEnvironment(this.pos, { openSymbol: "\\end{", closeSymbol: "}" }));
    }
    getBounds(pos = this.pos) {
        // yes, I also want the cache to work over the produced range instead of just that one through
        // a BTree or the like, but that'd be probably overkill
        if (this.boundsCache.has(pos)) {
            return this.boundsCache.get(pos) || null;
        }
        let bounds;
        if (this.mode.codeMath) {
            // means a codeblock language triggered the math mode -> use the codeblock bounds instead
            bounds = getCodeblockBounds(this.state, pos);
        }
        else {
            bounds = getEquationBounds(this.state);
        }
        if (bounds !== null)
            this.boundsCache.set(pos, bounds);
        return bounds;
    }
    // Accounts for equations within text environments, e.g. $$\text{... $...$}$$
    getInnerBounds(pos = this.pos) {
        let bounds;
        if (this.mode.codeMath) {
            // means a codeblock language triggered the math mode -> use the codeblock bounds instead
            bounds = getCodeblockBounds(this.state, pos);
        }
        else {
            bounds = getInnerEquationBounds(this.state);
        }
        return bounds;
    }
}
const isWithinEquation = (state) => {
    const pos = state.selection.main.to;
    const tree = syntaxTree(state);
    let syntaxNode = tree.resolveInner(pos, -1);
    if (syntaxNode.name.contains("math-end"))
        return false;
    if (!syntaxNode.parent) {
        syntaxNode = tree.resolveInner(pos, 1);
        if (syntaxNode.name.contains("math-begin"))
            return false;
    }
    // Account/allow for being on an empty line in a equation
    if (!syntaxNode.parent) {
        const left = tree.resolveInner(pos - 1, -1);
        const right = tree.resolveInner(pos + 1, 1);
        return (left.name.contains("math") && right.name.contains("math") && !(left.name.contains("math-end")));
    }
    return (syntaxNode.name.contains("math"));
};
const isWithinInlineEquation = (state) => {
    const pos = state.selection.main.to;
    const tree = syntaxTree(state);
    let syntaxNode = tree.resolveInner(pos, -1);
    if (syntaxNode.name.contains("math-end"))
        return false;
    if (!syntaxNode.parent) {
        syntaxNode = tree.resolveInner(pos, 1);
        if (syntaxNode.name.contains("math-begin"))
            return false;
    }
    // Account/allow for being on an empty line in a equation
    if (!syntaxNode.parent)
        syntaxNode = tree.resolveInner(pos - 1, -1);
    const cursor = syntaxNode.cursor();
    const res = escalateToToken(cursor, Direction.Backward, "math-begin");
    return !res?.name.contains("math-block");
};
/**
 * Figures out where this equation starts and where it ends.
 *
 * **Note:** If you intend to use this directly, check out Context.getBounds instead, which caches and also takes care of codeblock languages which should behave like math mode.
 */
export const getEquationBounds = (state, pos) => {
    if (!pos)
        pos = state.selection.main.to;
    const tree = syntaxTree(state);
    let syntaxNode = tree.resolveInner(pos, -1);
    if (!syntaxNode.parent) {
        syntaxNode = tree.resolveInner(pos, 1);
    }
    // Account/allow for being on an empty line in a equation
    if (!syntaxNode.parent)
        syntaxNode = tree.resolveInner(pos - 1, -1);
    const cursor = syntaxNode.cursor();
    const begin = escalateToToken(cursor, Direction.Backward, "math-begin");
    const end = escalateToToken(cursor, Direction.Forward, "math-end");
    if (begin && end) {
        return { start: begin.to, end: end.from };
    }
    else {
        return null;
    }
};
// Accounts for equations within text environments, e.g. $$\text{... $...$}$$
const getInnerEquationBounds = (state, pos) => {
    if (!pos)
        pos = state.selection.main.to;
    let text = state.doc.toString();
    // ignore \$
    text = text.replaceAll("\\$", "\\R");
    const left = text.lastIndexOf("$", pos - 1);
    const right = text.indexOf("$", pos);
    if (left === -1 || right === -1)
        return null;
    return { start: left + 1, end: right };
};
/**
 * Figures out where this codeblock starts and where it ends.
 *
 * **Note:** If you intend to use this directly, check out Context.getBounds instead, which caches and also takes care of codeblock languages which should behave like math mode.
 */
const getCodeblockBounds = (state, pos = state.selection.main.from) => {
    const tree = syntaxTree(state);
    let cursor = tree.cursorAt(pos, -1);
    const blockBegin = escalateToToken(cursor, Direction.Backward, "HyperMD-codeblock-begin");
    cursor = tree.cursorAt(pos, -1);
    const blockEnd = escalateToToken(cursor, Direction.Forward, "HyperMD-codeblock-end");
    return (blockBegin && blockEnd) ? { start: blockBegin.to + 1, end: blockEnd.from - 1 } : null;
};
const findFirstNonNewlineBefore = (state, pos) => {
    let currentPos = pos;
    while (currentPos >= 0) {
        const char = getCharacterAtPos(state, currentPos - 1);
        if (char !== "\n") {
            return currentPos;
        }
        currentPos--;
    }
    return 0;
};
const langIfWithinCodeblock = (state) => {
    const tree = syntaxTree(state);
    const pos = state.selection.ranges[0].from;
    const adjustedPos = pos === 0 ? 0 : findFirstNonNewlineBefore(state, pos);
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
};
export class Mode {
    text;
    inlineMath;
    blockMath;
    codeMath;
    code;
    textEnv;
    /**
     * Whether the state is inside an equation bounded by $ or $$ delimeters.
     */
    inEquation() {
        return this.inlineMath || this.blockMath;
    }
    /**
     * Whether the state is in any math mode.
     *
     * The equation may be bounded by $ or $$ delimeters, or it may be an equation inside a `math` codeblock.
     */
    inMath() {
        return this.inlineMath || this.blockMath || this.codeMath;
    }
    /**
     * Whether the state is strictly in math mode.
     *
     * Returns false when the state is within math, but inside a text environment, such as \text{}.
     */
    strictlyInMath() {
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
    static fromSource(source) {
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
            mode.textEnv)) {
            // for backwards compat we need to assume that this is a catchall mode then
            mode.invert();
            return mode;
        }
        return mode;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3IgdXRpbGl0aWVzL2NvbnRleHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEksT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBYWxELE1BQU0sT0FBTyxPQUFPO0lBQ25CLEtBQUssQ0FBYztJQUNuQixJQUFJLENBQVE7SUFDWixHQUFHLENBQVM7SUFDWixNQUFNLENBQW1CO0lBQ3pCLGlCQUFpQixDQUFTO0lBQzFCLFdBQVcsQ0FBc0I7SUFFakMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFrQjtRQUNsQyxNQUFNLEdBQUcsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzFCLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7UUFDNUIsR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbEIsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUN0QixHQUFHLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzlDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUN0QixHQUFHLENBQUMsV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFFNUIsTUFBTSxpQkFBaUIsR0FBRyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2RCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsS0FBSyxJQUFJLENBQUM7UUFFMUMsTUFBTSxRQUFRLEdBQUcsRUFBQyxrQkFBa0IsRUFBRSxlQUFlLEVBQUMs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UCxLQUFLLEdBQUc7b0JBQ1AsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7b0JBQ2pCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO29CQUNqQixNQUFNO1lBQ1IsQ0FBQztRQUNGLENBQUM7UUFHRCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSTtZQUNkLElBQUksQ0FBQyxVQUFVO1lBQ2YsSUFBSSxDQUFDLFNBQVM7WUFDZCxJQUFJLENBQUMsUUFBUTtZQUNiLElBQUksQ0FBQyxJQUFJO1lBQ1QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUNaLENBQUM7WUFDRiwyRUFBMkU7WUFDM0UsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2QsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFZGl0b3JTdGF0ZSwgU2VsZWN0aW9uUmFuZ2UgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcbmltcG9ydCB7IERpcmVjdGlvbiwgZXNjYWxhdGVUb1Rva2VuLCBmaW5kTWF0Y2hpbmdCcmFja2V0LCBnZXRDaGFyYWN0ZXJBdFBvcywgZ2V0Q2xvc2VCcmFja2V0IH0gZnJvbSBcInNyYy9lZGl0b3IgdXRpbGl0aWVzL2VkaXRvcl91dGlsc1wiO1xyXG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XHJcblxyXG5pbnRlcmZhY2UgRW52aXJvbm1lbnQge1xyXG5cdG9wZW5TeW1ib2w6IHN0cmluZztcclxuXHRjbG9zZVN5bWJvbDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEJvdW5kcyB7XHJcblx0c3RhcnQ6IG51bWJlcjtcclxuXHRlbmQ6IG51bWJlcjtcclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBDb250ZXh0IHtcclxuXHRzdGF0ZTogRWRpdG9yU3RhdGU7XHJcblx0bW9kZSE6IE1vZGU7XHJcblx0cG9zOiBudW1iZXI7XHJcblx0cmFuZ2VzOiBTZWxlY3Rpb25SYW5nZVtdO1xyXG5cdGNvZGVibG9ja0xhbmd1YWdlOiBzdHJpbmc7XHJcblx0Ym91bmRzQ2FjaGU6IE1hcDxudW1iZXIsIEJvdW5kcz47XHJcblxyXG5cdHN0YXRpYyBmcm9tU3RhdGUoc3RhdGU6IEVkaXRvclN0YXRlKTpDb250ZXh0IHtcclxuXHRcdGNvbnN0IGN0eCA9IG5ldyBDb250ZXh0KCk7XHJcblx0XHRjb25zdCBzZWwgPSBzdGF0ZS5zZWxlY3Rpb247XHJcblx0XHRjdHguc3RhdGUgPSBzdGF0ZTtcclxuXHRcdGN0eC5wb3MgPSBzZWwubWFpbi50bztcclxuXHRcdGN0eC5yYW5nZXMgPSBBcnJheS5mcm9tKHNlbC5yYW5nZXMpLnJldmVyc2UoKTtcclxuXHRcdGN0eC5tb2RlID0gbmV3IE1vZGUoKTtcclxuXHRcdGN0eC5ib3VuZHNDYWNoZSA9IG5ldyBNYXAoKTtcclxuXHJcblx0XHRjb25zdCBjb2RlYmxvY2tMYW5ndWFnZSA9IGxhbmdJZldpdGhpbkNvZGVibG9jayhzdGF0ZSk7XHJcblx0XHRjb25zdCBpbkNvZGUgPSBjb2RlYmxvY2tMYW5ndWFnZSAhPT0gbnVsbDtcclxuXHJcblx0XHRjb25zdCBzZXR0aW5ncyA9IHtmb3JjZU1hdGhMYW5ndWFnZXM6ICdGYWtlIGxhbmd1YWdlJ307XHJcblx0XHRjb25zdCBmb3JjZU1hdGggPSBjb2RlYmxvY2tMYW5ndWFnZT9zZXR0aW5ncy5mb3JjZU1hdGhMYW5ndWFnZXMuY29udGFpbnMoY29kZWJsb2NrTGFuZ3VhZ2UpOmZhbHNlO1xyXG5cdFx0Y3R4Lm1vZGUuY29kZU1hdGggPSBmb3JjZU1hdGg7XHJcblx0XHRjdHgubW9kZS5jb2RlID0gaW5Db2RlICYmICFmb3JjZU1hdGg7XHJcblx0XHRpZiAoY3R4Lm1vZGUuY29kZSYmY29kZWJsb2NrTGFuZ3VhZ2UpIGN0eC5jb2RlYmxvY2tMYW5ndWFnZSA9IGNvZGVibG9ja0xhbmd1YWdlO1xyXG5cclxuXHRcdC8vIGZpcnN0LCBjaGVjayBpZiBtYXRoIG1vZGUgc2hvdWxkIGJlIFwiZ2VuZXJhbGx5XCIgb25cclxuXHRcdGNvbnN0IGluTWF0aCA9IGZvcmNlTWF0aCB8fCBpc1dpdGhpbkVxdWF0aW9uKHN0YXRlKTtcclxuXHJcblx0XHRpZiAoaW5NYXRoICYmICFmb3JjZU1hdGgpIHtcclxuXHRcdFx0Y29uc3QgaW5JbmxpbmVFcXVhdGlvbiA9IGlzV2l0aGluSW5saW5lRXF1YXRpb24oc3RhdGUpO1xyXG5cclxuXHRcdFx0Y3R4Lm1vZGUuYmxvY2tNYXRoID0gIWluSW5saW5lRXF1YXRpb247XHJcblx0XHRcdGN0eC5tb2RlLmlubGluZU1hdGggPSBpbklubGluZUVxdWF0aW9uO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChpbk1hdGgpIHtcclxuXHRcdFx0Y3R4Lm1vZGUudGV4dEVudiA9IGN0eC5pblRleHRFbnZpcm9ubWVudCgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGN0eC5tb2RlLnRleHQgPSAhaW5Db2RlICYmICFpbk1hdGg7XHJcblxyXG5cdFx0cmV0dXJuIGN0eDtcclxuXHR9XHJcblxyXG5cdHN0YXRpYyBmcm9tVmlldyh2aWV3OiBFZGl0b3JWaWV3KTpDb250ZXh0IHtcclxuXHRcdHJldHVybiBDb250ZXh0LmZyb21TdGF0ZSh2aWV3LnN0YXRlKTtcclxuXHR9XHJcblxyXG5cdGlzV2l0aGluRW52aXJvbm1lbnQocG9zOiBudW1iZXIsIGVudjogRW52aXJvbm1lbnQpOiBib29sZWFuIHtcclxuXHRcdGlmICghdGhpcy5tb2RlLmluTWF0aCgpKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdFx0Y29uc3QgYm91bmRzID0gdGhpcy5nZXRJbm5lckJvdW5kcygpO1xyXG5cdFx0aWYgKCFib3VuZHMpIHJldHVybiBmYWxzZTtcclxuXHJcblx0XHRjb25zdCB7c3RhcnQsIGVuZH0gPSBib3VuZHM7XHJcblx0XHRjb25zdCB0ZXh0ID0gdGhpcy5zdGF0ZS5zbGljZURvYyhzdGFydCwgZW5kKTtcclxuXHRcdC8vIHBvcyByZWZlcnJlZCB0byB0aGUgYWJzb2x1dGUgcG9zaXRpb24gaW4gdGhlIHdob2xlIGRvY3VtZW50LCBidXQgd2UganVzdCBzbGljZWQgdGhlIHRleHRcclxuXHRcdC8vIHNvIG5vdyBwb3MgbXVzdCBiZSByZWxhdGl2ZSB0byB0aGUgc3RhcnQgaW4gb3JkZXIgdG8gYmUgYW55IHVzZWZ1bFxyXG5cdFx0cG9zIC09IHN0YXJ0O1xyXG5cclxuXHRcdGNvbnN0IG9wZW5CcmFja2V0ID0gZW52Lm9wZW5TeW1ib2wuc2xpY2UoLTEpO1xyXG5cdFx0Y29uc3QgY2xvc2VCcmFja2V0ID0gZ2V0Q2xvc2VCcmFja2V0KG9wZW5CcmFja2V0KTtcclxuXHJcblx0XHQvLyBUYWtlIGNhcmUgd2hlbiB0aGUgb3BlbiBzeW1ib2wgZW5kcyB3aXRoIGEgYnJhY2tldCB7LCBbLCBvciAoXHJcblx0XHQvLyBhcyB0aGVuIHRoZSBjbG9zaW5nIHN5bWJvbCwgfSwgXSBvciApLCBpcyBub3QgdW5pcXVlIHRvIHRoaXMgb3BlbiBzeW1ib2xcclxuXHRcdGxldCBvZmZzZXQ7XHJcblx0XHRsZXQgb3BlblNlYXJjaFN5bWJvbDtcclxuXHJcblx0XHRpZiAoW1wie1wiLCBcIltcIiwgXCIoXCJdLmNvbnRhaW5zKG9wZW5CcmFja2V0KSAmJiBlbnYuY2xvc2VTeW1ib2wgPT09IGNsb3NlQnJhY2tldCkge1xyXG5cdFx0XHRvZmZzZXQgPSBlbnYub3BlblN5bWJvbC5sZW5ndGggLSAxO1xyXG5cdFx0XHRvcGVuU2VhcmNoU3ltYm9sID0gb3BlbkJyYWNrZXQ7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRvZmZzZXQgPSAwO1xyXG5cdFx0XHRvcGVuU2VhcmNoU3ltYm9sID0gZW52Lm9wZW5TeW1ib2w7XHJcblx0XHR9XHJcblxyXG5cdFx0bGV0IGxlZnQgPSB0ZXh0Lmxhc3RJbmRleE9mKGVudi5vcGVuU3ltYm9sLCBwb3MgLSAxKTtcclxuXHJcblx0XHR3aGlsZSAobGVmdCAhPSAtMSkge1xyXG5cdFx0XHRjb25zdCByaWdodCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQodGV4dCwgbGVmdCArIG9mZnNldCwgb3BlblNlYXJjaFN5bWJvbCwgZW52LmNsb3NlU3ltYm9sLCBmYWxzZSk7XHJcblxyXG5cdFx0XHRpZiAocmlnaHQgPT09IC0xKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdFx0XHQvLyBDaGVjayB3aGV0aGVyIHRoZSBjdXJzb3IgbGllcyBpbnNpZGUgdGhlIGVudmlyb25tZW50IHN5bWJvbHNcclxuXHRcdFx0aWYgKChyaWdodCA+PSBwb3MpICYmIChwb3MgPj0gbGVmdCArIGVudi5vcGVuU3ltYm9sLmxlbmd0aCkpIHtcclxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYgKGxlZnQgPD0gMCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuXHRcdFx0Ly8gRmluZCB0aGUgbmV4dCBvcGVuIHN5bWJvbFxyXG5cdFx0XHRsZWZ0ID0gdGV4dC5sYXN0SW5kZXhPZihlbnYub3BlblN5bWJvbCwgbGVmdCAtIDEpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBmYWxzZTtcclxuXHR9XHJcblxyXG5cdGluVGV4dEVudmlyb25tZW50KCk6IGJvb2xlYW4ge1xyXG5cdFx0cmV0dXJuIChcclxuXHRcdFx0dGhpcy5pc1dpdGhpbkVudmlyb25tZW50KHRoaXMucG9zLCB7b3BlblN5bWJvbDogXCJcXFxcdGV4dHtcIiwgY2xvc2VTeW1ib2w6IFwifVwifSkgfHxcclxuXHRcdFx0dGhpcy5pc1dpdGhpbkVudmlyb25tZW50KHRoaXMucG9zLCB7b3BlblN5bWJvbDogXCJcXFxcdGFne1wiLCBjbG9zZVN5bWJvbDogXCJ9XCJ9KSB8fFxyXG5cdFx0XHR0aGlzLmlzV2l0aGluRW52aXJvbm1lbnQodGhpcy5wb3MsIHtvcGVuU3ltYm9sOiBcIlxcXFxiZWdpbntcIiwgY2xvc2VTeW1ib2w6IFwifVwifSkgfHxcclxuXHRcdFx0dGhpcy5pc1dpdGhpbkVudmlyb25tZW50KHRoaXMucG9zLCB7b3BlblN5bWJvbDogXCJcXFxcZW5ke1wiLCBjbG9zZVN5bWJvbDogXCJ9XCJ9KVxyXG5cdFx0KTtcclxuXHR9XHJcblxyXG5cdGdldEJvdW5kcyhwb3M6IG51bWJlciA9IHRoaXMucG9zKTogQm91bmRzfG51bGwge1xyXG5cdFx0Ly8geWVzLCBJIGFsc28gd2FudCB0aGUgY2FjaGUgdG8gd29yayBvdmVyIHRoZSBwcm9kdWNlZCByYW5nZSBpbnN0ZWFkIG9mIGp1c3QgdGhhdCBvbmUgdGhyb3VnaFxyXG5cdFx0Ly8gYSBCVHJlZSBvciB0aGUgbGlrZSwgYnV0IHRoYXQnZCBiZSBwcm9iYWJseSBvdmVya2lsbFxyXG5cdFx0aWYgKHRoaXMuYm91bmRzQ2FjaGUuaGFzKHBvcykpIHtcclxuXHRcdFx0cmV0dXJuIHRoaXMuYm91bmRzQ2FjaGUuZ2V0KHBvcyl8fG51bGw7XHJcblx0XHR9XHJcblxyXG5cdFx0bGV0IGJvdW5kcztcclxuXHRcdGlmICh0aGlzLm1vZGUuY29kZU1hdGgpIHtcclxuXHRcdFx0Ly8gbWVhbnMgYSBjb2RlYmxvY2sgbGFuZ3VhZ2UgdHJpZ2dlcmVkIHRoZSBtYXRoIG1vZGUgLT4gdXNlIHRoZSBjb2RlYmxvY2sgYm91bmRzIGluc3RlYWRcclxuXHRcdFx0Ym91bmRzID0gZ2V0Q29kZWJsb2NrQm91bmRzKHRoaXMuc3RhdGUsIHBvcyk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRib3VuZHMgPSBnZXRFcXVhdGlvbkJvdW5kcyh0aGlzLnN0YXRlKTtcclxuXHRcdH1cclxuXHRcdGlmKGJvdW5kcyE9PW51bGwpXHJcblx0XHRcdHRoaXMuYm91bmRzQ2FjaGUuc2V0KHBvcywgYm91bmRzKTtcclxuXHRcdHJldHVybiBib3VuZHM7XHJcblx0fVxyXG5cclxuXHQvLyBBY2NvdW50cyBmb3IgZXF1YXRpb25zIHdpdGhpbiB0ZXh0IGVudmlyb25tZW50cywgZS5nLiAkJFxcdGV4dHsuLi4gJC4uLiR9JCRcclxuXHRnZXRJbm5lckJvdW5kcyhwb3M6IG51bWJlciA9IHRoaXMucG9zKTogQm91bmRzfG51bGwge1xyXG5cdFx0bGV0IGJvdW5kcztcclxuXHRcdGlmICh0aGlzLm1vZGUuY29kZU1hdGgpIHtcclxuXHRcdFx0Ly8gbWVhbnMgYSBjb2RlYmxvY2sgbGFuZ3VhZ2UgdHJpZ2dlcmVkIHRoZSBtYXRoIG1vZGUgLT4gdXNlIHRoZSBjb2RlYmxvY2sgYm91bmRzIGluc3RlYWRcclxuXHRcdFx0Ym91bmRzID0gZ2V0Q29kZWJsb2NrQm91bmRzKHRoaXMuc3RhdGUsIHBvcyk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRib3VuZHMgPSBnZXRJbm5lckVxdWF0aW9uQm91bmRzKHRoaXMuc3RhdGUpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBib3VuZHM7XHJcblx0fVxyXG5cclxufVxyXG5cclxuY29uc3QgaXNXaXRoaW5FcXVhdGlvbiA9IChzdGF0ZTogRWRpdG9yU3RhdGUpOmJvb2xlYW4gPT4ge1xyXG5cdGNvbnN0IHBvcyA9IHN0YXRlLnNlbGVjdGlvbi5tYWluLnRvO1xyXG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcclxuXHJcblx0bGV0IHN5bnRheE5vZGUgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MsIC0xKTtcclxuXHRpZiAoc3ludGF4Tm9kZS5uYW1lLmNvbnRhaW5zKFwibWF0aC1lbmRcIikpIHJldHVybiBmYWxzZTtcclxuXHJcblx0aWYgKCFzeW50YXhOb2RlLnBhcmVudCkge1xyXG5cdFx0c3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcywgMSk7XHJcblx0XHRpZiAoc3ludGF4Tm9kZS5uYW1lLmNvbnRhaW5zKFwibWF0aC1iZWdpblwiKSkgcmV0dXJuIGZhbHNlO1xyXG5cdH1cclxuXHJcblx0Ly8gQWNjb3VudC9hbGxvdyBmb3IgYmVpbmcgb24gYW4gZW1wdHkgbGluZSBpbiBhIGVxdWF0aW9uXHJcblx0aWYgKCFzeW50YXhOb2RlLnBhcmVudCkge1xyXG5cdFx0Y29uc3QgbGVmdCA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcyAtIDEsIC0xKTtcclxuXHRcdGNvbnN0IHJpZ2h0ID0gdHJlZS5yZXNvbHZlSW5uZXIocG9zICsgMSwgMSk7XHJcblxyXG5cdFx0cmV0dXJuIChsZWZ0Lm5hbWUuY29udGFpbnMoXCJtYXRoXCIpICYmIHJpZ2h0Lm5hbWUuY29udGFpbnMoXCJtYXRoXCIpICYmICEobGVmdC5uYW1lLmNvbnRhaW5zKFwibWF0aC1lbmRcIikpKTtcclxuXHR9XHJcblxyXG5cdHJldHVybiAoc3ludGF4Tm9kZS5uYW1lLmNvbnRhaW5zKFwibWF0aFwiKSk7XHJcbn1cclxuXHJcbmNvbnN0IGlzV2l0aGluSW5saW5lRXF1YXRpb24gPSAoc3RhdGU6IEVkaXRvclN0YXRlKTpib29sZWFuID0+IHtcclxuXHRjb25zdCBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ubWFpbi50bztcclxuXHRjb25zdCB0cmVlID0gc3ludGF4VHJlZShzdGF0ZSk7XHJcblxyXG5cdGxldCBzeW50YXhOb2RlID0gdHJlZS5yZXNvbHZlSW5uZXIocG9zLCAtMSk7XHJcblx0aWYgKHN5bnRheE5vZGUubmFtZS5jb250YWlucyhcIm1hdGgtZW5kXCIpKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdGlmICghc3ludGF4Tm9kZS5wYXJlbnQpIHtcclxuXHRcdHN5bnRheE5vZGUgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MsIDEpO1xyXG5cdFx0aWYgKHN5bnRheE5vZGUubmFtZS5jb250YWlucyhcIm1hdGgtYmVnaW5cIikpIHJldHVybiBmYWxzZTtcclxuXHR9XHJcblxyXG5cdC8vIEFjY291bnQvYWxsb3cgZm9yIGJlaW5nIG9uIGFuIGVtcHR5IGxpbmUgaW4gYSBlcXVhdGlvblxyXG5cdGlmICghc3ludGF4Tm9kZS5wYXJlbnQpIHN5bnRheE5vZGUgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MgLSAxLCAtMSk7XHJcblxyXG5cdGNvbnN0IGN1cnNvciA9IHN5bnRheE5vZGUuY3Vyc29yKCk7XHJcblx0Y29uc3QgcmVzID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkJhY2t3YXJkLCBcIm1hdGgtYmVnaW5cIik7XHJcblxyXG5cdHJldHVybiAhcmVzPy5uYW1lLmNvbnRhaW5zKFwibWF0aC1ibG9ja1wiKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZpZ3VyZXMgb3V0IHdoZXJlIHRoaXMgZXF1YXRpb24gc3RhcnRzIGFuZCB3aGVyZSBpdCBlbmRzLlxyXG4gKlxyXG4gKiAqKk5vdGU6KiogSWYgeW91IGludGVuZCB0byB1c2UgdGhpcyBkaXJlY3RseSwgY2hlY2sgb3V0IENvbnRleHQuZ2V0Qm91bmRzIGluc3RlYWQsIHdoaWNoIGNhY2hlcyBhbmQgYWxzbyB0YWtlcyBjYXJlIG9mIGNvZGVibG9jayBsYW5ndWFnZXMgd2hpY2ggc2hvdWxkIGJlaGF2ZSBsaWtlIG1hdGggbW9kZS5cclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRFcXVhdGlvbkJvdW5kcyA9IChzdGF0ZTogRWRpdG9yU3RhdGUsIHBvcz86IG51bWJlcik6Qm91bmRzfG51bGwgPT4ge1xyXG5cdGlmICghcG9zKSBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ubWFpbi50bztcclxuXHRjb25zdCB0cmVlID0gc3ludGF4VHJlZShzdGF0ZSk7XHJcblxyXG5cdGxldCBzeW50YXhOb2RlID0gdHJlZS5yZXNvbHZlSW5uZXIocG9zLCAtMSk7XHJcblxyXG5cdGlmICghc3ludGF4Tm9kZS5wYXJlbnQpIHtcclxuXHRcdHN5bnRheE5vZGUgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MsIDEpO1xyXG5cdH1cclxuXHJcblx0Ly8gQWNjb3VudC9hbGxvdyBmb3IgYmVpbmcgb24gYW4gZW1wdHkgbGluZSBpbiBhIGVxdWF0aW9uXHJcblx0aWYgKCFzeW50YXhOb2RlLnBhcmVudCkgc3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcyAtIDEsIC0xKTtcclxuXHJcblx0Y29uc3QgY3Vyc29yID0gc3ludGF4Tm9kZS5jdXJzb3IoKTtcclxuXHRjb25zdCBiZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJtYXRoLWJlZ2luXCIpO1xyXG5cdGNvbnN0IGVuZCA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5Gb3J3YXJkLCBcIm1hdGgtZW5kXCIpO1xyXG5cclxuXHRpZiAoYmVnaW4gJiYgZW5kKSB7XHJcblx0XHRyZXR1cm4ge3N0YXJ0OiBiZWdpbi50bywgZW5kOiBlbmQuZnJvbX07XHJcblx0fVxyXG5cdGVsc2Uge1xyXG5cdFx0cmV0dXJuIG51bGw7XHJcblx0fVxyXG59XHJcblxyXG4vLyBBY2NvdW50cyBmb3IgZXF1YXRpb25zIHdpdGhpbiB0ZXh0IGVudmlyb25tZW50cywgZS5nLiAkJFxcdGV4dHsuLi4gJC4uLiR9JCRcclxuY29uc3QgZ2V0SW5uZXJFcXVhdGlvbkJvdW5kcyA9IChzdGF0ZTogRWRpdG9yU3RhdGUsIHBvcz86IG51bWJlcik6Qm91bmRzfG51bGwgPT4ge1xyXG5cdGlmICghcG9zKSBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ubWFpbi50bztcclxuXHRsZXQgdGV4dCA9IHN0YXRlLmRvYy50b1N0cmluZygpO1xyXG5cclxuXHQvLyBpZ25vcmUgXFwkXHJcblx0dGV4dCA9IHRleHQucmVwbGFjZUFsbChcIlxcXFwkXCIsIFwiXFxcXFJcIik7XHJcblxyXG5cdGNvbnN0IGxlZnQgPSB0ZXh0Lmxhc3RJbmRleE9mKFwiJFwiLCBwb3MtMSk7XHJcblx0Y29uc3QgcmlnaHQgPSB0ZXh0LmluZGV4T2YoXCIkXCIsIHBvcyk7XHJcblxyXG5cdGlmIChsZWZ0ID09PSAtMSB8fCByaWdodCA9PT0gLTEpIHJldHVybiBudWxsO1xyXG5cclxuXHRyZXR1cm4ge3N0YXJ0OiBsZWZ0ICsgMSwgZW5kOiByaWdodH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGaWd1cmVzIG91dCB3aGVyZSB0aGlzIGNvZGVibG9jayBzdGFydHMgYW5kIHdoZXJlIGl0IGVuZHMuXHJcbiAqXHJcbiAqICoqTm90ZToqKiBJZiB5b3UgaW50ZW5kIHRvIHVzZSB0aGlzIGRpcmVjdGx5LCBjaGVjayBvdXQgQ29udGV4dC5nZXRCb3VuZHMgaW5zdGVhZCwgd2hpY2ggY2FjaGVzIGFuZCBhbHNvIHRha2VzIGNhcmUgb2YgY29kZWJsb2NrIGxhbmd1YWdlcyB3aGljaCBzaG91bGQgYmVoYXZlIGxpa2UgbWF0aCBtb2RlLlxyXG4gKi9cclxuY29uc3QgZ2V0Q29kZWJsb2NrQm91bmRzID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSwgcG9zOiBudW1iZXIgPSBzdGF0ZS5zZWxlY3Rpb24ubWFpbi5mcm9tKTpCb3VuZHN8bnVsbCA9PiB7XHJcblx0Y29uc3QgdHJlZSA9IHN5bnRheFRyZWUoc3RhdGUpO1xyXG5cclxuXHRsZXQgY3Vyc29yID0gdHJlZS5jdXJzb3JBdChwb3MsIC0xKTtcclxuXHRjb25zdCBibG9ja0JlZ2luID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkJhY2t3YXJkLCBcIkh5cGVyTUQtY29kZWJsb2NrLWJlZ2luXCIpO1xyXG5cclxuXHRjdXJzb3IgPSB0cmVlLmN1cnNvckF0KHBvcywgLTEpO1xyXG5cdGNvbnN0IGJsb2NrRW5kID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkZvcndhcmQsIFwiSHlwZXJNRC1jb2RlYmxvY2stZW5kXCIpO1xyXG5cdHJldHVybiAoYmxvY2tCZWdpbiAmJiBibG9ja0VuZCkgPyB7IHN0YXJ0OiBibG9ja0JlZ2luLnRvICsgMSwgZW5kOiBibG9ja0VuZC5mcm9tIC0gMSB9IDogbnVsbDtcclxuXHJcbn1cclxuXHJcbmNvbnN0IGZpbmRGaXJzdE5vbk5ld2xpbmVCZWZvcmUgPSAoc3RhdGU6IEVkaXRvclN0YXRlLCBwb3M6IG51bWJlcik6IG51bWJlciA9PiB7XHJcbiAgICBsZXQgY3VycmVudFBvcyA9IHBvcztcclxuICAgIHdoaWxlIChjdXJyZW50UG9zID49IDApIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gZ2V0Q2hhcmFjdGVyQXRQb3Moc3RhdGUsIGN1cnJlbnRQb3MtMSk7XHJcbiAgICAgICAgaWYgKGNoYXIgIT09IFwiXFxuXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnRQb3M7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGN1cnJlbnRQb3MtLTtcclxuICAgIH1cclxuICAgIHJldHVybiAwO1xyXG59O1xyXG5cclxuY29uc3QgbGFuZ0lmV2l0aGluQ29kZWJsb2NrID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IHN0cmluZyB8IG51bGwgPT4ge1xyXG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcclxuXHJcblx0Y29uc3QgcG9zID0gc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xyXG5cclxuXHJcblx0Y29uc3QgYWRqdXN0ZWRQb3MgPXBvcyA9PT0gMCA/IDAgOiBmaW5kRmlyc3ROb25OZXdsaW5lQmVmb3JlKHN0YXRlLCBwb3MpO1xyXG5cdGNvbnN0IGN1cnNvciA9IHRyZWUuY3Vyc29yQXQoYWRqdXN0ZWRQb3MsIC0xKTtcclxuXHRcclxuXHRjb25zdCBpbkNvZGVibG9jayA9IGN1cnNvci5uYW1lLmNvbnRhaW5zKFwiY29kZWJsb2NrXCIpO1xyXG5cdGlmICghaW5Db2RlYmxvY2spIHtcclxuXHRcdHJldHVybiBudWxsO1xyXG5cdH1cclxuXHJcblx0Ly8gbG9jYXRlIHRoZSBzdGFydCBvZiB0aGUgYmxvY2tcclxuXHRjb25zdCBjb2RlYmxvY2tCZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJIeXBlck1ELWNvZGVibG9ja19IeXBlck1ELWNvZGVibG9jay1iZWdpblwiKTtcclxuXHJcblx0aWYgKGNvZGVibG9ja0JlZ2luID09IG51bGwpIHtcclxuXHRcdGNvbnNvbGUud2FybihcInVuYWJsZSB0byBsb2NhdGUgc3RhcnQgb2YgdGhlIGNvZGVibG9jayBldmVuIHRob3VnaCBpbnNpZGUgb25lXCIpO1xyXG5cdFx0cmV0dXJuIFwiXCI7XHJcblx0fVxyXG5cclxuXHQvLyBleHRyYWN0IHRoZSBsYW5ndWFnZVxyXG5cdC8vIGNvZGVibG9ja3MgbWF5IHN0YXJ0IGFuZCBlbmQgd2l0aCBhbiBhcmJpdHJhcnkgbnVtYmVyIG9mIGJhY2t0aWNrc1xyXG5cdGNvbnN0IGxhbmd1YWdlID0gc3RhdGUuc2xpY2VEb2MoY29kZWJsb2NrQmVnaW4uZnJvbSwgY29kZWJsb2NrQmVnaW4udG8pLnJlcGxhY2UoL2ArLywgXCJcIik7XHJcblxyXG5cdHJldHVybiBsYW5ndWFnZTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgTW9kZSB7XHJcblx0dGV4dDogYm9vbGVhbjtcclxuXHRpbmxpbmVNYXRoOiBib29sZWFuO1xyXG5cdGJsb2NrTWF0aDogYm9vbGVhbjtcclxuXHRjb2RlTWF0aDogYm9vbGVhbjtcclxuXHRjb2RlOiBib29sZWFuO1xyXG5cdHRleHRFbnY6IGJvb2xlYW47XHJcblxyXG5cdC8qKlxyXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIGluc2lkZSBhbiBlcXVhdGlvbiBib3VuZGVkIGJ5ICQgb3IgJCQgZGVsaW1ldGVycy5cclxuXHQgKi9cclxuXHRpbkVxdWF0aW9uKCk6Ym9vbGVhbiB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbmxpbmVNYXRoIHx8IHRoaXMuYmxvY2tNYXRoO1xyXG5cdH1cclxuXHJcblx0LyoqXHJcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgaW4gYW55IG1hdGggbW9kZS5cclxuXHQgKlxyXG5cdCAqIFRoZSBlcXVhdGlvbiBtYXkgYmUgYm91bmRlZCBieSAkIG9yICQkIGRlbGltZXRlcnMsIG9yIGl0IG1heSBiZSBhbiBlcXVhdGlvbiBpbnNpZGUgYSBgbWF0aGAgY29kZWJsb2NrLlxyXG5cdCAqL1xyXG5cdGluTWF0aCgpOmJvb2xlYW4ge1xyXG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lTWF0aCB8fCB0aGlzLmJsb2NrTWF0aCB8fCB0aGlzLmNvZGVNYXRoO1xyXG5cdH1cclxuXHJcblx0LyoqXHJcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgc3RyaWN0bHkgaW4gbWF0aCBtb2RlLlxyXG5cdCAqXHJcblx0ICogUmV0dXJucyBmYWxzZSB3aGVuIHRoZSBzdGF0ZSBpcyB3aXRoaW4gbWF0aCwgYnV0IGluc2lkZSBhIHRleHQgZW52aXJvbm1lbnQsIHN1Y2ggYXMgXFx0ZXh0e30uXHJcblx0ICovXHJcblx0c3RyaWN0bHlJbk1hdGgoKTpib29sZWFuIHtcclxuXHRcdHJldHVybiB0aGlzLmluTWF0aCgpICYmICF0aGlzLnRleHRFbnY7XHJcblx0fVxyXG5cclxuXHRjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHRoaXMudGV4dCA9IGZhbHNlO1xyXG5cdFx0dGhpcy5ibG9ja01hdGggPSBmYWxzZTtcclxuXHRcdHRoaXMuaW5saW5lTWF0aCA9IGZhbHNlO1xyXG5cdFx0dGhpcy5jb2RlID0gZmFsc2U7XHJcblx0XHR0aGlzLnRleHRFbnYgPSBmYWxzZTtcclxuXHR9XHJcblxyXG5cdGludmVydCgpIHtcclxuXHRcdHRoaXMudGV4dCA9ICF0aGlzLnRleHQ7XHJcblx0XHR0aGlzLmJsb2NrTWF0aCA9ICF0aGlzLmJsb2NrTWF0aDtcclxuXHRcdHRoaXMuaW5saW5lTWF0aCA9ICF0aGlzLmlubGluZU1hdGg7XHJcblx0XHR0aGlzLmNvZGVNYXRoID0gIXRoaXMuY29kZU1hdGg7XHJcblx0XHR0aGlzLmNvZGUgPSAhdGhpcy5jb2RlO1xyXG5cdFx0dGhpcy50ZXh0RW52ID0gIXRoaXMudGV4dEVudjtcclxuXHR9XHJcblxyXG5cdHN0YXRpYyBmcm9tU291cmNlKHNvdXJjZTogc3RyaW5nKTogTW9kZSB7XHJcblx0XHRjb25zdCBtb2RlID0gbmV3IE1vZGUoKTtcclxuXHJcblx0XHRmb3IgKGNvbnN0IGZsYWdfY2hhciBvZiBzb3VyY2UpIHtcclxuXHRcdFx0c3dpdGNoIChmbGFnX2NoYXIpIHtcclxuXHRcdFx0XHRjYXNlIFwibVwiOlxyXG5cdFx0XHRcdFx0bW9kZS5ibG9ja01hdGggPSB0cnVlO1xyXG5cdFx0XHRcdFx0bW9kZS5pbmxpbmVNYXRoID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJuXCI6XHJcblx0XHRcdFx0XHRtb2RlLmlubGluZU1hdGggPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0Y2FzZSBcIk1cIjpcclxuXHRcdFx0XHRcdG1vZGUuYmxvY2tNYXRoID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJ0XCI6XHJcblx0XHRcdFx0XHRtb2RlLnRleHQgPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0Y2FzZSBcImNcIjpcclxuXHRcdFx0XHRcdG1vZGUuY29kZSA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHJcblx0XHRpZiAoIShtb2RlLnRleHQgfHxcclxuXHRcdFx0bW9kZS5pbmxpbmVNYXRoIHx8XHJcblx0XHRcdG1vZGUuYmxvY2tNYXRoIHx8XHJcblx0XHRcdG1vZGUuY29kZU1hdGggfHxcclxuXHRcdFx0bW9kZS5jb2RlIHx8XHJcblx0XHRcdG1vZGUudGV4dEVudilcclxuXHRcdCkge1xyXG5cdFx0XHQvLyBmb3IgYmFja3dhcmRzIGNvbXBhdCB3ZSBuZWVkIHRvIGFzc3VtZSB0aGF0IHRoaXMgaXMgYSBjYXRjaGFsbCBtb2RlIHRoZW5cclxuXHRcdFx0bW9kZS5pbnZlcnQoKTtcclxuXHRcdFx0cmV0dXJuIG1vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIG1vZGU7XHJcblx0fVxyXG59Il19