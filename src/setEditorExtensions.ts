import Moshe from "./main";
import { getTikzSuggestions, Latex } from "./utilities";
import { EditorView, ViewPlugin, ViewUpdate ,Decoration, tooltips, } from "@codemirror/view";
import { EditorState, Prec,Extension } from "@codemirror/state";
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
import { context } from "esbuild-wasm";

export class EditorExtensions {
    private shouldListenForTransaction: boolean = false;
    private activeEditorView: EditorView | null = null;
    private suggestionActive: boolean = false;
    private suggestor: Suggestor = new Suggestor();

    private isSuggesterDeployed(): boolean {
        return !!document.body.querySelector(".suggestion-dropdown");
    }

    setEditorExtensions(app: Moshe) {
		while (app.editorExtensions.length) app.editorExtensions.pop();
		app.editorExtensions.push([
			getLatexSuiteConfigExtension(app.CMSettings),
			Prec.highest(EditorView.domEventHandlers({ "keydown": this.onKeydown })),
			EditorView.updateListener.of(handleUpdate),
			snippetExtensions,
		]);
		this.registerDecorations(app)
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
	

    private monitor(app: Moshe) {
        app.registerEditorExtension([
            Prec.highest(
                EditorView.domEventHandlers({
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
                })
            ),
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
                this.onCursorMove(event, this.activeEditorView)
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
	private onCursorMove(event: MouseEvent,view: EditorView){
		const suggestionItems = document.body.querySelectorAll(".suggestion-item");

		const clickedSuggestion = Array.from(suggestionItems).find((item) =>
			item.contains(event.target as Node)
		);
		if (clickedSuggestion) {
			const index = Array.from(suggestionItems).indexOf(clickedSuggestion);
			this.suggestor.selectionIndex=index
			this.suggestor.updateSelection(suggestionItems)
		}
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
		const dropdownItem = document.body.querySelector(".suggestion-dropdown");
		const clickedDropdown = Array.from(suggestionItems).find((item) =>
			item.contains(event.target as Node)
		);
		if(!clickedDropdown){
			this.suggestor.removeSuggestor()
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
		let trigger
		const ctx = Context.fromView(view);
		if (!(event.ctrlKey || event.metaKey) && ctx.mode.translate) {
		  trigger = keyboardAutoReplaceHebrewToEnglishTriggers.find((trigger2) => trigger2.key === event.key && trigger2.code === event.code);
		  key = trigger?.replacement||key;
		}
		if(this.suggestor.isSuggesterDeployed){
			handleDropdownNavigation(event,view,this.suggestor)
		}
		
		const success = handleKeydown(key, event.shiftKey, event.ctrlKey || event.metaKey, isComposing(view, event), view);
		if (success) 
		  event.preventDefault();
		else if (key !== event.key&&trigger) {
			event.preventDefault();
			key = trigger.replacement;
			replaceRange(view,view.state.selection.main.from,view.state.selection.main.to,key)
			setCursor(view,view.state.selection.main.from+key.length)
	  }
	};

	private decorat(){

	}
}
const handleUpdate = (update: ViewUpdate) => {
	const settings = getLatexSuiteConfig(update.state);

	// The math tooltip handler is driven by view updates because it utilizes
	// information about visual line, which is not available in EditorState
	if (settings.mathPreviewEnabled) {
		handleMathTooltip(update);
	}

	handleUndoRedo(update);
}

const handleDropdownNavigation=(event: KeyboardEvent,view:EditorView,suggestor: Suggestor)=>{
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
		case event.key === "ArrowLeft"||event.key === "ArrowRight":
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
		
	}else if (event.key === "Enter") {
		const selectedItem = items[suggestor.selectionIndex];
		suggestor.selectDropdownItem(selectedItem,view);
		event.preventDefault();
	} /*else if (event.key === "Escape") {
		dropdown.remove();
		event.preventDefault();
	}*/
}


export const handleKeydown = (key: string, shiftKey: boolean, ctrlKey: boolean, isIME: boolean, view: EditorView) => {

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
		if (settings.suppressSnippetTriggerOnIME && isIME) return;

		// Allows Ctrl + z for undo, instead of triggering a snippet ending with z
		if (!ctrlKey) {
			try {
				success = runSnippets(view, ctx, key);
				if (success) return true;
			}
			catch (e) {
				clearSnippetQueue(view);
				console.error(e);
			}
		}
	}

	if (key === "Tab") {
		success = setSelectionToNextTabstop(view);

		if (success) return true;
	}

	if (settings.autofractionEnabled && ctx.mode.strictlyInMath()) {
		if (key === "/") {
			success = runAutoFraction(view, ctx);

			if (success) return true;
		}
	}

	if (settings.matrixShortcutsEnabled && ctx.mode.blockMath) {
		if (["Tab", "Enter"].contains(key)) {
			success = runMatrixShortcuts(view, ctx, key, shiftKey);

			if (success) return true;
		}
	}

	if (settings.taboutEnabled) {
		if (key === "Tab" || shouldTaboutByCloseBracket(view, key)) {
			success = tabout(view, ctx);

			if (success) return true;
		}
	}

	return false;
}