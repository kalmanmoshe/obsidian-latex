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
        console.log(currentGroup.occurrencOf, testItemGroupItems);
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
        console.log(multArr.map(i => i.toString()));
        const name = multArr.map((o) => { o.parse(); return o.solution; });
        this.solution = new MathGroup(name);
        console.log(this.solution.toString(), this.solution.clone().getItems());
        this.solution.combiningLikeTerms();
        console.log(this.solution.toString(), this.solution.clone().getItems());
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
            //Add plus to make it multiple Letters.
            match = math.slice(i).match(/[a-zA-Z](_\([a-zA-Z0-9]*\))*/);
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
        const isABasicMathJaxTokenDoubleRightOp = (token) => {
            if (token && token instanceof BasicMathJaxToken) {
                return getOperatorsByAssociativity([1, 2]).includes(token.value?.toString() || '');
            }
            return false;
        };
        /**
         *
         * @param index
         * @returns boolan => True if thar isn't a doubleRight operator.
         */
        const testDoubleRight = (index) => {
            if (!this.validateIndex(index) || !(this.tokens[index] instanceof Paren))
                return false;
            const idx = findParenIndex(index, this.tokens)?.open;
            if (idx == null || !isOpenParen(this.tokens[index + 1]))
                return false;
            const prevToken = this.tokens[idx - 1];
            return !isABasicMathJaxTokenDoubleRightOp(prevToken);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUFtRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5JLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUV4UixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBSTdDLFNBQVMsU0FBUyxDQUFDLEtBQWEsRUFBRSxJQUFpQjtJQUMvQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ1gsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEIsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEI7WUFDSSxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FDOUIsU0FBYyxFQUNkLFNBQWlDLEVBQ2pDLE9BQTRCLEVBQUU7SUFFOUIsNERBQTREO0lBQzVELElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG1FQUFtRTtJQUNuRSxJQUFJLEtB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Q0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDO1lBQ3ZHLE9BQU8sS0FBSyxDQUFBO1FBQ2hCLE9BQU8sSUFBSSxDQUFBO0lBQ2YsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuL2ltVmVyeUxhenlcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgcmVnRXhwIH0gZnJvbSBcIi4uL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyBBc3NvY2lhdGl2aXR5LCBCcmFja2V0VHlwZSwgTWF0aEpheE9wZXJhdG9yTWV0YWRhdGEsIG1hdGhKYXhPcGVyYXRvcnNNZXRhZGF0YSwgT3BlcmF0b3JUeXBlIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XHJcblxyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgaXNPcGVuUGFyZW4sIGlzQ2xvc2VkUGFyZW4gfSBmcm9tIFwiLi4vdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIGlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSwgc2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHMsIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcclxuXHJcbmltcG9ydCB7IHBhcnNlT3BlcmF0b3IgfSBmcm9tIFwiLi9tYXRoRW5naW5lXCI7XHJcbmltcG9ydCB7IGl0IH0gZnJvbSBcIm5vZGU6dGVzdFwiO1xyXG5pbXBvcnQgeyBzaWduYWwgfSBmcm9tIFwiY29kZW1pcnJvclwiO1xyXG5cclxuZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBzdHJpbmcsIHdyYXA6IEJyYWNrZXRUeXBlKTogc3RyaW5nIHtcclxuICAgIHN3aXRjaCAod3JhcCkge1xyXG4gICAgICAgIGNhc2UgQnJhY2tldFR5cGUuUGFyZW50aGVzZXM6XHJcbiAgICAgICAgICAgIHJldHVybiBgKCR7Z3JvdXB9KWA7XHJcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5DdXJseUJyYWNlczpcclxuICAgICAgICAgICAgcmV0dXJuIGB7JHtncm91cH19YDtcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICByZXR1cm4gZ3JvdXA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkZWVwU2VhcmNoV2l0aFBhdGgoXHJcbiAgICBzdHJ1Y3R1cmU6IGFueSxcclxuICAgIHByZWRpY2F0ZTogKGl0ZW06IGFueSkgPT4gYm9vbGVhbixcclxuICAgIHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gPSBbXVxyXG4pOiB7IGl0ZW06IGFueTsgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSB9IHwgbnVsbCB7XHJcbiAgICAvLyBCYXNlIGNhc2U6IElmIHRoZSBjdXJyZW50IHN0cnVjdHVyZSBtYXRjaGVzIHRoZSBwcmVkaWNhdGVcclxuICAgIGlmIChwcmVkaWNhdGUoc3RydWN0dXJlKSkge1xyXG4gICAgICAgIHJldHVybiB7IGl0ZW06IHN0cnVjdHVyZSwgcGF0aCB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0J3MgYW4gYXJyYXksIHJlY3Vyc2l2ZWx5IHNlYXJjaCBlYWNoIGVsZW1lbnQgd2l0aCBpdHMgaW5kZXhcclxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0cnVjdHVyZSkpIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cnVjdHVyZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2ldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBpXSk7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0J3MgYW4gb2JqZWN0LCByZWN1cnNpdmVseSBzZWFyY2ggaXRzIHByb3BlcnRpZXMgd2l0aCB0aGVpciBrZXlzXHJcbiAgICBpZiAoc3RydWN0dXJlICE9PSBudWxsICYmIHR5cGVvZiBzdHJ1Y3R1cmUgPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzdHJ1Y3R1cmUpIHtcclxuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdHJ1Y3R1cmUsIGtleSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVba2V5XSwgcHJlZGljYXRlLCBbLi4ucGF0aCwga2V5XSk7XHJcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIG5vIG1hdGNoIGlzIGZvdW5kXHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG50eXBlIGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwPU1hdGhHcm91cEl0ZW18TWF0aEdyb3VwfEJhc2ljTWF0aEpheFRva2VuXHJcbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pOiBNYXRoR3JvdXBJdGVtW10ge1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xyXG4gICAgICAgIGl0ZW1zID0gW2l0ZW1zXTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmb3JtYXR0ZWRJdGVtcyA9IGl0ZW1zXHJcbiAgICAgICAgLnJlZHVjZSgoYWNjOiBNYXRoR3JvdXBJdGVtW10sIGl0ZW06IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yIHwgQmFzaWNNYXRoSmF4VG9rZW4pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBhY2MuY29uY2F0KGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtLmdldEl0ZW1zKCkpKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pIHtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLnZhbHVlICYmIChpdGVtLnR5cGUgPT09IFwibnVtYmVyXCIgfHwgaXRlbS50eXBlID09PSBcInZhcmlhYmxlXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjLnB1c2gobmV3IFRva2VuKGl0ZW0udmFsdWUpKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgIGBFeHBlY3RlZCBpdGVtIHRvIGJlIGEgbnVtYmVyIG9yIHZhcmlhYmxlIGJ1dCByZWNlaXZlZDogJHtpdGVtLnZhbHVlfWBcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICB9LCBbXSlcclxuXHJcbiAgICByZXR1cm4gZm9ybWF0dGVkSXRlbXM7XHJcbn1cclxuZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhPcGVyYXRvcihncm91cHM6IChNYXRoR3JvdXBJdGVtfE1hdGhHcm91cClbXSk6TWF0aEdyb3VwW117XHJcbiAgICBjb25zdCBmb3JtYXR0ZWRHcm91cHMgPSBncm91cHNcclxuICAgICAgICAucmVkdWNlKChhY2M6IE1hdGhHcm91cFtdLCBpdGVtOiBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciApID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcclxuICAgICAgICAgICAgICAgIGFjYy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xyXG4gICAgICAgICAgICAgICAgYWNjLnB1c2gobmV3IE1hdGhHcm91cChpdGVtKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICB9LCBbXSlcclxuXHJcbiAgICByZXR1cm4gZm9ybWF0dGVkR3JvdXBzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG91bGRBZGRQbHVzKGdyb3VwMT86IGFueSxncm91cDI/OiBhbnkpe1xyXG4gICAgaWYoIWdyb3VwMXx8IWdyb3VwMilyZXR1cm4gJyc7XHJcblxyXG4gICAgcmV0dXJuICcrJztcclxufVxyXG5cclxuZnVuY3Rpb24gY2FuQ29tYmluZShtYXRoOiBNYXRoR3JvdXAsb3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcblxyXG59XHJcbmV4cG9ydCBjbGFzcyBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgb3BlcmF0b3I6IHN0cmluZztcclxuICAgIGdyb3VwTnVtOiBudW1iZXIgPSAxO1xyXG4gICAgZ3JvdXBzOiBNYXRoR3JvdXBbXTtcclxuICAgIHNvbHV0aW9uOiBNYXRoR3JvdXA7XHJcbiAgICBjb21tdXRhdGl2ZTogYm9vbGVhbjtcclxuICAgIGlzT3BlcmFibGU6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbikge1xyXG4gICAgICAgIGlmIChvcGVyYXRvcikgdGhpcy5vcGVyYXRvciA9IG9wZXJhdG9yO1xyXG4gICAgICAgIGlmIChncm91cE51bSkgdGhpcy5ncm91cE51bSA9IGdyb3VwTnVtO1xyXG4gICAgICAgIGlmIChncm91cHMpIHRoaXMuZ3JvdXBzID0gZ3JvdXBzO1xyXG4gICAgICAgIGlmIChzb2x1dGlvbikgdGhpcy5zb2x1dGlvbiA9IHNvbHV0aW9uO1xyXG4gICAgICAgIGlmIChpc09wZXJhYmxlICE9PSB1bmRlZmluZWQpIHRoaXMuaXNPcGVyYWJsZSA9IGlzT3BlcmFibGU7XHJcbiAgICB9XHJcbiAgICBzdGF0aWMgY3JlYXRlKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbik6IE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yID09PSBcIk11bHRpcGxpY2F0aW9uXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKGdyb3Vwcywgc29sdXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcihvcGVyYXRvciwgZ3JvdXBOdW0sIGdyb3Vwcywgc29sdXRpb24sIGlzT3BlcmFibGUpO1xyXG4gICAgfVxyXG4gICAgdGVzdEdyb3Vwcyh0ZXN0OiAoZ3JvdXA6IE1hdGhHcm91cCkgPT4gYm9vbGVhbik6IGJvb2xlYW5bXSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcCh0ZXN0KTtcclxuICAgIH1cclxuXHJcbiAgICBtYXBWYXJpYWJsZXMoKTogYm9vbGVhbltdIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmhhc1ZhcmlhYmxlcygpKTtcclxuICAgIH1cclxuXHJcbiAgICBvcGVyYXRvclZhcmlhYmxlcygpOiBzdHJpbmdbXSB7XHJcbiAgICAgICAgcmV0dXJuIFsuLi5uZXcgU2V0KHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5ncm91cFZhcmlhYmxlcygpKS5mbGF0KCkpXTtcclxuICAgIH1cclxuXHJcbiAgICBjbG9uZSgpOiBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5jbG9uZSgpKTtcclxuICAgICAgICBjb25zdCBzb2x1dGlvbiA9IHRoaXMuc29sdXRpb24gPyB0aGlzLnNvbHV0aW9uLmNsb25lKCkgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgcmV0dXJuIE1hdGhKYXhPcGVyYXRvci5jcmVhdGUodGhpcy5vcGVyYXRvciwgdGhpcy5ncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgdGhpcy5pc09wZXJhYmxlKTtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZ1NvbHV0aW9uKCk6IHN0cmluZyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKSArICcgPSAnICsgdGhpcy5zb2x1dGlvbj8udG9TdHJpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yICYmXHJcbiAgICAgICAgICAgIHRoaXMub3BlcmF0b3IgPT09IGl0ZW0ub3BlcmF0b3IgJiZcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMubGVuZ3RoID09PSBpdGVtLmdyb3Vwcy5sZW5ndGggJiZcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMuZXZlcnkoKHQsIGluZGV4KSA9PiB0LmVxdWFscyhpdGVtLmdyb3Vwc1tpbmRleF0pKTtcclxuICAgIH1cclxuICAgIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH18bnVsbCAgeyByZXR1cm4gbnVsbDsgfSAgXHJcbiAgICBpc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RJdGVtOiBNYXRoSmF4T3BlcmF0b3IgfCBUb2tlbik6IGJvb2xlYW4ge3JldHVybiBmYWxzZTt9XHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBmdW5jdGlvbiB3cmFwR3JvdXAoZ3JvdXA6IE1hdGhHcm91cCwgd3JhcDogQnJhY2tldFR5cGUsb3B0aW9uYWw6IGJvb2xlYW4pOiBzdHJpbmcge1xyXG4gICAgICAgICAgICBpZihvcHRpb25hbCYmZ3JvdXAuc2luZ3VsYXIoKSlyZXR1cm4gZ3JvdXAudG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKTtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXBTdHI9Z3JvdXAudG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKVxyXG4gICAgICAgICAgICBzd2l0Y2ggKHdyYXApIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgQnJhY2tldFR5cGUuUGFyZW50aGVzZXM6XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGAoJHtncm91cFN0cn0pYDtcclxuICAgICAgICAgICAgICAgIGNhc2UgQnJhY2tldFR5cGUuQ3VybHlCcmFjZXM6XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGB7JHtncm91cFN0cn19YDtcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdyb3VwU3RyO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG5cclxuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHNlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy5vcGVyYXRvcik7XHJcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuICcnO1xyXG4gICAgICAgIGlmKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPjJ8fG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPDEpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbnVtYmVyIG9mIHBvc2l0aW9ucyBmb3IgYXNzb2NpYXRpdml0eTogJHttZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uc31gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gbWV0YWRhdGEubGF0ZXg7XHJcbiAgICAgICAgbGV0IGluZGV4PTA7XHJcbiAgICAgICAgbGV0IHN0cmluZyA9ICcnO1xyXG5cclxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyx0cnVlKS5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXgtMV0sdGhpcy5ncm91cHNbaW5kZXhdKSt3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLCBpdGVtLmJyYWNrZXRUeXBlLCBpdGVtLmlzQnJhY2tldE9wdGlvbmFsKTtcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xyXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLGZhbHNlKS5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXhdLHRoaXMuZ3JvdXBzW2luZGV4KzFdKSt3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLCBpdGVtLmJyYWNrZXRUeXBlLCBpdGVtLmlzQnJhY2tldE9wdGlvbmFsKTtcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKGN1c3RvbUZvcm1hdHRlcikgXHJcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXHJcbiAgICAgICAgcmV0dXJuIHN0cmluZy50cmltKCk7XHJcbiAgICB9XHJcbiAgICBwYXJzZU1hdGhqYXhPcGVyYXRvcigpIHtcclxuICAgICAgICBwYXJzZU9wZXJhdG9yKHRoaXMpO1xyXG4gICAgfVxyXG59XHJcbmV4cG9ydCBjbGFzcyBFcXVhbHNPcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvcntcclxuXHJcbn1cclxuZXhwb3J0IGNsYXNzIERpdmlzaW9uT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3J7XHJcblxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgTXVsdGlwbGljYXRpb25PcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICBjb25zdHJ1Y3Rvcihncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXApIHtcclxuICAgICAgICBzdXBlcihcIk11bHRpcGxpY2F0aW9uXCIsIDIsIGdyb3Vwcywgc29sdXRpb24sIHRydWUpO1xyXG4gICAgICAgIHRoaXMuY29tbXV0YXRpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMucmVtb3ZlTXVsdGlwbGljYXRpb25EZXB0aHMoKTtcclxuICAgIH1cclxuXHJcbiAgICByZW1vdmVNdWx0aXBsaWNhdGlvbkRlcHRocygpe1xyXG4gICAgICAgIHdoaWxlKHRoaXMuZ3JvdXBzLnNvbWUoKGc6IE1hdGhHcm91cCk9PiBnLnNpbmd1bGFyKCkmJmcuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpKXtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXA9dGhpcy5ncm91cHMuZmluZCgoZzogTWF0aEdyb3VwKT0+IGcuc2luZ3VsYXIoKSYmZy5nZXRJdGVtcygpWzBdIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcilcclxuICAgICAgICAgICAgaWYoZ3JvdXApXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnNwbGljZSh0aGlzLmdyb3Vwcy5pbmRleE9mKGdyb3VwKSwxLC4uLihncm91cC5nZXRJdGVtcygpWzBdIGFzIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpLmdyb3VwcylcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGFzT2NjdXJyZW5jZUdyb3VwKG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcixvY2N1cnJlbmNPZjogc3RyaW5nfFRva2VufE1hdGhHcm91cCk6IE11bHRpcGxpY2F0aW9uT3BlcmF0b3Ige1xyXG4gICAgICAgIG9jY3VycmVuY09mPXR5cGVvZiBvY2N1cnJlbmNPZj09PVwic3RyaW5nXCI/XHJcbiAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNPZildKTpvY2N1cnJlbmNPZiBpbnN0YW5jZW9mIFRva2VuP1xyXG4gICAgICAgICAgICAgICAgbmV3IE1hdGhHcm91cChbb2NjdXJyZW5jT2ZdKTpvY2N1cnJlbmNPZjtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKFtuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jZXNDb3VudCldKSxvY2N1cnJlbmNPZl0pXHJcbiAgICB9XHJcbiAgICBcclxuICAgIG92ZXJyaWRlIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH0ge1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuZ3JvdXBzLnJlZHVjZShcclxuICAgICAgICAgICAgKGFjYzogeyB0b3RhbE51bTogbnVtYmVyOyBhcnI6IE1hdGhHcm91cFtdIH0sIGl0ZW06IE1hdGhHcm91cCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uZ2V0T3BlcmFibGVWYWx1ZSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjLnRvdGFsTnVtICs9IGl0ZW0uZ2V0T3BlcmFibGVWYWx1ZSgpITtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjLmFyci5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgeyB0b3RhbE51bTogMCwgYXJyOiBbXSB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4geyBvY2N1cnJlbmNlc0NvdW50OiByZXN1bHQudG90YWxOdW0sIG9jY3VycmVuY09mOiByZXN1bHQuYXJyIH07XHJcbiAgICB9XHJcblxyXG4gICAgYWRkVG9PY2N1cnJlbmNlR3JvdXAodmFsdWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG51bWJlckdyb3VwID0gdGhpcy5ncm91cHMuZmluZChncm91cCA9PiBncm91cC5zaW5nbGVOdW1iZXIoKSk7XHJcbiAgICAgICAgaWYgKG51bWJlckdyb3VwKSB7XHJcbiAgICAgICAgICAgIG51bWJlckdyb3VwLnNpbmdsZVRva2VuU2V0KHZhbHVlLCB0cnVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5wdXNoKG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbigxICsgdmFsdWUpXSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBvdmVycmlkZSBpc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RJdGVtOiBNYXRoSmF4T3BlcmF0b3IgfCBUb2tlbik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IGlzVmFsaWRJdGVtID0gdGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCB0ZXN0SXRlbSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3I7XHJcbiAgICAgICAgaWYgKCFpc1ZhbGlkSXRlbSkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudEdyb3VwID0gdGhpcy5nZXRPY2N1cnJlbmNlR3JvdXAoKTtcclxuICAgICAgICBpZiAoIWN1cnJlbnRHcm91cCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudEdyb3VwSXRlbXMgPSBjdXJyZW50R3JvdXAub2NjdXJyZW5jT2YuZmxhdE1hcChncm91cCA9PiBncm91cC5nZXRJdGVtcygpKTtcclxuICAgIFxyXG4gICAgICAgIGlmICh0ZXN0SXRlbSBpbnN0YW5jZW9mIFRva2VuKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzU2luZ2xlSXRlbU1hdGNoID0gY3VycmVudEdyb3VwSXRlbXMubGVuZ3RoID09PSAxICYmIGN1cnJlbnRHcm91cEl0ZW1zWzBdLmVxdWFscyh0ZXN0SXRlbSk7XHJcbiAgICAgICAgICAgIGlmIChpc1NpbmdsZUl0ZW1NYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRUb09jY3VycmVuY2VHcm91cCgxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gaXNTaW5nbGVJdGVtTWF0Y2g7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCB0ZXN0SXRlbUdyb3VwID0gdGVzdEl0ZW0uZ2V0T2NjdXJyZW5jZUdyb3VwKCk7XHJcbiAgICAgICAgaWYgKCF0ZXN0SXRlbUdyb3VwKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cEl0ZW1zID0gdGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNPZjtcclxuICAgICAgICBjb25zb2xlLmxvZyhjdXJyZW50R3JvdXAub2NjdXJyZW5jT2YsdGVzdEl0ZW1Hcm91cEl0ZW1zKVxyXG4gICAgICAgIGNvbnN0IGFyZUdyb3Vwc01hdGNoaW5nID1jdXJyZW50R3JvdXAub2NjdXJyZW5jT2YubGVuZ3RoID09PSB0ZXN0SXRlbUdyb3VwSXRlbXMubGVuZ3RoICYmXHJcbiAgICAgICAgICAgIGN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5ldmVyeSgoY3VycmVudFN1Ykdyb3VwOiBNYXRoR3JvdXApID0+XHJcbiAgICAgICAgICAgICAgICB0ZXN0SXRlbUdyb3VwSXRlbXMuc29tZSgodGVzdFN1Ykdyb3VwOiBNYXRoR3JvdXApID0+IFxyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRTdWJHcm91cC5pc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RTdWJHcm91cClcclxuICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgaWYgKGFyZUdyb3Vwc01hdGNoaW5nKSB7IFxyXG4gICAgICAgICAgICB0aGlzLmFkZFRvT2NjdXJyZW5jZUdyb3VwKHRlc3RJdGVtR3JvdXAub2NjdXJyZW5jZXNDb3VudCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXsgXHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSAnXFxcXGNkb3QgJztcclxuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XHJcbiAgICAgICAgY29uc3QgdG9BZGRDZG90PSh0aGlzR3JvdXA6IE1hdGhHcm91cCxuZXh0R3JvdXA/Ok1hdGhHcm91cCk9PntcclxuICAgICAgICAgICAgaWYoIW5leHRHcm91cClyZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGlmKG5leHRHcm91cC5pc1NpbmdsZVZhcigpfHx0aGlzR3JvdXAuaXNTaW5nbGVWYXIoKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCByZW9yZGVyZWRHcm91cHM9dGhpcy5ncm91cHMuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoYS5zaW5nbGVOdW1iZXIoKSAmJiAhYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAoIWEuc2luZ2xlTnVtYmVyKCkgJiYgYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhLnNpbmd1bGFyKCkgJiYgIWIuc2luZ3VsYXIoKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAoIWEuc2luZ3VsYXIoKSAmJiBiLnNpbmd1bGFyKCkpIHJldHVybiAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZW9yZGVyZWRHcm91cHMuZm9yRWFjaCgoZ3JvdXAsaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cChncm91cC50b1N0cmluZygpLCBncm91cC5zaW5ndWxhcigpP0JyYWNrZXRUeXBlLk5vbmU6QnJhY2tldFR5cGUuUGFyZW50aGVzZXMpO1xyXG4gICAgICAgICAgICBpZiAodG9BZGRDZG90KGdyb3VwLHJlb3JkZXJlZEdyb3Vwc1tpbmRleCsxXSkpXHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gb3BlcmF0b3I7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qXHJcbiAgICB0aGlzLmdyb3VwcyA9IFtbMSwgMiwgM10sWzQsIDUsIDZdLFs3LCA4LCA5XV1cclxuICAgIEV4cGVjdGVkIE91dHB1dDpcclxuICAgIFtcclxuICAgICAgICAxKjQsIDEqNSwgMSo2LCAxKjcsIDEqOCwgMSo5LFxyXG4gICAgICAgIDIqNCwgMio1LCAyKjYsIDIqNywgMio4LCAyKjksXHJcbiAgICAgICAgMyo0LCAzKjUsIDMqNiwgMyo3LCAzKjgsIDMqOSxcclxuICAgICAgICA0KjcsIDQqOCwgNCo5LFxyXG4gICAgICAgIDUqNywgNSo4LCA1KjksXHJcbiAgICAgICAgNio3LCA2KjgsIDYqOVxyXG4gICAgXSAgXHJcbiAgICAqL1xyXG4gICAgcGFyc2VNYXRoamF4T3BlcmF0b3IoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbXVsdEFycj10aGlzLmVsaW1pbmF0R3JvdXBzV2l0aE11bHRpcGxlVGVybXMoKS5nZXRJdGVtcygpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKG11bHRBcnIubWFwKGk9PmkudG9TdHJpbmcoKSkpXHJcbiAgICAgICAgY29uc3QgbmFtZT1tdWx0QXJyLm1hcCgobzogTXVsdGlwbGljYXRpb25PcGVyYXRvcik9PiB7by5wYXJzZSgpO3JldHVybiBvLnNvbHV0aW9ufSlcclxuICAgICAgICB0aGlzLnNvbHV0aW9uPW5ldyBNYXRoR3JvdXAobmFtZSk7XHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5zb2x1dGlvbi50b1N0cmluZygpLHRoaXMuc29sdXRpb24uY2xvbmUoKS5nZXRJdGVtcygpKVxyXG4gICAgICAgIHRoaXMuc29sdXRpb24uY29tYmluaW5nTGlrZVRlcm1zKCk7XHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5zb2x1dGlvbi50b1N0cmluZygpLHRoaXMuc29sdXRpb24uY2xvbmUoKS5nZXRJdGVtcygpKVxyXG4gICAgfVxyXG4gICAgZWxpbWluYXRHcm91cHNXaXRoTXVsdGlwbGVUZXJtcygpOk1hdGhHcm91cCB7XHJcbiAgICAgICAgbGV0IG9wZXJhdG9yc0FjY3VtdWxhdGlvbjogTXVsdGlwbGljYXRpb25PcGVyYXRvcltdID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3Qgc2luZ2xlVGVybUdyb3VwcyA9IHRoaXMuZ3JvdXBzLmZpbHRlcihncm91cCA9PiBncm91cC5zaW5ndWxhcigpKTtcclxuICAgICAgICBjb25zdCBtdWx0aVRlcm1Hcm91cHMgPSB0aGlzLmdyb3Vwcy5maWx0ZXIoZ3JvdXAgPT4gIWdyb3VwLnNpbmd1bGFyKCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHNpbmdsZXNNYXRoR3JvdXAgPSBzaW5nbGVUZXJtR3JvdXBzLmxlbmd0aCAhPT0gMCBcclxuICAgICAgICAgICAgPyBbbmV3IE1hdGhHcm91cChbbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3Ioc2luZ2xlVGVybUdyb3VwcyldKV0gXHJcbiAgICAgICAgICAgIDogW107XHJcbiAgICAgICAgbGV0IGdyb3VwcyA9IFsuLi5zaW5nbGVzTWF0aEdyb3VwLCAuLi5tdWx0aVRlcm1Hcm91cHNdO1xyXG4gICAgXHJcbiAgICAgICAgd2hpbGUgKGdyb3Vwcy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQSA9IGdyb3Vwcy5zaGlmdCgpO1xyXG4gICAgICAgICAgICBjb25zdCBncm91cEIgPSBncm91cHMuc2hpZnQoKTtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoIWdyb3VwQSB8fCAhZ3JvdXBCKSBicmVhaztcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBncm91cEFJdGVtcyA9IGdyb3VwQS5nZXRJdGVtcygpO1xyXG4gICAgICAgICAgICBjb25zdCBncm91cEJJdGVtcyA9IGdyb3VwQi5nZXRJdGVtcygpO1xyXG4gICAgICAgICAgICBvcGVyYXRvcnNBY2N1bXVsYXRpb24gPSBbXTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBhIG9mIGdyb3VwQUl0ZW1zKSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGIgb2YgZ3JvdXBCSXRlbXMpIHtcclxuICAgICAgICAgICAgICAgICAgICBvcGVyYXRvcnNBY2N1bXVsYXRpb24ucHVzaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhPcGVyYXRvcihbYS5jbG9uZSgpLCBiLmNsb25lKCldKSlcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgZ3JvdXBzLnVuc2hpZnQobmV3IE1hdGhHcm91cChvcGVyYXRvcnNBY2N1bXVsYXRpb24pKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGdyb3Vwc1swXTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcbiAgIFxyXG4gICAgXHJcblxyXG4gICAgcGFyc2UoKXtcclxuICAgICAgICBjb25zdCB7IG51bWJlcnMsIG90aGVyIH0gPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoKHJlc3VsdDogeyBudW1iZXJzOiBNYXRoR3JvdXBbXTsgb3RoZXI6IE1hdGhHcm91cFtdIH0sIGl0ZW06IE1hdGhHcm91cCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uc2luZ2xlTnVtYmVyKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQubnVtYmVycy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQub3RoZXIucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHsgbnVtYmVyczogW10sIG90aGVyOiBbXSB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICBsZXQgdmFsdWU9MTtcclxuICAgICAgICBudW1iZXJzLmZvckVhY2goZ3JvdXAgPT4ge1xyXG4gICAgICAgICAgICB2YWx1ZSo9KGdyb3VwLmdldEl0ZW1zKClbMF1hcyBUb2tlbikuZ2V0TnVtYmVyVmFsdWUoKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmKHRoaXMuZ3JvdXBzLmxlbmd0aD09PTApXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlwiKTtcclxuICAgICAgICBpZigobnVtYmVycy5sZW5ndGg+MCYmb3RoZXIubGVuZ3RoPT09MCl8fHZhbHVlPT09MCl7XHJcbiAgICAgICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChuZXcgVG9rZW4odmFsdWUpKTtyZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRlc3Q9KG1haW5Hcm91cDogYW55LCB0ZXN0R3JvdXA6IGFueSk9PntcclxuICAgICAgICAgICAgaWYobWFpbkdyb3VwIGluc3RhbmNlb2YgTWF0aEdyb3VwJiZ0ZXN0R3JvdXAgaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG1haW5Hcm91cC5pc1Bvd0dyb3VwTWF0Y2godGVzdEdyb3VwKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZmlsdGVyZWQ9ZmlsdGVyQnlUZXN0Q29uc3Qob3RoZXIsdGVzdCk7XHJcbiAgICAgICAgY29uc3QgYXJyPVsuLi5maWx0ZXJlZF07XHJcbiAgICAgICAgaWYodmFsdWUhPT0xKVxyXG4gICAgICAgICAgICBhcnIucHVzaChuZXcgVG9rZW4odmFsdWUpKTtcclxuXHJcbiAgICAgICAgaWYoYXJyLmxlbmd0aD4xKXtcclxuICAgICAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKFtuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKGFycikpXSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKGFyclswXSk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZmlsdGVyQnlUZXN0Q29uc3QoXHJcbiAgICBpdGVtczogYW55W10sXHJcbiAgICB0ZXN0OiAobWFpbkl0ZW06IGFueSwgdGVzdEl0ZW06IGFueSkgPT4gYm9vbGVhblxyXG4pOiBhbnlbXSB7XHJcbiAgICBsZXQgaW5kZXggPSAwO1xyXG4gICAgd2hpbGUgKGluZGV4IDwgaXRlbXMubGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgbWFpbkl0ZW0gPSBpdGVtc1tpbmRleF07XHJcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxMZW5ndGggPSBpdGVtcy5sZW5ndGg7XHJcblxyXG4gICAgICAgIGl0ZW1zID0gaXRlbXMuZmlsdGVyKChvdGhlckl0ZW0sIG90aGVySW5kZXgpID0+IHtcclxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSBvdGhlckluZGV4KSByZXR1cm4gdHJ1ZTsgLy8gS2VlcCBjdXJyZW50IGl0ZW1cclxuICAgICAgICAgICAgY29uc3QgdGVtcD0hdGVzdChtYWluSXRlbSwgb3RoZXJJdGVtKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRlbXBcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVzdGFydCBpdGVyYXRpb24gaWYgaXRlbXMgd2VyZSByZW1vdmVkXHJcbiAgICAgICAgaWYgKGl0ZW1zLmxlbmd0aCA8IG9yaWdpbmFsTGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGluZGV4ID0gMDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBpdGVtcztcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHRyaWdvbm9tZXRyaWNJZGVudGl0aWVzKCl7XHJcblxyXG59XHJcblxyXG5leHBvcnQgdHlwZSBNYXRoR3JvdXBJdGVtPVRva2VufE1hdGhKYXhPcGVyYXRvclxyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhHcm91cCB7XHJcbiAgICBwcml2YXRlIGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10gPSBbXTtcclxuICAgIC8vb3ZlcnZpZXc6IE1hdGhPdmVydmlld1xyXG4gICAgXHJcbiAgICBjb25zdHJ1Y3RvcihpdGVtcz86IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pIHtcclxuICAgICAgICBpZihpdGVtcyl0aGlzLnNldEl0ZW1zKGl0ZW1zKTtcclxuICAgIH1cclxuICAgIGdldEl0ZW1zKCk6IE1hdGhHcm91cEl0ZW1bXSB7cmV0dXJuIHRoaXMuaXRlbXM7fVxyXG4gICAgc2V0SXRlbShpdGVtOiBNYXRoR3JvdXBJdGVtLGluZGV4Om51bWJlcil7XHJcbiAgICAgICAgdGhpcy5pdGVtc1tpbmRleF09aXRlbTtcclxuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KClcclxuICAgIH1cclxuICAgIHJlcGxhY2VJdGVtQ2VsbChpdGVtOiBNYXRoR3JvdXBJdGVtfE1hdGhHcm91cCxpbmRleDpudW1iZXIpe1xyXG4gICAgICAgIHRoaXMuaXRlbXMuc3BsaWNlKGluZGV4LDEsLi4uZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW0pKVxyXG4gICAgfVxyXG4gICAgc2V0SXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pIHtcclxuICAgICAgICB0aGlzLml0ZW1zID0gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW1zKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KCkgICAgXHJcbiAgICB9XHJcbiAgICBncm91cFZhcmlhYmxlcygpOiBzdHJpbmdbXSB7XHJcbiAgICAgICAgY29uc3QgdmFyaWFibGVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuICYmIGl0ZW0uaXNWYXIoKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5nZXRTdHJpbmdWYWx1ZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF2YXJpYWJsZXMuY29udGFpbnMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlcy5wdXNoKGtleSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gdmFyaWFibGVzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB1cGRhdGVPdmVydmlldygpey8qXHJcbiAgICAgICAgdGhpcy5vdmVydmlldz1uZXcgTWF0aE92ZXJ2aWV3KClcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3c2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcykqL1xyXG4gICAgfVxyXG4gICAgc2luZ2xlVG9rZW5TZXQodmFsdWU6IG51bWJlcix0b0FkZD86IGJvb2xlYW4pe1xyXG4gICAgICAgIGNvbnN0IHRva2VuPXRoaXMuaXRlbXNbMF0gYXMgVG9rZW47XHJcbiAgICAgICAgY29uc3QgbmV3VmFsdWU9dG9BZGQ/dmFsdWUrdG9rZW4uZ2V0TnVtYmVyVmFsdWUoKTp2YWx1ZTtcclxuICAgICAgICBpZih0aGlzLnNpbmd1bGVUb2tlbigpKXtcclxuICAgICAgICAgICAgdG9rZW4uc2V0VmFsdWUobmV3VmFsdWUpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgY2xvbmUoKTogTWF0aEdyb3VwIHtcclxuICAgICAgICByZXR1cm4gbmV3IE1hdGhHcm91cCh0aGlzLml0ZW1zLm1hcChpdGVtPT5pdGVtLmNsb25lKCkpKTtcclxuICAgIH1cclxuXHJcbiAgICBoYXNPcGVyYXRvcigpOiB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKTt9XHJcbiAgICBkb2VzbnRIYXZlT3BlcmF0b3IoKTogIHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiAhdGhpcy5oYXNPcGVyYXRvcigpO31cclxuICAgIHNpbmdsZU51bWJlcigpe3JldHVybiB0aGlzLnNpbmd1bGFyKCkmJnRoaXMubnVtYmVyT25seSgpfVxyXG4gICAgbnVtYmVyT25seSgpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5ldmVyeSh0ID0+ICh0IGluc3RhbmNlb2YgVG9rZW4mJiF0LmlzVmFyKCkpKTt9XHJcbiAgICBoYXNWYXJpYWJsZXMoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSh0ID0+IHQgaW5zdGFuY2VvZiBUb2tlbiYmdC5pc1ZhcigpKTt9XHJcblxyXG4gICAgc2luZ3VsYXIoKTpib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGggPT09IDEgJiYgdGhpcy5pdGVtc1swXSAhPT0gdW5kZWZpbmVkO31cclxuICAgIHNpbmd1bGVUb2tlbigpOiB0aGlzIGlzIHsgaXRlbXM6IFtUb2tlbl0gfSB7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSAmJiB0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW47fVxyXG4gICAgaXNPcGVyYWJsZSgpe3JldHVybiB0cnVlfVxyXG5cclxuICAgIGdldE9wZXJhYmxlVmFsdWUoKTogbnVtYmVyIHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5pdGVtcztcclxuICAgICAgICBpZiAodGhpcy5udW1iZXJPbmx5KCkpIHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlPTA7XHJcbiAgICAgICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW06IFRva2VuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBpdGVtLmdldE51bWJlclZhbHVlKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgaXNTaW5nbGVWYXIoKXtcclxuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdYXMgVG9rZW5cclxuICAgICAgICByZXR1cm4gdGhpcy5zaW5ndWxlVG9rZW4oKSYmdG9rZW4uaXNWYXIoKVxyXG4gICAgfVxyXG4gICAgZ2V0U2luZ2xlVmFyKCl7XHJcbiAgICAgICAgaWYoIXRoaXMuaXNTaW5nbGVWYXIoKSlyZXR1cm4gbnVsbDtcclxuICAgICAgICByZXR1cm4gKHRoaXMuaXRlbXNbMF1hcyBUb2tlbikuZ2V0U3RyaW5nVmFsdWUoKTtcclxuICAgIH1cclxuXHJcbiAgICBpc1Bvd0dyb3VwTWF0Y2goZ3JvdXA6IE1hdGhHcm91cCk6Ym9vbGVhbntcclxuICAgICAgICBpZih0aGlzLml0ZW1zLmxlbmd0aCE9PTEpcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgaWYodGhpcy5pc1NpbmdsZVZhcigpJiZncm91cC5pc1NpbmdsZVZhcigpJiZ0aGlzLmVxdWFscyhncm91cCkpe1xyXG4gICAgICAgICAgICB0aGlzLml0ZW1zPVtNYXRoSmF4T3BlcmF0b3IuY3JlYXRlKFwiUG93ZXJcIiwyLFtuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXNbMF0pLG5ldyBNYXRoR3JvdXAobmV3IFRva2VuKDIpKV0pXVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMoZ3JvdXApXHJcbiAgICB9XHJcblxyXG4gICAgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlcjogTWF0aEdyb3VwKXtcclxuICAgICAgICBjb25zdCBib3RoU2luZ3VsYXI9dGhpcy5zaW5ndWxhcigpJiZvdGhlci5zaW5ndWxhcigpXHJcbiAgICAgICAgY29uc3QgZmlyc3RJdGVtTWF0aEpheG9PZXJhdG9yPXRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3ImJm90aGVyLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3JcclxuICAgICAgICBpZighYm90aFNpbmd1bGFyJiYhZmlyc3RJdGVtTWF0aEpheG9PZXJhdG9yKXJldHVybiBmYWxzZTtcclxuICAgICAgICBjb25zdCBhPSh0aGlzLml0ZW1zWzBdYXMgTWF0aEpheE9wZXJhdG9yKS5pc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVyLmdldEl0ZW1zKClbMF0pXHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMob3RoZXIpXHJcbiAgICB9XHJcblxyXG4gICAgZXF1YWxzKGl0ZW06IFRva2VufE1hdGhKYXhPcGVyYXRvcnxNYXRoR3JvdXApe1xyXG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbil7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy5pdGVtc1swXS5lcXVhbHMoaXRlbSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3Ipe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT0xJiZ0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yJiZ0aGlzLml0ZW1zWzBdLmVxdWFscyhpdGVtKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09aXRlbS5pdGVtcy5sZW5ndGgmJnRoaXMuaXRlbXMuZXZlcnkoKHQ6IE1hdGhHcm91cEl0ZW0pPT57XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5pdGVtcy5zb21lKChpKT0+dC5lcXVhbHMoaSkpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJZCgpe1xyXG4gICAgICAgIHJldHVybiAnTWF0aEdyb3VwJ1xyXG4gICAgfVxyXG4gICAgY29tYmluaW5nTGlrZVRlcm1zKCkge1xyXG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3ID0gbmV3IE1hdGhPdmVydmlldygpO1xyXG4gICAgICAgIG92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcyk7XHJcbiAgICAgICAgdGhpcy5zZXRJdGVtcyhvdmVydmlldy5yZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKSk7XHJcbiAgICAgICAgbGV0IGluZGV4ID0gMDtcclxuICAgICAgICB3aGlsZSAoaW5kZXggPCB0aGlzLml0ZW1zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpbmRleF07XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxMZW5ndGggPSB0aGlzLml0ZW1zLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXRlbXMgPSB0aGlzLml0ZW1zLmZpbHRlcigob3RoZXJJdGVtOiBNYXRoR3JvdXBJdGVtLCBvdGhlckluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2ggPSBpdGVtLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2gob3RoZXJJdGVtKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWlzTWF0Y2g7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLml0ZW1zLmxlbmd0aCA8IG9yaWdpbmFsTGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJztcclxuICAgICAgICBpZighQXJyYXkuaXNBcnJheSh0aGlzLml0ZW1zKSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW1zIHRvIGJlIGFuIGFycmF5IGJ1dCByZWNlaXZlZDogXCIrdGhpcy5pdGVtcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgc3RyaW5nKz1zaG91bGRBZGRQbHVzKHRoaXMuaXRlbXNbaW5kZXgtMV0saXRlbSlcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXAgJiYgIWl0ZW0uc2luZ3VsYXIoKSkge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IGAoJHtpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcil9KWA7XHJcbiAgICAgICAgICAgIH0gIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IGl0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKTtcclxuICAgICAgICAgICAgfSBpZiAoY3VzdG9tRm9ybWF0dGVyKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgPSBjdXN0b21Gb3JtYXR0ZXIoaXRlbSxzdHJpbmcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZztcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyBNYXRoT3ZlcnZpZXcge1xyXG4gICAgcHJpdmF0ZSB2YXJpYWJsZXM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBwcml2YXRlIG9wZXJhdG9yczogTWFwPHN0cmluZywgYW55PjtcclxuICAgIHByaXZhdGUgbnVtYmVyOiBudW1iZXI7XHJcbiAgICBnZXROdW1iZXIoKTogbnVtYmVye3JldHVybiB0aGlzLm51bWJlcjt9XHJcbiAgICBnZXRWYXJpYWJsZXMoKTogTWFwPHN0cmluZywgYW55PntyZXR1cm4gdGhpcy52YXJpYWJsZXM7fVxyXG4gICAgZ2V0T3BlcmF0b3JzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMub3BlcmF0b3JzO31cclxuICAgIGNvbnN0cnVjdG9yKHZhcmlhYmxlcz86IE1hcDxzdHJpbmcsIGFueT4sb3BlcmF0b3JzPzogTWFwPHN0cmluZywgYW55PixudW1iZXI/OiBudW1iZXIpe1xyXG4gICAgICAgIGlmKHZhcmlhYmxlcyl0aGlzLnZhcmlhYmxlcz12YXJpYWJsZXM7XHJcbiAgICAgICAgaWYob3BlcmF0b3JzKXRoaXMub3BlcmF0b3JzPW9wZXJhdG9ycztcclxuICAgICAgICBpZihudW1iZXIpdGhpcy5udW1iZXI9bnVtYmVyO1xyXG4gICAgfVxyXG4gICAgZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyhpdGVtczogTWF0aEdyb3VwSXRlbVtdKSB7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXM9bmV3IE1hcCgpO1xyXG4gICAgICAgIHRoaXMub3BlcmF0b3JzPW5ldyBNYXAoKTtcclxuICAgICAgICBpdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZpdGVtLmlzVmFyKCk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVWYXJpYWJsZXNNYXAoaXRlbS5nZXRTdHJpbmdWYWx1ZSgpKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIFRva2VuJiYhaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlTXVtYmVyKGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3I6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVPcGVyYXRvcnNNYXAoaXRlbSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gY2F0ZWdvcnkgaW4gTWF0aE92ZXJ2aWV3IHNlcGFyYXRlSW50b0luZGl2aWR1YWxzXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfVxyXG4gICAgdXBkYXRlTXVtYmVyKG51bWJlcjogbnVtYmVyKXsgdGhpcy5udW1iZXI9dGhpcy5udW1iZXI/dGhpcy5udW1iZXIrbnVtYmVyOm51bWJlcjt9XHJcbiAgICB1cGRhdGVWYXJpYWJsZXNNYXAoa2V5OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzID8/PSBuZXcgTWFwPHN0cmluZywgeyBjb3VudDogbnVtYmVyOyBpdGVtczogYW55W10gfT4oKTtcclxuICAgICAgICBpZighdGhpcy52YXJpYWJsZXMuaGFzKGtleSkpe3RoaXMudmFyaWFibGVzLnNldChrZXkse2NvdW50OiAwfSl9XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZ2V0KGtleSkuY291bnQrKztcclxuICAgIH1cclxuICAgIHVwZGF0ZU9wZXJhdG9yc01hcChvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcclxuICAgICAgICBjb25zdCBrZXk9b3BlcmF0b3Iub3BlcmF0b3I7XHJcbiAgICAgICAgaWYoIXRoaXMub3BlcmF0b3JzKSB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XHJcbiAgICAgICAgaWYoIXRoaXMub3BlcmF0b3JzLmhhcyhrZXkpKXt0aGlzLm9wZXJhdG9ycy5zZXQoa2V5LHtjb3VudDogMCwgaXRlbXM6IFtdfSl9XHJcbiAgICAgICAgY29uc3QgZW50cnkgPSB0aGlzLm9wZXJhdG9ycy5nZXQoa2V5KSE7XHJcbiAgICAgICAgZW50cnkuY291bnQgKz0gMTtcclxuICAgICAgICBlbnRyeS5pdGVtcy5wdXNoKG9wZXJhdG9yKTtcclxuICAgIH1cclxuXHJcbiAgICBoYXNWYXIoKXtyZXR1cm4gdGhpcy52YXJpYWJsZXMmJnRoaXMudmFyaWFibGVzLnNpemU+MH1cclxuICAgIGhhc09wKCl7cmV0dXJuIHRoaXMub3BlcmF0b3JzJiZ0aGlzLm9wZXJhdG9ycy5zaXplPjB9XHJcbiAgICBvbmx5TnVtZXJpYygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLm51bWJlciYmIXRoaXMuaGFzVmFyKCkmJiF0aGlzLmhhc09wKClcclxuICAgIH1cclxuICAgIHJlY29uc3RydWN0QXNNYXRoR3JvdXBJdGVtcygpe1xyXG4gICAgICAgIGNvbnN0IGl0ZW1zOiBNYXRoR3JvdXBJdGVtW109W107XHJcbiAgICAgICAgaWYodGhpcy5udW1iZXIpaXRlbXMucHVzaChuZXcgVG9rZW4odGhpcy5udW1iZXIpKTtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKHZhbHVlLmNvdW50PT09MSl7XHJcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKG5ldyBUb2tlbihrZXkpKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYodmFsdWUuY291bnQ+MSl7XHJcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKE11bHRpcGxpY2F0aW9uT3BlcmF0b3IuYXNPY2N1cnJlbmNlR3JvdXAodmFsdWUuY291bnQsa2V5KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmKHRoaXMub3BlcmF0b3JzKXtcclxuICAgICAgICAgICAgaXRlbXMucHVzaCguLi5BcnJheS5mcm9tKHRoaXMub3BlcmF0b3JzLnZhbHVlcygpKS5mbGF0TWFwKChvcGVyYXRvcjogYW55KSA9PiBvcGVyYXRvci5pdGVtcykpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBpdGVtcztcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgVG9rZW57XHJcbiAgICBwcml2YXRlIHZhbHVlOiBudW1iZXJ8c3RyaW5nO1xyXG4gICAgY29uc3RydWN0b3IodmFsdWU6bnVtYmVyfHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgIH1cclxuICAgIGdldE51bWJlclZhbHVlKCk6bnVtYmVye3JldHVybiAodGhpcy52YWx1ZSBhcyBudW1iZXIpfVxyXG4gICAgZ2V0U3RyaW5nVmFsdWUoKTpzdHJpbmd7cmV0dXJuICh0aGlzLnZhbHVlIGFzIHN0cmluZyl9XHJcbiAgICBnZXRWYWx1ZSgpe3JldHVybiB0aGlzLnZhbHVlfVxyXG4gICAgc2V0VmFsdWUodmFsdWU6IG51bWJlcnxzdHJpbmcpe3RoaXMudmFsdWU9dmFsdWU7fVxyXG4gICAgaXNWYXIoKSB7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlID09PSAnc3RyaW5nJzt9XHJcbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSkge1xyXG4gICAgICAgIHJldHVybiBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJnRoaXMudmFsdWUgPT09IGl0ZW0udmFsdWU7XHJcbiAgICB9XHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnXHJcbiAgICAgICAgaWYoIXRoaXMuaXNWYXIoKSYmdGhpcy5nZXROdW1iZXJWYWx1ZSgpPDApXHJcbiAgICAgICAgICAgIHN0cmluZys9Jy0nO1xyXG4gICAgICAgIHN0cmluZys9dGhpcy52YWx1ZTtcclxuICAgICAgICBpZihjdXN0b21Gb3JtYXR0ZXIpe1xyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc3RyaW5nO1xyXG4gICAgfVxyXG4gICAgY2xvbmUoKXtyZXR1cm4gbmV3IFRva2VuKHRoaXMudmFsdWUpfVxyXG59XHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbnN7XHJcbiAgICB0b2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPj1bXTtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IodG9rZW5zPzogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+KXtcclxuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnN8fFtdO1xyXG4gICAgfVxyXG4gICAgYWRkSW5wdXQobWF0aDogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUobWF0aDogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcygpKVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKHJlZ0V4cCgnXicgKyBvcGVyYXRvcnMpKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGU9L1tcXChcXCldLy50ZXN0KG1hdGNoWzBdKT8ncGFyZW4nOidvcGVyYXRvcidcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3ICBCYXNpY01hdGhKYXhUb2tlbih0eXBlLG1hdGNoWzBdKSk7XHJcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKS8pOy8vKFthLXpBLVpdPykvKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpXHJcbiAgICAgICAgICAgIHsgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oJ251bWJlcicscGFyc2VGbG9hdChtYXRjaFswXSkpKTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vQWRkIHBsdXMgdG8gbWFrZSBpdCBtdWx0aXBsZSBMZXR0ZXJzLlxyXG4gICAgICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXShfXFwoW2EtekEtWjAtOV0qXFwpKSovKVxyXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljTWF0aEpheFRva2VuKFwidmFyaWFibGVcIixtYXRjaFswXSkpXHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcclxuICAgICAgICB9XHJcbiAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICAgdGhpcy50b2tlbnM9aWRQYXJlbnRoZXNlcyh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxyXG5cclxuICAgICAgICBwYXJlbk1hcC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYiAtIGEpXHJcbiAgICAgICAgLmZvckVhY2goKHZhbHVlOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHZhbHVlLCAwLCBuZXcgIEJhc2ljTWF0aEpheFRva2VuKCdvcGVyYXRvcicsJyonKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKVxyXG4gICAgfVxyXG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpIHtcclxuICAgICAgICBjb25zdCBpc0FCYXNpY01hdGhKYXhUb2tlbkRvdWJsZVJpZ2h0T3A9KHRva2VuPzogYW55KT0+e1xyXG4gICAgICAgICAgICBpZih0b2tlbiYmdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbil7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXModG9rZW4udmFsdWU/LnRvU3RyaW5nKCkgfHwgJycpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvKipcclxuICAgICAgICAgKiBcclxuICAgICAgICAgKiBAcGFyYW0gaW5kZXggXHJcbiAgICAgICAgICogQHJldHVybnMgYm9vbGFuID0+IFRydWUgaWYgdGhhciBpc24ndCBhIGRvdWJsZVJpZ2h0IG9wZXJhdG9yLlxyXG4gICAgICAgICAqL1xyXG4gICAgICAgIGNvbnN0IHRlc3REb3VibGVSaWdodCA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KXx8ISh0aGlzLnRva2Vuc1tpbmRleF0gaW5zdGFuY2VvZiBQYXJlbikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgaWR4ID0gZmluZFBhcmVuSW5kZXgoaW5kZXgsdGhpcy50b2tlbnMpPy5vcGVuO1xyXG4gICAgICAgICAgICBpZiAoaWR4ID09IG51bGwgfHwgIWlzT3BlblBhcmVuKHRoaXMudG9rZW5zW2luZGV4ICsgMV0pKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbaWR4IC0gMV07XHJcbiAgICAgICAgICAgIHJldHVybiAhaXNBQmFzaWNNYXRoSmF4VG9rZW5Eb3VibGVSaWdodE9wKHByZXZUb2tlbilcclxuICAgICAgICB9O1xyXG5cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy50b2tlbnNbaW5kZXhdO1xyXG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJiB0b2tlbi5pc1ZhbHVlVG9rZW4oKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb249KHRva2VuOiBhbnkpPT57XHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0eXBlb2YgdG9rZW4udmFsdWU9PT0nc3RyaW5nJyYmaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSlcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGlzVmFyPSh0b2tlbjogYW55KT0+e3JldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmdG9rZW4udHlwZT09PSd2YXJpYWJsZSd9XHJcblxyXG4gICAgICAgIGNvbnN0IHByZWNlZGVzVmFyaWFibGUgPSAodG9rZW5zOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gaW5kZXg+MCYmaXNWYXIodG9rZW5zW2luZGV4XSlcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGZvbGxvd3NWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBpbmRleDx0b2tlbnMubGVuZ3RoLTEmJmlzVmFyKHRva2Vuc1tpbmRleF0pXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChpc09wZW5QYXJlbih0b2tlbil8fCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4pfHxwcmVjZWRlc1ZhcmlhYmxlKHRoaXMudG9rZW5zLGluZGV4KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCAtIDEpID8gaW5kZXggOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpc0Nsb3NlZFBhcmVuKHRva2VuKXx8Zm9sbG93c1ZhcmlhYmxlKHRoaXMudG9rZW5zLGluZGV4KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8IHRlc3REb3VibGVSaWdodChpbmRleCkgPyBpbmRleCArIDEgOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0gIT09IG51bGwpO1xyXG4gICAgICAgIHJldHVybiBtYXA7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB2YWxpZGF0ZVBsdXNNaW51cygpe1xyXG4gICAgICAgIC8vIFBsdXNlcyBhcmUgc2VwYXJhdG9ycy5UaGVyZWZvcmUsIHRoZXkgZG8gbm90IG5lZWQgdG8gYmUgaGVyZSBBcyB0aGUgZXhwcmVzc2lvbiBpcyB0b2tlbltdXHJcbiAgICAgICAgLy9NaW51c2VzIG9uIHRoZSBvdGhlciBoYW5kLmNhbiBlaXRoZXIgYmUgYSBzZXBhcmF0b3IuIE9yIGEgbmVnYXRpdmUgc2lnblxyXG4gICAgICAgIGNvbnN0IHBsdXNNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW4sIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSAnQWRkaXRpb24nP2luZGV4IDogbnVsbCkuZmlsdGVyKChpbmRleDogbnVtYmVyIHwgbnVsbCkgPT4gaW5kZXggIT09IG51bGwpXHJcbiAgICAgICAgcGx1c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBtaW51c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdTdWJ0cmFjdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcclxuICAgICAgICBcclxuICAgICAgICBtaW51c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleCArIDFdO1xyXG4gICAgICAgICAgICBpZiAobmV4dFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdHlwZW9mIG5leHRUb2tlbi52YWx1ZSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgICBuZXh0VG9rZW4udmFsdWUgKj0gLTE7XHJcbiAgICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICB2YWxpZGF0ZUluZGV4KGluZGV4OiBudW1iZXIsbWFyZ2luPzogbnVtYmVyKXtcclxuICAgICAgICBtYXJnaW49bWFyZ2lufHwwO1xyXG4gICAgICAgIHJldHVybiBpbmRleD49MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC1tYXJnaW47XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBCYXNpY01hdGhKYXhUb2tlbnMge1xyXG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW5zKHRoaXMudG9rZW5zLm1hcCh0b2tlbiA9PiB0b2tlbi5jbG9uZSgpKSk7XHJcbiAgICB9XHJcbiAgICAvKlxyXG4gICAgXHJcbiAgICBcclxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuOiBhbnksIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSBcIihcIiA/IGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgpIDogbnVsbClcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgfVxyXG5cclxuICAgIGZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwUGFyZW5JbmRleGVzKClcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XHJcbiAgICAgICAgICAgICAgICBpZiAob3BlbkluZGV4ID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICgvKG9wZXJhdG9yfHBhcmVuKS8udGVzdCh0aGlzLnRva2Vuc1tvcGVuSW5kZXggLSAxXT8udHlwZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmIChjbG9zZUluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0/LmlzVmFsdWVUb2tlbigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfSkuZmxhdE1hcCgoaXRlbTogYW55KSA9PiBbaXRlbS5vcGVuLCBpdGVtLmNsb3NlXSk7XHJcbiAgICB9ICAgIFxyXG4gICAgXHJcbiAgICBcclxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICAgfVxyXG4gICAgXHJcbiAgICBjb25uZWN0TmVhcmJ5VG9rZW5zKCl7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIFRva2VuKSl7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJmdHlndWJobmltcG9cIilcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1hcCA9IG5ldyBTZXQodGhpcy5maWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFsKCkpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfOiBhbnksIGlkeDogdW5rbm93bikgPT4gIW1hcC5oYXMoaWR4KSk7XHJcbiAgICAgICAgLy9Qcm9ibGVtIHdpdGggID0gYXMgaXQncyBhZmZlY3RpbmcgdGhlIHZhcmlhYmxlIGJlZm9yZSBpdFxyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4IC0gMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKCkgJiZcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4ICsgMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKClcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgYXJyID0gW1xyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobnVtTWFwKSwgXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyh2YXJNYXApLCBcclxuICAgICAgICBdO1xyXG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXHJcbiAgICB9XHJcblxyXG4gICAgXHJcblxyXG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxyXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW4udHlwZSkpIFxyXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtyZXR1cm4gSW5maW5pdHl9XHJcbiAgICB9XHJcblxyXG4gICAgaW5zZXJ0VG9rZW5zKHN0YXJ0OiBhbnksIGxlbmd0aDogbnVtYmVyLCBvYmplY3RzOiBhbnlbXSB8IFRva2VuKSB7XHJcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XHJcbiAgICB9XHJcblxyXG4gICAgXHJcblxyXG4gICAgaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnM6IGFueVtdKXtcclxuICAgICAgICByZXR1cm4gdG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT5pbmRleD4wXHJcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXHJcbiAgICAgICAgICAgICYmdG9rZW4/LmlzVmFsdWVUb2tlbigpJiZ0b2tlbi52YWx1ZT49MD9pbmRleDpudWxsXHJcbiAgICAgICAgKS5maWx0ZXIoaXRlbT0+aXRlbSE9PW51bGwpXHJcbiAgICB9XHJcblxyXG4gICAgdG9rZW5Db21wYXJlKGNvbXBhcmU6IHN0cmluZyB8IG51bWJlciwgdmFsdWU6IHN0cmluZ3xSZWdFeHAsIHRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0sIG5leHRUb2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9KSB7XHJcbiAgICAgICAgY29uc3QgcmVnRXhwdmFsdWUgPSAodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcclxuICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgcmVnRXhwdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXHJcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICAqL1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW57XHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICB2YWx1ZT86IHN0cmluZ3xudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IodHlwZTpzdHJpbmcgLHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQpe1xyXG4gICAgICAgIHRoaXMudHlwZT10eXBlO1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICAgICAgdGhpcy5pbnN1clByb3BlckZvcm1hdHRpbmcoKVxyXG4gICAgfVxyXG4gICAgaW5zdXJQcm9wZXJGb3JtYXR0aW5nKCl7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzVmFsdWVUb2tlbigpJiZ0eXBlb2YgdGhpcy52YWx1ZT09PVwic3RyaW5nXCIpe1xyXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXNlYXJjaEFsbE1hdGhKYXhPcGVyYXRvcnNBbmRTeW1ib2xzKHRoaXMudmFsdWUpPy5uYW1lXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldExhdGV4U3ltYm9sKCl7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZyc/c2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubGF0ZXg6dW5kZWZpbmVkfVxyXG5cclxuICAgIGdldGZ1bGxUeXBlKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudHlwZVxyXG4gICAgfVxyXG4gICAgY2xvbmUoKXtcclxuICAgICAgICByZXR1cm4gbmV3IEJhc2ljTWF0aEpheFRva2VuKHRoaXMudHlwZSwgdGhpcy52YWx1ZSlcclxuICAgIH1cclxuXHJcblxyXG4gICAgaXNTdHJpbmcoKXtyZXR1cm4gdGhpcy50eXBlPT09J3BhcmVuJ3x8dGhpcy50eXBlPT09J29wZXJhdG9yJ31cclxuXHJcbiAgICBpc1ZhbHVlVG9rZW4oKXtyZXR1cm4gdGhpcy50eXBlPT09J3ZhcmlhYmxlJ3x8dGhpcy50eXBlPT09J251bWJlcid9XHJcblxyXG4gICAgdG9TdHJpbmdMYXRleCgpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9JydcclxuICAgICAgICBpZiAodGhpcy5pc1N0cmluZygpKVxyXG4gICAgICAgICAgICBzdHJpbmcrPXRoaXMuZ2V0TGF0ZXhTeW1ib2woKVxyXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nbnVtYmVyJykgc3RyaW5nKz10aGlzLnZhbHVlO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmdcclxuICAgIH1cclxuICAgIGFmZmVjdGVkT3BlcmF0b3JSYW5nZShkaXJlY3Rpb246IHN0cmluZyl7XHJcbiAgICAgICAgaWYodGhpcy50eXBlIT09J29wZXJhdG9yJ3x8dGhpcy52YWx1ZT09PSdFcXVhbHMnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICBpZih0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnJiZkaXJlY3Rpb249PT0nbGVmdCcmJiFpc09wZXJhdG9yV2l0aEFzc29jaWF0aXZpdHkodGhpcy52YWx1ZSwgWy0xLCAxXSx0cnVlKSlcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxufSJdfQ==