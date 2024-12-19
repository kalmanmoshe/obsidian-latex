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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zbmlwcGV0cy9vcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE1BQU0sT0FBTyxPQUFPO0lBQ25CLElBQUksQ0FBUTtJQUNaLFNBQVMsQ0FBVTtJQUNuQixLQUFLLENBQVU7SUFDZixjQUFjLENBQVU7SUFDeEIsTUFBTSxDQUFVO0lBRWhCO1FBQ0MsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQWM7UUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM5QixPQUFPLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdkMsS0FBSyxNQUFNLFNBQVMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNoQyxRQUFRLFNBQVMsRUFBRSxDQUFDO2dCQUNuQixLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ3pCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLE9BQU8sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO29CQUNyQixNQUFNO2dCQUNQLEtBQUssR0FBRztvQkFDUCxPQUFPLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztvQkFDOUIsTUFBTTtnQkFDUCxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7b0JBQ3RCLE1BQU07WUFDUixDQUFDO1FBQ0YsQ0FBQztR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O0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY2xhc3MgT3B0aW9ucyB7XG5cdG1vZGUhOiBNb2RlO1xuXHRhdXRvbWF0aWM6IGJvb2xlYW47XG5cdHJlZ2V4OiBib29sZWFuO1xuXHRvbldvcmRCb3VuZGFyeTogYm9vbGVhbjtcblx0dmlzdWFsOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMubW9kZSA9IG5ldyBNb2RlKCk7XG5cdFx0dGhpcy5hdXRvbWF0aWMgPSBmYWxzZTtcblx0XHR0aGlzLnJlZ2V4ID0gZmFsc2U7XG5cdFx0dGhpcy5vbldvcmRCb3VuZGFyeSA9IGZhbHNlO1xuXHRcdHRoaXMudmlzdWFsID0gZmFsc2U7XG5cdH1cblxuXHRzdGF0aWMgZnJvbVNvdXJjZShzb3VyY2U6IHN0cmluZyk6T3B0aW9ucyB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IG5ldyBPcHRpb25zKCk7XG5cdFx0b3B0aW9ucy5tb2RlID0gTW9kZS5mcm9tU291cmNlKHNvdXJjZSk7XG5cblx0XHRmb3IgKGNvbnN0IGZsYWdfY2hhciBvZiBzb3VyY2UpIHtcblx0XHRcdHN3aXRjaCAoZmxhZ19jaGFyKSB7XG5cdFx0XHRcdGNhc2UgXCJBXCI6XG5cdFx0XHRcdFx0b3B0aW9ucy5hdXRvbWF0aWMgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFwiclwiOlxuXHRcdFx0XHRcdG9wdGlvbnMucmVnZXggPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFwid1wiOlxuXHRcdFx0XHRcdG9wdGlvbnMub25Xb3JkQm91bmRhcnkgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFwidlwiOlxuXHRcdFx0XHRcdG9wdGlvbnMudmlzdWFsID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW9kZSB7XG5cdHRleHQ6IGJvb2xlYW47XG5cdGlubGluZU1hdGg6IGJvb2xlYW47XG5cdGJsb2NrTWF0aDogYm9vbGVhbjtcblx0Y29kZU1hdGg6IGJvb2xlYW47XG5cdGNvZGU6IGJvb2xlYW47XG5cdHRleHRFbnY6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIGluc2lkZSBhbiBlcXVhdGlvbiBib3VuZGVkIGJ5ICQgb3IgJCQgZGVsaW1ldGVycy5cblx0ICovXG5cdGluRXF1YXRpb24oKTpib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbmxpbmVNYXRoIHx8IHRoaXMuYmxvY2tNYXRoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIGluIGFueSBtYXRoIG1vZGUuXG5cdCAqXG5cdCAqIFRoZSBlcXVhdGlvbiBtYXkgYmUgYm91bmRlZCBieSAkIG9yICQkIGRlbGltZXRlcnMsIG9yIGl0IG1heSBiZSBhbiBlcXVhdGlvbiBpbnNpZGUgYSBgbWF0aGAgY29kZWJsb2NrLlxuXHQgKi9cblx0aW5NYXRoKCk6Ym9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lTWF0aCB8fCB0aGlzLmJsb2NrTWF0aCB8fCB0aGlzLmNvZGVNYXRoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIHN0cmljdGx5IGluIG1hdGggbW9kZS5cblx0ICpcblx0ICogUmV0dXJucyBmYWxzZSB3aGVuIHRoZSBzdGF0ZSBpcyB3aXRoaW4gbWF0aCwgYnV0IGluc2lkZSBhIHRleHQgZW52aXJvbm1lbnQsIHN1Y2ggYXMgXFx0ZXh0e30uXG5cdCAqL1xuXHRpc250SW5UZXh0KCl7XG5cdFx0cmV0dXJuICF0aGlzLnRleHQmJiF0aGlzLnRleHRFbnZcblx0fVxuXHRzdHJpY3RseUluTWF0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy5pbk1hdGgoKSAmJiAhdGhpcy50ZXh0RW52O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy50ZXh0ID0gZmFsc2U7XG5cdFx0dGhpcy5ibG9ja01hdGggPSBmYWxzZTtcblx0XHR0aGlzLmlubGluZU1hdGggPSBmYWxzZTtcblx0XHR0aGlzLmNvZGUgPSBmYWxzZTtcblx0XHR0aGlzLnRleHRFbnYgPSBmYWxzZTtcblx0fVxuXG5cdGludmVydCgpIHtcblx0XHR0aGlzLnRleHQgPSAhdGhpcy50ZXh0O1xuXHRcdHRoaXMuYmxvY2tNYXRoID0gIXRoaXMuYmxvY2tNYXRoO1xuXHRcdHRoaXMuaW5saW5lTWF0aCA9ICF0aGlzLmlubGluZU1hdGg7XG5cdFx0dGhpcy5jb2RlTWF0aCA9ICF0aGlzLmNvZGVNYXRoO1xuXHRcdHRoaXMuY29kZSA9ICF0aGlzLmNvZGU7XG5cdFx0dGhpcy50ZXh0RW52ID0gIXRoaXMudGV4dEVudjtcblx0fVxuXG5cdHN0YXRpYyBmcm9tU291cmNlKHNvdXJjZTogc3RyaW5nKTogTW9kZSB7XG5cdFx0Y29uc3QgbW9kZSA9IG5ldyBNb2RlKCk7XG5cblx0XHRmb3IgKGNvbnN0IGZsYWdfY2hhciBvZiBzb3VyY2UpIHtcblx0XHRcdHN3aXRjaCAoZmxhZ19jaGFyKSB7XG5cdFx0XHRcdGNhc2UgXCJtXCI6XG5cdFx0XHRcdFx0bW9kZS5ibG9ja01hdGggPSB0cnVlO1xuXHRcdFx0XHRcdG1vZGUuaW5saW5lTWF0aCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJuXCI6XG5cdFx0XHRcdFx0bW9kZS5pbmxpbmVNYXRoID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBcIk1cIjpcblx0XHRcdFx0XHRtb2RlLmJsb2NrTWF0aCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgXCJ0XCI6XG5cdFx0XHRcdFx0bW9kZS50ZXh0ID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBcImNcIjpcblx0XHRcdFx0XHRtb2RlLmNvZGUgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0aWYgKCEobW9kZS50ZXh0IHx8XG5cdFx0XHRtb2RlLmlubGluZU1hdGggfHxcblx0XHRcdG1vZGUuYmxvY2tNYXRoIHx8XG5cdFx0XHRtb2RlLmNvZGVNYXRoIHx8XG5cdFx0XHRtb2RlLmNvZGUgfHxcblx0XHRcdG1vZGUudGV4dEVudilcblx0XHQpIHtcblx0XHRcdC8vIGZvciBiYWNrd2FyZHMgY29tcGF0IHdlIG5lZWQgdG8gYXNzdW1lIHRoYXQgdGhpcyBpcyBhIGNhdGNoYWxsIG1vZGUgdGhlblxuXHRcdFx0bW9kZS5pbnZlcnQoKTtcblx0XHRcdHJldHVybiBtb2RlO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlO1xuXHR9XG59XG4iXX0=