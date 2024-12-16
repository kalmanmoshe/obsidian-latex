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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3RlbXBDb2RlUnVubmVyRmlsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzFELE9BQU8sRUFBRSxNQUFNLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUN2RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDMUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFbkQsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFHLENBQUMsTUFBa0IsRUFBRSxFQUFFO0lBQ2xELE1BQU0sUUFBUSxHQUFHLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUVuRCx5RUFBeUU7SUFDekUsdUVBQXVFO0lBQ3ZFLElBQUksUUFBUSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFD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O1FBQy9ELElBQUksR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRXJDLElBQUksT0FBTztnQkFBRSxPQUFPLElBQUksQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksUUFBUSxDQUFDLHNCQUFzQixJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDM0QsSUFBSSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNwQyxPQUFPLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFdkQsSUFBSSxPQUFPO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDNUIsSUFBSSxHQUFHLEtBQUssS0FBSyxJQUFJLDBCQUEwQixDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzVELE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRTVCLElBQUksT0FBTztnQkFBRSxPQUFPLElBQUksQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1VwZGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcblxyXG5pbXBvcnQgeyBydW5TbmlwcGV0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL3J1bl9zbmlwcGV0c1wiO1xyXG5pbXBvcnQgeyBydW5BdXRvRnJhY3Rpb24gfSBmcm9tIFwiLi9mZWF0dXJlcy9hdXRvZnJhY3Rpb25cIjtcclxuaW1wb3J0IHsgdGFib3V0LCBzaG91bGRUYWJvdXRCeUNsb3NlQnJhY2tldCB9IGZyb20gXCIuL2ZlYXR1cmVzL3RhYm91dFwiO1xyXG5pbXBvcnQgeyBydW5NYXRyaXhTaG9ydGN1dHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9tYXRyaXhfc2hvcnRjdXRzXCI7XHJcblxyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vdXRpbHMvY29udGV4dFwiO1xyXG5pbXBvcnQgeyBnZXRDaGFyYWN0ZXJBdFBvcywgcmVwbGFjZVJhbmdlIH0gZnJvbSBcIi4vdXRpbHMvZWRpdG9yX3V0aWxzXCI7XHJcbmltcG9ydCB7IHNldFNlbGVjdGlvblRvTmV4dFRhYnN0b3AgfSBmcm9tIFwiLi9zbmlwcGV0cy9zbmlwcGV0X21hbmFnZW1lbnRcIjtcclxuaW1wb3J0IHsgcmVtb3ZlQWxsVGFic3RvcHMgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL3RhYnN0b3BzX3N0YXRlX2ZpZWxkXCI7XHJcbmltcG9ydCB7IGdldExhdGV4U3VpdGVDb25maWcgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL2NvbmZpZ1wiO1xyXG5pbXBvcnQgeyBjbGVhclNuaXBwZXRRdWV1ZSB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3Ivc25pcHBldF9xdWV1ZV9zdGF0ZV9maWVsZFwiO1xyXG5pbXBvcnQgeyBoYW5kbGVVbmRvUmVkbyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvaGlzdG9yeVwiO1xyXG5cclxuaW1wb3J0IHsgaGFuZGxlTWF0aFRvb2x0aXAgfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9tYXRoX3Rvb2x0aXBcIjtcclxuaW1wb3J0IHsgaXNDb21wb3NpbmcgfSBmcm9tIFwiLi91dGlscy9lZGl0b3JfdXRpbHNcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVVcGRhdGUgPSAodXBkYXRlOiBWaWV3VXBkYXRlKSA9PiB7XHJcblx0Y29uc3Qgc2V0dGluZ3MgPSBnZXRMYXRleFN1aXRlQ29uZmlnKHVwZGF0ZS5zdGF0ZSk7XHJcblxyXG5cdC8vIFRoZSBtYXRoIHRvb2x0aXAgaGFuZGxlciBpcyBkcml2ZW4gYnkgdmlldyB1cGRhdGVzIGJlY2F1c2UgaXQgdXRpbGl6ZXNcclxuXHQvLyBpbmZvcm1hdGlvbiBhYm91dCB2aXN1YWwgbGluZSwgd2hpY2ggaXMgbm90IGF2YWlsYWJsZSBpbiBFZGl0b3JTdGF0ZVxyXG5cdGlmIChzZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpIHtcclxuXHRcdGhhbmRsZU1hdGhUb29sdGlwKHVwZGF0ZSk7XHJcblx0fVxyXG5cclxuXHRoYW5kbGVVbmRvUmVkbyh1cGRhdGUpO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3Qgb25LZXlkb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50LCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XHJcblx0Y29uc3Qgc3VjY2VzcyA9IGhhbmRsZUtleWRvd24oZXZlbnQua2V5LCBldmVudC5zaGlmdEtleSwgZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5LCBpc0NvbXBvc2luZyh2aWV3LCBldmVudCksIHZpZXcpO1xyXG5cclxuXHRpZiAoc3VjY2VzcykgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IGhhbmRsZUtleWRvd24gPSAoa2V5OiBzdHJpbmcsIHNoaWZ0S2V5OiBib29sZWFuLCBjdHJsS2V5OiBib29sZWFuLCBpc0lNRTogYm9vbGVhbiwgdmlldzogRWRpdG9yVmlldykgPT4ge1xyXG5cclxuXHRjb25zdCBzZXR0aW5ncyA9IGdldExhdGV4U3VpdGVDb25maWcodmlldyk7XHJcblx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHJcblx0bGV0IHN1Y2Nlc3MgPSBmYWxzZTtcclxuXHJcblx0LypcclxuXHQqIFdoZW4gYmFja3NwYWNlIGlzIHByZXNzZWQsIGlmIHRoZSBjdXJzb3IgaXMgaW5zaWRlIGFuIGVtcHR5IGlubGluZSBtYXRoLFxyXG5cdCogZGVsZXRlIGJvdGggJCBzeW1ib2xzLCBub3QganVzdCB0aGUgZmlyc3Qgb25lLlxyXG5cdCovXHJcblx0aWYgKHNldHRpbmdzLmF1dG9EZWxldGUkICYmIGtleSA9PT0gXCJCYWNrc3BhY2VcIiAmJiBjdHgubW9kZS5pbk1hdGgoKSkge1xyXG5cdFx0Y29uc3QgY2hhckF0UG9zID0gZ2V0Q2hhcmFjdGVyQXRQb3ModmlldywgY3R4LnBvcyk7XHJcblx0XHRjb25zdCBjaGFyQXRQcmV2UG9zID0gZ2V0Q2hhcmFjdGVyQXRQb3ModmlldywgY3R4LnBvcyAtIDEpO1xyXG5cclxuXHRcdGlmIChjaGFyQXRQb3MgPT09IFwiJFwiICYmIGNoYXJBdFByZXZQb3MgPT09IFwiJFwiKSB7XHJcblx0XHRcdHJlcGxhY2VSYW5nZSh2aWV3LCBjdHgucG9zIC0gMSwgY3R4LnBvcyArIDEsIFwiXCIpO1xyXG5cdFx0XHQvLyBOb3RlOiBub3Qgc3VyZSBpZiByZW1vdmVBbGxUYWJzdG9wcyBpcyBuZWNlc3NhcnlcclxuXHRcdFx0cmVtb3ZlQWxsVGFic3RvcHModmlldyk7XHJcblx0XHRcdHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRjb25zb2xlLmxvZygnc2V0dGluZ3Muc25pcHBldHNFbmFibGVkJyxzZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQpXHJcblx0aWYgKHNldHRpbmdzLnNuaXBwZXRzRW5hYmxlZCkge1xyXG5cclxuXHRcdC8vIFByZXZlbnQgSU1FIGZyb20gdHJpZ2dlcmluZyBrZXlkb3duIGV2ZW50cy5cclxuXHRcdGlmIChzZXR0aW5ncy5zdXBwcmVzc1NuaXBwZXRUcmlnZ2VyT25JTUUgJiYgaXNJTUUpIHJldHVybjtcclxuXHJcblx0XHQvLyBBbGxvd3MgQ3RybCArIHogZm9yIHVuZG8sIGluc3RlYWQgb2YgdHJpZ2dlcmluZyBhIHNuaXBwZXQgZW5kaW5nIHdpdGggelxyXG5cdFx0aWYgKCFjdHJsS2V5KSB7XHJcblx0XHRcdHRyeSB7XHJcblx0XHRcdFx0c3VjY2VzcyA9IHJ1blNuaXBwZXRzKHZpZXcsIGN0eCwga2V5KTtcclxuXHRcdFx0XHRjb25zb2xlLmxvZygnc3VjY2Vzcycsc3VjY2VzcylcclxuXHRcdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0XHRcdH1cclxuXHRcdFx0Y2F0Y2ggKGUpIHtcclxuXHRcdFx0XHRjbGVhclNuaXBwZXRRdWV1ZSh2aWV3KTtcclxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGUpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRpZiAoa2V5ID09PSBcIlRhYlwiKSB7XHJcblx0XHRzdWNjZXNzID0gc2V0U2VsZWN0aW9uVG9OZXh0VGFic3RvcCh2aWV3KTtcclxuXHJcblx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0fVxyXG5cclxuXHRpZiAoc2V0dGluZ3MuYXV0b2ZyYWN0aW9uRW5hYmxlZCAmJiBjdHgubW9kZS5zdHJpY3RseUluTWF0aCgpKSB7XHJcblx0XHRpZiAoa2V5ID09PSBcIi9cIikge1xyXG5cdFx0XHRzdWNjZXNzID0gcnVuQXV0b0ZyYWN0aW9uKHZpZXcsIGN0eCk7XHJcblxyXG5cdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRpZiAoc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCAmJiBjdHgubW9kZS5ibG9ja01hdGgpIHtcclxuXHRcdGlmIChbXCJUYWJcIiwgXCJFbnRlclwiXS5jb250YWlucyhrZXkpKSB7XHJcblx0XHRcdHN1Y2Nlc3MgPSBydW5NYXRyaXhTaG9ydGN1dHModmlldywgY3R4LCBrZXksIHNoaWZ0S2V5KTtcclxuXHJcblx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGlmIChzZXR0aW5ncy50YWJvdXRFbmFibGVkKSB7XHJcblx0XHRpZiAoa2V5ID09PSBcIlRhYlwiIHx8IHNob3VsZFRhYm91dEJ5Q2xvc2VCcmFja2V0KHZpZXcsIGtleSkpIHtcclxuXHRcdFx0c3VjY2VzcyA9IHRhYm91dCh2aWV3LCBjdHgpO1xyXG5cclxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cmV0dXJuIGZhbHNlO1xyXG59XHJcbiJdfQ==