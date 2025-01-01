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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldF9jaGFuZ2Vfc3BlYy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zbmlwcGV0cy9jb2RlbWlycm9yL3NuaXBwZXRfY2hhbmdlX3NwZWMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFN0QsTUFBTSxPQUFPLGlCQUFpQjtJQUMxQixJQUFJLENBQVM7SUFDYixFQUFFLENBQVM7SUFDWCxNQUFNLENBQVM7SUFDZixVQUFVLENBQVU7SUFFcEIsWUFBWSxJQUFZLEVBQUUsRUFBVSxFQUFFLE1BQWMsRUFBRSxVQUFtQjtRQUNyRSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUNiLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO0lBQ2pDLENBQUM7SUFFRCxXQUFXLENBQUMsSUFBZ0IsRUFBRSxLQUFhO1FBQ3ZDLE1BQU0sUUFBUSxHQUFpQixFQUFFLENBQUM7UUFDbEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFdkMsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBRXRELElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUIsU0FBUztZQUNiLENBQUM7WUFFRCxJQUFJLE1BQU0sR0FBVSxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVqRCxNQUFNLFlBQVksR0FBRyxDQUFDLENBQUM7WUFDdkIsSUFBSSxVQUFVLEdBQUcsWUFBWSxHQUFHLENBQUMsQ0FBQztZQUNsQyxJQUFJLGtCQUFrQixHQUFHLEVBQUUsQ0FBQztZQUc1QixJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNoQixrRkFBa0Y7Z0JBQ2xGLGlFQUFpRTtnQkFDakUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDO29CQUFFLFNBQVM7Z0JBRTFDLGlEQUFpRDtnQkFDakQsTUFBTSxZQUFZLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBRWpHLCtEQUErRDtnQkFDL0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsWUFBWSxHQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVwRCw2RUFBNkU7Z0JBQzdFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztvQkFBRSxTQUFTO2dCQUUzQywwRkFBMEY7Z0JBQzFGLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBRTlDLGdGQUFnRjtnQkFDaEYsNkJBQTZCO2dCQUM3QixNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RELElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQztvQkFBRSxTQUFTO2dCQUc1QixJQUFJLFlBQVksS0FBSyxDQUFDLENBQUM7b0JBQUUsU0FBUztnQkFFbEMsMkZBQTJGO2dCQUMzRixrQkFBa0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBQyxVQUFVLEdBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUM5RCxVQUFVLEdBQUcsWUFBWSxHQUFHLENBQUMsQ0FBQztnQkFDOUIsQ0FBQyxHQUFHLFlBQVksQ0FBQztZQUNyQixDQUFDO1lBRUQsNkNBQTZDO1lBQzdDLE1BQU0sT0FBTyxHQUFHLEVBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFDLENBQUM7WUFDdEcsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQixDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUM7SUFDcEIsQ0FBQztJQUVELFlBQVk7UUFDUixPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgQ2hhbmdlU3BlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiXHJcbmltcG9ydCB7IFRhYnN0b3BTcGVjIH0gZnJvbSBcIi4uL3RhYnN0b3BcIjtcclxuaW1wb3J0IHsgZmluZE1hdGNoaW5nQnJhY2tldCB9IGZyb20gXCJzcmMvdXRpbHMvZWRpdG9yX3V0aWxzXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgU25pcHBldENoYW5nZVNwZWMge1xyXG4gICAgZnJvbTogbnVtYmVyO1xyXG4gICAgdG86IG51bWJlcjtcclxuICAgIGluc2VydDogc3RyaW5nO1xyXG4gICAga2V5UHJlc3NlZD86IHN0cmluZztcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIsIGluc2VydDogc3RyaW5nLCBrZXlQcmVzc2VkPzogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5mcm9tID0gZnJvbTtcclxuICAgICAgICB0aGlzLnRvID0gdG87XHJcbiAgICAgICAgdGhpcy5pbnNlcnQgPSBpbnNlcnQ7XHJcbiAgICAgICAgdGhpcy5rZXlQcmVzc2VkID0ga2V5UHJlc3NlZDtcclxuICAgIH1cclxuXHJcbiAgICBnZXRUYWJzdG9wcyh2aWV3OiBFZGl0b3JWaWV3LCBzdGFydDogbnVtYmVyKTpUYWJzdG9wU3BlY1tdIHtcclxuICAgICAgICBjb25zdCB0YWJzdG9wczpUYWJzdG9wU3BlY1tdID0gW107XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IHZpZXcuc3RhdGUuZG9jLnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSBzdGFydDsgaSA8IHN0YXJ0ICsgdGhpcy5pbnNlcnQubGVuZ3RoOyBpKyspIHtcclxuXHJcbiAgICAgICAgICAgIGlmICghKHRleHQuY2hhckF0KGkpID09PSBcIiRcIikpIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgbGV0IG51bWJlcjpudW1iZXIgPSBwYXJzZUludCh0ZXh0LmNoYXJBdChpICsgMSkpO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHRhYnN0b3BTdGFydCA9IGk7XHJcbiAgICAgICAgICAgIGxldCB0YWJzdG9wRW5kID0gdGFic3RvcFN0YXJ0ICsgMjtcclxuICAgICAgICAgICAgbGV0IHRhYnN0b3BSZXBsYWNlbWVudCA9IFwiXCI7XHJcbiAgICBcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoaXNOYU4obnVtYmVyKSkge1xyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHNlbGVjdGlvbiB0YWJzdG9wcyBvZiB0aGUgZm9ybSAke1xcZCs6WFhYfSB3aGVyZSBcXGQrIGlzIHNvbWUgbnVtYmVyIG9mXHJcbiAgICAgICAgICAgICAgICAvLyBkaWdpdHMgYW5kIFhYWCBpcyB0aGUgcmVwbGFjZW1lbnQgc3RyaW5nLCBzZXBhcmF0ZWQgYnkgYSBjb2xvblxyXG4gICAgICAgICAgICAgICAgaWYgKCEodGV4dC5jaGFyQXQoaSsxKSA9PT0gXCJ7XCIpKSBjb250aW51ZTtcclxuICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gRmluZCB0aGUgaW5kZXggb2YgdGhlIG1hdGNoaW5nIGNsb3NpbmcgYnJhY2tldFxyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xvc2luZ0luZGV4ID0gZmluZE1hdGNoaW5nQnJhY2tldCh0ZXh0LCBpKzEsIFwie1wiLCBcIn1cIiwgZmFsc2UsIHN0YXJ0ICsgdGhpcy5pbnNlcnQubGVuZ3RoKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGEgY29weSBvZiB0aGUgZW50aXJlIHRhYnN0b3Agc3RyaW5nIGZyb20gdGhlIGRvY3VtZW50XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0YWJzdG9wU3RyaW5nID0gdGV4dC5zbGljZShpLCBjbG9zaW5nSW5kZXgrMSk7XHJcbiAgICBcclxuICAgICAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIG5vdCBhIGNvbG9uIGluIHRoZSB0YWJzdG9wIHN0cmluZywgaXQgaXMgaW5jb3JyZWN0bHkgZm9ybWF0dGVkXHJcbiAgICAgICAgICAgICAgICBpZiAoIXRhYnN0b3BTdHJpbmcuaW5jbHVkZXMoXCI6XCIpKSBjb250aW51ZTtcclxuICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gR2V0IHRoZSBmaXJzdCBpbmRleCBvZiBhIGNvbG9uLCB3aGljaCB3ZSB3aWxsIHVzZSBhcyBvdXIgbnVtYmVyL3JlcGxhY2VtZW50IHNwbGl0IHBvaW50XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xvbkluZGV4ID0gdGFic3RvcFN0cmluZy5pbmRleE9mKFwiOlwiKTtcclxuICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gUGFyc2UgdGhlIG51bWJlciBmcm9tIHRoZSB0YWJzdG9wIHN0cmluZywgd2hpY2ggaXMgYWxsIGNoYXJhY3RlcnMgYWZ0ZXIgdGhlIHtcclxuICAgICAgICAgICAgICAgIC8vIGFuZCBiZWZvcmUgdGhlIGNvbG9uIGluZGV4XHJcbiAgICAgICAgICAgICAgICBudW1iZXIgPSBwYXJzZUludCh0YWJzdG9wU3RyaW5nLnNsaWNlKDIsIGNvbG9uSW5kZXgpKTtcclxuICAgICAgICAgICAgICAgIGlmIChpc05hTihudW1iZXIpKSBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoY2xvc2luZ0luZGV4ID09PSAtMSkgY29udGludWU7XHJcbiAgICBcclxuICAgICAgICAgICAgICAgIC8vIElzb2xhdGUgdGhlIHJlcGxhY2VtZW50IHRleHQgZnJvbSBhZnRlciB0aGUgY29sb24gdG8gdGhlIGVuZCBvZiB0aGUgdGFic3RvcCBicmFja2V0IHBhaXJcclxuICAgICAgICAgICAgICAgIHRhYnN0b3BSZXBsYWNlbWVudCA9IHRleHQuc2xpY2UoaStjb2xvbkluZGV4KzEsIGNsb3NpbmdJbmRleCk7XHJcbiAgICAgICAgICAgICAgICB0YWJzdG9wRW5kID0gY2xvc2luZ0luZGV4ICsgMTtcclxuICAgICAgICAgICAgICAgIGkgPSBjbG9zaW5nSW5kZXg7XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICAvLyBSZXBsYWNlIHRoZSB0YWJzdG9wIGluZGljYXRvciBcIiRYXCIgd2l0aCBcIlwiXHJcbiAgICAgICAgICAgIGNvbnN0IHRhYnN0b3AgPSB7bnVtYmVyOiBudW1iZXIsIGZyb206IHRhYnN0b3BTdGFydCwgdG86IHRhYnN0b3BFbmQsIHJlcGxhY2VtZW50OiB0YWJzdG9wUmVwbGFjZW1lbnR9O1xyXG4gICAgICAgICAgICB0YWJzdG9wcy5wdXNoKHRhYnN0b3ApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRhYnN0b3BzO1xyXG4gICAgfVxyXG5cclxuICAgIHRvQ2hhbmdlU3BlYygpOkNoYW5nZVNwZWMge1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG59Il19