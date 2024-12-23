import { quad, degreesToRadians, radiansToDegrees, calculateFactorial } from "./mathUtilities";
import { findParenIndex } from "../utils/tokenUtensils";
import { getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getOperatorsByBracket } from "../utils/dataManager";
import { mathGroup, mathJaxOperator, Token, Tokens } from "./mathJaxTokens";
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
    // return [new Token('frac'),new Token('('),nominator,new Token(')'),new Token('('),denominator,new Token(')')]
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
function operationsOrder(tokens) {
    function findOperatorIndex(begin, end, tokens, findParenIndex, regex) {
        while (begin < end && begin < tokens.length) {
            let index;
            if (regex) {
                index = tokens.slice(begin, end).findIndex((token) => token.type === "operator" && regex.test(token.value));
            }
            else {
                index = tokens.slice(begin, end).findIndex((token) => token.type === "operator");
            }
            if (index === -1)
                return -1;
            index += begin;
            if (!/[+-]/.test(tokens[index].value)) {
                return index;
            }
            if (index > 0 && index < tokens.length - 1) {
                if (tokens[index - 1].type === tokens[index + 1].type) {
                    return index;
                }
            }
            begin = index + 1;
        }
        return -1;
    }
    let begin = 0, end = tokens.length, j = 0;
    let currentID = null;
    let checkedIDs = [];
    let operatorFound = false;
    while (!operatorFound && j < 200) {
        // Find the innermost parentheses
        for (let i = 0; i < tokens.length; i++) {
            j++;
            if (tokens[i].value === "(" && !checkedIDs.includes(tokens[i].id)) {
                currentID = findParenIndex(tokens[i].id);
            }
            if (currentID !== null && i === currentID.close) {
                [begin, end] = [currentID.open, currentID.close];
                break;
            }
        }
        if (!currentID) {
            begin = 0;
            end = tokens.length;
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
    return null;
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
        if (this.index === null || this.index >= tokens.length - 1) {
            return;
        }
        this.operator = tokens[this.index].value;
        console.log(getOperatorsByAssociativity('right'));
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
        this.specialChar = tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
    }
    applyPosition(tokens, index, direction) {
        let breakChar = index;
        let target;
        let multiStep = false;
        const isLeft = direction === "left";
        const indexModifier = isLeft ? -1 : 1;
        if ((isLeft && index <= 0) || (!isLeft && index >= tokens.length - 1) || !tokens[index + indexModifier]) {
            throw new Error("at applyPosition: \"index wasn't valid\" index: " + index);
        }
        if (tokens[index + indexModifier].type === "paren") {
            const parenIndex = findParenIndex(tokens[index + indexModifier].id);
            breakChar = isLeft ? parenIndex.open : parenIndex.close + 1;
            target = tokens.slice(parenIndex.open, parenIndex.close + 1);
        }
        else {
            breakChar = index + indexModifier;
            target = tokens[breakChar];
            breakChar += isLeft ? 0 : 1;
        }
        //const multiStep = Math.abs(breakChar - index) > 3;
        if (!multiStep && tokens[index + indexModifier].type === "paren") {
            //target=target.find(item => /(number|variable|powerVariable)/.test(item.type))
        }
        if (target?.length === 0) {
            throw new Error(`at applyPosition: couldn't find target token for direction ${direction} and operator"${tokens[index].value}"`);
        }
        //breakChar = (breakChar !== index ? target?.index : breakChar)+ indexModifier+(isLeft?0:1);
        //delete target.index
        if (target.length === 3) {
            //target=target.find((item: { type: string; }) => /(number|variable|powerVariable)/.test(item.type))
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
function parseOperator(operator) {
    switch (operator.operator) {
        case "sin":
            //const a=new Token(Math.sin(degreesToRadians(operator.group1.items[0].value)))
            //solved.value = ;
            break;
        default:
            throw new Error("Couldn't identify operator type at praise operator: " + operator.operator);
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
        //if (position.operator==='*'){return handleVariableMultiplication(left,right,solved)}
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
    //return solved;
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
        console.log('this.tokens', this.tokens);
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
        const b = new mathGroup();
        b.setItems(this.tokens.tokens[1]);
        const a = new mathJaxOperator();
        a.setGroup1(b);
        parseOperator(a);
        console.log(a);
        /*
        this.i++;
        if(this.i>10){return this.finalReturn()}

        this.getRedyforNewRond();
        //const overview=this.tokens.getOverview()
        const praisingMethod=new PraisingMethod(this.tokens.tokens)
        if (praisingMethod.isThereOperatorOtherThanEquals()){
            const position = new Position(this.tokens);
            this.addDebugInfo("Parsed expression", JSON.stringify(position, null, 1));
            if (position === null&&this.tokens.tokens.length>1){
                //this.addDebugInfo("parse(tokens)",parse(this.tokens.tokens))
                return "the ****"
            // return solution(tokens);
            }
            if (position.checkFrac()||position.checkMultiStep())
            {
                expandExpression(this.tokens,position);
                this.mathInfo.addSolutionInfo(this.tokens.reconstruct(this.tokens.tokens))
                return this.controller()
            }
            this.useParse(position)
        }
        if(praisingMethod.isMultiplicationIsolate()){
            this.useIsolat(praisingMethod)
        }
        const toIsolate=praisingMethod.isAnythingToIsolate()
        if (toIsolate){
            rearrangeForIsolation(this.tokens,toIsolate)
            return this.controller()
        }
        //if (solved === null||typeof solved==="string") {return solved; }
        return this.finalReturn()//this.tokens.tokens.length>1?this.controller():this.finalReturn();*/
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLElBQUksRUFBaUMsZ0JBQWdCLEVBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQU01SCxPQUFPLEVBQUUsY0FBYyxFQUF1QixNQUFNLHdCQUF3QixDQUFDO0FBQzdFLE9BQU8sRUFBMkIsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUscUJBQXFCLEVBQXFELE1BQU0sc0JBQXNCLENBQUM7QUFJck0sT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzVFLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFVO0lBQy9DLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNyQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ25DLElBQUksR0FBRyxDQUFD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LENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sS0FBSyxHQUFHO29CQUNWLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtvQkFDaEIsS0FBSyxFQUFFLENBQUM7b0JBQ1IsUUFBUSxFQUFFLFNBQVM7aUJBQ3RCLENBQUM7Z0JBQ0YsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO29CQUM1QixLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0IsQ0FBQztZQUNELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFFBQVEsQ0FBQSxDQUFBLGdDQUFnQztJQUNuRCxDQUFDO0NBQ0o7QUFFRCxNQUFNLFFBQVE7Q0FFYjtBQUVELE1BQU0sUUFBUTtDQUViIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuLi9pbVZlcnlMYXp5XCI7XHJcbmltcG9ydCB7IHR5cGUgfSBmcm9tIFwib3NcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgcmVnRXhwIH0gZnJvbSBcIi4uL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyAgfSBmcm9tIFwic3JjL3V0aWxzL3N0YXRpY0RhdGFcIjtcclxuaW1wb3J0IHsgY3AgfSBmcm9tIFwiZnNcIjtcclxuaW1wb3J0IHsgZmluZFBhcmVuSW5kZXgsIFBhcmVuLGlkUGFyZW50aGVzZXMgfSBmcm9tIFwiLi4vdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0T3BlcmF0b3JzQnlCcmFja2V0LCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzIH0gZnJvbSBcIi4uL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IG51bWJlciwgc3RyaW5nIH0gZnJvbSBcInpvZFwiO1xyXG5pbXBvcnQgeyBCYXNpY1Rpa3pUb2tlbiB9IGZyb20gXCJzcmMvdGlrempheC9pbnRlcnByZXQvdG9rZW5pemVUaWt6amF4XCI7XHJcbmltcG9ydCB7IGdyb3VwIH0gZnJvbSBcImNvbnNvbGVcIjtcclxuaW1wb3J0IHsgbWF0aEdyb3VwLCBtYXRoSmF4T3BlcmF0b3IsIFRva2VuLCBUb2tlbnMgfSBmcm9tIFwiLi9tYXRoSmF4VG9rZW5zXCI7XHJcbmNvbnN0IGdyZWVrTGV0dGVycyA9IFtcclxuICAgICdBbHBoYScsJ2FscGhhJywgJ0JldGEnLCAnR2FtbWEnLCAnRGVsdGEnLCAnRXBzaWxvbicsICdaZXRhJywgJ0V0YScsICdUaGV0YScsIFxyXG4gICAgJ0lvdGEnLCAnS2FwcGEnLCAnTGFtYmRhJywgJ011JywnbXUnLCAnTnUnLCAnWGknLCAnT21pY3JvbicsICdQaScsICdSaG8nLCBcclxuICAgICdTaWdtYScsICdUYXUnLCAnVXBzaWxvbicsICdQaGknLCAnQ2hpJywgJ1BzaScsICdPbWVnYSdcclxuXTtcclxuLypjb25zdCBsYXRleE9wZXJhdG9ycz1bXHJcbiAgICAndGFuJywgJ3NpbicsICdjb3MnLCAnYmlub20nLCAnZnJhYycsICdhc2luJywgJ2Fjb3MnLCBcclxuICAgICdhdGFuJywgJ2FyY2NvcycsICdhcmNzaW4nLCAnYXJjdGFuJywgJ2Nkb3QnLCdzcXJ0J1xyXG5dKi9cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMoYXJyOiBhbnlbXSkge1xyXG4gICAgY29uc3Qgc2VxdWVuY2VzID0gW107XHJcbiAgICBsZXQgc3RhcnQgPSAwO1xyXG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGFycltpXSAhPT0gYXJyW2kgLSAxXSArIDEpIHtcclxuICAgICAgICAgICAgaWYgKGkgLSBzdGFydCA+IDEpIHtcclxuICAgICAgICAgICAgICAgIHNlcXVlbmNlcy5wdXNoKGFyci5zbGljZShzdGFydCwgaSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN0YXJ0ID0gaTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc2VxdWVuY2VzO1xyXG59XHJcblxyXG5cclxuY29uc3Qgb3BlcmF0b3JzRm9yTWF0aGluZm8gPSB7XHJcbiAgICBib3RoQnV0UmlnaHRCcmFja2V0OiBbXCJeXCJdLFxyXG4gICAgcmlnaHRCcmFja2V0QW5kUmVxdWlyZXNTbGFzaDogW1wic3FydFwiXSxcclxuICAgIGJvdGg6IFtcIitcIiwgXCItXCIsIFwiKlwiXSxcclxuICAgIHNwZWNpYWw6IFtcIj1cIl0sXHJcbiAgICBSaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaDogW1wic2luXCIsIFwiY29zXCIsIFwidGFuXCIsIFwiYXNpblwiLCBcImFjb3NcIiwgXCJhdGFuXCIsIFwiYXJjc2luXCIsIFwiYXJjY29zXCIsIFwiYXJjdGFuXCJdLFxyXG4gICAgZG91YmxlUmlnaHRCdXRCcmFja2V0OiBbXCJmcmFjXCIsIFwiYmlub21cIixcIi9cIl1cclxufTtcclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoSW5mb3tcclxuICAgIGRlYnVnSW5mbzogc3RyaW5nPVwiXCI7XHJcbiAgICBzb2x1dGlvbkluZm86IGFueVtdPVtdO1xyXG4gICAgbWF0aEluZm86IGFueVtdPVtdXHJcbiAgICBncmFwaDogc3RyaW5nPVwiXCI7XHJcbiAgICBhZGRHcmFwaEluZm8odmFsdWU6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy5ncmFwaCs9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obXNnOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz0odHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUpOnZhbHVlKSsgXCJcXG4gXCI7XHJcbiAgICB9XHJcbiAgICBhZGRTb2x1dGlvbkluZm8obWVzOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xyXG4gICAgICAgIHRoaXMuc29sdXRpb25JbmZvLnB1c2gobWVzKTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlNvbHZlZFwiLG1lcyk7XHJcbiAgICB9XHJcbiAgICBhZGRNYXRoSW5mbyh0b2tlbnM6IFRva2Vucyl7XHJcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZE1hdGg9dG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gocmVjb25zdHJ1Y3RlZE1hdGgpXHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJSZWNvbnN0cnVjdGVkIG1hdGhcIixyZWNvbnN0cnVjdGVkTWF0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkU29sdXRpb24odG9rZW5zOiBUb2tlbnMscG9zaXRpb246IFBvc2l0aW9uLHNvbHV0aW9uOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xyXG4gICAgICAgIHNvbHV0aW9uPXRva2Vucy5yZWNvbnN0cnVjdChbc29sdXRpb25dKTtcclxuICAgICAgICBjb25zdCBsZWZ0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLmluZGV4KSk7XHJcbiAgICAgICAgY29uc3QgcmlnaHQ9dG9rZW5zLnJlY29uc3RydWN0KHRva2Vucy50b2tlbnMuc2xpY2UocG9zaXRpb24uaW5kZXgrMSxwb3NpdGlvbi5yaWdodC5icmVha0NoYXIsKSk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHJ1ZSl7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uYm90aEJ1dFJpZ2h0QnJhY2tldC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3J9IHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGguaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoL1xcKi9nLCBcIlxcXFxjZG90XCIpfSAke3JpZ2h0fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uc3BlY2lhbC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gYFxcXFxmcmFjeyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgXFxcXHNxcnR7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5SaWdodFBhcmVuQW5kUmVxdWlyZXNTbGFzaC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3J9ICgke3JpZ2h0fSkgPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmRvdWJsZVJpZ2h0QnV0QnJhY2tldC5pbmNsdWRlcyhwb3NpdGlvbi5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj1gXFxcXCR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZShcIi9cIixcImZyYWNcIil9eyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYWRkU29sdXRpb25JbmZvKHNvbHV0aW9uKTtcclxuICAgIH1cclxufVxyXG5cclxuLypcclxuZnVuY3Rpb24gc2FmZVRvTnVtYmVyKHZhbHVlKSB7XHJcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpKXtyZXR1cm4gdmFsdWV9XHJcbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XHJcbiAgICBpZiAodmFsdWU9PT1cIi1cIil7cmV0dXJuIC0xfVxyXG4gICAgaWYgKC9bYS16QS1aXS8udGVzdCh2YWx1ZSkpe3JldHVybiAxfVxyXG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxyXG4gICAgaWYoL1spXFxdXS8udGVzdCh2YWx1ZVt2YWx1ZS5sZW5ndGgtMV0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsdmFsdWUubGVuZ3RoLTEpfVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGk8dmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcclxuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgwLCBpKSArIHZhbHVlLnNsaWNlKGkgKyAxKTtcclxuICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XHJcbn0qL1xyXG5cclxuZnVuY3Rpb24gcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3I6IHN0cmluZyxsZWZ0OiBhbnkscmlnaHQ6IGFueSl7XHJcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09XCJzdHJpbmdcIiYmdHlwZW9mIGxlZnQ/LnZhbHVlIT09XCJudW1iZXJcIiYmZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJykuaW5jbHVkZXMob3BlcmF0b3IpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGVmdCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiByaWdodD8udmFsdWUhPT1cIm51bWJlclwiKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmlnaHQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBwYXJzZShwb3NpdGlvbjogeyBvcGVyYXRvcjogYW55OyBzcGVjaWFsQ2hhcj86IGFueTsgbGVmdD86IGFueTsgcmlnaHQ/OiBhbnk7IH0pIHtcclxuICAgIGxldCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xyXG4gICAgXHJcbiAgICBsZWZ0PWxlZnQ/LnRva2Vuc1xyXG4gICAgcmlnaHQ9cmlnaHQudG9rZW5zXHJcbiAgICAvL2NvbnNvbGUubG9nKCd0aGlzLmxlZnQsdGhpcy5yaWdodCcsbGVmdCxyaWdodClcclxuICAgIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yLGxlZnQscmlnaHQpO1xyXG4gICAgXHJcbiAgICBsZXQgc29sdmVkPW5ldyBUb2tlbigwLHVuZGVmaW5lZCk7XHJcbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XHJcbiAgICAgICAgY2FzZSBcIlNxdWFyZSBSb290XCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KHJpZ2h0LnZhbHVlLHNwZWNpYWxDaGFyIT09bnVsbD8oMSkvKHNwZWNpYWxDaGFyKTowLjUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiUG93XCI6XHJcbiAgICAgICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlfHxyaWdodC52YXJpYWJsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV8fGxlZnQudmFyaWFibGU9PT1yaWdodC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlP3JpZ2h0LnZhcmlhYmxlOlwiXCI7XHJcbiAgICAgICAgICAgICAgICAvL3NvbHZlZC5wb3c9MlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiRnJhY3Rpb25cIjpcclxuICAgICAgICBjYXNlIFwiL1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdC52YWx1ZSkvKHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIk11bHRpcGxpY2F0aW9uXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKiByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgaGFuZGxlVnJpYWJsZXMobGVmdCwgcmlnaHQsc29sdmVkKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIitcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSArIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiTWludXNcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAtIHJpZ2h0LnZhbHVlO1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYmlub21cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gY2FsY3VsYXRlRmFjdG9yaWFsKGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwic2luXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSlcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInRhblwiOlxyXG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoXCJ0YW4gTXVzdCBiZSBzbWFsbGVyIHRoYW4gOTBcIik7fVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC50YW4oZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImFzaW5cIjpcclxuICAgICAgICBjYXNlIFwiYXJjc2luXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hc2luKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhY29zXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY2Nvc1wiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYWNvcyhyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYXRhblwiOlxyXG4gICAgICAgIGNhc2UgXCJhcmN0YW5cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4ocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgaWRlbnRpZnkgb3BlcmF0b3IgdHlwZSBhdCBwcmFpc2Ugb3BlcmF0b3I6IFwiK3Bvc2l0aW9uLm9wZXJhdG9yKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQ6IHsgdmFyaWFibGU6IGFueTsgcG93OiBhbnk7IHZhbHVlOiBudW1iZXI7IH0sIHJpZ2h0OiB7IHZhcmlhYmxlOiBhbnk7IHBvdzogYW55OyB2YWx1ZTogbnVtYmVyOyB9LCBzb2x2ZWQ6IFRva2VuKSB7XHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcclxuICAgICAgICAgICAgLyogS2VlcCB0aGVtIHNlcGFyYXRlIHNpbmNlIHRoZXkgaGF2ZSBkaWZmZXJlbnQgdmFyaWFibGVzXHJcbiAgICAgICAgICAgIHNvbHZlZC50ZXJtcyA9IFtcclxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxyXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogcmlnaHQudmFyaWFibGUsIHBvdzogcmlnaHQucG93IHx8IDEsIHZhbHVlOiByaWdodC52YWx1ZSB8fCAxIH1cclxuICAgICAgICAgICAgXTsqL1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaWZmZXJlbnQgdmFyaWFibGUgYmFzZXMgYXQgcG93ZXIgbXVsdGlwbGljYXRpb24uIEkgZGlkbid0IGdldCB0aGVyZSB5ZXRcIilcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICBjb25zdCB2YXJpYWJsZSA9IGxlZnQudmFyaWFibGUgfHwgcmlnaHQudmFyaWFibGU7XHJcbiAgICAgICAgc29sdmVkLnZhcmlhYmxlID0gdmFyaWFibGUubGVuZ3RoPjA/dmFyaWFibGU6dW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBwb3cgPSAobGVmdC5wb3cgfHwgMCkgKyAocmlnaHQucG93IHx8IDApO1xyXG4gICAgICAgIHBvdz1sZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlJiZwb3c9PT0wJiYhbGVmdC5wb3cmJiFyaWdodC5wb3c/Mjpwb3c7XHJcbiAgICAgICAgLy9zb2x2ZWQucG93ID0gcG93IHx8IHVuZGVmaW5lZDtcclxuICAgICAgICBcclxuXHJcbiAgICAgICAgLy8gUnVsZSAzOiBIYW5kbGUgbXVsdGlwbGljYXRpb24gb2YgY29uc3RhbnRzXHJcbiAgICAgICAgY29uc3QgbGVmdFZhbHVlID0gbGVmdC52YWx1ZSB8fCAxO1xyXG4gICAgICAgIGNvbnN0IHJpZ2h0VmFsdWUgPSByaWdodC52YWx1ZSB8fCAxO1xyXG4gICAgICAgIGNvbnN0IHZhbHVlID0gbGVmdFZhbHVlICogcmlnaHRWYWx1ZTtcclxuICAgICAgICAvLyBJZiB0aGVyZSdzIG5vIHZhcmlhYmxlLCBhc3NpZ24gdGhlIHJlc3VsdCBhcyBhIGNvbnN0YW50XHJcbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIGZ1bmN0aW9uIGhhbmRsZVZyaWFibGVzKGxlZnQ6IGFueSxyaWdodDogYW55LHNvbHZlZDogVG9rZW4pe1xyXG4gICAgICAgIGxldCBoYW5kbGVkPXtWYXI6bnVsbCxQb3c6bnVsbH07XHJcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICByZXR1cm4gO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cclxuICAgICAgICAvL2NvbnNvbGUubG9nKGxlZnQudmFyaWFibGUscmlnaHQudmFyaWFibGUpXHJcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUhPT1yaWdodC52YXJpYWJsZSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlR3byB2YXJpYWJsZSBlcXVhdGlvbnMgYXJlbid0IGFjY2VwdGVkIHlldFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9oYW5kbGVkLlZhcj1sZWZ0LnZhcjtcclxuICAgICAgICAvL3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhclxyXG5cclxuICAgICAgICAvKlxyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfVxyXG4gICAgICAgIGVsc2UgaWYgKCFsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlfVxyXG4gICAgICAgIGVsc2UgaWYgKGxlZnQudmFyaWFibGUmJnJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9cmlnaHQudmFyaWFibGU7c29sdmVkLnBvdz0yfVxyXG4gICAgICAgICovXHJcbiAgICB9XHJcblxyXG5cclxuICAgIHJldHVybiBzb2x2ZWQ7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiByZWFycmFuZ2VFcXVhdGlvbih0b2tlbnM6IGFueSx0b2tlblRvaXNvbGF0ZTogYW55KXtcclxuICAgIFxyXG59XHJcblxyXG5mdW5jdGlvbiBpc29sYXRlTXVsdGlwbGljYXRpb24odG9rZW5zOiBhbnksaXNvbGF0VG9rZW46IFRva2VuKXtcclxuICAgIGNvbnN0IGluZGV4PW9wZXJhdGlvbnNPcmRlcih0b2tlbnMpXHJcbiAgICBjb25zdCBJc29sYXRlZD10b2tlbnMudG9rZW5zLmZpbmQoKHRva2VuOiBhbnksIGlkeDogbnVtYmVyKT0+aWR4PGluZGV4KVxyXG4gICAgY29uc3QgZnJhYz1jcmVhdGVGcmFjKHRva2Vucy5saXN0LnNsaWNlKGluZGV4ICsgMSksbmV3IFRva2VuKElzb2xhdGVkLnZhbHVlKSlcclxuICAgIElzb2xhdGVkLnZhbHVlPTE7XHJcbiAgICB0b2tlbnMuaW5zZXJ0VG9rZW5zKGluZGV4KzEsdG9rZW5zLnRva2Vucy5sZW5ndGgtaW5kZXgrMSxmcmFjKVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVGcmFjKG5vbWluYXRvcjogYW55LGRlbm9taW5hdG9yOiBUb2tlbil7XHJcbiAgIC8vIHJldHVybiBbbmV3IFRva2VuKCdmcmFjJyksbmV3IFRva2VuKCcoJyksbm9taW5hdG9yLG5ldyBUb2tlbignKScpLG5ldyBUb2tlbignKCcpLGRlbm9taW5hdG9yLG5ldyBUb2tlbignKScpXVxyXG59XHJcbmZ1bmN0aW9uIHNpbXBsaWZpeSh0b2tlbnM6IGFueVtdKXtcclxuICAgIGlmICh0b2tlbnMubGVuZ3RoPD0xKXtyZXR1cm4gdG9rZW5zfVxyXG4gICAgbGV0IGk9MCxuZXdUb2tlbnM9W107XHJcbiAgICB3aGlsZSAoaTw9MTAwJiZ0b2tlbnMuc29tZSgodG9rZW46IGFueSkgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSkpXHJcbiAgICB7XHJcbiAgICAgICAgaSsrO1xyXG4gICAgICAgIGxldCBlcWluZGV4PXRva2Vucy5maW5kSW5kZXgoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0pID0+IHRva2VuLnZhbHVlID09PSBcIj1cIik7XHJcbiAgICAgICAgbGV0IE9wZXJhdGlvbkluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9KSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcclxuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7cmV0dXJuIHRva2Vuczt9XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxyXG5cclxuICAgICAgICBsZXQgbnVtYmVyR3JvdXAgPSB0b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbjogYW55LCBpOiBhbnkpID0+ICh7IHRva2VuLCBvcmlnaW5hbEluZGV4OiBpIH0pKSBcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IHRva2VuOiB7IHR5cGU6IGFueTsgfTsgfSkgPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxyXG4gICAgICAgIC5yZWR1Y2UoKHN1bTogbnVtYmVyLCBpdGVtOiB7IG9yaWdpbmFsSW5kZXg6IG51bWJlcjsgdG9rZW46IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogbnVtYmVyOyB9OyB9KSA9PiB7XHJcbiAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09IFwiLVwiKSA/IC0xIDogMTtcclxuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxyXG4gICAgICAgIGlmICghKC8obnVtYmVyKS8pLnRlc3QoaXRlbS50b2tlbi50eXBlKSl7bXVsdGlwbGllcio9LTF9XHJcbiAgICAgICAgcmV0dXJuIHN1bSArIChpdGVtLnRva2VuLnZhbHVlICogbXVsdGlwbGllcik7XHJcbiAgICAgICAgfSwgMCk7IFxyXG4gICAgICAgIFxyXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKHtcclxuICAgICAgICAgICAgLi4uY3VycmVudFRva2VuLFxyXG4gICAgICAgICAgICB2YWx1ZTogbnVtYmVyR3JvdXBcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdG9rZW5zID0gdG9rZW5zLmZpbHRlcih0b2tlbiA9PiBcclxuICAgICAgICAgICAgdG9rZW4udHlwZSAhPT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4udmFyaWFibGUgJiYgdG9rZW4udmFyaWFibGUgIT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgfHwgXHJcbiAgICAgICAgICAgICh0b2tlbi5wb3cgJiYgdG9rZW4ucG93ICE9PSBjdXJyZW50VG9rZW4ucG93KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV3VG9rZW5zO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWFycmFuZ2VGb3JJc29sYXRpb24odG9rZW5zOiBUb2tlbnMsIGlzb2xhdGlvbkdvYWw6IHsgdHlwZTogYW55OyB2YWx1ZTogYW55OyBvdmVydmlld1NpZGVPbmU/OiBNYXA8YW55LCBhbnk+OyBvdmVydmlld1NpZGVUd28/OiBNYXA8YW55LCBhbnk+OyB9KSB7XHJcbiAgICBpZiAodG9rZW5zLnRva2Vucy5sZW5ndGggPD0gMSkgcmV0dXJuIHRva2VucztcclxuXHJcbiAgICBjb25zdCBlcUluZGV4ID0gdG9rZW5zLnRva2Vucy5maW5kSW5kZXgoKHQ6IHsgdmFsdWU6IHN0cmluZzsgfSkgPT4gdC52YWx1ZSA9PT0gJ0VxdWFscycpO1xyXG4gICAgaWYgKGVxSW5kZXggPT09IC0xKSB0aHJvdyBuZXcgRXJyb3IoXCJObyAnRXF1YWxzJyBvcGVyYXRvciBmb3VuZCBpbiB0b2tlbnNcIik7XHJcblxyXG4gICAgY29uc3Qgc3dpdGNoRGlyZWN0aW9uID0gZmFsc2U7IC8vIEZ1dHVyZSBsb2dpYyB0byBkZXRlcm1pbmUgZGlyZWN0aW9uXHJcbiAgICBjb25zdCBpc29sYXRpb25Hb2FsSW5kaWNlcyA9IHRva2Vucy50b2tlbnNcclxuICAgICAgICAubWFwKCh0OiB7IHR5cGU6IGFueTsgdmFyaWFibGU6IGFueTsgfSwgaWR4OiBhbnkpID0+ICh0LnR5cGUgPT09IGlzb2xhdGlvbkdvYWwudHlwZSAmJiB0LnZhcmlhYmxlID09PSBpc29sYXRpb25Hb2FsLnZhbHVlID8gaWR4IDogbnVsbCkpXHJcbiAgICAgICAgLmZpbHRlcigoaWR4OiBudWxsfG51bWJlcikgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICBjb25zdCBvdGhlckluZGljZXMgPSB0b2tlbnMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgoXzogYW55LCBpZHg6IGFueSkgPT4gKCFpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpZHgpICYmIGlkeCAhPT0gZXFJbmRleCA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgLy8gQWRqdXN0IHNpZ25zXHJcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiB7IHZhbHVlOiBudW1iZXI7IH0sIGk6IG51bWJlcikgPT4ge1xyXG4gICAgICAgIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpID4gZXFJbmRleCA6IGkgPCBlcUluZGV4KSAmJiBvdGhlckluZGljZXMuaW5jbHVkZXMoaSkpIHtcclxuICAgICAgICAgICAgdG9rZW4udmFsdWUgKj0gLTE7XHJcbiAgICAgICAgfSBlbHNlIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpIDwgZXFJbmRleCA6IGkgPiBlcUluZGV4KSAmJiBpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpKSkge1xyXG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTZXBhcmF0ZSBzaWRlc1xyXG4gICAgY29uc3Qgc2lkZTE6IGFueVtdID0gW107XHJcbiAgICBjb25zdCBzaWRlMjogYW55W10gPSBbXTtcclxuICAgIHRva2Vucy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSwgaTogYW55KSA9PiB7XHJcbiAgICAgICAgaWYgKGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMS5wdXNoKHRva2VuKTtcclxuICAgICAgICBpZiAob3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMi5wdXNoKHRva2VuKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRva2Vucy50b2tlbnMgPSBzd2l0Y2hEaXJlY3Rpb25cclxuICAgICAgICA/IFsuLi5zaWRlMiwgdG9rZW5zLnRva2Vuc1tlcUluZGV4XSwgLi4uc2lkZTFdXHJcbiAgICAgICAgOiBbLi4uc2lkZTEsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUyXTtcclxufVxyXG5cclxuZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2VuczogYW55W10pIHtcclxuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luOiBudW1iZXIsIGVuZDogbnVtYmVyLCB0b2tlbnM6IGFueSwgZmluZFBhcmVuSW5kZXg/OiBhbnksIHJlZ2V4PzogYW55KSB7XHJcbiAgICAgICAgd2hpbGUgKGJlZ2luIDwgZW5kICYmIGJlZ2luIDwgdG9rZW5zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBsZXQgaW5kZXg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocmVnZXgpIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogYW55OyB9KSA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0pID0+IHRva2VuLnR5cGUgPT09IFwib3BlcmF0b3JcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybiAtMTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCEvWystXS8udGVzdCh0b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiAtMTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMubGVuZ3RoLGo9MDtcclxuICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICBsZXQgY2hlY2tlZElEczogYW55W10gPSBbXTsgIFxyXG4gICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTtcclxuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCYmajwyMDApIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBqKys7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKFwiICYmICFjaGVja2VkSURzLmluY2x1ZGVzKHRva2Vuc1tpXS5pZCkpIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IGZpbmRQYXJlbkluZGV4KHRva2Vuc1tpXS5pZCk7ICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoY3VycmVudElEIT09bnVsbCYmaT09PWN1cnJlbnRJRC5jbG9zZSkge1xyXG4gICAgICAgICAgICAgICAgW2JlZ2luLGVuZF09W2N1cnJlbnRJRC5vcGVuLGN1cnJlbnRJRC5jbG9zZV1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghY3VycmVudElEKSB7XHJcbiAgICAgICAgICAgIGJlZ2luID0gMDtcclxuICAgICAgICAgICAgZW5kID0gdG9rZW5zLmxlbmd0aDtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xyXG5cclxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxyXG4gICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxyXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGo+PTIwMCl7dGhyb3cgbmV3IEVycm9yKFwib3BlcmF0aW9uc09yZGVyIEZhaWxlZCBleGNlZWRlZCAyMDAgcmV2aXNpb25zXCIpO31cclxuXHJcbiAgICBmb3IgKGxldCBpPTE7aTw9NjtpKyspe1xyXG4gICAgICAgIGxldCBwcmlvcml0eSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHkoaSx0cnVlKSk7XHJcbiAgICAgICAgaWYocHJpb3JpdHkhPT0tMSlyZXR1cm4gcHJpb3JpdHlcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsXHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xyXG4gICAgb3BlcmF0b3I6IHN0cmluZztcclxuICAgIGluZGV4OiBudW1iZXI7XHJcbiAgICB0cmFuc2l0aW9uOiBudW1iZXI7XHJcbiAgICBzcGVjaWFsQ2hhcjogc3RyaW5nO1xyXG4gICAgbGVmdDogYW55O1xyXG4gICAgcmlnaHQ6IGFueTtcclxuICAgIGNvbnN0cnVjdG9yKHRva2VuczogYW55W10sIGluZGV4PzogbnVtYmVyKXtcclxuICAgICAgICBpZihpbmRleClcclxuICAgICAgICB0aGlzLmluZGV4ID0gaW5kZXg7XHJcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5pbmRleDtcclxuICAgICAgICB0aGlzLnBvc2l0aW9uKHRva2VucylcclxuICAgIH1cclxuICAgIHBvc2l0aW9uKHRva2VuczogYW55W10pIHtcclxuICAgICAgICB0aGlzLmluZGV4ID0gIXRoaXMuaW5kZXg/IG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIDogdGhpcy5pbmRleDtcclxuICAgICAgICBpZiAodGhpcy5pbmRleCA9PT0gbnVsbCB8fCB0aGlzLmluZGV4ID49IHRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5vcGVyYXRvciA9IHRva2Vuc1t0aGlzLmluZGV4XS52YWx1ZTtjb25zb2xlLmxvZyhnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ3JpZ2h0JykpXHJcbiAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwibGVmdFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ3JpZ2h0JykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB7YnJlYWtDaGFyOiB0aGlzLmluZGV4fTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ2RvdWJsZVJpZ2h0JykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSB0aGlzLmxlZnQuYnJlYWtDaGFyO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMudHJhbnNpdGlvbi0xLFwicmlnaHRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQuYnJlYWtDaGFyKyh0aGlzLnJpZ2h0Lm11bHRpU3RlcD8xOjApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhdG9yICR7dGhpcy5vcGVyYXRvcn0gd2FzIG5vdCBhY2NvdW50ZWQgZm9yLCBvciBpcyBub3QgdGhlIHZhbGlkIG9wZXJhdG9yYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vY29uc29sZS5sb2codG9rZW5zLnRva2VucylcclxuICAgICAgICB0aGlzLnNwZWNpYWxDaGFyPXRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA/IHRva2Vuc1t0aGlzLmluZGV4XS5zcGVjaWFsQ2hhciA6IG51bGw7XHJcbiAgICB9XHJcbiAgICBhcHBseVBvc2l0aW9uKHRva2VuczogYW55W10sIGluZGV4OiAgbnVtYmVyLCBkaXJlY3Rpb246IHN0cmluZykge1xyXG4gICAgICAgIGxldCBicmVha0NoYXI9aW5kZXhcclxuICAgICAgICBsZXQgdGFyZ2V0O1xyXG4gICAgICAgIGxldCBtdWx0aVN0ZXA9ZmFsc2U7XHJcbiAgICAgICAgY29uc3QgaXNMZWZ0ID0gZGlyZWN0aW9uID09PSBcImxlZnRcIjtcclxuICAgICAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcclxuICAgICAgICBpZiAoKGlzTGVmdCAmJiBpbmRleCA8PSAwKSB8fCAoIWlzTGVmdCAmJiBpbmRleCA+PSB0b2tlbnMubGVuZ3RoIC0gMSkgfHwgIXRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhdCBhcHBseVBvc2l0aW9uOiBcXFwiaW5kZXggd2Fzbid0IHZhbGlkXFxcIiBpbmRleDogXCIraW5kZXgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIikge1xyXG4gICAgICAgICAgICBjb25zdCBwYXJlbkluZGV4ID0gZmluZFBhcmVuSW5kZXgodG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLmlkKTtcclxuICAgICAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2UrMTtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gdG9rZW5zLnNsaWNlKHBhcmVuSW5kZXgub3BlbiwgcGFyZW5JbmRleC5jbG9zZSsxKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBicmVha0NoYXI9aW5kZXgraW5kZXhNb2RpZmllcjtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gdG9rZW5zW2JyZWFrQ2hhcl07XHJcbiAgICAgICAgICAgIGJyZWFrQ2hhcis9aXNMZWZ0PzA6MVxyXG4gICAgICAgIH1cclxuICAgICAgICAvL2NvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+IDM7XHJcbiAgICBcclxuICAgICAgICBpZiAoIW11bHRpU3RlcCYmdG9rZW5zW2luZGV4K2luZGV4TW9kaWZpZXJdLnR5cGUgPT09IFwicGFyZW5cIil7XHJcbiAgICAgICAgICAgIC8vdGFyZ2V0PXRhcmdldC5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRhcmdldD8ubGVuZ3RoPT09MCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGF0IGFwcGx5UG9zaXRpb246IGNvdWxkbid0IGZpbmQgdGFyZ2V0IHRva2VuIGZvciBkaXJlY3Rpb24gJHtkaXJlY3Rpb259IGFuZCBvcGVyYXRvclwiJHt0b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIC8vYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XHJcbiAgICAgICAgLy9kZWxldGUgdGFyZ2V0LmluZGV4XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRhcmdldC5sZW5ndGg9PT0zKXtcclxuICAgICAgICAgICAgLy90YXJnZXQ9dGFyZ2V0LmZpbmQoKGl0ZW06IHsgdHlwZTogc3RyaW5nOyB9KSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxyXG4gICAgICAgIH1lbHNlIGlmKHRhcmdldC5sZW5ndGg+MSltdWx0aVN0ZXA9dHJ1ZVxyXG4gICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdG9rZW5zOiB0YXJnZXQsXHJcbiAgICAgICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxyXG4gICAgICAgICAgICBicmVha0NoYXI6IGJyZWFrQ2hhcixcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgY2hlY2tNdWx0aVN0ZXAoKXtcclxuICAgICAgICByZXR1cm4gKChnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ2JvdGgnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKSYmdGhpcy5sZWZ0Py5tdWx0aVN0ZXApfHx0aGlzLnJpZ2h0Py5tdWx0aVN0ZXApJiZ0aGlzLm9wZXJhdG9yPT09J011bHRpcGxpY2F0aW9uJztcclxuICAgIH1cclxuICAgIGlzTGVmdFZhcigpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmxlZnQubXVsdGlTdGVwP3RoaXMubGVmdC50b2tlbnMuc29tZSgodDogeyB0eXBlOiBzdHJpbmc7IH0pPT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMubGVmdC50b2tlbnMudHlwZS5pbmNsdWRlcygnYXJpYWJsZScpXHJcbiAgICB9XHJcbiAgICBpc1JpZ2h0VmFyKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucmlnaHQubXVsdGlTdGVwP3RoaXMucmlnaHQudG9rZW5zLnNvbWUoKHQ6IHsgdHlwZTogc3RyaW5nOyB9KT0+dC50eXBlPT09J3ZhcmlhYmxlJ3x8dC50eXBlPT09J3Bvd2VyVmFyaWFibGUnKTp0aGlzLnJpZ2h0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcclxuICAgIH1cclxuICAgIGNoZWNrRnJhYygpey8vIXRoaXMuY2hlY2tNdWx0aVN0ZXAoKSBJIGRvbid0IGtub3cgd2h5IEkgaGFkIHRoaXMgaGVyZVxyXG4gICAgICAgIHJldHVybiAvKGZyYWN8XFwvKS8udGVzdCh0aGlzLm9wZXJhdG9yKSYmKHRoaXMuaXNMZWZ0VmFyKCl8fHRoaXMuaXNSaWdodFZhcigpKVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIHBhcnNlT3BlcmF0b3Iob3BlcmF0b3I6IG1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICBzd2l0Y2ggKG9wZXJhdG9yLm9wZXJhdG9yKSB7XHJcbiAgICAgICAgY2FzZSBcInNpblwiOlxyXG4gICAgICAgICAgICAvL2NvbnN0IGE9bmV3IFRva2VuKE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMob3BlcmF0b3IuZ3JvdXAxLml0ZW1zWzBdLnZhbHVlKSkpXHJcbiAgICAgICAgICAgIC8vc29sdmVkLnZhbHVlID0gO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBpZGVudGlmeSBvcGVyYXRvciB0eXBlIGF0IHByYWlzZSBvcGVyYXRvcjogXCIrb3BlcmF0b3Iub3BlcmF0b3IpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdDogeyB2YXJpYWJsZTogYW55OyBwb3c6IGFueTsgdmFsdWU6IG51bWJlcjsgfSwgcmlnaHQ6IHsgdmFyaWFibGU6IGFueTsgcG93OiBhbnk7IHZhbHVlOiBudW1iZXI7IH0sIHNvbHZlZDogVG9rZW4pIHtcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSAmJiBsZWZ0LnZhcmlhYmxlICE9PSByaWdodC52YXJpYWJsZSkge1xyXG4gICAgICAgICAgICAvKiBLZWVwIHRoZW0gc2VwYXJhdGUgc2luY2UgdGhleSBoYXZlIGRpZmZlcmVudCB2YXJpYWJsZXNcclxuICAgICAgICAgICAgc29sdmVkLnRlcm1zID0gW1xyXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogbGVmdC52YXJpYWJsZSwgcG93OiBsZWZ0LnBvdyB8fCAxLCB2YWx1ZTogbGVmdC52YWx1ZSB8fCAxIH0sXHJcbiAgICAgICAgICAgICAgICB7IHZhcmlhYmxlOiByaWdodC52YXJpYWJsZSwgcG93OiByaWdodC5wb3cgfHwgMSwgdmFsdWU6IHJpZ2h0LnZhbHVlIHx8IDEgfVxyXG4gICAgICAgICAgICBdOyovXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpZmZlcmVudCB2YXJpYWJsZSBiYXNlcyBhdCBwb3dlciBtdWx0aXBsaWNhdGlvbi4gSSBkaWRuJ3QgZ2V0IHRoZXJlIHlldFwiKVxyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlID0gbGVmdC52YXJpYWJsZSB8fCByaWdodC52YXJpYWJsZTtcclxuICAgICAgICBzb2x2ZWQudmFyaWFibGUgPSB2YXJpYWJsZS5sZW5ndGg+MD92YXJpYWJsZTp1bmRlZmluZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IHBvdyA9IChsZWZ0LnBvdyB8fCAwKSArIChyaWdodC5wb3cgfHwgMCk7XHJcbiAgICAgICAgcG93PWxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUmJnBvdz09PTAmJiFsZWZ0LnBvdyYmIXJpZ2h0LnBvdz8yOnBvdztcclxuICAgICAgICAvL3NvbHZlZC5wb3cgPSBwb3cgfHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICAvLyBSdWxlIDM6IEhhbmRsZSBtdWx0aXBsaWNhdGlvbiBvZiBjb25zdGFudHNcclxuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgcmlnaHRWYWx1ZSA9IHJpZ2h0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSBsZWZ0VmFsdWUgKiByaWdodFZhbHVlO1xyXG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcclxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVnJpYWJsZXMobGVmdDogYW55LHJpZ2h0OiBhbnksc29sdmVkOiBUb2tlbil7XHJcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcclxuICAgICAgICBpZiAoIWxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7XHJcbiAgICAgICAgICAgIHJldHVybiA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaWYgKHBvc2l0aW9uLm9wZXJhdG9yPT09JyonKXtyZXR1cm4gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0LHJpZ2h0LHNvbHZlZCl9XHJcbiAgICAgICAgLy9jb25zb2xlLmxvZyhsZWZ0LnZhcmlhYmxlLHJpZ2h0LnZhcmlhYmxlKVxyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUd28gdmFyaWFibGUgZXF1YXRpb25zIGFyZW4ndCBhY2NlcHRlZCB5ZXRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XHJcbiAgICAgICAgLy9zb2x2ZWQudmFyaWFibGU9bGVmdC52YXJcclxuXHJcbiAgICAgICAgLypcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cclxuICAgICAgICAqL1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICAvL3JldHVybiBzb2x2ZWQ7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcclxuICAgIGlucHV0PVwiXCI7XHJcbiAgICB0b2tlbnM6IFRva2VucztcclxuICAgIHNvbHV0aW9uPVwiXCI7XHJcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcclxuICAgIGk9MDtcclxuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcclxuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygndGhpcy50b2tlbnMnLHRoaXMudG9rZW5zKTtcclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlRva2VucyBhZnRlciB0b2tlbml6ZVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICB0aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xyXG4gICAgfVxyXG4gICAgZ2V0UmVkeWZvck5ld1JvbmQoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoSW5mbyh0aGlzLnRva2VucylcclxuICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKHRoaXMudG9rZW5zLnRva2Vucyx0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoKVxyXG4gICAgICAgIHRoaXMudG9rZW5zLmV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCk7XHJcbiAgICB9XHJcbiAgICBjb250cm9sbGVyKCk6IGFueXtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBiPW5ldyBtYXRoR3JvdXAoKVxyXG4gICAgICAgIGIuc2V0SXRlbXModGhpcy50b2tlbnMudG9rZW5zWzFdKVxyXG4gICAgICAgIGNvbnN0IGE9bmV3IG1hdGhKYXhPcGVyYXRvcigpXHJcbiAgICAgICAgYS5zZXRHcm91cDEoYilcclxuICAgICAgICBwYXJzZU9wZXJhdG9yKGEpXHJcbiAgICAgICAgY29uc29sZS5sb2coYSlcclxuICAgICAgICBcclxuICAgICAgICAvKlxyXG4gICAgICAgIHRoaXMuaSsrO1xyXG4gICAgICAgIGlmKHRoaXMuaT4xMCl7cmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKX1cclxuXHJcbiAgICAgICAgdGhpcy5nZXRSZWR5Zm9yTmV3Um9uZCgpO1xyXG4gICAgICAgIC8vY29uc3Qgb3ZlcnZpZXc9dGhpcy50b2tlbnMuZ2V0T3ZlcnZpZXcoKVxyXG4gICAgICAgIGNvbnN0IHByYWlzaW5nTWV0aG9kPW5ldyBQcmFpc2luZ01ldGhvZCh0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgaWYgKHByYWlzaW5nTWV0aG9kLmlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpKXtcclxuICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy50b2tlbnMpO1xyXG4gICAgICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlBhcnNlZCBleHByZXNzaW9uXCIsIEpTT04uc3RyaW5naWZ5KHBvc2l0aW9uLCBudWxsLCAxKSk7XHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbiA9PT0gbnVsbCYmdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xKXtcclxuICAgICAgICAgICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8oXCJwYXJzZSh0b2tlbnMpXCIscGFyc2UodGhpcy50b2tlbnMudG9rZW5zKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBcInRoZSAqKioqXCJcclxuICAgICAgICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uLmNoZWNrRnJhYygpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnVzZVBhcnNlKHBvc2l0aW9uKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZihwcmFpc2luZ01ldGhvZC5pc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpKXtcclxuICAgICAgICAgICAgdGhpcy51c2VJc29sYXQocHJhaXNpbmdNZXRob2QpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRvSXNvbGF0ZT1wcmFpc2luZ01ldGhvZC5pc0FueXRoaW5nVG9Jc29sYXRlKClcclxuICAgICAgICBpZiAodG9Jc29sYXRlKXtcclxuICAgICAgICAgICAgcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRoaXMudG9rZW5zLHRvSXNvbGF0ZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgfSAgIFxyXG4gICAgICAgIC8vaWYgKHNvbHZlZCA9PT0gbnVsbHx8dHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKS8vdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTsqL1xyXG4gICAgfVxyXG5cclxuICAgIHVzZVBhcnNlKHBvc2l0aW9uOiBQb3NpdGlvbil7XHJcbiAgICAgICAgY29uc3Qgc29sdmVkID0gcGFyc2UocG9zaXRpb24pO1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxyXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXHJcbiAgICAgICAgdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKGxlZnRCcmVhayxsZW5ndGgsc29sdmVkKVxyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcmFpc2luZ01ldGhvZCgpe1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcclxuICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVzZVF1YWRyYXRpYygpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMudXNlSXNvbGF0KCk7Ki9cclxuICAgIH1cclxuXHJcbiAgICB1c2VJc29sYXQocHJhaXNpbmdNZXRob2Q6IFByYWlzaW5nTWV0aG9kKXtcclxuICAgICAgICBpc29sYXRlTXVsdGlwbGljYXRpb24odGhpcy50b2tlbnMsbmV3IFRva2VuKHByYWlzaW5nTWV0aG9kLnZhcmlhYmxlc1swXSkpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMoKVxyXG4gICAgICAgIC8vVXNlIHBvc3Nlc3Npb25cclxuICAgIH1cclxuXHJcbiAgICB1c2VRdWFkcmF0aWMoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnM9c2ltcGxpZml5KHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlOiBzdHJpbmcpPT50aGlzLnRva2Vucy50b2tlbnMuZmlsdGVyKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0pID0+IHRva2VuLnR5cGUgPT09IHR5cGUpO1xyXG4gICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcXVhZChcclxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXT8udmFsdWUgIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdPy52YWx1ZSB8IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0/LnZhbHVlICogLTF8IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obWVzOiBzdHJpbmcsdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IFRva2VuIHwgQXhpcyl7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxyXG4gICAgfVxyXG4gICAgcHJvY2Vzc0lucHV0KCl7XHJcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XHJcbiAgICAgICAgLnJlcGxhY2UoLyhNYXRoLnxcXFxcfFxcc3xsZWZ0fHJpZ2h0KS9nLCBcIlwiKSBcclxuICAgICAgICAucmVwbGFjZSgvey9nLCBcIihcIilcclxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcclxuICAgICAgICAvLy5yZXBsYWNlKC8oPzwhXFxcXHxbYS16QS1aXSkodGFufHNpbnxjb3N8Ymlub218ZnJhY3xhc2lufGFjb3N8YXRhbnxhcmNjb3N8YXJjc2lufGFyY3RhbnxjZG90KS9nLCBcIlxcXFwkMVwiKTtcclxuICAgIH1cclxuICAgIGZpbmFsUmV0dXJuKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgbWF0aFZhcmlhYmxlc3tcclxuXHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5BcnJheShhcnI6IGFueSkge1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG4gICAgbGV0IHN0YWNrID0gQXJyYXkuaXNBcnJheShhcnIpID8gWy4uLmFycl0gOiBbYXJyXTtcclxuXHJcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpO1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XHJcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7IFxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKG5leHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQucmV2ZXJzZSgpO1xyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIFByYWlzaW5nTWV0aG9ke1xyXG4gICAgdG9rZW5zXHJcbiAgICBvdmVydmlldzogYW55O1xyXG4gICAgdmFyaWFibGVzOiBhbnlbXTtcclxuICAgIGNvbnN0cnVjdG9yKHRva2VuczogYW55KXtcclxuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnNcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3PXRoaXMuZ2V0T3ZlcnZpZXcoKVxyXG4gICAgICAgIHRoaXMuYXNzaWduVmFyaWFibGVzKClcclxuICAgIH1cclxuICAgIGlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5zb21lKCh0OiBhbnkpPT4gdC50eXBlPT09J3ZhcmlhYmxlJyYmdC52YWx1ZT4xKVxyXG4gICAgfVxyXG5cclxuICAgIGlzTXVsdGlwbGljYXRpb25Jc29sYXRlKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFzZVZhcmlhYmxlKCkmJnRoaXMuaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCkmJnRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKVxyXG4gICAgfVxyXG4gICAgaXNJc29sYXRlKCl7XHJcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5cclxuICAgIH1cclxuXHJcbiAgICBpc0FueXRoaW5nVG9Jc29sYXRlKCl7XHJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXMubGVuZ3RoPjEpdGhyb3cgbmV3IEVycm9yKFwidHdvIHZhciBlcSBhcmVudCBzYXBvcnRlZCB5ZXRcIilcclxuICAgICAgICBpZighdGhpcy5pc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpKXJldHVybjtcclxuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMuZXF1YWxzSW5kZXhJZkFueSgpO1xyXG4gICAgICAgIGlmKCFlcUluZGV4KXtyZXR1cm59O1xyXG4gICAgICAgIGNvbnN0IGJlZm9yID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZSgwLGVxSW5kZXgpKVxyXG4gICAgICAgIGNvbnN0IGFmdGVyID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZShlcUluZGV4KzEpKVxyXG4gICAgICAgIGNvbnN0IHdoYXRUb0lzb2xhdCA9dGhpcy53aGF0VG9Jc29sYXQoKTtcclxuICAgICAgICBpZiAoKCFiZWZvcnx8IWFmdGVyKXx8IXdoYXRUb0lzb2xhdHx8KGJlZm9yPy5zaXplPDImJmFmdGVyPy5zaXplPDIpKXJldHVybjtcclxuICAgICAgICByZXR1cm4ge292ZXJ2aWV3U2lkZU9uZTogYmVmb3Isb3ZlcnZpZXdTaWRlVHdvOiBhZnRlciwuLi53aGF0VG9Jc29sYXR9XHJcbiAgICB9LypcclxuICAgIGhvd1RvSXNvbGF0ZShvdmVydmlld1NpZGVPbmUsb3ZlcnZpZXdTaWRlVHdvLGlzb2xhdGlvbkdvb2wpe1xyXG4gICAgICAgIGNvbnN0IGlzb2xhdGlvblR5cGU9aXNvbGF0aW9uR29vbC5zcGx0KCc6Jyk7XHJcbiAgICAgICAgLy9pZiAoKXt9XHJcbiAgICB9Ki9cclxuICAgIHdoYXRUb0lzb2xhdCgpe1xyXG4gICAgICAgIC8vIGkgbmVlZCB0byBhZGQgcG93cyBhZnRlclxyXG4gICAgICAgIC8vIGZvciBrbm93IGltIGdvaW5nIG9uIHRoZSBvc2hvbXNoaW4gdGhhdCB0aHIgaXMgb25seSBvbmUgdmFyXHJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXM/Lmxlbmd0aDwxKXJldHVybjtcclxuXHJcbiAgICAgICAgcmV0dXJuIHt0eXBlOiAndmFyaWFibGUnLHZhbHVlOiB0aGlzLnZhcmlhYmxlc1swXX1cclxuICAgIH0vKlxyXG4gICAgaXNPdmVydmlld1RvaXNvbGF0KG92ZXJ2aWV3KXtcclxuICAgIH0qL1xyXG4gICAgaXNJbWJhbGFuY2Uob3ZlcnZpZXc6IHsgc2l6ZTogbnVtYmVyOyB9KXtcclxuICAgICAgICBvdmVydmlldy5zaXplPjFcclxuICAgIH1cclxuICAgIGVxdWFsc0luZGV4SWZBbnkoKXtcclxuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMudG9rZW5zLm1hcCgodDogeyB2YWx1ZTogc3RyaW5nOyB9LGlkeDogYW55KT0+dC52YWx1ZT09PSdFcXVhbHMnP2lkeDpudWxsKS5maWx0ZXIoKG06IG51bGwpPT5tIT09bnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIGVxSW5kZXhbMF07XHJcbiAgICB9XHJcbiAgICBpc1F1YWRyYXRpYygpe1xyXG5cclxuICAgIH1cclxuICAgIGlzRmluYWxSZXR1cm4oKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMubGVuZ3RoPDJ8fCh0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGFzc2lnblZhcmlhYmxlcygpe1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzPVtdXHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5vdmVydmlldy5lbnRyaWVzKCkpe1xyXG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKCd2YXJpYWJsZTonKSYmIXRoaXMudmFyaWFibGVzLmluY2x1ZGVzKHZhbHVlLnZhcmlhYmxlKSl7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZhcmlhYmxlcy5wdXNoKHZhbHVlLnZhcmlhYmxlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGhhc2VWYXJpYWJsZSgpe3JldHVybiB0aGlzLnZhcmlhYmxlcz8ubGVuZ3RoPjB9XHJcblxyXG4gICAgaXNUaGVyZU9wZXJhdG9yT3RoZXJUaGFuRXF1YWxzKCl7XHJcbiAgICAgICAgY29uc3QgZmlsdGVyPXRoaXMuZmlsdGVyQnlUeXBlKCdvcGVyYXRvcicsJ0VxdWFscycpXHJcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubm9NYXRjaD4wXHJcbiAgICB9XHJcbiAgICBpc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpe1xyXG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxyXG4gICAgICAgIHJldHVybiAgZmlsdGVyLm1hdGNoPT09MSYmZmlsdGVyLm5vTWF0Y2g9PT0wXHJcbiAgICB9XHJcblxyXG4gICAgZmlsdGVyQnlUeXBlKHR5cGVLZXk6IHN0cmluZywgdGFyZ2V0VmFsdWU6IHN0cmluZyl7XHJcbiAgICAgICAgbGV0IG1hdGNoPTAsIG5vTWF0Y2g9MFxyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgodHlwZUtleSkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IHR5cGVLZXkrJzonK3RhcmdldFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2grKztcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm9NYXRjaCsrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IG1hdGNoOiBtYXRjaCwgbm9NYXRjaDogbm9NYXRjaCB9O1xyXG4gICAgfVxyXG4gICAgZ2V0T3ZlcnZpZXcodG9rZW5zPzogYW55W10gKSB7XHJcbiAgICAgICAgaWYoIXRva2Vucyl0b2tlbnM9dGhpcy50b2tlbnNcclxuICAgICAgICBpZighdG9rZW5zKXJldHVybjtcclxuICAgICAgICBjb25zdCBvdmVydmlldyA9IG5ldyBNYXAoKTtcclxuICAgICAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XHJcbiAgICAgICAgICAgIC8vaWYgKCF0b2tlbi5pc1ZhbHVlVG9rZW4oKSkge3JldHVybjt9XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRva2VuLmdldEZ1bGxUb2tlbklEKClcclxuICAgICAgICAgICAgLy9FcXVhbHNcclxuICAgICAgICAgICAgaWYgKCFvdmVydmlldy5oYXMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZW50cnkgPSB7IFxyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLnR5cGUsIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiAwICxcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZTogdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09ICd2YXJpYWJsZScpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbnRyeS52YXJpYWJsZSA9IHRva2VuLnZhcmlhYmxlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgICAgICBvdmVydmlldy5zZXQoa2V5LCBlbnRyeSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgb3ZlcnZpZXcuZ2V0KGtleSkuY291bnQrKztcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gb3ZlcnZpZXcvL0FycmF5LmZyb20ob3ZlcnZpZXcudmFsdWVzKCkpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBPcGVyYXRvcntcclxuXHJcbn1cclxuXHJcbmNsYXNzIE1vZGlmaWVye1xyXG5cclxufSJdfQ==