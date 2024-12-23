import { quad, degreesToRadians, radiansToDegrees, calculateFactorial } from "./mathUtilities";
import { findParenIndex } from "../utils/tokenUtensils";
import { getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getOperatorsByBracket } from "../utils/dataManager";
import { Token, Tokens } from "./mathJaxTokens";
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
        this.debugInfo += (typeof msg === "object" ? JSON.stringify(msg) : msg) + " : " + (typeof value === "object" ? JSON.stringify(value) : value) + "\n ";
    }
    addSolutionInfo(mes) {
        this.solutionInfo.push(mes);
        this.addDebugInfo("Solved", mes);
    }
    addMathInfo(tokens) {
        const reconstructedMath = tokens.reconstruct();
        this.mathInfo.push(reconstructedMath);
        this.addDebugInfo("Reconstructed math", reconstructedMath);
    }
    addSolution(tokens, position, solution) {
        solution = tokens.reconstruct([solution]);
        const left = tokens.reconstruct(tokens.tokens.slice(position.left.breakChar, position.index));
        const right = tokens.reconstruct(tokens.tokens.slice(position.index + 1, position.right.breakChar));
        switch (true) {
            case operatorsForMathinfo.bothButRightBracket.includes(position.operator):
                solution = `${left} ${position.operator} {${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.both.includes(position.operator):
                solution = `${left} ${position.operator.replace(/\*/g, "\\cdot")} ${right} = ${solution}`;
                break;
            case operatorsForMathinfo.special.includes(position.operator):
                solution = `\\frac{${left}}{${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.rightBracketAndRequiresSlash.includes(position.operator):
                solution = `\\sqrt{${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.RightParenAndRequiresSlash.includes(position.operator):
                solution = `\\${position.operator} (${right}) = ${solution}`;
                break;
            case operatorsForMathinfo.doubleRightButBracket.includes(position.operator):
                solution = `\\${position.operator.replace("/", "frac")}{${left}}{${right}} = ${solution}`;
                break;
        }
        this.addSolutionInfo(solution);
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
function parseSafetyChecks(operator, left, right) {
    if (typeof operator === "string" && typeof left?.value !== "number" && getOperatorsByBracket('both').includes(operator)) {
        throw new Error("Left side of " + operator + " must have a value");
    }
    if (typeof operator === "string" && typeof right?.value !== "number") {
        throw new Error("Right side of " + operator + " must have a value");
    }
}
function parse(position) {
    let { operator, specialChar, left, right } = position;
    left = left?.tokens;
    right = right.tokens;
    //console.log('this.left,this.right',left,right)
    parseSafetyChecks(operator, left, right);
    let solved = new Token(0, undefined);
    switch (operator) {
        case "Square Root":
            solved.value = Math.pow(right.value, specialChar !== null ? (1) / (specialChar) : 0.5);
            break;
        case "Pow":
            if (left.variable || right.variable) {
                solved.variable = left.variable || left.variable === right.variable ? left.variable : right.variable ? right.variable : "";
                //solved.pow=2
            }
            solved.value = Math.pow(left.value, right.value);
            break;
        case "Fraction":
        case "/":
            solved.value = (left.value) / (right.value);
            break;
        case "Multiplication":
            solved.value = left.value * right.value;
            handleVriables(left, right, solved);
            break;
        case "+":
            solved.value = left.value + right.value;
            solved.variable = left.variable ? left.variable : right.variable;
            break;
        case "Minus":
            solved.value = left.value - right.value;
            solved.variable = left.variable ? left.variable : right.variable;
            break;
        case "binom":
            solved.value = calculateFactorial(left.value, right.value);
            break;
        case "sin":
            solved.value = Math.sin(degreesToRadians(right.value));
            break;
        case "cos":
            solved.value = Math.cos(degreesToRadians(right.value));
            break;
        case "tan":
            if (right >= 90) {
                throw new Error("tan Must be smaller than 90");
            }
            solved.value = (Math.tan(degreesToRadians(right.value)));
            break;
        case "asin":
        case "arcsin":
            solved.value = radiansToDegrees(Math.asin(right.value));
            break;
        case "acos":
        case "arccos":
            solved.value = radiansToDegrees(Math.acos(right.value));
            break;
        case "atan":
        case "arctan":
            solved.value = radiansToDegrees(Math.atan(right.value));
            break;
        default:
            throw new Error("Couldn't identify operator type at praise operator: " + position.operator);
    }
    function handleVariableMultiplication(left, right, solved) {
        if (left.variable && right.variable && left.variable !== right.variable) {
            /* Keep them separate since they have different variables
            solved.terms = [
                { variable: left.variable, pow: left.pow || 1, value: left.value || 1 },
                { variable: right.variable, pow: right.pow || 1, value: right.value || 1 }
            ];*/
            throw new Error("Different variable bases at power multiplication. I didn't get there yet");
        }
        const variable = left.variable || right.variable;
        solved.variable = variable.length > 0 ? variable : undefined;
        let pow = (left.pow || 0) + (right.pow || 0);
        pow = left.variable && right.variable && pow === 0 && !left.pow && !right.pow ? 2 : pow;
        //solved.pow = pow || undefined;
        // Rule 3: Handle multiplication of constants
        const leftValue = left.value || 1;
        const rightValue = right.value || 1;
        const value = leftValue * rightValue;
        // If there's no variable, assign the result as a constant
        if (!variable) {
            solved.value = value;
        }
        else {
            solved.value = value;
        }
    }
    function handleVriables(left, right, solved) {
        let handled = { Var: null, Pow: null };
        if (!left.variable && !right.variable) {
            return;
        }
        if (position.operator === '*') {
            return handleVariableMultiplication(left, right, solved);
        }
        //console.log(left.variable,right.variable)
        if (left.variable !== right.variable) {
            throw new Error("Two variable equations aren't accepted yet");
        }
        //handled.Var=left.var;
        //solved.variable=left.var
        /*
        if (left.variable&&!right.variable){solved.variable=left.variable}
        else if (!left.variable&&right.variable){solved.variable=right.variable}
        else if (left.variable&&right.variable){solved.variable=right.variable;solved.pow=2}
        */
    }
    return solved;
}
function rearrangeEquation(tokens, tokenToisolate) {
}
function isolateMultiplication(tokens, isolatToken) {
    const index = operationsOrder(tokens);
    const Isolated = tokens.tokens.find((token, idx) => idx < index);
    const frac = createFrac(tokens.list.slice(index + 1), new Token(Isolated.value));
    Isolated.value = 1;
    tokens.insertTokens(index + 1, tokens.tokens.length - index + 1, frac);
}
function createFrac(nominator, denominator) {
    // return [new Token('frac'),new Token('('),nominator,new Token(')'),new Token('('),denominator,new Token(')')]
}
function simplifiy(tokens) {
    if (tokens.length <= 1) {
        return tokens;
    }
    let i = 0, newTokens = [];
    while (i <= 100 && tokens.some((token) => (/(number|variable|powerVariable)/).test(token.type))) {
        i++;
        let eqindex = tokens.findIndex((token) => token.value === "=");
        let OperationIndex = tokens.findIndex((token) => (/(number|variable|powerVariable)/).test(token.type));
        if (OperationIndex === -1) {
            return tokens;
        }
        let currentToken = { type: tokens[OperationIndex].type, value: tokens[OperationIndex].value, variable: tokens[OperationIndex].variable, pow: tokens[OperationIndex].pow };
        let numberGroup = tokens
            .map((token, i) => ({ token, originalIndex: i }))
            .filter((item) => item.token.type === currentToken.type)
            .reduce((sum, item) => {
            let multiplier = (tokens[item.originalIndex - 1] && tokens[item.originalIndex - 1].value === "-") ? -1 : 1;
            multiplier *= (item.originalIndex <= eqindex) ? -1 : 1;
            if (!(/(number)/).test(item.token.type)) {
                multiplier *= -1;
            }
            return sum + (item.token.value * multiplier);
        }, 0);
        newTokens.push({
            ...currentToken,
            value: numberGroup
        });
        tokens = tokens.filter(token => token.type !== tokens[OperationIndex].type ||
            (token.variable && token.variable !== currentToken.variable) ||
            (token.pow && token.pow !== currentToken.pow));
    }
    return newTokens;
}
function rearrangeForIsolation(tokens, isolationGoal) {
    if (tokens.tokens.length <= 1)
        return tokens;
    const eqIndex = tokens.tokens.findIndex((t) => t.value === 'Equals');
    if (eqIndex === -1)
        throw new Error("No 'Equals' operator found in tokens");
    const switchDirection = false; // Future logic to determine direction
    const isolationGoalIndices = tokens.tokens
        .map((t, idx) => (t.type === isolationGoal.type && t.variable === isolationGoal.value ? idx : null))
        .filter((idx) => idx !== null);
    const otherIndices = tokens.tokens
        .map((_, idx) => (!isolationGoalIndices.includes(idx) && idx !== eqIndex ? idx : null))
        .filter((idx) => idx !== null);
    // Adjust signs
    tokens.tokens.forEach((token, i) => {
        if ((switchDirection ? i > eqIndex : i < eqIndex) && otherIndices.includes(i)) {
            token.value *= -1;
        }
        else if ((switchDirection ? i < eqIndex : i > eqIndex) && isolationGoalIndices.includes(i)) {
            token.value *= -1;
        }
    });
    // Separate sides
    const side1 = [];
    const side2 = [];
    tokens.tokens.forEach((token, i) => {
        if (isolationGoalIndices.includes(i))
            side1.push(token);
        if (otherIndices.includes(i))
            side2.push(token);
    });
    tokens.tokens = switchDirection
        ? [...side2, tokens.tokens[eqIndex], ...side1]
        : [...side1, tokens.tokens[eqIndex], ...side2];
}
function operationsOrder(tokens) {
    function findOperatorIndex(begin, end, tokens, findParenIndex, regex) {
        while (begin < end && begin < tokens.length) {
            let index;
            if (regex) {
                index = tokens.slice(begin, end).findIndex((token) => token.type === "operator" && regex.test(token.value));
            }
            else {
                index = tokens.slice(begin, end).findIndex((token) => token.type === "operator");
            }
            if (index === -1)
                return -1;
            index += begin;
            if (!/[+-]/.test(tokens[index].value)) {
                return index;
            }
            if (index > 0 && index < tokens.length - 1) {
                if (tokens[index - 1].type === tokens[index + 1].type) {
                    return index;
                }
            }
            begin = index + 1;
        }
        return -1;
    }
    let begin = 0, end = tokens.length, j = 0;
    let currentID = null;
    let checkedIDs = [];
    let operatorFound = false;
    while (!operatorFound && j < 200) {
        // Find the innermost parentheses
        for (let i = 0; i < tokens.length; i++) {
            j++;
            if (tokens[i].value === "(" && !checkedIDs.includes(tokens[i].id)) {
                currentID = findParenIndex(tokens[i].id);
            }
            if (currentID !== null && i === currentID.close) {
                [begin, end] = [currentID.open, currentID.close];
                break;
            }
        }
        if (!currentID) {
            begin = 0;
            end = tokens.length;
            break;
        }
        operatorFound = findOperatorIndex(begin, end, tokens) !== -1;
        // If no operator is found, mark this parentheses pair as checked
        if (!operatorFound) {
            checkedIDs.push(currentID.id);
            currentID = null;
        }
    }
    if (j >= 200) {
        throw new Error("operationsOrder Failed exceeded 200 revisions");
    }
    for (let i = 1; i <= 6; i++) {
        let priority = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(i, true));
        if (priority !== -1)
            return priority;
    }
    return null;
}
export class Position {
    operator;
    index;
    transition;
    specialChar;
    left;
    right;
    constructor(tokens, index) {
        if (index)
            this.index = index;
        this.transition = this.index;
        this.position(tokens);
    }
    position(tokens) {
        this.index = !this.index ? operationsOrder(tokens) : this.index;
        if (this.index === null || this.index >= tokens.length - 1) {
            return;
        }
        this.operator = tokens[this.index].value;
        console.log(getOperatorsByAssociativity('right'));
        switch (true) {
            case getOperatorsByAssociativity('both').includes(this.operator):
                this.left = this.applyPosition(tokens, this.index, "left");
                this.right = this.applyPosition(tokens, this.index, "right");
                break;
            case getOperatorsByAssociativity('right').includes(this.operator):
                this.left = { breakChar: this.index };
                this.right = this.applyPosition(tokens, this.index, "right");
                break;
            case getOperatorsByAssociativity('doubleRight').includes(this.operator):
                this.left = this.applyPosition(tokens, this.index, "right");
                this.transition = this.left.breakChar;
                this.right = this.applyPosition(tokens, this.transition - 1, "right");
                this.left.breakChar = this.index;
                this.right.breakChar + (this.right.multiStep ? 1 : 0);
                break;
            default:
                throw new Error(`Operator ${this.operator} was not accounted for, or is not the valid operator`);
        }
        //console.log(tokens.tokens)
        this.specialChar = tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
    }
    applyPosition(tokens, index, direction) {
        let breakChar = index;
        let target;
        let multiStep = false;
        const isLeft = direction === "left";
        const indexModifier = isLeft ? -1 : 1;
        if ((isLeft && index <= 0) || (!isLeft && index >= tokens.length - 1) || !tokens[index + indexModifier]) {
            throw new Error("at applyPosition: \"index wasn't valid\" index: " + index);
        }
        if (tokens[index + indexModifier].type === "paren") {
            const parenIndex = findParenIndex(tokens[index + indexModifier].id);
            breakChar = isLeft ? parenIndex.open : parenIndex.close + 1;
            target = tokens.slice(parenIndex.open, parenIndex.close + 1);
        }
        else {
            breakChar = index + indexModifier;
            target = [tokens[breakChar]];
            breakChar += isLeft ? 0 : 1;
        }
        //const multiStep = Math.abs(breakChar - index) > 3;
        if (!multiStep && tokens[index + indexModifier].type === "paren") {
            //target=target.find(item => /(number|variable|powerVariable)/.test(item.type))
        }
        if (target?.length === 0) {
            throw new Error(`at applyPosition: couldn't find target token for direction ${direction} and operator"${tokens[index].value}"`);
        }
        //breakChar = (breakChar !== index ? target?.index : breakChar)+ indexModifier+(isLeft?0:1);
        //delete target.index
        if (target.length === 3) {
            //target=target.find((item: { type: string; }) => /(number|variable|powerVariable)/.test(item.type))
        }
        else if (target.length > 1)
            multiStep = true;
        return {
            tokens: target,
            multiStep: multiStep,
            breakChar: breakChar,
        };
    }
    checkMultiStep() {
        return ((getOperatorsByAssociativity('both').includes(this.operator) && this.left?.multiStep) || this.right?.multiStep) && this.operator === 'Multiplication';
    }
    isLeftVar() {
        return this.left.multiStep ? this.left.tokens.some((t) => t.type === 'variable' || t.type === 'powerVariable') : this.left.tokens.type.includes('ariable');
    }
    isRightVar() {
        return this.right.multiStep ? this.right.tokens.some((t) => t.type === 'variable' || t.type === 'powerVariable') : this.right.tokens.type.includes('ariable');
    }
    checkFrac() {
        return /(frac|\/)/.test(this.operator) && (this.isLeftVar() || this.isRightVar());
    }
}
export function parseOperator(operator) {
    switch (operator.operator) {
        case "sin":
            if (!operator.group1.isOperable)
                return false;
            const a = new Token(Math.sin(degreesToRadians(operator.group1.items[0].value)));
            //solved.value = ;
            break;
        default:
            throw new Error("Couldn't identify operator type at praise operator: " + operator.operator);
    }
    //return solved;
}
export class MathPraiser {
    input = "";
    tokens;
    solution = "";
    mathInfo = new MathInfo();
    i = 0;
    constructor(input) {
        this.input = input;
        this.processInput();
        this.tokens = new Tokens(this.input);
        console.log('this.tokens', this.tokens);
        this.addDebugInfo("Tokens after tokenize", this.tokens.tokens);
        //this.input=this.tokens.reconstruct()
        this.solution = this.controller();
    }
    getRedyforNewRond() {
        //this.tokens.connectNearbyTokens();
        //this.mathInfo.addMathInfo(this.tokens)
        //this.addDebugInfo(this.tokens.tokens,this.tokens.tokens.length)
        //this.tokens.expressionVariableValidity();
    }
    controller() {
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
    useParse(position) {
        const solved = parse(position);
        this.mathInfo.addDebugInfo("solved", solved);
        const [leftBreak, length] = [position.left.breakChar, position.right.breakChar - position.left.breakChar];
        this.tokens.insertTokens(leftBreak, length, solved);
        this.mathInfo.addSolution(this.tokens, position, solved);
        this.addDebugInfo("newTokens", this.tokens.tokens);
        return this.controller();
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
        return this.controller();
        //this.tokens.insertTokens()
        //Use possession
    }
    useQuadratic() {
        this.tokens.tokens = simplifiy(this.tokens.tokens);
        const filterByType = (type) => this.tokens.tokens.filter((token) => token.type === type);
        const [numberIndex, variableIndex, powIndex] = [filterByType("number"), filterByType("variable"), filterByType("powerVariable")];
        this.mathInfo.addDebugInfo("simplifiy(tokens)", this.tokens.tokens);
        if (powIndex.length === 1 && powIndex[0].pow === 2) {
            return quad(powIndex[0]?.value | 0, variableIndex[0]?.value | 0, numberIndex[0]?.value * -1 | 0, powIndex[0].variable);
        }
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
        return this.tokens.reconstruct();
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLElBQUksRUFBaUMsZ0JBQWdCLEVBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQU01SCxPQUFPLEVBQUUsY0FBYyxFQUF1QixNQUFNLHdCQUF3QixDQUFDO0FBQzdFLE9BQU8sRUFBMkIsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUscUJBQXFCLEVBQXFELE1BQU0sc0JBQXNCLENBQUM7QUFJck0sT0FBTyxFQUE4QixLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDNUUsTUFBTSxZQUFZLEdBQUc7SUFDakIsT0FBTyxFQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPO0lBQzVFLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUs7SUFDeEUsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTztDQUMxRCxDQUFDO0FBQ0Y7OztHQUdHO0FBRUgsTUFBTSxVQUFVLHdCQUF3QixDQUFDLEdBQVU7SUFDL0MsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDbkMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FB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QUFNLENBQUE7UUFDN0IsSUFBRyxDQUFDLE1BQU07WUFBQyxPQUFPO1FBQ2xCLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNuQixzQ0FBc0M7WUFDdEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFBO1lBQ2xDLFFBQVE7WUFDUixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixNQUFNLEtBQUssR0FBRztvQkFDVixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLEtBQUssRUFBRSxDQUFDO29CQUNSLFFBQVEsRUFBRSxTQUFTO2lCQUN0QixDQUFDO2dCQUNGLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUUsQ0FBQztvQkFDNUIsS0FBSyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxDQUFDO2dCQUVELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdCLENBQUM7WUFDRCxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxRQUFRLENBQUEsQ0FBQSxnQ0FBZ0M7SUFDbkQsQ0FBQztDQUNKO0FBRUQsTUFBTSxRQUFRO0NBRWI7QUFFRCxNQUFNLFFBQVE7Q0FFYiIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlcywgY2FsY3VsYXRlRmFjdG9yaWFsfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuLi9pbVZlcnlMYXp5XCI7XG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCByZWdFeHAgfSBmcm9tIFwiLi4vdGlrempheC90aWt6amF4XCI7XG5pbXBvcnQgeyAgfSBmcm9tIFwic3JjL3V0aWxzL3N0YXRpY0RhdGFcIjtcbmltcG9ydCB7IGNwIH0gZnJvbSBcImZzXCI7XG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcyB9IGZyb20gXCIuLi91dGlscy90b2tlblV0ZW5zaWxzXCI7XG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0T3BlcmF0b3JzQnlCcmFja2V0LCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzIH0gZnJvbSBcIi4uL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XG5pbXBvcnQgeyBudW1iZXIsIHN0cmluZyB9IGZyb20gXCJ6b2RcIjtcbmltcG9ydCB7IEJhc2ljVGlrelRva2VuIH0gZnJvbSBcInNyYy90aWt6amF4L2ludGVycHJldC90b2tlbml6ZVRpa3pqYXhcIjtcbmltcG9ydCB7IGdyb3VwIH0gZnJvbSBcImNvbnNvbGVcIjtcbmltcG9ydCB7IG1hdGhHcm91cCwgbWF0aEpheE9wZXJhdG9yLCBUb2tlbiwgVG9rZW5zIH0gZnJvbSBcIi4vbWF0aEpheFRva2Vuc1wiO1xuY29uc3QgZ3JlZWtMZXR0ZXJzID0gW1xuICAgICdBbHBoYScsJ2FscGhhJywgJ0JldGEnLCAnR2FtbWEnLCAnRGVsdGEnLCAnRXBzaWxvbicsICdaZXRhJywgJ0V0YScsICdUaGV0YScsIFxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXG4gICAgJ1NpZ21hJywgJ1RhdScsICdVcHNpbG9uJywgJ1BoaScsICdDaGknLCAnUHNpJywgJ09tZWdhJ1xuXTtcbi8qY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xuICAgICd0YW4nLCAnc2luJywgJ2NvcycsICdiaW5vbScsICdmcmFjJywgJ2FzaW4nLCAnYWNvcycsIFxuICAgICdhdGFuJywgJ2FyY2NvcycsICdhcmNzaW4nLCAnYXJjdGFuJywgJ2Nkb3QnLCdzcXJ0J1xuXSovXG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMoYXJyOiBhbnlbXSkge1xuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xuICAgIGxldCBzdGFydCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XG4gICAgICAgICAgICBpZiAoaSAtIHN0YXJ0ID4gMSkge1xuICAgICAgICAgICAgICAgIHNlcXVlbmNlcy5wdXNoKGFyci5zbGljZShzdGFydCwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhcnQgPSBpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzZXF1ZW5jZXM7XG59XG5cblxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cbn07XG5cbmV4cG9ydCBjbGFzcyBNYXRoSW5mb3tcbiAgICBkZWJ1Z0luZm86IHN0cmluZz1cIlwiO1xuICAgIHNvbHV0aW9uSW5mbzogYW55W109W107XG4gICAgbWF0aEluZm86IGFueVtdPVtdXG4gICAgZ3JhcGg6IHN0cmluZz1cIlwiO1xuICAgIGFkZEdyYXBoSW5mbyh2YWx1ZTogc3RyaW5nKXtcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtc2c6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IFRva2VuIHwgQXhpcyl7XG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUpOnZhbHVlKSsgXCJcXG4gXCI7XG4gICAgfVxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXM6IHN0cmluZyB8IG51bWJlciB8IFRva2VuIHwgQXhpcyl7XG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xuICAgIH1cbiAgICBhZGRNYXRoSW5mbyh0b2tlbnM6IFRva2Vucyl7XG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgICAgIHRoaXMubWF0aEluZm8ucHVzaChyZWNvbnN0cnVjdGVkTWF0aClcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJSZWNvbnN0cnVjdGVkIG1hdGhcIixyZWNvbnN0cnVjdGVkTWF0aCk7XG4gICAgfVxuXG4gICAgYWRkU29sdXRpb24odG9rZW5zOiBUb2tlbnMscG9zaXRpb246IFBvc2l0aW9uLHNvbHV0aW9uOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xuICAgICAgICBzb2x1dGlvbj10b2tlbnMucmVjb25zdHJ1Y3QoW3NvbHV0aW9uXSk7XG4gICAgICAgIGNvbnN0IGxlZnQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24uaW5kZXgpKTtcbiAgICAgICAgY29uc3QgcmlnaHQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24uaW5kZXgrMSxwb3NpdGlvbi5yaWdodC5icmVha0NoYXIsKSk7XG5cbiAgICAgICAgc3dpdGNoICh0cnVlKXtcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aEJ1dFJpZ2h0QnJhY2tldC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGguaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKC9cXCovZywgXCJcXFxcY2RvdFwiKX0gJHtyaWdodH0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249IGBcXFxcZnJhY3ske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5SaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoXCIvXCIsXCJmcmFjXCIpfXske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFkZFNvbHV0aW9uSW5mbyhzb2x1dGlvbik7XG4gICAgfVxufVxuXG4vKlxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XG4gICAgaWYgKCEodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSl7cmV0dXJuIHZhbHVlfVxuICAgIGlmICh2YWx1ZT09PVwiK1wiKXtyZXR1cm4gMH1cbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QodmFsdWUpKXtyZXR1cm4gMX1cbiAgICBpZigvWyhbXS8udGVzdCh2YWx1ZVswXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMSl9XG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxuICAgIGZvciAobGV0IGkgPSAwOyBpPHZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVbaV0gPT09IFwic3RyaW5nXCIgJiYgL1soKVtcXF1dLy50ZXN0KHZhbHVlW2ldKSkge1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcbiAgICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xuICAgIHJldHVybiBpc05hTihudW0pID8gdmFsdWUubGVuZ3RoPjA/dmFsdWU6MCA6IG51bTtcbn0qL1xuXG5mdW5jdGlvbiBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcjogc3RyaW5nLGxlZnQ6IGFueSxyaWdodDogYW55KXtcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIGxlZnQ/LnZhbHVlIT09XCJudW1iZXJcIiYmZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJykuaW5jbHVkZXMob3BlcmF0b3IpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodD8udmFsdWUhPT1cIm51bWJlclwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJpZ2h0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XG4gICAgfVxufVxuXG5cblxuZnVuY3Rpb24gcGFyc2UocG9zaXRpb246IHsgb3BlcmF0b3I6IGFueTsgc3BlY2lhbENoYXI/OiBhbnk7IGxlZnQ/OiBhbnk7IHJpZ2h0PzogYW55OyB9KSB7XG4gICAgbGV0IHsgb3BlcmF0b3Isc3BlY2lhbENoYXIsIGxlZnQscmlnaHR9ID0gcG9zaXRpb247XG4gICAgXG4gICAgbGVmdD1sZWZ0Py50b2tlbnNcbiAgICByaWdodD1yaWdodC50b2tlbnNcbiAgICAvL2NvbnNvbGUubG9nKCd0aGlzLmxlZnQsdGhpcy5yaWdodCcsbGVmdCxyaWdodClcbiAgICBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcixsZWZ0LHJpZ2h0KTtcbiAgICBcbiAgICBsZXQgc29sdmVkPW5ldyBUb2tlbigwLHVuZGVmaW5lZCk7XG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlIFwiU3F1YXJlIFJvb3RcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KHJpZ2h0LnZhbHVlLHNwZWNpYWxDaGFyIT09bnVsbD8oMSkvKHNwZWNpYWxDaGFyKTowLjUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJQb3dcIjpcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlfHxyaWdodC52YXJpYWJsZSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZXx8bGVmdC52YXJpYWJsZT09PXJpZ2h0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU/cmlnaHQudmFyaWFibGU6XCJcIjtcbiAgICAgICAgICAgICAgICAvL3NvbHZlZC5wb3c9MlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cobGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIkZyYWN0aW9uXCI6XG4gICAgICAgIGNhc2UgXCIvXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiTXVsdGlwbGljYXRpb25cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKiByaWdodC52YWx1ZTtcbiAgICAgICAgICAgIGhhbmRsZVZyaWFibGVzKGxlZnQsIHJpZ2h0LHNvbHZlZCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIitcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKyByaWdodC52YWx1ZTtcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIk1pbnVzXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlIC0gcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlRmFjdG9yaWFsKGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzaW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiY29zXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSlcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidGFuXCI6XG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoXCJ0YW4gTXVzdCBiZSBzbWFsbGVyIHRoYW4gOTBcIik7fVxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImFzaW5cIjpcbiAgICAgICAgY2FzZSBcImFyY3NpblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFzaW4ocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYWNvc1wiOlxuICAgICAgICBjYXNlIFwiYXJjY29zXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYWNvcyhyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhdGFuXCI6XG4gICAgICAgIGNhc2UgXCJhcmN0YW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGlkZW50aWZ5IG9wZXJhdG9yIHR5cGUgYXQgcHJhaXNlIG9wZXJhdG9yOiBcIitwb3NpdGlvbi5vcGVyYXRvcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0OiB7IHZhcmlhYmxlOiBhbnk7IHBvdzogYW55OyB2YWx1ZTogbnVtYmVyOyB9LCByaWdodDogeyB2YXJpYWJsZTogYW55OyBwb3c6IGFueTsgdmFsdWU6IG51bWJlcjsgfSwgc29sdmVkOiBUb2tlbikge1xuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSAmJiBsZWZ0LnZhcmlhYmxlICE9PSByaWdodC52YXJpYWJsZSkge1xuICAgICAgICAgICAgLyogS2VlcCB0aGVtIHNlcGFyYXRlIHNpbmNlIHRoZXkgaGF2ZSBkaWZmZXJlbnQgdmFyaWFibGVzXG4gICAgICAgICAgICBzb2x2ZWQudGVybXMgPSBbXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogbGVmdC52YXJpYWJsZSwgcG93OiBsZWZ0LnBvdyB8fCAxLCB2YWx1ZTogbGVmdC52YWx1ZSB8fCAxIH0sXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogcmlnaHQudmFyaWFibGUsIHBvdzogcmlnaHQucG93IHx8IDEsIHZhbHVlOiByaWdodC52YWx1ZSB8fCAxIH1cbiAgICAgICAgICAgIF07Ki9cbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpZmZlcmVudCB2YXJpYWJsZSBiYXNlcyBhdCBwb3dlciBtdWx0aXBsaWNhdGlvbi4gSSBkaWRuJ3QgZ2V0IHRoZXJlIHlldFwiKVxuICAgICAgICB9XG4gICAgXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlID0gbGVmdC52YXJpYWJsZSB8fCByaWdodC52YXJpYWJsZTtcbiAgICAgICAgc29sdmVkLnZhcmlhYmxlID0gdmFyaWFibGUubGVuZ3RoPjA/dmFyaWFibGU6dW5kZWZpbmVkO1xuICAgICAgICBcbiAgICAgICAgbGV0IHBvdyA9IChsZWZ0LnBvdyB8fCAwKSArIChyaWdodC5wb3cgfHwgMCk7XG4gICAgICAgIHBvdz1sZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlJiZwb3c9PT0wJiYhbGVmdC5wb3cmJiFyaWdodC5wb3c/Mjpwb3c7XG4gICAgICAgIC8vc29sdmVkLnBvdyA9IHBvdyB8fCB1bmRlZmluZWQ7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIFJ1bGUgMzogSGFuZGxlIG11bHRpcGxpY2F0aW9uIG9mIGNvbnN0YW50c1xuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XG4gICAgICAgIGNvbnN0IHJpZ2h0VmFsdWUgPSByaWdodC52YWx1ZSB8fCAxO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGxlZnRWYWx1ZSAqIHJpZ2h0VmFsdWU7XG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQ6IGFueSxyaWdodDogYW55LHNvbHZlZDogVG9rZW4pe1xuICAgICAgICBsZXQgaGFuZGxlZD17VmFyOm51bGwsUG93Om51bGx9O1xuICAgICAgICBpZiAoIWxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7XG4gICAgICAgICAgICByZXR1cm4gO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwb3NpdGlvbi5vcGVyYXRvcj09PScqJyl7cmV0dXJuIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdCxyaWdodCxzb2x2ZWQpfVxuICAgICAgICAvL2NvbnNvbGUubG9nKGxlZnQudmFyaWFibGUscmlnaHQudmFyaWFibGUpXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVHdvIHZhcmlhYmxlIGVxdWF0aW9ucyBhcmVuJ3QgYWNjZXB0ZWQgeWV0XCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XG4gICAgICAgIC8vc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyXG5cbiAgICAgICAgLypcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV9XG4gICAgICAgIGVsc2UgaWYgKCFsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlfVxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cbiAgICAgICAgKi9cbiAgICB9XG5cblxuICAgIHJldHVybiBzb2x2ZWQ7XG59XG5cblxuXG5cblxuZnVuY3Rpb24gcmVhcnJhbmdlRXF1YXRpb24odG9rZW5zOiBhbnksdG9rZW5Ub2lzb2xhdGU6IGFueSl7XG4gICAgXG59XG5cbmZ1bmN0aW9uIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0b2tlbnM6IGFueSxpc29sYXRUb2tlbjogVG9rZW4pe1xuICAgIGNvbnN0IGluZGV4PW9wZXJhdGlvbnNPcmRlcih0b2tlbnMpXG4gICAgY29uc3QgSXNvbGF0ZWQ9dG9rZW5zLnRva2Vucy5maW5kKCh0b2tlbjogYW55LCBpZHg6IG51bWJlcik9PmlkeDxpbmRleClcbiAgICBjb25zdCBmcmFjPWNyZWF0ZUZyYWModG9rZW5zLmxpc3Quc2xpY2UoaW5kZXggKyAxKSxuZXcgVG9rZW4oSXNvbGF0ZWQudmFsdWUpKVxuICAgIElzb2xhdGVkLnZhbHVlPTE7XG4gICAgdG9rZW5zLmluc2VydFRva2VucyhpbmRleCsxLHRva2Vucy50b2tlbnMubGVuZ3RoLWluZGV4KzEsZnJhYylcbn1cblxuZnVuY3Rpb24gY3JlYXRlRnJhYyhub21pbmF0b3I6IGFueSxkZW5vbWluYXRvcjogVG9rZW4pe1xuICAgLy8gcmV0dXJuIFtuZXcgVG9rZW4oJ2ZyYWMnKSxuZXcgVG9rZW4oJygnKSxub21pbmF0b3IsbmV3IFRva2VuKCcpJyksbmV3IFRva2VuKCcoJyksZGVub21pbmF0b3IsbmV3IFRva2VuKCcpJyldXG59XG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zOiBhbnlbXSl7XG4gICAgaWYgKHRva2Vucy5sZW5ndGg8PTEpe3JldHVybiB0b2tlbnN9XG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUoKHRva2VuOiBhbnkpID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxuICAgIHtcbiAgICAgICAgaSsrO1xuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xuICAgICAgICBsZXQgT3BlcmF0aW9uSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0pID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpO1xuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XG5cbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XG5cbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuOiBhbnksIGk6IGFueSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IHRva2VuOiB7IHR5cGU6IGFueTsgfTsgfSkgPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxuICAgICAgICAucmVkdWNlKChzdW06IG51bWJlciwgaXRlbTogeyBvcmlnaW5hbEluZGV4OiBudW1iZXI7IHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IG51bWJlcjsgfTsgfSkgPT4ge1xuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gXCItXCIpID8gLTEgOiAxO1xuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxuICAgICAgICByZXR1cm4gc3VtICsgKGl0ZW0udG9rZW4udmFsdWUgKiBtdWx0aXBsaWVyKTtcbiAgICAgICAgfSwgMCk7IFxuICAgICAgICBcbiAgICAgICAgbmV3VG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXG4gICAgICAgICAgICB0b2tlbi50eXBlICE9PSB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgfHwgXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld1Rva2Vucztcbn1cblxuZnVuY3Rpb24gcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRva2VuczogVG9rZW5zLCBpc29sYXRpb25Hb2FsOiB7IHR5cGU6IGFueTsgdmFsdWU6IGFueTsgb3ZlcnZpZXdTaWRlT25lPzogTWFwPGFueSwgYW55Pjsgb3ZlcnZpZXdTaWRlVHdvPzogTWFwPGFueSwgYW55PjsgfSkge1xuICAgIGlmICh0b2tlbnMudG9rZW5zLmxlbmd0aCA8PSAxKSByZXR1cm4gdG9rZW5zO1xuXG4gICAgY29uc3QgZXFJbmRleCA9IHRva2Vucy50b2tlbnMuZmluZEluZGV4KCh0OiB7IHZhbHVlOiBzdHJpbmc7IH0pID0+IHQudmFsdWUgPT09ICdFcXVhbHMnKTtcbiAgICBpZiAoZXFJbmRleCA9PT0gLTEpIHRocm93IG5ldyBFcnJvcihcIk5vICdFcXVhbHMnIG9wZXJhdG9yIGZvdW5kIGluIHRva2Vuc1wiKTtcblxuICAgIGNvbnN0IHN3aXRjaERpcmVjdGlvbiA9IGZhbHNlOyAvLyBGdXR1cmUgbG9naWMgdG8gZGV0ZXJtaW5lIGRpcmVjdGlvblxuICAgIGNvbnN0IGlzb2xhdGlvbkdvYWxJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xuICAgICAgICAubWFwKCh0OiB7IHR5cGU6IGFueTsgdmFyaWFibGU6IGFueTsgfSwgaWR4OiBhbnkpID0+ICh0LnR5cGUgPT09IGlzb2xhdGlvbkdvYWwudHlwZSAmJiB0LnZhcmlhYmxlID09PSBpc29sYXRpb25Hb2FsLnZhbHVlID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XG5cbiAgICBjb25zdCBvdGhlckluZGljZXMgPSB0b2tlbnMudG9rZW5zXG4gICAgICAgIC5tYXAoKF86IGFueSwgaWR4OiBhbnkpID0+ICghaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaWR4KSAmJiBpZHggIT09IGVxSW5kZXggPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcigoaWR4OiBudWxsfG51bWJlcikgPT4gaWR4ICE9PSBudWxsKTtcblxuICAgIC8vIEFkanVzdCBzaWduc1xuICAgIHRva2Vucy50b2tlbnMuZm9yRWFjaCgodG9rZW46IHsgdmFsdWU6IG51bWJlcjsgfSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpID4gZXFJbmRleCA6IGkgPCBlcUluZGV4KSAmJiBvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHtcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xuICAgICAgICB9IGVsc2UgaWYgKChzd2l0Y2hEaXJlY3Rpb24/IGkgPCBlcUluZGV4IDogaSA+IGVxSW5kZXgpICYmIGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gU2VwYXJhdGUgc2lkZXNcbiAgICBjb25zdCBzaWRlMTogYW55W10gPSBbXTtcbiAgICBjb25zdCBzaWRlMjogYW55W10gPSBbXTtcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnksIGk6IGFueSkgPT4ge1xuICAgICAgICBpZiAoaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHNpZGUxLnB1c2godG9rZW4pO1xuICAgICAgICBpZiAob3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMi5wdXNoKHRva2VuKTtcbiAgICB9KTtcblxuICAgIHRva2Vucy50b2tlbnMgPSBzd2l0Y2hEaXJlY3Rpb25cbiAgICAgICAgPyBbLi4uc2lkZTIsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUxXVxuICAgICAgICA6IFsuLi5zaWRlMSwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTJdO1xufVxuXG5mdW5jdGlvbiBvcGVyYXRpb25zT3JkZXIodG9rZW5zOiBhbnlbXSkge1xuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luOiBudW1iZXIsIGVuZDogbnVtYmVyLCB0b2tlbnM6IGFueSwgZmluZFBhcmVuSW5kZXg/OiBhbnksIHJlZ2V4PzogYW55KSB7XG4gICAgICAgIHdoaWxlIChiZWdpbiA8IGVuZCAmJiBiZWdpbiA8IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxldCBpbmRleDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBhbnk7IH0pID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIiAmJiByZWdleC50ZXN0KHRva2VuLnZhbHVlKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9KSA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vuc1tpbmRleF0udmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBpbmRleCA8IHRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJlZ2luID0gaW5kZXggKyAxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMubGVuZ3RoLGo9MDtcbiAgICBsZXQgY3VycmVudElEID0gbnVsbDsgIFxuICAgIGxldCBjaGVja2VkSURzOiBhbnlbXSA9IFtdOyAgXG4gICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTtcbiAgICB3aGlsZSAoIW9wZXJhdG9yRm91bmQmJmo8MjAwKSB7XG4gICAgICAgIC8vIEZpbmQgdGhlIGlubmVybW9zdCBwYXJlbnRoZXNlc1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaisrO1xuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zW2ldLmlkKSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IGZpbmRQYXJlbkluZGV4KHRva2Vuc1tpXS5pZCk7ICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjdXJyZW50SUQhPT1udWxsJiZpPT09Y3VycmVudElELmNsb3NlKSB7XG4gICAgICAgICAgICAgICAgW2JlZ2luLGVuZF09W2N1cnJlbnRJRC5vcGVuLGN1cnJlbnRJRC5jbG9zZV1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcbiAgICAgICAgICAgIGJlZ2luID0gMDtcbiAgICAgICAgICAgIGVuZCA9IHRva2Vucy5sZW5ndGg7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBvcGVyYXRvckZvdW5kID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sZW5kLHRva2VucykhPT0tMTtcblxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxuICAgICAgICBpZiAoIW9wZXJhdG9yRm91bmQpIHtcbiAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQuaWQpOyAgXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGo+PTIwMCl7dGhyb3cgbmV3IEVycm9yKFwib3BlcmF0aW9uc09yZGVyIEZhaWxlZCBleGNlZWRlZCAyMDAgcmV2aXNpb25zXCIpO31cblxuICAgIGZvciAobGV0IGk9MTtpPD02O2krKyl7XG4gICAgICAgIGxldCBwcmlvcml0eSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHkoaSx0cnVlKSk7XG4gICAgICAgIGlmKHByaW9yaXR5IT09LTEpcmV0dXJuIHByaW9yaXR5XG4gICAgfVxuICAgIHJldHVybiBudWxsXG59XG5cblxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uIHtcbiAgICBvcGVyYXRvcjogc3RyaW5nO1xuICAgIGluZGV4OiBudW1iZXI7XG4gICAgdHJhbnNpdGlvbjogbnVtYmVyO1xuICAgIHNwZWNpYWxDaGFyOiBzdHJpbmc7XG4gICAgbGVmdDogYW55O1xuICAgIHJpZ2h0OiBhbnk7XG4gICAgY29uc3RydWN0b3IodG9rZW5zOiBhbnlbXSwgaW5kZXg/OiBudW1iZXIpe1xuICAgICAgICBpZihpbmRleClcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmluZGV4O1xuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcbiAgICB9XG4gICAgcG9zaXRpb24odG9rZW5zOiBhbnlbXSkge1xuICAgICAgICB0aGlzLmluZGV4ID0gIXRoaXMuaW5kZXg/IG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIDogdGhpcy5pbmRleDtcbiAgICAgICAgaWYgKHRoaXMuaW5kZXggPT09IG51bGwgfHwgdGhpcy5pbmRleCA+PSB0b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnNbdGhpcy5pbmRleF0udmFsdWU7Y29uc29sZS5sb2coZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdyaWdodCcpKVxuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdyaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHticmVha0NoYXI6IHRoaXMuaW5kZXh9O1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnZG91YmxlUmlnaHQnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5sZWZ0LmJyZWFrQ2hhcjtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLTEsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0LmJyZWFrQ2hhcisodGhpcy5yaWdodC5tdWx0aVN0ZXA/MTowKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IHdhcyBub3QgYWNjb3VudGVkIGZvciwgb3IgaXMgbm90IHRoZSB2YWxpZCBvcGVyYXRvcmApO1xuICAgICAgICB9XG4gICAgICAgIC8vY29uc29sZS5sb2codG9rZW5zLnRva2VucylcbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgPyB0b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgOiBudWxsO1xuICAgIH1cbiAgICBhcHBseVBvc2l0aW9uKHRva2VuczogYW55W10sIGluZGV4OiAgbnVtYmVyLCBkaXJlY3Rpb246IHN0cmluZykge1xuICAgICAgICBsZXQgYnJlYWtDaGFyPWluZGV4XG4gICAgICAgIGxldCB0YXJnZXQ6IGFueVtdO1xuICAgICAgICBsZXQgbXVsdGlTdGVwPWZhbHNlO1xuICAgICAgICBjb25zdCBpc0xlZnQgPSBkaXJlY3Rpb24gPT09IFwibGVmdFwiO1xuICAgICAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcbiAgICAgICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpIHx8ICF0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImF0IGFwcGx5UG9zaXRpb246IFxcXCJpbmRleCB3YXNuJ3QgdmFsaWRcXFwiIGluZGV4OiBcIitpbmRleCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVuSW5kZXggPSBmaW5kUGFyZW5JbmRleCh0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xuICAgICAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2UrMTtcbiAgICAgICAgICAgIHRhcmdldCA9IHRva2Vucy5zbGljZShwYXJlbkluZGV4Lm9wZW4sIHBhcmVuSW5kZXguY2xvc2UrMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBicmVha0NoYXI9aW5kZXgraW5kZXhNb2RpZmllcjtcbiAgICAgICAgICAgIHRhcmdldCA9IFt0b2tlbnNbYnJlYWtDaGFyXV07XG4gICAgICAgICAgICBicmVha0NoYXIrPWlzTGVmdD8wOjFcbiAgICAgICAgfVxuICAgICAgICAvL2NvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+IDM7XG4gICAgXG4gICAgICAgIGlmICghbXVsdGlTdGVwJiZ0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKXtcbiAgICAgICAgICAgIC8vdGFyZ2V0PXRhcmdldC5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcbiAgICAgICAgfVxuICAgICAgICBpZiAodGFyZ2V0Py5sZW5ndGg9PT0wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGF0IGFwcGx5UG9zaXRpb246IGNvdWxkbid0IGZpbmQgdGFyZ2V0IHRva2VuIGZvciBkaXJlY3Rpb24gJHtkaXJlY3Rpb259IGFuZCBvcGVyYXRvclwiJHt0b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIC8vYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XG4gICAgICAgIC8vZGVsZXRlIHRhcmdldC5pbmRleFxuICAgICAgICBcbiAgICAgICAgaWYgKHRhcmdldC5sZW5ndGg9PT0zKXtcbiAgICAgICAgICAgIC8vdGFyZ2V0PXRhcmdldC5maW5kKChpdGVtOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcbiAgICAgICAgfWVsc2UgaWYodGFyZ2V0Lmxlbmd0aD4xKW11bHRpU3RlcD10cnVlXG4gICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0b2tlbnM6IHRhcmdldCxcbiAgICAgICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxuICAgICAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXIsXG4gICAgICAgIH07XG4gICAgfVxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XG4gICAgICAgIHJldHVybiAoKGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpJiZ0aGlzLmxlZnQ/Lm11bHRpU3RlcCl8fHRoaXMucmlnaHQ/Lm11bHRpU3RlcCkmJnRoaXMub3BlcmF0b3I9PT0nTXVsdGlwbGljYXRpb24nO1xuICAgIH1cbiAgICBpc0xlZnRWYXIoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXA/dGhpcy5sZWZ0LnRva2Vucy5zb21lKCh0OiB7IHR5cGU6IHN0cmluZzsgfSk9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5sZWZ0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcbiAgICB9XG4gICAgaXNSaWdodFZhcigpe1xuICAgICAgICByZXR1cm4gdGhpcy5yaWdodC5tdWx0aVN0ZXA/dGhpcy5yaWdodC50b2tlbnMuc29tZSgodDogeyB0eXBlOiBzdHJpbmc7IH0pPT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMucmlnaHQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxuICAgIH1cbiAgICBjaGVja0ZyYWMoKXsvLyF0aGlzLmNoZWNrTXVsdGlTdGVwKCkgSSBkb24ndCBrbm93IHdoeSBJIGhhZCB0aGlzIGhlcmVcbiAgICAgICAgcmV0dXJuIC8oZnJhY3xcXC8pLy50ZXN0KHRoaXMub3BlcmF0b3IpJiYodGhpcy5pc0xlZnRWYXIoKXx8dGhpcy5pc1JpZ2h0VmFyKCkpXG4gICAgfVxufVxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlT3BlcmF0b3Iob3BlcmF0b3I6IG1hdGhKYXhPcGVyYXRvcil7XG4gICAgc3dpdGNoIChvcGVyYXRvci5vcGVyYXRvcikge1xuICAgICAgICBjYXNlIFwic2luXCI6XG4gICAgICAgICAgICBpZighb3BlcmF0b3IuZ3JvdXAxLmlzT3BlcmFibGUpcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgYT1uZXcgVG9rZW4oTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyhvcGVyYXRvci5ncm91cDEuaXRlbXNbMF0udmFsdWUpKSlcbiAgICAgICAgICAgIC8vc29sdmVkLnZhbHVlID0gO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBpZGVudGlmeSBvcGVyYXRvciB0eXBlIGF0IHByYWlzZSBvcGVyYXRvcjogXCIrb3BlcmF0b3Iub3BlcmF0b3IpO1xuICAgIH1cbiAgICAvL3JldHVybiBzb2x2ZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcbiAgICBpbnB1dD1cIlwiO1xuICAgIHRva2VuczogVG9rZW5zO1xuICAgIHNvbHV0aW9uPVwiXCI7XG4gICAgbWF0aEluZm89bmV3IE1hdGhJbmZvKCk7XG4gICAgaT0wO1xuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xuICAgICAgICB0aGlzLnByb2Nlc3NJbnB1dCgpO1xuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCd0aGlzLnRva2VucycsdGhpcy50b2tlbnMpO1xuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlRva2VucyBhZnRlciB0b2tlbml6ZVwiLHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgLy90aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcbiAgICAgICAgdGhpcy5zb2x1dGlvbj10aGlzLmNvbnRyb2xsZXIoKTtcbiAgICB9XG4gICAgZ2V0UmVkeWZvck5ld1JvbmQoKXtcbiAgICAgICAgLy90aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XG4gICAgICAgIC8vdGhpcy5tYXRoSW5mby5hZGRNYXRoSW5mbyh0aGlzLnRva2VucylcbiAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyh0aGlzLnRva2Vucy50b2tlbnMsdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aClcbiAgICAgICAgLy90aGlzLnRva2Vucy5leHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpO1xuICAgIH1cbiAgICBjb250cm9sbGVyKCk6IGFueXtcblxuICAgICAgICBcbiAgICAgICAgLypcbiAgICAgICAgdGhpcy5pKys7XG4gICAgICAgIGlmKHRoaXMuaT4xMCl7cmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKX1cblxuICAgICAgICB0aGlzLmdldFJlZHlmb3JOZXdSb25kKCk7XG4gICAgICAgIC8vY29uc3Qgb3ZlcnZpZXc9dGhpcy50b2tlbnMuZ2V0T3ZlcnZpZXcoKVxuICAgICAgICBjb25zdCBwcmFpc2luZ01ldGhvZD1uZXcgUHJhaXNpbmdNZXRob2QodGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICBpZiAocHJhaXNpbmdNZXRob2QuaXNUaGVyZU9wZXJhdG9yT3RoZXJUaGFuRXF1YWxzKCkpe1xuICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy50b2tlbnMpO1xuICAgICAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJQYXJzZWQgZXhwcmVzc2lvblwiLCBKU09OLnN0cmluZ2lmeShwb3NpdGlvbiwgbnVsbCwgMSkpO1xuICAgICAgICAgICAgaWYgKHBvc2l0aW9uID09PSBudWxsJiZ0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjEpe1xuICAgICAgICAgICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8oXCJwYXJzZSh0b2tlbnMpXCIscGFyc2UodGhpcy50b2tlbnMudG9rZW5zKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJ0aGUgKioqKlwiXG4gICAgICAgICAgICAvLyByZXR1cm4gc29sdXRpb24odG9rZW5zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWMoKXx8cG9zaXRpb24uY2hlY2tNdWx0aVN0ZXAoKSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyh0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCh0aGlzLnRva2Vucy50b2tlbnMpKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy51c2VQYXJzZShwb3NpdGlvbilcbiAgICAgICAgfVxuICAgICAgICBpZihwcmFpc2luZ01ldGhvZC5pc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpKXtcbiAgICAgICAgICAgIHRoaXMudXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kKVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRvSXNvbGF0ZT1wcmFpc2luZ01ldGhvZC5pc0FueXRoaW5nVG9Jc29sYXRlKClcbiAgICAgICAgaWYgKHRvSXNvbGF0ZSl7XG4gICAgICAgICAgICByZWFycmFuZ2VGb3JJc29sYXRpb24odGhpcy50b2tlbnMsdG9Jc29sYXRlKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgIH0gICBcbiAgICAgICAgLy9pZiAoc29sdmVkID09PSBudWxsfHx0eXBlb2Ygc29sdmVkPT09XCJzdHJpbmdcIikge3JldHVybiBzb2x2ZWQ7IH1cbiAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKS8vdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTsqL1xuICAgIH1cblxuICAgIHVzZVBhcnNlKHBvc2l0aW9uOiBQb3NpdGlvbil7XG4gICAgICAgIGNvbnN0IHNvbHZlZCA9IHBhcnNlKHBvc2l0aW9uKTtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzb2x2ZWRcIixzb2x2ZWQpXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXG4gICAgICAgIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbih0aGlzLnRva2Vucyxwb3NpdGlvbixzb2x2ZWQpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICB9XG4gICAgXG4gICAgcHJhaXNpbmdNZXRob2QoKXtcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcbiAgICAgICAgY29uc3QgW251bWJlckluZGV4LHZhcmlhYmxlSW5kZXgscG93SW5kZXhdID0gW2ZpbHRlckJ5VHlwZShcIm51bWJlclwiKSxmaWx0ZXJCeVR5cGUoXCJ2YXJpYWJsZVwiKSxmaWx0ZXJCeVR5cGUoXCJwb3dlclZhcmlhYmxlXCIpXVxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVzZVF1YWRyYXRpYygpXG4gICAgICAgIHJldHVybiB0aGlzLnVzZUlzb2xhdCgpOyovXG4gICAgfVxuXG4gICAgdXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kOiBQcmFpc2luZ01ldGhvZCl7XG4gICAgICAgIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0aGlzLnRva2VucyxuZXcgVG9rZW4ocHJhaXNpbmdNZXRob2QudmFyaWFibGVzWzBdKSlcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgIC8vdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKClcbiAgICAgICAgLy9Vc2UgcG9zc2Vzc2lvblxuICAgIH1cblxuICAgIHVzZVF1YWRyYXRpYygpe1xuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnM9c2ltcGxpZml5KHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZTogc3RyaW5nKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcigodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9KSA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcbiAgICAgICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcXVhZChcbiAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0/LnZhbHVlICB8IDAsXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0/LnZhbHVlIHwgMCxcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0/LnZhbHVlICogLTF8IDAsXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdLnZhcmlhYmxlLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtZXM6IHN0cmluZyx2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxuICAgIH1cbiAgICBwcm9jZXNzSW5wdXQoKXtcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKVxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcbiAgICAgICAgLy8ucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XG4gICAgfVxuICAgIGZpbmFsUmV0dXJuKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgfVxufVxuXG5jbGFzcyBtYXRoVmFyaWFibGVze1xuXG59XG5cblxuXG5cblxuXG5cblxuXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycjogYW55KSB7XG4gICAgbGV0IHJlc3VsdCA9IFtdO1xuICAgIGxldCBzdGFjayA9IEFycmF5LmlzQXJyYXkoYXJyKSA/IFsuLi5hcnJdIDogW2Fycl07XG5cbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IG5leHQgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobmV4dCkpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7IFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2gobmV4dCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5yZXZlcnNlKCk7XG59XG5cblxuXG5jbGFzcyBQcmFpc2luZ01ldGhvZHtcbiAgICB0b2tlbnNcbiAgICBvdmVydmlldzogYW55O1xuICAgIHZhcmlhYmxlczogYW55W107XG4gICAgY29uc3RydWN0b3IodG9rZW5zOiBhbnkpe1xuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnNcbiAgICAgICAgdGhpcy5vdmVydmlldz10aGlzLmdldE92ZXJ2aWV3KClcbiAgICAgICAgdGhpcy5hc3NpZ25WYXJpYWJsZXMoKVxuICAgIH1cbiAgICBpc1ZhcldpdGhWYWx1ZUJpZ2dlclRoYW5PbmUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnNvbWUoKHQ6IGFueSk9PiB0LnR5cGU9PT0ndmFyaWFibGUnJiZ0LnZhbHVlPjEpXG4gICAgfVxuXG4gICAgaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFzZVZhcmlhYmxlKCkmJnRoaXMuaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCkmJnRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKVxuICAgIH1cbiAgICBpc0lzb2xhdGUoKXtcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5cbiAgICB9XG5cbiAgICBpc0FueXRoaW5nVG9Jc29sYXRlKCl7XG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzLmxlbmd0aD4xKXRocm93IG5ldyBFcnJvcihcInR3byB2YXIgZXEgYXJlbnQgc2Fwb3J0ZWQgeWV0XCIpXG4gICAgICAgIGlmKCF0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpcmV0dXJuO1xuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMuZXF1YWxzSW5kZXhJZkFueSgpO1xuICAgICAgICBpZighZXFJbmRleCl7cmV0dXJufTtcbiAgICAgICAgY29uc3QgYmVmb3IgPSB0aGlzLmdldE92ZXJ2aWV3KHRoaXMudG9rZW5zLnNsaWNlKDAsZXFJbmRleCkpXG4gICAgICAgIGNvbnN0IGFmdGVyID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZShlcUluZGV4KzEpKVxuICAgICAgICBjb25zdCB3aGF0VG9Jc29sYXQgPXRoaXMud2hhdFRvSXNvbGF0KCk7XG4gICAgICAgIGlmICgoIWJlZm9yfHwhYWZ0ZXIpfHwhd2hhdFRvSXNvbGF0fHwoYmVmb3I/LnNpemU8MiYmYWZ0ZXI/LnNpemU8MikpcmV0dXJuO1xuICAgICAgICByZXR1cm4ge292ZXJ2aWV3U2lkZU9uZTogYmVmb3Isb3ZlcnZpZXdTaWRlVHdvOiBhZnRlciwuLi53aGF0VG9Jc29sYXR9XG4gICAgfS8qXG4gICAgaG93VG9Jc29sYXRlKG92ZXJ2aWV3U2lkZU9uZSxvdmVydmlld1NpZGVUd28saXNvbGF0aW9uR29vbCl7XG4gICAgICAgIGNvbnN0IGlzb2xhdGlvblR5cGU9aXNvbGF0aW9uR29vbC5zcGx0KCc6Jyk7XG4gICAgICAgIC8vaWYgKCl7fVxuICAgIH0qL1xuICAgIHdoYXRUb0lzb2xhdCgpe1xuICAgICAgICAvLyBpIG5lZWQgdG8gYWRkIHBvd3MgYWZ0ZXJcbiAgICAgICAgLy8gZm9yIGtub3cgaW0gZ29pbmcgb24gdGhlIG9zaG9tc2hpbiB0aGF0IHRociBpcyBvbmx5IG9uZSB2YXJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXM/Lmxlbmd0aDwxKXJldHVybjtcblxuICAgICAgICByZXR1cm4ge3R5cGU6ICd2YXJpYWJsZScsdmFsdWU6IHRoaXMudmFyaWFibGVzWzBdfVxuICAgIH0vKlxuICAgIGlzT3ZlcnZpZXdUb2lzb2xhdChvdmVydmlldyl7XG4gICAgfSovXG4gICAgaXNJbWJhbGFuY2Uob3ZlcnZpZXc6IHsgc2l6ZTogbnVtYmVyOyB9KXtcbiAgICAgICAgb3ZlcnZpZXcuc2l6ZT4xXG4gICAgfVxuICAgIGVxdWFsc0luZGV4SWZBbnkoKXtcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLnRva2Vucy5tYXAoKHQ6IHsgdmFsdWU6IHN0cmluZzsgfSxpZHg6IGFueSk9PnQudmFsdWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKChtOiBudWxsKT0+bSE9PW51bGwpO1xuICAgICAgICByZXR1cm4gZXFJbmRleFswXTtcbiAgICB9XG4gICAgaXNRdWFkcmF0aWMoKXtcblxuICAgIH1cbiAgICBpc0ZpbmFsUmV0dXJuKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5sZW5ndGg8Mnx8KHRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlcbiAgICB9XG4gICAgXG4gICAgYXNzaWduVmFyaWFibGVzKCl7XG4gICAgICAgIHRoaXMudmFyaWFibGVzPVtdXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKXtcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgoJ3ZhcmlhYmxlOicpJiYhdGhpcy52YXJpYWJsZXMuaW5jbHVkZXModmFsdWUudmFyaWFibGUpKXtcbiAgICAgICAgICAgICAgICB0aGlzLnZhcmlhYmxlcy5wdXNoKHZhbHVlLnZhcmlhYmxlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaGFzZVZhcmlhYmxlKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzPy5sZW5ndGg+MH1cblxuICAgIGlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpe1xuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubm9NYXRjaD4wXG4gICAgfVxuICAgIGlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCl7XG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxuICAgICAgICByZXR1cm4gIGZpbHRlci5tYXRjaD09PTEmJmZpbHRlci5ub01hdGNoPT09MFxuICAgIH1cblxuICAgIGZpbHRlckJ5VHlwZSh0eXBlS2V5OiBzdHJpbmcsIHRhcmdldFZhbHVlOiBzdHJpbmcpe1xuICAgICAgICBsZXQgbWF0Y2g9MCwgbm9NYXRjaD0wXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKSB7XG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKHR5cGVLZXkpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gdHlwZUtleSsnOicrdGFyZ2V0VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2grKztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBub01hdGNoKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG1hdGNoOiBtYXRjaCwgbm9NYXRjaDogbm9NYXRjaCB9O1xuICAgIH1cbiAgICBnZXRPdmVydmlldyh0b2tlbnM/OiBhbnlbXSApIHtcbiAgICAgICAgaWYoIXRva2Vucyl0b2tlbnM9dGhpcy50b2tlbnNcbiAgICAgICAgaWYoIXRva2VucylyZXR1cm47XG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3ID0gbmV3IE1hcCgpO1xuICAgICAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XG4gICAgICAgICAgICAvL2lmICghdG9rZW4uaXNWYWx1ZVRva2VuKCkpIHtyZXR1cm47fVxuICAgICAgICAgICAgY29uc3Qga2V5ID0gdG9rZW4uZ2V0RnVsbFRva2VuSUQoKVxuICAgICAgICAgICAgLy9FcXVhbHNcbiAgICAgICAgICAgIGlmICghb3ZlcnZpZXcuaGFzKGtleSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeSA9IHsgXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLnR5cGUsIFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogMCAsXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlOiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09PSAndmFyaWFibGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGVudHJ5LnZhcmlhYmxlID0gdG9rZW4udmFyaWFibGU7XG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgIG92ZXJ2aWV3LnNldChrZXksIGVudHJ5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG92ZXJ2aWV3LmdldChrZXkpLmNvdW50Kys7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gb3ZlcnZpZXcvL0FycmF5LmZyb20ob3ZlcnZpZXcudmFsdWVzKCkpO1xuICAgIH1cbn1cblxuY2xhc3MgT3BlcmF0b3J7XG5cbn1cblxuY2xhc3MgTW9kaWZpZXJ7XG5cbn0iXX0=