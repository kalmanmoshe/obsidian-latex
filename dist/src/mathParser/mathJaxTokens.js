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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBK0IsV0FBVyxFQUFtRSxNQUFNLHFDQUFxQyxDQUFDO0FBRWhLLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxVQUFVLEdBQUksTUFBTSx3QkFBd0IsQ0FBQztBQUMzRixPQUFPLEVBQUUsdUJBQXVCLEVBQWlDLDJCQUEyQixFQUFFLHVCQUF1QixFQUFFLHlCQUF5QixFQUFvRSxzQkFBc0IsRUFBaUIsTUFBTSwyQkFBMkIsQ0FBQztBQUU3UixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRzdDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRW5ELFNBQVMsU0FBUyxDQUFDLEtBQWEsRUFBRSxJQUFpQjtJQUMvQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ1gsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEIsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEI7WUFDSSxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FDOUIsU0FBYyxFQUNkLFNBQWlDLEVBQ2pDLE9BQTRCLEVBQUU7SUFFOUIsNERBQTREO0lBQzVELElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG1FQUFtRTtJ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QUFDLENBQUE7Z0JBQ25ELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNqQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDVCxDQUFDO0lBQ0QsYUFBYSxDQUFDLEtBQWEsRUFBQyxNQUFlO1FBQ3ZDLE1BQU0sR0FBQyxNQUFNLElBQUUsQ0FBQyxDQUFDO1FBQ2pCLE9BQU8sS0FBSyxJQUFFLENBQUMsR0FBQyxNQUFNLElBQUUsS0FBSyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFDLE1BQU0sQ0FBQztJQUM1RCxDQUFDO0lBQ0QsS0FBSztRQUNELE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0UsQ0FBQztDQXFHSiIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlcywgY2FsY3VsYXRlRmFjdG9yaWFsfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuL2ltVmVyeUxhenlcIjtcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7IEFzc29jaWF0aXZpdHksIEJyYWNrZXRTdGF0ZSwgQnJhY2tldFR5cGUsIE1hdGhKYXhPcGVyYXRvck1ldGFkYXRhLCBtYXRoSmF4T3BlcmF0b3JzTWV0YWRhdGEsIE9wZXJhdG9yVHlwZSB9IGZyb20gXCJzcmMvc3RhdGljRGF0YS9tYXRoUGFyc2VyU3RhdGljRGF0YVwiO1xuXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgcGFyZW5TdGF0ZSwgIH0gZnJvbSBcIi4uL3V0aWxzL1BhcmVuVXRlbnNpbHNcIjtcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZSwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgaXNPcGVyYXRvcldpdGhBc3NvY2lhdGl2aXR5LCBzZWFyY2hBbGxNYXRoSmF4T3BlcmF0b3JzQW5kU3ltYm9scywgc2VhcmNoTWF0aEpheE9wZXJhdG9ycywgc2VhcmNoU3ltYm9scyB9IGZyb20gXCIuLi9zdGF0aWNEYXRhL2RhdGFNYW5hZ2VyXCI7XG5cbmltcG9ydCB7IHBhcnNlT3BlcmF0b3IgfSBmcm9tIFwiLi9tYXRoRW5naW5lXCI7XG5pbXBvcnQgeyBpdCB9IGZyb20gXCJub2RlOnRlc3RcIjtcbmltcG9ydCB7IHNpZ25hbCB9IGZyb20gXCJjb2RlbWlycm9yXCI7XG5pbXBvcnQgeyBCYXNpY01hdGhKYXhUb2tlbiB9IGZyb20gXCJzcmMvYmFzaWNUb2tlblwiO1xuXG5mdW5jdGlvbiB3cmFwR3JvdXAoZ3JvdXA6IHN0cmluZywgd3JhcDogQnJhY2tldFR5cGUpOiBzdHJpbmcge1xuICAgIHN3aXRjaCAod3JhcCkge1xuICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLlBhcmVudGhlc2VzOlxuICAgICAgICAgICAgcmV0dXJuIGAoJHtncm91cH0pYDtcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5DdXJseUJyYWNlczpcbiAgICAgICAgICAgIHJldHVybiBgeyR7Z3JvdXB9fWA7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ3JvdXA7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVlcFNlYXJjaFdpdGhQYXRoKFxuICAgIHN0cnVjdHVyZTogYW55LFxuICAgIHByZWRpY2F0ZTogKGl0ZW06IGFueSkgPT4gYm9vbGVhbixcbiAgICBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW11cbik6IHsgaXRlbTogYW55OyBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdIH0gfCBudWxsIHtcbiAgICAvLyBCYXNlIGNhc2U6IElmIHRoZSBjdXJyZW50IHN0cnVjdHVyZSBtYXRjaGVzIHRoZSBwcmVkaWNhdGVcbiAgICBpZiAocHJlZGljYXRlKHN0cnVjdHVyZSkpIHtcbiAgICAgICAgcmV0dXJuIHsgaXRlbTogc3RydWN0dXJlLCBwYXRoIH07XG4gICAgfVxuXG4gICAgLy8gSWYgaXQncyBhbiBhcnJheSwgcmVjdXJzaXZlbHkgc2VhcmNoIGVhY2ggZWxlbWVudCB3aXRoIGl0cyBpbmRleFxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0cnVjdHVyZSkpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJ1Y3R1cmUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVbaV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGldKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJZiBpdCdzIGFuIG9iamVjdCwgcmVjdXJzaXZlbHkgc2VhcmNoIGl0cyBwcm9wZXJ0aWVzIHdpdGggdGhlaXIga2V5c1xuICAgIGlmIChzdHJ1Y3R1cmUgIT09IG51bGwgJiYgdHlwZW9mIHN0cnVjdHVyZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzdHJ1Y3R1cmUpIHtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RydWN0dXJlLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtrZXldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBrZXldKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSWYgbm8gbWF0Y2ggaXMgZm91bmRcbiAgICByZXR1cm4gbnVsbDtcbn1cbnR5cGUgZm9ybWF0dGFibGVGb3JNYXRoR3JvdXA9TWF0aEdyb3VwSXRlbXxNYXRoR3JvdXB8QmFzaWNNYXRoSmF4VG9rZW5cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pOiBNYXRoR3JvdXBJdGVtW10ge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShpdGVtcykpIHtcbiAgICAgICAgaXRlbXMgPSBbaXRlbXNdO1xuICAgIH1cblxuICAgIGNvbnN0IGZvcm1hdHRlZEl0ZW1zID0gaXRlbXNcbiAgICAgICAgLnJlZHVjZSgoYWNjOiBNYXRoR3JvdXBJdGVtW10sIGl0ZW06IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yIHwgQmFzaWNNYXRoSmF4VG9rZW4pID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYy5jb25jYXQoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW0uZ2V0SXRlbXMoKSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpIHtcbiAgICAgICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKSB7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uZ2V0VmFsdWUoKSAmJiAoaXRlbS5nZXRUeXBlKCkgPT09IFwibnVtYmVyXCIgfHwgaXRlbS5nZXRUeXBlKCkgPT09IFwidmFyaWFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgYWNjLnB1c2gobmV3IFRva2VuKGl0ZW0uZ2V0VmFsdWUoKSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIGBFeHBlY3RlZCBpdGVtIHRvIGJlIGEgbnVtYmVyIG9yIHZhcmlhYmxlIGJ1dCByZWNlaXZlZDogJHtpdGVtLmdldFZhbHVlKCl9YFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9LCBbXSlcblxuICAgIHJldHVybiBmb3JtYXR0ZWRJdGVtcztcbn1cbmZ1bmN0aW9uIGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoT3BlcmF0b3IoZ3JvdXBzOiAoTWF0aEdyb3VwSXRlbXxNYXRoR3JvdXApW10pOk1hdGhHcm91cFtde1xuICAgIGNvbnN0IGZvcm1hdHRlZEdyb3VwcyA9IGdyb3Vwc1xuICAgICAgICAucmVkdWNlKChhY2M6IE1hdGhHcm91cFtdLCBpdGVtOiBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciApID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XG4gICAgICAgICAgICAgICAgYWNjLnB1c2goaXRlbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpIHtcbiAgICAgICAgICAgICAgICBhY2MucHVzaChuZXcgTWF0aEdyb3VwKGl0ZW0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgIH0sIFtdKVxuXG4gICAgcmV0dXJuIGZvcm1hdHRlZEdyb3Vwcztcbn1cblxuZnVuY3Rpb24gc2hvdWxkQWRkUGx1cyhncm91cDE/OiBhbnksZ3JvdXAyPzogYW55LGRpc3RhbmNlRnJvbU9wZXJhdG9yPzogbnVtYmVyKXtcbiAgICBpZighZ3JvdXAxfHwhZ3JvdXAyfHwhZGlzdGFuY2VGcm9tT3BlcmF0b3J8fGRpc3RhbmNlRnJvbU9wZXJhdG9yPT09LTF8fGRpc3RhbmNlRnJvbU9wZXJhdG9yPT09MSlyZXR1cm4gJyc7XG5cbiAgICByZXR1cm4gJysnO1xufVxuXG5mdW5jdGlvbiBjYW5Db21iaW5lKG1hdGg6IE1hdGhHcm91cCxvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcblxufVxuZXhwb3J0IGNsYXNzIE1hdGhKYXhPcGVyYXRvciB7XG4gICAgb3BlcmF0b3I6IHN0cmluZztcbiAgICBncm91cE51bTogbnVtYmVyID0gMTtcbiAgICBncm91cHM6IE1hdGhHcm91cFtdO1xuICAgIHNvbHV0aW9uOiBNYXRoR3JvdXA7XG4gICAgY29tbXV0YXRpdmU6IGJvb2xlYW47XG4gICAgaXNPcGVyYWJsZTogYm9vbGVhbiA9IHRydWU7XG5cbiAgICBjb25zdHJ1Y3RvcihvcGVyYXRvcj86IHN0cmluZywgZ3JvdXBOdW0/OiBudW1iZXIsIGdyb3Vwcz86IE1hdGhHcm91cFtdLCBzb2x1dGlvbj86IE1hdGhHcm91cCwgaXNPcGVyYWJsZT86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKG9wZXJhdG9yKSB0aGlzLm9wZXJhdG9yID0gb3BlcmF0b3I7XG4gICAgICAgIGlmIChncm91cE51bSkgdGhpcy5ncm91cE51bSA9IGdyb3VwTnVtO1xuICAgICAgICBpZiAoZ3JvdXBzKSB0aGlzLmdyb3VwcyA9IGdyb3VwcztcbiAgICAgICAgaWYgKHNvbHV0aW9uKSB0aGlzLnNvbHV0aW9uID0gc29sdXRpb247XG4gICAgICAgIGlmIChpc09wZXJhYmxlICE9PSB1bmRlZmluZWQpIHRoaXMuaXNPcGVyYWJsZSA9IGlzT3BlcmFibGU7XG4gICAgfVxuICAgIHN0YXRpYyBjcmVhdGUob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKTogTWF0aEpheE9wZXJhdG9yIHtcbiAgICAgICAgaWYgKG9wZXJhdG9yID09PSBcIk11bHRpcGxpY2F0aW9uXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihncm91cHMsIHNvbHV0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcihvcGVyYXRvciwgZ3JvdXBOdW0sIGdyb3Vwcywgc29sdXRpb24sIGlzT3BlcmFibGUpO1xuICAgIH1cbiAgICB0ZXN0R3JvdXBzKHRlc3Q6IChncm91cDogTWF0aEdyb3VwKSA9PiBib29sZWFuKTogYm9vbGVhbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcCh0ZXN0KTtcbiAgICB9XG5cbiAgICBtYXBWYXJpYWJsZXMoKTogYm9vbGVhbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5oYXNWYXJpYWJsZXMoKSk7XG4gICAgfVxuXG4gICAgb3BlcmF0b3JWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gWy4uLm5ldyBTZXQodGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmdyb3VwVmFyaWFibGVzKCkpLmZsYXQoKSldO1xuICAgIH1cblxuICAgIGNsb25lKCk6IE1hdGhKYXhPcGVyYXRvciB7XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5jbG9uZSgpKTtcbiAgICAgICAgY29uc3Qgc29sdXRpb24gPSB0aGlzLnNvbHV0aW9uID8gdGhpcy5zb2x1dGlvbi5jbG9uZSgpIDogdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm4gTWF0aEpheE9wZXJhdG9yLmNyZWF0ZSh0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xuICAgIH1cblxuICAgIHRvU3RyaW5nU29sdXRpb24oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKSArICcgPSAnICsgdGhpcy5zb2x1dGlvbj8udG9TdHJpbmcoKTtcbiAgICB9XG5cbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciAmJlxuICAgICAgICAgICAgdGhpcy5vcGVyYXRvciA9PT0gaXRlbS5vcGVyYXRvciAmJlxuICAgICAgICAgICAgdGhpcy5ncm91cHMubGVuZ3RoID09PSBpdGVtLmdyb3Vwcy5sZW5ndGggJiZcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLmV2ZXJ5KCh0LCBpbmRleCkgPT4gdC5lcXVhbHMoaXRlbS5ncm91cHNbaW5kZXhdKSk7XG4gICAgfVxuICAgIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH18bnVsbCAgeyByZXR1cm4gbnVsbDsgfSAgXG4gICAgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0SXRlbTogTWF0aEpheE9wZXJhdG9yIHwgVG9rZW4pOiBib29sZWFuIHtyZXR1cm4gZmFsc2U7fVxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xuICAgICAgICBcblxuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHNlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy5vcGVyYXRvcik7XG4gICAgICAgIGlmICghbWV0YWRhdGEpIHJldHVybiAnJztcbiAgICAgICAgaWYobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM+Mnx8bWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM8MSl7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbnVtYmVyIG9mIHBvc2l0aW9ucyBmb3IgYXNzb2NpYXRpdml0eTogJHttZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uc31gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gbWV0YWRhdGEubGF0ZXg7XG4gICAgICAgIGxldCBpbmRleD0wO1xuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XG4gICAgICAgIGNvbnN0IGdyb3VwQnJhY2tldFR5cGU9KHBvczogeyBicmFja2V0VHlwZTogQnJhY2tldFR5cGU7IGlzQnJhY2tldE9wdGlvbmFsOiBib29sZWFuIH0sZ3JvdXA6IE1hdGhHcm91cCk9PntcbiAgICAgICAgICAgIGlmKCFwb3MuaXNCcmFja2V0T3B0aW9uYWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHBvcy5icmFja2V0VHlwZVxuICAgICAgICAgICAgcmV0dXJuIGdyb3VwLnNpbmd1bGFyKCk/QnJhY2tldFR5cGUuTm9uZTpwb3MuYnJhY2tldFR5cGVcbiAgICAgICAgfVxuXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLHRydWUpLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4LTFdLHRoaXMuZ3JvdXBzW2luZGV4XSxpbmRleCk7XG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XS50b1N0cmluZygpLGdyb3VwQnJhY2tldFR5cGUoaXRlbSx0aGlzLmdyb3Vwc1tpbmRleF0pKTtcbiAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsZmFsc2UpLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4XSx0aGlzLmdyb3Vwc1tpbmRleCsxXSxpbmRleClcbiAgICAgICAgICAgIHN0cmluZyArPSB3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLnRvU3RyaW5nKCksZ3JvdXBCcmFja2V0VHlwZShpdGVtLHRoaXMuZ3JvdXBzW2luZGV4XSkpO1xuICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGN1c3RvbUZvcm1hdHRlcikgXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxuICAgICAgICByZXR1cm4gc3RyaW5nLnRyaW0oKTtcbiAgICB9XG4gICAgcGFyc2VNYXRoamF4T3BlcmF0b3IoKSB7XG4gICAgICAgIHBhcnNlT3BlcmF0b3IodGhpcyk7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIEVxdWFsc09wZXJhdG9yIGV4dGVuZHMgTWF0aEpheE9wZXJhdG9ye1xuXG59XG5leHBvcnQgY2xhc3MgRGl2aXNpb25PcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvcntcblxufVxuXG5leHBvcnQgY2xhc3MgTXVsdGlwbGljYXRpb25PcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvciB7XG4gICAgY29uc3RydWN0b3IoZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwKSB7XG4gICAgICAgIHN1cGVyKFwiTXVsdGlwbGljYXRpb25cIiwgMiwgZ3JvdXBzLCBzb2x1dGlvbiwgdHJ1ZSk7XG4gICAgICAgIHRoaXMuY29tbXV0YXRpdmUgPSB0cnVlO1xuICAgICAgICB0aGlzLnJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCk7XG4gICAgfVxuXG4gICAgcmVtb3ZlTXVsdGlwbGljYXRpb25EZXB0aHMoKXtcbiAgICAgICAgd2hpbGUodGhpcy5ncm91cHMuc29tZSgoZzogTWF0aEdyb3VwKT0+IGcuc2luZ3VsYXIoKSYmZy5nZXRJdGVtcygpWzBdIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcikpe1xuICAgICAgICAgICAgY29uc3QgZ3JvdXA9dGhpcy5ncm91cHMuZmluZCgoZzogTWF0aEdyb3VwKT0+IGcuc2luZ3VsYXIoKSYmZy5nZXRJdGVtcygpWzBdIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcilcbiAgICAgICAgICAgIGlmKGdyb3VwKVxuICAgICAgICAgICAgdGhpcy5ncm91cHMuc3BsaWNlKHRoaXMuZ3JvdXBzLmluZGV4T2YoZ3JvdXApLDEsLi4uKGdyb3VwLmdldEl0ZW1zKClbMF0gYXMgTXVsdGlwbGljYXRpb25PcGVyYXRvcikuZ3JvdXBzKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhdGljIGFzT2NjdXJyZW5jZUdyb3VwKG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcixvY2N1cnJlbmNPZjogc3RyaW5nfFRva2VufE1hdGhHcm91cCk6IE11bHRpcGxpY2F0aW9uT3BlcmF0b3Ige1xuICAgICAgICBvY2N1cnJlbmNPZj10eXBlb2Ygb2NjdXJyZW5jT2Y9PT1cInN0cmluZ1wiP1xuICAgICAgICAgICAgbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKG9jY3VycmVuY09mKV0pOm9jY3VycmVuY09mIGluc3RhbmNlb2YgVG9rZW4/XG4gICAgICAgICAgICAgICAgbmV3IE1hdGhHcm91cChbb2NjdXJyZW5jT2ZdKTpvY2N1cnJlbmNPZjtcblxuICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoW25ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNlc0NvdW50KV0pLG9jY3VycmVuY09mXSlcbiAgICB9XG4gICAgXG4gICAgb3ZlcnJpZGUgZ2V0T2NjdXJyZW5jZUdyb3VwKCk6IHsgb2NjdXJyZW5jZXNDb3VudDogbnVtYmVyOyBvY2N1cnJlbmNPZjogTWF0aEdyb3VwW10gfSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuZ3JvdXBzLnJlZHVjZShcbiAgICAgICAgICAgIChhY2M6IHsgdG90YWxOdW06IG51bWJlcjsgYXJyOiBNYXRoR3JvdXBbXSB9LCBpdGVtOiBNYXRoR3JvdXApID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5nZXRPcGVyYWJsZVZhbHVlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgYWNjLnRvdGFsTnVtICs9IGl0ZW0uZ2V0T3BlcmFibGVWYWx1ZSgpITtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhY2MuYXJyLnB1c2goaXRlbSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyB0b3RhbE51bTogMCwgYXJyOiBbXSB9XG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB7IG9jY3VycmVuY2VzQ291bnQ6IHJlc3VsdC50b3RhbE51bSwgb2NjdXJyZW5jT2Y6IHJlc3VsdC5hcnIgfTtcbiAgICB9XG5cbiAgICBhZGRUb09jY3VycmVuY2VHcm91cCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IG51bWJlckdyb3VwID0gdGhpcy5ncm91cHMuZmluZChncm91cCA9PiBncm91cC5zaW5nbGVOdW1iZXIoKSk7XG4gICAgICAgIGlmIChudW1iZXJHcm91cCkge1xuICAgICAgICAgICAgbnVtYmVyR3JvdXAuc2luZ2xlVG9rZW5TZXQodmFsdWUsIHRydWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5ncm91cHMucHVzaChuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4oMSArIHZhbHVlKV0pKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG92ZXJyaWRlIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7XG4gICAgICAgIGNvbnN0IGlzVmFsaWRJdGVtID0gdGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCB0ZXN0SXRlbSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3I7XG4gICAgICAgIGlmICghaXNWYWxpZEl0ZW0pIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIFxuICAgICAgICBjb25zdCBjdXJyZW50R3JvdXAgPSB0aGlzLmdldE9jY3VycmVuY2VHcm91cCgpO1xuICAgICAgICBpZiAoIWN1cnJlbnRHcm91cCkgcmV0dXJuIGZhbHNlO1xuICAgIFxuICAgICAgICBjb25zdCBjdXJyZW50R3JvdXBJdGVtcyA9IGN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5mbGF0TWFwKGdyb3VwID0+IGdyb3VwLmdldEl0ZW1zKCkpO1xuICAgIFxuICAgICAgICBpZiAodGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbikge1xuICAgICAgICAgICAgY29uc3QgaXNTaW5nbGVJdGVtTWF0Y2ggPSBjdXJyZW50R3JvdXBJdGVtcy5sZW5ndGggPT09IDEgJiYgY3VycmVudEdyb3VwSXRlbXNbMF0uZXF1YWxzKHRlc3RJdGVtKTtcbiAgICAgICAgICAgIGlmIChpc1NpbmdsZUl0ZW1NYXRjaCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkVG9PY2N1cnJlbmNlR3JvdXAoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaXNTaW5nbGVJdGVtTWF0Y2g7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0ZXN0SXRlbUdyb3VwID0gdGVzdEl0ZW0uZ2V0T2NjdXJyZW5jZUdyb3VwKCk7XG4gICAgICAgIGlmICghdGVzdEl0ZW1Hcm91cCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cEl0ZW1zID0gdGVzdEl0ZW1Hcm91cC5vY2N1cnJlbmNPZjtcbiAgICAgICAgY29uc3QgYXJlR3JvdXBzTWF0Y2hpbmcgPWN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5sZW5ndGggPT09IHRlc3RJdGVtR3JvdXBJdGVtcy5sZW5ndGggJiZcbiAgICAgICAgICAgIGN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5ldmVyeSgoY3VycmVudFN1Ykdyb3VwOiBNYXRoR3JvdXApID0+XG4gICAgICAgICAgICAgICAgdGVzdEl0ZW1Hcm91cEl0ZW1zLnNvbWUoKHRlc3RTdWJHcm91cDogTWF0aEdyb3VwKSA9PiBcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFN1Ykdyb3VwLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdFN1Ykdyb3VwKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgaWYgKGFyZUdyb3Vwc01hdGNoaW5nKSB7IFxuICAgICAgICAgICAgdGhpcy5hZGRUb09jY3VycmVuY2VHcm91cCh0ZXN0SXRlbUdyb3VwLm9jY3VycmVuY2VzQ291bnQpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gICAgXG4gICAgXG5cbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXsgXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gJ1xcXFxjZG90ICc7XG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcbiAgICAgICAgY29uc3QgdG9BZGRDZG90PSh0aGlzR3JvdXA6IE1hdGhHcm91cCxuZXh0R3JvdXA/Ok1hdGhHcm91cCk9PntcbiAgICAgICAgICAgIGlmKCFuZXh0R3JvdXApcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgaWYobmV4dEdyb3VwLmlzU2luZ2xlVmFyKCl8fHRoaXNHcm91cC5pc1NpbmdsZVZhcigpKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVvcmRlcmVkR3JvdXBzPXRoaXMuZ3JvdXBzLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIGlmIChhLnNpbmdsZU51bWJlcigpICYmICFiLnNpbmdsZU51bWJlcigpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoIWEuc2luZ2xlTnVtYmVyKCkgJiYgYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIDE7XG4gICAgICAgIFxuICAgICAgICAgICAgaWYgKGEuc2luZ3VsYXIoKSAmJiAhYi5zaW5ndWxhcigpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoIWEuc2luZ3VsYXIoKSAmJiBiLnNpbmd1bGFyKCkpIHJldHVybiAxO1xuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVvcmRlcmVkR3JvdXBzLmZvckVhY2goKGdyb3VwLGluZGV4KSA9PiB7XG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKGdyb3VwLnRvU3RyaW5nKCksIGdyb3VwLnNpbmd1bGFyKCk/QnJhY2tldFR5cGUuTm9uZTpCcmFja2V0VHlwZS5QYXJlbnRoZXNlcyk7XG4gICAgICAgICAgICBpZiAodG9BZGRDZG90KGdyb3VwLHJlb3JkZXJlZEdyb3Vwc1tpbmRleCsxXSkpXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xuICAgIH1cblxuICAgIC8qXG4gICAgdGhpcy5ncm91cHMgPSBbWzEsIDIsIDNdLFs0LCA1LCA2XSxbNywgOCwgOV1dXG4gICAgRXhwZWN0ZWQgT3V0cHV0OlxuICAgIFtcbiAgICAgICAgMSo0LCAxKjUsIDEqNiwgMSo3LCAxKjgsIDEqOSxcbiAgICAgICAgMio0LCAyKjUsIDIqNiwgMio3LCAyKjgsIDIqOSxcbiAgICAgICAgMyo0LCAzKjUsIDMqNiwgMyo3LCAzKjgsIDMqOSxcbiAgICAgICAgNCo3LCA0KjgsIDQqOSxcbiAgICAgICAgNSo3LCA1KjgsIDUqOSxcbiAgICAgICAgNio3LCA2KjgsIDYqOVxuICAgIF0gIFxuICAgICovXG4gICAgcGFyc2VNYXRoamF4T3BlcmF0b3IoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IG11bHRBcnI9dGhpcy5lbGltaW5hdEdyb3Vwc1dpdGhNdWx0aXBsZVRlcm1zKCkuZ2V0SXRlbXMoKTtcbiAgICAgICAgY29uc3QgbmFtZT1tdWx0QXJyLm1hcCgobzogTXVsdGlwbGljYXRpb25PcGVyYXRvcik9PiB7by5wYXJzZSgpO3JldHVybiBvLnNvbHV0aW9ufSlcbiAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKG5hbWUpO1xuICAgICAgICB0aGlzLnNvbHV0aW9uLmNvbWJpbmluZ0xpa2VUZXJtcygpO1xuICAgIH1cbiAgICBlbGltaW5hdEdyb3Vwc1dpdGhNdWx0aXBsZVRlcm1zKCk6TWF0aEdyb3VwIHtcbiAgICAgICAgbGV0IG9wZXJhdG9yc0FjY3VtdWxhdGlvbjogTXVsdGlwbGljYXRpb25PcGVyYXRvcltdID0gW107XG4gICAgICAgIFxuICAgICAgICBjb25zdCBzaW5nbGVUZXJtR3JvdXBzID0gdGhpcy5ncm91cHMuZmlsdGVyKGdyb3VwID0+IGdyb3VwLnNpbmd1bGFyKCkpO1xuICAgICAgICBjb25zdCBtdWx0aVRlcm1Hcm91cHMgPSB0aGlzLmdyb3Vwcy5maWx0ZXIoZ3JvdXAgPT4gIWdyb3VwLnNpbmd1bGFyKCkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3Qgc2luZ2xlc01hdGhHcm91cCA9IHNpbmdsZVRlcm1Hcm91cHMubGVuZ3RoICE9PSAwIFxuICAgICAgICAgICAgPyBbbmV3IE1hdGhHcm91cChbbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3Ioc2luZ2xlVGVybUdyb3VwcyldKV0gXG4gICAgICAgICAgICA6IFtdO1xuICAgICAgICBsZXQgZ3JvdXBzID0gWy4uLnNpbmdsZXNNYXRoR3JvdXAsIC4uLm11bHRpVGVybUdyb3Vwc107XG4gICAgXG4gICAgICAgIHdoaWxlIChncm91cHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBBID0gZ3JvdXBzLnNoaWZ0KCk7XG4gICAgICAgICAgICBjb25zdCBncm91cEIgPSBncm91cHMuc2hpZnQoKTtcbiAgICBcbiAgICAgICAgICAgIGlmICghZ3JvdXBBIHx8ICFncm91cEIpIGJyZWFrO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgZ3JvdXBBSXRlbXMgPSBncm91cEEuZ2V0SXRlbXMoKTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQkl0ZW1zID0gZ3JvdXBCLmdldEl0ZW1zKCk7XG4gICAgICAgICAgICBvcGVyYXRvcnNBY2N1bXVsYXRpb24gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYSBvZiBncm91cEFJdGVtcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYiBvZiBncm91cEJJdGVtcykge1xuICAgICAgICAgICAgICAgICAgICBvcGVyYXRvcnNBY2N1bXVsYXRpb24ucHVzaChcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoT3BlcmF0b3IoW2EuY2xvbmUoKSwgYi5jbG9uZSgpXSkpXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgZ3JvdXBzLnVuc2hpZnQobmV3IE1hdGhHcm91cChvcGVyYXRvcnNBY2N1bXVsYXRpb24pKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZ3JvdXBzWzBdO1xuICAgIH1cbiAgICBcblxuICAgIHBhcnNlKCl7XG4gICAgICAgIGNvbnN0IHsgbnVtYmVycywgb3RoZXIgfSA9IHRoaXMuZ3JvdXBzLnJlZHVjZSgocmVzdWx0OiB7IG51bWJlcnM6IE1hdGhHcm91cFtdOyBvdGhlcjogTWF0aEdyb3VwW10gfSwgaXRlbTogTWF0aEdyb3VwKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uc2luZ2xlTnVtYmVyKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lm51bWJlcnMucHVzaChpdGVtKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQub3RoZXIucHVzaChpdGVtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IG51bWJlcnM6IFtdLCBvdGhlcjogW10gfVxuICAgICAgICApO1xuICAgICAgICBsZXQgdmFsdWU9MTtcbiAgICAgICAgbnVtYmVycy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICAgICAgICAgIHZhbHVlKj0oZ3JvdXAuZ2V0SXRlbXMoKVswXWFzIFRva2VuKS5nZXROdW1iZXJWYWx1ZSgpXG4gICAgICAgIH0pO1xuICAgICAgICBpZih0aGlzLmdyb3Vwcy5sZW5ndGg9PT0wKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXCIpO1xuICAgICAgICBpZigobnVtYmVycy5sZW5ndGg+MCYmb3RoZXIubGVuZ3RoPT09MCl8fHZhbHVlPT09MCl7XG4gICAgICAgICAgICB0aGlzLnNvbHV0aW9uPW5ldyBNYXRoR3JvdXAobmV3IFRva2VuKHZhbHVlKSk7cmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRlc3Q9KG1haW5Hcm91cDogYW55LCB0ZXN0R3JvdXA6IGFueSk9PntcbiAgICAgICAgICAgIGlmKG1haW5Hcm91cCBpbnN0YW5jZW9mIE1hdGhHcm91cCYmdGVzdEdyb3VwIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWFpbkdyb3VwLmlzUG93R3JvdXBNYXRjaCh0ZXN0R3JvdXApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmlsdGVyZWQ9ZmlsdGVyQnlUZXN0Q29uc3Qob3RoZXIsdGVzdCk7XG4gICAgICAgIGNvbnN0IGFycj1bLi4uZmlsdGVyZWRdO1xuICAgICAgICBpZih2YWx1ZSE9PTEpXG4gICAgICAgICAgICBhcnIucHVzaChuZXcgVG9rZW4odmFsdWUpKTtcblxuICAgICAgICBpZihhcnIubGVuZ3RoPjEpe1xuICAgICAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKFtuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aE9wZXJhdG9yKGFycikpXSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKGFyclswXSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhKGdyb3VwczogTWF0aEdyb3VwW10pe1xuICAgIGNvbnN0IGFyZUFsbEdyb3Vwc1Npbmd1bGFyPWdyb3Vwcy5ldmVyeShnPT5nLnNpbmd1bGFyKCkpXG4gICAgbGV0IHZhbHVlPTA7XG59XG5cblxuZnVuY3Rpb24gZmlsdGVyQnlUZXN0Q29uc3QoXG4gICAgaXRlbXM6IGFueVtdLFxuICAgIHRlc3Q6IChtYWluSXRlbTogYW55LCB0ZXN0SXRlbTogYW55KSA9PiBib29sZWFuXG4pOiBhbnlbXSB7XG4gICAgbGV0IGluZGV4ID0gMDtcbiAgICB3aGlsZSAoaW5kZXggPCBpdGVtcy5sZW5ndGgpIHtcbiAgICAgICAgY29uc3QgbWFpbkl0ZW0gPSBpdGVtc1tpbmRleF07XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsTGVuZ3RoID0gaXRlbXMubGVuZ3RoO1xuXG4gICAgICAgIGl0ZW1zID0gaXRlbXMuZmlsdGVyKChvdGhlckl0ZW0sIG90aGVySW5kZXgpID0+IHtcbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gb3RoZXJJbmRleCkgcmV0dXJuIHRydWU7IC8vIEtlZXAgY3VycmVudCBpdGVtXG4gICAgICAgICAgICBjb25zdCB0ZW1wPSF0ZXN0KG1haW5JdGVtLCBvdGhlckl0ZW0pO1xuICAgICAgICAgICAgcmV0dXJuIHRlbXBcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUmVzdGFydCBpdGVyYXRpb24gaWYgaXRlbXMgd2VyZSByZW1vdmVkXG4gICAgICAgIGlmIChpdGVtcy5sZW5ndGggPCBvcmlnaW5hbExlbmd0aCkge1xuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gaXRlbXM7XG59XG5cblxuZnVuY3Rpb24gdHJpZ29ub21ldHJpY0lkZW50aXRpZXMoKXtcblxufVxuXG5leHBvcnQgdHlwZSBNYXRoR3JvdXBJdGVtPVRva2VufE1hdGhKYXhPcGVyYXRvclxuXG5leHBvcnQgY2xhc3MgTWF0aEdyb3VwIHtcbiAgICBwcml2YXRlIGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10gPSBbXTtcbiAgICAvL292ZXJ2aWV3OiBNYXRoT3ZlcnZpZXdcbiAgICBcbiAgICBjb25zdHJ1Y3RvcihpdGVtcz86IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pIHtcbiAgICAgICAgaWYoaXRlbXMpdGhpcy5zZXRJdGVtcyhpdGVtcyk7XG4gICAgfVxuICAgIGdldEl0ZW1zKCk6IE1hdGhHcm91cEl0ZW1bXSB7cmV0dXJuIHRoaXMuaXRlbXM7fVxuICAgIHNldEl0ZW0oaXRlbTogTWF0aEdyb3VwSXRlbSxpbmRleDpudW1iZXIpe1xuICAgICAgICB0aGlzLml0ZW1zW2luZGV4XT1pdGVtO1xuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KClcbiAgICB9XG4gICAgcmVwbGFjZUl0ZW1DZWxsKGl0ZW06IE1hdGhHcm91cEl0ZW18TWF0aEdyb3VwLGluZGV4Om51bWJlcil7XG4gICAgICAgIHRoaXMuaXRlbXMuc3BsaWNlKGluZGV4LDEsLi4uZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW0pKVxuICAgIH1cbiAgICBzZXRJdGVtcyhpdGVtczogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSkge1xuICAgICAgICB0aGlzLml0ZW1zID0gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW1zKTtcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpICAgIFxuICAgIH1cbiAgICBncm91cFZhcmlhYmxlcygpOiBzdHJpbmdbXSB7XG4gICAgICAgIGNvbnN0IHZhcmlhYmxlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtOiBNYXRoR3JvdXBJdGVtKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuICYmIGl0ZW0uaXNWYXIoKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXZhcmlhYmxlcy5jb250YWlucyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlcy5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHZhcmlhYmxlcztcbiAgICB9XG4gICAgXG4gICAgdXBkYXRlT3ZlcnZpZXcoKXsvKlxuICAgICAgICB0aGlzLm92ZXJ2aWV3PW5ldyBNYXRoT3ZlcnZpZXcoKVxuICAgICAgICB0aGlzLm92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3c2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcykqL1xuICAgIH1cbiAgICBzaW5nbGVUb2tlblNldCh2YWx1ZTogbnVtYmVyLHRvQWRkPzogYm9vbGVhbil7XG4gICAgICAgIGNvbnN0IHRva2VuPXRoaXMuaXRlbXNbMF0gYXMgVG9rZW47XG4gICAgICAgIGNvbnN0IG5ld1ZhbHVlPXRvQWRkP3ZhbHVlK3Rva2VuLmdldE51bWJlclZhbHVlKCk6dmFsdWU7XG4gICAgICAgIGlmKHRoaXMuc2luZ3VsZVRva2VuKCkpe1xuICAgICAgICAgICAgdG9rZW4uc2V0VmFsdWUobmV3VmFsdWUpXG4gICAgICAgIH1cbiAgICB9XG4gICAgY2xvbmUoKTogTWF0aEdyb3VwIHtcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoR3JvdXAodGhpcy5pdGVtcy5tYXAoaXRlbT0+aXRlbS5jbG9uZSgpKSk7XG4gICAgfVxuXG4gICAgaGFzT3BlcmF0b3IoKTogdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSgoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcik7fVxuICAgIGRvZXNudEhhdmVPcGVyYXRvcigpOiAgdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuICF0aGlzLmhhc09wZXJhdG9yKCk7fVxuICAgIHNpbmdsZU51bWJlcigpe3JldHVybiB0aGlzLnNpbmd1bGFyKCkmJnRoaXMubnVtYmVyT25seSgpfVxuICAgIG51bWJlck9ubHkoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuZXZlcnkodCA9PiAodCBpbnN0YW5jZW9mIFRva2VuJiYhdC5pc1ZhcigpKSk7fVxuICAgIGhhc1ZhcmlhYmxlcygpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKHQgPT4gdCBpbnN0YW5jZW9mIFRva2VuJiZ0LmlzVmFyKCkpO31cblxuICAgIHNpbmd1bGFyKCk6Ym9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoID09PSAxICYmIHRoaXMuaXRlbXNbMF0gIT09IHVuZGVmaW5lZDt9XG4gICAgc2luZ3VsZVRva2VuKCk6IHRoaXMgaXMgeyBpdGVtczogW1Rva2VuXSB9IHtyZXR1cm4gdGhpcy5zaW5ndWxhcigpICYmIHRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbjt9XG4gICAgaXNPcGVyYWJsZSgpe3JldHVybiB0cnVlfVxuXG4gICAgZ2V0T3BlcmFibGVWYWx1ZSgpOiBudW1iZXIgfCBudWxsXG4gICAge1xuICAgICAgICBjb25zdCBpdGVtcyA9IHRoaXMuaXRlbXM7XG4gICAgICAgIGlmICh0aGlzLm51bWJlck9ubHkoKSkge1xuICAgICAgICAgICAgbGV0IHZhbHVlPTA7XG4gICAgICAgICAgICBpdGVtcy5mb3JFYWNoKChpdGVtOiBUb2tlbikgPT4ge1xuICAgICAgICAgICAgICAgIHZhbHVlICs9IGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpc1NpbmdsZVZhcigpe1xuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdYXMgVG9rZW5cbiAgICAgICAgcmV0dXJuIHRoaXMuc2luZ3VsZVRva2VuKCkmJnRva2VuLmlzVmFyKClcbiAgICB9XG4gICAgZ2V0U2luZ2xlVmFyKCl7XG4gICAgICAgIGlmKCF0aGlzLmlzU2luZ2xlVmFyKCkpcmV0dXJuIG51bGw7XG4gICAgICAgIHJldHVybiAodGhpcy5pdGVtc1swXWFzIFRva2VuKS5nZXRTdHJpbmdWYWx1ZSgpO1xuICAgIH1cblxuICAgIGlzUG93R3JvdXBNYXRjaChncm91cDogTWF0aEdyb3VwKTpib29sZWFue1xuICAgICAgICBpZih0aGlzLml0ZW1zLmxlbmd0aCE9PTEpcmV0dXJuIGZhbHNlXG4gICAgICAgIGlmKHRoaXMuaXNTaW5nbGVWYXIoKSYmZ3JvdXAuaXNTaW5nbGVWYXIoKSYmdGhpcy5lcXVhbHMoZ3JvdXApKXtcbiAgICAgICAgICAgIHRoaXMuaXRlbXM9W01hdGhKYXhPcGVyYXRvci5jcmVhdGUoXCJQb3dlclwiLDIsW25ldyBNYXRoR3JvdXAodGhpcy5pdGVtc1swXSksbmV3IE1hdGhHcm91cChuZXcgVG9rZW4oMikpXSldXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmVxdWFscyhncm91cClcbiAgICB9XG5cbiAgICBpc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVyOiBNYXRoR3JvdXApe1xuICAgICAgICBjb25zdCBib3RoU2luZ3VsYXI9dGhpcy5zaW5ndWxhcigpJiZvdGhlci5zaW5ndWxhcigpXG4gICAgICAgIGNvbnN0IGZpcnN0SXRlbU1hdGhKYXhvT2VyYXRvcj10aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yJiZvdGhlci5nZXRJdGVtcygpWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yXG4gICAgICAgIGlmKCFib3RoU2luZ3VsYXImJiFmaXJzdEl0ZW1NYXRoSmF4b09lcmF0b3IpcmV0dXJuIGZhbHNlO1xuICAgICAgICBjb25zdCBhPSh0aGlzLml0ZW1zWzBdYXMgTWF0aEpheE9wZXJhdG9yKS5pc09jY3VycmVuY2VHcm91cE1hdGNoKG90aGVyLmdldEl0ZW1zKClbMF0pXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMob3RoZXIpXG4gICAgfVxuXG4gICAgZXF1YWxzKGl0ZW06IFRva2VufE1hdGhKYXhPcGVyYXRvcnxNYXRoR3JvdXApe1xuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgVG9rZW4pe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09MSYmdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLml0ZW1zWzBdLmVxdWFscyhpdGVtKTtcbiAgICAgICAgfVxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3ImJnRoaXMuaXRlbXNbMF0uZXF1YWxzKGl0ZW0pXG4gICAgICAgIH1cbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT1pdGVtLml0ZW1zLmxlbmd0aCYmdGhpcy5pdGVtcy5ldmVyeSgodDogTWF0aEdyb3VwSXRlbSk9PntcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5pdGVtcy5zb21lKChpKT0+dC5lcXVhbHMoaSkpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBnZXRJZCgpe1xuICAgICAgICByZXR1cm4gJ01hdGhHcm91cCdcbiAgICB9XG4gICAgY29tYmluaW5nTGlrZVRlcm1zKCkge1xuICAgICAgICBjb25zdCBvdmVydmlldyA9IG5ldyBNYXRoT3ZlcnZpZXcoKTtcbiAgICAgICAgb3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKTtcbiAgICAgICAgdGhpcy5zZXRJdGVtcyhvdmVydmlldy5yZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKSk7XG4gICAgICAgIGxldCBpbmRleCA9IDA7XG4gICAgICAgIHdoaWxlIChpbmRleCA8IHRoaXMuaXRlbXMubGVuZ3RoKSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpbmRleF07XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnaW5hbExlbmd0aCA9IHRoaXMuaXRlbXMubGVuZ3RoO1xuICAgICAgICAgICAgICAgIHRoaXMuaXRlbXMgPSB0aGlzLml0ZW1zLmZpbHRlcigob3RoZXJJdGVtOiBNYXRoR3JvdXBJdGVtLCBvdGhlckluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID09PSBvdGhlckluZGV4KSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2ggPSBpdGVtLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2gob3RoZXJJdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICFpc01hdGNoO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLml0ZW1zLmxlbmd0aCA8IG9yaWdpbmFsTGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xuICAgICAgICBsZXQgc3RyaW5nPScnO1xuICAgICAgICBpZighQXJyYXkuaXNBcnJheSh0aGlzLml0ZW1zKSl7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBidXQgcmVjZWl2ZWQ6IFwiK3RoaXMuaXRlbXMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHN0cmluZys9c2hvdWxkQWRkUGx1cyh0aGlzLml0ZW1zW2luZGV4LTFdLGl0ZW0pXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCAmJiAhaXRlbS5zaW5ndWxhcigpKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IGAoJHtpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcil9KWA7XG4gICAgICAgICAgICB9ICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gaXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpO1xuICAgICAgICAgICAgfSBpZiAoY3VzdG9tRm9ybWF0dGVyKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5nID0gY3VzdG9tRm9ybWF0dGVyKGl0ZW0sc3RyaW5nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBzdHJpbmc7XG4gICAgfVxufVxuXG5cblxuY2xhc3MgTWF0aE92ZXJ2aWV3IHtcbiAgICBwcml2YXRlIHZhcmlhYmxlczogTWFwPHN0cmluZywgYW55PjtcbiAgICBwcml2YXRlIG9wZXJhdG9yczogTWFwPHN0cmluZywgYW55PjtcbiAgICBwcml2YXRlIG51bWJlcjogbnVtYmVyO1xuICAgIGdldE51bWJlcigpOiBudW1iZXJ7cmV0dXJuIHRoaXMubnVtYmVyO31cbiAgICBnZXRWYXJpYWJsZXMoKTogTWFwPHN0cmluZywgYW55PntyZXR1cm4gdGhpcy52YXJpYWJsZXM7fVxuICAgIGdldE9wZXJhdG9ycygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLm9wZXJhdG9yczt9XG4gICAgY29uc3RydWN0b3IodmFyaWFibGVzPzogTWFwPHN0cmluZywgYW55PixvcGVyYXRvcnM/OiBNYXA8c3RyaW5nLCBhbnk+LG51bWJlcj86IG51bWJlcil7XG4gICAgICAgIGlmKHZhcmlhYmxlcyl0aGlzLnZhcmlhYmxlcz12YXJpYWJsZXM7XG4gICAgICAgIGlmKG9wZXJhdG9ycyl0aGlzLm9wZXJhdG9ycz1vcGVyYXRvcnM7XG4gICAgICAgIGlmKG51bWJlcil0aGlzLm51bWJlcj1udW1iZXI7XG4gICAgfVxuICAgIGRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHMoaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSkge1xuICAgICAgICB0aGlzLnZhcmlhYmxlcz1uZXcgTWFwKCk7XG4gICAgICAgIHRoaXMub3BlcmF0b3JzPW5ldyBNYXAoKTtcbiAgICAgICAgaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZpdGVtLmlzVmFyKCk6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVmFyaWFibGVzTWFwKGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIFRva2VuJiYhaXRlbS5pc1ZhcigpOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU11bWJlcihpdGVtLmdldE51bWJlclZhbHVlKCkpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3I6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlT3BlcmF0b3JzTWFwKGl0ZW0pO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIGNhdGVnb3J5IGluIE1hdGhPdmVydmlldyBzZXBhcmF0ZUludG9JbmRpdmlkdWFsc1wiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9XG4gICAgdXBkYXRlTXVtYmVyKG51bWJlcjogbnVtYmVyKXsgdGhpcy5udW1iZXI9dGhpcy5udW1iZXI/dGhpcy5udW1iZXIrbnVtYmVyOm51bWJlcjt9XG4gICAgdXBkYXRlVmFyaWFibGVzTWFwKGtleTogc3RyaW5nKXtcbiAgICAgICAgdGhpcy52YXJpYWJsZXMgPz89IG5ldyBNYXA8c3RyaW5nLCB7IGNvdW50OiBudW1iZXI7IGl0ZW1zOiBhbnlbXSB9PigpO1xuICAgICAgICBpZighdGhpcy52YXJpYWJsZXMuaGFzKGtleSkpe3RoaXMudmFyaWFibGVzLnNldChrZXkse2NvdW50OiAwfSl9XG4gICAgICAgIHRoaXMudmFyaWFibGVzLmdldChrZXkpLmNvdW50Kys7XG4gICAgfVxuICAgIHVwZGF0ZU9wZXJhdG9yc01hcChvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcbiAgICAgICAgY29uc3Qga2V5PW9wZXJhdG9yLm9wZXJhdG9yO1xuICAgICAgICBpZighdGhpcy5vcGVyYXRvcnMpIHRoaXMub3BlcmF0b3JzPW5ldyBNYXAoKTtcbiAgICAgICAgaWYoIXRoaXMub3BlcmF0b3JzLmhhcyhrZXkpKXt0aGlzLm9wZXJhdG9ycy5zZXQoa2V5LHtjb3VudDogMCwgaXRlbXM6IFtdfSl9XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5vcGVyYXRvcnMuZ2V0KGtleSkhO1xuICAgICAgICBlbnRyeS5jb3VudCArPSAxO1xuICAgICAgICBlbnRyeS5pdGVtcy5wdXNoKG9wZXJhdG9yKTtcbiAgICB9XG5cbiAgICBoYXNWYXIoKXtyZXR1cm4gdGhpcy52YXJpYWJsZXMmJnRoaXMudmFyaWFibGVzLnNpemU+MH1cbiAgICBoYXNPcCgpe3JldHVybiB0aGlzLm9wZXJhdG9ycyYmdGhpcy5vcGVyYXRvcnMuc2l6ZT4wfVxuICAgIG9ubHlOdW1lcmljKCl7XG4gICAgICAgIHJldHVybiB0aGlzLm51bWJlciYmIXRoaXMuaGFzVmFyKCkmJiF0aGlzLmhhc09wKClcbiAgICB9XG4gICAgcmVjb25zdHJ1Y3RBc01hdGhHcm91cEl0ZW1zKCl7XG4gICAgICAgIGNvbnN0IGl0ZW1zOiBNYXRoR3JvdXBJdGVtW109W107XG4gICAgICAgIGlmKHRoaXMubnVtYmVyKWl0ZW1zLnB1c2gobmV3IFRva2VuKHRoaXMubnVtYmVyKSk7XG4gICAgICAgIHRoaXMudmFyaWFibGVzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmKHZhbHVlLmNvdW50PT09MSl7XG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChuZXcgVG9rZW4oa2V5KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYodmFsdWUuY291bnQ+MSl7XG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChNdWx0aXBsaWNhdGlvbk9wZXJhdG9yLmFzT2NjdXJyZW5jZUdyb3VwKHZhbHVlLmNvdW50LGtleSkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBpZih0aGlzLm9wZXJhdG9ycyl7XG4gICAgICAgICAgICBpdGVtcy5wdXNoKC4uLkFycmF5LmZyb20odGhpcy5vcGVyYXRvcnMudmFsdWVzKCkpLmZsYXRNYXAoKG9wZXJhdG9yOiBhbnkpID0+IG9wZXJhdG9yLml0ZW1zKSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaXRlbXM7XG4gICAgfVxufVxuXG5cblxuXG5cblxuZXhwb3J0IGNsYXNzIFRva2Vue1xuICAgIHByaXZhdGUgdmFsdWU6IG51bWJlcnxzdHJpbmc7XG4gICAgY29uc3RydWN0b3IodmFsdWU6bnVtYmVyfHN0cmluZyl7XG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgfVxuICAgIGdldE51bWJlclZhbHVlKCk6bnVtYmVye3JldHVybiAodGhpcy52YWx1ZSBhcyBudW1iZXIpfVxuICAgIGdldFN0cmluZ1ZhbHVlKCk6c3RyaW5ne3JldHVybiAodGhpcy52YWx1ZSBhcyBzdHJpbmcpfVxuICAgIGdldFZhbHVlKCl7cmV0dXJuIHRoaXMudmFsdWV9XG4gICAgc2V0VmFsdWUodmFsdWU6IG51bWJlcnxzdHJpbmcpe3RoaXMudmFsdWU9dmFsdWU7fVxuICAgIGlzVmFyKCkge3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZyc7fVxuICAgIGVxdWFscyhpdGVtOiBNYXRoR3JvdXBJdGVtKSB7XG4gICAgICAgIHJldHVybiBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJnRoaXMudmFsdWUgPT09IGl0ZW0udmFsdWU7XG4gICAgfVxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xuICAgICAgICBsZXQgc3RyaW5nPScnXG4gICAgICAgIGlmKCF0aGlzLmlzVmFyKCkmJnRoaXMuZ2V0TnVtYmVyVmFsdWUoKTwwKVxuICAgICAgICAgICAgc3RyaW5nKz0nLSc7XG4gICAgICAgIHN0cmluZys9dGhpcy52YWx1ZTtcbiAgICAgICAgaWYoY3VzdG9tRm9ybWF0dGVyKXtcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZztcbiAgICB9XG4gICAgY2xvbmUoKXtyZXR1cm4gbmV3IFRva2VuKHRoaXMudmFsdWUpfVxufVxuXG5cblxuZXhwb3J0IGNsYXNzIEJhc2ljTWF0aEpheFRva2Vuc3tcbiAgICB0b2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPj1bXTtcbiAgICBcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbnM/OiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj4pe1xuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnN8fFtdO1xuICAgIH1cbiAgICBhZGRJbnB1dChtYXRoOiBzdHJpbmcpe1xuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xuICAgIH1cbiAgICB0b2tlbml6ZShtYXRoOiBzdHJpbmcpe1xuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcygpKVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2gocmVnRXhwKCdeJyArIG9wZXJhdG9ycykpO1xuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKEJhc2ljTWF0aEpheFRva2VuLmNyZWF0ZShtYXRjaFswXSkpO1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XG4gICAgICAgICAgICBpZiAoISFtYXRjaClcbiAgICAgICAgICAgIHsgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goQmFzaWNNYXRoSmF4VG9rZW4uY3JlYXRlKHBhcnNlRmxvYXQobWF0Y2hbMF0pKSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL0FkZCBwbHVzIHRvIG1ha2UgaXQgbXVsdGlwbGUgTGV0dGVycy5cbiAgICAgICAgICAgIG1hdGNoPW1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChCYXNpY01hdGhKYXhUb2tlbi5jcmVhdGUobWF0Y2hbMF0pKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY2hhciBcIiR7bWF0aFtpXX1cImApO1xuICAgICAgICB9XG4gICAgICAgdGhpcy5wb3N0UHJvY2Vzc1Rva2VucygpO1xuICAgIH1cblxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XG4gICAgICAgIC8qcnVsZXMgdG8gYWJpZCBieTpcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxuICAgICAgICAqL1xuICAgICAgICB0aGlzLnRva2Vucz1pZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKTtcbiAgICAgICAgdGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHBhcmVuTWFwPXRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXG5cbiAgICAgICAgcGFyZW5NYXAuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGIgLSBhKVxuICAgICAgICAuZm9yRWFjaCgodmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHZhbHVlLCAwLCBuZXcgIEJhc2ljTWF0aEpheFRva2VuKCdvcGVyYXRvcicsJyonKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKVxuICAgIH1cbiAgICBpbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKCkge1xuICAgICAgICBjb25zdCBpc0FCYXNpY01hdGhKYXhUb2tlbkRvdWJsZVJpZ2h0T3A9KHRva2VuPzogYW55KT0+e1xuICAgICAgICAgICAgaWYodG9rZW4mJnRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pe1xuICAgICAgICAgICAgICAgIHJldHVybiBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoWzEsIDJdKS5pbmNsdWRlcyh0b2tlbi5nZXRTdHJpbmdWYWx1ZSgpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogXG4gICAgICAgICAqIEBwYXJhbSBpbmRleCBcbiAgICAgICAgICogQHJldHVybnMgYm9vbGFuID0+IFRydWUgaWYgdGhhciBpc24ndCBhIGRvdWJsZVJpZ2h0IG9wZXJhdG9yLlxuICAgICAgICAgKi9cbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KXx8ISh0aGlzLnRva2Vuc1tpbmRleF0gaW5zdGFuY2VvZiBQYXJlbikpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGZpbmRQYXJlbkluZGV4KGluZGV4LHRoaXMudG9rZW5zKT8ub3BlbjtcbiAgICAgICAgICAgIGlmIChpZHggPT0gbnVsbCB8fCBwYXJlblN0YXRlKHRoaXMudG9rZW5zW2luZGV4ICsgMV0pKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSB0aGlzLnRva2Vuc1tpZHggLSAxXTtcbiAgICAgICAgICAgIHJldHVybiAhaXNBQmFzaWNNYXRoSmF4VG9rZW5Eb3VibGVSaWdodE9wKHByZXZUb2tlbilcbiAgICAgICAgfTtcblxuICAgIFxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy50b2tlbnNbaW5kZXhdO1xuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdG9rZW4uaXNWYWx1ZVRva2VuKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uPSh0b2tlbjogYW55KT0+e1xuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnR5cGVvZiB0b2tlbi5nZXRWYWx1ZSgpPT09J3N0cmluZycmJmhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4uZ2V0U3RyaW5nVmFsdWUoKSlcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlzVmFyPSh0b2tlbjogYW55KT0+e3JldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmdG9rZW4uZ2V0VHlwZSgpPT09J3ZhcmlhYmxlJ31cblxuICAgICAgICBjb25zdCBwcmVjZWRlc1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpbmRleD4wJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgY29uc3QgZm9sbG93c1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpbmRleDx0b2tlbnMubGVuZ3RoLTEmJmlzVmFyKHRva2Vuc1tpbmRleF0pXG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xuICAgICAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGV4PjAmJihwYXJlblN0YXRlKHRva2VuLHRydWUpfHwgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuKXx8cHJlY2VkZXNWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCAtIDEpID8gaW5kZXggOiBudWxsO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLTEmJihwYXJlblN0YXRlKHRva2VuLCl8fGZvbGxvd3NWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8IHRlc3REb3VibGVSaWdodChpbmRleCkgPyBpbmRleCArIDEgOiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtICE9PSBudWxsKTtcbiAgICAgICAgcmV0dXJuIG1hcDtcbiAgICB9XG4gICAgXG5cbiAgICB2YWxpZGF0ZVBsdXNNaW51cygpe1xuICAgICAgICAvLyBQbHVzZXMgYXJlIHNlcGFyYXRvcnMuVGhlcmVmb3JlLCB0aGV5IGRvIG5vdCBuZWVkIHRvIGJlIGhlcmUgQXMgdGhlIGV4cHJlc3Npb24gaXMgdG9rZW5bXVxuICAgICAgICAvL01pbnVzZXMgb24gdGhlIG90aGVyIGhhbmQuY2FuIGVpdGhlciBiZSBhIHNlcGFyYXRvci4gT3IgYSBuZWdhdGl2ZSBzaWduXG4gICAgICAgIGNvbnN0IHBsdXNNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW58UGFyZW4sIGluZGV4OiBhbnkpID0+IHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4mJnRva2VuLmdldFZhbHVlKCkgPT09ICdBZGRpdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcbiAgICAgICAgcGx1c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LDEpXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBtaW51c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbnxQYXJlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiYmdG9rZW4uZ2V0VmFsdWUoKSA9PT0gJ1N1YnRyYWN0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxuICAgICAgICBcbiAgICAgICAgbWludXNNYXAucmV2ZXJzZSgpLmZvckVhY2goKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5leHRUb2tlbiA9IHRoaXMudG9rZW5zW2luZGV4ICsgMV07XG4gICAgICAgICAgICBpZiAobmV4dFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdHlwZW9mIG5leHRUb2tlbi5nZXRWYWx1ZSgpID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIG5leHRUb2tlbi5zZXRWYWx1ZShuZXh0VG9rZW4uZ2V0TnVtYmVyVmFsdWUoKSAqIC0xKVxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgfVxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcixtYXJnaW4/OiBudW1iZXIpe1xuICAgICAgICBtYXJnaW49bWFyZ2lufHwwO1xuICAgICAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtbWFyZ2luO1xuICAgIH1cbiAgICBjbG9uZSgpOiBCYXNpY01hdGhKYXhUb2tlbnMge1xuICAgICAgICByZXR1cm4gbmV3IEJhc2ljTWF0aEpheFRva2Vucyh0aGlzLnRva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uY2xvbmUoKSkpO1xuICAgIH1cbiAgICAvKlxuICAgIFxuICAgIFxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09IFwiKFwiID8gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxuICAgIH1cblxuICAgIGZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XG4gICAgICAgICAgICAgICAgaWYgKG9wZW5JbmRleCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdPy50eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChjbG9zZUluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdPy5pc1ZhbHVlVG9rZW4oKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSkuZmxhdE1hcCgoaXRlbTogYW55KSA9PiBbaXRlbS5vcGVuLCBpdGVtLmNsb3NlXSk7XG4gICAgfSAgICBcbiAgICBcbiAgICBcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXG4gICAgICAgICAgICAgICAgJiYodGhpcy50b2tlbkNvbXBhcmUoXCJ0eXBlXCIsdGhpcy52YWx1ZVRva2VucygpLCB0b2tlbiwgdG9rZW5zW2luZGV4ICsgMV0pKVxuICAgICAgICApKTtcbiAgICAgfVxuICAgIFxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSk7XG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfOiBhbnksIGlkeDogdW5rbm93bikgPT4gIW1hcC5oYXMoaWR4KSk7XG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICBcbiAgICAgICAgY29uc3QgYXJyID0gW1xuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcbiAgICAgICAgXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXG4gICAgfVxuXG4gICAgXG5cbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xuICAgICAgICBpZiAoXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXG4gICAgICAgIClcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cbiAgICB9XG5cbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQ6IGFueSwgbGVuZ3RoOiBudW1iZXIsIG9iamVjdHM6IGFueVtdIHwgVG9rZW4pIHtcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXhwZWN0ZWQgYG9iamVjdHNgIHRvIGJlIGFuIGFycmF5LCBidXQgcmVjZWl2ZWQ6XCIsIG9iamVjdHMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgbGVuZ3RoLCAuLi5vYmplY3RzKTtcbiAgICB9XG5cbiAgICBcblxuICAgIGluZGV4ZXNUb0FkZFBsdXModG9rZW5zOiBhbnlbXSl7XG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcbiAgICB9XG5cbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcbiAgICAgICAgY29uc3QgcmVnRXhwdmFsdWUgPSAodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxuICAgICAgICApO1xuICAgIH1cbiAgICAqL1xufSJdfQ==