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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3IgdXRpbGl0aWVzL29wdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxPQUFPLE9BQU87SUFDbkIsSUFBSSxDQUFRO0lBQ1osU0FBUyxDQUFVO0lBQ25CLEtBQUssQ0FBVTtJQUNmLGNBQWMsQ0FBVTtJQUN4QixNQUFNLENBQVU7SUFFaEI7UUFDQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDdkIsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDNUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDckIsQ0FBQztJQUVELE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBYztRQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzlCLE9BQU8sQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV2QyxLQUFLLE1BQU0sU0FBUyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLFFBQVEsU0FBUyxFQUFFLENBQUM7Z0JBQ25CLEtBQUssR0FBRztvQkFDUCxPQUFPLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztvQkFDekIsTUFBTTtnQkFDUCxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7b0JBQ3JCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLE9BQU8sQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO29CQUM5QixNQUFNO2dCQUNQLEtBQUssR0FBRztvQkFDUCxPQUFPLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztvQkFDdEIsTUFBTTtZQUNSLENBQUM7UUFD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dXRvbWF0aWM6IGJvb2xlYW47XHJcblx0cmVnZXg6IGJvb2xlYW47XHJcblx0b25Xb3JkQm91bmRhcnk6IGJvb2xlYW47XHJcblx0dmlzdWFsOiBib29sZWFuO1xyXG5cclxuXHRjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHRoaXMubW9kZSA9IG5ldyBNb2RlKCk7XHJcblx0XHR0aGlzLmF1dG9tYXRpYyA9IGZhbHNlO1xyXG5cdFx0dGhpcy5yZWdleCA9IGZhbHNlO1xyXG5cdFx0dGhpcy5vbldvcmRCb3VuZGFyeSA9IGZhbHNlO1xyXG5cdFx0dGhpcy52aXN1YWwgPSBmYWxzZTtcclxuXHR9XHJcblxyXG5cdHN0YXRpYyBmcm9tU291cmNlKHNvdXJjZTogc3RyaW5nKTpPcHRpb25zIHtcclxuXHRcdGNvbnN0IG9wdGlvbnMgPSBuZXcgT3B0aW9ucygpO1xyXG5cdFx0b3B0aW9ucy5tb2RlID0gTW9kZS5mcm9tU291cmNlKHNvdXJjZSk7XHJcblxyXG5cdFx0Zm9yIChjb25zdCBmbGFnX2NoYXIgb2Ygc291cmNlKSB7XHJcblx0XHRcdHN3aXRjaCAoZmxhZ19jaGFyKSB7XHJcblx0XHRcdFx0Y2FzZSBcIkFcIjpcclxuXHRcdFx0XHRcdG9wdGlvbnMuYXV0b21hdGljID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJyXCI6XHJcblx0XHRcdFx0XHRvcHRpb25zLnJlZ2V4ID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJ3XCI6XHJcblx0XHRcdFx0XHRvcHRpb25zLm9uV29yZEJvdW5kYXJ5ID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJ2XCI6XHJcblx0XHRcdFx0XHRvcHRpb25zLnZpc3VhbCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBvcHRpb25zO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE1vZGUge1xyXG5cdHRleHQ6IGJvb2xlYW47XHJcblx0aW5saW5lTWF0aDogYm9vbGVhbjtcclxuXHRibG9ja01hdGg6IGJvb2xlYW47XHJcblx0Y29kZU1hdGg6IGJvb2xlYW47XHJcblx0Y29kZTogYm9vbGVhbjtcclxuXHR0ZXh0RW52OiBib29sZWFuO1xyXG5cclxuXHQvKipcclxuXHQgKiBXaGV0aGVyIHRoZSBzdGF0ZSBpcyBpbnNpZGUgYW4gZXF1YXRpb24gYm91bmRlZCBieSAkIG9yICQkIGRlbGltZXRlcnMuXHJcblx0ICovXHJcblx0aW5FcXVhdGlvbigpOmJvb2xlYW4ge1xyXG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lTWF0aCB8fCB0aGlzLmJsb2NrTWF0aDtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIGluIGFueSBtYXRoIG1vZGUuXHJcblx0ICpcclxuXHQgKiBUaGUgZXF1YXRpb24gbWF5IGJlIGJvdW5kZWQgYnkgJCBvciAkJCBkZWxpbWV0ZXJzLCBvciBpdCBtYXkgYmUgYW4gZXF1YXRpb24gaW5zaWRlIGEgYG1hdGhgIGNvZGVibG9jay5cclxuXHQgKi9cclxuXHRpbk1hdGgoKTpib29sZWFuIHtcclxuXHRcdHJldHVybiB0aGlzLmlubGluZU1hdGggfHwgdGhpcy5ibG9ja01hdGggfHwgdGhpcy5jb2RlTWF0aDtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIHN0cmljdGx5IGluIG1hdGggbW9kZS5cclxuXHQgKlxyXG5cdCAqIFJldHVybnMgZmFsc2Ugd2hlbiB0aGUgc3RhdGUgaXMgd2l0aGluIG1hdGgsIGJ1dCBpbnNpZGUgYSB0ZXh0IGVudmlyb25tZW50LCBzdWNoIGFzIFxcdGV4dHt9LlxyXG5cdCAqL1xyXG5cdHN0cmljdGx5SW5NYXRoKCk6Ym9vbGVhbiB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbk1hdGgoKSAmJiAhdGhpcy50ZXh0RW52O1xyXG5cdH1cclxuXHJcblx0Y29uc3RydWN0b3IoKSB7XHJcblx0XHR0aGlzLnRleHQgPSBmYWxzZTtcclxuXHRcdHRoaXMuYmxvY2tNYXRoID0gZmFsc2U7XHJcblx0XHR0aGlzLmlubGluZU1hdGggPSBmYWxzZTtcclxuXHRcdHRoaXMuY29kZSA9IGZhbHNlO1xyXG5cdFx0dGhpcy50ZXh0RW52ID0gZmFsc2U7XHJcblx0fVxyXG5cclxuXHRpbnZlcnQoKSB7XHJcblx0XHR0aGlzLnRleHQgPSAhdGhpcy50ZXh0O1xyXG5cdFx0dGhpcy5ibG9ja01hdGggPSAhdGhpcy5ibG9ja01hdGg7XHJcblx0XHR0aGlzLmlubGluZU1hdGggPSAhdGhpcy5pbmxpbmVNYXRoO1xyXG5cdFx0dGhpcy5jb2RlTWF0aCA9ICF0aGlzLmNvZGVNYXRoO1xyXG5cdFx0dGhpcy5jb2RlID0gIXRoaXMuY29kZTtcclxuXHRcdHRoaXMudGV4dEVudiA9ICF0aGlzLnRleHRFbnY7XHJcblx0fVxyXG5cclxuXHRzdGF0aWMgZnJvbVNvdXJjZShzb3VyY2U6IHN0cmluZyk6IE1vZGUge1xyXG5cdFx0Y29uc3QgbW9kZSA9IG5ldyBNb2RlKCk7XHJcblxyXG5cdFx0Zm9yIChjb25zdCBmbGFnX2NoYXIgb2Ygc291cmNlKSB7XHJcblx0XHRcdHN3aXRjaCAoZmxhZ19jaGFyKSB7XHJcblx0XHRcdFx0Y2FzZSBcIm1cIjpcclxuXHRcdFx0XHRcdG1vZGUuYmxvY2tNYXRoID0gdHJ1ZTtcclxuXHRcdFx0XHRcdG1vZGUuaW5saW5lTWF0aCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwiblwiOlxyXG5cdFx0XHRcdFx0bW9kZS5pbmxpbmVNYXRoID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJNXCI6XHJcblx0XHRcdFx0XHRtb2RlLmJsb2NrTWF0aCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwidFwiOlxyXG5cdFx0XHRcdFx0bW9kZS50ZXh0ID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJjXCI6XHJcblx0XHRcdFx0XHRtb2RlLmNvZGUgPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblxyXG5cdFx0aWYgKCEobW9kZS50ZXh0IHx8XHJcblx0XHRcdG1vZGUuaW5saW5lTWF0aCB8fFxyXG5cdFx0XHRtb2RlLmJsb2NrTWF0aCB8fFxyXG5cdFx0XHRtb2RlLmNvZGVNYXRoIHx8XHJcblx0XHRcdG1vZGUuY29kZSB8fFxyXG5cdFx0XHRtb2RlLnRleHRFbnYpXHJcblx0XHQpIHtcclxuXHRcdFx0Ly8gZm9yIGJhY2t3YXJkcyBjb21wYXQgd2UgbmVlZCB0byBhc3N1bWUgdGhhdCB0aGlzIGlzIGEgY2F0Y2hhbGwgbW9kZSB0aGVuXHJcblx0XHRcdG1vZGUuaW52ZXJ0KCk7XHJcblx0XHRcdHJldHVybiBtb2RlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBtb2RlO1xyXG5cdH1cclxufSJdfQ==