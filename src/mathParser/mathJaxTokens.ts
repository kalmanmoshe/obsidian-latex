
import { quad,calculateBinom,roundBySettings ,degreesToRadians,radiansToDegrees, calculateFactorial} from "./mathUtilities";
import { expandExpression,curlyBracketsRegex } from "../imVeryLazy";
import { type } from "os";
import { arrToRegexString, Axis, regExp } from "../tikzjax/tikzjax";
import { Associativity, BracketType, MathJaxOperatorMetadata, mathJaxOperatorsMetadata, OperatorType } from "src/utils/staticData";

import { findParenIndex, Paren,idParentheses, isOpenParen, isClosedParen } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators, searchSymbols } from "../utils/dataManager";
import { group } from "console";


export function deepSearchWithPath(
    structure: any,
    predicate: (item: any) => boolean,
    path: (string | number)[] = []
): { item: any; path: (string | number)[] } | null {
    // Base case: If the current structure matches the predicate
    if (predicate(structure)) {
        return { item: structure, path };
    }

    // If it's an array, recursively search each element with its index
    if (Array.isArray(structure)) {
        for (let i = 0; i < structure.length; i++) {
            const result = deepSearchWithPath(structure[i], predicate, [...path, i]);
            if (result) return result;
        }
    }

    // If it's an object, recursively search its properties with their keys
    if (structure !== null && typeof structure === "object") {
        for (const key in structure) {
            if (Object.prototype.hasOwnProperty.call(structure, key)) {
                const result = deepSearchWithPath(structure[key], predicate, [...path, key]);
                if (result) return result;
            }
        }
    }

    // If no match is found
    return null;
}
export function ensureAcceptableFormatForMathGroupItems(items: (Token|MathGroup|MathJaxOperator)[]|Token|MathGroup|MathJaxOperator): MathGroupItem[] {
    if (!Array.isArray(items)) {
        if (!items.length&&items instanceof MathGroup) {
            items=items.getItems();
        }
        else
            items=[items]
    }
    const formattedItems=items
        .map((item: Token|MathGroup|MathJaxOperator|BasicMathJaxToken) => {
            if (item instanceof Token || item instanceof MathGroup || item instanceof MathJaxOperator) {
                return item;
            }
            if (item instanceof BasicMathJaxToken) {
                if (item.value&&(item.type=== "number"||item.type==="variable")) {
                    return new Token(item.value); 
                }
                throw new Error("Expected item to be a number or variable but received: "+item.value);
            }

            return null;
        })
        .filter((item: null| Token | MathGroup | MathJaxOperator): item is Token | MathGroup | MathJaxOperator => item !== null);
    return formattedItems;
}

function typeCheckMathGroupItems(items: any): items is MathGroupItem[] {
    if(!Array.isArray(items)){
        console.error('items',items)
        throw new Error("Expected items to be an array but received: "+items);
    }
    items.map((item: any) => {
        if(Array.isArray(item)){
            typeCheckMathGroupItems(item);return;
        }
        if(!(item instanceof Token||item instanceof MathGroup||item instanceof MathJaxOperator)){
            console.error('item',item)
            throw new Error("Expected items to be an array of Token, MathGroup, or MathJaxOperator but received: "+items);
        }
    });
    return true;
}
function shouldAddPlus(group1?: any,group2?: any){
    if(!group1||!group2)return '';

    return '+';
}

function canCombine(math: MathGroup,operator: MathJaxOperator){

}
export class MathJaxOperator{
    operator: string;
    groupNum: number=1;
    groups: MathGroup[];
    solution: MathGroup;
    commutative: boolean;
    isOperable: boolean=true;
    constructor(operator?: string,groupNum?: number,groups?: MathGroup[],solution?: MathGroup,isOperable?: boolean){
        if (operator)this.operator=operator;
        if(groupNum)this.groupNum=groupNum;
        if(groups)this.groups=groups;
        if(solution)this.solution=solution;
        if(isOperable)this.isOperable=isOperable;
    }
    testGroups(test: (group: MathGroup) => boolean):boolean[]{
        return this.groups.map(g=> test(g));
    }
    mapVariables(){
        return this.groups.map(group => group.hasVariables())
    }
    static asVariableGroup(occurrencesCount: number,variable: string){
        return new MathJaxOperator('Multiplication',2,[new MathGroup([new Token(occurrencesCount)]),new MathGroup([new Token(variable)])])
    }
    isVariableGroup(): boolean{
        const testLevels=this.testGroups((item: MathGroup): boolean => {return item.singular()})
        const testVar=this.mapVariables()
        const isSingleTrueInTestVar = testVar.filter(Boolean).length === 1;
        return isSingleTrueInTestVar && testLevels.every((t: boolean) => t);
    }

