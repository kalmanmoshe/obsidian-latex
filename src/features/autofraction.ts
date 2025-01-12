import { EditorView } from "@codemirror/view";
import { SelectionRange } from "@codemirror/state";
import { findMatchingBracket, getOpenBracket } from "src/utils/editor_utils";
import { queueSnippet } from "src/snippets/codemirror/snippet_queue_state_field";
import { expandSnippets } from "src/snippets/snippet_management";
import { autoEnlargeBrackets } from "./auto_enlarge_brackets";
import { Context } from "src/utils/context";
import { getLatexSuiteConfig } from "src/snippets/codemirror/config";
import { value } from "valibot";


export const runAutoFraction = (view: EditorView, ctx: Context):boolean => {

	for (const range of ctx.ranges) {
		runAutoFractionCursor(view, ctx, range);
	}

	const success = expandSnippets(view);

	if (success) {
		autoEnlargeBrackets(view);
	}

	return success;
}


export const runAutoFractionCursor = (view: EditorView, ctx: Context, range: SelectionRange):boolean => {

	const settings = getLatexSuiteConfig(view);
	const {from, to} = range;

	// Don't run autofraction in excluded environments
	for (const env of settings.autofractionExcludedEnvs) {
		if (ctx.isWithinEnvironment(to, env)) {
			return false;
		}
	}

	// Get the bounds of the equation
	const result = ctx.getBounds();
	if (!result) return false;
	const eqnStart = result.start;

	const curLines = view.state.sliceDoc(eqnStart, to).split("\n");
	let string = curLines[curLines.length - 1];
	let start = eqnStart;

	if (from != to) {
		// We have a selection
		// Set start to the beginning of the selection

		start = from;
	}
	else {
		// Find the contents of the fraction
		// Match everything except spaces and +-, but allow these characters in brackets

		// Also, allow spaces after greek letters
		// By replacing spaces after greek letters with a dummy character (#)

		const greek = "alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|Theta|iota|kappa|lambda|Lambda|mu|nu|omicron|xi|Xi|pi|Pi|rho|sigma|Sigma|tau|upsilon|Upsilon|varphi|phi|Phi|chi|psi|Psi|omega|Omega";
		const regex = new RegExp("(" + greek + ")\s", "g");
		string = string.replace(regex, "$1#$2");
		string=string.slice(string.lastIndexOf(" ")+1);
		const environmentMap= sliceToMatching(string);

		console.log('sliceToMatching(string)',sliceToMatching(string));


	}


	if (start === to) { return false; }

	// Run autofraction
	let numerator = view.state.sliceDoc(start, to);

	// Remove unnecessary outer parentheses
	if (numerator.at(0) === "(" && numerator.at(-1) === ")") {
		const closing = findMatchingBracket(numerator, 0, "(", ")", false);
		if (closing === numerator.length - 1) {
			numerator = numerator.slice(1, -1);
		}
	}

	const replacement = `\\frac{${string}}{$0}$1`

	queueSnippet(view, to-string.length, to, replacement, "/");

	return true;
}


export function sliceToMatching(input: string | any[]) {
    const depthCounts = new Map([
        ['round', { open: 0, close: 0, pairMatchCount: 0, offset: 0 }],
        ['square', { open: 0, close: 0, pairMatchCount: 0, offset: 0 }],
        ['curly', { open: 0, close: 0, pairMatchCount: 0, offset: 0 }],
    ]);

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (char === '(' || char === '[' || char === '{') {
            const type = char === '(' ? 'round' : char === '[' ? 'square' : 'curly';
            const current = depthCounts.get(type);
            if (current) current.open++;
        } else if (char === ')' || char === ']' || char === '}') {
            const type = char === ')' ? 'round' : char === ']' ? 'square' : 'curly';
            const current = depthCounts.get(type);
            if (current) current.close++;
        }
    }

    for (const [key, value] of depthCounts.entries()) {
        value.pairMatchCount = Math.min(value.open, value.close);
        value.offset = value.open - value.close;
		input.map((char: any, index: any) => {
    }

    return depthCounts;
}