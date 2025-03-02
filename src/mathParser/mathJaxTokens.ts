
import { arrToRegexString, Axis, regExp } from "../tikzjax/tikzjax";
import { BracketType } from "../staticData/encasings";
import { findParenIndex, Paren,idParentheses, parenState,  } from "../ParenUtensils";
import { associativitymetadataByType, getAllMathJaxReferences, getMathJaxOperatorsByPriority, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, mahtjaxAssociativitymetadata, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators, searchSymbols } from "../staticData/dataManager";

import { parseOperator } from "./mathEngine";
import { BasicMathJaxToken } from "src/mathParser/basicToken";
import { AssociativityFormatType, PositionValue } from "src/staticData/mathParserStaticData";

function groupBracketType(group: MathGroup,pos:PositionValue={ bracketType: BracketType.Parentheses, isBracketOptional: true },){
    if(!pos.isBracketOptional)return pos.bracketType
    return group.singular()?BracketType.None:pos?.bracketType
}

function wrapGroup(group: string, wrap: BracketType): string {
    console.log("wrapGroup",group,wrap)
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
                if (item.getValue() && (item.getType() === "number" || item.getType() === "variable")) {
                    acc.push(new Token(item.getValue()));
                    return acc;
                }
                console.warn("items,acc",items,acc)
                throw new Error(
                    `Expected item to be a number or variable but received: ${item.getValue()}`
                );
            }
            return acc;
        }, [])

    return formattedItems;
}
function ensureAcceptableFormatForMathOperator(groups: (MathGroupItem|MathGroup)[]):MathGroup[]{
    const formattedGroups = groups
        .reduce((acc: MathGroup[], item: Token | MathGroup | MathJaxOperator ) => {
            if (item instanceof MathGroup) {
                acc.push(item);
            }
            if (item instanceof Token || item instanceof MathJaxOperator) {
                acc.push(new MathGroup(item));
            }
            return acc;
        }, [])

    return formattedGroups;
}
/**
 * Determines whether to add a plus sign based on the provided groups and distance from an operator.
 * 
 * @param group1 - The first group to compare (optional).
 * @param group2 - The second group to compare (optional).
 * @param distanceFromOperator - The distance from the operator (optional).
 * @returns A plus sign ('+') if the conditions are met, otherwise an empty string ('').
 */
function shouldAddPlus(group1?: any,group2?: any,distanceFromOperator?: number){
    //i removed !distanceFromOperator chack this my cause a bug idk yet
    if(!group1||!group2||distanceFromOperator===-1||distanceFromOperator===1)return '';

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
    toString(formatType: AssociativityFormatType=AssociativityFormatType.MathJax,customFormatter?: (check: any,string: string) => any){
        const metadata = searchMathJaxOperators(this.operator);
        if (!metadata) throw new Error(`No metadata found for operator: ${this.operator}`);
        const associativity = associativitymetadataByType(metadata, formatType);

        let index=0,string = '';
        //in processAssociativityPositions the index is always seems to be 0 for some reason
        ({string,index}=processAssociativityPositions(associativity.positions,string,this.groups,index,true));
        string += (associativity.backslash?'\\':'')+associativity.string;
        ({string,index}=processAssociativityPositions(associativity.positions,string,this.groups,index));

        if (customFormatter)
            return customFormatter(this,string)
        return string.trim();
    }
    parseMathjaxOperator() {
        parseOperator(this);
    }
}

function processAssociativityPositions(positions: Map<number, any>,string: string,groups: MathGroup[],index: number,isLeft=false){
    getValuesWithKeysBySide(positions,isLeft).forEach(item => {
        if (!item) return;
        string += shouldAddPlus(groups[isLeft? index-1 : index],groups[isLeft? index : index + 1],index);
        string += wrapGroup(groups[index].toString(),groupBracketType(groups[index],item));
        index++;
    });
    return { string, index };
}

export class EqualsOperator extends MathJaxOperator{

}
export class DivisionOperator extends MathJaxOperator{

}

export class MultiplicationOperator extends MathJaxOperator {
    constructor(groups?: MathGroup[], solution?: MathGroup) {
        super("Multiplication", 2, groups, solution, true);
        this.commutative = true;
        this.removeMultiplicationDepths();
    }

