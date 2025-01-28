import { findMatchingBracket } from "src/utils/editor_utils";
export class SnippetChangeSpec {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldF9jaGFuZ2Vfc3BlYy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zbmlwcGV0cy9jb2RlbWlycm9yL3NuaXBwZXRfY2hhbmdlX3NwZWMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFN0QsTUFBTSxPQUFPLGlCQUFpQjtJQU0xQixZQUFZLElBQVksRUFBRSxFQUFVLEVBQUUsTUFBYyxFQUFFLFVBQW1CO1FBQ3JFLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBQ2IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7SUFDakMsQ0FBQztJQUVELFdBQVcsQ0FBQyxJQUFnQixFQUFFLEtBQWE7UUFDdkMsTUFBTSxRQUFRLEdBQWlCLEVBQUUsQ0FBQztRQUNsQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUV2QyxLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFFdEQsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM1QixTQUFTO1lBQ2IsQ0FBQztZQUVELElBQUksTUFBTSxHQUFVLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRWpELE1BQU0sWUFBWSxHQUFHLENBQUMsQ0FBQztZQUN2QixJQUFJLFVBQVUsR0FBRyxZQUFZLEdBQUcsQ0FBQyxDQUFDO1lBQ2xDLElBQUksa0JBQWtCLEdBQUcsRUFBRSxDQUFDO1lBRzVCLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ2hCLGtGQUFrRjtnQkFDbEYsaUVBQWlFO2dCQUNqRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQUUsU0FBUztnQkFFMUMsaURBQWlEO2dCQUNqRCxNQUFNLFlBQVksR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFakcsK0RBQStEO2dCQUMvRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxZQUFZLEdBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRXBELDZFQUE2RTtnQkFDN0UsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDO29CQUFFLFNBQVM7Z0JBRTNDLDBGQUEwRjtnQkFDMUYsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFFOUMsZ0ZBQWdGO2dCQUNoRiw2QkFBNkI7Z0JBQzdCLE1BQU0sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDdEQsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDO29CQUFFLFNBQVM7Z0JBRzVCLElBQUksWUFBWSxLQUFLLENBQUMsQ0FBQztvQkFBRSxTQUFTO2dCQUVsQywyRkFBMkY7Z0JBQzNGLGtCQUFrQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFDLFVBQVUsR0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQzlELFVBQVUsR0FBRyxZQUFZLEdBQUcsQ0FBQyxDQUFDO2dCQUM5QixDQUFDLEdBQUcsWUFBWSxDQUFDO1lBQ3JCLENBQUM7WUFFRCw2Q0FBNkM7WUFDN0MsTUFBTSxPQUFPLEdBQUcsRUFBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUMsQ0FBQztZQUN0RyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzNCLENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQztJQUNwQixDQUFDO0lBRUQsWUFBWTtRQUNSLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBDaGFuZ2VTcGVjIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCJcclxuaW1wb3J0IHsgVGFic3RvcFNwZWMgfSBmcm9tIFwiLi4vdGFic3RvcFwiO1xyXG5pbXBvcnQgeyBmaW5kTWF0Y2hpbmdCcmFja2V0IH0gZnJvbSBcInNyYy91dGlscy9lZGl0b3JfdXRpbHNcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBTbmlwcGV0Q2hhbmdlU3BlYyB7XHJcbiAgICBmcm9tOiBudW1iZXI7XHJcbiAgICB0bzogbnVtYmVyO1xyXG4gICAgaW5zZXJ0OiBzdHJpbmc7XHJcbiAgICBrZXlQcmVzc2VkPzogc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGZyb206IG51bWJlciwgdG86IG51bWJlciwgaW5zZXJ0OiBzdHJpbmcsIGtleVByZXNzZWQ/OiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmZyb20gPSBmcm9tO1xyXG4gICAgICAgIHRoaXMudG8gPSB0bztcclxuICAgICAgICB0aGlzLmluc2VydCA9IGluc2VydDtcclxuICAgICAgICB0aGlzLmtleVByZXNzZWQgPSBrZXlQcmVzc2VkO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFRhYnN0b3BzKHZpZXc6IEVkaXRvclZpZXcsIHN0YXJ0OiBudW1iZXIpOlRhYnN0b3BTcGVjW10ge1xyXG4gICAgICAgIGNvbnN0IHRhYnN0b3BzOlRhYnN0b3BTcGVjW10gPSBbXTtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gdmlldy5zdGF0ZS5kb2MudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgc3RhcnQgKyB0aGlzLmluc2VydC5sZW5ndGg7IGkrKykge1xyXG5cclxuICAgICAgICAgICAgaWYgKCEodGV4dC5jaGFyQXQoaSkgPT09IFwiJFwiKSkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBsZXQgbnVtYmVyOm51bWJlciA9IHBhcnNlSW50KHRleHQuY2hhckF0KGkgKyAxKSk7XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgdGFic3RvcFN0YXJ0ID0gaTtcclxuICAgICAgICAgICAgbGV0IHRhYnN0b3BFbmQgPSB0YWJzdG9wU3RhcnQgKyAyO1xyXG4gICAgICAgICAgICBsZXQgdGFic3RvcFJlcGxhY2VtZW50ID0gXCJcIjtcclxuICAgIFxyXG4gICAgXHJcbiAgICAgICAgICAgIGlmIChpc05hTihudW1iZXIpKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3Igc2VsZWN0aW9uIHRhYnN0b3BzIG9mIHRoZSBmb3JtICR7XFxkKzpYWFh9IHdoZXJlIFxcZCsgaXMgc29tZSBudW1iZXIgb2ZcclxuICAgICAgICAgICAgICAgIC8vIGRpZ2l0cyBhbmQgWFhYIGlzIHRoZSByZXBsYWNlbWVudCBzdHJpbmcsIHNlcGFyYXRlZCBieSBhIGNvbG9uXHJcbiAgICAgICAgICAgICAgICBpZiAoISh0ZXh0LmNoYXJBdChpKzEpID09PSBcIntcIikpIGNvbnRpbnVlO1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICAvLyBGaW5kIHRoZSBpbmRleCBvZiB0aGUgbWF0Y2hpbmcgY2xvc2luZyBicmFja2V0XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjbG9zaW5nSW5kZXggPSBmaW5kTWF0Y2hpbmdCcmFja2V0KHRleHQsIGkrMSwgXCJ7XCIsIFwifVwiLCBmYWxzZSwgc3RhcnQgKyB0aGlzLmluc2VydC5sZW5ndGgpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBDcmVhdGUgYSBjb3B5IG9mIHRoZSBlbnRpcmUgdGFic3RvcCBzdHJpbmcgZnJvbSB0aGUgZG9jdW1lbnRcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRhYnN0b3BTdHJpbmcgPSB0ZXh0LnNsaWNlKGksIGNsb3NpbmdJbmRleCsxKTtcclxuICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm90IGEgY29sb24gaW4gdGhlIHRhYnN0b3Agc3RyaW5nLCBpdCBpcyBpbmNvcnJlY3RseSBmb3JtYXR0ZWRcclxuICAgICAgICAgICAgICAgIGlmICghdGFic3RvcFN0cmluZy5pbmNsdWRlcyhcIjpcIikpIGNvbnRpbnVlO1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIGZpcnN0IGluZGV4IG9mIGEgY29sb24sIHdoaWNoIHdlIHdpbGwgdXNlIGFzIG91ciBudW1iZXIvcmVwbGFjZW1lbnQgc3BsaXQgcG9pbnRcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9uSW5kZXggPSB0YWJzdG9wU3RyaW5nLmluZGV4T2YoXCI6XCIpO1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICAvLyBQYXJzZSB0aGUgbnVtYmVyIGZyb20gdGhlIHRhYnN0b3Agc3RyaW5nLCB3aGljaCBpcyBhbGwgY2hhcmFjdGVycyBhZnRlciB0aGUge1xyXG4gICAgICAgICAgICAgICAgLy8gYW5kIGJlZm9yZSB0aGUgY29sb24gaW5kZXhcclxuICAgICAgICAgICAgICAgIG51bWJlciA9IHBhcnNlSW50KHRhYnN0b3BTdHJpbmcuc2xpY2UoMiwgY29sb25JbmRleCkpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGlzTmFOKG51bWJlcikpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICBcclxuICAgICAgICAgICAgICAgIGlmIChjbG9zaW5nSW5kZXggPT09IC0xKSBjb250aW51ZTtcclxuICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gSXNvbGF0ZSB0aGUgcmVwbGFjZW1lbnQgdGV4dCBmcm9tIGFmdGVyIHRoZSBjb2xvbiB0byB0aGUgZW5kIG9mIHRoZSB0YWJzdG9wIGJyYWNrZXQgcGFpclxyXG4gICAgICAgICAgICAgICAgdGFic3RvcFJlcGxhY2VtZW50ID0gdGV4dC5zbGljZShpK2NvbG9uSW5kZXgrMSwgY2xvc2luZ0luZGV4KTtcclxuICAgICAgICAgICAgICAgIHRhYnN0b3BFbmQgPSBjbG9zaW5nSW5kZXggKyAxO1xyXG4gICAgICAgICAgICAgICAgaSA9IGNsb3NpbmdJbmRleDtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIFJlcGxhY2UgdGhlIHRhYnN0b3AgaW5kaWNhdG9yIFwiJFhcIiB3aXRoIFwiXCJcclxuICAgICAgICAgICAgY29uc3QgdGFic3RvcCA9IHtudW1iZXI6IG51bWJlciwgZnJvbTogdGFic3RvcFN0YXJ0LCB0bzogdGFic3RvcEVuZCwgcmVwbGFjZW1lbnQ6IHRhYnN0b3BSZXBsYWNlbWVudH07XHJcbiAgICAgICAgICAgIHRhYnN0b3BzLnB1c2godGFic3RvcCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdGFic3RvcHM7XHJcbiAgICB9XHJcblxyXG4gICAgdG9DaGFuZ2VTcGVjKCk6Q2hhbmdlU3BlYyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbn0iXX0=