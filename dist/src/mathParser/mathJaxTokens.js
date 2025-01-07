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
        const areGroupsMatching = currentGroupItems.length === testItemGroupItems.length &&
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
        console.log(name.map((o) => o.toString()));
        this.solution = new MathGroup(multArr);
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
        this.solution = new MathGroup([new Token(value), ...other]);
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
                // Restart iteration if items were removed
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUFtRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5JLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUV4UixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBSTdDLFNBQVMsU0FBUyxDQUFDLEtBQWEsRUFBRSxJQUFpQjtJQUMvQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ1gsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEIsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEI7WUFDSSxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FDOUIsU0FBYyxFQUNkLFNBQWlDLEVBQ2pDLE9BQTRCLEVBQUU7SUFFOUIsNERBQTREO0lBQzVELElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG1FQUFtRTtJQUNuRSxJQUFJLEtB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SUFDRCxLQUFLO1FBQ0QsT0FBTyxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO0lBQ3ZELENBQUM7SUFHRCxRQUFRLEtBQUcsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFHLE9BQU8sSUFBRSxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsQ0FBQSxDQUFBLENBQUM7SUFFOUQsWUFBWSxLQUFHLE9BQU8sSUFBSSxDQUFDLElBQUksS0FBRyxVQUFVLElBQUUsSUFBSSxDQUFDLElBQUksS0FBRyxRQUFRLENBQUEsQ0FBQSxDQUFDO0lBRW5FLGFBQWE7UUFDVCxJQUFJLE1BQU0sR0FBQyxFQUFFLENBQUE7UUFDYixJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDZixNQUFNLElBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFBO1FBQ2pDLElBQUksSUFBSSxDQUFDLElBQUksS0FBRyxRQUFRO1lBQUUsTUFBTSxJQUFFLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDN0MsT0FBTyxNQUFNLENBQUE7SUFDakIsQ0FBQztJQUNELHFCQUFxQixDQUFDLFNBQWlCO1FBQ25DLElBQUcsSUFBSSxDQUFDLElBQUksS0FBRyxVQUFVLElBQUUsSUFBSSxDQUFDLEtBQUssS0FBRyxRQUFRO1lBQzVDLE9BQU8sS0FBSyxDQUFBO1FBQ2hCLElBQUcsT0FBTyxJQUFJLENBQUMsS0FBSyxLQUFHLFFBQVEsSUFBRSxTQUFTLEtBQUcsTUFBTSxJQUFFLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQztZQUN2RyxPQUFPLEtBQUssQ0FBQTtRQUNoQixPQUFPLElBQUksQ0FBQTtJQUNmLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0IHsgcXVhZCxjYWxjdWxhdGVCaW5vbSxyb3VuZEJ5U2V0dGluZ3MgLGRlZ3JlZXNUb1JhZGlhbnMscmFkaWFuc1RvRGVncmVlcywgY2FsY3VsYXRlRmFjdG9yaWFsfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzXCI7XG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuL2ltVmVyeUxhenlcIjtcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7IEFzc29jaWF0aXZpdHksIEJyYWNrZXRUeXBlLCBNYXRoSmF4T3BlcmF0b3JNZXRhZGF0YSwgbWF0aEpheE9wZXJhdG9yc01ldGFkYXRhLCBPcGVyYXRvclR5cGUgfSBmcm9tIFwic3JjL3V0aWxzL3N0YXRpY0RhdGFcIjtcblxuaW1wb3J0IHsgZmluZFBhcmVuSW5kZXgsIFBhcmVuLGlkUGFyZW50aGVzZXMsIGlzT3BlblBhcmVuLCBpc0Nsb3NlZFBhcmVuIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZSwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgaXNPcGVyYXRvcldpdGhBc3NvY2lhdGl2aXR5LCBzZWFyY2hBbGxNYXRoSmF4T3BlcmF0b3JzQW5kU3ltYm9scywgc2VhcmNoTWF0aEpheE9wZXJhdG9ycywgc2VhcmNoU3ltYm9scyB9IGZyb20gXCIuLi91dGlscy9kYXRhTWFuYWdlclwiO1xuXG5pbXBvcnQgeyBwYXJzZU9wZXJhdG9yIH0gZnJvbSBcIi4vbWF0aEVuZ2luZVwiO1xuaW1wb3J0IHsgaXQgfSBmcm9tIFwibm9kZTp0ZXN0XCI7XG5pbXBvcnQgeyBzaWduYWwgfSBmcm9tIFwiY29kZW1pcnJvclwiO1xuXG5mdW5jdGlvbiB3cmFwR3JvdXAoZ3JvdXA6IHN0cmluZywgd3JhcDogQnJhY2tldFR5cGUpOiBzdHJpbmcge1xuICAgIHN3aXRjaCAod3JhcCkge1xuICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLlBhcmVudGhlc2VzOlxuICAgICAgICAgICAgcmV0dXJuIGAoJHtncm91cH0pYDtcbiAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5DdXJseUJyYWNlczpcbiAgICAgICAgICAgIHJldHVybiBgeyR7Z3JvdXB9fWA7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ3JvdXA7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVlcFNlYXJjaFdpdGhQYXRoKFxuICAgIHN0cnVjdHVyZTogYW55LFxuICAgIHByZWRpY2F0ZTogKGl0ZW06IGFueSkgPT4gYm9vbGVhbixcbiAgICBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW11cbik6IHsgaXRlbTogYW55OyBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdIH0gfCBudWxsIHtcbiAgICAvLyBCYXNlIGNhc2U6IElmIHRoZSBjdXJyZW50IHN0cnVjdHVyZSBtYXRjaGVzIHRoZSBwcmVkaWNhdGVcbiAgICBpZiAocHJlZGljYXRlKHN0cnVjdHVyZSkpIHtcbiAgICAgICAgcmV0dXJuIHsgaXRlbTogc3RydWN0dXJlLCBwYXRoIH07XG4gICAgfVxuXG4gICAgLy8gSWYgaXQncyBhbiBhcnJheSwgcmVjdXJzaXZlbHkgc2VhcmNoIGVhY2ggZWxlbWVudCB3aXRoIGl0cyBpbmRleFxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0cnVjdHVyZSkpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJ1Y3R1cmUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVbaV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGldKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJZiBpdCdzIGFuIG9iamVjdCwgcmVjdXJzaXZlbHkgc2VhcmNoIGl0cyBwcm9wZXJ0aWVzIHdpdGggdGhlaXIga2V5c1xuICAgIGlmIChzdHJ1Y3R1cmUgIT09IG51bGwgJiYgdHlwZW9mIHN0cnVjdHVyZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzdHJ1Y3R1cmUpIHtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RydWN0dXJlLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtrZXldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBrZXldKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSWYgbm8gbWF0Y2ggaXMgZm91bmRcbiAgICByZXR1cm4gbnVsbDtcbn1cbnR5cGUgZm9ybWF0dGFibGVGb3JNYXRoR3JvdXA9TWF0aEdyb3VwSXRlbXxNYXRoR3JvdXB8QmFzaWNNYXRoSmF4VG9rZW5cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pOiBNYXRoR3JvdXBJdGVtW10ge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShpdGVtcykpIHtcbiAgICAgICAgaXRlbXMgPSBbaXRlbXNdO1xuICAgIH1cblxuICAgIGNvbnN0IGZvcm1hdHRlZEl0ZW1zID0gaXRlbXNcbiAgICAgICAgLnJlZHVjZSgoYWNjOiBNYXRoR3JvdXBJdGVtW10sIGl0ZW06IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yIHwgQmFzaWNNYXRoSmF4VG9rZW4pID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYy5jb25jYXQoZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW0uZ2V0SXRlbXMoKSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpIHtcbiAgICAgICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKSB7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0udmFsdWUgJiYgKGl0ZW0udHlwZSA9PT0gXCJudW1iZXJcIiB8fCBpdGVtLnR5cGUgPT09IFwidmFyaWFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgYWNjLnB1c2gobmV3IFRva2VuKGl0ZW0udmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICBgRXhwZWN0ZWQgaXRlbSB0byBiZSBhIG51bWJlciBvciB2YXJpYWJsZSBidXQgcmVjZWl2ZWQ6ICR7aXRlbS52YWx1ZX1gXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgIH0sIFtdKVxuXG4gICAgcmV0dXJuIGZvcm1hdHRlZEl0ZW1zO1xufVxuZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhPcGVyYXRvcihncm91cHM6IChNYXRoR3JvdXBJdGVtfE1hdGhHcm91cClbXSk6TWF0aEdyb3VwW117XG4gICAgY29uc3QgZm9ybWF0dGVkR3JvdXBzID0gZ3JvdXBzXG4gICAgICAgIC5yZWR1Y2UoKGFjYzogTWF0aEdyb3VwW10sIGl0ZW06IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yICkgPT4ge1xuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcbiAgICAgICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xuICAgICAgICAgICAgICAgIGFjYy5wdXNoKG5ldyBNYXRoR3JvdXAoaXRlbSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfSwgW10pXG5cbiAgICByZXR1cm4gZm9ybWF0dGVkR3JvdXBzO1xufVxuXG5mdW5jdGlvbiBzaG91bGRBZGRQbHVzKGdyb3VwMT86IGFueSxncm91cDI/OiBhbnkpe1xuICAgIGlmKCFncm91cDF8fCFncm91cDIpcmV0dXJuICcnO1xuXG4gICAgcmV0dXJuICcrJztcbn1cblxuZnVuY3Rpb24gY2FuQ29tYmluZShtYXRoOiBNYXRoR3JvdXAsb3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XG5cbn1cbmV4cG9ydCBjbGFzcyBNYXRoSmF4T3BlcmF0b3Ige1xuICAgIG9wZXJhdG9yOiBzdHJpbmc7XG4gICAgZ3JvdXBOdW06IG51bWJlciA9IDE7XG4gICAgZ3JvdXBzOiBNYXRoR3JvdXBbXTtcbiAgICBzb2x1dGlvbjogTWF0aEdyb3VwO1xuICAgIGNvbW11dGF0aXZlOiBib29sZWFuO1xuICAgIGlzT3BlcmFibGU6IGJvb2xlYW4gPSB0cnVlO1xuXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKSB7XG4gICAgICAgIGlmIChvcGVyYXRvcikgdGhpcy5vcGVyYXRvciA9IG9wZXJhdG9yO1xuICAgICAgICBpZiAoZ3JvdXBOdW0pIHRoaXMuZ3JvdXBOdW0gPSBncm91cE51bTtcbiAgICAgICAgaWYgKGdyb3VwcykgdGhpcy5ncm91cHMgPSBncm91cHM7XG4gICAgICAgIGlmIChzb2x1dGlvbikgdGhpcy5zb2x1dGlvbiA9IHNvbHV0aW9uO1xuICAgICAgICBpZiAoaXNPcGVyYWJsZSAhPT0gdW5kZWZpbmVkKSB0aGlzLmlzT3BlcmFibGUgPSBpc09wZXJhYmxlO1xuICAgIH1cbiAgICBzdGF0aWMgY3JlYXRlKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbik6IE1hdGhKYXhPcGVyYXRvciB7XG4gICAgICAgIGlmIChvcGVyYXRvciA9PT0gXCJNdWx0aXBsaWNhdGlvblwiKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZ3JvdXBzLCBzb2x1dGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoSmF4T3BlcmF0b3Iob3BlcmF0b3IsIGdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCBpc09wZXJhYmxlKTtcbiAgICB9XG4gICAgdGVzdEdyb3Vwcyh0ZXN0OiAoZ3JvdXA6IE1hdGhHcm91cCkgPT4gYm9vbGVhbik6IGJvb2xlYW5bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAodGVzdCk7XG4gICAgfVxuXG4gICAgbWFwVmFyaWFibGVzKCk6IGJvb2xlYW5bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaGFzVmFyaWFibGVzKCkpO1xuICAgIH1cblxuICAgIG9wZXJhdG9yVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIFsuLi5uZXcgU2V0KHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5ncm91cFZhcmlhYmxlcygpKS5mbGF0KCkpXTtcbiAgICB9XG5cbiAgICBjbG9uZSgpOiBNYXRoSmF4T3BlcmF0b3Ige1xuICAgICAgICBjb25zdCBncm91cHMgPSB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuY2xvbmUoKSk7XG4gICAgICAgIGNvbnN0IHNvbHV0aW9uID0gdGhpcy5zb2x1dGlvbiA/IHRoaXMuc29sdXRpb24uY2xvbmUoKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIE1hdGhKYXhPcGVyYXRvci5jcmVhdGUodGhpcy5vcGVyYXRvciwgdGhpcy5ncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgdGhpcy5pc09wZXJhYmxlKTtcbiAgICB9XG5cbiAgICB0b1N0cmluZ1NvbHV0aW9uKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nKCkgKyAnID0gJyArIHRoaXMuc29sdXRpb24/LnRvU3RyaW5nKCk7XG4gICAgfVxuXG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiZcbiAgICAgICAgICAgIHRoaXMub3BlcmF0b3IgPT09IGl0ZW0ub3BlcmF0b3IgJiZcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLmxlbmd0aCA9PT0gaXRlbS5ncm91cHMubGVuZ3RoICYmXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5ldmVyeSgodCwgaW5kZXgpID0+IHQuZXF1YWxzKGl0ZW0uZ3JvdXBzW2luZGV4XSkpO1xuICAgIH1cbiAgICBnZXRPY2N1cnJlbmNlR3JvdXAoKTogeyBvY2N1cnJlbmNlc0NvdW50OiBudW1iZXI7IG9jY3VycmVuY09mOiBNYXRoR3JvdXBbXSB9fG51bGwgIHsgcmV0dXJuIG51bGw7IH0gIFxuICAgIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7cmV0dXJuIGZhbHNlO31cbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcbiAgICAgICAgZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBNYXRoR3JvdXAsIHdyYXA6IEJyYWNrZXRUeXBlLG9wdGlvbmFsOiBib29sZWFuKTogc3RyaW5nIHtcbiAgICAgICAgICAgIGlmKG9wdGlvbmFsJiZncm91cC5zaW5ndWxhcigpKXJldHVybiBncm91cC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBTdHI9Z3JvdXAudG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKVxuICAgICAgICAgICAgc3dpdGNoICh3cmFwKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5QYXJlbnRoZXNlczpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGAoJHtncm91cFN0cn0pYDtcbiAgICAgICAgICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLkN1cmx5QnJhY2VzOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYHske2dyb3VwU3RyfX1gO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBncm91cFN0cjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcblxuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHNlYXJjaE1hdGhKYXhPcGVyYXRvcnModGhpcy5vcGVyYXRvcik7XG4gICAgICAgIGlmICghbWV0YWRhdGEpIHJldHVybiAnJztcbiAgICAgICAgaWYobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM+Mnx8bWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM8MSl7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbnVtYmVyIG9mIHBvc2l0aW9ucyBmb3IgYXNzb2NpYXRpdml0eTogJHttZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uc31gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gbWV0YWRhdGEubGF0ZXg7XG4gICAgICAgIGxldCBpbmRleD0wO1xuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XG5cbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsdHJ1ZSkuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXgtMV0sdGhpcy5ncm91cHNbaW5kZXhdKSt3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLCBpdGVtLmJyYWNrZXRUeXBlLCBpdGVtLmlzQnJhY2tldE9wdGlvbmFsKTtcbiAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsZmFsc2UpLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4XSx0aGlzLmdyb3Vwc1tpbmRleCsxXSkrd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XSwgaXRlbS5icmFja2V0VHlwZSwgaXRlbS5pc0JyYWNrZXRPcHRpb25hbCk7XG4gICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xuICAgIH1cbiAgICBwYXJzZU1hdGhqYXhPcGVyYXRvcigpIHtcbiAgICAgICAgcGFyc2VPcGVyYXRvcih0aGlzKTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgRXF1YWxzT3BlcmF0b3IgZXh0ZW5kcyBNYXRoSmF4T3BlcmF0b3J7XG5cbn1cbmV4cG9ydCBjbGFzcyBEaXZpc2lvbk9wZXJhdG9yIGV4dGVuZHMgTWF0aEpheE9wZXJhdG9ye1xuXG59XG5cbmV4cG9ydCBjbGFzcyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yIGV4dGVuZHMgTWF0aEpheE9wZXJhdG9yIHtcbiAgICBjb25zdHJ1Y3Rvcihncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXApIHtcbiAgICAgICAgc3VwZXIoXCJNdWx0aXBsaWNhdGlvblwiLCAyLCBncm91cHMsIHNvbHV0aW9uLCB0cnVlKTtcbiAgICAgICAgdGhpcy5jb21tdXRhdGl2ZSA9IHRydWU7XG4gICAgICAgIHRoaXMucmVtb3ZlTXVsdGlwbGljYXRpb25EZXB0aHMoKTtcbiAgICB9XG5cbiAgICByZW1vdmVNdWx0aXBsaWNhdGlvbkRlcHRocygpe1xuICAgICAgICB3aGlsZSh0aGlzLmdyb3Vwcy5zb21lKChnOiBNYXRoR3JvdXApPT4gZy5zaW5ndWxhcigpJiZnLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKSl7XG4gICAgICAgICAgICBjb25zdCBncm91cD10aGlzLmdyb3Vwcy5maW5kKChnOiBNYXRoR3JvdXApPT4gZy5zaW5ndWxhcigpJiZnLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKVxuICAgICAgICAgICAgaWYoZ3JvdXApXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5zcGxpY2UodGhpcy5ncm91cHMuaW5kZXhPZihncm91cCksMSwuLi4oZ3JvdXAuZ2V0SXRlbXMoKVswXSBhcyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKS5ncm91cHMpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGF0aWMgYXNPY2N1cnJlbmNlR3JvdXAob2NjdXJyZW5jZXNDb3VudDogbnVtYmVyLG9jY3VycmVuY09mOiBzdHJpbmd8VG9rZW58TWF0aEdyb3VwKTogTXVsdGlwbGljYXRpb25PcGVyYXRvciB7XG4gICAgICAgIG9jY3VycmVuY09mPXR5cGVvZiBvY2N1cnJlbmNPZj09PVwic3RyaW5nXCI/XG4gICAgICAgICAgICBuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jT2YpXSk6b2NjdXJyZW5jT2YgaW5zdGFuY2VvZiBUb2tlbj9cbiAgICAgICAgICAgICAgICBuZXcgTWF0aEdyb3VwKFtvY2N1cnJlbmNPZl0pOm9jY3VycmVuY09mO1xuXG4gICAgICAgIHJldHVybiBuZXcgTXVsdGlwbGljYXRpb25PcGVyYXRvcihbbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKG9jY3VycmVuY2VzQ291bnQpXSksb2NjdXJyZW5jT2ZdKVxuICAgIH1cbiAgICBcbiAgICBvdmVycmlkZSBnZXRPY2N1cnJlbmNlR3JvdXAoKTogeyBvY2N1cnJlbmNlc0NvdW50OiBudW1iZXI7IG9jY3VycmVuY09mOiBNYXRoR3JvdXBbXSB9IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5ncm91cHMucmVkdWNlKFxuICAgICAgICAgICAgKGFjYzogeyB0b3RhbE51bTogbnVtYmVyOyBhcnI6IE1hdGhHcm91cFtdIH0sIGl0ZW06IE1hdGhHcm91cCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChpdGVtLmdldE9wZXJhYmxlVmFsdWUoKSkge1xuICAgICAgICAgICAgICAgICAgICBhY2MudG90YWxOdW0gKz0gaXRlbS5nZXRPcGVyYWJsZVZhbHVlKCkhO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGFjYy5hcnIucHVzaChpdGVtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IHRvdGFsTnVtOiAwLCBhcnI6IFtdIH1cbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHsgb2NjdXJyZW5jZXNDb3VudDogcmVzdWx0LnRvdGFsTnVtLCBvY2N1cnJlbmNPZjogcmVzdWx0LmFyciB9O1xuICAgIH1cblxuICAgIGFkZFRvT2NjdXJyZW5jZUdyb3VwKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgbnVtYmVyR3JvdXAgPSB0aGlzLmdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLnNpbmdsZU51bWJlcigpKTtcbiAgICAgICAgaWYgKG51bWJlckdyb3VwKSB7XG4gICAgICAgICAgICBudW1iZXJHcm91cC5zaW5nbGVUb2tlblNldCh2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5wdXNoKG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbigxICsgdmFsdWUpXSkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb3ZlcnJpZGUgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0SXRlbTogTWF0aEpheE9wZXJhdG9yIHwgVG9rZW4pOiBib29sZWFuIHtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGlzVmFsaWRJdGVtID0gdGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCB0ZXN0SXRlbSBpbnN0YW5jZW9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3I7XG4gICAgICAgIGlmICghaXNWYWxpZEl0ZW0pIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIFxuICAgICAgICBjb25zdCBjdXJyZW50R3JvdXAgPSB0aGlzLmdldE9jY3VycmVuY2VHcm91cCgpO1xuICAgICAgICBpZiAoIWN1cnJlbnRHcm91cCkgcmV0dXJuIGZhbHNlO1xuICAgIFxuICAgICAgICBjb25zdCBjdXJyZW50R3JvdXBJdGVtcyA9IGN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5mbGF0TWFwKGdyb3VwID0+IGdyb3VwLmdldEl0ZW1zKCkpO1xuICAgIFxuICAgICAgICBpZiAodGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbikge1xuICAgICAgICAgICAgY29uc3QgaXNTaW5nbGVJdGVtTWF0Y2ggPSBjdXJyZW50R3JvdXBJdGVtcy5sZW5ndGggPT09IDEgJiYgY3VycmVudEdyb3VwSXRlbXNbMF0uZXF1YWxzKHRlc3RJdGVtKTtcbiAgICAgICAgICAgIGlmIChpc1NpbmdsZUl0ZW1NYXRjaCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkVG9PY2N1cnJlbmNlR3JvdXAoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaXNTaW5nbGVJdGVtTWF0Y2g7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdGVzdEl0ZW1Hcm91cCA9IHRlc3RJdGVtLmdldE9jY3VycmVuY2VHcm91cCgpO1xuICAgICAgICBpZiAoIXRlc3RJdGVtR3JvdXApIHJldHVybiBmYWxzZTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHRlc3RJdGVtR3JvdXBJdGVtcyA9IHRlc3RJdGVtR3JvdXAub2NjdXJyZW5jT2Y7XG4gICAgXG4gICAgICAgIGNvbnN0IGFyZUdyb3Vwc01hdGNoaW5nID1jdXJyZW50R3JvdXBJdGVtcy5sZW5ndGggPT09IHRlc3RJdGVtR3JvdXBJdGVtcy5sZW5ndGggJiZcbiAgICAgICAgICAgIGN1cnJlbnRHcm91cC5vY2N1cnJlbmNPZi5ldmVyeSgoY3VycmVudFN1Ykdyb3VwOiBNYXRoR3JvdXApID0+XG4gICAgICAgICAgICAgICAgdGVzdEl0ZW1Hcm91cEl0ZW1zLnNvbWUoKHRlc3RTdWJHcm91cDogTWF0aEdyb3VwKSA9PiBcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFN1Ykdyb3VwLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdFN1Ykdyb3VwKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgaWYgKGFyZUdyb3Vwc01hdGNoaW5nKSB7IFxuICAgICAgICAgICAgdGhpcy5hZGRUb09jY3VycmVuY2VHcm91cCh0ZXN0SXRlbUdyb3VwLm9jY3VycmVuY2VzQ291bnQpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gICAgXG4gICAgXG5cbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXsgXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gJ1xcXFxjZG90ICc7XG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcbiAgICAgICAgY29uc3QgdG9BZGRDZG90PSh0aGlzR3JvdXA6IE1hdGhHcm91cCxuZXh0R3JvdXA/Ok1hdGhHcm91cCk9PntcbiAgICAgICAgICAgIGlmKCFuZXh0R3JvdXApcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgaWYobmV4dEdyb3VwLmlzU2luZ2xlVmFyKCl8fHRoaXNHcm91cC5pc1NpbmdsZVZhcigpKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVvcmRlcmVkR3JvdXBzPXRoaXMuZ3JvdXBzLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIGlmIChhLnNpbmdsZU51bWJlcigpICYmICFiLnNpbmdsZU51bWJlcigpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoIWEuc2luZ2xlTnVtYmVyKCkgJiYgYi5zaW5nbGVOdW1iZXIoKSkgcmV0dXJuIDE7XG4gICAgICAgIFxuICAgICAgICAgICAgaWYgKGEuc2luZ3VsYXIoKSAmJiAhYi5zaW5ndWxhcigpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoIWEuc2luZ3VsYXIoKSAmJiBiLnNpbmd1bGFyKCkpIHJldHVybiAxO1xuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVvcmRlcmVkR3JvdXBzLmZvckVhY2goKGdyb3VwLGluZGV4KSA9PiB7XG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKGdyb3VwLnRvU3RyaW5nKCksIGdyb3VwLnNpbmd1bGFyKCk/QnJhY2tldFR5cGUuTm9uZTpCcmFja2V0VHlwZS5QYXJlbnRoZXNlcyk7XG4gICAgICAgICAgICBpZiAodG9BZGRDZG90KGdyb3VwLHJlb3JkZXJlZEdyb3Vwc1tpbmRleCsxXSkpXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xuICAgIH1cblxuICAgIC8qXG4gICAgdGhpcy5ncm91cHMgPSBbWzEsIDIsIDNdLFs0LCA1LCA2XSxbNywgOCwgOV1dXG4gICAgRXhwZWN0ZWQgT3V0cHV0OlxuICAgIFtcbiAgICAgICAgMSo0LCAxKjUsIDEqNiwgMSo3LCAxKjgsIDEqOSxcbiAgICAgICAgMio0LCAyKjUsIDIqNiwgMio3LCAyKjgsIDIqOSxcbiAgICAgICAgMyo0LCAzKjUsIDMqNiwgMyo3LCAzKjgsIDMqOSxcbiAgICAgICAgNCo3LCA0KjgsIDQqOSxcbiAgICAgICAgNSo3LCA1KjgsIDUqOSxcbiAgICAgICAgNio3LCA2KjgsIDYqOVxuICAgIF0gIFxuICAgICovXG4gICAgcGFyc2VNYXRoamF4T3BlcmF0b3IoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IG11bHRBcnI9dGhpcy5lbGltaW5hdEdyb3Vwc1dpdGhNdWx0aXBsZVRlcm1zKCkuZ2V0SXRlbXMoKTtcbiAgICAgICAgY29uc29sZS5sb2cobXVsdEFyci5tYXAoaT0+aS50b1N0cmluZygpKSlcbiAgICAgICAgY29uc3QgbmFtZT1tdWx0QXJyLm1hcCgobzogTXVsdGlwbGljYXRpb25PcGVyYXRvcik9PiB7by5wYXJzZSgpO3JldHVybiBvLnNvbHV0aW9ufSlcbiAgICAgICAgY29uc29sZS5sb2cobmFtZS5tYXAoKG86IE1hdGhHcm91cCk9PiBvLnRvU3RyaW5nKCkpKTtcbiAgICAgICAgdGhpcy5zb2x1dGlvbj1uZXcgTWF0aEdyb3VwKG11bHRBcnIpO1xuICAgICAgICB0aGlzLnNvbHV0aW9uLmNvbWJpbmluZ0xpa2VUZXJtcygpO1xuICAgIH1cbiAgICBlbGltaW5hdEdyb3Vwc1dpdGhNdWx0aXBsZVRlcm1zKCk6TWF0aEdyb3VwIHtcbiAgICAgICAgbGV0IG9wZXJhdG9yc0FjY3VtdWxhdGlvbjogTXVsdGlwbGljYXRpb25PcGVyYXRvcltdID0gW107XG4gICAgICAgIFxuICAgICAgICBjb25zdCBzaW5nbGVUZXJtR3JvdXBzID0gdGhpcy5ncm91cHMuZmlsdGVyKGdyb3VwID0+IGdyb3VwLnNpbmd1bGFyKCkpO1xuICAgICAgICBjb25zdCBtdWx0aVRlcm1Hcm91cHMgPSB0aGlzLmdyb3Vwcy5maWx0ZXIoZ3JvdXAgPT4gIWdyb3VwLnNpbmd1bGFyKCkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3Qgc2luZ2xlc01hdGhHcm91cCA9IHNpbmdsZVRlcm1Hcm91cHMubGVuZ3RoICE9PSAwIFxuICAgICAgICAgICAgPyBbbmV3IE1hdGhHcm91cChbbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3Ioc2luZ2xlVGVybUdyb3VwcyldKV0gXG4gICAgICAgICAgICA6IFtdO1xuICAgICAgICBsZXQgZ3JvdXBzID0gWy4uLnNpbmdsZXNNYXRoR3JvdXAsIC4uLm11bHRpVGVybUdyb3Vwc107XG4gICAgXG4gICAgICAgIHdoaWxlIChncm91cHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBBID0gZ3JvdXBzLnNoaWZ0KCk7XG4gICAgICAgICAgICBjb25zdCBncm91cEIgPSBncm91cHMuc2hpZnQoKTtcbiAgICBcbiAgICAgICAgICAgIGlmICghZ3JvdXBBIHx8ICFncm91cEIpIGJyZWFrO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgZ3JvdXBBSXRlbXMgPSBncm91cEEuZ2V0SXRlbXMoKTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQkl0ZW1zID0gZ3JvdXBCLmdldEl0ZW1zKCk7XG4gICAgICAgICAgICBvcGVyYXRvcnNBY2N1bXVsYXRpb24gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYSBvZiBncm91cEFJdGVtcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYiBvZiBncm91cEJJdGVtcykge1xuICAgICAgICAgICAgICAgICAgICBvcGVyYXRvcnNBY2N1bXVsYXRpb24ucHVzaChcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoT3BlcmF0b3IoW2EuY2xvbmUoKSwgYi5jbG9uZSgpXSkpXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgZ3JvdXBzLnVuc2hpZnQobmV3IE1hdGhHcm91cChvcGVyYXRvcnNBY2N1bXVsYXRpb24pKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZ3JvdXBzWzBdO1xuICAgIH1cbiAgICBcbiAgICBcbiAgIFxuICAgIFxuXG4gICAgcGFyc2UoKXtcbiAgICAgICAgY29uc3QgeyBudW1iZXJzLCBvdGhlciB9ID0gdGhpcy5ncm91cHMucmVkdWNlKChyZXN1bHQ6IHsgbnVtYmVyczogTWF0aEdyb3VwW107IG90aGVyOiBNYXRoR3JvdXBbXSB9LCBpdGVtOiBNYXRoR3JvdXApID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5zaW5nbGVOdW1iZXIoKSkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQubnVtYmVycy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5vdGhlci5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgbnVtYmVyczogW10sIG90aGVyOiBbXSB9XG4gICAgICAgICk7XG4gICAgICAgIGxldCB2YWx1ZT0xO1xuICAgICAgICBudW1iZXJzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgICAgICAgICAgdmFsdWUqPShncm91cC5nZXRJdGVtcygpWzBdYXMgVG9rZW4pLmdldE51bWJlclZhbHVlKClcbiAgICAgICAgfSk7XG4gICAgICAgIGlmKHRoaXMuZ3JvdXBzLmxlbmd0aD09PTApXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcIik7XG4gICAgICAgIGlmKChudW1iZXJzLmxlbmd0aD4wJiZvdGhlci5sZW5ndGg9PT0wKXx8dmFsdWU9PT0wKXtcbiAgICAgICAgICAgIHRoaXMuc29sdXRpb249bmV3IE1hdGhHcm91cChuZXcgVG9rZW4odmFsdWUpKTtyZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNvbHV0aW9uPW5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbih2YWx1ZSksLi4ub3RoZXJdKTtcbiAgICB9XG59XG5cblxuXG5mdW5jdGlvbiBmaWx0ZXJCeVRlc3RDb25zdChcbiAgICBpdGVtczogYW55W10sXG4gICAgdGVzdDogKG1haW5JdGVtOiBhbnksIHRlc3RJdGVtOiBhbnkpID0+IGJvb2xlYW5cbik6IGFueVtdIHtcbiAgICBsZXQgaW5kZXggPSAwO1xuICAgIHdoaWxlIChpbmRleCA8IGl0ZW1zLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBtYWluSXRlbSA9IGl0ZW1zW2luZGV4XTtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxMZW5ndGggPSBpdGVtcy5sZW5ndGg7XG5cbiAgICAgICAgaXRlbXMgPSBpdGVtcy5maWx0ZXIoKG90aGVySXRlbSwgb3RoZXJJbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYgKGluZGV4ID09PSBvdGhlckluZGV4KSByZXR1cm4gdHJ1ZTsgLy8gS2VlcCBjdXJyZW50IGl0ZW1cbiAgICAgICAgICAgIGNvbnN0IHRlbXA9IXRlc3QobWFpbkl0ZW0sIG90aGVySXRlbSk7XG4gICAgICAgICAgICByZXR1cm4gdGVtcFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBSZXN0YXJ0IGl0ZXJhdGlvbiBpZiBpdGVtcyB3ZXJlIHJlbW92ZWRcbiAgICAgICAgaWYgKGl0ZW1zLmxlbmd0aCA8IG9yaWdpbmFsTGVuZ3RoKSB7XG4gICAgICAgICAgICBpbmRleCA9IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBpdGVtcztcbn1cblxuXG5mdW5jdGlvbiB0cmlnb25vbWV0cmljSWRlbnRpdGllcygpe1xuXG59XG5cbmV4cG9ydCB0eXBlIE1hdGhHcm91cEl0ZW09VG9rZW58TWF0aEpheE9wZXJhdG9yXG5cbmV4cG9ydCBjbGFzcyBNYXRoR3JvdXAge1xuICAgIHByaXZhdGUgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSA9IFtdO1xuICAgIC8vb3ZlcnZpZXc6IE1hdGhPdmVydmlld1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKGl0ZW1zPzogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSkge1xuICAgICAgICBpZihpdGVtcyl0aGlzLnNldEl0ZW1zKGl0ZW1zKTtcbiAgICB9XG4gICAgZ2V0SXRlbXMoKTogTWF0aEdyb3VwSXRlbVtdIHtyZXR1cm4gdGhpcy5pdGVtczt9XG4gICAgc2V0SXRlbShpdGVtOiBNYXRoR3JvdXBJdGVtLGluZGV4Om51bWJlcil7XG4gICAgICAgIHRoaXMuaXRlbXNbaW5kZXhdPWl0ZW07XG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKVxuICAgIH1cbiAgICByZXBsYWNlSXRlbUNlbGwoaXRlbTogTWF0aEdyb3VwSXRlbXxNYXRoR3JvdXAsaW5kZXg6bnVtYmVyKXtcbiAgICAgICAgdGhpcy5pdGVtcy5zcGxpY2UoaW5kZXgsMSwuLi5lbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbSkpXG4gICAgfVxuICAgIHNldEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XG4gICAgICAgIHRoaXMuaXRlbXMgPSBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXMpO1xuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KCkgICAgXG4gICAgfVxuICAgIGdyb3VwVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcbiAgICAgICAgY29uc3QgdmFyaWFibGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW06IE1hdGhHcm91cEl0ZW0pID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gJiYgaXRlbS5pc1ZhcigpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5nZXRTdHJpbmdWYWx1ZSgpO1xuICAgICAgICAgICAgICAgIGlmICghdmFyaWFibGVzLmNvbnRhaW5zKGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyaWFibGVzLnB1c2goa2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdmFyaWFibGVzO1xuICAgIH1cbiAgICBcbiAgICB1cGRhdGVPdmVydmlldygpey8qXG4gICAgICAgIHRoaXMub3ZlcnZpZXc9bmV3IE1hdGhPdmVydmlldygpXG4gICAgICAgIHRoaXMub3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdzZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKSovXG4gICAgfVxuICAgIHNpbmdsZVRva2VuU2V0KHZhbHVlOiBudW1iZXIsdG9BZGQ/OiBib29sZWFuKXtcbiAgICAgICAgY29uc3QgdG9rZW49dGhpcy5pdGVtc1swXSBhcyBUb2tlbjtcbiAgICAgICAgY29uc3QgbmV3VmFsdWU9dG9BZGQ/dmFsdWUrdG9rZW4uZ2V0TnVtYmVyVmFsdWUoKTp2YWx1ZTtcbiAgICAgICAgaWYodGhpcy5zaW5ndWxlVG9rZW4oKSl7XG4gICAgICAgICAgICB0b2tlbi5zZXRWYWx1ZShuZXdWYWx1ZSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBjbG9uZSgpOiBNYXRoR3JvdXAge1xuICAgICAgICByZXR1cm4gbmV3IE1hdGhHcm91cCh0aGlzLml0ZW1zLm1hcChpdGVtPT5pdGVtLmNsb25lKCkpKTtcbiAgICB9XG5cbiAgICBoYXNPcGVyYXRvcigpOiB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKTt9XG4gICAgZG9lc250SGF2ZU9wZXJhdG9yKCk6ICB0aGlzIGlzIHsgaXRlbXM6IEFycmF5PFRva2VuIHwgTWF0aEdyb3VwPiB9IHtyZXR1cm4gIXRoaXMuaGFzT3BlcmF0b3IoKTt9XG4gICAgc2luZ2xlTnVtYmVyKCl7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSYmdGhpcy5udW1iZXJPbmx5KCl9XG4gICAgbnVtYmVyT25seSgpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5ldmVyeSh0ID0+ICh0IGluc3RhbmNlb2YgVG9rZW4mJiF0LmlzVmFyKCkpKTt9XG4gICAgaGFzVmFyaWFibGVzKCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiB0IGluc3RhbmNlb2YgVG9rZW4mJnQuaXNWYXIoKSk7fVxuXG4gICAgc2luZ3VsYXIoKTpib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGggPT09IDEgJiYgdGhpcy5pdGVtc1swXSAhPT0gdW5kZWZpbmVkO31cbiAgICBzaW5ndWxlVG9rZW4oKTogdGhpcyBpcyB7IGl0ZW1zOiBbVG9rZW5dIH0ge3JldHVybiB0aGlzLnNpbmd1bGFyKCkgJiYgdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuO31cbiAgICBpc09wZXJhYmxlKCl7cmV0dXJuIHRydWV9XG5cbiAgICBnZXRPcGVyYWJsZVZhbHVlKCk6IG51bWJlciB8IG51bGxcbiAgICB7XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5pdGVtcztcbiAgICAgICAgaWYgKHRoaXMubnVtYmVyT25seSgpKSB7XG4gICAgICAgICAgICBsZXQgdmFsdWU9MDtcbiAgICAgICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW06IFRva2VuKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gaXRlbS5nZXROdW1iZXJWYWx1ZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlzU2luZ2xlVmFyKCl7XG4gICAgICAgIGNvbnN0IHRva2VuPXRoaXMuaXRlbXNbMF1hcyBUb2tlblxuICAgICAgICByZXR1cm4gdGhpcy5zaW5ndWxlVG9rZW4oKSYmdG9rZW4uaXNWYXIoKVxuICAgIH1cbiAgICBnZXRTaW5nbGVWYXIoKXtcbiAgICAgICAgaWYoIXRoaXMuaXNTaW5nbGVWYXIoKSlyZXR1cm4gbnVsbDtcbiAgICAgICAgcmV0dXJuICh0aGlzLml0ZW1zWzBdYXMgVG9rZW4pLmdldFN0cmluZ1ZhbHVlKCk7XG4gICAgfVxuXG4gICAgaXNQb3dHcm91cE1hdGNoKGdyb3VwOiBNYXRoR3JvdXApOmJvb2xlYW57XG4gICAgICAgIGlmKHRoaXMuaXRlbXMubGVuZ3RoIT09MSlyZXR1cm4gZmFsc2VcbiAgICAgICAgaWYodGhpcy5pc1NpbmdsZVZhcigpJiZncm91cC5pc1NpbmdsZVZhcigpJiZ0aGlzLmVxdWFscyhncm91cCkpe1xuICAgICAgICAgICAgdGhpcy5pdGVtcz1bTWF0aEpheE9wZXJhdG9yLmNyZWF0ZShcIlBvd2VyXCIsMixbbmV3IE1hdGhHcm91cCh0aGlzLml0ZW1zWzBdKSxuZXcgTWF0aEdyb3VwKG5ldyBUb2tlbigyKSldKV1cbiAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuZXF1YWxzKGdyb3VwKVxuICAgIH1cblxuICAgIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2goaXRlbTogVG9rZW58TWF0aEpheE9wZXJhdG9yfE1hdGhHcm91cCl7XG4gICAgICAgIC8vUGxhY2Vob2xkZXIgZm9yIG5vd1xuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMoaXRlbSlcbiAgICB9XG5cbiAgICBlcXVhbHMoaXRlbTogVG9rZW58TWF0aEpheE9wZXJhdG9yfE1hdGhHcm91cCl7XG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbil7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT0xJiZ0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW4mJnRoaXMuaXRlbXNbMF0uZXF1YWxzKGl0ZW0pO1xuICAgICAgICB9XG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3Ipe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09MSYmdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciYmdGhpcy5pdGVtc1swXS5lcXVhbHMoaXRlbSlcbiAgICAgICAgfVxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PWl0ZW0uaXRlbXMubGVuZ3RoJiZ0aGlzLml0ZW1zLmV2ZXJ5KCh0OiBNYXRoR3JvdXBJdGVtKT0+e1xuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtLml0ZW1zLnNvbWUoKGkpPT50LmVxdWFscyhpKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGdldElkKCl7XG4gICAgICAgIHJldHVybiAnTWF0aEdyb3VwJ1xuICAgIH1cbiAgICBjb21iaW5pbmdMaWtlVGVybXMoKSB7XG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3ID0gbmV3IE1hdGhPdmVydmlldygpO1xuICAgICAgICBvdmVydmlldy5kZWZpbmVPdmVydmlld1NlcGFyYXRlSW50b0luZGl2aWR1YWxzKHRoaXMuaXRlbXMpO1xuICAgICAgICB0aGlzLnNldEl0ZW1zKG92ZXJ2aWV3LnJlY29uc3RydWN0QXNNYXRoR3JvdXBJdGVtcygpKTtcbiAgICAgICAgbGV0IGluZGV4ID0gMDtcbiAgICAgICAgd2hpbGUgKGluZGV4IDwgdGhpcy5pdGVtcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2luZGV4XTtcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9yaWdpbmFsTGVuZ3RoID0gdGhpcy5pdGVtcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcyA9IHRoaXMuaXRlbXMuZmlsdGVyKChvdGhlckl0ZW06IE1hdGhHcm91cEl0ZW0sIG90aGVySW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNNYXRjaCA9IGl0ZW0uaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlckl0ZW0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWlzTWF0Y2g7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gUmVzdGFydCBpdGVyYXRpb24gaWYgaXRlbXMgd2VyZSByZW1vdmVkXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXRlbXMubGVuZ3RoIDwgb3JpZ2luYWxMZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XG4gICAgICAgIGlmKCFBcnJheS5pc0FycmF5KHRoaXMuaXRlbXMpKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW1zIHRvIGJlIGFuIGFycmF5IGJ1dCByZWNlaXZlZDogXCIrdGhpcy5pdGVtcyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgc3RyaW5nKz1zaG91bGRBZGRQbHVzKHRoaXMuaXRlbXNbaW5kZXgtMV0saXRlbSlcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gYCgke2l0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKX0pYDtcbiAgICAgICAgICAgIH0gIGVsc2Uge1xuICAgICAgICAgICAgICAgIHN0cmluZyArPSBpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XG4gICAgICAgICAgICB9IGlmIChjdXN0b21Gb3JtYXR0ZXIpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcgPSBjdXN0b21Gb3JtYXR0ZXIoaXRlbSxzdHJpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHN0cmluZztcbiAgICB9XG59XG5cblxuXG5jbGFzcyBNYXRoT3ZlcnZpZXcge1xuICAgIHByaXZhdGUgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBhbnk+O1xuICAgIHByaXZhdGUgb3BlcmF0b3JzOiBNYXA8c3RyaW5nLCBhbnk+O1xuICAgIHByaXZhdGUgbnVtYmVyOiBudW1iZXI7XG4gICAgZ2V0TnVtYmVyKCk6IG51bWJlcntyZXR1cm4gdGhpcy5udW1iZXI7fVxuICAgIGdldFZhcmlhYmxlcygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLnZhcmlhYmxlczt9XG4gICAgZ2V0T3BlcmF0b3JzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMub3BlcmF0b3JzO31cbiAgICBjb25zdHJ1Y3Rvcih2YXJpYWJsZXM/OiBNYXA8c3RyaW5nLCBhbnk+LG9wZXJhdG9ycz86IE1hcDxzdHJpbmcsIGFueT4sbnVtYmVyPzogbnVtYmVyKXtcbiAgICAgICAgaWYodmFyaWFibGVzKXRoaXMudmFyaWFibGVzPXZhcmlhYmxlcztcbiAgICAgICAgaWYob3BlcmF0b3JzKXRoaXMub3BlcmF0b3JzPW9wZXJhdG9ycztcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcbiAgICB9XG4gICAgZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyhpdGVtczogTWF0aEdyb3VwSXRlbVtdKSB7XG4gICAgICAgIHRoaXMudmFyaWFibGVzPW5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xuICAgICAgICBpdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJml0ZW0uaXNWYXIoKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVWYXJpYWJsZXNNYXAoaXRlbS5nZXRTdHJpbmdWYWx1ZSgpKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJiFpdGVtLmlzVmFyKCk6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlTXVtYmVyKGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcjpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVPcGVyYXRvcnNNYXAoaXRlbSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gY2F0ZWdvcnkgaW4gTWF0aE92ZXJ2aWV3IHNlcGFyYXRlSW50b0luZGl2aWR1YWxzXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgIH1cbiAgICB1cGRhdGVNdW1iZXIobnVtYmVyOiBudW1iZXIpeyB0aGlzLm51bWJlcj10aGlzLm51bWJlcj90aGlzLm51bWJlcitudW1iZXI6bnVtYmVyO31cbiAgICB1cGRhdGVWYXJpYWJsZXNNYXAoa2V5OiBzdHJpbmcpe1xuICAgICAgICB0aGlzLnZhcmlhYmxlcyA/Pz0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgaXRlbXM6IGFueVtdIH0+KCk7XG4gICAgICAgIGlmKCF0aGlzLnZhcmlhYmxlcy5oYXMoa2V5KSl7dGhpcy52YXJpYWJsZXMuc2V0KGtleSx7Y291bnQ6IDB9KX1cbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZ2V0KGtleSkuY291bnQrKztcbiAgICB9XG4gICAgdXBkYXRlT3BlcmF0b3JzTWFwKG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xuICAgICAgICBjb25zdCBrZXk9b3BlcmF0b3Iub3BlcmF0b3I7XG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xuICAgICAgICBpZighdGhpcy5vcGVyYXRvcnMuaGFzKGtleSkpe3RoaXMub3BlcmF0b3JzLnNldChrZXkse2NvdW50OiAwLCBpdGVtczogW119KX1cbiAgICAgICAgY29uc3QgZW50cnkgPSB0aGlzLm9wZXJhdG9ycy5nZXQoa2V5KSE7XG4gICAgICAgIGVudHJ5LmNvdW50ICs9IDE7XG4gICAgICAgIGVudHJ5Lml0ZW1zLnB1c2gob3BlcmF0b3IpO1xuICAgIH1cblxuICAgIGhhc1Zhcigpe3JldHVybiB0aGlzLnZhcmlhYmxlcyYmdGhpcy52YXJpYWJsZXMuc2l6ZT4wfVxuICAgIGhhc09wKCl7cmV0dXJuIHRoaXMub3BlcmF0b3JzJiZ0aGlzLm9wZXJhdG9ycy5zaXplPjB9XG4gICAgb25seU51bWVyaWMoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubnVtYmVyJiYhdGhpcy5oYXNWYXIoKSYmIXRoaXMuaGFzT3AoKVxuICAgIH1cbiAgICByZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKXtcbiAgICAgICAgY29uc3QgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXT1bXTtcbiAgICAgICAgaWYodGhpcy5udW1iZXIpaXRlbXMucHVzaChuZXcgVG9rZW4odGhpcy5udW1iZXIpKTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYodmFsdWUuY291bnQ9PT0xKXtcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKG5ldyBUb2tlbihrZXkpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZih2YWx1ZS5jb3VudD4xKXtcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKE11bHRpcGxpY2F0aW9uT3BlcmF0b3IuYXNPY2N1cnJlbmNlR3JvdXAodmFsdWUuY291bnQsa2V5KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmKHRoaXMub3BlcmF0b3JzKXtcbiAgICAgICAgICAgIGl0ZW1zLnB1c2goLi4uQXJyYXkuZnJvbSh0aGlzLm9wZXJhdG9ycy52YWx1ZXMoKSkuZmxhdE1hcCgob3BlcmF0b3I6IGFueSkgPT4gb3BlcmF0b3IuaXRlbXMpKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpdGVtcztcbiAgICB9XG59XG5cblxuXG5cblxuXG5leHBvcnQgY2xhc3MgVG9rZW57XG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTpudW1iZXJ8c3RyaW5nKXtcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICB9XG4gICAgZ2V0TnVtYmVyVmFsdWUoKTpudW1iZXJ7cmV0dXJuICh0aGlzLnZhbHVlIGFzIG51bWJlcil9XG4gICAgZ2V0U3RyaW5nVmFsdWUoKTpzdHJpbmd7cmV0dXJuICh0aGlzLnZhbHVlIGFzIHN0cmluZyl9XG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cbiAgICBzZXRWYWx1ZSh2YWx1ZTogbnVtYmVyfHN0cmluZyl7dGhpcy52YWx1ZT12YWx1ZTt9XG4gICAgaXNWYXIoKSB7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlID09PSAnc3RyaW5nJzt9XG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy52YWx1ZSA9PT0gaXRlbS52YWx1ZTtcbiAgICB9XG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XG4gICAgICAgIGxldCBzdHJpbmc9JydcbiAgICAgICAgaWYoIXRoaXMuaXNWYXIoKSYmdGhpcy5nZXROdW1iZXJWYWx1ZSgpPDApXG4gICAgICAgICAgICBzdHJpbmcrPSctJztcbiAgICAgICAgc3RyaW5nKz10aGlzLnZhbHVlO1xuICAgICAgICBpZihjdXN0b21Gb3JtYXR0ZXIpe1xuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5nO1xuICAgIH1cbiAgICBjbG9uZSgpe3JldHVybiBuZXcgVG9rZW4odGhpcy52YWx1ZSl9XG59XG5cblxuXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW5ze1xuICAgIHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+PVtdO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKHRva2Vucz86IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPil7XG4gICAgICAgIHRoaXMudG9rZW5zPXRva2Vuc3x8W107XG4gICAgfVxuICAgIGFkZElucHV0KG1hdGg6IHN0cmluZyl7XG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XG4gICAgfVxuICAgIHRva2VuaXplKG1hdGg6IHN0cmluZyl7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzKCkpXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGU9L1tcXChcXCldLy50ZXN0KG1hdGNoWzBdKT8ncGFyZW4nOidvcGVyYXRvcidcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4odHlwZSxtYXRjaFswXSkpO1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbignbnVtYmVyJyxwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oXCJ2YXJpYWJsZVwiLG1hdGNoWzBdKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcbiAgICAgICAgfVxuICAgICAgIHRoaXMucG9zdFByb2Nlc3NUb2tlbnMoKTtcbiAgICB9XG5cbiAgICBwb3N0UHJvY2Vzc1Rva2Vucygpe1xuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XG4gICAgICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcbiAgICAgICAgKi9cbiAgICAgICAgdGhpcy50b2tlbnM9aWRQYXJlbnRoZXNlcyh0aGlzLnRva2Vucyk7XG4gICAgICAgIHRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXG4gICAgICAgIFxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxuXG4gICAgICAgIHBhcmVuTWFwLnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBiIC0gYSlcbiAgICAgICAgLmZvckVhY2goKHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3ICBCYXNpY01hdGhKYXhUb2tlbignb3BlcmF0b3InLCcqJykpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKClcbiAgICB9XG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpIHtcbiAgICAgICAgY29uc3QgaXNBQmFzaWNNYXRoSmF4VG9rZW5Eb3VibGVSaWdodE9wPSh0b2tlbj86IGFueSk9PntcbiAgICAgICAgICAgIGlmKHRva2VuJiZ0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXModG9rZW4udmFsdWU/LnRvU3RyaW5nKCkgfHwgJycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBcbiAgICAgICAgICogQHBhcmFtIGluZGV4IFxuICAgICAgICAgKiBAcmV0dXJucyBib29sYW4gPT4gVHJ1ZSBpZiB0aGFyIGlzbid0IGEgZG91YmxlUmlnaHQgb3BlcmF0b3IuXG4gICAgICAgICAqL1xuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpfHwhKHRoaXMudG9rZW5zW2luZGV4XSBpbnN0YW5jZW9mIFBhcmVuKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gZmluZFBhcmVuSW5kZXgoaW5kZXgsdGhpcy50b2tlbnMpPy5vcGVuO1xuICAgICAgICAgICAgaWYgKGlkeCA9PSBudWxsIHx8ICFpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCArIDFdKSkgcmV0dXJuIGZhbHNlO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbaWR4IC0gMV07XG4gICAgICAgICAgICByZXR1cm4gIWlzQUJhc2ljTWF0aEpheFRva2VuRG91YmxlUmlnaHRPcChwcmV2VG9rZW4pXG4gICAgICAgIH07XG5cbiAgICBcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHRva2VuLmlzVmFsdWVUb2tlbigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbj0odG9rZW46IGFueSk9PntcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0eXBlb2YgdG9rZW4udmFsdWU9PT0nc3RyaW5nJyYmaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSlcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlzVmFyPSh0b2tlbjogYW55KT0+e3JldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmdG9rZW4udHlwZT09PSd2YXJpYWJsZSd9XG5cbiAgICAgICAgY29uc3QgcHJlY2VkZXNWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaW5kZXg+MCYmaXNWYXIodG9rZW5zW2luZGV4XSlcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGZvbGxvd3NWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaW5kZXg8dG9rZW5zLmxlbmd0aC0xJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChpc09wZW5QYXJlbih0b2tlbil8fCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4pfHxwcmVjZWRlc1ZhcmlhYmxlKHRoaXMudG9rZW5zLGluZGV4KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzQ2xvc2VkUGFyZW4odG9rZW4pfHxmb2xsb3dzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8IHRlc3REb3VibGVSaWdodChpbmRleCkgPyBpbmRleCArIDEgOiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtICE9PSBudWxsKTtcbiAgICAgICAgcmV0dXJuIG1hcDtcbiAgICB9XG4gICAgXG5cbiAgICB2YWxpZGF0ZVBsdXNNaW51cygpe1xuICAgICAgICAvLyBQbHVzZXMgYXJlIHNlcGFyYXRvcnMuVGhlcmVmb3JlLCB0aGV5IGRvIG5vdCBuZWVkIHRvIGJlIGhlcmUgQXMgdGhlIGV4cHJlc3Npb24gaXMgdG9rZW5bXVxuICAgICAgICAvL01pbnVzZXMgb24gdGhlIG90aGVyIGhhbmQuY2FuIGVpdGhlciBiZSBhIHNlcGFyYXRvci4gT3IgYSBuZWdhdGl2ZSBzaWduXG4gICAgICAgIGNvbnN0IHBsdXNNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW4sIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSAnQWRkaXRpb24nP2luZGV4IDogbnVsbCkuZmlsdGVyKChpbmRleDogbnVtYmVyIHwgbnVsbCkgPT4gaW5kZXggIT09IG51bGwpXG4gICAgICAgIHBsdXNNYXAucmV2ZXJzZSgpLmZvckVhY2goKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgbWludXNNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW4sIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSAnU3VidHJhY3Rpb24nP2luZGV4IDogbnVsbCkuZmlsdGVyKChpbmRleDogbnVtYmVyIHwgbnVsbCkgPT4gaW5kZXggIT09IG51bGwpXG4gICAgICAgIFxuICAgICAgICBtaW51c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV4dFRva2VuID0gdGhpcy50b2tlbnNbaW5kZXggKyAxXTtcbiAgICAgICAgICAgIGlmIChuZXh0VG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJiB0eXBlb2YgbmV4dFRva2VuLnZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICBuZXh0VG9rZW4udmFsdWUgKj0gLTE7XG4gICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgfVxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcixtYXJnaW4/OiBudW1iZXIpe1xuICAgICAgICBtYXJnaW49bWFyZ2lufHwwO1xuICAgICAgICByZXR1cm4gaW5kZXg+PTArbWFyZ2luJiZpbmRleDx0aGlzLnRva2Vucy5sZW5ndGgtbWFyZ2luO1xuICAgIH1cbiAgICBjbG9uZSgpOiBCYXNpY01hdGhKYXhUb2tlbnMge1xuICAgICAgICByZXR1cm4gbmV3IEJhc2ljTWF0aEpheFRva2Vucyh0aGlzLnRva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uY2xvbmUoKSkpO1xuICAgIH1cbiAgICAvKlxuICAgIFxuICAgIFxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09IFwiKFwiID8gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxuICAgIH1cblxuICAgIGZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XG4gICAgICAgICAgICAgICAgaWYgKG9wZW5JbmRleCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdPy50eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChjbG9zZUluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdPy5pc1ZhbHVlVG9rZW4oKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSkuZmxhdE1hcCgoaXRlbTogYW55KSA9PiBbaXRlbS5vcGVuLCBpdGVtLmNsb3NlXSk7XG4gICAgfSAgICBcbiAgICBcbiAgICBcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXG4gICAgICAgICAgICAgICAgJiYodGhpcy50b2tlbkNvbXBhcmUoXCJ0eXBlXCIsdGhpcy52YWx1ZVRva2VucygpLCB0b2tlbiwgdG9rZW5zW2luZGV4ICsgMV0pKVxuICAgICAgICApKTtcbiAgICAgfVxuICAgIFxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSk7XG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfOiBhbnksIGlkeDogdW5rbm93bikgPT4gIW1hcC5oYXMoaWR4KSk7XG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICBcbiAgICAgICAgY29uc3QgYXJyID0gW1xuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcbiAgICAgICAgXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXG4gICAgfVxuXG4gICAgXG5cbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xuICAgICAgICBpZiAoXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXG4gICAgICAgIClcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cbiAgICB9XG5cbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQ6IGFueSwgbGVuZ3RoOiBudW1iZXIsIG9iamVjdHM6IGFueVtdIHwgVG9rZW4pIHtcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXhwZWN0ZWQgYG9iamVjdHNgIHRvIGJlIGFuIGFycmF5LCBidXQgcmVjZWl2ZWQ6XCIsIG9iamVjdHMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgbGVuZ3RoLCAuLi5vYmplY3RzKTtcbiAgICB9XG5cbiAgICBcblxuICAgIGluZGV4ZXNUb0FkZFBsdXModG9rZW5zOiBhbnlbXSl7XG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcbiAgICB9XG5cbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcbiAgICAgICAgY29uc3QgcmVnRXhwdmFsdWUgPSAodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxuICAgICAgICApO1xuICAgIH1cbiAgICAqL1xufVxuXG5cblxuXG5cblxuXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW57XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIHZhbHVlPzogc3RyaW5nfG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKHR5cGU6c3RyaW5nICx2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkKXtcbiAgICAgICAgdGhpcy50eXBlPXR5cGU7XG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgICAgIHRoaXMuaW5zdXJQcm9wZXJGb3JtYXR0aW5nKClcbiAgICB9XG4gICAgaW5zdXJQcm9wZXJGb3JtYXR0aW5nKCl7XG4gICAgICAgIGlmICghdGhpcy5pc1ZhbHVlVG9rZW4oKSYmdHlwZW9mIHRoaXMudmFsdWU9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgICAgIHRoaXMudmFsdWU9c2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHModGhpcy52YWx1ZSk/Lm5hbWVcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldExhdGV4U3ltYm9sKCl7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZyc/c2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubGF0ZXg6dW5kZWZpbmVkfVxuXG4gICAgZ2V0ZnVsbFR5cGUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudHlwZVxuICAgIH1cbiAgICBjbG9uZSgpe1xuICAgICAgICByZXR1cm4gbmV3IEJhc2ljTWF0aEpheFRva2VuKHRoaXMudHlwZSwgdGhpcy52YWx1ZSlcbiAgICB9XG5cblxuICAgIGlzU3RyaW5nKCl7cmV0dXJuIHRoaXMudHlwZT09PSdwYXJlbid8fHRoaXMudHlwZT09PSdvcGVyYXRvcid9XG5cbiAgICBpc1ZhbHVlVG9rZW4oKXtyZXR1cm4gdGhpcy50eXBlPT09J3ZhcmlhYmxlJ3x8dGhpcy50eXBlPT09J251bWJlcid9XG5cbiAgICB0b1N0cmluZ0xhdGV4KCl7XG4gICAgICAgIGxldCBzdHJpbmc9JydcbiAgICAgICAgaWYgKHRoaXMuaXNTdHJpbmcoKSlcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy5nZXRMYXRleFN5bWJvbCgpXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nbnVtYmVyJykgc3RyaW5nKz10aGlzLnZhbHVlO1xuICAgICAgICByZXR1cm4gc3RyaW5nXG4gICAgfVxuICAgIGFmZmVjdGVkT3BlcmF0b3JSYW5nZShkaXJlY3Rpb246IHN0cmluZyl7XG4gICAgICAgIGlmKHRoaXMudHlwZSE9PSdvcGVyYXRvcid8fHRoaXMudmFsdWU9PT0nRXF1YWxzJylcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBpZih0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnJiZkaXJlY3Rpb249PT0nbGVmdCcmJiFpc09wZXJhdG9yV2l0aEFzc29jaWF0aXZpdHkodGhpcy52YWx1ZSwgWy0xLCAxXSx0cnVlKSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbn0iXX0=