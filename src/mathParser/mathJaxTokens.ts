
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
import { findConsecutiveSequences, flattenArray, Position } from "./mathEngine";


export class mathJaxOperator{
    operator: string;
    priority: number;
    associativityNumber: number;
    group1: mathGroup;
    group2?: mathGroup;
    solution?: mathGroup
    constructor(operator?: string,priority?: number,associativityNumber?: number,group1?: mathGroup,group2?: mathGroup){
        if (operator)this.operator=operator
        if (priority)this.priority=priority
        if (associativityNumber)this.associativityNumber=associativityNumber
        if (group1)this.group1=group1
        if (group2)this.group2=group2
    }
    setGroup1(group: mathGroup){this.group1=group}
    setGroup2(group: mathGroup){this.group2=group}
}

export class mathGroup{
    private items: Token[];
    numberOnly: boolean;
    hasVariables: boolean;
    singular: boolean;
    hasOperators: boolean;
    multiLevel: boolean;
    isOperable: boolean=true;
    constructor(){

    }
    setItems(items: Token[]){
        this.items=items
    }
    setMetaData(){
        this.singular=this.items.length===1;
        this.numberOnly=this.items.some(t=> !t.isVar());
    }
}


export class Tokens{
    tokens: any=[];
    operatorTokens: any[]=[]
    operatorStructure: mathJaxOperator;
    
