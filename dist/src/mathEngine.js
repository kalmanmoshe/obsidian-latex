import { quad, calculateBinom, roundBySettings, degreesToRadians, radiansToDegrees } from "./mathUtilities";
import { expandExpression, curlyBracketsRegex } from "./imVeryLazy";
import { type } from "os";
const greekLetters = [
    '',
];
const tokenIDCompare = (value, token, nextToken) => (value === null || token.id === value) && token.id === nextToken?.id;
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
function parse(tokens, mathInfo, position) {
    const { operator, specialChar, left, right } = position;
    if (typeof operator === "string" && typeof right.value !== "number" && !/(sqrt|cos|sin|tan)/.test(operator)) {
        throw new Error("Left side of " + operator + " must have a value");
    }
    if (typeof operator === "string" && typeof right.value !== "number") {
        throw new Error("Right side of " + operator + " must have a value");
    }
    const areThereOperators = tokens.some(token => /(operator)/.test(token.type) && !/(=)/.test(token.value));
    if (!areThereOperators) {
        tokens = simplifiy(tokens);
        mathInfo.addDebugInfo("simplifiy(tokens)", tokens);
        const filterByType = (type) => tokens.filter(token => token.type === type);
        const [numberIndex, variableIndex, powIndex] = [filterByType("number"), filterByType("variable"), filterByType("powerVariable")];
        if (powIndex.length === 1 && powIndex[0].pow === 2) {
            return quad(powIndex[0] ? powIndex[0].value : 0, variableIndex[0] ? variableIndex[0].value : 0, numberIndex[0] ? numberIndex[0].value * -1 : 0, powIndex[0].variable);
        }
        if (powIndex.length === 0 && variableIndex.length !== 0 && numberIndex !== 0) {
            mathInfo.addSolutionInfo(`${variableIndex[0].variable} = \\frac{${numberIndex[0].value}}{${variableIndex[0].value}} = ${(numberIndex[0].value) / (variableIndex[0].value)}`);
            return `${variableIndex[0].variable} = ${(numberIndex[0].value) / (variableIndex[0].value)}`;
        }
        else if (tokens.length === 1 && numberIndex) {
            return JSON.stringify(numberIndex.value === 0);
        }
    }
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
            return;
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
    const isLeft = direction === "left";
    const indexModifier = isLeft ? -1 : 1;
    if ((isLeft && index <= 0) || (!isLeft && index >= tokens.tokens.length - 1) || !tokens.tokens[index + indexModifier]) {
        throw new Error("at applyPosition: \"index wasn't valid\" index: " + index);
    }
    if (tokens.tokens[index + indexModifier].type === "paren") {
        const parenIndex = tokens.findParenIndex(tokens.tokens[index + indexModifier].id);
        breakChar = isLeft ? parenIndex.open : parenIndex.close;
        target = tokens.tokens.slice(isLeft ? breakChar : index + 1, isLeft ? index : breakChar);
    }
    else {
        target = tokens.tokens[index + indexModifier];
    }
    const multiStep = Math.abs(breakChar - index) > 3;
    if (!multiStep && tokens.tokens[index + indexModifier].type === "paren") {
        target = target.find(item => /(number|variable|powerVariable)/.test(item.type));
    }
    if (target?.length === 0) {
        throw new Error(`at applyPosition: couldn't find target token for direction ${direction} and operator"${tokens.tokens[index].value}"`);
    }
    if (breakChar) {
        return {
            tokens: target,
            multiStep: multiStep,
            breakChar: breakChar
        };
    }
    breakChar = (breakChar !== index ? target?.index : breakChar) + indexModifier + (isLeft ? 0 : 1);
    delete target.index;
    return {
        ...target,
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
                console.log(this.right);
                this.right.breakChar + (this.right.multiStep ? 1 : 0);
                break;
            default:
                throw new Error(`Operator ${this.operator} was not accounted for, or is not the valid operator`);
        }
        this.specialChar = tokens.tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
    }
    checkMultiStep() {
        return this.left.multiStep || this.right.multiStep;
    }
    // If it is multi step, it needs to be expanded first Therefore, don't do it on multi step
    checkFrac(tokens) {
        return /(frac|\/)/.test(this.operator) && tokens.tokens.slice(this.left.index || this.index, this.right.index).some(t => t.type === 'variable' || t.type === 'powerVariable'); //this.left.type!=='number'&&this.right.type!=='number';
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
    //\\frac{132}{1260+x^{2}}=0.05
    //\\frac{132}{1260+x^{2}}=0.05
    getRedyforNewRond() {
        this.tokens.connectNearbyTokens();
        this.mathInfo.addMathInfo(this.tokens);
        //this.addDebugInfo(this.tokens.tokens,this.tokens.tokens.length)
        this.tokens.expressionVariableValidity();
    }
    controller() {
        this.getRedyforNewRond();
        const position = new Position(this.tokens, null);
        this.addDebugInfo("Parsed expression", JSON.stringify(position, null, 0.01));
        if (position === null && this.tokens.tokens.length > 1) {
            this.addDebugInfo("parse(tokens)", parse(this.tokens.tokens));
            return "the ****";
            // return solution(tokens);
        }
        else if (position.index === null) {
            return this.finalReturn();
        }
        if (position.checkFrac(this.tokens) || position.checkMultiStep()) {
            expandExpression(this.tokens, position);
            this.mathInfo.addSolutionInfo(this.tokens.reconstruct(this.tokens.tokens));
            return this.controller();
        }
        const solved = parse(this.tokens.tokens, this.mathInfo, position);
        this.mathInfo.addDebugInfo("solved", solved);
        if (solved === null) {
            return null;
        }
        if (typeof solved === "string") {
            return solved;
        }
        this.mathInfo.addSolution(this.tokens, position, solved);
        const [leftBreak, length] = [position.left.breakChar, position.right.breakChar - position.left.breakChar];
        this.tokens.insertTokens(leftBreak, length, solved);
        this.addDebugInfo("newTokens", this.tokens.tokens);
        return this.tokens.tokens.length > 1 ? this.controller() : this.finalReturn();
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
                tokens.push({ type: "paren", value: ")", id: brackets + "." + (ID >= 0 ? ID : 0), index: tokens.length });
                continue;
            }
            if (math[i] === "\\") {
                i += 1;
                let operator = (math.slice(i).match(/[a-zA-Z]+/) || [""])[0];
                tokens.push({ type: "operator", value: operator, index: tokens.length });
                i += operator.length;
                if (tokens[tokens.length - 1].value === "sqrt" && math[i] === "[" && i < math.length - 2) {
                    let temp = math.slice(i, i + 1 + math.slice(i).search(/[\]]/));
                    i += temp.length;
                    Object.assign(tokens[tokens.length - 1], { specialChar: safeToNumber(temp), });
                }
                i--;
                continue;
            }
            let match = math.slice(i).match(/^([0-9.]+)([a-zA-Z]?)/);
            if (match && !match[2]) {
                number = match[0];
                i += number.length > 1 ? number.length - 1 : 0;
                //if(/[+-]/.test(math[startPos-1])){number=math[startPos-1]+number}
                if (math[i + 1] && /[a-zA-Z]/.test(math[i + 1])) {
                    continue;
                }
                tokens.push({ type: "number", value: parseFloat(number), index: tokens.length ? tokens.length : 0 });
                continue;
            }
            match = math.slice(i).match(/^([0-9.]+)([a-zA-Z]?)/);
            if (/[a-zA-Z]/.test(math[i])) {
                vari = (math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/) || [""])[0];
                if (vari && vari.length === 0) {
                    vari = math.slice(i, math.length);
                }
                number = math.slice(i + vari.length, vari.length + i + math.slice(i + vari.length).search(/[^0-9]/));
                i += vari.length + number.length - 1;
                number = safeToNumber(number.length > 0 ? number : 1);
                if (/[0-9]/.test(math[startPos > 0 ? startPos - 1 : 0]) && tokens) {
                    number = (math.slice(0, startPos).match(/[0-9.]+(?=[^0-9.]*$)/) || [""])[0];
                    //number=math[startPos-number.length-1]&&math[startPos-number.length-1]==="-"?"-"+number:number;
                }
                else if (/[-]/.test(math[startPos - 1])) {
                    number = math[startPos - 1] + number;
                }
                tokens.push({ type: "variable", variable: vari.replace("(", "{").replace(")", "}"), value: safeToNumber(number), index: tokens.length });
                continue;
            }
            if (/[*/^=+-]/.test(math[i]) || (!/[a-zA-Z0-9]/.test(math[i + 1]) && /[+-]/.test(math[i]))) {
                tokens.push({ type: "operator", value: math[i], index: tokens.length ? tokens.length : 0 });
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
        this.reIDparentheses();
        let mapPM = this.tokens.map((token, index) => token.value === '+' || token.value === '-' ? index : null).filter(index => index !== null);
        mapPM = this.validatePM(mapPM);
        mapPM.reverse().forEach(index => {
            const value = this.tokens[index].value === '+' ? 1 : -1;
            this.tokens[index + 1].value *= value;
            this.tokens.splice(index, 1);
        });
        const check = (index) => {
            if (!this.validateIndex(index))
                return false;
            return this.tokens[index].type.match(this.valueTokens());
        };
        const testDoubleRight = (index) => {
            if (!this.validateIndex(index))
                return false;
            const idx = this.findParenIndex(null, index).open;
            return this.tokens[index + 1].value === '(' && (idx === 0 || !/(frac|binom)/.test(this.tokens[idx - 1].value));
        };
        const map = this.tokens
            .map((token, index) => {
            if (token.value === "(" || (token.type === 'operator' && !/[+\-*/^=]/.test(token.value))) {
                return check(index - 1) ? index : null;
            }
            else if (token.value === ")") {
                return check(index + 1) || testDoubleRight(index) ? index + 1 : null;
            }
            return null;
        })
            .filter(item => item !== null);
        map.sort((a, b) => b - a)
            .forEach(value => {
            this.tokens.splice(value, 0, { type: 'operator', value: '*', index: 0 });
        });
        /*
        if(/[(\\]/.test(math[i])&&i>0){
            const beforeParentheses=/(number|variable|powerVariable)/.test(tokens[tokens.length-1].type)
            
            const lastIndex = tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id) - 1;
            const betweenParentheses=math[i-1] === ")"&&(lastIndex<0||!/(frac|binom|)/.test(tokens[lastIndex].value))
            
            if ((tokens.length-1>=0&&beforeParentheses)||(betweenParentheses)) {
                if(math[i-1]==="-"){math = math.slice(0, i)+ "1" +math.slice(i)}
                tokens.push({ type: "operator", value: "*", index: tokens.length?tokens.length:0 });
                if(math[i+1]==="-"){math = math.slice(0, i)+ "1" +math.slice(i)}
            }
        }*/
        this.reIDparentheses();
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
    valueTokens() {
        return /(number|variable|powerVariable)/;
    }
    connectNearbyTokens() {
        const map = new Set(this.mapParenIndexes().flatMap(({ open, close }) => [open, close]));
        this.tokens = this.tokens.filter((_, idx) => !map.has(idx));
        const check = (index) => (this.tokens[index - 1]?.type !== "operator" && this.tokens[index + 1]?.type !== "operator");
        const numMap = this.tokens.map((token, index) => token.type === 'number' && check(index) ? index : null).filter(item => item !== null);
        const varMap = this.tokens.map((token, index) => token.type === 'variable' && check(index) ? index : null).filter(item => item !== null);
        const powMap = this.tokens.map((token, index) => token.type === 'powerVariable' && check(index) ? index : null).filter(item => item !== null);
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
        const arr = [
            ...findConsecutiveSequences(numMap),
            ...findConsecutiveSequences(varMap),
            ...findConsecutiveSequences(powMap)
        ];
        arr.sort((a, b) => b[0] - a[0]);
        const objArr = [];
        arr.forEach(el => {
            objArr.push({ start: el[0], end: el[el.length - 1] });
        });
        this.connectAndCombine(objArr);
        this.reIDparentheses(this.tokens);
    }
    connectAndCombine(indexes) {
        let value = 0;
        indexes.forEach(index => {
            for (let i = index.start; i <= index.end; i++) {
                value += this.tokens[i].value;
            }
            this.tokens[index.start].value = value;
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
    reorder() {
        let newTokens = [];
        for (let i = 0; i < this.tokens.length; i++) {
            let newToken = { ...this.tokens[i], index: i };
            newTokens.push(newToken);
        }
        this.tokens = newTokens;
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
                    //console.log(plusSymbolCheck(tokens,i))
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
            //console.log(tokens)
            //throw new Error ("Unmatched opening bracket(s) err rate: "+brackets)
        }
        this.tokens = tokens;
        this.reorder();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzFCLE1BQU0sWUFBWSxHQUFDO0lBQ2YsRUFBRTtDQUNMLENBQUE7QUFFRCxNQUFNLGNBQWMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FDL0MsQ0FBQyxLQUFLLEtBQUcsSUFBSSxJQUFFLEtBQUssQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUUsRUFBRSxDQUFDO0FBR3JFLE1BQU0sb0JBQW9CLEdBQUc7SUFDekIsbUJBQW1CLEVBQUUsQ0FBQyxHQUFHLENBQUM7SUFDMUIsNEJBQTRCLEVBQUUsQ0FBQyxNQUFNLENBQUM7SUFDdEMsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7SUFDckIsT0FBTyxFQUFFLENBQUMsR0FBRyxDQUFDO0lBQ2QsMEJBQTBCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQztJQUN2RyxxQkFBcUIsRUFBRSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUMsR0FBRyxDQUFDO0NBQy9DLENBQUM7QUFDRixNQUFNLGFBQWEsR0FBRztJQUNsQixJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUs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QUFFLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxFQUFFO2dCQUN2RSxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssSUFBSSxDQUFDLEVBQUU7YUFDN0UsQ0FBQztZQUNGLE1BQU0sSUFBSSxLQUFLLENBQUMsMEVBQTBFLENBQUMsQ0FBQTtZQUMzRixPQUFPO1NBQ1Y7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFDakQsTUFBTSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsUUFBUSxDQUFBLENBQUMsQ0FBQSxTQUFTLENBQUM7UUFFdkQsSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM3QyxHQUFHLEdBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxJQUFFLEdBQUcsS0FBRyxDQUFDLElBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxHQUFHLENBQUM7UUFDMUUsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksU0FBUyxDQUFDO1FBRzlCLDZDQUE2QztRQUM3QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUNwQyxNQUFNLEtBQUssR0FBRyxTQUFTLEdBQUcsVUFBVSxDQUFDO1FBQ3JDLDBEQUEwRDtRQUMxRCxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ1gsTUFBTSxD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QUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFNUQsTUFBTSxLQUFLLEdBQUMsQ0FBQyxLQUFLLEVBQUMsRUFBRSxDQUFBLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxLQUFLLFVBQVUsSUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUE7UUFFM0csTUFBTSxNQUFNLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFHLFFBQVEsSUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFBO1FBQzFILE1BQU0sTUFBTSxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksS0FBRyxVQUFVLElBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxDQUFDLE1B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QUFNLEdBQUMsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNuQixDQUFDO0NBQ0o7QUFFRCxNQUFNLGVBQWUsR0FBRyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtJQUN0QyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUM3QixPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3RHLENBQUMsQ0FBQztBQUlGLE1BQU0sVUFBVSxZQUFZLENBQUMsR0FBRztJQUM1QixJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7SUFDaEIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUUsMkNBQTJDO0lBRS9GLE9BQU8sS0FBSyxDQUFDLE1BQU0sRUFBRTtRQUNqQixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekIsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3JCLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFFLHNDQUFzQztTQUMvRDthQUFNO1lBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFFLG9DQUFvQztTQUMzRDtLQUNKO0lBRUQsT0FBTyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBRSxxQ0FBcUM7QUFDbkUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4vaW1WZXJ5TGF6eVwiO1xyXG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XHJcbmNvbnN0IGdyZWVrTGV0dGVycz1bXHJcbiAgICAnJyxcclxuXVxyXG5cclxuY29uc3QgdG9rZW5JRENvbXBhcmUgPSAodmFsdWUsIHRva2VuLCBuZXh0VG9rZW4pID0+IFxyXG4gICAgKHZhbHVlPT09bnVsbHx8dG9rZW4uaWQgPT09IHZhbHVlKSAmJiB0b2tlbi5pZCA9PT0gbmV4dFRva2VuPy5pZDtcclxuXHJcblxyXG5jb25zdCBvcGVyYXRvcnNGb3JNYXRoaW5mbyA9IHtcclxuICAgIGJvdGhCdXRSaWdodEJyYWNrZXQ6IFtcIl5cIl0sXHJcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxyXG4gICAgYm90aDogW1wiK1wiLCBcIi1cIiwgXCIqXCJdLFxyXG4gICAgc3BlY2lhbDogW1wiPVwiXSxcclxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXHJcbiAgICBkb3VibGVSaWdodEJ1dEJyYWNrZXQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiLFwiL1wiXVxyXG59O1xyXG5jb25zdCBvcGVyYXRvclNpZGVzID0ge1xyXG4gICAgYm90aDogW1wiXlwiLCBcIitcIiwgXCItXCIsIFwiKlwiLCBcIi9cIiwgXCI9XCJdLFxyXG4gICAgcmlnaHRPbmx5OiBbXCJzcXJ0XCIsIFwic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxyXG4gICAgZG91YmxlUmlnaHQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiXVxyXG59O1xyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xyXG4gICAgZGVidWdJbmZvPVwiXCI7XHJcbiAgICBzb2x1dGlvbkluZm89W107XHJcbiAgICBtYXRoSW5mbz1bXVxyXG4gICAgZ3JhcGg9XCJcIjtcclxuICAgIGFkZEdyYXBoSW5mbyh2YWx1ZSl7XHJcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obXNnLCB2YWx1ZSl7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPSh0eXBlb2YgbXNnPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeShtc2cpOm1zZykrXCIgOiBcIisodHlwZW9mIHZhbHVlPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeSh2YWx1ZSk6dmFsdWUpKyBcIlxcbiBcIjtcclxuICAgIH1cclxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXMpe1xyXG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlNvbHZlZFwiLG1lcyk7XHJcbiAgICB9XHJcbiAgICBhZGRNYXRoSW5mbyh0b2tlbnMpe1xyXG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5wdXNoKHJlY29uc3RydWN0ZWRNYXRoKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFNvbHV0aW9uKHRva2Vucyxwb3NpdGlvbixzb2x1dGlvbil7XHJcbiAgICAgICAgc29sdXRpb249dG9rZW5zLnJlY29uc3RydWN0KFtzb2x1dGlvbl0pO1xyXG4gICAgICAgIGNvbnN0IGxlZnQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24uaW5kZXgpKTtcclxuICAgICAgICBjb25zdCByaWdodD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5pbmRleCsxLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhciwpKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0cnVlKXtcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoQnV0UmlnaHRCcmFja2V0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoL1xcKi9nLCBcIlxcXFxjZG90XCIpfSAke3JpZ2h0fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSBgXFxcXGZyYWN7JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8ucmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3J9ICgke3JpZ2h0fSkgPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKFwiL1wiLFwiZnJhY1wiKX17JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5hZGRTb2x1dGlvbkluZm8oc29sdXRpb24pO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XHJcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XHJcbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XHJcbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxyXG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxyXG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxyXG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcclxuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcclxuICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gcGFyc2UodG9rZW5zLG1hdGhJbmZvLHBvc2l0aW9uKSB7XHJcbiAgICBjb25zdCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodC52YWx1ZSE9PVwibnVtYmVyXCImJiEvKHNxcnR8Y29zfHNpbnx0YW4pLy50ZXN0KG9wZXJhdG9yKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQudmFsdWUhPT1cIm51bWJlclwiKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmlnaHQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgYXJlVGhlcmVPcGVyYXRvcnM9dG9rZW5zLnNvbWUodG9rZW49Pi8ob3BlcmF0b3IpLy50ZXN0KHRva2VuLnR5cGUpJiYhLyg9KS8udGVzdCh0b2tlbi52YWx1ZSkpXHJcbiAgICBcclxuICAgIGlmICghYXJlVGhlcmVPcGVyYXRvcnMpXHJcbiAgICB7XHJcbiAgICAgICAgdG9rZW5zPXNpbXBsaWZpeSh0b2tlbnMpXHJcbiAgICAgICAgbWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0b2tlbnMpXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcclxuICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiBcclxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgcG93SW5kZXhbMF0gPyBwb3dJbmRleFswXS52YWx1ZSAgOiAwLFxyXG4gICAgICAgICAgICAgICAgdmFyaWFibGVJbmRleFswXSA/IHZhcmlhYmxlSW5kZXhbMF0udmFsdWUgOiAwLFxyXG4gICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0gPyBudW1iZXJJbmRleFswXS52YWx1ZSAqIC0xOiAwLFxyXG4gICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0wJiZ2YXJpYWJsZUluZGV4Lmxlbmd0aCE9PTAmJm51bWJlckluZGV4IT09MClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyhgJHt2YXJpYWJsZUluZGV4WzBdLnZhcmlhYmxlfSA9IFxcXFxmcmFjeyR7bnVtYmVySW5kZXhbMF0udmFsdWV9fXske3ZhcmlhYmxlSW5kZXhbMF0udmFsdWV9fSA9ICR7KG51bWJlckluZGV4WzBdLnZhbHVlKS8odmFyaWFibGVJbmRleFswXS52YWx1ZSl9YClcclxuICAgICAgICAgICAgcmV0dXJuIGAke3ZhcmlhYmxlSW5kZXhbMF0udmFyaWFibGV9ID0gJHsobnVtYmVySW5kZXhbMF0udmFsdWUpLyh2YXJpYWJsZUluZGV4WzBdLnZhbHVlKX1gXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYodG9rZW5zLmxlbmd0aD09PTEmJm51bWJlckluZGV4KXtcclxuICAgICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG51bWJlckluZGV4LnZhbHVlPT09MClcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCBzb2x2ZWQ9e3ZhbHVlOiAwLHZhcmlhYmxlOiBcIlwiLHBvdzogXCJcIn07XHJcbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XHJcbiAgICAgICAgY2FzZSBcInNxcnRcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cocmlnaHQudmFsdWUsc3BlY2lhbENoYXIhPT1udWxsPygxKS8oc3BlY2lhbENoYXIpOjAuNSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJeXCI6XHJcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlfHxyaWdodC52YXJpYWJsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV8fGxlZnQudmFyaWFibGU9PT1yaWdodC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlP3JpZ2h0LnZhcmlhYmxlOlwiXCI7XHJcbiAgICAgICAgICAgICAgICBzb2x2ZWQucG93PTJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImZyYWNcIjpcclxuICAgICAgICBjYXNlIFwiL1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIipcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAqIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBoYW5kbGVWcmlhYmxlcyhsZWZ0LCByaWdodCxzb2x2ZWQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiK1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICsgcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCItXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgLSByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImJpbm9tXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGNhbGN1bGF0ZUJpbm9tKGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwic2luXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSlcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInRhblwiOlxyXG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoXCJ0YW4gTXVzdCBiZSBzbWFsbGVyIHRoYW4gOTBcIik7fVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC50YW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImFzaW5cIjpcclxuICAgICAgICBjYXNlIFwiYXJjc2luXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hc2luKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhY29zXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY2Nvc1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYWNvcyhyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYXRhblwiOlxyXG4gICAgICAgIGNhc2UgXCJhcmN0YW5cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4ocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdCwgcmlnaHQsIHNvbHZlZCkge1xyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlICYmIGxlZnQudmFyaWFibGUgIT09IHJpZ2h0LnZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIC8vIEtlZXAgdGhlbSBzZXBhcmF0ZSBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZhcmlhYmxlc1xyXG4gICAgICAgICAgICBzb2x2ZWQudGVybXMgPSBbXHJcbiAgICAgICAgICAgICAgICB7IHZhcmlhYmxlOiBsZWZ0LnZhcmlhYmxlLCBwb3c6IGxlZnQucG93IHx8IDEsIHZhbHVlOiBsZWZ0LnZhbHVlIHx8IDEgfSxcclxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IHJpZ2h0LnZhcmlhYmxlLCBwb3c6IHJpZ2h0LnBvdyB8fCAxLCB2YWx1ZTogcmlnaHQudmFsdWUgfHwgMSB9XHJcbiAgICAgICAgICAgIF07XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpZmZlcmVudCB2YXJpYWJsZSBiYXNlcyBhdCBwb3dlciBtdWx0aXBsaWNhdGlvbi4gSSBkaWRuJ3QgZ2V0IHRoZXJlIHlldFwiKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgIHNvbHZlZC52YXJpYWJsZSA9IHZhcmlhYmxlLmxlbmd0aD4wP3ZhcmlhYmxlOnVuZGVmaW5lZDtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcclxuICAgICAgICBwb3c9bGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSYmcG93PT09MCYmIWxlZnQucG93JiYhcmlnaHQucG93PzI6cG93O1xyXG4gICAgICAgIHNvbHZlZC5wb3cgPSBwb3cgfHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICAvLyBSdWxlIDM6IEhhbmRsZSBtdWx0aXBsaWNhdGlvbiBvZiBjb25zdGFudHNcclxuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgcmlnaHRWYWx1ZSA9IHJpZ2h0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSBsZWZ0VmFsdWUgKiByaWdodFZhbHVlO1xyXG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcclxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVnJpYWJsZXMobGVmdCxyaWdodCxzb2x2ZWQpe1xyXG4gICAgICAgIGxldCBoYW5kbGVkPXtWYXI6bnVsbCxQb3c6bnVsbH07XHJcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICByZXR1cm4gO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSE9PXJpZ2h0LnZhcmlhYmxlKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVHdvIHZhcmlhYmxlIGVxdWF0aW9ucyBhcmVuJ3QgYWNjZXB0ZWQgeWV0XCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL2hhbmRsZWQuVmFyPWxlZnQudmFyO1xyXG4gICAgICAgIC8vc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyXHJcblxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV9XHJcbiAgICAgICAgZWxzZSBpZiAoIWxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGV9XHJcbiAgICAgICAgZWxzZSBpZiAobGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZTtzb2x2ZWQucG93PTJ9XHJcbiAgICAgICAgKi9cclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogc29sdmVkLnBvdz8gXCJwb3dlclZhcmlhYmxlXCI6c29sdmVkLnZhcmlhYmxlPyBcInZhcmlhYmxlXCI6IFwibnVtYmVyXCIsXHJcbiAgICAgICAgdmFsdWU6IHNvbHZlZC52YWx1ZSwgXHJcbiAgICAgICAgdmFyaWFibGU6IHNvbHZlZC52YXJpYWJsZT9zb2x2ZWQudmFyaWFibGU6XCJcIixcclxuICAgICAgICBwb3c6IHNvbHZlZC5wb3c/c29sdmVkLnBvdzpcIlwiLFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIHtcclxuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLCBlbmQsIHRva2VucywgcmVnZXgpIHtcclxuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMudG9rZW5zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBsZXQgaW5kZXg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocmVnZXgpIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybiAtMTtcclxuICAgIFxyXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4IC0gMV0udHlwZSA9PT0gdG9rZW5zLnRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiAtMTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aCxqPTA7XHJcbiAgICBsZXQgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgbGV0IGNoZWNrZWRJRHMgPSBbXTsgIFxyXG4gICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTtcclxuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCYmajwyMDApIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy50b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaisrO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zLnRva2Vuc1tpXS5pZCkpIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2ldLmlkKTsgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50SUQhPT1udWxsJiZpPT09Y3VycmVudElELmNsb3NlKSB7XHJcbiAgICAgICAgICAgICAgICBbYmVnaW4sZW5kXT1bY3VycmVudElELm9wZW4sY3VycmVudElELmNsb3NlXVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgYmVnaW4gPSAwO1xyXG4gICAgICAgICAgICBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aDtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xyXG5cclxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxyXG4gICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxyXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGo+PTIwMCl7dGhyb3cgbmV3IEVycm9yKFwib3BlcmF0aW9uc09yZGVyIEZhaWxlZCBleGNlZWRlZCAyMDAgcmV2aXNpb25zXCIpO31cclxuICAgIC8vIEZpbmQgaW5kaWNlcyBiYXNlZCBvbiBvcGVyYXRvciBwcmVjZWRlbmNlXHJcbiAgICBsZXQgcHJpb3JpdHkxID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLC8oXFxefHNxcnQpLyk7XHJcbiAgICBsZXQgcHJpb3JpdHkyID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKGZyYWN8Ymlub218c2lufGNvc3x0YW58YXNpbnxhY29zfGF0YW4pLyk7XHJcbiAgICBsZXQgcHJpb3JpdHkzID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKFxcKnxcXC8pLyk7XHJcbiAgICBsZXQgcHJpb3JpdHk0ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvWystXS8pO1xyXG4gICAgbGV0IHByaW9yaXR5NSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLz0vKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NV0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xyXG4gICAgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFwcGx5UG9zaXRpb24odG9rZW5zLCBpbmRleCwgZGlyZWN0aW9uKSB7XHJcbiAgICBsZXQgYnJlYWtDaGFyID0gaW5kZXg7XHJcbiAgICBsZXQgdGFyZ2V0O1xyXG5cclxuICAgIGNvbnN0IGlzTGVmdCA9IGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCI7XHJcbiAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcclxuICAgIGlmICgoaXNMZWZ0ICYmIGluZGV4IDw9IDApIHx8ICghaXNMZWZ0ICYmIGluZGV4ID49IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkgfHwgIXRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIiBpbmRleDogXCIraW5kZXgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIikge1xyXG4gICAgICAgIGNvbnN0IHBhcmVuSW5kZXggPSB0b2tlbnMuZmluZFBhcmVuSW5kZXgodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS5pZCk7XHJcbiAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2U7XHJcbiAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vucy5zbGljZShpc0xlZnQgPyBicmVha0NoYXIgOiBpbmRleCArIDEsIGlzTGVmdCA/IGluZGV4IDogYnJlYWtDaGFyKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXTtcclxuICAgIH1cclxuICAgIGNvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+IDM7XHJcblxyXG4gICAgaWYgKCFtdWx0aVN0ZXAmJnRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKXtcclxuICAgICAgICB0YXJnZXQ9dGFyZ2V0LmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0YXJnZXQ/Lmxlbmd0aD09PTApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGF0IGFwcGx5UG9zaXRpb246IGNvdWxkbid0IGZpbmQgdGFyZ2V0IHRva2VuIGZvciBkaXJlY3Rpb24gJHtkaXJlY3Rpb259IGFuZCBvcGVyYXRvclwiJHt0b2tlbnMudG9rZW5zW2luZGV4XS52YWx1ZX1cImAsKTtcclxuICAgIH1cclxuICAgIGlmIChicmVha0NoYXIpe1xyXG4gICAgICAgIHJldHVybntcclxuICAgICAgICAgICAgdG9rZW5zOiB0YXJnZXQsXHJcbiAgICAgICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxyXG4gICAgICAgICAgICBicmVha0NoYXI6IGJyZWFrQ2hhclxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGJyZWFrQ2hhciA9IChicmVha0NoYXIgIT09IGluZGV4ID8gdGFyZ2V0Py5pbmRleCA6IGJyZWFrQ2hhcikrIGluZGV4TW9kaWZpZXIrKGlzTGVmdD8wOjEpO1xyXG4gICAgZGVsZXRlIHRhcmdldC5pbmRleFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICAuLi50YXJnZXQsXHJcbiAgICAgICAgbXVsdGlTdGVwOiBtdWx0aVN0ZXAsXHJcbiAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXJcclxuICAgIH07XHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xyXG4gICAgb3BlcmF0b3I7XHJcbiAgICBpbmRleDtcclxuICAgIHRyYW5zaXRpb247XHJcbiAgICBzcGVjaWFsQ2hhcjtcclxuICAgIGxlZnQ9IG51bGw7XHJcbiAgICByaWdodD0gbnVsbDtcclxuICAgIGNvbnN0cnVjdG9yKHRva2VucywgaW5kZXgpe1xyXG4gICAgICAgIHRoaXMuaW5kZXg9aW5kZXg7XHJcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5pbmRleFxyXG4gICAgICAgIHRoaXMucG9zaXRpb24odG9rZW5zKVxyXG4gICAgfVxyXG4gICAgcG9zaXRpb24odG9rZW5zKSB7XHJcbiAgICAgICAgdGhpcy5pbmRleCA9IHRoaXMuaW5kZXggPT09IG51bGwgPyBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSA6IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgaWYgKHRoaXMuaW5kZXggPT09IG51bGwgfHwgdGhpcy5pbmRleCA9PT0gdG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnZhbHVlO1xyXG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yU2lkZXMuYm90aC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwibGVmdFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5yaWdodE9ubHkuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB7YnJlYWtDaGFyOiB0aGlzLmluZGV4fTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5kb3VibGVSaWdodC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmxlZnQuYnJlYWtDaGFyO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnRyYW5zaXRpb24tMSxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0LmJyZWFrQ2hhciA9IHRoaXMuaW5kZXg7Y29uc29sZS5sb2codGhpcy5yaWdodClcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQuYnJlYWtDaGFyKyh0aGlzLnJpZ2h0Lm11bHRpU3RlcD8xOjApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dGhpcy5vcGVyYXRvcn0gd2FzIG5vdCBhY2NvdW50ZWQgZm9yLCBvciBpcyBub3QgdGhlIHZhbGlkIG9wZXJhdG9yYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc3BlY2lhbENoYXI9dG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA/IHRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA6IG51bGw7XHJcbiAgICB9XHJcbiAgICBjaGVja011bHRpU3RlcCgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmxlZnQubXVsdGlTdGVwfHx0aGlzLnJpZ2h0Lm11bHRpU3RlcFxyXG4gICAgfVxyXG4gICAgLy8gSWYgaXQgaXMgbXVsdGkgc3RlcCwgaXQgbmVlZHMgdG8gYmUgZXhwYW5kZWQgZmlyc3QgVGhlcmVmb3JlLCBkb24ndCBkbyBpdCBvbiBtdWx0aSBzdGVwXHJcbiAgICBjaGVja0ZyYWModG9rZW5zKXsvLyF0aGlzLmNoZWNrTXVsdGlTdGVwKCkgSSBkb24ndCBrbm93IHdoeSBJIGhhZCB0aGlzIGhlcmVcclxuICAgICAgICByZXR1cm4gLyhmcmFjfFxcLykvLnRlc3QodGhpcy5vcGVyYXRvcikmJnRva2Vucy50b2tlbnMuc2xpY2UodGhpcy5sZWZ0LmluZGV4fHx0aGlzLmluZGV4LHRoaXMucmlnaHQuaW5kZXgpLnNvbWUodD0+dC50eXBlPT09J3ZhcmlhYmxlJ3x8dC50eXBlPT09J3Bvd2VyVmFyaWFibGUnKS8vdGhpcy5sZWZ0LnR5cGUhPT0nbnVtYmVyJyYmdGhpcy5yaWdodC50eXBlIT09J251bWJlcic7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zKXtcclxuICAgIGlmICh0b2tlbnMubGVuZ3RoPD0xKXtyZXR1cm4gdG9rZW5zfVxyXG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XHJcbiAgICB3aGlsZSAoaTw9MTAwJiZ0b2tlbnMuc29tZSh0b2tlbiA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKSlcclxuICAgIHtcclxuICAgICAgICBpKys7XHJcbiAgICAgICAgbGV0IGVxaW5kZXg9dG9rZW5zLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xyXG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuKSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcclxuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XHJcbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XHJcblxyXG4gICAgICAgIGxldCBudW1iZXJHcm91cCA9IHRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpKSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXHJcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcclxuICAgICAgICAucmVkdWNlKChzdW0sIGl0ZW0pID0+IHtcclxuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gXCItXCIpID8gLTEgOiAxO1xyXG4gICAgICAgIG11bHRpcGxpZXIgKj0gKGl0ZW0ub3JpZ2luYWxJbmRleCA8PSBlcWluZGV4KSA/IC0xIDogMTsgXHJcbiAgICAgICAgaWYgKCEoLyhudW1iZXIpLykudGVzdChpdGVtLnRva2VuLnR5cGUpKXttdWx0aXBsaWVyKj0tMX1cclxuICAgICAgICByZXR1cm4gc3VtICsgKGl0ZW0udG9rZW4udmFsdWUgKiBtdWx0aXBsaWVyKTtcclxuICAgICAgICB9LCAwKTsgXHJcbiAgICAgICAgXHJcbiAgICAgICAgbmV3VG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAuLi5jdXJyZW50VG9rZW4sXHJcbiAgICAgICAgICAgIHZhbHVlOiBudW1iZXJHcm91cFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMuZmlsdGVyKHRva2VuID0+IFxyXG4gICAgICAgICAgICB0b2tlbi50eXBlICE9PSB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgfHwgXHJcbiAgICAgICAgICAgICh0b2tlbi52YXJpYWJsZSAmJiB0b2tlbi52YXJpYWJsZSAhPT0gY3VycmVudFRva2VuLnZhcmlhYmxlKSB8fCBcclxuICAgICAgICAgICAgKHRva2VuLnBvdyAmJiB0b2tlbi5wb3cgIT09IGN1cnJlbnRUb2tlbi5wb3cpXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgIHJldHVybiBuZXdUb2tlbnM7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcclxuICAgIGlucHV0PVwiXCI7XHJcbiAgICB0b2tlbnM9W107XHJcbiAgICBzb2x1dGlvbj1cIlwiO1xyXG4gICAgbWF0aEluZm89bmV3IE1hdGhJbmZvKCk7XHJcblxyXG4gICAgY29uc3RydWN0b3IoaW5wdXQpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcclxuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiVG9rZW5zIGFmdGVyIHRva2VuaXplXCIsdGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxyXG4gICAgICAgIHRoaXMuc29sdXRpb249dGhpcy5jb250cm9sbGVyKCk7XHJcbiAgICB9XHJcbiAgICAvL1xcXFxmcmFjezEzMn17MTI2MCt4XnsyfX09MC4wNVxyXG4gICAgLy9cXFxcZnJhY3sxMzJ9ezEyNjAreF57Mn19PTAuMDVcclxuICAgIGdldFJlZHlmb3JOZXdSb25kKCl7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuY29ubmVjdE5lYXJieVRva2VucygpO1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkTWF0aEluZm8odGhpcy50b2tlbnMpXHJcbiAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyh0aGlzLnRva2Vucy50b2tlbnMsdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aClcclxuICAgICAgICB0aGlzLnRva2Vucy5leHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpO1xyXG4gICAgfVxyXG4gICAgY29udHJvbGxlcigpe1xyXG4gICAgICAgIHRoaXMuZ2V0UmVkeWZvck5ld1JvbmQoKTtcclxuICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLnRva2VucyxudWxsKTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlBhcnNlZCBleHByZXNzaW9uXCIsIEpTT04uc3RyaW5naWZ5KHBvc2l0aW9uLCBudWxsLCAwLjAxKSk7XHJcblxyXG4gICAgICAgIGlmIChwb3NpdGlvbiA9PT0gbnVsbCYmdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xKXtcclxuICAgICAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJwYXJzZSh0b2tlbnMpXCIscGFyc2UodGhpcy50b2tlbnMudG9rZW5zKSlcclxuICAgICAgICAgICAgcmV0dXJuIFwidGhlICoqKipcIlxyXG4gICAgICAgIC8vIHJldHVybiBzb2x1dGlvbih0b2tlbnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChwb3NpdGlvbi5pbmRleCA9PT0gbnVsbCl7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWModGhpcy50b2tlbnMpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XHJcbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc29sdmVkID0gcGFyc2UodGhpcy50b2tlbnMudG9rZW5zLHRoaXMubWF0aEluZm8sIHBvc2l0aW9uKTtcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNvbHZlZFwiLHNvbHZlZClcclxuXHJcbiAgICAgICAgaWYgKHNvbHZlZCA9PT0gbnVsbCkge3JldHVybiBudWxsOyB9XHJcbiAgICAgICAgaWYgKHR5cGVvZiBzb2x2ZWQ9PT1cInN0cmluZ1wiKSB7cmV0dXJuIHNvbHZlZDsgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxyXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXHJcblxyXG4gICAgICAgIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIm5ld1Rva2Vuc1wiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGREZWJ1Z0luZm8obWVzLHZhbHVlKXtcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhtZXMsdmFsdWUpXHJcbiAgICB9XHJcbiAgICBwcm9jZXNzSW5wdXQoKXtcclxuICAgICAgICB0aGlzLmlucHV0PXRoaXMuaW5wdXRcclxuICAgICAgICAucmVwbGFjZSgvKFxcc3xcXFxcbGVmdHxcXFxccmlnaHQpL2csIFwiXCIpIFxyXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC99L2csIFwiKVwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC8oXFxcXGNkb3R8Y2RvdCkvZywgXCIqXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL01hdGguL2csIFwiXFxcXFwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC8oPzwhXFxcXHxbYS16QS1aXSkodGFufHNpbnxjb3N8Ymlub218ZnJhY3xhc2lufGFjb3N8YXRhbnxhcmNjb3N8YXJjc2lufGFyY3RhbnxjZG90KS9nLCBcIlxcXFwkMVwiKTtcclxuICAgIH1cclxuICAgIGZpbmFsUmV0dXJuKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIFRva2Vuc3tcclxuICAgIHRva2Vucz1bXTtcclxuICAgIGNvbnN0cnVjdG9yKG1hdGgpe1xyXG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XHJcbiAgICB9XHJcbiAgICB0b2tlbml6ZShtYXRoKXtcclxuICAgICAgICBsZXQgdG9rZW5zID0gW107XHJcbiAgICAgICAgbGV0IGJyYWNrZXRzID0gMCwgIGxldmVsQ291bnQgPSB7fTtcclxuICAgICAgICBsZXQgaj0wO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBqKys7XHJcbiAgICAgICAgICAgIGlmKGo+NTAwKXticmVhazt9XHJcbiAgICAgICAgICAgIGxldCBudW1iZXI9MCwgIHN0YXJ0UG9zID0gaSx2YXJpPVwiXCI7XHJcblxyXG4gICAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gXCIoXCIpIHtcclxuICAgICAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcInBhcmVuXCIsIHZhbHVlOiBcIihcIiwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyBJRCwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cysrO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKG1hdGhbaV0gPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cy0tOyBcclxuICAgICAgICAgICAgICAgIGlmIChicmFja2V0cyA8IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbm1hdGNoZWQgY2xvc2luZyBicmFja2V0IGF0IHBvc2l0aW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcInBhcmVuXCIsIHZhbHVlOiBcIilcIiwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyAoSUQgPj0gMCA/IElEIDogMCksIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSBcIlxcXFxcIikge1xyXG4gICAgICAgICAgICAgICAgaSs9MTsgIFxyXG4gICAgICAgICAgICAgICAgbGV0IG9wZXJhdG9yID0gKG1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKy8pIHx8IFtcIlwiXSlbMF1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBvcGVyYXRvciwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XHJcbiAgICAgICAgICAgICAgICBpKz1vcGVyYXRvci5sZW5ndGg7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09IFwic3FydFwiICYmIG1hdGhbaV0gPT09IFwiW1wiICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcclxuICAgICAgICAgICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxyXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGktLTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspKFthLXpBLVpdPykvKTtcclxuICAgICAgICAgICAgaWYgKG1hdGNoJiYhbWF0Y2hbMl0pXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG51bWJlcj1tYXRjaFswXVxyXG4gICAgICAgICAgICAgICAgaSs9bnVtYmVyLmxlbmd0aD4xP251bWJlci5sZW5ndGgtMTowO1xyXG4gICAgICAgICAgICAgICAgLy9pZigvWystXS8udGVzdChtYXRoW3N0YXJ0UG9zLTFdKSl7bnVtYmVyPW1hdGhbc3RhcnRQb3MtMV0rbnVtYmVyfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAobWF0aFtpKzFdJiYvW2EtekEtWl0vLnRlc3QobWF0aFtpKzFdKSl7Y29udGludWU7fVxyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm51bWJlclwiLCB2YWx1ZTogcGFyc2VGbG9hdChudW1iZXIpLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspKFthLXpBLVpdPykvKTtcclxuICAgICAgICAgICAgaWYgKC9bYS16QS1aXS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgdmFyaT0gKG1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKyhfXFwoW2EtekEtWjAtOV0qXFwpKSovKSB8fCBbXCJcIl0pWzBdO1xyXG4gICAgICAgICAgICAgICAgaWYgKHZhcmkmJnZhcmkubGVuZ3RoPT09MCl7dmFyaT1tYXRoLnNsaWNlKGksbWF0aC5sZW5ndGgpfVxyXG4gICAgICAgICAgICAgICAgbnVtYmVyPW1hdGguc2xpY2UoaSt2YXJpLmxlbmd0aCx2YXJpLmxlbmd0aCtpK21hdGguc2xpY2UoaSt2YXJpLmxlbmd0aCkuc2VhcmNoKC9bXjAtOV0vKSlcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaSs9dmFyaS5sZW5ndGgrbnVtYmVyLmxlbmd0aC0xO1xyXG4gICAgICAgICAgICAgICAgbnVtYmVyPXNhZmVUb051bWJlcihudW1iZXIubGVuZ3RoPjA/bnVtYmVyOjEpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICgvWzAtOV0vLnRlc3QobWF0aFtzdGFydFBvcz4wP3N0YXJ0UG9zLTE6MF0pJiZ0b2tlbnMpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVyPShtYXRoLnNsaWNlKDAsc3RhcnRQb3MpLm1hdGNoKC9bMC05Ll0rKD89W14wLTkuXSokKS8pfHwgW1wiXCJdKVswXTtcclxuICAgICAgICAgICAgICAgICAgICAvL251bWJlcj1tYXRoW3N0YXJ0UG9zLW51bWJlci5sZW5ndGgtMV0mJm1hdGhbc3RhcnRQb3MtbnVtYmVyLmxlbmd0aC0xXT09PVwiLVwiP1wiLVwiK251bWJlcjpudW1iZXI7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmKC9bLV0vLnRlc3QobWF0aFtzdGFydFBvcy0xXSkpe251bWJlcj1tYXRoW3N0YXJ0UG9zLTFdK251bWJlcn1cclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHt0eXBlOiBcInZhcmlhYmxlXCIsdmFyaWFibGU6IHZhcmkucmVwbGFjZShcIihcIixcIntcIikucmVwbGFjZShcIilcIixcIn1cIiksdmFsdWU6IHNhZmVUb051bWJlcihudW1iZXIpLCBpbmRleDogdG9rZW5zLmxlbmd0aH0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICgvWyovXj0rLV0vLnRlc3QobWF0aFtpXSl8fCghL1thLXpBLVowLTldLy50ZXN0KG1hdGhbaSsxXSkmJi9bKy1dLy50ZXN0KG1hdGhbaV0pKSkge1xyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBtYXRoW2ldLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvL2lmICgvWystXFxkXS8udGVzdChtYXRoW2ldKSl7Y29udGludWU7fVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY2hhciBcIiR7bWF0aFtpXX1cImApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGJyYWNrZXRzIT09MClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciAoXCJVbm1hdGNoZWQgb3BlbmluZyBicmFja2V0KHMpXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2VucztcclxuICAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICB2YWxpZGF0ZUluZGV4KGluZGV4LG1hcmdpbil7XHJcbiAgICAgICAgbWFyZ2luPW1hcmdpbj9tYXJnaW46MDtcclxuICAgICAgICByZXR1cm4gaW5kZXg+MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC0xLW1hcmdpbjtcclxuICAgIH1cclxuICAgIHZhbGlkYXRlUE0obWFwKXtcclxuICAgICAgICBtYXAuZm9yRWFjaChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIGluZGV4PXRoaXMudmFsaWRhdGVJbmRleChpbmRleCwxKSYmdGhpcy50b2tlbnNbaW5kZXgtMV0udHlwZT09PSdvcGVyYXRvcid8fHRoaXMudG9rZW5zW2luZGV4KzFdLnR5cGU9PT0nb3BlcmF0b3InP251bGw6aW5kZXg7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG1hcFxyXG4gICAgfVxyXG4gICAgdmFsaWRhdGVQYXJlbihtYXApe1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICAgdGhpcy5yZUlEcGFyZW50aGVzZXMoKTtcclxuXHJcblxyXG5cclxuXHJcblxyXG4gICAgICAgIGxldCBtYXBQTT10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnZhbHVlPT09JysnfHx0b2tlbi52YWx1ZT09PSctJz9pbmRleDpudWxsKS5maWx0ZXIoaW5kZXg9PiBpbmRleCE9PW51bGwpXHJcbiAgICAgICAgbWFwUE09dGhpcy52YWxpZGF0ZVBNKG1hcFBNKVxyXG5cclxuICAgICAgICBtYXBQTS5yZXZlcnNlKCkuZm9yRWFjaChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlPXRoaXMudG9rZW5zW2luZGV4XS52YWx1ZT09PScrJz8xOi0xO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleCsxXS52YWx1ZSo9dmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxyXG4gICAgICAgIH0pO1xyXG5cclxuXHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1tpbmRleF0udHlwZS5tYXRjaCh0aGlzLnZhbHVlVG9rZW5zKCkpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBpZHg9dGhpcy5maW5kUGFyZW5JbmRleChudWxsLGluZGV4KS5vcGVuO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXgrMV0udmFsdWU9PT0nKCcmJihpZHg9PT0wfHwhLyhmcmFjfGJpbm9tKS8udGVzdCh0aGlzLnRva2Vuc1tpZHgtMV0udmFsdWUpKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHsgXHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8ICh0b2tlbi50eXBlID09PSAnb3BlcmF0b3InICYmICEvWytcXC0qL149XS8udGVzdCh0b2tlbi52YWx1ZSkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSBcIilcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8dGVzdERvdWJsZVJpZ2h0KGluZGV4KT8gaW5kZXgrMSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBtYXAuc29ydCgoYSwgYikgPT4gYiAtIGEpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKHZhbHVlID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgeyB0eXBlOiAnb3BlcmF0b3InLCB2YWx1ZTogJyonLCBpbmRleDogMCB9KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG5cclxuXHJcblxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgaWYoL1soXFxcXF0vLnRlc3QobWF0aFtpXSkmJmk+MCl7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZVBhcmVudGhlc2VzPS8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLnR5cGUpXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBsYXN0SW5kZXggPSB0b2tlbnMubWFwKHRva2VuID0+IHRva2VuLmlkKS5pbmRleE9mKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0uaWQpIC0gMTtcclxuICAgICAgICAgICAgY29uc3QgYmV0d2VlblBhcmVudGhlc2VzPW1hdGhbaS0xXSA9PT0gXCIpXCImJihsYXN0SW5kZXg8MHx8IS8oZnJhY3xiaW5vbXwpLy50ZXN0KHRva2Vuc1tsYXN0SW5kZXhdLnZhbHVlKSlcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICgodG9rZW5zLmxlbmd0aC0xPj0wJiZiZWZvcmVQYXJlbnRoZXNlcyl8fChiZXR3ZWVuUGFyZW50aGVzZXMpKSB7XHJcbiAgICAgICAgICAgICAgICBpZihtYXRoW2ktMV09PT1cIi1cIil7bWF0aCA9IG1hdGguc2xpY2UoMCwgaSkrIFwiMVwiICttYXRoLnNsaWNlKGkpfVxyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBcIipcIiwgaW5kZXg6IHRva2Vucy5sZW5ndGg/dG9rZW5zLmxlbmd0aDowIH0pO1xyXG4gICAgICAgICAgICAgICAgaWYobWF0aFtpKzFdPT09XCItXCIpe21hdGggPSBtYXRoLnNsaWNlKDAsIGkpKyBcIjFcIiArbWF0aC5zbGljZShpKX1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0qL1xyXG4gICAgICAgIHRoaXMucmVJRHBhcmVudGhlc2VzKClcclxuICAgIH1cclxuXHJcbiAgICBtYXBQYXJlbkluZGV4ZXMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLnZhbHVlID09PSBcIihcIiA/IHRoaXMuZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcclxuICAgICAgICAgICAgaWYgKG9wZW5JbmRleD4wKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoL29wZXJhdG9yfHBhcmVuLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdLnR5cGUpKSB7Ly8gJiYgcHJldlRva2VuLnZhbHVlICE9PSBcIj1cIlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChjbG9zZUluZGV4PHRoaXMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHRoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXS52YWx1ZSAhPT0gXCI9XCIpIHsvL3RoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgLypcclxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICAgfSovXHJcblxyXG4gICAgIHZhbHVlVG9rZW5zKCl7XHJcbiAgICAgICAgcmV0dXJuIC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpL1xyXG4gICAgIH1cclxuXHJcblxyXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xyXG4gICAgICAgIGNvbnN0IG1hcCA9IG5ldyBTZXQodGhpcy5tYXBQYXJlbkluZGV4ZXMoKS5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pKTtcclxuICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAhbWFwLmhhcyhpZHgpKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2hlY2s9KGluZGV4KT0+KHRoaXMudG9rZW5zW2luZGV4LTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRoaXMudG9rZW5zW2luZGV4KzFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcblxyXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IHBvd01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnR5cGU9PT0ncG93ZXJWYXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxyXG5cclxuICAgICAgICBmdW5jdGlvbiBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMoYXJyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xyXG4gICAgICAgICAgICBsZXQgc3RhcnQgPSAwO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBhcnIubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGkgLSBzdGFydCA+IDEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VxdWVuY2VzLnB1c2goYXJyLnNsaWNlKHN0YXJ0LCBpKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0ID0gaTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gc2VxdWVuY2VzO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgYXJyID0gW1xyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobnVtTWFwKSwgXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyh2YXJNYXApLCBcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHBvd01hcClcclxuICAgICAgICBdO1xyXG4gICAgICAgIGFyci5zb3J0KChhLCBiKSA9PiBiWzBdIC0gYVswXSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3Qgb2JqQXJyPVtdXHJcbiAgICAgICAgYXJyLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBvYmpBcnIucHVzaCh7c3RhcnQ6IGVsWzBdLGVuZDogZWxbZWwubGVuZ3RoIC0gMV19KVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUob2JqQXJyKVxyXG4gICAgICAgIHRoaXMucmVJRHBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxyXG4gICAgfVxyXG4gICAgY29ubmVjdEFuZENvbWJpbmUoaW5kZXhlcyl7XHJcbiAgICAgICAgbGV0IHZhbHVlPTA7XHJcbiAgICAgICAgaW5kZXhlcy5mb3JFYWNoKGluZGV4ID0+IHtcclxuICAgICAgICAgICAgZm9yIChsZXQgaT1pbmRleC5zdGFydDtpPD1pbmRleC5lbmQ7aSsrKXtcclxuICAgICAgICAgICAgICAgIHZhbHVlKz10aGlzLnRva2Vuc1tpXS52YWx1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleC5zdGFydF0udmFsdWU9dmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5zdGFydCsxLCBpbmRleC5lbmQgLSBpbmRleC5zdGFydCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXHJcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcclxuICAgICAgICApXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgIH1cclxuICAgIGluc2VydFRva2VucyhzdGFydCwgbGVuZ3RoLCBvYmplY3RzKSB7XHJcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJlb3JkZXIoKXtcclxuICAgICAgICBsZXQgbmV3VG9rZW5zID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgbmV3VG9rZW4gPSB7IC4uLnRoaXMudG9rZW5zW2ldLCBpbmRleDogaSB9O1xyXG4gICAgICAgICAgICBuZXdUb2tlbnMucHVzaChuZXdUb2tlbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zPW5ld1Rva2VucztcclxuICAgIH1cclxuICAgIHJlY29uc3RydWN0KHRva2Vucyl7XHJcbiAgICAgICAgaWYgKHRva2Vucz09PXVuZGVmaW5lZCl7XHJcbiAgICAgICAgICAgIHRva2Vucz10aGlzLnRva2VucztcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IG1hdGggPSBcIlwiO1xyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPHRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgbGV0IHRlbXA7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWU9PT1cIihcIiYmdG9rZW5zW3Rva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQmJnRva2Vuc1tpbmRleCsxXSkrMV0udmFsdWU9PT1cIi9cIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN3aXRjaCAodG9rZW5zW2ldLnR5cGUpe1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm51bWJlclwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRlbXA9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrcm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcclxuICAgICAgICAgICAgICAgICAgICBtYXRoKz10ZW1wKyhpKzE8dG9rZW5zLmxlbmd0aCYmLyhmcmFjKS8udGVzdCh0b2tlbnNbaSsxXS52YWx1ZSk/XCIrXCI6XCJcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwicGFyZW5cIjpcclxuICAgICAgICAgICAgICAgICAgICB0ZW1wPXRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRva2Vuc1tpXS5pZCkub3Blbi0xXVxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGVtcCAhPT0gXCJ1bmRlZmluZWRcIiAmJiBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKChjdXJseUJyYWNrZXRzUmVnZXgudGVzdCh0ZW1wLnZhbHVlKSkgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICgvXFwpLy50ZXN0KHRlbXAudmFsdWUpICYmIGN1cmx5QnJhY2tldHNSZWdleC50ZXN0KHRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRlbXAuaWQpLm9wZW4gLSAxXS52YWx1ZSkpKSkgXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoICs9IHRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCBcIntcIikucmVwbGFjZSgvXFwpLywgXCJ9XCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChpPjAmJnRva2Vuc1tpXS52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbaS0xXT8udmFsdWU9PT1cIilcIil7bWF0aCs9XCIrXCJ9XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9dG9rZW5zW2ldLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm9wZXJhdG9yXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgIT09IFwiL1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWUpLnJlcGxhY2UoLyhbXipePS8rLV0pLyxcIlxcXFwkMVwiKS5yZXBsYWNlKC9cXCovZyxcIlxcXFxjZG90IFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrKHRva2Vuc1tpXS52YWx1ZSE9PTE/dG9rZW5zW2ldLnZhbHVlOlwiXCIpK3Rva2Vuc1tpXS52YXJpYWJsZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJwb3dlclZhcmlhYmxlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpKVxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpKyh0b2tlbnNbaV0udmFsdWUhPT0xP3Rva2Vuc1tpXS52YWx1ZTpcIlwiKSt0b2tlbnNbaV0udmFyaWFibGUrYF57JHt0b2tlbnNbaV0ucG93fX1gO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgdG9raW4gdHlwZSBnaXZlbiB0byByZWNvbnN0cnVjdDogdHlwZSAke3Rva2Vuc1tpXS50eXBlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRoXHJcbiAgICB9XHJcbiAgICBmaW5kUGFyZW5JbmRleChpZCxpbmRleCl7XHJcbiAgICAgICAgdHJ5e1xyXG4gICAgICAgICAgICBpZD1pZD9pZDp0aGlzLnRva2Vuc1tpbmRleF0uaWQ7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wZW49dGhpcy50b2tlbnMuZmluZEluZGV4KFxyXG4gICAgICAgICAgICAgICAgdG9rZW49PnRva2VuLnZhbHVlPT09XCIoXCJcclxuICAgICAgICAgICAgICAgICYmdG9rZW4uaWQ9PT1pZFxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlPXRoaXMudG9rZW5zLmZpbmRMYXN0SW5kZXgoXHJcbiAgICAgICAgICAgICAgICB0b2tlbj0+dG9rZW4udmFsdWU9PT1cIilcIlxyXG4gICAgICAgICAgICAgICAgJiZ0b2tlbi5pZD09PWlkXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICAgcmV0dXJue29wZW46IG9wZW4sY2xvc2U6IGNsb3NlLGlkOmlkfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaChlKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZSwgdmFsdWUsIHRva2VuLCBuZXh0VG9rZW4pIHtcclxuICAgICAgICB2YWx1ZSA9IHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcclxuICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXHJcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVJRHBhcmVudGhlc2VzKCkge1xyXG4gICAgICAgIGxldCB0b2tlbnM9dGhpcy50b2tlbnNcclxuICAgICAgICBsZXQgYnJhY2tldHMgPSAwLCBsZXZlbENvdW50ID0ge307XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIpIHtcclxuICAgICAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xyXG4gICAgICAgICAgICAgICAgLy8gUmVhc3NpZ24gdGhlIG9iamVjdCB3aXRoIHRoZSBuZXcgaWQgdG8gZW5zdXJlIHBlcnNpc3RlbmNlXHJcbiAgICAgICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyBJRCB9O1xyXG4gICAgICAgICAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cy0tO1xyXG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xyXG4gICAgICAgICAgICAgICAgLy8gUmVhc3NpZ24gdGhlIG9iamVjdCB3aXRoIHRoZSBuZXcgaWQgdG8gZW5zdXJlIHBlcnNpc3RlbmNlXHJcbiAgICAgICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyAoSUQgPj0gMCA/IElEIDogMCkgfTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChicmFja2V0cyE9PTApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKHRva2VucylcclxuICAgICAgICAgICAgLy90aHJvdyBuZXcgRXJyb3IgKFwiVW5tYXRjaGVkIG9wZW5pbmcgYnJhY2tldChzKSBlcnIgcmF0ZTogXCIrYnJhY2tldHMpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2VucztcclxuICAgICAgICB0aGlzLnJlb3JkZXIoKTtcclxuICAgIH1cclxufVxyXG5cclxuY29uc3QgcGx1c1N5bWJvbENoZWNrID0gKHRva2VucywgaW5kZXgpID0+IHtcclxuICAgIGlmICghaW5kZXggPiAwKSByZXR1cm4gZmFsc2U7XHJcbiAgICByZXR1cm4gdG9rZW5zW2luZGV4XS52YWx1ZSA+PSAwICYmIC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2Vuc1tpbmRleCAtIDFdLnR5cGUpO1xyXG59O1xyXG5cclxuXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycikge1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG4gICAgbGV0IHN0YWNrID0gQXJyYXkuaXNBcnJheShhcnIpID8gWy4uLmFycl0gOiBbYXJyXTsgIC8vIEVuc3VyZSBhcnIgaXMgYW4gYXJyYXkgb3Igd3JhcCBpdCBpbiBvbmVcclxuXHJcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpO1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XHJcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7ICAvLyBTcHJlYWQgdGhlIGFycmF5IGl0ZW1zIHRvIHRoZSBzdGFja1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpOyAgLy8gQWRkIG5vbi1hcnJheSBpdGVtcyB0byB0aGUgcmVzdWx0XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpOyAgLy8gUmV2ZXJzZSB0byBtYWludGFpbiBvcmlnaW5hbCBvcmRlclxyXG59Il19