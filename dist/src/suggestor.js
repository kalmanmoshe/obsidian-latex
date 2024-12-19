import { getTikzSuggestions, } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { replaceRange, setCursor } from "./editor utilities/editor_utils";
class SuggestorTrigger {
    text;
    codeBlockText;
    constructor(ctx, view) {
        this.text = this.getCurrentLineText(ctx.pos, view);
    }
    setTrigger(trigger) {
    }
    getCurrentLineText(pos, view) {
        const line = view.state.doc.lineAt(pos);
        //const cursorOffsetInLine = (pos+2) - line.from;I don't know why I had this here
        const textUpToCursor = line.text.slice(0, pos - line.from).trim();
        const words = textUpToCursor.split(/([\s,\[\](){};]|--\+\+|--\+|--)+/);
        const word = words[words.length - 1] || '';
        console.log(word);
        /* Checks that need to be made
        1. In what command are we in if any.
        2. Are we inputting a Variable a coordinate or formatting.
        3. if Formatting Are we starting to type a command or are we inputting a value to a command
        */
        return words[words.length - 1] || "";
    }
    getCodeBlockText(ctx, view) {
        const doc = view.state.doc;
        const { number } = doc.lineAt(ctx.pos);
        const beforeLine = findLine(view.state, number, -1, '```');
        const afterLine = findLine(view.state, number, 1, '```');
        ;
        if (!beforeLine || !afterLine)
            return null;
        const betweenText = doc.sliceString(beforeLine.to, afterLine.from).trim();
        const relativePos = ctx.pos - beforeLine.to;
        return betweenText;
    }
}
const findLine = (state, lineNumber, dir, startsWith) => {
    const { doc } = state;
    for (let i = lineNumber + dir; i > 0 && i <= doc.lines; i += dir) {
        const line = doc.line(i).text.trim();
        if (line.startsWith(startsWith))
            return doc.line(i);
    }
    return null;
};
export class Suggestor {
    trigger;
    selectionIndex;
    context;
    isSuggesterDeployed = false;
    deploySuggestor(context, view) {
        console.log("sjdsjd");
        this.removeSuggestor();
        this.context = context;
        const suggestions = this.getSuggestions(view);
        if (suggestions.length < 1)
            return;
        const suggestionDropdown = createFloatingSuggestionDropdown(suggestions, view, this.context.pos);
        if (!suggestionDropdown)
            return;
        document.body.appendChild(suggestionDropdown);
        this.isSuggesterDeployed = true;
        this.selectionIndex = 0;
        this.updateSelection(this.getAlldropdownItems());
    }
    updateSuggestorPosition() {
    }
    removeSuggestor() {
        document.body.querySelectorAll(".suggestion-item").forEach(node => node.remove());
        document.body.querySelector(".suggestion-dropdown")?.remove();
        this.isSuggesterDeployed = false;
    }
    getAlldropdownItems() { return document.body.querySelectorAll(".suggestion-item"); }
    dropdownifAnyDeployed() { return document.body.querySelector(".suggestion-dropdown"); }
    handleDropdownNavigation(event, view) {
        const dropdown = this.dropdownifAnyDeployed();
        if (!dropdown || this.selectionIndex === undefined)
            return;
        const items = this.getAlldropdownItems();
        if (items.length === 0)
            return;
    }
    getSuggestions(view) {
        this.trigger = new SuggestorTrigger(this.context, view);
        const allSuggestions = getTikzSuggestions().map(s => s.trigger || s.replacement);
        const filteredSuggestions = allSuggestions.filter((suggestion) => suggestion.toLowerCase().startsWith(this.trigger.text.toLowerCase()));
        const sortedSuggestions = filteredSuggestions.sort((a, b) => {
            const lowerLastWord = this.trigger.text.toLowerCase();
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
        return sortedSuggestions;
    }
    updateSelection(items) {
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
    selectDropdownItem(item, view) {
        this.removeSuggestor();
        if (!this.context)
            return;
        const selectedText = item.textContent || "";
        const pos = this.context.pos;
        replaceRange(view, pos - this.trigger.text.length, pos, selectedText);
        view.focus();
        setCursor(view, calculateNewCursorPosition(this.trigger.text, selectedText, pos));
        console.log(`Selected: ${selectedText}`);
    }
}
function calculateNewCursorPosition(triggerText, selectedText, originalPos) {
    const lengthDifference = selectedText.length - triggerText.length;
    return originalPos + lengthDifference;
}
function createFloatingSuggestionDropdown(suggestions, editorView, position) {
    const coordinates = editorView.coordsAtPos(position);
    if (!coordinates)
        return;
    const suggestionDropdown = createSuggestionDropdown(suggestions);
    suggestionDropdown.style.position = "absolute";
    suggestionDropdown.style.left = `${coordinates.left}px`;
    suggestionDropdown.style.top = `${coordinates.bottom}px`;
    return suggestionDropdown;
}
function createSuggestionDropdown(suggestions) {
    const dropdownContainer = document.createElement("div");
    dropdownContainer.className = "suggestion-dropdown";
    suggestions.forEach((suggestion) => {
        const item = createSuggestionItem(suggestion);
        dropdownContainer.appendChild(item);
    });
    return dropdownContainer;
}
function createSuggestionItem(displayText) {
    // Create the outer suggestion item container
    const container = document.createElement("div");
    container.classList.add("suggestion-item");
    container.innerText = displayText;
    return container;
    // Create the icon container
    const icon = document.createElement("div");
    icon.classList.add("icon");
    icon.textContent = "ƒ"; // Placeholder icon content
    // Create the details container
    const details = document.createElement("div");
    details.classList.add("details");
    // Add a name span to details
    const name = document.createElement("span");
    name.classList.add("name");
    name.textContent = "function"; // Placeholder name content
    // Add a type span to details
    const type = document.createElement("span");
    type.classList.add("type");
    type.textContent = "Keyword"; // Placeholder type content
    // Append name and type to details
    details.appendChild(name);
    details.appendChild(type);
    // Append icon and details to the container
    container.appendChild(icon);
    container.appendChild(details);
    return container;
}
/*
export class NumeralsSuggestor extends EditorSuggest<string> {
    plugin: NumeralsPlugin;
    
    /**
     * Time of last suggestion list update
     * @type {number}
     * @private
    private lastSuggestionListUpdate: number = 0;

    /**
     * List of possible suggestions based on current code block
     * @type {string[]}
     * @private
    private localSuggestionCache: string[] = [];

    //empty constructor
    constructor(plugin: NumeralsPlugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {

        const cmEditor = editor as any;
        const view = cmEditor.cm ? (cmEditor.cm as EditorView) : null;
        if (view === null) return null;
        const codeblockLeng=langIfWithinCodeblock(view.state)
        const isMathBlock=codeblockLeng?.contains('tikz')

        const pos = view.state.selection.ranges[0].from;
        const line = view.state.doc.lineAt(pos);
        //const domNode = view.domAtPos(line.from).node;
        if (!isMathBlock) {
            return null;
        }
        

        // Get last word in current line
        const currentLine = view.state.doc.lineAt(pos).text;
        const currentLineLastWordStart = currentLine.search(/[:]?[$@\w\u0370-\u03FF]+$/);
        // if there is no word, return null
        if (currentLineLastWordStart === -1) {
            return null;
        }

        return {
            start: {line: cursor.line, ch: currentLineLastWordStart},
            end: cursor,
            query: currentLine.slice(currentLineLastWordStart)
        };
    }

    getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
        let localSymbols: string [] = [];

        localSymbols = this.localSuggestionCache
        const query = context.query.toLowerCase();

        const local_suggestions = localSymbols.filter((value) => value.slice(0, -1).toLowerCase().startsWith(query, 2));
        local_suggestions.sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
        
        // case-insensitive filter mathjs suggestions based on query. Don't return value if full match
        let suggestions: string[] = [];

        const mathjs_suggestions = getMathJsSymbols().filter((obj: Latex) => obj.value.slice(0, -1).toLowerCase().startsWith(query, 2));

        suggestions = mathjs_suggestions.map((o:Latex)=>o.value)//local_suggestions.concat(mathjs_suggestions);

        /*suggestions = suggestions.concat(
            numeralsDirectives
                .filter((value) => value.slice(0,-1).toLowerCase().startsWith(query, 0))
                .map((value) => 'm|' + value)
            );

        return suggestions;
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value)/*
        el.addClasses(['mod-complex', 'numerals-suggestion']);
        const suggestionContent = el.createDiv({cls: 'suggestion-content'});
        const suggestionTitle = suggestionContent.createDiv({cls: 'suggestion-title'});
        const suggestionNote = suggestionContent.createDiv({cls: 'suggestion-note'});
        const suggestionAux = el.createDiv({cls: 'suggestion-aux'});
        const suggestionFlair = suggestionAux.createDiv({cls: 'suggestion-flair'});*/
// eslint-disable-next-line @typescript-eslint/no-unused-vars
/*
const [iconType, suggestionText, noteText] = value.split('|');

if (iconType === 'f') {
    setIcon(suggestionFlair, 'function-square');
} else if (iconType === 'c') {
    setIcon(suggestionFlair, 'locate-fixed');
} else if (iconType === 'v') {
    setIcon(suggestionFlair, 'file-code');
} else if (iconType === 'p') {
    setIcon(suggestionFlair, 'box');
} else if (iconType === 'm') {
    setIcon(suggestionFlair, 'sparkles');
} else if (iconType === 'g') {
    setIcon(suggestionFlair, 'case-lower'); // Assuming 'symbol' is a valid icon name
}
suggestionTitle.setText(suggestionText);
if (noteText) {
    suggestionNote.setText(noteText);
}
//suggestionTitle.setText(value);

}

/**
* Called when a suggestion is selected. Replaces the current word with the selected suggestion
* @param value The selected suggestion
* @param evt The event that triggered the selection
* @returns void


selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
if (this.context) {
    const editor = this.context.editor;
    
    const cmEditor = editor as any;
    const view = cmEditor.cm ? (cmEditor.cm as EditorView) : null;
    if (view === null) return;

    const cursor = view.state.selection.main;
    const from = cursor.from;
    const to = cursor.to;

    view.dispatch({
        changes: { from, to, insert: value },
        selection: { anchor: from + value.length }
    });
    
    this.close();
}
}
}
*/
export function getCharacterAtPos(viewOrState, pos) {
    const state = viewOrState instanceof EditorView ? viewOrState.state : viewOrState;
    const doc = state.doc;
    return doc.slice(pos, pos + 1).toString();
}
const langIfWithinCodeblock = (state) => {
    const tree = syntaxTree(state);
    const pos = state.selection.ranges[0].from;
    /*
    * get a tree cursor at the position
    *
    * A newline does not belong to any syntax nodes except for the Document,
    * which corresponds to the whole document. So, we change the `mode` of the
    * `cursorAt` depending on whether the character just before the cursor is a
    * newline.
    */
    const cursor = pos === 0 || getCharacterAtPos(state, pos - 1) === "\n"
        ? tree.cursorAt(pos, 1)
        : tree.cursorAt(pos, -1);
    // check if we're in a codeblock atm at all
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
export function escalateToToken(cursor, dir, target) {
    // Allow the starting node to be a match
    if (cursor.name.contains(target)) {
        return cursor.node;
    }
    while ((cursor.name != "Document") &&
        ((dir == Direction.Backward && cursor.prev())
            || (dir == Direction.Forward && cursor.next())
            || cursor.parent())) {
        if (cursor.name.contains(target)) {
            return cursor.node;
        }
    }
    return null;
}
export var Direction;
(function (Direction) {
    Direction[Direction["Backward"] = 0] = "Backward";
    Direction[Direction["Forward"] = 1] = "Forward";
})(Direction || (Direction = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsa0JBQWtCLEdBQUksTUFBTSxhQUFhLENBQUM7QUFDbkQsT0FBTyxFQUFFLFVBQVUsR0FBRyxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUtsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFFLE1BQU0sZ0JBQWdCO0lBQ3JCLElBQUksQ0FBUTtJQUNaLGFBQWEsQ0FBUztJQUN0QixZQUFZLEdBQVksRUFBRSxJQUFnQjtRQUN6QyxJQUFJLENBQUMsSUFBSSxHQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFBO0lBQ2pELENBQUM7SUFDRCxVQUFVLENBQUMsT0FBZTtJQUUxQixDQUFDO0lBQ0Qsa0JBQWtCLENBQUMsR0FBVyxFQUFFLElBQWdCO1FBQy9DLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxpRkFBaUY7UUFDakYsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsR0FBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakUsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sSUFBSSxHQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFFLEVBQUUsQ0FBQztRQUN2QyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFB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QUNsQyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDcEIsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFFRCxNQUFNLENBQU4sSUFBWSxTQUdYO0FBSEQsV0FBWSxTQUFTO0lBQ3BCLGlEQUFRLENBQUE7SUFDUiwrQ0FBTyxDQUFBO0FBQ1IsQ0FBQyxFQUhXLFNBQVMsS0FBVCxTQUFTLFFBR3BCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZ2V0VGlrelN1Z2dlc3Rpb25zLCAgfSBmcm9tIFwiLi91dGlsaXRpZXNcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcsIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tIFwiQGNvZGVtaXJyb3IvbGFuZ3VhZ2VcIjtcbmltcG9ydCB7IEVkaXRvclN0YXRlfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IFN5bnRheE5vZGUsIFRyZWVDdXJzb3IgfSBmcm9tIFwiQGxlemVyL2NvbW1vblwiO1xuaW1wb3J0IE1vc2hlIGZyb20gXCIuL21haW5cIjtcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tIFwiLi91dGlscy9jb250ZXh0XCI7XG5pbXBvcnQgeyByZXBsYWNlUmFuZ2UsIHNldEN1cnNvciB9IGZyb20gXCIuL2VkaXRvciB1dGlsaXRpZXMvZWRpdG9yX3V0aWxzXCI7XG5cblxuY2xhc3MgU3VnZ2VzdG9yVHJpZ2dlcntcblx0dGV4dDogc3RyaW5nXG5cdGNvZGVCbG9ja1RleHQ6IHN0cmluZztcblx0Y29uc3RydWN0b3IoY3R4OiBDb250ZXh0LCB2aWV3OiBFZGl0b3JWaWV3KXtcblx0XHR0aGlzLnRleHQ9dGhpcy5nZXRDdXJyZW50TGluZVRleHQoY3R4LnBvcywgdmlldylcblx0fVxuXHRzZXRUcmlnZ2VyKHRyaWdnZXI6IHN0cmluZyl7XG5cblx0fVxuXHRnZXRDdXJyZW50TGluZVRleHQocG9zOiBudW1iZXIsIHZpZXc6IEVkaXRvclZpZXcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcblx0XHQvL2NvbnN0IGN1cnNvck9mZnNldEluTGluZSA9IChwb3MrMikgLSBsaW5lLmZyb207SSBkb24ndCBrbm93IHdoeSBJIGhhZCB0aGlzIGhlcmVcblx0XHRjb25zdCB0ZXh0VXBUb0N1cnNvciA9IGxpbmUudGV4dC5zbGljZSgwLCBwb3MtIGxpbmUuZnJvbSkudHJpbSgpO1xuXHRcdGNvbnN0IHdvcmRzID0gdGV4dFVwVG9DdXJzb3Iuc3BsaXQoLyhbXFxzLFxcW1xcXSgpe307XXwtLVxcK1xcK3wtLVxcK3wtLSkrLyk7XG5cdFx0Y29uc3Qgd29yZD13b3Jkc1t3b3Jkcy5sZW5ndGggLSAxXXx8Jyc7XG5cdFx0Y29uc29sZS5sb2cod29yZClcblx0XHQvKiBDaGVja3MgdGhhdCBuZWVkIHRvIGJlIG1hZGVcblx0XHQxLiBJbiB3aGF0IGNvbW1hbmQgYXJlIHdlIGluIGlmIGFueS5cblx0XHQyLiBBcmUgd2UgaW5wdXR0aW5nIGEgVmFyaWFibGUgYSBjb29yZGluYXRlIG9yIGZvcm1hdHRpbmcuXG5cdFx0My4gaWYgRm9ybWF0dGluZyBBcmUgd2Ugc3RhcnRpbmcgdG8gdHlwZSBhIGNvbW1hbmQgb3IgYXJlIHdlIGlucHV0dGluZyBhIHZhbHVlIHRvIGEgY29tbWFuZFxuXHRcdCovXG5cdFx0cmV0dXJuIHdvcmRzW3dvcmRzLmxlbmd0aCAtIDFdIHx8IFwiXCI7XG5cdH1cblx0Z2V0Q29kZUJsb2NrVGV4dChjdHg6IENvbnRleHQsdmlldzogRWRpdG9yVmlldyl7XG5cdFx0Y29uc3QgZG9jID0gdmlldy5zdGF0ZS5kb2M7XG5cdFx0Y29uc3QgeyBudW1iZXIgfSA9IGRvYy5saW5lQXQoY3R4LnBvcyk7XG5cblx0XHRjb25zdCBiZWZvcmVMaW5lID0gZmluZExpbmUodmlldy5zdGF0ZSxudW1iZXIsLTEsJ2BgYCcpO1xuXHRcdGNvbnN0IGFmdGVyTGluZSA9ICBmaW5kTGluZSh2aWV3LnN0YXRlLG51bWJlciwxLCdgYGAnKTs7XG5cdFx0aWYgKCFiZWZvcmVMaW5lIHx8ICFhZnRlckxpbmUpIHJldHVybiBudWxsO1xuXHRcdGNvbnN0IGJldHdlZW5UZXh0ID0gZG9jLnNsaWNlU3RyaW5nKGJlZm9yZUxpbmUudG8sIGFmdGVyTGluZS5mcm9tKS50cmltKCk7XG5cdFx0Y29uc3QgcmVsYXRpdmVQb3MgPSBjdHgucG9zIC0gYmVmb3JlTGluZS50bztcblx0XHRyZXR1cm4gYmV0d2VlblRleHRcblx0fVxufVxuXG5jb25zdCBmaW5kTGluZSA9IChzdGF0ZTogRWRpdG9yU3RhdGUsIGxpbmVOdW1iZXI6IG51bWJlcixkaXI6IG51bWJlciwgc3RhcnRzV2l0aDogc3RyaW5nKSA9PiB7XG5cdGNvbnN0IHtkb2N9PXN0YXRlXG5cdGZvciAobGV0IGkgPSBsaW5lTnVtYmVyICsgZGlyOyBpID4gMCAmJiBpIDw9IGRvYy5saW5lczsgaSArPSBkaXIpIHtcblx0Y29uc3QgbGluZSA9IGRvYy5saW5lKGkpLnRleHQudHJpbSgpO1xuXHRpZiAobGluZS5zdGFydHNXaXRoKHN0YXJ0c1dpdGgpKSByZXR1cm4gZG9jLmxpbmUoaSk7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59O1xuXG5leHBvcnQgY2xhc3MgU3VnZ2VzdG9yIHtcblx0cHJpdmF0ZSB0cmlnZ2VyOiBTdWdnZXN0b3JUcmlnZ2VyO1xuXHRzZWxlY3Rpb25JbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIGNvbnRleHQ6IENvbnRleHQ7XG5cdGlzU3VnZ2VzdGVyRGVwbG95ZWQ6IGJvb2xlYW49ZmFsc2U7XG5cblx0ZGVwbG95U3VnZ2VzdG9yKGNvbnRleHQ6IENvbnRleHQsdmlldzogRWRpdG9yVmlldyl7XG5cdFx0Y29uc29sZS5sb2coXCJzamRzamRcIilcblx0XHR0aGlzLnJlbW92ZVN1Z2dlc3RvcigpXG5cdFx0dGhpcy5jb250ZXh0PWNvbnRleHQ7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM9dGhpcy5nZXRTdWdnZXN0aW9ucyh2aWV3KVxuXHRcdGlmKHN1Z2dlc3Rpb25zLmxlbmd0aDwxKXJldHVybjtcblxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25Ecm9wZG93biA9IGNyZWF0ZUZsb2F0aW5nU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zLHZpZXcsIHRoaXMuY29udGV4dC5wb3MpO1xuXHRcdGlmICghc3VnZ2VzdGlvbkRyb3Bkb3duKSByZXR1cm47XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzdWdnZXN0aW9uRHJvcGRvd24pO1xuXHRcdHRoaXMuaXNTdWdnZXN0ZXJEZXBsb3llZD10cnVlO1xuXHRcdHRoaXMuc2VsZWN0aW9uSW5kZXg9MDtcblx0XHR0aGlzLnVwZGF0ZVNlbGVjdGlvbih0aGlzLmdldEFsbGRyb3Bkb3duSXRlbXMoKSk7XG5cblx0fVxuXHR1cGRhdGVTdWdnZXN0b3JQb3NpdGlvbigpe1xuXG5cdH1cblxuXHRyZW1vdmVTdWdnZXN0b3IoKSB7XG5cdFx0ZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKS5mb3JFYWNoKG5vZGUgPT4gbm9kZS5yZW1vdmUoKSk7XG5cdFx0ZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yKFwiLnN1Z2dlc3Rpb24tZHJvcGRvd25cIik/LnJlbW92ZSgpXG5cdFx0dGhpcy5pc1N1Z2dlc3RlckRlcGxveWVkPWZhbHNlO1xuXHR9XG5cblx0Z2V0QWxsZHJvcGRvd25JdGVtcygpe3JldHVybiBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpfVxuXHRwcml2YXRlIGRyb3Bkb3duaWZBbnlEZXBsb3llZCgpe3JldHVybiBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCIuc3VnZ2VzdGlvbi1kcm9wZG93blwiKX1cblxuXHRwcml2YXRlIGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbihldmVudDogS2V5Ym9hcmRFdmVudCx2aWV3OkVkaXRvclZpZXcpIHtcblx0XHRjb25zdCBkcm9wZG93biA9IHRoaXMuZHJvcGRvd25pZkFueURlcGxveWVkKCk7XG5cdFx0aWYgKCFkcm9wZG93biB8fCB0aGlzLnNlbGVjdGlvbkluZGV4ID09PSB1bmRlZmluZWQpIHJldHVybjtcblx0XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEFsbGRyb3Bkb3duSXRlbXMoKTtcblxuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHJldHVybjtcblx0XHRcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3VnZ2VzdGlvbnModmlldzogRWRpdG9yVmlldykge1xuXHRcdHRoaXMudHJpZ2dlcj1uZXcgU3VnZ2VzdG9yVHJpZ2dlcih0aGlzLmNvbnRleHQsIHZpZXcpXG5cdFx0Y29uc3QgYWxsU3VnZ2VzdGlvbnMgPSBnZXRUaWt6U3VnZ2VzdGlvbnMoKS5tYXAocyA9PiBzLnRyaWdnZXJ8fHMucmVwbGFjZW1lbnQpO1xuXHRcblx0XHRjb25zdCBmaWx0ZXJlZFN1Z2dlc3Rpb25zID0gYWxsU3VnZ2VzdGlvbnMuZmlsdGVyKChzdWdnZXN0aW9uKSA9PlxuXHRcdFx0c3VnZ2VzdGlvbi50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgodGhpcy50cmlnZ2VyLnRleHQudG9Mb3dlckNhc2UoKSlcblx0XHQpO1xuXHRcblx0XHRjb25zdCBzb3J0ZWRTdWdnZXN0aW9ucyA9IGZpbHRlcmVkU3VnZ2VzdGlvbnMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Y29uc3QgbG93ZXJMYXN0V29yZCA9IHRoaXMudHJpZ2dlci50ZXh0LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCBhTG93ZXIgPSBhLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCBiTG93ZXIgPSBiLnRvTG93ZXJDYXNlKCk7XG5cdFxuXG5cdFx0XHRjb25zdCBhRXhhY3RNYXRjaCA9IGFMb3dlciA9PT0gbG93ZXJMYXN0V29yZCA/IC0xIDogMDtcblx0XHRcdGNvbnN0IGJFeGFjdE1hdGNoID0gYkxvd2VyID09PSBsb3dlckxhc3RXb3JkID8gLTEgOiAwO1xuXHRcdFx0aWYgKGFFeGFjdE1hdGNoICE9PSBiRXhhY3RNYXRjaCkgcmV0dXJuIGFFeGFjdE1hdGNoIC0gYkV4YWN0TWF0Y2g7XG5cdFxuXHRcdFx0aWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7XG5cdFxuXHRcdFx0cmV0dXJuIGFMb3dlci5sb2NhbGVDb21wYXJlKGJMb3dlcik7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHNvcnRlZFN1Z2dlc3Rpb25zO1xuXHR9XG5cblx0XG5cblx0dXBkYXRlU2VsZWN0aW9uKGl0ZW1zOiBOb2RlTGlzdE9mPEVsZW1lbnQ+KSB7XG5cdFx0aXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcblx0XHRcdGlmIChpbmRleCA9PT0gdGhpcy5zZWxlY3Rpb25JbmRleCkge1xuXHRcdFx0XHRpdGVtLmNsYXNzTGlzdC5hZGQoXCJzZWxlY3RlZFwiKTtcblx0XHRcdFx0aXRlbS5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGl0ZW0uY2xhc3NMaXN0LnJlbW92ZShcInNlbGVjdGVkXCIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0c2VsZWN0RHJvcGRvd25JdGVtKGl0ZW06IEVsZW1lbnQsdmlldzogRWRpdG9yVmlldykge1xuXHRcdHRoaXMucmVtb3ZlU3VnZ2VzdG9yKClcblx0XHRpZighdGhpcy5jb250ZXh0KXJldHVybiA7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRUZXh0ID0gaXRlbS50ZXh0Q29udGVudCB8fCBcIlwiO1xuXHRcdGNvbnN0IHBvcz10aGlzLmNvbnRleHQucG9zO1xuXHRcdHJlcGxhY2VSYW5nZSh2aWV3LHBvcy10aGlzLnRyaWdnZXIudGV4dC5sZW5ndGgscG9zLHNlbGVjdGVkVGV4dClcblx0XHR2aWV3LmZvY3VzKCk7XG5cdFx0c2V0Q3Vyc29yKHZpZXcsY2FsY3VsYXRlTmV3Q3Vyc29yUG9zaXRpb24odGhpcy50cmlnZ2VyLnRleHQsc2VsZWN0ZWRUZXh0LHBvcykpXG5cdFx0Y29uc29sZS5sb2coYFNlbGVjdGVkOiAke3NlbGVjdGVkVGV4dH1gKTtcblx0fVxufVxuZnVuY3Rpb24gY2FsY3VsYXRlTmV3Q3Vyc29yUG9zaXRpb24odHJpZ2dlclRleHQ6IHN0cmluZywgc2VsZWN0ZWRUZXh0OiBzdHJpbmcsIG9yaWdpbmFsUG9zOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IGxlbmd0aERpZmZlcmVuY2UgPSBzZWxlY3RlZFRleHQubGVuZ3RoIC0gdHJpZ2dlclRleHQubGVuZ3RoO1xuICAgIHJldHVybiBvcmlnaW5hbFBvcyArIGxlbmd0aERpZmZlcmVuY2U7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZsb2F0aW5nU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zOiBhbnlbXSxlZGl0b3JWaWV3OiBFZGl0b3JWaWV3LCBwb3NpdGlvbjogbnVtYmVyKSB7XG5cbiAgICBjb25zdCBjb29yZGluYXRlcyA9IGVkaXRvclZpZXcuY29vcmRzQXRQb3MocG9zaXRpb24pO1xuICAgIGlmICghY29vcmRpbmF0ZXMpIHJldHVybjtcblxuICAgIGNvbnN0IHN1Z2dlc3Rpb25Ecm9wZG93biA9IGNyZWF0ZVN1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9ucyk7XG5cbiAgICBzdWdnZXN0aW9uRHJvcGRvd24uc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgc3VnZ2VzdGlvbkRyb3Bkb3duLnN0eWxlLmxlZnQgPSBgJHtjb29yZGluYXRlcy5sZWZ0fXB4YDtcbiAgICBzdWdnZXN0aW9uRHJvcGRvd24uc3R5bGUudG9wID0gYCR7Y29vcmRpbmF0ZXMuYm90dG9tfXB4YDtcblx0cmV0dXJuIHN1Z2dlc3Rpb25Ecm9wZG93bjtcbn1cblxuXG5mdW5jdGlvbiBjcmVhdGVTdWdnZXN0aW9uRHJvcGRvd24oc3VnZ2VzdGlvbnM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgZHJvcGRvd25Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGRyb3Bkb3duQ29udGFpbmVyLmNsYXNzTmFtZSA9IFwic3VnZ2VzdGlvbi1kcm9wZG93blwiO1xuXG4gICAgc3VnZ2VzdGlvbnMuZm9yRWFjaCgoc3VnZ2VzdGlvbikgPT4ge1xuICAgICAgICBjb25zdCBpdGVtID0gY3JlYXRlU3VnZ2VzdGlvbkl0ZW0oc3VnZ2VzdGlvbilcblx0XHRkcm9wZG93bkNvbnRhaW5lci5hcHBlbmRDaGlsZChpdGVtKVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGRyb3Bkb3duQ29udGFpbmVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTdWdnZXN0aW9uSXRlbShkaXNwbGF5VGV4dDogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuXHQvLyBDcmVhdGUgdGhlIG91dGVyIHN1Z2dlc3Rpb24gaXRlbSBjb250YWluZXJcblx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJzdWdnZXN0aW9uLWl0ZW1cIik7XG5cdGNvbnRhaW5lci5pbm5lclRleHQ9ZGlzcGxheVRleHRcbiAgXHRyZXR1cm4gY29udGFpbmVyXG5cdC8vIENyZWF0ZSB0aGUgaWNvbiBjb250YWluZXJcblx0Y29uc3QgaWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdGljb24uY2xhc3NMaXN0LmFkZChcImljb25cIik7XG5cdGljb24udGV4dENvbnRlbnQgPSBcIsaSXCI7IC8vIFBsYWNlaG9sZGVyIGljb24gY29udGVudFxuICBcblx0Ly8gQ3JlYXRlIHRoZSBkZXRhaWxzIGNvbnRhaW5lclxuXHRjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0ZGV0YWlscy5jbGFzc0xpc3QuYWRkKFwiZGV0YWlsc1wiKTtcbiAgXG5cdC8vIEFkZCBhIG5hbWUgc3BhbiB0byBkZXRhaWxzXG5cdGNvbnN0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcblx0bmFtZS5jbGFzc0xpc3QuYWRkKFwibmFtZVwiKTtcblx0bmFtZS50ZXh0Q29udGVudCA9IFwiZnVuY3Rpb25cIjsgLy8gUGxhY2Vob2xkZXIgbmFtZSBjb250ZW50XG4gIFxuXHQvLyBBZGQgYSB0eXBlIHNwYW4gdG8gZGV0YWlsc1xuXHRjb25zdCB0eXBlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG5cdHR5cGUuY2xhc3NMaXN0LmFkZChcInR5cGVcIik7XG5cdHR5cGUudGV4dENvbnRlbnQgPSBcIktleXdvcmRcIjsgLy8gUGxhY2Vob2xkZXIgdHlwZSBjb250ZW50XG4gIFxuXHQvLyBBcHBlbmQgbmFtZSBhbmQgdHlwZSB0byBkZXRhaWxzXG5cdGRldGFpbHMuYXBwZW5kQ2hpbGQobmFtZSk7XG5cdGRldGFpbHMuYXBwZW5kQ2hpbGQodHlwZSk7XG4gIFxuXHQvLyBBcHBlbmQgaWNvbiBhbmQgZGV0YWlscyB0byB0aGUgY29udGFpbmVyXG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChpY29uKTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xuICBcblx0cmV0dXJuIGNvbnRhaW5lcjtcbn1cblxuXG5cblxuXG5cbi8qXG5leHBvcnQgY2xhc3MgTnVtZXJhbHNTdWdnZXN0b3IgZXh0ZW5kcyBFZGl0b3JTdWdnZXN0PHN0cmluZz4ge1xuXHRwbHVnaW46IE51bWVyYWxzUGx1Z2luO1xuXHRcblx0LyoqXG5cdCAqIFRpbWUgb2YgbGFzdCBzdWdnZXN0aW9uIGxpc3QgdXBkYXRlXG5cdCAqIEB0eXBlIHtudW1iZXJ9XG5cdCAqIEBwcml2YXRlIFxuXHRwcml2YXRlIGxhc3RTdWdnZXN0aW9uTGlzdFVwZGF0ZTogbnVtYmVyID0gMDtcblxuXHQvKipcblx0ICogTGlzdCBvZiBwb3NzaWJsZSBzdWdnZXN0aW9ucyBiYXNlZCBvbiBjdXJyZW50IGNvZGUgYmxvY2tcblx0ICogQHR5cGUge3N0cmluZ1tdfVxuXHQgKiBAcHJpdmF0ZSBcblx0cHJpdmF0ZSBsb2NhbFN1Z2dlc3Rpb25DYWNoZTogc3RyaW5nW10gPSBbXTtcblxuXHQvL2VtcHR5IGNvbnN0cnVjdG9yXG5cdGNvbnN0cnVjdG9yKHBsdWdpbjogTnVtZXJhbHNQbHVnaW4pIHtcblx0XHRzdXBlcihwbHVnaW4uYXBwKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdG9uVHJpZ2dlcihjdXJzb3I6IEVkaXRvclBvc2l0aW9uLCBlZGl0b3I6IEVkaXRvciwgZmlsZTogVEZpbGUpOiBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8gfCBudWxsIHtcblxuXHRcdGNvbnN0IGNtRWRpdG9yID0gZWRpdG9yIGFzIGFueTtcblx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xuXHRcdGlmICh2aWV3ID09PSBudWxsKSByZXR1cm4gbnVsbDtcblx0XHRjb25zdCBjb2RlYmxvY2tMZW5nPWxhbmdJZldpdGhpbkNvZGVibG9jayh2aWV3LnN0YXRlKVxuXHRcdGNvbnN0IGlzTWF0aEJsb2NrPWNvZGVibG9ja0xlbmc/LmNvbnRhaW5zKCd0aWt6JylcblxuXHRcdGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xuXHRcdGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcblx0XHQvL2NvbnN0IGRvbU5vZGUgPSB2aWV3LmRvbUF0UG9zKGxpbmUuZnJvbSkubm9kZTtcblx0XHRpZiAoIWlzTWF0aEJsb2NrKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0XG5cblx0XHQvLyBHZXQgbGFzdCB3b3JkIGluIGN1cnJlbnQgbGluZVxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcykudGV4dDtcblx0XHRjb25zdCBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPSBjdXJyZW50TGluZS5zZWFyY2goL1s6XT9bJEBcXHdcXHUwMzcwLVxcdTAzRkZdKyQvKTtcblx0XHQvLyBpZiB0aGVyZSBpcyBubyB3b3JkLCByZXR1cm4gbnVsbFxuXHRcdGlmIChjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHtsaW5lOiBjdXJzb3IubGluZSwgY2g6IGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydH0sXG5cdFx0XHRlbmQ6IGN1cnNvcixcblx0XHRcdHF1ZXJ5OiBjdXJyZW50TGluZS5zbGljZShjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQpXG5cdFx0fTtcblx0fVxuXG5cdGdldFN1Z2dlc3Rpb25zKGNvbnRleHQ6IEVkaXRvclN1Z2dlc3RDb250ZXh0KTogc3RyaW5nW10gfCBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0bGV0IGxvY2FsU3ltYm9sczogc3RyaW5nIFtdID0gW107XHRcblxuXHRcdGxvY2FsU3ltYm9scyA9IHRoaXMubG9jYWxTdWdnZXN0aW9uQ2FjaGVcblx0XHRjb25zdCBxdWVyeSA9IGNvbnRleHQucXVlcnkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGNvbnN0IGxvY2FsX3N1Z2dlc3Rpb25zID0gbG9jYWxTeW1ib2xzLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDIpKTtcblx0XHRsb2NhbF9zdWdnZXN0aW9ucy5zb3J0KChhLCBiKSA9PiBhLnNsaWNlKDIpLmxvY2FsZUNvbXBhcmUoYi5zbGljZSgyKSkpO1xuXHRcdFxuXHRcdC8vIGNhc2UtaW5zZW5zaXRpdmUgZmlsdGVyIG1hdGhqcyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBxdWVyeS4gRG9uJ3QgcmV0dXJuIHZhbHVlIGlmIGZ1bGwgbWF0Y2hcblx0XHRsZXQgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBtYXRoanNfc3VnZ2VzdGlvbnMgPSBnZXRNYXRoSnNTeW1ib2xzKCkuZmlsdGVyKChvYmo6IExhdGV4KSA9PiBvYmoudmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMikpO1xuXG5cdFx0c3VnZ2VzdGlvbnMgPSBtYXRoanNfc3VnZ2VzdGlvbnMubWFwKChvOkxhdGV4KT0+by52YWx1ZSkvL2xvY2FsX3N1Z2dlc3Rpb25zLmNvbmNhdChtYXRoanNfc3VnZ2VzdGlvbnMpO1xuXG5cdFx0LypzdWdnZXN0aW9ucyA9IHN1Z2dlc3Rpb25zLmNvbmNhdChcblx0XHRcdG51bWVyYWxzRGlyZWN0aXZlc1xuXHRcdFx0XHQuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAwKSlcblx0XHRcdFx0Lm1hcCgodmFsdWUpID0+ICdtfCcgKyB2YWx1ZSlcblx0XHRcdCk7XG5cblx0XHRyZXR1cm4gc3VnZ2VzdGlvbnM7XG5cdH1cblxuXHRyZW5kZXJTdWdnZXN0aW9uKHZhbHVlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGVsLnNldFRleHQodmFsdWUpLypcblx0XHRlbC5hZGRDbGFzc2VzKFsnbW9kLWNvbXBsZXgnLCAnbnVtZXJhbHMtc3VnZ2VzdGlvbiddKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uQ29udGVudCA9IGVsLmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1jb250ZW50J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25UaXRsZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi10aXRsZSd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uTm90ZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1ub3RlJ30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25BdXggPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tYXV4J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25GbGFpciA9IHN1Z2dlc3Rpb25BdXguY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWZsYWlyJ30pOyovXG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXVudXNlZC12YXJzXG5cdFx0Lypcblx0XHRjb25zdCBbaWNvblR5cGUsIHN1Z2dlc3Rpb25UZXh0LCBub3RlVGV4dF0gPSB2YWx1ZS5zcGxpdCgnfCcpO1xuXG5cdFx0aWYgKGljb25UeXBlID09PSAnZicpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZnVuY3Rpb24tc3F1YXJlJyk7XHRcdFxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdjJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdsb2NhdGUtZml4ZWQnKTtcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAndicpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZmlsZS1jb2RlJyk7XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ3AnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2JveCcpO1xuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdtJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdzcGFya2xlcycpO1x0XHRcdFxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdnJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdjYXNlLWxvd2VyJyk7IC8vIEFzc3VtaW5nICdzeW1ib2wnIGlzIGEgdmFsaWQgaWNvbiBuYW1lXG5cdFx0fVxuXHRcdHN1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHN1Z2dlc3Rpb25UZXh0KTtcblx0XHRpZiAobm90ZVRleHQpIHtcblx0XHRcdHN1Z2dlc3Rpb25Ob3RlLnNldFRleHQobm90ZVRleHQpO1xuXHRcdH1cblx0XHQvL3N1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHZhbHVlKTtcblxuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIGEgc3VnZ2VzdGlvbiBpcyBzZWxlY3RlZC4gUmVwbGFjZXMgdGhlIGN1cnJlbnQgd29yZCB3aXRoIHRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXG5cdCAqIEBwYXJhbSB2YWx1ZSBUaGUgc2VsZWN0ZWQgc3VnZ2VzdGlvblxuXHQgKiBAcGFyYW0gZXZ0IFRoZSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgc2VsZWN0aW9uXG5cdCAqIEByZXR1cm5zIHZvaWRcblx0IFxuXG5cdHNlbGVjdFN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZXZ0OiBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRleHQpIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuY29udGV4dC5lZGl0b3I7XG5cdFx0XHRcblx0XHRcdGNvbnN0IGNtRWRpdG9yID0gZWRpdG9yIGFzIGFueTtcblx0XHRcdGNvbnN0IHZpZXcgPSBjbUVkaXRvci5jbSA/IChjbUVkaXRvci5jbSBhcyBFZGl0b3JWaWV3KSA6IG51bGw7XG5cdFx0XHRpZiAodmlldyA9PT0gbnVsbCkgcmV0dXJuO1xuXHRcblx0XHRcdGNvbnN0IGN1cnNvciA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW47XG5cdFx0XHRjb25zdCBmcm9tID0gY3Vyc29yLmZyb207XG5cdFx0XHRjb25zdCB0byA9IGN1cnNvci50bzsgXG5cdFxuXHRcdFx0dmlldy5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5nZXM6IHsgZnJvbSwgdG8sIGluc2VydDogdmFsdWUgfSxcblx0XHRcdFx0c2VsZWN0aW9uOiB7IGFuY2hvcjogZnJvbSArIHZhbHVlLmxlbmd0aCB9XG5cdFx0XHR9KTtcblx0XHRcdFxuXHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdH1cblx0fVxufVxuKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXJhY3RlckF0UG9zKHZpZXdPclN0YXRlOiBFZGl0b3JWaWV3IHwgRWRpdG9yU3RhdGUsIHBvczogbnVtYmVyKSB7XG5cdGNvbnN0IHN0YXRlID0gdmlld09yU3RhdGUgaW5zdGFuY2VvZiBFZGl0b3JWaWV3ID8gdmlld09yU3RhdGUuc3RhdGUgOiB2aWV3T3JTdGF0ZTtcblx0Y29uc3QgZG9jID0gc3RhdGUuZG9jO1xuXHRyZXR1cm4gZG9jLnNsaWNlKHBvcywgcG9zKzEpLnRvU3RyaW5nKCk7XG59XG5cblxuIFxuY29uc3QgbGFuZ0lmV2l0aGluQ29kZWJsb2NrID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IHN0cmluZyB8IG51bGwgPT4ge1xuXHRjb25zdCB0cmVlID0gc3ludGF4VHJlZShzdGF0ZSk7XG5cblx0Y29uc3QgcG9zID0gc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xuXG5cdC8qXG5cdCogZ2V0IGEgdHJlZSBjdXJzb3IgYXQgdGhlIHBvc2l0aW9uXG5cdCpcblx0KiBBIG5ld2xpbmUgZG9lcyBub3QgYmVsb25nIHRvIGFueSBzeW50YXggbm9kZXMgZXhjZXB0IGZvciB0aGUgRG9jdW1lbnQsXG5cdCogd2hpY2ggY29ycmVzcG9uZHMgdG8gdGhlIHdob2xlIGRvY3VtZW50LiBTbywgd2UgY2hhbmdlIHRoZSBgbW9kZWAgb2YgdGhlXG5cdCogYGN1cnNvckF0YCBkZXBlbmRpbmcgb24gd2hldGhlciB0aGUgY2hhcmFjdGVyIGp1c3QgYmVmb3JlIHRoZSBjdXJzb3IgaXMgYVxuXHQqIG5ld2xpbmUuXG5cdCovXG5cdGNvbnN0IGN1cnNvciA9XG5cdFx0cG9zID09PSAwIHx8IGdldENoYXJhY3RlckF0UG9zKHN0YXRlLCBwb3MgLSAxKSA9PT0gXCJcXG5cIlxuXHRcdD8gdHJlZS5jdXJzb3JBdChwb3MsIDEpXG5cdFx0OiB0cmVlLmN1cnNvckF0KHBvcywgLTEpO1xuXG5cdC8vIGNoZWNrIGlmIHdlJ3JlIGluIGEgY29kZWJsb2NrIGF0bSBhdCBhbGxcblx0Y29uc3QgaW5Db2RlYmxvY2sgPSBjdXJzb3IubmFtZS5jb250YWlucyhcImNvZGVibG9ja1wiKTtcblx0aWYgKCFpbkNvZGVibG9jaykge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Ly8gbG9jYXRlIHRoZSBzdGFydCBvZiB0aGUgYmxvY2tcblx0Y29uc3QgY29kZWJsb2NrQmVnaW4gPSBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yLCBEaXJlY3Rpb24uQmFja3dhcmQsIFwiSHlwZXJNRC1jb2RlYmxvY2tfSHlwZXJNRC1jb2RlYmxvY2stYmVnaW5cIik7XG5cblx0aWYgKGNvZGVibG9ja0JlZ2luID09IG51bGwpIHtcblx0XHRjb25zb2xlLndhcm4oXCJ1bmFibGUgdG8gbG9jYXRlIHN0YXJ0IG9mIHRoZSBjb2RlYmxvY2sgZXZlbiB0aG91Z2ggaW5zaWRlIG9uZVwiKTtcblx0XHRyZXR1cm4gXCJcIjtcblx0fVxuXG5cdC8vIGV4dHJhY3QgdGhlIGxhbmd1YWdlXG5cdC8vIGNvZGVibG9ja3MgbWF5IHN0YXJ0IGFuZCBlbmQgd2l0aCBhbiBhcmJpdHJhcnkgbnVtYmVyIG9mIGJhY2t0aWNrc1xuXHRjb25zdCBsYW5ndWFnZSA9IHN0YXRlLnNsaWNlRG9jKGNvZGVibG9ja0JlZ2luLmZyb20sIGNvZGVibG9ja0JlZ2luLnRvKS5yZXBsYWNlKC9gKy8sIFwiXCIpO1xuXG5cdHJldHVybiBsYW5ndWFnZTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZXNjYWxhdGVUb1Rva2VuKGN1cnNvcjogVHJlZUN1cnNvciwgZGlyOiBEaXJlY3Rpb24sIHRhcmdldDogc3RyaW5nKTogU3ludGF4Tm9kZSB8IG51bGwge1xuXHQvLyBBbGxvdyB0aGUgc3RhcnRpbmcgbm9kZSB0byBiZSBhIG1hdGNoXG5cdGlmIChjdXJzb3IubmFtZS5jb250YWlucyh0YXJnZXQpKSB7XG5cdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xuXHR9XG5cblx0d2hpbGUgKFxuXHRcdChjdXJzb3IubmFtZSAhPSBcIkRvY3VtZW50XCIpICYmXG5cdFx0KChkaXIgPT0gRGlyZWN0aW9uLkJhY2t3YXJkICYmIGN1cnNvci5wcmV2KCkpXG5cdFx0fHwgKGRpciA9PSBEaXJlY3Rpb24uRm9yd2FyZCAmJiBjdXJzb3IubmV4dCgpKVxuXHRcdHx8IGN1cnNvci5wYXJlbnQoKSlcblx0KSB7XG5cdFx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcblx0XHRcdHJldHVybiBjdXJzb3Iubm9kZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGVudW0gRGlyZWN0aW9uIHtcblx0QmFja3dhcmQsXG5cdEZvcndhcmQsXG59Il19