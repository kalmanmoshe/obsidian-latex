import { degreesToRadians, radiansToDegrees, calculateFactorial } from "./mathUtilities";
import { findParenIndex, isOpenParen } from "../utils/tokenUtensils";
import { getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getOperatorsByBracket } from "../utils/dataManager";
import { MathGroup, mathJaxOperator, Token, Tokens } from "./mathJaxTokens";
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
export class Position {
    operator;
    index;
    transition;
    specialChar;
    left;
    right;
    constructor(tokens, index) {
        this.index = index;
        this.transition = this.index;
        this.position(tokens);
    }
    position(tokens) {
        this.operator = tokens[this.index].value;
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
    // Helper function to validate and retrieve the operable value
    function getOperableValue(group) {
        if (!group.isOperable())
            return null;
        const value = group.getOperableValue();
        return value?.value ?? null;
    }
    const value = getOperableValue(operator.group1);
    if (value === null)
        return false;
    switch (operator.operator) {
        case "Sin":
            operator.solution = new MathGroup([new Token(Math.sin(degreesToRadians(value)))]);
            break;
        case "Square root":
            if (value < 0) {
                throw new Error("Cannot calculate the square root of a negative number.");
            }
            operator.solution = new MathGroup([new Token(Math.pow(value, 0.5))]);
            break;
        default:
            throw new Error(`Unknown operator type in parseOperator: ${operator.operator}`);
    }
    return true;
}
function operationsOrder(tokens) {
    function findOperatorIndex(begin, end, tokens, regex) {
        const index = tokens.slice(begin, end).findIndex((token) => token.type === "operator" && regex.test(token.value));
        return index > -1 ? index + begin : null;
        while (begin < end && begin < tokens.length) {
            let index;
            if (regex) {
                index = tokens.slice(begin, end).findIndex((token) => token.type === "operator" && regex.test(token.value));
            }
            else {
                index = tokens.slice(begin, end).findIndex((token) => token.type === "operator");
            }
            if (index === -1)
                return null;
            index += begin;
            if (index > 0 && index < tokens.length - 1) {
                if (tokens[index - 1].type === tokens[index + 1].type) {
                    return index;
                }
            }
            begin = index + 1;
        }
        return null;
    }
    let begin = 0, end = tokens.length, j = 0;
    let currentID = null;
    let checkedIDs = [];
    let operatorFound = false;
    for (let i = 0; i < tokens.length; i++) {
        if (isOpenParen(tokens[i]) && !checkedIDs.includes(tokens[i].id)) {
            currentID = findParenIndex(tokens[i], undefined, tokens);
        }
        if (currentID !== null && i === currentID.close) {
            [begin, end] = [currentID.open, currentID.close];
            break;
        }
    }
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
    i = 0;
    constructor(input) {
        this.input = input;
        this.processInput();
        const tokens = new Tokens(this.input);
        const basicTokens = tokens.tokens;
        this.addDebugInfo("Tokens after tokenize", basicTokens);
        //this.input=this.tokens.reconstruct()
        this.controller(basicTokens);
        this.solution = this.tokens;
        this.addDebugInfo("solution", this.solution);
    }
    getRedyforNewRond() {
        //this.tokens.connectNearbyTokens();
        //this.mathInfo.addMathInfo(this.tokens)
        //this.addDebugInfo(this.tokens.tokens,this.tokens.tokens.length)
        //this.tokens.expressionVariableValidity();
    }
    groupMathTokens() {
        // Step one structure aka replace parentheses with nested arrays
        // Step two Find first operator.and continue from there
        /*
        const pos=new Position(tempTokens)
        const math=new mathJaxOperator(pos.operator)
        const group=new MathGroup()
        if(pos.index){
        const [leftBreak,length] = [pos.left.breakChar,pos.right.breakChar-pos.left.breakChar]
        group.setItems(pos.right.tokens)
        math.setGroup1(group)
        tempTokens.splice(leftBreak,length,math)}

        this.tokens=new MathGroup(tempTokens)*/
        return;
    }
    createMathGroupInsertFromTokens(tokens, start, end) {
        const newMathGroup = new MathGroup(tokens.slice(start, end));
        return newMathGroup;
    }
    createOperatorItemFromTokens(tokens, index) {
        const position = new Position(tokens, index);
        const newOperator = new mathJaxOperator(position.operator);
        newOperator.setGroup1(new MathGroup(position.right.tokens));
        return newOperator;
    }
    defineGroupsAndOperators(tokens) {
        const range = operationsOrder(tokens);
        if (range.start === null || range.end === null)
            return false;
        if (range.specificOperatorIndex === null && range.start === 0 && range.end === tokens.length)
            return true;
        let newMathGroup = null;
        if (range.specificOperatorIndex !== null)
            newMathGroup = this.createOperatorItemFromTokens(tokens, range.specificOperatorIndex);
        else
            newMathGroup = this.createMathGroupInsertFromTokens(tokens, range.start, range.end);
        if (!newMathGroup)
            return false;
        tokens.splice(range.start, range.end - range.start, newMathGroup);
        return this.defineGroupsAndOperators(tokens);
    }
    parse(tokens) {
        const operator = tokens.items.find(t => t instanceof mathJaxOperator && t.isOperable);
        if (!operator)
            return;
        const group1 = this.parse(operator.group1);
        let group2 = null;
        if (operator.associativityNumber > 1 && operator.group2) {
            group2 = this.parse(operator.group2);
        }
        console.log('operator', operator, group1, group2);
        parseOperator(operator);
        if (!operator.solution) {
            operator.isOperable = false;
            return;
        }
        // Replace tokens with the solution
        tokens.items = operator.solution.items;
    }
    controller(basicTokens) {
        // The expression needs to be wrapped N a operator based on praising method Maybe not decided on it yet.
        //const whatebver=
        const success = this.defineGroupsAndOperators(basicTokens);
        console.log('this.defineGroupsAndOperators(basicTokens)', basicTokens);
        if (!success)
            return;
        this.tokens = new MathGroup(basicTokens);
        this.parse(this.tokens);
        //this.tokens.combiningLikeTerms()
        console.log('this.tokens', this.tokens);
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
        return this.solution || "";
    }
    useParse(position) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUF1QyxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBRSxrQkFBa0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBTTVILE9BQU8sRUFBRSxjQUFjLEVBQXVCLFdBQVcsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzFGLE9BQU8sRUFBMkIsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUscUJBQXFCLEVBQXFELE1BQU0sc0JBQXNCLENBQUM7QUFJck0sT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTVFLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFVO0lBQy9DLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNyQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ25DLElBQUksR0FBRyxDQUFD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Q0FBQztnQkFDRixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7b0JBQzVCLEtBQUssQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsQ0FBQztnQkFFRCxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3QixDQUFDO1lBQ0QsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sUUFBUSxDQUFBLENBQUEsZ0NBQWdDO0lBQ25ELENBQUM7Q0FDSjtBQUVELE1BQU0sUUFBUTtDQUViO0FBRUQsTUFBTSxRQUFRO0NBRWIiLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi4vaW1WZXJ5TGF6eVwiO1xuaW1wb3J0IHsgdHlwZSB9IGZyb20gXCJvc1wiO1xuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgcmVnRXhwIH0gZnJvbSBcIi4uL3Rpa3pqYXgvdGlrempheFwiO1xuaW1wb3J0IHsgIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XG5pbXBvcnQgeyBjcCB9IGZyb20gXCJmc1wiO1xuaW1wb3J0IHsgZmluZFBhcmVuSW5kZXgsIFBhcmVuLGlkUGFyZW50aGVzZXMsIGlzT3BlblBhcmVuIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRPcGVyYXRvcnNCeUJyYWNrZXQsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcbmltcG9ydCB7IG51bWJlciwgc3RyaW5nIH0gZnJvbSBcInpvZFwiO1xuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4gfSBmcm9tIFwic3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheFwiO1xuaW1wb3J0IHsgZ3JvdXAgfSBmcm9tIFwiY29uc29sZVwiO1xuaW1wb3J0IHsgTWF0aEdyb3VwLCBtYXRoSmF4T3BlcmF0b3IsIFRva2VuLCBUb2tlbnMgfSBmcm9tIFwiLi9tYXRoSmF4VG9rZW5zXCI7XG5pbXBvcnQgeyBzdGFydCB9IGZyb20gXCJyZXBsXCI7XG5jb25zdCBncmVla0xldHRlcnMgPSBbXG4gICAgJ0FscGhhJywnYWxwaGEnLCAnQmV0YScsICdHYW1tYScsICdEZWx0YScsICdFcHNpbG9uJywgJ1pldGEnLCAnRXRhJywgJ1RoZXRhJywgXG4gICAgJ0lvdGEnLCAnS2FwcGEnLCAnTGFtYmRhJywgJ011JywnbXUnLCAnTnUnLCAnWGknLCAnT21pY3JvbicsICdQaScsICdSaG8nLCBcbiAgICAnU2lnbWEnLCAnVGF1JywgJ1Vwc2lsb24nLCAnUGhpJywgJ0NoaScsICdQc2knLCAnT21lZ2EnXG5dO1xuLypjb25zdCBsYXRleE9wZXJhdG9ycz1bXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXG4gICAgJ2F0YW4nLCAnYXJjY29zJywgJ2FyY3NpbicsICdhcmN0YW4nLCAnY2RvdCcsJ3NxcnQnXG5dKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhhcnI6IGFueVtdKSB7XG4gICAgY29uc3Qgc2VxdWVuY2VzID0gW107XG4gICAgbGV0IHN0YXJ0ID0gMDtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBhcnIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGFycltpXSAhPT0gYXJyW2kgLSAxXSArIDEpIHtcbiAgICAgICAgICAgIGlmIChpIC0gc3RhcnQgPiAxKSB7XG4gICAgICAgICAgICAgICAgc2VxdWVuY2VzLnB1c2goYXJyLnNsaWNlKHN0YXJ0LCBpKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdGFydCA9IGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNlcXVlbmNlcztcbn1cblxuXG5jb25zdCBvcGVyYXRvcnNGb3JNYXRoaW5mbyA9IHtcbiAgICBib3RoQnV0UmlnaHRCcmFja2V0OiBbXCJeXCJdLFxuICAgIHJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2g6IFtcInNxcnRcIl0sXG4gICAgYm90aDogW1wiK1wiLCBcIi1cIiwgXCIqXCJdLFxuICAgIHNwZWNpYWw6IFtcIj1cIl0sXG4gICAgUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2g6IFtcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcbiAgICBkb3VibGVSaWdodEJ1dEJyYWNrZXQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiLFwiL1wiXVxufTtcblxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xuICAgIGRlYnVnSW5mbzogc3RyaW5nPVwiXCI7XG4gICAgc29sdXRpb25JbmZvOiBhbnlbXT1bXTtcbiAgICBtYXRoSW5mbzogYW55W109W11cbiAgICBncmFwaDogc3RyaW5nPVwiXCI7XG4gICAgYWRkR3JhcGhJbmZvKHZhbHVlOiBzdHJpbmcpe1xuICAgICAgICB0aGlzLmdyYXBoKz12YWx1ZTtcbiAgICB9XG4gICAgYWRkRGVidWdJbmZvKG1zZzogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPSh0eXBlb2YgbXNnPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeShtc2csbnVsbCwxKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUsbnVsbCwxKTp2YWx1ZSkrIFwiXFxuIFwiO1xuICAgIH1cbiAgICBhZGRTb2x1dGlvbkluZm8obWVzOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xuICAgICAgICB0aGlzLnNvbHV0aW9uSW5mby5wdXNoKG1lcyk7XG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiU29sdmVkXCIsbWVzKTtcbiAgICB9XG4gICAgYWRkTWF0aEluZm8odG9rZW5zOiBUb2tlbnMpe1xuICAgICAgICBjb25zdCByZWNvbnN0cnVjdGVkTWF0aD10b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gocmVjb25zdHJ1Y3RlZE1hdGgpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xuICAgIH1cblxuICAgIGFkZFNvbHV0aW9uKHRva2VuczogVG9rZW5zLHBvc2l0aW9uOiBQb3NpdGlvbixzb2x1dGlvbjogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcbiAgICAgICAgc29sdXRpb249dG9rZW5zLnJlY29uc3RydWN0KFtzb2x1dGlvbl0pO1xuICAgICAgICBjb25zdCBsZWZ0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLmluZGV4KSk7XG4gICAgICAgIGNvbnN0IHJpZ2h0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmluZGV4KzEscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLCkpO1xuXG4gICAgICAgIHN3aXRjaCAodHJ1ZSl7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGhCdXRSaWdodEJyYWNrZXQuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvcn0geyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHBvc2l0aW9uLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZSgvXFwqL2csIFwiXFxcXGNkb3RcIil9ICR7cmlnaHR9ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnNwZWNpYWwuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSBgXFxcXGZyYWN7JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5yaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHBvc2l0aW9uLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGBcXFxcc3FydHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvcn0gKCR7cmlnaHR9KSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5kb3VibGVSaWdodEJ1dEJyYWNrZXQuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKFwiL1wiLFwiZnJhY1wiKX17JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hZGRTb2x1dGlvbkluZm8oc29sdXRpb24pO1xuICAgIH1cbn1cblxuLypcbmZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xuICAgIGlmICghKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikpe3JldHVybiB2YWx1ZX1cbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XG4gICAgaWYgKHZhbHVlPT09XCItXCIpe3JldHVybiAtMX1cbiAgICBpZiAoL1thLXpBLVpdLy50ZXN0KHZhbHVlKSl7cmV0dXJuIDF9XG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxuICAgIGlmKC9bKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cbiAgICBmb3IgKGxldCBpID0gMDsgaTx2YWx1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XG4gICAgICAgICAgICBpLS07XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgbnVtID0gTnVtYmVyKHZhbHVlKTtcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XG59Ki9cblxuZnVuY3Rpb24gcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3I6IHN0cmluZyxsZWZ0OiBhbnkscmlnaHQ6IGFueSl7XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiBsZWZ0Py52YWx1ZSE9PVwibnVtYmVyXCImJmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpLmluY2x1ZGVzKG9wZXJhdG9yKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMZWZ0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQ/LnZhbHVlIT09XCJudW1iZXJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSaWdodCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xuICAgIH1cbn1cblxuXG5cbmZ1bmN0aW9uIHBhcnNlKHBvc2l0aW9uOiB7IG9wZXJhdG9yOiBhbnk7IHNwZWNpYWxDaGFyPzogYW55OyBsZWZ0PzogYW55OyByaWdodD86IGFueTsgfSkge1xuICAgIGxldCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xuICAgIFxuICAgIGxlZnQ9bGVmdD8udG9rZW5zXG4gICAgcmlnaHQ9cmlnaHQudG9rZW5zXG4gICAgcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3IsbGVmdCxyaWdodCk7XG4gICAgXG4gICAgbGV0IHNvbHZlZD1uZXcgVG9rZW4oMCx1bmRlZmluZWQpO1xuICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcbiAgICAgICAgY2FzZSBcIlNxdWFyZSBSb290XCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiUG93XCI6XG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZXx8cmlnaHQudmFyaWFibGUpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV8fGxlZnQudmFyaWFibGU9PT1yaWdodC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlP3JpZ2h0LnZhcmlhYmxlOlwiXCI7XG4gICAgICAgICAgICAgICAgLy9zb2x2ZWQucG93PTJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJGcmFjdGlvblwiOlxuICAgICAgICBjYXNlIFwiL1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKGxlZnQudmFsdWUpLyhyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIk11bHRpcGxpY2F0aW9uXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICogcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBoYW5kbGVWcmlhYmxlcyhsZWZ0LCByaWdodCxzb2x2ZWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCIrXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICsgcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJNaW51c1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAtIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYmlub21cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGNhbGN1bGF0ZUZhY3RvcmlhbChsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwic2luXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImNvc1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5jb3MoZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInRhblwiOlxuICAgICAgICAgICAgaWYgKHJpZ2h0Pj05MCl7dGhyb3cgbmV3IEVycm9yKFwidGFuIE11c3QgYmUgc21hbGxlciB0aGFuIDkwXCIpO31cbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLnRhbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhc2luXCI6XG4gICAgICAgIGNhc2UgXCJhcmNzaW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hc2luKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImFjb3NcIjpcbiAgICAgICAgY2FzZSBcImFyY2Nvc1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFjb3MocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYXRhblwiOlxuICAgICAgICBjYXNlIFwiYXJjdGFuXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbihyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBpZGVudGlmeSBvcGVyYXRvciB0eXBlIGF0IHByYWlzZSBvcGVyYXRvcjogXCIrcG9zaXRpb24ub3BlcmF0b3IpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdDogeyB2YXJpYWJsZTogYW55OyBwb3c6IGFueTsgdmFsdWU6IG51bWJlcjsgfSwgcmlnaHQ6IHsgdmFyaWFibGU6IGFueTsgcG93OiBhbnk7IHZhbHVlOiBudW1iZXI7IH0sIHNvbHZlZDogVG9rZW4pIHtcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcbiAgICAgICAgICAgIC8qIEtlZXAgdGhlbSBzZXBhcmF0ZSBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZhcmlhYmxlc1xuICAgICAgICAgICAgc29sdmVkLnRlcm1zID0gW1xuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IHJpZ2h0LnZhcmlhYmxlLCBwb3c6IHJpZ2h0LnBvdyB8fCAxLCB2YWx1ZTogcmlnaHQudmFsdWUgfHwgMSB9XG4gICAgICAgICAgICBdOyovXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaWZmZXJlbnQgdmFyaWFibGUgYmFzZXMgYXQgcG93ZXIgbXVsdGlwbGljYXRpb24uIEkgZGlkbid0IGdldCB0aGVyZSB5ZXRcIilcbiAgICAgICAgfVxuICAgIFxuICAgICAgICBjb25zdCB2YXJpYWJsZSA9IGxlZnQudmFyaWFibGUgfHwgcmlnaHQudmFyaWFibGU7XG4gICAgICAgIHNvbHZlZC52YXJpYWJsZSA9IHZhcmlhYmxlLmxlbmd0aD4wP3ZhcmlhYmxlOnVuZGVmaW5lZDtcbiAgICAgICAgXG4gICAgICAgIGxldCBwb3cgPSAobGVmdC5wb3cgfHwgMCkgKyAocmlnaHQucG93IHx8IDApO1xuICAgICAgICBwb3c9bGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSYmcG93PT09MCYmIWxlZnQucG93JiYhcmlnaHQucG93PzI6cG93O1xuICAgICAgICAvL3NvbHZlZC5wb3cgPSBwb3cgfHwgdW5kZWZpbmVkO1xuICAgICAgICBcblxuICAgICAgICAvLyBSdWxlIDM6IEhhbmRsZSBtdWx0aXBsaWNhdGlvbiBvZiBjb25zdGFudHNcbiAgICAgICAgY29uc3QgbGVmdFZhbHVlID0gbGVmdC52YWx1ZSB8fCAxO1xuICAgICAgICBjb25zdCByaWdodFZhbHVlID0gcmlnaHQudmFsdWUgfHwgMTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBsZWZ0VmFsdWUgKiByaWdodFZhbHVlO1xuICAgICAgICAvLyBJZiB0aGVyZSdzIG5vIHZhcmlhYmxlLCBhc3NpZ24gdGhlIHJlc3VsdCBhcyBhIGNvbnN0YW50XG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgXG5cbiAgICBmdW5jdGlvbiBoYW5kbGVWcmlhYmxlcyhsZWZ0OiBhbnkscmlnaHQ6IGFueSxzb2x2ZWQ6IFRva2VuKXtcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgcmV0dXJuIDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUhPT1yaWdodC52YXJpYWJsZSl7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUd28gdmFyaWFibGUgZXF1YXRpb25zIGFyZW4ndCBhY2NlcHRlZCB5ZXRcIik7XG4gICAgICAgIH1cbiAgICAgICAgLy9oYW5kbGVkLlZhcj1sZWZ0LnZhcjtcbiAgICAgICAgLy9zb2x2ZWQudmFyaWFibGU9bGVmdC52YXJcblxuICAgICAgICAvKlxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZX1cbiAgICAgICAgZWxzZSBpZiAoIWxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGV9XG4gICAgICAgIGVsc2UgaWYgKGxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGU7c29sdmVkLnBvdz0yfVxuICAgICAgICAqL1xuICAgIH1cblxuXG4gICAgcmV0dXJuIHNvbHZlZDtcbn1cblxuXG5cblxuXG5mdW5jdGlvbiByZWFycmFuZ2VFcXVhdGlvbih0b2tlbnM6IGFueSx0b2tlblRvaXNvbGF0ZTogYW55KXtcbiAgICBcbn1cblxuZnVuY3Rpb24gaXNvbGF0ZU11bHRpcGxpY2F0aW9uKHRva2VuczogYW55LGlzb2xhdFRva2VuOiBUb2tlbil7LypcbiAgICBjb25zdCBpbmRleD1vcGVyYXRpb25zT3JkZXIodG9rZW5zKVxuICAgIGNvbnN0IElzb2xhdGVkPXRva2Vucy50b2tlbnMuZmluZCgodG9rZW46IGFueSwgaWR4OiBudW1iZXIpPT5pZHg8aW5kZXgpXG4gICAgY29uc3QgZnJhYz1jcmVhdGVGcmFjKHRva2Vucy5saXN0LnNsaWNlKGluZGV4ICsgMSksbmV3IFRva2VuKElzb2xhdGVkLnZhbHVlKSlcbiAgICBJc29sYXRlZC52YWx1ZT0xO1xuICAgIHRva2Vucy5pbnNlcnRUb2tlbnMoaW5kZXgrMSx0b2tlbnMudG9rZW5zLmxlbmd0aC1pbmRleCsxLGZyYWMpKi9cbn1cblxuZnVuY3Rpb24gY3JlYXRlRnJhYyhub21pbmF0b3I6IGFueSxkZW5vbWluYXRvcjogVG9rZW4pe1xuICAgLy8gcmV0dXJuIFtuZXcgVG9rZW4oJ2ZyYWMnKSxuZXcgVG9rZW4oJygnKSxub21pbmF0b3IsbmV3IFRva2VuKCcpJyksbmV3IFRva2VuKCcoJyksZGVub21pbmF0b3IsbmV3IFRva2VuKCcpJyldXG59XG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zOiBhbnlbXSl7XG4gICAgaWYgKHRva2Vucy5sZW5ndGg8PTEpe3JldHVybiB0b2tlbnN9XG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUoKHRva2VuOiBhbnkpID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxuICAgIHtcbiAgICAgICAgaSsrO1xuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xuICAgICAgICBsZXQgT3BlcmF0aW9uSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0pID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpO1xuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XG5cbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XG5cbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuOiBhbnksIGk6IGFueSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IHRva2VuOiB7IHR5cGU6IGFueTsgfTsgfSkgPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxuICAgICAgICAucmVkdWNlKChzdW06IG51bWJlciwgaXRlbTogeyBvcmlnaW5hbEluZGV4OiBudW1iZXI7IHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IG51bWJlcjsgfTsgfSkgPT4ge1xuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gXCItXCIpID8gLTEgOiAxO1xuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxuICAgICAgICByZXR1cm4gc3VtICsgKGl0ZW0udG9rZW4udmFsdWUgKiBtdWx0aXBsaWVyKTtcbiAgICAgICAgfSwgMCk7IFxuICAgICAgICBcbiAgICAgICAgbmV3VG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXG4gICAgICAgICAgICB0b2tlbi50eXBlICE9PSB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgfHwgXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld1Rva2Vucztcbn1cblxuZnVuY3Rpb24gcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRva2VuczogVG9rZW5zLCBpc29sYXRpb25Hb2FsOiB7IHR5cGU6IGFueTsgdmFsdWU6IGFueTsgb3ZlcnZpZXdTaWRlT25lPzogTWFwPGFueSwgYW55Pjsgb3ZlcnZpZXdTaWRlVHdvPzogTWFwPGFueSwgYW55PjsgfSkge1xuICAgIGlmICh0b2tlbnMudG9rZW5zLmxlbmd0aCA8PSAxKSByZXR1cm4gdG9rZW5zO1xuXG4gICAgY29uc3QgZXFJbmRleCA9IHRva2Vucy50b2tlbnMuZmluZEluZGV4KCh0OiB7IHZhbHVlOiBzdHJpbmc7IH0pID0+IHQudmFsdWUgPT09ICdFcXVhbHMnKTtcbiAgICBpZiAoZXFJbmRleCA9PT0gLTEpIHRocm93IG5ldyBFcnJvcihcIk5vICdFcXVhbHMnIG9wZXJhdG9yIGZvdW5kIGluIHRva2Vuc1wiKTtcblxuICAgIGNvbnN0IHN3aXRjaERpcmVjdGlvbiA9IGZhbHNlOyAvLyBGdXR1cmUgbG9naWMgdG8gZGV0ZXJtaW5lIGRpcmVjdGlvblxuICAgIGNvbnN0IGlzb2xhdGlvbkdvYWxJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xuICAgICAgICAubWFwKCh0OiB7IHR5cGU6IGFueTsgdmFyaWFibGU6IGFueTsgfSwgaWR4OiBhbnkpID0+ICh0LnR5cGUgPT09IGlzb2xhdGlvbkdvYWwudHlwZSAmJiB0LnZhcmlhYmxlID09PSBpc29sYXRpb25Hb2FsLnZhbHVlID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XG5cbiAgICBjb25zdCBvdGhlckluZGljZXMgPSB0b2tlbnMudG9rZW5zXG4gICAgICAgIC5tYXAoKF86IGFueSwgaWR4OiBhbnkpID0+ICghaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaWR4KSAmJiBpZHggIT09IGVxSW5kZXggPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcigoaWR4OiBudWxsfG51bWJlcikgPT4gaWR4ICE9PSBudWxsKTtcblxuICAgIC8vIEFkanVzdCBzaWduc1xuICAgIHRva2Vucy50b2tlbnMuZm9yRWFjaCgodG9rZW46IHsgdmFsdWU6IG51bWJlcjsgfSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpID4gZXFJbmRleCA6IGkgPCBlcUluZGV4KSAmJiBvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHtcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xuICAgICAgICB9IGVsc2UgaWYgKChzd2l0Y2hEaXJlY3Rpb24/IGkgPCBlcUluZGV4IDogaSA+IGVxSW5kZXgpICYmIGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gU2VwYXJhdGUgc2lkZXNcbiAgICBjb25zdCBzaWRlMTogYW55W10gPSBbXTtcbiAgICBjb25zdCBzaWRlMjogYW55W10gPSBbXTtcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnksIGk6IGFueSkgPT4ge1xuICAgICAgICBpZiAoaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHNpZGUxLnB1c2godG9rZW4pO1xuICAgICAgICBpZiAob3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMi5wdXNoKHRva2VuKTtcbiAgICB9KTtcblxuICAgIHRva2Vucy50b2tlbnMgPSBzd2l0Y2hEaXJlY3Rpb25cbiAgICAgICAgPyBbLi4uc2lkZTIsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUxXVxuICAgICAgICA6IFsuLi5zaWRlMSwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTJdO1xufVxuXG5cblxuXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xuICAgIG9wZXJhdG9yOiBzdHJpbmc7XG4gICAgaW5kZXg6IG51bWJlcjtcbiAgICB0cmFuc2l0aW9uOiBudW1iZXI7XG4gICAgc3BlY2lhbENoYXI6IHN0cmluZztcbiAgICBsZWZ0OiBhbnk7XG4gICAgcmlnaHQ6IGFueTtcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM6IGFueVtdLCBpbmRleDogbnVtYmVyKXtcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmluZGV4O1xuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcbiAgICB9XG4gICAgcG9zaXRpb24odG9rZW5zOiBhbnlbXSkge1xuICAgICAgICB0aGlzLm9wZXJhdG9yID0gdG9rZW5zW3RoaXMuaW5kZXhdLnZhbHVlO1xuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdyaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHticmVha0NoYXI6IHRoaXMuaW5kZXh9O1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnZG91YmxlUmlnaHQnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5sZWZ0LmJyZWFrQ2hhcjtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLTEsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0LmJyZWFrQ2hhcisodGhpcy5yaWdodC5tdWx0aVN0ZXA/MTowKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IHdhcyBub3QgYWNjb3VudGVkIGZvciwgb3IgaXMgbm90IHRoZSB2YWxpZCBvcGVyYXRvcmApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc3BlY2lhbENoYXI9dG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyIDogbnVsbDtcbiAgICB9XG4gICAgYXBwbHlQb3NpdGlvbih0b2tlbnM6IGFueVtdLCBpbmRleDogIG51bWJlciwgZGlyZWN0aW9uOiBzdHJpbmcpIHtcbiAgICAgICAgbGV0IGJyZWFrQ2hhcj1pbmRleFxuICAgICAgICBsZXQgdGFyZ2V0OiBhbnlbXTtcbiAgICAgICAgbGV0IG11bHRpU3RlcD1mYWxzZTtcbiAgICAgICAgY29uc3QgaXNMZWZ0ID0gZGlyZWN0aW9uID09PSBcImxlZnRcIjtcbiAgICAgICAgY29uc3QgaW5kZXhNb2RpZmllciA9ICBpc0xlZnQ/LSAxIDogIDE7XG4gICAgICAgIGlmICgoaXNMZWZ0ICYmIGluZGV4IDw9IDApIHx8ICghaXNMZWZ0ICYmIGluZGV4ID49IHRva2Vucy5sZW5ndGggLSAxKSB8fCAhdG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIiBpbmRleDogXCIraW5kZXgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gZmluZFBhcmVuSW5kZXgodG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLmlkKTtcbiAgICAgICAgICAgIGJyZWFrQ2hhciA9ICBpc0xlZnQgPyBwYXJlbkluZGV4Lm9wZW4gOiBwYXJlbkluZGV4LmNsb3NlKzE7XG4gICAgICAgICAgICB0YXJnZXQgPSB0b2tlbnMuc2xpY2UocGFyZW5JbmRleC5vcGVuLCBwYXJlbkluZGV4LmNsb3NlKzEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYnJlYWtDaGFyPWluZGV4K2luZGV4TW9kaWZpZXI7XG4gICAgICAgICAgICB0YXJnZXQgPSBbdG9rZW5zW2JyZWFrQ2hhcl1dO1xuICAgICAgICAgICAgYnJlYWtDaGFyKz1pc0xlZnQ/MDoxXG4gICAgICAgIH1cbiAgICAgICAgLy9jb25zdCBtdWx0aVN0ZXAgPSBNYXRoLmFicyhicmVha0NoYXIgLSBpbmRleCkgPiAzO1xuICAgIFxuICAgICAgICBpZiAoIW11bHRpU3RlcCYmdG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIil7XG4gICAgICAgICAgICAvL3RhcmdldD10YXJnZXQuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7ZGlyZWN0aW9ufSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zW2luZGV4XS52YWx1ZX1cImAsKTtcbiAgICAgICAgfVxuICAgIFxuICAgICAgICAvL2JyZWFrQ2hhciA9IChicmVha0NoYXIgIT09IGluZGV4ID8gdGFyZ2V0Py5pbmRleCA6IGJyZWFrQ2hhcikrIGluZGV4TW9kaWZpZXIrKGlzTGVmdD8wOjEpO1xuICAgICAgICAvL2RlbGV0ZSB0YXJnZXQuaW5kZXhcbiAgICAgICAgXG4gICAgICAgIGlmICh0YXJnZXQubGVuZ3RoPT09Myl7XG4gICAgICAgICAgICAvL3RhcmdldD10YXJnZXQuZmluZCgoaXRlbTogeyB0eXBlOiBzdHJpbmc7IH0pID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXG4gICAgICAgIH1lbHNlIGlmKHRhcmdldC5sZW5ndGg+MSltdWx0aVN0ZXA9dHJ1ZVxuICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdG9rZW5zOiB0YXJnZXQsXG4gICAgICAgICAgICBtdWx0aVN0ZXA6IG11bHRpU3RlcCxcbiAgICAgICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBjaGVja011bHRpU3RlcCgpe1xuICAgICAgICByZXR1cm4gKChnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ2JvdGgnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKSYmdGhpcy5sZWZ0Py5tdWx0aVN0ZXApfHx0aGlzLnJpZ2h0Py5tdWx0aVN0ZXApJiZ0aGlzLm9wZXJhdG9yPT09J011bHRpcGxpY2F0aW9uJztcbiAgICB9XG4gICAgaXNMZWZ0VmFyKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmxlZnQubXVsdGlTdGVwP3RoaXMubGVmdC50b2tlbnMuc29tZSgodDogeyB0eXBlOiBzdHJpbmc7IH0pPT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMubGVmdC50b2tlbnMudHlwZS5pbmNsdWRlcygnYXJpYWJsZScpXG4gICAgfVxuICAgIGlzUmlnaHRWYXIoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMucmlnaHQubXVsdGlTdGVwP3RoaXMucmlnaHQudG9rZW5zLnNvbWUoKHQ6IHsgdHlwZTogc3RyaW5nOyB9KT0+dC50eXBlPT09J3ZhcmlhYmxlJ3x8dC50eXBlPT09J3Bvd2VyVmFyaWFibGUnKTp0aGlzLnJpZ2h0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcbiAgICB9XG4gICAgY2hlY2tGcmFjKCl7Ly8hdGhpcy5jaGVja011bHRpU3RlcCgpIEkgZG9uJ3Qga25vdyB3aHkgSSBoYWQgdGhpcyBoZXJlXG4gICAgICAgIHJldHVybiAvKGZyYWN8XFwvKS8udGVzdCh0aGlzLm9wZXJhdG9yKSYmKHRoaXMuaXNMZWZ0VmFyKCl8fHRoaXMuaXNSaWdodFZhcigpKVxuICAgIH1cbn1cblxuXG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9wZXJhdG9yKG9wZXJhdG9yOiBtYXRoSmF4T3BlcmF0b3IpOiBib29sZWFuIHtcbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gdmFsaWRhdGUgYW5kIHJldHJpZXZlIHRoZSBvcGVyYWJsZSB2YWx1ZVxuICAgIGZ1bmN0aW9uIGdldE9wZXJhYmxlVmFsdWUoZ3JvdXA6IE1hdGhHcm91cCk6IG51bWJlciB8IG51bGwge1xuICAgICAgICBpZiAoIWdyb3VwLmlzT3BlcmFibGUoKSkgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gZ3JvdXAuZ2V0T3BlcmFibGVWYWx1ZSgpO1xuICAgICAgICByZXR1cm4gdmFsdWU/LnZhbHVlID8/IG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgdmFsdWUgPSBnZXRPcGVyYWJsZVZhbHVlKG9wZXJhdG9yLmdyb3VwMSk7XG4gICAgaWYgKHZhbHVlID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yLm9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgXCJTaW5cIjpcbiAgICAgICAgICAgIG9wZXJhdG9yLnNvbHV0aW9uID0gbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnModmFsdWUpKSldKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgXCJTcXVhcmUgcm9vdFwiOlxuICAgICAgICAgICAgaWYgKHZhbHVlIDwgMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBjYWxjdWxhdGUgdGhlIHNxdWFyZSByb290IG9mIGEgbmVnYXRpdmUgbnVtYmVyLlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9wZXJhdG9yLnNvbHV0aW9uID0gbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKE1hdGgucG93KHZhbHVlLDAuNSkpXSk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIGBVbmtub3duIG9wZXJhdG9yIHR5cGUgaW4gcGFyc2VPcGVyYXRvcjogJHtvcGVyYXRvci5vcGVyYXRvcn1gXG4gICAgICAgICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuXG5mdW5jdGlvbiBvcGVyYXRpb25zT3JkZXIodG9rZW5zOiBhbnlbXSkge1xuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luOiBudW1iZXIsIGVuZDogbnVtYmVyLCB0b2tlbnM6IGFueSwgcmVnZXg/OiBhbnkpIHtcbiAgICAgICAgY29uc3QgaW5kZXg9dG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogYW55OyB9KSA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xuICAgICAgICByZXR1cm4gaW5kZXg+LTE/aW5kZXgrYmVnaW46bnVsbDtcbiAgICAgICAgd2hpbGUgKGJlZ2luIDwgZW5kICYmIGJlZ2luIDwgdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgbGV0IGluZGV4O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocmVnZXgpIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueTsgfSkgPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0pID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBpbmRleCA8IHRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJlZ2luID0gaW5kZXggKyAxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBiZWdpbiA9IDAsIGVuZCA9IHRva2Vucy5sZW5ndGgsaj0wO1xuICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXG4gICAgbGV0IGNoZWNrZWRJRHM6IGFueVtdID0gW107ICBcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGlzT3BlblBhcmVuKHRva2Vuc1tpXSkgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zW2ldLmlkKSkge1xuICAgICAgICAgICAgY3VycmVudElEID0gZmluZFBhcmVuSW5kZXgodG9rZW5zW2ldLHVuZGVmaW5lZCx0b2tlbnMpOyAgXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN1cnJlbnRJRCE9PW51bGwmJmk9PT1jdXJyZW50SUQuY2xvc2UpIHtcbiAgICAgICAgICAgIFtiZWdpbixlbmRdPVtjdXJyZW50SUQub3BlbixjdXJyZW50SUQuY2xvc2VdXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxldCBwcmlvcml0eT1udWxsXG4gICAgZm9yIChsZXQgaT0xO2k8PTY7aSsrKXtcbiAgICAgICAgcHJpb3JpdHkgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KGksdHJ1ZSkpO1xuICAgICAgICBpZihwcmlvcml0eSE9PW51bGwpYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7c3RhcnQ6IGJlZ2luLGVuZDogZW5kLHNwZWNpZmljT3BlcmF0b3JJbmRleDogcHJpb3JpdHl9XG59XG5cblxuZXhwb3J0IGNsYXNzIE1hdGhQcmFpc2Vye1xuICAgIGlucHV0PVwiXCI7XG4gICAgdG9rZW5zOiBNYXRoR3JvdXA7XG4gICAgc29sdXRpb246IGFueTtcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcbiAgICBpPTA7XG4gICAgY29uc3RydWN0b3IoaW5wdXQ6IHN0cmluZyl7XG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XG4gICAgICAgIHRoaXMucHJvY2Vzc0lucHV0KCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCB0b2tlbnM9bmV3IFRva2Vucyh0aGlzLmlucHV0KTtcbiAgICAgICAgY29uc3QgYmFzaWNUb2tlbnM9dG9rZW5zLnRva2Vuc1xuXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiVG9rZW5zIGFmdGVyIHRva2VuaXplXCIsYmFzaWNUb2tlbnMpXG4gICAgICAgIC8vdGhpcy5pbnB1dD10aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgICAgIHRoaXMuY29udHJvbGxlcihiYXNpY1Rva2Vucyk7XG4gICAgICAgIHRoaXMuc29sdXRpb249dGhpcy50b2tlbnNcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJzb2x1dGlvblwiLHRoaXMuc29sdXRpb24pXG4gICAgfVxuICAgIGdldFJlZHlmb3JOZXdSb25kKCl7XG4gICAgICAgIC8vdGhpcy50b2tlbnMuY29ubmVjdE5lYXJieVRva2VucygpO1xuICAgICAgICAvL3RoaXMubWF0aEluZm8uYWRkTWF0aEluZm8odGhpcy50b2tlbnMpXG4gICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8odGhpcy50b2tlbnMudG9rZW5zLHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGgpXG4gICAgICAgIC8vdGhpcy50b2tlbnMuZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKTtcbiAgICB9XG4gICAgZ3JvdXBNYXRoVG9rZW5zKCl7XG4gICAgICAgIC8vIFN0ZXAgb25lIHN0cnVjdHVyZSBha2EgcmVwbGFjZSBwYXJlbnRoZXNlcyB3aXRoIG5lc3RlZCBhcnJheXNcbiAgICAgICAgICAgICAgICAvLyBTdGVwIHR3byBGaW5kIGZpcnN0IG9wZXJhdG9yLmFuZCBjb250aW51ZSBmcm9tIHRoZXJlXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICBjb25zdCBwb3M9bmV3IFBvc2l0aW9uKHRlbXBUb2tlbnMpXG4gICAgICAgICAgICAgICAgY29uc3QgbWF0aD1uZXcgbWF0aEpheE9wZXJhdG9yKHBvcy5vcGVyYXRvcilcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cD1uZXcgTWF0aEdyb3VwKClcbiAgICAgICAgICAgICAgICBpZihwb3MuaW5kZXgpe1xuICAgICAgICAgICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3MubGVmdC5icmVha0NoYXIscG9zLnJpZ2h0LmJyZWFrQ2hhci1wb3MubGVmdC5icmVha0NoYXJdXG4gICAgICAgICAgICAgICAgZ3JvdXAuc2V0SXRlbXMocG9zLnJpZ2h0LnRva2VucylcbiAgICAgICAgICAgICAgICBtYXRoLnNldEdyb3VwMShncm91cClcbiAgICAgICAgICAgICAgICB0ZW1wVG9rZW5zLnNwbGljZShsZWZ0QnJlYWssbGVuZ3RoLG1hdGgpfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucz1uZXcgTWF0aEdyb3VwKHRlbXBUb2tlbnMpKi9cbiAgICAgICAgICAgICAgICByZXR1cm4gO1xuICAgIH1cbiAgICBjcmVhdGVNYXRoR3JvdXBJbnNlcnRGcm9tVG9rZW5zKHRva2VuczogQXJyYXk8VG9rZW58TWF0aEdyb3VwfG1hdGhKYXhPcGVyYXRvcj4sc3RhcnQ6IG51bWJlcixlbmQ6IG51bWJlcil7XG4gICAgICAgIGNvbnN0IG5ld01hdGhHcm91cD1uZXcgTWF0aEdyb3VwKHRva2Vucy5zbGljZShzdGFydCxlbmQpKTtcbiAgICAgICAgcmV0dXJuIG5ld01hdGhHcm91cFxuICAgIH1cbiAgICBjcmVhdGVPcGVyYXRvckl0ZW1Gcm9tVG9rZW5zKHRva2VuczogQXJyYXk8VG9rZW58TWF0aEdyb3VwfG1hdGhKYXhPcGVyYXRvcj4saW5kZXg6IG51bWJlcil7XG4gICAgICAgIGNvbnN0IHBvc2l0aW9uPW5ldyBQb3NpdGlvbih0b2tlbnMsaW5kZXgpXG4gICAgICAgIGNvbnN0IG5ld09wZXJhdG9yPW5ldyBtYXRoSmF4T3BlcmF0b3IocG9zaXRpb24ub3BlcmF0b3IpXG4gICAgICAgIG5ld09wZXJhdG9yLnNldEdyb3VwMShuZXcgTWF0aEdyb3VwKHBvc2l0aW9uLnJpZ2h0LnRva2VucykpXG4gICAgICAgIHJldHVybiBuZXdPcGVyYXRvclxuICAgIH1cbiAgICBkZWZpbmVHcm91cHNBbmRPcGVyYXRvcnModG9rZW5zOiBBcnJheTxUb2tlbnxNYXRoR3JvdXB8bWF0aEpheE9wZXJhdG9yPik6Ym9vbGVhbnx0aGlze1xuICAgICAgICBjb25zdCByYW5nZT1vcGVyYXRpb25zT3JkZXIodG9rZW5zKTtcbiAgICAgICAgaWYocmFuZ2Uuc3RhcnQ9PT1udWxsfHxyYW5nZS5lbmQ9PT1udWxsKXJldHVybiBmYWxzZTtcbiAgICAgICAgaWYocmFuZ2Uuc3BlY2lmaWNPcGVyYXRvckluZGV4PT09bnVsbCYmcmFuZ2Uuc3RhcnQ9PT0wJiZyYW5nZS5lbmQ9PT10b2tlbnMubGVuZ3RoKXJldHVybiB0cnVlO1xuICAgICAgICBsZXQgbmV3TWF0aEdyb3VwPW51bGxcbiAgICAgICAgaWYgKHJhbmdlLnNwZWNpZmljT3BlcmF0b3JJbmRleCE9PW51bGwpXG4gICAgICAgICAgICBuZXdNYXRoR3JvdXA9dGhpcy5jcmVhdGVPcGVyYXRvckl0ZW1Gcm9tVG9rZW5zKHRva2VucyxyYW5nZS5zcGVjaWZpY09wZXJhdG9ySW5kZXgpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIG5ld01hdGhHcm91cD10aGlzLmNyZWF0ZU1hdGhHcm91cEluc2VydEZyb21Ub2tlbnModG9rZW5zLHJhbmdlLnN0YXJ0LHJhbmdlLmVuZClcbiAgICAgICAgaWYoIW5ld01hdGhHcm91cClyZXR1cm4gZmFsc2U7XG4gICAgICAgIHRva2Vucy5zcGxpY2UocmFuZ2Uuc3RhcnQscmFuZ2UuZW5kLXJhbmdlLnN0YXJ0LG5ld01hdGhHcm91cCk7XG4gICAgICAgIHJldHVybiB0aGlzLmRlZmluZUdyb3Vwc0FuZE9wZXJhdG9ycyh0b2tlbnMpO1xuICAgIH1cbiAgICBwYXJzZSh0b2tlbnM6IE1hdGhHcm91cCk6IHZvaWQge1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IHRva2Vucy5pdGVtcy5maW5kKFxuICAgICAgICAgICAgdCA9PiB0IGluc3RhbmNlb2YgbWF0aEpheE9wZXJhdG9yICYmIHQuaXNPcGVyYWJsZVxuICAgICAgICApIGFzIG1hdGhKYXhPcGVyYXRvciB8IHVuZGVmaW5lZDtcbiAgICBcbiAgICAgICAgaWYgKCFvcGVyYXRvcikgcmV0dXJuO1xuICAgIFxuICAgICAgICBjb25zdCBncm91cDEgPSB0aGlzLnBhcnNlKG9wZXJhdG9yLmdyb3VwMSk7XG5cbiAgICAgICAgbGV0IGdyb3VwMiA9IG51bGw7XG4gICAgICAgIGlmIChvcGVyYXRvci5hc3NvY2lhdGl2aXR5TnVtYmVyID4gMSAmJiBvcGVyYXRvci5ncm91cDIpIHtcbiAgICAgICAgICAgIGdyb3VwMiA9IHRoaXMucGFyc2Uob3BlcmF0b3IuZ3JvdXAyKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZygnb3BlcmF0b3InLCBvcGVyYXRvciwgZ3JvdXAxLCBncm91cDIpO1xuICAgIFxuICAgICAgICBwYXJzZU9wZXJhdG9yKG9wZXJhdG9yKTtcbiAgICAgICAgaWYgKCFvcGVyYXRvci5zb2x1dGlvbikge1xuICAgICAgICAgICAgb3BlcmF0b3IuaXNPcGVyYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIC8vIFJlcGxhY2UgdG9rZW5zIHdpdGggdGhlIHNvbHV0aW9uXG4gICAgICAgIHRva2Vucy5pdGVtcyA9IG9wZXJhdG9yLnNvbHV0aW9uLml0ZW1zOyBcbiAgICB9XG4gICAgXG4gICAgY29udHJvbGxlcihiYXNpY1Rva2VuczogVG9rZW5bXSk6IGFueXtcbiAgICAgICAgLy8gVGhlIGV4cHJlc3Npb24gbmVlZHMgdG8gYmUgd3JhcHBlZCBOIGEgb3BlcmF0b3IgYmFzZWQgb24gcHJhaXNpbmcgbWV0aG9kIE1heWJlIG5vdCBkZWNpZGVkIG9uIGl0IHlldC5cbiAgICAgICAgLy9jb25zdCB3aGF0ZWJ2ZXI9XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3M9dGhpcy5kZWZpbmVHcm91cHNBbmRPcGVyYXRvcnMoYmFzaWNUb2tlbnMpXG4gICAgICAgIGNvbnNvbGUubG9nKCd0aGlzLmRlZmluZUdyb3Vwc0FuZE9wZXJhdG9ycyhiYXNpY1Rva2VucyknLGJhc2ljVG9rZW5zKVxuICAgICAgICBpZighc3VjY2VzcylyZXR1cm5cbiAgICAgICAgdGhpcy50b2tlbnM9bmV3IE1hdGhHcm91cChiYXNpY1Rva2VucylcbiAgICAgICAgdGhpcy5wYXJzZSh0aGlzLnRva2VucylcbiAgICAgICAgLy90aGlzLnRva2Vucy5jb21iaW5pbmdMaWtlVGVybXMoKVxuICAgICAgICBjb25zb2xlLmxvZygndGhpcy50b2tlbnMnLHRoaXMudG9rZW5zKVxuICAgICAgICAvKlxuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnMuY29tYmluaW5nTGlrZVRlcm1zKClcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRva2Vucy50b2tlbnMuaXRlbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLnRva2Vucy50b2tlbnMuaXRlbXNbaV07XG4gICAgICAgIFxuICAgICAgICAgICAgaWYgKCEoaXRlbSBpbnN0YW5jZW9mIG1hdGhKYXhPcGVyYXRvcikpIGNvbnRpbnVlO1xuICAgICAgICBcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnRva2Vucy5pdGVtc1tpXSA9IGl0ZW0uYWRkU29sdXRpb24oKTtcbiAgICAgICAgfSAgICAgICAgXG4gICAgICAgICovXG4gICAgICAgIC8vdGhpcy50b2tlbnMudG9rZW5zLmFkZFNvbHV0aW9uKClcbiAgICAgICAgLy9yZXR1cm4gdGhpcy50b2tlbnMudG9rZW5zO1xuICAgICAgICBcbiAgICAgICAgLypcbiAgICAgICAgdGhpcy5pKys7XG4gICAgICAgIGlmKHRoaXMuaT4xMCl7cmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKX1cblxuICAgICAgICB0aGlzLmdldFJlZHlmb3JOZXdSb25kKCk7XG4gICAgICAgIC8vY29uc3Qgb3ZlcnZpZXc9dGhpcy50b2tlbnMuZ2V0T3ZlcnZpZXcoKVxuICAgICAgICBjb25zdCBwcmFpc2luZ01ldGhvZD1uZXcgUHJhaXNpbmdNZXRob2QodGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICBpZiAocHJhaXNpbmdNZXRob2QuaXNUaGVyZU9wZXJhdG9yT3RoZXJUaGFuRXF1YWxzKCkpe1xuICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy50b2tlbnMpO1xuICAgICAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJQYXJzZWQgZXhwcmVzc2lvblwiLCBKU09OLnN0cmluZ2lmeShwb3NpdGlvbiwgbnVsbCwgMSkpO1xuICAgICAgICAgICAgaWYgKHBvc2l0aW9uID09PSBudWxsJiZ0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjEpe1xuICAgICAgICAgICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8oXCJwYXJzZSh0b2tlbnMpXCIscGFyc2UodGhpcy50b2tlbnMudG9rZW5zKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJ0aGUgKioqKlwiXG4gICAgICAgICAgICAvLyByZXR1cm4gc29sdXRpb24odG9rZW5zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWMoKXx8cG9zaXRpb24uY2hlY2tNdWx0aVN0ZXAoKSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyh0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCh0aGlzLnRva2Vucy50b2tlbnMpKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy51c2VQYXJzZShwb3NpdGlvbilcbiAgICAgICAgfVxuICAgICAgICBpZihwcmFpc2luZ01ldGhvZC5pc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpKXtcbiAgICAgICAgICAgIHRoaXMudXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kKVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRvSXNvbGF0ZT1wcmFpc2luZ01ldGhvZC5pc0FueXRoaW5nVG9Jc29sYXRlKClcbiAgICAgICAgaWYgKHRvSXNvbGF0ZSl7XG4gICAgICAgICAgICByZWFycmFuZ2VGb3JJc29sYXRpb24odGhpcy50b2tlbnMsdG9Jc29sYXRlKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgIH0gICBcbiAgICAgICAgLy9pZiAoc29sdmVkID09PSBudWxsfHx0eXBlb2Ygc29sdmVkPT09XCJzdHJpbmdcIikge3JldHVybiBzb2x2ZWQ7IH1cbiAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKS8vdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTsqL1xuICAgIH1cbiAgICBzb2x1dGlvblRvU3RyaW5nKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnNvbHV0aW9ufHxcIlwiXG4gICAgfVxuXG4gICAgdXNlUGFyc2UocG9zaXRpb246IFBvc2l0aW9uKXsvKlxuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZShwb3NpdGlvbik7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxuICAgICAgICBjb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxuICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIm5ld1Rva2Vuc1wiLHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpKi9cbiAgICB9XG4gICAgXG4gICAgcHJhaXNpbmdNZXRob2QoKXtcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcbiAgICAgICAgY29uc3QgW251bWJlckluZGV4LHZhcmlhYmxlSW5kZXgscG93SW5kZXhdID0gW2ZpbHRlckJ5VHlwZShcIm51bWJlclwiKSxmaWx0ZXJCeVR5cGUoXCJ2YXJpYWJsZVwiKSxmaWx0ZXJCeVR5cGUoXCJwb3dlclZhcmlhYmxlXCIpXVxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVzZVF1YWRyYXRpYygpXG4gICAgICAgIHJldHVybiB0aGlzLnVzZUlzb2xhdCgpOyovXG4gICAgfVxuXG4gICAgdXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kOiBQcmFpc2luZ01ldGhvZCl7XG4gICAgICAgIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0aGlzLnRva2VucyxuZXcgVG9rZW4ocHJhaXNpbmdNZXRob2QudmFyaWFibGVzWzBdKSlcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICAgICAgLy90aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMoKVxuICAgICAgICAvL1VzZSBwb3NzZXNzaW9uXG4gICAgfVxuXG4gICAgdXNlUXVhZHJhdGljKCl7LypcbiAgICAgICAgdGhpcy50b2tlbnMudG9rZW5zPXNpbXBsaWZpeSh0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGU6IHN0cmluZyk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXG4gICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNpbXBsaWZpeSh0b2tlbnMpXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHF1YWQoXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdPy52YWx1ZSB8IDAsXG4gICAgICAgICAgICAgICAgICAgIG51bWJlckluZGV4WzBdPy52YWx1ZSAqIC0xfCAwLFxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSovXG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtZXM6IHN0cmluZyx2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxuICAgIH1cbiAgICBwcm9jZXNzSW5wdXQoKXtcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKVxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcbiAgICAgICAgLy8ucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XG4gICAgfVxuICAgIGZpbmFsUmV0dXJuKCl7XG4gICAgICAgLy8gcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcbiAgICB9XG59XG5cblxuY2xhc3MgbWF0aFZhcmlhYmxlc3tcblxufVxuXG5cblxuXG5cblxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnI6IGFueSkge1xuICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICBsZXQgc3RhY2sgPSBBcnJheS5pc0FycmF5KGFycikgPyBbLi4uYXJyXSA6IFthcnJdO1xuXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBuZXh0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpO1xufVxuXG5cblxuY2xhc3MgUHJhaXNpbmdNZXRob2R7XG4gICAgdG9rZW5zXG4gICAgb3ZlcnZpZXc6IGFueTtcbiAgICB2YXJpYWJsZXM6IGFueVtdO1xuICAgIGNvbnN0cnVjdG9yKHRva2VuczogYW55KXtcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zXG4gICAgICAgIHRoaXMub3ZlcnZpZXc9dGhpcy5nZXRPdmVydmlldygpXG4gICAgICAgIHRoaXMuYXNzaWduVmFyaWFibGVzKClcbiAgICB9XG4gICAgaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5zb21lKCh0OiBhbnkpPT4gdC50eXBlPT09J3ZhcmlhYmxlJyYmdC52YWx1ZT4xKVxuICAgIH1cblxuICAgIGlzTXVsdGlwbGljYXRpb25Jc29sYXRlKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmhhc2VWYXJpYWJsZSgpJiZ0aGlzLmlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpJiZ0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKClcbiAgICB9XG4gICAgaXNJc29sYXRlKCl7XG4gICAgICAgIC8vcmV0dXJuIHRoaXMuXG4gICAgfVxuXG4gICAgaXNBbnl0aGluZ1RvSXNvbGF0ZSgpe1xuICAgICAgICBpZih0aGlzLnZhcmlhYmxlcy5sZW5ndGg+MSl0aHJvdyBuZXcgRXJyb3IoXCJ0d28gdmFyIGVxIGFyZW50IHNhcG9ydGVkIHlldFwiKVxuICAgICAgICBpZighdGhpcy5pc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpKXJldHVybjtcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLmVxdWFsc0luZGV4SWZBbnkoKTtcbiAgICAgICAgaWYoIWVxSW5kZXgpe3JldHVybn07XG4gICAgICAgIGNvbnN0IGJlZm9yID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZSgwLGVxSW5kZXgpKVxuICAgICAgICBjb25zdCBhZnRlciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoZXFJbmRleCsxKSlcbiAgICAgICAgY29uc3Qgd2hhdFRvSXNvbGF0ID10aGlzLndoYXRUb0lzb2xhdCgpO1xuICAgICAgICBpZiAoKCFiZWZvcnx8IWFmdGVyKXx8IXdoYXRUb0lzb2xhdHx8KGJlZm9yPy5zaXplPDImJmFmdGVyPy5zaXplPDIpKXJldHVybjtcbiAgICAgICAgcmV0dXJuIHtvdmVydmlld1NpZGVPbmU6IGJlZm9yLG92ZXJ2aWV3U2lkZVR3bzogYWZ0ZXIsLi4ud2hhdFRvSXNvbGF0fVxuICAgIH0vKlxuICAgIGhvd1RvSXNvbGF0ZShvdmVydmlld1NpZGVPbmUsb3ZlcnZpZXdTaWRlVHdvLGlzb2xhdGlvbkdvb2wpe1xuICAgICAgICBjb25zdCBpc29sYXRpb25UeXBlPWlzb2xhdGlvbkdvb2wuc3BsdCgnOicpO1xuICAgICAgICAvL2lmICgpe31cbiAgICB9Ki9cbiAgICB3aGF0VG9Jc29sYXQoKXtcbiAgICAgICAgLy8gaSBuZWVkIHRvIGFkZCBwb3dzIGFmdGVyXG4gICAgICAgIC8vIGZvciBrbm93IGltIGdvaW5nIG9uIHRoZSBvc2hvbXNoaW4gdGhhdCB0aHIgaXMgb25seSBvbmUgdmFyXG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzPy5sZW5ndGg8MSlyZXR1cm47XG5cbiAgICAgICAgcmV0dXJuIHt0eXBlOiAndmFyaWFibGUnLHZhbHVlOiB0aGlzLnZhcmlhYmxlc1swXX1cbiAgICB9LypcbiAgICBpc092ZXJ2aWV3VG9pc29sYXQob3ZlcnZpZXcpe1xuICAgIH0qL1xuICAgIGlzSW1iYWxhbmNlKG92ZXJ2aWV3OiB7IHNpemU6IG51bWJlcjsgfSl7XG4gICAgICAgIG92ZXJ2aWV3LnNpemU+MVxuICAgIH1cbiAgICBlcXVhbHNJbmRleElmQW55KCl7XG4gICAgICAgIGNvbnN0IGVxSW5kZXg9dGhpcy50b2tlbnMubWFwKCh0OiB7IHZhbHVlOiBzdHJpbmc7IH0saWR4OiBhbnkpPT50LnZhbHVlPT09J0VxdWFscyc/aWR4Om51bGwpLmZpbHRlcigobTogbnVsbCk9Pm0hPT1udWxsKTtcbiAgICAgICAgcmV0dXJuIGVxSW5kZXhbMF07XG4gICAgfVxuICAgIGlzUXVhZHJhdGljKCl7XG5cbiAgICB9XG4gICAgaXNGaW5hbFJldHVybigpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMubGVuZ3RoPDJ8fCh0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpXG4gICAgfVxuICAgIFxuICAgIGFzc2lnblZhcmlhYmxlcygpe1xuICAgICAgICB0aGlzLnZhcmlhYmxlcz1bXVxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLm92ZXJ2aWV3LmVudHJpZXMoKSl7XG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKCd2YXJpYWJsZTonKSYmIXRoaXMudmFyaWFibGVzLmluY2x1ZGVzKHZhbHVlLnZhcmlhYmxlKSl7XG4gICAgICAgICAgICAgICAgdGhpcy52YXJpYWJsZXMucHVzaCh2YWx1ZS52YXJpYWJsZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGhhc2VWYXJpYWJsZSgpe3JldHVybiB0aGlzLnZhcmlhYmxlcz8ubGVuZ3RoPjB9XG5cbiAgICBpc1RoZXJlT3BlcmF0b3JPdGhlclRoYW5FcXVhbHMoKXtcbiAgICAgICAgY29uc3QgZmlsdGVyPXRoaXMuZmlsdGVyQnlUeXBlKCdvcGVyYXRvcicsJ0VxdWFscycpXG4gICAgICAgIHJldHVybiAgZmlsdGVyLm5vTWF0Y2g+MFxuICAgIH1cbiAgICBpc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpe1xuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubWF0Y2g9PT0xJiZmaWx0ZXIubm9NYXRjaD09PTBcbiAgICB9XG5cbiAgICBmaWx0ZXJCeVR5cGUodHlwZUtleTogc3RyaW5nLCB0YXJnZXRWYWx1ZTogc3RyaW5nKXtcbiAgICAgICAgbGV0IG1hdGNoPTAsIG5vTWF0Y2g9MFxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLm92ZXJ2aWV3LmVudHJpZXMoKSkge1xuICAgICAgICAgICAgaWYgKGtleT8uc3RhcnRzV2l0aCh0eXBlS2V5KSkge1xuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IHR5cGVLZXkrJzonK3RhcmdldFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoKys7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbm9NYXRjaCsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBtYXRjaDogbWF0Y2gsIG5vTWF0Y2g6IG5vTWF0Y2ggfTtcbiAgICB9XG4gICAgZ2V0T3ZlcnZpZXcodG9rZW5zPzogYW55W10gKSB7XG4gICAgICAgIGlmKCF0b2tlbnMpdG9rZW5zPXRoaXMudG9rZW5zXG4gICAgICAgIGlmKCF0b2tlbnMpcmV0dXJuO1xuICAgICAgICBjb25zdCBvdmVydmlldyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xuICAgICAgICAgICAgLy9pZiAoIXRva2VuLmlzVmFsdWVUb2tlbigpKSB7cmV0dXJuO31cbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRva2VuLmdldEZ1bGxUb2tlbklEKClcbiAgICAgICAgICAgIC8vRXF1YWxzXG4gICAgICAgICAgICBpZiAoIW92ZXJ2aWV3LmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW50cnkgPSB7IFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlbi50eXBlLCBcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IDAgLFxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZTogdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gJ3ZhcmlhYmxlJykge1xuICAgICAgICAgICAgICAgICAgICBlbnRyeS52YXJpYWJsZSA9IHRva2VuLnZhcmlhYmxlO1xuICAgICAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgICAgICBvdmVydmlldy5zZXQoa2V5LCBlbnRyeSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdmVydmlldy5nZXQoa2V5KS5jb3VudCsrO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG92ZXJ2aWV3Ly9BcnJheS5mcm9tKG92ZXJ2aWV3LnZhbHVlcygpKTtcbiAgICB9XG59XG5cbmNsYXNzIE9wZXJhdG9ye1xuXG59XG5cbmNsYXNzIE1vZGlmaWVye1xuXG59Il19