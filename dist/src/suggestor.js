import { getTikzSuggestions, } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { replaceRange, setCursor } from "./editor utilities/editor_utils";
class SuggestorTrigger {
    text;
    constructor(pos, view) {
        this.text = this.getCurrentLineText(pos, view);
    }
    setTrigger(trigger) {
    }
    getCurrentLineText(pos, view) {
        const line = view.state.doc.lineAt(pos);
        const cursorOffsetInLine = (pos + 2) - line.from;
        const textUpToCursor = line.text.slice(0, cursorOffsetInLine).trim();
        const words = textUpToCursor.split(/\s+/);
        return words[words.length - 1] || "";
    }
}
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
        this.trigger = new SuggestorTrigger(this.context.pos, view);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsa0JBQWtCLEdBQUksTUFBTSxhQUFhLENBQUM7QUFDbkQsT0FBTyxFQUFFLFVBQVUsR0FBRyxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUtsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFFLE1BQU0sZ0JBQWdCO0lBQ3JCLElBQUksQ0FBUTtJQUNaLFlBQVksR0FBVyxFQUFFLElBQWdCO1FBQ3hDLElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUM3QyxDQUFDO0lBQ0QsVUFBVSxDQUFDLE9BQWU7SUFFMUIsQ0FBQztJQUNELGtCQUFrQixDQUFDLEdBQVcsRUFBRSxJQUFnQjtRQUMvQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQUcsR0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQy9DLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXJFLE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDdEMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLFNBQVM7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U0FBUyxRQUdwQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdldFRpa3pTdWdnZXN0aW9ucywgIH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3LCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XG5pbXBvcnQgeyBFZGl0b3JTdGF0ZX0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBTeW50YXhOb2RlLCBUcmVlQ3Vyc29yIH0gZnJvbSBcIkBsZXplci9jb21tb25cIjtcbmltcG9ydCBNb3NoZSBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9jb250ZXh0XCI7XG5pbXBvcnQgeyByZXBsYWNlUmFuZ2UsIHNldEN1cnNvciB9IGZyb20gXCIuL2VkaXRvciB1dGlsaXRpZXMvZWRpdG9yX3V0aWxzXCI7XG5cblxuY2xhc3MgU3VnZ2VzdG9yVHJpZ2dlcntcblx0dGV4dDogc3RyaW5nXG5cdGNvbnN0cnVjdG9yKHBvczogbnVtYmVyLCB2aWV3OiBFZGl0b3JWaWV3KXtcblx0XHR0aGlzLnRleHQ9dGhpcy5nZXRDdXJyZW50TGluZVRleHQocG9zLCB2aWV3KVxuXHR9XG5cdHNldFRyaWdnZXIodHJpZ2dlcjogc3RyaW5nKXtcblxuXHR9XG5cdGdldEN1cnJlbnRMaW5lVGV4dChwb3M6IG51bWJlciwgdmlldzogRWRpdG9yVmlldyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuXHRcdGNvbnN0IGN1cnNvck9mZnNldEluTGluZSA9IChwb3MrMikgLSBsaW5lLmZyb207XG5cdFx0Y29uc3QgdGV4dFVwVG9DdXJzb3IgPSBsaW5lLnRleHQuc2xpY2UoMCwgY3Vyc29yT2Zmc2V0SW5MaW5lKS50cmltKCk7XG5cdFxuXHRcdGNvbnN0IHdvcmRzID0gdGV4dFVwVG9DdXJzb3Iuc3BsaXQoL1xccysvKTtcblx0XHRyZXR1cm4gd29yZHNbd29yZHMubGVuZ3RoIC0gMV0gfHwgXCJcIjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3VnZ2VzdG9yIHtcblx0cHJpdmF0ZSB0cmlnZ2VyOiBTdWdnZXN0b3JUcmlnZ2VyO1xuXHRzZWxlY3Rpb25JbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIGNvbnRleHQ6IENvbnRleHQ7XG5cdGlzU3VnZ2VzdGVyRGVwbG95ZWQ6IGJvb2xlYW49ZmFsc2U7XG5cblx0ZGVwbG95U3VnZ2VzdG9yKGNvbnRleHQ6IENvbnRleHQsdmlldzogRWRpdG9yVmlldyl7XG5cdFx0dGhpcy5yZW1vdmVTdWdnZXN0b3IoKVxuXHRcdHRoaXMuY29udGV4dD1jb250ZXh0O1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zPXRoaXMuZ2V0U3VnZ2VzdGlvbnModmlldylcblx0XHRpZihzdWdnZXN0aW9ucy5sZW5ndGg8MSlyZXR1cm47XG5cblx0XHRjb25zdCBzdWdnZXN0aW9uRHJvcGRvd24gPSBjcmVhdGVGbG9hdGluZ1N1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9ucyx2aWV3LCB0aGlzLmNvbnRleHQucG9zKTtcblx0XHRpZiAoIXN1Z2dlc3Rpb25Ecm9wZG93bikgcmV0dXJuO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc3VnZ2VzdGlvbkRyb3Bkb3duKTtcblx0XHR0aGlzLmlzU3VnZ2VzdGVyRGVwbG95ZWQ9dHJ1ZTtcblx0XHR0aGlzLnNlbGVjdGlvbkluZGV4PTA7XG5cdFx0dGhpcy51cGRhdGVTZWxlY3Rpb24odGhpcy5nZXRBbGxkcm9wZG93bkl0ZW1zKCkpO1xuXG5cdH1cblx0dXBkYXRlU3VnZ2VzdG9yUG9zaXRpb24oKXtcblxuXHR9XG5cblx0cmVtb3ZlU3VnZ2VzdG9yKCkge1xuXHRcdGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvckFsbChcIi5zdWdnZXN0aW9uLWl0ZW1cIikuZm9yRWFjaChub2RlID0+IG5vZGUucmVtb3ZlKCkpO1xuXHRcdGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpPy5yZW1vdmUoKVxuXHRcdHRoaXMuaXNTdWdnZXN0ZXJEZXBsb3llZD1mYWxzZTtcblx0fVxuXG5cdGdldEFsbGRyb3Bkb3duSXRlbXMoKXtyZXR1cm4gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKX1cblx0cHJpdmF0ZSBkcm9wZG93bmlmQW55RGVwbG95ZWQoKXtyZXR1cm4gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yKFwiLnN1Z2dlc3Rpb24tZHJvcGRvd25cIil9XG5cblx0cHJpdmF0ZSBoYW5kbGVEcm9wZG93bk5hdmlnYXRpb24oZXZlbnQ6IEtleWJvYXJkRXZlbnQsdmlldzpFZGl0b3JWaWV3KSB7XG5cdFx0Y29uc3QgZHJvcGRvd24gPSB0aGlzLmRyb3Bkb3duaWZBbnlEZXBsb3llZCgpO1xuXHRcdGlmICghZHJvcGRvd24gfHwgdGhpcy5zZWxlY3Rpb25JbmRleCA9PT0gdW5kZWZpbmVkKSByZXR1cm47XG5cdFxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRBbGxkcm9wZG93bkl0ZW1zKCk7XG5cblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cdFx0XG5cdH1cblxuXHRwcml2YXRlIGdldFN1Z2dlc3Rpb25zKHZpZXc6IEVkaXRvclZpZXcpIHtcblx0XHR0aGlzLnRyaWdnZXI9bmV3IFN1Z2dlc3RvclRyaWdnZXIodGhpcy5jb250ZXh0LnBvcywgdmlldylcblx0XHRjb25zdCBhbGxTdWdnZXN0aW9ucyA9IGdldFRpa3pTdWdnZXN0aW9ucygpLm1hcChzID0+IHMudHJpZ2dlcnx8cy5yZXBsYWNlbWVudCk7XG5cdFxuXHRcdGNvbnN0IGZpbHRlcmVkU3VnZ2VzdGlvbnMgPSBhbGxTdWdnZXN0aW9ucy5maWx0ZXIoKHN1Z2dlc3Rpb24pID0+XG5cdFx0XHRzdWdnZXN0aW9uLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCh0aGlzLnRyaWdnZXIudGV4dC50b0xvd2VyQ2FzZSgpKVxuXHRcdCk7XG5cdFxuXHRcdGNvbnN0IHNvcnRlZFN1Z2dlc3Rpb25zID0gZmlsdGVyZWRTdWdnZXN0aW9ucy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRjb25zdCBsb3dlckxhc3RXb3JkID0gdGhpcy50cmlnZ2VyLnRleHQudG9Mb3dlckNhc2UoKTtcblx0XHRcdGNvbnN0IGFMb3dlciA9IGEudG9Mb3dlckNhc2UoKTtcblx0XHRcdGNvbnN0IGJMb3dlciA9IGIudG9Mb3dlckNhc2UoKTtcblx0XG5cblx0XHRcdGNvbnN0IGFFeGFjdE1hdGNoID0gYUxvd2VyID09PSBsb3dlckxhc3RXb3JkID8gLTEgOiAwO1xuXHRcdFx0Y29uc3QgYkV4YWN0TWF0Y2ggPSBiTG93ZXIgPT09IGxvd2VyTGFzdFdvcmQgPyAtMSA6IDA7XG5cdFx0XHRpZiAoYUV4YWN0TWF0Y2ggIT09IGJFeGFjdE1hdGNoKSByZXR1cm4gYUV4YWN0TWF0Y2ggLSBiRXhhY3RNYXRjaDtcblx0XG5cdFx0XHRpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDtcblx0XG5cdFx0XHRyZXR1cm4gYUxvd2VyLmxvY2FsZUNvbXBhcmUoYkxvd2VyKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gc29ydGVkU3VnZ2VzdGlvbnM7XG5cdH1cblxuXHRcblxuXHR1cGRhdGVTZWxlY3Rpb24oaXRlbXM6IE5vZGVMaXN0T2Y8RWxlbWVudD4pIHtcblx0XHRpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKGluZGV4ID09PSB0aGlzLnNlbGVjdGlvbkluZGV4KSB7XG5cdFx0XHRcdGl0ZW0uY2xhc3NMaXN0LmFkZChcInNlbGVjdGVkXCIpO1xuXHRcdFx0XHRpdGVtLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6IFwibmVhcmVzdFwiIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aXRlbS5jbGFzc0xpc3QucmVtb3ZlKFwic2VsZWN0ZWRcIik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzZWxlY3REcm9wZG93bkl0ZW0oaXRlbTogRWxlbWVudCx2aWV3OiBFZGl0b3JWaWV3KSB7XG5cdFx0dGhpcy5yZW1vdmVTdWdnZXN0b3IoKVxuXHRcdGlmKCF0aGlzLmNvbnRleHQpcmV0dXJuIDtcblx0XHRjb25zdCBzZWxlY3RlZFRleHQgPSBpdGVtLnRleHRDb250ZW50IHx8IFwiXCI7XG5cdFx0Y29uc3QgcG9zPXRoaXMuY29udGV4dC5wb3M7XG5cdFx0Y29uc29sZS5sb2coJ3Bvcy10aGlzLnRyaWdnZXIudGV4dC5sZW5ndGgscG9zLHNlbGVjdGVkVGV4dCcscG9zLXRoaXMudHJpZ2dlci50ZXh0Lmxlbmd0aCxwb3Msc2VsZWN0ZWRUZXh0KVxuXHRcdHJlcGxhY2VSYW5nZSh2aWV3LHBvcy10aGlzLnRyaWdnZXIudGV4dC5sZW5ndGgscG9zLHNlbGVjdGVkVGV4dClcblx0XHR2aWV3LmZvY3VzKCk7XG5cdFx0c2V0Q3Vyc29yKHZpZXcsY2FsY3VsYXRlTmV3Q3Vyc29yUG9zaXRpb24odGhpcy50cmlnZ2VyLnRleHQsc2VsZWN0ZWRUZXh0LHBvcykpXG5cdFx0Y29uc29sZS5sb2coYFNlbGVjdGVkOiAke3NlbGVjdGVkVGV4dH1gKTtcblx0fVxufVxuZnVuY3Rpb24gY2FsY3VsYXRlTmV3Q3Vyc29yUG9zaXRpb24odHJpZ2dlclRleHQ6IHN0cmluZywgc2VsZWN0ZWRUZXh0OiBzdHJpbmcsIG9yaWdpbmFsUG9zOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IGxlbmd0aERpZmZlcmVuY2UgPSBzZWxlY3RlZFRleHQubGVuZ3RoIC0gdHJpZ2dlclRleHQubGVuZ3RoO1xuICAgIHJldHVybiBvcmlnaW5hbFBvcyArIGxlbmd0aERpZmZlcmVuY2U7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZsb2F0aW5nU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zOiBhbnlbXSxlZGl0b3JWaWV3OiBFZGl0b3JWaWV3LCBwb3NpdGlvbjogbnVtYmVyKSB7XG5cbiAgICBjb25zdCBjb29yZGluYXRlcyA9IGVkaXRvclZpZXcuY29vcmRzQXRQb3MocG9zaXRpb24pO1xuICAgIGlmICghY29vcmRpbmF0ZXMpIHJldHVybjtcblxuICAgIGNvbnN0IHN1Z2dlc3Rpb25Ecm9wZG93biA9IGNyZWF0ZVN1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9ucyk7XG5cbiAgICBzdWdnZXN0aW9uRHJvcGRvd24uc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgc3VnZ2VzdGlvbkRyb3Bkb3duLnN0eWxlLmxlZnQgPSBgJHtjb29yZGluYXRlcy5sZWZ0fXB4YDtcbiAgICBzdWdnZXN0aW9uRHJvcGRvd24uc3R5bGUudG9wID0gYCR7Y29vcmRpbmF0ZXMuYm90dG9tfXB4YDtcblx0cmV0dXJuIHN1Z2dlc3Rpb25Ecm9wZG93bjtcbn1cblxuXG5mdW5jdGlvbiBjcmVhdGVTdWdnZXN0aW9uRHJvcGRvd24oc3VnZ2VzdGlvbnM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgZHJvcGRvd25Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGRyb3Bkb3duQ29udGFpbmVyLmNsYXNzTmFtZSA9IFwic3VnZ2VzdGlvbi1kcm9wZG93blwiO1xuXG4gICAgc3VnZ2VzdGlvbnMuZm9yRWFjaCgoc3VnZ2VzdGlvbikgPT4ge1xuICAgICAgICBjb25zdCBpdGVtID0gY3JlYXRlU3VnZ2VzdGlvbkl0ZW0oc3VnZ2VzdGlvbilcblx0XHRkcm9wZG93bkNvbnRhaW5lci5hcHBlbmRDaGlsZChpdGVtKVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGRyb3Bkb3duQ29udGFpbmVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTdWdnZXN0aW9uSXRlbShkaXNwbGF5VGV4dDogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuXHQvLyBDcmVhdGUgdGhlIG91dGVyIHN1Z2dlc3Rpb24gaXRlbSBjb250YWluZXJcblx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJzdWdnZXN0aW9uLWl0ZW1cIik7XG5cdGNvbnRhaW5lci5pbm5lclRleHQ9ZGlzcGxheVRleHRcbiAgXHRyZXR1cm4gY29udGFpbmVyXG5cdC8vIENyZWF0ZSB0aGUgaWNvbiBjb250YWluZXJcblx0Y29uc3QgaWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdGljb24uY2xhc3NMaXN0LmFkZChcImljb25cIik7XG5cdGljb24udGV4dENvbnRlbnQgPSBcIsaSXCI7IC8vIFBsYWNlaG9sZGVyIGljb24gY29udGVudFxuICBcblx0Ly8gQ3JlYXRlIHRoZSBkZXRhaWxzIGNvbnRhaW5lclxuXHRjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0ZGV0YWlscy5jbGFzc0xpc3QuYWRkKFwiZGV0YWlsc1wiKTtcbiAgXG5cdC8vIEFkZCBhIG5hbWUgc3BhbiB0byBkZXRhaWxzXG5cdGNvbnN0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcblx0bmFtZS5jbGFzc0xpc3QuYWRkKFwibmFtZVwiKTtcblx0bmFtZS50ZXh0Q29udGVudCA9IFwiZnVuY3Rpb25cIjsgLy8gUGxhY2Vob2xkZXIgbmFtZSBjb250ZW50XG4gIFxuXHQvLyBBZGQgYSB0eXBlIHNwYW4gdG8gZGV0YWlsc1xuXHRjb25zdCB0eXBlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG5cdHR5cGUuY2xhc3NMaXN0LmFkZChcInR5cGVcIik7XG5cdHR5cGUudGV4dENvbnRlbnQgPSBcIktleXdvcmRcIjsgLy8gUGxhY2Vob2xkZXIgdHlwZSBjb250ZW50XG4gIFxuXHQvLyBBcHBlbmQgbmFtZSBhbmQgdHlwZSB0byBkZXRhaWxzXG5cdGRldGFpbHMuYXBwZW5kQ2hpbGQobmFtZSk7XG5cdGRldGFpbHMuYXBwZW5kQ2hpbGQodHlwZSk7XG4gIFxuXHQvLyBBcHBlbmQgaWNvbiBhbmQgZGV0YWlscyB0byB0aGUgY29udGFpbmVyXG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChpY29uKTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xuICBcblx0cmV0dXJuIGNvbnRhaW5lcjtcbn1cblxuXG5cblxuXG5cbi8qXG5leHBvcnQgY2xhc3MgTnVtZXJhbHNTdWdnZXN0b3IgZXh0ZW5kcyBFZGl0b3JTdWdnZXN0PHN0cmluZz4ge1xuXHRwbHVnaW46IE51bWVyYWxzUGx1Z2luO1xuXHRcblx0LyoqXG5cdCAqIFRpbWUgb2YgbGFzdCBzdWdnZXN0aW9uIGxpc3QgdXBkYXRlXG5cdCAqIEB0eXBlIHtudW1iZXJ9XG5cdCAqIEBwcml2YXRlIFxuXHRwcml2YXRlIGxhc3RTdWdnZXN0aW9uTGlzdFVwZGF0ZTogbnVtYmVyID0gMDtcblxuXHQvKipcblx0ICogTGlzdCBvZiBwb3NzaWJsZSBzdWdnZXN0aW9ucyBiYXNlZCBvbiBjdXJyZW50IGNvZGUgYmxvY2tcblx0ICogQHR5cGUge3N0cmluZ1tdfVxuXHQgKiBAcHJpdmF0ZSBcblx0cHJpdmF0ZSBsb2NhbFN1Z2dlc3Rpb25DYWNoZTogc3RyaW5nW10gPSBbXTtcblxuXHQvL2VtcHR5IGNvbnN0cnVjdG9yXG5cdGNvbnN0cnVjdG9yKHBsdWdpbjogTnVtZXJhbHNQbHVnaW4pIHtcblx0XHRzdXBlcihwbHVnaW4uYXBwKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdG9uVHJpZ2dlcihjdXJzb3I6IEVkaXRvclBvc2l0aW9uLCBlZGl0b3I6IEVkaXRvciwgZmlsZTogVEZpbGUpOiBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8gfCBudWxsIHtcblxuXHRcdGNvbnN0IGNtRWRpdG9yID0gZWRpdG9yIGFzIGFueTtcblx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xuXHRcdGlmICh2aWV3ID09PSBudWxsKSByZXR1cm4gbnVsbDtcblx0XHRjb25zdCBjb2RlYmxvY2tMZW5nPWxhbmdJZldpdGhpbkNvZGVibG9jayh2aWV3LnN0YXRlKVxuXHRcdGNvbnN0IGlzTWF0aEJsb2NrPWNvZGVibG9ja0xlbmc/LmNvbnRhaW5zKCd0aWt6JylcblxuXHRcdGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xuXHRcdGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcblx0XHQvL2NvbnN0IGRvbU5vZGUgPSB2aWV3LmRvbUF0UG9zKGxpbmUuZnJvbSkubm9kZTtcblx0XHRpZiAoIWlzTWF0aEJsb2NrKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0XG5cblx0XHQvLyBHZXQgbGFzdCB3b3JkIGluIGN1cnJlbnQgbGluZVxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcykudGV4dDtcblx0XHRjb25zdCBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPSBjdXJyZW50TGluZS5zZWFyY2goL1s6XT9bJEBcXHdcXHUwMzcwLVxcdTAzRkZdKyQvKTtcblx0XHQvLyBpZiB0aGVyZSBpcyBubyB3b3JkLCByZXR1cm4gbnVsbFxuXHRcdGlmIChjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHtsaW5lOiBjdXJzb3IubGluZSwgY2g6IGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydH0sXG5cdFx0XHRlbmQ6IGN1cnNvcixcblx0XHRcdHF1ZXJ5OiBjdXJyZW50TGluZS5zbGljZShjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQpXG5cdFx0fTtcblx0fVxuXG5cdGdldFN1Z2dlc3Rpb25zKGNvbnRleHQ6IEVkaXRvclN1Z2dlc3RDb250ZXh0KTogc3RyaW5nW10gfCBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0bGV0IGxvY2FsU3ltYm9sczogc3RyaW5nIFtdID0gW107XHRcblxuXHRcdGxvY2FsU3ltYm9scyA9IHRoaXMubG9jYWxTdWdnZXN0aW9uQ2FjaGVcblx0XHRjb25zdCBxdWVyeSA9IGNvbnRleHQucXVlcnkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGNvbnN0IGxvY2FsX3N1Z2dlc3Rpb25zID0gbG9jYWxTeW1ib2xzLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDIpKTtcblx0XHRsb2NhbF9zdWdnZXN0aW9ucy5zb3J0KChhLCBiKSA9PiBhLnNsaWNlKDIpLmxvY2FsZUNvbXBhcmUoYi5zbGljZSgyKSkpO1xuXHRcdFxuXHRcdC8vIGNhc2UtaW5zZW5zaXRpdmUgZmlsdGVyIG1hdGhqcyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBxdWVyeS4gRG9uJ3QgcmV0dXJuIHZhbHVlIGlmIGZ1bGwgbWF0Y2hcblx0XHRsZXQgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBtYXRoanNfc3VnZ2VzdGlvbnMgPSBnZXRNYXRoSnNTeW1ib2xzKCkuZmlsdGVyKChvYmo6IExhdGV4KSA9PiBvYmoudmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMikpO1xuXG5cdFx0c3VnZ2VzdGlvbnMgPSBtYXRoanNfc3VnZ2VzdGlvbnMubWFwKChvOkxhdGV4KT0+by52YWx1ZSkvL2xvY2FsX3N1Z2dlc3Rpb25zLmNvbmNhdChtYXRoanNfc3VnZ2VzdGlvbnMpO1xuXG5cdFx0LypzdWdnZXN0aW9ucyA9IHN1Z2dlc3Rpb25zLmNvbmNhdChcblx0XHRcdG51bWVyYWxzRGlyZWN0aXZlc1xuXHRcdFx0XHQuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAwKSlcblx0XHRcdFx0Lm1hcCgodmFsdWUpID0+ICdtfCcgKyB2YWx1ZSlcblx0XHRcdCk7XG5cblx0XHRyZXR1cm4gc3VnZ2VzdGlvbnM7XG5cdH1cblxuXHRyZW5kZXJTdWdnZXN0aW9uKHZhbHVlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGVsLnNldFRleHQodmFsdWUpLypcblx0XHRlbC5hZGRDbGFzc2VzKFsnbW9kLWNvbXBsZXgnLCAnbnVtZXJhbHMtc3VnZ2VzdGlvbiddKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uQ29udGVudCA9IGVsLmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1jb250ZW50J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25UaXRsZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi10aXRsZSd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uTm90ZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1ub3RlJ30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25BdXggPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tYXV4J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25GbGFpciA9IHN1Z2dlc3Rpb25BdXguY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWZsYWlyJ30pOyovXG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXVudXNlZC12YXJzXG5cdFx0Lypcblx0XHRjb25zdCBbaWNvblR5cGUsIHN1Z2dlc3Rpb25UZXh0LCBub3RlVGV4dF0gPSB2YWx1ZS5zcGxpdCgnfCcpO1xuXG5cdFx0aWYgKGljb25UeXBlID09PSAnZicpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZnVuY3Rpb24tc3F1YXJlJyk7XHRcdFxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdjJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdsb2NhdGUtZml4ZWQnKTtcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAndicpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZmlsZS1jb2RlJyk7XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ3AnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2JveCcpO1xuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdtJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdzcGFya2xlcycpO1x0XHRcdFxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdnJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdjYXNlLWxvd2VyJyk7IC8vIEFzc3VtaW5nICdzeW1ib2wnIGlzIGEgdmFsaWQgaWNvbiBuYW1lXG5cdFx0fVxuXHRcdHN1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHN1Z2dlc3Rpb25UZXh0KTtcblx0XHRpZiAobm90ZVRleHQpIHtcblx0XHRcdHN1Z2dlc3Rpb25Ob3RlLnNldFRleHQobm90ZVRleHQpO1xuXHRcdH1cblx0XHQvL3N1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHZhbHVlKTtcblxuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIGEgc3VnZ2VzdGlvbiBpcyBzZWxlY3RlZC4gUmVwbGFjZXMgdGhlIGN1cnJlbnQgd29yZCB3aXRoIHRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXG5cdCAqIEBwYXJhbSB2YWx1ZSBUaGUgc2VsZWN0ZWQgc3VnZ2VzdGlvblxuXHQgKiBAcGFyYW0gZXZ0IFRoZSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgc2VsZWN0aW9uXG5cdCAqIEByZXR1cm5zIHZvaWRcblx0IFxuXG5cdHNlbGVjdFN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZXZ0OiBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRleHQpIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuY29udGV4dC5lZGl0b3I7XG5cdFx0XHRcblx0XHRcdGNvbnN0IGNtRWRpdG9yID0gZWRpdG9yIGFzIGFueTtcblx0XHRcdGNvbnN0IHZpZXcgPSBjbUVkaXRvci5jbSA/IChjbUVkaXRvci5jbSBhcyBFZGl0b3JWaWV3KSA6IG51bGw7XG5cdFx0XHRpZiAodmlldyA9PT0gbnVsbCkgcmV0dXJuO1xuXHRcblx0XHRcdGNvbnN0IGN1cnNvciA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW47XG5cdFx0XHRjb25zdCBmcm9tID0gY3Vyc29yLmZyb207XG5cdFx0XHRjb25zdCB0byA9IGN1cnNvci50bzsgXG5cdFxuXHRcdFx0dmlldy5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5nZXM6IHsgZnJvbSwgdG8sIGluc2VydDogdmFsdWUgfSxcblx0XHRcdFx0c2VsZWN0aW9uOiB7IGFuY2hvcjogZnJvbSArIHZhbHVlLmxlbmd0aCB9XG5cdFx0XHR9KTtcblx0XHRcdFxuXHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdH1cblx0fVxufVxuKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXJhY3RlckF0UG9zKHZpZXdPclN0YXRlOiBFZGl0b3JWaWV3IHwgRWRpdG9yU3RhdGUsIHBvczogbnVtYmVyKSB7XG5cdGNvbnN0IHN0YXRlID0gdmlld09yU3RhdGUgaW5zdGFuY2VvZiBFZGl0b3JWaWV3ID8gdmlld09yU3RhdGUuc3RhdGUgOiB2aWV3T3JTdGF0ZTtcblx0Y29uc3QgZG9jID0gc3RhdGUuZG9jO1xuXHRyZXR1cm4gZG9jLnNsaWNlKHBvcywgcG9zKzEpLnRvU3RyaW5nKCk7XG59XG5cblxuIFxuY29uc3QgbGFuZ0lmV2l0aGluQ29kZWJsb2NrID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IHN0cmluZyB8IG51bGwgPT4ge1xuXHRjb25zdCB0cmVlID0gc3ludGF4VHJlZShzdGF0ZSk7XG5cblx0Y29uc3QgcG9zID0gc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xuXG5cdC8qXG5cdCogZ2V0IGEgdHJlZSBjdXJzb3IgYXQgdGhlIHBvc2l0aW9uXG5cdCpcblx0KiBBIG5ld2xpbmUgZG9lcyBub3QgYmVsb25nIHRvIGFueSBzeW50YXggbm9kZXMgZXhjZXB0IGZvciB0aGUgRG9jdW1lbnQsXG5cdCogd2hpY2ggY29ycmVzcG9uZHMgdG8gdGhlIHdob2xlIGRvY3VtZW50LiBTbywgd2UgY2hhbmdlIHRoZSBgbW9kZWAgb2YgdGhlXG5cdCogYGN1cnNvckF0YCBkZXBlbmRpbmcgb24gd2hldGhlciB0aGUgY2hhcmFjdGVyIGp1c3QgYmVmb3JlIHRoZSBjdXJzb3IgaXMgYVxuXHQqIG5ld2xpbmUuXG5cdCovXG5cdGNvbnN0IGN1cnNvciA9XG5cdFx0cG9zID09PSAwIHx8IGdldENoYXJhY3RlckF0UG9zKHN0YXRlLCBwb3MgLSAxKSA9PT0gXCJcXG5cIlxuXHRcdD8gdHJlZS5jdXJzb3JBdChwb3MsIDEpXG5cdFx0OiB0cmVlLmN1cnNvckF0KHBvcywgLTEpO1xuXG5cdC8vIGNoZWNrIGlmIHdlJ3JlIGluIGEgY29kZWJsb2NrIGF0bSBhdCBhbGxcblx0Y29uc3QgaW5Db2RlYmxvY2sgPSBjdXJzb3IubmFtZS5jb250YWlucyhcImNvZGVibG9ja1wiKTtcblx0aWYgKCFpbkNvZGVibG9jaykge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Ly8gbG9jYXRlIHRoZSBzdGFydCBvZiB0aGUgYmxvY2tcblx0Y29uc3QgY29kZWJsb2NrQmVnaW4gPSBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yLCBEaXJlY3Rpb24uQmFja3dhcmQsIFwiSHlwZXJNRC1jb2RlYmxvY2tfSHlwZXJNRC1jb2RlYmxvY2stYmVnaW5cIik7XG5cblx0aWYgKGNvZGVibG9ja0JlZ2luID09IG51bGwpIHtcblx0XHRjb25zb2xlLndhcm4oXCJ1bmFibGUgdG8gbG9jYXRlIHN0YXJ0IG9mIHRoZSBjb2RlYmxvY2sgZXZlbiB0aG91Z2ggaW5zaWRlIG9uZVwiKTtcblx0XHRyZXR1cm4gXCJcIjtcblx0fVxuXG5cdC8vIGV4dHJhY3QgdGhlIGxhbmd1YWdlXG5cdC8vIGNvZGVibG9ja3MgbWF5IHN0YXJ0IGFuZCBlbmQgd2l0aCBhbiBhcmJpdHJhcnkgbnVtYmVyIG9mIGJhY2t0aWNrc1xuXHRjb25zdCBsYW5ndWFnZSA9IHN0YXRlLnNsaWNlRG9jKGNvZGVibG9ja0JlZ2luLmZyb20sIGNvZGVibG9ja0JlZ2luLnRvKS5yZXBsYWNlKC9gKy8sIFwiXCIpO1xuXG5cdHJldHVybiBsYW5ndWFnZTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZXNjYWxhdGVUb1Rva2VuKGN1cnNvcjogVHJlZUN1cnNvciwgZGlyOiBEaXJlY3Rpb24sIHRhcmdldDogc3RyaW5nKTogU3ludGF4Tm9kZSB8IG51bGwge1xuXHQvLyBBbGxvdyB0aGUgc3RhcnRpbmcgbm9kZSB0byBiZSBhIG1hdGNoXG5cdGlmIChjdXJzb3IubmFtZS5jb250YWlucyh0YXJnZXQpKSB7XG5cdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xuXHR9XG5cblx0d2hpbGUgKFxuXHRcdChjdXJzb3IubmFtZSAhPSBcIkRvY3VtZW50XCIpICYmXG5cdFx0KChkaXIgPT0gRGlyZWN0aW9uLkJhY2t3YXJkICYmIGN1cnNvci5wcmV2KCkpXG5cdFx0fHwgKGRpciA9PSBEaXJlY3Rpb24uRm9yd2FyZCAmJiBjdXJzb3IubmV4dCgpKVxuXHRcdHx8IGN1cnNvci5wYXJlbnQoKSlcblx0KSB7XG5cdFx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcblx0XHRcdHJldHVybiBjdXJzb3Iubm9kZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGVudW0gRGlyZWN0aW9uIHtcblx0QmFja3dhcmQsXG5cdEZvcndhcmQsXG59Il19