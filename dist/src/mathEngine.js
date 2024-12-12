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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXRoRW5naW5lLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxJQUFJLEVBQUMsY0FBYyxFQUFDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBQyxrQkFBa0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzFCLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsd0JBQXdCLEVBQUUscUJBQXFCLEVBQUUsc0JBQXNCLEVBQUUsbUJBQW1CLEVBQUUseUJBQXlCLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2pOLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDeEIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzlDLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFHO0lB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LFdBQVc7SUFDN0MsTUFBTSxLQUFLLEdBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQ25DLE1BQU0sUUFBUSxHQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBQyxFQUFFLENBQUEsR0FBRyxHQUFDLEtBQUssQ0FBQyxDQUFBO0lBQzFELE1BQU0sSUFBSSxHQUFDLFVBQVUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBQyxDQUFDLEVBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQTtJQUNyRyxRQUFRLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQztJQUNqQixNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssR0FBQyxDQUFDLEVBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUMsS0FBSyxHQUFDLENBQUMsRUFBQyxJQUFJLENBQUMsQ0FBQTtBQUNsRSxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsU0FBUyxFQUFDLFdBQVc7SUFDckMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFDLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFDLFNBQVMsRUFBQyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBQyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBQyxXQUFXLEVBQUMsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtBQUNoSCxDQUFDO0FBQ0QsU0FBUyxTQUFTLENBQUMsTUFBTTtJQUNyQixJQUFJLE1BQU0sQ0FBQyxNQUFNLElBQUUsQ0FBQyxFQUFDO1FBQUMsT0FBTyxNQUFNLENBQUE7S0FBQztJQUNwQyxJQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsU0FBUyxHQUFDLEVBQUUsQ0FBQztJQUNyQixPQUFPLENBQUMsSUFBRSxHQUFHLElBQUUsTUFB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QUFHLEdBQUcsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFBO1lBQ2xDLFFBQVE7WUFDUixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDcEIsTUFBTSxLQUFLLEdBQUc7b0JBQ1YsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO29CQUNoQixLQUFLLEVBQUUsQ0FBQztpQkFDWCxDQUFDO2dCQUNGLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUU7b0JBQzNCLEtBQUssQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztpQkFDbkM7Z0JBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7YUFDNUI7WUFDRCxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxRQUFRLENBQUEsQ0FBQSxnQ0FBZ0M7SUFDbkQsQ0FBQztDQUNKO0FBSUQsTUFBTSxRQUFRO0NBRWIiLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXN9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4vaW1WZXJ5TGF6eVwiO1xuaW1wb3J0IHsgdHlwZSB9IGZyb20gXCJvc1wiO1xuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgcmVnRXhwIH0gZnJvbSBcIi4vdGlrempheC90aWt6amF4XCI7XG5pbXBvcnQgeyBnZXRBbGxMYXRleFJlZmVyZW5jZXMsIGdldEFsbE9wZXJhdG9yUmVmZXJlbmNlcywgZ2V0T3BlcmF0b3JzQnlCcmFja2V0LCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeVNpZGVzLCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBzZWFyY2hPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi91dGlscy9zeW1ib2xzXCI7XG5pbXBvcnQgeyBjcCB9IGZyb20gXCJmc1wiO1xuaW1wb3J0IHsgUGFyZW4gfSBmcm9tIFwiLi91dGlscy90b2tlblV0ZW5zaWxzXCI7XG5jb25zdCBncmVla0xldHRlcnMgPSBbXG4gICAgJ0FscGhhJywnYWxwaGEnLCAnQmV0YScsICdHYW1tYScsICdEZWx0YScsICdFcHNpbG9uJywgJ1pldGEnLCAnRXRhJywgJ1RoZXRhJywgXG4gICAgJ0lvdGEnLCAnS2FwcGEnLCAnTGFtYmRhJywgJ011JywnbXUnLCAnTnUnLCAnWGknLCAnT21pY3JvbicsICdQaScsICdSaG8nLCBcbiAgICAnU2lnbWEnLCAnVGF1JywgJ1Vwc2lsb24nLCAnUGhpJywgJ0NoaScsICdQc2knLCAnT21lZ2EnXG5dO1xuLypjb25zdCBsYXRleE9wZXJhdG9ycz1bXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXG4gICAgJ2F0YW4nLCAnYXJjY29zJywgJ2FyY3NpbicsICdhcmN0YW4nLCAnY2RvdCcsJ3NxcnQnXG5dKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhhcnIpIHtcbiAgICBjb25zdCBzZXF1ZW5jZXMgPSBbXTtcbiAgICBsZXQgc3RhcnQgPSAwO1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IGFyci5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYXJyW2ldICE9PSBhcnJbaSAtIDFdICsgMSkge1xuICAgICAgICAgICAgaWYgKGkgLSBzdGFydCA+IDEpIHtcbiAgICAgICAgICAgICAgICBzZXF1ZW5jZXMucHVzaChhcnIuc2xpY2Uoc3RhcnQsIGkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXJ0ID0gaTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc2VxdWVuY2VzO1xufVxuXG5cbmNvbnN0IG9wZXJhdG9yc0Zvck1hdGhpbmZvID0ge1xuICAgIGJvdGhCdXRSaWdodEJyYWNrZXQ6IFtcIl5cIl0sXG4gICAgcmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaDogW1wic3FydFwiXSxcbiAgICBib3RoOiBbXCIrXCIsIFwiLVwiLCBcIipcIl0sXG4gICAgc3BlY2lhbDogW1wiPVwiXSxcbiAgICBSaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaDogW1wic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxuICAgIGRvdWJsZVJpZ2h0QnV0QnJhY2tldDogW1wiZnJhY1wiLCBcImJpbm9tXCIsXCIvXCJdXG59O1xuXG5leHBvcnQgY2xhc3MgTWF0aEluZm97XG4gICAgZGVidWdJbmZvPVwiXCI7XG4gICAgc29sdXRpb25JbmZvPVtdO1xuICAgIG1hdGhJbmZvPVtdXG4gICAgZ3JhcGg9XCJcIjtcbiAgICBhZGRHcmFwaEluZm8odmFsdWUpe1xuICAgICAgICB0aGlzLmdyYXBoKz12YWx1ZTtcbiAgICB9XG4gICAgYWRkRGVidWdJbmZvKG1zZywgdmFsdWUpe1xuICAgICAgICB0aGlzLmRlYnVnSW5mbys9KHR5cGVvZiBtc2c9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KG1zZyk6bXNnKStcIiA6IFwiKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlKTp2YWx1ZSkrIFwiXFxuIFwiO1xuICAgIH1cbiAgICBhZGRTb2x1dGlvbkluZm8obWVzKXtcbiAgICAgICAgdGhpcy5zb2x1dGlvbkluZm8ucHVzaChtZXMpO1xuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlNvbHZlZFwiLG1lcyk7XG4gICAgfVxuICAgIGFkZE1hdGhJbmZvKHRva2Vucyl7XG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgICAgIHRoaXMubWF0aEluZm8ucHVzaChyZWNvbnN0cnVjdGVkTWF0aClcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJSZWNvbnN0cnVjdGVkIG1hdGhcIixyZWNvbnN0cnVjdGVkTWF0aCk7XG4gICAgfVxuXG4gICAgYWRkU29sdXRpb24odG9rZW5zLHBvc2l0aW9uLHNvbHV0aW9uKXtcbiAgICAgICAgc29sdXRpb249dG9rZW5zLnJlY29uc3RydWN0KFtzb2x1dGlvbl0pO1xuICAgICAgICBjb25zdCBsZWZ0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLmluZGV4KSk7XG4gICAgICAgIGNvbnN0IHJpZ2h0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmluZGV4KzEscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLCkpO1xuXG4gICAgICAgIHN3aXRjaCAodHJ1ZSl7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGhCdXRSaWdodEJyYWNrZXQuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGguaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoL1xcKi9nLCBcIlxcXFxjZG90XCIpfSAke3JpZ2h0fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5zcGVjaWFsLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSBgXFxcXGZyYWN7JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5yaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5SaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3J9ICgke3JpZ2h0fSkgPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uZG91YmxlUmlnaHRCdXRCcmFja2V0LmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKFwiL1wiLFwiZnJhY1wiKX17JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hZGRTb2x1dGlvbkluZm8oc29sdXRpb24pO1xuICAgIH1cbn1cblxuLypcbmZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xuICAgIGlmICghKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikpe3JldHVybiB2YWx1ZX1cbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XG4gICAgaWYgKHZhbHVlPT09XCItXCIpe3JldHVybiAtMX1cbiAgICBpZiAoL1thLXpBLVpdLy50ZXN0KHZhbHVlKSl7cmV0dXJuIDF9XG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxuICAgIGlmKC9bKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cbiAgICBmb3IgKGxldCBpID0gMDsgaTx2YWx1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XG4gICAgICAgICAgICBpLS07XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgbnVtID0gTnVtYmVyKHZhbHVlKTtcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XG59Ki9cblxuZnVuY3Rpb24gcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3IsbGVmdCxyaWdodCl7XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiBsZWZ0Py52YWx1ZSE9PVwibnVtYmVyXCImJmdldE9wZXJhdG9yc0J5U2lkZXMoJ2JvdGgnKS5pbmNsdWRlcyhvcGVyYXRvcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGVmdCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIHJpZ2h0Py52YWx1ZSE9PVwibnVtYmVyXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmlnaHQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcbiAgICB9XG59XG5cblxuXG5mdW5jdGlvbiBwYXJzZShwb3NpdGlvbikge1xuICAgIGxldCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xuICAgIFxuICAgIGxlZnQ9bGVmdD8udG9rZW5zXG4gICAgcmlnaHQ9cmlnaHQudG9rZW5zXG4gICAgLy9jb25zb2xlLmxvZygndGhpcy5sZWZ0LHRoaXMucmlnaHQnLGxlZnQscmlnaHQpXG4gICAgcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3IsbGVmdCxyaWdodCk7XG4gICAgXG4gICAgbGV0IHNvbHZlZD1uZXcgVG9rZW4oKTtcbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgXCJTcXVhcmUgUm9vdFwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cocmlnaHQudmFsdWUsc3BlY2lhbENoYXIhPT1udWxsPygxKS8oc3BlY2lhbENoYXIpOjAuNSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIlBvd1wiOlxuICAgICAgICAgICAgaWYgKGxlZnQudmFyaWFibGV8fHJpZ2h0LnZhcmlhYmxlKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfHxsZWZ0LnZhcmlhYmxlPT09cmlnaHQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZT9yaWdodC52YXJpYWJsZTpcIlwiO1xuICAgICAgICAgICAgICAgIHNvbHZlZC5wb3c9MlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cobGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIkZyYWN0aW9uXCI6XG4gICAgICAgIGNhc2UgXCIvXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiTXVsdGlwbGljYXRpb25cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKiByaWdodC52YWx1ZTtcbiAgICAgICAgICAgIGhhbmRsZVZyaWFibGVzKGxlZnQsIHJpZ2h0LHNvbHZlZCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIitcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKyByaWdodC52YWx1ZTtcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlP2xlZnQudmFyaWFibGU6cmlnaHQudmFyaWFibGU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIk1pbnVzXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlIC0gcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlQmlub20obGVmdC52YWx1ZSxyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInNpblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJjb3NcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguY29zKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJ0YW5cIjpcbiAgICAgICAgICAgIGlmIChyaWdodD49OTApe3Rocm93IG5ldyBFcnJvcihcInRhbiBNdXN0IGJlIHNtYWxsZXIgdGhhbiA5MFwiKTt9XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC50YW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYXNpblwiOlxuICAgICAgICBjYXNlIFwiYXJjc2luXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXNpbihyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhY29zXCI6XG4gICAgICAgIGNhc2UgXCJhcmNjb3NcIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hY29zKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImF0YW5cIjpcbiAgICAgICAgY2FzZSBcImFyY3RhblwiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4ocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgaWRlbnRpZnkgb3BlcmF0b3IgdHlwZSBhdCBwcmFpc2Ugb3BlcmF0b3I6IFwiK3Bvc2l0aW9uLm9wZXJhdG9yKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQsIHJpZ2h0LCBzb2x2ZWQpIHtcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcbiAgICAgICAgICAgIC8vIEtlZXAgdGhlbSBzZXBhcmF0ZSBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZhcmlhYmxlc1xuICAgICAgICAgICAgc29sdmVkLnRlcm1zID0gW1xuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IHJpZ2h0LnZhcmlhYmxlLCBwb3c6IHJpZ2h0LnBvdyB8fCAxLCB2YWx1ZTogcmlnaHQudmFsdWUgfHwgMSB9XG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlmZmVyZW50IHZhcmlhYmxlIGJhc2VzIGF0IHBvd2VyIG11bHRpcGxpY2F0aW9uLiBJIGRpZG4ndCBnZXQgdGhlcmUgeWV0XCIpXG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICBzb2x2ZWQudmFyaWFibGUgPSB2YXJpYWJsZS5sZW5ndGg+MD92YXJpYWJsZTp1bmRlZmluZWQ7XG4gICAgICAgIFxuICAgICAgICBsZXQgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcbiAgICAgICAgcG93PWxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUmJnBvdz09PTAmJiFsZWZ0LnBvdyYmIXJpZ2h0LnBvdz8yOnBvdztcbiAgICAgICAgc29sdmVkLnBvdyA9IHBvdyB8fCB1bmRlZmluZWQ7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIFJ1bGUgMzogSGFuZGxlIG11bHRpcGxpY2F0aW9uIG9mIGNvbnN0YW50c1xuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XG4gICAgICAgIGNvbnN0IHJpZ2h0VmFsdWUgPSByaWdodC52YWx1ZSB8fCAxO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGxlZnRWYWx1ZSAqIHJpZ2h0VmFsdWU7XG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQscmlnaHQsc29sdmVkKXtcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgcmV0dXJuIDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cbiAgICAgICAgLy9jb25zb2xlLmxvZyhsZWZ0LnZhcmlhYmxlLHJpZ2h0LnZhcmlhYmxlKVxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSE9PXJpZ2h0LnZhcmlhYmxlKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlR3byB2YXJpYWJsZSBlcXVhdGlvbnMgYXJlbid0IGFjY2VwdGVkIHlldFwiKTtcbiAgICAgICAgfVxuICAgICAgICAvL2hhbmRsZWQuVmFyPWxlZnQudmFyO1xuICAgICAgICAvL3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhclxuXG4gICAgICAgIC8qXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfVxuICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cbiAgICAgICAgZWxzZSBpZiAobGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZTtzb2x2ZWQucG93PTJ9XG4gICAgICAgICovXG4gICAgfVxuXG5cbiAgICByZXR1cm4gc29sdmVkO1xufVxuXG5mdW5jdGlvbiBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSB7XG4gICAgZnVuY3Rpb24gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sIGVuZCwgdG9rZW5zLCByZWdleCkge1xuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMudG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgbGV0IGluZGV4O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocmVnZXgpIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy50b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIiAmJiByZWdleC50ZXN0KHRva2VuLnZhbHVlKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKCEvWystXS8udGVzdCh0b2tlbnMudG9rZW5zW2luZGV4XS52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW5kZXggPiAwICYmIGluZGV4IDwgdG9rZW5zLnRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRva2Vucy50b2tlbnNbaW5kZXggLSAxXS50eXBlID09PSB0b2tlbnMudG9rZW5zW2luZGV4ICsgMV0udHlwZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIGxldCBiZWdpbiA9IDAsIGVuZCA9IHRva2Vucy50b2tlbnMubGVuZ3RoLGo9MDtcbiAgICBsZXQgY3VycmVudElEID0gbnVsbDsgIFxuICAgIGxldCBjaGVja2VkSURzID0gW107ICBcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCYmajwyMDApIHtcbiAgICAgICAgLy8gRmluZCB0aGUgaW5uZXJtb3N0IHBhcmVudGhlc2VzXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLnRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaisrO1xuICAgICAgICAgICAgaWYgKHRva2Vucy50b2tlbnNbaV0udmFsdWUgPT09IFwiKFwiICYmICFjaGVja2VkSURzLmluY2x1ZGVzKHRva2Vucy50b2tlbnNbaV0uaWQpKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudElEID0gdG9rZW5zLmZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaV0uaWQpOyAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY3VycmVudElEIT09bnVsbCYmaT09PWN1cnJlbnRJRC5jbG9zZSkge1xuICAgICAgICAgICAgICAgIFtiZWdpbixlbmRdPVtjdXJyZW50SUQub3BlbixjdXJyZW50SUQuY2xvc2VdXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICghY3VycmVudElEKSB7XG4gICAgICAgICAgICBiZWdpbiA9IDA7XG4gICAgICAgICAgICBlbmQgPSB0b2tlbnMudG9rZW5zLmxlbmd0aDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xuXG4gICAgICAgIC8vIElmIG5vIG9wZXJhdG9yIGlzIGZvdW5kLCBtYXJrIHRoaXMgcGFyZW50aGVzZXMgcGFpciBhcyBjaGVja2VkXG4gICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xuICAgICAgICAgICAgY2hlY2tlZElEcy5wdXNoKGN1cnJlbnRJRC5pZCk7ICBcbiAgICAgICAgICAgIGN1cnJlbnRJRCA9IG51bGw7ICBcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoaj49MjAwKXt0aHJvdyBuZXcgRXJyb3IoXCJvcGVyYXRpb25zT3JkZXIgRmFpbGVkIGV4Y2VlZGVkIDIwMCByZXZpc2lvbnNcIik7fVxuXG4gICAgZm9yIChsZXQgaT0xO2k8PTY7aSsrKXtcbiAgICAgICAgbGV0IHByaW9yaXR5ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5KGksdHJ1ZSkpO1xuICAgICAgICBpZihwcmlvcml0eSE9PS0xKXJldHVybiBwcmlvcml0eVxuICAgIH1cblxuICAgIGxldCBwcmlvcml0eTEgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE9wZXJhdG9yc0J5UHJpb3JpdHkoMSx0cnVlKSk7XG4gICAgbGV0IHByaW9yaXR5MiA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0T3BlcmF0b3JzQnlQcmlvcml0eSgyLHRydWUpKTtcbiAgICBsZXQgcHJpb3JpdHkzID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5KDMsdHJ1ZSkpO1xuICAgIGxldCBwcmlvcml0eTQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE9wZXJhdG9yc0J5UHJpb3JpdHkoNCx0cnVlKSk7XG4gICAgbGV0IHByaW9yaXR5NSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0T3BlcmF0b3JzQnlQcmlvcml0eSg1LHRydWUpKTtcbiAgICBsZXQgcHJpb3JpdHk2ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRPcGVyYXRvcnNCeVByaW9yaXR5KDYsdHJ1ZSkpO1xuXG4gICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NSxwcmlvcml0eTZdLmZpbmQoaW5kZXggPT4gaW5kZXggIT09IC0xKT8/bnVsbDtcbn1cblxuXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xuICAgIG9wZXJhdG9yO1xuICAgIGluZGV4O1xuICAgIHRyYW5zaXRpb247XG4gICAgc3BlY2lhbENoYXI7XG4gICAgbGVmdDtcbiAgICByaWdodDtcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnMsIGluZGV4KXtcbiAgICAgICAgdGhpcy5pbmRleD1pbmRleDtcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5pbmRleFxuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcbiAgICB9XG4gICAgcG9zaXRpb24odG9rZW5zKSB7XG4gICAgICAgIHRoaXMuaW5kZXggPSAhdGhpcy5pbmRleD8gb3BlcmF0aW9uc09yZGVyKHRva2VucykgOiB0aGlzLmluZGV4O1xuICAgICAgICBpZiAodGhpcy5pbmRleCA9PT0gbnVsbCB8fCB0aGlzLmluZGV4ID49IHRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vcGVyYXRvciA9IHRva2Vucy50b2tlbnNbdGhpcy5pbmRleF0udmFsdWU7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgY2FzZSBnZXRPcGVyYXRvcnNCeVNpZGVzKCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlTaWRlcygncmlnaHQnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB7YnJlYWtDaGFyOiB0aGlzLmluZGV4fTtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBnZXRPcGVyYXRvcnNCeVNpZGVzKCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmxlZnQuYnJlYWtDaGFyO1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnRyYW5zaXRpb24tMSxcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMubGVmdC5icmVha0NoYXIgPSB0aGlzLmluZGV4O1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQuYnJlYWtDaGFyKyh0aGlzLnJpZ2h0Lm11bHRpU3RlcD8xOjApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dGhpcy5vcGVyYXRvcn0gd2FzIG5vdCBhY2NvdW50ZWQgZm9yLCBvciBpcyBub3QgdGhlIHZhbGlkIG9wZXJhdG9yYCk7XG4gICAgICAgIH1cbiAgICAgICAgLy9jb25zb2xlLmxvZyh0b2tlbnMudG9rZW5zKVxuICAgICAgICB0aGlzLnNwZWNpYWxDaGFyPXRva2Vucy50b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgPyB0b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgOiBudWxsO1xuICAgIH1cbiAgICBhcHBseVBvc2l0aW9uKHRva2VucywgaW5kZXgsIGRpcmVjdGlvbikge1xuICAgICAgICBsZXQgYnJlYWtDaGFyPWluZGV4XG4gICAgICAgIGxldCB0YXJnZXQ7XG4gICAgICAgIGxldCBtdWx0aVN0ZXA9ZmFsc2U7XG4gICAgICAgIGNvbnN0IGlzTGVmdCA9IGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCI7XG4gICAgICAgIGNvbnN0IGluZGV4TW9kaWZpZXIgPSAgaXNMZWZ0Py0gMSA6ICAxO1xuICAgICAgICBpZiAoKGlzTGVmdCAmJiBpbmRleCA8PSAwKSB8fCAoIWlzTGVmdCAmJiBpbmRleCA+PSB0b2tlbnMudG9rZW5zLmxlbmd0aCAtIDEpIHx8ICF0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIiBpbmRleDogXCIraW5kZXgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIikge1xuICAgICAgICAgICAgY29uc3QgcGFyZW5JbmRleCA9IHRva2Vucy5maW5kUGFyZW5JbmRleCh0b2tlbnMudG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLmlkKTtcbiAgICAgICAgICAgIGJyZWFrQ2hhciA9ICBpc0xlZnQgPyBwYXJlbkluZGV4Lm9wZW4gOiBwYXJlbkluZGV4LmNsb3NlKzE7XG4gICAgICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zLnNsaWNlKHBhcmVuSW5kZXgub3BlbiwgcGFyZW5JbmRleC5jbG9zZSsxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJyZWFrQ2hhcj1pbmRleCtpbmRleE1vZGlmaWVyO1xuICAgICAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vuc1ticmVha0NoYXJdO1xuICAgICAgICAgICAgYnJlYWtDaGFyKz1pc0xlZnQ/MDoxXG4gICAgICAgIH1cbiAgICAgICAgLy9jb25zdCBtdWx0aVN0ZXAgPSBNYXRoLmFicyhicmVha0NoYXIgLSBpbmRleCkgPiAzO1xuICAgIFxuICAgICAgICBpZiAoIW11bHRpU3RlcCYmdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpe1xuICAgICAgICAgICAgLy90YXJnZXQ9dGFyZ2V0LmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxuICAgICAgICB9XG4gICAgICAgIGlmICh0YXJnZXQ/Lmxlbmd0aD09PTApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgYXQgYXBwbHlQb3NpdGlvbjogY291bGRuJ3QgZmluZCB0YXJnZXQgdG9rZW4gZm9yIGRpcmVjdGlvbiAke2RpcmVjdGlvbn0gYW5kIG9wZXJhdG9yXCIke3Rva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIC8vYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XG4gICAgICAgIC8vZGVsZXRlIHRhcmdldC5pbmRleFxuICAgICAgICBcbiAgICAgICAgaWYgKHRhcmdldC5sZW5ndGg9PT0zKXtcbiAgICAgICAgICAgIHRhcmdldD10YXJnZXQuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXG4gICAgICAgIH1lbHNlIGlmKHRhcmdldC5sZW5ndGg+MSltdWx0aVN0ZXA9dHJ1ZVxuICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdG9rZW5zOiB0YXJnZXQsXG4gICAgICAgICAgICBtdWx0aVN0ZXA6IG11bHRpU3RlcCxcbiAgICAgICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBjaGVja011bHRpU3RlcCgpe1xuICAgICAgICByZXR1cm4gKChnZXRPcGVyYXRvcnNCeVNpZGVzKCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcikmJnRoaXMubGVmdD8ubXVsdGlTdGVwKXx8dGhpcy5yaWdodD8ubXVsdGlTdGVwKSYmdGhpcy5vcGVyYXRvcj09PSdNdWx0aXBsaWNhdGlvbic7XG4gICAgfVxuICAgIGlzTGVmdFZhcigpe1xuICAgICAgICByZXR1cm4gdGhpcy5sZWZ0Lm11bHRpU3RlcD90aGlzLmxlZnQudG9rZW5zLnNvbWUodD0+dC50eXBlPT09J3ZhcmlhYmxlJ3x8dC50eXBlPT09J3Bvd2VyVmFyaWFibGUnKTp0aGlzLmxlZnQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxuICAgIH1cbiAgICBpc1JpZ2h0VmFyKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnJpZ2h0Lm11bHRpU3RlcD90aGlzLnJpZ2h0LnRva2Vucy5zb21lKHQ9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5yaWdodC50b2tlbnMudHlwZS5pbmNsdWRlcygnYXJpYWJsZScpXG4gICAgfVxuICAgIGNoZWNrRnJhYygpey8vIXRoaXMuY2hlY2tNdWx0aVN0ZXAoKSBJIGRvbid0IGtub3cgd2h5IEkgaGFkIHRoaXMgaGVyZVxuICAgICAgICByZXR1cm4gLyhmcmFjfFxcLykvLnRlc3QodGhpcy5vcGVyYXRvcikmJih0aGlzLmlzTGVmdFZhcigpfHx0aGlzLmlzUmlnaHRWYXIoKSlcbiAgICB9XG59XG5cblxuXG5mdW5jdGlvbiByZWFycmFuZ2VFcXVhdGlvbih0b2tlbnMsdG9rZW5Ub2lzb2xhdGUpe1xuICAgIFxufVxuZnVuY3Rpb24gaXNvbGF0ZU11bHRpcGxpY2F0aW9uKHRva2Vucyxpc29sYXRUb2tlbil7XG4gICAgY29uc3QgaW5kZXg9b3BlcmF0aW9uc09yZGVyKHRva2VucylcbiAgICBjb25zdCBJc29sYXRlZD10b2tlbnMudG9rZW5zLmZpbmQoKHRva2VuLCBpZHgpPT5pZHg8aW5kZXgpXG4gICAgY29uc3QgZnJhYz1jcmVhdGVGcmFjKC4uLnRva2Vucy50b2tlbnMuc2xpY2UoaW5kZXgrMSx0b2tlbnMudG9rZW5zLmxlbmd0aCksbmV3IFRva2VuKElzb2xhdGVkLnZhbHVlKSlcbiAgICBJc29sYXRlZC52YWx1ZT0xO1xuICAgIHRva2Vucy5pbnNlcnRUb2tlbnMoaW5kZXgrMSx0b2tlbnMudG9rZW5zLmxlbmd0aC1pbmRleCsxLGZyYWMpXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZyYWMobm9taW5hdG9yLGRlbm9taW5hdG9yKXtcbiAgICByZXR1cm4gW25ldyBUb2tlbignZnJhYycpLG5ldyBUb2tlbignKCcpLG5vbWluYXRvcixuZXcgVG9rZW4oJyknKSxuZXcgVG9rZW4oJygnKSxkZW5vbWluYXRvcixuZXcgVG9rZW4oJyknKV1cbn1cbmZ1bmN0aW9uIHNpbXBsaWZpeSh0b2tlbnMpe1xuICAgIGlmICh0b2tlbnMubGVuZ3RoPD0xKXtyZXR1cm4gdG9rZW5zfVxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xuICAgIHdoaWxlIChpPD0xMDAmJnRva2Vucy5zb21lKHRva2VuID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxuICAgIHtcbiAgICAgICAgaSsrO1xuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIik7XG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuKSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxuXG4gICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxuXG4gICAgICAgIGxldCBudW1iZXJHcm91cCA9IHRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxuICAgICAgICAucmVkdWNlKChzdW0sIGl0ZW0pID0+IHtcbiAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09IFwiLVwiKSA/IC0xIDogMTtcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcbiAgICAgICAgaWYgKCEoLyhudW1iZXIpLykudGVzdChpdGVtLnRva2VuLnR5cGUpKXttdWx0aXBsaWVyKj0tMX1cbiAgICAgICAgcmV0dXJuIHN1bSArIChpdGVtLnRva2VuLnZhbHVlICogbXVsdGlwbGllcik7XG4gICAgICAgIH0sIDApOyBcbiAgICAgICAgXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKHtcbiAgICAgICAgICAgIC4uLmN1cnJlbnRUb2tlbixcbiAgICAgICAgICAgIHZhbHVlOiBudW1iZXJHcm91cFxuICAgICAgICB9KTtcblxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMuZmlsdGVyKHRva2VuID0+IFxuICAgICAgICAgICAgdG9rZW4udHlwZSAhPT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlIHx8IFxuICAgICAgICAgICAgKHRva2VuLnZhcmlhYmxlICYmIHRva2VuLnZhcmlhYmxlICE9PSBjdXJyZW50VG9rZW4udmFyaWFibGUpIHx8IFxuICAgICAgICAgICAgKHRva2VuLnBvdyAmJiB0b2tlbi5wb3cgIT09IGN1cnJlbnRUb2tlbi5wb3cpXG4gICAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBuZXdUb2tlbnM7XG59XG5cbmZ1bmN0aW9uIHJlYXJyYW5nZUZvcklzb2xhdGlvbih0b2tlbnMsIGlzb2xhdGlvbkdvYWwpIHtcbiAgICBpZiAodG9rZW5zLmxlbmd0aCA8PSAxKSByZXR1cm4gdG9rZW5zO1xuXG4gICAgY29uc3QgZXFJbmRleCA9IHRva2Vucy50b2tlbnMuZmluZEluZGV4KHQgPT4gdC52YWx1ZSA9PT0gJ0VxdWFscycpO1xuICAgIGlmIChlcUluZGV4ID09PSAtMSkgdGhyb3cgbmV3IEVycm9yKFwiTm8gJ0VxdWFscycgb3BlcmF0b3IgZm91bmQgaW4gdG9rZW5zXCIpO1xuXG4gICAgY29uc3Qgc3dpdGNoRGlyZWN0aW9uID0gZmFsc2U7IC8vIEZ1dHVyZSBsb2dpYyB0byBkZXRlcm1pbmUgZGlyZWN0aW9uXG4gICAgY29uc3QgaXNvbGF0aW9uR29hbEluZGljZXMgPSB0b2tlbnMudG9rZW5zXG4gICAgICAgIC5tYXAoKHQsIGlkeCkgPT4gKHQudHlwZSA9PT0gaXNvbGF0aW9uR29hbC50eXBlICYmIHQudmFyaWFibGUgPT09IGlzb2xhdGlvbkdvYWwudmFsdWUgPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcihpZHggPT4gaWR4ICE9PSBudWxsKTtcblxuICAgIGNvbnN0IG90aGVySW5kaWNlcyA9IHRva2Vucy50b2tlbnNcbiAgICAgICAgLm1hcCgoXywgaWR4KSA9PiAoIWlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGlkeCkgJiYgaWR4ICE9PSBlcUluZGV4ID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoaWR4ID0+IGlkeCAhPT0gbnVsbCk7XG5cbiAgICAvLyBBZGp1c3Qgc2lnbnNcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuLCBpKSA9PiB7XG4gICAgICAgIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpID4gZXFJbmRleCA6IGkgPCBlcUluZGV4KSAmJiBvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHtcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xuICAgICAgICB9IGVsc2UgaWYgKChzd2l0Y2hEaXJlY3Rpb24/IGkgPCBlcUluZGV4IDogaSA+IGVxSW5kZXgpICYmIGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gU2VwYXJhdGUgc2lkZXNcbiAgICBjb25zdCBzaWRlMSA9IFtdO1xuICAgIGNvbnN0IHNpZGUyID0gW107XG4gICAgdG9rZW5zLnRva2Vucy5mb3JFYWNoKCh0b2tlbiwgaSkgPT4ge1xuICAgICAgICBpZiAoaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHNpZGUxLnB1c2godG9rZW4pO1xuICAgICAgICBpZiAob3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMi5wdXNoKHRva2VuKTtcbiAgICB9KTtcblxuICAgIHRva2Vucy50b2tlbnMgPSBzd2l0Y2hEaXJlY3Rpb25cbiAgICAgICAgPyBbLi4uc2lkZTIsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUxXVxuICAgICAgICA6IFsuLi5zaWRlMSwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTJdO1xufVxuXG5leHBvcnQgY2xhc3MgTWF0aFByYWlzZXJ7XG4gICAgaW5wdXQ9XCJcIjtcbiAgICB0b2tlbnM9W107XG4gICAgc29sdXRpb249XCJcIjtcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcbiAgICBpPTA7XG4gICAgY29uc3RydWN0b3IoaW5wdXQpe1xuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xuICAgICAgICB0aGlzLnByb2Nlc3NJbnB1dCgpO1xuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlRva2VucyBhZnRlciB0b2tlbml6ZVwiLHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgICAgIHRoaXMuc29sdXRpb249dGhpcy5jb250cm9sbGVyKCk7XG4gICAgfVxuICAgIGdldFJlZHlmb3JOZXdSb25kKCl7XG4gICAgICAgIHRoaXMudG9rZW5zLmNvbm5lY3ROZWFyYnlUb2tlbnMoKTtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoSW5mbyh0aGlzLnRva2VucylcbiAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyh0aGlzLnRva2Vucy50b2tlbnMsdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aClcbiAgICAgICAgdGhpcy50b2tlbnMuZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKTtcbiAgICB9XG4gICAgY29udHJvbGxlcigpe1xuICAgICAgICB0aGlzLmkrKztcbiAgICAgICAgaWYodGhpcy5pPjEwKXtyZXR1cm4gdGhpcy5maW5hbFJldHVybigpfVxuXG4gICAgICAgIHRoaXMuZ2V0UmVkeWZvck5ld1JvbmQoKTtcbiAgICAgICAgLy9jb25zdCBvdmVydmlldz10aGlzLnRva2Vucy5nZXRPdmVydmlldygpXG4gICAgICAgIGNvbnN0IHByYWlzaW5nTWV0aG9kPW5ldyBQcmFpc2luZ01ldGhvZCh0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgIGlmIChwcmFpc2luZ01ldGhvZC5pc1RoZXJlT3BlcmF0b3JPdGhlclRoYW5FcXVhbHMoKSl7XG4gICAgICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLnRva2Vucyk7XG4gICAgICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlBhcnNlZCBleHByZXNzaW9uXCIsIEpTT04uc3RyaW5naWZ5KHBvc2l0aW9uLCBudWxsLCAxKSk7XG4gICAgICAgICAgICBpZiAocG9zaXRpb24gPT09IG51bGwmJnRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MSl7XG4gICAgICAgICAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyhcInBhcnNlKHRva2VucylcIixwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMpKVxuICAgICAgICAgICAgICAgIHJldHVybiBcInRoZSAqKioqXCJcbiAgICAgICAgICAgIC8vIHJldHVybiBzb2x1dGlvbih0b2tlbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgIGVsc2UgaWYgKHBvc2l0aW9uLmluZGV4ID09PSBudWxsKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5maW5hbFJldHVybigpO1xuICAgICAgICAgICAgfSovXG4gICAgICAgICAgICBpZiAocG9zaXRpb24uY2hlY2tGcmFjKCl8fHBvc2l0aW9uLmNoZWNrTXVsdGlTdGVwKCkpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbkluZm8odGhpcy50b2tlbnMucmVjb25zdHJ1Y3QodGhpcy50b2tlbnMudG9rZW5zKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudXNlUGFyc2UocG9zaXRpb24pXG4gICAgICAgIH1cbiAgICAgICAgaWYocHJhaXNpbmdNZXRob2QuaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKSl7XG4gICAgICAgICAgICB0aGlzLnVzZUlzb2xhdChwcmFpc2luZ01ldGhvZClcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b0lzb2xhdGU9cHJhaXNpbmdNZXRob2QuaXNBbnl0aGluZ1RvSXNvbGF0ZSgpXG4gICAgICAgIGlmICh0b0lzb2xhdGUpe1xuICAgICAgICAgICAgcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRoaXMudG9rZW5zLHRvSXNvbGF0ZSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxuICAgICAgICB9ICAgXG4gICAgICAgIC8vaWYgKHNvbHZlZCA9PT0gbnVsbHx8dHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XG4gICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCkvL3RoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7XG4gICAgfVxuXG4gICAgdXNlUGFyc2UocG9zaXRpb24pe1xuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZShwb3NpdGlvbik7XG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxuICAgICAgICBjb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxuICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIm5ld1Rva2Vuc1wiLHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgfVxuICAgIFxuICAgIHByYWlzaW5nTWV0aG9kKCl7XG4gICAgICAgIC8qXG4gICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51c2VRdWFkcmF0aWMoKVxuICAgICAgICByZXR1cm4gdGhpcy51c2VJc29sYXQoKTsqL1xuICAgIH1cblxuICAgIHVzZUlzb2xhdChwcmFpc2luZ01ldGhvZCl7XG4gICAgICAgIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0aGlzLnRva2VucyxuZXcgVG9rZW4ocHJhaXNpbmdNZXRob2QudmFyaWFibGVzWzBdKSlcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgIC8vdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKClcbiAgICAgICAgLy9Vc2UgcG9zc2Vzc2lvblxuICAgIH1cblxuICAgIHVzZVF1YWRyYXRpYygpe1xuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnM9c2ltcGxpZml5KHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZSk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XG4gICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXG4gICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhcInNpbXBsaWZpeSh0b2tlbnMpXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHF1YWQoXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdPy52YWx1ZSB8IDAsXG4gICAgICAgICAgICAgICAgICAgIG51bWJlckluZGV4WzBdPy52YWx1ZSAqIC0xfCAwLFxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgIH1cbiAgICBhZGREZWJ1Z0luZm8obWVzLHZhbHVlKXtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxuICAgIH1cbiAgICBwcm9jZXNzSW5wdXQoKXtcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKVxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcbiAgICAgICAgLy8ucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XG4gICAgfVxuICAgIGZpbmFsUmV0dXJuKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgfVxufVxuXG5cblxuXG5cbmNsYXNzIFRva2Vuc3tcbiAgICB0b2tlbnM9W107XG4gICAgY29uc3RydWN0b3IobWF0aCl7XG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XG4gICAgfVxuICAgIHRva2VuaXplKG1hdGgpe1xuICAgICAgICAvL2xhdGV4T3BlcmF0b3JzLnB1c2goU3RyaW5nLnJhd2BbKi9ePVxcK1xcLVxcKFxcKV1gKVxuICAgICAgICAvL2NvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGxhdGV4T3BlcmF0b3JzKVxuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxMYXRleFJlZmVyZW5jZXMoKSlcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKHJlZ0V4cCgnXicgKyBvcGVyYXRvcnMpKTtcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgVG9rZW4obWF0Y2hbMF0pKTtcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8qaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09IFwic3FydFwiICYmIG1hdGhbaV0gPT09IFwiW1wiICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcbiAgICAgICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcbiAgICAgICAgICAgIH0qL1xuXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XG4gICAgICAgICAgICBpZiAoISFtYXRjaClcbiAgICAgICAgICAgIHsgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IFRva2VuKHBhcnNlRmxvYXQobWF0Y2hbMF0pKSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLylcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XG4gICAgICAgICAgICAgICAgLy9pZiAodmFyaSYmdmFyaS5sZW5ndGg9PT0wKXt2YXJpPW1hdGguc2xpY2UoaSxtYXRoLmxlbmd0aCl9XG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBUb2tlbigxLG1hdGNoWzBdKSlcbiAgICAgICAgICAgICAgICAvL3Rva2Vucy5wdXNoKHt0eXBlOiBcInZhcmlhYmxlXCIsdmFyaWFibGU6IHZhcmkucmVwbGFjZShcIihcIixcIntcIikucmVwbGFjZShcIilcIixcIn1cIiksdmFsdWU6IDF9KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVJbmRleChpbmRleCxtYXJnaW4pe1xuICAgICAgICBtYXJnaW49bWFyZ2lufHwwO1xuICAgICAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtbWFyZ2luO1xuICAgIH1cbiAgICBpbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKCl7XG4gICAgICAgIGNvbnN0IHRlc3REb3VibGVSaWdodCA9IChpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCBpZHg9dGhpcy5maW5kUGFyZW5JbmRleChudWxsLGluZGV4KS5vcGVuO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zW2luZGV4KzFdPy52YWx1ZT09PScoJyYmKGlkeD09PTB8fCFnZXRPcGVyYXRvcnNCeVNpZGVzKCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMudG9rZW5zW2lkeC0xXT8udmFsdWUpKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zW2luZGV4XS5pc1ZhbHVlVG9rZW4oKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvL01hcCBwYXJlbnRoZXNlcyBmb3IgaW1wbGljaXQgbXVsdGlwbGljYXRpb24uXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXG4gICAgICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHsgXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSBcIihcIiB8fCAoaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCAtIDEpID8gaW5kZXggOiBudWxsO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8dGVzdERvdWJsZVJpZ2h0KGluZGV4KT8gaW5kZXgrMSA6IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKTtcbiAgICAgICAgcmV0dXJuIG1hcFxuICAgIH1cblxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XG4gICAgICAgIGNvbnN0IG1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+IHRva2VuLnZhbHVlPT09J1BsdXMnfHx0b2tlbi52YWx1ZT09PSdNaW51cyc/aW5kZXg6bnVsbCkuZmlsdGVyKGluZGV4PT4gaW5kZXghPT1udWxsKVxuXG4gICAgICAgIG1hcC5mb3JFYWNoKGluZGV4ID0+IHtcbiAgICAgICAgICAgIGluZGV4PXRoaXMudmFsaWRhdGVJbmRleChpbmRleCwxKSYmdGhpcy50b2tlbnNbaW5kZXgtMV0udHlwZT09PSdvcGVyYXRvcid8fHRoaXMudG9rZW5zW2luZGV4KzFdLnR5cGU9PT0nb3BlcmF0b3InP251bGw6aW5kZXg7XG4gICAgICAgIH0pO1xuICAgICAgICBtYXAucmV2ZXJzZSgpLmZvckVhY2goaW5kZXggPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsdWU9dGhpcy50b2tlbnNbaW5kZXhdLnZhbHVlPT09J1BsdXMnPzE6LTE7XG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleCsxXS52YWx1ZSo9dmFsdWU7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XG4gICAgICAgIC8qcnVsZXMgdG8gYWJpZCBieTpcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxuICAgICAgICAqL1xuICAgICAgIFxuICAgICAgICB0aGlzLklEcGFyZW50aGVzZXMoKTtcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gKHRva2VuLmlzVmFsdWVUb2tlbigpKT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICBjb25zdCBhcnI9ZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG1hcCk7XG5cbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHBhcmVuTWFwPXRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXG4gICAgICAgIHBhcmVuTWFwLnNvcnQoKGEsIGIpID0+IGIgLSBhKVxuICAgICAgICAuZm9yRWFjaCh2YWx1ZSA9PiB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UodmFsdWUsIDAsIG5ldyBUb2tlbignKicpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgbWFwUG93PXRoaXMudG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT4gdG9rZW4udmFsdWU9PT0nUG93Jz9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICBjb25zb2xlLmxvZyhtYXBQb3cpXG4gICAgICAgIG1hcFBvdy5mb3JFYWNoKGluZGV4ID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGluZGV4LG5ldyBQb3NpdGlvbih0aGlzLGluZGV4KSlcbiAgICAgICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyB0aGlzLmZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgpIDogbnVsbClcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXG4gICAgfVxuXG4gICAgZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhZWwoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwUGFyZW5JbmRleGVzKClcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcbiAgICAgICAgICAgIGlmIChvcGVuSW5kZXg+MCkge1xuICAgICAgICAgICAgICAgIGlmICgvKG9wZXJhdG9yfHBhcmVuKS8udGVzdCh0aGlzLnRva2Vuc1tvcGVuSW5kZXggLSAxXS50eXBlKSkgey8vICYmIHByZXZUb2tlbi52YWx1ZSAhPT0gXCI9XCJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNsb3NlSW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0uaXNWYWx1ZVRva2VuKCkpIHsvL3RoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSkuZmxhdE1hcCgoeyBvcGVuLCBjbG9zZSB9KSA9PiBbb3BlbiwgY2xvc2VdKTtcbiAgICB9XG4gICAgLypcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXG4gICAgICAgICAgICAgICAgJiYodGhpcy50b2tlbkNvbXBhcmUoXCJ0eXBlXCIsdGhpcy52YWx1ZVRva2VucygpLCB0b2tlbiwgdG9rZW5zW2luZGV4ICsgMV0pKVxuICAgICAgICApKTtcbiAgICAgfSovXG5cbiAgICBjb25uZWN0TmVhcmJ5VG9rZW5zKCl7XG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWVsKCkpO1xuICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAhbWFwLmhhcyhpZHgpKTtcbiAgICAgICAgLy9Qcm9ibGVtIHdpdGggID0gYXMgaXQncyBhZmZlY3RpbmcgdGhlIHZhcmlhYmxlIGJlZm9yZSBpdFxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICBjb25zdCB2YXJNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PiB0b2tlbi50eXBlPT09J3ZhcmlhYmxlJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIFxuICAgICAgICBjb25zdCBhcnIgPSBbXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobnVtTWFwKSwgXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXModmFyTWFwKSwgXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKVxuICAgICAgICBcbiAgICAgICAgdGhpcy5JRHBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxuICAgIH1cblxuXG4gICAgY29ubmVjdEFuZENvbWJpbmUoYXJyKXtcbiAgICAgICAgY29uc3QgaW5kZXhlcz1bXVxuXG4gICAgICAgIGFyci5zb3J0KChhLCBiKSA9PiBiWzBdIC0gYVswXSkuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBpbmRleGVzLnB1c2goe3N0YXJ0OiBlbFswXSxlbmQ6IGVsW2VsLmxlbmd0aCAtIDFdfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaW5kZXhlcy5mb3JFYWNoKGluZGV4ID0+IHtcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IE51bWJlcih0aGlzLnRva2Vuc1tpbmRleC5zdGFydF0udmFsdWUpO1xuICAgICAgICAgICAgY29uc3QgaXNWYXI9dGhpcy50b2tlbnMuc2xpY2UoaW5kZXguc3RhcnQsaW5kZXguZW5kKzEpLmZpbmQodG9rZW49PiB0b2tlbi50eXBlLmluY2x1ZGVzKCd2YXInKSk7XG4gICAgICAgICAgICBmb3IgKGxldCBpPWluZGV4LnN0YXJ0KzE7aTw9aW5kZXguZW5kO2krKyl7XG4gICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMudG9rZW5zW2ldLnZhbHVlICsgdmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vaWYgKGlzVmFyKXVwZGF0ZWRUb2tlbi52YXJpYWJsZT1pc1Zhci52YXJpYWJsZVxuICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXguc3RhcnRdID0gbmV3IFRva2VuKHZhbHVlLGlzVmFyPy52YXJpYWJsZSk7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXguc3RhcnQrMSwgaW5kZXguZW5kIC0gaW5kZXguc3RhcnQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xuICAgICAgICBpZiAoXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXG4gICAgICAgIClcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cbiAgICB9XG5cbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQsIGxlbmd0aCwgb2JqZWN0cykge1xuICAgICAgICBvYmplY3RzID0gZmxhdHRlbkFycmF5KG9iamVjdHMpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xuICAgIH1cblxuICAgIHJlY29uc3RydWN0KHRva2Vucyl7XG4gICAgICAgIGlmICghdG9rZW5zKXt0b2tlbnM9dGhpcy50b2tlbnM7fVxuICAgICAgICBjb25zdCBhZGRQbHVzSW5kZXhlcz10aGlzLmluZGV4ZXNUb0FkZFBsdXModG9rZW5zKTtcbiAgICAgICAgY29uc3QgY3VybHlCcmFja2V0SW5kZXhlcyA9IHRoaXMuY3VybHlCcmFja2V0SURzKHRva2VucykuZmxhdE1hcCgoeyBvcGVuLCBjbG9zZSB9KSA9PiBbb3BlbiwgY2xvc2VdKTtcbiAgICAgICAgbGV0IG1hdGggPSBcIlwiO1xuICAgICAgICBmb3IgKGxldCBpPTA7aTx0b2tlbnMubGVuZ3RoO2krKyl7XG4gICAgICAgICAgICBsZXQgdGVtcDtcbiAgICAgICAgICAgIG1hdGgrPWFkZFBsdXNJbmRleGVzLmluY2x1ZGVzKGkpPycrJzonJztcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0/LnZhbHVlPT09XCIoXCImJnRva2Vuc1t0b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi5pZCA9PT0gdG9rZW5zW2ldLmlkJiZ0b2tlbnNbaW5kZXgrMV0pKzFdLnZhbHVlPT09XCIvXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3dpdGNoICh0b2tlbnNbaV0/LnR5cGUpe1xuICAgICAgICAgICAgICAgIGNhc2UgXCJudW1iZXJcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwicG93ZXJWYXJpYWJsZVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJvcGVyYXRvclwiOlxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldIGluc3RhbmNlb2YgVG9rZW4pXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0/LnRvU3RyaW5nTGF0ZXgoKVxuICAgICAgICAgICAgICAgICAgICAvL3RlbXA9cm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgLy9tYXRoKz10ZW1wKyhpKzE8dG9rZW5zLmxlbmd0aCYmLyhmcmFjKS8udGVzdCh0b2tlbnNbaSsxXS52YWx1ZSk/XCIrXCI6XCJcIik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJwYXJlblwiOlxuICAgICAgICAgICAgICAgICAgICBtYXRoKz1jdXJseUJyYWNrZXRJbmRleGVzLmNvbnRhaW5zKGkpP3Rva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLFwie1wiKS5yZXBsYWNlKC9cXCkvLFwifVwiKTp0b2tlbnNbaV0udmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IodGhpcy50b2tlbnMpXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCB0b2tlbiB0eXBlIGdpdmVuIHRvIHJlY29uc3RydWN0OiB0eXBlICR7dG9rZW5zW2ldPy50eXBlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRoXG4gICAgfVxuICAgIFxuICAgIGN1cmx5QnJhY2tldElEcyh0b2tlbnMgPSB0aGlzLnRva2Vucykge1xuICAgICAgICBjb25zdCByaWdodEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpLCAuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ3JpZ2h0JyldO1xuICAgICAgICBjb25zdCBib3RoQnJhY2tldHMgPSBbLi4uZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJyldO1xuICAgICAgICBjb25zdCBkb3VibGVSaWdodEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnZG91YmxlUmlnaHQnKV07XG4gICAgICAgIGNvbnN0IG1hcCA9IFtdO1xuICAgIFxuICAgICAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW4sIGluZGV4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSB0b2tlbnNbaW5kZXggLSAxXT8udmFsdWU7XG4gICAgICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0b2tlbnNbaW5kZXggKyAxXT8udmFsdWU7XG4gICAgXG4gICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09ICcoJykge1xuICAgICAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgZG91YmxlUmlnaHRCcmFja2V0cy5pbmNsdWRlcyhwcmV2VG9rZW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gdGhpcy5maW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4LCB0b2tlbnMpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwMiA9IHRoaXMuZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBwMS5jbG9zZSArIDEsIHRva2Vucyk7XG4gICAgICAgICAgICAgICAgICAgIG1hcC5wdXNoKHAxLCBwMik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpbmRleCA+IDAgJiYgcmlnaHRCcmFja2V0cy5pbmNsdWRlcyhwcmV2VG9rZW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hcC5wdXNoKHRoaXMuZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCwgdG9rZW5zKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlbi52YWx1ZSA9PT0gJyknICYmIGJvdGhCcmFja2V0cy5pbmNsdWRlcyhuZXh0VG9rZW4pKSB7XG4gICAgICAgICAgICAgICAgbWFwLnB1c2godGhpcy5maW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4LCB0b2tlbnMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBtYXA7XG4gICAgfVxuICAgIFxuXG4gICAgaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnMpe1xuICAgICAgICByZXR1cm4gdG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT5pbmRleD4wXG4gICAgICAgICAgICAmJnRva2Vuc1tpbmRleCAtIDFdPy5pc1ZhbHVlVG9rZW4oKVxuICAgICAgICAgICAgJiZ0b2tlbj8uaXNWYWx1ZVRva2VuKCkmJnRva2VuLnZhbHVlPj0wP2luZGV4Om51bGxcbiAgICAgICAgKS5maWx0ZXIoaXRlbT0+aXRlbSE9PW51bGwpXG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgdG9rZW5Db21wYXJlKGNvbXBhcmUsIHZhbHVlLCB0b2tlbiwgbmV4dFRva2VuKSB7XG4gICAgICAgIHZhbHVlID0gdmFsdWUgaW5zdGFuY2VvZiBSZWdFeHAgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlLnRlc3QodG9rZW5bY29tcGFyZV0pKSAmJlxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgSURwYXJlbnRoZXNlcygpIHtcbiAgICAgICAgbGV0IHRva2Vucz10aGlzLnRva2Vuc1xuICAgICAgICBsZXQgYnJhY2tldHMgPSAwLCBsZXZlbENvdW50ID0ge307XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSBcIihcIikge1xuICAgICAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWxDb3VudFticmFja2V0c10gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xuICAgICAgICAgICAgICAgIHRva2Vuc1tpXS5pZCA9IG5ldyBQYXJlbihicmFja2V0cyxJRCkvLyArIFwiLlwiICsgO1xuICAgICAgICAgICAgICAgIGJyYWNrZXRzKys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSBcIilcIikge1xuICAgICAgICAgICAgICAgIGJyYWNrZXRzLS07XG4gICAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xuICAgICAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxuICAgICAgICAgICAgICAgIHRva2Vuc1tpXS5pZCA9IG5ldyBQYXJlbihicmFja2V0cyxJRCkvL2JyYWNrZXRzICsgXCIuXCIrSUQ7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGJyYWNrZXRzIT09MClcbiAgICAgICAge1xuICAgICAgICAgICAgLy90aHJvdyBuZXcgRXJyb3IgKFwiVW5tYXRjaGVkIG9wZW5pbmcgYnJhY2tldChzKSBlcnIgcmF0ZTogXCIrYnJhY2tldHMpXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2VucztcbiAgICB9XG59XG5cblxuXG5cbmV4cG9ydCBmdW5jdGlvbiBmbGF0dGVuQXJyYXkoYXJyKSB7XG4gICAgbGV0IHJlc3VsdCA9IFtdO1xuICAgIGxldCBzdGFjayA9IEFycmF5LmlzQXJyYXkoYXJyKSA/IFsuLi5hcnJdIDogW2Fycl07XG5cbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IG5leHQgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobmV4dCkpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7IFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2gobmV4dCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5yZXZlcnNlKCk7XG59XG5cblxuXG5leHBvcnQgY2xhc3MgVG9rZW57XG4gICAgdHlwZTtcbiAgICB2YWx1ZTtcbiAgICB2YXJpYWJsZTtcbiAgICBtb2RpZmllcjtcbiAgICBpZDtcbiAgICBcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZSx2YXJpYWJsZSl7XG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XG4gICAgICAgIHRoaXMuc2V0VHlwZSgpO1xuICAgICAgICB0aGlzLmluc3VyUHJvcGVyRm9ybWF0dGluZygpXG4gICAgfVxuICAgIGluc3VyUHJvcGVyRm9ybWF0dGluZygpe1xuICAgICAgICBpZiAodGhpcy50eXBlPT09J29wZXJhdG9yJyl7XG4gICAgICAgICAgICB0aGlzLnZhbHVlPXNlYXJjaE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubmFtZVxuICAgICAgICB9XG4gICAgICAgLy8gaWYgKCF0aGlzLnZhbHVlKXt0aHJvdyBuZXcgRXJyb3IoJ3d0ZiBWYWx1ZSB3YXMgdW5kZWZpbmVkIGF0IHRva2VuIGluc3VyUHJvcGVyRm9ybWF0dGluZycpfVxuICAgIH1cbiAgICBnZXRJZCgpe3JldHVybiB0aGlzLmlkLmlkfTtcblxuICAgIGdldExhdGV4U3ltYm9sKCl7cmV0dXJuIHNlYXJjaFN5bWJvbHModGhpcy52YWx1ZSk/LmxhdGV4fVxuXG4gICAgZ2V0RnVsbFRva2VuSUQoKXtcbiAgICAgICAgc3dpdGNoICh0aGlzLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICBjYXNlICdwcmFuZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZTtcbiAgICAgICAgICAgIGNhc2UgJ29wZXJhdG9yJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlKyc6Jyt0aGlzLnZhbHVlXG4gICAgICAgICAgICBjYXNlICd2YXJpYWJsZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZSsnOicrdGhpcy52YXJpYWJsZVxuICAgICAgICB9XG4gICAgfVxuICAgIGdldGZ1bGxUeXBlKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnR5cGVcbiAgICB9XG5cbiAgICBzZXRUeXBlKCl7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnKXtcbiAgICAgICAgICAgIHRoaXMudHlwZT10aGlzLnZhbHVlLm1hdGNoKC9bKCldLyk/J3BhcmVuJzonb3BlcmF0b3InO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudHlwZT10aGlzLnZhcmlhYmxlPyd2YXJpYWJsZSc6J251bWJlcic7XG4gICAgfVxuXG4gICAgaXNTdHJpbmcoKXtyZXR1cm4gdGhpcy50eXBlPT09J3BhcmVuJ3x8dGhpcy50eXBlPT09J29wZXJhdG9yJ31cblxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cblxuICAgIHRvU3RyaW5nTGF0ZXgoKXtcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xuICAgICAgICBpZiAodGhpcy5pc1N0cmluZygpKVxuICAgICAgICAgICAgc3RyaW5nKz10aGlzLmdldExhdGV4U3ltYm9sKHRoaXMudmFsdWUpXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0ndmFyaWFibGUnKSBzdHJpbmcrPXRoaXMudG9TdHJpbmdWYXJpYWJsZSgpXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nbnVtYmVyJykgc3RyaW5nKz10aGlzLnZhbHVlO1xuICAgICAgICByZXR1cm4gc3RyaW5nXG4gICAgfVxuICAgIGFmZmVjdGVkT3BlcmF0b3JSYW5nZShkaXJlY3Rpb24pe1xuICAgICAgICBpZih0aGlzLnR5cGUhPT0nb3BlcmF0b3InfHx0aGlzLnZhbHVlPT09J0VxdWFscycpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgaWYoZGlyZWN0aW9uPT09J2xlZnQnJiYhZ2V0T3BlcmF0b3JzQnlTaWRlcygnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICAgIHRvU3RyaW5nVmFyaWFibGUoKXtcbiAgICAgICAgcmV0dXJuICh0aGlzLnZhbHVlIT09MT90aGlzLnZhbHVlOicnKSt0aGlzLnZhcmlhYmxlO1xuICAgIH1cbn1cblxuY2xhc3MgUHJhaXNpbmdNZXRob2R7XG4gICAgdG9rZW5zXG4gICAgb3ZlcnZpZXc7XG4gICAgdmFyaWFibGVzO1xuICAgIGNvbnN0cnVjdG9yKHRva2Vucyl7XG4gICAgICAgIHRoaXMudG9rZW5zPXRva2Vuc1xuICAgICAgICB0aGlzLm92ZXJ2aWV3PXRoaXMuZ2V0T3ZlcnZpZXcoKVxuICAgICAgICB0aGlzLmFzc2lnblZhcmlhYmxlcygpXG4gICAgfVxuICAgIGlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuc29tZSh0PT4gdC50eXBlPT09J3ZhcmlhYmxlJyYmdC52YWx1ZT4xKVxuICAgIH1cblxuICAgIGlzTXVsdGlwbGljYXRpb25Jc29sYXRlKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmhhc2VWYXJpYWJsZSgpJiZ0aGlzLmlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpJiZ0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKClcbiAgICB9XG4gICAgaXNJc29sYXRlKCl7XG4gICAgICAgIC8vcmV0dXJuIHRoaXMuXG4gICAgfVxuXG4gICAgaXNBbnl0aGluZ1RvSXNvbGF0ZSgpe1xuICAgICAgICBpZih0aGlzLnZhcmlhYmxlcy5sZW5ndGg+MSl0aHJvdyBuZXcgRXJyb3IoXCJ0d28gdmFyIGVxIGFyZW50IHNhcG9ydGVkIHlldFwiKVxuICAgICAgICBpZighdGhpcy5pc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpKXJldHVybjtcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLmVxdWFsc0luZGV4SWZBbnkoKTtcbiAgICAgICAgaWYoIWVxSW5kZXgpe3JldHVybn07XG4gICAgICAgIGNvbnN0IGJlZm9yID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZSgwLGVxSW5kZXgpKVxuICAgICAgICBjb25zdCBhZnRlciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoZXFJbmRleCsxKSlcbiAgICAgICAgY29uc3Qgd2hhdFRvSXNvbGF0ID10aGlzLndoYXRUb0lzb2xhdCgpO1xuICAgICAgICBpZiAoIXdoYXRUb0lzb2xhdHx8KGJlZm9yPy5zaXplPDImJmFmdGVyPy5zaXplPDIpKXJldHVybjtcbiAgICAgICAgcmV0dXJuIHtvdmVydmlld1NpZGVPbmU6IGJlZm9yLG92ZXJ2aWV3U2lkZVR3bzogYWZ0ZXIsLi4ud2hhdFRvSXNvbGF0fVxuICAgIH1cbiAgICBob3dUb0lzb2xhdGUob3ZlcnZpZXdTaWRlT25lLG92ZXJ2aWV3U2lkZVR3byxpc29sYXRpb25Hb29sKXtcbiAgICAgICAgY29uc3QgaXNvbGF0aW9uVHlwZT1pc29sYXRpb25Hb29sLnNwbHQoJzonKTtcbiAgICAgICAgLy9pZiAoKXt9XG4gICAgfVxuICAgIHdoYXRUb0lzb2xhdCgpe1xuICAgICAgICAvLyBpIG5lZWQgdG8gYWRkIHBvd3MgYWZ0ZXJcbiAgICAgICAgLy8gZm9yIGtub3cgaW0gZ29pbmcgb24gdGhlIG9zaG9tc2hpbiB0aGF0IHRociBpcyBvbmx5IG9uZSB2YXJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXM/Lmxlbmd0aDwxKXJldHVybjtcblxuICAgICAgICByZXR1cm4ge3R5cGU6ICd2YXJpYWJsZScsdmFsdWU6IHRoaXMudmFyaWFibGVzWzBdfVxuICAgIH1cbiAgICBpc092ZXJ2aWV3VG9pc29sYXQob3ZlcnZpZXcpe1xuICAgIH1cbiAgICBpc0ltYmFsYW5jZShvdmVydmlldyl7XG4gICAgICAgIG92ZXJ2aWV3LnNpemU+MVxuICAgIH1cbiAgICBlcXVhbHNJbmRleElmQW55KCl7XG4gICAgICAgIGNvbnN0IGVxSW5kZXg9dGhpcy50b2tlbnMubWFwKCh0LGlkeCk9PnQudmFsdWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKG09Pm0hPT1udWxsKTtcbiAgICAgICAgcmV0dXJuIGVxSW5kZXhbMF07XG4gICAgfVxuICAgIGlzUXVhZHJhdGljKCl7XG5cbiAgICB9XG4gICAgaXNGaW5hbFJldHVybigpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMubGVuZ3RoPDJ8fCh0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpXG4gICAgfVxuICAgIFxuICAgIGFzc2lnblZhcmlhYmxlcygpe1xuICAgICAgICB0aGlzLnZhcmlhYmxlcz1bXVxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLm92ZXJ2aWV3LmVudHJpZXMoKSl7XG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKCd2YXJpYWJsZTonKSYmIXRoaXMudmFyaWFibGVzLmluY2x1ZGVzKHZhbHVlLnZhcmlhYmxlKSl7XG4gICAgICAgICAgICAgICAgdGhpcy52YXJpYWJsZXMucHVzaCh2YWx1ZS52YXJpYWJsZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGhhc2VWYXJpYWJsZSgpe3JldHVybiB0aGlzLnZhcmlhYmxlcz8ubGVuZ3RoPjB9XG5cbiAgICBpc1RoZXJlT3BlcmF0b3JPdGhlclRoYW5FcXVhbHMoKXtcbiAgICAgICAgY29uc3QgZmlsdGVyPXRoaXMuZmlsdGVyQnlUeXBlKCdvcGVyYXRvcicsJ0VxdWFscycpXG4gICAgICAgIHJldHVybiAgZmlsdGVyLm5vTWF0Y2g+MFxuICAgIH1cbiAgICBpc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpe1xuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubWF0Y2g9PT0xJiZmaWx0ZXIubm9NYXRjaD09PTBcbiAgICB9XG5cbiAgICBmaWx0ZXJCeVR5cGUodHlwZUtleSwgdGFyZ2V0VmFsdWUpe1xuICAgICAgICBsZXQgbWF0Y2g9MCwgbm9NYXRjaD0wXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKSB7XG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKHR5cGVLZXkpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gdHlwZUtleSsnOicrdGFyZ2V0VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2grKztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBub01hdGNoKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG1hdGNoOiBtYXRjaCwgbm9NYXRjaDogbm9NYXRjaCB9O1xuICAgIH1cbiAgICBnZXRPdmVydmlldyh0b2tlbnMpIHtcbiAgICAgICAgaWYoIXRva2Vucyl0b2tlbnM9dGhpcy50b2tlbnNcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXcgPSBuZXcgTWFwKCk7XG4gICAgXG4gICAgICAgIHRva2Vucy5mb3JFYWNoKHRva2VuID0+IHtcbiAgICAgICAgICAgIC8vaWYgKCF0b2tlbi5pc1ZhbHVlVG9rZW4oKSkge3JldHVybjt9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRva2VuLmdldEZ1bGxUb2tlbklEKClcbiAgICAgICAgICAgIC8vRXF1YWxzXG4gICAgICAgICAgICBpZiAoIW92ZXJ2aWV3LmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW50cnkgPSB7IFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlbi50eXBlLCBcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IDAgXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gJ3ZhcmlhYmxlJykge1xuICAgICAgICAgICAgICAgICAgICBlbnRyeS52YXJpYWJsZSA9IHRva2VuLnZhcmlhYmxlO1xuICAgICAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgICAgICBvdmVydmlldy5zZXQoa2V5LCBlbnRyeSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdmVydmlldy5nZXQoa2V5KS5jb3VudCsrO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG92ZXJ2aWV3Ly9BcnJheS5mcm9tKG92ZXJ2aWV3LnZhbHVlcygpKTtcbiAgICB9XG59XG5cblxuXG5jbGFzcyBNb2RpZmllcntcblxufSJdfQ==