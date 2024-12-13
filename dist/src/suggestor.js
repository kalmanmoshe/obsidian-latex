import { getTikzSuggestions } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { Context } from "./editor utilities/context";
import { replaceRange, setCursor } from "./editor utilities/editor_utils";
const numeralsDirectives = [
    "@hideRows",
    "@Sum",
    "@Total",
];
class SuggestorTrigger {
    text;
    constructor(pos, view) {
        this.text = this.getCurrentLineText(pos, view);
    }
    setTrigger(trigger) {
    }
    getCurrentLineText(pos, view) {
        const line = view.state.doc.lineAt(pos);
        console.log('line.text.slice(0, (pos+2) - line.from).trim()', line.text);
        const cursorOffsetInLine = (pos + 2) - line.from;
        const textUpToCursor = line.text.slice(0, cursorOffsetInLine).trim();
        const words = textUpToCursor.split(/\s+/);
        return words[words.length - 1] || "";
    }
}
export class Suggestor {
    plugin;
    trigger;
    selectionIndex;
    context;
    listenForTransaction;
    constructor(plugin) {
        this.plugin = plugin;
        this.monitor();
    }
    monitor() {
        this.plugin.registerEditorExtension([
            Prec.highest(EditorView.domEventHandlers({
                "keydown": (event, view) => this.onKeydown(event, view),
            })),
            EditorView.updateListener.of((update) => {
                if (this.listenForTransaction && update.docChanged) {
                    this.onTransaction(update.view);
                    this.listenForTransaction = false;
                }
            }),
        ]);
    }
    onKeydown(event, view) {
        this.handleDropdownNavigation(event, view);
        if (this.isValueKey(event))
            this.listenForTransaction = true;
    }
    onTransaction(view) {
        this.context = Context.fromView(view);
        if (this.context.codeblockLanguage === "tikz") {
            this.deployDropdown(view);
        }
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
        if (event.key === "ArrowDown") {
            this.selectionIndex = (this.selectionIndex + 1) % items.length;
            this.updateSelection(items);
            event.preventDefault();
        }
        else if (event.key === "ArrowUp") {
            this.selectionIndex = (this.selectionIndex - 1 + items.length) % items.length;
            this.updateSelection(items);
            event.preventDefault();
        }
        else if (event.key === "Enter") {
            const selectedItem = items[this.selectionIndex];
            if (selectedItem && this.context) {
                this.selectDropdownItem(selectedItem, view);
            }
            dropdown.remove();
            event.preventDefault();
        }
        else if (event.key === "Escape") {
            dropdown.remove();
            event.preventDefault();
        }
    }
    isValueKey(event) {
        return event.code.contains('Key') && !event.ctrlKey;
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
    deployDropdown(view) {
        const existingDropdown = this.dropdownifAnyDeployed();
        if (existingDropdown)
            existingDropdown.remove();
        const suggestions = this.getSuggestions(view);
        if (suggestions.length < 1)
            return;
        const suggestionDropdown = createFloatingSuggestionDropdown(suggestions, view, this.context.pos);
        if (!suggestionDropdown)
            return;
        document.body.appendChild(suggestionDropdown);
        this.selectionIndex = 0;
        this.updateSelection(this.getAlldropdownItems());
        const handleOutsideClick = (event) => {
            const suggestionItems = suggestionDropdown.querySelectorAll(".suggestion-item"); // Adjust selector as needed
            // Check if the click is on a suggestion item
            const clickedSuggestion = Array.from(suggestionItems).find((item) => item.contains(event.target));
            if (clickedSuggestion) {
                // Handle selection of the clicked suggestion
                this.selectDropdownItem(clickedSuggestion, view);
                suggestionDropdown.remove();
                document.removeEventListener("click", handleOutsideClick);
                return;
            }
            // If click is outside the dropdown, close it
            if (!suggestionDropdown.contains(event.target)) {
                suggestionDropdown.remove();
                document.removeEventListener("click", handleOutsideClick);
            }
        };
        document.addEventListener("click", handleOutsideClick);
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
// Creates a suggestion dropdown container with suggestion items
function createSuggestionDropdown(suggestions) {
    const dropdownContainer = document.createElement("div");
    dropdownContainer.className = "suggestion-dropdown";
    suggestions.forEach((suggestion) => {
        const item = createSuggestionItem(suggestion);
        item.addEventListener("click", () => {
            selectSuggestion(suggestion);
            dropdownContainer.remove();
        });
        dropdownContainer.appendChild(item);
    });
    return dropdownContainer;
}
function selectSuggestion(suggestion) {
    console.log(`Selected: ${suggestion}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFXQSxPQUFPLEVBQUUsa0JBQWtCLEVBQVMsTUFBTSxhQUFhLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsR0FBdUMsTUFBTSxrQkFBa0IsQ0FBQztBQUNuRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDbEQsT0FBTyxFQUFlLElBQUksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBSXRELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUVyRCxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFFLE1BQU0sa0JBQWtCLEdBQUc7SUFDMUIsV0FBVztJQUNYLE1BQU07SUFDTixRQUFRO0NBQ1IsQ0FBQTtBQUNELE1BQU0sZ0JBQWdCO0lBQ3JCLElBQUksQ0FBUTtJQUNaLFlBQVksR0FBVyxFQUFFLElBQWdCO1FBQ3hDLElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUM3QyxDQUFDO0lBQ0QsVUFBVSxDQUFDLE9BQWU7SUFFMUIsQ0FBQztJQUNELGtCQUFrQixDQUFDLEdBQVcsRUFBRSxJQUFnQjtRQUMvQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnREFBZ0QsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDdkUsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQUcsR0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQy9DLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxJQUFJLENB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QUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRTFGLE9BQU8sUUFBUSxDQUFDO0FBQ2pCLENBQUMsQ0FBQTtBQUdELE1BQU0sVUFBVSxlQUFlLENBQUMsTUFBa0IsRUFBRSxHQUFjLEVBQUUsTUFBYztJQUNqRix3Q0FBd0M7SUFDeEMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUNqQyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUM7S0FDbkI7SUFFRCxPQUNDLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxVQUFVLENBQUM7UUFDM0IsQ0FBQyxDQUFDLEdBQUcsSUFBSSxTQUFTLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztlQUMxQyxDQUFDLEdBQUcsSUFBSSxTQUFTLENBQUMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztlQUMzQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFDbEI7UUFDRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQztTQUNuQjtLQUNEO0lBRUQsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRUQsTUFBTSxDQUFOLElBQVksU0FHWDtBQUhELFdBQVksU0FBUztJQUNwQixpREFBUSxDQUFBO0lBQ1IsK0NBQU8sQ0FBQTtBQUNSLENBQUMsRUFIVyxTQUFTLEtBQVQsU0FBUyxRQUdwQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBOdW1lcmFsc1BsdWdpbiBmcm9tIFwiLi9tYWluXCI7XHJcbmltcG9ydCB7XHJcbiAgICBFZGl0b3JTdWdnZXN0LFxyXG4gICAgRWRpdG9yUG9zaXRpb24sXHJcbiAgICBFZGl0b3IsXHJcbiAgICBURmlsZSxcclxuICAgIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbyxcclxuICAgIEVkaXRvclN1Z2dlc3RDb250ZXh0LFxyXG4gICAgc2V0SWNvbixcclxuIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5pbXBvcnQgeyBnZXRUaWt6U3VnZ2VzdGlvbnMsIExhdGV4IH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdQbHVnaW4sIFZpZXdVcGRhdGUgLERlY29yYXRpb24sIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xyXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSwgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBTeW50YXhOb2RlLCBUcmVlQ3Vyc29yIH0gZnJvbSBcIkBsZXplci9jb21tb25cIjtcclxuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBjb250ZXh0IH0gZnJvbSBcImVzYnVpbGQtd2FzbVwiO1xyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9jb250ZXh0XCI7XHJcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSBcIi4vbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyByZXBsYWNlUmFuZ2UsIHNldEN1cnNvciB9IGZyb20gXCIuL2VkaXRvciB1dGlsaXRpZXMvZWRpdG9yX3V0aWxzXCI7XHJcblxyXG5cclxuY29uc3QgbnVtZXJhbHNEaXJlY3RpdmVzID0gW1xyXG5cdFwiQGhpZGVSb3dzXCIsXHJcblx0XCJAU3VtXCIsXHJcblx0XCJAVG90YWxcIixcclxuXVxyXG5jbGFzcyBTdWdnZXN0b3JUcmlnZ2Vye1xyXG5cdHRleHQ6IHN0cmluZ1xyXG5cdGNvbnN0cnVjdG9yKHBvczogbnVtYmVyLCB2aWV3OiBFZGl0b3JWaWV3KXtcclxuXHRcdHRoaXMudGV4dD10aGlzLmdldEN1cnJlbnRMaW5lVGV4dChwb3MsIHZpZXcpXHJcblx0fVxyXG5cdHNldFRyaWdnZXIodHJpZ2dlcjogc3RyaW5nKXtcclxuXHJcblx0fVxyXG5cdGdldEN1cnJlbnRMaW5lVGV4dChwb3M6IG51bWJlciwgdmlldzogRWRpdG9yVmlldyk6IHN0cmluZyB7XHJcblx0XHRjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XHJcblx0XHRjb25zb2xlLmxvZygnbGluZS50ZXh0LnNsaWNlKDAsIChwb3MrMikgLSBsaW5lLmZyb20pLnRyaW0oKScsbGluZS50ZXh0KVxyXG5cdFx0Y29uc3QgY3Vyc29yT2Zmc2V0SW5MaW5lID0gKHBvcysyKSAtIGxpbmUuZnJvbTtcclxuXHRcdGNvbnN0IHRleHRVcFRvQ3Vyc29yID0gbGluZS50ZXh0LnNsaWNlKDAsIGN1cnNvck9mZnNldEluTGluZSkudHJpbSgpO1xyXG5cdFxyXG5cdFx0Y29uc3Qgd29yZHMgPSB0ZXh0VXBUb0N1cnNvci5zcGxpdCgvXFxzKy8pO1xyXG5cdFx0cmV0dXJuIHdvcmRzW3dvcmRzLmxlbmd0aCAtIDFdIHx8IFwiXCI7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgU3VnZ2VzdG9yIHtcclxuXHRwcml2YXRlIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuXHRwcml2YXRlIHRyaWdnZXI6IFN1Z2dlc3RvclRyaWdnZXI7XHJcblx0cHJpdmF0ZSBzZWxlY3Rpb25JbmRleD86IG51bWJlcjtcclxuXHRwcml2YXRlIGNvbnRleHQ6IENvbnRleHQ7XHJcblx0cHJpdmF0ZSBsaXN0ZW5Gb3JUcmFuc2FjdGlvbjogYm9vbGVhbjtcclxuXHRjb25zdHJ1Y3RvcihwbHVnaW46IE1hdGhQbHVnaW4pe1xyXG5cdFx0dGhpcy5wbHVnaW49cGx1Z2luXHJcblx0XHR0aGlzLm1vbml0b3IoKTtcclxuXHR9XHJcblx0cHJpdmF0ZSBtb25pdG9yKCkge1xyXG5cdFx0dGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oW1xyXG5cdFx0XHRQcmVjLmhpZ2hlc3QoRWRpdG9yVmlldy5kb21FdmVudEhhbmRsZXJzKHtcclxuXHRcdFx0XHRcImtleWRvd25cIjogKGV2ZW50LCB2aWV3KSA9PiB0aGlzLm9uS2V5ZG93bihldmVudCwgdmlldyksXHJcblx0XHRcdH0pKSxcclxuXHRcdFx0RWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZigodXBkYXRlKSA9PiB7XHJcblx0XHRcdFx0aWYgKHRoaXMubGlzdGVuRm9yVHJhbnNhY3Rpb24gJiYgdXBkYXRlLmRvY0NoYW5nZWQpIHtcclxuXHRcdFx0XHRcdHRoaXMub25UcmFuc2FjdGlvbih1cGRhdGUudmlldyk7XHJcblx0XHRcdFx0XHR0aGlzLmxpc3RlbkZvclRyYW5zYWN0aW9uID0gZmFsc2U7IFxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSksXHJcblx0XHRdKTtcclxuXHR9XHJcblx0cHJpdmF0ZSBvbktleWRvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQsIHZpZXc6IEVkaXRvclZpZXcpIHtcclxuXHRcdHRoaXMuaGFuZGxlRHJvcGRvd25OYXZpZ2F0aW9uKGV2ZW50LHZpZXcpO1xyXG5cdFx0aWYodGhpcy5pc1ZhbHVlS2V5KGV2ZW50KSlcclxuXHRcdFx0dGhpcy5saXN0ZW5Gb3JUcmFuc2FjdGlvbiA9IHRydWU7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIG9uVHJhbnNhY3Rpb24odmlldzogRWRpdG9yVmlldykge1xyXG5cdFx0dGhpcy5jb250ZXh0ICA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblx0XHRpZiAodGhpcy5jb250ZXh0LmNvZGVibG9ja0xhbmd1YWdlID09PSBcInRpa3pcIikge1xyXG5cdFx0XHR0aGlzLmRlcGxveURyb3Bkb3duKHZpZXcpXHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGdldEFsbGRyb3Bkb3duSXRlbXMoKXtyZXR1cm4gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKX1cclxuXHRwcml2YXRlIGRyb3Bkb3duaWZBbnlEZXBsb3llZCgpe3JldHVybiBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCIuc3VnZ2VzdGlvbi1kcm9wZG93blwiKX1cclxuXHJcblx0cHJpdmF0ZSBoYW5kbGVEcm9wZG93bk5hdmlnYXRpb24oZXZlbnQ6IEtleWJvYXJkRXZlbnQsdmlldzpFZGl0b3JWaWV3KSB7XHJcblx0XHRjb25zdCBkcm9wZG93biA9IHRoaXMuZHJvcGRvd25pZkFueURlcGxveWVkKCk7XHJcblx0XHRpZiAoIWRyb3Bkb3duIHx8IHRoaXMuc2VsZWN0aW9uSW5kZXggPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xyXG5cdFxyXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEFsbGRyb3Bkb3duSXRlbXMoKTtcclxuXHJcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XHJcblx0XHRpZiAoZXZlbnQua2V5ID09PSBcIkFycm93RG93blwiKSB7XHJcblx0XHRcdHRoaXMuc2VsZWN0aW9uSW5kZXggPSAodGhpcy5zZWxlY3Rpb25JbmRleCArIDEpICUgaXRlbXMubGVuZ3RoO1xyXG5cdFx0XHR0aGlzLnVwZGF0ZVNlbGVjdGlvbihpdGVtcyk7XHJcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd1VwXCIpIHtcclxuXHRcdFx0dGhpcy5zZWxlY3Rpb25JbmRleCA9ICh0aGlzLnNlbGVjdGlvbkluZGV4IC0gMSArIGl0ZW1zLmxlbmd0aCkgJSBpdGVtcy5sZW5ndGg7XHJcblx0XHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uKGl0ZW1zKTtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcclxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gaXRlbXNbdGhpcy5zZWxlY3Rpb25JbmRleF07XHJcblx0XHRcdGlmIChzZWxlY3RlZEl0ZW0mJnRoaXMuY29udGV4dCkge1xyXG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcGRvd25JdGVtKHNlbGVjdGVkSXRlbSx2aWV3KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRkcm9wZG93bi5yZW1vdmUoKTtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XHJcblx0XHRcdGRyb3Bkb3duLnJlbW92ZSgpO1xyXG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBpc1ZhbHVlS2V5KGV2ZW50OiBLZXlib2FyZEV2ZW50KXtcclxuXHRcdHJldHVybiBldmVudC5jb2RlLmNvbnRhaW5zKCdLZXknKSYmIWV2ZW50LmN0cmxLZXlcclxuXHR9XHJcblxyXG5cdFxyXG5cclxuXHRwcml2YXRlIGdldFN1Z2dlc3Rpb25zKHZpZXc6IEVkaXRvclZpZXcpIHtcclxuXHRcdHRoaXMudHJpZ2dlcj1uZXcgU3VnZ2VzdG9yVHJpZ2dlcih0aGlzLmNvbnRleHQucG9zLCB2aWV3KVxyXG5cdFx0Y29uc3QgYWxsU3VnZ2VzdGlvbnMgPSBnZXRUaWt6U3VnZ2VzdGlvbnMoKS5tYXAocyA9PiBzLnRyaWdnZXJ8fHMucmVwbGFjZW1lbnQpO1xyXG5cdFxyXG5cdFx0Y29uc3QgZmlsdGVyZWRTdWdnZXN0aW9ucyA9IGFsbFN1Z2dlc3Rpb25zLmZpbHRlcigoc3VnZ2VzdGlvbikgPT5cclxuXHRcdFx0c3VnZ2VzdGlvbi50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgodGhpcy50cmlnZ2VyLnRleHQudG9Mb3dlckNhc2UoKSlcclxuXHRcdCk7XHJcblx0XHJcblx0XHRjb25zdCBzb3J0ZWRTdWdnZXN0aW9ucyA9IGZpbHRlcmVkU3VnZ2VzdGlvbnMuc29ydCgoYSwgYikgPT4ge1xyXG5cdFx0XHRjb25zdCBsb3dlckxhc3RXb3JkID0gdGhpcy50cmlnZ2VyLnRleHQudG9Mb3dlckNhc2UoKTtcclxuXHRcdFx0Y29uc3QgYUxvd2VyID0gYS50b0xvd2VyQ2FzZSgpO1xyXG5cdFx0XHRjb25zdCBiTG93ZXIgPSBiLnRvTG93ZXJDYXNlKCk7XHJcblx0XHJcblxyXG5cdFx0XHRjb25zdCBhRXhhY3RNYXRjaCA9IGFMb3dlciA9PT0gbG93ZXJMYXN0V29yZCA/IC0xIDogMDtcclxuXHRcdFx0Y29uc3QgYkV4YWN0TWF0Y2ggPSBiTG93ZXIgPT09IGxvd2VyTGFzdFdvcmQgPyAtMSA6IDA7XHJcblx0XHRcdGlmIChhRXhhY3RNYXRjaCAhPT0gYkV4YWN0TWF0Y2gpIHJldHVybiBhRXhhY3RNYXRjaCAtIGJFeGFjdE1hdGNoO1xyXG5cdFxyXG5cdFx0XHRpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDtcclxuXHRcclxuXHRcdFx0cmV0dXJuIGFMb3dlci5sb2NhbGVDb21wYXJlKGJMb3dlcik7XHJcblx0XHR9KTtcclxuXHRcdHJldHVybiBzb3J0ZWRTdWdnZXN0aW9ucztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGVwbG95RHJvcGRvd24odmlldzogRWRpdG9yVmlldyl7XHJcblx0XHRjb25zdCBleGlzdGluZ0Ryb3Bkb3duID0gdGhpcy5kcm9wZG93bmlmQW55RGVwbG95ZWQoKTtcclxuXHRcdGlmIChleGlzdGluZ0Ryb3Bkb3duKSBleGlzdGluZ0Ryb3Bkb3duLnJlbW92ZSgpO1xyXG5cclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zPXRoaXMuZ2V0U3VnZ2VzdGlvbnModmlldylcclxuXHRcdGlmKHN1Z2dlc3Rpb25zLmxlbmd0aDwxKXJldHVybjtcclxuXHJcblx0XHRjb25zdCBzdWdnZXN0aW9uRHJvcGRvd24gPSBjcmVhdGVGbG9hdGluZ1N1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9ucyx2aWV3LCB0aGlzLmNvbnRleHQucG9zKTtcclxuXHRcdGlmICghc3VnZ2VzdGlvbkRyb3Bkb3duKSByZXR1cm47XHJcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHN1Z2dlc3Rpb25Ecm9wZG93bik7XHJcblxyXG5cdFx0dGhpcy5zZWxlY3Rpb25JbmRleD0wO1xyXG5cdFx0dGhpcy51cGRhdGVTZWxlY3Rpb24odGhpcy5nZXRBbGxkcm9wZG93bkl0ZW1zKCkpO1xyXG5cclxuXHRcdGNvbnN0IGhhbmRsZU91dHNpZGVDbGljayA9IChldmVudDogTW91c2VFdmVudCkgPT4ge1xyXG5cdFx0XHRjb25zdCBzdWdnZXN0aW9uSXRlbXMgPSBzdWdnZXN0aW9uRHJvcGRvd24ucXVlcnlTZWxlY3RvckFsbChcIi5zdWdnZXN0aW9uLWl0ZW1cIik7IC8vIEFkanVzdCBzZWxlY3RvciBhcyBuZWVkZWRcclxuXHJcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBjbGljayBpcyBvbiBhIHN1Z2dlc3Rpb24gaXRlbVxyXG5cdFx0XHRjb25zdCBjbGlja2VkU3VnZ2VzdGlvbiA9IEFycmF5LmZyb20oc3VnZ2VzdGlvbkl0ZW1zKS5maW5kKChpdGVtKSA9PlxyXG5cdFx0XHRcdGl0ZW0uY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpXHJcblx0XHRcdCk7XHJcblx0XHRcclxuXHRcdFx0aWYgKGNsaWNrZWRTdWdnZXN0aW9uKSB7XHJcblx0XHRcdFx0Ly8gSGFuZGxlIHNlbGVjdGlvbiBvZiB0aGUgY2xpY2tlZCBzdWdnZXN0aW9uXHJcblx0XHRcdFx0dGhpcy5zZWxlY3REcm9wZG93bkl0ZW0oY2xpY2tlZFN1Z2dlc3Rpb24sdmlldyk7XHJcblx0XHRcdFx0c3VnZ2VzdGlvbkRyb3Bkb3duLnJlbW92ZSgpO1xyXG5cdFx0XHRcdGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVPdXRzaWRlQ2xpY2spO1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHJcblx0XHRcdC8vIElmIGNsaWNrIGlzIG91dHNpZGUgdGhlIGRyb3Bkb3duLCBjbG9zZSBpdFxyXG5cdFx0XHRpZiAoIXN1Z2dlc3Rpb25Ecm9wZG93bi5jb250YWlucyhldmVudC50YXJnZXQgYXMgTm9kZSkpIHtcclxuXHRcdFx0XHRzdWdnZXN0aW9uRHJvcGRvd24ucmVtb3ZlKCk7XHJcblx0XHRcdFx0ZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGhhbmRsZU91dHNpZGVDbGljayk7XHJcblx0XHRcdH1cclxuXHRcdH07XHJcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlT3V0c2lkZUNsaWNrKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgdXBkYXRlU2VsZWN0aW9uKGl0ZW1zOiBOb2RlTGlzdE9mPEVsZW1lbnQ+KSB7XHJcblx0XHRpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xyXG5cdFx0XHRpZiAoaW5kZXggPT09IHRoaXMuc2VsZWN0aW9uSW5kZXgpIHtcclxuXHRcdFx0XHRpdGVtLmNsYXNzTGlzdC5hZGQoXCJzZWxlY3RlZFwiKTtcclxuXHRcdFx0XHRpdGVtLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6IFwibmVhcmVzdFwiIH0pO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGl0ZW0uY2xhc3NMaXN0LnJlbW92ZShcInNlbGVjdGVkXCIpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgc2VsZWN0RHJvcGRvd25JdGVtKGl0ZW06IEVsZW1lbnQsdmlldzogRWRpdG9yVmlldykge1xyXG5cdFx0aWYoIXRoaXMuY29udGV4dClyZXR1cm4gO1xyXG5cdFx0Y29uc3Qgc2VsZWN0ZWRUZXh0ID0gaXRlbS50ZXh0Q29udGVudCB8fCBcIlwiO1xyXG5cdFx0Y29uc3QgcG9zPXRoaXMuY29udGV4dC5wb3M7XHJcblx0XHRyZXBsYWNlUmFuZ2Uodmlldyxwb3MtdGhpcy50cmlnZ2VyLnRleHQubGVuZ3RoLHBvcyxzZWxlY3RlZFRleHQpXHJcblx0XHR2aWV3LmZvY3VzKCk7XHJcblx0XHRzZXRDdXJzb3IodmlldyxjYWxjdWxhdGVOZXdDdXJzb3JQb3NpdGlvbih0aGlzLnRyaWdnZXIudGV4dCxzZWxlY3RlZFRleHQscG9zKSlcclxuXHRcdGNvbnNvbGUubG9nKGBTZWxlY3RlZDogJHtzZWxlY3RlZFRleHR9YCk7XHJcblx0fVxyXG59XHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZU5ld0N1cnNvclBvc2l0aW9uKHRyaWdnZXJUZXh0OiBzdHJpbmcsIHNlbGVjdGVkVGV4dDogc3RyaW5nLCBvcmlnaW5hbFBvczogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGNvbnN0IGxlbmd0aERpZmZlcmVuY2UgPSBzZWxlY3RlZFRleHQubGVuZ3RoIC0gdHJpZ2dlclRleHQubGVuZ3RoO1xyXG4gICAgcmV0dXJuIG9yaWdpbmFsUG9zICsgbGVuZ3RoRGlmZmVyZW5jZTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRmxvYXRpbmdTdWdnZXN0aW9uRHJvcGRvd24oc3VnZ2VzdGlvbnM6IGFueVtdLGVkaXRvclZpZXc6IEVkaXRvclZpZXcsIHBvc2l0aW9uOiBudW1iZXIpIHtcclxuXHJcbiAgICBjb25zdCBjb29yZGluYXRlcyA9IGVkaXRvclZpZXcuY29vcmRzQXRQb3MocG9zaXRpb24pO1xyXG4gICAgaWYgKCFjb29yZGluYXRlcykgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IHN1Z2dlc3Rpb25Ecm9wZG93biA9IGNyZWF0ZVN1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9ucyk7XHJcblxyXG4gICAgc3VnZ2VzdGlvbkRyb3Bkb3duLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xyXG4gICAgc3VnZ2VzdGlvbkRyb3Bkb3duLnN0eWxlLmxlZnQgPSBgJHtjb29yZGluYXRlcy5sZWZ0fXB4YDtcclxuICAgIHN1Z2dlc3Rpb25Ecm9wZG93bi5zdHlsZS50b3AgPSBgJHtjb29yZGluYXRlcy5ib3R0b219cHhgO1xyXG5cdHJldHVybiBzdWdnZXN0aW9uRHJvcGRvd247XHJcbn1cclxuXHJcbi8vIENyZWF0ZXMgYSBzdWdnZXN0aW9uIGRyb3Bkb3duIGNvbnRhaW5lciB3aXRoIHN1Z2dlc3Rpb24gaXRlbXNcclxuZnVuY3Rpb24gY3JlYXRlU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zOiBzdHJpbmdbXSkge1xyXG4gICAgY29uc3QgZHJvcGRvd25Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgZHJvcGRvd25Db250YWluZXIuY2xhc3NOYW1lID0gXCJzdWdnZXN0aW9uLWRyb3Bkb3duXCI7XHJcblxyXG4gICAgc3VnZ2VzdGlvbnMuZm9yRWFjaCgoc3VnZ2VzdGlvbikgPT4ge1xyXG4gICAgICAgIGNvbnN0IGl0ZW0gPSBjcmVhdGVTdWdnZXN0aW9uSXRlbShzdWdnZXN0aW9uKVxyXG5cdFx0aXRlbS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICAgICAgICBzZWxlY3RTdWdnZXN0aW9uKHN1Z2dlc3Rpb24pO1xyXG4gICAgICAgICAgICBkcm9wZG93bkNvbnRhaW5lci5yZW1vdmUoKTtcclxuICAgICAgICB9KTtcclxuXHRcdGRyb3Bkb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKGl0ZW0pXHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gZHJvcGRvd25Db250YWluZXI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNlbGVjdFN1Z2dlc3Rpb24oc3VnZ2VzdGlvbjogc3RyaW5nKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgU2VsZWN0ZWQ6ICR7c3VnZ2VzdGlvbn1gKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlU3VnZ2VzdGlvbkl0ZW0oZGlzcGxheVRleHQ6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcclxuXHQvLyBDcmVhdGUgdGhlIG91dGVyIHN1Z2dlc3Rpb24gaXRlbSBjb250YWluZXJcclxuXHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwic3VnZ2VzdGlvbi1pdGVtXCIpO1xyXG5cdGNvbnRhaW5lci5pbm5lclRleHQ9ZGlzcGxheVRleHRcclxuICBcdHJldHVybiBjb250YWluZXJcclxuXHQvLyBDcmVhdGUgdGhlIGljb24gY29udGFpbmVyXHJcblx0Y29uc3QgaWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblx0aWNvbi5jbGFzc0xpc3QuYWRkKFwiaWNvblwiKTtcclxuXHRpY29uLnRleHRDb250ZW50ID0gXCLGklwiOyAvLyBQbGFjZWhvbGRlciBpY29uIGNvbnRlbnRcclxuICBcclxuXHQvLyBDcmVhdGUgdGhlIGRldGFpbHMgY29udGFpbmVyXHJcblx0Y29uc3QgZGV0YWlscyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblx0ZGV0YWlscy5jbGFzc0xpc3QuYWRkKFwiZGV0YWlsc1wiKTtcclxuICBcclxuXHQvLyBBZGQgYSBuYW1lIHNwYW4gdG8gZGV0YWlsc1xyXG5cdGNvbnN0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuXHRuYW1lLmNsYXNzTGlzdC5hZGQoXCJuYW1lXCIpO1xyXG5cdG5hbWUudGV4dENvbnRlbnQgPSBcImZ1bmN0aW9uXCI7IC8vIFBsYWNlaG9sZGVyIG5hbWUgY29udGVudFxyXG4gIFxyXG5cdC8vIEFkZCBhIHR5cGUgc3BhbiB0byBkZXRhaWxzXHJcblx0Y29uc3QgdHlwZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG5cdHR5cGUuY2xhc3NMaXN0LmFkZChcInR5cGVcIik7XHJcblx0dHlwZS50ZXh0Q29udGVudCA9IFwiS2V5d29yZFwiOyAvLyBQbGFjZWhvbGRlciB0eXBlIGNvbnRlbnRcclxuICBcclxuXHQvLyBBcHBlbmQgbmFtZSBhbmQgdHlwZSB0byBkZXRhaWxzXHJcblx0ZGV0YWlscy5hcHBlbmRDaGlsZChuYW1lKTtcclxuXHRkZXRhaWxzLmFwcGVuZENoaWxkKHR5cGUpO1xyXG4gIFxyXG5cdC8vIEFwcGVuZCBpY29uIGFuZCBkZXRhaWxzIHRvIHRoZSBjb250YWluZXJcclxuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaWNvbik7XHJcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xyXG4gIFxyXG5cdHJldHVybiBjb250YWluZXI7XHJcbn1cclxuXHJcbiAgXHJcblxyXG4vKlxyXG5leHBvcnQgY2xhc3MgTnVtZXJhbHNTdWdnZXN0b3IgZXh0ZW5kcyBFZGl0b3JTdWdnZXN0PHN0cmluZz4ge1xyXG5cdHBsdWdpbjogTnVtZXJhbHNQbHVnaW47XHJcblx0XHJcblx0LyoqXHJcblx0ICogVGltZSBvZiBsYXN0IHN1Z2dlc3Rpb24gbGlzdCB1cGRhdGVcclxuXHQgKiBAdHlwZSB7bnVtYmVyfVxyXG5cdCAqIEBwcml2YXRlIFxyXG5cdHByaXZhdGUgbGFzdFN1Z2dlc3Rpb25MaXN0VXBkYXRlOiBudW1iZXIgPSAwO1xyXG5cclxuXHQvKipcclxuXHQgKiBMaXN0IG9mIHBvc3NpYmxlIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIGN1cnJlbnQgY29kZSBibG9ja1xyXG5cdCAqIEB0eXBlIHtzdHJpbmdbXX1cclxuXHQgKiBAcHJpdmF0ZSBcclxuXHRwcml2YXRlIGxvY2FsU3VnZ2VzdGlvbkNhY2hlOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuXHQvL2VtcHR5IGNvbnN0cnVjdG9yXHJcblx0Y29uc3RydWN0b3IocGx1Z2luOiBOdW1lcmFsc1BsdWdpbikge1xyXG5cdFx0c3VwZXIocGx1Z2luLmFwcCk7XHJcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuXHR9XHJcblxyXG5cdG9uVHJpZ2dlcihjdXJzb3I6IEVkaXRvclBvc2l0aW9uLCBlZGl0b3I6IEVkaXRvciwgZmlsZTogVEZpbGUpOiBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8gfCBudWxsIHtcclxuXHJcblx0XHRjb25zdCBjbUVkaXRvciA9IGVkaXRvciBhcyBhbnk7XHJcblx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xyXG5cdFx0aWYgKHZpZXcgPT09IG51bGwpIHJldHVybiBudWxsO1xyXG5cdFx0Y29uc3QgY29kZWJsb2NrTGVuZz1sYW5nSWZXaXRoaW5Db2RlYmxvY2sodmlldy5zdGF0ZSlcclxuXHRcdGNvbnN0IGlzTWF0aEJsb2NrPWNvZGVibG9ja0xlbmc/LmNvbnRhaW5zKCd0aWt6JylcclxuXHJcblx0XHRjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5yYW5nZXNbMF0uZnJvbTtcclxuXHRcdGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcclxuXHRcdC8vY29uc3QgZG9tTm9kZSA9IHZpZXcuZG9tQXRQb3MobGluZS5mcm9tKS5ub2RlO1xyXG5cdFx0aWYgKCFpc01hdGhCbG9jaykge1xyXG5cdFx0XHRyZXR1cm4gbnVsbDtcclxuXHRcdH1cclxuXHRcdFxyXG5cclxuXHRcdC8vIEdldCBsYXN0IHdvcmQgaW4gY3VycmVudCBsaW5lXHJcblx0XHRjb25zdCBjdXJyZW50TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpLnRleHQ7XHJcblx0XHRjb25zdCBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPSBjdXJyZW50TGluZS5zZWFyY2goL1s6XT9bJEBcXHdcXHUwMzcwLVxcdTAzRkZdKyQvKTtcclxuXHRcdC8vIGlmIHRoZXJlIGlzIG5vIHdvcmQsIHJldHVybiBudWxsXHJcblx0XHRpZiAoY3VycmVudExpbmVMYXN0V29yZFN0YXJ0ID09PSAtMSkge1xyXG5cdFx0XHRyZXR1cm4gbnVsbDtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRzdGFydDoge2xpbmU6IGN1cnNvci5saW5lLCBjaDogY3VycmVudExpbmVMYXN0V29yZFN0YXJ0fSxcclxuXHRcdFx0ZW5kOiBjdXJzb3IsXHJcblx0XHRcdHF1ZXJ5OiBjdXJyZW50TGluZS5zbGljZShjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQpXHJcblx0XHR9O1xyXG5cdH1cclxuXHJcblx0Z2V0U3VnZ2VzdGlvbnMoY29udGV4dDogRWRpdG9yU3VnZ2VzdENvbnRleHQpOiBzdHJpbmdbXSB8IFByb21pc2U8c3RyaW5nW10+IHtcclxuXHRcdGxldCBsb2NhbFN5bWJvbHM6IHN0cmluZyBbXSA9IFtdO1x0XHJcblxyXG5cdFx0bG9jYWxTeW1ib2xzID0gdGhpcy5sb2NhbFN1Z2dlc3Rpb25DYWNoZVxyXG5cdFx0Y29uc3QgcXVlcnkgPSBjb250ZXh0LnF1ZXJ5LnRvTG93ZXJDYXNlKCk7XHJcblxyXG5cdFx0Y29uc3QgbG9jYWxfc3VnZ2VzdGlvbnMgPSBsb2NhbFN5bWJvbHMuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMikpO1xyXG5cdFx0bG9jYWxfc3VnZ2VzdGlvbnMuc29ydCgoYSwgYikgPT4gYS5zbGljZSgyKS5sb2NhbGVDb21wYXJlKGIuc2xpY2UoMikpKTtcclxuXHRcdFxyXG5cdFx0Ly8gY2FzZS1pbnNlbnNpdGl2ZSBmaWx0ZXIgbWF0aGpzIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIHF1ZXJ5LiBEb24ndCByZXR1cm4gdmFsdWUgaWYgZnVsbCBtYXRjaFxyXG5cdFx0bGV0IHN1Z2dlc3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuXHRcdGNvbnN0IG1hdGhqc19zdWdnZXN0aW9ucyA9IGdldE1hdGhKc1N5bWJvbHMoKS5maWx0ZXIoKG9iajogTGF0ZXgpID0+IG9iai52YWx1ZS5zbGljZSgwLCAtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAyKSk7XHJcblxyXG5cdFx0c3VnZ2VzdGlvbnMgPSBtYXRoanNfc3VnZ2VzdGlvbnMubWFwKChvOkxhdGV4KT0+by52YWx1ZSkvL2xvY2FsX3N1Z2dlc3Rpb25zLmNvbmNhdChtYXRoanNfc3VnZ2VzdGlvbnMpO1xyXG5cclxuXHRcdC8qc3VnZ2VzdGlvbnMgPSBzdWdnZXN0aW9ucy5jb25jYXQoXHJcblx0XHRcdG51bWVyYWxzRGlyZWN0aXZlc1xyXG5cdFx0XHRcdC5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5zbGljZSgwLC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDApKVxyXG5cdFx0XHRcdC5tYXAoKHZhbHVlKSA9PiAnbXwnICsgdmFsdWUpXHJcblx0XHRcdCk7XHJcblxyXG5cdFx0cmV0dXJuIHN1Z2dlc3Rpb25zO1xyXG5cdH1cclxuXHJcblx0cmVuZGVyU3VnZ2VzdGlvbih2YWx1ZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuXHRcdGVsLnNldFRleHQodmFsdWUpLypcclxuXHRcdGVsLmFkZENsYXNzZXMoWydtb2QtY29tcGxleCcsICdudW1lcmFscy1zdWdnZXN0aW9uJ10pO1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkNvbnRlbnQgPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tY29udGVudCd9KTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25UaXRsZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi10aXRsZSd9KTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25Ob3RlID0gc3VnZ2VzdGlvbkNvbnRlbnQuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLW5vdGUnfSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uQXV4ID0gZWwuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWF1eCd9KTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25GbGFpciA9IHN1Z2dlc3Rpb25BdXguY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWZsYWlyJ30pOyovXHJcblxyXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby11bnVzZWQtdmFyc1xyXG5cdFx0LypcclxuXHRcdGNvbnN0IFtpY29uVHlwZSwgc3VnZ2VzdGlvblRleHQsIG5vdGVUZXh0XSA9IHZhbHVlLnNwbGl0KCd8Jyk7XHJcblxyXG5cdFx0aWYgKGljb25UeXBlID09PSAnZicpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdmdW5jdGlvbi1zcXVhcmUnKTtcdFx0XHJcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAnYycpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdsb2NhdGUtZml4ZWQnKTtcclxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICd2Jykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2ZpbGUtY29kZScpO1xyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ3AnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnYm94Jyk7XHJcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAnbScpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdzcGFya2xlcycpO1x0XHRcdFxyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ2cnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnY2FzZS1sb3dlcicpOyAvLyBBc3N1bWluZyAnc3ltYm9sJyBpcyBhIHZhbGlkIGljb24gbmFtZVxyXG5cdFx0fVxyXG5cdFx0c3VnZ2VzdGlvblRpdGxlLnNldFRleHQoc3VnZ2VzdGlvblRleHQpO1xyXG5cdFx0aWYgKG5vdGVUZXh0KSB7XHJcblx0XHRcdHN1Z2dlc3Rpb25Ob3RlLnNldFRleHQobm90ZVRleHQpO1xyXG5cdFx0fVxyXG5cdFx0Ly9zdWdnZXN0aW9uVGl0bGUuc2V0VGV4dCh2YWx1ZSk7XHJcblxyXG5cdH1cclxuXHJcblx0LyoqXHJcblx0ICogQ2FsbGVkIHdoZW4gYSBzdWdnZXN0aW9uIGlzIHNlbGVjdGVkLiBSZXBsYWNlcyB0aGUgY3VycmVudCB3b3JkIHdpdGggdGhlIHNlbGVjdGVkIHN1Z2dlc3Rpb25cclxuXHQgKiBAcGFyYW0gdmFsdWUgVGhlIHNlbGVjdGVkIHN1Z2dlc3Rpb25cclxuXHQgKiBAcGFyYW0gZXZ0IFRoZSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgc2VsZWN0aW9uXHJcblx0ICogQHJldHVybnMgdm9pZFxyXG5cdCBcclxuXHJcblx0c2VsZWN0U3VnZ2VzdGlvbih2YWx1ZTogc3RyaW5nLCBldnQ6IE1vdXNlRXZlbnQgfCBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcblx0XHRpZiAodGhpcy5jb250ZXh0KSB7XHJcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuY29udGV4dC5lZGl0b3I7XHJcblx0XHRcdFxyXG5cdFx0XHRjb25zdCBjbUVkaXRvciA9IGVkaXRvciBhcyBhbnk7XHJcblx0XHRcdGNvbnN0IHZpZXcgPSBjbUVkaXRvci5jbSA/IChjbUVkaXRvci5jbSBhcyBFZGl0b3JWaWV3KSA6IG51bGw7XHJcblx0XHRcdGlmICh2aWV3ID09PSBudWxsKSByZXR1cm47XHJcblx0XHJcblx0XHRcdGNvbnN0IGN1cnNvciA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW47XHJcblx0XHRcdGNvbnN0IGZyb20gPSBjdXJzb3IuZnJvbTtcclxuXHRcdFx0Y29uc3QgdG8gPSBjdXJzb3IudG87IFxyXG5cdFxyXG5cdFx0XHR2aWV3LmRpc3BhdGNoKHtcclxuXHRcdFx0XHRjaGFuZ2VzOiB7IGZyb20sIHRvLCBpbnNlcnQ6IHZhbHVlIH0sXHJcblx0XHRcdFx0c2VsZWN0aW9uOiB7IGFuY2hvcjogZnJvbSArIHZhbHVlLmxlbmd0aCB9XHJcblx0XHRcdH0pO1xyXG5cdFx0XHRcclxuXHRcdFx0dGhpcy5jbG9zZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG4qL1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXJhY3RlckF0UG9zKHZpZXdPclN0YXRlOiBFZGl0b3JWaWV3IHwgRWRpdG9yU3RhdGUsIHBvczogbnVtYmVyKSB7XHJcblx0Y29uc3Qgc3RhdGUgPSB2aWV3T3JTdGF0ZSBpbnN0YW5jZW9mIEVkaXRvclZpZXcgPyB2aWV3T3JTdGF0ZS5zdGF0ZSA6IHZpZXdPclN0YXRlO1xyXG5cdGNvbnN0IGRvYyA9IHN0YXRlLmRvYztcclxuXHRyZXR1cm4gZG9jLnNsaWNlKHBvcywgcG9zKzEpLnRvU3RyaW5nKCk7XHJcbn1cclxuXHJcblxyXG4gXHJcbmNvbnN0IGxhbmdJZldpdGhpbkNvZGVibG9jayA9IChzdGF0ZTogRWRpdG9yU3RhdGUpOiBzdHJpbmcgfCBudWxsID0+IHtcclxuXHRjb25zdCB0cmVlID0gc3ludGF4VHJlZShzdGF0ZSk7XHJcblxyXG5cdGNvbnN0IHBvcyA9IHN0YXRlLnNlbGVjdGlvbi5yYW5nZXNbMF0uZnJvbTtcclxuXHJcblx0LypcclxuXHQqIGdldCBhIHRyZWUgY3Vyc29yIGF0IHRoZSBwb3NpdGlvblxyXG5cdCpcclxuXHQqIEEgbmV3bGluZSBkb2VzIG5vdCBiZWxvbmcgdG8gYW55IHN5bnRheCBub2RlcyBleGNlcHQgZm9yIHRoZSBEb2N1bWVudCxcclxuXHQqIHdoaWNoIGNvcnJlc3BvbmRzIHRvIHRoZSB3aG9sZSBkb2N1bWVudC4gU28sIHdlIGNoYW5nZSB0aGUgYG1vZGVgIG9mIHRoZVxyXG5cdCogYGN1cnNvckF0YCBkZXBlbmRpbmcgb24gd2hldGhlciB0aGUgY2hhcmFjdGVyIGp1c3QgYmVmb3JlIHRoZSBjdXJzb3IgaXMgYVxyXG5cdCogbmV3bGluZS5cclxuXHQqL1xyXG5cdGNvbnN0IGN1cnNvciA9XHJcblx0XHRwb3MgPT09IDAgfHwgZ2V0Q2hhcmFjdGVyQXRQb3Moc3RhdGUsIHBvcyAtIDEpID09PSBcIlxcblwiXHJcblx0XHQ/IHRyZWUuY3Vyc29yQXQocG9zLCAxKVxyXG5cdFx0OiB0cmVlLmN1cnNvckF0KHBvcywgLTEpO1xyXG5cclxuXHQvLyBjaGVjayBpZiB3ZSdyZSBpbiBhIGNvZGVibG9jayBhdG0gYXQgYWxsXHJcblx0Y29uc3QgaW5Db2RlYmxvY2sgPSBjdXJzb3IubmFtZS5jb250YWlucyhcImNvZGVibG9ja1wiKTtcclxuXHRpZiAoIWluQ29kZWJsb2NrKSB7XHJcblx0XHRyZXR1cm4gbnVsbDtcclxuXHR9XHJcblxyXG5cdC8vIGxvY2F0ZSB0aGUgc3RhcnQgb2YgdGhlIGJsb2NrXHJcblx0Y29uc3QgY29kZWJsb2NrQmVnaW4gPSBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yLCBEaXJlY3Rpb24uQmFja3dhcmQsIFwiSHlwZXJNRC1jb2RlYmxvY2tfSHlwZXJNRC1jb2RlYmxvY2stYmVnaW5cIik7XHJcblxyXG5cdGlmIChjb2RlYmxvY2tCZWdpbiA9PSBudWxsKSB7XHJcblx0XHRjb25zb2xlLndhcm4oXCJ1bmFibGUgdG8gbG9jYXRlIHN0YXJ0IG9mIHRoZSBjb2RlYmxvY2sgZXZlbiB0aG91Z2ggaW5zaWRlIG9uZVwiKTtcclxuXHRcdHJldHVybiBcIlwiO1xyXG5cdH1cclxuXHJcblx0Ly8gZXh0cmFjdCB0aGUgbGFuZ3VhZ2VcclxuXHQvLyBjb2RlYmxvY2tzIG1heSBzdGFydCBhbmQgZW5kIHdpdGggYW4gYXJiaXRyYXJ5IG51bWJlciBvZiBiYWNrdGlja3NcclxuXHRjb25zdCBsYW5ndWFnZSA9IHN0YXRlLnNsaWNlRG9jKGNvZGVibG9ja0JlZ2luLmZyb20sIGNvZGVibG9ja0JlZ2luLnRvKS5yZXBsYWNlKC9gKy8sIFwiXCIpO1xyXG5cclxuXHRyZXR1cm4gbGFuZ3VhZ2U7XHJcbn1cclxuXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZXNjYWxhdGVUb1Rva2VuKGN1cnNvcjogVHJlZUN1cnNvciwgZGlyOiBEaXJlY3Rpb24sIHRhcmdldDogc3RyaW5nKTogU3ludGF4Tm9kZSB8IG51bGwge1xyXG5cdC8vIEFsbG93IHRoZSBzdGFydGluZyBub2RlIHRvIGJlIGEgbWF0Y2hcclxuXHRpZiAoY3Vyc29yLm5hbWUuY29udGFpbnModGFyZ2V0KSkge1xyXG5cdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xyXG5cdH1cclxuXHJcblx0d2hpbGUgKFxyXG5cdFx0KGN1cnNvci5uYW1lICE9IFwiRG9jdW1lbnRcIikgJiZcclxuXHRcdCgoZGlyID09IERpcmVjdGlvbi5CYWNrd2FyZCAmJiBjdXJzb3IucHJldigpKVxyXG5cdFx0fHwgKGRpciA9PSBEaXJlY3Rpb24uRm9yd2FyZCAmJiBjdXJzb3IubmV4dCgpKVxyXG5cdFx0fHwgY3Vyc29yLnBhcmVudCgpKVxyXG5cdCkge1xyXG5cdFx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcclxuXHRcdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBlbnVtIERpcmVjdGlvbiB7XHJcblx0QmFja3dhcmQsXHJcblx0Rm9yd2FyZCxcclxufSJdfQ==