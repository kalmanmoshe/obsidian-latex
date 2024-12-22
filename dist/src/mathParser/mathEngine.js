import { quad, degreesToRadians, radiansToDegrees, calculateFactorial } from "./mathUtilities";
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
        console.log(this.index === null, this.index >= tokens.length - 1);
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
class mathJaxOperator {
    operator;
    priority;
    associativityNumber;
    group1;
    group2;
    solution;
    constructor(operator, priority, associativityNumber, group1, group2) {
        if (operator)
            this.operator = operator;
        if (priority)
            this.priority = priority;
        if (associativityNumber)
            this.associativityNumber = associativityNumber;
        if (group1)
            this.group1 = group1;
        if (group2)
            this.group2 = group2;
    }
    setGroup1(group) { this.group1 = group; }
    setGroup2(group) { this.group2 = group; }
}
class mathGroup {
    numberOnly;
    hasVariables;
    singular;
    hasOperators;
    multiLevel;
    isOperable = true;
    items;
    constructor() {
    }
    setItems(items) {
        this.items = items;
    }
    setMetaData() {
        this.singular = this.items.length === 1;
        this.numberOnly = this.items.some(t => !t.isVar());
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
        const b = new mathGroup();
        b.setItems(this.tokens.tokens[1]);
        const a = new mathJaxOperator();
        a.setGroup1(b);
        parseOperator(a);
        console.log(a);
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
class Tokens {
    tokens = [];
    operatorStructure;
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
                this.tokens.push(new BasicMathJaxToken(match[0]));
                i += match[0].length - 1;
                continue;
            }
            match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
            if (!!match) {
                i += match[0].length - 1;
                this.tokens.push(new BasicMathJaxToken(parseFloat(match[0])));
                continue;
            }
            match = math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/);
            if (!!match) {
                i += match[0].length - 1;
                this.tokens.push(new BasicMathJaxToken(1, match[0]));
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
        let tempTokens = this.tokens.map((t) => {
            if (typeof t.value === 'number')
                return new Token(t.value, t.variable);
            // if(t.type==='operator')return new mathJaxOperator(t.value)
            return t;
        });
        // Step one structure aka replace parentheses with nested arrays
        // Step two Find first operator.and continue from there
        const pos = new Position(tempTokens);
        console.log(pos);
        this.connectAndCombine(arr);
        this.validatePlusMinus();
        console.log(tempTokens);
        const parenMap = this.implicitMultiplicationMap();
        parenMap.sort((a, b) => b - a)
            .forEach((value) => {
            this.tokens.splice(value, 0, new BasicMathJaxToken('*'));
        });
        const mapPow = this.tokens.map((token, index) => token.value === 'Pow' ? index : null).filter((item) => item !== null);
        console.log(mapPow);
        mapPow.forEach((index) => {
            //const position=new Position(this,index)
            //const [leftBreak,length] = [position.left.breakChar,position.right.breakChar-position.left.breakChar]
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
    value;
    variable;
    constructor(value, variable) {
        this.value = value;
        this.variable = variable;
    }
    isVar() { return this.variable !== undefined; }
}
export class BasicMathJaxToken {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLElBQUksRUFBaUMsZ0JBQWdCLEVBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQUc1SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQVEsTUFBTSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFHcEUsT0FBTyxFQUFFLGNBQWMsRUFBUSxhQUFhLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM3RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUscUJBQXFCLEVBQUUseUJBQXlCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUdyTSxNQUFNLFlBQVksR0FBRztJQUNqQixPQUFPLEVBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU87SUFDNUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsS0FBSztJQUN4RSxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPO0NBQzFELENBQUM7QUFDRjs7O0dBR0c7QUFFSCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsR0FBVTtJQUMvQyxNQUFNLFNBQVMsR0FBRyxFQUFFLENBQUM7SUFDckIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ2QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNuQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDaEIsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7WUFDRCxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNyQixDQUFDO0FBR0QsTUFBTSxvQkFBb0IsR0FBRztJQUN6QixtQkFBbUIsRUFBRSxDQUFDLEdBQUcsQ0FBQztJQUMxQiw0QkFBNEIsRUFBRSxDQUFDLE1BQU0sQ0FBQztJQUN0QyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNyQixPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUM7SUFDZCwwQkFBMEIsRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDO0lBQ3ZHLHFCQUFxQixFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBQyxHQUFHLENBQUM7Q0FDL0MsQ0FBQztBQUVGLE1BQU0sT0FBTyxRQUFRO0lBQ2pCLFNBQVMsR0FBUyxFQUFFLENBQUM7SUFDckIsWUFBWSxHQUFRLEVBQUUsQ0FBQztJQUN2QixRQUFRLEdBQVEsRUFBRSxDQUFBO0lBQ2xCLEtBQUssR0FBUyxFQUFFLENBQUM7SUFDakIsWUFBWSxDQUFDLEtBQWE7UUFDdEIsSUFBSSxDQUFDLEtBQUssSUFBRSxLQUFLLENBQUM7SUFDdEIsQ0FBQztJQUNELFlBQVksQ0FBQyxHQUFXLEVBQUUsS0FBcUM7UUFDM0QsSUFBSSxDQUFDLFNBQVMsSUFBRSxDQUFDLE9BQU8sR0FBRyxLQUFHLFFBQVEsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUEsR0FBRyxDQUFDLEdBQUMsS0FBSyxHQUFDLENBQUMsT0FBTyxLQUFLLEtBQUcsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUMsR0FBRSxLQUFLLENBQUM7SUFDdkksQ0FBQztJQUNELGVBQWUsQ0FBQyxHQUFtQztRQUMvQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBQyxHQUFHLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBQ0QsV0FBVyxDQUFDLE1BQWM7UUFDdEIsTUFBTSxpQkFBaUIsR0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQTtRQUNyQyxJQUFJLENBQUMsWUFBWSxDQUFDLG9CQUFvQixFQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVELFdBQVcsQ0FBQyxNQUFjLEVBQUMsUUFBa0IsRUFBQyxRQUF3QztRQUNsRixRQUFRLEdBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDeEMsTUFBTSxJQUFJLEdBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLEtBQUssR0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxFQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFFLENBQUMsQ0FBQztRQUVoRyxRQUFRLElBQUksRUFBQyxDQUFDO1lBQ1YsS0FBSyxvQkFBb0IsQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztnQkFDckUsUUFBUSxHQUFHLEdBQUcsSUFBSSxJQUFJLFFBQVEsQ0FBQyxRQUFRLEtBQUssS0FBSyxPQUFPLFFBQVEsRUFBRSxDQUFBO2dCQUNsRSxNQUFNO1lBQ1YsS0FBSyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7Z0JBQ3RELFFBQVEsR0FBRyxHQUFHLElBQUksSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLElBQUksS0FBSyxNQUFNLFFBQVEsRUFBRSxDQUFBO2dCQUN6RixNQUFNO1lBQ1YsS0FBSyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7Z0JBQ3pELFFBQVEsR0FBRSxVQUFVLElBQUksS0FBSyxLQUFLLE9BQU8sUUFBUSxFQUFFLENBQUE7Z0JBQ25ELE1BQU07WUFDTixLQUFLLG9CQUFvQixDQUFDLDRCQUE0QixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO2dCQUNsRixRQUFRLEdBQUcsVUFBVSxLQUFLLE9BQU8sUUFBUSxFQUFFLENBQUE7Z0JBQzNDLE1BQU07WUFDVixLQUFLLG9CQUFvQixDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO2dCQUM1RSxRQUFRLEdBQUMsS0FBSyxRQUFRLENBQUMsUUFBUSxLQUFLLEtBQUssT0FBTyxRQUFRLEVBQUUsQ0FBQTtnQkFDMUQsTUFBTTtZQUNWLEtBQUssb0JBQW9CLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7Z0JBQ3ZFLFFBQVEsR0FBQyxLQUFLLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBQyxNQUFNLENBQUMsSUFBSSxJQUFJLEtBQUssS0FBSyxPQUFPLFFBQVEsRUFBRSxDQUFBO2dCQUN0RixNQUFNO1FBQ2QsQ0FBQztRQUNELElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkMsQ0FBQztDQUNKO0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQkc7QUFFSCxTQUFTLGlCQUFpQixDQUFDLFFBQWdCLEVBQUMsSUFBUyxFQUFDLEtBQVU7SUFDNUQsSUFBSSxPQUFPLFFBQVEsS0FBRyxRQUFRLElBQUUsT0FBTyxJQUFJLEVBQUUsS0FBSyxLQUFHLFFBQVEsSUFBRSxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUM5RyxNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsR0FBQyxRQUFRLEdBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBQ0QsSUFBSSxPQUFPLFFBQVEsS0FBRyxRQUFRLElBQUUsT0FBTyxLQUFLLEVBQUUsS0FBSyxLQUFHLFFBQVEsRUFBRSxDQUFDO1FBQzdELE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLEdBQUMsUUFBUSxHQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDcEUsQ0FBQztBQUNMLENBQUM7QUFJRCxTQUFTLEtBQUssQ0FBQyxRQUF3RTtJQUNuRixJQUFJLEVBQUUsUUFBUSxFQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUMsS0FBSyxFQUFDLEdBQUcsUUFBUSxDQUFDO0lBRW5ELElBQUksR0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFBO0lBQ2pCLEtBQUssR0FBQyxLQUFLLENBQUMsTUFBTSxDQUFBO0lBQ2xCLGdEQUFnRDtJQUNoRCxpQkFBaUIsQ0FBQyxRQUFRLEVBQUMsSUFBSSxFQUFDLEtBQUssQ0FBQyxDQUFDO0lBRXZDLElBQUksTUFBTSxHQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBQyxTQUFTLENBQUMsQ0FBQztJQUNsQyxRQUFRLFFBQVEsRUFBRSxDQUFDO1FBQ2YsS0FBSyxhQUFhO1lBQ2QsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUMsV0FBVyxLQUFHLElBQUksQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFBLENBQUMsQ0FBQSxHQUFHLENBQUMsQ0FBQztZQUM5RSxNQUFNO1FBQ1YsS0FBSyxLQUFLO1lBQ04sSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFFLEtBQUssQ0FBQyxRQUFRLEVBQ2pDLENBQUM7Z0JBQ0csTUFBTSxDQUFDLFFBQVEsR0FBQyxJQUFJLENBQUMsUUFBUSxJQUFFLElBQUksQ0FBQyxRQUFRLEtBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsRUFBRSxDQUFDO2dCQUM3RyxjQUFjO1lBQ2xCLENBQUM7WUFDRCxNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEQsTUFBTTtRQUNWLEtBQUssVUFBVSxDQUFDO1FBQ2hCLEtBQUssR0FBRztZQUNKLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUMsTUFBTTtRQUNWLEtBQUssZ0JBQWdCO1lBQ2pCLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3hDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ25DLE1BQU07UUFDVixLQUFLLEdBQUc7WUFDSixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztZQUN4QyxNQUFNLENBQUMsUUFBUSxHQUFDLElBQUksQ0FBQyxRQUFRLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxRQUFRLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQyxRQUFRLENBQUM7WUFDM0QsTUFBTTtRQUNWLEtBQUssT0FBTztZQUNSLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxRQUFRLEdBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFDLFFBQVEsQ0FBQztZQUMzRCxNQUFNO1FBQ1YsS0FBSyxPQUFPO1lBQ1IsTUFBTSxDQUFDLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxRCxNQUFNO1FBQ1YsS0FBSyxLQUFLO1lBQ04sTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3ZELE1BQU07UUFDVixLQUFLLEtBQUs7WUFDTixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUE7WUFDdEQsTUFBTTtRQUNWLEtBQUssS0FBSztZQUNOLElBQUksS0FBSyxJQUFFLEVBQUUsRUFBQyxDQUFDO2dCQUFBLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztZQUFBLENBQUM7WUFDL0QsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RCxNQUFNO1FBQ1YsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFFBQVE7WUFDVCxNQUFNLENBQUMsS0FBSyxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDeEQsTUFBTTtRQUNWLEtBQUssTUFBTSxDQUFDO1FBQ1osS0FBSyxRQUFRO1lBQ1QsTUFBTSxDQUFDLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3hELE1BQU07UUFDVixLQUFLLE1BQU0sQ0FBQztRQUNaLEtBQUssUUFBUTtZQUNULE1BQU0sQ0FBQyxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN4RCxNQUFNO1FBQ1Y7WUFDSSxNQUFNLElBQUksS0FBSyxDQUFDLHNEQUFzRCxHQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNsRyxDQUFDO0lBRUQsU0FBUyw0QkFBNEIsQ0FBQyxJQUFpRCxFQUFFLEtBQWtELEVBQUUsTUFBYTtRQUN0SixJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN0RTs7OztnQkFJSTtZQUNKLE1BQU0sSUFBSSxLQUFLLENBQUMsMEVBQTBFLENBQUMsQ0FBQTtRQUMvRixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFBLFFBQVEsQ0FBQSxDQUFDLENBQUEsU0FBUyxDQUFDO1FBRXZELElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDN0MsR0FBRyxHQUFDLElBQUksQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLFFBQVEsSUFBRSxHQUFHLEtBQUcsQ0FBQyxJQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUEsR0FBRyxDQUFDO1FBQzFFLGdDQUFnQztRQUdoQyw2Q0FBNkM7UUFDN0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDbEMsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDcEMsTUFBTSxLQUFLLEdBQUcsU0FBUyxHQUFHLFVBQVUsQ0FBQztRQUNyQywwREFBMEQ7UUFDMUQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDekIsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUN6QixDQUFDO0lBQ0wsQ0FBQztJQUlELFNBQVMsY0FBYyxDQUFDLElBQVMsRUFBQyxLQUFVLEVBQUMsTUFBYTtRQUN0RCxJQUFJLE9BQU8sR0FBQyxFQUFDLEdBQUcsRUFBQyxJQUFJLEVBQUMsR0FBRyxFQUFDLElBQUksRUFBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBQyxDQUFDO1lBQ2pDLE9BQVE7UUFDWixDQUFDO1FBQ0QsSUFBSSxRQUFRLENBQUMsUUFBUSxLQUFHLEdBQUcsRUFBQyxDQUFDO1lBQUEsT0FBTyw0QkFBNEIsQ0FBQyxJQUFJLEVBQUMsS0FBSyxFQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQUEsQ0FBQztRQUNwRiwyQ0FBMkM7UUFDM0MsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFHLEtBQUssQ0FBQyxRQUFRLEVBQUMsQ0FBQztZQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7UUFDbEUsQ0FBQztRQUNELHVCQUF1QjtRQUN2QiwwQkFBMEI7UUFFMUI7Ozs7VUFJRTtJQUNOLENBQUM7SUFHRCxPQUFPLE1BQU0sQ0FBQztBQUNsQixDQUFDO0FBTUQsU0FBUyxpQkFBaUIsQ0FBQyxNQUFXLEVBQUMsY0FBbUI7QUFFMUQsQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQUMsTUFBVyxFQUFDLFdBQWtCO0lBQ3pELE1BQU0sS0FBSyxHQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUNuQyxNQUFNLFFBQVEsR0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQVUsRUFBRSxHQUFXLEVBQUMsRUFBRSxDQUFBLEdBQUcsR0FBQyxLQUFLLENBQUMsQ0FBQTtJQUN2RSxNQUFNLElBQUksR0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBO0lBQzdFLFFBQVEsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDO0lBQ2pCLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxHQUFDLENBQUMsRUFBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBQyxLQUFLLEdBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQyxDQUFBO0FBQ2xFLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxTQUFjLEVBQUMsV0FBa0I7SUFDbEQsK0dBQStHO0FBQ2xILENBQUM7QUFDRCxTQUFTLFNBQVMsQ0FBQyxNQUFhO0lBQzVCLElBQUksTUFBTSxDQUFDLE1BQU0sSUFBRSxDQUFDLEVBQUMsQ0FBQztRQUFBLE9BQU8sTUFBTSxDQUFBO0lBQUEsQ0FBQztJQUNwQyxJQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsU0FBUyxHQUFDLEVBQUUsQ0FBQztJQUNyQixPQUFPLENBQUMsSUFBRSxHQUFHLElBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsRUFDaEcsQ0FBQztRQUNHLENBQUMsRUFBRSxDQUFDO1FBQ0osSUFBSSxPQUFPLEdBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQXlCLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDakYsSUFBSSxjQUFjLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQXdCLEVBQUUsRUFBRSxDQUFDLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDMUgsSUFBSSxjQUFjLEtBQUcsQ0FBQyxDQUFDLEVBQUMsQ0FBQztZQUFBLE9BQU8sTUFBTSxDQUFDO1FBQUEsQ0FBQztRQUV4QyxJQUFJLFlBQVksR0FBQyxFQUFDLElBQUksRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxFQUFHLEtBQUssRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsS0FBSyxFQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxFQUFDLENBQUE7UUFFckssSUFBSSxXQUFXLEdBQUcsTUFBTTthQUN2QixHQUFHLENBQUMsQ0FBQyxLQUFVLEVBQUUsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQzFELE1BQU0sQ0FBQyxDQUFDLElBQWdDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7YUFDakYsTUFBTSxDQUFDLENBQUMsR0FBVyxFQUFFLElBQXlFLEVBQUUsRUFBRTtZQUNuRyxJQUFJLFVBQVUsR0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZELElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFDLENBQUM7Z0JBQUEsVUFBVSxJQUFFLENBQUMsQ0FBQyxDQUFBO1lBQUEsQ0FBQztZQUN4RCxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxDQUFDO1FBQzdDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVOLFNBQVMsQ0FBQyxJQUFJLENBQUM7WUFDWCxHQUFHLFlBQVk7WUFDZixLQUFLLEVBQUUsV0FBVztTQUNyQixDQUFDLENBQUM7UUFFSCxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUMzQixLQUFLLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJO1lBQzFDLENBQUMsS0FBSyxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxLQUFLLFlBQVksQ0FBQyxRQUFRLENBQUM7WUFDNUQsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxHQUFHLEtBQUssWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUNoRCxDQUFDO0lBQ04sQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ3JCLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLE1BQWMsRUFBRSxhQUEyRztJQUN0SixJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUM7UUFBRSxPQUFPLE1BQU0sQ0FBQztJQUU3QyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQXFCLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUM7SUFDekYsSUFBSSxPQUFPLEtBQUssQ0FBQyxDQUFDO1FBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO0lBRTVFLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxDQUFDLHNDQUFzQztJQUNyRSxNQUFNLG9CQUFvQixHQUFHLE1BQU0sQ0FBQyxNQUFNO1NBQ3JDLEdBQUcsQ0FBQyxDQUFDLENBQWdDLEVBQUUsR0FBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssYUFBYSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsUUFBUSxLQUFLLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDdkksTUFBTSxDQUFDLENBQUMsR0FBZ0IsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQyxDQUFDO0lBRWhELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxNQUFNO1NBQzdCLEdBQUcsQ0FBQyxDQUFDLENBQU0sRUFBRSxHQUFRLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUNoRyxNQUFNLENBQUMsQ0FBQyxHQUFnQixFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssSUFBSSxDQUFDLENBQUM7SUFFaEQsZUFBZTtJQUNmLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBeUIsRUFBRSxDQUFTLEVBQUUsRUFBRTtRQUMzRCxJQUFJLENBQUMsZUFBZSxDQUFBLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzNFLEtBQUssQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDdEIsQ0FBQzthQUFNLElBQUksQ0FBQyxlQUFlLENBQUEsQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUMxRixLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3RCLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILGlCQUFpQjtJQUNqQixNQUFNLEtBQUssR0FBVSxFQUFFLENBQUM7SUFDeEIsTUFBTSxLQUFLLEdBQVUsRUFBRSxDQUFDO0lBQ3hCLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBVSxFQUFFLENBQU0sRUFBRSxFQUFFO1FBQ3pDLElBQUksb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEQsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDcEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLENBQUMsTUFBTSxHQUFHLGVBQWU7UUFDM0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFDdkQsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLE1BQWE7SUFDbEMsU0FBUyxpQkFBaUIsQ0FBQyxLQUFhLEVBQUUsR0FBVyxFQUFFLE1BQVcsRUFBRSxjQUFvQixFQUFFLEtBQVc7UUFDakcsT0FBTyxLQUFLLEdBQUcsR0FBRyxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDMUMsSUFBSSxLQUFLLENBQUM7WUFFVixJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNSLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFvQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQy9JLENBQUM7aUJBQU0sQ0FBQztnQkFDSixLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBd0IsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsQ0FBQztZQUN4RyxDQUFDO1lBRUQsSUFBSSxLQUFLLEtBQUssQ0FBQyxDQUFDO2dCQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFFNUIsS0FBSyxJQUFJLEtBQUssQ0FBQztZQUVmLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNwQyxPQUFPLEtBQUssQ0FBQztZQUNqQixDQUFDO1lBQ0QsSUFBSSxLQUFLLEdBQUcsQ0FBQyxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN6QyxJQUFJLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3BELE9BQU8sS0FBSyxDQUFDO2dCQUNqQixDQUFDO1lBQ0wsQ0FBQztZQUNELEtBQUssR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLENBQUM7UUFDRCxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2QsQ0FBQztJQUVELElBQUksS0FBSyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDO0lBQ3ZDLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQztJQUNyQixJQUFJLFVBQVUsR0FBVSxFQUFFLENBQUM7SUFDM0IsSUFBSSxhQUFhLEdBQUcsS0FBSyxDQUFDO0lBQzFCLE9BQU8sQ0FBQyxhQUFhLElBQUUsQ0FBQyxHQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzNCLGlDQUFpQztRQUNqQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3JDLENBQUMsRUFBRSxDQUFDO1lBQ0osSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hFLFNBQVMsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzdDLENBQUM7WUFDRCxJQUFJLFNBQVMsS0FBRyxJQUFJLElBQUUsQ0FBQyxLQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDeEMsQ0FBQyxLQUFLLEVBQUMsR0FBRyxDQUFDLEdBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtnQkFDNUMsTUFBTTtZQUNWLENBQUM7UUFDTCxDQUFDO1FBRUQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2IsS0FBSyxHQUFHLENBQUMsQ0FBQztZQUNWLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1lBQ3BCLE1BQU07UUFDVixDQUFDO1FBQ0QsYUFBYSxHQUFHLGlCQUFpQixDQUFDLEtBQUssRUFBQyxHQUFHLEVBQUMsTUFBTSxDQUFDLEtBQUcsQ0FBQyxDQUFDLENBQUM7UUFFekQsaUVBQWlFO1FBQ2pFLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNqQixVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM5QixTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ3JCLENBQUM7SUFDTCxDQUFDO0lBQ0QsSUFBSSxDQUFDLElBQUUsR0FBRyxFQUFDLENBQUM7UUFBQSxNQUFNLElBQUksS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7SUFBQSxDQUFDO0lBRTlFLEtBQUssSUFBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsSUFBRSxDQUFDLEVBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQztRQUNuQixJQUFJLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUcsR0FBRyxFQUFDLE1BQU0sRUFBRSw2QkFBNkIsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM1RixJQUFHLFFBQVEsS0FBRyxDQUFDLENBQUM7WUFBQyxPQUFPLFFBQVEsQ0FBQTtJQUNwQyxDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUE7QUFDZixDQUFDO0FBR0QsTUFBTSxPQUFPLFFBQVE7SUFDakIsUUFBUSxDQUFTO0lBQ2pCLEtBQUssQ0FBUztJQUNkLFVBQVUsQ0FBUztJQUNuQixXQUFXLENBQVM7SUFDcEIsSUFBSSxDQUFNO0lBQ1YsS0FBSyxDQUFNO0lBQ1gsWUFBWSxNQUFhLEVBQUUsS0FBYztRQUNyQyxJQUFHLEtBQUs7WUFDUixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDN0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUN6QixDQUFDO0lBQ0QsUUFBUSxDQUFDLE1BQWE7UUFDbEIsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxFQUFHLElBQUksQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQTtRQUNsRSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN6RCxPQUFPO1FBQ1gsQ0FBQztRQUNELElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFBQSxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUE7UUFDMUYsUUFBUSxJQUFJLEVBQUUsQ0FBQztZQUNYLEtBQUssMkJBQTJCLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQzVELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBQyxNQUFNLENBQUMsQ0FBQztnQkFDMUQsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUM1RCxNQUFNO1lBQ1YsS0FBSywyQkFBMkIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztnQkFDN0QsSUFBSSxDQUFDLElBQUksR0FBRyxFQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFDLENBQUM7Z0JBQ3BDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBQyxPQUFPLENBQUMsQ0FBQztnQkFDNUQsTUFBTTtZQUNWLEtBQUssMkJBQTJCLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQ25FLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBQyxPQUFPLENBQUMsQ0FBQztnQkFDM0QsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDdEMsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxHQUFDLENBQUMsRUFBQyxPQUFPLENBQUMsQ0FBQztnQkFDbkUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFDakMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztnQkFDaEQsTUFBTTtZQUNWO2dCQUNJLE1BQU0sSUFBSSxLQUFLLENBQUMsWUFBWSxJQUFJLENBQUMsUUFBUSxzREFBc0QsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7UUFDRCw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLFdBQVcsR0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUM1RixDQUFDO0lBQ0QsYUFBYSxDQUFDLE1BQWEsRUFBRSxLQUFjLEVBQUUsU0FBaUI7UUFDMUQsSUFBSSxTQUFTLEdBQUMsS0FBSyxDQUFBO1FBQ25CLElBQUksTUFBTSxDQUFDO1FBQ1gsSUFBSSxTQUFTLEdBQUMsS0FBSyxDQUFDO1FBQ3BCLE1BQU0sTUFBTSxHQUFHLFNBQVMsS0FBSyxNQUFNLENBQUM7UUFDcEMsTUFBTSxhQUFhLEdBQUksTUFBTSxDQUFBLENBQUMsQ0FBQSxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxNQUFNLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksS0FBSyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDcEcsTUFBTSxJQUFJLEtBQUssQ0FBQyxrREFBa0QsR0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsSUFBSSxNQUFNLENBQUMsS0FBSyxHQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUMvQyxNQUFNLFVBQVUsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNsRSxTQUFTLEdBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQztZQUMzRCxNQUFNLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQzthQUFNLENBQUM7WUFDSixTQUFTLEdBQUMsS0FBSyxHQUFDLGFBQWEsQ0FBQztZQUM5QixNQUFNLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNCLFNBQVMsSUFBRSxNQUFNLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFBO1FBQ3pCLENBQUM7UUFDRCxvREFBb0Q7UUFFcEQsSUFBSSxDQUFDLFNBQVMsSUFBRSxNQUFNLENBQUMsS0FBSyxHQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUMsQ0FBQztZQUMxRCwrRUFBK0U7UUFDbkYsQ0FBQztRQUNELElBQUksTUFBTSxFQUFFLE1BQU0sS0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLDhEQUE4RCxTQUFTLGlCQUFpQixNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUUsQ0FBQztRQUNySSxDQUFDO1FBRUQsNEZBQTRGO1FBQzVGLHFCQUFxQjtRQUVyQixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUcsQ0FBQyxFQUFDLENBQUM7WUFDbkIsTUFBTSxHQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUF1QixFQUFFLEVBQUUsQ0FBQyxpQ0FBaUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUE7UUFDdEcsQ0FBQzthQUFLLElBQUcsTUFBTSxDQUFDLE1BQU0sR0FBQyxDQUFDO1lBQUMsU0FBUyxHQUFDLElBQUksQ0FBQTtRQUV2QyxPQUFPO1lBQ0gsTUFBTSxFQUFFLE1BQU07WUFDZCxTQUFTLEVBQUUsU0FBUztZQUNwQixTQUFTLEVBQUUsU0FBUztTQUN2QixDQUFDO0lBQ04sQ0FBQztJQUNELGNBQWM7UUFDVixPQUFPLENBQUMsQ0FBQywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsSUFBRSxJQUFJLENBQUMsUUFBUSxLQUFHLGdCQUFnQixDQUFDO0lBQzFKLENBQUM7SUFDRCxTQUFTO1FBQ0wsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBb0IsRUFBQyxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxVQUFVLElBQUUsQ0FBQyxDQUFDLElBQUksS0FBRyxlQUFlLENBQUMsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQTtJQUNySyxDQUFDO0lBQ0QsVUFBVTtRQUNOLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQW9CLEVBQUMsRUFBRSxDQUFBLENBQUMsQ0FBQyxJQUFJLEtBQUcsVUFBVSxJQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUcsZUFBZSxDQUFDLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUE7SUFDeEssQ0FBQztJQUNELFNBQVM7UUFDTCxPQUFPLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFBO0lBQ2pGLENBQUM7Q0FDSjtBQUVELE1BQU0sZUFBZTtJQUNqQixRQUFRLENBQVM7SUFDakIsUUFBUSxDQUFTO0lBQ2pCLG1CQUFtQixDQUFTO0lBQzVCLE1BQU0sQ0FBWTtJQUNsQixNQUFNLENBQWE7SUFDbkIsUUFBUSxDQUFZO0lBQ3BCLFlBQVksUUFBaUIsRUFBQyxRQUFpQixFQUFDLG1CQUE0QixFQUFDLE1BQWtCLEVBQUMsTUFBa0I7UUFDOUcsSUFBSSxRQUFRO1lBQUMsSUFBSSxDQUFDLFFBQVEsR0FBQyxRQUFRLENBQUE7UUFDbkMsSUFBSSxRQUFRO1lBQUMsSUFBSSxDQUFDLFFBQVEsR0FBQyxRQUFRLENBQUE7UUFDbkMsSUFBSSxtQkFBbUI7WUFBQyxJQUFJLENBQUMsbUJBQW1CLEdBQUMsbUJBQW1CLENBQUE7UUFDcEUsSUFBSSxNQUFNO1lBQUMsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUE7UUFDN0IsSUFBSSxNQUFNO1lBQUMsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUE7SUFDakMsQ0FBQztJQUNELFNBQVMsQ0FBQyxLQUFnQixJQUFFLElBQUksQ0FBQyxNQUFNLEdBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQztJQUM5QyxTQUFTLENBQUMsS0FBZ0IsSUFBRSxJQUFJLENBQUMsTUFBTSxHQUFDLEtBQUssQ0FBQSxDQUFBLENBQUM7Q0FDakQ7QUFFRCxNQUFNLFNBQVM7SUFDWCxVQUFVLENBQVU7SUFDcEIsWUFBWSxDQUFVO0lBQ3RCLFFBQVEsQ0FBVTtJQUNsQixZQUFZLENBQVU7SUFDdEIsVUFBVSxDQUFVO0lBQ3BCLFVBQVUsR0FBVSxJQUFJLENBQUM7SUFDakIsS0FBSyxDQUFVO0lBQ3ZCO0lBRUEsQ0FBQztJQUNELFFBQVEsQ0FBQyxLQUFjO1FBQ25CLElBQUksQ0FBQyxLQUFLLEdBQUMsS0FBSyxDQUFBO0lBQ3BCLENBQUM7SUFDRCxXQUFXO1FBQ1AsSUFBSSxDQUFDLFFBQVEsR0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBRyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLFVBQVUsR0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7SUFFcEQsQ0FBQztDQUNKO0FBRUQsU0FBUyxhQUFhLENBQUMsUUFBeUI7SUFDNUMsUUFBUSxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDeEIsS0FBSyxLQUFLO1lBQ04sK0VBQStFO1lBQy9FLGtCQUFrQjtZQUNsQixNQUFNO1FBQ1Y7WUFDSSxNQUFNLElBQUksS0FBSyxDQUFDLHNEQUFzRCxHQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNsRyxDQUFDO0lBRUQsU0FBUyw0QkFBNEIsQ0FBQyxJQUFpRCxFQUFFLEtBQWtELEVBQUUsTUFBYTtRQUN0SixJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN0RTs7OztnQkFJSTtZQUNKLE1BQU0sSUFBSSxLQUFLLENBQUMsMEVBQTBFLENBQUMsQ0FBQTtRQUMvRixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFBLFFBQVEsQ0FBQSxDQUFDLENBQUEsU0FBUyxDQUFDO1FBRXZELElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDN0MsR0FBRyxHQUFDLElBQUksQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLFFBQVEsSUFBRSxHQUFHLEtBQUcsQ0FBQyxJQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUEsR0FBRyxDQUFDO1FBQzFFLGdDQUFnQztRQUdoQyw2Q0FBNkM7UUFDN0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDbEMsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDcEMsTUFBTSxLQUFLLEdBQUcsU0FBUyxHQUFHLFVBQVUsQ0FBQztRQUNyQywwREFBMEQ7UUFDMUQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDekIsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUN6QixDQUFDO0lBQ0wsQ0FBQztJQUlELFNBQVMsY0FBYyxDQUFDLElBQVMsRUFBQyxLQUFVLEVBQUMsTUFBYTtRQUN0RCxJQUFJLE9BQU8sR0FBQyxFQUFDLEdBQUcsRUFBQyxJQUFJLEVBQUMsR0FBRyxFQUFDLElBQUksRUFBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBQyxDQUFDO1lBQ2pDLE9BQVE7UUFDWixDQUFDO1FBQ0Qsc0ZBQXNGO1FBQ3RGLDJDQUEyQztRQUMzQyxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUcsS0FBSyxDQUFDLFFBQVEsRUFBQyxDQUFDO1lBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMsNENBQTRDLENBQUMsQ0FBQztRQUNsRSxDQUFDO1FBQ0QsdUJBQXVCO1FBQ3ZCLDBCQUEwQjtRQUUxQjs7OztVQUlFO0lBQ04sQ0FBQztJQUdELGdCQUFnQjtBQUNwQixDQUFDO0FBRUQsTUFBTSxPQUFPLFdBQVc7SUFDcEIsS0FBSyxHQUFDLEVBQUUsQ0FBQztJQUNULE1BQU0sQ0FBUztJQUNmLFFBQVEsR0FBQyxFQUFFLENBQUM7SUFDWixRQUFRLEdBQUMsSUFBSSxRQUFRLEVBQUUsQ0FBQztJQUN4QixDQUFDLEdBQUMsQ0FBQyxDQUFDO0lBQ0osWUFBWSxLQUFhO1FBQ3JCLElBQUksQ0FBQyxLQUFLLEdBQUMsS0FBSyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsTUFBTSxHQUFDLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVuQyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdkMsTUFBTSxDQUFDLEdBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQTtRQUN2QixDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDakMsTUFBTSxDQUFDLEdBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQTtRQUM3QixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ2QsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFJZCxJQUFJLENBQUMsWUFBWSxDQUFDLHVCQUF1QixFQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDN0QsSUFBSSxDQUFDLEtBQUssR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFBO1FBQ3BDLElBQUksQ0FBQyxRQUFRLEdBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3BDLENBQUM7SUFDRCxpQkFBaUI7UUFDYixJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ3RDLGlFQUFpRTtRQUNqRSxJQUFJLENBQUMsTUFBTSxDQUFDLDBCQUEwQixFQUFFLENBQUM7SUFDN0MsQ0FBQztJQUNELFVBQVU7UUFHTjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7c0dBZ0M4RjtJQUNsRyxDQUFDO0lBRUQsUUFBUSxDQUFDLFFBQWtCO1FBQ3ZCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQixJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUMsTUFBTSxDQUFDLENBQUE7UUFDM0MsTUFBTSxDQUFDLFNBQVMsRUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDckcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFDLE1BQU0sRUFBQyxNQUFNLENBQUMsQ0FBQTtRQUNqRCxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFDLFFBQVEsRUFBQyxNQUFNLENBQUMsQ0FBQTtRQUN0RCxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ2pELE9BQU8sSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFBO0lBQzVCLENBQUM7SUFFRCxjQUFjO1FBQ1Y7Ozs7O2tDQUswQjtJQUM5QixDQUFDO0lBRUQsU0FBUyxDQUFDLGNBQThCO1FBQ3BDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUMsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDekUsT0FBTyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUE7UUFDeEIsNEJBQTRCO1FBQzVCLGdCQUFnQjtJQUNwQixDQUFDO0lBRUQsWUFBWTtRQUNSLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQzVDLE1BQU0sWUFBWSxHQUFDLENBQUMsSUFBWSxFQUFDLEVBQUUsQ0FBQSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUF3QixFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO1FBQ2hILE1BQU0sQ0FBQyxXQUFXLEVBQUMsYUFBYSxFQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxFQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsRUFBQyxZQUFZLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQTtRQUM1SCxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsRUFBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ2xFLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBRyxDQUFDLElBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBRyxDQUFDLEVBQzVDLENBQUM7WUFDRyxPQUFPLElBQUksQ0FDUCxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFJLENBQUMsRUFDdkIsYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssR0FBRyxDQUFDLEVBQzNCLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxFQUM3QixRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUN2QixDQUFDO1FBQ04sQ0FBQztJQUNULENBQUM7SUFDRCxZQUFZLENBQUMsR0FBVyxFQUFDLEtBQXFDO1FBQzFELElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBQyxLQUFLLENBQUMsQ0FBQTtJQUN6QyxDQUFDO0lBQ0QsWUFBWTtRQUNSLElBQUksQ0FBQyxLQUFLLEdBQUMsSUFBSSxDQUFDLEtBQUs7YUFDcEIsT0FBTyxDQUFDLDJCQUEyQixFQUFFLEVBQUUsQ0FBQzthQUN4QyxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQzthQUNsQixPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFBO1FBQ25CLHlHQUF5RztJQUM3RyxDQUFDO0lBQ0QsV0FBVztRQUNQLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQTtJQUNwQyxDQUFDO0NBQ0o7QUFFRCxNQUFNLGFBQWE7Q0FFbEI7QUFLRCxNQUFNLE1BQU07SUFDUixNQUFNLEdBQU0sRUFBRSxDQUFDO0lBQ2YsaUJBQWlCLENBQWtCO0lBRW5DLFlBQVksSUFBWTtRQUNwQixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFDRCxRQUFRLENBQUMsSUFBWTtRQUNqQixpREFBaUQ7UUFDakQsa0RBQWtEO1FBQ2xELE1BQU0sU0FBUyxHQUFDLGdCQUFnQixDQUFDLHVCQUF1QixFQUFFLENBQUMsQ0FBQTtRQUMzRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ25DLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUN6RCxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDVixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFLLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25ELENBQUMsSUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQztnQkFDckIsU0FBUztZQUNiLENBQUM7WUFDRCxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQSxnQkFBZ0I7WUFDMUQsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUNYLENBQUM7Z0JBQUcsQ0FBQyxJQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFBO2dCQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlELFNBQVM7WUFDYixDQUFDO1lBQ0QsS0FBSyxHQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUE7WUFDMUQsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1YsQ0FBQyxJQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFBO2dCQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLGlCQUFpQixDQUFDLENBQUMsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO2dCQUNuRCw0RkFBNEY7Z0JBQzVGLFNBQVM7WUFDYixDQUFDO1lBRUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVELGFBQWEsQ0FBQyxLQUFhLEVBQUMsTUFBZTtRQUN2QyxNQUFNLEdBQUMsTUFBTSxJQUFFLENBQUMsQ0FBQztRQUNqQixPQUFPLEtBQUssSUFBRSxDQUFDLEdBQUMsTUFBTSxJQUFFLEtBQUssR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDNUQsQ0FBQztJQUNELHlCQUF5QjtRQUNyQixNQUFNLGVBQWUsR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFFO1lBQ3RDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUM3QyxNQUFNLEdBQUcsR0FBQyxjQUFjLENBQUMsSUFBSSxFQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssS0FBRyxHQUFHLElBQUUsQ0FBQyxHQUFHLEtBQUcsQ0FBQyxJQUFFLENBQUMsMkJBQTJCLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFekksQ0FBQyxDQUFDO1FBQ0YsTUFBTSxLQUFLLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtZQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUM7Z0JBQUUsT0FBTyxLQUFLLENBQUM7WUFDN0MsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzdDLENBQUMsQ0FBQztRQUVGLDhDQUE4QztRQUM5QyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTTthQUNsQixHQUFHLENBQUMsQ0FBQyxLQUF5QixFQUFFLEtBQWEsRUFBRSxFQUFFO1lBQzlDLElBQUksS0FBSyxDQUFDLEtBQUssS0FBSyxHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNsRSxPQUFPLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQzNDLENBQUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUM3QixPQUFPLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUMsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDckUsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUMsQ0FBQzthQUNELE1BQU0sQ0FBQyxDQUFDLElBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO1FBQzNDLE9BQU8sR0FBRyxDQUFBO0lBQ2QsQ0FBQztJQUVELGlCQUFpQjtRQUNiLE1BQU0sR0FBRyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBeUIsRUFBQyxLQUFVLEVBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEtBQUcsTUFBTSxJQUFFLEtBQUssQ0FBQyxLQUFLLEtBQUcsT0FBTyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQVcsRUFBQyxFQUFFLENBQUMsS0FBSyxLQUFHLElBQUksQ0FBQyxDQUFBO1FBRS9KLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtZQUN2QixLQUFLLEdBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUMsQ0FBQyxDQUFDLElBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUcsVUFBVSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQztRQUNqSSxDQUFDLENBQUMsQ0FBQztRQUVILEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFhLEVBQUUsRUFBRTtZQUNwQyxNQUFNLEtBQUssR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssS0FBRyxNQUFNLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFFLEtBQUssQ0FBQztZQUNsQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUMsQ0FBQyxDQUFDLENBQUE7UUFDL0IsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsaUJBQWlCO1FBQ2I7O1VBRUU7UUFFRixhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzNCLE1BQU0sR0FBRyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBd0IsRUFBQyxLQUFVLEVBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUE7UUFDMUksTUFBTSxHQUFHLEdBQUMsd0JBQXdCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsSUFBSSxVQUFVLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFtQixFQUFDLEVBQUU7WUFDbEQsSUFBRyxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUcsUUFBUTtnQkFDeEIsT0FBTyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQTtZQUN6Qyw2REFBNkQ7WUFDaEUsT0FBTyxDQUFDLENBQUM7UUFDVCxDQUFDLENBQUMsQ0FBQztRQUNILGdFQUFnRTtRQUNoRSx1REFBdUQ7UUFDdkQsTUFBTSxHQUFHLEdBQUMsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUE7UUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUloQixJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFFekIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUd4QixNQUFNLFFBQVEsR0FBQyxJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQTtRQUMvQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQzthQUM3QyxPQUFPLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtZQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUssaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM5RCxDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBeUIsRUFBQyxLQUFVLEVBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEtBQUcsS0FBSyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFBO1FBQzNJLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDbkIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQXlCLEVBQUUsRUFBRTtZQUN6Qyx5Q0FBeUM7WUFDekMsdUdBQXVHO1lBQ3hHLG9EQUFvRDtRQUN2RCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCxlQUFlO1FBQ1gsT0FBTyxJQUFJLENBQUMsTUFBTTthQUNqQixHQUFHLENBQUMsQ0FBQyxLQUF5QixFQUFFLEtBQVUsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQzthQUM3RyxNQUFNLENBQUMsQ0FBQyxJQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQTtJQUMxQyxDQUFDO0lBRUQsNEJBQTRCO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLGVBQWUsRUFBRTthQUN4QixNQUFNLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRTtZQUNsQixNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDO1lBQ3BELElBQUksU0FBUyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNoQixJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUM1RCxPQUFPLEtBQUssQ0FBQztnQkFDakIsQ0FBQztZQUNMLENBQUM7WUFDRCxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDdEMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsRUFBRSxZQUFZLEVBQUUsRUFBRSxDQUFDO29CQUM5QyxPQUFPLEtBQUssQ0FBQztnQkFDakIsQ0FBQztZQUNMLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQ7Ozs7OztRQU1JO0lBRUosbUJBQW1CO1FBQ2YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtZQUMvQixJQUFJLENBQUMsQ0FBQyxLQUFLLFlBQVksS0FBSyxDQUFDLEVBQUMsQ0FBQztnQkFDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQTtZQUNuQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFNLEVBQUUsR0FBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMxRSwwREFBMEQ7UUFDMUQsTUFBTSxLQUFLLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtZQUM1QixPQUFPLENBQ0gsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLEVBQUU7Z0JBQ3BELENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxFQUFFLENBQ3ZELENBQUM7UUFDTixDQUFDLENBQUM7UUFFRixNQUFNLE1BQU0sR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQXdCLEVBQUMsS0FBVSxFQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFHLFFBQVEsSUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUE7UUFDMUosTUFBTSxNQUFNLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUF3QixFQUFDLEtBQVUsRUFBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksS0FBRyxVQUFVLElBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFBO1FBRTVKLE1BQU0sR0FBRyxHQUFHO1lBQ1IsR0FBRyx3QkFBd0IsQ0FBQyxNQUFNLENBQUM7WUFDbkMsR0FBRyx3QkFBd0IsQ0FBQyxNQUFNLENBQUM7U0FDdEMsQ0FBQztRQUNGLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUUzQixhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQzlCLENBQUM7SUFHRCxpQkFBaUIsQ0FBQyxHQUFVO1FBQ3hCLE1BQU0sT0FBTyxHQUFLLEVBQUUsQ0FBQTtRQUVwQixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUN6QyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFBO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQXNDLEVBQUUsRUFBRTtZQUN2RCxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbkQsTUFBTSxLQUFLLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBQyxLQUFLLENBQUMsR0FBRyxHQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQVUsRUFBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN2RyxLQUFLLElBQUksQ0FBQyxHQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUMsQ0FBQyxFQUFDLENBQUMsSUFBRSxLQUFLLENBQUMsR0FBRyxFQUFDLENBQUMsRUFBRSxFQUFDLENBQUM7Z0JBQ3hDLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7WUFDeEMsQ0FBQztZQUVELGdEQUFnRDtZQUNoRCxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzVELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9ELENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELDBCQUEwQjtRQUN0QixJQUNJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztlQUN2QixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7ZUFDdEUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLEVBRXRELENBQUM7WUFBQSxPQUFPLFFBQVEsQ0FBQTtRQUFBLENBQUM7SUFDckIsQ0FBQztJQUVELFlBQVksQ0FBQyxLQUFVLEVBQUUsTUFBYyxFQUFFLE9BQXNCO1FBQzNELE9BQU8sR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLENBQUMsS0FBSyxDQUFDLGtEQUFrRCxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzNFLE9BQU87UUFDWCxDQUFDO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxXQUFXLENBQUMsTUFBWTtRQUNwQixJQUFJLENBQUMsTUFBTSxFQUFDLENBQUM7WUFBQSxNQUFNLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUFBLENBQUM7UUFDakMsTUFBTSxjQUFjLEdBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25ELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNyRyxJQUFJLElBQUksR0FBRyxFQUFFLENBQUM7UUFDZCxLQUFLLElBQUksQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsTUFBTSxDQUFDLE1BQU0sRUFBQyxDQUFDLEVBQUUsRUFBQyxDQUFDO1lBQzlCLElBQUksSUFBSSxDQUFDO1lBQ1QsSUFBSSxJQUFFLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFBLEdBQUcsQ0FBQSxDQUFDLENBQUEsRUFBRSxDQUFDO1lBQ3hDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssS0FBRyxHQUFHLElBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQyxLQUFtQixFQUFFLEtBQWEsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFFLE1BQU0sQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUcsR0FBRyxFQUMxSixDQUFDO2dCQUNHLElBQUksSUFBRSxRQUFRLENBQUM7WUFDbkIsQ0FBQztZQUNELFFBQVEsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBQyxDQUFDO2dCQUNyQixLQUFLLFFBQVEsQ0FBQztnQkFDZCxLQUFLLFVBQVUsQ0FBQztnQkFDaEIsS0FBSyxlQUFlLENBQUM7Z0JBQ3JCLEtBQUssVUFBVTtvQkFDWCxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsWUFBWSxLQUFLO3dCQUMxQixJQUFJLElBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLGFBQWEsRUFBRSxDQUFBO29CQUNwQyx1Q0FBdUM7b0JBQ3ZDLDBFQUEwRTtvQkFDMUUsTUFBTTtnQkFDVixLQUFLLE9BQU87b0JBQ1IsSUFBSSxJQUFFLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFBLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7b0JBQzFHLE1BQU07Z0JBQ1Y7b0JBQ0ksT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUE7b0JBQzFCLE1BQU0sSUFBSSxLQUFLLENBQUMsb0RBQW9ELE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQy9GLENBQUM7UUFDTCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUE7SUFDZixDQUFDO0lBRUQsZUFBZSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTTtRQUNoQyxNQUFNLGFBQWEsR0FBRyxDQUFDLEdBQUcscUJBQXFCLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sWUFBWSxHQUFHLENBQUMsR0FBRyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxHQUFHLHFCQUFxQixDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDdEUsTUFBTSxHQUFHLEdBQTBDLEVBQUUsQ0FBQztRQUV0RCxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBeUIsRUFBRSxLQUFhLEVBQUUsRUFBRTtZQUN4RCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQztZQUMzQyxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQztZQUUzQyxJQUFJLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ3RCLElBQUksS0FBSyxHQUFHLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztvQkFDdkQsTUFBTSxFQUFFLEdBQUcsY0FBYyxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7b0JBQ3BELE1BQU0sRUFBRSxHQUFHLGNBQWMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7b0JBQzNELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNyQixDQUFDO3FCQUFNLElBQUksS0FBSyxHQUFHLENBQUMsSUFBSSxhQUFhLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7b0JBQ3hELEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDdkQsQ0FBQztZQUNMLENBQUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLEdBQUcsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pFLEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUN2RCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLEdBQUcsQ0FBQztJQUNmLENBQUM7SUFHRCxnQkFBZ0IsQ0FBQyxNQUFhO1FBQzFCLE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsRUFBRSxDQUFBLEtBQUssR0FBQyxDQUFDO2VBQ2xDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQUUsWUFBWSxFQUFFO2VBQ2pDLEtBQUssRUFBRSxZQUFZLEVBQUUsSUFBRSxLQUFLLENBQUMsS0FBSyxJQUFFLENBQUMsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQ3JELENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQSxFQUFFLENBQUEsSUFBSSxLQUFHLElBQUksQ0FBQyxDQUFBO0lBQy9CLENBQUM7SUFJRCxZQUFZLENBQUMsT0FBd0IsRUFBRSxLQUFvQixFQUFFLEtBQTRCLEVBQUUsU0FBZ0M7UUFDdkgsTUFBTSxXQUFXLEdBQUcsQ0FBQyxLQUFLLFlBQVksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUUsT0FBTyxDQUNILENBQUMsS0FBSyxLQUFLLElBQUksSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3BELEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxTQUFTLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FDMUMsQ0FBQztJQUNOLENBQUM7Q0FFSjtBQUtELE1BQU0sVUFBVSxZQUFZLENBQUMsR0FBUTtJQUNqQyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7SUFDaEIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRWxELE9BQU8sS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2xCLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN6QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN0QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDeEIsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RCLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDNUIsQ0FBQztBQUVELE1BQU0sT0FBTyxLQUFLO0lBQ2QsS0FBSyxDQUFVO0lBQ2YsUUFBUSxDQUFVO0lBQ2xCLFlBQVksS0FBWSxFQUFFLFFBQWlCO1FBQ3ZDLElBQUksQ0FBQyxLQUFLLEdBQUMsS0FBSyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxRQUFRLEdBQUMsUUFBUSxDQUFDO0lBQzNCLENBQUM7SUFDRCxLQUFLLEtBQUksT0FBTyxJQUFJLENBQUMsUUFBUSxLQUFHLFNBQVMsQ0FBQSxDQUFBLENBQUM7Q0FFN0M7QUFHRCxNQUFNLE9BQU8saUJBQWlCO0lBQzFCLElBQUksQ0FBUztJQUNiLEtBQUssQ0FBaUI7SUFDdEIsUUFBUSxDQUFVO0lBQ2xCLFFBQVEsQ0FBTTtJQUNkLEVBQUUsQ0FBUTtJQUVWLFlBQVksS0FBa0MsRUFBQyxRQUFjO1FBQ3pELElBQUksQ0FBQyxLQUFLLEdBQUMsS0FBSyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxRQUFRLEdBQUMsUUFBUSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNmLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFBO0lBQ2hDLENBQUM7SUFDRCxxQkFBcUI7UUFDakIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUcsUUFBUSxFQUFDLENBQUM7WUFDdEQsSUFBSSxDQUFDLEtBQUssR0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFBO1FBQ3ZELENBQUM7UUFDRiw4RkFBOEY7SUFDakcsQ0FBQztJQUNELEtBQUssS0FBRyxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFBLENBQUEsQ0FBQztJQUFBLENBQUM7SUFFM0IsY0FBYyxLQUFHLE9BQU8sT0FBTyxJQUFJLENBQUMsS0FBSyxLQUFHLFFBQVEsQ0FBQSxDQUFDLENBQUEsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQSxDQUFDLENBQUEsU0FBUyxDQUFBLENBQUEsQ0FBQztJQUV6RyxjQUFjO1FBQ1YsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsS0FBSyxRQUFRLENBQUM7WUFDZCxLQUFLLE9BQU87Z0JBQ1IsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ3JCLEtBQUssVUFBVTtnQkFDWCxPQUFPLElBQUksQ0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksQ0FBQyxLQUFLLENBQUE7WUFDbkMsS0FBSyxVQUFVO2dCQUNYLE9BQU8sSUFBSSxDQUFDLElBQUksR0FBQyxHQUFHLEdBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQTtRQUMxQyxDQUFDO0lBQ0wsQ0FBQztJQUNELFdBQVc7UUFDUCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUE7SUFDcEIsQ0FBQztJQUVELE9BQU87UUFDSCxJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBRyxRQUFRLEVBQUMsQ0FBQztZQUM5QixJQUFJLENBQUMsSUFBSSxHQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUMsQ0FBQSxPQUFPLENBQUEsQ0FBQyxDQUFBLFVBQVUsQ0FBQztZQUN0RCxPQUFPO1FBQ1gsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQSxDQUFDLENBQUEsVUFBVSxDQUFBLENBQUMsQ0FBQSxRQUFRLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBRyxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUcsT0FBTyxJQUFFLElBQUksQ0FBQyxJQUFJLEtBQUcsVUFBVSxDQUFBLENBQUEsQ0FBQztJQUU5RCxZQUFZLEtBQUcsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxJQUFJLENBQUMsSUFBSSxLQUFHLFFBQVEsQ0FBQSxDQUFBLENBQUM7SUFFbkUsYUFBYTtRQUNULElBQUksTUFBTSxHQUFDLEVBQUUsQ0FBQTtRQUNiLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNmLE1BQU0sSUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUE7UUFDakMsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVU7WUFBRSxNQUFNLElBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUE7UUFDM0QsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFHLFFBQVE7WUFBRSxNQUFNLElBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUM3QyxPQUFPLE1BQU0sQ0FBQTtJQUNqQixDQUFDO0lBQ0QscUJBQXFCLENBQUMsU0FBaUI7UUFDbkMsSUFBRyxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxJQUFJLENBQUMsS0FBSyxLQUFHLFFBQVE7WUFDNUMsT0FBTyxLQUFLLENBQUE7UUFDaEIsSUFBRyxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUcsUUFBUSxJQUFFLFNBQVMsS0FBRyxNQUFNLElBQUUsQ0FBQywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUMxRyxPQUFPLEtBQUssQ0FBQTtRQUNoQixPQUFPLElBQUksQ0FBQTtJQUNmLENBQUM7SUFDRCxnQkFBZ0I7UUFDWixPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBRSxJQUFJLEVBQUUsS0FBSyxLQUFHLENBQUMsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLEtBQUssQ0FBQSxDQUFDLENBQUEsRUFBRSxDQUFDLEdBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzNFLENBQUM7Q0FDSjtBQUVELE1BQU0sY0FBYztJQUNoQixNQUFNLENBQUE7SUFDTixRQUFRLENBQU07SUFDZCxTQUFTLENBQVE7SUFDakIsWUFBWSxNQUFXO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUMsTUFBTSxDQUFBO1FBQ2xCLElBQUksQ0FBQyxRQUFRLEdBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFBO1FBQ2hDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQTtJQUMxQixDQUFDO0lBQ0QsMkJBQTJCO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFNLEVBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUcsVUFBVSxJQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLENBQUE7SUFDdEUsQ0FBQztJQUVELHVCQUF1QjtRQUNuQixPQUFPLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBRSxJQUFJLENBQUMsMkJBQTJCLEVBQUUsSUFBRSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQTtJQUNsRyxDQUFDO0lBQ0QsU0FBUztRQUNMLGNBQWM7SUFDbEIsQ0FBQztJQUVELG1CQUFtQjtRQUNmLElBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUMsQ0FBQztZQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQTtRQUMzRSxJQUFHLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFO1lBQUMsT0FBTztRQUMxQyxNQUFNLE9BQU8sR0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN0QyxJQUFHLENBQUMsT0FBTyxFQUFDLENBQUM7WUFBQSxPQUFNO1FBQUEsQ0FBQztRQUFBLENBQUM7UUFDckIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQTtRQUM1RCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQzVELE1BQU0sWUFBWSxHQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUN4QyxJQUFJLENBQUMsQ0FBQyxLQUFLLElBQUUsQ0FBQyxLQUFLLENBQUMsSUFBRSxDQUFDLFlBQVksSUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLEdBQUMsQ0FBQyxJQUFFLEtBQUssRUFBRSxJQUFJLEdBQUMsQ0FBQyxDQUFDO1lBQUMsT0FBTztRQUMzRSxPQUFPLEVBQUMsZUFBZSxFQUFFLEtBQUssRUFBQyxlQUFlLEVBQUUsS0FBSyxFQUFDLEdBQUcsWUFBWSxFQUFDLENBQUE7SUFDMUUsQ0FBQyxDQUFBOzs7O09BSUU7SUFDSCxZQUFZO1FBQ1IsMkJBQTJCO1FBQzNCLDhEQUE4RDtRQUM5RCxJQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsTUFBTSxHQUFDLENBQUM7WUFBQyxPQUFPO1FBRW5DLE9BQU8sRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUE7SUFDdEQsQ0FBQyxDQUFBOztPQUVFO0lBQ0gsV0FBVyxDQUFDLFFBQTJCO1FBQ25DLFFBQVEsQ0FBQyxJQUFJLEdBQUMsQ0FBQyxDQUFBO0lBQ25CLENBQUM7SUFDRCxnQkFBZ0I7UUFDWixNQUFNLE9BQU8sR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQXFCLEVBQUMsR0FBUSxFQUFDLEVBQUUsQ0FBQSxDQUFDLENBQUMsS0FBSyxLQUFHLFFBQVEsQ0FBQSxDQUFDLENBQUEsR0FBRyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFPLEVBQUMsRUFBRSxDQUFBLENBQUMsS0FBRyxJQUFJLENBQUMsQ0FBQztRQUN6SCxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0QixDQUFDO0lBQ0QsV0FBVztJQUVYLENBQUM7SUFDRCxhQUFhO1FBQ1QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBQyxDQUFDLElBQUUsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQyxDQUFBO0lBQ2pFLENBQUM7SUFFRCxlQUFlO1FBQ1gsSUFBSSxDQUFDLFNBQVMsR0FBQyxFQUFFLENBQUE7UUFDakIsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEVBQUMsQ0FBQztZQUNoRCxJQUFJLEdBQUcsRUFBRSxVQUFVLENBQUMsV0FBVyxDQUFDLElBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUMsQ0FBQztnQkFDeEUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1lBQ3ZDLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztJQUVELFlBQVksS0FBRyxPQUFPLElBQUksQ0FBQyxTQUFTLEVBQUUsTUFBTSxHQUFDLENBQUMsQ0FBQSxDQUFBLENBQUM7SUFFL0MsOEJBQThCO1FBQzFCLE1BQU0sTUFBTSxHQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFDLFFBQVEsQ0FBQyxDQUFBO1FBQ25ELE9BQVEsTUFBTSxDQUFDLE9BQU8sR0FBQyxDQUFDLENBQUE7SUFDNUIsQ0FBQztJQUNELHVCQUF1QjtRQUNuQixNQUFNLE1BQU0sR0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsRUFBQyxRQUFRLENBQUMsQ0FBQTtRQUNuRCxPQUFRLE1BQU0sQ0FBQyxLQUFLLEtBQUcsQ0FBQyxJQUFFLE1BQU0sQ0FBQyxPQUFPLEtBQUcsQ0FBQyxDQUFBO0lBQ2hELENBQUM7SUFFRCxZQUFZLENBQUMsT0FBZSxFQUFFLFdBQW1CO1FBQzdDLElBQUksS0FBSyxHQUFDLENBQUMsRUFBRSxPQUFPLEdBQUMsQ0FBQyxDQUFBO1FBQ3RCLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDakQsSUFBSSxHQUFHLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQzNCLElBQUksR0FBRyxLQUFLLE9BQU8sR0FBQyxHQUFHLEdBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ2xDLEtBQUssRUFBRSxDQUFDO2dCQUNaLENBQUM7cUJBQU0sQ0FBQztvQkFDSixPQUFPLEVBQUUsQ0FBQztnQkFDZCxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUM7UUFDRCxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUM7SUFDOUMsQ0FBQztJQUNELFdBQVcsQ0FBQyxNQUFjO1FBQ3RCLElBQUcsQ0FBQyxNQUFNO1lBQUMsTUFBTSxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUE7UUFDN0IsSUFBRyxDQUFDLE1BQU07WUFBQyxPQUFPO1FBQ2xCLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNuQixzQ0FBc0M7WUFDdEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFBO1lBQ2xDLFFBQVE7WUFDUixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixNQUFNLEtBQUssR0FBRztvQkFDVixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLEtBQUssRUFBRSxDQUFDO29CQUNSLFFBQVEsRUFBRSxTQUFTO2lCQUN0QixDQUFDO2dCQUNGLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUUsQ0FBQztvQkFDNUIsS0FBSyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxDQUFDO2dCQUVELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdCLENBQUM7WUFDRCxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxRQUFRLENBQUEsQ0FBQSxnQ0FBZ0M7SUFDbkQsQ0FBQztDQUNKO0FBRUQsTUFBTSxRQUFRO0NBRWI7QUFFRCxNQUFNLFFBQVE7Q0FFYiIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi4vaW1WZXJ5TGF6eVwiO1xyXG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XHJcbmltcG9ydCB7IGNwIH0gZnJvbSBcImZzXCI7XHJcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcclxuaW1wb3J0IHsgZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHksIGdldE9wZXJhdG9yc0J5QnJhY2tldCwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgc2VhcmNoTWF0aEpheE9wZXJhdG9ycyB9IGZyb20gXCIuLi91dGlscy9kYXRhTWFuYWdlclwiO1xyXG5pbXBvcnQgeyBudW1iZXIsIHN0cmluZyB9IGZyb20gXCJ6b2RcIjtcclxuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4gfSBmcm9tIFwic3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheFwiO1xyXG5jb25zdCBncmVla0xldHRlcnMgPSBbXHJcbiAgICAnQWxwaGEnLCdhbHBoYScsICdCZXRhJywgJ0dhbW1hJywgJ0RlbHRhJywgJ0Vwc2lsb24nLCAnWmV0YScsICdFdGEnLCAnVGhldGEnLCBcclxuICAgICdJb3RhJywgJ0thcHBhJywgJ0xhbWJkYScsICdNdScsJ211JywgJ051JywgJ1hpJywgJ09taWNyb24nLCAnUGknLCAnUmhvJywgXHJcbiAgICAnU2lnbWEnLCAnVGF1JywgJ1Vwc2lsb24nLCAnUGhpJywgJ0NoaScsICdQc2knLCAnT21lZ2EnXHJcbl07XHJcbi8qY29uc3QgbGF0ZXhPcGVyYXRvcnM9W1xyXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXHJcbiAgICAnYXRhbicsICdhcmNjb3MnLCAnYXJjc2luJywgJ2FyY3RhbicsICdjZG90Jywnc3FydCdcclxuXSovXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKGFycjogYW55W10pIHtcclxuICAgIGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xyXG4gICAgbGV0IHN0YXJ0ID0gMDtcclxuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IGFyci5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChhcnJbaV0gIT09IGFycltpIC0gMV0gKyAxKSB7XHJcbiAgICAgICAgICAgIGlmIChpIC0gc3RhcnQgPiAxKSB7XHJcbiAgICAgICAgICAgICAgICBzZXF1ZW5jZXMucHVzaChhcnIuc2xpY2Uoc3RhcnQsIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzdGFydCA9IGk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHNlcXVlbmNlcztcclxufVxyXG5cclxuXHJcbmNvbnN0IG9wZXJhdG9yc0Zvck1hdGhpbmZvID0ge1xyXG4gICAgYm90aEJ1dFJpZ2h0QnJhY2tldDogW1wiXlwiXSxcclxuICAgIHJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2g6IFtcInNxcnRcIl0sXHJcbiAgICBib3RoOiBbXCIrXCIsIFwiLVwiLCBcIipcIl0sXHJcbiAgICBzcGVjaWFsOiBbXCI9XCJdLFxyXG4gICAgUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2g6IFtcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcclxuICAgIGRvdWJsZVJpZ2h0QnV0QnJhY2tldDogW1wiZnJhY1wiLCBcImJpbm9tXCIsXCIvXCJdXHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aEluZm97XHJcbiAgICBkZWJ1Z0luZm86IHN0cmluZz1cIlwiO1xyXG4gICAgc29sdXRpb25JbmZvOiBhbnlbXT1bXTtcclxuICAgIG1hdGhJbmZvOiBhbnlbXT1bXVxyXG4gICAgZ3JhcGg6IHN0cmluZz1cIlwiO1xyXG4gICAgYWRkR3JhcGhJbmZvKHZhbHVlOiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMuZ3JhcGgrPXZhbHVlO1xyXG4gICAgfVxyXG4gICAgYWRkRGVidWdJbmZvKG1zZzogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9KHR5cGVvZiBtc2c9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KG1zZyk6bXNnKStcIiA6IFwiKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlKTp2YWx1ZSkrIFwiXFxuIFwiO1xyXG4gICAgfVxyXG4gICAgYWRkU29sdXRpb25JbmZvKG1lczogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcclxuICAgICAgICB0aGlzLnNvbHV0aW9uSW5mby5wdXNoKG1lcyk7XHJcbiAgICAgICAgdGhpcy5hZGREZWJ1Z0luZm8oXCJTb2x2ZWRcIixtZXMpO1xyXG4gICAgfVxyXG4gICAgYWRkTWF0aEluZm8odG9rZW5zOiBUb2tlbnMpe1xyXG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRNYXRoPXRva2Vucy5yZWNvbnN0cnVjdCgpXHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5wdXNoKHJlY29uc3RydWN0ZWRNYXRoKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFNvbHV0aW9uKHRva2VuczogVG9rZW5zLHBvc2l0aW9uOiBQb3NpdGlvbixzb2x1dGlvbjogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcclxuICAgICAgICBzb2x1dGlvbj10b2tlbnMucmVjb25zdHJ1Y3QoW3NvbHV0aW9uXSk7XHJcbiAgICAgICAgY29uc3QgbGVmdD10b2tlbnMucmVjb25zdHJ1Y3QodG9rZW5zLnRva2Vucy5zbGljZShwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5pbmRleCkpO1xyXG4gICAgICAgIGNvbnN0IHJpZ2h0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmluZGV4KzEscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLCkpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRydWUpe1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGhCdXRSaWdodEJyYWNrZXQuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249ICBgJHtsZWZ0fSAke3Bvc2l0aW9uLm9wZXJhdG9yfSB7JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHBvc2l0aW9uLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKC9cXCovZywgXCJcXFxcY2RvdFwiKX0gJHtyaWdodH0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnNwZWNpYWwuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249IGBcXFxcZnJhY3ske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5yaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHBvc2l0aW9uLm9wZXJhdG9yKTpcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYFxcXFxzcXJ0eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5kb3VibGVSaWdodEJ1dEJyYWNrZXQuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgc29sdXRpb249YFxcXFwke3Bvc2l0aW9uLm9wZXJhdG9yLnJlcGxhY2UoXCIvXCIsXCJmcmFjXCIpfXske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmFkZFNvbHV0aW9uSW5mbyhzb2x1dGlvbik7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qXHJcbmZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xyXG4gICAgaWYgKCEodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSl7cmV0dXJuIHZhbHVlfVxyXG4gICAgaWYgKHZhbHVlPT09XCIrXCIpe3JldHVybiAwfVxyXG4gICAgaWYgKHZhbHVlPT09XCItXCIpe3JldHVybiAtMX1cclxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QodmFsdWUpKXtyZXR1cm4gMX1cclxuICAgIGlmKC9bKFtdLy50ZXN0KHZhbHVlWzBdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgxKX1cclxuICAgIGlmKC9bKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cclxuICAgIGZvciAobGV0IGkgPSAwOyBpPHZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVtpXSA9PT0gXCJzdHJpbmdcIiAmJiAvWygpW1xcXV0vLnRlc3QodmFsdWVbaV0pKSB7XHJcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XHJcbiAgICAgICAgICAgIGktLTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bSkgPyB2YWx1ZS5sZW5ndGg+MD92YWx1ZTowIDogbnVtO1xyXG59Ki9cclxuXHJcbmZ1bmN0aW9uIHBhcnNlU2FmZXR5Q2hlY2tzKG9wZXJhdG9yOiBzdHJpbmcsbGVmdDogYW55LHJpZ2h0OiBhbnkpe1xyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiBsZWZ0Py52YWx1ZSE9PVwibnVtYmVyXCImJmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpLmluY2x1ZGVzKG9wZXJhdG9yKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxlZnQgc2lkZSBvZiBcIitvcGVyYXRvcitcIiBtdXN0IGhhdmUgYSB2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQ/LnZhbHVlIT09XCJudW1iZXJcIikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJpZ2h0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gcGFyc2UocG9zaXRpb246IHsgb3BlcmF0b3I6IGFueTsgc3BlY2lhbENoYXI/OiBhbnk7IGxlZnQ/OiBhbnk7IHJpZ2h0PzogYW55OyB9KSB7XHJcbiAgICBsZXQgeyBvcGVyYXRvcixzcGVjaWFsQ2hhciwgbGVmdCxyaWdodH0gPSBwb3NpdGlvbjtcclxuICAgIFxyXG4gICAgbGVmdD1sZWZ0Py50b2tlbnNcclxuICAgIHJpZ2h0PXJpZ2h0LnRva2Vuc1xyXG4gICAgLy9jb25zb2xlLmxvZygndGhpcy5sZWZ0LHRoaXMucmlnaHQnLGxlZnQscmlnaHQpXHJcbiAgICBwYXJzZVNhZmV0eUNoZWNrcyhvcGVyYXRvcixsZWZ0LHJpZ2h0KTtcclxuICAgIFxyXG4gICAgbGV0IHNvbHZlZD1uZXcgVG9rZW4oMCx1bmRlZmluZWQpO1xyXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xyXG4gICAgICAgIGNhc2UgXCJTcXVhcmUgUm9vdFwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIlBvd1wiOlxyXG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZXx8cmlnaHQudmFyaWFibGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfHxsZWZ0LnZhcmlhYmxlPT09cmlnaHQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZT9yaWdodC52YXJpYWJsZTpcIlwiO1xyXG4gICAgICAgICAgICAgICAgLy9zb2x2ZWQucG93PTJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIkZyYWN0aW9uXCI6XHJcbiAgICAgICAgY2FzZSBcIi9cIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKGxlZnQudmFsdWUpLyhyaWdodC52YWx1ZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJNdWx0aXBsaWNhdGlvblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICogcmlnaHQudmFsdWU7XHJcbiAgICAgICAgICAgIGhhbmRsZVZyaWFibGVzKGxlZnQsIHJpZ2h0LHNvbHZlZCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCIrXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgKyByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcIk1pbnVzXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQudmFsdWUgLSByaWdodC52YWx1ZTtcclxuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImJpbm9tXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGNhbGN1bGF0ZUZhY3RvcmlhbChsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInNpblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJjb3NcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5jb3MoZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ0YW5cIjpcclxuICAgICAgICAgICAgaWYgKHJpZ2h0Pj05MCl7dGhyb3cgbmV3IEVycm9yKFwidGFuIE11c3QgYmUgc21hbGxlciB0aGFuIDkwXCIpO31cclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKGRlZ3JlZXNUb1JhZGlhbnMocmlnaHQudmFsdWUpKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc2luXCI6XHJcbiAgICAgICAgY2FzZSBcImFyY3NpblwiOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXNpbihyaWdodC52YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiYWNvc1wiOlxyXG4gICAgICAgIGNhc2UgXCJhcmNjb3NcIjpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFjb3MocmlnaHQudmFsdWUpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImF0YW5cIjpcclxuICAgICAgICBjYXNlIFwiYXJjdGFuXCI6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuKHJpZ2h0LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGlkZW50aWZ5IG9wZXJhdG9yIHR5cGUgYXQgcHJhaXNlIG9wZXJhdG9yOiBcIitwb3NpdGlvbi5vcGVyYXRvcik7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0OiB7IHZhcmlhYmxlOiBhbnk7IHBvdzogYW55OyB2YWx1ZTogbnVtYmVyOyB9LCByaWdodDogeyB2YXJpYWJsZTogYW55OyBwb3c6IGFueTsgdmFsdWU6IG51bWJlcjsgfSwgc29sdmVkOiBUb2tlbikge1xyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlICYmIHJpZ2h0LnZhcmlhYmxlICYmIGxlZnQudmFyaWFibGUgIT09IHJpZ2h0LnZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIC8qIEtlZXAgdGhlbSBzZXBhcmF0ZSBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZhcmlhYmxlc1xyXG4gICAgICAgICAgICBzb2x2ZWQudGVybXMgPSBbXHJcbiAgICAgICAgICAgICAgICB7IHZhcmlhYmxlOiBsZWZ0LnZhcmlhYmxlLCBwb3c6IGxlZnQucG93IHx8IDEsIHZhbHVlOiBsZWZ0LnZhbHVlIHx8IDEgfSxcclxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IHJpZ2h0LnZhcmlhYmxlLCBwb3c6IHJpZ2h0LnBvdyB8fCAxLCB2YWx1ZTogcmlnaHQudmFsdWUgfHwgMSB9XHJcbiAgICAgICAgICAgIF07Ki9cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlmZmVyZW50IHZhcmlhYmxlIGJhc2VzIGF0IHBvd2VyIG11bHRpcGxpY2F0aW9uLiBJIGRpZG4ndCBnZXQgdGhlcmUgeWV0XCIpXHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgdmFyaWFibGUgPSBsZWZ0LnZhcmlhYmxlIHx8IHJpZ2h0LnZhcmlhYmxlO1xyXG4gICAgICAgIHNvbHZlZC52YXJpYWJsZSA9IHZhcmlhYmxlLmxlbmd0aD4wP3ZhcmlhYmxlOnVuZGVmaW5lZDtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgcG93ID0gKGxlZnQucG93IHx8IDApICsgKHJpZ2h0LnBvdyB8fCAwKTtcclxuICAgICAgICBwb3c9bGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSYmcG93PT09MCYmIWxlZnQucG93JiYhcmlnaHQucG93PzI6cG93O1xyXG4gICAgICAgIC8vc29sdmVkLnBvdyA9IHBvdyB8fCB1bmRlZmluZWQ7XHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIC8vIFJ1bGUgMzogSGFuZGxlIG11bHRpcGxpY2F0aW9uIG9mIGNvbnN0YW50c1xyXG4gICAgICAgIGNvbnN0IGxlZnRWYWx1ZSA9IGxlZnQudmFsdWUgfHwgMTtcclxuICAgICAgICBjb25zdCByaWdodFZhbHVlID0gcmlnaHQudmFsdWUgfHwgMTtcclxuICAgICAgICBjb25zdCB2YWx1ZSA9IGxlZnRWYWx1ZSAqIHJpZ2h0VmFsdWU7XHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBubyB2YXJpYWJsZSwgYXNzaWduIHRoZSByZXN1bHQgYXMgYSBjb25zdGFudFxyXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICBmdW5jdGlvbiBoYW5kbGVWcmlhYmxlcyhsZWZ0OiBhbnkscmlnaHQ6IGFueSxzb2x2ZWQ6IFRva2VuKXtcclxuICAgICAgICBsZXQgaGFuZGxlZD17VmFyOm51bGwsUG93Om51bGx9O1xyXG4gICAgICAgIGlmICghbGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtcclxuICAgICAgICAgICAgcmV0dXJuIDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHBvc2l0aW9uLm9wZXJhdG9yPT09JyonKXtyZXR1cm4gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0LHJpZ2h0LHNvbHZlZCl9XHJcbiAgICAgICAgLy9jb25zb2xlLmxvZyhsZWZ0LnZhcmlhYmxlLHJpZ2h0LnZhcmlhYmxlKVxyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUd28gdmFyaWFibGUgZXF1YXRpb25zIGFyZW4ndCBhY2NlcHRlZCB5ZXRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XHJcbiAgICAgICAgLy9zb2x2ZWQudmFyaWFibGU9bGVmdC52YXJcclxuXHJcbiAgICAgICAgLypcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cclxuICAgICAgICAqL1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICByZXR1cm4gc29sdmVkO1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gcmVhcnJhbmdlRXF1YXRpb24odG9rZW5zOiBhbnksdG9rZW5Ub2lzb2xhdGU6IGFueSl7XHJcbiAgICBcclxufVxyXG5cclxuZnVuY3Rpb24gaXNvbGF0ZU11bHRpcGxpY2F0aW9uKHRva2VuczogYW55LGlzb2xhdFRva2VuOiBUb2tlbil7XHJcbiAgICBjb25zdCBpbmRleD1vcGVyYXRpb25zT3JkZXIodG9rZW5zKVxyXG4gICAgY29uc3QgSXNvbGF0ZWQ9dG9rZW5zLnRva2Vucy5maW5kKCh0b2tlbjogYW55LCBpZHg6IG51bWJlcik9PmlkeDxpbmRleClcclxuICAgIGNvbnN0IGZyYWM9Y3JlYXRlRnJhYyh0b2tlbnMubGlzdC5zbGljZShpbmRleCArIDEpLG5ldyBUb2tlbihJc29sYXRlZC52YWx1ZSkpXHJcbiAgICBJc29sYXRlZC52YWx1ZT0xO1xyXG4gICAgdG9rZW5zLmluc2VydFRva2VucyhpbmRleCsxLHRva2Vucy50b2tlbnMubGVuZ3RoLWluZGV4KzEsZnJhYylcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRnJhYyhub21pbmF0b3I6IGFueSxkZW5vbWluYXRvcjogVG9rZW4pe1xyXG4gICAvLyByZXR1cm4gW25ldyBUb2tlbignZnJhYycpLG5ldyBUb2tlbignKCcpLG5vbWluYXRvcixuZXcgVG9rZW4oJyknKSxuZXcgVG9rZW4oJygnKSxkZW5vbWluYXRvcixuZXcgVG9rZW4oJyknKV1cclxufVxyXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zOiBhbnlbXSl7XHJcbiAgICBpZiAodG9rZW5zLmxlbmd0aDw9MSl7cmV0dXJuIHRva2Vuc31cclxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xyXG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUoKHRva2VuOiBhbnkpID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxyXG4gICAge1xyXG4gICAgICAgIGkrKztcclxuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpO1xyXG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XHJcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxyXG5cclxuICAgICAgICBsZXQgY3VycmVudFRva2VuPXt0eXBlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnR5cGUgLCB2YWx1ZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YWx1ZSx2YXJpYWJsZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS52YXJpYWJsZSAscG93OiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnBvd31cclxuXHJcbiAgICAgICAgbGV0IG51bWJlckdyb3VwID0gdG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaTogYW55KSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogeyB0b2tlbjogeyB0eXBlOiBhbnk7IH07IH0pID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcclxuICAgICAgICAucmVkdWNlKChzdW06IG51bWJlciwgaXRlbTogeyBvcmlnaW5hbEluZGV4OiBudW1iZXI7IHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IG51bWJlcjsgfTsgfSkgPT4ge1xyXG4gICAgICAgIGxldCBtdWx0aXBsaWVyPSh0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0gJiYgdG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdLnZhbHVlID09PSBcIi1cIikgPyAtMSA6IDE7XHJcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcclxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxyXG4gICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xyXG4gICAgICAgIH0sIDApOyBcclxuICAgICAgICBcclxuICAgICAgICBuZXdUb2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgIC4uLmN1cnJlbnRUb2tlbixcclxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4gXHJcbiAgICAgICAgICAgIHRva2VuLnR5cGUgIT09IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSB8fCBcclxuICAgICAgICAgICAgKHRva2VuLnZhcmlhYmxlICYmIHRva2VuLnZhcmlhYmxlICE9PSBjdXJyZW50VG9rZW4udmFyaWFibGUpIHx8IFxyXG4gICAgICAgICAgICAodG9rZW4ucG93ICYmIHRva2VuLnBvdyAhPT0gY3VycmVudFRva2VuLnBvdylcclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ld1Rva2VucztcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRva2VuczogVG9rZW5zLCBpc29sYXRpb25Hb2FsOiB7IHR5cGU6IGFueTsgdmFsdWU6IGFueTsgb3ZlcnZpZXdTaWRlT25lPzogTWFwPGFueSwgYW55Pjsgb3ZlcnZpZXdTaWRlVHdvPzogTWFwPGFueSwgYW55PjsgfSkge1xyXG4gICAgaWYgKHRva2Vucy50b2tlbnMubGVuZ3RoIDw9IDEpIHJldHVybiB0b2tlbnM7XHJcblxyXG4gICAgY29uc3QgZXFJbmRleCA9IHRva2Vucy50b2tlbnMuZmluZEluZGV4KCh0OiB7IHZhbHVlOiBzdHJpbmc7IH0pID0+IHQudmFsdWUgPT09ICdFcXVhbHMnKTtcclxuICAgIGlmIChlcUluZGV4ID09PSAtMSkgdGhyb3cgbmV3IEVycm9yKFwiTm8gJ0VxdWFscycgb3BlcmF0b3IgZm91bmQgaW4gdG9rZW5zXCIpO1xyXG5cclxuICAgIGNvbnN0IHN3aXRjaERpcmVjdGlvbiA9IGZhbHNlOyAvLyBGdXR1cmUgbG9naWMgdG8gZGV0ZXJtaW5lIGRpcmVjdGlvblxyXG4gICAgY29uc3QgaXNvbGF0aW9uR29hbEluZGljZXMgPSB0b2tlbnMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodDogeyB0eXBlOiBhbnk7IHZhcmlhYmxlOiBhbnk7IH0sIGlkeDogYW55KSA9PiAodC50eXBlID09PSBpc29sYXRpb25Hb2FsLnR5cGUgJiYgdC52YXJpYWJsZSA9PT0gaXNvbGF0aW9uR29hbC52YWx1ZSA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgY29uc3Qgb3RoZXJJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKF86IGFueSwgaWR4OiBhbnkpID0+ICghaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaWR4KSAmJiBpZHggIT09IGVxSW5kZXggPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHg6IG51bGx8bnVtYmVyKSA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgIC8vIEFkanVzdCBzaWduc1xyXG4gICAgdG9rZW5zLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogeyB2YWx1ZTogbnVtYmVyOyB9LCBpOiBudW1iZXIpID0+IHtcclxuICAgICAgICBpZiAoKHN3aXRjaERpcmVjdGlvbj8gaSA+IGVxSW5kZXggOiBpIDwgZXFJbmRleCkgJiYgb3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XHJcbiAgICAgICAgICAgIHRva2VuLnZhbHVlICo9IC0xO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoKHN3aXRjaERpcmVjdGlvbj8gaSA8IGVxSW5kZXggOiBpID4gZXFJbmRleCkgJiYgaXNvbGF0aW9uR29hbEluZGljZXMuaW5jbHVkZXMoaSkpIHtcclxuICAgICAgICAgICAgdG9rZW4udmFsdWUgKj0gLTE7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU2VwYXJhdGUgc2lkZXNcclxuICAgIGNvbnN0IHNpZGUxOiBhbnlbXSA9IFtdO1xyXG4gICAgY29uc3Qgc2lkZTI6IGFueVtdID0gW107XHJcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnksIGk6IGFueSkgPT4ge1xyXG4gICAgICAgIGlmIChpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpKSkgc2lkZTEucHVzaCh0b2tlbik7XHJcbiAgICAgICAgaWYgKG90aGVySW5kaWNlcy5pbmNsdWRlcyhpKSkgc2lkZTIucHVzaCh0b2tlbik7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0b2tlbnMudG9rZW5zID0gc3dpdGNoRGlyZWN0aW9uXHJcbiAgICAgICAgPyBbLi4uc2lkZTIsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUxXVxyXG4gICAgICAgIDogWy4uLnNpZGUxLCB0b2tlbnMudG9rZW5zW2VxSW5kZXhdLCAuLi5zaWRlMl07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnM6IGFueVtdKSB7XHJcbiAgICBmdW5jdGlvbiBmaW5kT3BlcmF0b3JJbmRleChiZWdpbjogbnVtYmVyLCBlbmQ6IG51bWJlciwgdG9rZW5zOiBhbnksIGZpbmRQYXJlbkluZGV4PzogYW55LCByZWdleD86IGFueSkge1xyXG4gICAgICAgIHdoaWxlIChiZWdpbiA8IGVuZCAmJiBiZWdpbiA8IHRva2Vucy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgbGV0IGluZGV4O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHJlZ2V4KSB7XHJcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueTsgfSkgPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9KSA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm4gLTE7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghL1srLV0vLnRlc3QodG9rZW5zW2luZGV4XS52YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPiAwICYmIGluZGV4IDwgdG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaW5kZXggLSAxXS50eXBlID09PSB0b2tlbnNbaW5kZXggKyAxXS50eXBlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJlZ2luID0gaW5kZXggKyAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gLTE7XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGJlZ2luID0gMCwgZW5kID0gdG9rZW5zLmxlbmd0aCxqPTA7XHJcbiAgICBsZXQgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgbGV0IGNoZWNrZWRJRHM6IGFueVtdID0gW107ICBcclxuICAgIGxldCBvcGVyYXRvckZvdW5kID0gZmFsc2U7XHJcbiAgICB3aGlsZSAoIW9wZXJhdG9yRm91bmQmJmo8MjAwKSB7XHJcbiAgICAgICAgLy8gRmluZCB0aGUgaW5uZXJtb3N0IHBhcmVudGhlc2VzXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaisrO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSBcIihcIiAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnNbaV0uaWQpKSB7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50SUQgPSBmaW5kUGFyZW5JbmRleCh0b2tlbnNbaV0uaWQpOyAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRJRCE9PW51bGwmJmk9PT1jdXJyZW50SUQuY2xvc2UpIHtcclxuICAgICAgICAgICAgICAgIFtiZWdpbixlbmRdPVtjdXJyZW50SUQub3BlbixjdXJyZW50SUQuY2xvc2VdXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICBiZWdpbiA9IDA7XHJcbiAgICAgICAgICAgIGVuZCA9IHRva2Vucy5sZW5ndGg7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBvcGVyYXRvckZvdW5kID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sZW5kLHRva2VucykhPT0tMTtcclxuXHJcbiAgICAgICAgLy8gSWYgbm8gb3BlcmF0b3IgaXMgZm91bmQsIG1hcmsgdGhpcyBwYXJlbnRoZXNlcyBwYWlyIGFzIGNoZWNrZWRcclxuICAgICAgICBpZiAoIW9wZXJhdG9yRm91bmQpIHtcclxuICAgICAgICAgICAgY2hlY2tlZElEcy5wdXNoKGN1cnJlbnRJRC5pZCk7ICBcclxuICAgICAgICAgICAgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChqPj0yMDApe3Rocm93IG5ldyBFcnJvcihcIm9wZXJhdGlvbnNPcmRlciBGYWlsZWQgZXhjZWVkZWQgMjAwIHJldmlzaW9uc1wiKTt9XHJcblxyXG4gICAgZm9yIChsZXQgaT0xO2k8PTY7aSsrKXtcclxuICAgICAgICBsZXQgcHJpb3JpdHkgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KGksdHJ1ZSkpO1xyXG4gICAgICAgIGlmKHByaW9yaXR5IT09LTEpcmV0dXJuIHByaW9yaXR5XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbFxyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uIHtcclxuICAgIG9wZXJhdG9yOiBzdHJpbmc7XHJcbiAgICBpbmRleDogbnVtYmVyO1xyXG4gICAgdHJhbnNpdGlvbjogbnVtYmVyO1xyXG4gICAgc3BlY2lhbENoYXI6IHN0cmluZztcclxuICAgIGxlZnQ6IGFueTtcclxuICAgIHJpZ2h0OiBhbnk7XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM6IGFueVtdLCBpbmRleD86IG51bWJlcil7XHJcbiAgICAgICAgaWYoaW5kZXgpXHJcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xyXG4gICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgdGhpcy5wb3NpdGlvbih0b2tlbnMpXHJcbiAgICB9XHJcbiAgICBwb3NpdGlvbih0b2tlbnM6IGFueVtdKSB7XHJcbiAgICAgICAgdGhpcy5pbmRleCA9ICF0aGlzLmluZGV4PyBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSA6IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5pbmRleCA9PT0gbnVsbCAsIHRoaXMuaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpXHJcbiAgICAgICAgaWYgKHRoaXMuaW5kZXggPT09IG51bGwgfHwgdGhpcy5pbmRleCA+PSB0b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMub3BlcmF0b3IgPSB0b2tlbnNbdGhpcy5pbmRleF0udmFsdWU7Y29uc29sZS5sb2coZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdyaWdodCcpKVxyXG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdyaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0ge2JyZWFrQ2hhcjogdGhpcy5pbmRleH07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5sZWZ0LmJyZWFrQ2hhcjtcclxuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLnRyYW5zaXRpb24tMSxcInJpZ2h0XCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0LmJyZWFrQ2hhciA9IHRoaXMuaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0LmJyZWFrQ2hhcisodGhpcy5yaWdodC5tdWx0aVN0ZXA/MTowKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IHdhcyBub3QgYWNjb3VudGVkIGZvciwgb3IgaXMgbm90IHRoZSB2YWxpZCBvcGVyYXRvcmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL2NvbnNvbGUubG9nKHRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgPyB0b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgOiBudWxsO1xyXG4gICAgfVxyXG4gICAgYXBwbHlQb3NpdGlvbih0b2tlbnM6IGFueVtdLCBpbmRleDogIG51bWJlciwgZGlyZWN0aW9uOiBzdHJpbmcpIHtcclxuICAgICAgICBsZXQgYnJlYWtDaGFyPWluZGV4XHJcbiAgICAgICAgbGV0IHRhcmdldDtcclxuICAgICAgICBsZXQgbXVsdGlTdGVwPWZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGlzTGVmdCA9IGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCI7XHJcbiAgICAgICAgY29uc3QgaW5kZXhNb2RpZmllciA9ICBpc0xlZnQ/LSAxIDogIDE7XHJcbiAgICAgICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpIHx8ICF0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0pIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYXQgYXBwbHlQb3NpdGlvbjogXFxcImluZGV4IHdhc24ndCB2YWxpZFxcXCIgaW5kZXg6IFwiK2luZGV4KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgcGFyZW5JbmRleCA9IGZpbmRQYXJlbkluZGV4KHRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS5pZCk7XHJcbiAgICAgICAgICAgIGJyZWFrQ2hhciA9ICBpc0xlZnQgPyBwYXJlbkluZGV4Lm9wZW4gOiBwYXJlbkluZGV4LmNsb3NlKzE7XHJcbiAgICAgICAgICAgIHRhcmdldCA9IHRva2Vucy5zbGljZShwYXJlbkluZGV4Lm9wZW4sIHBhcmVuSW5kZXguY2xvc2UrMSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgYnJlYWtDaGFyPWluZGV4K2luZGV4TW9kaWZpZXI7XHJcbiAgICAgICAgICAgIHRhcmdldCA9IHRva2Vuc1ticmVha0NoYXJdO1xyXG4gICAgICAgICAgICBicmVha0NoYXIrPWlzTGVmdD8wOjFcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9jb25zdCBtdWx0aVN0ZXAgPSBNYXRoLmFicyhicmVha0NoYXIgLSBpbmRleCkgPiAzO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKCFtdWx0aVN0ZXAmJnRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpe1xyXG4gICAgICAgICAgICAvL3RhcmdldD10YXJnZXQuZmluZChpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0YXJnZXQ/Lmxlbmd0aD09PTApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBhdCBhcHBseVBvc2l0aW9uOiBjb3VsZG4ndCBmaW5kIHRhcmdldCB0b2tlbiBmb3IgZGlyZWN0aW9uICR7ZGlyZWN0aW9ufSBhbmQgb3BlcmF0b3JcIiR7dG9rZW5zW2luZGV4XS52YWx1ZX1cImAsKTtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAvL2JyZWFrQ2hhciA9IChicmVha0NoYXIgIT09IGluZGV4ID8gdGFyZ2V0Py5pbmRleCA6IGJyZWFrQ2hhcikrIGluZGV4TW9kaWZpZXIrKGlzTGVmdD8wOjEpO1xyXG4gICAgICAgIC8vZGVsZXRlIHRhcmdldC5pbmRleFxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0YXJnZXQubGVuZ3RoPT09Myl7XHJcbiAgICAgICAgICAgIHRhcmdldD10YXJnZXQuZmluZCgoaXRlbTogeyB0eXBlOiBzdHJpbmc7IH0pID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpXHJcbiAgICAgICAgfWVsc2UgaWYodGFyZ2V0Lmxlbmd0aD4xKW11bHRpU3RlcD10cnVlXHJcbiAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0b2tlbnM6IHRhcmdldCxcclxuICAgICAgICAgICAgbXVsdGlTdGVwOiBtdWx0aVN0ZXAsXHJcbiAgICAgICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyLFxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBjaGVja011bHRpU3RlcCgpe1xyXG4gICAgICAgIHJldHVybiAoKGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpJiZ0aGlzLmxlZnQ/Lm11bHRpU3RlcCl8fHRoaXMucmlnaHQ/Lm11bHRpU3RlcCkmJnRoaXMub3BlcmF0b3I9PT0nTXVsdGlwbGljYXRpb24nO1xyXG4gICAgfVxyXG4gICAgaXNMZWZ0VmFyKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXA/dGhpcy5sZWZ0LnRva2Vucy5zb21lKCh0OiB7IHR5cGU6IHN0cmluZzsgfSk9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5sZWZ0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcclxuICAgIH1cclxuICAgIGlzUmlnaHRWYXIoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5yaWdodC5tdWx0aVN0ZXA/dGhpcy5yaWdodC50b2tlbnMuc29tZSgodDogeyB0eXBlOiBzdHJpbmc7IH0pPT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMucmlnaHQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxyXG4gICAgfVxyXG4gICAgY2hlY2tGcmFjKCl7Ly8hdGhpcy5jaGVja011bHRpU3RlcCgpIEkgZG9uJ3Qga25vdyB3aHkgSSBoYWQgdGhpcyBoZXJlXHJcbiAgICAgICAgcmV0dXJuIC8oZnJhY3xcXC8pLy50ZXN0KHRoaXMub3BlcmF0b3IpJiYodGhpcy5pc0xlZnRWYXIoKXx8dGhpcy5pc1JpZ2h0VmFyKCkpXHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIG1hdGhKYXhPcGVyYXRvcntcclxuICAgIG9wZXJhdG9yOiBzdHJpbmc7XHJcbiAgICBwcmlvcml0eTogbnVtYmVyO1xyXG4gICAgYXNzb2NpYXRpdml0eU51bWJlcjogbnVtYmVyO1xyXG4gICAgZ3JvdXAxOiBtYXRoR3JvdXA7XHJcbiAgICBncm91cDI/OiBtYXRoR3JvdXA7XHJcbiAgICBzb2x1dGlvbj86IG1hdGhHcm91cFxyXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcscHJpb3JpdHk/OiBudW1iZXIsYXNzb2NpYXRpdml0eU51bWJlcj86IG51bWJlcixncm91cDE/OiBtYXRoR3JvdXAsZ3JvdXAyPzogbWF0aEdyb3VwKXtcclxuICAgICAgICBpZiAob3BlcmF0b3IpdGhpcy5vcGVyYXRvcj1vcGVyYXRvclxyXG4gICAgICAgIGlmIChwcmlvcml0eSl0aGlzLnByaW9yaXR5PXByaW9yaXR5XHJcbiAgICAgICAgaWYgKGFzc29jaWF0aXZpdHlOdW1iZXIpdGhpcy5hc3NvY2lhdGl2aXR5TnVtYmVyPWFzc29jaWF0aXZpdHlOdW1iZXJcclxuICAgICAgICBpZiAoZ3JvdXAxKXRoaXMuZ3JvdXAxPWdyb3VwMVxyXG4gICAgICAgIGlmIChncm91cDIpdGhpcy5ncm91cDI9Z3JvdXAyXHJcbiAgICB9XHJcbiAgICBzZXRHcm91cDEoZ3JvdXA6IG1hdGhHcm91cCl7dGhpcy5ncm91cDE9Z3JvdXB9XHJcbiAgICBzZXRHcm91cDIoZ3JvdXA6IG1hdGhHcm91cCl7dGhpcy5ncm91cDI9Z3JvdXB9XHJcbn1cclxuXHJcbmNsYXNzIG1hdGhHcm91cHtcclxuICAgIG51bWJlck9ubHk6IGJvb2xlYW47XHJcbiAgICBoYXNWYXJpYWJsZXM6IGJvb2xlYW47XHJcbiAgICBzaW5ndWxhcjogYm9vbGVhbjtcclxuICAgIGhhc09wZXJhdG9yczogYm9vbGVhbjtcclxuICAgIG11bHRpTGV2ZWw6IGJvb2xlYW47XHJcbiAgICBpc09wZXJhYmxlOiBib29sZWFuPXRydWU7XHJcbiAgICBwcml2YXRlIGl0ZW1zOiBUb2tlbltdO1xyXG4gICAgY29uc3RydWN0b3IoKXtcclxuXHJcbiAgICB9XHJcbiAgICBzZXRJdGVtcyhpdGVtczogVG9rZW5bXSl7XHJcbiAgICAgICAgdGhpcy5pdGVtcz1pdGVtc1xyXG4gICAgfVxyXG4gICAgc2V0TWV0YURhdGEoKXtcclxuICAgICAgICB0aGlzLnNpbmd1bGFyPXRoaXMuaXRlbXMubGVuZ3RoPT09MTtcclxuICAgICAgICB0aGlzLm51bWJlck9ubHk9dGhpcy5pdGVtcy5zb21lKHQ9PiAhdC5pc1ZhcigpKTtcclxuXHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlT3BlcmF0b3Iob3BlcmF0b3I6IG1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICBzd2l0Y2ggKG9wZXJhdG9yLm9wZXJhdG9yKSB7XHJcbiAgICAgICAgY2FzZSBcInNpblwiOlxyXG4gICAgICAgICAgICAvL2NvbnN0IGE9bmV3IFRva2VuKE1hdGguc2luKGRlZ3JlZXNUb1JhZGlhbnMob3BlcmF0b3IuZ3JvdXAxLml0ZW1zWzBdLnZhbHVlKSkpXHJcbiAgICAgICAgICAgIC8vc29sdmVkLnZhbHVlID0gO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBpZGVudGlmeSBvcGVyYXRvciB0eXBlIGF0IHByYWlzZSBvcGVyYXRvcjogXCIrb3BlcmF0b3Iub3BlcmF0b3IpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdDogeyB2YXJpYWJsZTogYW55OyBwb3c6IGFueTsgdmFsdWU6IG51bWJlcjsgfSwgcmlnaHQ6IHsgdmFyaWFibGU6IGFueTsgcG93OiBhbnk7IHZhbHVlOiBudW1iZXI7IH0sIHNvbHZlZDogVG9rZW4pIHtcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSAmJiBsZWZ0LnZhcmlhYmxlICE9PSByaWdodC52YXJpYWJsZSkge1xyXG4gICAgICAgICAgICAvKiBLZWVwIHRoZW0gc2VwYXJhdGUgc2luY2UgdGhleSBoYXZlIGRpZmZlcmVudCB2YXJpYWJsZXNcclxuICAgICAgICAgICAgc29sdmVkLnRlcm1zID0gW1xyXG4gICAgICAgICAgICAgICAgeyB2YXJpYWJsZTogbGVmdC52YXJpYWJsZSwgcG93OiBsZWZ0LnBvdyB8fCAxLCB2YWx1ZTogbGVmdC52YWx1ZSB8fCAxIH0sXHJcbiAgICAgICAgICAgICAgICB7IHZhcmlhYmxlOiByaWdodC52YXJpYWJsZSwgcG93OiByaWdodC5wb3cgfHwgMSwgdmFsdWU6IHJpZ2h0LnZhbHVlIHx8IDEgfVxyXG4gICAgICAgICAgICBdOyovXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpZmZlcmVudCB2YXJpYWJsZSBiYXNlcyBhdCBwb3dlciBtdWx0aXBsaWNhdGlvbi4gSSBkaWRuJ3QgZ2V0IHRoZXJlIHlldFwiKVxyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlID0gbGVmdC52YXJpYWJsZSB8fCByaWdodC52YXJpYWJsZTtcclxuICAgICAgICBzb2x2ZWQudmFyaWFibGUgPSB2YXJpYWJsZS5sZW5ndGg+MD92YXJpYWJsZTp1bmRlZmluZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IHBvdyA9IChsZWZ0LnBvdyB8fCAwKSArIChyaWdodC5wb3cgfHwgMCk7XHJcbiAgICAgICAgcG93PWxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUmJnBvdz09PTAmJiFsZWZ0LnBvdyYmIXJpZ2h0LnBvdz8yOnBvdztcclxuICAgICAgICAvL3NvbHZlZC5wb3cgPSBwb3cgfHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICAvLyBSdWxlIDM6IEhhbmRsZSBtdWx0aXBsaWNhdGlvbiBvZiBjb25zdGFudHNcclxuICAgICAgICBjb25zdCBsZWZ0VmFsdWUgPSBsZWZ0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgcmlnaHRWYWx1ZSA9IHJpZ2h0LnZhbHVlIHx8IDE7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSBsZWZ0VmFsdWUgKiByaWdodFZhbHVlO1xyXG4gICAgICAgIC8vIElmIHRoZXJlJ3Mgbm8gdmFyaWFibGUsIGFzc2lnbiB0aGUgcmVzdWx0IGFzIGEgY29uc3RhbnRcclxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgZnVuY3Rpb24gaGFuZGxlVnJpYWJsZXMobGVmdDogYW55LHJpZ2h0OiBhbnksc29sdmVkOiBUb2tlbil7XHJcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcclxuICAgICAgICBpZiAoIWxlZnQudmFyaWFibGUmJiFyaWdodC52YXJpYWJsZSl7XHJcbiAgICAgICAgICAgIHJldHVybiA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaWYgKHBvc2l0aW9uLm9wZXJhdG9yPT09JyonKXtyZXR1cm4gaGFuZGxlVmFyaWFibGVNdWx0aXBsaWNhdGlvbihsZWZ0LHJpZ2h0LHNvbHZlZCl9XHJcbiAgICAgICAgLy9jb25zb2xlLmxvZyhsZWZ0LnZhcmlhYmxlLHJpZ2h0LnZhcmlhYmxlKVxyXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlIT09cmlnaHQudmFyaWFibGUpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUd28gdmFyaWFibGUgZXF1YXRpb25zIGFyZW4ndCBhY2NlcHRlZCB5ZXRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaGFuZGxlZC5WYXI9bGVmdC52YXI7XHJcbiAgICAgICAgLy9zb2x2ZWQudmFyaWFibGU9bGVmdC52YXJcclxuXHJcbiAgICAgICAgLypcclxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSYmIXJpZ2h0LnZhcmlhYmxlKXtzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cclxuICAgICAgICBlbHNlIGlmIChsZWZ0LnZhcmlhYmxlJiZyaWdodC52YXJpYWJsZSl7c29sdmVkLnZhcmlhYmxlPXJpZ2h0LnZhcmlhYmxlO3NvbHZlZC5wb3c9Mn1cclxuICAgICAgICAqL1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICAvL3JldHVybiBzb2x2ZWQ7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcclxuICAgIGlucHV0PVwiXCI7XHJcbiAgICB0b2tlbnM6IFRva2VucztcclxuICAgIHNvbHV0aW9uPVwiXCI7XHJcbiAgICBtYXRoSW5mbz1uZXcgTWF0aEluZm8oKTtcclxuICAgIGk9MDtcclxuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMuaW5wdXQ9aW5wdXQ7XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzSW5wdXQoKTtcclxuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygndGhpcy50b2tlbnMnLHRoaXMudG9rZW5zKTtcclxuXHJcbiAgICAgICAgY29uc3QgYj1uZXcgbWF0aEdyb3VwKClcclxuICAgICAgICBiLnNldEl0ZW1zKHRoaXMudG9rZW5zLnRva2Vuc1sxXSlcclxuICAgICAgICBjb25zdCBhPW5ldyBtYXRoSmF4T3BlcmF0b3IoKVxyXG4gICAgICAgIGEuc2V0R3JvdXAxKGIpXHJcbiAgICAgICAgcGFyc2VPcGVyYXRvcihhKVxyXG4gICAgICAgIGNvbnNvbGUubG9nKGEpXHJcbiAgICAgICAgXHJcblxyXG5cclxuICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlRva2VucyBhZnRlciB0b2tlbml6ZVwiLHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICB0aGlzLmlucHV0PXRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xyXG4gICAgfVxyXG4gICAgZ2V0UmVkeWZvck5ld1JvbmQoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5jb25uZWN0TmVhcmJ5VG9rZW5zKCk7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRNYXRoSW5mbyh0aGlzLnRva2VucylcclxuICAgICAgICAvL3RoaXMuYWRkRGVidWdJbmZvKHRoaXMudG9rZW5zLnRva2Vucyx0aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoKVxyXG4gICAgICAgIHRoaXMudG9rZW5zLmV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCk7XHJcbiAgICB9XHJcbiAgICBjb250cm9sbGVyKCk6IGFueXtcclxuICAgICAgICBcclxuICAgICAgICBcclxuICAgICAgICAvKlxyXG4gICAgICAgIHRoaXMuaSsrO1xyXG4gICAgICAgIGlmKHRoaXMuaT4xMCl7cmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKX1cclxuXHJcbiAgICAgICAgdGhpcy5nZXRSZWR5Zm9yTmV3Um9uZCgpO1xyXG4gICAgICAgIC8vY29uc3Qgb3ZlcnZpZXc9dGhpcy50b2tlbnMuZ2V0T3ZlcnZpZXcoKVxyXG4gICAgICAgIGNvbnN0IHByYWlzaW5nTWV0aG9kPW5ldyBQcmFpc2luZ01ldGhvZCh0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgaWYgKHByYWlzaW5nTWV0aG9kLmlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpKXtcclxuICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy50b2tlbnMpO1xyXG4gICAgICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlBhcnNlZCBleHByZXNzaW9uXCIsIEpTT04uc3RyaW5naWZ5KHBvc2l0aW9uLCBudWxsLCAxKSk7XHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbiA9PT0gbnVsbCYmdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xKXtcclxuICAgICAgICAgICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8oXCJwYXJzZSh0b2tlbnMpXCIscGFyc2UodGhpcy50b2tlbnMudG9rZW5zKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBcInRoZSAqKioqXCJcclxuICAgICAgICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uLmNoZWNrRnJhYygpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBleHBhbmRFeHByZXNzaW9uKHRoaXMudG9rZW5zLHBvc2l0aW9uKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zLnRva2VucykpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnVzZVBhcnNlKHBvc2l0aW9uKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZihwcmFpc2luZ01ldGhvZC5pc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpKXtcclxuICAgICAgICAgICAgdGhpcy51c2VJc29sYXQocHJhaXNpbmdNZXRob2QpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRvSXNvbGF0ZT1wcmFpc2luZ01ldGhvZC5pc0FueXRoaW5nVG9Jc29sYXRlKClcclxuICAgICAgICBpZiAodG9Jc29sYXRlKXtcclxuICAgICAgICAgICAgcmVhcnJhbmdlRm9ySXNvbGF0aW9uKHRoaXMudG9rZW5zLHRvSXNvbGF0ZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgfSAgIFxyXG4gICAgICAgIC8vaWYgKHNvbHZlZCA9PT0gbnVsbHx8dHlwZW9mIHNvbHZlZD09PVwic3RyaW5nXCIpIHtyZXR1cm4gc29sdmVkOyB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluYWxSZXR1cm4oKS8vdGhpcy50b2tlbnMudG9rZW5zLmxlbmd0aD4xP3RoaXMuY29udHJvbGxlcigpOnRoaXMuZmluYWxSZXR1cm4oKTsqL1xyXG4gICAgfVxyXG5cclxuICAgIHVzZVBhcnNlKHBvc2l0aW9uOiBQb3NpdGlvbil7XHJcbiAgICAgICAgY29uc3Qgc29sdmVkID0gcGFyc2UocG9zaXRpb24pO1xyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic29sdmVkXCIsc29sdmVkKVxyXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXHJcbiAgICAgICAgdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKGxlZnRCcmVhayxsZW5ndGgsc29sdmVkKVxyXG4gICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb24odGhpcy50b2tlbnMscG9zaXRpb24sc29sdmVkKVxyXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxyXG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRyb2xsZXIoKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcmFpc2luZ01ldGhvZCgpe1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcclxuICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVzZVF1YWRyYXRpYygpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMudXNlSXNvbGF0KCk7Ki9cclxuICAgIH1cclxuXHJcbiAgICB1c2VJc29sYXQocHJhaXNpbmdNZXRob2Q6IFByYWlzaW5nTWV0aG9kKXtcclxuICAgICAgICBpc29sYXRlTXVsdGlwbGljYXRpb24odGhpcy50b2tlbnMsbmV3IFRva2VuKHByYWlzaW5nTWV0aG9kLnZhcmlhYmxlc1swXSkpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXHJcbiAgICAgICAgLy90aGlzLnRva2Vucy5pbnNlcnRUb2tlbnMoKVxyXG4gICAgICAgIC8vVXNlIHBvc3Nlc3Npb25cclxuICAgIH1cclxuXHJcbiAgICB1c2VRdWFkcmF0aWMoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnM9c2ltcGxpZml5KHRoaXMudG9rZW5zLnRva2VucylcclxuICAgICAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlOiBzdHJpbmcpPT50aGlzLnRva2Vucy50b2tlbnMuZmlsdGVyKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0pID0+IHRva2VuLnR5cGUgPT09IHR5cGUpO1xyXG4gICAgICAgICAgICBjb25zdCBbbnVtYmVySW5kZXgsdmFyaWFibGVJbmRleCxwb3dJbmRleF0gPSBbZmlsdGVyQnlUeXBlKFwibnVtYmVyXCIpLGZpbHRlckJ5VHlwZShcInZhcmlhYmxlXCIpLGZpbHRlckJ5VHlwZShcInBvd2VyVmFyaWFibGVcIildXHJcbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0aGlzLnRva2Vucy50b2tlbnMpXHJcbiAgICAgICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0xJiZwb3dJbmRleFswXS5wb3c9PT0yKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcXVhZChcclxuICAgICAgICAgICAgICAgICAgICBwb3dJbmRleFswXT8udmFsdWUgIHwgMCxcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZUluZGV4WzBdPy52YWx1ZSB8IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0/LnZhbHVlICogLTF8IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBhZGREZWJ1Z0luZm8obWVzOiBzdHJpbmcsdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IFRva2VuIHwgQXhpcyl7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxyXG4gICAgfVxyXG4gICAgcHJvY2Vzc0lucHV0KCl7XHJcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XHJcbiAgICAgICAgLnJlcGxhY2UoLyhNYXRoLnxcXFxcfFxcc3xsZWZ0fHJpZ2h0KS9nLCBcIlwiKSBcclxuICAgICAgICAucmVwbGFjZSgvey9nLCBcIihcIilcclxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcclxuICAgICAgICAvLy5yZXBsYWNlKC8oPzwhXFxcXHxbYS16QS1aXSkodGFufHNpbnxjb3N8Ymlub218ZnJhY3xhc2lufGFjb3N8YXRhbnxhcmNjb3N8YXJjc2lufGFyY3RhbnxjZG90KS9nLCBcIlxcXFwkMVwiKTtcclxuICAgIH1cclxuICAgIGZpbmFsUmV0dXJuKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnJlY29uc3RydWN0KClcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgbWF0aFZhcmlhYmxlc3tcclxuXHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmNsYXNzIFRva2Vuc3tcclxuICAgIHRva2VuczogYW55PVtdO1xyXG4gICAgb3BlcmF0b3JTdHJ1Y3R1cmU6IG1hdGhKYXhPcGVyYXRvcjtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IobWF0aDogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUobWF0aDogc3RyaW5nKXtcclxuICAgICAgICAvL2xhdGV4T3BlcmF0b3JzLnB1c2goU3RyaW5nLnJhd2BbKi9ePVxcK1xcLVxcKFxcKV1gKVxyXG4gICAgICAgIC8vY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcobGF0ZXhPcGVyYXRvcnMpXHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMoKSlcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4obWF0Y2hbMF0pKTtcclxuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xyXG4gICAgICAgICAgICBpZiAoISFtYXRjaClcclxuICAgICAgICAgICAgeyAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbihwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oMSxtYXRjaFswXSkpXHJcbiAgICAgICAgICAgICAgICAvL3Rva2Vucy5wdXNoKHt0eXBlOiBcInZhcmlhYmxlXCIsdmFyaWFibGU6IHZhcmkucmVwbGFjZShcIihcIixcIntcIikucmVwbGFjZShcIilcIixcIn1cIiksdmFsdWU6IDF9KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY2hhciBcIiR7bWF0aFtpXX1cImApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFsaWRhdGVJbmRleChpbmRleDogbnVtYmVyLG1hcmdpbj86IG51bWJlcil7XHJcbiAgICAgICAgbWFyZ2luPW1hcmdpbnx8MDtcclxuICAgICAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtbWFyZ2luO1xyXG4gICAgfVxyXG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpe1xyXG4gICAgICAgIGNvbnN0IHRlc3REb3VibGVSaWdodCA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBpZHg9ZmluZFBhcmVuSW5kZXgobnVsbCxpbmRleCkub3BlbjtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zW2luZGV4KzFdPy52YWx1ZT09PScoJyYmKGlkeD09PTB8fCFnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ2RvdWJsZVJpZ2h0JykuaW5jbHVkZXModGhpcy50b2tlbnNbaWR4LTFdPy52YWx1ZSkpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB9O1xyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1tpbmRleF0uaXNWYWx1ZVRva2VuKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy9NYXAgcGFyZW50aGVzZXMgZm9yIGltcGxpY2l0IG11bHRpcGxpY2F0aW9uLlxyXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBudW1iZXIpID0+IHsgXHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8IChoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLnZhbHVlKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHx0ZXN0RG91YmxlUmlnaHQoaW5kZXgpPyBpbmRleCsxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICByZXR1cm4gbWFwXHJcbiAgICB9XHJcblxyXG4gICAgdmFsaWRhdGVQbHVzTWludXMoKXtcclxuICAgICAgICBjb25zdCBtYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udmFsdWU9PT0nUGx1cyd8fHRva2VuLnZhbHVlPT09J01pbnVzJz9pbmRleDpudWxsKS5maWx0ZXIoKGluZGV4OiBudWxsKT0+IGluZGV4IT09bnVsbClcclxuXHJcbiAgICAgICAgbWFwLmZvckVhY2goKGluZGV4OiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaW5kZXg9dGhpcy52YWxpZGF0ZUluZGV4KGluZGV4LDEpJiZ0aGlzLnRva2Vuc1tpbmRleC0xXS50eXBlPT09J29wZXJhdG9yJ3x8dGhpcy50b2tlbnNbaW5kZXgrMV0udHlwZT09PSdvcGVyYXRvcic/bnVsbDppbmRleDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlPXRoaXMudG9rZW5zW2luZGV4XS52YWx1ZT09PSdQbHVzJz8xOi0xO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleCsxXS52YWx1ZSo9dmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwb3N0UHJvY2Vzc1Rva2Vucygpe1xyXG4gICAgICAgIC8qcnVsZXMgdG8gYWJpZCBieTpcclxuICAgICAgICAxLiArLSBJZiBwYXJ0IG9mIHRoZSBudW1iZXIgdGhleSBhcmUgYWJzb3JiZWQgaW50byB0aGUgbnVtYmVyXHJcbiAgICAgICAgKi9cclxuICAgICAgIFxyXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpO1xyXG4gICAgICAgIGNvbnN0IG1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbixpbmRleDogYW55KT0+ICh0b2tlbi5pc1ZhbHVlVG9rZW4oKSk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IGFycj1maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwKTtcclxuICAgICAgICBsZXQgdGVtcFRva2Vucz10aGlzLnRva2Vucy5tYXAoKHQ6QmFzaWNNYXRoSmF4VG9rZW4pPT57XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiB0LnZhbHVlPT09J251bWJlcicpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFRva2VuKHQudmFsdWUsdC52YXJpYWJsZSlcclxuICAgICAgICAgICAvLyBpZih0LnR5cGU9PT0nb3BlcmF0b3InKXJldHVybiBuZXcgbWF0aEpheE9wZXJhdG9yKHQudmFsdWUpXHJcbiAgICAgICAgcmV0dXJuIHQ7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gU3RlcCBvbmUgc3RydWN0dXJlIGFrYSByZXBsYWNlIHBhcmVudGhlc2VzIHdpdGggbmVzdGVkIGFycmF5c1xyXG4gICAgICAgIC8vIFN0ZXAgdHdvIEZpbmQgZmlyc3Qgb3BlcmF0b3IuYW5kIGNvbnRpbnVlIGZyb20gdGhlcmVcclxuICAgICAgICBjb25zdCBwb3M9bmV3IFBvc2l0aW9uKHRlbXBUb2tlbnMpXHJcbiAgICAgICAgY29uc29sZS5sb2cocG9zKVxyXG4gXHJcbiAgICAgXHJcblxyXG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKTtcclxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKCk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKHRlbXBUb2tlbnMpO1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxyXG4gICAgICAgIHBhcmVuTWFwLnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBiIC0gYSlcclxuICAgICAgICAuZm9yRWFjaCgodmFsdWU6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UodmFsdWUsIDAsIG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4oJyonKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcFBvdz10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi52YWx1ZT09PSdQb3cnP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBjb25zb2xlLmxvZyhtYXBQb3cpXHJcbiAgICAgICAgbWFwUG93LmZvckVhY2goKGluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHtcclxuICAgICAgICAgICAgLy9jb25zdCBwb3NpdGlvbj1uZXcgUG9zaXRpb24odGhpcyxpbmRleClcclxuICAgICAgICAgICAgLy9jb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxyXG4gICAgICAgICAgIC8vIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBtYXBQYXJlbkluZGV4ZXMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9LCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4KSA6IG51bGwpXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgIH1cclxuXHJcbiAgICBmaWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFsKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW06IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeyBvcGVuOiBvcGVuSW5kZXgsIGNsb3NlOiBjbG9zZUluZGV4IH0gPSBpdGVtO1xyXG4gICAgICAgICAgICAgICAgaWYgKG9wZW5JbmRleCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodGhpcy50b2tlbnNbb3BlbkluZGV4IC0gMV0/LnR5cGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoY2xvc2VJbmRleCA8IHRoaXMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdPy5pc1ZhbHVlVG9rZW4oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH0pLmZsYXRNYXAoKGl0ZW06IGFueSkgPT4gW2l0ZW0ub3BlbiwgaXRlbS5jbG9zZV0pO1xyXG4gICAgfSAgICBcclxuICAgIFxyXG4gICAgLypcclxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICAgfSovXHJcblxyXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZnR5Z3ViaG5pbXBvXCIpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBtYXAgPSBuZXcgU2V0KHRoaXMuZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpKTtcclxuICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXzogYW55LCBpZHg6IHVua25vd24pID0+ICFtYXAuaGFzKGlkeCkpO1xyXG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXHJcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCArIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgbnVtTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSdudW1iZXInJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGFyciA9IFtcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXModmFyTWFwKSwgXHJcbiAgICAgICAgXTtcclxuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcclxuICAgICAgICBcclxuICAgICAgICBpZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBjb25uZWN0QW5kQ29tYmluZShhcnI6IGFueVtdKXtcclxuICAgICAgICBjb25zdCBpbmRleGVzOmFueT1bXVxyXG5cclxuICAgICAgICBhcnIuc29ydCgoYSwgYikgPT4gYlswXSAtIGFbMF0pLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBpbmRleGVzLnB1c2goe3N0YXJ0OiBlbFswXSxlbmQ6IGVsW2VsLmxlbmd0aCAtIDFdfSlcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaW5kZXhlcy5mb3JFYWNoKChpbmRleDogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlcjsgfSkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBOdW1iZXIodGhpcy50b2tlbnNbaW5kZXguc3RhcnRdLnZhbHVlKTtcclxuICAgICAgICAgICAgY29uc3QgaXNWYXI9dGhpcy50b2tlbnMuc2xpY2UoaW5kZXguc3RhcnQsaW5kZXguZW5kKzEpLmZpbmQoKHRva2VuOiBhbnkpPT4gdG9rZW4udHlwZS5pbmNsdWRlcygndmFyJykpO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpPWluZGV4LnN0YXJ0KzE7aTw9aW5kZXguZW5kO2krKyl7XHJcbiAgICAgICAgICAgICAgIHZhbHVlID0gdGhpcy50b2tlbnNbaV0udmFsdWUgKyB2YWx1ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy9pZiAoaXNWYXIpdXBkYXRlZFRva2VuLnZhcmlhYmxlPWlzVmFyLnZhcmlhYmxlXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4LnN0YXJ0XSA9IG5ldyBUb2tlbih2YWx1ZSxpc1Zhcj8udmFyaWFibGUpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXguc3RhcnQrMSwgaW5kZXguZW5kIC0gaW5kZXguc3RhcnQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcclxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcclxuICAgICAgICAgICAgJiYgIXRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKVxyXG4gICAgICAgIClcclxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxyXG4gICAgfVxyXG5cclxuICAgIGluc2VydFRva2VucyhzdGFydDogYW55LCBsZW5ndGg6IG51bWJlciwgb2JqZWN0czogYW55W10gfCBUb2tlbikge1xyXG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlY29uc3RydWN0KHRva2Vucz86IGFueSl7XHJcbiAgICAgICAgaWYgKCF0b2tlbnMpe3Rva2Vucz10aGlzLnRva2Vuczt9XHJcbiAgICAgICAgY29uc3QgYWRkUGx1c0luZGV4ZXM9dGhpcy5pbmRleGVzVG9BZGRQbHVzKHRva2Vucyk7XHJcbiAgICAgICAgY29uc3QgY3VybHlCcmFja2V0SW5kZXhlcyA9IHRoaXMuY3VybHlCcmFja2V0SURzKHRva2VucykuZmxhdE1hcCgoeyBvcGVuLCBjbG9zZSB9KSA9PiBbb3BlbiwgY2xvc2VdKTtcclxuICAgICAgICBsZXQgbWF0aCA9IFwiXCI7XHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8dG9rZW5zLmxlbmd0aDtpKyspe1xyXG4gICAgICAgICAgICBsZXQgdGVtcDtcclxuICAgICAgICAgICAgbWF0aCs9YWRkUGx1c0luZGV4ZXMuaW5jbHVkZXMoaSk/JysnOicnO1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldPy52YWx1ZT09PVwiKFwiJiZ0b2tlbnNbdG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuOiB7IGlkOiBhbnk7IH0sIGluZGV4OiBudW1iZXIpID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQmJnRva2Vuc1tpbmRleCsxXSkrMV0udmFsdWU9PT1cIi9cIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbWF0aCs9XCJcXFxcZnJhY1wiO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN3aXRjaCAodG9rZW5zW2ldPy50eXBlKXtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJudW1iZXJcIjpcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBcInBvd2VyVmFyaWFibGVcIjpcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJvcGVyYXRvclwiOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0gaW5zdGFuY2VvZiBUb2tlbilcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0aCs9dG9rZW5zW2ldPy50b1N0cmluZ0xhdGV4KClcclxuICAgICAgICAgICAgICAgICAgICAvL3RlbXA9cm91bmRCeVNldHRpbmdzKHRva2Vuc1tpXS52YWx1ZSlcclxuICAgICAgICAgICAgICAgICAgICAvL21hdGgrPXRlbXArKGkrMTx0b2tlbnMubGVuZ3RoJiYvKGZyYWMpLy50ZXN0KHRva2Vuc1tpKzFdLnZhbHVlKT9cIitcIjpcIlwiKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJwYXJlblwiOlxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPWN1cmx5QnJhY2tldEluZGV4ZXMuY29udGFpbnMoaSk/dG9rZW5zW2ldLnZhbHVlLnJlcGxhY2UoL1xcKC8sXCJ7XCIpLnJlcGxhY2UoL1xcKS8sXCJ9XCIpOnRva2Vuc1tpXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcih0aGlzLnRva2VucylcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgdG9rZW4gdHlwZSBnaXZlbiB0byByZWNvbnN0cnVjdDogdHlwZSAke3Rva2Vuc1tpXT8udHlwZX1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWF0aFxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjdXJseUJyYWNrZXRJRHModG9rZW5zID0gdGhpcy50b2tlbnMpIHtcclxuICAgICAgICBjb25zdCByaWdodEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpLCAuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ3JpZ2h0JyldO1xyXG4gICAgICAgIGNvbnN0IGJvdGhCcmFja2V0cyA9IFsuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ2JvdGgnKV07XHJcbiAgICAgICAgY29uc3QgZG91YmxlUmlnaHRCcmFja2V0cyA9IFsuLi5nZXRPcGVyYXRvcnNCeUJyYWNrZXQoJ2RvdWJsZVJpZ2h0JyldO1xyXG4gICAgICAgIGNvbnN0IG1hcDogeyBvcGVuOiBhbnk7IGNsb3NlOiBhbnk7IGlkOiBhbnk7IH1bXSA9IFtdO1xyXG4gICAgXHJcbiAgICAgICAgdG9rZW5zLmZvckVhY2goKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdG9rZW5zW2luZGV4IC0gMV0/LnZhbHVlO1xyXG4gICAgICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0b2tlbnNbaW5kZXggKyAxXT8udmFsdWU7XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSAnKCcpIHtcclxuICAgICAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgZG91YmxlUmlnaHRCcmFja2V0cy5pbmNsdWRlcyhwcmV2VG9rZW4pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcDEgPSBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4LCB0b2tlbnMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBwMS5jbG9zZSArIDEsIHRva2Vucyk7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLnB1c2gocDEsIHAyKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaW5kZXggPiAwICYmIHJpZ2h0QnJhY2tldHMuaW5jbHVkZXMocHJldlRva2VuKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hcC5wdXNoKGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2VucykpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSAnKScgJiYgYm90aEJyYWNrZXRzLmluY2x1ZGVzKG5leHRUb2tlbikpIHtcclxuICAgICAgICAgICAgICAgIG1hcC5wdXNoKGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2VucykpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIGluZGV4ZXNUb0FkZFBsdXModG9rZW5zOiBhbnlbXSl7XHJcbiAgICAgICAgcmV0dXJuIHRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+aW5kZXg+MFxyXG4gICAgICAgICAgICAmJnRva2Vuc1tpbmRleCAtIDFdPy5pc1ZhbHVlVG9rZW4oKVxyXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxyXG4gICAgICAgICkuZmlsdGVyKGl0ZW09Pml0ZW0hPT1udWxsKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcclxuICAgICAgICBjb25zdCByZWdFeHB2YWx1ZSA9ICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcclxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmbGF0dGVuQXJyYXkoYXJyOiBhbnkpIHtcclxuICAgIGxldCByZXN1bHQgPSBbXTtcclxuICAgIGxldCBzdGFjayA9IEFycmF5LmlzQXJyYXkoYXJyKSA/IFsuLi5hcnJdIDogW2Fycl07XHJcblxyXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IG5leHQgPSBzdGFjay5wb3AoKTtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShuZXh0KSkge1xyXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLm5leHQpOyBcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaChuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFRva2Vue1xyXG4gICAgdmFsdWU/OiBudW1iZXI7XHJcbiAgICB2YXJpYWJsZT86IHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOm51bWJlciAsdmFyaWFibGU/OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZT12YXJpYWJsZTtcclxuICAgIH1cclxuICAgIGlzVmFyKCkge3JldHVybiB0aGlzLnZhcmlhYmxlIT09dW5kZWZpbmVkfVxyXG5cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbntcclxuICAgIHR5cGU6IHN0cmluZztcclxuICAgIHZhbHVlPzogc3RyaW5nfG51bWJlcjtcclxuICAgIHZhcmlhYmxlPzogc3RyaW5nO1xyXG4gICAgbW9kaWZpZXI6IGFueTtcclxuICAgIGlkOiBQYXJlbjtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IodmFsdWU6IHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZCx2YXJpYWJsZT86IGFueSl7XHJcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlPXZhcmlhYmxlO1xyXG4gICAgICAgIHRoaXMuc2V0VHlwZSgpO1xyXG4gICAgICAgIHRoaXMuaW5zdXJQcm9wZXJGb3JtYXR0aW5nKClcclxuICAgIH1cclxuICAgIGluc3VyUHJvcGVyRm9ybWF0dGluZygpe1xyXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nb3BlcmF0b3InJiZ0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnKXtcclxuICAgICAgICAgICAgdGhpcy52YWx1ZT1zZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMudmFsdWUpPy5uYW1lXHJcbiAgICAgICAgfVxyXG4gICAgICAgLy8gaWYgKCF0aGlzLnZhbHVlKXt0aHJvdyBuZXcgRXJyb3IoJ3d0ZiBWYWx1ZSB3YXMgdW5kZWZpbmVkIGF0IHRva2VuIGluc3VyUHJvcGVyRm9ybWF0dGluZycpfVxyXG4gICAgfVxyXG4gICAgZ2V0SWQoKXtyZXR1cm4gdGhpcy5pZC5pZH07XHJcblxyXG4gICAgZ2V0TGF0ZXhTeW1ib2woKXtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJz9zZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMudmFsdWUpPy5sYXRleDp1bmRlZmluZWR9XHJcblxyXG4gICAgZ2V0RnVsbFRva2VuSUQoKXtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMudHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlICdudW1iZXInOlxyXG4gICAgICAgICAgICBjYXNlICdwcmFuZSc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlO1xyXG4gICAgICAgICAgICBjYXNlICdvcGVyYXRvcic6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlKyc6Jyt0aGlzLnZhbHVlXHJcbiAgICAgICAgICAgIGNhc2UgJ3ZhcmlhYmxlJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnR5cGUrJzonK3RoaXMudmFyaWFibGVcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBnZXRmdWxsVHlwZSgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnR5cGVcclxuICAgIH1cclxuXHJcbiAgICBzZXRUeXBlKCl7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycpe1xyXG4gICAgICAgICAgICB0aGlzLnR5cGU9dGhpcy52YWx1ZS5tYXRjaCgvWygpXS8pPydwYXJlbic6J29wZXJhdG9yJztcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnR5cGU9dGhpcy52YXJpYWJsZT8ndmFyaWFibGUnOidudW1iZXInO1xyXG4gICAgfVxyXG5cclxuICAgIGlzU3RyaW5nKCl7cmV0dXJuIHRoaXMudHlwZT09PSdwYXJlbid8fHRoaXMudHlwZT09PSdvcGVyYXRvcid9XHJcblxyXG4gICAgaXNWYWx1ZVRva2VuKCl7cmV0dXJuIHRoaXMudHlwZT09PSd2YXJpYWJsZSd8fHRoaXMudHlwZT09PSdudW1iZXInfVxyXG5cclxuICAgIHRvU3RyaW5nTGF0ZXgoKXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnXHJcbiAgICAgICAgaWYgKHRoaXMuaXNTdHJpbmcoKSlcclxuICAgICAgICAgICAgc3RyaW5nKz10aGlzLmdldExhdGV4U3ltYm9sKClcclxuICAgICAgICBpZiAodGhpcy50eXBlPT09J3ZhcmlhYmxlJykgc3RyaW5nKz10aGlzLnRvU3RyaW5nVmFyaWFibGUoKVxyXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nbnVtYmVyJykgc3RyaW5nKz10aGlzLnZhbHVlO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmdcclxuICAgIH1cclxuICAgIGFmZmVjdGVkT3BlcmF0b3JSYW5nZShkaXJlY3Rpb246IHN0cmluZyl7XHJcbiAgICAgICAgaWYodGhpcy50eXBlIT09J29wZXJhdG9yJ3x8dGhpcy52YWx1ZT09PSdFcXVhbHMnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICBpZih0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnJiZkaXJlY3Rpb249PT0nbGVmdCcmJiFnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ2JvdGgnKS5pbmNsdWRlcyh0aGlzLnZhbHVlKSlcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxuICAgIHRvU3RyaW5nVmFyaWFibGUoKXtcclxuICAgICAgICByZXR1cm4gKHRoaXMudmFsdWUmJnRoaXM/LnZhbHVlIT09MT90aGlzLnZhbHVlOicnKSsodGhpcy52YXJpYWJsZXx8JycpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQcmFpc2luZ01ldGhvZHtcclxuICAgIHRva2Vuc1xyXG4gICAgb3ZlcnZpZXc6IGFueTtcclxuICAgIHZhcmlhYmxlczogYW55W107XHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM6IGFueSl7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zXHJcbiAgICAgICAgdGhpcy5vdmVydmlldz10aGlzLmdldE92ZXJ2aWV3KClcclxuICAgICAgICB0aGlzLmFzc2lnblZhcmlhYmxlcygpXHJcbiAgICB9XHJcbiAgICBpc1ZhcldpdGhWYWx1ZUJpZ2dlclRoYW5PbmUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuc29tZSgodDogYW55KT0+IHQudHlwZT09PSd2YXJpYWJsZScmJnQudmFsdWU+MSlcclxuICAgIH1cclxuXHJcbiAgICBpc011bHRpcGxpY2F0aW9uSXNvbGF0ZSgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhhc2VWYXJpYWJsZSgpJiZ0aGlzLmlzVmFyV2l0aFZhbHVlQmlnZ2VyVGhhbk9uZSgpJiZ0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKClcclxuICAgIH1cclxuICAgIGlzSXNvbGF0ZSgpe1xyXG4gICAgICAgIC8vcmV0dXJuIHRoaXMuXHJcbiAgICB9XHJcblxyXG4gICAgaXNBbnl0aGluZ1RvSXNvbGF0ZSgpe1xyXG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzLmxlbmd0aD4xKXRocm93IG5ldyBFcnJvcihcInR3byB2YXIgZXEgYXJlbnQgc2Fwb3J0ZWQgeWV0XCIpXHJcbiAgICAgICAgaWYoIXRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlyZXR1cm47XHJcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLmVxdWFsc0luZGV4SWZBbnkoKTtcclxuICAgICAgICBpZighZXFJbmRleCl7cmV0dXJufTtcclxuICAgICAgICBjb25zdCBiZWZvciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoMCxlcUluZGV4KSlcclxuICAgICAgICBjb25zdCBhZnRlciA9IHRoaXMuZ2V0T3ZlcnZpZXcodGhpcy50b2tlbnMuc2xpY2UoZXFJbmRleCsxKSlcclxuICAgICAgICBjb25zdCB3aGF0VG9Jc29sYXQgPXRoaXMud2hhdFRvSXNvbGF0KCk7XHJcbiAgICAgICAgaWYgKCghYmVmb3J8fCFhZnRlcil8fCF3aGF0VG9Jc29sYXR8fChiZWZvcj8uc2l6ZTwyJiZhZnRlcj8uc2l6ZTwyKSlyZXR1cm47XHJcbiAgICAgICAgcmV0dXJuIHtvdmVydmlld1NpZGVPbmU6IGJlZm9yLG92ZXJ2aWV3U2lkZVR3bzogYWZ0ZXIsLi4ud2hhdFRvSXNvbGF0fVxyXG4gICAgfS8qXHJcbiAgICBob3dUb0lzb2xhdGUob3ZlcnZpZXdTaWRlT25lLG92ZXJ2aWV3U2lkZVR3byxpc29sYXRpb25Hb29sKXtcclxuICAgICAgICBjb25zdCBpc29sYXRpb25UeXBlPWlzb2xhdGlvbkdvb2wuc3BsdCgnOicpO1xyXG4gICAgICAgIC8vaWYgKCl7fVxyXG4gICAgfSovXHJcbiAgICB3aGF0VG9Jc29sYXQoKXtcclxuICAgICAgICAvLyBpIG5lZWQgdG8gYWRkIHBvd3MgYWZ0ZXJcclxuICAgICAgICAvLyBmb3Iga25vdyBpbSBnb2luZyBvbiB0aGUgb3Nob21zaGluIHRoYXQgdGhyIGlzIG9ubHkgb25lIHZhclxyXG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzPy5sZW5ndGg8MSlyZXR1cm47XHJcblxyXG4gICAgICAgIHJldHVybiB7dHlwZTogJ3ZhcmlhYmxlJyx2YWx1ZTogdGhpcy52YXJpYWJsZXNbMF19XHJcbiAgICB9LypcclxuICAgIGlzT3ZlcnZpZXdUb2lzb2xhdChvdmVydmlldyl7XHJcbiAgICB9Ki9cclxuICAgIGlzSW1iYWxhbmNlKG92ZXJ2aWV3OiB7IHNpemU6IG51bWJlcjsgfSl7XHJcbiAgICAgICAgb3ZlcnZpZXcuc2l6ZT4xXHJcbiAgICB9XHJcbiAgICBlcXVhbHNJbmRleElmQW55KCl7XHJcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLnRva2Vucy5tYXAoKHQ6IHsgdmFsdWU6IHN0cmluZzsgfSxpZHg6IGFueSk9PnQudmFsdWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKChtOiBudWxsKT0+bSE9PW51bGwpO1xyXG4gICAgICAgIHJldHVybiBlcUluZGV4WzBdO1xyXG4gICAgfVxyXG4gICAgaXNRdWFkcmF0aWMoKXtcclxuXHJcbiAgICB9XHJcbiAgICBpc0ZpbmFsUmV0dXJuKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmxlbmd0aDwyfHwodGhpcy5pc0VxdWFsc1RoZU9ubHlPcGVyYXRvcigpKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhc3NpZ25WYXJpYWJsZXMoKXtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcz1bXVxyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKXtcclxuICAgICAgICAgICAgaWYgKGtleT8uc3RhcnRzV2l0aCgndmFyaWFibGU6JykmJiF0aGlzLnZhcmlhYmxlcy5pbmNsdWRlcyh2YWx1ZS52YXJpYWJsZSkpe1xyXG4gICAgICAgICAgICAgICAgdGhpcy52YXJpYWJsZXMucHVzaCh2YWx1ZS52YXJpYWJsZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBoYXNlVmFyaWFibGUoKXtyZXR1cm4gdGhpcy52YXJpYWJsZXM/Lmxlbmd0aD4wfVxyXG5cclxuICAgIGlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpe1xyXG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxyXG4gICAgICAgIHJldHVybiAgZmlsdGVyLm5vTWF0Y2g+MFxyXG4gICAgfVxyXG4gICAgaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKXtcclxuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcclxuICAgICAgICByZXR1cm4gIGZpbHRlci5tYXRjaD09PTEmJmZpbHRlci5ub01hdGNoPT09MFxyXG4gICAgfVxyXG5cclxuICAgIGZpbHRlckJ5VHlwZSh0eXBlS2V5OiBzdHJpbmcsIHRhcmdldFZhbHVlOiBzdHJpbmcpe1xyXG4gICAgICAgIGxldCBtYXRjaD0wLCBub01hdGNoPTBcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLm92ZXJ2aWV3LmVudHJpZXMoKSkge1xyXG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKHR5cGVLZXkpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSB0eXBlS2V5Kyc6Jyt0YXJnZXRWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoKys7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIG5vTWF0Y2grKztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4geyBtYXRjaDogbWF0Y2gsIG5vTWF0Y2g6IG5vTWF0Y2ggfTtcclxuICAgIH1cclxuICAgIGdldE92ZXJ2aWV3KHRva2Vucz86IGFueVtdICkge1xyXG4gICAgICAgIGlmKCF0b2tlbnMpdG9rZW5zPXRoaXMudG9rZW5zXHJcbiAgICAgICAgaWYoIXRva2VucylyZXR1cm47XHJcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXcgPSBuZXcgTWFwKCk7XHJcbiAgICAgICAgdG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xyXG4gICAgICAgICAgICAvL2lmICghdG9rZW4uaXNWYWx1ZVRva2VuKCkpIHtyZXR1cm47fVxyXG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0b2tlbi5nZXRGdWxsVG9rZW5JRCgpXHJcbiAgICAgICAgICAgIC8vRXF1YWxzXHJcbiAgICAgICAgICAgIGlmICghb3ZlcnZpZXcuaGFzKGtleSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0geyBcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlbi50eXBlLCBcclxuICAgICAgICAgICAgICAgICAgICBjb3VudDogMCAsXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyaWFibGU6IHVuZGVmaW5lZFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09PSAndmFyaWFibGUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW50cnkudmFyaWFibGUgPSB0b2tlbi52YXJpYWJsZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICAgICAgb3ZlcnZpZXcuc2V0KGtleSwgZW50cnkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG92ZXJ2aWV3LmdldChrZXkpLmNvdW50Kys7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG92ZXJ2aWV3Ly9BcnJheS5mcm9tKG92ZXJ2aWV3LnZhbHVlcygpKTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgT3BlcmF0b3J7XHJcblxyXG59XHJcblxyXG5jbGFzcyBNb2RpZmllcntcclxuXHJcbn0iXX0=