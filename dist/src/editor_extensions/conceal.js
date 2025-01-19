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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uY2VhbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3JfZXh0ZW5zaW9ucy9jb25jZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBEQUEwRDtBQUUxRCxPQUFPLEVBQWMsVUFBVSxFQUFpQixVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzdHLE9BQU8sRUFBMEIsUUFBUSxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3hDLE9BQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFZdEQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGFBQWEsQ0FBQyxHQUFHLFlBQTJCO0lBQzNELE9BQU8sWUFBWSxDQUFDO0FBQ3JCLENBQUM7QUFhRCxNQUFNLGFBQWMsU0FBUSxVQUFVO0lBSWhCO0lBSEosU0FBUyxDQUFTO0lBQ2xCLFdBQVcsQ0FBUztJQUVyQyxZQUFxQixNQUFjLEVBQUUsU0FBa0IsRUFBRSxXQUFvQjtRQUM1RSxLQUFLLEVBQUUsQ0FBQztRQURZLFdBQU0sR0FBTixNQUFNLENBQVE7UUFHbEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzVDLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN2RCxDQUFDO0lBRUQsRUFBRSxDQUFDLEtBQW9CO1FBQ3RCLE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUks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QUM7UUFDaEMsQ0FBQztRQUVELElBQUksbUJBQW1CLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztRQUNqQyxJQUFJLENBQUMsV0FBVyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbkQsSUFBSSxDQUFDLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDMUQsQ0FBQztDQUNELEVBQUU7SUFDRixXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVztJQUMvQixPQUFPLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNwRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0MsT0FBUSxjQUFjLEVBQUUsWUFBOEIsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDO0lBQzFFLENBQUMsQ0FBQztDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIGh0dHBzOi8vZGlzY3Vzcy5jb2RlbWlycm9yLm5ldC90L2NvbmNlYWxpbmctc3ludGF4LzMxMzVcblxuaW1wb3J0IHsgVmlld1VwZGF0ZSwgRGVjb3JhdGlvbiwgRGVjb3JhdGlvblNldCwgV2lkZ2V0VHlwZSwgVmlld1BsdWdpbiwgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5pbXBvcnQgeyBFZGl0b3JTZWxlY3Rpb24sIFJhbmdlLCBSYW5nZVNldCwgUmFuZ2VTZXRCdWlsZGVyLCBSYW5nZVZhbHVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBjb25jZWFsIH0gZnJvbSBcIi4vY29uY2VhbF9mbnNcIjtcbmltcG9ydCB7IGRlYm91bmNlLCBsaXZlUHJldmlld1N0YXRlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCB0eXBlIFJlcGxhY2VtZW50ID0ge1xuXHRzdGFydDogbnVtYmVyLFxuXHRlbmQ6IG51bWJlcixcblx0dGV4dDogc3RyaW5nLFxuXHRjbGFzcz86IHN0cmluZyxcblx0ZWxlbWVudFR5cGU/OiBzdHJpbmcsXG59O1xuXG5leHBvcnQgdHlwZSBDb25jZWFsU3BlYyA9IFJlcGxhY2VtZW50W107XG5cbi8qKlxuICogTWFrZSBhIENvbmNlYWxTcGVjIGZyb20gdGhlIGdpdmVuIGxpc3Qgb2YgUmVwbGFjZW1lbnRzLlxuICogVGhpcyBmdW5jdGlvbiBlc3NlbnRpYWxseSBkb2VzIG5vdGhpbmcgYnV0IGltcHJvdmVzIHJlYWRhYmlsaXR5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWtDb25jZWFsU3BlYyguLi5yZXBsYWNlbWVudHM6IFJlcGxhY2VtZW50W10pIHtcblx0cmV0dXJuIHJlcGxhY2VtZW50cztcbn1cblxuZXhwb3J0IHR5cGUgQ29uY2VhbG1lbnQgPSB7XG5cdHNwZWM6IENvbmNlYWxTcGVjLFxuXHRjdXJzb3JQb3NUeXBlOiBcIndpdGhpblwiIHwgXCJhcGFydFwiIHwgXCJlZGdlXCIsXG5cdGVuYWJsZTogYm9vbGVhbixcbn07XG5cbi8vIFJlcHJlc2VudHMgaG93IGEgY29uY2VhbG1lbnQgc2hvdWxkIGJlIGhhbmRsZWRcbi8vICdkZWxheScgbWVhbnMgcmV2ZWFsIGFmdGVyIGEgdGltZSBkZWxheS5cbnR5cGUgQ29uY2VhbEFjdGlvbiA9IFwiY29uY2VhbFwiIHwgXCJyZXZlYWxcIiB8IFwiZGVsYXlcIjtcblxuXG5jbGFzcyBDb25jZWFsV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0VHlwZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2xhc3NOYW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudFR5cGU6IHN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBzeW1ib2w6IHN0cmluZywgY2xhc3NOYW1lPzogc3RyaW5nLCBlbGVtZW50VHlwZT86IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZSA/IGNsYXNzTmFtZSA6IFwiXCI7XG5cdFx0dGhpcy5lbGVtZW50VHlwZSA9IGVsZW1lbnRUeXBlID8gZWxlbWVudFR5cGUgOiBcInNwYW5cIjtcblx0fVxuXG5cdGVxKG90aGVyOiBDb25jZWFsV2lkZ2V0KSB7XG5cdFx0cmV0dXJuICgob3RoZXIuc3ltYm9sID09IHRoaXMuc3ltYm9sKSAmJiAob3RoZXIuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZSkgJiYgKG90aGVyLmVsZW1lbnRUeXBlID09PSB0aGlzLmVsZW1lbnRUeXBlKSk7XG5cdH1cblxuXHR0b0RPTSgpIHtcblx0XHRjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0aGlzLmVsZW1lbnRUeXBlKTtcblx0XHRzcGFuLmNsYXNzTmFtZSA9IFwiY20tbWF0aCBcIiArIHRoaXMuY2xhc3NOYW1lO1xuXHRcdHNwYW4udGV4dENvbnRlbnQgPSB0aGlzLnN5bWJvbDtcblx0XHRyZXR1cm4gc3Bhbjtcblx0fVxuXG5cdGlnbm9yZUV2ZW50KCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5jbGFzcyBUZXh0V2lkZ2V0IGV4dGVuZHMgV2lkZ2V0VHlwZSB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgc3ltYm9sOiBzdHJpbmcpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0ZXEob3RoZXI6IFRleHRXaWRnZXQpIHtcblx0XHRyZXR1cm4gKG90aGVyLnN5bWJvbCA9PSB0aGlzLnN5bWJvbCk7XG5cdH1cblxuXHR0b0RPTSgpIHtcblx0XHRjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG5cdFx0c3Bhbi5jbGFzc05hbWUgPSBcImNtLW1hdGhcIjtcblx0XHRzcGFuLnRleHRDb250ZW50ID0gdGhpcy5zeW1ib2w7XG5cdFx0cmV0dXJuIHNwYW47XG5cdH1cblxuXHRpZ25vcmVFdmVudCgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuLyoqXG4gKiBEZXRlcm1pbmUgaWYgdGhlIHR3byBDb25jZWFsU3BlYyBpbnN0YW5jZXMgYmVmb3JlIGFuZCBhZnRlciB0aGUgdXBkYXRlIGNhbiBiZVxuICogY29uc2lkZXJlZCBpZGVudGljYWwuXG4gKi9cbmZ1bmN0aW9uIGF0U2FtZVBvc0FmdGVyKFxuXHR1cGRhdGU6IFZpZXdVcGRhdGUsXG5cdG9sZENvbmNlYWw6IENvbmNlYWxTcGVjLFxuXHRuZXdDb25jZWFsOiBDb25jZWFsU3BlYyxcbik6IGJvb2xlYW4ge1xuXHRpZiAob2xkQ29uY2VhbC5sZW5ndGggIT09IG5ld0NvbmNlYWwubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvbGRDb25jZWFsLmxlbmd0aDsgKytpKSB7XG5cdFx0Ly8gU2V0IGFzc29jaWF0aXZpdHkgdG8gZW5zdXJlIHRoYXQgaW5zZXJ0aW9ucyBvbiBlaXRoZXIgc2lkZSBvZiB0aGVcblx0XHQvLyBjb25jZWFsZWQgcmVnaW9uIGRvIG5vdCBleHBhbmQgdGhlIHJlZ2lvblxuXHRcdGNvbnN0IG9sZFN0YXJ0VXBkYXRlZCA9IHVwZGF0ZS5jaGFuZ2VzLm1hcFBvcyhvbGRDb25jZWFsW2ldLnN0YXJ0LCAxKTtcblx0XHRjb25zdCBvbGRFbmRVcGRhdGVkID0gdXBkYXRlLmNoYW5nZXMubWFwUG9zKG9sZENvbmNlYWxbaV0uZW5kLCAtMSk7XG5cdFx0Y29uc3QgYiA9IG9sZFN0YXJ0VXBkYXRlZCA9PSBuZXdDb25jZWFsW2ldLnN0YXJ0ICYmIG9sZEVuZFVwZGF0ZWQgPT0gbmV3Q29uY2VhbFtpXS5lbmQ7XG5cdFx0aWYgKCFiKSByZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZGV0ZXJtaW5lQ3Vyc29yUG9zVHlwZShcblx0c2VsOiBFZGl0b3JTZWxlY3Rpb24sXG5cdGNvbmNlYWxTcGVjOiBDb25jZWFsU3BlYyxcbik6IENvbmNlYWxtZW50W1wiY3Vyc29yUG9zVHlwZVwiXSB7XG5cdC8vIFByaW9yaXR5OiBcIndpdGhpblwiID4gXCJlZGdlXCIgPiBcImFwYXJ0XCJcblxuXHRsZXQgY3Vyc29yUG9zVHlwZTogQ29uY2VhbG1lbnRbXCJjdXJzb3JQb3NUeXBlXCJdID0gXCJhcGFydFwiO1xuXG5cdGZvciAoY29uc3QgcmFuZ2Ugb2Ygc2VsLnJhbmdlcykge1xuXHRcdGZvciAoY29uc3QgcmVwbGFjZSBvZiBjb25jZWFsU3BlYykge1xuXHRcdFx0Ly8gJ2N1cnNvclBvc1R5cGUnIGlzIGd1YXJhbnRlZWQgdG8gYmUgXCJlZGdlXCIgb3IgXCJhcGFydFwiIGF0IHRoaXMgcG9pbnRcblx0XHRcdGNvbnN0IG92ZXJsYXBSYW5nZUZyb20gPSBNYXRoLm1heChyYW5nZS5mcm9tLCByZXBsYWNlLnN0YXJ0KTtcblx0XHRcdGNvbnN0IG92ZXJsYXBSYW5nZVRvID0gTWF0aC5taW4ocmFuZ2UudG8sIHJlcGxhY2UuZW5kKTtcblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRvdmVybGFwUmFuZ2VGcm9tID09PSBvdmVybGFwUmFuZ2VUbyAmJlxuXHRcdFx0XHQob3ZlcmxhcFJhbmdlRnJvbSA9PT0gcmVwbGFjZS5zdGFydCB8fCBvdmVybGFwUmFuZ2VGcm9tID09PSByZXBsYWNlLmVuZClcblx0XHRcdCkge1xuXHRcdFx0XHRjdXJzb3JQb3NUeXBlID0gXCJlZGdlXCI7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3ZlcmxhcFJhbmdlRnJvbSA8PSBvdmVybGFwUmFuZ2VUbykgcmV0dXJuIFwid2l0aGluXCI7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGN1cnNvclBvc1R5cGU7XG59XG5cbi8qXG4qIFdlIGRldGVybWluZSBob3cgdG8gaGFuZGxlIGEgY29uY2VhbG1lbnQgYmFzZWQgb24gaXRzICdjdXJzb3JQb3NUeXBlJyBiZWZvcmVcbiogYW5kIGFmdGVyIGFuIHVwZGF0ZSBhbmQgY3VycmVudCBtb3VzZWRvd24gc3RhdGUuXG4qXG4qIFdoZW4gdGhlIG1vdXNlIGlzIGRvd24sIHdlIGVuYWJsZSBhbGwgY29uY2VhbG1lbnRzIHRvIG1ha2Ugc2VsZWN0aW5nIG1hdGhcbiogZXhwcmVzc2lvbnMgZWFzaWVyLlxuKlxuKiBXaGVuIHRoZSBtb3VzZSBpcyB1cCwgd2UgZm9sbG93IHRoZSB0YWJsZSBiZWxvdy5cbiogVGhlIHJvdyByZXByZXNlbnRzIHRoZSBwcmV2aW91cyAnY3Vyc29yUG9zVHlwZScgYW5kIHRoZSBjb2x1bW4gcmVwcmVzZW50cyB0aGVcbiogY3VycmVudCAnY3Vyc29yUG9zVHlwZScuIEVhY2ggY2VsbCBjb250YWlucyB0aGUgYWN0aW9uIHRvIGJlIHRha2VuLlxuKlxuKiAgICAgICAgfCAgYXBhcnQgIHwgIGVkZ2UgIHwgd2l0aGluXG4qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4qIGFwYXJ0ICB8IGNvbmNlYWwgfCBkZWxheSAgfCByZXZlYWxcbiogZWRnZSAgIHwgY29uY2VhbCB8IGRlbGF5ICB8IHJldmVhbFxuKiB3aXRoaW4gfCBjb25jZWFsIHwgcmV2ZWFsIHwgcmV2ZWFsXG4qIE4vQSAgICB8IGNvbmNlYWwgfCByZXZlYWwgfCByZXZlYWxcbipcbiogJ04vQScgbWVhbnMgdGhhdCB0aGUgY29uY2VhbG1lbnQgZG8gbm90IGV4aXN0IGJlZm9yZSB0aGUgdXBkYXRlLCB3aGljaCBzaG91bGRcbiogYmUganVkZ2VkIGJ5ICdhdFNhbWVQb3NBZnRlcicgZnVuY3Rpb24uXG4qL1xuZnVuY3Rpb24gZGV0ZXJtaW5lQWN0aW9uKFxuXHRvbGRDdXJzb3I6IENvbmNlYWxtZW50W1wiY3Vyc29yUG9zVHlwZVwiXSB8IHVuZGVmaW5lZCxcblx0bmV3Q3Vyc29yOiBDb25jZWFsbWVudFtcImN1cnNvclBvc1R5cGVcIl0sXG5cdG1vdXNlZG93bjogYm9vbGVhbixcblx0ZGVsYXlFbmFibGVkOiBib29sZWFuLFxuKTogQ29uY2VhbEFjdGlvbiB7XG5cdGlmIChtb3VzZWRvd24pIHJldHVybiBcImNvbmNlYWxcIjtcblxuXHRpZiAobmV3Q3Vyc29yID09PSBcImFwYXJ0XCIpIHJldHVybiBcImNvbmNlYWxcIjtcblx0aWYgKG5ld0N1cnNvciA9PT0gXCJ3aXRoaW5cIikgcmV0dXJuIFwicmV2ZWFsXCI7XG5cblx0Ly8gbmV3Q3Vyc29yID09PSBcImVkZ2VcIlxuXHRpZiAoIWRlbGF5RW5hYmxlZCkgcmV0dXJuIFwicmV2ZWFsXCI7XG5cdC8vIGRlbGF5IGlzIGVuYWJsZWRcblx0aWYgKCFvbGRDdXJzb3IgfHwgb2xkQ3Vyc29yID09PSBcIndpdGhpblwiKSByZXR1cm4gXCJyZXZlYWxcIjtcblx0ZWxzZSByZXR1cm4gXCJkZWxheVwiO1xufVxuXG4vLyBCdWlsZCBhIGRlY29yYXRpb24gc2V0IGZyb20gdGhlIGdpdmVuIGNvbmNlYWxtZW50c1xuZnVuY3Rpb24gYnVpbGREZWNvU2V0KGNvbmNlYWxtZW50czogQ29uY2VhbG1lbnRbXSkge1xuXHRjb25zdCBkZWNvczogUmFuZ2U8RGVjb3JhdGlvbj5bXSA9IFtdXG5cblx0Zm9yIChjb25zdCBjb25jIG9mIGNvbmNlYWxtZW50cykge1xuXHRcdGlmICghY29uYy5lbmFibGUpIGNvbnRpbnVlO1xuXG5cdFx0Zm9yIChjb25zdCByZXBsYWNlIG9mIGNvbmMuc3BlYykge1xuXHRcdFx0aWYgKHJlcGxhY2Uuc3RhcnQgPT09IHJlcGxhY2UuZW5kKSB7XG5cdFx0XHRcdC8vIEFkZCBhbiBhZGRpdGlvbmFsIFwiL1wiIHN5bWJvbCwgYXMgcGFydCBvZiBjb25jZWFsaW5nIFxcXFxmcmFje317fSAtPiAoKS8oKVxuXHRcdFx0XHRkZWNvcy5wdXNoKFxuXHRcdFx0XHRcdERlY29yYXRpb24ud2lkZ2V0KHtcblx0XHRcdFx0XHRcdHdpZGdldDogbmV3IFRleHRXaWRnZXQocmVwbGFjZS50ZXh0KSxcblx0XHRcdFx0XHRcdGJsb2NrOiBmYWxzZSxcblx0XHRcdFx0XHR9KS5yYW5nZShyZXBsYWNlLnN0YXJ0LCByZXBsYWNlLmVuZClcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvLyBJbXByb3ZlIHNlbGVjdGluZyBlbXB0eSByZXBsYWNlbWVudHMgc3VjaCBhcyBcIlxcZnJhY1wiIC0+IFwiXCJcblx0XHRcdFx0Ly8gTk9URTogVGhpcyBtaWdodCBub3QgYmUgbmVjZXNzYXJ5XG5cdFx0XHRcdGNvbnN0IGluY2x1c2l2ZVN0YXJ0ID0gcmVwbGFjZS50ZXh0ID09PSBcIlwiO1xuXHRcdFx0XHRjb25zdCBpbmNsdXNpdmVFbmQgPSBmYWxzZTtcblxuXHRcdFx0XHRkZWNvcy5wdXNoKFxuXHRcdFx0XHRcdERlY29yYXRpb24ucmVwbGFjZSh7XG5cdFx0XHRcdFx0XHR3aWRnZXQ6IG5ldyBDb25jZWFsV2lkZ2V0KFxuXHRcdFx0XHRcdFx0XHRyZXBsYWNlLnRleHQsXG5cdFx0XHRcdFx0XHRcdHJlcGxhY2UuY2xhc3MsXG5cdFx0XHRcdFx0XHRcdHJlcGxhY2UuZWxlbWVudFR5cGVcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRpbmNsdXNpdmVTdGFydCxcblx0XHRcdFx0XHRcdGluY2x1c2l2ZUVuZCxcblx0XHRcdFx0XHRcdGJsb2NrOiBmYWxzZSxcblx0XHRcdFx0XHR9KS5yYW5nZShyZXBsYWNlLnN0YXJ0LCByZXBsYWNlLmVuZClcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gRGVjb3JhdGlvbi5zZXQoZGVjb3MsIHRydWUpO1xufVxuXG4vLyBCdWlsZCBhdG9taWMgcmFuZ2VzIGZyb20gdGhlIGdpdmVuIGNvbmNlYWxtZW50cy5cbi8vIFRoZSByZXN1bHRpbmcgcmFuZ2VzIGFyZSBiYXNpY2FsbHkgdGhlIHNhbWUgYXMgdGhlIG9yaWdpbmFsIHJlcGxhY2VtZW50cywgYnV0IGVtcHR5IHJlcGxhY2VtZW50c1xuLy8gYXJlIG1lcmdlZCB3aXRoIHRoZSBcIm5leHQgY2hhcmFjdGVyLFwiIHdoaWNoIGNhbiBiZSBlaXRoZXIgcGxhaW4gdGV4dCBvciBhbm90aGVyIHJlcGxhY2VtZW50LlxuLy8gVGhpcyBhZGp1c3RtZW50IG1ha2VzIGN1cnNvciBtb3ZlbWVudCBhcm91bmQgZW1wdHkgcmVwbGFjZW1lbnRzIG1vcmUgaW50dWl0aXZlLlxuZnVuY3Rpb24gYnVpbGRBdG9taWNSYW5nZXMoY29uY2VhbG1lbnRzOiBDb25jZWFsbWVudFtdKSB7XG5cdGNvbnN0IHJlcGxzOiBSZXBsYWNlbWVudFtdID0gY29uY2VhbG1lbnRzXG5cdFx0LmZpbHRlcihjID0+IGMuZW5hYmxlKVxuXHRcdC5mbGF0TWFwKGMgPT4gYy5zcGVjKVxuXHRcdC5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0IC0gYi5zdGFydCk7XG5cblx0Ly8gUmFuZ2VTZXQgcmVxdWlyZXMgUmFuZ2VWYWx1ZSBidXQgd2UgZG8gbm90IG5lZWQgb25lXG5cdGNvbnN0IGZha2V2YWwgPSBuZXcgKGNsYXNzIGV4dGVuZHMgUmFuZ2VWYWx1ZSB7fSk7XG5cdGNvbnN0IGJ1aWxkZXIgPSBuZXcgUmFuZ2VTZXRCdWlsZGVyKCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgcmVwbHMubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAocmVwbHNbaV0udGV4dCA9PT0gXCJcIikge1xuXHRcdFx0aWYgKGkrMSAhPSByZXBscy5sZW5ndGggJiYgcmVwbHNbaV0uZW5kID09IHJlcGxzW2krMV0uc3RhcnQpIHtcblx0XHRcdFx0YnVpbGRlci5hZGQocmVwbHNbaV0uc3RhcnQsIHJlcGxzW2krMV0uZW5kLCBmYWtldmFsKTtcblx0XHRcdFx0aSsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnVpbGRlci5hZGQocmVwbHNbaV0uc3RhcnQsIHJlcGxzW2ldLmVuZCArIDEsIGZha2V2YWwpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRidWlsZGVyLmFkZChyZXBsc1tpXS5zdGFydCwgcmVwbHNbaV0uZW5kLCBmYWtldmFsKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGJ1aWxkZXIuZmluaXNoKCk7XG59XG5cbmV4cG9ydCBjb25zdCBta0NvbmNlYWxQbHVnaW4gPSAocmV2ZWFsVGltZW91dDogbnVtYmVyKSA9PiBWaWV3UGx1Z2luLmZyb21DbGFzcyhjbGFzcyB7XG5cdC8vIFN0YXRlZnVsIFZpZXdQbHVnaW46IHlvdSBzaG91bGQgYXZvaWQgb25lIGluIGdlbmVyYWwsIGJ1dCBoZXJlXG5cdC8vIHRoZSBhcHByb2FjaCBiYXNlZCBvbiBTdGF0ZUZpZWxkIGFuZCB1cGRhdGVMaXN0ZW5lciBjb25mbGljdHMgd2l0aFxuXHQvLyBvYnNpZGlhbidzIGludGVybmFsIGxvZ2ljIGFuZCBjYXVzZXMgd2VpcmQgcmVuZGVyaW5nLlxuXHRjb25jZWFsbWVudHM6IENvbmNlYWxtZW50W107XG5cdGRlY29yYXRpb25zOiBEZWNvcmF0aW9uU2V0O1xuXHRhdG9taWNSYW5nZXM6IFJhbmdlU2V0PFJhbmdlVmFsdWU+O1xuXHRkZWxheUVuYWJsZWQ6IGJvb2xlYW47XG5cblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLmNvbmNlYWxtZW50cyA9IFtdO1xuXHRcdHRoaXMuZGVjb3JhdGlvbnMgPSBEZWNvcmF0aW9uLm5vbmU7XG5cdFx0dGhpcy5hdG9taWNSYW5nZXMgPSBSYW5nZVNldC5lbXB0eTtcblx0XHR0aGlzLmRlbGF5RW5hYmxlZCA9IHJldmVhbFRpbWVvdXQgPiAwO1xuXHR9XG5cblx0ZGVsYXllZFJldmVhbCA9IGRlYm91bmNlKChkZWxheWVkQ29uY2VhbG1lbnRzOiBDb25jZWFsbWVudFtdLCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XG5cdFx0Ly8gSW1wbGljaXRseSBjaGFuZ2UgdGhlIHN0YXRlXG5cdFx0Zm9yIChjb25zdCBjb25jZWFsbWVudCBvZiBkZWxheWVkQ29uY2VhbG1lbnRzKSB7XG5cdFx0XHRjb25jZWFsbWVudC5lbmFibGUgPSBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IGJ1aWxkRGVjb1NldCh0aGlzLmNvbmNlYWxtZW50cyk7XG5cdFx0dGhpcy5hdG9taWNSYW5nZXMgPSBidWlsZEF0b21pY1Jhbmdlcyh0aGlzLmNvbmNlYWxtZW50cyk7XG5cblx0XHQvLyBJbnZva2UgdGhlIHVwZGF0ZSBtZXRob2QgdG8gcmVmbGVjdCB0aGUgY2hhbmdlcyBvZiB0aGlzLmRlY29yYXRpb25cblx0XHR2aWV3LmRpc3BhdGNoKCk7XG5cdH0sIHJldmVhbFRpbWVvdXQsIHRydWUpO1xuXG5cdHVwZGF0ZSh1cGRhdGU6IFZpZXdVcGRhdGUpIHtcblx0XHRpZiAoISh1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUudmlld3BvcnRDaGFuZ2VkIHx8IHVwZGF0ZS5zZWxlY3Rpb25TZXQpKVxuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Ly8gQ2FuY2VsIHRoZSBkZWxheWVkIHJldmVhbG1lbnQgd2hlbmV2ZXIgd2UgdXBkYXRlIHRoZSBjb25jZWFsbWVudHNcblx0XHR0aGlzLmRlbGF5ZWRSZXZlYWwuY2FuY2VsKCk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB1cGRhdGUuc3RhdGUuc2VsZWN0aW9uO1xuXHRcdGNvbnN0IG1vdXNlZG93biA9IHVwZGF0ZS52aWV3LnBsdWdpbihsaXZlUHJldmlld1N0YXRlKT8ubW91c2Vkb3dufHxmYWxzZTtcblxuXHRcdGNvbnN0IGNvbmNlYWxTcGVjcyA9IGNvbmNlYWwodXBkYXRlLnZpZXcpO1xuXG5cdFx0Ly8gQ29sbGVjdCBjb25jZWFsbWVudHMgZnJvbSB0aGUgbmV3IGNvbmNlYWwgc3BlY3Ncblx0XHRjb25zdCBjb25jZWFsbWVudHM6IENvbmNlYWxtZW50W10gPSBbXTtcblx0XHQvLyBjb25jZWFsbWVudHMgdGhhdCBzaG91bGQgYmUgcmV2ZWFsZWQgYWZ0ZXIgYSBkZWxheSAoaS5lLiAnZGVsYXknIGFjdGlvbilcblx0XHRjb25zdCBkZWxheWVkQ29uY2VhbG1lbnRzOiBDb25jZWFsbWVudFtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHNwZWMgb2YgY29uY2VhbFNwZWNzKSB7XG5cdFx0XHRjb25zdCBjdXJzb3JQb3NUeXBlID0gZGV0ZXJtaW5lQ3Vyc29yUG9zVHlwZShzZWxlY3Rpb24sIHNwZWMpO1xuXHRcdFx0Y29uc3Qgb2xkQ29uY2VhbG1lbnQgPSB0aGlzLmNvbmNlYWxtZW50cy5maW5kKFxuXHRcdFx0XHQob2xkKSA9PiBhdFNhbWVQb3NBZnRlcih1cGRhdGUsIG9sZC5zcGVjLCBzcGVjKVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgY29uY2VhbEFjdGlvbiA9IGRldGVybWluZUFjdGlvbihcblx0XHRcdFx0b2xkQ29uY2VhbG1lbnQ/LmN1cnNvclBvc1R5cGUsIGN1cnNvclBvc1R5cGUsIG1vdXNlZG93biwgdGhpcy5kZWxheUVuYWJsZWRcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGNvbmNlYWxtZW50OiBDb25jZWFsbWVudCA9IHtcblx0XHRcdFx0c3BlYyxcblx0XHRcdFx0Y3Vyc29yUG9zVHlwZSxcblx0XHRcdFx0ZW5hYmxlOiBjb25jZWFsQWN0aW9uICE9PSBcInJldmVhbFwiLFxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGNvbmNlYWxBY3Rpb24gPT09IFwiZGVsYXlcIikge1xuXHRcdFx0XHRkZWxheWVkQ29uY2VhbG1lbnRzLnB1c2goY29uY2VhbG1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25jZWFsbWVudHMucHVzaChjb25jZWFsbWVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRlbGF5ZWRDb25jZWFsbWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5kZWxheWVkUmV2ZWFsKGRlbGF5ZWRDb25jZWFsbWVudHMsIHVwZGF0ZS52aWV3KTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbmNlYWxtZW50cyA9IGNvbmNlYWxtZW50cztcblx0XHR0aGlzLmRlY29yYXRpb25zID0gYnVpbGREZWNvU2V0KHRoaXMuY29uY2VhbG1lbnRzKTtcblx0XHR0aGlzLmF0b21pY1JhbmdlcyA9IGJ1aWxkQXRvbWljUmFuZ2VzKHRoaXMuY29uY2VhbG1lbnRzKTtcblx0fVxufSwge1xuXHRkZWNvcmF0aW9uczogdiA9PiB2LmRlY29yYXRpb25zLFxuXHRwcm92aWRlOiBwbHVnaW4gPT4gRWRpdG9yVmlldy5hdG9taWNSYW5nZXMub2YodmlldyA9PiB7XG5cdFx0Y29uc3QgcGx1Z2luSW5zdGFuY2UgPSB2aWV3LnBsdWdpbj8uKHBsdWdpbik7XG5cdFx0cmV0dXJuIChwbHVnaW5JbnN0YW5jZT8uYXRvbWljUmFuZ2VzIGFzIFJhbmdlU2V0PGFueT4pID8/IFJhbmdlU2V0LmVtcHR5O1xuXHR9KSxcdFxufSk7XG4iXX0=