import Moshe from "./main";
import { getTikzSuggestions, Latex } from "./utilities";
import { EditorView, ViewPlugin, ViewUpdate ,Decoration, } from "@codemirror/view";
import { EditorState, Prec,Extension } from "@codemirror/state";
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
    private shouldListenForTransaction: boolean = false;
    private activeEditorView: EditorView | null = null;
    private suggestionActive: boolean = false;
    private suggestor: Suggestor = new Suggestor();

    private isSuggesterDeployed(): boolean {
        return !!document.body.querySelector(".suggestion-dropdown");
    }

    setEditorExtensions(app: Moshe) {
		while (app.editorExtensions.length) app.editorExtensions.pop(); // Clear existing extensions
		this.monitor(app); 
		this.snippetExtensions(app);
	
		const flatExtensions = app.editorExtensions.flat();
	
		app.registerEditorExtension(flatExtensions);
	}
	

    private monitor(app: Moshe) {
        app.registerEditorExtension([
            Prec.highest(
                EditorView.domEventHandlers({
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
                })
            ),
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

    private snippetExtensions(app: Moshe) {
		app.editorExtensions.push([
			tabstopsStateField.extension,
			snippetQueueStateField.extension,
			snippetInvertedEffects,
		]);
	}
	

    private registerDecorations(app: Moshe){
        app.registerEditorExtension(
            ViewPlugin.fromClass(RtlForc, {
            decorations: (v) => v.decorations,
          }
        ));
    }

	private onClick=(event: MouseEvent,view: EditorView)=>{
		const suggestionItems = document.body.querySelectorAll(".suggestion-item");
	
		// Check if the click is on a suggestion item
		const clickedSuggestion = Array.from(suggestionItems).find((item) =>
			item.contains(event.target as Node)
		);
	
		if (clickedSuggestion) {
			this.suggestor.selectDropdownItem(clickedSuggestion,view);
		}
		
	}
	private onTransaction=(view: EditorView)=> {
		const ctx = Context.fromView(view);
		if (ctx.codeblockLanguage === "tikz") {
			this.suggestor.deploySuggestor(ctx,view)
		}
	}

	private onKeydown = (event: KeyboardEvent, view: EditorView) => {
		let key = event.key;
		const ctx = Context.fromView(view);
		if (!(event.ctrlKey || event.metaKey) && (ctx.mode.inMath() && (!ctx.inTextEnvironment() || ctx.codeblockLanguage.match(/(tikz)/)))) {
		  const trigger = keyboardAutoReplaceHebrewToEnglishTriggers.find((trigger2) => trigger2.key === event.key && trigger2.code === event.code);
		  if (trigger) {
				event.preventDefault();
				key = trigger.replacement;
				replaceRange(view,view.state.selection.main.from,view.state.selection.main.to,key)
				setCursor(view,view.state.selection.main.from+key.length)
		  }
		}
		if(this.suggestor.isSuggesterDeployed){
			handleDropdownNavigation(event,view,this.suggestor)
		}
		const success = handleKeydown(key, event.shiftKey, event.ctrlKey || event.metaKey, isComposing(view, event), view, ctx);
		if (success) 
		  event.preventDefault();
	};

	private decorat(){

	}
}


const handleDropdownNavigation=(event: KeyboardEvent,view:EditorView,suggestor: Suggestor)=>{
	const items = suggestor.getAlldropdownItems();

	if (event.key === "ArrowDown") {
		suggestor.selectionIndex = (suggestor.selectionIndex + 1) % items.length;
		suggestor.updateSelection(items);
		event.preventDefault();
	} else if (event.key === "ArrowUp") {
		suggestor.selectionIndex = (suggestor.selectionIndex - 1 + items.length) % items.length;
		suggestor.updateSelection(items);
		event.preventDefault();
	} else if (event.key === "Enter") {
		const selectedItem = items[suggestor.selectionIndex];
		suggestor.selectDropdownItem(selectedItem,view);
		event.preventDefault();
	} /*else if (event.key === "Escape") {
		dropdown.remove();
		event.preventDefault();
	}*/
}


const handleKeydown = (key: string, shiftKey: boolean, ctrlKey: boolean, isIME: any, view: EditorView, ctx: Context) => {
	const settings = {autoDelete$: false,
		snippetsEnabled:false,
		suppressSnippetTriggerOnIME: false,
		autofractionEnabled: false,
		matrixShortcutsEnabled: false,
		taboutEnabled: false,
	}
		//getLatexSuiteConfig(view);
	let success = false;
	if (settings.autoDelete$ && key === "Backspace" && ctx.mode.inMath()) {/*
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
		} catch (e) {
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
	  if (key === "Tab"/* || shouldTaboutByCloseBracket(view, key)*/) {
		//success = tabout(view, ctx);
		if (success)
		  return true;
	  }
	}
	return false;
};