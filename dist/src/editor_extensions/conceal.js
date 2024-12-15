// https://discuss.codemirror.net/t/concealing-syntax/3135
import { Decoration, WidgetType, ViewPlugin, EditorView } from "@codemirror/view";
import { RangeSet, RangeSetBuilder, RangeValue } from "@codemirror/state";
import { conceal } from "./conceal_fns";
import { debounce, livePreviewState } from "obsidian";
/**
 * Make a ConcealSpec from the given list of Replacements.
 * This function essentially does nothing but improves readability.
 */
export function mkConcealSpec(...replacements) {
    return replacements;
}
class ConcealWidget extends WidgetType {
    symbol;
    className;
    elementType;
    constructor(symbol, className, elementType) {
        super();
        this.symbol = symbol;
        this.className = className ? className : "";
        this.elementType = elementType ? elementType : "span";
    }
    eq(other) {
        return ((other.symbol == this.symbol) && (other.className === this.className) && (other.elementType === this.elementType));
    }
    toDOM() {
        const span = document.createElement(this.elementType);
        span.className = "cm-math " + this.className;
        span.textContent = this.symbol;
        return span;
    }
    ignoreEvent() {
        return false;
    }
}
class TextWidget extends WidgetType {
    symbol;
    constructor(symbol) {
        super();
        this.symbol = symbol;
    }
    eq(other) {
        return (other.symbol == this.symbol);
    }
    toDOM() {
        const span = document.createElement("span");
        span.className = "cm-math";
        span.textContent = this.symbol;
        return span;
    }
    ignoreEvent() {
        return false;
    }
}
/**
 * Determine if the two ConcealSpec instances before and after the update can be
 * considered identical.
 */