    operatorVariables(): string[] {
        return [...new Set(this.groups
            .map(group => group.groupVariables())
            .flat()
        )];
    }
    
    getVariableGroup(){
        if(!this.isVariableGroup) return null;

        const occurrencesCount=this.groups
        .map(g=> g.getOperableValue())
        .filter((t: any) => t!==null)
        .reduce((total: any, item: any) => total + item, 0);

        const variable=this.operatorVariables()[0];
        return {occurrencesCount,variable}
    }
    addToVariableGroup(value: number){
        if(!this.isVariableGroup) return;
        const number = this.groups.find(group => group.singleNumber())
        if(!number) return;
        number.singleTokenSet(value);
    }

    allGroupsAreSimilar(){

    }
    isVar(){}
    isRootLevel(){
        return this.getDeepth().max===0;
    }
    clone() {
        const groups = this.groups.map(group => group.clone());
        const solution = this.solution ? this.solution.clone() : undefined;
        return new MathJaxOperator(this.operator, this.groupNum, groups, solution, this.isOperable);
    }
    getDeepth(){
        let deepths: number[]=[];
        this.groups.forEach(group => {
            deepths.push(group.getDeepth().max)
        });
        return {max: Math.max(...deepths), deepths: deepths}
    }
    setGroup(group: MathGroup,index:number){this.groups[index]=group}
    toStringSolution(){
        return this.toString()+' = '+this.solution.toString();
    }
    getId(){return 'operator:'+this.operator}
    toString(customFormatter?: (check: any,string: string) => any){
        function wrapGroup(group: MathGroup, wrap: BracketType,optional: boolean): string {
            if(optional&&group.singular())return group.toString(customFormatter);
            const groupStr=group.toString(customFormatter)
            switch (wrap) {
                case BracketType.Parentheses:
                    return `(${groupStr})`;
                case BracketType.CurlyBraces:
                    return `{${groupStr}}`;
                default:
                    return groupStr;
            }
        }

        const metadata = searchMathJaxOperators(this.operator);
        if (!metadata) return '';
        if(metadata.associativity.numPositions>2||metadata.associativity.numPositions<1){
            throw new Error(`Invalid number of positions for associativity: ${metadata.associativity.numPositions}`);
        }

        const operator = metadata.latex;
        let index=0;
        let string = '';

        getValuesWithKeysBySide(metadata.associativity.positions,true).forEach(item => {
            if (!item) return;
            string += shouldAddPlus(this.groups[index-1],this.groups[index])+wrapGroup(this.groups[index], item.bracketType, item.isBracketOptional);
            index++;
        });

        string += operator;
        getValuesWithKeysBySide(metadata.associativity.positions,false).forEach(item => {
            if (!item) return;
            string += shouldAddPlus(this.groups[index],this.groups[index+1])+wrapGroup(this.groups[index], item.bracketType, item.isBracketOptional);
            index++;
        });

        if (customFormatter) 
            return customFormatter(this,string)
        return string.trim();
    }
}

export type MathGroupItem=Token|MathJaxOperator
export class MathGroup {
    private items: MathGroupItem[] = [];
    //overview: MathOverview
    
    constructor(items?: MathGroupItem[]) {
        if(items)this.setItems(items);
    }
    getItems(): MathGroupItem[] {return this.items;}
    setItem(item: MathGroupItem,index:number){
        this.items[index]=item;
        this.updateOverview()
    }
    setItems(items: MathGroupItem[]) {
        typeCheckMathGroupItems(this.items)
        this.items = items;
        this.updateOverview()    
    }
    combineSimilarValues(){
        const overview=new MathOverview()
        overview.defineOverviewSeparateIntoIndividuals(this.items)
        let newItems: MathGroupItem[] = [];
        newItems.push(overview.)
        if (overview.getNumber()) {
            newItems.push(new Token(overview.getNumber()));
        }
        for (const [key, value] of overview.getVariables().entries()) {
            if (value.count > 1) {
                newItems.push(MathJaxOperator.asVariableGroup(value.count, key));
            }
            else {
                newItems.push(new Token(key));
            }
        }
        this.items = newItems;

    }
    groupVariables(): string[] {
        const variables: string[] = [];
        this.items.forEach((item: MathGroupItem) => {
            if (item instanceof Token && item.isVar()) {
                const key = item.getStringValue();
                if (!variables.contains(key)) {
                    variables.push(key);
                }
            }
        });
        return variables;
    }

