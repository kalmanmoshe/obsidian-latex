import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { BracketType } from "src/staticData/mathParserStaticData";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBK0IsV0FBVyxFQUFtRSxNQUFNLHFDQUFxQyxDQUFDO0FBRWhLLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxVQUFVLEdBQUksTUFBTSx3QkFBd0IsQ0FBQztBQUMzRixPQUFPLEVBQUUsdUJBQXVCLEVBQWlDLDJCQUEyQixFQUFFLHVCQUF1QixFQUFFLHlCQUF5QixFQUFvRSxzQkFBc0IsRUFBaUIsTUFBTSwyQkFBMkIsQ0FBQztBQUU3UixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRzdDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRW5ELFNBQVMsU0FBUyxDQUFDLEtBQWEsRUFBRSxJQUFpQjtJQUMvQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ1gsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEIsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEI7WUFDSSxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FDOUIsU0FBYyxFQUNkLFNBQWlDLEVBQ2pDLE9BQTRCLEVBQUU7SUFFOUIsNERBQTREO0lBQzVELElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG1FQUFtRTtJ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QUFDLENBQUE7Z0JBQ25ELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNqQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDVCxDQUFDO0lBQ0QsYUFBYSxDQUFDLEtBQWEsRUFBQyxNQUFlO1FBQ3ZDLE1BQU0sR0FBQyxNQUFNLElBQUUsQ0FBQyxDQUFDO1FBQ2pCLE9BQU8sS0FBSyxJQUFFLENBQUMsR0FBQyxNQUFNLElBQUUsS0FBSyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFDLE1BQU0sQ0FBQztJQUM1RCxDQUFDO0lBQ0QsS0FBSztRQUNELE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0UsQ0FBQztDQXFHSiIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi9pbVZlcnlMYXp5XCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgQXNzb2NpYXRpdml0eSwgQnJhY2tldFN0YXRlLCBCcmFja2V0VHlwZSwgTWF0aEpheE9wZXJhdG9yTWV0YWRhdGEsIG1hdGhKYXhPcGVyYXRvcnNNZXRhZGF0YSwgT3BlcmF0b3JUeXBlIH0gZnJvbSBcInNyYy9zdGF0aWNEYXRhL21hdGhQYXJzZXJTdGF0aWNEYXRhXCI7XHJcblxyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgcGFyZW5TdGF0ZSwgIH0gZnJvbSBcIi4uL3V0aWxzL1BhcmVuVXRlbnNpbHNcIjtcclxuaW1wb3J0IHsgZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHksIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlLCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBpc09wZXJhdG9yV2l0aEFzc29jaWF0aXZpdHksIHNlYXJjaEFsbE1hdGhKYXhPcGVyYXRvcnNBbmRTeW1ib2xzLCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzLCBzZWFyY2hTeW1ib2xzIH0gZnJvbSBcIi4uL3N0YXRpY0RhdGEvZGF0YU1hbmFnZXJcIjtcclxuXHJcbmltcG9ydCB7IHBhcnNlT3BlcmF0b3IgfSBmcm9tIFwiLi9tYXRoRW5naW5lXCI7XHJcbmltcG9ydCB7IGl0IH0gZnJvbSBcIm5vZGU6dGVzdFwiO1xyXG5pbXBvcnQgeyBzaWduYWwgfSBmcm9tIFwiY29kZW1pcnJvclwiO1xyXG5pbXBvcnQgeyBCYXNpY01hdGhKYXhUb2tlbiB9IGZyb20gXCJzcmMvYmFzaWNUb2tlblwiO1xyXG5cclxuZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBzdHJpbmcsIHdyYXA6IEJyYWNrZXRUeXBlKTogc3RyaW5nIHtcclxuICAgIHN3aXRjaCAod3JhcCkge1xyXG4gICAgICAgIGNhc2UgQnJhY2tldFR5cGUuUGFyZW50aGVzZXM6XHJcbiAgICAgICAgICAgIHJldHVybiBgKCR7Z3JvdXB9KWA7XHJcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5DdXJseUJyYWNlczpcclxuICAgICAgICAgICAgcmV0dXJuIGB7JHtncm91cH19YDtcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICByZXR1cm4gZ3JvdXA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkZWVwU2VhcmNoV2l0aFBhdGgoXHJcbiAgICBzdHJ1Y3R1cmU6IGFueSxcclxuICAgIHByZWRpY2F0ZTogKGl0ZW06IGFueSkgPT4gYm9vbGVhbixcclxuICAgIHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gPSBbXVxyXG4pOiB7IGl0ZW06IGFueTsgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSB9IHwgbnVsbCB7XHJcbiAgICAvLyBCYXNlIGNhc2U6IElmIHRoZSBjdXJyZW50IHN0cnVjdHVyZSBtYXRjaGVzIHRoZSBwcmVkaWNhdGVcclxuICAgIGlmIChwcmVkaWNhdGUoc3RydWN0dXJlKSkge1xyXG4gICAgICAgIHJldHVybiB7IGl0ZW06IHN0cnVjdHVyZSwgcGF0aCB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0J3MgYW4gYXJyYXksIHJlY3Vyc2l2ZWx5IHNlYXJjaCBlYWNoIGVsZW1lbnQgd2l0aCBpdHMgaW5kZXhcclxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0cnVjdHVyZSkpIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cnVjdHVyZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2ldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBpXSk7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0J3MgYW4gb2JqZWN0LCByZWN1cnNpdmVseSBzZWFyY2ggaXRzIHByb3BlcnRpZXMgd2l0aCB0aGVpciBrZXlzXHJcbiAgICBpZiAoc3RydWN0dXJlICE9PSBudWxsICYmIHR5cGVvZiBzdHJ1Y3R1cmUgPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzdHJ1Y3R1cmUpIHtcclxuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdHJ1Y3R1cmUsIGtleSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVba2V5XSwgcHJlZGljYXRlLCBbLi4ucGF0aCwga2V5XSk7XHJcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIG5vIG1hdGNoIGlzIGZvdW5kXHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG50eXBlIGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwPU1hdGhHcm91cEl0ZW18TWF0aEdyb3VwfEJhc2ljTWF0aEpheFRva2VuXHJcbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pOiBNYXRoR3JvdXBJdGVtW10ge1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xyXG4gICAgICAgIGl0ZW1zID0gW2l0ZW1zXTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmb3JtYXR0ZWRJdGVtcyA9IGl0ZW1zXHJcbiAgICAgICAgLnJlZHVjZSgoYWNjOiBNYXRoR3JvdXBJdGVtW10sIGl0ZW06IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yIHwgQmFzaWNNYXRoSmF4VG9rZW4pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBhY2MuY29uY2F0KGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtLmdldEl0ZW1zKCkpKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pIHtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLmdldFZhbHVlKCkgJiYgKGl0ZW0uZ2V0VHlwZSgpID09PSBcIm51bWJlclwiIHx8IGl0ZW0uZ2V0VHlwZSgpID09PSBcInZhcmlhYmxlXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjLnB1c2gobmV3IFRva2VuKGl0ZW0uZ2V0VmFsdWUoKSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgYEV4cGVjdGVkIGl0ZW0gdG8gYmUgYSBudW1iZXIgb3IgdmFyaWFibGUgYnV0IHJlY2VpdmVkOiAke2l0ZW0uZ2V0VmFsdWUoKX1gXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgfSwgW10pXHJcblxyXG4gICAgcmV0dXJuIGZvcm1hdHRlZEl0ZW1zO1xyXG59XHJcbmZ1bmN0aW9uIGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoT3BlcmF0b3IoZ3JvdXBzOiAoTWF0aEdyb3VwSXRlbXxNYXRoR3JvdXApW10pOk1hdGhHcm91cFtde1xyXG4gICAgY29uc3QgZm9ybWF0dGVkR3JvdXBzID0gZ3JvdXBzXHJcbiAgICAgICAgLnJlZHVjZSgoYWNjOiBNYXRoR3JvdXBbXSwgaXRlbTogVG9rZW4gfCBNYXRoR3JvdXAgfCBNYXRoSmF4T3BlcmF0b3IgKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpIHtcclxuICAgICAgICAgICAgICAgIGFjYy5wdXNoKG5ldyBNYXRoR3JvdXAoaXRlbSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgfSwgW10pXHJcblxyXG4gICAgcmV0dXJuIGZvcm1hdHRlZEdyb3VwcztcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvdWxkQWRkUGx1cyhncm91cDE/OiBhbnksZ3JvdXAyPzogYW55LGRpc3RhbmNlRnJvbU9wZXJhdG9yPzogbnVtYmVyKXtcclxuICAgIGlmKCFncm91cDF8fCFncm91cDJ8fCFkaXN0YW5jZUZyb21PcGVyYXRvcnx8ZGlzdGFuY2VGcm9tT3BlcmF0b3I9PT0tMXx8ZGlzdGFuY2VGcm9tT3BlcmF0b3I9PT0xKXJldHVybiAnJztcclxuXHJcbiAgICByZXR1cm4gJysnO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYW5Db21iaW5lKG1hdGg6IE1hdGhHcm91cCxvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcclxuXHJcbn1cclxuZXhwb3J0IGNsYXNzIE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICBvcGVyYXRvcjogc3RyaW5nO1xyXG4gICAgZ3JvdXBOdW06IG51bWJlciA9IDE7XHJcbiAgICBncm91cHM6IE1hdGhHcm91cFtdO1xyXG4gICAgc29sdXRpb246IE1hdGhHcm91cDtcclxuICAgIGNvbW11dGF0aXZlOiBib29sZWFuO1xyXG4gICAgaXNPcGVyYWJsZTogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKSB7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yKSB0aGlzLm9wZXJhdG9yID0gb3BlcmF0b3I7XHJcbiAgICAgICAgaWYgKGdyb3VwTnVtKSB0aGlzLmdyb3VwTnVtID0gZ3JvdXBOdW07XHJcbiAgICAgICAgaWYgKGdyb3VwcykgdGhpcy5ncm91cHMgPSBncm91cHM7XHJcbiAgICAgICAgaWYgKHNvbHV0aW9uKSB0aGlzLnNvbHV0aW9uID0gc29sdXRpb247XHJcbiAgICAgICAgaWYgKGlzT3BlcmFibGUgIT09IHVuZGVmaW5lZCkgdGhpcy5pc09wZXJhYmxlID0gaXNPcGVyYWJsZTtcclxuICAgIH1cclxuICAgIHN0YXRpYyBjcmVhdGUob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKTogTWF0aEpheE9wZXJhdG9yIHtcclxuICAgICAgICBpZiAob3BlcmF0b3IgPT09IFwiTXVsdGlwbGljYXRpb25cIikge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZ3JvdXBzLCBzb2x1dGlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBuZXcgTWF0aEpheE9wZXJhdG9yKG9wZXJhdG9yLCBncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgaXNPcGVyYWJsZSk7XHJcbiAgICB9XHJcbiAgICB0ZXN0R3JvdXBzKHRlc3Q6IChncm91cDogTWF0aEdyb3VwKSA9PiBib29sZWFuKTogYm9vbGVhbltdIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5ncm91cHMubWFwKHRlc3QpO1xyXG4gICAgfVxyXG5cclxuICAgIG1hcFZhcmlhYmxlcygpOiBib29sZWFuW10ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaGFzVmFyaWFibGVzKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIG9wZXJhdG9yVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcclxuICAgICAgICByZXR1cm4gWy4uLm5ldyBTZXQodGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmdyb3VwVmFyaWFibGVzKCkpLmZsYXQoKSldO1xyXG4gICAgfVxyXG5cclxuICAgIGNsb25lKCk6IE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmNsb25lKCkpO1xyXG4gICAgICAgIGNvbnN0IHNvbHV0aW9uID0gdGhpcy5zb2x1dGlvbiA/IHRoaXMuc29sdXRpb24uY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgICAgICByZXR1cm4gTWF0aEpheE9wZXJhdG9yLmNyZWF0ZSh0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nU29sdXRpb24oKTogc3RyaW5nIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZygpICsgJyA9ICcgKyB0aGlzLnNvbHV0aW9uPy50b1N0cmluZygpO1xyXG4gICAgfVxyXG5cclxuICAgIGVxdWFscyhpdGVtOiBNYXRoR3JvdXBJdGVtKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiZcclxuICAgICAgICAgICAgdGhpcy5vcGVyYXRvciA9PT0gaXRlbS5vcGVyYXRvciAmJlxyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5sZW5ndGggPT09IGl0ZW0uZ3JvdXBzLmxlbmd0aCAmJlxyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5ldmVyeSgodCwgaW5kZXgpID0+IHQuZXF1YWxzKGl0ZW0uZ3JvdXBzW2luZGV4XSkpO1xyXG4gICAgfVxyXG4gICAgZ2V0T2NjdXJyZW5jZUdyb3VwKCk6IHsgb2NjdXJyZW5jZXNDb3VudDogbnVtYmVyOyBvY2N1cnJlbmNPZjogTWF0aEdyb3VwW10gfXxudWxsICB7IHJldHVybiBudWxsOyB9ICBcclxuICAgIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7cmV0dXJuIGZhbHNlO31cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHNlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy5vcGVyYXRvcik7XHJcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuICcnO1xyXG4gICAgICAgIGlmKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPjJ8fG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPDEpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbnVtYmVyIG9mIHBvc2l0aW9ucyBmb3IgYXNzb2NpYXRpdml0eTogJHttZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uc31gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gbWV0YWRhdGEubGF0ZXg7XHJcbiAgICAgICAgbGV0IGluZGV4PTA7XHJcbiAgICAgICAgbGV0IHN0cmluZyA9ICcnO1xyXG4gICAgICAgIGNvbnN0IGdyb3VwQnJhY2tldFR5cGU9KHBvczogeyBicmFja2V0VHlwZTogQnJhY2tldFR5cGU7IGlzQnJhY2tldE9wdGlvbmFsOiBib29sZWFuIH0sZ3JvdXA6IE1hdGhHcm91cCk9PntcclxuICAgICAgICAgICAgaWYoIXBvcy5pc0JyYWNrZXRPcHRpb25hbClcclxuICAgICAgICAgICAgICAgIHJldHVybiBwb3MuYnJhY2tldFR5cGVcclxuICAgICAgICAgICAgcmV0dXJuIGdyb3VwLnNpbmd1bGFyKCk/QnJhY2tldFR5cGUuTm9uZTpwb3MuYnJhY2tldFR5cGVcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLHRydWUpLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleC0xXSx0aGlzLmdyb3Vwc1tpbmRleF0saW5kZXgpO1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XS50b1N0cmluZygpLGdyb3VwQnJhY2tldFR5cGUoaXRlbSx0aGlzLmdyb3Vwc1tpbmRleF0pKTtcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xyXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLGZhbHNlKS5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXhdLHRoaXMuZ3JvdXBzW2luZGV4KzFdLGluZGV4KVxyXG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XS50b1N0cmluZygpLGdyb3VwQnJhY2tldFR5cGUoaXRlbSx0aGlzLmdyb3Vwc1tpbmRleF0pKTtcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKGN1c3RvbUZvcm1hdHRlcikgXHJcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXHJcbiAgICAgICAgcmV0dXJuIHN0cmluZy50cmltKCk7XHJcbiAgICB9XHJcbiAgICBwYXJzZU1hdGhqYXhPcGVyYXRvcigpIHtcclxuICAgICAgICBwYXJzZU9wZXJhdG9yKHRoaXMpO1xyXG4gICAgfVxyXG59XHJcbmV4cG9ydCBjbGFzcyBFcXVhbHNPcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvcntcclxuXHJcbn1cclxuZXhwb3J0IGNsYXNzIERpdmlzaW9uT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3J7XHJcblxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgTXVsdGlwbGljYXRpb25PcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICBjb25zdHJ1Y3Rvcihncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXApIHtcclxuICAgICAgICBzdXBlcihcIk11bHRpcGxpY2F0aW9uXCIsIDIsIGdyb3Vwcywgc29sdXRpb24sIHRydWUpO1xyXG4gICAgICAgIHRoaXMuY29tbXV0YXRpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMucmVtb3ZlTXVsdGlwbGljYXRpb25EZXB0aHMoKTtcclxuICAgIH1cclxuXHJcbiAgICByZW1vdmVNdWx0aXBsaWNhdGlvbkRlcHRocygpe1xyXG4gICAgICAgIHdoaWxlKHRoaXMuZ3JvdXBzLnNvbWUoKGc6IE1hdGhHcm91cCk9PiBnLnNpbmd1bGFyKCkmJmcuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpKXtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXA9dGhpcy5ncm91cHMuZmluZCgoZzogTWF0aEdyb3VwKT0+IGcuc2luZ3VsYXIoKSYmZy5nZXRJdGVtcygpWzBdIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcilcclxuICAgICAgICAgICAgaWYoZ3JvdXApXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnNwbGljZSh0aGlzLmdyb3Vwcy5pbmRleE9mKGdyb3VwKSwxLC4uLihncm91cC5nZXRJdGVtcygpWzBdIGFzIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpLmdyb3VwcylcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGFzT2NjdXJyZW5jZUdyb3VwKG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcixvY2N1cnJlbmNPZjogc3RyaW5nfFRva2VufE1hdGhHcm91cCk6IE11bHRpcGxpY2F0aW9uT3BlcmF0b3Ige1xyXG4gICAgICAgIG9jY3VycmVuY09mPXR5cGVvZiBvY2N1cnJlbmNPZj09PVwic3RyaW5nXCI/XHJcbiAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNPZildKTpvY2N1cnJlbmNPZiBpbnN0YW5jZW9mIFRva2VuP1xyXG4gICAgICAgICAgICAgICAgbmV3IE1hdGhHcm91cChbb2NjdXJyZW5jT2ZdKTpvY2N1cnJlbmNPZjtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKFtuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jZXNDb3VudCldKSxvY2N1cnJlbmNPZl0pXHJcbiAgICB9XHJcbiAgICBcclxuICAgIG92ZXJyaWRlIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH0ge1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuZ3JvdXBzLnJlZHVjZShcclxuICAgICAgICAgICAgKGFjYzogeyB0b3RhbE51bTogbnVtYmVyOyBhcnI6IE1hdGhHcm91cFtdIH0sIGl0ZW06IE1hdGhHcm91cCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uZ2V0T3BlcmFibGVWYWx1ZSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjLnRvdGFsTnVtICs9IGl0ZW0uZ2V0T3BlcmFibGVWYWx1ZSgpITtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjLmFyci5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgeyB0b3RhbE51bTogMCwgYXJyOiBbXSB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4geyBvY2N1cnJlbmNlc0NvdW50OiByZXN1bHQudG90YWxOdW0sIG9jY3VycmVuY09mOiByZXN1bHQuYXJyIH07XHJcbiAgICB9XHJcblxyXG4gICAgYWRkVG9PY2N1cnJlbmNlR3JvdXAodmFsdWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG51bWJlckdyb3VwID0gdGhpcy5ncm91cHMuZmluZChncm91cCA9PiBncm91cC5zaW5nbGVOdW1iZXIoKSk7XHJcbiAgICAgICAgaWYgKG51bWJlckdyb3VwKSB7XHJcbiAgICAgICAgICAgIG51bWJlckdyb3VwLnNpbmdsZVRva2VuU2V0KHZhbHVlLCB0cnVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5wdXNoKG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbigxICsgdmFsdWUpXSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBvdmVycmlkZSBpc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RJdGVtOiBNYXRoSmF4T3BlcmF0b3IgfCBUb2tlbik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IGlzVmFsaWRJdGVtID0gdGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCB0ZXN0SXRlbSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3I7XHJcbiAgICAgICAgaWYgKCFpc1ZhbGlkSXRlbSkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudEdyb3VwID0gdGhpcy5nZXRPY2N1cnJlbmNlR3JvdXAoKTtcclxuICAgICAgICBpZiAoIWN1cnJlbnRHcm91cCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudEdyb3VwSXRlbXMgPSBjdXJyZW50R3JvdXAub2NjdXJyZW5jT2YuZmxhdE1hcChncm91cCA9PiBncm91cC5nZXRJdGVtcygpKTtcclxuICAgIFxyXG4gICAgICAgIGlmICh0ZXN0SXRlbSBpbnN0YW5jZW9mIFRva2VuKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzU2luZ2xlSXRlbU1hdGNoID0gY3VycmVudEdyb3VwSXRlbXMubGVuZ3RoID09PSAxICYmIGN1cnJlbnRHcm91cEl0ZW1zWzBdLmVxdWFscyh0ZXN0SXRlbSk7XHJcbiAgICAgICAgICAgIGlmIChpc1NpbmdsZUl0ZW1NYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRUb09jY3VycmVuY2VHcm91cCgxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gaXNTaW5nbGVJdGVtTWF0Y2g7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCB0ZXN0SXRlbUdyb3VwID0gdGVzdEl0ZW0uZ2V0T2NjdXJyZW5jZUdyb3VwKCk7XHJcbiAgICAgICAgaWYgKCF0ZXN0SXRlbUdyb3VwKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cEl0ZW1zID0gdGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNPZjtcclxuICAgICAgICBjb25zdCBhcmVHcm91cHNNYXRjaGluZyA9Y3VycmVudEdyb3VwLm9jY3VycmVuY09mLmxlbmd0aCA9PT0gdGVzdEl0ZW1Hcm91cEl0ZW1zLmxlbmd0aCAmJlxyXG4gICAgICAgICAgICBjdXJyZW50R3JvdXAub2NjdXJyZW5jT2YuZXZlcnkoKGN1cnJlbnRTdWJHcm91cDogTWF0aEdyb3VwKSA9PlxyXG4gICAgICAgICAgICAgICAgdGVzdEl0ZW1Hcm91cEl0ZW1zLnNvbWUoKHRlc3RTdWJHcm91cDogTWF0aEdyb3VwKSA9PiBcclxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50U3ViR3JvdXAuaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0U3ViR3JvdXApXHJcbiAgICAgICAgICAgICAgICApXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmIChhcmVHcm91cHNNYXRjaGluZykgeyBcclxuICAgICAgICAgICAgdGhpcy5hZGRUb09jY3VycmVuY2VHcm91cCh0ZXN0SXRlbUdyb3VwLm9jY3VycmVuY2VzQ291bnQpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7IFxyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gJ1xcXFxjZG90ICc7XHJcbiAgICAgICAgbGV0IHN0cmluZyA9ICcnO1xyXG4gICAgICAgIGNvbnN0IHRvQWRkQ2RvdD0odGhpc0dyb3VwOiBNYXRoR3JvdXAsbmV4dEdyb3VwPzpNYXRoR3JvdXApPT57XHJcbiAgICAgICAgICAgIGlmKCFuZXh0R3JvdXApcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBpZihuZXh0R3JvdXAuaXNTaW5nbGVWYXIoKXx8dGhpc0dyb3VwLmlzU2luZ2xlVmFyKCkpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgcmVvcmRlcmVkR3JvdXBzPXRoaXMuZ3JvdXBzLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICAgICAgaWYgKGEuc2luZ2xlTnVtYmVyKCkgJiYgIWIuc2luZ2xlTnVtYmVyKCkpIHJldHVybiAtMTtcclxuICAgICAgICAgICAgaWYgKCFhLnNpbmdsZU51bWJlcigpICYmIGIuc2luZ2xlTnVtYmVyKCkpIHJldHVybiAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYS5zaW5ndWxhcigpICYmICFiLnNpbmd1bGFyKCkpIHJldHVybiAtMTtcclxuICAgICAgICAgICAgaWYgKCFhLnNpbmd1bGFyKCkgJiYgYi5zaW5ndWxhcigpKSByZXR1cm4gMTtcclxuICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmVvcmRlcmVkR3JvdXBzLmZvckVhY2goKGdyb3VwLGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHN0cmluZyArPSB3cmFwR3JvdXAoZ3JvdXAudG9TdHJpbmcoKSwgZ3JvdXAuc2luZ3VsYXIoKT9CcmFja2V0VHlwZS5Ob25lOkJyYWNrZXRUeXBlLlBhcmVudGhlc2VzKTtcclxuICAgICAgICAgICAgaWYgKHRvQWRkQ2RvdChncm91cCxyZW9yZGVyZWRHcm91cHNbaW5kZXgrMV0pKVxyXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICByZXR1cm4gc3RyaW5nLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKlxyXG4gICAgdGhpcy5ncm91cHMgPSBbWzEsIDIsIDNdLFs0LCA1LCA2XSxbNywgOCwgOV1dXHJcbiAgICBFeHBlY3RlZCBPdXRwdXQ6XHJcbiAgICBbXHJcbiAgICAgICAgMSo0LCAxKjUsIDEqNiwgMSo3LCAxKjgsIDEqOSxcclxuICAgICAgICAyKjQsIDIqNSwgMio2LCAyKjcsIDIqOCwgMio5LFxyXG4gICAgICAgIDMqNCwgMyo1LCAzKjYsIDMqNywgMyo4LCAzKjksXHJcbiAgICAgICAgNCo3LCA0KjgsIDQqOSxcclxuICAgICAgICA1KjcsIDUqOCwgNSo5LFxyXG4gICAgICAgIDYqNywgNio4LCA2KjlcclxuICAgIF0gIFxyXG4gICAgKi9cclxuICAgIHBhcnNlTWF0aGpheE9wZXJhdG9yKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG11bHRBcnI9dGhpcy5lbGltaW5hdEdyb3Vwc1dpdGhNdWx0aXBsZVRlcm1zKCkuZ2V0SXRlbXMoKTtcclxuICAgICAgICBjb25zdCBuYW1lPW11bHRBcnIubWFwKChvOiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKT0+IHtvLnBhcnNlKCk7cmV0dXJuIG8uc29sdXRpb259KVxyXG4gICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChuYW1lKTtcclxuICAgICAgICB0aGlzLnNvbHV0aW9uLmNvbWJpbmluZ0xpa2VUZXJtcygpO1xyXG4gICAgfVxyXG4gICAgZWxpbWluYXRHcm91cHNXaXRoTXVsdGlwbGVUZXJtcygpOk1hdGhHcm91cCB7XHJcbiAgICAgICAgbGV0IG9wZXJhdG9yc0FjY3VtdWxhdGlvbjogTXVsdGlwbGljYXRpb25PcGVyYXRvcltdID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3Qgc2luZ2xlVGVybUdyb3VwcyA9IHRoaXMuZ3JvdXBzLmZpbHRlcihncm91cCA9PiBncm91cC5zaW5ndWxhcigpKTtcclxuICAgICAgICBjb25zdCBtdWx0aVRlcm1Hcm91cHMgPSB0aGlzLmdyb3Vwcy5maWx0ZXIoZ3JvdXAgPT4gIWdyb3VwLnNpbmd1bGFyKCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHNpbmdsZXNNYXRoR3JvdXAgPSBzaW5nbGVUZXJtR3JvdXBzLmxlbmd0aCAhPT0gMCBcclxuICAgICAgICAgICAgPyBbbmV3IE1hdGhHcm91cChbbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3Ioc2luZ2xlVGVybUdyb3VwcyldKV0gXHJcbiAgICAgICAgICAgIDogW107XHJcbiAgICAgICAgbGV0IGdyb3VwcyA9IFsuLi5zaW5nbGVzTWF0aEdyb3VwLCAuLi5tdWx0aVRlcm1Hcm91cHNdO1xyXG4gICAgXHJcbiAgICAgICAgd2hpbGUgKGdyb3Vwcy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQSA9IGdyb3Vwcy5zaGlmdCgpO1xyXG4gICAgICAgICAgICBjb25zdCBncm91cEIgPSBncm91cHMuc2hpZnQoKTtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoIWdyb3VwQSB8fCAhZ3JvdXBCKSBicmVhaztcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBncm91cEFJdGVtcyA9IGdyb3VwQS5nZXRJdGVtcygpO1xyXG4gICAgICAgICAgICBjb25zdCBncm91cEJJdGVtcyA9IGdyb3VwQi5nZXRJdGVtcygpO1xyXG4gICAgICAgICAgICBvcGVyYXRvcnNBY2N1bXVsYXRpb24gPSBbXTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBhIG9mIGdyb3VwQUl0ZW1zKSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGIgb2YgZ3JvdXBCSXRlbXMpIHtcclxuICAgICAgICAgICAgICAgICAgICBvcGVyYXRvcnNBY2N1bXVsYXRpb24ucHVzaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhPcGVyYXRvcihbYS5jbG9uZSgpLCBiLmNsb25lKCldKSlcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgZ3JvdXBzLnVuc2hpZnQobmV3IE1hdGhHcm91cChvcGVyYXRvcnNBY2N1bXVsYXRpb24pKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGdyb3Vwc1swXTtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHBhcnNlKCl7XHJcbiAgICAgICAgY29uc3QgeyBudW1iZXJzLCBvdGhlciB9ID0gdGhpcy5ncm91cHMucmVkdWNlKChyZXN1bHQ6IHsgbnVtYmVyczogTWF0aEdyb3VwW107IG90aGVyOiBNYXRoR3JvdXBbXSB9LCBpdGVtOiBNYXRoR3JvdXApID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLnNpbmdsZU51bWJlcigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lm51bWJlcnMucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lm90aGVyLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7IG51bWJlcnM6IFtdLCBvdGhlcjogW10gfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgbGV0IHZhbHVlPTE7XHJcbiAgICAgICAgbnVtYmVycy5mb3JFYWNoKGdyb3VwID0+IHtcclxuICAgICAgICAgICAgdmFsdWUqPShncm91cC5nZXRJdGVtcygpWzBdYXMgVG9rZW4pLmdldE51bWJlclZhbHVlKClcclxuICAgICAgICB9KTtcclxuICAgICAgICBpZih0aGlzLmdyb3Vwcy5sZW5ndGg9PT0wKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcIik7XHJcbiAgICAgICAgaWYoKG51bWJlcnMubGVuZ3RoPjAmJm90aGVyLmxlbmd0aD09PTApfHx2YWx1ZT09PTApe1xyXG4gICAgICAgICAgICB0aGlzLnNvbHV0aW9uPW5ldyBNYXRoR3JvdXAobmV3IFRva2VuKHZhbHVlKSk7cmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCB0ZXN0PShtYWluR3JvdXA6IGFueSwgdGVzdEdyb3VwOiBhbnkpPT57XHJcbiAgICAgICAgICAgIGlmKG1haW5Hcm91cCBpbnN0YW5jZW9mIE1hdGhHcm91cCYmdGVzdEdyb3VwIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiBtYWluR3JvdXAuaXNQb3dHcm91cE1hdGNoKHRlc3RHcm91cClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGZpbHRlcmVkPWZpbHRlckJ5VGVzdENvbnN0KG90aGVyLHRlc3QpO1xyXG4gICAgICAgIGNvbnN0IGFycj1bLi4uZmlsdGVyZWRdO1xyXG4gICAgICAgIGlmKHZhbHVlIT09MSlcclxuICAgICAgICAgICAgYXJyLnB1c2gobmV3IFRva2VuKHZhbHVlKSk7XHJcblxyXG4gICAgICAgIGlmKGFyci5sZW5ndGg+MSl7XHJcbiAgICAgICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChbbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhPcGVyYXRvcihhcnIpKV0pO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChhcnJbMF0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBhKGdyb3VwczogTWF0aEdyb3VwW10pe1xyXG4gICAgY29uc3QgYXJlQWxsR3JvdXBzU2luZ3VsYXI9Z3JvdXBzLmV2ZXJ5KGc9Pmcuc2luZ3VsYXIoKSlcclxuICAgIGxldCB2YWx1ZT0wO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZmlsdGVyQnlUZXN0Q29uc3QoXHJcbiAgICBpdGVtczogYW55W10sXHJcbiAgICB0ZXN0OiAobWFpbkl0ZW06IGFueSwgdGVzdEl0ZW06IGFueSkgPT4gYm9vbGVhblxyXG4pOiBhbnlbXSB7XHJcbiAgICBsZXQgaW5kZXggPSAwO1xyXG4gICAgd2hpbGUgKGluZGV4IDwgaXRlbXMubGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgbWFpbkl0ZW0gPSBpdGVtc1tpbmRleF07XHJcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxMZW5ndGggPSBpdGVtcy5sZW5ndGg7XHJcblxyXG4gICAgICAgIGl0ZW1zID0gaXRlbXMuZmlsdGVyKChvdGhlckl0ZW0sIG90aGVySW5kZXgpID0+IHtcclxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSBvdGhlckluZGV4KSByZXR1cm4gdHJ1ZTsgLy8gS2VlcCBjdXJyZW50IGl0ZW1cclxuICAgICAgICAgICAgY29uc3QgdGVtcD0hdGVzdChtYWluSXRlbSwgb3RoZXJJdGVtKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRlbXBcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVzdGFydCBpdGVyYXRpb24gaWYgaXRlbXMgd2VyZSByZW1vdmVkXHJcbiAgICAgICAgaWYgKGl0ZW1zLmxlbmd0aCA8IG9yaWdpbmFsTGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGluZGV4ID0gMDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBpdGVtcztcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHRyaWdvbm9tZXRyaWNJZGVudGl0aWVzKCl7XHJcblxyXG59XHJcblxyXG5leHBvcnQgdHlwZSBNYXRoR3JvdXBJdGVtPVRva2VufE1hdGhKYXhPcGVyYXRvclxyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGhHcm91cCB7XHJcbiAgICBwcml2YXRlIGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10gPSBbXTtcclxuICAgIC8vb3ZlcnZpZXc6IE1hdGhPdmVydmlld1xyXG4gICAgXHJcbiAgICBjb25zdHJ1Y3RvcihpdGVtcz86IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pIHtcclxuICAgICAgICBpZihpdGVtcyl0aGlzLnNldEl0ZW1zKGl0ZW1zKTtcclxuICAgIH1cclxuICAgIGdldEl0ZW1zKCk6IE1hdGhHcm91cEl0ZW1bXSB7cmV0dXJuIHRoaXMuaXRlbXM7fVxyXG4gICAgc2V0SXRlbShpdGVtOiBNYXRoR3JvdXBJdGVtLGluZGV4Om51bWJlcil7XHJcbiAgICAgICAgdGhpcy5pdGVtc1tpbmRleF09aXRlbTtcclxuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KClcclxuICAgIH1cclxuICAgIHJlcGxhY2VJdGVtQ2VsbChpdGVtOiBNYXRoR3JvdXBJdGVtfE1hdGhHcm91cCxpbmRleDpudW1iZXIpe1xyXG4gICAgICAgIHRoaXMuaXRlbXMuc3BsaWNlKGluZGV4LDEsLi4uZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW0pKVxyXG4gICAgfVxyXG4gICAgc2V0SXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pIHtcclxuICAgICAgICB0aGlzLml0ZW1zID0gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW1zKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KCkgICAgXHJcbiAgICB9XHJcbiAgICBncm91cFZhcmlhYmxlcygpOiBzdHJpbmdbXSB7XHJcbiAgICAgICAgY29uc3QgdmFyaWFibGVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuICYmIGl0ZW0uaXNWYXIoKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5nZXRTdHJpbmdWYWx1ZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF2YXJpYWJsZXMuY29udGFpbnMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlcy5wdXNoKGtleSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gdmFyaWFibGVzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB1cGRhdGVPdmVydmlldygpey8qXHJcbiAgICAgICAgdGhpcy5vdmVydmlldz1uZXcgTWF0aE92ZXJ2aWV3KClcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3c2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcykqL1xyXG4gICAgfVxyXG4gICAgc2luZ2xlVG9rZW5TZXQodmFsdWU6IG51bWJlcix0b0FkZD86IGJvb2xlYW4pe1xyXG4gICAgICAgIGNvbnN0IHRva2VuPXRoaXMuaXRlbXNbMF0gYXMgVG9rZW47XHJcbiAgICAgICAgY29uc3QgbmV3VmFsdWU9dG9BZGQ/dmFsdWUrdG9rZW4uZ2V0TnVtYmVyVmFsdWUoKTp2YWx1ZTtcclxuICAgICAgICBpZih0aGlzLnNpbmd1bGVUb2tlbigpKXtcclxuICAgICAgICAgICAgdG9rZW4uc2V0VmFsdWUobmV3VmFsdWUpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgY2xvbmUoKTogTWF0aEdyb3VwIHtcclxuICAgICAgICByZXR1cm4gbmV3IE1hdGhHcm91cCh0aGlzLml0ZW1zLm1hcChpdGVtPT5pdGVtLmNsb25lKCkpKTtcclxuICAgIH1cclxuXHJcbiAgICBoYXNPcGVyYXRvcigpOiB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKTt9XHJcbiAgICBkb2VzbnRIYXZlT3BlcmF0b3IoKTogIHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiAhdGhpcy5oYXNPcGVyYXRvcigpO31cclxuICAgIHNpbmdsZU51bWJlcigpe3JldHVybiB0aGlzLnNpbmd1bGFyKCkmJnRoaXMubnVtYmVyT25seSgpfVxyXG4gICAgbnVtYmVyT25seSgpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5ldmVyeSh0ID0+ICh0IGluc3RhbmNlb2YgVG9rZW4mJiF0LmlzVmFyKCkpKTt9XHJcbiAgICBoYXNWYXJpYWJsZXMoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSh0ID0+IHQgaW5zdGFuY2VvZiBUb2tlbiYmdC5pc1ZhcigpKTt9XHJcblxyXG4gICAgc2luZ3VsYXIoKTpib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGggPT09IDEgJiYgdGhpcy5pdGVtc1swXSAhPT0gdW5kZWZpbmVkO31cclxuICAgIHNpbmd1bGVUb2tlbigpOiB0aGlzIGlzIHsgaXRlbXM6IFtUb2tlbl0gfSB7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSAmJiB0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW47fVxyXG4gICAgaXNPcGVyYWJsZSgpe3JldHVybiB0cnVlfVxyXG5cclxuICAgIGdldE9wZXJhYmxlVmFsdWUoKTogbnVtYmVyIHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5pdGVtcztcclxuICAgICAgICBpZiAodGhpcy5udW1iZXJPbmx5KCkpIHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlPTA7XHJcbiAgICAgICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW06IFRva2VuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBpdGVtLmdldE51bWJlclZhbHVlKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgaXNTaW5nbGVWYXIoKXtcclxuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdYXMgVG9rZW5cclxuICAgICAgICByZXR1cm4gdGhpcy5zaW5ndWxlVG9rZW4oKSYmdG9rZW4uaXNWYXIoKVxyXG4gICAgfVxyXG4gICAgZ2V0U2luZ2xlVmFyKCl7XHJcbiAgICAgICAgaWYoIXRoaXMuaXNTaW5nbGVWYXIoKSlyZXR1cm4gbnVsbDtcclxuICAgICAgICByZXR1cm4gKHRoaXMuaXRlbXNbMF1hcyBUb2tlbikuZ2V0U3RyaW5nVmFsdWUoKTtcclxuICAgIH1cclxuXHJcbiAgICBpc1Bvd0dyb3VwTWF0Y2goZ3JvdXA6IE1hdGhHcm91cCk6Ym9vbGVhbntcclxuICAgICAgICBpZih0aGlzLml0ZW1zLmxlbmd0aCE9PTEpcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgaWYodGhpcy5pc1NpbmdsZVZhcigpJiZncm91cC5pc1NpbmdsZVZhcigpJiZ0aGlzLmVxdWFscyhncm91cCkpe1xyXG4gICAgICAgICAgICB0aGlzLml0ZW1zPVtNYXRoSmF4T3BlcmF0b3IuY3JlYXRlKFwiUG93ZXJcIiwyLFtuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXNbMF0pLG5ldyBNYXRoR3JvdXAobmV3IFRva2VuKDIpKV0pXVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMoZ3JvdXApXHJcbiAgICB9XHJcblxyXG4gICAgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlcjogTWF0aEdyb3VwKXtcclxuICAgICAgICBjb25zdCBib3RoU2luZ3VsYXI9dGhpcy5zaW5ndWxhcigpJiZvdGhlci5zaW5ndWxhcigpXHJcbiAgICAgICAgY29uc3QgZmlyc3RJdGVtTWF0aEpheG9PZXJhdG9yPXRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3ImJm90aGVyLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3JcclxuICAgICAgICBpZighYm90aFNpbmd1bGFyJiYhZmlyc3RJdGVtTWF0aEpheG9PZXJhdG9yKXJldHVybiBmYWxzZTtcclxuICAgICAgICBjb25zdCBhPSh0aGlzLml0ZW1zWzBdYXMgTWF0aEpheE9wZXJhdG9yKS5pc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVyLmdldEl0ZW1zKClbMF0pXHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMob3RoZXIpXHJcbiAgICB9XHJcblxyXG4gICAgZXF1YWxzKGl0ZW06IFRva2VufE1hdGhKYXhPcGVyYXRvcnxNYXRoR3JvdXApe1xyXG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbil7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy5pdGVtc1swXS5lcXVhbHMoaXRlbSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3Ipe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT0xJiZ0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yJiZ0aGlzLml0ZW1zWzBdLmVxdWFscyhpdGVtKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09aXRlbS5pdGVtcy5sZW5ndGgmJnRoaXMuaXRlbXMuZXZlcnkoKHQ6IE1hdGhHcm91cEl0ZW0pPT57XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5pdGVtcy5zb21lKChpKT0+dC5lcXVhbHMoaSkpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJZCgpe1xyXG4gICAgICAgIHJldHVybiAnTWF0aEdyb3VwJ1xyXG4gICAgfVxyXG4gICAgY29tYmluaW5nTGlrZVRlcm1zKCkge1xyXG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3ID0gbmV3IE1hdGhPdmVydmlldygpO1xyXG4gICAgICAgIG92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcyk7XHJcbiAgICAgICAgdGhpcy5zZXRJdGVtcyhvdmVydmlldy5yZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKSk7XHJcbiAgICAgICAgbGV0IGluZGV4ID0gMDtcclxuICAgICAgICB3aGlsZSAoaW5kZXggPCB0aGlzLml0ZW1zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpbmRleF07XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxMZW5ndGggPSB0aGlzLml0ZW1zLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXRlbXMgPSB0aGlzLml0ZW1zLmZpbHRlcigob3RoZXJJdGVtOiBNYXRoR3JvdXBJdGVtLCBvdGhlckluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2ggPSBpdGVtLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2gob3RoZXJJdGVtKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWlzTWF0Y2g7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLml0ZW1zLmxlbmd0aCA8IG9yaWdpbmFsTGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJztcclxuICAgICAgICBpZighQXJyYXkuaXNBcnJheSh0aGlzLml0ZW1zKSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW1zIHRvIGJlIGFuIGFycmF5IGJ1dCByZWNlaXZlZDogXCIrdGhpcy5pdGVtcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgc3RyaW5nKz1zaG91bGRBZGRQbHVzKHRoaXMuaXRlbXNbaW5kZXgtMV0saXRlbSlcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXAgJiYgIWl0ZW0uc2luZ3VsYXIoKSkge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IGAoJHtpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcil9KWA7XHJcbiAgICAgICAgICAgIH0gIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IGl0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKTtcclxuICAgICAgICAgICAgfSBpZiAoY3VzdG9tRm9ybWF0dGVyKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgPSBjdXN0b21Gb3JtYXR0ZXIoaXRlbSxzdHJpbmcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZztcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyBNYXRoT3ZlcnZpZXcge1xyXG4gICAgcHJpdmF0ZSB2YXJpYWJsZXM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBwcml2YXRlIG9wZXJhdG9yczogTWFwPHN0cmluZywgYW55PjtcclxuICAgIHByaXZhdGUgbnVtYmVyOiBudW1iZXI7XHJcbiAgICBnZXROdW1iZXIoKTogbnVtYmVye3JldHVybiB0aGlzLm51bWJlcjt9XHJcbiAgICBnZXRWYXJpYWJsZXMoKTogTWFwPHN0cmluZywgYW55PntyZXR1cm4gdGhpcy52YXJpYWJsZXM7fVxyXG4gICAgZ2V0T3BlcmF0b3JzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMub3BlcmF0b3JzO31cclxuICAgIGNvbnN0cnVjdG9yKHZhcmlhYmxlcz86IE1hcDxzdHJpbmcsIGFueT4sb3BlcmF0b3JzPzogTWFwPHN0cmluZywgYW55PixudW1iZXI/OiBudW1iZXIpe1xyXG4gICAgICAgIGlmKHZhcmlhYmxlcyl0aGlzLnZhcmlhYmxlcz12YXJpYWJsZXM7XHJcbiAgICAgICAgaWYob3BlcmF0b3JzKXRoaXMub3BlcmF0b3JzPW9wZXJhdG9ycztcclxuICAgICAgICBpZihudW1iZXIpdGhpcy5udW1iZXI9bnVtYmVyO1xyXG4gICAgfVxyXG4gICAgZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyhpdGVtczogTWF0aEdyb3VwSXRlbVtdKSB7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXM9bmV3IE1hcCgpO1xyXG4gICAgICAgIHRoaXMub3BlcmF0b3JzPW5ldyBNYXAoKTtcclxuICAgICAgICBpdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZpdGVtLmlzVmFyKCk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVWYXJpYWJsZXNNYXAoaXRlbS5nZXRTdHJpbmdWYWx1ZSgpKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIFRva2VuJiYhaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlTXVtYmVyKGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3I6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVPcGVyYXRvcnNNYXAoaXRlbSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gY2F0ZWdvcnkgaW4gTWF0aE92ZXJ2aWV3IHNlcGFyYXRlSW50b0luZGl2aWR1YWxzXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfVxyXG4gICAgdXBkYXRlTXVtYmVyKG51bWJlcjogbnVtYmVyKXsgdGhpcy5udW1iZXI9dGhpcy5udW1iZXI/dGhpcy5udW1iZXIrbnVtYmVyOm51bWJlcjt9XHJcbiAgICB1cGRhdGVWYXJpYWJsZXNNYXAoa2V5OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzID8/PSBuZXcgTWFwPHN0cmluZywgeyBjb3VudDogbnVtYmVyOyBpdGVtczogYW55W10gfT4oKTtcclxuICAgICAgICBpZighdGhpcy52YXJpYWJsZXMuaGFzKGtleSkpe3RoaXMudmFyaWFibGVzLnNldChrZXkse2NvdW50OiAwfSl9XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZ2V0KGtleSkuY291bnQrKztcclxuICAgIH1cclxuICAgIHVwZGF0ZU9wZXJhdG9yc01hcChvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcclxuICAgICAgICBjb25zdCBrZXk9b3BlcmF0b3Iub3BlcmF0b3I7XHJcbiAgICAgICAgaWYoIXRoaXMub3BlcmF0b3JzKSB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XHJcbiAgICAgICAgaWYoIXRoaXMub3BlcmF0b3JzLmhhcyhrZXkpKXt0aGlzLm9wZXJhdG9ycy5zZXQoa2V5LHtjb3VudDogMCwgaXRlbXM6IFtdfSl9XHJcbiAgICAgICAgY29uc3QgZW50cnkgPSB0aGlzLm9wZXJhdG9ycy5nZXQoa2V5KSE7XHJcbiAgICAgICAgZW50cnkuY291bnQgKz0gMTtcclxuICAgICAgICBlbnRyeS5pdGVtcy5wdXNoKG9wZXJhdG9yKTtcclxuICAgIH1cclxuXHJcbiAgICBoYXNWYXIoKXtyZXR1cm4gdGhpcy52YXJpYWJsZXMmJnRoaXMudmFyaWFibGVzLnNpemU+MH1cclxuICAgIGhhc09wKCl7cmV0dXJuIHRoaXMub3BlcmF0b3JzJiZ0aGlzLm9wZXJhdG9ycy5zaXplPjB9XHJcbiAgICBvbmx5TnVtZXJpYygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLm51bWJlciYmIXRoaXMuaGFzVmFyKCkmJiF0aGlzLmhhc09wKClcclxuICAgIH1cclxuICAgIHJlY29uc3RydWN0QXNNYXRoR3JvdXBJdGVtcygpe1xyXG4gICAgICAgIGNvbnN0IGl0ZW1zOiBNYXRoR3JvdXBJdGVtW109W107XHJcbiAgICAgICAgaWYodGhpcy5udW1iZXIpaXRlbXMucHVzaChuZXcgVG9rZW4odGhpcy5udW1iZXIpKTtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKHZhbHVlLmNvdW50PT09MSl7XHJcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKG5ldyBUb2tlbihrZXkpKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYodmFsdWUuY291bnQ+MSl7XHJcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKE11bHRpcGxpY2F0aW9uT3BlcmF0b3IuYXNPY2N1cnJlbmNlR3JvdXAodmFsdWUuY291bnQsa2V5KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmKHRoaXMub3BlcmF0b3JzKXtcclxuICAgICAgICAgICAgaXRlbXMucHVzaCguLi5BcnJheS5mcm9tKHRoaXMub3BlcmF0b3JzLnZhbHVlcygpKS5mbGF0TWFwKChvcGVyYXRvcjogYW55KSA9PiBvcGVyYXRvci5pdGVtcykpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBpdGVtcztcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgVG9rZW57XHJcbiAgICBwcml2YXRlIHZhbHVlOiBudW1iZXJ8c3RyaW5nO1xyXG4gICAgY29uc3RydWN0b3IodmFsdWU6bnVtYmVyfHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgIH1cclxuICAgIGdldE51bWJlclZhbHVlKCk6bnVtYmVye3JldHVybiAodGhpcy52YWx1ZSBhcyBudW1iZXIpfVxyXG4gICAgZ2V0U3RyaW5nVmFsdWUoKTpzdHJpbmd7cmV0dXJuICh0aGlzLnZhbHVlIGFzIHN0cmluZyl9XHJcbiAgICBnZXRWYWx1ZSgpe3JldHVybiB0aGlzLnZhbHVlfVxyXG4gICAgc2V0VmFsdWUodmFsdWU6IG51bWJlcnxzdHJpbmcpe3RoaXMudmFsdWU9dmFsdWU7fVxyXG4gICAgaXNWYXIoKSB7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlID09PSAnc3RyaW5nJzt9XHJcbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSkge1xyXG4gICAgICAgIHJldHVybiBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJnRoaXMudmFsdWUgPT09IGl0ZW0udmFsdWU7XHJcbiAgICB9XHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnXHJcbiAgICAgICAgaWYoIXRoaXMuaXNWYXIoKSYmdGhpcy5nZXROdW1iZXJWYWx1ZSgpPDApXHJcbiAgICAgICAgICAgIHN0cmluZys9Jy0nO1xyXG4gICAgICAgIHN0cmluZys9dGhpcy52YWx1ZTtcclxuICAgICAgICBpZihjdXN0b21Gb3JtYXR0ZXIpe1xyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc3RyaW5nO1xyXG4gICAgfVxyXG4gICAgY2xvbmUoKXtyZXR1cm4gbmV3IFRva2VuKHRoaXMudmFsdWUpfVxyXG59XHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbnN7XHJcbiAgICB0b2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPj1bXTtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IodG9rZW5zPzogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+KXtcclxuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnN8fFtdO1xyXG4gICAgfVxyXG4gICAgYWRkSW5wdXQobWF0aDogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUobWF0aDogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcygpKVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKHJlZ0V4cCgnXicgKyBvcGVyYXRvcnMpKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goQmFzaWNNYXRoSmF4VG9rZW4uY3JlYXRlKG1hdGNoWzBdKSk7XHJcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKVxyXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goQmFzaWNNYXRoSmF4VG9rZW4uY3JlYXRlKHBhcnNlRmxvYXQobWF0Y2hbMF0pKSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvL0FkZCBwbHVzIHRvIG1ha2UgaXQgbXVsdGlwbGUgTGV0dGVycy5cclxuICAgICAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0oX1xcKFthLXpBLVowLTldKlxcKSkqLylcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKEJhc2ljTWF0aEpheFRva2VuLmNyZWF0ZShtYXRjaFswXSkpXHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcclxuICAgICAgICB9XHJcbiAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICAgdGhpcy50b2tlbnM9aWRQYXJlbnRoZXNlcyh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxyXG5cclxuICAgICAgICBwYXJlbk1hcC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYiAtIGEpXHJcbiAgICAgICAgLmZvckVhY2goKHZhbHVlOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHZhbHVlLCAwLCBuZXcgIEJhc2ljTWF0aEpheFRva2VuKCdvcGVyYXRvcicsJyonKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKVxyXG4gICAgfVxyXG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpIHtcclxuICAgICAgICBjb25zdCBpc0FCYXNpY01hdGhKYXhUb2tlbkRvdWJsZVJpZ2h0T3A9KHRva2VuPzogYW55KT0+e1xyXG4gICAgICAgICAgICBpZih0b2tlbiYmdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbil7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXModG9rZW4uZ2V0U3RyaW5nVmFsdWUoKSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8qKlxyXG4gICAgICAgICAqIFxyXG4gICAgICAgICAqIEBwYXJhbSBpbmRleCBcclxuICAgICAgICAgKiBAcmV0dXJucyBib29sYW4gPT4gVHJ1ZSBpZiB0aGFyIGlzbid0IGEgZG91YmxlUmlnaHQgb3BlcmF0b3IuXHJcbiAgICAgICAgICovXHJcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpfHwhKHRoaXMudG9rZW5zW2luZGV4XSBpbnN0YW5jZW9mIFBhcmVuKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBpZHggPSBmaW5kUGFyZW5JbmRleChpbmRleCx0aGlzLnRva2Vucyk/Lm9wZW47XHJcbiAgICAgICAgICAgIGlmIChpZHggPT0gbnVsbCB8fCBwYXJlblN0YXRlKHRoaXMudG9rZW5zW2luZGV4ICsgMV0pKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbaWR4IC0gMV07XHJcbiAgICAgICAgICAgIHJldHVybiAhaXNBQmFzaWNNYXRoSmF4VG9rZW5Eb3VibGVSaWdodE9wKHByZXZUb2tlbilcclxuICAgICAgICB9O1xyXG5cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy50b2tlbnNbaW5kZXhdO1xyXG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJiB0b2tlbi5pc1ZhbHVlVG9rZW4oKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb249KHRva2VuOiBhbnkpPT57XHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0eXBlb2YgdG9rZW4uZ2V0VmFsdWUoKT09PSdzdHJpbmcnJiZoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLmdldFN0cmluZ1ZhbHVlKCkpXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBpc1Zhcj0odG9rZW46IGFueSk9PntyZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJnRva2VuLmdldFR5cGUoKT09PSd2YXJpYWJsZSd9XHJcblxyXG4gICAgICAgIGNvbnN0IHByZWNlZGVzVmFyaWFibGUgPSAodG9rZW5zOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gaW5kZXg+MCYmaXNWYXIodG9rZW5zW2luZGV4XSlcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGZvbGxvd3NWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBpbmRleDx0b2tlbnMubGVuZ3RoLTEmJmlzVmFyKHRva2Vuc1tpbmRleF0pXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChpbmRleD4wJiYocGFyZW5TdGF0ZSh0b2tlbix0cnVlKXx8IGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbil8fHByZWNlZGVzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCAtIDEpID8gaW5kZXggOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtMSYmKHBhcmVuU3RhdGUodG9rZW4sKXx8Zm9sbG93c1ZhcmlhYmxlKHRoaXMudG9rZW5zLGluZGV4KSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggKyAxKSB8fCB0ZXN0RG91YmxlUmlnaHQoaW5kZXgpID8gaW5kZXggKyAxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICByZXR1cm4gbWFwO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgdmFsaWRhdGVQbHVzTWludXMoKXtcclxuICAgICAgICAvLyBQbHVzZXMgYXJlIHNlcGFyYXRvcnMuVGhlcmVmb3JlLCB0aGV5IGRvIG5vdCBuZWVkIHRvIGJlIGhlcmUgQXMgdGhlIGV4cHJlc3Npb24gaXMgdG9rZW5bXVxyXG4gICAgICAgIC8vTWludXNlcyBvbiB0aGUgb3RoZXIgaGFuZC5jYW4gZWl0aGVyIGJlIGEgc2VwYXJhdG9yLiBPciBhIG5lZ2F0aXZlIHNpZ25cclxuICAgICAgICBjb25zdCBwbHVzTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VufFBhcmVuLCBpbmRleDogYW55KSA9PiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0b2tlbi5nZXRWYWx1ZSgpID09PSAnQWRkaXRpb24nP2luZGV4IDogbnVsbCkuZmlsdGVyKChpbmRleDogbnVtYmVyIHwgbnVsbCkgPT4gaW5kZXggIT09IG51bGwpXHJcbiAgICAgICAgcGx1c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBtaW51c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbnxQYXJlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiYmdG9rZW4uZ2V0VmFsdWUoKSA9PT0gJ1N1YnRyYWN0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxyXG4gICAgICAgIFxyXG4gICAgICAgIG1pbnVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRUb2tlbiA9IHRoaXMudG9rZW5zW2luZGV4ICsgMV07XHJcbiAgICAgICAgICAgIGlmIChuZXh0VG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJiB0eXBlb2YgbmV4dFRva2VuLmdldFZhbHVlKCkgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgICBuZXh0VG9rZW4uc2V0VmFsdWUobmV4dFRva2VuLmdldE51bWJlclZhbHVlKCkgKiAtMSlcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgdmFsaWRhdGVJbmRleChpbmRleDogbnVtYmVyLG1hcmdpbj86IG51bWJlcil7XHJcbiAgICAgICAgbWFyZ2luPW1hcmdpbnx8MDtcclxuICAgICAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtbWFyZ2luO1xyXG4gICAgfVxyXG4gICAgY2xvbmUoKTogQmFzaWNNYXRoSmF4VG9rZW5zIHtcclxuICAgICAgICByZXR1cm4gbmV3IEJhc2ljTWF0aEpheFRva2Vucyh0aGlzLnRva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uY2xvbmUoKSkpO1xyXG4gICAgfVxyXG4gICAgLypcclxuICAgIFxyXG4gICAgXHJcbiAgICBtYXBQYXJlbkluZGV4ZXMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbjogYW55LCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4KSA6IG51bGwpXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgIH1cclxuXHJcbiAgICBmaWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFsKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW06IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeyBvcGVuOiBvcGVuSW5kZXgsIGNsb3NlOiBjbG9zZUluZGV4IH0gPSBpdGVtO1xyXG4gICAgICAgICAgICAgICAgaWYgKG9wZW5JbmRleCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodGhpcy50b2tlbnNbb3BlbkluZGV4IC0gMV0/LnR5cGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoY2xvc2VJbmRleCA8IHRoaXMudG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdPy5pc1ZhbHVlVG9rZW4oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH0pLmZsYXRNYXAoKGl0ZW06IGFueSkgPT4gW2l0ZW0ub3BlbiwgaXRlbS5jbG9zZV0pO1xyXG4gICAgfSAgICBcclxuICAgIFxyXG4gICAgXHJcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cclxuICAgICAgICAgICAgICAgICgodG9rZW5zW2luZGV4ICsgMl0/LnR5cGUgIT09IFwib3BlcmF0b3JcIiYmdG9rZW5zW2luZGV4IC0xXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiKVxyXG4gICAgICAgICAgICAgICAgJiYodGhpcy50b2tlbkNvbXBhcmUoXCJ0eXBlXCIsdGhpcy52YWx1ZVRva2VucygpLCB0b2tlbiwgdG9rZW5zW2luZGV4ICsgMV0pKVxyXG4gICAgICAgICkpO1xyXG4gICAgIH1cclxuICAgIFxyXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZnR5Z3ViaG5pbXBvXCIpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBtYXAgPSBuZXcgU2V0KHRoaXMuZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpKTtcclxuICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigoXzogYW55LCBpZHg6IHVua25vd24pID0+ICFtYXAuaGFzKGlkeCkpO1xyXG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXHJcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCArIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgbnVtTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSdudW1iZXInJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGFyciA9IFtcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXModmFyTWFwKSwgXHJcbiAgICAgICAgXTtcclxuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcclxuICAgICAgICBcclxuICAgICAgICBpZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxyXG4gICAgfVxyXG5cclxuICAgIFxyXG5cclxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcclxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcclxuICAgICAgICAgICAgJiYgIXRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09IFwiPVwiKVxyXG4gICAgICAgIClcclxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxyXG4gICAgfVxyXG5cclxuICAgIGluc2VydFRva2VucyhzdGFydDogYW55LCBsZW5ndGg6IG51bWJlciwgb2JqZWN0czogYW55W10gfCBUb2tlbikge1xyXG4gICAgICAgIG9iamVjdHMgPSBmbGF0dGVuQXJyYXkob2JqZWN0cyk7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG5cclxuICAgIGluZGV4ZXNUb0FkZFBsdXModG9rZW5zOiBhbnlbXSl7XHJcbiAgICAgICAgcmV0dXJuIHRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+aW5kZXg+MFxyXG4gICAgICAgICAgICAmJnRva2Vuc1tpbmRleCAtIDFdPy5pc1ZhbHVlVG9rZW4oKVxyXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxyXG4gICAgICAgICkuZmlsdGVyKGl0ZW09Pml0ZW0hPT1udWxsKVxyXG4gICAgfVxyXG5cclxuICAgIHRva2VuQ29tcGFyZShjb21wYXJlOiBzdHJpbmcgfCBudW1iZXIsIHZhbHVlOiBzdHJpbmd8UmVnRXhwLCB0b2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9LCBuZXh0VG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSkge1xyXG4gICAgICAgIGNvbnN0IHJlZ0V4cHZhbHVlID0gKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSA/IHZhbHVlIDogbmV3IFJlZ0V4cCh2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgKHZhbHVlID09PSBudWxsIHx8IHJlZ0V4cHZhbHVlLnRlc3QodG9rZW5bY29tcGFyZV0pKSAmJlxyXG4gICAgICAgICAgICB0b2tlbltjb21wYXJlXSA9PT0gbmV4dFRva2VuPy5bY29tcGFyZV1cclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgKi9cclxufSJdfQ==