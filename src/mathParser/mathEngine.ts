
import { quad,calculateBinom,roundBySettings ,degreesToRadians,radiansToDegrees, calculateFactorial} from "./mathUtilities";

import { findParenIndex, Paren,idParentheses, findDeepestParenthesesScope } from "../utils/ParenUtensils";
import { getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, mahtjaxAssociativitymetadata, searchMathJaxOperators } from "../staticData/dataManager";
import { MathGroup, MathJaxOperator, Token, ensureAcceptableFormatForMathGroupItems, deepSearchWithPath, MathGroupItem, stringToBasicMathJaxTokens } from "./mathJaxTokens";
import { BasicMathJaxToken } from "src/mathParser/basicToken";


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
        this.solutionInfo.push(result.item.toStringSolution())
        
    }

}








function rearrangeEquation(tokens: any,tokenToisolate: any){
    
}

function isolateMultiplication(tokens: any,isolatToken: Token){/*
    const index=operationsOrder(tokens)
    const Isolated=tokens.tokens.find((token: any, idx: number)=>idx<index)
    const frac=createFrac(tokens.list.slice(index + 1),new Token(Isolated.value))
    Isolated.value=1;
    tokens.insertTokens(index+1,tokens.tokens.length-index+1,frac)*/
}



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
    
        getValuesWithKeysBySide(mahtjaxAssociativitymetadata(metadata).positions, true).forEach(() => {
            const item = this.applyPosition(tokens, this.start, true);
            beforeIndex.push(item.mathGroup);
            this.start = item.lastItemOfPrevious;
        });
    
    
        getValuesWithKeysBySide(mahtjaxAssociativitymetadata(metadata).positions, false).forEach(() => {
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

        return {
            mathGroup: new MathGroup(target),
            lastItemOfPrevious: breakChar,
        };
    }
}

function parseSafetyChecks(operator: MathJaxOperator){
    if ((operator.commutative&&operator.groups.length<operator.groupNum)||(!operator.commutative&&operator.groups.length!==operator.groupNum)) {
        throw new Error(`Invalid number of groups for operator ${operator.operator} expected ${operator.groupNum} but got ${operator.groups.length}`);
    }
}

export function parseOperator(operator: MathJaxOperator): boolean {
    parseSafetyChecks(operator); 
    function getOperableValue(group: MathGroup): number | null {
        if (!group||!group.isOperable()) return null;
        return group.getOperableValue();
    }
    const group1 = getOperableValue(operator.groups[0]);
    const group2 = getOperableValue(operator.groups[1]);
    if (group1 === null||(group2===null&&operator.groups.length>1)) return false;
    
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
        default:
            throw new Error(
                `Unknown operator type in parseOperator: ${operator.operator}`
            );
            
    }
    return true;
}


function basicMathJaxTokensToMathGroup(basicTokens: Array<BasicMathJaxToken|Paren>): MathGroup|undefined{
    const defineGroupsAndOperators = (tokens: Array<any>): boolean => {
        const range=operationsOrder(tokens);
        if(range.start===null||range.end===null)return false;
        if (range.specificOperatorIndex === null && range.start === 0 && range.end === tokens.length) return true;
        let newMathGroupSuccess = false;
        if (range.specificOperatorIndex !== null)
            newMathGroupSuccess=createOperatorItemFromTokens(tokens,range.specificOperatorIndex)
        else
            newMathGroupSuccess=createMathGroupInsertFromTokens(tokens,range.start,range.end)
        if(!newMathGroupSuccess)return false;
        return defineGroupsAndOperators(tokens);
    }
    const createMathGroupInsertFromTokens=(tokens: Array<any>,start: number,end: number):boolean=>{
        const newMathGroup=new MathGroup(ensureAcceptableFormatForMathGroupItems(tokens.slice(start,end+1)));
        tokens.splice(start,(end-start)+1,newMathGroup);
        return true;
    }
    const createOperatorItemFromTokens=(tokens: Array<any>,index: number):boolean=>{
        const metadata = searchMathJaxOperators(tokens[index].value);
        if(!metadata)throw new Error(`Operator ${tokens[index].value} not found in metadata`);
        
        const position = new Position(tokens, index);
        const newOperator = MathJaxOperator.create(position.operator, mahtjaxAssociativitymetadata(metadata).numPositions, position.groups);
        tokens.splice(position.start,(position.end-position.start)+1,newOperator);
        return true
    }

    const success=defineGroupsAndOperators(basicTokens)
    if(!success)return
    const GroupedBasicTokens: MathGroupItem[]=(basicTokens.filter((t) => !(t instanceof Paren))as any)
    return new MathGroup(GroupedBasicTokens)
}



