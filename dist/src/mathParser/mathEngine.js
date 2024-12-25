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
    operatorFound = findOperatorIndex(begin, end, tokens) !== -1;
    if (j >= 200) {
        throw new Error("operationsOrder Failed exceeded 200 revisions");
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
        console.log();
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
        //this.parse(this.tokens)
        //this.tokens.combiningLikeTerms()
        console.log('basicTokens', basicTokens);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUF1QyxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBRSxrQkFBa0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBTTVILE9BQU8sRUFBRSxjQUFjLEVBQXVCLFdBQVcsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzFGLE9BQU8sRUFBMkIsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUscUJBQXFCLEVBQXFELE1BQU0sc0JBQXNCLENBQUM7QUFJck0sT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTVFLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFVO0lBQy9DLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNyQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ25DLElBQUksR0FBRyxDQUFD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QVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxDQUFDO2dCQUVELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdCLENBQUM7WUFDRCxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxRQUFRLENBQUEsQ0FBQSxnQ0FBZ0M7SUFDbkQsQ0FBQztDQUNKO0FBRUQsTUFBTSxRQUFRO0NBRWI7QUFFRCxNQUFNLFFBQVE7Q0FFYiIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi4vaW1WZXJ5TGF6eVwiO1xyXG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XHJcbmltcG9ydCB7IGNwIH0gZnJvbSBcImZzXCI7XHJcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzLCBpc09wZW5QYXJlbiB9IGZyb20gXCIuLi91dGlscy90b2tlblV0ZW5zaWxzXCI7XHJcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRPcGVyYXRvcnNCeUJyYWNrZXQsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcclxuaW1wb3J0IHsgbnVtYmVyLCBzdHJpbmcgfSBmcm9tIFwiem9kXCI7XHJcbmltcG9ydCB7IEJhc2ljVGlrelRva2VuIH0gZnJvbSBcInNyYy90aWt6amF4L2ludGVycHJldC90b2tlbml6ZVRpa3pqYXhcIjtcclxuaW1wb3J0IHsgZ3JvdXAgfSBmcm9tIFwiY29uc29sZVwiO1xyXG5pbXBvcnQgeyBNYXRoR3JvdXAsIG1hdGhKYXhPcGVyYXRvciwgVG9rZW4sIFRva2VucyB9IGZyb20gXCIuL21hdGhKYXhUb2tlbnNcIjtcclxuaW1wb3J0IHsgc3RhcnQgfSBmcm9tIFwicmVwbFwiO1xyXG5jb25zdCBncmVla0xldHRlcnMgPSBbXHJcbiAgICAnQWxwaGEnLCdhbHBoYScsICdCZXRhJywgJ0dhbW1hJywgJ0RlbHRhJywgJ0Vwc2lsb24nLCAnWmV0YScsICdFdGEnLCAnVGhldGEnLCBcclxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXHJcbiAgICAnU2lnbWEnLCAnVGF1JywgJ1Vwc2lsb24nLCAnUGhpJywgJ0NoaScsICdQc2knLCAnT21lZ2EnXHJcbl07XHJcbi8qY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xyXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXHJcbiAgICAnYXRhbicsICdhcmNjb3MnLCAnYXJjc2luJywgJ2FyY3RhbicsICdjZG90Jywnc3FydCdcclxuXSovXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKGFycjogYW55W10pIHtcclxuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xyXG4gICAgbGV0IHN0YXJ0ID0gMDtcclxuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IGFyci5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XHJcbiAgICAgICAgICAgIGlmIChpIC0gc3RhcnQgPiAxKSB7XHJcbiAgICAgICAgICAgICAgICBzZXF1ZW5jZXMucHVzaChhcnIuc2xpY2Uoc3RhcnQsIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzdGFydCA9IGk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHNlcXVlbmNlcztcclxufVxyXG5cclxuXHJcbmNvbnN0IG9wZXJhdG9yc0Zvck1hdGhpbmZvID0ge1xyXG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcclxuICAgIHJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2g6IFtcInNxcnRcIl0sXHJcbiAgICBib3RoOiBbXCIrXCIsIFwiLVwiLCBcIipcIl0sXHJcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxyXG4gICAgUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2g6IFtcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcclxuICAgIGRvdWJsZVJpZ2h0QnV0QnJhY2tldDogW1wiZnJhY1wiLCBcImJpbm9tXCIsXCIvXCJdXHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aEluZm97XHJcbiAgICBkZWJ1Z0luZm86IHN0cmluZz1cIlwiO1xyXG4gICAgc29sdXRpb25JbmZvOiBhbnlbXT1bXTtcclxuICAgIG1hdGhJbmZvOiBhbnlbXT1bXVxyXG4gICAgZ3JhcGg6IHN0cmluZz1cIlwiO1xyXG4gICAgYWRkR3JhcGhJbmZvKHZhbHVlOiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMuZ3JhcGgrPXZhbHVlO1xyXG4gICAgfVxyXG4gICAgYWRkRGVidWdJbmZvKG1zZzogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9KHR5cGVvZiBtc2c9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KG1zZyxudWxsLDEpOm1zZykrXCIgOiBcIisodHlwZW9mIHZhbHVlPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeSh2YWx1ZSxudWxsLDEpOnZhbHVlKSsgXCJcXG4gXCI7XHJcbiAgICB9XHJcbiAgICBhZGRTb2x1dGlvbkluZm8obWVzOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xyXG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlNvbHZlZFwiLG1lcyk7XHJcbiAgICB9XHJcbiAgICBhZGRNYXRoSW5mbyh0b2tlbnM6IFRva2Vucyl7XHJcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZE1hdGg9dG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gocmVjb25zdHJ1Y3RlZE1hdGgpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJSZWNvbnN0cnVjdGVkIG1hdGhcIixyZWNvbnN0cnVjdGVkTWF0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkU29sdXRpb24odG9rZW5zOiBUb2tlbnMscG9zaXRpb246IFBvc2l0aW9uLHNvbHV0aW9uOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xyXG4gICAgICAgIHNvbHV0aW9uPXRva2Vucy5yZWNvbnN0cnVjdChbc29sdXRpb25dKTtcclxuICAgICAgICBjb25zdCBsZWZ0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLmluZGV4KSk7XHJcbiAgICAgICAgY29uc3QgcmlnaHQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24uaW5kZXgrMSxwb3NpdGlvbi5yaWdodC5icmVha0NoYXIsKSk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHJ1ZSl7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aEJ1dFJpZ2h0QnJhY2tldC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3J9IHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGguaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoL1xcKi9nLCBcIlxcXFxjZG90XCIpfSAke3JpZ2h0fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gYFxcXFxmcmFjeyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgXFxcXHNxcnR7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5SaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3J9ICgke3JpZ2h0fSkgPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZShcIi9cIixcImZyYWNcIil9eyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYWRkU29sdXRpb25JbmZvKHNvbHV0aW9uKTtcclxuICAgIH1cclxufVxyXG5cclxuLypcclxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XHJcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XHJcbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XHJcbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxyXG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxyXG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxyXG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcclxuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcclxuICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XHJcbn0qL1xyXG5cclxuZnVuY3Rpb24gcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3I6IHN0cmluZyxsZWZ0OiBhbnkscmlnaHQ6IGFueSl7XHJcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIGxlZnQ/LnZhbHVlIT09XCJudW1iZXJcIiYmZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJykuaW5jbHVkZXMob3BlcmF0b3IpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGVmdCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodD8udmFsdWUhPT1cIm51bWJlclwiKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmlnaHQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBwYXJzZShwb3NpdGlvbjogeyBvcGVyYXRvcjogYW55OyBzcGVjaWFsQ2hhcj86IGFueTsgbGVmdD86IGFueTsgcmlnaHQ/OiBhbnk7IH0pIHtcclxuICAgIGxldCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xyXG4gICAgXHJcbiAgICBsZWZ0PWxlZnQ/LnRva2Vuc1xyXG4gICAgcmlnaHQ9cmlnaHQudG9rZW5zXHJcbiAgICAvL2NvbnNvbGUubG9nKCd0aGlzLmxlZnQsdGhpcy5yaWdodCcsbGVmdCxyaWdodClcclxuICAgIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yLGxlZnQscmlnaHQpO1xyXG4gICAgXHJcbiAgICBsZXQgc29sdmVkPW5ldyBUb2tlbigwLHVuZGVmaW5lZCk7XHJcbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XHJcbiAgICAgICAgY2FzZSBcIlNxdWFyZSBSb290XCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KHJpZ2h0LnZhbHVlLHNwZWNpYWxDaGFyIT09bnVsbD8oMSkvKHNwZWNpYWxDaGFyKTowLjUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiUG93XCI6XHJcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlfHxyaWdodC52YXJpYWJsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV8fGxlZnQudmFyaWFibGU9PT1yaWdodC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlP3JpZ2h0LnZhcmlhYmxlOlwiXCI7XHJcbiAgICAgICAgICAgICAgICAvL3NvbHZlZC5wb3c9MlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiRnJhY3Rpb25cIjpcclxuICAgICAgICBjYXNlIFwiL1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIk11bHRpcGxpY2F0aW9uXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKiByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgaGFuZGxlVnJpYWJsZXMobGVmdCwgcmlnaHQsc29sdmVkKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIitcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSArIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiTWludXNcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAtIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYmlub21cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlRmFjdG9yaWFsKGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwic2luXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSlcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInRhblwiOlxyXG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoXCJ0YW4gTXVzdCBiZSBzbWFsbGVyIHRoYW4gOTBcIik7fVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC50YW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImFzaW5cIjpcclxuICAgICAgICBjYXNlIFwiYXJjc2luXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hc2luKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhY29zXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY2Nvc1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYWNvcyhyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYXRhblwiOlxyXG4gICAgICAgIGNhc2UgXCJhcmN0YW5cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4ocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgaWRlbnRpZnkgb3BlcmF0b3IgdHlwZSBhdCBwcmFpc2Ugb3BlcmF0b3I6IFwiK3Bvc2l0aW9uLm9wZXJhdG9yKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQ6IHsgdmFyaWFibGU6IGFueTsgcG93OiBhbnk7IHZhbHVlOiBudW1iZXI7IH0sIHJpZ2h0OiB7IHZhcmlhYmxlOiBhbnk7IHBvdzogYW55OyB2YWx1ZTogbnVtYmVyOyB9LCBzb2x2ZWQ6IFRva2VuKSB7XHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcclxuICAgICAgICAgICAgLyogS2VlcCB0aGVtIHNlcGFyYXRlIHNpbmNlIHRoZXkgaGF2ZSBkaWZmZXJlbnQgdmFyaWFibGVzXHJcbiAgICAgICAgICAgIHNvbHZlZC50ZXJtcyA9IFtcclxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxyXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogcmlnaHQudmFyaWFibGUsIHBvdzogcmlnaHQucG93IHx8IDEsIHZhbHVlOiByaWdodC52YWx1ZSB8fCAxIH1cclxuICAgICAgICAgICAgXTsqL1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaWZmZXJlbnQgdmFyaWFibGUgYmFzZXMgYXQgcG93ZXIgbXVsdGlwbGljYXRpb24uIEkgZGlkbid0IGdldCB0aGVyZSB5ZXRcIilcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICBjb25zdCB2YXJpYWJsZSA9IGxlZnQudmFyaWFibGUgfHwgcmlnaHQudmFyaWFibGU7XHJcbiAgICAgICAgc29sdmVkLnZhcmlhYmxlID0gdmFyaWFibGUubGVuZ3RoPjA/dmFyaWFibGU6dW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBwb3cgPSAobGVmdC5wb3cgfHwgMCkgKyAocmlnaHQucG93IHx8IDApO1xyXG4gICAgICAgIHBvdz1sZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlJiZwb3c9PT0wJiYhbGVmdC5wb3cmJiFyaWdodC5wb3c/Mjpwb3c7XHJcbiAgICAgICAgLy9zb2x2ZWQucG93ID0gcG93IHx8IHVuZGVmaW5lZDtcclxuICAgICAgICBcclxuXHJcbiAgICAgICAgLy8gUnVsZSAzOiBIYW5kbGUgbXVsdGlwbGljYXRpb24gb2YgY29uc3RhbnRzXHJcbiAgICAgICAgY29uc3QgbGVmdFZhbHVlID0gbGVmdC52YWx1ZSB8fCAxO1xyXG4gICAgICAgIGNvbnN0IHJpZ2h0VmFsdWUgPSByaWdodC52YWx1ZSB8fCAxO1xyXG4gICAgICAgIGNvbnN0IHZhbHVlID0gbGVmdFZhbHVlICogcmlnaHRWYWx1ZTtcclxuICAgICAgICAvLyBJZiB0aGVyZSdzIG5vIHZhcmlhYmxlLCBhc3NpZ24gdGhlIHJlc3VsdCBhcyBhIGNvbnN0YW50XHJcbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQ6IGFueSxyaWdodDogYW55LHNvbHZlZDogVG9rZW4pe1xyXG4gICAgICAgIGxldCBoYW5kbGVkPXtWYXI6bnVsbCxQb3c6bnVsbH07XHJcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICByZXR1cm4gO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cclxuICAgICAgICAvL2NvbnNvbGUubG9nKGxlZnQudmFyaWFibGUscmlnaHQudmFyaWFibGUpXHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUhPT1yaWdodC52YXJpYWJsZSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlR3byB2YXJpYWJsZSBlcXVhdGlvbnMgYXJlbid0IGFjY2VwdGVkIHlldFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9oYW5kbGVkLlZhcj1sZWZ0LnZhcjtcclxuICAgICAgICAvL3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhclxyXG5cclxuICAgICAgICAvKlxyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfVxyXG4gICAgICAgIGVsc2UgaWYgKCFsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlfVxyXG4gICAgICAgIGVsc2UgaWYgKGxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGU7c29sdmVkLnBvdz0yfVxyXG4gICAgICAgICovXHJcbiAgICB9XHJcblxyXG5cclxuICAgIHJldHVybiBzb2x2ZWQ7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiByZWFycmFuZ2VFcXVhdGlvbih0b2tlbnM6IGFueSx0b2tlblRvaXNvbGF0ZTogYW55KXtcclxuICAgIFxyXG59XHJcblxyXG5mdW5jdGlvbiBpc29sYXRlTXVsdGlwbGljYXRpb24odG9rZW5zOiBhbnksaXNvbGF0VG9rZW46IFRva2VuKXsvKlxyXG4gICAgY29uc3QgaW5kZXg9b3BlcmF0aW9uc09yZGVyKHRva2VucylcclxuICAgIGNvbnN0IElzb2xhdGVkPXRva2Vucy50b2tlbnMuZmluZCgodG9rZW46IGFueSwgaWR4OiBudW1iZXIpPT5pZHg8aW5kZXgpXHJcbiAgICBjb25zdCBmcmFjPWNyZWF0ZUZyYWModG9rZW5zLmxpc3Quc2xpY2UoaW5kZXggKyAxKSxuZXcgVG9rZW4oSXNvbGF0ZWQudmFsdWUpKVxyXG4gICAgSXNvbGF0ZWQudmFsdWU9MTtcclxuICAgIHRva2Vucy5pbnNlcnRUb2tlbnMoaW5kZXgrMSx0b2tlbnMudG9rZW5zLmxlbmd0aC1pbmRleCsxLGZyYWMpKi9cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRnJhYyhub21pbmF0b3I6IGFueSxkZW5vbWluYXRvcjogVG9rZW4pe1xyXG4gICAvLyByZXR1cm4gW25ldyBUb2tlbignZnJhYycpLG5ldyBUb2tlbignKCcpLG5vbWluYXRvcixuZXcgVG9rZW4oJyknKSxuZXcgVG9rZW4oJygnKSxkZW5vbWluYXRvcixuZXcgVG9rZW4oJyknKV1cclxufVxyXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zOiBhbnlbXSl7XHJcbiAgICBpZiAodG9rZW5zLmxlbmd0aDw9MSl7cmV0dXJuIHRva2Vuc31cclxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xyXG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUoKHRva2VuOiBhbnkpID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxyXG4gICAge1xyXG4gICAgICAgIGkrKztcclxuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xyXG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XHJcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxyXG5cclxuICAgICAgICBsZXQgY3VycmVudFRva2VuPXt0eXBlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgLCB2YWx1ZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YWx1ZSx2YXJpYWJsZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YXJpYWJsZSAscG93OiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnBvd31cclxuXHJcbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaTogYW55KSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogeyB0b2tlbjogeyB0eXBlOiBhbnk7IH07IH0pID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcclxuICAgICAgICAucmVkdWNlKChzdW06IG51bWJlciwgaXRlbTogeyBvcmlnaW5hbEluZGV4OiBudW1iZXI7IHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IG51bWJlcjsgfTsgfSkgPT4ge1xyXG4gICAgICAgIGxldCBtdWx0aXBsaWVyPSh0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0gJiYgdG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdLnZhbHVlID09PSBcIi1cIikgPyAtMSA6IDE7XHJcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcclxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxyXG4gICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xyXG4gICAgICAgIH0sIDApOyBcclxuICAgICAgICBcclxuICAgICAgICBuZXdUb2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgIC4uLmN1cnJlbnRUb2tlbixcclxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXHJcbiAgICAgICAgICAgIHRva2VuLnR5cGUgIT09IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSB8fCBcclxuICAgICAgICAgICAgKHRva2VuLnZhcmlhYmxlICYmIHRva2VuLnZhcmlhYmxlICE9PSBjdXJyZW50VG9rZW4udmFyaWFibGUpIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ld1Rva2VucztcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRva2VuczogVG9rZW5zLCBpc29sYXRpb25Hb2FsOiB7IHR5cGU6IGFueTsgdmFsdWU6IGFueTsgb3ZlcnZpZXdTaWRlT25lPzogTWFwPGFueSwgYW55Pjsgb3ZlcnZpZXdTaWRlVHdvPzogTWFwPGFueSwgYW55PjsgfSkge1xyXG4gICAgaWYgKHRva2Vucy50b2tlbnMubGVuZ3RoIDw9IDEpIHJldHVybiB0b2tlbnM7XHJcblxyXG4gICAgY29uc3QgZXFJbmRleCA9IHRva2Vucy50b2tlbnMuZmluZEluZGV4KCh0OiB7IHZhbHVlOiBzdHJpbmc7IH0pID0+IHQudmFsdWUgPT09ICdFcXVhbHMnKTtcclxuICAgIGlmIChlcUluZGV4ID09PSAtMSkgdGhyb3cgbmV3IEVycm9yKFwiTm8gJ0VxdWFscycgb3BlcmF0b3IgZm91bmQgaW4gdG9rZW5zXCIpO1xyXG5cclxuICAgIGNvbnN0IHN3aXRjaERpcmVjdGlvbiA9IGZhbHNlOyAvLyBGdXR1cmUgbG9naWMgdG8gZGV0ZXJtaW5lIGRpcmVjdGlvblxyXG4gICAgY29uc3QgaXNvbGF0aW9uR29hbEluZGljZXMgPSB0b2tlbnMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodDogeyB0eXBlOiBhbnk7IHZhcmlhYmxlOiBhbnk7IH0sIGlkeDogYW55KSA9PiAodC50eXBlID09PSBpc29sYXRpb25Hb2FsLnR5cGUgJiYgdC52YXJpYWJsZSA9PT0gaXNvbGF0aW9uR29hbC52YWx1ZSA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgY29uc3Qgb3RoZXJJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKF86IGFueSwgaWR4OiBhbnkpID0+ICghaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaWR4KSAmJiBpZHggIT09IGVxSW5kZXggPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHg6IG51bGx8bnVtYmVyKSA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgIC8vIEFkanVzdCBzaWduc1xyXG4gICAgdG9rZW5zLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogeyB2YWx1ZTogbnVtYmVyOyB9LCBpOiBudW1iZXIpID0+IHtcclxuICAgICAgICBpZiAoKHN3aXRjaERpcmVjdGlvbj8gaSA+IGVxSW5kZXggOiBpIDwgZXFJbmRleCkgJiYgb3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XHJcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoKHN3aXRjaERpcmVjdGlvbj8gaSA8IGVxSW5kZXggOiBpID4gZXFJbmRleCkgJiYgaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHtcclxuICAgICAgICAgICAgdG9rZW4udmFsdWUgKj0gLTE7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU2VwYXJhdGUgc2lkZXNcclxuICAgIGNvbnN0IHNpZGUxOiBhbnlbXSA9IFtdO1xyXG4gICAgY29uc3Qgc2lkZTI6IGFueVtdID0gW107XHJcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnksIGk6IGFueSkgPT4ge1xyXG4gICAgICAgIGlmIChpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpKSkgc2lkZTEucHVzaCh0b2tlbik7XHJcbiAgICAgICAgaWYgKG90aGVySW5kaWNlcy5pbmNsdWRlcyhpKSkgc2lkZTIucHVzaCh0b2tlbik7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0b2tlbnMudG9rZW5zID0gc3dpdGNoRGlyZWN0aW9uXHJcbiAgICAgICAgPyBbLi4uc2lkZTIsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUxXVxyXG4gICAgICAgIDogWy4uLnNpZGUxLCB0b2tlbnMudG9rZW5zW2VxSW5kZXhdLCAuLi5zaWRlMl07XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBQb3NpdGlvbiB7XHJcbiAgICBvcGVyYXRvcjogc3RyaW5nO1xyXG4gICAgaW5kZXg6IG51bWJlcjtcclxuICAgIHRyYW5zaXRpb246IG51bWJlcjtcclxuICAgIHNwZWNpYWxDaGFyOiBzdHJpbmc7XHJcbiAgICBsZWZ0OiBhbnk7XHJcbiAgICByaWdodDogYW55O1xyXG4gICAgY29uc3RydWN0b3IodG9rZW5zOiBhbnlbXSwgaW5kZXg6IG51bWJlcil7XHJcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xyXG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgdGhpcy5wb3NpdGlvbih0b2tlbnMpXHJcbiAgICB9XHJcbiAgICBwb3NpdGlvbih0b2tlbnM6IGFueVtdKSB7XHJcbiAgICAgICAgdGhpcy5vcGVyYXRvciA9IHRva2Vuc1t0aGlzLmluZGV4XS52YWx1ZTtcclxuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgY2FzZSBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ2JvdGgnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJsZWZ0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgncmlnaHQnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHticmVha0NoYXI6IHRoaXMuaW5kZXh9O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnZG91YmxlUmlnaHQnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMubGVmdC5icmVha0NoYXI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLTEsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdC5icmVha0NoYXIgPSB0aGlzLmluZGV4O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodC5icmVha0NoYXIrKHRoaXMucmlnaHQubXVsdGlTdGVwPzE6MCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmF0b3IgJHt0aGlzLm9wZXJhdG9yfSB3YXMgbm90IGFjY291bnRlZCBmb3IsIG9yIGlzIG5vdCB0aGUgdmFsaWQgb3BlcmF0b3JgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9jb25zb2xlLmxvZyh0b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHRoaXMuc3BlY2lhbENoYXI9dG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyIDogbnVsbDtcclxuICAgIH1cclxuICAgIGFwcGx5UG9zaXRpb24odG9rZW5zOiBhbnlbXSwgaW5kZXg6ICBudW1iZXIsIGRpcmVjdGlvbjogc3RyaW5nKSB7XHJcbiAgICAgICAgbGV0IGJyZWFrQ2hhcj1pbmRleFxyXG4gICAgICAgIGxldCB0YXJnZXQ6IGFueVtdO1xyXG4gICAgICAgIGxldCBtdWx0aVN0ZXA9ZmFsc2U7XHJcbiAgICAgICAgY29uc3QgaXNMZWZ0ID0gZGlyZWN0aW9uID09PSBcImxlZnRcIjtcclxuICAgICAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcclxuICAgICAgICBpZiAoKGlzTGVmdCAmJiBpbmRleCA8PSAwKSB8fCAoIWlzTGVmdCAmJiBpbmRleCA+PSB0b2tlbnMubGVuZ3RoIC0gMSkgfHwgIXRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIiBpbmRleDogXCIraW5kZXgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIikge1xyXG4gICAgICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gZmluZFBhcmVuSW5kZXgodG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLmlkKTtcclxuICAgICAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2UrMTtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnNsaWNlKHBhcmVuSW5kZXgub3BlbiwgcGFyZW5JbmRleC5jbG9zZSsxKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBicmVha0NoYXI9aW5kZXgraW5kZXhNb2RpZmllcjtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gW3Rva2Vuc1ticmVha0NoYXJdXTtcclxuICAgICAgICAgICAgYnJlYWtDaGFyKz1pc0xlZnQ/MDoxXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vY29uc3QgbXVsdGlTdGVwID0gTWF0aC5hYnMoYnJlYWtDaGFyIC0gaW5kZXgpID4gMztcclxuICAgIFxyXG4gICAgICAgIGlmICghbXVsdGlTdGVwJiZ0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKXtcclxuICAgICAgICAgICAgLy90YXJnZXQ9dGFyZ2V0LmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGFyZ2V0Py5sZW5ndGg9PT0wKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgYXQgYXBwbHlQb3NpdGlvbjogY291bGRuJ3QgZmluZCB0YXJnZXQgdG9rZW4gZm9yIGRpcmVjdGlvbiAke2RpcmVjdGlvbn0gYW5kIG9wZXJhdG9yXCIke3Rva2Vuc1tpbmRleF0udmFsdWV9XCJgLCk7XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgLy9icmVha0NoYXIgPSAoYnJlYWtDaGFyICE9PSBpbmRleCA/IHRhcmdldD8uaW5kZXggOiBicmVha0NoYXIpKyBpbmRleE1vZGlmaWVyKyhpc0xlZnQ/MDoxKTtcclxuICAgICAgICAvL2RlbGV0ZSB0YXJnZXQuaW5kZXhcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGFyZ2V0Lmxlbmd0aD09PTMpe1xyXG4gICAgICAgICAgICAvL3RhcmdldD10YXJnZXQuZmluZCgoaXRlbTogeyB0eXBlOiBzdHJpbmc7IH0pID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXHJcbiAgICAgICAgfWVsc2UgaWYodGFyZ2V0Lmxlbmd0aD4xKW11bHRpU3RlcD10cnVlXHJcbiAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0b2tlbnM6IHRhcmdldCxcclxuICAgICAgICAgICAgbXVsdGlTdGVwOiBtdWx0aVN0ZXAsXHJcbiAgICAgICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyLFxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBjaGVja011bHRpU3RlcCgpe1xyXG4gICAgICAgIHJldHVybiAoKGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpJiZ0aGlzLmxlZnQ/Lm11bHRpU3RlcCl8fHRoaXMucmlnaHQ/Lm11bHRpU3RlcCkmJnRoaXMub3BlcmF0b3I9PT0nTXVsdGlwbGljYXRpb24nO1xyXG4gICAgfVxyXG4gICAgaXNMZWZ0VmFyKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXA/dGhpcy5sZWZ0LnRva2Vucy5zb21lKCh0OiB7IHR5cGU6IHN0cmluZzsgfSk9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5sZWZ0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcclxuICAgIH1cclxuICAgIGlzUmlnaHRWYXIoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5yaWdodC5tdWx0aVN0ZXA/dGhpcy5yaWdodC50b2tlbnMuc29tZSgodDogeyB0eXBlOiBzdHJpbmc7IH0pPT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMucmlnaHQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxyXG4gICAgfVxyXG4gICAgY2hlY2tGcmFjKCl7Ly8hdGhpcy5jaGVja011bHRpU3RlcCgpIEkgZG9uJ3Qga25vdyB3aHkgSSBoYWQgdGhpcyBoZXJlXHJcbiAgICAgICAgcmV0dXJuIC8oZnJhY3xcXC8pLy50ZXN0KHRoaXMub3BlcmF0b3IpJiYodGhpcy5pc0xlZnRWYXIoKXx8dGhpcy5pc1JpZ2h0VmFyKCkpXHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlT3BlcmF0b3Iob3BlcmF0b3I6IG1hdGhKYXhPcGVyYXRvcik6IGJvb2xlYW4ge1xyXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGFuZCByZXRyaWV2ZSB0aGUgb3BlcmFibGUgdmFsdWVcclxuICAgIGZ1bmN0aW9uIGdldE9wZXJhYmxlVmFsdWUoZ3JvdXA6IE1hdGhHcm91cCk6IG51bWJlciB8IG51bGwge1xyXG4gICAgICAgIGlmICghZ3JvdXAuaXNPcGVyYWJsZSgpKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBjb25zdCB2YWx1ZSA9IGdyb3VwLmdldE9wZXJhYmxlVmFsdWUoKTtcclxuICAgICAgICByZXR1cm4gdmFsdWU/LnZhbHVlID8/IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdmFsdWUgPSBnZXRPcGVyYWJsZVZhbHVlKG9wZXJhdG9yLmdyb3VwMSk7XHJcbiAgICBpZiAodmFsdWUgPT09IG51bGwpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBzd2l0Y2ggKG9wZXJhdG9yLm9wZXJhdG9yKSB7XHJcbiAgICAgICAgY2FzZSBcIlNpblwiOlxyXG4gICAgICAgICAgICBvcGVyYXRvci5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKHZhbHVlKSkpXSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBjYXNlIFwiU3F1YXJlIHJvb3RcIjpcclxuICAgICAgICAgICAgaWYgKHZhbHVlIDwgMCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGNhbGN1bGF0ZSB0aGUgc3F1YXJlIHJvb3Qgb2YgYSBuZWdhdGl2ZSBudW1iZXIuXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG9wZXJhdG9yLnNvbHV0aW9uID0gbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKE1hdGgucG93KHZhbHVlLDAuNSkpXSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICBgVW5rbm93biBvcGVyYXRvciB0eXBlIGluIHBhcnNlT3BlcmF0b3I6ICR7b3BlcmF0b3Iub3BlcmF0b3J9YFxyXG4gICAgICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBvcGVyYXRpb25zT3JkZXIodG9rZW5zOiBhbnlbXSkge1xyXG4gICAgZnVuY3Rpb24gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW46IG51bWJlciwgZW5kOiBudW1iZXIsIHRva2VuczogYW55LCBmaW5kUGFyZW5JbmRleD86IGFueSwgcmVnZXg/OiBhbnkpIHtcclxuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGxldCBpbmRleDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChyZWdleCkge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBhbnk7IH0pID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIiAmJiByZWdleC50ZXN0KHRva2VuLnZhbHVlKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBiZWdpbiA9IDAsIGVuZCA9IHRva2Vucy5sZW5ndGgsaj0wO1xyXG4gICAgbGV0IGN1cnJlbnRJRCA9IG51bGw7ICBcclxuICAgIGxldCBjaGVja2VkSURzOiBhbnlbXSA9IFtdOyAgXHJcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGlzT3BlblBhcmVuKHRva2Vuc1tpXSkgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zW2ldLmlkKSkge1xyXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBmaW5kUGFyZW5JbmRleCh0b2tlbnNbaV0sdW5kZWZpbmVkLHRva2Vucyk7ICBcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGN1cnJlbnRJRCE9PW51bGwmJmk9PT1jdXJyZW50SUQuY2xvc2UpIHtcclxuICAgICAgICAgICAgW2JlZ2luLGVuZF09W2N1cnJlbnRJRC5vcGVuLGN1cnJlbnRJRC5jbG9zZV1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xyXG5cclxuICAgIGlmIChqPj0yMDApe3Rocm93IG5ldyBFcnJvcihcIm9wZXJhdGlvbnNPcmRlciBGYWlsZWQgZXhjZWVkZWQgMjAwIHJldmlzaW9uc1wiKTt9XHJcbiAgICBsZXQgcHJpb3JpdHk9bnVsbFxyXG4gICAgZm9yIChsZXQgaT0xO2k8PTY7aSsrKXtcclxuICAgICAgICBwcmlvcml0eSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHkoaSx0cnVlKSk7XHJcbiAgICAgICAgaWYocHJpb3JpdHkhPT1udWxsKWJyZWFrO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHtzdGFydDogYmVnaW4sZW5kOiBlbmQsc3BlY2lmaWNPcGVyYXRvckluZGV4OiBwcmlvcml0eX1cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcclxuICAgIGlucHV0PVwiXCI7XHJcbiAgICB0b2tlbnM6IE1hdGhHcm91cDtcclxuICAgIHNvbHV0aW9uOiBhbnk7XHJcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcclxuICAgIGk9MDtcclxuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCB0b2tlbnM9bmV3IFRva2Vucyh0aGlzLmlucHV0KTtcclxuICAgICAgICBjb25zdCBiYXNpY1Rva2Vucz10b2tlbnMudG9rZW5zXHJcblxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiVG9rZW5zIGFmdGVyIHRva2VuaXplXCIsYmFzaWNUb2tlbnMpXHJcbiAgICAgICAgLy90aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLmNvbnRyb2xsZXIoYmFzaWNUb2tlbnMpO1xyXG4gICAgICAgIHRoaXMuc29sdXRpb249dGhpcy50b2tlbnNcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcInNvbHV0aW9uXCIsdGhpcy5zb2x1dGlvbilcclxuICAgIH1cclxuICAgIGdldFJlZHlmb3JOZXdSb25kKCl7XHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XHJcbiAgICAgICAgLy90aGlzLm1hdGhJbmZvLmFkZE1hdGhJbmZvKHRoaXMudG9rZW5zKVxyXG4gICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8odGhpcy50b2tlbnMudG9rZW5zLHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGgpXHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5leHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpO1xyXG4gICAgfVxyXG4gICAgZ3JvdXBNYXRoVG9rZW5zKCl7XHJcbiAgICAgICAgLy8gU3RlcCBvbmUgc3RydWN0dXJlIGFrYSByZXBsYWNlIHBhcmVudGhlc2VzIHdpdGggbmVzdGVkIGFycmF5c1xyXG4gICAgICAgICAgICAgICAgLy8gU3RlcCB0d28gRmluZCBmaXJzdCBvcGVyYXRvci5hbmQgY29udGludWUgZnJvbSB0aGVyZVxyXG4gICAgICAgICAgICAgICAgLypcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBvcz1uZXcgUG9zaXRpb24odGVtcFRva2VucylcclxuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGg9bmV3IG1hdGhKYXhPcGVyYXRvcihwb3Mub3BlcmF0b3IpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cD1uZXcgTWF0aEdyb3VwKClcclxuICAgICAgICAgICAgICAgIGlmKHBvcy5pbmRleCl7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zLmxlZnQuYnJlYWtDaGFyLHBvcy5yaWdodC5icmVha0NoYXItcG9zLmxlZnQuYnJlYWtDaGFyXVxyXG4gICAgICAgICAgICAgICAgZ3JvdXAuc2V0SXRlbXMocG9zLnJpZ2h0LnRva2VucylcclxuICAgICAgICAgICAgICAgIG1hdGguc2V0R3JvdXAxKGdyb3VwKVxyXG4gICAgICAgICAgICAgICAgdGVtcFRva2Vucy5zcGxpY2UobGVmdEJyZWFrLGxlbmd0aCxtYXRoKX1cclxuICAgICAgICBcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zPW5ldyBNYXRoR3JvdXAodGVtcFRva2VucykqL1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIDtcclxuICAgIH1cclxuICAgIGNyZWF0ZU1hdGhHcm91cEluc2VydEZyb21Ub2tlbnModG9rZW5zOiBBcnJheTxUb2tlbnxNYXRoR3JvdXB8bWF0aEpheE9wZXJhdG9yPixzdGFydDogbnVtYmVyLGVuZDogbnVtYmVyKXtcclxuICAgICAgICBjb25zdCBuZXdNYXRoR3JvdXA9bmV3IE1hdGhHcm91cCh0b2tlbnMuc2xpY2Uoc3RhcnQsZW5kKSk7XHJcbiAgICAgICAgcmV0dXJuIG5ld01hdGhHcm91cFxyXG4gICAgfVxyXG4gICAgY3JlYXRlT3BlcmF0b3JJdGVtRnJvbVRva2Vucyh0b2tlbnM6IEFycmF5PFRva2VufE1hdGhHcm91cHxtYXRoSmF4T3BlcmF0b3I+LGluZGV4OiBudW1iZXIpe1xyXG4gICAgICAgIGNvbnN0IHBvc2l0aW9uPW5ldyBQb3NpdGlvbih0b2tlbnMsaW5kZXgpXHJcbiAgICAgICAgY29uc3QgbmV3T3BlcmF0b3I9bmV3IG1hdGhKYXhPcGVyYXRvcihwb3NpdGlvbi5vcGVyYXRvcilcclxuICAgICAgICBuZXdPcGVyYXRvci5zZXRHcm91cDEobmV3IE1hdGhHcm91cChwb3NpdGlvbi5yaWdodC50b2tlbnMpKVxyXG4gICAgICAgIHJldHVybiBuZXdPcGVyYXRvclxyXG4gICAgfVxyXG4gICAgZGVmaW5lR3JvdXBzQW5kT3BlcmF0b3JzKHRva2VuczogQXJyYXk8VG9rZW58TWF0aEdyb3VwfG1hdGhKYXhPcGVyYXRvcj4pOmJvb2xlYW58dGhpc3tcclxuICAgICAgICBjb25zdCByYW5nZT1vcGVyYXRpb25zT3JkZXIodG9rZW5zKTtcclxuICAgICAgICBpZihyYW5nZS5zdGFydD09PW51bGx8fHJhbmdlLmVuZD09PW51bGwpcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGlmKHJhbmdlLnNwZWNpZmljT3BlcmF0b3JJbmRleD09PW51bGwmJnJhbmdlLnN0YXJ0PT09MCYmcmFuZ2UuZW5kPT09dG9rZW5zLmxlbmd0aClyZXR1cm4gdHJ1ZTtcclxuICAgICAgICBsZXQgbmV3TWF0aEdyb3VwPW51bGxcclxuICAgICAgICBpZiAocmFuZ2Uuc3BlY2lmaWNPcGVyYXRvckluZGV4IT09bnVsbClcclxuICAgICAgICAgICAgbmV3TWF0aEdyb3VwPXRoaXMuY3JlYXRlT3BlcmF0b3JJdGVtRnJvbVRva2Vucyh0b2tlbnMscmFuZ2Uuc3BlY2lmaWNPcGVyYXRvckluZGV4KVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgbmV3TWF0aEdyb3VwPXRoaXMuY3JlYXRlTWF0aEdyb3VwSW5zZXJ0RnJvbVRva2Vucyh0b2tlbnMscmFuZ2Uuc3RhcnQscmFuZ2UuZW5kKVxyXG4gICAgICAgIGlmKCFuZXdNYXRoR3JvdXApcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIHRva2Vucy5zcGxpY2UocmFuZ2Uuc3RhcnQscmFuZ2UuZW5kLXJhbmdlLnN0YXJ0LG5ld01hdGhHcm91cCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmaW5lR3JvdXBzQW5kT3BlcmF0b3JzKHRva2Vucyk7XHJcbiAgICB9XHJcbiAgICBwYXJzZSh0b2tlbnM6IE1hdGhHcm91cCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBvcGVyYXRvciA9IHRva2Vucy5pdGVtcy5maW5kKFxyXG4gICAgICAgICAgICB0ID0+IHQgaW5zdGFuY2VvZiBtYXRoSmF4T3BlcmF0b3IgJiYgdC5pc09wZXJhYmxlXHJcbiAgICAgICAgKSBhcyBtYXRoSmF4T3BlcmF0b3IgfCB1bmRlZmluZWQ7XHJcbiAgICBcclxuICAgICAgICBpZiAoIW9wZXJhdG9yKSByZXR1cm47XHJcbiAgICBcclxuICAgICAgICBjb25zdCBncm91cDEgPSB0aGlzLnBhcnNlKG9wZXJhdG9yLmdyb3VwMSk7XHJcblxyXG4gICAgICAgIGxldCBncm91cDIgPSBudWxsO1xyXG4gICAgICAgIGlmIChvcGVyYXRvci5hc3NvY2lhdGl2aXR5TnVtYmVyID4gMSAmJiBvcGVyYXRvci5ncm91cDIpIHtcclxuICAgICAgICAgICAgZ3JvdXAyID0gdGhpcy5wYXJzZShvcGVyYXRvci5ncm91cDIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zb2xlLmxvZygnb3BlcmF0b3InLCBvcGVyYXRvciwgZ3JvdXAxLCBncm91cDIpO1xyXG4gICAgXHJcbiAgICAgICAgcGFyc2VPcGVyYXRvcihvcGVyYXRvcik7XHJcbiAgICAgICAgaWYgKCFvcGVyYXRvci5zb2x1dGlvbikge1xyXG4gICAgICAgICAgICBvcGVyYXRvci5pc09wZXJhYmxlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAvLyBSZXBsYWNlIHRva2VucyB3aXRoIHRoZSBzb2x1dGlvblxyXG4gICAgICAgIHRva2Vucy5pdGVtcyA9IG9wZXJhdG9yLnNvbHV0aW9uLml0ZW1zOyBcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29udHJvbGxlcihiYXNpY1Rva2VuczogVG9rZW5bXSk6IGFueXtcclxuICAgICAgICAvLyBUaGUgZXhwcmVzc2lvbiBuZWVkcyB0byBiZSB3cmFwcGVkIE4gYSBvcGVyYXRvciBiYXNlZCBvbiBwcmFpc2luZyBtZXRob2QgTWF5YmUgbm90IGRlY2lkZWQgb24gaXQgeWV0LlxyXG4gICAgICAgIC8vY29uc3Qgd2hhdGVidmVyPVxyXG4gICAgICAgIGNvbnN0IHN1Y2Nlc3M9dGhpcy5kZWZpbmVHcm91cHNBbmRPcGVyYXRvcnMoYmFzaWNUb2tlbnMpXHJcbiAgICAgICAgY29uc29sZS5sb2coJ3RoaXMuZGVmaW5lR3JvdXBzQW5kT3BlcmF0b3JzKGJhc2ljVG9rZW5zKScsYmFzaWNUb2tlbnMpXHJcbiAgICAgICAgaWYoIXN1Y2Nlc3MpcmV0dXJuXHJcbiAgICAgICAgdGhpcy50b2tlbnM9bmV3IE1hdGhHcm91cChiYXNpY1Rva2VucylcclxuICAgICAgICAvL3RoaXMucGFyc2UodGhpcy50b2tlbnMpXHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5jb21iaW5pbmdMaWtlVGVybXMoKVxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdiYXNpY1Rva2VucycsYmFzaWNUb2tlbnMpXHJcbiAgICAgICAgLypcclxuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnMuY29tYmluaW5nTGlrZVRlcm1zKClcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudG9rZW5zLnRva2Vucy5pdGVtcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy50b2tlbnMudG9rZW5zLml0ZW1zW2ldO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIShpdGVtIGluc3RhbmNlb2YgbWF0aEpheE9wZXJhdG9yKSkgY29udGludWU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnRva2Vucy5pdGVtc1tpXSA9IGl0ZW0uYWRkU29sdXRpb24oKTtcclxuICAgICAgICB9ICAgICAgICBcclxuICAgICAgICAqL1xyXG4gICAgICAgIC8vdGhpcy50b2tlbnMudG9rZW5zLmFkZFNvbHV0aW9uKClcclxuICAgICAgICAvL3JldHVybiB0aGlzLnRva2Vucy50b2tlbnM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLypcclxuICAgICAgICB0aGlzLmkrKztcclxuICAgICAgICBpZih0aGlzLmk+MTApe3JldHVybiB0aGlzLmZpbmFsUmV0dXJuKCl9XHJcblxyXG4gICAgICAgIHRoaXMuZ2V0UmVkeWZvck5ld1JvbmQoKTtcclxuICAgICAgICAvL2NvbnN0IG92ZXJ2aWV3PXRoaXMudG9rZW5zLmdldE92ZXJ2aWV3KClcclxuICAgICAgICBjb25zdCBwcmFpc2luZ01ldGhvZD1uZXcgUHJhaXNpbmdNZXRob2QodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIGlmIChwcmFpc2luZ01ldGhvZC5pc1RoZXJlT3BlcmF0b3JPdGhlclRoYW5FcXVhbHMoKSl7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMudG9rZW5zKTtcclxuICAgICAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJQYXJzZWQgZXhwcmVzc2lvblwiLCBKU09OLnN0cmluZ2lmeShwb3NpdGlvbiwgbnVsbCwgMSkpO1xyXG4gICAgICAgICAgICBpZiAocG9zaXRpb24gPT09IG51bGwmJnRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MSl7XHJcbiAgICAgICAgICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKFwicGFyc2UodG9rZW5zKVwiLHBhcnNlKHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJ0aGUgKioqKlwiXHJcbiAgICAgICAgICAgIC8vIHJldHVybiBzb2x1dGlvbih0b2tlbnMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWMoKXx8cG9zaXRpb24uY2hlY2tNdWx0aVN0ZXAoKSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyh0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCh0aGlzLnRva2Vucy50b2tlbnMpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy51c2VQYXJzZShwb3NpdGlvbilcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYocHJhaXNpbmdNZXRob2QuaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKSl7XHJcbiAgICAgICAgICAgIHRoaXMudXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kKVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCB0b0lzb2xhdGU9cHJhaXNpbmdNZXRob2QuaXNBbnl0aGluZ1RvSXNvbGF0ZSgpXHJcbiAgICAgICAgaWYgKHRvSXNvbGF0ZSl7XHJcbiAgICAgICAgICAgIHJlYXJyYW5nZUZvcklzb2xhdGlvbih0aGlzLnRva2Vucyx0b0lzb2xhdGUpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgICAgIH0gICBcclxuICAgICAgICAvL2lmIChzb2x2ZWQgPT09IG51bGx8fHR5cGVvZiBzb2x2ZWQ9PT1cInN0cmluZ1wiKSB7cmV0dXJuIHNvbHZlZDsgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCkvL3RoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7Ki9cclxuICAgIH1cclxuICAgIHNvbHV0aW9uVG9TdHJpbmcoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5zb2x1dGlvbnx8XCJcIlxyXG4gICAgfVxyXG5cclxuICAgIHVzZVBhcnNlKHBvc2l0aW9uOiBQb3NpdGlvbil7LypcclxuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZShwb3NpdGlvbik7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzb2x2ZWRcIixzb2x2ZWQpXHJcbiAgICAgICAgY29uc3QgW2xlZnRCcmVhayxsZW5ndGhdID0gW3Bvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhci1wb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcl1cclxuICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbih0aGlzLnRva2Vucyxwb3NpdGlvbixzb2x2ZWQpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJuZXdUb2tlbnNcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpKi9cclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJhaXNpbmdNZXRob2QoKXtcclxuICAgICAgICAvKlxyXG4gICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XHJcbiAgICAgICAgY29uc3QgW251bWJlckluZGV4LHZhcmlhYmxlSW5kZXgscG93SW5kZXhdID0gW2ZpbHRlckJ5VHlwZShcIm51bWJlclwiKSxmaWx0ZXJCeVR5cGUoXCJ2YXJpYWJsZVwiKSxmaWx0ZXJCeVR5cGUoXCJwb3dlclZhcmlhYmxlXCIpXVxyXG4gICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51c2VRdWFkcmF0aWMoKVxyXG4gICAgICAgIHJldHVybiB0aGlzLnVzZUlzb2xhdCgpOyovXHJcbiAgICB9XHJcblxyXG4gICAgdXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kOiBQcmFpc2luZ01ldGhvZCl7XHJcbiAgICAgICAgaXNvbGF0ZU11bHRpcGxpY2F0aW9uKHRoaXMudG9rZW5zLG5ldyBUb2tlbihwcmFpc2luZ01ldGhvZC52YXJpYWJsZXNbMF0pKVxyXG4gICAgICAgIC8vcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMoKVxyXG4gICAgICAgIC8vVXNlIHBvc3Nlc3Npb25cclxuICAgIH1cclxuXHJcbiAgICB1c2VRdWFkcmF0aWMoKXsvKlxyXG4gICAgICAgIHRoaXMudG9rZW5zLnRva2Vucz1zaW1wbGlmaXkodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGU6IHN0cmluZyk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzaW1wbGlmaXkodG9rZW5zKVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0/LnZhbHVlIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICBudW1iZXJJbmRleFswXT8udmFsdWUgKiAtMXwgMCxcclxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0qL1xyXG4gICAgfVxyXG4gICAgYWRkRGVidWdJbmZvKG1lczogc3RyaW5nLHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSlcclxuICAgIH1cclxuICAgIHByb2Nlc3NJbnB1dCgpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy5pbnB1dFxyXG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXHJcbiAgICAgICAgLnJlcGxhY2UoL3svZywgXCIoXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXHJcbiAgICAgICAgLy8ucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XHJcbiAgICB9XHJcbiAgICBmaW5hbFJldHVybigpe1xyXG4gICAgICAgLy8gcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgbWF0aFZhcmlhYmxlc3tcclxuXHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnI6IGFueSkge1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG4gICAgbGV0IHN0YWNrID0gQXJyYXkuaXNBcnJheShhcnIpID8gWy4uLmFycl0gOiBbYXJyXTtcclxuXHJcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpO1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XHJcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7IFxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpO1xyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIFByYWlzaW5nTWV0aG9ke1xyXG4gICAgdG9rZW5zXHJcbiAgICBvdmVydmlldzogYW55O1xyXG4gICAgdmFyaWFibGVzOiBhbnlbXTtcclxuICAgIGNvbnN0cnVjdG9yKHRva2VuczogYW55KXtcclxuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnNcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3PXRoaXMuZ2V0T3ZlcnZpZXcoKVxyXG4gICAgICAgIHRoaXMuYXNzaWduVmFyaWFibGVzKClcclxuICAgIH1cclxuICAgIGlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5zb21lKCh0OiBhbnkpPT4gdC50eXBlPT09J3ZhcmlhYmxlJyYmdC52YWx1ZT4xKVxyXG4gICAgfVxyXG5cclxuICAgIGlzTXVsdGlwbGljYXRpb25Jc29sYXRlKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFzZVZhcmlhYmxlKCkmJnRoaXMuaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCkmJnRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKVxyXG4gICAgfVxyXG4gICAgaXNJc29sYXRlKCl7XHJcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5cclxuICAgIH1cclxuXHJcbiAgICBpc0FueXRoaW5nVG9Jc29sYXRlKCl7XHJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXMubGVuZ3RoPjEpdGhyb3cgbmV3IEVycm9yKFwidHdvIHZhciBlcSBhcmVudCBzYXBvcnRlZCB5ZXRcIilcclxuICAgICAgICBpZighdGhpcy5pc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpKXJldHVybjtcclxuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMuZXF1YWxzSW5kZXhJZkFueSgpO1xyXG4gICAgICAgIGlmKCFlcUluZGV4KXtyZXR1cm59O1xyXG4gICAgICAgIGNvbnN0IGJlZm9yID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZSgwLGVxSW5kZXgpKVxyXG4gICAgICAgIGNvbnN0IGFmdGVyID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZShlcUluZGV4KzEpKVxyXG4gICAgICAgIGNvbnN0IHdoYXRUb0lzb2xhdCA9dGhpcy53aGF0VG9Jc29sYXQoKTtcclxuICAgICAgICBpZiAoKCFiZWZvcnx8IWFmdGVyKXx8IXdoYXRUb0lzb2xhdHx8KGJlZm9yPy5zaXplPDImJmFmdGVyPy5zaXplPDIpKXJldHVybjtcclxuICAgICAgICByZXR1cm4ge292ZXJ2aWV3U2lkZU9uZTogYmVmb3Isb3ZlcnZpZXdTaWRlVHdvOiBhZnRlciwuLi53aGF0VG9Jc29sYXR9XHJcbiAgICB9LypcclxuICAgIGhvd1RvSXNvbGF0ZShvdmVydmlld1NpZGVPbmUsb3ZlcnZpZXdTaWRlVHdvLGlzb2xhdGlvbkdvb2wpe1xyXG4gICAgICAgIGNvbnN0IGlzb2xhdGlvblR5cGU9aXNvbGF0aW9uR29vbC5zcGx0KCc6Jyk7XHJcbiAgICAgICAgLy9pZiAoKXt9XHJcbiAgICB9Ki9cclxuICAgIHdoYXRUb0lzb2xhdCgpe1xyXG4gICAgICAgIC8vIGkgbmVlZCB0byBhZGQgcG93cyBhZnRlclxyXG4gICAgICAgIC8vIGZvciBrbm93IGltIGdvaW5nIG9uIHRoZSBvc2hvbXNoaW4gdGhhdCB0aHIgaXMgb25seSBvbmUgdmFyXHJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXM/Lmxlbmd0aDwxKXJldHVybjtcclxuXHJcbiAgICAgICAgcmV0dXJuIHt0eXBlOiAndmFyaWFibGUnLHZhbHVlOiB0aGlzLnZhcmlhYmxlc1swXX1cclxuICAgIH0vKlxyXG4gICAgaXNPdmVydmlld1RvaXNvbGF0KG92ZXJ2aWV3KXtcclxuICAgIH0qL1xyXG4gICAgaXNJbWJhbGFuY2Uob3ZlcnZpZXc6IHsgc2l6ZTogbnVtYmVyOyB9KXtcclxuICAgICAgICBvdmVydmlldy5zaXplPjFcclxuICAgIH1cclxuICAgIGVxdWFsc0luZGV4SWZBbnkoKXtcclxuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMudG9rZW5zLm1hcCgodDogeyB2YWx1ZTogc3RyaW5nOyB9LGlkeDogYW55KT0+dC52YWx1ZT09PSdFcXVhbHMnP2lkeDpudWxsKS5maWx0ZXIoKG06IG51bGwpPT5tIT09bnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIGVxSW5kZXhbMF07XHJcbiAgICB9XHJcbiAgICBpc1F1YWRyYXRpYygpe1xyXG5cclxuICAgIH1cclxuICAgIGlzRmluYWxSZXR1cm4oKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMubGVuZ3RoPDJ8fCh0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGFzc2lnblZhcmlhYmxlcygpe1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzPVtdXHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5vdmVydmlldy5lbnRyaWVzKCkpe1xyXG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKCd2YXJpYWJsZTonKSYmIXRoaXMudmFyaWFibGVzLmluY2x1ZGVzKHZhbHVlLnZhcmlhYmxlKSl7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZhcmlhYmxlcy5wdXNoKHZhbHVlLnZhcmlhYmxlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGhhc2VWYXJpYWJsZSgpe3JldHVybiB0aGlzLnZhcmlhYmxlcz8ubGVuZ3RoPjB9XHJcblxyXG4gICAgaXNUaGVyZU9wZXJhdG9yT3RoZXJUaGFuRXF1YWxzKCl7XHJcbiAgICAgICAgY29uc3QgZmlsdGVyPXRoaXMuZmlsdGVyQnlUeXBlKCdvcGVyYXRvcicsJ0VxdWFscycpXHJcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubm9NYXRjaD4wXHJcbiAgICB9XHJcbiAgICBpc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpe1xyXG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxyXG4gICAgICAgIHJldHVybiAgZmlsdGVyLm1hdGNoPT09MSYmZmlsdGVyLm5vTWF0Y2g9PT0wXHJcbiAgICB9XHJcblxyXG4gICAgZmlsdGVyQnlUeXBlKHR5cGVLZXk6IHN0cmluZywgdGFyZ2V0VmFsdWU6IHN0cmluZyl7XHJcbiAgICAgICAgbGV0IG1hdGNoPTAsIG5vTWF0Y2g9MFxyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgodHlwZUtleSkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IHR5cGVLZXkrJzonK3RhcmdldFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2grKztcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm9NYXRjaCsrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IG1hdGNoOiBtYXRjaCwgbm9NYXRjaDogbm9NYXRjaCB9O1xyXG4gICAgfVxyXG4gICAgZ2V0T3ZlcnZpZXcodG9rZW5zPzogYW55W10gKSB7XHJcbiAgICAgICAgaWYoIXRva2Vucyl0b2tlbnM9dGhpcy50b2tlbnNcclxuICAgICAgICBpZighdG9rZW5zKXJldHVybjtcclxuICAgICAgICBjb25zdCBvdmVydmlldyA9IG5ldyBNYXAoKTtcclxuICAgICAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XHJcbiAgICAgICAgICAgIC8vaWYgKCF0b2tlbi5pc1ZhbHVlVG9rZW4oKSkge3JldHVybjt9XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRva2VuLmdldEZ1bGxUb2tlbklEKClcclxuICAgICAgICAgICAgLy9FcXVhbHNcclxuICAgICAgICAgICAgaWYgKCFvdmVydmlldy5oYXMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZW50cnkgPSB7IFxyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLnR5cGUsIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiAwICxcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZTogdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09ICd2YXJpYWJsZScpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbnRyeS52YXJpYWJsZSA9IHRva2VuLnZhcmlhYmxlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgICAgICBvdmVydmlldy5zZXQoa2V5LCBlbnRyeSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgb3ZlcnZpZXcuZ2V0KGtleSkuY291bnQrKztcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gb3ZlcnZpZXcvL0FycmF5LmZyb20ob3ZlcnZpZXcudmFsdWVzKCkpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBPcGVyYXRvcntcclxuXHJcbn1cclxuXHJcbmNsYXNzIE1vZGlmaWVye1xyXG5cclxufSJdfQ==