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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsa0JBQWtCLEdBQUksTUFBTSxhQUFhLENBQUM7QUFDbkQsT0FBTyxFQUFFLFVBQVUsR0FBRyxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUtsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFFLE1BQU0sZ0JBQWdCO0lBQ3JCLElBQUksQ0FBUTtJQUNaLFlBQVksR0FBVyxFQUFFLElBQWdCO1FBQ3hDLElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUM3QyxDQUFDO0lBQ0QsVUFBVSxDQUFDLE9BQWU7SUFFMUIsQ0FBQztJQUNELGtCQUFrQixDQUFDLEdBQVcsRUFBRSxJQUFnQjtRQUMvQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQUcsR0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQy9DLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXJFLE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDdEMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLFNBQVM7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U0FBUyxRQUdwQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdldFRpa3pTdWdnZXN0aW9ucywgIH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xyXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZX0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XHJcbmltcG9ydCB7IFN5bnRheE5vZGUsIFRyZWVDdXJzb3IgfSBmcm9tIFwiQGxlemVyL2NvbW1vblwiO1xyXG5pbXBvcnQgTW9zaGUgZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9jb250ZXh0XCI7XHJcbmltcG9ydCB7IHJlcGxhY2VSYW5nZSwgc2V0Q3Vyc29yIH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9lZGl0b3JfdXRpbHNcIjtcclxuXHJcblxyXG5jbGFzcyBTdWdnZXN0b3JUcmlnZ2Vye1xyXG5cdHRleHQ6IHN0cmluZ1xyXG5cdGNvbnN0cnVjdG9yKHBvczogbnVtYmVyLCB2aWV3OiBFZGl0b3JWaWV3KXtcclxuXHRcdHRoaXMudGV4dD10aGlzLmdldEN1cnJlbnRMaW5lVGV4dChwb3MsIHZpZXcpXHJcblx0fVxyXG5cdHNldFRyaWdnZXIodHJpZ2dlcjogc3RyaW5nKXtcclxuXHJcblx0fVxyXG5cdGdldEN1cnJlbnRMaW5lVGV4dChwb3M6IG51bWJlciwgdmlldzogRWRpdG9yVmlldyk6IHN0cmluZyB7XHJcblx0XHRjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XHJcblx0XHRjb25zdCBjdXJzb3JPZmZzZXRJbkxpbmUgPSAocG9zKzIpIC0gbGluZS5mcm9tO1xyXG5cdFx0Y29uc3QgdGV4dFVwVG9DdXJzb3IgPSBsaW5lLnRleHQuc2xpY2UoMCwgY3Vyc29yT2Zmc2V0SW5MaW5lKS50cmltKCk7XHJcblx0XHJcblx0XHRjb25zdCB3b3JkcyA9IHRleHRVcFRvQ3Vyc29yLnNwbGl0KC9cXHMrLyk7XHJcblx0XHRyZXR1cm4gd29yZHNbd29yZHMubGVuZ3RoIC0gMV0gfHwgXCJcIjtcclxuXHR9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBTdWdnZXN0b3Ige1xyXG5cdHByaXZhdGUgdHJpZ2dlcjogU3VnZ2VzdG9yVHJpZ2dlcjtcclxuXHRzZWxlY3Rpb25JbmRleDogbnVtYmVyO1xyXG5cdHByaXZhdGUgY29udGV4dDogQ29udGV4dDtcclxuXHRpc1N1Z2dlc3RlckRlcGxveWVkOiBib29sZWFuPWZhbHNlO1xyXG5cclxuXHRkZXBsb3lTdWdnZXN0b3IoY29udGV4dDogQ29udGV4dCx2aWV3OiBFZGl0b3JWaWV3KXtcclxuXHRcdHRoaXMucmVtb3ZlU3VnZ2VzdG9yKClcclxuXHRcdHRoaXMuY29udGV4dD1jb250ZXh0O1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM9dGhpcy5nZXRTdWdnZXN0aW9ucyh2aWV3KVxyXG5cdFx0aWYoc3VnZ2VzdGlvbnMubGVuZ3RoPDEpcmV0dXJuO1xyXG5cclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25Ecm9wZG93biA9IGNyZWF0ZUZsb2F0aW5nU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zLHZpZXcsIHRoaXMuY29udGV4dC5wb3MpO1xyXG5cdFx0aWYgKCFzdWdnZXN0aW9uRHJvcGRvd24pIHJldHVybjtcclxuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc3VnZ2VzdGlvbkRyb3Bkb3duKTtcclxuXHRcdHRoaXMuaXNTdWdnZXN0ZXJEZXBsb3llZD10cnVlO1xyXG5cdFx0dGhpcy5zZWxlY3Rpb25JbmRleD0wO1xyXG5cdFx0dGhpcy51cGRhdGVTZWxlY3Rpb24odGhpcy5nZXRBbGxkcm9wZG93bkl0ZW1zKCkpO1xyXG5cclxuXHR9XHJcblx0dXBkYXRlU3VnZ2VzdG9yUG9zaXRpb24oKXtcclxuXHJcblx0fVxyXG5cclxuXHRyZW1vdmVTdWdnZXN0b3IoKSB7XHJcblx0XHRkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpLmZvckVhY2gobm9kZSA9PiBub2RlLnJlbW92ZSgpKTtcclxuXHRcdGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpPy5yZW1vdmUoKVxyXG5cdFx0dGhpcy5pc1N1Z2dlc3RlckRlcGxveWVkPWZhbHNlO1xyXG5cdH1cclxuXHJcblx0Z2V0QWxsZHJvcGRvd25JdGVtcygpe3JldHVybiBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpfVxyXG5cdHByaXZhdGUgZHJvcGRvd25pZkFueURlcGxveWVkKCl7cmV0dXJuIGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpfVxyXG5cclxuXHRwcml2YXRlIGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbihldmVudDogS2V5Ym9hcmRFdmVudCx2aWV3OkVkaXRvclZpZXcpIHtcclxuXHRcdGNvbnN0IGRyb3Bkb3duID0gdGhpcy5kcm9wZG93bmlmQW55RGVwbG95ZWQoKTtcclxuXHRcdGlmICghZHJvcGRvd24gfHwgdGhpcy5zZWxlY3Rpb25JbmRleCA9PT0gdW5kZWZpbmVkKSByZXR1cm47XHJcblx0XHJcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuZ2V0QWxsZHJvcGRvd25JdGVtcygpO1xyXG5cclxuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHJldHVybjtcclxuXHRcdFxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBnZXRTdWdnZXN0aW9ucyh2aWV3OiBFZGl0b3JWaWV3KSB7XHJcblx0XHR0aGlzLnRyaWdnZXI9bmV3IFN1Z2dlc3RvclRyaWdnZXIodGhpcy5jb250ZXh0LnBvcywgdmlldylcclxuXHRcdGNvbnN0IGFsbFN1Z2dlc3Rpb25zID0gZ2V0VGlrelN1Z2dlc3Rpb25zKCkubWFwKHMgPT4gcy50cmlnZ2VyfHxzLnJlcGxhY2VtZW50KTtcclxuXHRcclxuXHRcdGNvbnN0IGZpbHRlcmVkU3VnZ2VzdGlvbnMgPSBhbGxTdWdnZXN0aW9ucy5maWx0ZXIoKHN1Z2dlc3Rpb24pID0+XHJcblx0XHRcdHN1Z2dlc3Rpb24udG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHRoaXMudHJpZ2dlci50ZXh0LnRvTG93ZXJDYXNlKCkpXHJcblx0XHQpO1xyXG5cdFxyXG5cdFx0Y29uc3Qgc29ydGVkU3VnZ2VzdGlvbnMgPSBmaWx0ZXJlZFN1Z2dlc3Rpb25zLnNvcnQoKGEsIGIpID0+IHtcclxuXHRcdFx0Y29uc3QgbG93ZXJMYXN0V29yZCA9IHRoaXMudHJpZ2dlci50ZXh0LnRvTG93ZXJDYXNlKCk7XHJcblx0XHRcdGNvbnN0IGFMb3dlciA9IGEudG9Mb3dlckNhc2UoKTtcclxuXHRcdFx0Y29uc3QgYkxvd2VyID0gYi50b0xvd2VyQ2FzZSgpO1xyXG5cdFxyXG5cclxuXHRcdFx0Y29uc3QgYUV4YWN0TWF0Y2ggPSBhTG93ZXIgPT09IGxvd2VyTGFzdFdvcmQgPyAtMSA6IDA7XHJcblx0XHRcdGNvbnN0IGJFeGFjdE1hdGNoID0gYkxvd2VyID09PSBsb3dlckxhc3RXb3JkID8gLTEgOiAwO1xyXG5cdFx0XHRpZiAoYUV4YWN0TWF0Y2ggIT09IGJFeGFjdE1hdGNoKSByZXR1cm4gYUV4YWN0TWF0Y2ggLSBiRXhhY3RNYXRjaDtcclxuXHRcclxuXHRcdFx0aWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7XHJcblx0XHJcblx0XHRcdHJldHVybiBhTG93ZXIubG9jYWxlQ29tcGFyZShiTG93ZXIpO1xyXG5cdFx0fSk7XHJcblx0XHRyZXR1cm4gc29ydGVkU3VnZ2VzdGlvbnM7XHJcblx0fVxyXG5cclxuXHRcclxuXHJcblx0dXBkYXRlU2VsZWN0aW9uKGl0ZW1zOiBOb2RlTGlzdE9mPEVsZW1lbnQ+KSB7XHJcblx0XHRpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xyXG5cdFx0XHRpZiAoaW5kZXggPT09IHRoaXMuc2VsZWN0aW9uSW5kZXgpIHtcclxuXHRcdFx0XHRpdGVtLmNsYXNzTGlzdC5hZGQoXCJzZWxlY3RlZFwiKTtcclxuXHRcdFx0XHRpdGVtLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6IFwibmVhcmVzdFwiIH0pO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGl0ZW0uY2xhc3NMaXN0LnJlbW92ZShcInNlbGVjdGVkXCIpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHNlbGVjdERyb3Bkb3duSXRlbShpdGVtOiBFbGVtZW50LHZpZXc6IEVkaXRvclZpZXcpIHtcclxuXHRcdHRoaXMucmVtb3ZlU3VnZ2VzdG9yKClcclxuXHRcdGlmKCF0aGlzLmNvbnRleHQpcmV0dXJuIDtcclxuXHRcdGNvbnN0IHNlbGVjdGVkVGV4dCA9IGl0ZW0udGV4dENvbnRlbnQgfHwgXCJcIjtcclxuXHRcdGNvbnN0IHBvcz10aGlzLmNvbnRleHQucG9zO1xyXG5cdFx0Y29uc29sZS5sb2coJ3Bvcy10aGlzLnRyaWdnZXIudGV4dC5sZW5ndGgscG9zLHNlbGVjdGVkVGV4dCcscG9zLXRoaXMudHJpZ2dlci50ZXh0Lmxlbmd0aCxwb3Msc2VsZWN0ZWRUZXh0KVxyXG5cdFx0cmVwbGFjZVJhbmdlKHZpZXcscG9zLXRoaXMudHJpZ2dlci50ZXh0Lmxlbmd0aCxwb3Msc2VsZWN0ZWRUZXh0KVxyXG5cdFx0dmlldy5mb2N1cygpO1xyXG5cdFx0c2V0Q3Vyc29yKHZpZXcsY2FsY3VsYXRlTmV3Q3Vyc29yUG9zaXRpb24odGhpcy50cmlnZ2VyLnRleHQsc2VsZWN0ZWRUZXh0LHBvcykpXHJcblx0XHRjb25zb2xlLmxvZyhgU2VsZWN0ZWQ6ICR7c2VsZWN0ZWRUZXh0fWApO1xyXG5cdH1cclxufVxyXG5mdW5jdGlvbiBjYWxjdWxhdGVOZXdDdXJzb3JQb3NpdGlvbih0cmlnZ2VyVGV4dDogc3RyaW5nLCBzZWxlY3RlZFRleHQ6IHN0cmluZywgb3JpZ2luYWxQb3M6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBjb25zdCBsZW5ndGhEaWZmZXJlbmNlID0gc2VsZWN0ZWRUZXh0Lmxlbmd0aCAtIHRyaWdnZXJUZXh0Lmxlbmd0aDtcclxuICAgIHJldHVybiBvcmlnaW5hbFBvcyArIGxlbmd0aERpZmZlcmVuY2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUZsb2F0aW5nU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zOiBhbnlbXSxlZGl0b3JWaWV3OiBFZGl0b3JWaWV3LCBwb3NpdGlvbjogbnVtYmVyKSB7XHJcblxyXG4gICAgY29uc3QgY29vcmRpbmF0ZXMgPSBlZGl0b3JWaWV3LmNvb3Jkc0F0UG9zKHBvc2l0aW9uKTtcclxuICAgIGlmICghY29vcmRpbmF0ZXMpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBzdWdnZXN0aW9uRHJvcGRvd24gPSBjcmVhdGVTdWdnZXN0aW9uRHJvcGRvd24oc3VnZ2VzdGlvbnMpO1xyXG5cclxuICAgIHN1Z2dlc3Rpb25Ecm9wZG93bi5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIjtcclxuICAgIHN1Z2dlc3Rpb25Ecm9wZG93bi5zdHlsZS5sZWZ0ID0gYCR7Y29vcmRpbmF0ZXMubGVmdH1weGA7XHJcbiAgICBzdWdnZXN0aW9uRHJvcGRvd24uc3R5bGUudG9wID0gYCR7Y29vcmRpbmF0ZXMuYm90dG9tfXB4YDtcclxuXHRyZXR1cm4gc3VnZ2VzdGlvbkRyb3Bkb3duO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gY3JlYXRlU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zOiBzdHJpbmdbXSkge1xyXG4gICAgY29uc3QgZHJvcGRvd25Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgZHJvcGRvd25Db250YWluZXIuY2xhc3NOYW1lID0gXCJzdWdnZXN0aW9uLWRyb3Bkb3duXCI7XHJcblxyXG4gICAgc3VnZ2VzdGlvbnMuZm9yRWFjaCgoc3VnZ2VzdGlvbikgPT4ge1xyXG4gICAgICAgIGNvbnN0IGl0ZW0gPSBjcmVhdGVTdWdnZXN0aW9uSXRlbShzdWdnZXN0aW9uKVxyXG5cdFx0ZHJvcGRvd25Db250YWluZXIuYXBwZW5kQ2hpbGQoaXRlbSlcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiBkcm9wZG93bkNvbnRhaW5lcjtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlU3VnZ2VzdGlvbkl0ZW0oZGlzcGxheVRleHQ6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcclxuXHQvLyBDcmVhdGUgdGhlIG91dGVyIHN1Z2dlc3Rpb24gaXRlbSBjb250YWluZXJcclxuXHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwic3VnZ2VzdGlvbi1pdGVtXCIpO1xyXG5cdGNvbnRhaW5lci5pbm5lclRleHQ9ZGlzcGxheVRleHRcclxuICBcdHJldHVybiBjb250YWluZXJcclxuXHQvLyBDcmVhdGUgdGhlIGljb24gY29udGFpbmVyXHJcblx0Y29uc3QgaWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblx0aWNvbi5jbGFzc0xpc3QuYWRkKFwiaWNvblwiKTtcclxuXHRpY29uLnRleHRDb250ZW50ID0gXCLGklwiOyAvLyBQbGFjZWhvbGRlciBpY29uIGNvbnRlbnRcclxuICBcclxuXHQvLyBDcmVhdGUgdGhlIGRldGFpbHMgY29udGFpbmVyXHJcblx0Y29uc3QgZGV0YWlscyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblx0ZGV0YWlscy5jbGFzc0xpc3QuYWRkKFwiZGV0YWlsc1wiKTtcclxuICBcclxuXHQvLyBBZGQgYSBuYW1lIHNwYW4gdG8gZGV0YWlsc1xyXG5cdGNvbnN0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuXHRuYW1lLmNsYXNzTGlzdC5hZGQoXCJuYW1lXCIpO1xyXG5cdG5hbWUudGV4dENvbnRlbnQgPSBcImZ1bmN0aW9uXCI7IC8vIFBsYWNlaG9sZGVyIG5hbWUgY29udGVudFxyXG4gIFxyXG5cdC8vIEFkZCBhIHR5cGUgc3BhbiB0byBkZXRhaWxzXHJcblx0Y29uc3QgdHlwZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG5cdHR5cGUuY2xhc3NMaXN0LmFkZChcInR5cGVcIik7XHJcblx0dHlwZS50ZXh0Q29udGVudCA9IFwiS2V5d29yZFwiOyAvLyBQbGFjZWhvbGRlciB0eXBlIGNvbnRlbnRcclxuICBcclxuXHQvLyBBcHBlbmQgbmFtZSBhbmQgdHlwZSB0byBkZXRhaWxzXHJcblx0ZGV0YWlscy5hcHBlbmRDaGlsZChuYW1lKTtcclxuXHRkZXRhaWxzLmFwcGVuZENoaWxkKHR5cGUpO1xyXG4gIFxyXG5cdC8vIEFwcGVuZCBpY29uIGFuZCBkZXRhaWxzIHRvIHRoZSBjb250YWluZXJcclxuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaWNvbik7XHJcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xyXG4gIFxyXG5cdHJldHVybiBjb250YWluZXI7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuLypcclxuZXhwb3J0IGNsYXNzIE51bWVyYWxzU3VnZ2VzdG9yIGV4dGVuZHMgRWRpdG9yU3VnZ2VzdDxzdHJpbmc+IHtcclxuXHRwbHVnaW46IE51bWVyYWxzUGx1Z2luO1xyXG5cdFxyXG5cdC8qKlxyXG5cdCAqIFRpbWUgb2YgbGFzdCBzdWdnZXN0aW9uIGxpc3QgdXBkYXRlXHJcblx0ICogQHR5cGUge251bWJlcn1cclxuXHQgKiBAcHJpdmF0ZSBcclxuXHRwcml2YXRlIGxhc3RTdWdnZXN0aW9uTGlzdFVwZGF0ZTogbnVtYmVyID0gMDtcclxuXHJcblx0LyoqXHJcblx0ICogTGlzdCBvZiBwb3NzaWJsZSBzdWdnZXN0aW9ucyBiYXNlZCBvbiBjdXJyZW50IGNvZGUgYmxvY2tcclxuXHQgKiBAdHlwZSB7c3RyaW5nW119XHJcblx0ICogQHByaXZhdGUgXHJcblx0cHJpdmF0ZSBsb2NhbFN1Z2dlc3Rpb25DYWNoZTogc3RyaW5nW10gPSBbXTtcclxuXHJcblx0Ly9lbXB0eSBjb25zdHJ1Y3RvclxyXG5cdGNvbnN0cnVjdG9yKHBsdWdpbjogTnVtZXJhbHNQbHVnaW4pIHtcclxuXHRcdHN1cGVyKHBsdWdpbi5hcHApO1xyXG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcblx0fVxyXG5cclxuXHRvblRyaWdnZXIoY3Vyc29yOiBFZGl0b3JQb3NpdGlvbiwgZWRpdG9yOiBFZGl0b3IsIGZpbGU6IFRGaWxlKTogRWRpdG9yU3VnZ2VzdFRyaWdnZXJJbmZvIHwgbnVsbCB7XHJcblxyXG5cdFx0Y29uc3QgY21FZGl0b3IgPSBlZGl0b3IgYXMgYW55O1xyXG5cdFx0Y29uc3QgdmlldyA9IGNtRWRpdG9yLmNtID8gKGNtRWRpdG9yLmNtIGFzIEVkaXRvclZpZXcpIDogbnVsbDtcclxuXHRcdGlmICh2aWV3ID09PSBudWxsKSByZXR1cm4gbnVsbDtcclxuXHRcdGNvbnN0IGNvZGVibG9ja0xlbmc9bGFuZ0lmV2l0aGluQ29kZWJsb2NrKHZpZXcuc3RhdGUpXHJcblx0XHRjb25zdCBpc01hdGhCbG9jaz1jb2RlYmxvY2tMZW5nPy5jb250YWlucygndGlreicpXHJcblxyXG5cdFx0Y29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XHJcblx0XHRjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XHJcblx0XHQvL2NvbnN0IGRvbU5vZGUgPSB2aWV3LmRvbUF0UG9zKGxpbmUuZnJvbSkubm9kZTtcclxuXHRcdGlmICghaXNNYXRoQmxvY2spIHtcclxuXHRcdFx0cmV0dXJuIG51bGw7XHJcblx0XHR9XHJcblx0XHRcclxuXHJcblx0XHQvLyBHZXQgbGFzdCB3b3JkIGluIGN1cnJlbnQgbGluZVxyXG5cdFx0Y29uc3QgY3VycmVudExpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKS50ZXh0O1xyXG5cdFx0Y29uc3QgY3VycmVudExpbmVMYXN0V29yZFN0YXJ0ID0gY3VycmVudExpbmUuc2VhcmNoKC9bOl0/WyRAXFx3XFx1MDM3MC1cXHUwM0ZGXSskLyk7XHJcblx0XHQvLyBpZiB0aGVyZSBpcyBubyB3b3JkLCByZXR1cm4gbnVsbFxyXG5cdFx0aWYgKGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydCA9PT0gLTEpIHtcclxuXHRcdFx0cmV0dXJuIG51bGw7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c3RhcnQ6IHtsaW5lOiBjdXJzb3IubGluZSwgY2g6IGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydH0sXHJcblx0XHRcdGVuZDogY3Vyc29yLFxyXG5cdFx0XHRxdWVyeTogY3VycmVudExpbmUuc2xpY2UoY3VycmVudExpbmVMYXN0V29yZFN0YXJ0KVxyXG5cdFx0fTtcclxuXHR9XHJcblxyXG5cdGdldFN1Z2dlc3Rpb25zKGNvbnRleHQ6IEVkaXRvclN1Z2dlc3RDb250ZXh0KTogc3RyaW5nW10gfCBQcm9taXNlPHN0cmluZ1tdPiB7XHJcblx0XHRsZXQgbG9jYWxTeW1ib2xzOiBzdHJpbmcgW10gPSBbXTtcdFxyXG5cclxuXHRcdGxvY2FsU3ltYm9scyA9IHRoaXMubG9jYWxTdWdnZXN0aW9uQ2FjaGVcclxuXHRcdGNvbnN0IHF1ZXJ5ID0gY29udGV4dC5xdWVyeS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuXHRcdGNvbnN0IGxvY2FsX3N1Z2dlc3Rpb25zID0gbG9jYWxTeW1ib2xzLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDIpKTtcclxuXHRcdGxvY2FsX3N1Z2dlc3Rpb25zLnNvcnQoKGEsIGIpID0+IGEuc2xpY2UoMikubG9jYWxlQ29tcGFyZShiLnNsaWNlKDIpKSk7XHJcblx0XHRcclxuXHRcdC8vIGNhc2UtaW5zZW5zaXRpdmUgZmlsdGVyIG1hdGhqcyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBxdWVyeS4gRG9uJ3QgcmV0dXJuIHZhbHVlIGlmIGZ1bGwgbWF0Y2hcclxuXHRcdGxldCBzdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcclxuXHJcblx0XHRjb25zdCBtYXRoanNfc3VnZ2VzdGlvbnMgPSBnZXRNYXRoSnNTeW1ib2xzKCkuZmlsdGVyKChvYmo6IExhdGV4KSA9PiBvYmoudmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMikpO1xyXG5cclxuXHRcdHN1Z2dlc3Rpb25zID0gbWF0aGpzX3N1Z2dlc3Rpb25zLm1hcCgobzpMYXRleCk9Pm8udmFsdWUpLy9sb2NhbF9zdWdnZXN0aW9ucy5jb25jYXQobWF0aGpzX3N1Z2dlc3Rpb25zKTtcclxuXHJcblx0XHQvKnN1Z2dlc3Rpb25zID0gc3VnZ2VzdGlvbnMuY29uY2F0KFxyXG5cdFx0XHRudW1lcmFsc0RpcmVjdGl2ZXNcclxuXHRcdFx0XHQuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAwKSlcclxuXHRcdFx0XHQubWFwKCh2YWx1ZSkgPT4gJ218JyArIHZhbHVlKVxyXG5cdFx0XHQpO1xyXG5cclxuXHRcdHJldHVybiBzdWdnZXN0aW9ucztcclxuXHR9XHJcblxyXG5cdHJlbmRlclN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcblx0XHRlbC5zZXRUZXh0KHZhbHVlKS8qXHJcblx0XHRlbC5hZGRDbGFzc2VzKFsnbW9kLWNvbXBsZXgnLCAnbnVtZXJhbHMtc3VnZ2VzdGlvbiddKTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25Db250ZW50ID0gZWwuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWNvbnRlbnQnfSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uVGl0bGUgPSBzdWdnZXN0aW9uQ29udGVudC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tdGl0bGUnfSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uTm90ZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1ub3RlJ30pO1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkF1eCA9IGVsLmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1hdXgnfSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uRmxhaXIgPSBzdWdnZXN0aW9uQXV4LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1mbGFpcid9KTsqL1xyXG5cclxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnNcclxuXHRcdC8qXHJcblx0XHRjb25zdCBbaWNvblR5cGUsIHN1Z2dlc3Rpb25UZXh0LCBub3RlVGV4dF0gPSB2YWx1ZS5zcGxpdCgnfCcpO1xyXG5cclxuXHRcdGlmIChpY29uVHlwZSA9PT0gJ2YnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZnVuY3Rpb24tc3F1YXJlJyk7XHRcdFxyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ2MnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnbG9jYXRlLWZpeGVkJyk7XHJcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAndicpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdmaWxlLWNvZGUnKTtcclxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdwJykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2JveCcpO1xyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ20nKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnc3BhcmtsZXMnKTtcdFx0XHRcclxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdnJykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2Nhc2UtbG93ZXInKTsgLy8gQXNzdW1pbmcgJ3N5bWJvbCcgaXMgYSB2YWxpZCBpY29uIG5hbWVcclxuXHRcdH1cclxuXHRcdHN1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHN1Z2dlc3Rpb25UZXh0KTtcclxuXHRcdGlmIChub3RlVGV4dCkge1xyXG5cdFx0XHRzdWdnZXN0aW9uTm90ZS5zZXRUZXh0KG5vdGVUZXh0KTtcclxuXHRcdH1cclxuXHRcdC8vc3VnZ2VzdGlvblRpdGxlLnNldFRleHQodmFsdWUpO1xyXG5cclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIENhbGxlZCB3aGVuIGEgc3VnZ2VzdGlvbiBpcyBzZWxlY3RlZC4gUmVwbGFjZXMgdGhlIGN1cnJlbnQgd29yZCB3aXRoIHRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXHJcblx0ICogQHBhcmFtIHZhbHVlIFRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXHJcblx0ICogQHBhcmFtIGV2dCBUaGUgZXZlbnQgdGhhdCB0cmlnZ2VyZWQgdGhlIHNlbGVjdGlvblxyXG5cdCAqIEByZXR1cm5zIHZvaWRcclxuXHQgXHJcblxyXG5cdHNlbGVjdFN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZXZ0OiBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG5cdFx0aWYgKHRoaXMuY29udGV4dCkge1xyXG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmNvbnRleHQuZWRpdG9yO1xyXG5cdFx0XHRcclxuXHRcdFx0Y29uc3QgY21FZGl0b3IgPSBlZGl0b3IgYXMgYW55O1xyXG5cdFx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xyXG5cdFx0XHRpZiAodmlldyA9PT0gbnVsbCkgcmV0dXJuO1xyXG5cdFxyXG5cdFx0XHRjb25zdCBjdXJzb3IgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluO1xyXG5cdFx0XHRjb25zdCBmcm9tID0gY3Vyc29yLmZyb207XHJcblx0XHRcdGNvbnN0IHRvID0gY3Vyc29yLnRvOyBcclxuXHRcclxuXHRcdFx0dmlldy5kaXNwYXRjaCh7XHJcblx0XHRcdFx0Y2hhbmdlczogeyBmcm9tLCB0bywgaW5zZXJ0OiB2YWx1ZSB9LFxyXG5cdFx0XHRcdHNlbGVjdGlvbjogeyBhbmNob3I6IGZyb20gKyB2YWx1ZS5sZW5ndGggfVxyXG5cdFx0XHR9KTtcclxuXHRcdFx0XHJcblx0XHRcdHRoaXMuY2xvc2UoKTtcclxuXHRcdH1cclxuXHR9XHJcbn1cclxuKi9cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGFyYWN0ZXJBdFBvcyh2aWV3T3JTdGF0ZTogRWRpdG9yVmlldyB8IEVkaXRvclN0YXRlLCBwb3M6IG51bWJlcikge1xyXG5cdGNvbnN0IHN0YXRlID0gdmlld09yU3RhdGUgaW5zdGFuY2VvZiBFZGl0b3JWaWV3ID8gdmlld09yU3RhdGUuc3RhdGUgOiB2aWV3T3JTdGF0ZTtcclxuXHRjb25zdCBkb2MgPSBzdGF0ZS5kb2M7XHJcblx0cmV0dXJuIGRvYy5zbGljZShwb3MsIHBvcysxKS50b1N0cmluZygpO1xyXG59XHJcblxyXG5cclxuIFxyXG5jb25zdCBsYW5nSWZXaXRoaW5Db2RlYmxvY2sgPSAoc3RhdGU6IEVkaXRvclN0YXRlKTogc3RyaW5nIHwgbnVsbCA9PiB7XHJcblx0Y29uc3QgdHJlZSA9IHN5bnRheFRyZWUoc3RhdGUpO1xyXG5cclxuXHRjb25zdCBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XHJcblxyXG5cdC8qXHJcblx0KiBnZXQgYSB0cmVlIGN1cnNvciBhdCB0aGUgcG9zaXRpb25cclxuXHQqXHJcblx0KiBBIG5ld2xpbmUgZG9lcyBub3QgYmVsb25nIHRvIGFueSBzeW50YXggbm9kZXMgZXhjZXB0IGZvciB0aGUgRG9jdW1lbnQsXHJcblx0KiB3aGljaCBjb3JyZXNwb25kcyB0byB0aGUgd2hvbGUgZG9jdW1lbnQuIFNvLCB3ZSBjaGFuZ2UgdGhlIGBtb2RlYCBvZiB0aGVcclxuXHQqIGBjdXJzb3JBdGAgZGVwZW5kaW5nIG9uIHdoZXRoZXIgdGhlIGNoYXJhY3RlciBqdXN0IGJlZm9yZSB0aGUgY3Vyc29yIGlzIGFcclxuXHQqIG5ld2xpbmUuXHJcblx0Ki9cclxuXHRjb25zdCBjdXJzb3IgPVxyXG5cdFx0cG9zID09PSAwIHx8IGdldENoYXJhY3RlckF0UG9zKHN0YXRlLCBwb3MgLSAxKSA9PT0gXCJcXG5cIlxyXG5cdFx0PyB0cmVlLmN1cnNvckF0KHBvcywgMSlcclxuXHRcdDogdHJlZS5jdXJzb3JBdChwb3MsIC0xKTtcclxuXHJcblx0Ly8gY2hlY2sgaWYgd2UncmUgaW4gYSBjb2RlYmxvY2sgYXRtIGF0IGFsbFxyXG5cdGNvbnN0IGluQ29kZWJsb2NrID0gY3Vyc29yLm5hbWUuY29udGFpbnMoXCJjb2RlYmxvY2tcIik7XHJcblx0aWYgKCFpbkNvZGVibG9jaykge1xyXG5cdFx0cmV0dXJuIG51bGw7XHJcblx0fVxyXG5cclxuXHQvLyBsb2NhdGUgdGhlIHN0YXJ0IG9mIHRoZSBibG9ja1xyXG5cdGNvbnN0IGNvZGVibG9ja0JlZ2luID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkJhY2t3YXJkLCBcIkh5cGVyTUQtY29kZWJsb2NrX0h5cGVyTUQtY29kZWJsb2NrLWJlZ2luXCIpO1xyXG5cclxuXHRpZiAoY29kZWJsb2NrQmVnaW4gPT0gbnVsbCkge1xyXG5cdFx0Y29uc29sZS53YXJuKFwidW5hYmxlIHRvIGxvY2F0ZSBzdGFydCBvZiB0aGUgY29kZWJsb2NrIGV2ZW4gdGhvdWdoIGluc2lkZSBvbmVcIik7XHJcblx0XHRyZXR1cm4gXCJcIjtcclxuXHR9XHJcblxyXG5cdC8vIGV4dHJhY3QgdGhlIGxhbmd1YWdlXHJcblx0Ly8gY29kZWJsb2NrcyBtYXkgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYmFja3RpY2tzXHJcblx0Y29uc3QgbGFuZ3VhZ2UgPSBzdGF0ZS5zbGljZURvYyhjb2RlYmxvY2tCZWdpbi5mcm9tLCBjb2RlYmxvY2tCZWdpbi50bykucmVwbGFjZSgvYCsvLCBcIlwiKTtcclxuXHJcblx0cmV0dXJuIGxhbmd1YWdlO1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FsYXRlVG9Ub2tlbihjdXJzb3I6IFRyZWVDdXJzb3IsIGRpcjogRGlyZWN0aW9uLCB0YXJnZXQ6IHN0cmluZyk6IFN5bnRheE5vZGUgfCBudWxsIHtcclxuXHQvLyBBbGxvdyB0aGUgc3RhcnRpbmcgbm9kZSB0byBiZSBhIG1hdGNoXHJcblx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcclxuXHRcdHJldHVybiBjdXJzb3Iubm9kZTtcclxuXHR9XHJcblxyXG5cdHdoaWxlIChcclxuXHRcdChjdXJzb3IubmFtZSAhPSBcIkRvY3VtZW50XCIpICYmXHJcblx0XHQoKGRpciA9PSBEaXJlY3Rpb24uQmFja3dhcmQgJiYgY3Vyc29yLnByZXYoKSlcclxuXHRcdHx8IChkaXIgPT0gRGlyZWN0aW9uLkZvcndhcmQgJiYgY3Vyc29yLm5leHQoKSlcclxuXHRcdHx8IGN1cnNvci5wYXJlbnQoKSlcclxuXHQpIHtcclxuXHRcdGlmIChjdXJzb3IubmFtZS5jb250YWlucyh0YXJnZXQpKSB7XHJcblx0XHRcdHJldHVybiBjdXJzb3Iubm9kZTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZW51bSBEaXJlY3Rpb24ge1xyXG5cdEJhY2t3YXJkLFxyXG5cdEZvcndhcmQsXHJcbn0iXX0=