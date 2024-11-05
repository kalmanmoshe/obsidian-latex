import { quad, calculateBinom, roundBySettings, degreesToRadians, radiansToDegrees } from "./mathUtilities";
import { expandExpression, curlyBracketsRegex } from "./imVeryLazy";
const tokenIDCompare = (value, token, nextToken) => (value === null || token.id === value) && token.id === nextToken?.id;
const findOpendParenIndex = (tokens, checktParen) => tokens.findIndex((token, index) => token.value === "(" && index > checktParen &&
    (index === 0 ||
        (index - 1 >= 0 && tokens[index - 1] && (!/(operator|paren)/.test(tokens[index - 1].type) || /[=]/.test(tokens[index - 1].value)))));
const findClosedParenIndex = (tokens, openParenIndex) => tokens.findLastIndex((token, index) => tokenIDCompare(")", token, tokens[openParenIndex]) &&
    ((tokens.length - 1 > index && (tokens[index + 1].type !== "operator" || /[=]/.test(tokens[index + 1].value)) || tokens.length - 1 === index)));
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
    constructor() {
        this.debugInfo = "";
        this.solutionInfo = [];
        this.mathInfo = [];
        this.graph = "";
    }
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
            if (left.variable && !right.variable) {
                solved.variable = left.variable;
            }
            else if (!left.variable && right.variable) {
                solved.variable = right.variable;
            }
            else if (left.variable && right.variable) {
                solved.variable = right.variable;
                solved.pow = 2;
            }
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
    function handleVriables(left, right) {
        let handled = { Var: null, Pow: null };
        if (!left.variable && !right.variable) {
            return handled;
        }
        if (left.variable !== right.variable) {
            throw new Error("Two variable equations aren't accepted yet");
        }
        handled.Var = left.var;
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
        throw new Error("at applyPosition: \"index wasn't valid\"");
    }
    if (tokens.tokens[index + indexModifier].type === "paren") {
        const parenIndex = tokens.findParenIndex(tokens.tokens[index + indexModifier].id);
        breakChar = isLeft ? parenIndex.open : parenIndex.close;
        target = tokens.tokens.slice(isLeft ? breakChar : index + 1, isLeft ? index : breakChar).find(item => /(number|variable|powerVariable)/.test(item.type));
    }
    else {
        target = tokens.tokens[index + indexModifier];
    }
    const multiStep = Math.abs(breakChar - index) >= 4;
    if (target?.length === 0) {
        throw new Error(`at applyPosition: couldn't find target token for direction ${direction} and operator"${tokens.tokens[index].value}"`);
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
    constructor(tokens, index) {
        this.left = null;
        this.right = null;
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
                this.right = applyPosition(tokens, this.transition, "right");
                this.left.breakChar = this.index;
                this.right.breakChar += 1;
                break;
            default:
                throw new Error(`Operator ${this.operator} was not accounted for, or is not the valid operator`);
        }
        this.specialChar = tokens.tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
    }
    checkMultiStep() {
        return this.left.multiStep || this.right.multiStep;
    }
    checkFrac() {
        return /(frac|\/)/.test(this.operator) && !this.checkMultiStep() && this.left.type !== this.right.type;
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
    constructor(input) {
        this.input = "";
        this.tokens = [];
        this.solution = "";
        this.mathInfo = new MathInfo();
        this.input = input;
        this.processInput();
        this.tokens = new Tokens(this.input);
        this.addDebugInfo("Tokens after tokenize", this.tokens.tokens);
        this.input = this.tokens.reconstruct();
        this.solution = this.controller();
    }
    async() {
    }
    controller() {
        this.tokens.connectNearbyTokens();
        this.mathInfo.addMathInfo(this.tokens);
        this.addDebugInfo(this.tokens.tokens, this.tokens.tokens.length);
        this.tokens.expressionVariableValidity();
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
        if (position.checkFrac() || position.checkMultiStep()) {
            expandExpression(this.tokens, position);
            this.mathInfo.addSolutionInfo(this.tokens.reconstruct(this.tokens));
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
    constructor(math) {
        this.tokens = [];
        this.tokens = this.tokenize(math);
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
            if (/[(\\]/.test(math[i]) && i > 0) {
                const beforeParentheses = /(number|variable|powVariable)/.test(tokens[tokens.length - 1].type);
                const lastIndex = tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id) - 1;
                const betweenParentheses = math[i - 1] === ")" && (lastIndex < 0 || !/(frac|binom|)/.test(tokens[lastIndex].value));
                if ((tokens.length - 1 >= 0 && beforeParentheses) || (betweenParentheses)) {
                    if (math[i - 1] === "-") {
                        math = math.slice(0, i) + "1" + math.slice(i);
                    }
                    tokens.push({ type: "operator", value: "*", index: tokens.length ? tokens.length : 0 });
                    if (math[i + 1] === "-") {
                        math = math.slice(0, i) + "1" + math.slice(i);
                    }
                }
            }
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
                if (i + 1 < math.length && /[0-9A-Za-z.]/.test(math[i + 1])) {
                    math = math.slice(0, i + 1) + "*" + math.slice(i + 1);
                }
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
                if (/[+-]/.test(math[startPos - 1])) {
                    number = math[startPos - 1] + number;
                }
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
                    number = math[startPos - number.length - 1] && math[startPos - number.length - 1] === "-" ? "-" + number : number;
                }
                else if (/[-]/.test(math[startPos - 1])) {
                    number = math[startPos - 1] + number;
                }
                tokens.push({ type: "variable", variable: vari.replace("(", "{").replace(")", "}"), value: safeToNumber(number), index: tokens.length });
                continue;
            }
            if (/[*/^=]/.test(math[i]) || (!/[a-zA-Z0-9]/.test(math[i + 1]) && /[+-]/.test(math[i]))) {
                tokens.push({ type: "operator", value: math[i], index: tokens.length ? tokens.length : 0 });
                continue;
            }
            if (/[+-\d]/.test(math[i])) {
                continue;
            }
            throw new Error(`Unknown char "${math[i]}"`);
        }
        if (brackets !== 0) {
            throw new Error("Unmatched opening bracket(s)");
        }
        return tokens;
    }
    connectNearbyTokens() {
        let i = 0, moreConnectedTokens = true;
        while (i < 100 && moreConnectedTokens) {
            i++;
            const index = this.findSimilarSuccessor(this.tokens);
            if (index >= 0) {
                this.tokens[index].value += this.tokens[index + 1].value;
                this.tokens.splice(index + 1, 1);
            }
            let openParenIndex = -1, closeParenIndex = -1, checktParen = -1;
            while (i < 100) {
                i++;
                openParenIndex = findOpendParenIndex(this.tokens, checktParen);
                closeParenIndex = openParenIndex === -1 ? -1 : findClosedParenIndex(this.tokens, openParenIndex);
                if (openParenIndex === -1 || closeParenIndex !== -1) {
                    break;
                }
                checktParen = openParenIndex;
            }
            if (closeParenIndex !== -1) {
                this.tokens = this.tokens.filter((_, idx) => idx !== openParenIndex && idx !== closeParenIndex);
            }
            if (index === -1 && closeParenIndex === -1) {
                break;
            }
        }
        this.reIDparentheses(this.tokens);
    }
    expressionVariableValidity() {
        if (Array.isArray(this.tokens)
            && this.tokens.some(token => /(variable|powVariable)/.test(token.type))
            && !this.tokens.some(token => token.value === "=")) {
            return Infinity;
        }
    }
    insertTokens(start, length, objects) {
        objects = this.flattenArray(objects);
        if (!Array.isArray(objects)) {
            console.error("Expected `objects` to be an array, but received:", objects);
            return;
        }
        this.tokens.splice(start, length, ...objects);
    }
    flattenArray(arr) {
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
            id = index ? this.tokens[index].id : id;
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
    findSimilarSuccessor(tokens) {
        return this.tokens.findIndex((token, index) => ((tokens[index + 2]?.type !== "operator" && tokens[index - 1]?.type !== "operator")
            && (this.tokenCompare("type", this.valueTokens(), token, tokens[index + 1]))));
    }
    valueTokens() {
        return /(number|variable|powerVariable)/;
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
        this.tokens = tokens;
        this.reorder();
    }
}
const plusSymbolCheck = (tokens, index) => {
    if (!index > 0)
        return false;
    return tokens[index].value >= 0 && /(number|variable|powerVariable)/.test(tokens[index - 1].type);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUduRSxNQUFNLGNBQWMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FDL0MsQ0FBQyxLQUFLLEtBQUcsSUFBSSxJQUFFLEtBQUssQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUUsRUFBRSxDQUFDO0FBS3JFLE1BQU0sbUJBQW1CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsV0FBVyxFQUFDLEVBQUUsQ0FBQSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQzlFLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxJQUFJLEtBQUssR0FBRyxXQUFXO0lBQzFDLENBQUMsS0FBSyxLQUFLLENBQUM7UUFDWixDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDdEksQ0FBQztBQUVGLE1BQU0sb0JBQW9CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsY0FBYyxFQUFD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TSxHQUFDLEVBQUMsS0FBSyxFQUFFLENBQUMsRUFBQyxRQUFRLEVBQUUsRUFBRSxFQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUMsQ0FBQztJQUMzQyxRQUFRLFFBQVEsRUFBRTtRQUNkLEtBQUssTUFBTTtZQUNQLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFDLFdBQVcsS0FBRyxJQUFJLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQSxDQUFDLENBQUEsR0FBRyxDQUFDLENBQUM7WUFDOUUsTUFBTTtRQUNWLEtBQUssR0FBRztZQUNKLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBRSxLQUFLLENBQUMsUUFBUSxFQUNqQztnQkFDSSxNQUFNLENBQUMsUUFBUSxHQUFDLElBQUksQ0FBQyxRQUFRLElBQUUsSUFBSSxDQUFDLFFBQVEsS0FBRyxLQUFLLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUMsUUFBUSxDQUFBLENBQUMsQ0FBQSxFQUFFLENBQUM7Z0JBQzdHLE1BQU0sQ0FBQyxHQUFHLEdBQUMsQ0FBQyxDQUFBO2FBQ2Y7WUFDRCxNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEQsTUFBTTtRQUNWLEtBQUssTUFBTSxDQUFDO1FBQ1osS0FBSyxHQUFHO1lBQ0osTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxQyxNQUFNO1FBQ1YsS0FBSyxHQUFHO1lBQ0osTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7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QyxFQUFFLEVBQUUsRUFBRSxRQUFRLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUN0RSxTQUFTO2FBQ1o7U0FDSjtRQUNELElBQUksQ0FBQyxNQUFNLEdBQUMsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNuQixDQUFDO0NBQ0o7QUFFRCxNQUFNLGVBQWUsR0FBRyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtJQUN0QyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUM3QixPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3RHLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4vaW1WZXJ5TGF6eVwiO1xyXG5cclxuXHJcbmNvbnN0IHRva2VuSURDb21wYXJlID0gKHZhbHVlLCB0b2tlbiwgbmV4dFRva2VuKSA9PiBcclxuICAgICh2YWx1ZT09PW51bGx8fHRva2VuLmlkID09PSB2YWx1ZSkgJiYgdG9rZW4uaWQgPT09IG5leHRUb2tlbj8uaWQ7XHJcblxyXG5cclxuXHJcblxyXG5jb25zdCBmaW5kT3BlbmRQYXJlbkluZGV4PSh0b2tlbnMsY2hlY2t0UGFyZW4pPT50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgJiYgaW5kZXggPiBjaGVja3RQYXJlbiAmJlxyXG4gICAgKGluZGV4ID09PSAwIHx8IFxyXG4gICAgKGluZGV4IC0gMSA+PSAwICYmIHRva2Vuc1tpbmRleCAtIDFdICYmICghLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udHlwZSkgfHwgL1s9XS8udGVzdCh0b2tlbnNbaW5kZXggLSAxXS52YWx1ZSkpKSlcclxuKTtcclxuXHJcbmNvbnN0IGZpbmRDbG9zZWRQYXJlbkluZGV4PSh0b2tlbnMsb3BlblBhcmVuSW5kZXgpPT50b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgdG9rZW5JRENvbXBhcmUoXCIpXCIsdG9rZW4sdG9rZW5zW29wZW5QYXJlbkluZGV4XSkgJiZcclxuICAgICgodG9rZW5zLmxlbmd0aC0xPmluZGV4ICAmJih0b2tlbnNbaW5kZXggKyAxXS50eXBlICE9PSBcIm9wZXJhdG9yXCJ8fC9bPV0vLnRlc3QodG9rZW5zW2luZGV4ICsgMV0udmFsdWUpKXx8IHRva2Vucy5sZW5ndGgtMT09PWluZGV4KVxyXG4pKTtcclxuXHJcbmNvbnN0IG9wZXJhdG9yc0Zvck1hdGhpbmZvID0ge1xyXG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcclxuICAgIHJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2g6IFtcInNxcnRcIl0sXHJcbiAgICBib3RoOiBbXCIrXCIsIFwiLVwiLCBcIipcIl0sXHJcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxyXG4gICAgUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2g6IFtcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcclxuICAgIGRvdWJsZVJpZ2h0QnV0QnJhY2tldDogW1wiZnJhY1wiLCBcImJpbm9tXCIsXCIvXCJdXHJcbn07XHJcbmNvbnN0IG9wZXJhdG9yU2lkZXMgPSB7XHJcbiAgICBib3RoOiBbXCJeXCIsIFwiK1wiLCBcIi1cIiwgXCIqXCIsIFwiL1wiLCBcIj1cIl0sXHJcbiAgICByaWdodE9ubHk6IFtcInNxcnRcIiwgXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXHJcbiAgICBkb3VibGVSaWdodDogW1wiZnJhY1wiLCBcImJpbm9tXCJdXHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aEluZm97XHJcbiAgICBkZWJ1Z0luZm89XCJcIjtcclxuICAgIHNvbHV0aW9uSW5mbz1bXTtcclxuICAgIG1hdGhJbmZvPVtdXHJcbiAgICBncmFwaD1cIlwiO1xyXG4gICAgYWRkR3JhcGhJbmZvKHZhbHVlKXtcclxuICAgICAgICB0aGlzLmdyYXBoKz12YWx1ZTtcclxuICAgIH1cclxuICAgIGFkZERlYnVnSW5mbyhtc2csIHZhbHVlKXtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9KHR5cGVvZiBtc2c9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KG1zZyk6bXNnKStcIiA6IFwiKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlKTp2YWx1ZSkrIFwiXFxuIFwiO1xyXG4gICAgfVxyXG4gICAgYWRkU29sdXRpb25JbmZvKG1lcyl7XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbkluZm8ucHVzaChtZXMpO1xyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiU29sdmVkXCIsbWVzKTtcclxuICAgIH1cclxuICAgIGFkZE1hdGhJbmZvKHRva2Vucyl7XHJcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZE1hdGg9dG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gocmVjb25zdHJ1Y3RlZE1hdGgpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJSZWNvbnN0cnVjdGVkIG1hdGhcIixyZWNvbnN0cnVjdGVkTWF0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkU29sdXRpb24odG9rZW5zLHBvc2l0aW9uLHNvbHV0aW9uKXtcclxuICAgICAgICBzb2x1dGlvbj10b2tlbnMucmVjb25zdHJ1Y3QoW3NvbHV0aW9uXSk7XHJcbiAgICAgICAgY29uc3QgbGVmdD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5pbmRleCkpO1xyXG4gICAgICAgIGNvbnN0IHJpZ2h0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmluZGV4KzEscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLCkpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRydWUpe1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGhCdXRSaWdodEJyYWNrZXQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3J9IHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGguaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZSgvXFwqL2csIFwiXFxcXGNkb3RcIil9ICR7cmlnaHR9ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5zcGVjaWFsLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249IGBcXFxcZnJhY3ske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5yaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgXFxcXHNxcnR7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5SaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvcn0gKCR7cmlnaHR9KSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uZG91YmxlUmlnaHRCdXRCcmFja2V0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoXCIvXCIsXCJmcmFjXCIpfXske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmFkZFNvbHV0aW9uSW5mbyhzb2x1dGlvbik7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBzYWZlVG9OdW1iZXIodmFsdWUpIHtcclxuICAgIGlmICghKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikpe3JldHVybiB2YWx1ZX1cclxuICAgIGlmICh2YWx1ZT09PVwiK1wiKXtyZXR1cm4gMH1cclxuICAgIGlmICh2YWx1ZT09PVwiLVwiKXtyZXR1cm4gLTF9XHJcbiAgICBpZiAoL1thLXpBLVpdLy50ZXN0KHZhbHVlKSl7cmV0dXJuIDF9XHJcbiAgICBpZigvWyhbXS8udGVzdCh2YWx1ZVswXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMSl9XHJcbiAgICBpZigvWylcXF1dLy50ZXN0KHZhbHVlW3ZhbHVlLmxlbmd0aC0xXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMCx2YWx1ZS5sZW5ndGgtMSl9XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaTx2YWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVbaV0gPT09IFwic3RyaW5nXCIgJiYgL1soKVtcXF1dLy50ZXN0KHZhbHVlW2ldKSkge1xyXG4gICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsIGkpICsgdmFsdWUuc2xpY2UoaSArIDEpO1xyXG4gICAgICAgICAgICBpLS07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgY29uc3QgbnVtID0gTnVtYmVyKHZhbHVlKTtcclxuICAgIHJldHVybiBpc05hTihudW0pID8gdmFsdWUubGVuZ3RoPjA/dmFsdWU6MCA6IG51bTtcclxufVxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBwYXJzZSh0b2tlbnMsbWF0aEluZm8scG9zaXRpb24pIHtcclxuICAgIGNvbnN0IHsgb3BlcmF0b3Isc3BlY2lhbENoYXIsIGxlZnQscmlnaHR9ID0gcG9zaXRpb247XHJcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIHJpZ2h0LnZhbHVlIT09XCJudW1iZXJcIiYmIS8oc3FydHxjb3N8c2lufHRhbikvLnRlc3Qob3BlcmF0b3IpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGVmdCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodC52YWx1ZSE9PVwibnVtYmVyXCIpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSaWdodCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBhcmVUaGVyZU9wZXJhdG9ycz10b2tlbnMuc29tZSh0b2tlbj0+LyhvcGVyYXRvcikvLnRlc3QodG9rZW4udHlwZSkmJiEvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSlcclxuICAgIFxyXG4gICAgaWYgKCFhcmVUaGVyZU9wZXJhdG9ycylcclxuICAgIHtcclxuICAgICAgICB0b2tlbnM9c2ltcGxpZml5KHRva2VucylcclxuICAgICAgICBtYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzaW1wbGlmaXkodG9rZW5zKVwiLHRva2VucylcclxuICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGUpPT50b2tlbnMuZmlsdGVyKHRva2VuID0+IHRva2VuLnR5cGUgPT09IHR5cGUpO1xyXG4gICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuIFxyXG4gICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIHF1YWQoXHJcbiAgICAgICAgICAgICAgICBwb3dJbmRleFswXSA/IHBvd0luZGV4WzBdLnZhbHVlICA6IDAsXHJcbiAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdID8gdmFyaWFibGVJbmRleFswXS52YWx1ZSA6IDAsXHJcbiAgICAgICAgICAgICAgICBudW1iZXJJbmRleFswXSA/IG51bWJlckluZGV4WzBdLnZhbHVlICogLTE6IDAsXHJcbiAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTAmJnZhcmlhYmxlSW5kZXgubGVuZ3RoIT09MCYmbnVtYmVySW5kZXghPT0wKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWF0aEluZm8uYWRkU29sdXRpb25JbmZvKGAke3ZhcmlhYmxlSW5kZXhbMF0udmFyaWFibGV9ID0gXFxcXGZyYWN7JHtudW1iZXJJbmRleFswXS52YWx1ZX19eyR7dmFyaWFibGVJbmRleFswXS52YWx1ZX19ID0gJHsobnVtYmVySW5kZXhbMF0udmFsdWUpLyh2YXJpYWJsZUluZGV4WzBdLnZhbHVlKX1gKVxyXG4gICAgICAgICAgICByZXR1cm4gYCR7dmFyaWFibGVJbmRleFswXS52YXJpYWJsZX0gPSAkeyhudW1iZXJJbmRleFswXS52YWx1ZSkvKHZhcmlhYmxlSW5kZXhbMF0udmFsdWUpfWBcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZih0b2tlbnMubGVuZ3RoPT09MSYmbnVtYmVySW5kZXgpe1xyXG4gICAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkobnVtYmVySW5kZXgudmFsdWU9PT0wKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgbGV0IHNvbHZlZD17dmFsdWU6IDAsdmFyaWFibGU6IFwiXCIscG93OiBcIlwifTtcclxuICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcclxuICAgICAgICBjYXNlIFwic3FydFwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIl5cIjpcclxuICAgICAgICAgICAgaWYgKGxlZnQudmFyaWFibGV8fHJpZ2h0LnZhcmlhYmxlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZXx8bGVmdC52YXJpYWJsZT09PXJpZ2h0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU/cmlnaHQudmFyaWFibGU6XCJcIjtcclxuICAgICAgICAgICAgICAgIHNvbHZlZC5wb3c9MlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiZnJhY1wiOlxyXG4gICAgICAgIGNhc2UgXCIvXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChsZWZ0LnZhbHVlKS8ocmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiKlwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICogcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfVxyXG4gICAgICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cclxuICAgICAgICAgICAgZWxzZSBpZiAobGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZTtzb2x2ZWQucG93PTJ9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCIrXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKyByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIi1cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAtIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYmlub21cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlQmlub20obGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJzaW5cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiY29zXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguY29zKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidGFuXCI6XHJcbiAgICAgICAgICAgIGlmIChyaWdodD49OTApe3Rocm93IG5ldyBFcnJvcihcInRhbiBNdXN0IGJlIHNtYWxsZXIgdGhhbiA5MFwiKTt9XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLnRhbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYXNpblwiOlxyXG4gICAgICAgIGNhc2UgXCJhcmNzaW5cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFzaW4ocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImFjb3NcIjpcclxuICAgICAgICBjYXNlIFwiYXJjY29zXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hY29zKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhdGFuXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY3RhblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbihyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDsgXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVnJpYWJsZXMobGVmdCxyaWdodCl7XHJcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcclxuICAgICAgICBpZiAoIWxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7XHJcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSE9PXJpZ2h0LnZhcmlhYmxlKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVHdvIHZhcmlhYmxlIGVxdWF0aW9ucyBhcmVuJ3QgYWNjZXB0ZWQgeWV0XCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBoYW5kbGVkLlZhcj1sZWZ0LnZhcjtcclxuXHJcblxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBzb2x2ZWQucG93PyBcInBvd2VyVmFyaWFibGVcIjpzb2x2ZWQudmFyaWFibGU/IFwidmFyaWFibGVcIjogXCJudW1iZXJcIixcclxuICAgICAgICB2YWx1ZTogc29sdmVkLnZhbHVlLCBcclxuICAgICAgICB2YXJpYWJsZTogc29sdmVkLnZhcmlhYmxlP3NvbHZlZC52YXJpYWJsZTpcIlwiLFxyXG4gICAgICAgIHBvdzogc29sdmVkLnBvdz9zb2x2ZWQucG93OlwiXCIsXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2Vucykge1xyXG4gICAgZnVuY3Rpb24gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sIGVuZCwgdG9rZW5zLCByZWdleCkge1xyXG4gICAgICAgIHdoaWxlIChiZWdpbiA8IGVuZCAmJiBiZWdpbiA8IHRva2Vucy50b2tlbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGxldCBpbmRleDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChyZWdleCkge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIC0xO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmICghL1srLV0vLnRlc3QodG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWUpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBpbmRleCA8IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vucy50b2tlbnNbaW5kZXggLSAxXS50eXBlID09PSB0b2tlbnMudG9rZW5zW2luZGV4ICsgMV0udHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBiZWdpbiA9IGluZGV4ICsgMTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIC0xO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBiZWdpbiA9IDAsIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoLGo9MDtcclxuICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICBsZXQgY2hlY2tlZElEcyA9IFtdOyAgXHJcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xyXG4gICAgd2hpbGUgKCFvcGVyYXRvckZvdW5kJiZqPDIwMCkge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGlubmVybW9zdCBwYXJlbnRoZXNlc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLnRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBqKys7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2ldLnZhbHVlID09PSBcIihcIiAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnMudG9rZW5zW2ldLmlkKSkge1xyXG4gICAgICAgICAgICAgICAgY3VycmVudElEID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaV0uaWQpOyAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRJRCE9PW51bGwmJmk9PT1jdXJyZW50SUQuY2xvc2UpIHtcclxuICAgICAgICAgICAgICAgIFtiZWdpbixlbmRdPVtjdXJyZW50SUQub3BlbixjdXJyZW50SUQuY2xvc2VdXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICBiZWdpbiA9IDA7XHJcbiAgICAgICAgICAgIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgb3BlcmF0b3JGb3VuZCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLGVuZCx0b2tlbnMpIT09LTE7XHJcblxyXG4gICAgICAgIC8vIElmIG5vIG9wZXJhdG9yIGlzIGZvdW5kLCBtYXJrIHRoaXMgcGFyZW50aGVzZXMgcGFpciBhcyBjaGVja2VkXHJcbiAgICAgICAgaWYgKCFvcGVyYXRvckZvdW5kKSB7XHJcbiAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQuaWQpOyAgXHJcbiAgICAgICAgICAgIGN1cnJlbnRJRCA9IG51bGw7ICBcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoaj49MjAwKXt0aHJvdyBuZXcgRXJyb3IoXCJvcGVyYXRpb25zT3JkZXIgRmFpbGVkIGV4Y2VlZGVkIDIwMCByZXZpc2lvbnNcIik7fVxyXG4gICAgLy8gRmluZCBpbmRpY2VzIGJhc2VkIG9uIG9wZXJhdG9yIHByZWNlZGVuY2VcclxuICAgIGxldCBwcmlvcml0eTEgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsLyhcXF58c3FydCkvKTtcclxuICAgIGxldCBwcmlvcml0eTIgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oZnJhY3xiaW5vbXxzaW58Y29zfHRhbnxhc2lufGFjb3N8YXRhbikvKTtcclxuICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oXFwqfFxcLykvKTtcclxuICAgIGxldCBwcmlvcml0eTQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC9bKy1dLyk7XHJcbiAgICBsZXQgcHJpb3JpdHk1ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvPS8pO1xyXG4gICAgXHJcbiAgICByZXR1cm4gW3ByaW9yaXR5MSwgcHJpb3JpdHkyLCBwcmlvcml0eTMsIHByaW9yaXR5NCwgcHJpb3JpdHk1XS5maW5kKGluZGV4ID0+IGluZGV4ICE9PSAtMSk/P251bGw7XHJcbiAgICBcclxufVxyXG5cclxuZnVuY3Rpb24gYXBwbHlQb3NpdGlvbih0b2tlbnMsIGluZGV4LCBkaXJlY3Rpb24pIHtcclxuICAgIGxldCBicmVha0NoYXIgPSBpbmRleDtcclxuICAgIGxldCB0YXJnZXQ7XHJcblxyXG4gICAgY29uc3QgaXNMZWZ0ID0gZGlyZWN0aW9uID09PSBcImxlZnRcIjtcclxuICAgIGNvbnN0IGluZGV4TW9kaWZpZXIgPSAgaXNMZWZ0Py0gMSA6ICAxO1xyXG4gICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLnRva2Vucy5sZW5ndGggLSAxKSB8fCAhdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImF0IGFwcGx5UG9zaXRpb246IFxcXCJpbmRleCB3YXNuJ3QgdmFsaWRcXFwiXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIikge1xyXG4gICAgICAgIGNvbnN0IHBhcmVuSW5kZXggPSB0b2tlbnMuZmluZFBhcmVuSW5kZXgodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS5pZCk7XHJcbiAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2U7XHJcbiAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vucy5zbGljZShpc0xlZnQgPyBicmVha0NoYXIgOiBpbmRleCArIDEsIGlzTGVmdCA/IGluZGV4IDogYnJlYWtDaGFyKS5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRhcmdldCA9IHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl07XHJcbiAgICB9XHJcbiAgICBjb25zdCBtdWx0aVN0ZXAgPSBNYXRoLmFicyhicmVha0NoYXIgLSBpbmRleCkgPj0gNDtcclxuICAgIGlmICh0YXJnZXQ/Lmxlbmd0aD09PTApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGF0IGFwcGx5UG9zaXRpb246IGNvdWxkbid0IGZpbmQgdGFyZ2V0IHRva2VuIGZvciBkaXJlY3Rpb24gJHtkaXJlY3Rpb259IGFuZCBvcGVyYXRvclwiJHt0b2tlbnMudG9rZW5zW2luZGV4XS52YWx1ZX1cImAsKTtcclxuICAgIH1cclxuICAgIGJyZWFrQ2hhciA9IChicmVha0NoYXIgIT09IGluZGV4ID8gdGFyZ2V0Py5pbmRleCA6IGJyZWFrQ2hhcikrIGluZGV4TW9kaWZpZXIrKGlzTGVmdD8wOjEpO1xyXG4gICAgZGVsZXRlIHRhcmdldC5pbmRleFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICAuLi50YXJnZXQsXHJcbiAgICAgICAgbXVsdGlTdGVwOiBtdWx0aVN0ZXAsXHJcbiAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXJcclxuICAgIH07XHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xyXG4gICAgb3BlcmF0b3I7XHJcbiAgICBpbmRleDtcclxuICAgIHRyYW5zaXRpb247XHJcbiAgICBzcGVjaWFsQ2hhcjtcclxuICAgIGxlZnQ9IG51bGw7XHJcbiAgICByaWdodD0gbnVsbDtcclxuICAgIGNvbnN0cnVjdG9yKHRva2VucywgaW5kZXgpe1xyXG4gICAgICAgIHRoaXMuaW5kZXg9aW5kZXg7XHJcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5pbmRleFxyXG4gICAgICAgIHRoaXMucG9zaXRpb24odG9rZW5zKVxyXG4gICAgfVxyXG4gICAgcG9zaXRpb24odG9rZW5zKSB7XHJcbiAgICAgICAgdGhpcy5pbmRleCA9IHRoaXMuaW5kZXggPT09IG51bGwgPyBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSA6IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgaWYgKHRoaXMuaW5kZXggPT09IG51bGwgfHwgdGhpcy5pbmRleCA9PT0gdG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnZhbHVlO1xyXG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yU2lkZXMuYm90aC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwibGVmdFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5yaWdodE9ubHkuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB7YnJlYWtDaGFyOiB0aGlzLmluZGV4fTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5kb3VibGVSaWdodC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmxlZnQuYnJlYWtDaGFyO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnRyYW5zaXRpb24sXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdC5icmVha0NoYXIgPSB0aGlzLmluZGV4O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodC5icmVha0NoYXIgKz0gMTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IHdhcyBub3QgYWNjb3VudGVkIGZvciwgb3IgaXMgbm90IHRoZSB2YWxpZCBvcGVyYXRvcmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnNwZWNpYWxDaGFyPXRva2Vucy50b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgPyB0b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgOiBudWxsO1xyXG4gICAgfVxyXG4gICAgY2hlY2tNdWx0aVN0ZXAoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5sZWZ0Lm11bHRpU3RlcHx8dGhpcy5yaWdodC5tdWx0aVN0ZXBcclxuICAgIH1cclxuICAgIGNoZWNrRnJhYygpe1xyXG4gICAgICAgIHJldHVybiAvKGZyYWN8XFwvKS8udGVzdCh0aGlzLm9wZXJhdG9yKSYmIXRoaXMuY2hlY2tNdWx0aVN0ZXAoKSYmdGhpcy5sZWZ0LnR5cGUhPT10aGlzLnJpZ2h0LnR5cGU7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zKXtcclxuICAgIGlmICh0b2tlbnMubGVuZ3RoPD0xKXtyZXR1cm4gdG9rZW5zfVxyXG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XHJcbiAgICB3aGlsZSAoaTw9MTAwJiZ0b2tlbnMuc29tZSh0b2tlbiA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKSlcclxuICAgIHtcclxuICAgICAgICBpKys7XHJcbiAgICAgICAgbGV0IGVxaW5kZXg9dG9rZW5zLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xyXG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuKSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcclxuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XHJcbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XHJcblxyXG4gICAgICAgIGxldCBudW1iZXJHcm91cCA9IHRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpKSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXHJcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcclxuICAgICAgICAucmVkdWNlKChzdW0sIGl0ZW0pID0+IHtcclxuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gXCItXCIpID8gLTEgOiAxO1xyXG4gICAgICAgIG11bHRpcGxpZXIgKj0gKGl0ZW0ub3JpZ2luYWxJbmRleCA8PSBlcWluZGV4KSA/IC0xIDogMTsgXHJcbiAgICAgICAgaWYgKCEoLyhudW1iZXIpLykudGVzdChpdGVtLnRva2VuLnR5cGUpKXttdWx0aXBsaWVyKj0tMX1cclxuICAgICAgICByZXR1cm4gc3VtICsgKGl0ZW0udG9rZW4udmFsdWUgKiBtdWx0aXBsaWVyKTtcclxuICAgICAgICB9LCAwKTsgXHJcbiAgICAgICAgXHJcbiAgICAgICAgbmV3VG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAuLi5jdXJyZW50VG9rZW4sXHJcbiAgICAgICAgICAgIHZhbHVlOiBudW1iZXJHcm91cFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMuZmlsdGVyKHRva2VuID0+IFxyXG4gICAgICAgICAgICB0b2tlbi50eXBlICE9PSB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgfHwgXHJcbiAgICAgICAgICAgICh0b2tlbi52YXJpYWJsZSAmJiB0b2tlbi52YXJpYWJsZSAhPT0gY3VycmVudFRva2VuLnZhcmlhYmxlKSB8fCBcclxuICAgICAgICAgICAgKHRva2VuLnBvdyAmJiB0b2tlbi5wb3cgIT09IGN1cnJlbnRUb2tlbi5wb3cpXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgIHJldHVybiBuZXdUb2tlbnM7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcclxuICAgIGlucHV0PVwiXCI7XHJcbiAgICB0b2tlbnM9W107XHJcbiAgICBzb2x1dGlvbj1cIlwiO1xyXG4gICAgbWF0aEluZm89bmV3IE1hdGhJbmZvKCk7XHJcblxyXG4gICAgY29uc3RydWN0b3IoaW5wdXQpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcclxuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiVG9rZW5zIGFmdGVyIHRva2VuaXplXCIsdGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxyXG4gICAgICAgIHRoaXMuc29sdXRpb249dGhpcy5jb250cm9sbGVyKCk7XHJcbiAgICB9XHJcbiAgICBhc3luYygpe1xyXG5cclxuICAgIH1cclxuICAgIGNvbnRyb2xsZXIoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoSW5mbyh0aGlzLnRva2VucylcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyh0aGlzLnRva2Vucy50b2tlbnMsdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aClcclxuICAgICAgICB0aGlzLnRva2Vucy5leHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMudG9rZW5zLG51bGwpO1xyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUGFyc2VkIGV4cHJlc3Npb25cIiwgSlNPTi5zdHJpbmdpZnkocG9zaXRpb24sIG51bGwsIDAuMDEpKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocG9zaXRpb24gPT09IG51bGwmJnRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MSl7XHJcbiAgICAgICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwicGFyc2UodG9rZW5zKVwiLHBhcnNlKHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgIHJldHVybiBcInRoZSAqKioqXCJcclxuICAgICAgICAvLyByZXR1cm4gc29sdXRpb24odG9rZW5zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAocG9zaXRpb24uaW5kZXggPT09IG51bGwpe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5maW5hbFJldHVybigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocG9zaXRpb24uY2hlY2tGcmFjKCl8fHBvc2l0aW9uLmNoZWNrTXVsdGlTdGVwKCkpXHJcbiAgICAgICAgeyAgIFxyXG4gICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcclxuICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbkluZm8odGhpcy50b2tlbnMucmVjb25zdHJ1Y3QodGhpcy50b2tlbnMpKVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMsdGhpcy5tYXRoSW5mbywgcG9zaXRpb24pO1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxyXG5cclxuICAgICAgICBpZiAoc29sdmVkID09PSBudWxsKSB7cmV0dXJuIG51bGw7IH1cclxuICAgICAgICBpZiAodHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbih0aGlzLnRva2Vucyxwb3NpdGlvbixzb2x2ZWQpXHJcbiAgICAgICAgY29uc3QgW2xlZnRCcmVhayxsZW5ndGhdID0gW3Bvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhci1wb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcl1cclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJuZXdUb2tlbnNcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSl7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxyXG4gICAgfVxyXG4gICAgcHJvY2Vzc0lucHV0KCl7XHJcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XHJcbiAgICAgICAgLnJlcGxhY2UoLyhcXHN8XFxcXGxlZnR8XFxcXHJpZ2h0KS9nLCBcIlwiKSBcclxuICAgICAgICAucmVwbGFjZSgvey9nLCBcIihcIikgXHJcbiAgICAgICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoLyhcXFxcY2RvdHxjZG90KS9nLCBcIipcIilcclxuICAgICAgICAucmVwbGFjZSgvTWF0aC4vZywgXCJcXFxcXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoLyg/PCFcXFxcfFthLXpBLVpdKSh0YW58c2lufGNvc3xiaW5vbXxmcmFjfGFzaW58YWNvc3xhdGFufGFyY2Nvc3xhcmNzaW58YXJjdGFufGNkb3QpL2csIFwiXFxcXCQxXCIpO1xyXG4gICAgfVxyXG4gICAgZmluYWxSZXR1cm4oKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgVG9rZW5ze1xyXG4gICAgdG9rZW5zPVtdO1xyXG4gICAgY29uc3RydWN0b3IobWF0aCl7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbml6ZShtYXRoKTtcclxuICAgIH1cclxuICAgIHRva2VuaXplKG1hdGgpe1xyXG4gICAgICAgIGxldCB0b2tlbnMgPSBbXTtcclxuICAgICAgICBsZXQgYnJhY2tldHMgPSAwLCAgbGV2ZWxDb3VudCA9IHt9O1xyXG4gICAgICAgIGxldCBqPTA7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXRoLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGorKztcclxuICAgICAgICAgICAgaWYoaj41MDApe2JyZWFrO31cclxuICAgICAgICAgICAgbGV0IG51bWJlcj0wLCAgc3RhcnRQb3MgPSBpLHZhcmk9XCJcIjtcclxuXHJcbiAgICAgICAgICAgIGlmKC9bKFxcXFxdLy50ZXN0KG1hdGhbaV0pJiZpPjApe1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmVmb3JlUGFyZW50aGVzZXM9LyhudW1iZXJ8dmFyaWFibGV8cG93VmFyaWFibGUpLy50ZXN0KHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLnR5cGUpXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxhc3RJbmRleCA9IHRva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uaWQpLmluZGV4T2YodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5pZCkgLSAxO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmV0d2VlblBhcmVudGhlc2VzPW1hdGhbaS0xXSA9PT0gXCIpXCImJihsYXN0SW5kZXg8MHx8IS8oZnJhY3xiaW5vbXwpLy50ZXN0KHRva2Vuc1tsYXN0SW5kZXhdLnZhbHVlKSlcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKCh0b2tlbnMubGVuZ3RoLTE+PTAmJmJlZm9yZVBhcmVudGhlc2VzKXx8KGJldHdlZW5QYXJlbnRoZXNlcykpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZihtYXRoW2ktMV09PT1cIi1cIil7bWF0aCA9IG1hdGguc2xpY2UoMCwgaSkrIFwiMVwiICttYXRoLnNsaWNlKGkpfVxyXG4gICAgICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJvcGVyYXRvclwiLCB2YWx1ZTogXCIqXCIsIGluZGV4OiB0b2tlbnMubGVuZ3RoP3Rva2Vucy5sZW5ndGg6MCB9KTtcclxuICAgICAgICAgICAgICAgICAgICBpZihtYXRoW2krMV09PT1cIi1cIil7bWF0aCA9IG1hdGguc2xpY2UoMCwgaSkrIFwiMVwiICttYXRoLnNsaWNlKGkpfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gXCIoXCIpIHtcclxuICAgICAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcInBhcmVuXCIsIHZhbHVlOiBcIihcIiwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyBJRCwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cysrO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKG1hdGhbaV0gPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cy0tOyBcclxuICAgICAgICAgICAgICAgIGlmIChicmFja2V0cyA8IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbm1hdGNoZWQgY2xvc2luZyBicmFja2V0IGF0IHBvc2l0aW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcInBhcmVuXCIsIHZhbHVlOiBcIilcIiwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyAoSUQgPj0gMCA/IElEIDogMCksIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoaSsxPG1hdGgubGVuZ3RoJiYvWzAtOUEtWmEtei5dLy50ZXN0KG1hdGhbaSsxXSkpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgaSsxKSArIFwiKlwiICsgbWF0aC5zbGljZShpKzEpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSBcIlxcXFxcIikge1xyXG4gICAgICAgICAgICAgICAgaSs9MTsgIFxyXG4gICAgICAgICAgICAgICAgbGV0IG9wZXJhdG9yID0gKG1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKy8pIHx8IFtcIlwiXSlbMF1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBvcGVyYXRvciwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XHJcbiAgICAgICAgICAgICAgICBpKz1vcGVyYXRvci5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS52YWx1ZSA9PT0gXCJzcXJ0XCIgJiYgbWF0aFtpXSA9PT0gXCJbXCIgJiYgaSA8IG1hdGgubGVuZ3RoIC0gMikge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCB0ZW1wPW1hdGguc2xpY2UoaSxpKzErbWF0aC5zbGljZShpKS5zZWFyY2goL1tcXF1dLykpO1xyXG4gICAgICAgICAgICAgICAgICAgIGkrPXRlbXAubGVuZ3RoXHJcbiAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0b2tlbnNbdG9rZW5zLmxlbmd0aC0xXSx7c3BlY2lhbENoYXI6IHNhZmVUb051bWJlcih0ZW1wKSx9KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKShbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCYmIW1hdGNoWzJdKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBudW1iZXI9bWF0Y2hbMF1cclxuICAgICAgICAgICAgICAgIGkrPW51bWJlci5sZW5ndGg+MT9udW1iZXIubGVuZ3RoLTE6MDtcclxuICAgICAgICAgICAgICAgIGlmKC9bKy1dLy50ZXN0KG1hdGhbc3RhcnRQb3MtMV0pKXtudW1iZXI9bWF0aFtzdGFydFBvcy0xXStudW1iZXJ9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChtYXRoW2krMV0mJi9bYS16QS1aXS8udGVzdChtYXRoW2krMV0pKXtjb250aW51ZTt9XHJcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwibnVtYmVyXCIsIHZhbHVlOiBwYXJzZUZsb2F0KG51bWJlciksIGluZGV4OiB0b2tlbnMubGVuZ3RoP3Rva2Vucy5sZW5ndGg6MCB9KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKShbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgICAgIGlmICgvW2EtekEtWl0vLnRlc3QobWF0aFtpXSkpIHtcclxuICAgICAgICAgICAgICAgIHZhcmk9IChtYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLykgfHwgW1wiXCJdKVswXTtcclxuICAgICAgICAgICAgICAgIGlmICh2YXJpJiZ2YXJpLmxlbmd0aD09PTApe3Zhcmk9bWF0aC5zbGljZShpLG1hdGgubGVuZ3RoKX1cclxuICAgICAgICAgICAgICAgIG51bWJlcj1tYXRoLnNsaWNlKGkrdmFyaS5sZW5ndGgsdmFyaS5sZW5ndGgraSttYXRoLnNsaWNlKGkrdmFyaS5sZW5ndGgpLnNlYXJjaCgvW14wLTldLykpXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGkrPXZhcmkubGVuZ3RoK251bWJlci5sZW5ndGgtMTtcclxuICAgICAgICAgICAgICAgIG51bWJlcj1zYWZlVG9OdW1iZXIobnVtYmVyLmxlbmd0aD4wP251bWJlcjoxKTtcclxuICAgICAgICAgICAgICAgIGlmICgvWzAtOV0vLnRlc3QobWF0aFtzdGFydFBvcz4wP3N0YXJ0UG9zLTE6MF0pJiZ0b2tlbnMpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVyPShtYXRoLnNsaWNlKDAsc3RhcnRQb3MpLm1hdGNoKC9bMC05Ll0rKD89W14wLTkuXSokKS8pfHwgW1wiXCJdKVswXTtcclxuICAgICAgICAgICAgICAgICAgICBudW1iZXI9bWF0aFtzdGFydFBvcy1udW1iZXIubGVuZ3RoLTFdJiZtYXRoW3N0YXJ0UG9zLW51bWJlci5sZW5ndGgtMV09PT1cIi1cIj9cIi1cIitudW1iZXI6bnVtYmVyO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSBpZigvWy1dLy50ZXN0KG1hdGhbc3RhcnRQb3MtMV0pKXtudW1iZXI9bWF0aFtzdGFydFBvcy0xXStudW1iZXJ9XHJcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7dHlwZTogXCJ2YXJpYWJsZVwiLHZhcmlhYmxlOiB2YXJpLnJlcGxhY2UoXCIoXCIsXCJ7XCIpLnJlcGxhY2UoXCIpXCIsXCJ9XCIpLHZhbHVlOiBzYWZlVG9OdW1iZXIobnVtYmVyKSwgaW5kZXg6IHRva2Vucy5sZW5ndGh9KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKC9bKi9ePV0vLnRlc3QobWF0aFtpXSl8fCghL1thLXpBLVowLTldLy50ZXN0KG1hdGhbaSsxXSkmJi9bKy1dLy50ZXN0KG1hdGhbaV0pKSkge1xyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBtYXRoW2ldLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoL1srLVxcZF0vLnRlc3QobWF0aFtpXSkpe2NvbnRpbnVlO31cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChicmFja2V0cyE9PTApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgKFwiVW5tYXRjaGVkIG9wZW5pbmcgYnJhY2tldChzKVwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdG9rZW5zXHJcbiAgICB9XHJcblxyXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xyXG4gICAgICAgIGxldCBpPTAsbW9yZUNvbm5lY3RlZFRva2Vucz10cnVlO1xyXG4gICAgICAgIHdoaWxlIChpIDwgMTAwICYmIG1vcmVDb25uZWN0ZWRUb2tlbnMpIHtcclxuICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuZmluZFNpbWlsYXJTdWNjZXNzb3IodGhpcy50b2tlbnMpXHJcbiAgICAgICAgICAgIGlmIChpbmRleCA+PTApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4XS52YWx1ZSs9dGhpcy50b2tlbnNbaW5kZXgrMV0udmFsdWVcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCArIDEsIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGxldCBvcGVuUGFyZW5JbmRleD0tMSxjbG9zZVBhcmVuSW5kZXg9LTEsY2hlY2t0UGFyZW49LTE7XHJcbiAgICBcclxuICAgICAgICAgICAgd2hpbGUgKGk8MTAwKSB7XHJcbiAgICAgICAgICAgICAgICBpKys7XHJcbiAgICAgICAgICAgICAgICBvcGVuUGFyZW5JbmRleCA9IGZpbmRPcGVuZFBhcmVuSW5kZXgodGhpcy50b2tlbnMsY2hlY2t0UGFyZW4pXHJcbiAgICAgICAgICAgICAgICBjbG9zZVBhcmVuSW5kZXggPSBvcGVuUGFyZW5JbmRleCA9PT0gLTE/LTE6ZmluZENsb3NlZFBhcmVuSW5kZXgodGhpcy50b2tlbnMsb3BlblBhcmVuSW5kZXgpXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChvcGVuUGFyZW5JbmRleD09PS0xfHxjbG9zZVBhcmVuSW5kZXghPT0tMSl7YnJlYWs7fVxyXG4gICAgICAgICAgICAgICAgY2hlY2t0UGFyZW49b3BlblBhcmVuSW5kZXg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGNsb3NlUGFyZW5JbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+XHJcbiAgICAgICAgICAgICAgICAgICAgaWR4ICE9PSBvcGVuUGFyZW5JbmRleCAmJiBpZHggIT09IGNsb3NlUGFyZW5JbmRleFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xICYmIGNsb3NlUGFyZW5JbmRleCA9PT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucmVJRHBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxyXG4gICAgfVxyXG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxyXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93VmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcclxuICAgICAgICAgICAgJiYgIXRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKVxyXG4gICAgICAgIClcclxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxyXG4gICAgfVxyXG4gICAgaW5zZXJ0VG9rZW5zKHN0YXJ0LCBsZW5ndGgsIG9iamVjdHMpIHtcclxuICAgICAgICBvYmplY3RzID0gdGhpcy5mbGF0dGVuQXJyYXkob2JqZWN0cyk7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xyXG4gICAgfVxyXG5cclxuICAgIGZsYXR0ZW5BcnJheShhcnIpIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gW107XHJcbiAgICAgICAgbGV0IHN0YWNrID0gQXJyYXkuaXNBcnJheShhcnIpID8gWy4uLmFycl0gOiBbYXJyXTsgIC8vIEVuc3VyZSBhcnIgaXMgYW4gYXJyYXkgb3Igd3JhcCBpdCBpbiBvbmVcclxuICAgIFxyXG4gICAgICAgIHdoaWxlIChzdGFjay5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpO1xyXG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShuZXh0KSkge1xyXG4gICAgICAgICAgICAgICAgc3RhY2sucHVzaCguLi5uZXh0KTsgIC8vIFNwcmVhZCB0aGUgYXJyYXkgaXRlbXMgdG8gdGhlIHN0YWNrXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChuZXh0KTsgIC8vIEFkZCBub24tYXJyYXkgaXRlbXMgdG8gdGhlIHJlc3VsdFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5yZXZlcnNlKCk7ICAvLyBSZXZlcnNlIHRvIG1haW50YWluIG9yaWdpbmFsIG9yZGVyXHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJlb3JkZXIoKXtcclxuICAgICAgICBsZXQgbmV3VG9rZW5zID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgbmV3VG9rZW4gPSB7IC4uLnRoaXMudG9rZW5zW2ldLCBpbmRleDogaSB9O1xyXG4gICAgICAgICAgICBuZXdUb2tlbnMucHVzaChuZXdUb2tlbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zPW5ld1Rva2VucztcclxuICAgIH1cclxuICAgIHJlY29uc3RydWN0KHRva2Vucyl7XHJcbiAgICAgICAgaWYgKHRva2Vucz09PXVuZGVmaW5lZCl7XHJcbiAgICAgICAgICAgIHRva2Vucz10aGlzLnRva2VucztcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IG1hdGggPSBcIlwiO1xyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPHRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgbGV0IHRlbXA7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWU9PT1cIihcIiYmdG9rZW5zW3Rva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQmJnRva2Vuc1tpbmRleCsxXSkrMV0udmFsdWU9PT1cIi9cIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN3aXRjaCAodG9rZW5zW2ldLnR5cGUpe1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm51bWJlclwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRlbXA9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrcm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcclxuICAgICAgICAgICAgICAgICAgICBtYXRoKz10ZW1wKyhpKzE8dG9rZW5zLmxlbmd0aCYmLyhmcmFjKS8udGVzdCh0b2tlbnNbaSsxXS52YWx1ZSk/XCIrXCI6XCJcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwicGFyZW5cIjpcclxuICAgICAgICAgICAgICAgICAgICB0ZW1wPXRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRva2Vuc1tpXS5pZCkub3Blbi0xXVxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGVtcCAhPT0gXCJ1bmRlZmluZWRcIiAmJiBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKChjdXJseUJyYWNrZXRzUmVnZXgudGVzdCh0ZW1wLnZhbHVlKSkgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICgvXFwpLy50ZXN0KHRlbXAudmFsdWUpICYmIGN1cmx5QnJhY2tldHNSZWdleC50ZXN0KHRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRlbXAuaWQpLm9wZW4gLSAxXS52YWx1ZSkpKSkgXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoICs9IHRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCBcIntcIikucmVwbGFjZSgvXFwpLywgXCJ9XCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChpPjAmJnRva2Vuc1tpXS52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbaS0xXT8udmFsdWU9PT1cIilcIil7bWF0aCs9XCIrXCJ9XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9dG9rZW5zW2ldLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm9wZXJhdG9yXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgIT09IFwiL1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWUpLnJlcGxhY2UoLyhbXipePS8rLV0pLyxcIlxcXFwkMVwiKS5yZXBsYWNlKC9cXCovZyxcIlxcXFxjZG90IFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrKHRva2Vuc1tpXS52YWx1ZSE9PTE/dG9rZW5zW2ldLnZhbHVlOlwiXCIpK3Rva2Vuc1tpXS52YXJpYWJsZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJwb3dlclZhcmlhYmxlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpKVxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpKyh0b2tlbnNbaV0udmFsdWUhPT0xP3Rva2Vuc1tpXS52YWx1ZTpcIlwiKSt0b2tlbnNbaV0udmFyaWFibGUrYF57JHt0b2tlbnNbaV0ucG93fX1gO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgdG9raW4gdHlwZSBnaXZlbiB0byByZWNvbnN0cnVjdDogdHlwZSAke3Rva2Vuc1tpXS50eXBlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRoXHJcbiAgICB9XHJcbiAgICBmaW5kUGFyZW5JbmRleChpZCxpbmRleCl7XHJcbiAgICAgICAgdHJ5e1xyXG4gICAgICAgICAgICBpZD1pbmRleD90aGlzLnRva2Vuc1tpbmRleF0uaWQ6aWQ7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wZW49dGhpcy50b2tlbnMuZmluZEluZGV4KFxyXG4gICAgICAgICAgICAgICAgdG9rZW49PnRva2VuLnZhbHVlPT09XCIoXCJcclxuICAgICAgICAgICAgICAgICYmdG9rZW4uaWQ9PT1pZFxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlPXRoaXMudG9rZW5zLmZpbmRMYXN0SW5kZXgoXHJcbiAgICAgICAgICAgICAgICB0b2tlbj0+dG9rZW4udmFsdWU9PT1cIilcIlxyXG4gICAgICAgICAgICAgICAgJiZ0b2tlbi5pZD09PWlkXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICAgcmV0dXJue29wZW46IG9wZW4sY2xvc2U6IGNsb3NlLGlkOmlkfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaChlKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZSwgdmFsdWUsIHRva2VuLCBuZXh0VG9rZW4pIHtcclxuICAgICAgICB2YWx1ZSA9IHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcclxuICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXHJcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xyXG4gICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFsdWVUb2tlbnMoKXtcclxuICAgICAgICByZXR1cm4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvXHJcbiAgICB9XHJcbiAgICByZUlEcGFyZW50aGVzZXMoKSB7XHJcbiAgICAgICAgbGV0IHRva2Vucz10aGlzLnRva2Vuc1xyXG4gICAgICAgIGxldCBicmFja2V0cyA9IDAsIGxldmVsQ291bnQgPSB7fTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSBcIihcIikge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsQ291bnRbYnJhY2tldHNdID0gMDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XHJcbiAgICAgICAgICAgICAgICAvLyBSZWFzc2lnbiB0aGUgb2JqZWN0IHdpdGggdGhlIG5ldyBpZCB0byBlbnN1cmUgcGVyc2lzdGVuY2VcclxuICAgICAgICAgICAgICAgIHRva2Vuc1tpXSA9IHsgLi4udG9rZW5zW2ldLCBpZDogYnJhY2tldHMgKyBcIi5cIiArIElEIH07XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cysrO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIpXCIpIHtcclxuICAgICAgICAgICAgICAgIGJyYWNrZXRzLS07XHJcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XHJcbiAgICAgICAgICAgICAgICAvLyBSZWFzc2lnbiB0aGUgb2JqZWN0IHdpdGggdGhlIG5ldyBpZCB0byBlbnN1cmUgcGVyc2lzdGVuY2VcclxuICAgICAgICAgICAgICAgIHRva2Vuc1tpXSA9IHsgLi4udG9rZW5zW2ldLCBpZDogYnJhY2tldHMgKyBcIi5cIiArIChJRCA+PSAwID8gSUQgOiAwKSB9O1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zO1xyXG4gICAgICAgIHRoaXMucmVvcmRlcigpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jb25zdCBwbHVzU3ltYm9sQ2hlY2sgPSAodG9rZW5zLCBpbmRleCkgPT4ge1xyXG4gICAgaWYgKCFpbmRleCA+IDApIHJldHVybiBmYWxzZTtcclxuICAgIHJldHVybiB0b2tlbnNbaW5kZXhdLnZhbHVlID49IDAgJiYgLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udHlwZSk7XHJcbn07Il19