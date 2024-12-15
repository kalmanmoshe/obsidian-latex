import { showTooltip, EditorView } from "@codemirror/view";
import { StateField, EditorSelection, StateEffect } from "@codemirror/state";
import { renderMath, finishRenderMath, editorLivePreviewField } from "obsidian";
import { Context } from "src/utils/context";
import { getLatexSuiteConfig } from "src/snippets/codemirror/config";
const updateTooltipEffect = StateEffect.define();
export const cursorTooltipField = StateField.define({
    create: () => [],
    update(tooltips, tr) {
        for (const effect of tr.effects) {
            if (effect.is(updateTooltipEffect))
                return effect.value;
        }
        return tooltips;
    },
    provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
});
// update the tooltip by dispatching an updateTooltipEffect
export function handleMathTooltip(update) {
    const shouldUpdate = update.docChanged || update.selectionSet;
    if (!shouldUpdate)
        return;
    const settings = getLatexSuiteConfig(update.state);
    const ctx = Context.fromState(update.state);
    if (!shouldShowTooltip(update.state, ctx)) {
        const currTooltips = update.state.field(cursorTooltipField);
        // a little optimization:
        // If the tooltip is not currently shown and there is no need to show it,
        // we don't dispatch an transaction.
        if (currTooltips.length > 0) {
            update.view.dispatch({
                effects: [updateTooltipEffect.of([])],
            });
        }
        return;
    }
    /*
    * process when there is a need to show the tooltip: from here
    */
    // HACK: eqnBounds is not null because shouldShowTooltip was true
    const eqnBounds = ctx.getBounds();
    const eqn = update.state.sliceDoc(eqnBounds.start, eqnBounds.end);
    const above = settings.mathPreviewPositionIsAbove;
    const create = () => {
        const dom = document.createElement("div");
        dom.addClass("cm-tooltip-cursor");
        const renderedEqn = renderMath(eqn, ctx.mode.blockMath || ctx.mode.codeMath);
        dom.appendChild(renderedEqn);
        finishRenderMath();
        return { dom };
    };
    let newTooltips = [];
    if (ctx.mode.blockMath || ctx.mode.codeMath) {
        newTooltips = [{
                pos: above ? eqnBounds.start : eqnBounds.end,
                above: above,
                strictSide: true,
                arrow: true,
                create: create,
            }];
    }
    else if (ctx.mode.inlineMath && above) {
        newTooltips = [{
                pos: eqnBounds.start,
                above: true,
                strictSide: true,
                arrow: true,
                create: create,
            }];
    }
    else if (ctx.mode.inlineMath && !above) {
        const endRange = EditorSelection.range(eqnBounds.end, eqnBounds.end);
        newTooltips = [{
                pos: Math.max(eqnBounds.start, 
                // the beginning position of the visual line where eqnBounds.end is
                // located
                update.view.moveToLineBoundary(endRange, false).anchor),
                above: false,
                strictSide: true,
                arrow: true,
                create: create,
            }];
    }
    update.view.dispatch({
        effects: [updateTooltipEffect.of(newTooltips)]
    });
}
function shouldShowTooltip(state, ctx) {
    if (!ctx.mode.inMath())
        return false;
    const isLivePreview = state.field(editorLivePreviewField);
    if (ctx.mode.blockMath && isLivePreview)
        return false;
    // FIXME: eqnBounds can be null
    const eqnBounds = ctx.getBounds();
    if (!eqnBounds)
        return false;
    // Don't render an empty equation
    const eqn = state.sliceDoc(eqnBounds.start, eqnBounds.end).trim();
    if (eqn === "")
        return false;
    return true;
}
export const cursorTooltipBaseTheme = EditorView.baseTheme({
    ".cm-tooltip.cm-tooltip-cursor": {
        backgroundColor: "var(--background-secondary)",
        color: "var(--text-normal)",
        border: "1px solid var(--background-modifier-border-hover)",
        padding: "4px 6px",
        borderRadius: "6px",
        "& .cm-tooltip-arrow:before": {
            borderTopColor: "var(--background-modifier-border-hover)",
            borderBottomColor: "var(--background-modifier-border-hover)",
        },
        "& .cm-tooltip-arrow:after": {
            borderTopColor: "var(--background-secondary)",
            borderBottomColor: "var(--background-secondary)",
        },
        "& p": {
            margin: "0px",
        },
        "& mjx-container": {
            padding: "2px !important",
        },
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aF90b29sdGlwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2VkaXRvcl9leHRlbnNpb25zL21hdGhfdG9vbHRpcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQVcsV0FBVyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxVQUFVLEVBQWUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzVDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJFLE1BQU0sbUJBQW1CLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBYSxDQUFDO0FBRTVELE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQXFCO0lBQ3ZFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO0lBRWhCLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRTtRQUNsQixLQUFLLE1BQU0sTUFBTSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqQyxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUM7Z0JBQUUsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ3pELENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDcEUsQ0FBQyxDQUFDO0FB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QztJQUNsRSxJQUFJLEdBQUcsS0FBSyxFQUFFO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFFN0IsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQztJQUMxRCwrQkFBK0IsRUFBRTtRQUNoQyxlQUFlLEVBQUUsNkJBQTZCO1FBQzlDLEtBQUssRUFBRSxvQkFBb0I7UUFDM0IsTUFBTSxFQUFFLG1EQUFtRDtRQUMzRCxPQUFPLEVBQUUsU0FBUztRQUNsQixZQUFZLEVBQUUsS0FBSztRQUNuQiw0QkFBNEIsRUFBRTtZQUM3QixjQUFjLEVBQUUseUNBQXlDO1lBQ3pELGlCQUFpQixFQUFFLHlDQUF5QztTQUM1RDtRQUNELDJCQUEyQixFQUFFO1lBQzVCLGNBQWMsRUFBRSw2QkFBNkI7WUFDN0MsaUJBQWlCLEVBQUUsNkJBQTZCO1NBQ2hEO1FBQ0QsS0FBSyxFQUFFO1lBQ04sTUFBTSxFQUFFLEtBQUs7U0FDYjtRQUNELGlCQUFpQixFQUFFO1lBQ2xCLE9BQU8sRUFBRSxnQkFBZ0I7U0FDekI7S0FDRDtDQUNELENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRvb2x0aXAsIHNob3dUb29sdGlwLCBFZGl0b3JWaWV3LCBWaWV3VXBkYXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7IFN0YXRlRmllbGQsIEVkaXRvclN0YXRlLCBFZGl0b3JTZWxlY3Rpb24sIFN0YXRlRWZmZWN0IH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyByZW5kZXJNYXRoLCBmaW5pc2hSZW5kZXJNYXRoLCBlZGl0b3JMaXZlUHJldmlld0ZpZWxkIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcInNyYy91dGlscy9jb250ZXh0XCI7XG5pbXBvcnQgeyBnZXRMYXRleFN1aXRlQ29uZmlnIH0gZnJvbSBcInNyYy9zbmlwcGV0cy9jb2RlbWlycm9yL2NvbmZpZ1wiO1xuXG5jb25zdCB1cGRhdGVUb29sdGlwRWZmZWN0ID0gU3RhdGVFZmZlY3QuZGVmaW5lPFRvb2x0aXBbXT4oKTtcblxuZXhwb3J0IGNvbnN0IGN1cnNvclRvb2x0aXBGaWVsZCA9IFN0YXRlRmllbGQuZGVmaW5lPHJlYWRvbmx5IFRvb2x0aXBbXT4oe1xuXHRjcmVhdGU6ICgpID0+IFtdLFxuXG5cdHVwZGF0ZSh0b29sdGlwcywgdHIpIHtcblx0XHRmb3IgKGNvbnN0IGVmZmVjdCBvZiB0ci5lZmZlY3RzKSB7XG5cdFx0XHRpZiAoZWZmZWN0LmlzKHVwZGF0ZVRvb2x0aXBFZmZlY3QpKSByZXR1cm4gZWZmZWN0LnZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b29sdGlwcztcblx0fSxcblxuXHRwcm92aWRlOiAoZikgPT4gc2hvd1Rvb2x0aXAuY29tcHV0ZU4oW2ZdLCAoc3RhdGUpID0+IHN0YXRlLmZpZWxkKGYpKSxcbn0pO1xuXG4vLyB1cGRhdGUgdGhlIHRvb2x0aXAgYnkgZGlzcGF0Y2hpbmcgYW4gdXBkYXRlVG9vbHRpcEVmZmVjdFxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZU1hdGhUb29sdGlwKHVwZGF0ZTogVmlld1VwZGF0ZSkge1xuXHRjb25zdCBzaG91bGRVcGRhdGUgPSB1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUuc2VsZWN0aW9uU2V0O1xuXHRpZiAoIXNob3VsZFVwZGF0ZSkgcmV0dXJuO1xuXG5cdGNvbnN0IHNldHRpbmdzID0gZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh1cGRhdGUuc3RhdGUpO1xuXHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21TdGF0ZSh1cGRhdGUuc3RhdGUpO1xuXG5cdGlmICghc2hvdWxkU2hvd1Rvb2x0aXAodXBkYXRlLnN0YXRlLCBjdHgpKSB7XG5cdFx0Y29uc3QgY3VyclRvb2x0aXBzID0gdXBkYXRlLnN0YXRlLmZpZWxkKGN1cnNvclRvb2x0aXBGaWVsZCk7XG5cdFx0Ly8gYSBsaXR0bGUgb3B0aW1pemF0aW9uOlxuXHRcdC8vIElmIHRoZSB0b29sdGlwIGlzIG5vdCBjdXJyZW50bHkgc2hvd24gYW5kIHRoZXJlIGlzIG5vIG5lZWQgdG8gc2hvdyBpdCxcblx0XHQvLyB3ZSBkb24ndCBkaXNwYXRjaCBhbiB0cmFuc2FjdGlvbi5cblx0XHRpZiAoY3VyclRvb2x0aXBzLmxlbmd0aCA+IDApIHtcblx0XHRcdHVwZGF0ZS52aWV3LmRpc3BhdGNoKHtcblx0XHRcdFx0ZWZmZWN0czogW3VwZGF0ZVRvb2x0aXBFZmZlY3Qub2YoW10pXSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHQvKlxuXHQqIHByb2Nlc3Mgd2hlbiB0aGVyZSBpcyBhIG5lZWQgdG8gc2hvdyB0aGUgdG9vbHRpcDogZnJvbSBoZXJlXG5cdCovXG5cblx0Ly8gSEFDSzogZXFuQm91bmRzIGlzIG5vdCBudWxsIGJlY2F1c2Ugc2hvdWxkU2hvd1Rvb2x0aXAgd2FzIHRydWVcblx0Y29uc3QgZXFuQm91bmRzID0gY3R4LmdldEJvdW5kcygpO1xuXHRjb25zdCBlcW4gPSB1cGRhdGUuc3RhdGUuc2xpY2VEb2MoZXFuQm91bmRzLnN0YXJ0LCBlcW5Cb3VuZHMuZW5kKTtcblxuXHRjb25zdCBhYm92ZSA9IHNldHRpbmdzLm1hdGhQcmV2aWV3UG9zaXRpb25Jc0Fib3ZlO1xuXHRjb25zdCBjcmVhdGUgPSAoKSA9PiB7XG5cdFx0Y29uc3QgZG9tID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRkb20uYWRkQ2xhc3MoXCJjbS10b29sdGlwLWN1cnNvclwiKTtcblxuXHRcdGNvbnN0IHJlbmRlcmVkRXFuID0gcmVuZGVyTWF0aChlcW4sIGN0eC5tb2RlLmJsb2NrTWF0aCB8fCBjdHgubW9kZS5jb2RlTWF0aCk7XG5cdFx0ZG9tLmFwcGVuZENoaWxkKHJlbmRlcmVkRXFuKTtcblx0XHRmaW5pc2hSZW5kZXJNYXRoKCk7XG5cblx0XHRyZXR1cm4geyBkb20gfTtcblx0fTtcblxuXHRsZXQgbmV3VG9vbHRpcHM6IFRvb2x0aXBbXSA9IFtdO1xuXG5cdGlmIChjdHgubW9kZS5ibG9ja01hdGggfHwgY3R4Lm1vZGUuY29kZU1hdGgpIHtcblx0XHRuZXdUb29sdGlwcyA9IFt7XG5cdFx0XHRwb3M6IGFib3ZlID8gZXFuQm91bmRzLnN0YXJ0IDogZXFuQm91bmRzLmVuZCxcblx0XHRcdGFib3ZlOiBhYm92ZSxcblx0XHRcdHN0cmljdFNpZGU6IHRydWUsXG5cdFx0XHRhcnJvdzogdHJ1ZSxcblx0XHRcdGNyZWF0ZTogY3JlYXRlLFxuXHRcdH1dO1xuXHR9IGVsc2UgaWYgKGN0eC5tb2RlLmlubGluZU1hdGggJiYgYWJvdmUpIHtcblx0XHRuZXdUb29sdGlwcyA9IFt7XG5cdFx0XHRwb3M6IGVxbkJvdW5kcy5zdGFydCxcblx0XHRcdGFib3ZlOiB0cnVlLFxuXHRcdFx0c3RyaWN0U2lkZTogdHJ1ZSxcblx0XHRcdGFycm93OiB0cnVlLFxuXHRcdFx0Y3JlYXRlOiBjcmVhdGUsXG5cdFx0fV07XG5cdH0gZWxzZSBpZiAoY3R4Lm1vZGUuaW5saW5lTWF0aCAmJiAhYWJvdmUpIHtcblx0XHRjb25zdCBlbmRSYW5nZSA9IEVkaXRvclNlbGVjdGlvbi5yYW5nZShlcW5Cb3VuZHMuZW5kLCBlcW5Cb3VuZHMuZW5kKTtcblxuXHRcdG5ld1Rvb2x0aXBzID0gW3tcblx0XHRcdHBvczogTWF0aC5tYXgoXG5cdFx0XHRcdGVxbkJvdW5kcy5zdGFydCxcblx0XHRcdFx0Ly8gdGhlIGJlZ2lubmluZyBwb3NpdGlvbiBvZiB0aGUgdmlzdWFsIGxpbmUgd2hlcmUgZXFuQm91bmRzLmVuZCBpc1xuXHRcdFx0XHQvLyBsb2NhdGVkXG5cdFx0XHRcdHVwZGF0ZS52aWV3Lm1vdmVUb0xpbmVCb3VuZGFyeShlbmRSYW5nZSwgZmFsc2UpLmFuY2hvcixcblx0XHRcdCksXG5cdFx0XHRhYm92ZTogZmFsc2UsXG5cdFx0XHRzdHJpY3RTaWRlOiB0cnVlLFxuXHRcdFx0YXJyb3c6IHRydWUsXG5cdFx0XHRjcmVhdGU6IGNyZWF0ZSxcblx0XHR9XTtcblx0fVxuXG5cdHVwZGF0ZS52aWV3LmRpc3BhdGNoKHtcblx0XHRlZmZlY3RzOiBbdXBkYXRlVG9vbHRpcEVmZmVjdC5vZihuZXdUb29sdGlwcyldXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBzaG91bGRTaG93VG9vbHRpcChzdGF0ZTogRWRpdG9yU3RhdGUsIGN0eDogQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRpZiAoIWN0eC5tb2RlLmluTWF0aCgpKSByZXR1cm4gZmFsc2U7XG5cblx0Y29uc3QgaXNMaXZlUHJldmlldyA9IHN0YXRlLmZpZWxkKGVkaXRvckxpdmVQcmV2aWV3RmllbGQpO1xuXHRpZiAoY3R4Lm1vZGUuYmxvY2tNYXRoICYmIGlzTGl2ZVByZXZpZXcpIHJldHVybiBmYWxzZTtcblxuXHQvLyBGSVhNRTogZXFuQm91bmRzIGNhbiBiZSBudWxsXG5cdGNvbnN0IGVxbkJvdW5kcyA9IGN0eC5nZXRCb3VuZHMoKTtcblx0aWYgKCFlcW5Cb3VuZHMpIHJldHVybiBmYWxzZTtcblxuXHQvLyBEb24ndCByZW5kZXIgYW4gZW1wdHkgZXF1YXRpb25cblx0Y29uc3QgZXFuID0gc3RhdGUuc2xpY2VEb2MoZXFuQm91bmRzLnN0YXJ0LCBlcW5Cb3VuZHMuZW5kKS50cmltKCk7XG5cdGlmIChlcW4gPT09IFwiXCIpIHJldHVybiBmYWxzZTtcblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGNvbnN0IGN1cnNvclRvb2x0aXBCYXNlVGhlbWUgPSBFZGl0b3JWaWV3LmJhc2VUaGVtZSh7XG5cdFwiLmNtLXRvb2x0aXAuY20tdG9vbHRpcC1jdXJzb3JcIjoge1xuXHRcdGJhY2tncm91bmRDb2xvcjogXCJ2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSlcIixcblx0XHRjb2xvcjogXCJ2YXIoLS10ZXh0LW5vcm1hbClcIixcblx0XHRib3JkZXI6IFwiMXB4IHNvbGlkIHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyLWhvdmVyKVwiLFxuXHRcdHBhZGRpbmc6IFwiNHB4IDZweFwiLFxuXHRcdGJvcmRlclJhZGl1czogXCI2cHhcIixcblx0XHRcIiYgLmNtLXRvb2x0aXAtYXJyb3c6YmVmb3JlXCI6IHtcblx0XHRcdGJvcmRlclRvcENvbG9yOiBcInZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyLWhvdmVyKVwiLFxuXHRcdFx0Ym9yZGVyQm90dG9tQ29sb3I6IFwidmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXItaG92ZXIpXCIsXG5cdFx0fSxcblx0XHRcIiYgLmNtLXRvb2x0aXAtYXJyb3c6YWZ0ZXJcIjoge1xuXHRcdFx0Ym9yZGVyVG9wQ29sb3I6IFwidmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnkpXCIsXG5cdFx0XHRib3JkZXJCb3R0b21Db2xvcjogXCJ2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSlcIixcblx0XHR9LFxuXHRcdFwiJiBwXCI6IHtcblx0XHRcdG1hcmdpbjogXCIwcHhcIixcblx0XHR9LFxuXHRcdFwiJiBtangtY29udGFpbmVyXCI6IHtcblx0XHRcdHBhZGRpbmc6IFwiMnB4ICFpbXBvcnRhbnRcIixcblx0XHR9LFxuXHR9XG59KTtcbiJdfQ==