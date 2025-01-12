import { replaceRange, setCursor, setSelection } from "../utils/editor_utils";
import { Context } from "src/utils/context";
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
        id: "latex-suite-box-equation",
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
        id: "latex-suite-select-equation",
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
        id: "latex-suite-enable-all-features",
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
        id: "latex-suite-disable-all-features",
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
export const getEditorCommands = (plugin) => {
    return [
        getBoxEquationCommand(),
        getSelectEquationCommand(),
        getEnableAllFeaturesCommand(plugin),
        getDisableAllFeaturesCommand(plugin)
    ];
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yX2NvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2ZlYXR1cmVzL2VkaXRvcl9jb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUU5RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFHNUMsU0FBUyxrQkFBa0IsQ0FBQyxJQUFnQjtJQUMzQyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ25DLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUMvQixJQUFJLENBQUMsTUFBTTtRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQzFCLE1BQU0sRUFBQyxLQUFLLEVBQUUsR0FBRyxFQUFDLEdBQUcsTUFBTSxDQUFDO0lBRTVCLElBQUksUUFBUSxHQUFHLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDO0lBR2xFLGtEQUFrRDtJQUNsRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxLQUFLLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsR0FBRyxHQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQztJQUVoSCxJQUFJLGNBQWM7UUFBRSxRQUFRLEdBQUcsSUFBSSxHQUFHLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFHdEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztJQUN6QyxZQUFZLENBQUMsSUFBSSxFQUFF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LENBQUMsTUFBd0I7SUFDN0QsT0FBTztRQUNOLEVBQUUsRUFBRSxrQ0FBa0M7UUFDdEMsSUFBSSxFQUFFLHNCQUFzQjtRQUM1QixRQUFRLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDcEIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEdBQUcsS0FBSyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztZQUN0QyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztZQUU1QyxNQUFNLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUM3QixDQUFDO0tBQ0QsQ0FBQTtBQUNGLENBQUM7QUFHRCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLE1BQXdCLEVBQUUsRUFBRTtJQUM3RCxPQUFPO1FBQ04scUJBQXFCLEVBQUU7UUFDdkIsd0JBQXdCLEVBQUU7UUFDMUIsMkJBQTJCLENBQUMsTUFBTSxDQUFDO1FBQ25DLDRCQUE0QixDQUFDLE1BQU0sQ0FBQztLQUNwQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRWRpdG9yIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyByZXBsYWNlUmFuZ2UsIHNldEN1cnNvciwgc2V0U2VsZWN0aW9uIH0gZnJvbSBcIi4uL3V0aWxzL2VkaXRvcl91dGlsc1wiO1xyXG5pbXBvcnQgTGF0ZXhTdWl0ZVBsdWdpbiBmcm9tIFwic3JjL21haW5cIjtcclxuaW1wb3J0IHsgQ29udGV4dCB9IGZyb20gXCJzcmMvdXRpbHMvY29udGV4dFwiO1xyXG5cclxuXHJcbmZ1bmN0aW9uIGJveEN1cnJlbnRFcXVhdGlvbih2aWV3OiBFZGl0b3JWaWV3KSB7XHJcblx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHRjb25zdCByZXN1bHQgPSBjdHguZ2V0Qm91bmRzKCk7XHJcblx0aWYgKCFyZXN1bHQpIHJldHVybiBmYWxzZTtcclxuXHRjb25zdCB7c3RhcnQsIGVuZH0gPSByZXN1bHQ7XHJcblxyXG5cdGxldCBlcXVhdGlvbiA9IFwiXFxcXGJveGVke1wiICsgdmlldy5zdGF0ZS5zbGljZURvYyhzdGFydCwgZW5kKSArIFwifVwiO1xyXG5cclxuXHJcblx0Ly8gLy8gSW5zZXJ0IG5ld2xpbmVzIGlmIHdlJ3JlIGluIGEgYmxvY2sgZXF1YXRpb25cclxuXHRjb25zdCBpbnNpZGVCbG9ja0VxbiA9IHZpZXcuc3RhdGUuc2xpY2VEb2Moc3RhcnQtMiwgc3RhcnQpID09PSBcIiQkXCIgJiYgdmlldy5zdGF0ZS5zbGljZURvYyhlbmQsIGVuZCsyKSA9PT0gXCIkJFwiO1xyXG5cclxuXHRpZiAoaW5zaWRlQmxvY2tFcW4pIGVxdWF0aW9uID0gXCJcXG5cIiArIGVxdWF0aW9uICsgXCJcXG5cIjtcclxuXHJcblxyXG5cdGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4udG87XHJcblx0cmVwbGFjZVJhbmdlKHZpZXcsIHN0YXJ0LCBlbmQsIGVxdWF0aW9uKTtcclxuXHRzZXRDdXJzb3IodmlldywgcG9zICsgXCJcXFxcYm94ZWR7XCIubGVuZ3RoICsgKGluc2lkZUJsb2NrRXFuID8gMSA6IDApKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldEJveEVxdWF0aW9uQ29tbWFuZCgpIHtcclxuXHRyZXR1cm4ge1xyXG5cdFx0aWQ6IFwibGF0ZXgtc3VpdGUtYm94LWVxdWF0aW9uXCIsXHJcblx0XHRuYW1lOiBcIkJveCBjdXJyZW50IGVxdWF0aW9uXCIsXHJcblx0XHRlZGl0b3JDaGVja0NhbGxiYWNrOiAoY2hlY2tpbmc6IGJvb2xlYW4sIGVkaXRvcjogRWRpdG9yKSA9PiB7XHJcblxyXG5cdFx0XHQvLyBAdHMtaWdub3JlXHJcblx0XHRcdGNvbnN0IHZpZXcgPSBlZGl0b3IuY207XHJcblx0XHRcdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblx0XHRcdGNvbnN0IHdpdGhpbkVxdWF0aW9uID0gY3R4Lm1vZGUuaW5NYXRoKCk7XHJcblxyXG5cdFx0XHRpZiAoY2hlY2tpbmcpIHJldHVybiB3aXRoaW5FcXVhdGlvbjtcclxuXHRcdFx0aWYgKCF3aXRoaW5FcXVhdGlvbikgcmV0dXJuO1xyXG5cclxuXHRcdFx0Ym94Q3VycmVudEVxdWF0aW9uKHZpZXcpO1xyXG5cclxuXHRcdFx0cmV0dXJuO1xyXG5cclxuXHRcdH0sXHJcblx0fVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0U2VsZWN0RXF1YXRpb25Db21tYW5kKCkge1xyXG5cdHJldHVybiB7XHJcblx0XHRpZDogXCJsYXRleC1zdWl0ZS1zZWxlY3QtZXF1YXRpb25cIixcclxuXHRcdG5hbWU6IFwiU2VsZWN0IGN1cnJlbnQgZXF1YXRpb25cIixcclxuXHRcdGVkaXRvckNoZWNrQ2FsbGJhY2s6IChjaGVja2luZzogYm9vbGVhbiwgZWRpdG9yOiBFZGl0b3IpID0+IHtcclxuXHJcblx0XHRcdC8vIEB0cy1pZ25vcmVcclxuXHRcdFx0Y29uc3QgdmlldyA9IGVkaXRvci5jbTtcclxuXHRcdFx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHRcdFx0Y29uc3Qgd2l0aGluRXF1YXRpb24gPSBjdHgubW9kZS5pbk1hdGgoKTtcclxuXHJcblx0XHRcdGlmIChjaGVja2luZykgcmV0dXJuIHdpdGhpbkVxdWF0aW9uO1xyXG5cdFx0XHRpZiAoIXdpdGhpbkVxdWF0aW9uKSByZXR1cm47XHJcblxyXG5cclxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY3R4LmdldEJvdW5kcygpO1xyXG5cdFx0XHRpZiAoIXJlc3VsdCkgcmV0dXJuIGZhbHNlO1xyXG5cdFx0XHRsZXQge3N0YXJ0LCBlbmR9ID0gcmVzdWx0O1xyXG5cclxuXHRcdFx0Ly8gRG9uJ3QgaW5jbHVkZSBuZXdsaW5lIGNoYXJhY3RlcnMgaW4gdGhlIHNlbGVjdGlvblxyXG5cdFx0XHRjb25zdCBkb2MgPSB2aWV3LnN0YXRlLmRvYy50b1N0cmluZygpO1xyXG5cclxuXHRcdFx0aWYgKGRvYy5jaGFyQXQoc3RhcnQpID09PSBcIlxcblwiKSBzdGFydCsrO1xyXG5cdFx0XHRpZiAoZG9jLmNoYXJBdChlbmQgLSAxKSA9PT0gXCJcXG5cIikgZW5kLS07XHJcblxyXG5cclxuXHRcdFx0c2V0U2VsZWN0aW9uKHZpZXcsIHN0YXJ0LCBlbmQpO1xyXG5cclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fSxcclxuXHR9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRFbmFibGVBbGxGZWF0dXJlc0NvbW1hbmQocGx1Z2luOiBMYXRleFN1aXRlUGx1Z2luKSB7XHJcblx0cmV0dXJuIHtcclxuXHRcdGlkOiBcImxhdGV4LXN1aXRlLWVuYWJsZS1hbGwtZmVhdHVyZXNcIixcclxuXHRcdG5hbWU6IFwiRW5hYmxlIGFsbCBmZWF0dXJlc1wiLFxyXG5cdFx0Y2FsbGJhY2s6IGFzeW5jICgpID0+IHtcclxuXHRcdFx0cGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzRW5hYmxlZCA9IHRydWU7XHJcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbmFibGVkID0gdHJ1ZTtcclxuXHRcdFx0cGx1Z2luLnNldHRpbmdzLnRhYm91dEVuYWJsZWQgPSB0cnVlO1xyXG5cdFx0XHRwbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0cyA9IHRydWU7XHJcblxyXG5cdFx0XHRhd2FpdCBwbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHR9LFxyXG5cdH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldERpc2FibGVBbGxGZWF0dXJlc0NvbW1hbmQocGx1Z2luOiBMYXRleFN1aXRlUGx1Z2luKSB7XHJcblx0cmV0dXJuIHtcclxuXHRcdGlkOiBcImxhdGV4LXN1aXRlLWRpc2FibGUtYWxsLWZlYXR1cmVzXCIsXHJcblx0XHRuYW1lOiBcIkRpc2FibGUgYWxsIGZlYXR1cmVzXCIsXHJcblx0XHRjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xyXG5cdFx0XHRwbHVnaW4uc2V0dGluZ3Muc25pcHBldHNFbmFibGVkID0gZmFsc2U7XHJcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbmFibGVkID0gZmFsc2U7XHJcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy50YWJvdXRFbmFibGVkID0gZmFsc2U7XHJcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzID0gZmFsc2U7XHJcblxyXG5cdFx0XHRhd2FpdCBwbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHR9LFxyXG5cdH1cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjb25zdCBnZXRFZGl0b3JDb21tYW5kcyA9IChwbHVnaW46IExhdGV4U3VpdGVQbHVnaW4pID0+IHtcclxuXHRyZXR1cm4gW1xyXG5cdFx0Z2V0Qm94RXF1YXRpb25Db21tYW5kKCksXHJcblx0XHRnZXRTZWxlY3RFcXVhdGlvbkNvbW1hbmQoKSxcclxuXHRcdGdldEVuYWJsZUFsbEZlYXR1cmVzQ29tbWFuZChwbHVnaW4pLFxyXG5cdFx0Z2V0RGlzYWJsZUFsbEZlYXR1cmVzQ29tbWFuZChwbHVnaW4pXHJcblx0XTtcclxufTtcclxuIl19