import { getTikzSuggestions,  } from "./utilities";
import { EditorView, } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { EditorState} from "@codemirror/state";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import Moshe from "./main";
import { Context } from "./utils/context";
import { replaceRange, setCursor } from "./editor utilities/editor_utils";
import { expandSnippets } from "./snippets/snippet_management";
import { queueSnippet } from "./snippets/codemirror/snippet_queue_state_field";
import { BasicTikzToken, BasicTikzTokens } from "./tikzjax/interpret/tokenizeTikzjax";


class SuggestorTrigger{
	text: string
	codeBlockText: string;
	constructor(ctx: Context, view: EditorView){
		this.text=this.getCurrentLineText(ctx.pos, view)
		const source=this.getCodeBlockText(ctx,view)
		if(!source)return
		const tokens=new BasicTikzTokens(source)
		console.log(tokens)
	}
	setTrigger(trigger: string){

	}
	getCurrentLineText(pos: number, view: EditorView): string {
		const line = view.state.doc.lineAt(pos);
		//const cursorOffsetInLine = (pos+2) - line.from;I don't know why I had this here
		const textUpToCursor = line.text.slice(0, pos- line.from).trim();
		const words = textUpToCursor.split(/([\s,\[\](){};]|--\+\+|--\+|--)+/);
		const word=words[words.length - 1]||'';
		console.log(word)
		/* Checks that need to be made
		1. In what command are we in if any.
		2. Are we inputting a Variable a coordinate or formatting.
		3. if Formatting Are we starting to type a command or are we inputting a value to a command
		*/
		return words[words.length - 1] || "";
	}
	getCodeBlockText(ctx: Context,view: EditorView){
		const doc = view.state.doc;
		const { number } = doc.lineAt(ctx.pos);

		const beforeLine = findLine(view.state,number,-1,'```');
		const afterLine =  findLine(view.state,number,1,'```');;
		if (!beforeLine || !afterLine) return null;
		const betweenText = doc.sliceString(beforeLine.to, afterLine.from).trim();
		const relativePos = ctx.pos - beforeLine.to;
		return betweenText
	}
}

const findLine = (state: EditorState, lineNumber: number,dir: number, startsWith: string) => {
	const {doc}=state
	for (let i = lineNumber + dir; i > 0 && i <= doc.lines; i += dir) {
	const line = doc.line(i).text.trim();
	if (line.startsWith(startsWith)) return doc.line(i);
	}
	return null;
};

export class Suggestor {
	private trigger: SuggestorTrigger;
	selectionIndex: number;
	private context: Context;
	isSuggesterDeployed: boolean=false;

	deploySuggestor(context: Context,view: EditorView){
		console.log("sjdsjd")
		this.removeSuggestor()
		this.context=context;
		const suggestions=this.getSuggestions(view)
		if(suggestions.length<1)return;

		const suggestionDropdown = createFloatingSuggestionDropdown(suggestions,view, this.context.pos);
		if (!suggestionDropdown) return;
		document.body.appendChild(suggestionDropdown);
		this.isSuggesterDeployed=true;
		this.selectionIndex=0;
		this.updateSelection(this.getAlldropdownItems());

	}
	updateSuggestorPosition(){

	}

	removeSuggestor() {
		document.body.querySelectorAll(".suggestion-item").forEach(node => node.remove());
		document.body.querySelector(".suggestion-dropdown")?.remove()
		this.isSuggesterDeployed=false;
	}

	getAlldropdownItems(){return document.body.querySelectorAll(".suggestion-item")}
	private dropdownifAnyDeployed(){return document.body.querySelector(".suggestion-dropdown")}

	private handleDropdownNavigation(event: KeyboardEvent,view:EditorView) {
		const dropdown = this.dropdownifAnyDeployed();
		if (!dropdown || this.selectionIndex === undefined) return;
	
		const items = this.getAlldropdownItems();

		if (items.length === 0) return;
		
	}

	private getSuggestions(view: EditorView) {
		this.trigger=new SuggestorTrigger(this.context, view)
		const allSuggestions = getTikzSuggestions().map(s => s.trigger||s.replacement);
	
		const filteredSuggestions = allSuggestions.filter((suggestion) =>
			suggestion.toLowerCase().startsWith(this.trigger.text.toLowerCase())
		);
	
		const sortedSuggestions = filteredSuggestions.sort((a, b) => {
			const lowerLastWord = this.trigger.text.toLowerCase();
			const aLower = a.toLowerCase();
			const bLower = b.toLowerCase();
	

			const aExactMatch = aLower === lowerLastWord ? -1 : 0;
			const bExactMatch = bLower === lowerLastWord ? -1 : 0;
			if (aExactMatch !== bExactMatch) return aExactMatch - bExactMatch;
	
			if (a.length !== b.length) return a.length - b.length;
	
			return aLower.localeCompare(bLower);
		});
		return sortedSuggestions;
	}

	

	updateSelection(items: NodeListOf<Element>) {
		items.forEach((item, index) => {
			if (index === this.selectionIndex) {
				item.classList.add("selected");
				item.scrollIntoView({ block: "nearest" });
			} else {
				item.classList.remove("selected");
			}
		});
	}

	selectDropdownItem(item: Element,view: EditorView) {
		this.removeSuggestor()
		if(!this.context)return ;
		const selectedText = item.textContent || "";
		const pos=this.context.pos;
		queueSnippet(view,pos-this.trigger.text.length,pos,selectedText)
		const success = expandSnippets(view);
		//view.focus();
		//setCursor(view,calculateNewCursorPosition(this.trigger.text,selectedText,pos))
		console.log(`Selected: ${selectedText}`);
	}
}
function calculateNewCursorPosition(triggerText: string, selectedText: string, originalPos: number): number {
    const lengthDifference = selectedText.length - triggerText.length;
    return originalPos + lengthDifference;
}

function createFloatingSuggestionDropdown(suggestions: any[],editorView: EditorView, position: number) {

    const coordinates = editorView.coordsAtPos(position);
    if (!coordinates) return;

    const suggestionDropdown = createSuggestionDropdown(suggestions);

    suggestionDropdown.style.position = "absolute";
    suggestionDropdown.style.left = `${coordinates.left}px`;
    suggestionDropdown.style.top = `${coordinates.bottom}px`;
	return suggestionDropdown;
}


function createSuggestionDropdown(suggestions: string[]) {
    const dropdownContainer = document.createElement("div");
    dropdownContainer.className = "suggestion-dropdown";

    suggestions.forEach((suggestion) => {
        const item = createSuggestionItem(suggestion)
		dropdownContainer.appendChild(item)
    });

    return dropdownContainer;
}

function createSuggestionItem(displayText: string): HTMLElement {
	// Create the outer suggestion item container
	const container = document.createElement("div");
	container.classList.add("suggestion-item");
	container.innerText=displayText
  	return container
	// Create the icon container
	const icon = document.createElement("div");
	icon.classList.add("icon");
	icon.textContent = "ƒ"; // Placeholder icon content
  
	// Create the details container
	const details = document.createElement("div");
	details.classList.add("details");
  
	// Add a name span to details
	const name = document.createElement("span");
	name.classList.add("name");
	name.textContent = "function"; // Placeholder name content
  
	// Add a type span to details
	const type = document.createElement("span");
	type.classList.add("type");
	type.textContent = "Keyword"; // Placeholder type content
  
	// Append name and type to details
	details.appendChild(name);
	details.appendChild(type);
  
	// Append icon and details to the container
	container.appendChild(icon);
	container.appendChild(details);
  
	return container;
}







export function getCharacterAtPos(viewOrState: EditorView | EditorState, pos: number) {
	const state = viewOrState instanceof EditorView ? viewOrState.state : viewOrState;
	const doc = state.doc;
	return doc.slice(pos, pos+1).toString();
}

