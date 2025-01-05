
import { quad,calculateBinom,roundBySettings ,degreesToRadians,radiansToDegrees, calculateFactorial} from "./mathUtilities";
import { expandExpression,curlyBracketsRegex } from "./imVeryLazy";
import { arrToRegexString, Axis, regExp } from "../tikzjax/tikzjax";
import { Associativity, BracketType, MathJaxOperatorMetadata, mathJaxOperatorsMetadata, OperatorType } from "src/utils/staticData";

import { findParenIndex, Paren,idParentheses, isOpenParen, isClosedParen } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators, searchSymbols } from "../utils/dataManager";

import { parseOperator } from "./mathEngine";

function wrapGroup(group: string, wrap: BracketType): string {
    switch (wrap) {
        case BracketType.Parentheses:
            return `(${group})`;
        case BracketType.CurlyBraces:
            return `{${group}}`;
        default:
            return group;
    }
}

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
type formattableForMathGroup=MathGroupItem|MathGroup|BasicMathJaxToken
export function ensureAcceptableFormatForMathGroupItems(items: formattableForMathGroup|formattableForMathGroup[]): MathGroupItem[] {
    if (!Array.isArray(items)) {
        items = [items];
    }

    const formattedItems = items
        .reduce((acc: MathGroupItem[], item: Token | MathGroup | MathJaxOperator | BasicMathJaxToken) => {
            if (item instanceof MathGroup) {
                return acc.concat(ensureAcceptableFormatForMathGroupItems(item.getItems()));
            }

            if (item instanceof Token || item instanceof MathJaxOperator) {
                acc.push(item);
                return acc;
            }

            if (item instanceof BasicMathJaxToken) {
                if (item.value && (item.type === "number" || item.type === "variable")) {
                    acc.push(new Token(item.value));
                    return acc;
                }
                throw new Error(
                    `Expected item to be a number or variable but received: ${item.value}`
                );
            }
            return acc;
        }, [])

    return formattedItems;
}
function shouldAddPlus(group1?: any,group2?: any){
    if(!group1||!group2)return '';

    return '+';
}

function canCombine(math: MathGroup,operator: MathJaxOperator){

}
export class MathJaxOperator {
    operator: string;
    groupNum: number = 1;
    groups: MathGroup[];
    solution: MathGroup;
    commutative: boolean;
    isOperable: boolean = true;

    constructor(operator?: string, groupNum?: number, groups?: MathGroup[], solution?: MathGroup, isOperable?: boolean) {
        if (operator) this.operator = operator;
        if (groupNum) this.groupNum = groupNum;
        if (groups) this.groups = groups;
        if (solution) this.solution = solution;
        if (isOperable !== undefined) this.isOperable = isOperable;
    }
    static create(operator?: string, groupNum?: number, groups?: MathGroup[], solution?: MathGroup, isOperable?: boolean): MathJaxOperator {
        if (operator === "Multiplication") {
            return new MultiplicationOperator(groups, solution);
        }
        return new MathJaxOperator(operator, groupNum, groups, solution, isOperable);
    }
    testGroups(test: (group: MathGroup) => boolean): boolean[] {
        return this.groups.map(test);
    }

    mapVariables(): boolean[] {
        return this.groups.map(group => group.hasVariables());
    }

    operatorVariables(): string[] {
        return [...new Set(this.groups.map(group => group.groupVariables()).flat())];
    }

    clone(): MathJaxOperator {
        const groups = this.groups.map(group => group.clone());
        const solution = this.solution ? this.solution.clone() : undefined;
        return MathJaxOperator.create(this.operator, this.groupNum, groups, solution, this.isOperable);
    }

    toStringSolution(): string {
        return this.toString() + ' = ' + this.solution?.toString();
    }

    equals(item: MathGroupItem): boolean {
        return item instanceof MathJaxOperator &&
            this.operator === item.operator &&
            this.groups.length === item.groups.length &&
            this.groups.every((t, index) => t.equals(item.groups[index]));
    }
    getOccurrenceGroup(): { occurrencesCount: number; occurrencOf: MathGroup[] }|null  { return null; }  
    isOccurrenceGroupMatch(testItem: MathJaxOperator | Token): boolean {return false;}
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
    parseMathjaxOperator() {
        parseOperator(this);
    }
}


