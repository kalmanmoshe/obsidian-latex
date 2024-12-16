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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzFCLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsd0JBQXdCLEVBQUUscUJBQXFCLEVBQUUsc0JBQXNCLEVBQUUsbUJBQW1CLEVBQUUseUJBQXlCLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2pOLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDeEIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzlDLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFHO0lB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TSxHQUFHLEdBQUcsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFBO1lBQ2xDLFFBQVE7WUFDUixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixNQUFNLEtBQUssR0FBRztvQkFDVixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLEtBQUssRUFBRSxDQUFDO2lCQUNYLENBQUM7Z0JBQ0YsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO29CQUM1QixLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0IsQ0FBQztZQUNELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFFBQVEsQ0FBQSxDQUFBLGdDQUFnQztJQUNuRCxDQUFDO0NBQ0o7QUFJRCxNQUFNLFFBQVE7Q0FFYiIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4vaW1WZXJ5TGF6eVwiO1xyXG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIHJlZ0V4cCB9IGZyb20gXCIuL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyBnZXRBbGxMYXRleFJlZmVyZW5jZXMsIGdldEFsbE9wZXJhdG9yUmVmZXJlbmNlcywgZ2V0T3BlcmF0b3JzQnlCcmFja2V0LCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeVNpZGVzLCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBzZWFyY2hPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi91dGlscy9zeW1ib2xzXCI7XHJcbmltcG9ydCB7IGNwIH0gZnJvbSBcImZzXCI7XHJcbmltcG9ydCB7IFBhcmVuIH0gZnJvbSBcIi4vdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xyXG5jb25zdCBncmVla0xldHRlcnMgPSBbXHJcbiAgICAnQWxwaGEnLCdhbHBoYScsICdCZXRhJywgJ0dhbW1hJywgJ0RlbHRhJywgJ0Vwc2lsb24nLCAnWmV0YScsICdFdGEnLCAnVGhldGEnLCBcclxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXHJcbiAgICAnU2lnbWEnLCAnVGF1JywgJ1Vwc2lsb24nLCAnUGhpJywgJ0NoaScsICdQc2knLCAnT21lZ2EnXHJcbl07XHJcbi8qY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xyXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXHJcbiAgICAnYXRhbicsICdhcmNjb3MnLCAnYXJjc2luJywgJ2FyY3RhbicsICdjZG90Jywnc3FydCdcclxuXSovXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKGFycikge1xyXG4gICAgY29uc3Qgc2VxdWVuY2VzID0gW107XHJcbiAgICBsZXQgc3RhcnQgPSAwO1xyXG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGFycltpXSAhPT0gYXJyW2kgLSAxXSArIDEpIHtcclxuICAgICAgICAgICAgaWYgKGkgLSBzdGFydCA+IDEpIHtcclxuICAgICAgICAgICAgICAgIHNlcXVlbmNlcy5wdXNoKGFyci5zbGljZShzdGFydCwgaSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN0YXJ0ID0gaTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc2VxdWVuY2VzO1xyXG59XHJcblxyXG5cclxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XHJcbiAgICBib3RoQnV0UmlnaHRCcmFja2V0OiBbXCJeXCJdLFxyXG4gICAgcmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaDogW1wic3FydFwiXSxcclxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcclxuICAgIHNwZWNpYWw6IFtcIj1cIl0sXHJcbiAgICBSaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaDogW1wic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxyXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cclxufTtcclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoSW5mb3tcclxuICAgIGRlYnVnSW5mbz1cIlwiO1xyXG4gICAgc29sdXRpb25JbmZvPVtdO1xyXG4gICAgbWF0aEluZm89W11cclxuICAgIGdyYXBoPVwiXCI7XHJcbiAgICBhZGRHcmFwaEluZm8odmFsdWUpe1xyXG4gICAgICAgIHRoaXMuZ3JhcGgrPXZhbHVlO1xyXG4gICAgfVxyXG4gICAgYWRkRGVidWdJbmZvKG1zZywgdmFsdWUpe1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUpOnZhbHVlKSsgXCJcXG4gXCI7XHJcbiAgICB9XHJcbiAgICBhZGRTb2x1dGlvbkluZm8obWVzKXtcclxuICAgICAgICB0aGlzLnNvbHV0aW9uSW5mby5wdXNoKG1lcyk7XHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xyXG4gICAgfVxyXG4gICAgYWRkTWF0aEluZm8odG9rZW5zKXtcclxuICAgICAgICBjb25zdCByZWNvbnN0cnVjdGVkTWF0aD10b2tlbnMucmVjb25zdHJ1Y3QoKVxyXG4gICAgICAgIHRoaXMubWF0aEluZm8ucHVzaChyZWNvbnN0cnVjdGVkTWF0aClcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlJlY29uc3RydWN0ZWQgbWF0aFwiLHJlY29uc3RydWN0ZWRNYXRoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRTb2x1dGlvbih0b2tlbnMscG9zaXRpb24sc29sdXRpb24pe1xyXG4gICAgICAgIHNvbHV0aW9uPXRva2Vucy5yZWNvbnN0cnVjdChbc29sdXRpb25dKTtcclxuICAgICAgICBjb25zdCBsZWZ0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLmluZGV4KSk7XHJcbiAgICAgICAgY29uc3QgcmlnaHQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24uaW5kZXgrMSxwb3NpdGlvbi5yaWdodC5icmVha0NoYXIsKSk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHJ1ZSl7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aEJ1dFJpZ2h0QnJhY2tldC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvcn0geyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKC9cXCovZywgXCJcXFxcY2RvdFwiKX0gJHtyaWdodH0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnNwZWNpYWwuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gYFxcXFxmcmFjeyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGBcXFxcc3FydHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLlJpZ2h0UGFyZW5BbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5kb3VibGVSaWdodEJ1dEJyYWNrZXQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZShcIi9cIixcImZyYWNcIil9eyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYWRkU29sdXRpb25JbmZvKHNvbHV0aW9uKTtcclxuICAgIH1cclxufVxyXG5cclxuLypcclxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XHJcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XHJcbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XHJcbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxyXG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxyXG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxyXG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcclxuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcclxuICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XHJcbn0qL1xyXG5cclxuZnVuY3Rpb24gcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3IsbGVmdCxyaWdodCl7XHJcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIGxlZnQ/LnZhbHVlIT09XCJudW1iZXJcIiYmZ2V0T3BlcmF0b3JzQnlTaWRlcygnYm90aCcpLmluY2x1ZGVzKG9wZXJhdG9yKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQ/LnZhbHVlIT09XCJudW1iZXJcIikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJpZ2h0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gcGFyc2UocG9zaXRpb24pIHtcclxuICAgIGxldCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xyXG4gICAgXHJcbiAgICBsZWZ0PWxlZnQ/LnRva2Vuc1xyXG4gICAgcmlnaHQ9cmlnaHQudG9rZW5zXHJcbiAgICAvL2NvbnNvbGUubG9nKCd0aGlzLmxlZnQsdGhpcy5yaWdodCcsbGVmdCxyaWdodClcclxuICAgIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yLGxlZnQscmlnaHQpO1xyXG4gICAgXHJcbiAgICBsZXQgc29sdmVkPW5ldyBUb2tlbigpO1xyXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xyXG4gICAgICAgIGNhc2UgXCJTcXVhcmUgUm9vdFwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIlBvd1wiOlxyXG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZXx8cmlnaHQudmFyaWFibGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfHxsZWZ0LnZhcmlhYmxlPT09cmlnaHQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZT9yaWdodC52YXJpYWJsZTpcIlwiO1xyXG4gICAgICAgICAgICAgICAgc29sdmVkLnBvdz0yXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cobGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJGcmFjdGlvblwiOlxyXG4gICAgICAgIGNhc2UgXCIvXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChsZWZ0LnZhbHVlKS8ocmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiTXVsdGlwbGljYXRpb25cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAqIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBoYW5kbGVWcmlhYmxlcyhsZWZ0LCByaWdodCxzb2x2ZWQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiK1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICsgcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJNaW51c1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlIC0gcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBjYWxjdWxhdGVCaW5vbShsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInNpblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJjb3NcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5jb3MoZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ0YW5cIjpcclxuICAgICAgICAgICAgaWYgKHJpZ2h0Pj05MCl7dGhyb3cgbmV3IEVycm9yKFwidGFuIE11c3QgYmUgc21hbGxlciB0aGFuIDkwXCIpO31cclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc2luXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY3NpblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXNpbihyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYWNvc1wiOlxyXG4gICAgICAgIGNhc2UgXCJhcmNjb3NcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFjb3MocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImF0YW5cIjpcclxuICAgICAgICBjYXNlIFwiYXJjdGFuXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGlkZW50aWZ5IG9wZXJhdG9yIHR5cGUgYXQgcHJhaXNlIG9wZXJhdG9yOiBcIitwb3NpdGlvbi5vcGVyYXRvcik7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0LCByaWdodCwgc29sdmVkKSB7XHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcclxuICAgICAgICAgICAgLy8gS2VlcCB0aGVtIHNlcGFyYXRlIHNpbmNlIHRoZXkgaGF2ZSBkaWZmZXJlbnQgdmFyaWFibGVzXHJcbiAgICAgICAgICAgIHNvbHZlZC50ZXJtcyA9IFtcclxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxyXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogcmlnaHQudmFyaWFibGUsIHBvdzogcmlnaHQucG93IHx8IDEsIHZhbHVlOiByaWdodC52YWx1ZSB8fCAxIH1cclxuICAgICAgICAgICAgXTtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlmZmVyZW50IHZhcmlhYmxlIGJhc2VzIGF0IHBvd2VyIG11bHRpcGxpY2F0aW9uLiBJIGRpZG4ndCBnZXQgdGhlcmUgeWV0XCIpXHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgIHNvbHZlZC52YXJpYWJsZSA9IHZhcmlhYmxlLmxlbmd0aD4wP3ZhcmlhYmxlOnVuZGVmaW5lZDtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcclxuICAgICAgICBwb3c9bGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSYmcG93PT09MCYmIWxlZnQucG93JiYhcmlnaHQucG93PzI6cG93O1xyXG4gICAgICAgIHNvbHZlZC5wb3cgPSBwb3cgfHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICAvLyBSdWxlIDM6IEhhbmRsZSBtdWx0aXBsaWNhdGlvbiBvZiBjb25zdGFudHNcclxuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgcmlnaHRWYWx1ZSA9IHJpZ2h0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSBsZWZ0VmFsdWUgKiByaWdodFZhbHVlO1xyXG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcclxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVnJpYWJsZXMobGVmdCxyaWdodCxzb2x2ZWQpe1xyXG4gICAgICAgIGxldCBoYW5kbGVkPXtWYXI6bnVsbCxQb3c6bnVsbH07XHJcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICByZXR1cm4gO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cclxuICAgICAgICAvL2NvbnNvbGUubG9nKGxlZnQudmFyaWFibGUscmlnaHQudmFyaWFibGUpXHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUhPT1yaWdodC52YXJpYWJsZSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlR3byB2YXJpYWJsZSBlcXVhdGlvbnMgYXJlbid0IGFjY2VwdGVkIHlldFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9oYW5kbGVkLlZhcj1sZWZ0LnZhcjtcclxuICAgICAgICAvL3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhclxyXG5cclxuICAgICAgICAvKlxyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfVxyXG4gICAgICAgIGVsc2UgaWYgKCFsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlfVxyXG4gICAgICAgIGVsc2UgaWYgKGxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGU7c29sdmVkLnBvdz0yfVxyXG4gICAgICAgICovXHJcbiAgICB9XHJcblxyXG5cclxuICAgIHJldHVybiBzb2x2ZWQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIHtcclxuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLCBlbmQsIHRva2VucywgcmVnZXgpIHtcclxuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMudG9rZW5zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBsZXQgaW5kZXg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocmVnZXgpIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaW5kZXggKz0gYmVnaW47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4IC0gMV0udHlwZSA9PT0gdG9rZW5zLnRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiAtMTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aCxqPTA7XHJcbiAgICBsZXQgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgbGV0IGNoZWNrZWRJRHMgPSBbXTsgIFxyXG4gICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTtcclxuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCYmajwyMDApIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy50b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaisrO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zLnRva2Vuc1tpXS5pZCkpIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2ldLmlkKTsgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50SUQhPT1udWxsJiZpPT09Y3VycmVudElELmNsb3NlKSB7XHJcbiAgICAgICAgICAgICAgICBbYmVnaW4sZW5kXT1bY3VycmVudElELm9wZW4sY3VycmVudElELmNsb3NlXVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgYmVnaW4gPSAwO1xyXG4gICAgICAgICAgICBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aDtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xyXG5cclxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxyXG4gICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxyXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGo+PTIwMCl7dGhyb3cgbmV3IEVycm9yKFwib3BlcmF0aW9uc09yZGVyIEZhaWxlZCBleGNlZWRlZCAyMDAgcmV2aXNpb25zXCIpO31cclxuXHJcbiAgICBmb3IgKGxldCBpPTE7aTw9NjtpKyspe1xyXG4gICAgICAgIGxldCBwcmlvcml0eSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0T3BlcmF0b3JzQnlQcmlvcml0eShpLHRydWUpKTtcclxuICAgICAgICBpZihwcmlvcml0eSE9PS0xKXJldHVybiBwcmlvcml0eVxyXG4gICAgfVxyXG5cclxuICAgIGxldCBwcmlvcml0eTEgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE9wZXJhdG9yc0J5UHJpb3JpdHkoMSx0cnVlKSk7XHJcbiAgICBsZXQgcHJpb3JpdHkyID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5KDIsdHJ1ZSkpO1xyXG4gICAgbGV0IHByaW9yaXR5MyA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0T3BlcmF0b3JzQnlQcmlvcml0eSgzLHRydWUpKTtcclxuICAgIGxldCBwcmlvcml0eTQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE9wZXJhdG9yc0J5UHJpb3JpdHkoNCx0cnVlKSk7XHJcbiAgICBsZXQgcHJpb3JpdHk1ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5KDUsdHJ1ZSkpO1xyXG4gICAgbGV0IHByaW9yaXR5NiA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0T3BlcmF0b3JzQnlQcmlvcml0eSg2LHRydWUpKTtcclxuXHJcbiAgICByZXR1cm4gW3ByaW9yaXR5MSwgcHJpb3JpdHkyLCBwcmlvcml0eTMsIHByaW9yaXR5NCwgcHJpb3JpdHk1LHByaW9yaXR5Nl0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uIHtcclxuICAgIG9wZXJhdG9yO1xyXG4gICAgaW5kZXg7XHJcbiAgICB0cmFuc2l0aW9uO1xyXG4gICAgc3BlY2lhbENoYXI7XHJcbiAgICBsZWZ0O1xyXG4gICAgcmlnaHQ7XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnMsIGluZGV4KXtcclxuICAgICAgICB0aGlzLmluZGV4PWluZGV4O1xyXG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXhcclxuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcclxuICAgIH1cclxuICAgIHBvc2l0aW9uKHRva2Vucykge1xyXG4gICAgICAgIHRoaXMuaW5kZXggPSAhdGhpcy5pbmRleD8gb3BlcmF0aW9uc09yZGVyKHRva2VucykgOiB0aGlzLmluZGV4O1xyXG4gICAgICAgIGlmICh0aGlzLmluZGV4ID09PSBudWxsIHx8IHRoaXMuaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLm9wZXJhdG9yID0gdG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS52YWx1ZTtcclxuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgY2FzZSBnZXRPcGVyYXRvcnNCeVNpZGVzKCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwibGVmdFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBnZXRPcGVyYXRvcnNCeVNpZGVzKCdyaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0ge2JyZWFrQ2hhcjogdGhpcy5pbmRleH07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlTaWRlcygnZG91YmxlUmlnaHQnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMubGVmdC5icmVha0NoYXI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLTEsXCJyaWdodFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubGVmdC5icmVha0NoYXIgPSB0aGlzLmluZGV4O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodC5icmVha0NoYXIrKHRoaXMucmlnaHQubXVsdGlTdGVwPzE6MCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmF0b3IgJHt0aGlzLm9wZXJhdG9yfSB3YXMgbm90IGFjY291bnRlZCBmb3IsIG9yIGlzIG5vdCB0aGUgdmFsaWQgb3BlcmF0b3JgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9jb25zb2xlLmxvZyh0b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHRoaXMuc3BlY2lhbENoYXI9dG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA/IHRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA6IG51bGw7XHJcbiAgICB9XHJcbiAgICBhcHBseVBvc2l0aW9uKHRva2VucywgaW5kZXgsIGRpcmVjdGlvbikge1xyXG4gICAgICAgIGxldCBicmVha0NoYXI9aW5kZXhcclxuICAgICAgICBsZXQgdGFyZ2V0O1xyXG4gICAgICAgIGxldCBtdWx0aVN0ZXA9ZmFsc2U7XHJcbiAgICAgICAgY29uc3QgaXNMZWZ0ID0gZGlyZWN0aW9uID09PSBcImxlZnRcIjtcclxuICAgICAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcclxuICAgICAgICBpZiAoKGlzTGVmdCAmJiBpbmRleCA8PSAwKSB8fCAoIWlzTGVmdCAmJiBpbmRleCA+PSB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHx8ICF0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImF0IGFwcGx5UG9zaXRpb246IFxcXCJpbmRleCB3YXNuJ3QgdmFsaWRcXFwiIGluZGV4OiBcIitpbmRleCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIikge1xyXG4gICAgICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xyXG4gICAgICAgICAgICBicmVha0NoYXIgPSAgaXNMZWZ0ID8gcGFyZW5JbmRleC5vcGVuIDogcGFyZW5JbmRleC5jbG9zZSsxO1xyXG4gICAgICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zLnNsaWNlKHBhcmVuSW5kZXgub3BlbiwgcGFyZW5JbmRleC5jbG9zZSsxKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBicmVha0NoYXI9aW5kZXgraW5kZXhNb2RpZmllcjtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vuc1ticmVha0NoYXJdO1xyXG4gICAgICAgICAgICBicmVha0NoYXIrPWlzTGVmdD8wOjFcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9jb25zdCBtdWx0aVN0ZXAgPSBNYXRoLmFicyhicmVha0NoYXIgLSBpbmRleCkgPiAzO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKCFtdWx0aVN0ZXAmJnRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKXtcclxuICAgICAgICAgICAgLy90YXJnZXQ9dGFyZ2V0LmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGFyZ2V0Py5sZW5ndGg9PT0wKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgYXQgYXBwbHlQb3NpdGlvbjogY291bGRuJ3QgZmluZCB0YXJnZXQgdG9rZW4gZm9yIGRpcmVjdGlvbiAke2RpcmVjdGlvbn0gYW5kIG9wZXJhdG9yXCIke3Rva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIC8vYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XHJcbiAgICAgICAgLy9kZWxldGUgdGFyZ2V0LmluZGV4XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRhcmdldC5sZW5ndGg9PT0zKXtcclxuICAgICAgICAgICAgdGFyZ2V0PXRhcmdldC5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcclxuICAgICAgICB9ZWxzZSBpZih0YXJnZXQubGVuZ3RoPjEpbXVsdGlTdGVwPXRydWVcclxuICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHRva2VuczogdGFyZ2V0LFxyXG4gICAgICAgICAgICBtdWx0aVN0ZXA6IG11bHRpU3RlcCxcclxuICAgICAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXIsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XHJcbiAgICAgICAgcmV0dXJuICgoZ2V0T3BlcmF0b3JzQnlTaWRlcygnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpJiZ0aGlzLmxlZnQ/Lm11bHRpU3RlcCl8fHRoaXMucmlnaHQ/Lm11bHRpU3RlcCkmJnRoaXMub3BlcmF0b3I9PT0nTXVsdGlwbGljYXRpb24nO1xyXG4gICAgfVxyXG4gICAgaXNMZWZ0VmFyKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXA/dGhpcy5sZWZ0LnRva2Vucy5zb21lKHQ9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5sZWZ0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcclxuICAgIH1cclxuICAgIGlzUmlnaHRWYXIoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5yaWdodC5tdWx0aVN0ZXA/dGhpcy5yaWdodC50b2tlbnMuc29tZSh0PT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMucmlnaHQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxyXG4gICAgfVxyXG4gICAgY2hlY2tGcmFjKCl7Ly8hdGhpcy5jaGVja011bHRpU3RlcCgpIEkgZG9uJ3Qga25vdyB3aHkgSSBoYWQgdGhpcyBoZXJlXHJcbiAgICAgICAgcmV0dXJuIC8oZnJhY3xcXC8pLy50ZXN0KHRoaXMub3BlcmF0b3IpJiYodGhpcy5pc0xlZnRWYXIoKXx8dGhpcy5pc1JpZ2h0VmFyKCkpXHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gcmVhcnJhbmdlRXF1YXRpb24odG9rZW5zLHRva2VuVG9pc29sYXRlKXtcclxuICAgIFxyXG59XHJcbmZ1bmN0aW9uIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0b2tlbnMsaXNvbGF0VG9rZW4pe1xyXG4gICAgY29uc3QgaW5kZXg9b3BlcmF0aW9uc09yZGVyKHRva2VucylcclxuICAgIGNvbnN0IElzb2xhdGVkPXRva2Vucy50b2tlbnMuZmluZCgodG9rZW4sIGlkeCk9PmlkeDxpbmRleClcclxuICAgIGNvbnN0IGZyYWM9Y3JlYXRlRnJhYyguLi50b2tlbnMudG9rZW5zLnNsaWNlKGluZGV4KzEsdG9rZW5zLnRva2Vucy5sZW5ndGgpLG5ldyBUb2tlbihJc29sYXRlZC52YWx1ZSkpXHJcbiAgICBJc29sYXRlZC52YWx1ZT0xO1xyXG4gICAgdG9rZW5zLmluc2VydFRva2VucyhpbmRleCsxLHRva2Vucy50b2tlbnMubGVuZ3RoLWluZGV4KzEsZnJhYylcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRnJhYyhub21pbmF0b3IsZGVub21pbmF0b3Ipe1xyXG4gICAgcmV0dXJuIFtuZXcgVG9rZW4oJ2ZyYWMnKSxuZXcgVG9rZW4oJygnKSxub21pbmF0b3IsbmV3IFRva2VuKCcpJyksbmV3IFRva2VuKCcoJyksZGVub21pbmF0b3IsbmV3IFRva2VuKCcpJyldXHJcbn1cclxuZnVuY3Rpb24gc2ltcGxpZml5KHRva2Vucyl7XHJcbiAgICBpZiAodG9rZW5zLmxlbmd0aDw9MSl7cmV0dXJuIHRva2Vuc31cclxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xyXG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUodG9rZW4gPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSkpXHJcbiAgICB7XHJcbiAgICAgICAgaSsrO1xyXG4gICAgICAgIGxldCBlcWluZGV4PXRva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKTtcclxuICAgICAgICBsZXQgT3BlcmF0aW9uSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbikgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XHJcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxyXG5cclxuICAgICAgICBsZXQgY3VycmVudFRva2VuPXt0eXBlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgLCB2YWx1ZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YWx1ZSx2YXJpYWJsZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YXJpYWJsZSAscG93OiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnBvd31cclxuXHJcbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGkpID0+ICh7IHRva2VuLCBvcmlnaW5hbEluZGV4OiBpIH0pKSBcclxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxyXG4gICAgICAgIC5yZWR1Y2UoKHN1bSwgaXRlbSkgPT4ge1xyXG4gICAgICAgIGxldCBtdWx0aXBsaWVyPSh0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0gJiYgdG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdLnZhbHVlID09PSBcIi1cIikgPyAtMSA6IDE7XHJcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcclxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxyXG4gICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xyXG4gICAgICAgIH0sIDApOyBcclxuICAgICAgICBcclxuICAgICAgICBuZXdUb2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgIC4uLmN1cnJlbnRUb2tlbixcclxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXHJcbiAgICAgICAgICAgIHRva2VuLnR5cGUgIT09IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSB8fCBcclxuICAgICAgICAgICAgKHRva2VuLnZhcmlhYmxlICYmIHRva2VuLnZhcmlhYmxlICE9PSBjdXJyZW50VG9rZW4udmFyaWFibGUpIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ld1Rva2VucztcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRva2VucywgaXNvbGF0aW9uR29hbCkge1xyXG4gICAgaWYgKHRva2Vucy5sZW5ndGggPD0gMSkgcmV0dXJuIHRva2VucztcclxuXHJcbiAgICBjb25zdCBlcUluZGV4ID0gdG9rZW5zLnRva2Vucy5maW5kSW5kZXgodCA9PiB0LnZhbHVlID09PSAnRXF1YWxzJyk7XHJcbiAgICBpZiAoZXFJbmRleCA9PT0gLTEpIHRocm93IG5ldyBFcnJvcihcIk5vICdFcXVhbHMnIG9wZXJhdG9yIGZvdW5kIGluIHRva2Vuc1wiKTtcclxuXHJcbiAgICBjb25zdCBzd2l0Y2hEaXJlY3Rpb24gPSBmYWxzZTsgLy8gRnV0dXJlIGxvZ2ljIHRvIGRldGVybWluZSBkaXJlY3Rpb25cclxuICAgIGNvbnN0IGlzb2xhdGlvbkdvYWxJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHQsIGlkeCkgPT4gKHQudHlwZSA9PT0gaXNvbGF0aW9uR29hbC50eXBlICYmIHQudmFyaWFibGUgPT09IGlzb2xhdGlvbkdvYWwudmFsdWUgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKGlkeCA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgIGNvbnN0IG90aGVySW5kaWNlcyA9IHRva2Vucy50b2tlbnNcclxuICAgICAgICAubWFwKChfLCBpZHgpID0+ICghaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaWR4KSAmJiBpZHggIT09IGVxSW5kZXggPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKGlkeCA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgIC8vIEFkanVzdCBzaWduc1xyXG4gICAgdG9rZW5zLnRva2Vucy5mb3JFYWNoKCh0b2tlbiwgaSkgPT4ge1xyXG4gICAgICAgIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpID4gZXFJbmRleCA6IGkgPCBlcUluZGV4KSAmJiBvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHtcclxuICAgICAgICAgICAgdG9rZW4udmFsdWUgKj0gLTE7XHJcbiAgICAgICAgfSBlbHNlIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpIDwgZXFJbmRleCA6IGkgPiBlcUluZGV4KSAmJiBpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpKSkge1xyXG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTZXBhcmF0ZSBzaWRlc1xyXG4gICAgY29uc3Qgc2lkZTEgPSBbXTtcclxuICAgIGNvbnN0IHNpZGUyID0gW107XHJcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuLCBpKSA9PiB7XHJcbiAgICAgICAgaWYgKGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMS5wdXNoKHRva2VuKTtcclxuICAgICAgICBpZiAob3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMi5wdXNoKHRva2VuKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRva2Vucy50b2tlbnMgPSBzd2l0Y2hEaXJlY3Rpb25cclxuICAgICAgICA/IFsuLi5zaWRlMiwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTFdXHJcbiAgICAgICAgOiBbLi4uc2lkZTEsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUyXTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhQcmFpc2Vye1xyXG4gICAgaW5wdXQ9XCJcIjtcclxuICAgIHRva2Vucz1bXTtcclxuICAgIHNvbHV0aW9uPVwiXCI7XHJcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcclxuICAgIGk9MDtcclxuICAgIGNvbnN0cnVjdG9yKGlucHV0KXtcclxuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xyXG4gICAgICAgIHRoaXMucHJvY2Vzc0lucHV0KCk7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9bmV3IFRva2Vucyh0aGlzLmlucHV0KTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlRva2VucyBhZnRlciB0b2tlbml6ZVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICB0aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xyXG4gICAgfVxyXG4gICAgZ2V0UmVkeWZvck5ld1JvbmQoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoSW5mbyh0aGlzLnRva2VucylcclxuICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKHRoaXMudG9rZW5zLnRva2Vucyx0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoKVxyXG4gICAgICAgIHRoaXMudG9rZW5zLmV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCk7XHJcbiAgICB9XHJcbiAgICBjb250cm9sbGVyKCl7XHJcbiAgICAgICAgdGhpcy5pKys7XHJcbiAgICAgICAgaWYodGhpcy5pPjEwKXtyZXR1cm4gdGhpcy5maW5hbFJldHVybigpfVxyXG5cclxuICAgICAgICB0aGlzLmdldFJlZHlmb3JOZXdSb25kKCk7XHJcbiAgICAgICAgLy9jb25zdCBvdmVydmlldz10aGlzLnRva2Vucy5nZXRPdmVydmlldygpXHJcbiAgICAgICAgY29uc3QgcHJhaXNpbmdNZXRob2Q9bmV3IFByYWlzaW5nTWV0aG9kKHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICBpZiAocHJhaXNpbmdNZXRob2QuaXNUaGVyZU9wZXJhdG9yT3RoZXJUaGFuRXF1YWxzKCkpe1xyXG4gICAgICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUGFyc2VkIGV4cHJlc3Npb25cIiwgSlNPTi5zdHJpbmdpZnkocG9zaXRpb24sIG51bGwsIDEpKTtcclxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uID09PSBudWxsJiZ0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjEpe1xyXG4gICAgICAgICAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyhcInBhcnNlKHRva2VucylcIixwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGhlICoqKipcIlxyXG4gICAgICAgICAgICAvLyByZXR1cm4gc29sdXRpb24odG9rZW5zKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvKlxyXG4gICAgICAgICAgICBlbHNlIGlmIChwb3NpdGlvbi5pbmRleCA9PT0gbnVsbCl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5maW5hbFJldHVybigpO1xyXG4gICAgICAgICAgICB9Ki9cclxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uLmNoZWNrRnJhYygpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnVzZVBhcnNlKHBvc2l0aW9uKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZihwcmFpc2luZ01ldGhvZC5pc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpKXtcclxuICAgICAgICAgICAgdGhpcy51c2VJc29sYXQocHJhaXNpbmdNZXRob2QpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRvSXNvbGF0ZT1wcmFpc2luZ01ldGhvZC5pc0FueXRoaW5nVG9Jc29sYXRlKClcclxuICAgICAgICBpZiAodG9Jc29sYXRlKXtcclxuICAgICAgICAgICAgcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRoaXMudG9rZW5zLHRvSXNvbGF0ZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgfSAgIFxyXG4gICAgICAgIC8vaWYgKHNvbHZlZCA9PT0gbnVsbHx8dHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKS8vdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTtcclxuICAgIH1cclxuXHJcbiAgICB1c2VQYXJzZShwb3NpdGlvbil7XHJcbiAgICAgICAgY29uc3Qgc29sdmVkID0gcGFyc2UocG9zaXRpb24pO1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxyXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXHJcbiAgICAgICAgdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKGxlZnRCcmVhayxsZW5ndGgsc29sdmVkKVxyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcmFpc2luZ01ldGhvZCgpe1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcclxuICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVzZVF1YWRyYXRpYygpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMudXNlSXNvbGF0KCk7Ki9cclxuICAgIH1cclxuXHJcbiAgICB1c2VJc29sYXQocHJhaXNpbmdNZXRob2Qpe1xyXG4gICAgICAgIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0aGlzLnRva2VucyxuZXcgVG9rZW4ocHJhaXNpbmdNZXRob2QudmFyaWFibGVzWzBdKSlcclxuICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcclxuICAgICAgICAvL3RoaXMudG9rZW5zLmluc2VydFRva2VucygpXHJcbiAgICAgICAgLy9Vc2UgcG9zc2Vzc2lvblxyXG4gICAgfVxyXG5cclxuICAgIHVzZVF1YWRyYXRpYygpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zLnRva2Vucz1zaW1wbGlmaXkodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGUpPT50aGlzLnRva2Vucy50b2tlbnMuZmlsdGVyKHRva2VuID0+IHRva2VuLnR5cGUgPT09IHR5cGUpO1xyXG4gICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcXVhZChcclxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXT8udmFsdWUgIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdPy52YWx1ZSB8IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0/LnZhbHVlICogLTF8IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obWVzLHZhbHVlKXtcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhtZXMsdmFsdWUpXHJcbiAgICB9XHJcbiAgICBwcm9jZXNzSW5wdXQoKXtcclxuICAgICAgICB0aGlzLmlucHV0PXRoaXMuaW5wdXRcclxuICAgICAgICAucmVwbGFjZSgvKE1hdGgufFxcXFx8XFxzfGxlZnR8cmlnaHQpL2csIFwiXCIpIFxyXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC99L2csIFwiKVwiKVxyXG4gICAgICAgIC8vLnJlcGxhY2UoLyg/PCFcXFxcfFthLXpBLVpdKSh0YW58c2lufGNvc3xiaW5vbXxmcmFjfGFzaW58YWNvc3xhdGFufGFyY2Nvc3xhcmNzaW58YXJjdGFufGNkb3QpL2csIFwiXFxcXCQxXCIpO1xyXG4gICAgfVxyXG4gICAgZmluYWxSZXR1cm4oKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgVG9rZW5ze1xyXG4gICAgdG9rZW5zPVtdO1xyXG4gICAgY29uc3RydWN0b3IobWF0aCl7XHJcbiAgICAgICAgdGhpcy50b2tlbml6ZShtYXRoKTtcclxuICAgIH1cclxuICAgIHRva2VuaXplKG1hdGgpe1xyXG4gICAgICAgIC8vbGF0ZXhPcGVyYXRvcnMucHVzaChTdHJpbmcucmF3YFsqL149XFwrXFwtXFwoXFwpXWApXHJcbiAgICAgICAgLy9jb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhsYXRleE9wZXJhdG9ycylcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxMYXRleFJlZmVyZW5jZXMoKSlcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBUb2tlbihtYXRjaFswXSkpO1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTE7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvKmlmICh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnZhbHVlID09PSBcInNxcnRcIiAmJiBtYXRoW2ldID09PSBcIltcIiAmJiBpIDwgbWF0aC5sZW5ndGggLSAyKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcclxuICAgICAgICAgICAgICAgIGkrPXRlbXAubGVuZ3RoXHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLHtzcGVjaWFsQ2hhcjogc2FmZVRvTnVtYmVyKHRlbXApLH0pXHJcbiAgICAgICAgICAgIH0qL1xyXG5cclxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xyXG4gICAgICAgICAgICBpZiAoISFtYXRjaClcclxuICAgICAgICAgICAgeyAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBUb2tlbihwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICAvL2lmICh2YXJpJiZ2YXJpLmxlbmd0aD09PTApe3Zhcmk9bWF0aC5zbGljZShpLG1hdGgubGVuZ3RoKX1cclxuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBUb2tlbigxLG1hdGNoWzBdKSlcclxuICAgICAgICAgICAgICAgIC8vdG9rZW5zLnB1c2goe3R5cGU6IFwidmFyaWFibGVcIix2YXJpYWJsZTogdmFyaS5yZXBsYWNlKFwiKFwiLFwie1wiKS5yZXBsYWNlKFwiKVwiLFwifVwiKSx2YWx1ZTogMX0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucG9zdFByb2Nlc3NUb2tlbnMoKTtcclxuICAgIH1cclxuXHJcbiAgICB2YWxpZGF0ZUluZGV4KGluZGV4LG1hcmdpbil7XHJcbiAgICAgICAgbWFyZ2luPW1hcmdpbnx8MDtcclxuICAgICAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtbWFyZ2luO1xyXG4gICAgfVxyXG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpe1xyXG4gICAgICAgIGNvbnN0IHRlc3REb3VibGVSaWdodCA9IChpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgaWR4PXRoaXMuZmluZFBhcmVuSW5kZXgobnVsbCxpbmRleCkub3BlbjtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zW2luZGV4KzFdPy52YWx1ZT09PScoJyYmKGlkeD09PTB8fCFnZXRPcGVyYXRvcnNCeVNpZGVzKCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMudG9rZW5zW2lkeC0xXT8udmFsdWUpKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vTWFwIHBhcmVudGhlc2VzIGZvciBpbXBsaWNpdCBtdWx0aXBsaWNhdGlvbi5cclxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHsgXHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8IChoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLnZhbHVlKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHx0ZXN0RG91YmxlUmlnaHQoaW5kZXgpPyBpbmRleCsxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIG1hcFxyXG4gICAgfVxyXG5cclxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XHJcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udmFsdWU9PT0nUGx1cyd8fHRva2VuLnZhbHVlPT09J01pbnVzJz9pbmRleDpudWxsKS5maWx0ZXIoaW5kZXg9PiBpbmRleCE9PW51bGwpXHJcblxyXG4gICAgICAgIG1hcC5mb3JFYWNoKGluZGV4ID0+IHtcclxuICAgICAgICAgICAgaW5kZXg9dGhpcy52YWxpZGF0ZUluZGV4KGluZGV4LDEpJiZ0aGlzLnRva2Vuc1tpbmRleC0xXS50eXBlPT09J29wZXJhdG9yJ3x8dGhpcy50b2tlbnNbaW5kZXgrMV0udHlwZT09PSdvcGVyYXRvcic/bnVsbDppbmRleDtcclxuICAgICAgICB9KTtcclxuICAgICAgICBtYXAucmV2ZXJzZSgpLmZvckVhY2goaW5kZXggPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB2YWx1ZT10aGlzLnRva2Vuc1tpbmRleF0udmFsdWU9PT0nUGx1cyc/MTotMTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXgrMV0udmFsdWUqPXZhbHVlO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICBcclxuICAgICAgICB0aGlzLklEcGFyZW50aGVzZXMoKTtcclxuICAgICAgICBjb25zdCBtYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiAodG9rZW4uaXNWYWx1ZVRva2VuKCkpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgYXJyPWZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhtYXApO1xyXG5cclxuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcclxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcGFyZW5NYXA9dGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuICAgICAgICBwYXJlbk1hcC5zb3J0KChhLCBiKSA9PiBiIC0gYSlcclxuICAgICAgICAuZm9yRWFjaCh2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3IFRva2VuKCcqJykpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBtYXBQb3c9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi52YWx1ZT09PSdQb3cnP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc29sZS5sb2cobWFwUG93KVxyXG4gICAgICAgIG1hcFBvdy5mb3JFYWNoKGluZGV4ID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coaW5kZXgsbmV3IFBvc2l0aW9uKHRoaXMsaW5kZXgpKVxyXG4gICAgICAgICAgICBjb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyB0aGlzLmZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgpIDogbnVsbClcclxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbClcclxuICAgIH1cclxuXHJcbiAgICBmaWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFlbCgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXHJcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeyBvcGVuOiBvcGVuSW5kZXgsIGNsb3NlOiBjbG9zZUluZGV4IH0gPSBpdGVtO1xyXG4gICAgICAgICAgICBpZiAob3BlbkluZGV4PjApIHtcclxuICAgICAgICAgICAgICAgIGlmICgvKG9wZXJhdG9yfHBhcmVuKS8udGVzdCh0aGlzLnRva2Vuc1tvcGVuSW5kZXggLSAxXS50eXBlKSkgey8vICYmIHByZXZUb2tlbi52YWx1ZSAhPT0gXCI9XCJcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoY2xvc2VJbmRleDx0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdLmlzVmFsdWVUb2tlbigpKSB7Ly90aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV1cclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9KS5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pO1xyXG4gICAgfVxyXG4gICAgLypcclxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICAgfSovXHJcblxyXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xyXG4gICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIFRva2VuKSl7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJmdHlndWJobmltcG9cIilcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1hcCA9IG5ldyBTZXQodGhpcy5maWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFlbCgpKTtcclxuICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAhbWFwLmhhcyhpZHgpKTtcclxuICAgICAgICAvL1Byb2JsZW0gd2l0aCAgPSBhcyBpdCdzIGFmZmVjdGluZyB0aGUgdmFyaWFibGUgYmVmb3JlIGl0XHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4IC0gMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKCkgJiZcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4ICsgMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKClcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBhcnIgPSBbXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhudW1NYXApLCBcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5JRHBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBjb25uZWN0QW5kQ29tYmluZShhcnIpe1xyXG4gICAgICAgIGNvbnN0IGluZGV4ZXM9W11cclxuXHJcbiAgICAgICAgYXJyLnNvcnQoKGEsIGIpID0+IGJbMF0gLSBhWzBdKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgaW5kZXhlcy5wdXNoKHtzdGFydDogZWxbMF0sZW5kOiBlbFtlbC5sZW5ndGggLSAxXX0pXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGluZGV4ZXMuZm9yRWFjaChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IE51bWJlcih0aGlzLnRva2Vuc1tpbmRleC5zdGFydF0udmFsdWUpO1xyXG4gICAgICAgICAgICBjb25zdCBpc1Zhcj10aGlzLnRva2Vucy5zbGljZShpbmRleC5zdGFydCxpbmRleC5lbmQrMSkuZmluZCh0b2tlbj0+IHRva2VuLnR5cGUuaW5jbHVkZXMoJ3ZhcicpKTtcclxuICAgICAgICAgICAgZm9yIChsZXQgaT1pbmRleC5zdGFydCsxO2k8PWluZGV4LmVuZDtpKyspe1xyXG4gICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMudG9rZW5zW2ldLnZhbHVlICsgdmFsdWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vaWYgKGlzVmFyKXVwZGF0ZWRUb2tlbi52YXJpYWJsZT1pc1Zhci52YXJpYWJsZVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleC5zdGFydF0gPSBuZXcgVG9rZW4odmFsdWUsaXNWYXI/LnZhcmlhYmxlKTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LnN0YXJ0KzEsIGluZGV4LmVuZCAtIGluZGV4LnN0YXJ0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXHJcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcclxuICAgICAgICApXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgIH1cclxuXHJcbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQsIGxlbmd0aCwgb2JqZWN0cykge1xyXG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlY29uc3RydWN0KHRva2Vucyl7XHJcbiAgICAgICAgaWYgKCF0b2tlbnMpe3Rva2Vucz10aGlzLnRva2Vuczt9XHJcbiAgICAgICAgY29uc3QgYWRkUGx1c0luZGV4ZXM9dGhpcy5pbmRleGVzVG9BZGRQbHVzKHRva2Vucyk7XHJcbiAgICAgICAgY29uc3QgY3VybHlCcmFja2V0SW5kZXhlcyA9IHRoaXMuY3VybHlCcmFja2V0SURzKHRva2VucykuZmxhdE1hcCgoeyBvcGVuLCBjbG9zZSB9KSA9PiBbb3BlbiwgY2xvc2VdKTtcclxuICAgICAgICBsZXQgbWF0aCA9IFwiXCI7XHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8dG9rZW5zLmxlbmd0aDtpKyspe1xyXG4gICAgICAgICAgICBsZXQgdGVtcDtcclxuICAgICAgICAgICAgbWF0aCs9YWRkUGx1c0luZGV4ZXMuaW5jbHVkZXMoaSk/JysnOicnO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldPy52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbdG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuLCBpbmRleCkgPT4gdG9rZW4uaWQgPT09IHRva2Vuc1tpXS5pZCYmdG9rZW5zW2luZGV4KzFdKSsxXS52YWx1ZT09PVwiL1wiKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBtYXRoKz1cIlxcXFxmcmFjXCI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc3dpdGNoICh0b2tlbnNbaV0/LnR5cGUpe1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm51bWJlclwiOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwicG93ZXJWYXJpYWJsZVwiOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm9wZXJhdG9yXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpXSBpbnN0YW5jZW9mIFRva2VuKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0/LnRvU3RyaW5nTGF0ZXgoKVxyXG4gICAgICAgICAgICAgICAgICAgIC8vdGVtcD1yb3VuZEJ5U2V0dGluZ3ModG9rZW5zW2ldLnZhbHVlKVxyXG4gICAgICAgICAgICAgICAgICAgIC8vbWF0aCs9dGVtcCsoaSsxPHRva2Vucy5sZW5ndGgmJi8oZnJhYykvLnRlc3QodG9rZW5zW2krMV0udmFsdWUpP1wiK1wiOlwiXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInBhcmVuXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9Y3VybHlCcmFja2V0SW5kZXhlcy5jb250YWlucyhpKT90b2tlbnNbaV0udmFsdWUucmVwbGFjZSgvXFwoLyxcIntcIikucmVwbGFjZSgvXFwpLyxcIn1cIik6dG9rZW5zW2ldLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKHRoaXMudG9rZW5zKVxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCB0b2tlbiB0eXBlIGdpdmVuIHRvIHJlY29uc3RydWN0OiB0eXBlICR7dG9rZW5zW2ldPy50eXBlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRoXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGN1cmx5QnJhY2tldElEcyh0b2tlbnMgPSB0aGlzLnRva2Vucykge1xyXG4gICAgICAgIGNvbnN0IHJpZ2h0QnJhY2tldHMgPSBbLi4uZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJyksIC4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgncmlnaHQnKV07XHJcbiAgICAgICAgY29uc3QgYm90aEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpXTtcclxuICAgICAgICBjb25zdCBkb3VibGVSaWdodEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnZG91YmxlUmlnaHQnKV07XHJcbiAgICAgICAgY29uc3QgbWFwID0gW107XHJcbiAgICBcclxuICAgICAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW4sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRva2Vuc1tpbmRleCAtIDFdPy52YWx1ZTtcclxuICAgICAgICAgICAgY29uc3QgbmV4dFRva2VuID0gdG9rZW5zW2luZGV4ICsgMV0/LnZhbHVlO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmICh0b2tlbi52YWx1ZSA9PT0gJygnKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAwICYmIGRvdWJsZVJpZ2h0QnJhY2tldHMuaW5jbHVkZXMocHJldlRva2VuKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gdGhpcy5maW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4LCB0b2tlbnMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gdGhpcy5maW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIHAxLmNsb3NlICsgMSwgdG9rZW5zKTtcclxuICAgICAgICAgICAgICAgICAgICBtYXAucHVzaChwMSwgcDIpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpbmRleCA+IDAgJiYgcmlnaHRCcmFja2V0cy5pbmNsdWRlcyhwcmV2VG9rZW4pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLnB1c2godGhpcy5maW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4LCB0b2tlbnMpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlbi52YWx1ZSA9PT0gJyknICYmIGJvdGhCcmFja2V0cy5pbmNsdWRlcyhuZXh0VG9rZW4pKSB7XHJcbiAgICAgICAgICAgICAgICBtYXAucHVzaCh0aGlzLmZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2VucykpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIGluZGV4ZXNUb0FkZFBsdXModG9rZW5zKXtcclxuICAgICAgICByZXR1cm4gdG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT5pbmRleD4wXHJcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXHJcbiAgICAgICAgICAgICYmdG9rZW4/LmlzVmFsdWVUb2tlbigpJiZ0b2tlbi52YWx1ZT49MD9pbmRleDpudWxsXHJcbiAgICAgICAgKS5maWx0ZXIoaXRlbT0+aXRlbSE9PW51bGwpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHRva2VuQ29tcGFyZShjb21wYXJlLCB2YWx1ZSwgdG9rZW4sIG5leHRUb2tlbikge1xyXG4gICAgICAgIHZhbHVlID0gdmFsdWUgaW5zdGFuY2VvZiBSZWdFeHAgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcclxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBJRHBhcmVudGhlc2VzKCkge1xyXG4gICAgICAgIGxldCB0b2tlbnM9dGhpcy50b2tlbnNcclxuICAgICAgICBsZXQgYnJhY2tldHMgPSAwLCBsZXZlbENvdW50ID0ge307XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIoXCIpIHtcclxuICAgICAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xyXG4gICAgICAgICAgICAgICAgdG9rZW5zW2ldLmlkID0gbmV3IFBhcmVuKGJyYWNrZXRzLElEKS8vICsgXCIuXCIgKyA7XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cysrO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gXCIpXCIpIHtcclxuICAgICAgICAgICAgICAgIGJyYWNrZXRzLS07XHJcbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XHJcbiAgICAgICAgICAgICAgICAvLyBSZWFzc2lnbiB0aGUgb2JqZWN0IHdpdGggdGhlIG5ldyBpZCB0byBlbnN1cmUgcGVyc2lzdGVuY2VcclxuICAgICAgICAgICAgICAgIHRva2Vuc1tpXS5pZCA9IG5ldyBQYXJlbihicmFja2V0cyxJRCkvL2JyYWNrZXRzICsgXCIuXCIrSUQ7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoYnJhY2tldHMhPT0wKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy90aHJvdyBuZXcgRXJyb3IgKFwiVW5tYXRjaGVkIG9wZW5pbmcgYnJhY2tldChzKSBlcnIgcmF0ZTogXCIrYnJhY2tldHMpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2VucztcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnIpIHtcclxuICAgIGxldCByZXN1bHQgPSBbXTtcclxuICAgIGxldCBzdGFjayA9IEFycmF5LmlzQXJyYXkoYXJyKSA/IFsuLi5hcnJdIDogW2Fycl07XHJcblxyXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IG5leHQgPSBzdGFjay5wb3AoKTtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShuZXh0KSkge1xyXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyBcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaChuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcclxufVxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgVG9rZW57XHJcbiAgICB0eXBlO1xyXG4gICAgdmFsdWU7XHJcbiAgICB2YXJpYWJsZTtcclxuICAgIG1vZGlmaWVyO1xyXG4gICAgaWQ7XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlLHZhcmlhYmxlKXtcclxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XHJcbiAgICAgICAgdGhpcy5zZXRUeXBlKCk7XHJcbiAgICAgICAgdGhpcy5pbnN1clByb3BlckZvcm1hdHRpbmcoKVxyXG4gICAgfVxyXG4gICAgaW5zdXJQcm9wZXJGb3JtYXR0aW5nKCl7XHJcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdvcGVyYXRvcicpe1xyXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXNlYXJjaE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubmFtZVxyXG4gICAgICAgIH1cclxuICAgICAgIC8vIGlmICghdGhpcy52YWx1ZSl7dGhyb3cgbmV3IEVycm9yKCd3dGYgVmFsdWUgd2FzIHVuZGVmaW5lZCBhdCB0b2tlbiBpbnN1clByb3BlckZvcm1hdHRpbmcnKX1cclxuICAgIH1cclxuICAgIGdldElkKCl7cmV0dXJuIHRoaXMuaWQuaWR9O1xyXG5cclxuICAgIGdldExhdGV4U3ltYm9sKCl7cmV0dXJuIHNlYXJjaFN5bWJvbHModGhpcy52YWx1ZSk/LmxhdGV4fVxyXG5cclxuICAgIGdldEZ1bGxUb2tlbklEKCl7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcclxuICAgICAgICAgICAgY2FzZSAncHJhbmUnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZTtcclxuICAgICAgICAgICAgY2FzZSAnb3BlcmF0b3InOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZSsnOicrdGhpcy52YWx1ZVxyXG4gICAgICAgICAgICBjYXNlICd2YXJpYWJsZSc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlKyc6Jyt0aGlzLnZhcmlhYmxlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgZ2V0ZnVsbFR5cGUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50eXBlXHJcbiAgICB9XHJcblxyXG4gICAgc2V0VHlwZSgpe1xyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnKXtcclxuICAgICAgICAgICAgdGhpcy50eXBlPXRoaXMudmFsdWUubWF0Y2goL1soKV0vKT8ncGFyZW4nOidvcGVyYXRvcic7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50eXBlPXRoaXMudmFyaWFibGU/J3ZhcmlhYmxlJzonbnVtYmVyJztcclxuICAgIH1cclxuXHJcbiAgICBpc1N0cmluZygpe3JldHVybiB0aGlzLnR5cGU9PT0ncGFyZW4nfHx0aGlzLnR5cGU9PT0nb3BlcmF0b3InfVxyXG5cclxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cclxuXHJcbiAgICB0b1N0cmluZ0xhdGV4KCl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmICh0aGlzLmlzU3RyaW5nKCkpXHJcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy5nZXRMYXRleFN5bWJvbCh0aGlzLnZhbHVlKVxyXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0ndmFyaWFibGUnKSBzdHJpbmcrPXRoaXMudG9TdHJpbmdWYXJpYWJsZSgpXHJcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdudW1iZXInKSBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZ1xyXG4gICAgfVxyXG4gICAgYWZmZWN0ZWRPcGVyYXRvclJhbmdlKGRpcmVjdGlvbil7XHJcbiAgICAgICAgaWYodGhpcy50eXBlIT09J29wZXJhdG9yJ3x8dGhpcy52YWx1ZT09PSdFcXVhbHMnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICBpZihkaXJlY3Rpb249PT0nbGVmdCcmJiFnZXRPcGVyYXRvcnNCeVNpZGVzKCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcikpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcbiAgICB0b1N0cmluZ1ZhcmlhYmxlKCl7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLnZhbHVlIT09MT90aGlzLnZhbHVlOicnKSt0aGlzLnZhcmlhYmxlO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQcmFpc2luZ01ldGhvZHtcclxuICAgIHRva2Vuc1xyXG4gICAgb3ZlcnZpZXc7XHJcbiAgICB2YXJpYWJsZXM7XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnMpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2Vuc1xyXG4gICAgICAgIHRoaXMub3ZlcnZpZXc9dGhpcy5nZXRPdmVydmlldygpXHJcbiAgICAgICAgdGhpcy5hc3NpZ25WYXJpYWJsZXMoKVxyXG4gICAgfVxyXG4gICAgaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnNvbWUodD0+IHQudHlwZT09PSd2YXJpYWJsZScmJnQudmFsdWU+MSlcclxuICAgIH1cclxuXHJcbiAgICBpc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhhc2VWYXJpYWJsZSgpJiZ0aGlzLmlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpJiZ0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKClcclxuICAgIH1cclxuICAgIGlzSXNvbGF0ZSgpe1xyXG4gICAgICAgIC8vcmV0dXJuIHRoaXMuXHJcbiAgICB9XHJcblxyXG4gICAgaXNBbnl0aGluZ1RvSXNvbGF0ZSgpe1xyXG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzLmxlbmd0aD4xKXRocm93IG5ldyBFcnJvcihcInR3byB2YXIgZXEgYXJlbnQgc2Fwb3J0ZWQgeWV0XCIpXHJcbiAgICAgICAgaWYoIXRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlyZXR1cm47XHJcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLmVxdWFsc0luZGV4SWZBbnkoKTtcclxuICAgICAgICBpZighZXFJbmRleCl7cmV0dXJufTtcclxuICAgICAgICBjb25zdCBiZWZvciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoMCxlcUluZGV4KSlcclxuICAgICAgICBjb25zdCBhZnRlciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoZXFJbmRleCsxKSlcclxuICAgICAgICBjb25zdCB3aGF0VG9Jc29sYXQgPXRoaXMud2hhdFRvSXNvbGF0KCk7XHJcbiAgICAgICAgaWYgKCF3aGF0VG9Jc29sYXR8fChiZWZvcj8uc2l6ZTwyJiZhZnRlcj8uc2l6ZTwyKSlyZXR1cm47XHJcbiAgICAgICAgcmV0dXJuIHtvdmVydmlld1NpZGVPbmU6IGJlZm9yLG92ZXJ2aWV3U2lkZVR3bzogYWZ0ZXIsLi4ud2hhdFRvSXNvbGF0fVxyXG4gICAgfVxyXG4gICAgaG93VG9Jc29sYXRlKG92ZXJ2aWV3U2lkZU9uZSxvdmVydmlld1NpZGVUd28saXNvbGF0aW9uR29vbCl7XHJcbiAgICAgICAgY29uc3QgaXNvbGF0aW9uVHlwZT1pc29sYXRpb25Hb29sLnNwbHQoJzonKTtcclxuICAgICAgICAvL2lmICgpe31cclxuICAgIH1cclxuICAgIHdoYXRUb0lzb2xhdCgpe1xyXG4gICAgICAgIC8vIGkgbmVlZCB0byBhZGQgcG93cyBhZnRlclxyXG4gICAgICAgIC8vIGZvciBrbm93IGltIGdvaW5nIG9uIHRoZSBvc2hvbXNoaW4gdGhhdCB0aHIgaXMgb25seSBvbmUgdmFyXHJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXM/Lmxlbmd0aDwxKXJldHVybjtcclxuXHJcbiAgICAgICAgcmV0dXJuIHt0eXBlOiAndmFyaWFibGUnLHZhbHVlOiB0aGlzLnZhcmlhYmxlc1swXX1cclxuICAgIH1cclxuICAgIGlzT3ZlcnZpZXdUb2lzb2xhdChvdmVydmlldyl7XHJcbiAgICB9XHJcbiAgICBpc0ltYmFsYW5jZShvdmVydmlldyl7XHJcbiAgICAgICAgb3ZlcnZpZXcuc2l6ZT4xXHJcbiAgICB9XHJcbiAgICBlcXVhbHNJbmRleElmQW55KCl7XHJcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLnRva2Vucy5tYXAoKHQsaWR4KT0+dC52YWx1ZT09PSdFcXVhbHMnP2lkeDpudWxsKS5maWx0ZXIobT0+bSE9PW51bGwpO1xyXG4gICAgICAgIHJldHVybiBlcUluZGV4WzBdO1xyXG4gICAgfVxyXG4gICAgaXNRdWFkcmF0aWMoKXtcclxuXHJcbiAgICB9XHJcbiAgICBpc0ZpbmFsUmV0dXJuKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmxlbmd0aDwyfHwodGhpcy5pc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhc3NpZ25WYXJpYWJsZXMoKXtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcz1bXVxyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKXtcclxuICAgICAgICAgICAgaWYgKGtleT8uc3RhcnRzV2l0aCgndmFyaWFibGU6JykmJiF0aGlzLnZhcmlhYmxlcy5pbmNsdWRlcyh2YWx1ZS52YXJpYWJsZSkpe1xyXG4gICAgICAgICAgICAgICAgdGhpcy52YXJpYWJsZXMucHVzaCh2YWx1ZS52YXJpYWJsZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBoYXNlVmFyaWFibGUoKXtyZXR1cm4gdGhpcy52YXJpYWJsZXM/Lmxlbmd0aD4wfVxyXG5cclxuICAgIGlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpe1xyXG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxyXG4gICAgICAgIHJldHVybiAgZmlsdGVyLm5vTWF0Y2g+MFxyXG4gICAgfVxyXG4gICAgaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKXtcclxuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcclxuICAgICAgICByZXR1cm4gIGZpbHRlci5tYXRjaD09PTEmJmZpbHRlci5ub01hdGNoPT09MFxyXG4gICAgfVxyXG5cclxuICAgIGZpbHRlckJ5VHlwZSh0eXBlS2V5LCB0YXJnZXRWYWx1ZSl7XHJcbiAgICAgICAgbGV0IG1hdGNoPTAsIG5vTWF0Y2g9MFxyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgodHlwZUtleSkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IHR5cGVLZXkrJzonK3RhcmdldFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2grKztcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm9NYXRjaCsrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IG1hdGNoOiBtYXRjaCwgbm9NYXRjaDogbm9NYXRjaCB9O1xyXG4gICAgfVxyXG4gICAgZ2V0T3ZlcnZpZXcodG9rZW5zKSB7XHJcbiAgICAgICAgaWYoIXRva2Vucyl0b2tlbnM9dGhpcy50b2tlbnNcclxuICAgICAgICBjb25zdCBvdmVydmlldyA9IG5ldyBNYXAoKTtcclxuICAgIFxyXG4gICAgICAgIHRva2Vucy5mb3JFYWNoKHRva2VuID0+IHtcclxuICAgICAgICAgICAgLy9pZiAoIXRva2VuLmlzVmFsdWVUb2tlbigpKSB7cmV0dXJuO31cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRva2VuLmdldEZ1bGxUb2tlbklEKClcclxuICAgICAgICAgICAgLy9FcXVhbHNcclxuICAgICAgICAgICAgaWYgKCFvdmVydmlldy5oYXMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZW50cnkgPSB7IFxyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLnR5cGUsIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiAwIFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09PSAndmFyaWFibGUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW50cnkudmFyaWFibGUgPSB0b2tlbi52YXJpYWJsZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICAgICAgb3ZlcnZpZXcuc2V0KGtleSwgZW50cnkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG92ZXJ2aWV3LmdldChrZXkpLmNvdW50Kys7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG92ZXJ2aWV3Ly9BcnJheS5mcm9tKG92ZXJ2aWV3LnZhbHVlcygpKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyBNb2RpZmllcntcclxuXHJcbn0iXX0=