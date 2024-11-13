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
    tokens = [];
    constructor(math) {
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
export function flattenArray(arr) {
    let result = [];
    arr.forEach(item => {
        if (Array.isArray(item)) {
            result = result.concat(flattenArray(item)); // Recursively flatten nested arrays
        }
        else {
            result.push(item); // Add non-array items to result
        }
    });
    return result;
}
/*export function flattenArray(arr) {
    let result = [];
    let stack = Array.isArray(arr) ? [...arr] : [arr];  // Ensure arr is an array or wrap it in one

    while (stack.length) {
        const next = stack.pop();
        if (Array.isArray(next)) {
            stack.push(...next);  // Spread the array items to the stack
        } else {
            result.push(next);  // Add non-array items to the result
        }
    }

    return result.reverse();  // Reverse to maintain original order
}*/ 
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUduRSxNQUFNLGNBQWMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FDL0MsQ0FBQyxLQUFLLEtBQUcsSUFBSSxJQUFFLEtBQUssQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUUsRUFBRSxDQUFDO0FBS3JFLE1BQU0sbUJBQW1CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsV0FBVyxFQUFDLEVBQUUsQ0FBQSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQzlFLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxJQUFJLEtBQUssR0FBRyxXQUFXO0lBQzFDLENBQUMsS0FBSyxLQUFLLENBQUM7UUFDWixDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDdEksQ0FBQztBQUVGLE1BQU0sb0JBQW9CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsY0FBYyxFQUFD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LENBQUMsQ0FBQyxDQUFBO0lBQUEsQ0FBQztJQUNqRCxJQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDO1FBQUEsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUE7SUFBQSxDQUFDO0lBQzlFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDbEMsSUFBSSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzNELEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUMvQyxDQUFDLEVBQUUsQ0FBQztRQUNSLENBQUM7SUFDTCxDQUFDO0lBQ0QsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzFCLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUNyRCxDQUFDO0FBSUQsU0FBUyxLQUFLLENBQUMsTUFBTSxFQUFDLFFBQVEsRUFBQyxRQUFRO0lBQ25DLE1BQU0sRUFBRSxRQUFRLEVBQUMsV0FBVyxFQUFFLElBQUksRUFBQyxLQUFLLEVBQUMsR0FBRyxRQUFRLENBQUM7SUFDckQsSUFBSSxPQUFPLFFBQVEsS0FBRyxRQUFRLElBQUUsT0FBTyxLQUFLLENBQUMs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QUssR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN0RyxDQUFDLENBQUM7QUFFRixNQUFNLFVBQVUsWUFBWSxDQUFDLEdBQUc7SUFDNUIsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO0lBRWhCLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDZixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN0QixNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFFLG9DQUFvQztRQUNyRixDQUFDO2FBQU0sQ0FBQztZQUNKLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBRSxnQ0FBZ0M7UUFDeEQsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxNQUFNLENBQUM7QUFDbEIsQ0FBQztBQUVEOzs7Ozs7Ozs7Ozs7OztHQWNHIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuL2ltVmVyeUxhenlcIjtcblxuXG5jb25zdCB0b2tlbklEQ29tcGFyZSA9ICh2YWx1ZSwgdG9rZW4sIG5leHRUb2tlbikgPT4gXG4gICAgKHZhbHVlPT09bnVsbHx8dG9rZW4uaWQgPT09IHZhbHVlKSAmJiB0b2tlbi5pZCA9PT0gbmV4dFRva2VuPy5pZDtcblxuXG5cblxuY29uc3QgZmluZE9wZW5kUGFyZW5JbmRleD0odG9rZW5zLGNoZWNrdFBhcmVuKT0+dG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxuICAgIHRva2VuLnZhbHVlID09PSBcIihcIiAmJiBpbmRleCA+IGNoZWNrdFBhcmVuICYmXG4gICAgKGluZGV4ID09PSAwIHx8IFxuICAgIChpbmRleCAtIDEgPj0gMCAmJiB0b2tlbnNbaW5kZXggLSAxXSAmJiAoIS8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRva2Vuc1tpbmRleCAtIDFdLnR5cGUpIHx8IC9bPV0vLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udmFsdWUpKSkpXG4pO1xuXG5jb25zdCBmaW5kQ2xvc2VkUGFyZW5JbmRleD0odG9rZW5zLG9wZW5QYXJlbkluZGV4KT0+dG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuLCBpbmRleCkgPT5cbiAgICB0b2tlbklEQ29tcGFyZShcIilcIix0b2tlbix0b2tlbnNbb3BlblBhcmVuSW5kZXhdKSAmJlxuICAgICgodG9rZW5zLmxlbmd0aC0xPmluZGV4ICAmJih0b2tlbnNbaW5kZXggKyAxXS50eXBlICE9PSBcIm9wZXJhdG9yXCJ8fC9bPV0vLnRlc3QodG9rZW5zW2luZGV4ICsgMV0udmFsdWUpKXx8IHRva2Vucy5sZW5ndGgtMT09PWluZGV4KVxuKSk7XG5cbmNvbnN0IG9wZXJhdG9yc0Zvck1hdGhpbmZvID0ge1xuICAgIGJvdGhCdXRSaWdodEJyYWNrZXQ6IFtcIl5cIl0sXG4gICAgcmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaDogW1wic3FydFwiXSxcbiAgICBib3RoOiBbXCIrXCIsIFwiLVwiLCBcIipcIl0sXG4gICAgc3BlY2lhbDogW1wiPVwiXSxcbiAgICBSaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaDogW1wic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxuICAgIGRvdWJsZVJpZ2h0QnV0QnJhY2tldDogW1wiZnJhY1wiLCBcImJpbm9tXCIsXCIvXCJdXG59O1xuY29uc3Qgb3BlcmF0b3JTaWRlcyA9IHtcbiAgICBib3RoOiBbXCJeXCIsIFwiK1wiLCBcIi1cIiwgXCIqXCIsIFwiL1wiLCBcIj1cIl0sXG4gICAgcmlnaHRPbmx5OiBbXCJzcXJ0XCIsIFwic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxuICAgIGRvdWJsZVJpZ2h0OiBbXCJmcmFjXCIsIFwiYmlub21cIl1cbn07XG5cbmV4cG9ydCBjbGFzcyBNYXRoSW5mb3tcbiAgICBkZWJ1Z0luZm89XCJcIjtcbiAgICBzb2x1dGlvbkluZm89W107XG4gICAgbWF0aEluZm89W11cbiAgICBncmFwaD1cIlwiO1xuICAgIGFkZEdyYXBoSW5mbyh2YWx1ZSl7XG4gICAgICAgIHRoaXMuZ3JhcGgrPXZhbHVlO1xuICAgIH1cbiAgICBhZGREZWJ1Z0luZm8obXNnLCB2YWx1ZSl7XG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUpOnZhbHVlKSsgXCJcXG4gXCI7XG4gICAgfVxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXMpe1xuICAgICAgICB0aGlzLnNvbHV0aW9uSW5mby5wdXNoKG1lcyk7XG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiU29sdmVkXCIsbWVzKTtcbiAgICB9XG4gICAgYWRkTWF0aEluZm8odG9rZW5zKXtcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZE1hdGg9dG9rZW5zLnJlY29uc3RydWN0KClcbiAgICAgICAgdGhpcy5tYXRoSW5mby5wdXNoKHJlY29uc3RydWN0ZWRNYXRoKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlJlY29uc3RydWN0ZWQgbWF0aFwiLHJlY29uc3RydWN0ZWRNYXRoKTtcbiAgICB9XG5cbiAgICBhZGRTb2x1dGlvbih0b2tlbnMscG9zaXRpb24sc29sdXRpb24pe1xuICAgICAgICBzb2x1dGlvbj10b2tlbnMucmVjb25zdHJ1Y3QoW3NvbHV0aW9uXSk7XG4gICAgICAgIGNvbnN0IGxlZnQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24uaW5kZXgpKTtcbiAgICAgICAgY29uc3QgcmlnaHQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24uaW5kZXgrMSxwb3NpdGlvbi5yaWdodC5icmVha0NoYXIsKSk7XG5cbiAgICAgICAgc3dpdGNoICh0cnVlKXtcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aEJ1dFJpZ2h0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3J9IHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZSgvXFwqL2csIFwiXFxcXGNkb3RcIil9ICR7cmlnaHR9ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnNwZWNpYWwuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249IGBcXFxcZnJhY3ske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgXFxcXHNxcnR7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLlJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvcn0gKCR7cmlnaHR9KSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5kb3VibGVSaWdodEJ1dEJyYWNrZXQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoXCIvXCIsXCJmcmFjXCIpfXske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFkZFNvbHV0aW9uSW5mbyhzb2x1dGlvbik7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xuICAgIGlmICghKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikpe3JldHVybiB2YWx1ZX1cbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XG4gICAgaWYgKHZhbHVlPT09XCItXCIpe3JldHVybiAtMX1cbiAgICBpZiAoL1thLXpBLVpdLy50ZXN0KHZhbHVlKSl7cmV0dXJuIDF9XG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxuICAgIGlmKC9bKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cbiAgICBmb3IgKGxldCBpID0gMDsgaTx2YWx1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XG4gICAgICAgICAgICBpLS07XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgbnVtID0gTnVtYmVyKHZhbHVlKTtcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XG59XG5cblxuXG5mdW5jdGlvbiBwYXJzZSh0b2tlbnMsbWF0aEluZm8scG9zaXRpb24pIHtcbiAgICBjb25zdCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQudmFsdWUhPT1cIm51bWJlclwiJiYhLyhzcXJ0fGNvc3xzaW58dGFuKS8udGVzdChvcGVyYXRvcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGVmdCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIHJpZ2h0LnZhbHVlIT09XCJudW1iZXJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSaWdodCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBhcmVUaGVyZU9wZXJhdG9ycz10b2tlbnMuc29tZSh0b2tlbj0+LyhvcGVyYXRvcikvLnRlc3QodG9rZW4udHlwZSkmJiEvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSlcbiAgICBcbiAgICBpZiAoIWFyZVRoZXJlT3BlcmF0b3JzKVxuICAgIHtcbiAgICAgICAgdG9rZW5zPXNpbXBsaWZpeSh0b2tlbnMpXG4gICAgICAgIG1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNpbXBsaWZpeSh0b2tlbnMpXCIsdG9rZW5zKVxuICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGUpPT50b2tlbnMuZmlsdGVyKHRva2VuID0+IHRva2VuLnR5cGUgPT09IHR5cGUpO1xuICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXG4gXG4gICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxuICAgICAgICB7XG4gICAgICAgICAgICByZXR1cm4gcXVhZChcbiAgICAgICAgICAgICAgICBwb3dJbmRleFswXSA/IHBvd0luZGV4WzBdLnZhbHVlICA6IDAsXG4gICAgICAgICAgICAgICAgdmFyaWFibGVJbmRleFswXSA/IHZhcmlhYmxlSW5kZXhbMF0udmFsdWUgOiAwLFxuICAgICAgICAgICAgICAgIG51bWJlckluZGV4WzBdID8gbnVtYmVySW5kZXhbMF0udmFsdWUgKiAtMTogMCxcbiAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0wJiZ2YXJpYWJsZUluZGV4Lmxlbmd0aCE9PTAmJm51bWJlckluZGV4IT09MClcbiAgICAgICAge1xuICAgICAgICAgICAgbWF0aEluZm8uYWRkU29sdXRpb25JbmZvKGAke3ZhcmlhYmxlSW5kZXhbMF0udmFyaWFibGV9ID0gXFxcXGZyYWN7JHtudW1iZXJJbmRleFswXS52YWx1ZX19eyR7dmFyaWFibGVJbmRleFswXS52YWx1ZX19ID0gJHsobnVtYmVySW5kZXhbMF0udmFsdWUpLyh2YXJpYWJsZUluZGV4WzBdLnZhbHVlKX1gKVxuICAgICAgICAgICAgcmV0dXJuIGAke3ZhcmlhYmxlSW5kZXhbMF0udmFyaWFibGV9ID0gJHsobnVtYmVySW5kZXhbMF0udmFsdWUpLyh2YXJpYWJsZUluZGV4WzBdLnZhbHVlKX1gXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZih0b2tlbnMubGVuZ3RoPT09MSYmbnVtYmVySW5kZXgpe1xuICAgICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG51bWJlckluZGV4LnZhbHVlPT09MClcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBsZXQgc29sdmVkPXt2YWx1ZTogMCx2YXJpYWJsZTogXCJcIixwb3c6IFwiXCJ9O1xuICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcbiAgICAgICAgY2FzZSBcInNxcnRcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KHJpZ2h0LnZhbHVlLHNwZWNpYWxDaGFyIT09bnVsbD8oMSkvKHNwZWNpYWxDaGFyKTowLjUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJeXCI6XG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZXx8cmlnaHQudmFyaWFibGUpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV8fGxlZnQudmFyaWFibGU9PT1yaWdodC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlP3JpZ2h0LnZhcmlhYmxlOlwiXCI7XG4gICAgICAgICAgICAgICAgc29sdmVkLnBvdz0yXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiZnJhY1wiOlxuICAgICAgICBjYXNlIFwiL1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKGxlZnQudmFsdWUpLyhyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIipcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKiByaWdodC52YWx1ZTtcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfVxuICAgICAgICAgICAgZWxzZSBpZiAoIWxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGV9XG4gICAgICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiK1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSArIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiLVwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAtIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYmlub21cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGNhbGN1bGF0ZUJpbm9tKGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzaW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiY29zXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSlcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidGFuXCI6XG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoXCJ0YW4gTXVzdCBiZSBzbWFsbGVyIHRoYW4gOTBcIik7fVxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImFzaW5cIjpcbiAgICAgICAgY2FzZSBcImFyY3NpblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFzaW4ocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYWNvc1wiOlxuICAgICAgICBjYXNlIFwiYXJjY29zXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYWNvcyhyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhdGFuXCI6XG4gICAgICAgIGNhc2UgXCJhcmN0YW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBudWxsOyBcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVWcmlhYmxlcyhsZWZ0LHJpZ2h0KXtcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUhPT1yaWdodC52YXJpYWJsZSl7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUd28gdmFyaWFibGUgZXF1YXRpb25zIGFyZW4ndCBhY2NlcHRlZCB5ZXRcIik7XG4gICAgICAgIH1cbiAgICAgICAgaGFuZGxlZC5WYXI9bGVmdC52YXI7XG5cblxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICB0eXBlOiBzb2x2ZWQucG93PyBcInBvd2VyVmFyaWFibGVcIjpzb2x2ZWQudmFyaWFibGU/IFwidmFyaWFibGVcIjogXCJudW1iZXJcIixcbiAgICAgICAgdmFsdWU6IHNvbHZlZC52YWx1ZSwgXG4gICAgICAgIHZhcmlhYmxlOiBzb2x2ZWQudmFyaWFibGU/c29sdmVkLnZhcmlhYmxlOlwiXCIsXG4gICAgICAgIHBvdzogc29sdmVkLnBvdz9zb2x2ZWQucG93OlwiXCIsXG4gICAgfTtcbn1cblxuXG5cblxuXG5mdW5jdGlvbiBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSB7XG4gICAgZnVuY3Rpb24gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sIGVuZCwgdG9rZW5zLCByZWdleCkge1xuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMudG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgbGV0IGluZGV4O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocmVnZXgpIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy50b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIiAmJiByZWdleC50ZXN0KHRva2VuLnZhbHVlKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiKTtcbiAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybiAtMTtcbiAgICBcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xuICAgIFxuICAgICAgICAgICAgaWYgKCEvWystXS8udGVzdCh0b2tlbnMudG9rZW5zW2luZGV4XS52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW5kZXggPiAwICYmIGluZGV4IDwgdG9rZW5zLnRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRva2Vucy50b2tlbnNbaW5kZXggLSAxXS50eXBlID09PSB0b2tlbnMudG9rZW5zW2luZGV4ICsgMV0udHlwZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIGxldCBiZWdpbiA9IDAsIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoLGo9MDtcbiAgICBsZXQgY3VycmVudElEID0gbnVsbDsgIFxuICAgIGxldCBjaGVja2VkSURzID0gW107ICBcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCYmajwyMDApIHtcbiAgICAgICAgLy8gRmluZCB0aGUgaW5uZXJtb3N0IHBhcmVudGhlc2VzXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLnRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaisrO1xuICAgICAgICAgICAgaWYgKHRva2Vucy50b2tlbnNbaV0udmFsdWUgPT09IFwiKFwiICYmICFjaGVja2VkSURzLmluY2x1ZGVzKHRva2Vucy50b2tlbnNbaV0uaWQpKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudElEID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaV0uaWQpOyAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY3VycmVudElEIT09bnVsbCYmaT09PWN1cnJlbnRJRC5jbG9zZSkge1xuICAgICAgICAgICAgICAgIFtiZWdpbixlbmRdPVtjdXJyZW50SUQub3BlbixjdXJyZW50SUQuY2xvc2VdXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICghY3VycmVudElEKSB7XG4gICAgICAgICAgICBiZWdpbiA9IDA7XG4gICAgICAgICAgICBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xuXG4gICAgICAgIC8vIElmIG5vIG9wZXJhdG9yIGlzIGZvdW5kLCBtYXJrIHRoaXMgcGFyZW50aGVzZXMgcGFpciBhcyBjaGVja2VkXG4gICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xuICAgICAgICAgICAgY2hlY2tlZElEcy5wdXNoKGN1cnJlbnRJRC5pZCk7ICBcbiAgICAgICAgICAgIGN1cnJlbnRJRCA9IG51bGw7ICBcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoaj49MjAwKXt0aHJvdyBuZXcgRXJyb3IoXCJvcGVyYXRpb25zT3JkZXIgRmFpbGVkIGV4Y2VlZGVkIDIwMCByZXZpc2lvbnNcIik7fVxuICAgIC8vIEZpbmQgaW5kaWNlcyBiYXNlZCBvbiBvcGVyYXRvciBwcmVjZWRlbmNlXG4gICAgbGV0IHByaW9yaXR5MSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywvKFxcXnxzcXJ0KS8pO1xuICAgIGxldCBwcmlvcml0eTIgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oZnJhY3xiaW5vbXxzaW58Y29zfHRhbnxhc2lufGFjb3N8YXRhbikvKTtcbiAgICBsZXQgcHJpb3JpdHkzID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKFxcKnxcXC8pLyk7XG4gICAgbGV0IHByaW9yaXR5NCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgL1srLV0vKTtcbiAgICBsZXQgcHJpb3JpdHk1ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvPS8pO1xuICAgIFxuICAgIHJldHVybiBbcHJpb3JpdHkxLCBwcmlvcml0eTIsIHByaW9yaXR5MywgcHJpb3JpdHk0LCBwcmlvcml0eTVdLmZpbmQoaW5kZXggPT4gaW5kZXggIT09IC0xKT8/bnVsbDtcbiAgICBcbn1cblxuZnVuY3Rpb24gYXBwbHlQb3NpdGlvbih0b2tlbnMsIGluZGV4LCBkaXJlY3Rpb24pIHtcbiAgICBsZXQgYnJlYWtDaGFyID0gaW5kZXg7XG4gICAgbGV0IHRhcmdldDtcblxuICAgIGNvbnN0IGlzTGVmdCA9IGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCI7XG4gICAgY29uc3QgaW5kZXhNb2RpZmllciA9ICBpc0xlZnQ/LSAxIDogIDE7XG4gICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLnRva2Vucy5sZW5ndGggLSAxKSB8fCAhdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpIHtcbiAgICAgICAgY29uc3QgcGFyZW5JbmRleCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLmlkKTtcbiAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2U7XG4gICAgICAgIHRhcmdldCA9IHRva2Vucy50b2tlbnMuc2xpY2UoaXNMZWZ0ID8gYnJlYWtDaGFyIDogaW5kZXggKyAxLCBpc0xlZnQgPyBpbmRleCA6IGJyZWFrQ2hhcikuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRhcmdldCA9IHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl07XG4gICAgfVxuICAgIGNvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+PSA0O1xuICAgIGlmICh0YXJnZXQ/Lmxlbmd0aD09PTApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7ZGlyZWN0aW9ufSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWV9XCJgLCk7XG4gICAgfVxuICAgIGJyZWFrQ2hhciA9IChicmVha0NoYXIgIT09IGluZGV4ID8gdGFyZ2V0Py5pbmRleCA6IGJyZWFrQ2hhcikrIGluZGV4TW9kaWZpZXIrKGlzTGVmdD8wOjEpO1xuICAgIGRlbGV0ZSB0YXJnZXQuaW5kZXhcbiAgICByZXR1cm4ge1xuICAgICAgICAuLi50YXJnZXQsXG4gICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxuICAgICAgICBicmVha0NoYXI6IGJyZWFrQ2hhclxuICAgIH07XG59XG5cblxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uIHtcbiAgICBvcGVyYXRvcjtcbiAgICBpbmRleDtcbiAgICB0cmFuc2l0aW9uO1xuICAgIHNwZWNpYWxDaGFyO1xuICAgIGxlZnQ9IG51bGw7XG4gICAgcmlnaHQ9IG51bGw7XG4gICAgY29uc3RydWN0b3IodG9rZW5zLCBpbmRleCl7XG4gICAgICAgIHRoaXMuaW5kZXg9aW5kZXg7XG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXhcbiAgICAgICAgdGhpcy5wb3NpdGlvbih0b2tlbnMpXG4gICAgfVxuICAgIHBvc2l0aW9uKHRva2Vucykge1xuICAgICAgICB0aGlzLmluZGV4ID0gdGhpcy5pbmRleCA9PT0gbnVsbCA/IG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIDogdGhpcy5pbmRleDtcbiAgICAgICAgaWYgKHRoaXMuaW5kZXggPT09IG51bGwgfHwgdGhpcy5pbmRleCA9PT0gdG9rZW5zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnZhbHVlO1xuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5ib3RoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwibGVmdFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5yaWdodE9ubHkuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0ge2JyZWFrQ2hhcjogdGhpcy5pbmRleH07XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yU2lkZXMuZG91YmxlUmlnaHQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmxlZnQuYnJlYWtDaGFyO1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0LmJyZWFrQ2hhciA9IHRoaXMuaW5kZXg7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodC5icmVha0NoYXIgKz0gMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IHdhcyBub3QgYWNjb3VudGVkIGZvciwgb3IgaXMgbm90IHRoZSB2YWxpZCBvcGVyYXRvcmApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc3BlY2lhbENoYXI9dG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA/IHRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA6IG51bGw7XG4gICAgfVxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmxlZnQubXVsdGlTdGVwfHx0aGlzLnJpZ2h0Lm11bHRpU3RlcFxuICAgIH1cbiAgICBjaGVja0ZyYWMoKXtcbiAgICAgICAgcmV0dXJuIC8oZnJhY3xcXC8pLy50ZXN0KHRoaXMub3BlcmF0b3IpJiYhdGhpcy5jaGVja011bHRpU3RlcCgpJiZ0aGlzLmxlZnQudHlwZSE9PXRoaXMucmlnaHQudHlwZTtcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gc2ltcGxpZml5KHRva2Vucyl7XG4gICAgaWYgKHRva2Vucy5sZW5ndGg8PTEpe3JldHVybiB0b2tlbnN9XG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUodG9rZW4gPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSkpXG4gICAge1xuICAgICAgICBpKys7XG4gICAgICAgIGxldCBlcWluZGV4PXRva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKTtcbiAgICAgICAgbGV0IE9wZXJhdGlvbkluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW4pID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpO1xuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XG4gICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxuXG4gICAgICAgIGxldCBudW1iZXJHcm91cCA9IHRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxuICAgICAgICAucmVkdWNlKChzdW0sIGl0ZW0pID0+IHtcbiAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09IFwiLVwiKSA/IC0xIDogMTtcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcbiAgICAgICAgaWYgKCEoLyhudW1iZXIpLykudGVzdChpdGVtLnRva2VuLnR5cGUpKXttdWx0aXBsaWVyKj0tMX1cbiAgICAgICAgcmV0dXJuIHN1bSArIChpdGVtLnRva2VuLnZhbHVlICogbXVsdGlwbGllcik7XG4gICAgICAgIH0sIDApOyBcbiAgICAgICAgXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKHtcbiAgICAgICAgICAgIC4uLmN1cnJlbnRUb2tlbixcbiAgICAgICAgICAgIHZhbHVlOiBudW1iZXJHcm91cFxuICAgICAgICB9KTtcblxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMuZmlsdGVyKHRva2VuID0+IFxuICAgICAgICAgICAgdG9rZW4udHlwZSAhPT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlIHx8IFxuICAgICAgICAgICAgKHRva2VuLnZhcmlhYmxlICYmIHRva2VuLnZhcmlhYmxlICE9PSBjdXJyZW50VG9rZW4udmFyaWFibGUpIHx8IFxuICAgICAgICAgICAgKHRva2VuLnBvdyAmJiB0b2tlbi5wb3cgIT09IGN1cnJlbnRUb2tlbi5wb3cpXG4gICAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBuZXdUb2tlbnM7XG59XG5cblxuXG5cbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcbiAgICBpbnB1dD1cIlwiO1xuICAgIHRva2Vucz1bXTtcbiAgICBzb2x1dGlvbj1cIlwiO1xuICAgIG1hdGhJbmZvPW5ldyBNYXRoSW5mbygpO1xuXG4gICAgY29uc3RydWN0b3IoaW5wdXQpe1xuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xuICAgICAgICB0aGlzLnByb2Nlc3NJbnB1dCgpO1xuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlRva2VucyBhZnRlciB0b2tlbml6ZVwiLHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgICAgIHRoaXMuc29sdXRpb249dGhpcy5jb250cm9sbGVyKCk7XG4gICAgfVxuICAgIGFzeW5jKCl7XG5cbiAgICB9XG4gICAgY29udHJvbGxlcigpe1xuICAgICAgICB0aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkTWF0aEluZm8odGhpcy50b2tlbnMpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKHRoaXMudG9rZW5zLnRva2Vucyx0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoKVxuICAgICAgICB0aGlzLnRva2Vucy5leHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy50b2tlbnMsbnVsbCk7XG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUGFyc2VkIGV4cHJlc3Npb25cIiwgSlNPTi5zdHJpbmdpZnkocG9zaXRpb24sIG51bGwsIDAuMDEpKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChwb3NpdGlvbiA9PT0gbnVsbCYmdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xKXtcbiAgICAgICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwicGFyc2UodG9rZW5zKVwiLHBhcnNlKHRoaXMudG9rZW5zLnRva2VucykpXG4gICAgICAgICAgICByZXR1cm4gXCJ0aGUgKioqKlwiXG4gICAgICAgIC8vIHJldHVybiBzb2x1dGlvbih0b2tlbnMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHBvc2l0aW9uLmluZGV4ID09PSBudWxsKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBvc2l0aW9uLmNoZWNrRnJhYygpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxuICAgICAgICB7ICAgXG4gICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zKSlcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMsdGhpcy5tYXRoSW5mbywgcG9zaXRpb24pO1xuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNvbHZlZFwiLHNvbHZlZClcblxuICAgICAgICBpZiAoc29sdmVkID09PSBudWxsKSB7cmV0dXJuIG51bGw7IH1cbiAgICAgICAgaWYgKHR5cGVvZiBzb2x2ZWQ9PT1cInN0cmluZ1wiKSB7cmV0dXJuIHNvbHZlZDsgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbih0aGlzLnRva2Vucyxwb3NpdGlvbixzb2x2ZWQpXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXG4gICAgICAgIFxuICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTtcbiAgICB9XG5cbiAgICBhZGREZWJ1Z0luZm8obWVzLHZhbHVlKXtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxuICAgIH1cbiAgICBwcm9jZXNzSW5wdXQoKXtcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XG4gICAgICAgIC5yZXBsYWNlKC8oXFxzfFxcXFxsZWZ0fFxcXFxyaWdodCkvZywgXCJcIikgXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKSBcbiAgICAgICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXG4gICAgICAgIC5yZXBsYWNlKC8oXFxcXGNkb3R8Y2RvdCkvZywgXCIqXCIpXG4gICAgICAgIC5yZXBsYWNlKC9NYXRoLi9nLCBcIlxcXFxcIilcbiAgICAgICAgLnJlcGxhY2UoLyg/PCFcXFxcfFthLXpBLVpdKSh0YW58c2lufGNvc3xiaW5vbXxmcmFjfGFzaW58YWNvc3xhdGFufGFyY2Nvc3xhcmNzaW58YXJjdGFufGNkb3QpL2csIFwiXFxcXCQxXCIpO1xuICAgIH1cbiAgICBmaW5hbFJldHVybigpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgIH1cbn1cblxuXG5cblxuXG5cblxuXG5cblxuXG5jbGFzcyBUb2tlbnN7XG4gICAgdG9rZW5zPVtdO1xuICAgIGNvbnN0cnVjdG9yKG1hdGgpe1xuICAgICAgICB0aGlzLnRva2Vucz10aGlzLnRva2VuaXplKG1hdGgpO1xuICAgIH1cbiAgICB0b2tlbml6ZShtYXRoKXtcbiAgICAgICAgbGV0IHRva2VucyA9IFtdO1xuICAgICAgICBsZXQgYnJhY2tldHMgPSAwLCAgbGV2ZWxDb3VudCA9IHt9O1xuICAgICAgICBsZXQgaj0wO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGorKztcbiAgICAgICAgICAgIGlmKGo+NTAwKXticmVhazt9XG4gICAgICAgICAgICBsZXQgbnVtYmVyPTAsICBzdGFydFBvcyA9IGksdmFyaT1cIlwiO1xuXG4gICAgICAgICAgICBpZigvWyhcXFxcXS8udGVzdChtYXRoW2ldKSYmaT4wKXtcbiAgICAgICAgICAgICAgICBjb25zdCBiZWZvcmVQYXJlbnRoZXNlcz0vKG51bWJlcnx2YXJpYWJsZXxwb3dWYXJpYWJsZSkvLnRlc3QodG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0udHlwZSlcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCBsYXN0SW5kZXggPSB0b2tlbnMubWFwKHRva2VuID0+IHRva2VuLmlkKS5pbmRleE9mKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0uaWQpIC0gMTtcbiAgICAgICAgICAgICAgICBjb25zdCBiZXR3ZWVuUGFyZW50aGVzZXM9bWF0aFtpLTFdID09PSBcIilcIiYmKGxhc3RJbmRleDwwfHwhLyhmcmFjfGJpbm9tfCkvLnRlc3QodG9rZW5zW2xhc3RJbmRleF0udmFsdWUpKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICgodG9rZW5zLmxlbmd0aC0xPj0wJiZiZWZvcmVQYXJlbnRoZXNlcyl8fChiZXR3ZWVuUGFyZW50aGVzZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKG1hdGhbaS0xXT09PVwiLVwiKXttYXRoID0gbWF0aC5zbGljZSgwLCBpKSsgXCIxXCIgK21hdGguc2xpY2UoaSl9XG4gICAgICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJvcGVyYXRvclwiLCB2YWx1ZTogXCIqXCIsIGluZGV4OiB0b2tlbnMubGVuZ3RoP3Rva2Vucy5sZW5ndGg6MCB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYobWF0aFtpKzFdPT09XCItXCIpe21hdGggPSBtYXRoLnNsaWNlKDAsIGkpKyBcIjFcIiArbWF0aC5zbGljZShpKX1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSBcIihcIikge1xuICAgICAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWxDb3VudFticmFja2V0c10gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJwYXJlblwiLCB2YWx1ZTogXCIoXCIsIGlkOiBicmFja2V0cyArIFwiLlwiICsgSUQsIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xuICAgICAgICAgICAgICAgIGJyYWNrZXRzKys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gXCIpXCIpIHtcbiAgICAgICAgICAgICAgICBicmFja2V0cy0tOyBcbiAgICAgICAgICAgICAgICBpZiAoYnJhY2tldHMgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVubWF0Y2hlZCBjbG9zaW5nIGJyYWNrZXQgYXQgcG9zaXRpb25cIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdIC0gMTtcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwicGFyZW5cIiwgdmFsdWU6IFwiKVwiLCBpZDogYnJhY2tldHMgKyBcIi5cIiArIChJRCA+PSAwID8gSUQgOiAwKSwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKGkrMTxtYXRoLmxlbmd0aCYmL1swLTlBLVphLXouXS8udGVzdChtYXRoW2krMV0pKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgaSsxKSArIFwiKlwiICsgbWF0aC5zbGljZShpKzEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG1hdGhbaV0gPT09IFwiXFxcXFwiKSB7XG4gICAgICAgICAgICAgICAgaSs9MTsgIFxuICAgICAgICAgICAgICAgIGxldCBvcGVyYXRvciA9IChtYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsvKSB8fCBbXCJcIl0pWzBdXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBvcGVyYXRvciwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XG4gICAgICAgICAgICAgICAgaSs9b3BlcmF0b3IubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnZhbHVlID09PSBcInNxcnRcIiAmJiBtYXRoW2ldID09PSBcIltcIiAmJiBpIDwgbWF0aC5sZW5ndGggLSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0ZW1wPW1hdGguc2xpY2UoaSxpKzErbWF0aC5zbGljZShpKS5zZWFyY2goL1tcXF1dLykpO1xuICAgICAgICAgICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLHtzcGVjaWFsQ2hhcjogc2FmZVRvTnVtYmVyKHRlbXApLH0pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGktLTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykoW2EtekEtWl0/KS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoJiYhbWF0Y2hbMl0pXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbnVtYmVyPW1hdGNoWzBdXG4gICAgICAgICAgICAgICAgaSs9bnVtYmVyLmxlbmd0aD4xP251bWJlci5sZW5ndGgtMTowO1xuICAgICAgICAgICAgICAgIGlmKC9bKy1dLy50ZXN0KG1hdGhbc3RhcnRQb3MtMV0pKXtudW1iZXI9bWF0aFtzdGFydFBvcy0xXStudW1iZXJ9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1hdGhbaSsxXSYmL1thLXpBLVpdLy50ZXN0KG1hdGhbaSsxXSkpe2NvbnRpbnVlO31cbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwibnVtYmVyXCIsIHZhbHVlOiBwYXJzZUZsb2F0KG51bWJlciksIGluZGV4OiB0b2tlbnMubGVuZ3RoP3Rva2Vucy5sZW5ndGg6MCB9KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKShbYS16QS1aXT8pLyk7XG4gICAgICAgICAgICBpZiAoL1thLXpBLVpdLy50ZXN0KG1hdGhbaV0pKSB7XG4gICAgICAgICAgICAgICAgdmFyaT0gKG1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKyhfXFwoW2EtekEtWjAtOV0qXFwpKSovKSB8fCBbXCJcIl0pWzBdO1xuICAgICAgICAgICAgICAgIGlmICh2YXJpJiZ2YXJpLmxlbmd0aD09PTApe3Zhcmk9bWF0aC5zbGljZShpLG1hdGgubGVuZ3RoKX1cbiAgICAgICAgICAgICAgICBudW1iZXI9bWF0aC5zbGljZShpK3ZhcmkubGVuZ3RoLHZhcmkubGVuZ3RoK2krbWF0aC5zbGljZShpK3ZhcmkubGVuZ3RoKS5zZWFyY2goL1teMC05XS8pKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGkrPXZhcmkubGVuZ3RoK251bWJlci5sZW5ndGgtMTtcbiAgICAgICAgICAgICAgICBudW1iZXI9c2FmZVRvTnVtYmVyKG51bWJlci5sZW5ndGg+MD9udW1iZXI6MSk7XG4gICAgICAgICAgICAgICAgaWYgKC9bMC05XS8udGVzdChtYXRoW3N0YXJ0UG9zPjA/c3RhcnRQb3MtMTowXSkmJnRva2VucylcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIG51bWJlcj0obWF0aC5zbGljZSgwLHN0YXJ0UG9zKS5tYXRjaCgvWzAtOS5dKyg/PVteMC05Ll0qJCkvKXx8IFtcIlwiXSlbMF07XG4gICAgICAgICAgICAgICAgICAgIG51bWJlcj1tYXRoW3N0YXJ0UG9zLW51bWJlci5sZW5ndGgtMV0mJm1hdGhbc3RhcnRQb3MtbnVtYmVyLmxlbmd0aC0xXT09PVwiLVwiP1wiLVwiK251bWJlcjpudW1iZXI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYoL1stXS8udGVzdChtYXRoW3N0YXJ0UG9zLTFdKSl7bnVtYmVyPW1hdGhbc3RhcnRQb3MtMV0rbnVtYmVyfVxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHt0eXBlOiBcInZhcmlhYmxlXCIsdmFyaWFibGU6IHZhcmkucmVwbGFjZShcIihcIixcIntcIikucmVwbGFjZShcIilcIixcIn1cIiksdmFsdWU6IHNhZmVUb051bWJlcihudW1iZXIpLCBpbmRleDogdG9rZW5zLmxlbmd0aH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKC9bKi9ePV0vLnRlc3QobWF0aFtpXSl8fCghL1thLXpBLVowLTldLy50ZXN0KG1hdGhbaSsxXSkmJi9bKy1dLy50ZXN0KG1hdGhbaV0pKSkge1xuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJvcGVyYXRvclwiLCB2YWx1ZTogbWF0aFtpXSwgaW5kZXg6IHRva2Vucy5sZW5ndGg/dG9rZW5zLmxlbmd0aDowIH0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKC9bKy1cXGRdLy50ZXN0KG1hdGhbaV0pKXtjb250aW51ZTt9XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY2hhciBcIiR7bWF0aFtpXX1cImApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGJyYWNrZXRzIT09MClcbiAgICAgICAge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIChcIlVubWF0Y2hlZCBvcGVuaW5nIGJyYWNrZXQocylcIilcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdG9rZW5zXG4gICAgfVxuXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xuICAgICAgICBsZXQgaT0wLG1vcmVDb25uZWN0ZWRUb2tlbnM9dHJ1ZTtcbiAgICAgICAgd2hpbGUgKGkgPCAxMDAgJiYgbW9yZUNvbm5lY3RlZFRva2Vucykge1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmZpbmRTaW1pbGFyU3VjY2Vzc29yKHRoaXMudG9rZW5zKVxuICAgICAgICAgICAgaWYgKGluZGV4ID49MCkge1xuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4XS52YWx1ZSs9dGhpcy50b2tlbnNbaW5kZXgrMV0udmFsdWVcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXggKyAxLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCBvcGVuUGFyZW5JbmRleD0tMSxjbG9zZVBhcmVuSW5kZXg9LTEsY2hlY2t0UGFyZW49LTE7XG4gICAgXG4gICAgICAgICAgICB3aGlsZSAoaTwxMDApIHtcbiAgICAgICAgICAgICAgICBpKys7XG4gICAgICAgICAgICAgICAgb3BlblBhcmVuSW5kZXggPSBmaW5kT3BlbmRQYXJlbkluZGV4KHRoaXMudG9rZW5zLGNoZWNrdFBhcmVuKVxuICAgICAgICAgICAgICAgIGNsb3NlUGFyZW5JbmRleCA9IG9wZW5QYXJlbkluZGV4ID09PSAtMT8tMTpmaW5kQ2xvc2VkUGFyZW5JbmRleCh0aGlzLnRva2VucyxvcGVuUGFyZW5JbmRleClcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAob3BlblBhcmVuSW5kZXg9PT0tMXx8Y2xvc2VQYXJlbkluZGV4IT09LTEpe2JyZWFrO31cbiAgICAgICAgICAgICAgICBjaGVja3RQYXJlbj1vcGVuUGFyZW5JbmRleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjbG9zZVBhcmVuSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT5cbiAgICAgICAgICAgICAgICAgICAgaWR4ICE9PSBvcGVuUGFyZW5JbmRleCAmJiBpZHggIT09IGNsb3NlUGFyZW5JbmRleFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xICYmIGNsb3NlUGFyZW5JbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJlSURwYXJlbnRoZXNlcyh0aGlzLnRva2VucylcbiAgICB9XG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93VmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcbiAgICAgICAgKVxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxuICAgIH1cbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQsIGxlbmd0aCwgb2JqZWN0cykge1xuICAgICAgICBvYmplY3RzID0gZmxhdHRlbkFycmF5KG9iamVjdHMpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xuICAgIH1cbiAgICBcbiAgICByZW9yZGVyKCl7XG4gICAgICAgIGxldCBuZXdUb2tlbnMgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG5ld1Rva2VuID0geyAuLi50aGlzLnRva2Vuc1tpXSwgaW5kZXg6IGkgfTtcbiAgICAgICAgICAgIG5ld1Rva2Vucy5wdXNoKG5ld1Rva2VuKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRva2Vucz1uZXdUb2tlbnM7XG4gICAgfVxuICAgIHJlY29uc3RydWN0KHRva2Vucyl7XG4gICAgICAgIGlmICh0b2tlbnM9PT11bmRlZmluZWQpe1xuICAgICAgICAgICAgdG9rZW5zPXRoaXMudG9rZW5zO1xuICAgICAgICB9XG4gICAgICAgIGxldCBtYXRoID0gXCJcIjtcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8dG9rZW5zLmxlbmd0aDtpKyspe1xuICAgICAgICAgICAgbGV0IHRlbXA7XG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlPT09XCIoXCImJnRva2Vuc1t0b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi5pZCA9PT0gdG9rZW5zW2ldLmlkJiZ0b2tlbnNbaW5kZXgrMV0pKzFdLnZhbHVlPT09XCIvXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3dpdGNoICh0b2tlbnNbaV0udHlwZSl7XG4gICAgICAgICAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgICAgICAgICB0ZW1wPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpK3JvdW5kQnlTZXR0aW5ncyh0b2tlbnNbaV0udmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPXRlbXArKGkrMTx0b2tlbnMubGVuZ3RoJiYvKGZyYWMpLy50ZXN0KHRva2Vuc1tpKzFdLnZhbHVlKT9cIitcIjpcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBcInBhcmVuXCI6XG4gICAgICAgICAgICAgICAgICAgIHRlbXA9dG9rZW5zW3RoaXMuZmluZFBhcmVuSW5kZXgodG9rZW5zW2ldLmlkKS5vcGVuLTFdXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHRlbXAgIT09IFwidW5kZWZpbmVkXCIgJiYgXG4gICAgICAgICAgICAgICAgICAgICAgICAoKGN1cmx5QnJhY2tldHNSZWdleC50ZXN0KHRlbXAudmFsdWUpKSB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICgvXFwpLy50ZXN0KHRlbXAudmFsdWUpICYmIGN1cmx5QnJhY2tldHNSZWdleC50ZXN0KHRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRlbXAuaWQpLm9wZW4gLSAxXS52YWx1ZSkpKSkgXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGggKz0gdG9rZW5zW2ldLnZhbHVlLnJlcGxhY2UoL1xcKC8sIFwie1wiKS5yZXBsYWNlKC9cXCkvLCBcIn1cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChpPjAmJnRva2Vuc1tpXS52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbaS0xXT8udmFsdWU9PT1cIilcIil7bWF0aCs9XCIrXCJ9XG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBcIm9wZXJhdG9yXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlICE9PSBcIi9cIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHRva2Vuc1tpXS52YWx1ZSkucmVwbGFjZSgvKFteKl49LystXSkvLFwiXFxcXCQxXCIpLnJlcGxhY2UoL1xcKi9nLFwiXFxcXGNkb3QgXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrKHRva2Vuc1tpXS52YWx1ZSE9PTE/dG9rZW5zW2ldLnZhbHVlOlwiXCIpK3Rva2Vuc1tpXS52YXJpYWJsZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBcInBvd2VyVmFyaWFibGVcIjpcbiAgICAgICAgICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpKVxuICAgICAgICAgICAgICAgICAgICBtYXRoKz0ocGx1c1N5bWJvbENoZWNrKHRva2VucyxpKT9cIitcIjpcIlwiKSsodG9rZW5zW2ldLnZhbHVlIT09MT90b2tlbnNbaV0udmFsdWU6XCJcIikrdG9rZW5zW2ldLnZhcmlhYmxlK2BeeyR7dG9rZW5zW2ldLnBvd319YDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHRva2luIHR5cGUgZ2l2ZW4gdG8gcmVjb25zdHJ1Y3Q6IHR5cGUgJHt0b2tlbnNbaV0udHlwZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF0aFxuICAgIH1cbiAgICBmaW5kUGFyZW5JbmRleChpZCxpbmRleCl7XG4gICAgICAgIHRyeXtcbiAgICAgICAgICAgIGlkPWluZGV4P3RoaXMudG9rZW5zW2luZGV4XS5pZDppZDtcbiAgICAgICAgICAgIGNvbnN0IG9wZW49dGhpcy50b2tlbnMuZmluZEluZGV4KFxuICAgICAgICAgICAgICAgIHRva2VuPT50b2tlbi52YWx1ZT09PVwiKFwiXG4gICAgICAgICAgICAgICAgJiZ0b2tlbi5pZD09PWlkXG4gICAgICAgICAgICApXG4gICAgICAgICAgICBjb25zdCBjbG9zZT10aGlzLnRva2Vucy5maW5kTGFzdEluZGV4KFxuICAgICAgICAgICAgICAgIHRva2VuPT50b2tlbi52YWx1ZT09PVwiKVwiXG4gICAgICAgICAgICAgICAgJiZ0b2tlbi5pZD09PWlkXG4gICAgICAgICAgICApXG4gICAgICAgICAgICByZXR1cm57b3Blbjogb3BlbixjbG9zZTogY2xvc2UsaWQ6aWR9XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2goZSl7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZSwgdmFsdWUsIHRva2VuLCBuZXh0VG9rZW4pIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCA/IHZhbHVlIDogbmV3IFJlZ0V4cCh2YWx1ZSk7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXG4gICAgICAgICAgICB0b2tlbltjb21wYXJlXSA9PT0gbmV4dFRva2VuPy5bY29tcGFyZV1cbiAgICAgICAgKTtcbiAgICB9XG4gICAgZmluZFNpbWlsYXJTdWNjZXNzb3IodG9rZW5zKXtcbiAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXG4gICAgICAgICAgICAgICAgJiYodGhpcy50b2tlbkNvbXBhcmUoXCJ0eXBlXCIsdGhpcy52YWx1ZVRva2VucygpLCB0b2tlbiwgdG9rZW5zW2luZGV4ICsgMV0pKVxuICAgICAgICApKTtcbiAgICB9XG5cbiAgICB2YWx1ZVRva2Vucygpe1xuICAgICAgICByZXR1cm4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvXG4gICAgfVxuICAgIHJlSURwYXJlbnRoZXNlcygpIHtcbiAgICAgICAgbGV0IHRva2Vucz10aGlzLnRva2Vuc1xuICAgICAgICBsZXQgYnJhY2tldHMgPSAwLCBsZXZlbENvdW50ID0ge307XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSBcIihcIikge1xuICAgICAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWxDb3VudFticmFja2V0c10gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xuICAgICAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxuICAgICAgICAgICAgICAgIHRva2Vuc1tpXSA9IHsgLi4udG9rZW5zW2ldLCBpZDogYnJhY2tldHMgKyBcIi5cIiArIElEIH07XG4gICAgICAgICAgICAgICAgYnJhY2tldHMrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgYnJhY2tldHMtLTtcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XG4gICAgICAgICAgICAgICAgLy8gUmVhc3NpZ24gdGhlIG9iamVjdCB3aXRoIHRoZSBuZXcgaWQgdG8gZW5zdXJlIHBlcnNpc3RlbmNlXG4gICAgICAgICAgICAgICAgdG9rZW5zW2ldID0geyAuLi50b2tlbnNbaV0sIGlkOiBicmFja2V0cyArIFwiLlwiICsgKElEID49IDAgPyBJRCA6IDApIH07XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zO1xuICAgICAgICB0aGlzLnJlb3JkZXIoKTtcbiAgICB9XG59XG5cbmNvbnN0IHBsdXNTeW1ib2xDaGVjayA9ICh0b2tlbnMsIGluZGV4KSA9PiB7XG4gICAgaWYgKCFpbmRleCA+IDApIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdG9rZW5zW2luZGV4XS52YWx1ZSA+PSAwICYmIC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2Vuc1tpbmRleCAtIDFdLnR5cGUpO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnIpIHtcbiAgICBsZXQgcmVzdWx0ID0gW107XG4gICAgXG4gICAgYXJyLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGl0ZW0pKSB7XG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KGZsYXR0ZW5BcnJheShpdGVtKSk7ICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIG5lc3RlZCBhcnJheXNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGl0ZW0pOyAgLy8gQWRkIG5vbi1hcnJheSBpdGVtcyB0byByZXN1bHRcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLypleHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycikge1xuICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICBsZXQgc3RhY2sgPSBBcnJheS5pc0FycmF5KGFycikgPyBbLi4uYXJyXSA6IFthcnJdOyAgLy8gRW5zdXJlIGFyciBpcyBhbiBhcnJheSBvciB3cmFwIGl0IGluIG9uZVxuXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBuZXh0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyAgLy8gU3ByZWFkIHRoZSBhcnJheSBpdGVtcyB0byB0aGUgc3RhY2tcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpOyAgLy8gQWRkIG5vbi1hcnJheSBpdGVtcyB0byB0aGUgcmVzdWx0XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTsgIC8vIFJldmVyc2UgdG8gbWFpbnRhaW4gb3JpZ2luYWwgb3JkZXJcbn0qLyJdfQ==