    updateOverview(){/*
        this.overview=new MathOverview()
        this.overview.defineOverviewseparateIntoIndividuals(this.items)*/
    }
    singleTokenSet(value: number){
        const token=this.items[0] as Token;
        if(this.singulToken()){
            token.setValue(value);
        }
    }
    clone(): MathGroup {
        return new MathGroup(this.items.map(item=>item.clone()));
    }

    hasOperator(): this is { items: Array<Token | MathGroup> } {return this.items.some((item) => item instanceof MathJaxOperator);}
    doesntHaveOperator():  this is { items: Array<Token | MathGroup> } {return !this.hasOperator();}
    deepHasOperator(){
        const map=this.items.map((item): boolean => {
            if(item instanceof MathGroup){
                return item.deepHasOperator()
            }
            if(item instanceof MathJaxOperator)return true
            return false
        });
        return map.some((t: boolean)=>t)
    }
    singleNumber(){return this.singular()&&this.numberOnly()}
    numberOnly(): boolean {return this.items.every(t => (t instanceof Token&&!t.isVar()));}
    hasVariables(): boolean {return this.items.some(t => t instanceof Token&&t.isVar());}

    singular():boolean {return this.items.length === 1 && this.items[0] !== undefined;}
    singulToken(): this is { items: [Token] } {return this.singular() && this.items[0] instanceof Token;}
    isRootLevel(){return this.items.every((item) => item instanceof Token);}
    extremeSimplifyAndGroup(){
        this.tryRemoveUnnecessaryNested();
        this.combiningLikeTerms()
    }

    tryRemoveUnnecessaryNested(): void {
        if (this.singular()) {
            if(this.items[0] instanceof MathGroup){
                this.items = this.items[0].items;
                this.items.forEach(item => {
                    if (item instanceof MathGroup) {
                        item.tryRemoveUnnecessaryNested();
                    }
                });
            }
        }
    }
    getDeepth(){
        let deepths: number[]=[];
        this.items.forEach(item => {
            if(item instanceof Token){
                deepths.push(0);return;
            };
            deepths.push(item.getDeepth().max+1)
        });
        return {max: Math.max(...deepths), deepths: deepths}
    }
    isOperable(){return true}

    getOperableValue(): number | null
    {
        this.tryRemoveUnnecessaryNested();
        this.combiningLikeTerms();
        const items = this.items;
        if (this.numberOnly()) {
            let value=0;
            items.forEach((item: Token) => {
                value += item.getNumberValue();
            });
            return value;
        }
        return null;
    }
    getId(){
        return 'MathGroup'
    }
    combiningLikeTerms() {/*
        const overview=this.levelMap()
        const combinedItems = [];
        for (const [key, value] of overview.entries()) {
            if (key.includes("operator")) {
                combinedItems.push(...value.items);
                continue;
            }
            const sum = value.items.reduce((total: any, item: Token) => total + (item.getValue?item.getValue(): 0), 0);
    
            const token = new Token(sum, value.variable??undefined);
            combinedItems.push(token);
        }
        this.items = combinedItems;*/
    }

    toString(customFormatter?: (check: any,string: string) => any){
        let string='';
        if(!Array.isArray(this.items)){
            throw new Error("Expected items to be an array but received: "+this.items);
        }
        this.items.forEach((item, index) => {
            string+=shouldAddPlus(this.items[index-1],item)
            if (item instanceof MathGroup && !item.singular()) {
                string += `(${item.toString(customFormatter)})`;
            }  else {
                string += item.toString(customFormatter);
            } if (customFormatter) {
                string = customFormatter(item,string);
            }
        });
        return string;
    }
}


