import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { BracketType } from "src/utils/staticData";
import { findParenIndex, Paren, idParentheses, isOpenParen, isClosedParen } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getOperatorsByAssociativity, getValuesWithKeysBySide, hasImplicitMultiplication, isOperatorWithAssociativity, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators } from "../utils/dataManager";
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
        if (!items.length && items instanceof MathGroup) {
            items = items.getItems();
        }
        else
            items = [items];
    }
    const formattedItems = items
        .map((item) => {
        if (item instanceof Token || item instanceof MathGroup || item instanceof MathJaxOperator) {
            return item;
        }
        if (item instanceof BasicMathJaxToken) {
            if (item.value && (item.type === "number" || item.type === "variable")) {
                return new Token(item.value);
            }
            throw new Error("Expected item to be a number or variable but received: " + item.value);
        }
        return null;
    })
        .filter((item) => item !== null);
    return formattedItems;
}
function typeCheckMathGroupItems(items) {
    if (!Array.isArray(items)) {
        console.error('items', items);
        throw new Error("Expected items to be an array but received: " + items);
    }
    items.map((item) => {
        if (Array.isArray(item)) {
            typeCheckMathGroupItems(item);
            return;
        }
        if (!(item instanceof Token || item instanceof MathGroup || item instanceof MathJaxOperator)) {
            console.error('item', item);
            throw new Error("Expected items to be an array of Token, MathGroup, or MathJaxOperator but received: " + items);
        }
    });
    return true;
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
        if (isOperable)
            this.isOperable = isOperable;
    }
    testGroups(test) {
        return this.groups.map(g => test(g));
    }
    mapVariables() {
        return this.groups.map(group => group.hasVariables());
    }
    static asVariableGroup(occurrencesCount, variable) {
        return new MathJaxOperator('Multiplication', 2, [new MathGroup([new Token(occurrencesCount)]), new MathGroup([new Token(variable)])]);
    }
    isVariableGroup() {
        const testLevels = this.testGroups((item) => { return item.singular(); });
        const testVar = this.mapVariables();
        const isSingleTrueInTestVar = testVar.filter(Boolean).length === 1;
        return isSingleTrueInTestVar && testLevels.every((t) => t);
    }
    operatorVariables() {
        return [...new Set(this.groups
                .map(group => group.groupVariables())
                .flat())];
    }
    getVariableGroup() {
        if (!this.isVariableGroup)
            return null;
        const occurrencesCount = this.groups
            .map(g => g.getOperableValue())
            .filter((t) => t !== null)
            .reduce((total, item) => total + item, 0);
        const variable = this.operatorVariables()[0];
        return { occurrencesCount, variable };
    }
    addToVariableGroup(value) {
        if (!this.isVariableGroup)
            return;
        const number = this.groups.find(group => group.singleNumber());
        if (!number)
            return;
        number.singleTokenSet(value);
    }
    allGroupsAreSimilar() {
    }
    isVar() { }
    isRootLevel() {
        return this.getDeepth().max === 0;
    }
    clone() {
        const groups = this.groups.map(group => group.clone());
        const solution = this.solution ? this.solution.clone() : undefined;
        return new MathJaxOperator(this.operator, this.groupNum, groups, solution, this.isOperable);
    }
    getDeepth() {
        let deepths = [];
        this.groups.forEach(group => {
            deepths.push(group.getDeepth().max);
        });
        return { max: Math.max(...deepths), deepths: deepths };
    }
    setGroup(group, index) { this.groups[index] = group; }
    toStringSolution() {
        return this.toString() + ' = ' + this.solution.toString();
    }
    getId() { return 'operator:' + this.operator; }
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
    setItems(items) {
        typeCheckMathGroupItems(this.items);
        this.items = items;
        this.updateOverview();
    }
    combineSimilarValues() {
        const overview = new MathOverview();
        overview.defineOverviewSeparateIntoIndividuals(this.items);
        let newItems = [];
        if (overview.getNumber()) {
            newItems.push(new Token(overview.getNumber()));
        }
        for (const [key, value] of overview.getVariables().entries()) {
            if (value.count > 1) {
                newItems.push(MathJaxOperator.asVariableGroup(value.count, key));
            }
            else {
                newItems.push(new Token(key));
            }
        }
        this.items = newItems;
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
    singleTokenSet(value) {
        const token = this.items[0];
        if (this.singulToken()) {
            token.setValue(value);
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
    extremeSimplifyAndGroup() {
        this.tryRemoveUnnecessaryNested();
        this.combiningLikeTerms();
    }
    tryRemoveUnnecessaryNested() {
        if (this.singular()) {
            if (this.items[0] instanceof MathGroup) {
                this.items = this.items[0].items;
                this.items.forEach(item => {
                    if (item instanceof MathGroup) {
                        item.tryRemoveUnnecessaryNested();
                    }
                });
            }
        }
    }
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
        this.tryRemoveUnnecessaryNested();
        this.combiningLikeTerms();
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
    getId() {
        return 'MathGroup';
    }
    removeNested() {
        if (this.deepHasOperator())
            return false;
        let items = [];
        this.items.forEach((item) => {
            if (item instanceof Token) {
                items.push(item);
            }
            if (item instanceof MathGroup) {
                item.removeNested();
                items.push(...item.items);
            }
        });
        this.items = items;
        return true;
    }
    combiningLikeTerms() {
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
    mathGroups = [];
    getNumber() { return this.number; }
    getVariables() { return this.variables; }
    constructor(variables, operators, number, mathGroups) {
        if (variables)
            this.variables = variables;
        if (operators)
            this.operators = operators;
        if (number)
            this.number = number;
        if (mathGroups)
            this.mathGroups = mathGroups;
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
                case item instanceof MathGroup:
                    this.mathGroups.push(item);
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
            this.variables.set(key, { count: 0, items: [] });
        }
        this.variables.get(key).count++;
    }
    updateOperatorsMap(operator) {
        const variableGroup = operator.getVariableGroup();
        if (variableGroup) {
            Array.from({ length: variableGroup.occurrencesCount }).forEach(() => {
                this.updateVariablesMap(variableGroup.variable);
            });
            return;
        }
        const key = operator.operator;
        if (!this.operators)
            this.operators = new Map();
        if (!this.operators.has(key)) {
            this.operators.set(key, { count: 0, items: [] });
        }
        this.operators.get(key).count++;
    }
    hasVar() { return this.variables && this.variables.size > 0; }
    hasOp() { return this.operators && this.operators.size > 0; }
    hasGroup() { return this.mathGroups.length > 0; }
    onlyNumeric() {
        return this.number && !this.hasVar() && !this.hasOp() && !this.hasGroup();
    }
    deepNumeric() {
    }
    explorAllLevels() {
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
        console.log(this.tokens, map);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUEsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUFtRSxNQUFNLHNCQUFzQixDQUFDO0FBRW5JLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUl4UixNQUFNLFVBQVUsa0JBQWtCLENBQzlCLFNBQWMsRUFDZCxTQUFpQyxFQUNqQyxPQUE0QixFQUFFO0lBRTlCLDREQUE0RDtJQUM1RCxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxtRUFBbUU7SUFDbkUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDM0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN4QyxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RSxJQUFJLE1BQU07Z0JBQUUsT0FBTyxNQUFN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Q2hCLE9BQU8sSUFBSSxDQUFBO0lBQ2YsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuLi9pbVZlcnlMYXp5XCI7XHJcbmltcG9ydCB7IHR5cGUgfSBmcm9tIFwib3NcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgcmVnRXhwIH0gZnJvbSBcIi4uL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyBBc3NvY2lhdGl2aXR5LCBCcmFja2V0VHlwZSwgTWF0aEpheE9wZXJhdG9yTWV0YWRhdGEsIG1hdGhKYXhPcGVyYXRvcnNNZXRhZGF0YSwgT3BlcmF0b3JUeXBlIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XHJcblxyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgaXNPcGVuUGFyZW4sIGlzQ2xvc2VkUGFyZW4gfSBmcm9tIFwiLi4vdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIGlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSwgc2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHMsIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcclxuaW1wb3J0IHsgZ3JvdXAgfSBmcm9tIFwiY29uc29sZVwiO1xyXG5cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkZWVwU2VhcmNoV2l0aFBhdGgoXHJcbiAgICBzdHJ1Y3R1cmU6IGFueSxcclxuICAgIHByZWRpY2F0ZTogKGl0ZW06IGFueSkgPT4gYm9vbGVhbixcclxuICAgIHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gPSBbXVxyXG4pOiB7IGl0ZW06IGFueTsgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXSB9IHwgbnVsbCB7XHJcbiAgICAvLyBCYXNlIGNhc2U6IElmIHRoZSBjdXJyZW50IHN0cnVjdHVyZSBtYXRjaGVzIHRoZSBwcmVkaWNhdGVcclxuICAgIGlmIChwcmVkaWNhdGUoc3RydWN0dXJlKSkge1xyXG4gICAgICAgIHJldHVybiB7IGl0ZW06IHN0cnVjdHVyZSwgcGF0aCB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0J3MgYW4gYXJyYXksIHJlY3Vyc2l2ZWx5IHNlYXJjaCBlYWNoIGVsZW1lbnQgd2l0aCBpdHMgaW5kZXhcclxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0cnVjdHVyZSkpIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cnVjdHVyZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2ldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBpXSk7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0J3MgYW4gb2JqZWN0LCByZWN1cnNpdmVseSBzZWFyY2ggaXRzIHByb3BlcnRpZXMgd2l0aCB0aGVpciBrZXlzXHJcbiAgICBpZiAoc3RydWN0dXJlICE9PSBudWxsICYmIHR5cGVvZiBzdHJ1Y3R1cmUgPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzdHJ1Y3R1cmUpIHtcclxuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdHJ1Y3R1cmUsIGtleSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVba2V5XSwgcHJlZGljYXRlLCBbLi4ucGF0aCwga2V5XSk7XHJcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIG5vIG1hdGNoIGlzIGZvdW5kXHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zKGl0ZW1zOiBhbnkpOiBNYXRoR3JvdXBJdGVtW10ge1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xyXG4gICAgICAgIGlmICghaXRlbXMubGVuZ3RoJiZpdGVtcyBpbnN0YW5jZW9mIE1hdGhHcm91cCkge1xyXG4gICAgICAgICAgICBpdGVtcz1pdGVtcy5nZXRJdGVtcygpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIGl0ZW1zPVtpdGVtc11cclxuICAgIH1cclxuICAgIGNvbnN0IGZvcm1hdHRlZEl0ZW1zPWl0ZW1zXHJcbiAgICAgICAgLm1hcCgoaXRlbTogVG9rZW58TWF0aEdyb3VwfE1hdGhKYXhPcGVyYXRvcnxCYXNpY01hdGhKYXhUb2tlbikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXAgfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbikge1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0udmFsdWUmJihpdGVtLnR5cGU9PT0gXCJudW1iZXJcInx8aXRlbS50eXBlPT09XCJ2YXJpYWJsZVwiKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgVG9rZW4oaXRlbS52YWx1ZSk7IFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbSB0byBiZSBhIG51bWJlciBvciB2YXJpYWJsZSBidXQgcmVjZWl2ZWQ6IFwiK2l0ZW0udmFsdWUpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGx8IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yKTogaXRlbSBpcyBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgIHJldHVybiBmb3JtYXR0ZWRJdGVtcztcclxufVxyXG5cclxuZnVuY3Rpb24gdHlwZUNoZWNrTWF0aEdyb3VwSXRlbXMoaXRlbXM6IGFueSk6IGl0ZW1zIGlzIE1hdGhHcm91cEl0ZW1bXSB7XHJcbiAgICBpZighQXJyYXkuaXNBcnJheShpdGVtcykpe1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ2l0ZW1zJyxpdGVtcylcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBidXQgcmVjZWl2ZWQ6IFwiK2l0ZW1zKTtcclxuICAgIH1cclxuICAgIGl0ZW1zLm1hcCgoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgaWYoQXJyYXkuaXNBcnJheShpdGVtKSl7XHJcbiAgICAgICAgICAgIHR5cGVDaGVja01hdGhHcm91cEl0ZW1zKGl0ZW0pO3JldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYoIShpdGVtIGluc3RhbmNlb2YgVG9rZW58fGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXB8fGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpKXtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignaXRlbScsaXRlbSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgb2YgVG9rZW4sIE1hdGhHcm91cCwgb3IgTWF0aEpheE9wZXJhdG9yIGJ1dCByZWNlaXZlZDogXCIraXRlbXMpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbn1cclxuZnVuY3Rpb24gc2hvdWxkQWRkUGx1cyhncm91cDE/OiBhbnksZ3JvdXAyPzogYW55KXtcclxuICAgIGlmKCFncm91cDF8fCFncm91cDIpcmV0dXJuICcnO1xyXG5cclxuICAgIHJldHVybiAnKyc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbkNvbWJpbmUobWF0aDogTWF0aEdyb3VwLG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xyXG5cclxufVxyXG5leHBvcnQgY2xhc3MgTWF0aEpheE9wZXJhdG9ye1xyXG4gICAgb3BlcmF0b3I6IHN0cmluZztcclxuICAgIGdyb3VwTnVtOiBudW1iZXI9MTtcclxuICAgIGdyb3VwczogTWF0aEdyb3VwW107XHJcbiAgICBzb2x1dGlvbjogTWF0aEdyb3VwO1xyXG4gICAgY29tbXV0YXRpdmU6IGJvb2xlYW47XHJcbiAgICBpc09wZXJhYmxlOiBib29sZWFuPXRydWU7XHJcbiAgICBjb25zdHJ1Y3RvcihvcGVyYXRvcj86IHN0cmluZyxncm91cE51bT86IG51bWJlcixncm91cHM/OiBNYXRoR3JvdXBbXSxzb2x1dGlvbj86IE1hdGhHcm91cCxpc09wZXJhYmxlPzogYm9vbGVhbil7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yKXRoaXMub3BlcmF0b3I9b3BlcmF0b3I7XHJcbiAgICAgICAgaWYoZ3JvdXBOdW0pdGhpcy5ncm91cE51bT1ncm91cE51bTtcclxuICAgICAgICBpZihncm91cHMpdGhpcy5ncm91cHM9Z3JvdXBzO1xyXG4gICAgICAgIGlmKHNvbHV0aW9uKXRoaXMuc29sdXRpb249c29sdXRpb247XHJcbiAgICAgICAgaWYoaXNPcGVyYWJsZSl0aGlzLmlzT3BlcmFibGU9aXNPcGVyYWJsZTtcclxuICAgIH1cclxuICAgIHRlc3RHcm91cHModGVzdDogKGdyb3VwOiBNYXRoR3JvdXApID0+IGJvb2xlYW4pOmJvb2xlYW5bXXtcclxuICAgICAgICByZXR1cm4gdGhpcy5ncm91cHMubWFwKGc9PiB0ZXN0KGcpKTtcclxuICAgIH1cclxuICAgIG1hcFZhcmlhYmxlcygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaGFzVmFyaWFibGVzKCkpXHJcbiAgICB9XHJcbiAgICBzdGF0aWMgYXNWYXJpYWJsZUdyb3VwKG9jY3VycmVuY2VzQ291bnQ6IG51bWJlcix2YXJpYWJsZTogc3RyaW5nKXtcclxuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcignTXVsdGlwbGljYXRpb24nLDIsW25ldyBNYXRoR3JvdXAoW25ldyBUb2tlbihvY2N1cnJlbmNlc0NvdW50KV0pLG5ldyBNYXRoR3JvdXAoW25ldyBUb2tlbih2YXJpYWJsZSldKV0pXHJcbiAgICB9XHJcbiAgICBpc1ZhcmlhYmxlR3JvdXAoKTogYm9vbGVhbntcclxuICAgICAgICBjb25zdCB0ZXN0TGV2ZWxzPXRoaXMudGVzdEdyb3VwcygoaXRlbTogTWF0aEdyb3VwKTogYm9vbGVhbiA9PiB7cmV0dXJuIGl0ZW0uc2luZ3VsYXIoKX0pXHJcbiAgICAgICAgY29uc3QgdGVzdFZhcj10aGlzLm1hcFZhcmlhYmxlcygpXHJcbiAgICAgICAgY29uc3QgaXNTaW5nbGVUcnVlSW5UZXN0VmFyID0gdGVzdFZhci5maWx0ZXIoQm9vbGVhbikubGVuZ3RoID09PSAxO1xyXG4gICAgICAgIHJldHVybiBpc1NpbmdsZVRydWVJblRlc3RWYXIgJiYgdGVzdExldmVscy5ldmVyeSgodDogYm9vbGVhbikgPT4gdCk7XHJcbiAgICB9XHJcblxyXG4gICAgb3BlcmF0b3JWYXJpYWJsZXMoKTogc3RyaW5nW10ge1xyXG4gICAgICAgIHJldHVybiBbLi4ubmV3IFNldCh0aGlzLmdyb3Vwc1xyXG4gICAgICAgICAgICAubWFwKGdyb3VwID0+IGdyb3VwLmdyb3VwVmFyaWFibGVzKCkpXHJcbiAgICAgICAgICAgIC5mbGF0KClcclxuICAgICAgICApXTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZ2V0VmFyaWFibGVHcm91cCgpe1xyXG4gICAgICAgIGlmKCF0aGlzLmlzVmFyaWFibGVHcm91cCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIGNvbnN0IG9jY3VycmVuY2VzQ291bnQ9dGhpcy5ncm91cHNcclxuICAgICAgICAubWFwKGc9PiBnLmdldE9wZXJhYmxlVmFsdWUoKSlcclxuICAgICAgICAuZmlsdGVyKCh0OiBhbnkpID0+IHQhPT1udWxsKVxyXG4gICAgICAgIC5yZWR1Y2UoKHRvdGFsOiBhbnksIGl0ZW06IGFueSkgPT4gdG90YWwgKyBpdGVtLCAwKTtcclxuXHJcbiAgICAgICAgY29uc3QgdmFyaWFibGU9dGhpcy5vcGVyYXRvclZhcmlhYmxlcygpWzBdO1xyXG4gICAgICAgIHJldHVybiB7b2NjdXJyZW5jZXNDb3VudCx2YXJpYWJsZX1cclxuICAgIH1cclxuICAgIGFkZFRvVmFyaWFibGVHcm91cCh2YWx1ZTogbnVtYmVyKXtcclxuICAgICAgICBpZighdGhpcy5pc1ZhcmlhYmxlR3JvdXApIHJldHVybjtcclxuICAgICAgICBjb25zdCBudW1iZXIgPSB0aGlzLmdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLnNpbmdsZU51bWJlcigpKVxyXG4gICAgICAgIGlmKCFudW1iZXIpIHJldHVybjtcclxuICAgICAgICBudW1iZXIuc2luZ2xlVG9rZW5TZXQodmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGFsbEdyb3Vwc0FyZVNpbWlsYXIoKXtcclxuXHJcbiAgICB9XHJcbiAgICBpc1Zhcigpe31cclxuICAgIGlzUm9vdExldmVsKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVlcHRoKCkubWF4PT09MDtcclxuICAgIH1cclxuICAgIGNsb25lKCkge1xyXG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5jbG9uZSgpKTtcclxuICAgICAgICBjb25zdCBzb2x1dGlvbiA9IHRoaXMuc29sdXRpb24gPyB0aGlzLnNvbHV0aW9uLmNsb25lKCkgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoSmF4T3BlcmF0b3IodGhpcy5vcGVyYXRvciwgdGhpcy5ncm91cE51bSwgZ3JvdXBzLCBzb2x1dGlvbiwgdGhpcy5pc09wZXJhYmxlKTtcclxuICAgIH1cclxuICAgIGdldERlZXB0aCgpe1xyXG4gICAgICAgIGxldCBkZWVwdGhzOiBudW1iZXJbXT1bXTtcclxuICAgICAgICB0aGlzLmdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcclxuICAgICAgICAgICAgZGVlcHRocy5wdXNoKGdyb3VwLmdldERlZXB0aCgpLm1heClcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4ge21heDogTWF0aC5tYXgoLi4uZGVlcHRocyksIGRlZXB0aHM6IGRlZXB0aHN9XHJcbiAgICB9XHJcbiAgICBzZXRHcm91cChncm91cDogTWF0aEdyb3VwLGluZGV4Om51bWJlcil7dGhpcy5ncm91cHNbaW5kZXhdPWdyb3VwfVxyXG4gICAgdG9TdHJpbmdTb2x1dGlvbigpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nKCkrJyA9ICcrdGhpcy5zb2x1dGlvbi50b1N0cmluZygpO1xyXG4gICAgfVxyXG4gICAgZ2V0SWQoKXtyZXR1cm4gJ29wZXJhdG9yOicrdGhpcy5vcGVyYXRvcn1cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGZ1bmN0aW9uIHdyYXBHcm91cChncm91cDogTWF0aEdyb3VwLCB3cmFwOiBCcmFja2V0VHlwZSxvcHRpb25hbDogYm9vbGVhbik6IHN0cmluZyB7XHJcbiAgICAgICAgICAgIGlmKG9wdGlvbmFsJiZncm91cC5zaW5ndWxhcigpKXJldHVybiBncm91cC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpO1xyXG4gICAgICAgICAgICBjb25zdCBncm91cFN0cj1ncm91cC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpXHJcbiAgICAgICAgICAgIHN3aXRjaCAod3JhcCkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5QYXJlbnRoZXNlczpcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCgke2dyb3VwU3RyfSlgO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5DdXJseUJyYWNlczpcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYHske2dyb3VwU3RyfX1gO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ3JvdXBTdHI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLm9wZXJhdG9yKTtcclxuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gJyc7XHJcbiAgICAgICAgaWYobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM+Mnx8bWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnM8MSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBudW1iZXIgb2YgcG9zaXRpb25zIGZvciBhc3NvY2lhdGl2aXR5OiAke21ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBtZXRhZGF0YS5sYXRleDtcclxuICAgICAgICBsZXQgaW5kZXg9MDtcclxuICAgICAgICBsZXQgc3RyaW5nID0gJyc7XHJcblxyXG4gICAgICAgIGdldFZhbHVlc1dpdGhLZXlzQnlTaWRlKG1ldGFkYXRhLmFzc29jaWF0aXZpdHkucG9zaXRpb25zLHRydWUpLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleC0xXSx0aGlzLmdyb3Vwc1tpbmRleF0pK3dyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0sIGl0ZW0uYnJhY2tldFR5cGUsIGl0ZW0uaXNCcmFja2V0T3B0aW9uYWwpO1xyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBzdHJpbmcgKz0gb3BlcmF0b3I7XHJcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsZmFsc2UpLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gc2hvdWxkQWRkUGx1cyh0aGlzLmdyb3Vwc1tpbmRleF0sdGhpcy5ncm91cHNbaW5kZXgrMV0pK3dyYXBHcm91cCh0aGlzLmdyb3Vwc1tpbmRleF0sIGl0ZW0uYnJhY2tldFR5cGUsIGl0ZW0uaXNCcmFja2V0T3B0aW9uYWwpO1xyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICByZXR1cm4gc3RyaW5nLnRyaW0oKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IHR5cGUgTWF0aEdyb3VwSXRlbT1Ub2tlbnxNYXRoR3JvdXB8TWF0aEpheE9wZXJhdG9yXHJcbmV4cG9ydCBjbGFzcyBNYXRoR3JvdXAge1xyXG4gICAgcHJpdmF0ZSBpdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XHJcbiAgICAvL292ZXJ2aWV3OiBNYXRoT3ZlcnZpZXdcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IoaXRlbXM/OiBNYXRoR3JvdXBJdGVtW10pIHtcclxuICAgICAgICBpZihpdGVtcyl0aGlzLnNldEl0ZW1zKGl0ZW1zKTtcclxuICAgIH1cclxuICAgIGdldEl0ZW1zKCk6IE1hdGhHcm91cEl0ZW1bXSB7cmV0dXJuIHRoaXMuaXRlbXM7fVxyXG4gICAgc2V0SXRlbShpdGVtOiBNYXRoR3JvdXBJdGVtLGluZGV4Om51bWJlcil7XHJcbiAgICAgICAgdGhpcy5pdGVtc1tpbmRleF09aXRlbTtcclxuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KClcclxuICAgIH1cclxuICAgIHNldEl0ZW1zKGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10pIHtcclxuICAgICAgICB0eXBlQ2hlY2tNYXRoR3JvdXBJdGVtcyh0aGlzLml0ZW1zKVxyXG4gICAgICAgIHRoaXMuaXRlbXMgPSBpdGVtcztcclxuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJ2aWV3KCkgICAgXHJcbiAgICB9XHJcbiAgICBjb21iaW5lU2ltaWxhclZhbHVlcygpe1xyXG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3PW5ldyBNYXRoT3ZlcnZpZXcoKVxyXG4gICAgICAgIG92ZXJ2aWV3LmRlZmluZU92ZXJ2aWV3U2VwYXJhdGVJbnRvSW5kaXZpZHVhbHModGhpcy5pdGVtcylcclxuICAgICAgICBsZXQgbmV3SXRlbXM6IE1hdGhHcm91cEl0ZW1bXSA9IFtdO1xyXG4gICAgICAgIGlmIChvdmVydmlldy5nZXROdW1iZXIoKSkge1xyXG4gICAgICAgICAgICBuZXdJdGVtcy5wdXNoKG5ldyBUb2tlbihvdmVydmlldy5nZXROdW1iZXIoKSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBvdmVydmlldy5nZXRWYXJpYWJsZXMoKS5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgaWYgKHZhbHVlLmNvdW50ID4gMSkge1xyXG4gICAgICAgICAgICAgICAgbmV3SXRlbXMucHVzaChNYXRoSmF4T3BlcmF0b3IuYXNWYXJpYWJsZUdyb3VwKHZhbHVlLmNvdW50LCBrZXkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIG5ld0l0ZW1zLnB1c2gobmV3IFRva2VuKGtleSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaXRlbXMgPSBuZXdJdGVtcztcclxuXHJcbiAgICB9XHJcbiAgICBncm91cFZhcmlhYmxlcygpOiBzdHJpbmdbXSB7XHJcbiAgICAgICAgY29uc3QgdmFyaWFibGVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuICYmIGl0ZW0uaXNWYXIoKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5nZXRTdHJpbmdWYWx1ZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF2YXJpYWJsZXMuY29udGFpbnMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlcy5wdXNoKGtleSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gdmFyaWFibGVzO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZU92ZXJ2aWV3KCl7LypcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3PW5ldyBNYXRoT3ZlcnZpZXcoKVxyXG4gICAgICAgIHRoaXMub3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdzZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKSovXHJcbiAgICB9XHJcbiAgICBzaW5nbGVUb2tlblNldCh2YWx1ZTogbnVtYmVyKXtcclxuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdIGFzIFRva2VuO1xyXG4gICAgICAgIGlmKHRoaXMuc2luZ3VsVG9rZW4oKSl7XHJcbiAgICAgICAgICAgIHRva2VuLnNldFZhbHVlKHZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBNYXRoR3JvdXAge1xyXG4gICAgICAgIHJldHVybiBuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXMubWFwKGl0ZW09Pml0ZW0uY2xvbmUoKSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGhhc09wZXJhdG9yKCk6IHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpO31cclxuICAgIGRvZXNudEhhdmVPcGVyYXRvcigpOiAgdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuICF0aGlzLmhhc09wZXJhdG9yKCk7fVxyXG4gICAgZGVlcEhhc09wZXJhdG9yKCl7XHJcbiAgICAgICAgY29uc3QgbWFwPXRoaXMuaXRlbXMubWFwKChpdGVtKTogYm9vbGVhbiA9PiB7XHJcbiAgICAgICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uZGVlcEhhc09wZXJhdG9yKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKXJldHVybiB0cnVlXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBtYXAuc29tZSgodDogYm9vbGVhbik9PnQpXHJcbiAgICB9XHJcbiAgICBzaW5nbGVOdW1iZXIoKXtyZXR1cm4gdGhpcy5zaW5ndWxhcigpJiZ0aGlzLm51bWJlck9ubHkoKX1cclxuICAgIG51bWJlck9ubHkoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuZXZlcnkodCA9PiAodCBpbnN0YW5jZW9mIFRva2VuJiYhdC5pc1ZhcigpKSk7fVxyXG4gICAgaGFzVmFyaWFibGVzKCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiB0IGluc3RhbmNlb2YgVG9rZW4mJnQuaXNWYXIoKSk7fVxyXG5cclxuICAgIHNpbmd1bGFyKCk6Ym9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoID09PSAxICYmIHRoaXMuaXRlbXNbMF0gIT09IHVuZGVmaW5lZDt9XHJcbiAgICBzaW5ndWxUb2tlbigpOiB0aGlzIGlzIHsgaXRlbXM6IFtUb2tlbl0gfSB7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSAmJiB0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW47fVxyXG4gICAgaXNSb290TGV2ZWwoKXtyZXR1cm4gdGhpcy5pdGVtcy5ldmVyeSgoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIFRva2VuKTt9XHJcbiAgICBleHRyZW1lU2ltcGxpZnlBbmRHcm91cCgpe1xyXG4gICAgICAgIHRoaXMudHJ5UmVtb3ZlVW5uZWNlc3NhcnlOZXN0ZWQoKTtcclxuICAgICAgICB0aGlzLmNvbWJpbmluZ0xpa2VUZXJtcygpXHJcbiAgICB9XHJcblxyXG4gICAgdHJ5UmVtb3ZlVW5uZWNlc3NhcnlOZXN0ZWQoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2luZ3VsYXIoKSkge1xyXG4gICAgICAgICAgICBpZih0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXRlbXMgPSB0aGlzLml0ZW1zWzBdLml0ZW1zO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW0udHJ5UmVtb3ZlVW5uZWNlc3NhcnlOZXN0ZWQoKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGdldERlZXB0aCgpe1xyXG4gICAgICAgIGxldCBkZWVwdGhzOiBudW1iZXJbXT1bXTtcclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbil7XHJcbiAgICAgICAgICAgICAgICBkZWVwdGhzLnB1c2goMCk7cmV0dXJuO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBkZWVwdGhzLnB1c2goaXRlbS5nZXREZWVwdGgoKS5tYXgrMSlcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4ge21heDogTWF0aC5tYXgoLi4uZGVlcHRocyksIGRlZXB0aHM6IGRlZXB0aHN9XHJcbiAgICB9XHJcbiAgICBpc09wZXJhYmxlKCl7cmV0dXJuIHRydWV9XHJcblxyXG4gICAgZ2V0T3BlcmFibGVWYWx1ZSgpOiBudW1iZXIgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy50cnlSZW1vdmVVbm5lY2Vzc2FyeU5lc3RlZCgpO1xyXG4gICAgICAgIHRoaXMuY29tYmluaW5nTGlrZVRlcm1zKCk7XHJcbiAgICAgICAgY29uc3QgaXRlbXMgPSB0aGlzLml0ZW1zO1xyXG4gICAgICAgIGlmICh0aGlzLm51bWJlck9ubHkoKSkge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWU9MDtcclxuICAgICAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbTogVG9rZW4pID0+IHtcclxuICAgICAgICAgICAgICAgIHZhbHVlICs9IGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBnZXRJZCgpe1xyXG4gICAgICAgIHJldHVybiAnTWF0aEdyb3VwJ1xyXG4gICAgfVxyXG4gICAgcmVtb3ZlTmVzdGVkKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLmRlZXBIYXNPcGVyYXRvcigpKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICBsZXQgaXRlbXM6IFRva2VuW10gPSBbXTtcclxuICAgIFxyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwIHwgVG9rZW4pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbikge1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgICAgIGl0ZW0ucmVtb3ZlTmVzdGVkKCk7XHJcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKC4uLihpdGVtLml0ZW1zIGFzIFRva2VuW10pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLml0ZW1zID0gaXRlbXM7XHJcbiAgICBcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICAgIGNvbWJpbmluZ0xpa2VUZXJtcygpIHsvKlxyXG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3PXRoaXMubGV2ZWxNYXAoKVxyXG4gICAgICAgIGNvbnN0IGNvbWJpbmVkSXRlbXMgPSBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBvdmVydmlldy5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgaWYgKGtleS5pbmNsdWRlcyhcIm9wZXJhdG9yXCIpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21iaW5lZEl0ZW1zLnB1c2goLi4udmFsdWUuaXRlbXMpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3Qgc3VtID0gdmFsdWUuaXRlbXMucmVkdWNlKCh0b3RhbDogYW55LCBpdGVtOiBUb2tlbikgPT4gdG90YWwgKyAoaXRlbS5nZXRWYWx1ZT9pdGVtLmdldFZhbHVlKCk6IDApLCAwKTtcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBUb2tlbihzdW0sIHZhbHVlLnZhcmlhYmxlPz91bmRlZmluZWQpO1xyXG4gICAgICAgICAgICBjb21iaW5lZEl0ZW1zLnB1c2godG9rZW4pO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zID0gY29tYmluZWRJdGVtczsqL1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XHJcbiAgICAgICAgaWYoIUFycmF5LmlzQXJyYXkodGhpcy5pdGVtcykpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBidXQgcmVjZWl2ZWQ6IFwiK3RoaXMuaXRlbXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHN0cmluZys9c2hvdWxkQWRkUGx1cyh0aGlzLml0ZW1zW2luZGV4LTFdLGl0ZW0pXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBgKCR7aXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpfSlgO1xyXG4gICAgICAgICAgICB9ICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XHJcbiAgICAgICAgICAgIH0gaWYgKGN1c3RvbUZvcm1hdHRlcikge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nID0gY3VzdG9tRm9ybWF0dGVyKGl0ZW0sc3RyaW5nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmc7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5jbGFzcyBNYXRoT3ZlcnZpZXcge1xyXG4gICAgcHJpdmF0ZSB2YXJpYWJsZXM6IE1hcDxzdHJpbmcsIGFueT47XHJcbiAgICBwcml2YXRlIG9wZXJhdG9yczogTWFwPHN0cmluZywgYW55PjtcclxuICAgIHByaXZhdGUgbnVtYmVyOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIG1hdGhHcm91cHM6IE1hdGhHcm91cFtdPVtdO1xyXG4gICAgZ2V0TnVtYmVyKCk6IG51bWJlcntyZXR1cm4gdGhpcy5udW1iZXI7fVxyXG4gICAgZ2V0VmFyaWFibGVzKCk6IE1hcDxzdHJpbmcsIGFueT57cmV0dXJuIHRoaXMudmFyaWFibGVzO31cclxuICAgIGNvbnN0cnVjdG9yKHZhcmlhYmxlcz86IE1hcDxzdHJpbmcsIGFueT4sb3BlcmF0b3JzPzogTWFwPHN0cmluZywgYW55PixudW1iZXI/OiBudW1iZXIsbWF0aEdyb3Vwcz86IE1hdGhHcm91cFtdKXtcclxuICAgICAgICBpZih2YXJpYWJsZXMpdGhpcy52YXJpYWJsZXM9dmFyaWFibGVzO1xyXG4gICAgICAgIGlmKG9wZXJhdG9ycyl0aGlzLm9wZXJhdG9ycz1vcGVyYXRvcnM7XHJcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcclxuICAgICAgICBpZihtYXRoR3JvdXBzKXRoaXMubWF0aEdyb3Vwcz1tYXRoR3JvdXBzO1xyXG4gICAgfVxyXG4gICAgZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyhpdGVtczogTWF0aEdyb3VwSXRlbVtdKSB7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXM9bmV3IE1hcCgpO1xyXG4gICAgICAgIHRoaXMub3BlcmF0b3JzPW5ldyBNYXAoKTtcclxuXHJcbiAgICAgICAgaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVmFyaWFibGVzTWFwKGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmIWl0ZW0uaXNWYXIoKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU11bWJlcihpdGVtLmdldE51bWJlclZhbHVlKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlT3BlcmF0b3JzTWFwKGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWF0aEdyb3Vwcy5wdXNoKGl0ZW0pXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gY2F0ZWdvcnkgaW4gTWF0aE92ZXJ2aWV3IHNlcGFyYXRlSW50b0luZGl2aWR1YWxzXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfVxyXG4gICAgdXBkYXRlTXVtYmVyKG51bWJlcjogbnVtYmVyKXsgdGhpcy5udW1iZXI9dGhpcy5udW1iZXI/dGhpcy5udW1iZXIrbnVtYmVyOm51bWJlcjt9XHJcbiAgICB1cGRhdGVWYXJpYWJsZXNNYXAoa2V5OiBzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFyaWFibGVzID8/PSBuZXcgTWFwPHN0cmluZywgeyBjb3VudDogbnVtYmVyOyBpdGVtczogYW55W10gfT4oKTtcclxuICAgICAgICBpZighdGhpcy52YXJpYWJsZXMuaGFzKGtleSkpe3RoaXMudmFyaWFibGVzLnNldChrZXkse2NvdW50OiAwLCBpdGVtczogW119KX1cclxuICAgICAgICB0aGlzLnZhcmlhYmxlcy5nZXQoa2V5KS5jb3VudCsrO1xyXG4gICAgfVxyXG4gICAgdXBkYXRlT3BlcmF0b3JzTWFwKG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlR3JvdXA9b3BlcmF0b3IuZ2V0VmFyaWFibGVHcm91cCgpXHJcbiAgICAgICAgaWYodmFyaWFibGVHcm91cCl7XHJcbiAgICAgICAgICAgIEFycmF5LmZyb20oeyBsZW5ndGg6IHZhcmlhYmxlR3JvdXAub2NjdXJyZW5jZXNDb3VudCB9KS5mb3JFYWNoKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVmFyaWFibGVzTWFwKHZhcmlhYmxlR3JvdXAudmFyaWFibGUpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICByZXR1cm5cclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3Qga2V5PW9wZXJhdG9yLm9wZXJhdG9yO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycy5oYXMoa2V5KSl7dGhpcy5vcGVyYXRvcnMuc2V0KGtleSx7Y291bnQ6IDAsIGl0ZW1zOiBbXX0pfVxyXG4gICAgICAgIHRoaXMub3BlcmF0b3JzLmdldChrZXkpLmNvdW50Kys7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzVmFyKCl7cmV0dXJuIHRoaXMudmFyaWFibGVzJiZ0aGlzLnZhcmlhYmxlcy5zaXplPjB9XHJcbiAgICBoYXNPcCgpe3JldHVybiB0aGlzLm9wZXJhdG9ycyYmdGhpcy5vcGVyYXRvcnMuc2l6ZT4wfVxyXG4gICAgaGFzR3JvdXAoKXtyZXR1cm4gdGhpcy5tYXRoR3JvdXBzLmxlbmd0aD4wfVxyXG4gICAgb25seU51bWVyaWMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5udW1iZXImJiF0aGlzLmhhc1ZhcigpJiYhdGhpcy5oYXNPcCgpJiYhdGhpcy5oYXNHcm91cCgpXHJcbiAgICB9XHJcbiAgICBkZWVwTnVtZXJpYygpe1xyXG5cclxuICAgIH1cclxuICAgIGV4cGxvckFsbExldmVscygpe1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBUb2tlbntcclxuICAgIHByaXZhdGUgdmFsdWU6IG51bWJlcnxzdHJpbmc7XHJcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTpudW1iZXJ8c3RyaW5nKXtcclxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgfVxyXG4gICAgZ2V0TnVtYmVyVmFsdWUoKTpudW1iZXJ7cmV0dXJuICh0aGlzLnZhbHVlIGFzIG51bWJlcil9XHJcbiAgICBnZXRTdHJpbmdWYWx1ZSgpOnN0cmluZ3tyZXR1cm4gKHRoaXMudmFsdWUgYXMgc3RyaW5nKX1cclxuICAgIGdldFZhbHVlKCl7cmV0dXJuIHRoaXMudmFsdWV9XHJcbiAgICBzZXRWYWx1ZSh2YWx1ZTogbnVtYmVyfHN0cmluZyl7dGhpcy52YWx1ZT12YWx1ZTt9XHJcbiAgICBpc1ZhcigpIHtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWUgPT09ICdzdHJpbmcnO31cclxuICAgIFxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmKCF0aGlzLmlzVmFyKCkmJnRoaXMuZ2V0TnVtYmVyVmFsdWUoKTwwKVxyXG4gICAgICAgICAgICBzdHJpbmcrPSctJztcclxuICAgICAgICBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgaWYoY3VzdG9tRm9ybWF0dGVyKXtcclxuICAgICAgICAgICAgcmV0dXJuIGN1c3RvbUZvcm1hdHRlcih0aGlzLHN0cmluZylcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZztcclxuICAgIH1cclxuICAgIGNsb25lKCl7cmV0dXJuIG5ldyBUb2tlbih0aGlzLnZhbHVlKX1cclxufVxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW5ze1xyXG4gICAgdG9rZW5zOiBBcnJheTxCYXNpY01hdGhKYXhUb2tlbnxQYXJlbj49W107XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKHRva2Vucz86IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPil7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dG9rZW5zfHxbXTtcclxuICAgIH1cclxuICAgIGFkZElucHV0KG1hdGg6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy50b2tlbml6ZShtYXRoKTtcclxuICAgIH1cclxuICAgIHRva2VuaXplKG1hdGg6IHN0cmluZyl7XHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMoKSlcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlPS9bXFwoXFwpXS8udGVzdChtYXRjaFswXSk/J3BhcmVuJzonb3BlcmF0b3InXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4odHlwZSxtYXRjaFswXSkpO1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTE7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaCA9IG1hdGguc2xpY2UoaSkubWF0Y2goL14oWzAtOS5dKykvKTsvLyhbYS16QS1aXT8pLyk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKVxyXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljTWF0aEpheFRva2VuKCdudW1iZXInLHBhcnNlRmxvYXQobWF0Y2hbMF0pKSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaD1tYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsoX1xcKFthLXpBLVowLTldKlxcKSkqLylcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbihcInZhcmlhYmxlXCIsbWF0Y2hbMF0pKVxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgdGhpcy5wb3N0UHJvY2Vzc1Rva2VucygpO1xyXG4gICAgfVxyXG5cclxuICAgIHBvc3RQcm9jZXNzVG9rZW5zKCl7XHJcbiAgICAgICAgLypydWxlcyB0byBhYmlkIGJ5OlxyXG4gICAgICAgIDEuICstIElmIHBhcnQgb2YgdGhlIG51bWJlciB0aGV5IGFyZSBhYnNvcmJlZCBpbnRvIHRoZSBudW1iZXJcclxuICAgICAgICAqL1xyXG4gICAgICAgIHRoaXMudG9rZW5zPWlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMuaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcGFyZW5NYXA9dGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuXHJcbiAgICAgICAgcGFyZW5NYXAuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGIgLSBhKVxyXG4gICAgICAgIC5mb3JFYWNoKCh2YWx1ZTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZSh2YWx1ZSwgMCwgbmV3ICBCYXNpY01hdGhKYXhUb2tlbignb3BlcmF0b3InLCcqJykpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLnZhbGlkYXRlUGx1c01pbnVzKClcclxuICAgIH1cclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKSB7XHJcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpfHwhKHRoaXMudG9rZW5zW2luZGV4XSBpbnN0YW5jZW9mIFBhcmVuKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBpZHggPSBmaW5kUGFyZW5JbmRleChpbmRleCx0aGlzLnRva2Vucyk/Lm9wZW47XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKGlkeCA9PSBudWxsIHx8ICFpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCArIDFdKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRoaXMudG9rZW5zW2lkeCAtIDFdO1xyXG4gICAgXHJcbiAgICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICAgICBpZHggPiAwICYmXHJcbiAgICAgICAgICAgICAgICBwcmV2VG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJlxyXG4gICAgICAgICAgICAgICAgIWdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eShbMSwgMl0pLmluY2x1ZGVzKHByZXZUb2tlbi52YWx1ZT8udG9TdHJpbmcoKSB8fCAnJylcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9O1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleF07XHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHRva2VuLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgY29uc3QgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uPSh0b2tlbjogYW55KT0+e1xyXG4gICAgICAgICAgICByZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiYmdHlwZW9mIHRva2VuLnZhbHVlPT09J3N0cmluZycmJmhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4udmFsdWUpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGlzVmFyPSh0b2tlbjogYW55KT0+e3JldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmdG9rZW4udHlwZT09PSd2YXJpYWJsZSd9XHJcbiAgICAgICAgY29uc3QgcHJlY2VkZXNWYXJpYWJsZSA9ICh0b2tlbnM6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBpbmRleD4wJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZm9sbG93c1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIGluZGV4PHRva2Vucy5sZW5ndGgtMSYmaXNWYXIodG9rZW5zW2luZGV4XSlcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlzT3BlblBhcmVuKHRva2VuKXx8IGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbil8fHByZWNlZGVzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzQ2xvc2VkUGFyZW4odG9rZW4pfHxmb2xsb3dzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHwgdGVzdERvdWJsZVJpZ2h0KGluZGV4KSA/IGluZGV4ICsgMSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbSkgPT4gaXRlbSAhPT0gbnVsbCk7XHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy50b2tlbnMsbWFwKVxyXG4gICAgICAgIHJldHVybiBtYXA7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB2YWxpZGF0ZVBsdXNNaW51cygpe1xyXG4gICAgICAgIC8vIFBsdXNlcyBhcmUgc2VwYXJhdG9ycy5UaGVyZWZvcmUsIHRoZXkgZG8gbm90IG5lZWQgdG8gYmUgaGVyZSBBcyB0aGUgZXhwcmVzc2lvbiBpcyB0b2tlbltdXHJcbiAgICAgICAgLy9NaW51c2VzIG9uIHRoZSBvdGhlciBoYW5kLmNhbiBlaXRoZXIgYmUgYSBzZXBhcmF0b3IuIE9yIGEgbmVnYXRpdmUgc2lnblxyXG4gICAgICAgIGNvbnN0IHBsdXNNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW4sIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSAnQWRkaXRpb24nP2luZGV4IDogbnVsbCkuZmlsdGVyKChpbmRleDogbnVtYmVyIHwgbnVsbCkgPT4gaW5kZXggIT09IG51bGwpXHJcbiAgICAgICAgcGx1c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBtaW51c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdTdWJ0cmFjdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcclxuICAgICAgICBcclxuICAgICAgICBtaW51c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleCArIDFdO1xyXG4gICAgICAgICAgICBpZiAobmV4dFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdHlwZW9mIG5leHRUb2tlbi52YWx1ZSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgICBuZXh0VG9rZW4udmFsdWUgKj0gLTE7XHJcbiAgICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICB2YWxpZGF0ZUluZGV4KGluZGV4OiBudW1iZXIsbWFyZ2luPzogbnVtYmVyKXtcclxuICAgICAgICBtYXJnaW49bWFyZ2lufHwwO1xyXG4gICAgICAgIHJldHVybiBpbmRleD49MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC1tYXJnaW47XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBCYXNpY01hdGhKYXhUb2tlbnMge1xyXG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW5zKHRoaXMudG9rZW5zLm1hcCh0b2tlbiA9PiB0b2tlbi5jbG9uZSgpKSk7XHJcbiAgICB9XHJcbiAgICAvKlxyXG4gICAgXHJcbiAgICBpbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKCl7XHJcbiAgICAgICAgY29uc3QgdGVzdERvdWJsZVJpZ2h0ID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IGlkeD1maW5kUGFyZW5JbmRleChudWxsLGluZGV4KS5vcGVuO1xyXG4gICAgICAgICAgICByZXR1cm4gaXNPcGVuUGFyZW4odGhpcy50b2tlbnNbaW5kZXgrMV0pJiYoaWR4PT09MHx8IWdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSgnZG91YmxlUmlnaHQnKS5pbmNsdWRlcyh0aGlzLnRva2Vuc1tpZHgtMV0/LnZhbHVlKSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIShUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKXx8IXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zW2luZGV4XS5pc1ZhbHVlVG9rZW4oKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgICAgICAubWFwKCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9LCBpbmRleDogbnVtYmVyKSA9PiB7IFxyXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSBcIihcIiB8fCAoaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSBcIilcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8dGVzdERvdWJsZVJpZ2h0KGluZGV4KT8gaW5kZXgrMSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgIH1cclxuXHJcbiAgICBcclxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuOiBhbnksIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSBcIihcIiA/IGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgpIDogbnVsbClcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgfVxyXG5cclxuICAgIGZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwUGFyZW5JbmRleGVzKClcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XHJcbiAgICAgICAgICAgICAgICBpZiAob3BlbkluZGV4ID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICgvKG9wZXJhdG9yfHBhcmVuKS8udGVzdCh0aGlzLnRva2Vuc1tvcGVuSW5kZXggLSAxXT8udHlwZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmIChjbG9zZUluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0/LmlzVmFsdWVUb2tlbigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfSkuZmxhdE1hcCgoaXRlbTogYW55KSA9PiBbaXRlbS5vcGVuLCBpdGVtLmNsb3NlXSk7XHJcbiAgICB9ICAgIFxyXG4gICAgXHJcbiAgICBcclxuICAgIGZpbmRTaW1pbGFyU3VjY2Vzc29yKHRva2Vucyl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXHJcbiAgICAgICAgICAgICAgICAmJih0aGlzLnRva2VuQ29tcGFyZShcInR5cGVcIix0aGlzLnZhbHVlVG9rZW5zKCksIHRva2VuLCB0b2tlbnNbaW5kZXggKyAxXSkpXHJcbiAgICAgICAgKSk7XHJcbiAgICAgfVxyXG4gICAgXHJcbiAgICBjb25uZWN0TmVhcmJ5VG9rZW5zKCl7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIFRva2VuKSl7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJmdHlndWJobmltcG9cIilcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1hcCA9IG5ldyBTZXQodGhpcy5maWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFsKCkpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfOiBhbnksIGlkeDogdW5rbm93bikgPT4gIW1hcC5oYXMoaWR4KSk7XHJcbiAgICAgICAgLy9Qcm9ibGVtIHdpdGggID0gYXMgaXQncyBhZmZlY3RpbmcgdGhlIHZhcmlhYmxlIGJlZm9yZSBpdFxyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4IC0gMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKCkgJiZcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4ICsgMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKClcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgYXJyID0gW1xyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobnVtTWFwKSwgXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyh2YXJNYXApLCBcclxuICAgICAgICBdO1xyXG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXHJcbiAgICB9XHJcblxyXG4gICAgXHJcblxyXG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxyXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW4udHlwZSkpIFxyXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtyZXR1cm4gSW5maW5pdHl9XHJcbiAgICB9XHJcblxyXG4gICAgaW5zZXJ0VG9rZW5zKHN0YXJ0OiBhbnksIGxlbmd0aDogbnVtYmVyLCBvYmplY3RzOiBhbnlbXSB8IFRva2VuKSB7XHJcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XHJcbiAgICB9XHJcblxyXG4gICAgXHJcblxyXG4gICAgaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnM6IGFueVtdKXtcclxuICAgICAgICByZXR1cm4gdG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT5pbmRleD4wXHJcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXHJcbiAgICAgICAgICAgICYmdG9rZW4/LmlzVmFsdWVUb2tlbigpJiZ0b2tlbi52YWx1ZT49MD9pbmRleDpudWxsXHJcbiAgICAgICAgKS5maWx0ZXIoaXRlbT0+aXRlbSE9PW51bGwpXHJcbiAgICB9XHJcblxyXG4gICAgdG9rZW5Db21wYXJlKGNvbXBhcmU6IHN0cmluZyB8IG51bWJlciwgdmFsdWU6IHN0cmluZ3xSZWdFeHAsIHRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0sIG5leHRUb2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9KSB7XHJcbiAgICAgICAgY29uc3QgcmVnRXhwdmFsdWUgPSAodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcclxuICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAodmFsdWUgPT09IG51bGwgfHwgcmVnRXhwdmFsdWUudGVzdCh0b2tlbltjb21wYXJlXSkpICYmXHJcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICAqL1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW57XHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICB2YWx1ZT86IHN0cmluZ3xudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IodHlwZTpzdHJpbmcgLHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQpe1xyXG4gICAgICAgIHRoaXMudHlwZT10eXBlO1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICAgICAgdGhpcy5pbnN1clByb3BlckZvcm1hdHRpbmcoKVxyXG4gICAgfVxyXG4gICAgaW5zdXJQcm9wZXJGb3JtYXR0aW5nKCl7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzVmFsdWVUb2tlbigpJiZ0eXBlb2YgdGhpcy52YWx1ZT09PVwic3RyaW5nXCIpe1xyXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXNlYXJjaEFsbE1hdGhKYXhPcGVyYXRvcnNBbmRTeW1ib2xzKHRoaXMudmFsdWUpPy5uYW1lXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldExhdGV4U3ltYm9sKCl7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZyc/c2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubGF0ZXg6dW5kZWZpbmVkfVxyXG5cclxuICAgIGdldGZ1bGxUeXBlKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudHlwZVxyXG4gICAgfVxyXG4gICAgY2xvbmUoKXtcclxuICAgICAgICByZXR1cm4gbmV3IEJhc2ljTWF0aEpheFRva2VuKHRoaXMudHlwZSwgdGhpcy52YWx1ZSlcclxuICAgIH1cclxuXHJcblxyXG4gICAgaXNTdHJpbmcoKXtyZXR1cm4gdGhpcy50eXBlPT09J3BhcmVuJ3x8dGhpcy50eXBlPT09J29wZXJhdG9yJ31cclxuXHJcbiAgICBpc1ZhbHVlVG9rZW4oKXtyZXR1cm4gdGhpcy50eXBlPT09J3ZhcmlhYmxlJ3x8dGhpcy50eXBlPT09J251bWJlcid9XHJcblxyXG4gICAgdG9TdHJpbmdMYXRleCgpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9JydcclxuICAgICAgICBpZiAodGhpcy5pc1N0cmluZygpKVxyXG4gICAgICAgICAgICBzdHJpbmcrPXRoaXMuZ2V0TGF0ZXhTeW1ib2woKVxyXG4gICAgICAgIGlmICh0aGlzLnR5cGU9PT0nbnVtYmVyJykgc3RyaW5nKz10aGlzLnZhbHVlO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmdcclxuICAgIH1cclxuICAgIGFmZmVjdGVkT3BlcmF0b3JSYW5nZShkaXJlY3Rpb246IHN0cmluZyl7XHJcbiAgICAgICAgaWYodGhpcy50eXBlIT09J29wZXJhdG9yJ3x8dGhpcy52YWx1ZT09PSdFcXVhbHMnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICBpZih0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnJiZkaXJlY3Rpb249PT0nbGVmdCcmJiFpc09wZXJhdG9yV2l0aEFzc29jaWF0aXZpdHkodGhpcy52YWx1ZSwgWy0xLCAxXSx0cnVlKSlcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxufSJdfQ==