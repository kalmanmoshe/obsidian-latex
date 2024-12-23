
import { quad,calculateBinom,roundBySettings ,degreesToRadians,radiansToDegrees, calculateFactorial} from "./mathUtilities";
import { expandExpression,curlyBracketsRegex } from "../imVeryLazy";
import { type } from "os";
import { arrToRegexString, Axis, regExp } from "../tikzjax/tikzjax";
import {  } from "src/utils/staticData";
import { cp } from "fs";
import { findParenIndex, Paren,idParentheses } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getOperatorsByBracket, hasImplicitMultiplication, searchMathJaxOperators } from "../utils/dataManager";
import { number, string } from "zod";
import { BasicTikzToken } from "src/tikzjax/interpret/tokenizeTikzjax";
import { group } from "console";
import { mathGroup, mathJaxOperator, Token, Tokens } from "./mathJaxTokens";
const greekLetters = [
    'Alpha','alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 
    'Iota', 'Kappa', 'Lambda', 'Mu','mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 
    'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'
];
/*const latexOperators=[
    'tan', 'sin', 'cos', 'binom', 'frac', 'asin', 'acos', 
    'atan', 'arccos', 'arcsin', 'arctan', 'cdot','sqrt'
]*/

export function findConsecutiveSequences(arr: any[]) {
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
    doubleRightButBracket: ["frac", "binom","/"]
};

export class MathInfo{
    debugInfo: string="";
    solutionInfo: any[]=[];
    mathInfo: any[]=[]
    graph: string="";
    addGraphInfo(value: string){
        this.graph+=value;
    }
    addDebugInfo(msg: string, value: string | number | Token | Axis){
        this.debugInfo+=(typeof msg==="object"?JSON.stringify(msg):msg)+" : "+(typeof value==="object"?JSON.stringify(value):value)+ "\n ";
    }
    addSolutionInfo(mes: string | number | Token | Axis){
        this.solutionInfo.push(mes);
        this.addDebugInfo("Solved",mes);
    }
    addMathInfo(tokens: Tokens){
        const reconstructedMath=tokens.reconstruct()
        this.mathInfo.push(reconstructedMath)
        this.addDebugInfo("Reconstructed math",reconstructedMath);
    }