class MathOverview {
    private variables: Map<string, any>;
    private operators: Map<string, any>;
    private number: number;
    private mathGroups: MathGroup[]=[];
    getNumber(): number{return this.number;}
    getVariables(): Map<string, any>{return this.variables;}
    constructor(variables?: Map<string, any>,operators?: Map<string, any>,number?: number,mathGroups?: MathGroup[]){
        if(variables)this.variables=variables;
        if(operators)this.operators=operators;
        if(number)this.number=number;
        if(mathGroups)this.mathGroups=mathGroups;
    }
    defineOverviewSeparateIntoIndividuals(items: MathGroupItem[]) {
        this.variables=new Map();
        this.operators=new Map();

        items.forEach(item => {
            switch (true) {
                case item instanceof Token&&item.isVar():
                    this.updateVariablesMap(item.getStringValue());
                    break;
                case item instanceof Token&&!item.isVar():
                    this.updateMumber(item.getNumberValue());
                    break;
                case item instanceof MathJaxOperator:
                    this.updateOperatorsMap(item);
                    break;
                case item instanceof MathGroup:
                    this.mathGroups.push(item)
                    break;
                default:
                    throw new Error("Unknown category in MathOverview separateIntoIndividuals");
            }
        });

    }
    updateMumber(number: number){ this.number=this.number?this.number+number:number;}
    updateVariablesMap(key: string){
        this.variables ??= new Map<string, { count: number; items: any[] }>();
        if(!this.variables.has(key)){this.variables.set(key,{count: 0, items: []})}
        this.variables.get(key).count++;
    }
    updateOperatorsMap(operator: MathJaxOperator){
        const variableGroup=operator.getVariableGroup()
        if(variableGroup){
            Array.from({ length: variableGroup.occurrencesCount }).forEach(() => {
                this.updateVariablesMap(variableGroup.variable);
            })
            return
        }
        const key=operator.operator;
        if(!this.operators) this.operators=new Map();
        if(!this.operators.has(key)){this.operators.set(key,{count: 0, items: []})}
        this.operators.get(key).count++;
    }

    hasVar(){return this.variables&&this.variables.size>0}
    hasOp(){return this.operators&&this.operators.size>0}
    hasGroup(){return this.mathGroups.length>0}
    onlyNumeric(){
        return this.number&&!this.hasVar()&&!this.hasOp()&&!this.hasGroup()
    }
    deepNumeric(){

    }
    explorAllLevels(){
        
    }
}






export class Token{
    private value: number|string;
    constructor(value:number|string){
        this.value=value;
    }
    getNumberValue():number{return (this.value as number)}
    getStringValue():string{return (this.value as string)}
    getValue(){return this.value}
    setValue(value: number|string){this.value=value;}
    isVar() {return typeof this.value === 'string';}
    
    toString(customFormatter?: (check: any,string: string) => any){
        let string=''
        if(!this.isVar()&&this.getNumberValue()<0)
            string+='-';
        string+=this.value;
        if(customFormatter){
            return customFormatter(this,string)
        }
        return string;
    }
    clone(){return new Token(this.value)}
}



export class BasicMathJaxTokens{
    tokens: Array<BasicMathJaxToken|Paren>=[];
    
