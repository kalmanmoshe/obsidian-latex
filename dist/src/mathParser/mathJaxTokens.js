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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBK0IsV0FBVyxFQUFtRSxNQUFNLHFDQUFxQyxDQUFDO0FBRWhLLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxVQUFVLEdBQUksTUFBTSx3QkFBd0IsQ0FBQztBQUMzRixPQUFPLEVBQUUsdUJBQXVCLEVBQWlDLDJCQUEyQixFQUFFLHVCQUF1QixFQUFFLHlCQUF5QixFQUFvRSxzQkFBc0IsRUFBaUIsTUFBTSwyQkFBMkIsQ0FBQztBQUU3UixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRzdDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRW5ELFNBQVMsU0FBUyxDQUFDLEtBQWEsRUFBRSxJQUFpQjtJQUMvQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ1gsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEIsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEI7WUFDSSxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FDOUIsU0FBYyxFQUNkLFNBQWlDLEVBQ2pDLE9BQTRCLEVBQUU7SUFFOUIsNERBQTREO0lBQzVELElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG1FQUFtRTtJ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QUFDLENBQUE7Z0JBQ25ELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNqQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDVCxDQUFDO0lBQ0QsYUFBYSxDQUFDLEtBQWEsRUFBQyxNQUFlO1FBQ3ZDLE1BQU0sR0FBQyxNQUFNLElBQUUsQ0FBQyxDQUFDO1FBQ2pCLE9BQU8sS0FBSyxJQUFFLENBQUMsR0FBQyxNQUFNLElBQUUsS0FBSyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFDLE1BQU0sQ0FBQztJQUM1RCxDQUFDO0lBQ0QsS0FBSztRQUNELE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0UsQ0FBQztDQXFHSiIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi9pbVZlcnlMYXp5XCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgQXNzb2NpYXRpdml0eSwgQnJhY2tldFN0YXRlLCBCcmFja2V0VHlwZSwgTWF0aEpheE9wZXJhdG9yTWV0YWRhdGEsIG1hdGhKYXhPcGVyYXRvcnNNZXRhZGF0YSwgT3BlcmF0b3JUeXBlIH0gZnJvbSBcInNyYy9zdGF0aWNEYXRhL21hdGhQYXJzZXJTdGF0aWNEYXRhXCI7XHJcblxyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgcGFyZW5TdGF0ZSwgIH0gZnJvbSBcIi4uL3V0aWxzL1BhcmVuVXRlbnNpbHNcIjtcclxuaW1wb3J0IHsgZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHksIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlLCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBpc09wZXJhdG9yV2l0aEFzc29jaWF0aXZpdHksIHNlYXJjaEFsbE1hdGhKYXhPcGVyYXRvcnNBbmRTeW1ib2xzLCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzLCBzZWFyY2hTeW1ib2xzIH0gZnJvbSBcIi4uL3N0YXRpY0RhdGEvZGF0YU1hbmFnZXJcIjtcclxuXHJcbmltcG9ydCB7IHBhcnNlT3BlcmF0b3IgfSBmcm9tIFwiLi9tYXRoRW5naW5lXCI7XHJcbmltcG9ydCB7IGl0IH0gZnJvbSBcIm5vZGU6dGVzdFwiO1xyXG5pbXBvcnQgeyBzaWduYWwgfSBmcm9tIFwiY29kZW1pcnJvclwiO1xyXG5pbXBvcnQgeyBCYXNpY01hdGhKYXhUb2tlbiB9IGZyb20gXCJzcmMvYmFzaWNUb2tlblwiO1xyXG5cclxuZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBzdHJpbmcsIHdyYXA6IEJyYWNrZXRUeXBlKTogc3RyaW5nIHtcclxuICAgIHN3aXRjaCAod3JhcCkge1xyXG4gICAgICAgIGNhc2UgQnJhY2tldFR5cGUuUGFyZW50aGVzZXM6XHJcbiAgICAgICAgICAgIHJldHVybiBgKCR7Z3JvdXB9KWA7XHJcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5DdXJseUJyYWNlczpcclxuICAgICAgICAgICAgcmV0dXJuIGB7JHtncm91cH19YDtcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICByZXR1cm4gZ3JvdXA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkZWVwU2VhcmNoV2l0aFBhdGgoXHJcbiAgICBzdHJ1Y3R1cmU6IGFueSxcclxuICAgIHByZWRpY2F0ZTogKGl0ZW06IGFueSkgPT4gYm9vbGVhbixcclxuICAgIHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gPSBbXVxyXG4pOiB7IGl0ZW06IGFueTsgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSB9IHwgbnVsbCB7XHJcbiAgICAvLyBCYXNlIGNhc2U6IElmIHRoZSBjdXJyZW50IHN0cnVjdHVyZSBtYXRjaGVzIHRoZSBwcmVkaWNhdGVcclxuICAgIGlmIChwcmVkaWNhdGUoc3RydWN0dXJlKSkge1xyXG4gICAgICAgIHJldHVybiB7IGl0ZW06IHN0cnVjdHVyZSwgcGF0aCB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0J3MgYW4gYXJyYXksIHJlY3Vyc2l2ZWx5IHNlYXJjaCBlYWNoIGVsZW1lbnQgd2l0aCBpdHMgaW5kZXhcclxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0cnVjdHVyZSkpIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cnVjdHVyZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2ldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBpXSk7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0J3MgYW4gb2JqZWN0LCByZWN1cnNpdmVseSBzZWFyY2ggaXRzIHByb3BlcnRpZXMgd2l0aCB0aGVpciBrZXlzXHJcbiAgICBpZiAoc3RydWN0dXJlICE9PSBudWxsICYmIHR5cGVvZiBzdHJ1Y3R1cmUgPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzdHJ1Y3R1cmUpIHtcclxuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdHJ1Y3R1cmUsIGtleSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVba2V5XSwgcHJlZGljYXRlLCBbLi4ucGF0aCwga2V5XSk7XHJcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIG5vIG1hdGNoIGlzIGZvdW5kXHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG50eXBlIGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwPU1hdGhHcm91cEl0ZW18TWF0aEdyb3VwfEJhc2ljTWF0aEpheFRva2VuXHJcbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pOiBNYXRoR3JvdXBJdGVtW10ge1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xyXG4gICAgICAgIGl0ZW1zID0gW2l0ZW1zXTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmb3JtYXR0ZWRJdGVtcyA9IGl0ZW1zXHJcbiAgICAgICAgLnJlZHVjZSgoYWNjOiBNYXRoR3JvdXBJdGVtW10sIGl0ZW06IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yIHwgQmFzaWNNYXRoSmF4VG9rZW4pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBhY2MuY29uY2F0KGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtLmdldEl0ZW1zKCkpKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pIHtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLmdldFZhbHVlKCkgJiYgKGl0ZW0uZ2V0VHlwZSgpID09PSBcIm51bWJlclwiIHx8IGl0ZW0uZ2V0VHlwZSgpID09PSBcInZhcmlhYmxlXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjLnB1c2gobmV3IFRva2VuKGl0ZW0uZ2V0VmFsdWUoKSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgYEV4cGVjdGVkIGl0ZW0gdG8gYmUgYSBudW1iZXIgb3IgdmFyaWFibGUgYnV0IHJlY2VpdmVkOiAke2l0ZW0uZ2V0VmFsdWUoKX1gXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgfSwgW10pXHJcblxyXG4gICAgcmV0dXJuIGZvcm1hdHRlZEl0ZW1zO1xyXG59XHJcbmZ1bmN0aW9uIGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoT3BlcmF0b3IoZ3JvdXBzOiAoTWF0aEdyb3VwSXRlbXxNYXRoR3JvdXApW10pOk1hdGhHcm91cFtde1xyXG4gICAgY29uc3QgZm9ybWF0dGVkR3JvdXBzID0gZ3JvdXBzXHJcbiAgICAgICAgLnJlZHVjZSgoYWNjOiBNYXRoR3JvdXBbXSwgaXRlbTogVG9rZW4gfCBNYXRoR3JvdXAgfCBNYXRoSmF4T3BlcmF0b3IgKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpIHtcclxuICAgICAgICAgICAgICAgIGFjYy5wdXNoKG5ldyBNYXRoR3JvdXAoaXRlbSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgfSwgW10pXHJcblxyXG4gICAgcmV0dXJuIGZvcm1hdHRlZEdyb3VwcztcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvdWxkQWRkUGx1cyhncm91cDE/OiBhbnksZ3JvdXAyPzogYW55LGRpc3RhbmNlRnJvbU9wZXJhdG9yPzogbnVtYmVyKXtcclxuICAgIGlmKCFncm91cDF8fCFncm91cDJ8fCFkaXN0YW5jZUZyb21PcGVyYXRvcnx8ZGlzdGFuY2VGcm9tT3BlcmF0b3I9PT0tMXx8ZGlzdGFuY2VGcm9tT3BlcmF0b3I9PT0xKXJldHVybiAnJztcclxuXHJcbiAgICByZXR1cm4gJysnO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYW5Db21iaW5lKG1hdGg6IE1hdGhHcm91cCxvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcclxuXHJcbn1cclxuZXhwb3J0IGNsYXNzIE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICBvcGVyYXRvcjogc3RyaW5nO1xyXG4gICAgZ3JvdXBOdW06IG51bWJlciA9IDE7XHJcbiAgICBncm91cHM6IE1hdGhHcm91cFtdO1xyXG4gICAgc29sdXRpb246IE1hdGhHcm91cDtcclxuICAgIGNvbW11dGF0aXZlOiBib29sZWFuO1xyXG4gICAgaXNPcGVyYWJsZTogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKSB7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yKSB0aGlzLm9wZXJhdG9yID0gb3BlcmF0b3I7XHJcbiAgICAgICAgaWYgKGdyb3VwTnVtKSB0aGlzLmdyb3VwTnVtID0gZ3JvdXBOdW07XHJcbiAgICAgICAgaWYgKGdyb3VwcykgdGhpcy5ncm91cHMgPSBncm91cHM7XHJcbiAgICAgICAgaWYgKHNvbHV0aW9uKSB0aGlzLnNvbHV0aW9uID0gc29sdXRpb247XHJcbiAgICAgICAgaWYgKGlzT3BlcmFibGUgIT09IHVuZGVmaW5lZCkgdGhpcy5pc09wZXJhYmxlID0gaXNPcGVyYWJsZTtcclxuICAgIH1cclxuICAgIHN0YXRpYyBjcmVhdGUob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKTogTWF0aEpheE9wZXJhdG9yIHtcclxuICAgICAgICBpZiAob3BlcmF0b3IgPT09IFwiTXVsdGlwbGljYXRpb25cIikge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZ3JvdXBzLCBzb2x1dGlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBuZXcgTWF0aEpheE9wZXJhdG9yKG9wZXJhdG9yLCBncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgaXNPcGVyYWJsZSk7XHJcbiAgICB9XHJcbiAgICB0ZXN0R3JvdXBzKHRlc3Q6IChncm91cDogTWF0aEdyb3VwKSA9PiBib29sZWFuKTogYm9vbGVhbltdIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5ncm91cHMubWFwKHRlc3QpO1xyXG4gICAgfVxyXG5cclxuICAgIG1hcFZhcmlhYmxlcygpOiBib29sZWFuW10ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaGFzVmFyaWFibGVzKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIG9wZXJhdG9yVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcclxuICAgICAgICByZXR1cm4gWy4uLm5ldyBTZXQodGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmdyb3VwVmFyaWFibGVzKCkpLmZsYXQoKSldO1xyXG4gICAgfVxyXG5cclxuICAgIGNsb25lKCk6IE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmNsb25lKCkpO1xyXG4gICAgICAgIGNvbnN0IHNvbHV0aW9uID0gdGhpcy5zb2x1dGlvbiA/IHRoaXMuc29sdXRpb24uY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgICAgICByZXR1cm4gTWF0aEpheE9wZXJhdG9yLmNyZWF0ZSh0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nU29sdXRpb24oKTogc3RyaW5nIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZygpICsgJyA9ICcgKyB0aGlzLnNvbHV0aW9uPy50b1N0cmluZygpO1xyXG4gICAgfVxyXG5cclxuICAgIGVxdWFscyhpdGVtOiBNYXRoR3JvdXBJdGVtKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiZcclxuICAgICAgICAgICAgdGhpcy5vcGVyYXRvciA9PT0gaXRlbS5vcGVyYXRvciAmJlxyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5sZW5ndGggPT09IGl0ZW0uZ3JvdXBzLmxlbmd0aCAmJlxyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5ldmVyeSgodCwgaW5kZXgpID0+IHQuZXF1YWxzKGl0ZW0uZ3JvdXBzW2luZGV4XSkpO1xyXG4gICAgfVxyXG4gICAgZ2V0T2NjdXJyZW5jZUdyb3VwKCk6IHsgb2NjdXJyZW5jZXNDb3VudDogbnVtYmVyOyBvY2N1cnJlbmNPZjogTWF0aEdyb3VwW10gfXxudWxsICB7IHJldHVybiBudWxsOyB9ICBcclxuICAgIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7cmV0dXJuIGZhbHNlO31cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHNlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy5vcGVyYXRvcik7XHJcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuICcnO1xyXG4gICAgICAgIGlmKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPjJ8fG1ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zPDEpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbnVtYmVyIG9mIHBvc2l0aW9ucyBmb3IgYXNzb2NpYXRpdml0eTogJHttZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uc31gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gbWV0YWRhdGEubGF0ZXg7XHJcbiAgICAgICAgbGV0IGluZGV4PTA7XHJcbiAgICAgICAgbGV0IHN0cmluZyA9ICcnO1xyXG5cclxuICAgICAgICBjb25zdCBncm91cEJyYWNrZXRUeXBlPShwb3M6IHsgYnJhY2tldFR5cGU6IEJyYWNrZXRUeXBlOyBpc0JyYWNrZXRPcHRpb25hbDogYm9vbGVhbiB9LGdyb3VwOiBNYXRoR3JvdXApPT57XHJcbiAgICAgICAgICAgIGlmKCFwb3MuaXNCcmFja2V0T3B0aW9uYWwpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcG9zLmJyYWNrZXRUeXBlXHJcbiAgICAgICAgICAgIHJldHVybiBncm91cC5zaW5ndWxhcigpP0JyYWNrZXRUeXBlLk5vbmU6cG9zLmJyYWNrZXRUeXBlXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyx0cnVlKS5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXgtMV0sdGhpcy5ncm91cHNbaW5kZXhdLGluZGV4KTtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0udG9TdHJpbmcoKSxncm91cEJyYWNrZXRUeXBlKGl0ZW0sdGhpcy5ncm91cHNbaW5kZXhdKSk7XHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcclxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyxmYWxzZSkuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XHJcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4XSx0aGlzLmdyb3Vwc1tpbmRleCsxXSxpbmRleClcclxuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0udG9TdHJpbmcoKSxncm91cEJyYWNrZXRUeXBlKGl0ZW0sdGhpcy5ncm91cHNbaW5kZXhdKSk7XHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG4gICAgcGFyc2VNYXRoamF4T3BlcmF0b3IoKSB7XHJcbiAgICAgICAgcGFyc2VPcGVyYXRvcih0aGlzKTtcclxuICAgIH1cclxufVxyXG5leHBvcnQgY2xhc3MgRXF1YWxzT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3J7XHJcblxyXG59XHJcbmV4cG9ydCBjbGFzcyBEaXZpc2lvbk9wZXJhdG9yIGV4dGVuZHMgTWF0aEpheE9wZXJhdG9ye1xyXG5cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3Ige1xyXG4gICAgY29uc3RydWN0b3IoZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgc3VwZXIoXCJNdWx0aXBsaWNhdGlvblwiLCAyLCBncm91cHMsIHNvbHV0aW9uLCB0cnVlKTtcclxuICAgICAgICB0aGlzLmNvbW11dGF0aXZlID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVtb3ZlTXVsdGlwbGljYXRpb25EZXB0aHMoKXtcclxuICAgICAgICB3aGlsZSh0aGlzLmdyb3Vwcy5zb21lKChnOiBNYXRoR3JvdXApPT4gZy5zaW5ndWxhcigpJiZnLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKSl7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwPXRoaXMuZ3JvdXBzLmZpbmQoKGc6IE1hdGhHcm91cCk9PiBnLnNpbmd1bGFyKCkmJmcuZ2V0SXRlbXMoKVswXSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpXHJcbiAgICAgICAgICAgIGlmKGdyb3VwKVxyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5zcGxpY2UodGhpcy5ncm91cHMuaW5kZXhPZihncm91cCksMSwuLi4oZ3JvdXAuZ2V0SXRlbXMoKVswXSBhcyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKS5ncm91cHMpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBhc09jY3VycmVuY2VHcm91cChvY2N1cnJlbmNlc0NvdW50OiBudW1iZXIsb2NjdXJyZW5jT2Y6IHN0cmluZ3xUb2tlbnxNYXRoR3JvdXApOiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yIHtcclxuICAgICAgICBvY2N1cnJlbmNPZj10eXBlb2Ygb2NjdXJyZW5jT2Y9PT1cInN0cmluZ1wiP1xyXG4gICAgICAgICAgICBuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jT2YpXSk6b2NjdXJyZW5jT2YgaW5zdGFuY2VvZiBUb2tlbj9cclxuICAgICAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW29jY3VycmVuY09mXSk6b2NjdXJyZW5jT2Y7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihbbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKG9jY3VycmVuY2VzQ291bnQpXSksb2NjdXJyZW5jT2ZdKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBvdmVycmlkZSBnZXRPY2N1cnJlbmNlR3JvdXAoKTogeyBvY2N1cnJlbmNlc0NvdW50OiBudW1iZXI7IG9jY3VycmVuY09mOiBNYXRoR3JvdXBbXSB9IHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoXHJcbiAgICAgICAgICAgIChhY2M6IHsgdG90YWxOdW06IG51bWJlcjsgYXJyOiBNYXRoR3JvdXBbXSB9LCBpdGVtOiBNYXRoR3JvdXApID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLmdldE9wZXJhYmxlVmFsdWUoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFjYy50b3RhbE51bSArPSBpdGVtLmdldE9wZXJhYmxlVmFsdWUoKSE7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGFjYy5hcnIucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHsgdG90YWxOdW06IDAsIGFycjogW10gfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIHsgb2NjdXJyZW5jZXNDb3VudDogcmVzdWx0LnRvdGFsTnVtLCBvY2N1cnJlbmNPZjogcmVzdWx0LmFyciB9O1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFRvT2NjdXJyZW5jZUdyb3VwKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBudW1iZXJHcm91cCA9IHRoaXMuZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuc2luZ2xlTnVtYmVyKCkpO1xyXG4gICAgICAgIGlmIChudW1iZXJHcm91cCkge1xyXG4gICAgICAgICAgICBudW1iZXJHcm91cC5zaW5nbGVUb2tlblNldCh2YWx1ZSwgdHJ1ZSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5ncm91cHMucHVzaChuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4oMSArIHZhbHVlKV0pKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgb3ZlcnJpZGUgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0SXRlbTogTWF0aEpheE9wZXJhdG9yIHwgVG9rZW4pOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBpc1ZhbGlkSXRlbSA9IHRlc3RJdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgdGVzdEl0ZW0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yO1xyXG4gICAgICAgIGlmICghaXNWYWxpZEl0ZW0pIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRHcm91cCA9IHRoaXMuZ2V0T2NjdXJyZW5jZUdyb3VwKCk7XHJcbiAgICAgICAgaWYgKCFjdXJyZW50R3JvdXApIHJldHVybiBmYWxzZTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRHcm91cEl0ZW1zID0gY3VycmVudEdyb3VwLm9jY3VycmVuY09mLmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAuZ2V0SXRlbXMoKSk7XHJcbiAgICBcclxuICAgICAgICBpZiAodGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbikge1xyXG4gICAgICAgICAgICBjb25zdCBpc1NpbmdsZUl0ZW1NYXRjaCA9IGN1cnJlbnRHcm91cEl0ZW1zLmxlbmd0aCA9PT0gMSAmJiBjdXJyZW50R3JvdXBJdGVtc1swXS5lcXVhbHModGVzdEl0ZW0pO1xyXG4gICAgICAgICAgICBpZiAoaXNTaW5nbGVJdGVtTWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWRkVG9PY2N1cnJlbmNlR3JvdXAoMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGlzU2luZ2xlSXRlbU1hdGNoO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cCA9IHRlc3RJdGVtLmdldE9jY3VycmVuY2VHcm91cCgpO1xyXG4gICAgICAgIGlmICghdGVzdEl0ZW1Hcm91cCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHRlc3RJdGVtR3JvdXBJdGVtcyA9IHRlc3RJdGVtR3JvdXAub2NjdXJyZW5jT2Y7XHJcbiAgICAgICAgY29uc3QgYXJlR3JvdXBzTWF0Y2hpbmcgPWN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5sZW5ndGggPT09IHRlc3RJdGVtR3JvdXBJdGVtcy5sZW5ndGggJiZcclxuICAgICAgICAgICAgY3VycmVudEdyb3VwLm9jY3VycmVuY09mLmV2ZXJ5KChjdXJyZW50U3ViR3JvdXA6IE1hdGhHcm91cCkgPT5cclxuICAgICAgICAgICAgICAgIHRlc3RJdGVtR3JvdXBJdGVtcy5zb21lKCh0ZXN0U3ViR3JvdXA6IE1hdGhHcm91cCkgPT4gXHJcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFN1Ykdyb3VwLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdFN1Ykdyb3VwKVxyXG4gICAgICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAoYXJlR3JvdXBzTWF0Y2hpbmcpIHsgXHJcbiAgICAgICAgICAgIHRoaXMuYWRkVG9PY2N1cnJlbmNlR3JvdXAodGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNlc0NvdW50KTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpeyBcclxuICAgICAgICBjb25zdCBvcGVyYXRvciA9ICdcXFxcY2RvdCAnO1xyXG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcclxuICAgICAgICBjb25zdCB0b0FkZENkb3Q9KHRoaXNHcm91cDogTWF0aEdyb3VwLG5leHRHcm91cD86TWF0aEdyb3VwKT0+e1xyXG4gICAgICAgICAgICBpZighbmV4dEdyb3VwKXJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgaWYobmV4dEdyb3VwLmlzU2luZ2xlVmFyKCl8fHRoaXNHcm91cC5pc1NpbmdsZVZhcigpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHJlb3JkZXJlZEdyb3Vwcz10aGlzLmdyb3Vwcy5zb3J0KChhLCBiKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChhLnNpbmdsZU51bWJlcigpICYmICFiLnNpbmdsZU51bWJlcigpKSByZXR1cm4gLTE7XHJcbiAgICAgICAgICAgIGlmICghYS5zaW5nbGVOdW1iZXIoKSAmJiBiLnNpbmdsZU51bWJlcigpKSByZXR1cm4gMTtcclxuICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGEuc2luZ3VsYXIoKSAmJiAhYi5zaW5ndWxhcigpKSByZXR1cm4gLTE7XHJcbiAgICAgICAgICAgIGlmICghYS5zaW5ndWxhcigpICYmIGIuc2luZ3VsYXIoKSkgcmV0dXJuIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJlb3JkZXJlZEdyb3Vwcy5mb3JFYWNoKChncm91cCxpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKGdyb3VwLnRvU3RyaW5nKCksIGdyb3VwLnNpbmd1bGFyKCk/QnJhY2tldFR5cGUuTm9uZTpCcmFja2V0VHlwZS5QYXJlbnRoZXNlcyk7XHJcbiAgICAgICAgICAgIGlmICh0b0FkZENkb3QoZ3JvdXAscmVvcmRlcmVkR3JvdXBzW2luZGV4KzFdKSlcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKGN1c3RvbUZvcm1hdHRlcikgXHJcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXHJcbiAgICAgICAgcmV0dXJuIHN0cmluZy50cmltKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLypcclxuICAgIHRoaXMuZ3JvdXBzID0gW1sxLCAyLCAzXSxbNCwgNSwgNl0sWzcsIDgsIDldXVxyXG4gICAgRXhwZWN0ZWQgT3V0cHV0OlxyXG4gICAgW1xyXG4gICAgICAgIDEqNCwgMSo1LCAxKjYsIDEqNywgMSo4LCAxKjksXHJcbiAgICAgICAgMio0LCAyKjUsIDIqNiwgMio3LCAyKjgsIDIqOSxcclxuICAgICAgICAzKjQsIDMqNSwgMyo2LCAzKjcsIDMqOCwgMyo5LFxyXG4gICAgICAgIDQqNywgNCo4LCA0KjksXHJcbiAgICAgICAgNSo3LCA1KjgsIDUqOSxcclxuICAgICAgICA2KjcsIDYqOCwgNio5XHJcbiAgICBdICBcclxuICAgICovXHJcbiAgICBwYXJzZU1hdGhqYXhPcGVyYXRvcigpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBtdWx0QXJyPXRoaXMuZWxpbWluYXRHcm91cHNXaXRoTXVsdGlwbGVUZXJtcygpLmdldEl0ZW1zKCk7XHJcbiAgICAgICAgY29uc3QgbmFtZT1tdWx0QXJyLm1hcCgobzogTXVsdGlwbGljYXRpb25PcGVyYXRvcik9PiB7by5wYXJzZSgpO3JldHVybiBvLnNvbHV0aW9ufSlcclxuICAgICAgICB0aGlzLnNvbHV0aW9uPW5ldyBNYXRoR3JvdXAobmFtZSk7XHJcbiAgICAgICAgdGhpcy5zb2x1dGlvbi5jb21iaW5pbmdMaWtlVGVybXMoKTtcclxuICAgIH1cclxuICAgIGVsaW1pbmF0R3JvdXBzV2l0aE11bHRpcGxlVGVybXMoKTpNYXRoR3JvdXAge1xyXG4gICAgICAgIGxldCBvcGVyYXRvcnNBY2N1bXVsYXRpb246IE11bHRpcGxpY2F0aW9uT3BlcmF0b3JbXSA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHNpbmdsZVRlcm1Hcm91cHMgPSB0aGlzLmdyb3Vwcy5maWx0ZXIoZ3JvdXAgPT4gZ3JvdXAuc2luZ3VsYXIoKSk7XHJcbiAgICAgICAgY29uc3QgbXVsdGlUZXJtR3JvdXBzID0gdGhpcy5ncm91cHMuZmlsdGVyKGdyb3VwID0+ICFncm91cC5zaW5ndWxhcigpKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBzaW5nbGVzTWF0aEdyb3VwID0gc2luZ2xlVGVybUdyb3Vwcy5sZW5ndGggIT09IDAgXHJcbiAgICAgICAgICAgID8gW25ldyBNYXRoR3JvdXAoW25ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKHNpbmdsZVRlcm1Hcm91cHMpXSldIFxyXG4gICAgICAgICAgICA6IFtdO1xyXG4gICAgICAgIGxldCBncm91cHMgPSBbLi4uc2luZ2xlc01hdGhHcm91cCwgLi4ubXVsdGlUZXJtR3JvdXBzXTtcclxuICAgIFxyXG4gICAgICAgIHdoaWxlIChncm91cHMubGVuZ3RoID4gMSkge1xyXG4gICAgICAgICAgICBjb25zdCBncm91cEEgPSBncm91cHMuc2hpZnQoKTtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXBCID0gZ3JvdXBzLnNoaWZ0KCk7XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKCFncm91cEEgfHwgIWdyb3VwQikgYnJlYWs7XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXBBSXRlbXMgPSBncm91cEEuZ2V0SXRlbXMoKTtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdXBCSXRlbXMgPSBncm91cEIuZ2V0SXRlbXMoKTtcclxuICAgICAgICAgICAgb3BlcmF0b3JzQWNjdW11bGF0aW9uID0gW107XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgYSBvZiBncm91cEFJdGVtcykge1xyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBiIG9mIGdyb3VwQkl0ZW1zKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgb3BlcmF0b3JzQWNjdW11bGF0aW9uLnB1c2goXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoT3BlcmF0b3IoW2EuY2xvbmUoKSwgYi5jbG9uZSgpXSkpXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGdyb3Vwcy51bnNoaWZ0KG5ldyBNYXRoR3JvdXAob3BlcmF0b3JzQWNjdW11bGF0aW9uKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBncm91cHNbMF07XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBwYXJzZSgpe1xyXG4gICAgICAgIGNvbnN0IHsgbnVtYmVycywgb3RoZXIgfSA9IHRoaXMuZ3JvdXBzLnJlZHVjZSgocmVzdWx0OiB7IG51bWJlcnM6IE1hdGhHcm91cFtdOyBvdGhlcjogTWF0aEdyb3VwW10gfSwgaXRlbTogTWF0aEdyb3VwKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5zaW5nbGVOdW1iZXIoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5udW1iZXJzLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5vdGhlci5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgeyBudW1iZXJzOiBbXSwgb3RoZXI6IFtdIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIGxldCB2YWx1ZT0xO1xyXG4gICAgICAgIG51bWJlcnMuZm9yRWFjaChncm91cCA9PiB7XHJcbiAgICAgICAgICAgIHZhbHVlKj0oZ3JvdXAuZ2V0SXRlbXMoKVswXWFzIFRva2VuKS5nZXROdW1iZXJWYWx1ZSgpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWYodGhpcy5ncm91cHMubGVuZ3RoPT09MClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXCIpO1xyXG4gICAgICAgIGlmKChudW1iZXJzLmxlbmd0aD4wJiZvdGhlci5sZW5ndGg9PT0wKXx8dmFsdWU9PT0wKXtcclxuICAgICAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKG5ldyBUb2tlbih2YWx1ZSkpO3JldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgdGVzdD0obWFpbkdyb3VwOiBhbnksIHRlc3RHcm91cDogYW55KT0+e1xyXG4gICAgICAgICAgICBpZihtYWluR3JvdXAgaW5zdGFuY2VvZiBNYXRoR3JvdXAmJnRlc3RHcm91cCBpbnN0YW5jZW9mIE1hdGhHcm91cCl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbWFpbkdyb3VwLmlzUG93R3JvdXBNYXRjaCh0ZXN0R3JvdXApXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBmaWx0ZXJlZD1maWx0ZXJCeVRlc3RDb25zdChvdGhlcix0ZXN0KTtcclxuICAgICAgICBjb25zdCBhcnI9Wy4uLmZpbHRlcmVkXTtcclxuICAgICAgICBpZih2YWx1ZSE9PTEpXHJcbiAgICAgICAgICAgIGFyci5wdXNoKG5ldyBUb2tlbih2YWx1ZSkpO1xyXG5cclxuICAgICAgICBpZihhcnIubGVuZ3RoPjEpe1xyXG4gICAgICAgICAgICB0aGlzLnNvbHV0aW9uPW5ldyBNYXRoR3JvdXAoW25ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoT3BlcmF0b3IoYXJyKSldKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnNvbHV0aW9uPW5ldyBNYXRoR3JvdXAoYXJyWzBdKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYShncm91cHM6IE1hdGhHcm91cFtdKXtcclxuICAgIGNvbnN0IGFyZUFsbEdyb3Vwc1Npbmd1bGFyPWdyb3Vwcy5ldmVyeShnPT5nLnNpbmd1bGFyKCkpXHJcbiAgICBsZXQgdmFsdWU9MDtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGZpbHRlckJ5VGVzdENvbnN0KFxyXG4gICAgaXRlbXM6IGFueVtdLFxyXG4gICAgdGVzdDogKG1haW5JdGVtOiBhbnksIHRlc3RJdGVtOiBhbnkpID0+IGJvb2xlYW5cclxuKTogYW55W10ge1xyXG4gICAgbGV0IGluZGV4ID0gMDtcclxuICAgIHdoaWxlIChpbmRleCA8IGl0ZW1zLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IG1haW5JdGVtID0gaXRlbXNbaW5kZXhdO1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsTGVuZ3RoID0gaXRlbXMubGVuZ3RoO1xyXG5cclxuICAgICAgICBpdGVtcyA9IGl0ZW1zLmZpbHRlcigob3RoZXJJdGVtLCBvdGhlckluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gb3RoZXJJbmRleCkgcmV0dXJuIHRydWU7IC8vIEtlZXAgY3VycmVudCBpdGVtXHJcbiAgICAgICAgICAgIGNvbnN0IHRlbXA9IXRlc3QobWFpbkl0ZW0sIG90aGVySXRlbSk7XHJcbiAgICAgICAgICAgIHJldHVybiB0ZW1wXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFJlc3RhcnQgaXRlcmF0aW9uIGlmIGl0ZW1zIHdlcmUgcmVtb3ZlZFxyXG4gICAgICAgIGlmIChpdGVtcy5sZW5ndGggPCBvcmlnaW5hbExlbmd0aCkge1xyXG4gICAgICAgICAgICBpbmRleCA9IDA7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gaXRlbXM7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiB0cmlnb25vbWV0cmljSWRlbnRpdGllcygpe1xyXG5cclxufVxyXG5cclxuZXhwb3J0IHR5cGUgTWF0aEdyb3VwSXRlbT1Ub2tlbnxNYXRoSmF4T3BlcmF0b3JcclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoR3JvdXAge1xyXG4gICAgcHJpdmF0ZSBpdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XHJcbiAgICAvL292ZXJ2aWV3OiBNYXRoT3ZlcnZpZXdcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IoaXRlbXM/OiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XHJcbiAgICAgICAgaWYoaXRlbXMpdGhpcy5zZXRJdGVtcyhpdGVtcyk7XHJcbiAgICB9XHJcbiAgICBnZXRJdGVtcygpOiBNYXRoR3JvdXBJdGVtW10ge3JldHVybiB0aGlzLml0ZW1zO31cclxuICAgIHNldEl0ZW0oaXRlbTogTWF0aEdyb3VwSXRlbSxpbmRleDpudW1iZXIpe1xyXG4gICAgICAgIHRoaXMuaXRlbXNbaW5kZXhdPWl0ZW07XHJcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpXHJcbiAgICB9XHJcbiAgICByZXBsYWNlSXRlbUNlbGwoaXRlbTogTWF0aEdyb3VwSXRlbXxNYXRoR3JvdXAsaW5kZXg6bnVtYmVyKXtcclxuICAgICAgICB0aGlzLml0ZW1zLnNwbGljZShpbmRleCwxLC4uLmVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtKSlcclxuICAgIH1cclxuICAgIHNldEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XHJcbiAgICAgICAgdGhpcy5pdGVtcyA9IGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtcyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpICAgIFxyXG4gICAgfVxyXG4gICAgZ3JvdXBWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlczogc3RyaW5nW10gPSBbXTtcclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW06IE1hdGhHcm91cEl0ZW0pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiAmJiBpdGVtLmlzVmFyKCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKTtcclxuICAgICAgICAgICAgICAgIGlmICghdmFyaWFibGVzLmNvbnRhaW5zKGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZXMucHVzaChrZXkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHZhcmlhYmxlcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdXBkYXRlT3ZlcnZpZXcoKXsvKlxyXG4gICAgICAgIHRoaXMub3ZlcnZpZXc9bmV3IE1hdGhPdmVydmlldygpXHJcbiAgICAgICAgdGhpcy5vdmVydmlldy5kZWZpbmVPdmVydmlld3NlcGFyYXRlSW50b0luZGl2aWR1YWxzKHRoaXMuaXRlbXMpKi9cclxuICAgIH1cclxuICAgIHNpbmdsZVRva2VuU2V0KHZhbHVlOiBudW1iZXIsdG9BZGQ/OiBib29sZWFuKXtcclxuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdIGFzIFRva2VuO1xyXG4gICAgICAgIGNvbnN0IG5ld1ZhbHVlPXRvQWRkP3ZhbHVlK3Rva2VuLmdldE51bWJlclZhbHVlKCk6dmFsdWU7XHJcbiAgICAgICAgaWYodGhpcy5zaW5ndWxlVG9rZW4oKSl7XHJcbiAgICAgICAgICAgIHRva2VuLnNldFZhbHVlKG5ld1ZhbHVlKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGNsb25lKCk6IE1hdGhHcm91cCB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoR3JvdXAodGhpcy5pdGVtcy5tYXAoaXRlbT0+aXRlbS5jbG9uZSgpKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzT3BlcmF0b3IoKTogdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSgoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcik7fVxyXG4gICAgZG9lc250SGF2ZU9wZXJhdG9yKCk6ICB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gIXRoaXMuaGFzT3BlcmF0b3IoKTt9XHJcbiAgICBzaW5nbGVOdW1iZXIoKXtyZXR1cm4gdGhpcy5zaW5ndWxhcigpJiZ0aGlzLm51bWJlck9ubHkoKX1cclxuICAgIG51bWJlck9ubHkoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuZXZlcnkodCA9PiAodCBpbnN0YW5jZW9mIFRva2VuJiYhdC5pc1ZhcigpKSk7fVxyXG4gICAgaGFzVmFyaWFibGVzKCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiB0IGluc3RhbmNlb2YgVG9rZW4mJnQuaXNWYXIoKSk7fVxyXG5cclxuICAgIHNpbmd1bGFyKCk6Ym9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoID09PSAxICYmIHRoaXMuaXRlbXNbMF0gIT09IHVuZGVmaW5lZDt9XHJcbiAgICBzaW5ndWxlVG9rZW4oKTogdGhpcyBpcyB7IGl0ZW1zOiBbVG9rZW5dIH0ge3JldHVybiB0aGlzLnNpbmd1bGFyKCkgJiYgdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuO31cclxuICAgIGlzT3BlcmFibGUoKXtyZXR1cm4gdHJ1ZX1cclxuXHJcbiAgICBnZXRPcGVyYWJsZVZhbHVlKCk6IG51bWJlciB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBjb25zdCBpdGVtcyA9IHRoaXMuaXRlbXM7XHJcbiAgICAgICAgaWYgKHRoaXMubnVtYmVyT25seSgpKSB7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZT0wO1xyXG4gICAgICAgICAgICBpdGVtcy5mb3JFYWNoKChpdGVtOiBUb2tlbikgPT4ge1xyXG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gaXRlbS5nZXROdW1iZXJWYWx1ZSgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGlzU2luZ2xlVmFyKCl7XHJcbiAgICAgICAgY29uc3QgdG9rZW49dGhpcy5pdGVtc1swXWFzIFRva2VuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc2luZ3VsZVRva2VuKCkmJnRva2VuLmlzVmFyKClcclxuICAgIH1cclxuICAgIGdldFNpbmdsZVZhcigpe1xyXG4gICAgICAgIGlmKCF0aGlzLmlzU2luZ2xlVmFyKCkpcmV0dXJuIG51bGw7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLml0ZW1zWzBdYXMgVG9rZW4pLmdldFN0cmluZ1ZhbHVlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNQb3dHcm91cE1hdGNoKGdyb3VwOiBNYXRoR3JvdXApOmJvb2xlYW57XHJcbiAgICAgICAgaWYodGhpcy5pdGVtcy5sZW5ndGghPT0xKXJldHVybiBmYWxzZVxyXG4gICAgICAgIGlmKHRoaXMuaXNTaW5nbGVWYXIoKSYmZ3JvdXAuaXNTaW5nbGVWYXIoKSYmdGhpcy5lcXVhbHMoZ3JvdXApKXtcclxuICAgICAgICAgICAgdGhpcy5pdGVtcz1bTWF0aEpheE9wZXJhdG9yLmNyZWF0ZShcIlBvd2VyXCIsMixbbmV3IE1hdGhHcm91cCh0aGlzLml0ZW1zWzBdKSxuZXcgTWF0aEdyb3VwKG5ldyBUb2tlbigyKSldKV1cclxuICAgICAgICAgICAgcmV0dXJuIHRydWVcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZXF1YWxzKGdyb3VwKVxyXG4gICAgfVxyXG5cclxuICAgIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2gob3RoZXI6IE1hdGhHcm91cCl7XHJcbiAgICAgICAgY29uc3QgYm90aFNpbmd1bGFyPXRoaXMuc2luZ3VsYXIoKSYmb3RoZXIuc2luZ3VsYXIoKVxyXG4gICAgICAgIGNvbnN0IGZpcnN0SXRlbU1hdGhKYXhvT2VyYXRvcj10aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yJiZvdGhlci5nZXRJdGVtcygpWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yXHJcbiAgICAgICAgaWYoIWJvdGhTaW5ndWxhciYmIWZpcnN0SXRlbU1hdGhKYXhvT2VyYXRvcilyZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgY29uc3QgYT0odGhpcy5pdGVtc1swXWFzIE1hdGhKYXhPcGVyYXRvcikuaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlci5nZXRJdGVtcygpWzBdKVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZXF1YWxzKG90aGVyKVxyXG4gICAgfVxyXG5cclxuICAgIGVxdWFscyhpdGVtOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3J8TWF0aEdyb3VwKXtcclxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgVG9rZW4pe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT0xJiZ0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW4mJnRoaXMuaXRlbXNbMF0uZXF1YWxzKGl0ZW0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09MSYmdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciYmdGhpcy5pdGVtc1swXS5lcXVhbHMoaXRlbSlcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCl7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PWl0ZW0uaXRlbXMubGVuZ3RoJiZ0aGlzLml0ZW1zLmV2ZXJ5KCh0OiBNYXRoR3JvdXBJdGVtKT0+e1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uaXRlbXMuc29tZSgoaSk9PnQuZXF1YWxzKGkpKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SWQoKXtcclxuICAgICAgICByZXR1cm4gJ01hdGhHcm91cCdcclxuICAgIH1cclxuICAgIGNvbWJpbmluZ0xpa2VUZXJtcygpIHtcclxuICAgICAgICBjb25zdCBvdmVydmlldyA9IG5ldyBNYXRoT3ZlcnZpZXcoKTtcclxuICAgICAgICBvdmVydmlldy5kZWZpbmVPdmVydmlld1NlcGFyYXRlSW50b0luZGl2aWR1YWxzKHRoaXMuaXRlbXMpO1xyXG4gICAgICAgIHRoaXMuc2V0SXRlbXMob3ZlcnZpZXcucmVjb25zdHJ1Y3RBc01hdGhHcm91cEl0ZW1zKCkpO1xyXG4gICAgICAgIGxldCBpbmRleCA9IDA7XHJcbiAgICAgICAgd2hpbGUgKGluZGV4IDwgdGhpcy5pdGVtcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbaW5kZXhdO1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG9yaWdpbmFsTGVuZ3RoID0gdGhpcy5pdGVtcy5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICB0aGlzLml0ZW1zID0gdGhpcy5pdGVtcy5maWx0ZXIoKG90aGVySXRlbTogTWF0aEdyb3VwSXRlbSwgb3RoZXJJbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID09PSBvdGhlckluZGV4KSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc01hdGNoID0gaXRlbS5pc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVySXRlbSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc01hdGNoO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pdGVtcy5sZW5ndGggPCBvcmlnaW5hbExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XHJcbiAgICAgICAgaWYoIUFycmF5LmlzQXJyYXkodGhpcy5pdGVtcykpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBidXQgcmVjZWl2ZWQ6IFwiK3RoaXMuaXRlbXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHN0cmluZys9c2hvdWxkQWRkUGx1cyh0aGlzLml0ZW1zW2luZGV4LTFdLGl0ZW0pXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBgKCR7aXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpfSlgO1xyXG4gICAgICAgICAgICB9ICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XHJcbiAgICAgICAgICAgIH0gaWYgKGN1c3RvbUZvcm1hdHRlcikge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nID0gY3VzdG9tRm9ybWF0dGVyKGl0ZW0sc3RyaW5nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmc7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgTWF0aE92ZXJ2aWV3IHtcclxuICAgIHByaXZhdGUgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBhbnk+O1xyXG4gICAgcHJpdmF0ZSBvcGVyYXRvcnM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBwcml2YXRlIG51bWJlcjogbnVtYmVyO1xyXG4gICAgZ2V0TnVtYmVyKCk6IG51bWJlcntyZXR1cm4gdGhpcy5udW1iZXI7fVxyXG4gICAgZ2V0VmFyaWFibGVzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMudmFyaWFibGVzO31cclxuICAgIGdldE9wZXJhdG9ycygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLm9wZXJhdG9yczt9XHJcbiAgICBjb25zdHJ1Y3Rvcih2YXJpYWJsZXM/OiBNYXA8c3RyaW5nLCBhbnk+LG9wZXJhdG9ycz86IE1hcDxzdHJpbmcsIGFueT4sbnVtYmVyPzogbnVtYmVyKXtcclxuICAgICAgICBpZih2YXJpYWJsZXMpdGhpcy52YXJpYWJsZXM9dmFyaWFibGVzO1xyXG4gICAgICAgIGlmKG9wZXJhdG9ycyl0aGlzLm9wZXJhdG9ycz1vcGVyYXRvcnM7XHJcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcclxuICAgIH1cclxuICAgIGRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHMoaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSkge1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzPW5ldyBNYXAoKTtcclxuICAgICAgICB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XHJcbiAgICAgICAgaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVmFyaWFibGVzTWFwKGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmIWl0ZW0uaXNWYXIoKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU11bWJlcihpdGVtLmdldE51bWJlclZhbHVlKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlT3BlcmF0b3JzTWFwKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIGNhdGVnb3J5IGluIE1hdGhPdmVydmlldyBzZXBhcmF0ZUludG9JbmRpdmlkdWFsc1wiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH1cclxuICAgIHVwZGF0ZU11bWJlcihudW1iZXI6IG51bWJlcil7IHRoaXMubnVtYmVyPXRoaXMubnVtYmVyP3RoaXMubnVtYmVyK251bWJlcjpudW1iZXI7fVxyXG4gICAgdXBkYXRlVmFyaWFibGVzTWFwKGtleTogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcyA/Pz0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgaXRlbXM6IGFueVtdIH0+KCk7XHJcbiAgICAgICAgaWYoIXRoaXMudmFyaWFibGVzLmhhcyhrZXkpKXt0aGlzLnZhcmlhYmxlcy5zZXQoa2V5LHtjb3VudDogMH0pfVxyXG4gICAgICAgIHRoaXMudmFyaWFibGVzLmdldChrZXkpLmNvdW50Kys7XHJcbiAgICB9XHJcbiAgICB1cGRhdGVPcGVyYXRvcnNNYXAob3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICAgICAgY29uc3Qga2V5PW9wZXJhdG9yLm9wZXJhdG9yO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycy5oYXMoa2V5KSl7dGhpcy5vcGVyYXRvcnMuc2V0KGtleSx7Y291bnQ6IDAsIGl0ZW1zOiBbXX0pfVxyXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5vcGVyYXRvcnMuZ2V0KGtleSkhO1xyXG4gICAgICAgIGVudHJ5LmNvdW50ICs9IDE7XHJcbiAgICAgICAgZW50cnkuaXRlbXMucHVzaChvcGVyYXRvcik7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzVmFyKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzJiZ0aGlzLnZhcmlhYmxlcy5zaXplPjB9XHJcbiAgICBoYXNPcCgpe3JldHVybiB0aGlzLm9wZXJhdG9ycyYmdGhpcy5vcGVyYXRvcnMuc2l6ZT4wfVxyXG4gICAgb25seU51bWVyaWMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5udW1iZXImJiF0aGlzLmhhc1ZhcigpJiYhdGhpcy5oYXNPcCgpXHJcbiAgICB9XHJcbiAgICByZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKXtcclxuICAgICAgICBjb25zdCBpdGVtczogTWF0aEdyb3VwSXRlbVtdPVtdO1xyXG4gICAgICAgIGlmKHRoaXMubnVtYmVyKWl0ZW1zLnB1c2gobmV3IFRva2VuKHRoaXMubnVtYmVyKSk7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xyXG4gICAgICAgICAgICBpZih2YWx1ZS5jb3VudD09PTEpe1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChuZXcgVG9rZW4oa2V5KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmKHZhbHVlLmNvdW50PjEpe1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChNdWx0aXBsaWNhdGlvbk9wZXJhdG9yLmFzT2NjdXJyZW5jZUdyb3VwKHZhbHVlLmNvdW50LGtleSkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBpZih0aGlzLm9wZXJhdG9ycyl7XHJcbiAgICAgICAgICAgIGl0ZW1zLnB1c2goLi4uQXJyYXkuZnJvbSh0aGlzLm9wZXJhdG9ycy52YWx1ZXMoKSkuZmxhdE1hcCgob3BlcmF0b3I6IGFueSkgPT4gb3BlcmF0b3IuaXRlbXMpKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaXRlbXM7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRva2Vue1xyXG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOm51bWJlcnxzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBnZXROdW1iZXJWYWx1ZSgpOm51bWJlcntyZXR1cm4gKHRoaXMudmFsdWUgYXMgbnVtYmVyKX1cclxuICAgIGdldFN0cmluZ1ZhbHVlKCk6c3RyaW5ne3JldHVybiAodGhpcy52YWx1ZSBhcyBzdHJpbmcpfVxyXG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cclxuICAgIHNldFZhbHVlKHZhbHVlOiBudW1iZXJ8c3RyaW5nKXt0aGlzLnZhbHVlPXZhbHVlO31cclxuICAgIGlzVmFyKCkge3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZyc7fVxyXG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pIHtcclxuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLnZhbHVlID09PSBpdGVtLnZhbHVlO1xyXG4gICAgfVxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmKCF0aGlzLmlzVmFyKCkmJnRoaXMuZ2V0TnVtYmVyVmFsdWUoKTwwKVxyXG4gICAgICAgICAgICBzdHJpbmcrPSctJztcclxuICAgICAgICBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgaWYoY3VzdG9tRm9ybWF0dGVyKXtcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZztcclxuICAgIH1cclxuICAgIGNsb25lKCl7cmV0dXJuIG5ldyBUb2tlbih0aGlzLnZhbHVlKX1cclxufVxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW5ze1xyXG4gICAgdG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj49W107XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKHRva2Vucz86IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPil7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zfHxbXTtcclxuICAgIH1cclxuICAgIGFkZElucHV0KG1hdGg6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy50b2tlbml6ZShtYXRoKTtcclxuICAgIH1cclxuICAgIHRva2VuaXplKG1hdGg6IHN0cmluZyl7XHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMoKSlcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKEJhc2ljTWF0aEpheFRva2VuLmNyZWF0ZShtYXRjaFswXSkpO1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTE7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xyXG4gICAgICAgICAgICBpZiAoISFtYXRjaClcclxuICAgICAgICAgICAgeyAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKEJhc2ljTWF0aEpheFRva2VuLmNyZWF0ZShwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy9BZGQgcGx1cyB0byBtYWtlIGl0IG11bHRpcGxlIExldHRlcnMuXHJcbiAgICAgICAgICAgIG1hdGNoPW1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChCYXNpY01hdGhKYXhUb2tlbi5jcmVhdGUobWF0Y2hbMF0pKVxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgdGhpcy5wb3N0UHJvY2Vzc1Rva2VucygpO1xyXG4gICAgfVxyXG5cclxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XHJcbiAgICAgICAgLypydWxlcyB0byBhYmlkIGJ5OlxyXG4gICAgICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcclxuICAgICAgICAqL1xyXG4gICAgICAgIHRoaXMudG9rZW5zPWlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcGFyZW5NYXA9dGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuXHJcbiAgICAgICAgcGFyZW5NYXAuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGIgLSBhKVxyXG4gICAgICAgIC5mb3JFYWNoKCh2YWx1ZTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3ICBCYXNpY01hdGhKYXhUb2tlbignb3BlcmF0b3InLCcqJykpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKClcclxuICAgIH1cclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKSB7XHJcbiAgICAgICAgY29uc3QgaXNBQmFzaWNNYXRoSmF4VG9rZW5Eb3VibGVSaWdodE9wPSh0b2tlbj86IGFueSk9PntcclxuICAgICAgICAgICAgaWYodG9rZW4mJnRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eShbMSwgMl0pLmluY2x1ZGVzKHRva2VuLmdldFN0cmluZ1ZhbHVlKCkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvKipcclxuICAgICAgICAgKiBcclxuICAgICAgICAgKiBAcGFyYW0gaW5kZXggXHJcbiAgICAgICAgICogQHJldHVybnMgYm9vbGFuID0+IFRydWUgaWYgdGhhciBpc24ndCBhIGRvdWJsZVJpZ2h0IG9wZXJhdG9yLlxyXG4gICAgICAgICAqL1xyXG4gICAgICAgIGNvbnN0IHRlc3REb3VibGVSaWdodCA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KXx8ISh0aGlzLnRva2Vuc1tpbmRleF0gaW5zdGFuY2VvZiBQYXJlbikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgaWR4ID0gZmluZFBhcmVuSW5kZXgoaW5kZXgsdGhpcy50b2tlbnMpPy5vcGVuO1xyXG4gICAgICAgICAgICBpZiAoaWR4ID09IG51bGwgfHwgcGFyZW5TdGF0ZSh0aGlzLnRva2Vuc1tpbmRleCArIDFdKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRoaXMudG9rZW5zW2lkeCAtIDFdO1xyXG4gICAgICAgICAgICByZXR1cm4gIWlzQUJhc2ljTWF0aEpheFRva2VuRG91YmxlUmlnaHRPcChwcmV2VG9rZW4pXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICBcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcclxuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdG9rZW4uaXNWYWx1ZVRva2VuKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uPSh0b2tlbjogYW55KT0+e1xyXG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiYmdHlwZW9mIHRva2VuLmdldFZhbHVlKCk9PT0nc3RyaW5nJyYmaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi5nZXRTdHJpbmdWYWx1ZSgpKVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaXNWYXI9KHRva2VuOiBhbnkpPT57cmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZ0b2tlbi5nZXRUeXBlKCk9PT0ndmFyaWFibGUnfVxyXG5cclxuICAgICAgICBjb25zdCBwcmVjZWRlc1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIGluZGV4PjAmJmlzVmFyKHRva2Vuc1tpbmRleF0pXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBmb2xsb3dzVmFyaWFibGUgPSAodG9rZW5zOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gaW5kZXg8dG9rZW5zLmxlbmd0aC0xJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXg+MCYmKHBhcmVuU3RhdGUodG9rZW4sdHJ1ZSl8fCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4pfHxwcmVjZWRlc1ZhcmlhYmxlKHRoaXMudG9rZW5zLGluZGV4KSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLTEmJihwYXJlblN0YXRlKHRva2VuLCl8fGZvbGxvd3NWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHwgdGVzdERvdWJsZVJpZ2h0KGluZGV4KSA/IGluZGV4ICsgMSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbSkgPT4gaXRlbSAhPT0gbnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XHJcbiAgICAgICAgLy8gUGx1c2VzIGFyZSBzZXBhcmF0b3JzLlRoZXJlZm9yZSwgdGhleSBkbyBub3QgbmVlZCB0byBiZSBoZXJlIEFzIHRoZSBleHByZXNzaW9uIGlzIHRva2VuW11cclxuICAgICAgICAvL01pbnVzZXMgb24gdGhlIG90aGVyIGhhbmQuY2FuIGVpdGhlciBiZSBhIHNlcGFyYXRvci4gT3IgYSBuZWdhdGl2ZSBzaWduXHJcbiAgICAgICAgY29uc3QgcGx1c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbnxQYXJlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiYmdG9rZW4uZ2V0VmFsdWUoKSA9PT0gJ0FkZGl0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxyXG4gICAgICAgIHBsdXNNYXAucmV2ZXJzZSgpLmZvckVhY2goKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LDEpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgbWludXNNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW58UGFyZW4sIGluZGV4OiBhbnkpID0+IHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnRva2VuLmdldFZhbHVlKCkgPT09ICdTdWJ0cmFjdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcclxuICAgICAgICBcclxuICAgICAgICBtaW51c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleCArIDFdO1xyXG4gICAgICAgICAgICBpZiAobmV4dFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdHlwZW9mIG5leHRUb2tlbi5nZXRWYWx1ZSgpID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgICAgbmV4dFRva2VuLnNldFZhbHVlKG5leHRUb2tlbi5nZXROdW1iZXJWYWx1ZSgpICogLTEpXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcixtYXJnaW4/OiBudW1iZXIpe1xyXG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XHJcbiAgICAgICAgcmV0dXJuIGluZGV4Pj0wK21hcmdpbiYmaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLW1hcmdpbjtcclxuICAgIH1cclxuICAgIGNsb25lKCk6IEJhc2ljTWF0aEpheFRva2VucyB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBCYXNpY01hdGhKYXhUb2tlbnModGhpcy50b2tlbnMubWFwKHRva2VuID0+IHRva2VuLmNsb25lKCkpKTtcclxuICAgIH1cclxuICAgIC8qXHJcbiAgICBcclxuICAgIFxyXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09IFwiKFwiID8gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICB9XHJcblxyXG4gICAgZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tYXBQYXJlbkluZGV4ZXMoKVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcclxuICAgICAgICAgICAgICAgIGlmIChvcGVuSW5kZXggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdPy50eXBlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKGNsb3NlSW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXT8uaXNWYWx1ZVRva2VuKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9KS5mbGF0TWFwKChpdGVtOiBhbnkpID0+IFtpdGVtLm9wZW4sIGl0ZW0uY2xvc2VdKTtcclxuICAgIH0gICAgXHJcbiAgICBcclxuICAgIFxyXG4gICAgZmluZFNpbWlsYXJTdWNjZXNzb3IodG9rZW5zKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcclxuICAgICAgICAgICAgICAgICYmKHRoaXMudG9rZW5Db21wYXJlKFwidHlwZVwiLHRoaXMudmFsdWVUb2tlbnMoKSwgdG9rZW4sIHRva2Vuc1tpbmRleCArIDFdKSlcclxuICAgICAgICApKTtcclxuICAgICB9XHJcbiAgICBcclxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKHRva2VuIGluc3RhbmNlb2YgVG9rZW4pKXtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKF86IGFueSwgaWR4OiB1bmtub3duKSA9PiAhbWFwLmhhcyhpZHgpKTtcclxuICAgICAgICAvL1Byb2JsZW0gd2l0aCAgPSBhcyBpdCdzIGFmZmVjdGluZyB0aGUgdmFyaWFibGUgYmVmb3JlIGl0XHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggLSAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKSAmJlxyXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBjb25zdCB2YXJNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J3ZhcmlhYmxlJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBhcnIgPSBbXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhudW1NYXApLCBcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXHJcbiAgICAgICAgXHJcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcclxuICAgIH1cclxuXHJcbiAgICBcclxuXHJcbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXHJcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcclxuICAgICAgICApXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgIH1cclxuXHJcbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQ6IGFueSwgbGVuZ3RoOiBudW1iZXIsIG9iamVjdHM6IGFueVtdIHwgVG9rZW4pIHtcclxuICAgICAgICBvYmplY3RzID0gZmxhdHRlbkFycmF5KG9iamVjdHMpO1xyXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXhwZWN0ZWQgYG9iamVjdHNgIHRvIGJlIGFuIGFycmF5LCBidXQgcmVjZWl2ZWQ6XCIsIG9iamVjdHMpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgbGVuZ3RoLCAuLi5vYmplY3RzKTtcclxuICAgIH1cclxuXHJcbiAgICBcclxuXHJcbiAgICBpbmRleGVzVG9BZGRQbHVzKHRva2VuczogYW55W10pe1xyXG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcclxuICAgICAgICAgICAgJiZ0b2tlbnNbaW5kZXggLSAxXT8uaXNWYWx1ZVRva2VuKClcclxuICAgICAgICAgICAgJiZ0b2tlbj8uaXNWYWx1ZVRva2VuKCkmJnRva2VuLnZhbHVlPj0wP2luZGV4Om51bGxcclxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcclxuICAgIH1cclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcclxuICAgICAgICBjb25zdCByZWdFeHB2YWx1ZSA9ICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcclxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgICovXHJcbn0iXX0=