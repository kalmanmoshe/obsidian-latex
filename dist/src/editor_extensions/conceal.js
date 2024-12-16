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
        const mousedown = update.view.plugin(livePreviewState)?.mousedown || false;
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
    provide: plugin => EditorView.atomicRanges.of(view => {
        const pluginInstance = view.plugin?.(plugin);
        return pluginInstance?.atomicRanges ?? RangeSet.empty;
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uY2VhbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3JfZXh0ZW5zaW9ucy9jb25jZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBEQUEwRDtBQUUxRCxPQUFPLEVBQWMsVUFBVSxFQUFpQixVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzdHLE9BQU8sRUFBMEIsUUFBUSxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3hDLE9BQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFZdEQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGFBQWEsQ0FBQyxHQUFHLFlBQTJCO0lBQzNELE9BQU8sWUFBWSxDQUFDO0FBQ3JCLENBQUM7QUFhRCxNQUFNLGFBQWMsU0FBUSxVQUFVO0lBSWhCO0lBSEosU0FBUyxDQUFTO0lBQ2xCLFdBQVcsQ0FBUztJQUVyQyxZQUFxQixNQUFjLEVBQUUsU0FBa0IsRUFBRSxXQUFvQjtRQUM1RSxLQUFLLEVBQUUsQ0FBQztRQURZLFdBQU0sR0FBTixNQUFNLENBQVE7UUFHbEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzVDLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN2RCxDQUFDO0lBRUQsRUFBRSxDQUFDLEtBQW9CO1FBQ3RCLE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUks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QUM7UUFDaEMsQ0FBQztRQUVELElBQUksbUJBQW1CLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztRQUNqQyxJQUFJLENBQUMsV0FBVyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbkQsSUFBSSxDQUFDLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDMUQsQ0FBQztDQUNELEVBQUU7SUFDRixXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVztJQUMvQixPQUFPLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNwRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0MsT0FBUSxjQUFjLEVBQUUsWUFBOEIsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDO0lBQzFFLENBQUMsQ0FBQztDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIGh0dHBzOi8vZGlzY3Vzcy5jb2RlbWlycm9yLm5ldC90L2NvbmNlYWxpbmctc3ludGF4LzMxMzVcclxuXHJcbmltcG9ydCB7IFZpZXdVcGRhdGUsIERlY29yYXRpb24sIERlY29yYXRpb25TZXQsIFdpZGdldFR5cGUsIFZpZXdQbHVnaW4sIEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBFZGl0b3JTZWxlY3Rpb24sIFJhbmdlLCBSYW5nZVNldCwgUmFuZ2VTZXRCdWlsZGVyLCBSYW5nZVZhbHVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XHJcbmltcG9ydCB7IGNvbmNlYWwgfSBmcm9tIFwiLi9jb25jZWFsX2Zuc1wiO1xyXG5pbXBvcnQgeyBkZWJvdW5jZSwgbGl2ZVByZXZpZXdTdGF0ZSB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5cclxuZXhwb3J0IHR5cGUgUmVwbGFjZW1lbnQgPSB7XHJcblx0c3RhcnQ6IG51bWJlcixcclxuXHRlbmQ6IG51bWJlcixcclxuXHR0ZXh0OiBzdHJpbmcsXHJcblx0Y2xhc3M/OiBzdHJpbmcsXHJcblx0ZWxlbWVudFR5cGU/OiBzdHJpbmcsXHJcbn07XHJcblxyXG5leHBvcnQgdHlwZSBDb25jZWFsU3BlYyA9IFJlcGxhY2VtZW50W107XHJcblxyXG4vKipcclxuICogTWFrZSBhIENvbmNlYWxTcGVjIGZyb20gdGhlIGdpdmVuIGxpc3Qgb2YgUmVwbGFjZW1lbnRzLlxyXG4gKiBUaGlzIGZ1bmN0aW9uIGVzc2VudGlhbGx5IGRvZXMgbm90aGluZyBidXQgaW1wcm92ZXMgcmVhZGFiaWxpdHkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbWtDb25jZWFsU3BlYyguLi5yZXBsYWNlbWVudHM6IFJlcGxhY2VtZW50W10pIHtcclxuXHRyZXR1cm4gcmVwbGFjZW1lbnRzO1xyXG59XHJcblxyXG5leHBvcnQgdHlwZSBDb25jZWFsbWVudCA9IHtcclxuXHRzcGVjOiBDb25jZWFsU3BlYyxcclxuXHRjdXJzb3JQb3NUeXBlOiBcIndpdGhpblwiIHwgXCJhcGFydFwiIHwgXCJlZGdlXCIsXHJcblx0ZW5hYmxlOiBib29sZWFuLFxyXG59O1xyXG5cclxuLy8gUmVwcmVzZW50cyBob3cgYSBjb25jZWFsbWVudCBzaG91bGQgYmUgaGFuZGxlZFxyXG4vLyAnZGVsYXknIG1lYW5zIHJldmVhbCBhZnRlciBhIHRpbWUgZGVsYXkuXHJcbnR5cGUgQ29uY2VhbEFjdGlvbiA9IFwiY29uY2VhbFwiIHwgXCJyZXZlYWxcIiB8IFwiZGVsYXlcIjtcclxuXHJcblxyXG5jbGFzcyBDb25jZWFsV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0VHlwZSB7XHJcblx0cHJpdmF0ZSByZWFkb25seSBjbGFzc05hbWU6IHN0cmluZztcclxuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnRUeXBlOiBzdHJpbmc7XHJcblxyXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHN5bWJvbDogc3RyaW5nLCBjbGFzc05hbWU/OiBzdHJpbmcsIGVsZW1lbnRUeXBlPzogc3RyaW5nKSB7XHJcblx0XHRzdXBlcigpO1xyXG5cclxuXHRcdHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lID8gY2xhc3NOYW1lIDogXCJcIjtcclxuXHRcdHRoaXMuZWxlbWVudFR5cGUgPSBlbGVtZW50VHlwZSA/IGVsZW1lbnRUeXBlIDogXCJzcGFuXCI7XHJcblx0fVxyXG5cclxuXHRlcShvdGhlcjogQ29uY2VhbFdpZGdldCkge1xyXG5cdFx0cmV0dXJuICgob3RoZXIuc3ltYm9sID09IHRoaXMuc3ltYm9sKSAmJiAob3RoZXIuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZSkgJiYgKG90aGVyLmVsZW1lbnRUeXBlID09PSB0aGlzLmVsZW1lbnRUeXBlKSk7XHJcblx0fVxyXG5cclxuXHR0b0RPTSgpIHtcclxuXHRcdGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRoaXMuZWxlbWVudFR5cGUpO1xyXG5cdFx0c3Bhbi5jbGFzc05hbWUgPSBcImNtLW1hdGggXCIgKyB0aGlzLmNsYXNzTmFtZTtcclxuXHRcdHNwYW4udGV4dENvbnRlbnQgPSB0aGlzLnN5bWJvbDtcclxuXHRcdHJldHVybiBzcGFuO1xyXG5cdH1cclxuXHJcblx0aWdub3JlRXZlbnQoKSB7XHJcblx0XHRyZXR1cm4gZmFsc2U7XHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBUZXh0V2lkZ2V0IGV4dGVuZHMgV2lkZ2V0VHlwZSB7XHJcblxyXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHN5bWJvbDogc3RyaW5nKSB7XHJcblx0XHRzdXBlcigpO1xyXG5cdH1cclxuXHJcblx0ZXEob3RoZXI6IFRleHRXaWRnZXQpIHtcclxuXHRcdHJldHVybiAob3RoZXIuc3ltYm9sID09IHRoaXMuc3ltYm9sKTtcclxuXHR9XHJcblxyXG5cdHRvRE9NKCkge1xyXG5cdFx0Y29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG5cdFx0c3Bhbi5jbGFzc05hbWUgPSBcImNtLW1hdGhcIjtcclxuXHRcdHNwYW4udGV4dENvbnRlbnQgPSB0aGlzLnN5bWJvbDtcclxuXHRcdHJldHVybiBzcGFuO1xyXG5cdH1cclxuXHJcblx0aWdub3JlRXZlbnQoKSB7XHJcblx0XHRyZXR1cm4gZmFsc2U7XHJcblx0fVxyXG59XHJcblxyXG4vKipcclxuICogRGV0ZXJtaW5lIGlmIHRoZSB0d28gQ29uY2VhbFNwZWMgaW5zdGFuY2VzIGJlZm9yZSBhbmQgYWZ0ZXIgdGhlIHVwZGF0ZSBjYW4gYmVcclxuICogY29uc2lkZXJlZCBpZGVudGljYWwuXHJcbiAqL1xyXG5mdW5jdGlvbiBhdFNhbWVQb3NBZnRlcihcclxuXHR1cGRhdGU6IFZpZXdVcGRhdGUsXHJcblx0b2xkQ29uY2VhbDogQ29uY2VhbFNwZWMsXHJcblx0bmV3Q29uY2VhbDogQ29uY2VhbFNwZWMsXHJcbik6IGJvb2xlYW4ge1xyXG5cdGlmIChvbGRDb25jZWFsLmxlbmd0aCAhPT0gbmV3Q29uY2VhbC5sZW5ndGgpIHJldHVybiBmYWxzZTtcclxuXHJcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvbGRDb25jZWFsLmxlbmd0aDsgKytpKSB7XHJcblx0XHQvLyBTZXQgYXNzb2NpYXRpdml0eSB0byBlbnN1cmUgdGhhdCBpbnNlcnRpb25zIG9uIGVpdGhlciBzaWRlIG9mIHRoZVxyXG5cdFx0Ly8gY29uY2VhbGVkIHJlZ2lvbiBkbyBub3QgZXhwYW5kIHRoZSByZWdpb25cclxuXHRcdGNvbnN0IG9sZFN0YXJ0VXBkYXRlZCA9IHVwZGF0ZS5jaGFuZ2VzLm1hcFBvcyhvbGRDb25jZWFsW2ldLnN0YXJ0LCAxKTtcclxuXHRcdGNvbnN0IG9sZEVuZFVwZGF0ZWQgPSB1cGRhdGUuY2hhbmdlcy5tYXBQb3Mob2xkQ29uY2VhbFtpXS5lbmQsIC0xKTtcclxuXHRcdGNvbnN0IGIgPSBvbGRTdGFydFVwZGF0ZWQgPT0gbmV3Q29uY2VhbFtpXS5zdGFydCAmJiBvbGRFbmRVcGRhdGVkID09IG5ld0NvbmNlYWxbaV0uZW5kO1xyXG5cdFx0aWYgKCFiKSByZXR1cm4gZmFsc2U7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZGV0ZXJtaW5lQ3Vyc29yUG9zVHlwZShcclxuXHRzZWw6IEVkaXRvclNlbGVjdGlvbixcclxuXHRjb25jZWFsU3BlYzogQ29uY2VhbFNwZWMsXHJcbik6IENvbmNlYWxtZW50W1wiY3Vyc29yUG9zVHlwZVwiXSB7XHJcblx0Ly8gUHJpb3JpdHk6IFwid2l0aGluXCIgPiBcImVkZ2VcIiA+IFwiYXBhcnRcIlxyXG5cclxuXHRsZXQgY3Vyc29yUG9zVHlwZTogQ29uY2VhbG1lbnRbXCJjdXJzb3JQb3NUeXBlXCJdID0gXCJhcGFydFwiO1xyXG5cclxuXHRmb3IgKGNvbnN0IHJhbmdlIG9mIHNlbC5yYW5nZXMpIHtcclxuXHRcdGZvciAoY29uc3QgcmVwbGFjZSBvZiBjb25jZWFsU3BlYykge1xyXG5cdFx0XHQvLyAnY3Vyc29yUG9zVHlwZScgaXMgZ3VhcmFudGVlZCB0byBiZSBcImVkZ2VcIiBvciBcImFwYXJ0XCIgYXQgdGhpcyBwb2ludFxyXG5cdFx0XHRjb25zdCBvdmVybGFwUmFuZ2VGcm9tID0gTWF0aC5tYXgocmFuZ2UuZnJvbSwgcmVwbGFjZS5zdGFydCk7XHJcblx0XHRcdGNvbnN0IG92ZXJsYXBSYW5nZVRvID0gTWF0aC5taW4ocmFuZ2UudG8sIHJlcGxhY2UuZW5kKTtcclxuXHJcblx0XHRcdGlmIChcclxuXHRcdFx0XHRvdmVybGFwUmFuZ2VGcm9tID09PSBvdmVybGFwUmFuZ2VUbyAmJlxyXG5cdFx0XHRcdChvdmVybGFwUmFuZ2VGcm9tID09PSByZXBsYWNlLnN0YXJ0IHx8IG92ZXJsYXBSYW5nZUZyb20gPT09IHJlcGxhY2UuZW5kKVxyXG5cdFx0XHQpIHtcclxuXHRcdFx0XHRjdXJzb3JQb3NUeXBlID0gXCJlZGdlXCI7XHJcblx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGlmIChvdmVybGFwUmFuZ2VGcm9tIDw9IG92ZXJsYXBSYW5nZVRvKSByZXR1cm4gXCJ3aXRoaW5cIjtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiBjdXJzb3JQb3NUeXBlO1xyXG59XHJcblxyXG4vKlxyXG4qIFdlIGRldGVybWluZSBob3cgdG8gaGFuZGxlIGEgY29uY2VhbG1lbnQgYmFzZWQgb24gaXRzICdjdXJzb3JQb3NUeXBlJyBiZWZvcmVcclxuKiBhbmQgYWZ0ZXIgYW4gdXBkYXRlIGFuZCBjdXJyZW50IG1vdXNlZG93biBzdGF0ZS5cclxuKlxyXG4qIFdoZW4gdGhlIG1vdXNlIGlzIGRvd24sIHdlIGVuYWJsZSBhbGwgY29uY2VhbG1lbnRzIHRvIG1ha2Ugc2VsZWN0aW5nIG1hdGhcclxuKiBleHByZXNzaW9ucyBlYXNpZXIuXHJcbipcclxuKiBXaGVuIHRoZSBtb3VzZSBpcyB1cCwgd2UgZm9sbG93IHRoZSB0YWJsZSBiZWxvdy5cclxuKiBUaGUgcm93IHJlcHJlc2VudHMgdGhlIHByZXZpb3VzICdjdXJzb3JQb3NUeXBlJyBhbmQgdGhlIGNvbHVtbiByZXByZXNlbnRzIHRoZVxyXG4qIGN1cnJlbnQgJ2N1cnNvclBvc1R5cGUnLiBFYWNoIGNlbGwgY29udGFpbnMgdGhlIGFjdGlvbiB0byBiZSB0YWtlbi5cclxuKlxyXG4qICAgICAgICB8ICBhcGFydCAgfCAgZWRnZSAgfCB3aXRoaW5cclxuKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4qIGFwYXJ0ICB8IGNvbmNlYWwgfCBkZWxheSAgfCByZXZlYWxcclxuKiBlZGdlICAgfCBjb25jZWFsIHwgZGVsYXkgIHwgcmV2ZWFsXHJcbiogd2l0aGluIHwgY29uY2VhbCB8IHJldmVhbCB8IHJldmVhbFxyXG4qIE4vQSAgICB8IGNvbmNlYWwgfCByZXZlYWwgfCByZXZlYWxcclxuKlxyXG4qICdOL0EnIG1lYW5zIHRoYXQgdGhlIGNvbmNlYWxtZW50IGRvIG5vdCBleGlzdCBiZWZvcmUgdGhlIHVwZGF0ZSwgd2hpY2ggc2hvdWxkXHJcbiogYmUganVkZ2VkIGJ5ICdhdFNhbWVQb3NBZnRlcicgZnVuY3Rpb24uXHJcbiovXHJcbmZ1bmN0aW9uIGRldGVybWluZUFjdGlvbihcclxuXHRvbGRDdXJzb3I6IENvbmNlYWxtZW50W1wiY3Vyc29yUG9zVHlwZVwiXSB8IHVuZGVmaW5lZCxcclxuXHRuZXdDdXJzb3I6IENvbmNlYWxtZW50W1wiY3Vyc29yUG9zVHlwZVwiXSxcclxuXHRtb3VzZWRvd246IGJvb2xlYW4sXHJcblx0ZGVsYXlFbmFibGVkOiBib29sZWFuLFxyXG4pOiBDb25jZWFsQWN0aW9uIHtcclxuXHRpZiAobW91c2Vkb3duKSByZXR1cm4gXCJjb25jZWFsXCI7XHJcblxyXG5cdGlmIChuZXdDdXJzb3IgPT09IFwiYXBhcnRcIikgcmV0dXJuIFwiY29uY2VhbFwiO1xyXG5cdGlmIChuZXdDdXJzb3IgPT09IFwid2l0aGluXCIpIHJldHVybiBcInJldmVhbFwiO1xyXG5cclxuXHQvLyBuZXdDdXJzb3IgPT09IFwiZWRnZVwiXHJcblx0aWYgKCFkZWxheUVuYWJsZWQpIHJldHVybiBcInJldmVhbFwiO1xyXG5cdC8vIGRlbGF5IGlzIGVuYWJsZWRcclxuXHRpZiAoIW9sZEN1cnNvciB8fCBvbGRDdXJzb3IgPT09IFwid2l0aGluXCIpIHJldHVybiBcInJldmVhbFwiO1xyXG5cdGVsc2UgcmV0dXJuIFwiZGVsYXlcIjtcclxufVxyXG5cclxuLy8gQnVpbGQgYSBkZWNvcmF0aW9uIHNldCBmcm9tIHRoZSBnaXZlbiBjb25jZWFsbWVudHNcclxuZnVuY3Rpb24gYnVpbGREZWNvU2V0KGNvbmNlYWxtZW50czogQ29uY2VhbG1lbnRbXSkge1xyXG5cdGNvbnN0IGRlY29zOiBSYW5nZTxEZWNvcmF0aW9uPltdID0gW11cclxuXHJcblx0Zm9yIChjb25zdCBjb25jIG9mIGNvbmNlYWxtZW50cykge1xyXG5cdFx0aWYgKCFjb25jLmVuYWJsZSkgY29udGludWU7XHJcblxyXG5cdFx0Zm9yIChjb25zdCByZXBsYWNlIG9mIGNvbmMuc3BlYykge1xyXG5cdFx0XHRpZiAocmVwbGFjZS5zdGFydCA9PT0gcmVwbGFjZS5lbmQpIHtcclxuXHRcdFx0XHQvLyBBZGQgYW4gYWRkaXRpb25hbCBcIi9cIiBzeW1ib2wsIGFzIHBhcnQgb2YgY29uY2VhbGluZyBcXFxcZnJhY3t9e30gLT4gKCkvKClcclxuXHRcdFx0XHRkZWNvcy5wdXNoKFxyXG5cdFx0XHRcdFx0RGVjb3JhdGlvbi53aWRnZXQoe1xyXG5cdFx0XHRcdFx0XHR3aWRnZXQ6IG5ldyBUZXh0V2lkZ2V0KHJlcGxhY2UudGV4dCksXHJcblx0XHRcdFx0XHRcdGJsb2NrOiBmYWxzZSxcclxuXHRcdFx0XHRcdH0pLnJhbmdlKHJlcGxhY2Uuc3RhcnQsIHJlcGxhY2UuZW5kKVxyXG5cdFx0XHRcdCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Ly8gSW1wcm92ZSBzZWxlY3RpbmcgZW1wdHkgcmVwbGFjZW1lbnRzIHN1Y2ggYXMgXCJcXGZyYWNcIiAtPiBcIlwiXHJcblx0XHRcdFx0Ly8gTk9URTogVGhpcyBtaWdodCBub3QgYmUgbmVjZXNzYXJ5XHJcblx0XHRcdFx0Y29uc3QgaW5jbHVzaXZlU3RhcnQgPSByZXBsYWNlLnRleHQgPT09IFwiXCI7XHJcblx0XHRcdFx0Y29uc3QgaW5jbHVzaXZlRW5kID0gZmFsc2U7XHJcblxyXG5cdFx0XHRcdGRlY29zLnB1c2goXHJcblx0XHRcdFx0XHREZWNvcmF0aW9uLnJlcGxhY2Uoe1xyXG5cdFx0XHRcdFx0XHR3aWRnZXQ6IG5ldyBDb25jZWFsV2lkZ2V0KFxyXG5cdFx0XHRcdFx0XHRcdHJlcGxhY2UudGV4dCxcclxuXHRcdFx0XHRcdFx0XHRyZXBsYWNlLmNsYXNzLFxyXG5cdFx0XHRcdFx0XHRcdHJlcGxhY2UuZWxlbWVudFR5cGVcclxuXHRcdFx0XHRcdFx0KSxcclxuXHRcdFx0XHRcdFx0aW5jbHVzaXZlU3RhcnQsXHJcblx0XHRcdFx0XHRcdGluY2x1c2l2ZUVuZCxcclxuXHRcdFx0XHRcdFx0YmxvY2s6IGZhbHNlLFxyXG5cdFx0XHRcdFx0fSkucmFuZ2UocmVwbGFjZS5zdGFydCwgcmVwbGFjZS5lbmQpXHJcblx0XHRcdFx0KTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cmV0dXJuIERlY29yYXRpb24uc2V0KGRlY29zLCB0cnVlKTtcclxufVxyXG5cclxuLy8gQnVpbGQgYXRvbWljIHJhbmdlcyBmcm9tIHRoZSBnaXZlbiBjb25jZWFsbWVudHMuXHJcbi8vIFRoZSByZXN1bHRpbmcgcmFuZ2VzIGFyZSBiYXNpY2FsbHkgdGhlIHNhbWUgYXMgdGhlIG9yaWdpbmFsIHJlcGxhY2VtZW50cywgYnV0IGVtcHR5IHJlcGxhY2VtZW50c1xyXG4vLyBhcmUgbWVyZ2VkIHdpdGggdGhlIFwibmV4dCBjaGFyYWN0ZXIsXCIgd2hpY2ggY2FuIGJlIGVpdGhlciBwbGFpbiB0ZXh0IG9yIGFub3RoZXIgcmVwbGFjZW1lbnQuXHJcbi8vIFRoaXMgYWRqdXN0bWVudCBtYWtlcyBjdXJzb3IgbW92ZW1lbnQgYXJvdW5kIGVtcHR5IHJlcGxhY2VtZW50cyBtb3JlIGludHVpdGl2ZS5cclxuZnVuY3Rpb24gYnVpbGRBdG9taWNSYW5nZXMoY29uY2VhbG1lbnRzOiBDb25jZWFsbWVudFtdKSB7XHJcblx0Y29uc3QgcmVwbHM6IFJlcGxhY2VtZW50W10gPSBjb25jZWFsbWVudHNcclxuXHRcdC5maWx0ZXIoYyA9PiBjLmVuYWJsZSlcclxuXHRcdC5mbGF0TWFwKGMgPT4gYy5zcGVjKVxyXG5cdFx0LnNvcnQoKGEsIGIpID0+IGEuc3RhcnQgLSBiLnN0YXJ0KTtcclxuXHJcblx0Ly8gUmFuZ2VTZXQgcmVxdWlyZXMgUmFuZ2VWYWx1ZSBidXQgd2UgZG8gbm90IG5lZWQgb25lXHJcblx0Y29uc3QgZmFrZXZhbCA9IG5ldyAoY2xhc3MgZXh0ZW5kcyBSYW5nZVZhbHVlIHt9KTtcclxuXHRjb25zdCBidWlsZGVyID0gbmV3IFJhbmdlU2V0QnVpbGRlcigpO1xyXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgcmVwbHMubGVuZ3RoOyBpKyspIHtcclxuXHRcdGlmIChyZXBsc1tpXS50ZXh0ID09PSBcIlwiKSB7XHJcblx0XHRcdGlmIChpKzEgIT0gcmVwbHMubGVuZ3RoICYmIHJlcGxzW2ldLmVuZCA9PSByZXBsc1tpKzFdLnN0YXJ0KSB7XHJcblx0XHRcdFx0YnVpbGRlci5hZGQocmVwbHNbaV0uc3RhcnQsIHJlcGxzW2krMV0uZW5kLCBmYWtldmFsKTtcclxuXHRcdFx0XHRpKys7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0YnVpbGRlci5hZGQocmVwbHNbaV0uc3RhcnQsIHJlcGxzW2ldLmVuZCArIDEsIGZha2V2YWwpO1xyXG5cdFx0XHR9XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRidWlsZGVyLmFkZChyZXBsc1tpXS5zdGFydCwgcmVwbHNbaV0uZW5kLCBmYWtldmFsKTtcclxuXHRcdH1cclxuXHR9XHJcblx0cmV0dXJuIGJ1aWxkZXIuZmluaXNoKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBta0NvbmNlYWxQbHVnaW4gPSAocmV2ZWFsVGltZW91dDogbnVtYmVyKSA9PiBWaWV3UGx1Z2luLmZyb21DbGFzcyhjbGFzcyB7XHJcblx0Ly8gU3RhdGVmdWwgVmlld1BsdWdpbjogeW91IHNob3VsZCBhdm9pZCBvbmUgaW4gZ2VuZXJhbCwgYnV0IGhlcmVcclxuXHQvLyB0aGUgYXBwcm9hY2ggYmFzZWQgb24gU3RhdGVGaWVsZCBhbmQgdXBkYXRlTGlzdGVuZXIgY29uZmxpY3RzIHdpdGhcclxuXHQvLyBvYnNpZGlhbidzIGludGVybmFsIGxvZ2ljIGFuZCBjYXVzZXMgd2VpcmQgcmVuZGVyaW5nLlxyXG5cdGNvbmNlYWxtZW50czogQ29uY2VhbG1lbnRbXTtcclxuXHRkZWNvcmF0aW9uczogRGVjb3JhdGlvblNldDtcclxuXHRhdG9taWNSYW5nZXM6IFJhbmdlU2V0PFJhbmdlVmFsdWU+O1xyXG5cdGRlbGF5RW5hYmxlZDogYm9vbGVhbjtcclxuXHJcblxyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0dGhpcy5jb25jZWFsbWVudHMgPSBbXTtcclxuXHRcdHRoaXMuZGVjb3JhdGlvbnMgPSBEZWNvcmF0aW9uLm5vbmU7XHJcblx0XHR0aGlzLmF0b21pY1JhbmdlcyA9IFJhbmdlU2V0LmVtcHR5O1xyXG5cdFx0dGhpcy5kZWxheUVuYWJsZWQgPSByZXZlYWxUaW1lb3V0ID4gMDtcclxuXHR9XHJcblxyXG5cdGRlbGF5ZWRSZXZlYWwgPSBkZWJvdW5jZSgoZGVsYXllZENvbmNlYWxtZW50czogQ29uY2VhbG1lbnRbXSwgdmlldzogRWRpdG9yVmlldykgPT4ge1xyXG5cdFx0Ly8gSW1wbGljaXRseSBjaGFuZ2UgdGhlIHN0YXRlXHJcblx0XHRmb3IgKGNvbnN0IGNvbmNlYWxtZW50IG9mIGRlbGF5ZWRDb25jZWFsbWVudHMpIHtcclxuXHRcdFx0Y29uY2VhbG1lbnQuZW5hYmxlID0gZmFsc2U7XHJcblx0XHR9XHJcblx0XHR0aGlzLmRlY29yYXRpb25zID0gYnVpbGREZWNvU2V0KHRoaXMuY29uY2VhbG1lbnRzKTtcclxuXHRcdHRoaXMuYXRvbWljUmFuZ2VzID0gYnVpbGRBdG9taWNSYW5nZXModGhpcy5jb25jZWFsbWVudHMpO1xyXG5cclxuXHRcdC8vIEludm9rZSB0aGUgdXBkYXRlIG1ldGhvZCB0byByZWZsZWN0IHRoZSBjaGFuZ2VzIG9mIHRoaXMuZGVjb3JhdGlvblxyXG5cdFx0dmlldy5kaXNwYXRjaCgpO1xyXG5cdH0sIHJldmVhbFRpbWVvdXQsIHRydWUpO1xyXG5cclxuXHR1cGRhdGUodXBkYXRlOiBWaWV3VXBkYXRlKSB7XHJcblx0XHRpZiAoISh1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUudmlld3BvcnRDaGFuZ2VkIHx8IHVwZGF0ZS5zZWxlY3Rpb25TZXQpKVxyXG5cdFx0XHRyZXR1cm47XHJcblxyXG5cdFx0Ly8gQ2FuY2VsIHRoZSBkZWxheWVkIHJldmVhbG1lbnQgd2hlbmV2ZXIgd2UgdXBkYXRlIHRoZSBjb25jZWFsbWVudHNcclxuXHRcdHRoaXMuZGVsYXllZFJldmVhbC5jYW5jZWwoKTtcclxuXHJcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB1cGRhdGUuc3RhdGUuc2VsZWN0aW9uO1xyXG5cdFx0Y29uc3QgbW91c2Vkb3duID0gdXBkYXRlLnZpZXcucGx1Z2luKGxpdmVQcmV2aWV3U3RhdGUpPy5tb3VzZWRvd258fGZhbHNlO1xyXG5cclxuXHRcdGNvbnN0IGNvbmNlYWxTcGVjcyA9IGNvbmNlYWwodXBkYXRlLnZpZXcpO1xyXG5cclxuXHRcdC8vIENvbGxlY3QgY29uY2VhbG1lbnRzIGZyb20gdGhlIG5ldyBjb25jZWFsIHNwZWNzXHJcblx0XHRjb25zdCBjb25jZWFsbWVudHM6IENvbmNlYWxtZW50W10gPSBbXTtcclxuXHRcdC8vIGNvbmNlYWxtZW50cyB0aGF0IHNob3VsZCBiZSByZXZlYWxlZCBhZnRlciBhIGRlbGF5IChpLmUuICdkZWxheScgYWN0aW9uKVxyXG5cdFx0Y29uc3QgZGVsYXllZENvbmNlYWxtZW50czogQ29uY2VhbG1lbnRbXSA9IFtdO1xyXG5cclxuXHRcdGZvciAoY29uc3Qgc3BlYyBvZiBjb25jZWFsU3BlY3MpIHtcclxuXHRcdFx0Y29uc3QgY3Vyc29yUG9zVHlwZSA9IGRldGVybWluZUN1cnNvclBvc1R5cGUoc2VsZWN0aW9uLCBzcGVjKTtcclxuXHRcdFx0Y29uc3Qgb2xkQ29uY2VhbG1lbnQgPSB0aGlzLmNvbmNlYWxtZW50cy5maW5kKFxyXG5cdFx0XHRcdChvbGQpID0+IGF0U2FtZVBvc0FmdGVyKHVwZGF0ZSwgb2xkLnNwZWMsIHNwZWMpXHJcblx0XHRcdCk7XHJcblxyXG5cdFx0XHRjb25zdCBjb25jZWFsQWN0aW9uID0gZGV0ZXJtaW5lQWN0aW9uKFxyXG5cdFx0XHRcdG9sZENvbmNlYWxtZW50Py5jdXJzb3JQb3NUeXBlLCBjdXJzb3JQb3NUeXBlLCBtb3VzZWRvd24sIHRoaXMuZGVsYXlFbmFibGVkXHJcblx0XHRcdCk7XHJcblxyXG5cdFx0XHRjb25zdCBjb25jZWFsbWVudDogQ29uY2VhbG1lbnQgPSB7XHJcblx0XHRcdFx0c3BlYyxcclxuXHRcdFx0XHRjdXJzb3JQb3NUeXBlLFxyXG5cdFx0XHRcdGVuYWJsZTogY29uY2VhbEFjdGlvbiAhPT0gXCJyZXZlYWxcIixcclxuXHRcdFx0fTtcclxuXHJcblx0XHRcdGlmIChjb25jZWFsQWN0aW9uID09PSBcImRlbGF5XCIpIHtcclxuXHRcdFx0XHRkZWxheWVkQ29uY2VhbG1lbnRzLnB1c2goY29uY2VhbG1lbnQpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRjb25jZWFsbWVudHMucHVzaChjb25jZWFsbWVudCk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKGRlbGF5ZWRDb25jZWFsbWVudHMubGVuZ3RoID4gMCkge1xyXG5cdFx0XHR0aGlzLmRlbGF5ZWRSZXZlYWwoZGVsYXllZENvbmNlYWxtZW50cywgdXBkYXRlLnZpZXcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuY29uY2VhbG1lbnRzID0gY29uY2VhbG1lbnRzO1xyXG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IGJ1aWxkRGVjb1NldCh0aGlzLmNvbmNlYWxtZW50cyk7XHJcblx0XHR0aGlzLmF0b21pY1JhbmdlcyA9IGJ1aWxkQXRvbWljUmFuZ2VzKHRoaXMuY29uY2VhbG1lbnRzKTtcclxuXHR9XHJcbn0sIHtcclxuXHRkZWNvcmF0aW9uczogdiA9PiB2LmRlY29yYXRpb25zLFxyXG5cdHByb3ZpZGU6IHBsdWdpbiA9PiBFZGl0b3JWaWV3LmF0b21pY1Jhbmdlcy5vZih2aWV3ID0+IHtcclxuXHRcdGNvbnN0IHBsdWdpbkluc3RhbmNlID0gdmlldy5wbHVnaW4/LihwbHVnaW4pO1xyXG5cdFx0cmV0dXJuIChwbHVnaW5JbnN0YW5jZT8uYXRvbWljUmFuZ2VzIGFzIFJhbmdlU2V0PGFueT4pID8/IFJhbmdlU2V0LmVtcHR5O1xyXG5cdH0pLFx0XHJcbn0pO1xyXG4iXX0=