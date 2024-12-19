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
    inlineMath;
    blockMath;
    codeMath;
    translate;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zbmlwcGV0cy9vcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE1BQU0sT0FBTyxPQUFPO0lBQ25CLElBQUksQ0FBUTtJQUNaLFNBQVMsQ0FBVTtJQUNuQixLQUFLLENBQVU7SUFDZixjQUFjLENBQVU7SUFDeEIsTUFBTSxDQUFVO0lBRWhCO1FBQ0MsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQWM7UUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM5QixPQUFPLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdkMsS0FBSyxNQUFNLFNBQVMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNoQyxRQUFRLFNBQVMsRUFBRSxDQUFDO2dCQUNuQixLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ3pCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLE9BQU8sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO29CQUNyQixNQUFNO2dCQUNQLEtBQUssR0FBRztvQkFDUCxPQUFPLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztvQkFDOUIsTUFBTTtnQkFDUCxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7b0JBQ3RCLE1BQU07WUFDUixDQUFDO1FBQ0YsQ0FBQztR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SSxDQUFDO0lBQ2IsQ0FBQztDQUNEIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNsYXNzIE9wdGlvbnMge1xuXHRtb2RlITogTW9kZTtcblx0YXV0b21hdGljOiBib29sZWFuO1xuXHRyZWdleDogYm9vbGVhbjtcblx0b25Xb3JkQm91bmRhcnk6IGJvb2xlYW47XG5cdHZpc3VhbDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLm1vZGUgPSBuZXcgTW9kZSgpO1xuXHRcdHRoaXMuYXV0b21hdGljID0gZmFsc2U7XG5cdFx0dGhpcy5yZWdleCA9IGZhbHNlO1xuXHRcdHRoaXMub25Xb3JkQm91bmRhcnkgPSBmYWxzZTtcblx0XHR0aGlzLnZpc3VhbCA9IGZhbHNlO1xuXHR9XG5cblx0c3RhdGljIGZyb21Tb3VyY2Uoc291cmNlOiBzdHJpbmcpOk9wdGlvbnMge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBuZXcgT3B0aW9ucygpO1xuXHRcdG9wdGlvbnMubW9kZSA9IE1vZGUuZnJvbVNvdXJjZShzb3VyY2UpO1xuXG5cdFx0Zm9yIChjb25zdCBmbGFnX2NoYXIgb2Ygc291cmNlKSB7XG5cdFx0XHRzd2l0Y2ggKGZsYWdfY2hhcikge1xuXHRcdFx0XHRjYXNlIFwiQVwiOlxuXHRcdFx0XHRcdG9wdGlvbnMuYXV0b21hdGljID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBcInJcIjpcblx0XHRcdFx0XHRvcHRpb25zLnJlZ2V4ID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBcIndcIjpcblx0XHRcdFx0XHRvcHRpb25zLm9uV29yZEJvdW5kYXJ5ID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBcInZcIjpcblx0XHRcdFx0XHRvcHRpb25zLnZpc3VhbCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGUge1xuXHR0ZXh0OiBib29sZWFuO1xuXHRpbmxpbmVNYXRoOiBib29sZWFuO1xuXHRibG9ja01hdGg6IGJvb2xlYW47XG5cdGNvZGVNYXRoOiBib29sZWFuO1xuXHR0cmFuc2xhdGU6IGJvb2xlYW5cblx0Y29kZTogYm9vbGVhbjtcblx0dGV4dEVudjogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgaW5zaWRlIGFuIGVxdWF0aW9uIGJvdW5kZWQgYnkgJCBvciAkJCBkZWxpbWV0ZXJzLlxuXHQgKi9cblx0aW5FcXVhdGlvbigpOmJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlubGluZU1hdGggfHwgdGhpcy5ibG9ja01hdGg7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgaW4gYW55IG1hdGggbW9kZS5cblx0ICpcblx0ICogVGhlIGVxdWF0aW9uIG1heSBiZSBib3VuZGVkIGJ5ICQgb3IgJCQgZGVsaW1ldGVycywgb3IgaXQgbWF5IGJlIGFuIGVxdWF0aW9uIGluc2lkZSBhIGBtYXRoYCBjb2RlYmxvY2suXG5cdCAqL1xuXHRpbk1hdGgoKTpib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbmxpbmVNYXRoIHx8IHRoaXMuYmxvY2tNYXRoIHx8IHRoaXMuY29kZU1hdGg7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgc3RyaWN0bHkgaW4gbWF0aCBtb2RlLlxuXHQgKlxuXHQgKiBSZXR1cm5zIGZhbHNlIHdoZW4gdGhlIHN0YXRlIGlzIHdpdGhpbiBtYXRoLCBidXQgaW5zaWRlIGEgdGV4dCBlbnZpcm9ubWVudCwgc3VjaCBhcyBcXHRleHR7fS5cblx0ICovXG5cdGlzbnRJblRleHQoKXtcblx0XHRyZXR1cm4gIXRoaXMudGV4dCYmIXRoaXMudGV4dEVudlxuXHR9XG5cdHN0cmljdGx5SW5NYXRoKCk6Ym9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5NYXRoKCkgJiYgIXRoaXMudGV4dEVudjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMudGV4dCA9IGZhbHNlO1xuXHRcdHRoaXMuYmxvY2tNYXRoID0gZmFsc2U7XG5cdFx0dGhpcy5pbmxpbmVNYXRoID0gZmFsc2U7XG5cdFx0dGhpcy5jb2RlID0gZmFsc2U7XG5cdFx0dGhpcy50ZXh0RW52ID0gZmFsc2U7XG5cdH1cblxuXHRpbnZlcnQoKSB7XG5cdFx0dGhpcy50ZXh0ID0gIXRoaXMudGV4dDtcblx0XHR0aGlzLmJsb2NrTWF0aCA9ICF0aGlzLmJsb2NrTWF0aDtcblx0XHR0aGlzLmlubGluZU1hdGggPSAhdGhpcy5pbmxpbmVNYXRoO1xuXHRcdHRoaXMuY29kZU1hdGggPSAhdGhpcy5jb2RlTWF0aDtcblx0XHR0aGlzLmNvZGUgPSAhdGhpcy5jb2RlO1xuXHRcdHRoaXMudGV4dEVudiA9ICF0aGlzLnRleHRFbnY7XG5cdH1cblxuXHRzdGF0aWMgZnJvbVNvdXJjZShzb3VyY2U6IHN0cmluZyk6IE1vZGUge1xuXHRcdGNvbnN0IG1vZGUgPSBuZXcgTW9kZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBmbGFnX2NoYXIgb2Ygc291cmNlKSB7XG5cdFx0XHRzd2l0Y2ggKGZsYWdfY2hhcikge1xuXHRcdFx0XHRjYXNlIFwibVwiOlxuXHRcdFx0XHRcdG1vZGUuYmxvY2tNYXRoID0gdHJ1ZTtcblx0XHRcdFx0XHRtb2RlLmlubGluZU1hdGggPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFwiblwiOlxuXHRcdFx0XHRcdG1vZGUuaW5saW5lTWF0aCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJNXCI6XG5cdFx0XHRcdFx0bW9kZS5ibG9ja01hdGggPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFwidFwiOlxuXHRcdFx0XHRcdG1vZGUudGV4dCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJjXCI6XG5cdFx0XHRcdFx0bW9kZS5jb2RlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdGlmICghKG1vZGUudGV4dCB8fFxuXHRcdFx0bW9kZS5pbmxpbmVNYXRoIHx8XG5cdFx0XHRtb2RlLmJsb2NrTWF0aCB8fFxuXHRcdFx0bW9kZS5jb2RlTWF0aCB8fFxuXHRcdFx0bW9kZS5jb2RlIHx8XG5cdFx0XHRtb2RlLnRleHRFbnYpXG5cdFx0KSB7XG5cdFx0XHQvLyBmb3IgYmFja3dhcmRzIGNvbXBhdCB3ZSBuZWVkIHRvIGFzc3VtZSB0aGF0IHRoaXMgaXMgYSBjYXRjaGFsbCBtb2RlIHRoZW5cblx0XHRcdG1vZGUuaW52ZXJ0KCk7XG5cdFx0XHRyZXR1cm4gbW9kZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZTtcblx0fVxufVxuIl19