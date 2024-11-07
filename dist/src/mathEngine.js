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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUduRSxNQUFNLGNBQWMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FDL0MsQ0FBQyxLQUFLLEtBQUcsSUFBSSxJQUFFLEtBQUssQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUUsRUFBRSxDQUFDO0FBS3JFLE1BQU0sbUJBQW1CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsV0FBVyxFQUFDLEVBQUUsQ0FBQSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQzlFLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxJQUFJLEtBQUssR0FBRyxXQUFXO0lBQzFDLENBQUMsS0FBSyxLQUFLLENBQUM7UUFDWixDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDdEksQ0FBQztBQUVGLE1BQU0sb0JBQW9CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsY0FBYyxFQUFD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TSxVQUFVLFlBQVksQ0FBQyxHQUFHO0lBQzVCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUVoQixHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ2YsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3JCLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUUsb0NBQW9DO1NBQ3BGO2FBQU07WUFDSCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsZ0NBQWdDO1NBQ3ZEO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNsQixDQUFDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7O0dBY0ciLCJzb3VyY2VzQ29udGVudCI6WyJcclxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlc30gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuL2ltVmVyeUxhenlcIjtcclxuXHJcblxyXG5jb25zdCB0b2tlbklEQ29tcGFyZSA9ICh2YWx1ZSwgdG9rZW4sIG5leHRUb2tlbikgPT4gXHJcbiAgICAodmFsdWU9PT1udWxsfHx0b2tlbi5pZCA9PT0gdmFsdWUpICYmIHRva2VuLmlkID09PSBuZXh0VG9rZW4/LmlkO1xyXG5cclxuXHJcblxyXG5cclxuY29uc3QgZmluZE9wZW5kUGFyZW5JbmRleD0odG9rZW5zLGNoZWNrdFBhcmVuKT0+dG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgdG9rZW4udmFsdWUgPT09IFwiKFwiICYmIGluZGV4ID4gY2hlY2t0UGFyZW4gJiZcclxuICAgIChpbmRleCA9PT0gMCB8fCBcclxuICAgIChpbmRleCAtIDEgPj0gMCAmJiB0b2tlbnNbaW5kZXggLSAxXSAmJiAoIS8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRva2Vuc1tpbmRleCAtIDFdLnR5cGUpIHx8IC9bPV0vLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udmFsdWUpKSkpXHJcbik7XHJcblxyXG5jb25zdCBmaW5kQ2xvc2VkUGFyZW5JbmRleD0odG9rZW5zLG9wZW5QYXJlbkluZGV4KT0+dG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuLCBpbmRleCkgPT5cclxuICAgIHRva2VuSURDb21wYXJlKFwiKVwiLHRva2VuLHRva2Vuc1tvcGVuUGFyZW5JbmRleF0pICYmXHJcbiAgICAoKHRva2Vucy5sZW5ndGgtMT5pbmRleCAgJiYodG9rZW5zW2luZGV4ICsgMV0udHlwZSAhPT0gXCJvcGVyYXRvclwifHwvWz1dLy50ZXN0KHRva2Vuc1tpbmRleCArIDFdLnZhbHVlKSl8fCB0b2tlbnMubGVuZ3RoLTE9PT1pbmRleClcclxuKSk7XHJcblxyXG5jb25zdCBvcGVyYXRvcnNGb3JNYXRoaW5mbyA9IHtcclxuICAgIGJvdGhCdXRSaWdodEJyYWNrZXQ6IFtcIl5cIl0sXHJcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxyXG4gICAgYm90aDogW1wiK1wiLCBcIi1cIiwgXCIqXCJdLFxyXG4gICAgc3BlY2lhbDogW1wiPVwiXSxcclxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXHJcbiAgICBkb3VibGVSaWdodEJ1dEJyYWNrZXQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiLFwiL1wiXVxyXG59O1xyXG5jb25zdCBvcGVyYXRvclNpZGVzID0ge1xyXG4gICAgYm90aDogW1wiXlwiLCBcIitcIiwgXCItXCIsIFwiKlwiLCBcIi9cIiwgXCI9XCJdLFxyXG4gICAgcmlnaHRPbmx5OiBbXCJzcXJ0XCIsIFwic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxyXG4gICAgZG91YmxlUmlnaHQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiXVxyXG59O1xyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xyXG4gICAgZGVidWdJbmZvPVwiXCI7XHJcbiAgICBzb2x1dGlvbkluZm89W107XHJcbiAgICBtYXRoSW5mbz1bXVxyXG4gICAgZ3JhcGg9XCJcIjtcclxuICAgIGFkZEdyYXBoSW5mbyh2YWx1ZSl7XHJcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obXNnLCB2YWx1ZSl7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPSh0eXBlb2YgbXNnPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeShtc2cpOm1zZykrXCIgOiBcIisodHlwZW9mIHZhbHVlPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeSh2YWx1ZSk6dmFsdWUpKyBcIlxcbiBcIjtcclxuICAgIH1cclxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXMpe1xyXG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlNvbHZlZFwiLG1lcyk7XHJcbiAgICB9XHJcbiAgICBhZGRNYXRoSW5mbyh0b2tlbnMpe1xyXG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5wdXNoKHJlY29uc3RydWN0ZWRNYXRoKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFNvbHV0aW9uKHRva2Vucyxwb3NpdGlvbixzb2x1dGlvbil7XHJcbiAgICAgICAgc29sdXRpb249dG9rZW5zLnJlY29uc3RydWN0KFtzb2x1dGlvbl0pO1xyXG4gICAgICAgIGNvbnN0IGxlZnQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24uaW5kZXgpKTtcclxuICAgICAgICBjb25zdCByaWdodD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5pbmRleCsxLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhciwpKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0cnVlKXtcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoQnV0UmlnaHRCcmFja2V0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoL1xcKi9nLCBcIlxcXFxjZG90XCIpfSAke3JpZ2h0fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSBgXFxcXGZyYWN7JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8ucmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3J9ICgke3JpZ2h0fSkgPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKFwiL1wiLFwiZnJhY1wiKX17JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5hZGRTb2x1dGlvbkluZm8oc29sdXRpb24pO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XHJcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XHJcbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XHJcbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxyXG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxyXG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxyXG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcclxuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcclxuICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gcGFyc2UodG9rZW5zLG1hdGhJbmZvLHBvc2l0aW9uKSB7XHJcbiAgICBjb25zdCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodC52YWx1ZSE9PVwibnVtYmVyXCImJiEvKHNxcnR8Y29zfHNpbnx0YW4pLy50ZXN0KG9wZXJhdG9yKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQudmFsdWUhPT1cIm51bWJlclwiKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmlnaHQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgYXJlVGhlcmVPcGVyYXRvcnM9dG9rZW5zLnNvbWUodG9rZW49Pi8ob3BlcmF0b3IpLy50ZXN0KHRva2VuLnR5cGUpJiYhLyg9KS8udGVzdCh0b2tlbi52YWx1ZSkpXHJcbiAgICBcclxuICAgIGlmICghYXJlVGhlcmVPcGVyYXRvcnMpXHJcbiAgICB7XHJcbiAgICAgICAgdG9rZW5zPXNpbXBsaWZpeSh0b2tlbnMpXHJcbiAgICAgICAgbWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0b2tlbnMpXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcclxuICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiBcclxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgcG93SW5kZXhbMF0gPyBwb3dJbmRleFswXS52YWx1ZSAgOiAwLFxyXG4gICAgICAgICAgICAgICAgdmFyaWFibGVJbmRleFswXSA/IHZhcmlhYmxlSW5kZXhbMF0udmFsdWUgOiAwLFxyXG4gICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0gPyBudW1iZXJJbmRleFswXS52YWx1ZSAqIC0xOiAwLFxyXG4gICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0wJiZ2YXJpYWJsZUluZGV4Lmxlbmd0aCE9PTAmJm51bWJlckluZGV4IT09MClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyhgJHt2YXJpYWJsZUluZGV4WzBdLnZhcmlhYmxlfSA9IFxcXFxmcmFjeyR7bnVtYmVySW5kZXhbMF0udmFsdWV9fXske3ZhcmlhYmxlSW5kZXhbMF0udmFsdWV9fSA9ICR7KG51bWJlckluZGV4WzBdLnZhbHVlKS8odmFyaWFibGVJbmRleFswXS52YWx1ZSl9YClcclxuICAgICAgICAgICAgcmV0dXJuIGAke3ZhcmlhYmxlSW5kZXhbMF0udmFyaWFibGV9ID0gJHsobnVtYmVySW5kZXhbMF0udmFsdWUpLyh2YXJpYWJsZUluZGV4WzBdLnZhbHVlKX1gXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYodG9rZW5zLmxlbmd0aD09PTEmJm51bWJlckluZGV4KXtcclxuICAgICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG51bWJlckluZGV4LnZhbHVlPT09MClcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCBzb2x2ZWQ9e3ZhbHVlOiAwLHZhcmlhYmxlOiBcIlwiLHBvdzogXCJcIn07XHJcbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XHJcbiAgICAgICAgY2FzZSBcInNxcnRcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cocmlnaHQudmFsdWUsc3BlY2lhbENoYXIhPT1udWxsPygxKS8oc3BlY2lhbENoYXIpOjAuNSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJeXCI6XHJcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlfHxyaWdodC52YXJpYWJsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV8fGxlZnQudmFyaWFibGU9PT1yaWdodC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlP3JpZ2h0LnZhcmlhYmxlOlwiXCI7XHJcbiAgICAgICAgICAgICAgICBzb2x2ZWQucG93PTJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImZyYWNcIjpcclxuICAgICAgICBjYXNlIFwiL1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIipcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAqIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZX1cclxuICAgICAgICAgICAgZWxzZSBpZiAoIWxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGV9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGU7c29sdmVkLnBvdz0yfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiK1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICsgcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCItXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgLSByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImJpbm9tXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGNhbGN1bGF0ZUJpbm9tKGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwic2luXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSlcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInRhblwiOlxyXG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoXCJ0YW4gTXVzdCBiZSBzbWFsbGVyIHRoYW4gOTBcIik7fVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC50YW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImFzaW5cIjpcclxuICAgICAgICBjYXNlIFwiYXJjc2luXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hc2luKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhY29zXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY2Nvc1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYWNvcyhyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYXRhblwiOlxyXG4gICAgICAgIGNhc2UgXCJhcmN0YW5cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4ocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQscmlnaHQpe1xyXG4gICAgICAgIGxldCBoYW5kbGVkPXtWYXI6bnVsbCxQb3c6bnVsbH07XHJcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlZDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUhPT1yaWdodC52YXJpYWJsZSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlR3byB2YXJpYWJsZSBlcXVhdGlvbnMgYXJlbid0IGFjY2VwdGVkIHlldFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaGFuZGxlZC5WYXI9bGVmdC52YXI7XHJcblxyXG5cclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogc29sdmVkLnBvdz8gXCJwb3dlclZhcmlhYmxlXCI6c29sdmVkLnZhcmlhYmxlPyBcInZhcmlhYmxlXCI6IFwibnVtYmVyXCIsXHJcbiAgICAgICAgdmFsdWU6IHNvbHZlZC52YWx1ZSwgXHJcbiAgICAgICAgdmFyaWFibGU6IHNvbHZlZC52YXJpYWJsZT9zb2x2ZWQudmFyaWFibGU6XCJcIixcclxuICAgICAgICBwb3c6IHNvbHZlZC5wb3c/c29sdmVkLnBvdzpcIlwiLFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIHtcclxuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLCBlbmQsIHRva2VucywgcmVnZXgpIHtcclxuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMudG9rZW5zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBsZXQgaW5kZXg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocmVnZXgpIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybiAtMTtcclxuICAgIFxyXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4IC0gMV0udHlwZSA9PT0gdG9rZW5zLnRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiAtMTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aCxqPTA7XHJcbiAgICBsZXQgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgbGV0IGNoZWNrZWRJRHMgPSBbXTsgIFxyXG4gICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTtcclxuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCYmajwyMDApIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy50b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaisrO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zLnRva2Vuc1tpXS5pZCkpIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2ldLmlkKTsgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50SUQhPT1udWxsJiZpPT09Y3VycmVudElELmNsb3NlKSB7XHJcbiAgICAgICAgICAgICAgICBbYmVnaW4sZW5kXT1bY3VycmVudElELm9wZW4sY3VycmVudElELmNsb3NlXVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgYmVnaW4gPSAwO1xyXG4gICAgICAgICAgICBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aDtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xyXG5cclxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxyXG4gICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxyXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGo+PTIwMCl7dGhyb3cgbmV3IEVycm9yKFwib3BlcmF0aW9uc09yZGVyIEZhaWxlZCBleGNlZWRlZCAyMDAgcmV2aXNpb25zXCIpO31cclxuICAgIC8vIEZpbmQgaW5kaWNlcyBiYXNlZCBvbiBvcGVyYXRvciBwcmVjZWRlbmNlXHJcbiAgICBsZXQgcHJpb3JpdHkxID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLC8oXFxefHNxcnQpLyk7XHJcbiAgICBsZXQgcHJpb3JpdHkyID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKGZyYWN8Ymlub218c2lufGNvc3x0YW58YXNpbnxhY29zfGF0YW4pLyk7XHJcbiAgICBsZXQgcHJpb3JpdHkzID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKFxcKnxcXC8pLyk7XHJcbiAgICBsZXQgcHJpb3JpdHk0ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvWystXS8pO1xyXG4gICAgbGV0IHByaW9yaXR5NSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLz0vKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NV0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xyXG4gICAgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFwcGx5UG9zaXRpb24odG9rZW5zLCBpbmRleCwgZGlyZWN0aW9uKSB7XHJcbiAgICBsZXQgYnJlYWtDaGFyID0gaW5kZXg7XHJcbiAgICBsZXQgdGFyZ2V0O1xyXG5cclxuICAgIGNvbnN0IGlzTGVmdCA9IGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCI7XHJcbiAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcclxuICAgIGlmICgoaXNMZWZ0ICYmIGluZGV4IDw9IDApIHx8ICghaXNMZWZ0ICYmIGluZGV4ID49IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkgfHwgIXRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpIHtcclxuICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xyXG4gICAgICAgIGJyZWFrQ2hhciA9ICBpc0xlZnQgPyBwYXJlbkluZGV4Lm9wZW4gOiBwYXJlbkluZGV4LmNsb3NlO1xyXG4gICAgICAgIHRhcmdldCA9IHRva2Vucy50b2tlbnMuc2xpY2UoaXNMZWZ0ID8gYnJlYWtDaGFyIDogaW5kZXggKyAxLCBpc0xlZnQgPyBpbmRleCA6IGJyZWFrQ2hhcikuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdO1xyXG4gICAgfVxyXG4gICAgY29uc3QgbXVsdGlTdGVwID0gTWF0aC5hYnMoYnJlYWtDaGFyIC0gaW5kZXgpID49IDQ7XHJcbiAgICBpZiAodGFyZ2V0Py5sZW5ndGg9PT0wKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7ZGlyZWN0aW9ufSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWV9XCJgLCk7XHJcbiAgICB9XHJcbiAgICBicmVha0NoYXIgPSAoYnJlYWtDaGFyICE9PSBpbmRleCA/IHRhcmdldD8uaW5kZXggOiBicmVha0NoYXIpKyBpbmRleE1vZGlmaWVyKyhpc0xlZnQ/MDoxKTtcclxuICAgIGRlbGV0ZSB0YXJnZXQuaW5kZXhcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgLi4udGFyZ2V0LFxyXG4gICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxyXG4gICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uIHtcclxuICAgIG9wZXJhdG9yO1xyXG4gICAgaW5kZXg7XHJcbiAgICB0cmFuc2l0aW9uO1xyXG4gICAgc3BlY2lhbENoYXI7XHJcbiAgICBsZWZ0PSBudWxsO1xyXG4gICAgcmlnaHQ9IG51bGw7XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnMsIGluZGV4KXtcclxuICAgICAgICB0aGlzLmluZGV4PWluZGV4O1xyXG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXhcclxuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcclxuICAgIH1cclxuICAgIHBvc2l0aW9uKHRva2Vucykge1xyXG4gICAgICAgIHRoaXMuaW5kZXggPSB0aGlzLmluZGV4ID09PSBudWxsID8gb3BlcmF0aW9uc09yZGVyKHRva2VucykgOiB0aGlzLmluZGV4O1xyXG4gICAgICAgIGlmICh0aGlzLmluZGV4ID09PSBudWxsIHx8IHRoaXMuaW5kZXggPT09IHRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLm9wZXJhdG9yID0gdG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS52YWx1ZTtcclxuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLmJvdGguaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yU2lkZXMucmlnaHRPbmx5LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0ge2JyZWFrQ2hhcjogdGhpcy5pbmRleH07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yU2lkZXMuZG91YmxlUmlnaHQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5sZWZ0LmJyZWFrQ2hhcjtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQuYnJlYWtDaGFyICs9IDE7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmF0b3IgJHt0aGlzLm9wZXJhdG9yfSB3YXMgbm90IGFjY291bnRlZCBmb3IsIG9yIGlzIG5vdCB0aGUgdmFsaWQgb3BlcmF0b3JgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyIDogbnVsbDtcclxuICAgIH1cclxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXB8fHRoaXMucmlnaHQubXVsdGlTdGVwXHJcbiAgICB9XHJcbiAgICBjaGVja0ZyYWMoKXtcclxuICAgICAgICByZXR1cm4gLyhmcmFjfFxcLykvLnRlc3QodGhpcy5vcGVyYXRvcikmJiF0aGlzLmNoZWNrTXVsdGlTdGVwKCkmJnRoaXMubGVmdC50eXBlIT09dGhpcy5yaWdodC50eXBlO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gc2ltcGxpZml5KHRva2Vucyl7XHJcbiAgICBpZiAodG9rZW5zLmxlbmd0aDw9MSl7cmV0dXJuIHRva2Vuc31cclxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xyXG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUodG9rZW4gPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSkpXHJcbiAgICB7XHJcbiAgICAgICAgaSsrO1xyXG4gICAgICAgIGxldCBlcWluZGV4PXRva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKTtcclxuICAgICAgICBsZXQgT3BlcmF0aW9uSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbikgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XHJcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxyXG4gICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxyXG5cclxuICAgICAgICBsZXQgbnVtYmVyR3JvdXAgPSB0b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbiwgaSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxyXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtLnRva2VuLnR5cGU9PT1jdXJyZW50VG9rZW4udHlwZSkgXHJcbiAgICAgICAgLnJlZHVjZSgoc3VtLCBpdGVtKSA9PiB7XHJcbiAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09IFwiLVwiKSA/IC0xIDogMTtcclxuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxyXG4gICAgICAgIGlmICghKC8obnVtYmVyKS8pLnRlc3QoaXRlbS50b2tlbi50eXBlKSl7bXVsdGlwbGllcio9LTF9XHJcbiAgICAgICAgcmV0dXJuIHN1bSArIChpdGVtLnRva2VuLnZhbHVlICogbXVsdGlwbGllcik7XHJcbiAgICAgICAgfSwgMCk7IFxyXG4gICAgICAgIFxyXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKHtcclxuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxyXG4gICAgICAgICAgICB2YWx1ZTogbnVtYmVyR3JvdXBcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdG9rZW5zID0gdG9rZW5zLmZpbHRlcih0b2tlbiA9PiBcclxuICAgICAgICAgICAgdG9rZW4udHlwZSAhPT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXHJcbiAgICAgICAgICAgICh0b2tlbi5wb3cgJiYgdG9rZW4ucG93ICE9PSBjdXJyZW50VG9rZW4ucG93KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV3VG9rZW5zO1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aFByYWlzZXJ7XHJcbiAgICBpbnB1dD1cIlwiO1xyXG4gICAgdG9rZW5zPVtdO1xyXG4gICAgc29sdXRpb249XCJcIjtcclxuICAgIG1hdGhJbmZvPW5ldyBNYXRoSW5mbygpO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGlucHV0KXtcclxuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xyXG4gICAgICAgIHRoaXMucHJvY2Vzc0lucHV0KCk7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9bmV3IFRva2Vucyh0aGlzLmlucHV0KTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlRva2VucyBhZnRlciB0b2tlbml6ZVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICB0aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xyXG4gICAgfVxyXG4gICAgYXN5bmMoKXtcclxuXHJcbiAgICB9XHJcbiAgICBjb250cm9sbGVyKCl7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuY29ubmVjdE5lYXJieVRva2VucygpO1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkTWF0aEluZm8odGhpcy50b2tlbnMpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8odGhpcy50b2tlbnMudG9rZW5zLHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGgpXHJcbiAgICAgICAgdGhpcy50b2tlbnMuZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLnRva2VucyxudWxsKTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlBhcnNlZCBleHByZXNzaW9uXCIsIEpTT04uc3RyaW5naWZ5KHBvc2l0aW9uLCBudWxsLCAwLjAxKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHBvc2l0aW9uID09PSBudWxsJiZ0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjEpe1xyXG4gICAgICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcInBhcnNlKHRva2VucylcIixwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMpKVxyXG4gICAgICAgICAgICByZXR1cm4gXCJ0aGUgKioqKlwiXHJcbiAgICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKHBvc2l0aW9uLmluZGV4ID09PSBudWxsKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHBvc2l0aW9uLmNoZWNrRnJhYygpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxyXG4gICAgICAgIHsgICBcclxuICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XHJcbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zKSlcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc29sdmVkID0gcGFyc2UodGhpcy50b2tlbnMudG9rZW5zLHRoaXMubWF0aEluZm8sIHBvc2l0aW9uKTtcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNvbHZlZFwiLHNvbHZlZClcclxuXHJcbiAgICAgICAgaWYgKHNvbHZlZCA9PT0gbnVsbCkge3JldHVybiBudWxsOyB9XHJcbiAgICAgICAgaWYgKHR5cGVvZiBzb2x2ZWQ9PT1cInN0cmluZ1wiKSB7cmV0dXJuIHNvbHZlZDsgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxyXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKGxlZnRCcmVhayxsZW5ndGgsc29sdmVkKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjE/dGhpcy5jb250cm9sbGVyKCk6dGhpcy5maW5hbFJldHVybigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZERlYnVnSW5mbyhtZXMsdmFsdWUpe1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSlcclxuICAgIH1cclxuICAgIHByb2Nlc3NJbnB1dCgpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy5pbnB1dFxyXG4gICAgICAgIC5yZXBsYWNlKC8oXFxzfFxcXFxsZWZ0fFxcXFxyaWdodCkvZywgXCJcIikgXHJcbiAgICAgICAgLnJlcGxhY2UoL3svZywgXCIoXCIpIFxyXG4gICAgICAgIC5yZXBsYWNlKC99L2csIFwiKVwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC8oXFxcXGNkb3R8Y2RvdCkvZywgXCIqXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL01hdGguL2csIFwiXFxcXFwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC8oPzwhXFxcXHxbYS16QS1aXSkodGFufHNpbnxjb3N8Ymlub218ZnJhY3xhc2lufGFjb3N8YXRhbnxhcmNjb3N8YXJjc2lufGFyY3RhbnxjZG90KS9nLCBcIlxcXFwkMVwiKTtcclxuICAgIH1cclxuICAgIGZpbmFsUmV0dXJuKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmNsYXNzIFRva2Vuc3tcclxuICAgIHRva2Vucz1bXTtcclxuICAgIGNvbnN0cnVjdG9yKG1hdGgpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5pemUobWF0aCk7XHJcbiAgICB9XHJcbiAgICB0b2tlbml6ZShtYXRoKXtcclxuICAgICAgICBsZXQgdG9rZW5zID0gW107XHJcbiAgICAgICAgbGV0IGJyYWNrZXRzID0gMCwgIGxldmVsQ291bnQgPSB7fTtcclxuICAgICAgICBsZXQgaj0wO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBqKys7XHJcbiAgICAgICAgICAgIGlmKGo+NTAwKXticmVhazt9XHJcbiAgICAgICAgICAgIGxldCBudW1iZXI9MCwgIHN0YXJ0UG9zID0gaSx2YXJpPVwiXCI7XHJcblxyXG4gICAgICAgICAgICBpZigvWyhcXFxcXS8udGVzdChtYXRoW2ldKSYmaT4wKXtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJlZm9yZVBhcmVudGhlc2VzPS8obnVtYmVyfHZhcmlhYmxlfHBvd1ZhcmlhYmxlKS8udGVzdCh0b2tlbnNbdG9rZW5zLmxlbmd0aC0xXS50eXBlKVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBjb25zdCBsYXN0SW5kZXggPSB0b2tlbnMubWFwKHRva2VuID0+IHRva2VuLmlkKS5pbmRleE9mKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0uaWQpIC0gMTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJldHdlZW5QYXJlbnRoZXNlcz1tYXRoW2ktMV0gPT09IFwiKVwiJiYobGFzdEluZGV4PDB8fCEvKGZyYWN8Ymlub218KS8udGVzdCh0b2tlbnNbbGFzdEluZGV4XS52YWx1ZSkpXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmICgodG9rZW5zLmxlbmd0aC0xPj0wJiZiZWZvcmVQYXJlbnRoZXNlcyl8fChiZXR3ZWVuUGFyZW50aGVzZXMpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYobWF0aFtpLTFdPT09XCItXCIpe21hdGggPSBtYXRoLnNsaWNlKDAsIGkpKyBcIjFcIiArbWF0aC5zbGljZShpKX1cclxuICAgICAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwib3BlcmF0b3JcIiwgdmFsdWU6IFwiKlwiLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYobWF0aFtpKzFdPT09XCItXCIpe21hdGggPSBtYXRoLnNsaWNlKDAsIGkpKyBcIjFcIiArbWF0aC5zbGljZShpKX1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKG1hdGhbaV0gPT09IFwiKFwiKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWxldmVsQ291bnRbYnJhY2tldHNdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWxDb3VudFticmFja2V0c10gPSAwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10rKztcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJwYXJlblwiLCB2YWx1ZTogXCIoXCIsIGlkOiBicmFja2V0cyArIFwiLlwiICsgSUQsIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xyXG4gICAgICAgICAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSBcIilcIikge1xyXG4gICAgICAgICAgICAgICAgYnJhY2tldHMtLTsgXHJcbiAgICAgICAgICAgICAgICBpZiAoYnJhY2tldHMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5tYXRjaGVkIGNsb3NpbmcgYnJhY2tldCBhdCBwb3NpdGlvblwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdIC0gMTtcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJwYXJlblwiLCB2YWx1ZTogXCIpXCIsIGlkOiBicmFja2V0cyArIFwiLlwiICsgKElEID49IDAgPyBJRCA6IDApLCBpbmRleDogdG9rZW5zLmxlbmd0aCB9KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGkrMTxtYXRoLmxlbmd0aCYmL1swLTlBLVphLXouXS8udGVzdChtYXRoW2krMV0pKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIGkrMSkgKyBcIipcIiArIG1hdGguc2xpY2UoaSsxKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gXCJcXFxcXCIpIHtcclxuICAgICAgICAgICAgICAgIGkrPTE7ICBcclxuICAgICAgICAgICAgICAgIGxldCBvcGVyYXRvciA9IChtYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsvKSB8fCBbXCJcIl0pWzBdXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJvcGVyYXRvclwiLCB2YWx1ZTogb3BlcmF0b3IsIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xyXG4gICAgICAgICAgICAgICAgaSs9b3BlcmF0b3IubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09IFwic3FydFwiICYmIG1hdGhbaV0gPT09IFwiW1wiICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcclxuICAgICAgICAgICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxyXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGktLTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykoW2EtekEtWl0/KS8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gmJiFtYXRjaFsyXSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbnVtYmVyPW1hdGNoWzBdXHJcbiAgICAgICAgICAgICAgICBpKz1udW1iZXIubGVuZ3RoPjE/bnVtYmVyLmxlbmd0aC0xOjA7XHJcbiAgICAgICAgICAgICAgICBpZigvWystXS8udGVzdChtYXRoW3N0YXJ0UG9zLTFdKSl7bnVtYmVyPW1hdGhbc3RhcnRQb3MtMV0rbnVtYmVyfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAobWF0aFtpKzFdJiYvW2EtekEtWl0vLnRlc3QobWF0aFtpKzFdKSl7Y29udGludWU7fVxyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm51bWJlclwiLCB2YWx1ZTogcGFyc2VGbG9hdChudW1iZXIpLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykoW2EtekEtWl0/KS8pO1xyXG4gICAgICAgICAgICBpZiAoL1thLXpBLVpdLy50ZXN0KG1hdGhbaV0pKSB7XHJcbiAgICAgICAgICAgICAgICB2YXJpPSAobWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pIHx8IFtcIlwiXSlbMF07XHJcbiAgICAgICAgICAgICAgICBpZiAodmFyaSYmdmFyaS5sZW5ndGg9PT0wKXt2YXJpPW1hdGguc2xpY2UoaSxtYXRoLmxlbmd0aCl9XHJcbiAgICAgICAgICAgICAgICBudW1iZXI9bWF0aC5zbGljZShpK3ZhcmkubGVuZ3RoLHZhcmkubGVuZ3RoK2krbWF0aC5zbGljZShpK3ZhcmkubGVuZ3RoKS5zZWFyY2goL1teMC05XS8pKVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpKz12YXJpLmxlbmd0aCtudW1iZXIubGVuZ3RoLTE7XHJcbiAgICAgICAgICAgICAgICBudW1iZXI9c2FmZVRvTnVtYmVyKG51bWJlci5sZW5ndGg+MD9udW1iZXI6MSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoL1swLTldLy50ZXN0KG1hdGhbc3RhcnRQb3M+MD9zdGFydFBvcy0xOjBdKSYmdG9rZW5zKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIG51bWJlcj0obWF0aC5zbGljZSgwLHN0YXJ0UG9zKS5tYXRjaCgvWzAtOS5dKyg/PVteMC05Ll0qJCkvKXx8IFtcIlwiXSlbMF07XHJcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVyPW1hdGhbc3RhcnRQb3MtbnVtYmVyLmxlbmd0aC0xXSYmbWF0aFtzdGFydFBvcy1udW1iZXIubGVuZ3RoLTFdPT09XCItXCI/XCItXCIrbnVtYmVyOm51bWJlcjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYoL1stXS8udGVzdChtYXRoW3N0YXJ0UG9zLTFdKSl7bnVtYmVyPW1hdGhbc3RhcnRQb3MtMV0rbnVtYmVyfVxyXG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goe3R5cGU6IFwidmFyaWFibGVcIix2YXJpYWJsZTogdmFyaS5yZXBsYWNlKFwiKFwiLFwie1wiKS5yZXBsYWNlKFwiKVwiLFwifVwiKSx2YWx1ZTogc2FmZVRvTnVtYmVyKG51bWJlciksIGluZGV4OiB0b2tlbnMubGVuZ3RofSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICgvWyovXj1dLy50ZXN0KG1hdGhbaV0pfHwoIS9bYS16QS1aMC05XS8udGVzdChtYXRoW2krMV0pJiYvWystXS8udGVzdChtYXRoW2ldKSkpIHtcclxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJvcGVyYXRvclwiLCB2YWx1ZTogbWF0aFtpXSwgaW5kZXg6IHRva2Vucy5sZW5ndGg/dG9rZW5zLmxlbmd0aDowIH0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKC9bKy1cXGRdLy50ZXN0KG1hdGhbaV0pKXtjb250aW51ZTt9XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYnJhY2tldHMhPT0wKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIChcIlVubWF0Y2hlZCBvcGVuaW5nIGJyYWNrZXQocylcIilcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRva2Vuc1xyXG4gICAgfVxyXG5cclxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcclxuICAgICAgICBsZXQgaT0wLG1vcmVDb25uZWN0ZWRUb2tlbnM9dHJ1ZTtcclxuICAgICAgICB3aGlsZSAoaSA8IDEwMCAmJiBtb3JlQ29ubmVjdGVkVG9rZW5zKSB7XHJcbiAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmZpbmRTaW1pbGFyU3VjY2Vzc29yKHRoaXMudG9rZW5zKVxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPj0wKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleF0udmFsdWUrPXRoaXMudG9rZW5zW2luZGV4KzFdLnZhbHVlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXggKyAxLCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBsZXQgb3BlblBhcmVuSW5kZXg9LTEsY2xvc2VQYXJlbkluZGV4PS0xLGNoZWNrdFBhcmVuPS0xO1xyXG4gICAgXHJcbiAgICAgICAgICAgIHdoaWxlIChpPDEwMCkge1xyXG4gICAgICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICAgICAgb3BlblBhcmVuSW5kZXggPSBmaW5kT3BlbmRQYXJlbkluZGV4KHRoaXMudG9rZW5zLGNoZWNrdFBhcmVuKVxyXG4gICAgICAgICAgICAgICAgY2xvc2VQYXJlbkluZGV4ID0gb3BlblBhcmVuSW5kZXggPT09IC0xPy0xOmZpbmRDbG9zZWRQYXJlbkluZGV4KHRoaXMudG9rZW5zLG9wZW5QYXJlbkluZGV4KVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAob3BlblBhcmVuSW5kZXg9PT0tMXx8Y2xvc2VQYXJlbkluZGV4IT09LTEpe2JyZWFrO31cclxuICAgICAgICAgICAgICAgIGNoZWNrdFBhcmVuPW9wZW5QYXJlbkluZGV4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChjbG9zZVBhcmVuSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PlxyXG4gICAgICAgICAgICAgICAgICAgIGlkeCAhPT0gb3BlblBhcmVuSW5kZXggJiYgaWR4ICE9PSBjbG9zZVBhcmVuSW5kZXhcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSAmJiBjbG9zZVBhcmVuSW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnJlSURwYXJlbnRoZXNlcyh0aGlzLnRva2VucylcclxuICAgIH1cclxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcclxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd1ZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcclxuICAgICAgICApXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgIH1cclxuICAgIGluc2VydFRva2VucyhzdGFydCwgbGVuZ3RoLCBvYmplY3RzKSB7XHJcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJlb3JkZXIoKXtcclxuICAgICAgICBsZXQgbmV3VG9rZW5zID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgbmV3VG9rZW4gPSB7IC4uLnRoaXMudG9rZW5zW2ldLCBpbmRleDogaSB9O1xyXG4gICAgICAgICAgICBuZXdUb2tlbnMucHVzaChuZXdUb2tlbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zPW5ld1Rva2VucztcclxuICAgIH1cclxuICAgIHJlY29uc3RydWN0KHRva2Vucyl7XHJcbiAgICAgICAgaWYgKHRva2Vucz09PXVuZGVmaW5lZCl7XHJcbiAgICAgICAgICAgIHRva2Vucz10aGlzLnRva2VucztcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IG1hdGggPSBcIlwiO1xyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPHRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgbGV0IHRlbXA7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWU9PT1cIihcIiYmdG9rZW5zW3Rva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQmJnRva2Vuc1tpbmRleCsxXSkrMV0udmFsdWU9PT1cIi9cIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN3aXRjaCAodG9rZW5zW2ldLnR5cGUpe1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm51bWJlclwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRlbXA9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrcm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcclxuICAgICAgICAgICAgICAgICAgICBtYXRoKz10ZW1wKyhpKzE8dG9rZW5zLmxlbmd0aCYmLyhmcmFjKS8udGVzdCh0b2tlbnNbaSsxXS52YWx1ZSk/XCIrXCI6XCJcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwicGFyZW5cIjpcclxuICAgICAgICAgICAgICAgICAgICB0ZW1wPXRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRva2Vuc1tpXS5pZCkub3Blbi0xXVxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGVtcCAhPT0gXCJ1bmRlZmluZWRcIiAmJiBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKChjdXJseUJyYWNrZXRzUmVnZXgudGVzdCh0ZW1wLnZhbHVlKSkgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICgvXFwpLy50ZXN0KHRlbXAudmFsdWUpICYmIGN1cmx5QnJhY2tldHNSZWdleC50ZXN0KHRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRlbXAuaWQpLm9wZW4gLSAxXS52YWx1ZSkpKSkgXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoICs9IHRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCBcIntcIikucmVwbGFjZSgvXFwpLywgXCJ9XCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChpPjAmJnRva2Vuc1tpXS52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbaS0xXT8udmFsdWU9PT1cIilcIil7bWF0aCs9XCIrXCJ9XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9dG9rZW5zW2ldLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm9wZXJhdG9yXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgIT09IFwiL1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWUpLnJlcGxhY2UoLyhbXipePS8rLV0pLyxcIlxcXFwkMVwiKS5yZXBsYWNlKC9cXCovZyxcIlxcXFxjZG90IFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrKHRva2Vuc1tpXS52YWx1ZSE9PTE/dG9rZW5zW2ldLnZhbHVlOlwiXCIpK3Rva2Vuc1tpXS52YXJpYWJsZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJwb3dlclZhcmlhYmxlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpKVxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpKyh0b2tlbnNbaV0udmFsdWUhPT0xP3Rva2Vuc1tpXS52YWx1ZTpcIlwiKSt0b2tlbnNbaV0udmFyaWFibGUrYF57JHt0b2tlbnNbaV0ucG93fX1gO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgdG9raW4gdHlwZSBnaXZlbiB0byByZWNvbnN0cnVjdDogdHlwZSAke3Rva2Vuc1tpXS50eXBlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRoXHJcbiAgICB9XHJcbiAgICBmaW5kUGFyZW5JbmRleChpZCxpbmRleCl7XHJcbiAgICAgICAgdHJ5e1xyXG4gICAgICAgICAgICBpZD1pbmRleD90aGlzLnRva2Vuc1tpbmRleF0uaWQ6aWQ7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wZW49dGhpcy50b2tlbnMuZmluZEluZGV4KFxyXG4gICAgICAgICAgICAgICAgdG9rZW49PnRva2VuLnZhbHVlPT09XCIoXCJcclxuICAgICAgICAgICAgICAgICYmdG9rZW4uaWQ9PT1pZFxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlPXRoaXMudG9rZW5zLmZpbmRMYXN0SW5kZXgoXHJcbiAgICAgICAgICAgICAgICB0b2tlbj0+dG9rZW4udmFsdWU9PT1cIilcIlxyXG4gICAgICAgICAgICAgICAgJiZ0b2tlbi5pZD09PWlkXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICAgcmV0dXJue29wZW46IG9wZW4sY2xvc2U6IGNsb3NlLGlkOmlkfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaChlKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZSwgdmFsdWUsIHRva2VuLCBuZXh0VG9rZW4pIHtcclxuICAgICAgICB2YWx1ZSA9IHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcclxuICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXHJcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xyXG4gICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFsdWVUb2tlbnMoKXtcclxuICAgICAgICByZXR1cm4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvXHJcbiAgICB9XHJcbiAgICByZUlEcGFyZW50aGVzZXMoKSB7XHJcbiAgICAgICAgbGV0IHRva2Vucz10aGlzLnRva2Vuc1xyXG4gICAgICAgIGxldCBicmFja2V0cyA9IDAsIGxldmVsQ291bnQgPSB7fTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSBcIihcIikge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsQ291bnRbYnJhY2tldHNdID0gMDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XHJcbiAgICAgICAgICAgICAgICAvLyBSZWFzc2lnbiB0aGUgb2JqZWN0IHdpdGggdGhlIG5ldyBpZCB0byBlbnN1cmUgcGVyc2lzdGVuY2VcclxuICAgICAgICAgICAgICAgIHRva2Vuc1tpXSA9IHsgLi4udG9rZW5zW2ldLCBpZDogYnJhY2tldHMgKyBcIi5cIiArIElEIH07XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cysrO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIpXCIpIHtcclxuICAgICAgICAgICAgICAgIGJyYWNrZXRzLS07XHJcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XHJcbiAgICAgICAgICAgICAgICAvLyBSZWFzc2lnbiB0aGUgb2JqZWN0IHdpdGggdGhlIG5ldyBpZCB0byBlbnN1cmUgcGVyc2lzdGVuY2VcclxuICAgICAgICAgICAgICAgIHRva2Vuc1tpXSA9IHsgLi4udG9rZW5zW2ldLCBpZDogYnJhY2tldHMgKyBcIi5cIiArIChJRCA+PSAwID8gSUQgOiAwKSB9O1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zO1xyXG4gICAgICAgIHRoaXMucmVvcmRlcigpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jb25zdCBwbHVzU3ltYm9sQ2hlY2sgPSAodG9rZW5zLCBpbmRleCkgPT4ge1xyXG4gICAgaWYgKCFpbmRleCA+IDApIHJldHVybiBmYWxzZTtcclxuICAgIHJldHVybiB0b2tlbnNbaW5kZXhdLnZhbHVlID49IDAgJiYgLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udHlwZSk7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycikge1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG4gICAgXHJcbiAgICBhcnIuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSkge1xyXG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KGZsYXR0ZW5BcnJheShpdGVtKSk7ICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIG5lc3RlZCBhcnJheXNcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaChpdGVtKTsgIC8vIEFkZCBub24tYXJyYXkgaXRlbXMgdG8gcmVzdWx0XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuLypleHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycikge1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG4gICAgbGV0IHN0YWNrID0gQXJyYXkuaXNBcnJheShhcnIpID8gWy4uLmFycl0gOiBbYXJyXTsgIC8vIEVuc3VyZSBhcnIgaXMgYW4gYXJyYXkgb3Igd3JhcCBpdCBpbiBvbmVcclxuXHJcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpO1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XHJcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7ICAvLyBTcHJlYWQgdGhlIGFycmF5IGl0ZW1zIHRvIHRoZSBzdGFja1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpOyAgLy8gQWRkIG5vbi1hcnJheSBpdGVtcyB0byB0aGUgcmVzdWx0XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpOyAgLy8gUmV2ZXJzZSB0byBtYWludGFpbiBvcmlnaW5hbCBvcmRlclxyXG59Ki8iXX0=