export class MultiplicationOperator extends MathJaxOperator {
    constructor(groups?: MathGroup[], solution?: MathGroup) {
        super("Multiplication", 2, groups, solution, true);
        this.commutative = true;
        this.removeMultiplicationDepths();
    }
    removeMultiplicationDepths(){
        this.groups.forEach((group: MathGroup) => {
            if(group.singular()&&group.getItems()[0] instanceof MultiplicationOperator){
                const items=(group.getItems()[0] as MultiplicationOperator).groups;
                this.groups.splice(this.groups.indexOf(group),1,...items)
            }
        });
    }

    static asOccurrenceGroup(occurrencesCount: number,occurrencOf: string|Token|MathGroup): MultiplicationOperator {
        occurrencOf=typeof occurrencOf==="string"?
            new MathGroup([new Token(occurrencOf)]):occurrencOf instanceof Token?
                new MathGroup([occurrencOf]):occurrencOf;

        return new MultiplicationOperator([new MathGroup([new Token(occurrencesCount)]),occurrencOf])
    }
    
    override getOccurrenceGroup(): { occurrencesCount: number; occurrencOf: MathGroup[] } {
        const result = this.groups.reduce(
            (acc: { totalNum: number; arr: MathGroup[] }, item: MathGroup) => {
                if (item.getOperableValue()) {
                    acc.totalNum += item.getOperableValue()!;
                } else {
                    acc.arr.push(item);
                }
                return acc;
            },
            { totalNum: 0, arr: [] }
        );
        return { occurrencesCount: result.totalNum, occurrencOf: result.arr };
    }

    addToOccurrenceGroup(value: number): void {
        const numberGroup = this.groups.find(group => group.singleNumber());
        if (numberGroup) {
            numberGroup.singleTokenSet(value, true);
        } else {
            this.groups.push(new MathGroup([new Token(1 + value)]));
        }
    }

    override isOccurrenceGroupMatch(testItem: MathJaxOperator | Token): boolean {
        const isValidItem = testItem instanceof Token || testItem instanceof MultiplicationOperator;
        if (!isValidItem) {
            return false;
        }
    
        const currentGroup = this.getOccurrenceGroup();
        if (!currentGroup) return false;
    
        const currentGroupItems = currentGroup.occurrencOf.flatMap(group => group.getItems());
    
        if (testItem instanceof Token) {
            const isSingleItemMatch = currentGroupItems.length === 1 && currentGroupItems[0].equals(testItem);
            if (isSingleItemMatch) {
                this.addToOccurrenceGroup(1);
            }
            return isSingleItemMatch;
        }
        const testItemGroup = testItem.getOccurrenceGroup();
        if (!testItemGroup) return false;
    
        const testItemGroupItems = testItemGroup.occurrencOf;
    
        const areGroupsMatching =currentGroupItems.length === testItemGroupItems.length &&
            currentGroup.occurrencOf.every((currentSubGroup: MathGroup) =>
                testItemGroupItems.some((testSubGroup: MathGroup) => 
                    currentSubGroup.isOccurrenceGroupMatch(testSubGroup)
                )
            );
        if (areGroupsMatching) { 
            console.log(testItemGroup.occurrencesCount)
            this.addToOccurrenceGroup(testItemGroup.occurrencesCount);
            return true;
        }
    
        return false;
    }
    
    

    toString(customFormatter?: (check: any,string: string) => any){ 
        const operator = '\\cdot ';
        let string = '';
        const toAddCdot=(thisGroup: MathGroup,nextGroup?:MathGroup)=>{
            if(!nextGroup)return false;
            if((thisGroup.singleNumber()&&nextGroup.isSingleVar())||(thisGroup.isSingleVar()&&nextGroup.singleNumber()))
                return false;

            return true;
        }
        const reorderedGroups=this.groups.sort((a, b) => {
            if (a.singleNumber() && !b.singleNumber()) return -1;
            if (!a.singleNumber() && b.singleNumber()) return 1;
        
            if (a.singular() && !b.singular()) return -1;
            if (!a.singular() && b.singular()) return 1;
        
            return 0;
        });
        reorderedGroups.forEach((group,index) => {
            string += wrapGroup(group.toString(), group.singular()?BracketType.None:BracketType.Parentheses);
            if (toAddCdot(group,reorderedGroups[index+1]))
                string += operator;
        });

        if (customFormatter) 
            return customFormatter(this,string)
        return string.trim();
    }

