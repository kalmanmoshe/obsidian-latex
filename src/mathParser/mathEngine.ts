
import { quad,calculateBinom,roundBySettings ,degreesToRadians,radiansToDegrees, calculateFactorial} from "./mathUtilities";
import { expandExpression,curlyBracketsRegex } from "../imVeryLazy";
import { arrToRegexString, Axis, regExp } from "../tikzjax/tikzjax";
import { Associativity } from "src/utils/staticData";
import { findParenIndex, Paren,idParentheses, isOpenParen, findDeepestParenthesesScope } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, searchMathJaxOperators } from "../utils/dataManager";
import { MathGroup, MathJaxOperator, Token, BasicMathJaxTokens, BasicMathJaxToken, ensureAcceptableFormatForMathGroupItems, deepSearchWithPath } from "./mathJaxTokens";
import { start } from "repl";
import { group } from "console";
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
    mathSnapshots: MathGroup[]=[]
    addGraphInfo(value: string){
        this.graph+=value;
    }
    addDebugInfo(msg: string, value: any){
        this.debugInfo+=(typeof msg==="object"?JSON.stringify(msg,null,1):msg)+" : "+(typeof value==="object"?JSON.stringify(value,null,1):value)+ "\n ";
    }
    addSolutionInfo(mes: string){
        this.solutionInfo.push(mes);
        this.addDebugInfo("Solved",mes);
    }
    addMathInfo(msg: string){
        this.mathInfo.push(msg)
    }
    addMathSnapshot(math: MathGroup){
        this.mathSnapshots.push(math)
        const result = deepSearchWithPath(
            math,
            (item) => item instanceof MathJaxOperator && item.solution !== undefined
        );
        if(!result)return

        const customFormatter = (check: any,string: string): string => {
            if (check instanceof MathJaxOperator && check.solution !== undefined) {
                return `{\\color{red}${string}}`;
            }
            return string
        };
        this.mathInfo.push(math.toString(customFormatter))
        console.log(result.item)
        this.solutionInfo.push(result.item.toStringSolution())
        
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









function rearrangeEquation(tokens: any,tokenToisolate: any){
    
}

function isolateMultiplication(tokens: any,isolatToken: Token){/*
    const index=operationsOrder(tokens)
    const Isolated=tokens.tokens.find((token: any, idx: number)=>idx<index)
    const frac=createFrac(tokens.list.slice(index + 1),new Token(Isolated.value))
    Isolated.value=1;
    tokens.insertTokens(index+1,tokens.tokens.length-index+1,frac)*/
}

function createFrac(nominator: any,denominator: Token){
   // return [new Token('frac'),new Token('('),nominator,new Token(')'),new Token('('),denominator,new Token(')')]
}
/*
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
*/
/*
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
*/



export class Position {
    operator: string;
    index: number;
    start: number;
    end: number;
    transition: number;
    specialChar: string;
    
    groups: MathGroup[];
    constructor(tokens: any[], index: number){
        this.index = index;
        this.transition = this.index;
        this.start = this.index;
        this.end = this.index;
        this.position(tokens)
    }
    position(tokens: any[]) {
        this.operator = tokens[this.index].value;
        const metadata = searchMathJaxOperators(this.operator);
        if (!metadata) throw new Error(`Operator ${this.operator} not found in metadata`);
    
        const beforeIndex: MathGroup[] = [];
        const afterIndex:  MathGroup[] = [];
    
        getValuesWithKeysBySide(metadata.associativity.positions, true).forEach(() => {
            const item = this.applyPosition(tokens, this.start, true);
            beforeIndex.push(item.mathGroup);
            this.start = item.lastItemOfPrevious;
        });
    
    
        getValuesWithKeysBySide(metadata.associativity.positions, false).forEach(() => {
            const item = this.applyPosition(tokens, this.end, false);
            afterIndex.push(item.mathGroup);
            this.end = item.lastItemOfPrevious;
        });
        this.groups = beforeIndex.reverse().concat(afterIndex);
    }
    applyPosition(tokens: any[], index:  number, isLeft: boolean) {
        let breakChar=index
        let target: any;
        const modifiedIndex =  index+(isLeft?- 1 :  1);

        if ((isLeft && index <= 0) || (!isLeft && index >= tokens.length - 1) || !tokens[modifiedIndex]) {
            throw new Error("at applyPosition: \"index wasn't valid\" index: "+index);
        }

        if (tokens[modifiedIndex] instanceof Paren) {
            const parenIndex = findParenIndex(tokens[modifiedIndex],tokens);
            breakChar =  isLeft ? parenIndex.open : parenIndex.close+1;
            // Insure proper formatting removed everything including parentheses
            target = ensureAcceptableFormatForMathGroupItems(tokens.slice(parenIndex.open, parenIndex.close+1));
        } else {
            breakChar=modifiedIndex;
            target = ensureAcceptableFormatForMathGroupItems(tokens[breakChar]);
        }
        if (target?.length===0) {
            throw new Error(`at applyPosition: couldn't find target token for direction ${isLeft?'left':'right'} and operator"${tokens[index].value}"`,);
        }

        //Make sure we don't create duplicate interlocked math groups
        if(target?.length&&target?.length===1&&target[0]instanceof MathGroup){
            target=target[0]
            target.tryRemoveUnnecessaryNested();
        }

        return {
            mathGroup: new MathGroup(target),
            lastItemOfPrevious: breakChar,
        };
    }
}

function parseSafetyChecks(operator: MathJaxOperator){
    if (operator.groupNum!==operator.groups.length) {
        throw new Error(`Invalid number of groups for operator ${operator.operator} expected ${operator.groupNum} but got ${operator.groups.length}`);
    }
}

export function parseOperator(operator: MathJaxOperator): boolean {
    parseSafetyChecks(operator); 
    function getOperableValue(group: MathGroup): number | null {
        if (!group||!group.isOperable()) return null;
        const value = group.getOperableValue();
        return value?.getValue() ?? null;
    }
    const group1 = getOperableValue(operator.groups[0]);
    const group2 = getOperableValue(operator.groups[1]);
    if (group1 === null||(group2===null&&operator.groupNum>1)) return false;
    
    switch (operator.operator) {
        case "Sine":
            operator.solution = new MathGroup([new Token(Math.sin(degreesToRadians(group1)))]);
            break;
        case "SquareRoot":
            if (group1 < 0) {
                throw new Error("Cannot calculate the square root of a negative number.");
            }
            operator.solution = new MathGroup([new Token(Math.pow(group1,0.5))]);
            break;
        case "Fraction": {
            if (group2 === 0) {
                throw new Error("Division by zero is not allowed");
            }
            operator.solution = new MathGroup([new Token(group1 / group2!)]);
            break;
        }
        case "Power": {
            operator.solution = new MathGroup([new Token(Math.pow(group1,group2!))]);
            break;
        }
        case "Multiplication": {
            operator.solution = new MathGroup([new Token(group1 * group2!)]);
            break;
        }
        default:
            throw new Error(
                `Unknown operator type in parseOperator: ${operator.operator}`
            );
            
    }
    return true;
}




function operationsOrder(tokens: any[]) {
    function findOperatorIndex(begin: number, end: number, tokens: any, regex?: any) {
        const index=tokens.slice(begin, end).findIndex((token: { type: string; value: any; }) => token.type === "operator" && regex.test(token.value));
        return index>-1?index+begin:null;
    }
    const { begin, end } = findDeepestParenthesesScope(tokens);
    let priority=null
    for (let i=1;i<=6;i++){
        priority = findOperatorIndex(begin , end,tokens, getMathJaxOperatorsByPriority(i,true));
        if(priority!==null)break;
    }
    return {start: begin,end: end,specificOperatorIndex: priority}
}


export class MathPraiser{
    input="";
    tokens: MathGroup;
    solution: any;
    mathInfo=new MathInfo();
    constructor(input: string){
        this.input=input;
        this.processInput();
        
        const tokens=new BasicMathJaxTokens(this.input);
        const basicTokens=tokens.tokens
        
        this.convertBasicMathJaxTokenaToMathGroup(basicTokens)
        this.addDebugInfo("convertBasicMathJaxTokenaToMathGroup",this.tokens)
        
        this.input=this.tokens.toString()
        this.controller();
        this.solution=this.tokens
        this.addDebugInfo("solution",this.solution);
    }

    
    parse(tokens: MathGroup): void {
        const operatorIndex=tokens.getItems().findIndex(
            t => t instanceof MathJaxOperator && t.isOperable
        ) ;
        if (operatorIndex<0) return;
        const operator = tokens.getItems()[operatorIndex] as MathJaxOperator
    
        
        operator.groups.forEach(group => {
            this.parse(group);
        });
        parseOperator(operator)
        if (!operator.solution) {
            operator.isOperable = false;
            return;
        }
        this.mathInfo.addMathSnapshot(this.tokens.clone())
        tokens.setItem(operator.solution,operatorIndex); 
    }
    
    controller(): any{
        this.parse(this.tokens)

        this.tokens.removeNested()
        this.tokens.combiningLikeTerms()

        //this.tokens.combiningLikeTerms()
        /*
        this.tokens.tokens.combiningLikeTerms()
        for (let i = 0; i < this.tokens.tokens.items.length; i++) {
            const item = this.tokens.tokens.items[i];
        
            if (!(item instanceof mathJaxOperator)) continue;
        
            this.tokens.tokens.items[i] = item.addSolution();
        }        
        */
        //this.tokens.tokens.addSolution()
        //return this.tokens.tokens;
        
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
    solutionToString(){
        return (this.tokens.toString())||""
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
        //isolateMultiplication(this.tokens,new Token(praisingMethod.variables[0]))
        //return this.controller()
        //this.tokens.insertTokens()
        //Use possession
    }

    useQuadratic(){/*
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
            }*/
    }
    addDebugInfo(mes: string,value: any){
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
       // return this.tokens.reconstruct()
    }
    defineGroupsAndOperators(tokens: Array<any>):boolean|this{
        const range=operationsOrder(tokens);
        if(range.start===null||range.end===null)return false;
        if(range.specificOperatorIndex===null&&range.start===0&&range.end===tokens.length)return true;
        let newMathGroupSuccess=null
        if (range.specificOperatorIndex!==null)
            newMathGroupSuccess=this.createOperatorItemFromTokens(tokens,range.specificOperatorIndex)
        else
        newMathGroupSuccess=this.createMathGroupInsertFromTokens(tokens,range.start,range.end)
        if(!newMathGroupSuccess)return false;
        return this.defineGroupsAndOperators(tokens);
    }
    convertBasicMathJaxTokenaToMathGroup(basicTokens: Array<BasicMathJaxToken|Paren>):void{
        const success=this.defineGroupsAndOperators(basicTokens)
        if(!success)return
        this.tokens=new MathGroup(ensureAcceptableFormatForMathGroupItems(basicTokens))
    }
    createMathGroupInsertFromTokens(tokens: Array<any>,start: number,end: number):boolean{
        const newMathGroup=new MathGroup(ensureAcceptableFormatForMathGroupItems(tokens.slice(start,end+1)));
        tokens.splice(start,(end-start)+1,newMathGroup);
        return true
    }
    createOperatorItemFromTokens(tokens: Array<any>,index: number):boolean{
        const metadata = searchMathJaxOperators(tokens[index].value);
        if(!metadata)throw new Error(`Operator ${tokens[index].value} not found in metadata`);
        
        const position=new Position(tokens,index)
        const c=deepClone(tokens)
        const newOperator=new MathJaxOperator(position.operator,metadata.associativity.numPositions,position.groups,)
        tokens.splice(position.start,(position.end-position.start)+1,newOperator);
        return true
    }
}
function deepClone(items: any[]) {
    let clone: any[] = [];
    items.forEach(item => {
        clone.push(item instanceof Array ? deepClone(item) : item.clone());
    });
    return clone;
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



class PraisingMethod{/*
    tokens
    overview: any;
    variables: Set<string>;
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
    }
    whatToIsolat(){
        // i need to add pows after
        // for know im going on the oshomshin that thr is only one var
        if(this.variables?.length<1)return;

        return {type: 'variable',value: this.variables[0]}
    }/*
    isOverviewToisolat(overview){
    }
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
    }*/
}

class Operator{

}

class Modifier{

}