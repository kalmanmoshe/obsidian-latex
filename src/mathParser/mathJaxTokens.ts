
import { quad,calculateBinom,roundBySettings ,degreesToRadians,radiansToDegrees, calculateFactorial} from "./mathUtilities";
import { expandExpression,curlyBracketsRegex } from "../imVeryLazy";
import { type } from "os";
import { arrToRegexString, Axis, regExp } from "../tikzjax/tikzjax";
import { Associativity, BracketType, MathJaxOperatorMetadata, OperatorType } from "src/utils/staticData";
import { cp } from "fs";
import { findParenIndex, Paren,idParentheses, isOpenParen, isClosedParen } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators, searchSymbols } from "../utils/dataManager";
import { findConsecutiveSequences, flattenArray, parseOperator, Position } from "./mathEngine";
import { number } from "zod";

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


export class MathJaxOperator{
    operator: string;
    groupNum: number=1;
    groups: MathGroup[];
    solution: MathGroup
    isOperable: boolean=true;
    constructor(operator?: string,groupNum?: number,groups?: MathGroup[],solution?: MathGroup,isOperable?: boolean){
        if (operator)this.operator=operator;
        if(groupNum)this.groupNum=groupNum;
        if(groups)this.groups=groups;
        if(solution)this.solution=solution;
        if(isOperable)this.isOperable=isOperable;
    }
    clone() {
        const groups = this.groups.map(group => group.clone());
        const solution = this.solution ? this.solution.clone() : undefined;
        return new MathJaxOperator(this.operator, this.groupNum, groups, solution, this.isOperable);
    }

    setGroup(group: MathGroup,index:number){this.groups[index]=group}
    toStringSolution(){
        return this.toString()+' = '+this.solution.toString();
    }
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
            string += wrapGroup(this.groups[index], item.bracketType, item.isBracketOptional);
            index++;
        });

        string += operator;
        getValuesWithKeysBySide(metadata.associativity.positions,false).forEach(item => {
            if (!item) return;
            string += wrapGroup(this.groups[index], item.bracketType, item.isBracketOptional);
            index++;
        });

        if (customFormatter) 
            return customFormatter(this,string)
        return string.trim();
    }
}


export function ensureAcceptableFormatForMathGroupItems(items: any): MathGroupItems {
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
                if (typeof item.value === "number") {
                    return new Token(item.value, item.variable); 
                }
                throw new Error(
                    `ensureAcceptableFormatForMathGroupItems: BasicMathJaxToken must have a numeric value - ${JSON.stringify(item)}`
                );
            }

            return null;
        })
        .filter((item: null| Token | MathGroup | MathJaxOperator): item is Token | MathGroup | MathJaxOperator => item !== null);
    return formattedItems;
}

