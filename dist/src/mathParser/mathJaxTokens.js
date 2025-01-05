import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { BracketType } from "src/utils/staticData";
import { findParenIndex, Paren, idParentheses, isOpenParen, isClosedParen } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators } from "../utils/dataManager";
import { parseOperator } from "./mathEngine";
function wrapGroup(group, wrap) {
    switch (wrap) {
        case BracketType.Parentheses:
            return `(${group})`;
        case BracketType.CurlyBraces:
            return `{${group}}`;
        default:
            return group;
    }
}
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
        items = [items];
    }
    const formattedItems = items
        .reduce((acc, item) => {
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
            throw new Error(`Expected item to be a number or variable but received: ${item.value}`);
        }
        return acc;
    }, []);
    return formattedItems;
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
        if (isOperable !== undefined)
            this.isOperable = isOperable;
    }
    static create(operator, groupNum, groups, solution, isOperable) {
        if (operator === "Multiplication") {
            return new MultiplicationOperator(groups, solution);
        }
        return new MathJaxOperator(operator, groupNum, groups, solution, isOperable);
    }
    testGroups(test) {
        return this.groups.map(test);
    }
    mapVariables() {
        return this.groups.map(group => group.hasVariables());
    }
    operatorVariables() {
        return [...new Set(this.groups.map(group => group.groupVariables()).flat())];
    }
    clone() {
        const groups = this.groups.map(group => group.clone());
        const solution = this.solution ? this.solution.clone() : undefined;
        return MathJaxOperator.create(this.operator, this.groupNum, groups, solution, this.isOperable);
    }
    toStringSolution() {
        return this.toString() + ' = ' + this.solution?.toString();
    }
    equals(item) {
        return item instanceof MathJaxOperator &&
            this.operator === item.operator &&
            this.groups.length === item.groups.length &&
            this.groups.every((t, index) => t.equals(item.groups[index]));
    }
    getOccurrenceGroup() { return null; }
    isOccurrenceGroupMatch(testItem) { return false; }
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
    parseMathjaxOperator() {
        parseOperator(this);
    }
}
export class MultiplicationOperator extends MathJaxOperator {
    constructor(groups, solution) {
        super("Multiplication", 2, groups, solution, true);
        this.commutative = true;
        this.removeMultiplicationDepths();
    }
    removeMultiplicationDepths() {
        this.groups.forEach((group) => {
            if (group.singular() && group.getItems()[0] instanceof MultiplicationOperator) {
                const items = group.getItems()[0].groups;
                this.groups.splice(this.groups.indexOf(group), 1, ...items);
            }
        });
    }
    static asOccurrenceGroup(occurrencesCount, occurrencOf) {
        occurrencOf = typeof occurrencOf === "string" ?
            new MathGroup([new Token(occurrencOf)]) : occurrencOf instanceof Token ?
            new MathGroup([occurrencOf]) : occurrencOf;
        return new MultiplicationOperator([new MathGroup([new Token(occurrencesCount)]), occurrencOf]);
    }
    getOccurrenceGroup() {
        const result = this.groups.reduce((acc, item) => {
            if (item.getOperableValue()) {
                acc.totalNum += item.getOperableValue();
            }
            else {
                acc.arr.push(item);
            }
            return acc;
        }, { totalNum: 0, arr: [] });
        return { occurrencesCount: result.totalNum, occurrencOf: result.arr };
    }
    addToOccurrenceGroup(value) {
        const numberGroup = this.groups.find(group => group.singleNumber());
        if (numberGroup) {
            numberGroup.singleTokenSet(value, true);
        }
        else {
            this.groups.push(new MathGroup([new Token(1 + value)]));
        }
    }
    isOccurrenceGroupMatch(testItem) {
        const isValidItem = testItem instanceof Token || testItem instanceof MultiplicationOperator;
        if (!isValidItem) {
            return false;
        }
        const currentGroup = this.getOccurrenceGroup();
        if (!currentGroup)
            return false;
        const currentGroupItems = currentGroup.occurrencOf.flatMap(group => group.getItems());
        if (testItem instanceof Token) {
            const isSingleItemMatch = currentGroupItems.length === 1 && currentGroupItems[0].equals(testItem);
            if (isSingleItemMatch) {
                this.addToOccurrenceGroup(1);
            }
            return isSingleItemMatch;
        }
        const testItemGroup = testItem.getOccurrenceGroup();
        if (!testItemGroup)
            return false;
        const testItemGroupItems = testItemGroup.occurrencOf;
        const areGroupsMatching = currentGroupItems.length === testItemGroupItems.length &&
            currentGroup.occurrencOf.every((currentSubGroup) => testItemGroupItems.some((testSubGroup) => currentSubGroup.isOccurrenceGroupMatch(testSubGroup)));
        return false; /*
        if (areGroupsMatching) {
            console.log(testItemGroup.occurrencesCount)
            this.addToOccurrenceGroup(testItemGroup.occurrencesCount);
            return true;
        }
    
        return false;*/
    }
    toString(customFormatter) {
        const operator = '\\cdot ';
        let string = '';
        const toAddCdot = (thisGroup, nextGroup) => {
            if (!nextGroup)
                return false;
            if ((thisGroup.singleNumber() && nextGroup.isSingleVar()) || (thisGroup.isSingleVar() && nextGroup.singleNumber()))
                return false;
            return true;
        };
        const reorderedGroups = this.groups.sort((a, b) => {
            if (a.singleNumber() && !b.singleNumber())
                return -1;
            if (!a.singleNumber() && b.singleNumber())
                return 1;
            if (a.singular() && !b.singular())
                return -1;
            if (!a.singular() && b.singular())
                return 1;
            return 0;
        });
        reorderedGroups.forEach((group, index) => {
            string += wrapGroup(group.toString(), group.singular() ? BracketType.None : BracketType.Parentheses);
            if (toAddCdot(group, reorderedGroups[index + 1]))
                string += operator;
        });
        if (customFormatter)
            return customFormatter(this, string);
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
    parseMathjaxOperator() {
        const mathGroupItems = [];
        for (let i = 0; i < this.groups.length; i++) {
            const groupA = this.groups[i].getItems();
            // Determine which groups to pair with
            for (let j = i + 1; j < this.groups.length; j++) {
                const groupB = this.groups[j].getItems();
                // Generate pairwise products
                for (let a of groupA) {
                    for (let b of groupB) {
                        console.log(this.parse(a, b));
                        mathGroupItems.push(this.parse(a, b));
                    }
                }
            }
        }
        this.solution = new MathGroup(mathGroupItems);
    }
    parse(group1, group2) {
        if (group1 instanceof Token && group2 instanceof Token && !group1.isVar() && !group2.isVar()) {
            return new Token(group1.getNumberValue() * group2.getNumberValue());
        }
        let arr = [new MathGroup([group1.clone()]), new MathGroup([group2.clone()])];
        arr.forEach((group, index) => {
            arr = arr.filter((otherGroup, otherIndex) => {
                if (index === otherIndex)
                    return true;
                const isMatch = group.isPowGroupMatch(otherGroup);
                return !isMatch;
            });
        });
        if (arr.length > 1) {
            return MathJaxOperator.create('Multiplication', 2, arr);
        }
        if (arr.length === 0)
            throw new Error("");
        const group = arr[0];
        if (group.singular())
            return group.getItems()[0];
        throw new Error("");
    }
}
function trigonometricIdentities() {
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
    replaceItemCell(item, index) {
        this.items.splice(index, 1, ...ensureAcceptableFormatForMathGroupItems(item));
    }
    setItems(items) {
        this.items = ensureAcceptableFormatForMathGroupItems(items);
        this.updateOverview();
    }
    groupVariables() {
        const variables = [];
        this.items.forEach((item) => {
            if (item instanceof Token && item.isVar()) {
                const key = item.getStringValue();
                if (!variables.contains(key)) {
                    variables.push(key);
                }
            }
        });
        return variables;
    }
    updateOverview() {
    }
    singleTokenSet(value, toAdd) {
        const token = this.items[0];
        const newValue = toAdd ? value + token.getNumberValue() : value;
        if (this.singuleToken()) {
            token.setValue(newValue);
        }
    }
    clone() {
        return new MathGroup(this.items.map(item => item.clone()));
    }
    hasOperator() { return this.items.some((item) => item instanceof MathJaxOperator); }
    doesntHaveOperator() { return !this.hasOperator(); }
    singleNumber() { return this.singular() && this.numberOnly(); }
    numberOnly() { return this.items.every(t => (t instanceof Token && !t.isVar())); }
    hasVariables() { return this.items.some(t => t instanceof Token && t.isVar()); }
    singular() { return this.items.length === 1 && this.items[0] !== undefined; }
    singuleToken() { return this.singular() && this.items[0] instanceof Token; }
    isOperable() { return true; }
    getOperableValue() {
        const items = this.items;
        if (this.numberOnly()) {
            let value = 0;
            items.forEach((item) => {
                value += item.getNumberValue();
            });
            return value;
        }
        return null;
    }
    isSingleVar() {
        const token = this.items[0];
        return this.singuleToken() && token.isVar();
    }
    getSingleVar() {
        if (!this.isSingleVar())
            return null;
        return this.items[0].getStringValue();
    }
    isPowGroupMatch(group) {
        if (this.items.length !== 1)
            return false;
        if (this.isSingleVar() && group.isSingleVar() && this.equals(group)) {
            this.items = [MathJaxOperator.create("Power", 2, [new MathGroup(this.items[0]), new MathGroup(new Token(2))])];
            return true;
        }
        return this.equals(group);
    }
    isOccurrenceGroupMatch(item) {
        //Placeholder for now
        return this.equals(item);
    }
    equals(item) {
        if (item instanceof Token) {
            return this.items.length === 1 && this.items[0] instanceof Token && this.items[0].equals(item);
        }
        if (item instanceof MathJaxOperator) {
            return this.items.length === 1 && this.items[0] instanceof MathJaxOperator && this.items[0].equals(item);
        }
        if (item instanceof MathGroup) {
            return this.items.length === item.items.length && this.items.every((t) => {
                return item.items.some((i) => t.equals(i));
            });
        }
        return false;
    }
    getId() {
        return 'MathGroup';
    }
    combiningLikeTerms() {
        const overview = new MathOverview();
        overview.defineOverviewSeparateIntoIndividuals(this.items);
        this.setItems(overview.reconstructAsMathGroupItems());
        console.log("befor", this.items, this.toString(), this.items.map(t => t instanceof MultiplicationOperator));
        this.items.forEach((item, index) => {
            if (item instanceof MultiplicationOperator) {
                this.items = this.items.filter((otherItem, otherIndex) => {
                    if (index === otherIndex)
                        return true;
                    const isMatch = item.isOccurrenceGroupMatch(otherItem);
                    console.log(item, otherItem, isMatch);
                    return !isMatch; // Remove matched items
                });
            }
        });
        console.log("after", this.items, this.toString());
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
class MathOverview {
    variables;
    operators;
    number;
    getNumber() { return this.number; }
    getVariables() { return this.variables; }
    getOperators() { return this.operators; }
    constructor(variables, operators, number) {
        if (variables)
            this.variables = variables;
        if (operators)
            this.operators = operators;
        if (number)
            this.number = number;
    }
    defineOverviewSeparateIntoIndividuals(items) {
        this.variables = new Map();
        this.operators = new Map();
        items.forEach(item => {
            switch (true) {
                case item instanceof Token && item.isVar():
                    this.updateVariablesMap(item.getStringValue());
                    break;
                case item instanceof Token && !item.isVar():
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
    updateMumber(number) { this.number = this.number ? this.number + number : number; }
    updateVariablesMap(key) {
        this.variables ??= new Map();
        if (!this.variables.has(key)) {
            this.variables.set(key, { count: 0 });
        }
        this.variables.get(key).count++;
    }
    updateOperatorsMap(operator) {
        const key = operator.operator;
        if (!this.operators)
            this.operators = new Map();
        if (!this.operators.has(key)) {
            this.operators.set(key, { count: 0, items: [] });
        }
        const entry = this.operators.get(key);
        entry.count += 1;
        entry.items.push(operator);
    }
    hasVar() { return this.variables && this.variables.size > 0; }
    hasOp() { return this.operators && this.operators.size > 0; }
    onlyNumeric() {
        return this.number && !this.hasVar() && !this.hasOp();
    }
    reconstructAsMathGroupItems() {
        const items = [];
        if (this.number)
            items.push(new Token(this.number));
        this.variables.forEach((value, key) => {
            if (value.count === 1) {
                items.push(new Token(key));
            }
            else if (value.count > 1) {
                items.push(MultiplicationOperator.asOccurrenceGroup(value.count, key));
            }
        });
        if (this.operators) {
            items.push(...Array.from(this.operators.values()).flatMap((operator) => operator.items));
        }
        return items;
    }
}
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
    equals(item) {
        return item instanceof Token && this.value === item.value;
    }
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
            return !(idx > 0 &&
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUFtRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5JLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUV4UixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRTdDLFNBQVMsU0FBUyxDQUFDLEtBQWEsRUFBRSxJQUFpQjtJQUMvQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ1gsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEIsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEI7WUFDSSxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FDOUIsU0FBYyxFQUNkLFNBQWlDLEVBQ2pDLE9BQTRCLEVBQUU7SUFFOUIsNERBQTREO0lBQzVELElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG1FQUFtRTtJQUNuRSxJQUFJLEtB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Q1QsSUFBSSxNQUFNLEdBQUMsRUFBRSxDQUFBO1FBQ2IsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2YsTUFBTSxJQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQTtRQUNqQyxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUcsUUFBUTtZQUFFLE1BQU0sSUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQzdDLE9BQU8sTUFBTSxDQUFBO0lBQ2pCLENBQUM7SUFDRCxxQkFBcUIsQ0FBQyxTQUFpQjtRQUNuQyxJQUFHLElBQUksQ0FBQyxJQUFJLEtBQUcsVUFBVSxJQUFFLElBQUksQ0FBQyxLQUFLLEtBQUcsUUFBUTtZQUM1QyxPQUFPLEtBQUssQ0FBQTtRQUNoQixJQUFHLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBRyxRQUFRLElBQUUsU0FBUyxLQUFHLE1BQU0sSUFBRSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBQyxJQUFJLENBQUM7WUFDdkcsT0FBTyxLQUFLLENBQUE7UUFDaEIsT0FBTyxJQUFJLENBQUE7SUFDZixDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi9pbVZlcnlMYXp5XCI7XG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCByZWdFeHAgfSBmcm9tIFwiLi4vdGlrempheC90aWt6amF4XCI7XG5pbXBvcnQgeyBBc3NvY2lhdGl2aXR5LCBCcmFja2V0VHlwZSwgTWF0aEpheE9wZXJhdG9yTWV0YWRhdGEsIG1hdGhKYXhPcGVyYXRvcnNNZXRhZGF0YSwgT3BlcmF0b3JUeXBlIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XG5cbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzLCBpc09wZW5QYXJlbiwgaXNDbG9zZWRQYXJlbiB9IGZyb20gXCIuLi91dGlscy90b2tlblV0ZW5zaWxzXCI7XG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIGlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSwgc2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHMsIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcblxuaW1wb3J0IHsgcGFyc2VPcGVyYXRvciB9IGZyb20gXCIuL21hdGhFbmdpbmVcIjtcblxuZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBzdHJpbmcsIHdyYXA6IEJyYWNrZXRUeXBlKTogc3RyaW5nIHtcbiAgICBzd2l0Y2ggKHdyYXApIHtcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5QYXJlbnRoZXNlczpcbiAgICAgICAgICAgIHJldHVybiBgKCR7Z3JvdXB9KWA7XG4gICAgICAgIGNhc2UgQnJhY2tldFR5cGUuQ3VybHlCcmFjZXM6XG4gICAgICAgICAgICByZXR1cm4gYHske2dyb3VwfX1gO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIGdyb3VwO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZXBTZWFyY2hXaXRoUGF0aChcbiAgICBzdHJ1Y3R1cmU6IGFueSxcbiAgICBwcmVkaWNhdGU6IChpdGVtOiBhbnkpID0+IGJvb2xlYW4sXG4gICAgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdXG4pOiB7IGl0ZW06IGFueTsgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSB9IHwgbnVsbCB7XG4gICAgLy8gQmFzZSBjYXNlOiBJZiB0aGUgY3VycmVudCBzdHJ1Y3R1cmUgbWF0Y2hlcyB0aGUgcHJlZGljYXRlXG4gICAgaWYgKHByZWRpY2F0ZShzdHJ1Y3R1cmUpKSB7XG4gICAgICAgIHJldHVybiB7IGl0ZW06IHN0cnVjdHVyZSwgcGF0aCB9O1xuICAgIH1cblxuICAgIC8vIElmIGl0J3MgYW4gYXJyYXksIHJlY3Vyc2l2ZWx5IHNlYXJjaCBlYWNoIGVsZW1lbnQgd2l0aCBpdHMgaW5kZXhcbiAgICBpZiAoQXJyYXkuaXNBcnJheShzdHJ1Y3R1cmUpKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RydWN0dXJlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2ldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBpXSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSWYgaXQncyBhbiBvYmplY3QsIHJlY3Vyc2l2ZWx5IHNlYXJjaCBpdHMgcHJvcGVydGllcyB3aXRoIHRoZWlyIGtleXNcbiAgICBpZiAoc3RydWN0dXJlICE9PSBudWxsICYmIHR5cGVvZiBzdHJ1Y3R1cmUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gc3RydWN0dXJlKSB7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0cnVjdHVyZSwga2V5KSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVba2V5XSwgcHJlZGljYXRlLCBbLi4ucGF0aCwga2V5XSk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIElmIG5vIG1hdGNoIGlzIGZvdW5kXG4gICAgcmV0dXJuIG51bGw7XG59XG50eXBlIGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwPU1hdGhHcm91cEl0ZW18TWF0aEdyb3VwfEJhc2ljTWF0aEpheFRva2VuXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKTogTWF0aEdyb3VwSXRlbVtdIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG4gICAgICAgIGl0ZW1zID0gW2l0ZW1zXTtcbiAgICB9XG5cbiAgICBjb25zdCBmb3JtYXR0ZWRJdGVtcyA9IGl0ZW1zXG4gICAgICAgIC5yZWR1Y2UoKGFjYzogTWF0aEdyb3VwSXRlbVtdLCBpdGVtOiBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciB8IEJhc2ljTWF0aEpheFRva2VuKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhY2MuY29uY2F0KGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtLmdldEl0ZW1zKCkpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSB7XG4gICAgICAgICAgICAgICAgYWNjLnB1c2goaXRlbSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbikge1xuICAgICAgICAgICAgICAgIGlmIChpdGVtLnZhbHVlICYmIChpdGVtLnR5cGUgPT09IFwibnVtYmVyXCIgfHwgaXRlbS50eXBlID09PSBcInZhcmlhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFjYy5wdXNoKG5ldyBUb2tlbihpdGVtLnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgYEV4cGVjdGVkIGl0ZW0gdG8gYmUgYSBudW1iZXIgb3IgdmFyaWFibGUgYnV0IHJlY2VpdmVkOiAke2l0ZW0udmFsdWV9YFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9LCBbXSlcblxuICAgIHJldHVybiBmb3JtYXR0ZWRJdGVtcztcbn1cbmZ1bmN0aW9uIHNob3VsZEFkZFBsdXMoZ3JvdXAxPzogYW55LGdyb3VwMj86IGFueSl7XG4gICAgaWYoIWdyb3VwMXx8IWdyb3VwMilyZXR1cm4gJyc7XG5cbiAgICByZXR1cm4gJysnO1xufVxuXG5mdW5jdGlvbiBjYW5Db21iaW5lKG1hdGg6IE1hdGhHcm91cCxvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcblxufVxuZXhwb3J0IGNsYXNzIE1hdGhKYXhPcGVyYXRvciB7XG4gICAgb3BlcmF0b3I6IHN0cmluZztcbiAgICBncm91cE51bTogbnVtYmVyID0gMTtcbiAgICBncm91cHM6IE1hdGhHcm91cFtdO1xuICAgIHNvbHV0aW9uOiBNYXRoR3JvdXA7XG4gICAgY29tbXV0YXRpdmU6IGJvb2xlYW47XG4gICAgaXNPcGVyYWJsZTogYm9vbGVhbiA9IHRydWU7XG5cbiAgICBjb25zdHJ1Y3RvcihvcGVyYXRvcj86IHN0cmluZywgZ3JvdXBOdW0/OiBudW1iZXIsIGdyb3Vwcz86IE1hdGhHcm91cFtdLCBzb2x1dGlvbj86IE1hdGhHcm91cCwgaXNPcGVyYWJsZT86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKG9wZXJhdG9yKSB0aGlzLm9wZXJhdG9yID0gb3BlcmF0b3I7XG4gICAgICAgIGlmIChncm91cE51bSkgdGhpcy5ncm91cE51bSA9IGdyb3VwTnVtO1xuICAgICAgICBpZiAoZ3JvdXBzKSB0aGlzLmdyb3VwcyA9IGdyb3VwcztcbiAgICAgICAgaWYgKHNvbHV0aW9uKSB0aGlzLnNvbHV0aW9uID0gc29sdXRpb247XG4gICAgICAgIGlmIChpc09wZXJhYmxlICE9PSB1bmRlZmluZWQpIHRoaXMuaXNPcGVyYWJsZSA9IGlzT3BlcmFibGU7XG4gICAgfVxuICAgIHN0YXRpYyBjcmVhdGUob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKTogTWF0aEpheE9wZXJhdG9yIHtcbiAgICAgICAgaWYgKG9wZXJhdG9yID09PSBcIk11bHRpcGxpY2F0aW9uXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihncm91cHMsIHNvbHV0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcihvcGVyYXRvciwgZ3JvdXBOdW0sIGdyb3Vwcywgc29sdXRpb24sIGlzT3BlcmFibGUpO1xuICAgIH1cbiAgICB0ZXN0R3JvdXBzKHRlc3Q6IChncm91cDogTWF0aEdyb3VwKSA9PiBib29sZWFuKTogYm9vbGVhbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcCh0ZXN0KTtcbiAgICB9XG5cbiAgICBtYXBWYXJpYWJsZXMoKTogYm9vbGVhbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5oYXNWYXJpYWJsZXMoKSk7XG4gICAgfVxuXG4gICAgb3BlcmF0b3JWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gWy4uLm5ldyBTZXQodGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmdyb3VwVmFyaWFibGVzKCkpLmZsYXQoKSldO1xuICAgIH1cblxuICAgIGNsb25lKCk6IE1hdGhKYXhPcGVyYXRvciB7XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5jbG9uZSgpKTtcbiAgICAgICAgY29uc3Qgc29sdXRpb24gPSB0aGlzLnNvbHV0aW9uID8gdGhpcy5zb2x1dGlvbi5jbG9uZSgpIDogdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm4gTWF0aEpheE9wZXJhdG9yLmNyZWF0ZSh0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xuICAgIH1cblxuICAgIHRvU3RyaW5nU29sdXRpb24oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKSArICcgPSAnICsgdGhpcy5zb2x1dGlvbj8udG9TdHJpbmcoKTtcbiAgICB9XG5cbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciAmJlxuICAgICAgICAgICAgdGhpcy5vcGVyYXRvciA9PT0gaXRlbS5vcGVyYXRvciAmJlxuICAgICAgICAgICAgdGhpcy5ncm91cHMubGVuZ3RoID09PSBpdGVtLmdyb3Vwcy5sZW5ndGggJiZcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLmV2ZXJ5KCh0LCBpbmRleCkgPT4gdC5lcXVhbHMoaXRlbS5ncm91cHNbaW5kZXhdKSk7XG4gICAgfVxuICAgIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH18bnVsbCAgeyByZXR1cm4gbnVsbDsgfSAgXG4gICAgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0SXRlbTogTWF0aEpheE9wZXJhdG9yIHwgVG9rZW4pOiBib29sZWFuIHtyZXR1cm4gZmFsc2U7fVxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xuICAgICAgICBmdW5jdGlvbiB3cmFwR3JvdXAoZ3JvdXA6IE1hdGhHcm91cCwgd3JhcDogQnJhY2tldFR5cGUsb3B0aW9uYWw6IGJvb2xlYW4pOiBzdHJpbmcge1xuICAgICAgICAgICAgaWYob3B0aW9uYWwmJmdyb3VwLnNpbmd1bGFyKCkpcmV0dXJuIGdyb3VwLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XG4gICAgICAgICAgICBjb25zdCBncm91cFN0cj1ncm91cC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpXG4gICAgICAgICAgICBzd2l0Y2ggKHdyYXApIHtcbiAgICAgICAgICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLlBhcmVudGhlc2VzOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCgke2dyb3VwU3RyfSlgO1xuICAgICAgICAgICAgICAgIGNhc2UgQnJhY2tldFR5cGUuQ3VybHlCcmFjZXM6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgeyR7Z3JvdXBTdHJ9fWA7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdyb3VwU3RyO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuXG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLm9wZXJhdG9yKTtcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuICcnO1xuICAgICAgICBpZihtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9ucz4yfHxtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uczwxKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBudW1iZXIgb2YgcG9zaXRpb25zIGZvciBhc3NvY2lhdGl2aXR5OiAke21ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBtZXRhZGF0YS5sYXRleDtcbiAgICAgICAgbGV0IGluZGV4PTA7XG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcblxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyx0cnVlKS5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleC0xXSx0aGlzLmdyb3Vwc1tpbmRleF0pK3dyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0sIGl0ZW0uYnJhY2tldFR5cGUsIGl0ZW0uaXNCcmFja2V0T3B0aW9uYWwpO1xuICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyxmYWxzZSkuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXhdLHRoaXMuZ3JvdXBzW2luZGV4KzFdKSt3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLCBpdGVtLmJyYWNrZXRUeXBlLCBpdGVtLmlzQnJhY2tldE9wdGlvbmFsKTtcbiAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcbiAgICAgICAgcmV0dXJuIHN0cmluZy50cmltKCk7XG4gICAgfVxuICAgIHBhcnNlTWF0aGpheE9wZXJhdG9yKCkge1xuICAgICAgICBwYXJzZU9wZXJhdG9yKHRoaXMpO1xuICAgIH1cbn1cblxuXG5leHBvcnQgY2xhc3MgTXVsdGlwbGljYXRpb25PcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvciB7XG4gICAgY29uc3RydWN0b3IoZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwKSB7XG4gICAgICAgIHN1cGVyKFwiTXVsdGlwbGljYXRpb25cIiwgMiwgZ3JvdXBzLCBzb2x1dGlvbiwgdHJ1ZSk7XG4gICAgICAgIHRoaXMuY29tbXV0YXRpdmUgPSB0cnVlO1xuICAgICAgICB0aGlzLnJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCk7XG4gICAgfVxuICAgIHJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCl7XG4gICAgICAgIHRoaXMuZ3JvdXBzLmZvckVhY2goKGdyb3VwOiBNYXRoR3JvdXApID0+IHtcbiAgICAgICAgICAgIGlmKGdyb3VwLnNpbmd1bGFyKCkmJmdyb3VwLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKXtcbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtcz0oZ3JvdXAuZ2V0SXRlbXMoKVswXSBhcyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKS5ncm91cHM7XG4gICAgICAgICAgICAgICAgdGhpcy5ncm91cHMuc3BsaWNlKHRoaXMuZ3JvdXBzLmluZGV4T2YoZ3JvdXApLDEsLi4uaXRlbXMpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHN0YXRpYyBhc09jY3VycmVuY2VHcm91cChvY2N1cnJlbmNlc0NvdW50OiBudW1iZXIsb2NjdXJyZW5jT2Y6IHN0cmluZ3xUb2tlbnxNYXRoR3JvdXApOiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yIHtcbiAgICAgICAgb2NjdXJyZW5jT2Y9dHlwZW9mIG9jY3VycmVuY09mPT09XCJzdHJpbmdcIj9cbiAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNPZildKTpvY2N1cnJlbmNPZiBpbnN0YW5jZW9mIFRva2VuP1xuICAgICAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW29jY3VycmVuY09mXSk6b2NjdXJyZW5jT2Y7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKFtuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jZXNDb3VudCldKSxvY2N1cnJlbmNPZl0pXG4gICAgfVxuICAgIFxuICAgIG92ZXJyaWRlIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH0ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjOiB7IHRvdGFsTnVtOiBudW1iZXI7IGFycjogTWF0aEdyb3VwW10gfSwgaXRlbTogTWF0aEdyb3VwKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uZ2V0T3BlcmFibGVWYWx1ZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFjYy50b3RhbE51bSArPSBpdGVtLmdldE9wZXJhYmxlVmFsdWUoKSE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYWNjLmFyci5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgdG90YWxOdW06IDAsIGFycjogW10gfVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4geyBvY2N1cnJlbmNlc0NvdW50OiByZXN1bHQudG90YWxOdW0sIG9jY3VycmVuY09mOiByZXN1bHQuYXJyIH07XG4gICAgfVxuXG4gICAgYWRkVG9PY2N1cnJlbmNlR3JvdXAodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBudW1iZXJHcm91cCA9IHRoaXMuZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuc2luZ2xlTnVtYmVyKCkpO1xuICAgICAgICBpZiAobnVtYmVyR3JvdXApIHtcbiAgICAgICAgICAgIG51bWJlckdyb3VwLnNpbmdsZVRva2VuU2V0KHZhbHVlLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnB1c2gobmV3IE1hdGhHcm91cChbbmV3IFRva2VuKDEgKyB2YWx1ZSldKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvdmVycmlkZSBpc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RJdGVtOiBNYXRoSmF4T3BlcmF0b3IgfCBUb2tlbik6IGJvb2xlYW4ge1xuICAgICAgICBcbiAgICAgICAgY29uc3QgaXNWYWxpZEl0ZW0gPSB0ZXN0SXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IHRlc3RJdGVtIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcjtcbiAgICAgICAgaWYgKCFpc1ZhbGlkSXRlbSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIGNvbnN0IGN1cnJlbnRHcm91cCA9IHRoaXMuZ2V0T2NjdXJyZW5jZUdyb3VwKCk7XG4gICAgICAgIGlmICghY3VycmVudEdyb3VwKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgICAgIGNvbnN0IGN1cnJlbnRHcm91cEl0ZW1zID0gY3VycmVudEdyb3VwLm9jY3VycmVuY09mLmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAuZ2V0SXRlbXMoKSk7XG4gICAgXG4gICAgICAgIGlmICh0ZXN0SXRlbSBpbnN0YW5jZW9mIFRva2VuKSB7XG4gICAgICAgICAgICBjb25zdCBpc1NpbmdsZUl0ZW1NYXRjaCA9IGN1cnJlbnRHcm91cEl0ZW1zLmxlbmd0aCA9PT0gMSAmJiBjdXJyZW50R3JvdXBJdGVtc1swXS5lcXVhbHModGVzdEl0ZW0pO1xuICAgICAgICAgICAgaWYgKGlzU2luZ2xlSXRlbU1hdGNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRUb09jY3VycmVuY2VHcm91cCgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBpc1NpbmdsZUl0ZW1NYXRjaDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0ZXN0SXRlbUdyb3VwID0gdGVzdEl0ZW0uZ2V0T2NjdXJyZW5jZUdyb3VwKCk7XG4gICAgICAgIGlmICghdGVzdEl0ZW1Hcm91cCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cEl0ZW1zID0gdGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNPZjtcbiAgICBcbiAgICAgICAgY29uc3QgYXJlR3JvdXBzTWF0Y2hpbmcgPWN1cnJlbnRHcm91cEl0ZW1zLmxlbmd0aCA9PT0gdGVzdEl0ZW1Hcm91cEl0ZW1zLmxlbmd0aCAmJlxuICAgICAgICAgICAgY3VycmVudEdyb3VwLm9jY3VycmVuY09mLmV2ZXJ5KChjdXJyZW50U3ViR3JvdXA6IE1hdGhHcm91cCkgPT5cbiAgICAgICAgICAgICAgICB0ZXN0SXRlbUdyb3VwSXRlbXMuc29tZSgodGVzdFN1Ykdyb3VwOiBNYXRoR3JvdXApID0+IFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50U3ViR3JvdXAuaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0U3ViR3JvdXApXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlLypcbiAgICAgICAgaWYgKGFyZUdyb3Vwc01hdGNoaW5nKSB7IFxuICAgICAgICAgICAgY29uc29sZS5sb2codGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNlc0NvdW50KVxuICAgICAgICAgICAgdGhpcy5hZGRUb09jY3VycmVuY2VHcm91cCh0ZXN0SXRlbUdyb3VwLm9jY3VycmVuY2VzQ291bnQpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgcmV0dXJuIGZhbHNlOyovXG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7IFxuICAgICAgICBjb25zdCBvcGVyYXRvciA9ICdcXFxcY2RvdCAnO1xuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XG4gICAgICAgIGNvbnN0IHRvQWRkQ2RvdD0odGhpc0dyb3VwOiBNYXRoR3JvdXAsbmV4dEdyb3VwPzpNYXRoR3JvdXApPT57XG4gICAgICAgICAgICBpZighbmV4dEdyb3VwKXJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGlmKCh0aGlzR3JvdXAuc2luZ2xlTnVtYmVyKCkmJm5leHRHcm91cC5pc1NpbmdsZVZhcigpKXx8KHRoaXNHcm91cC5pc1NpbmdsZVZhcigpJiZuZXh0R3JvdXAuc2luZ2xlTnVtYmVyKCkpKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVvcmRlcmVkR3JvdXBzPXRoaXMuZ3JvdXBzLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIGlmIChhLnNpbmdsZU51bWJlcigpICYmICFiLnNpbmdsZU51bWJlcigpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoIWEuc2luZ2xlTnVtYmVyKCkgJiYgYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIDE7XG4gICAgICAgIFxuICAgICAgICAgICAgaWYgKGEuc2luZ3VsYXIoKSAmJiAhYi5zaW5ndWxhcigpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoIWEuc2luZ3VsYXIoKSAmJiBiLnNpbmd1bGFyKCkpIHJldHVybiAxO1xuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVvcmRlcmVkR3JvdXBzLmZvckVhY2goKGdyb3VwLGluZGV4KSA9PiB7XG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKGdyb3VwLnRvU3RyaW5nKCksIGdyb3VwLnNpbmd1bGFyKCk/QnJhY2tldFR5cGUuTm9uZTpCcmFja2V0VHlwZS5QYXJlbnRoZXNlcyk7XG4gICAgICAgICAgICBpZiAodG9BZGRDZG90KGdyb3VwLHJlb3JkZXJlZEdyb3Vwc1tpbmRleCsxXSkpXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xuICAgIH1cblxuICAgIC8qXG4gICAgdGhpcy5ncm91cHMgPSBbWzEsIDIsIDNdLFs0LCA1LCA2XSxbNywgOCwgOV1dXG4gICAgRXhwZWN0ZWQgT3V0cHV0OlxuICAgIFtcbiAgICAgICAgMSo0LCAxKjUsIDEqNiwgMSo3LCAxKjgsIDEqOSxcbiAgICAgICAgMio0LCAyKjUsIDIqNiwgMio3LCAyKjgsIDIqOSxcbiAgICAgICAgMyo0LCAzKjUsIDMqNiwgMyo3LCAzKjgsIDMqOSxcbiAgICAgICAgNCo3LCA0KjgsIDQqOSxcbiAgICAgICAgNSo3LCA1KjgsIDUqOSxcbiAgICAgICAgNio3LCA2KjgsIDYqOVxuICAgIF0gIFxuICAgICovXG5cbiAgICBwYXJzZU1hdGhqYXhPcGVyYXRvcigpOiB2b2lkIHtcblxuICAgICAgICBjb25zdCBtYXRoR3JvdXBJdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5ncm91cHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQSA9IHRoaXMuZ3JvdXBzW2ldLmdldEl0ZW1zKCk7XG5cbiAgICAgICAgICAgIC8vIERldGVybWluZSB3aGljaCBncm91cHMgdG8gcGFpciB3aXRoXG4gICAgICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCB0aGlzLmdyb3Vwcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwQiA9IHRoaXMuZ3JvdXBzW2pdLmdldEl0ZW1zKCk7XG5cbiAgICAgICAgICAgICAgICAvLyBHZW5lcmF0ZSBwYWlyd2lzZSBwcm9kdWN0c1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGEgb2YgZ3JvdXBBKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGIgb2YgZ3JvdXBCKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyh0aGlzLnBhcnNlKGEsIGIpKVxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0aEdyb3VwSXRlbXMucHVzaCh0aGlzLnBhcnNlKGEsIGIpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNvbHV0aW9uID0gbmV3IE1hdGhHcm91cChtYXRoR3JvdXBJdGVtcyk7XG4gICAgfVxuICAgIFxuXG4gICAgcGFyc2UoZ3JvdXAxOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3IsZ3JvdXAyOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3IpOk1hdGhHcm91cEl0ZW17XG4gICAgICAgIGlmKGdyb3VwMSBpbnN0YW5jZW9mIFRva2VuJiZncm91cDIgaW5zdGFuY2VvZiBUb2tlbiYmIWdyb3VwMS5pc1ZhcigpJiYhZ3JvdXAyLmlzVmFyKCkpe1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBUb2tlbihncm91cDEuZ2V0TnVtYmVyVmFsdWUoKSpncm91cDIuZ2V0TnVtYmVyVmFsdWUoKSlcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgbGV0IGFycj0gW25ldyBNYXRoR3JvdXAoW2dyb3VwMS5jbG9uZSgpXSksbmV3IE1hdGhHcm91cChbZ3JvdXAyLmNsb25lKCldKV1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICBhcnIuZm9yRWFjaCgoZ3JvdXA6IE1hdGhHcm91cCwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgYXJyID0gYXJyLmZpbHRlcigob3RoZXJHcm91cDogTWF0aEdyb3VwLCBvdGhlckluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2ggPSBncm91cC5pc1Bvd0dyb3VwTWF0Y2gob3RoZXJHcm91cCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICFpc01hdGNoO1xuICAgICAgICAgICAgfSk7IFxuICAgICAgICB9KTtcbiAgICAgICAgaWYoYXJyLmxlbmd0aD4xKXtcbiAgICAgICAgICAgIHJldHVybiBNYXRoSmF4T3BlcmF0b3IuY3JlYXRlKCdNdWx0aXBsaWNhdGlvbicsMixhcnIpXG4gICAgICAgIH1cbiAgICAgICAgaWYoYXJyLmxlbmd0aD09PTApXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcIik7XG4gICAgICAgIGNvbnN0IGdyb3VwPWFyclswXTtcbiAgICAgICAgaWYoZ3JvdXAuc2luZ3VsYXIoKSlcbiAgICAgICAgICAgIHJldHVybiBncm91cC5nZXRJdGVtcygpWzBdO1xuXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlwiKTtcbiAgICB9XG59XG5mdW5jdGlvbiB0cmlnb25vbWV0cmljSWRlbnRpdGllcygpe1xuXG59XG5cbmV4cG9ydCB0eXBlIE1hdGhHcm91cEl0ZW09VG9rZW58TWF0aEpheE9wZXJhdG9yXG5cbmV4cG9ydCBjbGFzcyBNYXRoR3JvdXAge1xuICAgIHByaXZhdGUgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSA9IFtdO1xuICAgIC8vb3ZlcnZpZXc6IE1hdGhPdmVydmlld1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKGl0ZW1zPzogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSkge1xuICAgICAgICBpZihpdGVtcyl0aGlzLnNldEl0ZW1zKGl0ZW1zKTtcbiAgICB9XG4gICAgZ2V0SXRlbXMoKTogTWF0aEdyb3VwSXRlbVtdIHtyZXR1cm4gdGhpcy5pdGVtczt9XG4gICAgc2V0SXRlbShpdGVtOiBNYXRoR3JvdXBJdGVtLGluZGV4Om51bWJlcil7XG4gICAgICAgIHRoaXMuaXRlbXNbaW5kZXhdPWl0ZW07XG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKVxuICAgIH1cbiAgICByZXBsYWNlSXRlbUNlbGwoaXRlbTogTWF0aEdyb3VwSXRlbXxNYXRoR3JvdXAsaW5kZXg6bnVtYmVyKXtcbiAgICAgICAgdGhpcy5pdGVtcy5zcGxpY2UoaW5kZXgsMSwuLi5lbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbSkpXG4gICAgfVxuICAgIHNldEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XG4gICAgICAgIHRoaXMuaXRlbXMgPSBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXMpO1xuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KCkgICAgXG4gICAgfVxuICAgIGdyb3VwVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcbiAgICAgICAgY29uc3QgdmFyaWFibGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW06IE1hdGhHcm91cEl0ZW0pID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gJiYgaXRlbS5pc1ZhcigpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5nZXRTdHJpbmdWYWx1ZSgpO1xuICAgICAgICAgICAgICAgIGlmICghdmFyaWFibGVzLmNvbnRhaW5zKGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyaWFibGVzLnB1c2goa2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdmFyaWFibGVzO1xuICAgIH1cbiAgICBcbiAgICB1cGRhdGVPdmVydmlldygpey8qXG4gICAgICAgIHRoaXMub3ZlcnZpZXc9bmV3IE1hdGhPdmVydmlldygpXG4gICAgICAgIHRoaXMub3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdzZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKSovXG4gICAgfVxuICAgIHNpbmdsZVRva2VuU2V0KHZhbHVlOiBudW1iZXIsdG9BZGQ/OiBib29sZWFuKXtcbiAgICAgICAgY29uc3QgdG9rZW49dGhpcy5pdGVtc1swXSBhcyBUb2tlbjtcbiAgICAgICAgY29uc3QgbmV3VmFsdWU9dG9BZGQ/dmFsdWUrdG9rZW4uZ2V0TnVtYmVyVmFsdWUoKTp2YWx1ZTtcbiAgICAgICAgaWYodGhpcy5zaW5ndWxlVG9rZW4oKSl7XG4gICAgICAgICAgICB0b2tlbi5zZXRWYWx1ZShuZXdWYWx1ZSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBjbG9uZSgpOiBNYXRoR3JvdXAge1xuICAgICAgICByZXR1cm4gbmV3IE1hdGhHcm91cCh0aGlzLml0ZW1zLm1hcChpdGVtPT5pdGVtLmNsb25lKCkpKTtcbiAgICB9XG5cbiAgICBoYXNPcGVyYXRvcigpOiB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKTt9XG4gICAgZG9lc250SGF2ZU9wZXJhdG9yKCk6ICB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gIXRoaXMuaGFzT3BlcmF0b3IoKTt9XG4gICAgc2luZ2xlTnVtYmVyKCl7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSYmdGhpcy5udW1iZXJPbmx5KCl9XG4gICAgbnVtYmVyT25seSgpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5ldmVyeSh0ID0+ICh0IGluc3RhbmNlb2YgVG9rZW4mJiF0LmlzVmFyKCkpKTt9XG4gICAgaGFzVmFyaWFibGVzKCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiB0IGluc3RhbmNlb2YgVG9rZW4mJnQuaXNWYXIoKSk7fVxuXG4gICAgc2luZ3VsYXIoKTpib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGggPT09IDEgJiYgdGhpcy5pdGVtc1swXSAhPT0gdW5kZWZpbmVkO31cbiAgICBzaW5ndWxlVG9rZW4oKTogdGhpcyBpcyB7IGl0ZW1zOiBbVG9rZW5dIH0ge3JldHVybiB0aGlzLnNpbmd1bGFyKCkgJiYgdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuO31cbiAgICBpc09wZXJhYmxlKCl7cmV0dXJuIHRydWV9XG5cbiAgICBnZXRPcGVyYWJsZVZhbHVlKCk6IG51bWJlciB8IG51bGxcbiAgICB7XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5pdGVtcztcbiAgICAgICAgaWYgKHRoaXMubnVtYmVyT25seSgpKSB7XG4gICAgICAgICAgICBsZXQgdmFsdWU9MDtcbiAgICAgICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW06IFRva2VuKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gaXRlbS5nZXROdW1iZXJWYWx1ZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlzU2luZ2xlVmFyKCl7XG4gICAgICAgIGNvbnN0IHRva2VuPXRoaXMuaXRlbXNbMF1hcyBUb2tlblxuICAgICAgICByZXR1cm4gdGhpcy5zaW5ndWxlVG9rZW4oKSYmdG9rZW4uaXNWYXIoKVxuICAgIH1cbiAgICBnZXRTaW5nbGVWYXIoKXtcbiAgICAgICAgaWYoIXRoaXMuaXNTaW5nbGVWYXIoKSlyZXR1cm4gbnVsbDtcbiAgICAgICAgcmV0dXJuICh0aGlzLml0ZW1zWzBdYXMgVG9rZW4pLmdldFN0cmluZ1ZhbHVlKCk7XG4gICAgfVxuXG4gICAgaXNQb3dHcm91cE1hdGNoKGdyb3VwOiBNYXRoR3JvdXApOmJvb2xlYW57XG4gICAgICAgIGlmKHRoaXMuaXRlbXMubGVuZ3RoIT09MSlyZXR1cm4gZmFsc2VcblxuICAgICAgICBpZih0aGlzLmlzU2luZ2xlVmFyKCkmJmdyb3VwLmlzU2luZ2xlVmFyKCkmJnRoaXMuZXF1YWxzKGdyb3VwKSl7XG4gICAgICAgICAgICB0aGlzLml0ZW1zPVtNYXRoSmF4T3BlcmF0b3IuY3JlYXRlKFwiUG93ZXJcIiwyLFtuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXNbMF0pLG5ldyBNYXRoR3JvdXAobmV3IFRva2VuKDIpKV0pXVxuICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMoZ3JvdXApXG4gICAgfVxuXG4gICAgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChpdGVtOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3J8TWF0aEdyb3VwKXtcbiAgICAgICAgLy9QbGFjZWhvbGRlciBmb3Igbm93XG4gICAgICAgIHJldHVybiB0aGlzLmVxdWFscyhpdGVtKVxuICAgIH1cblxuICAgIGVxdWFscyhpdGVtOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3J8TWF0aEdyb3VwKXtcbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIFRva2VuKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy5pdGVtc1swXS5lcXVhbHMoaXRlbSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcil7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT0xJiZ0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yJiZ0aGlzLml0ZW1zWzBdLmVxdWFscyhpdGVtKVxuICAgICAgICB9XG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09aXRlbS5pdGVtcy5sZW5ndGgmJnRoaXMuaXRlbXMuZXZlcnkoKHQ6IE1hdGhHcm91cEl0ZW0pPT57XG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uaXRlbXMuc29tZSgoaSk9PnQuZXF1YWxzKGkpKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZ2V0SWQoKXtcbiAgICAgICAgcmV0dXJuICdNYXRoR3JvdXAnXG4gICAgfVxuICAgIGNvbWJpbmluZ0xpa2VUZXJtcygpIHtcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXc9bmV3IE1hdGhPdmVydmlldygpXG4gICAgICAgIG92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcylcbiAgICAgICAgdGhpcy5zZXRJdGVtcyhvdmVydmlldy5yZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKSlcbiAgICAgICAgY29uc29sZS5sb2coXCJiZWZvclwiLHRoaXMuaXRlbXMsdGhpcy50b1N0cmluZygpLHRoaXMuaXRlbXMubWFwKHQ9PnQgaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKSlcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtOiBNYXRoR3JvdXBJdGVtLCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLml0ZW1zID0gdGhpcy5pdGVtcy5maWx0ZXIoKG90aGVySXRlbTogTWF0aEdyb3VwSXRlbSwgb3RoZXJJbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA9PT0gb3RoZXJJbmRleCkgcmV0dXJuIHRydWU7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc01hdGNoID0gaXRlbS5pc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVySXRlbSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGl0ZW0gLG90aGVySXRlbSxpc01hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc01hdGNoOyAvLyBSZW1vdmUgbWF0Y2hlZCBpdGVtc1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zb2xlLmxvZyhcImFmdGVyXCIsdGhpcy5pdGVtcyx0aGlzLnRvU3RyaW5nKCkpXG4gICAgfVxuXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XG4gICAgICAgIGlmKCFBcnJheS5pc0FycmF5KHRoaXMuaXRlbXMpKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW1zIHRvIGJlIGFuIGFycmF5IGJ1dCByZWNlaXZlZDogXCIrdGhpcy5pdGVtcyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgc3RyaW5nKz1zaG91bGRBZGRQbHVzKHRoaXMuaXRlbXNbaW5kZXgtMV0saXRlbSlcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gYCgke2l0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKX0pYDtcbiAgICAgICAgICAgIH0gIGVsc2Uge1xuICAgICAgICAgICAgICAgIHN0cmluZyArPSBpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XG4gICAgICAgICAgICB9IGlmIChjdXN0b21Gb3JtYXR0ZXIpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcgPSBjdXN0b21Gb3JtYXR0ZXIoaXRlbSxzdHJpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHN0cmluZztcbiAgICB9XG59XG5cblxuXG5jbGFzcyBNYXRoT3ZlcnZpZXcge1xuICAgIHByaXZhdGUgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBhbnk+O1xuICAgIHByaXZhdGUgb3BlcmF0b3JzOiBNYXA8c3RyaW5nLCBhbnk+O1xuICAgIHByaXZhdGUgbnVtYmVyOiBudW1iZXI7XG4gICAgZ2V0TnVtYmVyKCk6IG51bWJlcntyZXR1cm4gdGhpcy5udW1iZXI7fVxuICAgIGdldFZhcmlhYmxlcygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLnZhcmlhYmxlczt9XG4gICAgZ2V0T3BlcmF0b3JzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMub3BlcmF0b3JzO31cbiAgICBjb25zdHJ1Y3Rvcih2YXJpYWJsZXM/OiBNYXA8c3RyaW5nLCBhbnk+LG9wZXJhdG9ycz86IE1hcDxzdHJpbmcsIGFueT4sbnVtYmVyPzogbnVtYmVyKXtcbiAgICAgICAgaWYodmFyaWFibGVzKXRoaXMudmFyaWFibGVzPXZhcmlhYmxlcztcbiAgICAgICAgaWYob3BlcmF0b3JzKXRoaXMub3BlcmF0b3JzPW9wZXJhdG9ycztcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcbiAgICB9XG4gICAgZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyhpdGVtczogTWF0aEdyb3VwSXRlbVtdKSB7XG4gICAgICAgIHRoaXMudmFyaWFibGVzPW5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xuICAgICAgICBpdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJml0ZW0uaXNWYXIoKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVWYXJpYWJsZXNNYXAoaXRlbS5nZXRTdHJpbmdWYWx1ZSgpKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJiFpdGVtLmlzVmFyKCk6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlTXVtYmVyKGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcjpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVPcGVyYXRvcnNNYXAoaXRlbSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gY2F0ZWdvcnkgaW4gTWF0aE92ZXJ2aWV3IHNlcGFyYXRlSW50b0luZGl2aWR1YWxzXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgIH1cbiAgICB1cGRhdGVNdW1iZXIobnVtYmVyOiBudW1iZXIpeyB0aGlzLm51bWJlcj10aGlzLm51bWJlcj90aGlzLm51bWJlcitudW1iZXI6bnVtYmVyO31cbiAgICB1cGRhdGVWYXJpYWJsZXNNYXAoa2V5OiBzdHJpbmcpe1xuICAgICAgICB0aGlzLnZhcmlhYmxlcyA/Pz0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgaXRlbXM6IGFueVtdIH0+KCk7XG4gICAgICAgIGlmKCF0aGlzLnZhcmlhYmxlcy5oYXMoa2V5KSl7dGhpcy52YXJpYWJsZXMuc2V0KGtleSx7Y291bnQ6IDB9KX1cbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZ2V0KGtleSkuY291bnQrKztcbiAgICB9XG4gICAgdXBkYXRlT3BlcmF0b3JzTWFwKG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xuICAgICAgICBjb25zdCBrZXk9b3BlcmF0b3Iub3BlcmF0b3I7XG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xuICAgICAgICBpZighdGhpcy5vcGVyYXRvcnMuaGFzKGtleSkpe3RoaXMub3BlcmF0b3JzLnNldChrZXkse2NvdW50OiAwLCBpdGVtczogW119KX1cbiAgICAgICAgY29uc3QgZW50cnkgPSB0aGlzLm9wZXJhdG9ycy5nZXQoa2V5KSE7XG4gICAgICAgIGVudHJ5LmNvdW50ICs9IDE7XG4gICAgICAgIGVudHJ5Lml0ZW1zLnB1c2gob3BlcmF0b3IpO1xuICAgIH1cblxuICAgIGhhc1Zhcigpe3JldHVybiB0aGlzLnZhcmlhYmxlcyYmdGhpcy52YXJpYWJsZXMuc2l6ZT4wfVxuICAgIGhhc09wKCl7cmV0dXJuIHRoaXMub3BlcmF0b3JzJiZ0aGlzLm9wZXJhdG9ycy5zaXplPjB9XG4gICAgb25seU51bWVyaWMoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubnVtYmVyJiYhdGhpcy5oYXNWYXIoKSYmIXRoaXMuaGFzT3AoKVxuICAgIH1cbiAgICByZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKXtcbiAgICAgICAgY29uc3QgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXT1bXTtcbiAgICAgICAgaWYodGhpcy5udW1iZXIpaXRlbXMucHVzaChuZXcgVG9rZW4odGhpcy5udW1iZXIpKTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYodmFsdWUuY291bnQ9PT0xKXtcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKG5ldyBUb2tlbihrZXkpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZih2YWx1ZS5jb3VudD4xKXtcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKE11bHRpcGxpY2F0aW9uT3BlcmF0b3IuYXNPY2N1cnJlbmNlR3JvdXAodmFsdWUuY291bnQsa2V5KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmKHRoaXMub3BlcmF0b3JzKXtcbiAgICAgICAgICAgIGl0ZW1zLnB1c2goLi4uQXJyYXkuZnJvbSh0aGlzLm9wZXJhdG9ycy52YWx1ZXMoKSkuZmxhdE1hcCgob3BlcmF0b3I6IGFueSkgPT4gb3BlcmF0b3IuaXRlbXMpKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpdGVtcztcbiAgICB9XG59XG5cblxuXG5cblxuXG5leHBvcnQgY2xhc3MgVG9rZW57XG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTpudW1iZXJ8c3RyaW5nKXtcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICB9XG4gICAgZ2V0TnVtYmVyVmFsdWUoKTpudW1iZXJ7cmV0dXJuICh0aGlzLnZhbHVlIGFzIG51bWJlcil9XG4gICAgZ2V0U3RyaW5nVmFsdWUoKTpzdHJpbmd7cmV0dXJuICh0aGlzLnZhbHVlIGFzIHN0cmluZyl9XG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cbiAgICBzZXRWYWx1ZSh2YWx1ZTogbnVtYmVyfHN0cmluZyl7dGhpcy52YWx1ZT12YWx1ZTt9XG4gICAgaXNWYXIoKSB7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlID09PSAnc3RyaW5nJzt9XG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy52YWx1ZSA9PT0gaXRlbS52YWx1ZTtcbiAgICB9XG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XG4gICAgICAgIGxldCBzdHJpbmc9JydcbiAgICAgICAgaWYoIXRoaXMuaXNWYXIoKSYmdGhpcy5nZXROdW1iZXJWYWx1ZSgpPDApXG4gICAgICAgICAgICBzdHJpbmcrPSctJztcbiAgICAgICAgc3RyaW5nKz10aGlzLnZhbHVlO1xuICAgICAgICBpZihjdXN0b21Gb3JtYXR0ZXIpe1xuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5nO1xuICAgIH1cbiAgICBjbG9uZSgpe3JldHVybiBuZXcgVG9rZW4odGhpcy52YWx1ZSl9XG59XG5cblxuXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW5ze1xuICAgIHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+PVtdO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKHRva2Vucz86IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPil7XG4gICAgICAgIHRoaXMudG9rZW5zPXRva2Vuc3x8W107XG4gICAgfVxuICAgIGFkZElucHV0KG1hdGg6IHN0cmluZyl7XG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XG4gICAgfVxuICAgIHRva2VuaXplKG1hdGg6IHN0cmluZyl7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzKCkpXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGU9L1tcXChcXCldLy50ZXN0KG1hdGNoWzBdKT8ncGFyZW4nOidvcGVyYXRvcidcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4odHlwZSxtYXRjaFswXSkpO1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbignbnVtYmVyJyxwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oXCJ2YXJpYWJsZVwiLG1hdGNoWzBdKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcbiAgICAgICAgfVxuICAgICAgIHRoaXMucG9zdFByb2Nlc3NUb2tlbnMoKTtcbiAgICB9XG5cbiAgICBwb3N0UHJvY2Vzc1Rva2Vucygpe1xuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XG4gICAgICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcbiAgICAgICAgKi9cbiAgICAgICAgdGhpcy50b2tlbnM9aWRQYXJlbnRoZXNlcyh0aGlzLnRva2Vucyk7XG4gICAgICAgIHRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXG4gICAgICAgIFxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxuXG4gICAgICAgIHBhcmVuTWFwLnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBiIC0gYSlcbiAgICAgICAgLmZvckVhY2goKHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3ICBCYXNpY01hdGhKYXhUb2tlbignb3BlcmF0b3InLCcqJykpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKClcbiAgICB9XG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpIHtcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KXx8ISh0aGlzLnRva2Vuc1tpbmRleF0gaW5zdGFuY2VvZiBQYXJlbikpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGZpbmRQYXJlbkluZGV4KGluZGV4LHRoaXMudG9rZW5zKT8ub3BlbjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGlkeCA9PSBudWxsIHx8ICFpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCArIDFdKSkgcmV0dXJuIGZhbHNlO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbaWR4IC0gMV07XG4gICAgICAgICAgICByZXR1cm4gIShcbiAgICAgICAgICAgICAgICBpZHggPiAwICYmXG4gICAgICAgICAgICAgICAgcHJldlRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZcbiAgICAgICAgICAgICAgICAhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXMocHJldlRva2VuLnZhbHVlPy50b1N0cmluZygpIHx8ICcnKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcblxuICAgIFxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy50b2tlbnNbaW5kZXhdO1xuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdG9rZW4uaXNWYWx1ZVRva2VuKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uPSh0b2tlbjogYW55KT0+e1xuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnR5cGVvZiB0b2tlbi52YWx1ZT09PSdzdHJpbmcnJiZoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLnZhbHVlKVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaXNWYXI9KHRva2VuOiBhbnkpPT57cmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZ0b2tlbi50eXBlPT09J3ZhcmlhYmxlJ31cblxuICAgICAgICBjb25zdCBwcmVjZWRlc1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpbmRleD4wJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgY29uc3QgZm9sbG93c1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpbmRleDx0b2tlbnMubGVuZ3RoLTEmJmlzVmFyKHRva2Vuc1tpbmRleF0pXG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xuICAgICAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGlzT3BlblBhcmVuKHRva2VuKXx8IGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbil8fHByZWNlZGVzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCAtIDEpID8gaW5kZXggOiBudWxsO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNDbG9zZWRQYXJlbih0b2tlbil8fGZvbGxvd3NWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHwgdGVzdERvdWJsZVJpZ2h0KGluZGV4KSA/IGluZGV4ICsgMSA6IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0gIT09IG51bGwpO1xuICAgICAgICByZXR1cm4gbWFwO1xuICAgIH1cbiAgICBcblxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XG4gICAgICAgIC8vIFBsdXNlcyBhcmUgc2VwYXJhdG9ycy5UaGVyZWZvcmUsIHRoZXkgZG8gbm90IG5lZWQgdG8gYmUgaGVyZSBBcyB0aGUgZXhwcmVzc2lvbiBpcyB0b2tlbltdXG4gICAgICAgIC8vTWludXNlcyBvbiB0aGUgb3RoZXIgaGFuZC5jYW4gZWl0aGVyIGJlIGEgc2VwYXJhdG9yLiBPciBhIG5lZ2F0aXZlIHNpZ25cbiAgICAgICAgY29uc3QgcGx1c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdBZGRpdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcbiAgICAgICAgcGx1c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LDEpXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBtaW51c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdTdWJ0cmFjdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcbiAgICAgICAgXG4gICAgICAgIG1pbnVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleCArIDFdO1xuICAgICAgICAgICAgaWYgKG5leHRUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHR5cGVvZiBuZXh0VG9rZW4udmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIG5leHRUb2tlbi52YWx1ZSAqPSAtMTtcbiAgICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICB9XG4gICAgdmFsaWRhdGVJbmRleChpbmRleDogbnVtYmVyLG1hcmdpbj86IG51bWJlcil7XG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XG4gICAgICAgIHJldHVybiBpbmRleD49MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC1tYXJnaW47XG4gICAgfVxuICAgIGNsb25lKCk6IEJhc2ljTWF0aEpheFRva2VucyB7XG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW5zKHRoaXMudG9rZW5zLm1hcCh0b2tlbiA9PiB0b2tlbi5jbG9uZSgpKSk7XG4gICAgfVxuICAgIC8qXG4gICAgXG4gICAgXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbjogYW55LCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4KSA6IG51bGwpXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgfVxuXG4gICAgZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwUGFyZW5JbmRleGVzKClcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcbiAgICAgICAgICAgICAgICBpZiAob3BlbkluZGV4ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodGhpcy50b2tlbnNbb3BlbkluZGV4IC0gMV0/LnR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNsb3NlSW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0/LmlzVmFsdWVUb2tlbigpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KS5mbGF0TWFwKChpdGVtOiBhbnkpID0+IFtpdGVtLm9wZW4sIGl0ZW0uY2xvc2VdKTtcbiAgICB9ICAgIFxuICAgIFxuICAgIFxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXG4gICAgICAgICkpO1xuICAgICB9XG4gICAgXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIFRva2VuKSl7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZnR5Z3ViaG5pbXBvXCIpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBtYXAgPSBuZXcgU2V0KHRoaXMuZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpKTtcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKF86IGFueSwgaWR4OiB1bmtub3duKSA9PiAhbWFwLmhhcyhpZHgpKTtcbiAgICAgICAgLy9Qcm9ibGVtIHdpdGggID0gYXMgaXQncyBhZmZlY3RpbmcgdGhlIHZhcmlhYmxlIGJlZm9yZSBpdFxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4IC0gMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKCkgJiZcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCArIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpXG4gICAgICAgICAgICApO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIFxuICAgICAgICBjb25zdCBhcnIgPSBbXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobnVtTWFwKSwgXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXModmFyTWFwKSwgXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKVxuICAgICAgICBcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcbiAgICB9XG5cbiAgICBcblxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcbiAgICAgICAgKVxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxuICAgIH1cblxuICAgIGluc2VydFRva2VucyhzdGFydDogYW55LCBsZW5ndGg6IG51bWJlciwgb2JqZWN0czogYW55W10gfCBUb2tlbikge1xuICAgICAgICBvYmplY3RzID0gZmxhdHRlbkFycmF5KG9iamVjdHMpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xuICAgIH1cblxuICAgIFxuXG4gICAgaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnM6IGFueVtdKXtcbiAgICAgICAgcmV0dXJuIHRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+aW5kZXg+MFxuICAgICAgICAgICAgJiZ0b2tlbnNbaW5kZXggLSAxXT8uaXNWYWx1ZVRva2VuKClcbiAgICAgICAgICAgICYmdG9rZW4/LmlzVmFsdWVUb2tlbigpJiZ0b2tlbi52YWx1ZT49MD9pbmRleDpudWxsXG4gICAgICAgICkuZmlsdGVyKGl0ZW09Pml0ZW0hPT1udWxsKVxuICAgIH1cblxuICAgIHRva2VuQ29tcGFyZShjb21wYXJlOiBzdHJpbmcgfCBudW1iZXIsIHZhbHVlOiBzdHJpbmd8UmVnRXhwLCB0b2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9LCBuZXh0VG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSkge1xuICAgICAgICBjb25zdCByZWdFeHB2YWx1ZSA9ICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgKHZhbHVlID09PSBudWxsIHx8IHJlZ0V4cHZhbHVlLnRlc3QodG9rZW5bY29tcGFyZV0pKSAmJlxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXG4gICAgICAgICk7XG4gICAgfVxuICAgICovXG59XG5cblxuXG5cblxuXG5cbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbntcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgdmFsdWU/OiBzdHJpbmd8bnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IodHlwZTpzdHJpbmcgLHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQpe1xuICAgICAgICB0aGlzLnR5cGU9dHlwZTtcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICAgICAgdGhpcy5pbnN1clByb3BlckZvcm1hdHRpbmcoKVxuICAgIH1cbiAgICBpbnN1clByb3BlckZvcm1hdHRpbmcoKXtcbiAgICAgICAgaWYgKCF0aGlzLmlzVmFsdWVUb2tlbigpJiZ0eXBlb2YgdGhpcy52YWx1ZT09PVwic3RyaW5nXCIpe1xuICAgICAgICAgICAgdGhpcy52YWx1ZT1zZWFyY2hBbGxNYXRoSmF4T3BlcmF0b3JzQW5kU3ltYm9scyh0aGlzLnZhbHVlKT8ubmFtZVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0TGF0ZXhTeW1ib2woKXtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJz9zZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMudmFsdWUpPy5sYXRleDp1bmRlZmluZWR9XG5cbiAgICBnZXRmdWxsVHlwZSgpe1xuICAgICAgICByZXR1cm4gdGhpcy50eXBlXG4gICAgfVxuICAgIGNsb25lKCl7XG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW4odGhpcy50eXBlLCB0aGlzLnZhbHVlKVxuICAgIH1cblxuXG4gICAgaXNTdHJpbmcoKXtyZXR1cm4gdGhpcy50eXBlPT09J3BhcmVuJ3x8dGhpcy50eXBlPT09J29wZXJhdG9yJ31cblxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cblxuICAgIHRvU3RyaW5nTGF0ZXgoKXtcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xuICAgICAgICBpZiAodGhpcy5pc1N0cmluZygpKVxuICAgICAgICAgICAgc3RyaW5nKz10aGlzLmdldExhdGV4U3ltYm9sKClcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdudW1iZXInKSBzdHJpbmcrPXRoaXMudmFsdWU7XG4gICAgICAgIHJldHVybiBzdHJpbmdcbiAgICB9XG4gICAgYWZmZWN0ZWRPcGVyYXRvclJhbmdlKGRpcmVjdGlvbjogc3RyaW5nKXtcbiAgICAgICAgaWYodGhpcy50eXBlIT09J29wZXJhdG9yJ3x8dGhpcy52YWx1ZT09PSdFcXVhbHMnKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIGlmKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycmJmRpcmVjdGlvbj09PSdsZWZ0JyYmIWlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSh0aGlzLnZhbHVlLCBbLTEsIDFdLHRydWUpKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxufSJdfQ==