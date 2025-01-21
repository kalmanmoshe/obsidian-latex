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
    if (!eqnBounds)
        return;
    let eqn = update.state.sliceDoc(eqnBounds.start, eqnBounds.end);
    const index = update.state.selection.main.head - eqnBounds.start;
    eqn = eqn.slice(0, index) + '{\\Huge\\color\\red\\mid}' + eqn.slice(index);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aF90b29sdGlwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2VkaXRvcl9leHRlbnNpb25zL21hdGhfdG9vbHRpcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQVcsV0FBVyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxVQUFVLEVBQWUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzVDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJFLE1BQU0sbUJBQW1CLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBYSxDQUFDO0FBRTVELE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQXFCO0lBQ3ZFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO0lBRWhCLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRTtRQUNsQixLQUFLLE1BQU0sTUFBTSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqQyxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUM7Z0JBQUUsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ3pELENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDcEUsQ0FBQyxDQUFDO0FB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RSxPQUFPLEtBQUssQ0FBQztJQUV0RCwrQkFBK0I7SUFDL0IsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2xDLElBQUksQ0FBQyxTQUFTO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFFN0IsaUNBQWlDO0lBQ2pDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbEUsSUFBSSxHQUFHLEtBQUssRUFBRTtRQUFFLE9BQU8sS0FBSyxDQUFDO0lBRTdCLE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUM7SUFDMUQsK0JBQStCLEVBQUU7UUFDaEMsZUFBZSxFQUFFLDZCQUE2QjtRQUM5QyxLQUFLLEVBQUUsb0JBQW9CO1FBQzNCLE1BQU0sRUFBRSxtREFBbUQ7UUFDM0QsT0FBTyxFQUFFLFNBQVM7UUFDbEIsWUFBWSxFQUFFLEtBQUs7UUFDbkIsNEJBQTRCLEVBQUU7WUFDN0IsY0FBYyxFQUFFLHlDQUF5QztZQUN6RCxpQkFBaUIsRUFBRSx5Q0FBeUM7U0FDNUQ7UUFDRCwyQkFBMkIsRUFBRTtZQUM1QixjQUFjLEVBQUUsNkJBQTZCO1lBQzdDLGlCQUFpQixFQUFFLDZCQUE2QjtTQUNoRDtRQUNELEtBQUssRUFBRTtZQUNOLE1BQU0sRUFBRSxLQUFLO1NBQ2I7UUFDRCxpQkFBaUIsRUFBRTtZQUNsQixPQUFPLEVBQUUsZ0JBQWdCO1NBQ3pCO0tBQ0Q7Q0FDRCxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sdGlwLCBzaG93VG9vbHRpcCwgRWRpdG9yVmlldywgVmlld1VwZGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcbmltcG9ydCB7IFN0YXRlRmllbGQsIEVkaXRvclN0YXRlLCBFZGl0b3JTZWxlY3Rpb24sIFN0YXRlRWZmZWN0IH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XHJcbmltcG9ydCB7IHJlbmRlck1hdGgsIGZpbmlzaFJlbmRlck1hdGgsIGVkaXRvckxpdmVQcmV2aWV3RmllbGQgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IHsgQ29udGV4dCB9IGZyb20gXCJzcmMvdXRpbHMvY29udGV4dFwiO1xyXG5pbXBvcnQgeyBnZXRMYXRleFN1aXRlQ29uZmlnIH0gZnJvbSBcInNyYy9zbmlwcGV0cy9jb2RlbWlycm9yL2NvbmZpZ1wiO1xyXG5cclxuY29uc3QgdXBkYXRlVG9vbHRpcEVmZmVjdCA9IFN0YXRlRWZmZWN0LmRlZmluZTxUb29sdGlwW10+KCk7XHJcblxyXG5leHBvcnQgY29uc3QgY3Vyc29yVG9vbHRpcEZpZWxkID0gU3RhdGVGaWVsZC5kZWZpbmU8cmVhZG9ubHkgVG9vbHRpcFtdPih7XHJcblx0Y3JlYXRlOiAoKSA9PiBbXSxcclxuXHJcblx0dXBkYXRlKHRvb2x0aXBzLCB0cikge1xyXG5cdFx0Zm9yIChjb25zdCBlZmZlY3Qgb2YgdHIuZWZmZWN0cykge1xyXG5cdFx0XHRpZiAoZWZmZWN0LmlzKHVwZGF0ZVRvb2x0aXBFZmZlY3QpKSByZXR1cm4gZWZmZWN0LnZhbHVlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0b29sdGlwcztcclxuXHR9LFxyXG5cclxuXHRwcm92aWRlOiAoZikgPT4gc2hvd1Rvb2x0aXAuY29tcHV0ZU4oW2ZdLCAoc3RhdGUpID0+IHN0YXRlLmZpZWxkKGYpKSxcclxufSk7XHJcblxyXG4vLyB1cGRhdGUgdGhlIHRvb2x0aXAgYnkgZGlzcGF0Y2hpbmcgYW4gdXBkYXRlVG9vbHRpcEVmZmVjdFxyXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlTWF0aFRvb2x0aXAodXBkYXRlOiBWaWV3VXBkYXRlKSB7XHJcblx0Y29uc3Qgc2hvdWxkVXBkYXRlID0gdXBkYXRlLmRvY0NoYW5nZWQgfHwgdXBkYXRlLnNlbGVjdGlvblNldDtcclxuXHRpZiAoIXNob3VsZFVwZGF0ZSkgcmV0dXJuO1xyXG5cclxuXHRjb25zdCBzZXR0aW5ncyA9IGdldExhdGV4U3VpdGVDb25maWcodXBkYXRlLnN0YXRlKTtcclxuXHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21TdGF0ZSh1cGRhdGUuc3RhdGUpO1xyXG5cclxuXHRpZiAoIXNob3VsZFNob3dUb29sdGlwKHVwZGF0ZS5zdGF0ZSwgY3R4KSkge1xyXG5cdFx0Y29uc3QgY3VyclRvb2x0aXBzID0gdXBkYXRlLnN0YXRlLmZpZWxkKGN1cnNvclRvb2x0aXBGaWVsZCk7XHJcblx0XHQvLyBhIGxpdHRsZSBvcHRpbWl6YXRpb246XHJcblx0XHQvLyBJZiB0aGUgdG9vbHRpcCBpcyBub3QgY3VycmVudGx5IHNob3duIGFuZCB0aGVyZSBpcyBubyBuZWVkIHRvIHNob3cgaXQsXHJcblx0XHQvLyB3ZSBkb24ndCBkaXNwYXRjaCBhbiB0cmFuc2FjdGlvbi5cclxuXHRcdGlmIChjdXJyVG9vbHRpcHMubGVuZ3RoID4gMCkge1xyXG5cdFx0XHR1cGRhdGUudmlldy5kaXNwYXRjaCh7XHJcblx0XHRcdFx0ZWZmZWN0czogW3VwZGF0ZVRvb2x0aXBFZmZlY3Qub2YoW10pXSxcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm47XHJcblx0fVxyXG5cclxuXHQvKlxyXG5cdCogcHJvY2VzcyB3aGVuIHRoZXJlIGlzIGEgbmVlZCB0byBzaG93IHRoZSB0b29sdGlwOiBmcm9tIGhlcmVcclxuXHQqL1xyXG5cclxuXHQvLyBIQUNLOiBlcW5Cb3VuZHMgaXMgbm90IG51bGwgYmVjYXVzZSBzaG91bGRTaG93VG9vbHRpcCB3YXMgdHJ1ZVxyXG5cdGNvbnN0IGVxbkJvdW5kcyA9IGN0eC5nZXRCb3VuZHMoKTtcclxuXHRpZighZXFuQm91bmRzKVxyXG5cdFx0cmV0dXJuXHJcblx0bGV0IGVxbiA9IHVwZGF0ZS5zdGF0ZS5zbGljZURvYyhlcW5Cb3VuZHMuc3RhcnQsIGVxbkJvdW5kcy5lbmQpO1xyXG5cdGNvbnN0IGluZGV4ID0gdXBkYXRlLnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQtZXFuQm91bmRzLnN0YXJ0O1xyXG5cclxuXHRlcW4gPSBlcW4uc2xpY2UoMCwgaW5kZXgpICsgJ3tcXFxcSHVnZVxcXFxjb2xvclxcXFxyZWRcXFxcbWlkfScgKyBlcW4uc2xpY2UoaW5kZXgpO1xyXG5cclxuXHRjb25zdCBhYm92ZSA9IHNldHRpbmdzLm1hdGhQcmV2aWV3UG9zaXRpb25Jc0Fib3ZlO1xyXG5cdGNvbnN0IGNyZWF0ZSA9ICgpID0+IHtcclxuXHRcdGNvbnN0IGRvbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblx0XHRkb20uYWRkQ2xhc3MoXCJjbS10b29sdGlwLWN1cnNvclwiKTtcclxuXHJcblx0XHRjb25zdCByZW5kZXJlZEVxbiA9IHJlbmRlck1hdGgoZXFuLCBjdHgubW9kZS5ibG9ja01hdGggfHwgY3R4Lm1vZGUuY29kZU1hdGgpO1xyXG5cdFx0ZG9tLmFwcGVuZENoaWxkKHJlbmRlcmVkRXFuKTtcclxuXHRcdGZpbmlzaFJlbmRlck1hdGgoKTtcclxuXHJcblx0XHRyZXR1cm4geyBkb20gfTtcclxuXHR9O1xyXG5cclxuXHRsZXQgbmV3VG9vbHRpcHM6IFRvb2x0aXBbXSA9IFtdO1xyXG5cclxuXHRpZiAoY3R4Lm1vZGUuYmxvY2tNYXRoIHx8IGN0eC5tb2RlLmNvZGVNYXRoKSB7XHJcblx0XHRuZXdUb29sdGlwcyA9IFt7XHJcblx0XHRcdHBvczogYWJvdmUgPyBlcW5Cb3VuZHMuc3RhcnQgOiBlcW5Cb3VuZHMuZW5kLFxyXG5cdFx0XHRhYm92ZTogYWJvdmUsXHJcblx0XHRcdHN0cmljdFNpZGU6IHRydWUsXHJcblx0XHRcdGFycm93OiB0cnVlLFxyXG5cdFx0XHRjcmVhdGU6IGNyZWF0ZSxcclxuXHRcdH1dO1xyXG5cdH0gZWxzZSBpZiAoY3R4Lm1vZGUuaW5saW5lTWF0aCAmJiBhYm92ZSkge1xyXG5cdFx0bmV3VG9vbHRpcHMgPSBbe1xyXG5cdFx0XHRwb3M6IGVxbkJvdW5kcy5zdGFydCxcclxuXHRcdFx0YWJvdmU6IHRydWUsXHJcblx0XHRcdHN0cmljdFNpZGU6IHRydWUsXHJcblx0XHRcdGFycm93OiB0cnVlLFxyXG5cdFx0XHRjcmVhdGU6IGNyZWF0ZSxcclxuXHRcdH1dO1xyXG5cdH0gZWxzZSBpZiAoY3R4Lm1vZGUuaW5saW5lTWF0aCAmJiAhYWJvdmUpIHtcclxuXHRcdGNvbnN0IGVuZFJhbmdlID0gRWRpdG9yU2VsZWN0aW9uLnJhbmdlKGVxbkJvdW5kcy5lbmQsIGVxbkJvdW5kcy5lbmQpO1xyXG5cclxuXHRcdG5ld1Rvb2x0aXBzID0gW3tcclxuXHRcdFx0cG9zOiBNYXRoLm1heChcclxuXHRcdFx0XHRlcW5Cb3VuZHMuc3RhcnQsXHJcblx0XHRcdFx0Ly8gdGhlIGJlZ2lubmluZyBwb3NpdGlvbiBvZiB0aGUgdmlzdWFsIGxpbmUgd2hlcmUgZXFuQm91bmRzLmVuZCBpc1xyXG5cdFx0XHRcdC8vIGxvY2F0ZWRcclxuXHRcdFx0XHR1cGRhdGUudmlldy5tb3ZlVG9MaW5lQm91bmRhcnkoZW5kUmFuZ2UsIGZhbHNlKS5hbmNob3IsXHJcblx0XHRcdCksXHJcblx0XHRcdGFib3ZlOiBmYWxzZSxcclxuXHRcdFx0c3RyaWN0U2lkZTogdHJ1ZSxcclxuXHRcdFx0YXJyb3c6IHRydWUsXHJcblx0XHRcdGNyZWF0ZTogY3JlYXRlLFxyXG5cdFx0fV07XHJcblx0fVxyXG5cclxuXHR1cGRhdGUudmlldy5kaXNwYXRjaCh7XHJcblx0XHRlZmZlY3RzOiBbdXBkYXRlVG9vbHRpcEVmZmVjdC5vZihuZXdUb29sdGlwcyldXHJcblx0fSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNob3VsZFNob3dUb29sdGlwKHN0YXRlOiBFZGl0b3JTdGF0ZSwgY3R4OiBDb250ZXh0KTogYm9vbGVhbiB7XHJcblx0aWYgKCFjdHgubW9kZS5pbk1hdGgoKSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuXHRjb25zdCBpc0xpdmVQcmV2aWV3ID0gc3RhdGUuZmllbGQoZWRpdG9yTGl2ZVByZXZpZXdGaWVsZCk7XHJcblx0aWYgKGN0eC5tb2RlLmJsb2NrTWF0aCAmJiBpc0xpdmVQcmV2aWV3KSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdC8vIEZJWE1FOiBlcW5Cb3VuZHMgY2FuIGJlIG51bGxcclxuXHRjb25zdCBlcW5Cb3VuZHMgPSBjdHguZ2V0Qm91bmRzKCk7XHJcblx0aWYgKCFlcW5Cb3VuZHMpIHJldHVybiBmYWxzZTtcclxuXHJcblx0Ly8gRG9uJ3QgcmVuZGVyIGFuIGVtcHR5IGVxdWF0aW9uXHJcblx0Y29uc3QgZXFuID0gc3RhdGUuc2xpY2VEb2MoZXFuQm91bmRzLnN0YXJ0LCBlcW5Cb3VuZHMuZW5kKS50cmltKCk7XHJcblx0aWYgKGVxbiA9PT0gXCJcIikgcmV0dXJuIGZhbHNlO1xyXG5cclxuXHRyZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IGN1cnNvclRvb2x0aXBCYXNlVGhlbWUgPSBFZGl0b3JWaWV3LmJhc2VUaGVtZSh7XHJcblx0XCIuY20tdG9vbHRpcC5jbS10b29sdGlwLWN1cnNvclwiOiB7XHJcblx0XHRiYWNrZ3JvdW5kQ29sb3I6IFwidmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnkpXCIsXHJcblx0XHRjb2xvcjogXCJ2YXIoLS10ZXh0LW5vcm1hbClcIixcclxuXHRcdGJvcmRlcjogXCIxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXItaG92ZXIpXCIsXHJcblx0XHRwYWRkaW5nOiBcIjRweCA2cHhcIixcclxuXHRcdGJvcmRlclJhZGl1czogXCI2cHhcIixcclxuXHRcdFwiJiAuY20tdG9vbHRpcC1hcnJvdzpiZWZvcmVcIjoge1xyXG5cdFx0XHRib3JkZXJUb3BDb2xvcjogXCJ2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlci1ob3ZlcilcIixcclxuXHRcdFx0Ym9yZGVyQm90dG9tQ29sb3I6IFwidmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXItaG92ZXIpXCIsXHJcblx0XHR9LFxyXG5cdFx0XCImIC5jbS10b29sdGlwLWFycm93OmFmdGVyXCI6IHtcclxuXHRcdFx0Ym9yZGVyVG9wQ29sb3I6IFwidmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnkpXCIsXHJcblx0XHRcdGJvcmRlckJvdHRvbUNvbG9yOiBcInZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KVwiLFxyXG5cdFx0fSxcclxuXHRcdFwiJiBwXCI6IHtcclxuXHRcdFx0bWFyZ2luOiBcIjBweFwiLFxyXG5cdFx0fSxcclxuXHRcdFwiJiBtangtY29udGFpbmVyXCI6IHtcclxuXHRcdFx0cGFkZGluZzogXCIycHggIWltcG9ydGFudFwiLFxyXG5cdFx0fSxcclxuXHR9XHJcbn0pO1xyXG4iXX0=