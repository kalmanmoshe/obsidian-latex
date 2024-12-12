import { EditorSuggest, Editor, } from "obsidian";
import { getMathJsSymbols } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
const numeralsDirectives = [
    "@hideRows",
    "@Sum",
    "@Total",
];
export class Suggestor {
    monitor() {
        const cmEditor = Editor;
        const view = cmEditor.cm ? cmEditor.cm : null;
        if (view === null)
            return;
        view.dom.addEventListener("keydown", this.onKeydown.bind(this));
    }
    onKeydown(event) {
        // Log key presses to the console
        console.log("Key pressed:", event.key);
    }
}
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
        el.setText(value); /*
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
        }*/
        //suggestionTitle.setText(value);
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
            const cmEditor = editor;
            const view = cmEditor.cm ? cmEditor.cm : null;
            if (view === null)
                return;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQ0gsYUFBYSxFQUViLE1BQU0sR0FLUixNQUFNLFVBQVUsQ0FBQztBQUVuQixPQUFPLEVBQUUsZ0JBQWdCLEVBQVMsTUFBTSxhQUFhLENBQUM7QUFDdEQsT0FBTyxFQUFFLFVBQVUsR0FBdUMsTUFBTSxrQkFBa0IsQ0FBQztBQUNuRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFLbEQsTUFBTSxrQkFBa0IsR0FBRztJQUMxQixXQUFXO0lBQ1gsTUFBTTtJQUNOLFFBQVE7Q0FDUixDQUFBO0FBR0QsTUFBTSxPQUFPLFNBQVM7SUFFckIsT0FBTztRQUNOLE1BQU0sUUFBUSxHQUFHLE1BQWEsQ0FBQztRQUMvQixNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBRSxRQUFRLENBQUMsRUFBaUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQzlELElBQUksSUFBSSxLQUFLLElBQUk7WUFBRSxPQUFPO1FBQzFCLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDakUsQ0FBQztJQUVPLFNBQVMsQ0FBQyxLQUFvQjtRQUNyQyxpQ0FBaUM7UUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7Q0FDRDtBQUlELE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxhQUFxQjtJQUMzRCxNQUFNLENBQWlCO0lBRXZCOzs7a0JBR2M7SUFDTix3QkFBd0IsR0FBVyxDQUFDLENBQUM7SUFFN0M7OztrQkFHYztJQUNOLG9CQUFvQixHQUFhLEVBQUUsQ0FBQztJQUU1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UUFHcEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTnVtZXJhbHNQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHtcbiAgICBFZGl0b3JTdWdnZXN0LFxuICAgIEVkaXRvclBvc2l0aW9uLFxuICAgIEVkaXRvcixcbiAgICBURmlsZSxcbiAgICBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8sXG4gICAgRWRpdG9yU3VnZ2VzdENvbnRleHQsXG4gICAgc2V0SWNvbixcbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBnZXRNYXRoSnNTeW1ib2xzLCBMYXRleCB9IGZyb20gXCIuL3V0aWxpdGllc1wiO1xuaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1BsdWdpbiwgVmlld1VwZGF0ZSAsRGVjb3JhdGlvbiwgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IFN5bnRheE5vZGUsIFRyZWVDdXJzb3IgfSBmcm9tIFwiQGxlemVyL2NvbW1vblwiO1xuXG5cbmNvbnN0IG51bWVyYWxzRGlyZWN0aXZlcyA9IFtcblx0XCJAaGlkZVJvd3NcIixcblx0XCJAU3VtXCIsXG5cdFwiQFRvdGFsXCIsXG5dXG5cblxuZXhwb3J0IGNsYXNzIFN1Z2dlc3RvciB7XG5cblx0bW9uaXRvcigpIHtcblx0XHRjb25zdCBjbUVkaXRvciA9IEVkaXRvciBhcyBhbnk7XG5cdFx0Y29uc3QgdmlldyA9IGNtRWRpdG9yLmNtID8gKGNtRWRpdG9yLmNtIGFzIEVkaXRvclZpZXcpIDogbnVsbDtcblx0XHRpZiAodmlldyA9PT0gbnVsbCkgcmV0dXJuO1xuXHRcdHZpZXcuZG9tLmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIHRoaXMub25LZXlkb3duLmJpbmQodGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbktleWRvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcblx0XHQvLyBMb2cga2V5IHByZXNzZXMgdG8gdGhlIGNvbnNvbGVcblx0XHRjb25zb2xlLmxvZyhcIktleSBwcmVzc2VkOlwiLCBldmVudC5rZXkpO1xuXHR9XG59XG5cblxuXG5leHBvcnQgY2xhc3MgTnVtZXJhbHNTdWdnZXN0b3IgZXh0ZW5kcyBFZGl0b3JTdWdnZXN0PHN0cmluZz4ge1xuXHRwbHVnaW46IE51bWVyYWxzUGx1Z2luO1xuXHRcblx0LyoqXG5cdCAqIFRpbWUgb2YgbGFzdCBzdWdnZXN0aW9uIGxpc3QgdXBkYXRlXG5cdCAqIEB0eXBlIHtudW1iZXJ9XG5cdCAqIEBwcml2YXRlICovXG5cdHByaXZhdGUgbGFzdFN1Z2dlc3Rpb25MaXN0VXBkYXRlOiBudW1iZXIgPSAwO1xuXG5cdC8qKlxuXHQgKiBMaXN0IG9mIHBvc3NpYmxlIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIGN1cnJlbnQgY29kZSBibG9ja1xuXHQgKiBAdHlwZSB7c3RyaW5nW119XG5cdCAqIEBwcml2YXRlICovXG5cdHByaXZhdGUgbG9jYWxTdWdnZXN0aW9uQ2FjaGU6IHN0cmluZ1tdID0gW107XG5cblx0Ly9lbXB0eSBjb25zdHJ1Y3RvclxuXHRjb25zdHJ1Y3RvcihwbHVnaW46IE51bWVyYWxzUGx1Z2luKSB7XG5cdFx0c3VwZXIocGx1Z2luLmFwcCk7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRvblRyaWdnZXIoY3Vyc29yOiBFZGl0b3JQb3NpdGlvbiwgZWRpdG9yOiBFZGl0b3IsIGZpbGU6IFRGaWxlKTogRWRpdG9yU3VnZ2VzdFRyaWdnZXJJbmZvIHwgbnVsbCB7XG5cblx0XHRjb25zdCBjbUVkaXRvciA9IGVkaXRvciBhcyBhbnk7XG5cdFx0Y29uc3QgdmlldyA9IGNtRWRpdG9yLmNtID8gKGNtRWRpdG9yLmNtIGFzIEVkaXRvclZpZXcpIDogbnVsbDtcblx0XHRpZiAodmlldyA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG5cdFx0Y29uc3QgY29kZWJsb2NrTGVuZz1sYW5nSWZXaXRoaW5Db2RlYmxvY2sodmlldy5zdGF0ZSlcblx0XHRjb25zdCBpc01hdGhCbG9jaz1jb2RlYmxvY2tMZW5nPy5jb250YWlucygndGlreicpXG5cblx0XHRjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5yYW5nZXNbMF0uZnJvbTtcblx0XHRjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG5cdFx0Ly9jb25zdCBkb21Ob2RlID0gdmlldy5kb21BdFBvcyhsaW5lLmZyb20pLm5vZGU7XG5cdFx0aWYgKCFpc01hdGhCbG9jaykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdFxuXG5cdFx0Ly8gR2V0IGxhc3Qgd29yZCBpbiBjdXJyZW50IGxpbmVcblx0XHRjb25zdCBjdXJyZW50TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpLnRleHQ7XG5cdFx0Y29uc3QgY3VycmVudExpbmVMYXN0V29yZFN0YXJ0ID0gY3VycmVudExpbmUuc2VhcmNoKC9bOl0/WyRAXFx3XFx1MDM3MC1cXHUwM0ZGXSskLyk7XG5cdFx0Ly8gaWYgdGhlcmUgaXMgbm8gd29yZCwgcmV0dXJuIG51bGxcblx0XHRpZiAoY3VycmVudExpbmVMYXN0V29yZFN0YXJ0ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0OiB7bGluZTogY3Vyc29yLmxpbmUsIGNoOiBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnR9LFxuXHRcdFx0ZW5kOiBjdXJzb3IsXG5cdFx0XHRxdWVyeTogY3VycmVudExpbmUuc2xpY2UoY3VycmVudExpbmVMYXN0V29yZFN0YXJ0KVxuXHRcdH07XG5cdH1cblxuXHRnZXRTdWdnZXN0aW9ucyhjb250ZXh0OiBFZGl0b3JTdWdnZXN0Q29udGV4dCk6IHN0cmluZ1tdIHwgUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGxldCBsb2NhbFN5bWJvbHM6IHN0cmluZyBbXSA9IFtdO1x0XG5cblx0XHRsb2NhbFN5bWJvbHMgPSB0aGlzLmxvY2FsU3VnZ2VzdGlvbkNhY2hlXG5cdFx0Y29uc3QgcXVlcnkgPSBjb250ZXh0LnF1ZXJ5LnRvTG93ZXJDYXNlKCk7XG5cblx0XHRjb25zdCBsb2NhbF9zdWdnZXN0aW9ucyA9IGxvY2FsU3ltYm9scy5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5zbGljZSgwLCAtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5LCAyKSk7XG5cdFx0bG9jYWxfc3VnZ2VzdGlvbnMuc29ydCgoYSwgYikgPT4gYS5zbGljZSgyKS5sb2NhbGVDb21wYXJlKGIuc2xpY2UoMikpKTtcblx0XHRcblx0XHQvLyBjYXNlLWluc2Vuc2l0aXZlIGZpbHRlciBtYXRoanMgc3VnZ2VzdGlvbnMgYmFzZWQgb24gcXVlcnkuIERvbid0IHJldHVybiB2YWx1ZSBpZiBmdWxsIG1hdGNoXG5cdFx0bGV0IHN1Z2dlc3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3QgbWF0aGpzX3N1Z2dlc3Rpb25zID0gZ2V0TWF0aEpzU3ltYm9scygpLmZpbHRlcigob2JqOiBMYXRleCkgPT4gb2JqLnZhbHVlLnNsaWNlKDAsIC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnksIDIpKTtcblxuXHRcdHN1Z2dlc3Rpb25zID0gbWF0aGpzX3N1Z2dlc3Rpb25zLm1hcCgobzpMYXRleCk9Pm8udmFsdWUpLy9sb2NhbF9zdWdnZXN0aW9ucy5jb25jYXQobWF0aGpzX3N1Z2dlc3Rpb25zKTtcblxuXHRcdC8qc3VnZ2VzdGlvbnMgPSBzdWdnZXN0aW9ucy5jb25jYXQoXG5cdFx0XHRudW1lcmFsc0RpcmVjdGl2ZXNcblx0XHRcdFx0LmZpbHRlcigodmFsdWUpID0+IHZhbHVlLnNsaWNlKDAsLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeSwgMCkpXG5cdFx0XHRcdC5tYXAoKHZhbHVlKSA9PiAnbXwnICsgdmFsdWUpXG5cdFx0XHQpOyovXG5cblx0XHRyZXR1cm4gc3VnZ2VzdGlvbnM7XG5cdH1cblxuXHRyZW5kZXJTdWdnZXN0aW9uKHZhbHVlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGVsLnNldFRleHQodmFsdWUpLypcblx0XHRlbC5hZGRDbGFzc2VzKFsnbW9kLWNvbXBsZXgnLCAnbnVtZXJhbHMtc3VnZ2VzdGlvbiddKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uQ29udGVudCA9IGVsLmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1jb250ZW50J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25UaXRsZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi10aXRsZSd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uTm90ZSA9IHN1Z2dlc3Rpb25Db250ZW50LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1ub3RlJ30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25BdXggPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tYXV4J30pO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25GbGFpciA9IHN1Z2dlc3Rpb25BdXguY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWZsYWlyJ30pOyovXG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXVudXNlZC12YXJzXG5cdFx0Lypcblx0XHRjb25zdCBbaWNvblR5cGUsIHN1Z2dlc3Rpb25UZXh0LCBub3RlVGV4dF0gPSB2YWx1ZS5zcGxpdCgnfCcpO1xuXG5cdFx0aWYgKGljb25UeXBlID09PSAnZicpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZnVuY3Rpb24tc3F1YXJlJyk7XHRcdFxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdjJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdsb2NhdGUtZml4ZWQnKTtcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAndicpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZmlsZS1jb2RlJyk7XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ3AnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2JveCcpO1xuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdtJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdzcGFya2xlcycpO1x0XHRcdFxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdnJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdjYXNlLWxvd2VyJyk7IC8vIEFzc3VtaW5nICdzeW1ib2wnIGlzIGEgdmFsaWQgaWNvbiBuYW1lXG5cdFx0fVxuXHRcdHN1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHN1Z2dlc3Rpb25UZXh0KTtcblx0XHRpZiAobm90ZVRleHQpIHtcblx0XHRcdHN1Z2dlc3Rpb25Ob3RlLnNldFRleHQobm90ZVRleHQpO1xuXHRcdH0qL1xuXHRcdC8vc3VnZ2VzdGlvblRpdGxlLnNldFRleHQodmFsdWUpO1xuXG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gYSBzdWdnZXN0aW9uIGlzIHNlbGVjdGVkLiBSZXBsYWNlcyB0aGUgY3VycmVudCB3b3JkIHdpdGggdGhlIHNlbGVjdGVkIHN1Z2dlc3Rpb25cblx0ICogQHBhcmFtIHZhbHVlIFRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXG5cdCAqIEBwYXJhbSBldnQgVGhlIGV2ZW50IHRoYXQgdHJpZ2dlcmVkIHRoZSBzZWxlY3Rpb25cblx0ICogQHJldHVybnMgdm9pZFxuXHQgKi9cblxuXHRzZWxlY3RTdWdnZXN0aW9uKHZhbHVlOiBzdHJpbmcsIGV2dDogTW91c2VFdmVudCB8IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250ZXh0KSB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmNvbnRleHQuZWRpdG9yO1xuXHRcdFx0XG5cdFx0XHRjb25zdCBjbUVkaXRvciA9IGVkaXRvciBhcyBhbnk7XG5cdFx0XHRjb25zdCB2aWV3ID0gY21FZGl0b3IuY20gPyAoY21FZGl0b3IuY20gYXMgRWRpdG9yVmlldykgOiBudWxsO1xuXHRcdFx0aWYgKHZpZXcgPT09IG51bGwpIHJldHVybjtcblx0XG5cdFx0XHRjb25zdCBjdXJzb3IgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluO1xuXHRcdFx0Y29uc3QgZnJvbSA9IGN1cnNvci5mcm9tO1xuXHRcdFx0Y29uc3QgdG8gPSBjdXJzb3IudG87IFxuXHRcblx0XHRcdHZpZXcuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFuZ2VzOiB7IGZyb20sIHRvLCBpbnNlcnQ6IHZhbHVlIH0sXG5cdFx0XHRcdHNlbGVjdGlvbjogeyBhbmNob3I6IGZyb20gKyB2YWx1ZS5sZW5ndGggfVxuXHRcdFx0fSk7XG5cdFx0XHRcblx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhcmFjdGVyQXRQb3Modmlld09yU3RhdGU6IEVkaXRvclZpZXcgfCBFZGl0b3JTdGF0ZSwgcG9zOiBudW1iZXIpIHtcblx0Y29uc3Qgc3RhdGUgPSB2aWV3T3JTdGF0ZSBpbnN0YW5jZW9mIEVkaXRvclZpZXcgPyB2aWV3T3JTdGF0ZS5zdGF0ZSA6IHZpZXdPclN0YXRlO1xuXHRjb25zdCBkb2MgPSBzdGF0ZS5kb2M7XG5cdHJldHVybiBkb2Muc2xpY2UocG9zLCBwb3MrMSkudG9TdHJpbmcoKTtcbn1cblxuXG4gXG5jb25zdCBsYW5nSWZXaXRoaW5Db2RlYmxvY2sgPSAoc3RhdGU6IEVkaXRvclN0YXRlKTogc3RyaW5nIHwgbnVsbCA9PiB7XG5cdGNvbnN0IHRyZWUgPSBzeW50YXhUcmVlKHN0YXRlKTtcblxuXHRjb25zdCBwb3MgPSBzdGF0ZS5zZWxlY3Rpb24ucmFuZ2VzWzBdLmZyb207XG5cblx0Lypcblx0KiBnZXQgYSB0cmVlIGN1cnNvciBhdCB0aGUgcG9zaXRpb25cblx0KlxuXHQqIEEgbmV3bGluZSBkb2VzIG5vdCBiZWxvbmcgdG8gYW55IHN5bnRheCBub2RlcyBleGNlcHQgZm9yIHRoZSBEb2N1bWVudCxcblx0KiB3aGljaCBjb3JyZXNwb25kcyB0byB0aGUgd2hvbGUgZG9jdW1lbnQuIFNvLCB3ZSBjaGFuZ2UgdGhlIGBtb2RlYCBvZiB0aGVcblx0KiBgY3Vyc29yQXRgIGRlcGVuZGluZyBvbiB3aGV0aGVyIHRoZSBjaGFyYWN0ZXIganVzdCBiZWZvcmUgdGhlIGN1cnNvciBpcyBhXG5cdCogbmV3bGluZS5cblx0Ki9cblx0Y29uc3QgY3Vyc29yID1cblx0XHRwb3MgPT09IDAgfHwgZ2V0Q2hhcmFjdGVyQXRQb3Moc3RhdGUsIHBvcyAtIDEpID09PSBcIlxcblwiXG5cdFx0PyB0cmVlLmN1cnNvckF0KHBvcywgMSlcblx0XHQ6IHRyZWUuY3Vyc29yQXQocG9zLCAtMSk7XG5cblx0Ly8gY2hlY2sgaWYgd2UncmUgaW4gYSBjb2RlYmxvY2sgYXRtIGF0IGFsbFxuXHRjb25zdCBpbkNvZGVibG9jayA9IGN1cnNvci5uYW1lLmNvbnRhaW5zKFwiY29kZWJsb2NrXCIpO1xuXHRpZiAoIWluQ29kZWJsb2NrKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvLyBsb2NhdGUgdGhlIHN0YXJ0IG9mIHRoZSBibG9ja1xuXHRjb25zdCBjb2RlYmxvY2tCZWdpbiA9IGVzY2FsYXRlVG9Ub2tlbihjdXJzb3IsIERpcmVjdGlvbi5CYWNrd2FyZCwgXCJIeXBlck1ELWNvZGVibG9ja19IeXBlck1ELWNvZGVibG9jay1iZWdpblwiKTtcblxuXHRpZiAoY29kZWJsb2NrQmVnaW4gPT0gbnVsbCkge1xuXHRcdGNvbnNvbGUud2FybihcInVuYWJsZSB0byBsb2NhdGUgc3RhcnQgb2YgdGhlIGNvZGVibG9jayBldmVuIHRob3VnaCBpbnNpZGUgb25lXCIpO1xuXHRcdHJldHVybiBcIlwiO1xuXHR9XG5cblx0Ly8gZXh0cmFjdCB0aGUgbGFuZ3VhZ2Vcblx0Ly8gY29kZWJsb2NrcyBtYXkgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYmFja3RpY2tzXG5cdGNvbnN0IGxhbmd1YWdlID0gc3RhdGUuc2xpY2VEb2MoY29kZWJsb2NrQmVnaW4uZnJvbSwgY29kZWJsb2NrQmVnaW4udG8pLnJlcGxhY2UoL2ArLywgXCJcIik7XG5cblx0cmV0dXJuIGxhbmd1YWdlO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBlc2NhbGF0ZVRvVG9rZW4oY3Vyc29yOiBUcmVlQ3Vyc29yLCBkaXI6IERpcmVjdGlvbiwgdGFyZ2V0OiBzdHJpbmcpOiBTeW50YXhOb2RlIHwgbnVsbCB7XG5cdC8vIEFsbG93IHRoZSBzdGFydGluZyBub2RlIHRvIGJlIGEgbWF0Y2hcblx0aWYgKGN1cnNvci5uYW1lLmNvbnRhaW5zKHRhcmdldCkpIHtcblx0XHRyZXR1cm4gY3Vyc29yLm5vZGU7XG5cdH1cblxuXHR3aGlsZSAoXG5cdFx0KGN1cnNvci5uYW1lICE9IFwiRG9jdW1lbnRcIikgJiZcblx0XHQoKGRpciA9PSBEaXJlY3Rpb24uQmFja3dhcmQgJiYgY3Vyc29yLnByZXYoKSlcblx0XHR8fCAoZGlyID09IERpcmVjdGlvbi5Gb3J3YXJkICYmIGN1cnNvci5uZXh0KCkpXG5cdFx0fHwgY3Vyc29yLnBhcmVudCgpKVxuXHQpIHtcblx0XHRpZiAoY3Vyc29yLm5hbWUuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIGN1cnNvci5ub2RlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZW51bSBEaXJlY3Rpb24ge1xuXHRCYWNrd2FyZCxcblx0Rm9yd2FyZCxcbn0iXX0=