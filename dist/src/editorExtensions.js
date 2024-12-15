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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yRXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9lZGl0b3JFeHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxHQUEyQixNQUFNLGtCQUFrQixDQUFDO0FBQ25GLE9BQU8sRUFBZSxJQUFJLEVBQVksTUFBTSxtQkFBbUIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDckQsT0FBTyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkYsT0FBTyxFQUFFLDBDQUEwQyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDaEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN4QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDOUMsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDMUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDaEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDOUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBR3RELE1BQU0sT0FBTyxnQkFBZ0I7SUFDakIsMEJBQTBCLEdBQVksS0FBSyxDQUFDO0lBQzVDLGdCQUFnQixHQUFzQixJQUFJLENBQUM7SUFDM0MsZ0JBQWdCLEdBQVksS0FBSyxDQUFDO0lBQ2xDLFNBQVMsR0FBYyxJQUFJLFNBQVMsRUFBRSxDQUFDO0lBRXZDLG1CQUFtQjtRQUN2QixPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxzQkFBc0IsQ0FBQyxD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SUFDRCxJQUFJLFFBQVEsQ0FBQyxzQkFBc0IsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEMseURBQXlEO1lBQ3pELElBQUksT0FBTztnQkFDVCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7SUFDSCxDQUFDO0lBQ0QsSUFBSSxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDM0IsSUFBSSxHQUFHLEtBQUssS0FBSyxDQUFBLDZDQUE2QyxFQUFFLENBQUM7WUFDbEUsOEJBQThCO1lBQzlCLElBQUksT0FBTztnQkFDVCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTW9zaGUgZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBnZXRUaWt6U3VnZ2VzdGlvbnMsIExhdGV4IH0gZnJvbSBcIi4vdXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdQbHVnaW4sIFZpZXdVcGRhdGUgLERlY29yYXRpb24sIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFByZWMsRXh0ZW5zaW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XHJcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tIFwiLi9lZGl0b3IgdXRpbGl0aWVzL2NvbnRleHRcIjtcclxuaW1wb3J0IHsgaXNDb21wb3NpbmcsIHJlcGxhY2VSYW5nZSwgc2V0Q3Vyc29yIH0gZnJvbSBcIi4vZWRpdG9yIHV0aWxpdGllcy9lZGl0b3JfdXRpbHNcIjtcclxuaW1wb3J0IHsga2V5Ym9hcmRBdXRvUmVwbGFjZUhlYnJld1RvRW5nbGlzaFRyaWdnZXJzIH0gZnJvbSBcIi4vdXRpbHMvc3RhdGljRGF0YVwiO1xyXG5pbXBvcnQgeyBTdWdnZXN0b3IgfSBmcm9tIFwiLi9zdWdnZXN0b3JcIjtcclxuaW1wb3J0IHsgUnRsRm9yYyB9IGZyb20gXCIuL2VkaXRvckRlY29yYXRpb25zXCI7XHJcbmltcG9ydCB7IHNldFNlbGVjdGlvblRvTmV4dFRhYnN0b3AgfSBmcm9tIFwiLi9zbmlwcGV0cy9zbmlwcGV0X21hbmFnZW1lbnRcIjtcclxuaW1wb3J0IHsgdGFic3RvcHNTdGF0ZUZpZWxkIH0gZnJvbSBcIi4vY29kZW1pcnJvci90YWJzdG9wc19zdGF0ZV9maWVsZFwiO1xyXG5pbXBvcnQgeyBzbmlwcGV0UXVldWVTdGF0ZUZpZWxkIH0gZnJvbSBcIi4vY29kZW1pcnJvci9zbmlwcGV0X3F1ZXVlX3N0YXRlX2ZpZWxkXCI7XHJcbmltcG9ydCB7IHNuaXBwZXRJbnZlcnRlZEVmZmVjdHMgfSBmcm9tIFwiLi9jb2RlbWlycm9yL2hpc3RvcnlcIjtcclxuaW1wb3J0IHsgcnVuU25pcHBldHMgfSBmcm9tIFwiLi9zbmlwcGV0cy9ydW5fc25pcHBldHNcIjtcclxuXHJcblxyXG5leHBvcnQgY2xhc3MgRWRpdG9yRXh0ZW5zaW9ucyB7XHJcbiAgICBwcml2YXRlIHNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIGFjdGl2ZUVkaXRvclZpZXc6IEVkaXRvclZpZXcgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgc3VnZ2VzdGlvbkFjdGl2ZTogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBzdWdnZXN0b3I6IFN1Z2dlc3RvciA9IG5ldyBTdWdnZXN0b3IoKTtcclxuXHJcbiAgICBwcml2YXRlIGlzU3VnZ2VzdGVyRGVwbG95ZWQoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuICEhZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yKFwiLnN1Z2dlc3Rpb24tZHJvcGRvd25cIik7XHJcbiAgICB9XHJcblxyXG4gICAgc2V0RWRpdG9yRXh0ZW5zaW9ucyhhcHA6IE1vc2hlKSB7XHJcblx0XHR3aGlsZSAoYXBwLmVkaXRvckV4dGVuc2lvbnMubGVuZ3RoKSBhcHAuZWRpdG9yRXh0ZW5zaW9ucy5wb3AoKTsgLy8gQ2xlYXIgZXhpc3RpbmcgZXh0ZW5zaW9uc1xyXG5cdFx0dGhpcy5tb25pdG9yKGFwcCk7IFxyXG5cdFx0dGhpcy5zbmlwcGV0RXh0ZW5zaW9ucyhhcHApO1xyXG5cdFxyXG5cdFx0Y29uc3QgZmxhdEV4dGVuc2lvbnMgPSBhcHAuZWRpdG9yRXh0ZW5zaW9ucy5mbGF0KCk7XHJcblx0XHJcblx0XHRhcHAucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oZmxhdEV4dGVuc2lvbnMpO1xyXG5cdH1cclxuXHRcclxuXHJcbiAgICBwcml2YXRlIG1vbml0b3IoYXBwOiBNb3NoZSkge1xyXG4gICAgICAgIGFwcC5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbXHJcbiAgICAgICAgICAgIFByZWMuaGlnaGVzdChcclxuICAgICAgICAgICAgICAgIEVkaXRvclZpZXcuZG9tRXZlbnRIYW5kbGVycyh7XHJcbiAgICAgICAgICAgICAgICAgICAga2V5ZG93bjogKGV2ZW50LCB2aWV3KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25LZXlkb3duKGV2ZW50LCB2aWV3KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFN0YXJ0IGxpc3RlbmluZyBmb3IgdHJhbnNhY3Rpb25zIG9ubHkgaWYgYSBrZXkgaXMgcHJlc3NlZFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXZlbnQuY29kZS5zdGFydHNXaXRoKFwiS2V5XCIpICYmICFldmVudC5jdHJsS2V5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3VsZExpc3RlbkZvclRyYW5zYWN0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXM6IChldmVudCwgdmlldykgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUcmFjayB0aGUgYWN0aXZlIGVkaXRvciB2aWV3XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRWRpdG9yVmlldyA9IHZpZXc7XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgIEVkaXRvclZpZXcudXBkYXRlTGlzdGVuZXIub2YoKHVwZGF0ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJpZ2dlciB0cmFuc2FjdGlvbiBsb2dpYyBpZiBkb2NDaGFuZ2VkIGFuZCBsaXN0ZW5pbmcgaXMgYWN0aXZlXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiAmJiB1cGRhdGUuZG9jQ2hhbmdlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub25UcmFuc2FjdGlvbih1cGRhdGUudmlldyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaG91bGRMaXN0ZW5Gb3JUcmFuc2FjdGlvbiA9IGZhbHNlOyAvLyBSZXNldCBsaXN0ZW5lclxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgLy8gR2xvYmFsIGNsaWNrIGxpc3RlbmVyIHRvIGhhbmRsZSBzdWdnZXN0aW9uc1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zdWdnZXN0aW9uQWN0aXZlID0gdGhpcy5pc1N1Z2dlc3RlckRlcGxveWVkKCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnN1Z2dlc3Rpb25BY3RpdmUgJiYgdGhpcy5hY3RpdmVFZGl0b3JWaWV3KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uQ2xpY2soZXZlbnQsIHRoaXMuYWN0aXZlRWRpdG9yVmlldyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNuaXBwZXRFeHRlbnNpb25zKGFwcDogTW9zaGUpIHtcclxuXHRcdGFwcC5lZGl0b3JFeHRlbnNpb25zLnB1c2goW1xyXG5cdFx0XHR0YWJzdG9wc1N0YXRlRmllbGQuZXh0ZW5zaW9uLFxyXG5cdFx0XHRzbmlwcGV0UXVldWVTdGF0ZUZpZWxkLmV4dGVuc2lvbixcclxuXHRcdFx0c25pcHBldEludmVydGVkRWZmZWN0cyxcclxuXHRcdF0pO1xyXG5cdH1cclxuXHRcclxuXHJcbiAgICBwcml2YXRlIHJlZ2lzdGVyRGVjb3JhdGlvbnMoYXBwOiBNb3NoZSl7XHJcbiAgICAgICAgYXBwLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxyXG4gICAgICAgICAgICBWaWV3UGx1Z2luLmZyb21DbGFzcyhSdGxGb3JjLCB7XHJcbiAgICAgICAgICAgIGRlY29yYXRpb25zOiAodikgPT4gdi5kZWNvcmF0aW9ucyxcclxuICAgICAgICAgIH1cclxuICAgICAgICApKTtcclxuICAgIH1cclxuXHJcblx0cHJpdmF0ZSBvbkNsaWNrPShldmVudDogTW91c2VFdmVudCx2aWV3OiBFZGl0b3JWaWV3KT0+e1xyXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkl0ZW1zID0gZG9jdW1lbnQuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiLnN1Z2dlc3Rpb24taXRlbVwiKTtcclxuXHRcclxuXHRcdC8vIENoZWNrIGlmIHRoZSBjbGljayBpcyBvbiBhIHN1Z2dlc3Rpb24gaXRlbVxyXG5cdFx0Y29uc3QgY2xpY2tlZFN1Z2dlc3Rpb24gPSBBcnJheS5mcm9tKHN1Z2dlc3Rpb25JdGVtcykuZmluZCgoaXRlbSkgPT5cclxuXHRcdFx0aXRlbS5jb250YWlucyhldmVudC50YXJnZXQgYXMgTm9kZSlcclxuXHRcdCk7XHJcblx0XHJcblx0XHRpZiAoY2xpY2tlZFN1Z2dlc3Rpb24pIHtcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3Iuc2VsZWN0RHJvcGRvd25JdGVtKGNsaWNrZWRTdWdnZXN0aW9uLHZpZXcpO1xyXG5cdFx0fVxyXG5cdFx0XHJcblx0fVxyXG5cdHByaXZhdGUgb25UcmFuc2FjdGlvbj0odmlldzogRWRpdG9yVmlldyk9PiB7XHJcblx0XHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xyXG5cdFx0aWYgKGN0eC5jb2RlYmxvY2tMYW5ndWFnZSA9PT0gXCJ0aWt6XCIpIHtcclxuXHRcdFx0dGhpcy5zdWdnZXN0b3IuZGVwbG95U3VnZ2VzdG9yKGN0eCx2aWV3KVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBvbktleWRvd24gPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQsIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcclxuXHRcdGxldCBrZXkgPSBldmVudC5rZXk7XHJcblx0XHRjb25zdCBjdHggPSBDb250ZXh0LmZyb21WaWV3KHZpZXcpO1xyXG5cdFx0aWYgKCEoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSAmJiAoY3R4Lm1vZGUuaW5NYXRoKCkgJiYgKCFjdHguaW5UZXh0RW52aXJvbm1lbnQoKSB8fCBjdHguY29kZWJsb2NrTGFuZ3VhZ2UubWF0Y2goLyh0aWt6KS8pKSkpIHtcclxuXHRcdCAgY29uc3QgdHJpZ2dlciA9IGtleWJvYXJkQXV0b1JlcGxhY2VIZWJyZXdUb0VuZ2xpc2hUcmlnZ2Vycy5maW5kKCh0cmlnZ2VyMikgPT4gdHJpZ2dlcjIua2V5ID09PSBldmVudC5rZXkgJiYgdHJpZ2dlcjIuY29kZSA9PT0gZXZlbnQuY29kZSk7XHJcblx0XHQgIGlmICh0cmlnZ2VyKSB7XHJcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHRcdFx0XHRrZXkgPSB0cmlnZ2VyLnJlcGxhY2VtZW50O1xyXG5cdFx0XHRcdHJlcGxhY2VSYW5nZSh2aWV3LHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uZnJvbSx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLnRvLGtleSlcclxuXHRcdFx0XHRzZXRDdXJzb3Iodmlldyx2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmZyb20ra2V5Lmxlbmd0aClcclxuXHRcdCAgfVxyXG5cdFx0fVxyXG5cdFx0aWYodGhpcy5zdWdnZXN0b3IuaXNTdWdnZXN0ZXJEZXBsb3llZCl7XHJcblx0XHRcdGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbihldmVudCx2aWV3LHRoaXMuc3VnZ2VzdG9yKVxyXG5cdFx0fVxyXG5cdFx0Y29uc3Qgc3VjY2VzcyA9IGhhbmRsZUtleWRvd24oa2V5LCBldmVudC5zaGlmdEtleSwgZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5LCBpc0NvbXBvc2luZyh2aWV3LCBldmVudCksIHZpZXcsIGN0eCk7XHJcblx0XHRpZiAoc3VjY2VzcykgXHJcblx0XHQgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0fTtcclxuXHJcblx0cHJpdmF0ZSBkZWNvcmF0KCl7XHJcblxyXG5cdH1cclxufVxyXG5cclxuXHJcbmNvbnN0IGhhbmRsZURyb3Bkb3duTmF2aWdhdGlvbj0oZXZlbnQ6IEtleWJvYXJkRXZlbnQsdmlldzpFZGl0b3JWaWV3LHN1Z2dlc3RvcjogU3VnZ2VzdG9yKT0+e1xyXG5cdGNvbnN0IGl0ZW1zID0gc3VnZ2VzdG9yLmdldEFsbGRyb3Bkb3duSXRlbXMoKTtcclxuXHJcblx0aWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd0Rvd25cIikge1xyXG5cdFx0c3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ID0gKHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCArIDEpICUgaXRlbXMubGVuZ3RoO1xyXG5cdFx0c3VnZ2VzdG9yLnVwZGF0ZVNlbGVjdGlvbihpdGVtcyk7XHJcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkFycm93VXBcIikge1xyXG5cdFx0c3VnZ2VzdG9yLnNlbGVjdGlvbkluZGV4ID0gKHN1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleCAtIDEgKyBpdGVtcy5sZW5ndGgpICUgaXRlbXMubGVuZ3RoO1xyXG5cdFx0c3VnZ2VzdG9yLnVwZGF0ZVNlbGVjdGlvbihpdGVtcyk7XHJcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcclxuXHRcdGNvbnN0IHNlbGVjdGVkSXRlbSA9IGl0ZW1zW3N1Z2dlc3Rvci5zZWxlY3Rpb25JbmRleF07XHJcblx0XHRzdWdnZXN0b3Iuc2VsZWN0RHJvcGRvd25JdGVtKHNlbGVjdGVkSXRlbSx2aWV3KTtcclxuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblx0fSAvKmVsc2UgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIikge1xyXG5cdFx0ZHJvcGRvd24ucmVtb3ZlKCk7XHJcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdH0qL1xyXG59XHJcblxyXG5cclxuY29uc3QgaGFuZGxlS2V5ZG93biA9IChrZXk6IHN0cmluZywgc2hpZnRLZXk6IGJvb2xlYW4sIGN0cmxLZXk6IGJvb2xlYW4sIGlzSU1FOiBhbnksIHZpZXc6IEVkaXRvclZpZXcsIGN0eDogQ29udGV4dCkgPT4ge1xyXG5cdGNvbnN0IHNldHRpbmdzID0ge2F1dG9EZWxldGUkOiBmYWxzZSxcclxuXHRcdHNuaXBwZXRzRW5hYmxlZDpmYWxzZSxcclxuXHRcdHN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRTogZmFsc2UsXHJcblx0XHRhdXRvZnJhY3Rpb25FbmFibGVkOiBmYWxzZSxcclxuXHRcdG1hdHJpeFNob3J0Y3V0c0VuYWJsZWQ6IGZhbHNlLFxyXG5cdFx0dGFib3V0RW5hYmxlZDogZmFsc2UsXHJcblx0fVxyXG5cdFx0Ly9nZXRMYXRleFN1aXRlQ29uZmlnKHZpZXcpO1xyXG5cdGxldCBzdWNjZXNzID0gZmFsc2U7XHJcblx0aWYgKHNldHRpbmdzLmF1dG9EZWxldGUkICYmIGtleSA9PT0gXCJCYWNrc3BhY2VcIiAmJiBjdHgubW9kZS5pbk1hdGgoKSkgey8qXHJcblx0ICBjb25zdCBjaGFyQXRQb3MgPSBnZXRDaGFyYWN0ZXJBdFBvcyh2aWV3LCBjdHgucG9zKTtcclxuXHQgIGNvbnN0IGNoYXJBdFByZXZQb3MgPSBnZXRDaGFyYWN0ZXJBdFBvcyh2aWV3LCBjdHgucG9zIC0gMSk7XHJcblx0ICBpZiAoY2hhckF0UG9zID09PSBcIiRcIiAmJiBjaGFyQXRQcmV2UG9zID09PSBcIiRcIikge1xyXG5cdFx0Ly9yZXBsYWNlUmFuZ2UodmlldywgY3R4LnBvcyAtIDEsIGN0eC5wb3MgKyAxLCBcIlwiKTtcclxuXHRcdC8vcmVtb3ZlQWxsVGFic3RvcHModmlldyk7XHJcblx0XHRyZXR1cm4gdHJ1ZTtcclxuXHQgIH0qL1xyXG5cdH1cclxuXHRpZiAoc2V0dGluZ3Muc25pcHBldHNFbmFibGVkKSB7XHJcblx0ICBpZiAoc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FICYmIGlzSU1FKVxyXG5cdFx0cmV0dXJuO1xyXG5cdCAgaWYgKCFjdHJsS2V5KSB7XHJcblx0XHR0cnkge1xyXG5cdFx0ICBzdWNjZXNzID0gcnVuU25pcHBldHModmlldywgY3R4LCBrZXkpO1xyXG5cdFx0ICBpZiAoc3VjY2VzcylcclxuXHRcdFx0cmV0dXJuIHRydWU7XHJcblx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHQgIC8vY2xlYXJTbmlwcGV0UXVldWUodmlldyk7XHJcblx0XHQgIGNvbnNvbGUuZXJyb3IoZSk7XHJcblx0XHR9XHJcblx0ICB9XHJcblx0fVxyXG5cdGlmIChrZXkgPT09IFwiVGFiXCIpIHtcclxuXHRcdC8vRmluYWxseSBmb3VuZCBpdC5cclxuXHQgIHN1Y2Nlc3MgPSBzZXRTZWxlY3Rpb25Ub05leHRUYWJzdG9wKHZpZXcpO1xyXG5cdCAgaWYgKHN1Y2Nlc3MpXHJcblx0XHRyZXR1cm4gdHJ1ZTtcclxuXHR9XHJcblx0aWYgKHNldHRpbmdzLmF1dG9mcmFjdGlvbkVuYWJsZWQgJiYgY3R4Lm1vZGUuc3RyaWN0bHlJbk1hdGgoKSkge1xyXG5cdCAgaWYgKGtleSA9PT0gXCIvXCIpIHtcclxuXHRcdC8vc3VjY2VzcyA9IHJ1bkF1dG9GcmFjdGlvbih2aWV3LCBjdHgpO1xyXG5cdFx0aWYgKHN1Y2Nlc3MpXHJcblx0XHQgIHJldHVybiB0cnVlO1xyXG5cdCAgfVxyXG5cdH1cclxuXHRpZiAoc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCAmJiBjdHgubW9kZS5ibG9ja01hdGgpIHtcclxuXHQgIGlmIChbXCJUYWJcIiwgXCJFbnRlclwiXS5jb250YWlucyhrZXkpKSB7XHJcblx0XHQvL3N1Y2Nlc3MgPSBydW5NYXRyaXhTaG9ydGN1dHModmlldywgY3R4LCBrZXksIHNoaWZ0S2V5KTtcclxuXHRcdGlmIChzdWNjZXNzKVxyXG5cdFx0ICByZXR1cm4gdHJ1ZTtcclxuXHQgIH1cclxuXHR9XHJcblx0aWYgKHNldHRpbmdzLnRhYm91dEVuYWJsZWQpIHtcclxuXHQgIGlmIChrZXkgPT09IFwiVGFiXCIvKiB8fCBzaG91bGRUYWJvdXRCeUNsb3NlQnJhY2tldCh2aWV3LCBrZXkpKi8pIHtcclxuXHRcdC8vc3VjY2VzcyA9IHRhYm91dCh2aWV3LCBjdHgpO1xyXG5cdFx0aWYgKHN1Y2Nlc3MpXHJcblx0XHQgIHJldHVybiB0cnVlO1xyXG5cdCAgfVxyXG5cdH1cclxuXHRyZXR1cm4gZmFsc2U7XHJcbn07Il19