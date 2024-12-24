import { arrToRegexString, regExp } from "../tikzjax/tikzjax";
import { findParenIndex, idParentheses } from "../utils/tokenUtensils";
import { getAllMathJaxReferences, getOperatorsByAssociativity, getOperatorsByBracket, hasImplicitMultiplication, searchMathJaxOperators } from "../utils/dataManager";
import { findConsecutiveSequences, flattenArray, parseOperator, Position } from "./mathEngine";
export class mathJaxOperator {
    operator;
    priority;
    associativityNumber;
    group1;
    group2;
    solution;
    constructor(operator, priority, associativityNumber, group1, group2) {
        if (operator)
            this.operator = operator;
        if (priority)
            this.priority = priority;
        if (associativityNumber)
            this.associativityNumber = associativityNumber;
        if (group1)
            this.group1 = group1;
        if (group2)
            this.group2 = group2;
    }
    setGroup1(group) { this.group1 = group; }
    setGroup2(group) { this.group2 = group; }
    addSolution() {
        parseOperator(this);
    }
}
export class MathGroup {
    items = []; // Rename to indicate it's private.
    constructor(items) {
        if (items)
            this.items = items;
    }
    setItems(items) {
        this.items = items;
    }
    numberOnly() {
        return this.items.some(t => !t.isVar());
    }
    hasVariables() {
        return this.items.some(t => t.isVar());
    }
    singular() {
        return this.items.length === 1 && this.items[0] !== undefined;
    }
    isOperable() { return true; }
    getOperableValue() {
        if (this.singular()) {
            return this.items[0] ?? null;
        }
        return null;
    }
    combiningLikeTerms() {
        const overview = new Map();
        this.items.forEach((item) => {
            const key = item.getFullTokenID() || 'operator';
            if (!overview.has(key)) {
                const entry = {
                    count: 0,
                    variable: item.variable,
                    items: []
                };
                overview.set(key, entry);
            }
            const entry = overview.get(key);
            entry.count++;
            entry.items.push(item);
        });
        // Step 2: Combine terms
        const combinedItems = [];
        for (const [key, value] of overview.entries()) {
            if (key.includes("operator")) {
                combinedItems.push(...value.items);
                continue;
            }
            const sum = value.items.reduce((total, item) => total + (item.value || 0), 0);
            const token = new Token(sum, value.variable);
            combinedItems.push(token);
        }
        this.items = combinedItems;
    }
}
export class Tokens {
    tokens = [];
    operatorTokens = [];
    operatorStructure;
    constructor(math) {
        this.tokenize(math);
    }
    tokenize(math) {
        //latexOperators.push(String.raw`[*/^=\+\-\(\)]`)
        //const operators=arrToRegexString(latexOperators)
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
        idParentheses(this.tokens);
        const map = this.tokens.map((token, index) => (token.isValueToken()) ? index : null).filter((item) => item !== null);
        const arr = findConsecutiveSequences(map);
        this.connectAndCombine(arr);
        this.validatePlusMinus();
        let tempTokens = this.tokens.map((t) => {
            if (typeof t.value === 'number')
                return new Token(t.value, t.variable);
            // if(t.type==='operator')return new mathJaxOperator(t.value)
            return t;
        });
        // Step one structure aka replace parentheses with nested arrays
        // Step two Find first operator.and continue from there
        const pos = new Position(tempTokens);
        const math = new mathJaxOperator(pos.operator);
        const group = new MathGroup();
        if (pos.index) {
            const [leftBreak, length] = [pos.left.breakChar, pos.right.breakChar - pos.left.breakChar];
            group.setItems(pos.right.tokens);
            math.setGroup1(group);
            tempTokens.splice(leftBreak, length, math);
        }
        this.tokens = new MathGroup(tempTokens);
        return;
        const parenMap = this.implicitMultiplicationMap();
        parenMap.sort((a, b) => b - a)
            .forEach((value) => {
            this.tokens.splice(value, 0, new BasicMathJaxToken('*'));
        });
        const mapPow = this.tokens.map((token, index) => token.value === 'Pow' ? index : null).filter((item) => item !== null);
        console.log(mapPow);
        mapPow.forEach((index) => {
            //const position=new Position(this,index)
            //const [leftBreak,length] = [position.left.breakChar,position.right.breakChar-position.left.breakChar]
            // this.tokens.insertTokens(leftBreak,length,solved)
        });
    }
    validateIndex(index, margin) {
        margin = margin || 0;
        return index >= 0 + margin && index < this.tokens.length - margin;
    }
    implicitMultiplicationMap() {
        const testDoubleRight = (index) => {
            if (!this.validateIndex(index))
                return false;
            const idx = findParenIndex(null, index).open;
            return this.tokens[index + 1]?.value === '(' && (idx === 0 || !getOperatorsByAssociativity('doubleRight').includes(this.tokens[idx - 1]?.value));
        };
        const check = (index) => {
            if (!this.validateIndex(index))
                return false;
            return this.tokens[index].isValueToken();
        };
        //Map parentheses for implicit multiplication.
        const map = this.tokens
            .map((token, index) => {
            if (token.value === "(" || (hasImplicitMultiplication(token.value))) {
                return check(index - 1) ? index : null;
            }
            else if (token.value === ")") {
                return check(index + 1) || testDoubleRight(index) ? index + 1 : null;
            }
            return null;
        })
            .filter((item) => item !== null);
        return map;
    }
    validatePlusMinus() {
        const map = this.tokens.map((token, index) => token.value === 'Plus' || token.value === 'Minus' ? index : null).filter((index) => index !== null);
        map.forEach((index) => {
            index = this.validateIndex(index, 1) && this.tokens[index - 1].type === 'operator' || this.tokens[index + 1].type === 'operator' ? null : index;
        });
        map.reverse().forEach((index) => {
            const value = this.tokens[index].value === 'Plus' ? 1 : -1;
            this.tokens[index + 1].value *= value;
            this.tokens.splice(index, 1);
        });
    }
    mapParenIndexes() {
        return this.tokens
            .map((token, index) => token.value === "(" ? findParenIndex(undefined, index) : null)
            .filter((item) => item !== null);
    }
    filterParenIndexesForRemoval() {
        return this.mapParenIndexes()
            .filter((item) => {
            const { open: openIndex, close: closeIndex } = item;
            if (openIndex > 0) {
                if (/(operator|paren)/.test(this.tokens[openIndex - 1]?.type)) {
                    return false;
                }
            }
            if (closeIndex < this.tokens.length - 1) {
                if (this.tokens[closeIndex + 1]?.isValueToken()) {
                    return false;
                }
            }
            return true;
        }).flatMap((item) => [item.open, item.close]);
    }
    /*
    findSimilarSuccessor(tokens){
        return this.tokens.findIndex((token, index) =>
                ((tokens[index + 2]?.type !== "operator"&&tokens[index -1]?.type !== "operator")
                &&(this.tokenCompare("type",this.valueTokens(), token, tokens[index + 1]))
        ));
     }*/
    connectNearbyTokens() {
        this.tokens.forEach((token) => {
            if (!(token instanceof Token)) {
                throw new Error("ftygubhnimpo");
            }
        });
        const map = new Set(this.filterParenIndexesForRemoval());
        this.tokens = this.tokens.filter((_, idx) => !map.has(idx));
        //Problem with  = as it's affecting the variable before it
        const check = (index) => {
            return (!this.tokens?.[index - 1]?.affectedOperatorRange?.() &&
                !this.tokens?.[index + 1]?.affectedOperatorRange?.());
        };
        const numMap = this.tokens.map((token, index) => token.type === 'number' && check(index) ? index : null).filter((item) => item !== null);
        const varMap = this.tokens.map((token, index) => token.type === 'variable' && check(index) ? index : null).filter((item) => item !== null);
        const arr = [
            ...findConsecutiveSequences(numMap),
            ...findConsecutiveSequences(varMap),
        ];
        this.connectAndCombine(arr);
        idParentheses(this.tokens);
    }
    connectAndCombine(arr) {
        const indexes = [];
        arr.sort((a, b) => b[0] - a[0]).forEach(el => {
            indexes.push({ start: el[0], end: el[el.length - 1] });
        });
        indexes.forEach((index) => {
            let value = Number(this.tokens[index.start].value);
            const isVar = this.tokens.slice(index.start, index.end + 1).find((token) => token.type.includes('var'));
            for (let i = index.start + 1; i <= index.end; i++) {
                value = this.tokens[i].value + value;
            }
            //if (isVar)updatedToken.variable=isVar.variable
            this.tokens[index.start] = new Token(value, isVar?.variable);
            this.tokens.splice(index.start + 1, index.end - index.start);
        });
    }
    expressionVariableValidity() {
        if (Array.isArray(this.tokens)
            && this.tokens.some(token => /(variable|powerVariable)/.test(token.type))
            && !this.tokens.some(token => token.value === "=")) {
            return Infinity;
        }
    }
    insertTokens(start, length, objects) {
        objects = flattenArray(objects);
        if (!Array.isArray(objects)) {
            console.error("Expected `objects` to be an array, but received:", objects);
            return;
        }
        this.tokens.splice(start, length, ...objects);
    }
    reconstruct(tokens) {
        if (!tokens) {
            tokens = this.tokens;
        }
        const addPlusIndexes = this.indexesToAddPlus(tokens);
        const curlyBracketIndexes = this.curlyBracketIDs(tokens).flatMap(({ open, close }) => [open, close]);
        let math = "";
        for (let i = 0; i < tokens.length; i++) {
            let temp;
            math += addPlusIndexes.includes(i) ? '+' : '';
            if (tokens[i]?.value === "(" && tokens[tokens.findLastIndex((token, index) => token.id === tokens[i].id && tokens[index + 1]) + 1].value === "/") {
                math += "\\frac";
            }
            switch (tokens[i]?.type) {
                case "number":
                case "variable":
                case "powerVariable":
                case "operator":
                    if (tokens[i] instanceof Token)
                        math += tokens[i]?.toStringLatex();
                    //temp=roundBySettings(tokens[i].value)
                    //math+=temp+(i+1<tokens.length&&/(frac)/.test(tokens[i+1].value)?"+":"");
                    break;
                case "paren":
                    math += curlyBracketIndexes.contains(i) ? tokens[i].value.replace(/\(/, "{").replace(/\)/, "}") : tokens[i].value;
                    break;
                default:
                    console.error(this.tokens);
                    throw new Error(`Unexpected token type given to reconstruct: type ${tokens[i]?.type}`);
            }
        }
        return math;
    }
    curlyBracketIDs(tokens = this.tokens) {
        const rightBrackets = [...getOperatorsByBracket('both'), ...getOperatorsByBracket('right')];
        const bothBrackets = [...getOperatorsByBracket('both')];
        const doubleRightBrackets = [...getOperatorsByBracket('doubleRight')];
        const map = [];
        tokens.forEach((token, index) => {
            const prevToken = tokens[index - 1]?.value;
            const nextToken = tokens[index + 1]?.value;
            if (token.value === '(') {
                if (index > 0 && doubleRightBrackets.includes(prevToken)) {
                    const p1 = findParenIndex(undefined, index, tokens);
                    const p2 = findParenIndex(undefined, p1.close + 1, tokens);
                    map.push(p1, p2);
                }
                else if (index > 0 && rightBrackets.includes(prevToken)) {
                    map.push(findParenIndex(undefined, index, tokens));
                }
            }
            else if (token.value === ')' && bothBrackets.includes(nextToken)) {
                map.push(findParenIndex(undefined, index, tokens));
            }
        });
        return map;
    }
    indexesToAddPlus(tokens) {
        return tokens.map((token, index) => index > 0
            && tokens[index - 1]?.isValueToken()
            && token?.isValueToken() && token.value >= 0 ? index : null).filter(item => item !== null);
    }
    tokenCompare(compare, value, token, nextToken) {
        const regExpvalue = (value instanceof RegExp) ? value : new RegExp(value);
        return ((value === null || regExpvalue.test(token[compare])) &&
            token[compare] === nextToken?.[compare]);
    }
}
export class Token {
    value;
    variable;
    constructor(value, variable) {
        this.value = value;
        this.variable = variable;
    }
    isVar() { return this.variable !== undefined; }
    getFullTokenID() {
        return this.variable ? `variable:${this.variable}` : 'number';
    }
}
export class BasicMathJaxToken {
    type;
    value;
    variable;
    modifier;
    id;
    constructor(value, variable) {
        this.value = value;
        this.variable = variable;
        this.setType();
        this.insurProperFormatting();
    }
    insurProperFormatting() {
        if (this.type === 'operator' && typeof this.value === 'string') {
            this.value = searchMathJaxOperators(this.value)?.name;
        }
        // if (!this.value){throw new Error('wtf Value was undefined at token insurProperFormatting')}
    }
    getId() { return this.id.id; }
    ;
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
        if (typeof this.value === 'string' && direction === 'left' && !getOperatorsByAssociativity('both').includes(this.value))
            return false;
        return true;
    }
    toStringVariable() {
        return (this.value && this?.value !== 1 ? this.value : '') + (this.variable || '');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEpheFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tYXRoUGFyc2VyL21hdGhKYXhUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUEsT0FBTyxFQUFFLGdCQUFnQixFQUFRLE1BQU0sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBR3BFLE9BQU8sRUFBRSxjQUFjLEVBQVEsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDN0UsT0FBTyxFQUFFLHVCQUF1QixFQUFpQywyQkFBMkIsRUFBRSxxQkFBcUIsRUFBRSx5QkFBeUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBSXJNLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUkvRixNQUFNLE9BQU8sZUFBZTtJQUN4QixRQUFRLENBQVM7SUFDakIsUUFBUSxDQUFTO0lBQ2pCLG1CQUFtQixDQUFTO0lBQzVCLE1BQU0sQ0FBWTtJQUNsQixNQUFNLENBQWE7SUFDbkIsUUFBUSxDQUFZO0lBQ3BCLFlBQVksUUFBaUIsRUFBQyxRQUFpQixFQUFDLG1CQUE0QixFQUFDLE1BQWtCLEVBQUMsTUFBa0I7UUFDOUcsSUFBSSxRQUFRO1lBQUMsSUFBSSxDQUFDLFFBQVEsR0FBQyxRQUFRLENBQUE7UUFDbkMsSUFBSSxRQUFRO1lBQUMsSUFBSSxDQUFDLFFBQVEsR0FBQyxRQUFRLENBQUE7UUFDbkMsSUFBSSxtQkFBbUI7WUFBQyxJQUFJLENBQUMsbUJBQW1CLEdBQUMsbUJBQW1CLENBQUE7UUFDcEUsSUFBSSxNQUFNO1lBQUMsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUE7UUFDN0IsSUFBSSxNQUFNO1lBQUMsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUE7SUFDakMsQ0FBQztJQUNELFNBQVMsQ0FBQyxLQUFnQixJQUFFLElBQUksQ0FBQyxNQUFN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bkMsSUFBRyxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxJQUFJLENBQUMsS0FBSyxLQUFHLFFBQVE7WUFDNUMsT0FBTyxLQUFLLENBQUE7UUFDaEIsSUFBRyxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUcsUUFBUSxJQUFFLFNBQVMsS0FBRyxNQUFNLElBQUUsQ0FBQywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUMxRyxPQUFPLEtBQUssQ0FBQTtRQUNoQixPQUFPLElBQUksQ0FBQTtJQUNmLENBQUM7SUFDRCxnQkFBZ0I7UUFDWixPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBRSxJQUFJLEVBQUUsS0FBSyxLQUFHLENBQUMsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLEtBQUssQ0FBQSxDQUFDLENBQUEsRUFBRSxDQUFDLEdBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzNFLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIlxyXG5pbXBvcnQgeyBxdWFkLGNhbGN1bGF0ZUJpbm9tLHJvdW5kQnlTZXR0aW5ncyAsZGVncmVlc1RvUmFkaWFucyxyYWRpYW5zVG9EZWdyZWVzLCBjYWxjdWxhdGVGYWN0b3JpYWx9IGZyb20gXCIuL21hdGhVdGlsaXRpZXNcIjtcclxuaW1wb3J0IHsgZXhwYW5kRXhwcmVzc2lvbixjdXJseUJyYWNrZXRzUmVnZXggfSBmcm9tIFwiLi4vaW1WZXJ5TGF6eVwiO1xyXG5pbXBvcnQgeyB0eXBlIH0gZnJvbSBcIm9zXCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIHJlZ0V4cCB9IGZyb20gXCIuLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgIH0gZnJvbSBcInNyYy91dGlscy9zdGF0aWNEYXRhXCI7XHJcbmltcG9ydCB7IGNwIH0gZnJvbSBcImZzXCI7XHJcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBQYXJlbixpZFBhcmVudGhlc2VzIH0gZnJvbSBcIi4uL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcclxuaW1wb3J0IHsgZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMsIGdldE1hdGhKYXhPcGVyYXRvcnNCeVByaW9yaXR5LCBnZXRPcGVyYXRvcnNCeUFzc29jaWF0aXZpdHksIGdldE9wZXJhdG9yc0J5QnJhY2tldCwgaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbiwgc2VhcmNoTWF0aEpheE9wZXJhdG9ycyB9IGZyb20gXCIuLi91dGlscy9kYXRhTWFuYWdlclwiO1xyXG5pbXBvcnQgeyBudW1iZXIsIHN0cmluZyB9IGZyb20gXCJ6b2RcIjtcclxuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4gfSBmcm9tIFwic3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheFwiO1xyXG5pbXBvcnQgeyBncm91cCB9IGZyb20gXCJjb25zb2xlXCI7XHJcbmltcG9ydCB7IGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcywgZmxhdHRlbkFycmF5LCBwYXJzZU9wZXJhdG9yLCBQb3NpdGlvbiB9IGZyb20gXCIuL21hdGhFbmdpbmVcIjtcclxuaW1wb3J0IHsgb3BlcmF0b3JzIH0gZnJvbSBcInNyYy9lZGl0b3JfZXh0ZW5zaW9ucy9jb25jZWFsX21hcHNcIjtcclxuXHJcblxyXG5leHBvcnQgY2xhc3MgbWF0aEpheE9wZXJhdG9ye1xyXG4gICAgb3BlcmF0b3I6IHN0cmluZztcclxuICAgIHByaW9yaXR5OiBudW1iZXI7XHJcbiAgICBhc3NvY2lhdGl2aXR5TnVtYmVyOiBudW1iZXI7XHJcbiAgICBncm91cDE6IE1hdGhHcm91cDtcclxuICAgIGdyb3VwMj86IE1hdGhHcm91cDtcclxuICAgIHNvbHV0aW9uPzogTWF0aEdyb3VwXHJcbiAgICBjb25zdHJ1Y3RvcihvcGVyYXRvcj86IHN0cmluZyxwcmlvcml0eT86IG51bWJlcixhc3NvY2lhdGl2aXR5TnVtYmVyPzogbnVtYmVyLGdyb3VwMT86IE1hdGhHcm91cCxncm91cDI/OiBNYXRoR3JvdXApe1xyXG4gICAgICAgIGlmIChvcGVyYXRvcil0aGlzLm9wZXJhdG9yPW9wZXJhdG9yXHJcbiAgICAgICAgaWYgKHByaW9yaXR5KXRoaXMucHJpb3JpdHk9cHJpb3JpdHlcclxuICAgICAgICBpZiAoYXNzb2NpYXRpdml0eU51bWJlcil0aGlzLmFzc29jaWF0aXZpdHlOdW1iZXI9YXNzb2NpYXRpdml0eU51bWJlclxyXG4gICAgICAgIGlmIChncm91cDEpdGhpcy5ncm91cDE9Z3JvdXAxXHJcbiAgICAgICAgaWYgKGdyb3VwMil0aGlzLmdyb3VwMj1ncm91cDJcclxuICAgIH1cclxuICAgIHNldEdyb3VwMShncm91cDogTWF0aEdyb3VwKXt0aGlzLmdyb3VwMT1ncm91cH1cclxuICAgIHNldEdyb3VwMihncm91cDogTWF0aEdyb3VwKXt0aGlzLmdyb3VwMj1ncm91cH1cclxuICAgIGFkZFNvbHV0aW9uKCl7XHJcbiAgICAgICAgcGFyc2VPcGVyYXRvcih0aGlzKVxyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgTWF0aEdyb3VwIHtcclxuICAgIGl0ZW1zOiBUb2tlbltdID0gW107IC8vIFJlbmFtZSB0byBpbmRpY2F0ZSBpdCdzIHByaXZhdGUuXHJcblxyXG4gICAgY29uc3RydWN0b3IoaXRlbXM/OiBUb2tlbltdKSB7XHJcbiAgICAgICAgaWYoaXRlbXMpXHJcbiAgICAgICAgICAgIHRoaXMuaXRlbXM9aXRlbXNcclxuICAgIH1cclxuXHJcbiAgICBzZXRJdGVtcyhpdGVtczogVG9rZW5bXSkge1xyXG4gICAgICAgIHRoaXMuaXRlbXMgPSBpdGVtcztcclxuICAgIH1cclxuXHJcblxyXG4gICAgbnVtYmVyT25seSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5zb21lKHQgPT4gIXQuaXNWYXIoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFzVmFyaWFibGVzKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLml0ZW1zLnNvbWUodCA9PiB0LmlzVmFyKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHNpbmd1bGFyKCk6IHRoaXMgaXMgeyBpdGVtczogW1Rva2VuXSB9IHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGggPT09IDEgJiYgdGhpcy5pdGVtc1swXSAhPT0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG4gICAgaXNPcGVyYWJsZSgpe3JldHVybiB0cnVlfVxyXG4gICAgZ2V0T3BlcmFibGVWYWx1ZSgpOiBUb2tlbiB8IG51bGwge1xyXG4gICAgICAgIGlmICh0aGlzLnNpbmd1bGFyKCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXNbMF0gPz8gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBjb21iaW5pbmdMaWtlVGVybXMoKSB7XHJcbiAgICAgICAgY29uc3Qgb3ZlcnZpZXcgPSBuZXcgTWFwKCk7XHJcbiAgICAgICAgdGhpcy5pdGVtcy5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5nZXRGdWxsVG9rZW5JRCgpIHx8ICdvcGVyYXRvcic7XHJcbiAgICAgICAgICAgIGlmICghb3ZlcnZpZXcuaGFzKGtleSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiAwLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlOiBpdGVtLnZhcmlhYmxlLFxyXG4gICAgICAgICAgICAgICAgICAgIGl0ZW1zOiBbXVxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIG92ZXJ2aWV3LnNldChrZXksIGVudHJ5KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gb3ZlcnZpZXcuZ2V0KGtleSk7XHJcbiAgICAgICAgICAgIGVudHJ5LmNvdW50Kys7XHJcbiAgICAgICAgICAgIGVudHJ5Lml0ZW1zLnB1c2goaXRlbSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICBcclxuICAgICAgICAvLyBTdGVwIDI6IENvbWJpbmUgdGVybXNcclxuICAgICAgICBjb25zdCBjb21iaW5lZEl0ZW1zID0gW107XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2Ygb3ZlcnZpZXcuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgIGlmIChrZXkuaW5jbHVkZXMoXCJvcGVyYXRvclwiKSkge1xyXG4gICAgICAgICAgICAgICAgY29tYmluZWRJdGVtcy5wdXNoKC4uLnZhbHVlLml0ZW1zKTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IHN1bSA9IHZhbHVlLml0ZW1zLnJlZHVjZSgodG90YWw6IGFueSwgaXRlbTogVG9rZW4pID0+IHRvdGFsICsgKGl0ZW0udmFsdWUgfHwgMCksIDApO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gbmV3IFRva2VuKHN1bSwgdmFsdWUudmFyaWFibGUpO1xyXG4gICAgICAgICAgICBjb21iaW5lZEl0ZW1zLnB1c2godG9rZW4pO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zID0gY29tYmluZWRJdGVtcztcclxuICAgIH1cclxuICAgIFxyXG59XHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBUb2tlbnN7XHJcbiAgICB0b2tlbnM6IGFueT1bXTtcclxuICAgIG9wZXJhdG9yVG9rZW5zOiBhbnlbXT1bXVxyXG4gICAgb3BlcmF0b3JTdHJ1Y3R1cmU6IG1hdGhKYXhPcGVyYXRvcjtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IobWF0aDogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnRva2VuaXplKG1hdGgpO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUobWF0aDogc3RyaW5nKXtcclxuICAgICAgICAvL2xhdGV4T3BlcmF0b3JzLnB1c2goU3RyaW5nLnJhd2BbKi9ePVxcK1xcLVxcKFxcKV1gKVxyXG4gICAgICAgIC8vY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcobGF0ZXhPcGVyYXRvcnMpXHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzPWFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsTWF0aEpheFJlZmVyZW5jZXMoKSlcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gbWF0aC5zbGljZShpKS5tYXRjaChyZWdFeHAoJ14nICsgb3BlcmF0b3JzKSk7XHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4obWF0Y2hbMF0pKTtcclxuICAgICAgICAgICAgICAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspLyk7Ly8oW2EtekEtWl0/KS8pO1xyXG4gICAgICAgICAgICBpZiAoISFtYXRjaClcclxuICAgICAgICAgICAgeyAgIGkrPW1hdGNoWzBdLmxlbmd0aC0xXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY01hdGhKYXhUb2tlbihwYXJzZUZsb2F0KG1hdGNoWzBdKSkpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9bWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rKF9cXChbYS16QS1aMC05XSpcXCkpKi8pXHJcbiAgICAgICAgICAgIGlmICghIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICBpKz1tYXRjaFswXS5sZW5ndGgtMVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNNYXRoSmF4VG9rZW4oMSxtYXRjaFswXSkpXHJcbiAgICAgICAgICAgICAgICAvL3Rva2Vucy5wdXNoKHt0eXBlOiBcInZhcmlhYmxlXCIsdmFyaWFibGU6IHZhcmkucmVwbGFjZShcIihcIixcIntcIikucmVwbGFjZShcIilcIixcIn1cIiksdmFsdWU6IDF9KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY2hhciBcIiR7bWF0aFtpXX1cImApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBvc3RQcm9jZXNzVG9rZW5zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcG9zdFByb2Nlc3NUb2tlbnMoKXtcclxuICAgICAgICAvKnJ1bGVzIHRvIGFiaWQgYnk6XHJcbiAgICAgICAgMS4gKy0gSWYgcGFydCBvZiB0aGUgbnVtYmVyIHRoZXkgYXJlIGFic29yYmVkIGludG8gdGhlIG51bWJlclxyXG4gICAgICAgICovXHJcbiAgICAgICBcclxuICAgICAgICBpZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKTtcclxuICAgICAgICBjb25zdCBtYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogQmFzaWNNYXRoSmF4VG9rZW4saW5kZXg6IGFueSk9PiAodG9rZW4uaXNWYWx1ZVRva2VuKCkpP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBjb25zdCBhcnI9ZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG1hcCk7XHJcbiAgICAgICAgdGhpcy5jb25uZWN0QW5kQ29tYmluZShhcnIpO1xyXG4gICAgICAgIHRoaXMudmFsaWRhdGVQbHVzTWludXMoKTtcclxuICAgICAgICBsZXQgdGVtcFRva2Vucz10aGlzLnRva2Vucy5tYXAoKHQ6QmFzaWNNYXRoSmF4VG9rZW4pPT57XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiB0LnZhbHVlPT09J251bWJlcicpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFRva2VuKHQudmFsdWUsdC52YXJpYWJsZSlcclxuICAgICAgICAgICAvLyBpZih0LnR5cGU9PT0nb3BlcmF0b3InKXJldHVybiBuZXcgbWF0aEpheE9wZXJhdG9yKHQudmFsdWUpXHJcbiAgICAgICAgcmV0dXJuIHQ7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgb25lIHN0cnVjdHVyZSBha2EgcmVwbGFjZSBwYXJlbnRoZXNlcyB3aXRoIG5lc3RlZCBhcnJheXNcclxuICAgICAgICAvLyBTdGVwIHR3byBGaW5kIGZpcnN0IG9wZXJhdG9yLmFuZCBjb250aW51ZSBmcm9tIHRoZXJlXHJcblxyXG4gICAgICAgIGNvbnN0IHBvcz1uZXcgUG9zaXRpb24odGVtcFRva2VucylcclxuICAgICAgICBjb25zdCBtYXRoPW5ldyBtYXRoSmF4T3BlcmF0b3IocG9zLm9wZXJhdG9yKVxyXG4gICAgICAgIGNvbnN0IGdyb3VwPW5ldyBNYXRoR3JvdXAoKVxyXG4gICAgICAgIGlmKHBvcy5pbmRleCl7XHJcbiAgICAgICAgY29uc3QgW2xlZnRCcmVhayxsZW5ndGhdID0gW3Bvcy5sZWZ0LmJyZWFrQ2hhcixwb3MucmlnaHQuYnJlYWtDaGFyLXBvcy5sZWZ0LmJyZWFrQ2hhcl1cclxuICAgICAgICBncm91cC5zZXRJdGVtcyhwb3MucmlnaHQudG9rZW5zKVxyXG4gICAgICAgIG1hdGguc2V0R3JvdXAxKGdyb3VwKVxyXG4gICAgICAgIHRlbXBUb2tlbnMuc3BsaWNlKGxlZnRCcmVhayxsZW5ndGgsbWF0aCl9XHJcblxyXG4gICAgICAgIHRoaXMudG9rZW5zPW5ldyBNYXRoR3JvdXAodGVtcFRva2VucylcclxuICAgICAgICByZXR1cm4gO1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICBjb25zdCBwYXJlbk1hcD10aGlzLmltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKVxyXG4gICAgICAgIHBhcmVuTWFwLnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBiIC0gYSlcclxuICAgICAgICAuZm9yRWFjaCgodmFsdWU6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UodmFsdWUsIDAsIG5ldyAgQmFzaWNNYXRoSmF4VG9rZW4oJyonKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcFBvdz10aGlzLnRva2Vucy5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi52YWx1ZT09PSdQb3cnP2luZGV4Om51bGwpLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbClcclxuICAgICAgICBjb25zb2xlLmxvZyhtYXBQb3cpXHJcbiAgICAgICAgbWFwUG93LmZvckVhY2goKGluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHtcclxuICAgICAgICAgICAgLy9jb25zdCBwb3NpdGlvbj1uZXcgUG9zaXRpb24odGhpcyxpbmRleClcclxuICAgICAgICAgICAgLy9jb25zdCBbbGVmdEJyZWFrLGxlbmd0aF0gPSBbcG9zaXRpb24ubGVmdC5icmVha0NoYXIscG9zaXRpb24ucmlnaHQuYnJlYWtDaGFyLXBvc2l0aW9uLmxlZnQuYnJlYWtDaGFyXVxyXG4gICAgICAgICAgIC8vIHRoaXMudG9rZW5zLmluc2VydFRva2VucyhsZWZ0QnJlYWssbGVuZ3RoLHNvbHZlZClcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcixtYXJnaW4/OiBudW1iZXIpe1xyXG4gICAgICAgIG1hcmdpbj1tYXJnaW58fDA7XHJcbiAgICAgICAgcmV0dXJuIGluZGV4Pj0wK21hcmdpbiYmaW5kZXg8dGhpcy50b2tlbnMubGVuZ3RoLW1hcmdpbjtcclxuICAgIH1cclxuICAgIGltcGxpY2l0TXVsdGlwbGljYXRpb25NYXAoKXtcclxuICAgICAgICBjb25zdCB0ZXN0RG91YmxlUmlnaHQgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMudmFsaWRhdGVJbmRleChpbmRleCkpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgaWR4PWZpbmRQYXJlbkluZGV4KG51bGwsaW5kZXgpLm9wZW47XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1tpbmRleCsxXT8udmFsdWU9PT0nKCcmJihpZHg9PT0wfHwhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdkb3VibGVSaWdodCcpLmluY2x1ZGVzKHRoaXMudG9rZW5zW2lkeC0xXT8udmFsdWUpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb25zdCBjaGVjayA9IChpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy52YWxpZGF0ZUluZGV4KGluZGV4KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNbaW5kZXhdLmlzVmFsdWVUb2tlbigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vTWFwIHBhcmVudGhlc2VzIGZvciBpbXBsaWNpdCBtdWx0aXBsaWNhdGlvbi5cclxuICAgICAgICBjb25zdCBtYXAgPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgICAgICAubWFwKCh0b2tlbjogeyB2YWx1ZTogc3RyaW5nOyB9LCBpbmRleDogbnVtYmVyKSA9PiB7IFxyXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSBcIihcIiB8fCAoaGFzSW1wbGljaXRNdWx0aXBsaWNhdGlvbih0b2tlbi52YWx1ZSkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZWNrKGluZGV4IC0gMSkgPyBpbmRleCA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuLnZhbHVlID09PSBcIilcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVjayhpbmRleCArIDEpIHx8dGVzdERvdWJsZVJpZ2h0KGluZGV4KT8gaW5kZXgrMSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbTogbnVsbCkgPT4gaXRlbSAhPT0gbnVsbCk7XHJcbiAgICAgICAgcmV0dXJuIG1hcFxyXG4gICAgfVxyXG5cclxuICAgIHZhbGlkYXRlUGx1c01pbnVzKCl7XHJcbiAgICAgICAgY29uc3QgbWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdmFsdWU6IHN0cmluZzsgfSxpbmRleDogYW55KT0+IHRva2VuLnZhbHVlPT09J1BsdXMnfHx0b2tlbi52YWx1ZT09PSdNaW51cyc/aW5kZXg6bnVsbCkuZmlsdGVyKChpbmRleDogbnVsbCk9PiBpbmRleCE9PW51bGwpXHJcblxyXG4gICAgICAgIG1hcC5mb3JFYWNoKChpbmRleDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGluZGV4PXRoaXMudmFsaWRhdGVJbmRleChpbmRleCwxKSYmdGhpcy50b2tlbnNbaW5kZXgtMV0udHlwZT09PSdvcGVyYXRvcid8fHRoaXMudG9rZW5zW2luZGV4KzFdLnR5cGU9PT0nb3BlcmF0b3InP251bGw6aW5kZXg7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIG1hcC5yZXZlcnNlKCkuZm9yRWFjaCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB2YWx1ZT10aGlzLnRva2Vuc1tpbmRleF0udmFsdWU9PT0nUGx1cyc/MTotMTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXgrMV0udmFsdWUqPXZhbHVlO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsMSlcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIG1hcFBhcmVuSW5kZXhlcygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuOiB7IHZhbHVlOiBzdHJpbmc7IH0sIGluZGV4OiBhbnkpID0+IHRva2VuLnZhbHVlID09PSBcIihcIiA/IGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgpIDogbnVsbClcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiBudWxsKSA9PiBpdGVtICE9PSBudWxsKVxyXG4gICAgfVxyXG5cclxuICAgIGZpbHRlclBhcmVuSW5kZXhlc0ZvclJlbW92YWwoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwUGFyZW5JbmRleGVzKClcclxuICAgICAgICAgICAgLmZpbHRlcigoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB7IG9wZW46IG9wZW5JbmRleCwgY2xvc2U6IGNsb3NlSW5kZXggfSA9IGl0ZW07XHJcbiAgICAgICAgICAgICAgICBpZiAob3BlbkluZGV4ID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICgvKG9wZXJhdG9yfHBhcmVuKS8udGVzdCh0aGlzLnRva2Vuc1tvcGVuSW5kZXggLSAxXT8udHlwZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmIChjbG9zZUluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tjbG9zZUluZGV4ICsgMV0/LmlzVmFsdWVUb2tlbigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfSkuZmxhdE1hcCgoaXRlbTogYW55KSA9PiBbaXRlbS5vcGVuLCBpdGVtLmNsb3NlXSk7XHJcbiAgICB9ICAgIFxyXG4gICAgXHJcbiAgICAvKlxyXG4gICAgZmluZFNpbWlsYXJTdWNjZXNzb3IodG9rZW5zKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICAoKHRva2Vuc1tpbmRleCArIDJdPy50eXBlICE9PSBcIm9wZXJhdG9yXCImJnRva2Vuc1tpbmRleCAtMV0/LnR5cGUgIT09IFwib3BlcmF0b3JcIilcclxuICAgICAgICAgICAgICAgICYmKHRoaXMudG9rZW5Db21wYXJlKFwidHlwZVwiLHRoaXMudmFsdWVUb2tlbnMoKSwgdG9rZW4sIHRva2Vuc1tpbmRleCArIDFdKSlcclxuICAgICAgICApKTtcclxuICAgICB9Ki9cclxuXHJcbiAgICBjb25uZWN0TmVhcmJ5VG9rZW5zKCl7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIFRva2VuKSl7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJmdHlndWJobmltcG9cIilcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG1hcCA9IG5ldyBTZXQodGhpcy5maWx0ZXJQYXJlbkluZGV4ZXNGb3JSZW1vdmFsKCkpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKChfOiBhbnksIGlkeDogdW5rbm93bikgPT4gIW1hcC5oYXMoaWR4KSk7XHJcbiAgICAgICAgLy9Qcm9ibGVtIHdpdGggID0gYXMgaXQncyBhZmZlY3RpbmcgdGhlIHZhcmlhYmxlIGJlZm9yZSBpdFxyXG4gICAgICAgIGNvbnN0IGNoZWNrID0gKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4IC0gMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKCkgJiZcclxuICAgICAgICAgICAgICAgICF0aGlzLnRva2Vucz8uW2luZGV4ICsgMV0/LmFmZmVjdGVkT3BlcmF0b3JSYW5nZT8uKClcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBudW1NYXA9dGhpcy50b2tlbnMubWFwKCh0b2tlbjogeyB0eXBlOiBzdHJpbmc7IH0saW5kZXg6IGFueSk9PiB0b2tlbi50eXBlPT09J251bWJlcicmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgY29uc3QgdmFyTWFwPXRoaXMudG9rZW5zLm1hcCgodG9rZW46IHsgdHlwZTogc3RyaW5nOyB9LGluZGV4OiBhbnkpPT4gdG9rZW4udHlwZT09PSd2YXJpYWJsZScmJmNoZWNrKGluZGV4KT9pbmRleDpudWxsKS5maWx0ZXIoKGl0ZW06IG51bGwpID0+IGl0ZW0gIT09IG51bGwpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgYXJyID0gW1xyXG4gICAgICAgICAgICAuLi5maW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobnVtTWFwKSwgXHJcbiAgICAgICAgICAgIC4uLmZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyh2YXJNYXApLCBcclxuICAgICAgICBdO1xyXG4gICAgICAgIHRoaXMuY29ubmVjdEFuZENvbWJpbmUoYXJyKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXHJcbiAgICB9XHJcblxyXG5cclxuICAgIGNvbm5lY3RBbmRDb21iaW5lKGFycjogYW55W10pe1xyXG4gICAgICAgIGNvbnN0IGluZGV4ZXM6YW55PVtdXHJcblxyXG4gICAgICAgIGFyci5zb3J0KChhLCBiKSA9PiBiWzBdIC0gYVswXSkuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGluZGV4ZXMucHVzaCh7c3RhcnQ6IGVsWzBdLGVuZDogZWxbZWwubGVuZ3RoIC0gMV19KVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpbmRleGVzLmZvckVhY2goKGluZGV4OiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyOyB9KSA9PiB7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IE51bWJlcih0aGlzLnRva2Vuc1tpbmRleC5zdGFydF0udmFsdWUpO1xyXG4gICAgICAgICAgICBjb25zdCBpc1Zhcj10aGlzLnRva2Vucy5zbGljZShpbmRleC5zdGFydCxpbmRleC5lbmQrMSkuZmluZCgodG9rZW46IGFueSk9PiB0b2tlbi50eXBlLmluY2x1ZGVzKCd2YXInKSk7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGk9aW5kZXguc3RhcnQrMTtpPD1pbmRleC5lbmQ7aSsrKXtcclxuICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLnRva2Vuc1tpXS52YWx1ZSArIHZhbHVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvL2lmIChpc1Zhcil1cGRhdGVkVG9rZW4udmFyaWFibGU9aXNWYXIudmFyaWFibGVcclxuICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXguc3RhcnRdID0gbmV3IFRva2VuKHZhbHVlLGlzVmFyPy52YXJpYWJsZSk7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5zdGFydCsxLCBpbmRleC5lbmQgLSBpbmRleC5zdGFydCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZXhwcmVzc2lvblZhcmlhYmxlVmFsaWRpdHkoKXtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodGhpcy50b2tlbnMpIFxyXG4gICAgICAgICAgICAmJiB0aGlzLnRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW4udHlwZSkpIFxyXG4gICAgICAgICAgICAmJiAhdGhpcy50b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gXCI9XCIpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtyZXR1cm4gSW5maW5pdHl9XHJcbiAgICB9XHJcblxyXG4gICAgaW5zZXJ0VG9rZW5zKHN0YXJ0OiBhbnksIGxlbmd0aDogbnVtYmVyLCBvYmplY3RzOiBhbnlbXSB8IFRva2VuKSB7XHJcbiAgICAgICAgb2JqZWN0cyA9IGZsYXR0ZW5BcnJheShvYmplY3RzKTtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0cykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkV4cGVjdGVkIGBvYmplY3RzYCB0byBiZSBhbiBhcnJheSwgYnV0IHJlY2VpdmVkOlwiLCBvYmplY3RzKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGxlbmd0aCwgLi4ub2JqZWN0cyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVjb25zdHJ1Y3QodG9rZW5zPzogYW55KXtcclxuICAgICAgICBpZiAoIXRva2Vucyl7dG9rZW5zPXRoaXMudG9rZW5zO31cclxuICAgICAgICBjb25zdCBhZGRQbHVzSW5kZXhlcz10aGlzLmluZGV4ZXNUb0FkZFBsdXModG9rZW5zKTtcclxuICAgICAgICBjb25zdCBjdXJseUJyYWNrZXRJbmRleGVzID0gdGhpcy5jdXJseUJyYWNrZXRJRHModG9rZW5zKS5mbGF0TWFwKCh7IG9wZW4sIGNsb3NlIH0pID0+IFtvcGVuLCBjbG9zZV0pO1xyXG4gICAgICAgIGxldCBtYXRoID0gXCJcIjtcclxuICAgICAgICBmb3IgKGxldCBpPTA7aTx0b2tlbnMubGVuZ3RoO2krKyl7XHJcbiAgICAgICAgICAgIGxldCB0ZW1wO1xyXG4gICAgICAgICAgICBtYXRoKz1hZGRQbHVzSW5kZXhlcy5pbmNsdWRlcyhpKT8nKyc6Jyc7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0/LnZhbHVlPT09XCIoXCImJnRva2Vuc1t0b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW46IHsgaWQ6IGFueTsgfSwgaW5kZXg6IG51bWJlcikgPT4gdG9rZW4uaWQgPT09IHRva2Vuc1tpXS5pZCYmdG9rZW5zW2luZGV4KzFdKSsxXS52YWx1ZT09PVwiL1wiKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBtYXRoKz1cIlxcXFxmcmFjXCI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc3dpdGNoICh0b2tlbnNbaV0/LnR5cGUpe1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm51bWJlclwiOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwicG93ZXJWYXJpYWJsZVwiOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm9wZXJhdG9yXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpXSBpbnN0YW5jZW9mIFRva2VuKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0/LnRvU3RyaW5nTGF0ZXgoKVxyXG4gICAgICAgICAgICAgICAgICAgIC8vdGVtcD1yb3VuZEJ5U2V0dGluZ3ModG9rZW5zW2ldLnZhbHVlKVxyXG4gICAgICAgICAgICAgICAgICAgIC8vbWF0aCs9dGVtcCsoaSsxPHRva2Vucy5sZW5ndGgmJi8oZnJhYykvLnRlc3QodG9rZW5zW2krMV0udmFsdWUpP1wiK1wiOlwiXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInBhcmVuXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9Y3VybHlCcmFja2V0SW5kZXhlcy5jb250YWlucyhpKT90b2tlbnNbaV0udmFsdWUucmVwbGFjZSgvXFwoLyxcIntcIikucmVwbGFjZSgvXFwpLyxcIn1cIik6dG9rZW5zW2ldLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKHRoaXMudG9rZW5zKVxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCB0b2tlbiB0eXBlIGdpdmVuIHRvIHJlY29uc3RydWN0OiB0eXBlICR7dG9rZW5zW2ldPy50eXBlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRoXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGN1cmx5QnJhY2tldElEcyh0b2tlbnMgPSB0aGlzLnRva2Vucykge1xyXG4gICAgICAgIGNvbnN0IHJpZ2h0QnJhY2tldHMgPSBbLi4uZ2V0T3BlcmF0b3JzQnlCcmFja2V0KCdib3RoJyksIC4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgncmlnaHQnKV07XHJcbiAgICAgICAgY29uc3QgYm90aEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnYm90aCcpXTtcclxuICAgICAgICBjb25zdCBkb3VibGVSaWdodEJyYWNrZXRzID0gWy4uLmdldE9wZXJhdG9yc0J5QnJhY2tldCgnZG91YmxlUmlnaHQnKV07XHJcbiAgICAgICAgY29uc3QgbWFwOiB7IG9wZW46IGFueTsgY2xvc2U6IGFueTsgaWQ6IGFueTsgfVtdID0gW107XHJcbiAgICBcclxuICAgICAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW46IHsgdmFsdWU6IHN0cmluZzsgfSwgaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSB0b2tlbnNbaW5kZXggLSAxXT8udmFsdWU7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRUb2tlbiA9IHRva2Vuc1tpbmRleCArIDFdPy52YWx1ZTtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09ICcoJykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBkb3VibGVSaWdodEJyYWNrZXRzLmluY2x1ZGVzKHByZXZUb2tlbikpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwMSA9IGZpbmRQYXJlbkluZGV4KHVuZGVmaW5lZCwgaW5kZXgsIHRva2Vucyk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcDIgPSBmaW5kUGFyZW5JbmRleCh1bmRlZmluZWQsIHAxLmNsb3NlICsgMSwgdG9rZW5zKTtcclxuICAgICAgICAgICAgICAgICAgICBtYXAucHVzaChwMSwgcDIpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpbmRleCA+IDAgJiYgcmlnaHRCcmFja2V0cy5pbmNsdWRlcyhwcmV2VG9rZW4pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLnB1c2goZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCwgdG9rZW5zKSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4udmFsdWUgPT09ICcpJyAmJiBib3RoQnJhY2tldHMuaW5jbHVkZXMobmV4dFRva2VuKSkge1xyXG4gICAgICAgICAgICAgICAgbWFwLnB1c2goZmluZFBhcmVuSW5kZXgodW5kZWZpbmVkLCBpbmRleCwgdG9rZW5zKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gbWFwO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgaW5kZXhlc1RvQWRkUGx1cyh0b2tlbnM6IGFueVtdKXtcclxuICAgICAgICByZXR1cm4gdG9rZW5zLm1hcCgodG9rZW4saW5kZXgpPT5pbmRleD4wXHJcbiAgICAgICAgICAgICYmdG9rZW5zW2luZGV4IC0gMV0/LmlzVmFsdWVUb2tlbigpXHJcbiAgICAgICAgICAgICYmdG9rZW4/LmlzVmFsdWVUb2tlbigpJiZ0b2tlbi52YWx1ZT49MD9pbmRleDpudWxsXHJcbiAgICAgICAgKS5maWx0ZXIoaXRlbT0+aXRlbSE9PW51bGwpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHRva2VuQ29tcGFyZShjb21wYXJlOiBzdHJpbmcgfCBudW1iZXIsIHZhbHVlOiBzdHJpbmd8UmVnRXhwLCB0b2tlbjogeyBbeDogc3RyaW5nXTogYW55OyB9LCBuZXh0VG9rZW46IHsgW3g6IHN0cmluZ106IGFueTsgfSkge1xyXG4gICAgICAgIGNvbnN0IHJlZ0V4cHZhbHVlID0gKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSA/IHZhbHVlIDogbmV3IFJlZ0V4cCh2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgKHZhbHVlID09PSBudWxsIHx8IHJlZ0V4cHZhbHVlLnRlc3QodG9rZW5bY29tcGFyZV0pKSAmJlxyXG4gICAgICAgICAgICB0b2tlbltjb21wYXJlXSA9PT0gbmV4dFRva2VuPy5bY29tcGFyZV1cclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBUb2tlbntcclxuICAgIHZhbHVlPzogbnVtYmVyO1xyXG4gICAgdmFyaWFibGU/OiBzdHJpbmc7XHJcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTpudW1iZXIgLHZhcmlhYmxlPzogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XHJcbiAgICB9XHJcbiAgICBpc1ZhcigpIHtyZXR1cm4gdGhpcy52YXJpYWJsZSE9PXVuZGVmaW5lZH1cclxuICAgIGdldEZ1bGxUb2tlbklEKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudmFyaWFibGU/YHZhcmlhYmxlOiR7dGhpcy52YXJpYWJsZX1gOidudW1iZXInXHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNNYXRoSmF4VG9rZW57XHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICB2YWx1ZT86IHN0cmluZ3xudW1iZXI7XHJcbiAgICB2YXJpYWJsZT86IHN0cmluZztcclxuICAgIG1vZGlmaWVyOiBhbnk7XHJcbiAgICBpZDogUGFyZW47XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQsdmFyaWFibGU/OiBhbnkpe1xyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICAgICAgdGhpcy52YXJpYWJsZT12YXJpYWJsZTtcclxuICAgICAgICB0aGlzLnNldFR5cGUoKTtcclxuICAgICAgICB0aGlzLmluc3VyUHJvcGVyRm9ybWF0dGluZygpXHJcbiAgICB9XHJcbiAgICBpbnN1clByb3BlckZvcm1hdHRpbmcoKXtcclxuICAgICAgICBpZiAodGhpcy50eXBlPT09J29wZXJhdG9yJyYmdHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJyl7XHJcbiAgICAgICAgICAgIHRoaXMudmFsdWU9c2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubmFtZVxyXG4gICAgICAgIH1cclxuICAgICAgIC8vIGlmICghdGhpcy52YWx1ZSl7dGhyb3cgbmV3IEVycm9yKCd3dGYgVmFsdWUgd2FzIHVuZGVmaW5lZCBhdCB0b2tlbiBpbnN1clByb3BlckZvcm1hdHRpbmcnKX1cclxuICAgIH1cclxuICAgIGdldElkKCl7cmV0dXJuIHRoaXMuaWQuaWR9O1xyXG5cclxuICAgIGdldExhdGV4U3ltYm9sKCl7cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlPT09J3N0cmluZyc/c2VhcmNoTWF0aEpheE9wZXJhdG9ycyh0aGlzLnZhbHVlKT8ubGF0ZXg6dW5kZWZpbmVkfVxyXG5cclxuICAgIGdldEZ1bGxUb2tlbklEKCl7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcclxuICAgICAgICAgICAgY2FzZSAncHJhbmUnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZTtcclxuICAgICAgICAgICAgY2FzZSAnb3BlcmF0b3InOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHlwZSsnOicrdGhpcy52YWx1ZVxyXG4gICAgICAgICAgICBjYXNlICd2YXJpYWJsZSc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50eXBlKyc6Jyt0aGlzLnZhcmlhYmxlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgZ2V0ZnVsbFR5cGUoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50eXBlXHJcbiAgICB9XHJcblxyXG4gICAgc2V0VHlwZSgpe1xyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy52YWx1ZT09PSdzdHJpbmcnKXtcclxuICAgICAgICAgICAgdGhpcy50eXBlPXRoaXMudmFsdWUubWF0Y2goL1soKV0vKT8ncGFyZW4nOidvcGVyYXRvcic7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy50eXBlPXRoaXMudmFyaWFibGU/J3ZhcmlhYmxlJzonbnVtYmVyJztcclxuICAgIH1cclxuXHJcbiAgICBpc1N0cmluZygpe3JldHVybiB0aGlzLnR5cGU9PT0ncGFyZW4nfHx0aGlzLnR5cGU9PT0nb3BlcmF0b3InfVxyXG5cclxuICAgIGlzVmFsdWVUb2tlbigpe3JldHVybiB0aGlzLnR5cGU9PT0ndmFyaWFibGUnfHx0aGlzLnR5cGU9PT0nbnVtYmVyJ31cclxuXHJcbiAgICB0b1N0cmluZ0xhdGV4KCl7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgICAgIGlmICh0aGlzLmlzU3RyaW5nKCkpXHJcbiAgICAgICAgICAgIHN0cmluZys9dGhpcy5nZXRMYXRleFN5bWJvbCgpXHJcbiAgICAgICAgaWYgKHRoaXMudHlwZT09PSd2YXJpYWJsZScpIHN0cmluZys9dGhpcy50b1N0cmluZ1ZhcmlhYmxlKClcclxuICAgICAgICBpZiAodGhpcy50eXBlPT09J251bWJlcicpIHN0cmluZys9dGhpcy52YWx1ZTtcclxuICAgICAgICByZXR1cm4gc3RyaW5nXHJcbiAgICB9XHJcbiAgICBhZmZlY3RlZE9wZXJhdG9yUmFuZ2UoZGlyZWN0aW9uOiBzdHJpbmcpe1xyXG4gICAgICAgIGlmKHRoaXMudHlwZSE9PSdvcGVyYXRvcid8fHRoaXMudmFsdWU9PT0nRXF1YWxzJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgaWYodHlwZW9mIHRoaXMudmFsdWU9PT0nc3RyaW5nJyYmZGlyZWN0aW9uPT09J2xlZnQnJiYhZ2V0T3BlcmF0b3JzQnlBc3NvY2lhdGl2aXR5KCdib3RoJykuaW5jbHVkZXModGhpcy52YWx1ZSkpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcbiAgICB0b1N0cmluZ1ZhcmlhYmxlKCl7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLnZhbHVlJiZ0aGlzPy52YWx1ZSE9PTE/dGhpcy52YWx1ZTonJykrKHRoaXMudmFyaWFibGV8fCcnKTtcclxuICAgIH1cclxufSJdfQ==