function stringToMathGroup(string: String):MathGroup|undefined{
    const basicTokens = stringToBasicMathJaxTokens(string);
    const mathGroup = basicMathJaxTokensToMathGroup(basicTokens)
    return mathGroup
}



function operationsOrder(tokens: any[]) {
    function findOperatorIndex(begin: number, end: number, tokens: any, regex?: any) {
        const index=tokens.slice(begin, end).findIndex((token: { type: string; value: any; }) => token.type === "operator" && regex.test(token.value));
        return index>-1?index+begin:null;
    }
    const { begin, end } = findDeepestParenthesesScope(tokens);
    let index=null
    for (let priority=1;priority<=6;priority++){
        index = findOperatorIndex(begin , end,tokens, getMathJaxOperatorsByPriority(priority,true));
        if(index!==null)break;
    }
    return {start: begin,end: end,specificOperatorIndex: index}
}

export class MathPraiser{
    private input="";
    private mathGroup: MathGroup;
    private variables: mathVariables;
    solution: any;
    mathInfo=new MathInfo();
    constructor(input?: string,mathGroup?: MathGroup,solution?: any,mathInfo?: MathInfo){
        if(input)this.input=input;
        if(mathGroup)this.mathGroup=mathGroup;
        if(solution)this.solution=solution;
        if(mathInfo)this.mathInfo=mathInfo;
    }
    setInput(input: string){
        this.input=input;
        this.processInput();
        const mathGroup=stringToMathGroup(this.input);
        if(!mathGroup)throw new Error("Invalid input");
        this.mathGroup=mathGroup;
        console.log('this.mathGroup',this.mathGroup.clone().toString(),this.mathGroup);
    }
    getMathGroupVariables(){return this.mathGroup.getVariables();}

    toStringLatex(){return this.mathGroup.toStringLatex()}
    addSolution(){
        this.input=this.mathGroup.toString()
        this.controller();
        this.solution=this.mathGroup
        this.addDebugInfo("solution",this.solution);
    }
    getMathGroup(){return this.mathGroup}
    evaluate(){
        return this.parse(this.mathGroup.clone())
    }

    parse(tokens: MathGroup): void {
        console.log('tokens',tokens.toString())
        const operatorIndex=tokens.getItems().findIndex(
            t => t instanceof MathJaxOperator && t.isOperable
        );
        if (operatorIndex<0) return;
        const operator = tokens.getItems()[operatorIndex] as MathJaxOperator
    
        operator.groups.forEach(group => {
            this.parse(group);
        });
        operator.parseMathjaxOperator()
        if (!operator.solution) {
            operator.isOperable = false;
            return;
        }
        this.mathInfo.addMathSnapshot(this.mathGroup.clone())
        tokens.replaceItemCell(operator.solution,operatorIndex); 
    }
    
    controller(): any{
        this.parse(this.mathGroup)
        combineSimilarValues(this.mathGroup)
        this.mathGroup.combiningLikeTerms()

    }
    solutionToString(){
        return (this.mathGroup.toString())||""
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
}

function deepClone(items: any[]) {
    let clone: any[] = [];
    items.forEach(item => {
        clone.push(item instanceof Array ? deepClone(item) : item.clone());
    });
    return clone;
}

function combineSimilarValues(math: MathGroup){
    
    const op=math.getItems().find(t=>t instanceof MathJaxOperator)
    if(!op)return
    /*const a=new MathOverview()
    a.defineGlobalOverview(math.getItems())
    a.separateIntoIndividuals()*/

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
