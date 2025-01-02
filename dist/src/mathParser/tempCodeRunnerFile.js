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
            console.log(item);
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
        if (overview.number) {
            newItems.push(new Token(overview.number));
        }
        for (const [key, value] of overview.variables.entries()) {
            if (value.count > 1) {
                newItems.push(MathJaxOperator.asVariableGroup(value.count, key));
            }
            else {
                newItems.push(new Token(key));
            }
        }
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
                    this.updateOperatorsMap(item.operator);
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
        if (!this.variables)
            this.variables = new Map();
        if (!this.variables.has(key)) {
            this.variables.set(key, { count: 0, items: [] });
        }
        this.variables.get(key).count++;
    }
    updateOperatorsMap(key) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL21hdGhQYXJzZXIvdGVtcENvZGVSdW5uZXJGaWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUlBLE9BQU8sRUFBRSxnQkFBZ0IsRUFBUSxNQUFNLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNwRSxPQUFPLEVBQWlCLFdBQVcsRUFBbUUsTUFBTSxzQkFBc0IsQ0FBQztBQUVuSSxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3pHLE9BQU8sRUFBRSx1QkFBdUIsRUFBaUMsMkJBQTJCLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUsMkJBQTJCLEVBQUUsbUNBQW1DLEVBQUUsc0JBQXNCLEVBQWlCLE1BQU0sc0JBQXNCLENBQUM7QUFHeFIsTUFBTSxVQUFVLGtCQUFrQixDQUM5QixTQUFjLEVBQ2QsU0FBaUMsRUFDakMsT0FBNEIsRUFBRTtJQUU5Qiw0REFBNEQ7SUFDNUQsSUFBSSxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUN2QixPQUFPLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNyQyxDQUFDO0lBRUQsbUVBQW1FO0lBQ25FLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQzNCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDeEMsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekUsSUFBSSxNQUFNO2dCQUFF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LEdBQVc7UUFDMUIsSUFBRyxDQUFDLElBQUksQ0FBQyxTQUFTO1lBQUUsSUFBSSxDQUFDLFNBQVMsR0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzdDLElBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBQyxDQUFDO1lBQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFDLEVBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFDLENBQUMsQ0FBQTtRQUFBLENBQUM7UUFDM0UsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUNELGtCQUFrQixDQUFDLEdBQVc7UUFDMUIsSUFBRyxDQUFDLElBQUksQ0FBQyxTQUFTO1lBQUUsSUFBSSxDQUFDLFNBQVMsR0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzdDLElBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBQyxDQUFDO1lBQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFDLEVBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFDLENBQUMsQ0FBQTtRQUFBLENBQUM7UUFDM0UsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUNELE1BQU0sS0FBRyxPQUFPLElBQUksQ0FBQyxTQUFTLElBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEdBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQztJQUN0RCxLQUFLLEtBQUcsT0FBTyxJQUFJLENBQUMsU0FBUyxJQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxHQUFDLENBQUMsQ0FBQSxDQUFBLENBQUM7SUFDckQsUUFBUSxLQUFHLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQztJQUMzQyxXQUFXO1FBQ1AsT0FBTyxJQUFJLENBQUMsTUFBTSxJQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFBO0lBQ3ZFLENBQUM7SUFDRCxXQUFXO0lBRVgsQ0FBQztJQUNELGVBQWU7SUFFZixDQUFDO0NBQ0o7QUFPRCxNQUFNLE9BQU8sS0FBSztJQUNOLEtBQUssQ0FBZ0I7SUFDN0IsWUFBWSxLQUFtQjtRQUMzQixJQUFJLENBQUMsS0FBSyxHQUFDLEtBQUssQ0FBQztJQUNyQixDQUFDO0lBQ0QsY0FBYyxLQUFVLE9BQVEsSUFBSSxDQUFDLEtBQWdCLENBQUEsQ0FBQSxDQUFDO0lBQ3RELGNBQWMsS0FBVSxPQUFRLElBQUksQ0FBQyxLQUFnQixDQUFBLENBQUEsQ0FBQztJQUN0RCxRQUFRLEtBQUcsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFBLENBQUEsQ0FBQztJQUM3QixRQUFRLENBQUMsS0FBb0IsSUFBRSxJQUFJLENBQUMsS0FBSyxHQUFDLEtBQUssQ0FBQyxDQUFBLENBQUM7SUFDakQsS0FBSyxLQUFJLE9BQU8sT0FBTyxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFBLENBQUM7SUFFaEQsUUFBUSxDQUFDLGVBQW9EO1FBQ3pELElBQUksTUFBTSxHQUFDLEVBQUUsQ0FBQTtRQUNiLElBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxHQUFDLENBQUM7WUFDckMsTUFBTSxJQUFFLEdBQUcsQ0FBQztRQUNoQixNQUFNLElBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUNuQixJQUFHLGVBQWUsRUFBQyxDQUFDO1lBQ2hCLE9BQU8sZUFBZSxDQUFDLElBQUksRUFBQyxNQUFNLENBQUMsQ0FBQTtRQUN2QyxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUNELEtBQUssS0FBRyxPQUFPLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUM7Q0FDeEM7QUFJRCxNQUFNLE9BQU8sa0JBQWtCO0lBQzNCLE1BQU0sR0FBaUMsRUFBRSxDQUFDO0lBRTFDLFlBQVksTUFBdUM7UUFDL0MsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLElBQUUsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFDRCxRQUFRLENBQUMsSUFBWTtRQUNqQixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFDRCxRQUFRLENBQUMsSUFBWTtRQUNqQixNQUFNLFNBQVMsR0FBQyxnQkFBZ0IsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLENBQUE7UUFDM0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNuQyxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDekQsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxJQUFJLEdBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsT0FBTyxDQUFBLENBQUMsQ0FBQSxVQUFVLENBQUE7Z0JBQ3JELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUssaUJBQWlCLENBQUMsSUFBSSxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hELENBQUMsSUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQztnQkFDckIsU0FBUztZQUNiLENBQUM7WUFDRCxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQSxnQkFBZ0I7WUFDMUQsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUNYLENBQUM7Z0JBQUcsQ0FBQyxJQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFBO2dCQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLGlCQUFpQixDQUFDLFFBQVEsRUFBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2RSxTQUFTO1lBQ2IsQ0FBQztZQUNELEtBQUssR0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFBO1lBQzFELElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNWLENBQUMsSUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQTtnQkFDcEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtnQkFDNUQsU0FBUztZQUNiLENBQUM7WUFFRCxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFDRixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsaUJBQWlCO1FBQ2I7O1VBRUU7UUFDRixJQUFJLENBQUMsTUFBTSxHQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUE7UUFFaEMsTUFBTSxRQUFRLEdBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUE7UUFFL0MsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQVMsRUFBRSxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDN0MsT0FBTyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7WUFDcEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxJQUFLLGlCQUFpQixDQUFDLFVBQVUsRUFBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUE7SUFDNUIsQ0FBQztJQUNELHlCQUF5QjtRQUNyQixNQUFNLGVBQWUsR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFFO1lBQ3RDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLEtBQUssQ0FBQztnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUNyRixNQUFNLEdBQUcsR0FBRyxjQUFjLENBQUMsS0FBSyxFQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUM7WUFFcEQsSUFBSSxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUFFLE9BQU8sS0FBSyxDQUFDO1lBRXRFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRXZDLE9BQU8sQ0FDSCxHQUFHLEdBQUcsQ0FBQztnQkFDUCxTQUFTLFlBQVksaUJBQWlCO2dCQUN0QyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQ25GLENBQUM7UUFDTixDQUFDLENBQUM7UUFFRixNQUFNLEtBQUssR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFFO1lBQzVCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUM3QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLE9BQU8sS0FBSyxZQUFZLGlCQUFpQixJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUN0RSxDQUFDLENBQUM7UUFDRixNQUFNLDJCQUEyQixHQUFDLENBQUMsS0FBVSxFQUFDLEVBQUU7WUFDNUMsT0FBTyxLQUFLLFlBQVksaUJBQWlCLElBQUUsT0FBTyxLQUFLLENBQUMsS0FBSyxLQUFHLFFBQVEsSUFBRSx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDcEgsQ0FBQyxDQUFBO1FBQ0QsTUFBTSxLQUFLLEdBQUMsQ0FBQyxLQUFVLEVBQUMsRUFBRSxHQUFDLE9BQU8sS0FBSyxZQUFZLGlCQUFpQixJQUFHLEtBQUssQ0FBQyxJQUFJLEtBQUcsVUFBVSxDQUFBLENBQUEsQ0FBQyxDQUFBO1FBQy9GLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxNQUFXLEVBQUMsS0FBYSxFQUFFLEVBQUU7WUFDbkQsT0FBTyxLQUFLLEdBQUMsQ0FBQyxJQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQTtRQUN4QyxDQUFDLENBQUM7UUFFRixNQUFNLGVBQWUsR0FBRyxDQUFDLE1BQVcsRUFBQyxLQUFhLEVBQUUsRUFBRTtZQUNsRCxPQUFPLEtBQUssR0FBQyxNQUFNLENBQUMsTUFBTSxHQUFDLENBQUMsSUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUE7UUFDdEQsQ0FBQyxDQUFDO1FBR0YsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU07YUFDbEIsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ2xCLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFHLDJCQUEyQixDQUFDLEtBQUssQ0FBQyxJQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDL0YsT0FBTyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMzQyxDQUFDO2lCQUFNLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFFLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2xFLE9BQU8sS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUN6RSxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUM7UUFDaEIsQ0FBQyxDQUFDO2FBQ0QsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFDLEdBQUcsQ0FBQyxDQUFBO1FBQzVCLE9BQU8sR0FBRyxDQUFDO0lBQ2YsQ0FBQztJQUdELGlCQUFpQjtRQUNiLDRGQUE0RjtRQUM1Rix5RUFBeUU7UUFDekUsTUFBTSxPQUFPLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUF3QixFQUFFLEtBQVUsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBSyxVQUFVLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBb0IsRUFBRSxFQUFFLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFBO1FBQ2pLLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFhLEVBQUUsRUFBRTtZQUN4QyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUMsQ0FBQyxDQUFDLENBQUE7UUFDL0IsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLFFBQVEsR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQXdCLEVBQUUsS0FBVSxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxLQUFLLGFBQWEsQ0FBQSxDQUFDLENBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFvQixFQUFFLEVBQUUsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUE7UUFFckssUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQWEsRUFBRSxFQUFFO1lBQ3pDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLElBQUksU0FBUyxZQUFZLGlCQUFpQixJQUFJLE9BQU8sU0FBUyxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbEYsU0FBUyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQy9CLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNULENBQUM7SUFDRCxhQUFhLENBQUMsS0FBYSxFQUFDLE1BQWU7UUFDdkMsTUFBTSxHQUFDLE1BQU0sSUFBRSxDQUFDLENBQUM7UUFDakIsT0FBTyxLQUFLLElBQUUsQ0FBQyxHQUFDLE1BQU0sSUFBRSxLQUFLLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUMsTUFBTSxDQUFDO0lBQzVELENBQUM7SUFDRCxLQUFLO1FBQ0QsT0FBTyxJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMzRSxDQUFDO0NBOEhKO0FBUUQsTUFBTSxPQUFPLGlCQUFpQjtJQUMxQixJQUFJLENBQVM7SUFDYixLQUFLLENBQWlCO0lBRXRCLFlBQVksSUFBVyxFQUFFLEtBQWtDO1FBQ3ZELElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBQyxLQUFLLENBQUM7UUFDakIsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUE7SUFDaEMsQ0FBQztJQUNELHFCQUFxQjtRQUNqQixJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFFLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBRyxRQUFRLEVBQUMsQ0FBQztZQUNwRCxJQUFJLENBQUMsS0FBSyxHQUFDLG1DQUFtQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUE7UUFDcEUsQ0FBQztJQUNMLENBQUM7SUFFRCxjQUFjLEtBQUcsT0FBTyxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUcsUUFBUSxDQUFBLENBQUMsQ0FBQSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFBLENBQUMsQ0FBQSxTQUFTLENBQUEsQ0FBQSxDQUFDO0lBRXpHLFdBQVc7UUFDUCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUE7SUFDcEIsQ0FBQztJQUNELEtBQUs7UUFDRCxPQUFPLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7SUFDdkQsQ0FBQztJQUdELFFBQVEsS0FBRyxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUcsT0FBTyxJQUFFLElBQUksQ0FBQyxJQUFJLEtBQUcsVUFBVSxDQUFBLENBQUEsQ0FBQztJQUU5RCxZQUFZLEtBQUcsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxJQUFJLENBQUMsSUFBSSxLQUFHLFFBQVEsQ0FBQSxDQUFBLENBQUM7SUFFbkUsYUFBYTtRQUNULElBQUksTUFBTSxHQUFDLEVBQUUsQ0FBQTtRQUNiLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNmLE1BQU0sSUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUE7UUFDakMsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFHLFFBQVE7WUFBRSxNQUFNLElBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUM3QyxPQUFPLE1BQU0sQ0FBQTtJQUNqQixDQUFDO0lBQ0QscUJBQXFCLENBQUMsU0FBaUI7UUFDbkMsSUFBRyxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxJQUFJLENBQUMsS0FBSyxLQUFHLFFBQVE7WUFDNUMsT0FBTyxLQUFLLENBQUE7UUFDaEIsSUFBRyxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUcsUUFBUSxJQUFFLFNBQVMsS0FBRyxNQUFNLElBQUUsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDO1lBQ3ZHLE9BQU8sS0FBSyxDQUFBO1FBQ2hCLE9BQU8sSUFBSSxDQUFBO0lBQ2YsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbmltcG9ydCB7IHF1YWQsY2FsY3VsYXRlQmlub20scm91bmRCeVNldHRpbmdzICxkZWdyZWVzVG9SYWRpYW5zLHJhZGlhbnNUb0RlZ3JlZXMsIGNhbGN1bGF0ZUZhY3RvcmlhbH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBleHBhbmRFeHByZXNzaW9uLGN1cmx5QnJhY2tldHNSZWdleCB9IGZyb20gXCIuLi9pbVZlcnlMYXp5XCI7XHJcbmltcG9ydCB7IHR5cGUgfSBmcm9tIFwib3NcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgcmVnRXhwIH0gZnJvbSBcIi4uL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyBBc3NvY2lhdGl2aXR5LCBCcmFja2V0VHlwZSwgTWF0aEpheE9wZXJhdG9yTWV0YWRhdGEsIG1hdGhKYXhPcGVyYXRvcnNNZXRhZGF0YSwgT3BlcmF0b3JUeXBlIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XHJcblxyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgUGFyZW4saWRQYXJlbnRoZXNlcywgaXNPcGVuUGFyZW4sIGlzQ2xvc2VkUGFyZW4gfSBmcm9tIFwiLi4vdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcywgZ2V0TWF0aEpheE9wZXJhdG9yc0J5UHJpb3JpdHksIGdldE9wZXJhdG9yc0J5QXNzb2NpYXRpdml0eSwgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUsIGhhc0ltcGxpY2l0TXVsdGlwbGljYXRpb24sIGlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSwgc2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHMsIHNlYXJjaE1hdGhKYXhPcGVyYXRvcnMsIHNlYXJjaFN5bWJvbHMgfSBmcm9tIFwiLi4vdXRpbHMvZGF0YU1hbmFnZXJcIjtcclxuXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGVlcFNlYXJjaFdpdGhQYXRoKFxyXG4gICAgc3RydWN0dXJlOiBhbnksXHJcbiAgICBwcmVkaWNhdGU6IChpdGVtOiBhbnkpID0+IGJvb2xlYW4sXHJcbiAgICBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW11cclxuKTogeyBpdGVtOiBhbnk7IHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW10gfSB8IG51bGwge1xyXG4gICAgLy8gQmFzZSBjYXNlOiBJZiB0aGUgY3VycmVudCBzdHJ1Y3R1cmUgbWF0Y2hlcyB0aGUgcHJlZGljYXRlXHJcbiAgICBpZiAocHJlZGljYXRlKHN0cnVjdHVyZSkpIHtcclxuICAgICAgICByZXR1cm4geyBpdGVtOiBzdHJ1Y3R1cmUsIHBhdGggfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBpdCdzIGFuIGFycmF5LCByZWN1cnNpdmVseSBzZWFyY2ggZWFjaCBlbGVtZW50IHdpdGggaXRzIGluZGV4XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheShzdHJ1Y3R1cmUpKSB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJ1Y3R1cmUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtpXSwgcHJlZGljYXRlLCBbLi4ucGF0aCwgaV0pO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBpdCdzIGFuIG9iamVjdCwgcmVjdXJzaXZlbHkgc2VhcmNoIGl0cyBwcm9wZXJ0aWVzIHdpdGggdGhlaXIga2V5c1xyXG4gICAgaWYgKHN0cnVjdHVyZSAhPT0gbnVsbCAmJiB0eXBlb2Ygc3RydWN0dXJlID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gc3RydWN0dXJlKSB7XHJcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RydWN0dXJlLCBrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBkZWVwU2VhcmNoV2l0aFBhdGgoc3RydWN0dXJlW2tleV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGtleV0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBubyBtYXRjaCBpcyBmb3VuZFxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JNYXRoR3JvdXBJdGVtcyhpdGVtczogYW55KTogTWF0aEdyb3VwSXRlbVtdIHtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShpdGVtcykpIHtcclxuICAgICAgICBpZiAoIWl0ZW1zLmxlbmd0aCYmaXRlbXMgaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcclxuICAgICAgICAgICAgaXRlbXM9aXRlbXMuZ2V0SXRlbXMoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBpdGVtcz1baXRlbXNdXHJcbiAgICB9XHJcbiAgICBjb25zdCBmb3JtYXR0ZWRJdGVtcz1pdGVtc1xyXG4gICAgICAgIC5tYXAoKGl0ZW06IFRva2VufE1hdGhHcm91cHxNYXRoSmF4T3BlcmF0b3J8QmFzaWNNYXRoSmF4VG9rZW4pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pIHtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLnZhbHVlJiYoaXRlbS50eXBlPT09IFwibnVtYmVyXCJ8fGl0ZW0udHlwZT09PVwidmFyaWFibGVcIikpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFRva2VuKGl0ZW0udmFsdWUpOyBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW0gdG8gYmUgYSBudW1iZXIgb3IgdmFyaWFibGUgYnV0IHJlY2VpdmVkOiBcIitpdGVtLnZhbHVlKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsfCBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvcik6IGl0ZW0gaXMgVG9rZW4gfCBNYXRoR3JvdXAgfCBNYXRoSmF4T3BlcmF0b3IgPT4gaXRlbSAhPT0gbnVsbCk7XHJcbiAgICByZXR1cm4gZm9ybWF0dGVkSXRlbXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHR5cGVDaGVja01hdGhHcm91cEl0ZW1zKGl0ZW1zOiBhbnkpOiBpdGVtcyBpcyBNYXRoR3JvdXBJdGVtW10ge1xyXG4gICAgaWYoIUFycmF5LmlzQXJyYXkoaXRlbXMpKXtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdpdGVtcycsaXRlbXMpXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgYnV0IHJlY2VpdmVkOiBcIitpdGVtcyk7XHJcbiAgICB9XHJcbiAgICBpdGVtcy5tYXAoKGl0ZW06IGFueSkgPT4ge1xyXG4gICAgICAgIGlmKEFycmF5LmlzQXJyYXkoaXRlbSkpe1xyXG4gICAgICAgICAgICB0eXBlQ2hlY2tNYXRoR3JvdXBJdGVtcyhpdGVtKTtyZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKCEoaXRlbSBpbnN0YW5jZW9mIFRva2VufHxpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwfHxpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSl7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ2l0ZW0nLGl0ZW0pXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW1zIHRvIGJlIGFuIGFycmF5IG9mIFRva2VuLCBNYXRoR3JvdXAsIG9yIE1hdGhKYXhPcGVyYXRvciBidXQgcmVjZWl2ZWQ6IFwiK2l0ZW1zKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0cnVlO1xyXG59XHJcbmZ1bmN0aW9uIHNob3VsZEFkZFBsdXMoZ3JvdXAxPzogYW55LGdyb3VwMj86IGFueSl7XHJcbiAgICBpZighZ3JvdXAxfHwhZ3JvdXAyKXJldHVybiAnJztcclxuXHJcbiAgICByZXR1cm4gJysnO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYW5Db21iaW5lKG1hdGg6IE1hdGhHcm91cCxvcGVyYXRvcjogTWF0aEpheE9wZXJhdG9yKXtcclxuXHJcbn1cclxuZXhwb3J0IGNsYXNzIE1hdGhKYXhPcGVyYXRvcntcclxuICAgIG9wZXJhdG9yOiBzdHJpbmc7XHJcbiAgICBncm91cE51bTogbnVtYmVyPTE7XHJcbiAgICBncm91cHM6IE1hdGhHcm91cFtdO1xyXG4gICAgc29sdXRpb246IE1hdGhHcm91cDtcclxuICAgIGNvbW11dGF0aXZlOiBib29sZWFuO1xyXG4gICAgaXNPcGVyYWJsZTogYm9vbGVhbj10cnVlO1xyXG4gICAgY29uc3RydWN0b3Iob3BlcmF0b3I/OiBzdHJpbmcsZ3JvdXBOdW0/OiBudW1iZXIsZ3JvdXBzPzogTWF0aEdyb3VwW10sc29sdXRpb24/OiBNYXRoR3JvdXAsaXNPcGVyYWJsZT86IGJvb2xlYW4pe1xyXG4gICAgICAgIGlmIChvcGVyYXRvcil0aGlzLm9wZXJhdG9yPW9wZXJhdG9yO1xyXG4gICAgICAgIGlmKGdyb3VwTnVtKXRoaXMuZ3JvdXBOdW09Z3JvdXBOdW07XHJcbiAgICAgICAgaWYoZ3JvdXBzKXRoaXMuZ3JvdXBzPWdyb3VwcztcclxuICAgICAgICBpZihzb2x1dGlvbil0aGlzLnNvbHV0aW9uPXNvbHV0aW9uO1xyXG4gICAgICAgIGlmKGlzT3BlcmFibGUpdGhpcy5pc09wZXJhYmxlPWlzT3BlcmFibGU7XHJcbiAgICB9XHJcbiAgICB0ZXN0R3JvdXBzKHRlc3Q6IChncm91cDogTWF0aEdyb3VwKSA9PiBib29sZWFuKTpib29sZWFuW117XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JvdXBzLm1hcChnPT4gdGVzdChnKSk7XHJcbiAgICB9XHJcbiAgICBtYXBWYXJpYWJsZXMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmhhc1ZhcmlhYmxlcygpKVxyXG4gICAgfVxyXG4gICAgc3RhdGljIGFzVmFyaWFibGVHcm91cChvY2N1cnJlbmNlc0NvdW50OiBudW1iZXIsdmFyaWFibGU6IHN0cmluZyl7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRoSmF4T3BlcmF0b3IoJ011bHRpcGxpY2F0aW9uJywyLFtuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4ob2NjdXJyZW5jZXNDb3VudCldKSxuZXcgTWF0aEdyb3VwKFtuZXcgVG9rZW4odmFyaWFibGUpXSldKVxyXG4gICAgfVxyXG4gICAgaXNWYXJpYWJsZUdyb3VwKCk6IGJvb2xlYW57XHJcbiAgICAgICAgY29uc3QgdGVzdExldmVscz10aGlzLnRlc3RHcm91cHMoKGl0ZW06IE1hdGhHcm91cCk6IGJvb2xlYW4gPT4ge3JldHVybiBpdGVtLnNpbmd1bGFyKCl9KVxyXG4gICAgICAgIGNvbnN0IHRlc3RWYXI9dGhpcy5tYXBWYXJpYWJsZXMoKVxyXG4gICAgICAgIGNvbnN0IGlzU2luZ2xlVHJ1ZUluVGVzdFZhciA9IHRlc3RWYXIuZmlsdGVyKEJvb2xlYW4pLmxlbmd0aCA9PT0gMTtcclxuICAgICAgICByZXR1cm4gaXNTaW5nbGVUcnVlSW5UZXN0VmFyICYmIHRlc3RMZXZlbHMuZXZlcnkoKHQ6IGJvb2xlYW4pID0+IHQpO1xyXG4gICAgfVxyXG5cclxuICAgIG9wZXJhdG9yVmFyaWFibGVzKCk6IHN0cmluZ1tdIHtcclxuICAgICAgICByZXR1cm4gWy4uLm5ldyBTZXQodGhpcy5ncm91cHNcclxuICAgICAgICAgICAgLm1hcChncm91cCA9PiBncm91cC5ncm91cFZhcmlhYmxlcygpKVxyXG4gICAgICAgICAgICAuZmxhdCgpXHJcbiAgICAgICAgKV07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGdldFZhcmlhYmxlR3JvdXA/KCl7XHJcbiAgICAgICAgaWYoIXRoaXMuaXNWYXJpYWJsZUdyb3VwKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3Qgb2NjdXJyZW5jZXNDb3VudD10aGlzLmdyb3Vwc1xyXG4gICAgICAgIC5tYXAoZz0+IGcuZ2V0T3BlcmFibGVWYWx1ZSgpKVxyXG4gICAgICAgIC5maWx0ZXIoKHQ6IGFueSkgPT4gdCE9PW51bGwpXHJcbiAgICAgICAgLnJlZHVjZSgodG90YWw6IGFueSwgaXRlbTogYW55KSA9PiB0b3RhbCArIGl0ZW0sIDApO1xyXG5cclxuICAgICAgICBjb25zdCB2YXJpYWJsZT10aGlzLm9wZXJhdG9yVmFyaWFibGVzKClbMF07XHJcbiAgICAgICAgcmV0dXJuIHtvY2N1cnJlbmNlc0NvdW50LHZhcmlhYmxlfVxyXG4gICAgfVxyXG4gICAgYWRkVG9WYXJpYWJsZUdyb3VwKHZhbHVlOiBudW1iZXIpe1xyXG4gICAgICAgIGlmKCF0aGlzLmlzVmFyaWFibGVHcm91cCkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IG51bWJlciA9IHRoaXMuZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuc2luZ2xlTnVtYmVyKCkpXHJcbiAgICAgICAgaWYoIW51bWJlcikgcmV0dXJuO1xyXG4gICAgICAgIG51bWJlci5zaW5nbGVUb2tlblNldCh2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgYWxsR3JvdXBzQXJlU2ltaWxhcigpe1xyXG5cclxuICAgIH1cclxuICAgIGlzVmFyKCl7fVxyXG4gICAgaXNSb290TGV2ZWwoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWVwdGgoKS5tYXg9PT0wO1xyXG4gICAgfVxyXG4gICAgY2xvbmUoKSB7XHJcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gdGhpcy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmNsb25lKCkpO1xyXG4gICAgICAgIGNvbnN0IHNvbHV0aW9uID0gdGhpcy5zb2x1dGlvbiA/IHRoaXMuc29sdXRpb24uY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcih0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xyXG4gICAgfVxyXG4gICAgZ2V0RGVlcHRoKCl7XHJcbiAgICAgICAgbGV0IGRlZXB0aHM6IG51bWJlcltdPVtdO1xyXG4gICAgICAgIHRoaXMuZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xyXG4gICAgICAgICAgICBkZWVwdGhzLnB1c2goZ3JvdXAuZ2V0RGVlcHRoKCkubWF4KVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiB7bWF4OiBNYXRoLm1heCguLi5kZWVwdGhzKSwgZGVlcHRoczogZGVlcHRoc31cclxuICAgIH1cclxuICAgIHNldEdyb3VwKGdyb3VwOiBNYXRoR3JvdXAsaW5kZXg6bnVtYmVyKXt0aGlzLmdyb3Vwc1tpbmRleF09Z3JvdXB9XHJcbiAgICB0b1N0cmluZ1NvbHV0aW9uKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoKSsnID0gJyt0aGlzLnNvbHV0aW9uLnRvU3RyaW5nKCk7XHJcbiAgICB9XHJcbiAgICBnZXRJZCgpe3JldHVybiAnb3BlcmF0b3I6Jyt0aGlzLm9wZXJhdG9yfVxyXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XHJcbiAgICAgICAgZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBNYXRoR3JvdXAsIHdyYXA6IEJyYWNrZXRUeXBlLG9wdGlvbmFsOiBib29sZWFuKTogc3RyaW5nIHtcclxuICAgICAgICAgICAgaWYob3B0aW9uYWwmJmdyb3VwLnNpbmd1bGFyKCkpcmV0dXJuIGdyb3VwLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwU3RyPWdyb3VwLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcilcclxuICAgICAgICAgICAgc3dpdGNoICh3cmFwKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLlBhcmVudGhlc2VzOlxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgKCR7Z3JvdXBTdHJ9KWA7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLkN1cmx5QnJhY2VzOlxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgeyR7Z3JvdXBTdHJ9fWA7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBncm91cFN0cjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBzZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMub3BlcmF0b3IpO1xyXG4gICAgICAgIGlmICghbWV0YWRhdGEpIHJldHVybiAnJztcclxuICAgICAgICBpZihtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9ucz4yfHxtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uczwxKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIG51bWJlciBvZiBwb3NpdGlvbnMgZm9yIGFzc29jaWF0aXZpdHk6ICR7bWV0YWRhdGEuYXNzb2NpYXRpdml0eS5udW1Qb3NpdGlvbnN9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvcGVyYXRvciA9IG1ldGFkYXRhLmxhdGV4O1xyXG4gICAgICAgIGxldCBpbmRleD0wO1xyXG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcclxuXHJcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsdHJ1ZSkuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGl0ZW0pXHJcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4LTFdLHRoaXMuZ3JvdXBzW2luZGV4XSkrd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XSwgaXRlbS5icmFja2V0VHlwZSwgaXRlbS5pc0JyYWNrZXRPcHRpb25hbCk7XHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcclxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyxmYWxzZSkuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XHJcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4XSx0aGlzLmdyb3Vwc1tpbmRleCsxXSkrd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XSwgaXRlbS5icmFja2V0VHlwZSwgaXRlbS5pc0JyYWNrZXRPcHRpb25hbCk7XHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChjdXN0b21Gb3JtYXR0ZXIpIFxyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgdHlwZSBNYXRoR3JvdXBJdGVtPVRva2VufE1hdGhHcm91cHxNYXRoSmF4T3BlcmF0b3JcclxuZXhwb3J0IGNsYXNzIE1hdGhHcm91cCB7XHJcbiAgICBwcml2YXRlIGl0ZW1zOiBNYXRoR3JvdXBJdGVtW10gPSBbXTtcclxuICAgIC8vb3ZlcnZpZXc6IE1hdGhPdmVydmlld1xyXG4gICAgXHJcbiAgICBjb25zdHJ1Y3RvcihpdGVtcz86IE1hdGhHcm91cEl0ZW1bXSkge1xyXG4gICAgICAgIGlmKGl0ZW1zKXRoaXMuc2V0SXRlbXMoaXRlbXMpO1xyXG4gICAgfVxyXG4gICAgZ2V0SXRlbXMoKTogTWF0aEdyb3VwSXRlbVtdIHtyZXR1cm4gdGhpcy5pdGVtczt9XHJcbiAgICBzZXRJdGVtKGl0ZW06IE1hdGhHcm91cEl0ZW0saW5kZXg6bnVtYmVyKXtcclxuICAgICAgICB0aGlzLml0ZW1zW2luZGV4XT1pdGVtO1xyXG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKVxyXG4gICAgfVxyXG4gICAgc2V0SXRlbXMoaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSkge1xyXG4gICAgICAgIHR5cGVDaGVja01hdGhHcm91cEl0ZW1zKHRoaXMuaXRlbXMpXHJcbiAgICAgICAgdGhpcy5pdGVtcyA9IGl0ZW1zO1xyXG4gICAgICAgIHRoaXMudXBkYXRlT3ZlcnZpZXcoKSAgICBcclxuICAgIH1cclxuICAgIGNvbWJpbmVTaW1pbGFyVmFsdWVzKCl7XHJcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXc9bmV3IE1hdGhPdmVydmlldygpXHJcbiAgICAgICAgb3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKVxyXG4gICAgICAgIGxldCBuZXdJdGVtczogTWF0aEdyb3VwSXRlbVtdID0gW107XHJcbiAgICAgICAgaWYgKG92ZXJ2aWV3Lm51bWJlcil7XHJcbiAgICAgICAgICAgIG5ld0l0ZW1zLnB1c2gobmV3IFRva2VuKG92ZXJ2aWV3Lm51bWJlcikpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBvdmVydmlldy52YXJpYWJsZXMuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgIGlmICh2YWx1ZS5jb3VudCA+IDEpIHtcclxuICAgICAgICAgICAgICAgIG5ld0l0ZW1zLnB1c2goTWF0aEpheE9wZXJhdG9yLmFzVmFyaWFibGVHcm91cCh2YWx1ZS5jb3VudCwga2V5KSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBuZXdJdGVtcy5wdXNoKG5ldyBUb2tlbihrZXkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuXHJcbiAgICB9XHJcbiAgICBncm91cFZhcmlhYmxlcygpOiBzdHJpbmdbXSB7XHJcbiAgICAgICAgY29uc3QgdmFyaWFibGVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuICYmIGl0ZW0uaXNWYXIoKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5nZXRTdHJpbmdWYWx1ZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF2YXJpYWJsZXMuY29udGFpbnMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlcy5wdXNoKGtleSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gdmFyaWFibGVzO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZU92ZXJ2aWV3KCl7LypcclxuICAgICAgICB0aGlzLm92ZXJ2aWV3PW5ldyBNYXRoT3ZlcnZpZXcoKVxyXG4gICAgICAgIHRoaXMub3ZlcnZpZXcuZGVmaW5lT3ZlcnZpZXdzZXBhcmF0ZUludG9JbmRpdmlkdWFscyh0aGlzLml0ZW1zKSovXHJcbiAgICB9XHJcbiAgICBzaW5nbGVUb2tlblNldCh2YWx1ZTogbnVtYmVyKXtcclxuICAgICAgICBjb25zdCB0b2tlbj10aGlzLml0ZW1zWzBdIGFzIFRva2VuO1xyXG4gICAgICAgIGlmKHRoaXMuc2luZ3VsVG9rZW4oKSl7XHJcbiAgICAgICAgICAgIHRva2VuLnNldFZhbHVlKHZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBNYXRoR3JvdXAge1xyXG4gICAgICAgIHJldHVybiBuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXMubWFwKGl0ZW09Pml0ZW0uY2xvbmUoKSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGhhc09wZXJhdG9yKCk6IHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpO31cclxuICAgIGRvZXNudEhhdmVPcGVyYXRvcigpOiAgdGhpcyBpcyB7IGl0ZW1zOiBBcnJheTxUb2tlbiB8IE1hdGhHcm91cD4gfSB7cmV0dXJuICF0aGlzLmhhc09wZXJhdG9yKCk7fVxyXG4gICAgZGVlcEhhc09wZXJhdG9yKCl7XHJcbiAgICAgICAgY29uc3QgbWFwPXRoaXMuaXRlbXMubWFwKChpdGVtKTogYm9vbGVhbiA9PiB7XHJcbiAgICAgICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uZGVlcEhhc09wZXJhdG9yKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKXJldHVybiB0cnVlXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBtYXAuc29tZSgodDogYm9vbGVhbik9PnQpXHJcbiAgICB9XHJcbiAgICBzaW5nbGVOdW1iZXIoKXtyZXR1cm4gdGhpcy5zaW5ndWxhcigpJiZ0aGlzLm51bWJlck9ubHkoKX1cclxuICAgIG51bWJlck9ubHkoKTogYm9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMuZXZlcnkodCA9PiAodCBpbnN0YW5jZW9mIFRva2VuJiYhdC5pc1ZhcigpKSk7fVxyXG4gICAgaGFzVmFyaWFibGVzKCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiB0IGluc3RhbmNlb2YgVG9rZW4mJnQuaXNWYXIoKSk7fVxyXG5cclxuICAgIHNpbmd1bGFyKCk6Ym9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoID09PSAxICYmIHRoaXMuaXRlbXNbMF0gIT09IHVuZGVmaW5lZDt9XHJcbiAgICBzaW5ndWxUb2tlbigpOiB0aGlzIGlzIHsgaXRlbXM6IFtUb2tlbl0gfSB7cmV0dXJuIHRoaXMuc2luZ3VsYXIoKSAmJiB0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW47fVxyXG4gICAgaXNSb290TGV2ZWwoKXtyZXR1cm4gdGhpcy5pdGVtcy5ldmVyeSgoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIFRva2VuKTt9XHJcbiAgICBleHRyZW1lU2ltcGxpZnlBbmRHcm91cCgpe1xyXG4gICAgICAgIHRoaXMudHJ5UmVtb3ZlVW5uZWNlc3NhcnlOZXN0ZWQoKTtcclxuICAgICAgICB0aGlzLmNvbWJpbmluZ0xpa2VUZXJtcygpXHJcbiAgICB9XHJcblxyXG4gICAgdHJ5UmVtb3ZlVW5uZWNlc3NhcnlOZXN0ZWQoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2luZ3VsYXIoKSkge1xyXG4gICAgICAgICAgICBpZih0aGlzLml0ZW1zWzBdIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXRlbXMgPSB0aGlzLml0ZW1zWzBdLml0ZW1zO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW0udHJ5UmVtb3ZlVW5uZWNlc3NhcnlOZXN0ZWQoKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGdldERlZXB0aCgpe1xyXG4gICAgICAgIGxldCBkZWVwdGhzOiBudW1iZXJbXT1bXTtcclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbil7XHJcbiAgICAgICAgICAgICAgICBkZWVwdGhzLnB1c2goMCk7cmV0dXJuO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBkZWVwdGhzLnB1c2goaXRlbS5nZXREZWVwdGgoKS5tYXgrMSlcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4ge21heDogTWF0aC5tYXgoLi4uZGVlcHRocyksIGRlZXB0aHM6IGRlZXB0aHN9XHJcbiAgICB9XHJcbiAgICBpc09wZXJhYmxlKCl7cmV0dXJuIHRydWV9XHJcblxyXG4gICAgZ2V0T3BlcmFibGVWYWx1ZSgpOiBudW1iZXIgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy50cnlSZW1vdmVVbm5lY2Vzc2FyeU5lc3RlZCgpO1xyXG4gICAgICAgIHRoaXMuY29tYmluaW5nTGlrZVRlcm1zKCk7XHJcbiAgICAgICAgY29uc3QgaXRlbXMgPSB0aGlzLml0ZW1zO1xyXG4gICAgICAgIGlmICh0aGlzLm51bWJlck9ubHkoKSkge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWU9MDtcclxuICAgICAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbTogVG9rZW4pID0+IHtcclxuICAgICAgICAgICAgICAgIHZhbHVlICs9IGl0ZW0uZ2V0TnVtYmVyVmFsdWUoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBnZXRJZCgpe1xyXG4gICAgICAgIHJldHVybiAnTWF0aEdyb3VwJ1xyXG4gICAgfVxyXG4gICAgcmVtb3ZlTmVzdGVkKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLmRlZXBIYXNPcGVyYXRvcigpKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICBsZXQgaXRlbXM6IFRva2VuW10gPSBbXTtcclxuICAgIFxyXG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwIHwgVG9rZW4pID0+IHtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBUb2tlbikge1xyXG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcclxuICAgICAgICAgICAgICAgIGl0ZW0ucmVtb3ZlTmVzdGVkKCk7XHJcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKC4uLihpdGVtLml0ZW1zIGFzIFRva2VuW10pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLml0ZW1zID0gaXRlbXM7XHJcbiAgICBcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICAgIGNvbWJpbmluZ0xpa2VUZXJtcygpIHsvKlxyXG4gICAgICAgIGNvbnN0IG92ZXJ2aWV3PXRoaXMubGV2ZWxNYXAoKVxyXG4gICAgICAgIGNvbnN0IGNvbWJpbmVkSXRlbXMgPSBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBvdmVydmlldy5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgaWYgKGtleS5pbmNsdWRlcyhcIm9wZXJhdG9yXCIpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21iaW5lZEl0ZW1zLnB1c2goLi4udmFsdWUuaXRlbXMpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3Qgc3VtID0gdmFsdWUuaXRlbXMucmVkdWNlKCh0b3RhbDogYW55LCBpdGVtOiBUb2tlbikgPT4gdG90YWwgKyAoaXRlbS5nZXRWYWx1ZT9pdGVtLmdldFZhbHVlKCk6IDApLCAwKTtcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBUb2tlbihzdW0sIHZhbHVlLnZhcmlhYmxlPz91bmRlZmluZWQpO1xyXG4gICAgICAgICAgICBjb21iaW5lZEl0ZW1zLnB1c2godG9rZW4pO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zID0gY29tYmluZWRJdGVtczsqL1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcj86IChjaGVjazogYW55LHN0cmluZzogc3RyaW5nKSA9PiBhbnkpe1xyXG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XHJcbiAgICAgICAgaWYoIUFycmF5LmlzQXJyYXkodGhpcy5pdGVtcykpe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpdGVtcyB0byBiZSBhbiBhcnJheSBidXQgcmVjZWl2ZWQ6IFwiK3RoaXMuaXRlbXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHN0cmluZys9c2hvdWxkQWRkUGx1cyh0aGlzLml0ZW1zW2luZGV4LTFdLGl0ZW0pXHJcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBgKCR7aXRlbS50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpfSlgO1xyXG4gICAgICAgICAgICB9ICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZyArPSBpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XHJcbiAgICAgICAgICAgIH0gaWYgKGN1c3RvbUZvcm1hdHRlcikge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nID0gY3VzdG9tRm9ybWF0dGVyKGl0ZW0sc3RyaW5nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmc7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5jbGFzcyBNYXRoT3ZlcnZpZXcge1xyXG4gICAgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBhbnk+O1xyXG4gICAgb3BlcmF0b3JzOiBNYXA8c3RyaW5nLCBhbnk+O1xyXG4gICAgbnVtYmVyOiBudW1iZXI7XHJcbiAgICBtYXRoR3JvdXBzOiBNYXRoR3JvdXBbXT1bXTtcclxuICAgIGNvbnN0cnVjdG9yKHZhcmlhYmxlcz86IE1hcDxzdHJpbmcsIGFueT4sb3BlcmF0b3JzPzogTWFwPHN0cmluZywgYW55PixudW1iZXI/OiBudW1iZXIsbWF0aEdyb3Vwcz86IE1hdGhHcm91cFtdKXtcclxuICAgICAgICBpZih2YXJpYWJsZXMpdGhpcy52YXJpYWJsZXM9dmFyaWFibGVzO1xyXG4gICAgICAgIGlmKG9wZXJhdG9ycyl0aGlzLm9wZXJhdG9ycz1vcGVyYXRvcnM7XHJcbiAgICAgICAgaWYobnVtYmVyKXRoaXMubnVtYmVyPW51bWJlcjtcclxuICAgICAgICBpZihtYXRoR3JvdXBzKXRoaXMubWF0aEdyb3Vwcz1tYXRoR3JvdXBzO1xyXG4gICAgfVxyXG4gICAgZGVmaW5lT3ZlcnZpZXdTZXBhcmF0ZUludG9JbmRpdmlkdWFscyhpdGVtczogTWF0aEdyb3VwSXRlbVtdKSB7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZXM9bmV3IE1hcCgpO1xyXG4gICAgICAgIHRoaXMub3BlcmF0b3JzPW5ldyBNYXAoKTtcclxuXHJcbiAgICAgICAgaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmaXRlbS5pc1ZhcigpOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVmFyaWFibGVzTWFwKGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGl0ZW0gaW5zdGFuY2VvZiBUb2tlbiYmIWl0ZW0uaXNWYXIoKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZU11bWJlcihpdGVtLmdldE51bWJlclZhbHVlKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlT3BlcmF0b3JzTWFwKGl0ZW0ub3BlcmF0b3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWF0aEdyb3Vwcy5wdXNoKGl0ZW0pXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gY2F0ZWdvcnkgaW4gTWF0aE92ZXJ2aWV3IHNlcGFyYXRlSW50b0luZGl2aWR1YWxzXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfVxyXG4gICAgdXBkYXRlTXVtYmVyKG51bWJlcjogbnVtYmVyKXsgdGhpcy5udW1iZXI9dGhpcy5udW1iZXI/dGhpcy5udW1iZXIrbnVtYmVyOm51bWJlcjt9XHJcbiAgICB1cGRhdGVWYXJpYWJsZXNNYXAoa2V5OiBzdHJpbmcpe1xyXG4gICAgICAgIGlmKCF0aGlzLnZhcmlhYmxlcykgdGhpcy52YXJpYWJsZXM9bmV3IE1hcCgpO1xyXG4gICAgICAgIGlmKCF0aGlzLnZhcmlhYmxlcy5oYXMoa2V5KSl7dGhpcy52YXJpYWJsZXMuc2V0KGtleSx7Y291bnQ6IDAsIGl0ZW1zOiBbXX0pfVxyXG4gICAgICAgIHRoaXMudmFyaWFibGVzLmdldChrZXkpLmNvdW50Kys7XHJcbiAgICB9XHJcbiAgICB1cGRhdGVPcGVyYXRvcnNNYXAoa2V5OiBzdHJpbmcpe1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycykgdGhpcy5vcGVyYXRvcnM9bmV3IE1hcCgpO1xyXG4gICAgICAgIGlmKCF0aGlzLm9wZXJhdG9ycy5oYXMoa2V5KSl7dGhpcy5vcGVyYXRvcnMuc2V0KGtleSx7Y291bnQ6IDAsIGl0ZW1zOiBbXX0pfVxyXG4gICAgICAgIHRoaXMub3BlcmF0b3JzLmdldChrZXkpLmNvdW50Kys7XHJcbiAgICB9XHJcbiAgICBoYXNWYXIoKXtyZXR1cm4gdGhpcy52YXJpYWJsZXMmJnRoaXMudmFyaWFibGVzLnNpemU+MH1cclxuICAgIGhhc09wKCl7cmV0dXJuIHRoaXMub3BlcmF0b3JzJiZ0aGlzLm9wZXJhdG9ycy5zaXplPjB9XHJcbiAgICBoYXNHcm91cCgpe3JldHVybiB0aGlzLm1hdGhHcm91cHMubGVuZ3RoPjB9XHJcbiAgICBvbmx5TnVtZXJpYygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLm51bWJlciYmIXRoaXMuaGFzVmFyKCkmJiF0aGlzLmhhc09wKCkmJiF0aGlzLmhhc0dyb3VwKClcclxuICAgIH1cclxuICAgIGRlZXBOdW1lcmljKCl7XHJcblxyXG4gICAgfVxyXG4gICAgZXhwbG9yQWxsTGV2ZWxzKCl7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRva2Vue1xyXG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyfHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOm51bWJlcnxzdHJpbmcpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICB9XHJcbiAgICBnZXROdW1iZXJWYWx1ZSgpOm51bWJlcntyZXR1cm4gKHRoaXMudmFsdWUgYXMgbnVtYmVyKX1cclxuICAgIGdldFN0cmluZ1ZhbHVlKCk6c3RyaW5ne3JldHVybiAodGhpcy52YWx1ZSBhcyBzdHJpbmcpfVxyXG4gICAgZ2V0VmFsdWUoKXtyZXR1cm4gdGhpcy52YWx1ZX1cclxuICAgIHNldFZhbHVlKHZhbHVlOiBudW1iZXJ8c3RyaW5nKXt0aGlzLnZhbHVlPXZhbHVlO31cclxuICAgIGlzVmFyKCkge3JldHVybiB0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZyc7fVxyXG4gICAgXHJcbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcclxuICAgICAgICBsZXQgc3RyaW5nPScnXHJcbiAgICAgICAgaWYoIXRoaXMuaXNWYXIoKSYmdGhpcy5nZXROdW1iZXJWYWx1ZSgpPDApXHJcbiAgICAgICAgICAgIHN0cmluZys9Jy0nO1xyXG4gICAgICAgIHN0cmluZys9dGhpcy52YWx1ZTtcclxuICAgICAgICBpZihjdXN0b21Gb3JtYXR0ZXIpe1xyXG4gICAgICAgICAgICByZXR1cm4gY3VzdG9tRm9ybWF0dGVyKHRoaXMsc3RyaW5nKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc3RyaW5nO1xyXG4gICAgfVxyXG4gICAgY2xvbmUoKXtyZXR1cm4gbmV3IFRva2VuKHRoaXMudmFsdWUpfVxyXG59XHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbnN7XHJcbiAgICB0b2tlbnM6IEFycmF5PEJhc2ljTWF0aEpheFRva2VufFBhcmVuPj1bXTtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IodG9rZW5zPzogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+KXtcclxuICAgICAgICB0aGlzLnRva2Vucz10b2tlbnN8fFtdO1xyXG4gICAgfVxyXG4gICAgYWRkSW5wdXQobWF0aDogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUobWF0aDogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnM9YXJyVG9SZWdleFN0cmluZyhnZXRBbGxNYXRoSmF4UmVmZXJlbmNlcygpKVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKHJlZ0V4cCgnXicgKyBvcGVyYXRvcnMpKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGU9L1tcXChcXCldLy50ZXN0KG1hdGNoWzBdKT8ncGFyZW4nOidvcGVyYXRvcidcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3ICBCYXNpY01hdGhKYXhUb2tlbih0eXBlLG1hdGNoWzBdKSk7XHJcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaCgvXihbMC05Ll0rKS8pOy8vKFthLXpBLVpdPykvKTtcclxuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpXHJcbiAgICAgICAgICAgIHsgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oJ251bWJlcicscGFyc2VGbG9hdChtYXRjaFswXSkpKTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPW1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKyhfXFwoW2EtekEtWjAtOV0qXFwpKSovKVxyXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljTWF0aEpheFRva2VuKFwidmFyaWFibGVcIixtYXRjaFswXSkpXHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcclxuICAgICAgICB9XHJcbiAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICAgdGhpcy50b2tlbnM9aWRQYXJlbnRoZXNlcyh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxyXG5cclxuICAgICAgICBwYXJlbk1hcC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYiAtIGEpXHJcbiAgICAgICAgLmZvckVhY2goKHZhbHVlOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHZhbHVlLCAwLCBuZXcgIEJhc2ljTWF0aEpheFRva2VuKCdvcGVyYXRvcicsJyonKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKVxyXG4gICAgfVxyXG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpIHtcclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCl8fCEodGhpcy50b2tlbnNbaW5kZXhdIGluc3RhbmNlb2YgUGFyZW4pKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGZpbmRQYXJlbkluZGV4KGluZGV4LHRoaXMudG9rZW5zKT8ub3BlbjtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoaWR4ID09IG51bGwgfHwgIWlzT3BlblBhcmVuKHRoaXMudG9rZW5zW2luZGV4ICsgMV0pKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbaWR4IC0gMV07XHJcbiAgICBcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgIGlkeCA+IDAgJiZcclxuICAgICAgICAgICAgICAgIHByZXZUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmXHJcbiAgICAgICAgICAgICAgICAhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KFsxLCAyXSkuaW5jbHVkZXMocHJldlRva2VuLnZhbHVlPy50b1N0cmluZygpIHx8ICcnKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH07XHJcbiAgICBcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcclxuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdG9rZW4uaXNWYWx1ZVRva2VuKCk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb25zdCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb249KHRva2VuOiBhbnkpPT57XHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0eXBlb2YgdG9rZW4udmFsdWU9PT0nc3RyaW5nJyYmaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSlcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaXNWYXI9KHRva2VuOiBhbnkpPT57cmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiZ0b2tlbi50eXBlPT09J3ZhcmlhYmxlJ31cclxuICAgICAgICBjb25zdCBwcmVjZWRlc1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIGluZGV4PjAmJmlzVmFyKHRva2Vuc1tpbmRleF0pXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBmb2xsb3dzVmFyaWFibGUgPSAodG9rZW5zOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gaW5kZXg8dG9rZW5zLmxlbmd0aC0xJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLm1hcCgodG9rZW4sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNPcGVuUGFyZW4odG9rZW4pfHwgY2hlY2tJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuKXx8cHJlY2VkZXNWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNDbG9zZWRQYXJlbih0b2tlbil8fGZvbGxvd3NWYXJpYWJsZSh0aGlzLnRva2VucyxpbmRleCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggKyAxKSB8fCB0ZXN0RG91YmxlUmlnaHQoaW5kZXgpID8gaW5kZXggKyAxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICBjb25zb2xlLmxvZyh0aGlzLnRva2VucyxtYXApXHJcbiAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XHJcbiAgICAgICAgLy8gUGx1c2VzIGFyZSBzZXBhcmF0b3JzLlRoZXJlZm9yZSwgdGhleSBkbyBub3QgbmVlZCB0byBiZSBoZXJlIEFzIHRoZSBleHByZXNzaW9uIGlzIHRva2VuW11cclxuICAgICAgICAvL01pbnVzZXMgb24gdGhlIG90aGVyIGhhbmQuY2FuIGVpdGhlciBiZSBhIHNlcGFyYXRvci4gT3IgYSBuZWdhdGl2ZSBzaWduXHJcbiAgICAgICAgY29uc3QgcGx1c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdBZGRpdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcclxuICAgICAgICBwbHVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwxKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1pbnVzTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IEJhc2ljTWF0aEpheFRva2VuLCBpbmRleDogYW55KSA9PiB0b2tlbi52YWx1ZSA9PT0gJ1N1YnRyYWN0aW9uJz9pbmRleCA6IG51bGwpLmZpbHRlcigoaW5kZXg6IG51bWJlciB8IG51bGwpID0+IGluZGV4ICE9PSBudWxsKVxyXG4gICAgICAgIFxyXG4gICAgICAgIG1pbnVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRUb2tlbiA9IHRoaXMudG9rZW5zW2luZGV4ICsgMV07XHJcbiAgICAgICAgICAgIGlmIChuZXh0VG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJiB0eXBlb2YgbmV4dFRva2VuLnZhbHVlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgIG5leHRUb2tlbi52YWx1ZSAqPSAtMTtcclxuICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcixtYXJnaW4/OiBudW1iZXIpe1xyXG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XHJcbiAgICAgICAgcmV0dXJuIGluZGV4Pj0wK21hcmdpbiYmaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLW1hcmdpbjtcclxuICAgIH1cclxuICAgIGNsb25lKCk6IEJhc2ljTWF0aEpheFRva2VucyB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBCYXNpY01hdGhKYXhUb2tlbnModGhpcy50b2tlbnMubWFwKHRva2VuID0+IHRva2VuLmNsb25lKCkpKTtcclxuICAgIH1cclxuICAgIC8qXHJcbiAgICBcclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKXtcclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgaWR4PWZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XHJcbiAgICAgICAgICAgIHJldHVybiBpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCsxXSkmJihpZHg9PT0wfHwhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMudG9rZW5zW2lkeC0xXT8udmFsdWUpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKFRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4pfHwhdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBudW1iZXIpID0+IHsgXHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IFwiKFwiIHx8IChoYXNJbXBsaWNpdE11bHRpcGxpY2F0aW9uKHRva2VuLnZhbHVlKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09IFwiKVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4ICsgMSkgfHx0ZXN0RG91YmxlUmlnaHQoaW5kZXgpPyBpbmRleCsxIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKTtcclxuICAgICAgICByZXR1cm4gbWFwO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgbWFwUGFyZW5JbmRleGVzKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09IFwiKFwiID8gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICB9XHJcblxyXG4gICAgZmlsdGVyUGFyZW5JbmRleGVzRm9yUmVtb3ZhbCgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tYXBQYXJlbkluZGV4ZXMoKVxyXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHsgb3Blbjogb3BlbkluZGV4LCBjbG9zZTogY2xvc2VJbmRleCB9ID0gaXRlbTtcclxuICAgICAgICAgICAgICAgIGlmIChvcGVuSW5kZXggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdPy50eXBlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKGNsb3NlSW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2Nsb3NlSW5kZXggKyAxXT8uaXNWYWx1ZVRva2VuKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9KS5mbGF0TWFwKChpdGVtOiBhbnkpID0+IFtpdGVtLm9wZW4sIGl0ZW0uY2xvc2VdKTtcclxuICAgIH0gICAgXHJcbiAgICBcclxuICAgIFxyXG4gICAgZmluZFNpbWlsYXJTdWNjZXNzb3IodG9rZW5zKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcclxuICAgICAgICAgICAgICAgICYmKHRoaXMudG9rZW5Db21wYXJlKFwidHlwZVwiLHRoaXMudmFsdWVUb2tlbnMoKSwgdG9rZW4sIHRva2Vuc1tpbmRleCArIDFdKSlcclxuICAgICAgICApKTtcclxuICAgICB9XHJcbiAgICBcclxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKHRva2VuIGluc3RhbmNlb2YgVG9rZW4pKXtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKF86IGFueSwgaWR4OiB1bmtub3duKSA9PiAhbWFwLmhhcyhpZHgpKTtcclxuICAgICAgICAvL1Byb2JsZW0gd2l0aCAgPSBhcyBpdCdzIGFmZmVjdGluZyB0aGUgdmFyaWFibGUgYmVmb3JlIGl0XHJcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggLSAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKSAmJlxyXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG51bU1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0nbnVtYmVyJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBjb25zdCB2YXJNYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J3ZhcmlhYmxlJyYmY2hlY2soaW5kZXgpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBhcnIgPSBbXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhudW1NYXApLCBcclxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpXHJcbiAgICAgICAgXHJcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcclxuICAgIH1cclxuXHJcbiAgICBcclxuXHJcbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh0aGlzLnRva2VucykgXHJcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgICAgICYmICF0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSBcIj1cIilcclxuICAgICAgICApXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgIH1cclxuXHJcbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQ6IGFueSwgbGVuZ3RoOiBudW1iZXIsIG9iamVjdHM6IGFueVtdIHwgVG9rZW4pIHtcclxuICAgICAgICBvYmplY3RzID0gZmxhdHRlbkFycmF5KG9iamVjdHMpO1xyXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXhwZWN0ZWQgYG9iamVjdHNgIHRvIGJlIGFuIGFycmF5LCBidXQgcmVjZWl2ZWQ6XCIsIG9iamVjdHMpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgbGVuZ3RoLCAuLi5vYmplY3RzKTtcclxuICAgIH1cclxuXHJcbiAgICBcclxuXHJcbiAgICBpbmRleGVzVG9BZGRQbHVzKHRva2VuczogYW55W10pe1xyXG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcclxuICAgICAgICAgICAgJiZ0b2tlbnNbaW5kZXggLSAxXT8uaXNWYWx1ZVRva2VuKClcclxuICAgICAgICAgICAgJiZ0b2tlbj8uaXNWYWx1ZVRva2VuKCkmJnRva2VuLnZhbHVlPj0wP2luZGV4Om51bGxcclxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcclxuICAgIH1cclxuXHJcbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcclxuICAgICAgICBjb25zdCByZWdFeHB2YWx1ZSA9ICh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgPyB2YWx1ZSA6IG5ldyBSZWdFeHAodmFsdWUpO1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcclxuICAgICAgICAgICAgdG9rZW5bY29tcGFyZV0gPT09IG5leHRUb2tlbj8uW2NvbXBhcmVdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgICovXHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY01hdGhKYXhUb2tlbntcclxuICAgIHR5cGU6IHN0cmluZztcclxuICAgIHZhbHVlPzogc3RyaW5nfG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih0eXBlOnN0cmluZyAsdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZCl7XHJcbiAgICAgICAgdGhpcy50eXBlPXR5cGU7XHJcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgICAgICB0aGlzLmluc3VyUHJvcGVyRm9ybWF0dGluZygpXHJcbiAgICB9XHJcbiAgICBpbnN1clByb3BlckZvcm1hdHRpbmcoKXtcclxuICAgICAgICBpZiAoIXRoaXMuaXNWYWx1ZVRva2VuKCkmJnR5cGVvZiB0aGlzLnZhbHVlPT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgIHRoaXMudmFsdWU9c2VhcmNoQWxsTWF0aEpheE9wZXJhdG9yc0FuZFN5bWJvbHModGhpcy52YWx1ZSk/Lm5hbWVcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TGF0ZXhTeW1ib2woKXtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJz9zZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMudmFsdWUpPy5sYXRleDp1bmRlZmluZWR9XHJcblxyXG4gICAgZ2V0ZnVsbFR5cGUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50eXBlXHJcbiAgICB9XHJcbiAgICBjbG9uZSgpe1xyXG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNNYXRoSmF4VG9rZW4odGhpcy50eXBlLCB0aGlzLnZhbHVlKVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBpc1N0cmluZygpe3JldHVybiB0aGlzLnR5cGU9PT0ncGFyZW4nfHx0aGlzLnR5cGU9PT0nb3BlcmF0b3InfVxyXG5cclxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cclxuXHJcbiAgICB0b1N0cmluZ0xhdGV4KCl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmICh0aGlzLmlzU3RyaW5nKCkpXHJcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy5nZXRMYXRleFN5bWJvbCgpXHJcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdudW1iZXInKSBzdHJpbmcrPXRoaXMudmFsdWU7XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZ1xyXG4gICAgfVxyXG4gICAgYWZmZWN0ZWRPcGVyYXRvclJhbmdlKGRpcmVjdGlvbjogc3RyaW5nKXtcclxuICAgICAgICBpZih0aGlzLnR5cGUhPT0nb3BlcmF0b3InfHx0aGlzLnZhbHVlPT09J0VxdWFscycpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIGlmKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycmJmRpcmVjdGlvbj09PSdsZWZ0JyYmIWlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSh0aGlzLnZhbHVlLCBbLTEsIDFdLHRydWUpKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG59Il19