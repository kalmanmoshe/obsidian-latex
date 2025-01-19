import { findMatchingBracket } from "src/utils/editor_utils";
export class SnippetChangeSpec {
    from;
    to;
    insert;
    keyPressed;
    constructor(from, to, insert, keyPressed) {
        this.from = from;
        this.to = to;
        this.insert = insert;
        this.keyPressed = keyPressed;
    }
    getTabstops(view, start) {
        const tabstops = [];
        const text = view.state.doc.toString();
        for (let i = start; i < start + this.insert.length; i++) {
            if (!(text.charAt(i) === "$")) {
                continue;
            }
            let number = parseInt(text.charAt(i + 1));
            const tabstopStart = i;
            let tabstopEnd = tabstopStart + 2;
            let tabstopReplacement = "";
            if (isNaN(number)) {
                // Check for selection tabstops of the form ${\d+:XXX} where \d+ is some number of
                // digits and XXX is the replacement string, separated by a colon
                if (!(text.charAt(i + 1) === "{"))
                    continue;
                // Find the index of the matching closing bracket
                const closingIndex = findMatchingBracket(text, i + 1, "{", "}", false, start + this.insert.length);
                // Create a copy of the entire tabstop string from the document
                const tabstopString = text.slice(i, closingIndex + 1);
                // If there is not a colon in the tabstop string, it is incorrectly formatted
                if (!tabstopString.includes(":"))
                    continue;
                // Get the first index of a colon, which we will use as our number/replacement split point
                const colonIndex = tabstopString.indexOf(":");
                // Parse the number from the tabstop string, which is all characters after the {
                // and before the colon index
                number = parseInt(tabstopString.slice(2, colonIndex));
                if (isNaN(number))
                    continue;
                if (closingIndex === -1)
                    continue;
                // Isolate the replacement text from after the colon to the end of the tabstop bracket pair
                tabstopReplacement = text.slice(i + colonIndex + 1, closingIndex);
                tabstopEnd = closingIndex + 1;
                i = closingIndex;
            }
            // Replace the tabstop indicator "$X" with ""
            const tabstop = { number: number, from: tabstopStart, to: tabstopEnd, replacement: tabstopReplacement };
            tabstops.push(tabstop);
        }
        return tabstops;
    }
    toChangeSpec() {
        return this;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldF9jaGFuZ2Vfc3BlYy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zbmlwcGV0cy9jb2RlbWlycm9yL3NuaXBwZXRfY2hhbmdlX3NwZWMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFN0QsTUFBTSxPQUFPLGlCQUFpQjtJQUMxQixJQUFJLENBQVM7SUFDYixFQUFFLENBQVM7SUFDWCxNQUFNLENBQVM7SUFDZixVQUFVLENBQVU7SUFFcEIsWUFBWSxJQUFZLEVBQUUsRUFBVSxFQUFFLE1BQWMsRUFBRSxVQUFtQjtRQUNyRSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUNiLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO0lBQ2pDLENBQUM7SUFFRCxXQUFXLENBQUMsSUFBZ0IsRUFBRSxLQUFhO1FBQ3ZDLE1BQU0sUUFBUSxHQUFpQixFQUFFLENBQUM7UUFDbEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFdkMsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBRXRELElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUIsU0FBUztZQUNiLENBQUM7WUFFRCxJQUFJLE1BQU0sR0FBVSxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVqRCxNQUFNLFlBQVksR0FBRyxDQUFDLENBQUM7WUFDdkIsSUFBSSxVQUFVLEdBQUcsWUFBWSxHQUFHLENBQUMsQ0FBQztZQUNsQyxJQUFJLGtCQUFrQixHQUFHLEVBQUUsQ0FBQztZQUc1QixJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNoQixrRkFBa0Y7Z0JBQ2xGLGlFQUFpRTtnQkFDakUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDO29CQUFFLFNBQVM7Z0JBRTFDLGlEQUFpRDtnQkFDakQsTUFBTSxZQUFZLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBRWpHLCtEQUErRDtnQkFDL0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsWUFBWSxHQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVwRCw2RUFBNkU7Z0JBQzdFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztvQkFBRSxTQUFTO2dCQUUzQywwRkFBMEY7Z0JBQzFGLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBRTlDLGdGQUFnRjtnQkFDaEYsNkJBQTZCO2dCQUM3QixNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RELElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQztvQkFBRSxTQUFTO2dCQUc1QixJQUFJLFlBQVksS0FBSyxDQUFDLENBQUM7b0JBQUUsU0FBUztnQkFFbEMsMkZBQTJGO2dCQUMzRixrQkFBa0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBQyxVQUFVLEdBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUM5RCxVQUFVLEdBQUcsWUFBWSxHQUFHLENBQUMsQ0FBQztnQkFDOUIsQ0FBQyxHQUFHLFlBQVksQ0FBQztZQUNyQixDQUFDO1lBRUQsNkNBQTZDO1lBQzdDLE1BQU0sT0FBTyxHQUFHLEVBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFDLENBQUM7WUFDdEcsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQixDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUM7SUFDcEIsQ0FBQztJQUVELFlBQVk7UUFDUixPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7IENoYW5nZVNwZWMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIlxuaW1wb3J0IHsgVGFic3RvcFNwZWMgfSBmcm9tIFwiLi4vdGFic3RvcFwiO1xuaW1wb3J0IHsgZmluZE1hdGNoaW5nQnJhY2tldCB9IGZyb20gXCJzcmMvdXRpbHMvZWRpdG9yX3V0aWxzXCI7XG5cbmV4cG9ydCBjbGFzcyBTbmlwcGV0Q2hhbmdlU3BlYyB7XG4gICAgZnJvbTogbnVtYmVyO1xuICAgIHRvOiBudW1iZXI7XG4gICAgaW5zZXJ0OiBzdHJpbmc7XG4gICAga2V5UHJlc3NlZD86IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKGZyb206IG51bWJlciwgdG86IG51bWJlciwgaW5zZXJ0OiBzdHJpbmcsIGtleVByZXNzZWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5mcm9tID0gZnJvbTtcbiAgICAgICAgdGhpcy50byA9IHRvO1xuICAgICAgICB0aGlzLmluc2VydCA9IGluc2VydDtcbiAgICAgICAgdGhpcy5rZXlQcmVzc2VkID0ga2V5UHJlc3NlZDtcbiAgICB9XG5cbiAgICBnZXRUYWJzdG9wcyh2aWV3OiBFZGl0b3JWaWV3LCBzdGFydDogbnVtYmVyKTpUYWJzdG9wU3BlY1tdIHtcbiAgICAgICAgY29uc3QgdGFic3RvcHM6VGFic3RvcFNwZWNbXSA9IFtdO1xuICAgICAgICBjb25zdCB0ZXh0ID0gdmlldy5zdGF0ZS5kb2MudG9TdHJpbmcoKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCBzdGFydCArIHRoaXMuaW5zZXJ0Lmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgIGlmICghKHRleHQuY2hhckF0KGkpID09PSBcIiRcIikpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIGxldCBudW1iZXI6bnVtYmVyID0gcGFyc2VJbnQodGV4dC5jaGFyQXQoaSArIDEpKTtcbiAgICBcbiAgICAgICAgICAgIGNvbnN0IHRhYnN0b3BTdGFydCA9IGk7XG4gICAgICAgICAgICBsZXQgdGFic3RvcEVuZCA9IHRhYnN0b3BTdGFydCArIDI7XG4gICAgICAgICAgICBsZXQgdGFic3RvcFJlcGxhY2VtZW50ID0gXCJcIjtcbiAgICBcbiAgICBcbiAgICAgICAgICAgIGlmIChpc05hTihudW1iZXIpKSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHNlbGVjdGlvbiB0YWJzdG9wcyBvZiB0aGUgZm9ybSAke1xcZCs6WFhYfSB3aGVyZSBcXGQrIGlzIHNvbWUgbnVtYmVyIG9mXG4gICAgICAgICAgICAgICAgLy8gZGlnaXRzIGFuZCBYWFggaXMgdGhlIHJlcGxhY2VtZW50IHN0cmluZywgc2VwYXJhdGVkIGJ5IGEgY29sb25cbiAgICAgICAgICAgICAgICBpZiAoISh0ZXh0LmNoYXJBdChpKzEpID09PSBcIntcIikpIGNvbnRpbnVlO1xuICAgIFxuICAgICAgICAgICAgICAgIC8vIEZpbmQgdGhlIGluZGV4IG9mIHRoZSBtYXRjaGluZyBjbG9zaW5nIGJyYWNrZXRcbiAgICAgICAgICAgICAgICBjb25zdCBjbG9zaW5nSW5kZXggPSBmaW5kTWF0Y2hpbmdCcmFja2V0KHRleHQsIGkrMSwgXCJ7XCIsIFwifVwiLCBmYWxzZSwgc3RhcnQgKyB0aGlzLmluc2VydC5sZW5ndGgpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBhIGNvcHkgb2YgdGhlIGVudGlyZSB0YWJzdG9wIHN0cmluZyBmcm9tIHRoZSBkb2N1bWVudFxuICAgICAgICAgICAgICAgIGNvbnN0IHRhYnN0b3BTdHJpbmcgPSB0ZXh0LnNsaWNlKGksIGNsb3NpbmdJbmRleCsxKTtcbiAgICBcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBub3QgYSBjb2xvbiBpbiB0aGUgdGFic3RvcCBzdHJpbmcsIGl0IGlzIGluY29ycmVjdGx5IGZvcm1hdHRlZFxuICAgICAgICAgICAgICAgIGlmICghdGFic3RvcFN0cmluZy5pbmNsdWRlcyhcIjpcIikpIGNvbnRpbnVlO1xuICAgIFxuICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgZmlyc3QgaW5kZXggb2YgYSBjb2xvbiwgd2hpY2ggd2Ugd2lsbCB1c2UgYXMgb3VyIG51bWJlci9yZXBsYWNlbWVudCBzcGxpdCBwb2ludFxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9uSW5kZXggPSB0YWJzdG9wU3RyaW5nLmluZGV4T2YoXCI6XCIpO1xuICAgIFxuICAgICAgICAgICAgICAgIC8vIFBhcnNlIHRoZSBudW1iZXIgZnJvbSB0aGUgdGFic3RvcCBzdHJpbmcsIHdoaWNoIGlzIGFsbCBjaGFyYWN0ZXJzIGFmdGVyIHRoZSB7XG4gICAgICAgICAgICAgICAgLy8gYW5kIGJlZm9yZSB0aGUgY29sb24gaW5kZXhcbiAgICAgICAgICAgICAgICBudW1iZXIgPSBwYXJzZUludCh0YWJzdG9wU3RyaW5nLnNsaWNlKDIsIGNvbG9uSW5kZXgpKTtcbiAgICAgICAgICAgICAgICBpZiAoaXNOYU4obnVtYmVyKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgXG4gICAgXG4gICAgICAgICAgICAgICAgaWYgKGNsb3NpbmdJbmRleCA9PT0gLTEpIGNvbnRpbnVlO1xuICAgIFxuICAgICAgICAgICAgICAgIC8vIElzb2xhdGUgdGhlIHJlcGxhY2VtZW50IHRleHQgZnJvbSBhZnRlciB0aGUgY29sb24gdG8gdGhlIGVuZCBvZiB0aGUgdGFic3RvcCBicmFja2V0IHBhaXJcbiAgICAgICAgICAgICAgICB0YWJzdG9wUmVwbGFjZW1lbnQgPSB0ZXh0LnNsaWNlKGkrY29sb25JbmRleCsxLCBjbG9zaW5nSW5kZXgpO1xuICAgICAgICAgICAgICAgIHRhYnN0b3BFbmQgPSBjbG9zaW5nSW5kZXggKyAxO1xuICAgICAgICAgICAgICAgIGkgPSBjbG9zaW5nSW5kZXg7XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICAvLyBSZXBsYWNlIHRoZSB0YWJzdG9wIGluZGljYXRvciBcIiRYXCIgd2l0aCBcIlwiXG4gICAgICAgICAgICBjb25zdCB0YWJzdG9wID0ge251bWJlcjogbnVtYmVyLCBmcm9tOiB0YWJzdG9wU3RhcnQsIHRvOiB0YWJzdG9wRW5kLCByZXBsYWNlbWVudDogdGFic3RvcFJlcGxhY2VtZW50fTtcbiAgICAgICAgICAgIHRhYnN0b3BzLnB1c2godGFic3RvcCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGFic3RvcHM7XG4gICAgfVxuXG4gICAgdG9DaGFuZ2VTcGVjKCk6Q2hhbmdlU3BlYyB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn0iXX0=