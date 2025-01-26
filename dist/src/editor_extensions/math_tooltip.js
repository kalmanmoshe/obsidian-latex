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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aF90b29sdGlwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2VkaXRvcl9leHRlbnNpb25zL21hdGhfdG9vbHRpcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQVcsV0FBVyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxVQUFVLEVBQWUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzVDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJFLE1BQU0sbUJBQW1CLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBYSxDQUFDO0FBRTVELE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQXFCO0lBQ3ZFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO0lBRWhCLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRTtRQUNsQixLQUFLLE1BQU0sTUFBTSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqQyxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUM7Z0JBQUUsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ3pELENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDcEUsQ0FBQyxDQUFDO0FB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RSxPQUFPLEtBQUssQ0FBQztJQUV0RCwrQkFBK0I7SUFDL0IsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2xDLElBQUksQ0FBQyxTQUFTO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFFN0IsaUNBQWlDO0lBQ2pDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbEUsSUFBSSxHQUFHLEtBQUssRUFBRTtRQUFFLE9BQU8sS0FBSyxDQUFDO0lBRTdCLE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUM7SUFDMUQsK0JBQStCLEVBQUU7UUFDaEMsZUFBZSxFQUFFLDZCQUE2QjtRQUM5QyxLQUFLLEVBQUUsb0JBQW9CO1FBQzNCLE1BQU0sRUFBRSxtREFBbUQ7UUFDM0QsT0FBTyxFQUFFLFNBQVM7UUFDbEIsWUFBWSxFQUFFLEtBQUs7UUFDbkIsNEJBQTRCLEVBQUU7WUFDN0IsY0FBYyxFQUFFLHlDQUF5QztZQUN6RCxpQkFBaUIsRUFBRSx5Q0FBeUM7U0FDNUQ7UUFDRCwyQkFBMkIsRUFBRTtZQUM1QixjQUFjLEVBQUUsNkJBQTZCO1lBQzdDLGlCQUFpQixFQUFFLDZCQUE2QjtTQUNoRDtRQUNELEtBQUssRUFBRTtZQUNOLE1BQU0sRUFBRSxLQUFLO1NBQ2I7UUFDRCxpQkFBaUIsRUFBRTtZQUNsQixPQUFPLEVBQUUsZ0JBQWdCO1NBQ3pCO0tBQ0Q7Q0FDRCxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sdGlwLCBzaG93VG9vbHRpcCwgRWRpdG9yVmlldywgVmlld1VwZGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5pbXBvcnQgeyBTdGF0ZUZpZWxkLCBFZGl0b3JTdGF0ZSwgRWRpdG9yU2VsZWN0aW9uLCBTdGF0ZUVmZmVjdCB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgcmVuZGVyTWF0aCwgZmluaXNoUmVuZGVyTWF0aCwgZWRpdG9yTGl2ZVByZXZpZXdGaWVsZCB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgQ29udGV4dCB9IGZyb20gXCJzcmMvdXRpbHMvY29udGV4dFwiO1xuaW1wb3J0IHsgZ2V0TGF0ZXhTdWl0ZUNvbmZpZyB9IGZyb20gXCJzcmMvc25pcHBldHMvY29kZW1pcnJvci9jb25maWdcIjtcblxuY29uc3QgdXBkYXRlVG9vbHRpcEVmZmVjdCA9IFN0YXRlRWZmZWN0LmRlZmluZTxUb29sdGlwW10+KCk7XG5cbmV4cG9ydCBjb25zdCBjdXJzb3JUb29sdGlwRmllbGQgPSBTdGF0ZUZpZWxkLmRlZmluZTxyZWFkb25seSBUb29sdGlwW10+KHtcblx0Y3JlYXRlOiAoKSA9PiBbXSxcblxuXHR1cGRhdGUodG9vbHRpcHMsIHRyKSB7XG5cdFx0Zm9yIChjb25zdCBlZmZlY3Qgb2YgdHIuZWZmZWN0cykge1xuXHRcdFx0aWYgKGVmZmVjdC5pcyh1cGRhdGVUb29sdGlwRWZmZWN0KSkgcmV0dXJuIGVmZmVjdC52YWx1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9vbHRpcHM7XG5cdH0sXG5cblx0cHJvdmlkZTogKGYpID0+IHNob3dUb29sdGlwLmNvbXB1dGVOKFtmXSwgKHN0YXRlKSA9PiBzdGF0ZS5maWVsZChmKSksXG59KTtcblxuLy8gdXBkYXRlIHRoZSB0b29sdGlwIGJ5IGRpc3BhdGNoaW5nIGFuIHVwZGF0ZVRvb2x0aXBFZmZlY3RcbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVNYXRoVG9vbHRpcCh1cGRhdGU6IFZpZXdVcGRhdGUpIHtcblx0Y29uc3Qgc2hvdWxkVXBkYXRlID0gdXBkYXRlLmRvY0NoYW5nZWQgfHwgdXBkYXRlLnNlbGVjdGlvblNldDtcblx0aWYgKCFzaG91bGRVcGRhdGUpIHJldHVybjtcblxuXHRjb25zdCBzZXR0aW5ncyA9IGdldExhdGV4U3VpdGVDb25maWcodXBkYXRlLnN0YXRlKTtcblx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tU3RhdGUodXBkYXRlLnN0YXRlKTtcblxuXHRpZiAoIXNob3VsZFNob3dUb29sdGlwKHVwZGF0ZS5zdGF0ZSwgY3R4KSkge1xuXHRcdGNvbnN0IGN1cnJUb29sdGlwcyA9IHVwZGF0ZS5zdGF0ZS5maWVsZChjdXJzb3JUb29sdGlwRmllbGQpO1xuXHRcdC8vIGEgbGl0dGxlIG9wdGltaXphdGlvbjpcblx0XHQvLyBJZiB0aGUgdG9vbHRpcCBpcyBub3QgY3VycmVudGx5IHNob3duIGFuZCB0aGVyZSBpcyBubyBuZWVkIHRvIHNob3cgaXQsXG5cdFx0Ly8gd2UgZG9uJ3QgZGlzcGF0Y2ggYW4gdHJhbnNhY3Rpb24uXG5cdFx0aWYgKGN1cnJUb29sdGlwcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR1cGRhdGUudmlldy5kaXNwYXRjaCh7XG5cdFx0XHRcdGVmZmVjdHM6IFt1cGRhdGVUb29sdGlwRWZmZWN0Lm9mKFtdKV0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Lypcblx0KiBwcm9jZXNzIHdoZW4gdGhlcmUgaXMgYSBuZWVkIHRvIHNob3cgdGhlIHRvb2x0aXA6IGZyb20gaGVyZVxuXHQqL1xuXG5cdC8vIEhBQ0s6IGVxbkJvdW5kcyBpcyBub3QgbnVsbCBiZWNhdXNlIHNob3VsZFNob3dUb29sdGlwIHdhcyB0cnVlXG5cdGNvbnN0IGVxbkJvdW5kcyA9IGN0eC5nZXRCb3VuZHMoKTtcblx0aWYoIWVxbkJvdW5kcylcblx0XHRyZXR1cm5cblx0bGV0IGVxbiA9IHVwZGF0ZS5zdGF0ZS5zbGljZURvYyhlcW5Cb3VuZHMuc3RhcnQsIGVxbkJvdW5kcy5lbmQpO1xuXHRjb25zdCBpbmRleCA9IHVwZGF0ZS5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkLWVxbkJvdW5kcy5zdGFydDtcblxuXHRlcW4gPSBlcW4uc2xpY2UoMCwgaW5kZXgpICsgJ3tcXFxcSHVnZVxcXFxjb2xvclxcXFxyZWRcXFxcbWlkfScgKyBlcW4uc2xpY2UoaW5kZXgpO1xuXG5cdGNvbnN0IGFib3ZlID0gc2V0dGluZ3MubWF0aFByZXZpZXdQb3NpdGlvbklzQWJvdmU7XG5cdGNvbnN0IGNyZWF0ZSA9ICgpID0+IHtcblx0XHRjb25zdCBkb20gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXHRcdGRvbS5hZGRDbGFzcyhcImNtLXRvb2x0aXAtY3Vyc29yXCIpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRFcW4gPSByZW5kZXJNYXRoKGVxbiwgY3R4Lm1vZGUuYmxvY2tNYXRoIHx8IGN0eC5tb2RlLmNvZGVNYXRoKTtcblx0XHRkb20uYXBwZW5kQ2hpbGQocmVuZGVyZWRFcW4pO1xuXHRcdGZpbmlzaFJlbmRlck1hdGgoKTtcblxuXHRcdHJldHVybiB7IGRvbSB9O1xuXHR9O1xuXG5cdGxldCBuZXdUb29sdGlwczogVG9vbHRpcFtdID0gW107XG5cblx0aWYgKGN0eC5tb2RlLmJsb2NrTWF0aCB8fCBjdHgubW9kZS5jb2RlTWF0aCkge1xuXHRcdG5ld1Rvb2x0aXBzID0gW3tcblx0XHRcdHBvczogYWJvdmUgPyBlcW5Cb3VuZHMuc3RhcnQgOiBlcW5Cb3VuZHMuZW5kLFxuXHRcdFx0YWJvdmU6IGFib3ZlLFxuXHRcdFx0c3RyaWN0U2lkZTogdHJ1ZSxcblx0XHRcdGFycm93OiB0cnVlLFxuXHRcdFx0Y3JlYXRlOiBjcmVhdGUsXG5cdFx0fV07XG5cdH0gZWxzZSBpZiAoY3R4Lm1vZGUuaW5saW5lTWF0aCAmJiBhYm92ZSkge1xuXHRcdG5ld1Rvb2x0aXBzID0gW3tcblx0XHRcdHBvczogZXFuQm91bmRzLnN0YXJ0LFxuXHRcdFx0YWJvdmU6IHRydWUsXG5cdFx0XHRzdHJpY3RTaWRlOiB0cnVlLFxuXHRcdFx0YXJyb3c6IHRydWUsXG5cdFx0XHRjcmVhdGU6IGNyZWF0ZSxcblx0XHR9XTtcblx0fSBlbHNlIGlmIChjdHgubW9kZS5pbmxpbmVNYXRoICYmICFhYm92ZSkge1xuXHRcdGNvbnN0IGVuZFJhbmdlID0gRWRpdG9yU2VsZWN0aW9uLnJhbmdlKGVxbkJvdW5kcy5lbmQsIGVxbkJvdW5kcy5lbmQpO1xuXG5cdFx0bmV3VG9vbHRpcHMgPSBbe1xuXHRcdFx0cG9zOiBNYXRoLm1heChcblx0XHRcdFx0ZXFuQm91bmRzLnN0YXJ0LFxuXHRcdFx0XHQvLyB0aGUgYmVnaW5uaW5nIHBvc2l0aW9uIG9mIHRoZSB2aXN1YWwgbGluZSB3aGVyZSBlcW5Cb3VuZHMuZW5kIGlzXG5cdFx0XHRcdC8vIGxvY2F0ZWRcblx0XHRcdFx0dXBkYXRlLnZpZXcubW92ZVRvTGluZUJvdW5kYXJ5KGVuZFJhbmdlLCBmYWxzZSkuYW5jaG9yLFxuXHRcdFx0KSxcblx0XHRcdGFib3ZlOiBmYWxzZSxcblx0XHRcdHN0cmljdFNpZGU6IHRydWUsXG5cdFx0XHRhcnJvdzogdHJ1ZSxcblx0XHRcdGNyZWF0ZTogY3JlYXRlLFxuXHRcdH1dO1xuXHR9XG5cblx0dXBkYXRlLnZpZXcuZGlzcGF0Y2goe1xuXHRcdGVmZmVjdHM6IFt1cGRhdGVUb29sdGlwRWZmZWN0Lm9mKG5ld1Rvb2x0aXBzKV1cblx0fSk7XG59XG5cbmZ1bmN0aW9uIHNob3VsZFNob3dUb29sdGlwKHN0YXRlOiBFZGl0b3JTdGF0ZSwgY3R4OiBDb250ZXh0KTogYm9vbGVhbiB7XG5cdGlmICghY3R4Lm1vZGUuaW5NYXRoKCkpIHJldHVybiBmYWxzZTtcblxuXHRjb25zdCBpc0xpdmVQcmV2aWV3ID0gc3RhdGUuZmllbGQoZWRpdG9yTGl2ZVByZXZpZXdGaWVsZCk7XG5cdGlmIChjdHgubW9kZS5ibG9ja01hdGggJiYgaXNMaXZlUHJldmlldykgcmV0dXJuIGZhbHNlO1xuXG5cdC8vIEZJWE1FOiBlcW5Cb3VuZHMgY2FuIGJlIG51bGxcblx0Y29uc3QgZXFuQm91bmRzID0gY3R4LmdldEJvdW5kcygpO1xuXHRpZiAoIWVxbkJvdW5kcykgcmV0dXJuIGZhbHNlO1xuXG5cdC8vIERvbid0IHJlbmRlciBhbiBlbXB0eSBlcXVhdGlvblxuXHRjb25zdCBlcW4gPSBzdGF0ZS5zbGljZURvYyhlcW5Cb3VuZHMuc3RhcnQsIGVxbkJvdW5kcy5lbmQpLnRyaW0oKTtcblx0aWYgKGVxbiA9PT0gXCJcIikgcmV0dXJuIGZhbHNlO1xuXG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgY29uc3QgY3Vyc29yVG9vbHRpcEJhc2VUaGVtZSA9IEVkaXRvclZpZXcuYmFzZVRoZW1lKHtcblx0XCIuY20tdG9vbHRpcC5jbS10b29sdGlwLWN1cnNvclwiOiB7XG5cdFx0YmFja2dyb3VuZENvbG9yOiBcInZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KVwiLFxuXHRcdGNvbG9yOiBcInZhcigtLXRleHQtbm9ybWFsKVwiLFxuXHRcdGJvcmRlcjogXCIxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXItaG92ZXIpXCIsXG5cdFx0cGFkZGluZzogXCI0cHggNnB4XCIsXG5cdFx0Ym9yZGVyUmFkaXVzOiBcIjZweFwiLFxuXHRcdFwiJiAuY20tdG9vbHRpcC1hcnJvdzpiZWZvcmVcIjoge1xuXHRcdFx0Ym9yZGVyVG9wQ29sb3I6IFwidmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXItaG92ZXIpXCIsXG5cdFx0XHRib3JkZXJCb3R0b21Db2xvcjogXCJ2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlci1ob3ZlcilcIixcblx0XHR9LFxuXHRcdFwiJiAuY20tdG9vbHRpcC1hcnJvdzphZnRlclwiOiB7XG5cdFx0XHRib3JkZXJUb3BDb2xvcjogXCJ2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSlcIixcblx0XHRcdGJvcmRlckJvdHRvbUNvbG9yOiBcInZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KVwiLFxuXHRcdH0sXG5cdFx0XCImIHBcIjoge1xuXHRcdFx0bWFyZ2luOiBcIjBweFwiLFxuXHRcdH0sXG5cdFx0XCImIG1qeC1jb250YWluZXJcIjoge1xuXHRcdFx0cGFkZGluZzogXCIycHggIWltcG9ydGFudFwiLFxuXHRcdH0sXG5cdH1cbn0pO1xuIl19