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
    'atan', 'arccos', 'arcsin', 'arctan', 'cdot', 'sqrt'
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
    if (typeof operator === "string" && typeof left?.value !== "number" && !operatorSides.rightOnly.includes(operator)) {
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
    parseSafetyChecks(operator, left, right);
    let solved = new Token();
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
    return solved;
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
    let priority1 = findOperatorIndex(begin, end, tokens, /(\^|sqrt)/);
    let priority2 = findOperatorIndex(begin, end, tokens, /(frac|binom|sin|cos|tan|asin|acos|atan)/);
    let priority3 = findOperatorIndex(begin, end, tokens, /(\*|\/)/);
    let priority4 = findOperatorIndex(begin, end, tokens, /[+-]/);
    let priority5 = findOperatorIndex(begin, end, tokens, /=/);
    return [priority1, priority2, priority3, priority4, priority5].find(index => index !== -1) ?? null;
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
        this.index = !this.index ? operationsOrder(tokens) : this.index;
        if (this.index === null || this.index >= tokens.length - 1) {
            return;
        }
        this.operator = tokens.tokens[this.index].value;
        switch (true) {
            case operatorSides.both.includes(this.operator):
                this.left = this.applyPosition(tokens, this.index, "left");
                this.right = this.applyPosition(tokens, this.index, "right");
                break;
            case operatorSides.rightOnly.includes(this.operator):
                this.left = { breakChar: this.index };
                this.right = this.applyPosition(tokens, this.index, "right");
                break;
            case operatorSides.doubleRight.includes(this.operator):
                this.left = this.applyPosition(tokens, this.index, "right");
                this.transition = this.left.breakChar;
                this.right = this.applyPosition(tokens, this.transition - 1, "right");
                this.left.breakChar = this.index;
                this.right.breakChar + (this.right.multiStep ? 1 : 0);
                break;
            default:
                throw new Error(`Operator ${this.operator} was not accounted for, or is not the valid operator`);
        }
        this.specialChar = tokens.tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
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
            breakChar: breakChar,
        };
    }
    checkMultiStep() {
        return ((operatorSides.both.includes(this.operator) && this.left?.multiStep) || this.right?.multiStep) && this.operator === '*';
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
            //this.praisingMethod()
        }
        //if (solved === null||typeof solved==="string") {return solved; }
        console.log(this.tokens.tokens);
        return this.finalReturn(); //this.tokens.tokens.length>1?this.controller():this.finalReturn();
    }
    useParse(position) {
        const solved = parse(position);
        this.mathInfo.addDebugInfo("solved", solved);
        this.mathInfo.addSolution(this.tokens, position, solved);
        const [leftBreak, length] = [position.left.breakChar, position.right.breakChar - position.left.breakChar];
        this.tokens.insertTokens(leftBreak, length, solved);
        this.addDebugInfo("newTokens", this.tokens.tokens);
        return this.controller();
    }
    praisingMethod() {
        const filterByType = (type) => this.tokens.tokens.filter(token => token.type === type);
        const [numberIndex, variableIndex, powIndex] = [filterByType("number"), filterByType("variable"), filterByType("powerVariable")];
        if (powIndex.length === 1 && powIndex[0].pow === 2)
            return this.useQuadratic();
        return this.useIsolat();
    }
    useIsolat() {
        const position = new Position(this.tokens);
        this.tokens.insertTokens();
        //Use possession
    }
    useQuadratic() {
        this.tokens.tokens = simplifiy(this.tokens.tokens);
        const filterByType = (type) => this.tokens.tokens.filter(token => token.type === type);
        const [numberIndex, variableIndex, powIndex] = [filterByType("number"), filterByType("variable"), filterByType("powerVariable")];
        this.mathInfo.addDebugInfo("simplifiy(tokens)", this.tokens.tokens);
        if (powIndex.length === 1 && powIndex[0].pow === 2) {
            return quad(powIndex[0]?.value | 0, variableIndex[0]?.value | 0, numberIndex[0]?.value * -1 | 0, powIndex[0].variable);
        }
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
function createFrac(nominator, denominator) {
    return new Token('frac'), new Token('('), nominator, new Token(')'), new Token('('), denominator, new Token(')');
}
class Tokens {
    tokens = [];
    constructor(math) {
        this.tokenize(math);
    }
    tokenize(math) {
        latexOperators.push(String.raw `[*/^=\+\-\(\)]`);
        const operators = arrToRegexString(latexOperators);
        for (let i = 0; i < math.length; i++) {
            //const arr=arrToRegexString(latexOperators.push(String.raw`[*/^=\+\-\(\)]`))
            let match = math.slice(i).match(regExp('^' + operators));
            if (!!match) {
                this.tokens.push(new Token(match[0]));
                i += match[0].length - 1;
                continue;
            }
            /*
            if (!!match) {
                this.tokens.push(new Token(match[0]));
                i+=match[0].length-1;
                /*
                if (tokens[tokens.length - 1].value === "sqrt" && math[i] === "[" && i < math.length - 2) {
                    let temp=math.slice(i,i+1+math.slice(i).search(/[\]]/));
                    i+=temp.length
                    Object.assign(tokens[tokens.length-1],{specialChar: safeToNumber(temp),})
                }
                continue;
            }*/
            match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
            if (!!match) {
                i += match[0].length - 1;
                this.tokens.push(new Token(parseFloat(match[0])));
                continue;
            }
            match = math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/);
            if (!!match) {
                //if (vari&&vari.length===0){vari=math.slice(i,math.length)}
                i += match[0].length - 1;
                this.tokens.push(new Token(1, match[0]));
                //tokens.push({type: "variable",variable: vari.replace("(","{").replace(")","}"),value: 1});
                continue;
            }
            throw new Error(`Unknown char "${math[i]}"`);
        }
        this.postProcessTokens();
    }
    validateIndex(index, margin) {
        margin = margin || 0;
        return index > 0 + margin && index < this.tokens.length - margin;
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
            return this.tokens[index].isValueToken();
        };
        this.IDparentheses();
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
            return this.tokens[index + 1]?.value === '(' && (idx === 0 || !/(frac|binom)/.test(this.tokens[idx - 1]?.value));
        };
        //Map parentheses for implicit multiplication.
        const mapParen = this.tokens
            .map((token, index) => {
            if (token.value === "(" || (token.type === 'operator' && !/[+\-*/^=]/.test(token.value))) {
                console.log(index);
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
            this.tokens.splice(value, 0, new Token('*'));
        });
    }
    mapParenIndexes() {
        return this.tokens
            .map((token, index) => token.value === "(" ? this.findParenIndex(undefined, index) : null)
            .filter(item => item !== null)
            .filter(item => {
            const { open: openIndex, close: closeIndex } = item;
            if (openIndex > 0) {
                if (/(operator|paren)/.test(this.tokens[openIndex - 1].type)) { // && prevToken.value !== "="
                    return false;
                }
            }
            if (closeIndex < this.tokens.length - 1) {
                if (this.tokens[closeIndex + 1].isValueToken()) { //this.tokens[closeIndex + 1]
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
    valueTokens() { return /(number|variable)/; }
    connectNearbyTokens() {
        this.tokens.forEach(token => {
            if (!(token instanceof Token)) {
                throw new Error("ftygubhnimpo");
            }
        });
        const map = new Set(this.mapParenIndexes().flatMap(({ open, close }) => [open, close]));
        this.tokens = this.tokens.filter((_, idx) => !map.has(idx));
        //Problem with  = as it's affecting the variable before it
        const check = (index) => {
            return (!this.tokens?.[index - 1]?.affectedOperatorRange?.() &&
                !this.tokens?.[index + 1]?.affectedOperatorRange?.());
        };
        const numMap = this.tokens.map((token, index) => token.type === 'number' && check(index) ? index : null).filter(item => item !== null);
        const varMap = this.tokens.map((token, index) => token.type === 'variable' && check(index) ? index : null).filter(item => item !== null);
        const arr = [
            ...findConsecutiveSequences(numMap),
            ...findConsecutiveSequences(varMap),
        ];
        this.connectAndCombine(arr);
        this.IDparentheses(this.tokens);
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
                    if (tokens[i] instanceof Token)
                        math += tokens[i]?.toStringLatex();
                    //temp=roundBySettings(tokens[i].value)
                    //math+=temp+(i+1<tokens.length&&/(frac)/.test(tokens[i+1].value)?"+":"");
                    break;
                case "paren":
                    temp = tokens[this.findParenIndex(tokens[i].id).open - 1];
                    if (temp &&
                        ((curlyBracketsRegex.test(temp.value)) ||
                            (/\)/.test(temp.value) && curlyBracketsRegex.test(tokens[this.findParenIndex(temp.id).open - 1].value)))) {
                        math += tokens[i].value.replace(/\(/, "{").replace(/\)/, "}");
                        break;
                    }
                    //else if (i>0&&tokens[i].value==="("&&tokens[i-1]?.value===")"){math+="+"}
                    math += tokens[i].value;
                    break;
                case "operator":
                    if (tokens[i].value !== "/") {
                        if (tokens[i] instanceof Token)
                            math += tokens[i].toStringLatex();
                    }
                    break;
                /*
                case "variable":
                case "powerVariable":
                    math+=+(tokens[i].value!==1?tokens[i].value:"")+tokens[i].variable;
                    break;
                    math+=(tokens[i].value!==1?tokens[i].value:"")+tokens[i].variable+`^{${tokens[i].pow}}`;
                    break;*/
                default:
                    console.log(this.tokens);
                    throw new Error(`Unexpected token type given to reconstruct: type ${tokens[i]?.type}`);
            }
        }
        return math;
    }
    curlyBracketIDs(tokens) {
        if (tokens === undefined) {
            tokens = this.tokens;
        }
        const match = /(\^|\)|frac|binom)/;
        const map = tokens
            .map((token, index) => {
            index > 0 && token.value === '(' && tokens[index - 1].match(match) ?
                this.findParenIndex(undefined, index, tokens) : null;
        })
            .filter(item => item !== null);
        //.flatMap(({ open, close }) => [open, close]);
    }
    indexesToAddPlus(tokens) {
        return tokens.map((token, index) => index > 0
            && tokens[index - 1]?.isValueToken()
            && token?.isValueToken() && token.value >= 0 ? index : null).filter(item => item !== null);
    }
    findParenIndex(id, index, tokens) {
        if (tokens === undefined) {
            tokens = this.tokens;
        }
        try {
            id = id ? id : tokens[index].id;
            const open = tokens.findIndex(token => token.value === "("
                && token.id === id);
            const close = tokens.findLastIndex(token => token.value === ")"
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
    IDparentheses() {
        let tokens = this.tokens;
        let brackets = 0, levelCount = {};
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].value === "(") {
                if (!levelCount[brackets]) {
                    levelCount[brackets] = 0;
                }
                let ID = levelCount[brackets]++;
                tokens[i].id = brackets + "." + ID;
                brackets++;
                continue;
            }
            if (tokens[i].value === ")") {
                brackets--;
                let ID = levelCount[brackets] - 1;
                // Reassign the object with the new id to ensure persistence
                tokens[i].id = brackets + "." + ID;
                continue;
            }
        }
        if (brackets !== 0) {
            //throw new Error ("Unmatched opening bracket(s) err rate: "+brackets)
        }
        this.tokens = tokens;
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
class Token {
    type;
    value;
    variable;
    modifier;
    id;
    constructor(value, variable) {
        this.value = value;
        this.variable = variable;
        this.setType();
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
            string += this.value.replace(/([^*^=/+-])/, "\\$1").replace(/\*/g, "\\cdot ");
        if (this.type === 'variable')
            string += this.toStringVariable();
        if (this.type === 'number')
            string += this.value;
        return string;
    }
    affectedOperatorRange(direction) {
        if (this.type !== 'operator' || (this.value.toString()).match(/(=)/))
            return false;
        if (direction === 'left' && !operatorSides.both.includes(this.value))
            return false;
        return true;
    }
    toStringVariable() {
        return (this.value !== 1 ? this.value : '') + this.variable;
    }
}
class Paren {
    depth;
    depthID;
    id;
    constructor(depth, depthID) {
        this.depth = depth;
        this.depthID = depthID;
        this.setID();
    }
    setID() { this.id = this.depth + "." + this.depthID; }
}
class Modifier {
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzFCLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3RCxNQUFNLFlBQVksR0FBRztJQUNqQixPQUFPLEVBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU87SUFDNUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsS0FBSztJQUN4RSxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPO0NBQzFELENBQUM7QUFDRixNQUFNLGNBQWMsR0FBQztJQUNqQixLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNO0lBQ3BELE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUMsTUFBTTtDQUN0RCxDQUFBO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxHQUFHO0lBQ2pDLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNyQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFD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LElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsRUFBRTtnQkFDdkUsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLElBQUksQ0FBQyxFQUFFO2FBQzdFLENBQUM7WUFDRixNQUFNLElBQUksS0FBSyxDQUFDLDBFQUEwRSxDQUFDLENBQUE7U0FDOUY7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFDakQsTUFBTSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsUUFBUSxDQUFBLENBQUMsQ0FBQSxTQUFTLENBQUM7UUFFdkQsSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM3QyxHQUFHLEdBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxJQUFFLEdBQUcsS0FBRyxDQUFDLElBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxHQUFHLENBQUM7UUFDMUUsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksU0FBUyxDQUFDO1FBRzlCLDZDQUE2QztRQUM3QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUNwQyxNQUFNLEtBQUssR0FBRyxTQUFTLEdBQUcsVUFBVSxDQUFDO1FBQ3JDLDBEQUEwRDtRQUMxRCxJQUFJLENBQUMsUUFBUSxFQUFF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QUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUE7UUFDcEksTUFBTSxHQUFHLEdBQUMsd0JBQXdCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBRTNCLE1BQU0sU0FBUyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBRyxHQUFHLElBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQTtRQUd6SCxJQUFJLEtBQUssR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEtBQUcsR0FBRyxJQUFFLEtBQUssQ0FBQyxLQUFLLEtBQUcsR0FBRyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUEsRUFBRSxDQUFDLEtBQUssS0FBRyxJQUFJLENBQUMsQ0FBQTtRQUN2SCxLQUFLLEdBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUU1QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQzVCLE1BQU0sS0FBSyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxLQUFHLEdBQUcsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztZQUNoRCxJQUFJ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QUFFLENBQUMsR0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3hELENBQUM7Q0FFSjtBQUNELE1BQU0sS0FBSztJQUNQLEtBQUssQ0FBQztJQUNOLE9BQU8sQ0FBQztJQUNSLEVBQUUsQ0FBQztJQUVILFlBQVksS0FBSyxFQUFDLE9BQU87UUFDckIsSUFBSSxDQUFDLEtBQUssR0FBQyxLQUFLLENBQUM7UUFDakIsSUFBSSxDQUFDLE9BQU8sR0FBQyxPQUFPLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFDRCxLQUFLLEtBQUcsSUFBSSxDQUFDLEVBQUUsR0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFBLENBQUEsQ0FBQztDQUNuRDtBQUNELE1BQU0sUUFBUTtDQUViIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuL2ltVmVyeUxhenlcIjtcbmltcG9ydCB7IHR5cGUgfSBmcm9tIFwib3NcIjtcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIHJlZ0V4cCB9IGZyb20gXCIuL3Rpa3pqYXgvdGlrempheFwiO1xuY29uc3QgZ3JlZWtMZXR0ZXJzID0gW1xuICAgICdBbHBoYScsJ2FscGhhJywgJ0JldGEnLCAnR2FtbWEnLCAnRGVsdGEnLCAnRXBzaWxvbicsICdaZXRhJywgJ0V0YScsICdUaGV0YScsIFxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXG4gICAgJ1NpZ21hJywgJ1RhdScsICdVcHNpbG9uJywgJ1BoaScsICdDaGknLCAnUHNpJywgJ09tZWdhJ1xuXTtcbmNvbnN0IGxhdGV4T3BlcmF0b3JzPVtcbiAgICAndGFuJywgJ3NpbicsICdjb3MnLCAnYmlub20nLCAnZnJhYycsICdhc2luJywgJ2Fjb3MnLCBcbiAgICAnYXRhbicsICdhcmNjb3MnLCAnYXJjc2luJywgJ2FyY3RhbicsICdjZG90Jywnc3FydCdcbl1cblxuZnVuY3Rpb24gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKGFycikge1xuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xuICAgIGxldCBzdGFydCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XG4gICAgICAgICAgICBpZiAoaSAtIHN0YXJ0ID4gMSkge1xuICAgICAgICAgICAgICAgIHNlcXVlbmNlcy5wdXNoKGFyci5zbGljZShzdGFydCwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhcnQgPSBpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzZXF1ZW5jZXM7XG59XG5cblxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cbn07XG5jb25zdCBvcGVyYXRvclNpZGVzID0ge1xuICAgIGJvdGg6IFtcIl5cIiwgXCIrXCIsIFwiLVwiLCBcIipcIiwgXCIvXCIsIFwiPVwiXSxcbiAgICByaWdodE9ubHk6IFtcInNxcnRcIiwgXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXG4gICAgZG91YmxlUmlnaHQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiXVxufTtcblxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xuICAgIGRlYnVnSW5mbz1cIlwiO1xuICAgIHNvbHV0aW9uSW5mbz1bXTtcbiAgICBtYXRoSW5mbz1bXVxuICAgIGdyYXBoPVwiXCI7XG4gICAgYWRkR3JhcGhJbmZvKHZhbHVlKXtcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtc2csIHZhbHVlKXtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPSh0eXBlb2YgbXNnPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeShtc2cpOm1zZykrXCIgOiBcIisodHlwZW9mIHZhbHVlPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeSh2YWx1ZSk6dmFsdWUpKyBcIlxcbiBcIjtcbiAgICB9XG4gICAgYWRkU29sdXRpb25JbmZvKG1lcyl7XG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xuICAgIH1cbiAgICBhZGRNYXRoSW5mbyh0b2tlbnMpe1xuICAgICAgICBjb25zdCByZWNvbnN0cnVjdGVkTWF0aD10b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gocmVjb25zdHJ1Y3RlZE1hdGgpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xuICAgIH1cblxuICAgIGFkZFNvbHV0aW9uKHRva2Vucyxwb3NpdGlvbixzb2x1dGlvbil7XG4gICAgICAgIHNvbHV0aW9uPXRva2Vucy5yZWNvbnN0cnVjdChbc29sdXRpb25dKTtcbiAgICAgICAgY29uc3QgbGVmdD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5pbmRleCkpO1xuICAgICAgICBjb25zdCByaWdodD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5pbmRleCsxLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhciwpKTtcblxuICAgICAgICBzd2l0Y2ggKHRydWUpe1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoQnV0UmlnaHRCcmFja2V0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvcn0geyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKC9cXCovZywgXCJcXFxcY2RvdFwiKX0gJHtyaWdodH0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gYFxcXFxmcmFjeyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8ucmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGBcXFxcc3FydHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZShcIi9cIixcImZyYWNcIil9eyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYWRkU29sdXRpb25JbmZvKHNvbHV0aW9uKTtcbiAgICB9XG59XG5cbi8qXG5mdW5jdGlvbiBzYWZlVG9OdW1iZXIodmFsdWUpIHtcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XG4gICAgaWYgKHZhbHVlPT09XCIrXCIpe3JldHVybiAwfVxuICAgIGlmICh2YWx1ZT09PVwiLVwiKXtyZXR1cm4gLTF9XG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxuICAgIGlmKC9bKFtdLy50ZXN0KHZhbHVlWzBdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgxKX1cbiAgICBpZigvWylcXF1dLy50ZXN0KHZhbHVlW3ZhbHVlLmxlbmd0aC0xXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMCx2YWx1ZS5sZW5ndGgtMSl9XG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVtpXSA9PT0gXCJzdHJpbmdcIiAmJiAvWygpW1xcXV0vLnRlc3QodmFsdWVbaV0pKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsIGkpICsgdmFsdWUuc2xpY2UoaSArIDEpO1xuICAgICAgICAgICAgaS0tO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XG4gICAgcmV0dXJuIGlzTmFOKG51bSkgPyB2YWx1ZS5sZW5ndGg+MD92YWx1ZTowIDogbnVtO1xufSovXG5cbmZ1bmN0aW9uIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yLGxlZnQscmlnaHQpe1xuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgbGVmdD8udmFsdWUhPT1cIm51bWJlclwiJiYhb3BlcmF0b3JTaWRlcy5yaWdodE9ubHkuaW5jbHVkZXMob3BlcmF0b3IpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodD8udmFsdWUhPT1cIm51bWJlclwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJpZ2h0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XG4gICAgfVxufVxuXG5cblxuZnVuY3Rpb24gcGFyc2UocG9zaXRpb24pIHtcbiAgICBsZXQgeyBvcGVyYXRvcixzcGVjaWFsQ2hhciwgbGVmdCxyaWdodH0gPSBwb3NpdGlvbjtcbiAgICBsZWZ0PWxlZnQ/LnRva2Vuc1xuICAgIHJpZ2h0PXJpZ2h0LnRva2Vuc1xuICAgIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yLGxlZnQscmlnaHQpO1xuICAgIFxuICAgIGxldCBzb2x2ZWQ9bmV3IFRva2VuKCk7XG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlIFwic3FydFwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cocmlnaHQudmFsdWUsc3BlY2lhbENoYXIhPT1udWxsPygxKS8oc3BlY2lhbENoYXIpOjAuNSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIl5cIjpcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlfHxyaWdodC52YXJpYWJsZSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZXx8bGVmdC52YXJpYWJsZT09PXJpZ2h0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU/cmlnaHQudmFyaWFibGU6XCJcIjtcbiAgICAgICAgICAgICAgICBzb2x2ZWQucG93PTJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJmcmFjXCI6XG4gICAgICAgIGNhc2UgXCIvXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiKlwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAqIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgaGFuZGxlVnJpYWJsZXMobGVmdCwgcmlnaHQsc29sdmVkKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiK1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSArIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiLVwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAtIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYmlub21cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGNhbGN1bGF0ZUJpbm9tKGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzaW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiY29zXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSlcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidGFuXCI6XG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoXCJ0YW4gTXVzdCBiZSBzbWFsbGVyIHRoYW4gOTBcIik7fVxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImFzaW5cIjpcbiAgICAgICAgY2FzZSBcImFyY3NpblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFzaW4ocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYWNvc1wiOlxuICAgICAgICBjYXNlIFwiYXJjY29zXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYWNvcyhyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhdGFuXCI6XG4gICAgICAgIGNhc2UgXCJhcmN0YW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBudWxsOyBcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQsIHJpZ2h0LCBzb2x2ZWQpIHtcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcbiAgICAgICAgICAgIC8vIEtlZXAgdGhlbSBzZXBhcmF0ZSBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZhcmlhYmxlc1xuICAgICAgICAgICAgc29sdmVkLnRlcm1zID0gW1xuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IHJpZ2h0LnZhcmlhYmxlLCBwb3c6IHJpZ2h0LnBvdyB8fCAxLCB2YWx1ZTogcmlnaHQudmFsdWUgfHwgMSB9XG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlmZmVyZW50IHZhcmlhYmxlIGJhc2VzIGF0IHBvd2VyIG11bHRpcGxpY2F0aW9uLiBJIGRpZG4ndCBnZXQgdGhlcmUgeWV0XCIpXG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICBzb2x2ZWQudmFyaWFibGUgPSB2YXJpYWJsZS5sZW5ndGg+MD92YXJpYWJsZTp1bmRlZmluZWQ7XG4gICAgICAgIFxuICAgICAgICBsZXQgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcbiAgICAgICAgcG93PWxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUmJnBvdz09PTAmJiFsZWZ0LnBvdyYmIXJpZ2h0LnBvdz8yOnBvdztcbiAgICAgICAgc29sdmVkLnBvdyA9IHBvdyB8fCB1bmRlZmluZWQ7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIFJ1bGUgMzogSGFuZGxlIG11bHRpcGxpY2F0aW9uIG9mIGNvbnN0YW50c1xuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XG4gICAgICAgIGNvbnN0IHJpZ2h0VmFsdWUgPSByaWdodC52YWx1ZSB8fCAxO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGxlZnRWYWx1ZSAqIHJpZ2h0VmFsdWU7XG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQscmlnaHQsc29sdmVkKXtcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgcmV0dXJuIDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cbiAgICAgICAgXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVHdvIHZhcmlhYmxlIGVxdWF0aW9ucyBhcmVuJ3QgYWNjZXB0ZWQgeWV0XCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XG4gICAgICAgIC8vc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyXG5cbiAgICAgICAgLypcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV9XG4gICAgICAgIGVsc2UgaWYgKCFsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlfVxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cbiAgICAgICAgKi9cbiAgICB9XG4gICAgcmV0dXJuIHNvbHZlZDtcbn1cblxuZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2Vucykge1xuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLCBlbmQsIHRva2VucywgcmVnZXgpIHtcbiAgICAgICAgd2hpbGUgKGJlZ2luIDwgZW5kICYmIGJlZ2luIDwgdG9rZW5zLnRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxldCBpbmRleDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy50b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIik7XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm4gLTE7XG4gICAgXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcbiAgICBcbiAgICAgICAgICAgIGlmICghL1srLV0vLnRlc3QodG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBpbmRleCA8IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4IC0gMV0udHlwZSA9PT0gdG9rZW5zLnRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJlZ2luID0gaW5kZXggKyAxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aCxqPTA7XG4gICAgbGV0IGN1cnJlbnRJRCA9IG51bGw7ICBcbiAgICBsZXQgY2hlY2tlZElEcyA9IFtdOyAgXG4gICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTtcbiAgICB3aGlsZSAoIW9wZXJhdG9yRm91bmQmJmo8MjAwKSB7XG4gICAgICAgIC8vIEZpbmQgdGhlIGlubmVybW9zdCBwYXJlbnRoZXNlc1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy50b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGorKztcbiAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2ldLnZhbHVlID09PSBcIihcIiAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnMudG9rZW5zW2ldLmlkKSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2ldLmlkKTsgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGN1cnJlbnRJRCE9PW51bGwmJmk9PT1jdXJyZW50SUQuY2xvc2UpIHtcbiAgICAgICAgICAgICAgICBbYmVnaW4sZW5kXT1bY3VycmVudElELm9wZW4sY3VycmVudElELmNsb3NlXVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAoIWN1cnJlbnRJRCkge1xuICAgICAgICAgICAgYmVnaW4gPSAwO1xuICAgICAgICAgICAgZW5kID0gdG9rZW5zLnRva2Vucy5sZW5ndGg7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBvcGVyYXRvckZvdW5kID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sZW5kLHRva2VucykhPT0tMTtcblxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxuICAgICAgICBpZiAoIW9wZXJhdG9yRm91bmQpIHtcbiAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQuaWQpOyAgXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGo+PTIwMCl7dGhyb3cgbmV3IEVycm9yKFwib3BlcmF0aW9uc09yZGVyIEZhaWxlZCBleGNlZWRlZCAyMDAgcmV2aXNpb25zXCIpO31cbiAgICBcbiAgICBsZXQgcHJpb3JpdHkxID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLC8oXFxefHNxcnQpLyk7XG4gICAgbGV0IHByaW9yaXR5MiA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLyhmcmFjfGJpbm9tfHNpbnxjb3N8dGFufGFzaW58YWNvc3xhdGFuKS8pO1xuICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oXFwqfFxcLykvKTtcbiAgICBsZXQgcHJpb3JpdHk0ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvWystXS8pO1xuICAgIGxldCBwcmlvcml0eTUgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC89Lyk7XG4gICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NV0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBQb3NpdGlvbiB7XG4gICAgb3BlcmF0b3I7XG4gICAgaW5kZXg7XG4gICAgdHJhbnNpdGlvbjtcbiAgICBzcGVjaWFsQ2hhcjtcbiAgICBsZWZ0O1xuICAgIHJpZ2h0O1xuICAgIGNvbnN0cnVjdG9yKHRva2VucywgaW5kZXgpe1xuICAgICAgICB0aGlzLmluZGV4PWluZGV4O1xuICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmluZGV4XG4gICAgICAgIHRoaXMucG9zaXRpb24odG9rZW5zKVxuICAgIH1cbiAgICBwb3NpdGlvbih0b2tlbnMpIHtcbiAgICAgICAgdGhpcy5pbmRleCA9ICF0aGlzLmluZGV4PyBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSA6IHRoaXMuaW5kZXg7XG4gICAgICAgIGlmICh0aGlzLmluZGV4ID09PSBudWxsIHx8IHRoaXMuaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9wZXJhdG9yID0gdG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS52YWx1ZTtcbiAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yU2lkZXMuYm90aC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwibGVmdFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLnJpZ2h0T25seS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB7YnJlYWtDaGFyOiB0aGlzLmluZGV4fTtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvclNpZGVzLmRvdWJsZVJpZ2h0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmxlZnQuYnJlYWtDaGFyO1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnRyYW5zaXRpb24tMSxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMubGVmdC5icmVha0NoYXIgPSB0aGlzLmluZGV4O1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQuYnJlYWtDaGFyKyh0aGlzLnJpZ2h0Lm11bHRpU3RlcD8xOjApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dGhpcy5vcGVyYXRvcn0gd2FzIG5vdCBhY2NvdW50ZWQgZm9yLCBvciBpcyBub3QgdGhlIHZhbGlkIG9wZXJhdG9yYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyIDogbnVsbDtcbiAgICB9XG4gICAgYXBwbHlQb3NpdGlvbih0b2tlbnMsIGluZGV4LCBkaXJlY3Rpb24pIHtcbiAgICAgICAgbGV0IGJyZWFrQ2hhcj1pbmRleFxuICAgICAgICBsZXQgdGFyZ2V0O1xuICAgICAgICBsZXQgbXVsdGlTdGVwPWZhbHNlO1xuICAgICAgICBjb25zdCBpc0xlZnQgPSBkaXJlY3Rpb24gPT09IFwibGVmdFwiO1xuICAgICAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcbiAgICAgICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLnRva2Vucy5sZW5ndGggLSAxKSB8fCAhdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYXQgYXBwbHlQb3NpdGlvbjogXFxcImluZGV4IHdhc24ndCB2YWxpZFxcXCIgaW5kZXg6IFwiK2luZGV4KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVuSW5kZXggPSB0b2tlbnMuZmluZFBhcmVuSW5kZXgodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS5pZCk7XG4gICAgICAgICAgICBicmVha0NoYXIgPSAgaXNMZWZ0ID8gcGFyZW5JbmRleC5vcGVuIDogcGFyZW5JbmRleC5jbG9zZSsxO1xuICAgICAgICAgICAgLy90YXJnZXQgPSB0b2tlbnMudG9rZW5zLnNsaWNlKGlzTGVmdCA/IGJyZWFrQ2hhciA6IGluZGV4ICsgMSwgaXNMZWZ0ID8gaW5kZXggOiBicmVha0NoYXIpO1xuICAgICAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vucy5zbGljZShwYXJlbkluZGV4Lm9wZW4sIHBhcmVuSW5kZXguY2xvc2UrMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBicmVha0NoYXI9aW5kZXgraW5kZXhNb2RpZmllcjtcbiAgICAgICAgICAgIHRhcmdldCA9IHRva2Vucy50b2tlbnNbYnJlYWtDaGFyXTtcbiAgICAgICAgICAgIGJyZWFrQ2hhcis9aXNMZWZ0PzA6MVxuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgLy9jb25zdCBtdWx0aVN0ZXAgPSBNYXRoLmFicyhicmVha0NoYXIgLSBpbmRleCkgPiAzO1xuICAgIFxuICAgICAgICBpZiAoIW11bHRpU3RlcCYmdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpe1xuICAgICAgICAgICAgLy90YXJnZXQ9dGFyZ2V0LmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxuICAgICAgICB9XG4gICAgICAgIGlmICh0YXJnZXQ/Lmxlbmd0aD09PTApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgYXQgYXBwbHlQb3NpdGlvbjogY291bGRuJ3QgZmluZCB0YXJnZXQgdG9rZW4gZm9yIGRpcmVjdGlvbiAke2RpcmVjdGlvbn0gYW5kIG9wZXJhdG9yXCIke3Rva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIC8vYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XG4gICAgICAgIC8vZGVsZXRlIHRhcmdldC5pbmRleFxuICAgICAgICBcbiAgICAgICAgaWYgKHRhcmdldC5sZW5ndGg9PT0zKXtcbiAgICAgICAgICAgIHRhcmdldD10YXJnZXQuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXG4gICAgICAgIH1lbHNlIGlmKHRhcmdldC5sZW5ndGg+MSltdWx0aVN0ZXA9dHJ1ZVxuICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdG9rZW5zOiB0YXJnZXQsXG4gICAgICAgICAgICBtdWx0aVN0ZXA6IG11bHRpU3RlcCxcbiAgICAgICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBjaGVja011bHRpU3RlcCgpe1xuICAgICAgICByZXR1cm4gKChvcGVyYXRvclNpZGVzLmJvdGguaW5jbHVkZXModGhpcy5vcGVyYXRvcikmJnRoaXMubGVmdD8ubXVsdGlTdGVwKXx8dGhpcy5yaWdodD8ubXVsdGlTdGVwKSYmdGhpcy5vcGVyYXRvcj09PScqJztcbiAgICB9XG4gICAgaXNMZWZ0VmFyKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmxlZnQubXVsdGlTdGVwP3RoaXMubGVmdC50b2tlbnMuc29tZSh0PT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMubGVmdC50b2tlbnMudHlwZS5pbmNsdWRlcygnYXJpYWJsZScpXG4gICAgfVxuICAgIGlzUmlnaHRWYXIoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMucmlnaHQubXVsdGlTdGVwP3RoaXMucmlnaHQudG9rZW5zLnNvbWUodD0+dC50eXBlPT09J3ZhcmlhYmxlJ3x8dC50eXBlPT09J3Bvd2VyVmFyaWFibGUnKTp0aGlzLnJpZ2h0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcbiAgICB9XG4gICAgY2hlY2tGcmFjKCl7Ly8hdGhpcy5jaGVja011bHRpU3RlcCgpIEkgZG9uJ3Qga25vdyB3aHkgSSBoYWQgdGhpcyBoZXJlXG4gICAgICAgIHJldHVybiAvKGZyYWN8XFwvKS8udGVzdCh0aGlzLm9wZXJhdG9yKSYmKHRoaXMuaXNMZWZ0VmFyKCl8fHRoaXMuaXNSaWdodFZhcigpKVxuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zKXtcbiAgICBpZiAodG9rZW5zLmxlbmd0aDw9MSl7cmV0dXJuIHRva2Vuc31cbiAgICBsZXQgaT0wLG5ld1Rva2Vucz1bXTtcbiAgICB3aGlsZSAoaTw9MTAwJiZ0b2tlbnMuc29tZSh0b2tlbiA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKSlcbiAgICB7XG4gICAgICAgIGkrKztcbiAgICAgICAgbGV0IGVxaW5kZXg9dG9rZW5zLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xuICAgICAgICBsZXQgT3BlcmF0aW9uSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbikgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgIGlmIChPcGVyYXRpb25JbmRleD09PS0xKXtyZXR1cm4gdG9rZW5zO31cblxuICAgICAgICBsZXQgY3VycmVudFRva2VuPXt0eXBlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgLCB2YWx1ZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YWx1ZSx2YXJpYWJsZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YXJpYWJsZSAscG93OiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnBvd31cblxuICAgICAgICBsZXQgbnVtYmVyR3JvdXAgPSB0b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW4sIGkpID0+ICh7IHRva2VuLCBvcmlnaW5hbEluZGV4OiBpIH0pKSBcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcbiAgICAgICAgLnJlZHVjZSgoc3VtLCBpdGVtKSA9PiB7XG4gICAgICAgIGxldCBtdWx0aXBsaWVyPSh0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0gJiYgdG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdLnZhbHVlID09PSBcIi1cIikgPyAtMSA6IDE7XG4gICAgICAgIG11bHRpcGxpZXIgKj0gKGl0ZW0ub3JpZ2luYWxJbmRleCA8PSBlcWluZGV4KSA/IC0xIDogMTsgXG4gICAgICAgIGlmICghKC8obnVtYmVyKS8pLnRlc3QoaXRlbS50b2tlbi50eXBlKSl7bXVsdGlwbGllcio9LTF9XG4gICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xuICAgICAgICB9LCAwKTsgXG4gICAgICAgIFxuICAgICAgICBuZXdUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAuLi5jdXJyZW50VG9rZW4sXG4gICAgICAgICAgICB2YWx1ZTogbnVtYmVyR3JvdXBcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdG9rZW5zID0gdG9rZW5zLmZpbHRlcih0b2tlbiA9PiBcbiAgICAgICAgICAgIHRva2VuLnR5cGUgIT09IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSB8fCBcbiAgICAgICAgICAgICh0b2tlbi52YXJpYWJsZSAmJiB0b2tlbi52YXJpYWJsZSAhPT0gY3VycmVudFRva2VuLnZhcmlhYmxlKSB8fCBcbiAgICAgICAgICAgICh0b2tlbi5wb3cgJiYgdG9rZW4ucG93ICE9PSBjdXJyZW50VG9rZW4ucG93KVxuICAgICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gbmV3VG9rZW5zO1xufVxuXG5leHBvcnQgY2xhc3MgTWF0aFByYWlzZXJ7XG4gICAgaW5wdXQ9XCJcIjtcbiAgICB0b2tlbnM9W107XG4gICAgc29sdXRpb249XCJcIjtcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcblxuICAgIGNvbnN0cnVjdG9yKGlucHV0KXtcbiAgICAgICAgdGhpcy5pbnB1dD1pbnB1dDtcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcbiAgICAgICAgdGhpcy50b2tlbnM9bmV3IFRva2Vucyh0aGlzLmlucHV0KTtcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJUb2tlbnMgYWZ0ZXIgdG9rZW5pemVcIix0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xuICAgIH1cbiAgICBnZXRSZWR5Zm9yTmV3Um9uZCgpe1xuICAgICAgICB0aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkTWF0aEluZm8odGhpcy50b2tlbnMpXG4gICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8odGhpcy50b2tlbnMudG9rZW5zLHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGgpXG4gICAgICAgIHRoaXMudG9rZW5zLmV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCk7XG4gICAgfVxuICAgIGNvbnRyb2xsZXIoKXtcbiAgICAgICAgdGhpcy5nZXRSZWR5Zm9yTmV3Um9uZCgpO1xuICAgICAgICBpZiAodGhpcy5zaG91bGRVc2VQb3NpdGlvbigpKXtcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMudG9rZW5zLG51bGwpO1xuICAgICAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJQYXJzZWQgZXhwcmVzc2lvblwiLCBKU09OLnN0cmluZ2lmeShwb3NpdGlvbiwgbnVsbCwgMSkpO1xuICAgICAgICAgICAgaWYgKHBvc2l0aW9uID09PSBudWxsJiZ0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjEpe1xuICAgICAgICAgICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8oXCJwYXJzZSh0b2tlbnMpXCIscGFyc2UodGhpcy50b2tlbnMudG9rZW5zKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJ0aGUgKioqKlwiXG4gICAgICAgICAgICAvLyByZXR1cm4gc29sdXRpb24odG9rZW5zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHBvc2l0aW9uLmluZGV4ID09PSBudWxsKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5maW5hbFJldHVybigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uLmNoZWNrRnJhYygpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGV4cGFuZEV4cHJlc3Npb24odGhpcy50b2tlbnMscG9zaXRpb24pO1xuICAgICAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zLnRva2VucykpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnVzZVBhcnNlKHBvc2l0aW9uKVxuICAgICAgICB9XG4gICAgICAgIGVsc2V7XG4gICAgICAgICAgICAvL3RoaXMucHJhaXNpbmdNZXRob2QoKVxuICAgICAgICB9XG4gICAgICAgIC8vaWYgKHNvbHZlZCA9PT0gbnVsbHx8dHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKS8vdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTtcbiAgICB9XG4gICAgdXNlUGFyc2UocG9zaXRpb24pe1xuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZShwb3NpdGlvbik7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uLHNvbHZlZClcbiAgICAgICAgY29uc3QgW2xlZnRCcmVhayxsZW5ndGhdID0gW3Bvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhci1wb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcl1cbiAgICAgICAgdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKGxlZnRCcmVhayxsZW5ndGgsc29sdmVkKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIm5ld1Rva2Vuc1wiLHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgfVxuICAgIFxuICAgIHByYWlzaW5nTWV0aG9kKCl7XG4gICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51c2VRdWFkcmF0aWMoKVxuICAgICAgICByZXR1cm4gdGhpcy51c2VJc29sYXQoKTtcbiAgICB9XG4gICAgdXNlSXNvbGF0KCl7XG4gICAgICAgIGNvbnN0IHBvc2l0aW9uPW5ldyBQb3NpdGlvbih0aGlzLnRva2VucylcbiAgICAgICAgdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKClcbiAgICAgICAgLy9Vc2UgcG9zc2Vzc2lvblxuICAgIH1cblxuICAgIHVzZVF1YWRyYXRpYygpe1xuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnM9c2ltcGxpZml5KHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXG4gICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNpbXBsaWZpeSh0b2tlbnMpXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHF1YWQoXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdPy52YWx1ZSB8IDAsXG4gICAgICAgICAgICAgICAgICAgIG51bWJlckluZGV4WzBdPy52YWx1ZSAqIC0xfCAwLFxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgIH1cblxuICAgIHNob3VsZFVzZVBvc2l0aW9uKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy50b2tlbnMuc29tZSh0b2tlbj0+LyhvcGVyYXRvcikvLnRlc3QodG9rZW4udHlwZSkmJiEvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSlcbiAgICB9XG4gICAgXG4gICAgYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSl7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKG1lcyx2YWx1ZSlcbiAgICB9XG4gICAgcHJvY2Vzc0lucHV0KCl7XG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy5pbnB1dFxuICAgICAgICAucmVwbGFjZSgvKE1hdGgufFxcXFx8XFxzfGxlZnR8cmlnaHQpL2csIFwiXCIpIFxuICAgICAgICAucmVwbGFjZSgvey9nLCBcIihcIilcbiAgICAgICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXG4gICAgICAgIC5yZXBsYWNlKC8oY2RvdCkvZywgXCIqXCIpXG4gICAgICAgIC8vLnJlcGxhY2UoLyg/PCFcXFxcfFthLXpBLVpdKSh0YW58c2lufGNvc3xiaW5vbXxmcmFjfGFzaW58YWNvc3xhdGFufGFyY2Nvc3xhcmNzaW58YXJjdGFufGNkb3QpL2csIFwiXFxcXCQxXCIpO1xuICAgIH1cbiAgICBmaW5hbFJldHVybigpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgIH1cbn1cbmZ1bmN0aW9uIGNyZWF0ZUZyYWMobm9taW5hdG9yLGRlbm9taW5hdG9yKXtcbiAgICByZXR1cm4gbmV3IFRva2VuKCdmcmFjJyksbmV3IFRva2VuKCcoJyksbm9taW5hdG9yLG5ldyBUb2tlbignKScpLG5ldyBUb2tlbignKCcpLGRlbm9taW5hdG9yLG5ldyBUb2tlbignKScpXG59XG5jbGFzcyBUb2tlbnN7XG4gICAgdG9rZW5zPVtdO1xuICAgIGNvbnN0cnVjdG9yKG1hdGgpe1xuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xuICAgIH1cbiAgICB0b2tlbml6ZShtYXRoKXtcbiAgICAgICAgbGF0ZXhPcGVyYXRvcnMucHVzaChTdHJpbmcucmF3YFsqL149XFwrXFwtXFwoXFwpXWApXG4gICAgICAgIGNvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGxhdGV4T3BlcmF0b3JzKVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9jb25zdCBhcnI9YXJyVG9SZWdleFN0cmluZyhsYXRleE9wZXJhdG9ycy5wdXNoKFN0cmluZy5yYXdgWyovXj1cXCtcXC1cXChcXCldYCkpXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKHJlZ0V4cCgnXicgKyBvcGVyYXRvcnMpKTtcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgVG9rZW4obWF0Y2hbMF0pKTtcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgVG9rZW4obWF0Y2hbMF0pKTtcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnZhbHVlID09PSBcInNxcnRcIiAmJiBtYXRoW2ldID09PSBcIltcIiAmJiBpIDwgbWF0aC5sZW5ndGggLSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0ZW1wPW1hdGguc2xpY2UoaSxpKzErbWF0aC5zbGljZShpKS5zZWFyY2goL1tcXF1dLykpO1xuICAgICAgICAgICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLHtzcGVjaWFsQ2hhcjogc2FmZVRvTnVtYmVyKHRlbXApLH0pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfSovXG5cbiAgICAgICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKS8pOy8vKFthLXpBLVpdPykvKTtcbiAgICAgICAgICAgIGlmICghIW1hdGNoKVxuICAgICAgICAgICAgeyAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgVG9rZW4ocGFyc2VGbG9hdChtYXRjaFswXSkpKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hdGNoPW1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKyhfXFwoW2EtekEtWjAtOV0qXFwpKSovKVxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAvL2lmICh2YXJpJiZ2YXJpLmxlbmd0aD09PTApe3Zhcmk9bWF0aC5zbGljZShpLG1hdGgubGVuZ3RoKX1cbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IFRva2VuKDEsbWF0Y2hbMF0pKVxuICAgICAgICAgICAgICAgIC8vdG9rZW5zLnB1c2goe3R5cGU6IFwidmFyaWFibGVcIix2YXJpYWJsZTogdmFyaS5yZXBsYWNlKFwiKFwiLFwie1wiKS5yZXBsYWNlKFwiKVwiLFwifVwiKSx2YWx1ZTogMX0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XG4gICAgfVxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXgsbWFyZ2luKXtcbiAgICAgICAgbWFyZ2luPW1hcmdpbnx8MDtcbiAgICAgICAgcmV0dXJuIGluZGV4PjArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtbWFyZ2luO1xuICAgIH1cbiAgICB2YWxpZGF0ZVBNKG1hcCl7XG4gICAgICAgIG1hcC5mb3JFYWNoKGluZGV4ID0+IHtcbiAgICAgICAgICAgIGluZGV4PXRoaXMudmFsaWRhdGVJbmRleChpbmRleCwxKSYmdGhpcy50b2tlbnNbaW5kZXgtMV0udHlwZT09PSdvcGVyYXRvcid8fHRoaXMudG9rZW5zW2luZGV4KzFdLnR5cGU9PT0nb3BlcmF0b3InP251bGw6aW5kZXg7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gbWFwXG4gICAgfVxuICAgIHZhbGlkYXRlUGFyZW4obWFwKXtcbiAgICAgICAgXG4gICAgfVxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XG4gICAgICAgIC8qcnVsZXMgdG8gYWJpZCBieTpcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxuICAgICAgICAqL1xuICAgICAgIFxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuSURwYXJlbnRoZXNlcygpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gKHRva2VuLnR5cGU9PT0nbnVtYmVyJ3x8dG9rZW4udHlwZT09PSd2YXJpYWJsZScpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnN0IGFycj1maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwKTtcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXBDYXJyb3Q9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi52YWx1ZT09PSdeJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXG5cblxuICAgICAgICBsZXQgbWFwUE09dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi52YWx1ZT09PScrJ3x8dG9rZW4udmFsdWU9PT0nLSc/aW5kZXg6bnVsbCkuZmlsdGVyKGluZGV4PT4gaW5kZXghPT1udWxsKVxuICAgICAgICBtYXBQTT10aGlzLnZhbGlkYXRlUE0obWFwUE0pXG5cbiAgICAgICAgbWFwUE0ucmV2ZXJzZSgpLmZvckVhY2goaW5kZXggPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsdWU9dGhpcy50b2tlbnNbaW5kZXhdLnZhbHVlPT09JysnPzE6LTE7XG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleCsxXS52YWx1ZSo9dmFsdWU7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGlkeD10aGlzLmZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXgrMV0/LnZhbHVlPT09JygnJiYoaWR4PT09MHx8IS8oZnJhY3xiaW5vbSkvLnRlc3QodGhpcy50b2tlbnNbaWR4LTFdPy52YWx1ZSkpO1xuICAgICAgICB9O1xuICAgICAgICAvL01hcCBwYXJlbnRoZXNlcyBmb3IgaW1wbGljaXQgbXVsdGlwbGljYXRpb24uXG4gICAgICAgIGNvbnN0IG1hcFBhcmVuID0gdGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4geyBcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8ICh0b2tlbi50eXBlID09PSAnb3BlcmF0b3InICYmICEvWytcXC0qL149XS8udGVzdCh0b2tlbi52YWx1ZSkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGluZGV4KVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSBcIilcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggKyAxKSB8fHRlc3REb3VibGVSaWdodChpbmRleCk/IGluZGV4KzEgOiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbCk7XG4gICAgICAgIFxuICAgICAgICBtYXBQYXJlbi5zb3J0KChhLCBiKSA9PiBiIC0gYSlcbiAgICAgICAgLmZvckVhY2godmFsdWUgPT4ge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHZhbHVlLCAwLCBuZXcgVG9rZW4oJyonKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyB0aGlzLmZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgpIDogbnVsbClcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XG4gICAgICAgICAgICBpZiAob3BlbkluZGV4PjApIHtcbiAgICAgICAgICAgICAgICBpZiAoLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodGhpcy50b2tlbnNbb3BlbkluZGV4IC0gMV0udHlwZSkpIHsvLyAmJiBwcmV2VG9rZW4udmFsdWUgIT09IFwiPVwiXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjbG9zZUluZGV4PHRoaXMudG9rZW5zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdLmlzVmFsdWVUb2tlbigpKSB7Ly90aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvKlxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXG4gICAgICAgICkpO1xuICAgICB9Ki9cblxuICAgICB2YWx1ZVRva2Vucygpe3JldHVybiAvKG51bWJlcnx2YXJpYWJsZSkvfVxuXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKHRva2VuID0+IHtcbiAgICAgICAgICAgIGlmICghKHRva2VuIGluc3RhbmNlb2YgVG9rZW4pKXtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJmdHlndWJobmltcG9cIilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IG1hcCA9IG5ldyBTZXQodGhpcy5tYXBQYXJlbkluZGV4ZXMoKS5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pKTtcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gIW1hcC5oYXMoaWR4KSk7XG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggLSAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKSAmJlxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4ICsgMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKClcbiAgICAgICAgICAgICk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbnVtTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udHlwZT09PSdudW1iZXInJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbClcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICBcbiAgICAgICAgY29uc3QgYXJyID0gW1xuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcbiAgICAgICAgXG4gICAgICAgIHRoaXMuSURwYXJlbnRoZXNlcyh0aGlzLnRva2VucylcbiAgICB9XG5cblxuICAgIGNvbm5lY3RBbmRDb21iaW5lKGFycil7XG4gICAgICAgIGNvbnN0IGluZGV4ZXM9W11cblxuICAgICAgICBhcnIuc29ydCgoYSwgYikgPT4gYlswXSAtIGFbMF0pLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgaW5kZXhlcy5wdXNoKHtzdGFydDogZWxbMF0sZW5kOiBlbFtlbC5sZW5ndGggLSAxXX0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGluZGV4ZXMuZm9yRWFjaChpbmRleCA9PiB7XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBOdW1iZXIodGhpcy50b2tlbnNbaW5kZXguc3RhcnRdLnZhbHVlKTtcbiAgICAgICAgICAgIGNvbnN0IGlzVmFyPXRoaXMudG9rZW5zLnNsaWNlKGluZGV4LnN0YXJ0LGluZGV4LmVuZCsxKS5maW5kKHRva2VuPT4gdG9rZW4udHlwZS5pbmNsdWRlcygndmFyJykpO1xuICAgICAgICAgICAgZm9yIChsZXQgaT1pbmRleC5zdGFydCsxO2k8PWluZGV4LmVuZDtpKyspe1xuICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLnRva2Vuc1tpXS52YWx1ZSArIHZhbHVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2lmIChpc1Zhcil1cGRhdGVkVG9rZW4udmFyaWFibGU9aXNWYXIudmFyaWFibGVcbiAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4LnN0YXJ0XSA9IG5ldyBUb2tlbih2YWx1ZSxpc1Zhcj8udmFyaWFibGUpO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LnN0YXJ0KzEsIGluZGV4LmVuZCAtIGluZGV4LnN0YXJ0KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW4udHlwZSkpIFxuICAgICAgICAgICAgJiYgIXRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKVxuICAgICAgICApXG4gICAgICAgIHtyZXR1cm4gSW5maW5pdHl9XG4gICAgfVxuICAgIGluc2VydFRva2VucyhzdGFydCwgbGVuZ3RoLCBvYmplY3RzKSB7XG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzKSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XG4gICAgfVxuICAgIHJlY29uc3RydWN0KHRva2Vucyl7XG4gICAgICAgIGlmICghdG9rZW5zKXt0b2tlbnM9dGhpcy50b2tlbnM7fVxuICAgICAgICBjb25zdCBhZGRQbHVzSW5kZXhlcz10aGlzLmluZGV4ZXNUb0FkZFBsdXModG9rZW5zKTtcbiAgICAgICAgbGV0IG1hdGggPSBcIlwiO1xuICAgICAgICBmb3IgKGxldCBpPTA7aTx0b2tlbnMubGVuZ3RoO2krKyl7XG4gICAgICAgICAgICBsZXQgdGVtcDtcbiAgICAgICAgICAgIG1hdGgrPWFkZFBsdXNJbmRleGVzLmluY2x1ZGVzKGkpPycrJzonJztcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0/LnZhbHVlPT09XCIoXCImJnRva2Vuc1t0b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi5pZCA9PT0gdG9rZW5zW2ldLmlkJiZ0b2tlbnNbaW5kZXgrMV0pKzFdLnZhbHVlPT09XCIvXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3dpdGNoICh0b2tlbnNbaV0/LnR5cGUpe1xuICAgICAgICAgICAgICAgIGNhc2UgXCJudW1iZXJcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwicG93ZXJWYXJpYWJsZVwiOlxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldIGluc3RhbmNlb2YgVG9rZW4pXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0/LnRvU3RyaW5nTGF0ZXgoKVxuICAgICAgICAgICAgICAgICAgICAvL3RlbXA9cm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgLy9tYXRoKz10ZW1wKyhpKzE8dG9rZW5zLmxlbmd0aCYmLyhmcmFjKS8udGVzdCh0b2tlbnNbaSsxXS52YWx1ZSk/XCIrXCI6XCJcIik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJwYXJlblwiOlxuICAgICAgICAgICAgICAgICAgICB0ZW1wPXRva2Vuc1t0aGlzLmZpbmRQYXJlbkluZGV4KHRva2Vuc1tpXS5pZCkub3Blbi0xXVxuICAgICAgICAgICAgICAgICAgICBpZiAodGVtcCYmIFxuICAgICAgICAgICAgICAgICAgICAgICAgKChjdXJseUJyYWNrZXRzUmVnZXgudGVzdCh0ZW1wLnZhbHVlKSkgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAoL1xcKS8udGVzdCh0ZW1wLnZhbHVlKSAmJiBjdXJseUJyYWNrZXRzUmVnZXgudGVzdCh0b2tlbnNbdGhpcy5maW5kUGFyZW5JbmRleCh0ZW1wLmlkKS5vcGVuIC0gMV0udmFsdWUpKSkpIFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoICs9IHRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCBcIntcIikucmVwbGFjZSgvXFwpLywgXCJ9XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy9lbHNlIGlmIChpPjAmJnRva2Vuc1tpXS52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbaS0xXT8udmFsdWU9PT1cIilcIil7bWF0aCs9XCIrXCJ9XG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBcIm9wZXJhdG9yXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlICE9PSBcIi9cIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0gaW5zdGFuY2VvZiBUb2tlbilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0udG9TdHJpbmdMYXRleCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJwb3dlclZhcmlhYmxlXCI6XG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPSsodG9rZW5zW2ldLnZhbHVlIT09MT90b2tlbnNbaV0udmFsdWU6XCJcIikrdG9rZW5zW2ldLnZhcmlhYmxlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHRva2Vuc1tpXS52YWx1ZSE9PTE/dG9rZW5zW2ldLnZhbHVlOlwiXCIpK3Rva2Vuc1tpXS52YXJpYWJsZStgXnske3Rva2Vuc1tpXS5wb3d9fWA7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrOyovXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2codGhpcy50b2tlbnMpXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCB0b2tlbiB0eXBlIGdpdmVuIHRvIHJlY29uc3RydWN0OiB0eXBlICR7dG9rZW5zW2ldPy50eXBlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRoXG4gICAgfVxuICAgIFxuICAgIGN1cmx5QnJhY2tldElEcyh0b2tlbnMpe1xuICAgICAgICBpZiAodG9rZW5zPT09dW5kZWZpbmVkKXt0b2tlbnM9dGhpcy50b2tlbnM7fVxuICAgICAgICBjb25zdCBtYXRjaD0vKFxcXnxcXCl8ZnJhY3xiaW5vbSkvXG4gICAgICAgIGNvbnN0IG1hcD10b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW4saW5kZXgpPT4ge1xuICAgICAgICAgICAgaW5kZXg+MCYmdG9rZW4udmFsdWU9PT0nKCcmJnRva2Vuc1tpbmRleC0xXS5tYXRjaChtYXRjaCk/XG4gICAgICAgIHRoaXMuZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLGluZGV4LHRva2Vucyk6bnVsbFxuICAgICAgICB9KVxuICAgICAgICAuZmlsdGVyKGl0ZW09Pml0ZW0hPT1udWxsKVxuICAgICAgICAvLy5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pO1xuICAgICAgICBcbiAgICB9XG5cbiAgICBpbmRleGVzVG9BZGRQbHVzKHRva2Vucyl7XG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcbiAgICB9XG4gICAgXG4gICAgZmluZFBhcmVuSW5kZXgoaWQsaW5kZXgsdG9rZW5zKXtcbiAgICAgICAgaWYgKHRva2Vucz09PXVuZGVmaW5lZCl7dG9rZW5zPXRoaXMudG9rZW5zO31cbiAgICAgICAgdHJ5e1xuICAgICAgICAgICAgaWQ9aWQ/aWQ6dG9rZW5zW2luZGV4XS5pZDtcbiAgICAgICAgICAgIGNvbnN0IG9wZW49dG9rZW5zLmZpbmRJbmRleChcbiAgICAgICAgICAgICAgICB0b2tlbj0+dG9rZW4udmFsdWU9PT1cIihcIlxuICAgICAgICAgICAgICAgICYmdG9rZW4uaWQ9PT1pZFxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgY29uc3QgY2xvc2U9dG9rZW5zLmZpbmRMYXN0SW5kZXgoXG4gICAgICAgICAgICAgICAgdG9rZW49PnRva2VuLnZhbHVlPT09XCIpXCJcbiAgICAgICAgICAgICAgICAmJnRva2VuLmlkPT09aWRcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIHJldHVybntvcGVuOiBvcGVuLGNsb3NlOiBjbG9zZSxpZDppZH1cbiAgICAgICAgfVxuICAgICAgICBjYXRjaChlKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRva2VuQ29tcGFyZShjb21wYXJlLCB2YWx1ZSwgdG9rZW4sIG5leHRUb2tlbikge1xuICAgICAgICB2YWx1ZSA9IHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxuICAgICAgICApO1xuICAgIH1cblxuICAgIElEcGFyZW50aGVzZXMoKSB7XG4gICAgICAgIGxldCB0b2tlbnM9dGhpcy50b2tlbnNcbiAgICAgICAgbGV0IGJyYWNrZXRzID0gMCwgbGV2ZWxDb3VudCA9IHt9O1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWxldmVsQ291bnRbYnJhY2tldHNdKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldmVsQ291bnRbYnJhY2tldHNdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10rKztcbiAgICAgICAgICAgICAgICB0b2tlbnNbaV0uaWQgPSBicmFja2V0cyArIFwiLlwiICsgSUQ7XG4gICAgICAgICAgICAgICAgYnJhY2tldHMrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgYnJhY2tldHMtLTtcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XG4gICAgICAgICAgICAgICAgLy8gUmVhc3NpZ24gdGhlIG9iamVjdCB3aXRoIHRoZSBuZXcgaWQgdG8gZW5zdXJlIHBlcnNpc3RlbmNlXG4gICAgICAgICAgICAgICAgdG9rZW5zW2ldLmlkID0gYnJhY2tldHMgKyBcIi5cIitJRDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoYnJhY2tldHMhPT0wKVxuICAgICAgICB7XG4gICAgICAgICAgICAvL3Rocm93IG5ldyBFcnJvciAoXCJVbm1hdGNoZWQgb3BlbmluZyBicmFja2V0KHMpIGVyciByYXRlOiBcIiticmFja2V0cylcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zO1xuICAgIH1cbn1cblxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnIpIHtcbiAgICBsZXQgcmVzdWx0ID0gW107XG4gICAgbGV0IHN0YWNrID0gQXJyYXkuaXNBcnJheShhcnIpID8gWy4uLmFycl0gOiBbYXJyXTtcblxuICAgIHdoaWxlIChzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgY29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShuZXh0KSkge1xuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5uZXh0KTsgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChuZXh0KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcbn1cblxuXG5cbmNsYXNzIFRva2Vue1xuICAgIHR5cGU7XG4gICAgdmFsdWU7XG4gICAgdmFyaWFibGU7XG4gICAgbW9kaWZpZXI7XG4gICAgaWQ7XG4gICAgXG4gICAgY29uc3RydWN0b3IodmFsdWUsdmFyaWFibGUpe1xuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xuICAgICAgICB0aGlzLnZhcmlhYmxlPXZhcmlhYmxlO1xuICAgICAgICB0aGlzLnNldFR5cGUoKTtcbiAgICB9XG4gICAgZ2V0ZnVsbFR5cGUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudHlwZVxuICAgIH1cbiAgICBzZXRUeXBlKCl7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnKXtcbiAgICAgICAgICAgIHRoaXMudHlwZT10aGlzLnZhbHVlLm1hdGNoKC9bKCldLyk/J3BhcmVuJzonb3BlcmF0b3InO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudHlwZT10aGlzLnZhcmlhYmxlPyd2YXJpYWJsZSc6J251bWJlcic7XG4gICAgfVxuICAgIGlzU3RyaW5nKCl7cmV0dXJuIHRoaXMudHlwZT09PSdwYXJlbid8fHRoaXMudHlwZT09PSdvcGVyYXRvcid9XG4gICAgaXNWYWx1ZVRva2VuKCl7cmV0dXJuIHRoaXMudHlwZT09PSd2YXJpYWJsZSd8fHRoaXMudHlwZT09PSdudW1iZXInfVxuXG4gICAgdG9TdHJpbmdMYXRleCgpe1xuICAgICAgICBsZXQgc3RyaW5nPScnXG4gICAgICAgIGlmICh0aGlzLmlzU3RyaW5nKCkpXG4gICAgICAgICAgICBzdHJpbmcrPXRoaXMudmFsdWUucmVwbGFjZSgvKFteKl49LystXSkvLFwiXFxcXCQxXCIpLnJlcGxhY2UoL1xcKi9nLFwiXFxcXGNkb3QgXCIpXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0ndmFyaWFibGUnKSBzdHJpbmcrPXRoaXMudG9TdHJpbmdWYXJpYWJsZSgpXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nbnVtYmVyJykgc3RyaW5nKz10aGlzLnZhbHVlO1xuICAgICAgICByZXR1cm4gc3RyaW5nXG4gICAgfVxuICAgIGFmZmVjdGVkT3BlcmF0b3JSYW5nZShkaXJlY3Rpb24pe1xuICAgICAgICBpZih0aGlzLnR5cGUhPT0nb3BlcmF0b3InfHwodGhpcy52YWx1ZS50b1N0cmluZygpKS5tYXRjaCgvKD0pLykpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgaWYoZGlyZWN0aW9uPT09J2xlZnQnJiYhb3BlcmF0b3JTaWRlcy5ib3RoLmluY2x1ZGVzKHRoaXMudmFsdWUpKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICAgIHRvU3RyaW5nVmFyaWFibGUoKXtcbiAgICAgICAgcmV0dXJuICh0aGlzLnZhbHVlIT09MT90aGlzLnZhbHVlOicnKSt0aGlzLnZhcmlhYmxlO1xuICAgIH1cblxufVxuY2xhc3MgUGFyZW57XG4gICAgZGVwdGg7XG4gICAgZGVwdGhJRDtcbiAgICBpZDtcbiAgICBcbiAgICBjb25zdHJ1Y3RvcihkZXB0aCxkZXB0aElEKXtcbiAgICAgICAgdGhpcy5kZXB0aD1kZXB0aDtcbiAgICAgICAgdGhpcy5kZXB0aElEPWRlcHRoSUQ7XG4gICAgICAgIHRoaXMuc2V0SUQoKTtcbiAgICB9XG4gICAgc2V0SUQoKXt0aGlzLmlkPXRoaXMuZGVwdGggKyBcIi5cIiArIHRoaXMuZGVwdGhJRH1cbn1cbmNsYXNzIE1vZGlmaWVye1xuXG59Il19