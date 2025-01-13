import { EditorView, ViewPlugin, tooltips, } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { Context } from "./utils/context";
import { isComposing, replaceRange, setCursor } from "./editor utilities/editor_utils";
import { keyboardAutoReplaceHebrewToEnglishTriggers } from "./staticData/mathParserStaticData";
import { getCharacterAtPos, Suggestor } from "./suggestor";
import { RtlForc } from "./editorDecorations";
import { setSelectionToNextTabstop } from "./snippets/snippet_management";
import { runSnippets } from "./features/run_snippets";
import { getLatexSuiteConfig, getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { runAutoFraction } from "./features/autofraction";
import { runMatrixShortcuts } from "./features/matrix_shortcuts";
import { shouldTaboutByCloseBracket, tabout } from "./features/tabout";
import { snippetExtensions } from "./snippets/codemirror/extensions";
import { colorPairedBracketsPluginLowestPrec, highlightCursorBracketsPlugin } from "./editor_extensions/highlight_brackets";
import { mkConcealPlugin } from "./editor_extensions/conceal";
import { cursorTooltipBaseTheme, cursorTooltipField, handleMathTooltip } from "./editor_extensions/math_tooltip";
import { removeAllTabstops, tabstopsStateField } from "./snippets/codemirror/tabstops_state_field";
import { clearSnippetQueue, snippetQueueStateField } from "./snippets/codemirror/snippet_queue_state_field";
import { handleUndoRedo, snippetInvertedEffects } from "./snippets/codemirror/history";
/*
class="cm-gutters" aria-hidden="true" style="min-height: 7865px; position: sticky;"
spellcheck="false" autocorrect="off" translate="no" contenteditable="true"

*/
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
        app.editorExtensions.push(colorPairedBracketsPluginLowestPrec);
        app.editorExtensions.push(highlightCursorBracketsPlugin.extension);
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
                    /*const { clientX, clientY } = event;
                    const position = view.posAtCoords({ x: clientX, y: clientY });

                    if (position) {
                        //this.onCursorMove(event, view);
                    }*/
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
        document.addEventListener('mousemove', (event) => {
            this.suggestionActive = this.isSuggesterDeployed();
            if (this.suggestionActive && this.activeEditorView) {
                this.onCursorMove(event, this.activeEditorView);
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
        const suggestionItems = document.body.querySelectorAll(".suggestion-item");
        const clickedSuggestion = Array.from(suggestionItems).find((item) => item.contains(event.target));
        if (clickedSuggestion) {
            const index = Array.from(suggestionItems).indexOf(clickedSuggestion);
            this.suggestor.selectionIndex = index;
            this.suggestor.updateSelection(suggestionItems);
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
        if (!(event.ctrlKey || event.metaKey) && ctx.shouldTranslate()) {
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
    if (ctx.mode.strictlyInMath()) {
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
    if (key === "Tab" && shiftKey) {
        success = tabout(view, ctx, -1);
        if (success)
            return true;
    }
    else if (key === "Tab" || shouldTaboutByCloseBracket(view, key)) {
        success = tabout(view, ctx, 1);
        if (success)
            return true;
    }
    return false;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0RWRpdG9yRXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXRFZGl0b3JFeHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUEwQixRQUFRLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQztBQUM3RixPQUFPLEVBQWUsSUFBSSxFQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVILE9BQU8sRUFBRSxlQUFlLEVBQUUs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QUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDakUsT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlCLElBQUksT0FBTztZQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzFCLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBNb3NoZSBmcm9tIFwiLi9tYWluXCI7XHJcbmltcG9ydCB7IGdldFRpa3pTdWdnZXN0aW9ucywgTGF0ZXggfSBmcm9tIFwiLi91dGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1BsdWdpbiwgVmlld1VwZGF0ZSAsRGVjb3JhdGlvbiwgdG9vbHRpcHMsIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFByZWMsRXh0ZW5zaW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XHJcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tIFwiLi91dGlscy9jb250ZXh0XCI7XHJcbmltcG9ydCB7IGlzQ29tcG9zaW5nLCByZXBsYWNlUmFuZ2UsIHNldEN1cnNvciB9IGZyb20gXCIuL2VkaXRvciB1dGlsaXRpZXMvZWRpdG9yX3V0aWxzXCI7XHJcbmltcG9ydCB7IGtleWJvYXJkQXV0b1JlcGxhY2VIZWJyZXdUb0VuZ2xpc2hUcmlnZ2VycyB9IGZyb20gXCIuL3N0YXRpY0RhdGEvbWF0aFBhcnNlclN0YXRpY0RhdGFcIjtcclxuaW1wb3J0IHsgZ2V0Q2hhcmFjdGVyQXRQb3MsIFN1Z2dlc3RvciB9IGZyb20gXCIuL3N1Z2dlc3RvclwiO1xyXG5pbXBvcnQgeyBSdGxGb3JjIH0gZnJvbSBcIi4vZWRpdG9yRGVjb3JhdGlvbnNcIjtcclxuaW1wb3J0IHsgc2V0U2VsZWN0aW9uVG9OZXh0VGFic3RvcCB9IGZyb20gXCIuL3NuaXBwZXRzL3NuaXBwZXRfbWFuYWdlbWVudFwiO1xyXG5cclxuaW1wb3J0IHsgcnVuU25pcHBldHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9ydW5fc25pcHBldHNcIjtcclxuaW1wb3J0IHsgZ2V0TGF0ZXhTdWl0ZUNvbmZpZywgZ2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbiB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvY29uZmlnXCI7XHJcbmltcG9ydCB7IHJ1bkF1dG9GcmFjdGlvbiB9IGZyb20gXCIuL2ZlYXR1cmVzL2F1dG9mcmFjdGlvblwiO1xyXG5pbXBvcnQgeyBydW5NYXRyaXhTaG9ydGN1dHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9tYXRyaXhfc2hvcnRjdXRzXCI7XHJcbmltcG9ydCB7IHNob3VsZFRhYm91dEJ5Q2xvc2VCcmFja2V0LCB0YWJvdXQgfSBmcm9tIFwiLi9mZWF0dXJlcy90YWJvdXRcIjtcclxuaW1wb3J0IHsgc25pcHBldEV4dGVuc2lvbnMgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL2V4dGVuc2lvbnNcIjtcclxuaW1wb3J0IHsgY29sb3JQYWlyZWRCcmFja2V0c1BsdWdpbkxvd2VzdFByZWMsIGhpZ2hsaWdodEN1cnNvckJyYWNrZXRzUGx1Z2luIH0gZnJvbSBcIi4vZWRpdG9yX2V4dGVuc2lvbnMvaGlnaGxpZ2h0X2JyYWNrZXRzXCI7XHJcbmltcG9ydCB7IG1rQ29uY2VhbFBsdWdpbiB9IGZyb20gXCIuL2VkaXRvcl9leHRlbnNpb25zL2NvbmNlYWxcIjtcclxuaW1wb3J0IHsgY3Vyc29yVG9vbHRpcEJhc2VUaGVtZSwgY3Vyc29yVG9vbHRpcEZpZWxkLCBoYW5kbGVNYXRoVG9vbHRpcCB9IGZyb20gXCIuL2VkaXRvcl9leHRlbnNpb25zL21hdGhfdG9vbHRpcFwiO1xyXG5pbXBvcnQgeyBjb250ZXh0IH0gZnJvbSBcImVzYnVpbGQtd2FzbVwiO1xyXG5pbXBvcnQgeyByZW1vdmVBbGxUYWJzdG9wcywgdGFic3RvcHNTdGF0ZUZpZWxkIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci90YWJzdG9wc19zdGF0ZV9maWVsZFwiO1xyXG5pbXBvcnQgeyBjbGVhclNuaXBwZXRRdWV1ZSwgc25pcHBldFF1ZXVlU3RhdGVGaWVsZCB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3Ivc25pcHBldF9xdWV1ZV9zdGF0ZV9maWVsZFwiO1xyXG5pbXBvcnQgeyBoYW5kbGVVbmRvUmVkbywgc25pcHBldEludmVydGVkRWZmZWN0cyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvaGlzdG9yeVwiO1xyXG5cclxuXHJcbi8qXHJcbmNsYXNzPVwiY20tZ3V0dGVyc1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiIHN0eWxlPVwibWluLWhlaWdodDogNzg2NXB4OyBwb3NpdGlvbjogc3RpY2t5O1wiXHJcbnNwZWxsY2hlY2s9XCJmYWxzZVwiIGF1dG9jb3JyZWN0PVwib2ZmXCIgdHJhbnNsYXRlPVwibm9cIiBjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJcclxuXHJcbiovXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBFZGl0b3JFeHRlbnNpb25zIHtcclxuICAgIHByaXZhdGUgc2hvdWxkTGlzdGVuRm9yVHJhbnNhY3Rpb246IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgYWN0aXZlRWRpdG9yVmlldzogRWRpdG9yVmlldyB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBzdWdnZXN0aW9uQWN0aXZlOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIHN1Z2dlc3RvcjogU3VnZ2VzdG9yID0gbmV3IFN1Z2dlc3RvcigpO1xyXG5cclxuICAgIHByaXZhdGUgaXNTdWdnZXN0ZXJEZXBsb3llZCgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gISFkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCIuc3VnZ2VzdGlvbi1kcm9wZG93blwiKTtcclxuICAgIH1cclxuXHJcbiAgICBzZXRFZGl0b3JFeHRlbnNpb25zKGFwcDogTW9zaGUpIHtcclxuXHRcdHdoaWxlIChhcHAuZWRpdG9yRXh0ZW5zaW9ucy5sZW5ndGgpIGFwcC5lZGl0b3JFeHRlbnNpb25zLnBvcCgpO1xyXG5cdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXHJcblx0XHRcdGdldExhdGV4U3VpdGVDb25maWdFeHRlbnNpb24oYXBwLkNNU2V0dGluZ3MpLFxyXG5cdFx0XHRQcmVjLmhpZ2hlc3QoRWRpdG9yVmlldy5kb21FdmVudEhhbmRsZXJzKHsgXCJrZXlkb3duXCI6IHRoaXMub25LZXlkb3duIH0pKSxcclxuXHRcdFx0RWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZihoYW5kbGVVcGRhdGUpLFxyXG5cdFx0XHRzbmlwcGV0RXh0ZW5zaW9ucyxcclxuXHRcdF0pO1xyXG5cdFx0dGhpcy5yZWdpc3RlckRlY29yYXRpb25zKGFwcClcclxuXHRcdGlmIChhcHAuQ01TZXR0aW5ncy5jb25jZWFsRW5hYmxlZCkge1xyXG5cdFx0XHRjb25zdCB0aW1lb3V0ID0gYXBwLkNNU2V0dGluZ3MuY29uY2VhbFJldmVhbFRpbWVvdXQ7XHJcblx0XHRcdGFwcC5lZGl0b3JFeHRlbnNpb25zLnB1c2gobWtDb25jZWFsUGx1Z2luKHRpbWVvdXQpLmV4dGVuc2lvbik7XHJcblx0XHR9XHJcblx0XHRcdGFwcC5lZGl0b3JFeHRlbnNpb25zLnB1c2goY29sb3JQYWlyZWRCcmFja2V0c1BsdWdpbkxvd2VzdFByZWMpO1xyXG5cdFx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKGhpZ2hsaWdodEN1cnNvckJyYWNrZXRzUGx1Z2luLmV4dGVuc2lvbik7XHJcblx0XHRcdGFwcC5lZGl0b3JFeHRlbnNpb25zLnB1c2goW1xyXG5cdFx0XHRcdGN1cnNvclRvb2x0aXBGaWVsZC5leHRlbnNpb24sXHJcblx0XHRcdFx0Y3Vyc29yVG9vbHRpcEJhc2VUaGVtZSxcclxuXHRcdFx0XHR0b29sdGlwcyh7IHBvc2l0aW9uOiBcImFic29sdXRlXCIgfSksXHJcblx0XHRcdF0pO1xyXG5cclxuXHRcdHRoaXMubW9uaXRvcihhcHApOyBcclxuXHRcdHRoaXMuc25pcHBldEV4dGVuc2lvbnMoYXBwKTtcclxuXHRcclxuXHRcdGNvbnN0IGZsYXRFeHRlbnNpb25zID0gYXBwLmVkaXRvckV4dGVuc2lvbnMuZmxhdCgpO1xyXG5cdFxyXG5cdFx0YXBwLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKGZsYXRFeHRlbnNpb25zKTtcclxuXHR9XHJcblx0XHJcblxyXG4gICAgcHJpdmF0ZSBtb25pdG9yKGFwcDogTW9zaGUpIHtcclxuICAgICAgICBhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oW1xyXG4gICAgICAgICAgICBQcmVjLmhpZ2hlc3QoXHJcbiAgICAgICAgICAgICAgICBFZGl0b3JWaWV3LmRvbUV2ZW50SGFuZGxlcnMoe1xyXG4gICAgICAgICAgICAgICAgICAgIGtleWRvd246IChldmVudCwgdmlldykgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9uS2V5ZG93bihldmVudCwgdmlldyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5jb2RlLnN0YXJ0c1dpdGgoXCJLZXlcIikgJiYgIWV2ZW50LmN0cmxLZXkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2hvdWxkTGlzdGVuRm9yVHJhbnNhY3Rpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuXHRcdFx0XHRcdG1vdXNlbW92ZTogKGV2ZW50LCB2aWV3KSA9PiB7XHJcblx0XHRcdFx0XHRcdC8qY29uc3QgeyBjbGllbnRYLCBjbGllbnRZIH0gPSBldmVudDtcclxuXHRcdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSB2aWV3LnBvc0F0Q29vcmRzKHsgeDogY2xpZW50WCwgeTogY2xpZW50WSB9KTtcclxuXHRcclxuXHRcdFx0XHRcdFx0aWYgKHBvc2l0aW9uKSB7XHJcblx0XHRcdFx0XHRcdFx0Ly90aGlzLm9uQ3Vyc29yTW92ZShldmVudCwgdmlldyk7XHJcblx0XHRcdFx0XHRcdH0qL1xyXG5cdFx0XHRcdFx0fSxcclxuICAgICAgICAgICAgICAgICAgICBmb2N1czogKGV2ZW50LCB2aWV3KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRyYWNrIHRoZSBhY3RpdmUgZWRpdG9yIHZpZXdcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVFZGl0b3JWaWV3ID0gdmlldztcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgRWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZigodXBkYXRlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiAmJiB1cGRhdGUuZG9jQ2hhbmdlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub25UcmFuc2FjdGlvbih1cGRhdGUudmlldyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgLy8gR2xvYmFsIGNsaWNrIGxpc3RlbmVyIHRvIGhhbmRsZSBzdWdnZXN0aW9uc1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zdWdnZXN0aW9uQWN0aXZlID0gdGhpcy5pc1N1Z2dlc3RlckRlcGxveWVkKCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnN1Z2dlc3Rpb25BY3RpdmUgJiYgdGhpcy5hY3RpdmVFZGl0b3JWaWV3KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uQ2xpY2soZXZlbnQsIHRoaXMuYWN0aXZlRWRpdG9yVmlldyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIChldmVudCkgPT4ge1xyXG5cdFx0XHR0aGlzLnN1Z2dlc3Rpb25BY3RpdmUgPSB0aGlzLmlzU3VnZ2VzdGVyRGVwbG95ZWQoKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc3VnZ2VzdGlvbkFjdGl2ZSAmJiB0aGlzLmFjdGl2ZUVkaXRvclZpZXcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMub25DdXJzb3JNb3ZlKGV2ZW50LCB0aGlzLmFjdGl2ZUVkaXRvclZpZXcpXHJcbiAgICAgICAgICAgIH1cclxuXHRcdH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc25pcHBldEV4dGVuc2lvbnMoYXBwOiBNb3NoZSkge1xyXG5cdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXHJcblx0XHRcdHRhYnN0b3BzU3RhdGVGaWVsZC5leHRlbnNpb24sXHJcblx0XHRcdHNuaXBwZXRRdWV1ZVN0YXRlRmllbGQuZXh0ZW5zaW9uLFxyXG5cdFx0XHRzbmlwcGV0SW52ZXJ0ZWRFZmZlY3RzLFxyXG5cdFx0XSk7XHJcblx0fVxyXG5cdFxyXG5cclxuICAgIHByaXZhdGUgcmVnaXN0ZXJEZWNvcmF0aW9ucyhhcHA6IE1vc2hlKXtcclxuICAgICAgICBhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXHJcbiAgICAgICAgICAgIFZpZXdQbHVnaW4uZnJvbUNsYXNzKFJ0bEZvcmMsIHtcclxuICAgICAgICAgICAgZGVjb3JhdGlvbnM6ICh2KSA9PiB2LmRlY29yYXRpb25zLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICkpO1xyXG4gICAgfVxyXG5cdHByaXZhdGUgb25DdXJzb3JNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50LHZpZXc6IEVkaXRvclZpZXcpe1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkl0ZW1zID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKTtcclxuXHJcblx0XHRjb25zdCBjbGlja2VkU3VnZ2VzdGlvbiA9IEFycmF5LmZyb20oc3VnZ2VzdGlvbkl0ZW1zKS5maW5kKChpdGVtKSA9PlxyXG5cdFx0XHRpdGVtLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxyXG5cdFx0KTtcclxuXHRcdGlmIChjbGlja2VkU3VnZ2VzdGlvbikge1xyXG5cdFx0XHRjb25zdCBpbmRleCA9IEFycmF5LmZyb20oc3VnZ2VzdGlvbkl0ZW1zKS5pbmRleE9mKGNsaWNrZWRTdWdnZXN0aW9uKTtcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXg9aW5kZXhcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3IudXBkYXRlU2VsZWN0aW9uKHN1Z2dlc3Rpb25JdGVtcylcclxuXHRcdH1cclxuXHR9XHJcblx0cHJpdmF0ZSBvbkNsaWNrPShldmVudDogTW91c2VFdmVudCx2aWV3OiBFZGl0b3JWaWV3KT0+e1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkl0ZW1zID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKTtcclxuXHRcclxuXHRcdC8vIENoZWNrIGlmIHRoZSBjbGljayBpcyBvbiBhIHN1Z2dlc3Rpb24gaXRlbVxyXG5cdFx0Y29uc3QgY2xpY2tlZFN1Z2dlc3Rpb24gPSBBcnJheS5mcm9tKHN1Z2dlc3Rpb25JdGVtcykuZmluZCgoaXRlbSkgPT5cclxuXHRcdFx0aXRlbS5jb250YWlucyhldmVudC50YXJnZXQgYXMgTm9kZSlcclxuXHRcdCk7XHJcblx0XHRpZiAoY2xpY2tlZFN1Z2dlc3Rpb24pIHtcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3Iuc2VsZWN0RHJvcGRvd25JdGVtKGNsaWNrZWRTdWdnZXN0aW9uLHZpZXcpO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgZHJvcGRvd25JdGVtID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yKFwiLnN1Z2dlc3Rpb24tZHJvcGRvd25cIik7XHJcblx0XHRjb25zdCBjbGlja2VkRHJvcGRvd24gPSBBcnJheS5mcm9tKHN1Z2dlc3Rpb25JdGVtcykuZmluZCgoaXRlbSkgPT5cclxuXHRcdFx0aXRlbS5jb250YWlucyhldmVudC50YXJnZXQgYXMgTm9kZSlcclxuXHRcdCk7XHJcblx0XHRpZighY2xpY2tlZERyb3Bkb3duKXtcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3IucmVtb3ZlU3VnZ2VzdG9yKClcclxuXHRcdH1cclxuXHRcdFxyXG5cdH1cclxuXHRwcml2YXRlIG9uVHJhbnNhY3Rpb249KHZpZXc6IEVkaXRvclZpZXcpPT4ge1xyXG5cdFx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHRcdGlmIChjdHguY29kZWJsb2NrTGFuZ3VhZ2UgPT09IFwidGlrelwiKSB7XHJcblx0XHRcdHRoaXMuc3VnZ2VzdG9yLmRlcGxveVN1Z2dlc3RvcihjdHgsdmlldylcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgb25LZXlkb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50LCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XHJcblx0XHRsZXQga2V5ID0gZXZlbnQua2V5O1xyXG5cdFx0bGV0IHRyaWdnZXJcclxuXHRcdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblx0XHRpZiAoIShldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkpICYmIGN0eC5zaG91bGRUcmFuc2xhdGUoKSkge1xyXG5cdFx0ICB0cmlnZ2VyID0ga2V5Ym9hcmRBdXRvUmVwbGFjZUhlYnJld1RvRW5nbGlzaFRyaWdnZXJzLmZpbmQoKHRyaWdnZXIyKSA9PiB0cmlnZ2VyMi5rZXkgPT09IGV2ZW50LmtleSAmJiB0cmlnZ2VyMi5jb2RlID09PSBldmVudC5jb2RlKTtcclxuXHRcdCAga2V5ID0gdHJpZ2dlcj8ucmVwbGFjZW1lbnR8fGtleTtcclxuXHRcdH1cclxuXHRcdGlmKHRoaXMuc3VnZ2VzdG9yLmlzU3VnZ2VzdGVyRGVwbG95ZWQpe1xyXG5cdFx0XHRoYW5kbGVEcm9wZG93bk5hdmlnYXRpb24oZXZlbnQsdmlldyx0aGlzLnN1Z2dlc3RvcilcclxuXHRcdH1cclxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBoYW5kbGVLZXlkb3duKGtleSwgZXZlbnQuc2hpZnRLZXksIGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSwgaXNDb21wb3NpbmcodmlldywgZXZlbnQpLCB2aWV3KTtcclxuXHRcdGlmIChzdWNjZXNzKSBcclxuXHRcdCAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdGVsc2UgaWYgKGtleSAhPT0gZXZlbnQua2V5JiZ0cmlnZ2VyKSB7XHJcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0XHRcdGtleSA9IHRyaWdnZXIucmVwbGFjZW1lbnQ7XHJcblx0XHRcdHJlcGxhY2VSYW5nZSh2aWV3LHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uZnJvbSx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLnRvLGtleSlcclxuXHRcdFx0c2V0Q3Vyc29yKHZpZXcsdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5mcm9tK2tleS5sZW5ndGgpXHJcblx0ICB9XHJcblx0fTtcclxuXHJcblx0cHJpdmF0ZSBkZWNvcmF0KCl7XHJcblxyXG5cdH1cclxufVxyXG5jb25zdCBoYW5kbGVVcGRhdGUgPSAodXBkYXRlOiBWaWV3VXBkYXRlKSA9PiB7XHJcblx0Y29uc3Qgc2V0dGluZ3MgPSBnZXRMYXRleFN1aXRlQ29uZmlnKHVwZGF0ZS5zdGF0ZSk7XHJcblxyXG5cdC8vIFRoZSBtYXRoIHRvb2x0aXAgaGFuZGxlciBpcyBkcml2ZW4gYnkgdmlldyB1cGRhdGVzIGJlY2F1c2UgaXQgdXRpbGl6ZXNcclxuXHQvLyBpbmZvcm1hdGlvbiBhYm91dCB2aXN1YWwgbGluZSwgd2hpY2ggaXMgbm90IGF2YWlsYWJsZSBpbiBFZGl0b3JTdGF0ZVxyXG5cdGlmIChzZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpIHtcclxuXHRcdGhhbmRsZU1hdGhUb29sdGlwKHVwZGF0ZSk7XHJcblx0fVxyXG5cclxuXHRoYW5kbGVVbmRvUmVkbyh1cGRhdGUpO1xyXG59XHJcblxyXG5jb25zdCBoYW5kbGVEcm9wZG93bk5hdmlnYXRpb249KGV2ZW50OiBLZXlib2FyZEV2ZW50LHZpZXc6RWRpdG9yVmlldyxzdWdnZXN0b3I6IFN1Z2dlc3Rvcik9PntcclxuXHRjb25zdCBpdGVtcyA9IHN1Z2dlc3Rvci5nZXRBbGxkcm9wZG93bkl0ZW1zKCk7XHJcblx0c3dpdGNoICh0cnVlKSB7XHJcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd0Rvd25cIjpcclxuXHRcdFx0c3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ID0gKHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCArIDEpICUgaXRlbXMubGVuZ3RoO1xyXG5cdFx0XHRzdWdnZXN0b3IudXBkYXRlU2VsZWN0aW9uKGl0ZW1zKTtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd1VwXCI6XHJcblx0XHRcdHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCA9IChzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXggLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcclxuXHRcdFx0c3VnZ2VzdG9yLnVwZGF0ZVNlbGVjdGlvbihpdGVtcyk7XHJcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0XHRcdGJyZWFrO1xyXG5cdFx0Y2FzZSBldmVudC5rZXkgPT09IFwiQXJyb3dMZWZ0XCJ8fGV2ZW50LmtleSA9PT0gXCJBcnJvd1JpZ2h0XCI6XHJcblx0XHRcdHN1Z2dlc3Rvci5yZW1vdmVTdWdnZXN0b3IoKTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJCYWNrc3BhY2VcIjpcclxuXHRcdFx0c3VnZ2VzdG9yLnJlbW92ZVN1Z2dlc3RvcigpO1xyXG5cdFx0XHQvL3N1Z2dlc3Rvci5kZXBsb3lTdWdnZXN0b3IoY3R4LHZpZXcpXHJcblx0XHRcdGJyZWFrO1xyXG5cdFx0ZGVmYXVsdDpcclxuXHRcdFx0YnJlYWs7XHJcblx0fVxyXG5cdGlmIChldmVudC5rZXkgPT09IFwiQXJyb3dEb3duXCIpIHtcclxuXHRcdFxyXG5cdH1lbHNlIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIikge1xyXG5cdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gaXRlbXNbc3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4XTtcclxuXHRcdHN1Z2dlc3Rvci5zZWxlY3REcm9wZG93bkl0ZW0oc2VsZWN0ZWRJdGVtLHZpZXcpO1xyXG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHR9IC8qZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XHJcblx0XHRkcm9wZG93bi5yZW1vdmUoKTtcclxuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0fSovXHJcbn1cclxuXHJcblxyXG5leHBvcnQgY29uc3QgaGFuZGxlS2V5ZG93biA9IChrZXk6IHN0cmluZywgc2hpZnRLZXk6IGJvb2xlYW4sIGN0cmxLZXk6IGJvb2xlYW4sIGlzSU1FOiBib29sZWFuLCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XHJcblx0Y29uc3Qgc2V0dGluZ3MgPSBnZXRMYXRleFN1aXRlQ29uZmlnKHZpZXcpO1xyXG5cdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XHJcblxyXG5cdGxldCBzdWNjZXNzID0gZmFsc2U7XHJcblxyXG5cdC8qXHJcblx0KiBXaGVuIGJhY2tzcGFjZSBpcyBwcmVzc2VkLCBpZiB0aGUgY3Vyc29yIGlzIGluc2lkZSBhbiBlbXB0eSBpbmxpbmUgbWF0aCxcclxuXHQqIGRlbGV0ZSBib3RoICQgc3ltYm9scywgbm90IGp1c3QgdGhlIGZpcnN0IG9uZS5cclxuXHQqL1xyXG5cdGlmIChzZXR0aW5ncy5hdXRvRGVsZXRlJCAmJiBrZXkgPT09IFwiQmFja3NwYWNlXCIgJiYgY3R4Lm1vZGUuaW5NYXRoKCkpIHtcclxuXHRcdGNvbnN0IGNoYXJBdFBvcyA9IGdldENoYXJhY3RlckF0UG9zKHZpZXcsIGN0eC5wb3MpO1xyXG5cdFx0Y29uc3QgY2hhckF0UHJldlBvcyA9IGdldENoYXJhY3RlckF0UG9zKHZpZXcsIGN0eC5wb3MgLSAxKTtcclxuXHJcblx0XHRpZiAoY2hhckF0UG9zID09PSBcIiRcIiAmJiBjaGFyQXRQcmV2UG9zID09PSBcIiRcIikge1xyXG5cdFx0XHRyZXBsYWNlUmFuZ2UodmlldywgY3R4LnBvcyAtIDEsIGN0eC5wb3MgKyAxLCBcIlwiKTtcclxuXHRcdFx0Ly8gTm90ZTogbm90IHN1cmUgaWYgcmVtb3ZlQWxsVGFic3RvcHMgaXMgbmVjZXNzYXJ5XHJcblx0XHRcdHJlbW92ZUFsbFRhYnN0b3BzKHZpZXcpO1xyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHR9XHJcblx0XHJcblx0aWYgKHNldHRpbmdzLnNuaXBwZXRzRW5hYmxlZCkge1xyXG5cclxuXHRcdC8vIFByZXZlbnQgSU1FIGZyb20gdHJpZ2dlcmluZyBrZXlkb3duIGV2ZW50cy5cclxuXHRcdGlmIChzZXR0aW5ncy5zdXBwcmVzc1NuaXBwZXRUcmlnZ2VyT25JTUUgJiYgaXNJTUUpIHJldHVybjtcclxuXHJcblx0XHQvLyBBbGxvd3MgQ3RybCArIHogZm9yIHVuZG8sIGluc3RlYWQgb2YgdHJpZ2dlcmluZyBhIHNuaXBwZXQgZW5kaW5nIHdpdGggelxyXG5cdFx0aWYgKCFjdHJsS2V5KSB7XHJcblx0XHRcdHRyeSB7XHJcblx0XHRcdFx0c3VjY2VzcyA9IHJ1blNuaXBwZXRzKHZpZXcsIGN0eCwga2V5KTtcclxuXHRcdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0XHRcdH1cclxuXHRcdFx0Y2F0Y2ggKGUpIHtcclxuXHRcdFx0XHRjbGVhclNuaXBwZXRRdWV1ZSh2aWV3KTtcclxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGUpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRpZiAoa2V5ID09PSBcIlRhYlwiKSB7XHJcblx0XHRzdWNjZXNzID0gc2V0U2VsZWN0aW9uVG9OZXh0VGFic3RvcCh2aWV3KTtcclxuXHJcblx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0fVxyXG5cdGlmIChjdHgubW9kZS5zdHJpY3RseUluTWF0aCgpKSB7XHJcblx0XHRpZiAoa2V5ID09PSBcIi9cIikge1xyXG5cdFx0XHRzdWNjZXNzID0gcnVuQXV0b0ZyYWN0aW9uKHZpZXcsIGN0eCk7XHJcblxyXG5cdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRpZiAoc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCAmJiBjdHgubW9kZS5ibG9ja01hdGgpIHtcclxuXHRcdGlmIChbXCJUYWJcIiwgXCJFbnRlclwiXS5jb250YWlucyhrZXkpKSB7XHJcblx0XHRcdHN1Y2Nlc3MgPSBydW5NYXRyaXhTaG9ydGN1dHModmlldywgY3R4LCBrZXksIHNoaWZ0S2V5KTtcclxuXHJcblx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHR9XHJcblx0aWYgKGtleSA9PT0gXCJUYWJcIiYmc2hpZnRLZXkpIHtcclxuXHRcdHN1Y2Nlc3MgPSB0YWJvdXQodmlldywgY3R4LC0xKTtcclxuXHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcclxuXHR9XHJcblx0ZWxzZSBpZiAoa2V5ID09PSBcIlRhYlwiIHx8IHNob3VsZFRhYm91dEJ5Q2xvc2VCcmFja2V0KHZpZXcsIGtleSkpIHtcclxuXHRcdHN1Y2Nlc3MgPSB0YWJvdXQodmlldywgY3R4LDEpO1xyXG5cdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIGZhbHNlO1xyXG59Il19