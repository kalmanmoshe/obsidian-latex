import { findMatchingBracket, getOpenBracket } from "src/utils/editor_utils";
import { queueSnippet } from "src/snippets/codemirror/snippet_queue_state_field";
import { expandSnippets } from "src/snippets/snippet_management";
import { autoEnlargeBrackets } from "./auto_enlarge_brackets";
import { getLatexSuiteConfig } from "src/snippets/codemirror/config";
export const runAutoFraction = (view, ctx) => {
    for (const range of ctx.ranges) {
        runAutoFractionCursor(view, ctx, range);
    }
    const success = expandSnippets(view);
    if (success) {
        autoEnlargeBrackets(view);
    }
    return success;
};
export const runAutoFractionCursor = (view, ctx, range) => {
    const settings = getLatexSuiteConfig(view);
    const { from, to } = range;
    // Don't run autofraction in excluded environments
    for (const env of settings.autofractionExcludedEnvs) {
        if (ctx.isWithinEnvironment(to, env)) {
            return false;
        }
    }
    // Get the bounds of the equation
    const result = ctx.getBounds();
    if (!result)
        return false;
    const eqnStart = result.start;
    let curLine = view.state.sliceDoc(0, to);
    let start = eqnStart;
    if (from != to) {
        // We have a selection
        // Set start to the beginning of the selection
        start = from;
    }
    else {
        // Find the contents of the fraction
        // Match everything except spaces and +-, but allow these characters in brackets
        // Also, allow spaces after greek letters
        // By replacing spaces after greek letters with a dummy character (#)
        const greek = "alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|Theta|iota|kappa|lambda|Lambda|mu|nu|omicron|xi|Xi|pi|Pi|rho|sigma|Sigma|tau|upsilon|Upsilon|varphi|phi|Phi|chi|psi|Psi|omega|Omega";
        const regex = new RegExp("(" + greek + ") ([^ ])", "g");
        curLine = curLine.replace(regex, "$1#$2");
        for (let i = curLine.length - 1; i >= eqnStart; i--) {
            const curChar = curLine.charAt(i);
            if ([")", "]", "}"].contains(curChar)) {
                const closeBracket = curChar;
                const openBracket = getOpenBracket(closeBracket);
                const j = findMatchingBracket(curLine, i, openBracket, closeBracket, true);
                if (j === -1)
                    return false;
                // Skip to the beginnning of the bracket
                i = j;
                if (i < eqnStart) {
                    start = eqnStart;
                    break;
                }
            }
            if (" $([{\n".concat(settings.autofractionBreakingChars).contains(curChar)) {
                start = i + 1;
                break;
            }
        }
    }
    // Don't run on an empty line
    if (start === to) {
        return false;
    }
    // Run autofraction
    let numerator = view.state.sliceDoc(start, to);
    // Remove unnecessary outer parentheses
    if (numerator.at(0) === "(" && numerator.at(-1) === ")") {
        const closing = findMatchingBracket(numerator, 0, "(", ")", false);
        if (closing === numerator.length - 1) {
            numerator = numerator.slice(1, -1);
        }
    }
    const replacement = `${settings.autofractionSymbol}{${numerator}}{$0}$1`;
    queueSnippet(view, start, to, replacement, "/");
    return true;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0b2ZyYWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2ZlYXR1cmVzL2F1dG9mcmFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDN0UsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUU5RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUdyRSxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsQ0FBQyxJQUFnQixFQUFFLEdBQVksRUFBVSxFQUFFO0lBRXpFLEtBQUssTUFBTSxLQUFLLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2hDLHFCQUFxQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUVyQyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ2IsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUMsQ0FBQTtBQUdELE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLENBQUMsSUFBZ0IsRUFBRSxHQUFZLEVBQUUsS0FBcUIsRUFBVSxFQUFFO0lBRXRHLE1BQU0sUUFBUSxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzNDLE1BQU0sRUFBQyxJQUFJLEVBQUUsRUFBRSxFQUFDLEdBQUcsS0FBSyxDQUFDO0lBRXpCLGtEQUFrRDtJQUNsRCxLQUFLLE1BQU0sR0FBRyxJQUFJLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ3JELElBQUksR0FBRyxDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3RDLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNGLENBQUM7SUFFRCxpQ0FBaUM7SUFDakMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQy9CLElBQUksQ0FBQyxNQUFNO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDMUIsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUc5QixJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDekMsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDO0lBRXJCLElBQUksSUFBSSxJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQ2hCLHNCQUFzQjtRQUN0Qiw4Q0FBOEM7UUFFOUMsS0FBSyxHQUFHLElBQUksQ0FBQztJQUNkLENBQUM7U0FDSSxDQUFDO1FBQ0wsb0NBQW9DO1FBQ3BDLGdGQUFnRjtRQUVoRix5Q0FBeUM7UUFDekMscUVBQXFFO1FBRXJFLE1BQU0sS0FBSyxHQUFHLDBNQUEwTSxDQUFDO1FBQ3pOLE1BQU0sS0FBSyxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsR0FBRyxLQUFLLEdBQUcsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3hELE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUcxQyxLQUFLLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxRQUFRLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNyRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBRWpDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUN2QyxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUM7Z0JBQzdCLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFFakQsTUFBTSxDQUFDLEdBQUcsbUJBQW1CLENBQUMsT0FBTyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUUzRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQUUsT0FBTyxLQUFLLENBQUM7Z0JBRTNCLHdDQUF3QztnQkFDeEMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFFTixJQUFJLENBQUMsR0FBRyxRQUFRLEVBQUUsQ0FBQztvQkFDbEIsS0FBSyxHQUFHLFFBQVEsQ0FBQztvQkFDakIsTUFBTTtnQkFDUCxDQUFDO1lBRUYsQ0FBQztZQUdELElBQUksU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMseUJBQXlCLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDNUUsS0FBSyxHQUFHLENBQUMsR0FBQyxDQUFDLENBQUM7Z0JBQ1osTUFBTTtZQUNQLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELDZCQUE2QjtJQUM3QixJQUFJLEtBQUssS0FBSyxFQUFFLEVBQUUsQ0FBQztRQUFDLE9BQU8sS0FBSyxDQUFDO0lBQUMsQ0FBQztJQUVuQyxtQkFBbUI7SUFDbkIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRS9DLHVDQUF1QztJQUN2QyxJQUFJLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUN6RCxNQUFNLE9BQU8sR0FBRyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkUsSUFBSSxPQUFPLEtBQUssU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN0QyxTQUFTLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwQyxDQUFDO0lBQ0YsQ0FBQztJQUVELE1BQU0sV0FBVyxHQUFHLEdBQUcsUUFBUSxDQUFDLGtCQUFrQixJQUFJLFNBQVMsU0FBUyxDQUFBO0lBRXhFLFlBQVksQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFaEQsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgU2VsZWN0aW9uUmFuZ2UgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgZmluZE1hdGNoaW5nQnJhY2tldCwgZ2V0T3BlbkJyYWNrZXQgfSBmcm9tIFwic3JjL3V0aWxzL2VkaXRvcl91dGlsc1wiO1xyXG5pbXBvcnQgeyBxdWV1ZVNuaXBwZXQgfSBmcm9tIFwic3JjL3NuaXBwZXRzL2NvZGVtaXJyb3Ivc25pcHBldF9xdWV1ZV9zdGF0ZV9maWVsZFwiO1xyXG5pbXBvcnQgeyBleHBhbmRTbmlwcGV0cyB9IGZyb20gXCJzcmMvc25pcHBldHMvc25pcHBldF9tYW5hZ2VtZW50XCI7XHJcbmltcG9ydCB7IGF1dG9FbmxhcmdlQnJhY2tldHMgfSBmcm9tIFwiLi9hdXRvX2VubGFyZ2VfYnJhY2tldHNcIjtcclxuaW1wb3J0IHsgQ29udGV4dCB9IGZyb20gXCJzcmMvdXRpbHMvY29udGV4dFwiO1xyXG5pbXBvcnQgeyBnZXRMYXRleFN1aXRlQ29uZmlnIH0gZnJvbSBcInNyYy9zbmlwcGV0cy9jb2RlbWlycm9yL2NvbmZpZ1wiO1xyXG5cclxuXHJcbmV4cG9ydCBjb25zdCBydW5BdXRvRnJhY3Rpb24gPSAodmlldzogRWRpdG9yVmlldywgY3R4OiBDb250ZXh0KTpib29sZWFuID0+IHtcclxuXHJcblx0Zm9yIChjb25zdCByYW5nZSBvZiBjdHgucmFuZ2VzKSB7XHJcblx0XHRydW5BdXRvRnJhY3Rpb25DdXJzb3IodmlldywgY3R4LCByYW5nZSk7XHJcblx0fVxyXG5cclxuXHRjb25zdCBzdWNjZXNzID0gZXhwYW5kU25pcHBldHModmlldyk7XHJcblxyXG5cdGlmIChzdWNjZXNzKSB7XHJcblx0XHRhdXRvRW5sYXJnZUJyYWNrZXRzKHZpZXcpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHN1Y2Nlc3M7XHJcbn1cclxuXHJcblxyXG5leHBvcnQgY29uc3QgcnVuQXV0b0ZyYWN0aW9uQ3Vyc29yID0gKHZpZXc6IEVkaXRvclZpZXcsIGN0eDogQ29udGV4dCwgcmFuZ2U6IFNlbGVjdGlvblJhbmdlKTpib29sZWFuID0+IHtcclxuXHJcblx0Y29uc3Qgc2V0dGluZ3MgPSBnZXRMYXRleFN1aXRlQ29uZmlnKHZpZXcpO1xyXG5cdGNvbnN0IHtmcm9tLCB0b30gPSByYW5nZTtcclxuXHJcblx0Ly8gRG9uJ3QgcnVuIGF1dG9mcmFjdGlvbiBpbiBleGNsdWRlZCBlbnZpcm9ubWVudHNcclxuXHRmb3IgKGNvbnN0IGVudiBvZiBzZXR0aW5ncy5hdXRvZnJhY3Rpb25FeGNsdWRlZEVudnMpIHtcclxuXHRcdGlmIChjdHguaXNXaXRoaW5FbnZpcm9ubWVudCh0bywgZW52KSkge1xyXG5cdFx0XHRyZXR1cm4gZmFsc2U7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvLyBHZXQgdGhlIGJvdW5kcyBvZiB0aGUgZXF1YXRpb25cclxuXHRjb25zdCByZXN1bHQgPSBjdHguZ2V0Qm91bmRzKCk7XHJcblx0aWYgKCFyZXN1bHQpIHJldHVybiBmYWxzZTtcclxuXHRjb25zdCBlcW5TdGFydCA9IHJlc3VsdC5zdGFydDtcclxuXHJcblxyXG5cdGxldCBjdXJMaW5lID0gdmlldy5zdGF0ZS5zbGljZURvYygwLCB0byk7XHJcblx0bGV0IHN0YXJ0ID0gZXFuU3RhcnQ7XHJcblxyXG5cdGlmIChmcm9tICE9IHRvKSB7XHJcblx0XHQvLyBXZSBoYXZlIGEgc2VsZWN0aW9uXHJcblx0XHQvLyBTZXQgc3RhcnQgdG8gdGhlIGJlZ2lubmluZyBvZiB0aGUgc2VsZWN0aW9uXHJcblxyXG5cdFx0c3RhcnQgPSBmcm9tO1xyXG5cdH1cclxuXHRlbHNlIHtcclxuXHRcdC8vIEZpbmQgdGhlIGNvbnRlbnRzIG9mIHRoZSBmcmFjdGlvblxyXG5cdFx0Ly8gTWF0Y2ggZXZlcnl0aGluZyBleGNlcHQgc3BhY2VzIGFuZCArLSwgYnV0IGFsbG93IHRoZXNlIGNoYXJhY3RlcnMgaW4gYnJhY2tldHNcclxuXHJcblx0XHQvLyBBbHNvLCBhbGxvdyBzcGFjZXMgYWZ0ZXIgZ3JlZWsgbGV0dGVyc1xyXG5cdFx0Ly8gQnkgcmVwbGFjaW5nIHNwYWNlcyBhZnRlciBncmVlayBsZXR0ZXJzIHdpdGggYSBkdW1teSBjaGFyYWN0ZXIgKCMpXHJcblxyXG5cdFx0Y29uc3QgZ3JlZWsgPSBcImFscGhhfGJldGF8Z2FtbWF8R2FtbWF8ZGVsdGF8RGVsdGF8ZXBzaWxvbnx2YXJlcHNpbG9ufHpldGF8ZXRhfHRoZXRhfFRoZXRhfGlvdGF8a2FwcGF8bGFtYmRhfExhbWJkYXxtdXxudXxvbWljcm9ufHhpfFhpfHBpfFBpfHJob3xzaWdtYXxTaWdtYXx0YXV8dXBzaWxvbnxVcHNpbG9ufHZhcnBoaXxwaGl8UGhpfGNoaXxwc2l8UHNpfG9tZWdhfE9tZWdhXCI7XHJcblx0XHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoXCIoXCIgKyBncmVlayArIFwiKSAoW14gXSlcIiwgXCJnXCIpO1xyXG5cdFx0Y3VyTGluZSA9IGN1ckxpbmUucmVwbGFjZShyZWdleCwgXCIkMSMkMlwiKTtcclxuXHJcblxyXG5cdFx0Zm9yIChsZXQgaSA9IGN1ckxpbmUubGVuZ3RoIC0gMTsgaSA+PSBlcW5TdGFydDsgaS0tKSB7XHJcblx0XHRcdGNvbnN0IGN1ckNoYXIgPSBjdXJMaW5lLmNoYXJBdChpKVxyXG5cclxuXHRcdFx0aWYgKFtcIilcIiwgXCJdXCIsIFwifVwiXS5jb250YWlucyhjdXJDaGFyKSkge1xyXG5cdFx0XHRcdGNvbnN0IGNsb3NlQnJhY2tldCA9IGN1ckNoYXI7XHJcblx0XHRcdFx0Y29uc3Qgb3BlbkJyYWNrZXQgPSBnZXRPcGVuQnJhY2tldChjbG9zZUJyYWNrZXQpO1xyXG5cclxuXHRcdFx0XHRjb25zdCBqID0gZmluZE1hdGNoaW5nQnJhY2tldChjdXJMaW5lLCBpLCBvcGVuQnJhY2tldCwgY2xvc2VCcmFja2V0LCB0cnVlKTtcclxuXHJcblx0XHRcdFx0aWYgKGogPT09IC0xKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdFx0XHRcdC8vIFNraXAgdG8gdGhlIGJlZ2lubm5pbmcgb2YgdGhlIGJyYWNrZXRcclxuXHRcdFx0XHRpID0gajtcclxuXHJcblx0XHRcdFx0aWYgKGkgPCBlcW5TdGFydCkge1xyXG5cdFx0XHRcdFx0c3RhcnQgPSBlcW5TdGFydDtcclxuXHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdH1cclxuXHJcblxyXG5cdFx0XHRpZiAoXCIgJChbe1xcblwiLmNvbmNhdChzZXR0aW5ncy5hdXRvZnJhY3Rpb25CcmVha2luZ0NoYXJzKS5jb250YWlucyhjdXJDaGFyKSkge1xyXG5cdFx0XHRcdHN0YXJ0ID0gaSsxO1xyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvLyBEb24ndCBydW4gb24gYW4gZW1wdHkgbGluZVxyXG5cdGlmIChzdGFydCA9PT0gdG8pIHsgcmV0dXJuIGZhbHNlOyB9XHJcblxyXG5cdC8vIFJ1biBhdXRvZnJhY3Rpb25cclxuXHRsZXQgbnVtZXJhdG9yID0gdmlldy5zdGF0ZS5zbGljZURvYyhzdGFydCwgdG8pO1xyXG5cclxuXHQvLyBSZW1vdmUgdW5uZWNlc3Nhcnkgb3V0ZXIgcGFyZW50aGVzZXNcclxuXHRpZiAobnVtZXJhdG9yLmF0KDApID09PSBcIihcIiAmJiBudW1lcmF0b3IuYXQoLTEpID09PSBcIilcIikge1xyXG5cdFx0Y29uc3QgY2xvc2luZyA9IGZpbmRNYXRjaGluZ0JyYWNrZXQobnVtZXJhdG9yLCAwLCBcIihcIiwgXCIpXCIsIGZhbHNlKTtcclxuXHRcdGlmIChjbG9zaW5nID09PSBudW1lcmF0b3IubGVuZ3RoIC0gMSkge1xyXG5cdFx0XHRudW1lcmF0b3IgPSBudW1lcmF0b3Iuc2xpY2UoMSwgLTEpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0Y29uc3QgcmVwbGFjZW1lbnQgPSBgJHtzZXR0aW5ncy5hdXRvZnJhY3Rpb25TeW1ib2x9eyR7bnVtZXJhdG9yfX17JDB9JDFgXHJcblxyXG5cdHF1ZXVlU25pcHBldCh2aWV3LCBzdGFydCwgdG8sIHJlcGxhY2VtZW50LCBcIi9cIik7XHJcblxyXG5cdHJldHVybiB0cnVlO1xyXG59XHJcbiJdfQ==