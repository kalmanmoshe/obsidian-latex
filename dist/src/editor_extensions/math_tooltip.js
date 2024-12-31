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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aF90b29sdGlwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2VkaXRvcl9leHRlbnNpb25zL21hdGhfdG9vbHRpcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQVcsV0FBVyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxVQUFVLEVBQWUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzVDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJFLE1BQU0sbUJBQW1CLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBYSxDQUFDO0FBRTVELE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQXFCO0lBQ3ZFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO0lBRWhCLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRTtRQUNsQixLQUFLLE1BQU0sTUFBTSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqQyxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUM7Z0JBQUUsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ3pELENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDcEUsQ0FBQyxDQUFDO0FB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QyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNsRSxJQUFJLEdBQUcsS0FBSyxFQUFFO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFFN0IsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQztJQUMxRCwrQkFBK0IsRUFBRTtRQUNoQyxlQUFlLEVBQUUsNkJBQTZCO1FBQzlDLEtBQUssRUFBRSxvQkFBb0I7UUFDM0IsTUFBTSxFQUFFLG1EQUFtRDtRQUMzRCxPQUFPLEVBQUUsU0FBUztRQUNsQixZQUFZLEVBQUUsS0FBSztRQUNuQiw0QkFBNEIsRUFBRTtZQUM3QixjQUFjLEVBQUUseUNBQXlDO1lBQ3pELGlCQUFpQixFQUFFLHlDQUF5QztTQUM1RDtRQUNELDJCQUEyQixFQUFFO1lBQzVCLGNBQWMsRUFBRSw2QkFBNkI7WUFDN0MsaUJBQWlCLEVBQUUsNkJBQTZCO1NBQ2hEO1FBQ0QsS0FBSyxFQUFFO1lBQ04sTUFBTSxFQUFFLEtBQUs7U0FDYjtRQUNELGlCQUFpQixFQUFFO1lBQ2xCLE9BQU8sRUFBRSxnQkFBZ0I7U0FDekI7S0FDRDtDQUNELENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRvb2x0aXAsIHNob3dUb29sdGlwLCBFZGl0b3JWaWV3LCBWaWV3VXBkYXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgU3RhdGVGaWVsZCwgRWRpdG9yU3RhdGUsIEVkaXRvclNlbGVjdGlvbiwgU3RhdGVFZmZlY3QgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgcmVuZGVyTWF0aCwgZmluaXNoUmVuZGVyTWF0aCwgZWRpdG9yTGl2ZVByZXZpZXdGaWVsZCB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcInNyYy91dGlscy9jb250ZXh0XCI7XHJcbmltcG9ydCB7IGdldExhdGV4U3VpdGVDb25maWcgfSBmcm9tIFwic3JjL3NuaXBwZXRzL2NvZGVtaXJyb3IvY29uZmlnXCI7XHJcblxyXG5jb25zdCB1cGRhdGVUb29sdGlwRWZmZWN0ID0gU3RhdGVFZmZlY3QuZGVmaW5lPFRvb2x0aXBbXT4oKTtcclxuXHJcbmV4cG9ydCBjb25zdCBjdXJzb3JUb29sdGlwRmllbGQgPSBTdGF0ZUZpZWxkLmRlZmluZTxyZWFkb25seSBUb29sdGlwW10+KHtcclxuXHRjcmVhdGU6ICgpID0+IFtdLFxyXG5cclxuXHR1cGRhdGUodG9vbHRpcHMsIHRyKSB7XHJcblx0XHRmb3IgKGNvbnN0IGVmZmVjdCBvZiB0ci5lZmZlY3RzKSB7XHJcblx0XHRcdGlmIChlZmZlY3QuaXModXBkYXRlVG9vbHRpcEVmZmVjdCkpIHJldHVybiBlZmZlY3QudmFsdWU7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRvb2x0aXBzO1xyXG5cdH0sXHJcblxyXG5cdHByb3ZpZGU6IChmKSA9PiBzaG93VG9vbHRpcC5jb21wdXRlTihbZl0sIChzdGF0ZSkgPT4gc3RhdGUuZmllbGQoZikpLFxyXG59KTtcclxuXHJcbi8vIHVwZGF0ZSB0aGUgdG9vbHRpcCBieSBkaXNwYXRjaGluZyBhbiB1cGRhdGVUb29sdGlwRWZmZWN0XHJcbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVNYXRoVG9vbHRpcCh1cGRhdGU6IFZpZXdVcGRhdGUpIHtcclxuXHRjb25zdCBzaG91bGRVcGRhdGUgPSB1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUuc2VsZWN0aW9uU2V0O1xyXG5cdGlmICghc2hvdWxkVXBkYXRlKSByZXR1cm47XHJcblxyXG5cdGNvbnN0IHNldHRpbmdzID0gZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh1cGRhdGUuc3RhdGUpO1xyXG5cdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVN0YXRlKHVwZGF0ZS5zdGF0ZSk7XHJcblxyXG5cdGlmICghc2hvdWxkU2hvd1Rvb2x0aXAodXBkYXRlLnN0YXRlLCBjdHgpKSB7XHJcblx0XHRjb25zdCBjdXJyVG9vbHRpcHMgPSB1cGRhdGUuc3RhdGUuZmllbGQoY3Vyc29yVG9vbHRpcEZpZWxkKTtcclxuXHRcdC8vIGEgbGl0dGxlIG9wdGltaXphdGlvbjpcclxuXHRcdC8vIElmIHRoZSB0b29sdGlwIGlzIG5vdCBjdXJyZW50bHkgc2hvd24gYW5kIHRoZXJlIGlzIG5vIG5lZWQgdG8gc2hvdyBpdCxcclxuXHRcdC8vIHdlIGRvbid0IGRpc3BhdGNoIGFuIHRyYW5zYWN0aW9uLlxyXG5cdFx0aWYgKGN1cnJUb29sdGlwcy5sZW5ndGggPiAwKSB7XHJcblx0XHRcdHVwZGF0ZS52aWV3LmRpc3BhdGNoKHtcclxuXHRcdFx0XHRlZmZlY3RzOiBbdXBkYXRlVG9vbHRpcEVmZmVjdC5vZihbXSldLFxyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdHJldHVybjtcclxuXHR9XHJcblxyXG5cdC8qXHJcblx0KiBwcm9jZXNzIHdoZW4gdGhlcmUgaXMgYSBuZWVkIHRvIHNob3cgdGhlIHRvb2x0aXA6IGZyb20gaGVyZVxyXG5cdCovXHJcblxyXG5cdC8vIEhBQ0s6IGVxbkJvdW5kcyBpcyBub3QgbnVsbCBiZWNhdXNlIHNob3VsZFNob3dUb29sdGlwIHdhcyB0cnVlXHJcblx0Y29uc3QgZXFuQm91bmRzID0gY3R4LmdldEJvdW5kcygpO1xyXG5cdGlmKCFlcW5Cb3VuZHMpXHJcblx0XHRyZXR1cm5cclxuXHRjb25zdCBlcW4gPSB1cGRhdGUuc3RhdGUuc2xpY2VEb2MoZXFuQm91bmRzLnN0YXJ0LCBlcW5Cb3VuZHMuZW5kKTtcclxuXHJcblx0Y29uc3QgYWJvdmUgPSBzZXR0aW5ncy5tYXRoUHJldmlld1Bvc2l0aW9uSXNBYm92ZTtcclxuXHRjb25zdCBjcmVhdGUgPSAoKSA9PiB7XHJcblx0XHRjb25zdCBkb20gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdFx0ZG9tLmFkZENsYXNzKFwiY20tdG9vbHRpcC1jdXJzb3JcIik7XHJcblxyXG5cdFx0Y29uc3QgcmVuZGVyZWRFcW4gPSByZW5kZXJNYXRoKGVxbiwgY3R4Lm1vZGUuYmxvY2tNYXRoIHx8IGN0eC5tb2RlLmNvZGVNYXRoKTtcclxuXHRcdGRvbS5hcHBlbmRDaGlsZChyZW5kZXJlZEVxbik7XHJcblx0XHRmaW5pc2hSZW5kZXJNYXRoKCk7XHJcblxyXG5cdFx0cmV0dXJuIHsgZG9tIH07XHJcblx0fTtcclxuXHJcblx0bGV0IG5ld1Rvb2x0aXBzOiBUb29sdGlwW10gPSBbXTtcclxuXHJcblx0aWYgKGN0eC5tb2RlLmJsb2NrTWF0aCB8fCBjdHgubW9kZS5jb2RlTWF0aCkge1xyXG5cdFx0bmV3VG9vbHRpcHMgPSBbe1xyXG5cdFx0XHRwb3M6IGFib3ZlID8gZXFuQm91bmRzLnN0YXJ0IDogZXFuQm91bmRzLmVuZCxcclxuXHRcdFx0YWJvdmU6IGFib3ZlLFxyXG5cdFx0XHRzdHJpY3RTaWRlOiB0cnVlLFxyXG5cdFx0XHRhcnJvdzogdHJ1ZSxcclxuXHRcdFx0Y3JlYXRlOiBjcmVhdGUsXHJcblx0XHR9XTtcclxuXHR9IGVsc2UgaWYgKGN0eC5tb2RlLmlubGluZU1hdGggJiYgYWJvdmUpIHtcclxuXHRcdG5ld1Rvb2x0aXBzID0gW3tcclxuXHRcdFx0cG9zOiBlcW5Cb3VuZHMuc3RhcnQsXHJcblx0XHRcdGFib3ZlOiB0cnVlLFxyXG5cdFx0XHRzdHJpY3RTaWRlOiB0cnVlLFxyXG5cdFx0XHRhcnJvdzogdHJ1ZSxcclxuXHRcdFx0Y3JlYXRlOiBjcmVhdGUsXHJcblx0XHR9XTtcclxuXHR9IGVsc2UgaWYgKGN0eC5tb2RlLmlubGluZU1hdGggJiYgIWFib3ZlKSB7XHJcblx0XHRjb25zdCBlbmRSYW5nZSA9IEVkaXRvclNlbGVjdGlvbi5yYW5nZShlcW5Cb3VuZHMuZW5kLCBlcW5Cb3VuZHMuZW5kKTtcclxuXHJcblx0XHRuZXdUb29sdGlwcyA9IFt7XHJcblx0XHRcdHBvczogTWF0aC5tYXgoXHJcblx0XHRcdFx0ZXFuQm91bmRzLnN0YXJ0LFxyXG5cdFx0XHRcdC8vIHRoZSBiZWdpbm5pbmcgcG9zaXRpb24gb2YgdGhlIHZpc3VhbCBsaW5lIHdoZXJlIGVxbkJvdW5kcy5lbmQgaXNcclxuXHRcdFx0XHQvLyBsb2NhdGVkXHJcblx0XHRcdFx0dXBkYXRlLnZpZXcubW92ZVRvTGluZUJvdW5kYXJ5KGVuZFJhbmdlLCBmYWxzZSkuYW5jaG9yLFxyXG5cdFx0XHQpLFxyXG5cdFx0XHRhYm92ZTogZmFsc2UsXHJcblx0XHRcdHN0cmljdFNpZGU6IHRydWUsXHJcblx0XHRcdGFycm93OiB0cnVlLFxyXG5cdFx0XHRjcmVhdGU6IGNyZWF0ZSxcclxuXHRcdH1dO1xyXG5cdH1cclxuXHJcblx0dXBkYXRlLnZpZXcuZGlzcGF0Y2goe1xyXG5cdFx0ZWZmZWN0czogW3VwZGF0ZVRvb2x0aXBFZmZlY3Qub2YobmV3VG9vbHRpcHMpXVxyXG5cdH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG91bGRTaG93VG9vbHRpcChzdGF0ZTogRWRpdG9yU3RhdGUsIGN0eDogQ29udGV4dCk6IGJvb2xlYW4ge1xyXG5cdGlmICghY3R4Lm1vZGUuaW5NYXRoKCkpIHJldHVybiBmYWxzZTtcclxuXHJcblx0Y29uc3QgaXNMaXZlUHJldmlldyA9IHN0YXRlLmZpZWxkKGVkaXRvckxpdmVQcmV2aWV3RmllbGQpO1xyXG5cdGlmIChjdHgubW9kZS5ibG9ja01hdGggJiYgaXNMaXZlUHJldmlldykgcmV0dXJuIGZhbHNlO1xyXG5cclxuXHQvLyBGSVhNRTogZXFuQm91bmRzIGNhbiBiZSBudWxsXHJcblx0Y29uc3QgZXFuQm91bmRzID0gY3R4LmdldEJvdW5kcygpO1xyXG5cdGlmICghZXFuQm91bmRzKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdC8vIERvbid0IHJlbmRlciBhbiBlbXB0eSBlcXVhdGlvblxyXG5cdGNvbnN0IGVxbiA9IHN0YXRlLnNsaWNlRG9jKGVxbkJvdW5kcy5zdGFydCwgZXFuQm91bmRzLmVuZCkudHJpbSgpO1xyXG5cdGlmIChlcW4gPT09IFwiXCIpIHJldHVybiBmYWxzZTtcclxuXHJcblx0cmV0dXJuIHRydWU7XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBjdXJzb3JUb29sdGlwQmFzZVRoZW1lID0gRWRpdG9yVmlldy5iYXNlVGhlbWUoe1xyXG5cdFwiLmNtLXRvb2x0aXAuY20tdG9vbHRpcC1jdXJzb3JcIjoge1xyXG5cdFx0YmFja2dyb3VuZENvbG9yOiBcInZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KVwiLFxyXG5cdFx0Y29sb3I6IFwidmFyKC0tdGV4dC1ub3JtYWwpXCIsXHJcblx0XHRib3JkZXI6IFwiMXB4IHNvbGlkIHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyLWhvdmVyKVwiLFxyXG5cdFx0cGFkZGluZzogXCI0cHggNnB4XCIsXHJcblx0XHRib3JkZXJSYWRpdXM6IFwiNnB4XCIsXHJcblx0XHRcIiYgLmNtLXRvb2x0aXAtYXJyb3c6YmVmb3JlXCI6IHtcclxuXHRcdFx0Ym9yZGVyVG9wQ29sb3I6IFwidmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXItaG92ZXIpXCIsXHJcblx0XHRcdGJvcmRlckJvdHRvbUNvbG9yOiBcInZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyLWhvdmVyKVwiLFxyXG5cdFx0fSxcclxuXHRcdFwiJiAuY20tdG9vbHRpcC1hcnJvdzphZnRlclwiOiB7XHJcblx0XHRcdGJvcmRlclRvcENvbG9yOiBcInZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KVwiLFxyXG5cdFx0XHRib3JkZXJCb3R0b21Db2xvcjogXCJ2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSlcIixcclxuXHRcdH0sXHJcblx0XHRcIiYgcFwiOiB7XHJcblx0XHRcdG1hcmdpbjogXCIwcHhcIixcclxuXHRcdH0sXHJcblx0XHRcIiYgbWp4LWNvbnRhaW5lclwiOiB7XHJcblx0XHRcdHBhZGRpbmc6IFwiMnB4ICFpbXBvcnRhbnRcIixcclxuXHRcdH0sXHJcblx0fVxyXG59KTtcclxuIl19