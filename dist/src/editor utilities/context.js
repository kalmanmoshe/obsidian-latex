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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3IgdXRpbGl0aWVzL2NvbnRleHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEksT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBYWxELE1BQU0sT0FBTyxPQUFPO0lBQ25CLEtBQUssQ0FBYztJQUNuQixJQUFJLENBQVE7SUFDWixHQUFHLENBQVM7SUFDWixNQUFNLENBQW1CO0lBQ3pCLGlCQUFpQixDQUFTO0lBQzFCLFdBQVcsQ0FBc0I7SUFFakMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFrQjtRQUNsQyxNQUFNLEdBQUcsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzFCLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7UUFDNUIsR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbEIsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUN0QixHQUFHLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzlDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUN0QixHQUFHLENBQUMsV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFFNUIsTUFBTSxpQkFBaUIsR0FBRyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2RCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsS0FBSyxJQUFJLENBQUM7UUFFMUMsTUFBTSxRQUFRLEdBQUcsRUFBQyxrQkFBa0IsRUFBRSxlQUFlLEVBQUMs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QUMsUUFBUTtZQUNiLElBQUksQ0FBQyxJQUFJO1lBQ1QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUNaO1lBQ0QsMkVBQTJFO1lBQzNFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNkLE9BQU8sSUFBSSxDQUFDO1NBQ1o7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVkaXRvclN0YXRlLCBTZWxlY3Rpb25SYW5nZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgRGlyZWN0aW9uLCBlc2NhbGF0ZVRvVG9rZW4sIGZpbmRNYXRjaGluZ0JyYWNrZXQsIGdldENoYXJhY3RlckF0UG9zLCBnZXRDbG9zZUJyYWNrZXQgfSBmcm9tIFwic3JjL2VkaXRvciB1dGlsaXRpZXMvZWRpdG9yX3V0aWxzXCI7XHJcbmltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tIFwiQGNvZGVtaXJyb3IvbGFuZ3VhZ2VcIjtcclxuXHJcbmludGVyZmFjZSBFbnZpcm9ubWVudCB7XHJcblx0b3BlblN5bWJvbDogc3RyaW5nO1xyXG5cdGNsb3NlU3ltYm9sOiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQm91bmRzIHtcclxuXHRzdGFydDogbnVtYmVyO1xyXG5cdGVuZDogbnVtYmVyO1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIENvbnRleHQge1xyXG5cdHN0YXRlOiBFZGl0b3JTdGF0ZTtcclxuXHRtb2RlITogTW9kZTtcclxuXHRwb3M6IG51bWJlcjtcclxuXHRyYW5nZXM6IFNlbGVjdGlvblJhbmdlW107XHJcblx0Y29kZWJsb2NrTGFuZ3VhZ2U6IHN0cmluZztcclxuXHRib3VuZHNDYWNoZTogTWFwPG51bWJlciwgQm91bmRzPjtcclxuXHJcblx0c3RhdGljIGZyb21TdGF0ZShzdGF0ZTogRWRpdG9yU3RhdGUpOkNvbnRleHQge1xyXG5cdFx0Y29uc3QgY3R4ID0gbmV3IENvbnRleHQoKTtcclxuXHRcdGNvbnN0IHNlbCA9IHN0YXRlLnNlbGVjdGlvbjtcclxuXHRcdGN0eC5zdGF0ZSA9IHN0YXRlO1xyXG5cdFx0Y3R4LnBvcyA9IHNlbC5tYWluLnRvO1xyXG5cdFx0Y3R4LnJhbmdlcyA9IEFycmF5LmZyb20oc2VsLnJhbmdlcykucmV2ZXJzZSgpO1xyXG5cdFx0Y3R4Lm1vZGUgPSBuZXcgTW9kZSgpO1xyXG5cdFx0Y3R4LmJvdW5kc0NhY2hlID0gbmV3IE1hcCgpO1xyXG5cclxuXHRcdGNvbnN0IGNvZGVibG9ja0xhbmd1YWdlID0gbGFuZ0lmV2l0aGluQ29kZWJsb2NrKHN0YXRlKTtcclxuXHRcdGNvbnN0IGluQ29kZSA9IGNvZGVibG9ja0xhbmd1YWdlICE9PSBudWxsO1xyXG5cclxuXHRcdGNvbnN0IHNldHRpbmdzID0ge2ZvcmNlTWF0aExhbmd1YWdlczogJ0Zha2UgbGFuZ3VhZ2UnfTtcclxuXHRcdGNvbnN0IGZvcmNlTWF0aCA9IGNvZGVibG9ja0xhbmd1YWdlP3NldHRpbmdzLmZvcmNlTWF0aExhbmd1YWdlcy5jb250YWlucyhjb2RlYmxvY2tMYW5ndWFnZSk6ZmFsc2U7XHJcblx0XHRjdHgubW9kZS5jb2RlTWF0aCA9IGZvcmNlTWF0aDtcclxuXHRcdGN0eC5tb2RlLmNvZGUgPSBpbkNvZGUgJiYgIWZvcmNlTWF0aDtcclxuXHRcdGlmIChjdHgubW9kZS5jb2RlJiZjb2RlYmxvY2tMYW5ndWFnZSkgY3R4LmNvZGVibG9ja0xhbmd1YWdlID0gY29kZWJsb2NrTGFuZ3VhZ2U7XHJcblxyXG5cdFx0Ly8gZmlyc3QsIGNoZWNrIGlmIG1hdGggbW9kZSBzaG91bGQgYmUgXCJnZW5lcmFsbHlcIiBvblxyXG5cdFx0Y29uc3QgaW5NYXRoID0gZm9yY2VNYXRoIHx8IGlzV2l0aGluRXF1YXRpb24oc3RhdGUpO1xyXG5cclxuXHRcdGlmIChpbk1hdGggJiYgIWZvcmNlTWF0aCkge1xyXG5cdFx0XHRjb25zdCBpbklubGluZUVxdWF0aW9uID0gaXNXaXRoaW5JbmxpbmVFcXVhdGlvbihzdGF0ZSk7XHJcblxyXG5cdFx0XHRjdHgubW9kZS5ibG9ja01hdGggPSAhaW5JbmxpbmVFcXVhdGlvbjtcclxuXHRcdFx0Y3R4Lm1vZGUuaW5saW5lTWF0aCA9IGluSW5saW5lRXF1YXRpb247XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKGluTWF0aCkge1xyXG5cdFx0XHRjdHgubW9kZS50ZXh0RW52ID0gY3R4LmluVGV4dEVudmlyb25tZW50KCk7XHJcblx0XHR9XHJcblxyXG5cdFx0Y3R4Lm1vZGUudGV4dCA9ICFpbkNvZGUgJiYgIWluTWF0aDtcclxuXHJcblx0XHRyZXR1cm4gY3R4O1xyXG5cdH1cclxuXHJcblx0c3RhdGljIGZyb21WaWV3KHZpZXc6IEVkaXRvclZpZXcpOkNvbnRleHQge1xyXG5cdFx0cmV0dXJuIENvbnRleHQuZnJvbVN0YXRlKHZpZXcuc3RhdGUpO1xyXG5cdH1cclxuXHJcblx0aXNXaXRoaW5FbnZpcm9ubWVudChwb3M6IG51bWJlciwgZW52OiBFbnZpcm9ubWVudCk6IGJvb2xlYW4ge1xyXG5cdFx0aWYgKCF0aGlzLm1vZGUuaW5NYXRoKCkpIHJldHVybiBmYWxzZTtcclxuXHJcblx0XHRjb25zdCBib3VuZHMgPSB0aGlzLmdldElubmVyQm91bmRzKCk7XHJcblx0XHRpZiAoIWJvdW5kcykgcmV0dXJuIGZhbHNlO1xyXG5cclxuXHRcdGNvbnN0IHtzdGFydCwgZW5kfSA9IGJvdW5kcztcclxuXHRcdGNvbnN0IHRleHQgPSB0aGlzLnN0YXRlLnNsaWNlRG9jKHN0YXJ0LCBlbmQpO1xyXG5cdFx0Ly8gcG9zIHJlZmVycmVkIHRvIHRoZSBhYnNvbHV0ZSBwb3NpdGlvbiBpbiB0aGUgd2hvbGUgZG9jdW1lbnQsIGJ1dCB3ZSBqdXN0IHNsaWNlZCB0aGUgdGV4dFxyXG5cdFx0Ly8gc28gbm93IHBvcyBtdXN0IGJlIHJlbGF0aXZlIHRvIHRoZSBzdGFydCBpbiBvcmRlciB0byBiZSBhbnkgdXNlZnVsXHJcblx0XHRwb3MgLT0gc3RhcnQ7XHJcblxyXG5cdFx0Y29uc3Qgb3BlbkJyYWNrZXQgPSBlbnYub3BlblN5bWJvbC5zbGljZSgtMSk7XHJcblx0XHRjb25zdCBjbG9zZUJyYWNrZXQgPSBnZXRDbG9zZUJyYWNrZXQob3BlbkJyYWNrZXQpO1xyXG5cclxuXHRcdC8vIFRha2UgY2FyZSB3aGVuIHRoZSBvcGVuIHN5bWJvbCBlbmRzIHdpdGggYSBicmFja2V0IHssIFssIG9yIChcclxuXHRcdC8vIGFzIHRoZW4gdGhlIGNsb3Npbmcgc3ltYm9sLCB9LCBdIG9yICksIGlzIG5vdCB1bmlxdWUgdG8gdGhpcyBvcGVuIHN5bWJvbFxyXG5cdFx0bGV0IG9mZnNldDtcclxuXHRcdGxldCBvcGVuU2VhcmNoU3ltYm9sO1xyXG5cclxuXHRcdGlmIChbXCJ7XCIsIFwiW1wiLCBcIihcIl0uY29udGFpbnMob3BlbkJyYWNrZXQpICYmIGVudi5jbG9zZVN5bWJvbCA9PT0gY2xvc2VCcmFja2V0KSB7XHJcblx0XHRcdG9mZnNldCA9IGVudi5vcGVuU3ltYm9sLmxlbmd0aCAtIDE7XHJcblx0XHRcdG9wZW5TZWFyY2hTeW1ib2wgPSBvcGVuQnJhY2tldDtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdG9mZnNldCA9IDA7XHJcblx0XHRcdG9wZW5TZWFyY2hTeW1ib2wgPSBlbnYub3BlblN5bWJvbDtcclxuXHRcdH1cclxuXHJcblx0XHRsZXQgbGVmdCA9IHRleHQubGFzdEluZGV4T2YoZW52Lm9wZW5TeW1ib2wsIHBvcyAtIDEpO1xyXG5cclxuXHRcdHdoaWxlIChsZWZ0ICE9IC0xKSB7XHJcblx0XHRcdGNvbnN0IHJpZ2h0ID0gZmluZE1hdGNoaW5nQnJhY2tldCh0ZXh0LCBsZWZ0ICsgb2Zmc2V0LCBvcGVuU2VhcmNoU3ltYm9sLCBlbnYuY2xvc2VTeW1ib2wsIGZhbHNlKTtcclxuXHJcblx0XHRcdGlmIChyaWdodCA9PT0gLTEpIHJldHVybiBmYWxzZTtcclxuXHJcblx0XHRcdC8vIENoZWNrIHdoZXRoZXIgdGhlIGN1cnNvciBsaWVzIGluc2lkZSB0aGUgZW52aXJvbm1lbnQgc3ltYm9sc1xyXG5cdFx0XHRpZiAoKHJpZ2h0ID49IHBvcykgJiYgKHBvcyA+PSBsZWZ0ICsgZW52Lm9wZW5TeW1ib2wubGVuZ3RoKSkge1xyXG5cdFx0XHRcdHJldHVybiB0cnVlO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiAobGVmdCA8PSAwKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdFx0XHQvLyBGaW5kIHRoZSBuZXh0IG9wZW4gc3ltYm9sXHJcblx0XHRcdGxlZnQgPSB0ZXh0Lmxhc3RJbmRleE9mKGVudi5vcGVuU3ltYm9sLCBsZWZ0IC0gMSk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH1cclxuXHJcblx0aW5UZXh0RW52aXJvbm1lbnQoKTogYm9vbGVhbiB7XHJcblx0XHRyZXR1cm4gKFxyXG5cdFx0XHR0aGlzLmlzV2l0aGluRW52aXJvbm1lbnQodGhpcy5wb3MsIHtvcGVuU3ltYm9sOiBcIlxcXFx0ZXh0e1wiLCBjbG9zZVN5bWJvbDogXCJ9XCJ9KSB8fFxyXG5cdFx0XHR0aGlzLmlzV2l0aGluRW52aXJvbm1lbnQodGhpcy5wb3MsIHtvcGVuU3ltYm9sOiBcIlxcXFx0YWd7XCIsIGNsb3NlU3ltYm9sOiBcIn1cIn0pIHx8XHJcblx0XHRcdHRoaXMuaXNXaXRoaW5FbnZpcm9ubWVudCh0aGlzLnBvcywge29wZW5TeW1ib2w6IFwiXFxcXGJlZ2lue1wiLCBjbG9zZVN5bWJvbDogXCJ9XCJ9KSB8fFxyXG5cdFx0XHR0aGlzLmlzV2l0aGluRW52aXJvbm1lbnQodGhpcy5wb3MsIHtvcGVuU3ltYm9sOiBcIlxcXFxlbmR7XCIsIGNsb3NlU3ltYm9sOiBcIn1cIn0pXHJcblx0XHQpO1xyXG5cdH1cclxuXHJcblx0Z2V0Qm91bmRzKHBvczogbnVtYmVyID0gdGhpcy5wb3MpOiBCb3VuZHN8bnVsbCB7XHJcblx0XHQvLyB5ZXMsIEkgYWxzbyB3YW50IHRoZSBjYWNoZSB0byB3b3JrIG92ZXIgdGhlIHByb2R1Y2VkIHJhbmdlIGluc3RlYWQgb2YganVzdCB0aGF0IG9uZSB0aHJvdWdoXHJcblx0XHQvLyBhIEJUcmVlIG9yIHRoZSBsaWtlLCBidXQgdGhhdCdkIGJlIHByb2JhYmx5IG92ZXJraWxsXHJcblx0XHRpZiAodGhpcy5ib3VuZHNDYWNoZS5oYXMocG9zKSkge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5ib3VuZHNDYWNoZS5nZXQocG9zKXx8bnVsbDtcclxuXHRcdH1cclxuXHJcblx0XHRsZXQgYm91bmRzO1xyXG5cdFx0aWYgKHRoaXMubW9kZS5jb2RlTWF0aCkge1xyXG5cdFx0XHQvLyBtZWFucyBhIGNvZGVibG9jayBsYW5ndWFnZSB0cmlnZ2VyZWQgdGhlIG1hdGggbW9kZSAtPiB1c2UgdGhlIGNvZGVibG9jayBib3VuZHMgaW5zdGVhZFxyXG5cdFx0XHRib3VuZHMgPSBnZXRDb2RlYmxvY2tCb3VuZHModGhpcy5zdGF0ZSwgcG9zKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGJvdW5kcyA9IGdldEVxdWF0aW9uQm91bmRzKHRoaXMuc3RhdGUpO1xyXG5cdFx0fVxyXG5cdFx0aWYoYm91bmRzIT09bnVsbClcclxuXHRcdFx0dGhpcy5ib3VuZHNDYWNoZS5zZXQocG9zLCBib3VuZHMpO1xyXG5cdFx0cmV0dXJuIGJvdW5kcztcclxuXHR9XHJcblxyXG5cdC8vIEFjY291bnRzIGZvciBlcXVhdGlvbnMgd2l0aGluIHRleHQgZW52aXJvbm1lbnRzLCBlLmcuICQkXFx0ZXh0ey4uLiAkLi4uJH0kJFxyXG5cdGdldElubmVyQm91bmRzKHBvczogbnVtYmVyID0gdGhpcy5wb3MpOiBCb3VuZHN8bnVsbCB7XHJcblx0XHRsZXQgYm91bmRzO1xyXG5cdFx0aWYgKHRoaXMubW9kZS5jb2RlTWF0aCkge1xyXG5cdFx0XHQvLyBtZWFucyBhIGNvZGVibG9jayBsYW5ndWFnZSB0cmlnZ2VyZWQgdGhlIG1hdGggbW9kZSAtPiB1c2UgdGhlIGNvZGVibG9jayBib3VuZHMgaW5zdGVhZFxyXG5cdFx0XHRib3VuZHMgPSBnZXRDb2RlYmxvY2tCb3VuZHModGhpcy5zdGF0ZSwgcG9zKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGJvdW5kcyA9IGdldElubmVyRXF1YXRpb25Cb3VuZHModGhpcy5zdGF0ZSk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIGJvdW5kcztcclxuXHR9XHJcblxyXG59XHJcblxyXG5jb25zdCBpc1dpdGhpbkVxdWF0aW9uID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSk6Ym9vbGVhbiA9PiB7XHJcblx0Y29uc3QgcG9zID0gc3RhdGUuc2VsZWN0aW9uLm1haW4udG87XHJcblx0Y29uc3QgdHJlZSA9IHN5bnRheFRyZWUoc3RhdGUpO1xyXG5cclxuXHRsZXQgc3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcywgLTEpO1xyXG5cdGlmIChzeW50YXhOb2RlLm5hbWUuY29udGFpbnMoXCJtYXRoLWVuZFwiKSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuXHRpZiAoIXN5bnRheE5vZGUucGFyZW50KSB7XHJcblx0XHRzeW50YXhOb2RlID0gdHJlZS5yZXNvbHZlSW5uZXIocG9zLCAxKTtcclxuXHRcdGlmIChzeW50YXhOb2RlLm5hbWUuY29udGFpbnMoXCJtYXRoLWJlZ2luXCIpKSByZXR1cm4gZmFsc2U7XHJcblx0fVxyXG5cclxuXHQvLyBBY2NvdW50L2FsbG93IGZvciBiZWluZyBvbiBhbiBlbXB0eSBsaW5lIGluIGEgZXF1YXRpb25cclxuXHRpZiAoIXN5bnRheE5vZGUucGFyZW50KSB7XHJcblx0XHRjb25zdCBsZWZ0ID0gdHJlZS5yZXNvbHZlSW5uZXIocG9zIC0gMSwgLTEpO1xyXG5cdFx0Y29uc3QgcmlnaHQgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MgKyAxLCAxKTtcclxuXHJcblx0XHRyZXR1cm4gKGxlZnQubmFtZS5jb250YWlucyhcIm1hdGhcIikgJiYgcmlnaHQubmFtZS5jb250YWlucyhcIm1hdGhcIikgJiYgIShsZWZ0Lm5hbWUuY29udGFpbnMoXCJtYXRoLWVuZFwiKSkpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIChzeW50YXhOb2RlLm5hbWUuY29udGFpbnMoXCJtYXRoXCIpKTtcclxufVxyXG5cclxuY29uc3QgaXNXaXRoaW5JbmxpbmVFcXVhdGlvbiA9IChzdGF0ZTogRWRpdG9yU3RhdGUpOmJvb2xlYW4gPT4ge1xyXG5cdGNvbnN0IHBvcyA9IHN0YXRlLnNlbGVjdGlvbi5tYWluLnRvO1xyXG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcclxuXHJcblx0bGV0IHN5bnRheE5vZGUgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MsIC0xKTtcclxuXHRpZiAoc3ludGF4Tm9kZS5uYW1lLmNvbnRhaW5zKFwibWF0aC1lbmRcIikpIHJldHVybiBmYWxzZTtcclxuXHJcblx0aWYgKCFzeW50YXhOb2RlLnBhcmVudCkge1xyXG5cdFx0c3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcywgMSk7XHJcblx0XHRpZiAoc3ludGF4Tm9kZS5uYW1lLmNvbnRhaW5zKFwibWF0aC1iZWdpblwiKSkgcmV0dXJuIGZhbHNlO1xyXG5cdH1cclxuXHJcblx0Ly8gQWNjb3VudC9hbGxvdyBmb3IgYmVpbmcgb24gYW4gZW1wdHkgbGluZSBpbiBhIGVxdWF0aW9uXHJcblx0aWYgKCFzeW50YXhOb2RlLnBhcmVudCkgc3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcyAtIDEsIC0xKTtcclxuXHJcblx0Y29uc3QgY3Vyc29yID0gc3ludGF4Tm9kZS5jdXJzb3IoKTtcclxuXHRjb25zdCByZXMgPSBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yLCBEaXJlY3Rpb24uQmFja3dhcmQsIFwibWF0aC1iZWdpblwiKTtcclxuXHJcblx0cmV0dXJuICFyZXM/Lm5hbWUuY29udGFpbnMoXCJtYXRoLWJsb2NrXCIpO1xyXG59XHJcblxyXG4vKipcclxuICogRmlndXJlcyBvdXQgd2hlcmUgdGhpcyBlcXVhdGlvbiBzdGFydHMgYW5kIHdoZXJlIGl0IGVuZHMuXHJcbiAqXHJcbiAqICoqTm90ZToqKiBJZiB5b3UgaW50ZW5kIHRvIHVzZSB0aGlzIGRpcmVjdGx5LCBjaGVjayBvdXQgQ29udGV4dC5nZXRCb3VuZHMgaW5zdGVhZCwgd2hpY2ggY2FjaGVzIGFuZCBhbHNvIHRha2VzIGNhcmUgb2YgY29kZWJsb2NrIGxhbmd1YWdlcyB3aGljaCBzaG91bGQgYmVoYXZlIGxpa2UgbWF0aCBtb2RlLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdldEVxdWF0aW9uQm91bmRzID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSwgcG9zPzogbnVtYmVyKTpCb3VuZHN8bnVsbCA9PiB7XHJcblx0aWYgKCFwb3MpIHBvcyA9IHN0YXRlLnNlbGVjdGlvbi5tYWluLnRvO1xyXG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcclxuXHJcblx0bGV0IHN5bnRheE5vZGUgPSB0cmVlLnJlc29sdmVJbm5lcihwb3MsIC0xKTtcclxuXHJcblx0aWYgKCFzeW50YXhOb2RlLnBhcmVudCkge1xyXG5cdFx0c3ludGF4Tm9kZSA9IHRyZWUucmVzb2x2ZUlubmVyKHBvcywgMSk7XHJcblx0fVxyXG5cclxuXHQvLyBBY2NvdW50L2FsbG93IGZvciBiZWluZyBvbiBhbiBlbXB0eSBsaW5lIGluIGEgZXF1YXRpb25cclxuXHRpZiAoIXN5bnRheE5vZGUucGFyZW50KSBzeW50YXhOb2RlID0gdHJlZS5yZXNvbHZlSW5uZXIocG9zIC0gMSwgLTEpO1xyXG5cclxuXHRjb25zdCBjdXJzb3IgPSBzeW50YXhOb2RlLmN1cnNvcigpO1xyXG5cdGNvbnN0IGJlZ2luID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkJhY2t3YXJkLCBcIm1hdGgtYmVnaW5cIik7XHJcblx0Y29uc3QgZW5kID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkZvcndhcmQsIFwibWF0aC1lbmRcIik7XHJcblxyXG5cdGlmIChiZWdpbiAmJiBlbmQpIHtcclxuXHRcdHJldHVybiB7c3RhcnQ6IGJlZ2luLnRvLCBlbmQ6IGVuZC5mcm9tfTtcclxuXHR9XHJcblx0ZWxzZSB7XHJcblx0XHRyZXR1cm4gbnVsbDtcclxuXHR9XHJcbn1cclxuXHJcbi8vIEFjY291bnRzIGZvciBlcXVhdGlvbnMgd2l0aGluIHRleHQgZW52aXJvbm1lbnRzLCBlLmcuICQkXFx0ZXh0ey4uLiAkLi4uJH0kJFxyXG5jb25zdCBnZXRJbm5lckVxdWF0aW9uQm91bmRzID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSwgcG9zPzogbnVtYmVyKTpCb3VuZHN8bnVsbCA9PiB7XHJcblx0aWYgKCFwb3MpIHBvcyA9IHN0YXRlLnNlbGVjdGlvbi5tYWluLnRvO1xyXG5cdGxldCB0ZXh0ID0gc3RhdGUuZG9jLnRvU3RyaW5nKCk7XHJcblxyXG5cdC8vIGlnbm9yZSBcXCRcclxuXHR0ZXh0ID0gdGV4dC5yZXBsYWNlQWxsKFwiXFxcXCRcIiwgXCJcXFxcUlwiKTtcclxuXHJcblx0Y29uc3QgbGVmdCA9IHRleHQubGFzdEluZGV4T2YoXCIkXCIsIHBvcy0xKTtcclxuXHRjb25zdCByaWdodCA9IHRleHQuaW5kZXhPZihcIiRcIiwgcG9zKTtcclxuXHJcblx0aWYgKGxlZnQgPT09IC0xIHx8IHJpZ2h0ID09PSAtMSkgcmV0dXJuIG51bGw7XHJcblxyXG5cdHJldHVybiB7c3RhcnQ6IGxlZnQgKyAxLCBlbmQ6IHJpZ2h0fTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZpZ3VyZXMgb3V0IHdoZXJlIHRoaXMgY29kZWJsb2NrIHN0YXJ0cyBhbmQgd2hlcmUgaXQgZW5kcy5cclxuICpcclxuICogKipOb3RlOioqIElmIHlvdSBpbnRlbmQgdG8gdXNlIHRoaXMgZGlyZWN0bHksIGNoZWNrIG91dCBDb250ZXh0LmdldEJvdW5kcyBpbnN0ZWFkLCB3aGljaCBjYWNoZXMgYW5kIGFsc28gdGFrZXMgY2FyZSBvZiBjb2RlYmxvY2sgbGFuZ3VhZ2VzIHdoaWNoIHNob3VsZCBiZWhhdmUgbGlrZSBtYXRoIG1vZGUuXHJcbiAqL1xyXG5jb25zdCBnZXRDb2RlYmxvY2tCb3VuZHMgPSAoc3RhdGU6IEVkaXRvclN0YXRlLCBwb3M6IG51bWJlciA9IHN0YXRlLnNlbGVjdGlvbi5tYWluLmZyb20pOkJvdW5kc3xudWxsID0+IHtcclxuXHRjb25zdCB0cmVlID0gc3ludGF4VHJlZShzdGF0ZSk7XHJcblxyXG5cdGxldCBjdXJzb3IgPSB0cmVlLmN1cnNvckF0KHBvcywgLTEpO1xyXG5cdGNvbnN0IGJsb2NrQmVnaW4gPSBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yLCBEaXJlY3Rpb24uQmFja3dhcmQsIFwiSHlwZXJNRC1jb2RlYmxvY2stYmVnaW5cIik7XHJcblxyXG5cdGN1cnNvciA9IHRyZWUuY3Vyc29yQXQocG9zLCAtMSk7XHJcblx0Y29uc3QgYmxvY2tFbmQgPSBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yLCBEaXJlY3Rpb24uRm9yd2FyZCwgXCJIeXBlck1ELWNvZGVibG9jay1lbmRcIik7XHJcblx0cmV0dXJuIChibG9ja0JlZ2luICYmIGJsb2NrRW5kKSA/IHsgc3RhcnQ6IGJsb2NrQmVnaW4udG8gKyAxLCBlbmQ6IGJsb2NrRW5kLmZyb20gLSAxIH0gOiBudWxsO1xyXG5cclxufVxyXG5cclxuY29uc3QgZmluZEZpcnN0Tm9uTmV3bGluZUJlZm9yZSA9IChzdGF0ZTogRWRpdG9yU3RhdGUsIHBvczogbnVtYmVyKTogbnVtYmVyID0+IHtcclxuICAgIGxldCBjdXJyZW50UG9zID0gcG9zO1xyXG4gICAgd2hpbGUgKGN1cnJlbnRQb3MgPj0gMCkge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBnZXRDaGFyYWN0ZXJBdFBvcyhzdGF0ZSwgY3VycmVudFBvcy0xKTtcclxuICAgICAgICBpZiAoY2hhciAhPT0gXCJcXG5cIikge1xyXG4gICAgICAgICAgICByZXR1cm4gY3VycmVudFBvcztcclxuICAgICAgICB9XHJcbiAgICAgICAgY3VycmVudFBvcy0tO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIDA7XHJcbn07XHJcblxyXG5jb25zdCBsYW5nSWZXaXRoaW5Db2RlYmxvY2sgPSAoc3RhdGU6IEVkaXRvclN0YXRlKTogc3RyaW5nIHwgbnVsbCA9PiB7XHJcblx0Y29uc3QgdHJlZSA9IHN5bnRheFRyZWUoc3RhdGUpO1xyXG5cclxuXHRjb25zdCBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XHJcblxyXG5cclxuXHRjb25zdCBhZGp1c3RlZFBvcyA9cG9zID09PSAwID8gMCA6IGZpbmRGaXJzdE5vbk5ld2xpbmVCZWZvcmUoc3RhdGUsIHBvcyk7XHJcblx0Y29uc3QgY3Vyc29yID0gdHJlZS5jdXJzb3JBdChhZGp1c3RlZFBvcywgLTEpO1xyXG5cdFxyXG5cdGNvbnN0IGluQ29kZWJsb2NrID0gY3Vyc29yLm5hbWUuY29udGFpbnMoXCJjb2RlYmxvY2tcIik7XHJcblx0aWYgKCFpbkNvZGVibG9jaykge1xyXG5cdFx0cmV0dXJuIG51bGw7XHJcblx0fVxyXG5cclxuXHQvLyBsb2NhdGUgdGhlIHN0YXJ0IG9mIHRoZSBibG9ja1xyXG5cdGNvbnN0IGNvZGVibG9ja0JlZ2luID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkJhY2t3YXJkLCBcIkh5cGVyTUQtY29kZWJsb2NrX0h5cGVyTUQtY29kZWJsb2NrLWJlZ2luXCIpO1xyXG5cclxuXHRpZiAoY29kZWJsb2NrQmVnaW4gPT0gbnVsbCkge1xyXG5cdFx0Y29uc29sZS53YXJuKFwidW5hYmxlIHRvIGxvY2F0ZSBzdGFydCBvZiB0aGUgY29kZWJsb2NrIGV2ZW4gdGhvdWdoIGluc2lkZSBvbmVcIik7XHJcblx0XHRyZXR1cm4gXCJcIjtcclxuXHR9XHJcblxyXG5cdC8vIGV4dHJhY3QgdGhlIGxhbmd1YWdlXHJcblx0Ly8gY29kZWJsb2NrcyBtYXkgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYmFja3RpY2tzXHJcblx0Y29uc3QgbGFuZ3VhZ2UgPSBzdGF0ZS5zbGljZURvYyhjb2RlYmxvY2tCZWdpbi5mcm9tLCBjb2RlYmxvY2tCZWdpbi50bykucmVwbGFjZSgvYCsvLCBcIlwiKTtcclxuXHJcblx0cmV0dXJuIGxhbmd1YWdlO1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBNb2RlIHtcclxuXHR0ZXh0OiBib29sZWFuO1xyXG5cdGlubGluZU1hdGg6IGJvb2xlYW47XHJcblx0YmxvY2tNYXRoOiBib29sZWFuO1xyXG5cdGNvZGVNYXRoOiBib29sZWFuO1xyXG5cdGNvZGU6IGJvb2xlYW47XHJcblx0dGV4dEVudjogYm9vbGVhbjtcclxuXHJcblx0LyoqXHJcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgaW5zaWRlIGFuIGVxdWF0aW9uIGJvdW5kZWQgYnkgJCBvciAkJCBkZWxpbWV0ZXJzLlxyXG5cdCAqL1xyXG5cdGluRXF1YXRpb24oKTpib29sZWFuIHtcclxuXHRcdHJldHVybiB0aGlzLmlubGluZU1hdGggfHwgdGhpcy5ibG9ja01hdGg7XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBXaGV0aGVyIHRoZSBzdGF0ZSBpcyBpbiBhbnkgbWF0aCBtb2RlLlxyXG5cdCAqXHJcblx0ICogVGhlIGVxdWF0aW9uIG1heSBiZSBib3VuZGVkIGJ5ICQgb3IgJCQgZGVsaW1ldGVycywgb3IgaXQgbWF5IGJlIGFuIGVxdWF0aW9uIGluc2lkZSBhIGBtYXRoYCBjb2RlYmxvY2suXHJcblx0ICovXHJcblx0aW5NYXRoKCk6Ym9vbGVhbiB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbmxpbmVNYXRoIHx8IHRoaXMuYmxvY2tNYXRoIHx8IHRoaXMuY29kZU1hdGg7XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBXaGV0aGVyIHRoZSBzdGF0ZSBpcyBzdHJpY3RseSBpbiBtYXRoIG1vZGUuXHJcblx0ICpcclxuXHQgKiBSZXR1cm5zIGZhbHNlIHdoZW4gdGhlIHN0YXRlIGlzIHdpdGhpbiBtYXRoLCBidXQgaW5zaWRlIGEgdGV4dCBlbnZpcm9ubWVudCwgc3VjaCBhcyBcXHRleHR7fS5cclxuXHQgKi9cclxuXHRzdHJpY3RseUluTWF0aCgpOmJvb2xlYW4ge1xyXG5cdFx0cmV0dXJuIHRoaXMuaW5NYXRoKCkgJiYgIXRoaXMudGV4dEVudjtcclxuXHR9XHJcblxyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0dGhpcy50ZXh0ID0gZmFsc2U7XHJcblx0XHR0aGlzLmJsb2NrTWF0aCA9IGZhbHNlO1xyXG5cdFx0dGhpcy5pbmxpbmVNYXRoID0gZmFsc2U7XHJcblx0XHR0aGlzLmNvZGUgPSBmYWxzZTtcclxuXHRcdHRoaXMudGV4dEVudiA9IGZhbHNlO1xyXG5cdH1cclxuXHJcblx0aW52ZXJ0KCkge1xyXG5cdFx0dGhpcy50ZXh0ID0gIXRoaXMudGV4dDtcclxuXHRcdHRoaXMuYmxvY2tNYXRoID0gIXRoaXMuYmxvY2tNYXRoO1xyXG5cdFx0dGhpcy5pbmxpbmVNYXRoID0gIXRoaXMuaW5saW5lTWF0aDtcclxuXHRcdHRoaXMuY29kZU1hdGggPSAhdGhpcy5jb2RlTWF0aDtcclxuXHRcdHRoaXMuY29kZSA9ICF0aGlzLmNvZGU7XHJcblx0XHR0aGlzLnRleHRFbnYgPSAhdGhpcy50ZXh0RW52O1xyXG5cdH1cclxuXHJcblx0c3RhdGljIGZyb21Tb3VyY2Uoc291cmNlOiBzdHJpbmcpOiBNb2RlIHtcclxuXHRcdGNvbnN0IG1vZGUgPSBuZXcgTW9kZSgpO1xyXG5cclxuXHRcdGZvciAoY29uc3QgZmxhZ19jaGFyIG9mIHNvdXJjZSkge1xyXG5cdFx0XHRzd2l0Y2ggKGZsYWdfY2hhcikge1xyXG5cdFx0XHRcdGNhc2UgXCJtXCI6XHJcblx0XHRcdFx0XHRtb2RlLmJsb2NrTWF0aCA9IHRydWU7XHJcblx0XHRcdFx0XHRtb2RlLmlubGluZU1hdGggPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0Y2FzZSBcIm5cIjpcclxuXHRcdFx0XHRcdG1vZGUuaW5saW5lTWF0aCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwiTVwiOlxyXG5cdFx0XHRcdFx0bW9kZS5ibG9ja01hdGggPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0Y2FzZSBcInRcIjpcclxuXHRcdFx0XHRcdG1vZGUudGV4dCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwiY1wiOlxyXG5cdFx0XHRcdFx0bW9kZS5jb2RlID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cclxuXHRcdGlmICghKG1vZGUudGV4dCB8fFxyXG5cdFx0XHRtb2RlLmlubGluZU1hdGggfHxcclxuXHRcdFx0bW9kZS5ibG9ja01hdGggfHxcclxuXHRcdFx0bW9kZS5jb2RlTWF0aCB8fFxyXG5cdFx0XHRtb2RlLmNvZGUgfHxcclxuXHRcdFx0bW9kZS50ZXh0RW52KVxyXG5cdFx0KSB7XHJcblx0XHRcdC8vIGZvciBiYWNrd2FyZHMgY29tcGF0IHdlIG5lZWQgdG8gYXNzdW1lIHRoYXQgdGhpcyBpcyBhIGNhdGNoYWxsIG1vZGUgdGhlblxyXG5cdFx0XHRtb2RlLmludmVydCgpO1xyXG5cdFx0XHRyZXR1cm4gbW9kZTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gbW9kZTtcclxuXHR9XHJcbn0iXX0=