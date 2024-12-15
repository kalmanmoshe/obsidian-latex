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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uY2VhbF9mbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZWRpdG9yX2V4dGVuc2lvbnMvY29uY2VhbF9mbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsb0JBQW9CO0FBRXBCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUVsRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM3RCxPQUFPLEVBQWUsYUFBYSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRzVILFNBQVMsV0FBVyxDQUFDLEtBQWE7SUFDakMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRW5FLEtBQUssTUFBTSxVQUFVLElBQUksV0FBVyxFQUFFLENBQUM7UUFDdEMsS0FBSyxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLElBQUksR0FBRyxVQUFVLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILFNBQVMscUJBQXFCLENBQUMsR0FBVyxFQUFFLEdBQVc7SUFDdEQsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDO0lBQzFCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxNQUFNLEVBQUUsQ0FBQztRQUN4RCxPQUFPLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQzVCLENBQUM7SUFDRCxPQUFPLEdBQUcsQ0FBQztBQUNaLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxHQUFXLEVBQUUsTUFBYyxFQUFFLE1BQWMsRUFBRSxTQUFrQyxFQUFFLFNBQWtCLEVBQUUsc0JBQXNCLEdBQUcsSUFBSTtJQUN6SixNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRTNDLE1BQU0sUUFBUSxHQUFHLE1BQU0sR0FBRyxHQUFHLEdBQUcsV0FBVyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDO0lBQ2xGLE1BQU0sV0FBVyxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUc5QyxNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBRS9DLE1BQU0sS0FBSyxHQUFrQixFQUFFLENBQUM7SUFFaEMsS0FBSyxNQUFNLEtBQUssSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM3QixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDN0IsMkdBQTJHO1lBRTNHLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUMxQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZDLFNBQVM7WUFDVixDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sR0FBRyxHQUFHLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV0RSxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUN4QixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7WUFDbEIsR0FBRyxFQUFFLEdBQUc7WUFDUixJQUFJLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQztZQUN2QixLQUFLLEVBQUUsU0FBUztTQUNoQixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxHQUFXLEVBQUUsUUFBZ0IsRUFBRSxrQkFBMEI7SUFFakYsTUFBTSxRQUFRLEdBQUcsQ0FBQyxNQUFNLEdBQUcsUUFBUSxHQUFHLGNBQWMsQ0FBQyxDQUFDO0lBQ3RELE1BQU0sV0FBVyxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUc5QyxNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBRS9DLE1BQU0sS0FBSyxHQUFrQixFQUFFLENBQUM7SUFFaEMsS0FBSyxNQUFNLEtBQUssSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM3QixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFeEIsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDeEIsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLO1lBQ2xCLEdBQUcsRUFBRSxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNO1lBQ2xDLElBQUksRUFBRSxNQUFNLEdBQUcsa0JBQWtCO1lBQ2pDLEtBQUssRUFBRSxxQkFBcUI7U0FDNUIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsR0FBVyxFQUFFLFdBQW9CLEVBQUUsU0FBaUM7SUFFMUYsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUN6QyxNQUFNLFFBQVEsR0FBRyxNQUFNLEdBQUcsMkNBQTJDLENBQUM7SUFDdEUsTUFBTSxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRXhDLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFHekMsTUFBTSxLQUFLLEdBQWtCLEVBQUUsQ0FBQztJQUVoQyxLQUFLLE1BQU0sS0FBSyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBRTdCLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQixNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBR2hELDBDQUEwQztRQUMxQyxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTNDLE1BQU0sY0FBYyxHQUFHLE9BQU8sR0FBRyxXQUFXLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUMxRSxNQUFNLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFcEQsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDMUQsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckIsQ0FBQyxDQUFDLENBQUM7UUFHSCxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUN4QixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7WUFDbEIsR0FBRyxFQUFFLEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU07WUFDbEMsSUFBSSxFQUFFLFdBQVc7WUFDakIsS0FBSyxFQUFFLFdBQVc7WUFDbEIsV0FBVyxFQUFFLFdBQVc7U0FDeEIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyw2QkFBNkIsQ0FBQyxHQUFXLEVBQUUsZUFBdUM7SUFFMUYsTUFBTSxRQUFRLEdBQUcsdUVBQXVFLENBQUM7SUFDekYsTUFBTSxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRXhDLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFekMsTUFBTSxLQUFLLEdBQWtCLEVBQUUsQ0FBQztJQUVoQyxLQUFLLE1BQU0sS0FBSyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzdCLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdkIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztRQUMxQixNQUFNLEdBQUcsR0FBRyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUVwQyxJQUFJLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxLQUFLLFlBQVksRUFBRSxDQUFDO1lBQ2hELEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO2dCQUN4QixLQUFLLEVBQUUsS0FBSztnQkFDWixHQUFHLEVBQUUsR0FBRztnQkFDUixJQUFJLEVBQUUsS0FBSztnQkFDWCxLQUFLLEVBQUUsbUJBQW1CO2FBQzFCLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQzthQUNJLElBQUksSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQy9CLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO2dCQUN4QixLQUFLLEVBQUUsS0FBSztnQkFDWixHQUFHLEVBQUUsR0FBRztnQkFDUixJQUFJLEVBQUUsS0FBSztnQkFDWCxLQUFLLEVBQUUsd0JBQXdCO2FBQy9CLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQzthQUNJLElBQUksSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzVCLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO2dCQUN4QixLQUFLLEVBQUUsS0FBSztnQkFDWixHQUFHLEVBQUUsR0FBRztnQkFDUixJQUFJLEVBQUUsS0FBSztnQkFDWCxLQUFLLEVBQUUscUJBQXFCO2FBQzVCLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQzthQUNJLElBQUksSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzFCLG1CQUFtQjtZQUNuQixJQUFJLEtBQUssR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2hELEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO29CQUN4QixLQUFLLEVBQUUsS0FBSyxHQUFHLENBQUM7b0JBQ2hCLEdBQUcsRUFBRSxHQUFHO29CQUNSLElBQUksRUFBRSxLQUFLO29CQUNYLEtBQUssRUFBRSxxQkFBcUI7b0JBQzVCLFdBQVcsRUFBRSxLQUFLO2lCQUNsQixDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDRixDQUFDO2FBQ0ksSUFBSSxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDNUIsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3BFLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEUsQ0FBQztJQUVGLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLDJCQUEyQixDQUFDLEdBQVcsRUFBRSxjQUFzQztJQUV2RixNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDckQsTUFBTSxRQUFRLEdBQUcsa0NBQWtDLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFJLElBQUksQ0FBQztJQUN0RyxNQUFNLEtBQUssR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFeEMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUV6QyxNQUFNLEtBQUssR0FBa0IsRUFBRSxDQUFDO0lBRWhDLEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxFQUFFLENBQUM7UUFDN0IsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQzFCLE1BQU0sR0FBRyxHQUFHLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBRXBDLElBQUksSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQzFCLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO2dCQUN4QixLQUFLLEVBQUUsS0FBSztnQkFDWixHQUFHLEVBQUUsR0FBRztnQkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQztnQkFDM0IsS0FBSyxFQUFFLHdCQUF3QjthQUMvQixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7YUFDSSxJQUFJLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztZQUNoQyxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztnQkFDeEIsS0FBSyxFQUFFLEtBQUs7Z0JBQ1osR0FBRyxFQUFFLEdBQUc7Z0JBQ1IsSUFBSSxFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUM7Z0JBQzNCLEtBQUssRUFBRSxtQkFBbUI7YUFDMUIsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLEdBQVc7SUFFL0IsTUFBTSxRQUFRLEdBQUcsaUNBQWlDLENBQUM7SUFDbkQsTUFBTSxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRXhDLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFekMsTUFBTSxLQUFLLEdBQWtCLEVBQUUsQ0FBQztJQUVoQyxLQUFLLE1BQU0sS0FBSyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzdCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQzFCLE1BQU0sR0FBRyxHQUFHLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBRXBDLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ3hCLEtBQUssRUFBRSxLQUFLO1lBQ1osR0FBRyxFQUFFLEdBQUc7WUFDUixJQUFJLEVBQUUsS0FBSztZQUNYLEtBQUssRUFBRSxtQ0FBbUM7U0FDMUMsQ0FBQyxDQUFDLENBQUM7SUFFTCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxHQUFXLEVBQUUsT0FBaUI7SUFFdkQsTUFBTSxRQUFRLEdBQUcsUUFBUSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsaUJBQWlCLENBQUM7SUFDbEUsTUFBTSxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRXhDLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFekMsTUFBTSxLQUFLLEdBQWtCLEVBQUUsQ0FBQztJQUVoQyxLQUFLLE1BQU0sS0FBSyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzdCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQzFCLE1BQU0sR0FBRyxHQUFHLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRWhFLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ3hCLEtBQUssRUFBRSxLQUFLO1lBQ1osR0FBRyxFQUFFLEdBQUc7WUFDUixJQUFJLEVBQUUsS0FBSztZQUNYLEtBQUssRUFBRSxtQ0FBbUM7U0FDMUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsR0FBVyxFQUFFLE1BQWMsRUFBRSxNQUFjLEVBQUUsU0FBa0MsRUFBRSxTQUFrQjtJQUV2SCxNQUFNLFFBQVEsR0FBRyxNQUFNLEdBQUcsVUFBVSxHQUFHLE1BQU0sQ0FBQztJQUM5QyxNQUFNLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFHOUMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUUvQyxNQUFNLEtBQUssR0FBa0IsRUFBRSxDQUFDO0lBRWhDLEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxFQUFFLENBQUM7UUFDN0IsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkMsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUU5RCxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUN4QixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7WUFDbEIsR0FBRyxFQUFFLEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU07WUFDbEMsSUFBSSxFQUFFLFdBQVc7WUFDakIsS0FBSyxFQUFFLFNBQVM7U0FDaEIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsR0FBVztJQUNqQyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUM7SUFDbkIsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDO0lBQ25CLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQztJQUVqQixNQUFNLEtBQUssR0FBa0IsRUFBRSxDQUFDO0lBRWhDLEtBQUssTUFBTSxLQUFLLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7UUFDMUQsbUJBQW1CO1FBQ25CLE1BQU0sVUFBVSxHQUFHLG1CQUFtQixDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUUsSUFBSSxVQUFVLEtBQUssQ0FBQyxDQUFDO1lBQUUsU0FBUztRQUVoQyxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ2pDLG1CQUFtQjtRQUNuQixNQUFNLFlBQVksR0FBRyxZQUFZLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFFeEQsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQzVDLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBRTdDLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYTtRQUN2QixtQkFBbUI7UUFDbkIsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRTtRQUNwRCxrQkFBa0I7UUFDbEIsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxZQUFZLEdBQUcsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTtRQUMvRSxrQkFBa0I7UUFDbEIsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxVQUFVLEdBQUcsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxDQUM1RSxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsR0FBVztJQUM5QixNQUFNLEtBQUssR0FBa0IsRUFBRSxDQUFDO0lBRWhDLEtBQUssTUFBTSxLQUFLLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQzlDLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDakMsbUJBQW1CO1FBQ25CLE1BQU0sWUFBWSxHQUFHLFlBQVksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUV4RCxtQkFBbUI7UUFDbkIsTUFBTSxVQUFVLEdBQUcsbUJBQW1CLENBQUMsR0FBRyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNFLElBQUksVUFBVSxLQUFLLENBQUMsQ0FBQztZQUFFLFNBQVM7UUFFaEMsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhO1FBQ3ZCLGNBQWM7UUFDZCxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFO1FBQ3BELGtCQUFrQjtRQUNsQixFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLFlBQVksR0FBRyxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO1FBQzlFLGtCQUFrQjtRQUNsQixFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLFVBQVUsR0FBRyxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLENBQzFFLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxHQUFXO0lBQ25DLE1BQU0sWUFBWSxHQUFrQixFQUFFLENBQUM7SUFFdkMsS0FBSyxNQUFNLEtBQUssSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLDhCQUE4QixDQUFDLEVBQUUsQ0FBQztRQUNsRSxnREFBZ0Q7UUFDaEQsTUFBTSxZQUFZLEdBQUcsbUJBQW1CLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1RSxJQUFJLFlBQVksS0FBSyxDQUFDLENBQUM7WUFBRSxTQUFTO1FBRWxDLDBFQUEwRTtRQUMxRSw2Q0FBNkM7UUFDN0MsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHO1lBQUUsU0FBUztRQUVuRCxrREFBa0Q7UUFDbEQsTUFBTSxjQUFjLEdBQUcsbUJBQW1CLENBQUMsR0FBRyxFQUFFLFlBQVksR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRixJQUFJLGNBQWMsS0FBSyxDQUFDLENBQUM7WUFBRSxTQUFTO1FBRXBDLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDakMsTUFBTSxjQUFjLEdBQUcsWUFBWSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQzFELE1BQU0sZ0JBQWdCLEdBQUcsWUFBWSxHQUFHLENBQUMsQ0FBQztRQUUxQyxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWE7UUFDOUIsZUFBZTtRQUNmLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUU7UUFDdEQsb0NBQW9DO1FBQ3BDLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxHQUFHLEVBQUUsY0FBYyxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsRUFDbEYsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxZQUFZLEdBQUcsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBQztRQUM3RSxjQUFjO1FBQ2QsRUFBRSxLQUFLLEVBQUUsWUFBWSxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsWUFBWSxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7UUFDbEYsc0NBQXNDO1FBQ3RDLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsR0FBRyxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLEVBQ3RGLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxHQUFHLEVBQUUsY0FBYyxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsQ0FDbEYsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELE9BQU8sWUFBWSxDQUFDO0FBQ3JCLENBQUM7QUFFRCxTQUFTLG1CQUFtQixDQUFDLEdBQVc7SUFDdkMsTUFBTSxRQUFRLEdBQUcsK0JBQStCLENBQUM7SUFDakQsTUFBTSxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDekMsTUFBTSxLQUFLLEdBQWtCLEVBQUUsQ0FBQztJQUVoQyxLQUFLLE1BQU0sS0FBSyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzdCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2QixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBTSxDQUFDO1FBQzVCLE1BQU0sSUFBSSxHQUFHLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBRXRDLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ3hCLEtBQUssRUFBRSxNQUFNO1lBQ2IsR0FBRyxFQUFFLElBQUk7WUFDVCxJQUFJLEVBQUUsS0FBSztZQUNYLEtBQUssRUFBRSxtQ0FBbUM7U0FDMUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsTUFBTSxVQUFVLE9BQU8sQ0FBQyxJQUFnQjtJQUN2QyxNQUFNLEtBQUssR0FBa0IsRUFBRSxDQUFDO0lBRWhDLEtBQUssTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFL0MsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDOUIsSUFBSTtZQUNKLEVBQUU7WUFDRixLQUFLLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDZixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO2dCQUN2QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUVuQixJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2xFLE9BQU87Z0JBQ1IsQ0FBQztnQkFFRCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNqRCxJQUFJLENBQUMsTUFBTTtvQkFBRSxPQUFPO2dCQUdwQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBR2pFLE1BQU0sV0FBVyxHQUFHLEVBQUMsR0FBRyxLQUFLLEVBQUUsR0FBRyxXQUFXLEVBQUMsQ0FBQztnQkFFL0MsTUFBTSxVQUFVLEdBQUc7b0JBQ2xCLEdBQUcsY0FBYyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLFNBQVMsQ0FBQztvQkFDNUMsR0FBRyxjQUFjLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsT0FBTyxDQUFDO29CQUN4QyxHQUFHLGNBQWMsQ0FBQyxHQUFHLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUM7b0JBQ2pELEdBQUcsY0FBYyxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDO29CQUNqRSxHQUFHLGFBQWEsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQztvQkFDeEMsR0FBRyxhQUFhLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLENBQUM7b0JBQ3pDLEdBQUcsZUFBZSxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDO29CQUN4QyxHQUFHLGVBQWUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQztvQkFDeEMsR0FBRyxlQUFlLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUM7b0JBQ3pDLEdBQUcsZUFBZSxDQUFDLEdBQUcsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDO29CQUM3QyxHQUFHLGVBQWUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQztvQkFDeEMsR0FBRyxlQUFlLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUM7b0JBQzFDLEdBQUcsZUFBZSxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDO29CQUN4QyxHQUFHLGNBQWMsQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsWUFBWSxDQUFDO29CQUMxRCxHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUUsY0FBYyxFQUFFLEdBQUcsRUFBRSxVQUFVLENBQUM7b0JBQ3BELEdBQUcsMkJBQTJCLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQztvQkFDMUMsR0FBRyw2QkFBNkIsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDO29CQUM3QyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUM7b0JBQ25CLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQztvQkFDckIsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDO29CQUNsQixHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUM7b0JBQ3ZCLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQztvQkFDbkMsR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLENBQUM7aUJBQzNCLENBQUM7Z0JBRUYsc0VBQXNFO2dCQUN0RSxzQ0FBc0M7Z0JBQ3RDLEtBQUssTUFBTSxJQUFJLElBQUksVUFBVSxFQUFFLENBQUM7b0JBQy9CLEtBQUssTUFBTSxPQUFPLElBQUksSUFBSSxFQUFFLENBQUM7d0JBQzVCLE9BQU8sQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQzt3QkFDOUIsT0FBTyxDQUFDLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDO29CQUM3QixDQUFDO2dCQUNGLENBQUM7Z0JBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDO1lBQzNCLENBQUM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29uY2VhbCBmdW5jdGlvbnNcblxuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5pbXBvcnQgeyBnZXRFcXVhdGlvbkJvdW5kcyB9IGZyb20gXCJzcmMvdXRpbHMvY29udGV4dFwiO1xuaW1wb3J0IHsgZmluZE1hdGNoaW5nQnJhY2tldCB9IGZyb20gXCJzcmMvdXRpbHMvZWRpdG9yX3V0aWxzXCI7XG5pbXBvcnQgeyBDb25jZWFsU3BlYywgbWtDb25jZWFsU3BlYyB9IGZyb20gXCIuL2NvbmNlYWxcIjtcbmltcG9ydCB7IGdyZWVrLCBjbWRfc3ltYm9scywgbWFwX3N1cGVyLCBtYXBfc3ViLCBmcmFjdGlvbnMsIGJyYWNrZXRzLCBtYXRoc2NyY2FsLCBtYXRoYmIsIG9wZXJhdG9ycyB9IGZyb20gXCIuL2NvbmNlYWxfbWFwc1wiO1xuXG5cbmZ1bmN0aW9uIGVzY2FwZVJlZ2V4KHJlZ2V4OiBzdHJpbmcpIHtcblx0Y29uc3QgZXNjYXBlQ2hhcnMgPSBbXCJcXFxcXCIsIFwiKFwiLCBcIilcIiwgXCIrXCIsIFwiLVwiLCBcIltcIiwgXCJdXCIsIFwie1wiLCBcIn1cIl07XG5cblx0Zm9yIChjb25zdCBlc2NhcGVDaGFyIG9mIGVzY2FwZUNoYXJzKSB7XG5cdFx0cmVnZXggPSByZWdleC5yZXBsYWNlQWxsKGVzY2FwZUNoYXIsIFwiXFxcXFwiICsgZXNjYXBlQ2hhcik7XG5cdH1cblxuXHRyZXR1cm4gcmVnZXg7XG59XG5cbi8qKlxuICogZ2V0cyB0aGUgdXBkYXRlZCBlbmQgaW5kZXggdG8gaW5jbHVkZSBcIlxcXFxsaW1pdHNcIiBpbiB0aGUgY29uY2VhbGVkIHRleHQgb2Ygc29tZSBjb25jZWFsIG1hdGNoLFxuICogaWYgc2FpZCBtYXRjaCBpcyBkaXJlY3RseSBmb2xsb3dlZCBieSBcIlxcXFxsaW1pdHNcIlxuICpcbiAqIEBwYXJhbSBlcW4gc291cmNlIHRleHRcbiAqIEBwYXJhbSBlbmQgaW5kZXggb2YgZXFuIGNvcnJlc3BvbmRpbmcgdG8gdGhlIGVuZCBvZiBhIG1hdGNoIHRvIGNvbmNlYWxcbiAqIEByZXR1cm5zIHRoZSB1cGRhdGVkIGVuZCBpbmRleCB0byBjb25jZWFsXG4gKi9cbmZ1bmN0aW9uIGdldEVuZEluY2x1ZGluZ0xpbWl0cyhlcW46IHN0cmluZywgZW5kOiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCBMSU1JVFMgPSBcIlxcXFxsaW1pdHNcIjtcblx0aWYgKGVxbi5zdWJzdHJpbmcoZW5kLCBlbmQgKyBMSU1JVFMubGVuZ3RoKSA9PT0gTElNSVRTKSB7XG5cdFx0cmV0dXJuIGVuZCArIExJTUlUUy5sZW5ndGg7XG5cdH1cblx0cmV0dXJuIGVuZDtcbn1cblxuZnVuY3Rpb24gY29uY2VhbFN5bWJvbHMoZXFuOiBzdHJpbmcsIHByZWZpeDogc3RyaW5nLCBzdWZmaXg6IHN0cmluZywgc3ltYm9sTWFwOiB7W2tleTogc3RyaW5nXTogc3RyaW5nfSwgY2xhc3NOYW1lPzogc3RyaW5nLCBhbGxvd1N1Y2NlZWRpbmdMZXR0ZXJzID0gdHJ1ZSk6IENvbmNlYWxTcGVjW10ge1xuXHRjb25zdCBzeW1ib2xOYW1lcyA9IE9iamVjdC5rZXlzKHN5bWJvbE1hcCk7XG5cblx0Y29uc3QgcmVnZXhTdHIgPSBwcmVmaXggKyBcIihcIiArIGVzY2FwZVJlZ2V4KHN5bWJvbE5hbWVzLmpvaW4oXCJ8XCIpKSArIFwiKVwiICsgc3VmZml4O1xuXHRjb25zdCBzeW1ib2xSZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcblxuXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHN5bWJvbFJlZ2V4KV07XG5cblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRjb25zdCBzeW1ib2wgPSBtYXRjaFsxXTtcblxuXHRcdGlmICghYWxsb3dTdWNjZWVkaW5nTGV0dGVycykge1xuXHRcdFx0Ly8gSWYgdGhlIHN5bWJvbCBtYXRjaCBpcyBzdWNjZWVkZWQgYnkgYSBsZXR0ZXIgKGUuZy4gXCJwbVwiIGluIFwicG1hdHJpeFwiIGlzIHN1Y2NlZWRlZCBieSBcImFcIiksIGRvbid0IGNvbmNlYWxcblxuXHRcdFx0Y29uc3QgZW5kID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG5cdFx0XHRpZiAoZXFuLmNoYXJBdChlbmQpLm1hdGNoKC9bYS16QS1aXS8pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGVuZCA9IGdldEVuZEluY2x1ZGluZ0xpbWl0cyhlcW4sIG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoKTtcblxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XG5cdFx0XHRzdGFydDogbWF0Y2guaW5kZXgsXG5cdFx0XHRlbmQ6IGVuZCxcblx0XHRcdHRleHQ6IHN5bWJvbE1hcFtzeW1ib2xdLFxuXHRcdFx0Y2xhc3M6IGNsYXNzTmFtZSxcblx0XHR9KSk7XG5cdH1cblxuXHRyZXR1cm4gc3BlY3M7XG59XG5cbmZ1bmN0aW9uIGNvbmNlYWxNb2RpZmllcihlcW46IHN0cmluZywgbW9kaWZpZXI6IHN0cmluZywgY29tYmluaW5nQ2hhcmFjdGVyOiBzdHJpbmcpOiBDb25jZWFsU3BlY1tdIHtcblxuXHRjb25zdCByZWdleFN0ciA9IChcIlxcXFxcXFxcXCIgKyBtb2RpZmllciArIFwieyhbQS1aYS16XSl9XCIpO1xuXHRjb25zdCBzeW1ib2xSZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcblxuXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHN5bWJvbFJlZ2V4KV07XG5cblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRjb25zdCBzeW1ib2wgPSBtYXRjaFsxXTtcblxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XG5cdFx0XHRzdGFydDogbWF0Y2guaW5kZXgsXG5cdFx0XHRlbmQ6IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoLFxuXHRcdFx0dGV4dDogc3ltYm9sICsgY29tYmluaW5nQ2hhcmFjdGVyLFxuXHRcdFx0Y2xhc3M6IFwibGF0ZXgtc3VpdGUtdW5pY29kZVwiLFxuXHRcdH0pKTtcblx0fVxuXG5cdHJldHVybiBzcGVjcztcbn1cblxuZnVuY3Rpb24gY29uY2VhbFN1cFN1YihlcW46IHN0cmluZywgc3VwZXJzY3JpcHQ6IGJvb2xlYW4sIHN5bWJvbE1hcDoge1trZXk6IHN0cmluZ106c3RyaW5nfSk6IENvbmNlYWxTcGVjW10ge1xuXG5cdGNvbnN0IHByZWZpeCA9IHN1cGVyc2NyaXB0ID8gXCJcXFxcXlwiIDogXCJfXCI7XG5cdGNvbnN0IHJlZ2V4U3RyID0gcHJlZml4ICsgXCJ7KFtBLVphLXowLTlcXFxcKClcXFxcW1xcXFxdLystPTw+Jzo7XFxcXFxcXFwgKl0rKX1cIjtcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XG5cblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcblxuXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XG5cblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG5cblx0XHRjb25zdCBleHBvbmVudCA9IG1hdGNoWzFdO1xuXHRcdGNvbnN0IGVsZW1lbnRUeXBlID0gc3VwZXJzY3JpcHQgPyBcInN1cFwiIDogXCJzdWJcIjtcblxuXG5cdFx0Ly8gQ29uY2VhbCBzdXBlci9zdWJzY3JpcHQgc3ltYm9scyBhcyB3ZWxsXG5cdFx0Y29uc3Qgc3ltYm9sTmFtZXMgPSBPYmplY3Qua2V5cyhzeW1ib2xNYXApO1xuXG5cdFx0Y29uc3Qgc3ltYm9sUmVnZXhTdHIgPSBcIlxcXFxcXFxcKFwiICsgZXNjYXBlUmVnZXgoc3ltYm9sTmFtZXMuam9pbihcInxcIikpICsgXCIpXCI7XG5cdFx0Y29uc3Qgc3ltYm9sUmVnZXggPSBuZXcgUmVnRXhwKHN5bWJvbFJlZ2V4U3RyLCBcImdcIik7XG5cblx0XHRjb25zdCByZXBsYWNlbWVudCA9IGV4cG9uZW50LnJlcGxhY2Uoc3ltYm9sUmVnZXgsIChhLCBiKSA9PiB7XG5cdFx0XHRyZXR1cm4gc3ltYm9sTWFwW2JdO1xuXHRcdH0pO1xuXG5cblx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xuXHRcdFx0c3RhcnQ6IG1hdGNoLmluZGV4LFxuXHRcdFx0ZW5kOiBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCxcblx0XHRcdHRleHQ6IHJlcGxhY2VtZW50LFxuXHRcdFx0Y2xhc3M6IFwiY20tbnVtYmVyXCIsXG5cdFx0XHRlbGVtZW50VHlwZTogZWxlbWVudFR5cGUsXG5cdFx0fSkpO1xuXHR9XG5cblx0cmV0dXJuIHNwZWNzO1xufVxuXG5mdW5jdGlvbiBjb25jZWFsTW9kaWZpZWRfQV90b19aXzBfdG9fOShlcW46IHN0cmluZywgbWF0aEJCc3ltYm9sTWFwOiB7W2tleTogc3RyaW5nXTpzdHJpbmd9KTogQ29uY2VhbFNwZWNbXSB7XG5cblx0Y29uc3QgcmVnZXhTdHIgPSBcIlxcXFxcXFxcKG1hdGhiZnxib2xkc3ltYm9sfHVuZGVybGluZXxtYXRocm18dGV4dHxtYXRoYmIpeyhbQS1aYS16MC05IF0rKX1cIjtcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XG5cblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcblxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuXHRcdGNvbnN0IHR5cGUgPSBtYXRjaFsxXTtcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzJdO1xuXG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXRjaC5pbmRleDtcblx0XHRjb25zdCBlbmQgPSBzdGFydCArIG1hdGNoWzBdLmxlbmd0aDtcblxuXHRcdGlmICh0eXBlID09PSBcIm1hdGhiZlwiIHx8IHR5cGUgPT09IFwiYm9sZHN5bWJvbFwiKSB7XG5cdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xuXHRcdFx0XHRzdGFydDogc3RhcnQsXG5cdFx0XHRcdGVuZDogZW5kLFxuXHRcdFx0XHR0ZXh0OiB2YWx1ZSxcblx0XHRcdFx0Y2xhc3M6IFwiY20tY29uY2VhbGVkLWJvbGRcIixcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZSA9PT0gXCJ1bmRlcmxpbmVcIikge1xuXHRcdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcblx0XHRcdFx0c3RhcnQ6IHN0YXJ0LFxuXHRcdFx0XHRlbmQ6IGVuZCxcblx0XHRcdFx0dGV4dDogdmFsdWUsXG5cdFx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC11bmRlcmxpbmVcIixcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZSA9PT0gXCJtYXRocm1cIikge1xuXHRcdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcblx0XHRcdFx0c3RhcnQ6IHN0YXJ0LFxuXHRcdFx0XHRlbmQ6IGVuZCxcblx0XHRcdFx0dGV4dDogdmFsdWUsXG5cdFx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC1tYXRocm1cIixcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZSA9PT0gXCJ0ZXh0XCIpIHtcblx0XHRcdC8vIENvbmNlYWwgX1xcdGV4dHt9XG5cdFx0XHRpZiAoc3RhcnQgPiAwICYmIGVxbi5jaGFyQXQoc3RhcnQgLSAxKSA9PT0gXCJfXCIpIHtcblx0XHRcdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcblx0XHRcdFx0XHRzdGFydDogc3RhcnQgLSAxLFxuXHRcdFx0XHRcdGVuZDogZW5kLFxuXHRcdFx0XHRcdHRleHQ6IHZhbHVlLFxuXHRcdFx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC1tYXRocm1cIixcblx0XHRcdFx0XHRlbGVtZW50VHlwZTogXCJzdWJcIixcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIGlmICh0eXBlID09PSBcIm1hdGhiYlwiKSB7XG5cdFx0XHRjb25zdCBsZXR0ZXJzID0gQXJyYXkuZnJvbSh2YWx1ZSk7XG5cdFx0XHRjb25zdCByZXBsYWNlbWVudCA9IGxldHRlcnMubWFwKGVsID0+IG1hdGhCQnN5bWJvbE1hcFtlbF0pLmpvaW4oXCJcIik7XG5cdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe3N0YXJ0OiBzdGFydCwgZW5kOiBlbmQsIHRleHQ6IHJlcGxhY2VtZW50fSkpO1xuXHRcdH1cblxuXHR9XG5cblx0cmV0dXJuIHNwZWNzO1xufVxuXG5mdW5jdGlvbiBjb25jZWFsTW9kaWZpZWRHcmVla0xldHRlcnMoZXFuOiBzdHJpbmcsIGdyZWVrU3ltYm9sTWFwOiB7W2tleTogc3RyaW5nXTpzdHJpbmd9KTogQ29uY2VhbFNwZWNbXSB7XG5cblx0Y29uc3QgZ3JlZWtTeW1ib2xOYW1lcyA9IE9iamVjdC5rZXlzKGdyZWVrU3ltYm9sTWFwKTtcblx0Y29uc3QgcmVnZXhTdHIgPSBcIlxcXFxcXFxcKHVuZGVybGluZXxib2xkc3ltYm9sKXtcXFxcXFxcXChcIiArIGVzY2FwZVJlZ2V4KGdyZWVrU3ltYm9sTmFtZXMuam9pbihcInxcIikpICArIFwiKX1cIjtcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U3RyLCBcImdcIik7XG5cblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcblxuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuXHRcdGNvbnN0IHR5cGUgPSBtYXRjaFsxXTtcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzJdO1xuXG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXRjaC5pbmRleDtcblx0XHRjb25zdCBlbmQgPSBzdGFydCArIG1hdGNoWzBdLmxlbmd0aDtcblxuXHRcdGlmICh0eXBlID09PSBcInVuZGVybGluZVwiKSB7XG5cdFx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoe1xuXHRcdFx0XHRzdGFydDogc3RhcnQsXG5cdFx0XHRcdGVuZDogZW5kLFxuXHRcdFx0XHR0ZXh0OiBncmVla1N5bWJvbE1hcFt2YWx1ZV0sXG5cdFx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC11bmRlcmxpbmVcIixcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZSA9PT0gXCJib2xkc3ltYm9sXCIpIHtcblx0XHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XG5cdFx0XHRcdHN0YXJ0OiBzdGFydCxcblx0XHRcdFx0ZW5kOiBlbmQsXG5cdFx0XHRcdHRleHQ6IGdyZWVrU3ltYm9sTWFwW3ZhbHVlXSxcblx0XHRcdFx0Y2xhc3M6IFwiY20tY29uY2VhbGVkLWJvbGRcIixcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gc3BlY3M7XG59XG5cbmZ1bmN0aW9uIGNvbmNlYWxUZXh0KGVxbjogc3RyaW5nKTogQ29uY2VhbFNwZWNbXSB7XG5cblx0Y29uc3QgcmVnZXhTdHIgPSBcIlxcXFxcXFxcdGV4dHsoW0EtWmEtejAtOS0uIT8oKSBdKyl9XCI7XG5cdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFN0ciwgXCJnXCIpO1xuXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHJlZ2V4KV07XG5cblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzFdO1xuXG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXRjaC5pbmRleDtcblx0XHRjb25zdCBlbmQgPSBzdGFydCArIG1hdGNoWzBdLmxlbmd0aDtcblxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XG5cdFx0XHRzdGFydDogc3RhcnQsXG5cdFx0XHRlbmQ6IGVuZCxcblx0XHRcdHRleHQ6IHZhbHVlLFxuXHRcdFx0Y2xhc3M6IFwiY20tY29uY2VhbGVkLW1hdGhybSBjbS12YXJpYWJsZS0yXCIsXG5cdFx0fSkpO1xuXG5cdH1cblxuXHRyZXR1cm4gc3BlY3M7XG59XG5cbmZ1bmN0aW9uIGNvbmNlYWxPcGVyYXRvcnMoZXFuOiBzdHJpbmcsIHN5bWJvbHM6IHN0cmluZ1tdKTogQ29uY2VhbFNwZWNbXSB7XG5cblx0Y29uc3QgcmVnZXhTdHIgPSBcIihcXFxcXFxcXChcIiArIHN5bWJvbHMuam9pbihcInxcIikgKyBcIikpKFteYS16QS1aXXwkKVwiO1xuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcblxuXHRjb25zdCBtYXRjaGVzID0gWy4uLmVxbi5tYXRjaEFsbChyZWdleCldO1xuXG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XG5cblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG5cdFx0Y29uc3QgdmFsdWUgPSBtYXRjaFsyXTtcblxuXHRcdGNvbnN0IHN0YXJ0ID0gbWF0Y2guaW5kZXg7XG5cdFx0Y29uc3QgZW5kID0gZ2V0RW5kSW5jbHVkaW5nTGltaXRzKGVxbiwgc3RhcnQgKyBtYXRjaFsxXS5sZW5ndGgpO1xuXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcblx0XHRcdHN0YXJ0OiBzdGFydCxcblx0XHRcdGVuZDogZW5kLFxuXHRcdFx0dGV4dDogdmFsdWUsXG5cdFx0XHRjbGFzczogXCJjbS1jb25jZWFsZWQtbWF0aHJtIGNtLXZhcmlhYmxlLTJcIixcblx0XHR9KSk7XG5cdH1cblxuXHRyZXR1cm4gc3BlY3M7XG59XG5cbmZ1bmN0aW9uIGNvbmNlYWxBdG9aKGVxbjogc3RyaW5nLCBwcmVmaXg6IHN0cmluZywgc3VmZml4OiBzdHJpbmcsIHN5bWJvbE1hcDoge1trZXk6IHN0cmluZ106IHN0cmluZ30sIGNsYXNzTmFtZT86IHN0cmluZyk6IENvbmNlYWxTcGVjW10ge1xuXG5cdGNvbnN0IHJlZ2V4U3RyID0gcHJlZml4ICsgXCIoW0EtWl0rKVwiICsgc3VmZml4O1xuXHRjb25zdCBzeW1ib2xSZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcblxuXG5cdGNvbnN0IG1hdGNoZXMgPSBbLi4uZXFuLm1hdGNoQWxsKHN5bWJvbFJlZ2V4KV07XG5cblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRjb25zdCBzeW1ib2wgPSBtYXRjaFsxXTtcblx0XHRjb25zdCBsZXR0ZXJzID0gQXJyYXkuZnJvbShzeW1ib2wpO1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gbGV0dGVycy5tYXAoZWwgPT4gc3ltYm9sTWFwW2VsXSkuam9pbihcIlwiKTtcblxuXHRcdHNwZWNzLnB1c2gobWtDb25jZWFsU3BlYyh7XG5cdFx0XHRzdGFydDogbWF0Y2guaW5kZXgsXG5cdFx0XHRlbmQ6IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoLFxuXHRcdFx0dGV4dDogcmVwbGFjZW1lbnQsXG5cdFx0XHRjbGFzczogY2xhc3NOYW1lLFxuXHRcdH0pKTtcblx0fVxuXG5cdHJldHVybiBzcGVjcztcbn1cblxuZnVuY3Rpb24gY29uY2VhbEJyYUtldChlcW46IHN0cmluZyk6IENvbmNlYWxTcGVjW10ge1xuXHRjb25zdCBsYW5nbGUgPSBcIuOAiFwiO1xuXHRjb25zdCByYW5nbGUgPSBcIuOAiVwiO1xuXHRjb25zdCB2ZXJ0ID0gXCJ8XCI7XG5cblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIGVxbi5tYXRjaEFsbCgvXFxcXChicmFrZXR8YnJhfGtldCl7L2cpKSB7XG5cdFx0Ly8gaW5kZXggb2YgdGhlIFwifVwiXG5cdFx0Y29uc3QgY29udGVudEVuZCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQoZXFuLCBtYXRjaC5pbmRleCwgXCJ7XCIsIFwifVwiLCBmYWxzZSk7XG5cdFx0aWYgKGNvbnRlbnRFbmQgPT09IC0xKSBjb250aW51ZTtcblxuXHRcdGNvbnN0IGNvbW1hbmRTdGFydCA9IG1hdGNoLmluZGV4O1xuXHRcdC8vIGluZGV4IG9mIHRoZSBcIntcIlxuXHRcdGNvbnN0IGNvbnRlbnRTdGFydCA9IGNvbW1hbmRTdGFydCArIG1hdGNoWzBdLmxlbmd0aCAtIDE7XG5cblx0XHRjb25zdCB0eXBlID0gbWF0Y2hbMV07XG5cdFx0Y29uc3QgbGVmdCA9IHR5cGUgPT09IFwia2V0XCIgPyB2ZXJ0IDogbGFuZ2xlO1xuXHRcdGNvbnN0IHJpZ2h0ID0gdHlwZSA9PT0gXCJicmFcIiA/IHZlcnQgOiByYW5nbGU7XG5cblx0XHRzcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoXG5cdFx0XHQvLyBIaWRlIHRoZSBjb21tYW5kXG5cdFx0XHR7IHN0YXJ0OiBjb21tYW5kU3RhcnQsIGVuZDogY29udGVudFN0YXJ0LCB0ZXh0OiBcIlwiIH0sXG5cdFx0XHQvLyBSZXBsYWNlIHRoZSBcIntcIlxuXHRcdFx0eyBzdGFydDogY29udGVudFN0YXJ0LCBlbmQ6IGNvbnRlbnRTdGFydCArIDEsIHRleHQ6IGxlZnQsIGNsYXNzOiBcImNtLWJyYWNrZXRcIiB9LFxuXHRcdFx0Ly8gUmVwbGFjZSB0aGUgXCJ9XCJcblx0XHRcdHsgc3RhcnQ6IGNvbnRlbnRFbmQsIGVuZDogY29udGVudEVuZCArIDEsIHRleHQ6IHJpZ2h0LCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcblx0XHQpKTtcblx0fVxuXG5cdHJldHVybiBzcGVjcztcbn1cblxuZnVuY3Rpb24gY29uY2VhbFNldChlcW46IHN0cmluZyk6IENvbmNlYWxTcGVjW10ge1xuXHRjb25zdCBzcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgZXFuLm1hdGNoQWxsKC9cXFxcc2V0XFx7L2cpKSB7XG5cdFx0Y29uc3QgY29tbWFuZFN0YXJ0ID0gbWF0Y2guaW5kZXg7XG5cdFx0Ly8gaW5kZXggb2YgdGhlIFwie1wiXG5cdFx0Y29uc3QgY29udGVudFN0YXJ0ID0gY29tbWFuZFN0YXJ0ICsgbWF0Y2hbMF0ubGVuZ3RoIC0gMTtcblxuXHRcdC8vIGluZGV4IG9mIHRoZSBcIn1cIlxuXHRcdGNvbnN0IGNvbnRlbnRFbmQgPSBmaW5kTWF0Y2hpbmdCcmFja2V0KGVxbiwgY29tbWFuZFN0YXJ0LCBcIntcIiwgXCJ9XCIsIGZhbHNlKTtcblx0XHRpZiAoY29udGVudEVuZCA9PT0gLTEpIGNvbnRpbnVlO1xuXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKFxuXHRcdFx0Ly8gSGlkZSBcIlxcc2V0XCJcblx0XHRcdHsgc3RhcnQ6IGNvbW1hbmRTdGFydCwgZW5kOiBjb250ZW50U3RhcnQsIHRleHQ6IFwiXCIgfSxcblx0XHRcdC8vIFJlcGxhY2UgdGhlIFwie1wiXG5cdFx0XHR7IHN0YXJ0OiBjb250ZW50U3RhcnQsIGVuZDogY29udGVudFN0YXJ0ICsgMSwgdGV4dDogXCJ7XCIsIGNsYXNzOiBcImNtLWJyYWNrZXRcIiB9LFxuXHRcdFx0Ly8gUmVwbGFjZSB0aGUgXCJ9XCJcblx0XHRcdHsgc3RhcnQ6IGNvbnRlbnRFbmQsIGVuZDogY29udGVudEVuZCArIDEsIHRleHQ6IFwifVwiLCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcblx0XHQpKTtcblx0fVxuXG5cdHJldHVybiBzcGVjcztcbn1cblxuZnVuY3Rpb24gY29uY2VhbEZyYWN0aW9uKGVxbjogc3RyaW5nKTogQ29uY2VhbFNwZWNbXSB7XG5cdGNvbnN0IGNvbmNlYWxTcGVjczogQ29uY2VhbFNwZWNbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgZXFuLm1hdGNoQWxsKC9cXFxcKGZyYWN8ZGZyYWN8dGZyYWN8Z2ZyYWMpey9nKSkge1xuXHRcdC8vIGluZGV4IG9mIHRoZSBjbG9zaW5nIGJyYWNrZXQgb2YgdGhlIG51bWVyYXRvclxuXHRcdGNvbnN0IG51bWVyYXRvckVuZCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQoZXFuLCBtYXRjaC5pbmRleCwgXCJ7XCIsIFwifVwiLCBmYWxzZSk7XG5cdFx0aWYgKG51bWVyYXRvckVuZCA9PT0gLTEpIGNvbnRpbnVlO1xuXG5cdFx0Ly8gRXhwZWN0IHRoZXJlIGFyZSBubyBzcGFjZXMgYmV0d2VlbiB0aGUgY2xvc2luZyBicmFja2V0IG9mIHRoZSBudW1lcmF0b3Jcblx0XHQvLyBhbmQgdGhlIG9wZW5pbmcgYnJhY2tldCBvZiB0aGUgZGVub21pbmF0b3Jcblx0XHRpZiAoZXFuLmNoYXJBdChudW1lcmF0b3JFbmQgKyAxKSAhPT0gXCJ7XCIpIGNvbnRpbnVlO1xuXG5cdFx0Ly8gaW5kZXggb2YgdGhlIGNsb3NpbmcgYnJhY2tldCBvZiB0aGUgZGVub21pbmF0b3Jcblx0XHRjb25zdCBkZW5vbWluYXRvckVuZCA9IGZpbmRNYXRjaGluZ0JyYWNrZXQoZXFuLCBudW1lcmF0b3JFbmQgKyAxLCBcIntcIiwgXCJ9XCIsIGZhbHNlKTtcblx0XHRpZiAoZGVub21pbmF0b3JFbmQgPT09IC0xKSBjb250aW51ZTtcblxuXHRcdGNvbnN0IGNvbW1hbmRTdGFydCA9IG1hdGNoLmluZGV4O1xuXHRcdGNvbnN0IG51bWVyYXRvclN0YXJ0ID0gY29tbWFuZFN0YXJ0ICsgbWF0Y2hbMF0ubGVuZ3RoIC0gMTtcblx0XHRjb25zdCBkZW5vbWluYXRvclN0YXJ0ID0gbnVtZXJhdG9yRW5kICsgMTtcblxuXHRcdGNvbmNlYWxTcGVjcy5wdXNoKG1rQ29uY2VhbFNwZWMoXG5cdFx0XHQvLyBIaWRlIFwiXFxmcmFjXCJcblx0XHRcdHsgc3RhcnQ6IGNvbW1hbmRTdGFydCwgZW5kOiBudW1lcmF0b3JTdGFydCwgdGV4dDogXCJcIiB9LFxuXHRcdFx0Ly8gUmVwbGFjZSBicmFja2V0cyBvZiB0aGUgbnVtZXJhdG9yXG5cdFx0XHR7IHN0YXJ0OiBudW1lcmF0b3JTdGFydCwgZW5kOiBudW1lcmF0b3JTdGFydCArIDEsIHRleHQ6IFwiKFwiLCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcblx0XHRcdHsgc3RhcnQ6IG51bWVyYXRvckVuZCwgZW5kOiBudW1lcmF0b3JFbmQgKyAxLCB0ZXh0OiBcIilcIiwgY2xhc3M6IFwiY20tYnJhY2tldFwifSxcblx0XHRcdC8vIEFkZCBhIHNsYXNoXG5cdFx0XHR7IHN0YXJ0OiBudW1lcmF0b3JFbmQgKyAxLCBlbmQ6IG51bWVyYXRvckVuZCArIDEsIHRleHQ6IFwiL1wiLCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcblx0XHRcdC8vIFJlcGxhY2UgYnJhY2tldHMgb2YgdGhlIGRlbm9taW5hdG9yXG5cdFx0XHR7IHN0YXJ0OiBkZW5vbWluYXRvclN0YXJ0LCBlbmQ6IGRlbm9taW5hdG9yU3RhcnQgKyAxLCB0ZXh0OiBcIihcIiwgY2xhc3M6IFwiY20tYnJhY2tldFwiIH0sXG5cdFx0XHR7IHN0YXJ0OiBkZW5vbWluYXRvckVuZCwgZW5kOiBkZW5vbWluYXRvckVuZCArIDEsIHRleHQ6IFwiKVwiLCBjbGFzczogXCJjbS1icmFja2V0XCIgfSxcblx0XHQpKTtcblx0fVxuXG5cdHJldHVybiBjb25jZWFsU3BlY3M7XG59XG5cbmZ1bmN0aW9uIGNvbmNlYWxPcGVyYXRvcm5hbWUoZXFuOiBzdHJpbmcpOiBDb25jZWFsU3BlY1tdIHtcblx0Y29uc3QgcmVnZXhTdHIgPSBcIlxcXFxcXFxcb3BlcmF0b3JuYW1leyhbQS1aYS16XSspfVwiO1xuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocmVnZXhTdHIsIFwiZ1wiKTtcblx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5lcW4ubWF0Y2hBbGwocmVnZXgpXTtcblx0Y29uc3Qgc3BlY3M6IENvbmNlYWxTcGVjW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRjb25zdCB2YWx1ZSA9IG1hdGNoWzFdO1xuXHRcdGNvbnN0IHN0YXJ0MiA9IG1hdGNoLmluZGV4ITtcblx0XHRjb25zdCBlbmQyID0gc3RhcnQyICsgbWF0Y2hbMF0ubGVuZ3RoO1xuXG5cdFx0c3BlY3MucHVzaChta0NvbmNlYWxTcGVjKHtcblx0XHRcdHN0YXJ0OiBzdGFydDIsXG5cdFx0XHRlbmQ6IGVuZDIsXG5cdFx0XHR0ZXh0OiB2YWx1ZSxcblx0XHRcdGNsYXNzOiBcImNtLWNvbmNlYWxlZC1tYXRocm0gY20tdmFyaWFibGUtMlwiXG5cdFx0fSkpO1xuXHR9XG5cblx0cmV0dXJuIHNwZWNzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uY2VhbCh2aWV3OiBFZGl0b3JWaWV3KTogQ29uY2VhbFNwZWNbXSB7XG5cdGNvbnN0IHNwZWNzOiBDb25jZWFsU3BlY1tdID0gW107XG5cblx0Zm9yIChjb25zdCB7IGZyb20sIHRvIH0gb2Ygdmlldy52aXNpYmxlUmFuZ2VzKSB7XG5cblx0XHRzeW50YXhUcmVlKHZpZXcuc3RhdGUpLml0ZXJhdGUoe1xuXHRcdFx0ZnJvbSxcblx0XHRcdHRvLFxuXHRcdFx0ZW50ZXI6IChub2RlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSBub2RlLnR5cGU7XG5cdFx0XHRcdGNvbnN0IHRvID0gbm9kZS50bztcblxuXHRcdFx0XHRpZiAoISh0eXBlLm5hbWUuY29udGFpbnMoXCJiZWdpblwiKSAmJiB0eXBlLm5hbWUuY29udGFpbnMoXCJtYXRoXCIpKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGJvdW5kcyA9IGdldEVxdWF0aW9uQm91bmRzKHZpZXcuc3RhdGUsIHRvKTtcblx0XHRcdFx0aWYgKCFib3VuZHMpIHJldHVybjtcblxuXG5cdFx0XHRcdGNvbnN0IGVxbiA9IHZpZXcuc3RhdGUuZG9jLnNsaWNlU3RyaW5nKGJvdW5kcy5zdGFydCwgYm91bmRzLmVuZCk7XG5cblxuXHRcdFx0XHRjb25zdCBBTExfU1lNQk9MUyA9IHsuLi5ncmVlaywgLi4uY21kX3N5bWJvbHN9O1xuXG5cdFx0XHRcdGNvbnN0IGxvY2FsU3BlY3MgPSBbXG5cdFx0XHRcdFx0Li4uY29uY2VhbFN5bWJvbHMoZXFuLCBcIlxcXFxeXCIsIFwiXCIsIG1hcF9zdXBlciksXG5cdFx0XHRcdFx0Li4uY29uY2VhbFN5bWJvbHMoZXFuLCBcIl9cIiwgXCJcIiwgbWFwX3N1YiksXG5cdFx0XHRcdFx0Li4uY29uY2VhbFN5bWJvbHMoZXFuLCBcIlxcXFxcXFxcZnJhY1wiLCBcIlwiLCBmcmFjdGlvbnMpLFxuXHRcdFx0XHRcdC4uLmNvbmNlYWxTeW1ib2xzKGVxbiwgXCJcXFxcXFxcXFwiLCBcIlwiLCBBTExfU1lNQk9MUywgdW5kZWZpbmVkLCBmYWxzZSksXG5cdFx0XHRcdFx0Li4uY29uY2VhbFN1cFN1YihlcW4sIHRydWUsIEFMTF9TWU1CT0xTKSxcblx0XHRcdFx0XHQuLi5jb25jZWFsU3VwU3ViKGVxbiwgZmFsc2UsIEFMTF9TWU1CT0xTKSxcblx0XHRcdFx0XHQuLi5jb25jZWFsTW9kaWZpZXIoZXFuLCBcImhhdFwiLCBcIlxcdTAzMDJcIiksXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJkb3RcIiwgXCJcXHUwMzA3XCIpLFxuXHRcdFx0XHRcdC4uLmNvbmNlYWxNb2RpZmllcihlcW4sIFwiZGRvdFwiLCBcIlxcdTAzMDhcIiksXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJvdmVybGluZVwiLCBcIlxcdTAzMDRcIiksXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVyKGVxbiwgXCJiYXJcIiwgXCJcXHUwMzA0XCIpLFxuXHRcdFx0XHRcdC4uLmNvbmNlYWxNb2RpZmllcihlcW4sIFwidGlsZGVcIiwgXCJcXHUwMzAzXCIpLFxuXHRcdFx0XHRcdC4uLmNvbmNlYWxNb2RpZmllcihlcW4sIFwidmVjXCIsIFwiXFx1MjBEN1wiKSxcblx0XHRcdFx0XHQuLi5jb25jZWFsU3ltYm9scyhlcW4sIFwiXFxcXFxcXFxcIiwgXCJcIiwgYnJhY2tldHMsIFwiY20tYnJhY2tldFwiKSxcblx0XHRcdFx0XHQuLi5jb25jZWFsQXRvWihlcW4sIFwiXFxcXFxcXFxtYXRoY2Fse1wiLCBcIn1cIiwgbWF0aHNjcmNhbCksXG5cdFx0XHRcdFx0Li4uY29uY2VhbE1vZGlmaWVkR3JlZWtMZXR0ZXJzKGVxbiwgZ3JlZWspLFxuXHRcdFx0XHRcdC4uLmNvbmNlYWxNb2RpZmllZF9BX3RvX1pfMF90b185KGVxbiwgbWF0aGJiKSxcblx0XHRcdFx0XHQuLi5jb25jZWFsVGV4dChlcW4pLFxuXHRcdFx0XHRcdC4uLmNvbmNlYWxCcmFLZXQoZXFuKSxcblx0XHRcdFx0XHQuLi5jb25jZWFsU2V0KGVxbiksXG5cdFx0XHRcdFx0Li4uY29uY2VhbEZyYWN0aW9uKGVxbiksXG5cdFx0XHRcdFx0Li4uY29uY2VhbE9wZXJhdG9ycyhlcW4sIG9wZXJhdG9ycyksXG5cdFx0XHRcdFx0Li4uY29uY2VhbE9wZXJhdG9ybmFtZShlcW4pXG5cdFx0XHRcdF07XG5cblx0XHRcdFx0Ly8gTWFrZSB0aGUgJ3N0YXJ0JyBhbmQgJ2VuZCcgZmllbGRzIHJlcHJlc2VudCBwb3NpdGlvbnMgaW4gdGhlIGVudGlyZVxuXHRcdFx0XHQvLyBkb2N1bWVudCAobm90IGluIGEgbWF0aCBleHByZXNzaW9uKVxuXHRcdFx0XHRmb3IgKGNvbnN0IHNwZWMgb2YgbG9jYWxTcGVjcykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVwbGFjZSBvZiBzcGVjKSB7XG5cdFx0XHRcdFx0XHRyZXBsYWNlLnN0YXJ0ICs9IGJvdW5kcy5zdGFydDtcblx0XHRcdFx0XHRcdHJlcGxhY2UuZW5kICs9IGJvdW5kcy5zdGFydDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzcGVjcy5wdXNoKC4uLmxvY2FsU3BlY3MpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHJldHVybiBzcGVjcztcbn1cbiJdfQ==