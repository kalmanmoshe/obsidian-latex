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
    if (settings.snippetsEnabled) {
        // Prevent IME from triggering keydown events.
        if (settings.suppressSnippetTriggerOnIME && isIME)
            return;
        // Allows Ctrl + z for undo, instead of triggering a snippet ending with z
        if (!ctrlKey) {
            try {
                success = runSnippets(view, ctx, key);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF0ZXhfc3VpdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGF0ZXhfc3VpdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLDBCQUEwQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDdkUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN2RSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMxRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFL0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDckUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5ELE1BQU0sQ0FBQyxNQUFNLFlBQVksR0FBRyxDQUFDLE1BQWtCLEVBQUUsRUFBRTtJQUNsRCxNQUFNLFFBQVEsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFbkQseUVBQXlFO0lBQ3pFLHVFQUF1RTtJQUN2RSxJQUFJLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ2pDLGlCQUFpQixDQUFD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QixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksUUFBUSxDQUFDLHNCQUFzQixJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDM0QsSUFBSSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNwQyxPQUFPLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFdkQsSUFBSSxPQUFPO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDNUIsSUFBSSxHQUFHLEtBQUssS0FBSyxJQUFJLDBCQUEwQixDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzVELE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRTVCLElBQUksT0FBTztnQkFBRSxPQUFPLElBQUksQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1VwZGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IHJ1blNuaXBwZXRzIH0gZnJvbSBcIi4vZmVhdHVyZXMvcnVuX3NuaXBwZXRzXCI7XG5pbXBvcnQgeyBydW5BdXRvRnJhY3Rpb24gfSBmcm9tIFwiLi9mZWF0dXJlcy9hdXRvZnJhY3Rpb25cIjtcbmltcG9ydCB7IHRhYm91dCwgc2hvdWxkVGFib3V0QnlDbG9zZUJyYWNrZXQgfSBmcm9tIFwiLi9mZWF0dXJlcy90YWJvdXRcIjtcbmltcG9ydCB7IHJ1bk1hdHJpeFNob3J0Y3V0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL21hdHJpeF9zaG9ydGN1dHNcIjtcblxuaW1wb3J0IHsgQ29udGV4dCB9IGZyb20gXCIuL3V0aWxzL2NvbnRleHRcIjtcbmltcG9ydCB7IGdldENoYXJhY3RlckF0UG9zLCByZXBsYWNlUmFuZ2UgfSBmcm9tIFwiLi91dGlscy9lZGl0b3JfdXRpbHNcIjtcbmltcG9ydCB7IHNldFNlbGVjdGlvblRvTmV4dFRhYnN0b3AgfSBmcm9tIFwiLi9zbmlwcGV0cy9zbmlwcGV0X21hbmFnZW1lbnRcIjtcbmltcG9ydCB7IHJlbW92ZUFsbFRhYnN0b3BzIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci90YWJzdG9wc19zdGF0ZV9maWVsZFwiO1xuaW1wb3J0IHsgZ2V0TGF0ZXhTdWl0ZUNvbmZpZyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvY29uZmlnXCI7XG5pbXBvcnQgeyBjbGVhclNuaXBwZXRRdWV1ZSB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3Ivc25pcHBldF9xdWV1ZV9zdGF0ZV9maWVsZFwiO1xuaW1wb3J0IHsgaGFuZGxlVW5kb1JlZG8gfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL2hpc3RvcnlcIjtcblxuaW1wb3J0IHsgaGFuZGxlTWF0aFRvb2x0aXAgfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9tYXRoX3Rvb2x0aXBcIjtcbmltcG9ydCB7IGlzQ29tcG9zaW5nIH0gZnJvbSBcIi4vdXRpbHMvZWRpdG9yX3V0aWxzXCI7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVVcGRhdGUgPSAodXBkYXRlOiBWaWV3VXBkYXRlKSA9PiB7XG5cdGNvbnN0IHNldHRpbmdzID0gZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh1cGRhdGUuc3RhdGUpO1xuXG5cdC8vIFRoZSBtYXRoIHRvb2x0aXAgaGFuZGxlciBpcyBkcml2ZW4gYnkgdmlldyB1cGRhdGVzIGJlY2F1c2UgaXQgdXRpbGl6ZXNcblx0Ly8gaW5mb3JtYXRpb24gYWJvdXQgdmlzdWFsIGxpbmUsIHdoaWNoIGlzIG5vdCBhdmFpbGFibGUgaW4gRWRpdG9yU3RhdGVcblx0aWYgKHNldHRpbmdzLm1hdGhQcmV2aWV3RW5hYmxlZCkge1xuXHRcdGhhbmRsZU1hdGhUb29sdGlwKHVwZGF0ZSk7XG5cdH1cblxuXHRoYW5kbGVVbmRvUmVkbyh1cGRhdGUpO1xufVxuXG5leHBvcnQgY29uc3Qgb25LZXlkb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50LCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XG5cdGNvbnN0IHN1Y2Nlc3MgPSBoYW5kbGVLZXlkb3duKGV2ZW50LmtleSwgZXZlbnQuc2hpZnRLZXksIGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSwgaXNDb21wb3NpbmcodmlldywgZXZlbnQpLCB2aWV3KTtcblxuXHRpZiAoc3VjY2VzcykgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZUtleWRvd24gPSAoa2V5OiBzdHJpbmcsIHNoaWZ0S2V5OiBib29sZWFuLCBjdHJsS2V5OiBib29sZWFuLCBpc0lNRTogYm9vbGVhbiwgdmlldzogRWRpdG9yVmlldykgPT4ge1xuXG5cdGNvbnN0IHNldHRpbmdzID0gZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh2aWV3KTtcblx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcblxuXHRsZXQgc3VjY2VzcyA9IGZhbHNlO1xuXG5cdC8qXG5cdCogV2hlbiBiYWNrc3BhY2UgaXMgcHJlc3NlZCwgaWYgdGhlIGN1cnNvciBpcyBpbnNpZGUgYW4gZW1wdHkgaW5saW5lIG1hdGgsXG5cdCogZGVsZXRlIGJvdGggJCBzeW1ib2xzLCBub3QganVzdCB0aGUgZmlyc3Qgb25lLlxuXHQqL1xuXHRpZiAoc2V0dGluZ3MuYXV0b0RlbGV0ZSQgJiYga2V5ID09PSBcIkJhY2tzcGFjZVwiICYmIGN0eC5tb2RlLmluTWF0aCgpKSB7XG5cdFx0Y29uc3QgY2hhckF0UG9zID0gZ2V0Q2hhcmFjdGVyQXRQb3ModmlldywgY3R4LnBvcyk7XG5cdFx0Y29uc3QgY2hhckF0UHJldlBvcyA9IGdldENoYXJhY3RlckF0UG9zKHZpZXcsIGN0eC5wb3MgLSAxKTtcblxuXHRcdGlmIChjaGFyQXRQb3MgPT09IFwiJFwiICYmIGNoYXJBdFByZXZQb3MgPT09IFwiJFwiKSB7XG5cdFx0XHRyZXBsYWNlUmFuZ2UodmlldywgY3R4LnBvcyAtIDEsIGN0eC5wb3MgKyAxLCBcIlwiKTtcblx0XHRcdC8vIE5vdGU6IG5vdCBzdXJlIGlmIHJlbW92ZUFsbFRhYnN0b3BzIGlzIG5lY2Vzc2FyeVxuXHRcdFx0cmVtb3ZlQWxsVGFic3RvcHModmlldyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRpZiAoc2V0dGluZ3Muc25pcHBldHNFbmFibGVkKSB7XG5cblx0XHQvLyBQcmV2ZW50IElNRSBmcm9tIHRyaWdnZXJpbmcga2V5ZG93biBldmVudHMuXG5cdFx0aWYgKHNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSAmJiBpc0lNRSkgcmV0dXJuO1xuXG5cdFx0Ly8gQWxsb3dzIEN0cmwgKyB6IGZvciB1bmRvLCBpbnN0ZWFkIG9mIHRyaWdnZXJpbmcgYSBzbmlwcGV0IGVuZGluZyB3aXRoIHpcblx0XHRpZiAoIWN0cmxLZXkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN1Y2Nlc3MgPSBydW5TbmlwcGV0cyh2aWV3LCBjdHgsIGtleSk7XG5cdFx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhdGNoIChlKSB7XG5cdFx0XHRcdGNsZWFyU25pcHBldFF1ZXVlKHZpZXcpO1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChrZXkgPT09IFwiVGFiXCIpIHtcblx0XHRzdWNjZXNzID0gc2V0U2VsZWN0aW9uVG9OZXh0VGFic3RvcCh2aWV3KTtcblxuXHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChzZXR0aW5ncy5hdXRvZnJhY3Rpb25FbmFibGVkICYmIGN0eC5tb2RlLnN0cmljdGx5SW5NYXRoKCkpIHtcblx0XHRpZiAoa2V5ID09PSBcIi9cIikge1xuXHRcdFx0c3VjY2VzcyA9IHJ1bkF1dG9GcmFjdGlvbih2aWV3LCBjdHgpO1xuXG5cdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQgJiYgY3R4Lm1vZGUuYmxvY2tNYXRoKSB7XG5cdFx0aWYgKFtcIlRhYlwiLCBcIkVudGVyXCJdLmNvbnRhaW5zKGtleSkpIHtcblx0XHRcdHN1Y2Nlc3MgPSBydW5NYXRyaXhTaG9ydGN1dHModmlldywgY3R4LCBrZXksIHNoaWZ0S2V5KTtcblxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGlmIChzZXR0aW5ncy50YWJvdXRFbmFibGVkKSB7XG5cdFx0aWYgKGtleSA9PT0gXCJUYWJcIiB8fCBzaG91bGRUYWJvdXRCeUNsb3NlQnJhY2tldCh2aWV3LCBrZXkpKSB7XG5cdFx0XHRzdWNjZXNzID0gdGFib3V0KHZpZXcsIGN0eCk7XG5cblx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG4iXX0=