    constructor(tokens?: Array<BasicMathJaxToken|Paren>){
        this.tokens=tokens||[];
    }
    addInput(math: string){
        this.tokenize(math);
    }
    tokenize(math: string){
        const operators=arrToRegexString(getAllMathJaxReferences())
        for (let i = 0; i < math.length; i++) {
            let match = math.slice(i).match(regExp('^' + operators));
            if (!!match) {
                const type=/[\(\)]/.test(match[0])?'paren':'operator'
                this.tokens.push(new  BasicMathJaxToken(type,match[0]));
                i+=match[0].length-1;
                continue;
            }
            match = math.slice(i).match(/^([0-9.]+)/);//([a-zA-Z]?)/);
            if (!!match)
            {   i+=match[0].length-1
                this.tokens.push(new BasicMathJaxToken('number',parseFloat(match[0])));
                continue;
            }
            match=math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/)
            if (!!match) {
                i+=match[0].length-1
                this.tokens.push(new BasicMathJaxToken("variable",match[0]))
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
        this.tokens=idParentheses(this.tokens);
        this.implicitMultiplicationMap()
        
        const parenMap=this.implicitMultiplicationMap()

        parenMap.sort((a: number, b: number) => b - a)
        .forEach((value: any) => {
            this.tokens.splice(value, 0, new  BasicMathJaxToken('operator','*'));
        });

        this.validatePlusMinus()
    }
    implicitMultiplicationMap() {
        const testDoubleRight = (index: number) => {
            if (!this.validateIndex(index)||!(this.tokens[index] instanceof Paren)) return false;
            const idx = findParenIndex(index,this.tokens)?.open;
    
            if (idx == null || !isOpenParen(this.tokens[index + 1])) return false;
    
            const prevToken = this.tokens[idx - 1];
    
            return (
                idx > 0 &&
                prevToken instanceof BasicMathJaxToken &&
                !getOperatorsByAssociativity([1, 2]).includes(prevToken.value?.toString() || '')
            );
        };
    
        const check = (index: number) => {
            if (!this.validateIndex(index)) return false;
            const token = this.tokens[index];
            return token instanceof BasicMathJaxToken && token.isValueToken();
        };
        const checkImplicitMultiplication=(token: any)=>{
            return token instanceof BasicMathJaxToken&&typeof token.value==='string'&&hasImplicitMultiplication(token.value)
        }
        const isVar=(token: any)=>{return token instanceof BasicMathJaxToken &&token.type==='variable'}
        const precedesVariable = (tokens: any,index: number) => {
            return index>0&&isVar(tokens[index])
        };
        
        const followsVariable = (tokens: any,index: number) => {
            return index<tokens.length-1&&isVar(tokens[index])
        };
        
        
        const map = this.tokens
            .map((token, index) => {
                if (isOpenParen(token)|| checkImplicitMultiplication(token)||precedesVariable(this.tokens,index)) {
                    return check(index - 1) ? index : null;
                } else if (isClosedParen(token)||followsVariable(this.tokens,index)) {
                    return check(index + 1) || testDoubleRight(index) ? index + 1 : null;
                }
                return null;
            })
            .filter((item) => item !== null);
        console.log(this.tokens,map)
        return map;
    }
    

    validatePlusMinus(){
        // Pluses are separators.Therefore, they do not need to be here As the expression is token[]
        //Minuses on the other hand.can either be a separator. Or a negative sign
        const plusMap=this.tokens.map((token: BasicMathJaxToken, index: any) => token.value === 'Addition'?index : null).filter((index: number | null) => index !== null)
        plusMap.reverse().forEach((index: number) => {
            this.tokens.splice(index,1)
        });
        const minusMap=this.tokens.map((token: BasicMathJaxToken, index: any) => token.value === 'Subtraction'?index : null).filter((index: number | null) => index !== null)
        
        minusMap.reverse().forEach((index: number) => {
            const nextToken = this.tokens[index + 1];
            if (nextToken instanceof BasicMathJaxToken && typeof nextToken.value === 'number') {
              nextToken.value *= -1;
              this.tokens.splice(index, 1);
            }
          });
    }
    validateIndex(index: number,margin?: number){
        margin=margin||0;
        return index>=0+margin&&index<this.tokens.length-margin;
    }
    clone(): BasicMathJaxTokens {
        return new BasicMathJaxTokens(this.tokens.map(token => token.clone()));
    }
    /*
    
    implicitMultiplicationMap(){
        const testDoubleRight = (index: number) => {
            if (!this.validateIndex(index)) return false;
            const idx=findParenIndex(null,index).open;
            return isOpenParen(this.tokens[index+1])&&(idx===0||!getOperatorsByAssociativity('doubleRight').includes(this.tokens[idx-1]?.value));
            
        };
        const check = (index: number) => {
            if (!(Token instanceof BasicMathJaxToken)||!this.validateIndex(index)) return false;
            return this.tokens[index].isValueToken();
        };

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
        return map;
    }

    
    mapParenIndexes(){
        return this.tokens
        .map((token: any, index: any) => token.value === "(" ? findParenIndex(undefined, index) : null)
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
    
    
    findSimilarSuccessor(tokens){
        return this.tokens.findIndex((token, index) =>
                ((tokens[index + 2]?.type !== "operator"&&tokens[index -1]?.type !== "operator")
                &&(this.tokenCompare("type",this.valueTokens(), token, tokens[index + 1]))
        ));
     }
    
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
    */
}







export class BasicMathJaxToken{
    type: string;
    value?: string|number;

    constructor(type:string ,value: string | number | undefined){
        this.type=type;
        this.value=value;
        this.insurProperFormatting()
    }
    insurProperFormatting(){
        if (!this.isValueToken()&&typeof this.value==="string"){
            this.value=searchAllMathJaxOperatorsAndSymbols(this.value)?.name
        }
    }

    getLatexSymbol(){return typeof this.value==='string'?searchMathJaxOperators(this.value)?.latex:undefined}

    getfullType(){
        return this.type
    }
    clone(){
        return new BasicMathJaxToken(this.type, this.value)
    }


    isString(){return this.type==='paren'||this.type==='operator'}

    isValueToken(){return this.type==='variable'||this.type==='number'}

    toStringLatex(){
        let string=''
        if (this.isString())
            string+=this.getLatexSymbol()
        if (this.type==='number') string+=this.value;
        return string
    }
    affectedOperatorRange(direction: string){
        if(this.type!=='operator'||this.value==='Equals')
            return false
        if(typeof this.value==='string'&&direction==='left'&&!isOperatorWithAssociativity(this.value, [-1, 1],true))
            return false
        return true
    }
}