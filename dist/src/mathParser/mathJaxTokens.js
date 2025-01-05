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
        if (areGroupsMatching) {
            console.log(testItemGroup.occurrencesCount);
            this.addToOccurrenceGroup(testItemGroup.occurrencesCount);
            return true;
        }
        return false;
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
        // return number token
        if (group1 instanceof Token && group2 instanceof Token && !group1.isVar() && !group2.isVar()) {
            return new Token(group1.getNumberValue() * group2.getNumberValue());
        }
        const newOp = MathJaxOperator.create('Multiplication', 2, [new MathGroup([group1.clone()]), new MathGroup([group2.clone()])]);
        newOp.groups.forEach((group, index) => {
            newOp.groups = newOp.groups.filter((otherGroup, otherIndex) => {
                if (index === otherIndex)
                    return true;
                const isMatch = group.isPowGroupMatch(otherGroup);
                return !isMatch;
            });
        });
        return newOp;
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
        console.log("befor", this.items, this.toString());
        this.items.forEach((item, index) => {
            if (item instanceof MultiplicationOperator) {
                this.items = this.items.filter((otherItem, otherIndex) => {
                    if (index === otherIndex)
                        return true;
                    const isMatch = item.isOccurrenceGroupMatch(otherItem);
                    return !isMatch;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUFtRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5JLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUV4UixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRTdDLFNBQVMsU0FBUyxDQUFDLEtBQWEsRUFBRSxJQUFpQjtJQUMvQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ1gsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEIsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEI7WUFDSSxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FDOUIsU0FBYyxFQUNkLFNBQWlDLEVBQ2pDLE9BQTRCLEVBQUU7SUFFOUIsNERBQTREO0lBQzVELElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG1FQUFtRTtJQUNuRSxJQUFJLEtB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QVUsSUFBRSxJQUFJLENBQUMsS0FBSyxLQUFHLFFBQVE7WUFDNUMsT0FBTyxLQUFLLENBQUE7UUFDaEIsSUFBRyxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUcsUUFBUSxJQUFFLFNBQVMsS0FBRyxNQUFNLElBQUUsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDO1lBQ3ZHLE9BQU8sS0FBSyxDQUFBO1FBQ2hCLE9BQU8sSUFBSSxDQUFBO0lBQ2YsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuL2ltVmVyeUxhenlcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgcmVnRXhwIH0gZnJvbSBcIi4uL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyBBc3NvY2lhdGl2aXR5LCBCcmFja2V0VHlwZSwgTWF0aEpheE9wZXJhdG9yTWV0YWRhdGEsIG1hdGhKYXhPcGVyYXRvcnNNZXRhZGF0YSwgT3BlcmF0b3JUeXBlIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XHJcblxyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgaXNPcGVuUGFyZW4sIGlzQ2xvc2VkUGFyZW4gfSBmcm9tIFwiLi4vdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIGlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSwgc2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHMsIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcclxuXHJcbmltcG9ydCB7IHBhcnNlT3BlcmF0b3IgfSBmcm9tIFwiLi9tYXRoRW5naW5lXCI7XHJcblxyXG5mdW5jdGlvbiB3cmFwR3JvdXAoZ3JvdXA6IHN0cmluZywgd3JhcDogQnJhY2tldFR5cGUpOiBzdHJpbmcge1xyXG4gICAgc3dpdGNoICh3cmFwKSB7XHJcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5QYXJlbnRoZXNlczpcclxuICAgICAgICAgICAgcmV0dXJuIGAoJHtncm91cH0pYDtcclxuICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLkN1cmx5QnJhY2VzOlxyXG4gICAgICAgICAgICByZXR1cm4gYHske2dyb3VwfX1gO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHJldHVybiBncm91cDtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRlZXBTZWFyY2hXaXRoUGF0aChcclxuICAgIHN0cnVjdHVyZTogYW55LFxyXG4gICAgcHJlZGljYXRlOiAoaXRlbTogYW55KSA9PiBib29sZWFuLFxyXG4gICAgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdXHJcbik6IHsgaXRlbTogYW55OyBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdIH0gfCBudWxsIHtcclxuICAgIC8vIEJhc2UgY2FzZTogSWYgdGhlIGN1cnJlbnQgc3RydWN0dXJlIG1hdGNoZXMgdGhlIHByZWRpY2F0ZVxyXG4gICAgaWYgKHByZWRpY2F0ZShzdHJ1Y3R1cmUpKSB7XHJcbiAgICAgICAgcmV0dXJuIHsgaXRlbTogc3RydWN0dXJlLCBwYXRoIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgaXQncyBhbiBhcnJheSwgcmVjdXJzaXZlbHkgc2VhcmNoIGVhY2ggZWxlbWVudCB3aXRoIGl0cyBpbmRleFxyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoc3RydWN0dXJlKSkge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RydWN0dXJlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVbaV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGldKTtcclxuICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgaXQncyBhbiBvYmplY3QsIHJlY3Vyc2l2ZWx5IHNlYXJjaCBpdHMgcHJvcGVydGllcyB3aXRoIHRoZWlyIGtleXNcclxuICAgIGlmIChzdHJ1Y3R1cmUgIT09IG51bGwgJiYgdHlwZW9mIHN0cnVjdHVyZSA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHN0cnVjdHVyZSkge1xyXG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0cnVjdHVyZSwga2V5KSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtrZXldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBrZXldKTtcclxuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgbm8gbWF0Y2ggaXMgZm91bmRcclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcbnR5cGUgZm9ybWF0dGFibGVGb3JNYXRoR3JvdXA9TWF0aEdyb3VwSXRlbXxNYXRoR3JvdXB8QmFzaWNNYXRoSmF4VG9rZW5cclxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtczogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSk6IE1hdGhHcm91cEl0ZW1bXSB7XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XHJcbiAgICAgICAgaXRlbXMgPSBbaXRlbXNdO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGZvcm1hdHRlZEl0ZW1zID0gaXRlbXNcclxuICAgICAgICAucmVkdWNlKChhY2M6IE1hdGhHcm91cEl0ZW1bXSwgaXRlbTogVG9rZW4gfCBNYXRoR3JvdXAgfCBNYXRoSmF4T3BlcmF0b3IgfCBCYXNpY01hdGhKYXhUb2tlbikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYy5jb25jYXQoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW0uZ2V0SXRlbXMoKSkpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpIHtcclxuICAgICAgICAgICAgICAgIGFjYy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbikge1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0udmFsdWUgJiYgKGl0ZW0udHlwZSA9PT0gXCJudW1iZXJcIiB8fCBpdGVtLnR5cGUgPT09IFwidmFyaWFibGVcIikpIHtcclxuICAgICAgICAgICAgICAgICAgICBhY2MucHVzaChuZXcgVG9rZW4oaXRlbS52YWx1ZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgYEV4cGVjdGVkIGl0ZW0gdG8gYmUgYSBudW1iZXIgb3IgdmFyaWFibGUgYnV0IHJlY2VpdmVkOiAke2l0ZW0udmFsdWV9YFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgIH0sIFtdKVxyXG5cclxuICAgIHJldHVybiBmb3JtYXR0ZWRJdGVtcztcclxufVxyXG5mdW5jdGlvbiBzaG91bGRBZGRQbHVzKGdyb3VwMT86IGFueSxncm91cDI/OiBhbnkpe1xyXG4gICAgaWYoIWdyb3VwMXx8IWdyb3VwMilyZXR1cm4gJyc7XHJcblxyXG4gICAgcmV0dXJuICcrJztcclxufVxyXG5cclxuZnVuY3Rpb24gY2FuQ29tYmluZShtYXRoOiBNYXRoR3JvdXAsb3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcblxyXG59XHJcbmV4cG9ydCBjbGFzcyBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgb3BlcmF0b3I6IHN0cmluZztcclxuICAgIGdyb3VwTnVtOiBudW1iZXIgPSAxO1xyXG4gICAgZ3JvdXBzOiBNYXRoR3JvdXBbXTtcclxuICAgIHNvbHV0aW9uOiBNYXRoR3JvdXA7XHJcbiAgICBjb21tdXRhdGl2ZTogYm9vbGVhbjtcclxuICAgIGlzT3BlcmFibGU6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbikge1xyXG4gICAgICAgIGlmIChvcGVyYXRvcikgdGhpcy5vcGVyYXRvciA9IG9wZXJhdG9yO1xyXG4gICAgICAgIGlmIChncm91cE51bSkgdGhpcy5ncm91cE51bSA9IGdyb3VwTnVtO1xyXG4gICAgICAgIGlmIChncm91cHMpIHRoaXMuZ3JvdXBzID0gZ3JvdXBzO1xyXG4gICAgICAgIGlmIChzb2x1dGlvbikgdGhpcy5zb2x1dGlvbiA9IHNvbHV0aW9uO1xyXG4gICAgICAgIGlmIChpc09wZXJhYmxlICE9PSB1bmRlZmluZWQpIHRoaXMuaXNPcGVyYWJsZSA9IGlzT3BlcmFibGU7XHJcbiAgICB9XHJcbiAgICBzdGF0aWMgY3JlYXRlKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbik6IE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yID09PSBcIk11bHRpcGxpY2F0aW9uXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKGdyb3Vwcywgc29sdXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcihvcGVyYXRvciwgZ3JvdXBOdW0sIGdyb3Vwcywgc29sdXRpb24sIGlzT3BlcmFibGUpO1xyXG4gICAgfVxyXG4gICAgdGVzdEdyb3Vwcyh0ZXN0OiAoZ3JvdXA6IE1hdGhHcm91cCkgPT4gYm9vbGVhbik6IGJvb2xlYW5bXSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcCh0ZXN0KTtcclxuICAgIH1cclxuXHJcbiAgICBtYXBWYXJpYWJsZXMoKTogYm9vbGVhbltdIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmhhc1ZhcmlhYmxlcygpKTtcclxuICAgIH1cclxuXHJcbiAgICBvcGVyYXRvclZhcmlhYmxlcygpOiBzdHJpbmdbXSB7XHJcbiAgICAgICAgcmV0dXJuIFsuLi5uZXcgU2V0KHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5ncm91cFZhcmlhYmxlcygpKS5mbGF0KCkpXTtcclxuICAgIH1cclxuXHJcbiAgICBjbG9uZSgpOiBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5jbG9uZSgpKTtcclxuICAgICAgICBjb25zdCBzb2x1dGlvbiA9IHRoaXMuc29sdXRpb24gPyB0aGlzLnNvbHV0aW9uLmNsb25lKCkgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgcmV0dXJuIE1hdGhKYXhPcGVyYXRvci5jcmVhdGUodGhpcy5vcGVyYXRvciwgdGhpcy5ncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgdGhpcy5pc09wZXJhYmxlKTtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZ1NvbHV0aW9uKCk6IHN0cmluZyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKSArICcgPSAnICsgdGhpcy5zb2x1dGlvbj8udG9TdHJpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yICYmXHJcbiAgICAgICAgICAgIHRoaXMub3BlcmF0b3IgPT09IGl0ZW0ub3BlcmF0b3IgJiZcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMubGVuZ3RoID09PSBpdGVtLmdyb3Vwcy5sZW5ndGggJiZcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMuZXZlcnkoKHQsIGluZGV4KSA9PiB0LmVxdWFscyhpdGVtLmdyb3Vwc1tpbmRleF0pKTtcclxuICAgIH1cclxuICAgIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH18bnVsbCAgeyByZXR1cm4gbnVsbDsgfSAgXHJcbiAgICBpc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RJdGVtOiBNYXRoSmF4T3BlcmF0b3IgfCBUb2tlbik6IGJvb2xlYW4ge3JldHVybiBmYWxzZTt9XHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBmdW5jdGlvbiB3cmFwR3JvdXAoZ3JvdXA6IE1hdGhHcm91cCwgd3JhcDogQnJhY2tldFR5cGUsb3B0aW9uYWw6IGJvb2xlYW4pOiBzdHJpbmcge1xyXG4gICAgICAgICAgICBpZihvcHRpb25hbCYmZ3JvdXAuc2luZ3VsYXIoKSlyZXR1cm4gZ3JvdXAudG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKTtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXBTdHI9Z3JvdXAudG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKVxyXG4gICAgICAgICAgICBzd2l0Y2ggKHdyYXApIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgQnJhY2tldFR5cGUuUGFyZW50aGVzZXM6XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGAoJHtncm91cFN0cn0pYDtcclxuICAgICAgICAgICAgICAgIGNhc2UgQnJhY2tldFR5cGUuQ3VybHlCcmFjZXM6XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGB7JHtncm91cFN0cn19YDtcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdyb3VwU3RyO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG5cclxuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHNlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy5vcGVyYXRvcik7XHJcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuICcnO1xyXG4gICAgICAgIGlmKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPjJ8fG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPDEpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbnVtYmVyIG9mIHBvc2l0aW9ucyBmb3IgYXNzb2NpYXRpdml0eTogJHttZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uc31gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gbWV0YWRhdGEubGF0ZXg7XHJcbiAgICAgICAgbGV0IGluZGV4PTA7XHJcbiAgICAgICAgbGV0IHN0cmluZyA9ICcnO1xyXG5cclxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyx0cnVlKS5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXgtMV0sdGhpcy5ncm91cHNbaW5kZXhdKSt3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLCBpdGVtLmJyYWNrZXRUeXBlLCBpdGVtLmlzQnJhY2tldE9wdGlvbmFsKTtcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xyXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLGZhbHNlKS5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXhdLHRoaXMuZ3JvdXBzW2luZGV4KzFdKSt3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLCBpdGVtLmJyYWNrZXRUeXBlLCBpdGVtLmlzQnJhY2tldE9wdGlvbmFsKTtcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKGN1c3RvbUZvcm1hdHRlcikgXHJcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXHJcbiAgICAgICAgcmV0dXJuIHN0cmluZy50cmltKCk7XHJcbiAgICB9XHJcbiAgICBwYXJzZU1hdGhqYXhPcGVyYXRvcigpIHtcclxuICAgICAgICBwYXJzZU9wZXJhdG9yKHRoaXMpO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgY29uc3RydWN0b3IoZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgc3VwZXIoXCJNdWx0aXBsaWNhdGlvblwiLCAyLCBncm91cHMsIHNvbHV0aW9uLCB0cnVlKTtcclxuICAgICAgICB0aGlzLmNvbW11dGF0aXZlID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCk7XHJcbiAgICB9XHJcbiAgICByZW1vdmVNdWx0aXBsaWNhdGlvbkRlcHRocygpe1xyXG4gICAgICAgIHRoaXMuZ3JvdXBzLmZvckVhY2goKGdyb3VwOiBNYXRoR3JvdXApID0+IHtcclxuICAgICAgICAgICAgaWYoZ3JvdXAuc2luZ3VsYXIoKSYmZ3JvdXAuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3Ipe1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbXM9KGdyb3VwLmdldEl0ZW1zKClbMF0gYXMgTXVsdGlwbGljYXRpb25PcGVyYXRvcikuZ3JvdXBzO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ncm91cHMuc3BsaWNlKHRoaXMuZ3JvdXBzLmluZGV4T2YoZ3JvdXApLDEsLi4uaXRlbXMpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgYXNPY2N1cnJlbmNlR3JvdXAob2NjdXJyZW5jZXNDb3VudDogbnVtYmVyLG9jY3VycmVuY09mOiBzdHJpbmd8VG9rZW58TWF0aEdyb3VwKTogTXVsdGlwbGljYXRpb25PcGVyYXRvciB7XHJcbiAgICAgICAgb2NjdXJyZW5jT2Y9dHlwZW9mIG9jY3VycmVuY09mPT09XCJzdHJpbmdcIj9cclxuICAgICAgICAgICAgbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKG9jY3VycmVuY09mKV0pOm9jY3VycmVuY09mIGluc3RhbmNlb2YgVG9rZW4/XHJcbiAgICAgICAgICAgICAgICBuZXcgTWF0aEdyb3VwKFtvY2N1cnJlbmNPZl0pOm9jY3VycmVuY09mO1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoW25ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNlc0NvdW50KV0pLG9jY3VycmVuY09mXSlcclxuICAgIH1cclxuICAgIFxyXG4gICAgb3ZlcnJpZGUgZ2V0T2NjdXJyZW5jZUdyb3VwKCk6IHsgb2NjdXJyZW5jZXNDb3VudDogbnVtYmVyOyBvY2N1cnJlbmNPZjogTWF0aEdyb3VwW10gfSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5ncm91cHMucmVkdWNlKFxyXG4gICAgICAgICAgICAoYWNjOiB7IHRvdGFsTnVtOiBudW1iZXI7IGFycjogTWF0aEdyb3VwW10gfSwgaXRlbTogTWF0aEdyb3VwKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5nZXRPcGVyYWJsZVZhbHVlKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBhY2MudG90YWxOdW0gKz0gaXRlbS5nZXRPcGVyYWJsZVZhbHVlKCkhO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBhY2MuYXJyLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7IHRvdGFsTnVtOiAwLCBhcnI6IFtdIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiB7IG9jY3VycmVuY2VzQ291bnQ6IHJlc3VsdC50b3RhbE51bSwgb2NjdXJyZW5jT2Y6IHJlc3VsdC5hcnIgfTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRUb09jY3VycmVuY2VHcm91cCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbnVtYmVyR3JvdXAgPSB0aGlzLmdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLnNpbmdsZU51bWJlcigpKTtcclxuICAgICAgICBpZiAobnVtYmVyR3JvdXApIHtcclxuICAgICAgICAgICAgbnVtYmVyR3JvdXAuc2luZ2xlVG9rZW5TZXQodmFsdWUsIHRydWUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnB1c2gobmV3IE1hdGhHcm91cChbbmV3IFRva2VuKDEgKyB2YWx1ZSldKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG92ZXJyaWRlIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgaXNWYWxpZEl0ZW0gPSB0ZXN0SXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IHRlc3RJdGVtIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcjtcclxuICAgICAgICBpZiAoIWlzVmFsaWRJdGVtKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50R3JvdXAgPSB0aGlzLmdldE9jY3VycmVuY2VHcm91cCgpO1xyXG4gICAgICAgIGlmICghY3VycmVudEdyb3VwKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50R3JvdXBJdGVtcyA9IGN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5mbGF0TWFwKGdyb3VwID0+IGdyb3VwLmdldEl0ZW1zKCkpO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKHRlc3RJdGVtIGluc3RhbmNlb2YgVG9rZW4pIHtcclxuICAgICAgICAgICAgY29uc3QgaXNTaW5nbGVJdGVtTWF0Y2ggPSBjdXJyZW50R3JvdXBJdGVtcy5sZW5ndGggPT09IDEgJiYgY3VycmVudEdyb3VwSXRlbXNbMF0uZXF1YWxzKHRlc3RJdGVtKTtcclxuICAgICAgICAgICAgaWYgKGlzU2luZ2xlSXRlbU1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFRvT2NjdXJyZW5jZUdyb3VwKDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBpc1NpbmdsZUl0ZW1NYXRjaDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cCA9IHRlc3RJdGVtLmdldE9jY3VycmVuY2VHcm91cCgpO1xyXG4gICAgICAgIGlmICghdGVzdEl0ZW1Hcm91cCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cEl0ZW1zID0gdGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNPZjtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGFyZUdyb3Vwc01hdGNoaW5nID1jdXJyZW50R3JvdXBJdGVtcy5sZW5ndGggPT09IHRlc3RJdGVtR3JvdXBJdGVtcy5sZW5ndGggJiZcclxuICAgICAgICAgICAgY3VycmVudEdyb3VwLm9jY3VycmVuY09mLmV2ZXJ5KChjdXJyZW50U3ViR3JvdXA6IE1hdGhHcm91cCkgPT5cclxuICAgICAgICAgICAgICAgIHRlc3RJdGVtR3JvdXBJdGVtcy5zb21lKCh0ZXN0U3ViR3JvdXA6IE1hdGhHcm91cCkgPT4gXHJcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFN1Ykdyb3VwLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdFN1Ykdyb3VwKVxyXG4gICAgICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIGlmIChhcmVHcm91cHNNYXRjaGluZykgeyBcclxuICAgICAgICAgICAgY29uc29sZS5sb2codGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNlc0NvdW50KVxyXG4gICAgICAgICAgICB0aGlzLmFkZFRvT2NjdXJyZW5jZUdyb3VwKHRlc3RJdGVtR3JvdXAub2NjdXJyZW5jZXNDb3VudCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7IFxyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gJ1xcXFxjZG90ICc7XHJcbiAgICAgICAgbGV0IHN0cmluZyA9ICcnO1xyXG4gICAgICAgIGNvbnN0IHRvQWRkQ2RvdD0odGhpc0dyb3VwOiBNYXRoR3JvdXAsbmV4dEdyb3VwPzpNYXRoR3JvdXApPT57XHJcbiAgICAgICAgICAgIGlmKCFuZXh0R3JvdXApcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBpZigodGhpc0dyb3VwLnNpbmdsZU51bWJlcigpJiZuZXh0R3JvdXAuaXNTaW5nbGVWYXIoKSl8fCh0aGlzR3JvdXAuaXNTaW5nbGVWYXIoKSYmbmV4dEdyb3VwLnNpbmdsZU51bWJlcigpKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCByZW9yZGVyZWRHcm91cHM9dGhpcy5ncm91cHMuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoYS5zaW5nbGVOdW1iZXIoKSAmJiAhYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAoIWEuc2luZ2xlTnVtYmVyKCkgJiYgYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhLnNpbmd1bGFyKCkgJiYgIWIuc2luZ3VsYXIoKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAoIWEuc2luZ3VsYXIoKSAmJiBiLnNpbmd1bGFyKCkpIHJldHVybiAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZW9yZGVyZWRHcm91cHMuZm9yRWFjaCgoZ3JvdXAsaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cChncm91cC50b1N0cmluZygpLCBncm91cC5zaW5ndWxhcigpP0JyYWNrZXRUeXBlLk5vbmU6QnJhY2tldFR5cGUuUGFyZW50aGVzZXMpO1xyXG4gICAgICAgICAgICBpZiAodG9BZGRDZG90KGdyb3VwLHJlb3JkZXJlZEdyb3Vwc1tpbmRleCsxXSkpXHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gb3BlcmF0b3I7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qXHJcbiAgICB0aGlzLmdyb3VwcyA9IFtbMSwgMiwgM10sWzQsIDUsIDZdLFs3LCA4LCA5XV1cclxuICAgIEV4cGVjdGVkIE91dHB1dDpcclxuICAgIFtcclxuICAgICAgICAxKjQsIDEqNSwgMSo2LCAxKjcsIDEqOCwgMSo5LFxyXG4gICAgICAgIDIqNCwgMio1LCAyKjYsIDIqNywgMio4LCAyKjksXHJcbiAgICAgICAgMyo0LCAzKjUsIDMqNiwgMyo3LCAzKjgsIDMqOSxcclxuICAgICAgICA0KjcsIDQqOCwgNCo5LFxyXG4gICAgICAgIDUqNywgNSo4LCA1KjksXHJcbiAgICAgICAgNio3LCA2KjgsIDYqOVxyXG4gICAgXSAgXHJcbiAgICAqL1xyXG5cclxuICAgIHBhcnNlTWF0aGpheE9wZXJhdG9yKCk6IHZvaWQge1xyXG5cclxuICAgICAgICBjb25zdCBtYXRoR3JvdXBJdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmdyb3Vwcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBncm91cEEgPSB0aGlzLmdyb3Vwc1tpXS5nZXRJdGVtcygpO1xyXG5cclxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGdyb3VwcyB0byBwYWlyIHdpdGhcclxuICAgICAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgdGhpcy5ncm91cHMubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwQiA9IHRoaXMuZ3JvdXBzW2pdLmdldEl0ZW1zKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gR2VuZXJhdGUgcGFpcndpc2UgcHJvZHVjdHNcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGEgb2YgZ3JvdXBBKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgYiBvZiBncm91cEIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2codGhpcy5wYXJzZShhLCBiKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0aEdyb3VwSXRlbXMucHVzaCh0aGlzLnBhcnNlKGEsIGIpKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbiA9IG5ldyBNYXRoR3JvdXAobWF0aEdyb3VwSXRlbXMpO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgcGFyc2UoZ3JvdXAxOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3IsZ3JvdXAyOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3IpOk1hdGhHcm91cEl0ZW17XHJcbiAgICAgICAgLy8gcmV0dXJuIG51bWJlciB0b2tlblxyXG4gICAgICAgIGlmKGdyb3VwMSBpbnN0YW5jZW9mIFRva2VuJiZncm91cDIgaW5zdGFuY2VvZiBUb2tlbiYmIWdyb3VwMS5pc1ZhcigpJiYhZ3JvdXAyLmlzVmFyKCkpe1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFRva2VuKGdyb3VwMS5nZXROdW1iZXJWYWx1ZSgpKmdyb3VwMi5nZXROdW1iZXJWYWx1ZSgpKVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBuZXdPcD0gTWF0aEpheE9wZXJhdG9yLmNyZWF0ZSgnTXVsdGlwbGljYXRpb24nLDIsW25ldyBNYXRoR3JvdXAoW2dyb3VwMS5jbG9uZSgpXSksbmV3IE1hdGhHcm91cChbZ3JvdXAyLmNsb25lKCldKV0pXHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIG5ld09wLmdyb3Vwcy5mb3JFYWNoKChncm91cDogTWF0aEdyb3VwLCBpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIG5ld09wLmdyb3VwcyA9IG5ld09wLmdyb3Vwcy5maWx0ZXIoKG90aGVyR3JvdXA6IE1hdGhHcm91cCwgb3RoZXJJbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNNYXRjaCA9IGdyb3VwLmlzUG93R3JvdXBNYXRjaChvdGhlckdyb3VwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiAhaXNNYXRjaDtcclxuICAgICAgICAgICAgfSk7IFxyXG4gICAgICAgICAgICBcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3T3BcclxuICAgIH1cclxufVxyXG5mdW5jdGlvbiB0cmlnb25vbWV0cmljSWRlbnRpdGllcygpe1xyXG5cclxufVxyXG5cclxuZXhwb3J0IHR5cGUgTWF0aEdyb3VwSXRlbT1Ub2tlbnxNYXRoSmF4T3BlcmF0b3JcclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoR3JvdXAge1xyXG4gICAgcHJpdmF0ZSBpdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XHJcbiAgICAvL292ZXJ2aWV3OiBNYXRoT3ZlcnZpZXdcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IoaXRlbXM/OiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XHJcbiAgICAgICAgaWYoaXRlbXMpdGhpcy5zZXRJdGVtcyhpdGVtcyk7XHJcbiAgICB9XHJcbiAgICBnZXRJdGVtcygpOiBNYXRoR3JvdXBJdGVtW10ge3JldHVybiB0aGlzLml0ZW1zO31cclxuICAgIHNldEl0ZW0oaXRlbTogTWF0aEdyb3VwSXRlbSxpbmRleDpudW1iZXIpe1xyXG4gICAgICAgIHRoaXMuaXRlbXNbaW5kZXhdPWl0ZW07XHJcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpXHJcbiAgICB9XHJcbiAgICByZXBsYWNlSXRlbUNlbGwoaXRlbTogTWF0aEdyb3VwSXRlbXxNYXRoR3JvdXAsaW5kZXg6bnVtYmVyKXtcclxuICAgICAgICB0aGlzLml0ZW1zLnNwbGljZShpbmRleCwxLC4uLmVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtKSlcclxuICAgIH1cclxuICAgIHNldEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XHJcbiAgICAgICAgdGhpcy5pdGVtcyA9IGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtcyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpICAgIFxyXG4gICAgfVxyXG4gICAgZ3JvdXBWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlczogc3RyaW5nW10gPSBbXTtcclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW06IE1hdGhHcm91cEl0ZW0pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiAmJiBpdGVtLmlzVmFyKCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKTtcclxuICAgICAgICAgICAgICAgIGlmICghdmFyaWFibGVzLmNvbnRhaW5zKGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZXMucHVzaChrZXkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHZhcmlhYmxlcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdXBkYXRlT3ZlcnZpZXcoKXsvKlxyXG4gICAgICAgIHRoaXMub3ZlcnZpZXc9bmV3IE1hdGhPdmVydmlldygpXHJcbiAgICAgICAgdGhpcy5vdmVydmlldy5kZWZpbmVPdmVydmlld3NlcGFyYXRlSW50b0luZGl2aWR1YWxzKHRoaXMuaXRlbXMpKi9cclxuICAgIH1cclxuICAgIHNpbmdsZVRva2VuU2V0KHZhbHVlOiBudW1iZXIsdG9BZGQ/OiBib29sZWFuKXtcclxuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdIGFzIFRva2VuO1xyXG4gICAgICAgIGNvbnN0IG5ld1ZhbHVlPXRvQWRkP3ZhbHVlK3Rva2VuLmdldE51bWJlclZhbHVlKCk6dmFsdWU7XHJcbiAgICAgICAgaWYodGhpcy5zaW5ndWxlVG9rZW4oKSl7XHJcbiAgICAgICAgICAgIHRva2VuLnNldFZhbHVlKG5ld1ZhbHVlKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNsb25lKCk6IE1hdGhHcm91cCB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoR3JvdXAodGhpcy5pdGVtcy5tYXAoaXRlbT0+aXRlbS5jbG9uZSgpKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzT3BlcmF0b3IoKTogdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSgoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcik7fVxyXG4gICAgZG9lc250SGF2ZU9wZXJhdG9yKCk6ICB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gIXRoaXMuaGFzT3BlcmF0b3IoKTt9XHJcbiAgICBzaW5nbGVOdW1iZXIoKXtyZXR1cm4gdGhpcy5zaW5ndWxhcigpJiZ0aGlzLm51bWJlck9ubHkoKX1cclxuICAgIG51bWJlck9ubHkoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuZXZlcnkodCA9PiAodCBpbnN0YW5jZW9mIFRva2VuJiYhdC5pc1ZhcigpKSk7fVxyXG4gICAgaGFzVmFyaWFibGVzKCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiB0IGluc3RhbmNlb2YgVG9rZW4mJnQuaXNWYXIoKSk7fVxyXG5cclxuICAgIHNpbmd1bGFyKCk6Ym9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoID09PSAxICYmIHRoaXMuaXRlbXNbMF0gIT09IHVuZGVmaW5lZDt9XHJcbiAgICBzaW5ndWxlVG9rZW4oKTogdGhpcyBpcyB7IGl0ZW1zOiBbVG9rZW5dIH0ge3JldHVybiB0aGlzLnNpbmd1bGFyKCkgJiYgdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuO31cclxuICAgIGlzT3BlcmFibGUoKXtyZXR1cm4gdHJ1ZX1cclxuXHJcbiAgICBnZXRPcGVyYWJsZVZhbHVlKCk6IG51bWJlciB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBjb25zdCBpdGVtcyA9IHRoaXMuaXRlbXM7XHJcbiAgICAgICAgaWYgKHRoaXMubnVtYmVyT25seSgpKSB7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZT0wO1xyXG4gICAgICAgICAgICBpdGVtcy5mb3JFYWNoKChpdGVtOiBUb2tlbikgPT4ge1xyXG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gaXRlbS5nZXROdW1iZXJWYWx1ZSgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGlzU2luZ2xlVmFyKCl7XHJcbiAgICAgICAgY29uc3QgdG9rZW49dGhpcy5pdGVtc1swXWFzIFRva2VuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc2luZ3VsZVRva2VuKCkmJnRva2VuLmlzVmFyKClcclxuICAgIH1cclxuICAgIGdldFNpbmdsZVZhcigpe1xyXG4gICAgICAgIGlmKCF0aGlzLmlzU2luZ2xlVmFyKCkpcmV0dXJuIG51bGw7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLml0ZW1zWzBdYXMgVG9rZW4pLmdldFN0cmluZ1ZhbHVlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNQb3dHcm91cE1hdGNoKGdyb3VwOiBNYXRoR3JvdXApOmJvb2xlYW57XHJcbiAgICAgICAgaWYodGhpcy5pdGVtcy5sZW5ndGghPT0xKXJldHVybiBmYWxzZVxyXG5cclxuICAgICAgICBpZih0aGlzLmlzU2luZ2xlVmFyKCkmJmdyb3VwLmlzU2luZ2xlVmFyKCkmJnRoaXMuZXF1YWxzKGdyb3VwKSl7XHJcbiAgICAgICAgICAgIHRoaXMuaXRlbXM9W01hdGhKYXhPcGVyYXRvci5jcmVhdGUoXCJQb3dlclwiLDIsW25ldyBNYXRoR3JvdXAodGhpcy5pdGVtc1swXSksbmV3IE1hdGhHcm91cChuZXcgVG9rZW4oMikpXSldXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLmVxdWFscyhncm91cClcclxuICAgIH1cclxuXHJcbiAgICBpc09jY3VycmVuY2VHcm91cE1hdGNoKGl0ZW06IFRva2VufE1hdGhKYXhPcGVyYXRvcnxNYXRoR3JvdXApe1xyXG4gICAgICAgIC8vUGxhY2Vob2xkZXIgZm9yIG5vd1xyXG4gICAgICAgIHJldHVybiB0aGlzLmVxdWFscyhpdGVtKVxyXG4gICAgfVxyXG5cclxuICAgIGVxdWFscyhpdGVtOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3J8TWF0aEdyb3VwKXtcclxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgVG9rZW4pe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT0xJiZ0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW4mJnRoaXMuaXRlbXNbMF0uZXF1YWxzKGl0ZW0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09MSYmdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciYmdGhpcy5pdGVtc1swXS5lcXVhbHMoaXRlbSlcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCl7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PWl0ZW0uaXRlbXMubGVuZ3RoJiZ0aGlzLml0ZW1zLmV2ZXJ5KCh0OiBNYXRoR3JvdXBJdGVtKT0+e1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uaXRlbXMuc29tZSgoaSk9PnQuZXF1YWxzKGkpKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SWQoKXtcclxuICAgICAgICByZXR1cm4gJ01hdGhHcm91cCdcclxuICAgIH1cclxuICAgIGNvbWJpbmluZ0xpa2VUZXJtcygpIHtcclxuICAgICAgICBjb25zdCBvdmVydmlldz1uZXcgTWF0aE92ZXJ2aWV3KClcclxuICAgICAgICBvdmVydmlldy5kZWZpbmVPdmVydmlld1NlcGFyYXRlSW50b0luZGl2aWR1YWxzKHRoaXMuaXRlbXMpXHJcbiAgICAgICAgdGhpcy5zZXRJdGVtcyhvdmVydmlldy5yZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKSlcclxuICAgICAgICBjb25zb2xlLmxvZyhcImJlZm9yXCIsdGhpcy5pdGVtcyx0aGlzLnRvU3RyaW5nKCkpXHJcblxyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSwgaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXRlbXMgPSB0aGlzLml0ZW1zLmZpbHRlcigob3RoZXJJdGVtOiBNYXRoR3JvdXBJdGVtLCBvdGhlckluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlO1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNNYXRjaCA9IGl0ZW0uaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlckl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNNYXRjaDtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJhZnRlclwiLHRoaXMuaXRlbXMsdGhpcy50b1N0cmluZygpKVxyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XHJcbiAgICAgICAgaWYoIUFycmF5LmlzQXJyYXkodGhpcy5pdGVtcykpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBidXQgcmVjZWl2ZWQ6IFwiK3RoaXMuaXRlbXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHN0cmluZys9c2hvdWxkQWRkUGx1cyh0aGlzLml0ZW1zW2luZGV4LTFdLGl0ZW0pXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBgKCR7aXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpfSlgO1xyXG4gICAgICAgICAgICB9ICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XHJcbiAgICAgICAgICAgIH0gaWYgKGN1c3RvbUZvcm1hdHRlcikge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nID0gY3VzdG9tRm9ybWF0dGVyKGl0ZW0sc3RyaW5nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmc7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgTWF0aE92ZXJ2aWV3IHtcclxuICAgIHByaXZhdGUgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBhbnk+O1xyXG4gICAgcHJpdmF0ZSBvcGVyYXRvcnM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBwcml2YXRlIG51bWJlcjogbnVtYmVyO1xyXG4gICAgZ2V0TnVtYmVyKCk6IG51bWJlcntyZXR1cm4gdGhpcy5udW1iZXI7fVxyXG4gICAgZ2V0VmFyaWFibGVzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMudmFyaWFibGVzO31cclxuICAgIGdldE9wZXJhdG9ycygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLm9wZXJhdG9yczt9XHJcbiAgICBjb25zdHJ1Y3Rvcih2YXJpYWJsZXM/OiBNYXA8c3RyaW5nLCBhbnk+LG9wZXJhdG9ycz86IE1hcDxzdHJpbmcsIGFueT4sbnVtYmVyPzogbnVtYmVyKXtcclxuICAgICAgICBpZih2YXJpYWJsZXMpdGhpcy52YXJpYWJsZXM9dmFyaWFibGVzO1xyXG4gICAgICAgIGlmKG9wZXJhdG9ycyl0aGlzLm9wZXJhdG9ycz1vcGVyYXRvcnM7XHJcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcclxuICAgIH1cclxuICAgIGRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHMoaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSkge1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzPW5ldyBNYXAoKTtcclxuICAgICAgICB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XHJcbiAgICAgICAgaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVmFyaWFibGVzTWFwKGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmIWl0ZW0uaXNWYXIoKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU11bWJlcihpdGVtLmdldE51bWJlclZhbHVlKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlT3BlcmF0b3JzTWFwKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIGNhdGVnb3J5IGluIE1hdGhPdmVydmlldyBzZXBhcmF0ZUludG9JbmRpdmlkdWFsc1wiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH1cclxuICAgIHVwZGF0ZU11bWJlcihudW1iZXI6IG51bWJlcil7IHRoaXMubnVtYmVyPXRoaXMubnVtYmVyP3RoaXMubnVtYmVyK251bWJlcjpudW1iZXI7fVxyXG4gICAgdXBkYXRlVmFyaWFibGVzTWFwKGtleTogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcyA/Pz0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgaXRlbXM6IGFueVtdIH0+KCk7XHJcbiAgICAgICAgaWYoIXRoaXMudmFyaWFibGVzLmhhcyhrZXkpKXt0aGlzLnZhcmlhYmxlcy5zZXQoa2V5LHtjb3VudDogMH0pfVxyXG4gICAgICAgIHRoaXMudmFyaWFibGVzLmdldChrZXkpLmNvdW50Kys7XHJcbiAgICB9XHJcbiAgICB1cGRhdGVPcGVyYXRvcnNNYXAob3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICAgICAgY29uc3Qga2V5PW9wZXJhdG9yLm9wZXJhdG9yO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycy5oYXMoa2V5KSl7dGhpcy5vcGVyYXRvcnMuc2V0KGtleSx7Y291bnQ6IDAsIGl0ZW1zOiBbXX0pfVxyXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5vcGVyYXRvcnMuZ2V0KGtleSkhO1xyXG4gICAgICAgIGVudHJ5LmNvdW50ICs9IDE7XHJcbiAgICAgICAgZW50cnkuaXRlbXMucHVzaChvcGVyYXRvcik7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzVmFyKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzJiZ0aGlzLnZhcmlhYmxlcy5zaXplPjB9XHJcbiAgICBoYXNPcCgpe3JldHVybiB0aGlzLm9wZXJhdG9ycyYmdGhpcy5vcGVyYXRvcnMuc2l6ZT4wfVxyXG4gICAgb25seU51bWVyaWMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5udW1iZXImJiF0aGlzLmhhc1ZhcigpJiYhdGhpcy5oYXNPcCgpXHJcbiAgICB9XHJcbiAgICByZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKXtcclxuICAgICAgICBjb25zdCBpdGVtczogTWF0aEdyb3VwSXRlbVtdPVtdO1xyXG4gICAgICAgIGlmKHRoaXMubnVtYmVyKWl0ZW1zLnB1c2gobmV3IFRva2VuKHRoaXMubnVtYmVyKSk7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xyXG4gICAgICAgICAgICBpZih2YWx1ZS5jb3VudD09PTEpe1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChuZXcgVG9rZW4oa2V5KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmKHZhbHVlLmNvdW50PjEpe1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChNdWx0aXBsaWNhdGlvbk9wZXJhdG9yLmFzT2NjdXJyZW5jZUdyb3VwKHZhbHVlLmNvdW50LGtleSkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBpZih0aGlzLm9wZXJhdG9ycyl7XHJcbiAgICAgICAgICAgIGl0ZW1zLnB1c2goLi4uQXJyYXkuZnJvbSh0aGlzLm9wZXJhdG9ycy52YWx1ZXMoKSkuZmxhdE1hcCgob3BlcmF0b3I6IGFueSkgPT4gb3BlcmF0b3IuaXRlbXMpKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaXRlbXM7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRva2Vue1xyXG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOm51bWJlcnxzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBnZXROdW1iZXJWYWx1ZSgpOm51bWJlcntyZXR1cm4gKHRoaXMudmFsdWUgYXMgbnVtYmVyKX1cclxuICAgIGdldFN0cmluZ1ZhbHVlKCk6c3RyaW5ne3JldHVybiAodGhpcy52YWx1ZSBhcyBzdHJpbmcpfVxyXG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cclxuICAgIHNldFZhbHVlKHZhbHVlOiBudW1iZXJ8c3RyaW5nKXt0aGlzLnZhbHVlPXZhbHVlO31cclxuICAgIGlzVmFyKCkge3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZyc7fVxyXG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pIHtcclxuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLnZhbHVlID09PSBpdGVtLnZhbHVlO1xyXG4gICAgfVxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmKCF0aGlzLmlzVmFyKCkmJnRoaXMuZ2V0TnVtYmVyVmFsdWUoKTwwKVxyXG4gICAgICAgICAgICBzdHJpbmcrPSctJztcclxuICAgICAgICBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgaWYoY3VzdG9tRm9ybWF0dGVyKXtcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZztcclxuICAgIH1cclxuICAgIGNsb25lKCl7cmV0dXJuIG5ldyBUb2tlbih0aGlzLnZhbHVlKX1cclxufVxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW5ze1xyXG4gICAgdG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj49W107XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKHRva2Vucz86IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPil7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zfHxbXTtcclxuICAgIH1cclxuICAgIGFkZElucHV0KG1hdGg6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy50b2tlbml6ZShtYXRoKTtcclxuICAgIH1cclxuICAgIHRva2VuaXplKG1hdGg6IHN0cmluZyl7XHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMoKSlcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlPS9bXFwoXFwpXS8udGVzdChtYXRjaFswXSk/J3BhcmVuJzonb3BlcmF0b3InXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4odHlwZSxtYXRjaFswXSkpO1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTE7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKVxyXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljTWF0aEpheFRva2VuKCdudW1iZXInLHBhcnNlRmxvYXQobWF0Y2hbMF0pKSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLylcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbihcInZhcmlhYmxlXCIsbWF0Y2hbMF0pKVxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgdGhpcy5wb3N0UHJvY2Vzc1Rva2VucygpO1xyXG4gICAgfVxyXG5cclxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XHJcbiAgICAgICAgLypydWxlcyB0byBhYmlkIGJ5OlxyXG4gICAgICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcclxuICAgICAgICAqL1xyXG4gICAgICAgIHRoaXMudG9rZW5zPWlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcGFyZW5NYXA9dGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuXHJcbiAgICAgICAgcGFyZW5NYXAuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGIgLSBhKVxyXG4gICAgICAgIC5mb3JFYWNoKCh2YWx1ZTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3ICBCYXNpY01hdGhKYXhUb2tlbignb3BlcmF0b3InLCcqJykpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKClcclxuICAgIH1cclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKSB7XHJcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpfHwhKHRoaXMudG9rZW5zW2luZGV4XSBpbnN0YW5jZW9mIFBhcmVuKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBpZHggPSBmaW5kUGFyZW5JbmRleChpbmRleCx0aGlzLnRva2Vucyk/Lm9wZW47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaWR4ID09IG51bGwgfHwgIWlzT3BlblBhcmVuKHRoaXMudG9rZW5zW2luZGV4ICsgMV0pKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbaWR4IC0gMV07XHJcbiAgICAgICAgICAgIHJldHVybiAhKFxyXG4gICAgICAgICAgICAgICAgaWR4ID4gMCAmJlxyXG4gICAgICAgICAgICAgICAgcHJldlRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZcclxuICAgICAgICAgICAgICAgICFnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoWzEsIDJdKS5pbmNsdWRlcyhwcmV2VG9rZW4udmFsdWU/LnRvU3RyaW5nKCkgfHwgJycpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICBcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcclxuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdG9rZW4uaXNWYWx1ZVRva2VuKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uPSh0b2tlbjogYW55KT0+e1xyXG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiYmdHlwZW9mIHRva2VuLnZhbHVlPT09J3N0cmluZycmJmhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4udmFsdWUpXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBpc1Zhcj0odG9rZW46IGFueSk9PntyZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJnRva2VuLnR5cGU9PT0ndmFyaWFibGUnfVxyXG5cclxuICAgICAgICBjb25zdCBwcmVjZWRlc1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIGluZGV4PjAmJmlzVmFyKHRva2Vuc1tpbmRleF0pXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBmb2xsb3dzVmFyaWFibGUgPSAodG9rZW5zOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gaW5kZXg8dG9rZW5zLmxlbmd0aC0xJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNPcGVuUGFyZW4odG9rZW4pfHwgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuKXx8cHJlY2VkZXNWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNDbG9zZWRQYXJlbih0b2tlbil8fGZvbGxvd3NWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggKyAxKSB8fCB0ZXN0RG91YmxlUmlnaHQoaW5kZXgpID8gaW5kZXggKyAxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICByZXR1cm4gbWFwO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgdmFsaWRhdGVQbHVzTWludXMoKXtcclxuICAgICAgICAvLyBQbHVzZXMgYXJlIHNlcGFyYXRvcnMuVGhlcmVmb3JlLCB0aGV5IGRvIG5vdCBuZWVkIHRvIGJlIGhlcmUgQXMgdGhlIGV4cHJlc3Npb24gaXMgdG9rZW5bXVxyXG4gICAgICAgIC8vTWludXNlcyBvbiB0aGUgb3RoZXIgaGFuZC5jYW4gZWl0aGVyIGJlIGEgc2VwYXJhdG9yLiBPciBhIG5lZ2F0aXZlIHNpZ25cclxuICAgICAgICBjb25zdCBwbHVzTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VuLCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gJ0FkZGl0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxyXG4gICAgICAgIHBsdXNNYXAucmV2ZXJzZSgpLmZvckVhY2goKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LDEpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgbWludXNNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW4sIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSAnU3VidHJhY3Rpb24nP2luZGV4IDogbnVsbCkuZmlsdGVyKChpbmRleDogbnVtYmVyIHwgbnVsbCkgPT4gaW5kZXggIT09IG51bGwpXHJcbiAgICAgICAgXHJcbiAgICAgICAgbWludXNNYXAucmV2ZXJzZSgpLmZvckVhY2goKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgbmV4dFRva2VuID0gdGhpcy50b2tlbnNbaW5kZXggKyAxXTtcclxuICAgICAgICAgICAgaWYgKG5leHRUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHR5cGVvZiBuZXh0VG9rZW4udmFsdWUgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgbmV4dFRva2VuLnZhbHVlICo9IC0xO1xyXG4gICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgdmFsaWRhdGVJbmRleChpbmRleDogbnVtYmVyLG1hcmdpbj86IG51bWJlcil7XHJcbiAgICAgICAgbWFyZ2luPW1hcmdpbnx8MDtcclxuICAgICAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtbWFyZ2luO1xyXG4gICAgfVxyXG4gICAgY2xvbmUoKTogQmFzaWNNYXRoSmF4VG9rZW5zIHtcclxuICAgICAgICByZXR1cm4gbmV3IEJhc2ljTWF0aEpheFRva2Vucyh0aGlzLnRva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uY2xvbmUoKSkpO1xyXG4gICAgfVxyXG4gICAgLypcclxuICAgIFxyXG4gICAgXHJcbiAgICBtYXBQYXJlbkluZGV4ZXMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbjogYW55LCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4KSA6IG51bGwpXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgIH1cclxuXHJcbiAgICBmaWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFsKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW06IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeyBvcGVuOiBvcGVuSW5kZXgsIGNsb3NlOiBjbG9zZUluZGV4IH0gPSBpdGVtO1xyXG4gICAgICAgICAgICAgICAgaWYgKG9wZW5JbmRleCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodGhpcy50b2tlbnNbb3BlbkluZGV4IC0gMV0/LnR5cGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoY2xvc2VJbmRleCA8IHRoaXMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdPy5pc1ZhbHVlVG9rZW4oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH0pLmZsYXRNYXAoKGl0ZW06IGFueSkgPT4gW2l0ZW0ub3BlbiwgaXRlbS5jbG9zZV0pO1xyXG4gICAgfSAgICBcclxuICAgIFxyXG4gICAgXHJcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cclxuICAgICAgICAgICAgICAgICgodG9rZW5zW2luZGV4ICsgMl0/LnR5cGUgIT09IFwib3BlcmF0b3JcIiYmdG9rZW5zW2luZGV4IC0xXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiKVxyXG4gICAgICAgICAgICAgICAgJiYodGhpcy50b2tlbkNvbXBhcmUoXCJ0eXBlXCIsdGhpcy52YWx1ZVRva2VucygpLCB0b2tlbiwgdG9rZW5zW2luZGV4ICsgMV0pKVxyXG4gICAgICAgICkpO1xyXG4gICAgIH1cclxuICAgIFxyXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZnR5Z3ViaG5pbXBvXCIpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBtYXAgPSBuZXcgU2V0KHRoaXMuZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpKTtcclxuICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXzogYW55LCBpZHg6IHVua25vd24pID0+ICFtYXAuaGFzKGlkeCkpO1xyXG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXHJcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCArIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgbnVtTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSdudW1iZXInJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGFyciA9IFtcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXModmFyTWFwKSwgXHJcbiAgICAgICAgXTtcclxuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcclxuICAgICAgICBcclxuICAgICAgICBpZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxyXG4gICAgfVxyXG5cclxuICAgIFxyXG5cclxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcclxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcclxuICAgICAgICAgICAgJiYgIXRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKVxyXG4gICAgICAgIClcclxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxyXG4gICAgfVxyXG5cclxuICAgIGluc2VydFRva2VucyhzdGFydDogYW55LCBsZW5ndGg6IG51bWJlciwgb2JqZWN0czogYW55W10gfCBUb2tlbikge1xyXG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG5cclxuICAgIGluZGV4ZXNUb0FkZFBsdXModG9rZW5zOiBhbnlbXSl7XHJcbiAgICAgICAgcmV0dXJuIHRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+aW5kZXg+MFxyXG4gICAgICAgICAgICAmJnRva2Vuc1tpbmRleCAtIDFdPy5pc1ZhbHVlVG9rZW4oKVxyXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxyXG4gICAgICAgICkuZmlsdGVyKGl0ZW09Pml0ZW0hPT1udWxsKVxyXG4gICAgfVxyXG5cclxuICAgIHRva2VuQ29tcGFyZShjb21wYXJlOiBzdHJpbmcgfCBudW1iZXIsIHZhbHVlOiBzdHJpbmd8UmVnRXhwLCB0b2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9LCBuZXh0VG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSkge1xyXG4gICAgICAgIGNvbnN0IHJlZ0V4cHZhbHVlID0gKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSA/IHZhbHVlIDogbmV3IFJlZ0V4cCh2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgKHZhbHVlID09PSBudWxsIHx8IHJlZ0V4cHZhbHVlLnRlc3QodG9rZW5bY29tcGFyZV0pKSAmJlxyXG4gICAgICAgICAgICB0b2tlbltjb21wYXJlXSA9PT0gbmV4dFRva2VuPy5bY29tcGFyZV1cclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgKi9cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEJhc2ljTWF0aEpheFRva2Vue1xyXG4gICAgdHlwZTogc3RyaW5nO1xyXG4gICAgdmFsdWU/OiBzdHJpbmd8bnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHR5cGU6c3RyaW5nICx2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkKXtcclxuICAgICAgICB0aGlzLnR5cGU9dHlwZTtcclxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgICAgIHRoaXMuaW5zdXJQcm9wZXJGb3JtYXR0aW5nKClcclxuICAgIH1cclxuICAgIGluc3VyUHJvcGVyRm9ybWF0dGluZygpe1xyXG4gICAgICAgIGlmICghdGhpcy5pc1ZhbHVlVG9rZW4oKSYmdHlwZW9mIHRoaXMudmFsdWU9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICAgICAgdGhpcy52YWx1ZT1zZWFyY2hBbGxNYXRoSmF4T3BlcmF0b3JzQW5kU3ltYm9scyh0aGlzLnZhbHVlKT8ubmFtZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRMYXRleFN5bWJvbCgpe3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnP3NlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy52YWx1ZSk/LmxhdGV4OnVuZGVmaW5lZH1cclxuXHJcbiAgICBnZXRmdWxsVHlwZSgpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnR5cGVcclxuICAgIH1cclxuICAgIGNsb25lKCl7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBCYXNpY01hdGhKYXhUb2tlbih0aGlzLnR5cGUsIHRoaXMudmFsdWUpXHJcbiAgICB9XHJcblxyXG5cclxuICAgIGlzU3RyaW5nKCl7cmV0dXJuIHRoaXMudHlwZT09PSdwYXJlbid8fHRoaXMudHlwZT09PSdvcGVyYXRvcid9XHJcblxyXG4gICAgaXNWYWx1ZVRva2VuKCl7cmV0dXJuIHRoaXMudHlwZT09PSd2YXJpYWJsZSd8fHRoaXMudHlwZT09PSdudW1iZXInfVxyXG5cclxuICAgIHRvU3RyaW5nTGF0ZXgoKXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnXHJcbiAgICAgICAgaWYgKHRoaXMuaXNTdHJpbmcoKSlcclxuICAgICAgICAgICAgc3RyaW5nKz10aGlzLmdldExhdGV4U3ltYm9sKClcclxuICAgICAgICBpZiAodGhpcy50eXBlPT09J251bWJlcicpIHN0cmluZys9dGhpcy52YWx1ZTtcclxuICAgICAgICByZXR1cm4gc3RyaW5nXHJcbiAgICB9XHJcbiAgICBhZmZlY3RlZE9wZXJhdG9yUmFuZ2UoZGlyZWN0aW9uOiBzdHJpbmcpe1xyXG4gICAgICAgIGlmKHRoaXMudHlwZSE9PSdvcGVyYXRvcid8fHRoaXMudmFsdWU9PT0nRXF1YWxzJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgaWYodHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJyYmZGlyZWN0aW9uPT09J2xlZnQnJiYhaXNPcGVyYXRvcldpdGhBc3NvY2lhdGl2aXR5KHRoaXMudmFsdWUsIFstMSwgMV0sdHJ1ZSkpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcbn0iXX0=