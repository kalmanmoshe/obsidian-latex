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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3RlbXBDb2RlUnVubmVyRmlsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsa0JBQWtCLEdBQUksTUFBTSxhQUFhLENBQUM7QUFDbkQsT0FBTyxFQUFFLFVBQVUsR0FBRyxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUtsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFFLE1BQU0sZ0JBQWdCO0lBQ3JCLElBQUksQ0FBUTtJQUNaLFlBQVksR0FBVyxFQUFFLElBQWdCO1FBQ3hDLElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUM3QyxDQUFDO0lBQ0QsVUFBVSxDQUFDLE9BQWU7SUFFMUIsQ0FBQztJQUNELGtCQUFrQixDQUFDLEdBQVcsRUFBRSxJQUFnQjtRQUMvQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQUcsR0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQy9DLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXJFLE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDdEMsQ0FBQztDQUNEO0FB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QUMsRUFIVyxTQUFTLEtBQVQsU0FBUyxRQUdwQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdldFRpa3pTdWdnZXN0aW9ucywgIH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xyXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZX0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XHJcbmltcG9ydCB7IFN5bnRheE5vZGUsIFRyZWVDdXJzb3IgfSBmcm9tIFwiQGxlemVyL2NvbW1vblwiO1xyXG5pbXBvcnQgTW9zaGUgZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vdXRpbHMvY29udGV4dFwiO1xyXG5pbXBvcnQgeyByZXBsYWNlUmFuZ2UsIHNldEN1cnNvciB9IGZyb20gXCIuL2VkaXRvciB1dGlsaXRpZXMvZWRpdG9yX3V0aWxzXCI7XHJcblxyXG5cclxuY2xhc3MgU3VnZ2VzdG9yVHJpZ2dlcntcclxuXHR0ZXh0OiBzdHJpbmdcclxuXHRjb25zdHJ1Y3Rvcihwb3M6IG51bWJlciwgdmlldzogRWRpdG9yVmlldyl7XHJcblx0XHR0aGlzLnRleHQ9dGhpcy5nZXRDdXJyZW50TGluZVRleHQocG9zLCB2aWV3KVxyXG5cdH1cclxuXHRzZXRUcmlnZ2VyKHRyaWdnZXI6IHN0cmluZyl7XHJcblxyXG5cdH1cclxuXHRnZXRDdXJyZW50TGluZVRleHQocG9zOiBudW1iZXIsIHZpZXc6IEVkaXRvclZpZXcpOiBzdHJpbmcge1xyXG5cdFx0Y29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xyXG5cdFx0Y29uc3QgY3Vyc29yT2Zmc2V0SW5MaW5lID0gKHBvcysyKSAtIGxpbmUuZnJvbTtcclxuXHRcdGNvbnN0IHRleHRVcFRvQ3Vyc29yID0gbGluZS50ZXh0LnNsaWNlKDAsIGN1cnNvck9mZnNldEluTGluZSkudHJpbSgpO1xyXG5cdFxyXG5cdFx0Y29uc3Qgd29yZHMgPSB0ZXh0VXBUb0N1cnNvci5zcGxpdCgvXFxzKy8pO1xyXG5cdFx0cmV0dXJuIHdvcmRzW3dvcmRzLmxlbmd0aCAtIDFdIHx8IFwiXCI7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgU3VnZ2VzdG9yIHtcclxuXHRwcml2YXRlIHRyaWdnZXI6IFN1Z2dlc3RvclRyaWdnZXI7XHJcblx0c2VsZWN0aW9uSW5kZXg6IG51bWJlcjtcclxuXHRwcml2YXRlIGNvbnRleHQ6IENvbnRleHQ7XHJcblx0aXNTdWdnZXN0ZXJEZXBsb3llZDogYm9vbGVhbj1mYWxzZTtcclxuXHJcblx0ZGVwbG95U3VnZ2VzdG9yKGNvbnRleHQ6IENvbnRleHQsdmlldzogRWRpdG9yVmlldyl7XHJcblx0XHR0aGlzLnJlbW92ZVN1Z2dlc3RvcigpXHJcblx0XHR0aGlzLmNvbnRleHQ9Y29udGV4dDtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zPXRoaXMuZ2V0U3VnZ2VzdGlvbnModmlldylcclxuXHRcdGlmKHN1Z2dlc3Rpb25zLmxlbmd0aDwxKXJldHVybjtcclxuXHJcblx0XHRjb25zdCBzdWdnZXN0aW9uRHJvcGRvd24gPSBjcmVhdGVGbG9hdGluZ1N1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9ucyx2aWV3LCB0aGlzLmNvbnRleHQucG9zKTtcclxuXHRcdGlmICghc3VnZ2VzdGlvbkRyb3Bkb3duKSByZXR1cm47XHJcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHN1Z2dlc3Rpb25Ecm9wZG93bik7XHJcblx0XHR0aGlzLmlzU3VnZ2VzdGVyRGVwbG95ZWQ9dHJ1ZTtcclxuXHRcdHRoaXMuc2VsZWN0aW9uSW5kZXg9MDtcclxuXHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uKHRoaXMuZ2V0QWxsZHJvcGRvd25JdGVtcygpKTtcclxuXHJcblx0fVxyXG5cdHVwZGF0ZVN1Z2dlc3RvclBvc2l0aW9uKCl7XHJcblxyXG5cdH1cclxuXHJcblx0cmVtb3ZlU3VnZ2VzdG9yKCkge1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKS5mb3JFYWNoKG5vZGUgPT4gbm9kZS5yZW1vdmUoKSk7XHJcblx0XHRkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCIuc3VnZ2VzdGlvbi1kcm9wZG93blwiKT8ucmVtb3ZlKClcclxuXHRcdHRoaXMuaXNTdWdnZXN0ZXJEZXBsb3llZD1mYWxzZTtcclxuXHR9XHJcblxyXG5cdGdldEFsbGRyb3Bkb3duSXRlbXMoKXtyZXR1cm4gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKX1cclxuXHRwcml2YXRlIGRyb3Bkb3duaWZBbnlEZXBsb3llZCgpe3JldHVybiBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCIuc3VnZ2VzdGlvbi1kcm9wZG93blwiKX1cclxuXHJcblx0cHJpdmF0ZSBoYW5kbGVEcm9wZG93bk5hdmlnYXRpb24oZXZlbnQ6IEtleWJvYXJkRXZlbnQsdmlldzpFZGl0b3JWaWV3KSB7XHJcblx0XHRjb25zdCBkcm9wZG93biA9IHRoaXMuZHJvcGRvd25pZkFueURlcGxveWVkKCk7XHJcblx0XHRpZiAoIWRyb3Bkb3duIHx8IHRoaXMuc2VsZWN0aW9uSW5kZXggPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xyXG5cdFxyXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEFsbGRyb3Bkb3duSXRlbXMoKTtcclxuXHJcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XHJcblx0XHRcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZ2V0U3VnZ2VzdGlvbnModmlldzogRWRpdG9yVmlldykge1xyXG5cdFx0dGhpcy50cmlnZ2VyPW5ldyBTdWdnZXN0b3JUcmlnZ2VyKHRoaXMuY29udGV4dC5wb3MsIHZpZXcpXHJcblx0XHRjb25zdCBhbGxTdWdnZXN0aW9ucyA9IGdldFRpa3pTdWdnZXN0aW9ucygpLm1hcChzID0+IHMudHJpZ2dlcnx8cy5yZXBsYWNlbWVudCk7XHJcblx0XHJcblx0XHRjb25zdCBmaWx0ZXJlZFN1Z2dlc3Rpb25zID0gYWxsU3VnZ2VzdGlvbnMuZmlsdGVyKChzdWdnZXN0aW9uKSA9PlxyXG5cdFx0XHRzdWdnZXN0aW9uLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCh0aGlzLnRyaWdnZXIudGV4dC50b0xvd2VyQ2FzZSgpKVxyXG5cdFx0KTtcclxuXHRcclxuXHRcdGNvbnN0IHNvcnRlZFN1Z2dlc3Rpb25zID0gZmlsdGVyZWRTdWdnZXN0aW9ucy5zb3J0KChhLCBiKSA9PiB7XHJcblx0XHRcdGNvbnN0IGxvd2VyTGFzdFdvcmQgPSB0aGlzLnRyaWdnZXIudGV4dC50b0xvd2VyQ2FzZSgpO1xyXG5cdFx0XHRjb25zdCBhTG93ZXIgPSBhLnRvTG93ZXJDYXNlKCk7XHJcblx0XHRcdGNvbnN0IGJMb3dlciA9IGIudG9Mb3dlckNhc2UoKTtcclxuXHRcclxuXHJcblx0XHRcdGNvbnN0IGFFeGFjdE1hdGNoID0gYUxvd2VyID09PSBsb3dlckxhc3RXb3JkID8gLTEgOiAwO1xyXG5cdFx0XHRjb25zdCBiRXhhY3RNYXRjaCA9IGJMb3dlciA9PT0gbG93ZXJMYXN0V29yZCA/IC0xIDogMDtcclxuXHRcdFx0aWYgKGFFeGFjdE1hdGNoICE9PSBiRXhhY3RNYXRjaCkgcmV0dXJuIGFFeGFjdE1hdGNoIC0gYkV4YWN0TWF0Y2g7XHJcblx0XHJcblx0XHRcdGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBhLmxlbmd0aCAtIGIubGVuZ3RoO1xyXG5cdFxyXG5cdFx0XHRyZXR1cm4gYUxvd2VyLmxvY2FsZUNvbXBhcmUoYkxvd2VyKTtcclxuXHRcdH0pO1xyXG5cdFx0cmV0dXJuIHNvcnRlZFN1Z2dlc3Rpb25zO1xyXG5cdH1cclxuXHJcblx0XHJcblxyXG5cdHVwZGF0ZVNlbGVjdGlvbihpdGVtczogTm9kZUxpc3RPZjxFbGVtZW50Pikge1xyXG5cdFx0aXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcclxuXHRcdFx0aWYgKGluZGV4ID09PSB0aGlzLnNlbGVjdGlvbkluZGV4KSB7XHJcblx0XHRcdFx0aXRlbS5jbGFzc0xpc3QuYWRkKFwic2VsZWN0ZWRcIik7XHJcblx0XHRcdFx0aXRlbS5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRpdGVtLmNsYXNzTGlzdC5yZW1vdmUoXCJzZWxlY3RlZFwiKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRzZWxlY3REcm9wZG93bkl0ZW0oaXRlbTogRWxlbWVudCx2aWV3OiBFZGl0b3JWaWV3KSB7XHJcblx0XHR0aGlzLnJlbW92ZVN1Z2dlc3RvcigpXHJcblx0XHRpZighdGhpcy5jb250ZXh0KXJldHVybiA7XHJcblx0XHRjb25zdCBzZWxlY3RlZFRleHQgPSBpdGVtLnRleHRDb250ZW50IHx8IFwiXCI7XHJcblx0XHRjb25zdCBwb3M9dGhpcy5jb250ZXh0LnBvcztcclxuXHRcdGNvbnNvbGUubG9nKCdwb3MtdGhpcy50cmlnZ2VyLnRleHQubGVuZ3RoLHBvcyxzZWxlY3RlZFRleHQnLHBvcy10aGlzLnRyaWdnZXIudGV4dC5sZW5ndGgscG9zLHNlbGVjdGVkVGV4dClcclxuXHRcdHJlcGxhY2VSYW5nZSh2aWV3LHBvcy10aGlzLnRyaWdnZXIudGV4dC5sZW5ndGgscG9zLHNlbGVjdGVkVGV4dClcclxuXHRcdHZpZXcuZm9jdXMoKTtcclxuXHRcdHNldEN1cnNvcih2aWV3LGNhbGN1bGF0ZU5ld0N1cnNvclBvc2l0aW9uKHRoaXMudHJpZ2dlci50ZXh0LHNlbGVjdGVkVGV4dCxwb3MpKVxyXG5cdFx0Y29uc29sZS5sb2coYFNlbGVjdGVkOiAke3NlbGVjdGVkVGV4dH1gKTtcclxuXHR9XHJcbn1cclxuZnVuY3Rpb24gY2FsY3VsYXRlTmV3Q3Vyc29yUG9zaXRpb24odHJpZ2dlclRleHQ6IHN0cmluZywgc2VsZWN0ZWRUZXh0OiBzdHJpbmcsIG9yaWdpbmFsUG9zOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgY29uc3QgbGVuZ3RoRGlmZmVyZW5jZSA9IHNlbGVjdGVkVGV4dC5sZW5ndGggLSB0cmlnZ2VyVGV4dC5sZW5ndGg7XHJcbiAgICByZXR1cm4gb3JpZ2luYWxQb3MgKyBsZW5ndGhEaWZmZXJlbmNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVGbG9hdGluZ1N1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9uczogYW55W10sZWRpdG9yVmlldzogRWRpdG9yVmlldywgcG9zaXRpb246IG51bWJlcikge1xyXG5cclxuICAgIGNvbnN0IGNvb3JkaW5hdGVzID0gZWRpdG9yVmlldy5jb29yZHNBdFBvcyhwb3NpdGlvbik7XHJcbiAgICBpZiAoIWNvb3JkaW5hdGVzKSByZXR1cm47XHJcblxyXG4gICAgY29uc3Qgc3VnZ2VzdGlvbkRyb3Bkb3duID0gY3JlYXRlU3VnZ2VzdGlvbkRyb3Bkb3duKHN1Z2dlc3Rpb25zKTtcclxuXHJcbiAgICBzdWdnZXN0aW9uRHJvcGRvd24uc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XHJcbiAgICBzdWdnZXN0aW9uRHJvcGRvd24uc3R5bGUubGVmdCA9IGAke2Nvb3JkaW5hdGVzLmxlZnR9cHhgO1xyXG4gICAgc3VnZ2VzdGlvbkRyb3Bkb3duLnN0eWxlLnRvcCA9IGAke2Nvb3JkaW5hdGVzLmJvdHRvbX1weGA7XHJcblx0cmV0dXJuIHN1Z2dlc3Rpb25Ecm9wZG93bjtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVN1Z2dlc3Rpb25Ecm9wZG93bihzdWdnZXN0aW9uczogc3RyaW5nW10pIHtcclxuICAgIGNvbnN0IGRyb3Bkb3duQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGRyb3Bkb3duQ29udGFpbmVyLmNsYXNzTmFtZSA9IFwic3VnZ2VzdGlvbi1kcm9wZG93blwiO1xyXG5cclxuICAgIHN1Z2dlc3Rpb25zLmZvckVhY2goKHN1Z2dlc3Rpb24pID0+IHtcclxuICAgICAgICBjb25zdCBpdGVtID0gY3JlYXRlU3VnZ2VzdGlvbkl0ZW0oc3VnZ2VzdGlvbilcclxuXHRcdGRyb3Bkb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKGl0ZW0pXHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gZHJvcGRvd25Db250YWluZXI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVN1Z2dlc3Rpb25JdGVtKGRpc3BsYXlUZXh0OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XHJcblx0Ly8gQ3JlYXRlIHRoZSBvdXRlciBzdWdnZXN0aW9uIGl0ZW0gY29udGFpbmVyXHJcblx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuXHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChcInN1Z2dlc3Rpb24taXRlbVwiKTtcclxuXHRjb250YWluZXIuaW5uZXJUZXh0PWRpc3BsYXlUZXh0XHJcbiAgXHRyZXR1cm4gY29udGFpbmVyXHJcblx0Ly8gQ3JlYXRlIHRoZSBpY29uIGNvbnRhaW5lclxyXG5cdGNvbnN0IGljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdGljb24uY2xhc3NMaXN0LmFkZChcImljb25cIik7XHJcblx0aWNvbi50ZXh0Q29udGVudCA9IFwixpJcIjsgLy8gUGxhY2Vob2xkZXIgaWNvbiBjb250ZW50XHJcbiAgXHJcblx0Ly8gQ3JlYXRlIHRoZSBkZXRhaWxzIGNvbnRhaW5lclxyXG5cdGNvbnN0IGRldGFpbHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdGRldGFpbHMuY2xhc3NMaXN0LmFkZChcImRldGFpbHNcIik7XHJcbiAgXHJcblx0Ly8gQWRkIGEgbmFtZSBzcGFuIHRvIGRldGFpbHNcclxuXHRjb25zdCBuYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcblx0bmFtZS5jbGFzc0xpc3QuYWRkKFwibmFtZVwiKTtcclxuXHRuYW1lLnRleHRDb250ZW50ID0gXCJmdW5jdGlvblwiOyAvLyBQbGFjZWhvbGRlciBuYW1lIGNvbnRlbnRcclxuICBcclxuXHQvLyBBZGQgYSB0eXBlIHNwYW4gdG8gZGV0YWlsc1xyXG5cdGNvbnN0IHR5cGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuXHR0eXBlLmNsYXNzTGlzdC5hZGQoXCJ0eXBlXCIpO1xyXG5cdHR5cGUudGV4dENvbnRlbnQgPSBcIktleXdvcmRcIjsgLy8gUGxhY2Vob2xkZXIgdHlwZSBjb250ZW50XHJcbiAgXHJcblx0Ly8gQXBwZW5kIG5hbWUgYW5kIHR5cGUgdG8gZGV0YWlsc1xyXG5cdGRldGFpbHMuYXBwZW5kQ2hpbGQobmFtZSk7XHJcblx0ZGV0YWlscy5hcHBlbmRDaGlsZCh0eXBlKTtcclxuICBcclxuXHQvLyBBcHBlbmQgaWNvbiBhbmQgZGV0YWlscyB0byB0aGUgY29udGFpbmVyXHJcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xyXG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChkZXRhaWxzKTtcclxuICBcclxuXHRyZXR1cm4gY29udGFpbmVyO1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbi8qXHJcbmV4cG9ydCBjbGFzcyBOdW1lcmFsc1N1Z2dlc3RvciBleHRlbmRzIEVkaXRvclN1Z2dlc3Q8c3RyaW5nPiB7XHJcblx0cGx1Z2luOiBOdW1lcmFsc1BsdWdpbjtcclxuXHRcclxuXHQvKipcclxuXHQgKiBUaW1lIG9mIGxhc3Qgc3VnZ2VzdGlvbiBsaXN0IHVwZGF0ZVxyXG5cdCAqIEB0eXBlIHtudW1iZXJ9XHJcblx0ICogQHByaXZhdGUgXHJcblx0cHJpdmF0ZSBsYXN0U3VnZ2VzdGlvbkxpc3RVcGRhdGU6IG51bWJlciA9IDA7XHJcblxyXG5cdC8qKlxyXG5cdCAqIExpc3Qgb2YgcG9zc2libGUgc3VnZ2VzdGlvbnMgYmFzZWQgb24gY3VycmVudCBjb2RlIGJsb2NrXHJcblx0ICogQHR5cGUge3N0cmluZ1tdfVxyXG5cdCAqIEBwcml2YXRlIFxyXG5cdHByaXZhdGUgbG9jYWxTdWdnZXN0aW9uQ2FjaGU6IHN0cmluZ1tdID0gW107XHJcblxyXG5cdC8vZW1wdHkgY29uc3RydWN0b3JcclxuXHRjb25zdHJ1Y3RvcihwbHVnaW46IE51bWVyYWxzUGx1Z2luKSB7XHJcblx0XHRzdXBlcihwbHVnaW4uYXBwKTtcclxuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG5cdH1cclxuXHJcblx0b25UcmlnZ2VyKGN1cnNvcjogRWRpdG9yUG9zaXRpb24sIGVkaXRvcjogRWRpdG9yLCBmaWxlOiBURmlsZSk6IEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbyB8IG51bGwge1xyXG5cclxuXHRcdGNvbnN0IGNtRWRpdG9yID0gZWRpdG9yIGFzIGFueTtcclxuXHRcdGNvbnN0IHZpZXcgPSBjbUVkaXRvci5jbSA/IChjbUVkaXRvci5jbSBhcyBFZGl0b3JWaWV3KSA6IG51bGw7XHJcblx0XHRpZiAodmlldyA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XHJcblx0XHRjb25zdCBjb2RlYmxvY2tMZW5nPWxhbmdJZldpdGhpbkNvZGVibG9jayh2aWV3LnN0YXRlKVxyXG5cdFx0Y29uc3QgaXNNYXRoQmxvY2s9Y29kZWJsb2NrTGVuZz8uY29udGFpbnMoJ3Rpa3onKVxyXG5cclxuXHRcdGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xyXG5cdFx0Y29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xyXG5cdFx0Ly9jb25zdCBkb21Ob2RlID0gdmlldy5kb21BdFBvcyhsaW5lLmZyb20pLm5vZGU7XHJcblx0XHRpZiAoIWlzTWF0aEJsb2NrKSB7XHJcblx0XHRcdHJldHVybiBudWxsO1xyXG5cdFx0fVxyXG5cdFx0XHJcblxyXG5cdFx0Ly8gR2V0IGxhc3Qgd29yZCBpbiBjdXJyZW50IGxpbmVcclxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcykudGV4dDtcclxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydCA9IGN1cnJlbnRMaW5lLnNlYXJjaCgvWzpdP1skQFxcd1xcdTAzNzAtXFx1MDNGRl0rJC8pO1xyXG5cdFx0Ly8gaWYgdGhlcmUgaXMgbm8gd29yZCwgcmV0dXJuIG51bGxcclxuXHRcdGlmIChjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPT09IC0xKSB7XHJcblx0XHRcdHJldHVybiBudWxsO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB7XHJcblx0XHRcdHN0YXJ0OiB7bGluZTogY3Vyc29yLmxpbmUsIGNoOiBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnR9LFxyXG5cdFx0XHRlbmQ6IGN1cnNvcixcclxuXHRcdFx0cXVlcnk6IGN1cnJlbnRMaW5lLnNsaWNlKGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydClcclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRnZXRTdWdnZXN0aW9ucyhjb250ZXh0OiBFZGl0b3JTdWdnZXN0Q29udGV4dCk6IHN0cmluZ1tdIHwgUHJvbWlzZTxzdHJpbmdbXT4ge1xyXG5cdFx0bGV0IGxvY2FsU3ltYm9sczogc3RyaW5nIFtdID0gW107XHRcclxuXHJcblx0XHRsb2NhbFN5bWJvbHMgPSB0aGlzLmxvY2FsU3VnZ2VzdGlvbkNhY2hlXHJcblx0XHRjb25zdCBxdWVyeSA9IGNvbnRleHQucXVlcnkudG9Mb3dlckNhc2UoKTtcclxuXHJcblx0XHRjb25zdCBsb2NhbF9zdWdnZXN0aW9ucyA9IGxvY2FsU3ltYm9scy5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5zbGljZSgwLCAtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAyKSk7XHJcblx0XHRsb2NhbF9zdWdnZXN0aW9ucy5zb3J0KChhLCBiKSA9PiBhLnNsaWNlKDIpLmxvY2FsZUNvbXBhcmUoYi5zbGljZSgyKSkpO1xyXG5cdFx0XHJcblx0XHQvLyBjYXNlLWluc2Vuc2l0aXZlIGZpbHRlciBtYXRoanMgc3VnZ2VzdGlvbnMgYmFzZWQgb24gcXVlcnkuIERvbid0IHJldHVybiB2YWx1ZSBpZiBmdWxsIG1hdGNoXHJcblx0XHRsZXQgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdID0gW107XHJcblxyXG5cdFx0Y29uc3QgbWF0aGpzX3N1Z2dlc3Rpb25zID0gZ2V0TWF0aEpzU3ltYm9scygpLmZpbHRlcigob2JqOiBMYXRleCkgPT4gb2JqLnZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDIpKTtcclxuXHJcblx0XHRzdWdnZXN0aW9ucyA9IG1hdGhqc19zdWdnZXN0aW9ucy5tYXAoKG86TGF0ZXgpPT5vLnZhbHVlKS8vbG9jYWxfc3VnZ2VzdGlvbnMuY29uY2F0KG1hdGhqc19zdWdnZXN0aW9ucyk7XHJcblxyXG5cdFx0LypzdWdnZXN0aW9ucyA9IHN1Z2dlc3Rpb25zLmNvbmNhdChcclxuXHRcdFx0bnVtZXJhbHNEaXJlY3RpdmVzXHJcblx0XHRcdFx0LmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMCkpXHJcblx0XHRcdFx0Lm1hcCgodmFsdWUpID0+ICdtfCcgKyB2YWx1ZSlcclxuXHRcdFx0KTtcclxuXHJcblx0XHRyZXR1cm4gc3VnZ2VzdGlvbnM7XHJcblx0fVxyXG5cclxuXHRyZW5kZXJTdWdnZXN0aW9uKHZhbHVlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG5cdFx0ZWwuc2V0VGV4dCh2YWx1ZSkvKlxyXG5cdFx0ZWwuYWRkQ2xhc3NlcyhbJ21vZC1jb21wbGV4JywgJ251bWVyYWxzLXN1Z2dlc3Rpb24nXSk7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uQ29udGVudCA9IGVsLmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1jb250ZW50J30pO1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvblRpdGxlID0gc3VnZ2VzdGlvbkNvbnRlbnQuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLXRpdGxlJ30pO1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbk5vdGUgPSBzdWdnZXN0aW9uQ29udGVudC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tbm90ZSd9KTtcclxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25BdXggPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tYXV4J30pO1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkZsYWlyID0gc3VnZ2VzdGlvbkF1eC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tZmxhaXInfSk7Ki9cclxuXHJcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXVudXNlZC12YXJzXHJcblx0XHQvKlxyXG5cdFx0Y29uc3QgW2ljb25UeXBlLCBzdWdnZXN0aW9uVGV4dCwgbm90ZVRleHRdID0gdmFsdWUuc3BsaXQoJ3wnKTtcclxuXHJcblx0XHRpZiAoaWNvblR5cGUgPT09ICdmJykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2Z1bmN0aW9uLXNxdWFyZScpO1x0XHRcclxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdjJykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2xvY2F0ZS1maXhlZCcpO1xyXG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ3YnKSB7XHJcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZmlsZS1jb2RlJyk7XHJcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAncCcpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdib3gnKTtcclxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdtJykge1xyXG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ3NwYXJrbGVzJyk7XHRcdFx0XHJcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAnZycpIHtcclxuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdjYXNlLWxvd2VyJyk7IC8vIEFzc3VtaW5nICdzeW1ib2wnIGlzIGEgdmFsaWQgaWNvbiBuYW1lXHJcblx0XHR9XHJcblx0XHRzdWdnZXN0aW9uVGl0bGUuc2V0VGV4dChzdWdnZXN0aW9uVGV4dCk7XHJcblx0XHRpZiAobm90ZVRleHQpIHtcclxuXHRcdFx0c3VnZ2VzdGlvbk5vdGUuc2V0VGV4dChub3RlVGV4dCk7XHJcblx0XHR9XHJcblx0XHQvL3N1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHZhbHVlKTtcclxuXHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBDYWxsZWQgd2hlbiBhIHN1Z2dlc3Rpb24gaXMgc2VsZWN0ZWQuIFJlcGxhY2VzIHRoZSBjdXJyZW50IHdvcmQgd2l0aCB0aGUgc2VsZWN0ZWQgc3VnZ2VzdGlvblxyXG5cdCAqIEBwYXJhbSB2YWx1ZSBUaGUgc2VsZWN0ZWQgc3VnZ2VzdGlvblxyXG5cdCAqIEBwYXJhbSBldnQgVGhlIGV2ZW50IHRoYXQgdHJpZ2dlcmVkIHRoZSBzZWxlY3Rpb25cclxuXHQgKiBAcmV0dXJucyB2b2lkXHJcblx0IFxyXG5cclxuXHRzZWxlY3RTdWdnZXN0aW9uKHZhbHVlOiBzdHJpbmcsIGV2dDogTW91c2VFdmVudCB8IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuXHRcdGlmICh0aGlzLmNvbnRleHQpIHtcclxuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5jb250ZXh0LmVkaXRvcjtcclxuXHRcdFx0XHJcblx0XHRcdGNvbnN0IGNtRWRpdG9yID0gZWRpdG9yIGFzIGFueTtcclxuXHRcdFx0Y29uc3QgdmlldyA9IGNtRWRpdG9yLmNtID8gKGNtRWRpdG9yLmNtIGFzIEVkaXRvclZpZXcpIDogbnVsbDtcclxuXHRcdFx0aWYgKHZpZXcgPT09IG51bGwpIHJldHVybjtcclxuXHRcclxuXHRcdFx0Y29uc3QgY3Vyc29yID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbjtcclxuXHRcdFx0Y29uc3QgZnJvbSA9IGN1cnNvci5mcm9tO1xyXG5cdFx0XHRjb25zdCB0byA9IGN1cnNvci50bzsgXHJcblx0XHJcblx0XHRcdHZpZXcuZGlzcGF0Y2goe1xyXG5cdFx0XHRcdGNoYW5nZXM6IHsgZnJvbSwgdG8sIGluc2VydDogdmFsdWUgfSxcclxuXHRcdFx0XHRzZWxlY3Rpb246IHsgYW5jaG9yOiBmcm9tICsgdmFsdWUubGVuZ3RoIH1cclxuXHRcdFx0fSk7XHJcblx0XHRcdFxyXG5cdFx0XHR0aGlzLmNsb3NlKCk7XHJcblx0XHR9XHJcblx0fVxyXG59XHJcbiovXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhcmFjdGVyQXRQb3Modmlld09yU3RhdGU6IEVkaXRvclZpZXcgfCBFZGl0b3JTdGF0ZSwgcG9zOiBudW1iZXIpIHtcclxuXHRjb25zdCBzdGF0ZSA9IHZpZXdPclN0YXRlIGluc3RhbmNlb2YgRWRpdG9yVmlldyA/IHZpZXdPclN0YXRlLnN0YXRlIDogdmlld09yU3RhdGU7XHJcblx0Y29uc3QgZG9jID0gc3RhdGUuZG9jO1xyXG5cdHJldHVybiBkb2Muc2xpY2UocG9zLCBwb3MrMSkudG9TdHJpbmcoKTtcclxufVxyXG5cclxuXHJcbiBcclxuY29uc3QgbGFuZ0lmV2l0aGluQ29kZWJsb2NrID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IHN0cmluZyB8IG51bGwgPT4ge1xyXG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcclxuXHJcblx0Y29uc3QgcG9zID0gc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xyXG5cclxuXHQvKlxyXG5cdCogZ2V0IGEgdHJlZSBjdXJzb3IgYXQgdGhlIHBvc2l0aW9uXHJcblx0KlxyXG5cdCogQSBuZXdsaW5lIGRvZXMgbm90IGJlbG9uZyB0byBhbnkgc3ludGF4IG5vZGVzIGV4Y2VwdCBmb3IgdGhlIERvY3VtZW50LFxyXG5cdCogd2hpY2ggY29ycmVzcG9uZHMgdG8gdGhlIHdob2xlIGRvY3VtZW50LiBTbywgd2UgY2hhbmdlIHRoZSBgbW9kZWAgb2YgdGhlXHJcblx0KiBgY3Vyc29yQXRgIGRlcGVuZGluZyBvbiB3aGV0aGVyIHRoZSBjaGFyYWN0ZXIganVzdCBiZWZvcmUgdGhlIGN1cnNvciBpcyBhXHJcblx0KiBuZXdsaW5lLlxyXG5cdCovXHJcblx0Y29uc3QgY3Vyc29yID1cclxuXHRcdHBvcyA9PT0gMCB8fCBnZXRDaGFyYWN0ZXJBdFBvcyhzdGF0ZSwgcG9zIC0gMSkgPT09IFwiXFxuXCJcclxuXHRcdD8gdHJlZS5jdXJzb3JBdChwb3MsIDEpXHJcblx0XHQ6IHRyZWUuY3Vyc29yQXQocG9zLCAtMSk7XHJcblxyXG5cdC8vIGNoZWNrIGlmIHdlJ3JlIGluIGEgY29kZWJsb2NrIGF0bSBhdCBhbGxcclxuXHRjb25zdCBpbkNvZGVibG9jayA9IGN1cnNvci5uYW1lLmNvbnRhaW5zKFwiY29kZWJsb2NrXCIpO1xyXG5cdGlmICghaW5Db2RlYmxvY2spIHtcclxuXHRcdHJldHVybiBudWxsO1xyXG5cdH1cclxuXHJcblx0Ly8gbG9jYXRlIHRoZSBzdGFydCBvZiB0aGUgYmxvY2tcclxuXHRjb25zdCBjb2RlYmxvY2tCZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJIeXBlck1ELWNvZGVibG9ja19IeXBlck1ELWNvZGVibG9jay1iZWdpblwiKTtcclxuXHJcblx0aWYgKGNvZGVibG9ja0JlZ2luID09IG51bGwpIHtcclxuXHRcdGNvbnNvbGUud2FybihcInVuYWJsZSB0byBsb2NhdGUgc3RhcnQgb2YgdGhlIGNvZGVibG9jayBldmVuIHRob3VnaCBpbnNpZGUgb25lXCIpO1xyXG5cdFx0cmV0dXJuIFwiXCI7XHJcblx0fVxyXG5cclxuXHQvLyBleHRyYWN0IHRoZSBsYW5ndWFnZVxyXG5cdC8vIGNvZGVibG9ja3MgbWF5IHN0YXJ0IGFuZCBlbmQgd2l0aCBhbiBhcmJpdHJhcnkgbnVtYmVyIG9mIGJhY2t0aWNrc1xyXG5cdGNvbnN0IGxhbmd1YWdlID0gc3RhdGUuc2xpY2VEb2MoY29kZWJsb2NrQmVnaW4uZnJvbSwgY29kZWJsb2NrQmVnaW4udG8pLnJlcGxhY2UoL2ArLywgXCJcIik7XHJcblxyXG5cdHJldHVybiBsYW5ndWFnZTtcclxufVxyXG5cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yOiBUcmVlQ3Vyc29yLCBkaXI6IERpcmVjdGlvbiwgdGFyZ2V0OiBzdHJpbmcpOiBTeW50YXhOb2RlIHwgbnVsbCB7XHJcblx0Ly8gQWxsb3cgdGhlIHN0YXJ0aW5nIG5vZGUgdG8gYmUgYSBtYXRjaFxyXG5cdGlmIChjdXJzb3IubmFtZS5jb250YWlucyh0YXJnZXQpKSB7XHJcblx0XHRyZXR1cm4gY3Vyc29yLm5vZGU7XHJcblx0fVxyXG5cclxuXHR3aGlsZSAoXHJcblx0XHQoY3Vyc29yLm5hbWUgIT0gXCJEb2N1bWVudFwiKSAmJlxyXG5cdFx0KChkaXIgPT0gRGlyZWN0aW9uLkJhY2t3YXJkICYmIGN1cnNvci5wcmV2KCkpXHJcblx0XHR8fCAoZGlyID09IERpcmVjdGlvbi5Gb3J3YXJkICYmIGN1cnNvci5uZXh0KCkpXHJcblx0XHR8fCBjdXJzb3IucGFyZW50KCkpXHJcblx0KSB7XHJcblx0XHRpZiAoY3Vyc29yLm5hbWUuY29udGFpbnModGFyZ2V0KSkge1xyXG5cdFx0XHRyZXR1cm4gY3Vyc29yLm5vZGU7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGVudW0gRGlyZWN0aW9uIHtcclxuXHRCYWNrd2FyZCxcclxuXHRGb3J3YXJkLFxyXG59Il19