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
            if (!this.validateIndex(index) || !(this.tokens[index] instanceof Paren))
                return false;
            const idx = findParenIndex(index, this.tokens)?.open;
            if (idx == null || parenState(this.tokens[index + 1]))
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
            return token instanceof BasicMathJaxToken && typeof token.getValue() === 'string' && hasImplicitMultiplication(token.getStringValue());
        };
        const isVar = (token) => { return token instanceof BasicMathJaxToken && token.getType() === 'variable'; };
        const precedesVariable = (tokens, index) => {
            return index > 0 && isVar(tokens[index]);
        };
        const followsVariable = (tokens, index) => {
            return index < tokens.length - 1 && isVar(tokens[index]);
        };
        const map = this.tokens
            .map((token, index) => {
            if (index > 0 && (parenState(token, true) || checkImplicitMultiplication(token) || precedesVariable(this.tokens, index))) {
                return check(index - 1) ? index : null;
            }
            else if (index < this.tokens.length - 1 && (parenState(token) || followsVariable(this.tokens, index))) {
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
        const plusMap = this.tokens.map((token, index) => token instanceof BasicMathJaxToken && token.getValue() === 'Addition' ? index : null).filter((index) => index !== null);
        plusMap.reverse().forEach((index) => {
            this.tokens.splice(index, 1);
        });
        const minusMap = this.tokens.map((token, index) => token instanceof BasicMathJaxToken && token.getValue() === 'Subtraction' ? index : null).filter((index) => index !== null);
        minusMap.reverse().forEach((index) => {
            const nextToken = this.tokens[index + 1];
            if (nextToken instanceof BasicMathJaxToken && typeof nextToken.getValue() === 'number') {
                nextToken.setValue(nextToken.getNumberValue() * -1);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBQyxhQUFhLEVBQUUsVUFBVSxHQUFJLE1BQU0sd0JBQXdCLENBQUM7QUFDM0YsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBb0Usc0JBQXNCLEVBQWlCLE1BQU0sMkJBQTJCLENBQUM7QUFFN1IsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUc3QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUVuRCxTQUFTLFNBQVMsQ0FBQyxLQUFhLEVBQUUsSUFBaUI7SUFDL0MsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNYLEtBQUssV0FBVyxDQUFDLFdBQVc7WUFDeEIsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO1FBQ3hCLEtBQUssV0FBVyxDQUFDLFdBQVc7WUFDeEIsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO1FBQ3hCO1lBQ0ksT0FBTyxLQUFLLENBQUM7SUFDckIsQ0FBQztBQUNMLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQzlCLFNBQWMsRUFDZCxTQUFpQyxFQUNqQyxPQUE0QixFQUFFO0lBRTlCLDREQUE0RDtJQUM1RCxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxtRUFBbUU7SUFD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QyxDQUFBO2dCQUNuRCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDakMsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ1QsQ0FBQztJQUNELGFBQWEsQ0FBQyxLQUFhLEVBQUMsTUFBZTtRQUN2QyxNQUFNLEdBQUMsTUFBTSxJQUFFLENBQUMsQ0FBQztRQUNqQixPQUFPLEtBQUssSUFBRSxDQUFDLEdBQUMsTUFBTSxJQUFFLEtBQUssR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDNUQsQ0FBQztJQUNELEtBQUs7UUFDRCxPQUFPLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzNFLENBQUM7Q0FxR0oiLCJzb3VyY2VzQ29udGVudCI6WyJcclxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlcywgY2FsY3VsYXRlRmFjdG9yaWFsfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4vaW1WZXJ5TGF6eVwiO1xyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCByZWdFeHAgfSBmcm9tIFwiLi4vdGlrempheC90aWt6amF4XCI7XHJcbmltcG9ydCB7IEJyYWNrZXRUeXBlIH0gZnJvbSBcIi4uL3N0YXRpY0RhdGEvZW5jYXNpbmdzXCI7XHJcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzLCBwYXJlblN0YXRlLCAgfSBmcm9tIFwiLi4vdXRpbHMvUGFyZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIGlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSwgc2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHMsIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi4vc3RhdGljRGF0YS9kYXRhTWFuYWdlclwiO1xyXG5cclxuaW1wb3J0IHsgcGFyc2VPcGVyYXRvciB9IGZyb20gXCIuL21hdGhFbmdpbmVcIjtcclxuaW1wb3J0IHsgaXQgfSBmcm9tIFwibm9kZTp0ZXN0XCI7XHJcbmltcG9ydCB7IHNpZ25hbCB9IGZyb20gXCJjb2RlbWlycm9yXCI7XHJcbmltcG9ydCB7IEJhc2ljTWF0aEpheFRva2VuIH0gZnJvbSBcInNyYy9iYXNpY1Rva2VuXCI7XHJcblxyXG5mdW5jdGlvbiB3cmFwR3JvdXAoZ3JvdXA6IHN0cmluZywgd3JhcDogQnJhY2tldFR5cGUpOiBzdHJpbmcge1xyXG4gICAgc3dpdGNoICh3cmFwKSB7XHJcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5QYXJlbnRoZXNlczpcclxuICAgICAgICAgICAgcmV0dXJuIGAoJHtncm91cH0pYDtcclxuICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLkN1cmx5QnJhY2VzOlxyXG4gICAgICAgICAgICByZXR1cm4gYHske2dyb3VwfX1gO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHJldHVybiBncm91cDtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRlZXBTZWFyY2hXaXRoUGF0aChcclxuICAgIHN0cnVjdHVyZTogYW55LFxyXG4gICAgcHJlZGljYXRlOiAoaXRlbTogYW55KSA9PiBib29sZWFuLFxyXG4gICAgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdXHJcbik6IHsgaXRlbTogYW55OyBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdIH0gfCBudWxsIHtcclxuICAgIC8vIEJhc2UgY2FzZTogSWYgdGhlIGN1cnJlbnQgc3RydWN0dXJlIG1hdGNoZXMgdGhlIHByZWRpY2F0ZVxyXG4gICAgaWYgKHByZWRpY2F0ZShzdHJ1Y3R1cmUpKSB7XHJcbiAgICAgICAgcmV0dXJuIHsgaXRlbTogc3RydWN0dXJlLCBwYXRoIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgaXQncyBhbiBhcnJheSwgcmVjdXJzaXZlbHkgc2VhcmNoIGVhY2ggZWxlbWVudCB3aXRoIGl0cyBpbmRleFxyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoc3RydWN0dXJlKSkge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RydWN0dXJlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVbaV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGldKTtcclxuICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgaXQncyBhbiBvYmplY3QsIHJlY3Vyc2l2ZWx5IHNlYXJjaCBpdHMgcHJvcGVydGllcyB3aXRoIHRoZWlyIGtleXNcclxuICAgIGlmIChzdHJ1Y3R1cmUgIT09IG51bGwgJiYgdHlwZW9mIHN0cnVjdHVyZSA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHN0cnVjdHVyZSkge1xyXG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0cnVjdHVyZSwga2V5KSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtrZXldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBrZXldKTtcclxuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgbm8gbWF0Y2ggaXMgZm91bmRcclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcbnR5cGUgZm9ybWF0dGFibGVGb3JNYXRoR3JvdXA9TWF0aEdyb3VwSXRlbXxNYXRoR3JvdXB8QmFzaWNNYXRoSmF4VG9rZW5cclxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtczogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSk6IE1hdGhHcm91cEl0ZW1bXSB7XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XHJcbiAgICAgICAgaXRlbXMgPSBbaXRlbXNdO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGZvcm1hdHRlZEl0ZW1zID0gaXRlbXNcclxuICAgICAgICAucmVkdWNlKChhY2M6IE1hdGhHcm91cEl0ZW1bXSwgaXRlbTogVG9rZW4gfCBNYXRoR3JvdXAgfCBNYXRoSmF4T3BlcmF0b3IgfCBCYXNpY01hdGhKYXhUb2tlbikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYy5jb25jYXQoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW0uZ2V0SXRlbXMoKSkpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpIHtcclxuICAgICAgICAgICAgICAgIGFjYy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbikge1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uZ2V0VmFsdWUoKSAmJiAoaXRlbS5nZXRUeXBlKCkgPT09IFwibnVtYmVyXCIgfHwgaXRlbS5nZXRUeXBlKCkgPT09IFwidmFyaWFibGVcIikpIHtcclxuICAgICAgICAgICAgICAgICAgICBhY2MucHVzaChuZXcgVG9rZW4oaXRlbS5nZXRWYWx1ZSgpKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgICAgICAgICBgRXhwZWN0ZWQgaXRlbSB0byBiZSBhIG51bWJlciBvciB2YXJpYWJsZSBidXQgcmVjZWl2ZWQ6ICR7aXRlbS5nZXRWYWx1ZSgpfWBcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICB9LCBbXSlcclxuXHJcbiAgICByZXR1cm4gZm9ybWF0dGVkSXRlbXM7XHJcbn1cclxuZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhPcGVyYXRvcihncm91cHM6IChNYXRoR3JvdXBJdGVtfE1hdGhHcm91cClbXSk6TWF0aEdyb3VwW117XHJcbiAgICBjb25zdCBmb3JtYXR0ZWRHcm91cHMgPSBncm91cHNcclxuICAgICAgICAucmVkdWNlKChhY2M6IE1hdGhHcm91cFtdLCBpdGVtOiBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciApID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcclxuICAgICAgICAgICAgICAgIGFjYy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xyXG4gICAgICAgICAgICAgICAgYWNjLnB1c2gobmV3IE1hdGhHcm91cChpdGVtKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICB9LCBbXSlcclxuXHJcbiAgICByZXR1cm4gZm9ybWF0dGVkR3JvdXBzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG91bGRBZGRQbHVzKGdyb3VwMT86IGFueSxncm91cDI/OiBhbnksZGlzdGFuY2VGcm9tT3BlcmF0b3I/OiBudW1iZXIpe1xyXG4gICAgaWYoIWdyb3VwMXx8IWdyb3VwMnx8IWRpc3RhbmNlRnJvbU9wZXJhdG9yfHxkaXN0YW5jZUZyb21PcGVyYXRvcj09PS0xfHxkaXN0YW5jZUZyb21PcGVyYXRvcj09PTEpcmV0dXJuICcnO1xyXG5cclxuICAgIHJldHVybiAnKyc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbkNvbWJpbmUobWF0aDogTWF0aEdyb3VwLG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xyXG5cclxufVxyXG5leHBvcnQgY2xhc3MgTWF0aEpheE9wZXJhdG9yIHtcclxuICAgIG9wZXJhdG9yOiBzdHJpbmc7XHJcbiAgICBncm91cE51bTogbnVtYmVyID0gMTtcclxuICAgIGdyb3VwczogTWF0aEdyb3VwW107XHJcbiAgICBzb2x1dGlvbjogTWF0aEdyb3VwO1xyXG4gICAgY29tbXV0YXRpdmU6IGJvb2xlYW47XHJcbiAgICBpc09wZXJhYmxlOiBib29sZWFuID0gdHJ1ZTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihvcGVyYXRvcj86IHN0cmluZywgZ3JvdXBOdW0/OiBudW1iZXIsIGdyb3Vwcz86IE1hdGhHcm91cFtdLCBzb2x1dGlvbj86IE1hdGhHcm91cCwgaXNPcGVyYWJsZT86IGJvb2xlYW4pIHtcclxuICAgICAgICBpZiAob3BlcmF0b3IpIHRoaXMub3BlcmF0b3IgPSBvcGVyYXRvcjtcclxuICAgICAgICBpZiAoZ3JvdXBOdW0pIHRoaXMuZ3JvdXBOdW0gPSBncm91cE51bTtcclxuICAgICAgICBpZiAoZ3JvdXBzKSB0aGlzLmdyb3VwcyA9IGdyb3VwcztcclxuICAgICAgICBpZiAoc29sdXRpb24pIHRoaXMuc29sdXRpb24gPSBzb2x1dGlvbjtcclxuICAgICAgICBpZiAoaXNPcGVyYWJsZSAhPT0gdW5kZWZpbmVkKSB0aGlzLmlzT3BlcmFibGUgPSBpc09wZXJhYmxlO1xyXG4gICAgfVxyXG4gICAgc3RhdGljIGNyZWF0ZShvcGVyYXRvcj86IHN0cmluZywgZ3JvdXBOdW0/OiBudW1iZXIsIGdyb3Vwcz86IE1hdGhHcm91cFtdLCBzb2x1dGlvbj86IE1hdGhHcm91cCwgaXNPcGVyYWJsZT86IGJvb2xlYW4pOiBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgICAgIGlmIChvcGVyYXRvciA9PT0gXCJNdWx0aXBsaWNhdGlvblwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihncm91cHMsIHNvbHV0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoSmF4T3BlcmF0b3Iob3BlcmF0b3IsIGdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCBpc09wZXJhYmxlKTtcclxuICAgIH1cclxuICAgIHRlc3RHcm91cHModGVzdDogKGdyb3VwOiBNYXRoR3JvdXApID0+IGJvb2xlYW4pOiBib29sZWFuW10ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAodGVzdCk7XHJcbiAgICB9XHJcblxyXG4gICAgbWFwVmFyaWFibGVzKCk6IGJvb2xlYW5bXSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5oYXNWYXJpYWJsZXMoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgb3BlcmF0b3JWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xyXG4gICAgICAgIHJldHVybiBbLi4ubmV3IFNldCh0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuZ3JvdXBWYXJpYWJsZXMoKSkuZmxhdCgpKV07XHJcbiAgICB9XHJcblxyXG4gICAgY2xvbmUoKTogTWF0aEpheE9wZXJhdG9yIHtcclxuICAgICAgICBjb25zdCBncm91cHMgPSB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuY2xvbmUoKSk7XHJcbiAgICAgICAgY29uc3Qgc29sdXRpb24gPSB0aGlzLnNvbHV0aW9uID8gdGhpcy5zb2x1dGlvbi5jbG9uZSgpIDogdW5kZWZpbmVkO1xyXG4gICAgICAgIHJldHVybiBNYXRoSmF4T3BlcmF0b3IuY3JlYXRlKHRoaXMub3BlcmF0b3IsIHRoaXMuZ3JvdXBOdW0sIGdyb3Vwcywgc29sdXRpb24sIHRoaXMuaXNPcGVyYWJsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmdTb2x1dGlvbigpOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nKCkgKyAnID0gJyArIHRoaXMuc29sdXRpb24/LnRvU3RyaW5nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciAmJlxyXG4gICAgICAgICAgICB0aGlzLm9wZXJhdG9yID09PSBpdGVtLm9wZXJhdG9yICYmXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLmxlbmd0aCA9PT0gaXRlbS5ncm91cHMubGVuZ3RoICYmXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLmV2ZXJ5KCh0LCBpbmRleCkgPT4gdC5lcXVhbHMoaXRlbS5ncm91cHNbaW5kZXhdKSk7XHJcbiAgICB9XHJcbiAgICBnZXRPY2N1cnJlbmNlR3JvdXAoKTogeyBvY2N1cnJlbmNlc0NvdW50OiBudW1iZXI7IG9jY3VycmVuY09mOiBNYXRoR3JvdXBbXSB9fG51bGwgIHsgcmV0dXJuIG51bGw7IH0gIFxyXG4gICAgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0SXRlbTogTWF0aEpheE9wZXJhdG9yIHwgVG9rZW4pOiBib29sZWFuIHtyZXR1cm4gZmFsc2U7fVxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLm9wZXJhdG9yKTtcclxuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gJyc7XHJcbiAgICAgICAgaWYobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM+Mnx8bWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM8MSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBudW1iZXIgb2YgcG9zaXRpb25zIGZvciBhc3NvY2lhdGl2aXR5OiAke21ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBtZXRhZGF0YS5sYXRleDtcclxuICAgICAgICBsZXQgaW5kZXg9MDtcclxuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XHJcbiAgICAgICAgY29uc3QgZ3JvdXBCcmFja2V0VHlwZT0ocG9zOiB7IGJyYWNrZXRUeXBlOiBCcmFja2V0VHlwZTsgaXNCcmFja2V0T3B0aW9uYWw6IGJvb2xlYW4gfSxncm91cDogTWF0aEdyb3VwKT0+e1xyXG4gICAgICAgICAgICBpZighcG9zLmlzQnJhY2tldE9wdGlvbmFsKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHBvcy5icmFja2V0VHlwZVxyXG4gICAgICAgICAgICByZXR1cm4gZ3JvdXAuc2luZ3VsYXIoKT9CcmFja2V0VHlwZS5Ob25lOnBvcy5icmFja2V0VHlwZVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsdHJ1ZSkuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XHJcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4LTFdLHRoaXMuZ3JvdXBzW2luZGV4XSxpbmRleCk7XHJcbiAgICAgICAgICAgIHN0cmluZyArPSB3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLnRvU3RyaW5nKCksZ3JvdXBCcmFja2V0VHlwZShpdGVtLHRoaXMuZ3JvdXBzW2luZGV4XSkpO1xyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBzdHJpbmcgKz0gb3BlcmF0b3I7XHJcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsZmFsc2UpLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleF0sdGhpcy5ncm91cHNbaW5kZXgrMV0saW5kZXgpXHJcbiAgICAgICAgICAgIHN0cmluZyArPSB3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLnRvU3RyaW5nKCksZ3JvdXBCcmFja2V0VHlwZShpdGVtLHRoaXMuZ3JvdXBzW2luZGV4XSkpO1xyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICByZXR1cm4gc3RyaW5nLnRyaW0oKTtcclxuICAgIH1cclxuICAgIHBhcnNlTWF0aGpheE9wZXJhdG9yKCkge1xyXG4gICAgICAgIHBhcnNlT3BlcmF0b3IodGhpcyk7XHJcbiAgICB9XHJcbn1cclxuZXhwb3J0IGNsYXNzIEVxdWFsc09wZXJhdG9yIGV4dGVuZHMgTWF0aEpheE9wZXJhdG9ye1xyXG5cclxufVxyXG5leHBvcnQgY2xhc3MgRGl2aXNpb25PcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvcntcclxuXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yIGV4dGVuZHMgTWF0aEpheE9wZXJhdG9yIHtcclxuICAgIGNvbnN0cnVjdG9yKGdyb3Vwcz86IE1hdGhHcm91cFtdLCBzb2x1dGlvbj86IE1hdGhHcm91cCkge1xyXG4gICAgICAgIHN1cGVyKFwiTXVsdGlwbGljYXRpb25cIiwgMiwgZ3JvdXBzLCBzb2x1dGlvbiwgdHJ1ZSk7XHJcbiAgICAgICAgdGhpcy5jb21tdXRhdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5yZW1vdmVNdWx0aXBsaWNhdGlvbkRlcHRocygpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCl7XHJcbiAgICAgICAgd2hpbGUodGhpcy5ncm91cHMuc29tZSgoZzogTWF0aEdyb3VwKT0+IGcuc2luZ3VsYXIoKSYmZy5nZXRJdGVtcygpWzBdIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcikpe1xyXG4gICAgICAgICAgICBjb25zdCBncm91cD10aGlzLmdyb3Vwcy5maW5kKChnOiBNYXRoR3JvdXApPT4gZy5zaW5ndWxhcigpJiZnLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKVxyXG4gICAgICAgICAgICBpZihncm91cClcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMuc3BsaWNlKHRoaXMuZ3JvdXBzLmluZGV4T2YoZ3JvdXApLDEsLi4uKGdyb3VwLmdldEl0ZW1zKClbMF0gYXMgTXVsdGlwbGljYXRpb25PcGVyYXRvcikuZ3JvdXBzKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgYXNPY2N1cnJlbmNlR3JvdXAob2NjdXJyZW5jZXNDb3VudDogbnVtYmVyLG9jY3VycmVuY09mOiBzdHJpbmd8VG9rZW58TWF0aEdyb3VwKTogTXVsdGlwbGljYXRpb25PcGVyYXRvciB7XHJcbiAgICAgICAgb2NjdXJyZW5jT2Y9dHlwZW9mIG9jY3VycmVuY09mPT09XCJzdHJpbmdcIj9cclxuICAgICAgICAgICAgbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKG9jY3VycmVuY09mKV0pOm9jY3VycmVuY09mIGluc3RhbmNlb2YgVG9rZW4/XHJcbiAgICAgICAgICAgICAgICBuZXcgTWF0aEdyb3VwKFtvY2N1cnJlbmNPZl0pOm9jY3VycmVuY09mO1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoW25ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNlc0NvdW50KV0pLG9jY3VycmVuY09mXSlcclxuICAgIH1cclxuICAgIFxyXG4gICAgb3ZlcnJpZGUgZ2V0T2NjdXJyZW5jZUdyb3VwKCk6IHsgb2NjdXJyZW5jZXNDb3VudDogbnVtYmVyOyBvY2N1cnJlbmNPZjogTWF0aEdyb3VwW10gfSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5ncm91cHMucmVkdWNlKFxyXG4gICAgICAgICAgICAoYWNjOiB7IHRvdGFsTnVtOiBudW1iZXI7IGFycjogTWF0aEdyb3VwW10gfSwgaXRlbTogTWF0aEdyb3VwKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5nZXRPcGVyYWJsZVZhbHVlKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBhY2MudG90YWxOdW0gKz0gaXRlbS5nZXRPcGVyYWJsZVZhbHVlKCkhO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBhY2MuYXJyLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7IHRvdGFsTnVtOiAwLCBhcnI6IFtdIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiB7IG9jY3VycmVuY2VzQ291bnQ6IHJlc3VsdC50b3RhbE51bSwgb2NjdXJyZW5jT2Y6IHJlc3VsdC5hcnIgfTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRUb09jY3VycmVuY2VHcm91cCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbnVtYmVyR3JvdXAgPSB0aGlzLmdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLnNpbmdsZU51bWJlcigpKTtcclxuICAgICAgICBpZiAobnVtYmVyR3JvdXApIHtcclxuICAgICAgICAgICAgbnVtYmVyR3JvdXAuc2luZ2xlVG9rZW5TZXQodmFsdWUsIHRydWUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnB1c2gobmV3IE1hdGhHcm91cChbbmV3IFRva2VuKDEgKyB2YWx1ZSldKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG92ZXJyaWRlIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgaXNWYWxpZEl0ZW0gPSB0ZXN0SXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IHRlc3RJdGVtIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcjtcclxuICAgICAgICBpZiAoIWlzVmFsaWRJdGVtKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50R3JvdXAgPSB0aGlzLmdldE9jY3VycmVuY2VHcm91cCgpO1xyXG4gICAgICAgIGlmICghY3VycmVudEdyb3VwKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50R3JvdXBJdGVtcyA9IGN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5mbGF0TWFwKGdyb3VwID0+IGdyb3VwLmdldEl0ZW1zKCkpO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKHRlc3RJdGVtIGluc3RhbmNlb2YgVG9rZW4pIHtcclxuICAgICAgICAgICAgY29uc3QgaXNTaW5nbGVJdGVtTWF0Y2ggPSBjdXJyZW50R3JvdXBJdGVtcy5sZW5ndGggPT09IDEgJiYgY3VycmVudEdyb3VwSXRlbXNbMF0uZXF1YWxzKHRlc3RJdGVtKTtcclxuICAgICAgICAgICAgaWYgKGlzU2luZ2xlSXRlbU1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFRvT2NjdXJyZW5jZUdyb3VwKDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBpc1NpbmdsZUl0ZW1NYXRjaDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHRlc3RJdGVtR3JvdXAgPSB0ZXN0SXRlbS5nZXRPY2N1cnJlbmNlR3JvdXAoKTtcclxuICAgICAgICBpZiAoIXRlc3RJdGVtR3JvdXApIHJldHVybiBmYWxzZTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCB0ZXN0SXRlbUdyb3VwSXRlbXMgPSB0ZXN0SXRlbUdyb3VwLm9jY3VycmVuY09mO1xyXG4gICAgICAgIGNvbnN0IGFyZUdyb3Vwc01hdGNoaW5nID1jdXJyZW50R3JvdXAub2NjdXJyZW5jT2YubGVuZ3RoID09PSB0ZXN0SXRlbUdyb3VwSXRlbXMubGVuZ3RoICYmXHJcbiAgICAgICAgICAgIGN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5ldmVyeSgoY3VycmVudFN1Ykdyb3VwOiBNYXRoR3JvdXApID0+XHJcbiAgICAgICAgICAgICAgICB0ZXN0SXRlbUdyb3VwSXRlbXMuc29tZSgodGVzdFN1Ykdyb3VwOiBNYXRoR3JvdXApID0+IFxyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRTdWJHcm91cC5pc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RTdWJHcm91cClcclxuICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgaWYgKGFyZUdyb3Vwc01hdGNoaW5nKSB7IFxyXG4gICAgICAgICAgICB0aGlzLmFkZFRvT2NjdXJyZW5jZUdyb3VwKHRlc3RJdGVtR3JvdXAub2NjdXJyZW5jZXNDb3VudCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXsgXHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSAnXFxcXGNkb3QgJztcclxuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XHJcbiAgICAgICAgY29uc3QgdG9BZGRDZG90PSh0aGlzR3JvdXA6IE1hdGhHcm91cCxuZXh0R3JvdXA/Ok1hdGhHcm91cCk9PntcclxuICAgICAgICAgICAgaWYoIW5leHRHcm91cClyZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGlmKG5leHRHcm91cC5pc1NpbmdsZVZhcigpfHx0aGlzR3JvdXAuaXNTaW5nbGVWYXIoKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCByZW9yZGVyZWRHcm91cHM9dGhpcy5ncm91cHMuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoYS5zaW5nbGVOdW1iZXIoKSAmJiAhYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAoIWEuc2luZ2xlTnVtYmVyKCkgJiYgYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhLnNpbmd1bGFyKCkgJiYgIWIuc2luZ3VsYXIoKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAoIWEuc2luZ3VsYXIoKSAmJiBiLnNpbmd1bGFyKCkpIHJldHVybiAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZW9yZGVyZWRHcm91cHMuZm9yRWFjaCgoZ3JvdXAsaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cChncm91cC50b1N0cmluZygpLCBncm91cC5zaW5ndWxhcigpP0JyYWNrZXRUeXBlLk5vbmU6QnJhY2tldFR5cGUuUGFyZW50aGVzZXMpO1xyXG4gICAgICAgICAgICBpZiAodG9BZGRDZG90KGdyb3VwLHJlb3JkZXJlZEdyb3Vwc1tpbmRleCsxXSkpXHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gb3BlcmF0b3I7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qXHJcbiAgICB0aGlzLmdyb3VwcyA9IFtbMSwgMiwgM10sWzQsIDUsIDZdLFs3LCA4LCA5XV1cclxuICAgIEV4cGVjdGVkIE91dHB1dDpcclxuICAgIFtcclxuICAgICAgICAxKjQsIDEqNSwgMSo2LCAxKjcsIDEqOCwgMSo5LFxyXG4gICAgICAgIDIqNCwgMio1LCAyKjYsIDIqNywgMio4LCAyKjksXHJcbiAgICAgICAgMyo0LCAzKjUsIDMqNiwgMyo3LCAzKjgsIDMqOSxcclxuICAgICAgICA0KjcsIDQqOCwgNCo5LFxyXG4gICAgICAgIDUqNywgNSo4LCA1KjksXHJcbiAgICAgICAgNio3LCA2KjgsIDYqOVxyXG4gICAgXSAgXHJcbiAgICAqL1xyXG4gICAgcGFyc2VNYXRoamF4T3BlcmF0b3IoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbXVsdEFycj10aGlzLmVsaW1pbmF0R3JvdXBzV2l0aE11bHRpcGxlVGVybXMoKS5nZXRJdGVtcygpO1xyXG4gICAgICAgIGNvbnN0IG5hbWU9bXVsdEFyci5tYXAoKG86IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpPT4ge28ucGFyc2UoKTtyZXR1cm4gby5zb2x1dGlvbn0pXHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKG5hbWUpO1xyXG4gICAgICAgIHRoaXMuc29sdXRpb24uY29tYmluaW5nTGlrZVRlcm1zKCk7XHJcbiAgICB9XHJcbiAgICBlbGltaW5hdEdyb3Vwc1dpdGhNdWx0aXBsZVRlcm1zKCk6TWF0aEdyb3VwIHtcclxuICAgICAgICBsZXQgb3BlcmF0b3JzQWNjdW11bGF0aW9uOiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yW10gPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBzaW5nbGVUZXJtR3JvdXBzID0gdGhpcy5ncm91cHMuZmlsdGVyKGdyb3VwID0+IGdyb3VwLnNpbmd1bGFyKCkpO1xyXG4gICAgICAgIGNvbnN0IG11bHRpVGVybUdyb3VwcyA9IHRoaXMuZ3JvdXBzLmZpbHRlcihncm91cCA9PiAhZ3JvdXAuc2luZ3VsYXIoKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3Qgc2luZ2xlc01hdGhHcm91cCA9IHNpbmdsZVRlcm1Hcm91cHMubGVuZ3RoICE9PSAwIFxyXG4gICAgICAgICAgICA/IFtuZXcgTWF0aEdyb3VwKFtuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihzaW5nbGVUZXJtR3JvdXBzKV0pXSBcclxuICAgICAgICAgICAgOiBbXTtcclxuICAgICAgICBsZXQgZ3JvdXBzID0gWy4uLnNpbmdsZXNNYXRoR3JvdXAsIC4uLm11bHRpVGVybUdyb3Vwc107XHJcbiAgICBcclxuICAgICAgICB3aGlsZSAoZ3JvdXBzLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXBBID0gZ3JvdXBzLnNoaWZ0KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQiA9IGdyb3Vwcy5zaGlmdCgpO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmICghZ3JvdXBBIHx8ICFncm91cEIpIGJyZWFrO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQUl0ZW1zID0gZ3JvdXBBLmdldEl0ZW1zKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQkl0ZW1zID0gZ3JvdXBCLmdldEl0ZW1zKCk7XHJcbiAgICAgICAgICAgIG9wZXJhdG9yc0FjY3VtdWxhdGlvbiA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGEgb2YgZ3JvdXBBSXRlbXMpIHtcclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYiBvZiBncm91cEJJdGVtcykge1xyXG4gICAgICAgICAgICAgICAgICAgIG9wZXJhdG9yc0FjY3VtdWxhdGlvbi5wdXNoKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKFthLmNsb25lKCksIGIuY2xvbmUoKV0pKVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBncm91cHMudW5zaGlmdChuZXcgTWF0aEdyb3VwKG9wZXJhdG9yc0FjY3VtdWxhdGlvbikpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZ3JvdXBzWzBdO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgcGFyc2UoKXtcclxuICAgICAgICBjb25zdCB7IG51bWJlcnMsIG90aGVyIH0gPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoKHJlc3VsdDogeyBudW1iZXJzOiBNYXRoR3JvdXBbXTsgb3RoZXI6IE1hdGhHcm91cFtdIH0sIGl0ZW06IE1hdGhHcm91cCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uc2luZ2xlTnVtYmVyKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQubnVtYmVycy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQub3RoZXIucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHsgbnVtYmVyczogW10sIG90aGVyOiBbXSB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICBsZXQgdmFsdWU9MTtcclxuICAgICAgICBudW1iZXJzLmZvckVhY2goZ3JvdXAgPT4ge1xyXG4gICAgICAgICAgICB2YWx1ZSo9KGdyb3VwLmdldEl0ZW1zKClbMF1hcyBUb2tlbikuZ2V0TnVtYmVyVmFsdWUoKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmKHRoaXMuZ3JvdXBzLmxlbmd0aD09PTApXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlwiKTtcclxuICAgICAgICBpZigobnVtYmVycy5sZW5ndGg+MCYmb3RoZXIubGVuZ3RoPT09MCl8fHZhbHVlPT09MCl7XHJcbiAgICAgICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChuZXcgVG9rZW4odmFsdWUpKTtyZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRlc3Q9KG1haW5Hcm91cDogYW55LCB0ZXN0R3JvdXA6IGFueSk9PntcclxuICAgICAgICAgICAgaWYobWFpbkdyb3VwIGluc3RhbmNlb2YgTWF0aEdyb3VwJiZ0ZXN0R3JvdXAgaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG1haW5Hcm91cC5pc1Bvd0dyb3VwTWF0Y2godGVzdEdyb3VwKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZmlsdGVyZWQ9ZmlsdGVyQnlUZXN0Q29uc3Qob3RoZXIsdGVzdCk7XHJcbiAgICAgICAgY29uc3QgYXJyPVsuLi5maWx0ZXJlZF07XHJcbiAgICAgICAgaWYodmFsdWUhPT0xKVxyXG4gICAgICAgICAgICBhcnIucHVzaChuZXcgVG9rZW4odmFsdWUpKTtcclxuXHJcbiAgICAgICAgaWYoYXJyLmxlbmd0aD4xKXtcclxuICAgICAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKFtuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKGFycikpXSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKGFyclswXSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGEoZ3JvdXBzOiBNYXRoR3JvdXBbXSl7XHJcbiAgICBjb25zdCBhcmVBbGxHcm91cHNTaW5ndWxhcj1ncm91cHMuZXZlcnkoZz0+Zy5zaW5ndWxhcigpKVxyXG4gICAgbGV0IHZhbHVlPTA7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBmaWx0ZXJCeVRlc3RDb25zdChcclxuICAgIGl0ZW1zOiBhbnlbXSxcclxuICAgIHRlc3Q6IChtYWluSXRlbTogYW55LCB0ZXN0SXRlbTogYW55KSA9PiBib29sZWFuXHJcbik6IGFueVtdIHtcclxuICAgIGxldCBpbmRleCA9IDA7XHJcbiAgICB3aGlsZSAoaW5kZXggPCBpdGVtcy5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCBtYWluSXRlbSA9IGl0ZW1zW2luZGV4XTtcclxuICAgICAgICBjb25zdCBvcmlnaW5hbExlbmd0aCA9IGl0ZW1zLmxlbmd0aDtcclxuXHJcbiAgICAgICAgaXRlbXMgPSBpdGVtcy5maWx0ZXIoKG90aGVySXRlbSwgb3RoZXJJbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlOyAvLyBLZWVwIGN1cnJlbnQgaXRlbVxyXG4gICAgICAgICAgICBjb25zdCB0ZW1wPSF0ZXN0KG1haW5JdGVtLCBvdGhlckl0ZW0pO1xyXG4gICAgICAgICAgICByZXR1cm4gdGVtcFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBSZXN0YXJ0IGl0ZXJhdGlvbiBpZiBpdGVtcyB3ZXJlIHJlbW92ZWRcclxuICAgICAgICBpZiAoaXRlbXMubGVuZ3RoIDwgb3JpZ2luYWxMZW5ndGgpIHtcclxuICAgICAgICAgICAgaW5kZXggPSAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGl0ZW1zO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gdHJpZ29ub21ldHJpY0lkZW50aXRpZXMoKXtcclxuXHJcbn1cclxuXHJcbmV4cG9ydCB0eXBlIE1hdGhHcm91cEl0ZW09VG9rZW58TWF0aEpheE9wZXJhdG9yXHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aEdyb3VwIHtcclxuICAgIHByaXZhdGUgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSA9IFtdO1xyXG4gICAgLy9vdmVydmlldzogTWF0aE92ZXJ2aWV3XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKGl0ZW1zPzogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSkge1xyXG4gICAgICAgIGlmKGl0ZW1zKXRoaXMuc2V0SXRlbXMoaXRlbXMpO1xyXG4gICAgfVxyXG4gICAgZ2V0SXRlbXMoKTogTWF0aEdyb3VwSXRlbVtdIHtyZXR1cm4gdGhpcy5pdGVtczt9XHJcbiAgICBzZXRJdGVtKGl0ZW06IE1hdGhHcm91cEl0ZW0saW5kZXg6bnVtYmVyKXtcclxuICAgICAgICB0aGlzLml0ZW1zW2luZGV4XT1pdGVtO1xyXG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKVxyXG4gICAgfVxyXG4gICAgcmVwbGFjZUl0ZW1DZWxsKGl0ZW06IE1hdGhHcm91cEl0ZW18TWF0aEdyb3VwLGluZGV4Om51bWJlcil7XHJcbiAgICAgICAgdGhpcy5pdGVtcy5zcGxpY2UoaW5kZXgsMSwuLi5lbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbSkpXHJcbiAgICB9XHJcbiAgICBzZXRJdGVtcyhpdGVtczogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSkge1xyXG4gICAgICAgIHRoaXMuaXRlbXMgPSBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXMpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKSAgICBcclxuICAgIH1cclxuICAgIGdyb3VwVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcclxuICAgICAgICBjb25zdCB2YXJpYWJsZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtOiBNYXRoR3JvdXBJdGVtKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gJiYgaXRlbS5pc1ZhcigpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBpdGVtLmdldFN0cmluZ1ZhbHVlKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXZhcmlhYmxlcy5jb250YWlucyhrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyaWFibGVzLnB1c2goa2V5KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiB2YXJpYWJsZXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHVwZGF0ZU92ZXJ2aWV3KCl7LypcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3PW5ldyBNYXRoT3ZlcnZpZXcoKVxyXG4gICAgICAgIHRoaXMub3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdzZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKSovXHJcbiAgICB9XHJcbiAgICBzaW5nbGVUb2tlblNldCh2YWx1ZTogbnVtYmVyLHRvQWRkPzogYm9vbGVhbil7XHJcbiAgICAgICAgY29uc3QgdG9rZW49dGhpcy5pdGVtc1swXSBhcyBUb2tlbjtcclxuICAgICAgICBjb25zdCBuZXdWYWx1ZT10b0FkZD92YWx1ZSt0b2tlbi5nZXROdW1iZXJWYWx1ZSgpOnZhbHVlO1xyXG4gICAgICAgIGlmKHRoaXMuc2luZ3VsZVRva2VuKCkpe1xyXG4gICAgICAgICAgICB0b2tlbi5zZXRWYWx1ZShuZXdWYWx1ZSlcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBNYXRoR3JvdXAge1xyXG4gICAgICAgIHJldHVybiBuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXMubWFwKGl0ZW09Pml0ZW0uY2xvbmUoKSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGhhc09wZXJhdG9yKCk6IHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpO31cclxuICAgIGRvZXNudEhhdmVPcGVyYXRvcigpOiAgdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuICF0aGlzLmhhc09wZXJhdG9yKCk7fVxyXG4gICAgc2luZ2xlTnVtYmVyKCl7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSYmdGhpcy5udW1iZXJPbmx5KCl9XHJcbiAgICBudW1iZXJPbmx5KCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLmV2ZXJ5KHQgPT4gKHQgaW5zdGFuY2VvZiBUb2tlbiYmIXQuaXNWYXIoKSkpO31cclxuICAgIGhhc1ZhcmlhYmxlcygpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKHQgPT4gdCBpbnN0YW5jZW9mIFRva2VuJiZ0LmlzVmFyKCkpO31cclxuXHJcbiAgICBzaW5ndWxhcigpOmJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLmxlbmd0aCA9PT0gMSAmJiB0aGlzLml0ZW1zWzBdICE9PSB1bmRlZmluZWQ7fVxyXG4gICAgc2luZ3VsZVRva2VuKCk6IHRoaXMgaXMgeyBpdGVtczogW1Rva2VuXSB9IHtyZXR1cm4gdGhpcy5zaW5ndWxhcigpICYmIHRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbjt9XHJcbiAgICBpc09wZXJhYmxlKCl7cmV0dXJuIHRydWV9XHJcblxyXG4gICAgZ2V0T3BlcmFibGVWYWx1ZSgpOiBudW1iZXIgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgY29uc3QgaXRlbXMgPSB0aGlzLml0ZW1zO1xyXG4gICAgICAgIGlmICh0aGlzLm51bWJlck9ubHkoKSkge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWU9MDtcclxuICAgICAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbTogVG9rZW4pID0+IHtcclxuICAgICAgICAgICAgICAgIHZhbHVlICs9IGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBpc1NpbmdsZVZhcigpe1xyXG4gICAgICAgIGNvbnN0IHRva2VuPXRoaXMuaXRlbXNbMF1hcyBUb2tlblxyXG4gICAgICAgIHJldHVybiB0aGlzLnNpbmd1bGVUb2tlbigpJiZ0b2tlbi5pc1ZhcigpXHJcbiAgICB9XHJcbiAgICBnZXRTaW5nbGVWYXIoKXtcclxuICAgICAgICBpZighdGhpcy5pc1NpbmdsZVZhcigpKXJldHVybiBudWxsO1xyXG4gICAgICAgIHJldHVybiAodGhpcy5pdGVtc1swXWFzIFRva2VuKS5nZXRTdHJpbmdWYWx1ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlzUG93R3JvdXBNYXRjaChncm91cDogTWF0aEdyb3VwKTpib29sZWFue1xyXG4gICAgICAgIGlmKHRoaXMuaXRlbXMubGVuZ3RoIT09MSlyZXR1cm4gZmFsc2VcclxuICAgICAgICBpZih0aGlzLmlzU2luZ2xlVmFyKCkmJmdyb3VwLmlzU2luZ2xlVmFyKCkmJnRoaXMuZXF1YWxzKGdyb3VwKSl7XHJcbiAgICAgICAgICAgIHRoaXMuaXRlbXM9W01hdGhKYXhPcGVyYXRvci5jcmVhdGUoXCJQb3dlclwiLDIsW25ldyBNYXRoR3JvdXAodGhpcy5pdGVtc1swXSksbmV3IE1hdGhHcm91cChuZXcgVG9rZW4oMikpXSldXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLmVxdWFscyhncm91cClcclxuICAgIH1cclxuXHJcbiAgICBpc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVyOiBNYXRoR3JvdXApe1xyXG4gICAgICAgIGNvbnN0IGJvdGhTaW5ndWxhcj10aGlzLnNpbmd1bGFyKCkmJm90aGVyLnNpbmd1bGFyKClcclxuICAgICAgICBjb25zdCBmaXJzdEl0ZW1NYXRoSmF4b09lcmF0b3I9dGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciYmb3RoZXIuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvclxyXG4gICAgICAgIGlmKCFib3RoU2luZ3VsYXImJiFmaXJzdEl0ZW1NYXRoSmF4b09lcmF0b3IpcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGE9KHRoaXMuaXRlbXNbMF1hcyBNYXRoSmF4T3BlcmF0b3IpLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2gob3RoZXIuZ2V0SXRlbXMoKVswXSlcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzLmVxdWFscyhvdGhlcilcclxuICAgIH1cclxuXHJcbiAgICBlcXVhbHMoaXRlbTogVG9rZW58TWF0aEpheE9wZXJhdG9yfE1hdGhHcm91cCl7XHJcbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIFRva2VuKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09MSYmdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLml0ZW1zWzBdLmVxdWFscyhpdGVtKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3ImJnRoaXMuaXRlbXNbMF0uZXF1YWxzKGl0ZW0pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT1pdGVtLml0ZW1zLmxlbmd0aCYmdGhpcy5pdGVtcy5ldmVyeSgodDogTWF0aEdyb3VwSXRlbSk9PntcclxuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtLml0ZW1zLnNvbWUoKGkpPT50LmVxdWFscyhpKSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGdldElkKCl7XHJcbiAgICAgICAgcmV0dXJuICdNYXRoR3JvdXAnXHJcbiAgICB9XHJcbiAgICBjb21iaW5pbmdMaWtlVGVybXMoKSB7XHJcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXcgPSBuZXcgTWF0aE92ZXJ2aWV3KCk7XHJcbiAgICAgICAgb3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKTtcclxuICAgICAgICB0aGlzLnNldEl0ZW1zKG92ZXJ2aWV3LnJlY29uc3RydWN0QXNNYXRoR3JvdXBJdGVtcygpKTtcclxuICAgICAgICBsZXQgaW5kZXggPSAwO1xyXG4gICAgICAgIHdoaWxlIChpbmRleCA8IHRoaXMuaXRlbXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2luZGV4XTtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnaW5hbExlbmd0aCA9IHRoaXMuaXRlbXMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcyA9IHRoaXMuaXRlbXMuZmlsdGVyKChvdGhlckl0ZW06IE1hdGhHcm91cEl0ZW0sIG90aGVySW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA9PT0gb3RoZXJJbmRleCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNNYXRjaCA9IGl0ZW0uaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlckl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNNYXRjaDtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXRlbXMubGVuZ3RoIDwgb3JpZ2luYWxMZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbmRleCA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnO1xyXG4gICAgICAgIGlmKCFBcnJheS5pc0FycmF5KHRoaXMuaXRlbXMpKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgYnV0IHJlY2VpdmVkOiBcIit0aGlzLml0ZW1zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBzdHJpbmcrPXNob3VsZEFkZFBsdXModGhpcy5pdGVtc1tpbmRleC0xXSxpdGVtKVxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCAmJiAhaXRlbS5zaW5ndWxhcigpKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gYCgke2l0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKX0pYDtcclxuICAgICAgICAgICAgfSAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gaXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpO1xyXG4gICAgICAgICAgICB9IGlmIChjdXN0b21Gb3JtYXR0ZXIpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyA9IGN1c3RvbUZvcm1hdHRlcihpdGVtLHN0cmluZyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gc3RyaW5nO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIE1hdGhPdmVydmlldyB7XHJcbiAgICBwcml2YXRlIHZhcmlhYmxlczogTWFwPHN0cmluZywgYW55PjtcclxuICAgIHByaXZhdGUgb3BlcmF0b3JzOiBNYXA8c3RyaW5nLCBhbnk+O1xyXG4gICAgcHJpdmF0ZSBudW1iZXI6IG51bWJlcjtcclxuICAgIGdldE51bWJlcigpOiBudW1iZXJ7cmV0dXJuIHRoaXMubnVtYmVyO31cclxuICAgIGdldFZhcmlhYmxlcygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLnZhcmlhYmxlczt9XHJcbiAgICBnZXRPcGVyYXRvcnMoKTogTWFwPHN0cmluZywgYW55PntyZXR1cm4gdGhpcy5vcGVyYXRvcnM7fVxyXG4gICAgY29uc3RydWN0b3IodmFyaWFibGVzPzogTWFwPHN0cmluZywgYW55PixvcGVyYXRvcnM/OiBNYXA8c3RyaW5nLCBhbnk+LG51bWJlcj86IG51bWJlcil7XHJcbiAgICAgICAgaWYodmFyaWFibGVzKXRoaXMudmFyaWFibGVzPXZhcmlhYmxlcztcclxuICAgICAgICBpZihvcGVyYXRvcnMpdGhpcy5vcGVyYXRvcnM9b3BlcmF0b3JzO1xyXG4gICAgICAgIGlmKG51bWJlcil0aGlzLm51bWJlcj1udW1iZXI7XHJcbiAgICB9XHJcbiAgICBkZWZpbmVPdmVydmlld1NlcGFyYXRlSW50b0luZGl2aWR1YWxzKGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10pIHtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcz1uZXcgTWFwKCk7XHJcbiAgICAgICAgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xyXG4gICAgICAgIGl0ZW1zLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJml0ZW0uaXNWYXIoKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVZhcmlhYmxlc01hcChpdGVtLmdldFN0cmluZ1ZhbHVlKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJiFpdGVtLmlzVmFyKCk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVNdW1iZXIoaXRlbS5nZXROdW1iZXJWYWx1ZSgpKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU9wZXJhdG9yc01hcChpdGVtKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5rbm93biBjYXRlZ29yeSBpbiBNYXRoT3ZlcnZpZXcgc2VwYXJhdGVJbnRvSW5kaXZpZHVhbHNcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICB9XHJcbiAgICB1cGRhdGVNdW1iZXIobnVtYmVyOiBudW1iZXIpeyB0aGlzLm51bWJlcj10aGlzLm51bWJlcj90aGlzLm51bWJlcitudW1iZXI6bnVtYmVyO31cclxuICAgIHVwZGF0ZVZhcmlhYmxlc01hcChrZXk6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXMgPz89IG5ldyBNYXA8c3RyaW5nLCB7IGNvdW50OiBudW1iZXI7IGl0ZW1zOiBhbnlbXSB9PigpO1xyXG4gICAgICAgIGlmKCF0aGlzLnZhcmlhYmxlcy5oYXMoa2V5KSl7dGhpcy52YXJpYWJsZXMuc2V0KGtleSx7Y291bnQ6IDB9KX1cclxuICAgICAgICB0aGlzLnZhcmlhYmxlcy5nZXQoa2V5KS5jb3VudCsrO1xyXG4gICAgfVxyXG4gICAgdXBkYXRlT3BlcmF0b3JzTWFwKG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xyXG4gICAgICAgIGNvbnN0IGtleT1vcGVyYXRvci5vcGVyYXRvcjtcclxuICAgICAgICBpZighdGhpcy5vcGVyYXRvcnMpIHRoaXMub3BlcmF0b3JzPW5ldyBNYXAoKTtcclxuICAgICAgICBpZighdGhpcy5vcGVyYXRvcnMuaGFzKGtleSkpe3RoaXMub3BlcmF0b3JzLnNldChrZXkse2NvdW50OiAwLCBpdGVtczogW119KX1cclxuICAgICAgICBjb25zdCBlbnRyeSA9IHRoaXMub3BlcmF0b3JzLmdldChrZXkpITtcclxuICAgICAgICBlbnRyeS5jb3VudCArPSAxO1xyXG4gICAgICAgIGVudHJ5Lml0ZW1zLnB1c2gob3BlcmF0b3IpO1xyXG4gICAgfVxyXG5cclxuICAgIGhhc1Zhcigpe3JldHVybiB0aGlzLnZhcmlhYmxlcyYmdGhpcy52YXJpYWJsZXMuc2l6ZT4wfVxyXG4gICAgaGFzT3AoKXtyZXR1cm4gdGhpcy5vcGVyYXRvcnMmJnRoaXMub3BlcmF0b3JzLnNpemU+MH1cclxuICAgIG9ubHlOdW1lcmljKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubnVtYmVyJiYhdGhpcy5oYXNWYXIoKSYmIXRoaXMuaGFzT3AoKVxyXG4gICAgfVxyXG4gICAgcmVjb25zdHJ1Y3RBc01hdGhHcm91cEl0ZW1zKCl7XHJcbiAgICAgICAgY29uc3QgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXT1bXTtcclxuICAgICAgICBpZih0aGlzLm51bWJlcilpdGVtcy5wdXNoKG5ldyBUb2tlbih0aGlzLm51bWJlcikpO1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcclxuICAgICAgICAgICAgaWYodmFsdWUuY291bnQ9PT0xKXtcclxuICAgICAgICAgICAgICAgIGl0ZW1zLnB1c2gobmV3IFRva2VuKGtleSkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZih2YWx1ZS5jb3VudD4xKXtcclxuICAgICAgICAgICAgICAgIGl0ZW1zLnB1c2goTXVsdGlwbGljYXRpb25PcGVyYXRvci5hc09jY3VycmVuY2VHcm91cCh2YWx1ZS5jb3VudCxrZXkpKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWYodGhpcy5vcGVyYXRvcnMpe1xyXG4gICAgICAgICAgICBpdGVtcy5wdXNoKC4uLkFycmF5LmZyb20odGhpcy5vcGVyYXRvcnMudmFsdWVzKCkpLmZsYXRNYXAoKG9wZXJhdG9yOiBhbnkpID0+IG9wZXJhdG9yLml0ZW1zKSlcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGl0ZW1zO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBUb2tlbntcclxuICAgIHByaXZhdGUgdmFsdWU6IG51bWJlcnxzdHJpbmc7XHJcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTpudW1iZXJ8c3RyaW5nKXtcclxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgfVxyXG4gICAgZ2V0TnVtYmVyVmFsdWUoKTpudW1iZXJ7cmV0dXJuICh0aGlzLnZhbHVlIGFzIG51bWJlcil9XHJcbiAgICBnZXRTdHJpbmdWYWx1ZSgpOnN0cmluZ3tyZXR1cm4gKHRoaXMudmFsdWUgYXMgc3RyaW5nKX1cclxuICAgIGdldFZhbHVlKCl7cmV0dXJuIHRoaXMudmFsdWV9XHJcbiAgICBzZXRWYWx1ZSh2YWx1ZTogbnVtYmVyfHN0cmluZyl7dGhpcy52YWx1ZT12YWx1ZTt9XHJcbiAgICBpc1ZhcigpIHtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWUgPT09ICdzdHJpbmcnO31cclxuICAgIGVxdWFscyhpdGVtOiBNYXRoR3JvdXBJdGVtKSB7XHJcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy52YWx1ZSA9PT0gaXRlbS52YWx1ZTtcclxuICAgIH1cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9JydcclxuICAgICAgICBpZighdGhpcy5pc1ZhcigpJiZ0aGlzLmdldE51bWJlclZhbHVlKCk8MClcclxuICAgICAgICAgICAgc3RyaW5nKz0nLSc7XHJcbiAgICAgICAgc3RyaW5nKz10aGlzLnZhbHVlO1xyXG4gICAgICAgIGlmKGN1c3RvbUZvcm1hdHRlcil7XHJcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBzdHJpbmc7XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpe3JldHVybiBuZXcgVG9rZW4odGhpcy52YWx1ZSl9XHJcbn1cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEJhc2ljTWF0aEpheFRva2Vuc3tcclxuICAgIHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+PVtdO1xyXG4gICAgXHJcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM/OiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj4pe1xyXG4gICAgICAgIHRoaXMudG9rZW5zPXRva2Vuc3x8W107XHJcbiAgICB9XHJcbiAgICBhZGRJbnB1dChtYXRoOiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XHJcbiAgICB9XHJcbiAgICB0b2tlbml6ZShtYXRoOiBzdHJpbmcpe1xyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzKCkpXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXRoLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2gocmVnRXhwKCdeJyArIG9wZXJhdG9ycykpO1xyXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChCYXNpY01hdGhKYXhUb2tlbi5jcmVhdGUobWF0Y2hbMF0pKTtcclxuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKS8pOy8vKFthLXpBLVpdPykvKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpXHJcbiAgICAgICAgICAgIHsgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChCYXNpY01hdGhKYXhUb2tlbi5jcmVhdGUocGFyc2VGbG9hdChtYXRjaFswXSkpKTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vQWRkIHBsdXMgdG8gbWFrZSBpdCBtdWx0aXBsZSBMZXR0ZXJzLlxyXG4gICAgICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXShfXFwoW2EtekEtWjAtOV0qXFwpKSovKVxyXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goQmFzaWNNYXRoSmF4VG9rZW4uY3JlYXRlKG1hdGNoWzBdKSlcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY2hhciBcIiR7bWF0aFtpXX1cImApO1xyXG4gICAgICAgIH1cclxuICAgICAgIHRoaXMucG9zdFByb2Nlc3NUb2tlbnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBwb3N0UHJvY2Vzc1Rva2Vucygpe1xyXG4gICAgICAgIC8qcnVsZXMgdG8gYWJpZCBieTpcclxuICAgICAgICAxLiArLSBJZiBwYXJ0IG9mIHRoZSBudW1iZXIgdGhleSBhcmUgYWJzb3JiZWQgaW50byB0aGUgbnVtYmVyXHJcbiAgICAgICAgKi9cclxuICAgICAgICB0aGlzLnRva2Vucz1pZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKTtcclxuICAgICAgICB0aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHBhcmVuTWFwPXRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXHJcblxyXG4gICAgICAgIHBhcmVuTWFwLnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBiIC0gYSlcclxuICAgICAgICAuZm9yRWFjaCgodmFsdWU6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UodmFsdWUsIDAsIG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4oJ29wZXJhdG9yJywnKicpKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy52YWxpZGF0ZVBsdXNNaW51cygpXHJcbiAgICB9XHJcbiAgICBpbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKCkge1xyXG4gICAgICAgIGNvbnN0IGlzQUJhc2ljTWF0aEpheFRva2VuRG91YmxlUmlnaHRPcD0odG9rZW4/OiBhbnkpPT57XHJcbiAgICAgICAgICAgIGlmKHRva2VuJiZ0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoWzEsIDJdKS5pbmNsdWRlcyh0b2tlbi5nZXRTdHJpbmdWYWx1ZSgpKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgICogXHJcbiAgICAgICAgICogQHBhcmFtIGluZGV4IFxyXG4gICAgICAgICAqIEByZXR1cm5zIGJvb2xhbiA9PiBUcnVlIGlmIHRoYXIgaXNuJ3QgYSBkb3VibGVSaWdodCBvcGVyYXRvci5cclxuICAgICAgICAgKi9cclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCl8fCEodGhpcy50b2tlbnNbaW5kZXhdIGluc3RhbmNlb2YgUGFyZW4pKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGZpbmRQYXJlbkluZGV4KGluZGV4LHRoaXMudG9rZW5zKT8ub3BlbjtcclxuICAgICAgICAgICAgaWYgKGlkeCA9PSBudWxsIHx8IHBhcmVuU3RhdGUodGhpcy50b2tlbnNbaW5kZXggKyAxXSkpIHJldHVybiBmYWxzZTtcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSB0aGlzLnRva2Vuc1tpZHggLSAxXTtcclxuICAgICAgICAgICAgcmV0dXJuICFpc0FCYXNpY01hdGhKYXhUb2tlbkRvdWJsZVJpZ2h0T3AocHJldlRva2VuKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleF07XHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHRva2VuLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbj0odG9rZW46IGFueSk9PntcclxuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnR5cGVvZiB0b2tlbi5nZXRWYWx1ZSgpPT09J3N0cmluZycmJmhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4uZ2V0U3RyaW5nVmFsdWUoKSlcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGlzVmFyPSh0b2tlbjogYW55KT0+e3JldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmdG9rZW4uZ2V0VHlwZSgpPT09J3ZhcmlhYmxlJ31cclxuXHJcbiAgICAgICAgY29uc3QgcHJlY2VkZXNWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBpbmRleD4wJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZm9sbG93c1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIGluZGV4PHRva2Vucy5sZW5ndGgtMSYmaXNWYXIodG9rZW5zW2luZGV4XSlcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGluZGV4PjAmJihwYXJlblN0YXRlKHRva2VuLHRydWUpfHwgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuKXx8cHJlY2VkZXNWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC0xJiYocGFyZW5TdGF0ZSh0b2tlbiwpfHxmb2xsb3dzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8IHRlc3REb3VibGVSaWdodChpbmRleCkgPyBpbmRleCArIDEgOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0gIT09IG51bGwpO1xyXG4gICAgICAgIHJldHVybiBtYXA7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB2YWxpZGF0ZVBsdXNNaW51cygpe1xyXG4gICAgICAgIC8vIFBsdXNlcyBhcmUgc2VwYXJhdG9ycy5UaGVyZWZvcmUsIHRoZXkgZG8gbm90IG5lZWQgdG8gYmUgaGVyZSBBcyB0aGUgZXhwcmVzc2lvbiBpcyB0b2tlbltdXHJcbiAgICAgICAgLy9NaW51c2VzIG9uIHRoZSBvdGhlciBoYW5kLmNhbiBlaXRoZXIgYmUgYSBzZXBhcmF0b3IuIE9yIGEgbmVnYXRpdmUgc2lnblxyXG4gICAgICAgIGNvbnN0IHBsdXNNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW58UGFyZW4sIGluZGV4OiBhbnkpID0+IHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnRva2VuLmdldFZhbHVlKCkgPT09ICdBZGRpdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcclxuICAgICAgICBwbHVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1pbnVzTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VufFBhcmVuLCBpbmRleDogYW55KSA9PiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0b2tlbi5nZXRWYWx1ZSgpID09PSAnU3VidHJhY3Rpb24nP2luZGV4IDogbnVsbCkuZmlsdGVyKChpbmRleDogbnVtYmVyIHwgbnVsbCkgPT4gaW5kZXggIT09IG51bGwpXHJcbiAgICAgICAgXHJcbiAgICAgICAgbWludXNNYXAucmV2ZXJzZSgpLmZvckVhY2goKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgbmV4dFRva2VuID0gdGhpcy50b2tlbnNbaW5kZXggKyAxXTtcclxuICAgICAgICAgICAgaWYgKG5leHRUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHR5cGVvZiBuZXh0VG9rZW4uZ2V0VmFsdWUoKSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgICAgIG5leHRUb2tlbi5zZXRWYWx1ZShuZXh0VG9rZW4uZ2V0TnVtYmVyVmFsdWUoKSAqIC0xKVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICB2YWxpZGF0ZUluZGV4KGluZGV4OiBudW1iZXIsbWFyZ2luPzogbnVtYmVyKXtcclxuICAgICAgICBtYXJnaW49bWFyZ2lufHwwO1xyXG4gICAgICAgIHJldHVybiBpbmRleD49MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC1tYXJnaW47XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBCYXNpY01hdGhKYXhUb2tlbnMge1xyXG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW5zKHRoaXMudG9rZW5zLm1hcCh0b2tlbiA9PiB0b2tlbi5jbG9uZSgpKSk7XHJcbiAgICB9XHJcbiAgICAvKlxyXG4gICAgXHJcbiAgICBcclxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuOiBhbnksIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSBcIihcIiA/IGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgpIDogbnVsbClcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgfVxyXG5cclxuICAgIGZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwUGFyZW5JbmRleGVzKClcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XHJcbiAgICAgICAgICAgICAgICBpZiAob3BlbkluZGV4ID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICgvKG9wZXJhdG9yfHBhcmVuKS8udGVzdCh0aGlzLnRva2Vuc1tvcGVuSW5kZXggLSAxXT8udHlwZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmIChjbG9zZUluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0/LmlzVmFsdWVUb2tlbigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfSkuZmxhdE1hcCgoaXRlbTogYW55KSA9PiBbaXRlbS5vcGVuLCBpdGVtLmNsb3NlXSk7XHJcbiAgICB9ICAgIFxyXG4gICAgXHJcbiAgICBcclxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICAgfVxyXG4gICAgXHJcbiAgICBjb25uZWN0TmVhcmJ5VG9rZW5zKCl7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIFRva2VuKSl7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJmdHlndWJobmltcG9cIilcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1hcCA9IG5ldyBTZXQodGhpcy5maWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFsKCkpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfOiBhbnksIGlkeDogdW5rbm93bikgPT4gIW1hcC5oYXMoaWR4KSk7XHJcbiAgICAgICAgLy9Qcm9ibGVtIHdpdGggID0gYXMgaXQncyBhZmZlY3RpbmcgdGhlIHZhcmlhYmxlIGJlZm9yZSBpdFxyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4IC0gMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKCkgJiZcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4ICsgMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKClcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgYXJyID0gW1xyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobnVtTWFwKSwgXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyh2YXJNYXApLCBcclxuICAgICAgICBdO1xyXG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXHJcbiAgICB9XHJcblxyXG4gICAgXHJcblxyXG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxyXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW4udHlwZSkpIFxyXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtyZXR1cm4gSW5maW5pdHl9XHJcbiAgICB9XHJcblxyXG4gICAgaW5zZXJ0VG9rZW5zKHN0YXJ0OiBhbnksIGxlbmd0aDogbnVtYmVyLCBvYmplY3RzOiBhbnlbXSB8IFRva2VuKSB7XHJcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XHJcbiAgICB9XHJcblxyXG4gICAgXHJcblxyXG4gICAgaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnM6IGFueVtdKXtcclxuICAgICAgICByZXR1cm4gdG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT5pbmRleD4wXHJcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXHJcbiAgICAgICAgICAgICYmdG9rZW4/LmlzVmFsdWVUb2tlbigpJiZ0b2tlbi52YWx1ZT49MD9pbmRleDpudWxsXHJcbiAgICAgICAgKS5maWx0ZXIoaXRlbT0+aXRlbSE9PW51bGwpXHJcbiAgICB9XHJcblxyXG4gICAgdG9rZW5Db21wYXJlKGNvbXBhcmU6IHN0cmluZyB8IG51bWJlciwgdmFsdWU6IHN0cmluZ3xSZWdFeHAsIHRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0sIG5leHRUb2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9KSB7XHJcbiAgICAgICAgY29uc3QgcmVnRXhwdmFsdWUgPSAodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcclxuICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgcmVnRXhwdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXHJcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICAqL1xyXG59Il19