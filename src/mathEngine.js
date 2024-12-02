
import { quad,calculateBinom,roundBySettings ,degreesToRadians,radiansToDegrees} from "./mathUtilities";
import { expandExpression,curlyBracketsRegex } from "./imVeryLazy";
import { type } from "os";
import { arrToRegexString, regExp } from "./tikzjax/tikzjax";
import { getAllLatexReferences, getAllOperatorReferences, getOperatorsByBracket, getOperatorsByPriority, getOperatorsBySides, hasImplicitMultiplication, searchOperators, searchSymbols } from "./utils/symbols";
import { cp } from "fs";
const greekLetters = [
    'Alpha','alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 
    'Iota', 'Kappa', 'Lambda', 'Mu','mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 
    'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'
];
/*const latexOperators=[
    'tan', 'sin', 'cos', 'binom', 'frac', 'asin', 'acos', 
    'atan', 'arccos', 'arcsin', 'arctan', 'cdot','sqrt'
]*/

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
    doubleRightButBracket: ["frac", "binom","/"]
};

export class MathInfo{
    debugInfo="";
    solutionInfo=[];
    mathInfo=[]
    graph="";
    addGraphInfo(value){
        this.graph+=value;
    }
    addDebugInfo(msg, value){
        this.debugInfo+=(typeof msg==="object"?JSON.stringify(msg):msg)+" : "+(typeof value==="object"?JSON.stringify(value):value)+ "\n ";
    }
    addSolutionInfo(mes){
        this.solutionInfo.push(mes);
        this.addDebugInfo("Solved",mes);
    }
    addMathInfo(tokens){
        const reconstructedMath=tokens.reconstruct()
        this.mathInfo.push(reconstructedMath)
        this.addDebugInfo("Reconstructed math",reconstructedMath);
    }

