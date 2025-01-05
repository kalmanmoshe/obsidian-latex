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
    getDeepth() {
        const depths = this.groups.map(group => group.getDeepth().max);
        return { max: Math.max(...depths), depths };
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
        if (!(testItem instanceof Token || (testItem instanceof MathJaxOperator && testItem.operator === "Multiplication"))) {
            return false;
        }
        const occurrenceGroup = this.getOccurrenceGroup()?.occurrencOf;
        if (!occurrenceGroup)
            return false;
        const items = occurrenceGroup.flatMap(group => group.getItems());
        if (testItem instanceof Token) {
            const match = items.length === 1 && items[0].equals(testItem);
            if (match)
                this.addToOccurrenceGroup(1);
            return match;
        }
        const testItemsArray = testItem.getOccurrenceGroup()?.occurrencOf;
        return false;
    }
    toString(customFormatter) {
        const operator = '\\cdot ';
        let string = '';
        this.groups.forEach((group, index) => {
            string += wrapGroup(group.toString(), group.singular() ? BracketType.None : BracketType.Parentheses);
            if (index < this.groups.length - 1)
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
        const newOp = MathJaxOperator.create('Multiplication', 2, [new MathGroup([group1]), new MathGroup([group2])]);
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
        if (this.singulToken()) {
            token.setValue(newValue);
        }
    }
    clone() {
        return new MathGroup(this.items.map(item => item.clone()));
    }
    hasOperator() { return this.items.some((item) => item instanceof MathJaxOperator); }
    doesntHaveOperator() { return !this.hasOperator(); }
    deepHasOperator() {
        const map = this.items.map((item) => {
            if (item instanceof MathGroup) {
                return item.deepHasOperator();
            }
            if (item instanceof MathJaxOperator)
                return true;
            return false;
        });
        return map.some((t) => t);
    }
    singleNumber() { return this.singular() && this.numberOnly(); }
    numberOnly() { return this.items.every(t => (t instanceof Token && !t.isVar())); }
    hasVariables() { return this.items.some(t => t instanceof Token && t.isVar()); }
    singular() { return this.items.length === 1 && this.items[0] !== undefined; }
    singulToken() { return this.singular() && this.items[0] instanceof Token; }
    isRootLevel() { return this.items.every((item) => item instanceof Token); }
    getDeepth() {
        let deepths = [];
        this.items.forEach(item => {
            if (item instanceof Token) {
                deepths.push(0);
                return;
            }
            ;
            deepths.push(item.getDeepth().max + 1);
        });
        return { max: Math.max(...deepths), deepths: deepths };
    }
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
    isPowGroupMatch(item) {
        //Placeholder for now
        if (this.items.length !== 1)
            return false;
        const thisOverview = new MathOverview();
        thisOverview.defineOverviewSeparateIntoIndividuals(this.items);
        console.log('thisOverview', thisOverview);
        return this.equals(item);
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
        this.items.forEach((item, index) => {
            if (item instanceof MathJaxOperator) {
                const occurrenceGroup = item.getOccurrenceGroup();
                if (occurrenceGroup) {
                    this.items = this.items.filter((otherItem, otherIndex) => {
                        // Skip the current item itself
                        if (index === otherIndex)
                            return true;
                        const isMatch = item.isOccurrenceGroupMatch(otherItem);
                        return !isMatch;
                    });
                }
            }
        });
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
            return (idx > 0 &&
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUEsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUFtRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5JLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUl4UixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRTdDLFNBQVMsU0FBUyxDQUFDLEtBQWEsRUFBRSxJQUFpQjtJQUMvQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ1gsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEIsS0FBSyxXQUFXLENBQUMsV0FBVztZQUN4QixPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7UUFDeEI7WUFDSSxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FDOUIsU0FBYyxFQUNkLFNBQWlDLEVBQ2pDLE9BQTRCLEVBQUU7SUFFOUIsNERBQTREO0lBQzVELElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELG1FQUFtRTtJQUNuRSxJQUFJLEtB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QyxPQUFPLE1BQU0sQ0FBQTtJQUNqQixDQUFDO0lBQ0QscUJBQXFCLENBQUMsU0FBaUI7UUFDbkMsSUFBRyxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxJQUFJLENBQUMsS0FBSyxLQUFHLFFBQVE7WUFDNUMsT0FBTyxLQUFLLENBQUE7UUFDaEIsSUFBRyxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUcsUUFBUSxJQUFFLFNBQVMsS0FBRyxNQUFNLElBQUUsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDO1lBQ3ZHLE9BQU8sS0FBSyxDQUFBO1FBQ2hCLE9BQU8sSUFBSSxDQUFBO0lBQ2YsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4vaW1WZXJ5TGF6eVwiO1xuaW1wb3J0IHsgdHlwZSB9IGZyb20gXCJvc1wiO1xuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgcmVnRXhwIH0gZnJvbSBcIi4uL3Rpa3pqYXgvdGlrempheFwiO1xuaW1wb3J0IHsgQXNzb2NpYXRpdml0eSwgQnJhY2tldFR5cGUsIE1hdGhKYXhPcGVyYXRvck1ldGFkYXRhLCBtYXRoSmF4T3BlcmF0b3JzTWV0YWRhdGEsIE9wZXJhdG9yVHlwZSB9IGZyb20gXCJzcmMvdXRpbHMvc3RhdGljRGF0YVwiO1xuXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgaXNPcGVuUGFyZW4sIGlzQ2xvc2VkUGFyZW4gfSBmcm9tIFwiLi4vdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xuaW1wb3J0IHsgZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHksIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlLCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBpc09wZXJhdG9yV2l0aEFzc29jaWF0aXZpdHksIHNlYXJjaEFsbE1hdGhKYXhPcGVyYXRvcnNBbmRTeW1ib2xzLCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzLCBzZWFyY2hTeW1ib2xzIH0gZnJvbSBcIi4uL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XG5pbXBvcnQgeyBncm91cCB9IGZyb20gXCJjb25zb2xlXCI7XG5pbXBvcnQgeyBrZXkgfSBmcm9tIFwibG9jYWxmb3JhZ2VcIjtcbmltcG9ydCB7IHZhbHVlIH0gZnJvbSBcInZhbGlib3RcIjtcbmltcG9ydCB7IHBhcnNlT3BlcmF0b3IgfSBmcm9tIFwiLi9tYXRoRW5naW5lXCI7XG5cbmZ1bmN0aW9uIHdyYXBHcm91cChncm91cDogc3RyaW5nLCB3cmFwOiBCcmFja2V0VHlwZSk6IHN0cmluZyB7XG4gICAgc3dpdGNoICh3cmFwKSB7XG4gICAgICAgIGNhc2UgQnJhY2tldFR5cGUuUGFyZW50aGVzZXM6XG4gICAgICAgICAgICByZXR1cm4gYCgke2dyb3VwfSlgO1xuICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLkN1cmx5QnJhY2VzOlxuICAgICAgICAgICAgcmV0dXJuIGB7JHtncm91cH19YDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBncm91cDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWVwU2VhcmNoV2l0aFBhdGgoXG4gICAgc3RydWN0dXJlOiBhbnksXG4gICAgcHJlZGljYXRlOiAoaXRlbTogYW55KSA9PiBib29sZWFuLFxuICAgIHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gPSBbXVxuKTogeyBpdGVtOiBhbnk7IHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gfSB8IG51bGwge1xuICAgIC8vIEJhc2UgY2FzZTogSWYgdGhlIGN1cnJlbnQgc3RydWN0dXJlIG1hdGNoZXMgdGhlIHByZWRpY2F0ZVxuICAgIGlmIChwcmVkaWNhdGUoc3RydWN0dXJlKSkge1xuICAgICAgICByZXR1cm4geyBpdGVtOiBzdHJ1Y3R1cmUsIHBhdGggfTtcbiAgICB9XG5cbiAgICAvLyBJZiBpdCdzIGFuIGFycmF5LCByZWN1cnNpdmVseSBzZWFyY2ggZWFjaCBlbGVtZW50IHdpdGggaXRzIGluZGV4XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoc3RydWN0dXJlKSkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cnVjdHVyZS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtpXSwgcHJlZGljYXRlLCBbLi4ucGF0aCwgaV0pO1xuICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIElmIGl0J3MgYW4gb2JqZWN0LCByZWN1cnNpdmVseSBzZWFyY2ggaXRzIHByb3BlcnRpZXMgd2l0aCB0aGVpciBrZXlzXG4gICAgaWYgKHN0cnVjdHVyZSAhPT0gbnVsbCAmJiB0eXBlb2Ygc3RydWN0dXJlID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHN0cnVjdHVyZSkge1xuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdHJ1Y3R1cmUsIGtleSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2tleV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGtleV0pO1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJZiBubyBtYXRjaCBpcyBmb3VuZFxuICAgIHJldHVybiBudWxsO1xufVxudHlwZSBmb3JtYXR0YWJsZUZvck1hdGhHcm91cD1NYXRoR3JvdXBJdGVtfE1hdGhHcm91cHxCYXNpY01hdGhKYXhUb2tlblxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtczogZm9ybWF0dGFibGVGb3JNYXRoR3JvdXB8Zm9ybWF0dGFibGVGb3JNYXRoR3JvdXBbXSk6IE1hdGhHcm91cEl0ZW1bXSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xuICAgICAgICBpdGVtcyA9IFtpdGVtc107XG4gICAgfVxuXG4gICAgY29uc3QgZm9ybWF0dGVkSXRlbXMgPSBpdGVtc1xuICAgICAgICAucmVkdWNlKChhY2M6IE1hdGhHcm91cEl0ZW1bXSwgaXRlbTogVG9rZW4gfCBNYXRoR3JvdXAgfCBNYXRoSmF4T3BlcmF0b3IgfCBCYXNpY01hdGhKYXhUb2tlbikgPT4ge1xuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjLmNvbmNhdChlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbS5nZXRJdGVtcygpKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xuICAgICAgICAgICAgICAgIGFjYy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pIHtcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS52YWx1ZSAmJiAoaXRlbS50eXBlID09PSBcIm51bWJlclwiIHx8IGl0ZW0udHlwZSA9PT0gXCJ2YXJpYWJsZVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBhY2MucHVzaChuZXcgVG9rZW4oaXRlbS52YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIGBFeHBlY3RlZCBpdGVtIHRvIGJlIGEgbnVtYmVyIG9yIHZhcmlhYmxlIGJ1dCByZWNlaXZlZDogJHtpdGVtLnZhbHVlfWBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfSwgW10pXG5cbiAgICByZXR1cm4gZm9ybWF0dGVkSXRlbXM7XG59XG5mdW5jdGlvbiBzaG91bGRBZGRQbHVzKGdyb3VwMT86IGFueSxncm91cDI/OiBhbnkpe1xuICAgIGlmKCFncm91cDF8fCFncm91cDIpcmV0dXJuICcnO1xuXG4gICAgcmV0dXJuICcrJztcbn1cblxuZnVuY3Rpb24gY2FuQ29tYmluZShtYXRoOiBNYXRoR3JvdXAsb3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XG5cbn1cbmV4cG9ydCBjbGFzcyBNYXRoSmF4T3BlcmF0b3Ige1xuICAgIG9wZXJhdG9yOiBzdHJpbmc7XG4gICAgZ3JvdXBOdW06IG51bWJlciA9IDE7XG4gICAgZ3JvdXBzOiBNYXRoR3JvdXBbXTtcbiAgICBzb2x1dGlvbjogTWF0aEdyb3VwO1xuICAgIGNvbW11dGF0aXZlOiBib29sZWFuO1xuICAgIGlzT3BlcmFibGU6IGJvb2xlYW4gPSB0cnVlO1xuXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKSB7XG4gICAgICAgIGlmIChvcGVyYXRvcikgdGhpcy5vcGVyYXRvciA9IG9wZXJhdG9yO1xuICAgICAgICBpZiAoZ3JvdXBOdW0pIHRoaXMuZ3JvdXBOdW0gPSBncm91cE51bTtcbiAgICAgICAgaWYgKGdyb3VwcykgdGhpcy5ncm91cHMgPSBncm91cHM7XG4gICAgICAgIGlmIChzb2x1dGlvbikgdGhpcy5zb2x1dGlvbiA9IHNvbHV0aW9uO1xuICAgICAgICBpZiAoaXNPcGVyYWJsZSAhPT0gdW5kZWZpbmVkKSB0aGlzLmlzT3BlcmFibGUgPSBpc09wZXJhYmxlO1xuICAgIH1cbiAgICBzdGF0aWMgY3JlYXRlKG9wZXJhdG9yPzogc3RyaW5nLCBncm91cE51bT86IG51bWJlciwgZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwLCBpc09wZXJhYmxlPzogYm9vbGVhbik6IE1hdGhKYXhPcGVyYXRvciB7XG4gICAgICAgIGlmIChvcGVyYXRvciA9PT0gXCJNdWx0aXBsaWNhdGlvblwiKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZ3JvdXBzLCBzb2x1dGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoSmF4T3BlcmF0b3Iob3BlcmF0b3IsIGdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCBpc09wZXJhYmxlKTtcbiAgICB9XG4gICAgdGVzdEdyb3Vwcyh0ZXN0OiAoZ3JvdXA6IE1hdGhHcm91cCkgPT4gYm9vbGVhbik6IGJvb2xlYW5bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAodGVzdCk7XG4gICAgfVxuXG4gICAgbWFwVmFyaWFibGVzKCk6IGJvb2xlYW5bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaGFzVmFyaWFibGVzKCkpO1xuICAgIH1cblxuICAgIG9wZXJhdG9yVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIFsuLi5uZXcgU2V0KHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5ncm91cFZhcmlhYmxlcygpKS5mbGF0KCkpXTtcbiAgICB9XG5cbiAgICBnZXREZWVwdGgoKSB7XG4gICAgICAgIGNvbnN0IGRlcHRocyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5nZXREZWVwdGgoKS5tYXgpO1xuICAgICAgICByZXR1cm4geyBtYXg6IE1hdGgubWF4KC4uLmRlcHRocyksIGRlcHRocyB9O1xuICAgIH1cblxuICAgIGNsb25lKCk6IE1hdGhKYXhPcGVyYXRvciB7XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5jbG9uZSgpKTtcbiAgICAgICAgY29uc3Qgc29sdXRpb24gPSB0aGlzLnNvbHV0aW9uID8gdGhpcy5zb2x1dGlvbi5jbG9uZSgpIDogdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm4gTWF0aEpheE9wZXJhdG9yLmNyZWF0ZSh0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xuICAgIH1cblxuICAgIHRvU3RyaW5nU29sdXRpb24oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKSArICcgPSAnICsgdGhpcy5zb2x1dGlvbj8udG9TdHJpbmcoKTtcbiAgICB9XG5cbiAgICBlcXVhbHMoaXRlbTogTWF0aEdyb3VwSXRlbSk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciAmJlxuICAgICAgICAgICAgdGhpcy5vcGVyYXRvciA9PT0gaXRlbS5vcGVyYXRvciAmJlxuICAgICAgICAgICAgdGhpcy5ncm91cHMubGVuZ3RoID09PSBpdGVtLmdyb3Vwcy5sZW5ndGggJiZcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLmV2ZXJ5KCh0LCBpbmRleCkgPT4gdC5lcXVhbHMoaXRlbS5ncm91cHNbaW5kZXhdKSk7XG4gICAgfVxuICAgIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH18bnVsbCAgeyByZXR1cm4gbnVsbDsgfSAgXG4gICAgaXNPY2N1cnJlbmNlR3JvdXBNYXRjaCh0ZXN0SXRlbTogTWF0aEpheE9wZXJhdG9yIHwgVG9rZW4pOiBib29sZWFuIHtyZXR1cm4gZmFsc2U7fVxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xuICAgICAgICBmdW5jdGlvbiB3cmFwR3JvdXAoZ3JvdXA6IE1hdGhHcm91cCwgd3JhcDogQnJhY2tldFR5cGUsb3B0aW9uYWw6IGJvb2xlYW4pOiBzdHJpbmcge1xuICAgICAgICAgICAgaWYob3B0aW9uYWwmJmdyb3VwLnNpbmd1bGFyKCkpcmV0dXJuIGdyb3VwLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XG4gICAgICAgICAgICBjb25zdCBncm91cFN0cj1ncm91cC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpXG4gICAgICAgICAgICBzd2l0Y2ggKHdyYXApIHtcbiAgICAgICAgICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLlBhcmVudGhlc2VzOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCgke2dyb3VwU3RyfSlgO1xuICAgICAgICAgICAgICAgIGNhc2UgQnJhY2tldFR5cGUuQ3VybHlCcmFjZXM6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgeyR7Z3JvdXBTdHJ9fWA7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdyb3VwU3RyO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuXG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLm9wZXJhdG9yKTtcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuICcnO1xuICAgICAgICBpZihtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9ucz4yfHxtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uczwxKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBudW1iZXIgb2YgcG9zaXRpb25zIGZvciBhc3NvY2lhdGl2aXR5OiAke21ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBtZXRhZGF0YS5sYXRleDtcbiAgICAgICAgbGV0IGluZGV4PTA7XG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcblxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyx0cnVlKS5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleC0xXSx0aGlzLmdyb3Vwc1tpbmRleF0pK3dyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0sIGl0ZW0uYnJhY2tldFR5cGUsIGl0ZW0uaXNCcmFja2V0T3B0aW9uYWwpO1xuICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyxmYWxzZSkuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXhdLHRoaXMuZ3JvdXBzW2luZGV4KzFdKSt3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLCBpdGVtLmJyYWNrZXRUeXBlLCBpdGVtLmlzQnJhY2tldE9wdGlvbmFsKTtcbiAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcbiAgICAgICAgcmV0dXJuIHN0cmluZy50cmltKCk7XG4gICAgfVxuICAgIHBhcnNlTWF0aGpheE9wZXJhdG9yKCkge1xuICAgICAgICBwYXJzZU9wZXJhdG9yKHRoaXMpO1xuICAgIH1cbn1cblxuXG5leHBvcnQgY2xhc3MgTXVsdGlwbGljYXRpb25PcGVyYXRvciBleHRlbmRzIE1hdGhKYXhPcGVyYXRvciB7XG4gICAgY29uc3RydWN0b3IoZ3JvdXBzPzogTWF0aEdyb3VwW10sIHNvbHV0aW9uPzogTWF0aEdyb3VwKSB7XG4gICAgICAgIHN1cGVyKFwiTXVsdGlwbGljYXRpb25cIiwgMiwgZ3JvdXBzLCBzb2x1dGlvbiwgdHJ1ZSk7XG4gICAgICAgIHRoaXMuY29tbXV0YXRpdmUgPSB0cnVlO1xuICAgICAgICB0aGlzLnJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCk7XG4gICAgfVxuICAgIHJlbW92ZU11bHRpcGxpY2F0aW9uRGVwdGhzKCl7XG4gICAgICAgIHRoaXMuZ3JvdXBzLmZvckVhY2goKGdyb3VwOiBNYXRoR3JvdXApID0+IHtcbiAgICAgICAgICAgIGlmKGdyb3VwLnNpbmd1bGFyKCkmJmdyb3VwLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKXtcbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtcz0oZ3JvdXAuZ2V0SXRlbXMoKVswXSBhcyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKS5ncm91cHM7XG4gICAgICAgICAgICAgICAgdGhpcy5ncm91cHMuc3BsaWNlKHRoaXMuZ3JvdXBzLmluZGV4T2YoZ3JvdXApLDEsLi4uaXRlbXMpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHN0YXRpYyBhc09jY3VycmVuY2VHcm91cChvY2N1cnJlbmNlc0NvdW50OiBudW1iZXIsb2NjdXJyZW5jT2Y6IHN0cmluZ3xUb2tlbnxNYXRoR3JvdXApOiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yIHtcbiAgICAgICAgb2NjdXJyZW5jT2Y9dHlwZW9mIG9jY3VycmVuY09mPT09XCJzdHJpbmdcIj9cbiAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNPZildKTpvY2N1cnJlbmNPZiBpbnN0YW5jZW9mIFRva2VuP1xuICAgICAgICAgICAgICAgIG5ldyBNYXRoR3JvdXAoW29jY3VycmVuY09mXSk6b2NjdXJyZW5jT2Y7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKFtuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jZXNDb3VudCldKSxvY2N1cnJlbmNPZl0pXG4gICAgfVxuICAgIFxuICAgIG92ZXJyaWRlIGdldE9jY3VycmVuY2VHcm91cCgpOiB7IG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcjsgb2NjdXJyZW5jT2Y6IE1hdGhHcm91cFtdIH0ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjOiB7IHRvdGFsTnVtOiBudW1iZXI7IGFycjogTWF0aEdyb3VwW10gfSwgaXRlbTogTWF0aEdyb3VwKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0uZ2V0T3BlcmFibGVWYWx1ZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFjYy50b3RhbE51bSArPSBpdGVtLmdldE9wZXJhYmxlVmFsdWUoKSE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYWNjLmFyci5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgdG90YWxOdW06IDAsIGFycjogW10gfVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4geyBvY2N1cnJlbmNlc0NvdW50OiByZXN1bHQudG90YWxOdW0sIG9jY3VycmVuY09mOiByZXN1bHQuYXJyIH07XG4gICAgfVxuXG4gICAgYWRkVG9PY2N1cnJlbmNlR3JvdXAodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBudW1iZXJHcm91cCA9IHRoaXMuZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuc2luZ2xlTnVtYmVyKCkpO1xuICAgICAgICBpZiAobnVtYmVyR3JvdXApIHtcbiAgICAgICAgICAgIG51bWJlckdyb3VwLnNpbmdsZVRva2VuU2V0KHZhbHVlLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnB1c2gobmV3IE1hdGhHcm91cChbbmV3IFRva2VuKDEgKyB2YWx1ZSldKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvdmVycmlkZSBpc09jY3VycmVuY2VHcm91cE1hdGNoKHRlc3RJdGVtOiBNYXRoSmF4T3BlcmF0b3IgfCBUb2tlbik6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoISh0ZXN0SXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8ICh0ZXN0SXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvciAmJiB0ZXN0SXRlbS5vcGVyYXRvciA9PT0gXCJNdWx0aXBsaWNhdGlvblwiKSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG9jY3VycmVuY2VHcm91cCA9IHRoaXMuZ2V0T2NjdXJyZW5jZUdyb3VwKCk/Lm9jY3VycmVuY09mO1xuICAgICAgICBpZiAoIW9jY3VycmVuY2VHcm91cCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gb2NjdXJyZW5jZUdyb3VwLmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAuZ2V0SXRlbXMoKSk7XG4gICAgICAgIGlmICh0ZXN0SXRlbSBpbnN0YW5jZW9mIFRva2VuKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaCA9IGl0ZW1zLmxlbmd0aCA9PT0gMSAmJiBpdGVtc1swXS5lcXVhbHModGVzdEl0ZW0pO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB0aGlzLmFkZFRvT2NjdXJyZW5jZUdyb3VwKDEpO1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRlc3RJdGVtc0FycmF5ID0gdGVzdEl0ZW0uZ2V0T2NjdXJyZW5jZUdyb3VwKCk/Lm9jY3VycmVuY09mO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpeyBcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSAnXFxcXGNkb3QgJztcbiAgICAgICAgbGV0IHN0cmluZyA9ICcnO1xuXG4gICAgICAgIHRoaXMuZ3JvdXBzLmZvckVhY2goKGdyb3VwLGluZGV4KSA9PiB7XG4gICAgICAgICAgICBzdHJpbmcgKz0gd3JhcEdyb3VwKGdyb3VwLnRvU3RyaW5nKCksIGdyb3VwLnNpbmd1bGFyKCk/QnJhY2tldFR5cGUuTm9uZTpCcmFja2V0VHlwZS5QYXJlbnRoZXNlcyk7XG4gICAgICAgICAgICBpZiAoaW5kZXggPCB0aGlzLmdyb3Vwcy5sZW5ndGggLSAxKVxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcbiAgICAgICAgcmV0dXJuIHN0cmluZy50cmltKCk7XG4gICAgfVxuXG4gICAgLypcbiAgICB0aGlzLmdyb3VwcyA9IFtbMSwgMiwgM10sWzQsIDUsIDZdLFs3LCA4LCA5XV1cbiAgICBFeHBlY3RlZCBPdXRwdXQ6XG4gICAgW1xuICAgICAgICAxKjQsIDEqNSwgMSo2LCAxKjcsIDEqOCwgMSo5LFxuICAgICAgICAyKjQsIDIqNSwgMio2LCAyKjcsIDIqOCwgMio5LFxuICAgICAgICAzKjQsIDMqNSwgMyo2LCAzKjcsIDMqOCwgMyo5LFxuICAgICAgICA0KjcsIDQqOCwgNCo5LFxuICAgICAgICA1KjcsIDUqOCwgNSo5LFxuICAgICAgICA2KjcsIDYqOCwgNio5XG4gICAgXSAgXG4gICAgKi9cblxuICAgIHBhcnNlTWF0aGpheE9wZXJhdG9yKCk6IHZvaWQge1xuXG4gICAgICAgIGNvbnN0IG1hdGhHcm91cEl0ZW1zOiBNYXRoR3JvdXBJdGVtW10gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmdyb3Vwcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBBID0gdGhpcy5ncm91cHNbaV0uZ2V0SXRlbXMoKTtcblxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGdyb3VwcyB0byBwYWlyIHdpdGhcbiAgICAgICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHRoaXMuZ3JvdXBzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBCID0gdGhpcy5ncm91cHNbal0uZ2V0SXRlbXMoKTtcblxuICAgICAgICAgICAgICAgIC8vIEdlbmVyYXRlIHBhaXJ3aXNlIHByb2R1Y3RzXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgYSBvZiBncm91cEEpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgYiBvZiBncm91cEIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGhHcm91cEl0ZW1zLnB1c2godGhpcy5wYXJzZShhLCBiKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNvbHV0aW9uID0gbmV3IE1hdGhHcm91cChtYXRoR3JvdXBJdGVtcyk7XG4gICAgfVxuICAgIFxuXG4gICAgcGFyc2UoZ3JvdXAxOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3IsZ3JvdXAyOiBUb2tlbnxNYXRoSmF4T3BlcmF0b3IpOk1hdGhHcm91cEl0ZW17XG4gICAgICAgIC8vIHJldHVybiBudW1iZXIgdG9rZW5cbiAgICAgICAgaWYoZ3JvdXAxIGluc3RhbmNlb2YgVG9rZW4mJmdyb3VwMiBpbnN0YW5jZW9mIFRva2VuJiYhZ3JvdXAxLmlzVmFyKCkmJiFncm91cDIuaXNWYXIoKSl7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFRva2VuKGdyb3VwMS5nZXROdW1iZXJWYWx1ZSgpKmdyb3VwMi5nZXROdW1iZXJWYWx1ZSgpKVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zdCBuZXdPcD0gTWF0aEpheE9wZXJhdG9yLmNyZWF0ZSgnTXVsdGlwbGljYXRpb24nLDIsW25ldyBNYXRoR3JvdXAoW2dyb3VwMV0pLG5ldyBNYXRoR3JvdXAoW2dyb3VwMl0pXSlcbiAgICAgICAgXG5cbiAgICAgICAgbmV3T3AuZ3JvdXBzLmZvckVhY2goKGdyb3VwOiBNYXRoR3JvdXAsIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIG5ld09wLmdyb3VwcyA9IG5ld09wLmdyb3Vwcy5maWx0ZXIoKG90aGVyR3JvdXA6IE1hdGhHcm91cCwgb3RoZXJJbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGV4ID09PSBvdGhlckluZGV4KSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjb25zdCBpc01hdGNoID0gZ3JvdXAuaXNQb3dHcm91cE1hdGNoKG90aGVyR3JvdXApO1xuICAgICAgICAgICAgICAgIHJldHVybiAhaXNNYXRjaDtcbiAgICAgICAgICAgIH0pOyAgXG4gICAgICAgICAgICBcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbmV3T3BcbiAgICB9XG59XG5cblxuZXhwb3J0IHR5cGUgTWF0aEdyb3VwSXRlbT1Ub2tlbnxNYXRoSmF4T3BlcmF0b3JcblxuZXhwb3J0IGNsYXNzIE1hdGhHcm91cCB7XG4gICAgcHJpdmF0ZSBpdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XG4gICAgLy9vdmVydmlldzogTWF0aE92ZXJ2aWV3XG4gICAgXG4gICAgY29uc3RydWN0b3IoaXRlbXM/OiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XG4gICAgICAgIGlmKGl0ZW1zKXRoaXMuc2V0SXRlbXMoaXRlbXMpO1xuICAgIH1cbiAgICBnZXRJdGVtcygpOiBNYXRoR3JvdXBJdGVtW10ge3JldHVybiB0aGlzLml0ZW1zO31cbiAgICBzZXRJdGVtKGl0ZW06IE1hdGhHcm91cEl0ZW0saW5kZXg6bnVtYmVyKXtcbiAgICAgICAgdGhpcy5pdGVtc1tpbmRleF09aXRlbTtcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpXG4gICAgfVxuICAgIHJlcGxhY2VJdGVtQ2VsbChpdGVtOiBNYXRoR3JvdXBJdGVtfE1hdGhHcm91cCxpbmRleDpudW1iZXIpe1xuICAgICAgICB0aGlzLml0ZW1zLnNwbGljZShpbmRleCwxLC4uLmVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtKSlcbiAgICB9XG4gICAgc2V0SXRlbXMoaXRlbXM6IGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwfGZvcm1hdHRhYmxlRm9yTWF0aEdyb3VwW10pIHtcbiAgICAgICAgdGhpcy5pdGVtcyA9IGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtcyk7XG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKSAgICBcbiAgICB9XG4gICAgZ3JvdXBWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xuICAgICAgICBjb25zdCB2YXJpYWJsZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSkgPT4ge1xuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiAmJiBpdGVtLmlzVmFyKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBpdGVtLmdldFN0cmluZ1ZhbHVlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCF2YXJpYWJsZXMuY29udGFpbnMoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB2YXJpYWJsZXM7XG4gICAgfVxuICAgIFxuICAgIHVwZGF0ZU92ZXJ2aWV3KCl7LypcbiAgICAgICAgdGhpcy5vdmVydmlldz1uZXcgTWF0aE92ZXJ2aWV3KClcbiAgICAgICAgdGhpcy5vdmVydmlldy5kZWZpbmVPdmVydmlld3NlcGFyYXRlSW50b0luZGl2aWR1YWxzKHRoaXMuaXRlbXMpKi9cbiAgICB9XG4gICAgc2luZ2xlVG9rZW5TZXQodmFsdWU6IG51bWJlcix0b0FkZD86IGJvb2xlYW4pe1xuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdIGFzIFRva2VuO1xuICAgICAgICBjb25zdCBuZXdWYWx1ZT10b0FkZD92YWx1ZSt0b2tlbi5nZXROdW1iZXJWYWx1ZSgpOnZhbHVlO1xuICAgICAgICBpZih0aGlzLnNpbmd1bFRva2VuKCkpe1xuICAgICAgICAgICAgdG9rZW4uc2V0VmFsdWUobmV3VmFsdWUpXG4gICAgICAgIH1cbiAgICB9XG4gICAgY2xvbmUoKTogTWF0aEdyb3VwIHtcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoR3JvdXAodGhpcy5pdGVtcy5tYXAoaXRlbT0+aXRlbS5jbG9uZSgpKSk7XG4gICAgfVxuXG4gICAgaGFzT3BlcmF0b3IoKTogdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuIHRoaXMuaXRlbXMuc29tZSgoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcik7fVxuICAgIGRvZXNudEhhdmVPcGVyYXRvcigpOiAgdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuICF0aGlzLmhhc09wZXJhdG9yKCk7fVxuICAgIGRlZXBIYXNPcGVyYXRvcigpe1xuICAgICAgICBjb25zdCBtYXA9dGhpcy5pdGVtcy5tYXAoKGl0ZW0pOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtLmRlZXBIYXNPcGVyYXRvcigpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKXJldHVybiB0cnVlXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBtYXAuc29tZSgodDogYm9vbGVhbik9PnQpXG4gICAgfVxuICAgIHNpbmdsZU51bWJlcigpe3JldHVybiB0aGlzLnNpbmd1bGFyKCkmJnRoaXMubnVtYmVyT25seSgpfVxuICAgIG51bWJlck9ubHkoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuZXZlcnkodCA9PiAodCBpbnN0YW5jZW9mIFRva2VuJiYhdC5pc1ZhcigpKSk7fVxuICAgIGhhc1ZhcmlhYmxlcygpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKHQgPT4gdCBpbnN0YW5jZW9mIFRva2VuJiZ0LmlzVmFyKCkpO31cblxuICAgIHNpbmd1bGFyKCk6Ym9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoID09PSAxICYmIHRoaXMuaXRlbXNbMF0gIT09IHVuZGVmaW5lZDt9XG4gICAgc2luZ3VsVG9rZW4oKTogdGhpcyBpcyB7IGl0ZW1zOiBbVG9rZW5dIH0ge3JldHVybiB0aGlzLnNpbmd1bGFyKCkgJiYgdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuO31cbiAgICBpc1Jvb3RMZXZlbCgpe3JldHVybiB0aGlzLml0ZW1zLmV2ZXJ5KChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgVG9rZW4pO31cbiAgICBnZXREZWVwdGgoKXtcbiAgICAgICAgbGV0IGRlZXB0aHM6IG51bWJlcltdPVtdO1xuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgVG9rZW4pe1xuICAgICAgICAgICAgICAgIGRlZXB0aHMucHVzaCgwKTtyZXR1cm47XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZGVlcHRocy5wdXNoKGl0ZW0uZ2V0RGVlcHRoKCkubWF4KzEpXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4ge21heDogTWF0aC5tYXgoLi4uZGVlcHRocyksIGRlZXB0aHM6IGRlZXB0aHN9XG4gICAgfVxuICAgIGlzT3BlcmFibGUoKXtyZXR1cm4gdHJ1ZX1cblxuICAgIGdldE9wZXJhYmxlVmFsdWUoKTogbnVtYmVyIHwgbnVsbFxuICAgIHtcbiAgICAgICAgY29uc3QgaXRlbXMgPSB0aGlzLml0ZW1zO1xuICAgICAgICBpZiAodGhpcy5udW1iZXJPbmx5KCkpIHtcbiAgICAgICAgICAgIGxldCB2YWx1ZT0wO1xuICAgICAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbTogVG9rZW4pID0+IHtcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBpdGVtLmdldE51bWJlclZhbHVlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaXNQb3dHcm91cE1hdGNoKGl0ZW06IE1hdGhHcm91cCl7XG4gICAgICAgIC8vUGxhY2Vob2xkZXIgZm9yIG5vd1xuICAgICAgICBpZih0aGlzLml0ZW1zLmxlbmd0aCE9PTEpcmV0dXJuIGZhbHNlXG4gICAgICAgIGNvbnN0IHRoaXNPdmVydmlldz1uZXcgTWF0aE92ZXJ2aWV3KClcbiAgICAgICAgdGhpc092ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcylcbiAgICAgICAgY29uc29sZS5sb2coJ3RoaXNPdmVydmlldycsdGhpc092ZXJ2aWV3KVxuICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMoaXRlbSlcbiAgICB9XG5cbiAgICBpc09jY3VycmVuY2VHcm91cE1hdGNoKGl0ZW06IFRva2VufE1hdGhKYXhPcGVyYXRvcnxNYXRoR3JvdXApe1xuICAgICAgICAvL1BsYWNlaG9sZGVyIGZvciBub3dcbiAgICAgICAgcmV0dXJuIHRoaXMuZXF1YWxzKGl0ZW0pXG4gICAgfVxuXG4gICAgZXF1YWxzKGl0ZW06IFRva2VufE1hdGhKYXhPcGVyYXRvcnxNYXRoR3JvdXApe1xuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgVG9rZW4pe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09MSYmdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLml0ZW1zWzBdLmVxdWFscyhpdGVtKTtcbiAgICAgICAgfVxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3ImJnRoaXMuaXRlbXNbMF0uZXF1YWxzKGl0ZW0pXG4gICAgICAgIH1cbiAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT1pdGVtLml0ZW1zLmxlbmd0aCYmdGhpcy5pdGVtcy5ldmVyeSgodDogTWF0aEdyb3VwSXRlbSk9PntcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5pdGVtcy5zb21lKChpKT0+dC5lcXVhbHMoaSkpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBnZXRJZCgpe1xuICAgICAgICByZXR1cm4gJ01hdGhHcm91cCdcbiAgICB9XG4gICAgY29tYmluaW5nTGlrZVRlcm1zKCkge1xuICAgICAgICBjb25zdCBvdmVydmlldz1uZXcgTWF0aE92ZXJ2aWV3KClcbiAgICAgICAgb3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKVxuICAgICAgICB0aGlzLnNldEl0ZW1zKG92ZXJ2aWV3LnJlY29uc3RydWN0QXNNYXRoR3JvdXBJdGVtcygpKVxuICAgICAgICBcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtOiBNYXRoR3JvdXBJdGVtLCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9jY3VycmVuY2VHcm91cCA9IGl0ZW0uZ2V0T2NjdXJyZW5jZUdyb3VwKCk7XG4gICAgICAgICAgICAgICAgaWYgKG9jY3VycmVuY2VHcm91cCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLml0ZW1zID0gdGhpcy5pdGVtcy5maWx0ZXIoKG90aGVySXRlbTogTWF0aEdyb3VwSXRlbSwgb3RoZXJJbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTa2lwIHRoZSBjdXJyZW50IGl0ZW0gaXRzZWxmXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IG90aGVySW5kZXgpIHJldHVybiB0cnVlO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2ggPSBpdGVtLmlzT2NjdXJyZW5jZUdyb3VwTWF0Y2gob3RoZXJJdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAhaXNNYXRjaDtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcbiAgICAgICAgbGV0IHN0cmluZz0nJztcbiAgICAgICAgaWYoIUFycmF5LmlzQXJyYXkodGhpcy5pdGVtcykpe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgYnV0IHJlY2VpdmVkOiBcIit0aGlzLml0ZW1zKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XG4gICAgICAgICAgICBzdHJpbmcrPXNob3VsZEFkZFBsdXModGhpcy5pdGVtc1tpbmRleC0xXSxpdGVtKVxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXAgJiYgIWl0ZW0uc2luZ3VsYXIoKSkge1xuICAgICAgICAgICAgICAgIHN0cmluZyArPSBgKCR7aXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpfSlgO1xuICAgICAgICAgICAgfSAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IGl0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKTtcbiAgICAgICAgICAgIH0gaWYgKGN1c3RvbUZvcm1hdHRlcikge1xuICAgICAgICAgICAgICAgIHN0cmluZyA9IGN1c3RvbUZvcm1hdHRlcihpdGVtLHN0cmluZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gc3RyaW5nO1xuICAgIH1cbn1cblxuXG5jbGFzcyBNYXRoT3ZlcnZpZXcge1xuICAgIHByaXZhdGUgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBhbnk+O1xuICAgIHByaXZhdGUgb3BlcmF0b3JzOiBNYXA8c3RyaW5nLCBhbnk+O1xuICAgIHByaXZhdGUgbnVtYmVyOiBudW1iZXI7XG4gICAgZ2V0TnVtYmVyKCk6IG51bWJlcntyZXR1cm4gdGhpcy5udW1iZXI7fVxuICAgIGdldFZhcmlhYmxlcygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLnZhcmlhYmxlczt9XG4gICAgZ2V0T3BlcmF0b3JzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMub3BlcmF0b3JzO31cbiAgICBjb25zdHJ1Y3Rvcih2YXJpYWJsZXM/OiBNYXA8c3RyaW5nLCBhbnk+LG9wZXJhdG9ycz86IE1hcDxzdHJpbmcsIGFueT4sbnVtYmVyPzogbnVtYmVyKXtcbiAgICAgICAgaWYodmFyaWFibGVzKXRoaXMudmFyaWFibGVzPXZhcmlhYmxlcztcbiAgICAgICAgaWYob3BlcmF0b3JzKXRoaXMub3BlcmF0b3JzPW9wZXJhdG9ycztcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcbiAgICB9XG4gICAgZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyhpdGVtczogTWF0aEdyb3VwSXRlbVtdKSB7XG4gICAgICAgIHRoaXMudmFyaWFibGVzPW5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xuICAgICAgICBpdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJml0ZW0uaXNWYXIoKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVWYXJpYWJsZXNNYXAoaXRlbS5nZXRTdHJpbmdWYWx1ZSgpKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgVG9rZW4mJiFpdGVtLmlzVmFyKCk6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlTXVtYmVyKGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcjpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVPcGVyYXRvcnNNYXAoaXRlbSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gY2F0ZWdvcnkgaW4gTWF0aE92ZXJ2aWV3IHNlcGFyYXRlSW50b0luZGl2aWR1YWxzXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgIH1cbiAgICB1cGRhdGVNdW1iZXIobnVtYmVyOiBudW1iZXIpeyB0aGlzLm51bWJlcj10aGlzLm51bWJlcj90aGlzLm51bWJlcitudW1iZXI6bnVtYmVyO31cbiAgICB1cGRhdGVWYXJpYWJsZXNNYXAoa2V5OiBzdHJpbmcpe1xuICAgICAgICB0aGlzLnZhcmlhYmxlcyA/Pz0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgaXRlbXM6IGFueVtdIH0+KCk7XG4gICAgICAgIGlmKCF0aGlzLnZhcmlhYmxlcy5oYXMoa2V5KSl7dGhpcy52YXJpYWJsZXMuc2V0KGtleSx7Y291bnQ6IDB9KX1cbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZ2V0KGtleSkuY291bnQrKztcbiAgICB9XG4gICAgdXBkYXRlT3BlcmF0b3JzTWFwKG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xuICAgICAgICBjb25zdCBrZXk9b3BlcmF0b3Iub3BlcmF0b3I7XG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xuICAgICAgICBpZighdGhpcy5vcGVyYXRvcnMuaGFzKGtleSkpe3RoaXMub3BlcmF0b3JzLnNldChrZXkse2NvdW50OiAwLCBpdGVtczogW119KX1cbiAgICAgICAgY29uc3QgZW50cnkgPSB0aGlzLm9wZXJhdG9ycy5nZXQoa2V5KSE7XG4gICAgICAgIGVudHJ5LmNvdW50ICs9IDE7XG4gICAgICAgIGVudHJ5Lml0ZW1zLnB1c2gob3BlcmF0b3IpO1xuICAgIH1cblxuICAgIGhhc1Zhcigpe3JldHVybiB0aGlzLnZhcmlhYmxlcyYmdGhpcy52YXJpYWJsZXMuc2l6ZT4wfVxuICAgIGhhc09wKCl7cmV0dXJuIHRoaXMub3BlcmF0b3JzJiZ0aGlzLm9wZXJhdG9ycy5zaXplPjB9XG4gICAgb25seU51bWVyaWMoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMubnVtYmVyJiYhdGhpcy5oYXNWYXIoKSYmIXRoaXMuaGFzT3AoKVxuICAgIH1cbiAgICByZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKXtcbiAgICAgICAgY29uc3QgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXT1bXTtcbiAgICAgICAgaWYodGhpcy5udW1iZXIpaXRlbXMucHVzaChuZXcgVG9rZW4odGhpcy5udW1iZXIpKTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYodmFsdWUuY291bnQ9PT0xKXtcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKG5ldyBUb2tlbihrZXkpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZih2YWx1ZS5jb3VudD4xKXtcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKE11bHRpcGxpY2F0aW9uT3BlcmF0b3IuYXNPY2N1cnJlbmNlR3JvdXAodmFsdWUuY291bnQsa2V5KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmKHRoaXMub3BlcmF0b3JzKXtcbiAgICAgICAgICAgIGl0ZW1zLnB1c2goLi4uQXJyYXkuZnJvbSh0aGlzLm9wZXJhdG9ycy52YWx1ZXMoKSkuZmxhdE1hcCgob3BlcmF0b3I6IGFueSkgPT4gb3BlcmF0b3IuaXRlbXMpKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpdGVtcztcbiAgICB9XG59XG5cblxuXG5cblxuXG5leHBvcnQgY2xhc3MgVG9rZW57XG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTpudW1iZXJ8c3RyaW5nKXtcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICB9XG4gICAgZ2V0TnVtYmVyVmFsdWUoKTpudW1iZXJ7cmV0dXJuICh0aGlzLnZhbHVlIGFzIG51bWJlcil9XG4gICAgZ2V0U3RyaW5nVmFsdWUoKTpzdHJpbmd7cmV0dXJuICh0aGlzLnZhbHVlIGFzIHN0cmluZyl9XG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cbiAgICBzZXRWYWx1ZSh2YWx1ZTogbnVtYmVyfHN0cmluZyl7dGhpcy52YWx1ZT12YWx1ZTt9XG4gICAgaXNWYXIoKSB7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlID09PSAnc3RyaW5nJzt9XG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy52YWx1ZSA9PT0gaXRlbS52YWx1ZTtcbiAgICB9XG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XG4gICAgICAgIGxldCBzdHJpbmc9JydcbiAgICAgICAgaWYoIXRoaXMuaXNWYXIoKSYmdGhpcy5nZXROdW1iZXJWYWx1ZSgpPDApXG4gICAgICAgICAgICBzdHJpbmcrPSctJztcbiAgICAgICAgc3RyaW5nKz10aGlzLnZhbHVlO1xuICAgICAgICBpZihjdXN0b21Gb3JtYXR0ZXIpe1xuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5nO1xuICAgIH1cbiAgICBjbG9uZSgpe3JldHVybiBuZXcgVG9rZW4odGhpcy52YWx1ZSl9XG59XG5cblxuXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW5ze1xuICAgIHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+PVtdO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKHRva2Vucz86IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPil7XG4gICAgICAgIHRoaXMudG9rZW5zPXRva2Vuc3x8W107XG4gICAgfVxuICAgIGFkZElucHV0KG1hdGg6IHN0cmluZyl7XG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XG4gICAgfVxuICAgIHRva2VuaXplKG1hdGg6IHN0cmluZyl7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzKCkpXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGU9L1tcXChcXCldLy50ZXN0KG1hdGNoWzBdKT8ncGFyZW4nOidvcGVyYXRvcidcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4odHlwZSxtYXRjaFswXSkpO1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbignbnVtYmVyJyxwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oXCJ2YXJpYWJsZVwiLG1hdGNoWzBdKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcbiAgICAgICAgfVxuICAgICAgIHRoaXMucG9zdFByb2Nlc3NUb2tlbnMoKTtcbiAgICB9XG5cbiAgICBwb3N0UHJvY2Vzc1Rva2Vucygpe1xuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XG4gICAgICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcbiAgICAgICAgKi9cbiAgICAgICAgdGhpcy50b2tlbnM9aWRQYXJlbnRoZXNlcyh0aGlzLnRva2Vucyk7XG4gICAgICAgIHRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXG4gICAgICAgIFxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxuXG4gICAgICAgIHBhcmVuTWFwLnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBiIC0gYSlcbiAgICAgICAgLmZvckVhY2goKHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3ICBCYXNpY01hdGhKYXhUb2tlbignb3BlcmF0b3InLCcqJykpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKClcbiAgICB9XG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpIHtcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KXx8ISh0aGlzLnRva2Vuc1tpbmRleF0gaW5zdGFuY2VvZiBQYXJlbikpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGZpbmRQYXJlbkluZGV4KGluZGV4LHRoaXMudG9rZW5zKT8ub3BlbjtcbiAgICBcbiAgICAgICAgICAgIGlmIChpZHggPT0gbnVsbCB8fCAhaXNPcGVuUGFyZW4odGhpcy50b2tlbnNbaW5kZXggKyAxXSkpIHJldHVybiBmYWxzZTtcbiAgICBcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRoaXMudG9rZW5zW2lkeCAtIDFdO1xuICAgIFxuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICBpZHggPiAwICYmXG4gICAgICAgICAgICAgICAgcHJldlRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZcbiAgICAgICAgICAgICAgICAhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXMocHJldlRva2VuLnZhbHVlPy50b1N0cmluZygpIHx8ICcnKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcbiAgICBcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHRva2VuLmlzVmFsdWVUb2tlbigpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb249KHRva2VuOiBhbnkpPT57XG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiYmdHlwZW9mIHRva2VuLnZhbHVlPT09J3N0cmluZycmJmhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4udmFsdWUpXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaXNWYXI9KHRva2VuOiBhbnkpPT57cmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZ0b2tlbi50eXBlPT09J3ZhcmlhYmxlJ31cbiAgICAgICAgY29uc3QgcHJlY2VkZXNWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaW5kZXg+MCYmaXNWYXIodG9rZW5zW2luZGV4XSlcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGZvbGxvd3NWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaW5kZXg8dG9rZW5zLmxlbmd0aC0xJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXG4gICAgICAgICAgICAubWFwKCh0b2tlbiwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoaXNPcGVuUGFyZW4odG9rZW4pfHwgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuKXx8cHJlY2VkZXNWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpc0Nsb3NlZFBhcmVuKHRva2VuKXx8Zm9sbG93c1ZhcmlhYmxlKHRoaXMudG9rZW5zLGluZGV4KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggKyAxKSB8fCB0ZXN0RG91YmxlUmlnaHQoaW5kZXgpID8gaW5kZXggKyAxIDogbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbSkgPT4gaXRlbSAhPT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBtYXA7XG4gICAgfVxuICAgIFxuXG4gICAgdmFsaWRhdGVQbHVzTWludXMoKXtcbiAgICAgICAgLy8gUGx1c2VzIGFyZSBzZXBhcmF0b3JzLlRoZXJlZm9yZSwgdGhleSBkbyBub3QgbmVlZCB0byBiZSBoZXJlIEFzIHRoZSBleHByZXNzaW9uIGlzIHRva2VuW11cbiAgICAgICAgLy9NaW51c2VzIG9uIHRoZSBvdGhlciBoYW5kLmNhbiBlaXRoZXIgYmUgYSBzZXBhcmF0b3IuIE9yIGEgbmVnYXRpdmUgc2lnblxuICAgICAgICBjb25zdCBwbHVzTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VuLCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gJ0FkZGl0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxuICAgICAgICBwbHVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IG1pbnVzTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VuLCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gJ1N1YnRyYWN0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxuICAgICAgICBcbiAgICAgICAgbWludXNNYXAucmV2ZXJzZSgpLmZvckVhY2goKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5leHRUb2tlbiA9IHRoaXMudG9rZW5zW2luZGV4ICsgMV07XG4gICAgICAgICAgICBpZiAobmV4dFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdHlwZW9mIG5leHRUb2tlbi52YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgbmV4dFRva2VuLnZhbHVlICo9IC0xO1xuICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgIH1cbiAgICB2YWxpZGF0ZUluZGV4KGluZGV4OiBudW1iZXIsbWFyZ2luPzogbnVtYmVyKXtcbiAgICAgICAgbWFyZ2luPW1hcmdpbnx8MDtcbiAgICAgICAgcmV0dXJuIGluZGV4Pj0wK21hcmdpbiYmaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLW1hcmdpbjtcbiAgICB9XG4gICAgY2xvbmUoKTogQmFzaWNNYXRoSmF4VG9rZW5zIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCYXNpY01hdGhKYXhUb2tlbnModGhpcy50b2tlbnMubWFwKHRva2VuID0+IHRva2VuLmNsb25lKCkpKTtcbiAgICB9XG4gICAgLypcbiAgICBcbiAgICBpbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKCl7XG4gICAgICAgIGNvbnN0IHRlc3REb3VibGVSaWdodCA9IChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGlkeD1maW5kUGFyZW5JbmRleChudWxsLGluZGV4KS5vcGVuO1xuICAgICAgICAgICAgcmV0dXJuIGlzT3BlblBhcmVuKHRoaXMudG9rZW5zW2luZGV4KzFdKSYmKGlkeD09PTB8fCFnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoJ2RvdWJsZVJpZ2h0JykuaW5jbHVkZXModGhpcy50b2tlbnNbaWR4LTFdPy52YWx1ZSkpO1xuICAgICAgICAgICAgXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmICghKFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pfHwhdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zW2luZGV4XS5pc1ZhbHVlVG9rZW4oKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xuICAgICAgICAgICAgLm1hcCgodG9rZW46IHsgdmFsdWU6IHN0cmluZzsgfSwgaW5kZXg6IG51bWJlcikgPT4geyBcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8IChoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLnZhbHVlKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlbi52YWx1ZSA9PT0gXCIpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHx0ZXN0RG91YmxlUmlnaHQoaW5kZXgpPyBpbmRleCsxIDogbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBtYXA7XG4gICAgfVxuXG4gICAgXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbjogYW55LCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gXCIoXCIgPyBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIGluZGV4KSA6IG51bGwpXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgfVxuXG4gICAgZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwUGFyZW5JbmRleGVzKClcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcbiAgICAgICAgICAgICAgICBpZiAob3BlbkluZGV4ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoLyhvcGVyYXRvcnxwYXJlbikvLnRlc3QodGhpcy50b2tlbnNbb3BlbkluZGV4IC0gMV0/LnR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNsb3NlSW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0/LmlzVmFsdWVUb2tlbigpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KS5mbGF0TWFwKChpdGVtOiBhbnkpID0+IFtpdGVtLm9wZW4sIGl0ZW0uY2xvc2VdKTtcbiAgICB9ICAgIFxuICAgIFxuICAgIFxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXG4gICAgICAgICkpO1xuICAgICB9XG4gICAgXG4gICAgY29ubmVjdE5lYXJieVRva2Vucygpe1xuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIFRva2VuKSl7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZnR5Z3ViaG5pbXBvXCIpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBtYXAgPSBuZXcgU2V0KHRoaXMuZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpKTtcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKF86IGFueSwgaWR4OiB1bmtub3duKSA9PiAhbWFwLmhhcyhpZHgpKTtcbiAgICAgICAgLy9Qcm9ibGVtIHdpdGggID0gYXMgaXQncyBhZmZlY3RpbmcgdGhlIHZhcmlhYmxlIGJlZm9yZSBpdFxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4IC0gMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKCkgJiZcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCArIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpXG4gICAgICAgICAgICApO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIFxuICAgICAgICBjb25zdCBhcnIgPSBbXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobnVtTWFwKSwgXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXModmFyTWFwKSwgXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKVxuICAgICAgICBcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcbiAgICB9XG5cbiAgICBcblxuICAgIGV4cHJlc3Npb25WYXJpYWJsZVZhbGlkaXR5KCl7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxuICAgICAgICAgICAgJiYgdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcbiAgICAgICAgKVxuICAgICAgICB7cmV0dXJuIEluZmluaXR5fVxuICAgIH1cblxuICAgIGluc2VydFRva2VucyhzdGFydDogYW55LCBsZW5ndGg6IG51bWJlciwgb2JqZWN0czogYW55W10gfCBUb2tlbikge1xuICAgICAgICBvYmplY3RzID0gZmxhdHRlbkFycmF5KG9iamVjdHMpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHBlY3RlZCBgb2JqZWN0c2AgdG8gYmUgYW4gYXJyYXksIGJ1dCByZWNlaXZlZDpcIiwgb2JqZWN0cyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBsZW5ndGgsIC4uLm9iamVjdHMpO1xuICAgIH1cblxuICAgIFxuXG4gICAgaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnM6IGFueVtdKXtcbiAgICAgICAgcmV0dXJuIHRva2Vucy5tYXAoKHRva2VuLGluZGV4KT0+aW5kZXg+MFxuICAgICAgICAgICAgJiZ0b2tlbnNbaW5kZXggLSAxXT8uaXNWYWx1ZVRva2VuKClcbiAgICAgICAgICAgICYmdG9rZW4/LmlzVmFsdWVUb2tlbigpJiZ0b2tlbi52YWx1ZT49MD9pbmRleDpudWxsXG4gICAgICAgICkuZmlsdGVyKGl0ZW09Pml0ZW0hPT1udWxsKVxuICAgIH1cblxuICAgIHRva2VuQ29tcGFyZShjb21wYXJlOiBzdHJpbmcgfCBudW1iZXIsIHZhbHVlOiBzdHJpbmd8UmVnRXhwLCB0b2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9LCBuZXh0VG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSkge1xuICAgICAgICBjb25zdCByZWdFeHB2YWx1ZSA9ICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgKHZhbHVlID09PSBudWxsIHx8IHJlZ0V4cHZhbHVlLnRlc3QodG9rZW5bY29tcGFyZV0pKSAmJlxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXG4gICAgICAgICk7XG4gICAgfVxuICAgICovXG59XG5cblxuXG5cblxuXG5cbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbntcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgdmFsdWU/OiBzdHJpbmd8bnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IodHlwZTpzdHJpbmcgLHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQpe1xuICAgICAgICB0aGlzLnR5cGU9dHlwZTtcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICAgICAgdGhpcy5pbnN1clByb3BlckZvcm1hdHRpbmcoKVxuICAgIH1cbiAgICBpbnN1clByb3BlckZvcm1hdHRpbmcoKXtcbiAgICAgICAgaWYgKCF0aGlzLmlzVmFsdWVUb2tlbigpJiZ0eXBlb2YgdGhpcy52YWx1ZT09PVwic3RyaW5nXCIpe1xuICAgICAgICAgICAgdGhpcy52YWx1ZT1zZWFyY2hBbGxNYXRoSmF4T3BlcmF0b3JzQW5kU3ltYm9scyh0aGlzLnZhbHVlKT8ubmFtZVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0TGF0ZXhTeW1ib2woKXtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJz9zZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMudmFsdWUpPy5sYXRleDp1bmRlZmluZWR9XG5cbiAgICBnZXRmdWxsVHlwZSgpe1xuICAgICAgICByZXR1cm4gdGhpcy50eXBlXG4gICAgfVxuICAgIGNsb25lKCl7XG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW4odGhpcy50eXBlLCB0aGlzLnZhbHVlKVxuICAgIH1cblxuXG4gICAgaXNTdHJpbmcoKXtyZXR1cm4gdGhpcy50eXBlPT09J3BhcmVuJ3x8dGhpcy50eXBlPT09J29wZXJhdG9yJ31cblxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cblxuICAgIHRvU3RyaW5nTGF0ZXgoKXtcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xuICAgICAgICBpZiAodGhpcy5pc1N0cmluZygpKVxuICAgICAgICAgICAgc3RyaW5nKz10aGlzLmdldExhdGV4U3ltYm9sKClcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdudW1iZXInKSBzdHJpbmcrPXRoaXMudmFsdWU7XG4gICAgICAgIHJldHVybiBzdHJpbmdcbiAgICB9XG4gICAgYWZmZWN0ZWRPcGVyYXRvclJhbmdlKGRpcmVjdGlvbjogc3RyaW5nKXtcbiAgICAgICAgaWYodGhpcy50eXBlIT09J29wZXJhdG9yJ3x8dGhpcy52YWx1ZT09PSdFcXVhbHMnKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIGlmKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycmJmRpcmVjdGlvbj09PSdsZWZ0JyYmIWlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSh0aGlzLnZhbHVlLCBbLTEsIDFdLHRydWUpKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxufSJdfQ==