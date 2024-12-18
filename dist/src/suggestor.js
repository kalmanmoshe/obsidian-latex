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
        console.log('pos-this.trigger.text.length,pos,selectedText', pos - this.trigger.text.length, pos, selectedText);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsa0JBQWtCLEdBQUksTUFBTSxhQUFhLENBQUM7QUFDbkQsT0FBTyxFQUFFLFVBQVUsR0FBRyxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUtsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFFLE1BQU0sZ0JBQWdCO0lBQ3JCLElBQUksQ0FBUTtJQUNaLGFBQWEsQ0FBUztJQUN0QixZQUFZLEdBQVksRUFBRSxJQUFnQjtRQUN6QyxJQUFJLENBQUMsSUFBSSxHQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFBO0lBQ2pELENBQUM7SUFDRCxVQUFVLENBQUMsT0FBZTtJQUUxQixDQUFDO0lBQ0Qsa0JBQWtCLENBQUMsR0FBVyxFQUFFLElBQWdCO1FBQy9DLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxpRkFBaUY7UUFDakYsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsR0FBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakUsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sSUFBSSxHQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFFLEVBQUUsQ0FBQztRQUN2QyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFB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RUFDbEIsQ0FBQztRQUNGLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNsQyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDcEIsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFFRCxNQUFNLENBQU4sSUFBWSxTQUdYO0FBSEQsV0FBWSxTQUFTO0lBQ3BCLGlEQUFRLENBQUE7SUFDUiwrQ0FBTyxDQUFBO0FBQ1IsQ0FBQyxFQUhXLFNBQVMsS0FBVCxTQUFTLFFBR3BCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZ2V0VGlrelN1Z2dlc3Rpb25zLCAgfSBmcm9tIFwiLi91dGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgRWRpdG9yVmlldywgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XHJcbmltcG9ydCB7IEVkaXRvclN0YXRlfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgU3ludGF4Tm9kZSwgVHJlZUN1cnNvciB9IGZyb20gXCJAbGV6ZXIvY29tbW9uXCI7XHJcbmltcG9ydCBNb3NoZSBmcm9tIFwiLi9tYWluXCI7XHJcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tIFwiLi91dGlscy9jb250ZXh0XCI7XHJcbmltcG9ydCB7IHJlcGxhY2VSYW5nZSwgc2V0Q3Vyc29yIH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9lZGl0b3JfdXRpbHNcIjtcclxuXHJcblxyXG5jbGFzcyBTdWdnZXN0b3JUcmlnZ2Vye1xyXG5cdHRleHQ6IHN0cmluZ1xyXG5cdGNvZGVCbG9ja1RleHQ6IHN0cmluZztcclxuXHRjb25zdHJ1Y3RvcihjdHg6IENvbnRleHQsIHZpZXc6IEVkaXRvclZpZXcpe1xyXG5cdFx0dGhpcy50ZXh0PXRoaXMuZ2V0Q3VycmVudExpbmVUZXh0KGN0eC5wb3MsIHZpZXcpXHJcblx0fVxyXG5cdHNldFRyaWdnZXIodHJpZ2dlcjogc3RyaW5nKXtcclxuXHJcblx0fVxyXG5cdGdldEN1cnJlbnRMaW5lVGV4dChwb3M6IG51bWJlciwgdmlldzogRWRpdG9yVmlldyk6IHN0cmluZyB7XHJcblx0XHRjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XHJcblx0XHQvL2NvbnN0IGN1cnNvck9mZnNldEluTGluZSA9IChwb3MrMikgLSBsaW5lLmZyb207SSBkb24ndCBrbm93IHdoeSBJIGhhZCB0aGlzIGhlcmVcclxuXHRcdGNvbnN0IHRleHRVcFRvQ3Vyc29yID0gbGluZS50ZXh0LnNsaWNlKDAsIHBvcy0gbGluZS5mcm9tKS50cmltKCk7XHJcblx0XHRjb25zdCB3b3JkcyA9IHRleHRVcFRvQ3Vyc29yLnNwbGl0KC8oW1xccyxcXFtcXF0oKXt9O118LS1cXCtcXCt8LS1cXCt8LS0pKy8pO1xyXG5cdFx0Y29uc3Qgd29yZD13b3Jkc1t3b3Jkcy5sZW5ndGggLSAxXXx8Jyc7XHJcblx0XHRjb25zb2xlLmxvZyh3b3JkKVxyXG5cdFx0LyogQ2hlY2tzIHRoYXQgbmVlZCB0byBiZSBtYWRlXHJcblx0XHQxLiBJbiB3aGF0IGNvbW1hbmQgYXJlIHdlIGluIGlmIGFueS5cclxuXHRcdDIuIEFyZSB3ZSBpbnB1dHRpbmcgYSBWYXJpYWJsZSBhIGNvb3JkaW5hdGUgb3IgZm9ybWF0dGluZy5cclxuXHRcdDMuIGlmIEZvcm1hdHRpbmcgQXJlIHdlIHN0YXJ0aW5nIHRvIHR5cGUgYSBjb21tYW5kIG9yIGFyZSB3ZSBpbnB1dHRpbmcgYSB2YWx1ZSB0byBhIGNvbW1hbmRcclxuXHRcdCovXHJcblx0XHRyZXR1cm4gd29yZHNbd29yZHMubGVuZ3RoIC0gMV0gfHwgXCJcIjtcclxuXHR9XHJcblx0Z2V0Q29kZUJsb2NrVGV4dChjdHg6IENvbnRleHQsdmlldzogRWRpdG9yVmlldyl7XHJcblx0XHRjb25zdCBkb2MgPSB2aWV3LnN0YXRlLmRvYztcclxuXHRcdGNvbnN0IHsgbnVtYmVyIH0gPSBkb2MubGluZUF0KGN0eC5wb3MpO1xyXG5cclxuXHRcdGNvbnN0IGJlZm9yZUxpbmUgPSBmaW5kTGluZSh2aWV3LnN0YXRlLG51bWJlciwtMSwnYGBgJyk7XHJcblx0XHRjb25zdCBhZnRlckxpbmUgPSAgZmluZExpbmUodmlldy5zdGF0ZSxudW1iZXIsMSwnYGBgJyk7O1xyXG5cdFx0aWYgKCFiZWZvcmVMaW5lIHx8ICFhZnRlckxpbmUpIHJldHVybiBudWxsO1xyXG5cdFx0Y29uc3QgYmV0d2VlblRleHQgPSBkb2Muc2xpY2VTdHJpbmcoYmVmb3JlTGluZS50bywgYWZ0ZXJMaW5lLmZyb20pLnRyaW0oKTtcclxuXHRcdGNvbnN0IHJlbGF0aXZlUG9zID0gY3R4LnBvcyAtIGJlZm9yZUxpbmUudG87XHJcblx0XHRyZXR1cm4gYmV0d2VlblRleHRcclxuXHR9XHJcbn1cclxuXHJcbmNvbnN0IGZpbmRMaW5lID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSwgbGluZU51bWJlcjogbnVtYmVyLGRpcjogbnVtYmVyLCBzdGFydHNXaXRoOiBzdHJpbmcpID0+IHtcclxuXHRjb25zdCB7ZG9jfT1zdGF0ZVxyXG5cdGZvciAobGV0IGkgPSBsaW5lTnVtYmVyICsgZGlyOyBpID4gMCAmJiBpIDw9IGRvYy5saW5lczsgaSArPSBkaXIpIHtcclxuXHRjb25zdCBsaW5lID0gZG9jLmxpbmUoaSkudGV4dC50cmltKCk7XHJcblx0aWYgKGxpbmUuc3RhcnRzV2l0aChzdGFydHNXaXRoKSkgcmV0dXJuIGRvYy5saW5lKGkpO1xyXG5cdH1cclxuXHRyZXR1cm4gbnVsbDtcclxufTtcclxuXHJcbmV4cG9ydCBjbGFzcyBTdWdnZXN0b3Ige1xyXG5cdHByaXZhdGUgdHJpZ2dlcjogU3VnZ2VzdG9yVHJpZ2dlcjtcclxuXHRzZWxlY3Rpb25JbmRleDogbnVtYmVyO1xyXG5cdHByaXZhdGUgY29udGV4dDogQ29udGV4dDtcclxuXHRpc1N1Z2dlc3RlckRlcGxveWVkOiBib29sZWFuPWZhbHNlO1xyXG5cclxuXHRkZXBsb3lTdWdnZXN0b3IoY29udGV4dDogQ29udGV4dCx2aWV3OiBFZGl0b3JWaWV3KXtcclxuXHRcdHRoaXMucmVtb3ZlU3VnZ2VzdG9yKClcclxuXHRcdHRoaXMuY29udGV4dD1jb250ZXh0O1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM9dGhpcy5nZXRTdWdnZXN0aW9ucyh2aWV3KVxyXG5cdFx0aWYoc3VnZ2VzdGlvbnMubGVuZ3RoPDEpcmV0dXJuO1xyXG5cclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25Ecm9wZG93biA9IGNyZWF0ZUZsb2F0aW5nU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zLHZpZXcsIHRoaXMuY29udGV4dC5wb3MpO1xyXG5cdFx0aWYgKCFzdWdnZXN0aW9uRHJvcGRvd24pIHJldHVybjtcclxuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc3VnZ2VzdGlvbkRyb3Bkb3duKTtcclxuXHRcdHRoaXMuaXNTdWdnZXN0ZXJEZXBsb3llZD10cnVlO1xyXG5cdFx0dGhpcy5zZWxlY3Rpb25JbmRleD0wO1xyXG5cdFx0dGhpcy51cGRhdGVTZWxlY3Rpb24odGhpcy5nZXRBbGxkcm9wZG93bkl0ZW1zKCkpO1xyXG5cclxuXHR9XHJcblx0dXBkYXRlU3VnZ2VzdG9yUG9zaXRpb24oKXtcclxuXHJcblx0fVxyXG5cclxuXHRyZW1vdmVTdWdnZXN0b3IoKSB7XHJcblx0XHRkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpLmZvckVhY2gobm9kZSA9PiBub2RlLnJlbW92ZSgpKTtcclxuXHRcdGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpPy5yZW1vdmUoKVxyXG5cdFx0dGhpcy5pc1N1Z2dlc3RlckRlcGxveWVkPWZhbHNlO1xyXG5cdH1cclxuXHJcblx0Z2V0QWxsZHJvcGRvd25JdGVtcygpe3JldHVybiBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpfVxyXG5cdHByaXZhdGUgZHJvcGRvd25pZkFueURlcGxveWVkKCl7cmV0dXJuIGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpfVxyXG5cclxuXHRwcml2YXRlIGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbihldmVudDogS2V5Ym9hcmRFdmVudCx2aWV3OkVkaXRvclZpZXcpIHtcclxuXHRcdGNvbnN0IGRyb3Bkb3duID0gdGhpcy5kcm9wZG93bmlmQW55RGVwbG95ZWQoKTtcclxuXHRcdGlmICghZHJvcGRvd24gfHwgdGhpcy5zZWxlY3Rpb25JbmRleCA9PT0gdW5kZWZpbmVkKSByZXR1cm47XHJcblx0XHJcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuZ2V0QWxsZHJvcGRvd25JdGVtcygpO1xyXG5cclxuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHJldHVybjtcclxuXHRcdFxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBnZXRTdWdnZXN0aW9ucyh2aWV3OiBFZGl0b3JWaWV3KSB7XHJcblx0XHR0aGlzLnRyaWdnZXI9bmV3IFN1Z2dlc3RvclRyaWdnZXIodGhpcy5jb250ZXh0LCB2aWV3KVxyXG5cdFx0Y29uc3QgYWxsU3VnZ2VzdGlvbnMgPSBnZXRUaWt6U3VnZ2VzdGlvbnMoKS5tYXAocyA9PiBzLnRyaWdnZXJ8fHMucmVwbGFjZW1lbnQpO1xyXG5cdFxyXG5cdFx0Y29uc3QgZmlsdGVyZWRTdWdnZXN0aW9ucyA9IGFsbFN1Z2dlc3Rpb25zLmZpbHRlcigoc3VnZ2VzdGlvbikgPT5cclxuXHRcdFx0c3VnZ2VzdGlvbi50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgodGhpcy50cmlnZ2VyLnRleHQudG9Mb3dlckNhc2UoKSlcclxuXHRcdCk7XHJcblx0XHJcblx0XHRjb25zdCBzb3J0ZWRTdWdnZXN0aW9ucyA9IGZpbHRlcmVkU3VnZ2VzdGlvbnMuc29ydCgoYSwgYikgPT4ge1xyXG5cdFx0XHRjb25zdCBsb3dlckxhc3RXb3JkID0gdGhpcy50cmlnZ2VyLnRleHQudG9Mb3dlckNhc2UoKTtcclxuXHRcdFx0Y29uc3QgYUxvd2VyID0gYS50b0xvd2VyQ2FzZSgpO1xyXG5cdFx0XHRjb25zdCBiTG93ZXIgPSBiLnRvTG93ZXJDYXNlKCk7XHJcblx0XHJcblxyXG5cdFx0XHRjb25zdCBhRXhhY3RNYXRjaCA9IGFMb3dlciA9PT0gbG93ZXJMYXN0V29yZCA/IC0xIDogMDtcclxuXHRcdFx0Y29uc3QgYkV4YWN0TWF0Y2ggPSBiTG93ZXIgPT09IGxvd2VyTGFzdFdvcmQgPyAtMSA6IDA7XHJcblx0XHRcdGlmIChhRXhhY3RNYXRjaCAhPT0gYkV4YWN0TWF0Y2gpIHJldHVybiBhRXhhY3RNYXRjaCAtIGJFeGFjdE1hdGNoO1xyXG5cdFxyXG5cdFx0XHRpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDtcclxuXHRcclxuXHRcdFx0cmV0dXJuIGFMb3dlci5sb2NhbGVDb21wYXJlKGJMb3dlcik7XHJcblx0XHR9KTtcclxuXHRcdHJldHVybiBzb3J0ZWRTdWdnZXN0aW9ucztcclxuXHR9XHJcblxyXG5cdFxyXG5cclxuXHR1cGRhdGVTZWxlY3Rpb24oaXRlbXM6IE5vZGVMaXN0T2Y8RWxlbWVudD4pIHtcclxuXHRcdGl0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XHJcblx0XHRcdGlmIChpbmRleCA9PT0gdGhpcy5zZWxlY3Rpb25JbmRleCkge1xyXG5cdFx0XHRcdGl0ZW0uY2xhc3NMaXN0LmFkZChcInNlbGVjdGVkXCIpO1xyXG5cdFx0XHRcdGl0ZW0uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogXCJuZWFyZXN0XCIgfSk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0aXRlbS5jbGFzc0xpc3QucmVtb3ZlKFwic2VsZWN0ZWRcIik7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0c2VsZWN0RHJvcGRvd25JdGVtKGl0ZW06IEVsZW1lbnQsdmlldzogRWRpdG9yVmlldykge1xyXG5cdFx0dGhpcy5yZW1vdmVTdWdnZXN0b3IoKVxyXG5cdFx0aWYoIXRoaXMuY29udGV4dClyZXR1cm4gO1xyXG5cdFx0Y29uc3Qgc2VsZWN0ZWRUZXh0ID0gaXRlbS50ZXh0Q29udGVudCB8fCBcIlwiO1xyXG5cdFx0Y29uc3QgcG9zPXRoaXMuY29udGV4dC5wb3M7XHJcblx0XHRjb25zb2xlLmxvZygncG9zLXRoaXMudHJpZ2dlci50ZXh0Lmxlbmd0aCxwb3Msc2VsZWN0ZWRUZXh0Jyxwb3MtdGhpcy50cmlnZ2VyLnRleHQubGVuZ3RoLHBvcyxzZWxlY3RlZFRleHQpXHJcblx0XHRyZXBsYWNlUmFuZ2Uodmlldyxwb3MtdGhpcy50cmlnZ2VyLnRleHQubGVuZ3RoLHBvcyxzZWxlY3RlZFRleHQpXHJcblx0XHR2aWV3LmZvY3VzKCk7XHJcblx0XHRzZXRDdXJzb3IodmlldyxjYWxjdWxhdGVOZXdDdXJzb3JQb3NpdGlvbih0aGlzLnRyaWdnZXIudGV4dCxzZWxlY3RlZFRleHQscG9zKSlcclxuXHRcdGNvbnNvbGUubG9nKGBTZWxlY3RlZDogJHtzZWxlY3RlZFRleHR9YCk7XHJcblx0fVxyXG59XHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZU5ld0N1cnNvclBvc2l0aW9uKHRyaWdnZXJUZXh0OiBzdHJpbmcsIHNlbGVjdGVkVGV4dDogc3RyaW5nLCBvcmlnaW5hbFBvczogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGNvbnN0IGxlbmd0aERpZmZlcmVuY2UgPSBzZWxlY3RlZFRleHQubGVuZ3RoIC0gdHJpZ2dlclRleHQubGVuZ3RoO1xyXG4gICAgcmV0dXJuIG9yaWdpbmFsUG9zICsgbGVuZ3RoRGlmZmVyZW5jZTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRmxvYXRpbmdTdWdnZXN0aW9uRHJvcGRvd24oc3VnZ2VzdGlvbnM6IGFueVtdLGVkaXRvclZpZXc6IEVkaXRvclZpZXcsIHBvc2l0aW9uOiBudW1iZXIpIHtcclxuXHJcbiAgICBjb25zdCBjb29yZGluYXRlcyA9IGVkaXRvclZpZXcuY29vcmRzQXRQb3MocG9zaXRpb24pO1xyXG4gICAgaWYgKCFjb29yZGluYXRlcykgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IHN1Z2dlc3Rpb25Ecm9wZG93biA9IGNyZWF0ZVN1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9ucyk7XHJcblxyXG4gICAgc3VnZ2VzdGlvbkRyb3Bkb3duLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xyXG4gICAgc3VnZ2VzdGlvbkRyb3Bkb3duLnN0eWxlLmxlZnQgPSBgJHtjb29yZGluYXRlcy5sZWZ0fXB4YDtcclxuICAgIHN1Z2dlc3Rpb25Ecm9wZG93bi5zdHlsZS50b3AgPSBgJHtjb29yZGluYXRlcy5ib3R0b219cHhgO1xyXG5cdHJldHVybiBzdWdnZXN0aW9uRHJvcGRvd247XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBjcmVhdGVTdWdnZXN0aW9uRHJvcGRvd24oc3VnZ2VzdGlvbnM6IHN0cmluZ1tdKSB7XHJcbiAgICBjb25zdCBkcm9wZG93bkNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBkcm9wZG93bkNvbnRhaW5lci5jbGFzc05hbWUgPSBcInN1Z2dlc3Rpb24tZHJvcGRvd25cIjtcclxuXHJcbiAgICBzdWdnZXN0aW9ucy5mb3JFYWNoKChzdWdnZXN0aW9uKSA9PiB7XHJcbiAgICAgICAgY29uc3QgaXRlbSA9IGNyZWF0ZVN1Z2dlc3Rpb25JdGVtKHN1Z2dlc3Rpb24pXHJcblx0XHRkcm9wZG93bkNvbnRhaW5lci5hcHBlbmRDaGlsZChpdGVtKVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIGRyb3Bkb3duQ29udGFpbmVyO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVTdWdnZXN0aW9uSXRlbShkaXNwbGF5VGV4dDogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xyXG5cdC8vIENyZWF0ZSB0aGUgb3V0ZXIgc3VnZ2VzdGlvbiBpdGVtIGNvbnRhaW5lclxyXG5cdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJzdWdnZXN0aW9uLWl0ZW1cIik7XHJcblx0Y29udGFpbmVyLmlubmVyVGV4dD1kaXNwbGF5VGV4dFxyXG4gIFx0cmV0dXJuIGNvbnRhaW5lclxyXG5cdC8vIENyZWF0ZSB0aGUgaWNvbiBjb250YWluZXJcclxuXHRjb25zdCBpY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuXHRpY29uLmNsYXNzTGlzdC5hZGQoXCJpY29uXCIpO1xyXG5cdGljb24udGV4dENvbnRlbnQgPSBcIsaSXCI7IC8vIFBsYWNlaG9sZGVyIGljb24gY29udGVudFxyXG4gIFxyXG5cdC8vIENyZWF0ZSB0aGUgZGV0YWlscyBjb250YWluZXJcclxuXHRjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuXHRkZXRhaWxzLmNsYXNzTGlzdC5hZGQoXCJkZXRhaWxzXCIpO1xyXG4gIFxyXG5cdC8vIEFkZCBhIG5hbWUgc3BhbiB0byBkZXRhaWxzXHJcblx0Y29uc3QgbmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG5cdG5hbWUuY2xhc3NMaXN0LmFkZChcIm5hbWVcIik7XHJcblx0bmFtZS50ZXh0Q29udGVudCA9IFwiZnVuY3Rpb25cIjsgLy8gUGxhY2Vob2xkZXIgbmFtZSBjb250ZW50XHJcbiAgXHJcblx0Ly8gQWRkIGEgdHlwZSBzcGFuIHRvIGRldGFpbHNcclxuXHRjb25zdCB0eXBlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcblx0dHlwZS5jbGFzc0xpc3QuYWRkKFwidHlwZVwiKTtcclxuXHR0eXBlLnRleHRDb250ZW50ID0gXCJLZXl3b3JkXCI7IC8vIFBsYWNlaG9sZGVyIHR5cGUgY29udGVudFxyXG4gIFxyXG5cdC8vIEFwcGVuZCBuYW1lIGFuZCB0eXBlIHRvIGRldGFpbHNcclxuXHRkZXRhaWxzLmFwcGVuZENoaWxkKG5hbWUpO1xyXG5cdGRldGFpbHMuYXBwZW5kQ2hpbGQodHlwZSk7XHJcbiAgXHJcblx0Ly8gQXBwZW5kIGljb24gYW5kIGRldGFpbHMgdG8gdGhlIGNvbnRhaW5lclxyXG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChpY29uKTtcclxuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZGV0YWlscyk7XHJcbiAgXHJcblx0cmV0dXJuIGNvbnRhaW5lcjtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG4vKlxyXG5leHBvcnQgY2xhc3MgTnVtZXJhbHNTdWdnZXN0b3IgZXh0ZW5kcyBFZGl0b3JTdWdnZXN0PHN0cmluZz4ge1xyXG5cdHBsdWdpbjogTnVtZXJhbHNQbHVnaW47XHJcblx0XHJcblx0LyoqXHJcblx0ICogVGltZSBvZiBsYXN0IHN1Z2dlc3Rpb24gbGlzdCB1cGRhdGVcclxuXHQgKiBAdHlwZSB7bnVtYmVyfVxyXG5cdCAqIEBwcml2YXRlIFxyXG5cdHByaXZhdGUgbGFzdFN1Z2dlc3Rpb25MaXN0VXBkYXRlOiBudW1iZXIgPSAwO1xyXG5cclxuXHQvKipcclxuXHQgKiBMaXN0IG9mIHBvc3NpYmxlIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIGN1cnJlbnQgY29kZSBibG9ja1xyXG5cdCAqIEB0eXBlIHtzdHJpbmdbXX1cclxuXHQgKiBAcHJpdmF0ZSBcclxuXHRwcml2YXRlIGxvY2FsU3VnZ2VzdGlvbkNhY2hlOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuXHQvL2VtcHR5IGNvbnN0cnVjdG9yXHJcblx0Y29uc3RydWN0b3IocGx1Z2luOiBOdW1lcmFsc1BsdWdpbikge1xyXG5cdFx0c3VwZXIocGx1Z2luLmFwcCk7XHJcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuXHR9XHJcblxyXG5cdG9uVHJpZ2dlcihjdXJzb3I6IEVkaXRvclBvc2l0aW9uLCBlZGl0b3I6IEVkaXRvciwgZmlsZTogVEZpbGUpOiBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8gfCBudWxsIHtcclxuXHJcblx0XHRjb25zdCBjbUVkaXRvciA9IGVkaXRvciBhcyBhbnk7XHJcblx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xyXG5cdFx0aWYgKHZpZXcgPT09IG51bGwpIHJldHVybiBudWxsO1xyXG5cdFx0Y29uc3QgY29kZWJsb2NrTGVuZz1sYW5nSWZXaXRoaW5Db2RlYmxvY2sodmlldy5zdGF0ZSlcclxuXHRcdGNvbnN0IGlzTWF0aEJsb2NrPWNvZGVibG9ja0xlbmc/LmNvbnRhaW5zKCd0aWt6JylcclxuXHJcblx0XHRjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5yYW5nZXNbMF0uZnJvbTtcclxuXHRcdGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcclxuXHRcdC8vY29uc3QgZG9tTm9kZSA9IHZpZXcuZG9tQXRQb3MobGluZS5mcm9tKS5ub2RlO1xyXG5cdFx0aWYgKCFpc01hdGhCbG9jaykge1xyXG5cdFx0XHRyZXR1cm4gbnVsbDtcclxuXHRcdH1cclxuXHRcdFxyXG5cclxuXHRcdC8vIEdldCBsYXN0IHdvcmQgaW4gY3VycmVudCBsaW5lXHJcblx0XHRjb25zdCBjdXJyZW50TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpLnRleHQ7XHJcblx0XHRjb25zdCBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPSBjdXJyZW50TGluZS5zZWFyY2goL1s6XT9bJEBcXHdcXHUwMzcwLVxcdTAzRkZdKyQvKTtcclxuXHRcdC8vIGlmIHRoZXJlIGlzIG5vIHdvcmQsIHJldHVybiBudWxsXHJcblx0XHRpZiAoY3VycmVudExpbmVMYXN0V29yZFN0YXJ0ID09PSAtMSkge1xyXG5cdFx0XHRyZXR1cm4gbnVsbDtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRzdGFydDoge2xpbmU6IGN1cnNvci5saW5lLCBjaDogY3VycmVudExpbmVMYXN0V29yZFN0YXJ0fSxcclxuXHRcdFx0ZW5kOiBjdXJzb3IsXHJcblx0XHRcdHF1ZXJ5OiBjdXJyZW50TGluZS5zbGljZShjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQpXHJcblx0XHR9O1xyXG5cdH1cclxuXHJcblx0Z2V0U3VnZ2VzdGlvbnMoY29udGV4dDogRWRpdG9yU3VnZ2VzdENvbnRleHQpOiBzdHJpbmdbXSB8IFByb21pc2U8c3RyaW5nW10+IHtcclxuXHRcdGxldCBsb2NhbFN5bWJvbHM6IHN0cmluZyBbXSA9IFtdO1x0XHJcblxyXG5cdFx0bG9jYWxTeW1ib2xzID0gdGhpcy5sb2NhbFN1Z2dlc3Rpb25DYWNoZVxyXG5cdFx0Y29uc3QgcXVlcnkgPSBjb250ZXh0LnF1ZXJ5LnRvTG93ZXJDYXNlKCk7XHJcblxyXG5cdFx0Y29uc3QgbG9jYWxfc3VnZ2VzdGlvbnMgPSBsb2NhbFN5bWJvbHMuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMikpO1xyXG5cdFx0bG9jYWxfc3VnZ2VzdGlvbnMuc29ydCgoYSwgYikgPT4gYS5zbGljZSgyKS5sb2NhbGVDb21wYXJlKGIuc2xpY2UoMikpKTtcclxuXHRcdFxyXG5cdFx0Ly8gY2FzZS1pbnNlbnNpdGl2ZSBmaWx0ZXIgbWF0aGpzIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIHF1ZXJ5LiBEb24ndCByZXR1cm4gdmFsdWUgaWYgZnVsbCBtYXRjaFxyXG5cdFx0bGV0IHN1Z2dlc3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuXHRcdGNvbnN0IG1hdGhqc19zdWdnZXN0aW9ucyA9IGdldE1hdGhKc1N5bWJvbHMoKS5maWx0ZXIoKG9iajogTGF0ZXgpID0+IG9iai52YWx1ZS5zbGljZSgwLCAtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAyKSk7XHJcblxyXG5cdFx0c3VnZ2VzdGlvbnMgPSBtYXRoanNfc3VnZ2VzdGlvbnMubWFwKChvOkxhdGV4KT0+by52YWx1ZSkvL2xvY2FsX3N1Z2dlc3Rpb25zLmNvbmNhdChtYXRoanNfc3VnZ2VzdGlvbnMpO1xyXG5cclxuXHRcdC8qc3VnZ2VzdGlvbnMgPSBzdWdnZXN0aW9ucy5jb25jYXQoXHJcblx0XHRcdG51bWVyYWxzRGlyZWN0aXZlc1xyXG5cdFx0XHRcdC5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5zbGljZSgwLC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDApKVxyXG5cdFx0XHRcdC5tYXAoKHZhbHVlKSA9PiAnbXwnICsgdmFsdWUpXHJcblx0XHRcdCk7XHJcblxyXG5cdFx0cmV0dXJuIHN1Z2dlc3Rpb25zO1xyXG5cdH1cclxuXHJcblx0cmVuZGVyU3VnZ2VzdGlvbih2YWx1ZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuXHRcdGVsLnNldFRleHQodmFsdWUpLypcclxuXHRcdGVsLmFkZENsYXNzZXMoWydtb2QtY29tcGxleCcsICdudW1lcmFscy1zdWdnZXN0aW9uJ10pO1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkNvbnRlbnQgPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tY29udGVudCd9KTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25UaXRsZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi10aXRsZSd9KTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25Ob3RlID0gc3VnZ2VzdGlvbkNvbnRlbnQuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLW5vdGUnfSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uQXV4ID0gZWwuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWF1eCd9KTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25GbGFpciA9IHN1Z2dlc3Rpb25BdXguY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWZsYWlyJ30pOyovXHJcblxyXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby11bnVzZWQtdmFyc1xyXG5cdFx0LypcclxuXHRcdGNvbnN0IFtpY29uVHlwZSwgc3VnZ2VzdGlvblRleHQsIG5vdGVUZXh0XSA9IHZhbHVlLnNwbGl0KCd8Jyk7XHJcblxyXG5cdFx0aWYgKGljb25UeXBlID09PSAnZicpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdmdW5jdGlvbi1zcXVhcmUnKTtcdFx0XHJcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAnYycpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdsb2NhdGUtZml4ZWQnKTtcclxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICd2Jykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2ZpbGUtY29kZScpO1xyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ3AnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnYm94Jyk7XHJcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAnbScpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdzcGFya2xlcycpO1x0XHRcdFxyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ2cnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnY2FzZS1sb3dlcicpOyAvLyBBc3N1bWluZyAnc3ltYm9sJyBpcyBhIHZhbGlkIGljb24gbmFtZVxyXG5cdFx0fVxyXG5cdFx0c3VnZ2VzdGlvblRpdGxlLnNldFRleHQoc3VnZ2VzdGlvblRleHQpO1xyXG5cdFx0aWYgKG5vdGVUZXh0KSB7XHJcblx0XHRcdHN1Z2dlc3Rpb25Ob3RlLnNldFRleHQobm90ZVRleHQpO1xyXG5cdFx0fVxyXG5cdFx0Ly9zdWdnZXN0aW9uVGl0bGUuc2V0VGV4dCh2YWx1ZSk7XHJcblxyXG5cdH1cclxuXHJcblx0LyoqXHJcblx0ICogQ2FsbGVkIHdoZW4gYSBzdWdnZXN0aW9uIGlzIHNlbGVjdGVkLiBSZXBsYWNlcyB0aGUgY3VycmVudCB3b3JkIHdpdGggdGhlIHNlbGVjdGVkIHN1Z2dlc3Rpb25cclxuXHQgKiBAcGFyYW0gdmFsdWUgVGhlIHNlbGVjdGVkIHN1Z2dlc3Rpb25cclxuXHQgKiBAcGFyYW0gZXZ0IFRoZSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgc2VsZWN0aW9uXHJcblx0ICogQHJldHVybnMgdm9pZFxyXG5cdCBcclxuXHJcblx0c2VsZWN0U3VnZ2VzdGlvbih2YWx1ZTogc3RyaW5nLCBldnQ6IE1vdXNlRXZlbnQgfCBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcblx0XHRpZiAodGhpcy5jb250ZXh0KSB7XHJcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuY29udGV4dC5lZGl0b3I7XHJcblx0XHRcdFxyXG5cdFx0XHRjb25zdCBjbUVkaXRvciA9IGVkaXRvciBhcyBhbnk7XHJcblx0XHRcdGNvbnN0IHZpZXcgPSBjbUVkaXRvci5jbSA/IChjbUVkaXRvci5jbSBhcyBFZGl0b3JWaWV3KSA6IG51bGw7XHJcblx0XHRcdGlmICh2aWV3ID09PSBudWxsKSByZXR1cm47XHJcblx0XHJcblx0XHRcdGNvbnN0IGN1cnNvciA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW47XHJcblx0XHRcdGNvbnN0IGZyb20gPSBjdXJzb3IuZnJvbTtcclxuXHRcdFx0Y29uc3QgdG8gPSBjdXJzb3IudG87IFxyXG5cdFxyXG5cdFx0XHR2aWV3LmRpc3BhdGNoKHtcclxuXHRcdFx0XHRjaGFuZ2VzOiB7IGZyb20sIHRvLCBpbnNlcnQ6IHZhbHVlIH0sXHJcblx0XHRcdFx0c2VsZWN0aW9uOiB7IGFuY2hvcjogZnJvbSArIHZhbHVlLmxlbmd0aCB9XHJcblx0XHRcdH0pO1xyXG5cdFx0XHRcclxuXHRcdFx0dGhpcy5jbG9zZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG4qL1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXJhY3RlckF0UG9zKHZpZXdPclN0YXRlOiBFZGl0b3JWaWV3IHwgRWRpdG9yU3RhdGUsIHBvczogbnVtYmVyKSB7XHJcblx0Y29uc3Qgc3RhdGUgPSB2aWV3T3JTdGF0ZSBpbnN0YW5jZW9mIEVkaXRvclZpZXcgPyB2aWV3T3JTdGF0ZS5zdGF0ZSA6IHZpZXdPclN0YXRlO1xyXG5cdGNvbnN0IGRvYyA9IHN0YXRlLmRvYztcclxuXHRyZXR1cm4gZG9jLnNsaWNlKHBvcywgcG9zKzEpLnRvU3RyaW5nKCk7XHJcbn1cclxuXHJcblxyXG4gXHJcbmNvbnN0IGxhbmdJZldpdGhpbkNvZGVibG9jayA9IChzdGF0ZTogRWRpdG9yU3RhdGUpOiBzdHJpbmcgfCBudWxsID0+IHtcclxuXHRjb25zdCB0cmVlID0gc3ludGF4VHJlZShzdGF0ZSk7XHJcblxyXG5cdGNvbnN0IHBvcyA9IHN0YXRlLnNlbGVjdGlvbi5yYW5nZXNbMF0uZnJvbTtcclxuXHJcblx0LypcclxuXHQqIGdldCBhIHRyZWUgY3Vyc29yIGF0IHRoZSBwb3NpdGlvblxyXG5cdCpcclxuXHQqIEEgbmV3bGluZSBkb2VzIG5vdCBiZWxvbmcgdG8gYW55IHN5bnRheCBub2RlcyBleGNlcHQgZm9yIHRoZSBEb2N1bWVudCxcclxuXHQqIHdoaWNoIGNvcnJlc3BvbmRzIHRvIHRoZSB3aG9sZSBkb2N1bWVudC4gU28sIHdlIGNoYW5nZSB0aGUgYG1vZGVgIG9mIHRoZVxyXG5cdCogYGN1cnNvckF0YCBkZXBlbmRpbmcgb24gd2hldGhlciB0aGUgY2hhcmFjdGVyIGp1c3QgYmVmb3JlIHRoZSBjdXJzb3IgaXMgYVxyXG5cdCogbmV3bGluZS5cclxuXHQqL1xyXG5cdGNvbnN0IGN1cnNvciA9XHJcblx0XHRwb3MgPT09IDAgfHwgZ2V0Q2hhcmFjdGVyQXRQb3Moc3RhdGUsIHBvcyAtIDEpID09PSBcIlxcblwiXHJcblx0XHQ/IHRyZWUuY3Vyc29yQXQocG9zLCAxKVxyXG5cdFx0OiB0cmVlLmN1cnNvckF0KHBvcywgLTEpO1xyXG5cclxuXHQvLyBjaGVjayBpZiB3ZSdyZSBpbiBhIGNvZGVibG9jayBhdG0gYXQgYWxsXHJcblx0Y29uc3QgaW5Db2RlYmxvY2sgPSBjdXJzb3IubmFtZS5jb250YWlucyhcImNvZGVibG9ja1wiKTtcclxuXHRpZiAoIWluQ29kZWJsb2NrKSB7XHJcblx0XHRyZXR1cm4gbnVsbDtcclxuXHR9XHJcblxyXG5cdC8vIGxvY2F0ZSB0aGUgc3RhcnQgb2YgdGhlIGJsb2NrXHJcblx0Y29uc3QgY29kZWJsb2NrQmVnaW4gPSBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yLCBEaXJlY3Rpb24uQmFja3dhcmQsIFwiSHlwZXJNRC1jb2RlYmxvY2tfSHlwZXJNRC1jb2RlYmxvY2stYmVnaW5cIik7XHJcblxyXG5cdGlmIChjb2RlYmxvY2tCZWdpbiA9PSBudWxsKSB7XHJcblx0XHRjb25zb2xlLndhcm4oXCJ1bmFibGUgdG8gbG9jYXRlIHN0YXJ0IG9mIHRoZSBjb2RlYmxvY2sgZXZlbiB0aG91Z2ggaW5zaWRlIG9uZVwiKTtcclxuXHRcdHJldHVybiBcIlwiO1xyXG5cdH1cclxuXHJcblx0Ly8gZXh0cmFjdCB0aGUgbGFuZ3VhZ2VcclxuXHQvLyBjb2RlYmxvY2tzIG1heSBzdGFydCBhbmQgZW5kIHdpdGggYW4gYXJiaXRyYXJ5IG51bWJlciBvZiBiYWNrdGlja3NcclxuXHRjb25zdCBsYW5ndWFnZSA9IHN0YXRlLnNsaWNlRG9jKGNvZGVibG9ja0JlZ2luLmZyb20sIGNvZGVibG9ja0JlZ2luLnRvKS5yZXBsYWNlKC9gKy8sIFwiXCIpO1xyXG5cclxuXHRyZXR1cm4gbGFuZ3VhZ2U7XHJcbn1cclxuXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZXNjYWxhdGVUb1Rva2VuKGN1cnNvcjogVHJlZUN1cnNvciwgZGlyOiBEaXJlY3Rpb24sIHRhcmdldDogc3RyaW5nKTogU3ludGF4Tm9kZSB8IG51bGwge1xyXG5cdC8vIEFsbG93IHRoZSBzdGFydGluZyBub2RlIHRvIGJlIGEgbWF0Y2hcclxuXHRpZiAoY3Vyc29yLm5hbWUuY29udGFpbnModGFyZ2V0KSkge1xyXG5cdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xyXG5cdH1cclxuXHJcblx0d2hpbGUgKFxyXG5cdFx0KGN1cnNvci5uYW1lICE9IFwiRG9jdW1lbnRcIikgJiZcclxuXHRcdCgoZGlyID09IERpcmVjdGlvbi5CYWNrd2FyZCAmJiBjdXJzb3IucHJldigpKVxyXG5cdFx0fHwgKGRpciA9PSBEaXJlY3Rpb24uRm9yd2FyZCAmJiBjdXJzb3IubmV4dCgpKVxyXG5cdFx0fHwgY3Vyc29yLnBhcmVudCgpKVxyXG5cdCkge1xyXG5cdFx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcclxuXHRcdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBlbnVtIERpcmVjdGlvbiB7XHJcblx0QmFja3dhcmQsXHJcblx0Rm9yd2FyZCxcclxufSJdfQ==