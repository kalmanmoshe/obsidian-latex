import { quad, degreesToRadians, radiansToDegrees, calculateFactorial } from "./mathUtilities";
import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { findParenIndex, idParentheses } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getOperatorsByBracket, hasImplicitMultiplication, searchMathJaxOperators } from "../utils/dataManager";
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
function operationsOrder(tokens) {
    function findOperatorIndex(begin, end, tokens, findParenIndex, regex) {
        while (begin < end && begin < tokens.tokens.length) {
            let index;
            if (regex) {
                index = tokens.tokens.slice(begin, end).findIndex((token) => token.type === "operator" && regex.test(token.value));
            }
            else {
                index = tokens.tokens.slice(begin, end).findIndex((token) => token.type === "operator");
            }
            if (index === -1)
                return -1;
            index += begin;
            if (!/[+-]/.test(tokens.tokens[index].value)) {
                return index;
            }
            if (index > 0 && index < tokens.tokens.length - 1) {
                if (tokens.tokens[index - 1].type === tokens.tokens[index + 1].type) {
                    return index;
                }
            }
            begin = index + 1;
        }
        return -1;
    }
    let begin = 0, end = tokens.tokens.length, j = 0;
    let currentID = null;
    let checkedIDs = [];
    let operatorFound = false;
    while (!operatorFound && j < 200) {
        // Find the innermost parentheses
        for (let i = 0; i < tokens.tokens.length; i++) {
            j++;
            if (tokens.tokens[i].value === "(" && !checkedIDs.includes(tokens.tokens[i].id)) {
                currentID = findParenIndex(tokens.tokens[i].id);
            }
            if (currentID !== null && i === currentID.close) {
                [begin, end] = [currentID.open, currentID.close];
                break;
            }
        }
        if (!currentID) {
            begin = 0;
            end = tokens.tokens.length;
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
    let priority1 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(1, true));
    let priority2 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(2, true));
    let priority3 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(3, true));
    let priority4 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(4, true));
    let priority5 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(5, true));
    let priority6 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(6, true));
    return [priority1, priority2, priority3, priority4, priority5, priority6].find(index => index !== -1) ?? null;
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
        if (!this.index || this.index === null || this.index >= tokens.tokens.length - 1) {
            return;
        }
        this.operator = tokens.tokens[this.index].value;
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
        this.specialChar = tokens.tokens[this.index].specialChar ? tokens.tokens[this.index].specialChar : null;
    }
    applyPosition(tokens, index, direction) {
        let breakChar = index;
        let target;
        let multiStep = false;
        const isLeft = direction === "left";
        const indexModifier = isLeft ? -1 : 1;
        if ((isLeft && index <= 0) || (!isLeft && index >= tokens.tokens.length - 1) || !tokens.tokens[index + indexModifier]) {
            throw new Error("at applyPosition: \"index wasn't valid\" index: " + index);
        }
        if (tokens.tokens[index + indexModifier].type === "paren") {
            const parenIndex = findParenIndex(tokens.tokens[index + indexModifier].id);
            breakChar = isLeft ? parenIndex.open : parenIndex.close + 1;
            target = tokens.tokens.slice(parenIndex.open, parenIndex.close + 1);
        }
        else {
            breakChar = index + indexModifier;
            target = tokens.tokens[breakChar];
            breakChar += isLeft ? 0 : 1;
        }
        //const multiStep = Math.abs(breakChar - index) > 3;
        if (!multiStep && tokens.tokens[index + indexModifier].type === "paren") {
            //target=target.find(item => /(number|variable|powerVariable)/.test(item.type))
        }
        if (target?.length === 0) {
            throw new Error(`at applyPosition: couldn't find target token for direction ${direction} and operator"${tokens.tokens[index].value}"`);
        }
        //breakChar = (breakChar !== index ? target?.index : breakChar)+ indexModifier+(isLeft?0:1);
        //delete target.index
        if (target.length === 3) {
            target = target.find((item) => /(number|variable|powerVariable)/.test(item.type));
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
class mathJaxOperator {
    operator;
    priority;
    associativityNumber;
    group1;
    group2;
    solution;
    constructor(operator, priority, associativityNumber, group1, group2) {
        if (operator)
            this.operator = operator;
        if (priority)
            this.priority = priority;
        if (associativityNumber)
            this.associativityNumber = associativityNumber;
        if (group1)
            this.group1 = group1;
        if (group2)
            this.group2 = group2;
    }
    setGroup1(group) { this.group1 = group; }
    setGroup2(group) { this.group2 = group; }
}
class mathGroup {
    numberOnly;
    hasVariables;
    singular;
    hasOperators;
    multiLevel;
    isOperable = true;
    items;
    constructor() {
    }
    setItems(items) {
        this.items = items;
    }
    setMetaData() {
        this.singular = this.items.length === 1;
        this.numberOnly = this.items.some(t => !t.isVar());
    }
}
function parseOperator(operator) {
    switch (operator.operator) {
        case "sin":
            //const a=new Token(Math.sin(degreesToRadians(operator.group1.items[0].value)))
            //solved.value = ;
            break;
        default:
            throw new Error("Couldn't identify operator type at praise operator: " + operator.operator);
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
        //if (position.operator==='*'){return handleVariableMultiplication(left,right,solved)}
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
        const b = new mathGroup();
        b.setItems(this.tokens.tokens[1]);
        const a = new mathJaxOperator();
        a.setGroup1(b);
        parseOperator(a);
        console.log(a);
        this.addDebugInfo("Tokens after tokenize", this.tokens.tokens);
        this.input = this.tokens.reconstruct();
        this.solution = this.controller();
    }
    getRedyforNewRond() {
        this.tokens.connectNearbyTokens();
        this.mathInfo.addMathInfo(this.tokens);
        //this.addDebugInfo(this.tokens.tokens,this.tokens.tokens.length)
        this.tokens.expressionVariableValidity();
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
class Tokens {
    tokens = [];
    operatorStructure;
    constructor(math) {
        this.tokenize(math);
    }
    tokenize(math) {
        //latexOperators.push(String.raw`[*/^=\+\-\(\)]`)
        //const operators=arrToRegexString(latexOperators)
        const operators = arrToRegexString(getAllMathJaxReferences());
        for (let i = 0; i < math.length; i++) {
            let match = math.slice(i).match(regExp('^' + operators));
            if (!!match) {
                this.tokens.push(new BasicMathJaxToken(match[0]));
                i += match[0].length - 1;
                continue;
            }
            /*if (tokens[tokens.length - 1].value === "sqrt" && math[i] === "[" && i < math.length - 2) {
                let temp=math.slice(i,i+1+math.slice(i).search(/[\]]/));
                i+=temp.length
                Object.assign(tokens[tokens.length-1],{specialChar: safeToNumber(temp),})
            }*/
            match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
            if (!!match) {
                i += match[0].length - 1;
                this.tokens.push(new BasicMathJaxToken(parseFloat(match[0])));
                continue;
            }
            match = math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/);
            if (!!match) {
                //if (vari&&vari.length===0){vari=math.slice(i,math.length)}
                i += match[0].length - 1;
                this.tokens.push(new BasicMathJaxToken(1, match[0]));
                //tokens.push({type: "variable",variable: vari.replace("(","{").replace(")","}"),value: 1});
                continue;
            }
            throw new Error(`Unknown char "${math[i]}"`);
        }
        this.postProcessTokens();
    }
    validateIndex(index, margin) {
        margin = margin || 0;
        return index >= 0 + margin && index < this.tokens.length - margin;
    }
    implicitMultiplicationMap() {
        const testDoubleRight = (index) => {
            if (!this.validateIndex(index))
                return false;
            const idx = findParenIndex(null, index).open;
            return this.tokens[index + 1]?.value === '(' && (idx === 0 || !getOperatorsByAssociativity('doubleRight').includes(this.tokens[idx - 1]?.value));
        };
        const check = (index) => {
            if (!this.validateIndex(index))
                return false;
            return this.tokens[index].isValueToken();
        };
        //Map parentheses for implicit multiplication.
        const map = this.tokens
            .map((token, index) => {
            if (token.value === "(" || (hasImplicitMultiplication(token.value))) {
                return check(index - 1) ? index : null;
            }
            else if (token.value === ")") {
                return check(index + 1) || testDoubleRight(index) ? index + 1 : null;
            }
            return null;
        })
            .filter((item) => item !== null);
        return map;
    }
    validatePlusMinus() {
        const map = this.tokens.map((token, index) => token.value === 'Plus' || token.value === 'Minus' ? index : null).filter((index) => index !== null);
        map.forEach((index) => {
            index = this.validateIndex(index, 1) && this.tokens[index - 1].type === 'operator' || this.tokens[index + 1].type === 'operator' ? null : index;
        });
        map.reverse().forEach((index) => {
            const value = this.tokens[index].value === 'Plus' ? 1 : -1;
            this.tokens[index + 1].value *= value;
            this.tokens.splice(index, 1);
        });
    }
    postProcessTokens() {
        /*rules to abid by:
        1. +- If part of the number they are absorbed into the number
        */
        idParentheses(this.tokens);
        const map = this.tokens.map((token, index) => (token.isValueToken()) ? index : null).filter((item) => item !== null);
        const arr = findConsecutiveSequences(map);
        let tempTokens = this.tokens.map((t) => typeof t.value === 'number' ? new Token(t.value, t.variable) : t);
        this.connectAndCombine(arr);
        this.validatePlusMinus() ``;
        console.log(tempTokens);
        const parenMap = this.implicitMultiplicationMap();
        parenMap.sort((a, b) => b - a)
            .forEach((value) => {
            this.tokens.splice(value, 0, new BasicMathJaxToken('*'));
        });
        const mapPow = this.tokens.map((token, index) => token.value === 'Pow' ? index : null).filter((item) => item !== null);
        console.log(mapPow);
        mapPow.forEach((index) => {
            const position = new Position(this, index);
            const [leftBreak, length] = [position.left.breakChar, position.right.breakChar - position.left.breakChar];
            // this.tokens.insertTokens(leftBreak,length,solved)
        });
    }
    mapParenIndexes() {
        return this.tokens
            .map((token, index) => token.value === "(" ? findParenIndex(undefined, index) : null)
            .filter((item) => item !== null);
    }
    filterParenIndexesForRemoval() {
        return this.mapParenIndexes()
            .filter((item) => {
            const { open: openIndex, close: closeIndex } = item;
            if (openIndex > 0) {
                if (/(operator|paren)/.test(this.tokens[openIndex - 1]?.type)) {
                    return false;
                }
            }
            if (closeIndex < this.tokens.length - 1) {
                if (this.tokens[closeIndex + 1]?.isValueToken()) {
                    return false;
                }
            }
            return true;
        }).flatMap((item) => [item.open, item.close]);
    }
    /*
    findSimilarSuccessor(tokens){
        return this.tokens.findIndex((token, index) =>
                ((tokens[index + 2]?.type !== "operator"&&tokens[index -1]?.type !== "operator")
                &&(this.tokenCompare("type",this.valueTokens(), token, tokens[index + 1]))
        ));
     }*/
    connectNearbyTokens() {
        this.tokens.forEach((token) => {
            if (!(token instanceof Token)) {
                throw new Error("ftygubhnimpo");
            }
        });
        const map = new Set(this.filterParenIndexesForRemoval());
        this.tokens = this.tokens.filter((_, idx) => !map.has(idx));
        //Problem with  = as it's affecting the variable before it
        const check = (index) => {
            return (!this.tokens?.[index - 1]?.affectedOperatorRange?.() &&
                !this.tokens?.[index + 1]?.affectedOperatorRange?.());
        };
        const numMap = this.tokens.map((token, index) => token.type === 'number' && check(index) ? index : null).filter((item) => item !== null);
        const varMap = this.tokens.map((token, index) => token.type === 'variable' && check(index) ? index : null).filter((item) => item !== null);
        const arr = [
            ...findConsecutiveSequences(numMap),
            ...findConsecutiveSequences(varMap),
        ];
        this.connectAndCombine(arr);
        idParentheses(this.tokens);
    }
    connectAndCombine(arr) {
        const indexes = [];
        arr.sort((a, b) => b[0] - a[0]).forEach(el => {
            indexes.push({ start: el[0], end: el[el.length - 1] });
        });
        indexes.forEach((index) => {
            let value = Number(this.tokens[index.start].value);
            const isVar = this.tokens.slice(index.start, index.end + 1).find((token) => token.type.includes('var'));
            for (let i = index.start + 1; i <= index.end; i++) {
                value = this.tokens[i].value + value;
            }
            //if (isVar)updatedToken.variable=isVar.variable
            this.tokens[index.start] = new Token(value, isVar?.variable);
            this.tokens.splice(index.start + 1, index.end - index.start);
        });
    }
    expressionVariableValidity() {
        if (Array.isArray(this.tokens)
            && this.tokens.some(token => /(variable|powerVariable)/.test(token.type))
            && !this.tokens.some(token => token.value === "=")) {
            return Infinity;
        }
    }
    insertTokens(start, length, objects) {
        objects = flattenArray(objects);
        if (!Array.isArray(objects)) {
            console.error("Expected `objects` to be an array, but received:", objects);
            return;
        }
        this.tokens.splice(start, length, ...objects);
    }
    reconstruct(tokens) {
        if (!tokens) {
            tokens = this.tokens;
        }
        const addPlusIndexes = this.indexesToAddPlus(tokens);
        const curlyBracketIndexes = this.curlyBracketIDs(tokens).flatMap(({ open, close }) => [open, close]);
        let math = "";
        for (let i = 0; i < tokens.length; i++) {
            let temp;
            math += addPlusIndexes.includes(i) ? '+' : '';
            if (tokens[i]?.value === "(" && tokens[tokens.findLastIndex((token, index) => token.id === tokens[i].id && tokens[index + 1]) + 1].value === "/") {
                math += "\\frac";
            }
            switch (tokens[i]?.type) {
                case "number":
                case "variable":
                case "powerVariable":
                case "operator":
                    if (tokens[i] instanceof Token)
                        math += tokens[i]?.toStringLatex();
                    //temp=roundBySettings(tokens[i].value)
                    //math+=temp+(i+1<tokens.length&&/(frac)/.test(tokens[i+1].value)?"+":"");
                    break;
                case "paren":
                    math += curlyBracketIndexes.contains(i) ? tokens[i].value.replace(/\(/, "{").replace(/\)/, "}") : tokens[i].value;
                    break;
                default:
                    console.error(this.tokens);
                    throw new Error(`Unexpected token type given to reconstruct: type ${tokens[i]?.type}`);
            }
        }
        return math;
    }
    curlyBracketIDs(tokens = this.tokens) {
        const rightBrackets = [...getOperatorsByBracket('both'), ...getOperatorsByBracket('right')];
        const bothBrackets = [...getOperatorsByBracket('both')];
        const doubleRightBrackets = [...getOperatorsByBracket('doubleRight')];
        const map = [];
        tokens.forEach((token, index) => {
            const prevToken = tokens[index - 1]?.value;
            const nextToken = tokens[index + 1]?.value;
            if (token.value === '(') {
                if (index > 0 && doubleRightBrackets.includes(prevToken)) {
                    const p1 = findParenIndex(undefined, index, tokens);
                    const p2 = findParenIndex(undefined, p1.close + 1, tokens);
                    map.push(p1, p2);
                }
                else if (index > 0 && rightBrackets.includes(prevToken)) {
                    map.push(findParenIndex(undefined, index, tokens));
                }
            }
            else if (token.value === ')' && bothBrackets.includes(nextToken)) {
                map.push(findParenIndex(undefined, index, tokens));
            }
        });
        return map;
    }
    indexesToAddPlus(tokens) {
        return tokens.map((token, index) => index > 0
            && tokens[index - 1]?.isValueToken()
            && token?.isValueToken() && token.value >= 0 ? index : null).filter(item => item !== null);
    }
    tokenCompare(compare, value, token, nextToken) {
        const regExpvalue = (value instanceof RegExp) ? value : new RegExp(value);
        return ((value === null || regExpvalue.test(token[compare])) &&
            token[compare] === nextToken?.[compare]);
    }
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
export class Token {
    value;
    variable;
    constructor(value, variable) {
        this.value = value;
        this.variable = variable;
    }
    isVar() { return this.variable !== undefined; }
}
export class BasicMathJaxToken {
    type;
    value;
    variable;
    modifier;
    id;
    constructor(value, variable) {
        this.value = value;
        this.variable = variable;
        this.setType();
        this.insurProperFormatting();
    }
    insurProperFormatting() {
        if (this.type === 'operator' && typeof this.value === 'string') {
            this.value = searchMathJaxOperators(this.value)?.name;
        }
        // if (!this.value){throw new Error('wtf Value was undefined at token insurProperFormatting')}
    }
    getId() { return this.id.id; }
    ;
    getLatexSymbol() { return typeof this.value === 'string' ? searchMathJaxOperators(this.value)?.latex : undefined; }
    getFullTokenID() {
        switch (this.type) {
            case 'number':
            case 'prane':
                return this.type;
            case 'operator':
                return this.type + ':' + this.value;
            case 'variable':
                return this.type + ':' + this.variable;
        }
    }
    getfullType() {
        return this.type;
    }
    setType() {
        if (typeof this.value === 'string') {
            this.type = this.value.match(/[()]/) ? 'paren' : 'operator';
            return;
        }
        this.type = this.variable ? 'variable' : 'number';
    }
    isString() { return this.type === 'paren' || this.type === 'operator'; }
    isValueToken() { return this.type === 'variable' || this.type === 'number'; }
    toStringLatex() {
        let string = '';
        if (this.isString())
            string += this.getLatexSymbol();
        if (this.type === 'variable')
            string += this.toStringVariable();
        if (this.type === 'number')
            string += this.value;
        return string;
    }
    affectedOperatorRange(direction) {
        if (this.type !== 'operator' || this.value === 'Equals')
            return false;
        if (typeof this.value === 'string' && direction === 'left' && !getOperatorsByAssociativity('both').includes(this.value))
            return false;
        return true;
    }
    toStringVariable() {
        return (this.value && this?.value !== 1 ? this.value : '') + (this.variable || '');
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLElBQUksRUFBaUMsZ0JBQWdCLEVBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQUc1SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQVEsTUFBTSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFHcEUsT0FBTyxFQUFFLGNBQWMsRUFBUSxhQUFhLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM3RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUscUJBQXFCLEVBQUUseUJBQXlCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUdyTSxNQUFNLFlBQVksR0FBRztJQUNqQixPQUFPLEVBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU87SUFDNUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsS0FBSztJQUN4RSxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPO0NBQzFELENBQUM7QUFDRjs7O0dBR0c7QUFFSCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsR0FBVTtJQUMvQyxNQUFNLFNBQVMsR0FBRyxFQUFFLENBQUM7SUFDckIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ2QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUs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Y0FBYyxFQUFFLENBQUE7WUFDbEMsUUFBUTtZQUNSLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sS0FBSyxHQUFHO29CQUNWLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtvQkFDaEIsS0FBSyxFQUFFLENBQUM7b0JBQ1IsUUFBUSxFQUFFLFNBQVM7aUJBQ3RCLENBQUM7Z0JBQ0YsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO29CQUM1QixLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0IsQ0FBQztZQUNELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFFBQVEsQ0FBQSxDQUFBLGdDQUFnQztJQUNuRCxDQUFDO0NBQ0o7QUFFRCxNQUFNLFFBQVE7Q0FFYjtBQUVELE1BQU0sUUFBUTtDQUViIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4uL2ltVmVyeUxhenlcIjtcbmltcG9ydCB7IHR5cGUgfSBmcm9tIFwib3NcIjtcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7ICB9IGZyb20gXCJzcmMvdXRpbHMvc3RhdGljRGF0YVwiO1xuaW1wb3J0IHsgY3AgfSBmcm9tIFwiZnNcIjtcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRPcGVyYXRvcnNCeUJyYWNrZXQsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcbmltcG9ydCB7IG51bWJlciwgc3RyaW5nIH0gZnJvbSBcInpvZFwiO1xuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4gfSBmcm9tIFwic3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheFwiO1xuY29uc3QgZ3JlZWtMZXR0ZXJzID0gW1xuICAgICdBbHBoYScsJ2FscGhhJywgJ0JldGEnLCAnR2FtbWEnLCAnRGVsdGEnLCAnRXBzaWxvbicsICdaZXRhJywgJ0V0YScsICdUaGV0YScsIFxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXG4gICAgJ1NpZ21hJywgJ1RhdScsICdVcHNpbG9uJywgJ1BoaScsICdDaGknLCAnUHNpJywgJ09tZWdhJ1xuXTtcbi8qY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xuICAgICd0YW4nLCAnc2luJywgJ2NvcycsICdiaW5vbScsICdmcmFjJywgJ2FzaW4nLCAnYWNvcycsIFxuICAgICdhdGFuJywgJ2FyY2NvcycsICdhcmNzaW4nLCAnYXJjdGFuJywgJ2Nkb3QnLCdzcXJ0J1xuXSovXG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMoYXJyOiBhbnlbXSkge1xuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xuICAgIGxldCBzdGFydCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XG4gICAgICAgICAgICBpZiAoaSAtIHN0YXJ0ID4gMSkge1xuICAgICAgICAgICAgICAgIHNlcXVlbmNlcy5wdXNoKGFyci5zbGljZShzdGFydCwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhcnQgPSBpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzZXF1ZW5jZXM7XG59XG5cblxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cbn07XG5cbmV4cG9ydCBjbGFzcyBNYXRoSW5mb3tcbiAgICBkZWJ1Z0luZm86IHN0cmluZz1cIlwiO1xuICAgIHNvbHV0aW9uSW5mbzogYW55W109W107XG4gICAgbWF0aEluZm86IGFueVtdPVtdXG4gICAgZ3JhcGg6IHN0cmluZz1cIlwiO1xuICAgIGFkZEdyYXBoSW5mbyh2YWx1ZTogc3RyaW5nKXtcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtc2c6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IFRva2VuIHwgQXhpcyl7XG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUpOnZhbHVlKSsgXCJcXG4gXCI7XG4gICAgfVxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXM6IHN0cmluZyB8IG51bWJlciB8IFRva2VuIHwgQXhpcyl7XG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xuICAgIH1cbiAgICBhZGRNYXRoSW5mbyh0b2tlbnM6IFRva2Vucyl7XG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgICAgIHRoaXMubWF0aEluZm8ucHVzaChyZWNvbnN0cnVjdGVkTWF0aClcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJSZWNvbnN0cnVjdGVkIG1hdGhcIixyZWNvbnN0cnVjdGVkTWF0aCk7XG4gICAgfVxuXG4gICAgYWRkU29sdXRpb24odG9rZW5zOiBUb2tlbnMscG9zaXRpb246IFBvc2l0aW9uLHNvbHV0aW9uOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xuICAgICAgICBzb2x1dGlvbj10b2tlbnMucmVjb25zdHJ1Y3QoW3NvbHV0aW9uXSk7XG4gICAgICAgIGNvbnN0IGxlZnQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24uaW5kZXgpKTtcbiAgICAgICAgY29uc3QgcmlnaHQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24uaW5kZXgrMSxwb3NpdGlvbi5yaWdodC5icmVha0NoYXIsKSk7XG5cbiAgICAgICAgc3dpdGNoICh0cnVlKXtcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aEJ1dFJpZ2h0QnJhY2tldC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGguaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKC9cXCovZywgXCJcXFxcY2RvdFwiKX0gJHtyaWdodH0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249IGBcXFxcZnJhY3ske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5SaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoXCIvXCIsXCJmcmFjXCIpfXske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFkZFNvbHV0aW9uSW5mbyhzb2x1dGlvbik7XG4gICAgfVxufVxuXG4vKlxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XG4gICAgaWYgKCEodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSl7cmV0dXJuIHZhbHVlfVxuICAgIGlmICh2YWx1ZT09PVwiK1wiKXtyZXR1cm4gMH1cbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QodmFsdWUpKXtyZXR1cm4gMX1cbiAgICBpZigvWyhbXS8udGVzdCh2YWx1ZVswXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMSl9XG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxuICAgIGZvciAobGV0IGkgPSAwOyBpPHZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVbaV0gPT09IFwic3RyaW5nXCIgJiYgL1soKVtcXF1dLy50ZXN0KHZhbHVlW2ldKSkge1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcbiAgICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xuICAgIHJldHVybiBpc05hTihudW0pID8gdmFsdWUubGVuZ3RoPjA/dmFsdWU6MCA6IG51bTtcbn0qL1xuXG5mdW5jdGlvbiBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcjogc3RyaW5nLGxlZnQ6IGFueSxyaWdodDogYW55KXtcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIGxlZnQ/LnZhbHVlIT09XCJudW1iZXJcIiYmZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJykuaW5jbHVkZXMob3BlcmF0b3IpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodD8udmFsdWUhPT1cIm51bWJlclwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJpZ2h0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XG4gICAgfVxufVxuXG5cblxuZnVuY3Rpb24gcGFyc2UocG9zaXRpb246IHsgb3BlcmF0b3I6IGFueTsgc3BlY2lhbENoYXI/OiBhbnk7IGxlZnQ/OiBhbnk7IHJpZ2h0PzogYW55OyB9KSB7XG4gICAgbGV0IHsgb3BlcmF0b3Isc3BlY2lhbENoYXIsIGxlZnQscmlnaHR9ID0gcG9zaXRpb247XG4gICAgXG4gICAgbGVmdD1sZWZ0Py50b2tlbnNcbiAgICByaWdodD1yaWdodC50b2tlbnNcbiAgICAvL2NvbnNvbGUubG9nKCd0aGlzLmxlZnQsdGhpcy5yaWdodCcsbGVmdCxyaWdodClcbiAgICBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcixsZWZ0LHJpZ2h0KTtcbiAgICBcbiAgICBsZXQgc29sdmVkPW5ldyBUb2tlbigwLHVuZGVmaW5lZCk7XG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlIFwiU3F1YXJlIFJvb3RcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KHJpZ2h0LnZhbHVlLHNwZWNpYWxDaGFyIT09bnVsbD8oMSkvKHNwZWNpYWxDaGFyKTowLjUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJQb3dcIjpcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlfHxyaWdodC52YXJpYWJsZSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZXx8bGVmdC52YXJpYWJsZT09PXJpZ2h0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU/cmlnaHQudmFyaWFibGU6XCJcIjtcbiAgICAgICAgICAgICAgICAvL3NvbHZlZC5wb3c9MlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cobGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIkZyYWN0aW9uXCI6XG4gICAgICAgIGNhc2UgXCIvXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiTXVsdGlwbGljYXRpb25cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKiByaWdodC52YWx1ZTtcbiAgICAgICAgICAgIGhhbmRsZVZyaWFibGVzKGxlZnQsIHJpZ2h0LHNvbHZlZCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIitcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKyByaWdodC52YWx1ZTtcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIk1pbnVzXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlIC0gcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlRmFjdG9yaWFsKGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzaW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiY29zXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSlcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidGFuXCI6XG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoXCJ0YW4gTXVzdCBiZSBzbWFsbGVyIHRoYW4gOTBcIik7fVxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImFzaW5cIjpcbiAgICAgICAgY2FzZSBcImFyY3NpblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFzaW4ocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYWNvc1wiOlxuICAgICAgICBjYXNlIFwiYXJjY29zXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYWNvcyhyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhdGFuXCI6XG4gICAgICAgIGNhc2UgXCJhcmN0YW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGlkZW50aWZ5IG9wZXJhdG9yIHR5cGUgYXQgcHJhaXNlIG9wZXJhdG9yOiBcIitwb3NpdGlvbi5vcGVyYXRvcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0OiB7IHZhcmlhYmxlOiBhbnk7IHBvdzogYW55OyB2YWx1ZTogbnVtYmVyOyB9LCByaWdodDogeyB2YXJpYWJsZTogYW55OyBwb3c6IGFueTsgdmFsdWU6IG51bWJlcjsgfSwgc29sdmVkOiBUb2tlbikge1xuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSAmJiBsZWZ0LnZhcmlhYmxlICE9PSByaWdodC52YXJpYWJsZSkge1xuICAgICAgICAgICAgLyogS2VlcCB0aGVtIHNlcGFyYXRlIHNpbmNlIHRoZXkgaGF2ZSBkaWZmZXJlbnQgdmFyaWFibGVzXG4gICAgICAgICAgICBzb2x2ZWQudGVybXMgPSBbXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogbGVmdC52YXJpYWJsZSwgcG93OiBsZWZ0LnBvdyB8fCAxLCB2YWx1ZTogbGVmdC52YWx1ZSB8fCAxIH0sXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogcmlnaHQudmFyaWFibGUsIHBvdzogcmlnaHQucG93IHx8IDEsIHZhbHVlOiByaWdodC52YWx1ZSB8fCAxIH1cbiAgICAgICAgICAgIF07Ki9cbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpZmZlcmVudCB2YXJpYWJsZSBiYXNlcyBhdCBwb3dlciBtdWx0aXBsaWNhdGlvbi4gSSBkaWRuJ3QgZ2V0IHRoZXJlIHlldFwiKVxuICAgICAgICB9XG4gICAgXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlID0gbGVmdC52YXJpYWJsZSB8fCByaWdodC52YXJpYWJsZTtcbiAgICAgICAgc29sdmVkLnZhcmlhYmxlID0gdmFyaWFibGUubGVuZ3RoPjA/dmFyaWFibGU6dW5kZWZpbmVkO1xuICAgICAgICBcbiAgICAgICAgbGV0IHBvdyA9IChsZWZ0LnBvdyB8fCAwKSArIChyaWdodC5wb3cgfHwgMCk7XG4gICAgICAgIHBvdz1sZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlJiZwb3c9PT0wJiYhbGVmdC5wb3cmJiFyaWdodC5wb3c/Mjpwb3c7XG4gICAgICAgIC8vc29sdmVkLnBvdyA9IHBvdyB8fCB1bmRlZmluZWQ7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIFJ1bGUgMzogSGFuZGxlIG11bHRpcGxpY2F0aW9uIG9mIGNvbnN0YW50c1xuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XG4gICAgICAgIGNvbnN0IHJpZ2h0VmFsdWUgPSByaWdodC52YWx1ZSB8fCAxO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGxlZnRWYWx1ZSAqIHJpZ2h0VmFsdWU7XG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQ6IGFueSxyaWdodDogYW55LHNvbHZlZDogVG9rZW4pe1xuICAgICAgICBsZXQgaGFuZGxlZD17VmFyOm51bGwsUG93Om51bGx9O1xuICAgICAgICBpZiAoIWxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7XG4gICAgICAgICAgICByZXR1cm4gO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwb3NpdGlvbi5vcGVyYXRvcj09PScqJyl7cmV0dXJuIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdCxyaWdodCxzb2x2ZWQpfVxuICAgICAgICAvL2NvbnNvbGUubG9nKGxlZnQudmFyaWFibGUscmlnaHQudmFyaWFibGUpXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVHdvIHZhcmlhYmxlIGVxdWF0aW9ucyBhcmVuJ3QgYWNjZXB0ZWQgeWV0XCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XG4gICAgICAgIC8vc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyXG5cbiAgICAgICAgLypcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV9XG4gICAgICAgIGVsc2UgaWYgKCFsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlfVxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cbiAgICAgICAgKi9cbiAgICB9XG5cblxuICAgIHJldHVybiBzb2x2ZWQ7XG59XG5cbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnM6IFRva2Vucykge1xuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luOiBudW1iZXIsIGVuZDogbnVtYmVyLCB0b2tlbnM6IGFueSwgZmluZFBhcmVuSW5kZXg/OiBhbnksIHJlZ2V4PzogYW55KSB7XG4gICAgICAgIHdoaWxlIChiZWdpbiA8IGVuZCAmJiBiZWdpbiA8IHRva2Vucy50b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgaW5kZXg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChyZWdleCkge1xuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueTsgfSkgPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9KSA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vucy50b2tlbnNbaW5kZXggKyAxXS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBiZWdpbiA9IGluZGV4ICsgMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgbGV0IGJlZ2luID0gMCwgZW5kID0gdG9rZW5zLnRva2Vucy5sZW5ndGgsaj0wO1xuICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXG4gICAgbGV0IGNoZWNrZWRJRHM6IGFueVtdID0gW107ICBcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCYmajwyMDApIHtcbiAgICAgICAgLy8gRmluZCB0aGUgaW5uZXJtb3N0IHBhcmVudGhlc2VzXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLnRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaisrO1xuICAgICAgICAgICAgaWYgKHRva2Vucy50b2tlbnNbaV0udmFsdWUgPT09IFwiKFwiICYmICFjaGVja2VkSURzLmluY2x1ZGVzKHRva2Vucy50b2tlbnNbaV0uaWQpKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudElEID0gZmluZFBhcmVuSW5kZXgodG9rZW5zLnRva2Vuc1tpXS5pZCk7ICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjdXJyZW50SUQhPT1udWxsJiZpPT09Y3VycmVudElELmNsb3NlKSB7XG4gICAgICAgICAgICAgICAgW2JlZ2luLGVuZF09W2N1cnJlbnRJRC5vcGVuLGN1cnJlbnRJRC5jbG9zZV1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcbiAgICAgICAgICAgIGJlZ2luID0gMDtcbiAgICAgICAgICAgIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgb3BlcmF0b3JGb3VuZCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLGVuZCx0b2tlbnMpIT09LTE7XG5cbiAgICAgICAgLy8gSWYgbm8gb3BlcmF0b3IgaXMgZm91bmQsIG1hcmsgdGhpcyBwYXJlbnRoZXNlcyBwYWlyIGFzIGNoZWNrZWRcbiAgICAgICAgaWYgKCFvcGVyYXRvckZvdW5kKSB7XG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxuICAgICAgICAgICAgY3VycmVudElEID0gbnVsbDsgIFxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChqPj0yMDApe3Rocm93IG5ldyBFcnJvcihcIm9wZXJhdGlvbnNPcmRlciBGYWlsZWQgZXhjZWVkZWQgMjAwIHJldmlzaW9uc1wiKTt9XG5cbiAgICBmb3IgKGxldCBpPTE7aTw9NjtpKyspe1xuICAgICAgICBsZXQgcHJpb3JpdHkgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KGksdHJ1ZSkpO1xuICAgICAgICBpZihwcmlvcml0eSE9PS0xKXJldHVybiBwcmlvcml0eVxuICAgIH1cblxuICAgIGxldCBwcmlvcml0eTEgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KDEsdHJ1ZSkpO1xuICAgIGxldCBwcmlvcml0eTIgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KDIsdHJ1ZSkpO1xuICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KDMsdHJ1ZSkpO1xuICAgIGxldCBwcmlvcml0eTQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KDQsdHJ1ZSkpO1xuICAgIGxldCBwcmlvcml0eTUgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KDUsdHJ1ZSkpO1xuICAgIGxldCBwcmlvcml0eTYgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KDYsdHJ1ZSkpO1xuXG4gICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NSxwcmlvcml0eTZdLmZpbmQoaW5kZXggPT4gaW5kZXggIT09IC0xKT8/bnVsbDtcbn1cblxuXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xuICAgIG9wZXJhdG9yOiBzdHJpbmc7XG4gICAgaW5kZXg6IG51bWJlcjtcbiAgICB0cmFuc2l0aW9uOiBudW1iZXI7XG4gICAgc3BlY2lhbENoYXI6IHN0cmluZztcbiAgICBsZWZ0OiBhbnk7XG4gICAgcmlnaHQ6IGFueTtcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM6IFRva2VucywgaW5kZXg/OiBudW1iZXIpe1xuICAgICAgICBpZihpbmRleClcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmluZGV4O1xuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcbiAgICB9XG4gICAgcG9zaXRpb24odG9rZW5zOiBUb2tlbnMpIHtcbiAgICAgICAgdGhpcy5pbmRleCA9ICF0aGlzLmluZGV4PyBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSA6IHRoaXMuaW5kZXg7XG4gICAgICAgIGlmICghdGhpcy5pbmRleHx8dGhpcy5pbmRleCA9PT0gbnVsbCB8fCB0aGlzLmluZGV4ID49IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnZhbHVlO1xuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdyaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHticmVha0NoYXI6IHRoaXMuaW5kZXh9O1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnZG91YmxlUmlnaHQnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5sZWZ0LmJyZWFrQ2hhcjtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLTEsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0LmJyZWFrQ2hhcisodGhpcy5yaWdodC5tdWx0aVN0ZXA/MTowKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IHdhcyBub3QgYWNjb3VudGVkIGZvciwgb3IgaXMgbm90IHRoZSB2YWxpZCBvcGVyYXRvcmApO1xuICAgICAgICB9XG4gICAgICAgIC8vY29uc29sZS5sb2codG9rZW5zLnRva2VucylcbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA6IG51bGw7XG4gICAgfVxuICAgIGFwcGx5UG9zaXRpb24odG9rZW5zOiBUb2tlbnMsIGluZGV4OiAgbnVtYmVyLCBkaXJlY3Rpb246IHN0cmluZykge1xuICAgICAgICBsZXQgYnJlYWtDaGFyPWluZGV4XG4gICAgICAgIGxldCB0YXJnZXQ7XG4gICAgICAgIGxldCBtdWx0aVN0ZXA9ZmFsc2U7XG4gICAgICAgIGNvbnN0IGlzTGVmdCA9IGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCI7XG4gICAgICAgIGNvbnN0IGluZGV4TW9kaWZpZXIgPSAgaXNMZWZ0Py0gMSA6ICAxO1xuICAgICAgICBpZiAoKGlzTGVmdCAmJiBpbmRleCA8PSAwKSB8fCAoIWlzTGVmdCAmJiBpbmRleCA+PSB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHx8ICF0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIiBpbmRleDogXCIraW5kZXgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIikge1xuICAgICAgICAgICAgY29uc3QgcGFyZW5JbmRleCA9IGZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xuICAgICAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2UrMTtcbiAgICAgICAgICAgIHRhcmdldCA9IHRva2Vucy50b2tlbnMuc2xpY2UocGFyZW5JbmRleC5vcGVuLCBwYXJlbkluZGV4LmNsb3NlKzEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYnJlYWtDaGFyPWluZGV4K2luZGV4TW9kaWZpZXI7XG4gICAgICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zW2JyZWFrQ2hhcl07XG4gICAgICAgICAgICBicmVha0NoYXIrPWlzTGVmdD8wOjFcbiAgICAgICAgfVxuICAgICAgICAvL2NvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+IDM7XG4gICAgXG4gICAgICAgIGlmICghbXVsdGlTdGVwJiZ0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIil7XG4gICAgICAgICAgICAvL3RhcmdldD10YXJnZXQuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7ZGlyZWN0aW9ufSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWV9XCJgLCk7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgLy9icmVha0NoYXIgPSAoYnJlYWtDaGFyICE9PSBpbmRleCA/IHRhcmdldD8uaW5kZXggOiBicmVha0NoYXIpKyBpbmRleE1vZGlmaWVyKyhpc0xlZnQ/MDoxKTtcbiAgICAgICAgLy9kZWxldGUgdGFyZ2V0LmluZGV4XG4gICAgICAgIFxuICAgICAgICBpZiAodGFyZ2V0Lmxlbmd0aD09PTMpe1xuICAgICAgICAgICAgdGFyZ2V0PXRhcmdldC5maW5kKChpdGVtOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcbiAgICAgICAgfWVsc2UgaWYodGFyZ2V0Lmxlbmd0aD4xKW11bHRpU3RlcD10cnVlXG4gICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0b2tlbnM6IHRhcmdldCxcbiAgICAgICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxuICAgICAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXIsXG4gICAgICAgIH07XG4gICAgfVxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XG4gICAgICAgIHJldHVybiAoKGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpJiZ0aGlzLmxlZnQ/Lm11bHRpU3RlcCl8fHRoaXMucmlnaHQ/Lm11bHRpU3RlcCkmJnRoaXMub3BlcmF0b3I9PT0nTXVsdGlwbGljYXRpb24nO1xuICAgIH1cbiAgICBpc0xlZnRWYXIoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXA/dGhpcy5sZWZ0LnRva2Vucy5zb21lKCh0OiB7IHR5cGU6IHN0cmluZzsgfSk9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5sZWZ0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcbiAgICB9XG4gICAgaXNSaWdodFZhcigpe1xuICAgICAgICByZXR1cm4gdGhpcy5yaWdodC5tdWx0aVN0ZXA/dGhpcy5yaWdodC50b2tlbnMuc29tZSgodDogeyB0eXBlOiBzdHJpbmc7IH0pPT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMucmlnaHQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxuICAgIH1cbiAgICBjaGVja0ZyYWMoKXsvLyF0aGlzLmNoZWNrTXVsdGlTdGVwKCkgSSBkb24ndCBrbm93IHdoeSBJIGhhZCB0aGlzIGhlcmVcbiAgICAgICAgcmV0dXJuIC8oZnJhY3xcXC8pLy50ZXN0KHRoaXMub3BlcmF0b3IpJiYodGhpcy5pc0xlZnRWYXIoKXx8dGhpcy5pc1JpZ2h0VmFyKCkpXG4gICAgfVxufVxuXG5cblxuZnVuY3Rpb24gcmVhcnJhbmdlRXF1YXRpb24odG9rZW5zOiBhbnksdG9rZW5Ub2lzb2xhdGU6IGFueSl7XG4gICAgXG59XG5cbmZ1bmN0aW9uIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0b2tlbnM6IGFueSxpc29sYXRUb2tlbjogVG9rZW4pe1xuICAgIGNvbnN0IGluZGV4PW9wZXJhdGlvbnNPcmRlcih0b2tlbnMpXG4gICAgY29uc3QgSXNvbGF0ZWQ9dG9rZW5zLnRva2Vucy5maW5kKCh0b2tlbjogYW55LCBpZHg6IG51bWJlcik9PmlkeDxpbmRleClcbiAgICBjb25zdCBmcmFjPWNyZWF0ZUZyYWModG9rZW5zLmxpc3Quc2xpY2UoaW5kZXggKyAxKSxuZXcgVG9rZW4oSXNvbGF0ZWQudmFsdWUpKVxuICAgIElzb2xhdGVkLnZhbHVlPTE7XG4gICAgdG9rZW5zLmluc2VydFRva2VucyhpbmRleCsxLHRva2Vucy50b2tlbnMubGVuZ3RoLWluZGV4KzEsZnJhYylcbn1cblxuZnVuY3Rpb24gY3JlYXRlRnJhYyhub21pbmF0b3I6IGFueSxkZW5vbWluYXRvcjogVG9rZW4pe1xuICAgLy8gcmV0dXJuIFtuZXcgVG9rZW4oJ2ZyYWMnKSxuZXcgVG9rZW4oJygnKSxub21pbmF0b3IsbmV3IFRva2VuKCcpJyksbmV3IFRva2VuKCcoJyksZGVub21pbmF0b3IsbmV3IFRva2VuKCcpJyldXG59XG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zOiBhbnlbXSl7XG4gICAgaWYgKHRva2Vucy5sZW5ndGg8PTEpe3JldHVybiB0b2tlbnN9XG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUoKHRva2VuOiBhbnkpID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxuICAgIHtcbiAgICAgICAgaSsrO1xuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xuICAgICAgICBsZXQgT3BlcmF0aW9uSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0pID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpO1xuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XG5cbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XG5cbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuOiBhbnksIGk6IGFueSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IHRva2VuOiB7IHR5cGU6IGFueTsgfTsgfSkgPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxuICAgICAgICAucmVkdWNlKChzdW06IG51bWJlciwgaXRlbTogeyBvcmlnaW5hbEluZGV4OiBudW1iZXI7IHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IG51bWJlcjsgfTsgfSkgPT4ge1xuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gXCItXCIpID8gLTEgOiAxO1xuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxuICAgICAgICByZXR1cm4gc3VtICsgKGl0ZW0udG9rZW4udmFsdWUgKiBtdWx0aXBsaWVyKTtcbiAgICAgICAgfSwgMCk7IFxuICAgICAgICBcbiAgICAgICAgbmV3VG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXG4gICAgICAgICAgICB0b2tlbi50eXBlICE9PSB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgfHwgXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld1Rva2Vucztcbn1cblxuZnVuY3Rpb24gcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRva2VuczogVG9rZW5zLCBpc29sYXRpb25Hb2FsOiB7IHR5cGU6IGFueTsgdmFsdWU6IGFueTsgb3ZlcnZpZXdTaWRlT25lPzogTWFwPGFueSwgYW55Pjsgb3ZlcnZpZXdTaWRlVHdvPzogTWFwPGFueSwgYW55PjsgfSkge1xuICAgIGlmICh0b2tlbnMudG9rZW5zLmxlbmd0aCA8PSAxKSByZXR1cm4gdG9rZW5zO1xuXG4gICAgY29uc3QgZXFJbmRleCA9IHRva2Vucy50b2tlbnMuZmluZEluZGV4KCh0OiB7IHZhbHVlOiBzdHJpbmc7IH0pID0+IHQudmFsdWUgPT09ICdFcXVhbHMnKTtcbiAgICBpZiAoZXFJbmRleCA9PT0gLTEpIHRocm93IG5ldyBFcnJvcihcIk5vICdFcXVhbHMnIG9wZXJhdG9yIGZvdW5kIGluIHRva2Vuc1wiKTtcblxuICAgIGNvbnN0IHN3aXRjaERpcmVjdGlvbiA9IGZhbHNlOyAvLyBGdXR1cmUgbG9naWMgdG8gZGV0ZXJtaW5lIGRpcmVjdGlvblxuICAgIGNvbnN0IGlzb2xhdGlvbkdvYWxJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xuICAgICAgICAubWFwKCh0OiB7IHR5cGU6IGFueTsgdmFyaWFibGU6IGFueTsgfSwgaWR4OiBhbnkpID0+ICh0LnR5cGUgPT09IGlzb2xhdGlvbkdvYWwudHlwZSAmJiB0LnZhcmlhYmxlID09PSBpc29sYXRpb25Hb2FsLnZhbHVlID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XG5cbiAgICBjb25zdCBvdGhlckluZGljZXMgPSB0b2tlbnMudG9rZW5zXG4gICAgICAgIC5tYXAoKF86IGFueSwgaWR4OiBhbnkpID0+ICghaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaWR4KSAmJiBpZHggIT09IGVxSW5kZXggPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcigoaWR4OiBudWxsfG51bWJlcikgPT4gaWR4ICE9PSBudWxsKTtcblxuICAgIC8vIEFkanVzdCBzaWduc1xuICAgIHRva2Vucy50b2tlbnMuZm9yRWFjaCgodG9rZW46IHsgdmFsdWU6IG51bWJlcjsgfSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpID4gZXFJbmRleCA6IGkgPCBlcUluZGV4KSAmJiBvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHtcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xuICAgICAgICB9IGVsc2UgaWYgKChzd2l0Y2hEaXJlY3Rpb24/IGkgPCBlcUluZGV4IDogaSA+IGVxSW5kZXgpICYmIGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gU2VwYXJhdGUgc2lkZXNcbiAgICBjb25zdCBzaWRlMTogYW55W10gPSBbXTtcbiAgICBjb25zdCBzaWRlMjogYW55W10gPSBbXTtcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnksIGk6IGFueSkgPT4ge1xuICAgICAgICBpZiAoaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHNpZGUxLnB1c2godG9rZW4pO1xuICAgICAgICBpZiAob3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMi5wdXNoKHRva2VuKTtcbiAgICB9KTtcblxuICAgIHRva2Vucy50b2tlbnMgPSBzd2l0Y2hEaXJlY3Rpb25cbiAgICAgICAgPyBbLi4uc2lkZTIsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUxXVxuICAgICAgICA6IFsuLi5zaWRlMSwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTJdO1xufVxuXG5cblxuY2xhc3MgbWF0aEpheE9wZXJhdG9ye1xuICAgIG9wZXJhdG9yOiBzdHJpbmc7XG4gICAgcHJpb3JpdHk6IG51bWJlcjtcbiAgICBhc3NvY2lhdGl2aXR5TnVtYmVyOiBudW1iZXI7XG4gICAgZ3JvdXAxOiBtYXRoR3JvdXA7XG4gICAgZ3JvdXAyPzogbWF0aEdyb3VwO1xuICAgIHNvbHV0aW9uPzogbWF0aEdyb3VwXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcscHJpb3JpdHk/OiBudW1iZXIsYXNzb2NpYXRpdml0eU51bWJlcj86IG51bWJlcixncm91cDE/OiBtYXRoR3JvdXAsZ3JvdXAyPzogbWF0aEdyb3VwKXtcbiAgICAgICAgaWYgKG9wZXJhdG9yKXRoaXMub3BlcmF0b3I9b3BlcmF0b3JcbiAgICAgICAgaWYgKHByaW9yaXR5KXRoaXMucHJpb3JpdHk9cHJpb3JpdHlcbiAgICAgICAgaWYgKGFzc29jaWF0aXZpdHlOdW1iZXIpdGhpcy5hc3NvY2lhdGl2aXR5TnVtYmVyPWFzc29jaWF0aXZpdHlOdW1iZXJcbiAgICAgICAgaWYgKGdyb3VwMSl0aGlzLmdyb3VwMT1ncm91cDFcbiAgICAgICAgaWYgKGdyb3VwMil0aGlzLmdyb3VwMj1ncm91cDJcbiAgICB9XG4gICAgc2V0R3JvdXAxKGdyb3VwOiBtYXRoR3JvdXApe3RoaXMuZ3JvdXAxPWdyb3VwfVxuICAgIHNldEdyb3VwMihncm91cDogbWF0aEdyb3VwKXt0aGlzLmdyb3VwMj1ncm91cH1cbn1cblxuY2xhc3MgbWF0aEdyb3Vwe1xuICAgIG51bWJlck9ubHk6IGJvb2xlYW47XG4gICAgaGFzVmFyaWFibGVzOiBib29sZWFuO1xuICAgIHNpbmd1bGFyOiBib29sZWFuO1xuICAgIGhhc09wZXJhdG9yczogYm9vbGVhbjtcbiAgICBtdWx0aUxldmVsOiBib29sZWFuO1xuICAgIGlzT3BlcmFibGU6IGJvb2xlYW49dHJ1ZTtcbiAgICBwcml2YXRlIGl0ZW1zOiBUb2tlbltdO1xuICAgIGNvbnN0cnVjdG9yKCl7XG5cbiAgICB9XG4gICAgc2V0SXRlbXMoaXRlbXM6IFRva2VuW10pe1xuICAgICAgICB0aGlzLml0ZW1zPWl0ZW1zXG4gICAgfVxuICAgIHNldE1ldGFEYXRhKCl7XG4gICAgICAgIHRoaXMuc2luZ3VsYXI9dGhpcy5pdGVtcy5sZW5ndGg9PT0xO1xuICAgICAgICB0aGlzLm51bWJlck9ubHk9dGhpcy5pdGVtcy5zb21lKHQ9PiAhdC5pc1ZhcigpKTtcblxuICAgIH1cbn1cbmZ1bmN0aW9uIHBhcnNlT3BlcmF0b3Iob3BlcmF0b3I6IG1hdGhKYXhPcGVyYXRvcil7XG4gICAgc3dpdGNoIChvcGVyYXRvci5vcGVyYXRvcikge1xuICAgICAgICBjYXNlIFwic2luXCI6XG4gICAgICAgICAgICAvL2NvbnN0IGE9bmV3IFRva2VuKE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMob3BlcmF0b3IuZ3JvdXAxLml0ZW1zWzBdLnZhbHVlKSkpXG4gICAgICAgICAgICAvL3NvbHZlZC52YWx1ZSA9IDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgaWRlbnRpZnkgb3BlcmF0b3IgdHlwZSBhdCBwcmFpc2Ugb3BlcmF0b3I6IFwiK29wZXJhdG9yLm9wZXJhdG9yKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQ6IHsgdmFyaWFibGU6IGFueTsgcG93OiBhbnk7IHZhbHVlOiBudW1iZXI7IH0sIHJpZ2h0OiB7IHZhcmlhYmxlOiBhbnk7IHBvdzogYW55OyB2YWx1ZTogbnVtYmVyOyB9LCBzb2x2ZWQ6IFRva2VuKSB7XG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlICYmIGxlZnQudmFyaWFibGUgIT09IHJpZ2h0LnZhcmlhYmxlKSB7XG4gICAgICAgICAgICAvKiBLZWVwIHRoZW0gc2VwYXJhdGUgc2luY2UgdGhleSBoYXZlIGRpZmZlcmVudCB2YXJpYWJsZXNcbiAgICAgICAgICAgIHNvbHZlZC50ZXJtcyA9IFtcbiAgICAgICAgICAgICAgICB7IHZhcmlhYmxlOiBsZWZ0LnZhcmlhYmxlLCBwb3c6IGxlZnQucG93IHx8IDEsIHZhbHVlOiBsZWZ0LnZhbHVlIHx8IDEgfSxcbiAgICAgICAgICAgICAgICB7IHZhcmlhYmxlOiByaWdodC52YXJpYWJsZSwgcG93OiByaWdodC5wb3cgfHwgMSwgdmFsdWU6IHJpZ2h0LnZhbHVlIHx8IDEgfVxuICAgICAgICAgICAgXTsqL1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlmZmVyZW50IHZhcmlhYmxlIGJhc2VzIGF0IHBvd2VyIG11bHRpcGxpY2F0aW9uLiBJIGRpZG4ndCBnZXQgdGhlcmUgeWV0XCIpXG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICBzb2x2ZWQudmFyaWFibGUgPSB2YXJpYWJsZS5sZW5ndGg+MD92YXJpYWJsZTp1bmRlZmluZWQ7XG4gICAgICAgIFxuICAgICAgICBsZXQgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcbiAgICAgICAgcG93PWxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUmJnBvdz09PTAmJiFsZWZ0LnBvdyYmIXJpZ2h0LnBvdz8yOnBvdztcbiAgICAgICAgLy9zb2x2ZWQucG93ID0gcG93IHx8IHVuZGVmaW5lZDtcbiAgICAgICAgXG5cbiAgICAgICAgLy8gUnVsZSAzOiBIYW5kbGUgbXVsdGlwbGljYXRpb24gb2YgY29uc3RhbnRzXG4gICAgICAgIGNvbnN0IGxlZnRWYWx1ZSA9IGxlZnQudmFsdWUgfHwgMTtcbiAgICAgICAgY29uc3QgcmlnaHRWYWx1ZSA9IHJpZ2h0LnZhbHVlIHx8IDE7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gbGVmdFZhbHVlICogcmlnaHRWYWx1ZTtcbiAgICAgICAgLy8gSWYgdGhlcmUncyBubyB2YXJpYWJsZSwgYXNzaWduIHRoZSByZXN1bHQgYXMgYSBjb25zdGFudFxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgZnVuY3Rpb24gaGFuZGxlVnJpYWJsZXMobGVmdDogYW55LHJpZ2h0OiBhbnksc29sdmVkOiBUb2tlbil7XG4gICAgICAgIGxldCBoYW5kbGVkPXtWYXI6bnVsbCxQb3c6bnVsbH07XG4gICAgICAgIGlmICghbGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtcbiAgICAgICAgICAgIHJldHVybiA7XG4gICAgICAgIH1cbiAgICAgICAgLy9pZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cbiAgICAgICAgLy9jb25zb2xlLmxvZyhsZWZ0LnZhcmlhYmxlLHJpZ2h0LnZhcmlhYmxlKVxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSE9PXJpZ2h0LnZhcmlhYmxlKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlR3byB2YXJpYWJsZSBlcXVhdGlvbnMgYXJlbid0IGFjY2VwdGVkIHlldFwiKTtcbiAgICAgICAgfVxuICAgICAgICAvL2hhbmRsZWQuVmFyPWxlZnQudmFyO1xuICAgICAgICAvL3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhclxuXG4gICAgICAgIC8qXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfVxuICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cbiAgICAgICAgZWxzZSBpZiAobGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZTtzb2x2ZWQucG93PTJ9XG4gICAgICAgICovXG4gICAgfVxuXG5cbiAgICAvL3JldHVybiBzb2x2ZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcbiAgICBpbnB1dD1cIlwiO1xuICAgIHRva2VuczogVG9rZW5zO1xuICAgIHNvbHV0aW9uPVwiXCI7XG4gICAgbWF0aEluZm89bmV3IE1hdGhJbmZvKCk7XG4gICAgaT0wO1xuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xuICAgICAgICB0aGlzLnByb2Nlc3NJbnB1dCgpO1xuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCd0aGlzLnRva2VucycsdGhpcy50b2tlbnMpO1xuXG4gICAgICAgIGNvbnN0IGI9bmV3IG1hdGhHcm91cCgpXG4gICAgICAgIGIuc2V0SXRlbXModGhpcy50b2tlbnMudG9rZW5zWzFdKVxuICAgICAgICBjb25zdCBhPW5ldyBtYXRoSmF4T3BlcmF0b3IoKVxuICAgICAgICBhLnNldEdyb3VwMShiKVxuICAgICAgICBwYXJzZU9wZXJhdG9yKGEpXG4gICAgICAgIGNvbnNvbGUubG9nKGEpXG4gICAgICAgIFxuXG5cbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJUb2tlbnMgYWZ0ZXIgdG9rZW5pemVcIix0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xuICAgIH1cbiAgICBnZXRSZWR5Zm9yTmV3Um9uZCgpe1xuICAgICAgICB0aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkTWF0aEluZm8odGhpcy50b2tlbnMpXG4gICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8odGhpcy50b2tlbnMudG9rZW5zLHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGgpXG4gICAgICAgIHRoaXMudG9rZW5zLmV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCk7XG4gICAgfVxuICAgIGNvbnRyb2xsZXIoKTogYW55e1xuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIC8qXG4gICAgICAgIHRoaXMuaSsrO1xuICAgICAgICBpZih0aGlzLmk+MTApe3JldHVybiB0aGlzLmZpbmFsUmV0dXJuKCl9XG5cbiAgICAgICAgdGhpcy5nZXRSZWR5Zm9yTmV3Um9uZCgpO1xuICAgICAgICAvL2NvbnN0IG92ZXJ2aWV3PXRoaXMudG9rZW5zLmdldE92ZXJ2aWV3KClcbiAgICAgICAgY29uc3QgcHJhaXNpbmdNZXRob2Q9bmV3IFByYWlzaW5nTWV0aG9kKHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgaWYgKHByYWlzaW5nTWV0aG9kLmlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpKXtcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMudG9rZW5zKTtcbiAgICAgICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUGFyc2VkIGV4cHJlc3Npb25cIiwgSlNPTi5zdHJpbmdpZnkocG9zaXRpb24sIG51bGwsIDEpKTtcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbiA9PT0gbnVsbCYmdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xKXtcbiAgICAgICAgICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKFwicGFyc2UodG9rZW5zKVwiLHBhcnNlKHRoaXMudG9rZW5zLnRva2VucykpXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGhlICoqKipcIlxuICAgICAgICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocG9zaXRpb24uY2hlY2tGcmFjKCl8fHBvc2l0aW9uLmNoZWNrTXVsdGlTdGVwKCkpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbkluZm8odGhpcy50b2tlbnMucmVjb25zdHJ1Y3QodGhpcy50b2tlbnMudG9rZW5zKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudXNlUGFyc2UocG9zaXRpb24pXG4gICAgICAgIH1cbiAgICAgICAgaWYocHJhaXNpbmdNZXRob2QuaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKSl7XG4gICAgICAgICAgICB0aGlzLnVzZUlzb2xhdChwcmFpc2luZ01ldGhvZClcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b0lzb2xhdGU9cHJhaXNpbmdNZXRob2QuaXNBbnl0aGluZ1RvSXNvbGF0ZSgpXG4gICAgICAgIGlmICh0b0lzb2xhdGUpe1xuICAgICAgICAgICAgcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRoaXMudG9rZW5zLHRvSXNvbGF0ZSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxuICAgICAgICB9ICAgXG4gICAgICAgIC8vaWYgKHNvbHZlZCA9PT0gbnVsbHx8dHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XG4gICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCkvL3RoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7Ki9cbiAgICB9XG5cbiAgICB1c2VQYXJzZShwb3NpdGlvbjogUG9zaXRpb24pe1xuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZShwb3NpdGlvbik7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxuICAgICAgICBjb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxuICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIm5ld1Rva2Vuc1wiLHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgfVxuICAgIFxuICAgIHByYWlzaW5nTWV0aG9kKCl7XG4gICAgICAgIC8qXG4gICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51c2VRdWFkcmF0aWMoKVxuICAgICAgICByZXR1cm4gdGhpcy51c2VJc29sYXQoKTsqL1xuICAgIH1cblxuICAgIHVzZUlzb2xhdChwcmFpc2luZ01ldGhvZDogUHJhaXNpbmdNZXRob2Qpe1xuICAgICAgICBpc29sYXRlTXVsdGlwbGljYXRpb24odGhpcy50b2tlbnMsbmV3IFRva2VuKHByYWlzaW5nTWV0aG9kLnZhcmlhYmxlc1swXSkpXG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxuICAgICAgICAvL3RoaXMudG9rZW5zLmluc2VydFRva2VucygpXG4gICAgICAgIC8vVXNlIHBvc3Nlc3Npb25cbiAgICB9XG5cbiAgICB1c2VRdWFkcmF0aWMoKXtcbiAgICAgICAgdGhpcy50b2tlbnMudG9rZW5zPXNpbXBsaWZpeSh0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGU6IHN0cmluZyk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXG4gICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNpbXBsaWZpeSh0b2tlbnMpXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHF1YWQoXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdPy52YWx1ZSB8IDAsXG4gICAgICAgICAgICAgICAgICAgIG51bWJlckluZGV4WzBdPy52YWx1ZSAqIC0xfCAwLFxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgIH1cbiAgICBhZGREZWJ1Z0luZm8obWVzOiBzdHJpbmcsdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IFRva2VuIHwgQXhpcyl7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSlcbiAgICB9XG4gICAgcHJvY2Vzc0lucHV0KCl7XG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy5pbnB1dFxuICAgICAgICAucmVwbGFjZSgvKE1hdGgufFxcXFx8XFxzfGxlZnR8cmlnaHQpL2csIFwiXCIpIFxuICAgICAgICAucmVwbGFjZSgvey9nLCBcIihcIilcbiAgICAgICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXG4gICAgICAgIC8vLnJlcGxhY2UoLyg/PCFcXFxcfFthLXpBLVpdKSh0YW58c2lufGNvc3xiaW5vbXxmcmFjfGFzaW58YWNvc3xhdGFufGFyY2Nvc3xhcmNzaW58YXJjdGFufGNkb3QpL2csIFwiXFxcXCQxXCIpO1xuICAgIH1cbiAgICBmaW5hbFJldHVybigpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgIH1cbn1cblxuY2xhc3MgbWF0aFZhcmlhYmxlc3tcblxufVxuXG5cblxuXG5jbGFzcyBUb2tlbnN7XG4gICAgdG9rZW5zOiBhbnk9W107XG4gICAgb3BlcmF0b3JTdHJ1Y3R1cmU6IG1hdGhKYXhPcGVyYXRvcjtcbiAgICBcbiAgICBjb25zdHJ1Y3RvcihtYXRoOiBzdHJpbmcpe1xuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xuICAgIH1cbiAgICB0b2tlbml6ZShtYXRoOiBzdHJpbmcpe1xuICAgICAgICAvL2xhdGV4T3BlcmF0b3JzLnB1c2goU3RyaW5nLnJhd2BbKi9ePVxcK1xcLVxcKFxcKV1gKVxuICAgICAgICAvL2NvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGxhdGV4T3BlcmF0b3JzKVxuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcygpKVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2gocmVnRXhwKCdeJyArIG9wZXJhdG9ycykpO1xuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4obWF0Y2hbMF0pKTtcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8qaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09IFwic3FydFwiICYmIG1hdGhbaV0gPT09IFwiW1wiICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcbiAgICAgICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcbiAgICAgICAgICAgIH0qL1xuXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XG4gICAgICAgICAgICBpZiAoISFtYXRjaClcbiAgICAgICAgICAgIHsgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljTWF0aEpheFRva2VuKHBhcnNlRmxvYXQobWF0Y2hbMF0pKSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLylcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XG4gICAgICAgICAgICAgICAgLy9pZiAodmFyaSYmdmFyaS5sZW5ndGg9PT0wKXt2YXJpPW1hdGguc2xpY2UoaSxtYXRoLmxlbmd0aCl9XG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbigxLG1hdGNoWzBdKSlcbiAgICAgICAgICAgICAgICAvL3Rva2Vucy5wdXNoKHt0eXBlOiBcInZhcmlhYmxlXCIsdmFyaWFibGU6IHZhcmkucmVwbGFjZShcIihcIixcIntcIikucmVwbGFjZShcIilcIixcIn1cIiksdmFsdWU6IDF9KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVJbmRleChpbmRleDogbnVtYmVyLG1hcmdpbj86IG51bWJlcil7XG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XG4gICAgICAgIHJldHVybiBpbmRleD49MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC1tYXJnaW47XG4gICAgfVxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKXtcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgaWR4PWZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXgrMV0/LnZhbHVlPT09JygnJiYoaWR4PT09MHx8IWdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnZG91YmxlUmlnaHQnKS5pbmNsdWRlcyh0aGlzLnRva2Vuc1tpZHgtMV0/LnZhbHVlKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vTWFwIHBhcmVudGhlc2VzIGZvciBpbXBsaWNpdCBtdWx0aXBsaWNhdGlvbi5cbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBudW1iZXIpID0+IHsgXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSBcIihcIiB8fCAoaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCAtIDEpID8gaW5kZXggOiBudWxsO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8dGVzdERvdWJsZVJpZ2h0KGluZGV4KT8gaW5kZXgrMSA6IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpO1xuICAgICAgICByZXR1cm4gbWFwXG4gICAgfVxuXG4gICAgdmFsaWRhdGVQbHVzTWludXMoKXtcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdmFsdWU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnZhbHVlPT09J1BsdXMnfHx0b2tlbi52YWx1ZT09PSdNaW51cyc/aW5kZXg6bnVsbCkuZmlsdGVyKChpbmRleDogbnVsbCk9PiBpbmRleCE9PW51bGwpXG5cbiAgICAgICAgbWFwLmZvckVhY2goKGluZGV4OiBhbnkpID0+IHtcbiAgICAgICAgICAgIGluZGV4PXRoaXMudmFsaWRhdGVJbmRleChpbmRleCwxKSYmdGhpcy50b2tlbnNbaW5kZXgtMV0udHlwZT09PSdvcGVyYXRvcid8fHRoaXMudG9rZW5zW2luZGV4KzFdLnR5cGU9PT0nb3BlcmF0b3InP251bGw6aW5kZXg7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG1hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsdWU9dGhpcy50b2tlbnNbaW5kZXhdLnZhbHVlPT09J1BsdXMnPzE6LTE7XG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleCsxXS52YWx1ZSo9dmFsdWU7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XG4gICAgICAgIC8qcnVsZXMgdG8gYWJpZCBieTpcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxuICAgICAgICAqL1xuICAgICAgIFxuICAgICAgICBpZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKTtcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VuLGluZGV4OiBhbnkpPT4gKHRva2VuLmlzVmFsdWVUb2tlbigpKT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnN0IGFycj1maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwKTtcbiAgICAgICAgbGV0IHRlbXBUb2tlbnM9dGhpcy50b2tlbnMubWFwKCh0OkJhc2ljTWF0aEpheFRva2VuKT0+dHlwZW9mIHQudmFsdWU9PT0nbnVtYmVyJz9uZXcgVG9rZW4odC52YWx1ZSx0LnZhcmlhYmxlKTp0KTtcblxuICAgICAgICBcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKWBgO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKHRlbXBUb2tlbnMpXG5cblxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxuICAgICAgICBwYXJlbk1hcC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYiAtIGEpXG4gICAgICAgIC5mb3JFYWNoKCh2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UodmFsdWUsIDAsIG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4oJyonKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IG1hcFBvdz10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi52YWx1ZT09PSdQb3cnP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcbiAgICAgICAgY29uc29sZS5sb2cobWFwUG93KVxuICAgICAgICBtYXBQb3cuZm9yRWFjaCgoaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcG9zaXRpb249bmV3IFBvc2l0aW9uKHRoaXMsaW5kZXgpXG4gICAgICAgICAgICBjb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxuICAgICAgICAgICAvLyB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW46IHsgdmFsdWU6IHN0cmluZzsgfSwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09IFwiKFwiID8gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxuICAgIH1cblxuICAgIGZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XG4gICAgICAgICAgICAgICAgaWYgKG9wZW5JbmRleCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdPy50eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChjbG9zZUluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdPy5pc1ZhbHVlVG9rZW4oKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSkuZmxhdE1hcCgoaXRlbTogYW55KSA9PiBbaXRlbS5vcGVuLCBpdGVtLmNsb3NlXSk7XG4gICAgfSAgICBcbiAgICBcbiAgICAvKlxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXG4gICAgICAgICkpO1xuICAgICB9Ki9cblxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSk7XG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfOiBhbnksIGlkeDogdW5rbm93bikgPT4gIW1hcC5oYXMoaWR4KSk7XG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICBcbiAgICAgICAgY29uc3QgYXJyID0gW1xuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcbiAgICAgICAgXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXG4gICAgfVxuXG5cbiAgICBjb25uZWN0QW5kQ29tYmluZShhcnI6IGFueVtdKXtcbiAgICAgICAgY29uc3QgaW5kZXhlczphbnk9W11cblxuICAgICAgICBhcnIuc29ydCgoYSwgYikgPT4gYlswXSAtIGFbMF0pLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgaW5kZXhlcy5wdXNoKHtzdGFydDogZWxbMF0sZW5kOiBlbFtlbC5sZW5ndGggLSAxXX0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGluZGV4ZXMuZm9yRWFjaCgoaW5kZXg6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXI7IH0pID0+IHtcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IE51bWJlcih0aGlzLnRva2Vuc1tpbmRleC5zdGFydF0udmFsdWUpO1xuICAgICAgICAgICAgY29uc3QgaXNWYXI9dGhpcy50b2tlbnMuc2xpY2UoaW5kZXguc3RhcnQsaW5kZXguZW5kKzEpLmZpbmQoKHRva2VuOiBhbnkpPT4gdG9rZW4udHlwZS5pbmNsdWRlcygndmFyJykpO1xuICAgICAgICAgICAgZm9yIChsZXQgaT1pbmRleC5zdGFydCsxO2k8PWluZGV4LmVuZDtpKyspe1xuICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLnRva2Vuc1tpXS52YWx1ZSArIHZhbHVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2lmIChpc1Zhcil1cGRhdGVkVG9rZW4udmFyaWFibGU9aXNWYXIudmFyaWFibGVcbiAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4LnN0YXJ0XSA9IG5ldyBUb2tlbih2YWx1ZSxpc1Zhcj8udmFyaWFibGUpO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LnN0YXJ0KzEsIGluZGV4LmVuZCAtIGluZGV4LnN0YXJ0KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW4udHlwZSkpIFxuICAgICAgICAgICAgJiYgIXRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKVxuICAgICAgICApXG4gICAgICAgIHtyZXR1cm4gSW5maW5pdHl9XG4gICAgfVxuXG4gICAgaW5zZXJ0VG9rZW5zKHN0YXJ0OiBhbnksIGxlbmd0aDogbnVtYmVyLCBvYmplY3RzOiBhbnlbXSB8IFRva2VuKSB7XG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzKSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XG4gICAgfVxuXG4gICAgcmVjb25zdHJ1Y3QodG9rZW5zPzogYW55KXtcbiAgICAgICAgaWYgKCF0b2tlbnMpe3Rva2Vucz10aGlzLnRva2Vuczt9XG4gICAgICAgIGNvbnN0IGFkZFBsdXNJbmRleGVzPXRoaXMuaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnMpO1xuICAgICAgICBjb25zdCBjdXJseUJyYWNrZXRJbmRleGVzID0gdGhpcy5jdXJseUJyYWNrZXRJRHModG9rZW5zKS5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pO1xuICAgICAgICBsZXQgbWF0aCA9IFwiXCI7XG4gICAgICAgIGZvciAobGV0IGk9MDtpPHRva2Vucy5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGxldCB0ZW1wO1xuICAgICAgICAgICAgbWF0aCs9YWRkUGx1c0luZGV4ZXMuaW5jbHVkZXMoaSk/JysnOicnO1xuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXT8udmFsdWU9PT1cIihcIiYmdG9rZW5zW3Rva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbjogeyBpZDogYW55OyB9LCBpbmRleDogbnVtYmVyKSA9PiB0b2tlbi5pZCA9PT0gdG9rZW5zW2ldLmlkJiZ0b2tlbnNbaW5kZXgrMV0pKzFdLnZhbHVlPT09XCIvXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3dpdGNoICh0b2tlbnNbaV0/LnR5cGUpe1xuICAgICAgICAgICAgICAgIGNhc2UgXCJudW1iZXJcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwicG93ZXJWYXJpYWJsZVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJvcGVyYXRvclwiOlxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldIGluc3RhbmNlb2YgVG9rZW4pXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0/LnRvU3RyaW5nTGF0ZXgoKVxuICAgICAgICAgICAgICAgICAgICAvL3RlbXA9cm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgLy9tYXRoKz10ZW1wKyhpKzE8dG9rZW5zLmxlbmd0aCYmLyhmcmFjKS8udGVzdCh0b2tlbnNbaSsxXS52YWx1ZSk/XCIrXCI6XCJcIik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJwYXJlblwiOlxuICAgICAgICAgICAgICAgICAgICBtYXRoKz1jdXJseUJyYWNrZXRJbmRleGVzLmNvbnRhaW5zKGkpP3Rva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLFwie1wiKS5yZXBsYWNlKC9cXCkvLFwifVwiKTp0b2tlbnNbaV0udmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IodGhpcy50b2tlbnMpXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCB0b2tlbiB0eXBlIGdpdmVuIHRvIHJlY29uc3RydWN0OiB0eXBlICR7dG9rZW5zW2ldPy50eXBlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRoXG4gICAgfVxuICAgIFxuICAgIGN1cmx5QnJhY2tldElEcyh0b2tlbnMgPSB0aGlzLnRva2Vucykge1xuICAgICAgICBjb25zdCByaWdodEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpLCAuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ3JpZ2h0JyldO1xuICAgICAgICBjb25zdCBib3RoQnJhY2tldHMgPSBbLi4uZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJyldO1xuICAgICAgICBjb25zdCBkb3VibGVSaWdodEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnZG91YmxlUmlnaHQnKV07XG4gICAgICAgIGNvbnN0IG1hcDogeyBvcGVuOiBhbnk7IGNsb3NlOiBhbnk7IGlkOiBhbnk7IH1bXSA9IFtdO1xuICAgIFxuICAgICAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW46IHsgdmFsdWU6IHN0cmluZzsgfSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdG9rZW5zW2luZGV4IC0gMV0/LnZhbHVlO1xuICAgICAgICAgICAgY29uc3QgbmV4dFRva2VuID0gdG9rZW5zW2luZGV4ICsgMV0/LnZhbHVlO1xuICAgIFxuICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSAnKCcpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAwICYmIGRvdWJsZVJpZ2h0QnJhY2tldHMuaW5jbHVkZXMocHJldlRva2VuKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwMSA9IGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2Vucyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBwMS5jbG9zZSArIDEsIHRva2Vucyk7XG4gICAgICAgICAgICAgICAgICAgIG1hcC5wdXNoKHAxLCBwMik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpbmRleCA+IDAgJiYgcmlnaHRCcmFja2V0cy5pbmNsdWRlcyhwcmV2VG9rZW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hcC5wdXNoKGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2VucykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09ICcpJyAmJiBib3RoQnJhY2tldHMuaW5jbHVkZXMobmV4dFRva2VuKSkge1xuICAgICAgICAgICAgICAgIG1hcC5wdXNoKGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2VucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG1hcDtcbiAgICB9XG4gICAgXG5cbiAgICBpbmRleGVzVG9BZGRQbHVzKHRva2VuczogYW55W10pe1xuICAgICAgICByZXR1cm4gdG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT5pbmRleD4wXG4gICAgICAgICAgICAmJnRva2Vuc1tpbmRleCAtIDFdPy5pc1ZhbHVlVG9rZW4oKVxuICAgICAgICAgICAgJiZ0b2tlbj8uaXNWYWx1ZVRva2VuKCkmJnRva2VuLnZhbHVlPj0wP2luZGV4Om51bGxcbiAgICAgICAgKS5maWx0ZXIoaXRlbT0+aXRlbSE9PW51bGwpXG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgdG9rZW5Db21wYXJlKGNvbXBhcmU6IHN0cmluZyB8IG51bWJlciwgdmFsdWU6IHN0cmluZ3xSZWdFeHAsIHRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0sIG5leHRUb2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9KSB7XG4gICAgICAgIGNvbnN0IHJlZ0V4cHZhbHVlID0gKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSA/IHZhbHVlIDogbmV3IFJlZ0V4cCh2YWx1ZSk7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgcmVnRXhwdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXG4gICAgICAgICAgICB0b2tlbltjb21wYXJlXSA9PT0gbmV4dFRva2VuPy5bY29tcGFyZV1cbiAgICAgICAgKTtcbiAgICB9XG5cbn1cblxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnI6IGFueSkge1xuICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICBsZXQgc3RhY2sgPSBBcnJheS5pc0FycmF5KGFycikgPyBbLi4uYXJyXSA6IFthcnJdO1xuXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBuZXh0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpO1xufVxuXG5leHBvcnQgY2xhc3MgVG9rZW57XG4gICAgdmFsdWU/OiBudW1iZXI7XG4gICAgdmFyaWFibGU/OiBzdHJpbmc7XG4gICAgY29uc3RydWN0b3IodmFsdWU6bnVtYmVyICx2YXJpYWJsZT86IHN0cmluZyl7XG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XG4gICAgfVxuICAgIGlzVmFyKCkge3JldHVybiB0aGlzLnZhcmlhYmxlIT09dW5kZWZpbmVkfVxuXG59XG5cblxuZXhwb3J0IGNsYXNzIEJhc2ljTWF0aEpheFRva2Vue1xuICAgIHR5cGU6IHN0cmluZztcbiAgICB2YWx1ZT86IHN0cmluZ3xudW1iZXI7XG4gICAgdmFyaWFibGU/OiBzdHJpbmc7XG4gICAgbW9kaWZpZXI6IGFueTtcbiAgICBpZDogUGFyZW47XG4gICAgXG4gICAgY29uc3RydWN0b3IodmFsdWU6IHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZCx2YXJpYWJsZT86IGFueSl7XG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XG4gICAgICAgIHRoaXMuc2V0VHlwZSgpO1xuICAgICAgICB0aGlzLmluc3VyUHJvcGVyRm9ybWF0dGluZygpXG4gICAgfVxuICAgIGluc3VyUHJvcGVyRm9ybWF0dGluZygpe1xuICAgICAgICBpZiAodGhpcy50eXBlPT09J29wZXJhdG9yJyYmdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJyl7XG4gICAgICAgICAgICB0aGlzLnZhbHVlPXNlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy52YWx1ZSk/Lm5hbWVcbiAgICAgICAgfVxuICAgICAgIC8vIGlmICghdGhpcy52YWx1ZSl7dGhyb3cgbmV3IEVycm9yKCd3dGYgVmFsdWUgd2FzIHVuZGVmaW5lZCBhdCB0b2tlbiBpbnN1clByb3BlckZvcm1hdHRpbmcnKX1cbiAgICB9XG4gICAgZ2V0SWQoKXtyZXR1cm4gdGhpcy5pZC5pZH07XG5cbiAgICBnZXRMYXRleFN5bWJvbCgpe3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnP3NlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy52YWx1ZSk/LmxhdGV4OnVuZGVmaW5lZH1cblxuICAgIGdldEZ1bGxUb2tlbklEKCl7XG4gICAgICAgIHN3aXRjaCAodGhpcy50eXBlKSB7XG4gICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgY2FzZSAncHJhbmUnOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnR5cGU7XG4gICAgICAgICAgICBjYXNlICdvcGVyYXRvcic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZSsnOicrdGhpcy52YWx1ZVxuICAgICAgICAgICAgY2FzZSAndmFyaWFibGUnOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnR5cGUrJzonK3RoaXMudmFyaWFibGVcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXRmdWxsVHlwZSgpe1xuICAgICAgICByZXR1cm4gdGhpcy50eXBlXG4gICAgfVxuXG4gICAgc2V0VHlwZSgpe1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJyl7XG4gICAgICAgICAgICB0aGlzLnR5cGU9dGhpcy52YWx1ZS5tYXRjaCgvWygpXS8pPydwYXJlbic6J29wZXJhdG9yJztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnR5cGU9dGhpcy52YXJpYWJsZT8ndmFyaWFibGUnOidudW1iZXInO1xuICAgIH1cblxuICAgIGlzU3RyaW5nKCl7cmV0dXJuIHRoaXMudHlwZT09PSdwYXJlbid8fHRoaXMudHlwZT09PSdvcGVyYXRvcid9XG5cbiAgICBpc1ZhbHVlVG9rZW4oKXtyZXR1cm4gdGhpcy50eXBlPT09J3ZhcmlhYmxlJ3x8dGhpcy50eXBlPT09J251bWJlcid9XG5cbiAgICB0b1N0cmluZ0xhdGV4KCl7XG4gICAgICAgIGxldCBzdHJpbmc9JydcbiAgICAgICAgaWYgKHRoaXMuaXNTdHJpbmcoKSlcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy5nZXRMYXRleFN5bWJvbCgpXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0ndmFyaWFibGUnKSBzdHJpbmcrPXRoaXMudG9TdHJpbmdWYXJpYWJsZSgpXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nbnVtYmVyJykgc3RyaW5nKz10aGlzLnZhbHVlO1xuICAgICAgICByZXR1cm4gc3RyaW5nXG4gICAgfVxuICAgIGFmZmVjdGVkT3BlcmF0b3JSYW5nZShkaXJlY3Rpb246IHN0cmluZyl7XG4gICAgICAgIGlmKHRoaXMudHlwZSE9PSdvcGVyYXRvcid8fHRoaXMudmFsdWU9PT0nRXF1YWxzJylcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBpZih0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnJiZkaXJlY3Rpb249PT0nbGVmdCcmJiFnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ2JvdGgnKS5pbmNsdWRlcyh0aGlzLnZhbHVlKSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgICB0b1N0cmluZ1ZhcmlhYmxlKCl7XG4gICAgICAgIHJldHVybiAodGhpcy52YWx1ZSYmdGhpcz8udmFsdWUhPT0xP3RoaXMudmFsdWU6JycpKyh0aGlzLnZhcmlhYmxlfHwnJyk7XG4gICAgfVxufVxuXG5jbGFzcyBQcmFpc2luZ01ldGhvZHtcbiAgICB0b2tlbnNcbiAgICBvdmVydmlldzogYW55O1xuICAgIHZhcmlhYmxlczogYW55W107XG4gICAgY29uc3RydWN0b3IodG9rZW5zOiBhbnkpe1xuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnNcbiAgICAgICAgdGhpcy5vdmVydmlldz10aGlzLmdldE92ZXJ2aWV3KClcbiAgICAgICAgdGhpcy5hc3NpZ25WYXJpYWJsZXMoKVxuICAgIH1cbiAgICBpc1ZhcldpdGhWYWx1ZUJpZ2dlclRoYW5PbmUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnNvbWUoKHQ6IGFueSk9PiB0LnR5cGU9PT0ndmFyaWFibGUnJiZ0LnZhbHVlPjEpXG4gICAgfVxuXG4gICAgaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFzZVZhcmlhYmxlKCkmJnRoaXMuaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCkmJnRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKVxuICAgIH1cbiAgICBpc0lzb2xhdGUoKXtcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5cbiAgICB9XG5cbiAgICBpc0FueXRoaW5nVG9Jc29sYXRlKCl7XG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzLmxlbmd0aD4xKXRocm93IG5ldyBFcnJvcihcInR3byB2YXIgZXEgYXJlbnQgc2Fwb3J0ZWQgeWV0XCIpXG4gICAgICAgIGlmKCF0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpcmV0dXJuO1xuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMuZXF1YWxzSW5kZXhJZkFueSgpO1xuICAgICAgICBpZighZXFJbmRleCl7cmV0dXJufTtcbiAgICAgICAgY29uc3QgYmVmb3IgPSB0aGlzLmdldE92ZXJ2aWV3KHRoaXMudG9rZW5zLnNsaWNlKDAsZXFJbmRleCkpXG4gICAgICAgIGNvbnN0IGFmdGVyID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZShlcUluZGV4KzEpKVxuICAgICAgICBjb25zdCB3aGF0VG9Jc29sYXQgPXRoaXMud2hhdFRvSXNvbGF0KCk7XG4gICAgICAgIGlmICgoIWJlZm9yfHwhYWZ0ZXIpfHwhd2hhdFRvSXNvbGF0fHwoYmVmb3I/LnNpemU8MiYmYWZ0ZXI/LnNpemU8MikpcmV0dXJuO1xuICAgICAgICByZXR1cm4ge292ZXJ2aWV3U2lkZU9uZTogYmVmb3Isb3ZlcnZpZXdTaWRlVHdvOiBhZnRlciwuLi53aGF0VG9Jc29sYXR9XG4gICAgfS8qXG4gICAgaG93VG9Jc29sYXRlKG92ZXJ2aWV3U2lkZU9uZSxvdmVydmlld1NpZGVUd28saXNvbGF0aW9uR29vbCl7XG4gICAgICAgIGNvbnN0IGlzb2xhdGlvblR5cGU9aXNvbGF0aW9uR29vbC5zcGx0KCc6Jyk7XG4gICAgICAgIC8vaWYgKCl7fVxuICAgIH0qL1xuICAgIHdoYXRUb0lzb2xhdCgpe1xuICAgICAgICAvLyBpIG5lZWQgdG8gYWRkIHBvd3MgYWZ0ZXJcbiAgICAgICAgLy8gZm9yIGtub3cgaW0gZ29pbmcgb24gdGhlIG9zaG9tc2hpbiB0aGF0IHRociBpcyBvbmx5IG9uZSB2YXJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXM/Lmxlbmd0aDwxKXJldHVybjtcblxuICAgICAgICByZXR1cm4ge3R5cGU6ICd2YXJpYWJsZScsdmFsdWU6IHRoaXMudmFyaWFibGVzWzBdfVxuICAgIH0vKlxuICAgIGlzT3ZlcnZpZXdUb2lzb2xhdChvdmVydmlldyl7XG4gICAgfSovXG4gICAgaXNJbWJhbGFuY2Uob3ZlcnZpZXc6IHsgc2l6ZTogbnVtYmVyOyB9KXtcbiAgICAgICAgb3ZlcnZpZXcuc2l6ZT4xXG4gICAgfVxuICAgIGVxdWFsc0luZGV4SWZBbnkoKXtcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLnRva2Vucy5tYXAoKHQ6IHsgdmFsdWU6IHN0cmluZzsgfSxpZHg6IGFueSk9PnQudmFsdWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKChtOiBudWxsKT0+bSE9PW51bGwpO1xuICAgICAgICByZXR1cm4gZXFJbmRleFswXTtcbiAgICB9XG4gICAgaXNRdWFkcmF0aWMoKXtcblxuICAgIH1cbiAgICBpc0ZpbmFsUmV0dXJuKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5sZW5ndGg8Mnx8KHRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlcbiAgICB9XG4gICAgXG4gICAgYXNzaWduVmFyaWFibGVzKCl7XG4gICAgICAgIHRoaXMudmFyaWFibGVzPVtdXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKXtcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgoJ3ZhcmlhYmxlOicpJiYhdGhpcy52YXJpYWJsZXMuaW5jbHVkZXModmFsdWUudmFyaWFibGUpKXtcbiAgICAgICAgICAgICAgICB0aGlzLnZhcmlhYmxlcy5wdXNoKHZhbHVlLnZhcmlhYmxlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaGFzZVZhcmlhYmxlKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzPy5sZW5ndGg+MH1cblxuICAgIGlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpe1xuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubm9NYXRjaD4wXG4gICAgfVxuICAgIGlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCl7XG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxuICAgICAgICByZXR1cm4gIGZpbHRlci5tYXRjaD09PTEmJmZpbHRlci5ub01hdGNoPT09MFxuICAgIH1cblxuICAgIGZpbHRlckJ5VHlwZSh0eXBlS2V5OiBzdHJpbmcsIHRhcmdldFZhbHVlOiBzdHJpbmcpe1xuICAgICAgICBsZXQgbWF0Y2g9MCwgbm9NYXRjaD0wXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKSB7XG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKHR5cGVLZXkpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gdHlwZUtleSsnOicrdGFyZ2V0VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2grKztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBub01hdGNoKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG1hdGNoOiBtYXRjaCwgbm9NYXRjaDogbm9NYXRjaCB9O1xuICAgIH1cbiAgICBnZXRPdmVydmlldyh0b2tlbnM/OiBhbnlbXSApIHtcbiAgICAgICAgaWYoIXRva2Vucyl0b2tlbnM9dGhpcy50b2tlbnNcbiAgICAgICAgaWYoIXRva2VucylyZXR1cm47XG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3ID0gbmV3IE1hcCgpO1xuICAgICAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XG4gICAgICAgICAgICAvL2lmICghdG9rZW4uaXNWYWx1ZVRva2VuKCkpIHtyZXR1cm47fVxuICAgICAgICAgICAgY29uc3Qga2V5ID0gdG9rZW4uZ2V0RnVsbFRva2VuSUQoKVxuICAgICAgICAgICAgLy9FcXVhbHNcbiAgICAgICAgICAgIGlmICghb3ZlcnZpZXcuaGFzKGtleSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeSA9IHsgXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLnR5cGUsIFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogMCAsXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlOiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09PSAndmFyaWFibGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGVudHJ5LnZhcmlhYmxlID0gdG9rZW4udmFyaWFibGU7XG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgIG92ZXJ2aWV3LnNldChrZXksIGVudHJ5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG92ZXJ2aWV3LmdldChrZXkpLmNvdW50Kys7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gb3ZlcnZpZXcvL0FycmF5LmZyb20ob3ZlcnZpZXcudmFsdWVzKCkpO1xuICAgIH1cbn1cblxuY2xhc3MgT3BlcmF0b3J7XG5cbn1cblxuY2xhc3MgTW9kaWZpZXJ7XG5cbn0iXX0=