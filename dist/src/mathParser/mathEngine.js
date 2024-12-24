import { quad, degreesToRadians, radiansToDegrees, calculateFactorial } from "./mathUtilities";
import { findParenIndex } from "../utils/tokenUtensils";
import { getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getOperatorsByBracket } from "../utils/dataManager";
import { MathGroup, mathJaxOperator, Token, Tokens } from "./mathJaxTokens";
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
        this.debugInfo += (typeof msg === "object" ? JSON.stringify(msg, null, 1) : msg) + " : " + (typeof value === "object" ? JSON.stringify(value, null, 1) : value) + "\n ";
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
            target = [tokens[breakChar]];
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
export function parseOperator(operator) {
    switch (operator.operator) {
        case "Sin":
            if (!operator.group1.isOperable())
                return false;
            const value = operator.group1.getOperableValue();
            if (value?.value === undefined)
                return false;
            operator.solution = new MathGroup([new Token(Math.sin(degreesToRadians(value.value)))]);
            break;
        default:
            throw new Error("Couldn't identify operator type in parseOperator: " + operator.operator);
    }
    return true;
}
export class MathPraiser {
    input = "";
    tokens;
    solution;
    mathInfo = new MathInfo();
    i = 0;
    constructor(input) {
        this.input = input;
        this.processInput();
        this.tokens = new Tokens(this.input);
        this.addDebugInfo("Tokens after tokenize", this.tokens.tokens);
        //this.input=this.tokens.reconstruct()
        this.solution = this.controller();
        console.log('this.tokens', this.tokens.tokens);
    }
    getRedyforNewRond() {
        //this.tokens.connectNearbyTokens();
        //this.mathInfo.addMathInfo(this.tokens)
        //this.addDebugInfo(this.tokens.tokens,this.tokens.tokens.length)
        //this.tokens.expressionVariableValidity();
    }
    groupMathTokens() {
        // Step one structure aka replace parentheses with nested arrays
        // Step two Find first operator.and continue from there
        /*
        const pos=new Position(tempTokens)
        const math=new mathJaxOperator(pos.operator)
        const group=new MathGroup()
        if(pos.index){
        const [leftBreak,length] = [pos.left.breakChar,pos.right.breakChar-pos.left.breakChar]
        group.setItems(pos.right.tokens)
        math.setGroup1(group)
        tempTokens.splice(leftBreak,length,math)}

        this.tokens=new MathGroup(tempTokens)*/
        return;
    }
    controller() {
        // The expression needs to be wrapped N a operator based on praising method Maybe not decided on it yet.
        console.log(this.tokens.tokens);
        this.tokens.tokens.combiningLikeTerms();
        for (let i = 0; i < this.tokens.tokens.items.length; i++) {
            const item = this.tokens.tokens.items[i];
            if (!(item instanceof mathJaxOperator))
                continue;
            this.tokens.tokens.items[i] = item.addSolution();
        }
        console.log(this.tokens.tokens);
        //this.tokens.tokens.addSolution()
        return this.tokens.tokens;
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
    solutionToString() {
        return this.solution.items[0].value.toString();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLElBQUksRUFBaUMsZ0JBQWdCLEVBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQU01SCxPQUFPLEVBQUUsY0FBYyxFQUF1QixNQUFNLHdCQUF3QixDQUFDO0FBQzdFLE9BQU8sRUFBMkIsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUscUJBQXFCLEVBQXFELE1BQU0sc0JBQXNCLENBQUM7QUFJck0sT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzVFLE1BQU0sWUFBWSxHQUFHO0lBQ2pCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTztJQUM1RSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLO0lBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87Q0FDMUQsQ0FBQztBQUNGOzs7R0FHRztBQUVILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFVO0lBQy9DLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNyQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ25DLElBQUksR0FBRyxDQUFD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LENBQUMsTUFBTTtZQUFDLE9BQU87UUFDbEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUMzQixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ25CLHNDQUFzQztZQUN0QyxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUE7WUFDbEMsUUFBUTtZQUNSLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sS0FBSyxHQUFHO29CQUNWLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtvQkFDaEIsS0FBSyxFQUFFLENBQUM7b0JBQ1IsUUFBUSxFQUFFLFNBQVM7aUJBQ3RCLENBQUM7Z0JBQ0YsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO29CQUM1QixLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0IsQ0FBQztZQUNELFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFFBQVEsQ0FBQSxDQUFBLGdDQUFnQztJQUNuRCxDQUFDO0NBQ0o7QUFFRCxNQUFNLFFBQVE7Q0FFYjtBQUVELE1BQU0sUUFBUTtDQUViIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4uL2ltVmVyeUxhenlcIjtcbmltcG9ydCB7IHR5cGUgfSBmcm9tIFwib3NcIjtcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7ICB9IGZyb20gXCJzcmMvdXRpbHMvc3RhdGljRGF0YVwiO1xuaW1wb3J0IHsgY3AgfSBmcm9tIFwiZnNcIjtcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRPcGVyYXRvcnNCeUJyYWNrZXQsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcbmltcG9ydCB7IG51bWJlciwgc3RyaW5nIH0gZnJvbSBcInpvZFwiO1xuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4gfSBmcm9tIFwic3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheFwiO1xuaW1wb3J0IHsgZ3JvdXAgfSBmcm9tIFwiY29uc29sZVwiO1xuaW1wb3J0IHsgTWF0aEdyb3VwLCBtYXRoSmF4T3BlcmF0b3IsIFRva2VuLCBUb2tlbnMgfSBmcm9tIFwiLi9tYXRoSmF4VG9rZW5zXCI7XG5jb25zdCBncmVla0xldHRlcnMgPSBbXG4gICAgJ0FscGhhJywnYWxwaGEnLCAnQmV0YScsICdHYW1tYScsICdEZWx0YScsICdFcHNpbG9uJywgJ1pldGEnLCAnRXRhJywgJ1RoZXRhJywgXG4gICAgJ0lvdGEnLCAnS2FwcGEnLCAnTGFtYmRhJywgJ011JywnbXUnLCAnTnUnLCAnWGknLCAnT21pY3JvbicsICdQaScsICdSaG8nLCBcbiAgICAnU2lnbWEnLCAnVGF1JywgJ1Vwc2lsb24nLCAnUGhpJywgJ0NoaScsICdQc2knLCAnT21lZ2EnXG5dO1xuLypjb25zdCBsYXRleE9wZXJhdG9ycz1bXG4gICAgJ3RhbicsICdzaW4nLCAnY29zJywgJ2Jpbm9tJywgJ2ZyYWMnLCAnYXNpbicsICdhY29zJywgXG4gICAgJ2F0YW4nLCAnYXJjY29zJywgJ2FyY3NpbicsICdhcmN0YW4nLCAnY2RvdCcsJ3NxcnQnXG5dKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhhcnI6IGFueVtdKSB7XG4gICAgY29uc3Qgc2VxdWVuY2VzID0gW107XG4gICAgbGV0IHN0YXJ0ID0gMDtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBhcnIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGFycltpXSAhPT0gYXJyW2kgLSAxXSArIDEpIHtcbiAgICAgICAgICAgIGlmIChpIC0gc3RhcnQgPiAxKSB7XG4gICAgICAgICAgICAgICAgc2VxdWVuY2VzLnB1c2goYXJyLnNsaWNlKHN0YXJ0LCBpKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdGFydCA9IGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNlcXVlbmNlcztcbn1cblxuXG5jb25zdCBvcGVyYXRvcnNGb3JNYXRoaW5mbyA9IHtcbiAgICBib3RoQnV0UmlnaHRCcmFja2V0OiBbXCJeXCJdLFxuICAgIHJpZ2h0QnJhY2tldEFuZFJlcXVpcmVzU2xhc2g6IFtcInNxcnRcIl0sXG4gICAgYm90aDogW1wiK1wiLCBcIi1cIiwgXCIqXCJdLFxuICAgIHNwZWNpYWw6IFtcIj1cIl0sXG4gICAgUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2g6IFtcInNpblwiLCBcImNvc1wiLCBcInRhblwiLCBcImFzaW5cIiwgXCJhY29zXCIsIFwiYXRhblwiLCBcImFyY3NpblwiLCBcImFyY2Nvc1wiLCBcImFyY3RhblwiXSxcbiAgICBkb3VibGVSaWdodEJ1dEJyYWNrZXQ6IFtcImZyYWNcIiwgXCJiaW5vbVwiLFwiL1wiXVxufTtcblxuZXhwb3J0IGNsYXNzIE1hdGhJbmZve1xuICAgIGRlYnVnSW5mbzogc3RyaW5nPVwiXCI7XG4gICAgc29sdXRpb25JbmZvOiBhbnlbXT1bXTtcbiAgICBtYXRoSW5mbzogYW55W109W11cbiAgICBncmFwaDogc3RyaW5nPVwiXCI7XG4gICAgYWRkR3JhcGhJbmZvKHZhbHVlOiBzdHJpbmcpe1xuICAgICAgICB0aGlzLmdyYXBoKz12YWx1ZTtcbiAgICB9XG4gICAgYWRkRGVidWdJbmZvKG1zZzogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPSh0eXBlb2YgbXNnPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeShtc2csbnVsbCwxKTptc2cpK1wiIDogXCIrKHR5cGVvZiB2YWx1ZT09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkodmFsdWUsbnVsbCwxKTp2YWx1ZSkrIFwiXFxuIFwiO1xuICAgIH1cbiAgICBhZGRTb2x1dGlvbkluZm8obWVzOiBzdHJpbmcgfCBudW1iZXIgfCBUb2tlbiB8IEF4aXMpe1xuICAgICAgICB0aGlzLnNvbHV0aW9uSW5mby5wdXNoKG1lcyk7XG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiU29sdmVkXCIsbWVzKTtcbiAgICB9XG4gICAgYWRkTWF0aEluZm8odG9rZW5zOiBUb2tlbnMpe1xuICAgICAgICBjb25zdCByZWNvbnN0cnVjdGVkTWF0aD10b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgICAgICB0aGlzLm1hdGhJbmZvLnB1c2gocmVjb25zdHJ1Y3RlZE1hdGgpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiUmVjb25zdHJ1Y3RlZCBtYXRoXCIscmVjb25zdHJ1Y3RlZE1hdGgpO1xuICAgIH1cblxuICAgIGFkZFNvbHV0aW9uKHRva2VuczogVG9rZW5zLHBvc2l0aW9uOiBQb3NpdGlvbixzb2x1dGlvbjogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcbiAgICAgICAgc29sdXRpb249dG9rZW5zLnJlY29uc3RydWN0KFtzb2x1dGlvbl0pO1xuICAgICAgICBjb25zdCBsZWZ0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyLHBvc2l0aW9uLmluZGV4KSk7XG4gICAgICAgIGNvbnN0IHJpZ2h0PXRva2Vucy5yZWNvbnN0cnVjdCh0b2tlbnMudG9rZW5zLnNsaWNlKHBvc2l0aW9uLmluZGV4KzEscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLCkpO1xuXG4gICAgICAgIHN3aXRjaCAodHJ1ZSl7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLmJvdGhCdXRSaWdodEJyYWNrZXQuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSAgYCR7bGVmdH0gJHtwb3NpdGlvbi5vcGVyYXRvcn0geyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5ib3RoLmluY2x1ZGVzKHBvc2l0aW9uLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGAke2xlZnR9ICR7cG9zaXRpb24ub3BlcmF0b3IucmVwbGFjZSgvXFwqL2csIFwiXFxcXGNkb3RcIil9ICR7cmlnaHR9ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIG9wZXJhdG9yc0Zvck1hdGhpbmZvLnNwZWNpYWwuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPSBgXFxcXGZyYWN7JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5yaWdodEJyYWNrZXRBbmRSZXF1aXJlc1NsYXNoLmluY2x1ZGVzKHBvc2l0aW9uLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICBzb2x1dGlvbj0gIGBcXFxcc3FydHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2Ugb3BlcmF0b3JzRm9yTWF0aGluZm8uUmlnaHRQYXJlbkFuZFJlcXVpcmVzU2xhc2guaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvcn0gKCR7cmlnaHR9KSA9ICR7c29sdXRpb259YFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBvcGVyYXRvcnNGb3JNYXRoaW5mby5kb3VibGVSaWdodEJ1dEJyYWNrZXQuaW5jbHVkZXMocG9zaXRpb24ub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHNvbHV0aW9uPWBcXFxcJHtwb3NpdGlvbi5vcGVyYXRvci5yZXBsYWNlKFwiL1wiLFwiZnJhY1wiKX17JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hZGRTb2x1dGlvbkluZm8oc29sdXRpb24pO1xuICAgIH1cbn1cblxuLypcbmZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xuICAgIGlmICghKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikpe3JldHVybiB2YWx1ZX1cbiAgICBpZiAodmFsdWU9PT1cIitcIil7cmV0dXJuIDB9XG4gICAgaWYgKHZhbHVlPT09XCItXCIpe3JldHVybiAtMX1cbiAgICBpZiAoL1thLXpBLVpdLy50ZXN0KHZhbHVlKSl7cmV0dXJuIDF9XG4gICAgaWYoL1soW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxuICAgIGlmKC9bKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cbiAgICBmb3IgKGxldCBpID0gMDsgaTx2YWx1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSBcInN0cmluZ1wiICYmIC9bKClbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XG4gICAgICAgICAgICBpLS07XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgbnVtID0gTnVtYmVyKHZhbHVlKTtcbiAgICByZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XG59Ki9cblxuZnVuY3Rpb24gcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3I6IHN0cmluZyxsZWZ0OiBhbnkscmlnaHQ6IGFueSl7XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PVwic3RyaW5nXCImJnR5cGVvZiBsZWZ0Py52YWx1ZSE9PVwibnVtYmVyXCImJmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpLmluY2x1ZGVzKG9wZXJhdG9yKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMZWZ0IHNpZGUgb2YgXCIrb3BlcmF0b3IrXCIgbXVzdCBoYXZlIGEgdmFsdWVcIik7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygb3BlcmF0b3I9PT1cInN0cmluZ1wiJiZ0eXBlb2YgcmlnaHQ/LnZhbHVlIT09XCJudW1iZXJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSaWdodCBzaWRlIG9mIFwiK29wZXJhdG9yK1wiIG11c3QgaGF2ZSBhIHZhbHVlXCIpO1xuICAgIH1cbn1cblxuXG5cbmZ1bmN0aW9uIHBhcnNlKHBvc2l0aW9uOiB7IG9wZXJhdG9yOiBhbnk7IHNwZWNpYWxDaGFyPzogYW55OyBsZWZ0PzogYW55OyByaWdodD86IGFueTsgfSkge1xuICAgIGxldCB7IG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LHJpZ2h0fSA9IHBvc2l0aW9uO1xuICAgIFxuICAgIGxlZnQ9bGVmdD8udG9rZW5zXG4gICAgcmlnaHQ9cmlnaHQudG9rZW5zXG4gICAgLy9jb25zb2xlLmxvZygndGhpcy5sZWZ0LHRoaXMucmlnaHQnLGxlZnQscmlnaHQpXG4gICAgcGFyc2VTYWZldHlDaGVja3Mob3BlcmF0b3IsbGVmdCxyaWdodCk7XG4gICAgXG4gICAgbGV0IHNvbHZlZD1uZXcgVG9rZW4oMCx1bmRlZmluZWQpO1xuICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcbiAgICAgICAgY2FzZSBcIlNxdWFyZSBSb290XCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodC52YWx1ZSxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiUG93XCI6XG4gICAgICAgICAgICBpZiAobGVmdC52YXJpYWJsZXx8cmlnaHQudmFyaWFibGUpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGV8fGxlZnQudmFyaWFibGU9PT1yaWdodC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlP3JpZ2h0LnZhcmlhYmxlOlwiXCI7XG4gICAgICAgICAgICAgICAgLy9zb2x2ZWQucG93PTJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQudmFsdWUscmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJGcmFjdGlvblwiOlxuICAgICAgICBjYXNlIFwiL1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKGxlZnQudmFsdWUpLyhyaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIk11bHRpcGxpY2F0aW9uXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICogcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBoYW5kbGVWcmlhYmxlcyhsZWZ0LCByaWdodCxzb2x2ZWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCIrXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0LnZhbHVlICsgcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdC52YXJpYWJsZT9sZWZ0LnZhcmlhYmxlOnJpZ2h0LnZhcmlhYmxlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJNaW51c1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdC52YWx1ZSAtIHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnQudmFyaWFibGU/bGVmdC52YXJpYWJsZTpyaWdodC52YXJpYWJsZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYmlub21cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGNhbGN1bGF0ZUZhY3RvcmlhbChsZWZ0LnZhbHVlLHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwic2luXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImNvc1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5jb3MoZGVncmVlc1RvUmFkaWFucyhyaWdodC52YWx1ZSkpXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInRhblwiOlxuICAgICAgICAgICAgaWYgKHJpZ2h0Pj05MCl7dGhyb3cgbmV3IEVycm9yKFwidGFuIE11c3QgYmUgc21hbGxlciB0aGFuIDkwXCIpO31cbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLnRhbihkZWdyZWVzVG9SYWRpYW5zKHJpZ2h0LnZhbHVlKSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJhc2luXCI6XG4gICAgICAgIGNhc2UgXCJhcmNzaW5cIjpcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hc2luKHJpZ2h0LnZhbHVlKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImFjb3NcIjpcbiAgICAgICAgY2FzZSBcImFyY2Nvc1wiOlxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmFkaWFuc1RvRGVncmVlcyhNYXRoLmFjb3MocmlnaHQudmFsdWUpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYXRhblwiOlxuICAgICAgICBjYXNlIFwiYXJjdGFuXCI6XG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbihyaWdodC52YWx1ZSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBpZGVudGlmeSBvcGVyYXRvciB0eXBlIGF0IHByYWlzZSBvcGVyYXRvcjogXCIrcG9zaXRpb24ub3BlcmF0b3IpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhhbmRsZVZhcmlhYmxlTXVsdGlwbGljYXRpb24obGVmdDogeyB2YXJpYWJsZTogYW55OyBwb3c6IGFueTsgdmFsdWU6IG51bWJlcjsgfSwgcmlnaHQ6IHsgdmFyaWFibGU6IGFueTsgcG93OiBhbnk7IHZhbHVlOiBudW1iZXI7IH0sIHNvbHZlZDogVG9rZW4pIHtcbiAgICAgICAgaWYgKGxlZnQudmFyaWFibGUgJiYgcmlnaHQudmFyaWFibGUgJiYgbGVmdC52YXJpYWJsZSAhPT0gcmlnaHQudmFyaWFibGUpIHtcbiAgICAgICAgICAgIC8qIEtlZXAgdGhlbSBzZXBhcmF0ZSBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZhcmlhYmxlc1xuICAgICAgICAgICAgc29sdmVkLnRlcm1zID0gW1xuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsIHBvdzogbGVmdC5wb3cgfHwgMSwgdmFsdWU6IGxlZnQudmFsdWUgfHwgMSB9LFxuICAgICAgICAgICAgICAgIHsgdmFyaWFibGU6IHJpZ2h0LnZhcmlhYmxlLCBwb3c6IHJpZ2h0LnBvdyB8fCAxLCB2YWx1ZTogcmlnaHQudmFsdWUgfHwgMSB9XG4gICAgICAgICAgICBdOyovXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaWZmZXJlbnQgdmFyaWFibGUgYmFzZXMgYXQgcG93ZXIgbXVsdGlwbGljYXRpb24uIEkgZGlkbid0IGdldCB0aGVyZSB5ZXRcIilcbiAgICAgICAgfVxuICAgIFxuICAgICAgICBjb25zdCB2YXJpYWJsZSA9IGxlZnQudmFyaWFibGUgfHwgcmlnaHQudmFyaWFibGU7XG4gICAgICAgIHNvbHZlZC52YXJpYWJsZSA9IHZhcmlhYmxlLmxlbmd0aD4wP3ZhcmlhYmxlOnVuZGVmaW5lZDtcbiAgICAgICAgXG4gICAgICAgIGxldCBwb3cgPSAobGVmdC5wb3cgfHwgMCkgKyAocmlnaHQucG93IHx8IDApO1xuICAgICAgICBwb3c9bGVmdC52YXJpYWJsZSAmJiByaWdodC52YXJpYWJsZSYmcG93PT09MCYmIWxlZnQucG93JiYhcmlnaHQucG93PzI6cG93O1xuICAgICAgICAvL3NvbHZlZC5wb3cgPSBwb3cgfHwgdW5kZWZpbmVkO1xuICAgICAgICBcblxuICAgICAgICAvLyBSdWxlIDM6IEhhbmRsZSBtdWx0aXBsaWNhdGlvbiBvZiBjb25zdGFudHNcbiAgICAgICAgY29uc3QgbGVmdFZhbHVlID0gbGVmdC52YWx1ZSB8fCAxO1xuICAgICAgICBjb25zdCByaWdodFZhbHVlID0gcmlnaHQudmFsdWUgfHwgMTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBsZWZ0VmFsdWUgKiByaWdodFZhbHVlO1xuICAgICAgICAvLyBJZiB0aGVyZSdzIG5vIHZhcmlhYmxlLCBhc3NpZ24gdGhlIHJlc3VsdCBhcyBhIGNvbnN0YW50XG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgXG5cbiAgICBmdW5jdGlvbiBoYW5kbGVWcmlhYmxlcyhsZWZ0OiBhbnkscmlnaHQ6IGFueSxzb2x2ZWQ6IFRva2VuKXtcbiAgICAgICAgbGV0IGhhbmRsZWQ9e1ZhcjpudWxsLFBvdzpudWxsfTtcbiAgICAgICAgaWYgKCFsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe1xuICAgICAgICAgICAgcmV0dXJuIDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocG9zaXRpb24ub3BlcmF0b3I9PT0nKicpe3JldHVybiBoYW5kbGVWYXJpYWJsZU11bHRpcGxpY2F0aW9uKGxlZnQscmlnaHQsc29sdmVkKX1cbiAgICAgICAgLy9jb25zb2xlLmxvZyhsZWZ0LnZhcmlhYmxlLHJpZ2h0LnZhcmlhYmxlKVxuICAgICAgICBpZiAobGVmdC52YXJpYWJsZSE9PXJpZ2h0LnZhcmlhYmxlKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlR3byB2YXJpYWJsZSBlcXVhdGlvbnMgYXJlbid0IGFjY2VwdGVkIHlldFwiKTtcbiAgICAgICAgfVxuICAgICAgICAvL2hhbmRsZWQuVmFyPWxlZnQudmFyO1xuICAgICAgICAvL3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhclxuXG4gICAgICAgIC8qXG4gICAgICAgIGlmIChsZWZ0LnZhcmlhYmxlJiYhcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1sZWZ0LnZhcmlhYmxlfVxuICAgICAgICBlbHNlIGlmICghbGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZX1cbiAgICAgICAgZWxzZSBpZiAobGVmdC52YXJpYWJsZSYmcmlnaHQudmFyaWFibGUpe3NvbHZlZC52YXJpYWJsZT1yaWdodC52YXJpYWJsZTtzb2x2ZWQucG93PTJ9XG4gICAgICAgICovXG4gICAgfVxuXG5cbiAgICByZXR1cm4gc29sdmVkO1xufVxuXG5cblxuXG5cbmZ1bmN0aW9uIHJlYXJyYW5nZUVxdWF0aW9uKHRva2VuczogYW55LHRva2VuVG9pc29sYXRlOiBhbnkpe1xuICAgIFxufVxuXG5mdW5jdGlvbiBpc29sYXRlTXVsdGlwbGljYXRpb24odG9rZW5zOiBhbnksaXNvbGF0VG9rZW46IFRva2VuKXtcbiAgICBjb25zdCBpbmRleD1vcGVyYXRpb25zT3JkZXIodG9rZW5zKVxuICAgIGNvbnN0IElzb2xhdGVkPXRva2Vucy50b2tlbnMuZmluZCgodG9rZW46IGFueSwgaWR4OiBudW1iZXIpPT5pZHg8aW5kZXgpXG4gICAgY29uc3QgZnJhYz1jcmVhdGVGcmFjKHRva2Vucy5saXN0LnNsaWNlKGluZGV4ICsgMSksbmV3IFRva2VuKElzb2xhdGVkLnZhbHVlKSlcbiAgICBJc29sYXRlZC52YWx1ZT0xO1xuICAgIHRva2Vucy5pbnNlcnRUb2tlbnMoaW5kZXgrMSx0b2tlbnMudG9rZW5zLmxlbmd0aC1pbmRleCsxLGZyYWMpXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZyYWMobm9taW5hdG9yOiBhbnksZGVub21pbmF0b3I6IFRva2VuKXtcbiAgIC8vIHJldHVybiBbbmV3IFRva2VuKCdmcmFjJyksbmV3IFRva2VuKCcoJyksbm9taW5hdG9yLG5ldyBUb2tlbignKScpLG5ldyBUb2tlbignKCcpLGRlbm9taW5hdG9yLG5ldyBUb2tlbignKScpXVxufVxuZnVuY3Rpb24gc2ltcGxpZml5KHRva2VuczogYW55W10pe1xuICAgIGlmICh0b2tlbnMubGVuZ3RoPD0xKXtyZXR1cm4gdG9rZW5zfVxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xuICAgIHdoaWxlIChpPD0xMDAmJnRva2Vucy5zb21lKCh0b2tlbjogYW55KSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKSlcbiAgICB7XG4gICAgICAgIGkrKztcbiAgICAgICAgbGV0IGVxaW5kZXg9dG9rZW5zLmZpbmRJbmRleCgodG9rZW46IHsgdmFsdWU6IHN0cmluZzsgfSkgPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKTtcbiAgICAgICAgbGV0IE9wZXJhdGlvbkluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9KSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgaWYgKE9wZXJhdGlvbkluZGV4PT09LTEpe3JldHVybiB0b2tlbnM7fVxuXG4gICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxuXG4gICAgICAgIGxldCBudW1iZXJHcm91cCA9IHRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbjogYW55LCBpOiBhbnkpID0+ICh7IHRva2VuLCBvcmlnaW5hbEluZGV4OiBpIH0pKSBcbiAgICAgICAgLmZpbHRlcigoaXRlbTogeyB0b2tlbjogeyB0eXBlOiBhbnk7IH07IH0pID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcbiAgICAgICAgLnJlZHVjZSgoc3VtOiBudW1iZXIsIGl0ZW06IHsgb3JpZ2luYWxJbmRleDogbnVtYmVyOyB0b2tlbjogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBudW1iZXI7IH07IH0pID0+IHtcbiAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09IFwiLVwiKSA/IC0xIDogMTtcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcbiAgICAgICAgaWYgKCEoLyhudW1iZXIpLykudGVzdChpdGVtLnRva2VuLnR5cGUpKXttdWx0aXBsaWVyKj0tMX1cbiAgICAgICAgcmV0dXJuIHN1bSArIChpdGVtLnRva2VuLnZhbHVlICogbXVsdGlwbGllcik7XG4gICAgICAgIH0sIDApOyBcbiAgICAgICAgXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKHtcbiAgICAgICAgICAgIC4uLmN1cnJlbnRUb2tlbixcbiAgICAgICAgICAgIHZhbHVlOiBudW1iZXJHcm91cFxuICAgICAgICB9KTtcblxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMuZmlsdGVyKHRva2VuID0+IFxuICAgICAgICAgICAgdG9rZW4udHlwZSAhPT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlIHx8IFxuICAgICAgICAgICAgKHRva2VuLnZhcmlhYmxlICYmIHRva2VuLnZhcmlhYmxlICE9PSBjdXJyZW50VG9rZW4udmFyaWFibGUpIHx8IFxuICAgICAgICAgICAgKHRva2VuLnBvdyAmJiB0b2tlbi5wb3cgIT09IGN1cnJlbnRUb2tlbi5wb3cpXG4gICAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBuZXdUb2tlbnM7XG59XG5cbmZ1bmN0aW9uIHJlYXJyYW5nZUZvcklzb2xhdGlvbih0b2tlbnM6IFRva2VucywgaXNvbGF0aW9uR29hbDogeyB0eXBlOiBhbnk7IHZhbHVlOiBhbnk7IG92ZXJ2aWV3U2lkZU9uZT86IE1hcDxhbnksIGFueT47IG92ZXJ2aWV3U2lkZVR3bz86IE1hcDxhbnksIGFueT47IH0pIHtcbiAgICBpZiAodG9rZW5zLnRva2Vucy5sZW5ndGggPD0gMSkgcmV0dXJuIHRva2VucztcblxuICAgIGNvbnN0IGVxSW5kZXggPSB0b2tlbnMudG9rZW5zLmZpbmRJbmRleCgodDogeyB2YWx1ZTogc3RyaW5nOyB9KSA9PiB0LnZhbHVlID09PSAnRXF1YWxzJyk7XG4gICAgaWYgKGVxSW5kZXggPT09IC0xKSB0aHJvdyBuZXcgRXJyb3IoXCJObyAnRXF1YWxzJyBvcGVyYXRvciBmb3VuZCBpbiB0b2tlbnNcIik7XG5cbiAgICBjb25zdCBzd2l0Y2hEaXJlY3Rpb24gPSBmYWxzZTsgLy8gRnV0dXJlIGxvZ2ljIHRvIGRldGVybWluZSBkaXJlY3Rpb25cbiAgICBjb25zdCBpc29sYXRpb25Hb2FsSW5kaWNlcyA9IHRva2Vucy50b2tlbnNcbiAgICAgICAgLm1hcCgodDogeyB0eXBlOiBhbnk7IHZhcmlhYmxlOiBhbnk7IH0sIGlkeDogYW55KSA9PiAodC50eXBlID09PSBpc29sYXRpb25Hb2FsLnR5cGUgJiYgdC52YXJpYWJsZSA9PT0gaXNvbGF0aW9uR29hbC52YWx1ZSA/IGlkeCA6IG51bGwpKVxuICAgICAgICAuZmlsdGVyKChpZHg6IG51bGx8bnVtYmVyKSA9PiBpZHggIT09IG51bGwpO1xuXG4gICAgY29uc3Qgb3RoZXJJbmRpY2VzID0gdG9rZW5zLnRva2Vuc1xuICAgICAgICAubWFwKChfOiBhbnksIGlkeDogYW55KSA9PiAoIWlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGlkeCkgJiYgaWR4ICE9PSBlcUluZGV4ID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeDogbnVsbHxudW1iZXIpID0+IGlkeCAhPT0gbnVsbCk7XG5cbiAgICAvLyBBZGp1c3Qgc2lnbnNcbiAgICB0b2tlbnMudG9rZW5zLmZvckVhY2goKHRva2VuOiB7IHZhbHVlOiBudW1iZXI7IH0sIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBpZiAoKHN3aXRjaERpcmVjdGlvbj8gaSA+IGVxSW5kZXggOiBpIDwgZXFJbmRleCkgJiYgb3RoZXJJbmRpY2VzLmluY2x1ZGVzKGkpKSB7XG4gICAgICAgICAgICB0b2tlbi52YWx1ZSAqPSAtMTtcbiAgICAgICAgfSBlbHNlIGlmICgoc3dpdGNoRGlyZWN0aW9uPyBpIDwgZXFJbmRleCA6IGkgPiBlcUluZGV4KSAmJiBpc29sYXRpb25Hb2FsSW5kaWNlcy5pbmNsdWRlcyhpKSkge1xuICAgICAgICAgICAgdG9rZW4udmFsdWUgKj0gLTE7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFNlcGFyYXRlIHNpZGVzXG4gICAgY29uc3Qgc2lkZTE6IGFueVtdID0gW107XG4gICAgY29uc3Qgc2lkZTI6IGFueVtdID0gW107XG4gICAgdG9rZW5zLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55LCBpOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKGlzb2xhdGlvbkdvYWxJbmRpY2VzLmluY2x1ZGVzKGkpKSBzaWRlMS5wdXNoKHRva2VuKTtcbiAgICAgICAgaWYgKG90aGVySW5kaWNlcy5pbmNsdWRlcyhpKSkgc2lkZTIucHVzaCh0b2tlbik7XG4gICAgfSk7XG5cbiAgICB0b2tlbnMudG9rZW5zID0gc3dpdGNoRGlyZWN0aW9uXG4gICAgICAgID8gWy4uLnNpZGUyLCB0b2tlbnMudG9rZW5zW2VxSW5kZXhdLCAuLi5zaWRlMV1cbiAgICAgICAgOiBbLi4uc2lkZTEsIHRva2Vucy50b2tlbnNbZXFJbmRleF0sIC4uLnNpZGUyXTtcbn1cblxuZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2VuczogYW55W10pIHtcbiAgICBmdW5jdGlvbiBmaW5kT3BlcmF0b3JJbmRleChiZWdpbjogbnVtYmVyLCBlbmQ6IG51bWJlciwgdG9rZW5zOiBhbnksIGZpbmRQYXJlbkluZGV4PzogYW55LCByZWdleD86IGFueSkge1xuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgaW5kZXg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChyZWdleCkge1xuICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogYW55OyB9KSA9PiB0b2tlbi50eXBlID09PSBcIm9wZXJhdG9yXCIgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gdG9rZW4udHlwZSA9PT0gXCJvcGVyYXRvclwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpbmRleCArPSBiZWdpbjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKCEvWystXS8udGVzdCh0b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaW5kZXggLSAxXS50eXBlID09PSB0b2tlbnNbaW5kZXggKyAxXS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBiZWdpbiA9IGluZGV4ICsgMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgbGV0IGJlZ2luID0gMCwgZW5kID0gdG9rZW5zLmxlbmd0aCxqPTA7XG4gICAgbGV0IGN1cnJlbnRJRCA9IG51bGw7ICBcbiAgICBsZXQgY2hlY2tlZElEczogYW55W10gPSBbXTsgIFxuICAgIGxldCBvcGVyYXRvckZvdW5kID0gZmFsc2U7XG4gICAgd2hpbGUgKCFvcGVyYXRvckZvdW5kJiZqPDIwMCkge1xuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGorKztcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09IFwiKFwiICYmICFjaGVja2VkSURzLmluY2x1ZGVzKHRva2Vuc1tpXS5pZCkpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50SUQgPSBmaW5kUGFyZW5JbmRleCh0b2tlbnNbaV0uaWQpOyAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY3VycmVudElEIT09bnVsbCYmaT09PWN1cnJlbnRJRC5jbG9zZSkge1xuICAgICAgICAgICAgICAgIFtiZWdpbixlbmRdPVtjdXJyZW50SUQub3BlbixjdXJyZW50SUQuY2xvc2VdXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICghY3VycmVudElEKSB7XG4gICAgICAgICAgICBiZWdpbiA9IDA7XG4gICAgICAgICAgICBlbmQgPSB0b2tlbnMubGVuZ3RoO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgb3BlcmF0b3JGb3VuZCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLGVuZCx0b2tlbnMpIT09LTE7XG5cbiAgICAgICAgLy8gSWYgbm8gb3BlcmF0b3IgaXMgZm91bmQsIG1hcmsgdGhpcyBwYXJlbnRoZXNlcyBwYWlyIGFzIGNoZWNrZWRcbiAgICAgICAgaWYgKCFvcGVyYXRvckZvdW5kKSB7XG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElELmlkKTsgIFxuICAgICAgICAgICAgY3VycmVudElEID0gbnVsbDsgIFxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChqPj0yMDApe3Rocm93IG5ldyBFcnJvcihcIm9wZXJhdGlvbnNPcmRlciBGYWlsZWQgZXhjZWVkZWQgMjAwIHJldmlzaW9uc1wiKTt9XG5cbiAgICBmb3IgKGxldCBpPTE7aTw9NjtpKyspe1xuICAgICAgICBsZXQgcHJpb3JpdHkgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5KGksdHJ1ZSkpO1xuICAgICAgICBpZihwcmlvcml0eSE9PS0xKXJldHVybiBwcmlvcml0eVxuICAgIH1cbiAgICByZXR1cm4gbnVsbFxufVxuXG5cbmV4cG9ydCBjbGFzcyBQb3NpdGlvbiB7XG4gICAgb3BlcmF0b3I6IHN0cmluZztcbiAgICBpbmRleDogbnVtYmVyO1xuICAgIHRyYW5zaXRpb246IG51bWJlcjtcbiAgICBzcGVjaWFsQ2hhcjogc3RyaW5nO1xuICAgIGxlZnQ6IGFueTtcbiAgICByaWdodDogYW55O1xuICAgIGNvbnN0cnVjdG9yKHRva2VuczogYW55W10sIGluZGV4PzogbnVtYmVyKXtcbiAgICAgICAgaWYoaW5kZXgpXG4gICAgICAgIHRoaXMuaW5kZXggPSBpbmRleDtcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5pbmRleDtcbiAgICAgICAgdGhpcy5wb3NpdGlvbih0b2tlbnMpXG4gICAgfVxuICAgIHBvc2l0aW9uKHRva2VuczogYW55W10pIHtcbiAgICAgICAgdGhpcy5pbmRleCA9ICF0aGlzLmluZGV4PyBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSA6IHRoaXMuaW5kZXg7XG4gICAgICAgIGlmICh0aGlzLmluZGV4ID09PSBudWxsIHx8IHRoaXMuaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9wZXJhdG9yID0gdG9rZW5zW3RoaXMuaW5kZXhdLnZhbHVlO1xuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdib3RoJykuaW5jbHVkZXModGhpcy5vcGVyYXRvcik6XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy5pbmRleCxcImxlZnRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5yaWdodCA9IHRoaXMuYXBwbHlQb3NpdGlvbih0b2tlbnMsIHRoaXMuaW5kZXgsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdyaWdodCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpOlxuICAgICAgICAgICAgICAgIHRoaXMubGVmdCA9IHticmVha0NoYXI6IHRoaXMuaW5kZXh9O1xuICAgICAgICAgICAgICAgIHRoaXMucmlnaHQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnZG91YmxlUmlnaHQnKS5pbmNsdWRlcyh0aGlzLm9wZXJhdG9yKTpcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQgPSB0aGlzLmFwcGx5UG9zaXRpb24odG9rZW5zLCB0aGlzLmluZGV4LFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy5sZWZ0LmJyZWFrQ2hhcjtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gdGhpcy5hcHBseVBvc2l0aW9uKHRva2VucywgdGhpcy50cmFuc2l0aW9uLTEsXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxlZnQuYnJlYWtDaGFyID0gdGhpcy5pbmRleDtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0LmJyZWFrQ2hhcisodGhpcy5yaWdodC5tdWx0aVN0ZXA/MTowKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYXRvciAke3RoaXMub3BlcmF0b3J9IHdhcyBub3QgYWNjb3VudGVkIGZvciwgb3IgaXMgbm90IHRoZSB2YWxpZCBvcGVyYXRvcmApO1xuICAgICAgICB9XG4gICAgICAgIC8vY29uc29sZS5sb2codG9rZW5zLnRva2VucylcbiAgICAgICAgdGhpcy5zcGVjaWFsQ2hhcj10b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgPyB0b2tlbnNbdGhpcy5pbmRleF0uc3BlY2lhbENoYXIgOiBudWxsO1xuICAgIH1cbiAgICBhcHBseVBvc2l0aW9uKHRva2VuczogYW55W10sIGluZGV4OiAgbnVtYmVyLCBkaXJlY3Rpb246IHN0cmluZykge1xuICAgICAgICBsZXQgYnJlYWtDaGFyPWluZGV4XG4gICAgICAgIGxldCB0YXJnZXQ6IGFueVtdO1xuICAgICAgICBsZXQgbXVsdGlTdGVwPWZhbHNlO1xuICAgICAgICBjb25zdCBpc0xlZnQgPSBkaXJlY3Rpb24gPT09IFwibGVmdFwiO1xuICAgICAgICBjb25zdCBpbmRleE1vZGlmaWVyID0gIGlzTGVmdD8tIDEgOiAgMTtcbiAgICAgICAgaWYgKChpc0xlZnQgJiYgaW5kZXggPD0gMCkgfHwgKCFpc0xlZnQgJiYgaW5kZXggPj0gdG9rZW5zLmxlbmd0aCAtIDEpIHx8ICF0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImF0IGFwcGx5UG9zaXRpb246IFxcXCJpbmRleCB3YXNuJ3QgdmFsaWRcXFwiIGluZGV4OiBcIitpbmRleCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRva2Vuc1tpbmRleCtpbmRleE1vZGlmaWVyXS50eXBlID09PSBcInBhcmVuXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVuSW5kZXggPSBmaW5kUGFyZW5JbmRleCh0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0uaWQpO1xuICAgICAgICAgICAgYnJlYWtDaGFyID0gIGlzTGVmdCA/IHBhcmVuSW5kZXgub3BlbiA6IHBhcmVuSW5kZXguY2xvc2UrMTtcbiAgICAgICAgICAgIHRhcmdldCA9IHRva2Vucy5zbGljZShwYXJlbkluZGV4Lm9wZW4sIHBhcmVuSW5kZXguY2xvc2UrMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBicmVha0NoYXI9aW5kZXgraW5kZXhNb2RpZmllcjtcbiAgICAgICAgICAgIHRhcmdldCA9IFt0b2tlbnNbYnJlYWtDaGFyXV07XG4gICAgICAgICAgICBicmVha0NoYXIrPWlzTGVmdD8wOjFcbiAgICAgICAgfVxuICAgICAgICAvL2NvbnN0IG11bHRpU3RlcCA9IE1hdGguYWJzKGJyZWFrQ2hhciAtIGluZGV4KSA+IDM7XG4gICAgXG4gICAgICAgIGlmICghbXVsdGlTdGVwJiZ0b2tlbnNbaW5kZXgraW5kZXhNb2RpZmllcl0udHlwZSA9PT0gXCJwYXJlblwiKXtcbiAgICAgICAgICAgIC8vdGFyZ2V0PXRhcmdldC5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcbiAgICAgICAgfVxuICAgICAgICBpZiAodGFyZ2V0Py5sZW5ndGg9PT0wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGF0IGFwcGx5UG9zaXRpb246IGNvdWxkbid0IGZpbmQgdGFyZ2V0IHRva2VuIGZvciBkaXJlY3Rpb24gJHtkaXJlY3Rpb259IGFuZCBvcGVyYXRvclwiJHt0b2tlbnNbaW5kZXhdLnZhbHVlfVwiYCwpO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIC8vYnJlYWtDaGFyID0gKGJyZWFrQ2hhciAhPT0gaW5kZXggPyB0YXJnZXQ/LmluZGV4IDogYnJlYWtDaGFyKSsgaW5kZXhNb2RpZmllcisoaXNMZWZ0PzA6MSk7XG4gICAgICAgIC8vZGVsZXRlIHRhcmdldC5pbmRleFxuICAgICAgICBcbiAgICAgICAgaWYgKHRhcmdldC5sZW5ndGg9PT0zKXtcbiAgICAgICAgICAgIC8vdGFyZ2V0PXRhcmdldC5maW5kKChpdGVtOiB7IHR5cGU6IHN0cmluZzsgfSkgPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcbiAgICAgICAgfWVsc2UgaWYodGFyZ2V0Lmxlbmd0aD4xKW11bHRpU3RlcD10cnVlXG4gICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0b2tlbnM6IHRhcmdldCxcbiAgICAgICAgICAgIG11bHRpU3RlcDogbXVsdGlTdGVwLFxuICAgICAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXIsXG4gICAgICAgIH07XG4gICAgfVxuICAgIGNoZWNrTXVsdGlTdGVwKCl7XG4gICAgICAgIHJldHVybiAoKGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnYm90aCcpLmluY2x1ZGVzKHRoaXMub3BlcmF0b3IpJiZ0aGlzLmxlZnQ/Lm11bHRpU3RlcCl8fHRoaXMucmlnaHQ/Lm11bHRpU3RlcCkmJnRoaXMub3BlcmF0b3I9PT0nTXVsdGlwbGljYXRpb24nO1xuICAgIH1cbiAgICBpc0xlZnRWYXIoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVmdC5tdWx0aVN0ZXA/dGhpcy5sZWZ0LnRva2Vucy5zb21lKCh0OiB7IHR5cGU6IHN0cmluZzsgfSk9PnQudHlwZT09PSd2YXJpYWJsZSd8fHQudHlwZT09PSdwb3dlclZhcmlhYmxlJyk6dGhpcy5sZWZ0LnRva2Vucy50eXBlLmluY2x1ZGVzKCdhcmlhYmxlJylcbiAgICB9XG4gICAgaXNSaWdodFZhcigpe1xuICAgICAgICByZXR1cm4gdGhpcy5yaWdodC5tdWx0aVN0ZXA/dGhpcy5yaWdodC50b2tlbnMuc29tZSgodDogeyB0eXBlOiBzdHJpbmc7IH0pPT50LnR5cGU9PT0ndmFyaWFibGUnfHx0LnR5cGU9PT0ncG93ZXJWYXJpYWJsZScpOnRoaXMucmlnaHQudG9rZW5zLnR5cGUuaW5jbHVkZXMoJ2FyaWFibGUnKVxuICAgIH1cbiAgICBjaGVja0ZyYWMoKXsvLyF0aGlzLmNoZWNrTXVsdGlTdGVwKCkgSSBkb24ndCBrbm93IHdoeSBJIGhhZCB0aGlzIGhlcmVcbiAgICAgICAgcmV0dXJuIC8oZnJhY3xcXC8pLy50ZXN0KHRoaXMub3BlcmF0b3IpJiYodGhpcy5pc0xlZnRWYXIoKXx8dGhpcy5pc1JpZ2h0VmFyKCkpXG4gICAgfVxufVxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlT3BlcmF0b3Iob3BlcmF0b3I6IG1hdGhKYXhPcGVyYXRvcik6IGJvb2xlYW4ge1xuICAgIHN3aXRjaCAob3BlcmF0b3Iub3BlcmF0b3IpIHtcbiAgICAgICAgY2FzZSBcIlNpblwiOlxuICAgICAgICAgICAgaWYgKCFvcGVyYXRvci5ncm91cDEuaXNPcGVyYWJsZSgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9wZXJhdG9yLmdyb3VwMS5nZXRPcGVyYWJsZVZhbHVlKCk7XG4gICAgICAgICAgICBpZiAodmFsdWU/LnZhbHVlID09PSB1bmRlZmluZWQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIG9wZXJhdG9yLnNvbHV0aW9uID1uZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4oTWF0aC5zaW4oZGVncmVlc1RvUmFkaWFucyh2YWx1ZS52YWx1ZSkpKV0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgXCJDb3VsZG4ndCBpZGVudGlmeSBvcGVyYXRvciB0eXBlIGluIHBhcnNlT3BlcmF0b3I6IFwiICsgb3BlcmF0b3Iub3BlcmF0b3JcbiAgICAgICAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBNYXRoUHJhaXNlcntcbiAgICBpbnB1dD1cIlwiO1xuICAgIHRva2VuczogVG9rZW5zO1xuICAgIHNvbHV0aW9uOiBhbnk7XG4gICAgbWF0aEluZm89bmV3IE1hdGhJbmZvKCk7XG4gICAgaT0wO1xuICAgIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpe1xuICAgICAgICB0aGlzLmlucHV0PWlucHV0O1xuICAgICAgICB0aGlzLnByb2Nlc3NJbnB1dCgpO1xuICAgICAgICB0aGlzLnRva2Vucz1uZXcgVG9rZW5zKHRoaXMuaW5wdXQpO1xuXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwiVG9rZW5zIGFmdGVyIHRva2VuaXplXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICAvL3RoaXMuaW5wdXQ9dGhpcy50b2tlbnMucmVjb25zdHJ1Y3QoKVxuICAgICAgICB0aGlzLnNvbHV0aW9uPXRoaXMuY29udHJvbGxlcigpO1xuICAgICAgICBjb25zb2xlLmxvZygndGhpcy50b2tlbnMnLHRoaXMudG9rZW5zLnRva2Vucyk7XG4gICAgfVxuICAgIGdldFJlZHlmb3JOZXdSb25kKCl7XG4gICAgICAgIC8vdGhpcy50b2tlbnMuY29ubmVjdE5lYXJieVRva2VucygpO1xuICAgICAgICAvL3RoaXMubWF0aEluZm8uYWRkTWF0aEluZm8odGhpcy50b2tlbnMpXG4gICAgICAgIC8vdGhpcy5hZGREZWJ1Z0luZm8odGhpcy50b2tlbnMudG9rZW5zLHRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGgpXG4gICAgICAgIC8vdGhpcy50b2tlbnMuZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKTtcbiAgICB9XG4gICAgZ3JvdXBNYXRoVG9rZW5zKCl7XG4gICAgICAgIC8vIFN0ZXAgb25lIHN0cnVjdHVyZSBha2EgcmVwbGFjZSBwYXJlbnRoZXNlcyB3aXRoIG5lc3RlZCBhcnJheXNcbiAgICAgICAgICAgICAgICAvLyBTdGVwIHR3byBGaW5kIGZpcnN0IG9wZXJhdG9yLmFuZCBjb250aW51ZSBmcm9tIHRoZXJlXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICBjb25zdCBwb3M9bmV3IFBvc2l0aW9uKHRlbXBUb2tlbnMpXG4gICAgICAgICAgICAgICAgY29uc3QgbWF0aD1uZXcgbWF0aEpheE9wZXJhdG9yKHBvcy5vcGVyYXRvcilcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cD1uZXcgTWF0aEdyb3VwKClcbiAgICAgICAgICAgICAgICBpZihwb3MuaW5kZXgpe1xuICAgICAgICAgICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3MubGVmdC5icmVha0NoYXIscG9zLnJpZ2h0LmJyZWFrQ2hhci1wb3MubGVmdC5icmVha0NoYXJdXG4gICAgICAgICAgICAgICAgZ3JvdXAuc2V0SXRlbXMocG9zLnJpZ2h0LnRva2VucylcbiAgICAgICAgICAgICAgICBtYXRoLnNldEdyb3VwMShncm91cClcbiAgICAgICAgICAgICAgICB0ZW1wVG9rZW5zLnNwbGljZShsZWZ0QnJlYWssbGVuZ3RoLG1hdGgpfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucz1uZXcgTWF0aEdyb3VwKHRlbXBUb2tlbnMpKi9cbiAgICAgICAgICAgICAgICByZXR1cm4gO1xuICAgIH1cbiAgICBjb250cm9sbGVyKCk6IGFueXtcbiAgICAgICAgLy8gVGhlIGV4cHJlc3Npb24gbmVlZHMgdG8gYmUgd3JhcHBlZCBOIGEgb3BlcmF0b3IgYmFzZWQgb24gcHJhaXNpbmcgbWV0aG9kIE1heWJlIG5vdCBkZWNpZGVkIG9uIGl0IHlldC5cblxuXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgXG4gICAgICAgIHRoaXMudG9rZW5zLnRva2Vucy5jb21iaW5pbmdMaWtlVGVybXMoKVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudG9rZW5zLnRva2Vucy5pdGVtcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHRoaXMudG9rZW5zLnRva2Vucy5pdGVtc1tpXTtcbiAgICAgICAgXG4gICAgICAgICAgICBpZiAoIShpdGVtIGluc3RhbmNlb2YgbWF0aEpheE9wZXJhdG9yKSkgY29udGludWU7XG4gICAgICAgIFxuICAgICAgICAgICAgdGhpcy50b2tlbnMudG9rZW5zLml0ZW1zW2ldID0gaXRlbS5hZGRTb2x1dGlvbigpO1xuICAgICAgICB9ICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2codGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICAvL3RoaXMudG9rZW5zLnRva2Vucy5hZGRTb2x1dGlvbigpXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy50b2tlbnM7XG4gICAgICAgIFxuICAgICAgICAvKlxuICAgICAgICB0aGlzLmkrKztcbiAgICAgICAgaWYodGhpcy5pPjEwKXtyZXR1cm4gdGhpcy5maW5hbFJldHVybigpfVxuXG4gICAgICAgIHRoaXMuZ2V0UmVkeWZvck5ld1JvbmQoKTtcbiAgICAgICAgLy9jb25zdCBvdmVydmlldz10aGlzLnRva2Vucy5nZXRPdmVydmlldygpXG4gICAgICAgIGNvbnN0IHByYWlzaW5nTWV0aG9kPW5ldyBQcmFpc2luZ01ldGhvZCh0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgIGlmIChwcmFpc2luZ01ldGhvZC5pc1RoZXJlT3BlcmF0b3JPdGhlclRoYW5FcXVhbHMoKSl7XG4gICAgICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLnRva2Vucyk7XG4gICAgICAgICAgICB0aGlzLmFkZERlYnVnSW5mbyhcIlBhcnNlZCBleHByZXNzaW9uXCIsIEpTT04uc3RyaW5naWZ5KHBvc2l0aW9uLCBudWxsLCAxKSk7XG4gICAgICAgICAgICBpZiAocG9zaXRpb24gPT09IG51bGwmJnRoaXMudG9rZW5zLnRva2Vucy5sZW5ndGg+MSl7XG4gICAgICAgICAgICAgICAgLy90aGlzLmFkZERlYnVnSW5mbyhcInBhcnNlKHRva2VucylcIixwYXJzZSh0aGlzLnRva2Vucy50b2tlbnMpKVxuICAgICAgICAgICAgICAgIHJldHVybiBcInRoZSAqKioqXCJcbiAgICAgICAgICAgIC8vIHJldHVybiBzb2x1dGlvbih0b2tlbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uLmNoZWNrRnJhYygpfHxwb3NpdGlvbi5jaGVja011bHRpU3RlcCgpKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGV4cGFuZEV4cHJlc3Npb24odGhpcy50b2tlbnMscG9zaXRpb24pO1xuICAgICAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkU29sdXRpb25JbmZvKHRoaXMudG9rZW5zLnJlY29uc3RydWN0KHRoaXMudG9rZW5zLnRva2VucykpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnVzZVBhcnNlKHBvc2l0aW9uKVxuICAgICAgICB9XG4gICAgICAgIGlmKHByYWlzaW5nTWV0aG9kLmlzTXVsdGlwbGljYXRpb25Jc29sYXRlKCkpe1xuICAgICAgICAgICAgdGhpcy51c2VJc29sYXQocHJhaXNpbmdNZXRob2QpXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdG9Jc29sYXRlPXByYWlzaW5nTWV0aG9kLmlzQW55dGhpbmdUb0lzb2xhdGUoKVxuICAgICAgICBpZiAodG9Jc29sYXRlKXtcbiAgICAgICAgICAgIHJlYXJyYW5nZUZvcklzb2xhdGlvbih0aGlzLnRva2Vucyx0b0lzb2xhdGUpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICAgICAgfSAgIFxuICAgICAgICAvL2lmIChzb2x2ZWQgPT09IG51bGx8fHR5cGVvZiBzb2x2ZWQ9PT1cInN0cmluZ1wiKSB7cmV0dXJuIHNvbHZlZDsgfVxuICAgICAgICByZXR1cm4gdGhpcy5maW5hbFJldHVybigpLy90aGlzLnRva2Vucy50b2tlbnMubGVuZ3RoPjE/dGhpcy5jb250cm9sbGVyKCk6dGhpcy5maW5hbFJldHVybigpOyovXG4gICAgfVxuICAgIHNvbHV0aW9uVG9TdHJpbmcoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuc29sdXRpb24uaXRlbXNbMF0udmFsdWUudG9TdHJpbmcoKVxuICAgIH1cblxuICAgIHVzZVBhcnNlKHBvc2l0aW9uOiBQb3NpdGlvbil7XG4gICAgICAgIGNvbnN0IHNvbHZlZCA9IHBhcnNlKHBvc2l0aW9uKTtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8oXCJzb2x2ZWRcIixzb2x2ZWQpXG4gICAgICAgIGNvbnN0IFtsZWZ0QnJlYWssbGVuZ3RoXSA9IFtwb3NpdGlvbi5sZWZ0LmJyZWFrQ2hhcixwb3NpdGlvbi5yaWdodC5icmVha0NoYXItcG9zaXRpb24ubGVmdC5icmVha0NoYXJdXG4gICAgICAgIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGRTb2x1dGlvbih0aGlzLnRva2Vucyxwb3NpdGlvbixzb2x2ZWQpXG4gICAgICAgIHRoaXMuYWRkRGVidWdJbmZvKFwibmV3VG9rZW5zXCIsdGhpcy50b2tlbnMudG9rZW5zKVxuICAgICAgICByZXR1cm4gdGhpcy5jb250cm9sbGVyKClcbiAgICB9XG4gICAgXG4gICAgcHJhaXNpbmdNZXRob2QoKXtcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgZmlsdGVyQnlUeXBlPSh0eXBlKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcih0b2tlbiA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcbiAgICAgICAgY29uc3QgW251bWJlckluZGV4LHZhcmlhYmxlSW5kZXgscG93SW5kZXhdID0gW2ZpbHRlckJ5VHlwZShcIm51bWJlclwiKSxmaWx0ZXJCeVR5cGUoXCJ2YXJpYWJsZVwiKSxmaWx0ZXJCeVR5cGUoXCJwb3dlclZhcmlhYmxlXCIpXVxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVzZVF1YWRyYXRpYygpXG4gICAgICAgIHJldHVybiB0aGlzLnVzZUlzb2xhdCgpOyovXG4gICAgfVxuXG4gICAgdXNlSXNvbGF0KHByYWlzaW5nTWV0aG9kOiBQcmFpc2luZ01ldGhvZCl7XG4gICAgICAgIGlzb2xhdGVNdWx0aXBsaWNhdGlvbih0aGlzLnRva2VucyxuZXcgVG9rZW4ocHJhaXNpbmdNZXRob2QudmFyaWFibGVzWzBdKSlcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlcigpXG4gICAgICAgIC8vdGhpcy50b2tlbnMuaW5zZXJ0VG9rZW5zKClcbiAgICAgICAgLy9Vc2UgcG9zc2Vzc2lvblxuICAgIH1cblxuICAgIHVzZVF1YWRyYXRpYygpe1xuICAgICAgICB0aGlzLnRva2Vucy50b2tlbnM9c2ltcGxpZml5KHRoaXMudG9rZW5zLnRva2VucylcbiAgICAgICAgICAgIGNvbnN0IGZpbHRlckJ5VHlwZT0odHlwZTogc3RyaW5nKT0+dGhpcy50b2tlbnMudG9rZW5zLmZpbHRlcigodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9KSA9PiB0b2tlbi50eXBlID09PSB0eXBlKTtcbiAgICAgICAgICAgIGNvbnN0IFtudW1iZXJJbmRleCx2YXJpYWJsZUluZGV4LHBvd0luZGV4XSA9IFtmaWx0ZXJCeVR5cGUoXCJudW1iZXJcIiksZmlsdGVyQnlUeXBlKFwidmFyaWFibGVcIiksZmlsdGVyQnlUeXBlKFwicG93ZXJWYXJpYWJsZVwiKV1cbiAgICAgICAgICAgIHRoaXMubWF0aEluZm8uYWRkRGVidWdJbmZvKFwic2ltcGxpZml5KHRva2VucylcIix0aGlzLnRva2Vucy50b2tlbnMpXG4gICAgICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcXVhZChcbiAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0/LnZhbHVlICB8IDAsXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0/LnZhbHVlIHwgMCxcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0/LnZhbHVlICogLTF8IDAsXG4gICAgICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdLnZhcmlhYmxlLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgfVxuICAgIGFkZERlYnVnSW5mbyhtZXM6IHN0cmluZyx2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgVG9rZW4gfCBBeGlzKXtcbiAgICAgICAgdGhpcy5tYXRoSW5mby5hZGREZWJ1Z0luZm8obWVzLHZhbHVlKVxuICAgIH1cbiAgICBwcm9jZXNzSW5wdXQoKXtcbiAgICAgICAgdGhpcy5pbnB1dD10aGlzLmlucHV0XG4gICAgICAgIC5yZXBsYWNlKC8oTWF0aC58XFxcXHxcXHN8bGVmdHxyaWdodCkvZywgXCJcIikgXG4gICAgICAgIC5yZXBsYWNlKC97L2csIFwiKFwiKVxuICAgICAgICAucmVwbGFjZSgvfS9nLCBcIilcIilcbiAgICAgICAgLy8ucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XG4gICAgfVxuICAgIGZpbmFsUmV0dXJuKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5yZWNvbnN0cnVjdCgpXG4gICAgfVxufVxuXG5jbGFzcyBtYXRoVmFyaWFibGVze1xuXG59XG5cblxuXG5cblxuXG5cblxuXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkFycmF5KGFycjogYW55KSB7XG4gICAgbGV0IHJlc3VsdCA9IFtdO1xuICAgIGxldCBzdGFjayA9IEFycmF5LmlzQXJyYXkoYXJyKSA/IFsuLi5hcnJdIDogW2Fycl07XG5cbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IG5leHQgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobmV4dCkpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4ubmV4dCk7IFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2gobmV4dCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5yZXZlcnNlKCk7XG59XG5cblxuXG5jbGFzcyBQcmFpc2luZ01ldGhvZHtcbiAgICB0b2tlbnNcbiAgICBvdmVydmlldzogYW55O1xuICAgIHZhcmlhYmxlczogYW55W107XG4gICAgY29uc3RydWN0b3IodG9rZW5zOiBhbnkpe1xuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnNcbiAgICAgICAgdGhpcy5vdmVydmlldz10aGlzLmdldE92ZXJ2aWV3KClcbiAgICAgICAgdGhpcy5hc3NpZ25WYXJpYWJsZXMoKVxuICAgIH1cbiAgICBpc1ZhcldpdGhWYWx1ZUJpZ2dlclRoYW5PbmUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLnNvbWUoKHQ6IGFueSk9PiB0LnR5cGU9PT0ndmFyaWFibGUnJiZ0LnZhbHVlPjEpXG4gICAgfVxuXG4gICAgaXNNdWx0aXBsaWNhdGlvbklzb2xhdGUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFzZVZhcmlhYmxlKCkmJnRoaXMuaXNWYXJXaXRoVmFsdWVCaWdnZXJUaGFuT25lKCkmJnRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKVxuICAgIH1cbiAgICBpc0lzb2xhdGUoKXtcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5cbiAgICB9XG5cbiAgICBpc0FueXRoaW5nVG9Jc29sYXRlKCl7XG4gICAgICAgIGlmKHRoaXMudmFyaWFibGVzLmxlbmd0aD4xKXRocm93IG5ldyBFcnJvcihcInR3byB2YXIgZXEgYXJlbnQgc2Fwb3J0ZWQgeWV0XCIpXG4gICAgICAgIGlmKCF0aGlzLmlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCkpcmV0dXJuO1xuICAgICAgICBjb25zdCBlcUluZGV4PXRoaXMuZXF1YWxzSW5kZXhJZkFueSgpO1xuICAgICAgICBpZighZXFJbmRleCl7cmV0dXJufTtcbiAgICAgICAgY29uc3QgYmVmb3IgPSB0aGlzLmdldE92ZXJ2aWV3KHRoaXMudG9rZW5zLnNsaWNlKDAsZXFJbmRleCkpXG4gICAgICAgIGNvbnN0IGFmdGVyID0gdGhpcy5nZXRPdmVydmlldyh0aGlzLnRva2Vucy5zbGljZShlcUluZGV4KzEpKVxuICAgICAgICBjb25zdCB3aGF0VG9Jc29sYXQgPXRoaXMud2hhdFRvSXNvbGF0KCk7XG4gICAgICAgIGlmICgoIWJlZm9yfHwhYWZ0ZXIpfHwhd2hhdFRvSXNvbGF0fHwoYmVmb3I/LnNpemU8MiYmYWZ0ZXI/LnNpemU8MikpcmV0dXJuO1xuICAgICAgICByZXR1cm4ge292ZXJ2aWV3U2lkZU9uZTogYmVmb3Isb3ZlcnZpZXdTaWRlVHdvOiBhZnRlciwuLi53aGF0VG9Jc29sYXR9XG4gICAgfS8qXG4gICAgaG93VG9Jc29sYXRlKG92ZXJ2aWV3U2lkZU9uZSxvdmVydmlld1NpZGVUd28saXNvbGF0aW9uR29vbCl7XG4gICAgICAgIGNvbnN0IGlzb2xhdGlvblR5cGU9aXNvbGF0aW9uR29vbC5zcGx0KCc6Jyk7XG4gICAgICAgIC8vaWYgKCl7fVxuICAgIH0qL1xuICAgIHdoYXRUb0lzb2xhdCgpe1xuICAgICAgICAvLyBpIG5lZWQgdG8gYWRkIHBvd3MgYWZ0ZXJcbiAgICAgICAgLy8gZm9yIGtub3cgaW0gZ29pbmcgb24gdGhlIG9zaG9tc2hpbiB0aGF0IHRociBpcyBvbmx5IG9uZSB2YXJcbiAgICAgICAgaWYodGhpcy52YXJpYWJsZXM/Lmxlbmd0aDwxKXJldHVybjtcblxuICAgICAgICByZXR1cm4ge3R5cGU6ICd2YXJpYWJsZScsdmFsdWU6IHRoaXMudmFyaWFibGVzWzBdfVxuICAgIH0vKlxuICAgIGlzT3ZlcnZpZXdUb2lzb2xhdChvdmVydmlldyl7XG4gICAgfSovXG4gICAgaXNJbWJhbGFuY2Uob3ZlcnZpZXc6IHsgc2l6ZTogbnVtYmVyOyB9KXtcbiAgICAgICAgb3ZlcnZpZXcuc2l6ZT4xXG4gICAgfVxuICAgIGVxdWFsc0luZGV4SWZBbnkoKXtcbiAgICAgICAgY29uc3QgZXFJbmRleD10aGlzLnRva2Vucy5tYXAoKHQ6IHsgdmFsdWU6IHN0cmluZzsgfSxpZHg6IGFueSk9PnQudmFsdWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKChtOiBudWxsKT0+bSE9PW51bGwpO1xuICAgICAgICByZXR1cm4gZXFJbmRleFswXTtcbiAgICB9XG4gICAgaXNRdWFkcmF0aWMoKXtcblxuICAgIH1cbiAgICBpc0ZpbmFsUmV0dXJuKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5sZW5ndGg8Mnx8KHRoaXMuaXNFcXVhbHNUaGVPbmx5T3BlcmF0b3IoKSlcbiAgICB9XG4gICAgXG4gICAgYXNzaWduVmFyaWFibGVzKCl7XG4gICAgICAgIHRoaXMudmFyaWFibGVzPVtdXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKXtcbiAgICAgICAgICAgIGlmIChrZXk/LnN0YXJ0c1dpdGgoJ3ZhcmlhYmxlOicpJiYhdGhpcy52YXJpYWJsZXMuaW5jbHVkZXModmFsdWUudmFyaWFibGUpKXtcbiAgICAgICAgICAgICAgICB0aGlzLnZhcmlhYmxlcy5wdXNoKHZhbHVlLnZhcmlhYmxlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaGFzZVZhcmlhYmxlKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzPy5sZW5ndGg+MH1cblxuICAgIGlzVGhlcmVPcGVyYXRvck90aGVyVGhhbkVxdWFscygpe1xuICAgICAgICBjb25zdCBmaWx0ZXI9dGhpcy5maWx0ZXJCeVR5cGUoJ29wZXJhdG9yJywnRXF1YWxzJylcbiAgICAgICAgcmV0dXJuICBmaWx0ZXIubm9NYXRjaD4wXG4gICAgfVxuICAgIGlzRXF1YWxzVGhlT25seU9wZXJhdG9yKCl7XG4gICAgICAgIGNvbnN0IGZpbHRlcj10aGlzLmZpbHRlckJ5VHlwZSgnb3BlcmF0b3InLCdFcXVhbHMnKVxuICAgICAgICByZXR1cm4gIGZpbHRlci5tYXRjaD09PTEmJmZpbHRlci5ub01hdGNoPT09MFxuICAgIH1cblxuICAgIGZpbHRlckJ5VHlwZSh0eXBlS2V5OiBzdHJpbmcsIHRhcmdldFZhbHVlOiBzdHJpbmcpe1xuICAgICAgICBsZXQgbWF0Y2g9MCwgbm9NYXRjaD0wXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMub3ZlcnZpZXcuZW50cmllcygpKSB7XG4gICAgICAgICAgICBpZiAoa2V5Py5zdGFydHNXaXRoKHR5cGVLZXkpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gdHlwZUtleSsnOicrdGFyZ2V0VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2grKztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBub01hdGNoKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG1hdGNoOiBtYXRjaCwgbm9NYXRjaDogbm9NYXRjaCB9O1xuICAgIH1cbiAgICBnZXRPdmVydmlldyh0b2tlbnM/OiBhbnlbXSApIHtcbiAgICAgICAgaWYoIXRva2Vucyl0b2tlbnM9dGhpcy50b2tlbnNcbiAgICAgICAgaWYoIXRva2VucylyZXR1cm47XG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3ID0gbmV3IE1hcCgpO1xuICAgICAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XG4gICAgICAgICAgICAvL2lmICghdG9rZW4uaXNWYWx1ZVRva2VuKCkpIHtyZXR1cm47fVxuICAgICAgICAgICAgY29uc3Qga2V5ID0gdG9rZW4uZ2V0RnVsbFRva2VuSUQoKVxuICAgICAgICAgICAgLy9FcXVhbHNcbiAgICAgICAgICAgIGlmICghb3ZlcnZpZXcuaGFzKGtleSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeSA9IHsgXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLnR5cGUsIFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogMCAsXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlOiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09PSAndmFyaWFibGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGVudHJ5LnZhcmlhYmxlID0gdG9rZW4udmFyaWFibGU7XG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgIG92ZXJ2aWV3LnNldChrZXksIGVudHJ5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG92ZXJ2aWV3LmdldChrZXkpLmNvdW50Kys7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gb3ZlcnZpZXcvL0FycmF5LmZyb20ob3ZlcnZpZXcudmFsdWVzKCkpO1xuICAgIH1cbn1cblxuY2xhc3MgT3BlcmF0b3J7XG5cbn1cblxuY2xhc3MgTW9kaWZpZXJ7XG5cbn0iXX0=