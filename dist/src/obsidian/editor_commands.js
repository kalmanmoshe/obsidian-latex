import { replaceRange, setCursor, setSelection } from "../utils/editor_utils";
import { Context } from "src/utils/context";
import { MathPraiser } from "src/mathParser/mathEngine";
function boxCurrentEquation(view) {
    const ctx = Context.fromView(view);
    const result = ctx.getBounds();
    if (!result)
        return false;
    const { start, end } = result;
    let equation = "\\boxed{" + view.state.sliceDoc(start, end) + "}";
    // // Insert newlines if we're in a block equation
    const insideBlockEqn = view.state.sliceDoc(start - 2, start) === "$$" && view.state.sliceDoc(end, end + 2) === "$$";
    if (insideBlockEqn)
        equation = "\n" + equation + "\n";
    const pos = view.state.selection.main.to;
    replaceRange(view, start, end, equation);
    setCursor(view, pos + "\\boxed{".length + (insideBlockEqn ? 1 : 0));
}
function getBoxEquationCommand() {
    return {
        id: "moshe-box-equation",
        name: "Box current equation",
        editorCheckCallback: (checking, editor) => {
            // @ts-ignore
            const view = editor.cm;
            const ctx = Context.fromView(view);
            const withinEquation = ctx.mode.inMath();
            if (checking)
                return withinEquation;
            if (!withinEquation)
                return;
            boxCurrentEquation(view);
            return;
        },
    };
}
function getSelectEquationCommand() {
    return {
        id: "moshe-select-equation",
        name: "Select current equation",
        editorCheckCallback: (checking, editor) => {
            // @ts-ignore
            const view = editor.cm;
            const ctx = Context.fromView(view);
            const withinEquation = ctx.mode.inMath();
            if (checking)
                return withinEquation;
            if (!withinEquation)
                return;
            const result = ctx.getBounds();
            if (!result)
                return false;
            let { start, end } = result;
            // Don't include newline characters in the selection
            const doc = view.state.doc.toString();
            if (doc.charAt(start) === "\n")
                start++;
            if (doc.charAt(end - 1) === "\n")
                end--;
            setSelection(view, start, end);
            return;
        },
    };
}
function getEnableAllFeaturesCommand(plugin) {
    return {
        id: "moshe-enable-all-features",
        name: "Enable all features",
        callback: async () => {
            plugin.settings.snippetsEnabled = true;
            plugin.settings.matrixShortcutsEnabled = true;
            plugin.settings.taboutEnabled = true;
            plugin.settings.autoEnlargeBrackets = true;
            await plugin.saveSettings();
        },
    };
}
function getDisableAllFeaturesCommand(plugin) {
    return {
        id: "moshe-disable-all-features",
        name: "Disable all features",
        callback: async () => {
            plugin.settings.snippetsEnabled = false;
            plugin.settings.matrixShortcutsEnabled = false;
            plugin.settings.taboutEnabled = false;
            plugin.settings.autoEnlargeBrackets = false;
            await plugin.saveSettings();
        },
    };
}
function getTranslateFromMathjaxToLatex(plugin) {
    return {
        id: "moshe-translate-from-mathjax-to-latex",
        name: "Translate from mathjax to latex",
        editorCheckCallback: (checking, editor) => {
            // @ts-ignore
            const view = editor.cm;
            const ctx = Context.fromView(view);
            const withinEquation = ctx.mode.inMath();
            if (checking)
                return withinEquation;
            if (!withinEquation)
                return;
            const result = ctx.getBounds();
            if (!result)
                return false;
            let { start, end } = result;
            // Don't include newline characters in the selection
            const doc = view.state.doc.toString();
            const math = doc.splice(start, end);
            console.log(math);
            const a = new MathPraiser();
            a.setInput(math);
            console.log(a);
            return;
        },
    };
}
export const getEditorCommands = (plugin) => {
    return [
        getTranslateFromMathjaxToLatex(plugin),
        getBoxEquationCommand(),
        getSelectEquationCommand(),
        getEnableAllFeaturesCommand(plugin),
        getDisableAllFeaturesCommand(plugin)
    ];
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yX2NvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL29ic2lkaWFuL2VkaXRvcl9jb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUU5RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDNUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBR3hELFNBQVMsa0JBQWtCLENBQUMsSUFBZ0I7SUFDM0MsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDL0IsSUFBSSxDQUFDLE1BQU07UUFBRSxPQUFPLEtBQUssQ0FBQztJQUMxQixNQUFNLEVBQUMsS0FBSyxFQUFFLEdBQUcsRUFBQyxHQUFHLE1BQU0sQ0FBQztJQUU1QixJQUFJLFFBQVEsR0FBRyxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUdsRSxrREFBa0Q7SUFDbEQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsS0FBSyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEdBQUcsR0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUM7SUFFaEgsSUFBSSxjQUFjO1FBQUUsUUFBUSxHQUFHLElBQUksR0FBRyxRQUFRLEdBQUcsSUFBSSxDQUFDO0lBR3RELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElB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RTFCLG9EQUFvRDtZQUNwRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN0QyxNQUFNLElBQUksR0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBQyxHQUFHLENBQUMsQ0FBQztZQUNqQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ2pCLE1BQU0sQ0FBQyxHQUFDLElBQUksV0FBVyxFQUFFLENBQUM7WUFDMUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRWYsT0FBTTtRQUNQLENBQUM7S0FDRCxDQUFBO0FBQ0YsQ0FBQztBQUdELE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLENBQUMsTUFBYSxFQUFFLEVBQUU7SUFDbEQsT0FBTztRQUNOLDhCQUE4QixDQUFDLE1BQU0sQ0FBQztRQUN0QyxxQkFBcUIsRUFBRTtRQUN2Qix3QkFBd0IsRUFBRTtRQUMxQiwyQkFBMkIsQ0FBQyxNQUFNLENBQUM7UUFDbkMsNEJBQTRCLENBQUMsTUFBTSxDQUFDO0tBQ3BDLENBQUM7QUFDSCxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFZGl0b3IgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgcmVwbGFjZVJhbmdlLCBzZXRDdXJzb3IsIHNldFNlbGVjdGlvbiB9IGZyb20gXCIuLi91dGlscy9lZGl0b3JfdXRpbHNcIjtcbmltcG9ydCBNb3NoZSBmcm9tIFwic3JjL21haW5cIjtcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tIFwic3JjL3V0aWxzL2NvbnRleHRcIjtcbmltcG9ydCB7IE1hdGhQcmFpc2VyIH0gZnJvbSBcInNyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmVcIjtcblxuXG5mdW5jdGlvbiBib3hDdXJyZW50RXF1YXRpb24odmlldzogRWRpdG9yVmlldykge1xuXHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xuXHRjb25zdCByZXN1bHQgPSBjdHguZ2V0Qm91bmRzKCk7XG5cdGlmICghcmVzdWx0KSByZXR1cm4gZmFsc2U7XG5cdGNvbnN0IHtzdGFydCwgZW5kfSA9IHJlc3VsdDtcblxuXHRsZXQgZXF1YXRpb24gPSBcIlxcXFxib3hlZHtcIiArIHZpZXcuc3RhdGUuc2xpY2VEb2Moc3RhcnQsIGVuZCkgKyBcIn1cIjtcblxuXG5cdC8vIC8vIEluc2VydCBuZXdsaW5lcyBpZiB3ZSdyZSBpbiBhIGJsb2NrIGVxdWF0aW9uXG5cdGNvbnN0IGluc2lkZUJsb2NrRXFuID0gdmlldy5zdGF0ZS5zbGljZURvYyhzdGFydC0yLCBzdGFydCkgPT09IFwiJCRcIiAmJiB2aWV3LnN0YXRlLnNsaWNlRG9jKGVuZCwgZW5kKzIpID09PSBcIiQkXCI7XG5cblx0aWYgKGluc2lkZUJsb2NrRXFuKSBlcXVhdGlvbiA9IFwiXFxuXCIgKyBlcXVhdGlvbiArIFwiXFxuXCI7XG5cblxuXHRjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLnRvO1xuXHRyZXBsYWNlUmFuZ2Uodmlldywgc3RhcnQsIGVuZCwgZXF1YXRpb24pO1xuXHRzZXRDdXJzb3IodmlldywgcG9zICsgXCJcXFxcYm94ZWR7XCIubGVuZ3RoICsgKGluc2lkZUJsb2NrRXFuID8gMSA6IDApKTtcbn1cblxuXG5mdW5jdGlvbiBnZXRCb3hFcXVhdGlvbkNvbW1hbmQoKSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IFwibW9zaGUtYm94LWVxdWF0aW9uXCIsXG5cdFx0bmFtZTogXCJCb3ggY3VycmVudCBlcXVhdGlvblwiLFxuXHRcdGVkaXRvckNoZWNrQ2FsbGJhY2s6IChjaGVja2luZzogYm9vbGVhbiwgZWRpdG9yOiBFZGl0b3IpID0+IHtcblxuXHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0Y29uc3QgdmlldyA9IGVkaXRvci5jbTtcblx0XHRcdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XG5cdFx0XHRjb25zdCB3aXRoaW5FcXVhdGlvbiA9IGN0eC5tb2RlLmluTWF0aCgpO1xuXG5cdFx0XHRpZiAoY2hlY2tpbmcpIHJldHVybiB3aXRoaW5FcXVhdGlvbjtcblx0XHRcdGlmICghd2l0aGluRXF1YXRpb24pIHJldHVybjtcblxuXHRcdFx0Ym94Q3VycmVudEVxdWF0aW9uKHZpZXcpO1xuXG5cdFx0XHRyZXR1cm47XG5cblx0XHR9LFxuXHR9XG59XG5cblxuZnVuY3Rpb24gZ2V0U2VsZWN0RXF1YXRpb25Db21tYW5kKCkge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBcIm1vc2hlLXNlbGVjdC1lcXVhdGlvblwiLFxuXHRcdG5hbWU6IFwiU2VsZWN0IGN1cnJlbnQgZXF1YXRpb25cIixcblx0XHRlZGl0b3JDaGVja0NhbGxiYWNrOiAoY2hlY2tpbmc6IGJvb2xlYW4sIGVkaXRvcjogRWRpdG9yKSA9PiB7XG5cblx0XHRcdC8vIEB0cy1pZ25vcmVcblx0XHRcdGNvbnN0IHZpZXcgPSBlZGl0b3IuY207XG5cdFx0XHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xuXHRcdFx0Y29uc3Qgd2l0aGluRXF1YXRpb24gPSBjdHgubW9kZS5pbk1hdGgoKTtcblxuXHRcdFx0aWYgKGNoZWNraW5nKSByZXR1cm4gd2l0aGluRXF1YXRpb247XG5cdFx0XHRpZiAoIXdpdGhpbkVxdWF0aW9uKSByZXR1cm47XG5cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY3R4LmdldEJvdW5kcygpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHJldHVybiBmYWxzZTtcblx0XHRcdGxldCB7c3RhcnQsIGVuZH0gPSByZXN1bHQ7XG5cblx0XHRcdC8vIERvbid0IGluY2x1ZGUgbmV3bGluZSBjaGFyYWN0ZXJzIGluIHRoZSBzZWxlY3Rpb25cblx0XHRcdGNvbnN0IGRvYyA9IHZpZXcuc3RhdGUuZG9jLnRvU3RyaW5nKCk7XG5cblx0XHRcdGlmIChkb2MuY2hhckF0KHN0YXJ0KSA9PT0gXCJcXG5cIikgc3RhcnQrKztcblx0XHRcdGlmIChkb2MuY2hhckF0KGVuZCAtIDEpID09PSBcIlxcblwiKSBlbmQtLTtcblxuXG5cdFx0XHRzZXRTZWxlY3Rpb24odmlldywgc3RhcnQsIGVuZCk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9LFxuXHR9XG59XG5cblxuZnVuY3Rpb24gZ2V0RW5hYmxlQWxsRmVhdHVyZXNDb21tYW5kKHBsdWdpbjogTW9zaGUpIHtcblx0cmV0dXJuIHtcblx0XHRpZDogXCJtb3NoZS1lbmFibGUtYWxsLWZlYXR1cmVzXCIsXG5cdFx0bmFtZTogXCJFbmFibGUgYWxsIGZlYXR1cmVzXCIsXG5cdFx0Y2FsbGJhY2s6IGFzeW5jICgpID0+IHtcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQgPSB0cnVlO1xuXHRcdFx0cGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQgPSB0cnVlO1xuXHRcdFx0cGx1Z2luLnNldHRpbmdzLnRhYm91dEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0cGx1Z2luLnNldHRpbmdzLmF1dG9FbmxhcmdlQnJhY2tldHMgPSB0cnVlO1xuXG5cdFx0XHRhd2FpdCBwbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0fSxcblx0fVxufVxuXG5cbmZ1bmN0aW9uIGdldERpc2FibGVBbGxGZWF0dXJlc0NvbW1hbmQocGx1Z2luOiBNb3NoZSkge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBcIm1vc2hlLWRpc2FibGUtYWxsLWZlYXR1cmVzXCIsXG5cdFx0bmFtZTogXCJEaXNhYmxlIGFsbCBmZWF0dXJlc1wiLFxuXHRcdGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRwbHVnaW4uc2V0dGluZ3Muc25pcHBldHNFbmFibGVkID0gZmFsc2U7XG5cdFx0XHRwbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0cGx1Z2luLnNldHRpbmdzLnRhYm91dEVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzID0gZmFsc2U7XG5cblx0XHRcdGF3YWl0IHBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHR9LFxuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFRyYW5zbGF0ZUZyb21NYXRoamF4VG9MYXRleChwbHVnaW46IE1vc2hlKSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IFwibW9zaGUtdHJhbnNsYXRlLWZyb20tbWF0aGpheC10by1sYXRleFwiLFxuXHRcdG5hbWU6IFwiVHJhbnNsYXRlIGZyb20gbWF0aGpheCB0byBsYXRleFwiLFxuXHRcdGVkaXRvckNoZWNrQ2FsbGJhY2s6IChjaGVja2luZzogYm9vbGVhbiwgZWRpdG9yOiBFZGl0b3IpID0+IHtcblx0XHRcdC8vIEB0cy1pZ25vcmVcblx0XHRcdGNvbnN0IHZpZXcgPSBlZGl0b3IuY207XG5cdFx0XHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xuXHRcdFx0Y29uc3Qgd2l0aGluRXF1YXRpb24gPSBjdHgubW9kZS5pbk1hdGgoKTtcblxuXHRcdFx0aWYgKGNoZWNraW5nKSByZXR1cm4gd2l0aGluRXF1YXRpb247XG5cdFx0XHRpZiAoIXdpdGhpbkVxdWF0aW9uKSByZXR1cm47XG5cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY3R4LmdldEJvdW5kcygpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHJldHVybiBmYWxzZTtcblx0XHRcdGxldCB7c3RhcnQsIGVuZH0gPSByZXN1bHQ7XG5cblx0XHRcdC8vIERvbid0IGluY2x1ZGUgbmV3bGluZSBjaGFyYWN0ZXJzIGluIHRoZSBzZWxlY3Rpb25cblx0XHRcdGNvbnN0IGRvYyA9IHZpZXcuc3RhdGUuZG9jLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBtYXRoPWRvYy5zcGxpY2Uoc3RhcnQsZW5kKTtcblx0XHRcdGNvbnNvbGUubG9nKG1hdGgpXG5cdFx0XHRjb25zdCBhPW5ldyBNYXRoUHJhaXNlcigpO1xuXHRcdFx0YS5zZXRJbnB1dChtYXRoKTtcblx0XHRcdGNvbnNvbGUubG9nKGEpO1xuXG5cdFx0XHRyZXR1cm5cblx0XHR9LFxuXHR9XG59XG5cblxuZXhwb3J0IGNvbnN0IGdldEVkaXRvckNvbW1hbmRzID0gKHBsdWdpbjogTW9zaGUpID0+IHtcblx0cmV0dXJuIFtcblx0XHRnZXRUcmFuc2xhdGVGcm9tTWF0aGpheFRvTGF0ZXgocGx1Z2luKSxcblx0XHRnZXRCb3hFcXVhdGlvbkNvbW1hbmQoKSxcblx0XHRnZXRTZWxlY3RFcXVhdGlvbkNvbW1hbmQoKSxcblx0XHRnZXRFbmFibGVBbGxGZWF0dXJlc0NvbW1hbmQocGx1Z2luKSxcblx0XHRnZXREaXNhYmxlQWxsRmVhdHVyZXNDb21tYW5kKHBsdWdpbilcblx0XTtcbn07XG4iXX0=