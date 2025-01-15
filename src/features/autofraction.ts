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
		string = string.slice(identifyBrackets(string));

		const removeRegex = /(?:^|[^\\])[^a-zA-Z0-9-+^%$#@!,_.\\(){}[\]]/;
		while (removeRegex.test(string)) {
			string = string.slice(string.match(removeRegex)?.index! + 1);
		}
		string = string.startsWith("+") ? string.slice(1) : string;
	}
	
	start=(to-string.length);
	if (start === to) { return false; }

	let numerator = view.state.sliceDoc(start, to);

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
export function identifyBrackets(input: string) {
    function indexEnvironment(input: string, open: string, close: string) {
        const ids: Array<{ index: number; depth: number; depthID: number }> = [];
        let depth = 0;
        const depthCounts: Record<number, number> = {};
        const openLen = open.length;
        const closeLen = close.length;

        for (let i = 0; i < input.length; i++) {
            if (input.startsWith(open, i)) {
                if (!depthCounts[depth]) {
                    depthCounts[depth] = 0;
                }
                const depthID = depthCounts[depth]++;
                ids.push({ index: i, depth, depthID });
                depth++;
                i += openLen - 1; // Skip the length of the opening tag
                continue;
            }
            if (input.startsWith(close, i)) {
                if (depth > 0) {
                    depth--;
                    const depthID = depthCounts[depth] - 1;
                    ids.push({ index: i, depth, depthID });
                } else {
                    // Handle unmatched closing bracket
                    ids.push({ index: i, depth: -1, depthID: -1 });
                }
                i += closeLen - 1; // Skip the length of the closing tag
                continue;
            }
        }

        // Add any unmatched opening brackets
        while (depth > 0) {
            depth--;
            ids.push({ index: -1, depth, depthID: depthCounts[depth] - 1 });
        }

        return ids;
    }
	
    const map = new Map<string, { open: string; close: string; fond: Array<{ index: number; depth: number; depthID: number }> }>(
		[
			['parentheses','(',')'],
			['squareBrackets','[',']'],
			['curlyBraces','{','}'],
			['aligned','\\begin{aligned}','\\end{aligned}'],
			['align','\\begin{align}','\\end{align}'],
			['array','\\begin{array}','\\end{array}'],
			['bmatrix','\\begin{bmatrix}','\\end{bmatrix}'],
			['Bmatrix','\\begin{Bmatrix}','\\end{Bmatrix}'],
			['cases','\\begin{cases}','\\end{cases}'],
			['gather','\\begin{gather}','\\end{gather}'],
			['matrix','\\begin{matrix}','\\end{matrix}'],
			['pmatrix','\\begin{pmatrix}','\\end{pmatrix}'],
			['Vmatrix','\\begin{Vmatrix}','\\end{Vmatrix}'],
			['vmatrix','\\begin{vmatrix}','\\end{vmatrix}'],
			['smallmatrix','\\begin{smallmatrix}','\\end{smallmatrix}'],
			['CD','\\begin{CD}','\\end{CD}'],
			['eqnarray','\\begin{eqnarray}','\\end{eqnarray}'],
			['eqnarray*','\\begin{eqnarray*}','\\end{eqnarray*}'],
			['flalign','\\begin{flalign}','\\end{flalign}'],
			['flalign*','\\begin{flalign*}','\\end{flalign*}'],
			['IEEEeqnarray','\\begin{IEEEeqnarray}','\\end{IEEEeqnarray}'],
			['IEEEeqnarray','\\begin{IEEEeqnarray*}','\\end{IEEEeqnarray*}'],
			['multline','\\begin{multline}','\\end{multline}'],
			['split','\\begin{split}','\\end{split}'],
			['subarray','\\begin{subarray}','\\end{subarray}'],
			['subnumcases','\\begin{subnumcases}','\\end{subnumcases}'],
			['substack','\\begin{substack}','\\end{substack}'],
		].map(env => ([env[0], { open: env[1], close: env[2], fond: [] }])));

    for (const [key, value] of map.entries()) {
        value.fond = indexEnvironment(input, value.open, value.close);
    }
    const unmatched: number[] = [];

    for (const [key, value] of map.entries()) {
        for (const obj of value.fond) {
            if (obj.index === -1) {
				const match=value.fond.find(o => o.index >= 0 && o.depth === obj.depth && o.depthID === obj.depthID);
				if(match)
                	unmatched.push(match.index+value.open.length);
            }
        }
    }

    let index = (unmatched.sort((a, b) => b - a)[0]);
    return index !== undefined ? index : 0;
}