    addSolution(tokens,position,solution){
        solution=tokens.reconstruct([solution]);
        const left=tokens.reconstruct(tokens.tokens.slice(position.left.breakChar,position.index));
        const right=tokens.reconstruct(tokens.tokens.slice(position.index+1,position.right.breakChar,));

        switch (true){
            case operatorsForMathinfo.bothButRightBracket.includes(this.operator):
                solution=  `${left} ${position.operator} {${right}} = ${solution}`
                break;
            case operatorsForMathinfo.both.includes(this.operator):
                solution=  `${left} ${position.operator.replace(/\*/g, "\\cdot")} ${right} = ${solution}`
                break;
            case operatorsForMathinfo.special.includes(this.operator):
                solution= `\\frac{${left}}{${right}} = ${solution}`
                break;
                case operatorsForMathinfo.rightBracketAndRequiresSlash.includes(this.operator):
                solution=  `\\sqrt{${right}} = ${solution}`
                break;
            case operatorsForMathinfo.RightParenAndRequiresSlash.includes(this.operator):
                solution=`\\${position.operator} (${right}) = ${solution}`
                break;
            case operatorsForMathinfo.doubleRightButBracket.includes(this.operator):
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

function parseSafetyChecks(operator,left,right){
    if (typeof operator==="string"&&typeof left?.value!=="number"&&getOperatorsBySides('both').includes(operator)) {
        throw new Error("Left side of "+operator+" must have a value");
    }
    if (typeof operator==="string"&&typeof right?.value!=="number") {
        throw new Error("Right side of "+operator+" must have a value");
    }
}



function parse(position) {
    let { operator,specialChar, left,right} = position;
    
    left=left?.tokens
    right=right.tokens
    //console.log('this.left,this.right',left,right)
    parseSafetyChecks(operator,left,right);
    
    let solved=new Token();
    switch (operator) {
        case "Square Root":
            solved.value = Math.pow(right.value,specialChar!==null?(1)/(specialChar):0.5);
            break;
        case "Pow":
            if (left.variable||right.variable)
            {
                solved.variable=left.variable||left.variable===right.variable?left.variable:right.variable?right.variable:"";
                solved.pow=2
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
            solved.value = calculateBinom(left.value,right.value);
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

    function handleVariableMultiplication(left, right, solved) {
        if (left.variable && right.variable && left.variable !== right.variable) {
            // Keep them separate since they have different variables
            solved.terms = [
                { variable: left.variable, pow: left.pow || 1, value: left.value || 1 },
                { variable: right.variable, pow: right.pow || 1, value: right.value || 1 }
            ];
            throw new Error("Different variable bases at power multiplication. I didn't get there yet")
        }
    
        const variable = left.variable || right.variable;
        solved.variable = variable.length>0?variable:undefined;
        
        let pow = (left.pow || 0) + (right.pow || 0);
        pow=left.variable && right.variable&&pow===0&&!left.pow&&!right.pow?2:pow;
        solved.pow = pow || undefined;
        

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
    
    

    function handleVriables(left,right,solved){
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

function operationsOrder(tokens) {
    function findOperatorIndex(begin, end, tokens, regex) {
        while (begin < end && begin < tokens.tokens.length) {
            let index;
            
            if (regex) {
                index = tokens.tokens.slice(begin, end).findIndex(token => token.type === "operator" && regex.test(token.value));
            } else {
                index = tokens.tokens.slice(begin, end).findIndex(token => token.type === "operator");
            }
            
            if (index === -1) return -1;
            
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

    let begin = 0, end = tokens.tokens.length,j=0;
    let currentID = null;  
    let checkedIDs = [];  
    let operatorFound = false;
    while (!operatorFound&&j<200) {
        // Find the innermost parentheses
        for (let i = 0; i < tokens.tokens.length; i++) {
            j++;
            if (tokens.tokens[i].value === "(" && !checkedIDs.includes(tokens.tokens[i].id)) {
                currentID = tokens.findParenIndex(tokens.tokens[i].id);  
            }
            if (currentID!==null&&i===currentID.close) {
                [begin,end]=[currentID.open,currentID.close]
                break;
            }
        }
        
        if (!currentID) {
            begin = 0;
            end = tokens.tokens.length;
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
        let priority = findOperatorIndex(begin , end,tokens, getOperatorsByPriority(i,true));
        if(priority!==-1)return priority
    }

    let priority1 = findOperatorIndex(begin , end,tokens, getOperatorsByPriority(1,true));
    let priority2 = findOperatorIndex(begin , end,tokens, getOperatorsByPriority(2,true));
    let priority3 = findOperatorIndex(begin , end,tokens, getOperatorsByPriority(3,true));
    let priority4 = findOperatorIndex(begin , end,tokens, getOperatorsByPriority(4,true));
    let priority5 = findOperatorIndex(begin , end,tokens, getOperatorsByPriority(5,true));
    let priority6 = findOperatorIndex(begin , end,tokens, getOperatorsByPriority(6,true));

    return [priority1, priority2, priority3, priority4, priority5,priority6].find(index => index !== -1)??null;
}


export class Position {
    operator;
    index;
    transition;
    specialChar;
    left;
    right;
    constructor(tokens, index){
        this.index=index;
        this.transition = this.index
        this.position(tokens)
    }
    position(tokens) {
        this.index = !this.index? operationsOrder(tokens) : this.index;
        if (this.index === null || this.index >= tokens.length - 1) {
            return;
        }
        this.operator = tokens.tokens[this.index].value;
        switch (true) {
            case getOperatorsBySides('both').includes(this.operator):
                this.left = this.applyPosition(tokens, this.index,"left");
                this.right = this.applyPosition(tokens, this.index,"right");
                break;
            case getOperatorsBySides('right').includes(this.operator):
                this.left = {breakChar: this.index};
                this.right = this.applyPosition(tokens, this.index,"right");
                break;
            case getOperatorsBySides('doubleRight').includes(this.operator):
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
        this.specialChar=tokens.tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
    }
    applyPosition(tokens, index, direction) {
        let breakChar=index
        let target;
        let multiStep=false;
        const isLeft = direction === "left";
        const indexModifier =  isLeft?- 1 :  1;
        if ((isLeft && index <= 0) || (!isLeft && index >= tokens.tokens.length - 1) || !tokens.tokens[index+indexModifier]) {
            throw new Error("at applyPosition: \"index wasn't valid\" index: "+index);
        }
        if (tokens.tokens[index+indexModifier].type === "paren") {
            const parenIndex = tokens.findParenIndex(tokens.tokens[index+indexModifier].id);
            breakChar =  isLeft ? parenIndex.open : parenIndex.close+1;
            target = tokens.tokens.slice(parenIndex.open, parenIndex.close+1);
        } else {
            breakChar=index+indexModifier;
            target = tokens.tokens[breakChar];
            breakChar+=isLeft?0:1
        }
        //const multiStep = Math.abs(breakChar - index) > 3;
    
        if (!multiStep&&tokens.tokens[index+indexModifier].type === "paren"){
            //target=target.find(item => /(number|variable|powerVariable)/.test(item.type))
        }
        if (target?.length===0) {
            throw new Error(`at applyPosition: couldn't find target token for direction ${direction} and operator"${tokens.tokens[index].value}"`,);
        }
    
        //breakChar = (breakChar !== index ? target?.index : breakChar)+ indexModifier+(isLeft?0:1);
        //delete target.index
        
        if (target.length===3){
            target=target.find(item => /(number|variable|powerVariable)/.test(item.type))
        }else if(target.length>1)multiStep=true
    
        return {
            tokens: target,
            multiStep: multiStep,
            breakChar: breakChar,
        };
    }
    checkMultiStep(){
        return ((getOperatorsBySides('both').includes(this.operator)&&this.left?.multiStep)||this.right?.multiStep)&&this.operator==='Multiplication';
    }
    isLeftVar(){
        return this.left.multiStep?this.left.tokens.some(t=>t.type==='variable'||t.type==='powerVariable'):this.left.tokens.type.includes('ariable')
    }
    isRightVar(){
        return this.right.multiStep?this.right.tokens.some(t=>t.type==='variable'||t.type==='powerVariable'):this.right.tokens.type.includes('ariable')
    }
    checkFrac(){//!this.checkMultiStep() I don't know why I had this here
        return /(frac|\/)/.test(this.operator)&&(this.isLeftVar()||this.isRightVar())
    }
}



function rearrangeEquation(tokens,tokenToisolate){
    
}
function isolateMultiplication(tokens,isolatToken){
    const index=operationsOrder(tokens)
    const Isolated=tokens.tokens.find((token, idx)=>idx<index)
    const frac=createFrac(...tokens.tokens.slice(index+1,tokens.tokens.length),new Token(Isolated.value))
    Isolated.value=1;
    tokens.insertTokens(index+1,tokens.tokens.length-index+1,frac)
}

function createFrac(nominator,denominator){
    return [new Token('frac'),new Token('('),nominator,new Token(')'),new Token('('),denominator,new Token(')')]
}
function simplifiy(tokens){
    if (tokens.length<=1){return tokens}
    let i=0,newTokens=[];
    while (i<=100&&tokens.some(token => (/(number|variable|powerVariable)/).test(token.type)))
    {
        i++;
        let eqindex=tokens.findIndex(token => token.value === "=");
        let OperationIndex = tokens.findIndex((token) => (/(number|variable|powerVariable)/).test(token.type));
        if (OperationIndex===-1){return tokens;}

        let currentToken={type: tokens[OperationIndex].type , value: tokens[OperationIndex].value,variable: tokens[OperationIndex].variable ,pow: tokens[OperationIndex].pow}

        let numberGroup = tokens
        .map((token, i) => ({ token, originalIndex: i })) 
        .filter(item => item.token.type===currentToken.type) 
        .reduce((sum, item) => {
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

function rearrangeForIsolation(tokens, isolationGoal) {
    if (tokens.length <= 1) return tokens;

    const eqIndex = tokens.tokens.findIndex(t => t.value === 'Equals');
    if (eqIndex === -1) throw new Error("No 'Equals' operator found in tokens");

    const switchDirection = false; // Future logic to determine direction
    const isolationGoalIndices = tokens.tokens
        .map((t, idx) => (t.type === isolationGoal.type && t.variable === isolationGoal.value ? idx : null))
        .filter(idx => idx !== null);

    const otherIndices = tokens.tokens
        .map((_, idx) => (!isolationGoalIndices.includes(idx) && idx !== eqIndex ? idx : null))
        .filter(idx => idx !== null);

    // Adjust signs
    tokens.tokens.forEach((token, i) => {
        if ((switchDirection? i > eqIndex : i < eqIndex) && otherIndices.includes(i)) {
            token.value *= -1;
        } else if ((switchDirection? i < eqIndex : i > eqIndex) && isolationGoalIndices.includes(i)) {
            token.value *= -1;
        }
    });

    // Separate sides
    const side1 = [];
    const side2 = [];
    tokens.tokens.forEach((token, i) => {
        if (isolationGoalIndices.includes(i)) side1.push(token);
        if (otherIndices.includes(i)) side2.push(token);
    });

    tokens.tokens = switchDirection
        ? [...side2, tokens.tokens[eqIndex], ...side1]
        : [...side1, tokens.tokens[eqIndex], ...side2];
}

export class MathPraiser{
    input="";
    tokens=[];
    solution="";
    mathInfo=new MathInfo();
    i=0;
    constructor(input){
        this.input=input;
        this.processInput();
        this.tokens=new Tokens(this.input);
        this.addDebugInfo("Tokens after tokenize",this.tokens.tokens)
        this.input=this.tokens.reconstruct()
        this.solution=this.controller();
    }
    getRedyforNewRond(){
        this.tokens.connectNearbyTokens();
        this.mathInfo.addMathInfo(this.tokens)
        //this.addDebugInfo(this.tokens.tokens,this.tokens.tokens.length)
        this.tokens.expressionVariableValidity();
    }
    controller(){
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
            /*
            else if (position.index === null){
                return this.finalReturn();
            }*/
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
        return this.finalReturn()//this.tokens.tokens.length>1?this.controller():this.finalReturn();
    }

    useParse(position){
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

    useIsolat(praisingMethod){
        isolateMultiplication(this.tokens,new Token(praisingMethod.variables[0]))
        return this.controller()
        //this.tokens.insertTokens()
        //Use possession
    }

    useQuadratic(){
        this.tokens.tokens=simplifiy(this.tokens.tokens)
            const filterByType=(type)=>this.tokens.tokens.filter(token => token.type === type);
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
    addDebugInfo(mes,value){
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





class Tokens{
    tokens=[];
    constructor(math){
        this.tokenize(math);
    }
    tokenize(math){
        //latexOperators.push(String.raw`[*/^=\+\-\(\)]`)
        //const operators=arrToRegexString(latexOperators)
        const operators=arrToRegexString(getAllLatexReferences())
        for (let i = 0; i < math.length; i++) {
            let match = math.slice(i).match(regExp('^' + operators));
            if (!!match) {
                this.tokens.push(new Token(match[0]));
                i+=match[0].length-1;
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

            match = math.slice(i).match(/^([0-9.]+)/);//([a-zA-Z]?)/);
            if (!!match)
            {   i+=match[0].length-1
                this.tokens.push(new Token(parseFloat(match[0])));
                continue;
            }
            match=math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/)
            if (!!match) {
                //if (vari&&vari.length===0){vari=math.slice(i,math.length)}
                i+=match[0].length-1
                this.tokens.push(new Token(1,match[0]))
                //tokens.push({type: "variable",variable: vari.replace("(","{").replace(")","}"),value: 1});
                continue;
            }

            throw new Error(`Unknown char "${math[i]}"`);
        }
        this.postProcessTokens();
    }

    validateIndex(index,margin){
        margin=margin||0;
        return index>=0+margin&&index<this.tokens.length-margin;
    }
    implicitMultiplicationMap(){
        const testDoubleRight = (index) => {
            if (!this.validateIndex(index)) return false;
            const idx=this.findParenIndex(null,index).open;
            return this.tokens[index+1]?.value==='('&&(idx===0||!getOperatorsBySides('doubleRight').includes(this.tokens[idx-1]?.value));
        };
        const check = (index) => {
            if (!this.validateIndex(index)) return false;
            return this.tokens[index].isValueToken();
        };

        //Map parentheses for implicit multiplication.
        const map = this.tokens
            .map((token, index) => { 
                if (token.value === "(" || (hasImplicitMultiplication(token.value))) {
                    return check(index - 1) ? index : null;
                } else if (token.value === ")") {
                    return check(index + 1) ||testDoubleRight(index)? index+1 : null;
                }
                return null;
            })
            .filter(item => item !== null);
        return map
    }

    validatePlusMinus(){
        const map=this.tokens.map((token,index)=> token.value==='Plus'||token.value==='Minus'?index:null).filter(index=> index!==null)

        map.forEach(index => {
            index=this.validateIndex(index,1)&&this.tokens[index-1].type==='operator'||this.tokens[index+1].type==='operator'?null:index;
        });
        map.reverse().forEach(index => {
            const value=this.tokens[index].value==='Plus'?1:-1;
            this.tokens[index+1].value*=value;
            this.tokens.splice(index,1)
        });
    }
    
    postProcessTokens(){
        /*rules to abid by:
        1. +- If part of the number they are absorbed into the number
        */
       
        this.IDparentheses();
        const map=this.tokens.map((token,index)=> (token.isValueToken())?index:null).filter(item => item !== null)
        const arr=findConsecutiveSequences(map);

        this.connectAndCombine(arr)
        this.validatePlusMinus();
        
        const parenMap=this.implicitMultiplicationMap()

        parenMap.sort((a, b) => b - a)
        .forEach(value => {
            this.tokens.splice(value, 0, new Token('*'));
        });
    }

    mapParenIndexes(){
        return this.tokens
        .map((token, index) => token.value === "(" ? this.findParenIndex(undefined, index) : null)
        .filter(item => item !== null)
    }

    filterParenIndexesForRemovael(){
        return this.mapParenIndexes()
        .filter(item => {
            const { open: openIndex, close: closeIndex } = item;
            if (openIndex>0) {
                if (/(operator|paren)/.test(this.tokens[openIndex - 1].type)) {// && prevToken.value !== "="
                return false;
                }
            }
            if (closeIndex<this.tokens.length - 1) {
                if (this.tokens[closeIndex + 1].isValueToken()) {//this.tokens[closeIndex + 1]
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

    connectNearbyTokens(){
        this.tokens.forEach(token => {
            if (!(token instanceof Token)){
                throw new Error("ftygubhnimpo")
            }
        });
        const map = new Set(this.filterParenIndexesForRemovael());
        this.tokens = this.tokens.filter((_, idx) => !map.has(idx));
        //Problem with  = as it's affecting the variable before it
        const check = (index) => {
            return (
                !this.tokens?.[index - 1]?.affectedOperatorRange?.() &&
                !this.tokens?.[index + 1]?.affectedOperatorRange?.()
            );
        };

        const numMap=this.tokens.map((token,index)=> token.type==='number'&&check(index)?index:null).filter(item => item !== null)
        const varMap=this.tokens.map((token,index)=> token.type==='variable'&&check(index)?index:null).filter(item => item !== null)
        
        const arr = [
            ...findConsecutiveSequences(numMap), 
            ...findConsecutiveSequences(varMap), 
        ];
        this.connectAndCombine(arr)
        
        this.IDparentheses(this.tokens)
    }


    connectAndCombine(arr){
        const indexes=[]

        arr.sort((a, b) => b[0] - a[0]).forEach(el => {
            indexes.push({start: el[0],end: el[el.length - 1]})
        });

        indexes.forEach(index => {
            let value = Number(this.tokens[index.start].value);
            const isVar=this.tokens.slice(index.start,index.end+1).find(token=> token.type.includes('var'));
            for (let i=index.start+1;i<=index.end;i++){
               value = this.tokens[i].value + value;
            }

            //if (isVar)updatedToken.variable=isVar.variable
            this.tokens[index.start] = new Token(value,isVar?.variable);
            this.tokens.splice(index.start+1, index.end - index.start);
        });
    }

    expressionVariableValidity(){
        if (
            Array.isArray(this.tokens) 
            && this.tokens.some(token => /(variable|powerVariable)/.test(token.type)) 
            && !this.tokens.some(token => token.value === "=")
        )
        {return Infinity}
    }

    insertTokens(start, length, objects) {
        objects = flattenArray(objects);
        if (!Array.isArray(objects)) {
            console.error("Expected `objects` to be an array, but received:", objects);
            return;
        }
        this.tokens.splice(start, length, ...objects);
    }

    reconstruct(tokens){
        if (!tokens){tokens=this.tokens;}
        const addPlusIndexes=this.indexesToAddPlus(tokens);
        const curlyBracketIndexes = this.curlyBracketIDs(tokens).flatMap(({ open, close }) => [open, close]);
        let math = "";
        for (let i=0;i<tokens.length;i++){
            let temp;
            math+=addPlusIndexes.includes(i)?'+':'';
            if (tokens[i]?.value==="("&&tokens[tokens.findLastIndex((token, index) => token.id === tokens[i].id&&tokens[index+1])+1].value==="/")
            {
                math+="\\frac";
            }
            switch (tokens[i]?.type){
                case "number":
                case "variable":
                case "powerVariable":
                case "operator":
                    if (tokens[i] instanceof Token)
                        math+=tokens[i]?.toStringLatex()
                    //temp=roundBySettings(tokens[i].value)
                    //math+=temp+(i+1<tokens.length&&/(frac)/.test(tokens[i+1].value)?"+":"");
                    break;
                case "paren":
                    math+=curlyBracketIndexes.contains(i)?tokens[i].value.replace(/\(/,"{").replace(/\)/,"}"):tokens[i].value;
                    break;
                default:
                    console.error(this.tokens)
                    throw new Error(`Unexpected token type given to reconstruct: type ${tokens[i]?.type}`);
            }
        }
        return math
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
                } else if (index > 0 && rightBrackets.includes(prevToken)) {
                    map.push(this.findParenIndex(undefined, index, tokens));
                }
            } else if (token.value === ')' && bothBrackets.includes(nextToken)) {
                map.push(this.findParenIndex(undefined, index, tokens));
            }
        });
        return map;
    }
    

    indexesToAddPlus(tokens){
        return tokens.map((token,index)=>index>0
            &&tokens[index - 1]?.isValueToken()
            &&token?.isValueToken()&&token.value>=0?index:null
        ).filter(item=>item!==null)
    }
    
    findParenIndex(id,index,tokens){
        if (tokens===undefined){tokens=this.tokens;}
        id=id?id:tokens[index].id;

        const open=tokens.findIndex(
            token=>token.value==="("
            &&token.id?.compare(id)
        )
        const close=tokens.findLastIndex(
            token=>token.value===")"
            &&token.id?.compare(id)
        )
        return{open: open,close: close,id:id}
    }

    tokenCompare(compare, value, token, nextToken) {
        value = value instanceof RegExp ? value : new RegExp(value);
        return (
            (value === null || value.test(token[compare])) &&
            token[compare] === nextToken?.[compare]
        );
    }

    IDparentheses() {
        let tokens=this.tokens
        let brackets = 0, levelCount = {};
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].value === "(") {
                if (!levelCount[brackets]) {
                    levelCount[brackets] = 0;
                }
                let ID = levelCount[brackets]++;
                tokens[i].id = new Paren(brackets,ID)// + "." + ;
                brackets++;
                continue;
            }
            if (tokens[i].value === ")") {
                brackets--;
                let ID = levelCount[brackets] - 1;
                // Reassign the object with the new id to ensure persistence
                tokens[i].id = new Paren(brackets,ID)//brackets + "."+ID;
                continue;
            }
        }
        if (brackets!==0)
        {
            //throw new Error ("Unmatched opening bracket(s) err rate: "+brackets)
        }
        
        this.tokens=tokens;
    }
}




export function flattenArray(arr) {
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



export class Token{
    type;
    value;
    variable;
    modifier;
    id;
    
    constructor(value,variable){
        this.value=value;
        this.variable=variable;
        this.setType();
        this.insurProperFormatting()
    }
    insurProperFormatting(){
        if (this.type==='operator'){
            this.value=searchOperators(this.value)?.name
        }
       // if (!this.value){throw new Error('wtf Value was undefined at token insurProperFormatting')}
    }
    getId(){return this.id.id};

    getLatexSymbol(){return searchSymbols(this.value)?.latex}

    getFullTokenID(){
        switch (this.type) {
            case 'number':
            case 'prane':
                return this.type;
            case 'operator':
                return this.type+':'+this.value
            case 'variable':
                return this.type+':'+this.variable
        }
    }
    getfullType(){
        return this.type
    }

    setType(){
        if (typeof this.value==='string'){
            this.type=this.value.match(/[()]/)?'paren':'operator';
            return;
        }
        this.type=this.variable?'variable':'number';
    }

    isString(){return this.type==='paren'||this.type==='operator'}

    isValueToken(){return this.type==='variable'||this.type==='number'}

    toStringLatex(){
        let string=''
        if (this.isString())
            string+=this.getLatexSymbol(this.value)
        if (this.type==='variable') string+=this.toStringVariable()
        if (this.type==='number') string+=this.value;
        return string
    }
    affectedOperatorRange(direction){
        if(this.type!=='operator'||this.value==='Equals')
            return false
        if(direction==='left'&&!getOperatorsBySides('both').includes(this.operator))
            return false
        return true
    }
    toStringVariable(){
        return (this.value!==1?this.value:'')+this.variable;
    }
}

class PraisingMethod{
    tokens
    overview;
    variables;
    constructor(tokens){
        this.tokens=tokens
        this.overview=this.getOverview()
        this.assignVariables()
    }
    isVarWithValueBiggerThanOne(){
        return this.tokens.some(t=> t.type==='variable'&&t.value>1)
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
        if (!whatToIsolat||(befor?.size<2&&after?.size<2))return;
        return {overviewSideOne: befor,overviewSideTwo: after,...whatToIsolat}
    }
    howToIsolate(overviewSideOne,overviewSideTwo,isolationGool){
        const isolationType=isolationGool.splt(':');
        //if (){}
    }
    whatToIsolat(){
        // i need to add pows after
        // for know im going on the oshomshin that thr is only one var
        if(this.variables?.length<1)return;

        return {type: 'variable',value: this.variables[0]}
    }
    isOverviewToisolat(overview){
    }
    isImbalance(overview){
        overview.size>1
    }
    equalsIndexIfAny(){
        const eqIndex=this.tokens.map((t,idx)=>t.value==='Equals'?idx:null).filter(m=>m!==null);
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

    filterByType(typeKey, targetValue){
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
    getOverview(tokens) {
        if(!tokens)tokens=this.tokens
        const overview = new Map();
    
        tokens.forEach(token => {
            //if (!token.isValueToken()) {return;}
            
            const key = token.getFullTokenID()
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
        return overview//Array.from(overview.values());
    }
}

class Paren{
    depth;
    depthID;
    id;
    
    constructor(depth,depthID){
        this.depth=depth;
        this.depthID=depthID;
        this.setID();
    }
    setID(){this.id=this.depth + "." + this.depthID}
    compare(Paren){return this.depth===Paren.depth&&this.depthID===Paren.depthID}
}

class Modifier{

}