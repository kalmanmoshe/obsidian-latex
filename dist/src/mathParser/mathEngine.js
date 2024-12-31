import { degreesToRadians } from "./mathUtilities";
import { findParenIndex, Paren, findDeepestParenthesesScope } from "../utils/tokenUtensils";
import { getMathJaxOperatorsByPriority, getValuesWithKeysBySide, searchMathJaxOperators } from "../utils/dataManager";
import { MathGroup, MathJaxOperator, Token, BasicMathJaxTokens, ensureAcceptableFormatForMathGroupItems, deepSearchWithPath } from "./mathJaxTokens";
const greekLetters = [
    'Alpha', 'alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
    'Iota', 'Kappa', 'Lambda', 'Mu', 'mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho',
    'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'
];
/*const latexOperators=[
    'tan', 'sin', 'cos', 'binom', 'frac', 'asin', 'acos',
    'atan', 'arccos', 'arcsin', 'arctan', 'cdot','sqrt'
]*/
export function findConsecutiveSequences(arr) {
    const sequences = [];
    let start = 0;
    for (let i = 1; i <= arr.length; i++) {
        if (arr[i] !== arr[i - 1] + 1) {
            if (i - start > 1) {
                sequences.push(arr.slice(start, i));
            }
            start = i;
        }
    }
    return sequences;
}
const operatorsForMathinfo = {
    bothButRightBracket: ["^"],
    rightBracketAndRequiresSlash: ["sqrt"],
    both: ["+", "-", "*"],
    special: ["="],
    RightParenAndRequiresSlash: ["sin", "cos", "tan", "asin", "acos", "atan", "arcsin", "arccos", "arctan"],
    doubleRightButBracket: ["frac", "binom", "/"]
};
export class MathInfo {
    debugInfo = "";
    solutionInfo = [];
    mathInfo = [];
    graph = "";
    mathSnapshots = [];
    addGraphInfo(value) {
        this.graph += value;
    }
    addDebugInfo(msg, value) {
        this.debugInfo += (typeof msg === "object" ? JSON.stringify(msg, null, 1) : msg) + " : " + (typeof value === "object" ? JSON.stringify(value, null, 1) : value) + "\n ";
    }
    addSolutionInfo(mes) {
        this.solutionInfo.push(mes);
        this.addDebugInfo("Solved", mes);
    }
    addMathInfo(msg) {
        this.mathInfo.push(msg);
    }
    addMathSnapshot(math) {
        this.mathSnapshots.push(math);
        const result = deepSearchWithPath(math, (item) => item instanceof MathJaxOperator && item.solution !== undefined);
        if (!result)
            return;
        const customFormatter = (check, string) => {
            if (check instanceof MathJaxOperator && check.solution !== undefined) {
                return `{\\color{red}${string}}`;
            }
            return string;
        };
        this.mathInfo.push(math.toString(customFormatter));
        console.log(result.item);
        this.solutionInfo.push(result.item.toStringSolution());
    }
}
function rearrangeEquation(tokens, tokenToisolate) {
}
function isolateMultiplication(tokens, isolatToken) {
}
export class Position {
    operator;
    index;
    start;
    end;
    transition;
    specialChar;
    groups;
    constructor(tokens, index) {
        this.index = index;
        this.transition = this.index;
        this.start = this.index;
        this.end = this.index;
        this.position(tokens);
    }
    position(tokens) {
        this.operator = tokens[this.index].value;
        const metadata = searchMathJaxOperators(this.operator);
        if (!metadata)
            throw new Error(`Operator ${this.operator} not found in metadata`);
        const beforeIndex = [];
        const afterIndex = [];
        getValuesWithKeysBySide(metadata.associativity.positions, true).forEach(() => {
            const item = this.applyPosition(tokens, this.start, true);
            beforeIndex.push(item.mathGroup);
            this.start = item.lastItemOfPrevious;
        });
        getValuesWithKeysBySide(metadata.associativity.positions, false).forEach(() => {
            const item = this.applyPosition(tokens, this.end, false);
            afterIndex.push(item.mathGroup);
            this.end = item.lastItemOfPrevious;
        });
        this.groups = beforeIndex.reverse().concat(afterIndex);
    }
    applyPosition(tokens, index, isLeft) {
        let breakChar = index;
        let target;
        const modifiedIndex = index + (isLeft ? -1 : 1);
        if ((isLeft && index <= 0) || (!isLeft && index >= tokens.length - 1) || !tokens[modifiedIndex]) {
            throw new Error("at applyPosition: \"index wasn't valid\" index: " + index);
        }
        if (tokens[modifiedIndex] instanceof Paren) {
            const parenIndex = findParenIndex(tokens[modifiedIndex], tokens);
            breakChar = isLeft ? parenIndex.open : parenIndex.close + 1;
            // Insure proper formatting removed everything including parentheses
            target = ensureAcceptableFormatForMathGroupItems(tokens.slice(parenIndex.open, parenIndex.close + 1));
        }
        else {
            breakChar = modifiedIndex;
            target = ensureAcceptableFormatForMathGroupItems(tokens[breakChar]);
        }
        if (target?.length === 0) {
            throw new Error(`at applyPosition: couldn't find target token for direction ${isLeft ? 'left' : 'right'} and operator"${tokens[index].value}"`);
        }
        //Make sure we don't create duplicate interlocked math groups
        if (target?.length && target?.length === 1 && target[0] instanceof MathGroup) {
            target = target[0];
            target.tryRemoveUnnecessaryNested();
        }
        return {
            mathGroup: new MathGroup(target),
            lastItemOfPrevious: breakChar,
        };
    }
}
function parseSafetyChecks(operator) {
    if (operator.groupNum !== operator.groups.length) {
        throw new Error(`Invalid number of groups for operator ${operator.operator} expected ${operator.groupNum} but got ${operator.groups.length}`);
    }
}
export function parseOperator(operator) {
    parseSafetyChecks(operator);
    function getOperableValue(group) {
        if (!group || !group.isOperable())
            return null;
        const value = group.getOperableValue();
        return value?.getValue() ?? null;
    }
    const group1 = getOperableValue(operator.groups[0]);
    const group2 = getOperableValue(operator.groups[1]);
    if (group1 === null || (group2 === null && operator.groupNum > 1))
        return false;
    switch (operator.operator) {
        case "Sine":
            operator.solution = new MathGroup([new Token(Math.sin(degreesToRadians(group1)))]);
            break;
        case "SquareRoot":
            if (group1 < 0) {
                throw new Error("Cannot calculate the square root of a negative number.");
            }
            operator.solution = new MathGroup([new Token(Math.pow(group1, 0.5))]);
            break;
        case "Fraction": {
            if (group2 === 0) {
                throw new Error("Division by zero is not allowed");
            }
            operator.solution = new MathGroup([new Token(group1 / group2)]);
            break;
        }
        case "Power": {
            operator.solution = new MathGroup([new Token(Math.pow(group1, group2))]);
            break;
        }
        case "Multiplication": {
            operator.solution = new MathGroup([new Token(group1 * group2)]);
            break;
        }
        default:
            throw new Error(`Unknown operator type in parseOperator: ${operator.operator}`);
    }
    return true;
}
function operationsOrder(tokens) {
    function findOperatorIndex(begin, end, tokens, regex) {
        const index = tokens.slice(begin, end).findIndex((token) => token.type === "operator" && regex.test(token.value));
        return index > -1 ? index + begin : null;
    }
    const { begin, end } = findDeepestParenthesesScope(tokens);
    let priority = null;
    for (let i = 1; i <= 6; i++) {
        priority = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(i, true));
        if (priority !== null)
            break;
    }
    return { start: begin, end: end, specificOperatorIndex: priority };
}
export class MathPraiser {
    input = "";
    tokens;
    solution;
    mathInfo = new MathInfo();
    constructor(input) {
        this.input = input;
        this.processInput();
        const tokens = new BasicMathJaxTokens(this.input);
        const basicTokens = tokens.tokens;
        this.convertBasicMathJaxTokenaToMathGroup(basicTokens);
        this.addDebugInfo("convertBasicMathJaxTokenaToMathGroup", this.tokens);
        this.input = this.tokens.toString();
        this.controller();
        this.solution = this.tokens;
        this.addDebugInfo("solution", this.solution);
    }
    parse(tokens) {
        console.log(tokens.getDeepth());
        tokens.extremeSimplifyAndGroup();
        const operatorIndex = tokens.getItems().findIndex(t => t instanceof MathJaxOperator && t.isOperable);
        if (operatorIndex < 0)
            return;
        const operator = tokens.getItems()[operatorIndex];
        operator.groups.forEach(group => {
            this.parse(group);
        });
        parseOperator(operator);
        if (!operator.solution) {
            operator.isOperable = false;
            return;
        }
        this.mathInfo.addMathSnapshot(this.tokens.clone());
        tokens.setItem(operator.solution, operatorIndex);
    }
    controller() {
        this.parse(this.tokens);
        this.tokens.removeNested();
        this.tokens.combiningLikeTerms();
        //this.tokens.combiningLikeTerms()
        /*
        this.tokens.tokens.combiningLikeTerms()
        for (let i = 0; i < this.tokens.tokens.items.length; i++) {
            const item = this.tokens.tokens.items[i];
        
            if (!(item instanceof mathJaxOperator)) continue;
        
            this.tokens.tokens.items[i] = item.addSolution();
        }
        */
        //this.tokens.tokens.addSolution()
        //return this.tokens.tokens;
        /*
        this.i++;
        if(this.i>10){return this.finalReturn()}

        this.getRedyforNewRond();
        //const overview=this.tokens.getOverview()
        const praisingMethod=new PraisingMethod(this.tokens.tokens)
        if (praisingMethod.isThereOperatorOtherThanEquals()){
            const position = new Position(this.tokens);
            this.addDebugInfo("Parsed expression", JSON.stringify(position, null, 1));
            if (position === null&&this.tokens.tokens.length>1){
                //this.addDebugInfo("parse(tokens)",parse(this.tokens.tokens))
                return "the ****"
            // return solution(tokens);
            }
            if (position.checkFrac()||position.checkMultiStep())
            {
                expandExpression(this.tokens,position);
                this.mathInfo.addSolutionInfo(this.tokens.reconstruct(this.tokens.tokens))
                return this.controller()
            }
            this.useParse(position)
        }
        if(praisingMethod.isMultiplicationIsolate()){
            this.useIsolat(praisingMethod)
        }
        const toIsolate=praisingMethod.isAnythingToIsolate()
        if (toIsolate){
            rearrangeForIsolation(this.tokens,toIsolate)
            return this.controller()
        }
        //if (solved === null||typeof solved==="string") {return solved; }
        return this.finalReturn()//this.tokens.tokens.length>1?this.controller():this.finalReturn();*/
    }
    solutionToString() {
        return (this.tokens.toString()) || "";
    }
    useQuadratic() {
    }
    addDebugInfo(mes, value) {
        this.mathInfo.addDebugInfo(mes, value);
    }
    processInput() {
        this.input = this.input
            .replace(/(Math.|\\|\s|left|right)/g, "")
            .replace(/{/g, "(")
            .replace(/}/g, ")");
        //.replace(/(?<!\\|[a-zA-Z])(tan|sin|cos|binom|frac|asin|acos|atan|arccos|arcsin|arctan|cdot)/g, "\\$1");
    }
    finalReturn() {
        // return this.tokens.reconstruct()
    }
    defineGroupsAndOperators(tokens) {
        const range = operationsOrder(tokens);
        if (range.start === null || range.end === null)
            return false;
        if (range.specificOperatorIndex === null && range.start === 0 && range.end === tokens.length)
            return true;
        let newMathGroupSuccess = null;
        if (range.specificOperatorIndex !== null)
            newMathGroupSuccess = this.createOperatorItemFromTokens(tokens, range.specificOperatorIndex);
        else
            newMathGroupSuccess = this.createMathGroupInsertFromTokens(tokens, range.start, range.end);
        if (!newMathGroupSuccess)
            return false;
        return this.defineGroupsAndOperators(tokens);
    }
    convertBasicMathJaxTokenaToMathGroup(basicTokens) {
        const success = this.defineGroupsAndOperators(basicTokens);
        if (!success)
            return;
        this.tokens = new MathGroup(ensureAcceptableFormatForMathGroupItems(basicTokens));
    }
    createMathGroupInsertFromTokens(tokens, start, end) {
        const newMathGroup = new MathGroup(ensureAcceptableFormatForMathGroupItems(tokens.slice(start, end + 1)));
        tokens.splice(start, (end - start) + 1, newMathGroup);
        return true;
    }
    createOperatorItemFromTokens(tokens, index) {
        const metadata = searchMathJaxOperators(tokens[index].value);
        if (!metadata)
            throw new Error(`Operator ${tokens[index].value} not found in metadata`);
        const position = new Position(tokens, index);
        const c = deepClone(tokens);
        const newOperator = new MathJaxOperator(position.operator, metadata.associativity.numPositions, position.groups);
        tokens.splice(position.start, (position.end - position.start) + 1, newOperator);
        return true;
    }
}
function deepClone(items) {
    let clone = [];
    items.forEach(item => {
        clone.push(item instanceof Array ? deepClone(item) : item.clone());
    });
    return clone;
}
class mathVariables {
}
export function flattenArray(arr) {
    let result = [];
    let stack = Array.isArray(arr) ? [...arr] : [arr];
    while (stack.length) {
        const next = stack.pop();
        if (Array.isArray(next)) {
            stack.push(...next);
        }
        else {
            result.push(next);
        }
    }
    return result.reverse();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUF1QyxnQkFBZ0IsRUFBc0MsTUFBTSxpQkFBaUIsQ0FBQztBQUk1SCxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBNkIsMkJBQTJCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN2SCxPQUFPLEVBQTJCLDZCQUE2QixFQUErQix1QkFBdUIsRUFBMEQsc0JBQXNCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNwTyxPQUFPLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQXFCLHVDQUF1QyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFHeEssTUFBTSxZQUFZLEdBQUc7SUFDakIsT0FBTyxFQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPO0lBQzVFLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUs7SUFDeEUsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTztDQUMxRCxDQUFDO0FBQ0Y7OztHQUdHO0FBRUgsTUFBTSxVQUFVLHdCQUF3QixDQUFDLEdBQVU7SUFDL0MsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFD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QUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3RCLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUN4QixDQUFDO2FBQU0sQ0FBQztZQUNKLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEIsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUM1QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4uL2ltVmVyeUxhenlcIjtcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7IEFzc29jaWF0aXZpdHkgfSBmcm9tIFwic3JjL3V0aWxzL3N0YXRpY0RhdGFcIjtcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzLCBpc09wZW5QYXJlbiwgZmluZERlZXBlc3RQYXJlbnRoZXNlc1Njb3BlIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZSwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgaXNPcGVyYXRvcldpdGhBc3NvY2lhdGl2aXR5LCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzIH0gZnJvbSBcIi4uL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XG5pbXBvcnQgeyBNYXRoR3JvdXAsIE1hdGhKYXhPcGVyYXRvciwgVG9rZW4sIEJhc2ljTWF0aEpheFRva2VucywgQmFzaWNNYXRoSmF4VG9rZW4sIGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcywgZGVlcFNlYXJjaFdpdGhQYXRoIH0gZnJvbSBcIi4vbWF0aEpheFRva2Vuc1wiO1xuaW1wb3J0IHsgc3RhcnQgfSBmcm9tIFwicmVwbFwiO1xuaW1wb3J0IHsgZ3JvdXAgfSBmcm9tIFwiY29uc29sZVwiO1xuY29uc3QgZ3JlZWtMZXR0ZXJzID0gW1xuICAgICdBbHBoYScsJ2FscGhhJywgJ0JldGEnLCAnR2FtbWEnLCAnRGVsdGEnLCAnRXBzaWxvbicsICdaZXRhJywgJ0V0YScsICdUaGV0YScsIFxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXG4gICAgJ1NpZ21hJywgJ1RhdScsICdVcHNpbG9uJywgJ1BoaScsICdDaGknLCAnUHNpJywgJ09tZWdhJ1xuXTtcbi8qY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xuICAgICd0YW4nLCAnc2luJywgJ2NvcycsICdiaW5vbScsICdmcmFjJywgJ2FzaW4nLCAnYWNvcycsIFxuICAgICdhdGFuJywgJ2FyY2NvcycsICdhcmNzaW4nLCAnYXJjdGFuJywgJ2Nkb3QnLCdzcXJ0J1xuXSovXG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMoYXJyOiBhbnlbXSkge1xuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xuICAgIGxldCBzdGFydCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XG4gICAgICAgICAgICBpZiAoaSAtIHN0YXJ0ID4gMSkge1xuICAgICAgICAgICAgICAgIHNlcXVlbmNlcy5wdXNoKGFyci5zbGljZShzdGFydCwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhcnQgPSBpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzZXF1ZW5jZXM7XG59XG5cblxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cbn07XG5cblxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xuICAgIGRlYnVnSW5mbzogc3RyaW5nPVwiXCI7XG4gICAgc29sdXRpb25JbmZvOiBhbnlbXT1bXTtcbiAgICBtYXRoSW5mbzogYW55W109W11cbiAgICBncmFwaDogc3RyaW5nPVwiXCI7XG4gICAgbWF0aFNuYXBzaG90czogTWF0aEdyb3VwW109W11cbiAgICBhZGRHcmFwaEluZm8odmFsdWU6IHN0cmluZyl7XG4gICAgICAgIHRoaXMuZ3JhcGgrPXZhbHVlO1xuICAgIH1cbiAgICBhZGREZWJ1Z0luZm8obXNnOiBzdHJpbmcsIHZhbHVlOiBhbnkpe1xuICAgICAgICB0aGlzLmRlYnVnSW5mbys9KHR5cGVvZiBtc2c9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KG1zZyxudWxsLDEpOm1zZykrXCIgOiBcIisodHlwZW9mIHZhbHVlPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeSh2YWx1ZSxudWxsLDEpOnZhbHVlKSsgXCJcXG4gXCI7XG4gICAgfVxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXM6IHN0cmluZyl7XG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xuICAgIH1cbiAgICBhZGRNYXRoSW5mbyhtc2c6IHN0cmluZyl7XG4gICAgICAgIHRoaXMubWF0aEluZm8ucHVzaChtc2cpXG4gICAgfVxuICAgIGFkZE1hdGhTbmFwc2hvdChtYXRoOiBNYXRoR3JvdXApe1xuICAgICAgICB0aGlzLm1hdGhTbmFwc2hvdHMucHVzaChtYXRoKVxuICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoXG4gICAgICAgICAgICBtYXRoLFxuICAgICAgICAgICAgKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiYgaXRlbS5zb2x1dGlvbiAhPT0gdW5kZWZpbmVkXG4gICAgICAgICk7XG4gICAgICAgIGlmKCFyZXN1bHQpcmV0dXJuXG5cbiAgICAgICAgY29uc3QgY3VzdG9tRm9ybWF0dGVyID0gKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgICAgICAgaWYgKGNoZWNrIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yICYmIGNoZWNrLnNvbHV0aW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYHtcXFxcY29sb3J7cmVkfSR7c3RyaW5nfX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHN0cmluZ1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gobWF0aC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpKVxuICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQuaXRlbSlcbiAgICAgICAgdGhpcy5zb2x1dGlvbkluZm8ucHVzaChyZXN1bHQuaXRlbS50b1N0cmluZ1NvbHV0aW9uKCkpXG4gICAgICAgIFxuICAgIH1cblxufVxuXG5cblxuXG5cblxuXG5cbmZ1bmN0aW9uIHJlYXJyYW5nZUVxdWF0aW9uKHRva2VuczogYW55LHRva2VuVG9pc29sYXRlOiBhbnkpe1xuICAgIFxufVxuXG5mdW5jdGlvbiBpc29sYXRlTXVsdGlwbGljYXRpb24odG9rZW5zOiBhbnksaXNvbGF0VG9rZW46IFRva2VuKXsvKlxuICAgIGNvbnN0IGluZGV4PW9wZXJhdGlvbnNPcmRlcih0b2tlbnMpXG4gICAgY29uc3QgSXNvbGF0ZWQ9dG9rZW5zLnRva2Vucy5maW5kKCh0b2tlbjogYW55LCBpZHg6IG51bWJlcik9PmlkeDxpbmRleClcbiAgICBjb25zdCBmcmFjPWNyZWF0ZUZyYWModG9rZW5zLmxpc3Quc2xpY2UoaW5kZXggKyAxKSxuZXcgVG9rZW4oSXNvbGF0ZWQudmFsdWUpKVxuICAgIElzb2xhdGVkLnZhbHVlPTE7XG4gICAgdG9rZW5zLmluc2VydFRva2VucyhpbmRleCsxLHRva2Vucy50b2tlbnMubGVuZ3RoLWluZGV4KzEsZnJhYykqL1xufVxuXG5cblxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uIHtcbiAgICBvcGVyYXRvcjogc3RyaW5nO1xuICAgIGluZGV4OiBudW1iZXI7XG4gICAgc3RhcnQ6IG51bWJlcjtcbiAgICBlbmQ6IG51bWJlcjtcbiAgICB0cmFuc2l0aW9uOiBudW1iZXI7XG4gICAgc3BlY2lhbENoYXI6IHN0cmluZztcbiAgICBcbiAgICBncm91cHM6IE1hdGhHcm91cFtdO1xuICAgIGNvbnN0cnVjdG9yKHRva2VuczogYW55W10sIGluZGV4OiBudW1iZXIpe1xuICAgICAgICB0aGlzLmluZGV4ID0gaW5kZXg7XG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXg7XG4gICAgICAgIHRoaXMuc3RhcnQgPSB0aGlzLmluZGV4O1xuICAgICAgICB0aGlzLmVuZCA9IHRoaXMuaW5kZXg7XG4gICAgICAgIHRoaXMucG9zaXRpb24odG9rZW5zKVxuICAgIH1cbiAgICBwb3NpdGlvbih0b2tlbnM6IGFueVtdKSB7XG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnNbdGhpcy5pbmRleF0udmFsdWU7XG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLm9wZXJhdG9yKTtcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IG5vdCBmb3VuZCBpbiBtZXRhZGF0YWApO1xuICAgIFxuICAgICAgICBjb25zdCBiZWZvcmVJbmRleDogTWF0aEdyb3VwW10gPSBbXTtcbiAgICAgICAgY29uc3QgYWZ0ZXJJbmRleDogIE1hdGhHcm91cFtdID0gW107XG4gICAgXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLCB0cnVlKS5mb3JFYWNoKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnN0YXJ0LCB0cnVlKTtcbiAgICAgICAgICAgIGJlZm9yZUluZGV4LnB1c2goaXRlbS5tYXRoR3JvdXApO1xuICAgICAgICAgICAgdGhpcy5zdGFydCA9IGl0ZW0ubGFzdEl0ZW1PZlByZXZpb3VzO1xuICAgICAgICB9KTtcbiAgICBcbiAgICBcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsIGZhbHNlKS5mb3JFYWNoKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmVuZCwgZmFsc2UpO1xuICAgICAgICAgICAgYWZ0ZXJJbmRleC5wdXNoKGl0ZW0ubWF0aEdyb3VwKTtcbiAgICAgICAgICAgIHRoaXMuZW5kID0gaXRlbS5sYXN0SXRlbU9mUHJldmlvdXM7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmdyb3VwcyA9IGJlZm9yZUluZGV4LnJldmVyc2UoKS5jb25jYXQoYWZ0ZXJJbmRleCk7XG4gICAgfVxuICAgIGFwcGx5UG9zaXRpb24odG9rZW5zOiBhbnlbXSwgaW5kZXg6ICBudW1iZXIsIGlzTGVmdDogYm9vbGVhbikge1xuICAgICAgICBsZXQgYnJlYWtDaGFyPWluZGV4XG4gICAgICAgIGxldCB0YXJnZXQ6IGFueTtcbiAgICAgICAgY29uc3QgbW9kaWZpZWRJbmRleCA9ICBpbmRleCsoaXNMZWZ0Py0gMSA6ICAxKTtcblxuICAgICAgICBpZiAoKGlzTGVmdCAmJiBpbmRleCA8PSAwKSB8fCAoIWlzTGVmdCAmJiBpbmRleCA+PSB0b2tlbnMubGVuZ3RoIC0gMSkgfHwgIXRva2Vuc1ttb2RpZmllZEluZGV4XSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYXQgYXBwbHlQb3NpdGlvbjogXFxcImluZGV4IHdhc24ndCB2YWxpZFxcXCIgaW5kZXg6IFwiK2luZGV4KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0b2tlbnNbbW9kaWZpZWRJbmRleF0gaW5zdGFuY2VvZiBQYXJlbikge1xuICAgICAgICAgICAgY29uc3QgcGFyZW5JbmRleCA9IGZpbmRQYXJlbkluZGV4KHRva2Vuc1ttb2RpZmllZEluZGV4XSx0b2tlbnMpO1xuICAgICAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2UrMTtcbiAgICAgICAgICAgIC8vIEluc3VyZSBwcm9wZXIgZm9ybWF0dGluZyByZW1vdmVkIGV2ZXJ5dGhpbmcgaW5jbHVkaW5nIHBhcmVudGhlc2VzXG4gICAgICAgICAgICB0YXJnZXQgPSBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXModG9rZW5zLnNsaWNlKHBhcmVuSW5kZXgub3BlbiwgcGFyZW5JbmRleC5jbG9zZSsxKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBicmVha0NoYXI9bW9kaWZpZWRJbmRleDtcbiAgICAgICAgICAgIHRhcmdldCA9IGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyh0b2tlbnNbYnJlYWtDaGFyXSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7aXNMZWZ0PydsZWZ0JzoncmlnaHQnfSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zW2luZGV4XS52YWx1ZX1cImAsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vTWFrZSBzdXJlIHdlIGRvbid0IGNyZWF0ZSBkdXBsaWNhdGUgaW50ZXJsb2NrZWQgbWF0aCBncm91cHNcbiAgICAgICAgaWYodGFyZ2V0Py5sZW5ndGgmJnRhcmdldD8ubGVuZ3RoPT09MSYmdGFyZ2V0WzBdaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xuICAgICAgICAgICAgdGFyZ2V0PXRhcmdldFswXVxuICAgICAgICAgICAgdGFyZ2V0LnRyeVJlbW92ZVVubmVjZXNzYXJ5TmVzdGVkKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbWF0aEdyb3VwOiBuZXcgTWF0aEdyb3VwKHRhcmdldCksXG4gICAgICAgICAgICBsYXN0SXRlbU9mUHJldmlvdXM6IGJyZWFrQ2hhcixcbiAgICAgICAgfTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xuICAgIGlmIChvcGVyYXRvci5ncm91cE51bSE9PW9wZXJhdG9yLmdyb3Vwcy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIG51bWJlciBvZiBncm91cHMgZm9yIG9wZXJhdG9yICR7b3BlcmF0b3Iub3BlcmF0b3J9IGV4cGVjdGVkICR7b3BlcmF0b3IuZ3JvdXBOdW19IGJ1dCBnb3QgJHtvcGVyYXRvci5ncm91cHMubGVuZ3RofWApO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlT3BlcmF0b3Iob3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcik6IGJvb2xlYW4ge1xuICAgIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yKTsgXG4gICAgZnVuY3Rpb24gZ2V0T3BlcmFibGVWYWx1ZShncm91cDogTWF0aEdyb3VwKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgICAgIGlmICghZ3JvdXB8fCFncm91cC5pc09wZXJhYmxlKCkpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGdyb3VwLmdldE9wZXJhYmxlVmFsdWUoKTtcbiAgICAgICAgcmV0dXJuIHZhbHVlPy5nZXRWYWx1ZSgpID8/IG51bGw7XG4gICAgfVxuICAgIGNvbnN0IGdyb3VwMSA9IGdldE9wZXJhYmxlVmFsdWUob3BlcmF0b3IuZ3JvdXBzWzBdKTtcbiAgICBjb25zdCBncm91cDIgPSBnZXRPcGVyYWJsZVZhbHVlKG9wZXJhdG9yLmdyb3Vwc1sxXSk7XG4gICAgaWYgKGdyb3VwMSA9PT0gbnVsbHx8KGdyb3VwMj09PW51bGwmJm9wZXJhdG9yLmdyb3VwTnVtPjEpKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgc3dpdGNoIChvcGVyYXRvci5vcGVyYXRvcikge1xuICAgICAgICBjYXNlIFwiU2luZVwiOlxuICAgICAgICAgICAgb3BlcmF0b3Iuc29sdXRpb24gPSBuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4oTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyhncm91cDEpKSldKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiU3F1YXJlUm9vdFwiOlxuICAgICAgICAgICAgaWYgKGdyb3VwMSA8IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgY2FsY3VsYXRlIHRoZSBzcXVhcmUgcm9vdCBvZiBhIG5lZ2F0aXZlIG51bWJlci5cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihNYXRoLnBvdyhncm91cDEsMC41KSldKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiRnJhY3Rpb25cIjoge1xuICAgICAgICAgICAgaWYgKGdyb3VwMiA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpdmlzaW9uIGJ5IHplcm8gaXMgbm90IGFsbG93ZWRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihncm91cDEgLyBncm91cDIhKV0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcIlBvd2VyXCI6IHtcbiAgICAgICAgICAgIG9wZXJhdG9yLnNvbHV0aW9uID0gbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKE1hdGgucG93KGdyb3VwMSxncm91cDIhKSldKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJNdWx0aXBsaWNhdGlvblwiOiB7XG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihncm91cDEgKiBncm91cDIhKV0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBgVW5rbm93biBvcGVyYXRvciB0eXBlIGluIHBhcnNlT3BlcmF0b3I6ICR7b3BlcmF0b3Iub3BlcmF0b3J9YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIFxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuXG5cblxuZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2VuczogYW55W10pIHtcbiAgICBmdW5jdGlvbiBmaW5kT3BlcmF0b3JJbmRleChiZWdpbjogbnVtYmVyLCBlbmQ6IG51bWJlciwgdG9rZW5zOiBhbnksIHJlZ2V4PzogYW55KSB7XG4gICAgICAgIGNvbnN0IGluZGV4PXRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueTsgfSkgPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcbiAgICAgICAgcmV0dXJuIGluZGV4Pi0xP2luZGV4K2JlZ2luOm51bGw7XG4gICAgfVxuICAgIGNvbnN0IHsgYmVnaW4sIGVuZCB9ID0gZmluZERlZXBlc3RQYXJlbnRoZXNlc1Njb3BlKHRva2Vucyk7XG4gICAgbGV0IHByaW9yaXR5PW51bGxcbiAgICBmb3IgKGxldCBpPTE7aTw9NjtpKyspe1xuICAgICAgICBwcmlvcml0eSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHkoaSx0cnVlKSk7XG4gICAgICAgIGlmKHByaW9yaXR5IT09bnVsbClicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHtzdGFydDogYmVnaW4sZW5kOiBlbmQsc3BlY2lmaWNPcGVyYXRvckluZGV4OiBwcmlvcml0eX1cbn1cblxuXG5leHBvcnQgY2xhc3MgTWF0aFByYWlzZXJ7XG4gICAgaW5wdXQ9XCJcIjtcbiAgICB0b2tlbnM6IE1hdGhHcm91cDtcbiAgICBzb2x1dGlvbjogYW55O1xuICAgIG1hdGhJbmZvPW5ldyBNYXRoSW5mbygpO1xuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xuICAgICAgICB0aGlzLnByb2Nlc3NJbnB1dCgpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgdG9rZW5zPW5ldyBCYXNpY01hdGhKYXhUb2tlbnModGhpcy5pbnB1dCk7XG4gICAgICAgIGNvbnN0IGJhc2ljVG9rZW5zPXRva2Vucy50b2tlbnNcbiAgICAgICAgXG4gICAgICAgIHRoaXMuY29udmVydEJhc2ljTWF0aEpheFRva2VuYVRvTWF0aEdyb3VwKGJhc2ljVG9rZW5zKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcImNvbnZlcnRCYXNpY01hdGhKYXhUb2tlbmFUb01hdGhHcm91cFwiLHRoaXMudG9rZW5zKVxuICAgICAgICBcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLnRva2Vucy50b1N0cmluZygpXG4gICAgICAgIHRoaXMuY29udHJvbGxlcigpO1xuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMudG9rZW5zXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwic29sdXRpb25cIix0aGlzLnNvbHV0aW9uKTtcbiAgICB9XG5cbiAgICBcbiAgICBwYXJzZSh0b2tlbnM6IE1hdGhHcm91cCk6IHZvaWQge1xuICAgICAgICBjb25zb2xlLmxvZyh0b2tlbnMuZ2V0RGVlcHRoKCkpXG4gICAgICAgIHRva2Vucy5leHRyZW1lU2ltcGxpZnlBbmRHcm91cCgpXG4gICAgICAgIGNvbnN0IG9wZXJhdG9ySW5kZXg9dG9rZW5zLmdldEl0ZW1zKCkuZmluZEluZGV4KFxuICAgICAgICAgICAgdCA9PiB0IGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yICYmIHQuaXNPcGVyYWJsZVxuICAgICAgICApIDtcbiAgICAgICAgaWYgKG9wZXJhdG9ySW5kZXg8MCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IHRva2Vucy5nZXRJdGVtcygpW29wZXJhdG9ySW5kZXhdIGFzIE1hdGhKYXhPcGVyYXRvclxuICAgIFxuICAgICAgICBcbiAgICAgICAgb3BlcmF0b3IuZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgICAgICAgICAgdGhpcy5wYXJzZShncm91cCk7XG4gICAgICAgIH0pO1xuICAgICAgICBwYXJzZU9wZXJhdG9yKG9wZXJhdG9yKVxuICAgICAgICBpZiAoIW9wZXJhdG9yLnNvbHV0aW9uKSB7XG4gICAgICAgICAgICBvcGVyYXRvci5pc09wZXJhYmxlID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoU25hcHNob3QodGhpcy50b2tlbnMuY2xvbmUoKSlcbiAgICAgICAgdG9rZW5zLnNldEl0ZW0ob3BlcmF0b3Iuc29sdXRpb24sb3BlcmF0b3JJbmRleCk7IFxuICAgIH1cbiAgICBcbiAgICBjb250cm9sbGVyKCk6IGFueXtcbiAgICAgICAgdGhpcy5wYXJzZSh0aGlzLnRva2VucylcblxuICAgICAgICB0aGlzLnRva2Vucy5yZW1vdmVOZXN0ZWQoKVxuICAgICAgICB0aGlzLnRva2Vucy5jb21iaW5pbmdMaWtlVGVybXMoKVxuXG4gICAgICAgIC8vdGhpcy50b2tlbnMuY29tYmluaW5nTGlrZVRlcm1zKClcbiAgICAgICAgLypcbiAgICAgICAgdGhpcy50b2tlbnMudG9rZW5zLmNvbWJpbmluZ0xpa2VUZXJtcygpXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy50b2tlbnMudG9rZW5zLml0ZW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy50b2tlbnMudG9rZW5zLml0ZW1zW2ldO1xuICAgICAgICBcbiAgICAgICAgICAgIGlmICghKGl0ZW0gaW5zdGFuY2VvZiBtYXRoSmF4T3BlcmF0b3IpKSBjb250aW51ZTtcbiAgICAgICAgXG4gICAgICAgICAgICB0aGlzLnRva2Vucy50b2tlbnMuaXRlbXNbaV0gPSBpdGVtLmFkZFNvbHV0aW9uKCk7XG4gICAgICAgIH0gICAgICAgIFxuICAgICAgICAqL1xuICAgICAgICAvL3RoaXMudG9rZW5zLnRva2Vucy5hZGRTb2x1dGlvbigpXG4gICAgICAgIC8vcmV0dXJuIHRoaXMudG9rZW5zLnRva2VucztcbiAgICAgICAgXG4gICAgICAgIC8qXG4gICAgICAgIHRoaXMuaSsrO1xuICAgICAgICBpZih0aGlzLmk+MTApe3JldHVybiB0aGlzLmZpbmFsUmV0dXJuKCl9XG5cbiAgICAgICAgdGhpcy5nZXRSZWR5Zm9yTmV3Um9uZCgpO1xuICAgICAgICAvL2NvbnN0IG92ZXJ2aWV3PXRoaXMudG9rZW5zLmdldE92ZXJ2aWV3KClcbiAgICAgICAgY29uc3QgcHJhaXNpbmdNZXRob2Q9bmV3IFByYWlzaW5nTWV0aG9kKHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgaWYgKHByYWlzaW5nTWV0aG9kLmlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpKXtcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMudG9rZW5zKTtcbiAgICAgICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUGFyc2VkIGV4cHJlc3Npb25cIiwgSlNPTi5zdHJpbmdpZnkocG9zaXRpb24sIG51bGwsIDEpKTtcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbiA9PT0gbnVsbCYmdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xKXtcbiAgICAgICAgICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKFwicGFyc2UodG9rZW5zKVwiLHBhcnNlKHRoaXMudG9rZW5zLnRva2VucykpXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGhlICoqKipcIlxuICAgICAgICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocG9zaXRpb24uY2hlY2tGcmFjKCl8fHBvc2l0aW9uLmNoZWNrTXVsdGlTdGVwKCkpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbkluZm8odGhpcy50b2tlbnMucmVjb25zdHJ1Y3QodGhpcy50b2tlbnMudG9rZW5zKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudXNlUGFyc2UocG9zaXRpb24pXG4gICAgICAgIH1cbiAgICAgICAgaWYocHJhaXNpbmdNZXRob2QuaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKSl7XG4gICAgICAgICAgICB0aGlzLnVzZUlzb2xhdChwcmFpc2luZ01ldGhvZClcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b0lzb2xhdGU9cHJhaXNpbmdNZXRob2QuaXNBbnl0aGluZ1RvSXNvbGF0ZSgpXG4gICAgICAgIGlmICh0b0lzb2xhdGUpe1xuICAgICAgICAgICAgcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRoaXMudG9rZW5zLHRvSXNvbGF0ZSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxuICAgICAgICB9ICAgXG4gICAgICAgIC8vaWYgKHNvbHZlZCA9PT0gbnVsbHx8dHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XG4gICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCkvL3RoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7Ki9cbiAgICB9XG4gICAgc29sdXRpb25Ub1N0cmluZygpe1xuICAgICAgICByZXR1cm4gKHRoaXMudG9rZW5zLnRvU3RyaW5nKCkpfHxcIlwiXG4gICAgfVxuXG4gICAgdXNlUXVhZHJhdGljKCl7LypcbiAgICAgICAgdGhpcy50b2tlbnMudG9rZW5zPXNpbXBsaWZpeSh0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGU6IHN0cmluZyk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXG4gICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNpbXBsaWZpeSh0b2tlbnMpXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHF1YWQoXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdPy52YWx1ZSB8IDAsXG4gICAgICAgICAgICAgICAgICAgIG51bWJlckluZGV4WzBdPy52YWx1ZSAqIC0xfCAwLFxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSovXG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtZXM6IHN0cmluZyx2YWx1ZTogYW55KXtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxuICAgIH1cbiAgICBwcm9jZXNzSW5wdXQoKXtcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKVxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcbiAgICAgICAgLy8ucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XG4gICAgfVxuICAgIGZpbmFsUmV0dXJuKCl7XG4gICAgICAgLy8gcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcbiAgICB9XG4gICAgZGVmaW5lR3JvdXBzQW5kT3BlcmF0b3JzKHRva2VuczogQXJyYXk8YW55Pik6Ym9vbGVhbnx0aGlze1xuICAgICAgICBjb25zdCByYW5nZT1vcGVyYXRpb25zT3JkZXIodG9rZW5zKTtcbiAgICAgICAgaWYocmFuZ2Uuc3RhcnQ9PT1udWxsfHxyYW5nZS5lbmQ9PT1udWxsKXJldHVybiBmYWxzZTtcbiAgICAgICAgaWYocmFuZ2Uuc3BlY2lmaWNPcGVyYXRvckluZGV4PT09bnVsbCYmcmFuZ2Uuc3RhcnQ9PT0wJiZyYW5nZS5lbmQ9PT10b2tlbnMubGVuZ3RoKXJldHVybiB0cnVlO1xuICAgICAgICBsZXQgbmV3TWF0aEdyb3VwU3VjY2Vzcz1udWxsXG4gICAgICAgIGlmIChyYW5nZS5zcGVjaWZpY09wZXJhdG9ySW5kZXghPT1udWxsKVxuICAgICAgICAgICAgbmV3TWF0aEdyb3VwU3VjY2Vzcz10aGlzLmNyZWF0ZU9wZXJhdG9ySXRlbUZyb21Ub2tlbnModG9rZW5zLHJhbmdlLnNwZWNpZmljT3BlcmF0b3JJbmRleClcbiAgICAgICAgZWxzZVxuICAgICAgICBuZXdNYXRoR3JvdXBTdWNjZXNzPXRoaXMuY3JlYXRlTWF0aEdyb3VwSW5zZXJ0RnJvbVRva2Vucyh0b2tlbnMscmFuZ2Uuc3RhcnQscmFuZ2UuZW5kKVxuICAgICAgICBpZighbmV3TWF0aEdyb3VwU3VjY2VzcylyZXR1cm4gZmFsc2U7XG4gICAgICAgIHJldHVybiB0aGlzLmRlZmluZUdyb3Vwc0FuZE9wZXJhdG9ycyh0b2tlbnMpO1xuICAgIH1cbiAgICBjb252ZXJ0QmFzaWNNYXRoSmF4VG9rZW5hVG9NYXRoR3JvdXAoYmFzaWNUb2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPik6dm9pZHtcbiAgICAgICAgY29uc3Qgc3VjY2Vzcz10aGlzLmRlZmluZUdyb3Vwc0FuZE9wZXJhdG9ycyhiYXNpY1Rva2VucylcbiAgICAgICAgaWYoIXN1Y2Nlc3MpcmV0dXJuXG4gICAgICAgIHRoaXMudG9rZW5zPW5ldyBNYXRoR3JvdXAoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGJhc2ljVG9rZW5zKSlcbiAgICB9XG4gICAgY3JlYXRlTWF0aEdyb3VwSW5zZXJ0RnJvbVRva2Vucyh0b2tlbnM6IEFycmF5PGFueT4sc3RhcnQ6IG51bWJlcixlbmQ6IG51bWJlcik6Ym9vbGVhbntcbiAgICAgICAgY29uc3QgbmV3TWF0aEdyb3VwPW5ldyBNYXRoR3JvdXAoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKHRva2Vucy5zbGljZShzdGFydCxlbmQrMSkpKTtcbiAgICAgICAgdG9rZW5zLnNwbGljZShzdGFydCwoZW5kLXN0YXJ0KSsxLG5ld01hdGhHcm91cCk7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICAgIGNyZWF0ZU9wZXJhdG9ySXRlbUZyb21Ub2tlbnModG9rZW5zOiBBcnJheTxhbnk+LGluZGV4OiBudW1iZXIpOmJvb2xlYW57XG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0b2tlbnNbaW5kZXhdLnZhbHVlKTtcbiAgICAgICAgaWYoIW1ldGFkYXRhKXRocm93IG5ldyBFcnJvcihgT3BlcmF0b3IgJHt0b2tlbnNbaW5kZXhdLnZhbHVlfSBub3QgZm91bmQgaW4gbWV0YWRhdGFgKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHBvc2l0aW9uPW5ldyBQb3NpdGlvbih0b2tlbnMsaW5kZXgpXG4gICAgICAgIGNvbnN0IGM9ZGVlcENsb25lKHRva2VucylcbiAgICAgICAgY29uc3QgbmV3T3BlcmF0b3I9bmV3IE1hdGhKYXhPcGVyYXRvcihwb3NpdGlvbi5vcGVyYXRvcixtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9ucyxwb3NpdGlvbi5ncm91cHMsKVxuICAgICAgICB0b2tlbnMuc3BsaWNlKHBvc2l0aW9uLnN0YXJ0LChwb3NpdGlvbi5lbmQtcG9zaXRpb24uc3RhcnQpKzEsbmV3T3BlcmF0b3IpO1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbn1cbmZ1bmN0aW9uIGRlZXBDbG9uZShpdGVtczogYW55W10pIHtcbiAgICBsZXQgY2xvbmU6IGFueVtdID0gW107XG4gICAgaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgICAgY2xvbmUucHVzaChpdGVtIGluc3RhbmNlb2YgQXJyYXkgPyBkZWVwQ2xvbmUoaXRlbSkgOiBpdGVtLmNsb25lKCkpO1xuICAgIH0pO1xuICAgIHJldHVybiBjbG9uZTtcbn1cblxuY2xhc3MgbWF0aFZhcmlhYmxlc3tcblxufVxuXG5cblxuXG5cblxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnI6IGFueSkge1xuICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICBsZXQgc3RhY2sgPSBBcnJheS5pc0FycmF5KGFycikgPyBbLi4uYXJyXSA6IFthcnJdO1xuXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBuZXh0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpO1xufVxuIl19