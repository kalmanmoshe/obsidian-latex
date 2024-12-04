import { EditorSuggest, setIcon, } from "obsidian";
import { getMathJsSymbols } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
const numeralsDirectives = [
    "@hideRows",
    "@Sum",
    "@Total",
];
export class NumeralsSuggestor extends EditorSuggest {
    plugin;
    /**
     * Time of last suggestion list update
     * @type {number}
     * @private */
    lastSuggestionListUpdate = 0;
    /**
     * List of possible suggestions based on current code block
     * @type {string[]}
     * @private */
    localSuggestionCache = [];
    //empty constructor
    constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
    }
    onTrigger(cursor, editor, file) {
        const cmEditor = editor;
        const view = cmEditor.cm ? cmEditor.cm : null;
        if (view === null)
            return null;
        const codeblockLeng = langIfWithinCodeblock(view.state);
        const isMathBlock = codeblockLeng?.contains('tikz');
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
            start: { line: cursor.line, ch: currentLineLastWordStart },
            end: cursor,
            query: currentLine.slice(currentLineLastWordStart)
        };
    }
    getSuggestions(context) {
        let localSymbols = [];
        localSymbols = this.localSuggestionCache;
        const query_lower = context.query.toLowerCase();
        // case-insensitive filter local suggestions based on query. Don't return value if full match
        const local_suggestions = localSymbols.filter((value) => value.slice(0, -1).toLowerCase().startsWith(query_lower, 2));
        local_suggestions.sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
        // case-insensitive filter mathjs suggestions based on query. Don't return value if full match
        let suggestions = [];
        console.log();
        const mathjs_suggestions = getMathJsSymbols().filter((value) => value.slice(0, -1).toLowerCase().startsWith(query_lower, 2));
        suggestions = local_suggestions.concat(mathjs_suggestions);
        suggestions = suggestions.concat(numeralsDirectives
            .filter((value) => value.slice(0, -1).toLowerCase().startsWith(query_lower, 0))
            .map((value) => 'm|' + value));
        return suggestions;
    }
    renderSuggestion(value, el) {
        console.log(value);
        el.addClasses(['mod-complex', 'numerals-suggestion']);
        const suggestionContent = el.createDiv({ cls: 'suggestion-content' });
        const suggestionTitle = suggestionContent.createDiv({ cls: 'suggestion-title' });
        const suggestionNote = suggestionContent.createDiv({ cls: 'suggestion-note' });
        const suggestionAux = el.createDiv({ cls: 'suggestion-aux' });
        const suggestionFlair = suggestionAux.createDiv({ cls: 'suggestion-flair' });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [iconType, suggestionText, noteText] = value.split('|');
        if (iconType === 'f') {
            setIcon(suggestionFlair, 'function-square');
        }
        else if (iconType === 'c') {
            setIcon(suggestionFlair, 'locate-fixed');
        }
        else if (iconType === 'v') {
            setIcon(suggestionFlair, 'file-code');
        }
        else if (iconType === 'p') {
            setIcon(suggestionFlair, 'box');
        }
        else if (iconType === 'm') {
            setIcon(suggestionFlair, 'sparkles');
        }
        else if (iconType === 'g') {
            setIcon(suggestionFlair, 'case-lower'); // Assuming 'symbol' is a valid icon name
        }
        suggestionTitle.setText(suggestionText);
        if (noteText) {
            suggestionNote.setText(noteText);
        }
    }
    /**
     * Called when a suggestion is selected. Replaces the current word with the selected suggestion
     * @param value The selected suggestion
     * @param evt The event that triggered the selection
     * @returns void
     */
    selectSuggestion(value, evt) {
        if (this.context) {
            const editor = this.context.editor;
            const [suggestionType, suggestion] = value.split('|');
            const start = this.context.start;
            const end = editor.getCursor(); // get new end position in case cursor has moved
            editor.replaceRange(suggestion, start, end);
            const newCursor = end;
            if (suggestionType === 'f') {
                newCursor.ch = start.ch + suggestion.length - 1;
            }
            else {
                newCursor.ch = start.ch + suggestion.length;
            }
            editor.setCursor(newCursor);
            this.close();
        }
    }
}
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3RlbXBDb2RlUnVubmVyRmlsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQ0gsYUFBYSxFQU1iLE9BQU8sR0FDVCxNQUFNLFVBQVUsQ0FBQztBQUVuQixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDL0MsT0FBTyxFQUFFLFVBQVUsR0FBdUMsTUFBTSxrQkFBa0IsQ0FBQztBQUNuRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFLbEQsTUFBTSxrQkFBa0IsR0FBRztJQUMxQixXQUFXO0lBQ1gsTUFBTTtJQUNOLFFBQVE7Q0FDUixDQUFBO0FBRUQsTUFBTSxPQUFPLGlCQUFrQixTQUFRLGFBQXFCO0lBQzNELE1BQU0sQ0FBaUI7SUFFdkI7OztrQkFHYztJQUNOLHdCQUF3QixHQUFXLENBQUMsQ0FBQztJQUU3Qzs7O2tCQUdjO0lBQ04sb0JBQW9CLEdBQWEsRUFBRSxDQUFDO0lBRTVDLG1CQUFtQjtJQUNuQixZQUFZLE1BQXNCO1FBQ2pDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDdEIsQ0FBQztJQUVELFNBQVMsQ0FBQyxNQUFzQixFQUFFLE1BQWMsRUFBRSxJQUFXO1FBRTVELE1BQU0sUUFBUSxHQUFHLE1BQWEsQ0FBQztRQUMvQixNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBRSxRQUFRLENBQUMsRUFBaUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBRTlELElBQUksSUFBSSxLQUFLLElBQUk7WUFBRSxPQUFPLElBQUksQ0FBQztRQUMvQixNQUFNLGFBQWEsR0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDckQsTUFBTSxXQUFXLEdBQUMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUVqRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQ2hELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNqQixPQUFPLElBQUksQ0FBQztTQUNaO1FBR0QsZ0NBQWdDO1FBQ2hDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDcEQsTUFBTSx3QkFBd0IsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDakYsbUNBQW1DO1FBQ25DLElBQUksd0JBQXdCLEtBQUssQ0FBQyxDQUFDLEVBQUU7WUFDcEMsT0FBTyxJQUFJLENBQUM7U0FDWjtRQUVELE9BQU87WUFDTixLQUFLLEVBQUUsRUFBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsd0JBQXdCLEVBQUM7WUFDeEQsR0FBRyxFQUFFLE1BQU07WUFDWCxLQUFLLEVBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQztTQUNsRCxDQUFDO0lBQ0gsQ0FBQztJQUVELGNBQWMsQ0FBQyxPQUE2QjtRQUMzQyxJQUFJLFlBQVksR0FBYyxFQUFFLENBQUM7UUFFakMsWUFBWSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQTtRQUN4QyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRWhELDZGQUE2RjtRQUM3RixNQUFNLGlCQUFpQixHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RILGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXZFLDhGQUE4RjtRQUM5RixJQUFJLFdBQVcsR0FBYSxFQUFFLENBQUM7UUFDL0IsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFBO1FBQ2IsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQWEsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckksV0FBVyxHQUFHLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTNELFdBQVcsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUMvQixrQkFBa0I7YUFDaEIsTUFBTSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7YUFDN0UsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQzdCLENBQUM7UUFFSCxPQUFPLFdBQVcsQ0FBQztJQUNwQixDQUFDO0lBRUQsZ0JBQWdCLENBQUMsS0FBYSxFQUFFLEVBQWU7UUFDOUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUNsQixFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsYUFBYSxFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUN0RCxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBQyxHQUFHLEVBQUUsb0JBQW9CLEVBQUMsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sZUFBZSxHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxFQUFDLEdBQUcsRUFBRSxrQkFBa0IsRUFBQyxDQUFDLENBQUM7UUFDL0UsTUFBTSxjQUFjLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEVBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFDLENBQUMsQ0FBQztRQUM3RSxNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFDLENBQUMsQ0FBQztRQUM1RCxNQUFNLGVBQWUsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLEVBQUMsR0FBRyxFQUFFLGtCQUFrQixFQUFDLENBQUMsQ0FBQztRQUUzRSw2REFBNkQ7UUFDN0QsTUFBTSxDQUFDLFFBQVEsRUFBRSxjQUFjLEVBQUUsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU5RCxJQUFJLFFBQVEsS0FBSyxHQUFHLEVBQUU7WUFDckIsT0FBTyxDQUFDLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1NBQzVDO2FBQU0sSUFBSSxRQUFRLEtBQUssR0FBRyxFQUFFO1lBQzVCLE9BQU8sQ0FBQyxlQUFlLEVBQUUsY0FBYyxDQUFDLENBQUM7U0FDekM7YUFBTSxJQUFJLFFBQVEsS0FBSyxHQUFHLEVBQUU7WUFDNUIsT0FBTyxDQUFDLGVBQWUsRUFBRSxXQUFXLENBQUMsQ0FBQztTQUN0QzthQUFNLElBQUksUUFBUSxLQUFLLEdBQUcsRUFBRTtZQUM1QixPQUFPLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQ2hDO2FBQU0sSUFBSSxRQUFRLEtBQUssR0FBRyxFQUFFO1lBQzVCLE9BQU8sQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUM7U0FDckM7YUFBTSxJQUFJLFFBQVEsS0FBSyxHQUFHLEVBQUU7WUFDNUIsT0FBTyxDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLHlDQUF5QztTQUNqRjtRQUNELGVBQWUsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDeEMsSUFBSSxRQUFRLEVBQUU7WUFDYixjQUFjLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQ2pDO0lBRUYsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsZ0JBQWdCLENBQUMsS0FBYSxFQUFFLEdBQStCO1FBQzlELElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNqQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQztZQUNuQyxNQUFNLENBQUMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7WUFDakMsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsZ0RBQWdEO1lBRWhGLE1BQU0sQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM1QyxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUM7WUFFdEIsSUFBSSxjQUFjLEtBQUssR0FBRyxFQUFFO2dCQUMzQixTQUFTLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxFQUFFLEdBQUcsVUFBVSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUM7YUFDOUM7aUJBQU07Z0JBQ04sU0FBUyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsRUFBRSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUM7YUFDNUM7WUFDRCxNQUFNLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRTVCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQTtTQUNaO0lBQ0YsQ0FBQztDQUNEO0FBR0QsTUFBTSxVQUFVLGlCQUFpQixDQUFDLFdBQXFDLEVBQUUsR0FBVztJQUNuRixNQUFNLEtBQUssR0FBRyxXQUFXLFlBQVksVUFBVSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUM7SUFDbEYsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQztJQUN0QixPQUFPLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsR0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztBQUN6QyxDQUFDO0FBSUQsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLEtBQWtCLEVBQWlCLEVBQUU7SUFDbkUsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBRS9CLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUUzQzs7Ozs7OztNQU9FO0lBQ0YsTUFBTSxNQUFNLEdBQ1gsR0FBRyxLQUFLLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLElBQUk7UUFDdkQsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUN2QixDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUxQiwyQ0FBMkM7SUFDM0MsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDdEQsSUFBSSxDQUFDLFdBQVcsRUFBRTtRQUNqQixPQUFPLElBQUksQ0FBQztLQUNaO0lBRUQsZ0NBQWdDO0lBQ2hDLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO0lBRWhILElBQUksY0FBYyxJQUFJLElBQUksRUFBRTtRQUMzQixPQUFPLENBQUMsSUFBSSxDQUFDLGdFQUFnRSxDQUFDLENBQUM7UUFDL0UsT0FBTyxFQUFFLENBQUM7S0FDVjtJQUVELHVCQUF1QjtJQUN2QixxRUFBcUU7SUFDckUsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRTFGLE9BQU8sUUFBUSxDQUFDO0FBQ2pCLENBQUMsQ0FBQTtBQUdELE1BQU0sVUFBVSxlQUFlLENBQUMsTUFBa0IsRUFBRSxHQUFjLEVBQUUsTUFBYztJQUNqRix3Q0FBd0M7SUFDeEMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUNqQyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUM7S0FDbkI7SUFFRCxPQUNDLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxVQUFVLENBQUM7UUFDM0IsQ0FBQyxDQUFDLEdBQUcsSUFBSSxTQUFTLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztlQUMxQyxDQUFDLEdBQUcsSUFBSSxTQUFTLENBQUMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztlQUMzQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFDbEI7UUFDRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQztTQUNuQjtLQUNEO0lBRUQsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRUQsTUFBTSxDQUFOLElBQVksU0FHWDtBQUhELFdBQVksU0FBUztJQUNwQixpREFBUSxDQUFBO0lBQ1IsK0NBQU8sQ0FBQTtBQUNSLENBQUMsRUFIVyxTQUFTLEtBQVQsU0FBUyxRQUdwQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBOdW1lcmFsc1BsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQge1xuICAgIEVkaXRvclN1Z2dlc3QsXG4gICAgRWRpdG9yUG9zaXRpb24sXG4gICAgRWRpdG9yLFxuICAgIFRGaWxlLFxuICAgIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbyxcbiAgICBFZGl0b3JTdWdnZXN0Q29udGV4dCxcbiAgICBzZXRJY29uLFxuIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGdldE1hdGhKc1N5bWJvbHMgfSBmcm9tIFwiLi91dGlsaXRpZXNcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdQbHVnaW4sIFZpZXdVcGRhdGUgLERlY29yYXRpb24sIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tIFwiQGNvZGVtaXJyb3IvbGFuZ3VhZ2VcIjtcbmltcG9ydCB7IEVkaXRvclN0YXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBTeW50YXhOb2RlLCBUcmVlQ3Vyc29yIH0gZnJvbSBcIkBsZXplci9jb21tb25cIjtcblxuXG5jb25zdCBudW1lcmFsc0RpcmVjdGl2ZXMgPSBbXG5cdFwiQGhpZGVSb3dzXCIsXG5cdFwiQFN1bVwiLFxuXHRcIkBUb3RhbFwiLFxuXVxuXG5leHBvcnQgY2xhc3MgTnVtZXJhbHNTdWdnZXN0b3IgZXh0ZW5kcyBFZGl0b3JTdWdnZXN0PHN0cmluZz4ge1xuXHRwbHVnaW46IE51bWVyYWxzUGx1Z2luO1xuXHRcblx0LyoqXG5cdCAqIFRpbWUgb2YgbGFzdCBzdWdnZXN0aW9uIGxpc3QgdXBkYXRlXG5cdCAqIEB0eXBlIHtudW1iZXJ9XG5cdCAqIEBwcml2YXRlICovXG5cdHByaXZhdGUgbGFzdFN1Z2dlc3Rpb25MaXN0VXBkYXRlOiBudW1iZXIgPSAwO1xuXG5cdC8qKlxuXHQgKiBMaXN0IG9mIHBvc3NpYmxlIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIGN1cnJlbnQgY29kZSBibG9ja1xuXHQgKiBAdHlwZSB7c3RyaW5nW119XG5cdCAqIEBwcml2YXRlICovXG5cdHByaXZhdGUgbG9jYWxTdWdnZXN0aW9uQ2FjaGU6IHN0cmluZ1tdID0gW107XG5cblx0Ly9lbXB0eSBjb25zdHJ1Y3RvclxuXHRjb25zdHJ1Y3RvcihwbHVnaW46IE51bWVyYWxzUGx1Z2luKSB7XG5cdFx0c3VwZXIocGx1Z2luLmFwcCk7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRvblRyaWdnZXIoY3Vyc29yOiBFZGl0b3JQb3NpdGlvbiwgZWRpdG9yOiBFZGl0b3IsIGZpbGU6IFRGaWxlKTogRWRpdG9yU3VnZ2VzdFRyaWdnZXJJbmZvIHwgbnVsbCB7XG5cblx0XHRjb25zdCBjbUVkaXRvciA9IGVkaXRvciBhcyBhbnk7XG5cdFx0Y29uc3QgdmlldyA9IGNtRWRpdG9yLmNtID8gKGNtRWRpdG9yLmNtIGFzIEVkaXRvclZpZXcpIDogbnVsbDtcblxuXHRcdGlmICh2aWV3ID09PSBudWxsKSByZXR1cm4gbnVsbDtcblx0XHRjb25zdCBjb2RlYmxvY2tMZW5nPWxhbmdJZldpdGhpbkNvZGVibG9jayh2aWV3LnN0YXRlKVxuXHRcdGNvbnN0IGlzTWF0aEJsb2NrPWNvZGVibG9ja0xlbmc/LmNvbnRhaW5zKCd0aWt6JylcblxuXHRcdGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xuXHRcdGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcblx0XHQvL2NvbnN0IGRvbU5vZGUgPSB2aWV3LmRvbUF0UG9zKGxpbmUuZnJvbSkubm9kZTtcblx0XHRpZiAoIWlzTWF0aEJsb2NrKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0XG5cblx0XHQvLyBHZXQgbGFzdCB3b3JkIGluIGN1cnJlbnQgbGluZVxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcykudGV4dDtcblx0XHRjb25zdCBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPSBjdXJyZW50TGluZS5zZWFyY2goL1s6XT9bJEBcXHdcXHUwMzcwLVxcdTAzRkZdKyQvKTtcblx0XHQvLyBpZiB0aGVyZSBpcyBubyB3b3JkLCByZXR1cm4gbnVsbFxuXHRcdGlmIChjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHtsaW5lOiBjdXJzb3IubGluZSwgY2g6IGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydH0sXG5cdFx0XHRlbmQ6IGN1cnNvcixcblx0XHRcdHF1ZXJ5OiBjdXJyZW50TGluZS5zbGljZShjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQpXG5cdFx0fTtcblx0fVxuXG5cdGdldFN1Z2dlc3Rpb25zKGNvbnRleHQ6IEVkaXRvclN1Z2dlc3RDb250ZXh0KTogc3RyaW5nW10gfCBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0bGV0IGxvY2FsU3ltYm9sczogc3RyaW5nIFtdID0gW107XHRcblxuXHRcdGxvY2FsU3ltYm9scyA9IHRoaXMubG9jYWxTdWdnZXN0aW9uQ2FjaGVcblx0XHRjb25zdCBxdWVyeV9sb3dlciA9IGNvbnRleHQucXVlcnkudG9Mb3dlckNhc2UoKTtcblxuXHRcdC8vIGNhc2UtaW5zZW5zaXRpdmUgZmlsdGVyIGxvY2FsIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIHF1ZXJ5LiBEb24ndCByZXR1cm4gdmFsdWUgaWYgZnVsbCBtYXRjaFxuXHRcdGNvbnN0IGxvY2FsX3N1Z2dlc3Rpb25zID0gbG9jYWxTeW1ib2xzLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnlfbG93ZXIsIDIpKTtcblx0XHRsb2NhbF9zdWdnZXN0aW9ucy5zb3J0KChhLCBiKSA9PiBhLnNsaWNlKDIpLmxvY2FsZUNvbXBhcmUoYi5zbGljZSgyKSkpO1xuXHRcdFxuXHRcdC8vIGNhc2UtaW5zZW5zaXRpdmUgZmlsdGVyIG1hdGhqcyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBxdWVyeS4gRG9uJ3QgcmV0dXJuIHZhbHVlIGlmIGZ1bGwgbWF0Y2hcblx0XHRsZXQgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc29sZS5sb2coKVxuXHRcdGNvbnN0IG1hdGhqc19zdWdnZXN0aW9ucyA9IGdldE1hdGhKc1N5bWJvbHMoKS5maWx0ZXIoKHZhbHVlOiBzdHJpbmcpID0+IHZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnlfbG93ZXIsIDIpKTtcblx0XHRzdWdnZXN0aW9ucyA9IGxvY2FsX3N1Z2dlc3Rpb25zLmNvbmNhdChtYXRoanNfc3VnZ2VzdGlvbnMpO1xuXG5cdFx0c3VnZ2VzdGlvbnMgPSBzdWdnZXN0aW9ucy5jb25jYXQoXG5cdFx0XHRudW1lcmFsc0RpcmVjdGl2ZXNcblx0XHRcdFx0LmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeV9sb3dlciwgMCkpXG5cdFx0XHRcdC5tYXAoKHZhbHVlKSA9PiAnbXwnICsgdmFsdWUpXG5cdFx0XHQpO1xuXG5cdFx0cmV0dXJuIHN1Z2dlc3Rpb25zO1xuXHR9XG5cblx0cmVuZGVyU3VnZ2VzdGlvbih2YWx1ZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zb2xlLmxvZyh2YWx1ZSlcblx0XHRlbC5hZGRDbGFzc2VzKFsnbW9kLWNvbXBsZXgnLCAnbnVtZXJhbHMtc3VnZ2VzdGlvbiddKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uQ29udGVudCA9IGVsLmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1jb250ZW50J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25UaXRsZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi10aXRsZSd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uTm90ZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1ub3RlJ30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25BdXggPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tYXV4J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25GbGFpciA9IHN1Z2dlc3Rpb25BdXguY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWZsYWlyJ30pO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby11bnVzZWQtdmFyc1xuXHRcdGNvbnN0IFtpY29uVHlwZSwgc3VnZ2VzdGlvblRleHQsIG5vdGVUZXh0XSA9IHZhbHVlLnNwbGl0KCd8Jyk7XG5cblx0XHRpZiAoaWNvblR5cGUgPT09ICdmJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdmdW5jdGlvbi1zcXVhcmUnKTtcdFx0XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ2MnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2xvY2F0ZS1maXhlZCcpO1xuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICd2Jykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdmaWxlLWNvZGUnKTtcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAncCcpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnYm94Jyk7XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ20nKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ3NwYXJrbGVzJyk7XHRcdFx0XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ2cnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2Nhc2UtbG93ZXInKTsgLy8gQXNzdW1pbmcgJ3N5bWJvbCcgaXMgYSB2YWxpZCBpY29uIG5hbWVcblx0XHR9XG5cdFx0c3VnZ2VzdGlvblRpdGxlLnNldFRleHQoc3VnZ2VzdGlvblRleHQpO1xuXHRcdGlmIChub3RlVGV4dCkge1xuXHRcdFx0c3VnZ2VzdGlvbk5vdGUuc2V0VGV4dChub3RlVGV4dCk7XG5cdFx0fVxuXG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gYSBzdWdnZXN0aW9uIGlzIHNlbGVjdGVkLiBSZXBsYWNlcyB0aGUgY3VycmVudCB3b3JkIHdpdGggdGhlIHNlbGVjdGVkIHN1Z2dlc3Rpb25cblx0ICogQHBhcmFtIHZhbHVlIFRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXG5cdCAqIEBwYXJhbSBldnQgVGhlIGV2ZW50IHRoYXQgdHJpZ2dlcmVkIHRoZSBzZWxlY3Rpb25cblx0ICogQHJldHVybnMgdm9pZFxuXHQgKi9cblx0c2VsZWN0U3VnZ2VzdGlvbih2YWx1ZTogc3RyaW5nLCBldnQ6IE1vdXNlRXZlbnQgfCBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGV4dCkge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5jb250ZXh0LmVkaXRvcjtcblx0XHRcdGNvbnN0IFtzdWdnZXN0aW9uVHlwZSwgc3VnZ2VzdGlvbl0gPSB2YWx1ZS5zcGxpdCgnfCcpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLmNvbnRleHQuc3RhcnQ7XG5cdFx0XHRjb25zdCBlbmQgPSBlZGl0b3IuZ2V0Q3Vyc29yKCk7IC8vIGdldCBuZXcgZW5kIHBvc2l0aW9uIGluIGNhc2UgY3Vyc29yIGhhcyBtb3ZlZFxuXHRcdFx0XG5cdFx0XHRlZGl0b3IucmVwbGFjZVJhbmdlKHN1Z2dlc3Rpb24sIHN0YXJ0LCBlbmQpO1xuXHRcdFx0Y29uc3QgbmV3Q3Vyc29yID0gZW5kO1xuXG5cdFx0XHRpZiAoc3VnZ2VzdGlvblR5cGUgPT09ICdmJykge1xuXHRcdFx0XHRuZXdDdXJzb3IuY2ggPSBzdGFydC5jaCArIHN1Z2dlc3Rpb24ubGVuZ3RoLTE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdDdXJzb3IuY2ggPSBzdGFydC5jaCArIHN1Z2dlc3Rpb24ubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0ZWRpdG9yLnNldEN1cnNvcihuZXdDdXJzb3IpO1x0XHRcdFxuXG5cdFx0XHR0aGlzLmNsb3NlKClcblx0XHR9XG5cdH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhcmFjdGVyQXRQb3Modmlld09yU3RhdGU6IEVkaXRvclZpZXcgfCBFZGl0b3JTdGF0ZSwgcG9zOiBudW1iZXIpIHtcblx0Y29uc3Qgc3RhdGUgPSB2aWV3T3JTdGF0ZSBpbnN0YW5jZW9mIEVkaXRvclZpZXcgPyB2aWV3T3JTdGF0ZS5zdGF0ZSA6IHZpZXdPclN0YXRlO1xuXHRjb25zdCBkb2MgPSBzdGF0ZS5kb2M7XG5cdHJldHVybiBkb2Muc2xpY2UocG9zLCBwb3MrMSkudG9TdHJpbmcoKTtcbn1cblxuXG4gXG5jb25zdCBsYW5nSWZXaXRoaW5Db2RlYmxvY2sgPSAoc3RhdGU6IEVkaXRvclN0YXRlKTogc3RyaW5nIHwgbnVsbCA9PiB7XG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcblxuXHRjb25zdCBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XG5cblx0Lypcblx0KiBnZXQgYSB0cmVlIGN1cnNvciBhdCB0aGUgcG9zaXRpb25cblx0KlxuXHQqIEEgbmV3bGluZSBkb2VzIG5vdCBiZWxvbmcgdG8gYW55IHN5bnRheCBub2RlcyBleGNlcHQgZm9yIHRoZSBEb2N1bWVudCxcblx0KiB3aGljaCBjb3JyZXNwb25kcyB0byB0aGUgd2hvbGUgZG9jdW1lbnQuIFNvLCB3ZSBjaGFuZ2UgdGhlIGBtb2RlYCBvZiB0aGVcblx0KiBgY3Vyc29yQXRgIGRlcGVuZGluZyBvbiB3aGV0aGVyIHRoZSBjaGFyYWN0ZXIganVzdCBiZWZvcmUgdGhlIGN1cnNvciBpcyBhXG5cdCogbmV3bGluZS5cblx0Ki9cblx0Y29uc3QgY3Vyc29yID1cblx0XHRwb3MgPT09IDAgfHwgZ2V0Q2hhcmFjdGVyQXRQb3Moc3RhdGUsIHBvcyAtIDEpID09PSBcIlxcblwiXG5cdFx0PyB0cmVlLmN1cnNvckF0KHBvcywgMSlcblx0XHQ6IHRyZWUuY3Vyc29yQXQocG9zLCAtMSk7XG5cblx0Ly8gY2hlY2sgaWYgd2UncmUgaW4gYSBjb2RlYmxvY2sgYXRtIGF0IGFsbFxuXHRjb25zdCBpbkNvZGVibG9jayA9IGN1cnNvci5uYW1lLmNvbnRhaW5zKFwiY29kZWJsb2NrXCIpO1xuXHRpZiAoIWluQ29kZWJsb2NrKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvLyBsb2NhdGUgdGhlIHN0YXJ0IG9mIHRoZSBibG9ja1xuXHRjb25zdCBjb2RlYmxvY2tCZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJIeXBlck1ELWNvZGVibG9ja19IeXBlck1ELWNvZGVibG9jay1iZWdpblwiKTtcblxuXHRpZiAoY29kZWJsb2NrQmVnaW4gPT0gbnVsbCkge1xuXHRcdGNvbnNvbGUud2FybihcInVuYWJsZSB0byBsb2NhdGUgc3RhcnQgb2YgdGhlIGNvZGVibG9jayBldmVuIHRob3VnaCBpbnNpZGUgb25lXCIpO1xuXHRcdHJldHVybiBcIlwiO1xuXHR9XG5cblx0Ly8gZXh0cmFjdCB0aGUgbGFuZ3VhZ2Vcblx0Ly8gY29kZWJsb2NrcyBtYXkgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYmFja3RpY2tzXG5cdGNvbnN0IGxhbmd1YWdlID0gc3RhdGUuc2xpY2VEb2MoY29kZWJsb2NrQmVnaW4uZnJvbSwgY29kZWJsb2NrQmVnaW4udG8pLnJlcGxhY2UoL2ArLywgXCJcIik7XG5cblx0cmV0dXJuIGxhbmd1YWdlO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yOiBUcmVlQ3Vyc29yLCBkaXI6IERpcmVjdGlvbiwgdGFyZ2V0OiBzdHJpbmcpOiBTeW50YXhOb2RlIHwgbnVsbCB7XG5cdC8vIEFsbG93IHRoZSBzdGFydGluZyBub2RlIHRvIGJlIGEgbWF0Y2hcblx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcblx0XHRyZXR1cm4gY3Vyc29yLm5vZGU7XG5cdH1cblxuXHR3aGlsZSAoXG5cdFx0KGN1cnNvci5uYW1lICE9IFwiRG9jdW1lbnRcIikgJiZcblx0XHQoKGRpciA9PSBEaXJlY3Rpb24uQmFja3dhcmQgJiYgY3Vyc29yLnByZXYoKSlcblx0XHR8fCAoZGlyID09IERpcmVjdGlvbi5Gb3J3YXJkICYmIGN1cnNvci5uZXh0KCkpXG5cdFx0fHwgY3Vyc29yLnBhcmVudCgpKVxuXHQpIHtcblx0XHRpZiAoY3Vyc29yLm5hbWUuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZW51bSBEaXJlY3Rpb24ge1xuXHRCYWNrd2FyZCxcblx0Rm9yd2FyZCxcbn0iXX0=