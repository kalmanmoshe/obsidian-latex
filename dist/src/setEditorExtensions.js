import { EditorView, ViewPlugin, tooltips, } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { Context } from "./utils/context";
import { isComposing, replaceRange, setCursor } from "./editor utilities/editor_utils";
import { keyboardAutoReplaceHebrewToEnglishTriggers } from "./utils/staticData";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0RWRpdG9yRXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXRFZGl0b3JFeHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUEwQixRQUFRLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQztBQUM3RixPQUFPLEVBQWUsSUFBSSxFQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVILE9BQU8sRUFBRSxlQUFlLEVBQUUs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QUssSUFBSSwwQkFBMEIsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUM1RCxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztZQUU1QixJQUFJLE9BQU87Z0JBQUUsT0FBTyxJQUFJLENBQUM7UUFDMUIsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBNb3NoZSBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBnZXRUaWt6U3VnZ2VzdGlvbnMsIExhdGV4IH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3UGx1Z2luLCBWaWV3VXBkYXRlICxEZWNvcmF0aW9uLCB0b29sdGlwcywgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFByZWMsRXh0ZW5zaW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vdXRpbHMvY29udGV4dFwiO1xuaW1wb3J0IHsgaXNDb21wb3NpbmcsIHJlcGxhY2VSYW5nZSwgc2V0Q3Vyc29yIH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9lZGl0b3JfdXRpbHNcIjtcbmltcG9ydCB7IGtleWJvYXJkQXV0b1JlcGxhY2VIZWJyZXdUb0VuZ2xpc2hUcmlnZ2VycyB9IGZyb20gXCIuL3V0aWxzL3N0YXRpY0RhdGFcIjtcbmltcG9ydCB7IGdldENoYXJhY3RlckF0UG9zLCBTdWdnZXN0b3IgfSBmcm9tIFwiLi9zdWdnZXN0b3JcIjtcbmltcG9ydCB7IFJ0bEZvcmMgfSBmcm9tIFwiLi9lZGl0b3JEZWNvcmF0aW9uc1wiO1xuaW1wb3J0IHsgc2V0U2VsZWN0aW9uVG9OZXh0VGFic3RvcCB9IGZyb20gXCIuL3NuaXBwZXRzL3NuaXBwZXRfbWFuYWdlbWVudFwiO1xuXG5pbXBvcnQgeyBydW5TbmlwcGV0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL3J1bl9zbmlwcGV0c1wiO1xuaW1wb3J0IHsgZ2V0TGF0ZXhTdWl0ZUNvbmZpZywgZ2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbiB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvY29uZmlnXCI7XG5pbXBvcnQgeyBydW5BdXRvRnJhY3Rpb24gfSBmcm9tIFwiLi9mZWF0dXJlcy9hdXRvZnJhY3Rpb25cIjtcbmltcG9ydCB7IHJ1bk1hdHJpeFNob3J0Y3V0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL21hdHJpeF9zaG9ydGN1dHNcIjtcbmltcG9ydCB7IHNob3VsZFRhYm91dEJ5Q2xvc2VCcmFja2V0LCB0YWJvdXQgfSBmcm9tIFwiLi9mZWF0dXJlcy90YWJvdXRcIjtcbmltcG9ydCB7IHNuaXBwZXRFeHRlbnNpb25zIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci9leHRlbnNpb25zXCI7XG5pbXBvcnQgeyBjb2xvclBhaXJlZEJyYWNrZXRzUGx1Z2luTG93ZXN0UHJlYywgaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNQbHVnaW4gfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9oaWdobGlnaHRfYnJhY2tldHNcIjtcbmltcG9ydCB7IG1rQ29uY2VhbFBsdWdpbiB9IGZyb20gXCIuL2VkaXRvcl9leHRlbnNpb25zL2NvbmNlYWxcIjtcbmltcG9ydCB7IGN1cnNvclRvb2x0aXBCYXNlVGhlbWUsIGN1cnNvclRvb2x0aXBGaWVsZCwgaGFuZGxlTWF0aFRvb2x0aXAgfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9tYXRoX3Rvb2x0aXBcIjtcbmltcG9ydCB7IGNvbnRleHQgfSBmcm9tIFwiZXNidWlsZC13YXNtXCI7XG5pbXBvcnQgeyByZW1vdmVBbGxUYWJzdG9wcywgdGFic3RvcHNTdGF0ZUZpZWxkIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci90YWJzdG9wc19zdGF0ZV9maWVsZFwiO1xuaW1wb3J0IHsgY2xlYXJTbmlwcGV0UXVldWUsIHNuaXBwZXRRdWV1ZVN0YXRlRmllbGQgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL3NuaXBwZXRfcXVldWVfc3RhdGVfZmllbGRcIjtcbmltcG9ydCB7IGhhbmRsZVVuZG9SZWRvLCBzbmlwcGV0SW52ZXJ0ZWRFZmZlY3RzIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci9oaXN0b3J5XCI7XG5cblxuLypcbmNsYXNzPVwiY20tZ3V0dGVyc1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiIHN0eWxlPVwibWluLWhlaWdodDogNzg2NXB4OyBwb3NpdGlvbjogc3RpY2t5O1wiXG5zcGVsbGNoZWNrPVwiZmFsc2VcIiBhdXRvY29ycmVjdD1cIm9mZlwiIHRyYW5zbGF0ZT1cIm5vXCIgY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXG5cbiovXG5cblxuXG5leHBvcnQgY2xhc3MgRWRpdG9yRXh0ZW5zaW9ucyB7XG4gICAgcHJpdmF0ZSBzaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgYWN0aXZlRWRpdG9yVmlldzogRWRpdG9yVmlldyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgc3VnZ2VzdGlvbkFjdGl2ZTogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgc3VnZ2VzdG9yOiBTdWdnZXN0b3IgPSBuZXcgU3VnZ2VzdG9yKCk7XG5cbiAgICBwcml2YXRlIGlzU3VnZ2VzdGVyRGVwbG95ZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhIWRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpO1xuICAgIH1cblxuICAgIHNldEVkaXRvckV4dGVuc2lvbnMoYXBwOiBNb3NoZSkge1xuXHRcdHdoaWxlIChhcHAuZWRpdG9yRXh0ZW5zaW9ucy5sZW5ndGgpIGFwcC5lZGl0b3JFeHRlbnNpb25zLnBvcCgpO1xuXHRcdGFwcC5lZGl0b3JFeHRlbnNpb25zLnB1c2goW1xuXHRcdFx0Z2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbihhcHAuQ01TZXR0aW5ncyksXG5cdFx0XHRQcmVjLmhpZ2hlc3QoRWRpdG9yVmlldy5kb21FdmVudEhhbmRsZXJzKHsgXCJrZXlkb3duXCI6IHRoaXMub25LZXlkb3duIH0pKSxcblx0XHRcdEVkaXRvclZpZXcudXBkYXRlTGlzdGVuZXIub2YoaGFuZGxlVXBkYXRlKSxcblx0XHRcdHNuaXBwZXRFeHRlbnNpb25zLFxuXHRcdF0pO1xuXHRcdHRoaXMucmVnaXN0ZXJEZWNvcmF0aW9ucyhhcHApXG5cdFx0aWYgKGFwcC5DTVNldHRpbmdzLmNvbmNlYWxFbmFibGVkKSB7XG5cdFx0XHRjb25zdCB0aW1lb3V0ID0gYXBwLkNNU2V0dGluZ3MuY29uY2VhbFJldmVhbFRpbWVvdXQ7XG5cdFx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKG1rQ29uY2VhbFBsdWdpbih0aW1lb3V0KS5leHRlbnNpb24pO1xuXHRcdH1cblx0XHRpZiAoYXBwLkNNU2V0dGluZ3MuY29sb3JQYWlyZWRCcmFja2V0c0VuYWJsZWQpXG5cdFx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKGNvbG9yUGFpcmVkQnJhY2tldHNQbHVnaW5Mb3dlc3RQcmVjKTtcblx0XHRpZiAoYXBwLkNNU2V0dGluZ3MuaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNFbmFibGVkKVxuXHRcdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChoaWdobGlnaHRDdXJzb3JCcmFja2V0c1BsdWdpbi5leHRlbnNpb24pO1xuXHRcdGlmIChhcHAuQ01TZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpXG5cdFx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKFtcblx0XHRcdFx0Y3Vyc29yVG9vbHRpcEZpZWxkLmV4dGVuc2lvbixcblx0XHRcdFx0Y3Vyc29yVG9vbHRpcEJhc2VUaGVtZSxcblx0XHRcdFx0dG9vbHRpcHMoeyBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiIH0pLFxuXHRcdFx0XSk7XG5cblxuXHRcdHRoaXMubW9uaXRvcihhcHApOyBcblx0XHR0aGlzLnNuaXBwZXRFeHRlbnNpb25zKGFwcCk7XG5cdFxuXHRcdGNvbnN0IGZsYXRFeHRlbnNpb25zID0gYXBwLmVkaXRvckV4dGVuc2lvbnMuZmxhdCgpO1xuXHRcblx0XHRhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oZmxhdEV4dGVuc2lvbnMpO1xuXHR9XG5cdFxuXG4gICAgcHJpdmF0ZSBtb25pdG9yKGFwcDogTW9zaGUpIHtcbiAgICAgICAgYXBwLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFtcbiAgICAgICAgICAgIFByZWMuaGlnaGVzdChcbiAgICAgICAgICAgICAgICBFZGl0b3JWaWV3LmRvbUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgICAgICAgICAgICBrZXlkb3duOiAoZXZlbnQsIHZpZXcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25LZXlkb3duKGV2ZW50LCB2aWV3KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5jb2RlLnN0YXJ0c1dpdGgoXCJLZXlcIikgJiYgIWV2ZW50LmN0cmxLZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcblx0XHRcdFx0XHRtb3VzZW1vdmU6IChldmVudCwgdmlldykgPT4ge1xuXHRcdFx0XHRcdFx0Lypjb25zdCB7IGNsaWVudFgsIGNsaWVudFkgfSA9IGV2ZW50O1xuXHRcdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSB2aWV3LnBvc0F0Q29vcmRzKHsgeDogY2xpZW50WCwgeTogY2xpZW50WSB9KTtcblx0XG5cdFx0XHRcdFx0XHRpZiAocG9zaXRpb24pIHtcblx0XHRcdFx0XHRcdFx0Ly90aGlzLm9uQ3Vyc29yTW92ZShldmVudCwgdmlldyk7XG5cdFx0XHRcdFx0XHR9Ki9cblx0XHRcdFx0XHR9LFxuICAgICAgICAgICAgICAgICAgICBmb2N1czogKGV2ZW50LCB2aWV3KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUcmFjayB0aGUgYWN0aXZlIGVkaXRvciB2aWV3XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUVkaXRvclZpZXcgPSB2aWV3O1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgRWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZigodXBkYXRlKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2hvdWxkTGlzdGVuRm9yVHJhbnNhY3Rpb24gJiYgdXBkYXRlLmRvY0NoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vblRyYW5zYWN0aW9uKHVwZGF0ZS52aWV3KTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLFxuICAgICAgICBdKTtcblxuICAgICAgICAvLyBHbG9iYWwgY2xpY2sgbGlzdGVuZXIgdG8gaGFuZGxlIHN1Z2dlc3Rpb25zXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuc3VnZ2VzdGlvbkFjdGl2ZSA9IHRoaXMuaXNTdWdnZXN0ZXJEZXBsb3llZCgpO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3VnZ2VzdGlvbkFjdGl2ZSAmJiB0aGlzLmFjdGl2ZUVkaXRvclZpZXcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uQ2xpY2soZXZlbnQsIHRoaXMuYWN0aXZlRWRpdG9yVmlldyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIChldmVudCkgPT4ge1xuXHRcdFx0dGhpcy5zdWdnZXN0aW9uQWN0aXZlID0gdGhpcy5pc1N1Z2dlc3RlckRlcGxveWVkKCk7XG4gICAgICAgICAgICBpZiAodGhpcy5zdWdnZXN0aW9uQWN0aXZlICYmIHRoaXMuYWN0aXZlRWRpdG9yVmlldykge1xuICAgICAgICAgICAgICAgIHRoaXMub25DdXJzb3JNb3ZlKGV2ZW50LCB0aGlzLmFjdGl2ZUVkaXRvclZpZXcpXG4gICAgICAgICAgICB9XG5cdFx0fSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzbmlwcGV0RXh0ZW5zaW9ucyhhcHA6IE1vc2hlKSB7XG5cdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXG5cdFx0XHR0YWJzdG9wc1N0YXRlRmllbGQuZXh0ZW5zaW9uLFxuXHRcdFx0c25pcHBldFF1ZXVlU3RhdGVGaWVsZC5leHRlbnNpb24sXG5cdFx0XHRzbmlwcGV0SW52ZXJ0ZWRFZmZlY3RzLFxuXHRcdF0pO1xuXHR9XG5cdFxuXG4gICAgcHJpdmF0ZSByZWdpc3RlckRlY29yYXRpb25zKGFwcDogTW9zaGUpe1xuICAgICAgICBhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICAgICAgICBWaWV3UGx1Z2luLmZyb21DbGFzcyhSdGxGb3JjLCB7XG4gICAgICAgICAgICBkZWNvcmF0aW9uczogKHYpID0+IHYuZGVjb3JhdGlvbnMsXG4gICAgICAgICAgfVxuICAgICAgICApKTtcbiAgICB9XG5cdHByaXZhdGUgb25DdXJzb3JNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50LHZpZXc6IEVkaXRvclZpZXcpe1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25JdGVtcyA9IGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvckFsbChcIi5zdWdnZXN0aW9uLWl0ZW1cIik7XG5cblx0XHRjb25zdCBjbGlja2VkU3VnZ2VzdGlvbiA9IEFycmF5LmZyb20oc3VnZ2VzdGlvbkl0ZW1zKS5maW5kKChpdGVtKSA9PlxuXHRcdFx0aXRlbS5jb250YWlucyhldmVudC50YXJnZXQgYXMgTm9kZSlcblx0XHQpO1xuXHRcdGlmIChjbGlja2VkU3VnZ2VzdGlvbikge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBBcnJheS5mcm9tKHN1Z2dlc3Rpb25JdGVtcykuaW5kZXhPZihjbGlja2VkU3VnZ2VzdGlvbik7XG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleD1pbmRleFxuXHRcdFx0dGhpcy5zdWdnZXN0b3IudXBkYXRlU2VsZWN0aW9uKHN1Z2dlc3Rpb25JdGVtcylcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBvbkNsaWNrPShldmVudDogTW91c2VFdmVudCx2aWV3OiBFZGl0b3JWaWV3KT0+e1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25JdGVtcyA9IGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvckFsbChcIi5zdWdnZXN0aW9uLWl0ZW1cIik7XG5cdFxuXHRcdC8vIENoZWNrIGlmIHRoZSBjbGljayBpcyBvbiBhIHN1Z2dlc3Rpb24gaXRlbVxuXHRcdGNvbnN0IGNsaWNrZWRTdWdnZXN0aW9uID0gQXJyYXkuZnJvbShzdWdnZXN0aW9uSXRlbXMpLmZpbmQoKGl0ZW0pID0+XG5cdFx0XHRpdGVtLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxuXHRcdCk7XG5cdFx0aWYgKGNsaWNrZWRTdWdnZXN0aW9uKSB7XG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci5zZWxlY3REcm9wZG93bkl0ZW0oY2xpY2tlZFN1Z2dlc3Rpb24sdmlldyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRyb3Bkb3duSXRlbSA9IGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpO1xuXHRcdGNvbnN0IGNsaWNrZWREcm9wZG93biA9IEFycmF5LmZyb20oc3VnZ2VzdGlvbkl0ZW1zKS5maW5kKChpdGVtKSA9PlxuXHRcdFx0aXRlbS5jb250YWlucyhldmVudC50YXJnZXQgYXMgTm9kZSlcblx0XHQpO1xuXHRcdGlmKCFjbGlja2VkRHJvcGRvd24pe1xuXHRcdFx0dGhpcy5zdWdnZXN0b3IucmVtb3ZlU3VnZ2VzdG9yKClcblx0XHR9XG5cdFx0XG5cdH1cblx0cHJpdmF0ZSBvblRyYW5zYWN0aW9uPSh2aWV3OiBFZGl0b3JWaWV3KT0+IHtcblx0XHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xuXHRcdGlmIChjdHguY29kZWJsb2NrTGFuZ3VhZ2UgPT09IFwidGlrelwiKSB7XG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci5kZXBsb3lTdWdnZXN0b3IoY3R4LHZpZXcpXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbktleWRvd24gPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQsIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcblx0XHRsZXQga2V5ID0gZXZlbnQua2V5O1xuXHRcdGxldCB0cmlnZ2VyXG5cdFx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcblx0XHRpZiAoIShldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkpICYmIGN0eC5zaG91bGRUcmFuc2xhdGUoKSkge1xuXHRcdCAgdHJpZ2dlciA9IGtleWJvYXJkQXV0b1JlcGxhY2VIZWJyZXdUb0VuZ2xpc2hUcmlnZ2Vycy5maW5kKCh0cmlnZ2VyMikgPT4gdHJpZ2dlcjIua2V5ID09PSBldmVudC5rZXkgJiYgdHJpZ2dlcjIuY29kZSA9PT0gZXZlbnQuY29kZSk7XG5cdFx0ICBrZXkgPSB0cmlnZ2VyPy5yZXBsYWNlbWVudHx8a2V5O1xuXHRcdH1cblx0XHRpZih0aGlzLnN1Z2dlc3Rvci5pc1N1Z2dlc3RlckRlcGxveWVkKXtcblx0XHRcdGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbihldmVudCx2aWV3LHRoaXMuc3VnZ2VzdG9yKVxuXHRcdH1cblx0XHRjb25zdCBzdWNjZXNzID0gaGFuZGxlS2V5ZG93bihrZXksIGV2ZW50LnNoaWZ0S2V5LCBldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXksIGlzQ29tcG9zaW5nKHZpZXcsIGV2ZW50KSwgdmlldyk7XG5cdFx0aWYgKHN1Y2Nlc3MpIFxuXHRcdCAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRlbHNlIGlmIChrZXkgIT09IGV2ZW50LmtleSYmdHJpZ2dlcikge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGtleSA9IHRyaWdnZXIucmVwbGFjZW1lbnQ7XG5cdFx0XHRyZXBsYWNlUmFuZ2Uodmlldyx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmZyb20sdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi50byxrZXkpXG5cdFx0XHRzZXRDdXJzb3Iodmlldyx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmZyb20ra2V5Lmxlbmd0aClcblx0ICB9XG5cdH07XG5cblx0cHJpdmF0ZSBkZWNvcmF0KCl7XG5cblx0fVxufVxuY29uc3QgaGFuZGxlVXBkYXRlID0gKHVwZGF0ZTogVmlld1VwZGF0ZSkgPT4ge1xuXHRjb25zdCBzZXR0aW5ncyA9IGdldExhdGV4U3VpdGVDb25maWcodXBkYXRlLnN0YXRlKTtcblxuXHQvLyBUaGUgbWF0aCB0b29sdGlwIGhhbmRsZXIgaXMgZHJpdmVuIGJ5IHZpZXcgdXBkYXRlcyBiZWNhdXNlIGl0IHV0aWxpemVzXG5cdC8vIGluZm9ybWF0aW9uIGFib3V0IHZpc3VhbCBsaW5lLCB3aGljaCBpcyBub3QgYXZhaWxhYmxlIGluIEVkaXRvclN0YXRlXG5cdGlmIChzZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpIHtcblx0XHRoYW5kbGVNYXRoVG9vbHRpcCh1cGRhdGUpO1xuXHR9XG5cblx0aGFuZGxlVW5kb1JlZG8odXBkYXRlKTtcbn1cblxuY29uc3QgaGFuZGxlRHJvcGRvd25OYXZpZ2F0aW9uPShldmVudDogS2V5Ym9hcmRFdmVudCx2aWV3OkVkaXRvclZpZXcsc3VnZ2VzdG9yOiBTdWdnZXN0b3IpPT57XG5cdGNvbnN0IGl0ZW1zID0gc3VnZ2VzdG9yLmdldEFsbGRyb3Bkb3duSXRlbXMoKTtcblx0c3dpdGNoICh0cnVlKSB7XG5cdFx0Y2FzZSBldmVudC5rZXkgPT09IFwiQXJyb3dEb3duXCI6XG5cdFx0XHRzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXggPSAoc3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ICsgMSkgJSBpdGVtcy5sZW5ndGg7XG5cdFx0XHRzdWdnZXN0b3IudXBkYXRlU2VsZWN0aW9uKGl0ZW1zKTtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd1VwXCI6XG5cdFx0XHRzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXggPSAoc3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4IC0gMSArIGl0ZW1zLmxlbmd0aCkgJSBpdGVtcy5sZW5ndGg7XG5cdFx0XHRzdWdnZXN0b3IudXBkYXRlU2VsZWN0aW9uKGl0ZW1zKTtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd0xlZnRcInx8ZXZlbnQua2V5ID09PSBcIkFycm93UmlnaHRcIjpcblx0XHRcdHN1Z2dlc3Rvci5yZW1vdmVTdWdnZXN0b3IoKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgZXZlbnQua2V5ID09PSBcIkJhY2tzcGFjZVwiOlxuXHRcdFx0c3VnZ2VzdG9yLnJlbW92ZVN1Z2dlc3RvcigpO1xuXHRcdFx0Ly9zdWdnZXN0b3IuZGVwbG95U3VnZ2VzdG9yKGN0eCx2aWV3KVxuXHRcdFx0YnJlYWs7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdGJyZWFrO1xuXHR9XG5cdGlmIChldmVudC5rZXkgPT09IFwiQXJyb3dEb3duXCIpIHtcblx0XHRcblx0fWVsc2UgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gaXRlbXNbc3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4XTtcblx0XHRzdWdnZXN0b3Iuc2VsZWN0RHJvcGRvd25JdGVtKHNlbGVjdGVkSXRlbSx2aWV3KTtcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHR9IC8qZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XG5cdFx0ZHJvcGRvd24ucmVtb3ZlKCk7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0fSovXG59XG5cblxuZXhwb3J0IGNvbnN0IGhhbmRsZUtleWRvd24gPSAoa2V5OiBzdHJpbmcsIHNoaWZ0S2V5OiBib29sZWFuLCBjdHJsS2V5OiBib29sZWFuLCBpc0lNRTogYm9vbGVhbiwgdmlldzogRWRpdG9yVmlldykgPT4ge1xuXG5cdGNvbnN0IHNldHRpbmdzID0gZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh2aWV3KTtcblx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcblxuXHRsZXQgc3VjY2VzcyA9IGZhbHNlO1xuXG5cdC8qXG5cdCogV2hlbiBiYWNrc3BhY2UgaXMgcHJlc3NlZCwgaWYgdGhlIGN1cnNvciBpcyBpbnNpZGUgYW4gZW1wdHkgaW5saW5lIG1hdGgsXG5cdCogZGVsZXRlIGJvdGggJCBzeW1ib2xzLCBub3QganVzdCB0aGUgZmlyc3Qgb25lLlxuXHQqL1xuXHRpZiAoc2V0dGluZ3MuYXV0b0RlbGV0ZSQgJiYga2V5ID09PSBcIkJhY2tzcGFjZVwiICYmIGN0eC5tb2RlLmluTWF0aCgpKSB7XG5cdFx0Y29uc3QgY2hhckF0UG9zID0gZ2V0Q2hhcmFjdGVyQXRQb3ModmlldywgY3R4LnBvcyk7XG5cdFx0Y29uc3QgY2hhckF0UHJldlBvcyA9IGdldENoYXJhY3RlckF0UG9zKHZpZXcsIGN0eC5wb3MgLSAxKTtcblxuXHRcdGlmIChjaGFyQXRQb3MgPT09IFwiJFwiICYmIGNoYXJBdFByZXZQb3MgPT09IFwiJFwiKSB7XG5cdFx0XHRyZXBsYWNlUmFuZ2UodmlldywgY3R4LnBvcyAtIDEsIGN0eC5wb3MgKyAxLCBcIlwiKTtcblx0XHRcdC8vIE5vdGU6IG5vdCBzdXJlIGlmIHJlbW92ZUFsbFRhYnN0b3BzIGlzIG5lY2Vzc2FyeVxuXHRcdFx0cmVtb3ZlQWxsVGFic3RvcHModmlldyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblx0XG5cdGlmIChzZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQpIHtcblxuXHRcdC8vIFByZXZlbnQgSU1FIGZyb20gdHJpZ2dlcmluZyBrZXlkb3duIGV2ZW50cy5cblx0XHRpZiAoc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FICYmIGlzSU1FKSByZXR1cm47XG5cblx0XHQvLyBBbGxvd3MgQ3RybCArIHogZm9yIHVuZG8sIGluc3RlYWQgb2YgdHJpZ2dlcmluZyBhIHNuaXBwZXQgZW5kaW5nIHdpdGggelxuXHRcdGlmICghY3RybEtleSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c3VjY2VzcyA9IHJ1blNuaXBwZXRzKHZpZXcsIGN0eCwga2V5KTtcblx0XHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2ggKGUpIHtcblx0XHRcdFx0Y2xlYXJTbmlwcGV0UXVldWUodmlldyk7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKGtleSA9PT0gXCJUYWJcIikge1xuXHRcdHN1Y2Nlc3MgPSBzZXRTZWxlY3Rpb25Ub05leHRUYWJzdG9wKHZpZXcpO1xuXG5cdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKHNldHRpbmdzLmF1dG9mcmFjdGlvbkVuYWJsZWQgJiYgY3R4Lm1vZGUuc3RyaWN0bHlJbk1hdGgoKSkge1xuXHRcdGlmIChrZXkgPT09IFwiL1wiKSB7XG5cdFx0XHRzdWNjZXNzID0gcnVuQXV0b0ZyYWN0aW9uKHZpZXcsIGN0eCk7XG5cblx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRpZiAoc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCAmJiBjdHgubW9kZS5ibG9ja01hdGgpIHtcblx0XHRpZiAoW1wiVGFiXCIsIFwiRW50ZXJcIl0uY29udGFpbnMoa2V5KSkge1xuXHRcdFx0c3VjY2VzcyA9IHJ1bk1hdHJpeFNob3J0Y3V0cyh2aWV3LCBjdHgsIGtleSwgc2hpZnRLZXkpO1xuXG5cdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHNldHRpbmdzLnRhYm91dEVuYWJsZWQpIHtcblx0XHRpZiAoa2V5ID09PSBcIlRhYlwiIHx8IHNob3VsZFRhYm91dEJ5Q2xvc2VCcmFja2V0KHZpZXcsIGtleSkpIHtcblx0XHRcdHN1Y2Nlc3MgPSB0YWJvdXQodmlldywgY3R4KTtcblxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn0iXX0=