    /*
    this.groups = [[1, 2, 3],[4, 5, 6],[7, 8, 9]]
    Expected Output:
    [
        1*4, 1*5, 1*6, 1*7, 1*8, 1*9,
        2*4, 2*5, 2*6, 2*7, 2*8, 2*9,
        3*4, 3*5, 3*6, 3*7, 3*8, 3*9,
        4*7, 4*8, 4*9,
        5*7, 5*8, 5*9,
        6*7, 6*8, 6*9
    ]  
    */

    parseMathjaxOperator(): void {

        const mathGroupItems: MathGroupItem[] = [];
        for (let i = 0; i < this.groups.length; i++) {
            const groupA = this.groups[i].getItems();

            // Determine which groups to pair with
            for (let j = i + 1; j < this.groups.length; j++) {
                const groupB = this.groups[j].getItems();

                // Generate pairwise products
                for (let a of groupA) {
                    for (let b of groupB) {
                        console.log(this.parse(a, b))
                        mathGroupItems.push(this.parse(a, b));
                    }
                }
            }
        }
        this.solution = new MathGroup(mathGroupItems);
    }
    

    parse(group1: Token|MathJaxOperator,group2: Token|MathJaxOperator):MathGroupItem{
        // return number token
        if(group1 instanceof Token&&group2 instanceof Token&&!group1.isVar()&&!group2.isVar()){
            return new Token(group1.getNumberValue()*group2.getNumberValue())
        }
        
        const newArr= [new MathGroup([group1.clone()]),new MathGroup([group2.clone()])])
        //MathJaxOperator.create('Multiplication',2,

        newOp.groups.forEach((group: MathGroup, index: number) => {
            newOp.groups = newOp.groups.filter((otherGroup: MathGroup, otherIndex: number) => {
                if (index === otherIndex) return true;
                const isMatch = group.isPowGroupMatch(otherGroup);
                return !isMatch;
            }); 
        });

        return newOp
    }
}
function trigonometricIdentities(){

}

export type MathGroupItem=Token|MathJaxOperator

export class MathGroup {
    private items: MathGroupItem[] = [];
    //overview: MathOverview
    
