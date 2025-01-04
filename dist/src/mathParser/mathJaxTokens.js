import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { BracketType } from "src/utils/staticData";
import { findParenIndex, Paren, idParentheses, isOpenParen, isClosedParen } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators } from "../utils/dataManager";
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
        console.log('this.groups', this.groups);
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
            string += wrapGroup(group.toString(), group.singular() ? BracketType.CurlyBraces : BracketType.None);
            if (index < this.groups.length - 1)
                string += operator;
        });
        if (customFormatter)
            return customFormatter(this, string);
        return string.trim();
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
    equals(item) {
        if (item instanceof Token) {
            return this.items.length === 1 && this.items[0] instanceof Token && this.items[0].getStringValue() === item.getStringValue();
        }
        if (item instanceof MathJaxOperator) {
            return this.items.length === 1 && this.items[0] instanceof MathJaxOperator && this.items[0].operator === item.operator;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUEsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUFtRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5JLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUt4UixTQUFTLFNBQVMsQ0FBQyxLQUFhLEVBQUUsSUFBaUI7SUFDL0MsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNYLEtBQUssV0FBVyxDQUFDLFdBQVc7WUFDeEIsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO1FBQ3hCLEtBQUssV0FBVyxDQUFDLFdBQVc7WUFDeEIsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO1FBQ3hCO1lBQ0ksT0FBTyxLQUFLLENBQUM7SUFDckIsQ0FBQztBQUNMLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQzlCLFNBQWMsRUFDZCxTQUFpQyxFQUNqQyxPQUE0QixFQUFFO0lBRTlCLDREQUE0RDtJQUM1RCxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxtRUFBbUU7SUFDbkUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFD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QUFVLElBQUUsSUFBSSxDQUFDLEtBQUssS0FBRyxRQUFRO1lBQzVDLE9BQU8sS0FBSyxDQUFBO1FBQ2hCLElBQUcsT0FBTyxJQUFJLENBQUMsS0FBSyxLQUFHLFFBQVEsSUFBRSxTQUFTLEtBQUcsTUFBTSxJQUFFLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQztZQUN2RyxPQUFPLEtBQUssQ0FBQTtRQUNoQixPQUFPLElBQUksQ0FBQTtJQUNmLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi4vaW1WZXJ5TGF6eVwiO1xyXG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgQXNzb2NpYXRpdml0eSwgQnJhY2tldFR5cGUsIE1hdGhKYXhPcGVyYXRvck1ldGFkYXRhLCBtYXRoSmF4T3BlcmF0b3JzTWV0YWRhdGEsIE9wZXJhdG9yVHlwZSB9IGZyb20gXCJzcmMvdXRpbHMvc3RhdGljRGF0YVwiO1xyXG5cclxuaW1wb3J0IHsgZmluZFBhcmVuSW5kZXgsIFBhcmVuLGlkUGFyZW50aGVzZXMsIGlzT3BlblBhcmVuLCBpc0Nsb3NlZFBhcmVuIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcclxuaW1wb3J0IHsgZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHksIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlLCBoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uLCBpc09wZXJhdG9yV2l0aEFzc29jaWF0aXZpdHksIHNlYXJjaEFsbE1hdGhKYXhPcGVyYXRvcnNBbmRTeW1ib2xzLCBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzLCBzZWFyY2hTeW1ib2xzIH0gZnJvbSBcIi4uL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IGdyb3VwIH0gZnJvbSBcImNvbnNvbGVcIjtcclxuaW1wb3J0IHsga2V5IH0gZnJvbSBcImxvY2FsZm9yYWdlXCI7XHJcbmltcG9ydCB7IHZhbHVlIH0gZnJvbSBcInZhbGlib3RcIjtcclxuXHJcbmZ1bmN0aW9uIHdyYXBHcm91cChncm91cDogc3RyaW5nLCB3cmFwOiBCcmFja2V0VHlwZSk6IHN0cmluZyB7XHJcbiAgICBzd2l0Y2ggKHdyYXApIHtcclxuICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLlBhcmVudGhlc2VzOlxyXG4gICAgICAgICAgICByZXR1cm4gYCgke2dyb3VwfSlgO1xyXG4gICAgICAgIGNhc2UgQnJhY2tldFR5cGUuQ3VybHlCcmFjZXM6XHJcbiAgICAgICAgICAgIHJldHVybiBgeyR7Z3JvdXB9fWA7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgcmV0dXJuIGdyb3VwO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGVlcFNlYXJjaFdpdGhQYXRoKFxyXG4gICAgc3RydWN0dXJlOiBhbnksXHJcbiAgICBwcmVkaWNhdGU6IChpdGVtOiBhbnkpID0+IGJvb2xlYW4sXHJcbiAgICBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW11cclxuKTogeyBpdGVtOiBhbnk7IHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gfSB8IG51bGwge1xyXG4gICAgLy8gQmFzZSBjYXNlOiBJZiB0aGUgY3VycmVudCBzdHJ1Y3R1cmUgbWF0Y2hlcyB0aGUgcHJlZGljYXRlXHJcbiAgICBpZiAocHJlZGljYXRlKHN0cnVjdHVyZSkpIHtcclxuICAgICAgICByZXR1cm4geyBpdGVtOiBzdHJ1Y3R1cmUsIHBhdGggfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBpdCdzIGFuIGFycmF5LCByZWN1cnNpdmVseSBzZWFyY2ggZWFjaCBlbGVtZW50IHdpdGggaXRzIGluZGV4XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheShzdHJ1Y3R1cmUpKSB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJ1Y3R1cmUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtpXSwgcHJlZGljYXRlLCBbLi4ucGF0aCwgaV0pO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBpdCdzIGFuIG9iamVjdCwgcmVjdXJzaXZlbHkgc2VhcmNoIGl0cyBwcm9wZXJ0aWVzIHdpdGggdGhlaXIga2V5c1xyXG4gICAgaWYgKHN0cnVjdHVyZSAhPT0gbnVsbCAmJiB0eXBlb2Ygc3RydWN0dXJlID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gc3RydWN0dXJlKSB7XHJcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RydWN0dXJlLCBrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2tleV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGtleV0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBubyBtYXRjaCBpcyBmb3VuZFxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxudHlwZSBmb3JtYXR0YWJsZUZvck1hdGhHcm91cD1NYXRoR3JvdXBJdGVtfE1hdGhHcm91cHxCYXNpY01hdGhKYXhUb2tlblxyXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKTogTWF0aEdyb3VwSXRlbVtdIHtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShpdGVtcykpIHtcclxuICAgICAgICBpdGVtcyA9IFtpdGVtc107XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZm9ybWF0dGVkSXRlbXMgPSBpdGVtc1xyXG4gICAgICAgIC5yZWR1Y2UoKGFjYzogTWF0aEdyb3VwSXRlbVtdLCBpdGVtOiBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciB8IEJhc2ljTWF0aEpheFRva2VuKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjLmNvbmNhdChlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbS5nZXRJdGVtcygpKSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgVG9rZW4gfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xyXG4gICAgICAgICAgICAgICAgYWNjLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS52YWx1ZSAmJiAoaXRlbS50eXBlID09PSBcIm51bWJlclwiIHx8IGl0ZW0udHlwZSA9PT0gXCJ2YXJpYWJsZVwiKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFjYy5wdXNoKG5ldyBUb2tlbihpdGVtLnZhbHVlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgICAgICAgICBgRXhwZWN0ZWQgaXRlbSB0byBiZSBhIG51bWJlciBvciB2YXJpYWJsZSBidXQgcmVjZWl2ZWQ6ICR7aXRlbS52YWx1ZX1gXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgfSwgW10pXHJcblxyXG4gICAgcmV0dXJuIGZvcm1hdHRlZEl0ZW1zO1xyXG59XHJcbmZ1bmN0aW9uIHNob3VsZEFkZFBsdXMoZ3JvdXAxPzogYW55LGdyb3VwMj86IGFueSl7XHJcbiAgICBpZighZ3JvdXAxfHwhZ3JvdXAyKXJldHVybiAnJztcclxuXHJcbiAgICByZXR1cm4gJysnO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYW5Db21iaW5lKG1hdGg6IE1hdGhHcm91cCxvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcclxuXHJcbn1cclxuZXhwb3J0IGNsYXNzIE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICBvcGVyYXRvcjogc3RyaW5nO1xyXG4gICAgZ3JvdXBOdW06IG51bWJlciA9IDE7XHJcbiAgICBncm91cHM6IE1hdGhHcm91cFtdO1xyXG4gICAgc29sdXRpb246IE1hdGhHcm91cDtcclxuICAgIGNvbW11dGF0aXZlOiBib29sZWFuO1xyXG4gICAgaXNPcGVyYWJsZTogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKSB7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yKSB0aGlzLm9wZXJhdG9yID0gb3BlcmF0b3I7XHJcbiAgICAgICAgaWYgKGdyb3VwTnVtKSB0aGlzLmdyb3VwTnVtID0gZ3JvdXBOdW07XHJcbiAgICAgICAgaWYgKGdyb3VwcykgdGhpcy5ncm91cHMgPSBncm91cHM7XHJcbiAgICAgICAgaWYgKHNvbHV0aW9uKSB0aGlzLnNvbHV0aW9uID0gc29sdXRpb247XHJcbiAgICAgICAgaWYgKGlzT3BlcmFibGUgIT09IHVuZGVmaW5lZCkgdGhpcy5pc09wZXJhYmxlID0gaXNPcGVyYWJsZTtcclxuICAgIH1cclxuICAgIHN0YXRpYyBjcmVhdGUob3BlcmF0b3I/OiBzdHJpbmcsIGdyb3VwTnVtPzogbnVtYmVyLCBncm91cHM/OiBNYXRoR3JvdXBbXSwgc29sdXRpb24/OiBNYXRoR3JvdXAsIGlzT3BlcmFibGU/OiBib29sZWFuKTogTWF0aEpheE9wZXJhdG9yIHtcclxuICAgICAgICBpZiAob3BlcmF0b3IgPT09IFwiTXVsdGlwbGljYXRpb25cIikge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoZ3JvdXBzLCBzb2x1dGlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBuZXcgTWF0aEpheE9wZXJhdG9yKG9wZXJhdG9yLCBncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgaXNPcGVyYWJsZSk7XHJcbiAgICB9XHJcbiAgICB0ZXN0R3JvdXBzKHRlc3Q6IChncm91cDogTWF0aEdyb3VwKSA9PiBib29sZWFuKTogYm9vbGVhbltdIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5ncm91cHMubWFwKHRlc3QpO1xyXG4gICAgfVxyXG5cclxuICAgIG1hcFZhcmlhYmxlcygpOiBib29sZWFuW10ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaGFzVmFyaWFibGVzKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIG9wZXJhdG9yVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcclxuICAgICAgICByZXR1cm4gWy4uLm5ldyBTZXQodGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmdyb3VwVmFyaWFibGVzKCkpLmZsYXQoKSldO1xyXG4gICAgfVxyXG5cclxuICAgIGdldERlZXB0aCgpIHtcclxuICAgICAgICBjb25zdCBkZXB0aHMgPSB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuZ2V0RGVlcHRoKCkubWF4KTtcclxuICAgICAgICByZXR1cm4geyBtYXg6IE1hdGgubWF4KC4uLmRlcHRocyksIGRlcHRocyB9O1xyXG4gICAgfVxyXG5cclxuICAgIGNsb25lKCk6IE1hdGhKYXhPcGVyYXRvciB7XHJcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmNsb25lKCkpO1xyXG4gICAgICAgIGNvbnN0IHNvbHV0aW9uID0gdGhpcy5zb2x1dGlvbiA/IHRoaXMuc29sdXRpb24uY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgICAgICByZXR1cm4gTWF0aEpheE9wZXJhdG9yLmNyZWF0ZSh0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nU29sdXRpb24oKTogc3RyaW5nIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZygpICsgJyA9ICcgKyB0aGlzLnNvbHV0aW9uPy50b1N0cmluZygpO1xyXG4gICAgfVxyXG5cclxuICAgIGVxdWFscyhpdGVtOiBNYXRoR3JvdXBJdGVtKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiZcclxuICAgICAgICAgICAgdGhpcy5vcGVyYXRvciA9PT0gaXRlbS5vcGVyYXRvciAmJlxyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5sZW5ndGggPT09IGl0ZW0uZ3JvdXBzLmxlbmd0aCAmJlxyXG4gICAgICAgICAgICB0aGlzLmdyb3Vwcy5ldmVyeSgodCwgaW5kZXgpID0+IHQuZXF1YWxzKGl0ZW0uZ3JvdXBzW2luZGV4XSkpO1xyXG4gICAgfVxyXG4gICAgZ2V0T2NjdXJyZW5jZUdyb3VwKCk6IHsgb2NjdXJyZW5jZXNDb3VudDogbnVtYmVyOyBvY2N1cnJlbmNPZjogTWF0aEdyb3VwW10gfXxudWxsICB7IHJldHVybiBudWxsOyB9ICBcclxuICAgIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7cmV0dXJuIGZhbHNlO31cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGZ1bmN0aW9uIHdyYXBHcm91cChncm91cDogTWF0aEdyb3VwLCB3cmFwOiBCcmFja2V0VHlwZSxvcHRpb25hbDogYm9vbGVhbik6IHN0cmluZyB7XHJcbiAgICAgICAgICAgIGlmKG9wdGlvbmFsJiZncm91cC5zaW5ndWxhcigpKXJldHVybiBncm91cC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpO1xyXG4gICAgICAgICAgICBjb25zdCBncm91cFN0cj1ncm91cC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpXHJcbiAgICAgICAgICAgIHN3aXRjaCAod3JhcCkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5QYXJlbnRoZXNlczpcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCgke2dyb3VwU3RyfSlgO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5DdXJseUJyYWNlczpcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYHske2dyb3VwU3RyfX1gO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ3JvdXBTdHI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLm9wZXJhdG9yKTtcclxuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gJyc7XHJcbiAgICAgICAgaWYobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM+Mnx8bWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM8MSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBudW1iZXIgb2YgcG9zaXRpb25zIGZvciBhc3NvY2lhdGl2aXR5OiAke21ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBtZXRhZGF0YS5sYXRleDtcclxuICAgICAgICBsZXQgaW5kZXg9MDtcclxuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XHJcblxyXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLHRydWUpLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleC0xXSx0aGlzLmdyb3Vwc1tpbmRleF0pK3dyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0sIGl0ZW0uYnJhY2tldFR5cGUsIGl0ZW0uaXNCcmFja2V0T3B0aW9uYWwpO1xyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBzdHJpbmcgKz0gb3BlcmF0b3I7XHJcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsZmFsc2UpLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleF0sdGhpcy5ncm91cHNbaW5kZXgrMV0pK3dyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0sIGl0ZW0uYnJhY2tldFR5cGUsIGl0ZW0uaXNCcmFja2V0T3B0aW9uYWwpO1xyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICByZXR1cm4gc3RyaW5nLnRyaW0oKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yIGV4dGVuZHMgTWF0aEpheE9wZXJhdG9yIHtcclxuICAgIGNvbnN0cnVjdG9yKGdyb3Vwcz86IE1hdGhHcm91cFtdLCBzb2x1dGlvbj86IE1hdGhHcm91cCkge1xyXG4gICAgICAgIHN1cGVyKFwiTXVsdGlwbGljYXRpb25cIiwgMiwgZ3JvdXBzLCBzb2x1dGlvbiwgdHJ1ZSk7XHJcbiAgICAgICAgdGhpcy5jb21tdXRhdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5yZW1vdmVNdWx0aXBsaWNhdGlvbkRlcHRocygpO1xyXG4gICAgfVxyXG4gICAgcmVtb3ZlTXVsdGlwbGljYXRpb25EZXB0aHMoKXtcclxuICAgICAgICB0aGlzLmdyb3Vwcy5mb3JFYWNoKChncm91cDogTWF0aEdyb3VwKSA9PiB7XHJcbiAgICAgICAgICAgIGlmKGdyb3VwLnNpbmd1bGFyKCkmJmdyb3VwLmdldEl0ZW1zKClbMF0gaW5zdGFuY2VvZiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKXtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW1zPShncm91cC5nZXRJdGVtcygpWzBdIGFzIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IpLmdyb3VwcztcclxuICAgICAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnNwbGljZSh0aGlzLmdyb3Vwcy5pbmRleE9mKGdyb3VwKSwxLC4uLml0ZW1zKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ3RoaXMuZ3JvdXBzJyx0aGlzLmdyb3VwcylcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgYXNPY2N1cnJlbmNlR3JvdXAob2NjdXJyZW5jZXNDb3VudDogbnVtYmVyLG9jY3VycmVuY09mOiBzdHJpbmd8VG9rZW58TWF0aEdyb3VwKTogTXVsdGlwbGljYXRpb25PcGVyYXRvciB7XHJcbiAgICAgICAgb2NjdXJyZW5jT2Y9dHlwZW9mIG9jY3VycmVuY09mPT09XCJzdHJpbmdcIj9cclxuICAgICAgICAgICAgbmV3IE1hdGhHcm91cChbbmV3IFRva2VuKG9jY3VycmVuY09mKV0pOm9jY3VycmVuY09mIGluc3RhbmNlb2YgVG9rZW4/XHJcbiAgICAgICAgICAgICAgICBuZXcgTWF0aEdyb3VwKFtvY2N1cnJlbmNPZl0pOm9jY3VycmVuY09mO1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3IE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoW25ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNlc0NvdW50KV0pLG9jY3VycmVuY09mXSlcclxuICAgIH1cclxuICAgIFxyXG4gICAgb3ZlcnJpZGUgZ2V0T2NjdXJyZW5jZUdyb3VwKCk6IHsgb2NjdXJyZW5jZXNDb3VudDogbnVtYmVyOyBvY2N1cnJlbmNPZjogTWF0aEdyb3VwW10gfSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5ncm91cHMucmVkdWNlKFxyXG4gICAgICAgICAgICAoYWNjOiB7IHRvdGFsTnVtOiBudW1iZXI7IGFycjogTWF0aEdyb3VwW10gfSwgaXRlbTogTWF0aEdyb3VwKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5nZXRPcGVyYWJsZVZhbHVlKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBhY2MudG90YWxOdW0gKz0gaXRlbS5nZXRPcGVyYWJsZVZhbHVlKCkhO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBhY2MuYXJyLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7IHRvdGFsTnVtOiAwLCBhcnI6IFtdIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiB7IG9jY3VycmVuY2VzQ291bnQ6IHJlc3VsdC50b3RhbE51bSwgb2NjdXJyZW5jT2Y6IHJlc3VsdC5hcnIgfTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRUb09jY3VycmVuY2VHcm91cCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbnVtYmVyR3JvdXAgPSB0aGlzLmdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLnNpbmdsZU51bWJlcigpKTtcclxuICAgICAgICBpZiAobnVtYmVyR3JvdXApIHtcclxuICAgICAgICAgICAgbnVtYmVyR3JvdXAuc2luZ2xlVG9rZW5TZXQodmFsdWUsIHRydWUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBzLnB1c2gobmV3IE1hdGhHcm91cChbbmV3IFRva2VuKDEgKyB2YWx1ZSldKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG92ZXJyaWRlIGlzT2NjdXJyZW5jZUdyb3VwTWF0Y2godGVzdEl0ZW06IE1hdGhKYXhPcGVyYXRvciB8IFRva2VuKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKCEodGVzdEl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCAodGVzdEl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IgJiYgdGVzdEl0ZW0ub3BlcmF0b3IgPT09IFwiTXVsdGlwbGljYXRpb25cIikpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG9jY3VycmVuY2VHcm91cCA9IHRoaXMuZ2V0T2NjdXJyZW5jZUdyb3VwKCk/Lm9jY3VycmVuY09mO1xyXG4gICAgICAgIGlmICghb2NjdXJyZW5jZUdyb3VwKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gb2NjdXJyZW5jZUdyb3VwLmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAuZ2V0SXRlbXMoKSk7XHJcbiAgICAgICAgaWYgKHRlc3RJdGVtIGluc3RhbmNlb2YgVG9rZW4pIHtcclxuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBpdGVtcy5sZW5ndGggPT09IDEgJiYgaXRlbXNbMF0uZXF1YWxzKHRlc3RJdGVtKTtcclxuICAgICAgICAgICAgaWYgKG1hdGNoKSB0aGlzLmFkZFRvT2NjdXJyZW5jZUdyb3VwKDEpO1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRlc3RJdGVtc0FycmF5ID0gdGVzdEl0ZW0uZ2V0T2NjdXJyZW5jZUdyb3VwKCk/Lm9jY3VycmVuY09mO1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpeyBcclxuICAgICAgICBjb25zdCBvcGVyYXRvciA9ICdcXFxcY2RvdCAnO1xyXG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcclxuXHJcbiAgICAgICAgdGhpcy5ncm91cHMuZm9yRWFjaCgoZ3JvdXAsaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgc3RyaW5nICs9IHdyYXBHcm91cChncm91cC50b1N0cmluZygpLCBncm91cC5zaW5ndWxhcigpP0JyYWNrZXRUeXBlLkN1cmx5QnJhY2VzOkJyYWNrZXRUeXBlLk5vbmUpO1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggPCB0aGlzLmdyb3Vwcy5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICAgICAgc3RyaW5nICs9IG9wZXJhdG9yO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZXhwb3J0IHR5cGUgTWF0aEdyb3VwSXRlbT1Ub2tlbnxNYXRoSmF4T3BlcmF0b3JcclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRoR3JvdXAge1xyXG4gICAgcHJpdmF0ZSBpdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XHJcbiAgICAvL292ZXJ2aWV3OiBNYXRoT3ZlcnZpZXdcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IoaXRlbXM/OiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XHJcbiAgICAgICAgaWYoaXRlbXMpdGhpcy5zZXRJdGVtcyhpdGVtcyk7XHJcbiAgICB9XHJcbiAgICBnZXRJdGVtcygpOiBNYXRoR3JvdXBJdGVtW10ge3JldHVybiB0aGlzLml0ZW1zO31cclxuICAgIHNldEl0ZW0oaXRlbTogTWF0aEdyb3VwSXRlbSxpbmRleDpudW1iZXIpe1xyXG4gICAgICAgIHRoaXMuaXRlbXNbaW5kZXhdPWl0ZW07XHJcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpXHJcbiAgICB9XHJcbiAgICByZXBsYWNlSXRlbUNlbGwoaXRlbTogTWF0aEdyb3VwSXRlbXxNYXRoR3JvdXAsaW5kZXg6bnVtYmVyKXtcclxuICAgICAgICB0aGlzLml0ZW1zLnNwbGljZShpbmRleCwxLC4uLmVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtKSlcclxuICAgIH1cclxuICAgIHNldEl0ZW1zKGl0ZW1zOiBmb3JtYXR0YWJsZUZvck1hdGhHcm91cHxmb3JtYXR0YWJsZUZvck1hdGhHcm91cFtdKSB7XHJcbiAgICAgICAgdGhpcy5pdGVtcyA9IGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtcyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVPdmVydmlldygpICAgIFxyXG4gICAgfVxyXG4gICAgZ3JvdXBWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlczogc3RyaW5nW10gPSBbXTtcclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW06IE1hdGhHcm91cEl0ZW0pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiAmJiBpdGVtLmlzVmFyKCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKTtcclxuICAgICAgICAgICAgICAgIGlmICghdmFyaWFibGVzLmNvbnRhaW5zKGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXJpYWJsZXMucHVzaChrZXkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHZhcmlhYmxlcztcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGVPdmVydmlldygpey8qXHJcbiAgICAgICAgdGhpcy5vdmVydmlldz1uZXcgTWF0aE92ZXJ2aWV3KClcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3c2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcykqL1xyXG4gICAgfVxyXG4gICAgc2luZ2xlVG9rZW5TZXQodmFsdWU6IG51bWJlcix0b0FkZD86IGJvb2xlYW4pe1xyXG4gICAgICAgIGNvbnN0IHRva2VuPXRoaXMuaXRlbXNbMF0gYXMgVG9rZW47XHJcbiAgICAgICAgY29uc3QgbmV3VmFsdWU9dG9BZGQ/dmFsdWUrdG9rZW4uZ2V0TnVtYmVyVmFsdWUoKTp2YWx1ZTtcclxuICAgICAgICBpZih0aGlzLnNpbmd1bFRva2VuKCkpe1xyXG4gICAgICAgICAgICB0b2tlbi5zZXRWYWx1ZShuZXdWYWx1ZSlcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBNYXRoR3JvdXAge1xyXG4gICAgICAgIHJldHVybiBuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXMubWFwKGl0ZW09Pml0ZW0uY2xvbmUoKSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGhhc09wZXJhdG9yKCk6IHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpO31cclxuICAgIGRvZXNudEhhdmVPcGVyYXRvcigpOiAgdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuICF0aGlzLmhhc09wZXJhdG9yKCk7fVxyXG4gICAgZGVlcEhhc09wZXJhdG9yKCl7XHJcbiAgICAgICAgY29uc3QgbWFwPXRoaXMuaXRlbXMubWFwKChpdGVtKTogYm9vbGVhbiA9PiB7XHJcbiAgICAgICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uZGVlcEhhc09wZXJhdG9yKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKXJldHVybiB0cnVlXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBtYXAuc29tZSgodDogYm9vbGVhbik9PnQpXHJcbiAgICB9XHJcbiAgICBzaW5nbGVOdW1iZXIoKXtyZXR1cm4gdGhpcy5zaW5ndWxhcigpJiZ0aGlzLm51bWJlck9ubHkoKX1cclxuICAgIG51bWJlck9ubHkoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuZXZlcnkodCA9PiAodCBpbnN0YW5jZW9mIFRva2VuJiYhdC5pc1ZhcigpKSk7fVxyXG4gICAgaGFzVmFyaWFibGVzKCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiB0IGluc3RhbmNlb2YgVG9rZW4mJnQuaXNWYXIoKSk7fVxyXG5cclxuICAgIHNpbmd1bGFyKCk6Ym9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoID09PSAxICYmIHRoaXMuaXRlbXNbMF0gIT09IHVuZGVmaW5lZDt9XHJcbiAgICBzaW5ndWxUb2tlbigpOiB0aGlzIGlzIHsgaXRlbXM6IFtUb2tlbl0gfSB7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSAmJiB0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW47fVxyXG4gICAgaXNSb290TGV2ZWwoKXtyZXR1cm4gdGhpcy5pdGVtcy5ldmVyeSgoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIFRva2VuKTt9XHJcbiAgICBnZXREZWVwdGgoKXtcclxuICAgICAgICBsZXQgZGVlcHRoczogbnVtYmVyW109W107XHJcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgVG9rZW4pe1xyXG4gICAgICAgICAgICAgICAgZGVlcHRocy5wdXNoKDApO3JldHVybjtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgZGVlcHRocy5wdXNoKGl0ZW0uZ2V0RGVlcHRoKCkubWF4KzEpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHttYXg6IE1hdGgubWF4KC4uLmRlZXB0aHMpLCBkZWVwdGhzOiBkZWVwdGhzfVxyXG4gICAgfVxyXG4gICAgaXNPcGVyYWJsZSgpe3JldHVybiB0cnVlfVxyXG5cclxuICAgIGdldE9wZXJhYmxlVmFsdWUoKTogbnVtYmVyIHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5pdGVtcztcclxuICAgICAgICBpZiAodGhpcy5udW1iZXJPbmx5KCkpIHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlPTA7XHJcbiAgICAgICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW06IFRva2VuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBpdGVtLmdldE51bWJlclZhbHVlKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgZXF1YWxzKGl0ZW06IFRva2VufE1hdGhKYXhPcGVyYXRvcnxNYXRoR3JvdXApe1xyXG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbil7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aD09PTEmJnRoaXMuaXRlbXNbMF0gaW5zdGFuY2VvZiBUb2tlbiYmdGhpcy5pdGVtc1swXS5nZXRTdHJpbmdWYWx1ZSgpPT09aXRlbS5nZXRTdHJpbmdWYWx1ZSgpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3Ipe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg9PT0xJiZ0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yJiZ0aGlzLml0ZW1zWzBdLm9wZXJhdG9yPT09aXRlbS5vcGVyYXRvclxyXG4gICAgICAgIH1cclxuICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoPT09aXRlbS5pdGVtcy5sZW5ndGgmJnRoaXMuaXRlbXMuZXZlcnkoKHQ6IE1hdGhHcm91cEl0ZW0pPT57XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5pdGVtcy5zb21lKChpKT0+dC5lcXVhbHMoaSkpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJZCgpe1xyXG4gICAgICAgIHJldHVybiAnTWF0aEdyb3VwJ1xyXG4gICAgfVxyXG4gICAgY29tYmluaW5nTGlrZVRlcm1zKCkge1xyXG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3PW5ldyBNYXRoT3ZlcnZpZXcoKVxyXG4gICAgICAgIG92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcylcclxuICAgICAgICB0aGlzLnNldEl0ZW1zKG92ZXJ2aWV3LnJlY29uc3RydWN0QXNNYXRoR3JvdXBJdGVtcygpKVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSwgaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb2NjdXJyZW5jZUdyb3VwID0gaXRlbS5nZXRPY2N1cnJlbmNlR3JvdXAoKTtcclxuICAgICAgICAgICAgICAgIGlmIChvY2N1cnJlbmNlR3JvdXApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLml0ZW1zID0gdGhpcy5pdGVtcy5maWx0ZXIoKG90aGVySXRlbTogTWF0aEdyb3VwSXRlbSwgb3RoZXJJbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNraXAgdGhlIGN1cnJlbnQgaXRlbSBpdHNlbGZcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID09PSBvdGhlckluZGV4KSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNNYXRjaCA9IGl0ZW0uaXNPY2N1cnJlbmNlR3JvdXBNYXRjaChvdGhlckl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWlzTWF0Y2g7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnO1xyXG4gICAgICAgIGlmKCFBcnJheS5pc0FycmF5KHRoaXMuaXRlbXMpKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgYnV0IHJlY2VpdmVkOiBcIit0aGlzLml0ZW1zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBzdHJpbmcrPXNob3VsZEFkZFBsdXModGhpcy5pdGVtc1tpbmRleC0xXSxpdGVtKVxyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCAmJiAhaXRlbS5zaW5ndWxhcigpKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gYCgke2l0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKX0pYDtcclxuICAgICAgICAgICAgfSAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gaXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpO1xyXG4gICAgICAgICAgICB9IGlmIChjdXN0b21Gb3JtYXR0ZXIpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyA9IGN1c3RvbUZvcm1hdHRlcihpdGVtLHN0cmluZyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gc3RyaW5nO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgTWF0aE92ZXJ2aWV3IHtcclxuICAgIHByaXZhdGUgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBhbnk+O1xyXG4gICAgcHJpdmF0ZSBvcGVyYXRvcnM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBwcml2YXRlIG51bWJlcjogbnVtYmVyO1xyXG4gICAgZ2V0TnVtYmVyKCk6IG51bWJlcntyZXR1cm4gdGhpcy5udW1iZXI7fVxyXG4gICAgZ2V0VmFyaWFibGVzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMudmFyaWFibGVzO31cclxuICAgIGdldE9wZXJhdG9ycygpOiBNYXA8c3RyaW5nLCBhbnk+e3JldHVybiB0aGlzLm9wZXJhdG9yczt9XHJcbiAgICBjb25zdHJ1Y3Rvcih2YXJpYWJsZXM/OiBNYXA8c3RyaW5nLCBhbnk+LG9wZXJhdG9ycz86IE1hcDxzdHJpbmcsIGFueT4sbnVtYmVyPzogbnVtYmVyKXtcclxuICAgICAgICBpZih2YXJpYWJsZXMpdGhpcy52YXJpYWJsZXM9dmFyaWFibGVzO1xyXG4gICAgICAgIGlmKG9wZXJhdG9ycyl0aGlzLm9wZXJhdG9ycz1vcGVyYXRvcnM7XHJcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcclxuICAgIH1cclxuICAgIGRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHMoaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSkge1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzPW5ldyBNYXAoKTtcclxuICAgICAgICB0aGlzLm9wZXJhdG9ycz1uZXcgTWFwKCk7XHJcbiAgICAgICAgaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVmFyaWFibGVzTWFwKGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmIWl0ZW0uaXNWYXIoKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU11bWJlcihpdGVtLmdldE51bWJlclZhbHVlKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlT3BlcmF0b3JzTWFwKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIGNhdGVnb3J5IGluIE1hdGhPdmVydmlldyBzZXBhcmF0ZUludG9JbmRpdmlkdWFsc1wiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH1cclxuICAgIHVwZGF0ZU11bWJlcihudW1iZXI6IG51bWJlcil7IHRoaXMubnVtYmVyPXRoaXMubnVtYmVyP3RoaXMubnVtYmVyK251bWJlcjpudW1iZXI7fVxyXG4gICAgdXBkYXRlVmFyaWFibGVzTWFwKGtleTogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnZhcmlhYmxlcyA/Pz0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgaXRlbXM6IGFueVtdIH0+KCk7XHJcbiAgICAgICAgaWYoIXRoaXMudmFyaWFibGVzLmhhcyhrZXkpKXt0aGlzLnZhcmlhYmxlcy5zZXQoa2V5LHtjb3VudDogMH0pfVxyXG4gICAgICAgIHRoaXMudmFyaWFibGVzLmdldChrZXkpLmNvdW50Kys7XHJcbiAgICB9XHJcbiAgICB1cGRhdGVPcGVyYXRvcnNNYXAob3BlcmF0b3I6IE1hdGhKYXhPcGVyYXRvcil7XHJcbiAgICAgICAgY29uc3Qga2V5PW9wZXJhdG9yLm9wZXJhdG9yO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycy5oYXMoa2V5KSl7dGhpcy5vcGVyYXRvcnMuc2V0KGtleSx7Y291bnQ6IDAsIGl0ZW1zOiBbXX0pfVxyXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5vcGVyYXRvcnMuZ2V0KGtleSkhO1xyXG4gICAgICAgIGVudHJ5LmNvdW50ICs9IDE7XHJcbiAgICAgICAgZW50cnkuaXRlbXMucHVzaChvcGVyYXRvcik7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzVmFyKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzJiZ0aGlzLnZhcmlhYmxlcy5zaXplPjB9XHJcbiAgICBoYXNPcCgpe3JldHVybiB0aGlzLm9wZXJhdG9ycyYmdGhpcy5vcGVyYXRvcnMuc2l6ZT4wfVxyXG4gICAgb25seU51bWVyaWMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5udW1iZXImJiF0aGlzLmhhc1ZhcigpJiYhdGhpcy5oYXNPcCgpXHJcbiAgICB9XHJcbiAgICByZWNvbnN0cnVjdEFzTWF0aEdyb3VwSXRlbXMoKXtcclxuICAgICAgICBjb25zdCBpdGVtczogTWF0aEdyb3VwSXRlbVtdPVtdO1xyXG4gICAgICAgIGlmKHRoaXMubnVtYmVyKWl0ZW1zLnB1c2gobmV3IFRva2VuKHRoaXMubnVtYmVyKSk7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xyXG4gICAgICAgICAgICBpZih2YWx1ZS5jb3VudD09PTEpe1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChuZXcgVG9rZW4oa2V5KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmKHZhbHVlLmNvdW50PjEpe1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChNdWx0aXBsaWNhdGlvbk9wZXJhdG9yLmFzT2NjdXJyZW5jZUdyb3VwKHZhbHVlLmNvdW50LGtleSkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBpZih0aGlzLm9wZXJhdG9ycyl7XHJcbiAgICAgICAgICAgIGl0ZW1zLnB1c2goLi4uQXJyYXkuZnJvbSh0aGlzLm9wZXJhdG9ycy52YWx1ZXMoKSkuZmxhdE1hcCgob3BlcmF0b3I6IGFueSkgPT4gb3BlcmF0b3IuaXRlbXMpKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaXRlbXM7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRva2Vue1xyXG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOm51bWJlcnxzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBnZXROdW1iZXJWYWx1ZSgpOm51bWJlcntyZXR1cm4gKHRoaXMudmFsdWUgYXMgbnVtYmVyKX1cclxuICAgIGdldFN0cmluZ1ZhbHVlKCk6c3RyaW5ne3JldHVybiAodGhpcy52YWx1ZSBhcyBzdHJpbmcpfVxyXG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cclxuICAgIHNldFZhbHVlKHZhbHVlOiBudW1iZXJ8c3RyaW5nKXt0aGlzLnZhbHVlPXZhbHVlO31cclxuICAgIGlzVmFyKCkge3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZyc7fVxyXG4gICAgZXF1YWxzKGl0ZW06IE1hdGhHcm91cEl0ZW0pIHtcclxuICAgICAgICByZXR1cm4gaXRlbSBpbnN0YW5jZW9mIFRva2VuJiZ0aGlzLnZhbHVlID09PSBpdGVtLnZhbHVlO1xyXG4gICAgfVxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmKCF0aGlzLmlzVmFyKCkmJnRoaXMuZ2V0TnVtYmVyVmFsdWUoKTwwKVxyXG4gICAgICAgICAgICBzdHJpbmcrPSctJztcclxuICAgICAgICBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgaWYoY3VzdG9tRm9ybWF0dGVyKXtcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZztcclxuICAgIH1cclxuICAgIGNsb25lKCl7cmV0dXJuIG5ldyBUb2tlbih0aGlzLnZhbHVlKX1cclxufVxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW5ze1xyXG4gICAgdG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj49W107XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKHRva2Vucz86IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPil7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zfHxbXTtcclxuICAgIH1cclxuICAgIGFkZElucHV0KG1hdGg6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy50b2tlbml6ZShtYXRoKTtcclxuICAgIH1cclxuICAgIHRva2VuaXplKG1hdGg6IHN0cmluZyl7XHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMoKSlcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlPS9bXFwoXFwpXS8udGVzdChtYXRjaFswXSk/J3BhcmVuJzonb3BlcmF0b3InXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4odHlwZSxtYXRjaFswXSkpO1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTE7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKVxyXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljTWF0aEpheFRva2VuKCdudW1iZXInLHBhcnNlRmxvYXQobWF0Y2hbMF0pKSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLylcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbihcInZhcmlhYmxlXCIsbWF0Y2hbMF0pKVxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgdGhpcy5wb3N0UHJvY2Vzc1Rva2VucygpO1xyXG4gICAgfVxyXG5cclxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XHJcbiAgICAgICAgLypydWxlcyB0byBhYmlkIGJ5OlxyXG4gICAgICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcclxuICAgICAgICAqL1xyXG4gICAgICAgIHRoaXMudG9rZW5zPWlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcGFyZW5NYXA9dGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuXHJcbiAgICAgICAgcGFyZW5NYXAuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGIgLSBhKVxyXG4gICAgICAgIC5mb3JFYWNoKCh2YWx1ZTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3ICBCYXNpY01hdGhKYXhUb2tlbignb3BlcmF0b3InLCcqJykpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKClcclxuICAgIH1cclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKSB7XHJcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpfHwhKHRoaXMudG9rZW5zW2luZGV4XSBpbnN0YW5jZW9mIFBhcmVuKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBpZHggPSBmaW5kUGFyZW5JbmRleChpbmRleCx0aGlzLnRva2Vucyk/Lm9wZW47XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKGlkeCA9PSBudWxsIHx8ICFpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCArIDFdKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRoaXMudG9rZW5zW2lkeCAtIDFdO1xyXG4gICAgXHJcbiAgICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICAgICBpZHggPiAwICYmXHJcbiAgICAgICAgICAgICAgICBwcmV2VG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJlxyXG4gICAgICAgICAgICAgICAgIWdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eShbMSwgMl0pLmluY2x1ZGVzKHByZXZUb2tlbi52YWx1ZT8udG9TdHJpbmcoKSB8fCAnJylcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9O1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleF07XHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHRva2VuLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgY29uc3QgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uPSh0b2tlbjogYW55KT0+e1xyXG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiYmdHlwZW9mIHRva2VuLnZhbHVlPT09J3N0cmluZycmJmhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4udmFsdWUpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGlzVmFyPSh0b2tlbjogYW55KT0+e3JldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmdG9rZW4udHlwZT09PSd2YXJpYWJsZSd9XHJcbiAgICAgICAgY29uc3QgcHJlY2VkZXNWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBpbmRleD4wJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZm9sbG93c1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIGluZGV4PHRva2Vucy5sZW5ndGgtMSYmaXNWYXIodG9rZW5zW2luZGV4XSlcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlzT3BlblBhcmVuKHRva2VuKXx8IGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbil8fHByZWNlZGVzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzQ2xvc2VkUGFyZW4odG9rZW4pfHxmb2xsb3dzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHwgdGVzdERvdWJsZVJpZ2h0KGluZGV4KSA/IGluZGV4ICsgMSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbSkgPT4gaXRlbSAhPT0gbnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XHJcbiAgICAgICAgLy8gUGx1c2VzIGFyZSBzZXBhcmF0b3JzLlRoZXJlZm9yZSwgdGhleSBkbyBub3QgbmVlZCB0byBiZSBoZXJlIEFzIHRoZSBleHByZXNzaW9uIGlzIHRva2VuW11cclxuICAgICAgICAvL01pbnVzZXMgb24gdGhlIG90aGVyIGhhbmQuY2FuIGVpdGhlciBiZSBhIHNlcGFyYXRvci4gT3IgYSBuZWdhdGl2ZSBzaWduXHJcbiAgICAgICAgY29uc3QgcGx1c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdBZGRpdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcclxuICAgICAgICBwbHVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1pbnVzTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VuLCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gJ1N1YnRyYWN0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxyXG4gICAgICAgIFxyXG4gICAgICAgIG1pbnVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRUb2tlbiA9IHRoaXMudG9rZW5zW2luZGV4ICsgMV07XHJcbiAgICAgICAgICAgIGlmIChuZXh0VG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJiB0eXBlb2YgbmV4dFRva2VuLnZhbHVlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgIG5leHRUb2tlbi52YWx1ZSAqPSAtMTtcclxuICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcixtYXJnaW4/OiBudW1iZXIpe1xyXG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XHJcbiAgICAgICAgcmV0dXJuIGluZGV4Pj0wK21hcmdpbiYmaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLW1hcmdpbjtcclxuICAgIH1cclxuICAgIGNsb25lKCk6IEJhc2ljTWF0aEpheFRva2VucyB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBCYXNpY01hdGhKYXhUb2tlbnModGhpcy50b2tlbnMubWFwKHRva2VuID0+IHRva2VuLmNsb25lKCkpKTtcclxuICAgIH1cclxuICAgIC8qXHJcbiAgICBcclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKXtcclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgaWR4PWZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XHJcbiAgICAgICAgICAgIHJldHVybiBpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCsxXSkmJihpZHg9PT0wfHwhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMudG9rZW5zW2lkeC0xXT8udmFsdWUpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pfHwhdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBudW1iZXIpID0+IHsgXHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8IChoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLnZhbHVlKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHx0ZXN0RG91YmxlUmlnaHQoaW5kZXgpPyBpbmRleCsxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICByZXR1cm4gbWFwO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09IFwiKFwiID8gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICB9XHJcblxyXG4gICAgZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tYXBQYXJlbkluZGV4ZXMoKVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcclxuICAgICAgICAgICAgICAgIGlmIChvcGVuSW5kZXggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdPy50eXBlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKGNsb3NlSW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXT8uaXNWYWx1ZVRva2VuKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9KS5mbGF0TWFwKChpdGVtOiBhbnkpID0+IFtpdGVtLm9wZW4sIGl0ZW0uY2xvc2VdKTtcclxuICAgIH0gICAgXHJcbiAgICBcclxuICAgIFxyXG4gICAgZmluZFNpbWlsYXJTdWNjZXNzb3IodG9rZW5zKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcclxuICAgICAgICAgICAgICAgICYmKHRoaXMudG9rZW5Db21wYXJlKFwidHlwZVwiLHRoaXMudmFsdWVUb2tlbnMoKSwgdG9rZW4sIHRva2Vuc1tpbmRleCArIDFdKSlcclxuICAgICAgICApKTtcclxuICAgICB9XHJcbiAgICBcclxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKHRva2VuIGluc3RhbmNlb2YgVG9rZW4pKXtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKF86IGFueSwgaWR4OiB1bmtub3duKSA9PiAhbWFwLmhhcyhpZHgpKTtcclxuICAgICAgICAvL1Byb2JsZW0gd2l0aCAgPSBhcyBpdCdzIGFmZmVjdGluZyB0aGUgdmFyaWFibGUgYmVmb3JlIGl0XHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggLSAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKSAmJlxyXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBjb25zdCB2YXJNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J3ZhcmlhYmxlJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBhcnIgPSBbXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhudW1NYXApLCBcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXHJcbiAgICAgICAgXHJcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcclxuICAgIH1cclxuXHJcbiAgICBcclxuXHJcbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXHJcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcclxuICAgICAgICApXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgIH1cclxuXHJcbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQ6IGFueSwgbGVuZ3RoOiBudW1iZXIsIG9iamVjdHM6IGFueVtdIHwgVG9rZW4pIHtcclxuICAgICAgICBvYmplY3RzID0gZmxhdHRlbkFycmF5KG9iamVjdHMpO1xyXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXhwZWN0ZWQgYG9iamVjdHNgIHRvIGJlIGFuIGFycmF5LCBidXQgcmVjZWl2ZWQ6XCIsIG9iamVjdHMpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgbGVuZ3RoLCAuLi5vYmplY3RzKTtcclxuICAgIH1cclxuXHJcbiAgICBcclxuXHJcbiAgICBpbmRleGVzVG9BZGRQbHVzKHRva2VuczogYW55W10pe1xyXG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcclxuICAgICAgICAgICAgJiZ0b2tlbnNbaW5kZXggLSAxXT8uaXNWYWx1ZVRva2VuKClcclxuICAgICAgICAgICAgJiZ0b2tlbj8uaXNWYWx1ZVRva2VuKCkmJnRva2VuLnZhbHVlPj0wP2luZGV4Om51bGxcclxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcclxuICAgIH1cclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcclxuICAgICAgICBjb25zdCByZWdFeHB2YWx1ZSA9ICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcclxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgICovXHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbntcclxuICAgIHR5cGU6IHN0cmluZztcclxuICAgIHZhbHVlPzogc3RyaW5nfG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih0eXBlOnN0cmluZyAsdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZCl7XHJcbiAgICAgICAgdGhpcy50eXBlPXR5cGU7XHJcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgICAgICB0aGlzLmluc3VyUHJvcGVyRm9ybWF0dGluZygpXHJcbiAgICB9XHJcbiAgICBpbnN1clByb3BlckZvcm1hdHRpbmcoKXtcclxuICAgICAgICBpZiAoIXRoaXMuaXNWYWx1ZVRva2VuKCkmJnR5cGVvZiB0aGlzLnZhbHVlPT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgIHRoaXMudmFsdWU9c2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHModGhpcy52YWx1ZSk/Lm5hbWVcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TGF0ZXhTeW1ib2woKXtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJz9zZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMudmFsdWUpPy5sYXRleDp1bmRlZmluZWR9XHJcblxyXG4gICAgZ2V0ZnVsbFR5cGUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50eXBlXHJcbiAgICB9XHJcbiAgICBjbG9uZSgpe1xyXG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW4odGhpcy50eXBlLCB0aGlzLnZhbHVlKVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBpc1N0cmluZygpe3JldHVybiB0aGlzLnR5cGU9PT0ncGFyZW4nfHx0aGlzLnR5cGU9PT0nb3BlcmF0b3InfVxyXG5cclxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cclxuXHJcbiAgICB0b1N0cmluZ0xhdGV4KCl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmICh0aGlzLmlzU3RyaW5nKCkpXHJcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy5nZXRMYXRleFN5bWJvbCgpXHJcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdudW1iZXInKSBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZ1xyXG4gICAgfVxyXG4gICAgYWZmZWN0ZWRPcGVyYXRvclJhbmdlKGRpcmVjdGlvbjogc3RyaW5nKXtcclxuICAgICAgICBpZih0aGlzLnR5cGUhPT0nb3BlcmF0b3InfHx0aGlzLnZhbHVlPT09J0VxdWFscycpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIGlmKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycmJmRpcmVjdGlvbj09PSdsZWZ0JyYmIWlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSh0aGlzLnZhbHVlLCBbLTEsIDFdLHRydWUpKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG59Il19