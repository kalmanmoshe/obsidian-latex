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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQ0gsYUFBYSxHQU9mLE1BQU0sVUFBVSxDQUFDO0FBRW5CLE9BQU8sRUFBRSxnQkFBZ0IsRUFBUyxNQUFNLGFBQWEsQ0FBQztBQUN0RCxPQUFPLEVBQUUsVUFBVSxHQUF1QyxNQUFNLGtCQUFrQixDQUFDO0FBQ25GLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUtsRCxNQUFNLGtCQUFrQixHQUFHO0lBQzFCLFdBQVc7SUFDWCxNQUFNO0lBQ04sUUFBUTtDQUNSLENBQUE7QUFFRCxNQUFNLE9BQU8saUJBQWtCLFNBQVEsYUFBcUI7SUFDM0QsTUFBTSxDQUFpQjtJQUV2Qjs7O2tCQUdjO0lBQ04sd0JBQXdCLEdBQVcsQ0FBQyxDQUFDO0lBRTdDOzs7a0JBR2M7SUFDTixvQkFBb0IsR0FBYSxFQUFFLENBQUM7SUFFNUMsbUJBQW1CO0lBQ25CLFlBQVksTUFBc0I7UUFDakMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN0QixDQUFDO0lBRUQsU0FBUyxDQUFDLE1BQXNCLEVBQUUsTUFBYyxFQUFFLElBQVc7UUFFNUQsTUFBTSxRQUFRLEdBQUcsTUFBYSxDQUFDO1FBQy9CLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFFLFFBQVEsQ0FBQyxFQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDOUQsSUFBSSxJQUFJLEtBQUssSUFBSTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQy9CLE1BQU0sYUFBYSxHQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUNyRCxNQUFNLFdBQVcsR0FBQyxhQUFhLEVBQUUsUUFBUSxD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Q0FBTixJQUFZLFNBR1g7QUFIRCxXQUFZLFNBQVM7SUFDcEIsaURBQVEsQ0FBQTtJQUNSLCtDQUFPLENBQUE7QUFDUixDQUFDLEVBSFcsU0FBUyxLQUFULFNBQVMsUUFHcEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTnVtZXJhbHNQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHtcbiAgICBFZGl0b3JTdWdnZXN0LFxuICAgIEVkaXRvclBvc2l0aW9uLFxuICAgIEVkaXRvcixcbiAgICBURmlsZSxcbiAgICBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8sXG4gICAgRWRpdG9yU3VnZ2VzdENvbnRleHQsXG4gICAgc2V0SWNvbixcbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBnZXRNYXRoSnNTeW1ib2xzLCBMYXRleCB9IGZyb20gXCIuL3V0aWxpdGllc1wiO1xuaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1BsdWdpbiwgVmlld1VwZGF0ZSAsRGVjb3JhdGlvbiwgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IFN5bnRheE5vZGUsIFRyZWVDdXJzb3IgfSBmcm9tIFwiQGxlemVyL2NvbW1vblwiO1xuXG5cbmNvbnN0IG51bWVyYWxzRGlyZWN0aXZlcyA9IFtcblx0XCJAaGlkZVJvd3NcIixcblx0XCJAU3VtXCIsXG5cdFwiQFRvdGFsXCIsXG5dXG5cbmV4cG9ydCBjbGFzcyBOdW1lcmFsc1N1Z2dlc3RvciBleHRlbmRzIEVkaXRvclN1Z2dlc3Q8c3RyaW5nPiB7XG5cdHBsdWdpbjogTnVtZXJhbHNQbHVnaW47XG5cdFxuXHQvKipcblx0ICogVGltZSBvZiBsYXN0IHN1Z2dlc3Rpb24gbGlzdCB1cGRhdGVcblx0ICogQHR5cGUge251bWJlcn1cblx0ICogQHByaXZhdGUgKi9cblx0cHJpdmF0ZSBsYXN0U3VnZ2VzdGlvbkxpc3RVcGRhdGU6IG51bWJlciA9IDA7XG5cblx0LyoqXG5cdCAqIExpc3Qgb2YgcG9zc2libGUgc3VnZ2VzdGlvbnMgYmFzZWQgb24gY3VycmVudCBjb2RlIGJsb2NrXG5cdCAqIEB0eXBlIHtzdHJpbmdbXX1cblx0ICogQHByaXZhdGUgKi9cblx0cHJpdmF0ZSBsb2NhbFN1Z2dlc3Rpb25DYWNoZTogc3RyaW5nW10gPSBbXTtcblxuXHQvL2VtcHR5IGNvbnN0cnVjdG9yXG5cdGNvbnN0cnVjdG9yKHBsdWdpbjogTnVtZXJhbHNQbHVnaW4pIHtcblx0XHRzdXBlcihwbHVnaW4uYXBwKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdG9uVHJpZ2dlcihjdXJzb3I6IEVkaXRvclBvc2l0aW9uLCBlZGl0b3I6IEVkaXRvciwgZmlsZTogVEZpbGUpOiBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8gfCBudWxsIHtcblxuXHRcdGNvbnN0IGNtRWRpdG9yID0gZWRpdG9yIGFzIGFueTtcblx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xuXHRcdGlmICh2aWV3ID09PSBudWxsKSByZXR1cm4gbnVsbDtcblx0XHRjb25zdCBjb2RlYmxvY2tMZW5nPWxhbmdJZldpdGhpbkNvZGVibG9jayh2aWV3LnN0YXRlKVxuXHRcdGNvbnN0IGlzTWF0aEJsb2NrPWNvZGVibG9ja0xlbmc/LmNvbnRhaW5zKCd0aWt6JylcblxuXHRcdGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLnJhbmdlc1swXS5mcm9tO1xuXHRcdGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcblx0XHQvL2NvbnN0IGRvbU5vZGUgPSB2aWV3LmRvbUF0UG9zKGxpbmUuZnJvbSkubm9kZTtcblx0XHRpZiAoIWlzTWF0aEJsb2NrKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0XG5cblx0XHQvLyBHZXQgbGFzdCB3b3JkIGluIGN1cnJlbnQgbGluZVxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcykudGV4dDtcblx0XHRjb25zdCBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPSBjdXJyZW50TGluZS5zZWFyY2goL1s6XT9bJEBcXHdcXHUwMzcwLVxcdTAzRkZdKyQvKTtcblx0XHQvLyBpZiB0aGVyZSBpcyBubyB3b3JkLCByZXR1cm4gbnVsbFxuXHRcdGlmIChjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHtsaW5lOiBjdXJzb3IubGluZSwgY2g6IGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydH0sXG5cdFx0XHRlbmQ6IGN1cnNvcixcblx0XHRcdHF1ZXJ5OiBjdXJyZW50TGluZS5zbGljZShjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQpXG5cdFx0fTtcblx0fVxuXG5cdGdldFN1Z2dlc3Rpb25zKGNvbnRleHQ6IEVkaXRvclN1Z2dlc3RDb250ZXh0KTogc3RyaW5nW10gfCBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0bGV0IGxvY2FsU3ltYm9sczogc3RyaW5nIFtdID0gW107XHRcblxuXHRcdGxvY2FsU3ltYm9scyA9IHRoaXMubG9jYWxTdWdnZXN0aW9uQ2FjaGVcblx0XHRjb25zdCBxdWVyeSA9IGNvbnRleHQucXVlcnkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGNvbnN0IGxvY2FsX3N1Z2dlc3Rpb25zID0gbG9jYWxTeW1ib2xzLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDIpKTtcblx0XHRsb2NhbF9zdWdnZXN0aW9ucy5zb3J0KChhLCBiKSA9PiBhLnNsaWNlKDIpLmxvY2FsZUNvbXBhcmUoYi5zbGljZSgyKSkpO1xuXHRcdFxuXHRcdC8vIGNhc2UtaW5zZW5zaXRpdmUgZmlsdGVyIG1hdGhqcyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBxdWVyeS4gRG9uJ3QgcmV0dXJuIHZhbHVlIGlmIGZ1bGwgbWF0Y2hcblx0XHRsZXQgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBtYXRoanNfc3VnZ2VzdGlvbnMgPSBnZXRNYXRoSnNTeW1ib2xzKCkuZmlsdGVyKChvYmo6IExhdGV4KSA9PiBvYmoudmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMikpO1xuXG5cdFx0c3VnZ2VzdGlvbnMgPSBtYXRoanNfc3VnZ2VzdGlvbnMubWFwKChvOkxhdGV4KT0+by52YWx1ZSkvL2xvY2FsX3N1Z2dlc3Rpb25zLmNvbmNhdChtYXRoanNfc3VnZ2VzdGlvbnMpO1xuXG5cdFx0LypzdWdnZXN0aW9ucyA9IHN1Z2dlc3Rpb25zLmNvbmNhdChcblx0XHRcdG51bWVyYWxzRGlyZWN0aXZlc1xuXHRcdFx0XHQuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAwKSlcblx0XHRcdFx0Lm1hcCgodmFsdWUpID0+ICdtfCcgKyB2YWx1ZSlcblx0XHRcdCk7Ki9cblxuXHRcdHJldHVybiBzdWdnZXN0aW9ucztcblx0fVxuXG5cdHJlbmRlclN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc29sZS5sb2codmFsdWUpXG5cdFx0ZWwuYWRkQ2xhc3NlcyhbJ21vZC1jb21wbGV4JywgJ251bWVyYWxzLXN1Z2dlc3Rpb24nXSk7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkNvbnRlbnQgPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tY29udGVudCd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uVGl0bGUgPSBzdWdnZXN0aW9uQ29udGVudC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tdGl0bGUnfSk7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbk5vdGUgPSBzdWdnZXN0aW9uQ29udGVudC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tbm90ZSd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uQXV4ID0gZWwuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWF1eCd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uRmxhaXIgPSBzdWdnZXN0aW9uQXV4LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1mbGFpcid9KTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnNcblx0XHQvKlxuXHRcdGNvbnN0IFtpY29uVHlwZSwgc3VnZ2VzdGlvblRleHQsIG5vdGVUZXh0XSA9IHZhbHVlLnNwbGl0KCd8Jyk7XG5cblx0XHRpZiAoaWNvblR5cGUgPT09ICdmJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdmdW5jdGlvbi1zcXVhcmUnKTtcdFx0XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ2MnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2xvY2F0ZS1maXhlZCcpO1xuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICd2Jykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdmaWxlLWNvZGUnKTtcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAncCcpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnYm94Jyk7XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ20nKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ3NwYXJrbGVzJyk7XHRcdFx0XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ2cnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2Nhc2UtbG93ZXInKTsgLy8gQXNzdW1pbmcgJ3N5bWJvbCcgaXMgYSB2YWxpZCBpY29uIG5hbWVcblx0XHR9XG5cdFx0c3VnZ2VzdGlvblRpdGxlLnNldFRleHQoc3VnZ2VzdGlvblRleHQpO1xuXHRcdGlmIChub3RlVGV4dCkge1xuXHRcdFx0c3VnZ2VzdGlvbk5vdGUuc2V0VGV4dChub3RlVGV4dCk7XG5cdFx0fSovXG5cdFx0c3VnZ2VzdGlvblRpdGxlLnNldFRleHQodmFsdWUpO1xuXG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gYSBzdWdnZXN0aW9uIGlzIHNlbGVjdGVkLiBSZXBsYWNlcyB0aGUgY3VycmVudCB3b3JkIHdpdGggdGhlIHNlbGVjdGVkIHN1Z2dlc3Rpb25cblx0ICogQHBhcmFtIHZhbHVlIFRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXG5cdCAqIEBwYXJhbSBldnQgVGhlIGV2ZW50IHRoYXQgdHJpZ2dlcmVkIHRoZSBzZWxlY3Rpb25cblx0ICogQHJldHVybnMgdm9pZFxuXHQgKi9cblx0c2VsZWN0U3VnZ2VzdGlvbih2YWx1ZTogc3RyaW5nLCBldnQ6IE1vdXNlRXZlbnQgfCBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGV4dCkge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5jb250ZXh0LmVkaXRvcjtcblx0XHRcdGNvbnN0IFtzdWdnZXN0aW9uVHlwZSwgc3VnZ2VzdGlvbl0gPSB2YWx1ZS5zcGxpdCgnfCcpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLmNvbnRleHQuc3RhcnQ7XG5cdFx0XHRjb25zdCBlbmQgPSBlZGl0b3IuZ2V0Q3Vyc29yKCk7IC8vIGdldCBuZXcgZW5kIHBvc2l0aW9uIGluIGNhc2UgY3Vyc29yIGhhcyBtb3ZlZFxuXHRcdFx0XG5cdFx0XHRlZGl0b3IucmVwbGFjZVJhbmdlKHN1Z2dlc3Rpb24sIHN0YXJ0LCBlbmQpO1xuXHRcdFx0Y29uc3QgbmV3Q3Vyc29yID0gZW5kO1xuXG5cdFx0XHRpZiAoc3VnZ2VzdGlvblR5cGUgPT09ICdmJykge1xuXHRcdFx0XHRuZXdDdXJzb3IuY2ggPSBzdGFydC5jaCArIHN1Z2dlc3Rpb24ubGVuZ3RoLTE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdDdXJzb3IuY2ggPSBzdGFydC5jaCArIHN1Z2dlc3Rpb24ubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0ZWRpdG9yLnNldEN1cnNvcihuZXdDdXJzb3IpO1x0XHRcdFxuXG5cdFx0XHR0aGlzLmNsb3NlKClcblx0XHR9XG5cdH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhcmFjdGVyQXRQb3Modmlld09yU3RhdGU6IEVkaXRvclZpZXcgfCBFZGl0b3JTdGF0ZSwgcG9zOiBudW1iZXIpIHtcblx0Y29uc3Qgc3RhdGUgPSB2aWV3T3JTdGF0ZSBpbnN0YW5jZW9mIEVkaXRvclZpZXcgPyB2aWV3T3JTdGF0ZS5zdGF0ZSA6IHZpZXdPclN0YXRlO1xuXHRjb25zdCBkb2MgPSBzdGF0ZS5kb2M7XG5cdHJldHVybiBkb2Muc2xpY2UocG9zLCBwb3MrMSkudG9TdHJpbmcoKTtcbn1cblxuXG4gXG5jb25zdCBsYW5nSWZXaXRoaW5Db2RlYmxvY2sgPSAoc3RhdGU6IEVkaXRvclN0YXRlKTogc3RyaW5nIHwgbnVsbCA9PiB7XG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcblxuXHRjb25zdCBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XG5cblx0Lypcblx0KiBnZXQgYSB0cmVlIGN1cnNvciBhdCB0aGUgcG9zaXRpb25cblx0KlxuXHQqIEEgbmV3bGluZSBkb2VzIG5vdCBiZWxvbmcgdG8gYW55IHN5bnRheCBub2RlcyBleGNlcHQgZm9yIHRoZSBEb2N1bWVudCxcblx0KiB3aGljaCBjb3JyZXNwb25kcyB0byB0aGUgd2hvbGUgZG9jdW1lbnQuIFNvLCB3ZSBjaGFuZ2UgdGhlIGBtb2RlYCBvZiB0aGVcblx0KiBgY3Vyc29yQXRgIGRlcGVuZGluZyBvbiB3aGV0aGVyIHRoZSBjaGFyYWN0ZXIganVzdCBiZWZvcmUgdGhlIGN1cnNvciBpcyBhXG5cdCogbmV3bGluZS5cblx0Ki9cblx0Y29uc3QgY3Vyc29yID1cblx0XHRwb3MgPT09IDAgfHwgZ2V0Q2hhcmFjdGVyQXRQb3Moc3RhdGUsIHBvcyAtIDEpID09PSBcIlxcblwiXG5cdFx0PyB0cmVlLmN1cnNvckF0KHBvcywgMSlcblx0XHQ6IHRyZWUuY3Vyc29yQXQocG9zLCAtMSk7XG5cblx0Ly8gY2hlY2sgaWYgd2UncmUgaW4gYSBjb2RlYmxvY2sgYXRtIGF0IGFsbFxuXHRjb25zdCBpbkNvZGVibG9jayA9IGN1cnNvci5uYW1lLmNvbnRhaW5zKFwiY29kZWJsb2NrXCIpO1xuXHRpZiAoIWluQ29kZWJsb2NrKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvLyBsb2NhdGUgdGhlIHN0YXJ0IG9mIHRoZSBibG9ja1xuXHRjb25zdCBjb2RlYmxvY2tCZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJIeXBlck1ELWNvZGVibG9ja19IeXBlck1ELWNvZGVibG9jay1iZWdpblwiKTtcblxuXHRpZiAoY29kZWJsb2NrQmVnaW4gPT0gbnVsbCkge1xuXHRcdGNvbnNvbGUud2FybihcInVuYWJsZSB0byBsb2NhdGUgc3RhcnQgb2YgdGhlIGNvZGVibG9jayBldmVuIHRob3VnaCBpbnNpZGUgb25lXCIpO1xuXHRcdHJldHVybiBcIlwiO1xuXHR9XG5cblx0Ly8gZXh0cmFjdCB0aGUgbGFuZ3VhZ2Vcblx0Ly8gY29kZWJsb2NrcyBtYXkgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYmFja3RpY2tzXG5cdGNvbnN0IGxhbmd1YWdlID0gc3RhdGUuc2xpY2VEb2MoY29kZWJsb2NrQmVnaW4uZnJvbSwgY29kZWJsb2NrQmVnaW4udG8pLnJlcGxhY2UoL2ArLywgXCJcIik7XG5cblx0cmV0dXJuIGxhbmd1YWdlO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yOiBUcmVlQ3Vyc29yLCBkaXI6IERpcmVjdGlvbiwgdGFyZ2V0OiBzdHJpbmcpOiBTeW50YXhOb2RlIHwgbnVsbCB7XG5cdC8vIEFsbG93IHRoZSBzdGFydGluZyBub2RlIHRvIGJlIGEgbWF0Y2hcblx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcblx0XHRyZXR1cm4gY3Vyc29yLm5vZGU7XG5cdH1cblxuXHR3aGlsZSAoXG5cdFx0KGN1cnNvci5uYW1lICE9IFwiRG9jdW1lbnRcIikgJiZcblx0XHQoKGRpciA9PSBEaXJlY3Rpb24uQmFja3dhcmQgJiYgY3Vyc29yLnByZXYoKSlcblx0XHR8fCAoZGlyID09IERpcmVjdGlvbi5Gb3J3YXJkICYmIGN1cnNvci5uZXh0KCkpXG5cdFx0fHwgY3Vyc29yLnBhcmVudCgpKVxuXHQpIHtcblx0XHRpZiAoY3Vyc29yLm5hbWUuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZW51bSBEaXJlY3Rpb24ge1xuXHRCYWNrd2FyZCxcblx0Rm9yd2FyZCxcbn0iXX0=