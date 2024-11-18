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
        // Rule 1: Handle case where both sides have variables with different bases
        if (left.variable && right.variable && left.variable !== right.variable) {
            // Keep them separate since they have different variables
            solved.terms = [
                { variable: left.variable, pow: left.pow || 1, value: left.value || 1 },
                { variable: right.variable, pow: right.pow || 1, value: right.value || 1 }
            ];
            throw new Error("Different variable bases at power multiplication. I didn't get there yet");
            return;
        }
        // Rule 2: If both have the same base, combine their powers
        const variable = left.variable || right.variable;
        solved.variable = variable;
        // Combine powers
        const pow = (left.pow || 0) + (right.pow || 0);
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
    // If it is multi step, it needs to be expanded first Therefore, don't do it on multi step
    checkFrac() {
        return /(frac|\/)/.test(this.operator) && !this.checkMultiStep(); //Why did it put this here&&this.left.type!==this.right.type;
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
        this.addDebugInfo(this.tokens.tokens, this.tokens.tokens.length);
        this.tokens.expressionVariableValidity();
    }
    controller() {
        this.getRedyforNewRond();
        const position = new Position(this.tokens, null);
        this.addDebugInfo("Parsed expression", JSON.stringify(position, null, 0.01));
        //console.log(this.tokens.tokens,position,this.tokens.reconstruct())
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
            //console.log(this.tokens.tokens,position)
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
        console.log(this.tokens);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUduRSxNQUFNLGNBQWMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FDL0MsQ0FBQyxLQUFLLEtBQUcsSUFBSSxJQUFFLEtBQUssQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUUsRUFBRSxDQUFDO0FBS3JFLE1BQU0sbUJBQW1CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsV0FBVyxFQUFDLEVBQUUsQ0FBQSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQzlFLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxJQUFJLEtBQUssR0FBRyxXQUFXO0lBQzFDLENBQUMsS0FBSyxLQUFLLENBQUM7UUFDWixDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDdEksQ0FBQztBQUVGLE1BQU0sb0JBQW9CLEdBQUMsQ0FBQyxNQUFNLEVBQUMsY0FBYyxFQUFD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LENBQUMsQ0FBQyxDQUFBO0lBQUEsQ0FBQztJQUNqRCxJQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDO1FBQUEsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUE7SUFBQSxDQUFDO0lBQzlFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDbEMsSUFBSSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzNELEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUMvQyxDQUFDLEVBQUUsQ0FBQztRQUNSLENBQUM7SUFDTCxDQUFDO0lBQ0QsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzFCLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUNyRCxDQUFDO0FBSUQsU0FBUyxLQUFLLENBQUMsTUFBTSxFQUFDLFFBQVEsRUFBQyxRQUFRO0lBQ25DLE1BQU0sRUFBRSxRQUFRLEVBQUMsV0FBVyxFQUFFLElBQUksRUFBQyxLQUFLLEVBQUMsR0FBRyxRQUFRLENBQUM7SUFDckQsSUFBSSxPQUFPLFFBQVEsS0FBRyxRQUFRLElBQUUsT0FBTyxLQUFLLENBQUMs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TSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFBLE1BQU0sQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxHQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsUUFBUSxHQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUMsSUFBRSxNQUFNLEVBQ3ZELENBQUM7b0JBQ0csTUFBTSxHQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLHNCQUFzQixDQUFDLElBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN4RSxNQUFNLEdBQUMsSUFBSSxDQUFDLFFBQVEsR0FBQyxNQUFNLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQyxJQUFFLElBQUksQ0FBQyxRQUFRLEdBQUMsTUFBTSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsS0FBRyxHQUFHLENBQUEsQ0FBQyxDQUFBLEdBQUcsR0FBQyxNQUFNLENBQUEsQ0FBQyxDQUFBLE1BQU0sQ0FBQztnQkFDbEcsQ0FBQztxQkFDSSxJQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUM7b0JBQUEsTUFBTSxHQUFDLElBQUksQ0FBQyxRQUFRLEdBQUMsQ0FBQyxDQUFDLEdBQUMsTUFBTSxDQUFBO2dCQUFBLENBQUM7Z0JBQ3JFLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFDLEdBQUcsQ0FBQyxFQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEVBQUMsQ0FB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QUFLLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3RHLENBQUMsQ0FBQztBQUlGLE1BQU0sVUFBVSxZQUFZLENBQUMsR0FBRztJQUM1QixJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7SUFDaEIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUUsMkNBQTJDO0lBRS9GLE9BQU8sS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2xCLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN6QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN0QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBRSxzQ0FBc0M7UUFDaEUsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsb0NBQW9DO1FBQzVELENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBRSxxQ0FBcUM7QUFDbkUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlc30gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi9pbVZlcnlMYXp5XCI7XG5cblxuY29uc3QgdG9rZW5JRENvbXBhcmUgPSAodmFsdWUsIHRva2VuLCBuZXh0VG9rZW4pID0+IFxuICAgICh2YWx1ZT09PW51bGx8fHRva2VuLmlkID09PSB2YWx1ZSkgJiYgdG9rZW4uaWQgPT09IG5leHRUb2tlbj8uaWQ7XG5cblxuXG5cbmNvbnN0IGZpbmRPcGVuZFBhcmVuSW5kZXg9KHRva2VucyxjaGVja3RQYXJlbik9PnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cbiAgICB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgJiYgaW5kZXggPiBjaGVja3RQYXJlbiAmJlxuICAgIChpbmRleCA9PT0gMCB8fCBcbiAgICAoaW5kZXggLSAxID49IDAgJiYgdG9rZW5zW2luZGV4IC0gMV0gJiYgKCEvKG9wZXJhdG9yfHBhcmVuKS8udGVzdCh0b2tlbnNbaW5kZXggLSAxXS50eXBlKSB8fCAvWz1dLy50ZXN0KHRva2Vuc1tpbmRleCAtIDFdLnZhbHVlKSkpKVxuKTtcblxuY29uc3QgZmluZENsb3NlZFBhcmVuSW5kZXg9KHRva2VucyxvcGVuUGFyZW5JbmRleCk9PnRva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XG4gICAgdG9rZW5JRENvbXBhcmUoXCIpXCIsdG9rZW4sdG9rZW5zW29wZW5QYXJlbkluZGV4XSkgJiZcbiAgICAoKHRva2Vucy5sZW5ndGgtMT5pbmRleCAgJiYodG9rZW5zW2luZGV4ICsgMV0udHlwZSAhPT0gXCJvcGVyYXRvclwifHwvWz1dLy50ZXN0KHRva2Vuc1tpbmRleCArIDFdLnZhbHVlKSl8fCB0b2tlbnMubGVuZ3RoLTE9PT1pbmRleClcbikpO1xuXG5jb25zdCBvcGVyYXRvcnNGb3JNYXRoaW5mbyA9IHtcbiAgICBib3RoQnV0UmlnaHRCcmFja2V0OiBbXCJeXCJdLFxuICAgIHJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2g6IFtcInNxcnRcIl0sXG4gICAgYm90aDogW1wiK1wiLCBcIi1cIiwgXCIqXCJdLFxuICAgIHNwZWNpYWw6IFtcIj1cIl0sXG4gICAgUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2g6IFtcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcbiAgICBkb3VibGVSaWdodEJ1dEJyYWNrZXQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiLFwiL1wiXVxufTtcbmNvbnN0IG9wZXJhdG9yU2lkZXMgPSB7XG4gICAgYm90aDogW1wiXlwiLCBcIitcIiwgXCItXCIsIFwiKlwiLCBcIi9cIiwgXCI9XCJdLFxuICAgIHJpZ2h0T25seTogW1wic3FydFwiLCBcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcbiAgICBkb3VibGVSaWdodDogW1wiZnJhY1wiLCBcImJpbm9tXCJdXG59O1xuXG5leHBvcnQgY2xhc3MgTWF0aEluZm97XG4gICAgZGVidWdJbmZvPVwiXCI7XG4gICAgc29sdXRpb25JbmZvPVtdO1xuICAgIG1hdGhJbmZvPVtdXG4gICAgZ3JhcGg9XCJcIjtcbiAgICBhZGRHcmFwaEluZm8odmFsdWUpe1xuICAgICAgICB0aGlzLmdyYXBoKz12YWx1ZTtcbiAgICB9XG4gICAgYWRkRGVidWdJbmZvKG1zZywgdmFsdWUpe1xuICAgICAgICB0aGlzLmRlYnVnSW5mbys9KHR5cGVvZiBtc2c9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KG1zZyk6bXNnKStcIiA6IFwiKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlKTp2YWx1ZSkrIFwiXFxuIFwiO1xuICAgIH1cbiAgICBhZGRTb2x1dGlvbkluZm8obWVzKXtcbiAgICAgICAgdGhpcy5zb2x1dGlvbkluZm8ucHVzaChtZXMpO1xuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlNvbHZlZFwiLG1lcyk7XG4gICAgfVxuICAgIGFkZE1hdGhJbmZvKHRva2Vucyl7XG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgICAgIHRoaXMubWF0aEluZm8ucHVzaChyZWNvbnN0cnVjdGVkTWF0aClcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJSZWNvbnN0cnVjdGVkIG1hdGhcIixyZWNvbnN0cnVjdGVkTWF0aCk7XG4gICAgfVxuXG4gICAgYWRkU29sdXRpb24odG9rZW5zLHBvc2l0aW9uLHNvbHV0aW9uKXtcbiAgICAgICAgc29sdXRpb249dG9rZW5zLnJlY29uc3RydWN0KFtzb2x1dGlvbl0pO1xuICAgICAgICBjb25zdCBsZWZ0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLmluZGV4KSk7XG4gICAgICAgIGNvbnN0IHJpZ2h0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmluZGV4KzEscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLCkpO1xuXG4gICAgICAgIHN3aXRjaCAodHJ1ZSl7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGhCdXRSaWdodEJyYWNrZXQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGguaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoL1xcKi9nLCBcIlxcXFxjZG90XCIpfSAke3JpZ2h0fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5zcGVjaWFsLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSBgXFxcXGZyYWN7JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5yaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5SaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3J9ICgke3JpZ2h0fSkgPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uZG91YmxlUmlnaHRCdXRCcmFja2V0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKFwiL1wiLFwiZnJhY1wiKX17JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hZGRTb2x1dGlvbkluZm8oc29sdXRpb24pO1xuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBzYWZlVG9OdW1iZXIodmFsdWUpIHtcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XG4gICAgaWYgKHZhbHVlPT09XCIrXCIpe3JldHVybiAwfVxuICAgIGlmICh2YWx1ZT09PVwiLVwiKXtyZXR1cm4gLTF9XG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxuICAgIGlmKC9bKFtdLy50ZXN0KHZhbHVlWzBdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgxKX1cbiAgICBpZigvWylcXF1dLy50ZXN0KHZhbHVlW3ZhbHVlLmxlbmd0aC0xXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMCx2YWx1ZS5sZW5ndGgtMSl9XG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVtpXSA9PT0gXCJzdHJpbmdcIiAmJiAvWygpW1xcXV0vLnRlc3QodmFsdWVbaV0pKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsIGkpICsgdmFsdWUuc2xpY2UoaSArIDEpO1xuICAgICAgICAgICAgaS0tO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XG4gICAgcmV0dXJuIGlzTmFOKG51bSkgPyB2YWx1ZS5sZW5ndGg+MD92YWx1ZTowIDogbnVtO1xufVxuXG5cblxuZnVuY3Rpb24gcGFyc2UodG9rZW5zLG1hdGhJbmZvLHBvc2l0aW9uKSB7XG4gICAgY29uc3QgeyBvcGVyYXRvcixzcGVjaWFsQ2hhciwgbGVmdCxyaWdodH0gPSBwb3NpdGlvbjtcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIHJpZ2h0LnZhbHVlIT09XCJudW1iZXJcIiYmIS8oc3FydHxjb3N8c2lufHRhbikvLnRlc3Qob3BlcmF0b3IpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodC52YWx1ZSE9PVwibnVtYmVyXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmlnaHQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgYXJlVGhlcmVPcGVyYXRvcnM9dG9rZW5zLnNvbWUodG9rZW49Pi8ob3BlcmF0b3IpLy50ZXN0KHRva2VuLnR5cGUpJiYhLyg9KS8udGVzdCh0b2tlbi52YWx1ZSkpXG4gICAgXG4gICAgaWYgKCFhcmVUaGVyZU9wZXJhdG9ycylcbiAgICB7XG4gICAgICAgIHRva2Vucz1zaW1wbGlmaXkodG9rZW5zKVxuICAgICAgICBtYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzaW1wbGlmaXkodG9rZW5zKVwiLHRva2VucylcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcbiAgICAgICAgY29uc3QgW251bWJlckluZGV4LHZhcmlhYmxlSW5kZXgscG93SW5kZXhdID0gW2ZpbHRlckJ5VHlwZShcIm51bWJlclwiKSxmaWx0ZXJCeVR5cGUoXCJ2YXJpYWJsZVwiKSxmaWx0ZXJCeVR5cGUoXCJwb3dlclZhcmlhYmxlXCIpXVxuIFxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIHF1YWQoXG4gICAgICAgICAgICAgICAgcG93SW5kZXhbMF0gPyBwb3dJbmRleFswXS52YWx1ZSAgOiAwLFxuICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0gPyB2YXJpYWJsZUluZGV4WzBdLnZhbHVlIDogMCxcbiAgICAgICAgICAgICAgICBudW1iZXJJbmRleFswXSA/IG51bWJlckluZGV4WzBdLnZhbHVlICogLTE6IDAsXG4gICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFyaWFibGUsXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MCYmdmFyaWFibGVJbmRleC5sZW5ndGghPT0wJiZudW1iZXJJbmRleCE9PTApXG4gICAgICAgIHtcbiAgICAgICAgICAgIG1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyhgJHt2YXJpYWJsZUluZGV4WzBdLnZhcmlhYmxlfSA9IFxcXFxmcmFjeyR7bnVtYmVySW5kZXhbMF0udmFsdWV9fXske3ZhcmlhYmxlSW5kZXhbMF0udmFsdWV9fSA9ICR7KG51bWJlckluZGV4WzBdLnZhbHVlKS8odmFyaWFibGVJbmRleFswXS52YWx1ZSl9YClcbiAgICAgICAgICAgIHJldHVybiBgJHt2YXJpYWJsZUluZGV4WzBdLnZhcmlhYmxlfSA9ICR7KG51bWJlckluZGV4WzBdLnZhbHVlKS8odmFyaWFibGVJbmRleFswXS52YWx1ZSl9YFxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYodG9rZW5zLmxlbmd0aD09PTEmJm51bWJlckluZGV4KXtcbiAgICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShudW1iZXJJbmRleC52YWx1ZT09PTApXG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgbGV0IHNvbHZlZD17dmFsdWU6IDAsdmFyaWFibGU6IFwiXCIscG93OiBcIlwifTtcbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgXCJzcXJ0XCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiXlwiOlxuICAgICAgICAgICAgaWYgKGxlZnQudmFyaWFibGV8fHJpZ2h0LnZhcmlhYmxlKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfHxsZWZ0LnZhcmlhYmxlPT09cmlnaHQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZT9yaWdodC52YXJpYWJsZTpcIlwiO1xuICAgICAgICAgICAgICAgIHNvbHZlZC5wb3c9MlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cobGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImZyYWNcIjpcbiAgICAgICAgY2FzZSBcIi9cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChsZWZ0LnZhbHVlKS8ocmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCIqXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICogcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBoYW5kbGVWcmlhYmxlcyhsZWZ0LCByaWdodCxzb2x2ZWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCIrXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICsgcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCItXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlIC0gcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlQmlub20obGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInNpblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJjb3NcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguY29zKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJ0YW5cIjpcbiAgICAgICAgICAgIGlmIChyaWdodD49OTApe3Rocm93IG5ldyBFcnJvcihcInRhbiBNdXN0IGJlIHNtYWxsZXIgdGhhbiA5MFwiKTt9XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC50YW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYXNpblwiOlxuICAgICAgICBjYXNlIFwiYXJjc2luXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXNpbihyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhY29zXCI6XG4gICAgICAgIGNhc2UgXCJhcmNjb3NcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hY29zKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImF0YW5cIjpcbiAgICAgICAgY2FzZSBcImFyY3RhblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4ocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdCwgcmlnaHQsIHNvbHZlZCkge1xuICAgICAgICAvLyBSdWxlIDE6IEhhbmRsZSBjYXNlIHdoZXJlIGJvdGggc2lkZXMgaGF2ZSB2YXJpYWJsZXMgd2l0aCBkaWZmZXJlbnQgYmFzZXNcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcbiAgICAgICAgICAgIC8vIEtlZXAgdGhlbSBzZXBhcmF0ZSBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZhcmlhYmxlc1xuICAgICAgICAgICAgc29sdmVkLnRlcm1zID0gW1xuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IHJpZ2h0LnZhcmlhYmxlLCBwb3c6IHJpZ2h0LnBvdyB8fCAxLCB2YWx1ZTogcmlnaHQudmFsdWUgfHwgMSB9XG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlmZmVyZW50IHZhcmlhYmxlIGJhc2VzIGF0IHBvd2VyIG11bHRpcGxpY2F0aW9uLiBJIGRpZG4ndCBnZXQgdGhlcmUgeWV0XCIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgLy8gUnVsZSAyOiBJZiBib3RoIGhhdmUgdGhlIHNhbWUgYmFzZSwgY29tYmluZSB0aGVpciBwb3dlcnNcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICBzb2x2ZWQudmFyaWFibGUgPSB2YXJpYWJsZTtcbiAgICBcbiAgICAgICAgLy8gQ29tYmluZSBwb3dlcnNcbiAgICAgICAgY29uc3QgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcbiAgICAgICAgc29sdmVkLnBvdyA9IHBvdyB8fCB1bmRlZmluZWQ7XG4gICAgXG4gICAgICAgIC8vIFJ1bGUgMzogSGFuZGxlIG11bHRpcGxpY2F0aW9uIG9mIGNvbnN0YW50c1xuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XG4gICAgICAgIGNvbnN0IHJpZ2h0VmFsdWUgPSByaWdodC52YWx1ZSB8fCAxO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGxlZnRWYWx1ZSAqIHJpZ2h0VmFsdWU7XG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQscmlnaHQsc29sdmVkKXtcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgcmV0dXJuIDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cbiAgICAgICAgXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVHdvIHZhcmlhYmxlIGVxdWF0aW9ucyBhcmVuJ3QgYWNjZXB0ZWQgeWV0XCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XG4gICAgICAgIC8vc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyXG5cbiAgICAgICAgLypcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV9XG4gICAgICAgIGVsc2UgaWYgKCFsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlfVxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cbiAgICAgICAgKi9cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogc29sdmVkLnBvdz8gXCJwb3dlclZhcmlhYmxlXCI6c29sdmVkLnZhcmlhYmxlPyBcInZhcmlhYmxlXCI6IFwibnVtYmVyXCIsXG4gICAgICAgIHZhbHVlOiBzb2x2ZWQudmFsdWUsIFxuICAgICAgICB2YXJpYWJsZTogc29sdmVkLnZhcmlhYmxlP3NvbHZlZC52YXJpYWJsZTpcIlwiLFxuICAgICAgICBwb3c6IHNvbHZlZC5wb3c/c29sdmVkLnBvdzpcIlwiLFxuICAgIH07XG59XG5cblxuXG5cblxuZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2Vucykge1xuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLCBlbmQsIHRva2VucywgcmVnZXgpIHtcbiAgICAgICAgd2hpbGUgKGJlZ2luIDwgZW5kICYmIGJlZ2luIDwgdG9rZW5zLnRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxldCBpbmRleDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy50b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIik7XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm4gLTE7XG4gICAgXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcbiAgICBcbiAgICAgICAgICAgIGlmICghL1srLV0vLnRlc3QodG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBpbmRleCA8IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4IC0gMV0udHlwZSA9PT0gdG9rZW5zLnRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJlZ2luID0gaW5kZXggKyAxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aCxqPTA7XG4gICAgbGV0IGN1cnJlbnRJRCA9IG51bGw7ICBcbiAgICBsZXQgY2hlY2tlZElEcyA9IFtdOyAgXG4gICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTtcbiAgICB3aGlsZSAoIW9wZXJhdG9yRm91bmQmJmo8MjAwKSB7XG4gICAgICAgIC8vIEZpbmQgdGhlIGlubmVybW9zdCBwYXJlbnRoZXNlc1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy50b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGorKztcbiAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2ldLnZhbHVlID09PSBcIihcIiAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnMudG9rZW5zW2ldLmlkKSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2ldLmlkKTsgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGN1cnJlbnRJRCE9PW51bGwmJmk9PT1jdXJyZW50SUQuY2xvc2UpIHtcbiAgICAgICAgICAgICAgICBbYmVnaW4sZW5kXT1bY3VycmVudElELm9wZW4sY3VycmVudElELmNsb3NlXVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAoIWN1cnJlbnRJRCkge1xuICAgICAgICAgICAgYmVnaW4gPSAwO1xuICAgICAgICAgICAgZW5kID0gdG9rZW5zLnRva2Vucy5sZW5ndGg7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBvcGVyYXRvckZvdW5kID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sZW5kLHRva2VucykhPT0tMTtcblxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxuICAgICAgICBpZiAoIW9wZXJhdG9yRm91bmQpIHtcbiAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQuaWQpOyAgXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGo+PTIwMCl7dGhyb3cgbmV3IEVycm9yKFwib3BlcmF0aW9uc09yZGVyIEZhaWxlZCBleGNlZWRlZCAyMDAgcmV2aXNpb25zXCIpO31cbiAgICAvLyBGaW5kIGluZGljZXMgYmFzZWQgb24gb3BlcmF0b3IgcHJlY2VkZW5jZVxuICAgIGxldCBwcmlvcml0eTEgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsLyhcXF58c3FydCkvKTtcbiAgICBsZXQgcHJpb3JpdHkyID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKGZyYWN8Ymlub218c2lufGNvc3x0YW58YXNpbnxhY29zfGF0YW4pLyk7XG4gICAgbGV0IHByaW9yaXR5MyA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLyhcXCp8XFwvKS8pO1xuICAgIGxldCBwcmlvcml0eTQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC9bKy1dLyk7XG4gICAgbGV0IHByaW9yaXR5NSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLz0vKTtcbiAgICBcbiAgICByZXR1cm4gW3ByaW9yaXR5MSwgcHJpb3JpdHkyLCBwcmlvcml0eTMsIHByaW9yaXR5NCwgcHJpb3JpdHk1XS5maW5kKGluZGV4ID0+IGluZGV4ICE9PSAtMSk/P251bGw7XG4gICAgXG59XG5cbmZ1bmN0aW9uIGFwcGx5UG9zaXRpb24odG9rZW5zLCBpbmRleCwgZGlyZWN0aW9uKSB7XG4gICAgbGV0IGJyZWFrQ2hhciA9IGluZGV4O1xuICAgIGxldCB0YXJnZXQ7XG5cbiAgICBjb25zdCBpc0xlZnQgPSBkaXJlY3Rpb24gPT09IFwibGVmdFwiO1xuICAgIGNvbnN0IGluZGV4TW9kaWZpZXIgPSAgaXNMZWZ0Py0gMSA6ICAxO1xuICAgIGlmICgoaXNMZWZ0ICYmIGluZGV4IDw9IDApIHx8ICghaXNMZWZ0ICYmIGluZGV4ID49IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkgfHwgIXRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYXQgYXBwbHlQb3NpdGlvbjogXFxcImluZGV4IHdhc24ndCB2YWxpZFxcXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKSB7XG4gICAgICAgIGNvbnN0IHBhcmVuSW5kZXggPSB0b2tlbnMuZmluZFBhcmVuSW5kZXgodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS5pZCk7XG4gICAgICAgIGJyZWFrQ2hhciA9ICBpc0xlZnQgPyBwYXJlbkluZGV4Lm9wZW4gOiBwYXJlbkluZGV4LmNsb3NlO1xuICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zLnNsaWNlKGlzTGVmdCA/IGJyZWFrQ2hhciA6IGluZGV4ICsgMSwgaXNMZWZ0ID8gaW5kZXggOiBicmVha0NoYXIpLmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdO1xuICAgIH1cblxuICAgIGNvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+PSA0O1xuXG4gICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGF0IGFwcGx5UG9zaXRpb246IGNvdWxkbid0IGZpbmQgdGFyZ2V0IHRva2VuIGZvciBkaXJlY3Rpb24gJHtkaXJlY3Rpb259IGFuZCBvcGVyYXRvclwiJHt0b2tlbnMudG9rZW5zW2luZGV4XS52YWx1ZX1cImAsKTtcbiAgICB9XG4gICAgYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XG4gICAgZGVsZXRlIHRhcmdldC5pbmRleFxuICAgIHJldHVybiB7XG4gICAgICAgIC4uLnRhcmdldCxcbiAgICAgICAgbXVsdGlTdGVwOiBtdWx0aVN0ZXAsXG4gICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyXG4gICAgfTtcbn1cblxuXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xuICAgIG9wZXJhdG9yO1xuICAgIGluZGV4O1xuICAgIHRyYW5zaXRpb247XG4gICAgc3BlY2lhbENoYXI7XG4gICAgbGVmdD0gbnVsbDtcbiAgICByaWdodD0gbnVsbDtcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnMsIGluZGV4KXtcbiAgICAgICAgdGhpcy5pbmRleD1pbmRleDtcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5pbmRleFxuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcbiAgICB9XG4gICAgcG9zaXRpb24odG9rZW5zKSB7XG4gICAgICAgIHRoaXMuaW5kZXggPSB0aGlzLmluZGV4ID09PSBudWxsID8gb3BlcmF0aW9uc09yZGVyKHRva2VucykgOiB0aGlzLmluZGV4O1xuICAgICAgICBpZiAodGhpcy5pbmRleCA9PT0gbnVsbCB8fCB0aGlzLmluZGV4ID09PSB0b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vcGVyYXRvciA9IHRva2Vucy50b2tlbnNbdGhpcy5pbmRleF0udmFsdWU7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLmJvdGguaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJsZWZ0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLnJpZ2h0T25seS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB7YnJlYWtDaGFyOiB0aGlzLmluZGV4fTtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JTaWRlcy5kb3VibGVSaWdodC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSBhcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMubGVmdC5icmVha0NoYXI7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IGFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnRyYW5zaXRpb24sXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0LmJyZWFrQ2hhciArPSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dGhpcy5vcGVyYXRvcn0gd2FzIG5vdCBhY2NvdW50ZWQgZm9yLCBvciBpcyBub3QgdGhlIHZhbGlkIG9wZXJhdG9yYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyIDogbnVsbDtcbiAgICB9XG4gICAgY2hlY2tNdWx0aVN0ZXAoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXB8fHRoaXMucmlnaHQubXVsdGlTdGVwXG4gICAgfVxuICAgIC8vIElmIGl0IGlzIG11bHRpIHN0ZXAsIGl0IG5lZWRzIHRvIGJlIGV4cGFuZGVkIGZpcnN0IFRoZXJlZm9yZSwgZG9uJ3QgZG8gaXQgb24gbXVsdGkgc3RlcFxuICAgIGNoZWNrRnJhYygpe1xuICAgICAgICByZXR1cm4gLyhmcmFjfFxcLykvLnRlc3QodGhpcy5vcGVyYXRvcikmJiF0aGlzLmNoZWNrTXVsdGlTdGVwKCkvL1doeSBkaWQgaXQgcHV0IHRoaXMgaGVyZSYmdGhpcy5sZWZ0LnR5cGUhPT10aGlzLnJpZ2h0LnR5cGU7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIHNpbXBsaWZpeSh0b2tlbnMpe1xuICAgIGlmICh0b2tlbnMubGVuZ3RoPD0xKXtyZXR1cm4gdG9rZW5zfVxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xuICAgIHdoaWxlIChpPD0xMDAmJnRva2Vucy5zb21lKHRva2VuID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxuICAgIHtcbiAgICAgICAgaSsrO1xuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIik7XG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuKSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxuICAgICAgICBsZXQgY3VycmVudFRva2VuPXt0eXBlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgLCB2YWx1ZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YWx1ZSx2YXJpYWJsZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YXJpYWJsZSAscG93OiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnBvd31cblxuICAgICAgICBsZXQgbnVtYmVyR3JvdXAgPSB0b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW4sIGkpID0+ICh7IHRva2VuLCBvcmlnaW5hbEluZGV4OiBpIH0pKSBcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcbiAgICAgICAgLnJlZHVjZSgoc3VtLCBpdGVtKSA9PiB7XG4gICAgICAgIGxldCBtdWx0aXBsaWVyPSh0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0gJiYgdG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdLnZhbHVlID09PSBcIi1cIikgPyAtMSA6IDE7XG4gICAgICAgIG11bHRpcGxpZXIgKj0gKGl0ZW0ub3JpZ2luYWxJbmRleCA8PSBlcWluZGV4KSA/IC0xIDogMTsgXG4gICAgICAgIGlmICghKC8obnVtYmVyKS8pLnRlc3QoaXRlbS50b2tlbi50eXBlKSl7bXVsdGlwbGllcio9LTF9XG4gICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xuICAgICAgICB9LCAwKTsgXG4gICAgICAgIFxuICAgICAgICBuZXdUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAuLi5jdXJyZW50VG9rZW4sXG4gICAgICAgICAgICB2YWx1ZTogbnVtYmVyR3JvdXBcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdG9rZW5zID0gdG9rZW5zLmZpbHRlcih0b2tlbiA9PiBcbiAgICAgICAgICAgIHRva2VuLnR5cGUgIT09IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSB8fCBcbiAgICAgICAgICAgICh0b2tlbi52YXJpYWJsZSAmJiB0b2tlbi52YXJpYWJsZSAhPT0gY3VycmVudFRva2VuLnZhcmlhYmxlKSB8fCBcbiAgICAgICAgICAgICh0b2tlbi5wb3cgJiYgdG9rZW4ucG93ICE9PSBjdXJyZW50VG9rZW4ucG93KVxuICAgICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gbmV3VG9rZW5zO1xufVxuXG5cblxuXG5leHBvcnQgY2xhc3MgTWF0aFByYWlzZXJ7XG4gICAgaW5wdXQ9XCJcIjtcbiAgICB0b2tlbnM9W107XG4gICAgc29sdXRpb249XCJcIjtcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcblxuICAgIGNvbnN0cnVjdG9yKGlucHV0KXtcbiAgICAgICAgdGhpcy5pbnB1dD1pbnB1dDtcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcbiAgICAgICAgdGhpcy50b2tlbnM9bmV3IFRva2Vucyh0aGlzLmlucHV0KTtcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJUb2tlbnMgYWZ0ZXIgdG9rZW5pemVcIix0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xuICAgIH1cbiAgICAvL1xcXFxmcmFjezEzMn17MTI2MCt4XnsyfX09MC4wNVxuICAgIC8vXFxcXGZyYWN7MTMyfXsxMjYwK3heezJ9fT0wLjA1XG4gICAgZ2V0UmVkeWZvck5ld1JvbmQoKXtcbiAgICAgICAgdGhpcy50b2tlbnMuY29ubmVjdE5lYXJieVRva2VucygpO1xuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZE1hdGhJbmZvKHRoaXMudG9rZW5zKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyh0aGlzLnRva2Vucy50b2tlbnMsdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aClcbiAgICAgICAgdGhpcy50b2tlbnMuZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKTtcbiAgICB9XG4gICAgY29udHJvbGxlcigpe1xuICAgICAgICB0aGlzLmdldFJlZHlmb3JOZXdSb25kKCk7XG4gICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMudG9rZW5zLG51bGwpO1xuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlBhcnNlZCBleHByZXNzaW9uXCIsIEpTT04uc3RyaW5naWZ5KHBvc2l0aW9uLCBudWxsLCAwLjAxKSk7XG5cbiAgICAgICAgLy9jb25zb2xlLmxvZyh0aGlzLnRva2Vucy50b2tlbnMscG9zaXRpb24sdGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKSlcblxuICAgICAgICBpZiAocG9zaXRpb24gPT09IG51bGwmJnRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MSl7XG4gICAgICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcInBhcnNlKHRva2VucylcIixwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMpKVxuICAgICAgICAgICAgcmV0dXJuIFwidGhlICoqKipcIlxuICAgICAgICAvLyByZXR1cm4gc29sdXRpb24odG9rZW5zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChwb3NpdGlvbi5pbmRleCA9PT0gbnVsbCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5maW5hbFJldHVybigpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWMoKXx8cG9zaXRpb24uY2hlY2tNdWx0aVN0ZXAoKSlcbiAgICAgICAge1xuICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XG4gICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyh0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCh0aGlzLnRva2VucykpXG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKHRoaXMudG9rZW5zLnRva2Vucyxwb3NpdGlvbilcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc29sdmVkID0gcGFyc2UodGhpcy50b2tlbnMudG9rZW5zLHRoaXMubWF0aEluZm8sIHBvc2l0aW9uKTtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzb2x2ZWRcIixzb2x2ZWQpXG5cbiAgICAgICAgaWYgKHNvbHZlZCA9PT0gbnVsbCkge3JldHVybiBudWxsOyB9XG4gICAgICAgIGlmICh0eXBlb2Ygc29sdmVkPT09XCJzdHJpbmdcIikge3JldHVybiBzb2x2ZWQ7IH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxuICAgICAgICBjb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxuICAgICAgICBcbiAgICAgICAgdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKGxlZnRCcmVhayxsZW5ndGgsc29sdmVkKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIm5ld1Rva2Vuc1wiLHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7XG4gICAgfVxuXG4gICAgYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSl7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSlcbiAgICB9XG4gICAgcHJvY2Vzc0lucHV0KCl7XG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy5pbnB1dFxuICAgICAgICAucmVwbGFjZSgvKFxcc3xcXFxcbGVmdHxcXFxccmlnaHQpL2csIFwiXCIpIFxuICAgICAgICAucmVwbGFjZSgvey9nLCBcIihcIikgXG4gICAgICAgIC5yZXBsYWNlKC99L2csIFwiKVwiKVxuICAgICAgICAucmVwbGFjZSgvKFxcXFxjZG90fGNkb3QpL2csIFwiKlwiKVxuICAgICAgICAucmVwbGFjZSgvTWF0aC4vZywgXCJcXFxcXCIpXG4gICAgICAgIC5yZXBsYWNlKC8oPzwhXFxcXHxbYS16QS1aXSkodGFufHNpbnxjb3N8Ymlub218ZnJhY3xhc2lufGFjb3N8YXRhbnxhcmNjb3N8YXJjc2lufGFyY3RhbnxjZG90KS9nLCBcIlxcXFwkMVwiKTtcbiAgICB9XG4gICAgZmluYWxSZXR1cm4oKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcbiAgICB9XG59XG5cblxuXG5cblxuXG5cblxuXG5cblxuY2xhc3MgVG9rZW5ze1xuICAgIHRva2Vucz1bXTtcbiAgICBjb25zdHJ1Y3RvcihtYXRoKXtcbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbml6ZShtYXRoKTtcbiAgICB9XG4gICAgdG9rZW5pemUobWF0aCl7XG4gICAgICAgIGxldCB0b2tlbnMgPSBbXTtcbiAgICAgICAgbGV0IGJyYWNrZXRzID0gMCwgIGxldmVsQ291bnQgPSB7fTtcbiAgICAgICAgbGV0IGo9MDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBqKys7XG4gICAgICAgICAgICBpZihqPjUwMCl7YnJlYWs7fVxuICAgICAgICAgICAgbGV0IG51bWJlcj0wLCAgc3RhcnRQb3MgPSBpLHZhcmk9XCJcIjtcblxuICAgICAgICAgICAgaWYoL1soXFxcXF0vLnRlc3QobWF0aFtpXSkmJmk+MCl7XG4gICAgICAgICAgICAgICAgY29uc3QgYmVmb3JlUGFyZW50aGVzZXM9LyhudW1iZXJ8dmFyaWFibGV8cG93VmFyaWFibGUpLy50ZXN0KHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLnR5cGUpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgbGFzdEluZGV4ID0gdG9rZW5zLm1hcCh0b2tlbiA9PiB0b2tlbi5pZCkuaW5kZXhPZih0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLmlkKSAtIDE7XG4gICAgICAgICAgICAgICAgY29uc3QgYmV0d2VlblBhcmVudGhlc2VzPW1hdGhbaS0xXSA9PT0gXCIpXCImJihsYXN0SW5kZXg8MHx8IS8oZnJhY3xiaW5vbXwpLy50ZXN0KHRva2Vuc1tsYXN0SW5kZXhdLnZhbHVlKSlcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoKHRva2Vucy5sZW5ndGgtMT49MCYmYmVmb3JlUGFyZW50aGVzZXMpfHwoYmV0d2VlblBhcmVudGhlc2VzKSkge1xuICAgICAgICAgICAgICAgICAgICBpZihtYXRoW2ktMV09PT1cIi1cIil7bWF0aCA9IG1hdGguc2xpY2UoMCwgaSkrIFwiMVwiICttYXRoLnNsaWNlKGkpfVxuICAgICAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwib3BlcmF0b3JcIiwgdmFsdWU6IFwiKlwiLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmKG1hdGhbaSsxXT09PVwiLVwiKXttYXRoID0gbWF0aC5zbGljZSgwLCBpKSsgXCIxXCIgK21hdGguc2xpY2UoaSl9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gXCIoXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWxldmVsQ291bnRbYnJhY2tldHNdKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldmVsQ291bnRbYnJhY2tldHNdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10rKztcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwicGFyZW5cIiwgdmFsdWU6IFwiKFwiLCBpZDogYnJhY2tldHMgKyBcIi5cIiArIElELCBpbmRleDogdG9rZW5zLmxlbmd0aCB9KTtcbiAgICAgICAgICAgICAgICBicmFja2V0cysrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG1hdGhbaV0gPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgYnJhY2tldHMtLTsgXG4gICAgICAgICAgICAgICAgaWYgKGJyYWNrZXRzIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbm1hdGNoZWQgY2xvc2luZyBicmFja2V0IGF0IHBvc2l0aW9uXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcInBhcmVuXCIsIHZhbHVlOiBcIilcIiwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyAoSUQgPj0gMCA/IElEIDogMCksIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChpKzE8bWF0aC5sZW5ndGgmJi9bMC05QS1aYS16Ll0vLnRlc3QobWF0aFtpKzFdKSlcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIGkrMSkgKyBcIipcIiArIG1hdGguc2xpY2UoaSsxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSBcIlxcXFxcIikge1xuICAgICAgICAgICAgICAgIGkrPTE7ICBcbiAgICAgICAgICAgICAgICBsZXQgb3BlcmF0b3IgPSAobWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rLykgfHwgW1wiXCJdKVswXVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJvcGVyYXRvclwiLCB2YWx1ZTogb3BlcmF0b3IsIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xuICAgICAgICAgICAgICAgIGkrPW9wZXJhdG9yLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS52YWx1ZSA9PT0gXCJzcXJ0XCIgJiYgbWF0aFtpXSA9PT0gXCJbXCIgJiYgaSA8IG1hdGgubGVuZ3RoIC0gMikge1xuICAgICAgICAgICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcbiAgICAgICAgICAgICAgICAgICAgaSs9dGVtcC5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0b2tlbnNbdG9rZW5zLmxlbmd0aC0xXSx7c3BlY2lhbENoYXI6IHNhZmVUb051bWJlcih0ZW1wKSx9KVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpLS07XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspKFthLXpBLVpdPykvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCYmIW1hdGNoWzJdKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG51bWJlcj1tYXRjaFswXVxuICAgICAgICAgICAgICAgIGkrPW51bWJlci5sZW5ndGg+MT9udW1iZXIubGVuZ3RoLTE6MDtcbiAgICAgICAgICAgICAgICBpZigvWystXS8udGVzdChtYXRoW3N0YXJ0UG9zLTFdKSl7bnVtYmVyPW1hdGhbc3RhcnRQb3MtMV0rbnVtYmVyfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYXRoW2krMV0mJi9bYS16QS1aXS8udGVzdChtYXRoW2krMV0pKXtjb250aW51ZTt9XG4gICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIm51bWJlclwiLCB2YWx1ZTogcGFyc2VGbG9hdChudW1iZXIpLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykoW2EtekEtWl0/KS8pO1xuICAgICAgICAgICAgaWYgKC9bYS16QS1aXS8udGVzdChtYXRoW2ldKSkge1xuICAgICAgICAgICAgICAgIHZhcmk9IChtYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLykgfHwgW1wiXCJdKVswXTtcbiAgICAgICAgICAgICAgICBpZiAodmFyaSYmdmFyaS5sZW5ndGg9PT0wKXt2YXJpPW1hdGguc2xpY2UoaSxtYXRoLmxlbmd0aCl9XG4gICAgICAgICAgICAgICAgbnVtYmVyPW1hdGguc2xpY2UoaSt2YXJpLmxlbmd0aCx2YXJpLmxlbmd0aCtpK21hdGguc2xpY2UoaSt2YXJpLmxlbmd0aCkuc2VhcmNoKC9bXjAtOV0vKSlcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpKz12YXJpLmxlbmd0aCtudW1iZXIubGVuZ3RoLTE7XG4gICAgICAgICAgICAgICAgbnVtYmVyPXNhZmVUb051bWJlcihudW1iZXIubGVuZ3RoPjA/bnVtYmVyOjEpO1xuICAgICAgICAgICAgICAgIGlmICgvWzAtOV0vLnRlc3QobWF0aFtzdGFydFBvcz4wP3N0YXJ0UG9zLTE6MF0pJiZ0b2tlbnMpXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBudW1iZXI9KG1hdGguc2xpY2UoMCxzdGFydFBvcykubWF0Y2goL1swLTkuXSsoPz1bXjAtOS5dKiQpLyl8fCBbXCJcIl0pWzBdO1xuICAgICAgICAgICAgICAgICAgICBudW1iZXI9bWF0aFtzdGFydFBvcy1udW1iZXIubGVuZ3RoLTFdJiZtYXRoW3N0YXJ0UG9zLW51bWJlci5sZW5ndGgtMV09PT1cIi1cIj9cIi1cIitudW1iZXI6bnVtYmVyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmKC9bLV0vLnRlc3QobWF0aFtzdGFydFBvcy0xXSkpe251bWJlcj1tYXRoW3N0YXJ0UG9zLTFdK251bWJlcn1cbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7dHlwZTogXCJ2YXJpYWJsZVwiLHZhcmlhYmxlOiB2YXJpLnJlcGxhY2UoXCIoXCIsXCJ7XCIpLnJlcGxhY2UoXCIpXCIsXCJ9XCIpLHZhbHVlOiBzYWZlVG9OdW1iZXIobnVtYmVyKSwgaW5kZXg6IHRva2Vucy5sZW5ndGh9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgvWyovXj1dLy50ZXN0KG1hdGhbaV0pfHwoIS9bYS16QS1aMC05XS8udGVzdChtYXRoW2krMV0pJiYvWystXS8udGVzdChtYXRoW2ldKSkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwib3BlcmF0b3JcIiwgdmFsdWU6IG1hdGhbaV0sIGluZGV4OiB0b2tlbnMubGVuZ3RoP3Rva2Vucy5sZW5ndGg6MCB9KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgvWystXFxkXS8udGVzdChtYXRoW2ldKSl7Y29udGludWU7fVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChicmFja2V0cyE9PTApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciAoXCJVbm1hdGNoZWQgb3BlbmluZyBicmFja2V0KHMpXCIpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRva2Vuc1xuICAgIH1cblxuXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xuICAgICAgICBjb25zb2xlLmxvZyh0aGlzLnRva2VucylcbiAgICAgICAgbGV0IGk9MCxtb3JlQ29ubmVjdGVkVG9rZW5zPXRydWU7XG4gICAgICAgIHdoaWxlIChpIDwgMTAwICYmIG1vcmVDb25uZWN0ZWRUb2tlbnMpIHtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5maW5kU2ltaWxhclN1Y2Nlc3Nvcih0aGlzLnRva2VucylcbiAgICAgICAgICAgIGlmIChpbmRleCA+PTApIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleF0udmFsdWUrPXRoaXMudG9rZW5zW2luZGV4KzFdLnZhbHVlXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4ICsgMSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgb3BlblBhcmVuSW5kZXg9LTEsY2xvc2VQYXJlbkluZGV4PS0xLGNoZWNrdFBhcmVuPS0xO1xuICAgIFxuICAgICAgICAgICAgd2hpbGUgKGk8MTAwKSB7XG4gICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgICAgIG9wZW5QYXJlbkluZGV4ID0gZmluZE9wZW5kUGFyZW5JbmRleCh0aGlzLnRva2VucyxjaGVja3RQYXJlbilcbiAgICAgICAgICAgICAgICBjbG9zZVBhcmVuSW5kZXggPSBvcGVuUGFyZW5JbmRleCA9PT0gLTE/LTE6ZmluZENsb3NlZFBhcmVuSW5kZXgodGhpcy50b2tlbnMsb3BlblBhcmVuSW5kZXgpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG9wZW5QYXJlbkluZGV4PT09LTF8fGNsb3NlUGFyZW5JbmRleCE9PS0xKXticmVhazt9XG4gICAgICAgICAgICAgICAgY2hlY2t0UGFyZW49b3BlblBhcmVuSW5kZXg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2xvc2VQYXJlbkluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+XG4gICAgICAgICAgICAgICAgICAgIGlkeCAhPT0gb3BlblBhcmVuSW5kZXggJiYgaWR4ICE9PSBjbG9zZVBhcmVuSW5kZXhcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSAmJiBjbG9zZVBhcmVuSW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yZUlEcGFyZW50aGVzZXModGhpcy50b2tlbnMpXG4gICAgfVxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd1ZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXG4gICAgICAgIClcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cbiAgICB9XG4gICAgaW5zZXJ0VG9rZW5zKHN0YXJ0LCBsZW5ndGgsIG9iamVjdHMpIHtcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXhwZWN0ZWQgYG9iamVjdHNgIHRvIGJlIGFuIGFycmF5LCBidXQgcmVjZWl2ZWQ6XCIsIG9iamVjdHMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgbGVuZ3RoLCAuLi5vYmplY3RzKTtcbiAgICB9XG4gICAgXG4gICAgcmVvcmRlcigpe1xuICAgICAgICBsZXQgbmV3VG9rZW5zID0gW107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy50b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBuZXdUb2tlbiA9IHsgLi4udGhpcy50b2tlbnNbaV0sIGluZGV4OiBpIH07XG4gICAgICAgICAgICBuZXdUb2tlbnMucHVzaChuZXdUb2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b2tlbnM9bmV3VG9rZW5zO1xuICAgIH1cbiAgICByZWNvbnN0cnVjdCh0b2tlbnMpe1xuICAgICAgICBpZiAodG9rZW5zPT09dW5kZWZpbmVkKXtcbiAgICAgICAgICAgIHRva2Vucz10aGlzLnRva2VucztcbiAgICAgICAgfVxuICAgICAgICBsZXQgbWF0aCA9IFwiXCI7XG4gICAgICAgIGZvciAobGV0IGk9MDtpPHRva2Vucy5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGxldCB0ZW1wO1xuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbdG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuLCBpbmRleCkgPT4gdG9rZW4uaWQgPT09IHRva2Vuc1tpXS5pZCYmdG9rZW5zW2luZGV4KzFdKSsxXS52YWx1ZT09PVwiL1wiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG1hdGgrPVwiXFxcXGZyYWNcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN3aXRjaCAodG9rZW5zW2ldLnR5cGUpe1xuICAgICAgICAgICAgICAgIGNhc2UgXCJudW1iZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgdGVtcD0ocGx1c1N5bWJvbENoZWNrKHRva2VucyxpKT9cIitcIjpcIlwiKStyb3VuZEJ5U2V0dGluZ3ModG9rZW5zW2ldLnZhbHVlKVxuICAgICAgICAgICAgICAgICAgICBtYXRoKz10ZW1wKyhpKzE8dG9rZW5zLmxlbmd0aCYmLyhmcmFjKS8udGVzdCh0b2tlbnNbaSsxXS52YWx1ZSk/XCIrXCI6XCJcIik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJwYXJlblwiOlxuICAgICAgICAgICAgICAgICAgICB0ZW1wPXRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRva2Vuc1tpXS5pZCkub3Blbi0xXVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB0ZW1wICE9PSBcInVuZGVmaW5lZFwiICYmIFxuICAgICAgICAgICAgICAgICAgICAgICAgKChjdXJseUJyYWNrZXRzUmVnZXgudGVzdCh0ZW1wLnZhbHVlKSkgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAoL1xcKS8udGVzdCh0ZW1wLnZhbHVlKSAmJiBjdXJseUJyYWNrZXRzUmVnZXgudGVzdCh0b2tlbnNbdGhpcy5maW5kUGFyZW5JbmRleCh0ZW1wLmlkKS5vcGVuIC0gMV0udmFsdWUpKSkpIFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoICs9IHRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCBcIntcIikucmVwbGFjZSgvXFwpLywgXCJ9XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaT4wJiZ0b2tlbnNbaV0udmFsdWU9PT1cIihcIiYmdG9rZW5zW2ktMV0/LnZhbHVlPT09XCIpXCIpe21hdGgrPVwiK1wifVxuICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0udmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJvcGVyYXRvclwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSAhPT0gXCIvXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWUpLnJlcGxhY2UoLyhbXipePS8rLV0pLyxcIlxcXFwkMVwiKS5yZXBsYWNlKC9cXCovZyxcIlxcXFxjZG90IFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPShwbHVzU3ltYm9sQ2hlY2sodG9rZW5zLGkpP1wiK1wiOlwiXCIpKyh0b2tlbnNbaV0udmFsdWUhPT0xP3Rva2Vuc1tpXS52YWx1ZTpcIlwiKSt0b2tlbnNbaV0udmFyaWFibGU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJwb3dlclZhcmlhYmxlXCI6XG4gICAgICAgICAgICAgICAgICAgIC8vY29uc29sZS5sb2cocGx1c1N5bWJvbENoZWNrKHRva2VucyxpKSlcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHBsdXNTeW1ib2xDaGVjayh0b2tlbnMsaSk/XCIrXCI6XCJcIikrKHRva2Vuc1tpXS52YWx1ZSE9PTE/dG9rZW5zW2ldLnZhbHVlOlwiXCIpK3Rva2Vuc1tpXS52YXJpYWJsZStgXnske3Rva2Vuc1tpXS5wb3d9fWA7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCB0b2tpbiB0eXBlIGdpdmVuIHRvIHJlY29uc3RydWN0OiB0eXBlICR7dG9rZW5zW2ldLnR5cGV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdGhcbiAgICB9XG4gICAgZmluZFBhcmVuSW5kZXgoaWQsaW5kZXgpe1xuICAgICAgICB0cnl7XG4gICAgICAgICAgICBpZD1pbmRleD90aGlzLnRva2Vuc1tpbmRleF0uaWQ6aWQ7XG4gICAgICAgICAgICBjb25zdCBvcGVuPXRoaXMudG9rZW5zLmZpbmRJbmRleChcbiAgICAgICAgICAgICAgICB0b2tlbj0+dG9rZW4udmFsdWU9PT1cIihcIlxuICAgICAgICAgICAgICAgICYmdG9rZW4uaWQ9PT1pZFxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgY29uc3QgY2xvc2U9dGhpcy50b2tlbnMuZmluZExhc3RJbmRleChcbiAgICAgICAgICAgICAgICB0b2tlbj0+dG9rZW4udmFsdWU9PT1cIilcIlxuICAgICAgICAgICAgICAgICYmdG9rZW4uaWQ9PT1pZFxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgcmV0dXJue29wZW46IG9wZW4sY2xvc2U6IGNsb3NlLGlkOmlkfVxuICAgICAgICB9XG4gICAgICAgIGNhdGNoKGUpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdG9rZW5Db21wYXJlKGNvbXBhcmUsIHZhbHVlLCB0b2tlbiwgbmV4dFRva2VuKSB7XG4gICAgICAgIHZhbHVlID0gdmFsdWUgaW5zdGFuY2VvZiBSZWdFeHAgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlLnRlc3QodG9rZW5bY29tcGFyZV0pKSAmJlxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXG4gICAgICAgICk7XG4gICAgfVxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XG4gICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxuICAgICAgICAgICAgICAgICgodG9rZW5zW2luZGV4ICsgMl0/LnR5cGUgIT09IFwib3BlcmF0b3JcIiYmdG9rZW5zW2luZGV4IC0xXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiKVxuICAgICAgICAgICAgICAgICYmKHRoaXMudG9rZW5Db21wYXJlKFwidHlwZVwiLHRoaXMudmFsdWVUb2tlbnMoKSwgdG9rZW4sIHRva2Vuc1tpbmRleCArIDFdKSlcbiAgICAgICAgKSk7XG4gICAgfVxuXG4gICAgdmFsdWVUb2tlbnMoKXtcbiAgICAgICAgcmV0dXJuIC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpL1xuICAgIH1cbiAgICByZUlEcGFyZW50aGVzZXMoKSB7XG4gICAgICAgIGxldCB0b2tlbnM9dGhpcy50b2tlbnNcbiAgICAgICAgbGV0IGJyYWNrZXRzID0gMCwgbGV2ZWxDb3VudCA9IHt9O1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWxldmVsQ291bnRbYnJhY2tldHNdKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldmVsQ291bnRbYnJhY2tldHNdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10rKztcbiAgICAgICAgICAgICAgICAvLyBSZWFzc2lnbiB0aGUgb2JqZWN0IHdpdGggdGhlIG5ldyBpZCB0byBlbnN1cmUgcGVyc2lzdGVuY2VcbiAgICAgICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgXCIuXCIgKyBJRCB9O1xuICAgICAgICAgICAgICAgIGJyYWNrZXRzKys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSBcIilcIikge1xuICAgICAgICAgICAgICAgIGJyYWNrZXRzLS07XG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xuICAgICAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxuICAgICAgICAgICAgICAgIHRva2Vuc1tpXSA9IHsgLi4udG9rZW5zW2ldLCBpZDogYnJhY2tldHMgKyBcIi5cIiArIChJRCA+PSAwID8gSUQgOiAwKSB9O1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9rZW5zPXRva2VucztcbiAgICAgICAgdGhpcy5yZW9yZGVyKCk7XG4gICAgfVxufVxuXG5jb25zdCBwbHVzU3ltYm9sQ2hlY2sgPSAodG9rZW5zLCBpbmRleCkgPT4ge1xuICAgIGlmICghaW5kZXggPiAwKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRva2Vuc1tpbmRleF0udmFsdWUgPj0gMCAmJiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbnNbaW5kZXggLSAxXS50eXBlKTtcbn07XG5cblxuXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycikge1xuICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICBsZXQgc3RhY2sgPSBBcnJheS5pc0FycmF5KGFycikgPyBbLi4uYXJyXSA6IFthcnJdOyAgLy8gRW5zdXJlIGFyciBpcyBhbiBhcnJheSBvciB3cmFwIGl0IGluIG9uZVxuXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBuZXh0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyAgLy8gU3ByZWFkIHRoZSBhcnJheSBpdGVtcyB0byB0aGUgc3RhY2tcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpOyAgLy8gQWRkIG5vbi1hcnJheSBpdGVtcyB0byB0aGUgcmVzdWx0XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTsgIC8vIFJldmVyc2UgdG8gbWFpbnRhaW4gb3JpZ2luYWwgb3JkZXJcbn0iXX0=