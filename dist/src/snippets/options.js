export class Options {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zbmlwcGV0cy9vcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE1BQU0sT0FBTyxPQUFPO0lBT25CO1FBQ0MsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQWM7UUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM5QixPQUFPLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdkMsS0FBSyxNQUFNLFNBQVMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNoQyxRQUFRLFNBQVMsRUFBRSxDQUFDO2dCQUNuQixLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ3pCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLE9BQU8sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO29CQUNyQixNQUFNO2dCQUNQLEtBQUssR0FBRztvQkFDUCxPQUFPLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztvQkFDOUIsTUFBTTtnQkFDUCxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7b0JBQ3RCLE1BQU07WUFDUixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxJQUFJO0lBU2hCOztPQUVHO0lBQ0gsVUFBVTtRQUNULE9BQU8sSUFBSSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQzFDLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsTUFBTTtRQUNMLE9BQU8sSUFBSSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDM0QsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxVQUFVO1FBQ1QsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFBO0lBQ2pDLENBQUM7SUFDRCxjQUFjO1FBQ2IsT0FBTyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3ZDLENBQUM7SUFFRDtRQUNDLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO1FBQ2xCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO1FBQ2xCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO0lBQ3RCLENBQUM7SUFFRCxNQUFNO1FBQ0wsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDdkIsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7UUFDakMsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDbkMsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDL0IsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDdkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDOUIsQ0FBQztJQUVELE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBYztRQUMvQixNQUFNLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBRXhCLEtBQUssTUFBTSxTQUFTLElBQUksTUFBTSxFQUFFLENBQUM7WUFDaEMsUUFBUSxTQUFTLEVBQUUsQ0FBQztnQkFDbkIsS0FBSyxHQUFHO29CQUNQLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO29CQUN0QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztvQkFDdkIsTUFBTTtnQkFDUCxLQUFLLEdBQUc7b0JBQ1AsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBQ3ZCLE1BQU07Z0JBQ1AsS0FBSyxHQUFHO29CQUNQLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO29CQUN0QixNQUFNO2dCQUNQLEtBQUssR0FBRztvQkFDUCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztvQkFDakIsTUFBTTtnQkFDUCxLQUFLLEdBQUc7b0JBQ1AsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7b0JBQ2pCLE1BQU07WUFDUixDQUFDO1FBQ0YsQ0FBQztRQUdELElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJO1lBQ2QsSUFBSSxDQUFDLFVBQVU7WUFDZixJQUFJLENBQUMsU0FBUztZQUNkLElBQUksQ0FBQyxRQUFRO1lBQ2IsSUFBSSxDQUFDLElBQUk7WUFDVCxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQ1osQ0FBQztZQUNGLDJFQUEyRTtZQUMzRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDZCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjbGFzcyBPcHRpb25zIHtcclxuXHRtb2RlITogTW9kZTtcclxuXHRhdXRvbWF0aWM6IGJvb2xlYW47XHJcblx0cmVnZXg6IGJvb2xlYW47XHJcblx0b25Xb3JkQm91bmRhcnk6IGJvb2xlYW47XHJcblx0dmlzdWFsOiBib29sZWFuO1xyXG5cclxuXHRjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHRoaXMubW9kZSA9IG5ldyBNb2RlKCk7XHJcblx0XHR0aGlzLmF1dG9tYXRpYyA9IGZhbHNlO1xyXG5cdFx0dGhpcy5yZWdleCA9IGZhbHNlO1xyXG5cdFx0dGhpcy5vbldvcmRCb3VuZGFyeSA9IGZhbHNlO1xyXG5cdFx0dGhpcy52aXN1YWwgPSBmYWxzZTtcclxuXHR9XHJcblxyXG5cdHN0YXRpYyBmcm9tU291cmNlKHNvdXJjZTogc3RyaW5nKTpPcHRpb25zIHtcclxuXHRcdGNvbnN0IG9wdGlvbnMgPSBuZXcgT3B0aW9ucygpO1xyXG5cdFx0b3B0aW9ucy5tb2RlID0gTW9kZS5mcm9tU291cmNlKHNvdXJjZSk7XHJcblxyXG5cdFx0Zm9yIChjb25zdCBmbGFnX2NoYXIgb2Ygc291cmNlKSB7XHJcblx0XHRcdHN3aXRjaCAoZmxhZ19jaGFyKSB7XHJcblx0XHRcdFx0Y2FzZSBcIkFcIjpcclxuXHRcdFx0XHRcdG9wdGlvbnMuYXV0b21hdGljID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJyXCI6XHJcblx0XHRcdFx0XHRvcHRpb25zLnJlZ2V4ID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJ3XCI6XHJcblx0XHRcdFx0XHRvcHRpb25zLm9uV29yZEJvdW5kYXJ5ID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJ2XCI6XHJcblx0XHRcdFx0XHRvcHRpb25zLnZpc3VhbCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBvcHRpb25zO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE1vZGUge1xyXG5cdHRleHQ6IGJvb2xlYW47XHJcblx0aHRtbDogYm9vbGVhbjtcclxuXHRpbmxpbmVNYXRoOiBib29sZWFuO1xyXG5cdGJsb2NrTWF0aDogYm9vbGVhbjtcclxuXHRjb2RlTWF0aDogYm9vbGVhbjtcclxuXHRjb2RlOiBib29sZWFuO1xyXG5cdHRleHRFbnY6IGJvb2xlYW47XHJcblxyXG5cdC8qKlxyXG5cdCAqIFdoZXRoZXIgdGhlIHN0YXRlIGlzIGluc2lkZSBhbiBlcXVhdGlvbiBib3VuZGVkIGJ5ICQgb3IgJCQgZGVsaW1ldGVycy5cclxuXHQgKi9cclxuXHRpbkVxdWF0aW9uKCk6Ym9vbGVhbiB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbmxpbmVNYXRoIHx8IHRoaXMuYmxvY2tNYXRoO1xyXG5cdH1cclxuXHJcblx0LyoqXHJcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgaW4gYW55IG1hdGggbW9kZS5cclxuXHQgKlxyXG5cdCAqIFRoZSBlcXVhdGlvbiBtYXkgYmUgYm91bmRlZCBieSAkIG9yICQkIGRlbGltZXRlcnMsIG9yIGl0IG1heSBiZSBhbiBlcXVhdGlvbiBpbnNpZGUgYSBgbWF0aGAgY29kZWJsb2NrLlxyXG5cdCAqL1xyXG5cdGluTWF0aCgpOmJvb2xlYW4ge1xyXG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lTWF0aCB8fCB0aGlzLmJsb2NrTWF0aCB8fCB0aGlzLmNvZGVNYXRoO1xyXG5cdH1cclxuXHJcblx0LyoqXHJcblx0ICogV2hldGhlciB0aGUgc3RhdGUgaXMgc3RyaWN0bHkgaW4gbWF0aCBtb2RlLlxyXG5cdCAqXHJcblx0ICogUmV0dXJucyBmYWxzZSB3aGVuIHRoZSBzdGF0ZSBpcyB3aXRoaW4gbWF0aCwgYnV0IGluc2lkZSBhIHRleHQgZW52aXJvbm1lbnQsIHN1Y2ggYXMgXFx0ZXh0e30uXHJcblx0ICovXHJcblx0aXNudEluVGV4dCgpe1xyXG5cdFx0cmV0dXJuICF0aGlzLnRleHQmJiF0aGlzLnRleHRFbnZcclxuXHR9XHJcblx0c3RyaWN0bHlJbk1hdGgoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbk1hdGgoKSAmJiAhdGhpcy50ZXh0RW52O1xyXG5cdH1cclxuXHJcblx0Y29uc3RydWN0b3IoKSB7XHJcblx0XHR0aGlzLnRleHQgPSBmYWxzZTtcclxuXHRcdHRoaXMuYmxvY2tNYXRoID0gZmFsc2U7XHJcblx0XHR0aGlzLmlubGluZU1hdGggPSBmYWxzZTtcclxuXHRcdHRoaXMuY29kZSA9IGZhbHNlO1xyXG5cdFx0dGhpcy50ZXh0RW52ID0gZmFsc2U7XHJcblx0fVxyXG5cclxuXHRpbnZlcnQoKSB7XHJcblx0XHR0aGlzLnRleHQgPSAhdGhpcy50ZXh0O1xyXG5cdFx0dGhpcy5ibG9ja01hdGggPSAhdGhpcy5ibG9ja01hdGg7XHJcblx0XHR0aGlzLmlubGluZU1hdGggPSAhdGhpcy5pbmxpbmVNYXRoO1xyXG5cdFx0dGhpcy5jb2RlTWF0aCA9ICF0aGlzLmNvZGVNYXRoO1xyXG5cdFx0dGhpcy5jb2RlID0gIXRoaXMuY29kZTtcclxuXHRcdHRoaXMudGV4dEVudiA9ICF0aGlzLnRleHRFbnY7XHJcblx0fVxyXG5cclxuXHRzdGF0aWMgZnJvbVNvdXJjZShzb3VyY2U6IHN0cmluZyk6IE1vZGUge1xyXG5cdFx0Y29uc3QgbW9kZSA9IG5ldyBNb2RlKCk7XHJcblxyXG5cdFx0Zm9yIChjb25zdCBmbGFnX2NoYXIgb2Ygc291cmNlKSB7XHJcblx0XHRcdHN3aXRjaCAoZmxhZ19jaGFyKSB7XHJcblx0XHRcdFx0Y2FzZSBcIm1cIjpcclxuXHRcdFx0XHRcdG1vZGUuYmxvY2tNYXRoID0gdHJ1ZTtcclxuXHRcdFx0XHRcdG1vZGUuaW5saW5lTWF0aCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwiblwiOlxyXG5cdFx0XHRcdFx0bW9kZS5pbmxpbmVNYXRoID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJNXCI6XHJcblx0XHRcdFx0XHRtb2RlLmJsb2NrTWF0aCA9IHRydWU7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlIFwidFwiOlxyXG5cdFx0XHRcdFx0bW9kZS50ZXh0ID0gdHJ1ZTtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdGNhc2UgXCJjXCI6XHJcblx0XHRcdFx0XHRtb2RlLmNvZGUgPSB0cnVlO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblxyXG5cdFx0aWYgKCEobW9kZS50ZXh0IHx8XHJcblx0XHRcdG1vZGUuaW5saW5lTWF0aCB8fFxyXG5cdFx0XHRtb2RlLmJsb2NrTWF0aCB8fFxyXG5cdFx0XHRtb2RlLmNvZGVNYXRoIHx8XHJcblx0XHRcdG1vZGUuY29kZSB8fFxyXG5cdFx0XHRtb2RlLnRleHRFbnYpXHJcblx0XHQpIHtcclxuXHRcdFx0Ly8gZm9yIGJhY2t3YXJkcyBjb21wYXQgd2UgbmVlZCB0byBhc3N1bWUgdGhhdCB0aGlzIGlzIGEgY2F0Y2hhbGwgbW9kZSB0aGVuXHJcblx0XHRcdG1vZGUuaW52ZXJ0KCk7XHJcblx0XHRcdHJldHVybiBtb2RlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBtb2RlO1xyXG5cdH1cclxufVxyXG4iXX0=