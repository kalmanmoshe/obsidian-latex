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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3IgdXRpbGl0aWVzL2NvbnRleHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEksT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBYWxELE1BQU0sT0FBTyxPQUFPO0lBQ25CLEtBQUssQ0FBYztJQUNuQixJQUFJLENBQVE7SUFDWixHQUFHLENBQVM7SUFDWixNQUFNLENBQW1CO0lBQ3pCLGlCQUFpQixDQUFTO0lBQzFCLFdBQVcsQ0FBc0I7SUFFakMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFrQjtRQUNsQyxNQUFNLEdBQUcsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzFCLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7UUFDNUIsR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbEIsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUN0QixHQUFHLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzlDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUN0QixHQUFHLENBQUMsV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFFNUIsTUFBTSxpQkFBaUIsR0FBRyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2RCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsS0FBSyxJQUFJLENBQUM7UUFFMUMsTUFBTSxRQUFRLEdBQUcsRUFBQyxrQkFBa0IsRUFBRSxlQUFlLEVBQUMs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UCxLQUFLLEdBQUc7b0JBQ1AsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7b0JBQ2pCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO29CQUNqQixNQUFNO1lBQ1IsQ0FBQztRQUNGLENBQUM7UUFHRCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSTtZQUNkLElBQUksQ0FBQyxVQUFVO1lBQ2YsSUFBSSxDQUFDLFNBQVM7WUFDZCxJQUFJLENBQUMsUUFBUTtZQUNiLElBQUksQ0FBQyxJQUFJO1lBQ1QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUNaLENBQUM7WUFDRiwyRUFBMkU7WUFDM0UsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2QsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFZGl0b3JTdGF0ZSwgU2VsZWN0aW9uUmFuZ2UgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgRGlyZWN0aW9uLCBlc2NhbGF0ZVRvVG9rZW4sIGZpbmRNYXRjaGluZ0JyYWNrZXQsIGdldENoYXJhY3RlckF0UG9zLCBnZXRDbG9zZUJyYWNrZXQgfSBmcm9tIFwic3JjL2VkaXRvciB1dGlsaXRpZXMvZWRpdG9yX3V0aWxzXCI7XG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XG5cbmludGVyZmFjZSBFbnZpcm9ubWVudCB7XG5cdG9wZW5TeW1ib2w6IHN0cmluZztcblx0Y2xvc2VTeW1ib2w6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCb3VuZHMge1xuXHRzdGFydDogbnVtYmVyO1xuXHRlbmQ6IG51bWJlcjtcbn1cblxuXG5leHBvcnQgY2xhc3MgQ29udGV4dCB7XG5cdHN0YXRlOiBFZGl0b3JTdGF0ZTtcblx0bW9kZSE6IE1vZGU7XG5cdHBvczogbnVtYmVyO1xuXHRyYW5nZXM6IFNlbGVjdGlvblJhbmdlW107XG5cdGNvZGVibG9ja0xhbmd1YWdlOiBzdHJpbmc7XG5cdGJvdW5kc0NhY2hlOiBNYXA8bnVtYmVyLCBCb3VuZHM+O1xuXG5cdHN0YXRpYyBmcm9tU3RhdGUoc3RhdGU6IEVkaXRvclN0YXRlKTpDb250ZXh0IHtcblx0XHRjb25zdCBjdHggPSBuZXcgQ29udGV4dCgpO1xuXHRcdGNvbnN0IHNlbCA9IHN0YXRlLnNlbGVjdGlvbjtcblx0XHRjdHguc3RhdGUgPSBzdGF0ZTtcblx0XHRjdHgucG9zID0gc2VsLm1haW4udG87XG5cdFx0Y3R4LnJhbmdlcyA9IEFycmF5LmZyb20oc2VsLnJhbmdlcykucmV2ZXJzZSgpO1xuXHRcdGN0eC5tb2RlID0gbmV3IE1vZGUoKTtcblx0XHRjdHguYm91bmRzQ2FjaGUgPSBuZXcgTWFwKCk7XG5cblx0XHRjb25zdCBjb2RlYmxvY2tMYW5ndWFnZSA9IGxhbmdJZldpdGhpbkNvZGVibG9jayhzdGF0ZSk7XG5cdFx0Y29uc3QgaW5Db2RlID0gY29kZWJsb2NrTGFuZ3VhZ2UgIT09IG51bGw7XG5cblx0XHRjb25zdCBzZXR0aW5ncyA9IHtmb3JjZU1hdGhMYW5ndWFnZXM6ICdGYWtlIGxhbmd1YWdlJ307XG5cdFx0Y29uc3QgZm9yY2VNYXRoID0gY29kZWJsb2NrTGFuZ3VhZ2U/c2V0dGluZ3MuZm9yY2VNYXRoTGFuZ3VhZ2VzLmNvbnRhaW5zKGNvZGVibG9ja0xhbmd1YWdlKTpmYWxzZTtcblx0XHRjdHgubW9kZS5jb2RlTWF0aCA9IGZvcmNlTWF0aDtcblx0XHRjdHgubW9kZS5jb2RlID0gaW5Db2RlICYmICFmb3JjZU1hdGg7XG5cdFx0aWYgKGN0eC5tb2RlLmNvZGUmJmNvZGVibG9ja0xhbmd1YWdlKSBjdHguY29kZWJsb2NrTGFuZ3VhZ2UgPSBjb2RlYmxvY2tMYW5ndWFnZTtcblxuXHRcdC8vIGZpcnN0LCBjaGVjayBpZiBtYXRoIG1vZGUgc2hvdWxkIGJlIFwiZ2VuZXJhbGx5XCIgb25cblx0XHRjb25zdCBpbk1hdGggPSBmb3JjZU1hdGggfHwgaXNXaXRoaW5FcXVhdGlvbihzdGF0ZSk7XG5cblx0XHRpZiAoaW5NYXRoICYmICFmb3JjZU1hdGgpIHtcblx0XHRcdGNvbnN0IGluSW5saW5lRXF1YXRpb24gPSBpc1dpdGhpbklubGluZUVxdWF0aW9uKHN0YXRlKTtcblxuXHRcdFx0Y3R4Lm1vZGUuYmxvY2tNYXRoID0gIWluSW5saW5lRXF1YXRpb247XG5cdFx0XHRjdHgubW9kZS5pbmxpbmVNYXRoID0gaW5JbmxpbmVFcXVhdGlvbjtcblx0XHR9XG5cblx0XHRpZiAoaW5NYXRoKSB7XG5cdFx0XHRjdHgubW9kZS50ZXh0RW52ID0gY3R4LmluVGV4dEVudmlyb25tZW50KCk7XG5cdFx0fVxuXG5cdFx0Y3R4Lm1vZGUudGV4dCA9ICFpbkNvZGUgJiYgIWluTWF0aDtcblxuXHRcdHJldHVybiBjdHg7XG5cdH1cblxuXHRzdGF0aWMgZnJvbVZpZXcodmlldzogRWRpdG9yVmlldyk6Q29udGV4dCB7XG5cdFx0cmV0dXJuIENvbnRleHQuZnJvbVN0YXRlKHZpZXcuc3RhdGUpO1xuXHR9XG5cblx0aXNXaXRoaW5FbnZpcm9ubWVudChwb3M6IG51bWJlciwgZW52OiBFbnZpcm9ubWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5tb2RlLmluTWF0aCgpKSByZXR1cm4gZmFsc2U7XG5cblx0XHRjb25zdCBib3VuZHMgPSB0aGlzLmdldElubmVyQm91bmRzKCk7XG5cdFx0aWYgKCFib3VuZHMpIHJldHVybiBmYWxzZTtcblxuXHRcdGNvbnN0IHtzdGFydCwgZW5kfSA9IGJvdW5kcztcblx0XHRjb25zdCB0ZXh0ID0gdGhpcy5zdGF0ZS5zbGljZURvYyhzdGFydCwgZW5kKTtcblx0XHQvLyBwb3MgcmVmZXJyZWQgdG8gdGhlIGFic29sdXRlIHBvc2l0aW9uIGluIHRoZSB3aG9sZSBkb2N1bWVudCwgYnV0IHdlIGp1c3Qgc2xpY2VkIHRoZSB0ZXh0XG5cdFx0Ly8gc28gbm93IHBvcyBtdXN0IGJlIHJlbGF0aXZlIHRvIHRoZSBzdGFydCBpbiBvcmRlciB0byBiZSBhbnkgdXNlZnVsXG5cdFx0cG9zIC09IHN0YXJ0O1xuXG5cdFx0Y29uc3Qgb3BlbkJyYWNrZXQgPSBlbnYub3BlblN5bWJvbC5zbGljZSgtMSk7XG5cdFx0Y29uc3QgY2xvc2VCcmFja2V0ID0gZ2V0Q2xvc2VCcmFja2V0KG9wZW5CcmFja2V0KTtcblxuXHRcdC8vIFRha2UgY2FyZSB3aGVuIHRoZSBvcGVuIHN5bWJvbCBlbmRzIHdpdGggYSBicmFja2V0IHssIFssIG9yIChcblx0XHQvLyBhcyB0aGVuIHRoZSBjbG9zaW5nIHN5bWJvbCwgfSwgXSBvciApLCBpcyBub3QgdW5pcXVlIHRvIHRoaXMgb3BlbiBzeW1ib2xcblx0XHRsZXQgb2Zmc2V0O1xuXHRcdGxldCBvcGVuU2VhcmNoU3ltYm9sO1xuXG5cdFx0aWYgKFtcIntcIiwgXCJbXCIsIFwiKFwiXS5jb250YWlucyhvcGVuQnJhY2tldCkgJiYgZW52LmNsb3NlU3ltYm9sID09PSBjbG9zZUJyYWNrZXQpIHtcblx0XHRcdG9mZnNldCA9IGVudi5vcGVuU3ltYm9sLmxlbmd0aCAtIDE7XG5cdFx0XHRvcGVuU2VhcmNoU3ltYm9sID0gb3BlbkJyYWNrZXQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9mZnNldCA9IDA7XG5cdFx0XHRvcGVuU2VhcmNoU3ltYm9sID0gZW52Lm9wZW5TeW1ib2w7XG5cdFx0fVxuXG5cdFx0bGV0IGxlZnQgPSB0ZXh0Lmxhc3RJbmRleE9mKGVudi5vcGVuU3ltYm9sLCBwb3MgLSAxKTtcblxuXHRcdHdoaWxlIChsZWZ0ICE9IC0xKSB7XG5cdFx0XHRjb25zdCByaWdodCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQodGV4dCwgbGVmdCArIG9mZnNldCwgb3BlblNlYXJjaFN5bWJvbCwgZW52LmNsb3NlU3ltYm9sLCBmYWxzZSk7XG5cblx0XHRcdGlmIChyaWdodCA9PT0gLTEpIHJldHVybiBmYWxzZTtcblxuXHRcdFx0Ly8gQ2hlY2sgd2hldGhlciB0aGUgY3Vyc29yIGxpZXMgaW5zaWRlIHRoZSBlbnZpcm9ubWVudCBzeW1ib2xzXG5cdFx0XHRpZiAoKHJpZ2h0ID49IHBvcykgJiYgKHBvcyA+PSBsZWZ0ICsgZW52Lm9wZW5TeW1ib2wubGVuZ3RoKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGxlZnQgPD0gMCkgcmV0dXJuIGZhbHNlO1xuXG5cdFx0XHQvLyBGaW5kIHRoZSBuZXh0IG9wZW4gc3ltYm9sXG5cdFx0XHRsZWZ0ID0gdGV4dC5sYXN0SW5kZXhPZihlbnYub3BlblN5bWJvbCwgbGVmdCAtIDEpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGluVGV4dEVudmlyb25tZW50KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLmlzV2l0aGluRW52aXJvbm1lbnQodGhpcy5wb3MsIHtvcGVuU3ltYm9sOiBcIlxcXFx0ZXh0e1wiLCBjbG9zZVN5bWJvbDogXCJ9XCJ9KSB8fFxuXHRcdFx0dGhpcy5pc1dpdGhpbkVudmlyb25tZW50KHRoaXMucG9zLCB7b3BlblN5bWJvbDogXCJcXFxcdGFne1wiLCBjbG9zZVN5bWJvbDogXCJ9XCJ9KSB8fFxuXHRcdFx0dGhpcy5pc1dpdGhpbkVudmlyb25tZW50KHRoaXMucG9zLCB7b3BlblN5bWJvbDogXCJcXFxcYmVnaW57XCIsIGNsb3NlU3ltYm9sOiBcIn1cIn0pIHx8XG5cdFx0XHR0aGlzLmlzV2l0aGluRW52aXJvbm1lbnQodGhpcy5wb3MsIHtvcGVuU3ltYm9sOiBcIlxcXFxlbmR7XCIsIGNsb3NlU3ltYm9sOiBcIn1cIn0pXG5cdFx0KTtcblx0fVxuXG5cdGdldEJvdW5kcyhwb3M6IG51bWJlciA9IHRoaXMucG9zKTogQm91bmRzfG51bGwge1xuXHRcdC8vIHllcywgSSBhbHNvIHdhbnQgdGhlIGNhY2hlIHRvIHdvcmsgb3ZlciB0aGUgcHJvZHVjZWQgcmFuZ2UgaW5zdGVhZCBvZiBqdXN0IHRoYXQgb25lIHRocm91Z2hcblx0XHQvLyBhIEJUcmVlIG9yIHRoZSBsaWtlLCBidXQgdGhhdCdkIGJlIHByb2JhYmx5IG92ZXJraWxsXG5cdFx0aWYgKHRoaXMuYm91bmRzQ2FjaGUuaGFzKHBvcykpIHtcblx0XHRcdHJldHVybiB0aGlzLmJvdW5kc0NhY2hlLmdldChwb3MpfHxudWxsO1xuXHRcdH1cblxuXHRcdGxldCBib3VuZHM7XG5cdFx0aWYgKHRoaXMubW9kZS5jb2RlTWF0aCkge1xuXHRcdFx0Ly8gbWVhbnMgYSBjb2RlYmxvY2sgbGFuZ3VhZ2UgdHJpZ2dlcmVkIHRoZSBtYXRoIG1vZGUgLT4gdXNlIHRoZSBjb2RlYmxvY2sgYm91bmRzIGluc3RlYWRcblx0XHRcdGJvdW5kcyA9IGdldENvZGVibG9ja0JvdW5kcyh0aGlzLnN0YXRlLCBwb3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRib3VuZHMgPSBnZXRFcXVhdGlvbkJvdW5kcyh0aGlzLnN0YXRlKTtcblx0XHR9XG5cdFx0aWYoYm91bmRzIT09bnVsbClcblx0XHRcdHRoaXMuYm91bmRzQ2FjaGUuc2V0KHBvcywgYm91bmRzKTtcblx0XHRyZXR1cm4gYm91bmRzO1xuXHR9XG5cblx0Ly8gQWNjb3VudHMgZm9yIGVxdWF0aW9ucyB3aXRoaW4gdGV4dCBlbnZpcm9ubWVudHMsIGUuZy4gJCRcXHRleHR7Li4uICQuLi4kfSQkXG5cdGdldElubmVyQm91bmRzKHBvczogbnVtYmVyID0gdGhpcy5wb3MpOiBCb3VuZHN8bnVsbCB7XG5cdFx0bGV0IGJvdW5kcztcblx0XHRpZiAodGhpcy5tb2RlLmNvZGVNYXRoKSB7XG5cdFx0XHQvLyBtZWFucyBhIGNvZGVibG9jayBsYW5ndWFnZSB0cmlnZ2VyZWQgdGhlIG1hdGggbW9kZSAtPiB1c2UgdGhlIGNvZGVibG9jayBib3VuZHMgaW5zdGVhZFxuXHRcdFx0Ym91bmRzID0gZ2V0Q29kZWJsb2NrQm91bmRzKHRoaXMuc3RhdGUsIHBvcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJvdW5kcyA9IGdldElubmVyRXF1YXRpb25Cb3VuZHModGhpcy5zdGF0ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJvdW5kcztcblx0fVxuXG59XG5cbmNvbnN0IGlzV2l0aGluRXF1YXRpb24gPSAoc3RhdGU6IEVkaXRvclN0YXRlKTpib29sZWFuID0+IHtcblx0Y29uc3QgcG9zID0gc3RhdGUuc2VsZWN0aW9uLm1haW4udG87XG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcblxuXHRsZXQgc3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcywgLTEpO1xuXHRpZiAoc3ludGF4Tm9kZS5uYW1lLmNvbnRhaW5zKFwibWF0aC1lbmRcIikpIHJldHVybiBmYWxzZTtcblxuXHRpZiAoIXN5bnRheE5vZGUucGFyZW50KSB7XG5cdFx0c3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcywgMSk7XG5cdFx0aWYgKHN5bnRheE5vZGUubmFtZS5jb250YWlucyhcIm1hdGgtYmVnaW5cIikpIHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIEFjY291bnQvYWxsb3cgZm9yIGJlaW5nIG9uIGFuIGVtcHR5IGxpbmUgaW4gYSBlcXVhdGlvblxuXHRpZiAoIXN5bnRheE5vZGUucGFyZW50KSB7XG5cdFx0Y29uc3QgbGVmdCA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcyAtIDEsIC0xKTtcblx0XHRjb25zdCByaWdodCA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcyArIDEsIDEpO1xuXG5cdFx0cmV0dXJuIChsZWZ0Lm5hbWUuY29udGFpbnMoXCJtYXRoXCIpICYmIHJpZ2h0Lm5hbWUuY29udGFpbnMoXCJtYXRoXCIpICYmICEobGVmdC5uYW1lLmNvbnRhaW5zKFwibWF0aC1lbmRcIikpKTtcblx0fVxuXG5cdHJldHVybiAoc3ludGF4Tm9kZS5uYW1lLmNvbnRhaW5zKFwibWF0aFwiKSk7XG59XG5cbmNvbnN0IGlzV2l0aGluSW5saW5lRXF1YXRpb24gPSAoc3RhdGU6IEVkaXRvclN0YXRlKTpib29sZWFuID0+IHtcblx0Y29uc3QgcG9zID0gc3RhdGUuc2VsZWN0aW9uLm1haW4udG87XG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcblxuXHRsZXQgc3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcywgLTEpO1xuXHRpZiAoc3ludGF4Tm9kZS5uYW1lLmNvbnRhaW5zKFwibWF0aC1lbmRcIikpIHJldHVybiBmYWxzZTtcblxuXHRpZiAoIXN5bnRheE5vZGUucGFyZW50KSB7XG5cdFx0c3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcywgMSk7XG5cdFx0aWYgKHN5bnRheE5vZGUubmFtZS5jb250YWlucyhcIm1hdGgtYmVnaW5cIikpIHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIEFjY291bnQvYWxsb3cgZm9yIGJlaW5nIG9uIGFuIGVtcHR5IGxpbmUgaW4gYSBlcXVhdGlvblxuXHRpZiAoIXN5bnRheE5vZGUucGFyZW50KSBzeW50YXhOb2RlID0gdHJlZS5yZXNvbHZlSW5uZXIocG9zIC0gMSwgLTEpO1xuXG5cdGNvbnN0IGN1cnNvciA9IHN5bnRheE5vZGUuY3Vyc29yKCk7XG5cdGNvbnN0IHJlcyA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJtYXRoLWJlZ2luXCIpO1xuXG5cdHJldHVybiAhcmVzPy5uYW1lLmNvbnRhaW5zKFwibWF0aC1ibG9ja1wiKTtcbn1cblxuLyoqXG4gKiBGaWd1cmVzIG91dCB3aGVyZSB0aGlzIGVxdWF0aW9uIHN0YXJ0cyBhbmQgd2hlcmUgaXQgZW5kcy5cbiAqXG4gKiAqKk5vdGU6KiogSWYgeW91IGludGVuZCB0byB1c2UgdGhpcyBkaXJlY3RseSwgY2hlY2sgb3V0IENvbnRleHQuZ2V0Qm91bmRzIGluc3RlYWQsIHdoaWNoIGNhY2hlcyBhbmQgYWxzbyB0YWtlcyBjYXJlIG9mIGNvZGVibG9jayBsYW5ndWFnZXMgd2hpY2ggc2hvdWxkIGJlaGF2ZSBsaWtlIG1hdGggbW9kZS5cbiAqL1xuZXhwb3J0IGNvbnN0IGdldEVxdWF0aW9uQm91bmRzID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSwgcG9zPzogbnVtYmVyKTpCb3VuZHN8bnVsbCA9PiB7XG5cdGlmICghcG9zKSBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ubWFpbi50bztcblx0Y29uc3QgdHJlZSA9IHN5bnRheFRyZWUoc3RhdGUpO1xuXG5cdGxldCBzeW50YXhOb2RlID0gdHJlZS5yZXNvbHZlSW5uZXIocG9zLCAtMSk7XG5cblx0aWYgKCFzeW50YXhOb2RlLnBhcmVudCkge1xuXHRcdHN5bnRheE5vZGUgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MsIDEpO1xuXHR9XG5cblx0Ly8gQWNjb3VudC9hbGxvdyBmb3IgYmVpbmcgb24gYW4gZW1wdHkgbGluZSBpbiBhIGVxdWF0aW9uXG5cdGlmICghc3ludGF4Tm9kZS5wYXJlbnQpIHN5bnRheE5vZGUgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MgLSAxLCAtMSk7XG5cblx0Y29uc3QgY3Vyc29yID0gc3ludGF4Tm9kZS5jdXJzb3IoKTtcblx0Y29uc3QgYmVnaW4gPSBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yLCBEaXJlY3Rpb24uQmFja3dhcmQsIFwibWF0aC1iZWdpblwiKTtcblx0Y29uc3QgZW5kID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkZvcndhcmQsIFwibWF0aC1lbmRcIik7XG5cblx0aWYgKGJlZ2luICYmIGVuZCkge1xuXHRcdHJldHVybiB7c3RhcnQ6IGJlZ2luLnRvLCBlbmQ6IGVuZC5mcm9tfTtcblx0fVxuXHRlbHNlIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG4vLyBBY2NvdW50cyBmb3IgZXF1YXRpb25zIHdpdGhpbiB0ZXh0IGVudmlyb25tZW50cywgZS5nLiAkJFxcdGV4dHsuLi4gJC4uLiR9JCRcbmNvbnN0IGdldElubmVyRXF1YXRpb25Cb3VuZHMgPSAoc3RhdGU6IEVkaXRvclN0YXRlLCBwb3M/OiBudW1iZXIpOkJvdW5kc3xudWxsID0+IHtcblx0aWYgKCFwb3MpIHBvcyA9IHN0YXRlLnNlbGVjdGlvbi5tYWluLnRvO1xuXHRsZXQgdGV4dCA9IHN0YXRlLmRvYy50b1N0cmluZygpO1xuXG5cdC8vIGlnbm9yZSBcXCRcblx0dGV4dCA9IHRleHQucmVwbGFjZUFsbChcIlxcXFwkXCIsIFwiXFxcXFJcIik7XG5cblx0Y29uc3QgbGVmdCA9IHRleHQubGFzdEluZGV4T2YoXCIkXCIsIHBvcy0xKTtcblx0Y29uc3QgcmlnaHQgPSB0ZXh0LmluZGV4T2YoXCIkXCIsIHBvcyk7XG5cblx0aWYgKGxlZnQgPT09IC0xIHx8IHJpZ2h0ID09PSAtMSkgcmV0dXJuIG51bGw7XG5cblx0cmV0dXJuIHtzdGFydDogbGVmdCArIDEsIGVuZDogcmlnaHR9O1xufVxuXG4vKipcbiAqIEZpZ3VyZXMgb3V0IHdoZXJlIHRoaXMgY29kZWJsb2NrIHN0YXJ0cyBhbmQgd2hlcmUgaXQgZW5kcy5cbiAqXG4gKiAqKk5vdGU6KiogSWYgeW91IGludGVuZCB0byB1c2UgdGhpcyBkaXJlY3RseSwgY2hlY2sgb3V0IENvbnRleHQuZ2V0Qm91bmRzIGluc3RlYWQsIHdoaWNoIGNhY2hlcyBhbmQgYWxzbyB0YWtlcyBjYXJlIG9mIGNvZGVibG9jayBsYW5ndWFnZXMgd2hpY2ggc2hvdWxkIGJlaGF2ZSBsaWtlIG1hdGggbW9kZS5cbiAqL1xuY29uc3QgZ2V0Q29kZWJsb2NrQm91bmRzID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSwgcG9zOiBudW1iZXIgPSBzdGF0ZS5zZWxlY3Rpb24ubWFpbi5mcm9tKTpCb3VuZHN8bnVsbCA9PiB7XG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcblxuXHRsZXQgY3Vyc29yID0gdHJlZS5jdXJzb3JBdChwb3MsIC0xKTtcblx0Y29uc3QgYmxvY2tCZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJIeXBlck1ELWNvZGVibG9jay1iZWdpblwiKTtcblxuXHRjdXJzb3IgPSB0cmVlLmN1cnNvckF0KHBvcywgLTEpO1xuXHRjb25zdCBibG9ja0VuZCA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5Gb3J3YXJkLCBcIkh5cGVyTUQtY29kZWJsb2NrLWVuZFwiKTtcblx0cmV0dXJuIChibG9ja0JlZ2luICYmIGJsb2NrRW5kKSA/IHsgc3RhcnQ6IGJsb2NrQmVnaW4udG8gKyAxLCBlbmQ6IGJsb2NrRW5kLmZyb20gLSAxIH0gOiBudWxsO1xuXG59XG5cbmNvbnN0IGZpbmRGaXJzdE5vbk5ld2xpbmVCZWZvcmUgPSAoc3RhdGU6IEVkaXRvclN0YXRlLCBwb3M6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGN1cnJlbnRQb3MgPSBwb3M7XG4gICAgd2hpbGUgKGN1cnJlbnRQb3MgPj0gMCkge1xuICAgICAgICBjb25zdCBjaGFyID0gZ2V0Q2hhcmFjdGVyQXRQb3Moc3RhdGUsIGN1cnJlbnRQb3MtMSk7XG4gICAgICAgIGlmIChjaGFyICE9PSBcIlxcblwiKSB7XG4gICAgICAgICAgICByZXR1cm4gY3VycmVudFBvcztcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50UG9zLS07XG4gICAgfVxuICAgIHJldHVybiAwO1xufTtcblxuY29uc3QgbGFuZ0lmV2l0aGluQ29kZWJsb2NrID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IHN0cmluZyB8IG51bGwgPT4ge1xuXHRjb25zdCB0cmVlID0gc3ludGF4VHJlZShzdGF0ZSk7XG5cblx0Y29uc3QgcG9zID0gc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xuXG5cblx0Y29uc3QgYWRqdXN0ZWRQb3MgPXBvcyA9PT0gMCA/IDAgOiBmaW5kRmlyc3ROb25OZXdsaW5lQmVmb3JlKHN0YXRlLCBwb3MpO1xuXHRjb25zdCBjdXJzb3IgPSB0cmVlLmN1cnNvckF0KGFkanVzdGVkUG9zLCAtMSk7XG5cdFxuXHRjb25zdCBpbkNvZGVibG9jayA9IGN1cnNvci5uYW1lLmNvbnRhaW5zKFwiY29kZWJsb2NrXCIpO1xuXHRpZiAoIWluQ29kZWJsb2NrKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvLyBsb2NhdGUgdGhlIHN0YXJ0IG9mIHRoZSBibG9ja1xuXHRjb25zdCBjb2RlYmxvY2tCZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJIeXBlck1ELWNvZGVibG9ja19IeXBlck1ELWNvZGVibG9jay1iZWdpblwiKTtcblxuXHRpZiAoY29kZWJsb2NrQmVnaW4gPT0gbnVsbCkge1xuXHRcdGNvbnNvbGUud2FybihcInVuYWJsZSB0byBsb2NhdGUgc3RhcnQgb2YgdGhlIGNvZGVibG9jayBldmVuIHRob3VnaCBpbnNpZGUgb25lXCIpO1xuXHRcdHJldHVybiBcIlwiO1xuXHR9XG5cblx0Ly8gZXh0cmFjdCB0aGUgbGFuZ3VhZ2Vcblx0Ly8gY29kZWJsb2NrcyBtYXkgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYmFja3RpY2tzXG5cdGNvbnN0IGxhbmd1YWdlID0gc3RhdGUuc2xpY2VEb2MoY29kZWJsb2NrQmVnaW4uZnJvbSwgY29kZWJsb2NrQmVnaW4udG8pLnJlcGxhY2UoL2ArLywgXCJcIik7XG5cblx0cmV0dXJuIGxhbmd1YWdlO1xufVxuXG5cblxuXG5cblxuZXhwb3J0IGNsYXNzIE1vZGUge1xuXHR0ZXh0OiBib29sZWFuO1xuXHRpbmxpbmVNYXRoOiBib29sZWFuO1xuXHRibG9ja01hdGg6IGJvb2xlYW47XG5cdGNvZGVNYXRoOiBib29sZWFuO1xuXHRjb2RlOiBib29sZWFuO1xuXHR0ZXh0RW52OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzdGF0ZSBpcyBpbnNpZGUgYW4gZXF1YXRpb24gYm91bmRlZCBieSAkIG9yICQkIGRlbGltZXRlcnMuXG5cdCAqL1xuXHRpbkVxdWF0aW9uKCk6Ym9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lTWF0aCB8fCB0aGlzLmJsb2NrTWF0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzdGF0ZSBpcyBpbiBhbnkgbWF0aCBtb2RlLlxuXHQgKlxuXHQgKiBUaGUgZXF1YXRpb24gbWF5IGJlIGJvdW5kZWQgYnkgJCBvciAkJCBkZWxpbWV0ZXJzLCBvciBpdCBtYXkgYmUgYW4gZXF1YXRpb24gaW5zaWRlIGEgYG1hdGhgIGNvZGVibG9jay5cblx0ICovXG5cdGluTWF0aCgpOmJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlubGluZU1hdGggfHwgdGhpcy5ibG9ja01hdGggfHwgdGhpcy5jb2RlTWF0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzdGF0ZSBpcyBzdHJpY3RseSBpbiBtYXRoIG1vZGUuXG5cdCAqXG5cdCAqIFJldHVybnMgZmFsc2Ugd2hlbiB0aGUgc3RhdGUgaXMgd2l0aGluIG1hdGgsIGJ1dCBpbnNpZGUgYSB0ZXh0IGVudmlyb25tZW50LCBzdWNoIGFzIFxcdGV4dHt9LlxuXHQgKi9cblx0c3RyaWN0bHlJbk1hdGgoKTpib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbk1hdGgoKSAmJiAhdGhpcy50ZXh0RW52O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy50ZXh0ID0gZmFsc2U7XG5cdFx0dGhpcy5ibG9ja01hdGggPSBmYWxzZTtcblx0XHR0aGlzLmlubGluZU1hdGggPSBmYWxzZTtcblx0XHR0aGlzLmNvZGUgPSBmYWxzZTtcblx0XHR0aGlzLnRleHRFbnYgPSBmYWxzZTtcblx0fVxuXG5cdGludmVydCgpIHtcblx0XHR0aGlzLnRleHQgPSAhdGhpcy50ZXh0O1xuXHRcdHRoaXMuYmxvY2tNYXRoID0gIXRoaXMuYmxvY2tNYXRoO1xuXHRcdHRoaXMuaW5saW5lTWF0aCA9ICF0aGlzLmlubGluZU1hdGg7XG5cdFx0dGhpcy5jb2RlTWF0aCA9ICF0aGlzLmNvZGVNYXRoO1xuXHRcdHRoaXMuY29kZSA9ICF0aGlzLmNvZGU7XG5cdFx0dGhpcy50ZXh0RW52ID0gIXRoaXMudGV4dEVudjtcblx0fVxuXG5cdHN0YXRpYyBmcm9tU291cmNlKHNvdXJjZTogc3RyaW5nKTogTW9kZSB7XG5cdFx0Y29uc3QgbW9kZSA9IG5ldyBNb2RlKCk7XG5cblx0XHRmb3IgKGNvbnN0IGZsYWdfY2hhciBvZiBzb3VyY2UpIHtcblx0XHRcdHN3aXRjaCAoZmxhZ19jaGFyKSB7XG5cdFx0XHRcdGNhc2UgXCJtXCI6XG5cdFx0XHRcdFx0bW9kZS5ibG9ja01hdGggPSB0cnVlO1xuXHRcdFx0XHRcdG1vZGUuaW5saW5lTWF0aCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJuXCI6XG5cdFx0XHRcdFx0bW9kZS5pbmxpbmVNYXRoID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBcIk1cIjpcblx0XHRcdFx0XHRtb2RlLmJsb2NrTWF0aCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJ0XCI6XG5cdFx0XHRcdFx0bW9kZS50ZXh0ID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBcImNcIjpcblx0XHRcdFx0XHRtb2RlLmNvZGUgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0aWYgKCEobW9kZS50ZXh0IHx8XG5cdFx0XHRtb2RlLmlubGluZU1hdGggfHxcblx0XHRcdG1vZGUuYmxvY2tNYXRoIHx8XG5cdFx0XHRtb2RlLmNvZGVNYXRoIHx8XG5cdFx0XHRtb2RlLmNvZGUgfHxcblx0XHRcdG1vZGUudGV4dEVudilcblx0XHQpIHtcblx0XHRcdC8vIGZvciBiYWNrd2FyZHMgY29tcGF0IHdlIG5lZWQgdG8gYXNzdW1lIHRoYXQgdGhpcyBpcyBhIGNhdGNoYWxsIG1vZGUgdGhlblxuXHRcdFx0bW9kZS5pbnZlcnQoKTtcblx0XHRcdHJldHVybiBtb2RlO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlO1xuXHR9XG59Il19