    addSolution(tokens: Tokens,position: Position,solution: string | number | Token | Axis){
        solution=tokens.reconstruct([solution]);
        const left=tokens.reconstruct(tokens.tokens.slice(position.left.breakChar,position.index));
        const right=tokens.reconstruct(tokens.tokens.slice(position.index+1,position.right.breakChar,));

        switch (true){
            case operatorsForMathinfo.bothButRightBracket.includes(position.operator):
                solution=  `${left} ${position.operator} {${right}} = ${solution}`
                break;
            case operatorsForMathinfo.both.includes(position.operator):
                solution=  `${left} ${position.operator.replace(/\*/g, "\\cdot")} ${right} = ${solution}`
                break;
            case operatorsForMathinfo.special.includes(position.operator):
                solution= `\\frac{${left}}{${right}} = ${solution}`
                break;
                case operatorsForMathinfo.rightBracketAndRequiresSlash.includes(position.operator):
                solution=  `\\sqrt{${right}} = ${solution}`
                break;
            case operatorsForMathinfo.RightParenAndRequiresSlash.includes(position.operator):
                solution=`\\${position.operator} (${right}) = ${solution}`
                break;
            case operatorsForMathinfo.doubleRightButBracket.includes(position.operator):
                solution=`\\${position.operator.replace("/","frac")}{${left}}{${right}} = ${solution}`
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

function parseSafetyChecks(operator: string,left: any,right: any){
    if (typeof operator==="string"&&typeof left?.value!=="number"&&getOperatorsByBracket('both').includes(operator)) {
        throw new Error("Left side of "+operator+" must have a value");
    }
    if (typeof operator==="string"&&typeof right?.value!=="number") {
        throw new Error("Right side of "+operator+" must have a value");
    }
}



function parse(position: { operator: any; specialChar?: any; left?: any; right?: any; }) {
    let { operator,specialChar, left,right} = position;
    
    left=left?.tokens
    right=right.tokens
    //console.log('this.left,this.right',left,right)
    parseSafetyChecks(operator,left,right);
    
    let solved=new Token(0,undefined);
    switch (operator) {
        case "Square Root":
            solved.value = Math.pow(right.value,specialChar!==null?(1)/(specialChar):0.5);
            break;
        case "Pow":
            if (left.variable||right.variable)
            {
                solved.variable=left.variable||left.variable===right.variable?left.variable:right.variable?right.variable:"";
                //solved.pow=2
            }
            solved.value = Math.pow(left.value,right.value);
            break;
        case "Fraction":
        case "/":
            solved.value = (left.value)/(right.value);
            break;
        case "Multiplication":
            solved.value = left.value * right.value;
            handleVriables(left, right,solved);
            break;
        case "+":
            solved.value = left.value + right.value;
            solved.variable=left.variable?left.variable:right.variable;
            break;
        case "Minus":
            solved.value = left.value - right.value;
            solved.variable=left.variable?left.variable:right.variable;
            break;
        case "binom":
            solved.value = calculateFactorial(left.value,right.value);
            break;
        case "sin":
            solved.value = Math.sin(degreesToRadians(right.value));
            break;
        case "cos":
            solved.value = Math.cos(degreesToRadians(right.value))
            break;
        case "tan":
            if (right>=90){throw new Error("tan Must be smaller than 90");}
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
            throw new Error("Couldn't identify operator type at praise operator: "+position.operator);
    }

    function handleVariableMultiplication(left: { variable: any; pow: any; value: number; }, right: { variable: any; pow: any; value: number; }, solved: Token) {
        if (left.variable && right.variable && left.variable !== right.variable) {
            /* Keep them separate since they have different variables
            solved.terms = [
                { variable: left.variable, pow: left.pow || 1, value: left.value || 1 },
                { variable: right.variable, pow: right.pow || 1, value: right.value || 1 }
            ];*/
            throw new Error("Different variable bases at power multiplication. I didn't get there yet")
        }
    
        const variable = left.variable || right.variable;
        solved.variable = variable.length>0?variable:undefined;
        
        let pow = (left.pow || 0) + (right.pow || 0);
        pow=left.variable && right.variable&&pow===0&&!left.pow&&!right.pow?2:pow;
        //solved.pow = pow || undefined;
        

        // Rule 3: Handle multiplication of constants
        const leftValue = left.value || 1;
        const rightValue = right.value || 1;
        const value = leftValue * rightValue;
        // If there's no variable, assign the result as a constant
        if (!variable) {
            solved.value = value;
        } else {
            solved.value = value;
        }
    }
    
    

    function handleVriables(left: any,right: any,solved: Token){
        let handled={Var:null,Pow:null};
        if (!left.variable&&!right.variable){
            return ;
        }
        if (position.operator==='*'){return handleVariableMultiplication(left,right,solved)}
        //console.log(left.variable,right.variable)
        if (left.variable!==right.variable){
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





function rearrangeEquation(tokens: any,tokenToisolate: any){
    
}

function isolateMultiplication(tokens: any,isolatToken: Token){
    const index=operationsOrder(tokens)
    const Isolated=tokens.tokens.find((token: any, idx: number)=>idx<index)
    const frac=createFrac(tokens.list.slice(index + 1),new Token(Isolated.value))
    Isolated.value=1;
    tokens.insertTokens(index+1,tokens.tokens.length-index+1,frac)
}

function createFrac(nominator: any,denominator: Token){
   // return [new Token('frac'),new Token('('),nominator,new Token(')'),new Token('('),denominator,new Token(')')]
}
function simplifiy(tokens: any[]){
    if (tokens.length<=1){return tokens}
    let i=0,newTokens=[];
    while (i<=100&&tokens.some((token: any) => (/(number|variable|powerVariable)/).test(token.type)))
    {
        i++;
        let eqindex=tokens.findIndex((token: { value: string; }) => token.value === "=");
        let OperationIndex = tokens.findIndex((token: { type: string; }) => (/(number|variable|powerVariable)/).test(token.type));
        if (OperationIndex===-1){return tokens;}

        let currentToken={type: tokens[OperationIndex].type , value: tokens[OperationIndex].value,variable: tokens[OperationIndex].variable ,pow: tokens[OperationIndex].pow}

        let numberGroup = tokens
        .map((token: any, i: any) => ({ token, originalIndex: i })) 
        .filter((item: { token: { type: any; }; }) => item.token.type===currentToken.type) 
        .reduce((sum: number, item: { originalIndex: number; token: { type: string; value: number; }; }) => {
        let multiplier=(tokens[item.originalIndex - 1] && tokens[item.originalIndex - 1].value === "-") ? -1 : 1;
        multiplier *= (item.originalIndex <= eqindex) ? -1 : 1; 
        if (!(/(number)/).test(item.token.type)){multiplier*=-1}
        return sum + (item.token.value * multiplier);
        }, 0); 
        
        newTokens.push({
            ...currentToken,
            value: numberGroup
        });

        tokens = tokens.filter(token => 
            token.type !== tokens[OperationIndex].type || 
            (token.variable && token.variable !== currentToken.variable) || 
            (token.pow && token.pow !== currentToken.pow)
        );
    }
    return newTokens;
}

function rearrangeForIsolation(tokens: Tokens, isolationGoal: { type: any; value: any; overviewSideOne?: Map<any, any>; overviewSideTwo?: Map<any, any>; }) {
    if (tokens.tokens.length <= 1) return tokens;

    const eqIndex = tokens.tokens.findIndex((t: { value: string; }) => t.value === 'Equals');
    if (eqIndex === -1) throw new Error("No 'Equals' operator found in tokens");

    const switchDirection = false; // Future logic to determine direction
    const isolationGoalIndices = tokens.tokens
        .map((t: { type: any; variable: any; }, idx: any) => (t.type === isolationGoal.type && t.variable === isolationGoal.value ? idx : null))
        .filter((idx: null|number) => idx !== null);

    const otherIndices = tokens.tokens
        .map((_: any, idx: any) => (!isolationGoalIndices.includes(idx) && idx !== eqIndex ? idx : null))
        .filter((idx: null|number) => idx !== null);

    // Adjust signs
    tokens.tokens.forEach((token: { value: number; }, i: number) => {
        if ((switchDirection? i > eqIndex : i < eqIndex) && otherIndices.includes(i)) {
            token.value *= -1;
        } else if ((switchDirection? i < eqIndex : i > eqIndex) && isolationGoalIndices.includes(i)) {
            token.value *= -1;
        }
    });

    // Separate sides
    const side1: any[] = [];
    const side2: any[] = [];
    tokens.tokens.forEach((token: any, i: any) => {
        if (isolationGoalIndices.includes(i)) side1.push(token);
        if (otherIndices.includes(i)) side2.push(token);
    });

    tokens.tokens = switchDirection
        ? [...side2, tokens.tokens[eqIndex], ...side1]
        : [...side1, tokens.tokens[eqIndex], ...side2];
}

function operationsOrder(tokens: any[]) {
    function findOperatorIndex(begin: number, end: number, tokens: any, findParenIndex?: any, regex?: any) {
        while (begin < end && begin < tokens.length) {
            let index;
            
            if (regex) {
                index = tokens.slice(begin, end).findIndex((token: { type: string; value: any; }) => token.type === "operator" && regex.test(token.value));
            } else {
                index = tokens.slice(begin, end).findIndex((token: { type: string; }) => token.type === "operator");
            }
            
            if (index === -1) return -1;
            
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

    let begin = 0, end = tokens.length,j=0;
    let currentID = null;  
    let checkedIDs: any[] = [];  
    let operatorFound = false;
    while (!operatorFound&&j<200) {
        // Find the innermost parentheses
        for (let i = 0; i < tokens.length; i++) {
            j++;
            if (tokens[i].value === "(" && !checkedIDs.includes(tokens[i].id)) {
                currentID = findParenIndex(tokens[i].id);  
            }
            if (currentID!==null&&i===currentID.close) {
                [begin,end]=[currentID.open,currentID.close]
                break;
            }
        }
        
        if (!currentID) {
            begin = 0;
            end = tokens.length;
            break;
        }
        operatorFound = findOperatorIndex(begin,end,tokens)!==-1;

        // If no operator is found, mark this parentheses pair as checked
        if (!operatorFound) {
            checkedIDs.push(currentID.id);  
            currentID = null;  
        }
    }
    if (j>=200){throw new Error("operationsOrder Failed exceeded 200 revisions");}

    for (let i=1;i<=6;i++){
        let priority = findOperatorIndex(begin , end,tokens, getMathJaxOperatorsByPriority(i,true));
        if(priority!==-1)return priority
    }
    return null
}


export class Position {
    operator: string;
    index: number;
    transition: number;
    specialChar: string;
    left: any;
    right: any;
    constructor(tokens: any[], index?: number){
        if(index)
        this.index = index;
        this.transition = this.index;
        this.position(tokens)
    }
    position(tokens: any[]) {
        this.index = !this.index? operationsOrder(tokens) : this.index;
        if (this.index === null || this.index >= tokens.length - 1) {
            return;
        }
        this.operator = tokens[this.index].value;console.log(getOperatorsByAssociativity('right'))
        switch (true) {
            case getOperatorsByAssociativity('both').includes(this.operator):
                this.left = this.applyPosition(tokens, this.index,"left");
                this.right = this.applyPosition(tokens, this.index,"right");
                break;
            case getOperatorsByAssociativity('right').includes(this.operator):
                this.left = {breakChar: this.index};
                this.right = this.applyPosition(tokens, this.index,"right");
                break;
            case getOperatorsByAssociativity('doubleRight').includes(this.operator):
                this.left = this.applyPosition(tokens, this.index,"right");
                this.transition = this.left.breakChar;
                this.right = this.applyPosition(tokens, this.transition-1,"right");
                this.left.breakChar = this.index;
                this.right.breakChar+(this.right.multiStep?1:0);
                break;
            default:
                throw new Error(`Operator ${this.operator} was not accounted for, or is not the valid operator`);
        }
        //console.log(tokens.tokens)
        this.specialChar=tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
    }
    applyPosition(tokens: any[], index:  number, direction: string) {
        let breakChar=index
        let target;
        let multiStep=false;
        const isLeft = direction === "left";
        const indexModifier =  isLeft?- 1 :  1;
        if ((isLeft && index <= 0) || (!isLeft && index >= tokens.length - 1) || !tokens[index+indexModifier]) {
            throw new Error("at applyPosition: \"index wasn't valid\" index: "+index);
        }
        if (tokens[index+indexModifier].type === "paren") {
            const parenIndex = findParenIndex(tokens[index+indexModifier].id);
            breakChar =  isLeft ? parenIndex.open : parenIndex.close+1;
            target = tokens.slice(parenIndex.open, parenIndex.close+1);
        } else {
            breakChar=index+indexModifier;
            target = tokens[breakChar];
            breakChar+=isLeft?0:1
        }
        //const multiStep = Math.abs(breakChar - index) > 3;
    
        if (!multiStep&&tokens[index+indexModifier].type === "paren"){
            //target=target.find(item => /(number|variable|powerVariable)/.test(item.type))
        }
        if (target?.length===0) {
            throw new Error(`at applyPosition: couldn't find target token for direction ${direction} and operator"${tokens[index].value}"`,);
        }
    
        //breakChar = (breakChar !== index ? target?.index : breakChar)+ indexModifier+(isLeft?0:1);
        //delete target.index
        
        if (target.length===3){
            //target=target.find((item: { type: string; }) => /(number|variable|powerVariable)/.test(item.type))
        }else if(target.length>1)multiStep=true
    
        return {
            tokens: target,
            multiStep: multiStep,
            breakChar: breakChar,
        };
    }
    checkMultiStep(){
        return ((getOperatorsByAssociativity('both').includes(this.operator)&&this.left?.multiStep)||this.right?.multiStep)&&this.operator==='Multiplication';
    }
    isLeftVar(){
        return this.left.multiStep?this.left.tokens.some((t: { type: string; })=>t.type==='variable'||t.type==='powerVariable'):this.left.tokens.type.includes('ariable')
    }
    isRightVar(){
        return this.right.multiStep?this.right.tokens.some((t: { type: string; })=>t.type==='variable'||t.type==='powerVariable'):this.right.tokens.type.includes('ariable')
    }
    checkFrac(){//!this.checkMultiStep() I don't know why I had this here
        return /(frac|\/)/.test(this.operator)&&(this.isLeftVar()||this.isRightVar())
    }
}



function parseOperator(operator: mathJaxOperator){
    switch (operator.operator) {
        case "sin":
            //const a=new Token(Math.sin(degreesToRadians(operator.group1.items[0].value)))
            //solved.value = ;
            break;
        default:
            throw new Error("Couldn't identify operator type at praise operator: "+operator.operator);
    }

    function handleVariableMultiplication(left: { variable: any; pow: any; value: number; }, right: { variable: any; pow: any; value: number; }, solved: Token) {
        if (left.variable && right.variable && left.variable !== right.variable) {
            /* Keep them separate since they have different variables
            solved.terms = [
                { variable: left.variable, pow: left.pow || 1, value: left.value || 1 },
                { variable: right.variable, pow: right.pow || 1, value: right.value || 1 }
            ];*/
            throw new Error("Different variable bases at power multiplication. I didn't get there yet")
        }
    
        const variable = left.variable || right.variable;
        solved.variable = variable.length>0?variable:undefined;
        
        let pow = (left.pow || 0) + (right.pow || 0);
        pow=left.variable && right.variable&&pow===0&&!left.pow&&!right.pow?2:pow;
        //solved.pow = pow || undefined;
        

        // Rule 3: Handle multiplication of constants
        const leftValue = left.value || 1;
        const rightValue = right.value || 1;
        const value = leftValue * rightValue;
        // If there's no variable, assign the result as a constant
        if (!variable) {
            solved.value = value;
        } else {
            solved.value = value;
        }
    }
    
    

    function handleVriables(left: any,right: any,solved: Token){
        let handled={Var:null,Pow:null};
        if (!left.variable&&!right.variable){
            return ;
        }
        //if (position.operator==='*'){return handleVariableMultiplication(left,right,solved)}
        //console.log(left.variable,right.variable)
        if (left.variable!==right.variable){
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

export class MathPraiser{
    input="";
    tokens: Tokens;
    solution="";
    mathInfo=new MathInfo();
    i=0;
    constructor(input: string){
        this.input=input;
        this.processInput();
        this.tokens=new Tokens(this.input);

        console.log('this.tokens',this.tokens);
        this.addDebugInfo("Tokens after tokenize",this.tokens.tokens)
        this.input=this.tokens.reconstruct()
        this.solution=this.controller();
    }
    getRedyforNewRond(){
        //this.tokens.connectNearbyTokens();
        //this.mathInfo.addMathInfo(this.tokens)
        //this.addDebugInfo(this.tokens.tokens,this.tokens.tokens.length)
        //this.tokens.expressionVariableValidity();
    }
    controller(): any{

        const a=this.tokens.operatorTokens
        console.log(a)
        
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

    useParse(position: Position){
        const solved = parse(position);
        this.mathInfo.addDebugInfo("solved",solved)
        const [leftBreak,length] = [position.left.breakChar,position.right.breakChar-position.left.breakChar]
        this.tokens.insertTokens(leftBreak,length,solved)
        this.mathInfo.addSolution(this.tokens,position,solved)
        this.addDebugInfo("newTokens",this.tokens.tokens)
        return this.controller()
    }
    
    praisingMethod(){
        /*
        const filterByType=(type)=>this.tokens.tokens.filter(token => token.type === type);
        const [numberIndex,variableIndex,powIndex] = [filterByType("number"),filterByType("variable"),filterByType("powerVariable")]
        if (powIndex.length===1&&powIndex[0].pow===2)
            return this.useQuadratic()
        return this.useIsolat();*/
    }

    useIsolat(praisingMethod: PraisingMethod){
        isolateMultiplication(this.tokens,new Token(praisingMethod.variables[0]))
        return this.controller()
        //this.tokens.insertTokens()
        //Use possession
    }

    useQuadratic(){
        this.tokens.tokens=simplifiy(this.tokens.tokens)
            const filterByType=(type: string)=>this.tokens.tokens.filter((token: { type: string; }) => token.type === type);
            const [numberIndex,variableIndex,powIndex] = [filterByType("number"),filterByType("variable"),filterByType("powerVariable")]
            this.mathInfo.addDebugInfo("simplifiy(tokens)",this.tokens.tokens)
            if (powIndex.length===1&&powIndex[0].pow===2)
            {
                return quad(
                    powIndex[0]?.value  | 0,
                    variableIndex[0]?.value | 0,
                    numberIndex[0]?.value * -1| 0,
                    powIndex[0].variable,
                );
            }
    }
    addDebugInfo(mes: string,value: string | number | Token | Axis){
        this.mathInfo.addDebugInfo(mes,value)
    }
    processInput(){
        this.input=this.input
        .replace(/(Math.|\\|\s|left|right)/g, "") 
        .replace(/{/g, "(")
        .replace(/}/g, ")")
        //.replace(/(?<!\\|[a-zA-Z])(tan|sin|cos|binom|frac|asin|acos|atan|arccos|arcsin|arctan|cdot)/g, "\\$1");
    }
    finalReturn(){
        return this.tokens.reconstruct()
    }
}

class mathVariables{

}









export function flattenArray(arr: any) {
    let result = [];
    let stack = Array.isArray(arr) ? [...arr] : [arr];

    while (stack.length) {
        const next = stack.pop();
        if (Array.isArray(next)) {
            stack.push(...next); 
        } else {
            result.push(next);
        }
    }
    return result.reverse();
}



class PraisingMethod{
    tokens
    overview: any;
    variables: any[];
    constructor(tokens: any){
        this.tokens=tokens
        this.overview=this.getOverview()
        this.assignVariables()
    }
    isVarWithValueBiggerThanOne(){
        return this.tokens.some((t: any)=> t.type==='variable'&&t.value>1)
    }

    isMultiplicationIsolate(){
        return this.haseVariable()&&this.isVarWithValueBiggerThanOne()&&this.isEqualsTheOnlyOperator()
    }
    isIsolate(){
        //return this.
    }

    isAnythingToIsolate(){
        if(this.variables.length>1)throw new Error("two var eq arent saported yet")
        if(!this.isEqualsTheOnlyOperator())return;
        const eqIndex=this.equalsIndexIfAny();
        if(!eqIndex){return};
        const befor = this.getOverview(this.tokens.slice(0,eqIndex))
        const after = this.getOverview(this.tokens.slice(eqIndex+1))
        const whatToIsolat =this.whatToIsolat();
        if ((!befor||!after)||!whatToIsolat||(befor?.size<2&&after?.size<2))return;
        return {overviewSideOne: befor,overviewSideTwo: after,...whatToIsolat}
    }/*
    howToIsolate(overviewSideOne,overviewSideTwo,isolationGool){
        const isolationType=isolationGool.splt(':');
        //if (){}
    }*/
    whatToIsolat(){
        // i need to add pows after
        // for know im going on the oshomshin that thr is only one var
        if(this.variables?.length<1)return;

        return {type: 'variable',value: this.variables[0]}
    }/*
    isOverviewToisolat(overview){
    }*/
    isImbalance(overview: { size: number; }){
        overview.size>1
    }
    equalsIndexIfAny(){
        const eqIndex=this.tokens.map((t: { value: string; },idx: any)=>t.value==='Equals'?idx:null).filter((m: null)=>m!==null);
        return eqIndex[0];
    }
    isQuadratic(){

    }
    isFinalReturn(){
        return this.tokens.length<2||(this.isEqualsTheOnlyOperator())
    }
    
    assignVariables(){
        this.variables=[]
        for (const [key, value] of this.overview.entries()){
            if (key?.startsWith('variable:')&&!this.variables.includes(value.variable)){
                this.variables.push(value.variable)
            }
        }
    }

    haseVariable(){return this.variables?.length>0}

    isThereOperatorOtherThanEquals(){
        const filter=this.filterByType('operator','Equals')
        return  filter.noMatch>0
    }
    isEqualsTheOnlyOperator(){
        const filter=this.filterByType('operator','Equals')
        return  filter.match===1&&filter.noMatch===0
    }

    filterByType(typeKey: string, targetValue: string){
        let match=0, noMatch=0
        for (const [key, value] of this.overview.entries()) {
            if (key?.startsWith(typeKey)) {
                if (key === typeKey+':'+targetValue) {
                    match++;
                } else {
                    noMatch++;
                }
            }
        }
        return { match: match, noMatch: noMatch };
    }
    getOverview(tokens?: any[] ) {
        if(!tokens)tokens=this.tokens
        if(!tokens)return;
        const overview = new Map();
        tokens.forEach(token => {
            //if (!token.isValueToken()) {return;}
            const key = token.getFullTokenID()
            //Equals
            if (!overview.has(key)) {
                const entry = { 
                    type: token.type, 
                    count: 0 ,
                    variable: undefined
                };
                if (token.type === 'variable') {
                    entry.variable = token.variable;
                }
    
                overview.set(key, entry);
            }
            overview.get(key).count++;
        });
        return overview//Array.from(overview.values());
    }
}

class Operator{

}

class Modifier{

}