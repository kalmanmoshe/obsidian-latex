import { EditorSuggest, setIcon, } from "obsidian";
import { getMathJsSymbols } from "./utilities";
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
        const currentFileToCursor = editor.getRange({ line: 0, ch: 0 }, cursor);
        const indexOfLastCodeBlockStart = currentFileToCursor.lastIndexOf('```');
        // check if the next 4 characters after the last ``` are math or MATH
        const isMathBlock = currentFileToCursor.slice(indexOfLastCodeBlockStart + 3, indexOfLastCodeBlockStart + 7).toLowerCase() === 'math';
        if (!isMathBlock) {
            return null;
        }
        // Get last word in current line
        const currentLineToCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
        const currentLineLastWordStart = currentLineToCursor.search(/[:]?[$@\w\u0370-\u03FF]+$/);
        // if there is no word, return null
        if (currentLineLastWordStart === -1) {
            return null;
        }
        return {
            start: { line: cursor.line, ch: currentLineLastWordStart },
            end: cursor,
            query: currentLineToCursor.slice(currentLineLastWordStart)
        };
    }
    getSuggestions(context) {
        let localSymbols = [];
        // check if the last suggestion list update was less than 200ms ago
        if (performance.now() - this.lastSuggestionListUpdate > 200) {
            const currentFileToStart = context.editor.getRange({ line: 0, ch: 0 }, context.start);
            const indexOfLastCodeBlockStart = currentFileToStart.lastIndexOf('```');
            if (indexOfLastCodeBlockStart > -1) {
                //technically there is a risk we aren't in a math block, but we shouldn't have been triggered if we weren't
                const lastCodeBlockStart = currentFileToStart.lastIndexOf('```');
                const lastCodeBlockStartToCursor = currentFileToStart.slice(lastCodeBlockStart);
                // Return all variable names in the last codeblock up to the cursor
                const matches = lastCodeBlockStartToCursor.matchAll(/^\s*(\S*?)\s*=.*$/gm);
                // create array from first capture group of matches and remove duplicates
                localSymbols = [...new Set(Array.from(matches, (match) => 'v|' + match[1]))];
            }
            this.localSuggestionCache = localSymbols;
            this.lastSuggestionListUpdate = performance.now();
        }
        else {
            localSymbols = this.localSuggestionCache;
        }
        const query_lower = context.query.toLowerCase();
        // case-insensitive filter local suggestions based on query. Don't return value if full match
        const local_suggestions = localSymbols.filter((value) => value.slice(0, -1).toLowerCase().startsWith(query_lower, 2));
        local_suggestions.sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
        // case-insensitive filter mathjs suggestions based on query. Don't return value if full match
        let suggestions = [];
        const mathjs_suggestions = getMathJsSymbols().filter((value) => value.slice(0, -1).toLowerCase().startsWith(query_lower, 2));
        suggestions = local_suggestions.concat(mathjs_suggestions);
        suggestions = suggestions.concat(numeralsDirectives
            .filter((value) => value.slice(0, -1).toLowerCase().startsWith(query_lower, 0))
            .map((value) => 'm|' + value));
        return suggestions;
    }
    renderSuggestion(value, el) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N1Z2dlc3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQ0gsYUFBYSxFQU1iLE9BQU8sR0FDVCxNQUFNLFVBQVUsQ0FBQztBQUVuQixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFJL0MsTUFBTSxrQkFBa0IsR0FBRztJQUMxQixXQUFXO0lBQ1gsTUFBTTtJQUNOLFFBQVE7Q0FDUixDQUFBO0FBRUQsTUFBTSxPQUFPLGlCQUFrQixTQUFRLGFBQXFCO0lBQzNELE1BQU0sQ0FBaUI7SUFFdkI7OztrQkFHYztJQUNOLHdCQUF3QixHQUFHLENBQUMsQ0FBQztJQUVyQzs7O2tCQUdjO0lBQ04sb0JBQW9CLEdBQWEsRUFBRSxDQUFDO0lBRTVDLG1CQUFtQjtJQUNuQixZQUFZLE1BQXNCO1FBQ2pDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDdEIsQ0FBQztJQUVELFNBQVMsQ0FBQyxNQUFzQixFQUFFLE1BQWMsRUFBRSxJQUFXO1FBQzVELE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3RFLE1BQU0seUJBQXlCLEdBQUcsbUJBQW1CLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pFLHFFQUFxRTtRQUNyRSxNQUFNLFdBQVcsR0FBRyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMseUJBQXlCLEdBQUcsQ0FBQyxFQUFFLHlCQUF5QixHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxLQUFLLE1BQU0sQ0FBQztRQUVySSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsZ0NBQWdDO1FBQ2hDLE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUUsTUFBTSx3QkFBd0IsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUN6RixtQ0FBbUM7UUFDbkMsSUFBSSx3QkFBd0IsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELE9BQU87WUFDTixLQUFLLEVBQUUsRUFBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsd0JBQXdCLEVBQUM7WUFDeEQsR0FBRyxFQUFFLE1BQU07WUFDWCxLQUFLLEVBQUUsbUJBQW1CLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDO1NBQzFELENBQUM7SUFDSCxDQUFDO0lBRUQsY0FBYyxDQUFDLE9BQTZCO1FBQzNDLElBQUksWUFBWSxHQUFjLEVBQUUsQ0FBQztRQUVqQyxtRUFBbUU7UUFDbkUsSUFBSSxXQUFXLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixHQUFHLEdBQUcsRUFBRSxDQUFDO1lBQzdELE1BQU0sa0JBQWtCLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUMsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEYsTUFBTSx5QkFBeUIsR0FBRyxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFeEUsSUFBSSx5QkFBeUIsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNwQywyR0FBMkc7Z0JBQzNHLE1BQU0sa0JBQWtCLEdBQUcsa0JBQWtCLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLDBCQUEwQixHQUFHLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUVoRixtRUFBbUU7Z0JBQ25FLE1BQU0sT0FBTyxHQUFHLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO2dCQUMzRSx5RUFBeUU7Z0JBQ3pFLFlBQVksR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUUsQ0FBQztZQUVELElBQUksQ0FBQyxvQkFBb0IsR0FBRyxZQUFZLENBQUM7WUFDekMsSUFBSSxDQUFDLHdCQUF3QixHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNuRCxDQUFDO2FBQU0sQ0FBQztZQUNQLFlBQVksR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUE7UUFDekMsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7UUFFaEQsNkZBQTZGO1FBQzdGLE1BQU0saUJBQWlCLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEgsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdkUsOEZBQThGO1FBQzlGLElBQUksV0FBVyxHQUFhLEVBQUUsQ0FBQztRQUUvQixNQUFNLGtCQUFrQixHQUFHLGdCQUFnQixFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBYSxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNySSxXQUFXLEdBQUcsaUJBQWlCLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFHM0QsV0FBVyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQy9CLGtCQUFrQjthQUNoQixNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUM3RSxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsQ0FDN0IsQ0FBQztRQUVILE9BQU8sV0FBVyxDQUFDO0lBQ3BCLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxLQUFhLEVBQUUsRUFBZTtRQUU5QyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsYUFBYSxFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUN0RCxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBQyxHQUFHLEVBQUUsb0JBQW9CLEVBQUMsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sZUFBZSxHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxFQUFDLEdBQUcsRUFBRSxrQkFBa0IsRUFBQyxDQUFDLENBQUM7UUFDL0UsTUFBTSxjQUFjLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEVBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFDLENBQUMsQ0FBQztRQUM3RSxNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFDLENBQUMsQ0FBQztRQUM1RCxNQUFNLGVBQWUsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLEVBQUMsR0FBRyxFQUFFLGtCQUFrQixFQUFDLENBQUMsQ0FBQztRQUUzRSw2REFBNkQ7UUFDN0QsTUFBTSxDQUFDLFFBQVEsRUFBRSxjQUFjLEVBQUUsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU5RCxJQUFJLFFBQVEsS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUN0QixPQUFPLENBQUMsZUFBZSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDN0MsQ0FBQzthQUFNLElBQUksUUFBUSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxlQUFlLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDMUMsQ0FBQzthQUFNLElBQUksUUFBUSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxlQUFlLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdkMsQ0FBQzthQUFNLElBQUksUUFBUSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakMsQ0FBQzthQUFNLElBQUksUUFBUSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdEMsQ0FBQzthQUFNLElBQUksUUFBUSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxlQUFlLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyx5Q0FBeUM7UUFDbEYsQ0FBQztRQUNELGVBQWUsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDeEMsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLGNBQWMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbEMsQ0FBQztJQUVGLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILGdCQUFnQixDQUFDLEtBQWEsRUFBRSxHQUErQjtRQUM5RCxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQztZQUNuQyxNQUFNLENBQUMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7WUFDakMsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsZ0RBQWdEO1lBRWhGLE1BQU0sQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM1QyxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUM7WUFFdEIsSUFBSSxjQUFjLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQzVCLFNBQVMsQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEVBQUUsR0FBRyxVQUFVLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQztZQUMvQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsU0FBUyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsRUFBRSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUM7WUFDN0MsQ0FBQztZQUNELE1BQU0sQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFNUIsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFBO1FBQ2IsQ0FBQztJQUNGLENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBOdW1lcmFsc1BsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQge1xuICAgIEVkaXRvclN1Z2dlc3QsXG4gICAgRWRpdG9yUG9zaXRpb24sXG4gICAgRWRpdG9yLFxuICAgIFRGaWxlLFxuICAgIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbyxcbiAgICBFZGl0b3JTdWdnZXN0Q29udGV4dCxcbiAgICBzZXRJY29uLFxuIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGdldE1hdGhKc1N5bWJvbHMgfSBmcm9tIFwiLi91dGlsaXRpZXNcIjtcblxuXG5cbmNvbnN0IG51bWVyYWxzRGlyZWN0aXZlcyA9IFtcblx0XCJAaGlkZVJvd3NcIixcblx0XCJAU3VtXCIsXG5cdFwiQFRvdGFsXCIsXG5dXG5cbmV4cG9ydCBjbGFzcyBOdW1lcmFsc1N1Z2dlc3RvciBleHRlbmRzIEVkaXRvclN1Z2dlc3Q8c3RyaW5nPiB7XG5cdHBsdWdpbjogTnVtZXJhbHNQbHVnaW47XG5cdFxuXHQvKipcblx0ICogVGltZSBvZiBsYXN0IHN1Z2dlc3Rpb24gbGlzdCB1cGRhdGVcblx0ICogQHR5cGUge251bWJlcn1cblx0ICogQHByaXZhdGUgKi9cblx0cHJpdmF0ZSBsYXN0U3VnZ2VzdGlvbkxpc3RVcGRhdGUgPSAwO1xuXG5cdC8qKlxuXHQgKiBMaXN0IG9mIHBvc3NpYmxlIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIGN1cnJlbnQgY29kZSBibG9ja1xuXHQgKiBAdHlwZSB7c3RyaW5nW119XG5cdCAqIEBwcml2YXRlICovXG5cdHByaXZhdGUgbG9jYWxTdWdnZXN0aW9uQ2FjaGU6IHN0cmluZ1tdID0gW107XG5cblx0Ly9lbXB0eSBjb25zdHJ1Y3RvclxuXHRjb25zdHJ1Y3RvcihwbHVnaW46IE51bWVyYWxzUGx1Z2luKSB7XG5cdFx0c3VwZXIocGx1Z2luLmFwcCk7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRvblRyaWdnZXIoY3Vyc29yOiBFZGl0b3JQb3NpdGlvbiwgZWRpdG9yOiBFZGl0b3IsIGZpbGU6IFRGaWxlKTogRWRpdG9yU3VnZ2VzdFRyaWdnZXJJbmZvIHwgbnVsbCB7XG5cdFx0Y29uc3QgY3VycmVudEZpbGVUb0N1cnNvciA9IGVkaXRvci5nZXRSYW5nZSh7bGluZTogMCwgY2g6IDB9LCBjdXJzb3IpO1xuXHRcdGNvbnN0IGluZGV4T2ZMYXN0Q29kZUJsb2NrU3RhcnQgPSBjdXJyZW50RmlsZVRvQ3Vyc29yLmxhc3RJbmRleE9mKCdgYGAnKTtcblx0XHQvLyBjaGVjayBpZiB0aGUgbmV4dCA0IGNoYXJhY3RlcnMgYWZ0ZXIgdGhlIGxhc3QgYGBgIGFyZSBtYXRoIG9yIE1BVEhcblx0XHRjb25zdCBpc01hdGhCbG9jayA9IGN1cnJlbnRGaWxlVG9DdXJzb3Iuc2xpY2UoaW5kZXhPZkxhc3RDb2RlQmxvY2tTdGFydCArIDMsIGluZGV4T2ZMYXN0Q29kZUJsb2NrU3RhcnQgKyA3KS50b0xvd2VyQ2FzZSgpID09PSAnbWF0aCc7XG5cblx0XHRpZiAoIWlzTWF0aEJsb2NrKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBHZXQgbGFzdCB3b3JkIGluIGN1cnJlbnQgbGluZVxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lVG9DdXJzb3IgPSBlZGl0b3IuZ2V0TGluZShjdXJzb3IubGluZSkuc2xpY2UoMCwgY3Vyc29yLmNoKTtcblx0XHRjb25zdCBjdXJyZW50TGluZUxhc3RXb3JkU3RhcnQgPSBjdXJyZW50TGluZVRvQ3Vyc29yLnNlYXJjaCgvWzpdP1skQFxcd1xcdTAzNzAtXFx1MDNGRl0rJC8pO1xuXHRcdC8vIGlmIHRoZXJlIGlzIG5vIHdvcmQsIHJldHVybiBudWxsXG5cdFx0aWYgKGN1cnJlbnRMaW5lTGFzdFdvcmRTdGFydCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydDoge2xpbmU6IGN1cnNvci5saW5lLCBjaDogY3VycmVudExpbmVMYXN0V29yZFN0YXJ0fSxcblx0XHRcdGVuZDogY3Vyc29yLFxuXHRcdFx0cXVlcnk6IGN1cnJlbnRMaW5lVG9DdXJzb3Iuc2xpY2UoY3VycmVudExpbmVMYXN0V29yZFN0YXJ0KVxuXHRcdH07XG5cdH1cblxuXHRnZXRTdWdnZXN0aW9ucyhjb250ZXh0OiBFZGl0b3JTdWdnZXN0Q29udGV4dCk6IHN0cmluZ1tdIHwgUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGxldCBsb2NhbFN5bWJvbHM6IHN0cmluZyBbXSA9IFtdO1x0XG5cblx0XHQvLyBjaGVjayBpZiB0aGUgbGFzdCBzdWdnZXN0aW9uIGxpc3QgdXBkYXRlIHdhcyBsZXNzIHRoYW4gMjAwbXMgYWdvXG5cdFx0aWYgKHBlcmZvcm1hbmNlLm5vdygpIC0gdGhpcy5sYXN0U3VnZ2VzdGlvbkxpc3RVcGRhdGUgPiAyMDApIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRGaWxlVG9TdGFydCA9IGNvbnRleHQuZWRpdG9yLmdldFJhbmdlKHtsaW5lOiAwLCBjaDogMH0sIGNvbnRleHQuc3RhcnQpO1xuXHRcdFx0Y29uc3QgaW5kZXhPZkxhc3RDb2RlQmxvY2tTdGFydCA9IGN1cnJlbnRGaWxlVG9TdGFydC5sYXN0SW5kZXhPZignYGBgJyk7XG5cdFxuXHRcdFx0aWYgKGluZGV4T2ZMYXN0Q29kZUJsb2NrU3RhcnQgPiAtMSkge1xuXHRcdFx0XHQvL3RlY2huaWNhbGx5IHRoZXJlIGlzIGEgcmlzayB3ZSBhcmVuJ3QgaW4gYSBtYXRoIGJsb2NrLCBidXQgd2Ugc2hvdWxkbid0IGhhdmUgYmVlbiB0cmlnZ2VyZWQgaWYgd2Ugd2VyZW4ndFxuXHRcdFx0XHRjb25zdCBsYXN0Q29kZUJsb2NrU3RhcnQgPSBjdXJyZW50RmlsZVRvU3RhcnQubGFzdEluZGV4T2YoJ2BgYCcpO1xuXHRcdFx0XHRjb25zdCBsYXN0Q29kZUJsb2NrU3RhcnRUb0N1cnNvciA9IGN1cnJlbnRGaWxlVG9TdGFydC5zbGljZShsYXN0Q29kZUJsb2NrU3RhcnQpO1xuXHRcblx0XHRcdFx0Ly8gUmV0dXJuIGFsbCB2YXJpYWJsZSBuYW1lcyBpbiB0aGUgbGFzdCBjb2RlYmxvY2sgdXAgdG8gdGhlIGN1cnNvclxuXHRcdFx0XHRjb25zdCBtYXRjaGVzID0gbGFzdENvZGVCbG9ja1N0YXJ0VG9DdXJzb3IubWF0Y2hBbGwoL15cXHMqKFxcUyo/KVxccyo9LiokL2dtKTtcblx0XHRcdFx0Ly8gY3JlYXRlIGFycmF5IGZyb20gZmlyc3QgY2FwdHVyZSBncm91cCBvZiBtYXRjaGVzIGFuZCByZW1vdmUgZHVwbGljYXRlc1xuXHRcdFx0XHRsb2NhbFN5bWJvbHMgPSBbLi4ubmV3IFNldChBcnJheS5mcm9tKG1hdGNoZXMsIChtYXRjaCkgPT4gJ3Z8JyArIG1hdGNoWzFdKSldO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxvY2FsU3VnZ2VzdGlvbkNhY2hlID0gbG9jYWxTeW1ib2xzO1xuXHRcdFx0dGhpcy5sYXN0U3VnZ2VzdGlvbkxpc3RVcGRhdGUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9jYWxTeW1ib2xzID0gdGhpcy5sb2NhbFN1Z2dlc3Rpb25DYWNoZVxuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXJ5X2xvd2VyID0gY29udGV4dC5xdWVyeS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0Ly8gY2FzZS1pbnNlbnNpdGl2ZSBmaWx0ZXIgbG9jYWwgc3VnZ2VzdGlvbnMgYmFzZWQgb24gcXVlcnkuIERvbid0IHJldHVybiB2YWx1ZSBpZiBmdWxsIG1hdGNoXG5cdFx0Y29uc3QgbG9jYWxfc3VnZ2VzdGlvbnMgPSBsb2NhbFN5bWJvbHMuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUuc2xpY2UoMCwgLTEpLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChxdWVyeV9sb3dlciwgMikpO1xuXHRcdGxvY2FsX3N1Z2dlc3Rpb25zLnNvcnQoKGEsIGIpID0+IGEuc2xpY2UoMikubG9jYWxlQ29tcGFyZShiLnNsaWNlKDIpKSk7XG5cdFx0XG5cdFx0Ly8gY2FzZS1pbnNlbnNpdGl2ZSBmaWx0ZXIgbWF0aGpzIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIHF1ZXJ5LiBEb24ndCByZXR1cm4gdmFsdWUgaWYgZnVsbCBtYXRjaFxuXHRcdGxldCBzdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRcblx0XHRjb25zdCBtYXRoanNfc3VnZ2VzdGlvbnMgPSBnZXRNYXRoSnNTeW1ib2xzKCkuZmlsdGVyKCh2YWx1ZTogc3RyaW5nKSA9PiB2YWx1ZS5zbGljZSgwLCAtMSkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHF1ZXJ5X2xvd2VyLCAyKSk7XG5cdFx0c3VnZ2VzdGlvbnMgPSBsb2NhbF9zdWdnZXN0aW9ucy5jb25jYXQobWF0aGpzX3N1Z2dlc3Rpb25zKTtcblx0XHRcblxuXHRcdHN1Z2dlc3Rpb25zID0gc3VnZ2VzdGlvbnMuY29uY2F0KFxuXHRcdFx0bnVtZXJhbHNEaXJlY3RpdmVzXG5cdFx0XHRcdC5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5zbGljZSgwLC0xKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocXVlcnlfbG93ZXIsIDApKVxuXHRcdFx0XHQubWFwKCh2YWx1ZSkgPT4gJ218JyArIHZhbHVlKVxuXHRcdFx0KTtcblxuXHRcdHJldHVybiBzdWdnZXN0aW9ucztcblx0fVxuXG5cdHJlbmRlclN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XG5cdFx0ZWwuYWRkQ2xhc3NlcyhbJ21vZC1jb21wbGV4JywgJ251bWVyYWxzLXN1Z2dlc3Rpb24nXSk7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkNvbnRlbnQgPSBlbC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tY29udGVudCd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uVGl0bGUgPSBzdWdnZXN0aW9uQ29udGVudC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tdGl0bGUnfSk7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbk5vdGUgPSBzdWdnZXN0aW9uQ29udGVudC5jcmVhdGVEaXYoe2NsczogJ3N1Z2dlc3Rpb24tbm90ZSd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uQXV4ID0gZWwuY3JlYXRlRGl2KHtjbHM6ICdzdWdnZXN0aW9uLWF1eCd9KTtcblx0XHRjb25zdCBzdWdnZXN0aW9uRmxhaXIgPSBzdWdnZXN0aW9uQXV4LmNyZWF0ZURpdih7Y2xzOiAnc3VnZ2VzdGlvbi1mbGFpcid9KTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnNcblx0XHRjb25zdCBbaWNvblR5cGUsIHN1Z2dlc3Rpb25UZXh0LCBub3RlVGV4dF0gPSB2YWx1ZS5zcGxpdCgnfCcpO1xuXG5cdFx0aWYgKGljb25UeXBlID09PSAnZicpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZnVuY3Rpb24tc3F1YXJlJyk7XHRcdFxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdjJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdsb2NhdGUtZml4ZWQnKTtcblx0XHR9IGVsc2UgaWYgKGljb25UeXBlID09PSAndicpIHtcblx0XHRcdHNldEljb24oc3VnZ2VzdGlvbkZsYWlyLCAnZmlsZS1jb2RlJyk7XG5cdFx0fSBlbHNlIGlmIChpY29uVHlwZSA9PT0gJ3AnKSB7XG5cdFx0XHRzZXRJY29uKHN1Z2dlc3Rpb25GbGFpciwgJ2JveCcpO1xuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdtJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdzcGFya2xlcycpO1x0XHRcdFxuXHRcdH0gZWxzZSBpZiAoaWNvblR5cGUgPT09ICdnJykge1xuXHRcdFx0c2V0SWNvbihzdWdnZXN0aW9uRmxhaXIsICdjYXNlLWxvd2VyJyk7IC8vIEFzc3VtaW5nICdzeW1ib2wnIGlzIGEgdmFsaWQgaWNvbiBuYW1lXG5cdFx0fVxuXHRcdHN1Z2dlc3Rpb25UaXRsZS5zZXRUZXh0KHN1Z2dlc3Rpb25UZXh0KTtcblx0XHRpZiAobm90ZVRleHQpIHtcblx0XHRcdHN1Z2dlc3Rpb25Ob3RlLnNldFRleHQobm90ZVRleHQpO1xuXHRcdH1cblxuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIGEgc3VnZ2VzdGlvbiBpcyBzZWxlY3RlZC4gUmVwbGFjZXMgdGhlIGN1cnJlbnQgd29yZCB3aXRoIHRoZSBzZWxlY3RlZCBzdWdnZXN0aW9uXG5cdCAqIEBwYXJhbSB2YWx1ZSBUaGUgc2VsZWN0ZWQgc3VnZ2VzdGlvblxuXHQgKiBAcGFyYW0gZXZ0IFRoZSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgc2VsZWN0aW9uXG5cdCAqIEByZXR1cm5zIHZvaWRcblx0ICovXG5cdHNlbGVjdFN1Z2dlc3Rpb24odmFsdWU6IHN0cmluZywgZXZ0OiBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRleHQpIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuY29udGV4dC5lZGl0b3I7XG5cdFx0XHRjb25zdCBbc3VnZ2VzdGlvblR5cGUsIHN1Z2dlc3Rpb25dID0gdmFsdWUuc3BsaXQoJ3wnKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5jb250ZXh0LnN0YXJ0O1xuXHRcdFx0Y29uc3QgZW5kID0gZWRpdG9yLmdldEN1cnNvcigpOyAvLyBnZXQgbmV3IGVuZCBwb3NpdGlvbiBpbiBjYXNlIGN1cnNvciBoYXMgbW92ZWRcblx0XHRcdFxuXHRcdFx0ZWRpdG9yLnJlcGxhY2VSYW5nZShzdWdnZXN0aW9uLCBzdGFydCwgZW5kKTtcblx0XHRcdGNvbnN0IG5ld0N1cnNvciA9IGVuZDtcblxuXHRcdFx0aWYgKHN1Z2dlc3Rpb25UeXBlID09PSAnZicpIHtcblx0XHRcdFx0bmV3Q3Vyc29yLmNoID0gc3RhcnQuY2ggKyBzdWdnZXN0aW9uLmxlbmd0aC0xO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bmV3Q3Vyc29yLmNoID0gc3RhcnQuY2ggKyBzdWdnZXN0aW9uLmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdGVkaXRvci5zZXRDdXJzb3IobmV3Q3Vyc29yKTtcdFx0XHRcblxuXHRcdFx0dGhpcy5jbG9zZSgpXG5cdFx0fVxuXHR9XG59Il19