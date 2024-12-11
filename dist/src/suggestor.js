import { EditorSuggest, } from "obsidian";
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
        const query = context.query.toLowerCase();
        const local_suggestions = localSymbols.filter((value) => value.slice(0, -1).toLowerCase().startsWith(query, 2));
        local_suggestions.sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
        // case-insensitive filter mathjs suggestions based on query. Don't return value if full match
        let suggestions = [];
        const mathjs_suggestions = getMathJsSymbols().filter((obj) => obj.value.slice(0, -1).toLowerCase().startsWith(query, 2));
        suggestions = mathjs_suggestions.map((o) => o.value); //local_suggestions.concat(mathjs_suggestions);
        /*suggestions = suggestions.concat(
            numeralsDirectives
                .filter((value) => value.slice(0,-1).toLowerCase().startsWith(query, 0))
                .map((value) => 'm|' + value)
            );*/
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
        }*/
        suggestionTitle.setText(value);
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
            // Assume editor is an instance with a cm property for CodeMirror
            const cmEditor = editor;
            const view = cmEditor.cm ? cmEditor.cm : null;
            if (view === null)
                return;
            // Get current cursor position
            const cursor = view.state.selection.main;
            const from = cursor.from; // Starting position of the current selection
            const to = cursor.to; // Ending position of the current selection
            view.dispatch({
                changes: { from, to, insert: value },
                selection: { anchor: from + value.length } // Place the cursor at the end of the inserted value
            });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQ0gsYUFBYSxHQU9mLE1BQU0sVUFBVSxDQUFDO0FBRW5CLE9BQU8sRUFBRSxnQkFBZ0IsRUFBUyxNQUFNLGFBQWEsQ0FBQztBQUN0RCxPQUFPLEVBQUUsVUFBVSxHQUF1QyxNQUFNLGtCQUFrQixDQUFDO0FBQ25GLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUtsRCxNQUFNLGtCQUFrQixHQUFHO0lBQzFCLFdBQVc7SUFDWCxNQUFNO0lBQ04sUUFBUTtDQUNSLENBQUE7QUFFRCxNQUFNLE9BQU8saUJBQWtCLFNBQVEsYUFBcUI7SUFDM0QsTUFBTSxDQUFpQjtJQUV2Qjs7O2tCQUdjO0lBQ04sd0JBQXdCLEdBQVcsQ0FBQyxDQUFDO0lBRTdDOzs7a0JBR2M7SUFDTixvQkFBb0IsR0FBYSxFQUFFLENBQUM7SUFFNUMsbUJBQW1CO0lBQ25CLFlBQVksTUFBc0I7UUFDakMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN0QixDQUFDO0lBRUQsU0FBUyxDQUFDLE1BQXNCLEVBQUUsTUFBYyxFQUFFLElBQVc7UUFFNUQsTUFBTSxRQUFRLEdBQUcsTUFBYSxDQUFDO1FBQy9CLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFFLFFBQVEsQ0FBQyxFQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDOUQsSUFBSSxJQUFJLEtBQUssSUFBSTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQy9CLE1BQU0sYUFBYSxHQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUNyRCxNQUFNLFdBQVcsR0FBQyxhQUFhLEVBQUUsUUFBUSxD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QUFDYixDQUFDO0FBRUQsTUFBTSxDQUFOLElBQVksU0FHWDtBQUhELFdBQVksU0FBUztJQUNwQixpREFBUSxDQUFBO0lBQ1IsK0NBQU8sQ0FBQTtBQUNSLENBQUMsRUFIVyxTQUFTLEtBQVQsU0FBUyxRQUdwQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBOdW1lcmFsc1BsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQge1xuICAgIEVkaXRvclN1Z2dlc3QsXG4gICAgRWRpdG9yUG9zaXRpb24sXG4gICAgRWRpdG9yLFxuICAgIFRGaWxlLFxuICAgIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbyxcbiAgICBFZGl0b3JTdWdnZXN0Q29udGV4dCxcbiAgICBzZXRJY29uLFxuIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGdldE1hdGhKc1N5bWJvbHMsIExhdGV4IH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3UGx1Z2luLCBWaWV3VXBkYXRlICxEZWNvcmF0aW9uLCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgU3ludGF4Tm9kZSwgVHJlZUN1cnNvciB9IGZyb20gXCJAbGV6ZXIvY29tbW9uXCI7XG5cblxuY29uc3QgbnVtZXJhbHNEaXJlY3RpdmVzID0gW1xuXHRcIkBoaWRlUm93c1wiLFxuXHRcIkBTdW1cIixcblx0XCJAVG90YWxcIixcbl1cblxuZXhwb3J0IGNsYXNzIE51bWVyYWxzU3VnZ2VzdG9yIGV4dGVuZHMgRWRpdG9yU3VnZ2VzdDxzdHJpbmc+IHtcblx0cGx1Z2luOiBOdW1lcmFsc1BsdWdpbjtcblx0XG5cdC8qKlxuXHQgKiBUaW1lIG9mIGxhc3Qgc3VnZ2VzdGlvbiBsaXN0IHVwZGF0ZVxuXHQgKiBAdHlwZSB7bnVtYmVyfVxuXHQgKiBAcHJpdmF0ZSAqL1xuXHRwcml2YXRlIGxhc3RTdWdnZXN0aW9uTGlzdFVwZGF0ZTogbnVtYmVyID0gMDtcblxuXHQvKipcblx0ICogTGlzdCBvZiBwb3NzaWJsZSBzdWdnZXN0aW9ucyBiYXNlZCBvbiBjdXJyZW50IGNvZGUgYmxvY2tcblx0ICogQHR5cGUge3N0cmluZ1tdfVxuXHQgKiBAcHJpdmF0ZSAqL1xuXHRwcml2YXRlIGxvY2FsU3VnZ2VzdGlvbkNhY2hlOiBzdHJpbmdbXSA9IFtdO1xuXG5cdC8vZW1wdHkgY29uc3RydWN0b3Jcblx0Y29uc3RydWN0b3IocGx1Z2luOiBOdW1lcmFsc1BsdWdpbikge1xuXHRcdHN1cGVyKHBsdWdpbi5hcHApO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0b25UcmlnZ2VyKGN1cnNvcjogRWRpdG9yUG9zaXRpb24sIGVkaXRvcjogRWRpdG9yLCBmaWxlOiBURmlsZSk6IEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbyB8IG51bGwge1xuXG5cdFx0Y29uc3QgY21FZGl0b3IgPSBlZGl0b3IgYXMgYW55O1xuXHRcdGNvbnN0IHZpZXcgPSBjbUVkaXRvci5jbSA/IChjbUVkaXRvci5jbSBhcyBFZGl0b3JWaWV3KSA6IG51bGw7XG5cdFx0aWYgKHZpZXcgPT09IG51bGwpIHJldHVybiBudWxsO1xuXHRcdGNvbnN0IGNvZGVibG9ja0xlbmc9bGFuZ0lmV2l0aGluQ29kZWJsb2NrKHZpZXcuc3RhdGUpXG5cdFx0Y29uc3QgaXNNYXRoQmxvY2s9Y29kZWJsb2NrTGVuZz8uY29udGFpbnMoJ3Rpa3onKVxuXG5cdFx0Y29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XG5cdFx0Y29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuXHRcdC8vY29uc3QgZG9tTm9kZSA9IHZpZXcuZG9tQXRQb3MobGluZS5mcm9tKS5ub2RlO1xuXHRcdGlmICghaXNNYXRoQmxvY2spIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRcblxuXHRcdC8vIEdldCBsYXN0IHdvcmQgaW4gY3VycmVudCBsaW5lXG5cdFx0Y29uc3QgY3VycmVudExpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKS50ZXh0O1xuXHRcdGNvbnN0IGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydCA9IGN1cnJlbnRMaW5lLnNlYXJjaCgvWzpdP1skQFxcd1xcdTAzNzAtXFx1MDNGRl0rJC8pO1xuXHRcdC8vIGlmIHRoZXJlIGlzIG5vIHdvcmQsIHJldHVybiBudWxsXG5cdFx0aWYgKGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydDoge2xpbmU6IGN1cnNvci5saW5lLCBjaDogY3VycmVudExpbmVMYXN0V29yZFN0YXJ0fSxcblx0XHRcdGVuZDogY3Vyc29yLFxuXHRcdFx0cXVlcnk6IGN1cnJlbnRMaW5lLnNsaWNlKGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydClcblx0XHR9O1xuXHR9XG5cblx0Z2V0U3VnZ2VzdGlvbnMoY29udGV4dDogRWRpdG9yU3VnZ2VzdENvbnRleHQpOiBzdHJpbmdbXSB8IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRsZXQgbG9jYWxTeW1ib2xzOiBzdHJpbmcgW10gPSBbXTtcdFxuXG5cdFx0bG9jYWxTeW1ib2xzID0gdGhpcy5sb2NhbFN1Z2dlc3Rpb25DYWNoZVxuXHRcdGNvbnN0IHF1ZXJ5ID0gY29udGV4dC5xdWVyeS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0Y29uc3QgbG9jYWxfc3VnZ2VzdGlvbnMgPSBsb2NhbFN5bWJvbHMuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMikpO1xuXHRcdGxvY2FsX3N1Z2dlc3Rpb25zLnNvcnQoKGEsIGIpID0+IGEuc2xpY2UoMikubG9jYWxlQ29tcGFyZShiLnNsaWNlKDIpKSk7XG5cdFx0XG5cdFx0Ly8gY2FzZS1pbnNlbnNpdGl2ZSBmaWx0ZXIgbWF0aGpzIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIHF1ZXJ5LiBEb24ndCByZXR1cm4gdmFsdWUgaWYgZnVsbCBtYXRjaFxuXHRcdGxldCBzdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IG1hdGhqc19zdWdnZXN0aW9ucyA9IGdldE1hdGhKc1N5bWJvbHMoKS5maWx0ZXIoKG9iajogTGF0ZXgpID0+IG9iai52YWx1ZS5zbGljZSgwLCAtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAyKSk7XG5cblx0XHRzdWdnZXN0aW9ucyA9IG1hdGhqc19zdWdnZXN0aW9ucy5tYXAoKG86TGF0ZXgpPT5vLnZhbHVlKS8vbG9jYWxfc3VnZ2VzdGlvbnMuY29uY2F0KG1hdGhqc19zdWdnZXN0aW9ucyk7XG5cblx0XHQvKnN1Z2dlc3Rpb25zID0gc3VnZ2VzdGlvbnMuY29uY2F0KFxuXHRcdFx0bnVtZXJhbHNEaXJlY3RpdmVzXG5cdFx0XHRcdC5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5zbGljZSgwLC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDApKVxuXHRcdFx0XHQubWFwKCh2YWx1ZSkgPT4gJ218JyArIHZhbHVlKVxuXHRcdFx0KTsqL1xuXG5cdFx0cmV0dXJuIHN1Z2dlc3Rpb25zO1xuXHR9XG5cblx0cmVuZGVyU3VnZ2VzdGlvbih2YWx1ZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zb2xlLmxvZyh2YWx1ZSlcblx0XHRlbC5hZGRDbGFzc2VzKFsnbW9kLWNvbXBsZXgnLCAnbnVtZXJhbHMtc3VnZ2VzdGlvbiddKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uQ29udGVudCA9IGVsLmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1jb250ZW50J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25UaXRsZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi10aXRsZSd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uTm90ZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1ub3RlJ30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25BdXggPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tYXV4J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25GbGFpciA9IHN1Z2dlc3Rpb25BdXguY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWZsYWlyJ30pO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby11bnVzZWQtdmFyc1xuXHRcdC8qXG5cdFx0Y29uc3QgW2ljb25UeXBlLCBzdWdnZXN0aW9uVGV4dCwgbm90ZVRleHRdID0gdmFsdWUuc3BsaXQoJ3wnKTtcblxuXHRcdGlmIChpY29uVHlwZSA9PT0gJ2YnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2Z1bmN0aW9uLXNxdWFyZScpO1x0XHRcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAnYycpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnbG9jYXRlLWZpeGVkJyk7XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ3YnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2ZpbGUtY29kZScpO1xuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdwJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdib3gnKTtcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAnbScpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnc3BhcmtsZXMnKTtcdFx0XHRcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAnZycpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnY2FzZS1sb3dlcicpOyAvLyBBc3N1bWluZyAnc3ltYm9sJyBpcyBhIHZhbGlkIGljb24gbmFtZVxuXHRcdH1cblx0XHRzdWdnZXN0aW9uVGl0bGUuc2V0VGV4dChzdWdnZXN0aW9uVGV4dCk7XG5cdFx0aWYgKG5vdGVUZXh0KSB7XG5cdFx0XHRzdWdnZXN0aW9uTm90ZS5zZXRUZXh0KG5vdGVUZXh0KTtcblx0XHR9Ki9cblx0XHRzdWdnZXN0aW9uVGl0bGUuc2V0VGV4dCh2YWx1ZSk7XG5cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiBhIHN1Z2dlc3Rpb24gaXMgc2VsZWN0ZWQuIFJlcGxhY2VzIHRoZSBjdXJyZW50IHdvcmQgd2l0aCB0aGUgc2VsZWN0ZWQgc3VnZ2VzdGlvblxuXHQgKiBAcGFyYW0gdmFsdWUgVGhlIHNlbGVjdGVkIHN1Z2dlc3Rpb25cblx0ICogQHBhcmFtIGV2dCBUaGUgZXZlbnQgdGhhdCB0cmlnZ2VyZWQgdGhlIHNlbGVjdGlvblxuXHQgKiBAcmV0dXJucyB2b2lkXG5cdCAqL1xuXHRzZWxlY3RTdWdnZXN0aW9uKHZhbHVlOiBzdHJpbmcsIGV2dDogTW91c2VFdmVudCB8IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250ZXh0KSB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmNvbnRleHQuZWRpdG9yO1xuXHRcblx0XHRcdC8vIEFzc3VtZSBlZGl0b3IgaXMgYW4gaW5zdGFuY2Ugd2l0aCBhIGNtIHByb3BlcnR5IGZvciBDb2RlTWlycm9yXG5cdFx0XHRjb25zdCBjbUVkaXRvciA9IGVkaXRvciBhcyBhbnk7XG5cdFx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xuXHRcdFx0aWYgKHZpZXcgPT09IG51bGwpIHJldHVybjtcblx0XG5cdFx0XHQvLyBHZXQgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblx0XHRcdGNvbnN0IGN1cnNvciA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW47XG5cdFx0XHRjb25zdCBmcm9tID0gY3Vyc29yLmZyb207IC8vIFN0YXJ0aW5nIHBvc2l0aW9uIG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvblxuXHRcdFx0Y29uc3QgdG8gPSBjdXJzb3IudG87ICAgLy8gRW5kaW5nIHBvc2l0aW9uIG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvblxuXHRcblx0XHRcdHZpZXcuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFuZ2VzOiB7IGZyb20sIHRvLCBpbnNlcnQ6IHZhbHVlIH0sIC8vIFJlcGxhY2Ugc2VsZWN0ZWQgdGV4dCB3aXRoIHRoZSB2YWx1ZVxuXHRcdFx0XHRzZWxlY3Rpb246IHsgYW5jaG9yOiBmcm9tICsgdmFsdWUubGVuZ3RoIH0gLy8gUGxhY2UgdGhlIGN1cnNvciBhdCB0aGUgZW5kIG9mIHRoZSBpbnNlcnRlZCB2YWx1ZVxuXHRcdFx0fSk7XG5cdFxuXHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdH1cblx0fVxuXHRcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhcmFjdGVyQXRQb3Modmlld09yU3RhdGU6IEVkaXRvclZpZXcgfCBFZGl0b3JTdGF0ZSwgcG9zOiBudW1iZXIpIHtcblx0Y29uc3Qgc3RhdGUgPSB2aWV3T3JTdGF0ZSBpbnN0YW5jZW9mIEVkaXRvclZpZXcgPyB2aWV3T3JTdGF0ZS5zdGF0ZSA6IHZpZXdPclN0YXRlO1xuXHRjb25zdCBkb2MgPSBzdGF0ZS5kb2M7XG5cdHJldHVybiBkb2Muc2xpY2UocG9zLCBwb3MrMSkudG9TdHJpbmcoKTtcbn1cblxuXG4gXG5jb25zdCBsYW5nSWZXaXRoaW5Db2RlYmxvY2sgPSAoc3RhdGU6IEVkaXRvclN0YXRlKTogc3RyaW5nIHwgbnVsbCA9PiB7XG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcblxuXHRjb25zdCBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XG5cblx0Lypcblx0KiBnZXQgYSB0cmVlIGN1cnNvciBhdCB0aGUgcG9zaXRpb25cblx0KlxuXHQqIEEgbmV3bGluZSBkb2VzIG5vdCBiZWxvbmcgdG8gYW55IHN5bnRheCBub2RlcyBleGNlcHQgZm9yIHRoZSBEb2N1bWVudCxcblx0KiB3aGljaCBjb3JyZXNwb25kcyB0byB0aGUgd2hvbGUgZG9jdW1lbnQuIFNvLCB3ZSBjaGFuZ2UgdGhlIGBtb2RlYCBvZiB0aGVcblx0KiBgY3Vyc29yQXRgIGRlcGVuZGluZyBvbiB3aGV0aGVyIHRoZSBjaGFyYWN0ZXIganVzdCBiZWZvcmUgdGhlIGN1cnNvciBpcyBhXG5cdCogbmV3bGluZS5cblx0Ki9cblx0Y29uc3QgY3Vyc29yID1cblx0XHRwb3MgPT09IDAgfHwgZ2V0Q2hhcmFjdGVyQXRQb3Moc3RhdGUsIHBvcyAtIDEpID09PSBcIlxcblwiXG5cdFx0PyB0cmVlLmN1cnNvckF0KHBvcywgMSlcblx0XHQ6IHRyZWUuY3Vyc29yQXQocG9zLCAtMSk7XG5cblx0Ly8gY2hlY2sgaWYgd2UncmUgaW4gYSBjb2RlYmxvY2sgYXRtIGF0IGFsbFxuXHRjb25zdCBpbkNvZGVibG9jayA9IGN1cnNvci5uYW1lLmNvbnRhaW5zKFwiY29kZWJsb2NrXCIpO1xuXHRpZiAoIWluQ29kZWJsb2NrKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvLyBsb2NhdGUgdGhlIHN0YXJ0IG9mIHRoZSBibG9ja1xuXHRjb25zdCBjb2RlYmxvY2tCZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJIeXBlck1ELWNvZGVibG9ja19IeXBlck1ELWNvZGVibG9jay1iZWdpblwiKTtcblxuXHRpZiAoY29kZWJsb2NrQmVnaW4gPT0gbnVsbCkge1xuXHRcdGNvbnNvbGUud2FybihcInVuYWJsZSB0byBsb2NhdGUgc3RhcnQgb2YgdGhlIGNvZGVibG9jayBldmVuIHRob3VnaCBpbnNpZGUgb25lXCIpO1xuXHRcdHJldHVybiBcIlwiO1xuXHR9XG5cblx0Ly8gZXh0cmFjdCB0aGUgbGFuZ3VhZ2Vcblx0Ly8gY29kZWJsb2NrcyBtYXkgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYmFja3RpY2tzXG5cdGNvbnN0IGxhbmd1YWdlID0gc3RhdGUuc2xpY2VEb2MoY29kZWJsb2NrQmVnaW4uZnJvbSwgY29kZWJsb2NrQmVnaW4udG8pLnJlcGxhY2UoL2ArLywgXCJcIik7XG5cblx0cmV0dXJuIGxhbmd1YWdlO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yOiBUcmVlQ3Vyc29yLCBkaXI6IERpcmVjdGlvbiwgdGFyZ2V0OiBzdHJpbmcpOiBTeW50YXhOb2RlIHwgbnVsbCB7XG5cdC8vIEFsbG93IHRoZSBzdGFydGluZyBub2RlIHRvIGJlIGEgbWF0Y2hcblx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcblx0XHRyZXR1cm4gY3Vyc29yLm5vZGU7XG5cdH1cblxuXHR3aGlsZSAoXG5cdFx0KGN1cnNvci5uYW1lICE9IFwiRG9jdW1lbnRcIikgJiZcblx0XHQoKGRpciA9PSBEaXJlY3Rpb24uQmFja3dhcmQgJiYgY3Vyc29yLnByZXYoKSlcblx0XHR8fCAoZGlyID09IERpcmVjdGlvbi5Gb3J3YXJkICYmIGN1cnNvci5uZXh0KCkpXG5cdFx0fHwgY3Vyc29yLnBhcmVudCgpKVxuXHQpIHtcblx0XHRpZiAoY3Vyc29yLm5hbWUuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZW51bSBEaXJlY3Rpb24ge1xuXHRCYWNrd2FyZCxcblx0Rm9yd2FyZCxcbn0iXX0=