    removeMultiplicationDepths(){
        while(this.groups.some((g: MathGroup)=> g.singular()&&g.getItems()[0] instanceof MultiplicationOperator)){
            const group=this.groups.find((g: MathGroup)=> g.singular()&&g.getItems()[0] instanceof MultiplicationOperator)
            if(group)
            this.groups.splice(this.groups.indexOf(group),1,...(group.getItems()[0] as MultiplicationOperator).groups)
        }
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
        const areGroupsMatching =currentGroup.occurrencOf.length === testItemGroupItems.length &&
            currentGroup.occurrencOf.every((currentSubGroup: MathGroup) =>
                testItemGroupItems.some((testSubGroup: MathGroup) => 
                    currentSubGroup.isOccurrenceGroupMatch(testSubGroup)
                )
            );

        if (areGroupsMatching) { 
            this.addToOccurrenceGroup(testItemGroup.occurrencesCount);
            return true;
        }
        return true
    }
    
    

    toString(formatType:AssociativityFormatType=AssociativityFormatType.MathJax,customFormatter?: (check: any,string: string) => any){ 
        const operator = '\\cdot ';
        let string = '';
        const toAddCdot=(thisGroup: MathGroup,nextGroup?:MathGroup)=>{
            if(!nextGroup)return false;
            if(nextGroup.isSingleVar()||thisGroup.isSingleVar())
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
        const multArr=this.eliminatGroupsWithMultipleTerms().getItems();
        const name=multArr.map((o: MultiplicationOperator)=> {o.parse();return o.solution})
        this.solution=new MathGroup(name);
        this.solution.combiningLikeTerms();
    }
    eliminatGroupsWithMultipleTerms():MathGroup {
        let operatorsAccumulation: MultiplicationOperator[] = [];
        
        const singleTermGroups = this.groups.filter(group => group.singular());
        const multiTermGroups = this.groups.filter(group => !group.singular());
        
        const singlesMathGroup = singleTermGroups.length !== 0 
            ? [new MathGroup([new MultiplicationOperator(singleTermGroups)])] 
            : [];
        let groups = [...singlesMathGroup, ...multiTermGroups];
    
        while (groups.length > 1) {
            const groupA = groups.shift();
            const groupB = groups.shift();
    
            if (!groupA || !groupB) break;
    
            const groupAItems = groupA.getItems();
            const groupBItems = groupB.getItems();
            operatorsAccumulation = [];
            for (const a of groupAItems) {
                for (const b of groupBItems) {
                    operatorsAccumulation.push(
                        new MultiplicationOperator(ensureAcceptableFormatForMathOperator([a.clone(), b.clone()]))
                    );
                }
            }
    
            groups.unshift(new MathGroup(operatorsAccumulation));
        }
        return groups[0];
    }
    

    parse(){
        const { numbers, other } = this.groups.reduce((result: { numbers: MathGroup[]; other: MathGroup[] }, item: MathGroup) => {
                if (item.singleNumber()) {
                    result.numbers.push(item);
                } else {
                    result.other.push(item);
                }
                return result;
            },
            { numbers: [], other: [] }
        );
        let value=1;
        numbers.forEach(group => {
            value*=(group.getItems()[0]as Token).getNumberValue()
        });
        if(this.groups.length===0)
            throw new Error("");
        if((numbers.length>0&&other.length===0)||value===0){
            this.solution=new MathGroup(new Token(value));return;
        }
        const test=(mainGroup: any, testGroup: any)=>{
            if(mainGroup instanceof MathGroup&&testGroup instanceof MathGroup){
                return mainGroup.isPowGroupMatch(testGroup)
            }
            return false;
        }
        const filtered=filterByTestConst(other,test);
        const arr=[...filtered];
        if(value!==1)
            arr.push(new Token(value));

        if(arr.length>1){
            this.solution=new MathGroup([new MultiplicationOperator(ensureAcceptableFormatForMathOperator(arr))]);
            return;
        }
        this.solution=new MathGroup(arr[0]);
    }
}

function a(groups: MathGroup[]){
    const areAllGroupsSingular=groups.every(g=>g.singular())
    let value=0;
}


function filterByTestConst(
    items: any[],
    test: (mainItem: any, testItem: any) => boolean
): any[] {
    let index = 0;
    while (index < items.length) {
        const mainItem = items[index];
        const originalLength = items.length;

        items = items.filter((otherItem, otherIndex) => {
            if (index === otherIndex) return true; // Keep current item
            const temp=!test(mainItem, otherItem);
            return temp
        });

        // Restart iteration if items were removed
        if (items.length < originalLength) {
            index = 0;
        } else {
            index++;
        }
    }
    return items;
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
    getVariables(): Set<string> {
        const variablesSet = this.items.reduce((acc: Set<string>, item: MathGroupItem) => {
          if (item instanceof Token && item.isVar()) {
            acc.add(item.getStringValue());
          } else if (item instanceof MathGroup) {
            item.getVariables().forEach(variable => acc.add(variable));
          } else if (item instanceof MathJaxOperator) {
            item.groups.forEach(group => {
              group.getVariables().forEach(variable => acc.add(variable));
            });
          }
          return acc;
        }, new Set<string>());
        return variablesSet;
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

    isOccurrenceGroupMatch(other: MathGroup){
        const bothSingular=this.singular()&&other.singular()
        const firstItemMathJaxoOerator=this.items[0] instanceof MathJaxOperator&&other.getItems()[0] instanceof MathJaxOperator
        if(!bothSingular&&!firstItemMathJaxoOerator)return false;
        const a=(this.items[0]as MathJaxOperator).isOccurrenceGroupMatch(other.getItems()[0])
        return true
        
        return this.equals(other)
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
        const overview = new MathOverview();
        overview.defineOverviewSeparateIntoIndividuals(this.items);
        this.setItems(overview.reconstructAsMathGroupItems());
        let index = 0;
        while (index < this.items.length) {
            const item = this.items[index];
            if (item instanceof MultiplicationOperator) {
                const originalLength = this.items.length;
                this.items = this.items.filter((otherItem: MathGroupItem, otherIndex: number) => {
                    if (index === otherIndex) return true;
                    
                    const isMatch = item.isOccurrenceGroupMatch(otherItem);
                    return !isMatch;
                });
                if (this.items.length < originalLength) {
                    index = 0;
                    continue;
                }
            }
    
            index++;
        }
    }

    toString(customFormatter?: (check: any,string: string) => any){
        let string='';
        if(!Array.isArray(this.items)){
            throw new Error("Expected items to be an array but received: "+this.items);
        }
        this.items.forEach((item, index) => {

            string+=shouldAddPlus(this.items[index-1],item,)
            if (item instanceof MathGroup && !item.singular()) {
                string += `(${item.toString(customFormatter)})`;
            }  else {
                string += item.toString(undefined,customFormatter);
            } if (customFormatter) {
                string = customFormatter(item,string);
            }
        });
        return string;
    }

    toStringLatex(customFormatter?: (check: any,string: string) => any){
        let string='';
        if(!Array.isArray(this.items)){
            throw new Error("Expected items to be an array but received: "+this.items);
        }
        this.items.forEach((item, index) => {
            string+=shouldAddPlus(this.items[index-1],item)
            if (item instanceof MathGroup && !item.singular()) {
                string += `(${item.toString(customFormatter)})`;
            }
            else if(item instanceof MathJaxOperator){string += item.toString(AssociativityFormatType.Latex,customFormatter);}
            else {
                string += item.toString(customFormatter);
            }

            if (customFormatter) {
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


export function stringToBasicMathJaxTokens(string: String):Array<BasicMathJaxToken|Paren>{
    let tokens: Array<BasicMathJaxToken | Paren> = tokenizeToBasicMathJaxTokens(string);
    tokens = postProcessTokens(tokens);
    validatePlusMinus(tokens);
    return tokens;
}

function tokenizeToBasicMathJaxTokens(math: String):Array<BasicMathJaxToken|Paren>{
    const tokens: Array<BasicMathJaxToken|Paren>=[];
    const operators=arrToRegexString(getAllMathJaxReferences())
    for (let i = 0; i < math.length; i++) {
        let match = math.slice(i).match(regExp('^' + operators));
        if (!!match) {
            tokens.push(BasicMathJaxToken.create(match[0]));
            i+=match[0].length-1;
            continue;
        }
        match = math.slice(i).match(/^([0-9.]+)/);//([a-zA-Z]?)/);
        if (!!match)
        {   i+=match[0].length-1
            tokens.push(BasicMathJaxToken.create(parseFloat(match[0])));
            continue;
        }
        //Add plus to make it multiple Letters.
        match = math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/)
        if (!!match) {
            i+=match[0].length-1
            tokens.push(BasicMathJaxToken.create(match[0]))
            continue;
        }
        throw new Error(`Unknown char "${math[i]}"`);
    }
    return tokens;
}

function postProcessTokens(tokens: Array<BasicMathJaxToken|Paren>){
    /*rules to abid by:
    1. +- If part of the number they are absorbed into the number
    */
    tokens = idParentheses(tokens);
    
    const parenMap=implicitMultiplicationMap(tokens);

    parenMap.sort((a: number, b: number) => b - a)
    .forEach((value: any) => {
        tokens.splice(value, 0, new  BasicMathJaxToken('operator','*'));
    });
    return tokens;
}


function implicitMultiplicationMap(tokens: Array<BasicMathJaxToken|Paren>) {
    const isABasicMathJaxTokenDoubleRightOp=(token?: any)=>{
        if(token&&token instanceof BasicMathJaxToken){
            return getOperatorsByAssociativity([1, 2]).includes(token.getStringValue())
        }
        return false
    }

    /**
     * 
     * @param index 
     * @returns boolan => True if thar isn't a doubleRight operator.
     */
    const testDoubleRight = (index: number) => {
        if (!validateIndex(tokens,index)||!(tokens[index] instanceof Paren)) return false;
        const idx = findParenIndex(index,tokens)?.open;
        if (idx == null || parenState(tokens[index + 1])) return false;

        const prevToken = tokens[idx - 1];
        return !isABasicMathJaxTokenDoubleRightOp(prevToken)
    };

    const checkImplicitMultiplication=(token: any)=>{
        return token instanceof BasicMathJaxToken&&typeof token.getValue()==='string'&&hasImplicitMultiplication(token.getStringValue())
    }

    const isVar=(token: any)=>{return token instanceof BasicMathJaxToken &&token.getType()==='variable'}

    const implicitMultiplicationBefore=(token: BasicMathJaxToken|Paren, index: number):boolean=>{
        //cant have before if it is the first token
        if(index===0) return false;
        //the only befor tokens are opaning parentheses certain operator types and variables 

        if(parenState(token,true)){
            return true;
        }
        else if(isVar(token)||checkImplicitMultiplication(token)){
            return true;
        }
        return false;
    }
    const implicitMultiplicationAfter=(token: BasicMathJaxToken|Paren, index: number):boolean=>{
        //cant have after if it is the last token
        if(index===tokens.length-1) return false;
        if(parenState(token)||isVar(token)){
            return true;
        }
        return false;
    }
    const isImplicitMultiplicationInteraction=(tokens1: BasicMathJaxToken|Paren,token2: BasicMathJaxToken|Paren,index: number)=>{
        const arr=[tokens1,token2]
        if(arr.some((token: any)=>!token)){return false;}
        const varMap=arr.map((token: any)=>isVar(token))
        return false;
    }
    const map = tokens
        .map((token, index) => {
            if (isImplicitMultiplicationInteraction(tokens[index-1],token, index)) {
                return index;
            }
            return null;
        })
        .filter((item) => item !== null);
    return map;
}




function validatePlusMinus(tokens: Array<BasicMathJaxToken|Paren>){
    // Pluses are separators.Therefore, they do not need to be here As the expression is token[]
    //Minuses on the other hand.can either be a separator. Or a negative sign
    const plusMap=tokens.map((token: BasicMathJaxToken|Paren, index: any) => token instanceof BasicMathJaxToken&&token.getValue() === 'Addition'?index : null).filter((index: number | null) => index !== null)
    plusMap.reverse().forEach((index: number) => {
        tokens.splice(index,1)
    });
    const minusMap=tokens.map((token: BasicMathJaxToken|Paren, index: any) => token instanceof BasicMathJaxToken&&token.getValue() === 'Subtraction'?index : null).filter((index: number | null) => index !== null)
    
    minusMap.reverse().forEach((index: number) => {
        const nextToken = tokens[index + 1];
        if (nextToken instanceof BasicMathJaxToken && typeof nextToken.getValue() === 'number') {
            nextToken.setValue(nextToken.getNumberValue() * -1)
            tokens.splice(index, 1);
        }
      });
}

const validateIndex=(arr: any[],index: number,margin: number=0)=>{
    return index>=0+margin&&index<arr.length-margin;
}