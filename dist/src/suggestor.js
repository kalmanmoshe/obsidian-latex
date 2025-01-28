import { getTikzSuggestions, } from "./utilities";
import { expandSnippets } from "./snippets/snippet_management";
import { queueSnippet } from "./snippets/codemirror/snippet_queue_state_field";
import { setCursor } from "./utils/editor_utils";
class SuggestorTrigger {
    constructor(ctx, view) {
        this.suggestions = [];
        this.text = this.getCurrentLineText(ctx.pos, view);
        const source = this.getCodeBlockText(ctx, view);
        this.filteredSuggestions();
        if (!source)
            return;
        //const tokens=new BasicTikzTokens(source)
        //console.log(tokens)
    }
    getSuggestions() { return this.suggestions; }
    getText() { return this.text; }
    setTrigger(trigger) {
    }
    hasValue() {
        return this.text && this.text.length > 0 && this.suggestions.length !== 1 && this.suggestions[0] !== this.text;
    }
    getCurrentLineText(pos, view) {
        const line = view.state.doc.lineAt(pos);
        //const cursorOffsetInLine = (pos+2) - line.from;I don't know why I had this here
        const textUpToCursor = line.text.slice(0, pos - line.from).trim();
        const words = textUpToCursor.split(/([\s,\[\](){};]|--\+\+|--\+|--)+/);
        const word = words[words.length - 1] || '';
        /* Checks that need to be made
        1. In what command are we in if any.
        2. Are we inputting a Variable a coordinate or formatting.
        3. if Formatting Are we starting to type a command or are we inputting a value to a command
        */
        return words[words.length - 1] || "";
    }
    filteredSuggestions() {
        const allSuggestions = getTikzSuggestions().map(s => s.trigger || s.replacement);
        const filteredSuggestions = allSuggestions.filter((suggestion) => suggestion.toLowerCase().startsWith(this.text.toLowerCase()));
        const sortedSuggestions = filteredSuggestions.sort((a, b) => {
            const lowerLastWord = this.text.toLowerCase();
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            const aExactMatch = aLower === lowerLastWord ? -1 : 0;
            const bExactMatch = bLower === lowerLastWord ? -1 : 0;
            if (aExactMatch !== bExactMatch)
                return aExactMatch - bExactMatch;
            if (a.length !== b.length)
                return a.length - b.length;
            return aLower.localeCompare(bLower);
        });
        this.suggestions = sortedSuggestions;
    }
    getCodeBlockText(ctx, view) {
        const doc = view.state.doc;
        const bounds = ctx.getBounds();
        if (bounds === null)
            throw new Error("No bounds found");
        const betweenText = doc.sliceString(bounds.start, bounds.end).trim();
        return betweenText;
    }
}
class Suggestor {
    constructor() {
        this.selectionIndex = 0;
    }
    open(context, view) {
        // If the suggestor is already deployed, close it
        this.close();
        this.context = context;
        this.trigger = new SuggestorTrigger(this.context, view);
        if (!this.trigger.hasValue())
            return false;
        this.createContainerEl();
        this.updatePositionFromView(view);
        document.body.appendChild(this.containerEl);
        this.updateSelection();
        return true;
    }
    close() {
        var _a;
        document.body.querySelectorAll(".suggestion-item").forEach(node => node.remove());
        (_a = document.body.querySelector(".suggestion-dropdown")) === null || _a === void 0 ? void 0 : _a.remove();
    }
    isSuggesterDeployed() { return !!document.body.querySelector(".suggestion-dropdown"); }
    setSelectionIndex(number) {
        this.selectionIndex = number;
        this.updateSelection();
    }
    moveSelectionIndex(number) {
        const items = this.getAlldropdownItems();
        this.selectionIndex = (suggestor.selectionIndex + number + items.length) % items.length;
        this.updateSelection(items);
    }
    updatePositionFromView(view) {
        const coords = view.coordsAtPos(view.state.selection.main.head);
        if (!coords)
            return false;
        this.updatePosition(coords.left, coords.bottom);
        return true;
    }
    createContainerEl() {
        const suggestions = this.trigger.getSuggestions();
        if (suggestions.length < 1)
            return;
        this.containerEl = document.createElement("div");
        this.containerEl.addClass("suggestion-dropdown");
        suggestions.forEach((suggestion) => {
            this.renderSuggestion(suggestion);
        });
    }
    renderSuggestion(suggestion) {
        this.containerEl.appendChild(Object.assign(document.createElement("div"), {
            className: "suggestion-item",
            innerText: suggestion
        }));
    }
    updatePosition(left, top) {
        if (!this.containerEl)
            return false;
        Object.assign(this.containerEl.style, {
            position: "absolute",
            left: `${left}px`,
            top: `${top}px`,
        });
        return true;
    }
    getAlldropdownItems() { return document.body.querySelectorAll(".suggestion-item"); }
    getDropdown() { return document.body.querySelector(".suggestion-dropdown"); }
    handleDropdownNavigation(event, view) {
        const dropdown = this.getDropdown();
        if (!dropdown)
            return;
        const items = this.getAlldropdownItems();
        if (items.length === 0)
            return;
        switch (true) {
            case event.key === "ArrowDown":
                this.moveSelectionIndex(1);
                event.preventDefault();
                break;
            case event.key === "ArrowUp":
                this.moveSelectionIndex(-1);
                event.preventDefault();
                break;
            case event.key === "ArrowLeft" || event.key === "ArrowRight":
                suggestor.close();
                break;
            case event.key === "Backspace":
                suggestor.close();
                break;
            case event.key === "Enter":
                suggestor.selectDropdownItem(view);
                event.preventDefault();
                break;
            case event.key === "Escape":
                suggestor.close();
                event.preventDefault();
                break;
            default:
                return false;
        }
        return true;
    }
    updateSelection(items = this.getAlldropdownItems()) {
        items.forEach((item, index) => {
            if (index === this.selectionIndex) {
                item.classList.add("selected");
                item.scrollIntoView({ block: "nearest" });
            }
            else {
                item.classList.remove("selected");
            }
        });
    }
    selectDropdownItem(view, item = this.getAlldropdownItems()[this.selectionIndex]) {
        this.close();
        if (!this.context)
            return;
        const trigger = this.trigger.getText();
        const selectedText = item.textContent || "";
        const pos = this.context.pos;
        queueSnippet(view, pos - trigger.length, pos, selectedText);
        const success = expandSnippets(view);
        view.focus();
        setCursor(view, calculateNewCursorPosition(trigger, selectedText, pos));
        return success;
    }
}
function calculateNewCursorPosition(triggerText, selectedText, originalPos) {
    console.log('calculateNewCursorPosition', triggerText, selectedText, originalPos);
    const lengthDifference = selectedText.length - triggerText.length;
    return originalPos + lengthDifference;
}
export const suggestor = new Suggestor();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsa0JBQWtCLEdBQUksTUFBTSxhQUFhLENBQUM7QUFHbkQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMvRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFakQsTUFBTSxnQkFBZ0I7SUFJckIsWUFBWSxHQUFZLEVBQUUsSUFBZ0I7UUFEbEMsZ0JBQVcsR0FBVyxFQUFFLENBQUM7UUFFaEMsSUFBSSxDQUFDLElBQUksR0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQTtRQUNoRCxNQUFNLE1BQU0sR0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFDLElBQUksQ0FBQyxDQUFBO1FBQzVDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFBO1FBQzFCLElBQUcsQ0FBQyxNQUFNO1lBQUMsT0FBTTtRQUNqQiwwQ0FBMEM7UUFDMUMscUJBQXFCO0lBQ3RCLENBQUM7SUFDRCxjQUFjLEtBQUcsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFBLENBQUEsQ0FBQztJQUN6QyxPQUFPLEtBQUcsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFBLENBQUEsQ0FBQztJQUMzQixVQUFVLENBQUMsT0FBZTtJQUUxQixDQUFDO0lBQ0QsUUFBUTtRQUNQLE9BQU8sSUFBSSxDQUFDLElBQUksSUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBQyxDQUFDLElBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEtBQUcsQ0FBQyxJQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEtBQUcsSUFBSSxD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R0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZ2V0VGlrelN1Z2dlc3Rpb25zLCAgfSBmcm9tIFwiLi91dGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgRWRpdG9yVmlldywgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vdXRpbHMvY29udGV4dFwiO1xyXG5pbXBvcnQgeyBleHBhbmRTbmlwcGV0cyB9IGZyb20gXCIuL3NuaXBwZXRzL3NuaXBwZXRfbWFuYWdlbWVudFwiO1xyXG5pbXBvcnQgeyBxdWV1ZVNuaXBwZXQgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL3NuaXBwZXRfcXVldWVfc3RhdGVfZmllbGRcIjtcclxuaW1wb3J0IHsgc2V0Q3Vyc29yIH0gZnJvbSBcIi4vdXRpbHMvZWRpdG9yX3V0aWxzXCI7XHJcblxyXG5jbGFzcyBTdWdnZXN0b3JUcmlnZ2Vye1xyXG5cdHByaXZhdGUgdGV4dDogc3RyaW5nXHJcblx0cHJpdmF0ZSBjb2RlQmxvY2tUZXh0OiBzdHJpbmc7XHJcblx0cHJpdmF0ZSBzdWdnZXN0aW9uczogc3RyaW5nW109W107XHJcblx0Y29uc3RydWN0b3IoY3R4OiBDb250ZXh0LCB2aWV3OiBFZGl0b3JWaWV3KXtcclxuXHRcdHRoaXMudGV4dD10aGlzLmdldEN1cnJlbnRMaW5lVGV4dChjdHgucG9zLCB2aWV3KVxyXG5cdFx0Y29uc3Qgc291cmNlPXRoaXMuZ2V0Q29kZUJsb2NrVGV4dChjdHgsdmlldylcclxuXHRcdHRoaXMuZmlsdGVyZWRTdWdnZXN0aW9ucygpXHJcblx0XHRpZighc291cmNlKXJldHVyblxyXG5cdFx0Ly9jb25zdCB0b2tlbnM9bmV3IEJhc2ljVGlrelRva2Vucyhzb3VyY2UpXHJcblx0XHQvL2NvbnNvbGUubG9nKHRva2VucylcclxuXHR9XHJcblx0Z2V0U3VnZ2VzdGlvbnMoKXtyZXR1cm4gdGhpcy5zdWdnZXN0aW9uc31cclxuXHRnZXRUZXh0KCl7cmV0dXJuIHRoaXMudGV4dH1cclxuXHRzZXRUcmlnZ2VyKHRyaWdnZXI6IHN0cmluZyl7XHJcblxyXG5cdH1cclxuXHRoYXNWYWx1ZSgpe1xyXG5cdFx0cmV0dXJuIHRoaXMudGV4dCYmdGhpcy50ZXh0Lmxlbmd0aD4wJiZ0aGlzLnN1Z2dlc3Rpb25zLmxlbmd0aCE9PTEmJnRoaXMuc3VnZ2VzdGlvbnNbMF0hPT10aGlzLnRleHRcclxuXHR9XHJcblx0Z2V0Q3VycmVudExpbmVUZXh0KHBvczogbnVtYmVyLCB2aWV3OiBFZGl0b3JWaWV3KTogc3RyaW5nIHtcclxuXHRcdGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcclxuXHRcdC8vY29uc3QgY3Vyc29yT2Zmc2V0SW5MaW5lID0gKHBvcysyKSAtIGxpbmUuZnJvbTtJIGRvbid0IGtub3cgd2h5IEkgaGFkIHRoaXMgaGVyZVxyXG5cdFx0Y29uc3QgdGV4dFVwVG9DdXJzb3IgPSBsaW5lLnRleHQuc2xpY2UoMCwgcG9zLSBsaW5lLmZyb20pLnRyaW0oKTtcclxuXHRcdGNvbnN0IHdvcmRzID0gdGV4dFVwVG9DdXJzb3Iuc3BsaXQoLyhbXFxzLFxcW1xcXSgpe307XXwtLVxcK1xcK3wtLVxcK3wtLSkrLyk7XHJcblx0XHRjb25zdCB3b3JkPXdvcmRzW3dvcmRzLmxlbmd0aCAtIDFdfHwnJztcclxuXHRcdC8qIENoZWNrcyB0aGF0IG5lZWQgdG8gYmUgbWFkZVxyXG5cdFx0MS4gSW4gd2hhdCBjb21tYW5kIGFyZSB3ZSBpbiBpZiBhbnkuXHJcblx0XHQyLiBBcmUgd2UgaW5wdXR0aW5nIGEgVmFyaWFibGUgYSBjb29yZGluYXRlIG9yIGZvcm1hdHRpbmcuXHJcblx0XHQzLiBpZiBGb3JtYXR0aW5nIEFyZSB3ZSBzdGFydGluZyB0byB0eXBlIGEgY29tbWFuZCBvciBhcmUgd2UgaW5wdXR0aW5nIGEgdmFsdWUgdG8gYSBjb21tYW5kXHJcblx0XHQqL1xyXG5cdFx0cmV0dXJuIHdvcmRzW3dvcmRzLmxlbmd0aCAtIDFdIHx8IFwiXCI7XHJcblx0fVxyXG5cdHByaXZhdGUgZmlsdGVyZWRTdWdnZXN0aW9ucygpIHtcclxuXHRcdGNvbnN0IGFsbFN1Z2dlc3Rpb25zID0gZ2V0VGlrelN1Z2dlc3Rpb25zKCkubWFwKHMgPT4gcy50cmlnZ2VyIHx8IHMucmVwbGFjZW1lbnQpO1xyXG5cdFxyXG5cdFx0Y29uc3QgZmlsdGVyZWRTdWdnZXN0aW9ucyA9IGFsbFN1Z2dlc3Rpb25zLmZpbHRlcigoc3VnZ2VzdGlvbikgPT5cclxuXHRcdFx0c3VnZ2VzdGlvbi50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgodGhpcy50ZXh0LnRvTG93ZXJDYXNlKCkpXHJcblx0XHQpO1xyXG5cdFxyXG5cdFx0Y29uc3Qgc29ydGVkU3VnZ2VzdGlvbnMgPSBmaWx0ZXJlZFN1Z2dlc3Rpb25zLnNvcnQoKGEsIGIpID0+IHtcclxuXHRcdFx0Y29uc3QgbG93ZXJMYXN0V29yZCA9IHRoaXMudGV4dC50b0xvd2VyQ2FzZSgpO1xyXG5cdFx0XHRjb25zdCBhTG93ZXIgPSBhLnRvTG93ZXJDYXNlKCk7XHJcblx0XHRcdGNvbnN0IGJMb3dlciA9IGIudG9Mb3dlckNhc2UoKTtcclxuXHRcclxuXHRcdFx0Y29uc3QgYUV4YWN0TWF0Y2ggPSBhTG93ZXIgPT09IGxvd2VyTGFzdFdvcmQgPyAtMSA6IDA7XHJcblx0XHRcdGNvbnN0IGJFeGFjdE1hdGNoID0gYkxvd2VyID09PSBsb3dlckxhc3RXb3JkID8gLTEgOiAwO1xyXG5cdFx0XHRpZiAoYUV4YWN0TWF0Y2ggIT09IGJFeGFjdE1hdGNoKSByZXR1cm4gYUV4YWN0TWF0Y2ggLSBiRXhhY3RNYXRjaDtcclxuXHRcclxuXHRcdFx0aWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7XHJcblx0XHJcblx0XHRcdHJldHVybiBhTG93ZXIubG9jYWxlQ29tcGFyZShiTG93ZXIpO1xyXG5cdFx0fSk7XHJcblx0XHR0aGlzLnN1Z2dlc3Rpb25zID0gc29ydGVkU3VnZ2VzdGlvbnM7XHJcblx0fVxyXG5cdGdldENvZGVCbG9ja1RleHQoY3R4OiBDb250ZXh0LHZpZXc6IEVkaXRvclZpZXcpe1xyXG5cdFx0Y29uc3QgZG9jID0gdmlldy5zdGF0ZS5kb2M7XHJcblx0XHRcclxuXHRcdGNvbnN0IGJvdW5kcz1jdHguZ2V0Qm91bmRzKClcclxuXHRcdGlmKGJvdW5kcz09PW51bGwpXHJcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIk5vIGJvdW5kcyBmb3VuZFwiKVxyXG5cclxuXHJcblx0XHRjb25zdCBiZXR3ZWVuVGV4dCA9IGRvYy5zbGljZVN0cmluZyhib3VuZHMuc3RhcnQsIGJvdW5kcy5lbmQpLnRyaW0oKTtcclxuXHRcdHJldHVybiBiZXR3ZWVuVGV4dFxyXG5cdH1cclxufVxyXG5cclxuY2xhc3MgU3VnZ2VzdG9yIHtcclxuXHRwcml2YXRlIHRyaWdnZXI6IFN1Z2dlc3RvclRyaWdnZXI7XHJcblx0cHJpdmF0ZSBzZWxlY3Rpb25JbmRleDogbnVtYmVyPTA7XHJcblx0cHJpdmF0ZSBjb250ZXh0OiBDb250ZXh0O1xyXG5cdHByaXZhdGUgY29udGFpbmVyRWw6IEhUTUxFbGVtZW50O1xyXG5cclxuXHRvcGVuKGNvbnRleHQ6IENvbnRleHQsdmlldzogRWRpdG9yVmlldyl7XHJcblx0XHQvLyBJZiB0aGUgc3VnZ2VzdG9yIGlzIGFscmVhZHkgZGVwbG95ZWQsIGNsb3NlIGl0XHJcblx0XHR0aGlzLmNsb3NlKCk7XHJcblx0XHR0aGlzLmNvbnRleHQ9Y29udGV4dDtcclxuXHRcdHRoaXMudHJpZ2dlcj1uZXcgU3VnZ2VzdG9yVHJpZ2dlcih0aGlzLmNvbnRleHQsIHZpZXcpXHJcblx0XHRpZighdGhpcy50cmlnZ2VyLmhhc1ZhbHVlKCkpcmV0dXJuIGZhbHNlO1xyXG5cdFx0dGhpcy5jcmVhdGVDb250YWluZXJFbCgpO1xyXG5cdFx0dGhpcy51cGRhdGVQb3NpdGlvbkZyb21WaWV3KHZpZXcpO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmNvbnRhaW5lckVsKTtcclxuXHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uKCk7XHJcblx0XHRyZXR1cm4gdHJ1ZTtcclxuXHR9XHJcblx0Y2xvc2UoKXtcclxuXHRcdGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvckFsbChcIi5zdWdnZXN0aW9uLWl0ZW1cIikuZm9yRWFjaChub2RlID0+IG5vZGUucmVtb3ZlKCkpO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yKFwiLnN1Z2dlc3Rpb24tZHJvcGRvd25cIik/LnJlbW92ZSgpO1xyXG5cdH1cclxuXHRpc1N1Z2dlc3RlckRlcGxveWVkKCk6IGJvb2xlYW4ge3JldHVybiAhIWRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpO31cclxuXHRzZXRTZWxlY3Rpb25JbmRleChudW1iZXI6IG51bWJlcil7XHJcblx0XHR0aGlzLnNlbGVjdGlvbkluZGV4PW51bWJlclxyXG5cdFx0dGhpcy51cGRhdGVTZWxlY3Rpb24oKVxyXG5cdH1cclxuXHRtb3ZlU2VsZWN0aW9uSW5kZXgobnVtYmVyOiBudW1iZXIpe1xyXG5cdFx0Y29uc3QgaXRlbXM9dGhpcy5nZXRBbGxkcm9wZG93bkl0ZW1zKClcclxuXHRcdHRoaXMuc2VsZWN0aW9uSW5kZXg9KHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCArbnVtYmVyICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aFxyXG5cdFx0dGhpcy51cGRhdGVTZWxlY3Rpb24oaXRlbXMpXHJcblx0fVxyXG5cclxuXHR1cGRhdGVQb3NpdGlvbkZyb21WaWV3KHZpZXc6IEVkaXRvclZpZXcpOiBib29sZWFue1xyXG5cdFx0Y29uc3QgY29vcmRzPXZpZXcuY29vcmRzQXRQb3Modmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkKVxyXG5cdFx0aWYgKCFjb29yZHMpIHJldHVybiBmYWxzZTtcclxuXHRcdHRoaXMudXBkYXRlUG9zaXRpb24oY29vcmRzLmxlZnQsY29vcmRzLmJvdHRvbSlcclxuXHRcdHJldHVybiB0cnVlO1xyXG5cdH1cclxuXHRcclxuXHRcclxuXHRjcmVhdGVDb250YWluZXJFbCgpe1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM9dGhpcy50cmlnZ2VyLmdldFN1Z2dlc3Rpb25zKClcclxuXHRcdGlmKHN1Z2dlc3Rpb25zLmxlbmd0aDwxKXJldHVybjtcclxuXHRcdHRoaXMuY29udGFpbmVyRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdFx0dGhpcy5jb250YWluZXJFbC5hZGRDbGFzcyhcInN1Z2dlc3Rpb24tZHJvcGRvd25cIilcclxuXHJcblx0XHRzdWdnZXN0aW9ucy5mb3JFYWNoKChzdWdnZXN0aW9uKSA9PiB7XHJcblx0XHRcdHRoaXMucmVuZGVyU3VnZ2VzdGlvbihzdWdnZXN0aW9uKTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0cmVuZGVyU3VnZ2VzdGlvbihzdWdnZXN0aW9uOiBzdHJpbmcpe1xyXG5cdFx0dGhpcy5jb250YWluZXJFbC5hcHBlbmRDaGlsZChcclxuXHRcdFx0T2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcblx0XHRcdFx0Y2xhc3NOYW1lOiBcInN1Z2dlc3Rpb24taXRlbVwiLFxyXG5cdFx0XHRcdGlubmVyVGV4dDogc3VnZ2VzdGlvblxyXG5cdFx0XHR9KVxyXG5cdFx0KTtcclxuXHR9XHJcblxyXG5cdHVwZGF0ZVBvc2l0aW9uKGxlZnQ6IG51bWJlcix0b3A6IG51bWJlcil7XHJcblx0XHRpZiAoIXRoaXMuY29udGFpbmVyRWwpIHJldHVybiBmYWxzZTtcclxuXHRcdE9iamVjdC5hc3NpZ24odGhpcy5jb250YWluZXJFbC5zdHlsZSx7XHJcblx0XHRcdHBvc2l0aW9uOiBcImFic29sdXRlXCIsXHJcblx0XHRcdGxlZnQ6IGAke2xlZnR9cHhgLFxyXG5cdFx0XHR0b3A6IGAke3RvcH1weGAsXHJcblx0XHR9KTtcclxuXHRcdHJldHVybiB0cnVlO1xyXG5cdH1cclxuXHJcblx0Z2V0QWxsZHJvcGRvd25JdGVtcygpe3JldHVybiBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpfVxyXG5cdHByaXZhdGUgZ2V0RHJvcGRvd24oKXtyZXR1cm4gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yKFwiLnN1Z2dlc3Rpb24tZHJvcGRvd25cIil9XHJcblxyXG5cdGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbihldmVudDogS2V5Ym9hcmRFdmVudCx2aWV3OkVkaXRvclZpZXcpIHtcclxuXHRcdGNvbnN0IGRyb3Bkb3duID0gdGhpcy5nZXREcm9wZG93bigpO1xyXG5cdFx0aWYgKCFkcm9wZG93bikgcmV0dXJuO1xyXG5cdFxyXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEFsbGRyb3Bkb3duSXRlbXMoKTtcclxuXHJcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XHJcblx0XHRzd2l0Y2ggKHRydWUpIHtcclxuXHRcdFx0Y2FzZSBldmVudC5rZXkgPT09IFwiQXJyb3dEb3duXCI6XHJcblx0XHRcdFx0dGhpcy5tb3ZlU2VsZWN0aW9uSW5kZXgoMSlcclxuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd1VwXCI6XHJcblx0XHRcdFx0dGhpcy5tb3ZlU2VsZWN0aW9uSW5kZXgoLTEpXHJcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0Y2FzZSBldmVudC5rZXkgPT09IFwiQXJyb3dMZWZ0XCJ8fGV2ZW50LmtleSA9PT0gXCJBcnJvd1JpZ2h0XCI6XHJcblx0XHRcdFx0c3VnZ2VzdG9yLmNsb3NlKCk7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdGNhc2UgZXZlbnQua2V5ID09PSBcIkJhY2tzcGFjZVwiOlxyXG5cdFx0XHRcdHN1Z2dlc3Rvci5jbG9zZSgpO1xyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJFbnRlclwiOlxyXG5cdFx0XHRcdHN1Z2dlc3Rvci5zZWxlY3REcm9wZG93bkl0ZW0odmlldyk7XHJcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0Y2FzZSBldmVudC5rZXkgPT09IFwiRXNjYXBlXCI6XHJcblx0XHRcdFx0c3VnZ2VzdG9yLmNsb3NlKCk7XHJcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdHJ1ZTtcclxuXHR9XHJcblxyXG5cdHVwZGF0ZVNlbGVjdGlvbihpdGVtczogTm9kZUxpc3RPZjxFbGVtZW50Pj10aGlzLmdldEFsbGRyb3Bkb3duSXRlbXMoKSkge1xyXG5cdFx0aXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcclxuXHRcdFx0aWYgKGluZGV4ID09PSB0aGlzLnNlbGVjdGlvbkluZGV4KSB7XHJcblx0XHRcdFx0aXRlbS5jbGFzc0xpc3QuYWRkKFwic2VsZWN0ZWRcIik7XHJcblx0XHRcdFx0aXRlbS5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRpdGVtLmNsYXNzTGlzdC5yZW1vdmUoXCJzZWxlY3RlZFwiKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRzZWxlY3REcm9wZG93bkl0ZW0odmlldzogRWRpdG9yVmlldyxpdGVtOiBFbGVtZW50PXRoaXMuZ2V0QWxsZHJvcGRvd25JdGVtcygpW3RoaXMuc2VsZWN0aW9uSW5kZXhdKSB7XHJcblx0XHR0aGlzLmNsb3NlKClcclxuXHRcdGlmKCF0aGlzLmNvbnRleHQpcmV0dXJuO1xyXG5cclxuXHRcdGNvbnN0IHRyaWdnZXI9dGhpcy50cmlnZ2VyLmdldFRleHQoKVxyXG5cclxuXHRcdGNvbnN0IHNlbGVjdGVkVGV4dCA9IGl0ZW0udGV4dENvbnRlbnQgfHwgXCJcIjtcclxuXHRcdGNvbnN0IHBvcz10aGlzLmNvbnRleHQucG9zO1xyXG5cdFx0cXVldWVTbmlwcGV0KHZpZXcscG9zLXRyaWdnZXIubGVuZ3RoLHBvcyxzZWxlY3RlZFRleHQpXHJcblx0XHRjb25zdCBzdWNjZXNzID0gZXhwYW5kU25pcHBldHModmlldyk7XHJcblx0XHR2aWV3LmZvY3VzKCk7XHJcblx0XHRzZXRDdXJzb3IodmlldyxjYWxjdWxhdGVOZXdDdXJzb3JQb3NpdGlvbih0cmlnZ2VyLHNlbGVjdGVkVGV4dCxwb3MpKVxyXG5cdFx0cmV0dXJuIHN1Y2Nlc3M7XHJcblx0fVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gY2FsY3VsYXRlTmV3Q3Vyc29yUG9zaXRpb24odHJpZ2dlclRleHQ6IHN0cmluZywgc2VsZWN0ZWRUZXh0OiBzdHJpbmcsIG9yaWdpbmFsUG9zOiBudW1iZXIpOiBudW1iZXIge1xyXG5cdGNvbnNvbGUubG9nKCdjYWxjdWxhdGVOZXdDdXJzb3JQb3NpdGlvbicsdHJpZ2dlclRleHQsc2VsZWN0ZWRUZXh0LG9yaWdpbmFsUG9zKVxyXG4gICAgY29uc3QgbGVuZ3RoRGlmZmVyZW5jZSA9IHNlbGVjdGVkVGV4dC5sZW5ndGggLSB0cmlnZ2VyVGV4dC5sZW5ndGg7XHJcbiAgICByZXR1cm4gb3JpZ2luYWxQb3MgKyBsZW5ndGhEaWZmZXJlbmNlO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3Qgc3VnZ2VzdG9yID0gbmV3IFN1Z2dlc3RvcigpOyJdfQ==