import { EditorView, ViewPlugin, tooltips, } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { Context } from "./utils/context";
import { isComposing, replaceRange, setCursor } from "./editor utilities/editor_utils";
import { keyboardAutoReplaceHebrewToEnglishTriggers } from "./utils/staticData";
import { getCharacterAtPos, Suggestor } from "./suggestor";
import { RtlForc } from "./editorDecorations";
import { setSelectionToNextTabstop } from "./snippets/snippet_management";
import { removeAllTabstops, tabstopsStateField } from "./codemirror/tabstops_state_field";
import { clearSnippetQueue, snippetQueueStateField } from "./codemirror/snippet_queue_state_field";
import { handleUndoRedo, snippetInvertedEffects } from "./codemirror/history";
import { runSnippets } from "./features/run_snippets";
import { getLatexSuiteConfig, getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { runAutoFraction } from "./features/autofraction";
import { runMatrixShortcuts } from "./features/matrix_shortcuts";
import { shouldTaboutByCloseBracket, tabout } from "./features/tabout";
import { snippetExtensions } from "./snippets/codemirror/extensions";
import { colorPairedBracketsPluginLowestPrec, highlightCursorBracketsPlugin } from "./editor_extensions/highlight_brackets";
import { mkConcealPlugin } from "./editor_extensions/conceal";
import { cursorTooltipBaseTheme, cursorTooltipField, handleMathTooltip } from "./editor_extensions/math_tooltip";
export class EditorExtensions {
    shouldListenForTransaction = false;
    activeEditorView = null;
    suggestionActive = false;
    suggestor = new Suggestor();
    isSuggesterDeployed() {
        return !!document.body.querySelector(".suggestion-dropdown");
    }
    setEditorExtensions(app) {
        while (app.editorExtensions.length)
            app.editorExtensions.pop();
        app.editorExtensions.push([
            getLatexSuiteConfigExtension(app.CMSettings),
            Prec.highest(EditorView.domEventHandlers({ "keydown": this.onKeydown })),
            EditorView.updateListener.of(handleUpdate),
            snippetExtensions,
        ]);
        this.registerDecorations(app);
        if (app.CMSettings.concealEnabled) {
            const timeout = app.CMSettings.concealRevealTimeout;
            app.editorExtensions.push(mkConcealPlugin(timeout).extension);
        }
        if (app.CMSettings.colorPairedBracketsEnabled)
            app.editorExtensions.push(colorPairedBracketsPluginLowestPrec);
        if (app.CMSettings.highlightCursorBracketsEnabled)
            app.editorExtensions.push(highlightCursorBracketsPlugin.extension);
        if (app.CMSettings.mathPreviewEnabled)
            app.editorExtensions.push([
                cursorTooltipField.extension,
                cursorTooltipBaseTheme,
                tooltips({ position: "absolute" }),
            ]);
        this.monitor(app);
        this.snippetExtensions(app);
        const flatExtensions = app.editorExtensions.flat();
        app.registerEditorExtension(flatExtensions);
    }
    monitor(app) {
        app.registerEditorExtension([
            Prec.highest(EditorView.domEventHandlers({
                keydown: (event, view) => {
                    this.onKeydown(event, view);
                    if (event.code.startsWith("Key") && !event.ctrlKey) {
                        this.shouldListenForTransaction = true;
                    }
                },
                mousemove: (event, view) => {
                    const { clientX, clientY } = event;
                    const position = view.posAtCoords({ x: clientX, y: clientY });
                    if (position) {
                        this.onCursorMove(event, view);
                    }
                },
                focus: (event, view) => {
                    // Track the active editor view
                    this.activeEditorView = view;
                },
            })),
            EditorView.updateListener.of((update) => {
                if (this.shouldListenForTransaction && update.docChanged) {
                    this.onTransaction(update.view);
                    this.shouldListenForTransaction = false;
                }
            }),
        ]);
        // Global click listener to handle suggestions
        document.addEventListener("click", (event) => {
            this.suggestionActive = this.isSuggesterDeployed();
            if (this.suggestionActive && this.activeEditorView) {
                this.onClick(event, this.activeEditorView);
            }
        });
    }
    snippetExtensions(app) {
        app.editorExtensions.push([
            tabstopsStateField.extension,
            snippetQueueStateField.extension,
            snippetInvertedEffects,
        ]);
    }
    registerDecorations(app) {
        app.registerEditorExtension(ViewPlugin.fromClass(RtlForc, {
            decorations: (v) => v.decorations,
        }));
    }
    onCursorMove(event, view) {
        if (!this.isSuggesterDeployed())
            return;
        const { clientX, clientY } = event;
        const container = document.querySelector('.suggestion-dropdown')?.getBoundingClientRect();
        if (!container)
            return;
        if (clientX < container.left || clientX > container.right || clientY < container.top || clientY > container.bottom) {
            console.log("off");
            return;
        }
        console.log("on");
        const dropdownItems = Array.from(document.querySelectorAll('.suggestion-item'));
        for (const item of dropdownItems) {
            const bounds = item.getBoundingClientRect();
            console.log(bounds);
            if (clientX >= bounds.left &&
                clientX <= bounds.right &&
                clientY >= bounds.top &&
                clientY <= bounds.bottom) {
                console.log('Cursor is within dropdown item:', item);
                return; // Stop checking once we find the relevant item
            }
        }
    }
    onClick = (event, view) => {
        const suggestionItems = document.body.querySelectorAll(".suggestion-item");
        // Check if the click is on a suggestion item
        const clickedSuggestion = Array.from(suggestionItems).find((item) => item.contains(event.target));
        if (clickedSuggestion) {
            this.suggestor.selectDropdownItem(clickedSuggestion, view);
        }
        const dropdownItem = document.body.querySelector(".suggestion-dropdown");
        const clickedDropdown = Array.from(suggestionItems).find((item) => item.contains(event.target));
        if (!clickedDropdown) {
            this.suggestor.removeSuggestor();
        }
    };
    onTransaction = (view) => {
        const ctx = Context.fromView(view);
        if (ctx.codeblockLanguage === "tikz") {
            this.suggestor.deploySuggestor(ctx, view);
        }
    };
    onKeydown = (event, view) => {
        let key = event.key;
        let trigger;
        const ctx = Context.fromView(view);
        if (!(event.ctrlKey || event.metaKey) && (ctx.mode.inMath() && (!ctx.inTextEnvironment() || ctx.codeblockLanguage.match(/(tikz)/)))) {
            trigger = keyboardAutoReplaceHebrewToEnglishTriggers.find((trigger2) => trigger2.key === event.key && trigger2.code === event.code);
            key = trigger?.replacement || key;
        }
        if (this.suggestor.isSuggesterDeployed) {
            handleDropdownNavigation(event, view, this.suggestor);
        }
        const success = handleKeydown(key, event.shiftKey, event.ctrlKey || event.metaKey, isComposing(view, event), view);
        if (success)
            event.preventDefault();
        else if (key !== event.key && trigger) {
            event.preventDefault();
            key = trigger.replacement;
            replaceRange(view, view.state.selection.main.from, view.state.selection.main.to, key);
            setCursor(view, view.state.selection.main.from + key.length);
        }
    };
    decorat() {
    }
}
const handleUpdate = (update) => {
    const settings = getLatexSuiteConfig(update.state);
    // The math tooltip handler is driven by view updates because it utilizes
    // information about visual line, which is not available in EditorState
    if (settings.mathPreviewEnabled) {
        handleMathTooltip(update);
    }
    handleUndoRedo(update);
};
const handleDropdownNavigation = (event, view, suggestor) => {
    const items = suggestor.getAlldropdownItems();
    switch (true) {
        case event.key === "ArrowDown":
            suggestor.selectionIndex = (suggestor.selectionIndex + 1) % items.length;
            suggestor.updateSelection(items);
            event.preventDefault();
            break;
        case event.key === "ArrowUp":
            suggestor.selectionIndex = (suggestor.selectionIndex - 1 + items.length) % items.length;
            suggestor.updateSelection(items);
            event.preventDefault();
            break;
        case event.key === "ArrowLeft" || event.key === "ArrowRight":
            suggestor.removeSuggestor();
            break;
        case event.key === "Backspace":
            suggestor.removeSuggestor();
            //suggestor.deploySuggestor(ctx,view)
            break;
        default:
            break;
    }
    if (event.key === "ArrowDown") {
    }
    else if (event.key === "Enter") {
        const selectedItem = items[suggestor.selectionIndex];
        suggestor.selectDropdownItem(selectedItem, view);
        event.preventDefault();
    } /*else if (event.key === "Escape") {
        dropdown.remove();
        event.preventDefault();
    }*/
};
export const handleKeydown = (key, shiftKey, ctrlKey, isIME, view) => {
    const settings = getLatexSuiteConfig(view);
    const ctx = Context.fromView(view);
    let success = false;
    /*
    * When backspace is pressed, if the cursor is inside an empty inline math,
    * delete both $ symbols, not just the first one.
    */
    if (settings.autoDelete$ && key === "Backspace" && ctx.mode.inMath()) {
        const charAtPos = getCharacterAtPos(view, ctx.pos);
        const charAtPrevPos = getCharacterAtPos(view, ctx.pos - 1);
        if (charAtPos === "$" && charAtPrevPos === "$") {
            replaceRange(view, ctx.pos - 1, ctx.pos + 1, "");
            // Note: not sure if removeAllTabstops is necessary
            removeAllTabstops(view);
            return true;
        }
    }
    if (settings.snippetsEnabled) {
        // Prevent IME from triggering keydown events.
        if (settings.suppressSnippetTriggerOnIME && isIME)
            return;
        // Allows Ctrl + z for undo, instead of triggering a snippet ending with z
        if (!ctrlKey) {
            try {
                success = runSnippets(view, ctx, key);
                if (success)
                    return true;
            }
            catch (e) {
                clearSnippetQueue(view);
                console.error(e);
            }
        }
    }
    if (key === "Tab") {
        success = setSelectionToNextTabstop(view);
        if (success)
            return true;
    }
    if (settings.autofractionEnabled && ctx.mode.strictlyInMath()) {
        if (key === "/") {
            success = runAutoFraction(view, ctx);
            if (success)
                return true;
        }
    }
    if (settings.matrixShortcutsEnabled && ctx.mode.blockMath) {
        if (["Tab", "Enter"].contains(key)) {
            success = runMatrixShortcuts(view, ctx, key, shiftKey);
            if (success)
                return true;
        }
    }
    if (settings.taboutEnabled) {
        if (key === "Tab" || shouldTaboutByCloseBracket(view, key)) {
            success = tabout(view, ctx);
            if (success)
                return true;
        }
    }
    return false;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0RWRpdG9yRXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXRFZGl0b3JFeHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUEwQixRQUFRLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQztBQUM3RixPQUFPLEVBQWUsSUFBSSxFQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUM5RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLDRCQUE0QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDakcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzFELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFB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SUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUM7UUFDL0QsSUFBSSxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDakIsT0FBTyxHQUFHLGVBQWUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFFckMsSUFBSSxPQUFPO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsc0JBQXNCLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUMzRCxJQUFJLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3BDLE9BQU8sR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUV2RCxJQUFJLE9BQU87Z0JBQUUsT0FBTyxJQUFJLENBQUM7UUFDMUIsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLFFBQVEsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUM1QixJQUFJLEdBQUcsS0FBSyxLQUFLLElBQUksMEJBQTBCLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDNUQsT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFFNUIsSUFBSSxPQUFPO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTW9zaGUgZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBnZXRUaWt6U3VnZ2VzdGlvbnMsIExhdGV4IH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdQbHVnaW4sIFZpZXdVcGRhdGUgLERlY29yYXRpb24sIHRvb2x0aXBzLCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcbmltcG9ydCB7IEVkaXRvclN0YXRlLCBQcmVjLEV4dGVuc2lvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vdXRpbHMvY29udGV4dFwiO1xyXG5pbXBvcnQgeyBpc0NvbXBvc2luZywgcmVwbGFjZVJhbmdlLCBzZXRDdXJzb3IgfSBmcm9tIFwiLi9lZGl0b3IgdXRpbGl0aWVzL2VkaXRvcl91dGlsc1wiO1xyXG5pbXBvcnQgeyBrZXlib2FyZEF1dG9SZXBsYWNlSGVicmV3VG9FbmdsaXNoVHJpZ2dlcnMgfSBmcm9tIFwiLi91dGlscy9zdGF0aWNEYXRhXCI7XHJcbmltcG9ydCB7IGdldENoYXJhY3RlckF0UG9zLCBTdWdnZXN0b3IgfSBmcm9tIFwiLi9zdWdnZXN0b3JcIjtcclxuaW1wb3J0IHsgUnRsRm9yYyB9IGZyb20gXCIuL2VkaXRvckRlY29yYXRpb25zXCI7XHJcbmltcG9ydCB7IHNldFNlbGVjdGlvblRvTmV4dFRhYnN0b3AgfSBmcm9tIFwiLi9zbmlwcGV0cy9zbmlwcGV0X21hbmFnZW1lbnRcIjtcclxuaW1wb3J0IHsgcmVtb3ZlQWxsVGFic3RvcHMsIHRhYnN0b3BzU3RhdGVGaWVsZCB9IGZyb20gXCIuL2NvZGVtaXJyb3IvdGFic3RvcHNfc3RhdGVfZmllbGRcIjtcclxuaW1wb3J0IHsgY2xlYXJTbmlwcGV0UXVldWUsIHNuaXBwZXRRdWV1ZVN0YXRlRmllbGQgfSBmcm9tIFwiLi9jb2RlbWlycm9yL3NuaXBwZXRfcXVldWVfc3RhdGVfZmllbGRcIjtcclxuaW1wb3J0IHsgaGFuZGxlVW5kb1JlZG8sIHNuaXBwZXRJbnZlcnRlZEVmZmVjdHMgfSBmcm9tIFwiLi9jb2RlbWlycm9yL2hpc3RvcnlcIjtcclxuaW1wb3J0IHsgcnVuU25pcHBldHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9ydW5fc25pcHBldHNcIjtcclxuaW1wb3J0IHsgZ2V0TGF0ZXhTdWl0ZUNvbmZpZywgZ2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbiB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvY29uZmlnXCI7XHJcbmltcG9ydCB7IHJ1bkF1dG9GcmFjdGlvbiB9IGZyb20gXCIuL2ZlYXR1cmVzL2F1dG9mcmFjdGlvblwiO1xyXG5pbXBvcnQgeyBydW5NYXRyaXhTaG9ydGN1dHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9tYXRyaXhfc2hvcnRjdXRzXCI7XHJcbmltcG9ydCB7IHNob3VsZFRhYm91dEJ5Q2xvc2VCcmFja2V0LCB0YWJvdXQgfSBmcm9tIFwiLi9mZWF0dXJlcy90YWJvdXRcIjtcclxuaW1wb3J0IHsgc25pcHBldEV4dGVuc2lvbnMgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL2V4dGVuc2lvbnNcIjtcclxuaW1wb3J0IHsgY29sb3JQYWlyZWRCcmFja2V0c1BsdWdpbkxvd2VzdFByZWMsIGhpZ2hsaWdodEN1cnNvckJyYWNrZXRzUGx1Z2luIH0gZnJvbSBcIi4vZWRpdG9yX2V4dGVuc2lvbnMvaGlnaGxpZ2h0X2JyYWNrZXRzXCI7XHJcbmltcG9ydCB7IG1rQ29uY2VhbFBsdWdpbiB9IGZyb20gXCIuL2VkaXRvcl9leHRlbnNpb25zL2NvbmNlYWxcIjtcclxuaW1wb3J0IHsgY3Vyc29yVG9vbHRpcEJhc2VUaGVtZSwgY3Vyc29yVG9vbHRpcEZpZWxkLCBoYW5kbGVNYXRoVG9vbHRpcCB9IGZyb20gXCIuL2VkaXRvcl9leHRlbnNpb25zL21hdGhfdG9vbHRpcFwiO1xyXG5pbXBvcnQgeyBjb250ZXh0IH0gZnJvbSBcImVzYnVpbGQtd2FzbVwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIEVkaXRvckV4dGVuc2lvbnMge1xyXG4gICAgcHJpdmF0ZSBzaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBhY3RpdmVFZGl0b3JWaWV3OiBFZGl0b3JWaWV3IHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIHN1Z2dlc3Rpb25BY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgc3VnZ2VzdG9yOiBTdWdnZXN0b3IgPSBuZXcgU3VnZ2VzdG9yKCk7XHJcblxyXG4gICAgcHJpdmF0ZSBpc1N1Z2dlc3RlckRlcGxveWVkKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiAhIWRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHNldEVkaXRvckV4dGVuc2lvbnMoYXBwOiBNb3NoZSkge1xyXG5cdFx0d2hpbGUgKGFwcC5lZGl0b3JFeHRlbnNpb25zLmxlbmd0aCkgYXBwLmVkaXRvckV4dGVuc2lvbnMucG9wKCk7XHJcblx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKFtcclxuXHRcdFx0Z2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbihhcHAuQ01TZXR0aW5ncyksXHJcblx0XHRcdFByZWMuaGlnaGVzdChFZGl0b3JWaWV3LmRvbUV2ZW50SGFuZGxlcnMoeyBcImtleWRvd25cIjogdGhpcy5vbktleWRvd24gfSkpLFxyXG5cdFx0XHRFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKGhhbmRsZVVwZGF0ZSksXHJcblx0XHRcdHNuaXBwZXRFeHRlbnNpb25zLFxyXG5cdFx0XSk7XHJcblx0XHR0aGlzLnJlZ2lzdGVyRGVjb3JhdGlvbnMoYXBwKVxyXG5cdFx0aWYgKGFwcC5DTVNldHRpbmdzLmNvbmNlYWxFbmFibGVkKSB7XHJcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBhcHAuQ01TZXR0aW5ncy5jb25jZWFsUmV2ZWFsVGltZW91dDtcclxuXHRcdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChta0NvbmNlYWxQbHVnaW4odGltZW91dCkuZXh0ZW5zaW9uKTtcclxuXHRcdH1cclxuXHRcdGlmIChhcHAuQ01TZXR0aW5ncy5jb2xvclBhaXJlZEJyYWNrZXRzRW5hYmxlZClcclxuXHRcdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChjb2xvclBhaXJlZEJyYWNrZXRzUGx1Z2luTG93ZXN0UHJlYyk7XHJcblx0XHRpZiAoYXBwLkNNU2V0dGluZ3MuaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNFbmFibGVkKVxyXG5cdFx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKGhpZ2hsaWdodEN1cnNvckJyYWNrZXRzUGx1Z2luLmV4dGVuc2lvbik7XHJcblx0XHRpZiAoYXBwLkNNU2V0dGluZ3MubWF0aFByZXZpZXdFbmFibGVkKVxyXG5cdFx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKFtcclxuXHRcdFx0XHRjdXJzb3JUb29sdGlwRmllbGQuZXh0ZW5zaW9uLFxyXG5cdFx0XHRcdGN1cnNvclRvb2x0aXBCYXNlVGhlbWUsXHJcblx0XHRcdFx0dG9vbHRpcHMoeyBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiIH0pLFxyXG5cdFx0XHRdKTtcclxuXHJcblxyXG5cdFx0dGhpcy5tb25pdG9yKGFwcCk7IFxyXG5cdFx0dGhpcy5zbmlwcGV0RXh0ZW5zaW9ucyhhcHApO1xyXG5cdFxyXG5cdFx0Y29uc3QgZmxhdEV4dGVuc2lvbnMgPSBhcHAuZWRpdG9yRXh0ZW5zaW9ucy5mbGF0KCk7XHJcblx0XHJcblx0XHRhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oZmxhdEV4dGVuc2lvbnMpO1xyXG5cdH1cclxuXHRcclxuXHJcbiAgICBwcml2YXRlIG1vbml0b3IoYXBwOiBNb3NoZSkge1xyXG4gICAgICAgIGFwcC5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbXHJcbiAgICAgICAgICAgIFByZWMuaGlnaGVzdChcclxuICAgICAgICAgICAgICAgIEVkaXRvclZpZXcuZG9tRXZlbnRIYW5kbGVycyh7XHJcbiAgICAgICAgICAgICAgICAgICAga2V5ZG93bjogKGV2ZW50LCB2aWV3KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25LZXlkb3duKGV2ZW50LCB2aWV3KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUuc3RhcnRzV2l0aChcIktleVwiKSAmJiAhZXZlbnQuY3RybEtleSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG5cdFx0XHRcdFx0bW91c2Vtb3ZlOiAoZXZlbnQsIHZpZXcpID0+IHtcclxuXHRcdFx0XHRcdFx0Y29uc3QgeyBjbGllbnRYLCBjbGllbnRZIH0gPSBldmVudDtcclxuXHRcdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSB2aWV3LnBvc0F0Q29vcmRzKHsgeDogY2xpZW50WCwgeTogY2xpZW50WSB9KTtcclxuXHRcclxuXHRcdFx0XHRcdFx0aWYgKHBvc2l0aW9uKSB7XHJcblx0XHRcdFx0XHRcdFx0dGhpcy5vbkN1cnNvck1vdmUoZXZlbnQsIHZpZXcpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9LFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzOiAoZXZlbnQsIHZpZXcpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVHJhY2sgdGhlIGFjdGl2ZSBlZGl0b3Igdmlld1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUVkaXRvclZpZXcgPSB2aWV3O1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApLFxyXG4gICAgICAgICAgICBFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKCh1cGRhdGUpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uICYmIHVwZGF0ZS5kb2NDaGFuZ2VkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vblRyYW5zYWN0aW9uKHVwZGF0ZS52aWV3KTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0pO1xyXG5cclxuICAgICAgICAvLyBHbG9iYWwgY2xpY2sgbGlzdGVuZXIgdG8gaGFuZGxlIHN1Z2dlc3Rpb25zXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnN1Z2dlc3Rpb25BY3RpdmUgPSB0aGlzLmlzU3VnZ2VzdGVyRGVwbG95ZWQoKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc3VnZ2VzdGlvbkFjdGl2ZSAmJiB0aGlzLmFjdGl2ZUVkaXRvclZpZXcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMub25DbGljayhldmVudCwgdGhpcy5hY3RpdmVFZGl0b3JWaWV3KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc25pcHBldEV4dGVuc2lvbnMoYXBwOiBNb3NoZSkge1xyXG5cdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXHJcblx0XHRcdHRhYnN0b3BzU3RhdGVGaWVsZC5leHRlbnNpb24sXHJcblx0XHRcdHNuaXBwZXRRdWV1ZVN0YXRlRmllbGQuZXh0ZW5zaW9uLFxyXG5cdFx0XHRzbmlwcGV0SW52ZXJ0ZWRFZmZlY3RzLFxyXG5cdFx0XSk7XHJcblx0fVxyXG5cdFxyXG5cclxuICAgIHByaXZhdGUgcmVnaXN0ZXJEZWNvcmF0aW9ucyhhcHA6IE1vc2hlKXtcclxuICAgICAgICBhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXHJcbiAgICAgICAgICAgIFZpZXdQbHVnaW4uZnJvbUNsYXNzKFJ0bEZvcmMsIHtcclxuICAgICAgICAgICAgZGVjb3JhdGlvbnM6ICh2KSA9PiB2LmRlY29yYXRpb25zLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICkpO1xyXG4gICAgfVxyXG5cdHByaXZhdGUgb25DdXJzb3JNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50LHZpZXc6IEVkaXRvclZpZXcpe1xyXG5cdFx0aWYgKCF0aGlzLmlzU3VnZ2VzdGVyRGVwbG95ZWQoKSlyZXR1cm47XHJcblx0XHRjb25zdCB7IGNsaWVudFgsIGNsaWVudFkgfSA9IGV2ZW50O1xyXG5cdFx0Y29uc3QgY29udGFpbmVyPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5zdWdnZXN0aW9uLWRyb3Bkb3duJyk/LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXHJcblx0XHRpZighY29udGFpbmVyKXJldHVyblxyXG5cdFx0aWYoY2xpZW50WCA8IGNvbnRhaW5lci5sZWZ0IHx8Y2xpZW50WCA+IGNvbnRhaW5lci5yaWdodCB8fGNsaWVudFkgPCBjb250YWluZXIudG9wIHx8Y2xpZW50WSA+IGNvbnRhaW5lci5ib3R0b20pe1xyXG5cdFx0XHRjb25zb2xlLmxvZyhcIm9mZlwiKVxyXG5cdFx0XHRyZXR1cm5cclxuXHRcdH1cclxuXHRcdGNvbnNvbGUubG9nKFwib25cIilcclxuXHRcdGNvbnN0IGRyb3Bkb3duSXRlbXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zdWdnZXN0aW9uLWl0ZW0nKSk7XHJcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZHJvcGRvd25JdGVtcykge1xyXG5cdFx0XHRjb25zdCBib3VuZHMgPSBpdGVtLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG5cdFx0XHRjb25zb2xlLmxvZyhib3VuZHMpXHJcblx0XHRcdGlmIChcclxuXHRcdFx0XHRjbGllbnRYID49IGJvdW5kcy5sZWZ0ICYmXHJcblx0XHRcdFx0Y2xpZW50WCA8PSBib3VuZHMucmlnaHQgJiZcclxuXHRcdFx0XHRjbGllbnRZID49IGJvdW5kcy50b3AgJiZcclxuXHRcdFx0XHRjbGllbnRZIDw9IGJvdW5kcy5ib3R0b21cclxuXHRcdFx0KSB7XHJcblx0XHRcdFx0Y29uc29sZS5sb2coJ0N1cnNvciBpcyB3aXRoaW4gZHJvcGRvd24gaXRlbTonLCBpdGVtKTtcclxuXHRcclxuXHRcdFx0XHRyZXR1cm47IC8vIFN0b3AgY2hlY2tpbmcgb25jZSB3ZSBmaW5kIHRoZSByZWxldmFudCBpdGVtXHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblx0cHJpdmF0ZSBvbkNsaWNrPShldmVudDogTW91c2VFdmVudCx2aWV3OiBFZGl0b3JWaWV3KT0+e1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkl0ZW1zID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKTtcclxuXHRcclxuXHRcdC8vIENoZWNrIGlmIHRoZSBjbGljayBpcyBvbiBhIHN1Z2dlc3Rpb24gaXRlbVxyXG5cdFx0Y29uc3QgY2xpY2tlZFN1Z2dlc3Rpb24gPSBBcnJheS5mcm9tKHN1Z2dlc3Rpb25JdGVtcykuZmluZCgoaXRlbSkgPT5cclxuXHRcdFx0aXRlbS5jb250YWlucyhldmVudC50YXJnZXQgYXMgTm9kZSlcclxuXHRcdCk7XHJcblx0XHRpZiAoY2xpY2tlZFN1Z2dlc3Rpb24pIHtcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3Iuc2VsZWN0RHJvcGRvd25JdGVtKGNsaWNrZWRTdWdnZXN0aW9uLHZpZXcpO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgZHJvcGRvd25JdGVtID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yKFwiLnN1Z2dlc3Rpb24tZHJvcGRvd25cIik7XHJcblx0XHRjb25zdCBjbGlja2VkRHJvcGRvd24gPSBBcnJheS5mcm9tKHN1Z2dlc3Rpb25JdGVtcykuZmluZCgoaXRlbSkgPT5cclxuXHRcdFx0aXRlbS5jb250YWlucyhldmVudC50YXJnZXQgYXMgTm9kZSlcclxuXHRcdCk7XHJcblx0XHRpZighY2xpY2tlZERyb3Bkb3duKXtcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3IucmVtb3ZlU3VnZ2VzdG9yKClcclxuXHRcdH1cclxuXHRcdFxyXG5cdH1cclxuXHRwcml2YXRlIG9uVHJhbnNhY3Rpb249KHZpZXc6IEVkaXRvclZpZXcpPT4ge1xyXG5cdFx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHRcdGlmIChjdHguY29kZWJsb2NrTGFuZ3VhZ2UgPT09IFwidGlrelwiKSB7XHJcblx0XHRcdHRoaXMuc3VnZ2VzdG9yLmRlcGxveVN1Z2dlc3RvcihjdHgsdmlldylcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgb25LZXlkb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50LCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XHJcblx0XHRsZXQga2V5ID0gZXZlbnQua2V5O1xyXG5cdFx0bGV0IHRyaWdnZXJcclxuXHRcdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblx0XHRpZiAoIShldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkpICYmIChjdHgubW9kZS5pbk1hdGgoKSAmJiAoIWN0eC5pblRleHRFbnZpcm9ubWVudCgpIHx8IGN0eC5jb2RlYmxvY2tMYW5ndWFnZS5tYXRjaCgvKHRpa3opLykpKSkge1xyXG5cdFx0ICB0cmlnZ2VyID0ga2V5Ym9hcmRBdXRvUmVwbGFjZUhlYnJld1RvRW5nbGlzaFRyaWdnZXJzLmZpbmQoKHRyaWdnZXIyKSA9PiB0cmlnZ2VyMi5rZXkgPT09IGV2ZW50LmtleSAmJiB0cmlnZ2VyMi5jb2RlID09PSBldmVudC5jb2RlKTtcclxuXHRcdCAga2V5ID0gdHJpZ2dlcj8ucmVwbGFjZW1lbnR8fGtleTtcclxuXHRcdH1cclxuXHRcdGlmKHRoaXMuc3VnZ2VzdG9yLmlzU3VnZ2VzdGVyRGVwbG95ZWQpe1xyXG5cdFx0XHRoYW5kbGVEcm9wZG93bk5hdmlnYXRpb24oZXZlbnQsdmlldyx0aGlzLnN1Z2dlc3RvcilcclxuXHRcdH1cclxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBoYW5kbGVLZXlkb3duKGtleSwgZXZlbnQuc2hpZnRLZXksIGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSwgaXNDb21wb3NpbmcodmlldywgZXZlbnQpLCB2aWV3KTtcclxuXHRcdGlmIChzdWNjZXNzKSBcclxuXHRcdCAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdGVsc2UgaWYgKGtleSAhPT0gZXZlbnQua2V5JiZ0cmlnZ2VyKSB7XHJcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0XHRcdGtleSA9IHRyaWdnZXIucmVwbGFjZW1lbnQ7XHJcblx0XHRcdHJlcGxhY2VSYW5nZSh2aWV3LHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uZnJvbSx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLnRvLGtleSlcclxuXHRcdFx0c2V0Q3Vyc29yKHZpZXcsdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5mcm9tK2tleS5sZW5ndGgpXHJcblx0ICB9XHJcblx0fTtcclxuXHJcblx0cHJpdmF0ZSBkZWNvcmF0KCl7XHJcblxyXG5cdH1cclxufVxyXG5jb25zdCBoYW5kbGVVcGRhdGUgPSAodXBkYXRlOiBWaWV3VXBkYXRlKSA9PiB7XHJcblx0Y29uc3Qgc2V0dGluZ3MgPSBnZXRMYXRleFN1aXRlQ29uZmlnKHVwZGF0ZS5zdGF0ZSk7XHJcblxyXG5cdC8vIFRoZSBtYXRoIHRvb2x0aXAgaGFuZGxlciBpcyBkcml2ZW4gYnkgdmlldyB1cGRhdGVzIGJlY2F1c2UgaXQgdXRpbGl6ZXNcclxuXHQvLyBpbmZvcm1hdGlvbiBhYm91dCB2aXN1YWwgbGluZSwgd2hpY2ggaXMgbm90IGF2YWlsYWJsZSBpbiBFZGl0b3JTdGF0ZVxyXG5cdGlmIChzZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpIHtcclxuXHRcdGhhbmRsZU1hdGhUb29sdGlwKHVwZGF0ZSk7XHJcblx0fVxyXG5cclxuXHRoYW5kbGVVbmRvUmVkbyh1cGRhdGUpO1xyXG59XHJcblxyXG5jb25zdCBoYW5kbGVEcm9wZG93bk5hdmlnYXRpb249KGV2ZW50OiBLZXlib2FyZEV2ZW50LHZpZXc6RWRpdG9yVmlldyxzdWdnZXN0b3I6IFN1Z2dlc3Rvcik9PntcclxuXHRjb25zdCBpdGVtcyA9IHN1Z2dlc3Rvci5nZXRBbGxkcm9wZG93bkl0ZW1zKCk7XHJcblx0c3dpdGNoICh0cnVlKSB7XHJcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd0Rvd25cIjpcclxuXHRcdFx0c3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ID0gKHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCArIDEpICUgaXRlbXMubGVuZ3RoO1xyXG5cdFx0XHRzdWdnZXN0b3IudXBkYXRlU2VsZWN0aW9uKGl0ZW1zKTtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd1VwXCI6XHJcblx0XHRcdHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCA9IChzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXggLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcclxuXHRcdFx0c3VnZ2VzdG9yLnVwZGF0ZVNlbGVjdGlvbihpdGVtcyk7XHJcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0XHRcdGJyZWFrO1xyXG5cdFx0Y2FzZSBldmVudC5rZXkgPT09IFwiQXJyb3dMZWZ0XCJ8fGV2ZW50LmtleSA9PT0gXCJBcnJvd1JpZ2h0XCI6XHJcblx0XHRcdHN1Z2dlc3Rvci5yZW1vdmVTdWdnZXN0b3IoKTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJCYWNrc3BhY2VcIjpcclxuXHRcdFx0c3VnZ2VzdG9yLnJlbW92ZVN1Z2dlc3RvcigpO1xyXG5cdFx0XHQvL3N1Z2dlc3Rvci5kZXBsb3lTdWdnZXN0b3IoY3R4LHZpZXcpXHJcblx0XHRcdGJyZWFrO1xyXG5cdFx0ZGVmYXVsdDpcclxuXHRcdFx0YnJlYWs7XHJcblx0fVxyXG5cdGlmIChldmVudC5rZXkgPT09IFwiQXJyb3dEb3duXCIpIHtcclxuXHRcdFxyXG5cdH1lbHNlIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIikge1xyXG5cdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gaXRlbXNbc3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4XTtcclxuXHRcdHN1Z2dlc3Rvci5zZWxlY3REcm9wZG93bkl0ZW0oc2VsZWN0ZWRJdGVtLHZpZXcpO1xyXG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHR9IC8qZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XHJcblx0XHRkcm9wZG93bi5yZW1vdmUoKTtcclxuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0fSovXHJcbn1cclxuXHJcblxyXG5leHBvcnQgY29uc3QgaGFuZGxlS2V5ZG93biA9IChrZXk6IHN0cmluZywgc2hpZnRLZXk6IGJvb2xlYW4sIGN0cmxLZXk6IGJvb2xlYW4sIGlzSU1FOiBib29sZWFuLCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XHJcblxyXG5cdGNvbnN0IHNldHRpbmdzID0gZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh2aWV3KTtcclxuXHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xyXG5cclxuXHRsZXQgc3VjY2VzcyA9IGZhbHNlO1xyXG5cclxuXHQvKlxyXG5cdCogV2hlbiBiYWNrc3BhY2UgaXMgcHJlc3NlZCwgaWYgdGhlIGN1cnNvciBpcyBpbnNpZGUgYW4gZW1wdHkgaW5saW5lIG1hdGgsXHJcblx0KiBkZWxldGUgYm90aCAkIHN5bWJvbHMsIG5vdCBqdXN0IHRoZSBmaXJzdCBvbmUuXHJcblx0Ki9cclxuXHRpZiAoc2V0dGluZ3MuYXV0b0RlbGV0ZSQgJiYga2V5ID09PSBcIkJhY2tzcGFjZVwiICYmIGN0eC5tb2RlLmluTWF0aCgpKSB7XHJcblx0XHRjb25zdCBjaGFyQXRQb3MgPSBnZXRDaGFyYWN0ZXJBdFBvcyh2aWV3LCBjdHgucG9zKTtcclxuXHRcdGNvbnN0IGNoYXJBdFByZXZQb3MgPSBnZXRDaGFyYWN0ZXJBdFBvcyh2aWV3LCBjdHgucG9zIC0gMSk7XHJcblxyXG5cdFx0aWYgKGNoYXJBdFBvcyA9PT0gXCIkXCIgJiYgY2hhckF0UHJldlBvcyA9PT0gXCIkXCIpIHtcclxuXHRcdFx0cmVwbGFjZVJhbmdlKHZpZXcsIGN0eC5wb3MgLSAxLCBjdHgucG9zICsgMSwgXCJcIik7XHJcblx0XHRcdC8vIE5vdGU6IG5vdCBzdXJlIGlmIHJlbW92ZUFsbFRhYnN0b3BzIGlzIG5lY2Vzc2FyeVxyXG5cdFx0XHRyZW1vdmVBbGxUYWJzdG9wcyh2aWV3KTtcclxuXHRcdFx0cmV0dXJuIHRydWU7XHJcblx0XHR9XHJcblx0fVxyXG5cdFxyXG5cdGlmIChzZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQpIHtcclxuXHJcblx0XHQvLyBQcmV2ZW50IElNRSBmcm9tIHRyaWdnZXJpbmcga2V5ZG93biBldmVudHMuXHJcblx0XHRpZiAoc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FICYmIGlzSU1FKSByZXR1cm47XHJcblxyXG5cdFx0Ly8gQWxsb3dzIEN0cmwgKyB6IGZvciB1bmRvLCBpbnN0ZWFkIG9mIHRyaWdnZXJpbmcgYSBzbmlwcGV0IGVuZGluZyB3aXRoIHpcclxuXHRcdGlmICghY3RybEtleSkge1xyXG5cdFx0XHR0cnkge1xyXG5cdFx0XHRcdHN1Y2Nlc3MgPSBydW5TbmlwcGV0cyh2aWV3LCBjdHgsIGtleSk7XHJcblx0XHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdFx0XHR9XHJcblx0XHRcdGNhdGNoIChlKSB7XHJcblx0XHRcdFx0Y2xlYXJTbmlwcGV0UXVldWUodmlldyk7XHJcblx0XHRcdFx0Y29uc29sZS5lcnJvcihlKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0aWYgKGtleSA9PT0gXCJUYWJcIikge1xyXG5cdFx0c3VjY2VzcyA9IHNldFNlbGVjdGlvblRvTmV4dFRhYnN0b3Aodmlldyk7XHJcblxyXG5cdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdH1cclxuXHJcblx0aWYgKHNldHRpbmdzLmF1dG9mcmFjdGlvbkVuYWJsZWQgJiYgY3R4Lm1vZGUuc3RyaWN0bHlJbk1hdGgoKSkge1xyXG5cdFx0aWYgKGtleSA9PT0gXCIvXCIpIHtcclxuXHRcdFx0c3VjY2VzcyA9IHJ1bkF1dG9GcmFjdGlvbih2aWV3LCBjdHgpO1xyXG5cclxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0aWYgKHNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQgJiYgY3R4Lm1vZGUuYmxvY2tNYXRoKSB7XHJcblx0XHRpZiAoW1wiVGFiXCIsIFwiRW50ZXJcIl0uY29udGFpbnMoa2V5KSkge1xyXG5cdFx0XHRzdWNjZXNzID0gcnVuTWF0cml4U2hvcnRjdXRzKHZpZXcsIGN0eCwga2V5LCBzaGlmdEtleSk7XHJcblxyXG5cdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRpZiAoc2V0dGluZ3MudGFib3V0RW5hYmxlZCkge1xyXG5cdFx0aWYgKGtleSA9PT0gXCJUYWJcIiB8fCBzaG91bGRUYWJvdXRCeUNsb3NlQnJhY2tldCh2aWV3LCBrZXkpKSB7XHJcblx0XHRcdHN1Y2Nlc3MgPSB0YWJvdXQodmlldywgY3R4KTtcclxuXHJcblx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiBmYWxzZTtcclxufSJdfQ==