// Conceal functions
import { syntaxTree } from "@codemirror/language";
import { getEquationBounds } from "src/utils/context";
import { findMatchingBracket } from "src/utils/editor_utils";
import { mkConcealSpec } from "./conceal";
import { greek, cmd_symbols, map_super, map_sub, fractions, brackets, mathscrcal, mathbb, operators } from "./conceal_maps";
function escapeRegex(regex) {
    const escapeChars = ["\\", "(", ")", "+", "-", "[", "]", "{", "}"];
    for (const escapeChar of escapeChars) {
        regex = regex.replaceAll(escapeChar, "\\" + escapeChar);
    }
    return regex;
}
/**
 * gets the updated end index to include "\\limits" in the concealed text of some conceal match,
 * if said match is directly followed by "\\limits"
 *
 * @param eqn source text
 * @param end index of eqn corresponding to the end of a match to conceal
 * @returns the updated end index to conceal
 */
function getEndIncludingLimits(eqn, end) {
    const LIMITS = "\\limits";
    if (eqn.substring(end, end + LIMITS.length) === LIMITS) {
        return end + LIMITS.length;
    }
    return end;
}
function concealSymbols(eqn, prefix, suffix, symbolMap, className, allowSucceedingLetters = true) {
    const symbolNames = Object.keys(symbolMap);
    const regexStr = prefix + "(" + escapeRegex(symbolNames.join("|")) + ")" + suffix;
    const symbolRegex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(symbolRegex)];
    const specs = [];
    for (const match of matches) {
        const symbol = match[1];
        if (!allowSucceedingLetters) {
            // If the symbol match is succeeded by a letter (e.g. "pm" in "pmatrix" is succeeded by "a"), don't conceal
            const end = match.index + match[0].length;
            if (eqn.charAt(end).match(/[a-zA-Z]/)) {
                continue;
            }
        }
        const end = getEndIncludingLimits(eqn, match.index + match[0].length);
        specs.push(mkConcealSpec({
            start: match.index,
            end: end,
            text: symbolMap[symbol],
            class: className,
        }));
    }
    return specs;
}
function concealModifier(eqn, modifier, combiningCharacter) {
    const regexStr = ("\\\\" + modifier + "{([A-Za-z])}");
    const symbolRegex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(symbolRegex)];
    const specs = [];
    for (const match of matches) {
        const symbol = match[1];
        specs.push(mkConcealSpec({
            start: match.index,
            end: match.index + match[0].length,
            text: symbol + combiningCharacter,
            class: "latex-suite-unicode",
        }));
    }
    return specs;
}
function concealSupSub(eqn, superscript, symbolMap) {
    const prefix = superscript ? "\\^" : "_";
    const regexStr = prefix + "{([A-Za-z0-9\\()\\[\\]/+-=<>':;\\\\ *]+)}";
    const regex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(regex)];
    const specs = [];
    for (const match of matches) {
        const exponent = match[1];
        const elementType = superscript ? "sup" : "sub";
        // Conceal super/subscript symbols as well
        const symbolNames = Object.keys(symbolMap);
        const symbolRegexStr = "\\\\(" + escapeRegex(symbolNames.join("|")) + ")";
        const symbolRegex = new RegExp(symbolRegexStr, "g");
        const replacement = exponent.replace(symbolRegex, (a, b) => {
            return symbolMap[b];
        });
        specs.push(mkConcealSpec({
            start: match.index,
            end: match.index + match[0].length,
            text: replacement,
            class: "cm-number",
            elementType: elementType,
        }));
    }
    return specs;
}
function concealModified_A_to_Z_0_to_9(eqn, mathBBsymbolMap) {
    const regexStr = "\\\\(mathbf|boldsymbol|underline|mathrm|text|mathbb){([A-Za-z0-9 ]+)}";
    const regex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(regex)];
    const specs = [];
    for (const match of matches) {
        const type = match[1];
        const value = match[2];
        const start = match.index;
        const end = start + match[0].length;
        if (type === "mathbf" || type === "boldsymbol") {
            specs.push(mkConcealSpec({
                start: start,
                end: end,
                text: value,
                class: "cm-concealed-bold",
            }));
        }
        else if (type === "underline") {
            specs.push(mkConcealSpec({
                start: start,
                end: end,
                text: value,
                class: "cm-concealed-underline",
            }));
        }
        else if (type === "mathrm") {
            specs.push(mkConcealSpec({
                start: start,
                end: end,
                text: value,
                class: "cm-concealed-mathrm",
            }));
        }
        else if (type === "text") {
            // Conceal _\text{}
            if (start > 0 && eqn.charAt(start - 1) === "_") {
                specs.push(mkConcealSpec({
                    start: start - 1,
                    end: end,
                    text: value,
                    class: "cm-concealed-mathrm",
                    elementType: "sub",
                }));
            }
        }
        else if (type === "mathbb") {
            const letters = Array.from(value);
            const replacement = letters.map(el => mathBBsymbolMap[el]).join("");
            specs.push(mkConcealSpec({ start: start, end: end, text: replacement }));
        }
    }
    return specs;
}
function concealModifiedGreekLetters(eqn, greekSymbolMap) {
    const greekSymbolNames = Object.keys(greekSymbolMap);
    const regexStr = "\\\\(underline|boldsymbol){\\\\(" + escapeRegex(greekSymbolNames.join("|")) + ")}";
    const regex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(regex)];
    const specs = [];
    for (const match of matches) {
        const type = match[1];
        const value = match[2];
        const start = match.index;
        const end = start + match[0].length;
        if (type === "underline") {
            specs.push(mkConcealSpec({
                start: start,
                end: end,
                text: greekSymbolMap[value],
                class: "cm-concealed-underline",
            }));
        }
        else if (type === "boldsymbol") {
            specs.push(mkConcealSpec({
                start: start,
                end: end,
                text: greekSymbolMap[value],
                class: "cm-concealed-bold",
            }));
        }
    }
    return specs;
}
function concealText(eqn) {
    const regexStr = "\\\\text{([A-Za-z0-9-.!?() ]+)}";
    const regex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(regex)];
    const specs = [];
    for (const match of matches) {
        const value = match[1];
        const start = match.index;
        const end = start + match[0].length;
        specs.push(mkConcealSpec({
            start: start,
            end: end,
            text: value,
            class: "cm-concealed-mathrm cm-variable-2",
        }));
    }
    return specs;
}
function concealOperators(eqn, symbols) {
    const regexStr = "(\\\\(" + symbols.join("|") + "))([^a-zA-Z]|$)";
    const regex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(regex)];
    const specs = [];
    for (const match of matches) {
        const value = match[2];
        const start = match.index;
        const end = getEndIncludingLimits(eqn, start + match[1].length);
        specs.push(mkConcealSpec({
            start: start,
            end: end,
            text: value,
            class: "cm-concealed-mathrm cm-variable-2",
        }));
    }
    return specs;
}
function concealAtoZ(eqn, prefix, suffix, symbolMap, className) {
    const regexStr = prefix + "([A-Z]+)" + suffix;
    const symbolRegex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(symbolRegex)];
    const specs = [];
    for (const match of matches) {
        const symbol = match[1];
        const letters = Array.from(symbol);
        const replacement = letters.map(el => symbolMap[el]).join("");
        specs.push(mkConcealSpec({
            start: match.index,
            end: match.index + match[0].length,
            text: replacement,
            class: className,
        }));
    }
    return specs;
}
function concealBraKet(eqn) {
    const langle = "〈";
    const rangle = "〉";
    const vert = "|";
    const specs = [];
    for (const match of eqn.matchAll(/\\(braket|bra|ket){/g)) {
        // index of the "}"
        const contentEnd = findMatchingBracket(eqn, match.index, "{", "}", false);
        if (contentEnd === -1)
            continue;
        const commandStart = match.index;
        // index of the "{"
        const contentStart = commandStart + match[0].length - 1;
        const type = match[1];
        const left = type === "ket" ? vert : langle;
        const right = type === "bra" ? vert : rangle;
        specs.push(mkConcealSpec(
        // Hide the command
        { start: commandStart, end: contentStart, text: "" }, 
        // Replace the "{"
        { start: contentStart, end: contentStart + 1, text: left, class: "cm-bracket" }, 
        // Replace the "}"
        { start: contentEnd, end: contentEnd + 1, text: right, class: "cm-bracket" }));
    }
    return specs;
}
function concealSet(eqn) {
    const specs = [];
    for (const match of eqn.matchAll(/\\set\{/g)) {
        const commandStart = match.index;
        // index of the "{"
        const contentStart = commandStart + match[0].length - 1;
        // index of the "}"
        const contentEnd = findMatchingBracket(eqn, commandStart, "{", "}", false);
        if (contentEnd === -1)
            continue;
        specs.push(mkConcealSpec(
        // Hide "\set"
        { start: commandStart, end: contentStart, text: "" }, 
        // Replace the "{"
        { start: contentStart, end: contentStart + 1, text: "{", class: "cm-bracket" }, 
        // Replace the "}"
        { start: contentEnd, end: contentEnd + 1, text: "}", class: "cm-bracket" }));
    }
    return specs;
}
function concealFraction(eqn) {
    const concealSpecs = [];
    for (const match of eqn.matchAll(/\\(frac|dfrac|tfrac|gfrac){/g)) {
        // index of the closing bracket of the numerator
        const numeratorEnd = findMatchingBracket(eqn, match.index, "{", "}", false);
        if (numeratorEnd === -1)
            continue;
        // Expect there are no spaces between the closing bracket of the numerator
        // and the opening bracket of the denominator
        if (eqn.charAt(numeratorEnd + 1) !== "{")
            continue;
        // index of the closing bracket of the denominator
        const denominatorEnd = findMatchingBracket(eqn, numeratorEnd + 1, "{", "}", false);
        if (denominatorEnd === -1)
            continue;
        const commandStart = match.index;
        const numeratorStart = commandStart + match[0].length - 1;
        const denominatorStart = numeratorEnd + 1;
        concealSpecs.push(mkConcealSpec(
        // Hide "\frac"
        { start: commandStart, end: numeratorStart, text: "" }, 
        // Replace brackets of the numerator
        { start: numeratorStart, end: numeratorStart + 1, text: "(", class: "cm-bracket" }, { start: numeratorEnd, end: numeratorEnd + 1, text: ")", class: "cm-bracket" }, 
        // Add a slash
        { start: numeratorEnd + 1, end: numeratorEnd + 1, text: "/", class: "cm-bracket" }, 
        // Replace brackets of the denominator
        { start: denominatorStart, end: denominatorStart + 1, text: "(", class: "cm-bracket" }, { start: denominatorEnd, end: denominatorEnd + 1, text: ")", class: "cm-bracket" }));
    }
    return concealSpecs;
}
function concealOperatorname(eqn) {
    const regexStr = "\\\\operatorname{([A-Za-z]+)}";
    const regex = new RegExp(regexStr, "g");
    const matches = [...eqn.matchAll(regex)];
    const specs = [];
    for (const match of matches) {
        const value = match[1];
        const start2 = match.index;
        const end2 = start2 + match[0].length;
        specs.push(mkConcealSpec({
            start: start2,
            end: end2,
            text: value,
            class: "cm-concealed-mathrm cm-variable-2"
        }));
    }
    return specs;
}
export function conceal(view) {
    const specs = [];
    for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from,
            to,
            enter: (node) => {
                const type = node.type;
                const to = node.to;
                if (!(type.name.contains("begin") && type.name.contains("math"))) {
                    return;
                }
                const bounds = getEquationBounds(view.state, to);
                if (!bounds)
                    return;
                const eqn = view.state.doc.sliceString(bounds.start, bounds.end);
                const ALL_SYMBOLS = { ...greek, ...cmd_symbols };
                const localSpecs = [
                    ...concealSymbols(eqn, "\\^", "", map_super),
                    ...concealSymbols(eqn, "_", "", map_sub),
                    ...concealSymbols(eqn, "\\\\frac", "", fractions),
                    ...concealSymbols(eqn, "\\\\", "", ALL_SYMBOLS, undefined, false),
                    ...concealSupSub(eqn, true, ALL_SYMBOLS),
                    ...concealSupSub(eqn, false, ALL_SYMBOLS),
                    ...concealModifier(eqn, "hat", "\u0302"),
                    ...concealModifier(eqn, "dot", "\u0307"),
                    ...concealModifier(eqn, "ddot", "\u0308"),
                    ...concealModifier(eqn, "overline", "\u0304"),
                    ...concealModifier(eqn, "bar", "\u0304"),
                    ...concealModifier(eqn, "tilde", "\u0303"),
                    ...concealModifier(eqn, "vec", "\u20D7"),
                    ...concealSymbols(eqn, "\\\\", "", brackets, "cm-bracket"),
                    ...concealAtoZ(eqn, "\\\\mathcal{", "}", mathscrcal),
                    ...concealModifiedGreekLetters(eqn, greek),
                    ...concealModified_A_to_Z_0_to_9(eqn, mathbb),
                    ...concealText(eqn),
                    ...concealBraKet(eqn),
                    ...concealSet(eqn),
                    ...concealFraction(eqn),
                    ...concealOperators(eqn, operators),
                    ...concealOperatorname(eqn)
                ];
                // Make the 'start' and 'end' fields represent positions in the entire
                // document (not in a math expression)
                for (const spec of localSpecs) {
                    for (const replace of spec) {
                        replace.start += bounds.start;
                        replace.end += bounds.start;
                    }
                }
                specs.push(...localSpecs);
            },
        });
    }
    return specs;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uY2VhbF9mbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZWRpdG9yX2V4dGVuc2lvbnMvY29uY2VhbF9mbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsb0JBQW9CO0FBRXBCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUVsRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM3RCxPQUFPLEVBQWUsYUFBYSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRzVILFNBQVMsV0FBVyxDQUFDLEtBQWE7SUFDakMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRW5FLEtBQUssTUFBTSxVQUFVLElBQUksV0FBVyxFQUFFLENBQUM7UUFDdEMsS0FBSyxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLElBQUksR0FBRyxVQUFVLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILFNBQVMscUJBQXFCLENBQUMsR0FBVyxFQUFFLEdBQVc7SUFDdEQsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDO0lBQzFCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMs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LENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQztvQkFDbkMsR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLENBQUM7aUJBQzNCLENBQUM7Z0JBRUYsc0VBQXNFO2dCQUN0RSxzQ0FBc0M7Z0JBQ3RDLEtBQUssTUFBTSxJQUFJLElBQUksVUFBVSxFQUFFLENBQUM7b0JBQy9CLEtBQUssTUFBTSxPQUFPLElBQUksSUFBSSxFQUFFLENBQUM7d0JBQzVCLE9BQU8sQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQzt3QkFDOUIsT0FBTyxDQUFDLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDO29CQUM3QixDQUFDO2dCQUNGLENBQUM7Z0JBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDO1lBQzNCLENBQUM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29uY2VhbCBmdW5jdGlvbnNcclxuXHJcbmltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tIFwiQGNvZGVtaXJyb3IvbGFuZ3VhZ2VcIjtcclxuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcbmltcG9ydCB7IGdldEVxdWF0aW9uQm91bmRzIH0gZnJvbSBcInNyYy91dGlscy9jb250ZXh0XCI7XHJcbmltcG9ydCB7IGZpbmRNYXRjaGluZ0JyYWNrZXQgfSBmcm9tIFwic3JjL3V0aWxzL2VkaXRvcl91dGlsc1wiO1xyXG5pbXBvcnQgeyBDb25jZWFsU3BlYywgbWtDb25jZWFsU3BlYyB9IGZyb20gXCIuL2NvbmNlYWxcIjtcclxuaW1wb3J0IHsgZ3JlZWssIGNtZF9zeW1ib2xzLCBtYXBfc3VwZXIsIG1hcF9zdWIsIGZyYWN0aW9ucywgYnJhY2tldHMsIG1hdGhzY3JjYWwsIG1hdGhiYiwgb3BlcmF0b3JzIH0gZnJvbSBcIi4vY29uY2VhbF9tYXBzXCI7XHJcblxyXG5cclxuZnVuY3Rpb24gZXNjYXBlUmVnZXgocmVnZXg6IHN0cmluZykge1xyXG5cdGNvbnN0IGVzY2FwZUNoYXJzID0gW1wiXFxcXFwiLCBcIihcIiwgXCIpXCIsIFwiK1wiLCBcIi1cIiwgXCJbXCIsIFwiXVwiLCBcIntcIiwgXCJ9XCJdO1xyXG5cclxuXHRmb3IgKGNvbnN0IGVzY2FwZUNoYXIgb2YgZXNjYXBlQ2hhcnMpIHtcclxuXHRcdHJlZ2V4ID0gcmVnZXgucmVwbGFjZUFsbChlc2NhcGVDaGFyLCBcIlxcXFxcIiArIGVzY2FwZUNoYXIpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHJlZ2V4O1xyXG59XHJcblxyXG4vKipcclxuICogZ2V0cyB0aGUgdXBkYXRlZCBlbmQgaW5kZXggdG8gaW5jbHVkZSBcIlxcXFxsaW1pdHNcIiBpbiB0aGUgY29uY2VhbGVkIHRleHQgb2Ygc29tZSBjb25jZWFsIG1hdGNoLFxyXG4gKiBpZiBzYWlkIG1hdGNoIGlzIGRpcmVjdGx5IGZvbGxvd2VkIGJ5IFwiXFxcXGxpbWl0c1wiXHJcbiAqXHJcbiAqIEBwYXJhbSBlcW4gc291cmNlIHRleHRcclxuICogQHBhcmFtIGVuZCBpbmRleCBvZiBlcW4gY29ycmVzcG9uZGluZyB0byB0aGUgZW5kIG9mIGEgbWF0Y2ggdG8gY29uY2VhbFxyXG4gKiBAcmV0dXJucyB0aGUgdXBkYXRlZCBlbmQgaW5kZXggdG8gY29uY2VhbFxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0RW5kSW5jbHVkaW5nTGltaXRzKGVxbjogc3RyaW5nLCBlbmQ6IG51bWJlcik6IG51bWJlciB7XHJcblx0Y29uc3QgTElNSVRTID0gXCJcXFxcbGltaXRzXCI7XHJcblx0aWYgKGVxbi5zdWJzdHJpbmcoZW5kLCBlbmQgKyBMSU1JVFMubGVuZ3RoKSA9PT0gTElNSVRTKSB7XHJcblx0XHRyZXR1cm4gZW5kICsgTElNSVRTLmxlbmd0aDtcclxuXHR9XHJcblx0cmV0dXJuIGVuZDtcclxufVxyXG5cclxuZnVuY3Rpb24gY29uY2VhbFN5bWJvbHMoZXFuOiBzdHJpbmcsIHByZWZpeDogc3RyaW5nLCBzdWZmaXg6IHN0cmluZywgc3ltYm9sTWFwOiB7W2tleTogc3RyaW5nXTogc3RyaW5nfSwgY2xhc3NOYW1lPzogc3RyaW5nLCBhbGxvd1N1Y2NlZWRpbmdMZXR0ZXJzID0gdHJ1ZSk6IENvbmNlYWxTcGVjW10ge1xyXG5cdGNvbnN0IHN5bWJvbE5hbWVzID0gT2JqZWN0LmtleXMoc3ltYm9sTWFwKTtcclxuXHJcblx0Y29uc3QgcmVnZXhTdHIgPSBwcmVmaXggKyBcIihcIiArIGVzY2FwZVJlZ2V4KHN5bWJvbE5hbWVzLmpvaW4oXCJ8XCIpKSArIFwiKVwiICsgc3VmZml4O1xyXG5cdGNvbnN0IHN5bWJvbFJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFN0ciwgXCJnXCIpO1xyXG5cclxuXHJcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwoc3ltYm9sUmVnZXgpXTtcclxuXHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcblx0XHRjb25zdCBzeW1ib2wgPSBtYXRjaFsxXTtcclxuXHJcblx0XHRpZiAoIWFsbG93U3VjY2VlZGluZ0xldHRlcnMpIHtcclxuXHRcdFx0Ly8gSWYgdGhlIHN5bWJvbCBtYXRjaCBpcyBzdWNjZWVkZWQgYnkgYSBsZXR0ZXIgKGUuZy4gXCJwbVwiIGluIFwicG1hdHJpeFwiIGlzIHN1Y2NlZWRlZCBieSBcImFcIiksIGRvbid0IGNvbmNlYWxcclxuXHJcblx0XHRcdGNvbnN0IGVuZCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xyXG5cdFx0XHRpZiAoZXFuLmNoYXJBdChlbmQpLm1hdGNoKC9bYS16QS1aXS8pKSB7XHJcblx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRjb25zdCBlbmQgPSBnZXRFbmRJbmNsdWRpbmdMaW1pdHMoZXFuLCBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCk7XHJcblxyXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcclxuXHRcdFx0c3RhcnQ6IG1hdGNoLmluZGV4LFxyXG5cdFx0XHRlbmQ6IGVuZCxcclxuXHRcdFx0dGV4dDogc3ltYm9sTWFwW3N5bWJvbF0sXHJcblx0XHRcdGNsYXNzOiBjbGFzc05hbWUsXHJcblx0XHR9KSk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxNb2RpZmllcihlcW46IHN0cmluZywgbW9kaWZpZXI6IHN0cmluZywgY29tYmluaW5nQ2hhcmFjdGVyOiBzdHJpbmcpOiBDb25jZWFsU3BlY1tdIHtcclxuXHJcblx0Y29uc3QgcmVnZXhTdHIgPSAoXCJcXFxcXFxcXFwiICsgbW9kaWZpZXIgKyBcInsoW0EtWmEtel0pfVwiKTtcclxuXHRjb25zdCBzeW1ib2xSZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcclxuXHJcblxyXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHN5bWJvbFJlZ2V4KV07XHJcblxyXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XHJcblxyXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG5cdFx0Y29uc3Qgc3ltYm9sID0gbWF0Y2hbMV07XHJcblxyXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcclxuXHRcdFx0c3RhcnQ6IG1hdGNoLmluZGV4LFxyXG5cdFx0XHRlbmQ6IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoLFxyXG5cdFx0XHR0ZXh0OiBzeW1ib2wgKyBjb21iaW5pbmdDaGFyYWN0ZXIsXHJcblx0XHRcdGNsYXNzOiBcImxhdGV4LXN1aXRlLXVuaWNvZGVcIixcclxuXHRcdH0pKTtcclxuXHR9XHJcblxyXG5cdHJldHVybiBzcGVjcztcclxufVxyXG5cclxuZnVuY3Rpb24gY29uY2VhbFN1cFN1YihlcW46IHN0cmluZywgc3VwZXJzY3JpcHQ6IGJvb2xlYW4sIHN5bWJvbE1hcDoge1trZXk6IHN0cmluZ106c3RyaW5nfSk6IENvbmNlYWxTcGVjW10ge1xyXG5cclxuXHRjb25zdCBwcmVmaXggPSBzdXBlcnNjcmlwdCA/IFwiXFxcXF5cIiA6IFwiX1wiO1xyXG5cdGNvbnN0IHJlZ2V4U3RyID0gcHJlZml4ICsgXCJ7KFtBLVphLXowLTlcXFxcKClcXFxcW1xcXFxdLystPTw+Jzo7XFxcXFxcXFwgKl0rKX1cIjtcclxuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcclxuXHJcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcclxuXHJcblxyXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XHJcblxyXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG5cclxuXHRcdGNvbnN0IGV4cG9uZW50ID0gbWF0Y2hbMV07XHJcblx0XHRjb25zdCBlbGVtZW50VHlwZSA9IHN1cGVyc2NyaXB0ID8gXCJzdXBcIiA6IFwic3ViXCI7XHJcblxyXG5cclxuXHRcdC8vIENvbmNlYWwgc3VwZXIvc3Vic2NyaXB0IHN5bWJvbHMgYXMgd2VsbFxyXG5cdFx0Y29uc3Qgc3ltYm9sTmFtZXMgPSBPYmplY3Qua2V5cyhzeW1ib2xNYXApO1xyXG5cclxuXHRcdGNvbnN0IHN5bWJvbFJlZ2V4U3RyID0gXCJcXFxcXFxcXChcIiArIGVzY2FwZVJlZ2V4KHN5bWJvbE5hbWVzLmpvaW4oXCJ8XCIpKSArIFwiKVwiO1xyXG5cdFx0Y29uc3Qgc3ltYm9sUmVnZXggPSBuZXcgUmVnRXhwKHN5bWJvbFJlZ2V4U3RyLCBcImdcIik7XHJcblxyXG5cdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBleHBvbmVudC5yZXBsYWNlKHN5bWJvbFJlZ2V4LCAoYSwgYikgPT4ge1xyXG5cdFx0XHRyZXR1cm4gc3ltYm9sTWFwW2JdO1xyXG5cdFx0fSk7XHJcblxyXG5cclxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdHN0YXJ0OiBtYXRjaC5pbmRleCxcclxuXHRcdFx0ZW5kOiBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCxcclxuXHRcdFx0dGV4dDogcmVwbGFjZW1lbnQsXHJcblx0XHRcdGNsYXNzOiBcImNtLW51bWJlclwiLFxyXG5cdFx0XHRlbGVtZW50VHlwZTogZWxlbWVudFR5cGUsXHJcblx0XHR9KSk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxNb2RpZmllZF9BX3RvX1pfMF90b185KGVxbjogc3RyaW5nLCBtYXRoQkJzeW1ib2xNYXA6IHtba2V5OiBzdHJpbmddOnN0cmluZ30pOiBDb25jZWFsU3BlY1tdIHtcclxuXHJcblx0Y29uc3QgcmVnZXhTdHIgPSBcIlxcXFxcXFxcKG1hdGhiZnxib2xkc3ltYm9sfHVuZGVybGluZXxtYXRocm18dGV4dHxtYXRoYmIpeyhbQS1aYS16MC05IF0rKX1cIjtcclxuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcclxuXHJcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcclxuXHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcblx0XHRjb25zdCB0eXBlID0gbWF0Y2hbMV07XHJcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzJdO1xyXG5cclxuXHRcdGNvbnN0IHN0YXJ0ID0gbWF0Y2guaW5kZXg7XHJcblx0XHRjb25zdCBlbmQgPSBzdGFydCArIG1hdGNoWzBdLmxlbmd0aDtcclxuXHJcblx0XHRpZiAodHlwZSA9PT0gXCJtYXRoYmZcIiB8fCB0eXBlID09PSBcImJvbGRzeW1ib2xcIikge1xyXG5cdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRcdHN0YXJ0OiBzdGFydCxcclxuXHRcdFx0XHRlbmQ6IGVuZCxcclxuXHRcdFx0XHR0ZXh0OiB2YWx1ZSxcclxuXHRcdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtYm9sZFwiLFxyXG5cdFx0XHR9KSk7XHJcblx0XHR9XHJcblx0XHRlbHNlIGlmICh0eXBlID09PSBcInVuZGVybGluZVwiKSB7XHJcblx0XHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdFx0c3RhcnQ6IHN0YXJ0LFxyXG5cdFx0XHRcdGVuZDogZW5kLFxyXG5cdFx0XHRcdHRleHQ6IHZhbHVlLFxyXG5cdFx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC11bmRlcmxpbmVcIixcclxuXHRcdFx0fSkpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSBpZiAodHlwZSA9PT0gXCJtYXRocm1cIikge1xyXG5cdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRcdHN0YXJ0OiBzdGFydCxcclxuXHRcdFx0XHRlbmQ6IGVuZCxcclxuXHRcdFx0XHR0ZXh0OiB2YWx1ZSxcclxuXHRcdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtbWF0aHJtXCIsXHJcblx0XHRcdH0pKTtcclxuXHRcdH1cclxuXHRcdGVsc2UgaWYgKHR5cGUgPT09IFwidGV4dFwiKSB7XHJcblx0XHRcdC8vIENvbmNlYWwgX1xcdGV4dHt9XHJcblx0XHRcdGlmIChzdGFydCA+IDAgJiYgZXFuLmNoYXJBdChzdGFydCAtIDEpID09PSBcIl9cIikge1xyXG5cdFx0XHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdFx0XHRzdGFydDogc3RhcnQgLSAxLFxyXG5cdFx0XHRcdFx0ZW5kOiBlbmQsXHJcblx0XHRcdFx0XHR0ZXh0OiB2YWx1ZSxcclxuXHRcdFx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC1tYXRocm1cIixcclxuXHRcdFx0XHRcdGVsZW1lbnRUeXBlOiBcInN1YlwiLFxyXG5cdFx0XHRcdH0pKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0ZWxzZSBpZiAodHlwZSA9PT0gXCJtYXRoYmJcIikge1xyXG5cdFx0XHRjb25zdCBsZXR0ZXJzID0gQXJyYXkuZnJvbSh2YWx1ZSk7XHJcblx0XHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gbGV0dGVycy5tYXAoZWwgPT4gbWF0aEJCc3ltYm9sTWFwW2VsXSkuam9pbihcIlwiKTtcclxuXHRcdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtzdGFydDogc3RhcnQsIGVuZDogZW5kLCB0ZXh0OiByZXBsYWNlbWVudH0pKTtcclxuXHRcdH1cclxuXHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxNb2RpZmllZEdyZWVrTGV0dGVycyhlcW46IHN0cmluZywgZ3JlZWtTeW1ib2xNYXA6IHtba2V5OiBzdHJpbmddOnN0cmluZ30pOiBDb25jZWFsU3BlY1tdIHtcclxuXHJcblx0Y29uc3QgZ3JlZWtTeW1ib2xOYW1lcyA9IE9iamVjdC5rZXlzKGdyZWVrU3ltYm9sTWFwKTtcclxuXHRjb25zdCByZWdleFN0ciA9IFwiXFxcXFxcXFwodW5kZXJsaW5lfGJvbGRzeW1ib2wpe1xcXFxcXFxcKFwiICsgZXNjYXBlUmVnZXgoZ3JlZWtTeW1ib2xOYW1lcy5qb2luKFwifFwiKSkgICsgXCIpfVwiO1xyXG5cdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFN0ciwgXCJnXCIpO1xyXG5cclxuXHRjb25zdCBtYXRjaGVzID0gWy4uLmVxbi5tYXRjaEFsbChyZWdleCldO1xyXG5cclxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xyXG5cclxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuXHRcdGNvbnN0IHR5cGUgPSBtYXRjaFsxXTtcclxuXHRcdGNvbnN0IHZhbHVlID0gbWF0Y2hbMl07XHJcblxyXG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXRjaC5pbmRleDtcclxuXHRcdGNvbnN0IGVuZCA9IHN0YXJ0ICsgbWF0Y2hbMF0ubGVuZ3RoO1xyXG5cclxuXHRcdGlmICh0eXBlID09PSBcInVuZGVybGluZVwiKSB7XHJcblx0XHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdFx0c3RhcnQ6IHN0YXJ0LFxyXG5cdFx0XHRcdGVuZDogZW5kLFxyXG5cdFx0XHRcdHRleHQ6IGdyZWVrU3ltYm9sTWFwW3ZhbHVlXSxcclxuXHRcdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtdW5kZXJsaW5lXCIsXHJcblx0XHRcdH0pKTtcclxuXHRcdH1cclxuXHRcdGVsc2UgaWYgKHR5cGUgPT09IFwiYm9sZHN5bWJvbFwiKSB7XHJcblx0XHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdFx0c3RhcnQ6IHN0YXJ0LFxyXG5cdFx0XHRcdGVuZDogZW5kLFxyXG5cdFx0XHRcdHRleHQ6IGdyZWVrU3ltYm9sTWFwW3ZhbHVlXSxcclxuXHRcdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtYm9sZFwiLFxyXG5cdFx0XHR9KSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxUZXh0KGVxbjogc3RyaW5nKTogQ29uY2VhbFNwZWNbXSB7XHJcblxyXG5cdGNvbnN0IHJlZ2V4U3RyID0gXCJcXFxcXFxcXHRleHR7KFtBLVphLXowLTktLiE/KCkgXSspfVwiO1xyXG5cdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFN0ciwgXCJnXCIpO1xyXG5cclxuXHRjb25zdCBtYXRjaGVzID0gWy4uLmVxbi5tYXRjaEFsbChyZWdleCldO1xyXG5cclxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xyXG5cclxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuXHRcdGNvbnN0IHZhbHVlID0gbWF0Y2hbMV07XHJcblxyXG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXRjaC5pbmRleDtcclxuXHRcdGNvbnN0IGVuZCA9IHN0YXJ0ICsgbWF0Y2hbMF0ubGVuZ3RoO1xyXG5cclxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdHN0YXJ0OiBzdGFydCxcclxuXHRcdFx0ZW5kOiBlbmQsXHJcblx0XHRcdHRleHQ6IHZhbHVlLFxyXG5cdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtbWF0aHJtIGNtLXZhcmlhYmxlLTJcIixcclxuXHRcdH0pKTtcclxuXHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxPcGVyYXRvcnMoZXFuOiBzdHJpbmcsIHN5bWJvbHM6IHN0cmluZ1tdKTogQ29uY2VhbFNwZWNbXSB7XHJcblxyXG5cdGNvbnN0IHJlZ2V4U3RyID0gXCIoXFxcXFxcXFwoXCIgKyBzeW1ib2xzLmpvaW4oXCJ8XCIpICsgXCIpKShbXmEtekEtWl18JClcIjtcclxuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcclxuXHJcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcclxuXHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzJdO1xyXG5cclxuXHRcdGNvbnN0IHN0YXJ0ID0gbWF0Y2guaW5kZXg7XHJcblx0XHRjb25zdCBlbmQgPSBnZXRFbmRJbmNsdWRpbmdMaW1pdHMoZXFuLCBzdGFydCArIG1hdGNoWzFdLmxlbmd0aCk7XHJcblxyXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcclxuXHRcdFx0c3RhcnQ6IHN0YXJ0LFxyXG5cdFx0XHRlbmQ6IGVuZCxcclxuXHRcdFx0dGV4dDogdmFsdWUsXHJcblx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC1tYXRocm0gY20tdmFyaWFibGUtMlwiLFxyXG5cdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsQXRvWihlcW46IHN0cmluZywgcHJlZml4OiBzdHJpbmcsIHN1ZmZpeDogc3RyaW5nLCBzeW1ib2xNYXA6IHtba2V5OiBzdHJpbmddOiBzdHJpbmd9LCBjbGFzc05hbWU/OiBzdHJpbmcpOiBDb25jZWFsU3BlY1tdIHtcclxuXHJcblx0Y29uc3QgcmVnZXhTdHIgPSBwcmVmaXggKyBcIihbQS1aXSspXCIgKyBzdWZmaXg7XHJcblx0Y29uc3Qgc3ltYm9sUmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XHJcblxyXG5cclxuXHRjb25zdCBtYXRjaGVzID0gWy4uLmVxbi5tYXRjaEFsbChzeW1ib2xSZWdleCldO1xyXG5cclxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xyXG5cclxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuXHRcdGNvbnN0IHN5bWJvbCA9IG1hdGNoWzFdO1xyXG5cdFx0Y29uc3QgbGV0dGVycyA9IEFycmF5LmZyb20oc3ltYm9sKTtcclxuXHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gbGV0dGVycy5tYXAoZWwgPT4gc3ltYm9sTWFwW2VsXSkuam9pbihcIlwiKTtcclxuXHJcblx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRzdGFydDogbWF0Y2guaW5kZXgsXHJcblx0XHRcdGVuZDogbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgsXHJcblx0XHRcdHRleHQ6IHJlcGxhY2VtZW50LFxyXG5cdFx0XHRjbGFzczogY2xhc3NOYW1lLFxyXG5cdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsQnJhS2V0KGVxbjogc3RyaW5nKTogQ29uY2VhbFNwZWNbXSB7XHJcblx0Y29uc3QgbGFuZ2xlID0gXCLjgIhcIjtcclxuXHRjb25zdCByYW5nbGUgPSBcIuOAiVwiO1xyXG5cdGNvbnN0IHZlcnQgPSBcInxcIjtcclxuXHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBlcW4ubWF0Y2hBbGwoL1xcXFwoYnJha2V0fGJyYXxrZXQpey9nKSkge1xyXG5cdFx0Ly8gaW5kZXggb2YgdGhlIFwifVwiXHJcblx0XHRjb25zdCBjb250ZW50RW5kID0gZmluZE1hdGNoaW5nQnJhY2tldChlcW4sIG1hdGNoLmluZGV4LCBcIntcIiwgXCJ9XCIsIGZhbHNlKTtcclxuXHRcdGlmIChjb250ZW50RW5kID09PSAtMSkgY29udGludWU7XHJcblxyXG5cdFx0Y29uc3QgY29tbWFuZFN0YXJ0ID0gbWF0Y2guaW5kZXg7XHJcblx0XHQvLyBpbmRleCBvZiB0aGUgXCJ7XCJcclxuXHRcdGNvbnN0IGNvbnRlbnRTdGFydCA9IGNvbW1hbmRTdGFydCArIG1hdGNoWzBdLmxlbmd0aCAtIDE7XHJcblxyXG5cdFx0Y29uc3QgdHlwZSA9IG1hdGNoWzFdO1xyXG5cdFx0Y29uc3QgbGVmdCA9IHR5cGUgPT09IFwia2V0XCIgPyB2ZXJ0IDogbGFuZ2xlO1xyXG5cdFx0Y29uc3QgcmlnaHQgPSB0eXBlID09PSBcImJyYVwiID8gdmVydCA6IHJhbmdsZTtcclxuXHJcblx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoXHJcblx0XHRcdC8vIEhpZGUgdGhlIGNvbW1hbmRcclxuXHRcdFx0eyBzdGFydDogY29tbWFuZFN0YXJ0LCBlbmQ6IGNvbnRlbnRTdGFydCwgdGV4dDogXCJcIiB9LFxyXG5cdFx0XHQvLyBSZXBsYWNlIHRoZSBcIntcIlxyXG5cdFx0XHR7IHN0YXJ0OiBjb250ZW50U3RhcnQsIGVuZDogY29udGVudFN0YXJ0ICsgMSwgdGV4dDogbGVmdCwgY2xhc3M6IFwiY20tYnJhY2tldFwiIH0sXHJcblx0XHRcdC8vIFJlcGxhY2UgdGhlIFwifVwiXHJcblx0XHRcdHsgc3RhcnQ6IGNvbnRlbnRFbmQsIGVuZDogY29udGVudEVuZCArIDEsIHRleHQ6IHJpZ2h0LCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcclxuXHRcdCkpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsU2V0KGVxbjogc3RyaW5nKTogQ29uY2VhbFNwZWNbXSB7XHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBlcW4ubWF0Y2hBbGwoL1xcXFxzZXRcXHsvZykpIHtcclxuXHRcdGNvbnN0IGNvbW1hbmRTdGFydCA9IG1hdGNoLmluZGV4O1xyXG5cdFx0Ly8gaW5kZXggb2YgdGhlIFwie1wiXHJcblx0XHRjb25zdCBjb250ZW50U3RhcnQgPSBjb21tYW5kU3RhcnQgKyBtYXRjaFswXS5sZW5ndGggLSAxO1xyXG5cclxuXHRcdC8vIGluZGV4IG9mIHRoZSBcIn1cIlxyXG5cdFx0Y29uc3QgY29udGVudEVuZCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQoZXFuLCBjb21tYW5kU3RhcnQsIFwie1wiLCBcIn1cIiwgZmFsc2UpO1xyXG5cdFx0aWYgKGNvbnRlbnRFbmQgPT09IC0xKSBjb250aW51ZTtcclxuXHJcblx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoXHJcblx0XHRcdC8vIEhpZGUgXCJcXHNldFwiXHJcblx0XHRcdHsgc3RhcnQ6IGNvbW1hbmRTdGFydCwgZW5kOiBjb250ZW50U3RhcnQsIHRleHQ6IFwiXCIgfSxcclxuXHRcdFx0Ly8gUmVwbGFjZSB0aGUgXCJ7XCJcclxuXHRcdFx0eyBzdGFydDogY29udGVudFN0YXJ0LCBlbmQ6IGNvbnRlbnRTdGFydCArIDEsIHRleHQ6IFwie1wiLCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcclxuXHRcdFx0Ly8gUmVwbGFjZSB0aGUgXCJ9XCJcclxuXHRcdFx0eyBzdGFydDogY29udGVudEVuZCwgZW5kOiBjb250ZW50RW5kICsgMSwgdGV4dDogXCJ9XCIsIGNsYXNzOiBcImNtLWJyYWNrZXRcIiB9LFxyXG5cdFx0KSk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxGcmFjdGlvbihlcW46IHN0cmluZyk6IENvbmNlYWxTcGVjW10ge1xyXG5cdGNvbnN0IGNvbmNlYWxTcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xyXG5cclxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIGVxbi5tYXRjaEFsbCgvXFxcXChmcmFjfGRmcmFjfHRmcmFjfGdmcmFjKXsvZykpIHtcclxuXHRcdC8vIGluZGV4IG9mIHRoZSBjbG9zaW5nIGJyYWNrZXQgb2YgdGhlIG51bWVyYXRvclxyXG5cdFx0Y29uc3QgbnVtZXJhdG9yRW5kID0gZmluZE1hdGNoaW5nQnJhY2tldChlcW4sIG1hdGNoLmluZGV4LCBcIntcIiwgXCJ9XCIsIGZhbHNlKTtcclxuXHRcdGlmIChudW1lcmF0b3JFbmQgPT09IC0xKSBjb250aW51ZTtcclxuXHJcblx0XHQvLyBFeHBlY3QgdGhlcmUgYXJlIG5vIHNwYWNlcyBiZXR3ZWVuIHRoZSBjbG9zaW5nIGJyYWNrZXQgb2YgdGhlIG51bWVyYXRvclxyXG5cdFx0Ly8gYW5kIHRoZSBvcGVuaW5nIGJyYWNrZXQgb2YgdGhlIGRlbm9taW5hdG9yXHJcblx0XHRpZiAoZXFuLmNoYXJBdChudW1lcmF0b3JFbmQgKyAxKSAhPT0gXCJ7XCIpIGNvbnRpbnVlO1xyXG5cclxuXHRcdC8vIGluZGV4IG9mIHRoZSBjbG9zaW5nIGJyYWNrZXQgb2YgdGhlIGRlbm9taW5hdG9yXHJcblx0XHRjb25zdCBkZW5vbWluYXRvckVuZCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQoZXFuLCBudW1lcmF0b3JFbmQgKyAxLCBcIntcIiwgXCJ9XCIsIGZhbHNlKTtcclxuXHRcdGlmIChkZW5vbWluYXRvckVuZCA9PT0gLTEpIGNvbnRpbnVlO1xyXG5cclxuXHRcdGNvbnN0IGNvbW1hbmRTdGFydCA9IG1hdGNoLmluZGV4O1xyXG5cdFx0Y29uc3QgbnVtZXJhdG9yU3RhcnQgPSBjb21tYW5kU3RhcnQgKyBtYXRjaFswXS5sZW5ndGggLSAxO1xyXG5cdFx0Y29uc3QgZGVub21pbmF0b3JTdGFydCA9IG51bWVyYXRvckVuZCArIDE7XHJcblxyXG5cdFx0Y29uY2VhbFNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyhcclxuXHRcdFx0Ly8gSGlkZSBcIlxcZnJhY1wiXHJcblx0XHRcdHsgc3RhcnQ6IGNvbW1hbmRTdGFydCwgZW5kOiBudW1lcmF0b3JTdGFydCwgdGV4dDogXCJcIiB9LFxyXG5cdFx0XHQvLyBSZXBsYWNlIGJyYWNrZXRzIG9mIHRoZSBudW1lcmF0b3JcclxuXHRcdFx0eyBzdGFydDogbnVtZXJhdG9yU3RhcnQsIGVuZDogbnVtZXJhdG9yU3RhcnQgKyAxLCB0ZXh0OiBcIihcIiwgY2xhc3M6IFwiY20tYnJhY2tldFwiIH0sXHJcblx0XHRcdHsgc3RhcnQ6IG51bWVyYXRvckVuZCwgZW5kOiBudW1lcmF0b3JFbmQgKyAxLCB0ZXh0OiBcIilcIiwgY2xhc3M6IFwiY20tYnJhY2tldFwifSxcclxuXHRcdFx0Ly8gQWRkIGEgc2xhc2hcclxuXHRcdFx0eyBzdGFydDogbnVtZXJhdG9yRW5kICsgMSwgZW5kOiBudW1lcmF0b3JFbmQgKyAxLCB0ZXh0OiBcIi9cIiwgY2xhc3M6IFwiY20tYnJhY2tldFwiIH0sXHJcblx0XHRcdC8vIFJlcGxhY2UgYnJhY2tldHMgb2YgdGhlIGRlbm9taW5hdG9yXHJcblx0XHRcdHsgc3RhcnQ6IGRlbm9taW5hdG9yU3RhcnQsIGVuZDogZGVub21pbmF0b3JTdGFydCArIDEsIHRleHQ6IFwiKFwiLCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcclxuXHRcdFx0eyBzdGFydDogZGVub21pbmF0b3JFbmQsIGVuZDogZGVub21pbmF0b3JFbmQgKyAxLCB0ZXh0OiBcIilcIiwgY2xhc3M6IFwiY20tYnJhY2tldFwiIH0sXHJcblx0XHQpKTtcclxuXHR9XHJcblxyXG5cdHJldHVybiBjb25jZWFsU3BlY3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxPcGVyYXRvcm5hbWUoZXFuOiBzdHJpbmcpOiBDb25jZWFsU3BlY1tdIHtcclxuXHRjb25zdCByZWdleFN0ciA9IFwiXFxcXFxcXFxvcGVyYXRvcm5hbWV7KFtBLVphLXpdKyl9XCI7XHJcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XHJcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcclxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xyXG5cclxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuXHRcdGNvbnN0IHZhbHVlID0gbWF0Y2hbMV07XHJcblx0XHRjb25zdCBzdGFydDIgPSBtYXRjaC5pbmRleCE7XHJcblx0XHRjb25zdCBlbmQyID0gc3RhcnQyICsgbWF0Y2hbMF0ubGVuZ3RoO1xyXG5cclxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdHN0YXJ0OiBzdGFydDIsXHJcblx0XHRcdGVuZDogZW5kMixcclxuXHRcdFx0dGV4dDogdmFsdWUsXHJcblx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC1tYXRocm0gY20tdmFyaWFibGUtMlwiXHJcblx0XHR9KSk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb25jZWFsKHZpZXc6IEVkaXRvclZpZXcpOiBDb25jZWFsU3BlY1tdIHtcclxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xyXG5cclxuXHRmb3IgKGNvbnN0IHsgZnJvbSwgdG8gfSBvZiB2aWV3LnZpc2libGVSYW5nZXMpIHtcclxuXHJcblx0XHRzeW50YXhUcmVlKHZpZXcuc3RhdGUpLml0ZXJhdGUoe1xyXG5cdFx0XHRmcm9tLFxyXG5cdFx0XHR0byxcclxuXHRcdFx0ZW50ZXI6IChub2RlKSA9PiB7XHJcblx0XHRcdFx0Y29uc3QgdHlwZSA9IG5vZGUudHlwZTtcclxuXHRcdFx0XHRjb25zdCB0byA9IG5vZGUudG87XHJcblxyXG5cdFx0XHRcdGlmICghKHR5cGUubmFtZS5jb250YWlucyhcImJlZ2luXCIpICYmIHR5cGUubmFtZS5jb250YWlucyhcIm1hdGhcIikpKSB7XHJcblx0XHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRjb25zdCBib3VuZHMgPSBnZXRFcXVhdGlvbkJvdW5kcyh2aWV3LnN0YXRlLCB0byk7XHJcblx0XHRcdFx0aWYgKCFib3VuZHMpIHJldHVybjtcclxuXHJcblxyXG5cdFx0XHRcdGNvbnN0IGVxbiA9IHZpZXcuc3RhdGUuZG9jLnNsaWNlU3RyaW5nKGJvdW5kcy5zdGFydCwgYm91bmRzLmVuZCk7XHJcblxyXG5cclxuXHRcdFx0XHRjb25zdCBBTExfU1lNQk9MUyA9IHsuLi5ncmVlaywgLi4uY21kX3N5bWJvbHN9O1xyXG5cclxuXHRcdFx0XHRjb25zdCBsb2NhbFNwZWNzID0gW1xyXG5cdFx0XHRcdFx0Li4uY29uY2VhbFN5bWJvbHMoZXFuLCBcIlxcXFxeXCIsIFwiXCIsIG1hcF9zdXBlciksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsU3ltYm9scyhlcW4sIFwiX1wiLCBcIlwiLCBtYXBfc3ViKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxTeW1ib2xzKGVxbiwgXCJcXFxcXFxcXGZyYWNcIiwgXCJcIiwgZnJhY3Rpb25zKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxTeW1ib2xzKGVxbiwgXCJcXFxcXFxcXFwiLCBcIlwiLCBBTExfU1lNQk9MUywgdW5kZWZpbmVkLCBmYWxzZSksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsU3VwU3ViKGVxbiwgdHJ1ZSwgQUxMX1NZTUJPTFMpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbFN1cFN1YihlcW4sIGZhbHNlLCBBTExfU1lNQk9MUyksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsTW9kaWZpZXIoZXFuLCBcImhhdFwiLCBcIlxcdTAzMDJcIiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsTW9kaWZpZXIoZXFuLCBcImRvdFwiLCBcIlxcdTAzMDdcIiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsTW9kaWZpZXIoZXFuLCBcImRkb3RcIiwgXCJcXHUwMzA4XCIpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJvdmVybGluZVwiLCBcIlxcdTAzMDRcIiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsTW9kaWZpZXIoZXFuLCBcImJhclwiLCBcIlxcdTAzMDRcIiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsTW9kaWZpZXIoZXFuLCBcInRpbGRlXCIsIFwiXFx1MDMwM1wiKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxNb2RpZmllcihlcW4sIFwidmVjXCIsIFwiXFx1MjBEN1wiKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxTeW1ib2xzKGVxbiwgXCJcXFxcXFxcXFwiLCBcIlwiLCBicmFja2V0cywgXCJjbS1icmFja2V0XCIpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbEF0b1ooZXFuLCBcIlxcXFxcXFxcbWF0aGNhbHtcIiwgXCJ9XCIsIG1hdGhzY3JjYWwpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVkR3JlZWtMZXR0ZXJzKGVxbiwgZ3JlZWspLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVkX0FfdG9fWl8wX3RvXzkoZXFuLCBtYXRoYmIpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbFRleHQoZXFuKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxCcmFLZXQoZXFuKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxTZXQoZXFuKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxGcmFjdGlvbihlcW4pLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE9wZXJhdG9ycyhlcW4sIG9wZXJhdG9ycyksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsT3BlcmF0b3JuYW1lKGVxbilcclxuXHRcdFx0XHRdO1xyXG5cclxuXHRcdFx0XHQvLyBNYWtlIHRoZSAnc3RhcnQnIGFuZCAnZW5kJyBmaWVsZHMgcmVwcmVzZW50IHBvc2l0aW9ucyBpbiB0aGUgZW50aXJlXHJcblx0XHRcdFx0Ly8gZG9jdW1lbnQgKG5vdCBpbiBhIG1hdGggZXhwcmVzc2lvbilcclxuXHRcdFx0XHRmb3IgKGNvbnN0IHNwZWMgb2YgbG9jYWxTcGVjcykge1xyXG5cdFx0XHRcdFx0Zm9yIChjb25zdCByZXBsYWNlIG9mIHNwZWMpIHtcclxuXHRcdFx0XHRcdFx0cmVwbGFjZS5zdGFydCArPSBib3VuZHMuc3RhcnQ7XHJcblx0XHRcdFx0XHRcdHJlcGxhY2UuZW5kICs9IGJvdW5kcy5zdGFydDtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHNwZWNzLnB1c2goLi4ubG9jYWxTcGVjcyk7XHJcblx0XHRcdH0sXHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHJldHVybiBzcGVjcztcclxufVxyXG4iXX0=