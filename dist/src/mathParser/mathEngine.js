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
/*
function safeToNumber(value) {
    if (!(typeof value === "string")){return value}
    if (value==="+"){return 0}
    if (value==="-"){return -1}
    if (/[a-zA-Z]/.test(value)){return 1}
    if(/[([]/.test(value[0])){value = value.slice(1)}
    if(/[)\]]/.test(value[value.length-1])){value = value.slice(0,value.length-1)}
    for (let i = 0; i<value.length; i++) {
        if (typeof value[i] === "string" && /[()[\]]/.test(value[i])) {
            value = value.slice(0, i) + value.slice(i + 1);
            i--;
        }
    }
    const num = Number(value);
    return isNaN(num) ? value.length>0?value:0 : num;
}*/
function rearrangeEquation(tokens, tokenToisolate) {
}
function isolateMultiplication(tokens, isolatToken) {
}
function createFrac(nominator, denominator) {
    // return [new Token('frac'),new Token('('),nominator,new Token(')'),new Token('('),denominator,new Token(')')]
}
/*
function simplifiy(tokens: any[]){
    if (tokens.length<=1){return tokens}
    let i=0,newTokens=[];
    while (i<=100&&tokens.some((token: any) => (/(number|variable|powerVariable)/).test(token.type)))
    {
        i++;
        let eqindex=tokens.findIndex((token: { value: string; }) => token.value === "=");
        let OperationIndex = tokens.findIndex((token: { type: string; }) => (/(number|variable|powerVariable)/).test(token.type));
        if (OperationIndex===-1){return tokens;}

        let currentToken={type: tokens[OperationIndex].type , value: tokens[OperationIndex].value,variable: tokens[OperationIndex].variable ,pow: tokens[OperationIndex].pow}

        let numberGroup = tokens
        .map((token: any, i: any) => ({ token, originalIndex: i }))
        .filter((item: { token: { type: any; }; }) => item.token.type===currentToken.type)
        .reduce((sum: number, item: { originalIndex: number; token: { type: string; value: number; }; }) => {
        let multiplier=(tokens[item.originalIndex - 1] && tokens[item.originalIndex - 1].value === "-") ? -1 : 1;
        multiplier *= (item.originalIndex <= eqindex) ? -1 : 1;
        if (!(/(number)/).test(item.token.type)){multiplier*=-1}
        return sum + (item.token.value * multiplier);
        }, 0);
        
        newTokens.push({
            ...currentToken,
            value: numberGroup
        });

        tokens = tokens.filter(token =>
            token.type !== tokens[OperationIndex].type ||
            (token.variable && token.variable !== currentToken.variable) ||
            (token.pow && token.pow !== currentToken.pow)
        );
    }
    return newTokens;
}
*/
/*
function rearrangeForIsolation(tokens: Tokens, isolationGoal: { type: any; value: any; overviewSideOne?: Map<any, any>; overviewSideTwo?: Map<any, any>; }) {
    if (tokens.tokens.length <= 1) return tokens;

    const eqIndex = tokens.tokens.findIndex((t: { value: string; }) => t.value === 'Equals');
    if (eqIndex === -1) throw new Error("No 'Equals' operator found in tokens");

    const switchDirection = false; // Future logic to determine direction
    const isolationGoalIndices = tokens.tokens
        .map((t: { type: any; variable: any; }, idx: any) => (t.type === isolationGoal.type && t.variable === isolationGoal.value ? idx : null))
        .filter((idx: null|number) => idx !== null);

    const otherIndices = tokens.tokens
        .map((_: any, idx: any) => (!isolationGoalIndices.includes(idx) && idx !== eqIndex ? idx : null))
        .filter((idx: null|number) => idx !== null);

    // Adjust signs
    tokens.tokens.forEach((token: { value: number; }, i: number) => {
        if ((switchDirection? i > eqIndex : i < eqIndex) && otherIndices.includes(i)) {
            token.value *= -1;
        } else if ((switchDirection? i < eqIndex : i > eqIndex) && isolationGoalIndices.includes(i)) {
            token.value *= -1;
        }
    });

    // Separate sides
    const side1: any[] = [];
    const side2: any[] = [];
    tokens.tokens.forEach((token: any, i: any) => {
        if (isolationGoalIndices.includes(i)) side1.push(token);
        if (otherIndices.includes(i)) side2.push(token);
    });

    tokens.tokens = switchDirection
        ? [...side2, tokens.tokens[eqIndex], ...side1]
        : [...side1, tokens.tokens[eqIndex], ...side2];
}
*/
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
    praisingMethod() {
        /*
        const filterByType=(type)=>this.tokens.tokens.filter(token => token.type === type);
        const [numberIndex,variableIndex,powIndex] = [filterByType("number"),filterByType("variable"),filterByType("powerVariable")]
        if (powIndex.length===1&&powIndex[0].pow===2)
            return this.useQuadratic()
        return this.useIsolat();*/
    }
    useIsolat(praisingMethod) {
        //isolateMultiplication(this.tokens,new Token(praisingMethod.variables[0]))
        //return this.controller()
        //this.tokens.insertTokens()
        //Use possession
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
class PraisingMethod {
}
class Operator {
}
class Modifier {
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUF1QyxnQkFBZ0IsRUFBc0MsTUFBTSxpQkFBaUIsQ0FBQztBQUk1SCxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBNkIsMkJBQTJCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN2SCxPQUFPLEVBQTJCLDZCQUE2QixFQUErQix1QkFBdUIsRUFBMEQsc0JBQXNCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNwTyxPQUFPLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQXFCLHVDQUF1QyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFHeEssTUFBTSxZQUFZLEdBQUc7SUFDakIsT0FBTyxFQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPO0lBQzVFLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUs7SUFDeEUsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTztDQUMxRCxDQUFDO0FBQ0Y7OztHQUdHO0FBRUgsTUFBTSxVQUFVLHdCQUF3QixDQUFDLEdBQVU7SUFDL0MsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFD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SUFDaEIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRWxELE9BQU8sS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2xCLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN6QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN0QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDeEIsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RCLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDNUIsQ0FBQztBQUlELE1BQU0sY0FBYztDQW1IbkI7QUFFRCxNQUFNLFFBQVE7Q0FFYjtBQUVELE1BQU0sUUFBUTtDQUViIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuLi9pbVZlcnlMYXp5XCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgQXNzb2NpYXRpdml0eSB9IGZyb20gXCJzcmMvdXRpbHMvc3RhdGljRGF0YVwiO1xyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgaXNPcGVuUGFyZW4sIGZpbmREZWVwZXN0UGFyZW50aGVzZXNTY29wZSB9IGZyb20gXCIuLi91dGlscy90b2tlblV0ZW5zaWxzXCI7XHJcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZSwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgaXNPcGVyYXRvcldpdGhBc3NvY2lhdGl2aXR5LCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzIH0gZnJvbSBcIi4uL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IE1hdGhHcm91cCwgTWF0aEpheE9wZXJhdG9yLCBUb2tlbiwgQmFzaWNNYXRoSmF4VG9rZW5zLCBCYXNpY01hdGhKYXhUb2tlbiwgZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zLCBkZWVwU2VhcmNoV2l0aFBhdGggfSBmcm9tIFwiLi9tYXRoSmF4VG9rZW5zXCI7XHJcbmltcG9ydCB7IHN0YXJ0IH0gZnJvbSBcInJlcGxcIjtcclxuaW1wb3J0IHsgZ3JvdXAgfSBmcm9tIFwiY29uc29sZVwiO1xyXG5jb25zdCBncmVla0xldHRlcnMgPSBbXHJcbiAgICAnQWxwaGEnLCdhbHBoYScsICdCZXRhJywgJ0dhbW1hJywgJ0RlbHRhJywgJ0Vwc2lsb24nLCAnWmV0YScsICdFdGEnLCAnVGhldGEnLCBcclxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXHJcbiAgICAnU2lnbWEnLCAnVGF1JywgJ1Vwc2lsb24nLCAnUGhpJywgJ0NoaScsICdQc2knLCAnT21lZ2EnXHJcbl07XHJcbi8qY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xyXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXHJcbiAgICAnYXRhbicsICdhcmNjb3MnLCAnYXJjc2luJywgJ2FyY3RhbicsICdjZG90Jywnc3FydCdcclxuXSovXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKGFycjogYW55W10pIHtcclxuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xyXG4gICAgbGV0IHN0YXJ0ID0gMDtcclxuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IGFyci5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XHJcbiAgICAgICAgICAgIGlmIChpIC0gc3RhcnQgPiAxKSB7XHJcbiAgICAgICAgICAgICAgICBzZXF1ZW5jZXMucHVzaChhcnIuc2xpY2Uoc3RhcnQsIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzdGFydCA9IGk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHNlcXVlbmNlcztcclxufVxyXG5cclxuXHJcbmNvbnN0IG9wZXJhdG9yc0Zvck1hdGhpbmZvID0ge1xyXG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcclxuICAgIHJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2g6IFtcInNxcnRcIl0sXHJcbiAgICBib3RoOiBbXCIrXCIsIFwiLVwiLCBcIipcIl0sXHJcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxyXG4gICAgUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2g6IFtcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcclxuICAgIGRvdWJsZVJpZ2h0QnV0QnJhY2tldDogW1wiZnJhY1wiLCBcImJpbm9tXCIsXCIvXCJdXHJcbn07XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xyXG4gICAgZGVidWdJbmZvOiBzdHJpbmc9XCJcIjtcclxuICAgIHNvbHV0aW9uSW5mbzogYW55W109W107XHJcbiAgICBtYXRoSW5mbzogYW55W109W11cclxuICAgIGdyYXBoOiBzdHJpbmc9XCJcIjtcclxuICAgIG1hdGhTbmFwc2hvdHM6IE1hdGhHcm91cFtdPVtdXHJcbiAgICBhZGRHcmFwaEluZm8odmFsdWU6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obXNnOiBzdHJpbmcsIHZhbHVlOiBhbnkpe1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnLG51bGwsMSk6bXNnKStcIiA6IFwiKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlLG51bGwsMSk6dmFsdWUpKyBcIlxcbiBcIjtcclxuICAgIH1cclxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXM6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbkluZm8ucHVzaChtZXMpO1xyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiU29sdmVkXCIsbWVzKTtcclxuICAgIH1cclxuICAgIGFkZE1hdGhJbmZvKG1zZzogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gobXNnKVxyXG4gICAgfVxyXG4gICAgYWRkTWF0aFNuYXBzaG90KG1hdGg6IE1hdGhHcm91cCl7XHJcbiAgICAgICAgdGhpcy5tYXRoU25hcHNob3RzLnB1c2gobWF0aClcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoXHJcbiAgICAgICAgICAgIG1hdGgsXHJcbiAgICAgICAgICAgIChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yICYmIGl0ZW0uc29sdXRpb24gIT09IHVuZGVmaW5lZFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgaWYoIXJlc3VsdClyZXR1cm5cclxuXHJcbiAgICAgICAgY29uc3QgY3VzdG9tRm9ybWF0dGVyID0gKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xyXG4gICAgICAgICAgICBpZiAoY2hlY2sgaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiYgY2hlY2suc29sdXRpb24gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGB7XFxcXGNvbG9ye3JlZH0ke3N0cmluZ319YDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gc3RyaW5nXHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gobWF0aC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpKVxyXG4gICAgICAgIGNvbnNvbGUubG9nKHJlc3VsdC5pdGVtKVxyXG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gocmVzdWx0Lml0ZW0udG9TdHJpbmdTb2x1dGlvbigpKVxyXG4gICAgICAgIFxyXG4gICAgfVxyXG5cclxufVxyXG5cclxuLypcclxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XHJcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XHJcbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XHJcbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxyXG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxyXG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxyXG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcclxuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcclxuICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XHJcbn0qL1xyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiByZWFycmFuZ2VFcXVhdGlvbih0b2tlbnM6IGFueSx0b2tlblRvaXNvbGF0ZTogYW55KXtcclxuICAgIFxyXG59XHJcblxyXG5mdW5jdGlvbiBpc29sYXRlTXVsdGlwbGljYXRpb24odG9rZW5zOiBhbnksaXNvbGF0VG9rZW46IFRva2VuKXsvKlxyXG4gICAgY29uc3QgaW5kZXg9b3BlcmF0aW9uc09yZGVyKHRva2VucylcclxuICAgIGNvbnN0IElzb2xhdGVkPXRva2Vucy50b2tlbnMuZmluZCgodG9rZW46IGFueSwgaWR4OiBudW1iZXIpPT5pZHg8aW5kZXgpXHJcbiAgICBjb25zdCBmcmFjPWNyZWF0ZUZyYWModG9rZW5zLmxpc3Quc2xpY2UoaW5kZXggKyAxKSxuZXcgVG9rZW4oSXNvbGF0ZWQudmFsdWUpKVxyXG4gICAgSXNvbGF0ZWQudmFsdWU9MTtcclxuICAgIHRva2Vucy5pbnNlcnRUb2tlbnMoaW5kZXgrMSx0b2tlbnMudG9rZW5zLmxlbmd0aC1pbmRleCsxLGZyYWMpKi9cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRnJhYyhub21pbmF0b3I6IGFueSxkZW5vbWluYXRvcjogVG9rZW4pe1xyXG4gICAvLyByZXR1cm4gW25ldyBUb2tlbignZnJhYycpLG5ldyBUb2tlbignKCcpLG5vbWluYXRvcixuZXcgVG9rZW4oJyknKSxuZXcgVG9rZW4oJygnKSxkZW5vbWluYXRvcixuZXcgVG9rZW4oJyknKV1cclxufVxyXG4vKlxyXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zOiBhbnlbXSl7XHJcbiAgICBpZiAodG9rZW5zLmxlbmd0aDw9MSl7cmV0dXJuIHRva2Vuc31cclxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xyXG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUoKHRva2VuOiBhbnkpID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxyXG4gICAge1xyXG4gICAgICAgIGkrKztcclxuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xyXG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XHJcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxyXG5cclxuICAgICAgICBsZXQgY3VycmVudFRva2VuPXt0eXBlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgLCB2YWx1ZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YWx1ZSx2YXJpYWJsZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YXJpYWJsZSAscG93OiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnBvd31cclxuXHJcbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaTogYW55KSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogeyB0b2tlbjogeyB0eXBlOiBhbnk7IH07IH0pID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcclxuICAgICAgICAucmVkdWNlKChzdW06IG51bWJlciwgaXRlbTogeyBvcmlnaW5hbEluZGV4OiBudW1iZXI7IHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IG51bWJlcjsgfTsgfSkgPT4ge1xyXG4gICAgICAgIGxldCBtdWx0aXBsaWVyPSh0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0gJiYgdG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdLnZhbHVlID09PSBcIi1cIikgPyAtMSA6IDE7XHJcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcclxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxyXG4gICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xyXG4gICAgICAgIH0sIDApOyBcclxuICAgICAgICBcclxuICAgICAgICBuZXdUb2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgIC4uLmN1cnJlbnRUb2tlbixcclxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXHJcbiAgICAgICAgICAgIHRva2VuLnR5cGUgIT09IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSB8fCBcclxuICAgICAgICAgICAgKHRva2VuLnZhcmlhYmxlICYmIHRva2VuLnZhcmlhYmxlICE9PSBjdXJyZW50VG9rZW4udmFyaWFibGUpIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ld1Rva2VucztcclxufVxyXG4qL1xyXG4vKlxyXG5mdW5jdGlvbiByZWFycmFuZ2VGb3JJc29sYXRpb24odG9rZW5zOiBUb2tlbnMsIGlzb2xhdGlvbkdvYWw6IHsgdHlwZTogYW55OyB2YWx1ZTogYW55OyBvdmVydmlld1NpZGVPbmU/OiBNYXA8YW55LCBhbnk+OyBvdmVydmlld1NpZGVUd28/OiBNYXA8YW55LCBhbnk+OyB9KSB7XHJcbiAgICBpZiAodG9rZW5zLnRva2Vucy5sZW5ndGggPD0gMSkgcmV0dXJuIHRva2VucztcclxuXHJcbiAgICBjb25zdCBlcUluZGV4ID0gdG9rZW5zLnRva2Vucy5maW5kSW5kZXgoKHQ6IHsgdmFsdWU6IHN0cmluZzsgfSkgPT4gdC52YWx1ZSA9PT0gJ0VxdWFscycpO1xyXG4gICAgaWYgKGVxSW5kZXggPT09IC0xKSB0aHJvdyBuZXcgRXJyb3IoXCJObyAnRXF1YWxzJyBvcGVyYXRvciBmb3VuZCBpbiB0b2tlbnNcIik7XHJcblxyXG4gICAgY29uc3Qgc3dpdGNoRGlyZWN0aW9uID0gZmFsc2U7IC8vIEZ1dHVyZSBsb2dpYyB0byBkZXRlcm1pbmUgZGlyZWN0aW9uXHJcbiAgICBjb25zdCBpc29sYXRpb25Hb2FsSW5kaWNlcyA9IHRva2Vucy50b2tlbnNcclxuICAgICAgICAubWFwKCh0OiB7IHR5cGU6IGFueTsgdmFyaWFibGU6IGFueTsgfSwgaWR4OiBhbnkpID0+ICh0LnR5cGUgPT09IGlzb2xhdGlvbkdvYWwudHlwZSAmJiB0LnZhcmlhYmxlID09PSBpc29sYXRpb25Hb2FsLnZhbHVlID8gaWR4IDogbnVsbCkpXHJcbiAgICAgICAgLmZpbHRlcigoaWR4OiBudWxsfG51bWJlcikgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICBjb25zdCBvdGhlckluZGljZXMgPSB0b2tlbnMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgoXzogYW55LCBpZHg6IGFueSkgPT4gKCFpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpZHgpICYmIGlkeCAhPT0gZXFJbmRleCA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgLy8gQWRqdXN0IHNpZ25zXHJcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiB7IHZhbHVlOiBudW1iZXI7IH0sIGk6IG51bWJlcikgPT4ge1xyXG4gICAgICAgIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpID4gZXFJbmRleCA6IGkgPCBlcUluZGV4KSAmJiBvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHtcclxuICAgICAgICAgICAgdG9rZW4udmFsdWUgKj0gLTE7XHJcbiAgICAgICAgfSBlbHNlIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpIDwgZXFJbmRleCA6IGkgPiBlcUluZGV4KSAmJiBpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpKSkge1xyXG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTZXBhcmF0ZSBzaWRlc1xyXG4gICAgY29uc3Qgc2lkZTE6IGFueVtdID0gW107XHJcbiAgICBjb25zdCBzaWRlMjogYW55W10gPSBbXTtcclxuICAgIHRva2Vucy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSwgaTogYW55KSA9PiB7XHJcbiAgICAgICAgaWYgKGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMS5wdXNoKHRva2VuKTtcclxuICAgICAgICBpZiAob3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMi5wdXNoKHRva2VuKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRva2Vucy50b2tlbnMgPSBzd2l0Y2hEaXJlY3Rpb25cclxuICAgICAgICA/IFsuLi5zaWRlMiwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTFdXHJcbiAgICAgICAgOiBbLi4uc2lkZTEsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUyXTtcclxufVxyXG4qL1xyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xyXG4gICAgb3BlcmF0b3I6IHN0cmluZztcclxuICAgIGluZGV4OiBudW1iZXI7XHJcbiAgICBzdGFydDogbnVtYmVyO1xyXG4gICAgZW5kOiBudW1iZXI7XHJcbiAgICB0cmFuc2l0aW9uOiBudW1iZXI7XHJcbiAgICBzcGVjaWFsQ2hhcjogc3RyaW5nO1xyXG4gICAgXHJcbiAgICBncm91cHM6IE1hdGhHcm91cFtdO1xyXG4gICAgY29uc3RydWN0b3IodG9rZW5zOiBhbnlbXSwgaW5kZXg6IG51bWJlcil7XHJcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xyXG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgdGhpcy5zdGFydCA9IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgdGhpcy5lbmQgPSB0aGlzLmluZGV4O1xyXG4gICAgICAgIHRoaXMucG9zaXRpb24odG9rZW5zKVxyXG4gICAgfVxyXG4gICAgcG9zaXRpb24odG9rZW5zOiBhbnlbXSkge1xyXG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnNbdGhpcy5pbmRleF0udmFsdWU7XHJcbiAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMub3BlcmF0b3IpO1xyXG4gICAgICAgIGlmICghbWV0YWRhdGEpIHRocm93IG5ldyBFcnJvcihgT3BlcmF0b3IgJHt0aGlzLm9wZXJhdG9yfSBub3QgZm91bmQgaW4gbWV0YWRhdGFgKTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGJlZm9yZUluZGV4OiBNYXRoR3JvdXBbXSA9IFtdO1xyXG4gICAgICAgIGNvbnN0IGFmdGVySW5kZXg6ICBNYXRoR3JvdXBbXSA9IFtdO1xyXG4gICAgXHJcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsIHRydWUpLmZvckVhY2goKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5zdGFydCwgdHJ1ZSk7XHJcbiAgICAgICAgICAgIGJlZm9yZUluZGV4LnB1c2goaXRlbS5tYXRoR3JvdXApO1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0ID0gaXRlbS5sYXN0SXRlbU9mUHJldmlvdXM7XHJcbiAgICAgICAgfSk7XHJcbiAgICBcclxuICAgIFxyXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLCBmYWxzZSkuZm9yRWFjaCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmVuZCwgZmFsc2UpO1xyXG4gICAgICAgICAgICBhZnRlckluZGV4LnB1c2goaXRlbS5tYXRoR3JvdXApO1xyXG4gICAgICAgICAgICB0aGlzLmVuZCA9IGl0ZW0ubGFzdEl0ZW1PZlByZXZpb3VzO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuZ3JvdXBzID0gYmVmb3JlSW5kZXgucmV2ZXJzZSgpLmNvbmNhdChhZnRlckluZGV4KTtcclxuICAgIH1cclxuICAgIGFwcGx5UG9zaXRpb24odG9rZW5zOiBhbnlbXSwgaW5kZXg6ICBudW1iZXIsIGlzTGVmdDogYm9vbGVhbikge1xyXG4gICAgICAgIGxldCBicmVha0NoYXI9aW5kZXhcclxuICAgICAgICBsZXQgdGFyZ2V0OiBhbnk7XHJcbiAgICAgICAgY29uc3QgbW9kaWZpZWRJbmRleCA9ICBpbmRleCsoaXNMZWZ0Py0gMSA6ICAxKTtcclxuXHJcbiAgICAgICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpIHx8ICF0b2tlbnNbbW9kaWZpZWRJbmRleF0pIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYXQgYXBwbHlQb3NpdGlvbjogXFxcImluZGV4IHdhc24ndCB2YWxpZFxcXCIgaW5kZXg6IFwiK2luZGV4KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0b2tlbnNbbW9kaWZpZWRJbmRleF0gaW5zdGFuY2VvZiBQYXJlbikge1xyXG4gICAgICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gZmluZFBhcmVuSW5kZXgodG9rZW5zW21vZGlmaWVkSW5kZXhdLHRva2Vucyk7XHJcbiAgICAgICAgICAgIGJyZWFrQ2hhciA9ICBpc0xlZnQgPyBwYXJlbkluZGV4Lm9wZW4gOiBwYXJlbkluZGV4LmNsb3NlKzE7XHJcbiAgICAgICAgICAgIC8vIEluc3VyZSBwcm9wZXIgZm9ybWF0dGluZyByZW1vdmVkIGV2ZXJ5dGhpbmcgaW5jbHVkaW5nIHBhcmVudGhlc2VzXHJcbiAgICAgICAgICAgIHRhcmdldCA9IGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyh0b2tlbnMuc2xpY2UocGFyZW5JbmRleC5vcGVuLCBwYXJlbkluZGV4LmNsb3NlKzEpKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBicmVha0NoYXI9bW9kaWZpZWRJbmRleDtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKHRva2Vuc1ticmVha0NoYXJdKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGF0IGFwcGx5UG9zaXRpb246IGNvdWxkbid0IGZpbmQgdGFyZ2V0IHRva2VuIGZvciBkaXJlY3Rpb24gJHtpc0xlZnQ/J2xlZnQnOidyaWdodCd9IGFuZCBvcGVyYXRvclwiJHt0b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy9NYWtlIHN1cmUgd2UgZG9uJ3QgY3JlYXRlIGR1cGxpY2F0ZSBpbnRlcmxvY2tlZCBtYXRoIGdyb3Vwc1xyXG4gICAgICAgIGlmKHRhcmdldD8ubGVuZ3RoJiZ0YXJnZXQ/Lmxlbmd0aD09PTEmJnRhcmdldFswXWluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgdGFyZ2V0PXRhcmdldFswXVxyXG4gICAgICAgICAgICB0YXJnZXQudHJ5UmVtb3ZlVW5uZWNlc3NhcnlOZXN0ZWQoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIG1hdGhHcm91cDogbmV3IE1hdGhHcm91cCh0YXJnZXQpLFxyXG4gICAgICAgICAgICBsYXN0SXRlbU9mUHJldmlvdXM6IGJyZWFrQ2hhcixcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcclxuICAgIGlmIChvcGVyYXRvci5ncm91cE51bSE9PW9wZXJhdG9yLmdyb3Vwcy5sZW5ndGgpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbnVtYmVyIG9mIGdyb3VwcyBmb3Igb3BlcmF0b3IgJHtvcGVyYXRvci5vcGVyYXRvcn0gZXhwZWN0ZWQgJHtvcGVyYXRvci5ncm91cE51bX0gYnV0IGdvdCAke29wZXJhdG9yLmdyb3Vwcy5sZW5ndGh9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9wZXJhdG9yKG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3IpOiBib29sZWFuIHtcclxuICAgIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yKTsgXHJcbiAgICBmdW5jdGlvbiBnZXRPcGVyYWJsZVZhbHVlKGdyb3VwOiBNYXRoR3JvdXApOiBudW1iZXIgfCBudWxsIHtcclxuICAgICAgICBpZiAoIWdyb3VwfHwhZ3JvdXAuaXNPcGVyYWJsZSgpKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBjb25zdCB2YWx1ZSA9IGdyb3VwLmdldE9wZXJhYmxlVmFsdWUoKTtcclxuICAgICAgICByZXR1cm4gdmFsdWU/LmdldFZhbHVlKCkgPz8gbnVsbDtcclxuICAgIH1cclxuICAgIGNvbnN0IGdyb3VwMSA9IGdldE9wZXJhYmxlVmFsdWUob3BlcmF0b3IuZ3JvdXBzWzBdKTtcclxuICAgIGNvbnN0IGdyb3VwMiA9IGdldE9wZXJhYmxlVmFsdWUob3BlcmF0b3IuZ3JvdXBzWzFdKTtcclxuICAgIGlmIChncm91cDEgPT09IG51bGx8fChncm91cDI9PT1udWxsJiZvcGVyYXRvci5ncm91cE51bT4xKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgXHJcbiAgICBzd2l0Y2ggKG9wZXJhdG9yLm9wZXJhdG9yKSB7XHJcbiAgICAgICAgY2FzZSBcIlNpbmVcIjpcclxuICAgICAgICAgICAgb3BlcmF0b3Iuc29sdXRpb24gPSBuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4oTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyhncm91cDEpKSldKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIlNxdWFyZVJvb3RcIjpcclxuICAgICAgICAgICAgaWYgKGdyb3VwMSA8IDApIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBjYWxjdWxhdGUgdGhlIHNxdWFyZSByb290IG9mIGEgbmVnYXRpdmUgbnVtYmVyLlwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihNYXRoLnBvdyhncm91cDEsMC41KSldKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIkZyYWN0aW9uXCI6IHtcclxuICAgICAgICAgICAgaWYgKGdyb3VwMiA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGl2aXNpb24gYnkgemVybyBpcyBub3QgYWxsb3dlZFwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihncm91cDEgLyBncm91cDIhKV0pO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgY2FzZSBcIlBvd2VyXCI6IHtcclxuICAgICAgICAgICAgb3BlcmF0b3Iuc29sdXRpb24gPSBuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4oTWF0aC5wb3coZ3JvdXAxLGdyb3VwMiEpKV0pO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgY2FzZSBcIk11bHRpcGxpY2F0aW9uXCI6IHtcclxuICAgICAgICAgICAgb3BlcmF0b3Iuc29sdXRpb24gPSBuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4oZ3JvdXAxICogZ3JvdXAyISldKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgICAgIGBVbmtub3duIG9wZXJhdG9yIHR5cGUgaW4gcGFyc2VPcGVyYXRvcjogJHtvcGVyYXRvci5vcGVyYXRvcn1gXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnM6IGFueVtdKSB7XHJcbiAgICBmdW5jdGlvbiBmaW5kT3BlcmF0b3JJbmRleChiZWdpbjogbnVtYmVyLCBlbmQ6IG51bWJlciwgdG9rZW5zOiBhbnksIHJlZ2V4PzogYW55KSB7XHJcbiAgICAgICAgY29uc3QgaW5kZXg9dG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogYW55OyB9KSA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xyXG4gICAgICAgIHJldHVybiBpbmRleD4tMT9pbmRleCtiZWdpbjpudWxsO1xyXG4gICAgfVxyXG4gICAgY29uc3QgeyBiZWdpbiwgZW5kIH0gPSBmaW5kRGVlcGVzdFBhcmVudGhlc2VzU2NvcGUodG9rZW5zKTtcclxuICAgIGxldCBwcmlvcml0eT1udWxsXHJcbiAgICBmb3IgKGxldCBpPTE7aTw9NjtpKyspe1xyXG4gICAgICAgIHByaW9yaXR5ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eShpLHRydWUpKTtcclxuICAgICAgICBpZihwcmlvcml0eSE9PW51bGwpYnJlYWs7XHJcbiAgICB9XHJcbiAgICByZXR1cm4ge3N0YXJ0OiBiZWdpbixlbmQ6IGVuZCxzcGVjaWZpY09wZXJhdG9ySW5kZXg6IHByaW9yaXR5fVxyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhQcmFpc2Vye1xyXG4gICAgaW5wdXQ9XCJcIjtcclxuICAgIHRva2VuczogTWF0aEdyb3VwO1xyXG4gICAgc29sdXRpb246IGFueTtcclxuICAgIG1hdGhJbmZvPW5ldyBNYXRoSW5mbygpO1xyXG4gICAgY29uc3RydWN0b3IoaW5wdXQ6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy5pbnB1dD1pbnB1dDtcclxuICAgICAgICB0aGlzLnByb2Nlc3NJbnB1dCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHRva2Vucz1uZXcgQmFzaWNNYXRoSmF4VG9rZW5zKHRoaXMuaW5wdXQpO1xyXG4gICAgICAgIGNvbnN0IGJhc2ljVG9rZW5zPXRva2Vucy50b2tlbnNcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmNvbnZlcnRCYXNpY01hdGhKYXhUb2tlbmFUb01hdGhHcm91cChiYXNpY1Rva2VucylcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcImNvbnZlcnRCYXNpY01hdGhKYXhUb2tlbmFUb01hdGhHcm91cFwiLHRoaXMudG9rZW5zKVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy50b2tlbnMudG9TdHJpbmcoKVxyXG4gICAgICAgIHRoaXMuY29udHJvbGxlcigpO1xyXG4gICAgICAgIHRoaXMuc29sdXRpb249dGhpcy50b2tlbnNcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcInNvbHV0aW9uXCIsdGhpcy5zb2x1dGlvbik7XHJcbiAgICB9XHJcblxyXG4gICAgXHJcbiAgICBwYXJzZSh0b2tlbnM6IE1hdGhHcm91cCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9ySW5kZXg9dG9rZW5zLmdldEl0ZW1zKCkuZmluZEluZGV4KFxyXG4gICAgICAgICAgICB0ID0+IHQgaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiYgdC5pc09wZXJhYmxlXHJcbiAgICAgICAgKSA7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9ySW5kZXg8MCkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gdG9rZW5zLmdldEl0ZW1zKClbb3BlcmF0b3JJbmRleF0gYXMgTWF0aEpheE9wZXJhdG9yXHJcbiAgICBcclxuICAgICAgICBcclxuICAgICAgICBvcGVyYXRvci5ncm91cHMuZm9yRWFjaChncm91cCA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGFyc2UoZ3JvdXApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHBhcnNlT3BlcmF0b3Iob3BlcmF0b3IpXHJcbiAgICAgICAgaWYgKCFvcGVyYXRvci5zb2x1dGlvbikge1xyXG4gICAgICAgICAgICBvcGVyYXRvci5pc09wZXJhYmxlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoU25hcHNob3QodGhpcy50b2tlbnMuY2xvbmUoKSlcclxuICAgICAgICB0b2tlbnMuc2V0SXRlbShvcGVyYXRvci5zb2x1dGlvbixvcGVyYXRvckluZGV4KTsgXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnRyb2xsZXIoKTogYW55e1xyXG4gICAgICAgIHRoaXMucGFyc2UodGhpcy50b2tlbnMpXHJcblxyXG4gICAgICAgIHRoaXMudG9rZW5zLnJlbW92ZU5lc3RlZCgpXHJcbiAgICAgICAgdGhpcy50b2tlbnMuY29tYmluaW5nTGlrZVRlcm1zKClcclxuXHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5jb21iaW5pbmdMaWtlVGVybXMoKVxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgdGhpcy50b2tlbnMudG9rZW5zLmNvbWJpbmluZ0xpa2VUZXJtcygpXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRva2Vucy50b2tlbnMuaXRlbXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHRoaXMudG9rZW5zLnRva2Vucy5pdGVtc1tpXTtcclxuICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCEoaXRlbSBpbnN0YW5jZW9mIG1hdGhKYXhPcGVyYXRvcikpIGNvbnRpbnVlO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy50b2tlbnMuaXRlbXNbaV0gPSBpdGVtLmFkZFNvbHV0aW9uKCk7XHJcbiAgICAgICAgfSAgICAgICAgXHJcbiAgICAgICAgKi9cclxuICAgICAgICAvL3RoaXMudG9rZW5zLnRva2Vucy5hZGRTb2x1dGlvbigpXHJcbiAgICAgICAgLy9yZXR1cm4gdGhpcy50b2tlbnMudG9rZW5zO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgdGhpcy5pKys7XHJcbiAgICAgICAgaWYodGhpcy5pPjEwKXtyZXR1cm4gdGhpcy5maW5hbFJldHVybigpfVxyXG5cclxuICAgICAgICB0aGlzLmdldFJlZHlmb3JOZXdSb25kKCk7XHJcbiAgICAgICAgLy9jb25zdCBvdmVydmlldz10aGlzLnRva2Vucy5nZXRPdmVydmlldygpXHJcbiAgICAgICAgY29uc3QgcHJhaXNpbmdNZXRob2Q9bmV3IFByYWlzaW5nTWV0aG9kKHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICBpZiAocHJhaXNpbmdNZXRob2QuaXNUaGVyZU9wZXJhdG9yT3RoZXJUaGFuRXF1YWxzKCkpe1xyXG4gICAgICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUGFyc2VkIGV4cHJlc3Npb25cIiwgSlNPTi5zdHJpbmdpZnkocG9zaXRpb24sIG51bGwsIDEpKTtcclxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uID09PSBudWxsJiZ0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjEpe1xyXG4gICAgICAgICAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyhcInBhcnNlKHRva2VucylcIixwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGhlICoqKipcIlxyXG4gICAgICAgICAgICAvLyByZXR1cm4gc29sdXRpb24odG9rZW5zKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAocG9zaXRpb24uY2hlY2tGcmFjKCl8fHBvc2l0aW9uLmNoZWNrTXVsdGlTdGVwKCkpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGV4cGFuZEV4cHJlc3Npb24odGhpcy50b2tlbnMscG9zaXRpb24pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbkluZm8odGhpcy50b2tlbnMucmVjb25zdHJ1Y3QodGhpcy50b2tlbnMudG9rZW5zKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMudXNlUGFyc2UocG9zaXRpb24pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKHByYWlzaW5nTWV0aG9kLmlzTXVsdGlwbGljYXRpb25Jc29sYXRlKCkpe1xyXG4gICAgICAgICAgICB0aGlzLnVzZUlzb2xhdChwcmFpc2luZ01ldGhvZClcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgdG9Jc29sYXRlPXByYWlzaW5nTWV0aG9kLmlzQW55dGhpbmdUb0lzb2xhdGUoKVxyXG4gICAgICAgIGlmICh0b0lzb2xhdGUpe1xyXG4gICAgICAgICAgICByZWFycmFuZ2VGb3JJc29sYXRpb24odGhpcy50b2tlbnMsdG9Jc29sYXRlKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcclxuICAgICAgICB9ICAgXHJcbiAgICAgICAgLy9pZiAoc29sdmVkID09PSBudWxsfHx0eXBlb2Ygc29sdmVkPT09XCJzdHJpbmdcIikge3JldHVybiBzb2x2ZWQ7IH1cclxuICAgICAgICByZXR1cm4gdGhpcy5maW5hbFJldHVybigpLy90aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjE/dGhpcy5jb250cm9sbGVyKCk6dGhpcy5maW5hbFJldHVybigpOyovXHJcbiAgICB9XHJcbiAgICBzb2x1dGlvblRvU3RyaW5nKCl7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLnRva2Vucy50b1N0cmluZygpKXx8XCJcIlxyXG4gICAgfVxyXG5cclxuICAgIHByYWlzaW5nTWV0aG9kKCl7XHJcbiAgICAgICAgLypcclxuICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGUpPT50aGlzLnRva2Vucy50b2tlbnMuZmlsdGVyKHRva2VuID0+IHRva2VuLnR5cGUgPT09IHR5cGUpO1xyXG4gICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudXNlUXVhZHJhdGljKClcclxuICAgICAgICByZXR1cm4gdGhpcy51c2VJc29sYXQoKTsqL1xyXG4gICAgfVxyXG5cclxuICAgIHVzZUlzb2xhdChwcmFpc2luZ01ldGhvZDogUHJhaXNpbmdNZXRob2Qpe1xyXG4gICAgICAgIC8vaXNvbGF0ZU11bHRpcGxpY2F0aW9uKHRoaXMudG9rZW5zLG5ldyBUb2tlbihwcmFpc2luZ01ldGhvZC52YXJpYWJsZXNbMF0pKVxyXG4gICAgICAgIC8vcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMoKVxyXG4gICAgICAgIC8vVXNlIHBvc3Nlc3Npb25cclxuICAgIH1cclxuXHJcbiAgICB1c2VRdWFkcmF0aWMoKXsvKlxyXG4gICAgICAgIHRoaXMudG9rZW5zLnRva2Vucz1zaW1wbGlmaXkodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGU6IHN0cmluZyk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzaW1wbGlmaXkodG9rZW5zKVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0/LnZhbHVlIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICBudW1iZXJJbmRleFswXT8udmFsdWUgKiAtMXwgMCxcclxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0qL1xyXG4gICAgfVxyXG4gICAgYWRkRGVidWdJbmZvKG1lczogc3RyaW5nLHZhbHVlOiBhbnkpe1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSlcclxuICAgIH1cclxuICAgIHByb2Nlc3NJbnB1dCgpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy5pbnB1dFxyXG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXHJcbiAgICAgICAgLnJlcGxhY2UoL3svZywgXCIoXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXHJcbiAgICAgICAgLy8ucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XHJcbiAgICB9XHJcbiAgICBmaW5hbFJldHVybigpe1xyXG4gICAgICAgLy8gcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgIH1cclxuICAgIGRlZmluZUdyb3Vwc0FuZE9wZXJhdG9ycyh0b2tlbnM6IEFycmF5PGFueT4pOmJvb2xlYW58dGhpc3tcclxuICAgICAgICBjb25zdCByYW5nZT1vcGVyYXRpb25zT3JkZXIodG9rZW5zKTtcclxuICAgICAgICBpZihyYW5nZS5zdGFydD09PW51bGx8fHJhbmdlLmVuZD09PW51bGwpcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGlmKHJhbmdlLnNwZWNpZmljT3BlcmF0b3JJbmRleD09PW51bGwmJnJhbmdlLnN0YXJ0PT09MCYmcmFuZ2UuZW5kPT09dG9rZW5zLmxlbmd0aClyZXR1cm4gdHJ1ZTtcclxuICAgICAgICBsZXQgbmV3TWF0aEdyb3VwU3VjY2Vzcz1udWxsXHJcbiAgICAgICAgaWYgKHJhbmdlLnNwZWNpZmljT3BlcmF0b3JJbmRleCE9PW51bGwpXHJcbiAgICAgICAgICAgIG5ld01hdGhHcm91cFN1Y2Nlc3M9dGhpcy5jcmVhdGVPcGVyYXRvckl0ZW1Gcm9tVG9rZW5zKHRva2VucyxyYW5nZS5zcGVjaWZpY09wZXJhdG9ySW5kZXgpXHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIG5ld01hdGhHcm91cFN1Y2Nlc3M9dGhpcy5jcmVhdGVNYXRoR3JvdXBJbnNlcnRGcm9tVG9rZW5zKHRva2VucyxyYW5nZS5zdGFydCxyYW5nZS5lbmQpXHJcbiAgICAgICAgaWYoIW5ld01hdGhHcm91cFN1Y2Nlc3MpcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRlZmluZUdyb3Vwc0FuZE9wZXJhdG9ycyh0b2tlbnMpO1xyXG4gICAgfVxyXG4gICAgY29udmVydEJhc2ljTWF0aEpheFRva2VuYVRvTWF0aEdyb3VwKGJhc2ljVG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj4pOnZvaWR7XHJcbiAgICAgICAgY29uc3Qgc3VjY2Vzcz10aGlzLmRlZmluZUdyb3Vwc0FuZE9wZXJhdG9ycyhiYXNpY1Rva2VucylcclxuICAgICAgICBpZighc3VjY2VzcylyZXR1cm5cclxuICAgICAgICB0aGlzLnRva2Vucz1uZXcgTWF0aEdyb3VwKGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhiYXNpY1Rva2VucykpXHJcbiAgICB9XHJcbiAgICBjcmVhdGVNYXRoR3JvdXBJbnNlcnRGcm9tVG9rZW5zKHRva2VuczogQXJyYXk8YW55PixzdGFydDogbnVtYmVyLGVuZDogbnVtYmVyKTpib29sZWFue1xyXG4gICAgICAgIGNvbnN0IG5ld01hdGhHcm91cD1uZXcgTWF0aEdyb3VwKGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyh0b2tlbnMuc2xpY2Uoc3RhcnQsZW5kKzEpKSk7XHJcbiAgICAgICAgdG9rZW5zLnNwbGljZShzdGFydCwoZW5kLXN0YXJ0KSsxLG5ld01hdGhHcm91cCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxuICAgIGNyZWF0ZU9wZXJhdG9ySXRlbUZyb21Ub2tlbnModG9rZW5zOiBBcnJheTxhbnk+LGluZGV4OiBudW1iZXIpOmJvb2xlYW57XHJcbiAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRva2Vuc1tpbmRleF0udmFsdWUpO1xyXG4gICAgICAgIGlmKCFtZXRhZGF0YSl0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dG9rZW5zW2luZGV4XS52YWx1ZX0gbm90IGZvdW5kIGluIG1ldGFkYXRhYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcG9zaXRpb249bmV3IFBvc2l0aW9uKHRva2VucyxpbmRleClcclxuICAgICAgICBjb25zdCBjPWRlZXBDbG9uZSh0b2tlbnMpXHJcbiAgICAgICAgY29uc3QgbmV3T3BlcmF0b3I9bmV3IE1hdGhKYXhPcGVyYXRvcihwb3NpdGlvbi5vcGVyYXRvcixtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9ucyxwb3NpdGlvbi5ncm91cHMsKVxyXG4gICAgICAgIHRva2Vucy5zcGxpY2UocG9zaXRpb24uc3RhcnQsKHBvc2l0aW9uLmVuZC1wb3NpdGlvbi5zdGFydCkrMSxuZXdPcGVyYXRvcik7XHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxufVxyXG5mdW5jdGlvbiBkZWVwQ2xvbmUoaXRlbXM6IGFueVtdKSB7XHJcbiAgICBsZXQgY2xvbmU6IGFueVtdID0gW107XHJcbiAgICBpdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgIGNsb25lLnB1c2goaXRlbSBpbnN0YW5jZW9mIEFycmF5ID8gZGVlcENsb25lKGl0ZW0pIDogaXRlbS5jbG9uZSgpKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIGNsb25lO1xyXG59XHJcblxyXG5jbGFzcyBtYXRoVmFyaWFibGVze1xyXG5cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycjogYW55KSB7XHJcbiAgICBsZXQgcmVzdWx0ID0gW107XHJcbiAgICBsZXQgc3RhY2sgPSBBcnJheS5pc0FycmF5KGFycikgPyBbLi4uYXJyXSA6IFthcnJdO1xyXG5cclxuICAgIHdoaWxlIChzdGFjay5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCBuZXh0ID0gc3RhY2sucG9wKCk7XHJcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobmV4dCkpIHtcclxuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5uZXh0KTsgXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2gobmV4dCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdC5yZXZlcnNlKCk7XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgUHJhaXNpbmdNZXRob2R7LypcclxuICAgIHRva2Vuc1xyXG4gICAgb3ZlcnZpZXc6IGFueTtcclxuICAgIHZhcmlhYmxlczogU2V0PHN0cmluZz47XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM6IGFueSl7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zXHJcbiAgICAgICAgdGhpcy5vdmVydmlldz10aGlzLmdldE92ZXJ2aWV3KClcclxuICAgICAgICB0aGlzLmFzc2lnblZhcmlhYmxlcygpXHJcbiAgICB9XHJcbiAgICBpc1ZhcldpdGhWYWx1ZUJpZ2dlclRoYW5PbmUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuc29tZSgodDogYW55KT0+IHQudHlwZT09PSd2YXJpYWJsZScmJnQudmFsdWU+MSlcclxuICAgIH1cclxuXHJcbiAgICBpc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhhc2VWYXJpYWJsZSgpJiZ0aGlzLmlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpJiZ0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKClcclxuICAgIH1cclxuICAgIGlzSXNvbGF0ZSgpe1xyXG4gICAgICAgIC8vcmV0dXJuIHRoaXMuXHJcbiAgICB9XHJcblxyXG4gICAgaXNBbnl0aGluZ1RvSXNvbGF0ZSgpe1xyXG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzLmxlbmd0aD4xKXRocm93IG5ldyBFcnJvcihcInR3byB2YXIgZXEgYXJlbnQgc2Fwb3J0ZWQgeWV0XCIpXHJcbiAgICAgICAgaWYoIXRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlyZXR1cm47XHJcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLmVxdWFsc0luZGV4SWZBbnkoKTtcclxuICAgICAgICBpZighZXFJbmRleCl7cmV0dXJufTtcclxuICAgICAgICBjb25zdCBiZWZvciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoMCxlcUluZGV4KSlcclxuICAgICAgICBjb25zdCBhZnRlciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoZXFJbmRleCsxKSlcclxuICAgICAgICBjb25zdCB3aGF0VG9Jc29sYXQgPXRoaXMud2hhdFRvSXNvbGF0KCk7XHJcbiAgICAgICAgaWYgKCghYmVmb3J8fCFhZnRlcil8fCF3aGF0VG9Jc29sYXR8fChiZWZvcj8uc2l6ZTwyJiZhZnRlcj8uc2l6ZTwyKSlyZXR1cm47XHJcbiAgICAgICAgcmV0dXJuIHtvdmVydmlld1NpZGVPbmU6IGJlZm9yLG92ZXJ2aWV3U2lkZVR3bzogYWZ0ZXIsLi4ud2hhdFRvSXNvbGF0fVxyXG4gICAgfS8qXHJcbiAgICBob3dUb0lzb2xhdGUob3ZlcnZpZXdTaWRlT25lLG92ZXJ2aWV3U2lkZVR3byxpc29sYXRpb25Hb29sKXtcclxuICAgICAgICBjb25zdCBpc29sYXRpb25UeXBlPWlzb2xhdGlvbkdvb2wuc3BsdCgnOicpO1xyXG4gICAgICAgIC8vaWYgKCl7fVxyXG4gICAgfVxyXG4gICAgd2hhdFRvSXNvbGF0KCl7XHJcbiAgICAgICAgLy8gaSBuZWVkIHRvIGFkZCBwb3dzIGFmdGVyXHJcbiAgICAgICAgLy8gZm9yIGtub3cgaW0gZ29pbmcgb24gdGhlIG9zaG9tc2hpbiB0aGF0IHRociBpcyBvbmx5IG9uZSB2YXJcclxuICAgICAgICBpZih0aGlzLnZhcmlhYmxlcz8ubGVuZ3RoPDEpcmV0dXJuO1xyXG5cclxuICAgICAgICByZXR1cm4ge3R5cGU6ICd2YXJpYWJsZScsdmFsdWU6IHRoaXMudmFyaWFibGVzWzBdfVxyXG4gICAgfS8qXHJcbiAgICBpc092ZXJ2aWV3VG9pc29sYXQob3ZlcnZpZXcpe1xyXG4gICAgfVxyXG4gICAgaXNJbWJhbGFuY2Uob3ZlcnZpZXc6IHsgc2l6ZTogbnVtYmVyOyB9KXtcclxuICAgICAgICBvdmVydmlldy5zaXplPjFcclxuICAgIH1cclxuICAgIGVxdWFsc0luZGV4SWZBbnkoKXtcclxuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMudG9rZW5zLm1hcCgodDogeyB2YWx1ZTogc3RyaW5nOyB9LGlkeDogYW55KT0+dC52YWx1ZT09PSdFcXVhbHMnP2lkeDpudWxsKS5maWx0ZXIoKG06IG51bGwpPT5tIT09bnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIGVxSW5kZXhbMF07XHJcbiAgICB9XHJcbiAgICBpc1F1YWRyYXRpYygpe1xyXG5cclxuICAgIH1cclxuICAgIGlzRmluYWxSZXR1cm4oKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMubGVuZ3RoPDJ8fCh0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGFzc2lnblZhcmlhYmxlcygpe1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzPVtdXHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5vdmVydmlldy5lbnRyaWVzKCkpe1xyXG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKCd2YXJpYWJsZTonKSYmIXRoaXMudmFyaWFibGVzLmluY2x1ZGVzKHZhbHVlLnZhcmlhYmxlKSl7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZhcmlhYmxlcy5wdXNoKHZhbHVlLnZhcmlhYmxlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGhhc2VWYXJpYWJsZSgpe3JldHVybiB0aGlzLnZhcmlhYmxlcz8ubGVuZ3RoPjB9XHJcblxyXG4gICAgaXNUaGVyZU9wZXJhdG9yT3RoZXJUaGFuRXF1YWxzKCl7XHJcbiAgICAgICAgY29uc3QgZmlsdGVyPXRoaXMuZmlsdGVyQnlUeXBlKCdvcGVyYXRvcicsJ0VxdWFscycpXHJcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubm9NYXRjaD4wXHJcbiAgICB9XHJcbiAgICBpc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpe1xyXG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxyXG4gICAgICAgIHJldHVybiAgZmlsdGVyLm1hdGNoPT09MSYmZmlsdGVyLm5vTWF0Y2g9PT0wXHJcbiAgICB9XHJcblxyXG4gICAgZmlsdGVyQnlUeXBlKHR5cGVLZXk6IHN0cmluZywgdGFyZ2V0VmFsdWU6IHN0cmluZyl7XHJcbiAgICAgICAgbGV0IG1hdGNoPTAsIG5vTWF0Y2g9MFxyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgodHlwZUtleSkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IHR5cGVLZXkrJzonK3RhcmdldFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2grKztcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm9NYXRjaCsrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IG1hdGNoOiBtYXRjaCwgbm9NYXRjaDogbm9NYXRjaCB9O1xyXG4gICAgfVxyXG4gICAgZ2V0T3ZlcnZpZXcodG9rZW5zPzogYW55W10gKSB7XHJcbiAgICAgICAgaWYoIXRva2Vucyl0b2tlbnM9dGhpcy50b2tlbnNcclxuICAgICAgICBpZighdG9rZW5zKXJldHVybjtcclxuICAgICAgICBjb25zdCBvdmVydmlldyA9IG5ldyBNYXAoKTtcclxuICAgICAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XHJcbiAgICAgICAgICAgIC8vaWYgKCF0b2tlbi5pc1ZhbHVlVG9rZW4oKSkge3JldHVybjt9XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRva2VuLmdldEZ1bGxUb2tlbklEKClcclxuICAgICAgICAgICAgLy9FcXVhbHNcclxuICAgICAgICAgICAgaWYgKCFvdmVydmlldy5oYXMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZW50cnkgPSB7IFxyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLnR5cGUsIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiAwICxcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZTogdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09ICd2YXJpYWJsZScpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbnRyeS52YXJpYWJsZSA9IHRva2VuLnZhcmlhYmxlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgICAgICBvdmVydmlldy5zZXQoa2V5LCBlbnRyeSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgb3ZlcnZpZXcuZ2V0KGtleSkuY291bnQrKztcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gb3ZlcnZpZXcvL0FycmF5LmZyb20ob3ZlcnZpZXcudmFsdWVzKCkpO1xyXG4gICAgfSovXHJcbn1cclxuXHJcbmNsYXNzIE9wZXJhdG9ye1xyXG5cclxufVxyXG5cclxuY2xhc3MgTW9kaWZpZXJ7XHJcblxyXG59Il19