import { quad, calculateBinom, roundBySettings, degreesToRadians, radiansToDegrees } from "./mathUtilities";
import { expandExpression, curlyBracketsRegex } from "./imVeryLazy";
import { type } from "os";
import { arrToRegexString, regExp } from "./tikzjax/tikzjax";
import { getAllLatexReferences, getAllOperatorReferences, getOperatorsByBracket, getOperatorsByPriority, getOperatorsBySides, hasImplicitMultiplication, searchOperators, searchSymbols } from "./utils/symbols";
import { cp } from "fs";
import { Paren } from "./utils/tokenUtensils";
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
    if (typeof operator === "string" && typeof left?.value !== "number" && getOperatorsBySides('both').includes(operator)) {
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
    let solved = new Token();
    switch (operator) {
        case "Square Root":
            solved.value = Math.pow(right.value, specialChar !== null ? (1) / (specialChar) : 0.5);
            break;
        case "Pow":
            if (left.variable || right.variable) {
                solved.variable = left.variable || left.variable === right.variable ? left.variable : right.variable ? right.variable : "";
                solved.pow = 2;
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
            throw new Error("Couldn't identify operator type at praise operator: " + position.operator);
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
    for (let i = 1; i <= 6; i++) {
        let priority = findOperatorIndex(begin, end, tokens, getOperatorsByPriority(i, true));
        if (priority !== -1)
            return priority;
    }
    let priority1 = findOperatorIndex(begin, end, tokens, getOperatorsByPriority(1, true));
    let priority2 = findOperatorIndex(begin, end, tokens, getOperatorsByPriority(2, true));
    let priority3 = findOperatorIndex(begin, end, tokens, getOperatorsByPriority(3, true));
    let priority4 = findOperatorIndex(begin, end, tokens, getOperatorsByPriority(4, true));
    let priority5 = findOperatorIndex(begin, end, tokens, getOperatorsByPriority(5, true));
    let priority6 = findOperatorIndex(begin, end, tokens, getOperatorsByPriority(6, true));
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
            case getOperatorsBySides('both').includes(this.operator):
                this.left = this.applyPosition(tokens, this.index, "left");
                this.right = this.applyPosition(tokens, this.index, "right");
                break;
            case getOperatorsBySides('right').includes(this.operator):
                this.left = { breakChar: this.index };
                this.right = this.applyPosition(tokens, this.index, "right");
                break;
            case getOperatorsBySides('doubleRight').includes(this.operator):
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
        return ((getOperatorsBySides('both').includes(this.operator) && this.left?.multiStep) || this.right?.multiStep) && this.operator === 'Multiplication';
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
function rearrangeEquation(tokens, tokenToisolate) {
}
function isolateMultiplication(tokens, isolatToken) {
    const index = operationsOrder(tokens);
    const Isolated = tokens.tokens.find((token, idx) => idx < index);
    const frac = createFrac(...tokens.tokens.slice(index + 1, tokens.tokens.length), new Token(Isolated.value));
    Isolated.value = 1;
    tokens.insertTokens(index + 1, tokens.tokens.length - index + 1, frac);
}
function createFrac(nominator, denominator) {
    return [new Token('frac'), new Token('('), nominator, new Token(')'), new Token('('), denominator, new Token(')')];
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
function rearrangeForIsolation(tokens, isolationGoal) {
    if (tokens.length <= 1)
        return tokens;
    const eqIndex = tokens.tokens.findIndex(t => t.value === 'Equals');
    if (eqIndex === -1)
        throw new Error("No 'Equals' operator found in tokens");
    const switchDirection = false; // Future logic to determine direction
    const isolationGoalIndices = tokens.tokens
        .map((t, idx) => (t.type === isolationGoal.type && t.variable === isolationGoal.value ? idx : null))
        .filter(idx => idx !== null);
    const otherIndices = tokens.tokens
        .map((_, idx) => (!isolationGoalIndices.includes(idx) && idx !== eqIndex ? idx : null))
        .filter(idx => idx !== null);
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
export class MathPraiser {
    input = "";
    tokens = [];
    solution = "";
    mathInfo = new MathInfo();
    i = 0;
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
        this.i++;
        if (this.i > 10) {
            return this.finalReturn();
        }
        this.getRedyforNewRond();
        //const overview=this.tokens.getOverview()
        const praisingMethod = new PraisingMethod(this.tokens.tokens);
        if (praisingMethod.isThereOperatorOtherThanEquals()) {
            const position = new Position(this.tokens);
            this.addDebugInfo("Parsed expression", JSON.stringify(position, null, 1));
            if (position === null && this.tokens.tokens.length > 1) {
                //this.addDebugInfo("parse(tokens)",parse(this.tokens.tokens))
                return "the ****";
                // return solution(tokens);
            }
            /*
            else if (position.index === null){
                return this.finalReturn();
            }*/
            if (position.checkFrac() || position.checkMultiStep()) {
                expandExpression(this.tokens, position);
                this.mathInfo.addSolutionInfo(this.tokens.reconstruct(this.tokens.tokens));
                return this.controller();
            }
            this.useParse(position);
        }
        if (praisingMethod.isMultiplicationIsolate()) {
            this.useIsolat(praisingMethod);
        }
        const toIsolate = praisingMethod.isAnythingToIsolate();
        if (toIsolate) {
            rearrangeForIsolation(this.tokens, toIsolate);
            return this.controller();
        }
        //if (solved === null||typeof solved==="string") {return solved; }
        return this.finalReturn(); //this.tokens.tokens.length>1?this.controller():this.finalReturn();
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
        const filterByType = (type) => this.tokens.tokens.filter(token => token.type === type);
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
class Tokens {
    tokens = [];
    constructor(math) {
        this.tokenize(math);
    }
    tokenize(math) {
        //latexOperators.push(String.raw`[*/^=\+\-\(\)]`)
        //const operators=arrToRegexString(latexOperators)
        const operators = arrToRegexString(getAllLatexReferences());
        for (let i = 0; i < math.length; i++) {
            let match = math.slice(i).match(regExp('^' + operators));
            if (!!match) {
                this.tokens.push(new Token(match[0]));
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
        return index >= 0 + margin && index < this.tokens.length - margin;
    }
    implicitMultiplicationMap() {
        const testDoubleRight = (index) => {
            if (!this.validateIndex(index))
                return false;
            const idx = this.findParenIndex(null, index).open;
            return this.tokens[index + 1]?.value === '(' && (idx === 0 || !getOperatorsBySides('doubleRight').includes(this.tokens[idx - 1]?.value));
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
            .filter(item => item !== null);
        return map;
    }
    validatePlusMinus() {
        const map = this.tokens.map((token, index) => token.value === 'Plus' || token.value === 'Minus' ? index : null).filter(index => index !== null);
        map.forEach(index => {
            index = this.validateIndex(index, 1) && this.tokens[index - 1].type === 'operator' || this.tokens[index + 1].type === 'operator' ? null : index;
        });
        map.reverse().forEach(index => {
            const value = this.tokens[index].value === 'Plus' ? 1 : -1;
            this.tokens[index + 1].value *= value;
            this.tokens.splice(index, 1);
        });
    }
    postProcessTokens() {
        /*rules to abid by:
        1. +- If part of the number they are absorbed into the number
        */
        this.IDparentheses();
        const map = this.tokens.map((token, index) => (token.isValueToken()) ? index : null).filter(item => item !== null);
        const arr = findConsecutiveSequences(map);
        this.connectAndCombine(arr);
        this.validatePlusMinus();
        const parenMap = this.implicitMultiplicationMap();
        parenMap.sort((a, b) => b - a)
            .forEach(value => {
            this.tokens.splice(value, 0, new Token('*'));
        });
        const mapPow = this.tokens.map((token, index) => token.value === 'Pow' ? index : null).filter(item => item !== null);
        console.log(mapPow);
        mapPow.forEach(index => {
            console.log(index, new Position(this, index));
            const [leftBreak, length] = [position.left.breakChar, position.right.breakChar - position.left.breakChar];
            this.tokens.insertTokens(leftBreak, length, solved);
        });
    }
    mapParenIndexes() {
        return this.tokens
            .map((token, index) => token.value === "(" ? this.findParenIndex(undefined, index) : null)
            .filter(item => item !== null);
    }
    filterParenIndexesForRemovael() {
        return this.mapParenIndexes()
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
        }).flatMap(({ open, close }) => [open, close]);
    }
    /*
    findSimilarSuccessor(tokens){
        return this.tokens.findIndex((token, index) =>
                ((tokens[index + 2]?.type !== "operator"&&tokens[index -1]?.type !== "operator")
                &&(this.tokenCompare("type",this.valueTokens(), token, tokens[index + 1]))
        ));
     }*/
    connectNearbyTokens() {
        this.tokens.forEach(token => {
            if (!(token instanceof Token)) {
                throw new Error("ftygubhnimpo");
            }
        });
        const map = new Set(this.filterParenIndexesForRemovael());
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
                    const p1 = this.findParenIndex(undefined, index, tokens);
                    const p2 = this.findParenIndex(undefined, p1.close + 1, tokens);
                    map.push(p1, p2);
                }
                else if (index > 0 && rightBrackets.includes(prevToken)) {
                    map.push(this.findParenIndex(undefined, index, tokens));
                }
            }
            else if (token.value === ')' && bothBrackets.includes(nextToken)) {
                map.push(this.findParenIndex(undefined, index, tokens));
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
                tokens[i].id = new Paren(brackets, ID); // + "." + ;
                brackets++;
                continue;
            }
            if (tokens[i].value === ")") {
                brackets--;
                let ID = levelCount[brackets] - 1;
                // Reassign the object with the new id to ensure persistence
                tokens[i].id = new Paren(brackets, ID); //brackets + "."+ID;
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
export class Token {
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
        if (this.type === 'operator') {
            this.value = searchOperators(this.value)?.name;
        }
        // if (!this.value){throw new Error('wtf Value was undefined at token insurProperFormatting')}
    }
    getId() { return this.id.id; }
    ;
    getLatexSymbol() { return searchSymbols(this.value)?.latex; }
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
            string += this.getLatexSymbol(this.value);
        if (this.type === 'variable')
            string += this.toStringVariable();
        if (this.type === 'number')
            string += this.value;
        return string;
    }
    affectedOperatorRange(direction) {
        if (this.type !== 'operator' || this.value === 'Equals')
            return false;
        if (direction === 'left' && !getOperatorsBySides('both').includes(this.operator))
            return false;
        return true;
    }
    toStringVariable() {
        return (this.value !== 1 ? this.value : '') + this.variable;
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
        return this.tokens.some(t => t.type === 'variable' && t.value > 1);
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
        if (!whatToIsolat || (befor?.size < 2 && after?.size < 2))
            return;
        return { overviewSideOne: befor, overviewSideTwo: after, ...whatToIsolat };
    }
    howToIsolate(overviewSideOne, overviewSideTwo, isolationGool) {
        const isolationType = isolationGool.splt(':');
        //if (){}
    }
    whatToIsolat() {
        // i need to add pows after
        // for know im going on the oshomshin that thr is only one var
        if (this.variables?.length < 1)
            return;
        return { type: 'variable', value: this.variables[0] };
    }
    isOverviewToisolat(overview) {
    }
    isImbalance(overview) {
        overview.size > 1;
    }
    equalsIndexIfAny() {
        const eqIndex = this.tokens.map((t, idx) => t.value === 'Equals' ? idx : null).filter(m => m !== null);
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
        const overview = new Map();
        tokens.forEach(token => {
            //if (!token.isValueToken()) {return;}
            const key = token.getFullTokenID();
            //Equals
            if (!overview.has(key)) {
                const entry = {
                    type: token.type,
                    count: 0
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
class Modifier {
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzFCLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsd0JBQXdCLEVBQUUscUJBQXFCLEVBQUUsc0JBQXNCLEVBQUUsbUJBQW1CLEVBQUUseUJBQXlCLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2pOLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDeEIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzlDLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFHO0lB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TSxHQUFHLEdBQUcsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFBO1lBQ2xDLFFBQVE7WUFDUixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixNQUFNLEtBQUssR0FBRztvQkFDVixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLEtBQUssRUFBRSxDQUFDO2lCQUNYLENBQUM7Z0JBQ0YsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO29CQUM1QixLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0IsQ0FBQztZQUNELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFFBQVEsQ0FBQSxDQUFBLGdDQUFnQztJQUNuRCxDQUFDO0NBQ0o7QUFJRCxNQUFNLFFBQVE7Q0FFYiIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlc30gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi9pbVZlcnlMYXp5XCI7XG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCByZWdFeHAgfSBmcm9tIFwiLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7IGdldEFsbExhdGV4UmVmZXJlbmNlcywgZ2V0QWxsT3BlcmF0b3JSZWZlcmVuY2VzLCBnZXRPcGVyYXRvcnNCeUJyYWNrZXQsIGdldE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5U2lkZXMsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIHNlYXJjaE9wZXJhdG9ycywgc2VhcmNoU3ltYm9scyB9IGZyb20gXCIuL3V0aWxzL3N5bWJvbHNcIjtcbmltcG9ydCB7IGNwIH0gZnJvbSBcImZzXCI7XG5pbXBvcnQgeyBQYXJlbiB9IGZyb20gXCIuL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcbmNvbnN0IGdyZWVrTGV0dGVycyA9IFtcbiAgICAnQWxwaGEnLCdhbHBoYScsICdCZXRhJywgJ0dhbW1hJywgJ0RlbHRhJywgJ0Vwc2lsb24nLCAnWmV0YScsICdFdGEnLCAnVGhldGEnLCBcbiAgICAnSW90YScsICdLYXBwYScsICdMYW1iZGEnLCAnTXUnLCdtdScsICdOdScsICdYaScsICdPbWljcm9uJywgJ1BpJywgJ1JobycsIFxuICAgICdTaWdtYScsICdUYXUnLCAnVXBzaWxvbicsICdQaGknLCAnQ2hpJywgJ1BzaScsICdPbWVnYSdcbl07XG4vKmNvbnN0IGxhdGV4T3BlcmF0b3JzPVtcbiAgICAndGFuJywgJ3NpbicsICdjb3MnLCAnYmlub20nLCAnZnJhYycsICdhc2luJywgJ2Fjb3MnLCBcbiAgICAnYXRhbicsICdhcmNjb3MnLCAnYXJjc2luJywgJ2FyY3RhbicsICdjZG90Jywnc3FydCdcbl0qL1xuXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKGFycikge1xuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xuICAgIGxldCBzdGFydCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XG4gICAgICAgICAgICBpZiAoaSAtIHN0YXJ0ID4gMSkge1xuICAgICAgICAgICAgICAgIHNlcXVlbmNlcy5wdXNoKGFyci5zbGljZShzdGFydCwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhcnQgPSBpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzZXF1ZW5jZXM7XG59XG5cblxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcbiAgICByaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoOiBbXCJzcXJ0XCJdLFxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxuICAgIFJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoOiBbXCJzaW5cIiwgXCJjb3NcIiwgXCJ0YW5cIiwgXCJhc2luXCIsIFwiYWNvc1wiLCBcImF0YW5cIiwgXCJhcmNzaW5cIiwgXCJhcmNjb3NcIiwgXCJhcmN0YW5cIl0sXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cbn07XG5cbmV4cG9ydCBjbGFzcyBNYXRoSW5mb3tcbiAgICBkZWJ1Z0luZm89XCJcIjtcbiAgICBzb2x1dGlvbkluZm89W107XG4gICAgbWF0aEluZm89W11cbiAgICBncmFwaD1cIlwiO1xuICAgIGFkZEdyYXBoSW5mbyh2YWx1ZSl7XG4gICAgICAgIHRoaXMuZ3JhcGgrPXZhbHVlO1xuICAgIH1cbiAgICBhZGREZWJ1Z0luZm8obXNnLCB2YWx1ZSl7XG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUpOnZhbHVlKSsgXCJcXG4gXCI7XG4gICAgfVxuICAgIGFkZFNvbHV0aW9uSW5mbyhtZXMpe1xuICAgICAgICB0aGlzLnNvbHV0aW9uSW5mby5wdXNoKG1lcyk7XG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiU29sdmVkXCIsbWVzKTtcbiAgICB9XG4gICAgYWRkTWF0aEluZm8odG9rZW5zKXtcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZE1hdGg9dG9rZW5zLnJlY29uc3RydWN0KClcbiAgICAgICAgdGhpcy5tYXRoSW5mby5wdXNoKHJlY29uc3RydWN0ZWRNYXRoKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlJlY29uc3RydWN0ZWQgbWF0aFwiLHJlY29uc3RydWN0ZWRNYXRoKTtcbiAgICB9XG5cbiAgICBhZGRTb2x1dGlvbih0b2tlbnMscG9zaXRpb24sc29sdXRpb24pe1xuICAgICAgICBzb2x1dGlvbj10b2tlbnMucmVjb25zdHJ1Y3QoW3NvbHV0aW9uXSk7XG4gICAgICAgIGNvbnN0IGxlZnQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24uaW5kZXgpKTtcbiAgICAgICAgY29uc3QgcmlnaHQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24uaW5kZXgrMSxwb3NpdGlvbi5yaWdodC5icmVha0NoYXIsKSk7XG5cbiAgICAgICAgc3dpdGNoICh0cnVlKXtcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aEJ1dFJpZ2h0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3J9IHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZSgvXFwqL2csIFwiXFxcXGNkb3RcIil9ICR7cmlnaHR9ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnNwZWNpYWwuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249IGBcXFxcZnJhY3ske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgXFxcXHNxcnR7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLlJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvcn0gKCR7cmlnaHR9KSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5kb3VibGVSaWdodEJ1dEJyYWNrZXQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoXCIvXCIsXCJmcmFjXCIpfXske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFkZFNvbHV0aW9uSW5mbyhzb2x1dGlvbik7XG4gICAgfVxufVxuXG4vKlxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XG4gICAgaWYgKCEodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSl7cmV0dXJuIHZhbHVlfVxuICAgIGlmICh2YWx1ZT09PVwiK1wiKXtyZXR1cm4gMH1cbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QodmFsdWUpKXtyZXR1cm4gMX1cbiAgICBpZigvWyhbXS8udGVzdCh2YWx1ZVswXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMSl9XG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxuICAgIGZvciAobGV0IGkgPSAwOyBpPHZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVbaV0gPT09IFwic3RyaW5nXCIgJiYgL1soKVtcXF1dLy50ZXN0KHZhbHVlW2ldKSkge1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcbiAgICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xuICAgIHJldHVybiBpc05hTihudW0pID8gdmFsdWUubGVuZ3RoPjA/dmFsdWU6MCA6IG51bTtcbn0qL1xuXG5mdW5jdGlvbiBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcixsZWZ0LHJpZ2h0KXtcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIGxlZnQ/LnZhbHVlIT09XCJudW1iZXJcIiYmZ2V0T3BlcmF0b3JzQnlTaWRlcygnYm90aCcpLmluY2x1ZGVzKG9wZXJhdG9yKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMZWZ0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQ/LnZhbHVlIT09XCJudW1iZXJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSaWdodCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xuICAgIH1cbn1cblxuXG5cbmZ1bmN0aW9uIHBhcnNlKHBvc2l0aW9uKSB7XG4gICAgbGV0IHsgb3BlcmF0b3Isc3BlY2lhbENoYXIsIGxlZnQscmlnaHR9ID0gcG9zaXRpb247XG4gICAgXG4gICAgbGVmdD1sZWZ0Py50b2tlbnNcbiAgICByaWdodD1yaWdodC50b2tlbnNcbiAgICAvL2NvbnNvbGUubG9nKCd0aGlzLmxlZnQsdGhpcy5yaWdodCcsbGVmdCxyaWdodClcbiAgICBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcixsZWZ0LHJpZ2h0KTtcbiAgICBcbiAgICBsZXQgc29sdmVkPW5ldyBUb2tlbigpO1xuICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcbiAgICAgICAgY2FzZSBcIlNxdWFyZSBSb290XCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiUG93XCI6XG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZXx8cmlnaHQudmFyaWFibGUpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV8fGxlZnQudmFyaWFibGU9PT1yaWdodC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlP3JpZ2h0LnZhcmlhYmxlOlwiXCI7XG4gICAgICAgICAgICAgICAgc29sdmVkLnBvdz0yXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiRnJhY3Rpb25cIjpcbiAgICAgICAgY2FzZSBcIi9cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChsZWZ0LnZhbHVlKS8ocmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJNdWx0aXBsaWNhdGlvblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAqIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgaGFuZGxlVnJpYWJsZXMobGVmdCwgcmlnaHQsc29sdmVkKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiK1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSArIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiTWludXNcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgLSByaWdodC52YWx1ZTtcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImJpbm9tXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBjYWxjdWxhdGVCaW5vbShsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwic2luXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImNvc1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5jb3MoZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInRhblwiOlxuICAgICAgICAgICAgaWYgKHJpZ2h0Pj05MCl7dGhyb3cgbmV3IEVycm9yKFwidGFuIE11c3QgYmUgc21hbGxlciB0aGFuIDkwXCIpO31cbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLnRhbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhc2luXCI6XG4gICAgICAgIGNhc2UgXCJhcmNzaW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hc2luKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImFjb3NcIjpcbiAgICAgICAgY2FzZSBcImFyY2Nvc1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFjb3MocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYXRhblwiOlxuICAgICAgICBjYXNlIFwiYXJjdGFuXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbihyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBpZGVudGlmeSBvcGVyYXRvciB0eXBlIGF0IHByYWlzZSBvcGVyYXRvcjogXCIrcG9zaXRpb24ub3BlcmF0b3IpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdCwgcmlnaHQsIHNvbHZlZCkge1xuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSAmJiBsZWZ0LnZhcmlhYmxlICE9PSByaWdodC52YXJpYWJsZSkge1xuICAgICAgICAgICAgLy8gS2VlcCB0aGVtIHNlcGFyYXRlIHNpbmNlIHRoZXkgaGF2ZSBkaWZmZXJlbnQgdmFyaWFibGVzXG4gICAgICAgICAgICBzb2x2ZWQudGVybXMgPSBbXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogbGVmdC52YXJpYWJsZSwgcG93OiBsZWZ0LnBvdyB8fCAxLCB2YWx1ZTogbGVmdC52YWx1ZSB8fCAxIH0sXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogcmlnaHQudmFyaWFibGUsIHBvdzogcmlnaHQucG93IHx8IDEsIHZhbHVlOiByaWdodC52YWx1ZSB8fCAxIH1cbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaWZmZXJlbnQgdmFyaWFibGUgYmFzZXMgYXQgcG93ZXIgbXVsdGlwbGljYXRpb24uIEkgZGlkbid0IGdldCB0aGVyZSB5ZXRcIilcbiAgICAgICAgfVxuICAgIFxuICAgICAgICBjb25zdCB2YXJpYWJsZSA9IGxlZnQudmFyaWFibGUgfHwgcmlnaHQudmFyaWFibGU7XG4gICAgICAgIHNvbHZlZC52YXJpYWJsZSA9IHZhcmlhYmxlLmxlbmd0aD4wP3ZhcmlhYmxlOnVuZGVmaW5lZDtcbiAgICAgICAgXG4gICAgICAgIGxldCBwb3cgPSAobGVmdC5wb3cgfHwgMCkgKyAocmlnaHQucG93IHx8IDApO1xuICAgICAgICBwb3c9bGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSYmcG93PT09MCYmIWxlZnQucG93JiYhcmlnaHQucG93PzI6cG93O1xuICAgICAgICBzb2x2ZWQucG93ID0gcG93IHx8IHVuZGVmaW5lZDtcbiAgICAgICAgXG5cbiAgICAgICAgLy8gUnVsZSAzOiBIYW5kbGUgbXVsdGlwbGljYXRpb24gb2YgY29uc3RhbnRzXG4gICAgICAgIGNvbnN0IGxlZnRWYWx1ZSA9IGxlZnQudmFsdWUgfHwgMTtcbiAgICAgICAgY29uc3QgcmlnaHRWYWx1ZSA9IHJpZ2h0LnZhbHVlIHx8IDE7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gbGVmdFZhbHVlICogcmlnaHRWYWx1ZTtcbiAgICAgICAgLy8gSWYgdGhlcmUncyBubyB2YXJpYWJsZSwgYXNzaWduIHRoZSByZXN1bHQgYXMgYSBjb25zdGFudFxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgZnVuY3Rpb24gaGFuZGxlVnJpYWJsZXMobGVmdCxyaWdodCxzb2x2ZWQpe1xuICAgICAgICBsZXQgaGFuZGxlZD17VmFyOm51bGwsUG93Om51bGx9O1xuICAgICAgICBpZiAoIWxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7XG4gICAgICAgICAgICByZXR1cm4gO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwb3NpdGlvbi5vcGVyYXRvcj09PScqJyl7cmV0dXJuIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdCxyaWdodCxzb2x2ZWQpfVxuICAgICAgICAvL2NvbnNvbGUubG9nKGxlZnQudmFyaWFibGUscmlnaHQudmFyaWFibGUpXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVHdvIHZhcmlhYmxlIGVxdWF0aW9ucyBhcmVuJ3QgYWNjZXB0ZWQgeWV0XCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XG4gICAgICAgIC8vc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyXG5cbiAgICAgICAgLypcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV9XG4gICAgICAgIGVsc2UgaWYgKCFsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlfVxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cbiAgICAgICAgKi9cbiAgICB9XG5cblxuICAgIHJldHVybiBzb2x2ZWQ7XG59XG5cbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIHtcbiAgICBmdW5jdGlvbiBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiwgZW5kLCB0b2tlbnMsIHJlZ2V4KSB7XG4gICAgICAgIHdoaWxlIChiZWdpbiA8IGVuZCAmJiBiZWdpbiA8IHRva2Vucy50b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgaW5kZXg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChyZWdleCkge1xuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMudG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vucy50b2tlbnNbaW5kZXggKyAxXS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBiZWdpbiA9IGluZGV4ICsgMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgbGV0IGJlZ2luID0gMCwgZW5kID0gdG9rZW5zLnRva2Vucy5sZW5ndGgsaj0wO1xuICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXG4gICAgbGV0IGNoZWNrZWRJRHMgPSBbXTsgIFxuICAgIGxldCBvcGVyYXRvckZvdW5kID0gZmFsc2U7XG4gICAgd2hpbGUgKCFvcGVyYXRvckZvdW5kJiZqPDIwMCkge1xuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMudG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBqKys7XG4gICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zLnRva2Vuc1tpXS5pZCkpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50SUQgPSB0b2tlbnMuZmluZFBhcmVuSW5kZXgodG9rZW5zLnRva2Vuc1tpXS5pZCk7ICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjdXJyZW50SUQhPT1udWxsJiZpPT09Y3VycmVudElELmNsb3NlKSB7XG4gICAgICAgICAgICAgICAgW2JlZ2luLGVuZF09W2N1cnJlbnRJRC5vcGVuLGN1cnJlbnRJRC5jbG9zZV1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcbiAgICAgICAgICAgIGJlZ2luID0gMDtcbiAgICAgICAgICAgIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgb3BlcmF0b3JGb3VuZCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLGVuZCx0b2tlbnMpIT09LTE7XG5cbiAgICAgICAgLy8gSWYgbm8gb3BlcmF0b3IgaXMgZm91bmQsIG1hcmsgdGhpcyBwYXJlbnRoZXNlcyBwYWlyIGFzIGNoZWNrZWRcbiAgICAgICAgaWYgKCFvcGVyYXRvckZvdW5kKSB7XG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxuICAgICAgICAgICAgY3VycmVudElEID0gbnVsbDsgIFxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChqPj0yMDApe3Rocm93IG5ldyBFcnJvcihcIm9wZXJhdGlvbnNPcmRlciBGYWlsZWQgZXhjZWVkZWQgMjAwIHJldmlzaW9uc1wiKTt9XG5cbiAgICBmb3IgKGxldCBpPTE7aTw9NjtpKyspe1xuICAgICAgICBsZXQgcHJpb3JpdHkgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE9wZXJhdG9yc0J5UHJpb3JpdHkoaSx0cnVlKSk7XG4gICAgICAgIGlmKHByaW9yaXR5IT09LTEpcmV0dXJuIHByaW9yaXR5XG4gICAgfVxuXG4gICAgbGV0IHByaW9yaXR5MSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0T3BlcmF0b3JzQnlQcmlvcml0eSgxLHRydWUpKTtcbiAgICBsZXQgcHJpb3JpdHkyID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5KDIsdHJ1ZSkpO1xuICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE9wZXJhdG9yc0J5UHJpb3JpdHkoMyx0cnVlKSk7XG4gICAgbGV0IHByaW9yaXR5NCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0T3BlcmF0b3JzQnlQcmlvcml0eSg0LHRydWUpKTtcbiAgICBsZXQgcHJpb3JpdHk1ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5KDUsdHJ1ZSkpO1xuICAgIGxldCBwcmlvcml0eTYgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE9wZXJhdG9yc0J5UHJpb3JpdHkoNix0cnVlKSk7XG5cbiAgICByZXR1cm4gW3ByaW9yaXR5MSwgcHJpb3JpdHkyLCBwcmlvcml0eTMsIHByaW9yaXR5NCwgcHJpb3JpdHk1LHByaW9yaXR5Nl0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBQb3NpdGlvbiB7XG4gICAgb3BlcmF0b3I7XG4gICAgaW5kZXg7XG4gICAgdHJhbnNpdGlvbjtcbiAgICBzcGVjaWFsQ2hhcjtcbiAgICBsZWZ0O1xuICAgIHJpZ2h0O1xuICAgIGNvbnN0cnVjdG9yKHRva2VucywgaW5kZXgpe1xuICAgICAgICB0aGlzLmluZGV4PWluZGV4O1xuICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmluZGV4XG4gICAgICAgIHRoaXMucG9zaXRpb24odG9rZW5zKVxuICAgIH1cbiAgICBwb3NpdGlvbih0b2tlbnMpIHtcbiAgICAgICAgdGhpcy5pbmRleCA9ICF0aGlzLmluZGV4PyBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSA6IHRoaXMuaW5kZXg7XG4gICAgICAgIGlmICh0aGlzLmluZGV4ID09PSBudWxsIHx8IHRoaXMuaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9wZXJhdG9yID0gdG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS52YWx1ZTtcbiAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5U2lkZXMoJ2JvdGgnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwibGVmdFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBnZXRPcGVyYXRvcnNCeVNpZGVzKCdyaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHticmVha0NoYXI6IHRoaXMuaW5kZXh9O1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5U2lkZXMoJ2RvdWJsZVJpZ2h0JykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMubGVmdC5icmVha0NoYXI7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMudHJhbnNpdGlvbi0xLFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0LmJyZWFrQ2hhciA9IHRoaXMuaW5kZXg7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodC5icmVha0NoYXIrKHRoaXMucmlnaHQubXVsdGlTdGVwPzE6MCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmF0b3IgJHt0aGlzLm9wZXJhdG9yfSB3YXMgbm90IGFjY291bnRlZCBmb3IsIG9yIGlzIG5vdCB0aGUgdmFsaWQgb3BlcmF0b3JgKTtcbiAgICAgICAgfVxuICAgICAgICAvL2NvbnNvbGUubG9nKHRva2Vucy50b2tlbnMpXG4gICAgICAgIHRoaXMuc3BlY2lhbENoYXI9dG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA/IHRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA6IG51bGw7XG4gICAgfVxuICAgIGFwcGx5UG9zaXRpb24odG9rZW5zLCBpbmRleCwgZGlyZWN0aW9uKSB7XG4gICAgICAgIGxldCBicmVha0NoYXI9aW5kZXhcbiAgICAgICAgbGV0IHRhcmdldDtcbiAgICAgICAgbGV0IG11bHRpU3RlcD1mYWxzZTtcbiAgICAgICAgY29uc3QgaXNMZWZ0ID0gZGlyZWN0aW9uID09PSBcImxlZnRcIjtcbiAgICAgICAgY29uc3QgaW5kZXhNb2RpZmllciA9ICBpc0xlZnQ/LSAxIDogIDE7XG4gICAgICAgIGlmICgoaXNMZWZ0ICYmIGluZGV4IDw9IDApIHx8ICghaXNMZWZ0ICYmIGluZGV4ID49IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkgfHwgIXRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImF0IGFwcGx5UG9zaXRpb246IFxcXCJpbmRleCB3YXNuJ3QgdmFsaWRcXFwiIGluZGV4OiBcIitpbmRleCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xuICAgICAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2UrMTtcbiAgICAgICAgICAgIHRhcmdldCA9IHRva2Vucy50b2tlbnMuc2xpY2UocGFyZW5JbmRleC5vcGVuLCBwYXJlbkluZGV4LmNsb3NlKzEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYnJlYWtDaGFyPWluZGV4K2luZGV4TW9kaWZpZXI7XG4gICAgICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zW2JyZWFrQ2hhcl07XG4gICAgICAgICAgICBicmVha0NoYXIrPWlzTGVmdD8wOjFcbiAgICAgICAgfVxuICAgICAgICAvL2NvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+IDM7XG4gICAgXG4gICAgICAgIGlmICghbXVsdGlTdGVwJiZ0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIil7XG4gICAgICAgICAgICAvL3RhcmdldD10YXJnZXQuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7ZGlyZWN0aW9ufSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zLnRva2Vuc1tpbmRleF0udmFsdWV9XCJgLCk7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgLy9icmVha0NoYXIgPSAoYnJlYWtDaGFyICE9PSBpbmRleCA/IHRhcmdldD8uaW5kZXggOiBicmVha0NoYXIpKyBpbmRleE1vZGlmaWVyKyhpc0xlZnQ/MDoxKTtcbiAgICAgICAgLy9kZWxldGUgdGFyZ2V0LmluZGV4XG4gICAgICAgIFxuICAgICAgICBpZiAodGFyZ2V0Lmxlbmd0aD09PTMpe1xuICAgICAgICAgICAgdGFyZ2V0PXRhcmdldC5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcbiAgICAgICAgfWVsc2UgaWYodGFyZ2V0Lmxlbmd0aD4xKW11bHRpU3RlcD10cnVlXG4gICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0b2tlbnM6IHRhcmdldCxcbiAgICAgICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxuICAgICAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXIsXG4gICAgICAgIH07XG4gICAgfVxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XG4gICAgICAgIHJldHVybiAoKGdldE9wZXJhdG9yc0J5U2lkZXMoJ2JvdGgnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKSYmdGhpcy5sZWZ0Py5tdWx0aVN0ZXApfHx0aGlzLnJpZ2h0Py5tdWx0aVN0ZXApJiZ0aGlzLm9wZXJhdG9yPT09J011bHRpcGxpY2F0aW9uJztcbiAgICB9XG4gICAgaXNMZWZ0VmFyKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmxlZnQubXVsdGlTdGVwP3RoaXMubGVmdC50b2tlbnMuc29tZSh0PT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMubGVmdC50b2tlbnMudHlwZS5pbmNsdWRlcygnYXJpYWJsZScpXG4gICAgfVxuICAgIGlzUmlnaHRWYXIoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMucmlnaHQubXVsdGlTdGVwP3RoaXMucmlnaHQudG9rZW5zLnNvbWUodD0+dC50eXBlPT09J3ZhcmlhYmxlJ3x8dC50eXBlPT09J3Bvd2VyVmFyaWFibGUnKTp0aGlzLnJpZ2h0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcbiAgICB9XG4gICAgY2hlY2tGcmFjKCl7Ly8hdGhpcy5jaGVja011bHRpU3RlcCgpIEkgZG9uJ3Qga25vdyB3aHkgSSBoYWQgdGhpcyBoZXJlXG4gICAgICAgIHJldHVybiAvKGZyYWN8XFwvKS8udGVzdCh0aGlzLm9wZXJhdG9yKSYmKHRoaXMuaXNMZWZ0VmFyKCl8fHRoaXMuaXNSaWdodFZhcigpKVxuICAgIH1cbn1cblxuXG5cbmZ1bmN0aW9uIHJlYXJyYW5nZUVxdWF0aW9uKHRva2Vucyx0b2tlblRvaXNvbGF0ZSl7XG4gICAgXG59XG5mdW5jdGlvbiBpc29sYXRlTXVsdGlwbGljYXRpb24odG9rZW5zLGlzb2xhdFRva2VuKXtcbiAgICBjb25zdCBpbmRleD1vcGVyYXRpb25zT3JkZXIodG9rZW5zKVxuICAgIGNvbnN0IElzb2xhdGVkPXRva2Vucy50b2tlbnMuZmluZCgodG9rZW4sIGlkeCk9PmlkeDxpbmRleClcbiAgICBjb25zdCBmcmFjPWNyZWF0ZUZyYWMoLi4udG9rZW5zLnRva2Vucy5zbGljZShpbmRleCsxLHRva2Vucy50b2tlbnMubGVuZ3RoKSxuZXcgVG9rZW4oSXNvbGF0ZWQudmFsdWUpKVxuICAgIElzb2xhdGVkLnZhbHVlPTE7XG4gICAgdG9rZW5zLmluc2VydFRva2VucyhpbmRleCsxLHRva2Vucy50b2tlbnMubGVuZ3RoLWluZGV4KzEsZnJhYylcbn1cblxuZnVuY3Rpb24gY3JlYXRlRnJhYyhub21pbmF0b3IsZGVub21pbmF0b3Ipe1xuICAgIHJldHVybiBbbmV3IFRva2VuKCdmcmFjJyksbmV3IFRva2VuKCcoJyksbm9taW5hdG9yLG5ldyBUb2tlbignKScpLG5ldyBUb2tlbignKCcpLGRlbm9taW5hdG9yLG5ldyBUb2tlbignKScpXVxufVxuZnVuY3Rpb24gc2ltcGxpZml5KHRva2Vucyl7XG4gICAgaWYgKHRva2Vucy5sZW5ndGg8PTEpe3JldHVybiB0b2tlbnN9XG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUodG9rZW4gPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSkpXG4gICAge1xuICAgICAgICBpKys7XG4gICAgICAgIGxldCBlcWluZGV4PXRva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKTtcbiAgICAgICAgbGV0IE9wZXJhdGlvbkluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW4pID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpO1xuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XG5cbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XG5cbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuLCBpKSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtLnRva2VuLnR5cGU9PT1jdXJyZW50VG9rZW4udHlwZSkgXG4gICAgICAgIC5yZWR1Y2UoKHN1bSwgaXRlbSkgPT4ge1xuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gXCItXCIpID8gLTEgOiAxO1xuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxuICAgICAgICByZXR1cm4gc3VtICsgKGl0ZW0udG9rZW4udmFsdWUgKiBtdWx0aXBsaWVyKTtcbiAgICAgICAgfSwgMCk7IFxuICAgICAgICBcbiAgICAgICAgbmV3VG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXG4gICAgICAgICAgICB0b2tlbi50eXBlICE9PSB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgfHwgXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld1Rva2Vucztcbn1cblxuZnVuY3Rpb24gcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRva2VucywgaXNvbGF0aW9uR29hbCkge1xuICAgIGlmICh0b2tlbnMubGVuZ3RoIDw9IDEpIHJldHVybiB0b2tlbnM7XG5cbiAgICBjb25zdCBlcUluZGV4ID0gdG9rZW5zLnRva2Vucy5maW5kSW5kZXgodCA9PiB0LnZhbHVlID09PSAnRXF1YWxzJyk7XG4gICAgaWYgKGVxSW5kZXggPT09IC0xKSB0aHJvdyBuZXcgRXJyb3IoXCJObyAnRXF1YWxzJyBvcGVyYXRvciBmb3VuZCBpbiB0b2tlbnNcIik7XG5cbiAgICBjb25zdCBzd2l0Y2hEaXJlY3Rpb24gPSBmYWxzZTsgLy8gRnV0dXJlIGxvZ2ljIHRvIGRldGVybWluZSBkaXJlY3Rpb25cbiAgICBjb25zdCBpc29sYXRpb25Hb2FsSW5kaWNlcyA9IHRva2Vucy50b2tlbnNcbiAgICAgICAgLm1hcCgodCwgaWR4KSA9PiAodC50eXBlID09PSBpc29sYXRpb25Hb2FsLnR5cGUgJiYgdC52YXJpYWJsZSA9PT0gaXNvbGF0aW9uR29hbC52YWx1ZSA/IGlkeCA6IG51bGwpKVxuICAgICAgICAuZmlsdGVyKGlkeCA9PiBpZHggIT09IG51bGwpO1xuXG4gICAgY29uc3Qgb3RoZXJJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xuICAgICAgICAubWFwKChfLCBpZHgpID0+ICghaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaWR4KSAmJiBpZHggIT09IGVxSW5kZXggPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcihpZHggPT4gaWR4ICE9PSBudWxsKTtcblxuICAgIC8vIEFkanVzdCBzaWduc1xuICAgIHRva2Vucy50b2tlbnMuZm9yRWFjaCgodG9rZW4sIGkpID0+IHtcbiAgICAgICAgaWYgKChzd2l0Y2hEaXJlY3Rpb24/IGkgPiBlcUluZGV4IDogaSA8IGVxSW5kZXgpICYmIG90aGVySW5kaWNlcy5pbmNsdWRlcyhpKSkge1xuICAgICAgICAgICAgdG9rZW4udmFsdWUgKj0gLTE7XG4gICAgICAgIH0gZWxzZSBpZiAoKHN3aXRjaERpcmVjdGlvbj8gaSA8IGVxSW5kZXggOiBpID4gZXFJbmRleCkgJiYgaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHtcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBTZXBhcmF0ZSBzaWRlc1xuICAgIGNvbnN0IHNpZGUxID0gW107XG4gICAgY29uc3Qgc2lkZTIgPSBbXTtcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuLCBpKSA9PiB7XG4gICAgICAgIGlmIChpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpKSkgc2lkZTEucHVzaCh0b2tlbik7XG4gICAgICAgIGlmIChvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHNpZGUyLnB1c2godG9rZW4pO1xuICAgIH0pO1xuXG4gICAgdG9rZW5zLnRva2VucyA9IHN3aXRjaERpcmVjdGlvblxuICAgICAgICA/IFsuLi5zaWRlMiwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTFdXG4gICAgICAgIDogWy4uLnNpZGUxLCB0b2tlbnMudG9rZW5zW2VxSW5kZXhdLCAuLi5zaWRlMl07XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcbiAgICBpbnB1dD1cIlwiO1xuICAgIHRva2Vucz1bXTtcbiAgICBzb2x1dGlvbj1cIlwiO1xuICAgIG1hdGhJbmZvPW5ldyBNYXRoSW5mbygpO1xuICAgIGk9MDtcbiAgICBjb25zdHJ1Y3RvcihpbnB1dCl7XG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XG4gICAgICAgIHRoaXMucHJvY2Vzc0lucHV0KCk7XG4gICAgICAgIHRoaXMudG9rZW5zPW5ldyBUb2tlbnModGhpcy5pbnB1dCk7XG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiVG9rZW5zIGFmdGVyIHRva2VuaXplXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICB0aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcbiAgICAgICAgdGhpcy5zb2x1dGlvbj10aGlzLmNvbnRyb2xsZXIoKTtcbiAgICB9XG4gICAgZ2V0UmVkeWZvck5ld1JvbmQoKXtcbiAgICAgICAgdGhpcy50b2tlbnMuY29ubmVjdE5lYXJieVRva2VucygpO1xuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZE1hdGhJbmZvKHRoaXMudG9rZW5zKVxuICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKHRoaXMudG9rZW5zLnRva2Vucyx0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoKVxuICAgICAgICB0aGlzLnRva2Vucy5leHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpO1xuICAgIH1cbiAgICBjb250cm9sbGVyKCl7XG4gICAgICAgIHRoaXMuaSsrO1xuICAgICAgICBpZih0aGlzLmk+MTApe3JldHVybiB0aGlzLmZpbmFsUmV0dXJuKCl9XG5cbiAgICAgICAgdGhpcy5nZXRSZWR5Zm9yTmV3Um9uZCgpO1xuICAgICAgICAvL2NvbnN0IG92ZXJ2aWV3PXRoaXMudG9rZW5zLmdldE92ZXJ2aWV3KClcbiAgICAgICAgY29uc3QgcHJhaXNpbmdNZXRob2Q9bmV3IFByYWlzaW5nTWV0aG9kKHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgaWYgKHByYWlzaW5nTWV0aG9kLmlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpKXtcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMudG9rZW5zKTtcbiAgICAgICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUGFyc2VkIGV4cHJlc3Npb25cIiwgSlNPTi5zdHJpbmdpZnkocG9zaXRpb24sIG51bGwsIDEpKTtcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbiA9PT0gbnVsbCYmdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xKXtcbiAgICAgICAgICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKFwicGFyc2UodG9rZW5zKVwiLHBhcnNlKHRoaXMudG9rZW5zLnRva2VucykpXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGhlICoqKipcIlxuICAgICAgICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgZWxzZSBpZiAocG9zaXRpb24uaW5kZXggPT09IG51bGwpe1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCk7XG4gICAgICAgICAgICB9Ki9cbiAgICAgICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWMoKXx8cG9zaXRpb24uY2hlY2tNdWx0aVN0ZXAoKSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyh0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCh0aGlzLnRva2Vucy50b2tlbnMpKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy51c2VQYXJzZShwb3NpdGlvbilcbiAgICAgICAgfVxuICAgICAgICBpZihwcmFpc2luZ01ldGhvZC5pc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpKXtcbiAgICAgICAgICAgIHRoaXMudXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kKVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRvSXNvbGF0ZT1wcmFpc2luZ01ldGhvZC5pc0FueXRoaW5nVG9Jc29sYXRlKClcbiAgICAgICAgaWYgKHRvSXNvbGF0ZSl7XG4gICAgICAgICAgICByZWFycmFuZ2VGb3JJc29sYXRpb24odGhpcy50b2tlbnMsdG9Jc29sYXRlKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgIH0gICBcbiAgICAgICAgLy9pZiAoc29sdmVkID09PSBudWxsfHx0eXBlb2Ygc29sdmVkPT09XCJzdHJpbmdcIikge3JldHVybiBzb2x2ZWQ7IH1cbiAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKS8vdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTtcbiAgICB9XG5cbiAgICB1c2VQYXJzZShwb3NpdGlvbil7XG4gICAgICAgIGNvbnN0IHNvbHZlZCA9IHBhcnNlKHBvc2l0aW9uKTtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzb2x2ZWRcIixzb2x2ZWQpXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXG4gICAgICAgIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbih0aGlzLnRva2Vucyxwb3NpdGlvbixzb2x2ZWQpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICB9XG4gICAgXG4gICAgcHJhaXNpbmdNZXRob2QoKXtcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcbiAgICAgICAgY29uc3QgW251bWJlckluZGV4LHZhcmlhYmxlSW5kZXgscG93SW5kZXhdID0gW2ZpbHRlckJ5VHlwZShcIm51bWJlclwiKSxmaWx0ZXJCeVR5cGUoXCJ2YXJpYWJsZVwiKSxmaWx0ZXJCeVR5cGUoXCJwb3dlclZhcmlhYmxlXCIpXVxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVzZVF1YWRyYXRpYygpXG4gICAgICAgIHJldHVybiB0aGlzLnVzZUlzb2xhdCgpOyovXG4gICAgfVxuXG4gICAgdXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kKXtcbiAgICAgICAgaXNvbGF0ZU11bHRpcGxpY2F0aW9uKHRoaXMudG9rZW5zLG5ldyBUb2tlbihwcmFpc2luZ01ldGhvZC52YXJpYWJsZXNbMF0pKVxuICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICAgICAgLy90aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMoKVxuICAgICAgICAvL1VzZSBwb3NzZXNzaW9uXG4gICAgfVxuXG4gICAgdXNlUXVhZHJhdGljKCl7XG4gICAgICAgIHRoaXMudG9rZW5zLnRva2Vucz1zaW1wbGlmaXkodGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcbiAgICAgICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcXVhZChcbiAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0/LnZhbHVlICB8IDAsXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0/LnZhbHVlIHwgMCxcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0/LnZhbHVlICogLTF8IDAsXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdLnZhcmlhYmxlLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtZXMsdmFsdWUpe1xuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhtZXMsdmFsdWUpXG4gICAgfVxuICAgIHByb2Nlc3NJbnB1dCgpe1xuICAgICAgICB0aGlzLmlucHV0PXRoaXMuaW5wdXRcbiAgICAgICAgLnJlcGxhY2UoLyhNYXRoLnxcXFxcfFxcc3xsZWZ0fHJpZ2h0KS9nLCBcIlwiKSBcbiAgICAgICAgLnJlcGxhY2UoL3svZywgXCIoXCIpXG4gICAgICAgIC5yZXBsYWNlKC99L2csIFwiKVwiKVxuICAgICAgICAvLy5yZXBsYWNlKC8oPzwhXFxcXHxbYS16QS1aXSkodGFufHNpbnxjb3N8Ymlub218ZnJhY3xhc2lufGFjb3N8YXRhbnxhcmNjb3N8YXJjc2lufGFyY3RhbnxjZG90KS9nLCBcIlxcXFwkMVwiKTtcbiAgICB9XG4gICAgZmluYWxSZXR1cm4oKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcbiAgICB9XG59XG5cblxuXG5cblxuY2xhc3MgVG9rZW5ze1xuICAgIHRva2Vucz1bXTtcbiAgICBjb25zdHJ1Y3RvcihtYXRoKXtcbiAgICAgICAgdGhpcy50b2tlbml6ZShtYXRoKTtcbiAgICB9XG4gICAgdG9rZW5pemUobWF0aCl7XG4gICAgICAgIC8vbGF0ZXhPcGVyYXRvcnMucHVzaChTdHJpbmcucmF3YFsqL149XFwrXFwtXFwoXFwpXWApXG4gICAgICAgIC8vY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcobGF0ZXhPcGVyYXRvcnMpXG4gICAgICAgIGNvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGdldEFsbExhdGV4UmVmZXJlbmNlcygpKVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2gocmVnRXhwKCdeJyArIG9wZXJhdG9ycykpO1xuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBUb2tlbihtYXRjaFswXSkpO1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLyppZiAodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS52YWx1ZSA9PT0gXCJzcXJ0XCIgJiYgbWF0aFtpXSA9PT0gXCJbXCIgJiYgaSA8IG1hdGgubGVuZ3RoIC0gMikge1xuICAgICAgICAgICAgICAgIGxldCB0ZW1wPW1hdGguc2xpY2UoaSxpKzErbWF0aC5zbGljZShpKS5zZWFyY2goL1tcXF1dLykpO1xuICAgICAgICAgICAgICAgIGkrPXRlbXAubGVuZ3RoXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0b2tlbnNbdG9rZW5zLmxlbmd0aC0xXSx7c3BlY2lhbENoYXI6IHNhZmVUb051bWJlcih0ZW1wKSx9KVxuICAgICAgICAgICAgfSovXG5cbiAgICAgICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKS8pOy8vKFthLXpBLVpdPykvKTtcbiAgICAgICAgICAgIGlmICghIW1hdGNoKVxuICAgICAgICAgICAgeyAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgVG9rZW4ocGFyc2VGbG9hdChtYXRjaFswXSkpKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hdGNoPW1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKyhfXFwoW2EtekEtWjAtOV0qXFwpKSovKVxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAvL2lmICh2YXJpJiZ2YXJpLmxlbmd0aD09PTApe3Zhcmk9bWF0aC5zbGljZShpLG1hdGgubGVuZ3RoKX1cbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IFRva2VuKDEsbWF0Y2hbMF0pKVxuICAgICAgICAgICAgICAgIC8vdG9rZW5zLnB1c2goe3R5cGU6IFwidmFyaWFibGVcIix2YXJpYWJsZTogdmFyaS5yZXBsYWNlKFwiKFwiLFwie1wiKS5yZXBsYWNlKFwiKVwiLFwifVwiKSx2YWx1ZTogMX0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY2hhciBcIiR7bWF0aFtpXX1cImApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucG9zdFByb2Nlc3NUb2tlbnMoKTtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZUluZGV4KGluZGV4LG1hcmdpbil7XG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XG4gICAgICAgIHJldHVybiBpbmRleD49MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC1tYXJnaW47XG4gICAgfVxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKXtcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGlkeD10aGlzLmZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXgrMV0/LnZhbHVlPT09JygnJiYoaWR4PT09MHx8IWdldE9wZXJhdG9yc0J5U2lkZXMoJ2RvdWJsZVJpZ2h0JykuaW5jbHVkZXModGhpcy50b2tlbnNbaWR4LTFdPy52YWx1ZSkpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vTWFwIHBhcmVudGhlc2VzIGZvciBpbXBsaWNpdCBtdWx0aXBsaWNhdGlvbi5cbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4geyBcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8IChoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLnZhbHVlKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlbi52YWx1ZSA9PT0gXCIpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHx0ZXN0RG91YmxlUmlnaHQoaW5kZXgpPyBpbmRleCsxIDogbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpO1xuICAgICAgICByZXR1cm4gbWFwXG4gICAgfVxuXG4gICAgdmFsaWRhdGVQbHVzTWludXMoKXtcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udmFsdWU9PT0nUGx1cyd8fHRva2VuLnZhbHVlPT09J01pbnVzJz9pbmRleDpudWxsKS5maWx0ZXIoaW5kZXg9PiBpbmRleCE9PW51bGwpXG5cbiAgICAgICAgbWFwLmZvckVhY2goaW5kZXggPT4ge1xuICAgICAgICAgICAgaW5kZXg9dGhpcy52YWxpZGF0ZUluZGV4KGluZGV4LDEpJiZ0aGlzLnRva2Vuc1tpbmRleC0xXS50eXBlPT09J29wZXJhdG9yJ3x8dGhpcy50b2tlbnNbaW5kZXgrMV0udHlwZT09PSdvcGVyYXRvcic/bnVsbDppbmRleDtcbiAgICAgICAgfSk7XG4gICAgICAgIG1hcC5yZXZlcnNlKCkuZm9yRWFjaChpbmRleCA9PiB7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZT10aGlzLnRva2Vuc1tpbmRleF0udmFsdWU9PT0nUGx1cyc/MTotMTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4KzFdLnZhbHVlKj12YWx1ZTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcbiAgICAgICAgLypydWxlcyB0byBhYmlkIGJ5OlxuICAgICAgICAxLiArLSBJZiBwYXJ0IG9mIHRoZSBudW1iZXIgdGhleSBhcmUgYWJzb3JiZWQgaW50byB0aGUgbnVtYmVyXG4gICAgICAgICovXG4gICAgICAgXG4gICAgICAgIHRoaXMuSURwYXJlbnRoZXNlcygpO1xuICAgICAgICBjb25zdCBtYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiAodG9rZW4uaXNWYWx1ZVRva2VuKCkpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnN0IGFycj1maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwKTtcblxuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcbiAgICAgICAgdGhpcy52YWxpZGF0ZVBsdXNNaW51cygpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgcGFyZW5NYXA9dGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcbiAgICAgICAgcGFyZW5NYXAuc29ydCgoYSwgYikgPT4gYiAtIGEpXG4gICAgICAgIC5mb3JFYWNoKHZhbHVlID0+IHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3IFRva2VuKCcqJykpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBtYXBQb3c9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi52YWx1ZT09PSdQb3cnP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnNvbGUubG9nKG1hcFBvdylcbiAgICAgICAgbWFwUG93LmZvckVhY2goaW5kZXggPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coaW5kZXgsbmV3IFBvc2l0aW9uKHRoaXMsaW5kZXgpKVxuICAgICAgICAgICAgY29uc3QgW2xlZnRCcmVhayxsZW5ndGhdID0gW3Bvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhci1wb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcl1cbiAgICAgICAgICAgIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLnZhbHVlID09PSBcIihcIiA/IHRoaXMuZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbClcbiAgICB9XG5cbiAgICBmaWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFlbCgpe1xuICAgICAgICByZXR1cm4gdGhpcy5tYXBQYXJlbkluZGV4ZXMoKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBvcGVuOiBvcGVuSW5kZXgsIGNsb3NlOiBjbG9zZUluZGV4IH0gPSBpdGVtO1xuICAgICAgICAgICAgaWYgKG9wZW5JbmRleD4wKSB7XG4gICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdLnR5cGUpKSB7Ly8gJiYgcHJldlRva2VuLnZhbHVlICE9PSBcIj1cIlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2xvc2VJbmRleDx0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXS5pc1ZhbHVlVG9rZW4oKSkgey8vdGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9KS5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pO1xuICAgIH1cbiAgICAvKlxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXG4gICAgICAgICkpO1xuICAgICB9Ki9cblxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XG4gICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIFRva2VuKSl7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZnR5Z3ViaG5pbXBvXCIpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBtYXAgPSBuZXcgU2V0KHRoaXMuZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhZWwoKSk7XG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICFtYXAuaGFzKGlkeCkpO1xuICAgICAgICAvL1Byb2JsZW0gd2l0aCAgPSBhcyBpdCdzIGFmZmVjdGluZyB0aGUgdmFyaWFibGUgYmVmb3JlIGl0XG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4IC0gMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKCkgJiZcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCArIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpXG4gICAgICAgICAgICApO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbClcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGFyciA9IFtcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhudW1NYXApLCBcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyh2YXJNYXApLCBcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXG4gICAgICAgIFxuICAgICAgICB0aGlzLklEcGFyZW50aGVzZXModGhpcy50b2tlbnMpXG4gICAgfVxuXG5cbiAgICBjb25uZWN0QW5kQ29tYmluZShhcnIpe1xuICAgICAgICBjb25zdCBpbmRleGVzPVtdXG5cbiAgICAgICAgYXJyLnNvcnQoKGEsIGIpID0+IGJbMF0gLSBhWzBdKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGluZGV4ZXMucHVzaCh7c3RhcnQ6IGVsWzBdLGVuZDogZWxbZWwubGVuZ3RoIC0gMV19KVxuICAgICAgICB9KTtcblxuICAgICAgICBpbmRleGVzLmZvckVhY2goaW5kZXggPT4ge1xuICAgICAgICAgICAgbGV0IHZhbHVlID0gTnVtYmVyKHRoaXMudG9rZW5zW2luZGV4LnN0YXJ0XS52YWx1ZSk7XG4gICAgICAgICAgICBjb25zdCBpc1Zhcj10aGlzLnRva2Vucy5zbGljZShpbmRleC5zdGFydCxpbmRleC5lbmQrMSkuZmluZCh0b2tlbj0+IHRva2VuLnR5cGUuaW5jbHVkZXMoJ3ZhcicpKTtcbiAgICAgICAgICAgIGZvciAobGV0IGk9aW5kZXguc3RhcnQrMTtpPD1pbmRleC5lbmQ7aSsrKXtcbiAgICAgICAgICAgICAgIHZhbHVlID0gdGhpcy50b2tlbnNbaV0udmFsdWUgKyB2YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9pZiAoaXNWYXIpdXBkYXRlZFRva2VuLnZhcmlhYmxlPWlzVmFyLnZhcmlhYmxlXG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleC5zdGFydF0gPSBuZXcgVG9rZW4odmFsdWUsaXNWYXI/LnZhcmlhYmxlKTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5zdGFydCsxLCBpbmRleC5lbmQgLSBpbmRleC5zdGFydCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcbiAgICAgICAgKVxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxuICAgIH1cblxuICAgIGluc2VydFRva2VucyhzdGFydCwgbGVuZ3RoLCBvYmplY3RzKSB7XG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzKSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XG4gICAgfVxuXG4gICAgcmVjb25zdHJ1Y3QodG9rZW5zKXtcbiAgICAgICAgaWYgKCF0b2tlbnMpe3Rva2Vucz10aGlzLnRva2Vuczt9XG4gICAgICAgIGNvbnN0IGFkZFBsdXNJbmRleGVzPXRoaXMuaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnMpO1xuICAgICAgICBjb25zdCBjdXJseUJyYWNrZXRJbmRleGVzID0gdGhpcy5jdXJseUJyYWNrZXRJRHModG9rZW5zKS5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pO1xuICAgICAgICBsZXQgbWF0aCA9IFwiXCI7XG4gICAgICAgIGZvciAobGV0IGk9MDtpPHRva2Vucy5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGxldCB0ZW1wO1xuICAgICAgICAgICAgbWF0aCs9YWRkUGx1c0luZGV4ZXMuaW5jbHVkZXMoaSk/JysnOicnO1xuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXT8udmFsdWU9PT1cIihcIiYmdG9rZW5zW3Rva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQmJnRva2Vuc1tpbmRleCsxXSkrMV0udmFsdWU9PT1cIi9cIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBtYXRoKz1cIlxcXFxmcmFjXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzd2l0Y2ggKHRva2Vuc1tpXT8udHlwZSl7XG4gICAgICAgICAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJwb3dlclZhcmlhYmxlXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIm9wZXJhdG9yXCI6XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0gaW5zdGFuY2VvZiBUb2tlbilcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXT8udG9TdHJpbmdMYXRleCgpXG4gICAgICAgICAgICAgICAgICAgIC8vdGVtcD1yb3VuZEJ5U2V0dGluZ3ModG9rZW5zW2ldLnZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAvL21hdGgrPXRlbXArKGkrMTx0b2tlbnMubGVuZ3RoJiYvKGZyYWMpLy50ZXN0KHRva2Vuc1tpKzFdLnZhbHVlKT9cIitcIjpcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBcInBhcmVuXCI6XG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPWN1cmx5QnJhY2tldEluZGV4ZXMuY29udGFpbnMoaSk/dG9rZW5zW2ldLnZhbHVlLnJlcGxhY2UoL1xcKC8sXCJ7XCIpLnJlcGxhY2UoL1xcKS8sXCJ9XCIpOnRva2Vuc1tpXS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcih0aGlzLnRva2VucylcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHRva2VuIHR5cGUgZ2l2ZW4gdG8gcmVjb25zdHJ1Y3Q6IHR5cGUgJHt0b2tlbnNbaV0/LnR5cGV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdGhcbiAgICB9XG4gICAgXG4gICAgY3VybHlCcmFja2V0SURzKHRva2VucyA9IHRoaXMudG9rZW5zKSB7XG4gICAgICAgIGNvbnN0IHJpZ2h0QnJhY2tldHMgPSBbLi4uZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJyksIC4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgncmlnaHQnKV07XG4gICAgICAgIGNvbnN0IGJvdGhCcmFja2V0cyA9IFsuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ2JvdGgnKV07XG4gICAgICAgIGNvbnN0IGRvdWJsZVJpZ2h0QnJhY2tldHMgPSBbLi4uZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdkb3VibGVSaWdodCcpXTtcbiAgICAgICAgY29uc3QgbWFwID0gW107XG4gICAgXG4gICAgICAgIHRva2Vucy5mb3JFYWNoKCh0b2tlbiwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRva2Vuc1tpbmRleCAtIDFdPy52YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IG5leHRUb2tlbiA9IHRva2Vuc1tpbmRleCArIDFdPy52YWx1ZTtcbiAgICBcbiAgICAgICAgICAgIGlmICh0b2tlbi52YWx1ZSA9PT0gJygnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBkb3VibGVSaWdodEJyYWNrZXRzLmluY2x1ZGVzKHByZXZUb2tlbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcDEgPSB0aGlzLmZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2Vucyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gdGhpcy5maW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIHAxLmNsb3NlICsgMSwgdG9rZW5zKTtcbiAgICAgICAgICAgICAgICAgICAgbWFwLnB1c2gocDEsIHAyKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGluZGV4ID4gMCAmJiByaWdodEJyYWNrZXRzLmluY2x1ZGVzKHByZXZUb2tlbikpIHtcbiAgICAgICAgICAgICAgICAgICAgbWFwLnB1c2godGhpcy5maW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4LCB0b2tlbnMpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSAnKScgJiYgYm90aEJyYWNrZXRzLmluY2x1ZGVzKG5leHRUb2tlbikpIHtcbiAgICAgICAgICAgICAgICBtYXAucHVzaCh0aGlzLmZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2VucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG1hcDtcbiAgICB9XG4gICAgXG5cbiAgICBpbmRleGVzVG9BZGRQbHVzKHRva2Vucyl7XG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcbiAgICB9XG4gICAgXG4gICAgXG5cbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZSwgdmFsdWUsIHRva2VuLCBuZXh0VG9rZW4pIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCA/IHZhbHVlIDogbmV3IFJlZ0V4cCh2YWx1ZSk7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXG4gICAgICAgICAgICB0b2tlbltjb21wYXJlXSA9PT0gbmV4dFRva2VuPy5bY29tcGFyZV1cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBJRHBhcmVudGhlc2VzKCkge1xuICAgICAgICBsZXQgdG9rZW5zPXRoaXMudG9rZW5zXG4gICAgICAgIGxldCBicmFja2V0cyA9IDAsIGxldmVsQ291bnQgPSB7fTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xuICAgICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XG4gICAgICAgICAgICAgICAgdG9rZW5zW2ldLmlkID0gbmV3IFBhcmVuKGJyYWNrZXRzLElEKS8vICsgXCIuXCIgKyA7XG4gICAgICAgICAgICAgICAgYnJhY2tldHMrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgYnJhY2tldHMtLTtcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XG4gICAgICAgICAgICAgICAgLy8gUmVhc3NpZ24gdGhlIG9iamVjdCB3aXRoIHRoZSBuZXcgaWQgdG8gZW5zdXJlIHBlcnNpc3RlbmNlXG4gICAgICAgICAgICAgICAgdG9rZW5zW2ldLmlkID0gbmV3IFBhcmVuKGJyYWNrZXRzLElEKS8vYnJhY2tldHMgKyBcIi5cIitJRDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoYnJhY2tldHMhPT0wKVxuICAgICAgICB7XG4gICAgICAgICAgICAvL3Rocm93IG5ldyBFcnJvciAoXCJVbm1hdGNoZWQgb3BlbmluZyBicmFja2V0KHMpIGVyciByYXRlOiBcIiticmFja2V0cylcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zO1xuICAgIH1cbn1cblxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnIpIHtcbiAgICBsZXQgcmVzdWx0ID0gW107XG4gICAgbGV0IHN0YWNrID0gQXJyYXkuaXNBcnJheShhcnIpID8gWy4uLmFycl0gOiBbYXJyXTtcblxuICAgIHdoaWxlIChzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgY29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShuZXh0KSkge1xuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5uZXh0KTsgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChuZXh0KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcbn1cblxuXG5cbmV4cG9ydCBjbGFzcyBUb2tlbntcbiAgICB0eXBlO1xuICAgIHZhbHVlO1xuICAgIHZhcmlhYmxlO1xuICAgIG1vZGlmaWVyO1xuICAgIGlkO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKHZhbHVlLHZhcmlhYmxlKXtcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICAgICAgdGhpcy52YXJpYWJsZT12YXJpYWJsZTtcbiAgICAgICAgdGhpcy5zZXRUeXBlKCk7XG4gICAgICAgIHRoaXMuaW5zdXJQcm9wZXJGb3JtYXR0aW5nKClcbiAgICB9XG4gICAgaW5zdXJQcm9wZXJGb3JtYXR0aW5nKCl7XG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nb3BlcmF0b3InKXtcbiAgICAgICAgICAgIHRoaXMudmFsdWU9c2VhcmNoT3BlcmF0b3JzKHRoaXMudmFsdWUpPy5uYW1lXG4gICAgICAgIH1cbiAgICAgICAvLyBpZiAoIXRoaXMudmFsdWUpe3Rocm93IG5ldyBFcnJvcignd3RmIFZhbHVlIHdhcyB1bmRlZmluZWQgYXQgdG9rZW4gaW5zdXJQcm9wZXJGb3JtYXR0aW5nJyl9XG4gICAgfVxuICAgIGdldElkKCl7cmV0dXJuIHRoaXMuaWQuaWR9O1xuXG4gICAgZ2V0TGF0ZXhTeW1ib2woKXtyZXR1cm4gc2VhcmNoU3ltYm9scyh0aGlzLnZhbHVlKT8ubGF0ZXh9XG5cbiAgICBnZXRGdWxsVG9rZW5JRCgpe1xuICAgICAgICBzd2l0Y2ggKHRoaXMudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgIGNhc2UgJ3ByYW5lJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlO1xuICAgICAgICAgICAgY2FzZSAnb3BlcmF0b3InOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnR5cGUrJzonK3RoaXMudmFsdWVcbiAgICAgICAgICAgIGNhc2UgJ3ZhcmlhYmxlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlKyc6Jyt0aGlzLnZhcmlhYmxlXG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0ZnVsbFR5cGUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudHlwZVxuICAgIH1cblxuICAgIHNldFR5cGUoKXtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycpe1xuICAgICAgICAgICAgdGhpcy50eXBlPXRoaXMudmFsdWUubWF0Y2goL1soKV0vKT8ncGFyZW4nOidvcGVyYXRvcic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50eXBlPXRoaXMudmFyaWFibGU/J3ZhcmlhYmxlJzonbnVtYmVyJztcbiAgICB9XG5cbiAgICBpc1N0cmluZygpe3JldHVybiB0aGlzLnR5cGU9PT0ncGFyZW4nfHx0aGlzLnR5cGU9PT0nb3BlcmF0b3InfVxuXG4gICAgaXNWYWx1ZVRva2VuKCl7cmV0dXJuIHRoaXMudHlwZT09PSd2YXJpYWJsZSd8fHRoaXMudHlwZT09PSdudW1iZXInfVxuXG4gICAgdG9TdHJpbmdMYXRleCgpe1xuICAgICAgICBsZXQgc3RyaW5nPScnXG4gICAgICAgIGlmICh0aGlzLmlzU3RyaW5nKCkpXG4gICAgICAgICAgICBzdHJpbmcrPXRoaXMuZ2V0TGF0ZXhTeW1ib2wodGhpcy52YWx1ZSlcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSd2YXJpYWJsZScpIHN0cmluZys9dGhpcy50b1N0cmluZ1ZhcmlhYmxlKClcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdudW1iZXInKSBzdHJpbmcrPXRoaXMudmFsdWU7XG4gICAgICAgIHJldHVybiBzdHJpbmdcbiAgICB9XG4gICAgYWZmZWN0ZWRPcGVyYXRvclJhbmdlKGRpcmVjdGlvbil7XG4gICAgICAgIGlmKHRoaXMudHlwZSE9PSdvcGVyYXRvcid8fHRoaXMudmFsdWU9PT0nRXF1YWxzJylcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBpZihkaXJlY3Rpb249PT0nbGVmdCcmJiFnZXRPcGVyYXRvcnNCeVNpZGVzKCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcikpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gICAgdG9TdHJpbmdWYXJpYWJsZSgpe1xuICAgICAgICByZXR1cm4gKHRoaXMudmFsdWUhPT0xP3RoaXMudmFsdWU6JycpK3RoaXMudmFyaWFibGU7XG4gICAgfVxufVxuXG5jbGFzcyBQcmFpc2luZ01ldGhvZHtcbiAgICB0b2tlbnNcbiAgICBvdmVydmlldztcbiAgICB2YXJpYWJsZXM7XG4gICAgY29uc3RydWN0b3IodG9rZW5zKXtcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zXG4gICAgICAgIHRoaXMub3ZlcnZpZXc9dGhpcy5nZXRPdmVydmlldygpXG4gICAgICAgIHRoaXMuYXNzaWduVmFyaWFibGVzKClcbiAgICB9XG4gICAgaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5zb21lKHQ9PiB0LnR5cGU9PT0ndmFyaWFibGUnJiZ0LnZhbHVlPjEpXG4gICAgfVxuXG4gICAgaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFzZVZhcmlhYmxlKCkmJnRoaXMuaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCkmJnRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKVxuICAgIH1cbiAgICBpc0lzb2xhdGUoKXtcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5cbiAgICB9XG5cbiAgICBpc0FueXRoaW5nVG9Jc29sYXRlKCl7XG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzLmxlbmd0aD4xKXRocm93IG5ldyBFcnJvcihcInR3byB2YXIgZXEgYXJlbnQgc2Fwb3J0ZWQgeWV0XCIpXG4gICAgICAgIGlmKCF0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpcmV0dXJuO1xuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMuZXF1YWxzSW5kZXhJZkFueSgpO1xuICAgICAgICBpZighZXFJbmRleCl7cmV0dXJufTtcbiAgICAgICAgY29uc3QgYmVmb3IgPSB0aGlzLmdldE92ZXJ2aWV3KHRoaXMudG9rZW5zLnNsaWNlKDAsZXFJbmRleCkpXG4gICAgICAgIGNvbnN0IGFmdGVyID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZShlcUluZGV4KzEpKVxuICAgICAgICBjb25zdCB3aGF0VG9Jc29sYXQgPXRoaXMud2hhdFRvSXNvbGF0KCk7XG4gICAgICAgIGlmICghd2hhdFRvSXNvbGF0fHwoYmVmb3I/LnNpemU8MiYmYWZ0ZXI/LnNpemU8MikpcmV0dXJuO1xuICAgICAgICByZXR1cm4ge292ZXJ2aWV3U2lkZU9uZTogYmVmb3Isb3ZlcnZpZXdTaWRlVHdvOiBhZnRlciwuLi53aGF0VG9Jc29sYXR9XG4gICAgfVxuICAgIGhvd1RvSXNvbGF0ZShvdmVydmlld1NpZGVPbmUsb3ZlcnZpZXdTaWRlVHdvLGlzb2xhdGlvbkdvb2wpe1xuICAgICAgICBjb25zdCBpc29sYXRpb25UeXBlPWlzb2xhdGlvbkdvb2wuc3BsdCgnOicpO1xuICAgICAgICAvL2lmICgpe31cbiAgICB9XG4gICAgd2hhdFRvSXNvbGF0KCl7XG4gICAgICAgIC8vIGkgbmVlZCB0byBhZGQgcG93cyBhZnRlclxuICAgICAgICAvLyBmb3Iga25vdyBpbSBnb2luZyBvbiB0aGUgb3Nob21zaGluIHRoYXQgdGhyIGlzIG9ubHkgb25lIHZhclxuICAgICAgICBpZih0aGlzLnZhcmlhYmxlcz8ubGVuZ3RoPDEpcmV0dXJuO1xuXG4gICAgICAgIHJldHVybiB7dHlwZTogJ3ZhcmlhYmxlJyx2YWx1ZTogdGhpcy52YXJpYWJsZXNbMF19XG4gICAgfVxuICAgIGlzT3ZlcnZpZXdUb2lzb2xhdChvdmVydmlldyl7XG4gICAgfVxuICAgIGlzSW1iYWxhbmNlKG92ZXJ2aWV3KXtcbiAgICAgICAgb3ZlcnZpZXcuc2l6ZT4xXG4gICAgfVxuICAgIGVxdWFsc0luZGV4SWZBbnkoKXtcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLnRva2Vucy5tYXAoKHQsaWR4KT0+dC52YWx1ZT09PSdFcXVhbHMnP2lkeDpudWxsKS5maWx0ZXIobT0+bSE9PW51bGwpO1xuICAgICAgICByZXR1cm4gZXFJbmRleFswXTtcbiAgICB9XG4gICAgaXNRdWFkcmF0aWMoKXtcblxuICAgIH1cbiAgICBpc0ZpbmFsUmV0dXJuKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5sZW5ndGg8Mnx8KHRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlcbiAgICB9XG4gICAgXG4gICAgYXNzaWduVmFyaWFibGVzKCl7XG4gICAgICAgIHRoaXMudmFyaWFibGVzPVtdXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKXtcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgoJ3ZhcmlhYmxlOicpJiYhdGhpcy52YXJpYWJsZXMuaW5jbHVkZXModmFsdWUudmFyaWFibGUpKXtcbiAgICAgICAgICAgICAgICB0aGlzLnZhcmlhYmxlcy5wdXNoKHZhbHVlLnZhcmlhYmxlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaGFzZVZhcmlhYmxlKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzPy5sZW5ndGg+MH1cblxuICAgIGlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpe1xuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubm9NYXRjaD4wXG4gICAgfVxuICAgIGlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCl7XG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxuICAgICAgICByZXR1cm4gIGZpbHRlci5tYXRjaD09PTEmJmZpbHRlci5ub01hdGNoPT09MFxuICAgIH1cblxuICAgIGZpbHRlckJ5VHlwZSh0eXBlS2V5LCB0YXJnZXRWYWx1ZSl7XG4gICAgICAgIGxldCBtYXRjaD0wLCBub01hdGNoPTBcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5vdmVydmlldy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgodHlwZUtleSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSB0eXBlS2V5Kyc6Jyt0YXJnZXRWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaCsrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG5vTWF0Y2grKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgbWF0Y2g6IG1hdGNoLCBub01hdGNoOiBub01hdGNoIH07XG4gICAgfVxuICAgIGdldE92ZXJ2aWV3KHRva2Vucykge1xuICAgICAgICBpZighdG9rZW5zKXRva2Vucz10aGlzLnRva2Vuc1xuICAgICAgICBjb25zdCBvdmVydmlldyA9IG5ldyBNYXAoKTtcbiAgICBcbiAgICAgICAgdG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xuICAgICAgICAgICAgLy9pZiAoIXRva2VuLmlzVmFsdWVUb2tlbigpKSB7cmV0dXJuO31cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3Qga2V5ID0gdG9rZW4uZ2V0RnVsbFRva2VuSUQoKVxuICAgICAgICAgICAgLy9FcXVhbHNcbiAgICAgICAgICAgIGlmICghb3ZlcnZpZXcuaGFzKGtleSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeSA9IHsgXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLnR5cGUsIFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogMCBcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09PSAndmFyaWFibGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGVudHJ5LnZhcmlhYmxlID0gdG9rZW4udmFyaWFibGU7XG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgIG92ZXJ2aWV3LnNldChrZXksIGVudHJ5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG92ZXJ2aWV3LmdldChrZXkpLmNvdW50Kys7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gb3ZlcnZpZXcvL0FycmF5LmZyb20ob3ZlcnZpZXcudmFsdWVzKCkpO1xuICAgIH1cbn1cblxuXG5cbmNsYXNzIE1vZGlmaWVye1xuXG59Il19