    constructor(items?: formattableForMathGroup|formattableForMathGroup[]) {
        if(items)this.setItems(items);
    }
    getItems(): MathGroupItem[] {return this.items;}
    setItem(item: MathGroupItem,index:number){
        this.items[index]=item;
        this.updateOverview()
    }
    replaceItemCell(item: MathGroupItem|MathGroup,index:number){
        this.items.splice(index,1,...ensureAcceptableFormatForMathGroupItems(item))
    }
    setItems(items: formattableForMathGroup|formattableForMathGroup[]) {
        this.items = ensureAcceptableFormatForMathGroupItems(items);
        this.updateOverview()    
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
    singleTokenSet(value: number,toAdd?: boolean){
        const token=this.items[0] as Token;
        const newValue=toAdd?value+token.getNumberValue():value;
        if(this.singuleToken()){
            token.setValue(newValue)
        }
    }
    clone(): MathGroup {
        return new MathGroup(this.items.map(item=>item.clone()));
    }

    hasOperator(): this is { items: Array<Token | MathGroup> } {return this.items.some((item) => item instanceof MathJaxOperator);}
    doesntHaveOperator():  this is { items: Array<Token | MathGroup> } {return !this.hasOperator();}
    singleNumber(){return this.singular()&&this.numberOnly()}
    numberOnly(): boolean {return this.items.every(t => (t instanceof Token&&!t.isVar()));}
    hasVariables(): boolean {return this.items.some(t => t instanceof Token&&t.isVar());}

    singular():boolean {return this.items.length === 1 && this.items[0] !== undefined;}
    singuleToken(): this is { items: [Token] } {return this.singular() && this.items[0] instanceof Token;}
    isOperable(){return true}

    getOperableValue(): number | null
    {
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
    isSingleVar(){
        const token=this.items[0]as Token
        return this.singuleToken()&&token.isVar()
    }
    getSingleVar(){
        if(!this.isSingleVar())return null;
        return (this.items[0]as Token).getStringValue();
    }

    isPowGroupMatch(group: MathGroup):boolean{
        if(this.items.length!==1)return false

        if(this.isSingleVar()&&group.isSingleVar()&&this.equals(group)){
            this.items=[MathJaxOperator.create("Power",2,[new MathGroup(this.items[0]),new MathGroup(new Token(2))])]
            return true
        }
        return this.equals(group)
    }

    isOccurrenceGroupMatch(item: Token|MathJaxOperator|MathGroup){
        //Placeholder for now
        return this.equals(item)
    }

    equals(item: Token|MathJaxOperator|MathGroup){
        if(item instanceof Token){
            return this.items.length===1&&this.items[0] instanceof Token&&this.items[0].equals(item);
        }
        if(item instanceof MathJaxOperator){
            return this.items.length===1&&this.items[0] instanceof MathJaxOperator&&this.items[0].equals(item)
        }
        if(item instanceof MathGroup){
            return this.items.length===item.items.length&&this.items.every((t: MathGroupItem)=>{
                return item.items.some((i)=>t.equals(i))
            })
        }
        return false;
    }

    getId(){
        return 'MathGroup'
    }
    combiningLikeTerms() {
        const overview=new MathOverview()
        overview.defineOverviewSeparateIntoIndividuals(this.items)
        this.setItems(overview.reconstructAsMathGroupItems())
        console.log("befor",this.items,this.toString())

        this.items.forEach((item: MathGroupItem, index: number) => {
            if (item instanceof MultiplicationOperator) {
                this.items = this.items.filter((otherItem: MathGroupItem, otherIndex: number) => {
                    if (index === otherIndex) return true;
    
                    const isMatch = item.isOccurrenceGroupMatch(otherItem);
                    return !isMatch;
                });
            }
        });
        console.log("after",this.items,this.toString())
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
    getNumber(): number{return this.number;}
    getVariables(): Map<string, any>{return this.variables;}
    getOperators(): Map<string, any>{return this.operators;}
    constructor(variables?: Map<string, any>,operators?: Map<string, any>,number?: number){
        if(variables)this.variables=variables;
        if(operators)this.operators=operators;
        if(number)this.number=number;
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
                default:
                    throw new Error("Unknown category in MathOverview separateIntoIndividuals");
            }
        });

    }
    updateMumber(number: number){ this.number=this.number?this.number+number:number;}
    updateVariablesMap(key: string){
        this.variables ??= new Map<string, { count: number; items: any[] }>();
        if(!this.variables.has(key)){this.variables.set(key,{count: 0})}
        this.variables.get(key).count++;
    }
    updateOperatorsMap(operator: MathJaxOperator){
        const key=operator.operator;
        if(!this.operators) this.operators=new Map();
        if(!this.operators.has(key)){this.operators.set(key,{count: 0, items: []})}
        const entry = this.operators.get(key)!;
        entry.count += 1;
        entry.items.push(operator);
    }

    hasVar(){return this.variables&&this.variables.size>0}
    hasOp(){return this.operators&&this.operators.size>0}
    onlyNumeric(){
        return this.number&&!this.hasVar()&&!this.hasOp()
    }
    reconstructAsMathGroupItems(){
        const items: MathGroupItem[]=[];
        if(this.number)items.push(new Token(this.number));
        this.variables.forEach((value, key) => {
            if(value.count===1){
                items.push(new Token(key))
            }
            else if(value.count>1){
                items.push(MultiplicationOperator.asOccurrenceGroup(value.count,key))
            }
        });
        if(this.operators){
            items.push(...Array.from(this.operators.values()).flatMap((operator: any) => operator.items))
        }
        return items;
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
    equals(item: MathGroupItem) {
        return item instanceof Token&&this.value === item.value;
    }
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
            return !(
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