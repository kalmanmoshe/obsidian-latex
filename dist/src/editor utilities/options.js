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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3IgdXRpbGl0aWVzL29wdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxPQUFPLE9BQU87SUFDbkIsSUFBSSxDQUFRO0lBQ1osU0FBUyxDQUFVO0lBQ25CLEtBQUssQ0FBVTtJQUNmLGNBQWMsQ0FBVTtJQUN4QixNQUFNLENBQVU7SUFFaEI7UUFDQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDdkIsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDNUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDckIsQ0FBQztJQUVELE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBYztRQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzlCLE9BQU8sQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV2QyxLQUFLLE1BQU0sU0FBUyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLFFBQVEsU0FBUyxFQUFFLENBQUM7Z0JBQ25CLEtBQUssR0FBRztvQkFDUCxPQUFPLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztvQkFDekIsTUFBTTtnQkFDUCxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7b0JBQ3JCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLE9BQU8sQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO29CQUM5QixNQUFNO2dCQUNQLEtBQUssR0FBRztvQkFDUCxPQUFPLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztvQkFDdEIsTUFBTTtZQUNSLENBQUM7UUFD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YXRpYzogYm9vbGVhbjtcblx0cmVnZXg6IGJvb2xlYW47XG5cdG9uV29yZEJvdW5kYXJ5OiBib29sZWFuO1xuXHR2aXN1YWw6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5tb2RlID0gbmV3IE1vZGUoKTtcblx0XHR0aGlzLmF1dG9tYXRpYyA9IGZhbHNlO1xuXHRcdHRoaXMucmVnZXggPSBmYWxzZTtcblx0XHR0aGlzLm9uV29yZEJvdW5kYXJ5ID0gZmFsc2U7XG5cdFx0dGhpcy52aXN1YWwgPSBmYWxzZTtcblx0fVxuXG5cdHN0YXRpYyBmcm9tU291cmNlKHNvdXJjZTogc3RyaW5nKTpPcHRpb25zIHtcblx0XHRjb25zdCBvcHRpb25zID0gbmV3IE9wdGlvbnMoKTtcblx0XHRvcHRpb25zLm1vZGUgPSBNb2RlLmZyb21Tb3VyY2Uoc291cmNlKTtcblxuXHRcdGZvciAoY29uc3QgZmxhZ19jaGFyIG9mIHNvdXJjZSkge1xuXHRcdFx0c3dpdGNoIChmbGFnX2NoYXIpIHtcblx0XHRcdFx0Y2FzZSBcIkFcIjpcblx0XHRcdFx0XHRvcHRpb25zLmF1dG9tYXRpYyA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJyXCI6XG5cdFx0XHRcdFx0b3B0aW9ucy5yZWdleCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJ3XCI6XG5cdFx0XHRcdFx0b3B0aW9ucy5vbldvcmRCb3VuZGFyeSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJ2XCI6XG5cdFx0XHRcdFx0b3B0aW9ucy52aXN1YWwgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlIHtcblx0dGV4dDogYm9vbGVhbjtcblx0aW5saW5lTWF0aDogYm9vbGVhbjtcblx0YmxvY2tNYXRoOiBib29sZWFuO1xuXHRjb2RlTWF0aDogYm9vbGVhbjtcblx0Y29kZTogYm9vbGVhbjtcblx0dGV4dEVudjogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgaW5zaWRlIGFuIGVxdWF0aW9uIGJvdW5kZWQgYnkgJCBvciAkJCBkZWxpbWV0ZXJzLlxuXHQgKi9cblx0aW5FcXVhdGlvbigpOmJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlubGluZU1hdGggfHwgdGhpcy5ibG9ja01hdGg7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgaW4gYW55IG1hdGggbW9kZS5cblx0ICpcblx0ICogVGhlIGVxdWF0aW9uIG1heSBiZSBib3VuZGVkIGJ5ICQgb3IgJCQgZGVsaW1ldGVycywgb3IgaXQgbWF5IGJlIGFuIGVxdWF0aW9uIGluc2lkZSBhIGBtYXRoYCBjb2RlYmxvY2suXG5cdCAqL1xuXHRpbk1hdGgoKTpib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbmxpbmVNYXRoIHx8IHRoaXMuYmxvY2tNYXRoIHx8IHRoaXMuY29kZU1hdGg7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgc3RyaWN0bHkgaW4gbWF0aCBtb2RlLlxuXHQgKlxuXHQgKiBSZXR1cm5zIGZhbHNlIHdoZW4gdGhlIHN0YXRlIGlzIHdpdGhpbiBtYXRoLCBidXQgaW5zaWRlIGEgdGV4dCBlbnZpcm9ubWVudCwgc3VjaCBhcyBcXHRleHR7fS5cblx0ICovXG5cdHN0cmljdGx5SW5NYXRoKCk6Ym9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5NYXRoKCkgJiYgIXRoaXMudGV4dEVudjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMudGV4dCA9IGZhbHNlO1xuXHRcdHRoaXMuYmxvY2tNYXRoID0gZmFsc2U7XG5cdFx0dGhpcy5pbmxpbmVNYXRoID0gZmFsc2U7XG5cdFx0dGhpcy5jb2RlID0gZmFsc2U7XG5cdFx0dGhpcy50ZXh0RW52ID0gZmFsc2U7XG5cdH1cblxuXHRpbnZlcnQoKSB7XG5cdFx0dGhpcy50ZXh0ID0gIXRoaXMudGV4dDtcblx0XHR0aGlzLmJsb2NrTWF0aCA9ICF0aGlzLmJsb2NrTWF0aDtcblx0XHR0aGlzLmlubGluZU1hdGggPSAhdGhpcy5pbmxpbmVNYXRoO1xuXHRcdHRoaXMuY29kZU1hdGggPSAhdGhpcy5jb2RlTWF0aDtcblx0XHR0aGlzLmNvZGUgPSAhdGhpcy5jb2RlO1xuXHRcdHRoaXMudGV4dEVudiA9ICF0aGlzLnRleHRFbnY7XG5cdH1cblxuXHRzdGF0aWMgZnJvbVNvdXJjZShzb3VyY2U6IHN0cmluZyk6IE1vZGUge1xuXHRcdGNvbnN0IG1vZGUgPSBuZXcgTW9kZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBmbGFnX2NoYXIgb2Ygc291cmNlKSB7XG5cdFx0XHRzd2l0Y2ggKGZsYWdfY2hhcikge1xuXHRcdFx0XHRjYXNlIFwibVwiOlxuXHRcdFx0XHRcdG1vZGUuYmxvY2tNYXRoID0gdHJ1ZTtcblx0XHRcdFx0XHRtb2RlLmlubGluZU1hdGggPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFwiblwiOlxuXHRcdFx0XHRcdG1vZGUuaW5saW5lTWF0aCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJNXCI6XG5cdFx0XHRcdFx0bW9kZS5ibG9ja01hdGggPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFwidFwiOlxuXHRcdFx0XHRcdG1vZGUudGV4dCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJjXCI6XG5cdFx0XHRcdFx0bW9kZS5jb2RlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdGlmICghKG1vZGUudGV4dCB8fFxuXHRcdFx0bW9kZS5pbmxpbmVNYXRoIHx8XG5cdFx0XHRtb2RlLmJsb2NrTWF0aCB8fFxuXHRcdFx0bW9kZS5jb2RlTWF0aCB8fFxuXHRcdFx0bW9kZS5jb2RlIHx8XG5cdFx0XHRtb2RlLnRleHRFbnYpXG5cdFx0KSB7XG5cdFx0XHQvLyBmb3IgYmFja3dhcmRzIGNvbXBhdCB3ZSBuZWVkIHRvIGFzc3VtZSB0aGF0IHRoaXMgaXMgYSBjYXRjaGFsbCBtb2RlIHRoZW5cblx0XHRcdG1vZGUuaW52ZXJ0KCk7XG5cdFx0XHRyZXR1cm4gbW9kZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZTtcblx0fVxufSJdfQ==