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
                const ALL_SYMBOLS = Object.assign(Object.assign({}, greek), cmd_symbols);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uY2VhbF9mbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZWRpdG9yX2V4dGVuc2lvbnMvY29uY2VhbF9mbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsb0JBQW9CO0FBRXBCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUVsRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM3RCxPQUFPLEVBQWUsYUFBYSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRzVILFNBQVMsV0FBVyxDQUFDLEtBQWE7SUFDakMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRW5FLEtBQUssTUFBTSxVQUFVLElBQUksV0FBVyxFQUFFLENBQUM7UUFDdEMsS0FBSyxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLElBQUksR0FBRyxVQUFVLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILFNBQVMscUJBQXFCLENBQUMsR0FBVyxFQUFFLEdBQVc7SUFDdEQsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDO0lBQzFCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMs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RSxTQUFTLENBQUM7b0JBQ25DLEdBQUcsbUJBQW1CLENBQUMsR0FBRyxDQUFDO2lCQUMzQixDQUFDO2dCQUVGLHNFQUFzRTtnQkFDdEUsc0NBQXNDO2dCQUN0QyxLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUMvQixLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksRUFBRSxDQUFDO3dCQUM1QixPQUFPLENBQUMsS0FBSyxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUM7d0JBQzlCLE9BQU8sQ0FBQyxHQUFHLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQztvQkFDN0IsQ0FBQztnQkFDRixDQUFDO2dCQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQztZQUMzQixDQUFDO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvbmNlYWwgZnVuY3Rpb25zXHJcblxyXG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBnZXRFcXVhdGlvbkJvdW5kcyB9IGZyb20gXCJzcmMvdXRpbHMvY29udGV4dFwiO1xyXG5pbXBvcnQgeyBmaW5kTWF0Y2hpbmdCcmFja2V0IH0gZnJvbSBcInNyYy91dGlscy9lZGl0b3JfdXRpbHNcIjtcclxuaW1wb3J0IHsgQ29uY2VhbFNwZWMsIG1rQ29uY2VhbFNwZWMgfSBmcm9tIFwiLi9jb25jZWFsXCI7XHJcbmltcG9ydCB7IGdyZWVrLCBjbWRfc3ltYm9scywgbWFwX3N1cGVyLCBtYXBfc3ViLCBmcmFjdGlvbnMsIGJyYWNrZXRzLCBtYXRoc2NyY2FsLCBtYXRoYmIsIG9wZXJhdG9ycyB9IGZyb20gXCIuL2NvbmNlYWxfbWFwc1wiO1xyXG5cclxuXHJcbmZ1bmN0aW9uIGVzY2FwZVJlZ2V4KHJlZ2V4OiBzdHJpbmcpIHtcclxuXHRjb25zdCBlc2NhcGVDaGFycyA9IFtcIlxcXFxcIiwgXCIoXCIsIFwiKVwiLCBcIitcIiwgXCItXCIsIFwiW1wiLCBcIl1cIiwgXCJ7XCIsIFwifVwiXTtcclxuXHJcblx0Zm9yIChjb25zdCBlc2NhcGVDaGFyIG9mIGVzY2FwZUNoYXJzKSB7XHJcblx0XHRyZWdleCA9IHJlZ2V4LnJlcGxhY2VBbGwoZXNjYXBlQ2hhciwgXCJcXFxcXCIgKyBlc2NhcGVDaGFyKTtcclxuXHR9XHJcblxyXG5cdHJldHVybiByZWdleDtcclxufVxyXG5cclxuLyoqXHJcbiAqIGdldHMgdGhlIHVwZGF0ZWQgZW5kIGluZGV4IHRvIGluY2x1ZGUgXCJcXFxcbGltaXRzXCIgaW4gdGhlIGNvbmNlYWxlZCB0ZXh0IG9mIHNvbWUgY29uY2VhbCBtYXRjaCxcclxuICogaWYgc2FpZCBtYXRjaCBpcyBkaXJlY3RseSBmb2xsb3dlZCBieSBcIlxcXFxsaW1pdHNcIlxyXG4gKlxyXG4gKiBAcGFyYW0gZXFuIHNvdXJjZSB0ZXh0XHJcbiAqIEBwYXJhbSBlbmQgaW5kZXggb2YgZXFuIGNvcnJlc3BvbmRpbmcgdG8gdGhlIGVuZCBvZiBhIG1hdGNoIHRvIGNvbmNlYWxcclxuICogQHJldHVybnMgdGhlIHVwZGF0ZWQgZW5kIGluZGV4IHRvIGNvbmNlYWxcclxuICovXHJcbmZ1bmN0aW9uIGdldEVuZEluY2x1ZGluZ0xpbWl0cyhlcW46IHN0cmluZywgZW5kOiBudW1iZXIpOiBudW1iZXIge1xyXG5cdGNvbnN0IExJTUlUUyA9IFwiXFxcXGxpbWl0c1wiO1xyXG5cdGlmIChlcW4uc3Vic3RyaW5nKGVuZCwgZW5kICsgTElNSVRTLmxlbmd0aCkgPT09IExJTUlUUykge1xyXG5cdFx0cmV0dXJuIGVuZCArIExJTUlUUy5sZW5ndGg7XHJcblx0fVxyXG5cdHJldHVybiBlbmQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxTeW1ib2xzKGVxbjogc3RyaW5nLCBwcmVmaXg6IHN0cmluZywgc3VmZml4OiBzdHJpbmcsIHN5bWJvbE1hcDoge1trZXk6IHN0cmluZ106IHN0cmluZ30sIGNsYXNzTmFtZT86IHN0cmluZywgYWxsb3dTdWNjZWVkaW5nTGV0dGVycyA9IHRydWUpOiBDb25jZWFsU3BlY1tdIHtcclxuXHRjb25zdCBzeW1ib2xOYW1lcyA9IE9iamVjdC5rZXlzKHN5bWJvbE1hcCk7XHJcblxyXG5cdGNvbnN0IHJlZ2V4U3RyID0gcHJlZml4ICsgXCIoXCIgKyBlc2NhcGVSZWdleChzeW1ib2xOYW1lcy5qb2luKFwifFwiKSkgKyBcIilcIiArIHN1ZmZpeDtcclxuXHRjb25zdCBzeW1ib2xSZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcclxuXHJcblxyXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHN5bWJvbFJlZ2V4KV07XHJcblxyXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XHJcblxyXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG5cdFx0Y29uc3Qgc3ltYm9sID0gbWF0Y2hbMV07XHJcblxyXG5cdFx0aWYgKCFhbGxvd1N1Y2NlZWRpbmdMZXR0ZXJzKSB7XHJcblx0XHRcdC8vIElmIHRoZSBzeW1ib2wgbWF0Y2ggaXMgc3VjY2VlZGVkIGJ5IGEgbGV0dGVyIChlLmcuIFwicG1cIiBpbiBcInBtYXRyaXhcIiBpcyBzdWNjZWVkZWQgYnkgXCJhXCIpLCBkb24ndCBjb25jZWFsXHJcblxyXG5cdFx0XHRjb25zdCBlbmQgPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcclxuXHRcdFx0aWYgKGVxbi5jaGFyQXQoZW5kKS5tYXRjaCgvW2EtekEtWl0vKSkge1xyXG5cdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0Y29uc3QgZW5kID0gZ2V0RW5kSW5jbHVkaW5nTGltaXRzKGVxbiwgbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgpO1xyXG5cclxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdHN0YXJ0OiBtYXRjaC5pbmRleCxcclxuXHRcdFx0ZW5kOiBlbmQsXHJcblx0XHRcdHRleHQ6IHN5bWJvbE1hcFtzeW1ib2xdLFxyXG5cdFx0XHRjbGFzczogY2xhc3NOYW1lLFxyXG5cdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsTW9kaWZpZXIoZXFuOiBzdHJpbmcsIG1vZGlmaWVyOiBzdHJpbmcsIGNvbWJpbmluZ0NoYXJhY3Rlcjogc3RyaW5nKTogQ29uY2VhbFNwZWNbXSB7XHJcblxyXG5cdGNvbnN0IHJlZ2V4U3RyID0gKFwiXFxcXFxcXFxcIiArIG1vZGlmaWVyICsgXCJ7KFtBLVphLXpdKX1cIik7XHJcblx0Y29uc3Qgc3ltYm9sUmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XHJcblxyXG5cclxuXHRjb25zdCBtYXRjaGVzID0gWy4uLmVxbi5tYXRjaEFsbChzeW1ib2xSZWdleCldO1xyXG5cclxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xyXG5cclxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuXHRcdGNvbnN0IHN5bWJvbCA9IG1hdGNoWzFdO1xyXG5cclxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdHN0YXJ0OiBtYXRjaC5pbmRleCxcclxuXHRcdFx0ZW5kOiBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCxcclxuXHRcdFx0dGV4dDogc3ltYm9sICsgY29tYmluaW5nQ2hhcmFjdGVyLFxyXG5cdFx0XHRjbGFzczogXCJsYXRleC1zdWl0ZS11bmljb2RlXCIsXHJcblx0XHR9KSk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbmNlYWxTdXBTdWIoZXFuOiBzdHJpbmcsIHN1cGVyc2NyaXB0OiBib29sZWFuLCBzeW1ib2xNYXA6IHtba2V5OiBzdHJpbmddOnN0cmluZ30pOiBDb25jZWFsU3BlY1tdIHtcclxuXHJcblx0Y29uc3QgcHJlZml4ID0gc3VwZXJzY3JpcHQgPyBcIlxcXFxeXCIgOiBcIl9cIjtcclxuXHRjb25zdCByZWdleFN0ciA9IHByZWZpeCArIFwieyhbQS1aYS16MC05XFxcXCgpXFxcXFtcXFxcXS8rLT08Pic6O1xcXFxcXFxcICpdKyl9XCI7XHJcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XHJcblxyXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHJlZ2V4KV07XHJcblxyXG5cclxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xyXG5cclxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuXHJcblx0XHRjb25zdCBleHBvbmVudCA9IG1hdGNoWzFdO1xyXG5cdFx0Y29uc3QgZWxlbWVudFR5cGUgPSBzdXBlcnNjcmlwdCA/IFwic3VwXCIgOiBcInN1YlwiO1xyXG5cclxuXHJcblx0XHQvLyBDb25jZWFsIHN1cGVyL3N1YnNjcmlwdCBzeW1ib2xzIGFzIHdlbGxcclxuXHRcdGNvbnN0IHN5bWJvbE5hbWVzID0gT2JqZWN0LmtleXMoc3ltYm9sTWFwKTtcclxuXHJcblx0XHRjb25zdCBzeW1ib2xSZWdleFN0ciA9IFwiXFxcXFxcXFwoXCIgKyBlc2NhcGVSZWdleChzeW1ib2xOYW1lcy5qb2luKFwifFwiKSkgKyBcIilcIjtcclxuXHRcdGNvbnN0IHN5bWJvbFJlZ2V4ID0gbmV3IFJlZ0V4cChzeW1ib2xSZWdleFN0ciwgXCJnXCIpO1xyXG5cclxuXHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gZXhwb25lbnQucmVwbGFjZShzeW1ib2xSZWdleCwgKGEsIGIpID0+IHtcclxuXHRcdFx0cmV0dXJuIHN5bWJvbE1hcFtiXTtcclxuXHRcdH0pO1xyXG5cclxuXHJcblx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRzdGFydDogbWF0Y2guaW5kZXgsXHJcblx0XHRcdGVuZDogbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgsXHJcblx0XHRcdHRleHQ6IHJlcGxhY2VtZW50LFxyXG5cdFx0XHRjbGFzczogXCJjbS1udW1iZXJcIixcclxuXHRcdFx0ZWxlbWVudFR5cGU6IGVsZW1lbnRUeXBlLFxyXG5cdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsTW9kaWZpZWRfQV90b19aXzBfdG9fOShlcW46IHN0cmluZywgbWF0aEJCc3ltYm9sTWFwOiB7W2tleTogc3RyaW5nXTpzdHJpbmd9KTogQ29uY2VhbFNwZWNbXSB7XHJcblxyXG5cdGNvbnN0IHJlZ2V4U3RyID0gXCJcXFxcXFxcXChtYXRoYmZ8Ym9sZHN5bWJvbHx1bmRlcmxpbmV8bWF0aHJtfHRleHR8bWF0aGJiKXsoW0EtWmEtejAtOSBdKyl9XCI7XHJcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XHJcblxyXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHJlZ2V4KV07XHJcblxyXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XHJcblxyXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG5cdFx0Y29uc3QgdHlwZSA9IG1hdGNoWzFdO1xyXG5cdFx0Y29uc3QgdmFsdWUgPSBtYXRjaFsyXTtcclxuXHJcblx0XHRjb25zdCBzdGFydCA9IG1hdGNoLmluZGV4O1xyXG5cdFx0Y29uc3QgZW5kID0gc3RhcnQgKyBtYXRjaFswXS5sZW5ndGg7XHJcblxyXG5cdFx0aWYgKHR5cGUgPT09IFwibWF0aGJmXCIgfHwgdHlwZSA9PT0gXCJib2xkc3ltYm9sXCIpIHtcclxuXHRcdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcclxuXHRcdFx0XHRzdGFydDogc3RhcnQsXHJcblx0XHRcdFx0ZW5kOiBlbmQsXHJcblx0XHRcdFx0dGV4dDogdmFsdWUsXHJcblx0XHRcdFx0Y2xhc3M6IFwiY20tY29uY2VhbGVkLWJvbGRcIixcclxuXHRcdFx0fSkpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSBpZiAodHlwZSA9PT0gXCJ1bmRlcmxpbmVcIikge1xyXG5cdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRcdHN0YXJ0OiBzdGFydCxcclxuXHRcdFx0XHRlbmQ6IGVuZCxcclxuXHRcdFx0XHR0ZXh0OiB2YWx1ZSxcclxuXHRcdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtdW5kZXJsaW5lXCIsXHJcblx0XHRcdH0pKTtcclxuXHRcdH1cclxuXHRcdGVsc2UgaWYgKHR5cGUgPT09IFwibWF0aHJtXCIpIHtcclxuXHRcdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcclxuXHRcdFx0XHRzdGFydDogc3RhcnQsXHJcblx0XHRcdFx0ZW5kOiBlbmQsXHJcblx0XHRcdFx0dGV4dDogdmFsdWUsXHJcblx0XHRcdFx0Y2xhc3M6IFwiY20tY29uY2VhbGVkLW1hdGhybVwiLFxyXG5cdFx0XHR9KSk7XHJcblx0XHR9XHJcblx0XHRlbHNlIGlmICh0eXBlID09PSBcInRleHRcIikge1xyXG5cdFx0XHQvLyBDb25jZWFsIF9cXHRleHR7fVxyXG5cdFx0XHRpZiAoc3RhcnQgPiAwICYmIGVxbi5jaGFyQXQoc3RhcnQgLSAxKSA9PT0gXCJfXCIpIHtcclxuXHRcdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRcdFx0c3RhcnQ6IHN0YXJ0IC0gMSxcclxuXHRcdFx0XHRcdGVuZDogZW5kLFxyXG5cdFx0XHRcdFx0dGV4dDogdmFsdWUsXHJcblx0XHRcdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtbWF0aHJtXCIsXHJcblx0XHRcdFx0XHRlbGVtZW50VHlwZTogXCJzdWJcIixcclxuXHRcdFx0XHR9KSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGVsc2UgaWYgKHR5cGUgPT09IFwibWF0aGJiXCIpIHtcclxuXHRcdFx0Y29uc3QgbGV0dGVycyA9IEFycmF5LmZyb20odmFsdWUpO1xyXG5cdFx0XHRjb25zdCByZXBsYWNlbWVudCA9IGxldHRlcnMubWFwKGVsID0+IG1hdGhCQnN5bWJvbE1hcFtlbF0pLmpvaW4oXCJcIik7XHJcblx0XHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7c3RhcnQ6IHN0YXJ0LCBlbmQ6IGVuZCwgdGV4dDogcmVwbGFjZW1lbnR9KSk7XHJcblx0XHR9XHJcblxyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsTW9kaWZpZWRHcmVla0xldHRlcnMoZXFuOiBzdHJpbmcsIGdyZWVrU3ltYm9sTWFwOiB7W2tleTogc3RyaW5nXTpzdHJpbmd9KTogQ29uY2VhbFNwZWNbXSB7XHJcblxyXG5cdGNvbnN0IGdyZWVrU3ltYm9sTmFtZXMgPSBPYmplY3Qua2V5cyhncmVla1N5bWJvbE1hcCk7XHJcblx0Y29uc3QgcmVnZXhTdHIgPSBcIlxcXFxcXFxcKHVuZGVybGluZXxib2xkc3ltYm9sKXtcXFxcXFxcXChcIiArIGVzY2FwZVJlZ2V4KGdyZWVrU3ltYm9sTmFtZXMuam9pbihcInxcIikpICArIFwiKX1cIjtcclxuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcclxuXHJcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcclxuXHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcblx0XHRjb25zdCB0eXBlID0gbWF0Y2hbMV07XHJcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzJdO1xyXG5cclxuXHRcdGNvbnN0IHN0YXJ0ID0gbWF0Y2guaW5kZXg7XHJcblx0XHRjb25zdCBlbmQgPSBzdGFydCArIG1hdGNoWzBdLmxlbmd0aDtcclxuXHJcblx0XHRpZiAodHlwZSA9PT0gXCJ1bmRlcmxpbmVcIikge1xyXG5cdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRcdHN0YXJ0OiBzdGFydCxcclxuXHRcdFx0XHRlbmQ6IGVuZCxcclxuXHRcdFx0XHR0ZXh0OiBncmVla1N5bWJvbE1hcFt2YWx1ZV0sXHJcblx0XHRcdFx0Y2xhc3M6IFwiY20tY29uY2VhbGVkLXVuZGVybGluZVwiLFxyXG5cdFx0XHR9KSk7XHJcblx0XHR9XHJcblx0XHRlbHNlIGlmICh0eXBlID09PSBcImJvbGRzeW1ib2xcIikge1xyXG5cdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRcdHN0YXJ0OiBzdGFydCxcclxuXHRcdFx0XHRlbmQ6IGVuZCxcclxuXHRcdFx0XHR0ZXh0OiBncmVla1N5bWJvbE1hcFt2YWx1ZV0sXHJcblx0XHRcdFx0Y2xhc3M6IFwiY20tY29uY2VhbGVkLWJvbGRcIixcclxuXHRcdFx0fSkpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsVGV4dChlcW46IHN0cmluZyk6IENvbmNlYWxTcGVjW10ge1xyXG5cclxuXHRjb25zdCByZWdleFN0ciA9IFwiXFxcXFxcXFx0ZXh0eyhbQS1aYS16MC05LS4hPygpIF0rKX1cIjtcclxuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcclxuXHJcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcclxuXHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzFdO1xyXG5cclxuXHRcdGNvbnN0IHN0YXJ0ID0gbWF0Y2guaW5kZXg7XHJcblx0XHRjb25zdCBlbmQgPSBzdGFydCArIG1hdGNoWzBdLmxlbmd0aDtcclxuXHJcblx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRzdGFydDogc3RhcnQsXHJcblx0XHRcdGVuZDogZW5kLFxyXG5cdFx0XHR0ZXh0OiB2YWx1ZSxcclxuXHRcdFx0Y2xhc3M6IFwiY20tY29uY2VhbGVkLW1hdGhybSBjbS12YXJpYWJsZS0yXCIsXHJcblx0XHR9KSk7XHJcblxyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsT3BlcmF0b3JzKGVxbjogc3RyaW5nLCBzeW1ib2xzOiBzdHJpbmdbXSk6IENvbmNlYWxTcGVjW10ge1xyXG5cclxuXHRjb25zdCByZWdleFN0ciA9IFwiKFxcXFxcXFxcKFwiICsgc3ltYm9scy5qb2luKFwifFwiKSArIFwiKSkoW15hLXpBLVpdfCQpXCI7XHJcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XHJcblxyXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHJlZ2V4KV07XHJcblxyXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XHJcblxyXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG5cdFx0Y29uc3QgdmFsdWUgPSBtYXRjaFsyXTtcclxuXHJcblx0XHRjb25zdCBzdGFydCA9IG1hdGNoLmluZGV4O1xyXG5cdFx0Y29uc3QgZW5kID0gZ2V0RW5kSW5jbHVkaW5nTGltaXRzKGVxbiwgc3RhcnQgKyBtYXRjaFsxXS5sZW5ndGgpO1xyXG5cclxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XHJcblx0XHRcdHN0YXJ0OiBzdGFydCxcclxuXHRcdFx0ZW5kOiBlbmQsXHJcblx0XHRcdHRleHQ6IHZhbHVlLFxyXG5cdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtbWF0aHJtIGNtLXZhcmlhYmxlLTJcIixcclxuXHRcdH0pKTtcclxuXHR9XHJcblxyXG5cdHJldHVybiBzcGVjcztcclxufVxyXG5cclxuZnVuY3Rpb24gY29uY2VhbEF0b1ooZXFuOiBzdHJpbmcsIHByZWZpeDogc3RyaW5nLCBzdWZmaXg6IHN0cmluZywgc3ltYm9sTWFwOiB7W2tleTogc3RyaW5nXTogc3RyaW5nfSwgY2xhc3NOYW1lPzogc3RyaW5nKTogQ29uY2VhbFNwZWNbXSB7XHJcblxyXG5cdGNvbnN0IHJlZ2V4U3RyID0gcHJlZml4ICsgXCIoW0EtWl0rKVwiICsgc3VmZml4O1xyXG5cdGNvbnN0IHN5bWJvbFJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFN0ciwgXCJnXCIpO1xyXG5cclxuXHJcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwoc3ltYm9sUmVnZXgpXTtcclxuXHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcblx0XHRjb25zdCBzeW1ib2wgPSBtYXRjaFsxXTtcclxuXHRcdGNvbnN0IGxldHRlcnMgPSBBcnJheS5mcm9tKHN5bWJvbCk7XHJcblx0XHRjb25zdCByZXBsYWNlbWVudCA9IGxldHRlcnMubWFwKGVsID0+IHN5bWJvbE1hcFtlbF0pLmpvaW4oXCJcIik7XHJcblxyXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcclxuXHRcdFx0c3RhcnQ6IG1hdGNoLmluZGV4LFxyXG5cdFx0XHRlbmQ6IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoLFxyXG5cdFx0XHR0ZXh0OiByZXBsYWNlbWVudCxcclxuXHRcdFx0Y2xhc3M6IGNsYXNzTmFtZSxcclxuXHRcdH0pKTtcclxuXHR9XHJcblxyXG5cdHJldHVybiBzcGVjcztcclxufVxyXG5cclxuZnVuY3Rpb24gY29uY2VhbEJyYUtldChlcW46IHN0cmluZyk6IENvbmNlYWxTcGVjW10ge1xyXG5cdGNvbnN0IGxhbmdsZSA9IFwi44CIXCI7XHJcblx0Y29uc3QgcmFuZ2xlID0gXCLjgIlcIjtcclxuXHRjb25zdCB2ZXJ0ID0gXCJ8XCI7XHJcblxyXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XHJcblxyXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgZXFuLm1hdGNoQWxsKC9cXFxcKGJyYWtldHxicmF8a2V0KXsvZykpIHtcclxuXHRcdC8vIGluZGV4IG9mIHRoZSBcIn1cIlxyXG5cdFx0Y29uc3QgY29udGVudEVuZCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQoZXFuLCBtYXRjaC5pbmRleCwgXCJ7XCIsIFwifVwiLCBmYWxzZSk7XHJcblx0XHRpZiAoY29udGVudEVuZCA9PT0gLTEpIGNvbnRpbnVlO1xyXG5cclxuXHRcdGNvbnN0IGNvbW1hbmRTdGFydCA9IG1hdGNoLmluZGV4O1xyXG5cdFx0Ly8gaW5kZXggb2YgdGhlIFwie1wiXHJcblx0XHRjb25zdCBjb250ZW50U3RhcnQgPSBjb21tYW5kU3RhcnQgKyBtYXRjaFswXS5sZW5ndGggLSAxO1xyXG5cclxuXHRcdGNvbnN0IHR5cGUgPSBtYXRjaFsxXTtcclxuXHRcdGNvbnN0IGxlZnQgPSB0eXBlID09PSBcImtldFwiID8gdmVydCA6IGxhbmdsZTtcclxuXHRcdGNvbnN0IHJpZ2h0ID0gdHlwZSA9PT0gXCJicmFcIiA/IHZlcnQgOiByYW5nbGU7XHJcblxyXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKFxyXG5cdFx0XHQvLyBIaWRlIHRoZSBjb21tYW5kXHJcblx0XHRcdHsgc3RhcnQ6IGNvbW1hbmRTdGFydCwgZW5kOiBjb250ZW50U3RhcnQsIHRleHQ6IFwiXCIgfSxcclxuXHRcdFx0Ly8gUmVwbGFjZSB0aGUgXCJ7XCJcclxuXHRcdFx0eyBzdGFydDogY29udGVudFN0YXJ0LCBlbmQ6IGNvbnRlbnRTdGFydCArIDEsIHRleHQ6IGxlZnQsIGNsYXNzOiBcImNtLWJyYWNrZXRcIiB9LFxyXG5cdFx0XHQvLyBSZXBsYWNlIHRoZSBcIn1cIlxyXG5cdFx0XHR7IHN0YXJ0OiBjb250ZW50RW5kLCBlbmQ6IGNvbnRlbnRFbmQgKyAxLCB0ZXh0OiByaWdodCwgY2xhc3M6IFwiY20tYnJhY2tldFwiIH0sXHJcblx0XHQpKTtcclxuXHR9XHJcblxyXG5cdHJldHVybiBzcGVjcztcclxufVxyXG5cclxuZnVuY3Rpb24gY29uY2VhbFNldChlcW46IHN0cmluZyk6IENvbmNlYWxTcGVjW10ge1xyXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XHJcblxyXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgZXFuLm1hdGNoQWxsKC9cXFxcc2V0XFx7L2cpKSB7XHJcblx0XHRjb25zdCBjb21tYW5kU3RhcnQgPSBtYXRjaC5pbmRleDtcclxuXHRcdC8vIGluZGV4IG9mIHRoZSBcIntcIlxyXG5cdFx0Y29uc3QgY29udGVudFN0YXJ0ID0gY29tbWFuZFN0YXJ0ICsgbWF0Y2hbMF0ubGVuZ3RoIC0gMTtcclxuXHJcblx0XHQvLyBpbmRleCBvZiB0aGUgXCJ9XCJcclxuXHRcdGNvbnN0IGNvbnRlbnRFbmQgPSBmaW5kTWF0Y2hpbmdCcmFja2V0KGVxbiwgY29tbWFuZFN0YXJ0LCBcIntcIiwgXCJ9XCIsIGZhbHNlKTtcclxuXHRcdGlmIChjb250ZW50RW5kID09PSAtMSkgY29udGludWU7XHJcblxyXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKFxyXG5cdFx0XHQvLyBIaWRlIFwiXFxzZXRcIlxyXG5cdFx0XHR7IHN0YXJ0OiBjb21tYW5kU3RhcnQsIGVuZDogY29udGVudFN0YXJ0LCB0ZXh0OiBcIlwiIH0sXHJcblx0XHRcdC8vIFJlcGxhY2UgdGhlIFwie1wiXHJcblx0XHRcdHsgc3RhcnQ6IGNvbnRlbnRTdGFydCwgZW5kOiBjb250ZW50U3RhcnQgKyAxLCB0ZXh0OiBcIntcIiwgY2xhc3M6IFwiY20tYnJhY2tldFwiIH0sXHJcblx0XHRcdC8vIFJlcGxhY2UgdGhlIFwifVwiXHJcblx0XHRcdHsgc3RhcnQ6IGNvbnRlbnRFbmQsIGVuZDogY29udGVudEVuZCArIDEsIHRleHQ6IFwifVwiLCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcclxuXHRcdCkpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsRnJhY3Rpb24oZXFuOiBzdHJpbmcpOiBDb25jZWFsU3BlY1tdIHtcclxuXHRjb25zdCBjb25jZWFsU3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBlcW4ubWF0Y2hBbGwoL1xcXFwoZnJhY3xkZnJhY3x0ZnJhY3xnZnJhYyl7L2cpKSB7XHJcblx0XHQvLyBpbmRleCBvZiB0aGUgY2xvc2luZyBicmFja2V0IG9mIHRoZSBudW1lcmF0b3JcclxuXHRcdGNvbnN0IG51bWVyYXRvckVuZCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQoZXFuLCBtYXRjaC5pbmRleCwgXCJ7XCIsIFwifVwiLCBmYWxzZSk7XHJcblx0XHRpZiAobnVtZXJhdG9yRW5kID09PSAtMSkgY29udGludWU7XHJcblxyXG5cdFx0Ly8gRXhwZWN0IHRoZXJlIGFyZSBubyBzcGFjZXMgYmV0d2VlbiB0aGUgY2xvc2luZyBicmFja2V0IG9mIHRoZSBudW1lcmF0b3JcclxuXHRcdC8vIGFuZCB0aGUgb3BlbmluZyBicmFja2V0IG9mIHRoZSBkZW5vbWluYXRvclxyXG5cdFx0aWYgKGVxbi5jaGFyQXQobnVtZXJhdG9yRW5kICsgMSkgIT09IFwie1wiKSBjb250aW51ZTtcclxuXHJcblx0XHQvLyBpbmRleCBvZiB0aGUgY2xvc2luZyBicmFja2V0IG9mIHRoZSBkZW5vbWluYXRvclxyXG5cdFx0Y29uc3QgZGVub21pbmF0b3JFbmQgPSBmaW5kTWF0Y2hpbmdCcmFja2V0KGVxbiwgbnVtZXJhdG9yRW5kICsgMSwgXCJ7XCIsIFwifVwiLCBmYWxzZSk7XHJcblx0XHRpZiAoZGVub21pbmF0b3JFbmQgPT09IC0xKSBjb250aW51ZTtcclxuXHJcblx0XHRjb25zdCBjb21tYW5kU3RhcnQgPSBtYXRjaC5pbmRleDtcclxuXHRcdGNvbnN0IG51bWVyYXRvclN0YXJ0ID0gY29tbWFuZFN0YXJ0ICsgbWF0Y2hbMF0ubGVuZ3RoIC0gMTtcclxuXHRcdGNvbnN0IGRlbm9taW5hdG9yU3RhcnQgPSBudW1lcmF0b3JFbmQgKyAxO1xyXG5cclxuXHRcdGNvbmNlYWxTcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoXHJcblx0XHRcdC8vIEhpZGUgXCJcXGZyYWNcIlxyXG5cdFx0XHR7IHN0YXJ0OiBjb21tYW5kU3RhcnQsIGVuZDogbnVtZXJhdG9yU3RhcnQsIHRleHQ6IFwiXCIgfSxcclxuXHRcdFx0Ly8gUmVwbGFjZSBicmFja2V0cyBvZiB0aGUgbnVtZXJhdG9yXHJcblx0XHRcdHsgc3RhcnQ6IG51bWVyYXRvclN0YXJ0LCBlbmQ6IG51bWVyYXRvclN0YXJ0ICsgMSwgdGV4dDogXCIoXCIsIGNsYXNzOiBcImNtLWJyYWNrZXRcIiB9LFxyXG5cdFx0XHR7IHN0YXJ0OiBudW1lcmF0b3JFbmQsIGVuZDogbnVtZXJhdG9yRW5kICsgMSwgdGV4dDogXCIpXCIsIGNsYXNzOiBcImNtLWJyYWNrZXRcIn0sXHJcblx0XHRcdC8vIEFkZCBhIHNsYXNoXHJcblx0XHRcdHsgc3RhcnQ6IG51bWVyYXRvckVuZCArIDEsIGVuZDogbnVtZXJhdG9yRW5kICsgMSwgdGV4dDogXCIvXCIsIGNsYXNzOiBcImNtLWJyYWNrZXRcIiB9LFxyXG5cdFx0XHQvLyBSZXBsYWNlIGJyYWNrZXRzIG9mIHRoZSBkZW5vbWluYXRvclxyXG5cdFx0XHR7IHN0YXJ0OiBkZW5vbWluYXRvclN0YXJ0LCBlbmQ6IGRlbm9taW5hdG9yU3RhcnQgKyAxLCB0ZXh0OiBcIihcIiwgY2xhc3M6IFwiY20tYnJhY2tldFwiIH0sXHJcblx0XHRcdHsgc3RhcnQ6IGRlbm9taW5hdG9yRW5kLCBlbmQ6IGRlbm9taW5hdG9yRW5kICsgMSwgdGV4dDogXCIpXCIsIGNsYXNzOiBcImNtLWJyYWNrZXRcIiB9LFxyXG5cdFx0KSk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gY29uY2VhbFNwZWNzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25jZWFsT3BlcmF0b3JuYW1lKGVxbjogc3RyaW5nKTogQ29uY2VhbFNwZWNbXSB7XHJcblx0Y29uc3QgcmVnZXhTdHIgPSBcIlxcXFxcXFxcb3BlcmF0b3JuYW1leyhbQS1aYS16XSspfVwiO1xyXG5cdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFN0ciwgXCJnXCIpO1xyXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHJlZ2V4KV07XHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzFdO1xyXG5cdFx0Y29uc3Qgc3RhcnQyID0gbWF0Y2guaW5kZXghO1xyXG5cdFx0Y29uc3QgZW5kMiA9IHN0YXJ0MiArIG1hdGNoWzBdLmxlbmd0aDtcclxuXHJcblx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xyXG5cdFx0XHRzdGFydDogc3RhcnQyLFxyXG5cdFx0XHRlbmQ6IGVuZDIsXHJcblx0XHRcdHRleHQ6IHZhbHVlLFxyXG5cdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtbWF0aHJtIGNtLXZhcmlhYmxlLTJcIlxyXG5cdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHNwZWNzO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29uY2VhbCh2aWV3OiBFZGl0b3JWaWV3KTogQ29uY2VhbFNwZWNbXSB7XHJcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcclxuXHJcblx0Zm9yIChjb25zdCB7IGZyb20sIHRvIH0gb2Ygdmlldy52aXNpYmxlUmFuZ2VzKSB7XHJcblxyXG5cdFx0c3ludGF4VHJlZSh2aWV3LnN0YXRlKS5pdGVyYXRlKHtcclxuXHRcdFx0ZnJvbSxcclxuXHRcdFx0dG8sXHJcblx0XHRcdGVudGVyOiAobm9kZSkgPT4ge1xyXG5cdFx0XHRcdGNvbnN0IHR5cGUgPSBub2RlLnR5cGU7XHJcblx0XHRcdFx0Y29uc3QgdG8gPSBub2RlLnRvO1xyXG5cclxuXHRcdFx0XHRpZiAoISh0eXBlLm5hbWUuY29udGFpbnMoXCJiZWdpblwiKSAmJiB0eXBlLm5hbWUuY29udGFpbnMoXCJtYXRoXCIpKSkge1xyXG5cdFx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Y29uc3QgYm91bmRzID0gZ2V0RXF1YXRpb25Cb3VuZHModmlldy5zdGF0ZSwgdG8pO1xyXG5cdFx0XHRcdGlmICghYm91bmRzKSByZXR1cm47XHJcblxyXG5cclxuXHRcdFx0XHRjb25zdCBlcW4gPSB2aWV3LnN0YXRlLmRvYy5zbGljZVN0cmluZyhib3VuZHMuc3RhcnQsIGJvdW5kcy5lbmQpO1xyXG5cclxuXHJcblx0XHRcdFx0Y29uc3QgQUxMX1NZTUJPTFMgPSB7Li4uZ3JlZWssIC4uLmNtZF9zeW1ib2xzfTtcclxuXHJcblx0XHRcdFx0Y29uc3QgbG9jYWxTcGVjcyA9IFtcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxTeW1ib2xzKGVxbiwgXCJcXFxcXlwiLCBcIlwiLCBtYXBfc3VwZXIpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbFN5bWJvbHMoZXFuLCBcIl9cIiwgXCJcIiwgbWFwX3N1YiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsU3ltYm9scyhlcW4sIFwiXFxcXFxcXFxmcmFjXCIsIFwiXCIsIGZyYWN0aW9ucyksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsU3ltYm9scyhlcW4sIFwiXFxcXFxcXFxcIiwgXCJcIiwgQUxMX1NZTUJPTFMsIHVuZGVmaW5lZCwgZmFsc2UpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbFN1cFN1YihlcW4sIHRydWUsIEFMTF9TWU1CT0xTKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxTdXBTdWIoZXFuLCBmYWxzZSwgQUxMX1NZTUJPTFMpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJoYXRcIiwgXCJcXHUwMzAyXCIpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJkb3RcIiwgXCJcXHUwMzA3XCIpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJkZG90XCIsIFwiXFx1MDMwOFwiKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxNb2RpZmllcihlcW4sIFwib3ZlcmxpbmVcIiwgXCJcXHUwMzA0XCIpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJiYXJcIiwgXCJcXHUwMzA0XCIpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJ0aWxkZVwiLCBcIlxcdTAzMDNcIiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsTW9kaWZpZXIoZXFuLCBcInZlY1wiLCBcIlxcdTIwRDdcIiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsU3ltYm9scyhlcW4sIFwiXFxcXFxcXFxcIiwgXCJcIiwgYnJhY2tldHMsIFwiY20tYnJhY2tldFwiKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxBdG9aKGVxbiwgXCJcXFxcXFxcXG1hdGhjYWx7XCIsIFwifVwiLCBtYXRoc2NyY2FsKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxNb2RpZmllZEdyZWVrTGV0dGVycyhlcW4sIGdyZWVrKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxNb2RpZmllZF9BX3RvX1pfMF90b185KGVxbiwgbWF0aGJiKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxUZXh0KGVxbiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsQnJhS2V0KGVxbiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsU2V0KGVxbiksXHJcblx0XHRcdFx0XHQuLi5jb25jZWFsRnJhY3Rpb24oZXFuKSxcclxuXHRcdFx0XHRcdC4uLmNvbmNlYWxPcGVyYXRvcnMoZXFuLCBvcGVyYXRvcnMpLFxyXG5cdFx0XHRcdFx0Li4uY29uY2VhbE9wZXJhdG9ybmFtZShlcW4pXHJcblx0XHRcdFx0XTtcclxuXHJcblx0XHRcdFx0Ly8gTWFrZSB0aGUgJ3N0YXJ0JyBhbmQgJ2VuZCcgZmllbGRzIHJlcHJlc2VudCBwb3NpdGlvbnMgaW4gdGhlIGVudGlyZVxyXG5cdFx0XHRcdC8vIGRvY3VtZW50IChub3QgaW4gYSBtYXRoIGV4cHJlc3Npb24pXHJcblx0XHRcdFx0Zm9yIChjb25zdCBzcGVjIG9mIGxvY2FsU3BlY3MpIHtcclxuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVwbGFjZSBvZiBzcGVjKSB7XHJcblx0XHRcdFx0XHRcdHJlcGxhY2Uuc3RhcnQgKz0gYm91bmRzLnN0YXJ0O1xyXG5cdFx0XHRcdFx0XHRyZXBsYWNlLmVuZCArPSBib3VuZHMuc3RhcnQ7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRzcGVjcy5wdXNoKC4uLmxvY2FsU3BlY3MpO1xyXG5cdFx0XHR9LFxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gc3BlY3M7XHJcbn1cclxuIl19