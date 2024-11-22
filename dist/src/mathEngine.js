import { quad, calculateBinom, roundBySettings, degreesToRadians, radiansToDegrees } from "./mathUtilities";
import { expandExpression, curlyBracketsRegex } from "./imVeryLazy";
import { type } from "os";
const greekLetters = [
    '',
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
    console.log("left,right", position, left, right);
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
            console.log(method);
            if (method === 'quadratic') {
                this.tokens.tokens = simplifiy(this.tokens.tokens);
                const filterByType = (type) => this.tokens.tokens.filter(token => token.type === type);
                const [numberIndex, variableIndex, powIndex] = [filterByType("number"), filterByType("variable"), filterByType("powerVariable")];
                console.log(numberIndex, variableIndex, powIndex);
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
            .replace(/(\s|\\left|\\right)/g, "")
            .replace(/{/g, "(")
            .replace(/}/g, ")")
            .replace(/(\\cdot|cdot)/g, "*")
            .replace(/Math./g, "\\")
            .replace(/(?<!\\|[a-zA-Z])(tan|sin|cos|binom|frac|asin|acos|atan|arccos|arcsin|arctan|cdot)/g, "\\$1");
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
            let number = 0, startPos = i, vari = "";
            if (math[i] === "(") {
                if (!levelCount[brackets]) {
                    levelCount[brackets] = 0;
                }
                let ID = levelCount[brackets]++;
                tokens.push({ type: "paren", value: "(", id: brackets + "." + ID, index: tokens.length });
                brackets++;
                continue;
            }
            if (math[i] === ")") {
                brackets--;
                if (brackets < 0) {
                    throw new Error("Unmatched closing bracket at position");
                }
                let ID = levelCount[brackets] - 1;
                tokens.push({ type: "paren", value: ")", id: brackets + "." + (ID >= 0 ? ID : 0) });
                continue;
            }
            if (math[i] === "\\") {
                i += 1;
                let operator = (math.slice(i).match(/[a-zA-Z]+/) || [""])[0];
                tokens.push({ type: "operator", value: operator });
                i += operator.length;
                if (tokens[tokens.length - 1].value === "sqrt" && math[i] === "[" && i < math.length - 2) {
                    let temp = math.slice(i, i + 1 + math.slice(i).search(/[\]]/));
                    i += temp.length;
                    Object.assign(tokens[tokens.length - 1], { specialChar: safeToNumber(temp), });
                }
                i--;
                continue;
            }
            let match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
            if (!!match) {
                number = match[0];
                i += number.length > 1 ? number.length - 1 : 0;
                //if(/[+-]/.test(math[startPos-1])){number=math[startPos-1]+number}
                //if (math[i+1]&&/[a-zA-Z]/.test(math[i+1])){continue;}
                tokens.push({ type: "number", value: parseFloat(number) });
                continue;
            }
            if (/[a-zA-Z]/.test(math[i])) {
                vari = (math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/) || [""])[0];
                if (vari && vari.length === 0) {
                    vari = math.slice(i, math.length);
                }
                // number=math.slice(i+vari.length,vari.length+i+math.slice(i+vari.length).search(/[^0-9]/))
                i += vari.length - 1; //+number.length-1;
                //number=safeToNumber(number.length>0?number:1);
                /*
                if (/[0-9]/.test(math[startPos>0?startPos-1:0])&&tokens)
                {
                    number=(math.slice(0,startPos).match(/[0-9.]+(?=[^0-9.]*$)/)|| [""])[0];
                    //number=math[startPos-number.length-1]&&math[startPos-number.length-1]==="-"?"-"+number:number;
                }
                else if(/[-]/.test(math[startPos-1])){number=math[startPos-1]+number}*/
                //safeToNumber(number)
                tokens.push({ type: "variable", variable: vari.replace("(", "{").replace(")", "}"), value: 1 });
                continue;
            }
            if (/[*/^=+-]/.test(math[i])) {
                tokens.push({ type: "operator", value: math[i] });
                continue;
            }
            //if (/[+-\d]/.test(math[i])){continue;}
            throw new Error(`Unknown char "${math[i]}"`);
        }
        if (brackets !== 0) {
            throw new Error("Unmatched opening bracket(s)");
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
    pow;
    id;
    constructor(value, variable) {
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzFCLE1BQU0sWUFBWSxHQUFDO0lBQ2YsRUFBRTtDQUNMLENBQUE7QUFDRCxTQUFTLHdCQUF3QixDQUFDLEdBQUc7SUFDakMsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ2xDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQzNCLElBQUksQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLEVBQUU7Z0JBQ2YsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ3ZDO1lBQ0QsS0FBSyxHQUFHLENBQUMsQ0FBQztTQUNiO0tBQ0o7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNyQixDQUFDO0FBR0QsTUFBTSxvQkFBb0IsR0FBRztJQUN6QixtQkFBbUIsRUFBRSxDQUFDLEdBQUcsQ0FBQztJQUMxQiw0QkFBNEIsRUFBRSxDQUFDLE1BQU0sQ0FBQztJQUN0QyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNyQixPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUM7SUFDZCwwQkFBMEIsRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDO0lBQ3ZHLHFCQUFxQixFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBQyxHQUFHLENBQUM7Q0FDL0MsQ0FBQztBQUNGLE1BQU0sYUFBYSxHQUFHO0lBQ2xCLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO0lBQ3BDLFNBQVMsRUFBRSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQztJQUM5RixXQUFXLEVBQUUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDO0NBQ2pDLENBQUM7QUFFRixNQUFNLE9BQU8sUUFBUTtJQUNqQixTQUFTLEdBQUMsRUFBRSxDQUFDO0lBQ2IsWUFBWSxHQUFDLEVBQUUsQ0FBQztJQUNoQixRQUFRLEdBQUMsRUFBRSxDQUFBO0lBQ1gsS0FBSyxHQUFDLEVBQUUsQ0FBQztJQUNULFlBQVksQ0FBQyxLQUFLO1FBQ2QsSUFBSSxDQUFDLEtBQUssSUFBRSxLQUFLLENBQUM7SUFDdEIsQ0FBQztJQUNELFlBQVksQ0FBQyxHQUFHLEVBQUUsS0FBSztRQUNuQixJQUFJLENBQUMsU0FBUyxJQUFFLENBQUMsT0FBTyxHQUFHLEtBQUcsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQSxHQUFHLENBQUMsR0FBQyxLQUFLLEdBQUMsQ0FBQyxPQUFPLEtBQUssS0FBRyxRQUFRLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQyxHQUFFLEtBQUssQ0FBQztJQUN2SSxDQUFDO0lBQ0QsZUFBZSxDQUFDLEdBQUc7UUFDZixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBQyxHQUFHLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBQ0QsV0FBVyxDQUFDLE1BQU07UUFDZCxNQUFNLGlCQUFpQixHQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFBO1FBQ3JDLElBQUksQ0FBQyxZQUFZLENBQUMsb0JBQW9CLEVBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsV0FBVyxDQUFDLE1BQU0sRUFBQyxRQUFRLEVBQUMsUUFBUTtRQUNoQyxRQUFRLEdBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDeEMsTUFBTSxJQUFJLEdBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLEtBQUssR0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxFQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFFLENBQUMsQ0FBQztRQUVoRyxRQUFRLElBQUksRUFBQztZQUNULEtBQUssb0JBQW9CLENBQUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQ2pFLFFBQVEsR0FBRyxHQUFHLElBQUksSUFBSSxRQUFRLENBQUMsUUFBUSxLQUFLLEtBQUssT0FBTyxRQUFRLEVBQUUsQ0FBQTtnQkFDbEUsTUFBTTtZQUNWLEtBQUssb0JBQW9CLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUNsRCxRQUFRLEdBQUcsR0FBRyxJQUFJLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxJQUFJLEtBQUssTUFBTSxRQUFRLEVBQUUsQ0FBQTtnQkFDekYsTUFBTTtZQUNWLEtBQUssb0JBQW9CLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUNyRCxRQUFRLEdBQUUsVUFBVSxJQUFJLEtBQUssS0FBSyxPQUFPLFFBQVEsRUFBRSxDQUFBO2dCQUNuRCxNQUFNO1lBQ04sS0FBSyxvQkFBb0IsQ0FBQyw0QkFBNEIsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztnQkFDOUUsUUFBUSxHQUFHLFVBQVUsS0FBSyxPQUFPLFFBQVEsRUFBRSxDQUFBO2dCQUMzQyxNQUFNO1lBQ1YsS0FBSyxvQkFBb0IsQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztnQkFDeEUsUUFBUSxHQUFDLEtBQUssUUFBUSxDQUFDLFFBQVEsS0FBSyxLQUFLLE9BQU8sUUFBUSxFQUFFLENBQUE7Z0JBQzFELE1BQU07WUFDVixLQUFLLG9CQUFvQixDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUNuRSxRQUFRLEdBQUMsS0FBSyxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxLQUFLLEtBQUssT0FBTyxRQUFRLEVBQUUsQ0FBQTtnQkFDdEYsTUFBTTtTQUNiO1FBQ0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNuQyxDQUFDO0NBQ0o7QUFHRCxTQUFTLFlBQVksQ0FBQyxLQUFLO0lBQ3ZCLElBQUksQ0FBQyxDQUFDLE9BQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQyxFQUFDO1FBQUMsT0FBTyxLQUFLLENBQUE7S0FBQztJQUMvQyxJQUFJLEtBQUssS0FBRyxHQUFHLEVBQUM7UUFBQyxPQUFPLENBQUMsQ0FBQTtLQUFDO0lBQzFCLElBQUksS0FBSyxLQUFHLEdBQUcsRUFBQztRQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUE7S0FBQztJQUMzQixJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUM7UUFBQyxPQUFPLENBQUMsQ0FBQTtLQUFDO0lBQ3JDLElBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQztRQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO0tBQUM7SUFDakQsSUFBRyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUM7UUFBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsQ0FBQTtLQUFDO0lBQzlFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ2pDLElBQUksT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssUUFBUSxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDMUQsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQy9DLENBQUMsRUFBRSxDQUFDO1NBQ1A7S0FDSjtJQUNELE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMxQixPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDckQsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsUUFBUSxFQUFDLElBQUksRUFBQyxLQUFLO0lBQzFDLElBQUksT0FBTyxRQUFRLEtBQUcsUUFBUSxJQUFFLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBRyxRQUFRLElBQUUsQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN2RyxNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsR0FBQyxRQUFRLEdBQUMsb0JBQW9CLENBQUMsQ0FBQztLQUNsRTtJQUNELElBQUksT0FBTyxRQUFRLEtBQUcsUUFBUSxJQUFFLE9BQU8sS0FBSyxDQUFDLEtBQUssS0FBRyxRQUFRLEVBQUU7UUFDM0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsR0FBQyxRQUFRLEdBQUMsb0JBQW9CLENBQUMsQ0FBQztLQUNuRTtBQUNMLENBQUM7QUFFRCxTQUFTLEtBQUssQ0FBQyxRQUFRO0lBQ25CLElBQUksRUFBRSxRQUFRLEVBQUMsV0FBVyxFQUFFLElBQUksRUFBQyxLQUFLLEVBQUMsR0FBRyxRQUFRLENBQUM7SUFDbkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUMsUUFBUSxFQUFDLElBQUksRUFBQyxLQUFLLENBQUMsQ0FBQTtJQUM3QyxJQUFJLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQTtJQUNoQixLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQTtJQUNsQixpQkFBaUIsQ0FBQyxRQUFRLEVBQUMsSUFBSSxFQUFDLEtBQUssQ0FBQyxDQUFDO0lBRXZDLElBQUksTUFBTSxHQUFDLEVBQUMsS0FBSyxFQUFFLENBQUMsRUFBQyxRQUFRLEVBQUUsRUFBRSxFQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUMsQ0FBQztJQUMzQyxRQUFRLFFBQVEsRUFBRTtRQUNkLEtBQUssTUFBTTtZQUNQLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFDLFdBQVcsS0FBRyxJQUFJLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQSxDQUFDLENBQUEsR0FBRyxDQUFDLENBQUM7WUFDOUUsTUFBTTtRQUNWLEtBQUssR0FBRztZQUNKLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBRSxLQUFLLENBQUMsUUFBUSxFQUNqQztnQkFDSSxNQUFNLENBQUMsUUFBUSxHQUFDLElBQUksQ0FBQyxRQUFRLElBQUUsSUFBSSxDQUFDLFFBQVEsS0FBRyxLQUFLLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxFQUFFLENBQUM7Z0JBQzdHLE1BQU0sQ0FBQyxHQUFHLEdBQUMsQ0FBQyxDQUFBO2FBQ2Y7WUFDRCxNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEQsTUFBTTtRQUNWLEtBQUssTUFBTSxDQUFDO1FBQ1osS0FBSyxHQUFHO1lBQ0osTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxQyxNQUFNO1FBQ1YsS0FBSyxHQUFHO1lBQ0osTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDeEMsY0FBYyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUMsTUFBTSxDQUFDLENBQUM7WUFDbkMsTUFBTTtRQUNWLEtBQUssR0FBRztZQUNKLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxRQUFRLEdBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFDLFFBQVEsQ0FBQztZQUMzRCxNQUFNO1FBQ1YsS0FBSyxHQUFHO1lBQ0osTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDeEMsTUFBTSxDQUFDLFFBQVEsR0FBQyxJQUFJLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUMsUUFBUSxDQUFDO1lBQzNELE1BQU07UUFDVixLQUFLLE9BQU87WUFDUixNQUFNLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0RCxNQUFNO1FBQ1YsS0FBSyxLQUFLO1lBQ04sTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3ZELE1BQU07UUFDVixLQUFLLEtBQUs7WUFDTixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUE7WUFDdEQsTUFBTTtRQUNWLEtBQUssS0FBSztZQUNOLElBQUksS0FBSyxJQUFFLEVBQUUsRUFBQztnQkFBQyxNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7YUFBQztZQUMvRCxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pELE1BQU07UUFDVixLQUFLLE1BQU0sQ0FBQztRQUNaLEtBQUssUUFBUTtZQUNULE1BQU0sQ0FBQyxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN4RCxNQUFNO1FBQ1YsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFFBQVE7WUFDVCxNQUFNLENBQUMsS0FBSyxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDeEQsTUFBTTtRQUNWLEtBQUssTUFBTSxDQUFDO1FBQ1osS0FBSyxRQUFRO1lBQ1QsTUFBTSxDQUFDLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3hELE1BQU07UUFDVjtZQUNJLE9BQU8sSUFBSSxDQUFDO0tBQ25CO0lBRUQsU0FBUyw0QkFBNEIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU07UUFDckQsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxLQUFLLENBQUMsUUFBUSxFQUFFO1lBQ3JFLHlEQUF5RDtZQUN6RCxNQUFNLENBQUMsS0FBSyxHQUFHO2dCQUNYLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsRUFBRTtnQkFDdkUsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLElBQUksQ0FBQyxFQUFFO2FBQzdFLENBQUM7WUFDRixNQUFNLElBQUksS0FBSyxDQUFDLDBFQUEwRSxDQUFDLENBQUE7U0FDOUY7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFDakQsTUFBTSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsUUFBUSxDQUFBLENBQUMsQ0FBQSxTQUFTLENBQUM7UUFFdkQsSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM3QyxHQUFHLEdBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxJQUFFLEdBQUcsS0FBRyxDQUFDLElBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxHQUFHLENBQUM7UUFDMUUsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksU0FBUyxDQUFDO1FBRzlCLDZDQUE2QztRQUM3QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUNwQyxNQUFNLEtBQUssR0FBRyxTQUFTLEdBQUcsVUFBVSxDQUFDO1FBQ3JDLDBEQUEwRDtRQUMxRCxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ1gsTUFBTSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7U0FDeEI7YUFBTTtZQUNILE1BQU0sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1NBQ3hCO0lBQ0wsQ0FBQztJQUlELFNBQVMsY0FBYyxDQUFDLElBQUksRUFBQyxLQUFLLEVBQUMsTUFBTTtRQUNyQyxJQUFJLE9BQU8sR0FBQyxFQUFDLEdBQUcsRUFBQyxJQUFJLEVBQUMsR0FBRyxFQUFDLElBQUksRUFBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBQztZQUNoQyxPQUFRO1NBQ1g7UUFDRCxJQUFJLFFBQVEsQ0FBQyxRQUFRLEtBQUcsR0FBRyxFQUFDO1lBQUMsT0FBTyw0QkFBNEIsQ0FBQyxJQUFJLEVBQUMsS0FBSyxFQUFDLE1BQU0sQ0FBQyxDQUFBO1NBQUM7UUFFcEYsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFHLEtBQUssQ0FBQyxRQUFRLEVBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1NBQ2pFO1FBQ0QsdUJBQXVCO1FBQ3ZCLDBCQUEwQjtRQUUxQjs7OztVQUlFO0lBQ04sQ0FBQztJQUNELE9BQU87UUFDSCxJQUFJLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSxDQUFDLENBQUMsZUFBZSxDQUFBLENBQUMsQ0FBQSxNQUFNLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQyxVQUFVLENBQUEsQ0FBQyxDQUFDLFFBQVE7UUFDdkUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLO1FBQ25CLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxNQUFNLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxFQUFFO1FBQzVDLEdBQUcsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLENBQUMsQ0FBQSxNQUFNLENBQUMsR0FBRyxDQUFBLENBQUMsQ0FBQSxFQUFFO0tBQ2hDLENBQUM7QUFDTixDQUFDO0FBTUQsU0FBUyxlQUFlLENBQUMsTUFBTTtJQUMzQixTQUFTLGlCQUFpQixDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEtBQUs7UUFDaEQsT0FBTyxLQUFLLEdBQUcsR0FBRyxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUNoRCxJQUFJLEtBQUssQ0FBQztZQUVWLElBQUksS0FBSyxFQUFFO2dCQUNQLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxVQUFVLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzthQUNwSDtpQkFBTTtnQkFDSCxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUM7YUFDekY7WUFFRCxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUM7Z0JBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUU1QixLQUFLLElBQUksS0FBSyxDQUFDO1lBRWYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDMUMsT0FBTyxLQUFLLENBQUM7YUFDaEI7WUFDRCxJQUFJLEtBQUssR0FBRyxDQUFDLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDL0MsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFO29CQUNqRSxPQUFPLEtBQUssQ0FBQztpQkFDaEI7YUFDSjtZQUNELEtBQUssR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1NBQ3JCO1FBQ0QsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNkLENBQUM7SUFFRCxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFDLENBQUMsR0FBQyxDQUFDLENBQUM7SUFDOUMsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDO0lBQ3JCLElBQUksVUFBVSxHQUFHLEVBQUUsQ0FBQztJQUNwQixJQUFJLGFBQWEsR0FBRyxLQUFLLENBQUM7SUFDMUIsT0FBTyxDQUFDLGFBQWEsSUFBRSxDQUFDLEdBQUMsR0FBRyxFQUFFO1FBQzFCLGlDQUFpQztRQUNqQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDM0MsQ0FBQyxFQUFFLENBQUM7WUFDSixJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFDN0UsU0FBUyxHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUMxRDtZQUNELElBQUksU0FBUyxLQUFHLElBQUksSUFBRSxDQUFDLEtBQUcsU0FBUyxDQUFDLEtBQUssRUFBRTtnQkFDdkMsQ0FBQyxLQUFLLEVBQUMsR0FBRyxDQUFDLEdBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtnQkFDNUMsTUFBTTthQUNUO1NBQ0o7UUFFRCxJQUFJLENBQUMsU0FBUyxFQUFFO1lBQ1osS0FBSyxHQUFHLENBQUMsQ0FBQztZQUNWLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUMzQixNQUFNO1NBQ1Q7UUFDRCxhQUFhLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxFQUFDLEdBQUcsRUFBQyxNQUFNLENBQUMsS0FBRyxDQUFDLENBQUMsQ0FBQztRQUV6RCxpRUFBaUU7UUFDakUsSUFBSSxDQUFDLGFBQWEsRUFBRTtZQUNoQixVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM5QixTQUFTLEdBQUcsSUFBSSxDQUFDO1NBQ3BCO0tBQ0o7SUFDRCxJQUFJLENBQUMsSUFBRSxHQUFHLEVBQUM7UUFBQyxNQUFNLElBQUksS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7S0FBQztJQUM5RSw0Q0FBNEM7SUFDNUMsSUFBSSxTQUFTLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxFQUFHLEdBQUcsRUFBQyxNQUFNLEVBQUMsV0FBVyxDQUFDLENBQUM7SUFDbEUsSUFBSSxTQUFTLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxFQUFHLEdBQUcsRUFBQyxNQUFNLEVBQUUseUNBQXlDLENBQUMsQ0FBQztJQUNqRyxJQUFJLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUcsR0FBRyxFQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNqRSxJQUFJLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUcsR0FBRyxFQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM5RCxJQUFJLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUcsR0FBRyxFQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztJQUUzRCxPQUFPLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFFLElBQUksQ0FBQztBQUVyRyxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxTQUFTO0lBQzNDLElBQUksU0FBUyxHQUFDLEtBQUssQ0FBQTtJQUNuQixJQUFJLE1BQU0sQ0FBQztJQUNYLElBQUksU0FBUyxHQUFDLEtBQUssQ0FBQztJQUNwQixNQUFNLE1BQU0sR0FBRyxTQUFTLEtBQUssTUFBTSxDQUFDO0lBQ3BDLE1BQU0sYUFBYSxHQUFJLE1BQU0sQ0FBQSxDQUFDLENBQUEsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQztJQUN2QyxJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLEtBQUssSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFDLGFBQWEsQ0FBQyxFQUFFO1FBQ2pILE1BQU0sSUFBSSxLQUFLLENBQUMsa0RBQWtELEdBQUMsS0FBSyxDQUFDLENBQUM7S0FDN0U7SUFDRCxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUU7UUFDckQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoRixTQUFTLEdBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQztRQUMzRCwyRkFBMkY7UUFDM0YsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLEtBQUssR0FBQyxDQUFDLENBQUMsQ0FBQztLQUNyRTtTQUFNO1FBQ0gsU0FBUyxHQUFDLEtBQUssR0FBQyxhQUFhLENBQUM7UUFDOUIsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEMsU0FBUyxJQUFFLE1BQU0sQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUE7S0FFeEI7SUFDRCxvREFBb0Q7SUFFcEQsSUFBSSxDQUFDLFNBQVMsSUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFDO1FBQ2hFLCtFQUErRTtLQUNsRjtJQUNELElBQUksTUFBTSxFQUFFLE1BQU0sS0FBRyxDQUFDLEVBQUU7UUFDcEIsTUFBTSxJQUFJLEtBQUssQ0FBQyw4REFBOEQsU0FBUyxpQkFBaUIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBRSxDQUFDO0tBQzNJO0lBRUQsNEZBQTRGO0lBQzVGLHFCQUFxQjtJQUVyQixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUcsQ0FBQyxFQUFDO1FBQ2xCLE1BQU0sR0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsaUNBQWlDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO0tBQ2hGO1NBQUssSUFBRyxNQUFNLENBQUMsTUFBTSxHQUFDLENBQUM7UUFBQyxTQUFTLEdBQUMsSUFBSSxDQUFBO0lBRXZDLE9BQU87UUFDSCxNQUFNLEVBQUUsTUFBTTtRQUNkLFNBQVMsRUFBRSxTQUFTO1FBQ3BCLFNBQVMsRUFBRSxTQUFTO0tBQ3ZCLENBQUM7QUFDTixDQUFDO0FBR0QsTUFBTSxPQUFPLFFBQVE7SUFDakIsUUFBUSxDQUFDO0lBQ1QsS0FBSyxDQUFDO0lBQ04sVUFBVSxDQUFDO0lBQ1gsV0FBVyxDQUFDO0lBQ1osSUFBSSxHQUFFLElBQUksQ0FBQztJQUNYLEtBQUssR0FBRSxJQUFJLENBQUM7SUFDWixZQUFZLE1BQU0sRUFBRSxLQUFLO1FBQ3JCLElBQUksQ0FBQyxLQUFLLEdBQUMsS0FBSyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQTtRQUM1QixJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQ3pCLENBQUM7SUFDRCxRQUFRLENBQUMsTUFBTTtRQUNYLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN4RSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDekQsT0FBTyxJQUFJLENBQUM7U0FDZjtRQUNELElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQ2hELFFBQVEsSUFBSSxFQUFFO1lBQ1YsS0FBSyxhQUFhLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUMzQyxJQUFJLENBQUMsSUFBSSxHQUFHLGFBQWEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBQyxNQUFNLENBQUMsQ0FBQztnQkFDckQsSUFBSSxDQUFDLEtBQUssR0FBRyxhQUFhLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3ZELE1BQU07WUFDVixLQUFLLGFBQWEsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQ2hELElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBQyxDQUFDO2dCQUNwQyxJQUFJLENBQUMsS0FBSyxHQUFHLGFBQWEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBQyxPQUFPLENBQUMsQ0FBQztnQkFDdkQsTUFBTTtZQUNWLEtBQUssYUFBYSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztnQkFDbEQsSUFBSSxDQUFDLElBQUksR0FBRyxhQUFhLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3RELElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ3RDLElBQUksQ0FBQyxLQUFLLEdBQUcsYUFBYSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxHQUFDLENBQUMsRUFBQyxPQUFPLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFDakMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztnQkFDaEQsTUFBTTtZQUNWO2dCQUNJLE1BQU0sSUFBSSxLQUFLLENBQUMsWUFBWSxJQUFJLENBQUMsUUFBUSxzREFBc0QsQ0FBQyxDQUFDO1NBQ3hHO1FBQ0QsSUFBSSxDQUFDLFdBQVcsR0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDbkcsQ0FBQztJQUNELGNBQWM7UUFDVixPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBRSxJQUFJLENBQUMsUUFBUSxLQUFHLEdBQUcsQ0FBQztJQUM1RSxDQUFDO0lBQ0QsU0FBUztRQUNMLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUEsRUFBRSxDQUFBLENBQUMsQ0FBQyxJQUFJLEtBQUcsVUFBVSxJQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUcsZUFBZSxDQUFDLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUE7SUFDaEosQ0FBQztJQUNELFVBQVU7UUFDTixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBLEVBQUUsQ0FBQSxDQUFDLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxDQUFDLENBQUMsSUFBSSxLQUFHLGVBQWUsQ0FBQyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFBO0lBQ25KLENBQUM7SUFDRCxTQUFTO1FBQ0wsT0FBTyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQTtJQUNqRixDQUFDO0NBQ0o7QUFHRCxTQUFTLFNBQVMsQ0FBQyxNQUFNO0lBQ3JCLElBQUksTUFBTSxDQUFDLE1BQU0sSUFBRSxDQUFDLEVBQUM7UUFBQyxPQUFPLE1BQU0sQ0FBQTtLQUFDO0lBQ3BDLElBQUksQ0FBQyxHQUFDLENBQUMsRUFBQyxTQUFTLEdBQUMsRUFBRSxDQUFDO0lBQ3JCLE9BQU8sQ0FBQyxJQUFFLEdBQUcsSUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsRUFDekY7UUFDSSxDQUFDLEVBQUUsQ0FBQztRQUNKLElBQUksT0FBTyxHQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQzNELElBQUksY0FBYyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDdkcsSUFBSSxjQUFjLEtBQUcsQ0FBQyxDQUFDLEVBQUM7WUFBQyxPQUFPLE1BQU0sQ0FBQztTQUFDO1FBRXhDLElBQUksWUFBWSxHQUFDLEVBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLEVBQUcsS0FBSyxFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxLQUFLLEVBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxHQUFHLEVBQUMsQ0FBQTtRQUVySyxJQUFJLFdBQVcsR0FBRyxNQUFNO2FBQ3ZCLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDaEQsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUcsWUFBWSxDQUFDLElBQUksQ0FBQzthQUNuRCxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7WUFDdEIsSUFBSSxVQUFVLEdBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekcsVUFBVSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBQztnQkFBQyxVQUFVLElBQUUsQ0FBQyxDQUFDLENBQUE7YUFBQztZQUN4RCxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxDQUFDO1FBQzdDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVOLFNBQVMsQ0FBQyxJQUFJLENBQUM7WUFDWCxHQUFHLFlBQVk7WUFDZixLQUFLLEVBQUUsV0FBVztTQUNyQixDQUFDLENBQUM7UUFFSCxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUMzQixLQUFLLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJO1lBQzFDLENBQUMsS0FBSyxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxLQUFLLFlBQVksQ0FBQyxRQUFRLENBQUM7WUFDNUQsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxHQUFHLEtBQUssWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUNoRCxDQUFDO0tBQ0w7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNyQixDQUFDO0FBQ0Q7Ozs7Ozs7Ozs7O0dBV0c7QUFFSCxTQUFTLGNBQWMsQ0FBQyxNQUFNO0lBQzFCLE1BQU0sWUFBWSxHQUFDLENBQUMsSUFBSSxFQUFDLEVBQUUsQ0FBQSxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQztJQUN2RSxNQUFNLENBQUMsV0FBVyxFQUFDLGFBQWEsRUFBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsRUFBQyxZQUFZLENBQUMsVUFBVSxDQUFDLEVBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUE7SUFDNUgsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFHLENBQUMsSUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFHLENBQUM7UUFDeEMsT0FBTyxXQUFXLENBQUM7SUFFdkIsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFHLENBQUMsSUFBRSxhQUFhLENBQUMsTUFBTSxLQUFHLENBQUMsSUFBRSxXQUFXLEtBQUcsQ0FBQztRQUM5RCxPQUFPLFFBQVEsQ0FBQztJQUVwQixJQUFHLE1BQU0sQ0FBQyxNQUFNLEtBQUcsQ0FBQyxJQUFFLFdBQVc7UUFBRSxPQUFPLGNBQWMsQ0FBQztBQUU3RCxDQUFDO0FBR0QsTUFBTSxPQUFPLFdBQVc7SUFDcEIsS0FBSyxHQUFDLEVBQUUsQ0FBQztJQUNULE1BQU0sR0FBQyxFQUFFLENBQUM7SUFDVixRQUFRLEdBQUMsRUFBRSxDQUFDO0lBQ1osUUFBUSxHQUFDLElBQUksUUFBUSxFQUFFLENBQUM7SUFFeEIsWUFBWSxLQUFLO1FBQ2IsSUFBSSxDQUFDLEtBQUssR0FBQyxLQUFLLENBQUM7UUFDakIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxNQUFNLEdBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ25DLElBQUksQ0FBQyxZQUFZLENBQUMsdUJBQXVCLEVBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUM3RCxJQUFJLENBQUMsS0FBSyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUE7UUFDcEMsSUFBSSxDQUFDLFFBQVEsR0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUNELGlCQUFpQjtRQUNiLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDdEMsaUVBQWlFO1FBQ2pFLElBQUksQ0FBQyxNQUFNLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUM3QyxDQUFDO0lBQ0QsVUFBVTtRQUNOLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3pCLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLEVBQUM7WUFDekIsTUFBTSxRQUFRLEdBQUcsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBQyxJQUFJLENBQUMsQ0FBQztZQUNoRCxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFFLElBQUksUUFBUSxLQUFLLElBQUksSUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUMsQ0FBQyxFQUFDO2dCQUMvQyw4REFBOEQ7Z0JBQzlELE9BQU8sVUFBVSxDQUFBO2dCQUNyQiwyQkFBMkI7YUFDMUI7aUJBQ0ksSUFBSSxRQUFRLENBQUMsS0FBSyxLQUFLLElBQUksRUFBQztnQkFDN0IsT0FBTyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7YUFDN0I7WUFDRCxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsSUFBRSxRQUFRLENBQUMsY0FBYyxFQUFFLEVBQ25EO2dCQUNJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQTtnQkFDMUUsT0FBTyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUE7YUFDM0I7WUFDRCxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFBO1NBQzFCO2FBQ0c7WUFDQSxNQUFNLE1BQU0sR0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUMvQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ25CLElBQUksTUFBTSxLQUFHLFdBQVcsRUFBQztnQkFDckIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUE7Z0JBQ2hELE1BQU0sWUFBWSxHQUFDLENBQUMsSUFBSSxFQUFDLEVBQUUsQ0FBQSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO2dCQUNuRixNQUFNLENBQUMsV0FBVyxFQUFDLGFBQWEsRUFBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsRUFBQyxZQUFZLENBQUMsVUFBVSxDQUFDLEVBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUE7Z0JBQzVILE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFDLGFBQWEsRUFBQyxRQUFRLENBQUMsQ0FBQTtnQkFDL0MsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsbUJBQW1CLEVBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQTtnQkFDbEUsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFHLENBQUMsSUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFHLENBQUMsRUFDNUM7b0JBQ0ksT0FBTyxJQUFJLENBQ1AsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssR0FBSSxDQUFDLEVBQ3ZCLGFBQWEsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxFQUMzQixXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFFLENBQUMsRUFDN0IsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FDdkIsQ0FBQztpQkFDTDthQUNKO1NBQ0o7UUFFRCxrRUFBa0U7UUFDbEUsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM1RSxDQUFDO0lBQ0QsUUFBUSxDQUFDLFFBQVE7UUFDYixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFL0IsNkNBQTZDO1FBQzdDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUMsUUFBUSxFQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ3RELE1BQU0sQ0FBQyxTQUFTLEVBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFBO1FBQ3JHLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBQyxNQUFNLEVBQUMsTUFBTSxDQUFDLENBQUE7UUFDakQsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUNyRCxDQUFDO0lBRUQsaUJBQWlCO1FBQ2IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFBLEVBQUUsQ0FBQSxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUE7SUFDbEcsQ0FBQztJQUVELFlBQVksQ0FBQyxHQUFHLEVBQUMsS0FBSztRQUNsQixJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUMsS0FBSyxDQUFDLENBQUE7SUFDekMsQ0FBQztJQUNELFlBQVk7UUFDUixJQUFJLENBQUMsS0FBSyxHQUFDLElBQUksQ0FBQyxLQUFLO2FBQ3BCLE9BQU8sQ0FBQyxzQkFBc0IsRUFBRSxFQUFFLENBQUM7YUFDbkMsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUM7YUFDbEIsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUM7YUFDbEIsT0FBTyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQzthQUM5QixPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQzthQUN2QixPQUFPLENBQUMsb0ZBQW9GLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDM0csQ0FBQztJQUNELFdBQVc7UUFDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUE7SUFDcEMsQ0FBQztDQUNKO0FBR0QsTUFBTSxNQUFNO0lBQ1IsTUFBTSxHQUFDLEVBQUUsQ0FBQztJQUNWLFlBQVksSUFBSTtRQUNaLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEIsQ0FBQztJQUNELFFBQVEsQ0FBQyxJQUFJO1FBQ1QsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksUUFBUSxHQUFHLENBQUMsRUFBRyxVQUFVLEdBQUcsRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQztRQUNSLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2xDLENBQUMsRUFBRSxDQUFDO1lBQ0osSUFBRyxDQUFDLEdBQUMsR0FBRyxFQUFDO2dCQUFDLE1BQU07YUFBQztZQUNqQixJQUFJLE1BQU0sR0FBQyxDQUFDLEVBQUcsUUFBUSxHQUFHLENBQUMsRUFBQyxJQUFJLEdBQUMsRUFBRSxDQUFDO1lBRXBDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtnQkFDakIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRTtvQkFDdkIsVUFBVSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDNUI7Z0JBQ0QsSUFBSSxFQUFFLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLFFBQVEsR0FBRyxHQUFHLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztnQkFDMUYsUUFBUSxFQUFFLENBQUM7Z0JBQ1gsU0FBUzthQUNaO1lBQ0QsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFO2dCQUNqQixRQUFRLEVBQUUsQ0FBQztnQkFDWCxJQUFJLFFBQVEsR0FBRyxDQUFDLEVBQUU7b0JBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO2lCQUM1RDtnQkFDRCxJQUFJLEVBQUUsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNsQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxRQUFRLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7Z0JBQ25GLFNBQVM7YUFDWjtZQUVELElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRTtnQkFDbEIsQ0FBQyxJQUFFLENBQUMsQ0FBQztnQkFDTCxJQUFJLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtnQkFFNUQsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBQyxDQUFDLENBQUM7Z0JBQ2xELENBQUMsSUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDO2dCQUVuQixJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7b0JBQ3RGLElBQUksSUFBSSxHQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDeEQsQ0FBQyxJQUFFLElBQUksQ0FBQyxNQUFNLENBQUE7b0JBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsRUFBQyxFQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUUsQ0FBQyxDQUFBO2lCQUM1RTtnQkFDRCxDQUFDLEVBQUUsQ0FBQztnQkFDSixTQUFTO2FBQ1o7WUFFRCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFBLGdCQUFnQjtZQUM5RCxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQ1g7Z0JBQ0ksTUFBTSxHQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtnQkFDZixDQUFDLElBQUUsTUFBTSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFBLE1BQU0sQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUM7Z0JBQ3JDLG1FQUFtRTtnQkFFbkUsdURBQXVEO2dCQUN2RCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFDLENBQUMsQ0FBQztnQkFDMUQsU0FBUzthQUNaO1lBRUQsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUMxQixJQUFJLEdBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDeEUsSUFBSSxJQUFJLElBQUUsSUFBSSxDQUFDLE1BQU0sS0FBRyxDQUFDLEVBQUM7b0JBQUMsSUFBSSxHQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQTtpQkFBQztnQkFDM0QsNEZBQTRGO2dCQUUzRixDQUFDLElBQUUsSUFBSSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUEsQ0FBQSxtQkFBbUI7Z0JBQ25DLGdEQUFnRDtnQkFDaEQ7Ozs7Ozt1RkFNdUU7Z0JBQ3ZFLHNCQUFzQjtnQkFDdEIsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFDLElBQUksRUFBRSxVQUFVLEVBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUMsR0FBRyxDQUFDLEVBQUMsS0FBSyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUM7Z0JBQzFGLFNBQVM7YUFDWjtZQUVELElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDMUIsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7Z0JBQ2pELFNBQVM7YUFDWjtZQUNELHdDQUF3QztZQUN4QyxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ2hEO1FBRUQsSUFBSSxRQUFRLEtBQUcsQ0FBQyxFQUNoQjtZQUNJLE1BQU0sSUFBSSxLQUFLLENBQUUsOEJBQThCLENBQUMsQ0FBQTtTQUNuRDtRQUNELElBQUksQ0FBQyxNQUFNLEdBQUMsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBRTdCLENBQUM7SUFDRCxhQUFhLENBQUMsS0FBSyxFQUFDLE1BQU07UUFDdEIsTUFBTSxHQUFDLE1BQU0sQ0FBQSxDQUFDLENBQUEsTUFBTSxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDdkIsT0FBTyxLQUFLLEdBQUMsQ0FBQyxHQUFDLE1BQU0sSUFBRSxLQUFLLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUMsQ0FBQyxHQUFDLE1BQU0sQ0FBQztJQUM3RCxDQUFDO0lBQ0QsVUFBVSxDQUFDLEdBQUc7UUFDVixHQUFHLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ2hCLEtBQUssR0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBQyxDQUFDLENBQUMsSUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUcsVUFBVSxJQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBRyxVQUFVLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFDO1FBQ2pJLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxHQUFHLENBQUE7SUFDZCxDQUFDO0lBQ0QsYUFBYSxDQUFDLEdBQUc7SUFFakIsQ0FBQztJQUNELGlCQUFpQjtRQUNiOztVQUVFO1FBQ0YsTUFBTSxLQUFLLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUNwQixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUM7Z0JBQUUsT0FBTyxLQUFLLENBQUM7WUFDN0MsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDN0QsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBRXZCLE1BQU0sR0FBRyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFHLFFBQVEsSUFBRSxLQUFLLENBQUMsSUFBSSxLQUFHLFVBQVUsQ0FBQyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQTtRQUNwSSxNQUFNLEdBQUcsR0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUE7UUFFM0IsTUFBTSxTQUFTLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxLQUFHLEdBQUcsSUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFBO1FBR3pILElBQUksS0FBSyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBRyxHQUFHLElBQUUsS0FBSyxDQUFDLEtBQUssS0FBRyxHQUFHLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQSxFQUFFLENBQUMsS0FBSyxLQUFHLElBQUksQ0FBQyxDQUFBO1FBQ3ZILEtBQUssR0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBRTVCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDNUIsTUFBTSxLQUFLLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLEtBQUcsR0FBRyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1lBQ2hELElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBRSxLQUFLLENBQUM7WUFDbEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFDLENBQUMsQ0FBQyxDQUFBO1FBQy9CLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUM5QixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUM7Z0JBQUUsT0FBTyxLQUFLLENBQUM7WUFDN0MsTUFBTSxHQUFHLEdBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQy9DLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFHLEdBQUcsSUFBRSxDQUFDLEdBQUcsS0FBRyxDQUFDLElBQUUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDdkcsQ0FBQyxDQUFDO1FBQ0YsOENBQThDO1FBQzlDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNO2FBQ3ZCLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUNsQixHQUFHO1lBQ0gsSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssVUFBVSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtnQkFDdEYsT0FBTyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQzthQUMxQztpQkFBTSxJQUFJLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxFQUFFO2dCQUM1QixPQUFPLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUMsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7YUFDcEU7WUFDRCxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDLENBQUM7YUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7UUFFbkMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDN0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ2IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3RSxDQUFDLENBQUMsQ0FBQztRQUVILGlCQUFpQjtJQUVyQixDQUFDO0lBRUQsZUFBZTtRQUNYLE9BQU8sSUFBSSxDQUFDLE1BQU07YUFDakIsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7YUFDekYsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQzthQUM3QixNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDWCxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDO1lBQ3BELElBQUksU0FBUyxHQUFDLENBQUMsRUFBRTtnQkFDYixJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFDLDZCQUE2QjtvQkFDMUYsT0FBTyxLQUFLLENBQUM7aUJBQ1o7YUFDSjtZQUNELElBQUksVUFBVSxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDbkMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxHQUFHLEVBQUUsRUFBQyw2QkFBNkI7b0JBQ2hJLE9BQU8sS0FBSyxDQUFDO2lCQUNaO2FBQ0o7WUFDRCxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRDs7Ozs7O1FBTUk7SUFFSCxXQUFXLEtBQUcsT0FBTyxpQ0FBaUMsQ0FBQSxDQUFBLENBQUM7SUFFeEQsbUJBQW1CO1FBQ2YsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRTVELE1BQU0sS0FBSyxHQUFDLENBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxVQUFVLElBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxLQUFLLFVBQVUsQ0FBQyxDQUFBO1FBRTNHLE1BQU0sTUFBTSxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksS0FBRyxRQUFRLElBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQTtRQUMxSCxNQUFNLE1BQU0sR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUcsVUFBVSxJQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUE7UUFDNUgsTUFBTSxNQUFNLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFHLGVBQWUsSUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFBO1FBRWpJLE1BQU0sR0FBRyxHQUFHO1lBQ1IsR0FBRyx3QkFBd0IsQ0FBQyxNQUFNLENBQUM7WUFDbkMsR0FBRyx3QkFBd0IsQ0FBQyxNQUFNLENBQUM7WUFDbkMsR0FBRyx3QkFBd0IsQ0FBQyxNQUFNLENBQUM7U0FDdEMsQ0FBQztRQUNGLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUUzQixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUNyQyxDQUFDO0lBRUQsaUJBQWlCLENBQUMsR0FBRztRQUNqQixNQUFNLE9BQU8sR0FBQyxFQUFFLENBQUE7UUFDaEIsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDekMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQTtRQUN2RCxDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDcEIsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ25ELE1BQU0sS0FBSyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUMsS0FBSyxDQUFDLEdBQUcsR0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFBLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2hHLEtBQUssSUFBSSxDQUFDLEdBQUMsS0FBSyxDQUFDLEtBQUssR0FBQyxDQUFDLEVBQUMsQ0FBQyxJQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUMsQ0FBQyxFQUFFLEVBQUM7Z0JBQ3ZDLEtBQUssR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO2FBQ3BGO1lBQ0QsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFBO1lBRXZELElBQUksS0FBSztnQkFBQyxZQUFZLENBQUMsUUFBUSxHQUFDLEtBQUssQ0FBQyxRQUFRLENBQUE7WUFFOUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsWUFBWSxDQUFDO1lBQ3hDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxD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QixDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyJcclxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlc30gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuL2ltVmVyeUxhenlcIjtcclxuaW1wb3J0IHsgdHlwZSB9IGZyb20gXCJvc1wiO1xyXG5jb25zdCBncmVla0xldHRlcnM9W1xyXG4gICAgJycsXHJcbl1cclxuZnVuY3Rpb24gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKGFycikge1xyXG4gICAgY29uc3Qgc2VxdWVuY2VzID0gW107XHJcbiAgICBsZXQgc3RhcnQgPSAwO1xyXG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGFycltpXSAhPT0gYXJyW2kgLSAxXSArIDEpIHtcclxuICAgICAgICAgICAgaWYgKGkgLSBzdGFydCA+IDEpIHtcclxuICAgICAgICAgICAgICAgIHNlcXVlbmNlcy5wdXNoKGFyci5zbGljZShzdGFydCwgaSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN0YXJ0ID0gaTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc2VxdWVuY2VzO1xyXG59XHJcblxyXG5cclxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XHJcbiAgICBib3RoQnV0UmlnaHRCcmFja2V0OiBbXCJeXCJdLFxyXG4gICAgcmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaDogW1wic3FydFwiXSxcclxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcclxuICAgIHNwZWNpYWw6IFtcIj1cIl0sXHJcbiAgICBSaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaDogW1wic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxyXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cclxufTtcclxuY29uc3Qgb3BlcmF0b3JTaWRlcyA9IHtcclxuICAgIGJvdGg6IFtcIl5cIiwgXCIrXCIsIFwiLVwiLCBcIipcIiwgXCIvXCIsIFwiPVwiXSxcclxuICAgIHJpZ2h0T25seTogW1wic3FydFwiLCBcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcclxuICAgIGRvdWJsZVJpZ2h0OiBbXCJmcmFjXCIsIFwiYmlub21cIl1cclxufTtcclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoSW5mb3tcclxuICAgIGRlYnVnSW5mbz1cIlwiO1xyXG4gICAgc29sdXRpb25JbmZvPVtdO1xyXG4gICAgbWF0aEluZm89W11cclxuICAgIGdyYXBoPVwiXCI7XHJcbiAgICBhZGRHcmFwaEluZm8odmFsdWUpe1xyXG4gICAgICAgIHRoaXMuZ3JhcGgrPXZhbHVlO1xyXG4gICAgfVxyXG4gICAgYWRkRGVidWdJbmZvKG1zZywgdmFsdWUpe1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUpOnZhbHVlKSsgXCJcXG4gXCI7XHJcbiAgICB9XHJcbiAgICBhZGRTb2x1dGlvbkluZm8obWVzKXtcclxuICAgICAgICB0aGlzLnNvbHV0aW9uSW5mby5wdXNoKG1lcyk7XHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xyXG4gICAgfVxyXG4gICAgYWRkTWF0aEluZm8odG9rZW5zKXtcclxuICAgICAgICBjb25zdCByZWNvbnN0cnVjdGVkTWF0aD10b2tlbnMucmVjb25zdHJ1Y3QoKVxyXG4gICAgICAgIHRoaXMubWF0aEluZm8ucHVzaChyZWNvbnN0cnVjdGVkTWF0aClcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlJlY29uc3RydWN0ZWQgbWF0aFwiLHJlY29uc3RydWN0ZWRNYXRoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRTb2x1dGlvbih0b2tlbnMscG9zaXRpb24sc29sdXRpb24pe1xyXG4gICAgICAgIHNvbHV0aW9uPXRva2Vucy5yZWNvbnN0cnVjdChbc29sdXRpb25dKTtcclxuICAgICAgICBjb25zdCBsZWZ0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLmluZGV4KSk7XHJcbiAgICAgICAgY29uc3QgcmlnaHQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24uaW5kZXgrMSxwb3NpdGlvbi5yaWdodC5icmVha0NoYXIsKSk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHJ1ZSl7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aEJ1dFJpZ2h0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvcn0geyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKC9cXCovZywgXCJcXFxcY2RvdFwiKX0gJHtyaWdodH0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnNwZWNpYWwuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gYFxcXFxmcmFjeyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGBcXFxcc3FydHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLlJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5kb3VibGVSaWdodEJ1dEJyYWNrZXQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZShcIi9cIixcImZyYWNcIil9eyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYWRkU29sdXRpb25JbmZvKHNvbHV0aW9uKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xyXG4gICAgaWYgKCEodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSl7cmV0dXJuIHZhbHVlfVxyXG4gICAgaWYgKHZhbHVlPT09XCIrXCIpe3JldHVybiAwfVxyXG4gICAgaWYgKHZhbHVlPT09XCItXCIpe3JldHVybiAtMX1cclxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QodmFsdWUpKXtyZXR1cm4gMX1cclxuICAgIGlmKC9bKFtdLy50ZXN0KHZhbHVlWzBdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgxKX1cclxuICAgIGlmKC9bKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cclxuICAgIGZvciAobGV0IGkgPSAwOyBpPHZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVtpXSA9PT0gXCJzdHJpbmdcIiAmJiAvWygpW1xcXV0vLnRlc3QodmFsdWVbaV0pKSB7XHJcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XHJcbiAgICAgICAgICAgIGktLTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bSkgPyB2YWx1ZS5sZW5ndGg+MD92YWx1ZTowIDogbnVtO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcixsZWZ0LHJpZ2h0KXtcclxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgbGVmdC52YWx1ZSE9PVwibnVtYmVyXCImJiFvcGVyYXRvclNpZGVzLnJpZ2h0T25seS5pbmNsdWRlcyhvcGVyYXRvcikpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMZWZ0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XHJcbiAgICB9XHJcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIHJpZ2h0LnZhbHVlIT09XCJudW1iZXJcIikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJpZ2h0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlKHBvc2l0aW9uKSB7XHJcbiAgICBsZXQgeyBvcGVyYXRvcixzcGVjaWFsQ2hhciwgbGVmdCxyaWdodH0gPSBwb3NpdGlvbjtcclxuICAgIGNvbnNvbGUubG9nKFwibGVmdCxyaWdodFwiLHBvc2l0aW9uLGxlZnQscmlnaHQpXHJcbiAgICBsZWZ0PWxlZnQudG9rZW5zXHJcbiAgICByaWdodD1yaWdodC50b2tlbnNcclxuICAgIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yLGxlZnQscmlnaHQpO1xyXG4gICAgXHJcbiAgICBsZXQgc29sdmVkPXt2YWx1ZTogMCx2YXJpYWJsZTogXCJcIixwb3c6IFwiXCJ9O1xyXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xyXG4gICAgICAgIGNhc2UgXCJzcXJ0XCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KHJpZ2h0LnZhbHVlLHNwZWNpYWxDaGFyIT09bnVsbD8oMSkvKHNwZWNpYWxDaGFyKTowLjUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiXlwiOlxyXG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZXx8cmlnaHQudmFyaWFibGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfHxsZWZ0LnZhcmlhYmxlPT09cmlnaHQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZT9yaWdodC52YXJpYWJsZTpcIlwiO1xyXG4gICAgICAgICAgICAgICAgc29sdmVkLnBvdz0yXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cobGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJmcmFjXCI6XHJcbiAgICAgICAgY2FzZSBcIi9cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKGxlZnQudmFsdWUpLyhyaWdodC52YWx1ZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCIqXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKiByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgaGFuZGxlVnJpYWJsZXMobGVmdCwgcmlnaHQsc29sdmVkKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIitcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSArIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiLVwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlIC0gcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBjYWxjdWxhdGVCaW5vbShsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInNpblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJjb3NcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5jb3MoZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ0YW5cIjpcclxuICAgICAgICAgICAgaWYgKHJpZ2h0Pj05MCl7dGhyb3cgbmV3IEVycm9yKFwidGFuIE11c3QgYmUgc21hbGxlciB0aGFuIDkwXCIpO31cclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc2luXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY3NpblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXNpbihyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYWNvc1wiOlxyXG4gICAgICAgIGNhc2UgXCJhcmNjb3NcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFjb3MocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImF0YW5cIjpcclxuICAgICAgICBjYXNlIFwiYXJjdGFuXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsOyBcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQsIHJpZ2h0LCBzb2x2ZWQpIHtcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSAmJiBsZWZ0LnZhcmlhYmxlICE9PSByaWdodC52YXJpYWJsZSkge1xyXG4gICAgICAgICAgICAvLyBLZWVwIHRoZW0gc2VwYXJhdGUgc2luY2UgdGhleSBoYXZlIGRpZmZlcmVudCB2YXJpYWJsZXNcclxuICAgICAgICAgICAgc29sdmVkLnRlcm1zID0gW1xyXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogbGVmdC52YXJpYWJsZSwgcG93OiBsZWZ0LnBvdyB8fCAxLCB2YWx1ZTogbGVmdC52YWx1ZSB8fCAxIH0sXHJcbiAgICAgICAgICAgICAgICB7IHZhcmlhYmxlOiByaWdodC52YXJpYWJsZSwgcG93OiByaWdodC5wb3cgfHwgMSwgdmFsdWU6IHJpZ2h0LnZhbHVlIHx8IDEgfVxyXG4gICAgICAgICAgICBdO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaWZmZXJlbnQgdmFyaWFibGUgYmFzZXMgYXQgcG93ZXIgbXVsdGlwbGljYXRpb24uIEkgZGlkbid0IGdldCB0aGVyZSB5ZXRcIilcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICBjb25zdCB2YXJpYWJsZSA9IGxlZnQudmFyaWFibGUgfHwgcmlnaHQudmFyaWFibGU7XHJcbiAgICAgICAgc29sdmVkLnZhcmlhYmxlID0gdmFyaWFibGUubGVuZ3RoPjA/dmFyaWFibGU6dW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBwb3cgPSAobGVmdC5wb3cgfHwgMCkgKyAocmlnaHQucG93IHx8IDApO1xyXG4gICAgICAgIHBvdz1sZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlJiZwb3c9PT0wJiYhbGVmdC5wb3cmJiFyaWdodC5wb3c/Mjpwb3c7XHJcbiAgICAgICAgc29sdmVkLnBvdyA9IHBvdyB8fCB1bmRlZmluZWQ7XHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIC8vIFJ1bGUgMzogSGFuZGxlIG11bHRpcGxpY2F0aW9uIG9mIGNvbnN0YW50c1xyXG4gICAgICAgIGNvbnN0IGxlZnRWYWx1ZSA9IGxlZnQudmFsdWUgfHwgMTtcclxuICAgICAgICBjb25zdCByaWdodFZhbHVlID0gcmlnaHQudmFsdWUgfHwgMTtcclxuICAgICAgICBjb25zdCB2YWx1ZSA9IGxlZnRWYWx1ZSAqIHJpZ2h0VmFsdWU7XHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBubyB2YXJpYWJsZSwgYXNzaWduIHRoZSByZXN1bHQgYXMgYSBjb25zdGFudFxyXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICBmdW5jdGlvbiBoYW5kbGVWcmlhYmxlcyhsZWZ0LHJpZ2h0LHNvbHZlZCl7XHJcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcclxuICAgICAgICBpZiAoIWxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7XHJcbiAgICAgICAgICAgIHJldHVybiA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChwb3NpdGlvbi5vcGVyYXRvcj09PScqJyl7cmV0dXJuIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdCxyaWdodCxzb2x2ZWQpfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUd28gdmFyaWFibGUgZXF1YXRpb25zIGFyZW4ndCBhY2NlcHRlZCB5ZXRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XHJcbiAgICAgICAgLy9zb2x2ZWQudmFyaWFibGU9bGVmdC52YXJcclxuXHJcbiAgICAgICAgLypcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cclxuICAgICAgICAqL1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBzb2x2ZWQucG93PyBcInBvd2VyVmFyaWFibGVcIjpzb2x2ZWQudmFyaWFibGU/IFwidmFyaWFibGVcIjogXCJudW1iZXJcIixcclxuICAgICAgICB2YWx1ZTogc29sdmVkLnZhbHVlLCBcclxuICAgICAgICB2YXJpYWJsZTogc29sdmVkLnZhcmlhYmxlP3NvbHZlZC52YXJpYWJsZTpcIlwiLFxyXG4gICAgICAgIHBvdzogc29sdmVkLnBvdz9zb2x2ZWQucG93OlwiXCIsXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2Vucykge1xyXG4gICAgZnVuY3Rpb24gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sIGVuZCwgdG9rZW5zLCByZWdleCkge1xyXG4gICAgICAgIHdoaWxlIChiZWdpbiA8IGVuZCAmJiBiZWdpbiA8IHRva2Vucy50b2tlbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGxldCBpbmRleDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChyZWdleCkge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIC0xO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmICghL1srLV0vLnRlc3QodG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWUpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBpbmRleCA8IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vucy50b2tlbnNbaW5kZXggLSAxXS50eXBlID09PSB0b2tlbnMudG9rZW5zW2luZGV4ICsgMV0udHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBiZWdpbiA9IGluZGV4ICsgMTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIC0xO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBiZWdpbiA9IDAsIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoLGo9MDtcclxuICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICBsZXQgY2hlY2tlZElEcyA9IFtdOyAgXHJcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xyXG4gICAgd2hpbGUgKCFvcGVyYXRvckZvdW5kJiZqPDIwMCkge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGlubmVybW9zdCBwYXJlbnRoZXNlc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLnRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBqKys7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2ldLnZhbHVlID09PSBcIihcIiAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnMudG9rZW5zW2ldLmlkKSkge1xyXG4gICAgICAgICAgICAgICAgY3VycmVudElEID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaV0uaWQpOyAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRJRCE9PW51bGwmJmk9PT1jdXJyZW50SUQuY2xvc2UpIHtcclxuICAgICAgICAgICAgICAgIFtiZWdpbixlbmRdPVtjdXJyZW50SUQub3BlbixjdXJyZW50SUQuY2xvc2VdXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICBiZWdpbiA9IDA7XHJcbiAgICAgICAgICAgIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgb3BlcmF0b3JGb3VuZCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLGVuZCx0b2tlbnMpIT09LTE7XHJcblxyXG4gICAgICAgIC8vIElmIG5vIG9wZXJhdG9yIGlzIGZvdW5kLCBtYXJrIHRoaXMgcGFyZW50aGVzZXMgcGFpciBhcyBjaGVja2VkXHJcbiAgICAgICAgaWYgKCFvcGVyYXRvckZvdW5kKSB7XHJcbiAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQuaWQpOyAgXHJcbiAgICAgICAgICAgIGN1cnJlbnRJRCA9IG51bGw7ICBcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoaj49MjAwKXt0aHJvdyBuZXcgRXJyb3IoXCJvcGVyYXRpb25zT3JkZXIgRmFpbGVkIGV4Y2VlZGVkIDIwMCByZXZpc2lvbnNcIik7fVxyXG4gICAgLy8gRmluZCBpbmRpY2VzIGJhc2VkIG9uIG9wZXJhdG9yIHByZWNlZGVuY2VcclxuICAgIGxldCBwcmlvcml0eTEgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsLyhcXF58c3FydCkvKTtcclxuICAgIGxldCBwcmlvcml0eTIgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oZnJhY3xiaW5vbXxzaW58Y29zfHRhbnxhc2lufGFjb3N8YXRhbikvKTtcclxuICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oXFwqfFxcLykvKTtcclxuICAgIGxldCBwcmlvcml0eTQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC9bKy1dLyk7XHJcbiAgICBsZXQgcHJpb3JpdHk1ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvPS8pO1xyXG4gICAgXHJcbiAgICByZXR1cm4gW3ByaW9yaXR5MSwgcHJpb3JpdHkyLCBwcmlvcml0eTMsIHByaW9yaXR5NCwgcHJpb3JpdHk1XS5maW5kKGluZGV4ID0+IGluZGV4ICE9PSAtMSk/P251bGw7XHJcbiAgICBcclxufVxyXG5cclxuZnVuY3Rpb24gYXBwbHlQb3NpdGlvbih0b2tlbnMsIGluZGV4LCBkaXJlY3Rpb24pIHtcclxuICAgIGxldCBicmVha0NoYXI9aW5kZXhcclxuICAgIGxldCB0YXJnZXQ7XHJcbiAgICBsZXQgbXVsdGlTdGVwPWZhbHNlO1xyXG4gICAgY29uc3QgaXNMZWZ0ID0gZGlyZWN0aW9uID09PSBcImxlZnRcIjtcclxuICAgIGNvbnN0IGluZGV4TW9kaWZpZXIgPSAgaXNMZWZ0Py0gMSA6ICAxO1xyXG4gICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLnRva2Vucy5sZW5ndGggLSAxKSB8fCAhdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImF0IGFwcGx5UG9zaXRpb246IFxcXCJpbmRleCB3YXNuJ3QgdmFsaWRcXFwiIGluZGV4OiBcIitpbmRleCk7XHJcbiAgICB9XHJcbiAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpIHtcclxuICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xyXG4gICAgICAgIGJyZWFrQ2hhciA9ICBpc0xlZnQgPyBwYXJlbkluZGV4Lm9wZW4gOiBwYXJlbkluZGV4LmNsb3NlKzE7XHJcbiAgICAgICAgLy90YXJnZXQgPSB0b2tlbnMudG9rZW5zLnNsaWNlKGlzTGVmdCA/IGJyZWFrQ2hhciA6IGluZGV4ICsgMSwgaXNMZWZ0ID8gaW5kZXggOiBicmVha0NoYXIpO1xyXG4gICAgICAgIHRhcmdldCA9IHRva2Vucy50b2tlbnMuc2xpY2UocGFyZW5JbmRleC5vcGVuLCBwYXJlbkluZGV4LmNsb3NlKzEpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBicmVha0NoYXI9aW5kZXgraW5kZXhNb2RpZmllcjtcclxuICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zW2JyZWFrQ2hhcl07XHJcbiAgICAgICAgYnJlYWtDaGFyKz1pc0xlZnQ/MDoxXHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICAvL2NvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+IDM7XHJcblxyXG4gICAgaWYgKCFtdWx0aVN0ZXAmJnRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKXtcclxuICAgICAgICAvL3RhcmdldD10YXJnZXQuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXHJcbiAgICB9XHJcbiAgICBpZiAodGFyZ2V0Py5sZW5ndGg9PT0wKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7ZGlyZWN0aW9ufSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWV9XCJgLCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy9icmVha0NoYXIgPSAoYnJlYWtDaGFyICE9PSBpbmRleCA/IHRhcmdldD8uaW5kZXggOiBicmVha0NoYXIpKyBpbmRleE1vZGlmaWVyKyhpc0xlZnQ/MDoxKTtcclxuICAgIC8vZGVsZXRlIHRhcmdldC5pbmRleFxyXG4gICAgXHJcbiAgICBpZiAodGFyZ2V0Lmxlbmd0aD09PTMpe1xyXG4gICAgICAgIHRhcmdldD10YXJnZXQuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXHJcbiAgICB9ZWxzZSBpZih0YXJnZXQubGVuZ3RoPjEpbXVsdGlTdGVwPXRydWVcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHRva2VuczogdGFyZ2V0LFxyXG4gICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxyXG4gICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uIHtcclxuICAgIG9wZXJhdG9yO1xyXG4gICAgaW5kZXg7XHJcbiAgICB0cmFuc2l0aW9uO1xyXG4gICAgc3BlY2lhbENoYXI7XHJcbiAgICBsZWZ0PSBudWxsO1xyXG4gICAgcmlnaHQ9IG51bGw7XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnMsIGluZGV4KXtcclxuICAgICAgICB0aGlzLmluZGV4PWluZGV4O1xyXG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXhcclxuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcclxuICAgIH1cclxuICAgIHBvc2l0aW9uKHRva2Vucykge1xyXG4gICAgICAgIHRoaXMuaW5kZXggPSB0aGlzLmluZGV4ID09PSBudWxsID8gb3BlcmF0aW9uc09yZGVyKHRva2VucykgOiB0aGlzLmluZGV4O1xyXG4gICAgICAgIGlmICh0aGlzLmluZGV4ID09PSBudWxsIHx8IHRoaXMuaW5kZXggPT09IHRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLm9wZXJhdG9yID0gdG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS52YWx1ZTtcclxuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLmJvdGguaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yU2lkZXMucmlnaHRPbmx5LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0ge2JyZWFrQ2hhcjogdGhpcy5pbmRleH07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yU2lkZXMuZG91YmxlUmlnaHQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5sZWZ0LmJyZWFrQ2hhcjtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLTEsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdC5icmVha0NoYXIgPSB0aGlzLmluZGV4O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodC5icmVha0NoYXIrKHRoaXMucmlnaHQubXVsdGlTdGVwPzE6MCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmF0b3IgJHt0aGlzLm9wZXJhdG9yfSB3YXMgbm90IGFjY291bnRlZCBmb3IsIG9yIGlzIG5vdCB0aGUgdmFsaWQgb3BlcmF0b3JgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyIDogbnVsbDtcclxuICAgIH1cclxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLmxlZnQubXVsdGlTdGVwfHx0aGlzLnJpZ2h0Lm11bHRpU3RlcCkmJnRoaXMub3BlcmF0b3I9PT0nKic7XHJcbiAgICB9XHJcbiAgICBpc0xlZnRWYXIoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5sZWZ0Lm11bHRpU3RlcD90aGlzLmxlZnQudG9rZW5zLnNvbWUodD0+dC50eXBlPT09J3ZhcmlhYmxlJ3x8dC50eXBlPT09J3Bvd2VyVmFyaWFibGUnKTp0aGlzLmxlZnQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxyXG4gICAgfVxyXG4gICAgaXNSaWdodFZhcigpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJpZ2h0Lm11bHRpU3RlcD90aGlzLnJpZ2h0LnRva2Vucy5zb21lKHQ9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5yaWdodC50b2tlbnMudHlwZS5pbmNsdWRlcygnYXJpYWJsZScpXHJcbiAgICB9XHJcbiAgICBjaGVja0ZyYWMoKXsvLyF0aGlzLmNoZWNrTXVsdGlTdGVwKCkgSSBkb24ndCBrbm93IHdoeSBJIGhhZCB0aGlzIGhlcmVcclxuICAgICAgICByZXR1cm4gLyhmcmFjfFxcLykvLnRlc3QodGhpcy5vcGVyYXRvcikmJih0aGlzLmlzTGVmdFZhcigpfHx0aGlzLmlzUmlnaHRWYXIoKSlcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHNpbXBsaWZpeSh0b2tlbnMpe1xyXG4gICAgaWYgKHRva2Vucy5sZW5ndGg8PTEpe3JldHVybiB0b2tlbnN9XHJcbiAgICBsZXQgaT0wLG5ld1Rva2Vucz1bXTtcclxuICAgIHdoaWxlIChpPD0xMDAmJnRva2Vucy5zb21lKHRva2VuID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxyXG4gICAge1xyXG4gICAgICAgIGkrKztcclxuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIik7XHJcbiAgICAgICAgbGV0IE9wZXJhdGlvbkluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW4pID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpO1xyXG4gICAgICAgIGlmIChPcGVyYXRpb25JbmRleD09PS0xKXtyZXR1cm4gdG9rZW5zO31cclxuXHJcbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XHJcblxyXG4gICAgICAgIGxldCBudW1iZXJHcm91cCA9IHRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpKSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXHJcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcclxuICAgICAgICAucmVkdWNlKChzdW0sIGl0ZW0pID0+IHtcclxuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gXCItXCIpID8gLTEgOiAxO1xyXG4gICAgICAgIG11bHRpcGxpZXIgKj0gKGl0ZW0ub3JpZ2luYWxJbmRleCA8PSBlcWluZGV4KSA/IC0xIDogMTsgXHJcbiAgICAgICAgaWYgKCEoLyhudW1iZXIpLykudGVzdChpdGVtLnRva2VuLnR5cGUpKXttdWx0aXBsaWVyKj0tMX1cclxuICAgICAgICByZXR1cm4gc3VtICsgKGl0ZW0udG9rZW4udmFsdWUgKiBtdWx0aXBsaWVyKTtcclxuICAgICAgICB9LCAwKTsgXHJcbiAgICAgICAgXHJcbiAgICAgICAgbmV3VG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAuLi5jdXJyZW50VG9rZW4sXHJcbiAgICAgICAgICAgIHZhbHVlOiBudW1iZXJHcm91cFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMuZmlsdGVyKHRva2VuID0+IFxyXG4gICAgICAgICAgICB0b2tlbi50eXBlICE9PSB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgfHwgXHJcbiAgICAgICAgICAgICh0b2tlbi52YXJpYWJsZSAmJiB0b2tlbi52YXJpYWJsZSAhPT0gY3VycmVudFRva2VuLnZhcmlhYmxlKSB8fCBcclxuICAgICAgICAgICAgKHRva2VuLnBvdyAmJiB0b2tlbi5wb3cgIT09IGN1cnJlbnRUb2tlbi5wb3cpXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgIHJldHVybiBuZXdUb2tlbnM7XHJcbn1cclxuLypcclxuaWYgKCFhcmVUaGVyZU9wZXJhdG9ycylcclxuICAgIHtcclxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MCYmdmFyaWFibGVJbmRleC5sZW5ndGghPT0wJiZudW1iZXJJbmRleCE9PTApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBtYXRoSW5mby5hZGRTb2x1dGlvbkluZm8oYCR7dmFyaWFibGVJbmRleFswXS52YXJpYWJsZX0gPSBcXFxcZnJhY3ske251bWJlckluZGV4WzBdLnZhbHVlfX17JHt2YXJpYWJsZUluZGV4WzBdLnZhbHVlfX0gPSAkeyhudW1iZXJJbmRleFswXS52YWx1ZSkvKHZhcmlhYmxlSW5kZXhbMF0udmFsdWUpfWApXHJcbiAgICAgICAgICAgIHJldHVybiBgJHt2YXJpYWJsZUluZGV4WzBdLnZhcmlhYmxlfSA9ICR7KG51bWJlckluZGV4WzBdLnZhbHVlKS8odmFyaWFibGVJbmRleFswXS52YWx1ZSl9YFxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmKHRva2Vucy5sZW5ndGg9PT0xJiZudW1iZXJJbmRleCl7XHJcbiAgICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShudW1iZXJJbmRleC52YWx1ZT09PTApXHJcbiAgICAgICAgfVxyXG59Ki9cclxuXHJcbmZ1bmN0aW9uIHByYWlzaW5nTWV0aG9kKHRva2Vucyl7XHJcbiAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGUpPT50b2tlbnMuZmlsdGVyKHRva2VuID0+IHRva2VuLnR5cGUgPT09IHR5cGUpO1xyXG4gICAgY29uc3QgW251bWJlckluZGV4LHZhcmlhYmxlSW5kZXgscG93SW5kZXhdID0gW2ZpbHRlckJ5VHlwZShcIm51bWJlclwiKSxmaWx0ZXJCeVR5cGUoXCJ2YXJpYWJsZVwiKSxmaWx0ZXJCeVR5cGUoXCJwb3dlclZhcmlhYmxlXCIpXVxyXG4gICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgcmV0dXJuICdxdWFkcmF0aWMnO1xyXG4gICAgXHJcbiAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MCYmdmFyaWFibGVJbmRleC5sZW5ndGghPT0wJiZudW1iZXJJbmRleCE9PTApXHJcbiAgICAgICAgcmV0dXJuICdpc29sYXQnO1xyXG4gICAgXHJcbiAgICBpZih0b2tlbnMubGVuZ3RoPT09MSYmbnVtYmVySW5kZXgpIHJldHVybiAnaXNKdXN0TnVtYmVyJztcclxuXHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aFByYWlzZXJ7XHJcbiAgICBpbnB1dD1cIlwiO1xyXG4gICAgdG9rZW5zPVtdO1xyXG4gICAgc29sdXRpb249XCJcIjtcclxuICAgIG1hdGhJbmZvPW5ldyBNYXRoSW5mbygpO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGlucHV0KXtcclxuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xyXG4gICAgICAgIHRoaXMucHJvY2Vzc0lucHV0KCk7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9bmV3IFRva2Vucyh0aGlzLmlucHV0KTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlRva2VucyBhZnRlciB0b2tlbml6ZVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICB0aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xyXG4gICAgfVxyXG4gICAgZ2V0UmVkeWZvck5ld1JvbmQoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoSW5mbyh0aGlzLnRva2VucylcclxuICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKHRoaXMudG9rZW5zLnRva2Vucyx0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoKVxyXG4gICAgICAgIHRoaXMudG9rZW5zLmV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCk7XHJcbiAgICB9XHJcbiAgICBjb250cm9sbGVyKCl7XHJcbiAgICAgICAgdGhpcy5nZXRSZWR5Zm9yTmV3Um9uZCgpO1xyXG4gICAgICAgIGlmICh0aGlzLnNob3VsZFVzZVBvc2l0aW9uKCkpe1xyXG4gICAgICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLnRva2VucyxudWxsKTtcclxuICAgICAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJQYXJzZWQgZXhwcmVzc2lvblwiLCBKU09OLnN0cmluZ2lmeShwb3NpdGlvbiwgbnVsbCwgMSkpO1xyXG4gICAgICAgICAgICBpZiAocG9zaXRpb24gPT09IG51bGwmJnRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MSl7XHJcbiAgICAgICAgICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKFwicGFyc2UodG9rZW5zKVwiLHBhcnNlKHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJ0aGUgKioqKlwiXHJcbiAgICAgICAgICAgIC8vIHJldHVybiBzb2x1dGlvbih0b2tlbnMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHBvc2l0aW9uLmluZGV4ID09PSBudWxsKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uLmNoZWNrRnJhYygpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnVzZVBhcnNlKHBvc2l0aW9uKVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICBjb25zdCBtZXRob2Q9cHJhaXNpbmdNZXRob2QodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhtZXRob2QpXHJcbiAgICAgICAgICAgIGlmIChtZXRob2Q9PT0ncXVhZHJhdGljJyl7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy50b2tlbnM9c2ltcGxpZml5KHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4KVxyXG4gICAgICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzaW1wbGlmaXkodG9rZW5zKVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXT8udmFsdWUgIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyaWFibGVJbmRleFswXT8udmFsdWUgfCAwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBudW1iZXJJbmRleFswXT8udmFsdWUgKiAtMXwgMCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy9pZiAoc29sdmVkID09PSBudWxsfHx0eXBlb2Ygc29sdmVkPT09XCJzdHJpbmdcIikge3JldHVybiBzb2x2ZWQ7IH1cclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTtcclxuICAgIH1cclxuICAgIHVzZVBhcnNlKHBvc2l0aW9uKXtcclxuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZShwb3NpdGlvbik7XHJcblxyXG4gICAgICAgIC8vdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzb2x2ZWRcIixzb2x2ZWQpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbih0aGlzLnRva2Vucyxwb3NpdGlvbixzb2x2ZWQpXHJcbiAgICAgICAgY29uc3QgW2xlZnRCcmVhayxsZW5ndGhdID0gW3Bvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhci1wb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcl1cclxuICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJuZXdUb2tlbnNcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICB9XHJcblxyXG4gICAgc2hvdWxkVXNlUG9zaXRpb24oKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMudG9rZW5zLnNvbWUodG9rZW49Pi8ob3BlcmF0b3IpLy50ZXN0KHRva2VuLnR5cGUpJiYhLyg9KS8udGVzdCh0b2tlbi52YWx1ZSkpXHJcbiAgICB9XHJcblxyXG4gICAgYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSl7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxyXG4gICAgfVxyXG4gICAgcHJvY2Vzc0lucHV0KCl7XHJcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XHJcbiAgICAgICAgLnJlcGxhY2UoLyhcXHN8XFxcXGxlZnR8XFxcXHJpZ2h0KS9nLCBcIlwiKSBcclxuICAgICAgICAucmVwbGFjZSgvey9nLCBcIihcIilcclxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcclxuICAgICAgICAucmVwbGFjZSgvKFxcXFxjZG90fGNkb3QpL2csIFwiKlwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC9NYXRoLi9nLCBcIlxcXFxcIilcclxuICAgICAgICAucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XHJcbiAgICB9XHJcbiAgICBmaW5hbFJldHVybigpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5jbGFzcyBUb2tlbnN7XHJcbiAgICB0b2tlbnM9W107XHJcbiAgICBjb25zdHJ1Y3RvcihtYXRoKXtcclxuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUobWF0aCl7XHJcbiAgICAgICAgbGV0IHRva2VucyA9IFtdO1xyXG4gICAgICAgIGxldCBicmFja2V0cyA9IDAsICBsZXZlbENvdW50ID0ge307XHJcbiAgICAgICAgbGV0IGo9MDtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaisrO1xyXG4gICAgICAgICAgICBpZihqPjUwMCl7YnJlYWs7fVxyXG4gICAgICAgICAgICBsZXQgbnVtYmVyPTAsICBzdGFydFBvcyA9IGksdmFyaT1cIlwiO1xyXG5cclxuICAgICAgICAgICAgaWYgKG1hdGhbaV0gPT09IFwiKFwiKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWxldmVsQ291bnRbYnJhY2tldHNdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWxDb3VudFticmFja2V0c10gPSAwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10rKztcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJwYXJlblwiLCB2YWx1ZTogXCIoXCIsIGlkOiBicmFja2V0cyArIFwiLlwiICsgSUQsIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xyXG4gICAgICAgICAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSBcIilcIikge1xyXG4gICAgICAgICAgICAgICAgYnJhY2tldHMtLTsgXHJcbiAgICAgICAgICAgICAgICBpZiAoYnJhY2tldHMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5tYXRjaGVkIGNsb3NpbmcgYnJhY2tldCBhdCBwb3NpdGlvblwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdIC0gMTtcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJwYXJlblwiLCB2YWx1ZTogXCIpXCIsIGlkOiBicmFja2V0cyArIFwiLlwiICsgKElEID49IDAgPyBJRCA6IDApfSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKG1hdGhbaV0gPT09IFwiXFxcXFwiKSB7XHJcbiAgICAgICAgICAgICAgICBpKz0xOyAgXHJcbiAgICAgICAgICAgICAgICBsZXQgb3BlcmF0b3IgPSAobWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rLykgfHwgW1wiXCJdKVswXVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwib3BlcmF0b3JcIiwgdmFsdWU6IG9wZXJhdG9yfSk7XHJcbiAgICAgICAgICAgICAgICBpKz1vcGVyYXRvci5sZW5ndGg7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09IFwic3FydFwiICYmIG1hdGhbaV0gPT09IFwiW1wiICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcclxuICAgICAgICAgICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxyXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGktLTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xyXG4gICAgICAgICAgICBpZiAoISFtYXRjaClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbnVtYmVyPW1hdGNoWzBdXHJcbiAgICAgICAgICAgICAgICBpKz1udW1iZXIubGVuZ3RoPjE/bnVtYmVyLmxlbmd0aC0xOjA7XHJcbiAgICAgICAgICAgICAgICAvL2lmKC9bKy1dLy50ZXN0KG1hdGhbc3RhcnRQb3MtMV0pKXtudW1iZXI9bWF0aFtzdGFydFBvcy0xXStudW1iZXJ9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vaWYgKG1hdGhbaSsxXSYmL1thLXpBLVpdLy50ZXN0KG1hdGhbaSsxXSkpe2NvbnRpbnVlO31cclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJudW1iZXJcIiwgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKX0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmICgvW2EtekEtWl0vLnRlc3QobWF0aFtpXSkpIHtcclxuICAgICAgICAgICAgICAgIHZhcmk9IChtYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLykgfHwgW1wiXCJdKVswXTtcclxuICAgICAgICAgICAgICAgIGlmICh2YXJpJiZ2YXJpLmxlbmd0aD09PTApe3Zhcmk9bWF0aC5zbGljZShpLG1hdGgubGVuZ3RoKX1cclxuICAgICAgICAgICAgICAgLy8gbnVtYmVyPW1hdGguc2xpY2UoaSt2YXJpLmxlbmd0aCx2YXJpLmxlbmd0aCtpK21hdGguc2xpY2UoaSt2YXJpLmxlbmd0aCkuc2VhcmNoKC9bXjAtOV0vKSlcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaSs9dmFyaS5sZW5ndGgtMS8vK251bWJlci5sZW5ndGgtMTtcclxuICAgICAgICAgICAgICAgIC8vbnVtYmVyPXNhZmVUb051bWJlcihudW1iZXIubGVuZ3RoPjA/bnVtYmVyOjEpO1xyXG4gICAgICAgICAgICAgICAgLypcclxuICAgICAgICAgICAgICAgIGlmICgvWzAtOV0vLnRlc3QobWF0aFtzdGFydFBvcz4wP3N0YXJ0UG9zLTE6MF0pJiZ0b2tlbnMpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVyPShtYXRoLnNsaWNlKDAsc3RhcnRQb3MpLm1hdGNoKC9bMC05Ll0rKD89W14wLTkuXSokKS8pfHwgW1wiXCJdKVswXTtcclxuICAgICAgICAgICAgICAgICAgICAvL251bWJlcj1tYXRoW3N0YXJ0UG9zLW51bWJlci5sZW5ndGgtMV0mJm1hdGhbc3RhcnRQb3MtbnVtYmVyLmxlbmd0aC0xXT09PVwiLVwiP1wiLVwiK251bWJlcjpudW1iZXI7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmKC9bLV0vLnRlc3QobWF0aFtzdGFydFBvcy0xXSkpe251bWJlcj1tYXRoW3N0YXJ0UG9zLTFdK251bWJlcn0qL1xyXG4gICAgICAgICAgICAgICAgLy9zYWZlVG9OdW1iZXIobnVtYmVyKVxyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goe3R5cGU6IFwidmFyaWFibGVcIix2YXJpYWJsZTogdmFyaS5yZXBsYWNlKFwiKFwiLFwie1wiKS5yZXBsYWNlKFwiKVwiLFwifVwiKSx2YWx1ZTogMX0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICgvWyovXj0rLV0vLnRlc3QobWF0aFtpXSkpIHtcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJvcGVyYXRvclwiLCB2YWx1ZTogbWF0aFtpXX0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy9pZiAoL1srLVxcZF0vLnRlc3QobWF0aFtpXSkpe2NvbnRpbnVlO31cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChicmFja2V0cyE9PTApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgKFwiVW5tYXRjaGVkIG9wZW5pbmcgYnJhY2tldChzKVwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnM7XHJcbiAgICAgICAgdGhpcy5wb3N0UHJvY2Vzc1Rva2VucygpO1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgdmFsaWRhdGVJbmRleChpbmRleCxtYXJnaW4pe1xyXG4gICAgICAgIG1hcmdpbj1tYXJnaW4/bWFyZ2luOjA7XHJcbiAgICAgICAgcmV0dXJuIGluZGV4PjArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtMS1tYXJnaW47XHJcbiAgICB9XHJcbiAgICB2YWxpZGF0ZVBNKG1hcCl7XHJcbiAgICAgICAgbWFwLmZvckVhY2goaW5kZXggPT4ge1xyXG4gICAgICAgICAgICBpbmRleD10aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgsMSkmJnRoaXMudG9rZW5zW2luZGV4LTFdLnR5cGU9PT0nb3BlcmF0b3InfHx0aGlzLnRva2Vuc1tpbmRleCsxXS50eXBlPT09J29wZXJhdG9yJz9udWxsOmluZGV4O1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBtYXBcclxuICAgIH1cclxuICAgIHZhbGlkYXRlUGFyZW4obWFwKXtcclxuICAgICAgICBcclxuICAgIH1cclxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XHJcbiAgICAgICAgLypydWxlcyB0byBhYmlkIGJ5OlxyXG4gICAgICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcclxuICAgICAgICAqL1xyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLnR5cGUubWF0Y2godGhpcy52YWx1ZVRva2VucygpKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIHRoaXMucmVJRHBhcmVudGhlc2VzKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+ICh0b2tlbi50eXBlPT09J251bWJlcid8fHRva2VuLnR5cGU9PT0ndmFyaWFibGUnKT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IGFycj1maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwKTtcclxuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtYXBDYXJyb3Q9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi52YWx1ZT09PSdeJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXHJcblxyXG5cclxuICAgICAgICBsZXQgbWFwUE09dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi52YWx1ZT09PScrJ3x8dG9rZW4udmFsdWU9PT0nLSc/aW5kZXg6bnVsbCkuZmlsdGVyKGluZGV4PT4gaW5kZXghPT1udWxsKVxyXG4gICAgICAgIG1hcFBNPXRoaXMudmFsaWRhdGVQTShtYXBQTSlcclxuXHJcbiAgICAgICAgbWFwUE0ucmV2ZXJzZSgpLmZvckVhY2goaW5kZXggPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB2YWx1ZT10aGlzLnRva2Vuc1tpbmRleF0udmFsdWU9PT0nKyc/MTotMTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXgrMV0udmFsdWUqPXZhbHVlO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBpZHg9dGhpcy5maW5kUGFyZW5JbmRleChudWxsLGluZGV4KS5vcGVuO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXgrMV0udmFsdWU9PT0nKCcmJihpZHg9PT0wfHwhLyhmcmFjfGJpbm9tKS8udGVzdCh0aGlzLnRva2Vuc1tpZHgtMV0udmFsdWUpKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIC8vTWFwIHBhcmVudGhlc2VzIGZvciBpbXBsaWNpdCBtdWx0aXBsaWNhdGlvbi5cclxuICAgICAgICBjb25zdCBtYXBQYXJlbiA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4geyBcclxuICAgICAgICAgICAgICAgIC8vIFxyXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSBcIihcIiB8fCAodG9rZW4udHlwZSA9PT0gJ29wZXJhdG9yJyAmJiAhL1srXFwtKi9ePV0vLnRlc3QodG9rZW4udmFsdWUpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCAtIDEpID8gaW5kZXggOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlbi52YWx1ZSA9PT0gXCIpXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggKyAxKSB8fHRlc3REb3VibGVSaWdodChpbmRleCk/IGluZGV4KzEgOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgbWFwUGFyZW4uc29ydCgoYSwgYikgPT4gYiAtIGEpXHJcbiAgICAgICAgLmZvckVhY2godmFsdWUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UodmFsdWUsIDAsIHsgdHlwZTogJ29wZXJhdG9yJywgdmFsdWU6ICcqJywgaW5kZXg6IDAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vSW1wbGljaXQgcG93ZXJzXHJcbiAgICAgICAgXHJcbiAgICB9XHJcblxyXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyB0aGlzLmZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgpIDogbnVsbClcclxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XHJcbiAgICAgICAgICAgIGlmIChvcGVuSW5kZXg+MCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKC9vcGVyYXRvcnxwYXJlbi8udGVzdCh0aGlzLnRva2Vuc1tvcGVuSW5kZXggLSAxXS50eXBlKSkgey8vICYmIHByZXZUb2tlbi52YWx1ZSAhPT0gXCI9XCJcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoY2xvc2VJbmRleDx0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdLnR5cGUgPT09IFwib3BlcmF0b3JcIiAmJiB0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0udmFsdWUgIT09IFwiPVwiKSB7Ly90aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV1cclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIC8qXHJcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cclxuICAgICAgICAgICAgICAgICgodG9rZW5zW2luZGV4ICsgMl0/LnR5cGUgIT09IFwib3BlcmF0b3JcIiYmdG9rZW5zW2luZGV4IC0xXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiKVxyXG4gICAgICAgICAgICAgICAgJiYodGhpcy50b2tlbkNvbXBhcmUoXCJ0eXBlXCIsdGhpcy52YWx1ZVRva2VucygpLCB0b2tlbiwgdG9rZW5zW2luZGV4ICsgMV0pKVxyXG4gICAgICAgICkpO1xyXG4gICAgIH0qL1xyXG5cclxuICAgICB2YWx1ZVRva2Vucygpe3JldHVybiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS99XHJcblxyXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xyXG4gICAgICAgIGNvbnN0IG1hcCA9IG5ldyBTZXQodGhpcy5tYXBQYXJlbkluZGV4ZXMoKS5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pKTtcclxuICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAhbWFwLmhhcyhpZHgpKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2hlY2s9KGluZGV4KT0+KHRoaXMudG9rZW5zW2luZGV4LTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRoaXMudG9rZW5zW2luZGV4KzFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcblxyXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IHBvd01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnR5cGU9PT0ncG93ZXJWYXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxyXG5cclxuICAgICAgICBjb25zdCBhcnIgPSBbXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhudW1NYXApLCBcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMocG93TWFwKVxyXG4gICAgICAgIF07XHJcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5yZUlEcGFyZW50aGVzZXModGhpcy50b2tlbnMpXHJcbiAgICB9XHJcblxyXG4gICAgY29ubmVjdEFuZENvbWJpbmUoYXJyKXtcclxuICAgICAgICBjb25zdCBpbmRleGVzPVtdXHJcbiAgICAgICAgYXJyLnNvcnQoKGEsIGIpID0+IGJbMF0gLSBhWzBdKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgaW5kZXhlcy5wdXNoKHtzdGFydDogZWxbMF0sZW5kOiBlbFtlbC5sZW5ndGggLSAxXX0pXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaW5kZXhlcy5mb3JFYWNoKGluZGV4ID0+IHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlID0gTnVtYmVyKHRoaXMudG9rZW5zW2luZGV4LnN0YXJ0XS52YWx1ZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzVmFyPXRoaXMudG9rZW5zLnNsaWNlKGluZGV4LnN0YXJ0LGluZGV4LmVuZCsxKS5maW5kKHRva2VuPT4gdG9rZW4udHlwZS5pbmNsdWRlcygndmFyJykpO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpPWluZGV4LnN0YXJ0KzE7aTw9aW5kZXguZW5kO2krKyl7XHJcbiAgICAgICAgICAgICAgIHZhbHVlID0gKGlzVmFyID8gKHRoaXMudG9rZW5zW2ldLnZhbHVlICogdmFsdWUpIDogKHRoaXMudG9rZW5zW2ldLnZhbHVlICsgdmFsdWUpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCB1cGRhdGVkVG9rZW4gPSB0aGlzLm5ld09iaih2YWx1ZSxpc1Zhcj8udmFyaWFibGUpXHJcblxyXG4gICAgICAgICAgICBpZiAoaXNWYXIpdXBkYXRlZFRva2VuLnZhcmlhYmxlPWlzVmFyLnZhcmlhYmxlXHJcblxyXG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleC5zdGFydF0gPSB1cGRhdGVkVG9rZW47XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5zdGFydCsxLCBpbmRleC5lbmQgLSBpbmRleC5zdGFydCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBuZXdPYmoodmFsdWUsdmFyaWFibGUpe1xyXG4gICAgICAgIGNvbnN0IG9iaj17aW5kZXg6MH1cclxuICAgICAgICBvYmoudHlwZT12YXJpYWJsZT8ndmFyaWFibGUnOidudW1iZXInO1xyXG4gICAgICAgIG9iai52YWx1ZT12YWx1ZVxyXG4gICAgICAgIGlmKHZhcmlhYmxlKW9iai52YXJpYWJsZT12YXJpYWJsZVxyXG4gICAgICAgIHJldHVybiBvYmo7XHJcbiAgICB9XHJcblxyXG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxyXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW4udHlwZSkpIFxyXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtyZXR1cm4gSW5maW5pdHl9XHJcbiAgICB9XHJcbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQsIGxlbmd0aCwgb2JqZWN0cykge1xyXG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xyXG4gICAgfVxyXG4gICAgcmVjb25zdHJ1Y3QodG9rZW5zKXtcclxuICAgICAgICBpZiAodG9rZW5zPT09dW5kZWZpbmVkKXtcclxuICAgICAgICAgICAgdG9rZW5zPXRoaXMudG9rZW5zO1xyXG4gICAgICAgIH1cclxuICAgICAgICBsZXQgbWF0aCA9IFwiXCI7XHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8dG9rZW5zLmxlbmd0aDtpKyspe1xyXG4gICAgICAgICAgICBsZXQgdGVtcDtcclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbdG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuLCBpbmRleCkgPT4gdG9rZW4uaWQgPT09IHRva2Vuc1tpXS5pZCYmdG9rZW5zW2luZGV4KzFdKSsxXS52YWx1ZT09PVwiL1wiKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBtYXRoKz1cIlxcXFxmcmFjXCI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc3dpdGNoICh0b2tlbnNbaV0udHlwZSl7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwibnVtYmVyXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGVtcD0ocGx1c1N5bWJvbENoZWNrKHRva2VucyxpKT9cIitcIjpcIlwiKStyb3VuZEJ5U2V0dGluZ3ModG9rZW5zW2ldLnZhbHVlKVxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPXRlbXArKGkrMTx0b2tlbnMubGVuZ3RoJiYvKGZyYWMpLy50ZXN0KHRva2Vuc1tpKzFdLnZhbHVlKT9cIitcIjpcIlwiKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJwYXJlblwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRlbXA9dG9rZW5zW3RoaXMuZmluZFBhcmVuSW5kZXgodG9rZW5zW2ldLmlkKS5vcGVuLTFdXHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB0ZW1wICE9PSBcInVuZGVmaW5lZFwiICYmIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAoKGN1cmx5QnJhY2tldHNSZWdleC50ZXN0KHRlbXAudmFsdWUpKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKC9cXCkvLnRlc3QodGVtcC52YWx1ZSkgJiYgY3VybHlCcmFja2V0c1JlZ2V4LnRlc3QodG9rZW5zW3RoaXMuZmluZFBhcmVuSW5kZXgodGVtcC5pZCkub3BlbiAtIDFdLnZhbHVlKSkpKSBcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGggKz0gdG9rZW5zW2ldLnZhbHVlLnJlcGxhY2UoL1xcKC8sIFwie1wiKS5yZXBsYWNlKC9cXCkvLCBcIn1cIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGk+MCYmdG9rZW5zW2ldLnZhbHVlPT09XCIoXCImJnRva2Vuc1tpLTFdPy52YWx1ZT09PVwiKVwiKXttYXRoKz1cIitcIn1cclxuICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwib3BlcmF0b3JcIjpcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSAhPT0gXCIvXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHRva2Vuc1tpXS52YWx1ZSkucmVwbGFjZSgvKFteKl49LystXSkvLFwiXFxcXCQxXCIpLnJlcGxhY2UoL1xcKi9nLFwiXFxcXGNkb3QgXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcclxuICAgICAgICAgICAgICAgICAgICBtYXRoKz0ocGx1c1N5bWJvbENoZWNrKHRva2VucyxpKT9cIitcIjpcIlwiKSsodG9rZW5zW2ldLnZhbHVlIT09MT90b2tlbnNbaV0udmFsdWU6XCJcIikrdG9rZW5zW2ldLnZhcmlhYmxlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInBvd2VyVmFyaWFibGVcIjpcclxuICAgICAgICAgICAgICAgICAgICBtYXRoKz0ocGx1c1N5bWJvbENoZWNrKHRva2VucyxpKT9cIitcIjpcIlwiKSsodG9rZW5zW2ldLnZhbHVlIT09MT90b2tlbnNbaV0udmFsdWU6XCJcIikrdG9rZW5zW2ldLnZhcmlhYmxlK2BeeyR7dG9rZW5zW2ldLnBvd319YDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHRva2luIHR5cGUgZ2l2ZW4gdG8gcmVjb25zdHJ1Y3Q6IHR5cGUgJHt0b2tlbnNbaV0udHlwZX1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWF0aFxyXG4gICAgfVxyXG4gICAgZmluZFBhcmVuSW5kZXgoaWQsaW5kZXgpe1xyXG4gICAgICAgIHRyeXtcclxuICAgICAgICAgICAgaWQ9aWQ/aWQ6dGhpcy50b2tlbnNbaW5kZXhdLmlkO1xyXG4gICAgICAgICAgICBjb25zdCBvcGVuPXRoaXMudG9rZW5zLmZpbmRJbmRleChcclxuICAgICAgICAgICAgICAgIHRva2VuPT50b2tlbi52YWx1ZT09PVwiKFwiXHJcbiAgICAgICAgICAgICAgICAmJnRva2VuLmlkPT09aWRcclxuICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICBjb25zdCBjbG9zZT10aGlzLnRva2Vucy5maW5kTGFzdEluZGV4KFxyXG4gICAgICAgICAgICAgICAgdG9rZW49PnRva2VuLnZhbHVlPT09XCIpXCJcclxuICAgICAgICAgICAgICAgICYmdG9rZW4uaWQ9PT1pZFxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICAgIHJldHVybntvcGVuOiBvcGVuLGNsb3NlOiBjbG9zZSxpZDppZH1cclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2goZSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdG9rZW5Db21wYXJlKGNvbXBhcmUsIHZhbHVlLCB0b2tlbiwgbmV4dFRva2VuKSB7XHJcbiAgICAgICAgdmFsdWUgPSB2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCA/IHZhbHVlIDogbmV3IFJlZ0V4cCh2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlLnRlc3QodG9rZW5bY29tcGFyZV0pKSAmJlxyXG4gICAgICAgICAgICB0b2tlbltjb21wYXJlXSA9PT0gbmV4dFRva2VuPy5bY29tcGFyZV1cclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIHJlSURwYXJlbnRoZXNlcygpIHtcclxuICAgICAgICBsZXQgdG9rZW5zPXRoaXMudG9rZW5zXHJcbiAgICAgICAgbGV0IGJyYWNrZXRzID0gMCwgbGV2ZWxDb3VudCA9IHt9O1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKFwiKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWxldmVsQ291bnRbYnJhY2tldHNdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWxDb3VudFticmFja2V0c10gPSAwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10rKztcclxuICAgICAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxyXG4gICAgICAgICAgICAgICAgdG9rZW5zW2ldID0geyAuLi50b2tlbnNbaV0sIGlkOiBicmFja2V0cyArIFwiLlwiICsgSUQgfTtcclxuICAgICAgICAgICAgICAgIGJyYWNrZXRzKys7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSBcIilcIikge1xyXG4gICAgICAgICAgICAgICAgYnJhY2tldHMtLTtcclxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdIC0gMTtcclxuICAgICAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxyXG4gICAgICAgICAgICAgICAgdG9rZW5zW2ldID0geyAuLi50b2tlbnNbaV0sIGlkOiBicmFja2V0cyArIFwiLlwiICsgKElEID49IDAgPyBJRCA6IDApIH07XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoYnJhY2tldHMhPT0wKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy90aHJvdyBuZXcgRXJyb3IgKFwiVW5tYXRjaGVkIG9wZW5pbmcgYnJhY2tldChzKSBlcnIgcmF0ZTogXCIrYnJhY2tldHMpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2VucztcclxuICAgIH1cclxufVxyXG5cclxuY29uc3QgcGx1c1N5bWJvbENoZWNrID0gKHRva2VucywgaW5kZXgpID0+IHtcclxuICAgIGlmICghaW5kZXggPiAwKSByZXR1cm4gZmFsc2U7XHJcbiAgICByZXR1cm4gdG9rZW5zW2luZGV4XS52YWx1ZSA+PSAwICYmIC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2Vuc1tpbmRleCAtIDFdLnR5cGUpO1xyXG59O1xyXG5cclxuXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycikge1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG4gICAgbGV0IHN0YWNrID0gQXJyYXkuaXNBcnJheShhcnIpID8gWy4uLmFycl0gOiBbYXJyXTsgIC8vIEVuc3VyZSBhcnIgaXMgYW4gYXJyYXkgb3Igd3JhcCBpdCBpbiBvbmVcclxuXHJcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpO1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XHJcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7ICAvLyBTcHJlYWQgdGhlIGFycmF5IGl0ZW1zIHRvIHRoZSBzdGFja1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpOyAgLy8gQWRkIG5vbi1hcnJheSBpdGVtcyB0byB0aGUgcmVzdWx0XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpOyAgLy8gUmV2ZXJzZSB0byBtYWludGFpbiBvcmlnaW5hbCBvcmRlclxyXG59XHJcbmNsYXNzIFRva2Vue1xyXG4gICAgdHlwZVxyXG4gICAgdmFsdWVcclxuICAgIHZhcmlhYmxlXHJcbiAgICBwb3dcclxuICAgIGlkXHJcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZSx2YXJpYWJsZSl7XHJcblxyXG4gICAgfVxyXG59Il19