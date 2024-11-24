import { quad, calculateBinom, roundBySettings, degreesToRadians, radiansToDegrees } from "./mathUtilities";
import { expandExpression, curlyBracketsRegex } from "./imVeryLazy";
import { type } from "os";
import { arrToRegexString, regExp } from "./tikzjax/tikzjax";
const greekLetters = [
    'Alpha', 'alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
    'Iota', 'Kappa', 'Lambda', 'Mu', 'mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho',
    'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'
];
const latexOperators = [
    'tan', 'sin', 'cos', 'binom', 'frac', 'asin', 'acos',
    'atan', 'arccos', 'arcsin', 'arctan', 'cdot'
];
function findConsecutiveSequences(arr) {
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
const operatorSides = {
    both: ["^", "+", "-", "*", "/", "="],
    rightOnly: ["sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "arcsin", "arccos", "arctan"],
    doubleRight: ["frac", "binom"]
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
            case operatorsForMathinfo.bothButRightBracket.includes(this.operator):
                solution = `${left} ${position.operator} {${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.both.includes(this.operator):
                solution = `${left} ${position.operator.replace(/\*/g, "\\cdot")} ${right} = ${solution}`;
                break;
            case operatorsForMathinfo.special.includes(this.operator):
                solution = `\\frac{${left}}{${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.rightBracketAndRequiresSlash.includes(this.operator):
                solution = `\\sqrt{${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.RightParenAndRequiresSlash.includes(this.operator):
                solution = `\\${position.operator} (${right}) = ${solution}`;
                break;
            case operatorsForMathinfo.doubleRightButBracket.includes(this.operator):
                solution = `\\${position.operator.replace("/", "frac")}{${left}}{${right}} = ${solution}`;
                break;
        }
        this.addSolutionInfo(solution);
    }
}
function safeToNumber(value) {
    if (!(typeof value === "string")) {
        return value;
    }
    if (value === "+") {
        return 0;
    }
    if (value === "-") {
        return -1;
    }
    if (/[a-zA-Z]/.test(value)) {
        return 1;
    }
    if (/[([]/.test(value[0])) {
        value = value.slice(1);
    }
    if (/[)\]]/.test(value[value.length - 1])) {
        value = value.slice(0, value.length - 1);
    }
    for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === "string" && /[()[\]]/.test(value[i])) {
            value = value.slice(0, i) + value.slice(i + 1);
            i--;
        }
    }
    const num = Number(value);
    return isNaN(num) ? value.length > 0 ? value : 0 : num;
}
function parseSafetyChecks(operator, left, right) {
    if (typeof operator === "string" && typeof left.value !== "number" && !operatorSides.rightOnly.includes(operator)) {
        throw new Error("Left side of " + operator + " must have a value");
    }
    if (typeof operator === "string" && typeof right.value !== "number") {
        throw new Error("Right side of " + operator + " must have a value");
    }
}
function parse(position) {
    let { operator, specialChar, left, right } = position;
    left = left.tokens;
    right = right.tokens;
    parseSafetyChecks(operator, left, right);
    let solved = { value: 0, variable: "", pow: "" };
    switch (operator) {
        case "sqrt":
            solved.value = Math.pow(right.value, specialChar !== null ? (1) / (specialChar) : 0.5);
            break;
        case "^":
            if (left.variable || right.variable) {
                solved.variable = left.variable || left.variable === right.variable ? left.variable : right.variable ? right.variable : "";
                solved.pow = 2;
            }
            solved.value = Math.pow(left.value, right.value);
            break;
        case "frac":
        case "/":
            solved.value = (left.value) / (right.value);
            break;
        case "*":
            solved.value = left.value * right.value;
            handleVriables(left, right, solved);
            break;
        case "+":
            solved.value = left.value + right.value;
            solved.variable = left.variable ? left.variable : right.variable;
            break;
        case "-":
            solved.value = left.value - right.value;
            solved.variable = left.variable ? left.variable : right.variable;
            break;
        case "binom":
            solved.value = calculateBinom(left.value, right.value);
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
            return null;
    }
    function handleVariableMultiplication(left, right, solved) {
        if (left.variable && right.variable && left.variable !== right.variable) {
            // Keep them separate since they have different variables
            solved.terms = [
                { variable: left.variable, pow: left.pow || 1, value: left.value || 1 },
                { variable: right.variable, pow: right.pow || 1, value: right.value || 1 }
            ];
            throw new Error("Different variable bases at power multiplication. I didn't get there yet");
        }
        const variable = left.variable || right.variable;
        solved.variable = variable.length > 0 ? variable : undefined;
        let pow = (left.pow || 0) + (right.pow || 0);
        pow = left.variable && right.variable && pow === 0 && !left.pow && !right.pow ? 2 : pow;
        solved.pow = pow || undefined;
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
    return {
        type: solved.pow ? "powerVariable" : solved.variable ? "variable" : "number",
        value: solved.value,
        variable: solved.variable ? solved.variable : "",
        pow: solved.pow ? solved.pow : "",
    };
}
function operationsOrder(tokens) {
    function findOperatorIndex(begin, end, tokens, regex) {
        while (begin < end && begin < tokens.tokens.length) {
            let index;
            if (regex) {
                index = tokens.tokens.slice(begin, end).findIndex(token => token.type === "operator" && regex.test(token.value));
            }
            else {
                index = tokens.tokens.slice(begin, end).findIndex(token => token.type === "operator");
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
                currentID = tokens.findParenIndex(tokens.tokens[i].id);
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
    // Find indices based on operator precedence
    let priority1 = findOperatorIndex(begin, end, tokens, /(\^|sqrt)/);
    let priority2 = findOperatorIndex(begin, end, tokens, /(frac|binom|sin|cos|tan|asin|acos|atan)/);
    let priority3 = findOperatorIndex(begin, end, tokens, /(\*|\/)/);
    let priority4 = findOperatorIndex(begin, end, tokens, /[+-]/);
    let priority5 = findOperatorIndex(begin, end, tokens, /=/);
    return [priority1, priority2, priority3, priority4, priority5].find(index => index !== -1) ?? null;
}
function applyPosition(tokens, index, direction) {
    let breakChar = index;
    let target;
    let multiStep = false;
    const isLeft = direction === "left";
    const indexModifier = isLeft ? -1 : 1;
    if ((isLeft && index <= 0) || (!isLeft && index >= tokens.tokens.length - 1) || !tokens.tokens[index + indexModifier]) {
        throw new Error("at applyPosition: \"index wasn't valid\" index: " + index);
    }
    if (tokens.tokens[index + indexModifier].type === "paren") {
        const parenIndex = tokens.findParenIndex(tokens.tokens[index + indexModifier].id);
        breakChar = isLeft ? parenIndex.open : parenIndex.close + 1;
        //target = tokens.tokens.slice(isLeft ? breakChar : index + 1, isLeft ? index : breakChar);
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
        target = target.find(item => /(number|variable|powerVariable)/.test(item.type));
    }
    else if (target.length > 1)
        multiStep = true;
    return {
        tokens: target,
        multiStep: multiStep,
        breakChar: breakChar
    };
}
export class Position {
    operator;
    index;
    transition;
    specialChar;
    left = null;
    right = null;
    constructor(tokens, index) {
        this.index = index;
        this.transition = this.index;
        this.position(tokens);
    }
    position(tokens) {
        this.index = this.index === null ? operationsOrder(tokens) : this.index;
        if (this.index === null || this.index === tokens.length - 1) {
            return null;
        }
        this.operator = tokens.tokens[this.index].value;
        switch (true) {
            case operatorSides.both.includes(this.operator):
                this.left = applyPosition(tokens, this.index, "left");
                this.right = applyPosition(tokens, this.index, "right");
                break;
            case operatorSides.rightOnly.includes(this.operator):
                this.left = { breakChar: this.index };
                this.right = applyPosition(tokens, this.index, "right");
                break;
            case operatorSides.doubleRight.includes(this.operator):
                this.left = applyPosition(tokens, this.index, "right");
                this.transition = this.left.breakChar;
                this.right = applyPosition(tokens, this.transition - 1, "right");
                this.left.breakChar = this.index;
                this.right.breakChar + (this.right.multiStep ? 1 : 0);
                break;
            default:
                throw new Error(`Operator ${this.operator} was not accounted for, or is not the valid operator`);
        }
        this.specialChar = tokens.tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
    }
    checkMultiStep() {
        return (this.left.multiStep || this.right.multiStep) && this.operator === '*';
    }
    isLeftVar() {
        return this.left.multiStep ? this.left.tokens.some(t => t.type === 'variable' || t.type === 'powerVariable') : this.left.tokens.type.includes('ariable');
    }
    isRightVar() {
        return this.right.multiStep ? this.right.tokens.some(t => t.type === 'variable' || t.type === 'powerVariable') : this.right.tokens.type.includes('ariable');
    }
    checkFrac() {
        return /(frac|\/)/.test(this.operator) && (this.isLeftVar() || this.isRightVar());
    }
}
function simplifiy(tokens) {
    if (tokens.length <= 1) {
        return tokens;
    }
    let i = 0, newTokens = [];
    while (i <= 100 && tokens.some(token => (/(number|variable|powerVariable)/).test(token.type))) {
        i++;
        let eqindex = tokens.findIndex(token => token.value === "=");
        let OperationIndex = tokens.findIndex((token) => (/(number|variable|powerVariable)/).test(token.type));
        if (OperationIndex === -1) {
            return tokens;
        }
        let currentToken = { type: tokens[OperationIndex].type, value: tokens[OperationIndex].value, variable: tokens[OperationIndex].variable, pow: tokens[OperationIndex].pow };
        let numberGroup = tokens
            .map((token, i) => ({ token, originalIndex: i }))
            .filter(item => item.token.type === currentToken.type)
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
/*
if (!areThereOperators)
    {
        if (powIndex.length===0&&variableIndex.length!==0&&numberIndex!==0)
        {
            mathInfo.addSolutionInfo(`${variableIndex[0].variable} = \\frac{${numberIndex[0].value}}{${variableIndex[0].value}} = ${(numberIndex[0].value)/(variableIndex[0].value)}`)
            return `${variableIndex[0].variable} = ${(numberIndex[0].value)/(variableIndex[0].value)}`
        }
        else if(tokens.length===1&&numberIndex){
            return JSON.stringify(numberIndex.value===0)
        }
}*/
function praisingMethod(tokens) {
    const filterByType = (type) => tokens.filter(token => token.type === type);
    const [numberIndex, variableIndex, powIndex] = [filterByType("number"), filterByType("variable"), filterByType("powerVariable")];
    if (powIndex.length === 1 && powIndex[0].pow === 2)
        return 'quadratic';
    if (powIndex.length === 0 && variableIndex.length !== 0 && numberIndex !== 0)
        return 'isolat';
    if (tokens.length === 1 && numberIndex)
        return 'isJustNumber';
}
export class MathPraiser {
    input = "";
    tokens = [];
    solution = "";
    mathInfo = new MathInfo();
    constructor(input) {
        this.input = input;
        this.processInput();
        this.tokens = new Tokens(this.input);
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
        this.getRedyforNewRond();
        if (this.shouldUsePosition()) {
            const position = new Position(this.tokens, null);
            this.addDebugInfo("Parsed expression", JSON.stringify(position, null, 1));
            if (position === null && this.tokens.tokens.length > 1) {
                //this.addDebugInfo("parse(tokens)",parse(this.tokens.tokens))
                return "the ****";
                // return solution(tokens);
            }
            else if (position.index === null) {
                return this.finalReturn();
            }
            if (position.checkFrac() || position.checkMultiStep()) {
                expandExpression(this.tokens, position);
                this.mathInfo.addSolutionInfo(this.tokens.reconstruct(this.tokens.tokens));
                return this.controller();
            }
            this.useParse(position);
        }
        else {
            const method = praisingMethod(this.tokens.tokens);
            if (method === 'quadratic') {
                this.tokens.tokens = simplifiy(this.tokens.tokens);
                const filterByType = (type) => this.tokens.tokens.filter(token => token.type === type);
                const [numberIndex, variableIndex, powIndex] = [filterByType("number"), filterByType("variable"), filterByType("powerVariable")];
                this.mathInfo.addDebugInfo("simplifiy(tokens)", this.tokens.tokens);
                if (powIndex.length === 1 && powIndex[0].pow === 2) {
                    return quad(powIndex[0]?.value | 0, variableIndex[0]?.value | 0, numberIndex[0]?.value * -1 | 0, powIndex[0].variable);
                }
            }
        }
        //if (solved === null||typeof solved==="string") {return solved; }
        return this.tokens.tokens.length > 1 ? this.controller() : this.finalReturn();
    }
    useParse(position) {
        const solved = parse(position);
        //this.mathInfo.addDebugInfo("solved",solved)
        this.mathInfo.addSolution(this.tokens, position, solved);
        const [leftBreak, length] = [position.left.breakChar, position.right.breakChar - position.left.breakChar];
        this.tokens.insertTokens(leftBreak, length, solved);
        this.addDebugInfo("newTokens", this.tokens.tokens);
    }
    shouldUsePosition() {
        return this.tokens.tokens.some(token => /(operator)/.test(token.type) && !/(=)/.test(token.value));
    }
    addDebugInfo(mes, value) {
        this.mathInfo.addDebugInfo(mes, value);
    }
    processInput() {
        this.input = this.input
            .replace(/(Math.|\\|\s|left|right)/g, "")
            .replace(/{/g, "(")
            .replace(/}/g, ")")
            .replace(/(cdot)/g, "*");
        //.replace(/(?<!\\|[a-zA-Z])(tan|sin|cos|binom|frac|asin|acos|atan|arccos|arcsin|arctan|cdot)/g, "\\$1");
    }
    finalReturn() {
        return this.tokens.reconstruct();
    }
}
class Tokens {
    tokens = [];
    constructor(math) {
        this.tokenize(math);
    }
    tokenize(math) {
        let tokens = [];
        let brackets = 0, levelCount = {};
        let j = 0;
        for (let i = 0; i < math.length; i++) {
            j++;
            if (j > 500) {
                break;
            }
            let number = 0, vari = "";
            if (math[i] === "(" || math[i] === ")") {
                tokens.push({ type: "paren", value: math[i], });
                continue;
            }
            let match = math.slice(i).match(regExp('^' + arrToRegexString(latexOperators)));
            if (!!match) {
                let operator = match[0];
                tokens.push({ type: "operator", value: operator });
                i += operator.length - 1;
                if (tokens[tokens.length - 1].value === "sqrt" && math[i] === "[" && i < math.length - 2) {
                    let temp = math.slice(i, i + 1 + math.slice(i).search(/[\]]/));
                    i += temp.length;
                    Object.assign(tokens[tokens.length - 1], { specialChar: safeToNumber(temp), });
                }
                continue;
            }
            match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
            if (!!match) {
                number = match[0];
                i += number.length > 1 ? number.length - 1 : 0;
                tokens.push({ type: "number", value: parseFloat(number) });
                continue;
            }
            if (/[a-zA-Z]/.test(math[i])) {
                vari = (math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/) || [""])[0];
                if (vari && vari.length === 0) {
                    vari = math.slice(i, math.length);
                }
                i += vari.length - 1;
                tokens.push({ type: "variable", variable: vari.replace("(", "{").replace(")", "}"), value: 1 });
                continue;
            }
            if (/[*/^=+-]/.test(math[i])) {
                tokens.push({ type: "operator", value: math[i] });
                continue;
            }
            throw new Error(`Unknown char "${math[i]}"`);
        }
        this.tokens = tokens;
        this.postProcessTokens();
    }
    validateIndex(index, margin) {
        margin = margin ? margin : 0;
        return index > 0 + margin && index < this.tokens.length - 1 - margin;
    }
    validatePM(map) {
        map.forEach(index => {
            index = this.validateIndex(index, 1) && this.tokens[index - 1].type === 'operator' || this.tokens[index + 1].type === 'operator' ? null : index;
        });
        return map;
    }
    validateParen(map) {
    }
    postProcessTokens() {
        /*rules to abid by:
        1. +- If part of the number they are absorbed into the number
        */
        const check = (index) => {
            if (!this.validateIndex(index))
                return false;
            return this.tokens[index].type.match(this.valueTokens());
        };
        this.reIDparentheses();
        const map = this.tokens.map((token, index) => (token.type === 'number' || token.type === 'variable') ? index : null).filter(item => item !== null);
        const arr = findConsecutiveSequences(map);
        this.connectAndCombine(arr);
        const mapCarrot = this.tokens.map((token, index) => token.value === '^' && check(index) ? index : null).filter(item => item !== null);
        let mapPM = this.tokens.map((token, index) => token.value === '+' || token.value === '-' ? index : null).filter(index => index !== null);
        mapPM = this.validatePM(mapPM);
        mapPM.reverse().forEach(index => {
            const value = this.tokens[index].value === '+' ? 1 : -1;
            this.tokens[index + 1].value *= value;
            this.tokens.splice(index, 1);
        });
        const testDoubleRight = (index) => {
            if (!this.validateIndex(index))
                return false;
            const idx = this.findParenIndex(null, index).open;
            return this.tokens[index + 1].value === '(' && (idx === 0 || !/(frac|binom)/.test(this.tokens[idx - 1].value));
        };
        //Map parentheses for implicit multiplication.
        const mapParen = this.tokens
            .map((token, index) => {
            // 
            if (token.value === "(" || (token.type === 'operator' && !/[+\-*/^=]/.test(token.value))) {
                return check(index - 1) ? index : null;
            }
            else if (token.value === ")") {
                return check(index + 1) || testDoubleRight(index) ? index + 1 : null;
            }
            return null;
        })
            .filter(item => item !== null);
        mapParen.sort((a, b) => b - a)
            .forEach(value => {
            this.tokens.splice(value, 0, { type: 'operator', value: '*', index: 0 });
        });
        //Implicit powers
    }
    mapParenIndexes() {
        return this.tokens
            .map((token, index) => token.value === "(" ? this.findParenIndex(undefined, index) : null)
            .filter(item => item !== null)
            .filter(item => {
            const { open: openIndex, close: closeIndex } = item;
            if (openIndex > 0) {
                if (/operator|paren/.test(this.tokens[openIndex - 1].type)) { // && prevToken.value !== "="
                    return false;
                }
            }
            if (closeIndex < this.tokens.length - 1) {
                if (this.tokens[closeIndex + 1].type === "operator" && this.tokens[closeIndex + 1].value !== "=") { //this.tokens[closeIndex + 1]
                    return false;
                }
            }
            return true;
        });
    }
    /*
    findSimilarSuccessor(tokens){
        return this.tokens.findIndex((token, index) =>
                ((tokens[index + 2]?.type !== "operator"&&tokens[index -1]?.type !== "operator")
                &&(this.tokenCompare("type",this.valueTokens(), token, tokens[index + 1]))
        ));
     }*/
    valueTokens() { return /(number|variable|powerVariable)/; }
    connectNearbyTokens() {
        const map = new Set(this.mapParenIndexes().flatMap(({ open, close }) => [open, close]));
        this.tokens = this.tokens.filter((_, idx) => !map.has(idx));
        const check = (index) => (this.tokens[index - 1]?.type !== "operator" && this.tokens[index + 1]?.type !== "operator");
        const numMap = this.tokens.map((token, index) => token.type === 'number' && check(index) ? index : null).filter(item => item !== null);
        const varMap = this.tokens.map((token, index) => token.type === 'variable' && check(index) ? index : null).filter(item => item !== null);
        const powMap = this.tokens.map((token, index) => token.type === 'powerVariable' && check(index) ? index : null).filter(item => item !== null);
        const arr = [
            ...findConsecutiveSequences(numMap),
            ...findConsecutiveSequences(varMap),
            ...findConsecutiveSequences(powMap)
        ];
        this.connectAndCombine(arr);
        this.reIDparentheses(this.tokens);
    }
    connectAndCombine(arr) {
        const indexes = [];
        arr.sort((a, b) => b[0] - a[0]).forEach(el => {
            indexes.push({ start: el[0], end: el[el.length - 1] });
        });
        indexes.forEach(index => {
            let value = Number(this.tokens[index.start].value);
            const isVar = this.tokens.slice(index.start, index.end + 1).find(token => token.type.includes('var'));
            for (let i = index.start + 1; i <= index.end; i++) {
                value = (isVar ? (this.tokens[i].value * value) : (this.tokens[i].value + value));
            }
            const updatedToken = this.newObj(value, isVar?.variable);
            if (isVar)
                updatedToken.variable = isVar.variable;
            this.tokens[index.start] = updatedToken;
            this.tokens.splice(index.start + 1, index.end - index.start);
        });
    }
    newObj(value, variable) {
        const obj = { index: 0 };
        obj.type = variable ? 'variable' : 'number';
        obj.value = value;
        if (variable)
            obj.variable = variable;
        return obj;
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
        if (tokens === undefined) {
            tokens = this.tokens;
        }
        let math = "";
        for (let i = 0; i < tokens.length; i++) {
            let temp;
            if (tokens[i].value === "(" && tokens[tokens.findLastIndex((token, index) => token.id === tokens[i].id && tokens[index + 1]) + 1].value === "/") {
                math += "\\frac";
            }
            switch (tokens[i].type) {
                case "number":
                    temp = (plusSymbolCheck(tokens, i) ? "+" : "") + roundBySettings(tokens[i].value);
                    math += temp + (i + 1 < tokens.length && /(frac)/.test(tokens[i + 1].value) ? "+" : "");
                    break;
                case "paren":
                    temp = tokens[this.findParenIndex(tokens[i].id).open - 1];
                    if (typeof temp !== "undefined" &&
                        ((curlyBracketsRegex.test(temp.value)) ||
                            (/\)/.test(temp.value) && curlyBracketsRegex.test(tokens[this.findParenIndex(temp.id).open - 1].value)))) {
                        math += tokens[i].value.replace(/\(/, "{").replace(/\)/, "}");
                        break;
                    }
                    else if (i > 0 && tokens[i].value === "(" && tokens[i - 1]?.value === ")") {
                        math += "+";
                    }
                    math += tokens[i].value;
                    break;
                case "operator":
                    if (tokens[i].value !== "/") {
                        math += (tokens[i].value).replace(/([^*^=/+-])/, "\\$1").replace(/\*/g, "\\cdot ");
                    }
                    break;
                case "variable":
                    math += (plusSymbolCheck(tokens, i) ? "+" : "") + (tokens[i].value !== 1 ? tokens[i].value : "") + tokens[i].variable;
                    break;
                case "powerVariable":
                    math += (plusSymbolCheck(tokens, i) ? "+" : "") + (tokens[i].value !== 1 ? tokens[i].value : "") + tokens[i].variable + `^{${tokens[i].pow}}`;
                    break;
                default:
                    throw new Error(`Unexpected tokin type given to reconstruct: type ${tokens[i].type}`);
            }
        }
        return math;
    }
    findParenIndex(id, index) {
        try {
            id = id ? id : this.tokens[index].id;
            const open = this.tokens.findIndex(token => token.value === "("
                && token.id === id);
            const close = this.tokens.findLastIndex(token => token.value === ")"
                && token.id === id);
            return { open: open, close: close, id: id };
        }
        catch (e) {
            throw new Error(e);
        }
    }
    tokenCompare(compare, value, token, nextToken) {
        value = value instanceof RegExp ? value : new RegExp(value);
        return ((value === null || value.test(token[compare])) &&
            token[compare] === nextToken?.[compare]);
    }
    reIDparentheses() {
        let tokens = this.tokens;
        let brackets = 0, levelCount = {};
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].value === "(") {
                if (!levelCount[brackets]) {
                    levelCount[brackets] = 0;
                }
                let ID = levelCount[brackets]++;
                // Reassign the object with the new id to ensure persistence
                tokens[i] = { ...tokens[i], id: brackets + "." + ID };
                brackets++;
                continue;
            }
            if (tokens[i].value === ")") {
                brackets--;
                let ID = levelCount[brackets] - 1;
                // Reassign the object with the new id to ensure persistence
                tokens[i] = { ...tokens[i], id: brackets + "." + (ID >= 0 ? ID : 0) };
                continue;
            }
        }
        if (brackets !== 0) {
            //throw new Error ("Unmatched opening bracket(s) err rate: "+brackets)
        }
        this.tokens = tokens;
    }
}
const plusSymbolCheck = (tokens, index) => {
    if (!index > 0)
        return false;
    return tokens[index].value >= 0 && /(number|variable|powerVariable)/.test(tokens[index - 1].type);
};
export function flattenArray(arr) {
    let result = [];
    let stack = Array.isArray(arr) ? [...arr] : [arr]; // Ensure arr is an array or wrap it in one
    while (stack.length) {
        const next = stack.pop();
        if (Array.isArray(next)) {
            stack.push(...next); // Spread the array items to the stack
        }
        else {
            result.push(next); // Add non-array items to the result
        }
    }
    return result.reverse(); // Reverse to maintain original order
}
class Token {
    type;
    value;
    variable;
    id;
    constructor(value, variable) {
    }
    asNumber() {
    }
    asVariable;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzFCLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3RCxNQUFNLFlBQVksR0FBRztJQUNqQixPQUFPLEVBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU87SUFDNUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsS0FBSztJQUN4RSxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPO0NBQzFELENBQUM7QUFDRixNQUFNLGNBQWMsR0FBQztJQUNqQixLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNO0lBQ3BELE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNO0NBQy9DLENBQUE7QUFFRCxTQUFTLHdCQUF3QixDQUFDLEdBQUc7SUFDakMsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNkLEtBQUssSUFB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QUFNLFNBQVMsR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEtBQUcsR0FBRyxJQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUE7UUFHekgsSUFBSSxLQUFLLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxLQUFHLEdBQUcsSUFBRSxLQUFLLENBQUMsS0FBSyxLQUFHLEdBQUcsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFBLEVBQUUsQ0FBQyxLQUFLLEtBQUcsSUFBSSxDQUFDLENBQUE7UUFDdkgsS0FBSyxHQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUE7UUFFNUIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUM1QixNQUFNLEtBQUssR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssS0FBRyxHQUFHLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7WUFDaEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFFLEtBQUssQ0FBQztZQUNsQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUMsQ0FBQyxDQUFDLENBQUE7UUFDL0IsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLGVBQWUsR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFF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RTtZQUNyQixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBRSxzQ0FBc0M7U0FDL0Q7YUFBTTtZQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBRSxvQ0FBb0M7U0FDM0Q7S0FDSjtJQUVELE9BQU8sTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUUscUNBQXFDO0FBQ25FLENBQUM7QUFDRCxNQUFNLEtBQUs7SUFDUCxJQUFJLENBQUE7SUFDSixLQUFLLENBQUE7SUFDTCxRQUFRLENBQUE7SUFDUixFQUFFLENBQUE7SUFDRixZQUFZLEtBQUssRUFBQyxRQUFRO0lBRTFCLENBQUM7SUFDRCxRQUFRO0lBRVIsQ0FBQztJQUNELFVBQVUsQ0FBQTtDQUNiIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXN9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi9pbVZlcnlMYXp5XCI7XHJcbmltcG9ydCB7IHR5cGUgfSBmcm9tIFwib3NcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgcmVnRXhwIH0gZnJvbSBcIi4vdGlrempheC90aWt6amF4XCI7XHJcbmNvbnN0IGdyZWVrTGV0dGVycyA9IFtcclxuICAgICdBbHBoYScsJ2FscGhhJywgJ0JldGEnLCAnR2FtbWEnLCAnRGVsdGEnLCAnRXBzaWxvbicsICdaZXRhJywgJ0V0YScsICdUaGV0YScsIFxyXG4gICAgJ0lvdGEnLCAnS2FwcGEnLCAnTGFtYmRhJywgJ011JywnbXUnLCAnTnUnLCAnWGknLCAnT21pY3JvbicsICdQaScsICdSaG8nLCBcclxuICAgICdTaWdtYScsICdUYXUnLCAnVXBzaWxvbicsICdQaGknLCAnQ2hpJywgJ1BzaScsICdPbWVnYSdcclxuXTtcclxuY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xyXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXHJcbiAgICAnYXRhbicsICdhcmNjb3MnLCAnYXJjc2luJywgJ2FyY3RhbicsICdjZG90J1xyXG5dXHJcblxyXG5mdW5jdGlvbiBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMoYXJyKSB7XHJcbiAgICBjb25zdCBzZXF1ZW5jZXMgPSBbXTtcclxuICAgIGxldCBzdGFydCA9IDA7XHJcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBhcnIubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoYXJyW2ldICE9PSBhcnJbaSAtIDFdICsgMSkge1xyXG4gICAgICAgICAgICBpZiAoaSAtIHN0YXJ0ID4gMSkge1xyXG4gICAgICAgICAgICAgICAgc2VxdWVuY2VzLnB1c2goYXJyLnNsaWNlKHN0YXJ0LCBpKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc3RhcnQgPSBpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBzZXF1ZW5jZXM7XHJcbn1cclxuXHJcblxyXG5jb25zdCBvcGVyYXRvcnNGb3JNYXRoaW5mbyA9IHtcclxuICAgIGJvdGhCdXRSaWdodEJyYWNrZXQ6IFtcIl5cIl0sXHJcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxyXG4gICAgYm90aDogW1wiK1wiLCBcIi1cIiwgXCIqXCJdLFxyXG4gICAgc3BlY2lhbDogW1wiPVwiXSxcclxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXHJcbiAgICBkb3VibGVSaWdodEJ1dEJyYWNrZXQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiLFwiL1wiXVxyXG59O1xyXG5jb25zdCBvcGVyYXRvclNpZGVzID0ge1xyXG4gICAgYm90aDogW1wiXlwiLCBcIitcIiwgXCItXCIsIFwiKlwiLCBcIi9cIiwgXCI9XCJdLFxyXG4gICAgcmlnaHRPbmx5OiBbXCJzcXJ0XCIsIFwic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxyXG4gICAgZG91YmxlUmlnaHQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiXVxyXG59O1xyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xyXG4gICAgZGVidWdJbmZvPVwiXCI7XHJcbiAgICBzb2x1dGlvbkluZm89W107XHJcbiAgICBtYXRoSW5mbz1bXVxyXG4gICAgZ3JhcGg9XCJcIjtcclxuICAgIGFkZEdyYXBoSW5mbyh2YWx1ZSl7XHJcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obXNnLCB2YWx1ZSl7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPSh0eXBlb2YgbXNnPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeShtc2cpOm1zZykrXCIgOiBcIisodHlwZW9mIHZhbHVlPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeSh2YWx1ZSk6dmFsdWUpKyBcIlxcbiBcIjtcclxuICAgIH1cclxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXMpe1xyXG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlNvbHZlZFwiLG1lcyk7XHJcbiAgICB9XHJcbiAgICBhZGRNYXRoSW5mbyh0b2tlbnMpe1xyXG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5wdXNoKHJlY29uc3RydWN0ZWRNYXRoKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFNvbHV0aW9uKHRva2Vucyxwb3NpdGlvbixzb2x1dGlvbil7XHJcbiAgICAgICAgc29sdXRpb249dG9rZW5zLnJlY29uc3RydWN0KFtzb2x1dGlvbl0pO1xyXG4gICAgICAgIGNvbnN0IGxlZnQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24uaW5kZXgpKTtcclxuICAgICAgICBjb25zdCByaWdodD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5pbmRleCsxLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhciwpKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0cnVlKXtcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoQnV0UmlnaHRCcmFja2V0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoL1xcKi9nLCBcIlxcXFxjZG90XCIpfSAke3JpZ2h0fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSBgXFxcXGZyYWN7JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8ucmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3J9ICgke3JpZ2h0fSkgPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKFwiL1wiLFwiZnJhY1wiKX17JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5hZGRTb2x1dGlvbkluZm8oc29sdXRpb24pO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XHJcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XHJcbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XHJcbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxyXG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxyXG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxyXG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcclxuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcclxuICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yLGxlZnQscmlnaHQpe1xyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiBsZWZ0LnZhbHVlIT09XCJudW1iZXJcIiYmIW9wZXJhdG9yU2lkZXMucmlnaHRPbmx5LmluY2x1ZGVzKG9wZXJhdG9yKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQudmFsdWUhPT1cIm51bWJlclwiKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmlnaHQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2UocG9zaXRpb24pIHtcclxuICAgIGxldCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xyXG4gICAgbGVmdD1sZWZ0LnRva2Vuc1xyXG4gICAgcmlnaHQ9cmlnaHQudG9rZW5zXHJcbiAgICBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcixsZWZ0LHJpZ2h0KTtcclxuICAgIFxyXG4gICAgbGV0IHNvbHZlZD17dmFsdWU6IDAsdmFyaWFibGU6IFwiXCIscG93OiBcIlwifTtcclxuICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcclxuICAgICAgICBjYXNlIFwic3FydFwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIl5cIjpcclxuICAgICAgICAgICAgaWYgKGxlZnQudmFyaWFibGV8fHJpZ2h0LnZhcmlhYmxlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZXx8bGVmdC52YXJpYWJsZT09PXJpZ2h0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU/cmlnaHQudmFyaWFibGU6XCJcIjtcclxuICAgICAgICAgICAgICAgIHNvbHZlZC5wb3c9MlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiZnJhY1wiOlxyXG4gICAgICAgIGNhc2UgXCIvXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChsZWZ0LnZhbHVlKS8ocmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiKlwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICogcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIGhhbmRsZVZyaWFibGVzKGxlZnQsIHJpZ2h0LHNvbHZlZCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCIrXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKyByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIi1cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAtIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYmlub21cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlQmlub20obGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJzaW5cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiY29zXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguY29zKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidGFuXCI6XHJcbiAgICAgICAgICAgIGlmIChyaWdodD49OTApe3Rocm93IG5ldyBFcnJvcihcInRhbiBNdXN0IGJlIHNtYWxsZXIgdGhhbiA5MFwiKTt9XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLnRhbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYXNpblwiOlxyXG4gICAgICAgIGNhc2UgXCJhcmNzaW5cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFzaW4ocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImFjb3NcIjpcclxuICAgICAgICBjYXNlIFwiYXJjY29zXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hY29zKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhdGFuXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY3RhblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbihyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDsgXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0LCByaWdodCwgc29sdmVkKSB7XHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcclxuICAgICAgICAgICAgLy8gS2VlcCB0aGVtIHNlcGFyYXRlIHNpbmNlIHRoZXkgaGF2ZSBkaWZmZXJlbnQgdmFyaWFibGVzXHJcbiAgICAgICAgICAgIHNvbHZlZC50ZXJtcyA9IFtcclxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxyXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogcmlnaHQudmFyaWFibGUsIHBvdzogcmlnaHQucG93IHx8IDEsIHZhbHVlOiByaWdodC52YWx1ZSB8fCAxIH1cclxuICAgICAgICAgICAgXTtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlmZmVyZW50IHZhcmlhYmxlIGJhc2VzIGF0IHBvd2VyIG11bHRpcGxpY2F0aW9uLiBJIGRpZG4ndCBnZXQgdGhlcmUgeWV0XCIpXHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgIHNvbHZlZC52YXJpYWJsZSA9IHZhcmlhYmxlLmxlbmd0aD4wP3ZhcmlhYmxlOnVuZGVmaW5lZDtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcclxuICAgICAgICBwb3c9bGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSYmcG93PT09MCYmIWxlZnQucG93JiYhcmlnaHQucG93PzI6cG93O1xyXG4gICAgICAgIHNvbHZlZC5wb3cgPSBwb3cgfHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICAvLyBSdWxlIDM6IEhhbmRsZSBtdWx0aXBsaWNhdGlvbiBvZiBjb25zdGFudHNcclxuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgcmlnaHRWYWx1ZSA9IHJpZ2h0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSBsZWZ0VmFsdWUgKiByaWdodFZhbHVlO1xyXG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcclxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVnJpYWJsZXMobGVmdCxyaWdodCxzb2x2ZWQpe1xyXG4gICAgICAgIGxldCBoYW5kbGVkPXtWYXI6bnVsbCxQb3c6bnVsbH07XHJcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICByZXR1cm4gO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSE9PXJpZ2h0LnZhcmlhYmxlKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVHdvIHZhcmlhYmxlIGVxdWF0aW9ucyBhcmVuJ3QgYWNjZXB0ZWQgeWV0XCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL2hhbmRsZWQuVmFyPWxlZnQudmFyO1xyXG4gICAgICAgIC8vc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyXHJcblxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV9XHJcbiAgICAgICAgZWxzZSBpZiAoIWxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGV9XHJcbiAgICAgICAgZWxzZSBpZiAobGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZTtzb2x2ZWQucG93PTJ9XHJcbiAgICAgICAgKi9cclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogc29sdmVkLnBvdz8gXCJwb3dlclZhcmlhYmxlXCI6c29sdmVkLnZhcmlhYmxlPyBcInZhcmlhYmxlXCI6IFwibnVtYmVyXCIsXHJcbiAgICAgICAgdmFsdWU6IHNvbHZlZC52YWx1ZSwgXHJcbiAgICAgICAgdmFyaWFibGU6IHNvbHZlZC52YXJpYWJsZT9zb2x2ZWQudmFyaWFibGU6XCJcIixcclxuICAgICAgICBwb3c6IHNvbHZlZC5wb3c/c29sdmVkLnBvdzpcIlwiLFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIHtcclxuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLCBlbmQsIHRva2VucywgcmVnZXgpIHtcclxuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMudG9rZW5zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBsZXQgaW5kZXg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocmVnZXgpIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybiAtMTtcclxuICAgIFxyXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4IC0gMV0udHlwZSA9PT0gdG9rZW5zLnRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiAtMTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aCxqPTA7XHJcbiAgICBsZXQgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgbGV0IGNoZWNrZWRJRHMgPSBbXTsgIFxyXG4gICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTtcclxuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCYmajwyMDApIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy50b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaisrO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zLnRva2Vuc1tpXS5pZCkpIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2ldLmlkKTsgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50SUQhPT1udWxsJiZpPT09Y3VycmVudElELmNsb3NlKSB7XHJcbiAgICAgICAgICAgICAgICBbYmVnaW4sZW5kXT1bY3VycmVudElELm9wZW4sY3VycmVudElELmNsb3NlXVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgYmVnaW4gPSAwO1xyXG4gICAgICAgICAgICBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aDtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xyXG5cclxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxyXG4gICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxyXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGo+PTIwMCl7dGhyb3cgbmV3IEVycm9yKFwib3BlcmF0aW9uc09yZGVyIEZhaWxlZCBleGNlZWRlZCAyMDAgcmV2aXNpb25zXCIpO31cclxuICAgIC8vIEZpbmQgaW5kaWNlcyBiYXNlZCBvbiBvcGVyYXRvciBwcmVjZWRlbmNlXHJcbiAgICBsZXQgcHJpb3JpdHkxID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLC8oXFxefHNxcnQpLyk7XHJcbiAgICBsZXQgcHJpb3JpdHkyID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKGZyYWN8Ymlub218c2lufGNvc3x0YW58YXNpbnxhY29zfGF0YW4pLyk7XHJcbiAgICBsZXQgcHJpb3JpdHkzID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKFxcKnxcXC8pLyk7XHJcbiAgICBsZXQgcHJpb3JpdHk0ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvWystXS8pO1xyXG4gICAgbGV0IHByaW9yaXR5NSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLz0vKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NV0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xyXG4gICAgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFwcGx5UG9zaXRpb24odG9rZW5zLCBpbmRleCwgZGlyZWN0aW9uKSB7XHJcbiAgICBsZXQgYnJlYWtDaGFyPWluZGV4XHJcbiAgICBsZXQgdGFyZ2V0O1xyXG4gICAgbGV0IG11bHRpU3RlcD1mYWxzZTtcclxuICAgIGNvbnN0IGlzTGVmdCA9IGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCI7XHJcbiAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcclxuICAgIGlmICgoaXNMZWZ0ICYmIGluZGV4IDw9IDApIHx8ICghaXNMZWZ0ICYmIGluZGV4ID49IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkgfHwgIXRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIiBpbmRleDogXCIraW5kZXgpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKSB7XHJcbiAgICAgICAgY29uc3QgcGFyZW5JbmRleCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLmlkKTtcclxuICAgICAgICBicmVha0NoYXIgPSAgaXNMZWZ0ID8gcGFyZW5JbmRleC5vcGVuIDogcGFyZW5JbmRleC5jbG9zZSsxO1xyXG4gICAgICAgIC8vdGFyZ2V0ID0gdG9rZW5zLnRva2Vucy5zbGljZShpc0xlZnQgPyBicmVha0NoYXIgOiBpbmRleCArIDEsIGlzTGVmdCA/IGluZGV4IDogYnJlYWtDaGFyKTtcclxuICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zLnNsaWNlKHBhcmVuSW5kZXgub3BlbiwgcGFyZW5JbmRleC5jbG9zZSsxKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYnJlYWtDaGFyPWluZGV4K2luZGV4TW9kaWZpZXI7XHJcbiAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vuc1ticmVha0NoYXJdO1xyXG4gICAgICAgIGJyZWFrQ2hhcis9aXNMZWZ0PzA6MVxyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgLy9jb25zdCBtdWx0aVN0ZXAgPSBNYXRoLmFicyhicmVha0NoYXIgLSBpbmRleCkgPiAzO1xyXG5cclxuICAgIGlmICghbXVsdGlTdGVwJiZ0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIil7XHJcbiAgICAgICAgLy90YXJnZXQ9dGFyZ2V0LmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxyXG4gICAgfVxyXG4gICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgYXQgYXBwbHlQb3NpdGlvbjogY291bGRuJ3QgZmluZCB0YXJnZXQgdG9rZW4gZm9yIGRpcmVjdGlvbiAke2RpcmVjdGlvbn0gYW5kIG9wZXJhdG9yXCIke3Rva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XHJcbiAgICAvL2RlbGV0ZSB0YXJnZXQuaW5kZXhcclxuICAgIFxyXG4gICAgaWYgKHRhcmdldC5sZW5ndGg9PT0zKXtcclxuICAgICAgICB0YXJnZXQ9dGFyZ2V0LmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxyXG4gICAgfWVsc2UgaWYodGFyZ2V0Lmxlbmd0aD4xKW11bHRpU3RlcD10cnVlXHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0b2tlbnM6IHRhcmdldCxcclxuICAgICAgICBtdWx0aVN0ZXA6IG11bHRpU3RlcCxcclxuICAgICAgICBicmVha0NoYXI6IGJyZWFrQ2hhclxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBQb3NpdGlvbiB7XHJcbiAgICBvcGVyYXRvcjtcclxuICAgIGluZGV4O1xyXG4gICAgdHJhbnNpdGlvbjtcclxuICAgIHNwZWNpYWxDaGFyO1xyXG4gICAgbGVmdD0gbnVsbDtcclxuICAgIHJpZ2h0PSBudWxsO1xyXG4gICAgY29uc3RydWN0b3IodG9rZW5zLCBpbmRleCl7XHJcbiAgICAgICAgdGhpcy5pbmRleD1pbmRleDtcclxuICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmluZGV4XHJcbiAgICAgICAgdGhpcy5wb3NpdGlvbih0b2tlbnMpXHJcbiAgICB9XHJcbiAgICBwb3NpdGlvbih0b2tlbnMpIHtcclxuICAgICAgICB0aGlzLmluZGV4ID0gdGhpcy5pbmRleCA9PT0gbnVsbCA/IG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIDogdGhpcy5pbmRleDtcclxuICAgICAgICBpZiAodGhpcy5pbmRleCA9PT0gbnVsbCB8fCB0aGlzLmluZGV4ID09PSB0b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5vcGVyYXRvciA9IHRva2Vucy50b2tlbnNbdGhpcy5pbmRleF0udmFsdWU7XHJcbiAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5ib3RoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJsZWZ0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLnJpZ2h0T25seS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHticmVha0NoYXI6IHRoaXMuaW5kZXh9O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLmRvdWJsZVJpZ2h0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMubGVmdC5icmVha0NoYXI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMudHJhbnNpdGlvbi0xLFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQuYnJlYWtDaGFyKyh0aGlzLnJpZ2h0Lm11bHRpU3RlcD8xOjApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dGhpcy5vcGVyYXRvcn0gd2FzIG5vdCBhY2NvdW50ZWQgZm9yLCBvciBpcyBub3QgdGhlIHZhbGlkIG9wZXJhdG9yYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc3BlY2lhbENoYXI9dG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA/IHRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA6IG51bGw7XHJcbiAgICB9XHJcbiAgICBjaGVja011bHRpU3RlcCgpe1xyXG4gICAgICAgIHJldHVybiAodGhpcy5sZWZ0Lm11bHRpU3RlcHx8dGhpcy5yaWdodC5tdWx0aVN0ZXApJiZ0aGlzLm9wZXJhdG9yPT09JyonO1xyXG4gICAgfVxyXG4gICAgaXNMZWZ0VmFyKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXA/dGhpcy5sZWZ0LnRva2Vucy5zb21lKHQ9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5sZWZ0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcclxuICAgIH1cclxuICAgIGlzUmlnaHRWYXIoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5yaWdodC5tdWx0aVN0ZXA/dGhpcy5yaWdodC50b2tlbnMuc29tZSh0PT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMucmlnaHQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxyXG4gICAgfVxyXG4gICAgY2hlY2tGcmFjKCl7Ly8hdGhpcy5jaGVja011bHRpU3RlcCgpIEkgZG9uJ3Qga25vdyB3aHkgSSBoYWQgdGhpcyBoZXJlXHJcbiAgICAgICAgcmV0dXJuIC8oZnJhY3xcXC8pLy50ZXN0KHRoaXMub3BlcmF0b3IpJiYodGhpcy5pc0xlZnRWYXIoKXx8dGhpcy5pc1JpZ2h0VmFyKCkpXHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zKXtcclxuICAgIGlmICh0b2tlbnMubGVuZ3RoPD0xKXtyZXR1cm4gdG9rZW5zfVxyXG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XHJcbiAgICB3aGlsZSAoaTw9MTAwJiZ0b2tlbnMuc29tZSh0b2tlbiA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKSlcclxuICAgIHtcclxuICAgICAgICBpKys7XHJcbiAgICAgICAgbGV0IGVxaW5kZXg9dG9rZW5zLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xyXG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuKSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcclxuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxyXG5cclxuICAgICAgICBsZXQgbnVtYmVyR3JvdXAgPSB0b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbiwgaSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxyXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtLnRva2VuLnR5cGU9PT1jdXJyZW50VG9rZW4udHlwZSkgXHJcbiAgICAgICAgLnJlZHVjZSgoc3VtLCBpdGVtKSA9PiB7XHJcbiAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09IFwiLVwiKSA/IC0xIDogMTtcclxuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxyXG4gICAgICAgIGlmICghKC8obnVtYmVyKS8pLnRlc3QoaXRlbS50b2tlbi50eXBlKSl7bXVsdGlwbGllcio9LTF9XHJcbiAgICAgICAgcmV0dXJuIHN1bSArIChpdGVtLnRva2VuLnZhbHVlICogbXVsdGlwbGllcik7XHJcbiAgICAgICAgfSwgMCk7IFxyXG4gICAgICAgIFxyXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKHtcclxuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxyXG4gICAgICAgICAgICB2YWx1ZTogbnVtYmVyR3JvdXBcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdG9rZW5zID0gdG9rZW5zLmZpbHRlcih0b2tlbiA9PiBcclxuICAgICAgICAgICAgdG9rZW4udHlwZSAhPT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXHJcbiAgICAgICAgICAgICh0b2tlbi5wb3cgJiYgdG9rZW4ucG93ICE9PSBjdXJyZW50VG9rZW4ucG93KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV3VG9rZW5zO1xyXG59XHJcbi8qXHJcbmlmICghYXJlVGhlcmVPcGVyYXRvcnMpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTAmJnZhcmlhYmxlSW5kZXgubGVuZ3RoIT09MCYmbnVtYmVySW5kZXghPT0wKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWF0aEluZm8uYWRkU29sdXRpb25JbmZvKGAke3ZhcmlhYmxlSW5kZXhbMF0udmFyaWFibGV9ID0gXFxcXGZyYWN7JHtudW1iZXJJbmRleFswXS52YWx1ZX19eyR7dmFyaWFibGVJbmRleFswXS52YWx1ZX19ID0gJHsobnVtYmVySW5kZXhbMF0udmFsdWUpLyh2YXJpYWJsZUluZGV4WzBdLnZhbHVlKX1gKVxyXG4gICAgICAgICAgICByZXR1cm4gYCR7dmFyaWFibGVJbmRleFswXS52YXJpYWJsZX0gPSAkeyhudW1iZXJJbmRleFswXS52YWx1ZSkvKHZhcmlhYmxlSW5kZXhbMF0udmFsdWUpfWBcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZih0b2tlbnMubGVuZ3RoPT09MSYmbnVtYmVySW5kZXgpe1xyXG4gICAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkobnVtYmVySW5kZXgudmFsdWU9PT0wKVxyXG4gICAgICAgIH1cclxufSovXHJcblxyXG5mdW5jdGlvbiBwcmFpc2luZ01ldGhvZCh0b2tlbnMpe1xyXG4gICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcclxuICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxyXG4gICAgICAgIHJldHVybiAncXVhZHJhdGljJztcclxuICAgIFxyXG4gICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTAmJnZhcmlhYmxlSW5kZXgubGVuZ3RoIT09MCYmbnVtYmVySW5kZXghPT0wKVxyXG4gICAgICAgIHJldHVybiAnaXNvbGF0JztcclxuICAgIFxyXG4gICAgaWYodG9rZW5zLmxlbmd0aD09PTEmJm51bWJlckluZGV4KSByZXR1cm4gJ2lzSnVzdE51bWJlcic7XHJcblxyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhQcmFpc2Vye1xyXG4gICAgaW5wdXQ9XCJcIjtcclxuICAgIHRva2Vucz1bXTtcclxuICAgIHNvbHV0aW9uPVwiXCI7XHJcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihpbnB1dCl7XHJcbiAgICAgICAgdGhpcy5pbnB1dD1pbnB1dDtcclxuICAgICAgICB0aGlzLnByb2Nlc3NJbnB1dCgpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zPW5ldyBUb2tlbnModGhpcy5pbnB1dCk7XHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJUb2tlbnMgYWZ0ZXIgdG9rZW5pemVcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbj10aGlzLmNvbnRyb2xsZXIoKTtcclxuICAgIH1cclxuICAgIGdldFJlZHlmb3JOZXdSb25kKCl7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuY29ubmVjdE5lYXJieVRva2VucygpO1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkTWF0aEluZm8odGhpcy50b2tlbnMpXHJcbiAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyh0aGlzLnRva2Vucy50b2tlbnMsdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aClcclxuICAgICAgICB0aGlzLnRva2Vucy5leHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpO1xyXG4gICAgfVxyXG4gICAgY29udHJvbGxlcigpe1xyXG4gICAgICAgIHRoaXMuZ2V0UmVkeWZvck5ld1JvbmQoKTtcclxuICAgICAgICBpZiAodGhpcy5zaG91bGRVc2VQb3NpdGlvbigpKXtcclxuICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy50b2tlbnMsbnVsbCk7XHJcbiAgICAgICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUGFyc2VkIGV4cHJlc3Npb25cIiwgSlNPTi5zdHJpbmdpZnkocG9zaXRpb24sIG51bGwsIDEpKTtcclxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uID09PSBudWxsJiZ0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjEpe1xyXG4gICAgICAgICAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyhcInBhcnNlKHRva2VucylcIixwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGhlICoqKipcIlxyXG4gICAgICAgICAgICAvLyByZXR1cm4gc29sdXRpb24odG9rZW5zKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChwb3NpdGlvbi5pbmRleCA9PT0gbnVsbCl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5maW5hbFJldHVybigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWMoKXx8cG9zaXRpb24uY2hlY2tNdWx0aVN0ZXAoKSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyh0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCh0aGlzLnRva2Vucy50b2tlbnMpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy51c2VQYXJzZShwb3NpdGlvbilcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgY29uc3QgbWV0aG9kPXByYWlzaW5nTWV0aG9kKHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgaWYgKG1ldGhvZD09PSdxdWFkcmF0aWMnKXtcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnRva2Vucz1zaW1wbGlmaXkodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgICAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuICAgICAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcXVhZChcclxuICAgICAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0/LnZhbHVlICB8IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0/LnZhbHVlIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0/LnZhbHVlICogLTF8IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdLnZhcmlhYmxlLFxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vaWYgKHNvbHZlZCA9PT0gbnVsbHx8dHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7XHJcbiAgICB9XHJcbiAgICB1c2VQYXJzZShwb3NpdGlvbil7XHJcbiAgICAgICAgY29uc3Qgc29sdmVkID0gcGFyc2UocG9zaXRpb24pO1xyXG5cclxuICAgICAgICAvL3RoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxyXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXHJcbiAgICAgICAgdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKGxlZnRCcmVhayxsZW5ndGgsc29sdmVkKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgfVxyXG5cclxuICAgIHNob3VsZFVzZVBvc2l0aW9uKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnRva2Vucy5zb21lKHRva2VuPT4vKG9wZXJhdG9yKS8udGVzdCh0b2tlbi50eXBlKSYmIS8oPSkvLnRlc3QodG9rZW4udmFsdWUpKVxyXG4gICAgfVxyXG5cclxuICAgIGFkZERlYnVnSW5mbyhtZXMsdmFsdWUpe1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSlcclxuICAgIH1cclxuICAgIHByb2Nlc3NJbnB1dCgpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy5pbnB1dFxyXG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXHJcbiAgICAgICAgLnJlcGxhY2UoL3svZywgXCIoXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoLyhjZG90KS9nLCBcIipcIilcclxuICAgICAgICAvLy5yZXBsYWNlKC8oPzwhXFxcXHxbYS16QS1aXSkodGFufHNpbnxjb3N8Ymlub218ZnJhY3xhc2lufGFjb3N8YXRhbnxhcmNjb3N8YXJjc2lufGFyY3RhbnxjZG90KS9nLCBcIlxcXFwkMVwiKTtcclxuICAgIH1cclxuICAgIGZpbmFsUmV0dXJuKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIFRva2Vuc3tcclxuICAgIHRva2Vucz1bXTtcclxuICAgIGNvbnN0cnVjdG9yKG1hdGgpe1xyXG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XHJcbiAgICB9XHJcbiAgICB0b2tlbml6ZShtYXRoKXtcclxuICAgICAgICBsZXQgdG9rZW5zID0gW107XHJcbiAgICAgICAgbGV0IGJyYWNrZXRzID0gMCwgIGxldmVsQ291bnQgPSB7fTtcclxuICAgICAgICBsZXQgaj0wO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBqKys7XHJcbiAgICAgICAgICAgIGlmKGo+NTAwKXticmVhazt9XHJcbiAgICAgICAgICAgIGxldCBudW1iZXI9MCx2YXJpPVwiXCI7XHJcblxyXG4gICAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gXCIoXCJ8fG1hdGhbaV0gPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwicGFyZW5cIiwgdmFsdWU6IG1hdGhbaV0sfSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbGV0IG1hdGNoPW1hdGguc2xpY2UoaSkubWF0Y2gocmVnRXhwKCdeJythcnJUb1JlZ2V4U3RyaW5nKGxhdGV4T3BlcmF0b3JzKSkpO1xyXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgbGV0IG9wZXJhdG9yID0gbWF0Y2hbMF1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBvcGVyYXRvcn0pO1xyXG4gICAgICAgICAgICAgICAgaSs9b3BlcmF0b3IubGVuZ3RoLTE7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09IFwic3FydFwiICYmIG1hdGhbaV0gPT09IFwiW1wiICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcclxuICAgICAgICAgICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxyXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBudW1iZXI9bWF0Y2hbMF1cclxuICAgICAgICAgICAgICAgIGkrPW51bWJlci5sZW5ndGg+MT9udW1iZXIubGVuZ3RoLTE6MDtcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJudW1iZXJcIiwgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKX0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmICgvW2EtekEtWl0vLnRlc3QobWF0aFtpXSkpIHtcclxuICAgICAgICAgICAgICAgIHZhcmk9IChtYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLykgfHwgW1wiXCJdKVswXTtcclxuICAgICAgICAgICAgICAgIGlmICh2YXJpJiZ2YXJpLmxlbmd0aD09PTApe3Zhcmk9bWF0aC5zbGljZShpLG1hdGgubGVuZ3RoKX1cclxuICAgICAgICAgICAgICAgIGkrPXZhcmkubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHt0eXBlOiBcInZhcmlhYmxlXCIsdmFyaWFibGU6IHZhcmkucmVwbGFjZShcIihcIixcIntcIikucmVwbGFjZShcIilcIixcIn1cIiksdmFsdWU6IDF9KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoL1sqL149Ky1dLy50ZXN0KG1hdGhbaV0pKSB7XHJcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwib3BlcmF0b3JcIiwgdmFsdWU6IG1hdGhbaV19KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2VucztcclxuICAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICB2YWxpZGF0ZUluZGV4KGluZGV4LG1hcmdpbil7XHJcbiAgICAgICAgbWFyZ2luPW1hcmdpbj9tYXJnaW46MDtcclxuICAgICAgICByZXR1cm4gaW5kZXg+MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC0xLW1hcmdpbjtcclxuICAgIH1cclxuICAgIHZhbGlkYXRlUE0obWFwKXtcclxuICAgICAgICBtYXAuZm9yRWFjaChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIGluZGV4PXRoaXMudmFsaWRhdGVJbmRleChpbmRleCwxKSYmdGhpcy50b2tlbnNbaW5kZXgtMV0udHlwZT09PSdvcGVyYXRvcid8fHRoaXMudG9rZW5zW2luZGV4KzFdLnR5cGU9PT0nb3BlcmF0b3InP251bGw6aW5kZXg7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG1hcFxyXG4gICAgfVxyXG4gICAgdmFsaWRhdGVQYXJlbihtYXApe1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1tpbmRleF0udHlwZS5tYXRjaCh0aGlzLnZhbHVlVG9rZW5zKCkpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy5yZUlEcGFyZW50aGVzZXMoKTtcclxuXHJcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gKHRva2VuLnR5cGU9PT0nbnVtYmVyJ3x8dG9rZW4udHlwZT09PSd2YXJpYWJsZScpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgYXJyPWZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhtYXApO1xyXG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1hcENhcnJvdD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnZhbHVlPT09J14nJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbClcclxuXHJcblxyXG4gICAgICAgIGxldCBtYXBQTT10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnZhbHVlPT09JysnfHx0b2tlbi52YWx1ZT09PSctJz9pbmRleDpudWxsKS5maWx0ZXIoaW5kZXg9PiBpbmRleCE9PW51bGwpXHJcbiAgICAgICAgbWFwUE09dGhpcy52YWxpZGF0ZVBNKG1hcFBNKVxyXG5cclxuICAgICAgICBtYXBQTS5yZXZlcnNlKCkuZm9yRWFjaChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlPXRoaXMudG9rZW5zW2luZGV4XS52YWx1ZT09PScrJz8xOi0xO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleCsxXS52YWx1ZSo9dmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IGlkeD10aGlzLmZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1tpbmRleCsxXS52YWx1ZT09PScoJyYmKGlkeD09PTB8fCEvKGZyYWN8Ymlub20pLy50ZXN0KHRoaXMudG9rZW5zW2lkeC0xXS52YWx1ZSkpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgLy9NYXAgcGFyZW50aGVzZXMgZm9yIGltcGxpY2l0IG11bHRpcGxpY2F0aW9uLlxyXG4gICAgICAgIGNvbnN0IG1hcFBhcmVuID0gdGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB7IFxyXG4gICAgICAgICAgICAgICAgLy8gXHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8ICh0b2tlbi50eXBlID09PSAnb3BlcmF0b3InICYmICEvWytcXC0qL149XS8udGVzdCh0b2tlbi52YWx1ZSkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSBcIilcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8dGVzdERvdWJsZVJpZ2h0KGluZGV4KT8gaW5kZXgrMSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBtYXBQYXJlbi5zb3J0KChhLCBiKSA9PiBiIC0gYSlcclxuICAgICAgICAuZm9yRWFjaCh2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgeyB0eXBlOiAnb3BlcmF0b3InLCB2YWx1ZTogJyonLCBpbmRleDogMCB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy9JbXBsaWNpdCBwb3dlcnNcclxuICAgICAgICBcclxuICAgIH1cclxuXHJcbiAgICBtYXBQYXJlbkluZGV4ZXMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLnZhbHVlID09PSBcIihcIiA/IHRoaXMuZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcclxuICAgICAgICAgICAgaWYgKG9wZW5JbmRleD4wKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoL29wZXJhdG9yfHBhcmVuLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdLnR5cGUpKSB7Ly8gJiYgcHJldlRva2VuLnZhbHVlICE9PSBcIj1cIlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChjbG9zZUluZGV4PHRoaXMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHRoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXS52YWx1ZSAhPT0gXCI9XCIpIHsvL3RoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgLypcclxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICAgfSovXHJcblxyXG4gICAgIHZhbHVlVG9rZW5zKCl7cmV0dXJuIC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpL31cclxuXHJcbiAgICBjb25uZWN0TmVhcmJ5VG9rZW5zKCl7XHJcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLm1hcFBhcmVuSW5kZXhlcygpLmZsYXRNYXAoKHsgb3BlbiwgY2xvc2UgfSkgPT4gW29wZW4sIGNsb3NlXSkpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICFtYXAuaGFzKGlkeCkpO1xyXG5cclxuICAgICAgICBjb25zdCBjaGVjaz0oaW5kZXgpPT4odGhpcy50b2tlbnNbaW5kZXgtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIiYmdGhpcy50b2tlbnNbaW5kZXgrMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcclxuXHJcbiAgICAgICAgY29uc3QgbnVtTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udHlwZT09PSdudW1iZXInJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBjb25zdCB2YXJNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi50eXBlPT09J3ZhcmlhYmxlJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgcG93TWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udHlwZT09PSdwb3dlclZhcmlhYmxlJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXHJcblxyXG4gICAgICAgIGNvbnN0IGFyciA9IFtcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXModmFyTWFwKSwgXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhwb3dNYXApXHJcbiAgICAgICAgXTtcclxuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnJlSURwYXJlbnRoZXNlcyh0aGlzLnRva2VucylcclxuICAgIH1cclxuXHJcbiAgICBjb25uZWN0QW5kQ29tYmluZShhcnIpe1xyXG4gICAgICAgIGNvbnN0IGluZGV4ZXM9W11cclxuICAgICAgICBhcnIuc29ydCgoYSwgYikgPT4gYlswXSAtIGFbMF0pLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBpbmRleGVzLnB1c2goe3N0YXJ0OiBlbFswXSxlbmQ6IGVsW2VsLmxlbmd0aCAtIDFdfSlcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBpbmRleGVzLmZvckVhY2goaW5kZXggPT4ge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBOdW1iZXIodGhpcy50b2tlbnNbaW5kZXguc3RhcnRdLnZhbHVlKTtcclxuICAgICAgICAgICAgY29uc3QgaXNWYXI9dGhpcy50b2tlbnMuc2xpY2UoaW5kZXguc3RhcnQsaW5kZXguZW5kKzEpLmZpbmQodG9rZW49PiB0b2tlbi50eXBlLmluY2x1ZGVzKCd2YXInKSk7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGk9aW5kZXguc3RhcnQrMTtpPD1pbmRleC5lbmQ7aSsrKXtcclxuICAgICAgICAgICAgICAgdmFsdWUgPSAoaXNWYXIgPyAodGhpcy50b2tlbnNbaV0udmFsdWUgKiB2YWx1ZSkgOiAodGhpcy50b2tlbnNbaV0udmFsdWUgKyB2YWx1ZSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IHVwZGF0ZWRUb2tlbiA9IHRoaXMubmV3T2JqKHZhbHVlLGlzVmFyPy52YXJpYWJsZSlcclxuXHJcbiAgICAgICAgICAgIGlmIChpc1Zhcil1cGRhdGVkVG9rZW4udmFyaWFibGU9aXNWYXIudmFyaWFibGVcclxuXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4LnN0YXJ0XSA9IHVwZGF0ZWRUb2tlbjtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LnN0YXJ0KzEsIGluZGV4LmVuZCAtIGluZGV4LnN0YXJ0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIG5ld09iaih2YWx1ZSx2YXJpYWJsZSl7XHJcbiAgICAgICAgY29uc3Qgb2JqPXtpbmRleDowfVxyXG4gICAgICAgIG9iai50eXBlPXZhcmlhYmxlPyd2YXJpYWJsZSc6J251bWJlcic7XHJcbiAgICAgICAgb2JqLnZhbHVlPXZhbHVlXHJcbiAgICAgICAgaWYodmFyaWFibGUpb2JqLnZhcmlhYmxlPXZhcmlhYmxlXHJcbiAgICAgICAgcmV0dXJuIG9iajtcclxuICAgIH1cclxuXHJcbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXHJcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcclxuICAgICAgICApXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgIH1cclxuICAgIGluc2VydFRva2VucyhzdGFydCwgbGVuZ3RoLCBvYmplY3RzKSB7XHJcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XHJcbiAgICB9XHJcbiAgICByZWNvbnN0cnVjdCh0b2tlbnMpe1xyXG4gICAgICAgIGlmICh0b2tlbnM9PT11bmRlZmluZWQpe1xyXG4gICAgICAgICAgICB0b2tlbnM9dGhpcy50b2tlbnM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCBtYXRoID0gXCJcIjtcclxuICAgICAgICBmb3IgKGxldCBpPTA7aTx0b2tlbnMubGVuZ3RoO2krKyl7XHJcbiAgICAgICAgICAgIGxldCB0ZW1wO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlPT09XCIoXCImJnRva2Vuc1t0b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi5pZCA9PT0gdG9rZW5zW2ldLmlkJiZ0b2tlbnNbaW5kZXgrMV0pKzFdLnZhbHVlPT09XCIvXCIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG1hdGgrPVwiXFxcXGZyYWNcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzd2l0Y2ggKHRva2Vuc1tpXS50eXBlKXtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJudW1iZXJcIjpcclxuICAgICAgICAgICAgICAgICAgICB0ZW1wPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpK3JvdW5kQnlTZXR0aW5ncyh0b2tlbnNbaV0udmFsdWUpXHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9dGVtcCsoaSsxPHRva2Vucy5sZW5ndGgmJi8oZnJhYykvLnRlc3QodG9rZW5zW2krMV0udmFsdWUpP1wiK1wiOlwiXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInBhcmVuXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGVtcD10b2tlbnNbdGhpcy5maW5kUGFyZW5JbmRleCh0b2tlbnNbaV0uaWQpLm9wZW4tMV1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHRlbXAgIT09IFwidW5kZWZpbmVkXCIgJiYgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICgoY3VybHlCcmFja2V0c1JlZ2V4LnRlc3QodGVtcC52YWx1ZSkpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAoL1xcKS8udGVzdCh0ZW1wLnZhbHVlKSAmJiBjdXJseUJyYWNrZXRzUmVnZXgudGVzdCh0b2tlbnNbdGhpcy5maW5kUGFyZW5JbmRleCh0ZW1wLmlkKS5vcGVuIC0gMV0udmFsdWUpKSkpIFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0aCArPSB0b2tlbnNbaV0udmFsdWUucmVwbGFjZSgvXFwoLywgXCJ7XCIpLnJlcGxhY2UoL1xcKS8sIFwifVwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaT4wJiZ0b2tlbnNbaV0udmFsdWU9PT1cIihcIiYmdG9rZW5zW2ktMV0/LnZhbHVlPT09XCIpXCIpe21hdGgrPVwiK1wifVxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJvcGVyYXRvclwiOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlICE9PSBcIi9cIikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoKz0odG9rZW5zW2ldLnZhbHVlKS5yZXBsYWNlKC8oW14qXj0vKy1dKS8sXCJcXFxcJDFcIikucmVwbGFjZSgvXFwqL2csXCJcXFxcY2RvdCBcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpKyh0b2tlbnNbaV0udmFsdWUhPT0xP3Rva2Vuc1tpXS52YWx1ZTpcIlwiKSt0b2tlbnNbaV0udmFyaWFibGU7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwicG93ZXJWYXJpYWJsZVwiOlxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpKyh0b2tlbnNbaV0udmFsdWUhPT0xP3Rva2Vuc1tpXS52YWx1ZTpcIlwiKSt0b2tlbnNbaV0udmFyaWFibGUrYF57JHt0b2tlbnNbaV0ucG93fX1gO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgdG9raW4gdHlwZSBnaXZlbiB0byByZWNvbnN0cnVjdDogdHlwZSAke3Rva2Vuc1tpXS50eXBlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRoXHJcbiAgICB9XHJcbiAgICBmaW5kUGFyZW5JbmRleChpZCxpbmRleCl7XHJcbiAgICAgICAgdHJ5e1xyXG4gICAgICAgICAgICBpZD1pZD9pZDp0aGlzLnRva2Vuc1tpbmRleF0uaWQ7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wZW49dGhpcy50b2tlbnMuZmluZEluZGV4KFxyXG4gICAgICAgICAgICAgICAgdG9rZW49PnRva2VuLnZhbHVlPT09XCIoXCJcclxuICAgICAgICAgICAgICAgICYmdG9rZW4uaWQ9PT1pZFxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlPXRoaXMudG9rZW5zLmZpbmRMYXN0SW5kZXgoXHJcbiAgICAgICAgICAgICAgICB0b2tlbj0+dG9rZW4udmFsdWU9PT1cIilcIlxyXG4gICAgICAgICAgICAgICAgJiZ0b2tlbi5pZD09PWlkXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICAgcmV0dXJue29wZW46IG9wZW4sY2xvc2U6IGNsb3NlLGlkOmlkfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaChlKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZSwgdmFsdWUsIHRva2VuLCBuZXh0VG9rZW4pIHtcclxuICAgICAgICB2YWx1ZSA9IHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcclxuICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXHJcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVJRHBhcmVudGhlc2VzKCkge1xyXG4gICAgICAgIGxldCB0b2tlbnM9dGhpcy50b2tlbnNcclxuICAgICAgICBsZXQgYnJhY2tldHMgPSAwLCBsZXZlbENvdW50ID0ge307XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIpIHtcclxuICAgICAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xyXG4gICAgICAgICAgICAgICAgLy8gUmVhc3NpZ24gdGhlIG9iamVjdCB3aXRoIHRoZSBuZXcgaWQgdG8gZW5zdXJlIHBlcnNpc3RlbmNlXHJcbiAgICAgICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyBJRCB9O1xyXG4gICAgICAgICAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cy0tO1xyXG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xyXG4gICAgICAgICAgICAgICAgLy8gUmVhc3NpZ24gdGhlIG9iamVjdCB3aXRoIHRoZSBuZXcgaWQgdG8gZW5zdXJlIHBlcnNpc3RlbmNlXHJcbiAgICAgICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyAoSUQgPj0gMCA/IElEIDogMCkgfTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChicmFja2V0cyE9PTApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvL3Rocm93IG5ldyBFcnJvciAoXCJVbm1hdGNoZWQgb3BlbmluZyBicmFja2V0KHMpIGVyciByYXRlOiBcIiticmFja2V0cylcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zO1xyXG4gICAgfVxyXG59XHJcblxyXG5jb25zdCBwbHVzU3ltYm9sQ2hlY2sgPSAodG9rZW5zLCBpbmRleCkgPT4ge1xyXG4gICAgaWYgKCFpbmRleCA+IDApIHJldHVybiBmYWxzZTtcclxuICAgIHJldHVybiB0b2tlbnNbaW5kZXhdLnZhbHVlID49IDAgJiYgLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udHlwZSk7XHJcbn07XHJcblxyXG5cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmbGF0dGVuQXJyYXkoYXJyKSB7XHJcbiAgICBsZXQgcmVzdWx0ID0gW107XHJcbiAgICBsZXQgc3RhY2sgPSBBcnJheS5pc0FycmF5KGFycikgPyBbLi4uYXJyXSA6IFthcnJdOyAgLy8gRW5zdXJlIGFyciBpcyBhbiBhcnJheSBvciB3cmFwIGl0IGluIG9uZVxyXG5cclxuICAgIHdoaWxlIChzdGFjay5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCBuZXh0ID0gc3RhY2sucG9wKCk7XHJcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobmV4dCkpIHtcclxuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5uZXh0KTsgIC8vIFNwcmVhZCB0aGUgYXJyYXkgaXRlbXMgdG8gdGhlIHN0YWNrXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2gobmV4dCk7ICAvLyBBZGQgbm9uLWFycmF5IGl0ZW1zIHRvIHRoZSByZXN1bHRcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdC5yZXZlcnNlKCk7ICAvLyBSZXZlcnNlIHRvIG1haW50YWluIG9yaWdpbmFsIG9yZGVyXHJcbn1cclxuY2xhc3MgVG9rZW57XHJcbiAgICB0eXBlXHJcbiAgICB2YWx1ZVxyXG4gICAgdmFyaWFibGVcclxuICAgIGlkXHJcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZSx2YXJpYWJsZSl7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICBhc051bWJlcigpe1xyXG5cclxuICAgIH1cclxuICAgIGFzVmFyaWFibGVcclxufSJdfQ==