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
    if (settings.taboutEnabled) {
        if (key === "Tab" || shouldTaboutByCloseBracket(view, key)) {
            success = tabout(view, ctx);
            if (success)
                return true;
        }
    }
    return false;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0RWRpdG9yRXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXRFZGl0b3JFeHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUEwQixRQUFRLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQztBQUM3RixPQUFPLEVBQWUsSUFBSSxFQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVqSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM1RyxPQUFPLEVBQUUsY0FBYyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHdkY7Ozs7RUFJRTtBQUlGLE1BQU0sT0FBTyxnQkFBZ0I7SUFDakIsMEJBQTBCLEdBQVksS0FBSyxDQUFDO0lBQzVDLGdCQUFnQixHQUFzQixJQUFJLENBQUM7SUFDM0MsZ0JBQWdCLEdBQVksS0FBSyxDQUFDO0lBQ2xDLFNBQVMsR0FBYyxJQUFJLFNBQVMsRUFBRSxDQUFDO0lBRXZDLG1CQUFtQjtRQUN2QixPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxHQUFVO1FBQ2hDLE9BQU8sR0FBRyxDQUFDLGdCQUFnQixDQUFDLE1BQU07WUFBRSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDL0QsR0FBRyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQztZQUN6Qiw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDO1lBQzVDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3hFLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQztZQUMxQyxpQkFBaUI7U0FDakIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBQzdCLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNuQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLG9CQUFvQixDQUFDO1lBQ3BELEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFDQSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDL0QsR0FBRyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuRSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDO1lBQ3pCLGtCQUFrQixDQUFDLFNBQVM7WUFDNUIsc0JBQXNCO1lBQ3RCLFFBQVEsQ0FBQyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQztTQUNsQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU1QixNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFbkQsR0FBRyxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFHVSxPQUFPLENBQUMsR0FBVTtRQUN0QixHQUFHLENBQUMsdUJBQXVCLENBQUM7WUFDeEIsSUFBSSxDQUFDLE9BQU8sQ0FDUixVQUFVLENBQUMsZ0JBQWdCLENBQUM7Z0JBQ3hCLE9BQU8sRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtvQkFDckIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQzVCLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQ2pELElBQUksQ0FBQywwQkFBMEIsR0FBRyxJQUFJLENBQUM7b0JBQzNDLENBQUM7Z0JBQ0wsQ0FBQztnQkFDaEIsU0FBUyxFQUFFLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO29CQUMxQjs7Ozs7dUJBS0c7Z0JBQ0osQ0FBQztnQkFDYyxLQUFLLEVBQUUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7b0JBQ25CLCtCQUErQjtvQkFDL0IsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQztnQkFDakMsQ0FBQzthQUNKLENBQUMsQ0FDTDtZQUNELFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7Z0JBQ3BDLElBQUksSUFBSSxDQUFDLDBCQUEwQixJQUFJLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDdkQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ2hDLElBQUksQ0FBQywwQkFBMEIsR0FBRyxLQUFLLENBQUM7Z0JBQzVDLENBQUM7WUFDTCxDQUFDLENBQUM7U0FDTCxDQUFDLENBQUM7UUFFSCw4Q0FBOEM7UUFDOUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3pDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUNuRCxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDakQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ1QsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ2hELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUMxQyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDakQsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUE7WUFDbkQsQ0FBQztRQUNYLENBQUMsQ0FBQyxDQUFDO0lBQ0QsQ0FBQztJQUVPLGlCQUFpQixDQUFDLEdBQVU7UUFDdEMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQztZQUN6QixrQkFBa0IsQ0FBQyxTQUFTO1lBQzVCLHNCQUFzQixDQUFDLFNBQVM7WUFDaEMsc0JBQXNCO1NBQ3RCLENBQUMsQ0FBQztJQUNKLENBQUM7SUFHVSxtQkFBbUIsQ0FBQyxHQUFVO1FBQ2xDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FDdkIsVUFBVSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUU7WUFDOUIsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVztTQUNsQyxDQUNGLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDSSxZQUFZLENBQUMsS0FBaUIsRUFBQyxJQUFnQjtRQUN0RCxNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFM0UsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQ25FLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLE1BQWMsQ0FBQyxDQUNuQyxDQUFDO1FBQ0YsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDckUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEdBQUMsS0FBSyxDQUFBO1lBQ25DLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQyxDQUFBO1FBQ2hELENBQUM7SUFDRixDQUFDO0lBQ08sT0FBTyxHQUFDLENBQUMsS0FBaUIsRUFBQyxJQUFnQixFQUFDLEVBQUU7UUFDckQsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTNFLDZDQUE2QztRQUM3QyxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDbkUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBYyxDQUFDLENBQ25DLENBQUM7UUFDRixJQUFJLGlCQUFpQixFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxpQkFBaUIsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUMzRCxDQUFDO1FBQ0QsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUN6RSxNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQ2pFLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLE1BQWMsQ0FBQyxDQUNuQyxDQUFDO1FBQ0YsSUFBRyxDQUFDLGVBQWUsRUFBQyxDQUFDO1lBQ3BCLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxFQUFFLENBQUE7UUFDakMsQ0FBQztJQUVGLENBQUMsQ0FBQTtJQUNPLGFBQWEsR0FBQyxDQUFDLElBQWdCLEVBQUMsRUFBRTtRQUN6QyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25DLElBQUksR0FBRyxDQUFDLGlCQUFpQixLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBQyxJQUFJLENBQUMsQ0FBQTtRQUN6QyxDQUFDO0lBQ0YsQ0FBQyxDQUFBO0lBRU8sU0FBUyxHQUFHLENBQUMsS0FBb0IsRUFBRSxJQUFnQixFQUFFLEVBQUU7UUFDOUQsSUFBSSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQztRQUNwQixJQUFJLE9BQU8sQ0FBQTtRQUNYLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUM7WUFDL0QsT0FBTyxHQUFHLDBDQUEwQyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEdBQUcsS0FBSyxLQUFLLENBQUMsR0FBRyxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BJLEdBQUcsR0FBRyxPQUFPLEVBQUUsV0FBVyxJQUFFLEdBQUcsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsSUFBRyxJQUFJLENBQUMsU0FBUyxDQUFDLG1CQUFtQixFQUFDLENBQUM7WUFDdEMsd0JBQXdCLENBQUMsS0FBSyxFQUFDLElBQUksRUFBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDcEQsQ0FBQztRQUNELE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsT0FBTyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuSCxJQUFJLE9BQU87WUFDVCxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7YUFDcEIsSUFBSSxHQUFHLEtBQUssS0FBSyxDQUFDLEdBQUcsSUFBRSxPQUFPLEVBQUUsQ0FBQztZQUNyQyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDdkIsR0FBRyxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUM7WUFDMUIsWUFBWSxDQUFDLElBQUksRUFBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUMsR0FBRyxDQUFDLENBQUE7WUFDbEYsU0FBUyxDQUFDLElBQUksRUFBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN6RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRU0sT0FBTztJQUVmLENBQUM7Q0FDRDtBQUNELE1BQU0sWUFBWSxHQUFHLENBQUMsTUFBa0IsRUFBRSxFQUFFO0lBQzNDLE1BQU0sUUFBUSxHQUFHLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUVuRCx5RUFBeUU7SUFDekUsdUVBQXVFO0lBQ3ZFLElBQUksUUFBUSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDakMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVELGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN4QixDQUFDLENBQUE7QUFFRCxNQUFNLHdCQUF3QixHQUFDLENBQUMsS0FBb0IsRUFBQyxJQUFlLEVBQUMsU0FBb0IsRUFBQyxFQUFFO0lBQzNGLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO0lBQzlDLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDZCxLQUFLLEtBQUssQ0FBQyxHQUFHLEtBQUssV0FBVztZQUM3QixTQUFTLENBQUMsY0FBYyxHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO1lBQ3pFLFNBQVMsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakMsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3ZCLE1BQU07UUFDUCxLQUFLLEtBQUssQ0FBQyxHQUFHLEtBQUssU0FBUztZQUMzQixTQUFTLENBQUMsY0FBYyxHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDeEYsU0FBUyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqQyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDdkIsTUFBTTtRQUNQLEtBQUssS0FBSyxDQUFDLEdBQUcsS0FBSyxXQUFXLElBQUUsS0FBSyxDQUFDLEdBQUcsS0FBSyxZQUFZO1lBQ3pELFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUM1QixNQUFNO1FBQ1AsS0FBSyxLQUFLLENBQUMsR0FBRyxLQUFLLFdBQVc7WUFDN0IsU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzVCLHFDQUFxQztZQUNyQyxNQUFNO1FBQ1A7WUFDQyxNQUFNO0lBQ1IsQ0FBQztJQUNELElBQUksS0FBSyxDQUFDLEdBQUcsS0FBSyxXQUFXLEVBQUUsQ0FBQztJQUVoQyxDQUFDO1NBQUssSUFBSSxLQUFLLENBQUMsR0FBRyxLQUFLLE9BQU8sRUFBRSxDQUFDO1FBQ2pDLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDckQsU0FBUyxDQUFDLGtCQUFrQixDQUFDLFlBQVksRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7SUFDeEIsQ0FBQyxDQUFDOzs7T0FHQztBQUNKLENBQUMsQ0FBQTtBQUdELE1BQU0sQ0FBQyxNQUFNLGFBQWEsR0FBRyxDQUFDLEdBQVcsRUFBRSxRQUFpQixFQUFFLE9BQWdCLEVBQUUsS0FBYyxFQUFFLElBQWdCLEVBQUUsRUFBRTtJQUNuSCxNQUFNLFFBQVEsR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMzQyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRW5DLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQztJQUVwQjs7O01BR0U7SUFDRixJQUFJLFFBQVEsQ0FBQyxXQUFXLElBQUksR0FBRyxLQUFLLFdBQVcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7UUFDdEUsTUFBTSxTQUFTLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuRCxNQUFNLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUUzRCxJQUFJLFNBQVMsS0FBSyxHQUFHLElBQUksYUFBYSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ2hELFlBQVksQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDakQsbURBQW1EO1lBQ25ELGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLFFBQVEsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUU5Qiw4Q0FBOEM7UUFDOUMsSUFBSSxRQUFRLENBQUMsMkJBQTJCLElBQUksS0FBSztZQUFFLE9BQU87UUFFMUQsMEVBQTBFO1FBQzFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQztnQkFDSixPQUFPLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ3RDLElBQUksT0FBTztvQkFBRSxPQUFPLElBQUksQ0FBQztZQUMxQixDQUFDO1lBQ0QsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDVixpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDeEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLEdBQUcsS0FBSyxLQUFLLEVBQUUsQ0FBQztRQUNuQixPQUFPLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFMUMsSUFBSSxPQUFPO1lBQUUsT0FBTyxJQUFJLENBQUM7SUFDMUIsQ0FBQztJQUNELElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDO1FBQy9CLElBQUksR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRXJDLElBQUksT0FBTztnQkFBRSxPQUFPLElBQUksQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksUUFBUSxDQUFDLHNCQUFzQixJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDM0QsSUFBSSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNwQyxPQUFPLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFdkQsSUFBSSxPQUFPO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDNUIsSUFBSSxHQUFHLEtBQUssS0FBSyxJQUFJLDBCQUEwQixDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzVELE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBRTVCLElBQUksT0FBTztnQkFBRSxPQUFPLElBQUksQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE1vc2hlIGZyb20gXCIuL21haW5cIjtcclxuaW1wb3J0IHsgZ2V0VGlrelN1Z2dlc3Rpb25zLCBMYXRleCB9IGZyb20gXCIuL3V0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3UGx1Z2luLCBWaWV3VXBkYXRlICxEZWNvcmF0aW9uLCB0b29sdGlwcywgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSwgUHJlYyxFeHRlbnNpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgQ29udGV4dCB9IGZyb20gXCIuL3V0aWxzL2NvbnRleHRcIjtcclxuaW1wb3J0IHsgaXNDb21wb3NpbmcsIHJlcGxhY2VSYW5nZSwgc2V0Q3Vyc29yIH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9lZGl0b3JfdXRpbHNcIjtcclxuaW1wb3J0IHsga2V5Ym9hcmRBdXRvUmVwbGFjZUhlYnJld1RvRW5nbGlzaFRyaWdnZXJzIH0gZnJvbSBcIi4vc3RhdGljRGF0YS9tYXRoUGFyc2VyU3RhdGljRGF0YVwiO1xyXG5pbXBvcnQgeyBnZXRDaGFyYWN0ZXJBdFBvcywgU3VnZ2VzdG9yIH0gZnJvbSBcIi4vc3VnZ2VzdG9yXCI7XHJcbmltcG9ydCB7IFJ0bEZvcmMgfSBmcm9tIFwiLi9lZGl0b3JEZWNvcmF0aW9uc1wiO1xyXG5pbXBvcnQgeyBzZXRTZWxlY3Rpb25Ub05leHRUYWJzdG9wIH0gZnJvbSBcIi4vc25pcHBldHMvc25pcHBldF9tYW5hZ2VtZW50XCI7XHJcblxyXG5pbXBvcnQgeyBydW5TbmlwcGV0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL3J1bl9zbmlwcGV0c1wiO1xyXG5pbXBvcnQgeyBnZXRMYXRleFN1aXRlQ29uZmlnLCBnZXRMYXRleFN1aXRlQ29uZmlnRXh0ZW5zaW9uIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci9jb25maWdcIjtcclxuaW1wb3J0IHsgcnVuQXV0b0ZyYWN0aW9uIH0gZnJvbSBcIi4vZmVhdHVyZXMvYXV0b2ZyYWN0aW9uXCI7XHJcbmltcG9ydCB7IHJ1bk1hdHJpeFNob3J0Y3V0cyB9IGZyb20gXCIuL2ZlYXR1cmVzL21hdHJpeF9zaG9ydGN1dHNcIjtcclxuaW1wb3J0IHsgc2hvdWxkVGFib3V0QnlDbG9zZUJyYWNrZXQsIHRhYm91dCB9IGZyb20gXCIuL2ZlYXR1cmVzL3RhYm91dFwiO1xyXG5pbXBvcnQgeyBzbmlwcGV0RXh0ZW5zaW9ucyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvZXh0ZW5zaW9uc1wiO1xyXG5pbXBvcnQgeyBjb2xvclBhaXJlZEJyYWNrZXRzUGx1Z2luTG93ZXN0UHJlYywgaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNQbHVnaW4gfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9oaWdobGlnaHRfYnJhY2tldHNcIjtcclxuaW1wb3J0IHsgbWtDb25jZWFsUGx1Z2luIH0gZnJvbSBcIi4vZWRpdG9yX2V4dGVuc2lvbnMvY29uY2VhbFwiO1xyXG5pbXBvcnQgeyBjdXJzb3JUb29sdGlwQmFzZVRoZW1lLCBjdXJzb3JUb29sdGlwRmllbGQsIGhhbmRsZU1hdGhUb29sdGlwIH0gZnJvbSBcIi4vZWRpdG9yX2V4dGVuc2lvbnMvbWF0aF90b29sdGlwXCI7XHJcbmltcG9ydCB7IGNvbnRleHQgfSBmcm9tIFwiZXNidWlsZC13YXNtXCI7XHJcbmltcG9ydCB7IHJlbW92ZUFsbFRhYnN0b3BzLCB0YWJzdG9wc1N0YXRlRmllbGQgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL3RhYnN0b3BzX3N0YXRlX2ZpZWxkXCI7XHJcbmltcG9ydCB7IGNsZWFyU25pcHBldFF1ZXVlLCBzbmlwcGV0UXVldWVTdGF0ZUZpZWxkIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci9zbmlwcGV0X3F1ZXVlX3N0YXRlX2ZpZWxkXCI7XHJcbmltcG9ydCB7IGhhbmRsZVVuZG9SZWRvLCBzbmlwcGV0SW52ZXJ0ZWRFZmZlY3RzIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci9oaXN0b3J5XCI7XHJcblxyXG5cclxuLypcclxuY2xhc3M9XCJjbS1ndXR0ZXJzXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCIgc3R5bGU9XCJtaW4taGVpZ2h0OiA3ODY1cHg7IHBvc2l0aW9uOiBzdGlja3k7XCJcclxuc3BlbGxjaGVjaz1cImZhbHNlXCIgYXV0b2NvcnJlY3Q9XCJvZmZcIiB0cmFuc2xhdGU9XCJub1wiIGNvbnRlbnRlZGl0YWJsZT1cInRydWVcIlxyXG5cclxuKi9cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEVkaXRvckV4dGVuc2lvbnMge1xyXG4gICAgcHJpdmF0ZSBzaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBhY3RpdmVFZGl0b3JWaWV3OiBFZGl0b3JWaWV3IHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIHN1Z2dlc3Rpb25BY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgc3VnZ2VzdG9yOiBTdWdnZXN0b3IgPSBuZXcgU3VnZ2VzdG9yKCk7XHJcblxyXG4gICAgcHJpdmF0ZSBpc1N1Z2dlc3RlckRlcGxveWVkKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiAhIWRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvcihcIi5zdWdnZXN0aW9uLWRyb3Bkb3duXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHNldEVkaXRvckV4dGVuc2lvbnMoYXBwOiBNb3NoZSkge1xyXG5cdFx0d2hpbGUgKGFwcC5lZGl0b3JFeHRlbnNpb25zLmxlbmd0aCkgYXBwLmVkaXRvckV4dGVuc2lvbnMucG9wKCk7XHJcblx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKFtcclxuXHRcdFx0Z2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbihhcHAuQ01TZXR0aW5ncyksXHJcblx0XHRcdFByZWMuaGlnaGVzdChFZGl0b3JWaWV3LmRvbUV2ZW50SGFuZGxlcnMoeyBcImtleWRvd25cIjogdGhpcy5vbktleWRvd24gfSkpLFxyXG5cdFx0XHRFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKGhhbmRsZVVwZGF0ZSksXHJcblx0XHRcdHNuaXBwZXRFeHRlbnNpb25zLFxyXG5cdFx0XSk7XHJcblx0XHR0aGlzLnJlZ2lzdGVyRGVjb3JhdGlvbnMoYXBwKVxyXG5cdFx0aWYgKGFwcC5DTVNldHRpbmdzLmNvbmNlYWxFbmFibGVkKSB7XHJcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBhcHAuQ01TZXR0aW5ncy5jb25jZWFsUmV2ZWFsVGltZW91dDtcclxuXHRcdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChta0NvbmNlYWxQbHVnaW4odGltZW91dCkuZXh0ZW5zaW9uKTtcclxuXHRcdH1cclxuXHRcdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChjb2xvclBhaXJlZEJyYWNrZXRzUGx1Z2luTG93ZXN0UHJlYyk7XHJcblx0XHRcdGFwcC5lZGl0b3JFeHRlbnNpb25zLnB1c2goaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNQbHVnaW4uZXh0ZW5zaW9uKTtcclxuXHRcdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXHJcblx0XHRcdFx0Y3Vyc29yVG9vbHRpcEZpZWxkLmV4dGVuc2lvbixcclxuXHRcdFx0XHRjdXJzb3JUb29sdGlwQmFzZVRoZW1lLFxyXG5cdFx0XHRcdHRvb2x0aXBzKHsgcG9zaXRpb246IFwiYWJzb2x1dGVcIiB9KSxcclxuXHRcdFx0XSk7XHJcblxyXG5cdFx0dGhpcy5tb25pdG9yKGFwcCk7IFxyXG5cdFx0dGhpcy5zbmlwcGV0RXh0ZW5zaW9ucyhhcHApO1xyXG5cdFxyXG5cdFx0Y29uc3QgZmxhdEV4dGVuc2lvbnMgPSBhcHAuZWRpdG9yRXh0ZW5zaW9ucy5mbGF0KCk7XHJcblx0XHJcblx0XHRhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oZmxhdEV4dGVuc2lvbnMpO1xyXG5cdH1cclxuXHRcclxuXHJcbiAgICBwcml2YXRlIG1vbml0b3IoYXBwOiBNb3NoZSkge1xyXG4gICAgICAgIGFwcC5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbXHJcbiAgICAgICAgICAgIFByZWMuaGlnaGVzdChcclxuICAgICAgICAgICAgICAgIEVkaXRvclZpZXcuZG9tRXZlbnRIYW5kbGVycyh7XHJcbiAgICAgICAgICAgICAgICAgICAga2V5ZG93bjogKGV2ZW50LCB2aWV3KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25LZXlkb3duKGV2ZW50LCB2aWV3KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUuc3RhcnRzV2l0aChcIktleVwiKSAmJiAhZXZlbnQuY3RybEtleSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG5cdFx0XHRcdFx0bW91c2Vtb3ZlOiAoZXZlbnQsIHZpZXcpID0+IHtcclxuXHRcdFx0XHRcdFx0Lypjb25zdCB7IGNsaWVudFgsIGNsaWVudFkgfSA9IGV2ZW50O1xyXG5cdFx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHZpZXcucG9zQXRDb29yZHMoeyB4OiBjbGllbnRYLCB5OiBjbGllbnRZIH0pO1xyXG5cdFxyXG5cdFx0XHRcdFx0XHRpZiAocG9zaXRpb24pIHtcclxuXHRcdFx0XHRcdFx0XHQvL3RoaXMub25DdXJzb3JNb3ZlKGV2ZW50LCB2aWV3KTtcclxuXHRcdFx0XHRcdFx0fSovXHJcblx0XHRcdFx0XHR9LFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzOiAoZXZlbnQsIHZpZXcpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVHJhY2sgdGhlIGFjdGl2ZSBlZGl0b3Igdmlld1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUVkaXRvclZpZXcgPSB2aWV3O1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApLFxyXG4gICAgICAgICAgICBFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKCh1cGRhdGUpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uICYmIHVwZGF0ZS5kb2NDaGFuZ2VkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vblRyYW5zYWN0aW9uKHVwZGF0ZS52aWV3KTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0pO1xyXG5cclxuICAgICAgICAvLyBHbG9iYWwgY2xpY2sgbGlzdGVuZXIgdG8gaGFuZGxlIHN1Z2dlc3Rpb25zXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnN1Z2dlc3Rpb25BY3RpdmUgPSB0aGlzLmlzU3VnZ2VzdGVyRGVwbG95ZWQoKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc3VnZ2VzdGlvbkFjdGl2ZSAmJiB0aGlzLmFjdGl2ZUVkaXRvclZpZXcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMub25DbGljayhldmVudCwgdGhpcy5hY3RpdmVFZGl0b3JWaWV3KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgKGV2ZW50KSA9PiB7XHJcblx0XHRcdHRoaXMuc3VnZ2VzdGlvbkFjdGl2ZSA9IHRoaXMuaXNTdWdnZXN0ZXJEZXBsb3llZCgpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5zdWdnZXN0aW9uQWN0aXZlICYmIHRoaXMuYWN0aXZlRWRpdG9yVmlldykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vbkN1cnNvck1vdmUoZXZlbnQsIHRoaXMuYWN0aXZlRWRpdG9yVmlldylcclxuICAgICAgICAgICAgfVxyXG5cdFx0fSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzbmlwcGV0RXh0ZW5zaW9ucyhhcHA6IE1vc2hlKSB7XHJcblx0XHRhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKFtcclxuXHRcdFx0dGFic3RvcHNTdGF0ZUZpZWxkLmV4dGVuc2lvbixcclxuXHRcdFx0c25pcHBldFF1ZXVlU3RhdGVGaWVsZC5leHRlbnNpb24sXHJcblx0XHRcdHNuaXBwZXRJbnZlcnRlZEVmZmVjdHMsXHJcblx0XHRdKTtcclxuXHR9XHJcblx0XHJcblxyXG4gICAgcHJpdmF0ZSByZWdpc3RlckRlY29yYXRpb25zKGFwcDogTW9zaGUpe1xyXG4gICAgICAgIGFwcC5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcclxuICAgICAgICAgICAgVmlld1BsdWdpbi5mcm9tQ2xhc3MoUnRsRm9yYywge1xyXG4gICAgICAgICAgICBkZWNvcmF0aW9uczogKHYpID0+IHYuZGVjb3JhdGlvbnMsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKSk7XHJcbiAgICB9XHJcblx0cHJpdmF0ZSBvbkN1cnNvck1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQsdmlldzogRWRpdG9yVmlldyl7XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uSXRlbXMgPSBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpO1xyXG5cclxuXHRcdGNvbnN0IGNsaWNrZWRTdWdnZXN0aW9uID0gQXJyYXkuZnJvbShzdWdnZXN0aW9uSXRlbXMpLmZpbmQoKGl0ZW0pID0+XHJcblx0XHRcdGl0ZW0uY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpXHJcblx0XHQpO1xyXG5cdFx0aWYgKGNsaWNrZWRTdWdnZXN0aW9uKSB7XHJcblx0XHRcdGNvbnN0IGluZGV4ID0gQXJyYXkuZnJvbShzdWdnZXN0aW9uSXRlbXMpLmluZGV4T2YoY2xpY2tlZFN1Z2dlc3Rpb24pO1xyXG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleD1pbmRleFxyXG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci51cGRhdGVTZWxlY3Rpb24oc3VnZ2VzdGlvbkl0ZW1zKVxyXG5cdFx0fVxyXG5cdH1cclxuXHRwcml2YXRlIG9uQ2xpY2s9KGV2ZW50OiBNb3VzZUV2ZW50LHZpZXc6IEVkaXRvclZpZXcpPT57XHJcblx0XHRjb25zdCBzdWdnZXN0aW9uSXRlbXMgPSBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc3VnZ2VzdGlvbi1pdGVtXCIpO1xyXG5cdFxyXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGNsaWNrIGlzIG9uIGEgc3VnZ2VzdGlvbiBpdGVtXHJcblx0XHRjb25zdCBjbGlja2VkU3VnZ2VzdGlvbiA9IEFycmF5LmZyb20oc3VnZ2VzdGlvbkl0ZW1zKS5maW5kKChpdGVtKSA9PlxyXG5cdFx0XHRpdGVtLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxyXG5cdFx0KTtcclxuXHRcdGlmIChjbGlja2VkU3VnZ2VzdGlvbikge1xyXG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci5zZWxlY3REcm9wZG93bkl0ZW0oY2xpY2tlZFN1Z2dlc3Rpb24sdmlldyk7XHJcblx0XHR9XHJcblx0XHRjb25zdCBkcm9wZG93bkl0ZW0gPSBkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCIuc3VnZ2VzdGlvbi1kcm9wZG93blwiKTtcclxuXHRcdGNvbnN0IGNsaWNrZWREcm9wZG93biA9IEFycmF5LmZyb20oc3VnZ2VzdGlvbkl0ZW1zKS5maW5kKChpdGVtKSA9PlxyXG5cdFx0XHRpdGVtLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxyXG5cdFx0KTtcclxuXHRcdGlmKCFjbGlja2VkRHJvcGRvd24pe1xyXG5cdFx0XHR0aGlzLnN1Z2dlc3Rvci5yZW1vdmVTdWdnZXN0b3IoKVxyXG5cdFx0fVxyXG5cdFx0XHJcblx0fVxyXG5cdHByaXZhdGUgb25UcmFuc2FjdGlvbj0odmlldzogRWRpdG9yVmlldyk9PiB7XHJcblx0XHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xyXG5cdFx0aWYgKGN0eC5jb2RlYmxvY2tMYW5ndWFnZSA9PT0gXCJ0aWt6XCIpIHtcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3IuZGVwbG95U3VnZ2VzdG9yKGN0eCx2aWV3KVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBvbktleWRvd24gPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQsIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcclxuXHRcdGxldCBrZXkgPSBldmVudC5rZXk7XHJcblx0XHRsZXQgdHJpZ2dlclxyXG5cdFx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHRcdGlmICghKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkgJiYgY3R4LnNob3VsZFRyYW5zbGF0ZSgpKSB7XHJcblx0XHQgIHRyaWdnZXIgPSBrZXlib2FyZEF1dG9SZXBsYWNlSGVicmV3VG9FbmdsaXNoVHJpZ2dlcnMuZmluZCgodHJpZ2dlcjIpID0+IHRyaWdnZXIyLmtleSA9PT0gZXZlbnQua2V5ICYmIHRyaWdnZXIyLmNvZGUgPT09IGV2ZW50LmNvZGUpO1xyXG5cdFx0ICBrZXkgPSB0cmlnZ2VyPy5yZXBsYWNlbWVudHx8a2V5O1xyXG5cdFx0fVxyXG5cdFx0aWYodGhpcy5zdWdnZXN0b3IuaXNTdWdnZXN0ZXJEZXBsb3llZCl7XHJcblx0XHRcdGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbihldmVudCx2aWV3LHRoaXMuc3VnZ2VzdG9yKVxyXG5cdFx0fVxyXG5cdFx0Y29uc3Qgc3VjY2VzcyA9IGhhbmRsZUtleWRvd24oa2V5LCBldmVudC5zaGlmdEtleSwgZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5LCBpc0NvbXBvc2luZyh2aWV3LCBldmVudCksIHZpZXcpO1xyXG5cdFx0aWYgKHN1Y2Nlc3MpIFxyXG5cdFx0ICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0ZWxzZSBpZiAoa2V5ICE9PSBldmVudC5rZXkmJnRyaWdnZXIpIHtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdFx0a2V5ID0gdHJpZ2dlci5yZXBsYWNlbWVudDtcclxuXHRcdFx0cmVwbGFjZVJhbmdlKHZpZXcsdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5mcm9tLHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4udG8sa2V5KVxyXG5cdFx0XHRzZXRDdXJzb3Iodmlldyx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmZyb20ra2V5Lmxlbmd0aClcclxuXHQgIH1cclxuXHR9O1xyXG5cclxuXHRwcml2YXRlIGRlY29yYXQoKXtcclxuXHJcblx0fVxyXG59XHJcbmNvbnN0IGhhbmRsZVVwZGF0ZSA9ICh1cGRhdGU6IFZpZXdVcGRhdGUpID0+IHtcclxuXHRjb25zdCBzZXR0aW5ncyA9IGdldExhdGV4U3VpdGVDb25maWcodXBkYXRlLnN0YXRlKTtcclxuXHJcblx0Ly8gVGhlIG1hdGggdG9vbHRpcCBoYW5kbGVyIGlzIGRyaXZlbiBieSB2aWV3IHVwZGF0ZXMgYmVjYXVzZSBpdCB1dGlsaXplc1xyXG5cdC8vIGluZm9ybWF0aW9uIGFib3V0IHZpc3VhbCBsaW5lLCB3aGljaCBpcyBub3QgYXZhaWxhYmxlIGluIEVkaXRvclN0YXRlXHJcblx0aWYgKHNldHRpbmdzLm1hdGhQcmV2aWV3RW5hYmxlZCkge1xyXG5cdFx0aGFuZGxlTWF0aFRvb2x0aXAodXBkYXRlKTtcclxuXHR9XHJcblxyXG5cdGhhbmRsZVVuZG9SZWRvKHVwZGF0ZSk7XHJcbn1cclxuXHJcbmNvbnN0IGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbj0oZXZlbnQ6IEtleWJvYXJkRXZlbnQsdmlldzpFZGl0b3JWaWV3LHN1Z2dlc3RvcjogU3VnZ2VzdG9yKT0+e1xyXG5cdGNvbnN0IGl0ZW1zID0gc3VnZ2VzdG9yLmdldEFsbGRyb3Bkb3duSXRlbXMoKTtcclxuXHRzd2l0Y2ggKHRydWUpIHtcclxuXHRcdGNhc2UgZXZlbnQua2V5ID09PSBcIkFycm93RG93blwiOlxyXG5cdFx0XHRzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXggPSAoc3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ICsgMSkgJSBpdGVtcy5sZW5ndGg7XHJcblx0XHRcdHN1Z2dlc3Rvci51cGRhdGVTZWxlY3Rpb24oaXRlbXMpO1xyXG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0XHRicmVhaztcclxuXHRcdGNhc2UgZXZlbnQua2V5ID09PSBcIkFycm93VXBcIjpcclxuXHRcdFx0c3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ID0gKHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCAtIDEgKyBpdGVtcy5sZW5ndGgpICUgaXRlbXMubGVuZ3RoO1xyXG5cdFx0XHRzdWdnZXN0b3IudXBkYXRlU2VsZWN0aW9uKGl0ZW1zKTtcclxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHRjYXNlIGV2ZW50LmtleSA9PT0gXCJBcnJvd0xlZnRcInx8ZXZlbnQua2V5ID09PSBcIkFycm93UmlnaHRcIjpcclxuXHRcdFx0c3VnZ2VzdG9yLnJlbW92ZVN1Z2dlc3RvcigpO1xyXG5cdFx0XHRicmVhaztcclxuXHRcdGNhc2UgZXZlbnQua2V5ID09PSBcIkJhY2tzcGFjZVwiOlxyXG5cdFx0XHRzdWdnZXN0b3IucmVtb3ZlU3VnZ2VzdG9yKCk7XHJcblx0XHRcdC8vc3VnZ2VzdG9yLmRlcGxveVN1Z2dlc3RvcihjdHgsdmlldylcclxuXHRcdFx0YnJlYWs7XHJcblx0XHRkZWZhdWx0OlxyXG5cdFx0XHRicmVhaztcclxuXHR9XHJcblx0aWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd0Rvd25cIikge1xyXG5cdFx0XHJcblx0fWVsc2UgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XHJcblx0XHRjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXhdO1xyXG5cdFx0c3VnZ2VzdG9yLnNlbGVjdERyb3Bkb3duSXRlbShzZWxlY3RlZEl0ZW0sdmlldyk7XHJcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdH0gLyplbHNlIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcclxuXHRcdGRyb3Bkb3duLnJlbW92ZSgpO1xyXG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHR9Ki9cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVLZXlkb3duID0gKGtleTogc3RyaW5nLCBzaGlmdEtleTogYm9vbGVhbiwgY3RybEtleTogYm9vbGVhbiwgaXNJTUU6IGJvb2xlYW4sIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcclxuXHRjb25zdCBzZXR0aW5ncyA9IGdldExhdGV4U3VpdGVDb25maWcodmlldyk7XHJcblx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcclxuXHJcblx0bGV0IHN1Y2Nlc3MgPSBmYWxzZTtcclxuXHJcblx0LypcclxuXHQqIFdoZW4gYmFja3NwYWNlIGlzIHByZXNzZWQsIGlmIHRoZSBjdXJzb3IgaXMgaW5zaWRlIGFuIGVtcHR5IGlubGluZSBtYXRoLFxyXG5cdCogZGVsZXRlIGJvdGggJCBzeW1ib2xzLCBub3QganVzdCB0aGUgZmlyc3Qgb25lLlxyXG5cdCovXHJcblx0aWYgKHNldHRpbmdzLmF1dG9EZWxldGUkICYmIGtleSA9PT0gXCJCYWNrc3BhY2VcIiAmJiBjdHgubW9kZS5pbk1hdGgoKSkge1xyXG5cdFx0Y29uc3QgY2hhckF0UG9zID0gZ2V0Q2hhcmFjdGVyQXRQb3ModmlldywgY3R4LnBvcyk7XHJcblx0XHRjb25zdCBjaGFyQXRQcmV2UG9zID0gZ2V0Q2hhcmFjdGVyQXRQb3ModmlldywgY3R4LnBvcyAtIDEpO1xyXG5cclxuXHRcdGlmIChjaGFyQXRQb3MgPT09IFwiJFwiICYmIGNoYXJBdFByZXZQb3MgPT09IFwiJFwiKSB7XHJcblx0XHRcdHJlcGxhY2VSYW5nZSh2aWV3LCBjdHgucG9zIC0gMSwgY3R4LnBvcyArIDEsIFwiXCIpO1xyXG5cdFx0XHQvLyBOb3RlOiBub3Qgc3VyZSBpZiByZW1vdmVBbGxUYWJzdG9wcyBpcyBuZWNlc3NhcnlcclxuXHRcdFx0cmVtb3ZlQWxsVGFic3RvcHModmlldyk7XHJcblx0XHRcdHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRcclxuXHRpZiAoc2V0dGluZ3Muc25pcHBldHNFbmFibGVkKSB7XHJcblxyXG5cdFx0Ly8gUHJldmVudCBJTUUgZnJvbSB0cmlnZ2VyaW5nIGtleWRvd24gZXZlbnRzLlxyXG5cdFx0aWYgKHNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSAmJiBpc0lNRSkgcmV0dXJuO1xyXG5cclxuXHRcdC8vIEFsbG93cyBDdHJsICsgeiBmb3IgdW5kbywgaW5zdGVhZCBvZiB0cmlnZ2VyaW5nIGEgc25pcHBldCBlbmRpbmcgd2l0aCB6XHJcblx0XHRpZiAoIWN0cmxLZXkpIHtcclxuXHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRzdWNjZXNzID0gcnVuU25pcHBldHModmlldywgY3R4LCBrZXkpO1xyXG5cdFx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcclxuXHRcdFx0fVxyXG5cdFx0XHRjYXRjaCAoZSkge1xyXG5cdFx0XHRcdGNsZWFyU25pcHBldFF1ZXVlKHZpZXcpO1xyXG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGlmIChrZXkgPT09IFwiVGFiXCIpIHtcclxuXHRcdHN1Y2Nlc3MgPSBzZXRTZWxlY3Rpb25Ub05leHRUYWJzdG9wKHZpZXcpO1xyXG5cclxuXHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcclxuXHR9XHJcblx0aWYgKGN0eC5tb2RlLnN0cmljdGx5SW5NYXRoKCkpIHtcclxuXHRcdGlmIChrZXkgPT09IFwiL1wiKSB7XHJcblx0XHRcdHN1Y2Nlc3MgPSBydW5BdXRvRnJhY3Rpb24odmlldywgY3R4KTtcclxuXHJcblx0XHRcdGlmIChzdWNjZXNzKSByZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGlmIChzZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbmFibGVkICYmIGN0eC5tb2RlLmJsb2NrTWF0aCkge1xyXG5cdFx0aWYgKFtcIlRhYlwiLCBcIkVudGVyXCJdLmNvbnRhaW5zKGtleSkpIHtcclxuXHRcdFx0c3VjY2VzcyA9IHJ1bk1hdHJpeFNob3J0Y3V0cyh2aWV3LCBjdHgsIGtleSwgc2hpZnRLZXkpO1xyXG5cclxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0aWYgKHNldHRpbmdzLnRhYm91dEVuYWJsZWQpIHtcclxuXHRcdGlmIChrZXkgPT09IFwiVGFiXCIgfHwgc2hvdWxkVGFib3V0QnlDbG9zZUJyYWNrZXQodmlldywga2V5KSkge1xyXG5cdFx0XHRzdWNjZXNzID0gdGFib3V0KHZpZXcsIGN0eCk7XHJcblxyXG5cdFx0XHRpZiAoc3VjY2VzcykgcmV0dXJuIHRydWU7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gZmFsc2U7XHJcbn0iXX0=