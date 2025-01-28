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
    constructor() {
        this.delayedReveal = debounce((delayedConcealments, view) => {
            // Implicitly change the state
            for (const concealment of delayedConcealments) {
                concealment.enable = false;
            }
            this.decorations = buildDecoSet(this.concealments);
            this.atomicRanges = buildAtomicRanges(this.concealments);
            // Invoke the update method to reflect the changes of this.decoration
            view.dispatch();
        }, revealTimeout, true);
        this.concealments = [];
        this.decorations = Decoration.none;
        this.atomicRanges = RangeSet.empty;
        this.delayEnabled = revealTimeout > 0;
    }
    update(update) {
        var _a;
        if (!(update.docChanged || update.viewportChanged || update.selectionSet))
            return;
        // Cancel the delayed revealment whenever we update the concealments
        this.delayedReveal.cancel();
        const selection = update.state.selection;
        const mousedown = ((_a = update.view.plugin(livePreviewState)) === null || _a === void 0 ? void 0 : _a.mousedown) || false;
        const concealSpecs = conceal(update.view);
        // Collect concealments from the new conceal specs
        const concealments = [];
        // concealments that should be revealed after a delay (i.e. 'delay' action)
        const delayedConcealments = [];
        for (const spec of concealSpecs) {
            const cursorPosType = determineCursorPosType(selection, spec);
            const oldConcealment = this.concealments.find((old) => atSamePosAfter(update, old.spec, spec));
            const concealAction = determineAction(oldConcealment === null || oldConcealment === void 0 ? void 0 : oldConcealment.cursorPosType, cursorPosType, mousedown, this.delayEnabled);
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
        var _a, _b;
        const pluginInstance = (_a = view.plugin) === null || _a === void 0 ? void 0 : _a.call(view, plugin);
        return (_b = pluginInstance === null || pluginInstance === void 0 ? void 0 : pluginInstance.atomicRanges) !== null && _b !== void 0 ? _b : RangeSet.empty;
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uY2VhbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9lZGl0b3JfZXh0ZW5zaW9ucy9jb25jZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBEQUEwRDtBQUUxRCxPQUFPLEVBQWMsVUFBVSxFQUFpQixVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzdHLE9BQU8sRUFBMEIsUUFBUSxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3hDLE9BQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFZdEQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGFBQWEsQ0FBQyxHQUFHLFlBQTJCO0lBQzNELE9BQU8sWUFBWSxDQUFDO0FBQ3JCLENBQUM7QUFhRCxNQUFNLGFBQWMsU0FBUSxVQUFVO0lBSXJDLFlBQXFCLE1BQWMsRUFBRSxTQUFrQixFQUFFLFdBQW9CO1FBQzVFLEtBQUssRUFBRSxDQUFDO1FBRFksV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUdsQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDNUMsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3ZELENBQUM7SUFFRCxFQUFFLENBQUMsS0FBb0I7UUFDdEIsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxLQUFLLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDNUgsQ0FBQztJQUVELEtBQUs7UUFDSixNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsU0FBUyxHQUFHLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO1FBQzdDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUMvQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxXQUFXO1FBQ1YsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLFVBQVcsU0FBUSxVQUFVO0lBRWxDLFlBQXFCLE1BQWM7UUFDbEMsS0FBSyxFQUFFLENBQUM7UUFEWSxXQUFNLEdBQU4sTUFBTSxDQUFRO0lBRW5DLENBQUM7SUFFRCxFQUFFLENBQUMsS0FBaUI7UUFDbkIsT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxLQUFLO1FBQ0osTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDL0IsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsV0FBVztRQUNWLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztDQUNEO0FBRUQ7OztHQUdHO0FBQ0gsU0FBUyxjQUFjLENBQ3RCLE1BQWtCLEVBQ2xCLFVBQXVCLEVBQ3ZCLFVBQXVCO0lBRXZCLElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxVQUFVLENBQUMsTUFBTTtRQUFFLE9BQU8sS0FBSyxDQUFDO0lBRTFELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDNUMsb0VBQW9FO1FBQ3BFLDRDQUE0QztRQUM1QyxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuRSxNQUFNLENBQUMsR0FBRyxlQUFlLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxhQUFhLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztRQUN2RixJQUFJLENBQUMsQ0FBQztZQUFFLE9BQU8sS0FBSyxDQUFDO0lBQ3RCLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFFRCxTQUFTLHNCQUFzQixDQUM5QixHQUFvQixFQUNwQixXQUF3QjtJQUV4Qix3Q0FBd0M7SUFFeEMsSUFBSSxhQUFhLEdBQWlDLE9BQU8sQ0FBQztJQUUxRCxLQUFLLE1BQU0sS0FBSyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNoQyxLQUFLLE1BQU0sT0FBTyxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ25DLHNFQUFzRTtZQUN0RSxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDN0QsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUV2RCxJQUNDLGdCQUFnQixLQUFLLGNBQWM7Z0JBQ25DLENBQUMsZ0JBQWdCLEtBQUssT0FBTyxDQUFDLEtBQUssSUFBSSxnQkFBZ0IsS0FBSyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQ3ZFLENBQUM7Z0JBQ0YsYUFBYSxHQUFHLE1BQU0sQ0FBQztnQkFDdkIsU0FBUztZQUNWLENBQUM7WUFFRCxJQUFJLGdCQUFnQixJQUFJLGNBQWM7Z0JBQUUsT0FBTyxRQUFRLENBQUM7UUFDekQsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLGFBQWEsQ0FBQztBQUN0QixDQUFDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBb0JFO0FBQ0YsU0FBUyxlQUFlLENBQ3ZCLFNBQW1ELEVBQ25ELFNBQXVDLEVBQ3ZDLFNBQWtCLEVBQ2xCLFlBQXFCO0lBRXJCLElBQUksU0FBUztRQUFFLE9BQU8sU0FBUyxDQUFDO0lBRWhDLElBQUksU0FBUyxLQUFLLE9BQU87UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUM1QyxJQUFJLFNBQVMsS0FBSyxRQUFRO1FBQUUsT0FBTyxRQUFRLENBQUM7SUFFNUMsdUJBQXVCO0lBQ3ZCLElBQUksQ0FBQyxZQUFZO1FBQUUsT0FBTyxRQUFRLENBQUM7SUFDbkMsbUJBQW1CO0lBQ25CLElBQUksQ0FBQyxTQUFTLElBQUksU0FBUyxLQUFLLFFBQVE7UUFBRSxPQUFPLFFBQVEsQ0FBQzs7UUFDckQsT0FBTyxPQUFPLENBQUM7QUFDckIsQ0FBQztBQUVELHFEQUFxRDtBQUNyRCxTQUFTLFlBQVksQ0FBQyxZQUEyQjtJQUNoRCxNQUFNLEtBQUssR0FBd0IsRUFBRSxDQUFBO0lBRXJDLEtBQUssTUFBTSxJQUFJLElBQUksWUFBWSxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNO1lBQUUsU0FBUztRQUUzQixLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLEtBQUssT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNuQywwRUFBMEU7Z0JBQzFFLEtBQUssQ0FBQyxJQUFJLENBQ1QsVUFBVSxDQUFDLE1BQU0sQ0FBQztvQkFDakIsTUFBTSxFQUFFLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7b0JBQ3BDLEtBQUssRUFBRSxLQUFLO2lCQUNaLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQ3BDLENBQUM7WUFDSCxDQUFDO2lCQUNJLENBQUM7Z0JBQ0wsNkRBQTZEO2dCQUM3RCxvQ0FBb0M7Z0JBQ3BDLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUMzQyxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUM7Z0JBRTNCLEtBQUssQ0FBQyxJQUFJLENBQ1QsVUFBVSxDQUFDLE9BQU8sQ0FBQztvQkFDbEIsTUFBTSxFQUFFLElBQUksYUFBYSxDQUN4QixPQUFPLENBQUMsSUFBSSxFQUNaLE9BQU8sQ0FBQyxLQUFLLEVBQ2IsT0FBTyxDQUFDLFdBQVcsQ0FDbkI7b0JBQ0QsY0FBYztvQkFDZCxZQUFZO29CQUNaLEtBQUssRUFBRSxLQUFLO2lCQUNaLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQ3BDLENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLFVBQVUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3BDLENBQUM7QUFFRCxtREFBbUQ7QUFDbkQsbUdBQW1HO0FBQ25HLCtGQUErRjtBQUMvRixrRkFBa0Y7QUFDbEYsU0FBUyxpQkFBaUIsQ0FBQyxZQUEyQjtJQUNyRCxNQUFNLEtBQUssR0FBa0IsWUFBWTtTQUN2QyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1NBQ3JCLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7U0FDcEIsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFcEMsc0RBQXNEO0lBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFNLFNBQVEsVUFBVTtLQUFHLENBQUMsQ0FBQztJQUNsRCxNQUFNLE9BQU8sR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQ3RDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDdkMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxHQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDN0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNyRCxDQUFDLEVBQUUsQ0FBQztZQUNMLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDeEQsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUN6QixDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLENBQUMsYUFBcUIsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQztJQVU5RTtRQU9BLGtCQUFhLEdBQUcsUUFBUSxDQUFDLENBQUMsbUJBQWtDLEVBQUUsSUFBZ0IsRUFBRSxFQUFFO1lBQ2pGLDhCQUE4QjtZQUM5QixLQUFLLE1BQU0sV0FBVyxJQUFJLG1CQUFtQixFQUFFLENBQUM7Z0JBQy9DLFdBQVcsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1lBQzVCLENBQUM7WUFDRCxJQUFJLENBQUMsV0FBVyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7WUFFekQscUVBQXFFO1lBQ3JFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNqQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBaEJ2QixJQUFJLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFDbkMsSUFBSSxDQUFDLFlBQVksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBQ25DLElBQUksQ0FBQyxZQUFZLEdBQUcsYUFBYSxHQUFHLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBY0QsTUFBTSxDQUFDLE1BQWtCOztRQUN4QixJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxlQUFlLElBQUksTUFBTSxDQUFDLFlBQVksQ0FBQztZQUN4RSxPQUFPO1FBRVIsb0VBQW9FO1FBQ3BFLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7UUFFNUIsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7UUFDekMsTUFBTSxTQUFTLEdBQUcsQ0FBQSxNQUFBLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLDBDQUFFLFNBQVMsS0FBRSxLQUFLLENBQUM7UUFFekUsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUxQyxrREFBa0Q7UUFDbEQsTUFBTSxZQUFZLEdBQWtCLEVBQUUsQ0FBQztRQUN2QywyRUFBMkU7UUFDM0UsTUFBTSxtQkFBbUIsR0FBa0IsRUFBRSxDQUFDO1FBRTlDLEtBQUssTUFBTSxJQUFJLElBQUksWUFBWSxFQUFFLENBQUM7WUFDakMsTUFBTSxhQUFhLEdBQUcsc0JBQXNCLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzlELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUM1QyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUMvQyxDQUFDO1lBRUYsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUNwQyxjQUFjLGFBQWQsY0FBYyx1QkFBZCxjQUFjLENBQUUsYUFBYSxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FDMUUsQ0FBQztZQUVGLE1BQU0sV0FBVyxHQUFnQjtnQkFDaEMsSUFBSTtnQkFDSixhQUFhO2dCQUNiLE1BQU0sRUFBRSxhQUFhLEtBQUssUUFBUTthQUNsQyxDQUFDO1lBRUYsSUFBSSxhQUFhLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQy9CLG1CQUFtQixDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN2QyxDQUFDO1lBRUQsWUFBWSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDcEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEQsQ0FBQztRQUVELElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxXQUFXLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsWUFBWSxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUMxRCxDQUFDO0NBQ0QsRUFBRTtJQUNGLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXO0lBQy9CLE9BQU8sRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFOztRQUNwRCxNQUFNLGNBQWMsR0FBRyxNQUFBLElBQUksQ0FBQyxNQUFNLHFEQUFHLE1BQU0sQ0FBQyxDQUFDO1FBQzdDLE9BQU8sTUFBQyxjQUFjLGFBQWQsY0FBYyx1QkFBZCxjQUFjLENBQUUsWUFBOEIsbUNBQUksUUFBUSxDQUFDLEtBQUssQ0FBQztJQUMxRSxDQUFDLENBQUM7Q0FDRixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBodHRwczovL2Rpc2N1c3MuY29kZW1pcnJvci5uZXQvdC9jb25jZWFsaW5nLXN5bnRheC8zMTM1XHJcblxyXG5pbXBvcnQgeyBWaWV3VXBkYXRlLCBEZWNvcmF0aW9uLCBEZWNvcmF0aW9uU2V0LCBXaWRnZXRUeXBlLCBWaWV3UGx1Z2luLCBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgRWRpdG9yU2VsZWN0aW9uLCBSYW5nZSwgUmFuZ2VTZXQsIFJhbmdlU2V0QnVpbGRlciwgUmFuZ2VWYWx1ZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBjb25jZWFsIH0gZnJvbSBcIi4vY29uY2VhbF9mbnNcIjtcclxuaW1wb3J0IHsgZGVib3VuY2UsIGxpdmVQcmV2aWV3U3RhdGUgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmV4cG9ydCB0eXBlIFJlcGxhY2VtZW50ID0ge1xyXG5cdHN0YXJ0OiBudW1iZXIsXHJcblx0ZW5kOiBudW1iZXIsXHJcblx0dGV4dDogc3RyaW5nLFxyXG5cdGNsYXNzPzogc3RyaW5nLFxyXG5cdGVsZW1lbnRUeXBlPzogc3RyaW5nLFxyXG59O1xyXG5cclxuZXhwb3J0IHR5cGUgQ29uY2VhbFNwZWMgPSBSZXBsYWNlbWVudFtdO1xyXG5cclxuLyoqXHJcbiAqIE1ha2UgYSBDb25jZWFsU3BlYyBmcm9tIHRoZSBnaXZlbiBsaXN0IG9mIFJlcGxhY2VtZW50cy5cclxuICogVGhpcyBmdW5jdGlvbiBlc3NlbnRpYWxseSBkb2VzIG5vdGhpbmcgYnV0IGltcHJvdmVzIHJlYWRhYmlsaXR5LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG1rQ29uY2VhbFNwZWMoLi4ucmVwbGFjZW1lbnRzOiBSZXBsYWNlbWVudFtdKSB7XHJcblx0cmV0dXJuIHJlcGxhY2VtZW50cztcclxufVxyXG5cclxuZXhwb3J0IHR5cGUgQ29uY2VhbG1lbnQgPSB7XHJcblx0c3BlYzogQ29uY2VhbFNwZWMsXHJcblx0Y3Vyc29yUG9zVHlwZTogXCJ3aXRoaW5cIiB8IFwiYXBhcnRcIiB8IFwiZWRnZVwiLFxyXG5cdGVuYWJsZTogYm9vbGVhbixcclxufTtcclxuXHJcbi8vIFJlcHJlc2VudHMgaG93IGEgY29uY2VhbG1lbnQgc2hvdWxkIGJlIGhhbmRsZWRcclxuLy8gJ2RlbGF5JyBtZWFucyByZXZlYWwgYWZ0ZXIgYSB0aW1lIGRlbGF5LlxyXG50eXBlIENvbmNlYWxBY3Rpb24gPSBcImNvbmNlYWxcIiB8IFwicmV2ZWFsXCIgfCBcImRlbGF5XCI7XHJcblxyXG5cclxuY2xhc3MgQ29uY2VhbFdpZGdldCBleHRlbmRzIFdpZGdldFR5cGUge1xyXG5cdHByaXZhdGUgcmVhZG9ubHkgY2xhc3NOYW1lOiBzdHJpbmc7XHJcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50VHlwZTogc3RyaW5nO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBzeW1ib2w6IHN0cmluZywgY2xhc3NOYW1lPzogc3RyaW5nLCBlbGVtZW50VHlwZT86IHN0cmluZykge1xyXG5cdFx0c3VwZXIoKTtcclxuXHJcblx0XHR0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZSA/IGNsYXNzTmFtZSA6IFwiXCI7XHJcblx0XHR0aGlzLmVsZW1lbnRUeXBlID0gZWxlbWVudFR5cGUgPyBlbGVtZW50VHlwZSA6IFwic3BhblwiO1xyXG5cdH1cclxuXHJcblx0ZXEob3RoZXI6IENvbmNlYWxXaWRnZXQpIHtcclxuXHRcdHJldHVybiAoKG90aGVyLnN5bWJvbCA9PSB0aGlzLnN5bWJvbCkgJiYgKG90aGVyLmNsYXNzTmFtZSA9PT0gdGhpcy5jbGFzc05hbWUpICYmIChvdGhlci5lbGVtZW50VHlwZSA9PT0gdGhpcy5lbGVtZW50VHlwZSkpO1xyXG5cdH1cclxuXHJcblx0dG9ET00oKSB7XHJcblx0XHRjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0aGlzLmVsZW1lbnRUeXBlKTtcclxuXHRcdHNwYW4uY2xhc3NOYW1lID0gXCJjbS1tYXRoIFwiICsgdGhpcy5jbGFzc05hbWU7XHJcblx0XHRzcGFuLnRleHRDb250ZW50ID0gdGhpcy5zeW1ib2w7XHJcblx0XHRyZXR1cm4gc3BhbjtcclxuXHR9XHJcblxyXG5cdGlnbm9yZUV2ZW50KCkge1xyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH1cclxufVxyXG5cclxuY2xhc3MgVGV4dFdpZGdldCBleHRlbmRzIFdpZGdldFR5cGUge1xyXG5cclxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBzeW1ib2w6IHN0cmluZykge1xyXG5cdFx0c3VwZXIoKTtcclxuXHR9XHJcblxyXG5cdGVxKG90aGVyOiBUZXh0V2lkZ2V0KSB7XHJcblx0XHRyZXR1cm4gKG90aGVyLnN5bWJvbCA9PSB0aGlzLnN5bWJvbCk7XHJcblx0fVxyXG5cclxuXHR0b0RPTSgpIHtcclxuXHRcdGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuXHRcdHNwYW4uY2xhc3NOYW1lID0gXCJjbS1tYXRoXCI7XHJcblx0XHRzcGFuLnRleHRDb250ZW50ID0gdGhpcy5zeW1ib2w7XHJcblx0XHRyZXR1cm4gc3BhbjtcclxuXHR9XHJcblxyXG5cdGlnbm9yZUV2ZW50KCkge1xyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH1cclxufVxyXG5cclxuLyoqXHJcbiAqIERldGVybWluZSBpZiB0aGUgdHdvIENvbmNlYWxTcGVjIGluc3RhbmNlcyBiZWZvcmUgYW5kIGFmdGVyIHRoZSB1cGRhdGUgY2FuIGJlXHJcbiAqIGNvbnNpZGVyZWQgaWRlbnRpY2FsLlxyXG4gKi9cclxuZnVuY3Rpb24gYXRTYW1lUG9zQWZ0ZXIoXHJcblx0dXBkYXRlOiBWaWV3VXBkYXRlLFxyXG5cdG9sZENvbmNlYWw6IENvbmNlYWxTcGVjLFxyXG5cdG5ld0NvbmNlYWw6IENvbmNlYWxTcGVjLFxyXG4pOiBib29sZWFuIHtcclxuXHRpZiAob2xkQ29uY2VhbC5sZW5ndGggIT09IG5ld0NvbmNlYWwubGVuZ3RoKSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgb2xkQ29uY2VhbC5sZW5ndGg7ICsraSkge1xyXG5cdFx0Ly8gU2V0IGFzc29jaWF0aXZpdHkgdG8gZW5zdXJlIHRoYXQgaW5zZXJ0aW9ucyBvbiBlaXRoZXIgc2lkZSBvZiB0aGVcclxuXHRcdC8vIGNvbmNlYWxlZCByZWdpb24gZG8gbm90IGV4cGFuZCB0aGUgcmVnaW9uXHJcblx0XHRjb25zdCBvbGRTdGFydFVwZGF0ZWQgPSB1cGRhdGUuY2hhbmdlcy5tYXBQb3Mob2xkQ29uY2VhbFtpXS5zdGFydCwgMSk7XHJcblx0XHRjb25zdCBvbGRFbmRVcGRhdGVkID0gdXBkYXRlLmNoYW5nZXMubWFwUG9zKG9sZENvbmNlYWxbaV0uZW5kLCAtMSk7XHJcblx0XHRjb25zdCBiID0gb2xkU3RhcnRVcGRhdGVkID09IG5ld0NvbmNlYWxbaV0uc3RhcnQgJiYgb2xkRW5kVXBkYXRlZCA9PSBuZXdDb25jZWFsW2ldLmVuZDtcclxuXHRcdGlmICghYikgcmV0dXJuIGZhbHNlO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHRydWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRldGVybWluZUN1cnNvclBvc1R5cGUoXHJcblx0c2VsOiBFZGl0b3JTZWxlY3Rpb24sXHJcblx0Y29uY2VhbFNwZWM6IENvbmNlYWxTcGVjLFxyXG4pOiBDb25jZWFsbWVudFtcImN1cnNvclBvc1R5cGVcIl0ge1xyXG5cdC8vIFByaW9yaXR5OiBcIndpdGhpblwiID4gXCJlZGdlXCIgPiBcImFwYXJ0XCJcclxuXHJcblx0bGV0IGN1cnNvclBvc1R5cGU6IENvbmNlYWxtZW50W1wiY3Vyc29yUG9zVHlwZVwiXSA9IFwiYXBhcnRcIjtcclxuXHJcblx0Zm9yIChjb25zdCByYW5nZSBvZiBzZWwucmFuZ2VzKSB7XHJcblx0XHRmb3IgKGNvbnN0IHJlcGxhY2Ugb2YgY29uY2VhbFNwZWMpIHtcclxuXHRcdFx0Ly8gJ2N1cnNvclBvc1R5cGUnIGlzIGd1YXJhbnRlZWQgdG8gYmUgXCJlZGdlXCIgb3IgXCJhcGFydFwiIGF0IHRoaXMgcG9pbnRcclxuXHRcdFx0Y29uc3Qgb3ZlcmxhcFJhbmdlRnJvbSA9IE1hdGgubWF4KHJhbmdlLmZyb20sIHJlcGxhY2Uuc3RhcnQpO1xyXG5cdFx0XHRjb25zdCBvdmVybGFwUmFuZ2VUbyA9IE1hdGgubWluKHJhbmdlLnRvLCByZXBsYWNlLmVuZCk7XHJcblxyXG5cdFx0XHRpZiAoXHJcblx0XHRcdFx0b3ZlcmxhcFJhbmdlRnJvbSA9PT0gb3ZlcmxhcFJhbmdlVG8gJiZcclxuXHRcdFx0XHQob3ZlcmxhcFJhbmdlRnJvbSA9PT0gcmVwbGFjZS5zdGFydCB8fCBvdmVybGFwUmFuZ2VGcm9tID09PSByZXBsYWNlLmVuZClcclxuXHRcdFx0KSB7XHJcblx0XHRcdFx0Y3Vyc29yUG9zVHlwZSA9IFwiZWRnZVwiO1xyXG5cdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiAob3ZlcmxhcFJhbmdlRnJvbSA8PSBvdmVybGFwUmFuZ2VUbykgcmV0dXJuIFwid2l0aGluXCI7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gY3Vyc29yUG9zVHlwZTtcclxufVxyXG5cclxuLypcclxuKiBXZSBkZXRlcm1pbmUgaG93IHRvIGhhbmRsZSBhIGNvbmNlYWxtZW50IGJhc2VkIG9uIGl0cyAnY3Vyc29yUG9zVHlwZScgYmVmb3JlXHJcbiogYW5kIGFmdGVyIGFuIHVwZGF0ZSBhbmQgY3VycmVudCBtb3VzZWRvd24gc3RhdGUuXHJcbipcclxuKiBXaGVuIHRoZSBtb3VzZSBpcyBkb3duLCB3ZSBlbmFibGUgYWxsIGNvbmNlYWxtZW50cyB0byBtYWtlIHNlbGVjdGluZyBtYXRoXHJcbiogZXhwcmVzc2lvbnMgZWFzaWVyLlxyXG4qXHJcbiogV2hlbiB0aGUgbW91c2UgaXMgdXAsIHdlIGZvbGxvdyB0aGUgdGFibGUgYmVsb3cuXHJcbiogVGhlIHJvdyByZXByZXNlbnRzIHRoZSBwcmV2aW91cyAnY3Vyc29yUG9zVHlwZScgYW5kIHRoZSBjb2x1bW4gcmVwcmVzZW50cyB0aGVcclxuKiBjdXJyZW50ICdjdXJzb3JQb3NUeXBlJy4gRWFjaCBjZWxsIGNvbnRhaW5zIHRoZSBhY3Rpb24gdG8gYmUgdGFrZW4uXHJcbipcclxuKiAgICAgICAgfCAgYXBhcnQgIHwgIGVkZ2UgIHwgd2l0aGluXHJcbiogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuKiBhcGFydCAgfCBjb25jZWFsIHwgZGVsYXkgIHwgcmV2ZWFsXHJcbiogZWRnZSAgIHwgY29uY2VhbCB8IGRlbGF5ICB8IHJldmVhbFxyXG4qIHdpdGhpbiB8IGNvbmNlYWwgfCByZXZlYWwgfCByZXZlYWxcclxuKiBOL0EgICAgfCBjb25jZWFsIHwgcmV2ZWFsIHwgcmV2ZWFsXHJcbipcclxuKiAnTi9BJyBtZWFucyB0aGF0IHRoZSBjb25jZWFsbWVudCBkbyBub3QgZXhpc3QgYmVmb3JlIHRoZSB1cGRhdGUsIHdoaWNoIHNob3VsZFxyXG4qIGJlIGp1ZGdlZCBieSAnYXRTYW1lUG9zQWZ0ZXInIGZ1bmN0aW9uLlxyXG4qL1xyXG5mdW5jdGlvbiBkZXRlcm1pbmVBY3Rpb24oXHJcblx0b2xkQ3Vyc29yOiBDb25jZWFsbWVudFtcImN1cnNvclBvc1R5cGVcIl0gfCB1bmRlZmluZWQsXHJcblx0bmV3Q3Vyc29yOiBDb25jZWFsbWVudFtcImN1cnNvclBvc1R5cGVcIl0sXHJcblx0bW91c2Vkb3duOiBib29sZWFuLFxyXG5cdGRlbGF5RW5hYmxlZDogYm9vbGVhbixcclxuKTogQ29uY2VhbEFjdGlvbiB7XHJcblx0aWYgKG1vdXNlZG93bikgcmV0dXJuIFwiY29uY2VhbFwiO1xyXG5cclxuXHRpZiAobmV3Q3Vyc29yID09PSBcImFwYXJ0XCIpIHJldHVybiBcImNvbmNlYWxcIjtcclxuXHRpZiAobmV3Q3Vyc29yID09PSBcIndpdGhpblwiKSByZXR1cm4gXCJyZXZlYWxcIjtcclxuXHJcblx0Ly8gbmV3Q3Vyc29yID09PSBcImVkZ2VcIlxyXG5cdGlmICghZGVsYXlFbmFibGVkKSByZXR1cm4gXCJyZXZlYWxcIjtcclxuXHQvLyBkZWxheSBpcyBlbmFibGVkXHJcblx0aWYgKCFvbGRDdXJzb3IgfHwgb2xkQ3Vyc29yID09PSBcIndpdGhpblwiKSByZXR1cm4gXCJyZXZlYWxcIjtcclxuXHRlbHNlIHJldHVybiBcImRlbGF5XCI7XHJcbn1cclxuXHJcbi8vIEJ1aWxkIGEgZGVjb3JhdGlvbiBzZXQgZnJvbSB0aGUgZ2l2ZW4gY29uY2VhbG1lbnRzXHJcbmZ1bmN0aW9uIGJ1aWxkRGVjb1NldChjb25jZWFsbWVudHM6IENvbmNlYWxtZW50W10pIHtcclxuXHRjb25zdCBkZWNvczogUmFuZ2U8RGVjb3JhdGlvbj5bXSA9IFtdXHJcblxyXG5cdGZvciAoY29uc3QgY29uYyBvZiBjb25jZWFsbWVudHMpIHtcclxuXHRcdGlmICghY29uYy5lbmFibGUpIGNvbnRpbnVlO1xyXG5cclxuXHRcdGZvciAoY29uc3QgcmVwbGFjZSBvZiBjb25jLnNwZWMpIHtcclxuXHRcdFx0aWYgKHJlcGxhY2Uuc3RhcnQgPT09IHJlcGxhY2UuZW5kKSB7XHJcblx0XHRcdFx0Ly8gQWRkIGFuIGFkZGl0aW9uYWwgXCIvXCIgc3ltYm9sLCBhcyBwYXJ0IG9mIGNvbmNlYWxpbmcgXFxcXGZyYWN7fXt9IC0+ICgpLygpXHJcblx0XHRcdFx0ZGVjb3MucHVzaChcclxuXHRcdFx0XHRcdERlY29yYXRpb24ud2lkZ2V0KHtcclxuXHRcdFx0XHRcdFx0d2lkZ2V0OiBuZXcgVGV4dFdpZGdldChyZXBsYWNlLnRleHQpLFxyXG5cdFx0XHRcdFx0XHRibG9jazogZmFsc2UsXHJcblx0XHRcdFx0XHR9KS5yYW5nZShyZXBsYWNlLnN0YXJ0LCByZXBsYWNlLmVuZClcclxuXHRcdFx0XHQpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdC8vIEltcHJvdmUgc2VsZWN0aW5nIGVtcHR5IHJlcGxhY2VtZW50cyBzdWNoIGFzIFwiXFxmcmFjXCIgLT4gXCJcIlxyXG5cdFx0XHRcdC8vIE5PVEU6IFRoaXMgbWlnaHQgbm90IGJlIG5lY2Vzc2FyeVxyXG5cdFx0XHRcdGNvbnN0IGluY2x1c2l2ZVN0YXJ0ID0gcmVwbGFjZS50ZXh0ID09PSBcIlwiO1xyXG5cdFx0XHRcdGNvbnN0IGluY2x1c2l2ZUVuZCA9IGZhbHNlO1xyXG5cclxuXHRcdFx0XHRkZWNvcy5wdXNoKFxyXG5cdFx0XHRcdFx0RGVjb3JhdGlvbi5yZXBsYWNlKHtcclxuXHRcdFx0XHRcdFx0d2lkZ2V0OiBuZXcgQ29uY2VhbFdpZGdldChcclxuXHRcdFx0XHRcdFx0XHRyZXBsYWNlLnRleHQsXHJcblx0XHRcdFx0XHRcdFx0cmVwbGFjZS5jbGFzcyxcclxuXHRcdFx0XHRcdFx0XHRyZXBsYWNlLmVsZW1lbnRUeXBlXHJcblx0XHRcdFx0XHRcdCksXHJcblx0XHRcdFx0XHRcdGluY2x1c2l2ZVN0YXJ0LFxyXG5cdFx0XHRcdFx0XHRpbmNsdXNpdmVFbmQsXHJcblx0XHRcdFx0XHRcdGJsb2NrOiBmYWxzZSxcclxuXHRcdFx0XHRcdH0pLnJhbmdlKHJlcGxhY2Uuc3RhcnQsIHJlcGxhY2UuZW5kKVxyXG5cdFx0XHRcdCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiBEZWNvcmF0aW9uLnNldChkZWNvcywgdHJ1ZSk7XHJcbn1cclxuXHJcbi8vIEJ1aWxkIGF0b21pYyByYW5nZXMgZnJvbSB0aGUgZ2l2ZW4gY29uY2VhbG1lbnRzLlxyXG4vLyBUaGUgcmVzdWx0aW5nIHJhbmdlcyBhcmUgYmFzaWNhbGx5IHRoZSBzYW1lIGFzIHRoZSBvcmlnaW5hbCByZXBsYWNlbWVudHMsIGJ1dCBlbXB0eSByZXBsYWNlbWVudHNcclxuLy8gYXJlIG1lcmdlZCB3aXRoIHRoZSBcIm5leHQgY2hhcmFjdGVyLFwiIHdoaWNoIGNhbiBiZSBlaXRoZXIgcGxhaW4gdGV4dCBvciBhbm90aGVyIHJlcGxhY2VtZW50LlxyXG4vLyBUaGlzIGFkanVzdG1lbnQgbWFrZXMgY3Vyc29yIG1vdmVtZW50IGFyb3VuZCBlbXB0eSByZXBsYWNlbWVudHMgbW9yZSBpbnR1aXRpdmUuXHJcbmZ1bmN0aW9uIGJ1aWxkQXRvbWljUmFuZ2VzKGNvbmNlYWxtZW50czogQ29uY2VhbG1lbnRbXSkge1xyXG5cdGNvbnN0IHJlcGxzOiBSZXBsYWNlbWVudFtdID0gY29uY2VhbG1lbnRzXHJcblx0XHQuZmlsdGVyKGMgPT4gYy5lbmFibGUpXHJcblx0XHQuZmxhdE1hcChjID0+IGMuc3BlYylcclxuXHRcdC5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0IC0gYi5zdGFydCk7XHJcblxyXG5cdC8vIFJhbmdlU2V0IHJlcXVpcmVzIFJhbmdlVmFsdWUgYnV0IHdlIGRvIG5vdCBuZWVkIG9uZVxyXG5cdGNvbnN0IGZha2V2YWwgPSBuZXcgKGNsYXNzIGV4dGVuZHMgUmFuZ2VWYWx1ZSB7fSk7XHJcblx0Y29uc3QgYnVpbGRlciA9IG5ldyBSYW5nZVNldEJ1aWxkZXIoKTtcclxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHJlcGxzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRpZiAocmVwbHNbaV0udGV4dCA9PT0gXCJcIikge1xyXG5cdFx0XHRpZiAoaSsxICE9IHJlcGxzLmxlbmd0aCAmJiByZXBsc1tpXS5lbmQgPT0gcmVwbHNbaSsxXS5zdGFydCkge1xyXG5cdFx0XHRcdGJ1aWxkZXIuYWRkKHJlcGxzW2ldLnN0YXJ0LCByZXBsc1tpKzFdLmVuZCwgZmFrZXZhbCk7XHJcblx0XHRcdFx0aSsrO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGJ1aWxkZXIuYWRkKHJlcGxzW2ldLnN0YXJ0LCByZXBsc1tpXS5lbmQgKyAxLCBmYWtldmFsKTtcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0YnVpbGRlci5hZGQocmVwbHNbaV0uc3RhcnQsIHJlcGxzW2ldLmVuZCwgZmFrZXZhbCk7XHJcblx0XHR9XHJcblx0fVxyXG5cdHJldHVybiBidWlsZGVyLmZpbmlzaCgpO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbWtDb25jZWFsUGx1Z2luID0gKHJldmVhbFRpbWVvdXQ6IG51bWJlcikgPT4gVmlld1BsdWdpbi5mcm9tQ2xhc3MoY2xhc3Mge1xyXG5cdC8vIFN0YXRlZnVsIFZpZXdQbHVnaW46IHlvdSBzaG91bGQgYXZvaWQgb25lIGluIGdlbmVyYWwsIGJ1dCBoZXJlXHJcblx0Ly8gdGhlIGFwcHJvYWNoIGJhc2VkIG9uIFN0YXRlRmllbGQgYW5kIHVwZGF0ZUxpc3RlbmVyIGNvbmZsaWN0cyB3aXRoXHJcblx0Ly8gb2JzaWRpYW4ncyBpbnRlcm5hbCBsb2dpYyBhbmQgY2F1c2VzIHdlaXJkIHJlbmRlcmluZy5cclxuXHRjb25jZWFsbWVudHM6IENvbmNlYWxtZW50W107XHJcblx0ZGVjb3JhdGlvbnM6IERlY29yYXRpb25TZXQ7XHJcblx0YXRvbWljUmFuZ2VzOiBSYW5nZVNldDxSYW5nZVZhbHVlPjtcclxuXHRkZWxheUVuYWJsZWQ6IGJvb2xlYW47XHJcblxyXG5cclxuXHRjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHRoaXMuY29uY2VhbG1lbnRzID0gW107XHJcblx0XHR0aGlzLmRlY29yYXRpb25zID0gRGVjb3JhdGlvbi5ub25lO1xyXG5cdFx0dGhpcy5hdG9taWNSYW5nZXMgPSBSYW5nZVNldC5lbXB0eTtcclxuXHRcdHRoaXMuZGVsYXlFbmFibGVkID0gcmV2ZWFsVGltZW91dCA+IDA7XHJcblx0fVxyXG5cclxuXHRkZWxheWVkUmV2ZWFsID0gZGVib3VuY2UoKGRlbGF5ZWRDb25jZWFsbWVudHM6IENvbmNlYWxtZW50W10sIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcclxuXHRcdC8vIEltcGxpY2l0bHkgY2hhbmdlIHRoZSBzdGF0ZVxyXG5cdFx0Zm9yIChjb25zdCBjb25jZWFsbWVudCBvZiBkZWxheWVkQ29uY2VhbG1lbnRzKSB7XHJcblx0XHRcdGNvbmNlYWxtZW50LmVuYWJsZSA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IGJ1aWxkRGVjb1NldCh0aGlzLmNvbmNlYWxtZW50cyk7XHJcblx0XHR0aGlzLmF0b21pY1JhbmdlcyA9IGJ1aWxkQXRvbWljUmFuZ2VzKHRoaXMuY29uY2VhbG1lbnRzKTtcclxuXHJcblx0XHQvLyBJbnZva2UgdGhlIHVwZGF0ZSBtZXRob2QgdG8gcmVmbGVjdCB0aGUgY2hhbmdlcyBvZiB0aGlzLmRlY29yYXRpb25cclxuXHRcdHZpZXcuZGlzcGF0Y2goKTtcclxuXHR9LCByZXZlYWxUaW1lb3V0LCB0cnVlKTtcclxuXHJcblx0dXBkYXRlKHVwZGF0ZTogVmlld1VwZGF0ZSkge1xyXG5cdFx0aWYgKCEodXBkYXRlLmRvY0NoYW5nZWQgfHwgdXBkYXRlLnZpZXdwb3J0Q2hhbmdlZCB8fCB1cGRhdGUuc2VsZWN0aW9uU2V0KSlcclxuXHRcdFx0cmV0dXJuO1xyXG5cclxuXHRcdC8vIENhbmNlbCB0aGUgZGVsYXllZCByZXZlYWxtZW50IHdoZW5ldmVyIHdlIHVwZGF0ZSB0aGUgY29uY2VhbG1lbnRzXHJcblx0XHR0aGlzLmRlbGF5ZWRSZXZlYWwuY2FuY2VsKCk7XHJcblxyXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdXBkYXRlLnN0YXRlLnNlbGVjdGlvbjtcclxuXHRcdGNvbnN0IG1vdXNlZG93biA9IHVwZGF0ZS52aWV3LnBsdWdpbihsaXZlUHJldmlld1N0YXRlKT8ubW91c2Vkb3dufHxmYWxzZTtcclxuXHJcblx0XHRjb25zdCBjb25jZWFsU3BlY3MgPSBjb25jZWFsKHVwZGF0ZS52aWV3KTtcclxuXHJcblx0XHQvLyBDb2xsZWN0IGNvbmNlYWxtZW50cyBmcm9tIHRoZSBuZXcgY29uY2VhbCBzcGVjc1xyXG5cdFx0Y29uc3QgY29uY2VhbG1lbnRzOiBDb25jZWFsbWVudFtdID0gW107XHJcblx0XHQvLyBjb25jZWFsbWVudHMgdGhhdCBzaG91bGQgYmUgcmV2ZWFsZWQgYWZ0ZXIgYSBkZWxheSAoaS5lLiAnZGVsYXknIGFjdGlvbilcclxuXHRcdGNvbnN0IGRlbGF5ZWRDb25jZWFsbWVudHM6IENvbmNlYWxtZW50W10gPSBbXTtcclxuXHJcblx0XHRmb3IgKGNvbnN0IHNwZWMgb2YgY29uY2VhbFNwZWNzKSB7XHJcblx0XHRcdGNvbnN0IGN1cnNvclBvc1R5cGUgPSBkZXRlcm1pbmVDdXJzb3JQb3NUeXBlKHNlbGVjdGlvbiwgc3BlYyk7XHJcblx0XHRcdGNvbnN0IG9sZENvbmNlYWxtZW50ID0gdGhpcy5jb25jZWFsbWVudHMuZmluZChcclxuXHRcdFx0XHQob2xkKSA9PiBhdFNhbWVQb3NBZnRlcih1cGRhdGUsIG9sZC5zcGVjLCBzcGVjKVxyXG5cdFx0XHQpO1xyXG5cclxuXHRcdFx0Y29uc3QgY29uY2VhbEFjdGlvbiA9IGRldGVybWluZUFjdGlvbihcclxuXHRcdFx0XHRvbGRDb25jZWFsbWVudD8uY3Vyc29yUG9zVHlwZSwgY3Vyc29yUG9zVHlwZSwgbW91c2Vkb3duLCB0aGlzLmRlbGF5RW5hYmxlZFxyXG5cdFx0XHQpO1xyXG5cclxuXHRcdFx0Y29uc3QgY29uY2VhbG1lbnQ6IENvbmNlYWxtZW50ID0ge1xyXG5cdFx0XHRcdHNwZWMsXHJcblx0XHRcdFx0Y3Vyc29yUG9zVHlwZSxcclxuXHRcdFx0XHRlbmFibGU6IGNvbmNlYWxBY3Rpb24gIT09IFwicmV2ZWFsXCIsXHJcblx0XHRcdH07XHJcblxyXG5cdFx0XHRpZiAoY29uY2VhbEFjdGlvbiA9PT0gXCJkZWxheVwiKSB7XHJcblx0XHRcdFx0ZGVsYXllZENvbmNlYWxtZW50cy5wdXNoKGNvbmNlYWxtZW50KTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0Y29uY2VhbG1lbnRzLnB1c2goY29uY2VhbG1lbnQpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChkZWxheWVkQ29uY2VhbG1lbnRzLmxlbmd0aCA+IDApIHtcclxuXHRcdFx0dGhpcy5kZWxheWVkUmV2ZWFsKGRlbGF5ZWRDb25jZWFsbWVudHMsIHVwZGF0ZS52aWV3KTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLmNvbmNlYWxtZW50cyA9IGNvbmNlYWxtZW50cztcclxuXHRcdHRoaXMuZGVjb3JhdGlvbnMgPSBidWlsZERlY29TZXQodGhpcy5jb25jZWFsbWVudHMpO1xyXG5cdFx0dGhpcy5hdG9taWNSYW5nZXMgPSBidWlsZEF0b21pY1Jhbmdlcyh0aGlzLmNvbmNlYWxtZW50cyk7XHJcblx0fVxyXG59LCB7XHJcblx0ZGVjb3JhdGlvbnM6IHYgPT4gdi5kZWNvcmF0aW9ucyxcclxuXHRwcm92aWRlOiBwbHVnaW4gPT4gRWRpdG9yVmlldy5hdG9taWNSYW5nZXMub2YodmlldyA9PiB7XHJcblx0XHRjb25zdCBwbHVnaW5JbnN0YW5jZSA9IHZpZXcucGx1Z2luPy4ocGx1Z2luKTtcclxuXHRcdHJldHVybiAocGx1Z2luSW5zdGFuY2U/LmF0b21pY1JhbmdlcyBhcyBSYW5nZVNldDxhbnk+KSA/PyBSYW5nZVNldC5lbXB0eTtcclxuXHR9KSxcdFxyXG59KTtcclxuIl19