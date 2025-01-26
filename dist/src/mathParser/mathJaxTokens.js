import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { BracketType } from "../staticData/encasings";
import { findParenIndex, Paren, idParentheses, parenState, } from "../utils/ParenUtensils";
import { getAllMathJaxReferences, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, searchMathJaxOperators } from "../staticData/dataManager";
import { parseOperator } from "./mathEngine";
import { BasicMathJaxToken } from "src/basicToken";
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
            if (item.getValue() && (item.getType() === "number" || item.getType() === "variable")) {
                acc.push(new Token(item.getValue()));
                return acc;
            }
            throw new Error(`Expected item to be a number or variable but received: ${item.getValue()}`);
        }
        return acc;
    }, []);
    return formattedItems;
}
function ensureAcceptableFormatForMathOperator(groups) {
    const formattedGroups = groups
        .reduce((acc, item) => {
        if (item instanceof MathGroup) {
            acc.push(item);
        }
        if (item instanceof Token || item instanceof MathJaxOperator) {
            acc.push(new MathGroup(item));
        }
        return acc;
    }, []);
    return formattedGroups;
}
function shouldAddPlus(group1, group2, distanceFromOperator) {
    if (!group1 || !group2 || !distanceFromOperator || distanceFromOperator === -1 || distanceFromOperator === 1)
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
        const metadata = searchMathJaxOperators(this.operator);
        if (!metadata)
            return '';
        if (metadata.associativity.numPositions > 2 || metadata.associativity.numPositions < 1) {
            throw new Error(`Invalid number of positions for associativity: ${metadata.associativity.numPositions}`);
        }
        const operator = metadata.latex;
        let index = 0;
        let string = '';
        const groupBracketType = (pos, group) => {
            if (!pos.isBracketOptional)
                return pos.bracketType;
            return group.singular() ? BracketType.None : pos.bracketType;
        };
        getValuesWithKeysBySide(metadata.associativity.positions, true).forEach(item => {
            if (!item)
                return;
            string += shouldAddPlus(this.groups[index - 1], this.groups[index], index);
            string += wrapGroup(this.groups[index].toString(), groupBracketType(item, this.groups[index]));
            index++;
        });
        string += operator;
        getValuesWithKeysBySide(metadata.associativity.positions, false).forEach(item => {
            if (!item)
                return;
            string += shouldAddPlus(this.groups[index], this.groups[index + 1], index);
            string += wrapGroup(this.groups[index].toString(), groupBracketType(item, this.groups[index]));
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
export class EqualsOperator extends MathJaxOperator {
}
export class DivisionOperator extends MathJaxOperator {
}
export class MultiplicationOperator extends MathJaxOperator {
    constructor(groups, solution) {
        super("Multiplication", 2, groups, solution, true);
        this.commutative = true;
        this.removeMultiplicationDepths();
    }
    removeMultiplicationDepths() {
        while (this.groups.some((g) => g.singular() && g.getItems()[0] instanceof MultiplicationOperator)) {
            const group = this.groups.find((g) => g.singular() && g.getItems()[0] instanceof MultiplicationOperator);
            if (group)
                this.groups.splice(this.groups.indexOf(group), 1, ...group.getItems()[0].groups);
        }
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
        const areGroupsMatching = currentGroup.occurrencOf.length === testItemGroupItems.length &&
            currentGroup.occurrencOf.every((currentSubGroup) => testItemGroupItems.some((testSubGroup) => currentSubGroup.isOccurrenceGroupMatch(testSubGroup)));
        if (areGroupsMatching) {
            this.addToOccurrenceGroup(testItemGroup.occurrencesCount);
            return true;
        }
        return true;
    }
    toString(customFormatter) {
        const operator = '\\cdot ';
        let string = '';
        const toAddCdot = (thisGroup, nextGroup) => {
            if (!nextGroup)
                return false;
            if (nextGroup.isSingleVar() || thisGroup.isSingleVar())
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
        const multArr = this.eliminatGroupsWithMultipleTerms().getItems();
        const name = multArr.map((o) => { o.parse(); return o.solution; });
        this.solution = new MathGroup(name);
        this.solution.combiningLikeTerms();
    }
    eliminatGroupsWithMultipleTerms() {
        let operatorsAccumulation = [];
        const singleTermGroups = this.groups.filter(group => group.singular());
        const multiTermGroups = this.groups.filter(group => !group.singular());
        const singlesMathGroup = singleTermGroups.length !== 0
            ? [new MathGroup([new MultiplicationOperator(singleTermGroups)])]
            : [];
        let groups = [...singlesMathGroup, ...multiTermGroups];
        while (groups.length > 1) {
            const groupA = groups.shift();
            const groupB = groups.shift();
            if (!groupA || !groupB)
                break;
            const groupAItems = groupA.getItems();
            const groupBItems = groupB.getItems();
            operatorsAccumulation = [];
            for (const a of groupAItems) {
                for (const b of groupBItems) {
                    operatorsAccumulation.push(new MultiplicationOperator(ensureAcceptableFormatForMathOperator([a.clone(), b.clone()])));
                }
            }
            groups.unshift(new MathGroup(operatorsAccumulation));
        }
        return groups[0];
    }
    parse() {
        const { numbers, other } = this.groups.reduce((result, item) => {
            if (item.singleNumber()) {
                result.numbers.push(item);
            }
            else {
                result.other.push(item);
            }
            return result;
        }, { numbers: [], other: [] });
        let value = 1;
        numbers.forEach(group => {
            value *= group.getItems()[0].getNumberValue();
        });
        if (this.groups.length === 0)
            throw new Error("");
        if ((numbers.length > 0 && other.length === 0) || value === 0) {
            this.solution = new MathGroup(new Token(value));
            return;
        }
        const test = (mainGroup, testGroup) => {
            if (mainGroup instanceof MathGroup && testGroup instanceof MathGroup) {
                return mainGroup.isPowGroupMatch(testGroup);
            }
            return false;
        };
        const filtered = filterByTestConst(other, test);
        const arr = [...filtered];
        if (value !== 1)
            arr.push(new Token(value));
        if (arr.length > 1) {
            this.solution = new MathGroup([new MultiplicationOperator(ensureAcceptableFormatForMathOperator(arr))]);
            return;
        }
        this.solution = new MathGroup(arr[0]);
    }
}
function a(groups) {
    const areAllGroupsSingular = groups.every(g => g.singular());
    let value = 0;
}
function filterByTestConst(items, test) {
    let index = 0;
    while (index < items.length) {
        const mainItem = items[index];
        const originalLength = items.length;
        items = items.filter((otherItem, otherIndex) => {
            if (index === otherIndex)
                return true; // Keep current item
            const temp = !test(mainItem, otherItem);
            return temp;
        });
        // Restart iteration if items were removed
        if (items.length < originalLength) {
            index = 0;
        }
        else {
            index++;
        }
    }
    return items;
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
    isOccurrenceGroupMatch(other) {
        const bothSingular = this.singular() && other.singular();
        const firstItemMathJaxoOerator = this.items[0] instanceof MathJaxOperator && other.getItems()[0] instanceof MathJaxOperator;
        if (!bothSingular && !firstItemMathJaxoOerator)
            return false;
        const a = this.items[0].isOccurrenceGroupMatch(other.getItems()[0]);
        return true;
        return this.equals(other);
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
        let index = 0;
        while (index < this.items.length) {
            const item = this.items[index];
            if (item instanceof MultiplicationOperator) {
                const originalLength = this.items.length;
                this.items = this.items.filter((otherItem, otherIndex) => {
                    if (index === otherIndex)
                        return true;
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
export function stringToBasicMathJaxTokens(string) {
    const tokens = tokenizeToBasicMathJaxTokens(string);
    postProcessTokens(tokens);
    validatePlusMinus(tokens);
    return tokens;
}
function tokenizeToBasicMathJaxTokens(math) {
    const tokens = [];
    const operators = arrToRegexString(getAllMathJaxReferences());
    for (let i = 0; i < math.length; i++) {
        let match = math.slice(i).match(regExp('^' + operators));
        if (!!match) {
            this.tokens.push(BasicMathJaxToken.create(match[0]));
            i += match[0].length - 1;
            continue;
        }
        match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
        if (!!match) {
            i += match[0].length - 1;
            this.tokens.push(BasicMathJaxToken.create(parseFloat(match[0])));
            continue;
        }
        //Add plus to make it multiple Letters.
        match = math.slice(i).match(/[a-zA-Z](_\([a-zA-Z0-9]*\))*/);
        if (!!match) {
            i += match[0].length - 1;
            this.tokens.push(BasicMathJaxToken.create(match[0]));
            continue;
        }
        throw new Error(`Unknown char "${math[i]}"`);
    }
    return tokens;
}
function postProcessTokens(tokens) {
    /*rules to abid by:
    1. +- If part of the number they are absorbed into the number
    */
    tokens = idParentheses(tokens);
    const parenMap = implicitMultiplicationMap(tokens);
    parenMap.sort((a, b) => b - a)
        .forEach((value) => {
        tokens.splice(value, 0, new BasicMathJaxToken('operator', '*'));
    });
}
function implicitMultiplicationMap(tokens) {
    const isABasicMathJaxTokenDoubleRightOp = (token) => {
        if (token && token instanceof BasicMathJaxToken) {
            return getOperatorsByAssociativity([1, 2]).includes(token.getStringValue());
        }
        return false;
    };
    /**
     *
     * @param index
     * @returns boolan => True if thar isn't a doubleRight operator.
     */
    const testDoubleRight = (index) => {
        if (!validateIndex(tokens, index) || !(tokens[index] instanceof Paren))
            return false;
        const idx = findParenIndex(index, tokens)?.open;
        if (idx == null || parenState(tokens[index + 1]))
            return false;
        const prevToken = tokens[idx - 1];
        return !isABasicMathJaxTokenDoubleRightOp(prevToken);
    };
    const check = (index) => {
        if (!validateIndex(tokens, index))
            return false;
        const token = tokens[index];
        return token instanceof BasicMathJaxToken && token.isValueToken();
    };
    const checkImplicitMultiplication = (token) => {
        return token instanceof BasicMathJaxToken && typeof token.getValue() === 'string' && hasImplicitMultiplication(token.getStringValue());
    };
    const isVar = (token) => { return token instanceof BasicMathJaxToken && token.getType() === 'variable'; };
    const precedesVariable = (tokens, index) => {
        return index > 0 && isVar(tokens[index]);
    };
    const followsVariable = (tokens, index) => {
        return index < tokens.length - 1 && isVar(tokens[index]);
    };
    const map = tokens
        .map((token, index) => {
        if (index > 0 && (parenState(token, true) || checkImplicitMultiplication(token) || precedesVariable(tokens, index))) {
            return check(index - 1) ? index : null;
        }
        else if (index < tokens.length - 1 && (parenState(token) || followsVariable(tokens, index))) {
            return check(index + 1) || testDoubleRight(index) ? index + 1 : null;
        }
        return null;
    })
        .filter((item) => item !== null);
    return map;
}
function validatePlusMinus(tokens) {
    // Pluses are separators.Therefore, they do not need to be here As the expression is token[]
    //Minuses on the other hand.can either be a separator. Or a negative sign
    const plusMap = tokens.map((token, index) => token instanceof BasicMathJaxToken && token.getValue() === 'Addition' ? index : null).filter((index) => index !== null);
    plusMap.reverse().forEach((index) => {
        tokens.splice(index, 1);
    });
    const minusMap = tokens.map((token, index) => token instanceof BasicMathJaxToken && token.getValue() === 'Subtraction' ? index : null).filter((index) => index !== null);
    minusMap.reverse().forEach((index) => {
        const nextToken = tokens[index + 1];
        if (nextToken instanceof BasicMathJaxToken && typeof nextToken.getValue() === 'number') {
            nextToken.setValue(nextToken.getNumberValue() * -1);
            tokens.splice(index, 1);
        }
    });
}
const validateIndex = (arr, index, margin = 0) => {
    return index >= 0 + margin && index < arr.length - margin;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBQyxhQUFhLEVBQUUsVUFBVSxHQUFJLE1BQU0sd0JBQXdCLENBQUM7QUFDM0YsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBb0Usc0JBQXNCLEVBQWlCLE1BQU0sMkJBQTJCLENBQUM7QUFFN1IsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUc3QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUVuRCxTQUFTLFNBQVMsQ0FBQyxLQUFhLEVBQUUsSUFBaUI7SUFDL0MsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNYLEtBQUssV0FBVyxDQUFDLFdBQVc7WUFDeEIsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO1FBQ3hCLEtBQUssV0FBVyxDQUFDLFdBQVc7WUFDeEIsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO1FBQ3hCO1lBQ0ksT0FBTyxLQUFLLENBQUM7SUFDckIsQ0FBQztBQUNMLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQzlCLFNBQWMsRUFDZCxTQUFpQyxFQUNqQyxPQUE0QixFQUFFO0lBRTlCLDREQUE0RDtJQUM1RCxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxtRUFBbUU7SUFD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RSxDQUFDLEdBQUMsTUFBTSxJQUFFLEtBQUssR0FBQyxHQUFHLENBQUMsTUFBTSxHQUFDLE1BQU0sQ0FBQztBQUNwRCxDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi9pbVZlcnlMYXp5XCI7XG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCByZWdFeHAgfSBmcm9tIFwiLi4vdGlrempheC90aWt6amF4XCI7XG5pbXBvcnQgeyBCcmFja2V0VHlwZSB9IGZyb20gXCIuLi9zdGF0aWNEYXRhL2VuY2FzaW5nc1wiO1xuaW1wb3J0IHsgZmluZFBhcmVuSW5kZXgsIFBhcmVuLGlkUGFyZW50aGVzZXMsIHBhcmVuU3RhdGUsICB9IGZyb20gXCIuLi91dGlscy9QYXJlblV0ZW5zaWxzXCI7XG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIGlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSwgc2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHMsIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi4vc3RhdGljRGF0YS9kYXRhTWFuYWdlclwiO1xuXG5pbXBvcnQgeyBwYXJzZU9wZXJhdG9yIH0gZnJvbSBcIi4vbWF0aEVuZ2luZVwiO1xuaW1wb3J0IHsgaXQgfSBmcm9tIFwibm9kZTp0ZXN0XCI7XG5pbXBvcnQgeyBzaWduYWwgfSBmcm9tIFwiY29kZW1pcnJvclwiO1xuaW1wb3J0IHsgQmFzaWNNYXRoSmF4VG9rZW4gfSBmcm9tIFwic3JjL2Jhc2ljVG9rZW5cIjtcblxuZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBzdHJpbmcsIHdyYXA6IEJyYWNrZXRUeXBlKTogc3RyaW5nIHtcbiAgICBzd2l0Y2ggKHdyYXApIHtcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5QYXJlbnRoZXNlczpcbiAgICAgICAgICAgIHJldHVybiBgKCR7Z3JvdXB9KWA7XG4gICAgICAgIGNhc2UgQnJhY2tldFR5cGUuQ3VybHlCcmFjZXM6XG4gICAgICAgICAgICByZXR1cm4gYHske2dyb3VwfX1gO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIGdyb3VwO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZXBTZWFyY2hXaXRoUGF0aChcbiAgICBzdHJ1Y3R1cmU6IGFueSxcbiAgICBwcmVkaWNhdGU6IChpdGVtOiBhbnkpID0+IGJvb2xlYW4sXG4gICAgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdXG4pOiB7IGl0ZW06IGFueTsgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSB9IHwgbnVsbCB7XG4gICAgLy8gQmFzZSBjYXNlOiBJZiB0aGUgY3VycmVudCBzdHJ1Y3R1cmUgbWF0Y2hlcyB0aGUgcHJlZGljYXRlXG4gICAgaWYgKHByZWRpY2F0ZShzdHJ1Y3R1cmUpKSB7XG4gICAgICAgIHJldHVybiB7IGl0ZW06IHN0cnVjdHVyZSwgcGF0aCB9O1xuICAgIH1cblxuICAgIC8vIElmIGl0J3MgYW4gYXJyYXksIHJlY3Vyc2l2ZWx5IHNlYXJjaCBlYWNoIGVsZW1lbnQgd2l0aCBpdHMgaW5kZXhcbiAgICBpZiAoQXJyYXkuaXNBcnJheShzdHJ1Y3R1cmUpKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RydWN0dXJlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2ldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBpXSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSWYgaXQncyBhbiBvYmplY3QsIHJlY3Vyc2l2ZWx5IHNlYXJjaCBpdHMgcHJvcGVydGllcyB3aXRoIHRoZWlyIGtleXNcbiAgICBpZiAoc3RydWN0dXJlICE9PSBudWxsICYmIHR5cGVvZiBzdHJ1Y3R1cmUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gc3RydWN0dXJlKSB7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0cnVjdHVyZSwga2V5KSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVba2V5XSwgcHJlZGljYXRlLCBbLi4ucGF0aCwga2V5XSk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIElmIG5vIG1hdGNoIGlzIGZvdW5kXG4gICAgcmV0dXJuIG51bGw7XG59XG50eXBlIGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwPU1hdGhHcm91cEl0ZW18TWF0aEdyb3VwfEJhc2ljTWF0aEpheFRva2VuXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKTogTWF0aEdyb3VwSXRlbVtdIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG4gICAgICAgIGl0ZW1zID0gW2l0ZW1zXTtcbiAgICB9XG5cbiAgICBjb25zdCBmb3JtYXR0ZWRJdGVtcyA9IGl0ZW1zXG4gICAgICAgIC5yZWR1Y2UoKGFjYzogTWF0aEdyb3VwSXRlbVtdLCBpdGVtOiBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciB8IEJhc2ljTWF0aEpheFRva2VuKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhY2MuY29uY2F0KGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtLmdldEl0ZW1zKCkpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSB7XG4gICAgICAgICAgICAgICAgYWNjLnB1c2goaXRlbSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbikge1xuICAgICAgICAgICAgICAgIGlmIChpdGVtLmdldFZhbHVlKCkgJiYgKGl0ZW0uZ2V0VHlwZSgpID09PSBcIm51bWJlclwiIHx8IGl0ZW0uZ2V0VHlwZSgpID09PSBcInZhcmlhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFjYy5wdXNoKG5ldyBUb2tlbihpdGVtLmdldFZhbHVlKCkpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICBgRXhwZWN0ZWQgaXRlbSB0byBiZSBhIG51bWJlciBvciB2YXJpYWJsZSBidXQgcmVjZWl2ZWQ6ICR7aXRlbS5nZXRWYWx1ZSgpfWBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfSwgW10pXG5cbiAgICByZXR1cm4gZm9ybWF0dGVkSXRlbXM7XG59XG5mdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKGdyb3VwczogKE1hdGhHcm91cEl0ZW18TWF0aEdyb3VwKVtdKTpNYXRoR3JvdXBbXXtcbiAgICBjb25zdCBmb3JtYXR0ZWRHcm91cHMgPSBncm91cHNcbiAgICAgICAgLnJlZHVjZSgoYWNjOiBNYXRoR3JvdXBbXSwgaXRlbTogVG9rZW4gfCBNYXRoR3JvdXAgfCBNYXRoSmF4T3BlcmF0b3IgKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCkge1xuICAgICAgICAgICAgICAgIGFjYy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSB7XG4gICAgICAgICAgICAgICAgYWNjLnB1c2gobmV3IE1hdGhHcm91cChpdGVtKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9LCBbXSlcblxuICAgIHJldHVybiBmb3JtYXR0ZWRHcm91cHM7XG59XG5cbmZ1bmN0aW9uIHNob3VsZEFkZFBsdXMoZ3JvdXAxPzogYW55LGdyb3VwMj86IGFueSxkaXN0YW5jZUZyb21PcGVyYXRvcj86IG51bWJlcil7XG4gICAgaWYoIWdyb3VwMXx8IWdyb3VwMnx8IWRpc3RhbmNlRnJvbU9wZXJhdG9yfHxkaXN0YW5jZUZyb21PcGVyYXRvcj09PS0xfHxkaXN0YW5jZUZyb21PcGVyYXRvcj09PTEpcmV0dXJuICcnO1xuXG4gICAgcmV0dXJuICcrJztcbn1cblxuZnVuY3Rpb24gY2FuQ29tYmluZShtYXRoOiBNYXRoR3JvdXAsb3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XG5cbn1cbmV4cG9ydCBjbGFzcyBNYXRoSmF4T3BlcmF0b3Ige1xuICAgIG9wZXJhdG9yOiBzdHJpbmc7XG4gICAgZ3JvdXBOdW06IG51bWJlciA9IDE7XG4gICAgZ3JvdXBzOiBNYXRoR3JvdXBbXTtcbiAgICBzb2x1dGlvbjogTWF0aEdyb3VwO1xuICAgIGNvbW11dGF0aXZlOiBib29sZWFuO1xuICAgIGlzT3BlcmFibGU6IGJvb2xlYW4gPSB0cnVlO1xuXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKSB7XG4gICAgICAgIGlmIChvcGVyYXRvcikgdGhpcy5vcGVyYXRvciA9IG9wZXJhdG9yO1xuICAgICAgICBpZiAoZ3JvdXBOdW0pIHRoaXMuZ3JvdXBOdW0gPSBncm91cE51bTtcbiAgICAgICAgaWYgKGdyb3VwcykgdGhpcy5ncm91cHMgPSBncm91cHM7XG4gICAgICAgIGlmIChzb2x1dGlvbikgdGhpcy5zb2x1dGlvbiA9IHNvbHV0aW9uO1xuICAgICAgICBpZiAoaXNPcGVyYWJsZSAhPT0gdW5kZWZpbmVkKSB0aGlzLmlzT3BlcmFibGUgPSBpc09wZXJhYmxlO1xuICAgIH1cbiAgICBzdGF0aWMgY3JlYXRlKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbik6IE1hdGhKYXhPcGVyYXRvciB7XG4gICAgICAgIGlmIChvcGVyYXRvciA9PT0gXCJNdWx0aXBsaWNhdGlvblwiKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZ3JvdXBzLCBzb2x1dGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoSmF4T3BlcmF0b3Iob3BlcmF0b3IsIGdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCBpc09wZXJhYmxlKTtcbiAgICB9XG4gICAgdGVzdEdyb3Vwcyh0ZXN0OiAoZ3JvdXA6IE1hdGhHcm91cCkgPT4gYm9vbGVhbik6IGJvb2xlYW5bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAodGVzdCk7XG4gICAgfVxuXG4gICAgbWFwVmFyaWFibGVzKCk6IGJvb2xlYW5bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaGFzVmFyaWFibGVzKCkpO1xuICAgIH1cblxuICAgIG9wZXJhdG9yVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIFsuLi5uZXcgU2V0KHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5ncm91cFZhcmlhYmxlcygpKS5mbGF0KCkpXTtcbiAgICB9XG5cbiAgICBjbG9uZSgpOiBNYXRoSmF4T3BlcmF0b3Ige1xuICAgICAgICBjb25zdCBncm91cHMgPSB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuY2xvbmUoKSk7XG4gICAgICAgIGNvbnN0IHNvbHV0aW9uID0gdGhpcy5zb2x1dGlvbiA/IHRoaXMuc29sdXRpb24uY2xvbmUoKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIE1hdGhKYXhPcGVyYXRvci5jcmVhdGUodGhpcy5vcGVyYXRvciwgdGhpcy5ncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgdGhpcy5pc09wZXJhYmxlKTtcbiAgICB9XG5cbiAgICB0b1N0cmluZ1NvbHV0aW9uKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nKCkgKyAnID0gJyArIHRoaXMuc29sdXRpb24/LnRvU3RyaW5nKCk7XG4gICAgfVxuXG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiZcbiAgICAgICAgICAgIHRoaXMub3BlcmF0b3IgPT09IGl0ZW0ub3BlcmF0b3IgJiZcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLmxlbmd0aCA9PT0gaXRlbS5ncm91cHMubGVuZ3RoICYmXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5ldmVyeSgodCwgaW5kZXgpID0+IHQuZXF1YWxzKGl0ZW0uZ3JvdXBzW2luZGV4XSkpO1xuICAgIH1cbiAgICBnZXRPY2N1cnJlbmNlR3JvdXAoKTogeyBvY2N1cnJlbmNlc0NvdW50OiBudW1iZXI7IG9jY3VycmVuY09mOiBNYXRoR3JvdXBbXSB9fG51bGwgIHsgcmV0dXJuIG51bGw7IH0gIFxuICAgIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7cmV0dXJuIGZhbHNlO31cbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcbiAgICAgICAgXG5cbiAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMub3BlcmF0b3IpO1xuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gJyc7XG4gICAgICAgIGlmKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPjJ8fG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPDEpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIG51bWJlciBvZiBwb3NpdGlvbnMgZm9yIGFzc29jaWF0aXZpdHk6ICR7bWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnN9YCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBvcGVyYXRvciA9IG1ldGFkYXRhLmxhdGV4O1xuICAgICAgICBsZXQgaW5kZXg9MDtcbiAgICAgICAgbGV0IHN0cmluZyA9ICcnO1xuICAgICAgICBjb25zdCBncm91cEJyYWNrZXRUeXBlPShwb3M6IHsgYnJhY2tldFR5cGU6IEJyYWNrZXRUeXBlOyBpc0JyYWNrZXRPcHRpb25hbDogYm9vbGVhbiB9LGdyb3VwOiBNYXRoR3JvdXApPT57XG4gICAgICAgICAgICBpZighcG9zLmlzQnJhY2tldE9wdGlvbmFsKVxuICAgICAgICAgICAgICAgIHJldHVybiBwb3MuYnJhY2tldFR5cGVcbiAgICAgICAgICAgIHJldHVybiBncm91cC5zaW5ndWxhcigpP0JyYWNrZXRUeXBlLk5vbmU6cG9zLmJyYWNrZXRUeXBlXG4gICAgICAgIH1cblxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyx0cnVlKS5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleC0xXSx0aGlzLmdyb3Vwc1tpbmRleF0saW5kZXgpO1xuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0udG9TdHJpbmcoKSxncm91cEJyYWNrZXRUeXBlKGl0ZW0sdGhpcy5ncm91cHNbaW5kZXhdKSk7XG4gICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdHJpbmcgKz0gb3BlcmF0b3I7XG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLGZhbHNlKS5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleF0sdGhpcy5ncm91cHNbaW5kZXgrMV0saW5kZXgpXG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XS50b1N0cmluZygpLGdyb3VwQnJhY2tldFR5cGUoaXRlbSx0aGlzLmdyb3Vwc1tpbmRleF0pKTtcbiAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcbiAgICAgICAgcmV0dXJuIHN0cmluZy50cmltKCk7XG4gICAgfVxuICAgIHBhcnNlTWF0aGpheE9wZXJhdG9yKCkge1xuICAgICAgICBwYXJzZU9wZXJhdG9yKHRoaXMpO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBFcXVhbHNPcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvcntcblxufVxuZXhwb3J0IGNsYXNzIERpdmlzaW9uT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3J7XG5cbn1cblxuZXhwb3J0IGNsYXNzIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3Ige1xuICAgIGNvbnN0cnVjdG9yKGdyb3Vwcz86IE1hdGhHcm91cFtdLCBzb2x1dGlvbj86IE1hdGhHcm91cCkge1xuICAgICAgICBzdXBlcihcIk11bHRpcGxpY2F0aW9uXCIsIDIsIGdyb3Vwcywgc29sdXRpb24sIHRydWUpO1xuICAgICAgICB0aGlzLmNvbW11dGF0aXZlID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5yZW1vdmVNdWx0aXBsaWNhdGlvbkRlcHRocygpO1xuICAgIH1cblxuICAgIHJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCl7XG4gICAgICAgIHdoaWxlKHRoaXMuZ3JvdXBzLnNvbWUoKGc6IE1hdGhHcm91cCk9PiBnLnNpbmd1bGFyKCkmJmcuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpKXtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwPXRoaXMuZ3JvdXBzLmZpbmQoKGc6IE1hdGhHcm91cCk9PiBnLnNpbmd1bGFyKCkmJmcuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpXG4gICAgICAgICAgICBpZihncm91cClcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnNwbGljZSh0aGlzLmdyb3Vwcy5pbmRleE9mKGdyb3VwKSwxLC4uLihncm91cC5nZXRJdGVtcygpWzBdIGFzIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpLmdyb3VwcylcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXRpYyBhc09jY3VycmVuY2VHcm91cChvY2N1cnJlbmNlc0NvdW50OiBudW1iZXIsb2NjdXJyZW5jT2Y6IHN0cmluZ3xUb2tlbnxNYXRoR3JvdXApOiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yIHtcbiAgICAgICAgb2NjdXJyZW5jT2Y9dHlwZW9mIG9jY3VycmVuY09mPT09XCJzdHJpbmdcIj9cbiAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNPZildKTpvY2N1cnJlbmNPZiBpbnN0YW5jZW9mIFRva2VuP1xuICAgICAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW29jY3VycmVuY09mXSk6b2NjdXJyZW5jT2Y7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKFtuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jZXNDb3VudCldKSxvY2N1cnJlbmNPZl0pXG4gICAgfVxuICAgIFxuICAgIG92ZXJyaWRlIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH0ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjOiB7IHRvdGFsTnVtOiBudW1iZXI7IGFycjogTWF0aEdyb3VwW10gfSwgaXRlbTogTWF0aEdyb3VwKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uZ2V0T3BlcmFibGVWYWx1ZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFjYy50b3RhbE51bSArPSBpdGVtLmdldE9wZXJhYmxlVmFsdWUoKSE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYWNjLmFyci5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgdG90YWxOdW06IDAsIGFycjogW10gfVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4geyBvY2N1cnJlbmNlc0NvdW50OiByZXN1bHQudG90YWxOdW0sIG9jY3VycmVuY09mOiByZXN1bHQuYXJyIH07XG4gICAgfVxuXG4gICAgYWRkVG9PY2N1cnJlbmNlR3JvdXAodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBudW1iZXJHcm91cCA9IHRoaXMuZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuc2luZ2xlTnVtYmVyKCkpO1xuICAgICAgICBpZiAobnVtYmVyR3JvdXApIHtcbiAgICAgICAgICAgIG51bWJlckdyb3VwLnNpbmdsZVRva2VuU2V0KHZhbHVlLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnB1c2gobmV3IE1hdGhHcm91cChbbmV3IFRva2VuKDEgKyB2YWx1ZSldKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvdmVycmlkZSBpc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RJdGVtOiBNYXRoSmF4T3BlcmF0b3IgfCBUb2tlbik6IGJvb2xlYW4ge1xuICAgICAgICBjb25zdCBpc1ZhbGlkSXRlbSA9IHRlc3RJdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgdGVzdEl0ZW0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yO1xuICAgICAgICBpZiAoIWlzVmFsaWRJdGVtKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgY29uc3QgY3VycmVudEdyb3VwID0gdGhpcy5nZXRPY2N1cnJlbmNlR3JvdXAoKTtcbiAgICAgICAgaWYgKCFjdXJyZW50R3JvdXApIHJldHVybiBmYWxzZTtcbiAgICBcbiAgICAgICAgY29uc3QgY3VycmVudEdyb3VwSXRlbXMgPSBjdXJyZW50R3JvdXAub2NjdXJyZW5jT2YuZmxhdE1hcChncm91cCA9PiBncm91cC5nZXRJdGVtcygpKTtcbiAgICBcbiAgICAgICAgaWYgKHRlc3RJdGVtIGluc3RhbmNlb2YgVG9rZW4pIHtcbiAgICAgICAgICAgIGNvbnN0IGlzU2luZ2xlSXRlbU1hdGNoID0gY3VycmVudEdyb3VwSXRlbXMubGVuZ3RoID09PSAxICYmIGN1cnJlbnRHcm91cEl0ZW1zWzBdLmVxdWFscyh0ZXN0SXRlbSk7XG4gICAgICAgICAgICBpZiAoaXNTaW5nbGVJdGVtTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFRvT2NjdXJyZW5jZUdyb3VwKDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGlzU2luZ2xlSXRlbU1hdGNoO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cCA9IHRlc3RJdGVtLmdldE9jY3VycmVuY2VHcm91cCgpO1xuICAgICAgICBpZiAoIXRlc3RJdGVtR3JvdXApIHJldHVybiBmYWxzZTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHRlc3RJdGVtR3JvdXBJdGVtcyA9IHRlc3RJdGVtR3JvdXAub2NjdXJyZW5jT2Y7XG4gICAgICAgIGNvbnN0IGFyZUdyb3Vwc01hdGNoaW5nID1jdXJyZW50R3JvdXAub2NjdXJyZW5jT2YubGVuZ3RoID09PSB0ZXN0SXRlbUdyb3VwSXRlbXMubGVuZ3RoICYmXG4gICAgICAgICAgICBjdXJyZW50R3JvdXAub2NjdXJyZW5jT2YuZXZlcnkoKGN1cnJlbnRTdWJHcm91cDogTWF0aEdyb3VwKSA9PlxuICAgICAgICAgICAgICAgIHRlc3RJdGVtR3JvdXBJdGVtcy5zb21lKCh0ZXN0U3ViR3JvdXA6IE1hdGhHcm91cCkgPT4gXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRTdWJHcm91cC5pc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RTdWJHcm91cClcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuXG4gICAgICAgIGlmIChhcmVHcm91cHNNYXRjaGluZykgeyBcbiAgICAgICAgICAgIHRoaXMuYWRkVG9PY2N1cnJlbmNlR3JvdXAodGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNlc0NvdW50KTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7IFxuICAgICAgICBjb25zdCBvcGVyYXRvciA9ICdcXFxcY2RvdCAnO1xuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XG4gICAgICAgIGNvbnN0IHRvQWRkQ2RvdD0odGhpc0dyb3VwOiBNYXRoR3JvdXAsbmV4dEdyb3VwPzpNYXRoR3JvdXApPT57XG4gICAgICAgICAgICBpZighbmV4dEdyb3VwKXJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGlmKG5leHRHcm91cC5pc1NpbmdsZVZhcigpfHx0aGlzR3JvdXAuaXNTaW5nbGVWYXIoKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlb3JkZXJlZEdyb3Vwcz10aGlzLmdyb3Vwcy5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICBpZiAoYS5zaW5nbGVOdW1iZXIoKSAmJiAhYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKCFhLnNpbmdsZU51bWJlcigpICYmIGIuc2luZ2xlTnVtYmVyKCkpIHJldHVybiAxO1xuICAgICAgICBcbiAgICAgICAgICAgIGlmIChhLnNpbmd1bGFyKCkgJiYgIWIuc2luZ3VsYXIoKSkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKCFhLnNpbmd1bGFyKCkgJiYgYi5zaW5ndWxhcigpKSByZXR1cm4gMTtcbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlb3JkZXJlZEdyb3Vwcy5mb3JFYWNoKChncm91cCxpbmRleCkgPT4ge1xuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cChncm91cC50b1N0cmluZygpLCBncm91cC5zaW5ndWxhcigpP0JyYWNrZXRUeXBlLk5vbmU6QnJhY2tldFR5cGUuUGFyZW50aGVzZXMpO1xuICAgICAgICAgICAgaWYgKHRvQWRkQ2RvdChncm91cCxyZW9yZGVyZWRHcm91cHNbaW5kZXgrMV0pKVxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGN1c3RvbUZvcm1hdHRlcikgXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxuICAgICAgICByZXR1cm4gc3RyaW5nLnRyaW0oKTtcbiAgICB9XG5cbiAgICAvKlxuICAgIHRoaXMuZ3JvdXBzID0gW1sxLCAyLCAzXSxbNCwgNSwgNl0sWzcsIDgsIDldXVxuICAgIEV4cGVjdGVkIE91dHB1dDpcbiAgICBbXG4gICAgICAgIDEqNCwgMSo1LCAxKjYsIDEqNywgMSo4LCAxKjksXG4gICAgICAgIDIqNCwgMio1LCAyKjYsIDIqNywgMio4LCAyKjksXG4gICAgICAgIDMqNCwgMyo1LCAzKjYsIDMqNywgMyo4LCAzKjksXG4gICAgICAgIDQqNywgNCo4LCA0KjksXG4gICAgICAgIDUqNywgNSo4LCA1KjksXG4gICAgICAgIDYqNywgNio4LCA2KjlcbiAgICBdICBcbiAgICAqL1xuICAgIHBhcnNlTWF0aGpheE9wZXJhdG9yKCk6IHZvaWQge1xuICAgICAgICBjb25zdCBtdWx0QXJyPXRoaXMuZWxpbWluYXRHcm91cHNXaXRoTXVsdGlwbGVUZXJtcygpLmdldEl0ZW1zKCk7XG4gICAgICAgIGNvbnN0IG5hbWU9bXVsdEFyci5tYXAoKG86IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpPT4ge28ucGFyc2UoKTtyZXR1cm4gby5zb2x1dGlvbn0pXG4gICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChuYW1lKTtcbiAgICAgICAgdGhpcy5zb2x1dGlvbi5jb21iaW5pbmdMaWtlVGVybXMoKTtcbiAgICB9XG4gICAgZWxpbWluYXRHcm91cHNXaXRoTXVsdGlwbGVUZXJtcygpOk1hdGhHcm91cCB7XG4gICAgICAgIGxldCBvcGVyYXRvcnNBY2N1bXVsYXRpb246IE11bHRpcGxpY2F0aW9uT3BlcmF0b3JbXSA9IFtdO1xuICAgICAgICBcbiAgICAgICAgY29uc3Qgc2luZ2xlVGVybUdyb3VwcyA9IHRoaXMuZ3JvdXBzLmZpbHRlcihncm91cCA9PiBncm91cC5zaW5ndWxhcigpKTtcbiAgICAgICAgY29uc3QgbXVsdGlUZXJtR3JvdXBzID0gdGhpcy5ncm91cHMuZmlsdGVyKGdyb3VwID0+ICFncm91cC5zaW5ndWxhcigpKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHNpbmdsZXNNYXRoR3JvdXAgPSBzaW5nbGVUZXJtR3JvdXBzLmxlbmd0aCAhPT0gMCBcbiAgICAgICAgICAgID8gW25ldyBNYXRoR3JvdXAoW25ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKHNpbmdsZVRlcm1Hcm91cHMpXSldIFxuICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgbGV0IGdyb3VwcyA9IFsuLi5zaW5nbGVzTWF0aEdyb3VwLCAuLi5tdWx0aVRlcm1Hcm91cHNdO1xuICAgIFxuICAgICAgICB3aGlsZSAoZ3JvdXBzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQSA9IGdyb3Vwcy5zaGlmdCgpO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBCID0gZ3JvdXBzLnNoaWZ0KCk7XG4gICAgXG4gICAgICAgICAgICBpZiAoIWdyb3VwQSB8fCAhZ3JvdXBCKSBicmVhaztcbiAgICBcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQUl0ZW1zID0gZ3JvdXBBLmdldEl0ZW1zKCk7XG4gICAgICAgICAgICBjb25zdCBncm91cEJJdGVtcyA9IGdyb3VwQi5nZXRJdGVtcygpO1xuICAgICAgICAgICAgb3BlcmF0b3JzQWNjdW11bGF0aW9uID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGEgb2YgZ3JvdXBBSXRlbXMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGIgb2YgZ3JvdXBCSXRlbXMpIHtcbiAgICAgICAgICAgICAgICAgICAgb3BlcmF0b3JzQWNjdW11bGF0aW9uLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKFthLmNsb25lKCksIGIuY2xvbmUoKV0pKVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIGdyb3Vwcy51bnNoaWZ0KG5ldyBNYXRoR3JvdXAob3BlcmF0b3JzQWNjdW11bGF0aW9uKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGdyb3Vwc1swXTtcbiAgICB9XG4gICAgXG5cbiAgICBwYXJzZSgpe1xuICAgICAgICBjb25zdCB7IG51bWJlcnMsIG90aGVyIH0gPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoKHJlc3VsdDogeyBudW1iZXJzOiBNYXRoR3JvdXBbXTsgb3RoZXI6IE1hdGhHcm91cFtdIH0sIGl0ZW06IE1hdGhHcm91cCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChpdGVtLnNpbmdsZU51bWJlcigpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5udW1iZXJzLnB1c2goaXRlbSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lm90aGVyLnB1c2goaXRlbSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBudW1iZXJzOiBbXSwgb3RoZXI6IFtdIH1cbiAgICAgICAgKTtcbiAgICAgICAgbGV0IHZhbHVlPTE7XG4gICAgICAgIG51bWJlcnMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgICAgICAgICB2YWx1ZSo9KGdyb3VwLmdldEl0ZW1zKClbMF1hcyBUb2tlbikuZ2V0TnVtYmVyVmFsdWUoKVxuICAgICAgICB9KTtcbiAgICAgICAgaWYodGhpcy5ncm91cHMubGVuZ3RoPT09MClcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlwiKTtcbiAgICAgICAgaWYoKG51bWJlcnMubGVuZ3RoPjAmJm90aGVyLmxlbmd0aD09PTApfHx2YWx1ZT09PTApe1xuICAgICAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKG5ldyBUb2tlbih2YWx1ZSkpO3JldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0ZXN0PShtYWluR3JvdXA6IGFueSwgdGVzdEdyb3VwOiBhbnkpPT57XG4gICAgICAgICAgICBpZihtYWluR3JvdXAgaW5zdGFuY2VvZiBNYXRoR3JvdXAmJnRlc3RHcm91cCBpbnN0YW5jZW9mIE1hdGhHcm91cCl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1haW5Hcm91cC5pc1Bvd0dyb3VwTWF0Y2godGVzdEdyb3VwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpbHRlcmVkPWZpbHRlckJ5VGVzdENvbnN0KG90aGVyLHRlc3QpO1xuICAgICAgICBjb25zdCBhcnI9Wy4uLmZpbHRlcmVkXTtcbiAgICAgICAgaWYodmFsdWUhPT0xKVxuICAgICAgICAgICAgYXJyLnB1c2gobmV3IFRva2VuKHZhbHVlKSk7XG5cbiAgICAgICAgaWYoYXJyLmxlbmd0aD4xKXtcbiAgICAgICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChbbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhPcGVyYXRvcihhcnIpKV0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChhcnJbMF0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYShncm91cHM6IE1hdGhHcm91cFtdKXtcbiAgICBjb25zdCBhcmVBbGxHcm91cHNTaW5ndWxhcj1ncm91cHMuZXZlcnkoZz0+Zy5zaW5ndWxhcigpKVxuICAgIGxldCB2YWx1ZT0wO1xufVxuXG5cbmZ1bmN0aW9uIGZpbHRlckJ5VGVzdENvbnN0KFxuICAgIGl0ZW1zOiBhbnlbXSxcbiAgICB0ZXN0OiAobWFpbkl0ZW06IGFueSwgdGVzdEl0ZW06IGFueSkgPT4gYm9vbGVhblxuKTogYW55W10ge1xuICAgIGxldCBpbmRleCA9IDA7XG4gICAgd2hpbGUgKGluZGV4IDwgaXRlbXMubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IG1haW5JdGVtID0gaXRlbXNbaW5kZXhdO1xuICAgICAgICBjb25zdCBvcmlnaW5hbExlbmd0aCA9IGl0ZW1zLmxlbmd0aDtcblxuICAgICAgICBpdGVtcyA9IGl0ZW1zLmZpbHRlcigob3RoZXJJdGVtLCBvdGhlckluZGV4KSA9PiB7XG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlOyAvLyBLZWVwIGN1cnJlbnQgaXRlbVxuICAgICAgICAgICAgY29uc3QgdGVtcD0hdGVzdChtYWluSXRlbSwgb3RoZXJJdGVtKTtcbiAgICAgICAgICAgIHJldHVybiB0ZW1wXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFJlc3RhcnQgaXRlcmF0aW9uIGlmIGl0ZW1zIHdlcmUgcmVtb3ZlZFxuICAgICAgICBpZiAoaXRlbXMubGVuZ3RoIDwgb3JpZ2luYWxMZW5ndGgpIHtcbiAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGl0ZW1zO1xufVxuXG5cbmZ1bmN0aW9uIHRyaWdvbm9tZXRyaWNJZGVudGl0aWVzKCl7XG5cbn1cblxuZXhwb3J0IHR5cGUgTWF0aEdyb3VwSXRlbT1Ub2tlbnxNYXRoSmF4T3BlcmF0b3JcblxuZXhwb3J0IGNsYXNzIE1hdGhHcm91cCB7XG4gICAgcHJpdmF0ZSBpdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XG4gICAgLy9vdmVydmlldzogTWF0aE92ZXJ2aWV3XG4gICAgXG4gICAgY29uc3RydWN0b3IoaXRlbXM/OiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XG4gICAgICAgIGlmKGl0ZW1zKXRoaXMuc2V0SXRlbXMoaXRlbXMpO1xuICAgIH1cbiAgICBnZXRJdGVtcygpOiBNYXRoR3JvdXBJdGVtW10ge3JldHVybiB0aGlzLml0ZW1zO31cbiAgICBzZXRJdGVtKGl0ZW06IE1hdGhHcm91cEl0ZW0saW5kZXg6bnVtYmVyKXtcbiAgICAgICAgdGhpcy5pdGVtc1tpbmRleF09aXRlbTtcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpXG4gICAgfVxuICAgIHJlcGxhY2VJdGVtQ2VsbChpdGVtOiBNYXRoR3JvdXBJdGVtfE1hdGhHcm91cCxpbmRleDpudW1iZXIpe1xuICAgICAgICB0aGlzLml0ZW1zLnNwbGljZShpbmRleCwxLC4uLmVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtKSlcbiAgICB9XG4gICAgc2V0SXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pIHtcbiAgICAgICAgdGhpcy5pdGVtcyA9IGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtcyk7XG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKSAgICBcbiAgICB9XG4gICAgZ3JvdXBWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xuICAgICAgICBjb25zdCB2YXJpYWJsZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSkgPT4ge1xuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiAmJiBpdGVtLmlzVmFyKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBpdGVtLmdldFN0cmluZ1ZhbHVlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCF2YXJpYWJsZXMuY29udGFpbnMoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB2YXJpYWJsZXM7XG4gICAgfVxuICAgIFxuICAgIHVwZGF0ZU92ZXJ2aWV3KCl7LypcbiAgICAgICAgdGhpcy5vdmVydmlldz1uZXcgTWF0aE92ZXJ2aWV3KClcbiAgICAgICAgdGhpcy5vdmVydmlldy5kZWZpbmVPdmVydmlld3NlcGFyYXRlSW50b0luZGl2aWR1YWxzKHRoaXMuaXRlbXMpKi9cbiAgICB9XG4gICAgc2luZ2xlVG9rZW5TZXQodmFsdWU6IG51bWJlcix0b0FkZD86IGJvb2xlYW4pe1xuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdIGFzIFRva2VuO1xuICAgICAgICBjb25zdCBuZXdWYWx1ZT10b0FkZD92YWx1ZSt0b2tlbi5nZXROdW1iZXJWYWx1ZSgpOnZhbHVlO1xuICAgICAgICBpZih0aGlzLnNpbmd1bGVUb2tlbigpKXtcbiAgICAgICAgICAgIHRva2VuLnNldFZhbHVlKG5ld1ZhbHVlKVxuICAgICAgICB9XG4gICAgfVxuICAgIGNsb25lKCk6IE1hdGhHcm91cCB7XG4gICAgICAgIHJldHVybiBuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXMubWFwKGl0ZW09Pml0ZW0uY2xvbmUoKSkpO1xuICAgIH1cblxuICAgIGhhc09wZXJhdG9yKCk6IHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpO31cbiAgICBkb2VzbnRIYXZlT3BlcmF0b3IoKTogIHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiAhdGhpcy5oYXNPcGVyYXRvcigpO31cbiAgICBzaW5nbGVOdW1iZXIoKXtyZXR1cm4gdGhpcy5zaW5ndWxhcigpJiZ0aGlzLm51bWJlck9ubHkoKX1cbiAgICBudW1iZXJPbmx5KCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLmV2ZXJ5KHQgPT4gKHQgaW5zdGFuY2VvZiBUb2tlbiYmIXQuaXNWYXIoKSkpO31cbiAgICBoYXNWYXJpYWJsZXMoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSh0ID0+IHQgaW5zdGFuY2VvZiBUb2tlbiYmdC5pc1ZhcigpKTt9XG5cbiAgICBzaW5ndWxhcigpOmJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLmxlbmd0aCA9PT0gMSAmJiB0aGlzLml0ZW1zWzBdICE9PSB1bmRlZmluZWQ7fVxuICAgIHNpbmd1bGVUb2tlbigpOiB0aGlzIGlzIHsgaXRlbXM6IFtUb2tlbl0gfSB7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSAmJiB0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW47fVxuICAgIGlzT3BlcmFibGUoKXtyZXR1cm4gdHJ1ZX1cblxuICAgIGdldE9wZXJhYmxlVmFsdWUoKTogbnVtYmVyIHwgbnVsbFxuICAgIHtcbiAgICAgICAgY29uc3QgaXRlbXMgPSB0aGlzLml0ZW1zO1xuICAgICAgICBpZiAodGhpcy5udW1iZXJPbmx5KCkpIHtcbiAgICAgICAgICAgIGxldCB2YWx1ZT0wO1xuICAgICAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbTogVG9rZW4pID0+IHtcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBpdGVtLmdldE51bWJlclZhbHVlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaXNTaW5nbGVWYXIoKXtcbiAgICAgICAgY29uc3QgdG9rZW49dGhpcy5pdGVtc1swXWFzIFRva2VuXG4gICAgICAgIHJldHVybiB0aGlzLnNpbmd1bGVUb2tlbigpJiZ0b2tlbi5pc1ZhcigpXG4gICAgfVxuICAgIGdldFNpbmdsZVZhcigpe1xuICAgICAgICBpZighdGhpcy5pc1NpbmdsZVZhcigpKXJldHVybiBudWxsO1xuICAgICAgICByZXR1cm4gKHRoaXMuaXRlbXNbMF1hcyBUb2tlbikuZ2V0U3RyaW5nVmFsdWUoKTtcbiAgICB9XG5cbiAgICBpc1Bvd0dyb3VwTWF0Y2goZ3JvdXA6IE1hdGhHcm91cCk6Ym9vbGVhbntcbiAgICAgICAgaWYodGhpcy5pdGVtcy5sZW5ndGghPT0xKXJldHVybiBmYWxzZVxuICAgICAgICBpZih0aGlzLmlzU2luZ2xlVmFyKCkmJmdyb3VwLmlzU2luZ2xlVmFyKCkmJnRoaXMuZXF1YWxzKGdyb3VwKSl7XG4gICAgICAgICAgICB0aGlzLml0ZW1zPVtNYXRoSmF4T3BlcmF0b3IuY3JlYXRlKFwiUG93ZXJcIiwyLFtuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXNbMF0pLG5ldyBNYXRoR3JvdXAobmV3IFRva2VuKDIpKV0pXVxuICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMoZ3JvdXApXG4gICAgfVxuXG4gICAgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlcjogTWF0aEdyb3VwKXtcbiAgICAgICAgY29uc3QgYm90aFNpbmd1bGFyPXRoaXMuc2luZ3VsYXIoKSYmb3RoZXIuc2luZ3VsYXIoKVxuICAgICAgICBjb25zdCBmaXJzdEl0ZW1NYXRoSmF4b09lcmF0b3I9dGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciYmb3RoZXIuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvclxuICAgICAgICBpZighYm90aFNpbmd1bGFyJiYhZmlyc3RJdGVtTWF0aEpheG9PZXJhdG9yKXJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3QgYT0odGhpcy5pdGVtc1swXWFzIE1hdGhKYXhPcGVyYXRvcikuaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlci5nZXRJdGVtcygpWzBdKVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHRoaXMuZXF1YWxzKG90aGVyKVxuICAgIH1cblxuICAgIGVxdWFscyhpdGVtOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3J8TWF0aEdyb3VwKXtcbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIFRva2VuKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy5pdGVtc1swXS5lcXVhbHMoaXRlbSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcil7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT0xJiZ0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yJiZ0aGlzLml0ZW1zWzBdLmVxdWFscyhpdGVtKVxuICAgICAgICB9XG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09aXRlbS5pdGVtcy5sZW5ndGgmJnRoaXMuaXRlbXMuZXZlcnkoKHQ6IE1hdGhHcm91cEl0ZW0pPT57XG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uaXRlbXMuc29tZSgoaSk9PnQuZXF1YWxzKGkpKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZ2V0SWQoKXtcbiAgICAgICAgcmV0dXJuICdNYXRoR3JvdXAnXG4gICAgfVxuICAgIGNvbWJpbmluZ0xpa2VUZXJtcygpIHtcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXcgPSBuZXcgTWF0aE92ZXJ2aWV3KCk7XG4gICAgICAgIG92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcyk7XG4gICAgICAgIHRoaXMuc2V0SXRlbXMob3ZlcnZpZXcucmVjb25zdHJ1Y3RBc01hdGhHcm91cEl0ZW1zKCkpO1xuICAgICAgICBsZXQgaW5kZXggPSAwO1xuICAgICAgICB3aGlsZSAoaW5kZXggPCB0aGlzLml0ZW1zLmxlbmd0aCkge1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbaW5kZXhdO1xuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxMZW5ndGggPSB0aGlzLml0ZW1zLmxlbmd0aDtcbiAgICAgICAgICAgICAgICB0aGlzLml0ZW1zID0gdGhpcy5pdGVtcy5maWx0ZXIoKG90aGVySXRlbTogTWF0aEdyb3VwSXRlbSwgb3RoZXJJbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA9PT0gb3RoZXJJbmRleCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc01hdGNoID0gaXRlbS5pc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVySXRlbSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNNYXRjaDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pdGVtcy5sZW5ndGggPCBvcmlnaW5hbExlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBpbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcbiAgICAgICAgbGV0IHN0cmluZz0nJztcbiAgICAgICAgaWYoIUFycmF5LmlzQXJyYXkodGhpcy5pdGVtcykpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgYnV0IHJlY2VpdmVkOiBcIit0aGlzLml0ZW1zKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XG4gICAgICAgICAgICBzdHJpbmcrPXNob3VsZEFkZFBsdXModGhpcy5pdGVtc1tpbmRleC0xXSxpdGVtKVxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXAgJiYgIWl0ZW0uc2luZ3VsYXIoKSkge1xuICAgICAgICAgICAgICAgIHN0cmluZyArPSBgKCR7aXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpfSlgO1xuICAgICAgICAgICAgfSAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IGl0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKTtcbiAgICAgICAgICAgIH0gaWYgKGN1c3RvbUZvcm1hdHRlcikge1xuICAgICAgICAgICAgICAgIHN0cmluZyA9IGN1c3RvbUZvcm1hdHRlcihpdGVtLHN0cmluZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gc3RyaW5nO1xuICAgIH1cbn1cblxuXG5cbmNsYXNzIE1hdGhPdmVydmlldyB7XG4gICAgcHJpdmF0ZSB2YXJpYWJsZXM6IE1hcDxzdHJpbmcsIGFueT47XG4gICAgcHJpdmF0ZSBvcGVyYXRvcnM6IE1hcDxzdHJpbmcsIGFueT47XG4gICAgcHJpdmF0ZSBudW1iZXI6IG51bWJlcjtcbiAgICBnZXROdW1iZXIoKTogbnVtYmVye3JldHVybiB0aGlzLm51bWJlcjt9XG4gICAgZ2V0VmFyaWFibGVzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMudmFyaWFibGVzO31cbiAgICBnZXRPcGVyYXRvcnMoKTogTWFwPHN0cmluZywgYW55PntyZXR1cm4gdGhpcy5vcGVyYXRvcnM7fVxuICAgIGNvbnN0cnVjdG9yKHZhcmlhYmxlcz86IE1hcDxzdHJpbmcsIGFueT4sb3BlcmF0b3JzPzogTWFwPHN0cmluZywgYW55PixudW1iZXI/OiBudW1iZXIpe1xuICAgICAgICBpZih2YXJpYWJsZXMpdGhpcy52YXJpYWJsZXM9dmFyaWFibGVzO1xuICAgICAgICBpZihvcGVyYXRvcnMpdGhpcy5vcGVyYXRvcnM9b3BlcmF0b3JzO1xuICAgICAgICBpZihudW1iZXIpdGhpcy5udW1iZXI9bnVtYmVyO1xuICAgIH1cbiAgICBkZWZpbmVPdmVydmlld1NlcGFyYXRlSW50b0luZGl2aWR1YWxzKGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10pIHtcbiAgICAgICAgdGhpcy52YXJpYWJsZXM9bmV3IE1hcCgpO1xuICAgICAgICB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XG4gICAgICAgIGl0ZW1zLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmaXRlbS5pc1ZhcigpOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVZhcmlhYmxlc01hcChpdGVtLmdldFN0cmluZ1ZhbHVlKCkpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmIWl0ZW0uaXNWYXIoKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVNdW1iZXIoaXRlbS5nZXROdW1iZXJWYWx1ZSgpKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU9wZXJhdG9yc01hcChpdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5rbm93biBjYXRlZ29yeSBpbiBNYXRoT3ZlcnZpZXcgc2VwYXJhdGVJbnRvSW5kaXZpZHVhbHNcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgfVxuICAgIHVwZGF0ZU11bWJlcihudW1iZXI6IG51bWJlcil7IHRoaXMubnVtYmVyPXRoaXMubnVtYmVyP3RoaXMubnVtYmVyK251bWJlcjpudW1iZXI7fVxuICAgIHVwZGF0ZVZhcmlhYmxlc01hcChrZXk6IHN0cmluZyl7XG4gICAgICAgIHRoaXMudmFyaWFibGVzID8/PSBuZXcgTWFwPHN0cmluZywgeyBjb3VudDogbnVtYmVyOyBpdGVtczogYW55W10gfT4oKTtcbiAgICAgICAgaWYoIXRoaXMudmFyaWFibGVzLmhhcyhrZXkpKXt0aGlzLnZhcmlhYmxlcy5zZXQoa2V5LHtjb3VudDogMH0pfVxuICAgICAgICB0aGlzLnZhcmlhYmxlcy5nZXQoa2V5KS5jb3VudCsrO1xuICAgIH1cbiAgICB1cGRhdGVPcGVyYXRvcnNNYXAob3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XG4gICAgICAgIGNvbnN0IGtleT1vcGVyYXRvci5vcGVyYXRvcjtcbiAgICAgICAgaWYoIXRoaXMub3BlcmF0b3JzKSB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycy5oYXMoa2V5KSl7dGhpcy5vcGVyYXRvcnMuc2V0KGtleSx7Y291bnQ6IDAsIGl0ZW1zOiBbXX0pfVxuICAgICAgICBjb25zdCBlbnRyeSA9IHRoaXMub3BlcmF0b3JzLmdldChrZXkpITtcbiAgICAgICAgZW50cnkuY291bnQgKz0gMTtcbiAgICAgICAgZW50cnkuaXRlbXMucHVzaChvcGVyYXRvcik7XG4gICAgfVxuXG4gICAgaGFzVmFyKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzJiZ0aGlzLnZhcmlhYmxlcy5zaXplPjB9XG4gICAgaGFzT3AoKXtyZXR1cm4gdGhpcy5vcGVyYXRvcnMmJnRoaXMub3BlcmF0b3JzLnNpemU+MH1cbiAgICBvbmx5TnVtZXJpYygpe1xuICAgICAgICByZXR1cm4gdGhpcy5udW1iZXImJiF0aGlzLmhhc1ZhcigpJiYhdGhpcy5oYXNPcCgpXG4gICAgfVxuICAgIHJlY29uc3RydWN0QXNNYXRoR3JvdXBJdGVtcygpe1xuICAgICAgICBjb25zdCBpdGVtczogTWF0aEdyb3VwSXRlbVtdPVtdO1xuICAgICAgICBpZih0aGlzLm51bWJlcilpdGVtcy5wdXNoKG5ldyBUb2tlbih0aGlzLm51bWJlcikpO1xuICAgICAgICB0aGlzLnZhcmlhYmxlcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZih2YWx1ZS5jb3VudD09PTEpe1xuICAgICAgICAgICAgICAgIGl0ZW1zLnB1c2gobmV3IFRva2VuKGtleSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmKHZhbHVlLmNvdW50PjEpe1xuICAgICAgICAgICAgICAgIGl0ZW1zLnB1c2goTXVsdGlwbGljYXRpb25PcGVyYXRvci5hc09jY3VycmVuY2VHcm91cCh2YWx1ZS5jb3VudCxrZXkpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWYodGhpcy5vcGVyYXRvcnMpe1xuICAgICAgICAgICAgaXRlbXMucHVzaCguLi5BcnJheS5mcm9tKHRoaXMub3BlcmF0b3JzLnZhbHVlcygpKS5mbGF0TWFwKChvcGVyYXRvcjogYW55KSA9PiBvcGVyYXRvci5pdGVtcykpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGl0ZW1zO1xuICAgIH1cbn1cblxuXG5cblxuXG5cbmV4cG9ydCBjbGFzcyBUb2tlbntcbiAgICBwcml2YXRlIHZhbHVlOiBudW1iZXJ8c3RyaW5nO1xuICAgIGNvbnN0cnVjdG9yKHZhbHVlOm51bWJlcnxzdHJpbmcpe1xuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xuICAgIH1cbiAgICBnZXROdW1iZXJWYWx1ZSgpOm51bWJlcntyZXR1cm4gKHRoaXMudmFsdWUgYXMgbnVtYmVyKX1cbiAgICBnZXRTdHJpbmdWYWx1ZSgpOnN0cmluZ3tyZXR1cm4gKHRoaXMudmFsdWUgYXMgc3RyaW5nKX1cbiAgICBnZXRWYWx1ZSgpe3JldHVybiB0aGlzLnZhbHVlfVxuICAgIHNldFZhbHVlKHZhbHVlOiBudW1iZXJ8c3RyaW5nKXt0aGlzLnZhbHVlPXZhbHVlO31cbiAgICBpc1ZhcigpIHtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWUgPT09ICdzdHJpbmcnO31cbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSkge1xuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLnZhbHVlID09PSBpdGVtLnZhbHVlO1xuICAgIH1cbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xuICAgICAgICBpZighdGhpcy5pc1ZhcigpJiZ0aGlzLmdldE51bWJlclZhbHVlKCk8MClcbiAgICAgICAgICAgIHN0cmluZys9Jy0nO1xuICAgICAgICBzdHJpbmcrPXRoaXMudmFsdWU7XG4gICAgICAgIGlmKGN1c3RvbUZvcm1hdHRlcil7XG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdHJpbmc7XG4gICAgfVxuICAgIGNsb25lKCl7cmV0dXJuIG5ldyBUb2tlbih0aGlzLnZhbHVlKX1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5nVG9CYXNpY01hdGhKYXhUb2tlbnMoc3RyaW5nOiBTdHJpbmcpOkFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPntcbiAgICBjb25zdCB0b2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPj10b2tlbml6ZVRvQmFzaWNNYXRoSmF4VG9rZW5zKHN0cmluZyk7XG4gICAgcG9zdFByb2Nlc3NUb2tlbnModG9rZW5zKTtcbiAgICB2YWxpZGF0ZVBsdXNNaW51cyh0b2tlbnMpO1xuICAgIHJldHVybiB0b2tlbnM7XG59XG5cbmZ1bmN0aW9uIHRva2VuaXplVG9CYXNpY01hdGhKYXhUb2tlbnMobWF0aDogU3RyaW5nKTpBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj57XG4gICAgY29uc3QgdG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj49W107XG4gICAgY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMoKSlcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XG4gICAgICAgIGlmICghIW1hdGNoKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKEJhc2ljTWF0aEpheFRva2VuLmNyZWF0ZShtYXRjaFswXSkpO1xuICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKS8pOy8vKFthLXpBLVpdPykvKTtcbiAgICAgICAgaWYgKCEhbWF0Y2gpXG4gICAgICAgIHsgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChCYXNpY01hdGhKYXhUb2tlbi5jcmVhdGUocGFyc2VGbG9hdChtYXRjaFswXSkpKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vQWRkIHBsdXMgdG8gbWFrZSBpdCBtdWx0aXBsZSBMZXR0ZXJzLlxuICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXShfXFwoW2EtekEtWjAtOV0qXFwpKSovKVxuICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goQmFzaWNNYXRoSmF4VG9rZW4uY3JlYXRlKG1hdGNoWzBdKSlcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRva2Vucztcbn1cbmZ1bmN0aW9uIHBvc3RQcm9jZXNzVG9rZW5zKHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+KXtcbiAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XG4gICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxuICAgICovXG4gICAgdG9rZW5zPWlkUGFyZW50aGVzZXModG9rZW5zKTtcbiAgICBcbiAgICBjb25zdCBwYXJlbk1hcD1pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKHRva2Vucyk7XG5cbiAgICBwYXJlbk1hcC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYiAtIGEpXG4gICAgLmZvckVhY2goKHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgdG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3ICBCYXNpY01hdGhKYXhUb2tlbignb3BlcmF0b3InLCcqJykpO1xuICAgIH0pO1xufVxuXG5cbmZ1bmN0aW9uIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAodG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj4pIHtcbiAgICBjb25zdCBpc0FCYXNpY01hdGhKYXhUb2tlbkRvdWJsZVJpZ2h0T3A9KHRva2VuPzogYW55KT0+e1xuICAgICAgICBpZih0b2tlbiYmdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbil7XG4gICAgICAgICAgICByZXR1cm4gZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXModG9rZW4uZ2V0U3RyaW5nVmFsdWUoKSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0gaW5kZXggXG4gICAgICogQHJldHVybnMgYm9vbGFuID0+IFRydWUgaWYgdGhhciBpc24ndCBhIGRvdWJsZVJpZ2h0IG9wZXJhdG9yLlxuICAgICAqL1xuICAgIGNvbnN0IHRlc3REb3VibGVSaWdodCA9IChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgIGlmICghdmFsaWRhdGVJbmRleCh0b2tlbnMsaW5kZXgpfHwhKHRva2Vuc1tpbmRleF0gaW5zdGFuY2VvZiBQYXJlbikpIHJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3QgaWR4ID0gZmluZFBhcmVuSW5kZXgoaW5kZXgsdG9rZW5zKT8ub3BlbjtcbiAgICAgICAgaWYgKGlkeCA9PSBudWxsIHx8IHBhcmVuU3RhdGUodG9rZW5zW2luZGV4ICsgMV0pKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgY29uc3QgcHJldlRva2VuID0gdG9rZW5zW2lkeCAtIDFdO1xuICAgICAgICByZXR1cm4gIWlzQUJhc2ljTWF0aEpheFRva2VuRG91YmxlUmlnaHRPcChwcmV2VG9rZW4pXG4gICAgfTtcblxuXG4gICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICBpZiAoIXZhbGlkYXRlSW5kZXgodG9rZW5zLGluZGV4KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjb25zdCB0b2tlbiA9IHRva2Vuc1tpbmRleF07XG4gICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHRva2VuLmlzVmFsdWVUb2tlbigpO1xuICAgIH07XG5cbiAgICBjb25zdCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb249KHRva2VuOiBhbnkpPT57XG4gICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0eXBlb2YgdG9rZW4uZ2V0VmFsdWUoKT09PSdzdHJpbmcnJiZoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLmdldFN0cmluZ1ZhbHVlKCkpXG4gICAgfVxuXG4gICAgY29uc3QgaXNWYXI9KHRva2VuOiBhbnkpPT57cmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZ0b2tlbi5nZXRUeXBlKCk9PT0ndmFyaWFibGUnfVxuXG4gICAgY29uc3QgcHJlY2VkZXNWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgIHJldHVybiBpbmRleD4wJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxuICAgIH07XG4gICAgXG4gICAgY29uc3QgZm9sbG93c1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgcmV0dXJuIGluZGV4PHRva2Vucy5sZW5ndGgtMSYmaXNWYXIodG9rZW5zW2luZGV4XSlcbiAgICB9O1xuICAgIFxuICAgIGNvbnN0IG1hcCA9IHRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGlmIChpbmRleD4wJiYocGFyZW5TdGF0ZSh0b2tlbix0cnVlKXx8IGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbil8fHByZWNlZGVzVmFyaWFibGUodG9rZW5zLGluZGV4KSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaW5kZXg8dG9rZW5zLmxlbmd0aC0xJiYocGFyZW5TdGF0ZSh0b2tlbiwpfHxmb2xsb3dzVmFyaWFibGUodG9rZW5zLGluZGV4KSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggKyAxKSB8fCB0ZXN0RG91YmxlUmlnaHQoaW5kZXgpID8gaW5kZXggKyAxIDogbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9KVxuICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtICE9PSBudWxsKTtcbiAgICByZXR1cm4gbWFwO1xufVxuXG5cblxuXG5mdW5jdGlvbiB2YWxpZGF0ZVBsdXNNaW51cyh0b2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPil7XG4gICAgLy8gUGx1c2VzIGFyZSBzZXBhcmF0b3JzLlRoZXJlZm9yZSwgdGhleSBkbyBub3QgbmVlZCB0byBiZSBoZXJlIEFzIHRoZSBleHByZXNzaW9uIGlzIHRva2VuW11cbiAgICAvL01pbnVzZXMgb24gdGhlIG90aGVyIGhhbmQuY2FuIGVpdGhlciBiZSBhIHNlcGFyYXRvci4gT3IgYSBuZWdhdGl2ZSBzaWduXG4gICAgY29uc3QgcGx1c01hcD10b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW58UGFyZW4sIGluZGV4OiBhbnkpID0+IHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnRva2VuLmdldFZhbHVlKCkgPT09ICdBZGRpdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcbiAgICBwbHVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgIHRva2Vucy5zcGxpY2UoaW5kZXgsMSlcbiAgICB9KTtcbiAgICBjb25zdCBtaW51c01hcD10b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW58UGFyZW4sIGluZGV4OiBhbnkpID0+IHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnRva2VuLmdldFZhbHVlKCkgPT09ICdTdWJ0cmFjdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcbiAgICBcbiAgICBtaW51c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0b2tlbnNbaW5kZXggKyAxXTtcbiAgICAgICAgaWYgKG5leHRUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHR5cGVvZiBuZXh0VG9rZW4uZ2V0VmFsdWUoKSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIG5leHRUb2tlbi5zZXRWYWx1ZShuZXh0VG9rZW4uZ2V0TnVtYmVyVmFsdWUoKSAqIC0xKVxuICAgICAgICAgICAgdG9rZW5zLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xufVxuXG5jb25zdCB2YWxpZGF0ZUluZGV4PShhcnI6IGFueVtdLGluZGV4OiBudW1iZXIsbWFyZ2luOiBudW1iZXI9MCk9PntcbiAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDxhcnIubGVuZ3RoLW1hcmdpbjtcbn0iXX0=