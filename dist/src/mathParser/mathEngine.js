import { quad, degreesToRadians, radiansToDegrees, calculateFactorial } from "./mathUtilities";
import { expandExpression } from "../imVeryLazy";
import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { findParenIndex, idParentheses } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getOperatorsByBracket, hasImplicitMultiplication, searchMathJaxOperators } from "../utils/dataManager";
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
            case operatorsForMathinfo.bothButRightBracket.includes(position.operator):
                solution = `${left} ${position.operator} {${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.both.includes(position.operator):
                solution = `${left} ${position.operator.replace(/\*/g, "\\cdot")} ${right} = ${solution}`;
                break;
            case operatorsForMathinfo.special.includes(position.operator):
                solution = `\\frac{${left}}{${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.rightBracketAndRequiresSlash.includes(position.operator):
                solution = `\\sqrt{${right}} = ${solution}`;
                break;
            case operatorsForMathinfo.RightParenAndRequiresSlash.includes(position.operator):
                solution = `\\${position.operator} (${right}) = ${solution}`;
                break;
            case operatorsForMathinfo.doubleRightButBracket.includes(position.operator):
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
    if (typeof operator === "string" && typeof left?.value !== "number" && getOperatorsByBracket('both').includes(operator)) {
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
    let solved = new Token(0, undefined);
    switch (operator) {
        case "Square Root":
            solved.value = Math.pow(right.value, specialChar !== null ? (1) / (specialChar) : 0.5);
            break;
        case "Pow":
            if (left.variable || right.variable) {
                solved.variable = left.variable || left.variable === right.variable ? left.variable : right.variable ? right.variable : "";
                //solved.pow=2
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
            solved.value = calculateFactorial(left.value, right.value);
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
            /* Keep them separate since they have different variables
            solved.terms = [
                { variable: left.variable, pow: left.pow || 1, value: left.value || 1 },
                { variable: right.variable, pow: right.pow || 1, value: right.value || 1 }
            ];*/
            throw new Error("Different variable bases at power multiplication. I didn't get there yet");
        }
        const variable = left.variable || right.variable;
        solved.variable = variable.length > 0 ? variable : undefined;
        let pow = (left.pow || 0) + (right.pow || 0);
        pow = left.variable && right.variable && pow === 0 && !left.pow && !right.pow ? 2 : pow;
        //solved.pow = pow || undefined;
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
    function findOperatorIndex(begin, end, tokens, findParenIndex, regex) {
        while (begin < end && begin < tokens.tokens.length) {
            let index;
            if (regex) {
                index = tokens.tokens.slice(begin, end).findIndex((token) => token.type === "operator" && regex.test(token.value));
            }
            else {
                index = tokens.tokens.slice(begin, end).findIndex((token) => token.type === "operator");
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
                currentID = findParenIndex(tokens.tokens[i].id);
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
        let priority = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(i, true));
        if (priority !== -1)
            return priority;
    }
    let priority1 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(1, true));
    let priority2 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(2, true));
    let priority3 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(3, true));
    let priority4 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(4, true));
    let priority5 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(5, true));
    let priority6 = findOperatorIndex(begin, end, tokens, getMathJaxOperatorsByPriority(6, true));
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
        if (index)
            this.index = index;
        this.transition = this.index;
        this.position(tokens);
    }
    position(tokens) {
        this.index = !this.index ? operationsOrder(tokens) : this.index;
        if (!this.index || this.index === null || this.index >= tokens.tokens.length - 1) {
            return;
        }
        this.operator = tokens.tokens[this.index].value;
        switch (true) {
            case getOperatorsByAssociativity('both').includes(this.operator):
                this.left = this.applyPosition(tokens, this.index, "left");
                this.right = this.applyPosition(tokens, this.index, "right");
                break;
            case getOperatorsByAssociativity('right').includes(this.operator):
                this.left = { breakChar: this.index };
                this.right = this.applyPosition(tokens, this.index, "right");
                break;
            case getOperatorsByAssociativity('doubleRight').includes(this.operator):
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
        this.specialChar = tokens.tokens[this.index].specialChar ? tokens.tokens[this.index].specialChar : null;
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
            const parenIndex = findParenIndex(tokens.tokens[index + indexModifier].id);
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
            target = target.find((item) => /(number|variable|powerVariable)/.test(item.type));
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
        return ((getOperatorsByAssociativity('both').includes(this.operator) && this.left?.multiStep) || this.right?.multiStep) && this.operator === 'Multiplication';
    }
    isLeftVar() {
        return this.left.multiStep ? this.left.tokens.some((t) => t.type === 'variable' || t.type === 'powerVariable') : this.left.tokens.type.includes('ariable');
    }
    isRightVar() {
        return this.right.multiStep ? this.right.tokens.some((t) => t.type === 'variable' || t.type === 'powerVariable') : this.right.tokens.type.includes('ariable');
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
    const frac = createFrac(tokens.list.slice(index + 1), new Token(Isolated.value));
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
    while (i <= 100 && tokens.some((token) => (/(number|variable|powerVariable)/).test(token.type))) {
        i++;
        let eqindex = tokens.findIndex((token) => token.value === "=");
        let OperationIndex = tokens.findIndex((token) => (/(number|variable|powerVariable)/).test(token.type));
        if (OperationIndex === -1) {
            return tokens;
        }
        let currentToken = { type: tokens[OperationIndex].type, value: tokens[OperationIndex].value, variable: tokens[OperationIndex].variable, pow: tokens[OperationIndex].pow };
        let numberGroup = tokens
            .map((token, i) => ({ token, originalIndex: i }))
            .filter((item) => item.token.type === currentToken.type)
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
    if (tokens.tokens.length <= 1)
        return tokens;
    const eqIndex = tokens.tokens.findIndex((t) => t.value === 'Equals');
    if (eqIndex === -1)
        throw new Error("No 'Equals' operator found in tokens");
    const switchDirection = false; // Future logic to determine direction
    const isolationGoalIndices = tokens.tokens
        .map((t, idx) => (t.type === isolationGoal.type && t.variable === isolationGoal.value ? idx : null))
        .filter((idx) => idx !== null);
    const otherIndices = tokens.tokens
        .map((_, idx) => (!isolationGoalIndices.includes(idx) && idx !== eqIndex ? idx : null))
        .filter((idx) => idx !== null);
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
    tokens;
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
        const filterByType = (type) => this.tokens.tokens.filter((token) => token.type === type);
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
class mathVariables {
}
class mathGroup {
    numberOnly;
    hasVariables;
    singular;
    hasOperators;
    multiLevel;
    isOperable = true;
}
class Tokens {
    tokens = [];
    constructor(math) {
        this.tokenize(math);
    }
    tokenize(math) {
        //latexOperators.push(String.raw`[*/^=\+\-\(\)]`)
        //const operators=arrToRegexString(latexOperators)
        const operators = arrToRegexString(getAllMathJaxReferences());
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
            const idx = findParenIndex(null, index).open;
            return this.tokens[index + 1]?.value === '(' && (idx === 0 || !getOperatorsByAssociativity('doubleRight').includes(this.tokens[idx - 1]?.value));
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
            .filter((item) => item !== null);
        return map;
    }
    validatePlusMinus() {
        const map = this.tokens.map((token, index) => token.value === 'Plus' || token.value === 'Minus' ? index : null).filter((index) => index !== null);
        map.forEach((index) => {
            index = this.validateIndex(index, 1) && this.tokens[index - 1].type === 'operator' || this.tokens[index + 1].type === 'operator' ? null : index;
        });
        map.reverse().forEach((index) => {
            const value = this.tokens[index].value === 'Plus' ? 1 : -1;
            this.tokens[index + 1].value *= value;
            this.tokens.splice(index, 1);
        });
    }
    postProcessTokens() {
        /*rules to abid by:
        1. +- If part of the number they are absorbed into the number
        */
        idParentheses(this.tokens);
        const map = this.tokens.map((token, index) => (token.isValueToken()) ? index : null).filter((item) => item !== null);
        const arr = findConsecutiveSequences(map);
        this.connectAndCombine(arr);
        this.validatePlusMinus();
        const parenMap = this.implicitMultiplicationMap();
        parenMap.sort((a, b) => b - a)
            .forEach((value) => {
            this.tokens.splice(value, 0, new Token('*'));
        });
        const mapPow = this.tokens.map((token, index) => token.value === 'Pow' ? index : null).filter((item) => item !== null);
        console.log(mapPow);
        mapPow.forEach((index) => {
            const position = new Position(this, index);
            const [leftBreak, length] = [position.left.breakChar, position.right.breakChar - position.left.breakChar];
            // this.tokens.insertTokens(leftBreak,length,solved)
        });
    }
    mapParenIndexes() {
        return this.tokens
            .map((token, index) => token.value === "(" ? findParenIndex(undefined, index) : null)
            .filter((item) => item !== null);
    }
    filterParenIndexesForRemoval() {
        return this.mapParenIndexes()
            .filter((item) => {
            const { open: openIndex, close: closeIndex } = item;
            if (openIndex > 0) {
                if (/(operator|paren)/.test(this.tokens[openIndex - 1]?.type)) {
                    return false;
                }
            }
            if (closeIndex < this.tokens.length - 1) {
                if (this.tokens[closeIndex + 1]?.isValueToken()) {
                    return false;
                }
            }
            return true;
        }).flatMap((item) => [item.open, item.close]);
    }
    /*
    findSimilarSuccessor(tokens){
        return this.tokens.findIndex((token, index) =>
                ((tokens[index + 2]?.type !== "operator"&&tokens[index -1]?.type !== "operator")
                &&(this.tokenCompare("type",this.valueTokens(), token, tokens[index + 1]))
        ));
     }*/
    connectNearbyTokens() {
        this.tokens.forEach((token) => {
            if (!(token instanceof Token)) {
                throw new Error("ftygubhnimpo");
            }
        });
        const map = new Set(this.filterParenIndexesForRemoval());
        this.tokens = this.tokens.filter((_, idx) => !map.has(idx));
        //Problem with  = as it's affecting the variable before it
        const check = (index) => {
            return (!this.tokens?.[index - 1]?.affectedOperatorRange?.() &&
                !this.tokens?.[index + 1]?.affectedOperatorRange?.());
        };
        const numMap = this.tokens.map((token, index) => token.type === 'number' && check(index) ? index : null).filter((item) => item !== null);
        const varMap = this.tokens.map((token, index) => token.type === 'variable' && check(index) ? index : null).filter((item) => item !== null);
        const arr = [
            ...findConsecutiveSequences(numMap),
            ...findConsecutiveSequences(varMap),
        ];
        this.connectAndCombine(arr);
        idParentheses(this.tokens);
    }
    connectAndCombine(arr) {
        const indexes = [];
        arr.sort((a, b) => b[0] - a[0]).forEach(el => {
            indexes.push({ start: el[0], end: el[el.length - 1] });
        });
        indexes.forEach((index) => {
            let value = Number(this.tokens[index.start].value);
            const isVar = this.tokens.slice(index.start, index.end + 1).find((token) => token.type.includes('var'));
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
                    const p1 = findParenIndex(undefined, index, tokens);
                    const p2 = findParenIndex(undefined, p1.close + 1, tokens);
                    map.push(p1, p2);
                }
                else if (index > 0 && rightBrackets.includes(prevToken)) {
                    map.push(findParenIndex(undefined, index, tokens));
                }
            }
            else if (token.value === ')' && bothBrackets.includes(nextToken)) {
                map.push(findParenIndex(undefined, index, tokens));
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
        const regExpvalue = (value instanceof RegExp) ? value : new RegExp(value);
        return ((value === null || regExpvalue.test(token[compare])) &&
            token[compare] === nextToken?.[compare]);
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
        if (this.type === 'operator' && typeof this.value === 'string') {
            this.value = searchMathJaxOperators(this.value)?.name;
        }
        // if (!this.value){throw new Error('wtf Value was undefined at token insurProperFormatting')}
    }
    getId() { return this.id.id; }
    ;
    getLatexSymbol() { return typeof this.value === 'string' ? searchMathJaxOperators(this.value)?.latex : undefined; }
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
            string += this.getLatexSymbol();
        if (this.type === 'variable')
            string += this.toStringVariable();
        if (this.type === 'number')
            string += this.value;
        return string;
    }
    affectedOperatorRange(direction) {
        if (this.type !== 'operator' || this.value === 'Equals')
            return false;
        if (typeof this.value === 'string' && direction === 'left' && !getOperatorsByAssociativity('both').includes(this.value))
            return false;
        return true;
    }
    toStringVariable() {
        return (this.value && this?.value !== 1 ? this.value : '') + (this.variable || '');
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
        return this.tokens.some((t) => t.type === 'variable' && t.value > 1);
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
        if ((!befor || !after) || !whatToIsolat || (befor?.size < 2 && after?.size < 2))
            return;
        return { overviewSideOne: befor, overviewSideTwo: after, ...whatToIsolat };
    } /*
    howToIsolate(overviewSideOne,overviewSideTwo,isolationGool){
        const isolationType=isolationGool.splt(':');
        //if (){}
    }*/
    whatToIsolat() {
        // i need to add pows after
        // for know im going on the oshomshin that thr is only one var
        if (this.variables?.length < 1)
            return;
        return { type: 'variable', value: this.variables[0] };
    } /*
    isOverviewToisolat(overview){
    }*/
    isImbalance(overview) {
        overview.size > 1;
    }
    equalsIndexIfAny() {
        const eqIndex = this.tokens.map((t, idx) => t.value === 'Equals' ? idx : null).filter((m) => m !== null);
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
        if (!tokens)
            return;
        const overview = new Map();
        tokens.forEach(token => {
            //if (!token.isValueToken()) {return;}
            const key = token.getFullTokenID();
            //Equals
            if (!overview.has(key)) {
                const entry = {
                    type: token.type,
                    count: 0,
                    variable: undefined
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
class Operator {
}
class Modifier {
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLElBQUksRUFBaUMsZ0JBQWdCLEVBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQUM1SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQXFCLE1BQU0sZUFBZSxDQUFDO0FBRXBFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBUSxNQUFNLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUdwRSxPQUFPLEVBQUUsY0FBYyxFQUFRLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzdFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSw2QkFBNkIsRUFBRSwyQkFBMkIsRUFBRSxxQkFBcUIsRUFBRSx5QkFBeUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRXJNLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFVO0lBQy9DLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNyQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxD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R0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDckIsTUFBTSxLQUFLLEdBQUc7b0JBQ1YsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO29CQUNoQixLQUFLLEVBQUUsQ0FBQztvQkFDUixRQUFRLEVBQUUsU0FBUztpQkFDdEIsQ0FBQztnQkFDRixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7b0JBQzVCLEtBQUssQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsQ0FBQztnQkFFRCxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3QixDQUFDO1lBQ0QsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sUUFBUSxDQUFBLENBQUEsZ0NBQWdDO0lBQ25ELENBQUM7Q0FDSjtBQUVELE1BQU0sUUFBUTtDQUViO0FBRUQsTUFBTSxRQUFRO0NBRWIiLCJzb3VyY2VzQ29udGVudCI6WyJcclxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlcywgY2FsY3VsYXRlRmFjdG9yaWFsfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4uL2ltVmVyeUxhenlcIjtcclxuaW1wb3J0IHsgdHlwZSB9IGZyb20gXCJvc1wiO1xyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCByZWdFeHAgfSBmcm9tIFwiLi4vdGlrempheC90aWt6amF4XCI7XHJcbmltcG9ydCB7ICB9IGZyb20gXCJzcmMvdXRpbHMvc3RhdGljRGF0YVwiO1xyXG5pbXBvcnQgeyBjcCB9IGZyb20gXCJmc1wiO1xyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcyB9IGZyb20gXCIuLi91dGlscy90b2tlblV0ZW5zaWxzXCI7XHJcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRPcGVyYXRvcnNCeUJyYWNrZXQsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcclxuaW1wb3J0IHsgc3RyaW5nIH0gZnJvbSBcInpvZFwiO1xyXG5jb25zdCBncmVla0xldHRlcnMgPSBbXHJcbiAgICAnQWxwaGEnLCdhbHBoYScsICdCZXRhJywgJ0dhbW1hJywgJ0RlbHRhJywgJ0Vwc2lsb24nLCAnWmV0YScsICdFdGEnLCAnVGhldGEnLCBcclxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXHJcbiAgICAnU2lnbWEnLCAnVGF1JywgJ1Vwc2lsb24nLCAnUGhpJywgJ0NoaScsICdQc2knLCAnT21lZ2EnXHJcbl07XHJcbi8qY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xyXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXHJcbiAgICAnYXRhbicsICdhcmNjb3MnLCAnYXJjc2luJywgJ2FyY3RhbicsICdjZG90Jywnc3FydCdcclxuXSovXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKGFycjogYW55W10pIHtcclxuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xyXG4gICAgbGV0IHN0YXJ0ID0gMDtcclxuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IGFyci5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XHJcbiAgICAgICAgICAgIGlmIChpIC0gc3RhcnQgPiAxKSB7XHJcbiAgICAgICAgICAgICAgICBzZXF1ZW5jZXMucHVzaChhcnIuc2xpY2Uoc3RhcnQsIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzdGFydCA9IGk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHNlcXVlbmNlcztcclxufVxyXG5cclxuXHJcbmNvbnN0IG9wZXJhdG9yc0Zvck1hdGhpbmZvID0ge1xyXG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcclxuICAgIHJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2g6IFtcInNxcnRcIl0sXHJcbiAgICBib3RoOiBbXCIrXCIsIFwiLVwiLCBcIipcIl0sXHJcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxyXG4gICAgUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2g6IFtcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcclxuICAgIGRvdWJsZVJpZ2h0QnV0QnJhY2tldDogW1wiZnJhY1wiLCBcImJpbm9tXCIsXCIvXCJdXHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aEluZm97XHJcbiAgICBkZWJ1Z0luZm86IHN0cmluZz1cIlwiO1xyXG4gICAgc29sdXRpb25JbmZvOiBhbnlbXT1bXTtcclxuICAgIG1hdGhJbmZvOiBhbnlbXT1bXVxyXG4gICAgZ3JhcGg6IHN0cmluZz1cIlwiO1xyXG4gICAgYWRkR3JhcGhJbmZvKHZhbHVlOiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMuZ3JhcGgrPXZhbHVlO1xyXG4gICAgfVxyXG4gICAgYWRkRGVidWdJbmZvKG1zZzogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9KHR5cGVvZiBtc2c9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KG1zZyk6bXNnKStcIiA6IFwiKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlKTp2YWx1ZSkrIFwiXFxuIFwiO1xyXG4gICAgfVxyXG4gICAgYWRkU29sdXRpb25JbmZvKG1lczogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcclxuICAgICAgICB0aGlzLnNvbHV0aW9uSW5mby5wdXNoKG1lcyk7XHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xyXG4gICAgfVxyXG4gICAgYWRkTWF0aEluZm8odG9rZW5zOiBUb2tlbnMpe1xyXG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5wdXNoKHJlY29uc3RydWN0ZWRNYXRoKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFNvbHV0aW9uKHRva2VuczogVG9rZW5zLHBvc2l0aW9uOiBQb3NpdGlvbixzb2x1dGlvbjogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcclxuICAgICAgICBzb2x1dGlvbj10b2tlbnMucmVjb25zdHJ1Y3QoW3NvbHV0aW9uXSk7XHJcbiAgICAgICAgY29uc3QgbGVmdD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5pbmRleCkpO1xyXG4gICAgICAgIGNvbnN0IHJpZ2h0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmluZGV4KzEscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLCkpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRydWUpe1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGhCdXRSaWdodEJyYWNrZXQuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHBvc2l0aW9uLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKC9cXCovZywgXCJcXFxcY2RvdFwiKX0gJHtyaWdodH0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnNwZWNpYWwuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249IGBcXFxcZnJhY3ske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5yaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHBvc2l0aW9uLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5kb3VibGVSaWdodEJ1dEJyYWNrZXQuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoXCIvXCIsXCJmcmFjXCIpfXske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmFkZFNvbHV0aW9uSW5mbyhzb2x1dGlvbik7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qXHJcbmZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xyXG4gICAgaWYgKCEodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSl7cmV0dXJuIHZhbHVlfVxyXG4gICAgaWYgKHZhbHVlPT09XCIrXCIpe3JldHVybiAwfVxyXG4gICAgaWYgKHZhbHVlPT09XCItXCIpe3JldHVybiAtMX1cclxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QodmFsdWUpKXtyZXR1cm4gMX1cclxuICAgIGlmKC9bKFtdLy50ZXN0KHZhbHVlWzBdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgxKX1cclxuICAgIGlmKC9bKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cclxuICAgIGZvciAobGV0IGkgPSAwOyBpPHZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVtpXSA9PT0gXCJzdHJpbmdcIiAmJiAvWygpW1xcXV0vLnRlc3QodmFsdWVbaV0pKSB7XHJcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XHJcbiAgICAgICAgICAgIGktLTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bSkgPyB2YWx1ZS5sZW5ndGg+MD92YWx1ZTowIDogbnVtO1xyXG59Ki9cclxuXHJcbmZ1bmN0aW9uIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yOiBzdHJpbmcsbGVmdDogYW55LHJpZ2h0OiBhbnkpe1xyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiBsZWZ0Py52YWx1ZSE9PVwibnVtYmVyXCImJmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpLmluY2x1ZGVzKG9wZXJhdG9yKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQ/LnZhbHVlIT09XCJudW1iZXJcIikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJpZ2h0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gcGFyc2UocG9zaXRpb246IHsgb3BlcmF0b3I6IGFueTsgc3BlY2lhbENoYXI/OiBhbnk7IGxlZnQ/OiBhbnk7IHJpZ2h0PzogYW55OyB9KSB7XHJcbiAgICBsZXQgeyBvcGVyYXRvcixzcGVjaWFsQ2hhciwgbGVmdCxyaWdodH0gPSBwb3NpdGlvbjtcclxuICAgIFxyXG4gICAgbGVmdD1sZWZ0Py50b2tlbnNcclxuICAgIHJpZ2h0PXJpZ2h0LnRva2Vuc1xyXG4gICAgLy9jb25zb2xlLmxvZygndGhpcy5sZWZ0LHRoaXMucmlnaHQnLGxlZnQscmlnaHQpXHJcbiAgICBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcixsZWZ0LHJpZ2h0KTtcclxuICAgIFxyXG4gICAgbGV0IHNvbHZlZD1uZXcgVG9rZW4oMCx1bmRlZmluZWQpO1xyXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xyXG4gICAgICAgIGNhc2UgXCJTcXVhcmUgUm9vdFwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIlBvd1wiOlxyXG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZXx8cmlnaHQudmFyaWFibGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfHxsZWZ0LnZhcmlhYmxlPT09cmlnaHQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZT9yaWdodC52YXJpYWJsZTpcIlwiO1xyXG4gICAgICAgICAgICAgICAgLy9zb2x2ZWQucG93PTJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIkZyYWN0aW9uXCI6XHJcbiAgICAgICAgY2FzZSBcIi9cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKGxlZnQudmFsdWUpLyhyaWdodC52YWx1ZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJNdWx0aXBsaWNhdGlvblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICogcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIGhhbmRsZVZyaWFibGVzKGxlZnQsIHJpZ2h0LHNvbHZlZCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCIrXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKyByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIk1pbnVzXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgLSByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImJpbm9tXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGNhbGN1bGF0ZUZhY3RvcmlhbChsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInNpblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJjb3NcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5jb3MoZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ0YW5cIjpcclxuICAgICAgICAgICAgaWYgKHJpZ2h0Pj05MCl7dGhyb3cgbmV3IEVycm9yKFwidGFuIE11c3QgYmUgc21hbGxlciB0aGFuIDkwXCIpO31cclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc2luXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY3NpblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXNpbihyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYWNvc1wiOlxyXG4gICAgICAgIGNhc2UgXCJhcmNjb3NcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFjb3MocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImF0YW5cIjpcclxuICAgICAgICBjYXNlIFwiYXJjdGFuXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGlkZW50aWZ5IG9wZXJhdG9yIHR5cGUgYXQgcHJhaXNlIG9wZXJhdG9yOiBcIitwb3NpdGlvbi5vcGVyYXRvcik7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0OiB7IHZhcmlhYmxlOiBhbnk7IHBvdzogYW55OyB2YWx1ZTogbnVtYmVyOyB9LCByaWdodDogeyB2YXJpYWJsZTogYW55OyBwb3c6IGFueTsgdmFsdWU6IG51bWJlcjsgfSwgc29sdmVkOiBUb2tlbikge1xyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlICYmIGxlZnQudmFyaWFibGUgIT09IHJpZ2h0LnZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIC8qIEtlZXAgdGhlbSBzZXBhcmF0ZSBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZhcmlhYmxlc1xyXG4gICAgICAgICAgICBzb2x2ZWQudGVybXMgPSBbXHJcbiAgICAgICAgICAgICAgICB7IHZhcmlhYmxlOiBsZWZ0LnZhcmlhYmxlLCBwb3c6IGxlZnQucG93IHx8IDEsIHZhbHVlOiBsZWZ0LnZhbHVlIHx8IDEgfSxcclxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IHJpZ2h0LnZhcmlhYmxlLCBwb3c6IHJpZ2h0LnBvdyB8fCAxLCB2YWx1ZTogcmlnaHQudmFsdWUgfHwgMSB9XHJcbiAgICAgICAgICAgIF07Ki9cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlmZmVyZW50IHZhcmlhYmxlIGJhc2VzIGF0IHBvd2VyIG11bHRpcGxpY2F0aW9uLiBJIGRpZG4ndCBnZXQgdGhlcmUgeWV0XCIpXHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgIHNvbHZlZC52YXJpYWJsZSA9IHZhcmlhYmxlLmxlbmd0aD4wP3ZhcmlhYmxlOnVuZGVmaW5lZDtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcclxuICAgICAgICBwb3c9bGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSYmcG93PT09MCYmIWxlZnQucG93JiYhcmlnaHQucG93PzI6cG93O1xyXG4gICAgICAgIC8vc29sdmVkLnBvdyA9IHBvdyB8fCB1bmRlZmluZWQ7XHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIC8vIFJ1bGUgMzogSGFuZGxlIG11bHRpcGxpY2F0aW9uIG9mIGNvbnN0YW50c1xyXG4gICAgICAgIGNvbnN0IGxlZnRWYWx1ZSA9IGxlZnQudmFsdWUgfHwgMTtcclxuICAgICAgICBjb25zdCByaWdodFZhbHVlID0gcmlnaHQudmFsdWUgfHwgMTtcclxuICAgICAgICBjb25zdCB2YWx1ZSA9IGxlZnRWYWx1ZSAqIHJpZ2h0VmFsdWU7XHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBubyB2YXJpYWJsZSwgYXNzaWduIHRoZSByZXN1bHQgYXMgYSBjb25zdGFudFxyXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICBmdW5jdGlvbiBoYW5kbGVWcmlhYmxlcyhsZWZ0OiBhbnkscmlnaHQ6IGFueSxzb2x2ZWQ6IFRva2VuKXtcclxuICAgICAgICBsZXQgaGFuZGxlZD17VmFyOm51bGwsUG93Om51bGx9O1xyXG4gICAgICAgIGlmICghbGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtcclxuICAgICAgICAgICAgcmV0dXJuIDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHBvc2l0aW9uLm9wZXJhdG9yPT09JyonKXtyZXR1cm4gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0LHJpZ2h0LHNvbHZlZCl9XHJcbiAgICAgICAgLy9jb25zb2xlLmxvZyhsZWZ0LnZhcmlhYmxlLHJpZ2h0LnZhcmlhYmxlKVxyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUd28gdmFyaWFibGUgZXF1YXRpb25zIGFyZW4ndCBhY2NlcHRlZCB5ZXRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XHJcbiAgICAgICAgLy9zb2x2ZWQudmFyaWFibGU9bGVmdC52YXJcclxuXHJcbiAgICAgICAgLypcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cclxuICAgICAgICAqL1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICByZXR1cm4gc29sdmVkO1xyXG59XHJcblxyXG5mdW5jdGlvbiBvcGVyYXRpb25zT3JkZXIodG9rZW5zOiBUb2tlbnMpIHtcclxuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luOiBudW1iZXIsIGVuZDogbnVtYmVyLCB0b2tlbnM6IGFueSwgZmluZFBhcmVuSW5kZXg/OiBhbnksIHJlZ2V4PzogYW55KSB7XHJcbiAgICAgICAgd2hpbGUgKGJlZ2luIDwgZW5kICYmIGJlZ2luIDwgdG9rZW5zLnRva2Vucy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgbGV0IGluZGV4O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHJlZ2V4KSB7XHJcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy50b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBhbnk7IH0pID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIiAmJiByZWdleC50ZXN0KHRva2VuLnZhbHVlKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy50b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0pID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybiAtMTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCEvWystXS8udGVzdCh0b2tlbnMudG9rZW5zW2luZGV4XS52YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPiAwICYmIGluZGV4IDwgdG9rZW5zLnRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vucy50b2tlbnNbaW5kZXggKyAxXS50eXBlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJlZ2luID0gaW5kZXggKyAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gLTE7XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGJlZ2luID0gMCwgZW5kID0gdG9rZW5zLnRva2Vucy5sZW5ndGgsaj0wO1xyXG4gICAgbGV0IGN1cnJlbnRJRCA9IG51bGw7ICBcclxuICAgIGxldCBjaGVja2VkSURzOiBhbnlbXSA9IFtdOyAgXHJcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xyXG4gICAgd2hpbGUgKCFvcGVyYXRvckZvdW5kJiZqPDIwMCkge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGlubmVybW9zdCBwYXJlbnRoZXNlc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLnRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBqKys7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnMudG9rZW5zW2ldLnZhbHVlID09PSBcIihcIiAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnMudG9rZW5zW2ldLmlkKSkge1xyXG4gICAgICAgICAgICAgICAgY3VycmVudElEID0gZmluZFBhcmVuSW5kZXgodG9rZW5zLnRva2Vuc1tpXS5pZCk7ICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoY3VycmVudElEIT09bnVsbCYmaT09PWN1cnJlbnRJRC5jbG9zZSkge1xyXG4gICAgICAgICAgICAgICAgW2JlZ2luLGVuZF09W2N1cnJlbnRJRC5vcGVuLGN1cnJlbnRJRC5jbG9zZV1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghY3VycmVudElEKSB7XHJcbiAgICAgICAgICAgIGJlZ2luID0gMDtcclxuICAgICAgICAgICAgZW5kID0gdG9rZW5zLnRva2Vucy5sZW5ndGg7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBvcGVyYXRvckZvdW5kID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sZW5kLHRva2VucykhPT0tMTtcclxuXHJcbiAgICAgICAgLy8gSWYgbm8gb3BlcmF0b3IgaXMgZm91bmQsIG1hcmsgdGhpcyBwYXJlbnRoZXNlcyBwYWlyIGFzIGNoZWNrZWRcclxuICAgICAgICBpZiAoIW9wZXJhdG9yRm91bmQpIHtcclxuICAgICAgICAgICAgY2hlY2tlZElEcy5wdXNoKGN1cnJlbnRJRC5pZCk7ICBcclxuICAgICAgICAgICAgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChqPj0yMDApe3Rocm93IG5ldyBFcnJvcihcIm9wZXJhdGlvbnNPcmRlciBGYWlsZWQgZXhjZWVkZWQgMjAwIHJldmlzaW9uc1wiKTt9XHJcblxyXG4gICAgZm9yIChsZXQgaT0xO2k8PTY7aSsrKXtcclxuICAgICAgICBsZXQgcHJpb3JpdHkgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KGksdHJ1ZSkpO1xyXG4gICAgICAgIGlmKHByaW9yaXR5IT09LTEpcmV0dXJuIHByaW9yaXR5XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IHByaW9yaXR5MSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHkoMSx0cnVlKSk7XHJcbiAgICBsZXQgcHJpb3JpdHkyID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSgyLHRydWUpKTtcclxuICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KDMsdHJ1ZSkpO1xyXG4gICAgbGV0IHByaW9yaXR5NCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHkoNCx0cnVlKSk7XHJcbiAgICBsZXQgcHJpb3JpdHk1ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSg1LHRydWUpKTtcclxuICAgIGxldCBwcmlvcml0eTYgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KDYsdHJ1ZSkpO1xyXG5cclxuICAgIHJldHVybiBbcHJpb3JpdHkxLCBwcmlvcml0eTIsIHByaW9yaXR5MywgcHJpb3JpdHk0LCBwcmlvcml0eTUscHJpb3JpdHk2XS5maW5kKGluZGV4ID0+IGluZGV4ICE9PSAtMSk/P251bGw7XHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xyXG4gICAgb3BlcmF0b3I6IHN0cmluZztcclxuICAgIGluZGV4OiBudW1iZXI7XHJcbiAgICB0cmFuc2l0aW9uOiBudW1iZXI7XHJcbiAgICBzcGVjaWFsQ2hhcjogc3RyaW5nO1xyXG4gICAgbGVmdDogYW55O1xyXG4gICAgcmlnaHQ6IGFueTtcclxuICAgIGNvbnN0cnVjdG9yKHRva2VuczogVG9rZW5zLCBpbmRleD86IG51bWJlcil7XHJcbiAgICAgICAgaWYoaW5kZXgpXHJcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xyXG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgdGhpcy5wb3NpdGlvbih0b2tlbnMpXHJcbiAgICB9XHJcbiAgICBwb3NpdGlvbih0b2tlbnM6IFRva2Vucykge1xyXG4gICAgICAgIHRoaXMuaW5kZXggPSAhdGhpcy5pbmRleD8gb3BlcmF0aW9uc09yZGVyKHRva2VucykgOiB0aGlzLmluZGV4O1xyXG4gICAgICAgIGlmICghdGhpcy5pbmRleHx8dGhpcy5pbmRleCA9PT0gbnVsbCB8fCB0aGlzLmluZGV4ID49IHRva2Vucy50b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnZhbHVlO1xyXG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdyaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0ge2JyZWFrQ2hhcjogdGhpcy5pbmRleH07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5sZWZ0LmJyZWFrQ2hhcjtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnRyYW5zaXRpb24tMSxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0LmJyZWFrQ2hhciA9IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0LmJyZWFrQ2hhcisodGhpcy5yaWdodC5tdWx0aVN0ZXA/MTowKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IHdhcyBub3QgYWNjb3VudGVkIGZvciwgb3IgaXMgbm90IHRoZSB2YWxpZCBvcGVyYXRvcmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL2NvbnNvbGUubG9nKHRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnMudG9rZW5zW3RoaXMuaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zLnRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA6IG51bGw7XHJcbiAgICB9XHJcbiAgICBhcHBseVBvc2l0aW9uKHRva2VuczogVG9rZW5zLCBpbmRleDogIG51bWJlciwgZGlyZWN0aW9uOiBzdHJpbmcpIHtcclxuICAgICAgICBsZXQgYnJlYWtDaGFyPWluZGV4XHJcbiAgICAgICAgbGV0IHRhcmdldDtcclxuICAgICAgICBsZXQgbXVsdGlTdGVwPWZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGlzTGVmdCA9IGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCI7XHJcbiAgICAgICAgY29uc3QgaW5kZXhNb2RpZmllciA9ICBpc0xlZnQ/LSAxIDogIDE7XHJcbiAgICAgICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLnRva2Vucy5sZW5ndGggLSAxKSB8fCAhdG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIiBpbmRleDogXCIraW5kZXgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodG9rZW5zLnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgcGFyZW5JbmRleCA9IGZpbmRQYXJlbkluZGV4KHRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xyXG4gICAgICAgICAgICBicmVha0NoYXIgPSAgaXNMZWZ0ID8gcGFyZW5JbmRleC5vcGVuIDogcGFyZW5JbmRleC5jbG9zZSsxO1xyXG4gICAgICAgICAgICB0YXJnZXQgPSB0b2tlbnMudG9rZW5zLnNsaWNlKHBhcmVuSW5kZXgub3BlbiwgcGFyZW5JbmRleC5jbG9zZSsxKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBicmVha0NoYXI9aW5kZXgraW5kZXhNb2RpZmllcjtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnRva2Vuc1ticmVha0NoYXJdO1xyXG4gICAgICAgICAgICBicmVha0NoYXIrPWlzTGVmdD8wOjFcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9jb25zdCBtdWx0aVN0ZXAgPSBNYXRoLmFicyhicmVha0NoYXIgLSBpbmRleCkgPiAzO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKCFtdWx0aVN0ZXAmJnRva2Vucy50b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKXtcclxuICAgICAgICAgICAgLy90YXJnZXQ9dGFyZ2V0LmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGFyZ2V0Py5sZW5ndGg9PT0wKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgYXQgYXBwbHlQb3NpdGlvbjogY291bGRuJ3QgZmluZCB0YXJnZXQgdG9rZW4gZm9yIGRpcmVjdGlvbiAke2RpcmVjdGlvbn0gYW5kIG9wZXJhdG9yXCIke3Rva2Vucy50b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIC8vYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XHJcbiAgICAgICAgLy9kZWxldGUgdGFyZ2V0LmluZGV4XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRhcmdldC5sZW5ndGg9PT0zKXtcclxuICAgICAgICAgICAgdGFyZ2V0PXRhcmdldC5maW5kKChpdGVtOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcclxuICAgICAgICB9ZWxzZSBpZih0YXJnZXQubGVuZ3RoPjEpbXVsdGlTdGVwPXRydWVcclxuICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHRva2VuczogdGFyZ2V0LFxyXG4gICAgICAgICAgICBtdWx0aVN0ZXA6IG11bHRpU3RlcCxcclxuICAgICAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXIsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XHJcbiAgICAgICAgcmV0dXJuICgoZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcikmJnRoaXMubGVmdD8ubXVsdGlTdGVwKXx8dGhpcy5yaWdodD8ubXVsdGlTdGVwKSYmdGhpcy5vcGVyYXRvcj09PSdNdWx0aXBsaWNhdGlvbic7XHJcbiAgICB9XHJcbiAgICBpc0xlZnRWYXIoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5sZWZ0Lm11bHRpU3RlcD90aGlzLmxlZnQudG9rZW5zLnNvbWUoKHQ6IHsgdHlwZTogc3RyaW5nOyB9KT0+dC50eXBlPT09J3ZhcmlhYmxlJ3x8dC50eXBlPT09J3Bvd2VyVmFyaWFibGUnKTp0aGlzLmxlZnQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxyXG4gICAgfVxyXG4gICAgaXNSaWdodFZhcigpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJpZ2h0Lm11bHRpU3RlcD90aGlzLnJpZ2h0LnRva2Vucy5zb21lKCh0OiB7IHR5cGU6IHN0cmluZzsgfSk9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5yaWdodC50b2tlbnMudHlwZS5pbmNsdWRlcygnYXJpYWJsZScpXHJcbiAgICB9XHJcbiAgICBjaGVja0ZyYWMoKXsvLyF0aGlzLmNoZWNrTXVsdGlTdGVwKCkgSSBkb24ndCBrbm93IHdoeSBJIGhhZCB0aGlzIGhlcmVcclxuICAgICAgICByZXR1cm4gLyhmcmFjfFxcLykvLnRlc3QodGhpcy5vcGVyYXRvcikmJih0aGlzLmlzTGVmdFZhcigpfHx0aGlzLmlzUmlnaHRWYXIoKSlcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiByZWFycmFuZ2VFcXVhdGlvbih0b2tlbnM6IGFueSx0b2tlblRvaXNvbGF0ZTogYW55KXtcclxuICAgIFxyXG59XHJcblxyXG5mdW5jdGlvbiBpc29sYXRlTXVsdGlwbGljYXRpb24odG9rZW5zOiBhbnksaXNvbGF0VG9rZW46IFRva2VuKXtcclxuICAgIGNvbnN0IGluZGV4PW9wZXJhdGlvbnNPcmRlcih0b2tlbnMpXHJcbiAgICBjb25zdCBJc29sYXRlZD10b2tlbnMudG9rZW5zLmZpbmQoKHRva2VuOiBhbnksIGlkeDogbnVtYmVyKT0+aWR4PGluZGV4KVxyXG4gICAgY29uc3QgZnJhYz1jcmVhdGVGcmFjKHRva2Vucy5saXN0LnNsaWNlKGluZGV4ICsgMSksbmV3IFRva2VuKElzb2xhdGVkLnZhbHVlKSlcclxuICAgIElzb2xhdGVkLnZhbHVlPTE7XHJcbiAgICB0b2tlbnMuaW5zZXJ0VG9rZW5zKGluZGV4KzEsdG9rZW5zLnRva2Vucy5sZW5ndGgtaW5kZXgrMSxmcmFjKVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVGcmFjKG5vbWluYXRvcjogYW55LGRlbm9taW5hdG9yOiBUb2tlbil7XHJcbiAgICByZXR1cm4gW25ldyBUb2tlbignZnJhYycpLG5ldyBUb2tlbignKCcpLG5vbWluYXRvcixuZXcgVG9rZW4oJyknKSxuZXcgVG9rZW4oJygnKSxkZW5vbWluYXRvcixuZXcgVG9rZW4oJyknKV1cclxufVxyXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zOiBhbnlbXSl7XHJcbiAgICBpZiAodG9rZW5zLmxlbmd0aDw9MSl7cmV0dXJuIHRva2Vuc31cclxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xyXG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUoKHRva2VuOiBhbnkpID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxyXG4gICAge1xyXG4gICAgICAgIGkrKztcclxuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xyXG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XHJcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxyXG5cclxuICAgICAgICBsZXQgY3VycmVudFRva2VuPXt0eXBlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgLCB2YWx1ZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YWx1ZSx2YXJpYWJsZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YXJpYWJsZSAscG93OiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnBvd31cclxuXHJcbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaTogYW55KSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogeyB0b2tlbjogeyB0eXBlOiBhbnk7IH07IH0pID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcclxuICAgICAgICAucmVkdWNlKChzdW06IG51bWJlciwgaXRlbTogeyBvcmlnaW5hbEluZGV4OiBudW1iZXI7IHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IG51bWJlcjsgfTsgfSkgPT4ge1xyXG4gICAgICAgIGxldCBtdWx0aXBsaWVyPSh0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0gJiYgdG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdLnZhbHVlID09PSBcIi1cIikgPyAtMSA6IDE7XHJcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcclxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxyXG4gICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xyXG4gICAgICAgIH0sIDApOyBcclxuICAgICAgICBcclxuICAgICAgICBuZXdUb2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgIC4uLmN1cnJlbnRUb2tlbixcclxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXHJcbiAgICAgICAgICAgIHRva2VuLnR5cGUgIT09IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSB8fCBcclxuICAgICAgICAgICAgKHRva2VuLnZhcmlhYmxlICYmIHRva2VuLnZhcmlhYmxlICE9PSBjdXJyZW50VG9rZW4udmFyaWFibGUpIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ld1Rva2VucztcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRva2VuczogVG9rZW5zLCBpc29sYXRpb25Hb2FsOiB7IHR5cGU6IGFueTsgdmFsdWU6IGFueTsgb3ZlcnZpZXdTaWRlT25lPzogTWFwPGFueSwgYW55Pjsgb3ZlcnZpZXdTaWRlVHdvPzogTWFwPGFueSwgYW55PjsgfSkge1xyXG4gICAgaWYgKHRva2Vucy50b2tlbnMubGVuZ3RoIDw9IDEpIHJldHVybiB0b2tlbnM7XHJcblxyXG4gICAgY29uc3QgZXFJbmRleCA9IHRva2Vucy50b2tlbnMuZmluZEluZGV4KCh0OiB7IHZhbHVlOiBzdHJpbmc7IH0pID0+IHQudmFsdWUgPT09ICdFcXVhbHMnKTtcclxuICAgIGlmIChlcUluZGV4ID09PSAtMSkgdGhyb3cgbmV3IEVycm9yKFwiTm8gJ0VxdWFscycgb3BlcmF0b3IgZm91bmQgaW4gdG9rZW5zXCIpO1xyXG5cclxuICAgIGNvbnN0IHN3aXRjaERpcmVjdGlvbiA9IGZhbHNlOyAvLyBGdXR1cmUgbG9naWMgdG8gZGV0ZXJtaW5lIGRpcmVjdGlvblxyXG4gICAgY29uc3QgaXNvbGF0aW9uR29hbEluZGljZXMgPSB0b2tlbnMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodDogeyB0eXBlOiBhbnk7IHZhcmlhYmxlOiBhbnk7IH0sIGlkeDogYW55KSA9PiAodC50eXBlID09PSBpc29sYXRpb25Hb2FsLnR5cGUgJiYgdC52YXJpYWJsZSA9PT0gaXNvbGF0aW9uR29hbC52YWx1ZSA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgY29uc3Qgb3RoZXJJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKF86IGFueSwgaWR4OiBhbnkpID0+ICghaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaWR4KSAmJiBpZHggIT09IGVxSW5kZXggPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHg6IG51bGx8bnVtYmVyKSA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgIC8vIEFkanVzdCBzaWduc1xyXG4gICAgdG9rZW5zLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogeyB2YWx1ZTogbnVtYmVyOyB9LCBpOiBudW1iZXIpID0+IHtcclxuICAgICAgICBpZiAoKHN3aXRjaERpcmVjdGlvbj8gaSA+IGVxSW5kZXggOiBpIDwgZXFJbmRleCkgJiYgb3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XHJcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoKHN3aXRjaERpcmVjdGlvbj8gaSA8IGVxSW5kZXggOiBpID4gZXFJbmRleCkgJiYgaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHtcclxuICAgICAgICAgICAgdG9rZW4udmFsdWUgKj0gLTE7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU2VwYXJhdGUgc2lkZXNcclxuICAgIGNvbnN0IHNpZGUxOiBhbnlbXSA9IFtdO1xyXG4gICAgY29uc3Qgc2lkZTI6IGFueVtdID0gW107XHJcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnksIGk6IGFueSkgPT4ge1xyXG4gICAgICAgIGlmIChpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpKSkgc2lkZTEucHVzaCh0b2tlbik7XHJcbiAgICAgICAgaWYgKG90aGVySW5kaWNlcy5pbmNsdWRlcyhpKSkgc2lkZTIucHVzaCh0b2tlbik7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0b2tlbnMudG9rZW5zID0gc3dpdGNoRGlyZWN0aW9uXHJcbiAgICAgICAgPyBbLi4uc2lkZTIsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUxXVxyXG4gICAgICAgIDogWy4uLnNpZGUxLCB0b2tlbnMudG9rZW5zW2VxSW5kZXhdLCAuLi5zaWRlMl07XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcclxuICAgIGlucHV0PVwiXCI7XHJcbiAgICB0b2tlbnM6IFRva2VucztcclxuICAgIHNvbHV0aW9uPVwiXCI7XHJcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcclxuICAgIGk9MDtcclxuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcclxuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiVG9rZW5zIGFmdGVyIHRva2VuaXplXCIsdGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHRoaXMuaW5wdXQ9dGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxyXG4gICAgICAgIHRoaXMuc29sdXRpb249dGhpcy5jb250cm9sbGVyKCk7XHJcbiAgICB9XHJcbiAgICBnZXRSZWR5Zm9yTmV3Um9uZCgpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmNvbm5lY3ROZWFyYnlUb2tlbnMoKTtcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZE1hdGhJbmZvKHRoaXMudG9rZW5zKVxyXG4gICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8odGhpcy50b2tlbnMudG9rZW5zLHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGgpXHJcbiAgICAgICAgdGhpcy50b2tlbnMuZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKTtcclxuICAgIH1cclxuICAgIGNvbnRyb2xsZXIoKTogYW55e1xyXG4gICAgICAgIHRoaXMuaSsrO1xyXG4gICAgICAgIGlmKHRoaXMuaT4xMCl7cmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKX1cclxuXHJcbiAgICAgICAgdGhpcy5nZXRSZWR5Zm9yTmV3Um9uZCgpO1xyXG4gICAgICAgIC8vY29uc3Qgb3ZlcnZpZXc9dGhpcy50b2tlbnMuZ2V0T3ZlcnZpZXcoKVxyXG4gICAgICAgIGNvbnN0IHByYWlzaW5nTWV0aG9kPW5ldyBQcmFpc2luZ01ldGhvZCh0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgaWYgKHByYWlzaW5nTWV0aG9kLmlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpKXtcclxuICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy50b2tlbnMpO1xyXG4gICAgICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlBhcnNlZCBleHByZXNzaW9uXCIsIEpTT04uc3RyaW5naWZ5KHBvc2l0aW9uLCBudWxsLCAxKSk7XHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbiA9PT0gbnVsbCYmdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xKXtcclxuICAgICAgICAgICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8oXCJwYXJzZSh0b2tlbnMpXCIscGFyc2UodGhpcy50b2tlbnMudG9rZW5zKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBcInRoZSAqKioqXCJcclxuICAgICAgICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLypcclxuICAgICAgICAgICAgZWxzZSBpZiAocG9zaXRpb24uaW5kZXggPT09IG51bGwpe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKTtcclxuICAgICAgICAgICAgfSovXHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbi5jaGVja0ZyYWMoKXx8cG9zaXRpb24uY2hlY2tNdWx0aVN0ZXAoKSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZXhwYW5kRXhwcmVzc2lvbih0aGlzLnRva2Vucyxwb3NpdGlvbik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZFNvbHV0aW9uSW5mbyh0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCh0aGlzLnRva2Vucy50b2tlbnMpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy51c2VQYXJzZShwb3NpdGlvbilcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYocHJhaXNpbmdNZXRob2QuaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKSl7XHJcbiAgICAgICAgICAgIHRoaXMudXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kKVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCB0b0lzb2xhdGU9cHJhaXNpbmdNZXRob2QuaXNBbnl0aGluZ1RvSXNvbGF0ZSgpXHJcbiAgICAgICAgaWYgKHRvSXNvbGF0ZSl7XHJcbiAgICAgICAgICAgIHJlYXJyYW5nZUZvcklzb2xhdGlvbih0aGlzLnRva2Vucyx0b0lzb2xhdGUpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgICAgIH0gICBcclxuICAgICAgICAvL2lmIChzb2x2ZWQgPT09IG51bGx8fHR5cGVvZiBzb2x2ZWQ9PT1cInN0cmluZ1wiKSB7cmV0dXJuIHNvbHZlZDsgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLmZpbmFsUmV0dXJuKCkvL3RoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MT90aGlzLmNvbnRyb2xsZXIoKTp0aGlzLmZpbmFsUmV0dXJuKCk7XHJcbiAgICB9XHJcblxyXG4gICAgdXNlUGFyc2UocG9zaXRpb246IFBvc2l0aW9uKXtcclxuICAgICAgICBjb25zdCBzb2x2ZWQgPSBwYXJzZShwb3NpdGlvbik7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzb2x2ZWRcIixzb2x2ZWQpXHJcbiAgICAgICAgY29uc3QgW2xlZnRCcmVhayxsZW5ndGhdID0gW3Bvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLnJpZ2h0LmJyZWFrQ2hhci1wb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcl1cclxuICAgICAgICB0aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMobGVmdEJyZWFrLGxlbmd0aCxzb2x2ZWQpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbih0aGlzLnRva2Vucyxwb3NpdGlvbixzb2x2ZWQpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJuZXdUb2tlbnNcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByYWlzaW5nTWV0aG9kKCl7XHJcbiAgICAgICAgLypcclxuICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGUpPT50aGlzLnRva2Vucy50b2tlbnMuZmlsdGVyKHRva2VuID0+IHRva2VuLnR5cGUgPT09IHR5cGUpO1xyXG4gICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudXNlUXVhZHJhdGljKClcclxuICAgICAgICByZXR1cm4gdGhpcy51c2VJc29sYXQoKTsqL1xyXG4gICAgfVxyXG5cclxuICAgIHVzZUlzb2xhdChwcmFpc2luZ01ldGhvZDogUHJhaXNpbmdNZXRob2Qpe1xyXG4gICAgICAgIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0aGlzLnRva2VucyxuZXcgVG9rZW4ocHJhaXNpbmdNZXRob2QudmFyaWFibGVzWzBdKSlcclxuICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcclxuICAgICAgICAvL3RoaXMudG9rZW5zLmluc2VydFRva2VucygpXHJcbiAgICAgICAgLy9Vc2UgcG9zc2Vzc2lvblxyXG4gICAgfVxyXG5cclxuICAgIHVzZVF1YWRyYXRpYygpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zLnRva2Vucz1zaW1wbGlmaXkodGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgICAgICBjb25zdCBmaWx0ZXJCeVR5cGU9KHR5cGU6IHN0cmluZyk9PnRoaXMudG9rZW5zLnRva2Vucy5maWx0ZXIoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gdHlwZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cclxuICAgICAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzaW1wbGlmaXkodG9rZW5zKVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdPy52YWx1ZSAgfCAwLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0/LnZhbHVlIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICBudW1iZXJJbmRleFswXT8udmFsdWUgKiAtMXwgMCxcclxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXS52YXJpYWJsZSxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgIH1cclxuICAgIGFkZERlYnVnSW5mbyhtZXM6IHN0cmluZyx2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLmFkZERlYnVnSW5mbyhtZXMsdmFsdWUpXHJcbiAgICB9XHJcbiAgICBwcm9jZXNzSW5wdXQoKXtcclxuICAgICAgICB0aGlzLmlucHV0PXRoaXMuaW5wdXRcclxuICAgICAgICAucmVwbGFjZSgvKE1hdGgufFxcXFx8XFxzfGxlZnR8cmlnaHQpL2csIFwiXCIpIFxyXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC99L2csIFwiKVwiKVxyXG4gICAgICAgIC8vLnJlcGxhY2UoLyg/PCFcXFxcfFthLXpBLVpdKSh0YW58c2lufGNvc3xiaW5vbXxmcmFjfGFzaW58YWNvc3xhdGFufGFyY2Nvc3xhcmNzaW58YXJjdGFufGNkb3QpL2csIFwiXFxcXCQxXCIpO1xyXG4gICAgfVxyXG4gICAgZmluYWxSZXR1cm4oKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBtYXRoVmFyaWFibGVze1xyXG5cclxufVxyXG5cclxuXHJcbmNsYXNzIG1hdGhHcm91cHtcclxuICAgIG51bWJlck9ubHk6IGJvb2xlYW47XHJcbiAgICBoYXNWYXJpYWJsZXM6IGJvb2xlYW47XHJcbiAgICBzaW5ndWxhcjogYm9vbGVhbjtcclxuICAgIGhhc09wZXJhdG9yczogYm9vbGVhbjtcclxuICAgIG11bHRpTGV2ZWw6IGJvb2xlYW47XHJcbiAgICBpc09wZXJhYmxlOiBib29sZWFuPXRydWU7XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgVG9rZW5ze1xyXG4gICAgdG9rZW5zOiBhbnk9W107XHJcbiAgICBjb25zdHJ1Y3RvcihtYXRoOiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XHJcbiAgICB9XHJcbiAgICB0b2tlbml6ZShtYXRoOiBzdHJpbmcpe1xyXG4gICAgICAgIC8vbGF0ZXhPcGVyYXRvcnMucHVzaChTdHJpbmcucmF3YFsqL149XFwrXFwtXFwoXFwpXWApXHJcbiAgICAgICAgLy9jb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhsYXRleE9wZXJhdG9ycylcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcygpKVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKHJlZ0V4cCgnXicgKyBvcGVyYXRvcnMpKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IFRva2VuKG1hdGNoWzBdKSk7XHJcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8qaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09IFwic3FydFwiICYmIG1hdGhbaV0gPT09IFwiW1wiICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcclxuICAgICAgICAgICAgICAgIGxldCB0ZW1wPW1hdGguc2xpY2UoaSxpKzErbWF0aC5zbGljZShpKS5zZWFyY2goL1tcXF1dLykpO1xyXG4gICAgICAgICAgICAgICAgaSs9dGVtcC5sZW5ndGhcclxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcclxuICAgICAgICAgICAgfSovXHJcblxyXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKVxyXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IFRva2VuKHBhcnNlRmxvYXQobWF0Y2hbMF0pKSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLylcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIC8vaWYgKHZhcmkmJnZhcmkubGVuZ3RoPT09MCl7dmFyaT1tYXRoLnNsaWNlKGksbWF0aC5sZW5ndGgpfVxyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IFRva2VuKDEsbWF0Y2hbMF0pKVxyXG4gICAgICAgICAgICAgICAgLy90b2tlbnMucHVzaCh7dHlwZTogXCJ2YXJpYWJsZVwiLHZhcmlhYmxlOiB2YXJpLnJlcGxhY2UoXCIoXCIsXCJ7XCIpLnJlcGxhY2UoXCIpXCIsXCJ9XCIpLHZhbHVlOiAxfSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wb3N0UHJvY2Vzc1Rva2VucygpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcixtYXJnaW4/OiBudW1iZXIpe1xyXG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XHJcbiAgICAgICAgcmV0dXJuIGluZGV4Pj0wK21hcmdpbiYmaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLW1hcmdpbjtcclxuICAgIH1cclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKXtcclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgaWR4PWZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1tpbmRleCsxXT8udmFsdWU9PT0nKCcmJihpZHg9PT0wfHwhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMudG9rZW5zW2lkeC0xXT8udmFsdWUpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vTWFwIHBhcmVudGhlc2VzIGZvciBpbXBsaWNpdCBtdWx0aXBsaWNhdGlvbi5cclxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgICAgICAubWFwKCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9LCBpbmRleDogbnVtYmVyKSA9PiB7IFxyXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSBcIihcIiB8fCAoaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSBcIilcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8dGVzdERvdWJsZVJpZ2h0KGluZGV4KT8gaW5kZXgrMSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIG1hcFxyXG4gICAgfVxyXG5cclxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XHJcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdmFsdWU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnZhbHVlPT09J1BsdXMnfHx0b2tlbi52YWx1ZT09PSdNaW51cyc/aW5kZXg6bnVsbCkuZmlsdGVyKChpbmRleDogbnVsbCk9PiBpbmRleCE9PW51bGwpXHJcblxyXG4gICAgICAgIG1hcC5mb3JFYWNoKChpbmRleDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGluZGV4PXRoaXMudmFsaWRhdGVJbmRleChpbmRleCwxKSYmdGhpcy50b2tlbnNbaW5kZXgtMV0udHlwZT09PSdvcGVyYXRvcid8fHRoaXMudG9rZW5zW2luZGV4KzFdLnR5cGU9PT0nb3BlcmF0b3InP251bGw6aW5kZXg7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIG1hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB2YWx1ZT10aGlzLnRva2Vuc1tpbmRleF0udmFsdWU9PT0nUGx1cyc/MTotMTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXgrMV0udmFsdWUqPXZhbHVlO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICBcclxuICAgICAgICBpZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKTtcclxuICAgICAgICBjb25zdCBtYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyBpc1ZhbHVlVG9rZW46ICgpID0+IGFueTsgfSxpbmRleDogYW55KT0+ICh0b2tlbi5pc1ZhbHVlVG9rZW4oKSk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IGFycj1maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXHJcbiAgICAgICAgdGhpcy52YWxpZGF0ZVBsdXNNaW51cygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHBhcmVuTWFwPXRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXHJcbiAgICAgICAgcGFyZW5NYXAuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGIgLSBhKVxyXG4gICAgICAgIC5mb3JFYWNoKCh2YWx1ZTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3IFRva2VuKCcqJykpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBtYXBQb3c9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udmFsdWU9PT0nUG93Jz9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc29sZS5sb2cobWFwUG93KVxyXG4gICAgICAgIG1hcFBvdy5mb3JFYWNoKChpbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uPW5ldyBQb3NpdGlvbih0aGlzLGluZGV4KVxyXG4gICAgICAgICAgICBjb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxyXG4gICAgICAgICAgIC8vIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBtYXBQYXJlbkluZGV4ZXMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9LCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4KSA6IG51bGwpXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgIH1cclxuXHJcbiAgICBmaWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFsKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW06IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeyBvcGVuOiBvcGVuSW5kZXgsIGNsb3NlOiBjbG9zZUluZGV4IH0gPSBpdGVtO1xyXG4gICAgICAgICAgICAgICAgaWYgKG9wZW5JbmRleCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodGhpcy50b2tlbnNbb3BlbkluZGV4IC0gMV0/LnR5cGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoY2xvc2VJbmRleCA8IHRoaXMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdPy5pc1ZhbHVlVG9rZW4oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH0pLmZsYXRNYXAoKGl0ZW06IGFueSkgPT4gW2l0ZW0ub3BlbiwgaXRlbS5jbG9zZV0pO1xyXG4gICAgfSAgICBcclxuICAgIFxyXG4gICAgLypcclxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICAgfSovXHJcblxyXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZnR5Z3ViaG5pbXBvXCIpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBtYXAgPSBuZXcgU2V0KHRoaXMuZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpKTtcclxuICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXzogYW55LCBpZHg6IHVua25vd24pID0+ICFtYXAuaGFzKGlkeCkpO1xyXG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXHJcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCArIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgbnVtTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSdudW1iZXInJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGFyciA9IFtcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXModmFyTWFwKSwgXHJcbiAgICAgICAgXTtcclxuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcclxuICAgICAgICBcclxuICAgICAgICBpZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBjb25uZWN0QW5kQ29tYmluZShhcnI6IGFueVtdKXtcclxuICAgICAgICBjb25zdCBpbmRleGVzOmFueT1bXVxyXG5cclxuICAgICAgICBhcnIuc29ydCgoYSwgYikgPT4gYlswXSAtIGFbMF0pLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBpbmRleGVzLnB1c2goe3N0YXJ0OiBlbFswXSxlbmQ6IGVsW2VsLmxlbmd0aCAtIDFdfSlcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaW5kZXhlcy5mb3JFYWNoKChpbmRleDogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlcjsgfSkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBOdW1iZXIodGhpcy50b2tlbnNbaW5kZXguc3RhcnRdLnZhbHVlKTtcclxuICAgICAgICAgICAgY29uc3QgaXNWYXI9dGhpcy50b2tlbnMuc2xpY2UoaW5kZXguc3RhcnQsaW5kZXguZW5kKzEpLmZpbmQoKHRva2VuOiBhbnkpPT4gdG9rZW4udHlwZS5pbmNsdWRlcygndmFyJykpO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpPWluZGV4LnN0YXJ0KzE7aTw9aW5kZXguZW5kO2krKyl7XHJcbiAgICAgICAgICAgICAgIHZhbHVlID0gdGhpcy50b2tlbnNbaV0udmFsdWUgKyB2YWx1ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy9pZiAoaXNWYXIpdXBkYXRlZFRva2VuLnZhcmlhYmxlPWlzVmFyLnZhcmlhYmxlXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4LnN0YXJ0XSA9IG5ldyBUb2tlbih2YWx1ZSxpc1Zhcj8udmFyaWFibGUpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXguc3RhcnQrMSwgaW5kZXguZW5kIC0gaW5kZXguc3RhcnQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcclxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcclxuICAgICAgICAgICAgJiYgIXRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKVxyXG4gICAgICAgIClcclxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxyXG4gICAgfVxyXG5cclxuICAgIGluc2VydFRva2VucyhzdGFydDogYW55LCBsZW5ndGg6IG51bWJlciwgb2JqZWN0czogYW55W10gfCBUb2tlbikge1xyXG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlY29uc3RydWN0KHRva2Vucz86IGFueSl7XHJcbiAgICAgICAgaWYgKCF0b2tlbnMpe3Rva2Vucz10aGlzLnRva2Vuczt9XHJcbiAgICAgICAgY29uc3QgYWRkUGx1c0luZGV4ZXM9dGhpcy5pbmRleGVzVG9BZGRQbHVzKHRva2Vucyk7XHJcbiAgICAgICAgY29uc3QgY3VybHlCcmFja2V0SW5kZXhlcyA9IHRoaXMuY3VybHlCcmFja2V0SURzKHRva2VucykuZmxhdE1hcCgoeyBvcGVuLCBjbG9zZSB9KSA9PiBbb3BlbiwgY2xvc2VdKTtcclxuICAgICAgICBsZXQgbWF0aCA9IFwiXCI7XHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8dG9rZW5zLmxlbmd0aDtpKyspe1xyXG4gICAgICAgICAgICBsZXQgdGVtcDtcclxuICAgICAgICAgICAgbWF0aCs9YWRkUGx1c0luZGV4ZXMuaW5jbHVkZXMoaSk/JysnOicnO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldPy52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbdG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuOiB7IGlkOiBhbnk7IH0sIGluZGV4OiBudW1iZXIpID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQmJnRva2Vuc1tpbmRleCsxXSkrMV0udmFsdWU9PT1cIi9cIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN3aXRjaCAodG9rZW5zW2ldPy50eXBlKXtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJudW1iZXJcIjpcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBcInBvd2VyVmFyaWFibGVcIjpcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJvcGVyYXRvclwiOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0gaW5zdGFuY2VvZiBUb2tlbilcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0aCs9dG9rZW5zW2ldPy50b1N0cmluZ0xhdGV4KClcclxuICAgICAgICAgICAgICAgICAgICAvL3RlbXA9cm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcclxuICAgICAgICAgICAgICAgICAgICAvL21hdGgrPXRlbXArKGkrMTx0b2tlbnMubGVuZ3RoJiYvKGZyYWMpLy50ZXN0KHRva2Vuc1tpKzFdLnZhbHVlKT9cIitcIjpcIlwiKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJwYXJlblwiOlxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPWN1cmx5QnJhY2tldEluZGV4ZXMuY29udGFpbnMoaSk/dG9rZW5zW2ldLnZhbHVlLnJlcGxhY2UoL1xcKC8sXCJ7XCIpLnJlcGxhY2UoL1xcKS8sXCJ9XCIpOnRva2Vuc1tpXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcih0aGlzLnRva2VucylcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgdG9rZW4gdHlwZSBnaXZlbiB0byByZWNvbnN0cnVjdDogdHlwZSAke3Rva2Vuc1tpXT8udHlwZX1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWF0aFxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjdXJseUJyYWNrZXRJRHModG9rZW5zID0gdGhpcy50b2tlbnMpIHtcclxuICAgICAgICBjb25zdCByaWdodEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpLCAuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ3JpZ2h0JyldO1xyXG4gICAgICAgIGNvbnN0IGJvdGhCcmFja2V0cyA9IFsuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ2JvdGgnKV07XHJcbiAgICAgICAgY29uc3QgZG91YmxlUmlnaHRCcmFja2V0cyA9IFsuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ2RvdWJsZVJpZ2h0JyldO1xyXG4gICAgICAgIGNvbnN0IG1hcDogeyBvcGVuOiBhbnk7IGNsb3NlOiBhbnk7IGlkOiBhbnk7IH1bXSA9IFtdO1xyXG4gICAgXHJcbiAgICAgICAgdG9rZW5zLmZvckVhY2goKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdG9rZW5zW2luZGV4IC0gMV0/LnZhbHVlO1xyXG4gICAgICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0b2tlbnNbaW5kZXggKyAxXT8udmFsdWU7XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSAnKCcpIHtcclxuICAgICAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgZG91YmxlUmlnaHRCcmFja2V0cy5pbmNsdWRlcyhwcmV2VG9rZW4pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcDEgPSBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4LCB0b2tlbnMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBwMS5jbG9zZSArIDEsIHRva2Vucyk7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLnB1c2gocDEsIHAyKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaW5kZXggPiAwICYmIHJpZ2h0QnJhY2tldHMuaW5jbHVkZXMocHJldlRva2VuKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hcC5wdXNoKGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2VucykpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSAnKScgJiYgYm90aEJyYWNrZXRzLmluY2x1ZGVzKG5leHRUb2tlbikpIHtcclxuICAgICAgICAgICAgICAgIG1hcC5wdXNoKGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2VucykpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIGluZGV4ZXNUb0FkZFBsdXModG9rZW5zOiBhbnlbXSl7XHJcbiAgICAgICAgcmV0dXJuIHRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+aW5kZXg+MFxyXG4gICAgICAgICAgICAmJnRva2Vuc1tpbmRleCAtIDFdPy5pc1ZhbHVlVG9rZW4oKVxyXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxyXG4gICAgICAgICkuZmlsdGVyKGl0ZW09Pml0ZW0hPT1udWxsKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcclxuICAgICAgICBjb25zdCByZWdFeHB2YWx1ZSA9ICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcclxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmbGF0dGVuQXJyYXkoYXJyOiBhbnkpIHtcclxuICAgIGxldCByZXN1bHQgPSBbXTtcclxuICAgIGxldCBzdGFjayA9IEFycmF5LmlzQXJyYXkoYXJyKSA/IFsuLi5hcnJdIDogW2Fycl07XHJcblxyXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IG5leHQgPSBzdGFjay5wb3AoKTtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShuZXh0KSkge1xyXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyBcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaChuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcclxufVxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgVG9rZW57XHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICB2YWx1ZT86IHN0cmluZ3xudW1iZXI7XHJcbiAgICB2YXJpYWJsZT86IHN0cmluZztcclxuICAgIG1vZGlmaWVyOiBhbnk7XHJcbiAgICBpZDogUGFyZW47XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQsdmFyaWFibGU/OiBhbnkpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZT12YXJpYWJsZTtcclxuICAgICAgICB0aGlzLnNldFR5cGUoKTtcclxuICAgICAgICB0aGlzLmluc3VyUHJvcGVyRm9ybWF0dGluZygpXHJcbiAgICB9XHJcbiAgICBpbnN1clByb3BlckZvcm1hdHRpbmcoKXtcclxuICAgICAgICBpZiAodGhpcy50eXBlPT09J29wZXJhdG9yJyYmdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJyl7XHJcbiAgICAgICAgICAgIHRoaXMudmFsdWU9c2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubmFtZVxyXG4gICAgICAgIH1cclxuICAgICAgIC8vIGlmICghdGhpcy52YWx1ZSl7dGhyb3cgbmV3IEVycm9yKCd3dGYgVmFsdWUgd2FzIHVuZGVmaW5lZCBhdCB0b2tlbiBpbnN1clByb3BlckZvcm1hdHRpbmcnKX1cclxuICAgIH1cclxuICAgIGdldElkKCl7cmV0dXJuIHRoaXMuaWQuaWR9O1xyXG5cclxuICAgIGdldExhdGV4U3ltYm9sKCl7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZyc/c2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubGF0ZXg6dW5kZWZpbmVkfVxyXG5cclxuICAgIGdldEZ1bGxUb2tlbklEKCl7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcclxuICAgICAgICAgICAgY2FzZSAncHJhbmUnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZTtcclxuICAgICAgICAgICAgY2FzZSAnb3BlcmF0b3InOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZSsnOicrdGhpcy52YWx1ZVxyXG4gICAgICAgICAgICBjYXNlICd2YXJpYWJsZSc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlKyc6Jyt0aGlzLnZhcmlhYmxlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgZ2V0ZnVsbFR5cGUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50eXBlXHJcbiAgICB9XHJcblxyXG4gICAgc2V0VHlwZSgpe1xyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnKXtcclxuICAgICAgICAgICAgdGhpcy50eXBlPXRoaXMudmFsdWUubWF0Y2goL1soKV0vKT8ncGFyZW4nOidvcGVyYXRvcic7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50eXBlPXRoaXMudmFyaWFibGU/J3ZhcmlhYmxlJzonbnVtYmVyJztcclxuICAgIH1cclxuXHJcbiAgICBpc1N0cmluZygpe3JldHVybiB0aGlzLnR5cGU9PT0ncGFyZW4nfHx0aGlzLnR5cGU9PT0nb3BlcmF0b3InfVxyXG5cclxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cclxuXHJcbiAgICB0b1N0cmluZ0xhdGV4KCl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmICh0aGlzLmlzU3RyaW5nKCkpXHJcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy5nZXRMYXRleFN5bWJvbCgpXHJcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSd2YXJpYWJsZScpIHN0cmluZys9dGhpcy50b1N0cmluZ1ZhcmlhYmxlKClcclxuICAgICAgICBpZiAodGhpcy50eXBlPT09J251bWJlcicpIHN0cmluZys9dGhpcy52YWx1ZTtcclxuICAgICAgICByZXR1cm4gc3RyaW5nXHJcbiAgICB9XHJcbiAgICBhZmZlY3RlZE9wZXJhdG9yUmFuZ2UoZGlyZWN0aW9uOiBzdHJpbmcpe1xyXG4gICAgICAgIGlmKHRoaXMudHlwZSE9PSdvcGVyYXRvcid8fHRoaXMudmFsdWU9PT0nRXF1YWxzJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgaWYodHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJyYmZGlyZWN0aW9uPT09J2xlZnQnJiYhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdib3RoJykuaW5jbHVkZXModGhpcy52YWx1ZSkpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcbiAgICB0b1N0cmluZ1ZhcmlhYmxlKCl7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLnZhbHVlJiZ0aGlzPy52YWx1ZSE9PTE/dGhpcy52YWx1ZTonJykrKHRoaXMudmFyaWFibGV8fCcnKTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUHJhaXNpbmdNZXRob2R7XHJcbiAgICB0b2tlbnNcclxuICAgIG92ZXJ2aWV3OiBhbnk7XHJcbiAgICB2YXJpYWJsZXM6IGFueVtdO1xyXG4gICAgY29uc3RydWN0b3IodG9rZW5zOiBhbnkpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2Vuc1xyXG4gICAgICAgIHRoaXMub3ZlcnZpZXc9dGhpcy5nZXRPdmVydmlldygpXHJcbiAgICAgICAgdGhpcy5hc3NpZ25WYXJpYWJsZXMoKVxyXG4gICAgfVxyXG4gICAgaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnNvbWUoKHQ6IGFueSk9PiB0LnR5cGU9PT0ndmFyaWFibGUnJiZ0LnZhbHVlPjEpXHJcbiAgICB9XHJcblxyXG4gICAgaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5oYXNlVmFyaWFibGUoKSYmdGhpcy5pc1ZhcldpdGhWYWx1ZUJpZ2dlclRoYW5PbmUoKSYmdGhpcy5pc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpXHJcbiAgICB9XHJcbiAgICBpc0lzb2xhdGUoKXtcclxuICAgICAgICAvL3JldHVybiB0aGlzLlxyXG4gICAgfVxyXG5cclxuICAgIGlzQW55dGhpbmdUb0lzb2xhdGUoKXtcclxuICAgICAgICBpZih0aGlzLnZhcmlhYmxlcy5sZW5ndGg+MSl0aHJvdyBuZXcgRXJyb3IoXCJ0d28gdmFyIGVxIGFyZW50IHNhcG9ydGVkIHlldFwiKVxyXG4gICAgICAgIGlmKCF0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGVxSW5kZXg9dGhpcy5lcXVhbHNJbmRleElmQW55KCk7XHJcbiAgICAgICAgaWYoIWVxSW5kZXgpe3JldHVybn07XHJcbiAgICAgICAgY29uc3QgYmVmb3IgPSB0aGlzLmdldE92ZXJ2aWV3KHRoaXMudG9rZW5zLnNsaWNlKDAsZXFJbmRleCkpXHJcbiAgICAgICAgY29uc3QgYWZ0ZXIgPSB0aGlzLmdldE92ZXJ2aWV3KHRoaXMudG9rZW5zLnNsaWNlKGVxSW5kZXgrMSkpXHJcbiAgICAgICAgY29uc3Qgd2hhdFRvSXNvbGF0ID10aGlzLndoYXRUb0lzb2xhdCgpO1xyXG4gICAgICAgIGlmICgoIWJlZm9yfHwhYWZ0ZXIpfHwhd2hhdFRvSXNvbGF0fHwoYmVmb3I/LnNpemU8MiYmYWZ0ZXI/LnNpemU8MikpcmV0dXJuO1xyXG4gICAgICAgIHJldHVybiB7b3ZlcnZpZXdTaWRlT25lOiBiZWZvcixvdmVydmlld1NpZGVUd286IGFmdGVyLC4uLndoYXRUb0lzb2xhdH1cclxuICAgIH0vKlxyXG4gICAgaG93VG9Jc29sYXRlKG92ZXJ2aWV3U2lkZU9uZSxvdmVydmlld1NpZGVUd28saXNvbGF0aW9uR29vbCl7XHJcbiAgICAgICAgY29uc3QgaXNvbGF0aW9uVHlwZT1pc29sYXRpb25Hb29sLnNwbHQoJzonKTtcclxuICAgICAgICAvL2lmICgpe31cclxuICAgIH0qL1xyXG4gICAgd2hhdFRvSXNvbGF0KCl7XHJcbiAgICAgICAgLy8gaSBuZWVkIHRvIGFkZCBwb3dzIGFmdGVyXHJcbiAgICAgICAgLy8gZm9yIGtub3cgaW0gZ29pbmcgb24gdGhlIG9zaG9tc2hpbiB0aGF0IHRociBpcyBvbmx5IG9uZSB2YXJcclxuICAgICAgICBpZih0aGlzLnZhcmlhYmxlcz8ubGVuZ3RoPDEpcmV0dXJuO1xyXG5cclxuICAgICAgICByZXR1cm4ge3R5cGU6ICd2YXJpYWJsZScsdmFsdWU6IHRoaXMudmFyaWFibGVzWzBdfVxyXG4gICAgfS8qXHJcbiAgICBpc092ZXJ2aWV3VG9pc29sYXQob3ZlcnZpZXcpe1xyXG4gICAgfSovXHJcbiAgICBpc0ltYmFsYW5jZShvdmVydmlldzogeyBzaXplOiBudW1iZXI7IH0pe1xyXG4gICAgICAgIG92ZXJ2aWV3LnNpemU+MVxyXG4gICAgfVxyXG4gICAgZXF1YWxzSW5kZXhJZkFueSgpe1xyXG4gICAgICAgIGNvbnN0IGVxSW5kZXg9dGhpcy50b2tlbnMubWFwKCh0OiB7IHZhbHVlOiBzdHJpbmc7IH0saWR4OiBhbnkpPT50LnZhbHVlPT09J0VxdWFscyc/aWR4Om51bGwpLmZpbHRlcigobTogbnVsbCk9Pm0hPT1udWxsKTtcclxuICAgICAgICByZXR1cm4gZXFJbmRleFswXTtcclxuICAgIH1cclxuICAgIGlzUXVhZHJhdGljKCl7XHJcblxyXG4gICAgfVxyXG4gICAgaXNGaW5hbFJldHVybigpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5sZW5ndGg8Mnx8KHRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlcclxuICAgIH1cclxuICAgIFxyXG4gICAgYXNzaWduVmFyaWFibGVzKCl7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXM9W11cclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLm92ZXJ2aWV3LmVudHJpZXMoKSl7XHJcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgoJ3ZhcmlhYmxlOicpJiYhdGhpcy52YXJpYWJsZXMuaW5jbHVkZXModmFsdWUudmFyaWFibGUpKXtcclxuICAgICAgICAgICAgICAgIHRoaXMudmFyaWFibGVzLnB1c2godmFsdWUudmFyaWFibGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaGFzZVZhcmlhYmxlKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzPy5sZW5ndGg+MH1cclxuXHJcbiAgICBpc1RoZXJlT3BlcmF0b3JPdGhlclRoYW5FcXVhbHMoKXtcclxuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcclxuICAgICAgICByZXR1cm4gIGZpbHRlci5ub01hdGNoPjBcclxuICAgIH1cclxuICAgIGlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCl7XHJcbiAgICAgICAgY29uc3QgZmlsdGVyPXRoaXMuZmlsdGVyQnlUeXBlKCdvcGVyYXRvcicsJ0VxdWFscycpXHJcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubWF0Y2g9PT0xJiZmaWx0ZXIubm9NYXRjaD09PTBcclxuICAgIH1cclxuXHJcbiAgICBmaWx0ZXJCeVR5cGUodHlwZUtleTogc3RyaW5nLCB0YXJnZXRWYWx1ZTogc3RyaW5nKXtcclxuICAgICAgICBsZXQgbWF0Y2g9MCwgbm9NYXRjaD0wXHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5vdmVydmlldy5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgaWYgKGtleT8uc3RhcnRzV2l0aCh0eXBlS2V5KSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gdHlwZUtleSsnOicrdGFyZ2V0VmFsdWUpIHtcclxuICAgICAgICAgICAgICAgICAgICBtYXRjaCsrO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBub01hdGNoKys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHsgbWF0Y2g6IG1hdGNoLCBub01hdGNoOiBub01hdGNoIH07XHJcbiAgICB9XHJcbiAgICBnZXRPdmVydmlldyh0b2tlbnM/OiBhbnlbXSApIHtcclxuICAgICAgICBpZighdG9rZW5zKXRva2Vucz10aGlzLnRva2Vuc1xyXG4gICAgICAgIGlmKCF0b2tlbnMpcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3ID0gbmV3IE1hcCgpO1xyXG4gICAgICAgIHRva2Vucy5mb3JFYWNoKHRva2VuID0+IHtcclxuICAgICAgICAgICAgLy9pZiAoIXRva2VuLmlzVmFsdWVUb2tlbigpKSB7cmV0dXJuO31cclxuICAgICAgICAgICAgY29uc3Qga2V5ID0gdG9rZW4uZ2V0RnVsbFRva2VuSUQoKVxyXG4gICAgICAgICAgICAvL0VxdWFsc1xyXG4gICAgICAgICAgICBpZiAoIW92ZXJ2aWV3LmhhcyhrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeSA9IHsgXHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogdG9rZW4udHlwZSwgXHJcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IDAgLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlOiB1bmRlZmluZWRcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gJ3ZhcmlhYmxlJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGVudHJ5LnZhcmlhYmxlID0gdG9rZW4udmFyaWFibGU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgICAgIG92ZXJ2aWV3LnNldChrZXksIGVudHJ5KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvdmVydmlldy5nZXQoa2V5KS5jb3VudCsrO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBvdmVydmlldy8vQXJyYXkuZnJvbShvdmVydmlldy52YWx1ZXMoKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIE9wZXJhdG9ye1xyXG5cclxufVxyXG5cclxuY2xhc3MgTW9kaWZpZXJ7XHJcblxyXG59Il19