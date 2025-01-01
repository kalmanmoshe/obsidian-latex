import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { BracketType } from "src/utils/staticData";
import { findParenIndex, Paren, idParentheses, isOpenParen, isClosedParen } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators } from "../utils/dataManager";
export function deepSearchWithPath(structure, predicate, path = []) {
    // Base case: If the current structure matches the predicate
    if (predicate(structure)) {
        return { item: structure, path };
    }
    // If it's an array, recursively search each element with its index
    if (Array.isArray(structure)) {
        for (let i = 0; i < structure.length; i++) {
            const result = deepSearchWithPath(structure[i], predicate, [...path, i]);
            if (result)
                return result;
        }
    }
    // If it's an object, recursively search its properties with their keys
    if (structure !== null && typeof structure === "object") {
        for (const key in structure) {
            if (Object.prototype.hasOwnProperty.call(structure, key)) {
                const result = deepSearchWithPath(structure[key], predicate, [...path, key]);
                if (result)
                    return result;
            }
        }
    }
    // If no match is found
    return null;
}
export function ensureAcceptableFormatForMathGroupItems(items) {
    if (!Array.isArray(items)) {
        if (!items.length && items instanceof MathGroup) {
            items = items.getItems();
        }
        else
            items = [items];
    }
    const formattedItems = items
        .map((item) => {
        if (item instanceof Token || item instanceof MathGroup || item instanceof MathJaxOperator) {
            return item;
        }
        if (item instanceof BasicMathJaxToken) {
            if (item.value && (item.type === "number" || item.type === "variable")) {
                return new Token(item.value);
            }
            throw new Error("Expected item to be a number or variable but received: " + item.value);
        }
        return null;
    })
        .filter((item) => item !== null);
    return formattedItems;
}
function typeCheckMathGroupItems(items) {
    if (!Array.isArray(items)) {
        console.error('items', items);
        throw new Error("Expected items to be an array but received: " + items);
    }
    items.map((item) => {
        if (Array.isArray(item)) {
            typeCheckMathGroupItems(item);
            return;
        }
        if (!(item instanceof Token || item instanceof MathGroup || item instanceof MathJaxOperator)) {
            console.error('item', item);
            throw new Error("Expected items to be an array of Token, MathGroup, or MathJaxOperator but received: " + items);
        }
    });
    return true;
}
function shouldAddPlus(group1, group2) {
    if (!group1 || !group2)
        return '';
    return '+';
}
function canCombine(math, operator) {
}
export class MathJaxOperator {
    operator;
    groupNum = 1;
    groups;
    solution;
    commutative;
    isOperable = true;
    constructor(operator, groupNum, groups, solution, isOperable) {
        if (operator)
            this.operator = operator;
        if (groupNum)
            this.groupNum = groupNum;
        if (groups)
            this.groups = groups;
        if (solution)
            this.solution = solution;
        if (isOperable)
            this.isOperable = isOperable;
    }
    testGroups(test) {
        return this.groups.map(g => test(g));
    }
    allGroupsAreSimilar() {
    }
    isVar() { }
    isRootLevel() {
        return this.getDeepth().max === 0;
    }
    clone() {
        const groups = this.groups.map(group => group.clone());
        const solution = this.solution ? this.solution.clone() : undefined;
        return new MathJaxOperator(this.operator, this.groupNum, groups, solution, this.isOperable);
    }
    getDeepth() {
        let deepths = [];
        this.groups.forEach(group => {
            deepths.push(group.getDeepth().max);
        });
        return { max: Math.max(...deepths), deepths: deepths };
    }
    setGroup(group, index) { this.groups[index] = group; }
    toStringSolution() {
        return this.toString() + ' = ' + this.solution.toString();
    }
    getId() { return 'operator:' + this.operator; }
    toString(customFormatter) {
        function wrapGroup(group, wrap, optional) {
            if (optional && group.singular())
                return group.toString(customFormatter);
            const groupStr = group.toString(customFormatter);
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
        if (!metadata)
            return '';
        if (metadata.associativity.numPositions > 2 || metadata.associativity.numPositions < 1) {
            throw new Error(`Invalid number of positions for associativity: ${metadata.associativity.numPositions}`);
        }
        const operator = metadata.latex;
        let index = 0;
        let string = '';
        getValuesWithKeysBySide(metadata.associativity.positions, true).forEach(item => {
            if (!item)
                return;
            console.log(item);
            string += shouldAddPlus(this.groups[index - 1], this.groups[index]) + wrapGroup(this.groups[index], item.bracketType, item.isBracketOptional);
            index++;
        });
        string += operator;
        getValuesWithKeysBySide(metadata.associativity.positions, false).forEach(item => {
            if (!item)
                return;
            string += shouldAddPlus(this.groups[index], this.groups[index + 1]) + wrapGroup(this.groups[index], item.bracketType, item.isBracketOptional);
            index++;
        });
        if (customFormatter)
            return customFormatter(this, string);
        return string.trim();
    }
}
export class MathGroup {
    items = [];
    //overview: MathOverview
    constructor(items) {
        if (items)
            this.setItems(items);
    }
    getItems() { return this.items; }
    setItem(item, index) {
        this.items[index] = item;
        this.updateOverview();
    }
    setItems(items) {
        typeCheckMathGroupItems(this.items);
        this.items = items;
        this.updateOverview();
    }
    updateOverview() {
    }
    clone() {
        return new MathGroup(this.items.map(item => item.clone()));
    }
    hasOperator() { return this.items.some((item) => item instanceof MathJaxOperator); }
    doesntHaveOperator() { return !this.hasOperator(); }
    deepHasOperator() {
        const map = this.items.map((item) => {
            if (item instanceof MathGroup) {
                return item.deepHasOperator();
            }
            if (item instanceof MathJaxOperator)
                return true;
            return false;
        });
        return map.some((t) => t);
    }
    numberOnly() { return this.items.some(t => (t instanceof Token && !t.isVar())); }
    hasVariables() { return this.items.some(t => t instanceof Token && t.isVar()); }
    singular() { return this.items.length === 1 && this.items[0] !== undefined; }
    singulToken() { return this.singular() && this.items[0] instanceof Token; }
    isRootLevel() { return this.items.every((item) => item instanceof Token); }
    extremeSimplifyAndGroup() {
        this.tryRemoveUnnecessaryNested();
        this.combiningLikeTerms();
    }
    tryRemoveUnnecessaryNested() {
        if (this.singular()) {
            if (this.items[0] instanceof MathGroup) {
                this.items = this.items[0].items;
                this.items.forEach(item => {
                    if (item instanceof MathGroup) {
                        item.tryRemoveUnnecessaryNested();
                    }
                });
            }
        }
    }
    getDeepth() {
        let deepths = [];
        this.items.forEach(item => {
            if (item instanceof Token) {
                deepths.push(0);
                return;
            }
            ;
            deepths.push(item.getDeepth().max + 1);
        });
        return { max: Math.max(...deepths), deepths: deepths };
    }
    isOperable() { return true; }
    getOperableValue() {
        this.tryRemoveUnnecessaryNested();
        this.combiningLikeTerms();
        const items = this.items;
        if (this.singular() && this.doesntHaveOperator()) {
            if (items[0] instanceof MathGroup)
                return items[0].getOperableValue();
            return items[0] instanceof Token && !items[0].isVar() ? items[0] : null;
        }
        return null;
    }
    getId() {
        return 'MathGroup';
    }
    removeNested() {
        if (this.deepHasOperator())
            return false;
        let items = [];
        this.items.forEach((item) => {
            if (item instanceof Token) {
                items.push(item);
            }
            if (item instanceof MathGroup) {
                item.removeNested();
                items.push(...item.items);
            }
        });
        this.items = items;
        return true;
    }
    combiningLikeTerms() {
    }
    toString(customFormatter) {
        let string = '';
        if (!Array.isArray(this.items)) {
            throw new Error("Expected items to be an array but received: " + this.items);
        }
        this.items.forEach((item, index) => {
            string += shouldAddPlus(this.items[index - 1], item);
            if (item instanceof MathGroup && !item.singular()) {
                string += `(${item.toString(customFormatter)})`;
            }
            else {
                string += item.toString(customFormatter);
            }
            if (customFormatter) {
                string = customFormatter(item, string);
            }
        });
        return string;
    }
}
/*class MathOverview {
    variables: Map<string, any>;
    operators: Map<string, any>;
    number: number;
    mathGroups: MathGroup[]=[];
    constructor(variables?: Map<string, any>,operators?: Map<string, any>,number?: number,mathGroups?: MathGroup[]){
        if(variables)this.variables=variables;
        if(operators)this.operators=operators;
        if(number)this.number=number;
        if(mathGroups)this.mathGroups=mathGroups;
    }
    defineOverviewseparateIntoIndividuals(items: MathGroupItem[]) {
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
                    this.updateOperatorsMap(item.operator);
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
        if(!this.variables) this.variables=new Map();
        if(!this.variables.has(key)){this.variables.set(key,{count: 0, items: []})}
        this.variables.get(key).count++;
    }
    updateOperatorsMap(key: string){
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
}*/
export class Token {
    value;
    constructor(value) {
        this.value = value;
    }
    getNumberValue() { return this.value; }
    getStringValue() { return this.value; }
    getValue() { return this.value; }
    setValue(value) { this.value = value; }
    isVar() { return typeof this.value === 'string'; }
    toString(customFormatter) {
        let string = '';
        if (!this.isVar() && this.getNumberValue() < 0)
            string += '-';
        string += this.value;
        if (customFormatter) {
            return customFormatter(this, string);
        }
        return string;
    }
    clone() { return new Token(this.value); }
}
export class BasicMathJaxTokens {
    tokens = [];
    constructor(tokens) {
        this.tokens = tokens || [];
    }
    addInput(math) {
        this.tokenize(math);
    }
    tokenize(math) {
        const operators = arrToRegexString(getAllMathJaxReferences());
        for (let i = 0; i < math.length; i++) {
            let match = math.slice(i).match(regExp('^' + operators));
            if (!!match) {
                const type = /[\(\)]/.test(match[0]) ? 'paren' : 'operator';
                this.tokens.push(new BasicMathJaxToken(type, match[0]));
                i += match[0].length - 1;
                continue;
            }
            match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
            if (!!match) {
                i += match[0].length - 1;
                this.tokens.push(new BasicMathJaxToken('number', parseFloat(match[0])));
                continue;
            }
            match = math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/);
            if (!!match) {
                i += match[0].length - 1;
                this.tokens.push(new BasicMathJaxToken("variable", match[0]));
                continue;
            }
            throw new Error(`Unknown char "${math[i]}"`);
        }
        this.postProcessTokens();
    }
    postProcessTokens() {
        /*rules to abid by:
        1. +- If part of the number they are absorbed into the number
        */
        this.tokens = idParentheses(this.tokens);
        this.implicitMultiplicationMap();
        const parenMap = this.implicitMultiplicationMap();
        parenMap.sort((a, b) => b - a)
            .forEach((value) => {
            this.tokens.splice(value, 0, new BasicMathJaxToken('operator', '*'));
        });
        this.validatePlusMinus();
    }
    implicitMultiplicationMap() {
        const testDoubleRight = (index) => {
            if (!this.validateIndex(index) || !(this.tokens[index] instanceof Paren))
                return false;
            const idx = findParenIndex(index, this.tokens)?.open;
            if (idx == null || !isOpenParen(this.tokens[index + 1]))
                return false;
            const prevToken = this.tokens[idx - 1];
            return (idx > 0 &&
                prevToken instanceof BasicMathJaxToken &&
                !getOperatorsByAssociativity([1, 2]).includes(prevToken.value?.toString() || ''));
        };
        const check = (index) => {
            if (!this.validateIndex(index))
                return false;
            const token = this.tokens[index];
            return token instanceof BasicMathJaxToken && token.isValueToken();
        };
        const checkImplicitMultiplication = (token) => {
            return token instanceof BasicMathJaxToken && typeof token.value === 'string' && hasImplicitMultiplication(token.value);
        };
        const isVar = (token) => { return token instanceof BasicMathJaxToken && token.type === 'variable'; };
        const precedesVariable = (tokens, index) => {
            return index > 0 && isVar(tokens[index]);
        };
        const followsVariable = (tokens, index) => {
            return index < tokens.length - 1 && isVar(tokens[index]);
        };
        const map = this.tokens
            .map((token, index) => {
            if (isOpenParen(token) || checkImplicitMultiplication(token) || precedesVariable(this.tokens, index)) {
                return check(index - 1) ? index : null;
            }
            else if (isClosedParen(token) || followsVariable(this.tokens, index)) {
                return check(index + 1) || testDoubleRight(index) ? index + 1 : null;
            }
            return null;
        })
            .filter((item) => item !== null);
        console.log(this.tokens, map);
        return map;
    }
    validatePlusMinus() {
        // Pluses are separators.Therefore, they do not need to be here As the expression is token[]
        //Minuses on the other hand.can either be a separator. Or a negative sign
        const plusMap = this.tokens.map((token, index) => token.value === 'Addition' ? index : null).filter((index) => index !== null);
        plusMap.reverse().forEach((index) => {
            this.tokens.splice(index, 1);
        });
        const minusMap = this.tokens.map((token, index) => token.value === 'Subtraction' ? index : null).filter((index) => index !== null);
        minusMap.reverse().forEach((index) => {
            const nextToken = this.tokens[index + 1];
            if (nextToken instanceof BasicMathJaxToken && typeof nextToken.value === 'number') {
                nextToken.value *= -1;
                this.tokens.splice(index, 1);
            }
        });
    }
    validateIndex(index, margin) {
        margin = margin || 0;
        return index >= 0 + margin && index < this.tokens.length - margin;
    }
    clone() {
        return new BasicMathJaxTokens(this.tokens.map(token => token.clone()));
    }
}
export class BasicMathJaxToken {
    type;
    value;
    constructor(type, value) {
        this.type = type;
        this.value = value;
        this.insurProperFormatting();
    }
    insurProperFormatting() {
        if (!this.isValueToken() && typeof this.value === "string") {
            this.value = searchAllMathJaxOperatorsAndSymbols(this.value)?.name;
        }
    }
    getLatexSymbol() { return typeof this.value === 'string' ? searchMathJaxOperators(this.value)?.latex : undefined; }
    getfullType() {
        return this.type;
    }
    clone() {
        return new BasicMathJaxToken(this.type, this.value);
    }
    isString() { return this.type === 'paren' || this.type === 'operator'; }
    isValueToken() { return this.type === 'variable' || this.type === 'number'; }
    toStringLatex() {
        let string = '';
        if (this.isString())
            string += this.getLatexSymbol();
        if (this.type === 'number')
            string += this.value;
        return string;
    }
    affectedOperatorRange(direction) {
        if (this.type !== 'operator' || this.value === 'Equals')
            return false;
        if (typeof this.value === 'string' && direction === 'left' && !isOperatorWithAssociativity(this.value, [-1, 1], true))
            return false;
        return true;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUEsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUFtRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5JLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUd4UixNQUFNLFVBQVUsa0JBQWtCLENBQzlCLFNBQWMsRUFDZCxTQUFpQyxFQUNqQyxPQUE0QixFQUFFO0lBRTlCLDREQUE0RDtJQUM1RCxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxtRUFBbUU7SUFDbkUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDM0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN4QyxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RSxJQUFJLE1BQU07Z0JBQUUsT0FBTyxNQUFN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TSxJQUFFLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQztZQUN2RyxPQUFPLEtBQUssQ0FBQTtRQUNoQixPQUFPLElBQUksQ0FBQTtJQUNmLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi4vaW1WZXJ5TGF6eVwiO1xyXG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgQXNzb2NpYXRpdml0eSwgQnJhY2tldFR5cGUsIE1hdGhKYXhPcGVyYXRvck1ldGFkYXRhLCBtYXRoSmF4T3BlcmF0b3JzTWV0YWRhdGEsIE9wZXJhdG9yVHlwZSB9IGZyb20gXCJzcmMvdXRpbHMvc3RhdGljRGF0YVwiO1xyXG5cclxuaW1wb3J0IHsgZmluZFBhcmVuSW5kZXgsIFBhcmVuLGlkUGFyZW50aGVzZXMsIGlzT3BlblBhcmVuLCBpc0Nsb3NlZFBhcmVuIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcclxuaW1wb3J0IHsgZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHksIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlLCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBpc09wZXJhdG9yV2l0aEFzc29jaWF0aXZpdHksIHNlYXJjaEFsbE1hdGhKYXhPcGVyYXRvcnNBbmRTeW1ib2xzLCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzLCBzZWFyY2hTeW1ib2xzIH0gZnJvbSBcIi4uL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XHJcblxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRlZXBTZWFyY2hXaXRoUGF0aChcclxuICAgIHN0cnVjdHVyZTogYW55LFxyXG4gICAgcHJlZGljYXRlOiAoaXRlbTogYW55KSA9PiBib29sZWFuLFxyXG4gICAgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdXHJcbik6IHsgaXRlbTogYW55OyBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdIH0gfCBudWxsIHtcclxuICAgIC8vIEJhc2UgY2FzZTogSWYgdGhlIGN1cnJlbnQgc3RydWN0dXJlIG1hdGNoZXMgdGhlIHByZWRpY2F0ZVxyXG4gICAgaWYgKHByZWRpY2F0ZShzdHJ1Y3R1cmUpKSB7XHJcbiAgICAgICAgcmV0dXJuIHsgaXRlbTogc3RydWN0dXJlLCBwYXRoIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgaXQncyBhbiBhcnJheSwgcmVjdXJzaXZlbHkgc2VhcmNoIGVhY2ggZWxlbWVudCB3aXRoIGl0cyBpbmRleFxyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoc3RydWN0dXJlKSkge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RydWN0dXJlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVbaV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGldKTtcclxuICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgaXQncyBhbiBvYmplY3QsIHJlY3Vyc2l2ZWx5IHNlYXJjaCBpdHMgcHJvcGVydGllcyB3aXRoIHRoZWlyIGtleXNcclxuICAgIGlmIChzdHJ1Y3R1cmUgIT09IG51bGwgJiYgdHlwZW9mIHN0cnVjdHVyZSA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHN0cnVjdHVyZSkge1xyXG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0cnVjdHVyZSwga2V5KSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtrZXldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBrZXldKTtcclxuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgbm8gbWF0Y2ggaXMgZm91bmRcclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXM6IGFueSk6IE1hdGhHcm91cEl0ZW1bXSB7XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XHJcbiAgICAgICAgaWYgKCFpdGVtcy5sZW5ndGgmJml0ZW1zIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgICAgIGl0ZW1zPWl0ZW1zLmdldEl0ZW1zKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgaXRlbXM9W2l0ZW1zXVxyXG4gICAgfVxyXG4gICAgY29uc3QgZm9ybWF0dGVkSXRlbXM9aXRlbXNcclxuICAgICAgICAubWFwKChpdGVtOiBUb2tlbnxNYXRoR3JvdXB8TWF0aEpheE9wZXJhdG9yfEJhc2ljTWF0aEpheFRva2VuKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS52YWx1ZSYmKGl0ZW0udHlwZT09PSBcIm51bWJlclwifHxpdGVtLnR5cGU9PT1cInZhcmlhYmxlXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBUb2tlbihpdGVtLnZhbHVlKTsgXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtIHRvIGJlIGEgbnVtYmVyIG9yIHZhcmlhYmxlIGJ1dCByZWNlaXZlZDogXCIraXRlbS52YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbHwgVG9rZW4gfCBNYXRoR3JvdXAgfCBNYXRoSmF4T3BlcmF0b3IpOiBpdGVtIGlzIFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yID0+IGl0ZW0gIT09IG51bGwpO1xyXG4gICAgcmV0dXJuIGZvcm1hdHRlZEl0ZW1zO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0eXBlQ2hlY2tNYXRoR3JvdXBJdGVtcyhpdGVtczogYW55KTogaXRlbXMgaXMgTWF0aEdyb3VwSXRlbVtdIHtcclxuICAgIGlmKCFBcnJheS5pc0FycmF5KGl0ZW1zKSl7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignaXRlbXMnLGl0ZW1zKVxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW1zIHRvIGJlIGFuIGFycmF5IGJ1dCByZWNlaXZlZDogXCIraXRlbXMpO1xyXG4gICAgfVxyXG4gICAgaXRlbXMubWFwKChpdGVtOiBhbnkpID0+IHtcclxuICAgICAgICBpZihBcnJheS5pc0FycmF5KGl0ZW0pKXtcclxuICAgICAgICAgICAgdHlwZUNoZWNrTWF0aEdyb3VwSXRlbXMoaXRlbSk7cmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZighKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbnx8aXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cHx8aXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikpe1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdpdGVtJyxpdGVtKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBvZiBUb2tlbiwgTWF0aEdyb3VwLCBvciBNYXRoSmF4T3BlcmF0b3IgYnV0IHJlY2VpdmVkOiBcIitpdGVtcyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxufVxyXG5mdW5jdGlvbiBzaG91bGRBZGRQbHVzKGdyb3VwMT86IGFueSxncm91cDI/OiBhbnkpe1xyXG4gICAgaWYoIWdyb3VwMXx8IWdyb3VwMilyZXR1cm4gJyc7XHJcblxyXG4gICAgcmV0dXJuICcrJztcclxufVxyXG5cclxuZnVuY3Rpb24gY2FuQ29tYmluZShtYXRoOiBNYXRoR3JvdXAsb3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcblxyXG59XHJcbmV4cG9ydCBjbGFzcyBNYXRoSmF4T3BlcmF0b3J7XHJcbiAgICBvcGVyYXRvcjogc3RyaW5nO1xyXG4gICAgZ3JvdXBOdW06IG51bWJlcj0xO1xyXG4gICAgZ3JvdXBzOiBNYXRoR3JvdXBbXTtcclxuICAgIHNvbHV0aW9uOiBNYXRoR3JvdXA7XHJcbiAgICBjb21tdXRhdGl2ZTogYm9vbGVhbjtcclxuICAgIGlzT3BlcmFibGU6IGJvb2xlYW49dHJ1ZTtcclxuICAgIGNvbnN0cnVjdG9yKG9wZXJhdG9yPzogc3RyaW5nLGdyb3VwTnVtPzogbnVtYmVyLGdyb3Vwcz86IE1hdGhHcm91cFtdLHNvbHV0aW9uPzogTWF0aEdyb3VwLGlzT3BlcmFibGU/OiBib29sZWFuKXtcclxuICAgICAgICBpZiAob3BlcmF0b3IpdGhpcy5vcGVyYXRvcj1vcGVyYXRvcjtcclxuICAgICAgICBpZihncm91cE51bSl0aGlzLmdyb3VwTnVtPWdyb3VwTnVtO1xyXG4gICAgICAgIGlmKGdyb3Vwcyl0aGlzLmdyb3Vwcz1ncm91cHM7XHJcbiAgICAgICAgaWYoc29sdXRpb24pdGhpcy5zb2x1dGlvbj1zb2x1dGlvbjtcclxuICAgICAgICBpZihpc09wZXJhYmxlKXRoaXMuaXNPcGVyYWJsZT1pc09wZXJhYmxlO1xyXG4gICAgfVxyXG4gICAgdGVzdEdyb3Vwcyh0ZXN0OiAoZ3JvdXA6IE1hdGhHcm91cCkgPT4gYm9vbGVhbik6Ym9vbGVhbltde1xyXG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAoZz0+IHRlc3QoZykpO1xyXG4gICAgfVxyXG4gICAgYWxsR3JvdXBzQXJlU2ltaWxhcigpe1xyXG5cclxuICAgIH1cclxuICAgIGlzVmFyKCl7fVxyXG4gICAgaXNSb290TGV2ZWwoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWVwdGgoKS5tYXg9PT0wO1xyXG4gICAgfVxyXG4gICAgY2xvbmUoKSB7XHJcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmNsb25lKCkpO1xyXG4gICAgICAgIGNvbnN0IHNvbHV0aW9uID0gdGhpcy5zb2x1dGlvbiA/IHRoaXMuc29sdXRpb24uY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcih0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xyXG4gICAgfVxyXG4gICAgZ2V0RGVlcHRoKCl7XHJcbiAgICAgICAgbGV0IGRlZXB0aHM6IG51bWJlcltdPVtdO1xyXG4gICAgICAgIHRoaXMuZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xyXG4gICAgICAgICAgICBkZWVwdGhzLnB1c2goZ3JvdXAuZ2V0RGVlcHRoKCkubWF4KVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiB7bWF4OiBNYXRoLm1heCguLi5kZWVwdGhzKSwgZGVlcHRoczogZGVlcHRoc31cclxuICAgIH1cclxuICAgIHNldEdyb3VwKGdyb3VwOiBNYXRoR3JvdXAsaW5kZXg6bnVtYmVyKXt0aGlzLmdyb3Vwc1tpbmRleF09Z3JvdXB9XHJcbiAgICB0b1N0cmluZ1NvbHV0aW9uKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKSsnID0gJyt0aGlzLnNvbHV0aW9uLnRvU3RyaW5nKCk7XHJcbiAgICB9XHJcbiAgICBnZXRJZCgpe3JldHVybiAnb3BlcmF0b3I6Jyt0aGlzLm9wZXJhdG9yfVxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBNYXRoR3JvdXAsIHdyYXA6IEJyYWNrZXRUeXBlLG9wdGlvbmFsOiBib29sZWFuKTogc3RyaW5nIHtcclxuICAgICAgICAgICAgaWYob3B0aW9uYWwmJmdyb3VwLnNpbmd1bGFyKCkpcmV0dXJuIGdyb3VwLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwU3RyPWdyb3VwLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcilcclxuICAgICAgICAgICAgc3dpdGNoICh3cmFwKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLlBhcmVudGhlc2VzOlxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgKCR7Z3JvdXBTdHJ9KWA7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLkN1cmx5QnJhY2VzOlxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgeyR7Z3JvdXBTdHJ9fWA7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBncm91cFN0cjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMub3BlcmF0b3IpO1xyXG4gICAgICAgIGlmICghbWV0YWRhdGEpIHJldHVybiAnJztcclxuICAgICAgICBpZihtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9ucz4yfHxtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uczwxKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIG51bWJlciBvZiBwb3NpdGlvbnMgZm9yIGFzc29jaWF0aXZpdHk6ICR7bWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnN9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvcGVyYXRvciA9IG1ldGFkYXRhLmxhdGV4O1xyXG4gICAgICAgIGxldCBpbmRleD0wO1xyXG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcclxuXHJcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsdHJ1ZSkuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGl0ZW0pXHJcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4LTFdLHRoaXMuZ3JvdXBzW2luZGV4XSkrd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XSwgaXRlbS5icmFja2V0VHlwZSwgaXRlbS5pc0JyYWNrZXRPcHRpb25hbCk7XHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcclxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyxmYWxzZSkuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XHJcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4XSx0aGlzLmdyb3Vwc1tpbmRleCsxXSkrd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XSwgaXRlbS5icmFja2V0VHlwZSwgaXRlbS5pc0JyYWNrZXRPcHRpb25hbCk7XHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgdHlwZSBNYXRoR3JvdXBJdGVtPVRva2VufE1hdGhHcm91cHxNYXRoSmF4T3BlcmF0b3JcclxuZXhwb3J0IGNsYXNzIE1hdGhHcm91cCB7XHJcbiAgICBwcml2YXRlIGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10gPSBbXTtcclxuICAgIC8vb3ZlcnZpZXc6IE1hdGhPdmVydmlld1xyXG4gICAgXHJcbiAgICBjb25zdHJ1Y3RvcihpdGVtcz86IE1hdGhHcm91cEl0ZW1bXSkge1xyXG4gICAgICAgIGlmKGl0ZW1zKXRoaXMuc2V0SXRlbXMoaXRlbXMpO1xyXG4gICAgfVxyXG4gICAgZ2V0SXRlbXMoKTogTWF0aEdyb3VwSXRlbVtdIHtyZXR1cm4gdGhpcy5pdGVtczt9XHJcbiAgICBzZXRJdGVtKGl0ZW06IE1hdGhHcm91cEl0ZW0saW5kZXg6bnVtYmVyKXtcclxuICAgICAgICB0aGlzLml0ZW1zW2luZGV4XT1pdGVtO1xyXG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKVxyXG4gICAgfVxyXG4gICAgc2V0SXRlbXMoaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSkge1xyXG4gICAgICAgIHR5cGVDaGVja01hdGhHcm91cEl0ZW1zKHRoaXMuaXRlbXMpXHJcbiAgICAgICAgdGhpcy5pdGVtcyA9IGl0ZW1zO1xyXG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKSAgICBcclxuICAgIH1cclxuICAgIHVwZGF0ZU92ZXJ2aWV3KCl7LypcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3PW5ldyBNYXRoT3ZlcnZpZXcoKVxyXG4gICAgICAgIHRoaXMub3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdzZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKSovXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNsb25lKCk6IE1hdGhHcm91cCB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoR3JvdXAodGhpcy5pdGVtcy5tYXAoaXRlbT0+aXRlbS5jbG9uZSgpKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzT3BlcmF0b3IoKTogdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSgoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcik7fVxyXG4gICAgZG9lc250SGF2ZU9wZXJhdG9yKCk6ICB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gIXRoaXMuaGFzT3BlcmF0b3IoKTt9XHJcbiAgICBkZWVwSGFzT3BlcmF0b3IoKXtcclxuICAgICAgICBjb25zdCBtYXA9dGhpcy5pdGVtcy5tYXAoKGl0ZW0pOiBib29sZWFuID0+IHtcclxuICAgICAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5kZWVwSGFzT3BlcmF0b3IoKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpcmV0dXJuIHRydWVcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG1hcC5zb21lKCh0OiBib29sZWFuKT0+dClcclxuICAgIH1cclxuICAgIG51bWJlck9ubHkoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSh0ID0+ICh0IGluc3RhbmNlb2YgVG9rZW4mJiF0LmlzVmFyKCkpKTt9XHJcbiAgICBoYXNWYXJpYWJsZXMoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSh0ID0+IHQgaW5zdGFuY2VvZiBUb2tlbiYmdC5pc1ZhcigpKTt9XHJcblxyXG4gICAgc2luZ3VsYXIoKTpib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGggPT09IDEgJiYgdGhpcy5pdGVtc1swXSAhPT0gdW5kZWZpbmVkO31cclxuICAgIHNpbmd1bFRva2VuKCk6IHRoaXMgaXMgeyBpdGVtczogW1Rva2VuXSB9IHtyZXR1cm4gdGhpcy5zaW5ndWxhcigpICYmIHRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbjt9XHJcbiAgICBpc1Jvb3RMZXZlbCgpe3JldHVybiB0aGlzLml0ZW1zLmV2ZXJ5KChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgVG9rZW4pO31cclxuICAgIGV4dHJlbWVTaW1wbGlmeUFuZEdyb3VwKCl7XHJcbiAgICAgICAgdGhpcy50cnlSZW1vdmVVbm5lY2Vzc2FyeU5lc3RlZCgpO1xyXG4gICAgICAgIHRoaXMuY29tYmluaW5nTGlrZVRlcm1zKClcclxuICAgIH1cclxuXHJcbiAgICB0cnlSZW1vdmVVbm5lY2Vzc2FyeU5lc3RlZCgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5zaW5ndWxhcigpKSB7XHJcbiAgICAgICAgICAgIGlmKHRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcyA9IHRoaXMuaXRlbXNbMF0uaXRlbXM7XHJcbiAgICAgICAgICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbS50cnlSZW1vdmVVbm5lY2Vzc2FyeU5lc3RlZCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgZ2V0RGVlcHRoKCl7XHJcbiAgICAgICAgbGV0IGRlZXB0aHM6IG51bWJlcltdPVtdO1xyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIFRva2VuKXtcclxuICAgICAgICAgICAgICAgIGRlZXB0aHMucHVzaCgwKTtyZXR1cm47XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGRlZXB0aHMucHVzaChpdGVtLmdldERlZXB0aCgpLm1heCsxKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiB7bWF4OiBNYXRoLm1heCguLi5kZWVwdGhzKSwgZGVlcHRoczogZGVlcHRoc31cclxuICAgIH1cclxuICAgIGlzT3BlcmFibGUoKXtyZXR1cm4gdHJ1ZX1cclxuXHJcbiAgICBnZXRPcGVyYWJsZVZhbHVlKCk6IFRva2VuIHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudHJ5UmVtb3ZlVW5uZWNlc3NhcnlOZXN0ZWQoKTtcclxuICAgICAgICB0aGlzLmNvbWJpbmluZ0xpa2VUZXJtcygpO1xyXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5pdGVtcztcclxuICAgICAgICBpZiAodGhpcy5zaW5ndWxhcigpJiZ0aGlzLmRvZXNudEhhdmVPcGVyYXRvcigpKSB7XHJcbiAgICAgICAgICAgIGlmIChpdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhHcm91cClcclxuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtc1swXS5nZXRPcGVyYWJsZVZhbHVlKCk7XHJcbiAgICAgICAgICAgIHJldHVybiBpdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuJiYhaXRlbXNbMF0uaXNWYXIoKSA/IGl0ZW1zWzBdIDogbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBnZXRJZCgpe1xyXG4gICAgICAgIHJldHVybiAnTWF0aEdyb3VwJ1xyXG4gICAgfVxyXG4gICAgcmVtb3ZlTmVzdGVkKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLmRlZXBIYXNPcGVyYXRvcigpKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICBsZXQgaXRlbXM6IFRva2VuW10gPSBbXTtcclxuICAgIFxyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwIHwgVG9rZW4pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbikge1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgICAgIGl0ZW0ucmVtb3ZlTmVzdGVkKCk7XHJcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKC4uLihpdGVtLml0ZW1zIGFzIFRva2VuW10pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLml0ZW1zID0gaXRlbXM7XHJcbiAgICBcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICAgIGNvbWJpbmluZ0xpa2VUZXJtcygpIHsvKlxyXG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3PXRoaXMubGV2ZWxNYXAoKVxyXG4gICAgICAgIGNvbnN0IGNvbWJpbmVkSXRlbXMgPSBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBvdmVydmlldy5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgaWYgKGtleS5pbmNsdWRlcyhcIm9wZXJhdG9yXCIpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21iaW5lZEl0ZW1zLnB1c2goLi4udmFsdWUuaXRlbXMpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3Qgc3VtID0gdmFsdWUuaXRlbXMucmVkdWNlKCh0b3RhbDogYW55LCBpdGVtOiBUb2tlbikgPT4gdG90YWwgKyAoaXRlbS5nZXRWYWx1ZT9pdGVtLmdldFZhbHVlKCk6IDApLCAwKTtcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBUb2tlbihzdW0sIHZhbHVlLnZhcmlhYmxlPz91bmRlZmluZWQpO1xyXG4gICAgICAgICAgICBjb21iaW5lZEl0ZW1zLnB1c2godG9rZW4pO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zID0gY29tYmluZWRJdGVtczsqL1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XHJcbiAgICAgICAgaWYoIUFycmF5LmlzQXJyYXkodGhpcy5pdGVtcykpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBidXQgcmVjZWl2ZWQ6IFwiK3RoaXMuaXRlbXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHN0cmluZys9c2hvdWxkQWRkUGx1cyh0aGlzLml0ZW1zW2luZGV4LTFdLGl0ZW0pXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBgKCR7aXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpfSlgO1xyXG4gICAgICAgICAgICB9ICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XHJcbiAgICAgICAgICAgIH0gaWYgKGN1c3RvbUZvcm1hdHRlcikge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nID0gY3VzdG9tRm9ybWF0dGVyKGl0ZW0sc3RyaW5nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmc7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vKmNsYXNzIE1hdGhPdmVydmlldyB7XHJcbiAgICB2YXJpYWJsZXM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBvcGVyYXRvcnM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBudW1iZXI6IG51bWJlcjtcclxuICAgIG1hdGhHcm91cHM6IE1hdGhHcm91cFtdPVtdO1xyXG4gICAgY29uc3RydWN0b3IodmFyaWFibGVzPzogTWFwPHN0cmluZywgYW55PixvcGVyYXRvcnM/OiBNYXA8c3RyaW5nLCBhbnk+LG51bWJlcj86IG51bWJlcixtYXRoR3JvdXBzPzogTWF0aEdyb3VwW10pe1xyXG4gICAgICAgIGlmKHZhcmlhYmxlcyl0aGlzLnZhcmlhYmxlcz12YXJpYWJsZXM7XHJcbiAgICAgICAgaWYob3BlcmF0b3JzKXRoaXMub3BlcmF0b3JzPW9wZXJhdG9ycztcclxuICAgICAgICBpZihudW1iZXIpdGhpcy5udW1iZXI9bnVtYmVyO1xyXG4gICAgICAgIGlmKG1hdGhHcm91cHMpdGhpcy5tYXRoR3JvdXBzPW1hdGhHcm91cHM7XHJcbiAgICB9XHJcbiAgICBkZWZpbmVPdmVydmlld3NlcGFyYXRlSW50b0luZGl2aWR1YWxzKGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10pIHtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcz1uZXcgTWFwKCk7XHJcbiAgICAgICAgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xyXG5cclxuICAgICAgICBpdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZpdGVtLmlzVmFyKCk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVWYXJpYWJsZXNNYXAoaXRlbS5nZXRTdHJpbmdWYWx1ZSgpKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIFRva2VuJiYhaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlTXVtYmVyKGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3I6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVPcGVyYXRvcnNNYXAoaXRlbS5vcGVyYXRvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXA6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYXRoR3JvdXBzLnB1c2goaXRlbSlcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5rbm93biBjYXRlZ29yeSBpbiBNYXRoT3ZlcnZpZXcgc2VwYXJhdGVJbnRvSW5kaXZpZHVhbHNcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICB9XHJcbiAgICB1cGRhdGVNdW1iZXIobnVtYmVyOiBudW1iZXIpeyB0aGlzLm51bWJlcj10aGlzLm51bWJlcj90aGlzLm51bWJlcitudW1iZXI6bnVtYmVyO31cclxuICAgIHVwZGF0ZVZhcmlhYmxlc01hcChrZXk6IHN0cmluZyl7XHJcbiAgICAgICAgaWYoIXRoaXMudmFyaWFibGVzKSB0aGlzLnZhcmlhYmxlcz1uZXcgTWFwKCk7XHJcbiAgICAgICAgaWYoIXRoaXMudmFyaWFibGVzLmhhcyhrZXkpKXt0aGlzLnZhcmlhYmxlcy5zZXQoa2V5LHtjb3VudDogMCwgaXRlbXM6IFtdfSl9XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZ2V0KGtleSkuY291bnQrKztcclxuICAgIH1cclxuICAgIHVwZGF0ZU9wZXJhdG9yc01hcChrZXk6IHN0cmluZyl7XHJcbiAgICAgICAgaWYoIXRoaXMub3BlcmF0b3JzKSB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XHJcbiAgICAgICAgaWYoIXRoaXMub3BlcmF0b3JzLmhhcyhrZXkpKXt0aGlzLm9wZXJhdG9ycy5zZXQoa2V5LHtjb3VudDogMCwgaXRlbXM6IFtdfSl9XHJcbiAgICAgICAgdGhpcy5vcGVyYXRvcnMuZ2V0KGtleSkuY291bnQrKztcclxuICAgIH1cclxuICAgIGhhc1Zhcigpe3JldHVybiB0aGlzLnZhcmlhYmxlcyYmdGhpcy52YXJpYWJsZXMuc2l6ZT4wfVxyXG4gICAgaGFzT3AoKXtyZXR1cm4gdGhpcy5vcGVyYXRvcnMmJnRoaXMub3BlcmF0b3JzLnNpemU+MH1cclxuICAgIGhhc0dyb3VwKCl7cmV0dXJuIHRoaXMubWF0aEdyb3Vwcy5sZW5ndGg+MH1cclxuICAgIG9ubHlOdW1lcmljKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubnVtYmVyJiYhdGhpcy5oYXNWYXIoKSYmIXRoaXMuaGFzT3AoKSYmIXRoaXMuaGFzR3JvdXAoKVxyXG4gICAgfVxyXG4gICAgZGVlcE51bWVyaWMoKXtcclxuXHJcbiAgICB9XHJcbiAgICBleHBsb3JBbGxMZXZlbHMoKXtcclxuICAgICAgICBcclxuICAgIH1cclxufSovXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRva2Vue1xyXG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOm51bWJlcnxzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBnZXROdW1iZXJWYWx1ZSgpOm51bWJlcntyZXR1cm4gKHRoaXMudmFsdWUgYXMgbnVtYmVyKX1cclxuICAgIGdldFN0cmluZ1ZhbHVlKCk6c3RyaW5ne3JldHVybiAodGhpcy52YWx1ZSBhcyBzdHJpbmcpfVxyXG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cclxuICAgIHNldFZhbHVlKHZhbHVlOiBudW1iZXJ8c3RyaW5nKXt0aGlzLnZhbHVlPXZhbHVlO31cclxuICAgIGlzVmFyKCkge3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZyc7fVxyXG4gICAgXHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnXHJcbiAgICAgICAgaWYoIXRoaXMuaXNWYXIoKSYmdGhpcy5nZXROdW1iZXJWYWx1ZSgpPDApXHJcbiAgICAgICAgICAgIHN0cmluZys9Jy0nO1xyXG4gICAgICAgIHN0cmluZys9dGhpcy52YWx1ZTtcclxuICAgICAgICBpZihjdXN0b21Gb3JtYXR0ZXIpe1xyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc3RyaW5nO1xyXG4gICAgfVxyXG4gICAgY2xvbmUoKXtyZXR1cm4gbmV3IFRva2VuKHRoaXMudmFsdWUpfVxyXG59XHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbnN7XHJcbiAgICB0b2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPj1bXTtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IodG9rZW5zPzogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+KXtcclxuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnN8fFtdO1xyXG4gICAgfVxyXG4gICAgYWRkSW5wdXQobWF0aDogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUobWF0aDogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcygpKVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKHJlZ0V4cCgnXicgKyBvcGVyYXRvcnMpKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGU9L1tcXChcXCldLy50ZXN0KG1hdGNoWzBdKT8ncGFyZW4nOidvcGVyYXRvcidcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3ICBCYXNpY01hdGhKYXhUb2tlbih0eXBlLG1hdGNoWzBdKSk7XHJcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKS8pOy8vKFthLXpBLVpdPykvKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpXHJcbiAgICAgICAgICAgIHsgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oJ251bWJlcicscGFyc2VGbG9hdChtYXRjaFswXSkpKTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPW1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKyhfXFwoW2EtekEtWjAtOV0qXFwpKSovKVxyXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljTWF0aEpheFRva2VuKFwidmFyaWFibGVcIixtYXRjaFswXSkpXHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcclxuICAgICAgICB9XHJcbiAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICAgdGhpcy50b2tlbnM9aWRQYXJlbnRoZXNlcyh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxyXG5cclxuICAgICAgICBwYXJlbk1hcC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYiAtIGEpXHJcbiAgICAgICAgLmZvckVhY2goKHZhbHVlOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHZhbHVlLCAwLCBuZXcgIEJhc2ljTWF0aEpheFRva2VuKCdvcGVyYXRvcicsJyonKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKVxyXG4gICAgfVxyXG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpIHtcclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCl8fCEodGhpcy50b2tlbnNbaW5kZXhdIGluc3RhbmNlb2YgUGFyZW4pKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGZpbmRQYXJlbkluZGV4KGluZGV4LHRoaXMudG9rZW5zKT8ub3BlbjtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoaWR4ID09IG51bGwgfHwgIWlzT3BlblBhcmVuKHRoaXMudG9rZW5zW2luZGV4ICsgMV0pKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbaWR4IC0gMV07XHJcbiAgICBcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgIGlkeCA+IDAgJiZcclxuICAgICAgICAgICAgICAgIHByZXZUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmXHJcbiAgICAgICAgICAgICAgICAhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXMocHJldlRva2VuLnZhbHVlPy50b1N0cmluZygpIHx8ICcnKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH07XHJcbiAgICBcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcclxuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdG9rZW4uaXNWYWx1ZVRva2VuKCk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb25zdCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb249KHRva2VuOiBhbnkpPT57XHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0eXBlb2YgdG9rZW4udmFsdWU9PT0nc3RyaW5nJyYmaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSlcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaXNWYXI9KHRva2VuOiBhbnkpPT57cmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZ0b2tlbi50eXBlPT09J3ZhcmlhYmxlJ31cclxuICAgICAgICBjb25zdCBwcmVjZWRlc1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIGluZGV4PjAmJmlzVmFyKHRva2Vuc1tpbmRleF0pXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBmb2xsb3dzVmFyaWFibGUgPSAodG9rZW5zOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gaW5kZXg8dG9rZW5zLmxlbmd0aC0xJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNPcGVuUGFyZW4odG9rZW4pfHwgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuKXx8cHJlY2VkZXNWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNDbG9zZWRQYXJlbih0b2tlbil8fGZvbGxvd3NWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggKyAxKSB8fCB0ZXN0RG91YmxlUmlnaHQoaW5kZXgpID8gaW5kZXggKyAxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICBjb25zb2xlLmxvZyh0aGlzLnRva2VucyxtYXApXHJcbiAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XHJcbiAgICAgICAgLy8gUGx1c2VzIGFyZSBzZXBhcmF0b3JzLlRoZXJlZm9yZSwgdGhleSBkbyBub3QgbmVlZCB0byBiZSBoZXJlIEFzIHRoZSBleHByZXNzaW9uIGlzIHRva2VuW11cclxuICAgICAgICAvL01pbnVzZXMgb24gdGhlIG90aGVyIGhhbmQuY2FuIGVpdGhlciBiZSBhIHNlcGFyYXRvci4gT3IgYSBuZWdhdGl2ZSBzaWduXHJcbiAgICAgICAgY29uc3QgcGx1c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdBZGRpdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcclxuICAgICAgICBwbHVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1pbnVzTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VuLCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gJ1N1YnRyYWN0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxyXG4gICAgICAgIFxyXG4gICAgICAgIG1pbnVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRUb2tlbiA9IHRoaXMudG9rZW5zW2luZGV4ICsgMV07XHJcbiAgICAgICAgICAgIGlmIChuZXh0VG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJiB0eXBlb2YgbmV4dFRva2VuLnZhbHVlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgIG5leHRUb2tlbi52YWx1ZSAqPSAtMTtcclxuICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcixtYXJnaW4/OiBudW1iZXIpe1xyXG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XHJcbiAgICAgICAgcmV0dXJuIGluZGV4Pj0wK21hcmdpbiYmaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLW1hcmdpbjtcclxuICAgIH1cclxuICAgIGNsb25lKCk6IEJhc2ljTWF0aEpheFRva2VucyB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBCYXNpY01hdGhKYXhUb2tlbnModGhpcy50b2tlbnMubWFwKHRva2VuID0+IHRva2VuLmNsb25lKCkpKTtcclxuICAgIH1cclxuICAgIC8qXHJcbiAgICBcclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKXtcclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgaWR4PWZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XHJcbiAgICAgICAgICAgIHJldHVybiBpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCsxXSkmJihpZHg9PT0wfHwhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMudG9rZW5zW2lkeC0xXT8udmFsdWUpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pfHwhdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBudW1iZXIpID0+IHsgXHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8IChoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLnZhbHVlKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHx0ZXN0RG91YmxlUmlnaHQoaW5kZXgpPyBpbmRleCsxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICByZXR1cm4gbWFwO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09IFwiKFwiID8gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICB9XHJcblxyXG4gICAgZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tYXBQYXJlbkluZGV4ZXMoKVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcclxuICAgICAgICAgICAgICAgIGlmIChvcGVuSW5kZXggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdPy50eXBlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKGNsb3NlSW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXT8uaXNWYWx1ZVRva2VuKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9KS5mbGF0TWFwKChpdGVtOiBhbnkpID0+IFtpdGVtLm9wZW4sIGl0ZW0uY2xvc2VdKTtcclxuICAgIH0gICAgXHJcbiAgICBcclxuICAgIFxyXG4gICAgZmluZFNpbWlsYXJTdWNjZXNzb3IodG9rZW5zKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcclxuICAgICAgICAgICAgICAgICYmKHRoaXMudG9rZW5Db21wYXJlKFwidHlwZVwiLHRoaXMudmFsdWVUb2tlbnMoKSwgdG9rZW4sIHRva2Vuc1tpbmRleCArIDFdKSlcclxuICAgICAgICApKTtcclxuICAgICB9XHJcbiAgICBcclxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKHRva2VuIGluc3RhbmNlb2YgVG9rZW4pKXtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKF86IGFueSwgaWR4OiB1bmtub3duKSA9PiAhbWFwLmhhcyhpZHgpKTtcclxuICAgICAgICAvL1Byb2JsZW0gd2l0aCAgPSBhcyBpdCdzIGFmZmVjdGluZyB0aGUgdmFyaWFibGUgYmVmb3JlIGl0XHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggLSAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKSAmJlxyXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBjb25zdCB2YXJNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J3ZhcmlhYmxlJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBhcnIgPSBbXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhudW1NYXApLCBcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXHJcbiAgICAgICAgXHJcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcclxuICAgIH1cclxuXHJcbiAgICBcclxuXHJcbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXHJcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcclxuICAgICAgICApXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgIH1cclxuXHJcbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQ6IGFueSwgbGVuZ3RoOiBudW1iZXIsIG9iamVjdHM6IGFueVtdIHwgVG9rZW4pIHtcclxuICAgICAgICBvYmplY3RzID0gZmxhdHRlbkFycmF5KG9iamVjdHMpO1xyXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXhwZWN0ZWQgYG9iamVjdHNgIHRvIGJlIGFuIGFycmF5LCBidXQgcmVjZWl2ZWQ6XCIsIG9iamVjdHMpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgbGVuZ3RoLCAuLi5vYmplY3RzKTtcclxuICAgIH1cclxuXHJcbiAgICBcclxuXHJcbiAgICBpbmRleGVzVG9BZGRQbHVzKHRva2VuczogYW55W10pe1xyXG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcclxuICAgICAgICAgICAgJiZ0b2tlbnNbaW5kZXggLSAxXT8uaXNWYWx1ZVRva2VuKClcclxuICAgICAgICAgICAgJiZ0b2tlbj8uaXNWYWx1ZVRva2VuKCkmJnRva2VuLnZhbHVlPj0wP2luZGV4Om51bGxcclxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcclxuICAgIH1cclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcclxuICAgICAgICBjb25zdCByZWdFeHB2YWx1ZSA9ICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcclxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgICovXHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbntcclxuICAgIHR5cGU6IHN0cmluZztcclxuICAgIHZhbHVlPzogc3RyaW5nfG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih0eXBlOnN0cmluZyAsdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZCl7XHJcbiAgICAgICAgdGhpcy50eXBlPXR5cGU7XHJcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgICAgICB0aGlzLmluc3VyUHJvcGVyRm9ybWF0dGluZygpXHJcbiAgICB9XHJcbiAgICBpbnN1clByb3BlckZvcm1hdHRpbmcoKXtcclxuICAgICAgICBpZiAoIXRoaXMuaXNWYWx1ZVRva2VuKCkmJnR5cGVvZiB0aGlzLnZhbHVlPT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgIHRoaXMudmFsdWU9c2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHModGhpcy52YWx1ZSk/Lm5hbWVcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TGF0ZXhTeW1ib2woKXtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJz9zZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMudmFsdWUpPy5sYXRleDp1bmRlZmluZWR9XHJcblxyXG4gICAgZ2V0ZnVsbFR5cGUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50eXBlXHJcbiAgICB9XHJcbiAgICBjbG9uZSgpe1xyXG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW4odGhpcy50eXBlLCB0aGlzLnZhbHVlKVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBpc1N0cmluZygpe3JldHVybiB0aGlzLnR5cGU9PT0ncGFyZW4nfHx0aGlzLnR5cGU9PT0nb3BlcmF0b3InfVxyXG5cclxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cclxuXHJcbiAgICB0b1N0cmluZ0xhdGV4KCl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmICh0aGlzLmlzU3RyaW5nKCkpXHJcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy5nZXRMYXRleFN5bWJvbCgpXHJcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdudW1iZXInKSBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZ1xyXG4gICAgfVxyXG4gICAgYWZmZWN0ZWRPcGVyYXRvclJhbmdlKGRpcmVjdGlvbjogc3RyaW5nKXtcclxuICAgICAgICBpZih0aGlzLnR5cGUhPT0nb3BlcmF0b3InfHx0aGlzLnZhbHVlPT09J0VxdWFscycpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIGlmKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycmJmRpcmVjdGlvbj09PSdsZWZ0JyYmIWlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSh0aGlzLnZhbHVlLCBbLTEsIDFdLHRydWUpKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG59Il19