function atSamePosAfter(update, oldConceal, newConceal) {
    if (oldConceal.length !== newConceal.length)
        return false;
    for (let i = 0; i < oldConceal.length; ++i) {
        // Set associativity to ensure that insertions on either side of the
        // concealed region do not expand the region
        const oldStartUpdated = update.changes.mapPos(oldConceal[i].start, 1);
        const oldEndUpdated = update.changes.mapPos(oldConceal[i].end, -1);
        const b = oldStartUpdated == newConceal[i].start && oldEndUpdated == newConceal[i].end;
        if (!b)
            return false;
    }
    return true;
}
function determineCursorPosType(sel, concealSpec) {
    // Priority: "within" > "edge" > "apart"
    let cursorPosType = "apart";
    for (const range of sel.ranges) {
        for (const replace of concealSpec) {
            // 'cursorPosType' is guaranteed to be "edge" or "apart" at this point
            const overlapRangeFrom = Math.max(range.from, replace.start);
            const overlapRangeTo = Math.min(range.to, replace.end);
            if (overlapRangeFrom === overlapRangeTo &&
                (overlapRangeFrom === replace.start || overlapRangeFrom === replace.end)) {
                cursorPosType = "edge";
                continue;
            }
            if (overlapRangeFrom <= overlapRangeTo)
                return "within";
        }
    }
    return cursorPosType;
}
/*
* We determine how to handle a concealment based on its 'cursorPosType' before
* and after an update and current mousedown state.
*
* When the mouse is down, we enable all concealments to make selecting math
* expressions easier.
*
* When the mouse is up, we follow the table below.
* The row represents the previous 'cursorPosType' and the column represents the
* current 'cursorPosType'. Each cell contains the action to be taken.
*
*        |  apart  |  edge  | within
* -----------------------------------
* apart  | conceal | delay  | reveal
* edge   | conceal | delay  | reveal
* within | conceal | reveal | reveal
* N/A    | conceal | reveal | reveal
*
* 'N/A' means that the concealment do not exist before the update, which should
* be judged by 'atSamePosAfter' function.
*/
function determineAction(oldCursor, newCursor, mousedown, delayEnabled) {
    if (mousedown)
        return "conceal";
    if (newCursor === "apart")
        return "conceal";
    if (newCursor === "within")
        return "reveal";
    // newCursor === "edge"
    if (!delayEnabled)
        return "reveal";
    // delay is enabled
    if (!oldCursor || oldCursor === "within")
        return "reveal";
    else
        return "delay";
}
// Build a decoration set from the given concealments
function buildDecoSet(concealments) {
    const decos = [];
    for (const conc of concealments) {
        if (!conc.enable)
            continue;
        for (const replace of conc.spec) {
            if (replace.start === replace.end) {
                // Add an additional "/" symbol, as part of concealing \\frac{}{} -> ()/()
                decos.push(Decoration.widget({
                    widget: new TextWidget(replace.text),
                    block: false,
                }).range(replace.start, replace.end));
            }
            else {
                // Improve selecting empty replacements such as "\frac" -> ""
                // NOTE: This might not be necessary
                const inclusiveStart = replace.text === "";
                const inclusiveEnd = false;
                decos.push(Decoration.replace({
                    widget: new ConcealWidget(replace.text, replace.class, replace.elementType),
                    inclusiveStart,
                    inclusiveEnd,
                    block: false,
                }).range(replace.start, replace.end));
            }
        }
    }
    return Decoration.set(decos, true);
}
// Build atomic ranges from the given concealments.
// The resulting ranges are basically the same as the original replacements, but empty replacements
// are merged with the "next character," which can be either plain text or another replacement.
// This adjustment makes cursor movement around empty replacements more intuitive.
function buildAtomicRanges(concealments) {
    const repls = concealments
        .filter(c => c.enable)
        .flatMap(c => c.spec)
        .sort((a, b) => a.start - b.start);
    // RangeSet requires RangeValue but we do not need one
    const fakeval = new (class extends RangeValue {
    });
    const builder = new RangeSetBuilder();
    for (let i = 0; i < repls.length; i++) {
        if (repls[i].text === "") {
            if (i + 1 != repls.length && repls[i].end == repls[i + 1].start) {
                builder.add(repls[i].start, repls[i + 1].end, fakeval);
                i++;
            }
            else {
                builder.add(repls[i].start, repls[i].end + 1, fakeval);
            }
        }
        else {
            builder.add(repls[i].start, repls[i].end, fakeval);
        }
    }
    return builder.finish();
}
export const mkConcealPlugin = (revealTimeout) => ViewPlugin.fromClass(class {
    // Stateful ViewPlugin: you should avoid one in general, but here
    // the approach based on StateField and updateListener conflicts with
    // obsidian's internal logic and causes weird rendering.
    concealments;
    decorations;
    atomicRanges;
    delayEnabled;
    constructor() {
        this.concealments = [];
        this.decorations = Decoration.none;
        this.atomicRanges = RangeSet.empty;
        this.delayEnabled = revealTimeout > 0;
    }
    delayedReveal = debounce((delayedConcealments, view) => {
        // Implicitly change the state
        for (const concealment of delayedConcealments) {
            concealment.enable = false;
        }
        this.decorations = buildDecoSet(this.concealments);
        this.atomicRanges = buildAtomicRanges(this.concealments);
        // Invoke the update method to reflect the changes of this.decoration
        view.dispatch();
    }, revealTimeout, true);
    update(update) {
        if (!(update.docChanged || update.viewportChanged || update.selectionSet))
            return;
        // Cancel the delayed revealment whenever we update the concealments
        this.delayedReveal.cancel();
        const selection = update.state.selection;
        const mousedown = update.view.plugin(livePreviewState)?.mousedown;
        const concealSpecs = conceal(update.view);
        // Collect concealments from the new conceal specs
        const concealments = [];
        // concealments that should be revealed after a delay (i.e. 'delay' action)
        const delayedConcealments = [];
        for (const spec of concealSpecs) {
            const cursorPosType = determineCursorPosType(selection, spec);
            const oldConcealment = this.concealments.find((old) => atSamePosAfter(update, old.spec, spec));
            const concealAction = determineAction(oldConcealment?.cursorPosType, cursorPosType, mousedown, this.delayEnabled);
            const concealment = {
                spec,
                cursorPosType,
                enable: concealAction !== "reveal",
            };
            if (concealAction === "delay") {
                delayedConcealments.push(concealment);
            }
            concealments.push(concealment);
        }
        if (delayedConcealments.length > 0) {
            this.delayedReveal(delayedConcealments, update.view);
        }
        this.concealments = concealments;
        this.decorations = buildDecoSet(this.concealments);
        this.atomicRanges = buildAtomicRanges(this.concealments);
    }
}, {
    decorations: v => v.decorations,
    provide: plugin => EditorView.atomicRanges.of(view => view.plugin(plugin).atomicRanges),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uY2VhbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3JfZXh0ZW5zaW9ucy9jb25jZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBEQUEwRDtBQUUxRCxPQUFPLEVBQWMsVUFBVSxFQUFpQixVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzdHLE9BQU8sRUFBMEIsUUFBUSxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3hDLE9BQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFZdEQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGFBQWEsQ0FBQyxHQUFHLFlBQTJCO0lBQzNELE9BQU8sWUFBWSxDQUFDO0FBQ3JCLENBQUM7QUFhRCxNQUFNLGFBQWMsU0FBUSxVQUFVO0lBSWhCO0lBSEosU0FBUyxDQUFTO0lBQ2xCLFdBQVcsQ0FBUztJQUVyQyxZQUFxQixNQUFjLEVBQUUsU0FBa0IsRUFBRSxXQUFvQjtRQUM1RSxLQUFLLEVBQUUsQ0FBQztRQURZLFdBQU0sR0FBTixNQUFNLENBQVE7UUFHbEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzVDLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN2RCxDQUFDO0lBRUQsRUFBRSxDQUFDLEtBQW9CO1FBQ3RCLE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUks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QUFDO1FBRUQsSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDcEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEQsQ0FBQztRQUVELElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxXQUFXLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsWUFBWSxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUMxRCxDQUFDO0NBQ0QsRUFBRTtJQUNGLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXO0lBQy9CLE9BQU8sRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxZQUFZLENBQUM7Q0FDdkYsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gaHR0cHM6Ly9kaXNjdXNzLmNvZGVtaXJyb3IubmV0L3QvY29uY2VhbGluZy1zeW50YXgvMzEzNVxuXG5pbXBvcnQgeyBWaWV3VXBkYXRlLCBEZWNvcmF0aW9uLCBEZWNvcmF0aW9uU2V0LCBXaWRnZXRUeXBlLCBWaWV3UGx1Z2luLCBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7IEVkaXRvclNlbGVjdGlvbiwgUmFuZ2UsIFJhbmdlU2V0LCBSYW5nZVNldEJ1aWxkZXIsIFJhbmdlVmFsdWUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IGNvbmNlYWwgfSBmcm9tIFwiLi9jb25jZWFsX2Zuc1wiO1xuaW1wb3J0IHsgZGVib3VuY2UsIGxpdmVQcmV2aWV3U3RhdGUgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IHR5cGUgUmVwbGFjZW1lbnQgPSB7XG5cdHN0YXJ0OiBudW1iZXIsXG5cdGVuZDogbnVtYmVyLFxuXHR0ZXh0OiBzdHJpbmcsXG5cdGNsYXNzPzogc3RyaW5nLFxuXHRlbGVtZW50VHlwZT86IHN0cmluZyxcbn07XG5cbmV4cG9ydCB0eXBlIENvbmNlYWxTcGVjID0gUmVwbGFjZW1lbnRbXTtcblxuLyoqXG4gKiBNYWtlIGEgQ29uY2VhbFNwZWMgZnJvbSB0aGUgZ2l2ZW4gbGlzdCBvZiBSZXBsYWNlbWVudHMuXG4gKiBUaGlzIGZ1bmN0aW9uIGVzc2VudGlhbGx5IGRvZXMgbm90aGluZyBidXQgaW1wcm92ZXMgcmVhZGFiaWxpdHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBta0NvbmNlYWxTcGVjKC4uLnJlcGxhY2VtZW50czogUmVwbGFjZW1lbnRbXSkge1xuXHRyZXR1cm4gcmVwbGFjZW1lbnRzO1xufVxuXG5leHBvcnQgdHlwZSBDb25jZWFsbWVudCA9IHtcblx0c3BlYzogQ29uY2VhbFNwZWMsXG5cdGN1cnNvclBvc1R5cGU6IFwid2l0aGluXCIgfCBcImFwYXJ0XCIgfCBcImVkZ2VcIixcblx0ZW5hYmxlOiBib29sZWFuLFxufTtcblxuLy8gUmVwcmVzZW50cyBob3cgYSBjb25jZWFsbWVudCBzaG91bGQgYmUgaGFuZGxlZFxuLy8gJ2RlbGF5JyBtZWFucyByZXZlYWwgYWZ0ZXIgYSB0aW1lIGRlbGF5LlxudHlwZSBDb25jZWFsQWN0aW9uID0gXCJjb25jZWFsXCIgfCBcInJldmVhbFwiIHwgXCJkZWxheVwiO1xuXG5cbmNsYXNzIENvbmNlYWxXaWRnZXQgZXh0ZW5kcyBXaWRnZXRUeXBlIHtcblx0cHJpdmF0ZSByZWFkb25seSBjbGFzc05hbWU6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50VHlwZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHN5bWJvbDogc3RyaW5nLCBjbGFzc05hbWU/OiBzdHJpbmcsIGVsZW1lbnRUeXBlPzogc3RyaW5nKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lID8gY2xhc3NOYW1lIDogXCJcIjtcblx0XHR0aGlzLmVsZW1lbnRUeXBlID0gZWxlbWVudFR5cGUgPyBlbGVtZW50VHlwZSA6IFwic3BhblwiO1xuXHR9XG5cblx0ZXEob3RoZXI6IENvbmNlYWxXaWRnZXQpIHtcblx0XHRyZXR1cm4gKChvdGhlci5zeW1ib2wgPT0gdGhpcy5zeW1ib2wpICYmIChvdGhlci5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lKSAmJiAob3RoZXIuZWxlbWVudFR5cGUgPT09IHRoaXMuZWxlbWVudFR5cGUpKTtcblx0fVxuXG5cdHRvRE9NKCkge1xuXHRcdGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRoaXMuZWxlbWVudFR5cGUpO1xuXHRcdHNwYW4uY2xhc3NOYW1lID0gXCJjbS1tYXRoIFwiICsgdGhpcy5jbGFzc05hbWU7XG5cdFx0c3Bhbi50ZXh0Q29udGVudCA9IHRoaXMuc3ltYm9sO1xuXHRcdHJldHVybiBzcGFuO1xuXHR9XG5cblx0aWdub3JlRXZlbnQoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmNsYXNzIFRleHRXaWRnZXQgZXh0ZW5kcyBXaWRnZXRUeXBlIHtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBzeW1ib2w6IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRlcShvdGhlcjogVGV4dFdpZGdldCkge1xuXHRcdHJldHVybiAob3RoZXIuc3ltYm9sID09IHRoaXMuc3ltYm9sKTtcblx0fVxuXG5cdHRvRE9NKCkge1xuXHRcdGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcblx0XHRzcGFuLmNsYXNzTmFtZSA9IFwiY20tbWF0aFwiO1xuXHRcdHNwYW4udGV4dENvbnRlbnQgPSB0aGlzLnN5bWJvbDtcblx0XHRyZXR1cm4gc3Bhbjtcblx0fVxuXG5cdGlnbm9yZUV2ZW50KCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG4vKipcbiAqIERldGVybWluZSBpZiB0aGUgdHdvIENvbmNlYWxTcGVjIGluc3RhbmNlcyBiZWZvcmUgYW5kIGFmdGVyIHRoZSB1cGRhdGUgY2FuIGJlXG4gKiBjb25zaWRlcmVkIGlkZW50aWNhbC5cbiAqL1xuZnVuY3Rpb24gYXRTYW1lUG9zQWZ0ZXIoXG5cdHVwZGF0ZTogVmlld1VwZGF0ZSxcblx0b2xkQ29uY2VhbDogQ29uY2VhbFNwZWMsXG5cdG5ld0NvbmNlYWw6IENvbmNlYWxTcGVjLFxuKTogYm9vbGVhbiB7XG5cdGlmIChvbGRDb25jZWFsLmxlbmd0aCAhPT0gbmV3Q29uY2VhbC5sZW5ndGgpIHJldHVybiBmYWxzZTtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IG9sZENvbmNlYWwubGVuZ3RoOyArK2kpIHtcblx0XHQvLyBTZXQgYXNzb2NpYXRpdml0eSB0byBlbnN1cmUgdGhhdCBpbnNlcnRpb25zIG9uIGVpdGhlciBzaWRlIG9mIHRoZVxuXHRcdC8vIGNvbmNlYWxlZCByZWdpb24gZG8gbm90IGV4cGFuZCB0aGUgcmVnaW9uXG5cdFx0Y29uc3Qgb2xkU3RhcnRVcGRhdGVkID0gdXBkYXRlLmNoYW5nZXMubWFwUG9zKG9sZENvbmNlYWxbaV0uc3RhcnQsIDEpO1xuXHRcdGNvbnN0IG9sZEVuZFVwZGF0ZWQgPSB1cGRhdGUuY2hhbmdlcy5tYXBQb3Mob2xkQ29uY2VhbFtpXS5lbmQsIC0xKTtcblx0XHRjb25zdCBiID0gb2xkU3RhcnRVcGRhdGVkID09IG5ld0NvbmNlYWxbaV0uc3RhcnQgJiYgb2xkRW5kVXBkYXRlZCA9PSBuZXdDb25jZWFsW2ldLmVuZDtcblx0XHRpZiAoIWIpIHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBkZXRlcm1pbmVDdXJzb3JQb3NUeXBlKFxuXHRzZWw6IEVkaXRvclNlbGVjdGlvbixcblx0Y29uY2VhbFNwZWM6IENvbmNlYWxTcGVjLFxuKTogQ29uY2VhbG1lbnRbXCJjdXJzb3JQb3NUeXBlXCJdIHtcblx0Ly8gUHJpb3JpdHk6IFwid2l0aGluXCIgPiBcImVkZ2VcIiA+IFwiYXBhcnRcIlxuXG5cdGxldCBjdXJzb3JQb3NUeXBlOiBDb25jZWFsbWVudFtcImN1cnNvclBvc1R5cGVcIl0gPSBcImFwYXJ0XCI7XG5cblx0Zm9yIChjb25zdCByYW5nZSBvZiBzZWwucmFuZ2VzKSB7XG5cdFx0Zm9yIChjb25zdCByZXBsYWNlIG9mIGNvbmNlYWxTcGVjKSB7XG5cdFx0XHQvLyAnY3Vyc29yUG9zVHlwZScgaXMgZ3VhcmFudGVlZCB0byBiZSBcImVkZ2VcIiBvciBcImFwYXJ0XCIgYXQgdGhpcyBwb2ludFxuXHRcdFx0Y29uc3Qgb3ZlcmxhcFJhbmdlRnJvbSA9IE1hdGgubWF4KHJhbmdlLmZyb20sIHJlcGxhY2Uuc3RhcnQpO1xuXHRcdFx0Y29uc3Qgb3ZlcmxhcFJhbmdlVG8gPSBNYXRoLm1pbihyYW5nZS50bywgcmVwbGFjZS5lbmQpO1xuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdG92ZXJsYXBSYW5nZUZyb20gPT09IG92ZXJsYXBSYW5nZVRvICYmXG5cdFx0XHRcdChvdmVybGFwUmFuZ2VGcm9tID09PSByZXBsYWNlLnN0YXJ0IHx8IG92ZXJsYXBSYW5nZUZyb20gPT09IHJlcGxhY2UuZW5kKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGN1cnNvclBvc1R5cGUgPSBcImVkZ2VcIjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvdmVybGFwUmFuZ2VGcm9tIDw9IG92ZXJsYXBSYW5nZVRvKSByZXR1cm4gXCJ3aXRoaW5cIjtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gY3Vyc29yUG9zVHlwZTtcbn1cblxuLypcbiogV2UgZGV0ZXJtaW5lIGhvdyB0byBoYW5kbGUgYSBjb25jZWFsbWVudCBiYXNlZCBvbiBpdHMgJ2N1cnNvclBvc1R5cGUnIGJlZm9yZVxuKiBhbmQgYWZ0ZXIgYW4gdXBkYXRlIGFuZCBjdXJyZW50IG1vdXNlZG93biBzdGF0ZS5cbipcbiogV2hlbiB0aGUgbW91c2UgaXMgZG93biwgd2UgZW5hYmxlIGFsbCBjb25jZWFsbWVudHMgdG8gbWFrZSBzZWxlY3RpbmcgbWF0aFxuKiBleHByZXNzaW9ucyBlYXNpZXIuXG4qXG4qIFdoZW4gdGhlIG1vdXNlIGlzIHVwLCB3ZSBmb2xsb3cgdGhlIHRhYmxlIGJlbG93LlxuKiBUaGUgcm93IHJlcHJlc2VudHMgdGhlIHByZXZpb3VzICdjdXJzb3JQb3NUeXBlJyBhbmQgdGhlIGNvbHVtbiByZXByZXNlbnRzIHRoZVxuKiBjdXJyZW50ICdjdXJzb3JQb3NUeXBlJy4gRWFjaCBjZWxsIGNvbnRhaW5zIHRoZSBhY3Rpb24gdG8gYmUgdGFrZW4uXG4qXG4qICAgICAgICB8ICBhcGFydCAgfCAgZWRnZSAgfCB3aXRoaW5cbiogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiogYXBhcnQgIHwgY29uY2VhbCB8IGRlbGF5ICB8IHJldmVhbFxuKiBlZGdlICAgfCBjb25jZWFsIHwgZGVsYXkgIHwgcmV2ZWFsXG4qIHdpdGhpbiB8IGNvbmNlYWwgfCByZXZlYWwgfCByZXZlYWxcbiogTi9BICAgIHwgY29uY2VhbCB8IHJldmVhbCB8IHJldmVhbFxuKlxuKiAnTi9BJyBtZWFucyB0aGF0IHRoZSBjb25jZWFsbWVudCBkbyBub3QgZXhpc3QgYmVmb3JlIHRoZSB1cGRhdGUsIHdoaWNoIHNob3VsZFxuKiBiZSBqdWRnZWQgYnkgJ2F0U2FtZVBvc0FmdGVyJyBmdW5jdGlvbi5cbiovXG5mdW5jdGlvbiBkZXRlcm1pbmVBY3Rpb24oXG5cdG9sZEN1cnNvcjogQ29uY2VhbG1lbnRbXCJjdXJzb3JQb3NUeXBlXCJdIHwgdW5kZWZpbmVkLFxuXHRuZXdDdXJzb3I6IENvbmNlYWxtZW50W1wiY3Vyc29yUG9zVHlwZVwiXSxcblx0bW91c2Vkb3duOiBib29sZWFuLFxuXHRkZWxheUVuYWJsZWQ6IGJvb2xlYW4sXG4pOiBDb25jZWFsQWN0aW9uIHtcblx0aWYgKG1vdXNlZG93bikgcmV0dXJuIFwiY29uY2VhbFwiO1xuXG5cdGlmIChuZXdDdXJzb3IgPT09IFwiYXBhcnRcIikgcmV0dXJuIFwiY29uY2VhbFwiO1xuXHRpZiAobmV3Q3Vyc29yID09PSBcIndpdGhpblwiKSByZXR1cm4gXCJyZXZlYWxcIjtcblxuXHQvLyBuZXdDdXJzb3IgPT09IFwiZWRnZVwiXG5cdGlmICghZGVsYXlFbmFibGVkKSByZXR1cm4gXCJyZXZlYWxcIjtcblx0Ly8gZGVsYXkgaXMgZW5hYmxlZFxuXHRpZiAoIW9sZEN1cnNvciB8fCBvbGRDdXJzb3IgPT09IFwid2l0aGluXCIpIHJldHVybiBcInJldmVhbFwiO1xuXHRlbHNlIHJldHVybiBcImRlbGF5XCI7XG59XG5cbi8vIEJ1aWxkIGEgZGVjb3JhdGlvbiBzZXQgZnJvbSB0aGUgZ2l2ZW4gY29uY2VhbG1lbnRzXG5mdW5jdGlvbiBidWlsZERlY29TZXQoY29uY2VhbG1lbnRzOiBDb25jZWFsbWVudFtdKSB7XG5cdGNvbnN0IGRlY29zOiBSYW5nZTxEZWNvcmF0aW9uPltdID0gW11cblxuXHRmb3IgKGNvbnN0IGNvbmMgb2YgY29uY2VhbG1lbnRzKSB7XG5cdFx0aWYgKCFjb25jLmVuYWJsZSkgY29udGludWU7XG5cblx0XHRmb3IgKGNvbnN0IHJlcGxhY2Ugb2YgY29uYy5zcGVjKSB7XG5cdFx0XHRpZiAocmVwbGFjZS5zdGFydCA9PT0gcmVwbGFjZS5lbmQpIHtcblx0XHRcdFx0Ly8gQWRkIGFuIGFkZGl0aW9uYWwgXCIvXCIgc3ltYm9sLCBhcyBwYXJ0IG9mIGNvbmNlYWxpbmcgXFxcXGZyYWN7fXt9IC0+ICgpLygpXG5cdFx0XHRcdGRlY29zLnB1c2goXG5cdFx0XHRcdFx0RGVjb3JhdGlvbi53aWRnZXQoe1xuXHRcdFx0XHRcdFx0d2lkZ2V0OiBuZXcgVGV4dFdpZGdldChyZXBsYWNlLnRleHQpLFxuXHRcdFx0XHRcdFx0YmxvY2s6IGZhbHNlLFxuXHRcdFx0XHRcdH0pLnJhbmdlKHJlcGxhY2Uuc3RhcnQsIHJlcGxhY2UuZW5kKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vIEltcHJvdmUgc2VsZWN0aW5nIGVtcHR5IHJlcGxhY2VtZW50cyBzdWNoIGFzIFwiXFxmcmFjXCIgLT4gXCJcIlxuXHRcdFx0XHQvLyBOT1RFOiBUaGlzIG1pZ2h0IG5vdCBiZSBuZWNlc3Nhcnlcblx0XHRcdFx0Y29uc3QgaW5jbHVzaXZlU3RhcnQgPSByZXBsYWNlLnRleHQgPT09IFwiXCI7XG5cdFx0XHRcdGNvbnN0IGluY2x1c2l2ZUVuZCA9IGZhbHNlO1xuXG5cdFx0XHRcdGRlY29zLnB1c2goXG5cdFx0XHRcdFx0RGVjb3JhdGlvbi5yZXBsYWNlKHtcblx0XHRcdFx0XHRcdHdpZGdldDogbmV3IENvbmNlYWxXaWRnZXQoXG5cdFx0XHRcdFx0XHRcdHJlcGxhY2UudGV4dCxcblx0XHRcdFx0XHRcdFx0cmVwbGFjZS5jbGFzcyxcblx0XHRcdFx0XHRcdFx0cmVwbGFjZS5lbGVtZW50VHlwZVxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdGluY2x1c2l2ZVN0YXJ0LFxuXHRcdFx0XHRcdFx0aW5jbHVzaXZlRW5kLFxuXHRcdFx0XHRcdFx0YmxvY2s6IGZhbHNlLFxuXHRcdFx0XHRcdH0pLnJhbmdlKHJlcGxhY2Uuc3RhcnQsIHJlcGxhY2UuZW5kKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBEZWNvcmF0aW9uLnNldChkZWNvcywgdHJ1ZSk7XG59XG5cbi8vIEJ1aWxkIGF0b21pYyByYW5nZXMgZnJvbSB0aGUgZ2l2ZW4gY29uY2VhbG1lbnRzLlxuLy8gVGhlIHJlc3VsdGluZyByYW5nZXMgYXJlIGJhc2ljYWxseSB0aGUgc2FtZSBhcyB0aGUgb3JpZ2luYWwgcmVwbGFjZW1lbnRzLCBidXQgZW1wdHkgcmVwbGFjZW1lbnRzXG4vLyBhcmUgbWVyZ2VkIHdpdGggdGhlIFwibmV4dCBjaGFyYWN0ZXIsXCIgd2hpY2ggY2FuIGJlIGVpdGhlciBwbGFpbiB0ZXh0IG9yIGFub3RoZXIgcmVwbGFjZW1lbnQuXG4vLyBUaGlzIGFkanVzdG1lbnQgbWFrZXMgY3Vyc29yIG1vdmVtZW50IGFyb3VuZCBlbXB0eSByZXBsYWNlbWVudHMgbW9yZSBpbnR1aXRpdmUuXG5mdW5jdGlvbiBidWlsZEF0b21pY1Jhbmdlcyhjb25jZWFsbWVudHM6IENvbmNlYWxtZW50W10pIHtcblx0Y29uc3QgcmVwbHM6IFJlcGxhY2VtZW50W10gPSBjb25jZWFsbWVudHNcblx0XHQuZmlsdGVyKGMgPT4gYy5lbmFibGUpXG5cdFx0LmZsYXRNYXAoYyA9PiBjLnNwZWMpXG5cdFx0LnNvcnQoKGEsIGIpID0+IGEuc3RhcnQgLSBiLnN0YXJ0KTtcblxuXHQvLyBSYW5nZVNldCByZXF1aXJlcyBSYW5nZVZhbHVlIGJ1dCB3ZSBkbyBub3QgbmVlZCBvbmVcblx0Y29uc3QgZmFrZXZhbCA9IG5ldyAoY2xhc3MgZXh0ZW5kcyBSYW5nZVZhbHVlIHt9KTtcblx0Y29uc3QgYnVpbGRlciA9IG5ldyBSYW5nZVNldEJ1aWxkZXIoKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXBscy5sZW5ndGg7IGkrKykge1xuXHRcdGlmIChyZXBsc1tpXS50ZXh0ID09PSBcIlwiKSB7XG5cdFx0XHRpZiAoaSsxICE9IHJlcGxzLmxlbmd0aCAmJiByZXBsc1tpXS5lbmQgPT0gcmVwbHNbaSsxXS5zdGFydCkge1xuXHRcdFx0XHRidWlsZGVyLmFkZChyZXBsc1tpXS5zdGFydCwgcmVwbHNbaSsxXS5lbmQsIGZha2V2YWwpO1xuXHRcdFx0XHRpKys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidWlsZGVyLmFkZChyZXBsc1tpXS5zdGFydCwgcmVwbHNbaV0uZW5kICsgMSwgZmFrZXZhbCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJ1aWxkZXIuYWRkKHJlcGxzW2ldLnN0YXJ0LCByZXBsc1tpXS5lbmQsIGZha2V2YWwpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gYnVpbGRlci5maW5pc2goKTtcbn1cblxuZXhwb3J0IGNvbnN0IG1rQ29uY2VhbFBsdWdpbiA9IChyZXZlYWxUaW1lb3V0OiBudW1iZXIpID0+IFZpZXdQbHVnaW4uZnJvbUNsYXNzKGNsYXNzIHtcblx0Ly8gU3RhdGVmdWwgVmlld1BsdWdpbjogeW91IHNob3VsZCBhdm9pZCBvbmUgaW4gZ2VuZXJhbCwgYnV0IGhlcmVcblx0Ly8gdGhlIGFwcHJvYWNoIGJhc2VkIG9uIFN0YXRlRmllbGQgYW5kIHVwZGF0ZUxpc3RlbmVyIGNvbmZsaWN0cyB3aXRoXG5cdC8vIG9ic2lkaWFuJ3MgaW50ZXJuYWwgbG9naWMgYW5kIGNhdXNlcyB3ZWlyZCByZW5kZXJpbmcuXG5cdGNvbmNlYWxtZW50czogQ29uY2VhbG1lbnRbXTtcblx0ZGVjb3JhdGlvbnM6IERlY29yYXRpb25TZXQ7XG5cdGF0b21pY1JhbmdlczogUmFuZ2VTZXQ8UmFuZ2VWYWx1ZT47XG5cdGRlbGF5RW5hYmxlZDogYm9vbGVhbjtcblxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuY29uY2VhbG1lbnRzID0gW107XG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IERlY29yYXRpb24ubm9uZTtcblx0XHR0aGlzLmF0b21pY1JhbmdlcyA9IFJhbmdlU2V0LmVtcHR5O1xuXHRcdHRoaXMuZGVsYXlFbmFibGVkID0gcmV2ZWFsVGltZW91dCA+IDA7XG5cdH1cblxuXHRkZWxheWVkUmV2ZWFsID0gZGVib3VuY2UoKGRlbGF5ZWRDb25jZWFsbWVudHM6IENvbmNlYWxtZW50W10sIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcblx0XHQvLyBJbXBsaWNpdGx5IGNoYW5nZSB0aGUgc3RhdGVcblx0XHRmb3IgKGNvbnN0IGNvbmNlYWxtZW50IG9mIGRlbGF5ZWRDb25jZWFsbWVudHMpIHtcblx0XHRcdGNvbmNlYWxtZW50LmVuYWJsZSA9IGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLmRlY29yYXRpb25zID0gYnVpbGREZWNvU2V0KHRoaXMuY29uY2VhbG1lbnRzKTtcblx0XHR0aGlzLmF0b21pY1JhbmdlcyA9IGJ1aWxkQXRvbWljUmFuZ2VzKHRoaXMuY29uY2VhbG1lbnRzKTtcblxuXHRcdC8vIEludm9rZSB0aGUgdXBkYXRlIG1ldGhvZCB0byByZWZsZWN0IHRoZSBjaGFuZ2VzIG9mIHRoaXMuZGVjb3JhdGlvblxuXHRcdHZpZXcuZGlzcGF0Y2goKTtcblx0fSwgcmV2ZWFsVGltZW91dCwgdHJ1ZSk7XG5cblx0dXBkYXRlKHVwZGF0ZTogVmlld1VwZGF0ZSkge1xuXHRcdGlmICghKHVwZGF0ZS5kb2NDaGFuZ2VkIHx8IHVwZGF0ZS52aWV3cG9ydENoYW5nZWQgfHwgdXBkYXRlLnNlbGVjdGlvblNldCkpXG5cdFx0XHRyZXR1cm47XG5cblx0XHQvLyBDYW5jZWwgdGhlIGRlbGF5ZWQgcmV2ZWFsbWVudCB3aGVuZXZlciB3ZSB1cGRhdGUgdGhlIGNvbmNlYWxtZW50c1xuXHRcdHRoaXMuZGVsYXllZFJldmVhbC5jYW5jZWwoKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHVwZGF0ZS5zdGF0ZS5zZWxlY3Rpb247XG5cdFx0Y29uc3QgbW91c2Vkb3duID0gdXBkYXRlLnZpZXcucGx1Z2luKGxpdmVQcmV2aWV3U3RhdGUpPy5tb3VzZWRvd247XG5cblx0XHRjb25zdCBjb25jZWFsU3BlY3MgPSBjb25jZWFsKHVwZGF0ZS52aWV3KTtcblxuXHRcdC8vIENvbGxlY3QgY29uY2VhbG1lbnRzIGZyb20gdGhlIG5ldyBjb25jZWFsIHNwZWNzXG5cdFx0Y29uc3QgY29uY2VhbG1lbnRzOiBDb25jZWFsbWVudFtdID0gW107XG5cdFx0Ly8gY29uY2VhbG1lbnRzIHRoYXQgc2hvdWxkIGJlIHJldmVhbGVkIGFmdGVyIGEgZGVsYXkgKGkuZS4gJ2RlbGF5JyBhY3Rpb24pXG5cdFx0Y29uc3QgZGVsYXllZENvbmNlYWxtZW50czogQ29uY2VhbG1lbnRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBzcGVjIG9mIGNvbmNlYWxTcGVjcykge1xuXHRcdFx0Y29uc3QgY3Vyc29yUG9zVHlwZSA9IGRldGVybWluZUN1cnNvclBvc1R5cGUoc2VsZWN0aW9uLCBzcGVjKTtcblx0XHRcdGNvbnN0IG9sZENvbmNlYWxtZW50ID0gdGhpcy5jb25jZWFsbWVudHMuZmluZChcblx0XHRcdFx0KG9sZCkgPT4gYXRTYW1lUG9zQWZ0ZXIodXBkYXRlLCBvbGQuc3BlYywgc3BlYylcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGNvbmNlYWxBY3Rpb24gPSBkZXRlcm1pbmVBY3Rpb24oXG5cdFx0XHRcdG9sZENvbmNlYWxtZW50Py5jdXJzb3JQb3NUeXBlLCBjdXJzb3JQb3NUeXBlLCBtb3VzZWRvd24sIHRoaXMuZGVsYXlFbmFibGVkXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBjb25jZWFsbWVudDogQ29uY2VhbG1lbnQgPSB7XG5cdFx0XHRcdHNwZWMsXG5cdFx0XHRcdGN1cnNvclBvc1R5cGUsXG5cdFx0XHRcdGVuYWJsZTogY29uY2VhbEFjdGlvbiAhPT0gXCJyZXZlYWxcIixcblx0XHRcdH07XG5cblx0XHRcdGlmIChjb25jZWFsQWN0aW9uID09PSBcImRlbGF5XCIpIHtcblx0XHRcdFx0ZGVsYXllZENvbmNlYWxtZW50cy5wdXNoKGNvbmNlYWxtZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uY2VhbG1lbnRzLnB1c2goY29uY2VhbG1lbnQpO1xuXHRcdH1cblxuXHRcdGlmIChkZWxheWVkQ29uY2VhbG1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuZGVsYXllZFJldmVhbChkZWxheWVkQ29uY2VhbG1lbnRzLCB1cGRhdGUudmlldyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb25jZWFsbWVudHMgPSBjb25jZWFsbWVudHM7XG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IGJ1aWxkRGVjb1NldCh0aGlzLmNvbmNlYWxtZW50cyk7XG5cdFx0dGhpcy5hdG9taWNSYW5nZXMgPSBidWlsZEF0b21pY1Jhbmdlcyh0aGlzLmNvbmNlYWxtZW50cyk7XG5cdH1cbn0sIHtcblx0ZGVjb3JhdGlvbnM6IHYgPT4gdi5kZWNvcmF0aW9ucyxcblx0cHJvdmlkZTogcGx1Z2luID0+IEVkaXRvclZpZXcuYXRvbWljUmFuZ2VzLm9mKHZpZXcgPT4gdmlldy5wbHVnaW4ocGx1Z2luKS5hdG9taWNSYW5nZXMpLFxufSk7XG4iXX0=