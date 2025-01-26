export class Options {
    mode;
    automatic;
    regex;
    onWordBoundary;
    visual;
    constructor() {
        this.mode = new Mode();
        this.automatic = false;
        this.regex = false;
        this.onWordBoundary = false;
        this.visual = false;
    }
    static fromSource(source) {
        const options = new Options();
        options.mode = Mode.fromSource(source);
        for (const flag_char of source) {
            switch (flag_char) {
                case "A":
                    options.automatic = true;
                    break;
                case "r":
                    options.regex = true;
                    break;
                case "w":
                    options.onWordBoundary = true;
                    break;
                case "v":
                    options.visual = true;
                    break;
            }
        }
        return options;
    }
}
export class Mode {
    text;
    html;
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
    isntInText() {
        return !this.text && !this.textEnv;
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zbmlwcGV0cy9vcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE1BQU0sT0FBTyxPQUFPO0lBQ25CLElBQUksQ0FBUTtJQUNaLFNBQVMsQ0FBVTtJQUNuQixLQUFLLENBQVU7SUFDZixjQUFjLENBQVU7SUFDeEIsTUFBTSxDQUFVO0lBRWhCO1FBQ0MsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQWM7UUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM5QixPQUFPLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdkMsS0FBSyxNQUFNLFNBQVMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNoQyxRQUFRLFNBQVMsRUFBRSxDQUFDO2dCQUNuQixLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ3pCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLE9BQU8sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO29CQUNyQixNQUFNO2dCQUNQLEtBQUssR0FBRztvQkFDUCxPQUFPLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztvQkFDOUIsTUFBTTtnQkFDUCxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7b0JBQ3RCLE1BQU07WUFDUixDQUFDO1FBQ0YsQ0FBQztR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LENBQUM7SUFDYixDQUFDO0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY2xhc3MgT3B0aW9ucyB7XHJcblx0bW9kZSE6IE1vZGU7XHJcblx0YXV0b21hdGljOiBib29sZWFuO1xyXG5cdHJlZ2V4OiBib29sZWFuO1xyXG5cdG9uV29yZEJvdW5kYXJ5OiBib29sZWFuO1xyXG5cdHZpc3VhbDogYm9vbGVhbjtcclxuXHJcblx0Y29uc3RydWN0b3IoKSB7XHJcblx0XHR0aGlzLm1vZGUgPSBuZXcgTW9kZSgpO1xyXG5cdFx0dGhpcy5hdXRvbWF0aWMgPSBmYWxzZTtcclxuXHRcdHRoaXMucmVnZXggPSBmYWxzZTtcclxuXHRcdHRoaXMub25Xb3JkQm91bmRhcnkgPSBmYWxzZTtcclxuXHRcdHRoaXMudmlzdWFsID0gZmFsc2U7XHJcblx0fVxyXG5cclxuXHRzdGF0aWMgZnJvbVNvdXJjZShzb3VyY2U6IHN0cmluZyk6T3B0aW9ucyB7XHJcblx0XHRjb25zdCBvcHRpb25zID0gbmV3IE9wdGlvbnMoKTtcclxuXHRcdG9wdGlvbnMubW9kZSA9IE1vZGUuZnJvbVNvdXJjZShzb3VyY2UpO1xyXG5cclxuXHRcdGZvciAoY29uc3QgZmxhZ19jaGFyIG9mIHNvdXJjZSkge1xyXG5cdFx0XHRzd2l0Y2ggKGZsYWdfY2hhcikge1xyXG5cdFx0XHRcdGNhc2UgXCJBXCI6XHJcblx0XHRcdFx0XHRvcHRpb25zLmF1dG9tYXRpYyA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwiclwiOlxyXG5cdFx0XHRcdFx0b3B0aW9ucy5yZWdleCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwid1wiOlxyXG5cdFx0XHRcdFx0b3B0aW9ucy5vbldvcmRCb3VuZGFyeSA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwidlwiOlxyXG5cdFx0XHRcdFx0b3B0aW9ucy52aXN1YWwgPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gb3B0aW9ucztcclxuXHR9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNb2RlIHtcclxuXHR0ZXh0OiBib29sZWFuO1xyXG5cdGh0bWw6IGJvb2xlYW47XHJcblx0aW5saW5lTWF0aDogYm9vbGVhbjtcclxuXHRibG9ja01hdGg6IGJvb2xlYW47XHJcblx0Y29kZU1hdGg6IGJvb2xlYW47XHJcblx0Y29kZTogYm9vbGVhbjtcclxuXHR0ZXh0RW52OiBib29sZWFuO1xyXG5cclxuXHQvKipcclxuXHQgKiBXaGV0aGVyIHRoZSBzdGF0ZSBpcyBpbnNpZGUgYW4gZXF1YXRpb24gYm91bmRlZCBieSAkIG9yICQkIGRlbGltZXRlcnMuXHJcblx0ICovXHJcblx0aW5FcXVhdGlvbigpOmJvb2xlYW4ge1xyXG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lTWF0aCB8fCB0aGlzLmJsb2NrTWF0aDtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIGluIGFueSBtYXRoIG1vZGUuXHJcblx0ICpcclxuXHQgKiBUaGUgZXF1YXRpb24gbWF5IGJlIGJvdW5kZWQgYnkgJCBvciAkJCBkZWxpbWV0ZXJzLCBvciBpdCBtYXkgYmUgYW4gZXF1YXRpb24gaW5zaWRlIGEgYG1hdGhgIGNvZGVibG9jay5cclxuXHQgKi9cclxuXHRpbk1hdGgoKTpib29sZWFuIHtcclxuXHRcdHJldHVybiB0aGlzLmlubGluZU1hdGggfHwgdGhpcy5ibG9ja01hdGggfHwgdGhpcy5jb2RlTWF0aDtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIHN0cmljdGx5IGluIG1hdGggbW9kZS5cclxuXHQgKlxyXG5cdCAqIFJldHVybnMgZmFsc2Ugd2hlbiB0aGUgc3RhdGUgaXMgd2l0aGluIG1hdGgsIGJ1dCBpbnNpZGUgYSB0ZXh0IGVudmlyb25tZW50LCBzdWNoIGFzIFxcdGV4dHt9LlxyXG5cdCAqL1xyXG5cdGlzbnRJblRleHQoKXtcclxuXHRcdHJldHVybiAhdGhpcy50ZXh0JiYhdGhpcy50ZXh0RW52XHJcblx0fVxyXG5cdHN0cmljdGx5SW5NYXRoKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuaW5NYXRoKCkgJiYgIXRoaXMudGV4dEVudjtcclxuXHR9XHJcblxyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0dGhpcy50ZXh0ID0gZmFsc2U7XHJcblx0XHR0aGlzLmJsb2NrTWF0aCA9IGZhbHNlO1xyXG5cdFx0dGhpcy5pbmxpbmVNYXRoID0gZmFsc2U7XHJcblx0XHR0aGlzLmNvZGUgPSBmYWxzZTtcclxuXHRcdHRoaXMudGV4dEVudiA9IGZhbHNlO1xyXG5cdH1cclxuXHJcblx0aW52ZXJ0KCkge1xyXG5cdFx0dGhpcy50ZXh0ID0gIXRoaXMudGV4dDtcclxuXHRcdHRoaXMuYmxvY2tNYXRoID0gIXRoaXMuYmxvY2tNYXRoO1xyXG5cdFx0dGhpcy5pbmxpbmVNYXRoID0gIXRoaXMuaW5saW5lTWF0aDtcclxuXHRcdHRoaXMuY29kZU1hdGggPSAhdGhpcy5jb2RlTWF0aDtcclxuXHRcdHRoaXMuY29kZSA9ICF0aGlzLmNvZGU7XHJcblx0XHR0aGlzLnRleHRFbnYgPSAhdGhpcy50ZXh0RW52O1xyXG5cdH1cclxuXHJcblx0c3RhdGljIGZyb21Tb3VyY2Uoc291cmNlOiBzdHJpbmcpOiBNb2RlIHtcclxuXHRcdGNvbnN0IG1vZGUgPSBuZXcgTW9kZSgpO1xyXG5cclxuXHRcdGZvciAoY29uc3QgZmxhZ19jaGFyIG9mIHNvdXJjZSkge1xyXG5cdFx0XHRzd2l0Y2ggKGZsYWdfY2hhcikge1xyXG5cdFx0XHRcdGNhc2UgXCJtXCI6XHJcblx0XHRcdFx0XHRtb2RlLmJsb2NrTWF0aCA9IHRydWU7XHJcblx0XHRcdFx0XHRtb2RlLmlubGluZU1hdGggPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0Y2FzZSBcIm5cIjpcclxuXHRcdFx0XHRcdG1vZGUuaW5saW5lTWF0aCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwiTVwiOlxyXG5cdFx0XHRcdFx0bW9kZS5ibG9ja01hdGggPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0Y2FzZSBcInRcIjpcclxuXHRcdFx0XHRcdG1vZGUudGV4dCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwiY1wiOlxyXG5cdFx0XHRcdFx0bW9kZS5jb2RlID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cclxuXHRcdGlmICghKG1vZGUudGV4dCB8fFxyXG5cdFx0XHRtb2RlLmlubGluZU1hdGggfHxcclxuXHRcdFx0bW9kZS5ibG9ja01hdGggfHxcclxuXHRcdFx0bW9kZS5jb2RlTWF0aCB8fFxyXG5cdFx0XHRtb2RlLmNvZGUgfHxcclxuXHRcdFx0bW9kZS50ZXh0RW52KVxyXG5cdFx0KSB7XHJcblx0XHRcdC8vIGZvciBiYWNrd2FyZHMgY29tcGF0IHdlIG5lZWQgdG8gYXNzdW1lIHRoYXQgdGhpcyBpcyBhIGNhdGNoYWxsIG1vZGUgdGhlblxyXG5cdFx0XHRtb2RlLmludmVydCgpO1xyXG5cdFx0XHRyZXR1cm4gbW9kZTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gbW9kZTtcclxuXHR9XHJcbn1cclxuIl19