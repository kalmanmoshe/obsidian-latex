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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUduRSxNQUFNLGNBQWMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FDL0MsQ0FBQyxLQUFLLEtBQUcsSUFBSSxJQUFFLEtBQUssQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUUsRUFBRSxDQUFDO0FBS3JFLE1BQU0sbUJBQW1CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsV0FBVyxFQUFDLEVBQUUsQ0FBQSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQzlFLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxJQUFJLEtBQUssR0FBRyxXQUFXO0lBQzFDLENBQUMsS0FBSyxLQUFLLENBQUM7UUFDWixDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDdEksQ0FBQztBQUVGLE1BQU0sb0JBQW9CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsY0FBYyxFQUFD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TSxVQUFVLFlBQVksQ0FBQyxHQUFHO0lBQzVCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUVoQixHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ2YsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3JCLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUUsb0NBQW9DO1NBQ3BGO2FBQU07WUFDSCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsZ0NBQWdDO1NBQ3ZEO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNsQixDQUFDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7O0dBY0ciLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXN9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4vaW1WZXJ5TGF6eVwiO1xuXG5cbmNvbnN0IHRva2VuSURDb21wYXJlID0gKHZhbHVlLCB0b2tlbiwgbmV4dFRva2VuKSA9PiBcbiAgICAodmFsdWU9PT1udWxsfHx0b2tlbi5pZCA9PT0gdmFsdWUpICYmIHRva2VuLmlkID09PSBuZXh0VG9rZW4/LmlkO1xuXG5cblxuXG5jb25zdCBmaW5kT3BlbmRQYXJlbkluZGV4PSh0b2tlbnMsY2hlY2t0UGFyZW4pPT50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XG4gICAgdG9rZW4udmFsdWUgPT09IFwiKFwiICYmIGluZGV4ID4gY2hlY2t0UGFyZW4gJiZcbiAgICAoaW5kZXggPT09IDAgfHwgXG4gICAgKGluZGV4IC0gMSA+PSAwICYmIHRva2Vuc1tpbmRleCAtIDFdICYmICghLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udHlwZSkgfHwgL1s9XS8udGVzdCh0b2tlbnNbaW5kZXggLSAxXS52YWx1ZSkpKSlcbik7XG5cbmNvbnN0IGZpbmRDbG9zZWRQYXJlbkluZGV4PSh0b2tlbnMsb3BlblBhcmVuSW5kZXgpPT50b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW4sIGluZGV4KSA9PlxuICAgIHRva2VuSURDb21wYXJlKFwiKVwiLHRva2VuLHRva2Vuc1tvcGVuUGFyZW5JbmRleF0pICYmXG4gICAgKCh0b2tlbnMubGVuZ3RoLTE+aW5kZXggICYmKHRva2Vuc1tpbmRleCArIDFdLnR5cGUgIT09IFwib3BlcmF0b3JcInx8L1s9XS8udGVzdCh0b2tlbnNbaW5kZXggKyAxXS52YWx1ZSkpfHwgdG9rZW5zLmxlbmd0aC0xPT09aW5kZXgpXG4pKTtcblxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cbn07XG5jb25zdCBvcGVyYXRvclNpZGVzID0ge1xuICAgIGJvdGg6IFtcIl5cIiwgXCIrXCIsIFwiLVwiLCBcIipcIiwgXCIvXCIsIFwiPVwiXSxcbiAgICByaWdodE9ubHk6IFtcInNxcnRcIiwgXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXG4gICAgZG91YmxlUmlnaHQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiXVxufTtcblxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xuICAgIGRlYnVnSW5mbz1cIlwiO1xuICAgIHNvbHV0aW9uSW5mbz1bXTtcbiAgICBtYXRoSW5mbz1bXVxuICAgIGdyYXBoPVwiXCI7XG4gICAgYWRkR3JhcGhJbmZvKHZhbHVlKXtcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtc2csIHZhbHVlKXtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPSh0eXBlb2YgbXNnPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeShtc2cpOm1zZykrXCIgOiBcIisodHlwZW9mIHZhbHVlPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeSh2YWx1ZSk6dmFsdWUpKyBcIlxcbiBcIjtcbiAgICB9XG4gICAgYWRkU29sdXRpb25JbmZvKG1lcyl7XG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xuICAgIH1cbiAgICBhZGRNYXRoSW5mbyh0b2tlbnMpe1xuICAgICAgICBjb25zdCByZWNvbnN0cnVjdGVkTWF0aD10b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gocmVjb25zdHJ1Y3RlZE1hdGgpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xuICAgIH1cblxuICAgIGFkZFNvbHV0aW9uKHRva2Vucyxwb3NpdGlvbixzb2x1dGlvbil7XG4gICAgICAgIHNvbHV0aW9uPXRva2Vucy5yZWNvbnN0cnVjdChbc29sdXRpb25dKTtcbiAgICAgICAgY29uc3QgbGVmdD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5pbmRleCkpO1xuICAgICAgICBjb25zdCByaWdodD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5pbmRleCsxLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhciwpKTtcblxuICAgICAgICBzd2l0Y2ggKHRydWUpe1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoQnV0UmlnaHRCcmFja2V0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvcn0geyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKC9cXCovZywgXCJcXFxcY2RvdFwiKX0gJHtyaWdodH0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gYFxcXFxmcmFjeyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8ucmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGBcXFxcc3FydHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZShcIi9cIixcImZyYWNcIil9eyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYWRkU29sdXRpb25JbmZvKHNvbHV0aW9uKTtcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XG4gICAgaWYgKCEodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSl7cmV0dXJuIHZhbHVlfVxuICAgIGlmICh2YWx1ZT09PVwiK1wiKXtyZXR1cm4gMH1cbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QodmFsdWUpKXtyZXR1cm4gMX1cbiAgICBpZigvWyhbXS8udGVzdCh2YWx1ZVswXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMSl9XG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxuICAgIGZvciAobGV0IGkgPSAwOyBpPHZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVbaV0gPT09IFwic3RyaW5nXCIgJiYgL1soKVtcXF1dLy50ZXN0KHZhbHVlW2ldKSkge1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcbiAgICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xuICAgIHJldHVybiBpc05hTihudW0pID8gdmFsdWUubGVuZ3RoPjA/dmFsdWU6MCA6IG51bTtcbn1cblxuXG5cbmZ1bmN0aW9uIHBhcnNlKHRva2VucyxtYXRoSW5mbyxwb3NpdGlvbikge1xuICAgIGNvbnN0IHsgb3BlcmF0b3Isc3BlY2lhbENoYXIsIGxlZnQscmlnaHR9ID0gcG9zaXRpb247XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodC52YWx1ZSE9PVwibnVtYmVyXCImJiEvKHNxcnR8Y29zfHNpbnx0YW4pLy50ZXN0KG9wZXJhdG9yKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMZWZ0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQudmFsdWUhPT1cIm51bWJlclwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJpZ2h0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGFyZVRoZXJlT3BlcmF0b3JzPXRva2Vucy5zb21lKHRva2VuPT4vKG9wZXJhdG9yKS8udGVzdCh0b2tlbi50eXBlKSYmIS8oPSkvLnRlc3QodG9rZW4udmFsdWUpKVxuICAgIFxuICAgIGlmICghYXJlVGhlcmVPcGVyYXRvcnMpXG4gICAge1xuICAgICAgICB0b2tlbnM9c2ltcGxpZml5KHRva2VucylcbiAgICAgICAgbWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0b2tlbnMpXG4gICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cbiBcbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHJldHVybiBxdWFkKFxuICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdID8gcG93SW5kZXhbMF0udmFsdWUgIDogMCxcbiAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdID8gdmFyaWFibGVJbmRleFswXS52YWx1ZSA6IDAsXG4gICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0gPyBudW1iZXJJbmRleFswXS52YWx1ZSAqIC0xOiAwLFxuICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdLnZhcmlhYmxlLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTAmJnZhcmlhYmxlSW5kZXgubGVuZ3RoIT09MCYmbnVtYmVySW5kZXghPT0wKVxuICAgICAgICB7XG4gICAgICAgICAgICBtYXRoSW5mby5hZGRTb2x1dGlvbkluZm8oYCR7dmFyaWFibGVJbmRleFswXS52YXJpYWJsZX0gPSBcXFxcZnJhY3ske251bWJlckluZGV4WzBdLnZhbHVlfX17JHt2YXJpYWJsZUluZGV4WzBdLnZhbHVlfX0gPSAkeyhudW1iZXJJbmRleFswXS52YWx1ZSkvKHZhcmlhYmxlSW5kZXhbMF0udmFsdWUpfWApXG4gICAgICAgICAgICByZXR1cm4gYCR7dmFyaWFibGVJbmRleFswXS52YXJpYWJsZX0gPSAkeyhudW1iZXJJbmRleFswXS52YWx1ZSkvKHZhcmlhYmxlSW5kZXhbMF0udmFsdWUpfWBcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmKHRva2Vucy5sZW5ndGg9PT0xJiZudW1iZXJJbmRleCl7XG4gICAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkobnVtYmVySW5kZXgudmFsdWU9PT0wKVxuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIGxldCBzb2x2ZWQ9e3ZhbHVlOiAwLHZhcmlhYmxlOiBcIlwiLHBvdzogXCJcIn07XG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlIFwic3FydFwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cocmlnaHQudmFsdWUsc3BlY2lhbENoYXIhPT1udWxsPygxKS8oc3BlY2lhbENoYXIpOjAuNSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIl5cIjpcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlfHxyaWdodC52YXJpYWJsZSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZXx8bGVmdC52YXJpYWJsZT09PXJpZ2h0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU/cmlnaHQudmFyaWFibGU6XCJcIjtcbiAgICAgICAgICAgICAgICBzb2x2ZWQucG93PTJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJmcmFjXCI6XG4gICAgICAgIGNhc2UgXCIvXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiKlwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAqIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgaWYgKGxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV9XG4gICAgICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cbiAgICAgICAgICAgIGVsc2UgaWYgKGxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGU7c29sdmVkLnBvdz0yfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCIrXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICsgcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCItXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlIC0gcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlQmlub20obGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInNpblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJjb3NcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguY29zKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJ0YW5cIjpcbiAgICAgICAgICAgIGlmIChyaWdodD49OTApe3Rocm93IG5ldyBFcnJvcihcInRhbiBNdXN0IGJlIHNtYWxsZXIgdGhhbiA5MFwiKTt9XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC50YW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYXNpblwiOlxuICAgICAgICBjYXNlIFwiYXJjc2luXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXNpbihyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhY29zXCI6XG4gICAgICAgIGNhc2UgXCJhcmNjb3NcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hY29zKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImF0YW5cIjpcbiAgICAgICAgY2FzZSBcImFyY3RhblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4ocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQscmlnaHQpe1xuICAgICAgICBsZXQgaGFuZGxlZD17VmFyOm51bGwsUG93Om51bGx9O1xuICAgICAgICBpZiAoIWxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7XG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSE9PXJpZ2h0LnZhcmlhYmxlKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlR3byB2YXJpYWJsZSBlcXVhdGlvbnMgYXJlbid0IGFjY2VwdGVkIHlldFwiKTtcbiAgICAgICAgfVxuICAgICAgICBoYW5kbGVkLlZhcj1sZWZ0LnZhcjtcblxuXG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIHR5cGU6IHNvbHZlZC5wb3c/IFwicG93ZXJWYXJpYWJsZVwiOnNvbHZlZC52YXJpYWJsZT8gXCJ2YXJpYWJsZVwiOiBcIm51bWJlclwiLFxuICAgICAgICB2YWx1ZTogc29sdmVkLnZhbHVlLCBcbiAgICAgICAgdmFyaWFibGU6IHNvbHZlZC52YXJpYWJsZT9zb2x2ZWQudmFyaWFibGU6XCJcIixcbiAgICAgICAgcG93OiBzb2x2ZWQucG93P3NvbHZlZC5wb3c6XCJcIixcbiAgICB9O1xufVxuXG5cblxuXG5cbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIHtcbiAgICBmdW5jdGlvbiBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiwgZW5kLCB0b2tlbnMsIHJlZ2V4KSB7XG4gICAgICAgIHdoaWxlIChiZWdpbiA8IGVuZCAmJiBiZWdpbiA8IHRva2Vucy50b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgaW5kZXg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChyZWdleCkge1xuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIpO1xuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIC0xO1xuICAgIFxuICAgICAgICAgICAgaW5kZXggKz0gYmVnaW47XG4gICAgXG4gICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vucy50b2tlbnNbaW5kZXggKyAxXS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBiZWdpbiA9IGluZGV4ICsgMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgbGV0IGJlZ2luID0gMCwgZW5kID0gdG9rZW5zLnRva2Vucy5sZW5ndGgsaj0wO1xuICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXG4gICAgbGV0IGNoZWNrZWRJRHMgPSBbXTsgIFxuICAgIGxldCBvcGVyYXRvckZvdW5kID0gZmFsc2U7XG4gICAgd2hpbGUgKCFvcGVyYXRvckZvdW5kJiZqPDIwMCkge1xuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMudG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBqKys7XG4gICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zLnRva2Vuc1tpXS5pZCkpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50SUQgPSB0b2tlbnMuZmluZFBhcmVuSW5kZXgodG9rZW5zLnRva2Vuc1tpXS5pZCk7ICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjdXJyZW50SUQhPT1udWxsJiZpPT09Y3VycmVudElELmNsb3NlKSB7XG4gICAgICAgICAgICAgICAgW2JlZ2luLGVuZF09W2N1cnJlbnRJRC5vcGVuLGN1cnJlbnRJRC5jbG9zZV1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcbiAgICAgICAgICAgIGJlZ2luID0gMDtcbiAgICAgICAgICAgIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgb3BlcmF0b3JGb3VuZCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLGVuZCx0b2tlbnMpIT09LTE7XG5cbiAgICAgICAgLy8gSWYgbm8gb3BlcmF0b3IgaXMgZm91bmQsIG1hcmsgdGhpcyBwYXJlbnRoZXNlcyBwYWlyIGFzIGNoZWNrZWRcbiAgICAgICAgaWYgKCFvcGVyYXRvckZvdW5kKSB7XG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxuICAgICAgICAgICAgY3VycmVudElEID0gbnVsbDsgIFxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChqPj0yMDApe3Rocm93IG5ldyBFcnJvcihcIm9wZXJhdGlvbnNPcmRlciBGYWlsZWQgZXhjZWVkZWQgMjAwIHJldmlzaW9uc1wiKTt9XG4gICAgLy8gRmluZCBpbmRpY2VzIGJhc2VkIG9uIG9wZXJhdG9yIHByZWNlZGVuY2VcbiAgICBsZXQgcHJpb3JpdHkxID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLC8oXFxefHNxcnQpLyk7XG4gICAgbGV0IHByaW9yaXR5MiA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLyhmcmFjfGJpbm9tfHNpbnxjb3N8dGFufGFzaW58YWNvc3xhdGFuKS8pO1xuICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oXFwqfFxcLykvKTtcbiAgICBsZXQgcHJpb3JpdHk0ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvWystXS8pO1xuICAgIGxldCBwcmlvcml0eTUgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC89Lyk7XG4gICAgXG4gICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NV0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xuICAgIFxufVxuXG5mdW5jdGlvbiBhcHBseVBvc2l0aW9uKHRva2VucywgaW5kZXgsIGRpcmVjdGlvbikge1xuICAgIGxldCBicmVha0NoYXIgPSBpbmRleDtcbiAgICBsZXQgdGFyZ2V0O1xuXG4gICAgY29uc3QgaXNMZWZ0ID0gZGlyZWN0aW9uID09PSBcImxlZnRcIjtcbiAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcbiAgICBpZiAoKGlzTGVmdCAmJiBpbmRleCA8PSAwKSB8fCAoIWlzTGVmdCAmJiBpbmRleCA+PSB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHx8ICF0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImF0IGFwcGx5UG9zaXRpb246IFxcXCJpbmRleCB3YXNuJ3QgdmFsaWRcXFwiXCIpO1xuICAgIH1cblxuICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIikge1xuICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xuICAgICAgICBicmVha0NoYXIgPSAgaXNMZWZ0ID8gcGFyZW5JbmRleC5vcGVuIDogcGFyZW5JbmRleC5jbG9zZTtcbiAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vucy5zbGljZShpc0xlZnQgPyBicmVha0NoYXIgOiBpbmRleCArIDEsIGlzTGVmdCA/IGluZGV4IDogYnJlYWtDaGFyKS5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXTtcbiAgICB9XG4gICAgY29uc3QgbXVsdGlTdGVwID0gTWF0aC5hYnMoYnJlYWtDaGFyIC0gaW5kZXgpID49IDQ7XG4gICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGF0IGFwcGx5UG9zaXRpb246IGNvdWxkbid0IGZpbmQgdGFyZ2V0IHRva2VuIGZvciBkaXJlY3Rpb24gJHtkaXJlY3Rpb259IGFuZCBvcGVyYXRvclwiJHt0b2tlbnMudG9rZW5zW2luZGV4XS52YWx1ZX1cImAsKTtcbiAgICB9XG4gICAgYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XG4gICAgZGVsZXRlIHRhcmdldC5pbmRleFxuICAgIHJldHVybiB7XG4gICAgICAgIC4uLnRhcmdldCxcbiAgICAgICAgbXVsdGlTdGVwOiBtdWx0aVN0ZXAsXG4gICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyXG4gICAgfTtcbn1cblxuXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xuICAgIG9wZXJhdG9yO1xuICAgIGluZGV4O1xuICAgIHRyYW5zaXRpb247XG4gICAgc3BlY2lhbENoYXI7XG4gICAgbGVmdD0gbnVsbDtcbiAgICByaWdodD0gbnVsbDtcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnMsIGluZGV4KXtcbiAgICAgICAgdGhpcy5pbmRleD1pbmRleDtcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5pbmRleFxuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcbiAgICB9XG4gICAgcG9zaXRpb24odG9rZW5zKSB7XG4gICAgICAgIHRoaXMuaW5kZXggPSB0aGlzLmluZGV4ID09PSBudWxsID8gb3BlcmF0aW9uc09yZGVyKHRva2VucykgOiB0aGlzLmluZGV4O1xuICAgICAgICBpZiAodGhpcy5pbmRleCA9PT0gbnVsbCB8fCB0aGlzLmluZGV4ID09PSB0b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vcGVyYXRvciA9IHRva2Vucy50b2tlbnNbdGhpcy5pbmRleF0udmFsdWU7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLmJvdGguaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJsZWZ0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLnJpZ2h0T25seS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB7YnJlYWtDaGFyOiB0aGlzLmluZGV4fTtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5kb3VibGVSaWdodC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMubGVmdC5icmVha0NoYXI7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnRyYW5zaXRpb24sXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0LmJyZWFrQ2hhciArPSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dGhpcy5vcGVyYXRvcn0gd2FzIG5vdCBhY2NvdW50ZWQgZm9yLCBvciBpcyBub3QgdGhlIHZhbGlkIG9wZXJhdG9yYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyIDogbnVsbDtcbiAgICB9XG4gICAgY2hlY2tNdWx0aVN0ZXAoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXB8fHRoaXMucmlnaHQubXVsdGlTdGVwXG4gICAgfVxuICAgIGNoZWNrRnJhYygpe1xuICAgICAgICByZXR1cm4gLyhmcmFjfFxcLykvLnRlc3QodGhpcy5vcGVyYXRvcikmJiF0aGlzLmNoZWNrTXVsdGlTdGVwKCkmJnRoaXMubGVmdC50eXBlIT09dGhpcy5yaWdodC50eXBlO1xuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zKXtcbiAgICBpZiAodG9rZW5zLmxlbmd0aDw9MSl7cmV0dXJuIHRva2Vuc31cbiAgICBsZXQgaT0wLG5ld1Rva2Vucz1bXTtcbiAgICB3aGlsZSAoaTw9MTAwJiZ0b2tlbnMuc29tZSh0b2tlbiA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKSlcbiAgICB7XG4gICAgICAgIGkrKztcbiAgICAgICAgbGV0IGVxaW5kZXg9dG9rZW5zLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xuICAgICAgICBsZXQgT3BlcmF0aW9uSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbikgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgIGlmIChPcGVyYXRpb25JbmRleD09PS0xKXtyZXR1cm4gdG9rZW5zO31cbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XG5cbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuLCBpKSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtLnRva2VuLnR5cGU9PT1jdXJyZW50VG9rZW4udHlwZSkgXG4gICAgICAgIC5yZWR1Y2UoKHN1bSwgaXRlbSkgPT4ge1xuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gXCItXCIpID8gLTEgOiAxO1xuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxuICAgICAgICByZXR1cm4gc3VtICsgKGl0ZW0udG9rZW4udmFsdWUgKiBtdWx0aXBsaWVyKTtcbiAgICAgICAgfSwgMCk7IFxuICAgICAgICBcbiAgICAgICAgbmV3VG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXG4gICAgICAgICAgICB0b2tlbi50eXBlICE9PSB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgfHwgXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld1Rva2Vucztcbn1cblxuXG5cblxuZXhwb3J0IGNsYXNzIE1hdGhQcmFpc2Vye1xuICAgIGlucHV0PVwiXCI7XG4gICAgdG9rZW5zPVtdO1xuICAgIHNvbHV0aW9uPVwiXCI7XG4gICAgbWF0aEluZm89bmV3IE1hdGhJbmZvKCk7XG5cbiAgICBjb25zdHJ1Y3RvcihpbnB1dCl7XG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XG4gICAgICAgIHRoaXMucHJvY2Vzc0lucHV0KCk7XG4gICAgICAgIHRoaXMudG9rZW5zPW5ldyBUb2tlbnModGhpcy5pbnB1dCk7XG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiVG9rZW5zIGFmdGVyIHRva2VuaXplXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICB0aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcbiAgICAgICAgdGhpcy5zb2x1dGlvbj10aGlzLmNvbnRyb2xsZXIoKTtcbiAgICB9XG4gICAgYXN5bmMoKXtcblxuICAgIH1cbiAgICBjb250cm9sbGVyKCl7XG4gICAgICAgIHRoaXMudG9rZW5zLmNvbm5lY3ROZWFyYnlUb2tlbnMoKTtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoSW5mbyh0aGlzLnRva2VucylcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8odGhpcy50b2tlbnMudG9rZW5zLHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGgpXG4gICAgICAgIHRoaXMudG9rZW5zLmV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLnRva2VucyxudWxsKTtcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJQYXJzZWQgZXhwcmVzc2lvblwiLCBKU09OLnN0cmluZ2lmeShwb3NpdGlvbiwgbnVsbCwgMC4wMSkpO1xuICAgICAgICBcbiAgICAgICAgaWYgKHBvc2l0aW9uID09PSBudWxsJiZ0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjEpe1xuICAgICAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJwYXJzZSh0b2tlbnMpXCIscGFyc2UodGhpcy50b2tlbnMudG9rZW5zKSlcbiAgICAgICAgICAgIHJldHVybiBcInRoZSAqKioqXCJcbiAgICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocG9zaXRpb24uaW5kZXggPT09IG51bGwpe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocG9zaXRpb24uY2hlY2tGcmFjKCl8fHBvc2l0aW9uLmNoZWNrTXVsdGlTdGVwKCkpXG4gICAgICAgIHsgICBcbiAgICAgICAgICAgIGV4cGFuZEV4cHJlc3Npb24odGhpcy50b2tlbnMscG9zaXRpb24pO1xuICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbkluZm8odGhpcy50b2tlbnMucmVjb25zdHJ1Y3QodGhpcy50b2tlbnMpKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNvbHZlZCA9IHBhcnNlKHRoaXMudG9rZW5zLnRva2Vucyx0aGlzLm1hdGhJbmZvLCBwb3NpdGlvbik7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxuXG4gICAgICAgIGlmIChzb2x2ZWQgPT09IG51bGwpIHtyZXR1cm4gbnVsbDsgfVxuICAgICAgICBpZiAodHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uLHNvbHZlZClcbiAgICAgICAgY29uc3QgW2xlZnRCcmVhayxsZW5ndGhdID0gW3Bvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhci1wb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcl1cbiAgICAgICAgXG4gICAgICAgIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJuZXdUb2tlbnNcIix0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjE/dGhpcy5jb250cm9sbGVyKCk6dGhpcy5maW5hbFJldHVybigpO1xuICAgIH1cblxuICAgIGFkZERlYnVnSW5mbyhtZXMsdmFsdWUpe1xuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhtZXMsdmFsdWUpXG4gICAgfVxuICAgIHByb2Nlc3NJbnB1dCgpe1xuICAgICAgICB0aGlzLmlucHV0PXRoaXMuaW5wdXRcbiAgICAgICAgLnJlcGxhY2UoLyhcXHN8XFxcXGxlZnR8XFxcXHJpZ2h0KS9nLCBcIlwiKSBcbiAgICAgICAgLnJlcGxhY2UoL3svZywgXCIoXCIpIFxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcbiAgICAgICAgLnJlcGxhY2UoLyhcXFxcY2RvdHxjZG90KS9nLCBcIipcIilcbiAgICAgICAgLnJlcGxhY2UoL01hdGguL2csIFwiXFxcXFwiKVxuICAgICAgICAucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XG4gICAgfVxuICAgIGZpbmFsUmV0dXJuKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgfVxufVxuXG5cblxuXG5cblxuXG5cblxuXG5cbmNsYXNzIFRva2Vuc3tcbiAgICB0b2tlbnM9W107XG4gICAgY29uc3RydWN0b3IobWF0aCl7XG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5pemUobWF0aCk7XG4gICAgfVxuICAgIHRva2VuaXplKG1hdGgpe1xuICAgICAgICBsZXQgdG9rZW5zID0gW107XG4gICAgICAgIGxldCBicmFja2V0cyA9IDAsICBsZXZlbENvdW50ID0ge307XG4gICAgICAgIGxldCBqPTA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaisrO1xuICAgICAgICAgICAgaWYoaj41MDApe2JyZWFrO31cbiAgICAgICAgICAgIGxldCBudW1iZXI9MCwgIHN0YXJ0UG9zID0gaSx2YXJpPVwiXCI7XG5cbiAgICAgICAgICAgIGlmKC9bKFxcXFxdLy50ZXN0KG1hdGhbaV0pJiZpPjApe1xuICAgICAgICAgICAgICAgIGNvbnN0IGJlZm9yZVBhcmVudGhlc2VzPS8obnVtYmVyfHZhcmlhYmxlfHBvd1ZhcmlhYmxlKS8udGVzdCh0b2tlbnNbdG9rZW5zLmxlbmd0aC0xXS50eXBlKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IGxhc3RJbmRleCA9IHRva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uaWQpLmluZGV4T2YodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5pZCkgLSAxO1xuICAgICAgICAgICAgICAgIGNvbnN0IGJldHdlZW5QYXJlbnRoZXNlcz1tYXRoW2ktMV0gPT09IFwiKVwiJiYobGFzdEluZGV4PDB8fCEvKGZyYWN8Ymlub218KS8udGVzdCh0b2tlbnNbbGFzdEluZGV4XS52YWx1ZSkpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKCh0b2tlbnMubGVuZ3RoLTE+PTAmJmJlZm9yZVBhcmVudGhlc2VzKXx8KGJldHdlZW5QYXJlbnRoZXNlcykpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYobWF0aFtpLTFdPT09XCItXCIpe21hdGggPSBtYXRoLnNsaWNlKDAsIGkpKyBcIjFcIiArbWF0aC5zbGljZShpKX1cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBcIipcIiwgaW5kZXg6IHRva2Vucy5sZW5ndGg/dG9rZW5zLmxlbmd0aDowIH0pO1xuICAgICAgICAgICAgICAgICAgICBpZihtYXRoW2krMV09PT1cIi1cIil7bWF0aCA9IG1hdGguc2xpY2UoMCwgaSkrIFwiMVwiICttYXRoLnNsaWNlKGkpfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG1hdGhbaV0gPT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xuICAgICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcInBhcmVuXCIsIHZhbHVlOiBcIihcIiwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyBJRCwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XG4gICAgICAgICAgICAgICAgYnJhY2tldHMrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSBcIilcIikge1xuICAgICAgICAgICAgICAgIGJyYWNrZXRzLS07IFxuICAgICAgICAgICAgICAgIGlmIChicmFja2V0cyA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5tYXRjaGVkIGNsb3NpbmcgYnJhY2tldCBhdCBwb3NpdGlvblwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJwYXJlblwiLCB2YWx1ZTogXCIpXCIsIGlkOiBicmFja2V0cyArIFwiLlwiICsgKElEID49IDAgPyBJRCA6IDApLCBpbmRleDogdG9rZW5zLmxlbmd0aCB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoaSsxPG1hdGgubGVuZ3RoJiYvWzAtOUEtWmEtei5dLy50ZXN0KG1hdGhbaSsxXSkpXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBtYXRoID0gbWF0aC5zbGljZSgwLCBpKzEpICsgXCIqXCIgKyBtYXRoLnNsaWNlKGkrMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gXCJcXFxcXCIpIHtcbiAgICAgICAgICAgICAgICBpKz0xOyAgXG4gICAgICAgICAgICAgICAgbGV0IG9wZXJhdG9yID0gKG1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKy8pIHx8IFtcIlwiXSlbMF1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwib3BlcmF0b3JcIiwgdmFsdWU6IG9wZXJhdG9yLCBpbmRleDogdG9rZW5zLmxlbmd0aCB9KTtcbiAgICAgICAgICAgICAgICBpKz1vcGVyYXRvci5sZW5ndGg7XG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09IFwic3FydFwiICYmIG1hdGhbaV0gPT09IFwiW1wiICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHRlbXA9bWF0aC5zbGljZShpLGkrMSttYXRoLnNsaWNlKGkpLnNlYXJjaCgvW1xcXV0vKSk7XG4gICAgICAgICAgICAgICAgICAgIGkrPXRlbXAubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaS0tO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKShbYS16QS1aXT8pLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2gmJiFtYXRjaFsyXSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBudW1iZXI9bWF0Y2hbMF1cbiAgICAgICAgICAgICAgICBpKz1udW1iZXIubGVuZ3RoPjE/bnVtYmVyLmxlbmd0aC0xOjA7XG4gICAgICAgICAgICAgICAgaWYoL1srLV0vLnRlc3QobWF0aFtzdGFydFBvcy0xXSkpe251bWJlcj1tYXRoW3N0YXJ0UG9zLTFdK251bWJlcn1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWF0aFtpKzFdJiYvW2EtekEtWl0vLnRlc3QobWF0aFtpKzFdKSl7Y29udGludWU7fVxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJudW1iZXJcIiwgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKSwgaW5kZXg6IHRva2Vucy5sZW5ndGg/dG9rZW5zLmxlbmd0aDowIH0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspKFthLXpBLVpdPykvKTtcbiAgICAgICAgICAgIGlmICgvW2EtekEtWl0vLnRlc3QobWF0aFtpXSkpIHtcbiAgICAgICAgICAgICAgICB2YXJpPSAobWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pIHx8IFtcIlwiXSlbMF07XG4gICAgICAgICAgICAgICAgaWYgKHZhcmkmJnZhcmkubGVuZ3RoPT09MCl7dmFyaT1tYXRoLnNsaWNlKGksbWF0aC5sZW5ndGgpfVxuICAgICAgICAgICAgICAgIG51bWJlcj1tYXRoLnNsaWNlKGkrdmFyaS5sZW5ndGgsdmFyaS5sZW5ndGgraSttYXRoLnNsaWNlKGkrdmFyaS5sZW5ndGgpLnNlYXJjaCgvW14wLTldLykpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaSs9dmFyaS5sZW5ndGgrbnVtYmVyLmxlbmd0aC0xO1xuICAgICAgICAgICAgICAgIG51bWJlcj1zYWZlVG9OdW1iZXIobnVtYmVyLmxlbmd0aD4wP251bWJlcjoxKTtcbiAgICAgICAgICAgICAgICBpZiAoL1swLTldLy50ZXN0KG1hdGhbc3RhcnRQb3M+MD9zdGFydFBvcy0xOjBdKSYmdG9rZW5zKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVyPShtYXRoLnNsaWNlKDAsc3RhcnRQb3MpLm1hdGNoKC9bMC05Ll0rKD89W14wLTkuXSokKS8pfHwgW1wiXCJdKVswXTtcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVyPW1hdGhbc3RhcnRQb3MtbnVtYmVyLmxlbmd0aC0xXSYmbWF0aFtzdGFydFBvcy1udW1iZXIubGVuZ3RoLTFdPT09XCItXCI/XCItXCIrbnVtYmVyOm51bWJlcjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZigvWy1dLy50ZXN0KG1hdGhbc3RhcnRQb3MtMV0pKXtudW1iZXI9bWF0aFtzdGFydFBvcy0xXStudW1iZXJ9XG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goe3R5cGU6IFwidmFyaWFibGVcIix2YXJpYWJsZTogdmFyaS5yZXBsYWNlKFwiKFwiLFwie1wiKS5yZXBsYWNlKFwiKVwiLFwifVwiKSx2YWx1ZTogc2FmZVRvTnVtYmVyKG51bWJlciksIGluZGV4OiB0b2tlbnMubGVuZ3RofSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoL1sqL149XS8udGVzdChtYXRoW2ldKXx8KCEvW2EtekEtWjAtOV0vLnRlc3QobWF0aFtpKzFdKSYmL1srLV0vLnRlc3QobWF0aFtpXSkpKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm9wZXJhdG9yXCIsIHZhbHVlOiBtYXRoW2ldLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoL1srLVxcZF0vLnRlc3QobWF0aFtpXSkpe2NvbnRpbnVlO31cbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYnJhY2tldHMhPT0wKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgKFwiVW5tYXRjaGVkIG9wZW5pbmcgYnJhY2tldChzKVwiKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0b2tlbnNcbiAgICB9XG5cbiAgICBjb25uZWN0TmVhcmJ5VG9rZW5zKCl7XG4gICAgICAgIGxldCBpPTAsbW9yZUNvbm5lY3RlZFRva2Vucz10cnVlO1xuICAgICAgICB3aGlsZSAoaSA8IDEwMCAmJiBtb3JlQ29ubmVjdGVkVG9rZW5zKSB7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuZmluZFNpbWlsYXJTdWNjZXNzb3IodGhpcy50b2tlbnMpXG4gICAgICAgICAgICBpZiAoaW5kZXggPj0wKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXhdLnZhbHVlKz10aGlzLnRva2Vuc1tpbmRleCsxXS52YWx1ZVxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCArIDEsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IG9wZW5QYXJlbkluZGV4PS0xLGNsb3NlUGFyZW5JbmRleD0tMSxjaGVja3RQYXJlbj0tMTtcbiAgICBcbiAgICAgICAgICAgIHdoaWxlIChpPDEwMCkge1xuICAgICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgICAgICBvcGVuUGFyZW5JbmRleCA9IGZpbmRPcGVuZFBhcmVuSW5kZXgodGhpcy50b2tlbnMsY2hlY2t0UGFyZW4pXG4gICAgICAgICAgICAgICAgY2xvc2VQYXJlbkluZGV4ID0gb3BlblBhcmVuSW5kZXggPT09IC0xPy0xOmZpbmRDbG9zZWRQYXJlbkluZGV4KHRoaXMudG9rZW5zLG9wZW5QYXJlbkluZGV4KVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChvcGVuUGFyZW5JbmRleD09PS0xfHxjbG9zZVBhcmVuSW5kZXghPT0tMSl7YnJlYWs7fVxuICAgICAgICAgICAgICAgIGNoZWNrdFBhcmVuPW9wZW5QYXJlbkluZGV4O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNsb3NlUGFyZW5JbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PlxuICAgICAgICAgICAgICAgICAgICBpZHggIT09IG9wZW5QYXJlbkluZGV4ICYmIGlkeCAhPT0gY2xvc2VQYXJlbkluZGV4XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEgJiYgY2xvc2VQYXJlbkluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMucmVJRHBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxuICAgIH1cbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xuICAgICAgICBpZiAoXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dWYXJpYWJsZSkvLnRlc3QodG9rZW4udHlwZSkpIFxuICAgICAgICAgICAgJiYgIXRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKVxuICAgICAgICApXG4gICAgICAgIHtyZXR1cm4gSW5maW5pdHl9XG4gICAgfVxuICAgIGluc2VydFRva2VucyhzdGFydCwgbGVuZ3RoLCBvYmplY3RzKSB7XG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzKSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XG4gICAgfVxuICAgIFxuICAgIHJlb3JkZXIoKXtcbiAgICAgICAgbGV0IG5ld1Rva2VucyA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgbmV3VG9rZW4gPSB7IC4uLnRoaXMudG9rZW5zW2ldLCBpbmRleDogaSB9O1xuICAgICAgICAgICAgbmV3VG9rZW5zLnB1c2gobmV3VG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9rZW5zPW5ld1Rva2VucztcbiAgICB9XG4gICAgcmVjb25zdHJ1Y3QodG9rZW5zKXtcbiAgICAgICAgaWYgKHRva2Vucz09PXVuZGVmaW5lZCl7XG4gICAgICAgICAgICB0b2tlbnM9dGhpcy50b2tlbnM7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IG1hdGggPSBcIlwiO1xuICAgICAgICBmb3IgKGxldCBpPTA7aTx0b2tlbnMubGVuZ3RoO2krKyl7XG4gICAgICAgICAgICBsZXQgdGVtcDtcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWU9PT1cIihcIiYmdG9rZW5zW3Rva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQmJnRva2Vuc1tpbmRleCsxXSkrMV0udmFsdWU9PT1cIi9cIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBtYXRoKz1cIlxcXFxmcmFjXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzd2l0Y2ggKHRva2Vuc1tpXS50eXBlKXtcbiAgICAgICAgICAgICAgICBjYXNlIFwibnVtYmVyXCI6XG4gICAgICAgICAgICAgICAgICAgIHRlbXA9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrcm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9dGVtcCsoaSsxPHRva2Vucy5sZW5ndGgmJi8oZnJhYykvLnRlc3QodG9rZW5zW2krMV0udmFsdWUpP1wiK1wiOlwiXCIpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIFwicGFyZW5cIjpcbiAgICAgICAgICAgICAgICAgICAgdGVtcD10b2tlbnNbdGhpcy5maW5kUGFyZW5JbmRleCh0b2tlbnNbaV0uaWQpLm9wZW4tMV1cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGVtcCAhPT0gXCJ1bmRlZmluZWRcIiAmJiBcbiAgICAgICAgICAgICAgICAgICAgICAgICgoY3VybHlCcmFja2V0c1JlZ2V4LnRlc3QodGVtcC52YWx1ZSkpIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgKC9cXCkvLnRlc3QodGVtcC52YWx1ZSkgJiYgY3VybHlCcmFja2V0c1JlZ2V4LnRlc3QodG9rZW5zW3RoaXMuZmluZFBhcmVuSW5kZXgodGVtcC5pZCkub3BlbiAtIDFdLnZhbHVlKSkpKSBcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWF0aCArPSB0b2tlbnNbaV0udmFsdWUucmVwbGFjZSgvXFwoLywgXCJ7XCIpLnJlcGxhY2UoL1xcKS8sIFwifVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGk+MCYmdG9rZW5zW2ldLnZhbHVlPT09XCIoXCImJnRva2Vuc1tpLTFdPy52YWx1ZT09PVwiKVwiKXttYXRoKz1cIitcIn1cbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9dG9rZW5zW2ldLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIFwib3BlcmF0b3JcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgIT09IFwiL1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoKz0odG9rZW5zW2ldLnZhbHVlKS5yZXBsYWNlKC8oW14qXj0vKy1dKS8sXCJcXFxcJDFcIikucmVwbGFjZSgvXFwqL2csXCJcXFxcY2RvdCBcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxuICAgICAgICAgICAgICAgICAgICBtYXRoKz0ocGx1c1N5bWJvbENoZWNrKHRva2VucyxpKT9cIitcIjpcIlwiKSsodG9rZW5zW2ldLnZhbHVlIT09MT90b2tlbnNbaV0udmFsdWU6XCJcIikrdG9rZW5zW2ldLnZhcmlhYmxlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIFwicG93ZXJWYXJpYWJsZVwiOlxuICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSkpXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpKyh0b2tlbnNbaV0udmFsdWUhPT0xP3Rva2Vuc1tpXS52YWx1ZTpcIlwiKSt0b2tlbnNbaV0udmFyaWFibGUrYF57JHt0b2tlbnNbaV0ucG93fX1gO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgdG9raW4gdHlwZSBnaXZlbiB0byByZWNvbnN0cnVjdDogdHlwZSAke3Rva2Vuc1tpXS50eXBlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRoXG4gICAgfVxuICAgIGZpbmRQYXJlbkluZGV4KGlkLGluZGV4KXtcbiAgICAgICAgdHJ5e1xuICAgICAgICAgICAgaWQ9aW5kZXg/dGhpcy50b2tlbnNbaW5kZXhdLmlkOmlkO1xuICAgICAgICAgICAgY29uc3Qgb3Blbj10aGlzLnRva2Vucy5maW5kSW5kZXgoXG4gICAgICAgICAgICAgICAgdG9rZW49PnRva2VuLnZhbHVlPT09XCIoXCJcbiAgICAgICAgICAgICAgICAmJnRva2VuLmlkPT09aWRcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlPXRoaXMudG9rZW5zLmZpbmRMYXN0SW5kZXgoXG4gICAgICAgICAgICAgICAgdG9rZW49PnRva2VuLnZhbHVlPT09XCIpXCJcbiAgICAgICAgICAgICAgICAmJnRva2VuLmlkPT09aWRcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIHJldHVybntvcGVuOiBvcGVuLGNsb3NlOiBjbG9zZSxpZDppZH1cbiAgICAgICAgfVxuICAgICAgICBjYXRjaChlKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRva2VuQ29tcGFyZShjb21wYXJlLCB2YWx1ZSwgdG9rZW4sIG5leHRUb2tlbikge1xuICAgICAgICB2YWx1ZSA9IHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxuICAgICAgICApO1xuICAgIH1cbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xuICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXG4gICAgICAgICkpO1xuICAgIH1cblxuICAgIHZhbHVlVG9rZW5zKCl7XG4gICAgICAgIHJldHVybiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS9cbiAgICB9XG4gICAgcmVJRHBhcmVudGhlc2VzKCkge1xuICAgICAgICBsZXQgdG9rZW5zPXRoaXMudG9rZW5zXG4gICAgICAgIGxldCBicmFja2V0cyA9IDAsIGxldmVsQ291bnQgPSB7fTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xuICAgICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XG4gICAgICAgICAgICAgICAgLy8gUmVhc3NpZ24gdGhlIG9iamVjdCB3aXRoIHRoZSBuZXcgaWQgdG8gZW5zdXJlIHBlcnNpc3RlbmNlXG4gICAgICAgICAgICAgICAgdG9rZW5zW2ldID0geyAuLi50b2tlbnNbaV0sIGlkOiBicmFja2V0cyArIFwiLlwiICsgSUQgfTtcbiAgICAgICAgICAgICAgICBicmFja2V0cysrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIpXCIpIHtcbiAgICAgICAgICAgICAgICBicmFja2V0cy0tO1xuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdIC0gMTtcbiAgICAgICAgICAgICAgICAvLyBSZWFzc2lnbiB0aGUgb2JqZWN0IHdpdGggdGhlIG5ldyBpZCB0byBlbnN1cmUgcGVyc2lzdGVuY2VcbiAgICAgICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyAoSUQgPj0gMCA/IElEIDogMCkgfTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnM7XG4gICAgICAgIHRoaXMucmVvcmRlcigpO1xuICAgIH1cbn1cblxuY29uc3QgcGx1c1N5bWJvbENoZWNrID0gKHRva2VucywgaW5kZXgpID0+IHtcbiAgICBpZiAoIWluZGV4ID4gMCkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0b2tlbnNbaW5kZXhdLnZhbHVlID49IDAgJiYgLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udHlwZSk7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycikge1xuICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICBcbiAgICBhcnIuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaXRlbSkpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQoZmxhdHRlbkFycmF5KGl0ZW0pKTsgIC8vIFJlY3Vyc2l2ZWx5IGZsYXR0ZW4gbmVzdGVkIGFycmF5c1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goaXRlbSk7ICAvLyBBZGQgbm9uLWFycmF5IGl0ZW1zIHRvIHJlc3VsdFxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKmV4cG9ydCBmdW5jdGlvbiBmbGF0dGVuQXJyYXkoYXJyKSB7XG4gICAgbGV0IHJlc3VsdCA9IFtdO1xuICAgIGxldCBzdGFjayA9IEFycmF5LmlzQXJyYXkoYXJyKSA/IFsuLi5hcnJdIDogW2Fycl07ICAvLyBFbnN1cmUgYXJyIGlzIGFuIGFycmF5IG9yIHdyYXAgaXQgaW4gb25lXG5cbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IG5leHQgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobmV4dCkpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7ICAvLyBTcHJlYWQgdGhlIGFycmF5IGl0ZW1zIHRvIHRoZSBzdGFja1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2gobmV4dCk7ICAvLyBBZGQgbm9uLWFycmF5IGl0ZW1zIHRvIHRoZSByZXN1bHRcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpOyAgLy8gUmV2ZXJzZSB0byBtYWludGFpbiBvcmlnaW5hbCBvcmRlclxufSovIl19