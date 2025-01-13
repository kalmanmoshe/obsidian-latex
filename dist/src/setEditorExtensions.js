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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0RWRpdG9yRXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXRFZGl0b3JFeHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUEwQixRQUFRLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQztBQUM3RixPQUFPLEVBQWUsSUFBSSxFQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVILE9BQU8sRUFBRSxlQUFlLEVBQUUs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QUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDakUsT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlCLElBQUksT0FBTztZQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzFCLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBNb3NoZSBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBnZXRUaWt6U3VnZ2VzdGlvbnMsIExhdGV4IH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3UGx1Z2luLCBWaWV3VXBkYXRlICxEZWNvcmF0aW9uLCB0b29sdGlwcywgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFByZWMsRXh0ZW5zaW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vdXRpbHMvY29udGV4dFwiO1xuaW1wb3J0IHsgaXNDb21wb3NpbmcsIHJlcGxhY2VSYW5nZSwgc2V0Q3Vyc29yIH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9lZGl0b3JfdXRpbHNcIjtcbmltcG9ydCB7IGtleWJvYXJkQXV0b1JlcGxhY2VIZWJyZXdUb0VuZ2xpc2hUcmlnZ2VycyB9IGZyb20gXCIuL3N0YXRpY0RhdGEvbWF0aFBhcnNlclN0YXRpY0RhdGFcIjtcbmltcG9ydCB7IGdldENoYXJhY3RlckF0UG9zLCBTdWdnZXN0b3IgfSBmcm9tIFwiLi9zdWdnZXN0b3JcIjtcbmltcG9ydCB7IFJ0bEZvcmMgfSBmcm9tIFwiLi9lZGl0b3JEZWNvcmF0aW9uc1wiO1xuaW1wb3J0IHsgc2V0U2VsZWN0aW9uVG9OZXh0VGFic3RvcCB9IGZyb20gXCIuL3NuaXBwZXRzL3NuaXBwZXRfbWFuYWdlbWVudFwiO1xuXG5pbXBvcnQgeyBydW5TbmlwcGV0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL3J1bl9zbmlwcGV0c1wiO1xuaW1wb3J0IHsgZ2V0TGF0ZXhTdWl0ZUNvbmZpZywgZ2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbiB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvY29uZmlnXCI7XG5pbXBvcnQgeyBydW5BdXRvRnJhY3Rpb24gfSBmcm9tIFwiLi9mZWF0dXJlcy9hdXRvZnJhY3Rpb25cIjtcbmltcG9ydCB7IHJ1bk1hdHJpeFNob3J0Y3V0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL21hdHJpeF9zaG9ydGN1dHNcIjtcbmltcG9ydCB7IHNob3VsZFRhYm91dEJ5Q2xvc2VCcmFja2V0LCB0YWJvdXQgfSBmcm9tIFwiLi9mZWF0dXJlcy90YWJvdXRcIjtcbmltcG9ydCB7IHNuaXBwZXRFeHRlbnNpb25zIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci9leHRlbnNpb25zXCI7XG5pbXBvcnQgeyBjb2xvclBhaXJlZEJyYWNrZXRzUGx1Z2luTG93ZXN0UHJlYywgaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNQbHVnaW4gfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9oaWdobGlnaHRfYnJhY2tldHNcIjtcbmltcG9ydCB7IG1rQ29uY2VhbFBsdWdpbiB9IGZyb20gXCIuL2VkaXRvcl9leHRlbnNpb25zL2NvbmNlYWxcIjtcbmltcG9ydCB7IGN1cnNvclRvb2x0aXBCYXNlVGhlbWUsIGN1cnNvclRvb2x0aXBGaWVsZCwgaGFuZGxlTWF0aFRvb2x0aXAgfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9tYXRoX3Rvb2x0aXBcIjtcbmltcG9ydCB7IGNvbnRleHQgfSBmcm9tIFwiZXNidWlsZC13YXNtXCI7XG5pbXBvcnQgeyByZW1vdmVBbGxUYWJzdG9wcywgdGFic3RvcHNTdGF0ZUZpZWxkIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci90YWJzdG9wc19zdGF0ZV9maWVsZFwiO1xuaW1wb3J0IHsgY2xlYXJTbmlwcGV0UXVldWUsIHNuaXBwZXRRdWV1ZVN0YXRlRmllbGQgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL3NuaXBwZXRfcXVldWVfc3RhdGVfZmllbGRcIjtcbmltcG9ydCB7IGhhbmRsZVVuZG9SZWRvLCBzbmlwcGV0SW52ZXJ0ZWRFZmZlY3RzIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci9oaXN0b3J5XCI7XG5cblxuLypcbmNsYXNzPVwiY20tZ3V0dGVyc1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiIHN0eWxlPVwibWluLWhlaWdodDogNzg2NXB4OyBwb3NpdGlvbjogc3RpY2t5O1wiXG5zcGVsbGNoZWNrPVwiZmFsc2VcIiBhdXRvY29ycmVjdD1cIm9mZlwiIHRyYW5zbGF0ZT1cIm5vXCIgY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXG5cbiovXG5cblxuXG5leHBvcnQgY2xhc3MgRWRpdG9yRXh0ZW5zaW9ucyB7XG4gICAgcHJpdmF0ZSBzaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgYWN0aXZlRWRpdG9yVmlldzogRWRpdG9yVmlldyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgc3VnZ2VzdGlvbkFjdGl2ZTogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHByaXZhdGUgc3VnZ2VzdG9yOiBTdWdnZXN0b3IgPSBuZXcgU3VnZ2VzdG9yKCk7XG5cbiAgICBwcml2YXRlIGlzU3VnZ2VzdGVyRGVwbG95ZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhIWRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpO1xuICAgIH1cblxuICAgIHNldEVkaXRvckV4dGVuc2lvbnMoYXBwOiBNb3NoZSkge1xuXHRcdHdoaWxlIChhcHAuZWRpdG9yRXh0ZW5zaW9ucy5sZW5ndGgpIGFwcC5lZGl0b3JFeHRlbnNpb25zLnBvcCgpO1xuXHRcdGFwcC5lZGl0b3JFeHRlbnNpb25zLnB1c2goW1xuXHRcdFx0Z2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbihhcHAuQ01TZXR0aW5ncyksXG5cdFx0XHRQcmVjLmhpZ2hlc3QoRWRpdG9yVmlldy5kb21FdmVudEhhbmRsZXJzKHsgXCJrZXlkb3duXCI6IHRoaXMub25LZXlkb3duIH0pKSxcblx0XHRcdEVkaXRvclZpZXcudXBkYXRlTGlzdGVuZXIub2YoaGFuZGxlVXBkYXRlKSxcblx0XHRcdHNuaXBwZXRFeHRlbnNpb25zLFxuXHRcdF0pO1xuXHRcdHRoaXMucmVnaXN0ZXJEZWNvcmF0aW9ucyhhcHApXG5cdFx0aWYgKGFwcC5DTVNldHRpbmdzLmNvbmNlYWxFbmFibGVkKSB7XG5cdFx0XHRjb25zdCB0aW1lb3V0ID0gYXBwLkNNU2V0dGluZ3MuY29uY2VhbFJldmVhbFRpbWVvdXQ7XG5cdFx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKG1rQ29uY2VhbFBsdWdpbih0aW1lb3V0KS5leHRlbnNpb24pO1xuXHRcdH1cblx0XHRcdGFwcC5lZGl0b3JFeHRlbnNpb25zLnB1c2goY29sb3JQYWlyZWRCcmFja2V0c1BsdWdpbkxvd2VzdFByZWMpO1xuXHRcdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChoaWdobGlnaHRDdXJzb3JCcmFja2V0c1BsdWdpbi5leHRlbnNpb24pO1xuXHRcdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXG5cdFx0XHRcdGN1cnNvclRvb2x0aXBGaWVsZC5leHRlbnNpb24sXG5cdFx0XHRcdGN1cnNvclRvb2x0aXBCYXNlVGhlbWUsXG5cdFx0XHRcdHRvb2x0aXBzKHsgcG9zaXRpb246IFwiYWJzb2x1dGVcIiB9KSxcblx0XHRcdF0pO1xuXG5cdFx0dGhpcy5tb25pdG9yKGFwcCk7IFxuXHRcdHRoaXMuc25pcHBldEV4dGVuc2lvbnMoYXBwKTtcblx0XG5cdFx0Y29uc3QgZmxhdEV4dGVuc2lvbnMgPSBhcHAuZWRpdG9yRXh0ZW5zaW9ucy5mbGF0KCk7XG5cdFxuXHRcdGFwcC5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihmbGF0RXh0ZW5zaW9ucyk7XG5cdH1cblx0XG5cbiAgICBwcml2YXRlIG1vbml0b3IoYXBwOiBNb3NoZSkge1xuICAgICAgICBhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oW1xuICAgICAgICAgICAgUHJlYy5oaWdoZXN0KFxuICAgICAgICAgICAgICAgIEVkaXRvclZpZXcuZG9tRXZlbnRIYW5kbGVycyh7XG4gICAgICAgICAgICAgICAgICAgIGtleWRvd246IChldmVudCwgdmlldykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5vbktleWRvd24oZXZlbnQsIHZpZXcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUuc3RhcnRzV2l0aChcIktleVwiKSAmJiAhZXZlbnQuY3RybEtleSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2hvdWxkTGlzdGVuRm9yVHJhbnNhY3Rpb24gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuXHRcdFx0XHRcdG1vdXNlbW92ZTogKGV2ZW50LCB2aWV3KSA9PiB7XG5cdFx0XHRcdFx0XHQvKmNvbnN0IHsgY2xpZW50WCwgY2xpZW50WSB9ID0gZXZlbnQ7XG5cdFx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHZpZXcucG9zQXRDb29yZHMoeyB4OiBjbGllbnRYLCB5OiBjbGllbnRZIH0pO1xuXHRcblx0XHRcdFx0XHRcdGlmIChwb3NpdGlvbikge1xuXHRcdFx0XHRcdFx0XHQvL3RoaXMub25DdXJzb3JNb3ZlKGV2ZW50LCB2aWV3KTtcblx0XHRcdFx0XHRcdH0qL1xuXHRcdFx0XHRcdH0sXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzOiAoZXZlbnQsIHZpZXcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRyYWNrIHRoZSBhY3RpdmUgZWRpdG9yIHZpZXdcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRWRpdG9yVmlldyA9IHZpZXc7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKCh1cGRhdGUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiAmJiB1cGRhdGUuZG9jQ2hhbmdlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9uVHJhbnNhY3Rpb24odXBkYXRlLnZpZXcpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSksXG4gICAgICAgIF0pO1xuXG4gICAgICAgIC8vIEdsb2JhbCBjbGljayBsaXN0ZW5lciB0byBoYW5kbGUgc3VnZ2VzdGlvbnNcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zdWdnZXN0aW9uQWN0aXZlID0gdGhpcy5pc1N1Z2dlc3RlckRlcGxveWVkKCk7XG4gICAgICAgICAgICBpZiAodGhpcy5zdWdnZXN0aW9uQWN0aXZlICYmIHRoaXMuYWN0aXZlRWRpdG9yVmlldykge1xuICAgICAgICAgICAgICAgIHRoaXMub25DbGljayhldmVudCwgdGhpcy5hY3RpdmVFZGl0b3JWaWV3KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgKGV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLnN1Z2dlc3Rpb25BY3RpdmUgPSB0aGlzLmlzU3VnZ2VzdGVyRGVwbG95ZWQoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN1Z2dlc3Rpb25BY3RpdmUgJiYgdGhpcy5hY3RpdmVFZGl0b3JWaWV3KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vbkN1cnNvck1vdmUoZXZlbnQsIHRoaXMuYWN0aXZlRWRpdG9yVmlldylcbiAgICAgICAgICAgIH1cblx0XHR9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNuaXBwZXRFeHRlbnNpb25zKGFwcDogTW9zaGUpIHtcblx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKFtcblx0XHRcdHRhYnN0b3BzU3RhdGVGaWVsZC5leHRlbnNpb24sXG5cdFx0XHRzbmlwcGV0UXVldWVTdGF0ZUZpZWxkLmV4dGVuc2lvbixcblx0XHRcdHNuaXBwZXRJbnZlcnRlZEVmZmVjdHMsXG5cdFx0XSk7XG5cdH1cblx0XG5cbiAgICBwcml2YXRlIHJlZ2lzdGVyRGVjb3JhdGlvbnMoYXBwOiBNb3NoZSl7XG4gICAgICAgIGFwcC5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgICAgICAgIFZpZXdQbHVnaW4uZnJvbUNsYXNzKFJ0bEZvcmMsIHtcbiAgICAgICAgICAgIGRlY29yYXRpb25zOiAodikgPT4gdi5kZWNvcmF0aW9ucyxcbiAgICAgICAgICB9XG4gICAgICAgICkpO1xuICAgIH1cblx0cHJpdmF0ZSBvbkN1cnNvck1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQsdmlldzogRWRpdG9yVmlldyl7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkl0ZW1zID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKTtcblxuXHRcdGNvbnN0IGNsaWNrZWRTdWdnZXN0aW9uID0gQXJyYXkuZnJvbShzdWdnZXN0aW9uSXRlbXMpLmZpbmQoKGl0ZW0pID0+XG5cdFx0XHRpdGVtLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxuXHRcdCk7XG5cdFx0aWYgKGNsaWNrZWRTdWdnZXN0aW9uKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IEFycmF5LmZyb20oc3VnZ2VzdGlvbkl0ZW1zKS5pbmRleE9mKGNsaWNrZWRTdWdnZXN0aW9uKTtcblx0XHRcdHRoaXMuc3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4PWluZGV4XG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci51cGRhdGVTZWxlY3Rpb24oc3VnZ2VzdGlvbkl0ZW1zKVxuXHRcdH1cblx0fVxuXHRwcml2YXRlIG9uQ2xpY2s9KGV2ZW50OiBNb3VzZUV2ZW50LHZpZXc6IEVkaXRvclZpZXcpPT57XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkl0ZW1zID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKTtcblx0XG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGNsaWNrIGlzIG9uIGEgc3VnZ2VzdGlvbiBpdGVtXG5cdFx0Y29uc3QgY2xpY2tlZFN1Z2dlc3Rpb24gPSBBcnJheS5mcm9tKHN1Z2dlc3Rpb25JdGVtcykuZmluZCgoaXRlbSkgPT5cblx0XHRcdGl0ZW0uY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpXG5cdFx0KTtcblx0XHRpZiAoY2xpY2tlZFN1Z2dlc3Rpb24pIHtcblx0XHRcdHRoaXMuc3VnZ2VzdG9yLnNlbGVjdERyb3Bkb3duSXRlbShjbGlja2VkU3VnZ2VzdGlvbix2aWV3KTtcblx0XHR9XG5cdFx0Y29uc3QgZHJvcGRvd25JdGVtID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yKFwiLnN1Z2dlc3Rpb24tZHJvcGRvd25cIik7XG5cdFx0Y29uc3QgY2xpY2tlZERyb3Bkb3duID0gQXJyYXkuZnJvbShzdWdnZXN0aW9uSXRlbXMpLmZpbmQoKGl0ZW0pID0+XG5cdFx0XHRpdGVtLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxuXHRcdCk7XG5cdFx0aWYoIWNsaWNrZWREcm9wZG93bil7XG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci5yZW1vdmVTdWdnZXN0b3IoKVxuXHRcdH1cblx0XHRcblx0fVxuXHRwcml2YXRlIG9uVHJhbnNhY3Rpb249KHZpZXc6IEVkaXRvclZpZXcpPT4ge1xuXHRcdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XG5cdFx0aWYgKGN0eC5jb2RlYmxvY2tMYW5ndWFnZSA9PT0gXCJ0aWt6XCIpIHtcblx0XHRcdHRoaXMuc3VnZ2VzdG9yLmRlcGxveVN1Z2dlc3RvcihjdHgsdmlldylcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uS2V5ZG93biA9IChldmVudDogS2V5Ym9hcmRFdmVudCwgdmlldzogRWRpdG9yVmlldykgPT4ge1xuXHRcdGxldCBrZXkgPSBldmVudC5rZXk7XG5cdFx0bGV0IHRyaWdnZXJcblx0XHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xuXHRcdGlmICghKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkgJiYgY3R4LnNob3VsZFRyYW5zbGF0ZSgpKSB7XG5cdFx0ICB0cmlnZ2VyID0ga2V5Ym9hcmRBdXRvUmVwbGFjZUhlYnJld1RvRW5nbGlzaFRyaWdnZXJzLmZpbmQoKHRyaWdnZXIyKSA9PiB0cmlnZ2VyMi5rZXkgPT09IGV2ZW50LmtleSAmJiB0cmlnZ2VyMi5jb2RlID09PSBldmVudC5jb2RlKTtcblx0XHQgIGtleSA9IHRyaWdnZXI/LnJlcGxhY2VtZW50fHxrZXk7XG5cdFx0fVxuXHRcdGlmKHRoaXMuc3VnZ2VzdG9yLmlzU3VnZ2VzdGVyRGVwbG95ZWQpe1xuXHRcdFx0aGFuZGxlRHJvcGRvd25OYXZpZ2F0aW9uKGV2ZW50LHZpZXcsdGhpcy5zdWdnZXN0b3IpXG5cdFx0fVxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBoYW5kbGVLZXlkb3duKGtleSwgZXZlbnQuc2hpZnRLZXksIGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSwgaXNDb21wb3NpbmcodmlldywgZXZlbnQpLCB2aWV3KTtcblx0XHRpZiAoc3VjY2VzcykgXG5cdFx0ICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGVsc2UgaWYgKGtleSAhPT0gZXZlbnQua2V5JiZ0cmlnZ2VyKSB7XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0a2V5ID0gdHJpZ2dlci5yZXBsYWNlbWVudDtcblx0XHRcdHJlcGxhY2VSYW5nZSh2aWV3LHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uZnJvbSx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLnRvLGtleSlcblx0XHRcdHNldEN1cnNvcih2aWV3LHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uZnJvbStrZXkubGVuZ3RoKVxuXHQgIH1cblx0fTtcblxuXHRwcml2YXRlIGRlY29yYXQoKXtcblxuXHR9XG59XG5jb25zdCBoYW5kbGVVcGRhdGUgPSAodXBkYXRlOiBWaWV3VXBkYXRlKSA9PiB7XG5cdGNvbnN0IHNldHRpbmdzID0gZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh1cGRhdGUuc3RhdGUpO1xuXG5cdC8vIFRoZSBtYXRoIHRvb2x0aXAgaGFuZGxlciBpcyBkcml2ZW4gYnkgdmlldyB1cGRhdGVzIGJlY2F1c2UgaXQgdXRpbGl6ZXNcblx0Ly8gaW5mb3JtYXRpb24gYWJvdXQgdmlzdWFsIGxpbmUsIHdoaWNoIGlzIG5vdCBhdmFpbGFibGUgaW4gRWRpdG9yU3RhdGVcblx0aWYgKHNldHRpbmdzLm1hdGhQcmV2aWV3RW5hYmxlZCkge1xuXHRcdGhhbmRsZU1hdGhUb29sdGlwKHVwZGF0ZSk7XG5cdH1cblxuXHRoYW5kbGVVbmRvUmVkbyh1cGRhdGUpO1xufVxuXG5jb25zdCBoYW5kbGVEcm9wZG93bk5hdmlnYXRpb249KGV2ZW50OiBLZXlib2FyZEV2ZW50LHZpZXc6RWRpdG9yVmlldyxzdWdnZXN0b3I6IFN1Z2dlc3Rvcik9Pntcblx0Y29uc3QgaXRlbXMgPSBzdWdnZXN0b3IuZ2V0QWxsZHJvcGRvd25JdGVtcygpO1xuXHRzd2l0Y2ggKHRydWUpIHtcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd0Rvd25cIjpcblx0XHRcdHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCA9IChzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXggKyAxKSAlIGl0ZW1zLmxlbmd0aDtcblx0XHRcdHN1Z2dlc3Rvci51cGRhdGVTZWxlY3Rpb24oaXRlbXMpO1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgZXZlbnQua2V5ID09PSBcIkFycm93VXBcIjpcblx0XHRcdHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCA9IChzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXggLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcblx0XHRcdHN1Z2dlc3Rvci51cGRhdGVTZWxlY3Rpb24oaXRlbXMpO1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgZXZlbnQua2V5ID09PSBcIkFycm93TGVmdFwifHxldmVudC5rZXkgPT09IFwiQXJyb3dSaWdodFwiOlxuXHRcdFx0c3VnZ2VzdG9yLnJlbW92ZVN1Z2dlc3RvcigpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBldmVudC5rZXkgPT09IFwiQmFja3NwYWNlXCI6XG5cdFx0XHRzdWdnZXN0b3IucmVtb3ZlU3VnZ2VzdG9yKCk7XG5cdFx0XHQvL3N1Z2dlc3Rvci5kZXBsb3lTdWdnZXN0b3IoY3R4LHZpZXcpXG5cdFx0XHRicmVhaztcblx0XHRkZWZhdWx0OlxuXHRcdFx0YnJlYWs7XG5cdH1cblx0aWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd0Rvd25cIikge1xuXHRcdFxuXHR9ZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcblx0XHRjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXhdO1xuXHRcdHN1Z2dlc3Rvci5zZWxlY3REcm9wZG93bkl0ZW0oc2VsZWN0ZWRJdGVtLHZpZXcpO1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdH0gLyplbHNlIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcblx0XHRkcm9wZG93bi5yZW1vdmUoKTtcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHR9Ki9cbn1cblxuXG5leHBvcnQgY29uc3QgaGFuZGxlS2V5ZG93biA9IChrZXk6IHN0cmluZywgc2hpZnRLZXk6IGJvb2xlYW4sIGN0cmxLZXk6IGJvb2xlYW4sIGlzSU1FOiBib29sZWFuLCB2aWV3OiBFZGl0b3JWaWV3KSA9PiB7XG5cdGNvbnN0IHNldHRpbmdzID0gZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh2aWV3KTtcblx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcblxuXHRsZXQgc3VjY2VzcyA9IGZhbHNlO1xuXG5cdC8qXG5cdCogV2hlbiBiYWNrc3BhY2UgaXMgcHJlc3NlZCwgaWYgdGhlIGN1cnNvciBpcyBpbnNpZGUgYW4gZW1wdHkgaW5saW5lIG1hdGgsXG5cdCogZGVsZXRlIGJvdGggJCBzeW1ib2xzLCBub3QganVzdCB0aGUgZmlyc3Qgb25lLlxuXHQqL1xuXHRpZiAoc2V0dGluZ3MuYXV0b0RlbGV0ZSQgJiYga2V5ID09PSBcIkJhY2tzcGFjZVwiICYmIGN0eC5tb2RlLmluTWF0aCgpKSB7XG5cdFx0Y29uc3QgY2hhckF0UG9zID0gZ2V0Q2hhcmFjdGVyQXRQb3ModmlldywgY3R4LnBvcyk7XG5cdFx0Y29uc3QgY2hhckF0UHJldlBvcyA9IGdldENoYXJhY3RlckF0UG9zKHZpZXcsIGN0eC5wb3MgLSAxKTtcblxuXHRcdGlmIChjaGFyQXRQb3MgPT09IFwiJFwiICYmIGNoYXJBdFByZXZQb3MgPT09IFwiJFwiKSB7XG5cdFx0XHRyZXBsYWNlUmFuZ2UodmlldywgY3R4LnBvcyAtIDEsIGN0eC5wb3MgKyAxLCBcIlwiKTtcblx0XHRcdC8vIE5vdGU6IG5vdCBzdXJlIGlmIHJlbW92ZUFsbFRhYnN0b3BzIGlzIG5lY2Vzc2FyeVxuXHRcdFx0cmVtb3ZlQWxsVGFic3RvcHModmlldyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblx0XG5cdGlmIChzZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQpIHtcblxuXHRcdC8vIFByZXZlbnQgSU1FIGZyb20gdHJpZ2dlcmluZyBrZXlkb3duIGV2ZW50cy5cblx0XHRpZiAoc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FICYmIGlzSU1FKSByZXR1cm47XG5cblx0XHQvLyBBbGxvd3MgQ3RybCArIHogZm9yIHVuZG8sIGluc3RlYWQgb2YgdHJpZ2dlcmluZyBhIHNuaXBwZXQgZW5kaW5nIHdpdGggelxuXHRcdGlmICghY3RybEtleSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c3VjY2VzcyA9IHJ1blNuaXBwZXRzKHZpZXcsIGN0eCwga2V5KTtcblx0XHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2ggKGUpIHtcblx0XHRcdFx0Y2xlYXJTbmlwcGV0UXVldWUodmlldyk7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKGtleSA9PT0gXCJUYWJcIikge1xuXHRcdHN1Y2Nlc3MgPSBzZXRTZWxlY3Rpb25Ub05leHRUYWJzdG9wKHZpZXcpO1xuXG5cdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xuXHR9XG5cdGlmIChjdHgubW9kZS5zdHJpY3RseUluTWF0aCgpKSB7XG5cdFx0aWYgKGtleSA9PT0gXCIvXCIpIHtcblx0XHRcdHN1Y2Nlc3MgPSBydW5BdXRvRnJhY3Rpb24odmlldywgY3R4KTtcblxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGlmIChzZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbmFibGVkICYmIGN0eC5tb2RlLmJsb2NrTWF0aCkge1xuXHRcdGlmIChbXCJUYWJcIiwgXCJFbnRlclwiXS5jb250YWlucyhrZXkpKSB7XG5cdFx0XHRzdWNjZXNzID0gcnVuTWF0cml4U2hvcnRjdXRzKHZpZXcsIGN0eCwga2V5LCBzaGlmdEtleSk7XG5cdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdGlmIChrZXkgPT09IFwiVGFiXCImJnNoaWZ0S2V5KSB7XG5cdFx0c3VjY2VzcyA9IHRhYm91dCh2aWV3LCBjdHgsLTEpO1xuXHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcblx0fVxuXHRlbHNlIGlmIChrZXkgPT09IFwiVGFiXCIgfHwgc2hvdWxkVGFib3V0QnlDbG9zZUJyYWNrZXQodmlldywga2V5KSkge1xuXHRcdHN1Y2Nlc3MgPSB0YWJvdXQodmlldywgY3R4LDEpO1xuXHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn0iXX0=