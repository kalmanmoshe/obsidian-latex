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
            if (typeof item.value === "number") {
                return new Token(item.value, item.variable);
            }
            throw new Error(`ensureAcceptableFormatForMathGroupItems: BasicMathJaxToken must have a numeric value - ${JSON.stringify(item)}`);
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
    isVar() { }
    isMoltylavel() {
        return this.getDeepth().max > 0;
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
    getId() { return this.operator; }
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
    constructor(items) {
        if (items)
            this.items = items;
        typeCheckMathGroupItems(this.items);
    }
    getItems() { return this.items; }
    setItems(items) {
        typeCheckMathGroupItems(this.items);
        this.items = items;
    }
    setItem(item, index) {
        this.items[index] = item;
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
    numberOnly() { return this.items.some(t => (t instanceof Token && !t.isVar())); }
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
        if (this.singular() && this.doesntHaveOperator()) {
            if (items[0] instanceof MathGroup)
                return items[0].getOperableValue();
            return items[0] instanceof Token ? items[0] : null;
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
    levelMap() {
        const overview = new Map();
        this.items.forEach((item) => {
            const key = item.getId();
            if (!overview.has(key)) {
                const entry = {
                    count: 0,
                    variable: item.variable || null,
                    items: []
                };
                overview.set(key, entry);
            }
            const entry = overview.get(key);
            entry.count++;
            entry.items.push(item);
        });
        return overview;
    }
    combiningLikeTerms() {
        const overview = this.levelMap();
        const combinedItems = [];
        for (const [key, value] of overview.entries()) {
            if (key.includes("operator")) {
                combinedItems.push(...value.items);
                continue;
            }
            const sum = value.items.reduce((total, item) => total + (item.getValue ? item.getValue() : 0), 0);
            const token = new Token(sum, value.variable ?? undefined);
            combinedItems.push(token);
        }
        this.items = combinedItems;
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
export class Token {
    value;
    variable;
    constructor(value, variable) {
        this.value = value;
        this.variable = variable;
    }
    isIsolatedVariable() { return this.variable && this.value === 1; }
    isVar() { return this.variable !== undefined; }
    getValue() { return this.value; }
    getVariable() { return this.variable; }
    setValue(value) {
        this.value = value;
        if (this.value === 0) {
            this.variable = undefined;
        }
    }
    getId() {
        return this.variable ? `variable:${this.variable}` : 'number';
    }
    toString(customFormatter) {
        let string = '';
        if (this.value < 0)
            string += '-';
        if (!this.isIsolatedVariable()) {
            string += this.value;
        }
        string += this.variable ?? '';
        if (customFormatter) {
            return customFormatter(this, string);
        }
        return string;
    }
    clone() { return new Token(this.value, this.variable); }
}
export class BasicMathJaxTokens {
    tokens = [];
    constructor(math) {
        this.tokenize(math);
    }
    tokenize(math) {
        const operators = arrToRegexString(getAllMathJaxReferences());
        for (let i = 0; i < math.length; i++) {
            let match = math.slice(i).match(regExp('^' + operators));
            if (!!match) {
                this.tokens.push(new BasicMathJaxToken(match[0]));
                i += match[0].length - 1;
                continue;
            }
            match = math.slice(i).match(/^([0-9.]+)/); //([a-zA-Z]?)/);
            if (!!match) {
                i += match[0].length - 1;
                this.tokens.push(new BasicMathJaxToken(parseFloat(match[0])));
                continue;
            }
            match = math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/);
            if (!!match) {
                i += match[0].length - 1;
                this.tokens.push(new BasicMathJaxToken(1, match[0]));
                //tokens.push({type: "variable",variable: vari.replace("(","{").replace(")","}"),value: 1});
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
            this.tokens.splice(value, 0, new BasicMathJaxToken('*'));
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
}
export class BasicMathJaxToken {
    type;
    value;
    variable;
    constructor(value, variable) {
        this.value = value;
        this.variable = variable;
        this.setType();
        this.insurProperFormatting();
    }
    insurProperFormatting() {
        if (typeof this.value === 'string') {
            this.value = searchAllMathJaxOperatorsAndSymbols(this.value)?.name;
        }
    }
    getLatexSymbol() { return typeof this.value === 'string' ? searchMathJaxOperators(this.value)?.latex : undefined; }
    getFullTokenID() {
        switch (this.type) {
            case 'number':
            case 'prane':
                return this.type;
            case 'operator':
                return this.type + ':' + this.value;
            case 'variable':
                return this.type + ':' + this.variable;
        }
    }
    getfullType() {
        return this.type;
    }
    clone() {
        return new BasicMathJaxToken(this.value, this.variable);
    }
    setType() {
        if (typeof this.value === 'string') {
            this.type = this.value.match(/[()]/) ? 'paren' : 'operator';
            return;
        }
        this.type = this.variable ? 'variable' : 'number';
    }
    isString() { return this.type === 'paren' || this.type === 'operator'; }
    isValueToken() { return this.type === 'variable' || this.type === 'number'; }
    toStringLatex() {
        let string = '';
        if (this.isString())
            string += this.getLatexSymbol();
        if (this.type === 'variable')
            string += this.toStringVariable();
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
    toStringVariable() {
        return (this.value && this?.value !== 1 ? this.value : '') + (this.variable || '');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUEsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBaUIsV0FBVyxFQUF5QyxNQUFNLHNCQUFzQixDQUFDO0FBRXpHLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUl4UixNQUFNLFVBQVUsa0JBQWtCLENBQzlCLFNBQWMsRUFDZCxTQUFpQyxFQUNqQyxPQUE0QixFQUFFO0lBRTlCLDREQUE0RDtJQUM1RCxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxtRUFBbUU7SUFDbkUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDM0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN4QyxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RSxJQUFJLE1BQU07Z0JBQUUsT0FBTyxNQUFN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QUMsS0FBSyxDQUFBLENBQUMsQ0FBQSxFQUFFLENBQUMsR0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUUsRUFBRSxDQUFDLENBQUM7SUFDM0UsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IGV4cGFuZEV4cHJlc3Npb24sY3VybHlCcmFja2V0c1JlZ2V4IH0gZnJvbSBcIi4uL2ltVmVyeUxhenlcIjtcbmltcG9ydCB7IHR5cGUgfSBmcm9tIFwib3NcIjtcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7IEFzc29jaWF0aXZpdHksIEJyYWNrZXRUeXBlLCBNYXRoSmF4T3BlcmF0b3JNZXRhZGF0YSwgT3BlcmF0b3JUeXBlIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XG5pbXBvcnQgeyBjcCB9IGZyb20gXCJmc1wiO1xuaW1wb3J0IHsgZmluZFBhcmVuSW5kZXgsIFBhcmVuLGlkUGFyZW50aGVzZXMsIGlzT3BlblBhcmVuLCBpc0Nsb3NlZFBhcmVuIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcbmltcG9ydCB7IGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzLCBnZXRNYXRoSmF4T3BlcmF0b3JzQnlQcmlvcml0eSwgZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5LCBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZSwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgaXNPcGVyYXRvcldpdGhBc3NvY2lhdGl2aXR5LCBzZWFyY2hBbGxNYXRoSmF4T3BlcmF0b3JzQW5kU3ltYm9scywgc2VhcmNoTWF0aEpheE9wZXJhdG9ycywgc2VhcmNoU3ltYm9scyB9IGZyb20gXCIuLi91dGlscy9kYXRhTWFuYWdlclwiO1xuaW1wb3J0IHsgZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzLCBmbGF0dGVuQXJyYXksIHBhcnNlT3BlcmF0b3IsIFBvc2l0aW9uIH0gZnJvbSBcIi4vbWF0aEVuZ2luZVwiO1xuaW1wb3J0IHsgbnVtYmVyIH0gZnJvbSBcInpvZFwiO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVlcFNlYXJjaFdpdGhQYXRoKFxuICAgIHN0cnVjdHVyZTogYW55LFxuICAgIHByZWRpY2F0ZTogKGl0ZW06IGFueSkgPT4gYm9vbGVhbixcbiAgICBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW11cbik6IHsgaXRlbTogYW55OyBwYXRoOiAoc3RyaW5nIHwgbnVtYmVyKVtdIH0gfCBudWxsIHtcbiAgICAvLyBCYXNlIGNhc2U6IElmIHRoZSBjdXJyZW50IHN0cnVjdHVyZSBtYXRjaGVzIHRoZSBwcmVkaWNhdGVcbiAgICBpZiAocHJlZGljYXRlKHN0cnVjdHVyZSkpIHtcbiAgICAgICAgcmV0dXJuIHsgaXRlbTogc3RydWN0dXJlLCBwYXRoIH07XG4gICAgfVxuXG4gICAgLy8gSWYgaXQncyBhbiBhcnJheSwgcmVjdXJzaXZlbHkgc2VhcmNoIGVhY2ggZWxlbWVudCB3aXRoIGl0cyBpbmRleFxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0cnVjdHVyZSkpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJ1Y3R1cmUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGRlZXBTZWFyY2hXaXRoUGF0aChzdHJ1Y3R1cmVbaV0sIHByZWRpY2F0ZSwgWy4uLnBhdGgsIGldKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJZiBpdCdzIGFuIG9iamVjdCwgcmVjdXJzaXZlbHkgc2VhcmNoIGl0cyBwcm9wZXJ0aWVzIHdpdGggdGhlaXIga2V5c1xuICAgIGlmIChzdHJ1Y3R1cmUgIT09IG51bGwgJiYgdHlwZW9mIHN0cnVjdHVyZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzdHJ1Y3R1cmUpIHtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RydWN0dXJlLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGVlcFNlYXJjaFdpdGhQYXRoKHN0cnVjdHVyZVtrZXldLCBwcmVkaWNhdGUsIFsuLi5wYXRoLCBrZXldKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSWYgbm8gbWF0Y2ggaXMgZm91bmRcbiAgICByZXR1cm4gbnVsbDtcbn1cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yTWF0aEdyb3VwSXRlbXMoaXRlbXM6IGFueSk6IE1hdGhHcm91cEl0ZW1bXSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xuICAgICAgICBpZiAoIWl0ZW1zLmxlbmd0aCYmaXRlbXMgaW5zdGFuY2VvZiBNYXRoR3JvdXApIHtcbiAgICAgICAgICAgIGl0ZW1zPWl0ZW1zLmdldEl0ZW1zKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgaXRlbXM9W2l0ZW1zXVxuICAgIH1cbiAgICBjb25zdCBmb3JtYXR0ZWRJdGVtcz1pdGVtc1xuICAgICAgICAubWFwKChpdGVtOiBUb2tlbnxNYXRoR3JvdXB8TWF0aEpheE9wZXJhdG9yfEJhc2ljTWF0aEpheFRva2VuKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuIHx8IGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXAgfHwgaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbikge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbS52YWx1ZSA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFRva2VuKGl0ZW0udmFsdWUsIGl0ZW0udmFyaWFibGUpOyBcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICBgZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvck1hdGhHcm91cEl0ZW1zOiBCYXNpY01hdGhKYXhUb2tlbiBtdXN0IGhhdmUgYSBudW1lcmljIHZhbHVlIC0gJHtKU09OLnN0cmluZ2lmeShpdGVtKX1gXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0pXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGx8IFRva2VuIHwgTWF0aEdyb3VwIHwgTWF0aEpheE9wZXJhdG9yKTogaXRlbSBpcyBUb2tlbiB8IE1hdGhHcm91cCB8IE1hdGhKYXhPcGVyYXRvciA9PiBpdGVtICE9PSBudWxsKTtcbiAgICByZXR1cm4gZm9ybWF0dGVkSXRlbXM7XG59XG5cbmZ1bmN0aW9uIHR5cGVDaGVja01hdGhHcm91cEl0ZW1zKGl0ZW1zOiBhbnkpOiBpdGVtcyBpcyBNYXRoR3JvdXBJdGVtW10ge1xuICAgIGlmKCFBcnJheS5pc0FycmF5KGl0ZW1zKSl7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ2l0ZW1zJyxpdGVtcylcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgYnV0IHJlY2VpdmVkOiBcIitpdGVtcyk7XG4gICAgfVxuICAgIGl0ZW1zLm1hcCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgIGlmKEFycmF5LmlzQXJyYXkoaXRlbSkpe1xuICAgICAgICAgICAgdHlwZUNoZWNrTWF0aEdyb3VwSXRlbXMoaXRlbSk7cmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmKCEoaXRlbSBpbnN0YW5jZW9mIFRva2VufHxpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwfHxpdGVtIGluc3RhbmNlb2YgTWF0aEpheE9wZXJhdG9yKSl7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdpdGVtJyxpdGVtKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbXMgdG8gYmUgYW4gYXJyYXkgb2YgVG9rZW4sIE1hdGhHcm91cCwgb3IgTWF0aEpheE9wZXJhdG9yIGJ1dCByZWNlaXZlZDogXCIraXRlbXMpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG59XG5mdW5jdGlvbiBzaG91bGRBZGRQbHVzKGdyb3VwMT86IGFueSxncm91cDI/OiBhbnkpe1xuICAgIGlmKCFncm91cDF8fCFncm91cDIpcmV0dXJuICcnO1xuXG4gICAgcmV0dXJuICcrJztcbn1cbmZ1bmN0aW9uIGNhbkNvbWJpbmUobWF0aDogTWF0aEdyb3VwLG9wZXJhdG9yOiBNYXRoSmF4T3BlcmF0b3Ipe1xuXG59XG5cbmV4cG9ydCBjbGFzcyBNYXRoSmF4T3BlcmF0b3J7XG4gICAgb3BlcmF0b3I6IHN0cmluZztcbiAgICBncm91cE51bTogbnVtYmVyPTE7XG4gICAgZ3JvdXBzOiBNYXRoR3JvdXBbXTtcbiAgICBzb2x1dGlvbjogTWF0aEdyb3VwXG4gICAgaXNPcGVyYWJsZTogYm9vbGVhbj10cnVlO1xuICAgIGNvbnN0cnVjdG9yKG9wZXJhdG9yPzogc3RyaW5nLGdyb3VwTnVtPzogbnVtYmVyLGdyb3Vwcz86IE1hdGhHcm91cFtdLHNvbHV0aW9uPzogTWF0aEdyb3VwLGlzT3BlcmFibGU/OiBib29sZWFuKXtcbiAgICAgICAgaWYgKG9wZXJhdG9yKXRoaXMub3BlcmF0b3I9b3BlcmF0b3I7XG4gICAgICAgIGlmKGdyb3VwTnVtKXRoaXMuZ3JvdXBOdW09Z3JvdXBOdW07XG4gICAgICAgIGlmKGdyb3Vwcyl0aGlzLmdyb3Vwcz1ncm91cHM7XG4gICAgICAgIGlmKHNvbHV0aW9uKXRoaXMuc29sdXRpb249c29sdXRpb247XG4gICAgICAgIGlmKGlzT3BlcmFibGUpdGhpcy5pc09wZXJhYmxlPWlzT3BlcmFibGU7XG4gICAgfVxuICAgIGlzVmFyKCl7fVxuICAgIGlzTW9sdHlsYXZlbCgpe1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWVwdGgoKS5tYXg+MDtcbiAgICB9XG4gICAgY2xvbmUoKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IHRoaXMuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5jbG9uZSgpKTtcbiAgICAgICAgY29uc3Qgc29sdXRpb24gPSB0aGlzLnNvbHV0aW9uID8gdGhpcy5zb2x1dGlvbi5jbG9uZSgpIDogdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm4gbmV3IE1hdGhKYXhPcGVyYXRvcih0aGlzLm9wZXJhdG9yLCB0aGlzLmdyb3VwTnVtLCBncm91cHMsIHNvbHV0aW9uLCB0aGlzLmlzT3BlcmFibGUpO1xuICAgIH1cbiAgICBnZXREZWVwdGgoKXtcbiAgICAgICAgbGV0IGRlZXB0aHM6IG51bWJlcltdPVtdO1xuICAgICAgICB0aGlzLmdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICAgICAgICAgIGRlZXB0aHMucHVzaChncm91cC5nZXREZWVwdGgoKS5tYXgpXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4ge21heDogTWF0aC5tYXgoLi4uZGVlcHRocyksIGRlZXB0aHM6IGRlZXB0aHN9XG4gICAgfVxuICAgIHNldEdyb3VwKGdyb3VwOiBNYXRoR3JvdXAsaW5kZXg6bnVtYmVyKXt0aGlzLmdyb3Vwc1tpbmRleF09Z3JvdXB9XG4gICAgdG9TdHJpbmdTb2x1dGlvbigpe1xuICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZygpKycgPSAnK3RoaXMuc29sdXRpb24udG9TdHJpbmcoKTtcbiAgICB9XG4gICAgZ2V0SWQoKXtyZXR1cm4gdGhpcy5vcGVyYXRvcn1cbiAgICB0b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXI/OiAoY2hlY2s6IGFueSxzdHJpbmc6IHN0cmluZykgPT4gYW55KXtcbiAgICAgICAgZnVuY3Rpb24gd3JhcEdyb3VwKGdyb3VwOiBNYXRoR3JvdXAsIHdyYXA6IEJyYWNrZXRUeXBlLG9wdGlvbmFsOiBib29sZWFuKTogc3RyaW5nIHtcbiAgICAgICAgICAgIGlmKG9wdGlvbmFsJiZncm91cC5zaW5ndWxhcigpKXJldHVybiBncm91cC50b1N0cmluZyhjdXN0b21Gb3JtYXR0ZXIpO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBTdHI9Z3JvdXAudG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKVxuICAgICAgICAgICAgc3dpdGNoICh3cmFwKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBCcmFja2V0VHlwZS5QYXJlbnRoZXNlczpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGAoJHtncm91cFN0cn0pYDtcbiAgICAgICAgICAgICAgICBjYXNlIEJyYWNrZXRUeXBlLkN1cmx5QnJhY2VzOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYHske2dyb3VwU3RyfX1gO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBncm91cFN0cjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gc2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLm9wZXJhdG9yKTtcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuICcnO1xuICAgICAgICBpZihtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9ucz4yfHxtZXRhZGF0YS5hc3NvY2lhdGl2aXR5Lm51bVBvc2l0aW9uczwxKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBudW1iZXIgb2YgcG9zaXRpb25zIGZvciBhc3NvY2lhdGl2aXR5OiAke21ldGFkYXRhLmFzc29jaWF0aXZpdHkubnVtUG9zaXRpb25zfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBtZXRhZGF0YS5sYXRleDtcbiAgICAgICAgbGV0IGluZGV4PTA7XG4gICAgICAgIGxldCBzdHJpbmcgPSAnJztcblxuICAgICAgICBnZXRWYWx1ZXNXaXRoS2V5c0J5U2lkZShtZXRhZGF0YS5hc3NvY2lhdGl2aXR5LnBvc2l0aW9ucyx0cnVlKS5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpdGVtKVxuICAgICAgICAgICAgc3RyaW5nICs9IHNob3VsZEFkZFBsdXModGhpcy5ncm91cHNbaW5kZXgtMV0sdGhpcy5ncm91cHNbaW5kZXhdKSt3cmFwR3JvdXAodGhpcy5ncm91cHNbaW5kZXhdLCBpdGVtLmJyYWNrZXRUeXBlLCBpdGVtLmlzQnJhY2tldE9wdGlvbmFsKTtcbiAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHN0cmluZyArPSBvcGVyYXRvcjtcbiAgICAgICAgZ2V0VmFsdWVzV2l0aEtleXNCeVNpZGUobWV0YWRhdGEuYXNzb2NpYXRpdml0eS5wb3NpdGlvbnMsZmFsc2UpLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcbiAgICAgICAgICAgIHN0cmluZyArPSBzaG91bGRBZGRQbHVzKHRoaXMuZ3JvdXBzW2luZGV4XSx0aGlzLmdyb3Vwc1tpbmRleCsxXSkrd3JhcEdyb3VwKHRoaXMuZ3JvdXBzW2luZGV4XSwgaXRlbS5icmFja2V0VHlwZSwgaXRlbS5pc0JyYWNrZXRPcHRpb25hbCk7XG4gICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoY3VzdG9tRm9ybWF0dGVyKSBcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXG4gICAgICAgIHJldHVybiBzdHJpbmcudHJpbSgpO1xuICAgIH1cbn1cblxuXG5leHBvcnQgdHlwZSBNYXRoR3JvdXBJdGVtPVRva2VufE1hdGhHcm91cHxNYXRoSmF4T3BlcmF0b3JcbmV4cG9ydCBjbGFzcyBNYXRoR3JvdXAge1xuICAgIHByaXZhdGUgaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSA9IFtdO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKGl0ZW1zPzogTWF0aEdyb3VwSXRlbVtdKSB7XG4gICAgICAgIGlmKGl0ZW1zKXRoaXMuaXRlbXM9aXRlbXNcbiAgICAgICAgdHlwZUNoZWNrTWF0aEdyb3VwSXRlbXModGhpcy5pdGVtcylcbiAgICB9XG4gICAgZ2V0SXRlbXMoKTogTWF0aEdyb3VwSXRlbVtdIHtyZXR1cm4gdGhpcy5pdGVtczt9XG4gICAgc2V0SXRlbXMoaXRlbXM6IE1hdGhHcm91cEl0ZW1bXSkge1xuICAgICAgICB0eXBlQ2hlY2tNYXRoR3JvdXBJdGVtcyh0aGlzLml0ZW1zKVxuICAgICAgICB0aGlzLml0ZW1zID0gaXRlbXM7XG4gICAgfVxuICAgIHNldEl0ZW0oaXRlbTogVG9rZW58TWF0aEdyb3VwfE1hdGhKYXhPcGVyYXRvcixpbmRleDpudW1iZXIpe1xuICAgICAgICB0aGlzLml0ZW1zW2luZGV4XT1pdGVtXG4gICAgfVxuICAgIGNsb25lKCk6IE1hdGhHcm91cCB7XG4gICAgICAgIHJldHVybiBuZXcgTWF0aEdyb3VwKHRoaXMuaXRlbXMubWFwKGl0ZW09Pml0ZW0uY2xvbmUoKSkpO1xuICAgIH1cblxuICAgIGhhc09wZXJhdG9yKCk6IHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBNYXRoSmF4T3BlcmF0b3IpO31cbiAgICBkb2VzbnRIYXZlT3BlcmF0b3IoKTogIHRoaXMgaXMgeyBpdGVtczogQXJyYXk8VG9rZW4gfCBNYXRoR3JvdXA+IH0ge3JldHVybiAhdGhpcy5oYXNPcGVyYXRvcigpO31cbiAgICBkZWVwSGFzT3BlcmF0b3IoKXtcbiAgICAgICAgY29uc3QgbWFwPXRoaXMuaXRlbXMubWFwKChpdGVtKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICBpZihpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5kZWVwSGFzT3BlcmF0b3IoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIE1hdGhKYXhPcGVyYXRvcilyZXR1cm4gdHJ1ZVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gbWFwLnNvbWUoKHQ6IGJvb2xlYW4pPT50KVxuICAgIH1cbiAgICBudW1iZXJPbmx5KCk6IGJvb2xlYW4ge3JldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiAodCBpbnN0YW5jZW9mIFRva2VuJiYhdC5pc1ZhcigpKSk7fVxuICAgIGhhc1ZhcmlhYmxlcygpOiBib29sZWFuIHtyZXR1cm4gdGhpcy5pdGVtcy5zb21lKHQgPT4gdCBpbnN0YW5jZW9mIFRva2VuJiZ0LmlzVmFyKCkpO31cblxuICAgIHNpbmd1bGFyKCk6Ym9vbGVhbiB7cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoID09PSAxICYmIHRoaXMuaXRlbXNbMF0gIT09IHVuZGVmaW5lZDt9XG4gICAgc2luZ3VsVG9rZW4oKTogdGhpcyBpcyB7IGl0ZW1zOiBbVG9rZW5dIH0ge3JldHVybiB0aGlzLnNpbmd1bGFyKCkgJiYgdGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIFRva2VuO31cbiAgICBpc1Jvb3RMZXZlbCgpe3JldHVybiB0aGlzLml0ZW1zLmV2ZXJ5KChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgVG9rZW4pO31cbiAgICBleHRyZW1lU2ltcGxpZnlBbmRHcm91cCgpe1xuICAgICAgICB0aGlzLnRyeVJlbW92ZVVubmVjZXNzYXJ5TmVzdGVkKCk7XG4gICAgICAgIHRoaXMuY29tYmluaW5nTGlrZVRlcm1zKClcbiAgICB9XG5cbiAgICB0cnlSZW1vdmVVbm5lY2Vzc2FyeU5lc3RlZCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2luZ3VsYXIoKSkge1xuICAgICAgICAgICAgaWYodGhpcy5pdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhHcm91cCl7XG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcyA9IHRoaXMuaXRlbXNbMF0uaXRlbXM7XG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIE1hdGhHcm91cCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbS50cnlSZW1vdmVVbm5lY2Vzc2FyeU5lc3RlZCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0RGVlcHRoKCl7XG4gICAgICAgIGxldCBkZWVwdGhzOiBudW1iZXJbXT1bXTtcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgaWYoaXRlbSBpbnN0YW5jZW9mIFRva2VuKXtcbiAgICAgICAgICAgICAgICBkZWVwdGhzLnB1c2goMCk7cmV0dXJuO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGRlZXB0aHMucHVzaChpdGVtLmdldERlZXB0aCgpLm1heCsxKVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHttYXg6IE1hdGgubWF4KC4uLmRlZXB0aHMpLCBkZWVwdGhzOiBkZWVwdGhzfVxuICAgIH1cbiAgICBpc09wZXJhYmxlKCl7cmV0dXJuIHRydWV9XG5cbiAgICBnZXRPcGVyYWJsZVZhbHVlKCk6IFRva2VuIHwgbnVsbFxuICAgIHtcbiAgICAgICAgdGhpcy50cnlSZW1vdmVVbm5lY2Vzc2FyeU5lc3RlZCgpO1xuICAgICAgICB0aGlzLmNvbWJpbmluZ0xpa2VUZXJtcygpO1xuICAgICAgICBjb25zdCBpdGVtcyA9IHRoaXMuaXRlbXM7XG4gICAgICAgIGlmICh0aGlzLnNpbmd1bGFyKCkmJnRoaXMuZG9lc250SGF2ZU9wZXJhdG9yKCkpIHtcbiAgICAgICAgICAgIGlmIChpdGVtc1swXSBpbnN0YW5jZW9mIE1hdGhHcm91cClcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbXNbMF0uZ2V0T3BlcmFibGVWYWx1ZSgpO1xuICAgICAgICAgICAgcmV0dXJuIGl0ZW1zWzBdIGluc3RhbmNlb2YgVG9rZW4gPyBpdGVtc1swXSA6IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGdldElkKCl7XG4gICAgICAgIHJldHVybiAnTWF0aEdyb3VwJ1xuICAgIH1cbiAgICByZW1vdmVOZXN0ZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0aGlzLmRlZXBIYXNPcGVyYXRvcigpKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgICAgIGxldCBpdGVtczogVG9rZW5bXSA9IFtdO1xuICAgIFxuICAgICAgICB0aGlzLml0ZW1zLmZvckVhY2goKGl0ZW06IE1hdGhHcm91cCB8IFRva2VuKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbSBpbnN0YW5jZW9mIFRva2VuKSB7XG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaChpdGVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmKGl0ZW0gaW5zdGFuY2VvZiBNYXRoR3JvdXApe1xuICAgICAgICAgICAgICAgIGl0ZW0ucmVtb3ZlTmVzdGVkKCk7XG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaCguLi4oaXRlbS5pdGVtcyBhcyBUb2tlbltdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuaXRlbXMgPSBpdGVtcztcbiAgICBcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGxldmVsTWFwKCk6IE1hcDxhbnksYW55PntcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXcgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuaXRlbXMuZm9yRWFjaCgoaXRlbTogTWF0aEdyb3VwSXRlbSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5nZXRJZCgpO1xuICAgICAgICAgICAgaWYgKCFvdmVydmlldy5oYXMoa2V5KSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0ge1xuICAgICAgICAgICAgICAgICAgICBjb3VudDogMCxcbiAgICAgICAgICAgICAgICAgICAgdmFyaWFibGU6IChpdGVtIGFzIGFueSkudmFyaWFibGUgfHwgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgaXRlbXM6IFtdXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBvdmVydmlldy5zZXQoa2V5LCBlbnRyeSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IG92ZXJ2aWV3LmdldChrZXkpO1xuICAgICAgICAgICAgZW50cnkuY291bnQrKztcbiAgICAgICAgICAgIGVudHJ5Lml0ZW1zLnB1c2goaXRlbSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gb3ZlcnZpZXdcbiAgICB9XG4gICAgY29tYmluaW5nTGlrZVRlcm1zKCkge1xuICAgICAgICBjb25zdCBvdmVydmlldz10aGlzLmxldmVsTWFwKClcbiAgICAgICAgY29uc3QgY29tYmluZWRJdGVtcyA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBvdmVydmlldy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgIGlmIChrZXkuaW5jbHVkZXMoXCJvcGVyYXRvclwiKSkge1xuICAgICAgICAgICAgICAgIGNvbWJpbmVkSXRlbXMucHVzaCguLi52YWx1ZS5pdGVtcyk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdW0gPSB2YWx1ZS5pdGVtcy5yZWR1Y2UoKHRvdGFsOiBhbnksIGl0ZW06IFRva2VuKSA9PiB0b3RhbCArIChpdGVtLmdldFZhbHVlP2l0ZW0uZ2V0VmFsdWUoKTogMCksIDApO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBuZXcgVG9rZW4oc3VtLCB2YWx1ZS52YXJpYWJsZT8/dW5kZWZpbmVkKTtcbiAgICAgICAgICAgIGNvbWJpbmVkSXRlbXMucHVzaCh0b2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5pdGVtcyA9IGNvbWJpbmVkSXRlbXM7XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XG4gICAgICAgIGxldCBzdHJpbmc9Jyc7XG4gICAgICAgIGlmKCFBcnJheS5pc0FycmF5KHRoaXMuaXRlbXMpKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW1zIHRvIGJlIGFuIGFycmF5IGJ1dCByZWNlaXZlZDogXCIrdGhpcy5pdGVtcyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgc3RyaW5nKz1zaG91bGRBZGRQbHVzKHRoaXMuaXRlbXNbaW5kZXgtMV0saXRlbSlcbiAgICAgICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgTWF0aEdyb3VwICYmICFpdGVtLnNpbmd1bGFyKCkpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcgKz0gYCgke2l0ZW0udG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyKX0pYDtcbiAgICAgICAgICAgIH0gIGVsc2Uge1xuICAgICAgICAgICAgICAgIHN0cmluZyArPSBpdGVtLnRvU3RyaW5nKGN1c3RvbUZvcm1hdHRlcik7XG4gICAgICAgICAgICB9IGlmIChjdXN0b21Gb3JtYXR0ZXIpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcgPSBjdXN0b21Gb3JtYXR0ZXIoaXRlbSxzdHJpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHN0cmluZztcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgVG9rZW57XG4gICAgcHJpdmF0ZSB2YWx1ZTogbnVtYmVyO1xuICAgIHByaXZhdGUgdmFyaWFibGU/OiBzdHJpbmc7XG4gICAgY29uc3RydWN0b3IodmFsdWU6bnVtYmVyICx2YXJpYWJsZT86IHN0cmluZyl7XG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XG4gICAgfVxuICAgIGlzSXNvbGF0ZWRWYXJpYWJsZSgpe3JldHVybiB0aGlzLnZhcmlhYmxlJiZ0aGlzLnZhbHVlPT09MX1cblxuICAgIGlzVmFyKCkge3JldHVybiB0aGlzLnZhcmlhYmxlIT09dW5kZWZpbmVkfVxuICAgIGdldFZhbHVlKCl7cmV0dXJuIHRoaXMudmFsdWV9XG4gICAgZ2V0VmFyaWFibGUoKXtyZXR1cm4gdGhpcy52YXJpYWJsZX1cbiAgICBzZXRWYWx1ZSh2YWx1ZTogbnVtYmVyKXtcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICAgICAgaWYodGhpcy52YWx1ZT09PTApe1xuICAgICAgICAgICAgdGhpcy52YXJpYWJsZT11bmRlZmluZWRcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXRJZCgpe1xuICAgICAgICByZXR1cm4gdGhpcy52YXJpYWJsZT9gdmFyaWFibGU6JHt0aGlzLnZhcmlhYmxlfWA6J251bWJlcidcbiAgICB9XG4gICAgdG9TdHJpbmcoY3VzdG9tRm9ybWF0dGVyPzogKGNoZWNrOiBhbnksc3RyaW5nOiBzdHJpbmcpID0+IGFueSl7XG4gICAgICAgIGxldCBzdHJpbmc9JydcbiAgICAgICAgaWYodGhpcy52YWx1ZTwwKVxuICAgICAgICAgICAgc3RyaW5nKz0nLSc7XG4gICAgICAgIGlmKCF0aGlzLmlzSXNvbGF0ZWRWYXJpYWJsZSgpKXtcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy52YWx1ZVxuICAgICAgICB9XG4gICAgICAgIHN0cmluZys9dGhpcy52YXJpYWJsZT8/JydcbiAgICAgICAgaWYoY3VzdG9tRm9ybWF0dGVyKXtcbiAgICAgICAgICAgIHJldHVybiBjdXN0b21Gb3JtYXR0ZXIodGhpcyxzdHJpbmcpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZztcbiAgICB9XG4gICAgY2xvbmUoKXtyZXR1cm4gbmV3IFRva2VuKHRoaXMudmFsdWUsdGhpcy52YXJpYWJsZSl9XG59XG5cblxuXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW5ze1xuICAgIHRva2VuczogQXJyYXk8QmFzaWNNYXRoSmF4VG9rZW58UGFyZW4+PVtdO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKG1hdGg6IHN0cmluZyl7XG4gICAgICAgIHRoaXMudG9rZW5pemUobWF0aCk7XG4gICAgfVxuICAgIHRva2VuaXplKG1hdGg6IHN0cmluZyl7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9ycz1hcnJUb1JlZ2V4U3RyaW5nKGdldEFsbE1hdGhKYXhSZWZlcmVuY2VzKCkpXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3ICBCYXNpY01hdGhKYXhUb2tlbihtYXRjaFswXSkpO1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xuICAgICAgICAgICAgaWYgKCEhbWF0Y2gpXG4gICAgICAgICAgICB7ICAgaSs9bWF0Y2hbMF0ubGVuZ3RoLTFcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbihwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXG4gICAgICAgICAgICBpZiAoISFtYXRjaCkge1xuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oMSxtYXRjaFswXSkpXG4gICAgICAgICAgICAgICAgLy90b2tlbnMucHVzaCh7dHlwZTogXCJ2YXJpYWJsZVwiLHZhcmlhYmxlOiB2YXJpLnJlcGxhY2UoXCIoXCIsXCJ7XCIpLnJlcGxhY2UoXCIpXCIsXCJ9XCIpLHZhbHVlOiAxfSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFyIFwiJHttYXRoW2ldfVwiYCk7XG4gICAgICAgIH1cbiAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XG4gICAgfVxuXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcbiAgICAgICAgLypydWxlcyB0byBhYmlkIGJ5OlxuICAgICAgICAxLiArLSBJZiBwYXJ0IG9mIHRoZSBudW1iZXIgdGhleSBhcmUgYWJzb3JiZWQgaW50byB0aGUgbnVtYmVyXG4gICAgICAgICovXG4gICAgICAgIHRoaXMudG9rZW5zPWlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpO1xuICAgICAgICB0aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxuICAgICAgICBcbiAgICAgICAgY29uc3QgcGFyZW5NYXA9dGhpcy5pbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKClcblxuICAgICAgICBwYXJlbk1hcC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYiAtIGEpXG4gICAgICAgIC5mb3JFYWNoKCh2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UodmFsdWUsIDAsIG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4oJyonKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKVxuICAgIH1cbiAgICBpbXBsaWNpdE11bHRpcGxpY2F0aW9uTWFwKCkge1xuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpfHwhKHRoaXMudG9rZW5zW2luZGV4XSBpbnN0YW5jZW9mIFBhcmVuKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gZmluZFBhcmVuSW5kZXgoaW5kZXgsdGhpcy50b2tlbnMpPy5vcGVuO1xuICAgIFxuICAgICAgICAgICAgaWYgKGlkeCA9PSBudWxsIHx8ICFpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCArIDFdKSkgcmV0dXJuIGZhbHNlO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbaWR4IC0gMV07XG4gICAgXG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgIGlkeCA+IDAgJiZcbiAgICAgICAgICAgICAgICBwcmV2VG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJlxuICAgICAgICAgICAgICAgICFnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHkoWzEsIDJdKS5pbmNsdWRlcyhwcmV2VG9rZW4udmFsdWU/LnRvU3RyaW5nKCkgfHwgJycpXG4gICAgICAgICAgICApO1xuICAgICAgICB9O1xuICAgIFxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy50b2tlbnNbaW5kZXhdO1xuICAgICAgICAgICAgcmV0dXJuIHRva2VuIGluc3RhbmNlb2YgQmFzaWNNYXRoSmF4VG9rZW4gJiYgdG9rZW4uaXNWYWx1ZVRva2VuKCk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGNoZWNrSW1wbGljaXRNdWx0aXBsaWNhdGlvbj0odG9rZW46IGFueSk9PntcbiAgICAgICAgICAgIHJldHVybiB0b2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuJiZ0eXBlb2YgdG9rZW4udmFsdWU9PT0nc3RyaW5nJyYmaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSlcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBpc1Zhcj0odG9rZW46IGFueSk9PntyZXR1cm4gdG9rZW4gaW5zdGFuY2VvZiBCYXNpY01hdGhKYXhUb2tlbiAmJnRva2VuLnR5cGU9PT0ndmFyaWFibGUnfVxuICAgICAgICBjb25zdCBwcmVjZWRlc1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpbmRleD4wJiZpc1Zhcih0b2tlbnNbaW5kZXhdKVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgY29uc3QgZm9sbG93c1ZhcmlhYmxlID0gKHRva2VuczogYW55LGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBpbmRleDx0b2tlbnMubGVuZ3RoLTEmJmlzVmFyKHRva2Vuc1tpbmRleF0pXG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5tYXAoKHRva2VuLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChpc09wZW5QYXJlbih0b2tlbil8fCBjaGVja0ltcGxpY2l0TXVsdGlwbGljYXRpb24odG9rZW4pfHxwcmVjZWRlc1ZhcmlhYmxlKHRoaXMudG9rZW5zLGluZGV4KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2soaW5kZXggLSAxKSA/IGluZGV4IDogbnVsbDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzQ2xvc2VkUGFyZW4odG9rZW4pfHxmb2xsb3dzVmFyaWFibGUodGhpcy50b2tlbnMsaW5kZXgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8IHRlc3REb3VibGVSaWdodChpbmRleCkgPyBpbmRleCArIDEgOiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtICE9PSBudWxsKTtcbiAgICAgICAgY29uc29sZS5sb2codGhpcy50b2tlbnMsbWFwKVxuICAgICAgICByZXR1cm4gbWFwO1xuICAgIH1cbiAgICBcblxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XG4gICAgICAgIC8vIFBsdXNlcyBhcmUgc2VwYXJhdG9ycy5UaGVyZWZvcmUsIHRoZXkgZG8gbm90IG5lZWQgdG8gYmUgaGVyZSBBcyB0aGUgZXhwcmVzc2lvbiBpcyB0b2tlbltdXG4gICAgICAgIC8vTWludXNlcyBvbiB0aGUgb3RoZXIgaGFuZC5jYW4gZWl0aGVyIGJlIGEgc2VwYXJhdG9yLiBPciBhIG5lZ2F0aXZlIHNpZ25cbiAgICAgICAgY29uc3QgcGx1c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdBZGRpdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcbiAgICAgICAgcGx1c01hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LDEpXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBtaW51c01hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiBCYXNpY01hdGhKYXhUb2tlbiwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09ICdTdWJ0cmFjdGlvbic/aW5kZXggOiBudWxsKS5maWx0ZXIoKGluZGV4OiBudW1iZXIgfCBudWxsKSA9PiBpbmRleCAhPT0gbnVsbClcbiAgICAgICAgXG4gICAgICAgIG1pbnVzTWFwLnJldmVyc2UoKS5mb3JFYWNoKChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXh0VG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleCArIDFdO1xuICAgICAgICAgICAgaWYgKG5leHRUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuICYmIHR5cGVvZiBuZXh0VG9rZW4udmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIG5leHRUb2tlbi52YWx1ZSAqPSAtMTtcbiAgICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICB9XG4gICAgdmFsaWRhdGVJbmRleChpbmRleDogbnVtYmVyLG1hcmdpbj86IG51bWJlcil7XG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XG4gICAgICAgIHJldHVybiBpbmRleD49MCttYXJnaW4mJmluZGV4PHRoaXMudG9rZW5zLmxlbmd0aC1tYXJnaW47XG4gICAgfVxuICAgIC8qXG4gICAgXG4gICAgaW1wbGljaXRNdWx0aXBsaWNhdGlvbk1hcCgpe1xuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnZhbGlkYXRlSW5kZXgoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCBpZHg9ZmluZFBhcmVuSW5kZXgobnVsbCxpbmRleCkub3BlbjtcbiAgICAgICAgICAgIHJldHVybiBpc09wZW5QYXJlbih0aGlzLnRva2Vuc1tpbmRleCsxXSkmJihpZHg9PT0wfHwhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMudG9rZW5zW2lkeC0xXT8udmFsdWUpKTtcbiAgICAgICAgICAgIFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoIShUb2tlbiBpbnN0YW5jZW9mIEJhc2ljTWF0aEpheFRva2VuKXx8IXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1tpbmRleF0uaXNWYWx1ZVRva2VuKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbWFwID0gdGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBudW1iZXIpID0+IHsgXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSBcIihcIiB8fCAoaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCAtIDEpID8gaW5kZXggOiBudWxsO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8dGVzdERvdWJsZVJpZ2h0KGluZGV4KT8gaW5kZXgrMSA6IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpO1xuICAgICAgICByZXR1cm4gbWFwO1xuICAgIH1cblxuICAgIFxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW46IGFueSwgaW5kZXg6IGFueSkgPT4gdG9rZW4udmFsdWUgPT09IFwiKFwiID8gZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCkgOiBudWxsKVxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxuICAgIH1cblxuICAgIGZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1hcFBhcmVuSW5kZXhlcygpXG4gICAgICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XG4gICAgICAgICAgICAgICAgaWYgKG9wZW5JbmRleCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKC8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRoaXMudG9rZW5zW29wZW5JbmRleCAtIDFdPy50eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChjbG9zZUluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbY2xvc2VJbmRleCArIDFdPy5pc1ZhbHVlVG9rZW4oKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSkuZmxhdE1hcCgoaXRlbTogYW55KSA9PiBbaXRlbS5vcGVuLCBpdGVtLmNsb3NlXSk7XG4gICAgfSAgICBcbiAgICBcbiAgICBcbiAgICBmaW5kU2ltaWxhclN1Y2Nlc3Nvcih0b2tlbnMpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XG4gICAgICAgICAgICAgICAgKCh0b2tlbnNbaW5kZXggKyAyXT8udHlwZSAhPT0gXCJvcGVyYXRvclwiJiZ0b2tlbnNbaW5kZXggLTFdPy50eXBlICE9PSBcIm9wZXJhdG9yXCIpXG4gICAgICAgICAgICAgICAgJiYodGhpcy50b2tlbkNvbXBhcmUoXCJ0eXBlXCIsdGhpcy52YWx1ZVRva2VucygpLCB0b2tlbiwgdG9rZW5zW2luZGV4ICsgMV0pKVxuICAgICAgICApKTtcbiAgICAgfVxuICAgIFxuICAgIGNvbm5lY3ROZWFyYnlUb2tlbnMoKXtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBUb2tlbikpe1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZ0eWd1YmhuaW1wb1wiKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgbWFwID0gbmV3IFNldCh0aGlzLmZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSk7XG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfOiBhbnksIGlkeDogdW5rbm93bikgPT4gIW1hcC5oYXMoaWR4KSk7XG4gICAgICAgIC8vUHJvYmxlbSB3aXRoICA9IGFzIGl0J3MgYWZmZWN0aW5nIHRoZSB2YXJpYWJsZSBiZWZvcmUgaXRcbiAgICAgICAgY29uc3QgY2hlY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAhdGhpcy50b2tlbnM/LltpbmRleCAtIDFdPy5hZmZlY3RlZE9wZXJhdG9yUmFuZ2U/LigpICYmXG4gICAgICAgICAgICAgICAgIXRoaXMudG9rZW5zPy5baW5kZXggKyAxXT8uYWZmZWN0ZWRPcGVyYXRvclJhbmdlPy4oKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIGNvbnN0IHZhck1hcD10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHR5cGU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnR5cGU9PT0ndmFyaWFibGUnJiZjaGVjayhpbmRleCk/aW5kZXg6bnVsbCkuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICBcbiAgICAgICAgY29uc3QgYXJyID0gW1xuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG51bU1hcCksIFxuICAgICAgICAgICAgLi4uZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKHZhck1hcCksIFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmNvbm5lY3RBbmRDb21iaW5lKGFycilcbiAgICAgICAgXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXG4gICAgfVxuXG4gICAgXG5cbiAgICBleHByZXNzaW9uVmFyaWFibGVWYWxpZGl0eSgpe1xuICAgICAgICBpZiAoXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHRoaXMudG9rZW5zKSBcbiAgICAgICAgICAgICYmIHRoaXMudG9rZW5zLnNvbWUodG9rZW4gPT4gLyh2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXG4gICAgICAgIClcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cbiAgICB9XG5cbiAgICBpbnNlcnRUb2tlbnMoc3RhcnQ6IGFueSwgbGVuZ3RoOiBudW1iZXIsIG9iamVjdHM6IGFueVtdIHwgVG9rZW4pIHtcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iamVjdHMpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXhwZWN0ZWQgYG9iamVjdHNgIHRvIGJlIGFuIGFycmF5LCBidXQgcmVjZWl2ZWQ6XCIsIG9iamVjdHMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgbGVuZ3RoLCAuLi5vYmplY3RzKTtcbiAgICB9XG5cbiAgICBcblxuICAgIGluZGV4ZXNUb0FkZFBsdXModG9rZW5zOiBhbnlbXSl7XG4gICAgICAgIHJldHVybiB0b2tlbnMubWFwKCh0b2tlbixpbmRleCk9PmluZGV4PjBcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXG4gICAgICAgICAgICAmJnRva2VuPy5pc1ZhbHVlVG9rZW4oKSYmdG9rZW4udmFsdWU+PTA/aW5kZXg6bnVsbFxuICAgICAgICApLmZpbHRlcihpdGVtPT5pdGVtIT09bnVsbClcbiAgICB9XG5cbiAgICB0b2tlbkNvbXBhcmUoY29tcGFyZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nfFJlZ0V4cCwgdG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSwgbmV4dFRva2VuOiB7IFt4OiBzdHJpbmddOiBhbnk7IH0pIHtcbiAgICAgICAgY29uc3QgcmVnRXhwdmFsdWUgPSAodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApID8gdmFsdWUgOiBuZXcgUmVnRXhwKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICh2YWx1ZSA9PT0gbnVsbCB8fCByZWdFeHB2YWx1ZS50ZXN0KHRva2VuW2NvbXBhcmVdKSkgJiZcbiAgICAgICAgICAgIHRva2VuW2NvbXBhcmVdID09PSBuZXh0VG9rZW4/Lltjb21wYXJlXVxuICAgICAgICApO1xuICAgIH1cbiAgICAqL1xufVxuXG5cblxuXG5cblxuXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW57XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIHZhbHVlPzogc3RyaW5nfG51bWJlcjtcbiAgICB2YXJpYWJsZT86IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQsdmFyaWFibGU/OiBhbnkpe1xuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xuICAgICAgICB0aGlzLnZhcmlhYmxlPXZhcmlhYmxlO1xuICAgICAgICB0aGlzLnNldFR5cGUoKTtcbiAgICAgICAgdGhpcy5pbnN1clByb3BlckZvcm1hdHRpbmcoKVxuICAgIH1cbiAgICBpbnN1clByb3BlckZvcm1hdHRpbmcoKXtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycpe1xuICAgICAgICAgICAgdGhpcy52YWx1ZT1zZWFyY2hBbGxNYXRoSmF4T3BlcmF0b3JzQW5kU3ltYm9scyh0aGlzLnZhbHVlKT8ubmFtZVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0TGF0ZXhTeW1ib2woKXtyZXR1cm4gdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJz9zZWFyY2hNYXRoSmF4T3BlcmF0b3JzKHRoaXMudmFsdWUpPy5sYXRleDp1bmRlZmluZWR9XG5cbiAgICBnZXRGdWxsVG9rZW5JRCgpe1xuICAgICAgICBzd2l0Y2ggKHRoaXMudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgIGNhc2UgJ3ByYW5lJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlO1xuICAgICAgICAgICAgY2FzZSAnb3BlcmF0b3InOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnR5cGUrJzonK3RoaXMudmFsdWVcbiAgICAgICAgICAgIGNhc2UgJ3ZhcmlhYmxlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlKyc6Jyt0aGlzLnZhcmlhYmxlXG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0ZnVsbFR5cGUoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudHlwZVxuICAgIH1cbiAgICBjbG9uZSgpe1xuICAgICAgICByZXR1cm4gbmV3IEJhc2ljTWF0aEpheFRva2VuKHRoaXMudmFsdWUsdGhpcy52YXJpYWJsZSlcbiAgICB9XG5cbiAgICBzZXRUeXBlKCl7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnKXtcbiAgICAgICAgICAgIHRoaXMudHlwZT10aGlzLnZhbHVlLm1hdGNoKC9bKCldLyk/J3BhcmVuJzonb3BlcmF0b3InO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudHlwZT10aGlzLnZhcmlhYmxlPyd2YXJpYWJsZSc6J251bWJlcic7XG4gICAgfVxuXG4gICAgaXNTdHJpbmcoKXtyZXR1cm4gdGhpcy50eXBlPT09J3BhcmVuJ3x8dGhpcy50eXBlPT09J29wZXJhdG9yJ31cblxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cblxuICAgIHRvU3RyaW5nTGF0ZXgoKXtcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xuICAgICAgICBpZiAodGhpcy5pc1N0cmluZygpKVxuICAgICAgICAgICAgc3RyaW5nKz10aGlzLmdldExhdGV4U3ltYm9sKClcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSd2YXJpYWJsZScpIHN0cmluZys9dGhpcy50b1N0cmluZ1ZhcmlhYmxlKClcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSdudW1iZXInKSBzdHJpbmcrPXRoaXMudmFsdWU7XG4gICAgICAgIHJldHVybiBzdHJpbmdcbiAgICB9XG4gICAgYWZmZWN0ZWRPcGVyYXRvclJhbmdlKGRpcmVjdGlvbjogc3RyaW5nKXtcbiAgICAgICAgaWYodGhpcy50eXBlIT09J29wZXJhdG9yJ3x8dGhpcy52YWx1ZT09PSdFcXVhbHMnKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIGlmKHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZycmJmRpcmVjdGlvbj09PSdsZWZ0JyYmIWlzT3BlcmF0b3JXaXRoQXNzb2NpYXRpdml0eSh0aGlzLnZhbHVlLCBbLTEsIDFdLHRydWUpKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICAgIHRvU3RyaW5nVmFyaWFibGUoKXtcbiAgICAgICAgcmV0dXJuICh0aGlzLnZhbHVlJiZ0aGlzPy52YWx1ZSE9PTE/dGhpcy52YWx1ZTonJykrKHRoaXMudmFyaWFibGV8fCcnKTtcbiAgICB9XG59Il19