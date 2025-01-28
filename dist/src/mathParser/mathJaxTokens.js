import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { BracketType } from "../staticData/encasings";
import { findParenIndex, Paren, idParentheses, parenState, } from "../utils/ParenUtensils";
import { associativitymetadataByType, getAllMathJaxReferences, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, searchMathJaxOperators } from "../staticData/dataManager";
import { parseOperator } from "./mathEngine";
import { BasicMathJaxToken } from "src/mathParser/basicToken";
import { associativityFormatType } from "src/staticData/mathParserStaticData";
function groupBracketType(group, pos = { bracketType: BracketType.Parentheses, isBracketOptional: true }) {
    if (!pos.isBracketOptional)
        return pos.bracketType;
    return group.singular() ? BracketType.None : pos === null || pos === void 0 ? void 0 : pos.bracketType;
}
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
            console.warn("items,acc", items, acc);
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
    constructor(operator, groupNum, groups, solution, isOperable) {
        this.groupNum = 1;
        this.isOperable = true;
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
        var _a;
        return this.toString() + ' = ' + ((_a = this.solution) === null || _a === void 0 ? void 0 : _a.toString());
    }
    equals(item) {
        return item instanceof MathJaxOperator &&
            this.operator === item.operator &&
            this.groups.length === item.groups.length &&
            this.groups.every((t, index) => t.equals(item.groups[index]));
    }
    getOccurrenceGroup() { return null; }
    isOccurrenceGroupMatch(testItem) { return false; }
    toString(formatType = associativityFormatType.MathJax, customFormatter) {
        const metadata = searchMathJaxOperators(this.operator);
        if (!metadata)
            return '';
        const associativity = associativitymetadataByType(metadata, formatType);
        let index = 0, string = '';
        ({ string, index } = processAssociativityPositions(associativity.positions, string, this.groups, index, false));
        string += associativity.string;
        ({ string, index } = processAssociativityPositions(associativity.positions, string, this.groups, index, true));
        if (customFormatter)
            return customFormatter(this, string);
        return string.trim();
    }
    parseMathjaxOperator() {
        parseOperator(this);
    }
}
function processAssociativityPositions(positions, string, groups, index, isLeft = false) {
    getValuesWithKeysBySide(positions, true).forEach(item => {
        if (!item)
            return;
        string += shouldAddPlus(groups[isLeft ? index - 1 : index], groups[isLeft ? index : index + 1], index);
        string += wrapGroup(groups[index].toString(), groupBracketType(item, groups[index]));
        index++;
    });
    return { string, index };
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
    toString(formatType = associativityFormatType.MathJax, customFormatter) {
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
    //overview: MathOverview
    constructor(items) {
        this.items = [];
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
                string += item.toString(undefined, customFormatter);
            }
            if (customFormatter) {
                string = customFormatter(item, string);
            }
        });
        return string;
    }
    toStringLatex(customFormatter) {
        let string = '';
        if (!Array.isArray(this.items)) {
            throw new Error("Expected items to be an array but received: " + this.items);
        }
        this.items.forEach((item, index) => {
            string += shouldAddPlus(this.items[index - 1], item);
            if (item instanceof MathGroup && !item.singular()) {
                string += `(${item.toString(customFormatter)})`;
            }
            else if (item instanceof MathJaxOperator) {
                string += item.toString(associativityFormatType.Latex, customFormatter);
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
        var _a;
        (_a = this.variables) !== null && _a !== void 0 ? _a : (this.variables = new Map());
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
    let tokens = tokenizeToBasicMathJaxTokens(string);
    tokens = postProcessTokens(tokens);
    validatePlusMinus(tokens);
    return tokens;
}
function tokenizeToBasicMathJaxTokens(math) {
    const tokens = [];
    const operators = arrToRegexString(getAllMathJaxReferences());
    for (let i = 0; i < math.length; i++) {
        let match = math.slice(i).match(regExp('^' + operators));
        if (!!match) {
            tokens.push(BasicMathJaxToken.create(match[0]));
            i += match[0].length - 1;
            continue;
        }
        match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
        if (!!match) {
            i += match[0].length - 1;
            tokens.push(BasicMathJaxToken.create(parseFloat(match[0])));
            continue;
        }
        //Add plus to make it multiple Letters.
        match = math.slice(i).match(/[a-zA-Z](_\([a-zA-Z0-9]*\))*/);
        if (!!match) {
            i += match[0].length - 1;
            tokens.push(BasicMathJaxToken.create(match[0]));
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
    return tokens;
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
        var _a;
        if (!validateIndex(tokens, index) || !(tokens[index] instanceof Paren))
            return false;
        const idx = (_a = findParenIndex(index, tokens)) === null || _a === void 0 ? void 0 : _a.open;
        if (idx == null || parenState(tokens[index + 1]))
            return false;
        const prevToken = tokens[idx - 1];
        return !isABasicMathJaxTokenDoubleRightOp(prevToken);
    };
    const checkImplicitMultiplication = (token) => {
        return token instanceof BasicMathJaxToken && typeof token.getValue() === 'string' && hasImplicitMultiplication(token.getStringValue());
    };
    const isVar = (token) => { return token instanceof BasicMathJaxToken && token.getType() === 'variable'; };
    const implicitMultiplicationBefore = (token, index) => {
        //cant have before if it is the first token
        if (index === 0)
            return false;
        //the only befor tokens are opaning parentheses certain operator types and variables 
        if (parenState(token, true)) {
            console.log('parenStateOpan');
            return true;
        }
        else if (isVar(token) || checkImplicitMultiplication(token)) {
            return true;
        }
        return false;
    };
    const implicitMultiplicationAfter = (token, index) => {
        //cant have after if it is the last token
        if (index === tokens.length - 1)
            return false;
        if (parenState(token) || isVar(token)) {
            return true;
        }
        return false;
    };
    const isImplicitMultiplicationInteraction = (tokens1, token2, index) => {
        const arr = [tokens1, token2];
        if (arr.some((token) => !token)) {
            return false;
        }
        const varMap = arr.map((token) => isVar(token));
        return false;
    };
    const map = tokens
        .map((token, index) => {
        if (isImplicitMultiplicationInteraction(tokens[index - 1], token, index)) {
            return index;
        }
        return null;
    })
        .filter((item) => item !== null);
    console.log('map', map);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBQyxhQUFhLEVBQUUsVUFBVSxHQUFJLE1BQU0sd0JBQXdCLENBQUM7QUFDM0YsT0FBTyxFQUFFLDJCQUEyQixFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBa0csc0JBQXNCLEVBQWlCLE1BQU0sMkJBQTJCLENBQUM7QUFFeFYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUM3QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RSxTQUFTLGdCQUFnQixDQUFDLEtBQWdCLEVBQUMsR0FBRyxHQUFDLEVBQUUsV0FBVyxFQUFFLFdBQVcsQ0FBQyxXQUFXLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFO0lBQzVHLElBQUcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCO1FBQUMsT0FBTyxHQUFHLENBQUMsV0FBVyxDQUFBO0lBQ2hELE9BQU8sS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFBLENBQUMsQ0FBQSxXQUFXLENBQUMsSUFBSSxDQUFBLENBQUMsQ0FBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsV0FBVyxDQUFBO0FBQzdELENBQUM7QUFFRCxTQUFTLFNBQVMsQ0FBQyxLQUFhLEVBQUUsSUFBaUI7SUFDL0MsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNY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YUFBYSxHQUFDLENBQUMsR0FBVSxFQUFDLEtBQWEsRUFBQyxTQUFlLENBQUMsRUFBQyxFQUFFO0lBQzdELE9BQU8sS0FBSyxJQUFFLENBQUMsR0FBQyxNQUFNLElBQUUsS0FBSyxHQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUMsTUFBTSxDQUFDO0FBQ3BELENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCByZWdFeHAgfSBmcm9tIFwiLi4vdGlrempheC90aWt6amF4XCI7XHJcbmltcG9ydCB7IEJyYWNrZXRUeXBlIH0gZnJvbSBcIi4uL3N0YXRpY0RhdGEvZW5jYXNpbmdzXCI7XHJcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzLCBwYXJlblN0YXRlLCAgfSBmcm9tIFwiLi4vdXRpbHMvUGFyZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBhc3NvY2lhdGl2aXR5bWV0YWRhdGFCeVR5cGUsIGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZSwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgaXNPcGVyYXRvcldpdGhBc3NvY2lhdGl2aXR5LCBtYWh0amF4QXNzb2NpYXRpdml0eW1ldGFkYXRhLCBzZWFyY2hBbGxNYXRoSmF4T3BlcmF0b3JzQW5kU3ltYm9scywgc2VhcmNoTWF0aEpheE9wZXJhdG9ycywgc2VhcmNoU3ltYm9scyB9IGZyb20gXCIuLi9zdGF0aWNEYXRhL2RhdGFNYW5hZ2VyXCI7XHJcblxyXG5pbXBvcnQgeyBwYXJzZU9wZXJhdG9yIH0gZnJvbSBcIi4vbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyBCYXNpY01hdGhKYXhUb2tlbiB9IGZyb20gXCJzcmMvbWF0aFBhcnNlci9iYXNpY1Rva2VuXCI7XHJcbmltcG9ydCB7IGFzc29jaWF0aXZpdHlGb3JtYXRUeXBlIH0gZnJvbSBcInNyYy9zdGF0aWNEYXRhL21hdGhQYXJzZXJTdGF0aWNEYXRhXCI7XHJcbmZ1bmN0aW9uIGdyb3VwQnJhY2tldFR5cGUoZ3JvdXA6IE1hdGhHcm91cCxwb3M9eyBicmFja2V0VHlwZTogQnJhY2tldFR5cGUuUGFyZW50aGVzZXMsIGlzQnJhY2tldE9wdGlvbmFsOiB0cnVlIH0sKXtcclxuICAgIGlmKCFwb3MuaXNCcmFja2V0T3B0aW9uYWwpcmV0dXJuIHBvcy5icmFja2V0VHlwZVxyXG4gICAgcmV0dXJuIGdyb3VwLnNpbmd1bGFyKCk/QnJhY2tldFR5cGUuTm9uZTpwb3M/LmJyYWNrZXRUeXBlXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdyYXBHcm91cChncm91cDogc3RyaW5nLCB3cmFwOiBCcmFja2V0VHlwZSk6IHN0cmluZyB7XHJcbiAgICBzd2l0Y2ggKHdyYXApIHtcclxuICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLlBhcmVudGhlc2VzOlxyXG4gICAgICAgICAgICByZXR1cm4gYCgke2dyb3VwfSlgO1xyXG4gICAgICAgIGNhc2UgQnJhY2tldFR5cGUuQ3VybHlCcmFjZXM6XHJcbiAgICAgICAgICAgIHJldHVybiBgeyR7Z3JvdXB9fWA7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgcmV0dXJuIGdyb3VwO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGVlcFNlYXJjaFdpdGhQYXRoKFxyXG4gICAgc3RydWN0dXJlOiBhbnksXHJcbiAgICBwcmVkaWNhdGU6IChpdGVtOiBhbnkpID0+IGJvb2xlYW4sXHJcbiAgICBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW11cclxuKTogeyBpdGVtOiBhbnk7IHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gfSB8IG51bGwge1xyXG4gICAgLy8gQmFzZSBjYXNlOiBJZiB0aGUgY3VycmVudCBzdHJ1Y3R1cmUgbWF0Y2hlcyB0aGUgcHJlZGljYXRlXHJcbiAgICBpZiAocHJlZGljYXRlKHN0cnVjdHVyZSkpIHtcclxuICAgICAgICByZXR1cm4geyBpdGVtOiBzdHJ1Y3R1cmUsIHBhdGggfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBpdCdzIGFuIGFycmF5LCByZWN1cnNpdmVseSBzZWFyY2ggZWFjaCBlbGVtZW50IHdpdGggaXRzIGluZGV4XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheShzdHJ1Y3R1cmUpKSB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJ1Y3R1cmUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtpXSwgcHJlZGljYXRlLCBbLi4ucGF0aCwgaV0pO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBpdCdzIGFuIG9iamVjdCwgcmVjdXJzaXZlbHkgc2VhcmNoIGl0cyBwcm9wZXJ0aWVzIHdpdGggdGhlaXIga2V5c1xyXG4gICAgaWYgKHN0cnVjdHVyZSAhPT0gbnVsbCAmJiB0eXBlb2Ygc3RydWN0dXJlID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gc3RydWN0dXJlKSB7XHJcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RydWN0dXJlLCBrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2tleV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGtleV0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBubyBtYXRjaCBpcyBmb3VuZFxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxudHlwZSBmb3JtYXR0YWJsZUZvck1hdGhHcm91cD1NYXRoR3JvdXBJdGVtfE1hdGhHcm91cHxCYXNpY01hdGhKYXhUb2tlblxyXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKTogTWF0aEdyb3VwSXRlbVtdIHtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShpdGVtcykpIHtcclxuICAgICAgICBpdGVtcyA9IFtpdGVtc107XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZm9ybWF0dGVkSXRlbXMgPSBpdGVtc1xyXG4gICAgICAgIC5yZWR1Y2UoKGFjYzogTWF0aEdyb3VwSXRlbVtdLCBpdGVtOiBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciB8IEJhc2ljTWF0aEpheFRva2VuKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjLmNvbmNhdChlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbS5nZXRJdGVtcygpKSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xyXG4gICAgICAgICAgICAgICAgYWNjLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5nZXRWYWx1ZSgpICYmIChpdGVtLmdldFR5cGUoKSA9PT0gXCJudW1iZXJcIiB8fCBpdGVtLmdldFR5cGUoKSA9PT0gXCJ2YXJpYWJsZVwiKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFjYy5wdXNoKG5ldyBUb2tlbihpdGVtLmdldFZhbHVlKCkpKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiaXRlbXMsYWNjXCIsaXRlbXMsYWNjKVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgIGBFeHBlY3RlZCBpdGVtIHRvIGJlIGEgbnVtYmVyIG9yIHZhcmlhYmxlIGJ1dCByZWNlaXZlZDogJHtpdGVtLmdldFZhbHVlKCl9YFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgIH0sIFtdKVxyXG5cclxuICAgIHJldHVybiBmb3JtYXR0ZWRJdGVtcztcclxufVxyXG5mdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKGdyb3VwczogKE1hdGhHcm91cEl0ZW18TWF0aEdyb3VwKVtdKTpNYXRoR3JvdXBbXXtcclxuICAgIGNvbnN0IGZvcm1hdHRlZEdyb3VwcyA9IGdyb3Vwc1xyXG4gICAgICAgIC5yZWR1Y2UoKGFjYzogTWF0aEdyb3VwW10sIGl0ZW06IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yICkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCkge1xyXG4gICAgICAgICAgICAgICAgYWNjLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICBhY2MucHVzaChuZXcgTWF0aEdyb3VwKGl0ZW0pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgIH0sIFtdKVxyXG5cclxuICAgIHJldHVybiBmb3JtYXR0ZWRHcm91cHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNob3VsZEFkZFBsdXMoZ3JvdXAxPzogYW55LGdyb3VwMj86IGFueSxkaXN0YW5jZUZyb21PcGVyYXRvcj86IG51bWJlcil7XHJcbiAgICBpZighZ3JvdXAxfHwhZ3JvdXAyfHwhZGlzdGFuY2VGcm9tT3BlcmF0b3J8fGRpc3RhbmNlRnJvbU9wZXJhdG9yPT09LTF8fGRpc3RhbmNlRnJvbU9wZXJhdG9yPT09MSlyZXR1cm4gJyc7XHJcblxyXG4gICAgcmV0dXJuICcrJztcclxufVxyXG5cclxuZnVuY3Rpb24gY2FuQ29tYmluZShtYXRoOiBNYXRoR3JvdXAsb3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcblxyXG59XHJcbmV4cG9ydCBjbGFzcyBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgb3BlcmF0b3I6IHN0cmluZztcclxuICAgIGdyb3VwTnVtOiBudW1iZXIgPSAxO1xyXG4gICAgZ3JvdXBzOiBNYXRoR3JvdXBbXTtcclxuICAgIHNvbHV0aW9uOiBNYXRoR3JvdXA7XHJcbiAgICBjb21tdXRhdGl2ZTogYm9vbGVhbjtcclxuICAgIGlzT3BlcmFibGU6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbikge1xyXG4gICAgICAgIGlmIChvcGVyYXRvcikgdGhpcy5vcGVyYXRvciA9IG9wZXJhdG9yO1xyXG4gICAgICAgIGlmIChncm91cE51bSkgdGhpcy5ncm91cE51bSA9IGdyb3VwTnVtO1xyXG4gICAgICAgIGlmIChncm91cHMpIHRoaXMuZ3JvdXBzID0gZ3JvdXBzO1xyXG4gICAgICAgIGlmIChzb2x1dGlvbikgdGhpcy5zb2x1dGlvbiA9IHNvbHV0aW9uO1xyXG4gICAgICAgIGlmIChpc09wZXJhYmxlICE9PSB1bmRlZmluZWQpIHRoaXMuaXNPcGVyYWJsZSA9IGlzT3BlcmFibGU7XHJcbiAgICB9XHJcbiAgICBzdGF0aWMgY3JlYXRlKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbik6IE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yID09PSBcIk11bHRpcGxpY2F0aW9uXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKGdyb3Vwcywgc29sdXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcihvcGVyYXRvciwgZ3JvdXBOdW0sIGdyb3Vwcywgc29sdXRpb24sIGlzT3BlcmFibGUpO1xyXG4gICAgfVxyXG4gICAgdGVzdEdyb3Vwcyh0ZXN0OiAoZ3JvdXA6IE1hdGhHcm91cCkgPT4gYm9vbGVhbik6IGJvb2xlYW5bXSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcCh0ZXN0KTtcclxuICAgIH1cclxuXHJcbiAgICBtYXBWYXJpYWJsZXMoKTogYm9vbGVhbltdIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmhhc1ZhcmlhYmxlcygpKTtcclxuICAgIH1cclxuXHJcbiAgICBvcGVyYXRvclZhcmlhYmxlcygpOiBzdHJpbmdbXSB7XHJcbiAgICAgICAgcmV0dXJuIFsuLi5uZXcgU2V0KHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5ncm91cFZhcmlhYmxlcygpKS5mbGF0KCkpXTtcclxuICAgIH1cclxuXHJcbiAgICBjbG9uZSgpOiBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5jbG9uZSgpKTtcclxuICAgICAgICBjb25zdCBzb2x1dGlvbiA9IHRoaXMuc29sdXRpb24gPyB0aGlzLnNvbHV0aW9uLmNsb25lKCkgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgcmV0dXJuIE1hdGhKYXhPcGVyYXRvci5jcmVhdGUodGhpcy5vcGVyYXRvciwgdGhpcy5ncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgdGhpcy5pc09wZXJhYmxlKTtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZ1NvbHV0aW9uKCk6IHN0cmluZyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKSArICcgPSAnICsgdGhpcy5zb2x1dGlvbj8udG9TdHJpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yICYmXHJcbiAgICAgICAgICAgIHRoaXMub3BlcmF0b3IgPT09IGl0ZW0ub3BlcmF0b3IgJiZcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMubGVuZ3RoID09PSBpdGVtLmdyb3Vwcy5sZW5ndGggJiZcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMuZXZlcnkoKHQsIGluZGV4KSA9PiB0LmVxdWFscyhpdGVtLmdyb3Vwc1tpbmRleF0pKTtcclxuICAgIH1cclxuICAgIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH18bnVsbCAgeyByZXR1cm4gbnVsbDsgfSAgXHJcbiAgICBpc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RJdGVtOiBNYXRoSmF4T3BlcmF0b3IgfCBUb2tlbik6IGJvb2xlYW4ge3JldHVybiBmYWxzZTt9XHJcbiAgICB0b1N0cmluZyhmb3JtYXRUeXBlOiBhc3NvY2lhdGl2aXR5Rm9ybWF0VHlwZT1hc3NvY2lhdGl2aXR5Rm9ybWF0VHlwZS5NYXRoSmF4LGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLm9wZXJhdG9yKTtcclxuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gJyc7XHJcbiAgICAgICAgY29uc3QgYXNzb2NpYXRpdml0eSA9IGFzc29jaWF0aXZpdHltZXRhZGF0YUJ5VHlwZShtZXRhZGF0YSwgZm9ybWF0VHlwZSk7XHJcblxyXG4gICAgICAgIGxldCBpbmRleD0wLHN0cmluZyA9ICcnO1xyXG4gICAgICAgICh7c3RyaW5nLGluZGV4fT1wcm9jZXNzQXNzb2NpYXRpdml0eVBvc2l0aW9ucyhhc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyxzdHJpbmcsdGhpcy5ncm91cHMsaW5kZXgsZmFsc2UpKTtcclxuICAgICAgICBzdHJpbmcgKz0gYXNzb2NpYXRpdml0eS5zdHJpbmc7XHJcbiAgICAgICAgKHtzdHJpbmcsaW5kZXh9PXByb2Nlc3NBc3NvY2lhdGl2aXR5UG9zaXRpb25zKGFzc29jaWF0aXZpdHkucG9zaXRpb25zLHN0cmluZyx0aGlzLmdyb3VwcyxpbmRleCx0cnVlKSk7XHJcblxyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG4gICAgcGFyc2VNYXRoamF4T3BlcmF0b3IoKSB7XHJcbiAgICAgICAgcGFyc2VPcGVyYXRvcih0aGlzKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcHJvY2Vzc0Fzc29jaWF0aXZpdHlQb3NpdGlvbnMocG9zaXRpb25zOiBNYXA8bnVtYmVyLCBhbnk+LHN0cmluZzogc3RyaW5nLGdyb3VwczogYW55W10saW5kZXg6IG51bWJlcixpc0xlZnQ9ZmFsc2Upe1xyXG4gICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUocG9zaXRpb25zLHRydWUpLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XHJcbiAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXMoZ3JvdXBzW2lzTGVmdD8gaW5kZXgtMSA6IGluZGV4XSxncm91cHNbaXNMZWZ0PyBpbmRleCA6IGluZGV4ICsgMV0saW5kZXgpO1xyXG4gICAgICAgIHN0cmluZyArPSB3cmFwR3JvdXAoZ3JvdXBzW2luZGV4XS50b1N0cmluZygpLGdyb3VwQnJhY2tldFR5cGUoaXRlbSxncm91cHNbaW5kZXhdKSk7XHJcbiAgICAgICAgaW5kZXgrKztcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHsgc3RyaW5nLCBpbmRleCB9O1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRXF1YWxzT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3J7XHJcblxyXG59XHJcbmV4cG9ydCBjbGFzcyBEaXZpc2lvbk9wZXJhdG9yIGV4dGVuZHMgTWF0aEpheE9wZXJhdG9ye1xyXG5cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgY29uc3RydWN0b3IoZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgc3VwZXIoXCJNdWx0aXBsaWNhdGlvblwiLCAyLCBncm91cHMsIHNvbHV0aW9uLCB0cnVlKTtcclxuICAgICAgICB0aGlzLmNvbW11dGF0aXZlID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVtb3ZlTXVsdGlwbGljYXRpb25EZXB0aHMoKXtcclxuICAgICAgICB3aGlsZSh0aGlzLmdyb3Vwcy5zb21lKChnOiBNYXRoR3JvdXApPT4gZy5zaW5ndWxhcigpJiZnLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKSl7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwPXRoaXMuZ3JvdXBzLmZpbmQoKGc6IE1hdGhHcm91cCk9PiBnLnNpbmd1bGFyKCkmJmcuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpXHJcbiAgICAgICAgICAgIGlmKGdyb3VwKVxyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5zcGxpY2UodGhpcy5ncm91cHMuaW5kZXhPZihncm91cCksMSwuLi4oZ3JvdXAuZ2V0SXRlbXMoKVswXSBhcyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKS5ncm91cHMpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBhc09jY3VycmVuY2VHcm91cChvY2N1cnJlbmNlc0NvdW50OiBudW1iZXIsb2NjdXJyZW5jT2Y6IHN0cmluZ3xUb2tlbnxNYXRoR3JvdXApOiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yIHtcclxuICAgICAgICBvY2N1cnJlbmNPZj10eXBlb2Ygb2NjdXJyZW5jT2Y9PT1cInN0cmluZ1wiP1xyXG4gICAgICAgICAgICBuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jT2YpXSk6b2NjdXJyZW5jT2YgaW5zdGFuY2VvZiBUb2tlbj9cclxuICAgICAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW29jY3VycmVuY09mXSk6b2NjdXJyZW5jT2Y7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihbbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKG9jY3VycmVuY2VzQ291bnQpXSksb2NjdXJyZW5jT2ZdKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBvdmVycmlkZSBnZXRPY2N1cnJlbmNlR3JvdXAoKTogeyBvY2N1cnJlbmNlc0NvdW50OiBudW1iZXI7IG9jY3VycmVuY09mOiBNYXRoR3JvdXBbXSB9IHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoXHJcbiAgICAgICAgICAgIChhY2M6IHsgdG90YWxOdW06IG51bWJlcjsgYXJyOiBNYXRoR3JvdXBbXSB9LCBpdGVtOiBNYXRoR3JvdXApID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLmdldE9wZXJhYmxlVmFsdWUoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFjYy50b3RhbE51bSArPSBpdGVtLmdldE9wZXJhYmxlVmFsdWUoKSE7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGFjYy5hcnIucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHsgdG90YWxOdW06IDAsIGFycjogW10gfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIHsgb2NjdXJyZW5jZXNDb3VudDogcmVzdWx0LnRvdGFsTnVtLCBvY2N1cnJlbmNPZjogcmVzdWx0LmFyciB9O1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFRvT2NjdXJyZW5jZUdyb3VwKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBudW1iZXJHcm91cCA9IHRoaXMuZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuc2luZ2xlTnVtYmVyKCkpO1xyXG4gICAgICAgIGlmIChudW1iZXJHcm91cCkge1xyXG4gICAgICAgICAgICBudW1iZXJHcm91cC5zaW5nbGVUb2tlblNldCh2YWx1ZSwgdHJ1ZSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMucHVzaChuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4oMSArIHZhbHVlKV0pKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgb3ZlcnJpZGUgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0SXRlbTogTWF0aEpheE9wZXJhdG9yIHwgVG9rZW4pOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBpc1ZhbGlkSXRlbSA9IHRlc3RJdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgdGVzdEl0ZW0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yO1xyXG4gICAgICAgIGlmICghaXNWYWxpZEl0ZW0pIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRHcm91cCA9IHRoaXMuZ2V0T2NjdXJyZW5jZUdyb3VwKCk7XHJcbiAgICAgICAgaWYgKCFjdXJyZW50R3JvdXApIHJldHVybiBmYWxzZTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRHcm91cEl0ZW1zID0gY3VycmVudEdyb3VwLm9jY3VycmVuY09mLmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAuZ2V0SXRlbXMoKSk7XHJcbiAgICBcclxuICAgICAgICBpZiAodGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbikge1xyXG4gICAgICAgICAgICBjb25zdCBpc1NpbmdsZUl0ZW1NYXRjaCA9IGN1cnJlbnRHcm91cEl0ZW1zLmxlbmd0aCA9PT0gMSAmJiBjdXJyZW50R3JvdXBJdGVtc1swXS5lcXVhbHModGVzdEl0ZW0pO1xyXG4gICAgICAgICAgICBpZiAoaXNTaW5nbGVJdGVtTWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWRkVG9PY2N1cnJlbmNlR3JvdXAoMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGlzU2luZ2xlSXRlbU1hdGNoO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cCA9IHRlc3RJdGVtLmdldE9jY3VycmVuY2VHcm91cCgpO1xyXG4gICAgICAgIGlmICghdGVzdEl0ZW1Hcm91cCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHRlc3RJdGVtR3JvdXBJdGVtcyA9IHRlc3RJdGVtR3JvdXAub2NjdXJyZW5jT2Y7XHJcbiAgICAgICAgY29uc3QgYXJlR3JvdXBzTWF0Y2hpbmcgPWN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5sZW5ndGggPT09IHRlc3RJdGVtR3JvdXBJdGVtcy5sZW5ndGggJiZcclxuICAgICAgICAgICAgY3VycmVudEdyb3VwLm9jY3VycmVuY09mLmV2ZXJ5KChjdXJyZW50U3ViR3JvdXA6IE1hdGhHcm91cCkgPT5cclxuICAgICAgICAgICAgICAgIHRlc3RJdGVtR3JvdXBJdGVtcy5zb21lKCh0ZXN0U3ViR3JvdXA6IE1hdGhHcm91cCkgPT4gXHJcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFN1Ykdyb3VwLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdFN1Ykdyb3VwKVxyXG4gICAgICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAoYXJlR3JvdXBzTWF0Y2hpbmcpIHsgXHJcbiAgICAgICAgICAgIHRoaXMuYWRkVG9PY2N1cnJlbmNlR3JvdXAodGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNlc0NvdW50KTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHRvU3RyaW5nKGZvcm1hdFR5cGU6YXNzb2NpYXRpdml0eUZvcm1hdFR5cGU9YXNzb2NpYXRpdml0eUZvcm1hdFR5cGUuTWF0aEpheCxjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXsgXHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSAnXFxcXGNkb3QgJztcclxuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XHJcbiAgICAgICAgY29uc3QgdG9BZGRDZG90PSh0aGlzR3JvdXA6IE1hdGhHcm91cCxuZXh0R3JvdXA/Ok1hdGhHcm91cCk9PntcclxuICAgICAgICAgICAgaWYoIW5leHRHcm91cClyZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGlmKG5leHRHcm91cC5pc1NpbmdsZVZhcigpfHx0aGlzR3JvdXAuaXNTaW5nbGVWYXIoKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCByZW9yZGVyZWRHcm91cHM9dGhpcy5ncm91cHMuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoYS5zaW5nbGVOdW1iZXIoKSAmJiAhYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAoIWEuc2luZ2xlTnVtYmVyKCkgJiYgYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhLnNpbmd1bGFyKCkgJiYgIWIuc2luZ3VsYXIoKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAoIWEuc2luZ3VsYXIoKSAmJiBiLnNpbmd1bGFyKCkpIHJldHVybiAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZW9yZGVyZWRHcm91cHMuZm9yRWFjaCgoZ3JvdXAsaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cChncm91cC50b1N0cmluZygpLCBncm91cC5zaW5ndWxhcigpP0JyYWNrZXRUeXBlLk5vbmU6QnJhY2tldFR5cGUuUGFyZW50aGVzZXMpO1xyXG4gICAgICAgICAgICBpZiAodG9BZGRDZG90KGdyb3VwLHJlb3JkZXJlZEdyb3Vwc1tpbmRleCsxXSkpXHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gb3BlcmF0b3I7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qXHJcbiAgICB0aGlzLmdyb3VwcyA9IFtbMSwgMiwgM10sWzQsIDUsIDZdLFs3LCA4LCA5XV1cclxuICAgIEV4cGVjdGVkIE91dHB1dDpcclxuICAgIFtcclxuICAgICAgICAxKjQsIDEqNSwgMSo2LCAxKjcsIDEqOCwgMSo5LFxyXG4gICAgICAgIDIqNCwgMio1LCAyKjYsIDIqNywgMio4LCAyKjksXHJcbiAgICAgICAgMyo0LCAzKjUsIDMqNiwgMyo3LCAzKjgsIDMqOSxcclxuICAgICAgICA0KjcsIDQqOCwgNCo5LFxyXG4gICAgICAgIDUqNywgNSo4LCA1KjksXHJcbiAgICAgICAgNio3LCA2KjgsIDYqOVxyXG4gICAgXSAgXHJcbiAgICAqL1xyXG4gICAgcGFyc2VNYXRoamF4T3BlcmF0b3IoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbXVsdEFycj10aGlzLmVsaW1pbmF0R3JvdXBzV2l0aE11bHRpcGxlVGVybXMoKS5nZXRJdGVtcygpO1xyXG4gICAgICAgIGNvbnN0IG5hbWU9bXVsdEFyci5tYXAoKG86IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpPT4ge28ucGFyc2UoKTtyZXR1cm4gby5zb2x1dGlvbn0pXHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKG5hbWUpO1xyXG4gICAgICAgIHRoaXMuc29sdXRpb24uY29tYmluaW5nTGlrZVRlcm1zKCk7XHJcbiAgICB9XHJcbiAgICBlbGltaW5hdEdyb3Vwc1dpdGhNdWx0aXBsZVRlcm1zKCk6TWF0aEdyb3VwIHtcclxuICAgICAgICBsZXQgb3BlcmF0b3JzQWNjdW11bGF0aW9uOiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yW10gPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBzaW5nbGVUZXJtR3JvdXBzID0gdGhpcy5ncm91cHMuZmlsdGVyKGdyb3VwID0+IGdyb3VwLnNpbmd1bGFyKCkpO1xyXG4gICAgICAgIGNvbnN0IG11bHRpVGVybUdyb3VwcyA9IHRoaXMuZ3JvdXBzLmZpbHRlcihncm91cCA9PiAhZ3JvdXAuc2luZ3VsYXIoKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3Qgc2luZ2xlc01hdGhHcm91cCA9IHNpbmdsZVRlcm1Hcm91cHMubGVuZ3RoICE9PSAwIFxyXG4gICAgICAgICAgICA/IFtuZXcgTWF0aEdyb3VwKFtuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihzaW5nbGVUZXJtR3JvdXBzKV0pXSBcclxuICAgICAgICAgICAgOiBbXTtcclxuICAgICAgICBsZXQgZ3JvdXBzID0gWy4uLnNpbmdsZXNNYXRoR3JvdXAsIC4uLm11bHRpVGVybUdyb3Vwc107XHJcbiAgICBcclxuICAgICAgICB3aGlsZSAoZ3JvdXBzLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXBBID0gZ3JvdXBzLnNoaWZ0KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQiA9IGdyb3Vwcy5zaGlmdCgpO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmICghZ3JvdXBBIHx8ICFncm91cEIpIGJyZWFrO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQUl0ZW1zID0gZ3JvdXBBLmdldEl0ZW1zKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQkl0ZW1zID0gZ3JvdXBCLmdldEl0ZW1zKCk7XHJcbiAgICAgICAgICAgIG9wZXJhdG9yc0FjY3VtdWxhdGlvbiA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGEgb2YgZ3JvdXBBSXRlbXMpIHtcclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYiBvZiBncm91cEJJdGVtcykge1xyXG4gICAgICAgICAgICAgICAgICAgIG9wZXJhdG9yc0FjY3VtdWxhdGlvbi5wdXNoKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKFthLmNsb25lKCksIGIuY2xvbmUoKV0pKVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBncm91cHMudW5zaGlmdChuZXcgTWF0aEdyb3VwKG9wZXJhdG9yc0FjY3VtdWxhdGlvbikpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZ3JvdXBzWzBdO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgcGFyc2UoKXtcclxuICAgICAgICBjb25zdCB7IG51bWJlcnMsIG90aGVyIH0gPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoKHJlc3VsdDogeyBudW1iZXJzOiBNYXRoR3JvdXBbXTsgb3RoZXI6IE1hdGhHcm91cFtdIH0sIGl0ZW06IE1hdGhHcm91cCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uc2luZ2xlTnVtYmVyKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQubnVtYmVycy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQub3RoZXIucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHsgbnVtYmVyczogW10sIG90aGVyOiBbXSB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICBsZXQgdmFsdWU9MTtcclxuICAgICAgICBudW1iZXJzLmZvckVhY2goZ3JvdXAgPT4ge1xyXG4gICAgICAgICAgICB2YWx1ZSo9KGdyb3VwLmdldEl0ZW1zKClbMF1hcyBUb2tlbikuZ2V0TnVtYmVyVmFsdWUoKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmKHRoaXMuZ3JvdXBzLmxlbmd0aD09PTApXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlwiKTtcclxuICAgICAgICBpZigobnVtYmVycy5sZW5ndGg+MCYmb3RoZXIubGVuZ3RoPT09MCl8fHZhbHVlPT09MCl7XHJcbiAgICAgICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChuZXcgVG9rZW4odmFsdWUpKTtyZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRlc3Q9KG1haW5Hcm91cDogYW55LCB0ZXN0R3JvdXA6IGFueSk9PntcclxuICAgICAgICAgICAgaWYobWFpbkdyb3VwIGluc3RhbmNlb2YgTWF0aEdyb3VwJiZ0ZXN0R3JvdXAgaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG1haW5Hcm91cC5pc1Bvd0dyb3VwTWF0Y2godGVzdEdyb3VwKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZmlsdGVyZWQ9ZmlsdGVyQnlUZXN0Q29uc3Qob3RoZXIsdGVzdCk7XHJcbiAgICAgICAgY29uc3QgYXJyPVsuLi5maWx0ZXJlZF07XHJcbiAgICAgICAgaWYodmFsdWUhPT0xKVxyXG4gICAgICAgICAgICBhcnIucHVzaChuZXcgVG9rZW4odmFsdWUpKTtcclxuXHJcbiAgICAgICAgaWYoYXJyLmxlbmd0aD4xKXtcclxuICAgICAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKFtuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKGFycikpXSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKGFyclswXSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGEoZ3JvdXBzOiBNYXRoR3JvdXBbXSl7XHJcbiAgICBjb25zdCBhcmVBbGxHcm91cHNTaW5ndWxhcj1ncm91cHMuZXZlcnkoZz0+Zy5zaW5ndWxhcigpKVxyXG4gICAgbGV0IHZhbHVlPTA7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBmaWx0ZXJCeVRlc3RDb25zdChcclxuICAgIGl0ZW1zOiBhbnlbXSxcclxuICAgIHRlc3Q6IChtYWluSXRlbTogYW55LCB0ZXN0SXRlbTogYW55KSA9PiBib29sZWFuXHJcbik6IGFueVtdIHtcclxuICAgIGxldCBpbmRleCA9IDA7XHJcbiAgICB3aGlsZSAoaW5kZXggPCBpdGVtcy5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCBtYWluSXRlbSA9IGl0ZW1zW2luZGV4XTtcclxuICAgICAgICBjb25zdCBvcmlnaW5hbExlbmd0aCA9IGl0ZW1zLmxlbmd0aDtcclxuXHJcbiAgICAgICAgaXRlbXMgPSBpdGVtcy5maWx0ZXIoKG90aGVySXRlbSwgb3RoZXJJbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlOyAvLyBLZWVwIGN1cnJlbnQgaXRlbVxyXG4gICAgICAgICAgICBjb25zdCB0ZW1wPSF0ZXN0KG1haW5JdGVtLCBvdGhlckl0ZW0pO1xyXG4gICAgICAgICAgICByZXR1cm4gdGVtcFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBSZXN0YXJ0IGl0ZXJhdGlvbiBpZiBpdGVtcyB3ZXJlIHJlbW92ZWRcclxuICAgICAgICBpZiAoaXRlbXMubGVuZ3RoIDwgb3JpZ2luYWxMZW5ndGgpIHtcclxuICAgICAgICAgICAgaW5kZXggPSAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGl0ZW1zO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gdHJpZ29ub21ldHJpY0lkZW50aXRpZXMoKXtcclxuXHJcbn1cclxuXHJcbmV4cG9ydCB0eXBlIE1hdGhHcm91cEl0ZW09VG9rZW58TWF0aEpheE9wZXJhdG9yXHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aEdyb3VwIHtcclxuICAgIHByaXZhdGUgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSA9IFtdO1xyXG4gICAgLy9vdmVydmlldzogTWF0aE92ZXJ2aWV3XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKGl0ZW1zPzogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSkge1xyXG4gICAgICAgIGlmKGl0ZW1zKXRoaXMuc2V0SXRlbXMoaXRlbXMpO1xyXG4gICAgfVxyXG4gICAgZ2V0SXRlbXMoKTogTWF0aEdyb3VwSXRlbVtdIHtyZXR1cm4gdGhpcy5pdGVtczt9XHJcbiAgICBzZXRJdGVtKGl0ZW06IE1hdGhHcm91cEl0ZW0saW5kZXg6bnVtYmVyKXtcclxuICAgICAgICB0aGlzLml0ZW1zW2luZGV4XT1pdGVtO1xyXG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKVxyXG4gICAgfVxyXG4gICAgcmVwbGFjZUl0ZW1DZWxsKGl0ZW06IE1hdGhHcm91cEl0ZW18TWF0aEdyb3VwLGluZGV4Om51bWJlcil7XHJcbiAgICAgICAgdGhpcy5pdGVtcy5zcGxpY2UoaW5kZXgsMSwuLi5lbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbSkpXHJcbiAgICB9XHJcbiAgICBzZXRJdGVtcyhpdGVtczogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSkge1xyXG4gICAgICAgIHRoaXMuaXRlbXMgPSBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXMpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKSAgICBcclxuICAgIH1cclxuICAgIGdyb3VwVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcclxuICAgICAgICBjb25zdCB2YXJpYWJsZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtOiBNYXRoR3JvdXBJdGVtKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gJiYgaXRlbS5pc1ZhcigpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBpdGVtLmdldFN0cmluZ1ZhbHVlKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXZhcmlhYmxlcy5jb250YWlucyhrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyaWFibGVzLnB1c2goa2V5KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiB2YXJpYWJsZXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHVwZGF0ZU92ZXJ2aWV3KCl7LypcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3PW5ldyBNYXRoT3ZlcnZpZXcoKVxyXG4gICAgICAgIHRoaXMub3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdzZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKSovXHJcbiAgICB9XHJcbiAgICBzaW5nbGVUb2tlblNldCh2YWx1ZTogbnVtYmVyLHRvQWRkPzogYm9vbGVhbil7XHJcbiAgICAgICAgY29uc3QgdG9rZW49dGhpcy5pdGVtc1swXSBhcyBUb2tlbjtcclxuICAgICAgICBjb25zdCBuZXdWYWx1ZT10b0FkZD92YWx1ZSt0b2tlbi5nZXROdW1iZXJWYWx1ZSgpOnZhbHVlO1xyXG4gICAgICAgIGlmKHRoaXMuc2luZ3VsZVRva2VuKCkpe1xyXG4gICAgICAgICAgICB0b2tlbi5zZXRWYWx1ZShuZXdWYWx1ZSlcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBNYXRoR3JvdXAge1xyXG4gICAgICAgIHJldHVybiBuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXMubWFwKGl0ZW09Pml0ZW0uY2xvbmUoKSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGhhc09wZXJhdG9yKCk6IHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpO31cclxuICAgIGRvZXNudEhhdmVPcGVyYXRvcigpOiAgdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuICF0aGlzLmhhc09wZXJhdG9yKCk7fVxyXG4gICAgc2luZ2xlTnVtYmVyKCl7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSYmdGhpcy5udW1iZXJPbmx5KCl9XHJcbiAgICBudW1iZXJPbmx5KCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLmV2ZXJ5KHQgPT4gKHQgaW5zdGFuY2VvZiBUb2tlbiYmIXQuaXNWYXIoKSkpO31cclxuICAgIGhhc1ZhcmlhYmxlcygpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKHQgPT4gdCBpbnN0YW5jZW9mIFRva2VuJiZ0LmlzVmFyKCkpO31cclxuXHJcbiAgICBzaW5ndWxhcigpOmJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLmxlbmd0aCA9PT0gMSAmJiB0aGlzLml0ZW1zWzBdICE9PSB1bmRlZmluZWQ7fVxyXG4gICAgc2luZ3VsZVRva2VuKCk6IHRoaXMgaXMgeyBpdGVtczogW1Rva2VuXSB9IHtyZXR1cm4gdGhpcy5zaW5ndWxhcigpICYmIHRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbjt9XHJcbiAgICBpc09wZXJhYmxlKCl7cmV0dXJuIHRydWV9XHJcblxyXG4gICAgZ2V0T3BlcmFibGVWYWx1ZSgpOiBudW1iZXIgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgY29uc3QgaXRlbXMgPSB0aGlzLml0ZW1zO1xyXG4gICAgICAgIGlmICh0aGlzLm51bWJlck9ubHkoKSkge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWU9MDtcclxuICAgICAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbTogVG9rZW4pID0+IHtcclxuICAgICAgICAgICAgICAgIHZhbHVlICs9IGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBpc1NpbmdsZVZhcigpe1xyXG4gICAgICAgIGNvbnN0IHRva2VuPXRoaXMuaXRlbXNbMF1hcyBUb2tlblxyXG4gICAgICAgIHJldHVybiB0aGlzLnNpbmd1bGVUb2tlbigpJiZ0b2tlbi5pc1ZhcigpXHJcbiAgICB9XHJcbiAgICBnZXRTaW5nbGVWYXIoKXtcclxuICAgICAgICBpZighdGhpcy5pc1NpbmdsZVZhcigpKXJldHVybiBudWxsO1xyXG4gICAgICAgIHJldHVybiAodGhpcy5pdGVtc1swXWFzIFRva2VuKS5nZXRTdHJpbmdWYWx1ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlzUG93R3JvdXBNYXRjaChncm91cDogTWF0aEdyb3VwKTpib29sZWFue1xyXG4gICAgICAgIGlmKHRoaXMuaXRlbXMubGVuZ3RoIT09MSlyZXR1cm4gZmFsc2VcclxuICAgICAgICBpZih0aGlzLmlzU2luZ2xlVmFyKCkmJmdyb3VwLmlzU2luZ2xlVmFyKCkmJnRoaXMuZXF1YWxzKGdyb3VwKSl7XHJcbiAgICAgICAgICAgIHRoaXMuaXRlbXM9W01hdGhKYXhPcGVyYXRvci5jcmVhdGUoXCJQb3dlclwiLDIsW25ldyBNYXRoR3JvdXAodGhpcy5pdGVtc1swXSksbmV3IE1hdGhHcm91cChuZXcgVG9rZW4oMikpXSldXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLmVxdWFscyhncm91cClcclxuICAgIH1cclxuXHJcbiAgICBpc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVyOiBNYXRoR3JvdXApe1xyXG4gICAgICAgIGNvbnN0IGJvdGhTaW5ndWxhcj10aGlzLnNpbmd1bGFyKCkmJm90aGVyLnNpbmd1bGFyKClcclxuICAgICAgICBjb25zdCBmaXJzdEl0ZW1NYXRoSmF4b09lcmF0b3I9dGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciYmb3RoZXIuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvclxyXG4gICAgICAgIGlmKCFib3RoU2luZ3VsYXImJiFmaXJzdEl0ZW1NYXRoSmF4b09lcmF0b3IpcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGE9KHRoaXMuaXRlbXNbMF1hcyBNYXRoSmF4T3BlcmF0b3IpLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2gob3RoZXIuZ2V0SXRlbXMoKVswXSlcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzLmVxdWFscyhvdGhlcilcclxuICAgIH1cclxuXHJcbiAgICBlcXVhbHMoaXRlbTogVG9rZW58TWF0aEpheE9wZXJhdG9yfE1hdGhHcm91cCl7XHJcbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIFRva2VuKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09MSYmdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLml0ZW1zWzBdLmVxdWFscyhpdGVtKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3ImJnRoaXMuaXRlbXNbMF0uZXF1YWxzKGl0ZW0pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT1pdGVtLml0ZW1zLmxlbmd0aCYmdGhpcy5pdGVtcy5ldmVyeSgodDogTWF0aEdyb3VwSXRlbSk9PntcclxuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtLml0ZW1zLnNvbWUoKGkpPT50LmVxdWFscyhpKSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGdldElkKCl7XHJcbiAgICAgICAgcmV0dXJuICdNYXRoR3JvdXAnXHJcbiAgICB9XHJcbiAgICBjb21iaW5pbmdMaWtlVGVybXMoKSB7XHJcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXcgPSBuZXcgTWF0aE92ZXJ2aWV3KCk7XHJcbiAgICAgICAgb3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKTtcclxuICAgICAgICB0aGlzLnNldEl0ZW1zKG92ZXJ2aWV3LnJlY29uc3RydWN0QXNNYXRoR3JvdXBJdGVtcygpKTtcclxuICAgICAgICBsZXQgaW5kZXggPSAwO1xyXG4gICAgICAgIHdoaWxlIChpbmRleCA8IHRoaXMuaXRlbXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2luZGV4XTtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnaW5hbExlbmd0aCA9IHRoaXMuaXRlbXMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcyA9IHRoaXMuaXRlbXMuZmlsdGVyKChvdGhlckl0ZW06IE1hdGhHcm91cEl0ZW0sIG90aGVySW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA9PT0gb3RoZXJJbmRleCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNNYXRjaCA9IGl0ZW0uaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlckl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNNYXRjaDtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXRlbXMubGVuZ3RoIDwgb3JpZ2luYWxMZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbmRleCA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnO1xyXG4gICAgICAgIGlmKCFBcnJheS5pc0FycmF5KHRoaXMuaXRlbXMpKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgYnV0IHJlY2VpdmVkOiBcIit0aGlzLml0ZW1zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBzdHJpbmcrPXNob3VsZEFkZFBsdXModGhpcy5pdGVtc1tpbmRleC0xXSxpdGVtKVxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCAmJiAhaXRlbS5zaW5ndWxhcigpKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gYCgke2l0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKX0pYDtcclxuICAgICAgICAgICAgfSAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gaXRlbS50b1N0cmluZyh1bmRlZmluZWQsY3VzdG9tRm9ybWF0dGVyKTtcclxuICAgICAgICAgICAgfSBpZiAoY3VzdG9tRm9ybWF0dGVyKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgPSBjdXN0b21Gb3JtYXR0ZXIoaXRlbSxzdHJpbmcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZztcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZ0xhdGV4KGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XHJcbiAgICAgICAgaWYoIUFycmF5LmlzQXJyYXkodGhpcy5pdGVtcykpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBidXQgcmVjZWl2ZWQ6IFwiK3RoaXMuaXRlbXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHN0cmluZys9c2hvdWxkQWRkUGx1cyh0aGlzLml0ZW1zW2luZGV4LTFdLGl0ZW0pXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBgKCR7aXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpfSlgO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcil7c3RyaW5nICs9IGl0ZW0udG9TdHJpbmcoYXNzb2NpYXRpdml0eUZvcm1hdFR5cGUuTGF0ZXgsY3VzdG9tRm9ybWF0dGVyKTt9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IGl0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGN1c3RvbUZvcm1hdHRlcikge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nID0gY3VzdG9tRm9ybWF0dGVyKGl0ZW0sc3RyaW5nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmc7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgTWF0aE92ZXJ2aWV3IHtcclxuICAgIHByaXZhdGUgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBhbnk+O1xyXG4gICAgcHJpdmF0ZSBvcGVyYXRvcnM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBwcml2YXRlIG51bWJlcjogbnVtYmVyO1xyXG4gICAgZ2V0TnVtYmVyKCk6IG51bWJlcntyZXR1cm4gdGhpcy5udW1iZXI7fVxyXG4gICAgZ2V0VmFyaWFibGVzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMudmFyaWFibGVzO31cclxuICAgIGdldE9wZXJhdG9ycygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLm9wZXJhdG9yczt9XHJcbiAgICBjb25zdHJ1Y3Rvcih2YXJpYWJsZXM/OiBNYXA8c3RyaW5nLCBhbnk+LG9wZXJhdG9ycz86IE1hcDxzdHJpbmcsIGFueT4sbnVtYmVyPzogbnVtYmVyKXtcclxuICAgICAgICBpZih2YXJpYWJsZXMpdGhpcy52YXJpYWJsZXM9dmFyaWFibGVzO1xyXG4gICAgICAgIGlmKG9wZXJhdG9ycyl0aGlzLm9wZXJhdG9ycz1vcGVyYXRvcnM7XHJcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcclxuICAgIH1cclxuICAgIGRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHMoaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSkge1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzPW5ldyBNYXAoKTtcclxuICAgICAgICB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XHJcbiAgICAgICAgaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVmFyaWFibGVzTWFwKGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmIWl0ZW0uaXNWYXIoKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU11bWJlcihpdGVtLmdldE51bWJlclZhbHVlKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlT3BlcmF0b3JzTWFwKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIGNhdGVnb3J5IGluIE1hdGhPdmVydmlldyBzZXBhcmF0ZUludG9JbmRpdmlkdWFsc1wiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH1cclxuICAgIHVwZGF0ZU11bWJlcihudW1iZXI6IG51bWJlcil7IHRoaXMubnVtYmVyPXRoaXMubnVtYmVyP3RoaXMubnVtYmVyK251bWJlcjpudW1iZXI7fVxyXG4gICAgdXBkYXRlVmFyaWFibGVzTWFwKGtleTogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcyA/Pz0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgaXRlbXM6IGFueVtdIH0+KCk7XHJcbiAgICAgICAgaWYoIXRoaXMudmFyaWFibGVzLmhhcyhrZXkpKXt0aGlzLnZhcmlhYmxlcy5zZXQoa2V5LHtjb3VudDogMH0pfVxyXG4gICAgICAgIHRoaXMudmFyaWFibGVzLmdldChrZXkpLmNvdW50Kys7XHJcbiAgICB9XHJcbiAgICB1cGRhdGVPcGVyYXRvcnNNYXAob3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICAgICAgY29uc3Qga2V5PW9wZXJhdG9yLm9wZXJhdG9yO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycy5oYXMoa2V5KSl7dGhpcy5vcGVyYXRvcnMuc2V0KGtleSx7Y291bnQ6IDAsIGl0ZW1zOiBbXX0pfVxyXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5vcGVyYXRvcnMuZ2V0KGtleSkhO1xyXG4gICAgICAgIGVudHJ5LmNvdW50ICs9IDE7XHJcbiAgICAgICAgZW50cnkuaXRlbXMucHVzaChvcGVyYXRvcik7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzVmFyKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzJiZ0aGlzLnZhcmlhYmxlcy5zaXplPjB9XHJcbiAgICBoYXNPcCgpe3JldHVybiB0aGlzLm9wZXJhdG9ycyYmdGhpcy5vcGVyYXRvcnMuc2l6ZT4wfVxyXG4gICAgb25seU51bWVyaWMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5udW1iZXImJiF0aGlzLmhhc1ZhcigpJiYhdGhpcy5oYXNPcCgpXHJcbiAgICB9XHJcbiAgICByZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKXtcclxuICAgICAgICBjb25zdCBpdGVtczogTWF0aEdyb3VwSXRlbVtdPVtdO1xyXG4gICAgICAgIGlmKHRoaXMubnVtYmVyKWl0ZW1zLnB1c2gobmV3IFRva2VuKHRoaXMubnVtYmVyKSk7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xyXG4gICAgICAgICAgICBpZih2YWx1ZS5jb3VudD09PTEpe1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChuZXcgVG9rZW4oa2V5KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmKHZhbHVlLmNvdW50PjEpe1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChNdWx0aXBsaWNhdGlvbk9wZXJhdG9yLmFzT2NjdXJyZW5jZUdyb3VwKHZhbHVlLmNvdW50LGtleSkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBpZih0aGlzLm9wZXJhdG9ycyl7XHJcbiAgICAgICAgICAgIGl0ZW1zLnB1c2goLi4uQXJyYXkuZnJvbSh0aGlzLm9wZXJhdG9ycy52YWx1ZXMoKSkuZmxhdE1hcCgob3BlcmF0b3I6IGFueSkgPT4gb3BlcmF0b3IuaXRlbXMpKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaXRlbXM7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRva2Vue1xyXG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOm51bWJlcnxzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBnZXROdW1iZXJWYWx1ZSgpOm51bWJlcntyZXR1cm4gKHRoaXMudmFsdWUgYXMgbnVtYmVyKX1cclxuICAgIGdldFN0cmluZ1ZhbHVlKCk6c3RyaW5ne3JldHVybiAodGhpcy52YWx1ZSBhcyBzdHJpbmcpfVxyXG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cclxuICAgIHNldFZhbHVlKHZhbHVlOiBudW1iZXJ8c3RyaW5nKXt0aGlzLnZhbHVlPXZhbHVlO31cclxuICAgIGlzVmFyKCkge3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZyc7fVxyXG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pIHtcclxuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLnZhbHVlID09PSBpdGVtLnZhbHVlO1xyXG4gICAgfVxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmKCF0aGlzLmlzVmFyKCkmJnRoaXMuZ2V0TnVtYmVyVmFsdWUoKTwwKVxyXG4gICAgICAgICAgICBzdHJpbmcrPSctJztcclxuICAgICAgICBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgaWYoY3VzdG9tRm9ybWF0dGVyKXtcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZztcclxuICAgIH1cclxuICAgIGNsb25lKCl7cmV0dXJuIG5ldyBUb2tlbih0aGlzLnZhbHVlKX1cclxufVxyXG5cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdUb0Jhc2ljTWF0aEpheFRva2VucyhzdHJpbmc6IFN0cmluZyk6QXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+e1xyXG4gICAgbGV0IHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+PXRva2VuaXplVG9CYXNpY01hdGhKYXhUb2tlbnMoc3RyaW5nKTtcclxuICAgIHRva2VucyA9IHBvc3RQcm9jZXNzVG9rZW5zKHRva2Vucyk7XHJcbiAgICB2YWxpZGF0ZVBsdXNNaW51cyh0b2tlbnMpO1xyXG4gICAgcmV0dXJuIHRva2VucztcclxufVxyXG5cclxuZnVuY3Rpb24gdG9rZW5pemVUb0Jhc2ljTWF0aEpheFRva2VucyhtYXRoOiBTdHJpbmcpOkFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPntcclxuICAgIGNvbnN0IHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+PVtdO1xyXG4gICAgY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMoKSlcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2gocmVnRXhwKCdeJyArIG9wZXJhdG9ycykpO1xyXG4gICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgIHRva2Vucy5wdXNoKEJhc2ljTWF0aEpheFRva2VuLmNyZWF0ZShtYXRjaFswXSkpO1xyXG4gICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgaWYgKCEhbWF0Y2gpXHJcbiAgICAgICAgeyAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgIHRva2Vucy5wdXNoKEJhc2ljTWF0aEpheFRva2VuLmNyZWF0ZShwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9BZGQgcGx1cyB0byBtYWtlIGl0IG11bHRpcGxlIExldHRlcnMuXHJcbiAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0oX1xcKFthLXpBLVowLTldKlxcKSkqLylcclxuICAgICAgICBpZiAoISFtYXRjaCkge1xyXG4gICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxyXG4gICAgICAgICAgICB0b2tlbnMucHVzaChCYXNpY01hdGhKYXhUb2tlbi5jcmVhdGUobWF0Y2hbMF0pKVxyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdG9rZW5zO1xyXG59XHJcbmZ1bmN0aW9uIHBvc3RQcm9jZXNzVG9rZW5zKHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+KXtcclxuICAgIC8qcnVsZXMgdG8gYWJpZCBieTpcclxuICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcclxuICAgICovXHJcbiAgICB0b2tlbnMgPSBpZFBhcmVudGhlc2VzKHRva2Vucyk7XHJcbiAgICBcclxuICAgIGNvbnN0IHBhcmVuTWFwPWltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAodG9rZW5zKTtcclxuXHJcbiAgICBwYXJlbk1hcC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYiAtIGEpXHJcbiAgICAuZm9yRWFjaCgodmFsdWU6IGFueSkgPT4ge1xyXG4gICAgICAgIHRva2Vucy5zcGxpY2UodmFsdWUsIDAsIG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4oJ29wZXJhdG9yJywnKicpKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRva2VucztcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAodG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj4pIHtcclxuICAgIGNvbnN0IGlzQUJhc2ljTWF0aEpheFRva2VuRG91YmxlUmlnaHRPcD0odG9rZW4/OiBhbnkpPT57XHJcbiAgICAgICAgaWYodG9rZW4mJnRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pe1xyXG4gICAgICAgICAgICByZXR1cm4gZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXModG9rZW4uZ2V0U3RyaW5nVmFsdWUoKSlcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSBpbmRleCBcclxuICAgICAqIEByZXR1cm5zIGJvb2xhbiA9PiBUcnVlIGlmIHRoYXIgaXNuJ3QgYSBkb3VibGVSaWdodCBvcGVyYXRvci5cclxuICAgICAqL1xyXG4gICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICBpZiAoIXZhbGlkYXRlSW5kZXgodG9rZW5zLGluZGV4KXx8ISh0b2tlbnNbaW5kZXhdIGluc3RhbmNlb2YgUGFyZW4pKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgY29uc3QgaWR4ID0gZmluZFBhcmVuSW5kZXgoaW5kZXgsdG9rZW5zKT8ub3BlbjtcclxuICAgICAgICBpZiAoaWR4ID09IG51bGwgfHwgcGFyZW5TdGF0ZSh0b2tlbnNbaW5kZXggKyAxXSkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3QgcHJldlRva2VuID0gdG9rZW5zW2lkeCAtIDFdO1xyXG4gICAgICAgIHJldHVybiAhaXNBQmFzaWNNYXRoSmF4VG9rZW5Eb3VibGVSaWdodE9wKHByZXZUb2tlbilcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uPSh0b2tlbjogYW55KT0+e1xyXG4gICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0eXBlb2YgdG9rZW4uZ2V0VmFsdWUoKT09PSdzdHJpbmcnJiZoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLmdldFN0cmluZ1ZhbHVlKCkpXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaXNWYXI9KHRva2VuOiBhbnkpPT57cmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZ0b2tlbi5nZXRUeXBlKCk9PT0ndmFyaWFibGUnfVxyXG5cclxuICAgIGNvbnN0IGltcGxpY2l0TXVsdGlwbGljYXRpb25CZWZvcmU9KHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbnxQYXJlbiwgaW5kZXg6IG51bWJlcik6Ym9vbGVhbj0+e1xyXG4gICAgICAgIC8vY2FudCBoYXZlIGJlZm9yZSBpZiBpdCBpcyB0aGUgZmlyc3QgdG9rZW5cclxuICAgICAgICBpZihpbmRleD09PTApIHJldHVybiBmYWxzZTtcclxuICAgICAgICAvL3RoZSBvbmx5IGJlZm9yIHRva2VucyBhcmUgb3BhbmluZyBwYXJlbnRoZXNlcyBjZXJ0YWluIG9wZXJhdG9yIHR5cGVzIGFuZCB2YXJpYWJsZXMgXHJcblxyXG4gICAgICAgIGlmKHBhcmVuU3RhdGUodG9rZW4sdHJ1ZSkpe1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygncGFyZW5TdGF0ZU9wYW4nKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZihpc1Zhcih0b2tlbil8fGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbikpe1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgY29uc3QgaW1wbGljaXRNdWx0aXBsaWNhdGlvbkFmdGVyPSh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW58UGFyZW4sIGluZGV4OiBudW1iZXIpOmJvb2xlYW49PntcclxuICAgICAgICAvL2NhbnQgaGF2ZSBhZnRlciBpZiBpdCBpcyB0aGUgbGFzdCB0b2tlblxyXG4gICAgICAgIGlmKGluZGV4PT09dG9rZW5zLmxlbmd0aC0xKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgaWYocGFyZW5TdGF0ZSh0b2tlbil8fGlzVmFyKHRva2VuKSl7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBjb25zdCBpc0ltcGxpY2l0TXVsdGlwbGljYXRpb25JbnRlcmFjdGlvbj0odG9rZW5zMTogQmFzaWNNYXRoSmF4VG9rZW58UGFyZW4sdG9rZW4yOiBCYXNpY01hdGhKYXhUb2tlbnxQYXJlbixpbmRleDogbnVtYmVyKT0+e1xyXG4gICAgICAgIGNvbnN0IGFycj1bdG9rZW5zMSx0b2tlbjJdXHJcbiAgICAgICAgaWYoYXJyLnNvbWUoKHRva2VuOiBhbnkpPT4hdG9rZW4pKXtyZXR1cm4gZmFsc2U7fVxyXG4gICAgICAgIGNvbnN0IHZhck1hcD1hcnIubWFwKCh0b2tlbjogYW55KT0+aXNWYXIodG9rZW4pKVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIGNvbnN0IG1hcCA9IHRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uSW50ZXJhY3Rpb24odG9rZW5zW2luZGV4LTFdLHRva2VuLCBpbmRleCkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0gIT09IG51bGwpO1xyXG4gICAgY29uc29sZS5sb2coJ21hcCcsbWFwKVxyXG4gICAgcmV0dXJuIG1hcDtcclxufVxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gdmFsaWRhdGVQbHVzTWludXModG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj4pe1xyXG4gICAgLy8gUGx1c2VzIGFyZSBzZXBhcmF0b3JzLlRoZXJlZm9yZSwgdGhleSBkbyBub3QgbmVlZCB0byBiZSBoZXJlIEFzIHRoZSBleHByZXNzaW9uIGlzIHRva2VuW11cclxuICAgIC8vTWludXNlcyBvbiB0aGUgb3RoZXIgaGFuZC5jYW4gZWl0aGVyIGJlIGEgc2VwYXJhdG9yLiBPciBhIG5lZ2F0aXZlIHNpZ25cclxuICAgIGNvbnN0IHBsdXNNYXA9dG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VufFBhcmVuLCBpbmRleDogYW55KSA9PiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0b2tlbi5nZXRWYWx1ZSgpID09PSAnQWRkaXRpb24nP2luZGV4IDogbnVsbCkuZmlsdGVyKChpbmRleDogbnVtYmVyIHwgbnVsbCkgPT4gaW5kZXggIT09IG51bGwpXHJcbiAgICBwbHVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgdG9rZW5zLnNwbGljZShpbmRleCwxKVxyXG4gICAgfSk7XHJcbiAgICBjb25zdCBtaW51c01hcD10b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW58UGFyZW4sIGluZGV4OiBhbnkpID0+IHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnRva2VuLmdldFZhbHVlKCkgPT09ICdTdWJ0cmFjdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcclxuICAgIFxyXG4gICAgbWludXNNYXAucmV2ZXJzZSgpLmZvckVhY2goKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0b2tlbnNbaW5kZXggKyAxXTtcclxuICAgICAgICBpZiAobmV4dFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdHlwZW9mIG5leHRUb2tlbi5nZXRWYWx1ZSgpID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICBuZXh0VG9rZW4uc2V0VmFsdWUobmV4dFRva2VuLmdldE51bWJlclZhbHVlKCkgKiAtMSlcclxuICAgICAgICAgICAgdG9rZW5zLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxufVxyXG5cclxuY29uc3QgdmFsaWRhdGVJbmRleD0oYXJyOiBhbnlbXSxpbmRleDogbnVtYmVyLG1hcmdpbjogbnVtYmVyPTApPT57XHJcbiAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDxhcnIubGVuZ3RoLW1hcmdpbjtcclxufSJdfQ==