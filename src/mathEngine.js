
import { quad,calculateBinom,roundBySettings ,degreesToRadians,radiansToDegrees} from "./mathUtilities";
import { expandExpression,curlyBracketsRegex } from "./imVeryLazy";


const tokenIDCompare = (value, token, nextToken) => 
    (value===null||token.id === value) && token.id === nextToken?.id;




const findOpendParenIndex=(tokens,checktParen)=>tokens.findIndex((token, index) =>
    token.value === "(" && index > checktParen &&
    (index === 0 || 
    (index - 1 >= 0 && tokens[index - 1] && (!/(operator|paren)/.test(tokens[index - 1].type) || /[=]/.test(tokens[index - 1].value))))
);

const findClosedParenIndex=(tokens,openParenIndex)=>tokens.findLastIndex((token, index) =>
    tokenIDCompare(")",token,tokens[openParenIndex]) &&
    ((tokens.length-1>index  &&(tokens[index + 1].type !== "operator"||/[=]/.test(tokens[index + 1].value))|| tokens.length-1===index)
));

const operatorsForMathinfo = {
    bothButRightBracket: ["^"],
    rightBracketAndRequiresSlash: ["sqrt"],
    both: ["+", "-", "*"],
    special: ["="],
    RightParenAndRequiresSlash: ["sin", "cos", "tan", "asin", "acos", "atan", "arcsin", "arccos", "arctan"],
    doubleRightButBracket: ["frac", "binom","/"]
};
const operatorSides = {
    both: ["^", "+", "-", "*", "/", "="],
    rightOnly: ["sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "arcsin", "arccos", "arctan"],
    doubleRight: ["frac", "binom"]
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
}



function parse(tokens,mathInfo,position) {
    const { operator,specialChar, left,right} = position;
    if (typeof operator==="string"&&typeof right.value!=="number"&&!/(sqrt|cos|sin|tan)/.test(operator)) {
        throw new Error("Left side of "+operator+" must have a value");
    }
    if (typeof operator==="string"&&typeof right.value!=="number") {
        throw new Error("Right side of "+operator+" must have a value");
    }
    
    const areThereOperators=tokens.some(token=>/(operator)/.test(token.type)&&!/(=)/.test(token.value))
    
    if (!areThereOperators)
    {
        tokens=simplifiy(tokens)
        mathInfo.addDebugInfo("simplifiy(tokens)",tokens)
        const filterByType=(type)=>tokens.filter(token => token.type === type);
        const [numberIndex,variableIndex,powIndex] = [filterByType("number"),filterByType("variable"),filterByType("powerVariable")]
 
        if (powIndex.length===1&&powIndex[0].pow===2)
        {
            return quad(
                powIndex[0] ? powIndex[0].value  : 0,
                variableIndex[0] ? variableIndex[0].value : 0,
                numberIndex[0] ? numberIndex[0].value * -1: 0,
                powIndex[0].variable,
            );
        }
        
        if (powIndex.length===0&&variableIndex.length!==0&&numberIndex!==0)
        {
            mathInfo.addSolutionInfo(`${variableIndex[0].variable} = \\frac{${numberIndex[0].value}}{${variableIndex[0].value}} = ${(numberIndex[0].value)/(variableIndex[0].value)}`)
            return `${variableIndex[0].variable} = ${(numberIndex[0].value)/(variableIndex[0].value)}`
        }
        else if(tokens.length===1&&numberIndex){
            return JSON.stringify(numberIndex.value===0)
        }
    }
    
    let solved={value: 0,variable: "",pow: ""};
    switch (operator) {
        case "sqrt":
            solved.value = Math.pow(right.value,specialChar!==null?(1)/(specialChar):0.5);
            break;
        case "^":
            if (left.variable||right.variable)
            {
                solved.variable=left.variable||left.variable===right.variable?left.variable:right.variable?right.variable:"";
                solved.pow=2
            }
            solved.value = Math.pow(left.value,right.value);
            break;
        case "frac":
        case "/":
            solved.value = (left.value)/(right.value);
            break;
        case "*":
            solved.value = left.value * right.value;
            handleVriables(left, right,solved);
            break;
        case "+":
            solved.value = left.value + right.value;
            solved.variable=left.variable?left.variable:right.variable;
            break;
        case "-":
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
            return null; 
    }

    function handleVariableMultiplication(left, right, solved) {
        // Rule 1: Handle case where both sides have variables with different bases
        if (left.variable && right.variable && left.variable !== right.variable) {
            // Keep them separate since they have different variables
            solved.terms = [
                { variable: left.variable, pow: left.pow || 1, value: left.value || 1 },
                { variable: right.variable, pow: right.pow || 1, value: right.value || 1 }
            ];
            throw new Error("Different variable bases at power multiplication. I didn't get there yet")
            return;
        }
    
        // Rule 2: If both have the same base, combine their powers
        const variable = left.variable || right.variable;
        solved.variable = variable;
    
        // Combine powers
        const pow = (left.pow || 0) + (right.pow || 0);
        solved.pow = pow || undefined;
    
        // Rule 3: Handle multiplication of constants
        const leftValue = left.value || 1;
        const rightValue = right.value || 1;
        const value = leftValue * rightValue;
    
        // If there's no variable, assign the result as a constant
        if (!variable) {
            solved.value = value;
        } else {
            solved.value = value !== 1 ? value : undefined; // Avoid 1*x notation
        }
    }
    
    

    function handleVriables(left,right,solved){
        let handled={Var:null,Pow:null};
        if (!left.variable&&!right.variable){
            return ;
        }
        if (position.operator==='*'){return handleVariableMultiplication(left,right,solved)}
        
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
    return {
        type: solved.pow? "powerVariable":solved.variable? "variable": "number",
        value: solved.value, 
        variable: solved.variable?solved.variable:"",
        pow: solved.pow?solved.pow:"",
    };
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
    // Find indices based on operator precedence
    let priority1 = findOperatorIndex(begin , end,tokens,/(\^|sqrt)/);
    let priority2 = findOperatorIndex(begin , end,tokens, /(frac|binom|sin|cos|tan|asin|acos|atan)/);
    let priority3 = findOperatorIndex(begin , end,tokens, /(\*|\/)/);
    let priority4 = findOperatorIndex(begin , end,tokens, /[+-]/);
    let priority5 = findOperatorIndex(begin , end,tokens, /=/);
    
    return [priority1, priority2, priority3, priority4, priority5].find(index => index !== -1)??null;
    
}

function applyPosition(tokens, index, direction) {
    let breakChar = index;
    let target;

    const isLeft = direction === "left";
    const indexModifier =  isLeft?- 1 :  1;
    if ((isLeft && index <= 0) || (!isLeft && index >= tokens.tokens.length - 1) || !tokens.tokens[index+indexModifier]) {
        throw new Error("at applyPosition: \"index wasn't valid\"");
    }

    if (tokens.tokens[index+indexModifier].type === "paren") {
        const parenIndex = tokens.findParenIndex(tokens.tokens[index+indexModifier].id);
        breakChar =  isLeft ? parenIndex.open : parenIndex.close;
        target = tokens.tokens.slice(isLeft ? breakChar : index + 1, isLeft ? index : breakChar).find(item => /(number|variable|powerVariable)/.test(item.type));
    } else {
        target = tokens.tokens[index+indexModifier];
    }

    const multiStep = Math.abs(breakChar - index) >= 4;

    if (target?.length===0) {
        throw new Error(`at applyPosition: couldn't find target token for direction ${direction} and operator"${tokens.tokens[index].value}"`,);
    }
    breakChar = (breakChar !== index ? target?.index : breakChar)+ indexModifier+(isLeft?0:1);
    delete target.index
    return {
        ...target,
        multiStep: multiStep,
        breakChar: breakChar
    };
}


export class Position {
    operator;
    index;
    transition;
    specialChar;
    left= null;
    right= null;
    constructor(tokens, index){
        this.index=index;
        this.transition = this.index
        this.position(tokens)
    }
    position(tokens) {
        this.index = this.index === null ? operationsOrder(tokens) : this.index;
        if (this.index === null || this.index === tokens.length - 1) {
            return null;
        }
        this.operator = tokens.tokens[this.index].value;
        switch (true) {
            case operatorSides.both.includes(this.operator):
                this.left = applyPosition(tokens, this.index,"left");
                this.right = applyPosition(tokens, this.index,"right");
                break;
            case operatorSides.rightOnly.includes(this.operator):
                this.left = {breakChar: this.index};
                this.right = applyPosition(tokens, this.index,"right");
                break;
            case operatorSides.doubleRight.includes(this.operator):
                this.left = applyPosition(tokens, this.index,"right");
                this.transition = this.left.breakChar;
                this.right = applyPosition(tokens, this.transition,"right");
                this.left.breakChar = this.index;
                this.right.breakChar += 1;
                break;
            default:
                throw new Error(`Operator ${this.operator} was not accounted for, or is not the valid operator`);
        }
        this.specialChar=tokens.tokens[this.index].specialChar ? tokens[this.index].specialChar : null;
    }
    checkMultiStep(){
        return this.left.multiStep||this.right.multiStep
    }
    // If it is multi step, it needs to be expanded first Therefore, don't do it on multi step
    checkFrac(){
        return /(frac|\/)/.test(this.operator)&&!this.checkMultiStep()//Why did it put this here&&this.left.type!==this.right.type;
    }
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




export class MathPraiser{
    input="";
    tokens=[];
    solution="";
    mathInfo=new MathInfo();

    constructor(input){
        
        this.input=input;
        this.processInput();
        this.tokens=new Tokens(this.input);
        this.addDebugInfo("Tokens after tokenize",this.tokens.tokens)
        this.input=this.tokens.reconstruct()
        this.solution=this.controller();
    }
    //\\frac{132}{1260+x^{2}}=0.05
    //\\frac{132}{1260+x^{2}}=0.05

    controller(){
        this.tokens.connectNearbyTokens();
        this.mathInfo.addMathInfo(this.tokens)
        this.addDebugInfo(this.tokens.tokens,this.tokens.tokens.length)
        this.tokens.expressionVariableValidity();
        
        const position = new Position(this.tokens,null);
        this.addDebugInfo("Parsed expression", JSON.stringify(position, null, 0.01));

        //console.log(this.tokens.tokens,position,this.tokens.reconstruct())

        if (position === null&&this.tokens.tokens.length>1){
            this.addDebugInfo("parse(tokens)",parse(this.tokens.tokens))
            return "the ****"
        // return solution(tokens);
        }
        else if (position.index === null){
            return this.finalReturn();
        }
        if (position.checkFrac()||position.checkMultiStep())
        {
            expandExpression(this.tokens,position);
            this.mathInfo.addSolutionInfo(this.tokens.reconstruct(this.tokens))
            //console.log(this.tokens.tokens,position)
            return this.controller()
        }

        const solved = parse(this.tokens.tokens,this.mathInfo, position);
        this.mathInfo.addDebugInfo("solved",solved)

        if (solved === null) {return null; }
        if (typeof solved==="string") {return solved; }
        
        this.mathInfo.addSolution(this.tokens,position,solved)
        const [leftBreak,length] = [position.left.breakChar,position.right.breakChar-position.left.breakChar]
        
        this.tokens.insertTokens(leftBreak,length,solved)
        this.addDebugInfo("newTokens",this.tokens.tokens)
        return this.tokens.tokens.length>1?this.controller():this.finalReturn();
    }

    addDebugInfo(mes,value){
        this.mathInfo.addDebugInfo(mes,value)
    }
    processInput(){
        this.input=this.input
        .replace(/(\s|\\left|\\right)/g, "") 
        .replace(/{/g, "(") 
        .replace(/}/g, ")")
        .replace(/(\\cdot|cdot)/g, "*")
        .replace(/Math./g, "\\")
        .replace(/(?<!\\|[a-zA-Z])(tan|sin|cos|binom|frac|asin|acos|atan|arccos|arcsin|arctan|cdot)/g, "\\$1");
    }
    finalReturn(){
        return this.tokens.reconstruct()
    }
}











class Tokens{
    tokens=[];
    constructor(math){
        this.tokens=this.tokenize(math);
    }
    tokenize(math){
        let tokens = [];
        let brackets = 0,  levelCount = {};
        let j=0;
        for (let i = 0; i < math.length; i++) {
            j++;
            if(j>500){break;}
            let number=0,  startPos = i,vari="";

            if(/[(\\]/.test(math[i])&&i>0){
                const beforeParentheses=/(number|variable|powVariable)/.test(tokens[tokens.length-1].type)
                
                const lastIndex = tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id) - 1;
                const betweenParentheses=math[i-1] === ")"&&(lastIndex<0||!/(frac|binom|)/.test(tokens[lastIndex].value))
                
                if ((tokens.length-1>=0&&beforeParentheses)||(betweenParentheses)) {
                    if(math[i-1]==="-"){math = math.slice(0, i)+ "1" +math.slice(i)}
                    tokens.push({ type: "operator", value: "*", index: tokens.length?tokens.length:0 });
                    if(math[i+1]==="-"){math = math.slice(0, i)+ "1" +math.slice(i)}
                }
            }

            if (math[i] === "(") {
                if (!levelCount[brackets]) {
                    levelCount[brackets] = 0;
                }
                let ID = levelCount[brackets]++;
                tokens.push({ type: "paren", value: "(", id: brackets + "." + ID, index: tokens.length });
                brackets++;
                continue;
            }
            if (math[i] === ")") {
                brackets--; 
                if (brackets < 0) {
                    throw new Error("Unmatched closing bracket at position");
                }
                let ID = levelCount[brackets] - 1;
                tokens.push({ type: "paren", value: ")", id: brackets + "." + (ID >= 0 ? ID : 0), index: tokens.length });
                
                if (i+1<math.length&&/[0-9A-Za-z.]/.test(math[i+1]))
                {
                    math = math.slice(0, i+1) + "*" + math.slice(i+1);
                }
                continue;
            }

            if (math[i] === "\\") {
                i+=1;  
                let operator = (math.slice(i).match(/[a-zA-Z]+/) || [""])[0]
                
                tokens.push({ type: "operator", value: operator, index: tokens.length });
                i+=operator.length;
                if (tokens[tokens.length - 1].value === "sqrt" && math[i] === "[" && i < math.length - 2) {
                    let temp=math.slice(i,i+1+math.slice(i).search(/[\]]/));
                    i+=temp.length
                    Object.assign(tokens[tokens.length-1],{specialChar: safeToNumber(temp),})
                }
                i--;
                continue;
            }
            let match = math.slice(i).match(/^([0-9.]+)([a-zA-Z]?)/);
            if (match&&!match[2])
            {
                number=match[0]
                i+=number.length>1?number.length-1:0;
                if(/[+-]/.test(math[startPos-1])){number=math[startPos-1]+number}
                
                if (math[i+1]&&/[a-zA-Z]/.test(math[i+1])){continue;}
                tokens.push({ type: "number", value: parseFloat(number), index: tokens.length?tokens.length:0 });
                continue;
            }
            match = math.slice(i).match(/^([0-9.]+)([a-zA-Z]?)/);
            if (/[a-zA-Z]/.test(math[i])) {
                vari= (math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/) || [""])[0];
                if (vari&&vari.length===0){vari=math.slice(i,math.length)}
                number=math.slice(i+vari.length,vari.length+i+math.slice(i+vari.length).search(/[^0-9]/))
                
                i+=vari.length+number.length-1;
                number=safeToNumber(number.length>0?number:1);
                if (/[0-9]/.test(math[startPos>0?startPos-1:0])&&tokens)
                {
                    number=(math.slice(0,startPos).match(/[0-9.]+(?=[^0-9.]*$)/)|| [""])[0];
                    number=math[startPos-number.length-1]&&math[startPos-number.length-1]==="-"?"-"+number:number;
                }
                else if(/[-]/.test(math[startPos-1])){number=math[startPos-1]+number}
                tokens.push({type: "variable",variable: vari.replace("(","{").replace(")","}"),value: safeToNumber(number), index: tokens.length});
                
                continue;
            }
            if (/[*/^=]/.test(math[i])||(!/[a-zA-Z0-9]/.test(math[i+1])&&/[+-]/.test(math[i]))) {
                tokens.push({ type: "operator", value: math[i], index: tokens.length?tokens.length:0 });
                continue;
            }
            if (/[+-\d]/.test(math[i])){continue;}
            throw new Error(`Unknown char "${math[i]}"`);
        }

        if (brackets!==0)
        {
            throw new Error ("Unmatched opening bracket(s)")
        }
        return tokens
    }

    connectNearbyTokens(){
        let i=0,moreConnectedTokens=true;
        while (i < 100 && moreConnectedTokens) {
            i++;
            const index = this.findSimilarSuccessor(this.tokens)
            if (index >=0) {
                this.tokens[index].value+=this.tokens[index+1].value
                this.tokens.splice(index + 1, 1);
            }
            let openParenIndex=-1,closeParenIndex=-1,checktParen=-1;
    
            while (i<100) {
                i++;
                openParenIndex = findOpendParenIndex(this.tokens,checktParen)
                closeParenIndex = openParenIndex === -1?-1:findClosedParenIndex(this.tokens,openParenIndex)
                
                if (openParenIndex===-1||closeParenIndex!==-1){break;}
                checktParen=openParenIndex;
            }
            if (closeParenIndex !== -1) {
                this.tokens = this.tokens.filter((_, idx) =>
                    idx !== openParenIndex && idx !== closeParenIndex
                );
            }
            if (index === -1 && closeParenIndex === -1) {
                break;
            }
        }
        this.reIDparentheses(this.tokens)
    }
    expressionVariableValidity(){
        if (
            Array.isArray(this.tokens) 
            && this.tokens.some(token => /(variable|powVariable)/.test(token.type)) 
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
    
    reorder(){
        let newTokens = [];
        for (let i = 0; i < this.tokens.length; i++) {
            let newToken = { ...this.tokens[i], index: i };
            newTokens.push(newToken);
        }
        this.tokens=newTokens;
    }
    reconstruct(tokens){
        if (tokens===undefined){
            tokens=this.tokens;
        }
        let math = "";
        for (let i=0;i<tokens.length;i++){
            let temp;
            if (tokens[i].value==="("&&tokens[tokens.findLastIndex((token, index) => token.id === tokens[i].id&&tokens[index+1])+1].value==="/")
            {
                math+="\\frac";
            }
            switch (tokens[i].type){
                case "number":
                    temp=(plusSymbolCheck(tokens,i)?"+":"")+roundBySettings(tokens[i].value)
                    math+=temp+(i+1<tokens.length&&/(frac)/.test(tokens[i+1].value)?"+":"");
                    break;
                case "paren":
                    temp=tokens[this.findParenIndex(tokens[i].id).open-1]
                    
                    if (typeof temp !== "undefined" && 
                        ((curlyBracketsRegex.test(temp.value)) || 
                        (/\)/.test(temp.value) && curlyBracketsRegex.test(tokens[this.findParenIndex(temp.id).open - 1].value)))) 
                    {
                        math += tokens[i].value.replace(/\(/, "{").replace(/\)/, "}");
                        break;
                    }
    
                    else if (i>0&&tokens[i].value==="("&&tokens[i-1]?.value===")"){math+="+"}
                    math+=tokens[i].value;
                    break;
                case "operator":
                        if (tokens[i].value !== "/") {
                        math+=(tokens[i].value).replace(/([^*^=/+-])/,"\\$1").replace(/\*/g,"\\cdot ");
                        }
                    break;
                case "variable":
                    math+=(plusSymbolCheck(tokens,i)?"+":"")+(tokens[i].value!==1?tokens[i].value:"")+tokens[i].variable;
                    break;
                case "powerVariable":
                    //console.log(plusSymbolCheck(tokens,i))
                    math+=(plusSymbolCheck(tokens,i)?"+":"")+(tokens[i].value!==1?tokens[i].value:"")+tokens[i].variable+`^{${tokens[i].pow}}`;
                    break;
                default:
                    throw new Error(`Unexpected tokin type given to reconstruct: type ${tokens[i].type}`);
            }
        }
        return math
    }
    findParenIndex(id,index){
        try{
            id=index?this.tokens[index].id:id;
            const open=this.tokens.findIndex(
                token=>token.value==="("
                &&token.id===id
            )
            const close=this.tokens.findLastIndex(
                token=>token.value===")"
                &&token.id===id
            )
            return{open: open,close: close,id:id}
        }
        catch(e){
            throw new Error(e);
        }
    }

    tokenCompare(compare, value, token, nextToken) {
        value = value instanceof RegExp ? value : new RegExp(value);
        return (
            (value === null || value.test(token[compare])) &&
            token[compare] === nextToken?.[compare]
        );
    }
    findSimilarSuccessor(tokens){
       return this.tokens.findIndex((token, index) =>
                ((tokens[index + 2]?.type !== "operator"&&tokens[index -1]?.type !== "operator")
                &&(this.tokenCompare("type",this.valueTokens(), token, tokens[index + 1]))
        ));
    }

    valueTokens(){
        return /(number|variable|powerVariable)/
    }
    reIDparentheses() {
        let tokens=this.tokens
        let brackets = 0, levelCount = {};
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].value === "(") {
                if (!levelCount[brackets]) {
                    levelCount[brackets] = 0;
                }
                let ID = levelCount[brackets]++;
                // Reassign the object with the new id to ensure persistence
                tokens[i] = { ...tokens[i], id: brackets + "." + ID };
                brackets++;
                continue;
            }
            if (tokens[i].value === ")") {
                brackets--;
                let ID = levelCount[brackets] - 1;
                // Reassign the object with the new id to ensure persistence
                tokens[i] = { ...tokens[i], id: brackets + "." + (ID >= 0 ? ID : 0) };
                continue;
            }
        }
        this.tokens=tokens;
        this.reorder();
    }
}

const plusSymbolCheck = (tokens, index) => {
    if (!index > 0) return false;
    return tokens[index].value >= 0 && /(number|variable|powerVariable)/.test(tokens[index - 1].type);
};



export function flattenArray(arr) {
    let result = [];
    let stack = Array.isArray(arr) ? [...arr] : [arr];  // Ensure arr is an array or wrap it in one

    while (stack.length) {
        const next = stack.pop();
        if (Array.isArray(next)) {
            stack.push(...next);  // Spread the array items to the stack
        } else {
            result.push(next);  // Add non-array items to the result
        }
    }

    return result.reverse();  // Reverse to maintain original order
}