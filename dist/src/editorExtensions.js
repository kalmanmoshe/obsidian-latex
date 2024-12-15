import { EditorView, ViewPlugin, } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { Context } from "./editor utilities/context";
import { isComposing, replaceRange, setCursor } from "./editor utilities/editor_utils";
import { keyboardAutoReplaceHebrewToEnglishTriggers } from "./utils/staticData";
import { Suggestor } from "./suggestor";
import { RtlForc } from "./editorDecorations";
import { setSelectionToNextTabstop } from "./snippets/snippet_management";
import { tabstopsStateField } from "./codemirror/tabstops_state_field";
import { snippetQueueStateField } from "./codemirror/snippet_queue_state_field";
import { snippetInvertedEffects } from "./codemirror/history";
import { runSnippets } from "./snippets/run_snippets";
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
            app.editorExtensions.pop(); // Clear existing extensions
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
                    // Start listening for transactions only if a key is pressed
                    if (event.code.startsWith("Key") && !event.ctrlKey) {
                        this.shouldListenForTransaction = true;
                    }
                },
                focus: (event, view) => {
                    // Track the active editor view
                    this.activeEditorView = view;
                },
            })),
            EditorView.updateListener.of((update) => {
                // Trigger transaction logic if docChanged and listening is active
                if (this.shouldListenForTransaction && update.docChanged) {
                    this.onTransaction(update.view);
                    this.shouldListenForTransaction = false; // Reset listener
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
    onClick = (event, view) => {
        const suggestionItems = document.body.querySelectorAll(".suggestion-item");
        // Check if the click is on a suggestion item
        const clickedSuggestion = Array.from(suggestionItems).find((item) => item.contains(event.target));
        if (clickedSuggestion) {
            this.suggestor.selectDropdownItem(clickedSuggestion, view);
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
        const ctx = Context.fromView(view);
        if (!(event.ctrlKey || event.metaKey) && (ctx.mode.inMath() && (!ctx.inTextEnvironment() || ctx.codeblockLanguage.match(/(tikz)/)))) {
            const trigger = keyboardAutoReplaceHebrewToEnglishTriggers.find((trigger2) => trigger2.key === event.key && trigger2.code === event.code);
            if (trigger) {
                event.preventDefault();
                key = trigger.replacement;
                replaceRange(view, view.state.selection.main.from, view.state.selection.main.to, key);
                setCursor(view, view.state.selection.main.from + key.length);
            }
        }
        if (this.suggestor.isSuggesterDeployed) {
            handleDropdownNavigation(event, view, this.suggestor);
        }
        const success = handleKeydown(key, event.shiftKey, event.ctrlKey || event.metaKey, isComposing(view, event), view, ctx);
        if (success)
            event.preventDefault();
    };
    decorat() {
    }
}
const handleDropdownNavigation = (event, view, suggestor) => {
    const items = suggestor.getAlldropdownItems();
    if (event.key === "ArrowDown") {
        suggestor.selectionIndex = (suggestor.selectionIndex + 1) % items.length;
        suggestor.updateSelection(items);
        event.preventDefault();
    }
    else if (event.key === "ArrowUp") {
        suggestor.selectionIndex = (suggestor.selectionIndex - 1 + items.length) % items.length;
        suggestor.updateSelection(items);
        event.preventDefault();
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
const handleKeydown = (key, shiftKey, ctrlKey, isIME, view, ctx) => {
    const settings = { autoDelete$: false,
        snippetsEnabled: false,
        suppressSnippetTriggerOnIME: false,
        autofractionEnabled: false,
        matrixShortcutsEnabled: false,
        taboutEnabled: false,
    };
    //getLatexSuiteConfig(view);
    let success = false;
    if (settings.autoDelete$ && key === "Backspace" && ctx.mode.inMath()) { /*
      const charAtPos = getCharacterAtPos(view, ctx.pos);
      const charAtPrevPos = getCharacterAtPos(view, ctx.pos - 1);
      if (charAtPos === "$" && charAtPrevPos === "$") {
        //replaceRange(view, ctx.pos - 1, ctx.pos + 1, "");
        //removeAllTabstops(view);
        return true;
      }*/
    }
    if (settings.snippetsEnabled) {
        if (settings.suppressSnippetTriggerOnIME && isIME)
            return;
        if (!ctrlKey) {
            try {
                success = runSnippets(view, ctx, key);
                if (success)
                    return true;
            }
            catch (e) {
                //clearSnippetQueue(view);
                console.error(e);
            }
        }
    }
    if (key === "Tab") {
        //Finally found it.
        success = setSelectionToNextTabstop(view);
        if (success)
            return true;
    }
    if (settings.autofractionEnabled && ctx.mode.strictlyInMath()) {
        if (key === "/") {
            //success = runAutoFraction(view, ctx);
            if (success)
                return true;
        }
    }
    if (settings.matrixShortcutsEnabled && ctx.mode.blockMath) {
        if (["Tab", "Enter"].contains(key)) {
            //success = runMatrixShortcuts(view, ctx, key, shiftKey);
            if (success)
                return true;
        }
    }
    if (settings.taboutEnabled) {
        if (key === "Tab" /* || shouldTaboutByCloseBracket(view, key)*/) {
            //success = tabout(view, ctx);
            if (success)
                return true;
        }
    }
    return false;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yRXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9lZGl0b3JFeHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxHQUEyQixNQUFNLGtCQUFrQixDQUFDO0FBQ25GLE9BQU8sRUFBZSxJQUFJLEVBQVksTUFBTSxtQkFBbUIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDckQsT0FBTyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkYsT0FBTyxFQUFFLDBDQUEwQyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDaEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN4QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDOUMsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDMUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDaEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDOUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBR3RELE1BQU0sT0FBTyxnQkFBZ0I7SUFDakIsMEJBQTBCLEdBQVksS0FBSyxDQUFDO0lBQzVDLGdCQUFnQixHQUFzQixJQUFJLENBQUM7SUFDM0MsZ0JBQWdCLEdBQVksS0FBSyxDQUFDO0lBQ2xDLFNBQVMsR0FBYyxJQUFJLFNBQVMsRUFBRSxDQUFDO0lBRXZDLG1CQUFtQjtRQUN2QixPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxzQkFBc0IsQ0FBQyxD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SUFDRCxJQUFJLFFBQVEsQ0FBQyxzQkFBc0IsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEMseURBQXlEO1lBQ3pELElBQUksT0FBTztnQkFDVCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7SUFDSCxDQUFDO0lBQ0QsSUFBSSxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDM0IsSUFBSSxHQUFHLEtBQUssS0FBSyxDQUFBLDZDQUE2QyxFQUFFLENBQUM7WUFDbEUsOEJBQThCO1lBQzlCLElBQUksT0FBTztnQkFDVCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTW9zaGUgZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHsgZ2V0VGlrelN1Z2dlc3Rpb25zLCBMYXRleCB9IGZyb20gXCIuL3V0aWxpdGllc1wiO1xuaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1BsdWdpbiwgVmlld1VwZGF0ZSAsRGVjb3JhdGlvbiwgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFByZWMsRXh0ZW5zaW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9jb250ZXh0XCI7XG5pbXBvcnQgeyBpc0NvbXBvc2luZywgcmVwbGFjZVJhbmdlLCBzZXRDdXJzb3IgfSBmcm9tIFwiLi9lZGl0b3IgdXRpbGl0aWVzL2VkaXRvcl91dGlsc1wiO1xuaW1wb3J0IHsga2V5Ym9hcmRBdXRvUmVwbGFjZUhlYnJld1RvRW5nbGlzaFRyaWdnZXJzIH0gZnJvbSBcIi4vdXRpbHMvc3RhdGljRGF0YVwiO1xuaW1wb3J0IHsgU3VnZ2VzdG9yIH0gZnJvbSBcIi4vc3VnZ2VzdG9yXCI7XG5pbXBvcnQgeyBSdGxGb3JjIH0gZnJvbSBcIi4vZWRpdG9yRGVjb3JhdGlvbnNcIjtcbmltcG9ydCB7IHNldFNlbGVjdGlvblRvTmV4dFRhYnN0b3AgfSBmcm9tIFwiLi9zbmlwcGV0cy9zbmlwcGV0X21hbmFnZW1lbnRcIjtcbmltcG9ydCB7IHRhYnN0b3BzU3RhdGVGaWVsZCB9IGZyb20gXCIuL2NvZGVtaXJyb3IvdGFic3RvcHNfc3RhdGVfZmllbGRcIjtcbmltcG9ydCB7IHNuaXBwZXRRdWV1ZVN0YXRlRmllbGQgfSBmcm9tIFwiLi9jb2RlbWlycm9yL3NuaXBwZXRfcXVldWVfc3RhdGVfZmllbGRcIjtcbmltcG9ydCB7IHNuaXBwZXRJbnZlcnRlZEVmZmVjdHMgfSBmcm9tIFwiLi9jb2RlbWlycm9yL2hpc3RvcnlcIjtcbmltcG9ydCB7IHJ1blNuaXBwZXRzIH0gZnJvbSBcIi4vc25pcHBldHMvcnVuX3NuaXBwZXRzXCI7XG5cblxuZXhwb3J0IGNsYXNzIEVkaXRvckV4dGVuc2lvbnMge1xuICAgIHByaXZhdGUgc2hvdWxkTGlzdGVuRm9yVHJhbnNhY3Rpb246IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIGFjdGl2ZUVkaXRvclZpZXc6IEVkaXRvclZpZXcgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIHN1Z2dlc3Rpb25BY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBwcml2YXRlIHN1Z2dlc3RvcjogU3VnZ2VzdG9yID0gbmV3IFN1Z2dlc3RvcigpO1xuXG4gICAgcHJpdmF0ZSBpc1N1Z2dlc3RlckRlcGxveWVkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gISFkb2N1bWVudC5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCIuc3VnZ2VzdGlvbi1kcm9wZG93blwiKTtcbiAgICB9XG5cbiAgICBzZXRFZGl0b3JFeHRlbnNpb25zKGFwcDogTW9zaGUpIHtcblx0XHR3aGlsZSAoYXBwLmVkaXRvckV4dGVuc2lvbnMubGVuZ3RoKSBhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wb3AoKTsgLy8gQ2xlYXIgZXhpc3RpbmcgZXh0ZW5zaW9uc1xuXHRcdHRoaXMubW9uaXRvcihhcHApOyBcblx0XHR0aGlzLnNuaXBwZXRFeHRlbnNpb25zKGFwcCk7XG5cdFxuXHRcdGNvbnN0IGZsYXRFeHRlbnNpb25zID0gYXBwLmVkaXRvckV4dGVuc2lvbnMuZmxhdCgpO1xuXHRcblx0XHRhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oZmxhdEV4dGVuc2lvbnMpO1xuXHR9XG5cdFxuXG4gICAgcHJpdmF0ZSBtb25pdG9yKGFwcDogTW9zaGUpIHtcbiAgICAgICAgYXBwLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFtcbiAgICAgICAgICAgIFByZWMuaGlnaGVzdChcbiAgICAgICAgICAgICAgICBFZGl0b3JWaWV3LmRvbUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgICAgICAgICAgICBrZXlkb3duOiAoZXZlbnQsIHZpZXcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25LZXlkb3duKGV2ZW50LCB2aWV3KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3RhcnQgbGlzdGVuaW5nIGZvciB0cmFuc2FjdGlvbnMgb25seSBpZiBhIGtleSBpcyBwcmVzc2VkXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXZlbnQuY29kZS5zdGFydHNXaXRoKFwiS2V5XCIpICYmICFldmVudC5jdHJsS2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzOiAoZXZlbnQsIHZpZXcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRyYWNrIHRoZSBhY3RpdmUgZWRpdG9yIHZpZXdcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRWRpdG9yVmlldyA9IHZpZXc7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKCh1cGRhdGUpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBUcmlnZ2VyIHRyYW5zYWN0aW9uIGxvZ2ljIGlmIGRvY0NoYW5nZWQgYW5kIGxpc3RlbmluZyBpcyBhY3RpdmVcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiAmJiB1cGRhdGUuZG9jQ2hhbmdlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9uVHJhbnNhY3Rpb24odXBkYXRlLnZpZXcpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uID0gZmFsc2U7IC8vIFJlc2V0IGxpc3RlbmVyXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSksXG4gICAgICAgIF0pO1xuXG4gICAgICAgIC8vIEdsb2JhbCBjbGljayBsaXN0ZW5lciB0byBoYW5kbGUgc3VnZ2VzdGlvbnNcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zdWdnZXN0aW9uQWN0aXZlID0gdGhpcy5pc1N1Z2dlc3RlckRlcGxveWVkKCk7XG4gICAgICAgICAgICBpZiAodGhpcy5zdWdnZXN0aW9uQWN0aXZlICYmIHRoaXMuYWN0aXZlRWRpdG9yVmlldykge1xuICAgICAgICAgICAgICAgIHRoaXMub25DbGljayhldmVudCwgdGhpcy5hY3RpdmVFZGl0b3JWaWV3KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzbmlwcGV0RXh0ZW5zaW9ucyhhcHA6IE1vc2hlKSB7XG5cdFx0YXBwLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXG5cdFx0XHR0YWJzdG9wc1N0YXRlRmllbGQuZXh0ZW5zaW9uLFxuXHRcdFx0c25pcHBldFF1ZXVlU3RhdGVGaWVsZC5leHRlbnNpb24sXG5cdFx0XHRzbmlwcGV0SW52ZXJ0ZWRFZmZlY3RzLFxuXHRcdF0pO1xuXHR9XG5cdFxuXG4gICAgcHJpdmF0ZSByZWdpc3RlckRlY29yYXRpb25zKGFwcDogTW9zaGUpe1xuICAgICAgICBhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICAgICAgICBWaWV3UGx1Z2luLmZyb21DbGFzcyhSdGxGb3JjLCB7XG4gICAgICAgICAgICBkZWNvcmF0aW9uczogKHYpID0+IHYuZGVjb3JhdGlvbnMsXG4gICAgICAgICAgfVxuICAgICAgICApKTtcbiAgICB9XG5cblx0cHJpdmF0ZSBvbkNsaWNrPShldmVudDogTW91c2VFdmVudCx2aWV3OiBFZGl0b3JWaWV3KT0+e1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25JdGVtcyA9IGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvckFsbChcIi5zdWdnZXN0aW9uLWl0ZW1cIik7XG5cdFxuXHRcdC8vIENoZWNrIGlmIHRoZSBjbGljayBpcyBvbiBhIHN1Z2dlc3Rpb24gaXRlbVxuXHRcdGNvbnN0IGNsaWNrZWRTdWdnZXN0aW9uID0gQXJyYXkuZnJvbShzdWdnZXN0aW9uSXRlbXMpLmZpbmQoKGl0ZW0pID0+XG5cdFx0XHRpdGVtLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxuXHRcdCk7XG5cdFxuXHRcdGlmIChjbGlja2VkU3VnZ2VzdGlvbikge1xuXHRcdFx0dGhpcy5zdWdnZXN0b3Iuc2VsZWN0RHJvcGRvd25JdGVtKGNsaWNrZWRTdWdnZXN0aW9uLHZpZXcpO1xuXHRcdH1cblx0XHRcblx0fVxuXHRwcml2YXRlIG9uVHJhbnNhY3Rpb249KHZpZXc6IEVkaXRvclZpZXcpPT4ge1xuXHRcdGNvbnN0IGN0eCA9IENvbnRleHQuZnJvbVZpZXcodmlldyk7XG5cdFx0aWYgKGN0eC5jb2RlYmxvY2tMYW5ndWFnZSA9PT0gXCJ0aWt6XCIpIHtcblx0XHRcdHRoaXMuc3VnZ2VzdG9yLmRlcGxveVN1Z2dlc3RvcihjdHgsdmlldylcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uS2V5ZG93biA9IChldmVudDogS2V5Ym9hcmRFdmVudCwgdmlldzogRWRpdG9yVmlldykgPT4ge1xuXHRcdGxldCBrZXkgPSBldmVudC5rZXk7XG5cdFx0Y29uc3QgY3R4ID0gQ29udGV4dC5mcm9tVmlldyh2aWV3KTtcblx0XHRpZiAoIShldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkpICYmIChjdHgubW9kZS5pbk1hdGgoKSAmJiAoIWN0eC5pblRleHRFbnZpcm9ubWVudCgpIHx8IGN0eC5jb2RlYmxvY2tMYW5ndWFnZS5tYXRjaCgvKHRpa3opLykpKSkge1xuXHRcdCAgY29uc3QgdHJpZ2dlciA9IGtleWJvYXJkQXV0b1JlcGxhY2VIZWJyZXdUb0VuZ2xpc2hUcmlnZ2Vycy5maW5kKCh0cmlnZ2VyMikgPT4gdHJpZ2dlcjIua2V5ID09PSBldmVudC5rZXkgJiYgdHJpZ2dlcjIuY29kZSA9PT0gZXZlbnQuY29kZSk7XG5cdFx0ICBpZiAodHJpZ2dlcikge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRrZXkgPSB0cmlnZ2VyLnJlcGxhY2VtZW50O1xuXHRcdFx0XHRyZXBsYWNlUmFuZ2Uodmlldyx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmZyb20sdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi50byxrZXkpXG5cdFx0XHRcdHNldEN1cnNvcih2aWV3LHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uZnJvbStrZXkubGVuZ3RoKVxuXHRcdCAgfVxuXHRcdH1cblx0XHRpZih0aGlzLnN1Z2dlc3Rvci5pc1N1Z2dlc3RlckRlcGxveWVkKXtcblx0XHRcdGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbihldmVudCx2aWV3LHRoaXMuc3VnZ2VzdG9yKVxuXHRcdH1cblx0XHRjb25zdCBzdWNjZXNzID0gaGFuZGxlS2V5ZG93bihrZXksIGV2ZW50LnNoaWZ0S2V5LCBldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXksIGlzQ29tcG9zaW5nKHZpZXcsIGV2ZW50KSwgdmlldywgY3R4KTtcblx0XHRpZiAoc3VjY2VzcykgXG5cdFx0ICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHR9O1xuXG5cdHByaXZhdGUgZGVjb3JhdCgpe1xuXG5cdH1cbn1cblxuXG5jb25zdCBoYW5kbGVEcm9wZG93bk5hdmlnYXRpb249KGV2ZW50OiBLZXlib2FyZEV2ZW50LHZpZXc6RWRpdG9yVmlldyxzdWdnZXN0b3I6IFN1Z2dlc3Rvcik9Pntcblx0Y29uc3QgaXRlbXMgPSBzdWdnZXN0b3IuZ2V0QWxsZHJvcGRvd25JdGVtcygpO1xuXG5cdGlmIChldmVudC5rZXkgPT09IFwiQXJyb3dEb3duXCIpIHtcblx0XHRzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXggPSAoc3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ICsgMSkgJSBpdGVtcy5sZW5ndGg7XG5cdFx0c3VnZ2VzdG9yLnVwZGF0ZVNlbGVjdGlvbihpdGVtcyk7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0fSBlbHNlIGlmIChldmVudC5rZXkgPT09IFwiQXJyb3dVcFwiKSB7XG5cdFx0c3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ID0gKHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCAtIDEgKyBpdGVtcy5sZW5ndGgpICUgaXRlbXMubGVuZ3RoO1xuXHRcdHN1Z2dlc3Rvci51cGRhdGVTZWxlY3Rpb24oaXRlbXMpO1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcblx0XHRjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzdWdnZXN0b3Iuc2VsZWN0aW9uSW5kZXhdO1xuXHRcdHN1Z2dlc3Rvci5zZWxlY3REcm9wZG93bkl0ZW0oc2VsZWN0ZWRJdGVtLHZpZXcpO1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdH0gLyplbHNlIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcblx0XHRkcm9wZG93bi5yZW1vdmUoKTtcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHR9Ki9cbn1cblxuXG5jb25zdCBoYW5kbGVLZXlkb3duID0gKGtleTogc3RyaW5nLCBzaGlmdEtleTogYm9vbGVhbiwgY3RybEtleTogYm9vbGVhbiwgaXNJTUU6IGFueSwgdmlldzogRWRpdG9yVmlldywgY3R4OiBDb250ZXh0KSA9PiB7XG5cdGNvbnN0IHNldHRpbmdzID0ge2F1dG9EZWxldGUkOiBmYWxzZSxcblx0XHRzbmlwcGV0c0VuYWJsZWQ6ZmFsc2UsXG5cdFx0c3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FOiBmYWxzZSxcblx0XHRhdXRvZnJhY3Rpb25FbmFibGVkOiBmYWxzZSxcblx0XHRtYXRyaXhTaG9ydGN1dHNFbmFibGVkOiBmYWxzZSxcblx0XHR0YWJvdXRFbmFibGVkOiBmYWxzZSxcblx0fVxuXHRcdC8vZ2V0TGF0ZXhTdWl0ZUNvbmZpZyh2aWV3KTtcblx0bGV0IHN1Y2Nlc3MgPSBmYWxzZTtcblx0aWYgKHNldHRpbmdzLmF1dG9EZWxldGUkICYmIGtleSA9PT0gXCJCYWNrc3BhY2VcIiAmJiBjdHgubW9kZS5pbk1hdGgoKSkgey8qXG5cdCAgY29uc3QgY2hhckF0UG9zID0gZ2V0Q2hhcmFjdGVyQXRQb3ModmlldywgY3R4LnBvcyk7XG5cdCAgY29uc3QgY2hhckF0UHJldlBvcyA9IGdldENoYXJhY3RlckF0UG9zKHZpZXcsIGN0eC5wb3MgLSAxKTtcblx0ICBpZiAoY2hhckF0UG9zID09PSBcIiRcIiAmJiBjaGFyQXRQcmV2UG9zID09PSBcIiRcIikge1xuXHRcdC8vcmVwbGFjZVJhbmdlKHZpZXcsIGN0eC5wb3MgLSAxLCBjdHgucG9zICsgMSwgXCJcIik7XG5cdFx0Ly9yZW1vdmVBbGxUYWJzdG9wcyh2aWV3KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0ICB9Ki9cblx0fVxuXHRpZiAoc2V0dGluZ3Muc25pcHBldHNFbmFibGVkKSB7XG5cdCAgaWYgKHNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSAmJiBpc0lNRSlcblx0XHRyZXR1cm47XG5cdCAgaWYgKCFjdHJsS2V5KSB7XG5cdFx0dHJ5IHtcblx0XHQgIHN1Y2Nlc3MgPSBydW5TbmlwcGV0cyh2aWV3LCBjdHgsIGtleSk7XG5cdFx0ICBpZiAoc3VjY2Vzcylcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHQgIC8vY2xlYXJTbmlwcGV0UXVldWUodmlldyk7XG5cdFx0ICBjb25zb2xlLmVycm9yKGUpO1xuXHRcdH1cblx0ICB9XG5cdH1cblx0aWYgKGtleSA9PT0gXCJUYWJcIikge1xuXHRcdC8vRmluYWxseSBmb3VuZCBpdC5cblx0ICBzdWNjZXNzID0gc2V0U2VsZWN0aW9uVG9OZXh0VGFic3RvcCh2aWV3KTtcblx0ICBpZiAoc3VjY2Vzcylcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoc2V0dGluZ3MuYXV0b2ZyYWN0aW9uRW5hYmxlZCAmJiBjdHgubW9kZS5zdHJpY3RseUluTWF0aCgpKSB7XG5cdCAgaWYgKGtleSA9PT0gXCIvXCIpIHtcblx0XHQvL3N1Y2Nlc3MgPSBydW5BdXRvRnJhY3Rpb24odmlldywgY3R4KTtcblx0XHRpZiAoc3VjY2Vzcylcblx0XHQgIHJldHVybiB0cnVlO1xuXHQgIH1cblx0fVxuXHRpZiAoc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCAmJiBjdHgubW9kZS5ibG9ja01hdGgpIHtcblx0ICBpZiAoW1wiVGFiXCIsIFwiRW50ZXJcIl0uY29udGFpbnMoa2V5KSkge1xuXHRcdC8vc3VjY2VzcyA9IHJ1bk1hdHJpeFNob3J0Y3V0cyh2aWV3LCBjdHgsIGtleSwgc2hpZnRLZXkpO1xuXHRcdGlmIChzdWNjZXNzKVxuXHRcdCAgcmV0dXJuIHRydWU7XG5cdCAgfVxuXHR9XG5cdGlmIChzZXR0aW5ncy50YWJvdXRFbmFibGVkKSB7XG5cdCAgaWYgKGtleSA9PT0gXCJUYWJcIi8qIHx8IHNob3VsZFRhYm91dEJ5Q2xvc2VCcmFja2V0KHZpZXcsIGtleSkqLykge1xuXHRcdC8vc3VjY2VzcyA9IHRhYm91dCh2aWV3LCBjdHgpO1xuXHRcdGlmIChzdWNjZXNzKVxuXHRcdCAgcmV0dXJuIHRydWU7XG5cdCAgfVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn07Il19