    constructor(math: string){
        this.tokenize(math);
    }
    tokenize(math: string){
        //latexOperators.push(String.raw`[*/^=\+\-\(\)]`)
        //const operators=arrToRegexString(latexOperators)
        const operators=arrToRegexString(getAllMathJaxReferences())
        for (let i = 0; i < math.length; i++) {
            let match = math.slice(i).match(regExp('^' + operators));
            if (!!match) {
                this.tokens.push(new  BasicMathJaxToken(match[0]));
                i+=match[0].length-1;
                continue;
            }
            match = math.slice(i).match(/^([0-9.]+)/);//([a-zA-Z]?)/);
            if (!!match)
            {   i+=match[0].length-1
                this.tokens.push(new BasicMathJaxToken(parseFloat(match[0])));
                continue;
            }
            match=math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/)
            if (!!match) {
                i+=match[0].length-1
                this.tokens.push(new BasicMathJaxToken(1,match[0]))
                //tokens.push({type: "variable",variable: vari.replace("(","{").replace(")","}"),value: 1});
                continue;
            }

            throw new Error(`Unknown char "${math[i]}"`);
        }
        this.postProcessTokens();
    }

    
    
    postProcessTokens(){
        /*rules to abid by:
        1. +- If part of the number they are absorbed into the number
        */
       
        idParentheses(this.tokens);
        const map=this.tokens.map((token: BasicMathJaxToken,index: any)=> (token.isValueToken())?index:null).filter((item: null) => item !== null)
        const arr=findConsecutiveSequences(map);
        let tempTokens=this.tokens.map((t:BasicMathJaxToken)=>{
            if(typeof t.value==='number')
                return new Token(t.value,t.variable)
           // if(t.type==='operator')return new mathJaxOperator(t.value)
        return t;
        });

        // Step one structure aka replace parentheses with nested arrays
        // Step two Find first operator.and continue from there
        const pos=new Position(tempTokens)
        const math=new mathJaxOperator(pos.operator)
        const group=new mathGroup()
        const [leftBreak,length] = [pos.left.breakChar,pos.right.breakChar-pos.left.breakChar]
        
        group.setItems(pos.right.tokens)
        math.setGroup1(group)
        tempTokens.splice(leftBreak,length,math);
        console.log('tempTokens',tempTokens)
        return ;
     

        this.connectAndCombine(arr);
        this.validatePlusMinus();

        console.log(tempTokens);
        

        const parenMap=this.implicitMultiplicationMap()
        parenMap.sort((a: number, b: number) => b - a)
        .forEach((value: any) => {
            this.tokens.splice(value, 0, new  BasicMathJaxToken('*'));
        });

        const mapPow=this.tokens.map((token: { value: string; },index: any)=> token.value==='Pow'?index:null).filter((item: null) => item !== null)
        console.log(mapPow)
        mapPow.forEach((index: number | undefined) => {
            //const position=new Position(this,index)
            //const [leftBreak,length] = [position.left.breakChar,position.right.breakChar-position.left.breakChar]
           // this.tokens.insertTokens(leftBreak,length,solved)
        });
    }
    validateIndex(index: number,margin?: number){
        margin=margin||0;
        return index>=0+margin&&index<this.tokens.length-margin;
    }
    implicitMultiplicationMap(){
        const testDoubleRight = (index: number) => {
            if (!this.validateIndex(index)) return false;
            const idx=findParenIndex(null,index).open;
            return this.tokens[index+1]?.value==='('&&(idx===0||!getOperatorsByAssociativity('doubleRight').includes(this.tokens[idx-1]?.value));
            
        };
        const check = (index: number) => {
            if (!this.validateIndex(index)) return false;
            return this.tokens[index].isValueToken();
        };

        //Map parentheses for implicit multiplication.
        const map = this.tokens
            .map((token: { value: string; }, index: number) => { 
                if (token.value === "(" || (hasImplicitMultiplication(token.value))) {
                    return check(index - 1) ? index : null;
                } else if (token.value === ")") {
                    return check(index + 1) ||testDoubleRight(index)? index+1 : null;
                }
                return null;
            })
            .filter((item: null) => item !== null);
        return map
    }

    validatePlusMinus(){
        const map=this.tokens.map((token: { value: string; },index: any)=> token.value==='Plus'||token.value==='Minus'?index:null).filter((index: null)=> index!==null)

        map.forEach((index: any) => {
            index=this.validateIndex(index,1)&&this.tokens[index-1].type==='operator'||this.tokens[index+1].type==='operator'?null:index;
        });

        map.reverse().forEach((index: number) => {
            const value=this.tokens[index].value==='Plus'?1:-1;
            this.tokens[index+1].value*=value;
            this.tokens.splice(index,1)
        });
    }
    mapParenIndexes(){
        return this.tokens
        .map((token: { value: string; }, index: any) => token.value === "(" ? findParenIndex(undefined, index) : null)
        .filter((item: null) => item !== null)
    }

    filterParenIndexesForRemoval() {
        return this.mapParenIndexes()
            .filter((item: any) => {
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
            }).flatMap((item: any) => [item.open, item.close]);
    }    
    
    /*
    findSimilarSuccessor(tokens){
        return this.tokens.findIndex((token, index) =>
                ((tokens[index + 2]?.type !== "operator"&&tokens[index -1]?.type !== "operator")
                &&(this.tokenCompare("type",this.valueTokens(), token, tokens[index + 1]))
        ));
     }*/

    connectNearbyTokens(){
        this.tokens.forEach((token: any) => {
            if (!(token instanceof Token)){
                throw new Error("ftygubhnimpo")
            }
        });
        const map = new Set(this.filterParenIndexesForRemoval());
        this.tokens = this.tokens.filter((_: any, idx: unknown) => !map.has(idx));
        //Problem with  = as it's affecting the variable before it
        const check = (index: number) => {
            return (
                !this.tokens?.[index - 1]?.affectedOperatorRange?.() &&
                !this.tokens?.[index + 1]?.affectedOperatorRange?.()
            );
        };

        const numMap=this.tokens.map((token: { type: string; },index: any)=> token.type==='number'&&check(index)?index:null).filter((item: null) => item !== null)
        const varMap=this.tokens.map((token: { type: string; },index: any)=> token.type==='variable'&&check(index)?index:null).filter((item: null) => item !== null)
        
        const arr = [
            ...findConsecutiveSequences(numMap), 
            ...findConsecutiveSequences(varMap), 
        ];
        this.connectAndCombine(arr)
        
        idParentheses(this.tokens)
    }


    connectAndCombine(arr: any[]){
        const indexes:any=[]

        arr.sort((a, b) => b[0] - a[0]).forEach(el => {
            indexes.push({start: el[0],end: el[el.length - 1]})
        });

        indexes.forEach((index: { start: number; end: number; }) => {
            let value = Number(this.tokens[index.start].value);
            const isVar=this.tokens.slice(index.start,index.end+1).find((token: any)=> token.type.includes('var'));
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

    insertTokens(start: any, length: number, objects: any[] | Token) {
        objects = flattenArray(objects);
        if (!Array.isArray(objects)) {
            console.error("Expected `objects` to be an array, but received:", objects);
            return;
        }
        this.tokens.splice(start, length, ...objects);
    }

    reconstruct(tokens?: any){
        if (!tokens){tokens=this.tokens;}
        const addPlusIndexes=this.indexesToAddPlus(tokens);
        const curlyBracketIndexes = this.curlyBracketIDs(tokens).flatMap(({ open, close }) => [open, close]);
        let math = "";
        for (let i=0;i<tokens.length;i++){
            let temp;
            math+=addPlusIndexes.includes(i)?'+':'';
            if (tokens[i]?.value==="("&&tokens[tokens.findLastIndex((token: { id: any; }, index: number) => token.id === tokens[i].id&&tokens[index+1])+1].value==="/")
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
        const map: { open: any; close: any; id: any; }[] = [];
    
        tokens.forEach((token: { value: string; }, index: number) => {
            const prevToken = tokens[index - 1]?.value;
            const nextToken = tokens[index + 1]?.value;
    
            if (token.value === '(') {
                if (index > 0 && doubleRightBrackets.includes(prevToken)) {
                    const p1 = findParenIndex(undefined, index, tokens);
                    const p2 = findParenIndex(undefined, p1.close + 1, tokens);
                    map.push(p1, p2);
                } else if (index > 0 && rightBrackets.includes(prevToken)) {
                    map.push(findParenIndex(undefined, index, tokens));
                }
            } else if (token.value === ')' && bothBrackets.includes(nextToken)) {
                map.push(findParenIndex(undefined, index, tokens));
            }
        });
        return map;
    }
    

    indexesToAddPlus(tokens: any[]){
        return tokens.map((token,index)=>index>0
            &&tokens[index - 1]?.isValueToken()
            &&token?.isValueToken()&&token.value>=0?index:null
        ).filter(item=>item!==null)
    }
    
    

    tokenCompare(compare: string | number, value: string|RegExp, token: { [x: string]: any; }, nextToken: { [x: string]: any; }) {
        const regExpvalue = (value instanceof RegExp) ? value : new RegExp(value);
        return (
            (value === null || regExpvalue.test(token[compare])) &&
            token[compare] === nextToken?.[compare]
        );
    }

}


export class Token{
    value?: number;
    variable?: string;
    constructor(value:number ,variable?: string){
        this.value=value;
        this.variable=variable;
    }
    isVar() {return this.variable!==undefined}

}


export class BasicMathJaxToken{
    type: string;
    value?: string|number;
    variable?: string;
    modifier: any;
    id: Paren;
    
    constructor(value: string | number | undefined,variable?: any){
        this.value=value;
        this.variable=variable;
        this.setType();
        this.insurProperFormatting()
    }
    insurProperFormatting(){
        if (this.type==='operator'&&typeof this.value==='string'){
            this.value=searchMathJaxOperators(this.value)?.name
        }
       // if (!this.value){throw new Error('wtf Value was undefined at token insurProperFormatting')}
    }
    getId(){return this.id.id};

    getLatexSymbol(){return typeof this.value==='string'?searchMathJaxOperators(this.value)?.latex:undefined}

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
            string+=this.getLatexSymbol()
        if (this.type==='variable') string+=this.toStringVariable()
        if (this.type==='number') string+=this.value;
        return string
    }
    affectedOperatorRange(direction: string){
        if(this.type!=='operator'||this.value==='Equals')
            return false
        if(typeof this.value==='string'&&direction==='left'&&!getOperatorsByAssociativity('both').includes(this.value))
            return false
        return true
    }
    toStringVariable(){
        return (this.value&&this?.value!==1?this.value:'')+(this.variable||'');
    }
}