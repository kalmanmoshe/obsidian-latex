import { __awaiter } from "tslib";
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
        callback: () => __awaiter(this, void 0, void 0, function* () {
            plugin.settings.snippetsEnabled = true;
            plugin.settings.matrixShortcutsEnabled = true;
            plugin.settings.taboutEnabled = true;
            plugin.settings.autoEnlargeBrackets = true;
            yield plugin.saveSettings();
        }),
    };
}
function getDisableAllFeaturesCommand(plugin) {
    return {
        id: "moshe-disable-all-features",
        name: "Disable all features",
        callback: () => __awaiter(this, void 0, void 0, function* () {
            plugin.settings.snippetsEnabled = false;
            plugin.settings.matrixShortcutsEnabled = false;
            plugin.settings.taboutEnabled = false;
            plugin.settings.autoEnlargeBrackets = false;
            yield plugin.saveSettings();
        }),
    };
}
function getTranslateFromMathjaxToLatex(plugin) {
    return {
        id: "moshe-translate-from-mathjax-to-latex",
        name: "Translate from MathJax to LaTeX",
        callback: () => __awaiter(this, void 0, void 0, function* () {
            console.log("Hello from callback");
            yield plugin.saveSettings();
        }),
        editorCallback: (editor) => {
            return mathjaxToLatex(String.raw `1+\sin (32)*7.06* \frac{x}{\cos (32)*7.06}-5\left(  \frac{x}{\cos (32)*7.06} \right)^{2}`);
            // @ts-ignore
            const view = editor.cm;
            if (!view)
                return;
            const ctx = Context.fromView(view);
            const { from, to } = view.state.selection.main;
            if (ctx.mode.inMath(), from !== to) {
                console.log('in math');
                const result = ctx.getBounds();
                if (!result)
                    return false;
                const doc = view.state.doc.toString();
                mathjaxToLatex(doc.slice(from, to));
            }
            else {
                console.log('not in math', navigator.clipboard.readText());
                navigator.clipboard.readText().then((string) => {
                    mathjaxToLatex(string);
                }).catch((error) => {
                    console.error("Failed to read clipboard: ", error);
                });
                ;
            }
            function mathjaxToLatex(math) {
                console.log('math: ', math);
                const a = new MathPraiser();
                a.setInput(math);
                console.log(a.getMathGroup());
            }
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yX2NvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL29ic2lkaWFuL2VkaXRvcl9jb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBRUEsT0FBTyxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFOUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzVDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUd4RCxTQUFTLGtCQUFrQixDQUFDLElBQWdCO0lBQzNDLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQy9CLElBQUksQ0FBQyxNQUFNO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDMUIsTUFBTSxFQUFDLEtBQUssRUFBRSxHQUFHLEVBQUMsR0FBRyxNQUFNLENBQUM7SUFFNUIsSUFBSSxRQUFRLEdBQUcsVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUM7SUFHbEUsa0RBQWtEO0lBQ2xELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxHQUFHLEdBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDO0lBRWhILElBQUksY0FBYztRQUFFLFFBQVEsR0FBRyxJQUFJLEdBQUcsUUFBUSxHQUFHLElBQUksQ0FBQztJQUd0RCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ3pDLFlBQVksQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN6QyxTQUFTLENBQUMsSUFBSSxFQUFFLEdBQUcsR0FBRyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDckUsQ0FBQztBQUdELFNBQVMscUJBQXFCO0lBQzdCLE9BQU87UUFDTixFQUFFLEVBQUUsb0JBQW9CO1FBQ3hCLElBQUksRUFBRSxzQkFBc0I7UUFDNUIsbUJBQW1CLEVBQUUsQ0FBQyxRQUFpQixFQUFFLE1BQWMsRUFBRSxFQUFFO1lBRTFELGFBQWE7WUFDYixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkMsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUV6QyxJQUFJLFFBQVE7Z0JBQUUsT0FBTyxjQUFjLENBQUM7WUFDcEMsSUFBSSxDQUFDLGNBQWM7Z0JBQUUsT0FBTztZQUU1QixrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUV6QixPQUFPO1FBRVIsQ0FBQztLQUNELENBQUE7QUFDRixDQUFDO0FBR0QsU0FBUyx3QkFBd0I7SUFDaEMsT0FBTztRQUNOLEVBQUUsRUFBRSx1QkFBdUI7UUFDM0IsSUFBSSxFQUFFLHlCQUF5QjtRQUMvQixtQkFBbUIsRUFBRSxDQUFDLFFBQWlCLEVBQUUsTUFBYyxFQUFFLEVBQUU7WUFFMUQsYUFBYTtZQUNiLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDdkIsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBRXpDLElBQUksUUFBUTtnQkFBRSxPQUFPLGNBQWMsQ0FBQztZQUNwQyxJQUFJLENBQUMsY0FBYztnQkFBRSxPQUFPO1lBRzVCLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMvQixJQUFJLENBQUMsTUFBTTtnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUMxQixJQUFJLEVBQUMsS0FBSyxFQUFFLEdBQUcsRUFBQyxHQUFHLE1BQU0sQ0FBQztZQUUxQixvREFBb0Q7WUFDcEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFFdEMsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLElBQUk7Z0JBQUUsS0FBSyxFQUFFLENBQUM7WUFDeEMsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxJQUFJO2dCQUFFLEdBQUcsRUFBRSxDQUFDO1lBR3hDLFlBQVksQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRS9CLE9BQU87UUFDUixDQUFDO0tBQ0QsQ0FBQTtBQUNGLENBQUM7QUFHRCxTQUFTLDJCQUEyQixDQUFDLE1BQWE7SUFDakQsT0FBTztRQUNOLEVBQUUsRUFBRSwyQkFBMkI7UUFDL0IsSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixRQUFRLEVBQUUsR0FBUyxFQUFFO1lBQ3BCLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztZQUN2QyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixHQUFHLElBQUksQ0FBQztZQUM5QyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7WUFDckMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7WUFFM0MsTUFBTSxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDN0IsQ0FBQyxDQUFBO0tBQ0QsQ0FBQTtBQUNGLENBQUM7QUFHRCxTQUFTLDRCQUE0QixDQUFDLE1BQWE7SUFDbEQsT0FBTztRQUNOLEVBQUUsRUFBRSw0QkFBNEI7UUFDaEMsSUFBSSxFQUFFLHNCQUFzQjtRQUM1QixRQUFRLEVBQUUsR0FBUyxFQUFFO1lBQ3BCLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQztZQUN4QyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixHQUFHLEtBQUssQ0FBQztZQUMvQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUM7WUFDdEMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUM7WUFFNUMsTUFBTSxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDN0IsQ0FBQyxDQUFBO0tBQ0QsQ0FBQTtBQUNGLENBQUM7QUFFRCxTQUFTLDhCQUE4QixDQUFDLE1BQWE7SUFDcEQsT0FBTztRQUNOLEVBQUUsRUFBRSx1Q0FBdUM7UUFDM0MsSUFBSSxFQUFFLGlDQUFpQztRQUN2QyxRQUFRLEVBQUUsR0FBUyxFQUFFO1lBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUVuQyxNQUFNLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUM3QixDQUFDLENBQUE7UUFDRCxjQUFjLEVBQUUsQ0FBQyxNQUFjLEVBQUUsRUFBRTtZQUNsQyxPQUFPLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFBLDBGQUEwRixDQUFDLENBQUE7WUFDM0gsYUFBYTtZQUNiLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLElBQUk7Z0JBQUUsT0FBTztZQUVsQixNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLE1BQU0sRUFBQyxJQUFJLEVBQUUsRUFBRSxFQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO1lBRTdDLElBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBQyxJQUFJLEtBQUssRUFBRSxFQUFDLENBQUM7Z0JBQ2pDLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3ZCLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxDQUFDLE1BQU07b0JBQUUsT0FBTyxLQUFLLENBQUM7Z0JBRTFCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUN0QyxjQUFjLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxDQUFDO2lCQUNJLENBQUM7Z0JBQ0wsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUMxRCxTQUFTLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO29CQUM5QyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3hCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO29CQUNsQixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNwRCxDQUFDLENBQUMsQ0FBQztnQkFBQSxDQUFDO1lBQ0wsQ0FBQztZQUNELFNBQVMsY0FBYyxDQUFDLElBQVk7Z0JBQ25DLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMzQixNQUFNLENBQUMsR0FBRyxJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUM1QixDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUVqQixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1lBQy9CLENBQUM7UUFDRixDQUFDO0tBQ0QsQ0FBQztBQUNILENBQUM7QUFHRCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLE1BQWEsRUFBRSxFQUFFO0lBQ2xELE9BQU87UUFDTiw4QkFBOEIsQ0FBQyxNQUFNLENBQUM7UUFDdEMscUJBQXFCLEVBQUU7UUFDdkIsd0JBQXdCLEVBQUU7UUFDMUIsMkJBQTJCLENBQUMsTUFBTSxDQUFDO1FBQ25DLDRCQUE0QixDQUFDLE1BQU0sQ0FBQztLQUNwQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRWRpdG9yIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyByZXBsYWNlUmFuZ2UsIHNldEN1cnNvciwgc2V0U2VsZWN0aW9uIH0gZnJvbSBcIi4uL3V0aWxzL2VkaXRvcl91dGlsc1wiO1xyXG5pbXBvcnQgTW9zaGUgZnJvbSBcInNyYy9tYWluXCI7XHJcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tIFwic3JjL3V0aWxzL2NvbnRleHRcIjtcclxuaW1wb3J0IHsgTWF0aFByYWlzZXIgfSBmcm9tIFwic3JjL21hdGhQYXJzZXIvbWF0aEVuZ2luZVwiO1xyXG5cclxuXHJcbmZ1bmN0aW9uIGJveEN1cnJlbnRFcXVhdGlvbih2aWV3OiBFZGl0b3JWaWV3KSB7XHJcblx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHRjb25zdCByZXN1bHQgPSBjdHguZ2V0Qm91bmRzKCk7XHJcblx0aWYgKCFyZXN1bHQpIHJldHVybiBmYWxzZTtcclxuXHRjb25zdCB7c3RhcnQsIGVuZH0gPSByZXN1bHQ7XHJcblxyXG5cdGxldCBlcXVhdGlvbiA9IFwiXFxcXGJveGVke1wiICsgdmlldy5zdGF0ZS5zbGljZURvYyhzdGFydCwgZW5kKSArIFwifVwiO1xyXG5cclxuXHJcblx0Ly8gLy8gSW5zZXJ0IG5ld2xpbmVzIGlmIHdlJ3JlIGluIGEgYmxvY2sgZXF1YXRpb25cclxuXHRjb25zdCBpbnNpZGVCbG9ja0VxbiA9IHZpZXcuc3RhdGUuc2xpY2VEb2Moc3RhcnQtMiwgc3RhcnQpID09PSBcIiQkXCIgJiYgdmlldy5zdGF0ZS5zbGljZURvYyhlbmQsIGVuZCsyKSA9PT0gXCIkJFwiO1xyXG5cclxuXHRpZiAoaW5zaWRlQmxvY2tFcW4pIGVxdWF0aW9uID0gXCJcXG5cIiArIGVxdWF0aW9uICsgXCJcXG5cIjtcclxuXHJcblxyXG5cdGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4udG87XHJcblx0cmVwbGFjZVJhbmdlKHZpZXcsIHN0YXJ0LCBlbmQsIGVxdWF0aW9uKTtcclxuXHRzZXRDdXJzb3IodmlldywgcG9zICsgXCJcXFxcYm94ZWR7XCIubGVuZ3RoICsgKGluc2lkZUJsb2NrRXFuID8gMSA6IDApKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldEJveEVxdWF0aW9uQ29tbWFuZCgpIHtcclxuXHRyZXR1cm4ge1xyXG5cdFx0aWQ6IFwibW9zaGUtYm94LWVxdWF0aW9uXCIsXHJcblx0XHRuYW1lOiBcIkJveCBjdXJyZW50IGVxdWF0aW9uXCIsXHJcblx0XHRlZGl0b3JDaGVja0NhbGxiYWNrOiAoY2hlY2tpbmc6IGJvb2xlYW4sIGVkaXRvcjogRWRpdG9yKSA9PiB7XHJcblxyXG5cdFx0XHQvLyBAdHMtaWdub3JlXHJcblx0XHRcdGNvbnN0IHZpZXcgPSBlZGl0b3IuY207XHJcblx0XHRcdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblx0XHRcdGNvbnN0IHdpdGhpbkVxdWF0aW9uID0gY3R4Lm1vZGUuaW5NYXRoKCk7XHJcblxyXG5cdFx0XHRpZiAoY2hlY2tpbmcpIHJldHVybiB3aXRoaW5FcXVhdGlvbjtcclxuXHRcdFx0aWYgKCF3aXRoaW5FcXVhdGlvbikgcmV0dXJuO1xyXG5cclxuXHRcdFx0Ym94Q3VycmVudEVxdWF0aW9uKHZpZXcpO1xyXG5cclxuXHRcdFx0cmV0dXJuO1xyXG5cclxuXHRcdH0sXHJcblx0fVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0U2VsZWN0RXF1YXRpb25Db21tYW5kKCkge1xyXG5cdHJldHVybiB7XHJcblx0XHRpZDogXCJtb3NoZS1zZWxlY3QtZXF1YXRpb25cIixcclxuXHRcdG5hbWU6IFwiU2VsZWN0IGN1cnJlbnQgZXF1YXRpb25cIixcclxuXHRcdGVkaXRvckNoZWNrQ2FsbGJhY2s6IChjaGVja2luZzogYm9vbGVhbiwgZWRpdG9yOiBFZGl0b3IpID0+IHtcclxuXHJcblx0XHRcdC8vIEB0cy1pZ25vcmVcclxuXHRcdFx0Y29uc3QgdmlldyA9IGVkaXRvci5jbTtcclxuXHRcdFx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHRcdFx0Y29uc3Qgd2l0aGluRXF1YXRpb24gPSBjdHgubW9kZS5pbk1hdGgoKTtcclxuXHJcblx0XHRcdGlmIChjaGVja2luZykgcmV0dXJuIHdpdGhpbkVxdWF0aW9uO1xyXG5cdFx0XHRpZiAoIXdpdGhpbkVxdWF0aW9uKSByZXR1cm47XHJcblxyXG5cclxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY3R4LmdldEJvdW5kcygpO1xyXG5cdFx0XHRpZiAoIXJlc3VsdCkgcmV0dXJuIGZhbHNlO1xyXG5cdFx0XHRsZXQge3N0YXJ0LCBlbmR9ID0gcmVzdWx0O1xyXG5cclxuXHRcdFx0Ly8gRG9uJ3QgaW5jbHVkZSBuZXdsaW5lIGNoYXJhY3RlcnMgaW4gdGhlIHNlbGVjdGlvblxyXG5cdFx0XHRjb25zdCBkb2MgPSB2aWV3LnN0YXRlLmRvYy50b1N0cmluZygpO1xyXG5cclxuXHRcdFx0aWYgKGRvYy5jaGFyQXQoc3RhcnQpID09PSBcIlxcblwiKSBzdGFydCsrO1xyXG5cdFx0XHRpZiAoZG9jLmNoYXJBdChlbmQgLSAxKSA9PT0gXCJcXG5cIikgZW5kLS07XHJcblxyXG5cclxuXHRcdFx0c2V0U2VsZWN0aW9uKHZpZXcsIHN0YXJ0LCBlbmQpO1xyXG5cclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fSxcclxuXHR9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRFbmFibGVBbGxGZWF0dXJlc0NvbW1hbmQocGx1Z2luOiBNb3NoZSkge1xyXG5cdHJldHVybiB7XHJcblx0XHRpZDogXCJtb3NoZS1lbmFibGUtYWxsLWZlYXR1cmVzXCIsXHJcblx0XHRuYW1lOiBcIkVuYWJsZSBhbGwgZmVhdHVyZXNcIixcclxuXHRcdGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XHJcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQgPSB0cnVlO1xyXG5cdFx0XHRwbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCA9IHRydWU7XHJcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy50YWJvdXRFbmFibGVkID0gdHJ1ZTtcclxuXHRcdFx0cGx1Z2luLnNldHRpbmdzLmF1dG9FbmxhcmdlQnJhY2tldHMgPSB0cnVlO1xyXG5cclxuXHRcdFx0YXdhaXQgcGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0fSxcclxuXHR9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBnZXREaXNhYmxlQWxsRmVhdHVyZXNDb21tYW5kKHBsdWdpbjogTW9zaGUpIHtcclxuXHRyZXR1cm4ge1xyXG5cdFx0aWQ6IFwibW9zaGUtZGlzYWJsZS1hbGwtZmVhdHVyZXNcIixcclxuXHRcdG5hbWU6IFwiRGlzYWJsZSBhbGwgZmVhdHVyZXNcIixcclxuXHRcdGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XHJcblx0XHRcdHBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQgPSBmYWxzZTtcclxuXHRcdFx0cGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQgPSBmYWxzZTtcclxuXHRcdFx0cGx1Z2luLnNldHRpbmdzLnRhYm91dEVuYWJsZWQgPSBmYWxzZTtcclxuXHRcdFx0cGx1Z2luLnNldHRpbmdzLmF1dG9FbmxhcmdlQnJhY2tldHMgPSBmYWxzZTtcclxuXHJcblx0XHRcdGF3YWl0IHBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdH0sXHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRUcmFuc2xhdGVGcm9tTWF0aGpheFRvTGF0ZXgocGx1Z2luOiBNb3NoZSkge1xyXG5cdHJldHVybiB7XHJcblx0XHRpZDogXCJtb3NoZS10cmFuc2xhdGUtZnJvbS1tYXRoamF4LXRvLWxhdGV4XCIsXHJcblx0XHRuYW1lOiBcIlRyYW5zbGF0ZSBmcm9tIE1hdGhKYXggdG8gTGFUZVhcIixcclxuXHRcdGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XHJcblx0XHRcdGNvbnNvbGUubG9nKFwiSGVsbG8gZnJvbSBjYWxsYmFja1wiKTtcclxuXHJcblx0XHRcdGF3YWl0IHBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdH0sXHJcblx0XHRlZGl0b3JDYWxsYmFjazogKGVkaXRvcjogRWRpdG9yKSA9PiB7XHJcblx0XHRcdHJldHVybiBtYXRoamF4VG9MYXRleChTdHJpbmcucmF3YDErXFxzaW4gKDMyKSo3LjA2KiBcXGZyYWN7eH17XFxjb3MgKDMyKSo3LjA2fS01XFxsZWZ0KCAgXFxmcmFje3h9e1xcY29zICgzMikqNy4wNn0gXFxyaWdodCleezJ9YClcclxuXHRcdFx0Ly8gQHRzLWlnbm9yZVxyXG5cdFx0XHRjb25zdCB2aWV3ID0gZWRpdG9yLmNtO1xyXG5cdFx0XHRpZiAoIXZpZXcpIHJldHVybjtcclxuXHJcblx0XHRcdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblx0XHRcdGNvbnN0IHtmcm9tLCB0b30gPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluO1xyXG5cclxuXHRcdFx0aWYoY3R4Lm1vZGUuaW5NYXRoKCksZnJvbSAhPT0gdG8pe1xyXG5cdFx0XHRcdGNvbnNvbGUubG9nKCdpbiBtYXRoJyk7XHJcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gY3R4LmdldEJvdW5kcygpO1xyXG5cdFx0XHRcdGlmICghcmVzdWx0KSByZXR1cm4gZmFsc2U7XHJcblxyXG5cdFx0XHRcdGNvbnN0IGRvYyA9IHZpZXcuc3RhdGUuZG9jLnRvU3RyaW5nKCk7XHJcblx0XHRcdFx0bWF0aGpheFRvTGF0ZXgoZG9jLnNsaWNlKGZyb20sIHRvKSk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Y29uc29sZS5sb2coJ25vdCBpbiBtYXRoJyxuYXZpZ2F0b3IuY2xpcGJvYXJkLnJlYWRUZXh0KCkpO1xyXG5cdFx0XHRcdG5hdmlnYXRvci5jbGlwYm9hcmQucmVhZFRleHQoKS50aGVuKChzdHJpbmcpID0+IHtcclxuXHRcdFx0XHRcdG1hdGhqYXhUb0xhdGV4KHN0cmluZyk7XHJcblx0XHRcdFx0fSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHJlYWQgY2xpcGJvYXJkOiBcIiwgZXJyb3IpO1xyXG5cdFx0XHRcdH0pOztcclxuXHRcdFx0fVxyXG5cdFx0XHRmdW5jdGlvbiBtYXRoamF4VG9MYXRleChtYXRoOiBzdHJpbmcpIHtcclxuXHRcdFx0XHRjb25zb2xlLmxvZygnbWF0aDogJyxtYXRoKTtcclxuXHRcdFx0XHRjb25zdCBhID0gbmV3IE1hdGhQcmFpc2VyKCk7XHJcblx0XHRcdFx0YS5zZXRJbnB1dChtYXRoKTtcclxuXHJcblx0XHRcdFx0Y29uc29sZS5sb2coYS5nZXRNYXRoR3JvdXAoKSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9O1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNvbnN0IGdldEVkaXRvckNvbW1hbmRzID0gKHBsdWdpbjogTW9zaGUpID0+IHtcclxuXHRyZXR1cm4gW1xyXG5cdFx0Z2V0VHJhbnNsYXRlRnJvbU1hdGhqYXhUb0xhdGV4KHBsdWdpbiksXHJcblx0XHRnZXRCb3hFcXVhdGlvbkNvbW1hbmQoKSxcclxuXHRcdGdldFNlbGVjdEVxdWF0aW9uQ29tbWFuZCgpLFxyXG5cdFx0Z2V0RW5hYmxlQWxsRmVhdHVyZXNDb21tYW5kKHBsdWdpbiksXHJcblx0XHRnZXREaXNhYmxlQWxsRmVhdHVyZXNDb21tYW5kKHBsdWdpbilcclxuXHRdO1xyXG59O1xyXG4iXX0=