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
        const allSuggestions = getTikzSuggestions().map(s => s.value);
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
        setCursor(view, pos); //calculatePositionAfterInsert(this.trigger.text,selectedText,pos))
        console.log(`Selected: ${selectedText}`);
    }
}
function calculatePositionAfterInsert(trigger, insertion, pos) {
    return pos + 1; //insertion.length-trigger.length
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3RlbXBDb2RlUnVubmVyRmlsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFXQSxPQUFPLEVBQUUsa0JBQWtCLEVBQVMsTUFBTSxhQUFhLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsR0FBdUMsTUFBTSxrQkFBa0IsQ0FBQztBQUNuRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDbEQsT0FBTyxFQUFlLElBQUksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBSXRELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUVyRCxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFFLE1BQU0sa0JBQWtCLEdBQUc7SUFDMUIsV0FBVztJQUNYLE1BQU07SUFDTixRQUFRO0NBQ1IsQ0FBQTtBQUNELE1BQU0sZ0JBQWdCO0lBQ3JCLElBQUksQ0FBUTtJQUNaLFlBQVksR0FBVyxFQUFFLElBQWdCO1FBQ3hDLElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUM3QyxDQUFDO0lBQ0QsVUFBVSxDQUFDLE9BQWU7SUFFMUIsQ0FBQztJQUNELGtCQUFrQixDQUFDLEdBQVcsRUFBRSxJQUFnQjtRQUMvQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnREFBZ0QsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDdkUsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQUcsR0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQy9DLE1BQU0sY0FBYyxHQUFH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RUFBRSxHQUFjLEVBQUUsTUFBYztJQUNqRix3Q0FBd0M7SUFDeEMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUNqQyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUM7S0FDbkI7SUFFRCxPQUNDLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxVQUFVLENBQUM7UUFDM0IsQ0FBQyxDQUFDLEdBQUcsSUFBSSxTQUFTLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztlQUMxQyxDQUFDLEdBQUcsSUFBSSxTQUFTLENBQUMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztlQUMzQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFDbEI7UUFDRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQztTQUNuQjtLQUNEO0lBRUQsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRUQsTUFBTSxDQUFOLElBQVksU0FHWDtBQUhELFdBQVksU0FBUztJQUNwQixpREFBUSxDQUFBO0lBQ1IsK0NBQU8sQ0FBQTtBQUNSLENBQUMsRUFIVyxTQUFTLEtBQVQsU0FBUyxRQUdwQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBOdW1lcmFsc1BsdWdpbiBmcm9tIFwiLi9tYWluXCI7XHJcbmltcG9ydCB7XHJcbiAgICBFZGl0b3JTdWdnZXN0LFxyXG4gICAgRWRpdG9yUG9zaXRpb24sXHJcbiAgICBFZGl0b3IsXHJcbiAgICBURmlsZSxcclxuICAgIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbyxcclxuICAgIEVkaXRvclN1Z2dlc3RDb250ZXh0LFxyXG4gICAgc2V0SWNvbixcclxuIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5pbXBvcnQgeyBnZXRUaWt6U3VnZ2VzdGlvbnMsIExhdGV4IH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdQbHVnaW4sIFZpZXdVcGRhdGUgLERlY29yYXRpb24sIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xyXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSwgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBTeW50YXhOb2RlLCBUcmVlQ3Vyc29yIH0gZnJvbSBcIkBsZXplci9jb21tb25cIjtcclxuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBjb250ZXh0IH0gZnJvbSBcImVzYnVpbGQtd2FzbVwiO1xyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9jb250ZXh0XCI7XHJcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSBcIi4vbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyByZXBsYWNlUmFuZ2UsIHNldEN1cnNvciB9IGZyb20gXCIuL2VkaXRvciB1dGlsaXRpZXMvZWRpdG9yX3V0aWxzXCI7XHJcblxyXG5cclxuY29uc3QgbnVtZXJhbHNEaXJlY3RpdmVzID0gW1xyXG5cdFwiQGhpZGVSb3dzXCIsXHJcblx0XCJAU3VtXCIsXHJcblx0XCJAVG90YWxcIixcclxuXVxyXG5jbGFzcyBTdWdnZXN0b3JUcmlnZ2Vye1xyXG5cdHRleHQ6IHN0cmluZ1xyXG5cdGNvbnN0cnVjdG9yKHBvczogbnVtYmVyLCB2aWV3OiBFZGl0b3JWaWV3KXtcclxuXHRcdHRoaXMudGV4dD10aGlzLmdldEN1cnJlbnRMaW5lVGV4dChwb3MsIHZpZXcpXHJcblx0fVxyXG5cdHNldFRyaWdnZXIodHJpZ2dlcjogc3RyaW5nKXtcclxuXHJcblx0fVxyXG5cdGdldEN1cnJlbnRMaW5lVGV4dChwb3M6IG51bWJlciwgdmlldzogRWRpdG9yVmlldyk6IHN0cmluZyB7XHJcblx0XHRjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XHJcblx0XHRjb25zb2xlLmxvZygnbGluZS50ZXh0LnNsaWNlKDAsIChwb3MrMikgLSBsaW5lLmZyb20pLnRyaW0oKScsbGluZS50ZXh0KVxyXG5cdFx0Y29uc3QgY3Vyc29yT2Zmc2V0SW5MaW5lID0gKHBvcysyKSAtIGxpbmUuZnJvbTtcclxuXHRcdGNvbnN0IHRleHRVcFRvQ3Vyc29yID0gbGluZS50ZXh0LnNsaWNlKDAsIGN1cnNvck9mZnNldEluTGluZSkudHJpbSgpO1xyXG5cdFxyXG5cdFx0Y29uc3Qgd29yZHMgPSB0ZXh0VXBUb0N1cnNvci5zcGxpdCgvXFxzKy8pO1xyXG5cdFx0cmV0dXJuIHdvcmRzW3dvcmRzLmxlbmd0aCAtIDFdIHx8IFwiXCI7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgU3VnZ2VzdG9yIHtcclxuXHRwcml2YXRlIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuXHRwcml2YXRlIHRyaWdnZXI6IFN1Z2dlc3RvclRyaWdnZXI7XHJcblx0cHJpdmF0ZSBzZWxlY3Rpb25JbmRleD86IG51bWJlcjtcclxuXHRwcml2YXRlIGNvbnRleHQ6IENvbnRleHQ7XHJcblx0cHJpdmF0ZSBsaXN0ZW5Gb3JUcmFuc2FjdGlvbjogYm9vbGVhbjtcclxuXHRjb25zdHJ1Y3RvcihwbHVnaW46IE1hdGhQbHVnaW4pe1xyXG5cdFx0dGhpcy5wbHVnaW49cGx1Z2luXHJcblx0XHR0aGlzLm1vbml0b3IoKTtcclxuXHR9XHJcblx0cHJpdmF0ZSBtb25pdG9yKCkge1xyXG5cdFx0dGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oW1xyXG5cdFx0XHRQcmVjLmhpZ2hlc3QoRWRpdG9yVmlldy5kb21FdmVudEhhbmRsZXJzKHtcclxuXHRcdFx0XHRcImtleWRvd25cIjogKGV2ZW50LCB2aWV3KSA9PiB0aGlzLm9uS2V5ZG93bihldmVudCwgdmlldyksXHJcblx0XHRcdH0pKSxcclxuXHRcdFx0RWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZigodXBkYXRlKSA9PiB7XHJcblx0XHRcdFx0aWYgKHRoaXMubGlzdGVuRm9yVHJhbnNhY3Rpb24gJiYgdXBkYXRlLmRvY0NoYW5nZWQpIHtcclxuXHRcdFx0XHRcdHRoaXMub25UcmFuc2FjdGlvbih1cGRhdGUudmlldyk7XHJcblx0XHRcdFx0XHR0aGlzLmxpc3RlbkZvclRyYW5zYWN0aW9uID0gZmFsc2U7IFxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSksXHJcblx0XHRdKTtcclxuXHR9XHJcblx0cHJpdmF0ZSBvbktleWRvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQsIHZpZXc6IEVkaXRvclZpZXcpIHtcclxuXHRcdHRoaXMuaGFuZGxlRHJvcGRvd25OYXZpZ2F0aW9uKGV2ZW50LHZpZXcpO1xyXG5cdFx0aWYodGhpcy5pc1ZhbHVlS2V5KGV2ZW50KSlcclxuXHRcdFx0dGhpcy5saXN0ZW5Gb3JUcmFuc2FjdGlvbiA9IHRydWU7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIG9uVHJhbnNhY3Rpb24odmlldzogRWRpdG9yVmlldykge1xyXG5cdFx0dGhpcy5jb250ZXh0ICA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblx0XHRpZiAodGhpcy5jb250ZXh0LmNvZGVibG9ja0xhbmd1YWdlID09PSBcInRpa3pcIikge1xyXG5cdFx0XHR0aGlzLmRlcGxveURyb3Bkb3duKHZpZXcpXHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGdldEFsbGRyb3Bkb3duSXRlbXMoKXtyZXR1cm4gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKX1cclxuXHRwcml2YXRlIGRyb3Bkb3duaWZBbnlEZXBsb3llZCgpe3JldHVybiBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCIuc3VnZ2VzdGlvbi1kcm9wZG93blwiKX1cclxuXHJcblx0cHJpdmF0ZSBoYW5kbGVEcm9wZG93bk5hdmlnYXRpb24oZXZlbnQ6IEtleWJvYXJkRXZlbnQsdmlldzpFZGl0b3JWaWV3KSB7XHJcblx0XHRjb25zdCBkcm9wZG93biA9IHRoaXMuZHJvcGRvd25pZkFueURlcGxveWVkKCk7XHJcblx0XHRpZiAoIWRyb3Bkb3duIHx8IHRoaXMuc2VsZWN0aW9uSW5kZXggPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xyXG5cdFxyXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEFsbGRyb3Bkb3duSXRlbXMoKTtcclxuXHJcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XHJcblx0XHRpZiAoZXZlbnQua2V5ID09PSBcIkFycm93RG93blwiKSB7XHJcblx0XHRcdHRoaXMuc2VsZWN0aW9uSW5kZXggPSAodGhpcy5zZWxlY3Rpb25JbmRleCArIDEpICUgaXRlbXMubGVuZ3RoO1xyXG5cdFx0XHR0aGlzLnVwZGF0ZVNlbGVjdGlvbihpdGVtcyk7XHJcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd1VwXCIpIHtcclxuXHRcdFx0dGhpcy5zZWxlY3Rpb25JbmRleCA9ICh0aGlzLnNlbGVjdGlvbkluZGV4IC0gMSArIGl0ZW1zLmxlbmd0aCkgJSBpdGVtcy5sZW5ndGg7XHJcblx0XHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uKGl0ZW1zKTtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcclxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gaXRlbXNbdGhpcy5zZWxlY3Rpb25JbmRleF07XHJcblx0XHRcdGlmIChzZWxlY3RlZEl0ZW0mJnRoaXMuY29udGV4dCkge1xyXG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcGRvd25JdGVtKHNlbGVjdGVkSXRlbSx2aWV3KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRkcm9wZG93bi5yZW1vdmUoKTtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XHJcblx0XHRcdGRyb3Bkb3duLnJlbW92ZSgpO1xyXG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBpc1ZhbHVlS2V5KGV2ZW50OiBLZXlib2FyZEV2ZW50KXtcclxuXHRcdHJldHVybiBldmVudC5jb2RlLmNvbnRhaW5zKCdLZXknKSYmIWV2ZW50LmN0cmxLZXlcclxuXHR9XHJcblxyXG5cdFxyXG5cclxuXHRwcml2YXRlIGdldFN1Z2dlc3Rpb25zKHZpZXc6IEVkaXRvclZpZXcpIHtcclxuXHRcdHRoaXMudHJpZ2dlcj1uZXcgU3VnZ2VzdG9yVHJpZ2dlcih0aGlzLmNvbnRleHQucG9zLCB2aWV3KVxyXG5cdFx0Y29uc3QgYWxsU3VnZ2VzdGlvbnMgPSBnZXRUaWt6U3VnZ2VzdGlvbnMoKS5tYXAocyA9PiBzLnZhbHVlKTtcclxuXHRcclxuXHRcdGNvbnN0IGZpbHRlcmVkU3VnZ2VzdGlvbnMgPSBhbGxTdWdnZXN0aW9ucy5maWx0ZXIoKHN1Z2dlc3Rpb24pID0+XHJcblx0XHRcdHN1Z2dlc3Rpb24udG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHRoaXMudHJpZ2dlci50ZXh0LnRvTG93ZXJDYXNlKCkpXHJcblx0XHQpO1xyXG5cdFxyXG5cdFx0Y29uc3Qgc29ydGVkU3VnZ2VzdGlvbnMgPSBmaWx0ZXJlZFN1Z2dlc3Rpb25zLnNvcnQoKGEsIGIpID0+IHtcclxuXHRcdFx0Y29uc3QgbG93ZXJMYXN0V29yZCA9IHRoaXMudHJpZ2dlci50ZXh0LnRvTG93ZXJDYXNlKCk7XHJcblx0XHRcdGNvbnN0IGFMb3dlciA9IGEudG9Mb3dlckNhc2UoKTtcclxuXHRcdFx0Y29uc3QgYkxvd2VyID0gYi50b0xvd2VyQ2FzZSgpO1xyXG5cdFxyXG5cclxuXHRcdFx0Y29uc3QgYUV4YWN0TWF0Y2ggPSBhTG93ZXIgPT09IGxvd2VyTGFzdFdvcmQgPyAtMSA6IDA7XHJcblx0XHRcdGNvbnN0IGJFeGFjdE1hdGNoID0gYkxvd2VyID09PSBsb3dlckxhc3RXb3JkID8gLTEgOiAwO1xyXG5cdFx0XHRpZiAoYUV4YWN0TWF0Y2ggIT09IGJFeGFjdE1hdGNoKSByZXR1cm4gYUV4YWN0TWF0Y2ggLSBiRXhhY3RNYXRjaDtcclxuXHRcclxuXHRcdFx0aWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7XHJcblx0XHJcblx0XHRcdHJldHVybiBhTG93ZXIubG9jYWxlQ29tcGFyZShiTG93ZXIpO1xyXG5cdFx0fSk7XHJcblx0XHRyZXR1cm4gc29ydGVkU3VnZ2VzdGlvbnM7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRlcGxveURyb3Bkb3duKHZpZXc6IEVkaXRvclZpZXcpe1xyXG5cdFx0Y29uc3QgZXhpc3RpbmdEcm9wZG93biA9IHRoaXMuZHJvcGRvd25pZkFueURlcGxveWVkKCk7XHJcblx0XHRpZiAoZXhpc3RpbmdEcm9wZG93bikgZXhpc3RpbmdEcm9wZG93bi5yZW1vdmUoKTtcclxuXHJcblx0XHRjb25zdCBzdWdnZXN0aW9ucz10aGlzLmdldFN1Z2dlc3Rpb25zKHZpZXcpXHJcblx0XHRpZihzdWdnZXN0aW9ucy5sZW5ndGg8MSlyZXR1cm47XHJcblxyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkRyb3Bkb3duID0gY3JlYXRlRmxvYXRpbmdTdWdnZXN0aW9uRHJvcGRvd24oc3VnZ2VzdGlvbnMsdmlldywgdGhpcy5jb250ZXh0LnBvcyk7XHJcblx0XHRpZiAoIXN1Z2dlc3Rpb25Ecm9wZG93bikgcmV0dXJuO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzdWdnZXN0aW9uRHJvcGRvd24pO1xyXG5cclxuXHRcdHRoaXMuc2VsZWN0aW9uSW5kZXg9MDtcclxuXHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uKHRoaXMuZ2V0QWxsZHJvcGRvd25JdGVtcygpKTtcclxuXHJcblx0XHRjb25zdCBoYW5kbGVPdXRzaWRlQ2xpY2sgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcclxuXHRcdFx0Y29uc3Qgc3VnZ2VzdGlvbkl0ZW1zID0gc3VnZ2VzdGlvbkRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpOyAvLyBBZGp1c3Qgc2VsZWN0b3IgYXMgbmVlZGVkXHJcblxyXG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgY2xpY2sgaXMgb24gYSBzdWdnZXN0aW9uIGl0ZW1cclxuXHRcdFx0Y29uc3QgY2xpY2tlZFN1Z2dlc3Rpb24gPSBBcnJheS5mcm9tKHN1Z2dlc3Rpb25JdGVtcykuZmluZCgoaXRlbSkgPT5cclxuXHRcdFx0XHRpdGVtLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxyXG5cdFx0XHQpO1xyXG5cdFx0XHJcblx0XHRcdGlmIChjbGlja2VkU3VnZ2VzdGlvbikge1xyXG5cdFx0XHRcdC8vIEhhbmRsZSBzZWxlY3Rpb24gb2YgdGhlIGNsaWNrZWQgc3VnZ2VzdGlvblxyXG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcGRvd25JdGVtKGNsaWNrZWRTdWdnZXN0aW9uLHZpZXcpO1xyXG5cdFx0XHRcdHN1Z2dlc3Rpb25Ecm9wZG93bi5yZW1vdmUoKTtcclxuXHRcdFx0XHRkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlT3V0c2lkZUNsaWNrKTtcclxuXHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdH1cclxuXHRcdFxyXG5cdFx0XHQvLyBJZiBjbGljayBpcyBvdXRzaWRlIHRoZSBkcm9wZG93biwgY2xvc2UgaXRcclxuXHRcdFx0aWYgKCFzdWdnZXN0aW9uRHJvcGRvd24uY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpKSB7XHJcblx0XHRcdFx0c3VnZ2VzdGlvbkRyb3Bkb3duLnJlbW92ZSgpO1xyXG5cdFx0XHRcdGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVPdXRzaWRlQ2xpY2spO1xyXG5cdFx0XHR9XHJcblx0XHR9O1xyXG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGhhbmRsZU91dHNpZGVDbGljayk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHVwZGF0ZVNlbGVjdGlvbihpdGVtczogTm9kZUxpc3RPZjxFbGVtZW50Pikge1xyXG5cdFx0aXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcclxuXHRcdFx0aWYgKGluZGV4ID09PSB0aGlzLnNlbGVjdGlvbkluZGV4KSB7XHJcblx0XHRcdFx0aXRlbS5jbGFzc0xpc3QuYWRkKFwic2VsZWN0ZWRcIik7XHJcblx0XHRcdFx0aXRlbS5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRpdGVtLmNsYXNzTGlzdC5yZW1vdmUoXCJzZWxlY3RlZFwiKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHNlbGVjdERyb3Bkb3duSXRlbShpdGVtOiBFbGVtZW50LHZpZXc6IEVkaXRvclZpZXcpIHtcclxuXHRcdGlmKCF0aGlzLmNvbnRleHQpcmV0dXJuIDtcclxuXHRcdGNvbnN0IHNlbGVjdGVkVGV4dCA9IGl0ZW0udGV4dENvbnRlbnQgfHwgXCJcIjtcclxuXHRcdGNvbnN0IHBvcz10aGlzLmNvbnRleHQucG9zO1xyXG5cdFx0cmVwbGFjZVJhbmdlKHZpZXcscG9zLXRoaXMudHJpZ2dlci50ZXh0Lmxlbmd0aCxwb3Msc2VsZWN0ZWRUZXh0KVxyXG5cdFx0c2V0Q3Vyc29yKHZpZXcscG9zKS8vY2FsY3VsYXRlUG9zaXRpb25BZnRlckluc2VydCh0aGlzLnRyaWdnZXIudGV4dCxzZWxlY3RlZFRleHQscG9zKSlcclxuXHRcdGNvbnNvbGUubG9nKGBTZWxlY3RlZDogJHtzZWxlY3RlZFRleHR9YCk7XHJcblx0fVxyXG59XHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZVBvc2l0aW9uQWZ0ZXJJbnNlcnQodHJpZ2dlcjogc3RyaW5nLGluc2VydGlvbjogc3RyaW5nLHBvczogbnVtYmVyKXtcclxuXHRyZXR1cm4gcG9zKzEvL2luc2VydGlvbi5sZW5ndGgtdHJpZ2dlci5sZW5ndGhcclxuXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUZsb2F0aW5nU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zOiBhbnlbXSxlZGl0b3JWaWV3OiBFZGl0b3JWaWV3LCBwb3NpdGlvbjogbnVtYmVyKSB7XHJcblxyXG4gICAgY29uc3QgY29vcmRpbmF0ZXMgPSBlZGl0b3JWaWV3LmNvb3Jkc0F0UG9zKHBvc2l0aW9uKTtcclxuICAgIGlmICghY29vcmRpbmF0ZXMpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBzdWdnZXN0aW9uRHJvcGRvd24gPSBjcmVhdGVTdWdnZXN0aW9uRHJvcGRvd24oc3VnZ2VzdGlvbnMpO1xyXG5cclxuICAgIHN1Z2dlc3Rpb25Ecm9wZG93bi5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIjtcclxuICAgIHN1Z2dlc3Rpb25Ecm9wZG93bi5zdHlsZS5sZWZ0ID0gYCR7Y29vcmRpbmF0ZXMubGVmdH1weGA7XHJcbiAgICBzdWdnZXN0aW9uRHJvcGRvd24uc3R5bGUudG9wID0gYCR7Y29vcmRpbmF0ZXMuYm90dG9tfXB4YDtcclxuXHRyZXR1cm4gc3VnZ2VzdGlvbkRyb3Bkb3duO1xyXG59XHJcblxyXG4vLyBDcmVhdGVzIGEgc3VnZ2VzdGlvbiBkcm9wZG93biBjb250YWluZXIgd2l0aCBzdWdnZXN0aW9uIGl0ZW1zXHJcbmZ1bmN0aW9uIGNyZWF0ZVN1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9uczogc3RyaW5nW10pIHtcclxuICAgIGNvbnN0IGRyb3Bkb3duQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGRyb3Bkb3duQ29udGFpbmVyLmNsYXNzTmFtZSA9IFwic3VnZ2VzdGlvbi1kcm9wZG93blwiO1xyXG5cclxuICAgIHN1Z2dlc3Rpb25zLmZvckVhY2goKHN1Z2dlc3Rpb24pID0+IHtcclxuICAgICAgICBjb25zdCBpdGVtID0gY3JlYXRlU3VnZ2VzdGlvbkl0ZW0oc3VnZ2VzdGlvbilcclxuXHRcdGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgICAgICAgc2VsZWN0U3VnZ2VzdGlvbihzdWdnZXN0aW9uKTtcclxuICAgICAgICAgICAgZHJvcGRvd25Db250YWluZXIucmVtb3ZlKCk7XHJcbiAgICAgICAgfSk7XHJcblx0XHRkcm9wZG93bkNvbnRhaW5lci5hcHBlbmRDaGlsZChpdGVtKVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIGRyb3Bkb3duQ29udGFpbmVyO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZWxlY3RTdWdnZXN0aW9uKHN1Z2dlc3Rpb246IHN0cmluZykge1xyXG4gICAgY29uc29sZS5sb2coYFNlbGVjdGVkOiAke3N1Z2dlc3Rpb259YCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVN1Z2dlc3Rpb25JdGVtKGRpc3BsYXlUZXh0OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XHJcblx0Ly8gQ3JlYXRlIHRoZSBvdXRlciBzdWdnZXN0aW9uIGl0ZW0gY29udGFpbmVyXHJcblx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuXHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChcInN1Z2dlc3Rpb24taXRlbVwiKTtcclxuXHRjb250YWluZXIuaW5uZXJUZXh0PWRpc3BsYXlUZXh0XHJcbiAgXHRyZXR1cm4gY29udGFpbmVyXHJcblx0Ly8gQ3JlYXRlIHRoZSBpY29uIGNvbnRhaW5lclxyXG5cdGNvbnN0IGljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdGljb24uY2xhc3NMaXN0LmFkZChcImljb25cIik7XHJcblx0aWNvbi50ZXh0Q29udGVudCA9IFwixpJcIjsgLy8gUGxhY2Vob2xkZXIgaWNvbiBjb250ZW50XHJcbiAgXHJcblx0Ly8gQ3JlYXRlIHRoZSBkZXRhaWxzIGNvbnRhaW5lclxyXG5cdGNvbnN0IGRldGFpbHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdGRldGFpbHMuY2xhc3NMaXN0LmFkZChcImRldGFpbHNcIik7XHJcbiAgXHJcblx0Ly8gQWRkIGEgbmFtZSBzcGFuIHRvIGRldGFpbHNcclxuXHRjb25zdCBuYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcblx0bmFtZS5jbGFzc0xpc3QuYWRkKFwibmFtZVwiKTtcclxuXHRuYW1lLnRleHRDb250ZW50ID0gXCJmdW5jdGlvblwiOyAvLyBQbGFjZWhvbGRlciBuYW1lIGNvbnRlbnRcclxuICBcclxuXHQvLyBBZGQgYSB0eXBlIHNwYW4gdG8gZGV0YWlsc1xyXG5cdGNvbnN0IHR5cGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuXHR0eXBlLmNsYXNzTGlzdC5hZGQoXCJ0eXBlXCIpO1xyXG5cdHR5cGUudGV4dENvbnRlbnQgPSBcIktleXdvcmRcIjsgLy8gUGxhY2Vob2xkZXIgdHlwZSBjb250ZW50XHJcbiAgXHJcblx0Ly8gQXBwZW5kIG5hbWUgYW5kIHR5cGUgdG8gZGV0YWlsc1xyXG5cdGRldGFpbHMuYXBwZW5kQ2hpbGQobmFtZSk7XHJcblx0ZGV0YWlscy5hcHBlbmRDaGlsZCh0eXBlKTtcclxuICBcclxuXHQvLyBBcHBlbmQgaWNvbiBhbmQgZGV0YWlscyB0byB0aGUgY29udGFpbmVyXHJcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xyXG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChkZXRhaWxzKTtcclxuICBcclxuXHRyZXR1cm4gY29udGFpbmVyO1xyXG59XHJcblxyXG4gIFxyXG5cclxuLypcclxuZXhwb3J0IGNsYXNzIE51bWVyYWxzU3VnZ2VzdG9yIGV4dGVuZHMgRWRpdG9yU3VnZ2VzdDxzdHJpbmc+IHtcclxuXHRwbHVnaW46IE51bWVyYWxzUGx1Z2luO1xyXG5cdFxyXG5cdC8qKlxyXG5cdCAqIFRpbWUgb2YgbGFzdCBzdWdnZXN0aW9uIGxpc3QgdXBkYXRlXHJcblx0ICogQHR5cGUge251bWJlcn1cclxuXHQgKiBAcHJpdmF0ZSBcclxuXHRwcml2YXRlIGxhc3RTdWdnZXN0aW9uTGlzdFVwZGF0ZTogbnVtYmVyID0gMDtcclxuXHJcblx0LyoqXHJcblx0ICogTGlzdCBvZiBwb3NzaWJsZSBzdWdnZXN0aW9ucyBiYXNlZCBvbiBjdXJyZW50IGNvZGUgYmxvY2tcclxuXHQgKiBAdHlwZSB7c3RyaW5nW119XHJcblx0ICogQHByaXZhdGUgXHJcblx0cHJpdmF0ZSBsb2NhbFN1Z2dlc3Rpb25DYWNoZTogc3RyaW5nW10gPSBbXTtcclxuXHJcblx0Ly9lbXB0eSBjb25zdHJ1Y3RvclxyXG5cdGNvbnN0cnVjdG9yKHBsdWdpbjogTnVtZXJhbHNQbHVnaW4pIHtcclxuXHRcdHN1cGVyKHBsdWdpbi5hcHApO1xyXG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcblx0fVxyXG5cclxuXHRvblRyaWdnZXIoY3Vyc29yOiBFZGl0b3JQb3NpdGlvbiwgZWRpdG9yOiBFZGl0b3IsIGZpbGU6IFRGaWxlKTogRWRpdG9yU3VnZ2VzdFRyaWdnZXJJbmZvIHwgbnVsbCB7XHJcblxyXG5cdFx0Y29uc3QgY21FZGl0b3IgPSBlZGl0b3IgYXMgYW55O1xyXG5cdFx0Y29uc3QgdmlldyA9IGNtRWRpdG9yLmNtID8gKGNtRWRpdG9yLmNtIGFzIEVkaXRvclZpZXcpIDogbnVsbDtcclxuXHRcdGlmICh2aWV3ID09PSBudWxsKSByZXR1cm4gbnVsbDtcclxuXHRcdGNvbnN0IGNvZGVibG9ja0xlbmc9bGFuZ0lmV2l0aGluQ29kZWJsb2NrKHZpZXcuc3RhdGUpXHJcblx0XHRjb25zdCBpc01hdGhCbG9jaz1jb2RlYmxvY2tMZW5nPy5jb250YWlucygndGlreicpXHJcblxyXG5cdFx0Y29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XHJcblx0XHRjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XHJcblx0XHQvL2NvbnN0IGRvbU5vZGUgPSB2aWV3LmRvbUF0UG9zKGxpbmUuZnJvbSkubm9kZTtcclxuXHRcdGlmICghaXNNYXRoQmxvY2spIHtcclxuXHRcdFx0cmV0dXJuIG51bGw7XHJcblx0XHR9XHJcblx0XHRcclxuXHJcblx0XHQvLyBHZXQgbGFzdCB3b3JkIGluIGN1cnJlbnQgbGluZVxyXG5cdFx0Y29uc3QgY3VycmVudExpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKS50ZXh0O1xyXG5cdFx0Y29uc3QgY3VycmVudExpbmVMYXN0V29yZFN0YXJ0ID0gY3VycmVudExpbmUuc2VhcmNoKC9bOl0/WyRAXFx3XFx1MDM3MC1cXHUwM0ZGXSskLyk7XHJcblx0XHQvLyBpZiB0aGVyZSBpcyBubyB3b3JkLCByZXR1cm4gbnVsbFxyXG5cdFx0aWYgKGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydCA9PT0gLTEpIHtcclxuXHRcdFx0cmV0dXJuIG51bGw7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0c3RhcnQ6IHtsaW5lOiBjdXJzb3IubGluZSwgY2g6IGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydH0sXHJcblx0XHRcdGVuZDogY3Vyc29yLFxyXG5cdFx0XHRxdWVyeTogY3VycmVudExpbmUuc2xpY2UoY3VycmVudExpbmVMYXN0V29yZFN0YXJ0KVxyXG5cdFx0fTtcclxuXHR9XHJcblxyXG5cdGdldFN1Z2dlc3Rpb25zKGNvbnRleHQ6IEVkaXRvclN1Z2dlc3RDb250ZXh0KTogc3RyaW5nW10gfCBQcm9taXNlPHN0cmluZ1tdPiB7XHJcblx0XHRsZXQgbG9jYWxTeW1ib2xzOiBzdHJpbmcgW10gPSBbXTtcdFxyXG5cclxuXHRcdGxvY2FsU3ltYm9scyA9IHRoaXMubG9jYWxTdWdnZXN0aW9uQ2FjaGVcclxuXHRcdGNvbnN0IHF1ZXJ5ID0gY29udGV4dC5xdWVyeS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuXHRcdGNvbnN0IGxvY2FsX3N1Z2dlc3Rpb25zID0gbG9jYWxTeW1ib2xzLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDIpKTtcclxuXHRcdGxvY2FsX3N1Z2dlc3Rpb25zLnNvcnQoKGEsIGIpID0+IGEuc2xpY2UoMikubG9jYWxlQ29tcGFyZShiLnNsaWNlKDIpKSk7XHJcblx0XHRcclxuXHRcdC8vIGNhc2UtaW5zZW5zaXRpdmUgZmlsdGVyIG1hdGhqcyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBxdWVyeS4gRG9uJ3QgcmV0dXJuIHZhbHVlIGlmIGZ1bGwgbWF0Y2hcclxuXHRcdGxldCBzdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcclxuXHJcblx0XHRjb25zdCBtYXRoanNfc3VnZ2VzdGlvbnMgPSBnZXRNYXRoSnNTeW1ib2xzKCkuZmlsdGVyKChvYmo6IExhdGV4KSA9PiBvYmoudmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMikpO1xyXG5cclxuXHRcdHN1Z2dlc3Rpb25zID0gbWF0aGpzX3N1Z2dlc3Rpb25zLm1hcCgobzpMYXRleCk9Pm8udmFsdWUpLy9sb2NhbF9zdWdnZXN0aW9ucy5jb25jYXQobWF0aGpzX3N1Z2dlc3Rpb25zKTtcclxuXHJcblx0XHQvKnN1Z2dlc3Rpb25zID0gc3VnZ2VzdGlvbnMuY29uY2F0KFxyXG5cdFx0XHRudW1lcmFsc0RpcmVjdGl2ZXNcclxuXHRcdFx0XHQuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAwKSlcclxuXHRcdFx0XHQubWFwKCh2YWx1ZSkgPT4gJ218JyArIHZhbHVlKVxyXG5cdFx0XHQpO1xyXG5cclxuXHRcdHJldHVybiBzdWdnZXN0aW9ucztcclxuXHR9XHJcblxyXG5cdHJlbmRlclN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcblx0XHRlbC5zZXRUZXh0KHZhbHVlKS8qXHJcblx0XHRlbC5hZGRDbGFzc2VzKFsnbW9kLWNvbXBsZXgnLCAnbnVtZXJhbHMtc3VnZ2VzdGlvbiddKTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25Db250ZW50ID0gZWwuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWNvbnRlbnQnfSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uVGl0bGUgPSBzdWdnZXN0aW9uQ29udGVudC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tdGl0bGUnfSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uTm90ZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1ub3RlJ30pO1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkF1eCA9IGVsLmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1hdXgnfSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uRmxhaXIgPSBzdWdnZXN0aW9uQXV4LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1mbGFpcid9KTsqL1xyXG5cclxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnNcclxuXHRcdC8qXHJcblx0XHRjb25zdCBbaWNvblR5cGUsIHN1Z2dlc3Rpb25UZXh0LCBub3RlVGV4dF0gPSB2YWx1ZS5zcGxpdCgnfCcpO1xyXG5cclxuXHRcdGlmIChpY29uVHlwZSA9PT0gJ2YnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZnVuY3Rpb24tc3F1YXJlJyk7XHRcdFxyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ2MnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnbG9jYXRlLWZpeGVkJyk7XHJcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAndicpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdmaWxlLWNvZGUnKTtcclxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdwJykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2JveCcpO1xyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ20nKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnc3BhcmtsZXMnKTtcdFx0XHRcclxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdnJykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2Nhc2UtbG93ZXInKTsgLy8gQXNzdW1pbmcgJ3N5bWJvbCcgaXMgYSB2YWxpZCBpY29uIG5hbWVcclxuXHRcdH1cclxuXHRcdHN1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHN1Z2dlc3Rpb25UZXh0KTtcclxuXHRcdGlmIChub3RlVGV4dCkge1xyXG5cdFx0XHRzdWdnZXN0aW9uTm90ZS5zZXRUZXh0KG5vdGVUZXh0KTtcclxuXHRcdH1cclxuXHRcdC8vc3VnZ2VzdGlvblRpdGxlLnNldFRleHQodmFsdWUpO1xyXG5cclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIENhbGxlZCB3aGVuIGEgc3VnZ2VzdGlvbiBpcyBzZWxlY3RlZC4gUmVwbGFjZXMgdGhlIGN1cnJlbnQgd29yZCB3aXRoIHRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXHJcblx0ICogQHBhcmFtIHZhbHVlIFRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXHJcblx0ICogQHBhcmFtIGV2dCBUaGUgZXZlbnQgdGhhdCB0cmlnZ2VyZWQgdGhlIHNlbGVjdGlvblxyXG5cdCAqIEByZXR1cm5zIHZvaWRcclxuXHQgXHJcblxyXG5cdHNlbGVjdFN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZXZ0OiBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG5cdFx0aWYgKHRoaXMuY29udGV4dCkge1xyXG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmNvbnRleHQuZWRpdG9yO1xyXG5cdFx0XHRcclxuXHRcdFx0Y29uc3QgY21FZGl0b3IgPSBlZGl0b3IgYXMgYW55O1xyXG5cdFx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xyXG5cdFx0XHRpZiAodmlldyA9PT0gbnVsbCkgcmV0dXJuO1xyXG5cdFxyXG5cdFx0XHRjb25zdCBjdXJzb3IgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluO1xyXG5cdFx0XHRjb25zdCBmcm9tID0gY3Vyc29yLmZyb207XHJcblx0XHRcdGNvbnN0IHRvID0gY3Vyc29yLnRvOyBcclxuXHRcclxuXHRcdFx0dmlldy5kaXNwYXRjaCh7XHJcblx0XHRcdFx0Y2hhbmdlczogeyBmcm9tLCB0bywgaW5zZXJ0OiB2YWx1ZSB9LFxyXG5cdFx0XHRcdHNlbGVjdGlvbjogeyBhbmNob3I6IGZyb20gKyB2YWx1ZS5sZW5ndGggfVxyXG5cdFx0XHR9KTtcclxuXHRcdFx0XHJcblx0XHRcdHRoaXMuY2xvc2UoKTtcclxuXHRcdH1cclxuXHR9XHJcbn1cclxuKi9cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGFyYWN0ZXJBdFBvcyh2aWV3T3JTdGF0ZTogRWRpdG9yVmlldyB8IEVkaXRvclN0YXRlLCBwb3M6IG51bWJlcikge1xyXG5cdGNvbnN0IHN0YXRlID0gdmlld09yU3RhdGUgaW5zdGFuY2VvZiBFZGl0b3JWaWV3ID8gdmlld09yU3RhdGUuc3RhdGUgOiB2aWV3T3JTdGF0ZTtcclxuXHRjb25zdCBkb2MgPSBzdGF0ZS5kb2M7XHJcblx0cmV0dXJuIGRvYy5zbGljZShwb3MsIHBvcysxKS50b1N0cmluZygpO1xyXG59XHJcblxyXG5cclxuIFxyXG5jb25zdCBsYW5nSWZXaXRoaW5Db2RlYmxvY2sgPSAoc3RhdGU6IEVkaXRvclN0YXRlKTogc3RyaW5nIHwgbnVsbCA9PiB7XHJcblx0Y29uc3QgdHJlZSA9IHN5bnRheFRyZWUoc3RhdGUpO1xyXG5cclxuXHRjb25zdCBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XHJcblxyXG5cdC8qXHJcblx0KiBnZXQgYSB0cmVlIGN1cnNvciBhdCB0aGUgcG9zaXRpb25cclxuXHQqXHJcblx0KiBBIG5ld2xpbmUgZG9lcyBub3QgYmVsb25nIHRvIGFueSBzeW50YXggbm9kZXMgZXhjZXB0IGZvciB0aGUgRG9jdW1lbnQsXHJcblx0KiB3aGljaCBjb3JyZXNwb25kcyB0byB0aGUgd2hvbGUgZG9jdW1lbnQuIFNvLCB3ZSBjaGFuZ2UgdGhlIGBtb2RlYCBvZiB0aGVcclxuXHQqIGBjdXJzb3JBdGAgZGVwZW5kaW5nIG9uIHdoZXRoZXIgdGhlIGNoYXJhY3RlciBqdXN0IGJlZm9yZSB0aGUgY3Vyc29yIGlzIGFcclxuXHQqIG5ld2xpbmUuXHJcblx0Ki9cclxuXHRjb25zdCBjdXJzb3IgPVxyXG5cdFx0cG9zID09PSAwIHx8IGdldENoYXJhY3RlckF0UG9zKHN0YXRlLCBwb3MgLSAxKSA9PT0gXCJcXG5cIlxyXG5cdFx0PyB0cmVlLmN1cnNvckF0KHBvcywgMSlcclxuXHRcdDogdHJlZS5jdXJzb3JBdChwb3MsIC0xKTtcclxuXHJcblx0Ly8gY2hlY2sgaWYgd2UncmUgaW4gYSBjb2RlYmxvY2sgYXRtIGF0IGFsbFxyXG5cdGNvbnN0IGluQ29kZWJsb2NrID0gY3Vyc29yLm5hbWUuY29udGFpbnMoXCJjb2RlYmxvY2tcIik7XHJcblx0aWYgKCFpbkNvZGVibG9jaykge1xyXG5cdFx0cmV0dXJuIG51bGw7XHJcblx0fVxyXG5cclxuXHQvLyBsb2NhdGUgdGhlIHN0YXJ0IG9mIHRoZSBibG9ja1xyXG5cdGNvbnN0IGNvZGVibG9ja0JlZ2luID0gZXNjYWxhdGVUb1Rva2VuKGN1cnNvciwgRGlyZWN0aW9uLkJhY2t3YXJkLCBcIkh5cGVyTUQtY29kZWJsb2NrX0h5cGVyTUQtY29kZWJsb2NrLWJlZ2luXCIpO1xyXG5cclxuXHRpZiAoY29kZWJsb2NrQmVnaW4gPT0gbnVsbCkge1xyXG5cdFx0Y29uc29sZS53YXJuKFwidW5hYmxlIHRvIGxvY2F0ZSBzdGFydCBvZiB0aGUgY29kZWJsb2NrIGV2ZW4gdGhvdWdoIGluc2lkZSBvbmVcIik7XHJcblx0XHRyZXR1cm4gXCJcIjtcclxuXHR9XHJcblxyXG5cdC8vIGV4dHJhY3QgdGhlIGxhbmd1YWdlXHJcblx0Ly8gY29kZWJsb2NrcyBtYXkgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYmFja3RpY2tzXHJcblx0Y29uc3QgbGFuZ3VhZ2UgPSBzdGF0ZS5zbGljZURvYyhjb2RlYmxvY2tCZWdpbi5mcm9tLCBjb2RlYmxvY2tCZWdpbi50bykucmVwbGFjZSgvYCsvLCBcIlwiKTtcclxuXHJcblx0cmV0dXJuIGxhbmd1YWdlO1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FsYXRlVG9Ub2tlbihjdXJzb3I6IFRyZWVDdXJzb3IsIGRpcjogRGlyZWN0aW9uLCB0YXJnZXQ6IHN0cmluZyk6IFN5bnRheE5vZGUgfCBudWxsIHtcclxuXHQvLyBBbGxvdyB0aGUgc3RhcnRpbmcgbm9kZSB0byBiZSBhIG1hdGNoXHJcblx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcclxuXHRcdHJldHVybiBjdXJzb3Iubm9kZTtcclxuXHR9XHJcblxyXG5cdHdoaWxlIChcclxuXHRcdChjdXJzb3IubmFtZSAhPSBcIkRvY3VtZW50XCIpICYmXHJcblx0XHQoKGRpciA9PSBEaXJlY3Rpb24uQmFja3dhcmQgJiYgY3Vyc29yLnByZXYoKSlcclxuXHRcdHx8IChkaXIgPT0gRGlyZWN0aW9uLkZvcndhcmQgJiYgY3Vyc29yLm5leHQoKSlcclxuXHRcdHx8IGN1cnNvci5wYXJlbnQoKSlcclxuXHQpIHtcclxuXHRcdGlmIChjdXJzb3IubmFtZS5jb250YWlucyh0YXJnZXQpKSB7XHJcblx0XHRcdHJldHVybiBjdXJzb3Iubm9kZTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZW51bSBEaXJlY3Rpb24ge1xyXG5cdEJhY2t3YXJkLFxyXG5cdEZvcndhcmQsXHJcbn0iXX0=