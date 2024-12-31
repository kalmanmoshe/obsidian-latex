import { degreesToRadians } from "./mathUtilities";
import { findParenIndex, Paren, findDeepestParenthesesScope } from "../utils/tokenUtensils";
import { getMathJaxOperatorsByPriority, getValuesWithKeysBySide, searchMathJaxOperators } from "../utils/dataManager";
import { MathGroup, MathJaxOperator, Token, BasicMathJaxTokens, ensureAcceptableFormatForMathGroupItems } from "./mathJaxTokens";
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
    addMathInfo(tokens) {
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
        console.log(this.start === this.index);
        if (this.start === this.index)
            this.start += 2;
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
        if (!group.isOperable())
            return null;
        const value = group.getOperableValue();
        return value?.value ?? null;
    }
    const group1 = getOperableValue(operator.groups[0]);
    const group2 = getOperableValue(operator.groups[1]);
    if (group1 === null || group2 === null)
        return false;
    switch (operator.operator) {
        case "Sin":
            operator.solution = new MathGroup([new Token(Math.sin(degreesToRadians(group1)))]);
            break;
        case "Square root":
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
        /*
        this.input=this.tokens.toString()
        console.log('this.tokens',this.tokens)
        this.controller();
        this.solution=this.tokens
        this.addDebugInfo("solution",this.solution)*/
    }
    parse(tokens) {
        const operator = tokens.getItems().find(t => t instanceof MathJaxOperator && t.isOperable);
        if (!operator)
            return;
        operator.groups.forEach(group => {
            this.parse(group);
        });
        parseOperator(operator);
        if (!operator.solution) {
            operator.isOperable = false;
            return;
        }
        // Replace tokens with the solution
        tokens.setItems(operator.solution.getItems());
    }
    controller() {
        // The expression needs to be wrapped N a operator based on praising method Maybe not decided on it yet.
        //const whatebver=
        this.parse(this.tokens);
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
        isolateMultiplication(this.tokens, new Token(praisingMethod.variables[0]));
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
            newMathGroupSuccess = this.createOperatorItemFromTokens(tokens, range);
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
    createOperatorItemFromTokens(tokens, range) {
        const index = range.specificOperatorIndex;
        const metadata = searchMathJaxOperators(tokens[index].value);
        if (!metadata)
            throw new Error(`Operator ${tokens[index].value} not found in metadata`);
        const position = new Position(tokens, index);
        const c = deepClone(tokens);
        const newOperator = new MathJaxOperator(position.operator, metadata.associativity.numPositions, position.groups);
        console.warn(c.splice(position.start, (position.end - position.start) + 1, newOperator));
        console.log('position', c);
        tokens.splice(range.start, (range.end - range.start) + 1, newOperator);
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
    tokens;
    overview;
    variables;
    constructor(tokens) {
        this.tokens = tokens;
        this.overview = this.getOverview();
        this.assignVariables();
    }
    isVarWithValueBiggerThanOne() {
        return this.tokens.some((t) => t.type === 'variable' && t.value > 1);
    }
    isMultiplicationIsolate() {
        return this.haseVariable() && this.isVarWithValueBiggerThanOne() && this.isEqualsTheOnlyOperator();
    }
    isIsolate() {
        //return this.
    }
    isAnythingToIsolate() {
        if (this.variables.length > 1)
            throw new Error("two var eq arent saported yet");
        if (!this.isEqualsTheOnlyOperator())
            return;
        const eqIndex = this.equalsIndexIfAny();
        if (!eqIndex) {
            return;
        }
        ;
        const befor = this.getOverview(this.tokens.slice(0, eqIndex));
        const after = this.getOverview(this.tokens.slice(eqIndex + 1));
        const whatToIsolat = this.whatToIsolat();
        if ((!befor || !after) || !whatToIsolat || (befor?.size < 2 && after?.size < 2))
            return;
        return { overviewSideOne: befor, overviewSideTwo: after, ...whatToIsolat };
    } /*
    howToIsolate(overviewSideOne,overviewSideTwo,isolationGool){
        const isolationType=isolationGool.splt(':');
        //if (){}
    }*/
    whatToIsolat() {
        // i need to add pows after
        // for know im going on the oshomshin that thr is only one var
        if (this.variables?.length < 1)
            return;
        return { type: 'variable', value: this.variables[0] };
    } /*
    isOverviewToisolat(overview){
    }*/
    isImbalance(overview) {
        overview.size > 1;
    }
    equalsIndexIfAny() {
        const eqIndex = this.tokens.map((t, idx) => t.value === 'Equals' ? idx : null).filter((m) => m !== null);
        return eqIndex[0];
    }
    isQuadratic() {
    }
    isFinalReturn() {
        return this.tokens.length < 2 || (this.isEqualsTheOnlyOperator());
    }
    assignVariables() {
        this.variables = [];
        for (const [key, value] of this.overview.entries()) {
            if (key?.startsWith('variable:') && !this.variables.includes(value.variable)) {
                this.variables.push(value.variable);
            }
        }
    }
    haseVariable() { return this.variables?.length > 0; }
    isThereOperatorOtherThanEquals() {
        const filter = this.filterByType('operator', 'Equals');
        return filter.noMatch > 0;
    }
    isEqualsTheOnlyOperator() {
        const filter = this.filterByType('operator', 'Equals');
        return filter.match === 1 && filter.noMatch === 0;
    }
    filterByType(typeKey, targetValue) {
        let match = 0, noMatch = 0;
        for (const [key, value] of this.overview.entries()) {
            if (key?.startsWith(typeKey)) {
                if (key === typeKey + ':' + targetValue) {
                    match++;
                }
                else {
                    noMatch++;
                }
            }
        }
        return { match: match, noMatch: noMatch };
    }
    getOverview(tokens) {
        if (!tokens)
            tokens = this.tokens;
        if (!tokens)
            return;
        const overview = new Map();
        tokens.forEach(token => {
            //if (!token.isValueToken()) {return;}
            const key = token.getFullTokenID();
            //Equals
            if (!overview.has(key)) {
                const entry = {
                    type: token.type,
                    count: 0,
                    variable: undefined
                };
                if (token.type === 'variable') {
                    entry.variable = token.variable;
                }
                overview.set(key, entry);
            }
            overview.get(key).count++;
        });
        return overview; //Array.from(overview.values());
    }
}
class Operator {
}
class Modifier {
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL21hdGhQYXJzZXIvdGVtcENvZGVSdW5uZXJGaWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBdUMsZ0JBQWdCLEVBQXNDLE1BQU0saUJBQWlCLENBQUM7QUFJNUgsT0FBTyxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQTZCLDJCQUEyQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDdkgsT0FBTyxFQUEyQiw2QkFBNkIsRUFBK0IsdUJBQXVCLEVBQTBELHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDcE8sT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFxQix1Q0FBdUMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBR3BKLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFVO0lBQy9DLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNyQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFD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LEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQTtRQUM3QixJQUFHLENBQUMsTUFBTTtZQUFDLE9BQU87UUFDbEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUMzQixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ25CLHNDQUFzQztZQUN0QyxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUE7WUFDbEMsUUFBUTtZQUNSLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sS0FBSyxHQUFHO29CQUNWLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtvQkFDaEIsS0FBSyxFQUFFLENBQUM7b0JBQ1IsUUFBUSxFQUFFLFNBQVM7aUJBQ3RCLENBQUM7Z0JBQ0YsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO29CQUM1QixLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0IsQ0FBQztZQUNELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFFBQVEsQ0FBQSxDQUFBLGdDQUFnQztJQUNuRCxDQUFDO0NBQ0o7QUFFRCxNQUFNLFFBQVE7Q0FFYjtBQUVELE1BQU0sUUFBUTtDQUViIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuLi9pbVZlcnlMYXp5XCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgQXNzb2NpYXRpdml0eSB9IGZyb20gXCJzcmMvdXRpbHMvc3RhdGljRGF0YVwiO1xyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgaXNPcGVuUGFyZW4sIGZpbmREZWVwZXN0UGFyZW50aGVzZXNTY29wZSB9IGZyb20gXCIuLi91dGlscy90b2tlblV0ZW5zaWxzXCI7XHJcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZSwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgaXNPcGVyYXRvcldpdGhBc3NvY2lhdGl2aXR5LCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzIH0gZnJvbSBcIi4uL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IE1hdGhHcm91cCwgTWF0aEpheE9wZXJhdG9yLCBUb2tlbiwgQmFzaWNNYXRoSmF4VG9rZW5zLCBCYXNpY01hdGhKYXhUb2tlbiwgZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zIH0gZnJvbSBcIi4vbWF0aEpheFRva2Vuc1wiO1xyXG5pbXBvcnQgeyBzdGFydCB9IGZyb20gXCJyZXBsXCI7XHJcbmltcG9ydCB7IGdyb3VwIH0gZnJvbSBcImNvbnNvbGVcIjtcclxuY29uc3QgZ3JlZWtMZXR0ZXJzID0gW1xyXG4gICAgJ0FscGhhJywnYWxwaGEnLCAnQmV0YScsICdHYW1tYScsICdEZWx0YScsICdFcHNpbG9uJywgJ1pldGEnLCAnRXRhJywgJ1RoZXRhJywgXHJcbiAgICAnSW90YScsICdLYXBwYScsICdMYW1iZGEnLCAnTXUnLCdtdScsICdOdScsICdYaScsICdPbWljcm9uJywgJ1BpJywgJ1JobycsIFxyXG4gICAgJ1NpZ21hJywgJ1RhdScsICdVcHNpbG9uJywgJ1BoaScsICdDaGknLCAnUHNpJywgJ09tZWdhJ1xyXG5dO1xyXG4vKmNvbnN0IGxhdGV4T3BlcmF0b3JzPVtcclxuICAgICd0YW4nLCAnc2luJywgJ2NvcycsICdiaW5vbScsICdmcmFjJywgJ2FzaW4nLCAnYWNvcycsIFxyXG4gICAgJ2F0YW4nLCAnYXJjY29zJywgJ2FyY3NpbicsICdhcmN0YW4nLCAnY2RvdCcsJ3NxcnQnXHJcbl0qL1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhhcnI6IGFueVtdKSB7XHJcbiAgICBjb25zdCBzZXF1ZW5jZXMgPSBbXTtcclxuICAgIGxldCBzdGFydCA9IDA7XHJcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBhcnIubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoYXJyW2ldICE9PSBhcnJbaSAtIDFdICsgMSkge1xyXG4gICAgICAgICAgICBpZiAoaSAtIHN0YXJ0ID4gMSkge1xyXG4gICAgICAgICAgICAgICAgc2VxdWVuY2VzLnB1c2goYXJyLnNsaWNlKHN0YXJ0LCBpKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc3RhcnQgPSBpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBzZXF1ZW5jZXM7XHJcbn1cclxuXHJcblxyXG5jb25zdCBvcGVyYXRvcnNGb3JNYXRoaW5mbyA9IHtcclxuICAgIGJvdGhCdXRSaWdodEJyYWNrZXQ6IFtcIl5cIl0sXHJcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxyXG4gICAgYm90aDogW1wiK1wiLCBcIi1cIiwgXCIqXCJdLFxyXG4gICAgc3BlY2lhbDogW1wiPVwiXSxcclxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXHJcbiAgICBkb3VibGVSaWdodEJ1dEJyYWNrZXQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiLFwiL1wiXVxyXG59O1xyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoSW5mb3tcclxuICAgIGRlYnVnSW5mbzogc3RyaW5nPVwiXCI7XHJcbiAgICBzb2x1dGlvbkluZm86IGFueVtdPVtdO1xyXG4gICAgbWF0aEluZm86IGFueVtdPVtdXHJcbiAgICBncmFwaDogc3RyaW5nPVwiXCI7XHJcbiAgICBhZGRHcmFwaEluZm8odmFsdWU6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obXNnOiBzdHJpbmcsIHZhbHVlOiBhbnkpe1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnLG51bGwsMSk6bXNnKStcIiA6IFwiKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlLG51bGwsMSk6dmFsdWUpKyBcIlxcbiBcIjtcclxuICAgIH1cclxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXM6IGFueSl7XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbkluZm8ucHVzaChtZXMpO1xyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiU29sdmVkXCIsbWVzKTtcclxuICAgIH1cclxuICAgIGFkZE1hdGhJbmZvKHRva2VuczogTWF0aEdyb3VwKXsvKlxyXG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5wdXNoKHJlY29uc3RydWN0ZWRNYXRoKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpOyovXHJcbiAgICB9XHJcblxyXG59XHJcblxyXG4vKlxyXG5mdW5jdGlvbiBzYWZlVG9OdW1iZXIodmFsdWUpIHtcclxuICAgIGlmICghKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikpe3JldHVybiB2YWx1ZX1cclxuICAgIGlmICh2YWx1ZT09PVwiK1wiKXtyZXR1cm4gMH1cclxuICAgIGlmICh2YWx1ZT09PVwiLVwiKXtyZXR1cm4gLTF9XHJcbiAgICBpZiAoL1thLXpBLVpdLy50ZXN0KHZhbHVlKSl7cmV0dXJuIDF9XHJcbiAgICBpZigvWyhbXS8udGVzdCh2YWx1ZVswXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMSl9XHJcbiAgICBpZigvWylcXF1dLy50ZXN0KHZhbHVlW3ZhbHVlLmxlbmd0aC0xXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMCx2YWx1ZS5sZW5ndGgtMSl9XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaTx2YWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVbaV0gPT09IFwic3RyaW5nXCIgJiYgL1soKVtcXF1dLy50ZXN0KHZhbHVlW2ldKSkge1xyXG4gICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsIGkpICsgdmFsdWUuc2xpY2UoaSArIDEpO1xyXG4gICAgICAgICAgICBpLS07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgY29uc3QgbnVtID0gTnVtYmVyKHZhbHVlKTtcclxuICAgIHJldHVybiBpc05hTihudW0pID8gdmFsdWUubGVuZ3RoPjA/dmFsdWU6MCA6IG51bTtcclxufSovXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIHJlYXJyYW5nZUVxdWF0aW9uKHRva2VuczogYW55LHRva2VuVG9pc29sYXRlOiBhbnkpe1xyXG4gICAgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0b2tlbnM6IGFueSxpc29sYXRUb2tlbjogVG9rZW4pey8qXHJcbiAgICBjb25zdCBpbmRleD1vcGVyYXRpb25zT3JkZXIodG9rZW5zKVxyXG4gICAgY29uc3QgSXNvbGF0ZWQ9dG9rZW5zLnRva2Vucy5maW5kKCh0b2tlbjogYW55LCBpZHg6IG51bWJlcik9PmlkeDxpbmRleClcclxuICAgIGNvbnN0IGZyYWM9Y3JlYXRlRnJhYyh0b2tlbnMubGlzdC5zbGljZShpbmRleCArIDEpLG5ldyBUb2tlbihJc29sYXRlZC52YWx1ZSkpXHJcbiAgICBJc29sYXRlZC52YWx1ZT0xO1xyXG4gICAgdG9rZW5zLmluc2VydFRva2VucyhpbmRleCsxLHRva2Vucy50b2tlbnMubGVuZ3RoLWluZGV4KzEsZnJhYykqL1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVGcmFjKG5vbWluYXRvcjogYW55LGRlbm9taW5hdG9yOiBUb2tlbil7XHJcbiAgIC8vIHJldHVybiBbbmV3IFRva2VuKCdmcmFjJyksbmV3IFRva2VuKCcoJyksbm9taW5hdG9yLG5ldyBUb2tlbignKScpLG5ldyBUb2tlbignKCcpLGRlbm9taW5hdG9yLG5ldyBUb2tlbignKScpXVxyXG59XHJcbi8qXHJcbmZ1bmN0aW9uIHNpbXBsaWZpeSh0b2tlbnM6IGFueVtdKXtcclxuICAgIGlmICh0b2tlbnMubGVuZ3RoPD0xKXtyZXR1cm4gdG9rZW5zfVxyXG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XHJcbiAgICB3aGlsZSAoaTw9MTAwJiZ0b2tlbnMuc29tZSgodG9rZW46IGFueSkgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSkpXHJcbiAgICB7XHJcbiAgICAgICAgaSsrO1xyXG4gICAgICAgIGxldCBlcWluZGV4PXRva2Vucy5maW5kSW5kZXgoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0pID0+IHRva2VuLnZhbHVlID09PSBcIj1cIik7XHJcbiAgICAgICAgbGV0IE9wZXJhdGlvbkluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9KSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcclxuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxyXG5cclxuICAgICAgICBsZXQgbnVtYmVyR3JvdXAgPSB0b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbjogYW55LCBpOiBhbnkpID0+ICh7IHRva2VuLCBvcmlnaW5hbEluZGV4OiBpIH0pKSBcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IHRva2VuOiB7IHR5cGU6IGFueTsgfTsgfSkgPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxyXG4gICAgICAgIC5yZWR1Y2UoKHN1bTogbnVtYmVyLCBpdGVtOiB7IG9yaWdpbmFsSW5kZXg6IG51bWJlcjsgdG9rZW46IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogbnVtYmVyOyB9OyB9KSA9PiB7XHJcbiAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09IFwiLVwiKSA/IC0xIDogMTtcclxuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxyXG4gICAgICAgIGlmICghKC8obnVtYmVyKS8pLnRlc3QoaXRlbS50b2tlbi50eXBlKSl7bXVsdGlwbGllcio9LTF9XHJcbiAgICAgICAgcmV0dXJuIHN1bSArIChpdGVtLnRva2VuLnZhbHVlICogbXVsdGlwbGllcik7XHJcbiAgICAgICAgfSwgMCk7IFxyXG4gICAgICAgIFxyXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKHtcclxuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxyXG4gICAgICAgICAgICB2YWx1ZTogbnVtYmVyR3JvdXBcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdG9rZW5zID0gdG9rZW5zLmZpbHRlcih0b2tlbiA9PiBcclxuICAgICAgICAgICAgdG9rZW4udHlwZSAhPT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXHJcbiAgICAgICAgICAgICh0b2tlbi5wb3cgJiYgdG9rZW4ucG93ICE9PSBjdXJyZW50VG9rZW4ucG93KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV3VG9rZW5zO1xyXG59XHJcbiovXHJcbi8qXHJcbmZ1bmN0aW9uIHJlYXJyYW5nZUZvcklzb2xhdGlvbih0b2tlbnM6IFRva2VucywgaXNvbGF0aW9uR29hbDogeyB0eXBlOiBhbnk7IHZhbHVlOiBhbnk7IG92ZXJ2aWV3U2lkZU9uZT86IE1hcDxhbnksIGFueT47IG92ZXJ2aWV3U2lkZVR3bz86IE1hcDxhbnksIGFueT47IH0pIHtcclxuICAgIGlmICh0b2tlbnMudG9rZW5zLmxlbmd0aCA8PSAxKSByZXR1cm4gdG9rZW5zO1xyXG5cclxuICAgIGNvbnN0IGVxSW5kZXggPSB0b2tlbnMudG9rZW5zLmZpbmRJbmRleCgodDogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0LnZhbHVlID09PSAnRXF1YWxzJyk7XHJcbiAgICBpZiAoZXFJbmRleCA9PT0gLTEpIHRocm93IG5ldyBFcnJvcihcIk5vICdFcXVhbHMnIG9wZXJhdG9yIGZvdW5kIGluIHRva2Vuc1wiKTtcclxuXHJcbiAgICBjb25zdCBzd2l0Y2hEaXJlY3Rpb24gPSBmYWxzZTsgLy8gRnV0dXJlIGxvZ2ljIHRvIGRldGVybWluZSBkaXJlY3Rpb25cclxuICAgIGNvbnN0IGlzb2xhdGlvbkdvYWxJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHQ6IHsgdHlwZTogYW55OyB2YXJpYWJsZTogYW55OyB9LCBpZHg6IGFueSkgPT4gKHQudHlwZSA9PT0gaXNvbGF0aW9uR29hbC50eXBlICYmIHQudmFyaWFibGUgPT09IGlzb2xhdGlvbkdvYWwudmFsdWUgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHg6IG51bGx8bnVtYmVyKSA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgIGNvbnN0IG90aGVySW5kaWNlcyA9IHRva2Vucy50b2tlbnNcclxuICAgICAgICAubWFwKChfOiBhbnksIGlkeDogYW55KSA9PiAoIWlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGlkeCkgJiYgaWR4ICE9PSBlcUluZGV4ID8gaWR4IDogbnVsbCkpXHJcbiAgICAgICAgLmZpbHRlcigoaWR4OiBudWxsfG51bWJlcikgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAvLyBBZGp1c3Qgc2lnbnNcclxuICAgIHRva2Vucy50b2tlbnMuZm9yRWFjaCgodG9rZW46IHsgdmFsdWU6IG51bWJlcjsgfSwgaTogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgaWYgKChzd2l0Y2hEaXJlY3Rpb24/IGkgPiBlcUluZGV4IDogaSA8IGVxSW5kZXgpICYmIG90aGVySW5kaWNlcy5pbmNsdWRlcyhpKSkge1xyXG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcclxuICAgICAgICB9IGVsc2UgaWYgKChzd2l0Y2hEaXJlY3Rpb24/IGkgPCBlcUluZGV4IDogaSA+IGVxSW5kZXgpICYmIGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XHJcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFNlcGFyYXRlIHNpZGVzXHJcbiAgICBjb25zdCBzaWRlMTogYW55W10gPSBbXTtcclxuICAgIGNvbnN0IHNpZGUyOiBhbnlbXSA9IFtdO1xyXG4gICAgdG9rZW5zLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55LCBpOiBhbnkpID0+IHtcclxuICAgICAgICBpZiAoaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHNpZGUxLnB1c2godG9rZW4pO1xyXG4gICAgICAgIGlmIChvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHNpZGUyLnB1c2godG9rZW4pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdG9rZW5zLnRva2VucyA9IHN3aXRjaERpcmVjdGlvblxyXG4gICAgICAgID8gWy4uLnNpZGUyLCB0b2tlbnMudG9rZW5zW2VxSW5kZXhdLCAuLi5zaWRlMV1cclxuICAgICAgICA6IFsuLi5zaWRlMSwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTJdO1xyXG59XHJcbiovXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBQb3NpdGlvbiB7XHJcbiAgICBvcGVyYXRvcjogc3RyaW5nO1xyXG4gICAgaW5kZXg6IG51bWJlcjtcclxuICAgIHN0YXJ0OiBudW1iZXI7XHJcbiAgICBlbmQ6IG51bWJlcjtcclxuICAgIHRyYW5zaXRpb246IG51bWJlcjtcclxuICAgIHNwZWNpYWxDaGFyOiBzdHJpbmc7XHJcbiAgICBcclxuICAgIGdyb3VwczogTWF0aEdyb3VwW107XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM6IGFueVtdLCBpbmRleDogbnVtYmVyKXtcclxuICAgICAgICB0aGlzLmluZGV4ID0gaW5kZXg7XHJcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5pbmRleDtcclxuICAgICAgICB0aGlzLnN0YXJ0ID0gdGhpcy5pbmRleDtcclxuICAgICAgICB0aGlzLmVuZCA9IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgdGhpcy5wb3NpdGlvbih0b2tlbnMpXHJcbiAgICB9XHJcbiAgICBwb3NpdGlvbih0b2tlbnM6IGFueVtdKSB7XHJcbiAgICAgICAgdGhpcy5vcGVyYXRvciA9IHRva2Vuc1t0aGlzLmluZGV4XS52YWx1ZTtcclxuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHNlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy5vcGVyYXRvcik7XHJcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IG5vdCBmb3VuZCBpbiBtZXRhZGF0YWApO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgYmVmb3JlSW5kZXg6IE1hdGhHcm91cFtdID0gW107XHJcbiAgICAgICAgY29uc3QgYWZ0ZXJJbmRleDogIE1hdGhHcm91cFtdID0gW107XHJcbiAgICBcclxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucywgdHJ1ZSkuZm9yRWFjaCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnN0YXJ0LCB0cnVlKTtcclxuICAgICAgICAgICAgYmVmb3JlSW5kZXgucHVzaChpdGVtLm1hdGhHcm91cCk7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhcnQgPSBpdGVtLmxhc3RJdGVtT2ZQcmV2aW91cztcclxuICAgICAgICB9KTtcclxuICAgIFxyXG4gICAgXHJcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsIGZhbHNlKS5mb3JFYWNoKCgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuZW5kLCBmYWxzZSk7XHJcbiAgICAgICAgICAgIGFmdGVySW5kZXgucHVzaChpdGVtLm1hdGhHcm91cCk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5kID0gaXRlbS5sYXN0SXRlbU9mUHJldmlvdXM7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5zdGFydD09PXRoaXMuaW5kZXgpXHJcbiAgICAgICAgaWYodGhpcy5zdGFydD09PXRoaXMuaW5kZXgpdGhpcy5zdGFydCs9MjtcclxuICAgICAgICB0aGlzLmdyb3VwcyA9IGJlZm9yZUluZGV4LnJldmVyc2UoKS5jb25jYXQoYWZ0ZXJJbmRleCk7XHJcbiAgICB9XHJcbiAgICBhcHBseVBvc2l0aW9uKHRva2VuczogYW55W10sIGluZGV4OiAgbnVtYmVyLCBpc0xlZnQ6IGJvb2xlYW4pIHtcclxuICAgICAgICBsZXQgYnJlYWtDaGFyPWluZGV4XHJcbiAgICAgICAgbGV0IHRhcmdldDogYW55O1xyXG4gICAgICAgIGNvbnN0IG1vZGlmaWVkSW5kZXggPSAgaW5kZXgrKGlzTGVmdD8tIDEgOiAgMSk7XHJcblxyXG4gICAgICAgIGlmICgoaXNMZWZ0ICYmIGluZGV4IDw9IDApIHx8ICghaXNMZWZ0ICYmIGluZGV4ID49IHRva2Vucy5sZW5ndGggLSAxKSB8fCAhdG9rZW5zW21vZGlmaWVkSW5kZXhdKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImF0IGFwcGx5UG9zaXRpb246IFxcXCJpbmRleCB3YXNuJ3QgdmFsaWRcXFwiIGluZGV4OiBcIitpbmRleCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodG9rZW5zW21vZGlmaWVkSW5kZXhdIGluc3RhbmNlb2YgUGFyZW4pIHtcclxuICAgICAgICAgICAgY29uc3QgcGFyZW5JbmRleCA9IGZpbmRQYXJlbkluZGV4KHRva2Vuc1ttb2RpZmllZEluZGV4XSx0b2tlbnMpO1xyXG4gICAgICAgICAgICBicmVha0NoYXIgPSAgaXNMZWZ0ID8gcGFyZW5JbmRleC5vcGVuIDogcGFyZW5JbmRleC5jbG9zZSsxO1xyXG4gICAgICAgICAgICAvLyBJbnN1cmUgcHJvcGVyIGZvcm1hdHRpbmcgcmVtb3ZlZCBldmVyeXRoaW5nIGluY2x1ZGluZyBwYXJlbnRoZXNlc1xyXG4gICAgICAgICAgICB0YXJnZXQgPSBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXModG9rZW5zLnNsaWNlKHBhcmVuSW5kZXgub3BlbiwgcGFyZW5JbmRleC5jbG9zZSsxKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgYnJlYWtDaGFyPW1vZGlmaWVkSW5kZXg7XHJcbiAgICAgICAgICAgIHRhcmdldCA9IGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyh0b2tlbnNbYnJlYWtDaGFyXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0YXJnZXQ/Lmxlbmd0aD09PTApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7aXNMZWZ0PydsZWZ0JzoncmlnaHQnfSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zW2luZGV4XS52YWx1ZX1cImAsKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vTWFrZSBzdXJlIHdlIGRvbid0IGNyZWF0ZSBkdXBsaWNhdGUgaW50ZXJsb2NrZWQgbWF0aCBncm91cHNcclxuICAgICAgICBpZih0YXJnZXQ/Lmxlbmd0aCYmdGFyZ2V0Py5sZW5ndGg9PT0xJiZ0YXJnZXRbMF1pbnN0YW5jZW9mIE1hdGhHcm91cCl7XHJcbiAgICAgICAgICAgIHRhcmdldD10YXJnZXRbMF1cclxuICAgICAgICAgICAgdGFyZ2V0LnRyeVJlbW92ZVVubmVjZXNzYXJ5TmVzdGVkKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBtYXRoR3JvdXA6IG5ldyBNYXRoR3JvdXAodGFyZ2V0KSxcclxuICAgICAgICAgICAgbGFzdEl0ZW1PZlByZXZpb3VzOiBicmVha0NoYXIsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICBpZiAob3BlcmF0b3IuZ3JvdXBOdW0hPT1vcGVyYXRvci5ncm91cHMubGVuZ3RoKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIG51bWJlciBvZiBncm91cHMgZm9yIG9wZXJhdG9yICR7b3BlcmF0b3Iub3BlcmF0b3J9IGV4cGVjdGVkICR7b3BlcmF0b3IuZ3JvdXBOdW19IGJ1dCBnb3QgJHtvcGVyYXRvci5ncm91cHMubGVuZ3RofWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VPcGVyYXRvcihvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKTogYm9vbGVhbiB7XHJcbiAgICBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcik7XHJcbiAgICBmdW5jdGlvbiBnZXRPcGVyYWJsZVZhbHVlKGdyb3VwOiBNYXRoR3JvdXApOiBudW1iZXIgfCBudWxsIHtcclxuICAgICAgICBpZiAoIWdyb3VwLmlzT3BlcmFibGUoKSkgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSBncm91cC5nZXRPcGVyYWJsZVZhbHVlKCk7XHJcbiAgICAgICAgcmV0dXJuIHZhbHVlPy52YWx1ZSA/PyBudWxsO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZ3JvdXAxID0gZ2V0T3BlcmFibGVWYWx1ZShvcGVyYXRvci5ncm91cHNbMF0pO1xyXG4gICAgY29uc3QgZ3JvdXAyID0gZ2V0T3BlcmFibGVWYWx1ZShvcGVyYXRvci5ncm91cHNbMV0pO1xyXG4gICAgaWYgKGdyb3VwMSA9PT0gbnVsbHx8Z3JvdXAyPT09bnVsbCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIHN3aXRjaCAob3BlcmF0b3Iub3BlcmF0b3IpIHtcclxuICAgICAgICBjYXNlIFwiU2luXCI6XHJcbiAgICAgICAgICAgIG9wZXJhdG9yLnNvbHV0aW9uID0gbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMoZ3JvdXAxKSkpXSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBjYXNlIFwiU3F1YXJlIHJvb3RcIjpcclxuICAgICAgICAgICAgaWYgKGdyb3VwMSA8IDApIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBjYWxjdWxhdGUgdGhlIHNxdWFyZSByb290IG9mIGEgbmVnYXRpdmUgbnVtYmVyLlwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihNYXRoLnBvdyhncm91cDEsMC41KSldKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIkZyYWN0aW9uXCI6IHtcclxuICAgICAgICAgICAgaWYgKGdyb3VwMiA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGl2aXNpb24gYnkgemVybyBpcyBub3QgYWxsb3dlZFwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihncm91cDEgLyBncm91cDIpXSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXNlIFwiTXVsdGlwbGljYXRpb25cIjoge1xyXG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihncm91cDEgKiBncm91cDIpXSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICBgVW5rbm93biBvcGVyYXRvciB0eXBlIGluIHBhcnNlT3BlcmF0b3I6ICR7b3BlcmF0b3Iub3BlcmF0b3J9YFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBvcGVyYXRpb25zT3JkZXIodG9rZW5zOiBhbnlbXSkge1xyXG4gICAgZnVuY3Rpb24gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW46IG51bWJlciwgZW5kOiBudW1iZXIsIHRva2VuczogYW55LCByZWdleD86IGFueSkge1xyXG4gICAgICAgIGNvbnN0IGluZGV4PXRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueTsgfSkgPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcclxuICAgICAgICByZXR1cm4gaW5kZXg+LTE/aW5kZXgrYmVnaW46bnVsbDtcclxuICAgIH1cclxuICAgIGNvbnN0IHsgYmVnaW4sIGVuZCB9ID0gZmluZERlZXBlc3RQYXJlbnRoZXNlc1Njb3BlKHRva2Vucyk7XHJcbiAgICBsZXQgcHJpb3JpdHk9bnVsbFxyXG4gICAgZm9yIChsZXQgaT0xO2k8PTY7aSsrKXtcclxuICAgICAgICBwcmlvcml0eSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHkoaSx0cnVlKSk7XHJcbiAgICAgICAgaWYocHJpb3JpdHkhPT1udWxsKWJyZWFrO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHtzdGFydDogYmVnaW4sZW5kOiBlbmQsc3BlY2lmaWNPcGVyYXRvckluZGV4OiBwcmlvcml0eX1cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcclxuICAgIGlucHV0PVwiXCI7XHJcbiAgICB0b2tlbnM6IE1hdGhHcm91cDtcclxuICAgIHNvbHV0aW9uOiBhbnk7XHJcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcclxuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCB0b2tlbnM9bmV3IEJhc2ljTWF0aEpheFRva2Vucyh0aGlzLmlucHV0KTtcclxuICAgICAgICBjb25zdCBiYXNpY1Rva2Vucz10b2tlbnMudG9rZW5zXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5jb252ZXJ0QmFzaWNNYXRoSmF4VG9rZW5hVG9NYXRoR3JvdXAoYmFzaWNUb2tlbnMpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJjb252ZXJ0QmFzaWNNYXRoSmF4VG9rZW5hVG9NYXRoR3JvdXBcIix0aGlzLnRva2VucylcclxuICAgICAgICAvKlxyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy50b2tlbnMudG9TdHJpbmcoKVxyXG4gICAgICAgIGNvbnNvbGUubG9nKCd0aGlzLnRva2VucycsdGhpcy50b2tlbnMpXHJcbiAgICAgICAgdGhpcy5jb250cm9sbGVyKCk7XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbj10aGlzLnRva2Vuc1xyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwic29sdXRpb25cIix0aGlzLnNvbHV0aW9uKSovXHJcbiAgICB9XHJcblxyXG4gICAgXHJcbiAgICBwYXJzZSh0b2tlbnM6IE1hdGhHcm91cCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gdG9rZW5zLmdldEl0ZW1zKCkuZmluZChcclxuICAgICAgICAgICAgdCA9PiB0IGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yICYmIHQuaXNPcGVyYWJsZVxyXG4gICAgICAgICkgYXMgTWF0aEpheE9wZXJhdG9yIHwgdW5kZWZpbmVkO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKCFvcGVyYXRvcikgcmV0dXJuO1xyXG4gICAgICAgIG9wZXJhdG9yLmdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wYXJzZShncm91cCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcGFyc2VPcGVyYXRvcihvcGVyYXRvcik7XHJcbiAgICAgICAgaWYgKCFvcGVyYXRvci5zb2x1dGlvbikge1xyXG4gICAgICAgICAgICBvcGVyYXRvci5pc09wZXJhYmxlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAvLyBSZXBsYWNlIHRva2VucyB3aXRoIHRoZSBzb2x1dGlvblxyXG4gICAgICAgIHRva2Vucy5zZXRJdGVtcyhvcGVyYXRvci5zb2x1dGlvbi5nZXRJdGVtcygpKTsgXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnRyb2xsZXIoKTogYW55e1xyXG4gICAgICAgIC8vIFRoZSBleHByZXNzaW9uIG5lZWRzIHRvIGJlIHdyYXBwZWQgTiBhIG9wZXJhdG9yIGJhc2VkIG9uIHByYWlzaW5nIG1ldGhvZCBNYXliZSBub3QgZGVjaWRlZCBvbiBpdCB5ZXQuXHJcbiAgICAgICAgLy9jb25zdCB3aGF0ZWJ2ZXI9XHJcbiAgICAgICAgdGhpcy5wYXJzZSh0aGlzLnRva2VucylcclxuICAgICAgICAvL3RoaXMudG9rZW5zLmNvbWJpbmluZ0xpa2VUZXJtcygpXHJcbiAgICAgICAgLypcclxuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnMuY29tYmluaW5nTGlrZVRlcm1zKClcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudG9rZW5zLnRva2Vucy5pdGVtcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy50b2tlbnMudG9rZW5zLml0ZW1zW2ldO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIShpdGVtIGluc3RhbmNlb2YgbWF0aEpheE9wZXJhdG9yKSkgY29udGludWU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnRva2Vucy5pdGVtc1tpXSA9IGl0ZW0uYWRkU29sdXRpb24oKTtcclxuICAgICAgICB9ICAgICAgICBcclxuICAgICAgICAqL1xyXG4gICAgICAgIC8vdGhpcy50b2tlbnMudG9rZW5zLmFkZFNvbHV0aW9uKClcclxuICAgICAgICAvL3JldHVybiB0aGlzLnRva2Vucy50b2tlbnM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLypcclxuICAgICAgICB0aGlzLmkrKztcclxuICAgICAgICBpZih0aGlzLmk+MTApe3JldHVybiB0aGlzLmZpbmFsUmV0dXJuKCl9XHJcblxyXG4gICAgICAgIHRoaXMuZ2V0UmVkeWZvck5ld1JvbmQoKTtcclxuICAgICAgICAvL2NvbnN0IG92ZXJ2aWV3PXRoaXMudG9rZW5zLmdldE92ZXJ2aWV3KClcclxuICAgICAgICBjb25zdCBwcmFpc2luZ01ldGhvZD1uZXcgUHJhaXNpbmdNZXRob2QodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIGlmIChwcmFpc2luZ01ldGhvZC5pc1RoZXJlT3BlcmF0b3JPdGhlclRoYW5FcXVhbHMoKSl7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMudG9rZW5zKTtcclxuICAgICAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJQYXJzZWQgZXhwcmVzc2lvblwiLCBKU09OLnN0cmluZ2lmeShwb3NpdGlvbiwgbnVsbCwgMSkpO1xyXG4gICAgICAgICAgICBpZiAocG9zaXRpb24gPT09IG51bGwmJnRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MSl7XHJcbiAgICAgICAgICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKFwicGFyc2UodG9rZW5zKVwiLHBhcnNlKHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJ0aGUgKioqKlwiXHJcbiAgICAgICAgICAgIC8vIHJldHVybiBzb2x1dGlvbih0b2tlbnMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWMoKXx8cG9zaXRpb24uY2hlY2tNdWx0aVN0ZXAoKSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyh0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCh0aGlzLnRva2Vucy50b2tlbnMpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy51c2VQYXJzZShwb3NpdGlvbilcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYocHJhaXNpbmdNZXRob2QuaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKSl7XHJcbiAgICAgICAgICAgIHRoaXMudXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kKVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCB0b0lzb2xhdGU9cHJhaXNpbmdNZXRob2QuaXNBbnl0aGluZ1RvSXNvbGF0ZSgpXHJcbiAgICAgICAgaWYgKHRvSXNvbGF0ZSl7XHJcbiAgICAgICAgICAgIHJlYXJyYW5nZUZvcklzb2xhdGlvbih0aGlzLnRva2Vucyx0b0lzb2xhdGUpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgICAgIH0gICBcclxuICAgICAgICAvL2lmIChzb2x2ZWQgPT09IG51bGx8fHR5cGVvZiBzb2x2ZWQ9PT1cInN0cmluZ1wiKSB7cmV0dXJuIHNvbHZlZDsgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCkvL3RoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7Ki9cclxuICAgIH1cclxuICAgIHNvbHV0aW9uVG9TdHJpbmcoKXtcclxuICAgICAgICByZXR1cm4gKHRoaXMudG9rZW5zLnRvU3RyaW5nKCkpfHxcIlwiXHJcbiAgICB9XHJcblxyXG4gICAgcHJhaXNpbmdNZXRob2QoKXtcclxuICAgICAgICAvKlxyXG4gICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XHJcbiAgICAgICAgY29uc3QgW251bWJlckluZGV4LHZhcmlhYmxlSW5kZXgscG93SW5kZXhdID0gW2ZpbHRlckJ5VHlwZShcIm51bWJlclwiKSxmaWx0ZXJCeVR5cGUoXCJ2YXJpYWJsZVwiKSxmaWx0ZXJCeVR5cGUoXCJwb3dlclZhcmlhYmxlXCIpXVxyXG4gICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51c2VRdWFkcmF0aWMoKVxyXG4gICAgICAgIHJldHVybiB0aGlzLnVzZUlzb2xhdCgpOyovXHJcbiAgICB9XHJcblxyXG4gICAgdXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kOiBQcmFpc2luZ01ldGhvZCl7XHJcbiAgICAgICAgaXNvbGF0ZU11bHRpcGxpY2F0aW9uKHRoaXMudG9rZW5zLG5ldyBUb2tlbihwcmFpc2luZ01ldGhvZC52YXJpYWJsZXNbMF0pKVxyXG4gICAgICAgIC8vcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMoKVxyXG4gICAgICAgIC8vVXNlIHBvc3Nlc3Npb25cclxuICAgIH1cclxuXHJcbiAgICB1c2VRdWFkcmF0aWMoKXsvKlxyXG4gICAgICAgIHRoaXMudG9rZW5zLnRva2Vucz1zaW1wbGlmaXkodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGU6IHN0cmluZyk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzaW1wbGlmaXkodG9rZW5zKVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0/LnZhbHVlIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICBudW1iZXJJbmRleFswXT8udmFsdWUgKiAtMXwgMCxcclxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0qL1xyXG4gICAgfVxyXG4gICAgYWRkRGVidWdJbmZvKG1lczogc3RyaW5nLHZhbHVlOiBhbnkpe1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSlcclxuICAgIH1cclxuICAgIHByb2Nlc3NJbnB1dCgpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy5pbnB1dFxyXG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXHJcbiAgICAgICAgLnJlcGxhY2UoL3svZywgXCIoXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXHJcbiAgICAgICAgLy8ucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XHJcbiAgICB9XHJcbiAgICBmaW5hbFJldHVybigpe1xyXG4gICAgICAgLy8gcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgIH1cclxuICAgIGRlZmluZUdyb3Vwc0FuZE9wZXJhdG9ycyh0b2tlbnM6IEFycmF5PGFueT4pOmJvb2xlYW58dGhpc3tcclxuICAgICAgICBjb25zdCByYW5nZT1vcGVyYXRpb25zT3JkZXIodG9rZW5zKTtcclxuICAgICAgICBpZihyYW5nZS5zdGFydD09PW51bGx8fHJhbmdlLmVuZD09PW51bGwpcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGlmKHJhbmdlLnNwZWNpZmljT3BlcmF0b3JJbmRleD09PW51bGwmJnJhbmdlLnN0YXJ0PT09MCYmcmFuZ2UuZW5kPT09dG9rZW5zLmxlbmd0aClyZXR1cm4gdHJ1ZTtcclxuICAgICAgICBsZXQgbmV3TWF0aEdyb3VwU3VjY2Vzcz1udWxsXHJcbiAgICAgICAgaWYgKHJhbmdlLnNwZWNpZmljT3BlcmF0b3JJbmRleCE9PW51bGwpXHJcbiAgICAgICAgICAgIG5ld01hdGhHcm91cFN1Y2Nlc3M9dGhpcy5jcmVhdGVPcGVyYXRvckl0ZW1Gcm9tVG9rZW5zKHRva2VucyxyYW5nZSlcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgbmV3TWF0aEdyb3VwU3VjY2Vzcz10aGlzLmNyZWF0ZU1hdGhHcm91cEluc2VydEZyb21Ub2tlbnModG9rZW5zLHJhbmdlLnN0YXJ0LHJhbmdlLmVuZClcclxuICAgICAgICBpZighbmV3TWF0aEdyb3VwU3VjY2VzcylyZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmaW5lR3JvdXBzQW5kT3BlcmF0b3JzKHRva2Vucyk7XHJcbiAgICB9XHJcbiAgICBjb252ZXJ0QmFzaWNNYXRoSmF4VG9rZW5hVG9NYXRoR3JvdXAoYmFzaWNUb2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPik6dm9pZHtcclxuICAgICAgICBjb25zdCBzdWNjZXNzPXRoaXMuZGVmaW5lR3JvdXBzQW5kT3BlcmF0b3JzKGJhc2ljVG9rZW5zKVxyXG4gICAgICAgIGlmKCFzdWNjZXNzKXJldHVyblxyXG4gICAgICAgIHRoaXMudG9rZW5zPW5ldyBNYXRoR3JvdXAoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGJhc2ljVG9rZW5zKSlcclxuICAgIH1cclxuICAgIGNyZWF0ZU1hdGhHcm91cEluc2VydEZyb21Ub2tlbnModG9rZW5zOiBBcnJheTxhbnk+LHN0YXJ0OiBudW1iZXIsZW5kOiBudW1iZXIpOmJvb2xlYW57XHJcbiAgICAgICAgY29uc3QgbmV3TWF0aEdyb3VwPW5ldyBNYXRoR3JvdXAoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKHRva2Vucy5zbGljZShzdGFydCxlbmQrMSkpKTtcclxuICAgICAgICB0b2tlbnMuc3BsaWNlKHN0YXJ0LChlbmQtc3RhcnQpKzEsbmV3TWF0aEdyb3VwKTtcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG4gICAgY3JlYXRlT3BlcmF0b3JJdGVtRnJvbVRva2Vucyh0b2tlbnM6IEFycmF5PGFueT4scmFuZ2U6IGFueSk6Ym9vbGVhbntcclxuICAgICAgICBjb25zdCBpbmRleD1yYW5nZS5zcGVjaWZpY09wZXJhdG9ySW5kZXg7XHJcbiAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRva2Vuc1tpbmRleF0udmFsdWUpO1xyXG4gICAgICAgIGlmKCFtZXRhZGF0YSl0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dG9rZW5zW2luZGV4XS52YWx1ZX0gbm90IGZvdW5kIGluIG1ldGFkYXRhYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcG9zaXRpb249bmV3IFBvc2l0aW9uKHRva2VucyxpbmRleClcclxuICAgICAgICBjb25zdCBjPWRlZXBDbG9uZSh0b2tlbnMpXHJcbiAgICAgICAgY29uc3QgbmV3T3BlcmF0b3I9bmV3IE1hdGhKYXhPcGVyYXRvcihwb3NpdGlvbi5vcGVyYXRvcixtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9ucyxwb3NpdGlvbi5ncm91cHMsKVxyXG4gICAgICAgIGNvbnNvbGUud2FybihjLnNwbGljZShwb3NpdGlvbi5zdGFydCwocG9zaXRpb24uZW5kLXBvc2l0aW9uLnN0YXJ0KSsxLG5ld09wZXJhdG9yKSlcclxuICAgICAgICBjb25zb2xlLmxvZygncG9zaXRpb24nLGMpXHJcbiAgICAgICAgdG9rZW5zLnNwbGljZShyYW5nZS5zdGFydCwocmFuZ2UuZW5kLXJhbmdlLnN0YXJ0KSsxLG5ld09wZXJhdG9yKTtcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG59XHJcbmZ1bmN0aW9uIGRlZXBDbG9uZShpdGVtczogYW55W10pIHtcclxuICAgIGxldCBjbG9uZTogYW55W10gPSBbXTtcclxuICAgIGl0ZW1zLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgY2xvbmUucHVzaChpdGVtIGluc3RhbmNlb2YgQXJyYXkgPyBkZWVwQ2xvbmUoaXRlbSkgOiBpdGVtLmNsb25lKCkpO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gY2xvbmU7XHJcbn1cclxuXHJcbmNsYXNzIG1hdGhWYXJpYWJsZXN7XHJcblxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmbGF0dGVuQXJyYXkoYXJyOiBhbnkpIHtcclxuICAgIGxldCByZXN1bHQgPSBbXTtcclxuICAgIGxldCBzdGFjayA9IEFycmF5LmlzQXJyYXkoYXJyKSA/IFsuLi5hcnJdIDogW2Fycl07XHJcblxyXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IG5leHQgPSBzdGFjay5wb3AoKTtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShuZXh0KSkge1xyXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyBcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaChuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyBQcmFpc2luZ01ldGhvZHtcclxuICAgIHRva2Vuc1xyXG4gICAgb3ZlcnZpZXc6IGFueTtcclxuICAgIHZhcmlhYmxlczogYW55W107XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM6IGFueSl7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zXHJcbiAgICAgICAgdGhpcy5vdmVydmlldz10aGlzLmdldE92ZXJ2aWV3KClcclxuICAgICAgICB0aGlzLmFzc2lnblZhcmlhYmxlcygpXHJcbiAgICB9XHJcbiAgICBpc1ZhcldpdGhWYWx1ZUJpZ2dlclRoYW5PbmUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuc29tZSgodDogYW55KT0+IHQudHlwZT09PSd2YXJpYWJsZScmJnQudmFsdWU+MSlcclxuICAgIH1cclxuXHJcbiAgICBpc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhhc2VWYXJpYWJsZSgpJiZ0aGlzLmlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpJiZ0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKClcclxuICAgIH1cclxuICAgIGlzSXNvbGF0ZSgpe1xyXG4gICAgICAgIC8vcmV0dXJuIHRoaXMuXHJcbiAgICB9XHJcblxyXG4gICAgaXNBbnl0aGluZ1RvSXNvbGF0ZSgpe1xyXG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzLmxlbmd0aD4xKXRocm93IG5ldyBFcnJvcihcInR3byB2YXIgZXEgYXJlbnQgc2Fwb3J0ZWQgeWV0XCIpXHJcbiAgICAgICAgaWYoIXRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlyZXR1cm47XHJcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLmVxdWFsc0luZGV4SWZBbnkoKTtcclxuICAgICAgICBpZighZXFJbmRleCl7cmV0dXJufTtcclxuICAgICAgICBjb25zdCBiZWZvciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoMCxlcUluZGV4KSlcclxuICAgICAgICBjb25zdCBhZnRlciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoZXFJbmRleCsxKSlcclxuICAgICAgICBjb25zdCB3aGF0VG9Jc29sYXQgPXRoaXMud2hhdFRvSXNvbGF0KCk7XHJcbiAgICAgICAgaWYgKCghYmVmb3J8fCFhZnRlcil8fCF3aGF0VG9Jc29sYXR8fChiZWZvcj8uc2l6ZTwyJiZhZnRlcj8uc2l6ZTwyKSlyZXR1cm47XHJcbiAgICAgICAgcmV0dXJuIHtvdmVydmlld1NpZGVPbmU6IGJlZm9yLG92ZXJ2aWV3U2lkZVR3bzogYWZ0ZXIsLi4ud2hhdFRvSXNvbGF0fVxyXG4gICAgfS8qXHJcbiAgICBob3dUb0lzb2xhdGUob3ZlcnZpZXdTaWRlT25lLG92ZXJ2aWV3U2lkZVR3byxpc29sYXRpb25Hb29sKXtcclxuICAgICAgICBjb25zdCBpc29sYXRpb25UeXBlPWlzb2xhdGlvbkdvb2wuc3BsdCgnOicpO1xyXG4gICAgICAgIC8vaWYgKCl7fVxyXG4gICAgfSovXHJcbiAgICB3aGF0VG9Jc29sYXQoKXtcclxuICAgICAgICAvLyBpIG5lZWQgdG8gYWRkIHBvd3MgYWZ0ZXJcclxuICAgICAgICAvLyBmb3Iga25vdyBpbSBnb2luZyBvbiB0aGUgb3Nob21zaGluIHRoYXQgdGhyIGlzIG9ubHkgb25lIHZhclxyXG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzPy5sZW5ndGg8MSlyZXR1cm47XHJcblxyXG4gICAgICAgIHJldHVybiB7dHlwZTogJ3ZhcmlhYmxlJyx2YWx1ZTogdGhpcy52YXJpYWJsZXNbMF19XHJcbiAgICB9LypcclxuICAgIGlzT3ZlcnZpZXdUb2lzb2xhdChvdmVydmlldyl7XHJcbiAgICB9Ki9cclxuICAgIGlzSW1iYWxhbmNlKG92ZXJ2aWV3OiB7IHNpemU6IG51bWJlcjsgfSl7XHJcbiAgICAgICAgb3ZlcnZpZXcuc2l6ZT4xXHJcbiAgICB9XHJcbiAgICBlcXVhbHNJbmRleElmQW55KCl7XHJcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLnRva2Vucy5tYXAoKHQ6IHsgdmFsdWU6IHN0cmluZzsgfSxpZHg6IGFueSk9PnQudmFsdWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKChtOiBudWxsKT0+bSE9PW51bGwpO1xyXG4gICAgICAgIHJldHVybiBlcUluZGV4WzBdO1xyXG4gICAgfVxyXG4gICAgaXNRdWFkcmF0aWMoKXtcclxuXHJcbiAgICB9XHJcbiAgICBpc0ZpbmFsUmV0dXJuKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmxlbmd0aDwyfHwodGhpcy5pc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhc3NpZ25WYXJpYWJsZXMoKXtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcz1bXVxyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKXtcclxuICAgICAgICAgICAgaWYgKGtleT8uc3RhcnRzV2l0aCgndmFyaWFibGU6JykmJiF0aGlzLnZhcmlhYmxlcy5pbmNsdWRlcyh2YWx1ZS52YXJpYWJsZSkpe1xyXG4gICAgICAgICAgICAgICAgdGhpcy52YXJpYWJsZXMucHVzaCh2YWx1ZS52YXJpYWJsZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBoYXNlVmFyaWFibGUoKXtyZXR1cm4gdGhpcy52YXJpYWJsZXM/Lmxlbmd0aD4wfVxyXG5cclxuICAgIGlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpe1xyXG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxyXG4gICAgICAgIHJldHVybiAgZmlsdGVyLm5vTWF0Y2g+MFxyXG4gICAgfVxyXG4gICAgaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKXtcclxuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcclxuICAgICAgICByZXR1cm4gIGZpbHRlci5tYXRjaD09PTEmJmZpbHRlci5ub01hdGNoPT09MFxyXG4gICAgfVxyXG5cclxuICAgIGZpbHRlckJ5VHlwZSh0eXBlS2V5OiBzdHJpbmcsIHRhcmdldFZhbHVlOiBzdHJpbmcpe1xyXG4gICAgICAgIGxldCBtYXRjaD0wLCBub01hdGNoPTBcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLm92ZXJ2aWV3LmVudHJpZXMoKSkge1xyXG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKHR5cGVLZXkpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSB0eXBlS2V5Kyc6Jyt0YXJnZXRWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoKys7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIG5vTWF0Y2grKztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4geyBtYXRjaDogbWF0Y2gsIG5vTWF0Y2g6IG5vTWF0Y2ggfTtcclxuICAgIH1cclxuICAgIGdldE92ZXJ2aWV3KHRva2Vucz86IGFueVtdICkge1xyXG4gICAgICAgIGlmKCF0b2tlbnMpdG9rZW5zPXRoaXMudG9rZW5zXHJcbiAgICAgICAgaWYoIXRva2VucylyZXR1cm47XHJcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXcgPSBuZXcgTWFwKCk7XHJcbiAgICAgICAgdG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xyXG4gICAgICAgICAgICAvL2lmICghdG9rZW4uaXNWYWx1ZVRva2VuKCkpIHtyZXR1cm47fVxyXG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0b2tlbi5nZXRGdWxsVG9rZW5JRCgpXHJcbiAgICAgICAgICAgIC8vRXF1YWxzXHJcbiAgICAgICAgICAgIGlmICghb3ZlcnZpZXcuaGFzKGtleSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0geyBcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlbi50eXBlLCBcclxuICAgICAgICAgICAgICAgICAgICBjb3VudDogMCAsXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyaWFibGU6IHVuZGVmaW5lZFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09PSAndmFyaWFibGUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW50cnkudmFyaWFibGUgPSB0b2tlbi52YXJpYWJsZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICAgICAgb3ZlcnZpZXcuc2V0KGtleSwgZW50cnkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG92ZXJ2aWV3LmdldChrZXkpLmNvdW50Kys7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG92ZXJ2aWV3Ly9BcnJheS5mcm9tKG92ZXJ2aWV3LnZhbHVlcygpKTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgT3BlcmF0b3J7XHJcblxyXG59XHJcblxyXG5jbGFzcyBNb2RpZmllcntcclxuXHJcbn0iXX0=