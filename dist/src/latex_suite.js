import { runSnippets } from "./features/run_snippets";
import { runAutoFraction } from "./features/autofraction";
import { tabout, shouldTaboutByCloseBracket } from "./features/tabout";
import { runMatrixShortcuts } from "./features/matrix_shortcuts";
import { Context } from "./utils/context";
import { getCharacterAtPos, replaceRange } from "./utils/editor_utils";
import { setSelectionToNextTabstop } from "./snippets/snippet_management";
import { removeAllTabstops } from "./snippets/codemirror/tabstops_state_field";
import { getLatexSuiteConfig } from "./snippets/codemirror/config";
import { clearSnippetQueue } from "./snippets/codemirror/snippet_queue_state_field";
import { handleUndoRedo } from "./snippets/codemirror/history";
import { handleMathTooltip } from "./editor_extensions/math_tooltip";
import { isComposing } from "./utils/editor_utils";
export const handleUpdate = (update) => {
    const settings = getLatexSuiteConfig(update.state);
    // The math tooltip handler is driven by view updates because it utilizes
    // information about visual line, which is not available in EditorState
    if (settings.mathPreviewEnabled) {
        handleMathTooltip(update);
    }
    handleUndoRedo(update);
};
export const onKeydown = (event, view) => {
    console.log("dxdcfvgb");
    const success = handleKeydown(event.key, event.shiftKey, event.ctrlKey || event.metaKey, isComposing(view, event), view);
    if (success)
        event.preventDefault();
};
export const handleKeydown = (key, shiftKey, ctrlKey, isIME, view) => {
    const settings = getLatexSuiteConfig(view);
    const ctx = Context.fromView(view);
    let success = false;
    /*
    * When backspace is pressed, if the cursor is inside an empty inline math,
    * delete both $ symbols, not just the first one.
    */
    if (settings.autoDelete$ && key === "Backspace" && ctx.mode.inMath()) {
        const charAtPos = getCharacterAtPos(view, ctx.pos);
        const charAtPrevPos = getCharacterAtPos(view, ctx.pos - 1);
        if (charAtPos === "$" && charAtPrevPos === "$") {
            replaceRange(view, ctx.pos - 1, ctx.pos + 1, "");
            // Note: not sure if removeAllTabstops is necessary
            removeAllTabstops(view);
            return true;
        }
    }
    console.log('settings.snippetsEnabled', settings.snippetsEnabled);
    if (settings.snippetsEnabled) {
        // Prevent IME from triggering keydown events.
        if (settings.suppressSnippetTriggerOnIME && isIME)
            return;
        // Allows Ctrl + z for undo, instead of triggering a snippet ending with z
        if (!ctrlKey) {
            try {
                success = runSnippets(view, ctx, key);
                console.log('success', success);
                if (success)
                    return true;
            }
            catch (e) {
                clearSnippetQueue(view);
                console.error(e);
            }
        }
    }
    if (key === "Tab") {
        success = setSelectionToNextTabstop(view);
        if (success)
            return true;
    }
    if (settings.autofractionEnabled && ctx.mode.strictlyInMath()) {
        if (key === "/") {
            success = runAutoFraction(view, ctx);
            if (success)
                return true;
        }
    }
    if (settings.matrixShortcutsEnabled && ctx.mode.blockMath) {
        if (["Tab", "Enter"].contains(key)) {
            success = runMatrixShortcuts(view, ctx, key, shiftKey);
            if (success)
                return true;
        }
    }
    if (settings.taboutEnabled) {
        if (key === "Tab" || shouldTaboutByCloseBracket(view, key)) {
            success = tabout(view, ctx);
            if (success)
                return true;
        }
    }
    return false;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF0ZXhfc3VpdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGF0ZXhfc3VpdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLDBCQUEwQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDdkUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN2RSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMxRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFL0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDckUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5ELE1BQU0sQ0FBQyxNQUFNLFlBQVksR0FBRyxDQUFDLE1BQWtCLEVBQUUsRUFBRTtJQUNsRCxNQUFNLFFBQVEsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFbkQseUVBQXlFO0lBQ3pFLHVFQUF1RTtJQUN2RSxJQUFJLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ2pDLGlCQUFpQixDQUFD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QUksQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDO1FBQy9ELElBQUksR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRXJDLElBQUksT0FBTztnQkFBRSxPQUFPLElBQUksQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksUUFBUSxDQUFDLHNCQUFzQixJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDM0QsSUFBSSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNwQyxPQUFPLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFdkQsSUFBSSxPQUFPO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDNUIsSUFBSSxHQUFHLEtBQUssS0FBSyxJQUFJLDBCQUEwQixDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzVELE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRTVCLElBQUksT0FBTztnQkFBRSxPQUFPLElBQUksQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1VwZGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcblxyXG5pbXBvcnQgeyBydW5TbmlwcGV0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL3J1bl9zbmlwcGV0c1wiO1xyXG5pbXBvcnQgeyBydW5BdXRvRnJhY3Rpb24gfSBmcm9tIFwiLi9mZWF0dXJlcy9hdXRvZnJhY3Rpb25cIjtcclxuaW1wb3J0IHsgdGFib3V0LCBzaG91bGRUYWJvdXRCeUNsb3NlQnJhY2tldCB9IGZyb20gXCIuL2ZlYXR1cmVzL3RhYm91dFwiO1xyXG5pbXBvcnQgeyBydW5NYXRyaXhTaG9ydGN1dHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9tYXRyaXhfc2hvcnRjdXRzXCI7XHJcblxyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vdXRpbHMvY29udGV4dFwiO1xyXG5pbXBvcnQgeyBnZXRDaGFyYWN0ZXJBdFBvcywgcmVwbGFjZVJhbmdlIH0gZnJvbSBcIi4vdXRpbHMvZWRpdG9yX3V0aWxzXCI7XHJcbmltcG9ydCB7IHNldFNlbGVjdGlvblRvTmV4dFRhYnN0b3AgfSBmcm9tIFwiLi9zbmlwcGV0cy9zbmlwcGV0X21hbmFnZW1lbnRcIjtcclxuaW1wb3J0IHsgcmVtb3ZlQWxsVGFic3RvcHMgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL3RhYnN0b3BzX3N0YXRlX2ZpZWxkXCI7XHJcbmltcG9ydCB7IGdldExhdGV4U3VpdGVDb25maWcgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL2NvbmZpZ1wiO1xyXG5pbXBvcnQgeyBjbGVhclNuaXBwZXRRdWV1ZSB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3Ivc25pcHBldF9xdWV1ZV9zdGF0ZV9maWVsZFwiO1xyXG5pbXBvcnQgeyBoYW5kbGVVbmRvUmVkbyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvaGlzdG9yeVwiO1xyXG5cclxuaW1wb3J0IHsgaGFuZGxlTWF0aFRvb2x0aXAgfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9tYXRoX3Rvb2x0aXBcIjtcclxuaW1wb3J0IHsgaXNDb21wb3NpbmcgfSBmcm9tIFwiLi91dGlscy9lZGl0b3JfdXRpbHNcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVVcGRhdGUgPSAodXBkYXRlOiBWaWV3VXBkYXRlKSA9PiB7XHJcblx0Y29uc3Qgc2V0dGluZ3MgPSBnZXRMYXRleFN1aXRlQ29uZmlnKHVwZGF0ZS5zdGF0ZSk7XHJcblxyXG5cdC8vIFRoZSBtYXRoIHRvb2x0aXAgaGFuZGxlciBpcyBkcml2ZW4gYnkgdmlldyB1cGRhdGVzIGJlY2F1c2UgaXQgdXRpbGl6ZXNcclxuXHQvLyBpbmZvcm1hdGlvbiBhYm91dCB2aXN1YWwgbGluZSwgd2hpY2ggaXMgbm90IGF2YWlsYWJsZSBpbiBFZGl0b3JTdGF0ZVxyXG5cdGlmIChzZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpIHtcclxuXHRcdGhhbmRsZU1hdGhUb29sdGlwKHVwZGF0ZSk7XHJcblx0fVxyXG5cclxuXHRoYW5kbGVVbmRvUmVkbyh1cGRhdGUpO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3Qgb25LZXlkb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50LCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XHJcblx0Y29uc29sZS5sb2coXCJkeGRjZnZnYlwiKVxyXG5cdGNvbnN0IHN1Y2Nlc3MgPSBoYW5kbGVLZXlkb3duKGV2ZW50LmtleSwgZXZlbnQuc2hpZnRLZXksIGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSwgaXNDb21wb3NpbmcodmlldywgZXZlbnQpLCB2aWV3KTtcclxuXHJcblx0aWYgKHN1Y2Nlc3MpIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVLZXlkb3duID0gKGtleTogc3RyaW5nLCBzaGlmdEtleTogYm9vbGVhbiwgY3RybEtleTogYm9vbGVhbiwgaXNJTUU6IGJvb2xlYW4sIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcclxuXHJcblx0Y29uc3Qgc2V0dGluZ3MgPSBnZXRMYXRleFN1aXRlQ29uZmlnKHZpZXcpO1xyXG5cdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblxyXG5cdGxldCBzdWNjZXNzID0gZmFsc2U7XHJcblxyXG5cdC8qXHJcblx0KiBXaGVuIGJhY2tzcGFjZSBpcyBwcmVzc2VkLCBpZiB0aGUgY3Vyc29yIGlzIGluc2lkZSBhbiBlbXB0eSBpbmxpbmUgbWF0aCxcclxuXHQqIGRlbGV0ZSBib3RoICQgc3ltYm9scywgbm90IGp1c3QgdGhlIGZpcnN0IG9uZS5cclxuXHQqL1xyXG5cdGlmIChzZXR0aW5ncy5hdXRvRGVsZXRlJCAmJiBrZXkgPT09IFwiQmFja3NwYWNlXCIgJiYgY3R4Lm1vZGUuaW5NYXRoKCkpIHtcclxuXHRcdGNvbnN0IGNoYXJBdFBvcyA9IGdldENoYXJhY3RlckF0UG9zKHZpZXcsIGN0eC5wb3MpO1xyXG5cdFx0Y29uc3QgY2hhckF0UHJldlBvcyA9IGdldENoYXJhY3RlckF0UG9zKHZpZXcsIGN0eC5wb3MgLSAxKTtcclxuXHJcblx0XHRpZiAoY2hhckF0UG9zID09PSBcIiRcIiAmJiBjaGFyQXRQcmV2UG9zID09PSBcIiRcIikge1xyXG5cdFx0XHRyZXBsYWNlUmFuZ2UodmlldywgY3R4LnBvcyAtIDEsIGN0eC5wb3MgKyAxLCBcIlwiKTtcclxuXHRcdFx0Ly8gTm90ZTogbm90IHN1cmUgaWYgcmVtb3ZlQWxsVGFic3RvcHMgaXMgbmVjZXNzYXJ5XHJcblx0XHRcdHJlbW92ZUFsbFRhYnN0b3BzKHZpZXcpO1xyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHR9XHJcblx0Y29uc29sZS5sb2coJ3NldHRpbmdzLnNuaXBwZXRzRW5hYmxlZCcsc2V0dGluZ3Muc25pcHBldHNFbmFibGVkKVxyXG5cdGlmIChzZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQpIHtcclxuXHJcblx0XHQvLyBQcmV2ZW50IElNRSBmcm9tIHRyaWdnZXJpbmcga2V5ZG93biBldmVudHMuXHJcblx0XHRpZiAoc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FICYmIGlzSU1FKSByZXR1cm47XHJcblxyXG5cdFx0Ly8gQWxsb3dzIEN0cmwgKyB6IGZvciB1bmRvLCBpbnN0ZWFkIG9mIHRyaWdnZXJpbmcgYSBzbmlwcGV0IGVuZGluZyB3aXRoIHpcclxuXHRcdGlmICghY3RybEtleSkge1xyXG5cdFx0XHR0cnkge1xyXG5cdFx0XHRcdHN1Y2Nlc3MgPSBydW5TbmlwcGV0cyh2aWV3LCBjdHgsIGtleSk7XHJcblx0XHRcdFx0Y29uc29sZS5sb2coJ3N1Y2Nlc3MnLHN1Y2Nlc3MpXHJcblx0XHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdFx0XHR9XHJcblx0XHRcdGNhdGNoIChlKSB7XHJcblx0XHRcdFx0Y2xlYXJTbmlwcGV0UXVldWUodmlldyk7XHJcblx0XHRcdFx0Y29uc29sZS5lcnJvcihlKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0aWYgKGtleSA9PT0gXCJUYWJcIikge1xyXG5cdFx0c3VjY2VzcyA9IHNldFNlbGVjdGlvblRvTmV4dFRhYnN0b3Aodmlldyk7XHJcblxyXG5cdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdH1cclxuXHJcblx0aWYgKHNldHRpbmdzLmF1dG9mcmFjdGlvbkVuYWJsZWQgJiYgY3R4Lm1vZGUuc3RyaWN0bHlJbk1hdGgoKSkge1xyXG5cdFx0aWYgKGtleSA9PT0gXCIvXCIpIHtcclxuXHRcdFx0c3VjY2VzcyA9IHJ1bkF1dG9GcmFjdGlvbih2aWV3LCBjdHgpO1xyXG5cclxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0aWYgKHNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQgJiYgY3R4Lm1vZGUuYmxvY2tNYXRoKSB7XHJcblx0XHRpZiAoW1wiVGFiXCIsIFwiRW50ZXJcIl0uY29udGFpbnMoa2V5KSkge1xyXG5cdFx0XHRzdWNjZXNzID0gcnVuTWF0cml4U2hvcnRjdXRzKHZpZXcsIGN0eCwga2V5LCBzaGlmdEtleSk7XHJcblxyXG5cdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRpZiAoc2V0dGluZ3MudGFib3V0RW5hYmxlZCkge1xyXG5cdFx0aWYgKGtleSA9PT0gXCJUYWJcIiB8fCBzaG91bGRUYWJvdXRCeUNsb3NlQnJhY2tldCh2aWV3LCBrZXkpKSB7XHJcblx0XHRcdHN1Y2Nlc3MgPSB0YWJvdXQodmlldywgY3R4KTtcclxuXHJcblx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiBmYWxzZTtcclxufVxyXG4iXX0=