function typeCheckMathGroupItems(items: any): items is MathGroupItems {
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
export type MathGroupItems=Array<Token|MathGroup|MathJaxOperator>
export class MathGroup {
    private items: MathGroupItems = [];
    
    constructor(items?: MathGroupItems) {
        if(items)this.items=items
        typeCheckMathGroupItems(this.items)
    }
    getItems(): MathGroupItems {return this.items;}
    setItems(items: MathGroupItems) {
        typeCheckMathGroupItems(this.items)
        this.items = items;
    }
    setItem(item: Token|MathGroup|MathJaxOperator,index:number){
        this.items[index]=item
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
    numberOnly(): boolean {return this.items.some(t => (t instanceof Token&&!t.isVar()));}
    hasVariables(): boolean {return this.items.some(t => t instanceof Token&&t.isVar());}

    singular():boolean {return this.items.length === 1 && this.items[0] !== undefined;}
    singulToken(): this is { items: [Token] } {return this.singular() && this.items[0] instanceof Token;}
    isRootLevel(){return this.items.every((item) => item instanceof Token);}

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
    isOperable(){return true}

    getOperableValue(): Token | null
    {
        this.tryRemoveUnnecessaryNested();
        this.combiningLikeTerms();
        const items = this.items;
        if (this.singular()&&this.doesntHaveOperator()) {
            if (items[0] instanceof MathGroup)
                return items[0].getOperableValue();
            return items[0] instanceof Token ? items[0] : null;
        }
        return null;
    }
    getId(){
        return 'MathGroup'
    }
    removeNested(): boolean {
        if (this.deepHasOperator()) return false;
    
        let items: Token[] = [];
    
        this.items.forEach((item: MathGroup | Token) => {
            if (item instanceof Token) {
                items.push(item);
            }
            if(item instanceof MathGroup){
                item.removeNested();
                items.push(...(item.items as Token[]));
            }
        });

        this.items = items;
    
        return true;
    }
    
    combiningLikeTerms() {
        const overview = new Map();
        this.items.forEach((item: any) => {
            const key = item.getId();
            if (!overview.has(key)) {
                const entry = {
                    count: 0,
                    variable: item.variable,
                    items: []
                };
                overview.set(key, entry);
            }
    
            const entry = overview.get(key);
            entry.count++;
            entry.items.push(item);
        });
        
        const combinedItems = [];
        for (const [key, value] of overview.entries()) {
            if (key.includes("operator")) {
                combinedItems.push(...value.items);
                continue;
            }
            const sum = value.items.reduce((total: any, item: Token) => total + (item.getValue() || 0), 0);
    
            const token = new Token(sum, value.variable);
            combinedItems.push(token);
        }
        this.items = combinedItems;
    }
    toString(customFormatter?: (check: any,string: string) => any){
        let string='';
        if(!Array.isArray(this.items)){
            throw new Error("Expected items to be an array but received: "+this.items);
        }
        this.items.forEach(item => {
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
export class Token{
    private value: number;
    private variable?: string;
    constructor(value:number ,variable?: string){
        this.value=value;
        this.variable=variable;
    }
    isIsolatedVariable(){return this.variable&&this.value===1}

    isVar() {return this.variable!==undefined}
    getValue(){return this.value}
    getVariable(){return this.variable}
    setValue(value: number){
        this.value=value;
        if(this.value===0){
            this.variable=undefined
        }
    }
    getId(){
        return this.variable?`variable:${this.variable}`:'number'
    }
    toString(customFormatter?: (check: any,string: string) => any){
        let string=''
        if(this.value<0)
            string+='-';
        if(!this.isIsolatedVariable()){
            string+=this.value
        }
        string+=this.variable??''
        if(customFormatter){
            return customFormatter(this,string)
        }
        return string;
    }
    clone(){return new Token(this.value,this.variable)}
}



export class BasicMathJaxTokens{
    tokens: Array<BasicMathJaxToken|Paren>=[];
    
    constructor(math: string){
        this.tokenize(math);
    }
    tokenize(math: string){
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
        this.tokens=idParentheses(this.tokens);
        this.implicitMultiplicationMap()
        
        const parenMap=this.implicitMultiplicationMap()

        parenMap.sort((a: number, b: number) => b - a)
        .forEach((value: any) => {
            this.tokens.splice(value, 0, new  BasicMathJaxToken('*'));
        });

        this.validatePlusMinus()
    }
    implicitMultiplicationMap() {
        const testDoubleRight = (index: number) => {
            if (!this.validateIndex(index)) return false;
    
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
        const precedesVariable = () => {
            // Logic for handling the 'precedes' scenario
        };
        
        const followsVariable = () => {
            // Logic for handling the 'follows' scenario
        };
        
    
        const map = this.tokens
            .map((token, index) => {
                if (isOpenParen(token)|| checkImplicitMultiplication(token)) {
                    return check(index - 1) ? index : null;
                } else if (isClosedParen(token)) {
                    return check(index + 1) || testDoubleRight(index) ? index + 1 : null;
                }
                return null;
            })
            .filter((item) => item !== null);
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
    variable?: string;

    constructor(value: string | number | undefined,variable?: any){
        this.value=value;
        this.variable=variable;
        this.setType();
        this.insurProperFormatting()
    }
    insurProperFormatting(){
        if (typeof this.value==='string'){
            this.value=searchAllMathJaxOperatorsAndSymbols(this.value)?.name
        }
    }

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
    clone(){
        return new BasicMathJaxToken(this.value,this.variable)
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
        if(typeof this.value==='string'&&direction==='left'&&!isOperatorWithAssociativity(this.value, [-1, 1],true))
            return false
        return true
    }
    toStringVariable(){
        return (this.value&&this?.value!==1?this.value:'')+(this.variable||'');
    }
}