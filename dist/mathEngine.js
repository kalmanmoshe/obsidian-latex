export function controller(mathExpression) {
    let Error = [];
    let mathInfo = '';
    let SolutionInfo = '';
    let math = `${mathExpression}`
        .replace(/(\s|_\{[\w]*\})/g, "")
        .replace(/{/g, "(")
        .replace(/}/g, ")")
        .replace(/\\\\cdot/g, "*")
        .replace(/arc/g, "a")
        .replace(/Math./g, "\\")
        .replace(/(?<!\\)(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\$1");
    function addmathInfo(value) {
        mathInfo += value;
    }
    function addSolutionInfo(value) {
        SolutionInfo += value;
    }
    //return math;
    function tokenize(math) {
        let tokens = [];
        let brackets = 0, unmatched = 0, levelCount = {};
        let pos = 0;
        for (let i = 0; i < math.length; i++) {
            let number = '', numStart = i, startPos = i;
            if (math[i] === '(') {
                if (!levelCount[brackets]) {
                    levelCount[brackets] = 0;
                }
                let ID = levelCount[brackets]++;
                tokens.push({ type: 'paren', value: '(', id: brackets + '.' + ID, startPos: i, endPos: i });
                brackets++;
                unmatched++;
                continue;
            }
            if (math[i] === ')') {
                unmatched--;
                if (unmatched < 0) {
                    Error.push(`Unmatched closing bracket at position ` + i + `\n`);
                    unmatched = 0;
                }
                brackets--;
                if (brackets < 0) {
                    Error.push(`More closing brackets than opening brackets at position ` + i + `\n`);
                    brackets = 0;
                }
                let ID = levelCount[brackets] - 1;
                tokens.push({ type: 'paren', value: ')', id: brackets + '.' + (ID >= 0 ? ID : 0), startPos: i, endPos: i });
                if (math[i + 1] === '(' && !/(frac|binom)/.test(tokens[tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id) - 1].value)) {
                    i++;
                    math = math.slice(0, i) + '*' + math.slice(i);
                    i--;
                }
                continue;
            }
            // Handle operators
            if (/[+\*-\/^=]/.test(math[i])) {
                if (math[i] === '-' && (tokens.length === 0 || tokens[tokens.length - 1].type === 'operator' || tokens[tokens.length - 1].value === '(')) {
                    let number = '-';
                    startPos = i;
                    i++;
                    while (/[0-9.]/.test(math[i])) {
                        number += math[i];
                        i++;
                    }
                    tokens.push({ type: 'number', value: parseFloat(number), startPos: startPos, endPos: i - 1 });
                    i--;
                }
                else {
                    tokens.push({ type: 'operator', value: math[i], startPos: i, endPos: i });
                }
                continue;
            }
            // Handle LaTeX-style operators
            if (math[i] === '\\') {
                startPos = i;
                i += 1;
                let operator = '';
                while (i < math.length && /[a-zA-Z]/.test(math[i])) {
                    operator += math[i];
                    i++;
                }
                tokens.push({ type: 'operator', value: operator, startPos: startPos, endPos: i - 1 });
                i--;
                continue;
            }
            // Handle numbers
            while (/[0-9.]/.test(math[i])) {
                number += math[i];
                i++;
            }
            if (number) {
                if (math[numStart - 1] === ')') {
                    math = math.slice(0, numStart) + '*' + math.slice(numStart);
                    i++;
                }
                tokens.push({ type: 'number', value: parseFloat(number), startPos: numStart, endPos: i - 1 });
                if (math[i] === '(') {
                    math = math.slice(0, i) + '*' + math.slice(i);
                }
                else if (/\\/.test(math[i])) {
                    math = math.slice(0, i) + '*' + math.slice(i);
                    i += 1;
                }
                i--;
                continue;
            }
            // Handle variables
            if (/[a-zA-Z]/.test(math[i])) {
                // v and befor num
                if (tokens.length > 1 && tokens[tokens.length - 2].type === 'operator' && /[+-]/.test(tokens[tokens.length - 2].value)) {
                    Object.assign(tokens[tokens.length - 2], { type: 'variable', value: parseFloat(tokens[tokens.length - 2].value + tokens[tokens.length - 1].value), variable: math[i], endPos: i });
                    tokens.pop();
                }
                else if (tokens.length > 0 && tokens[tokens.length - 1].type === 'number') {
                    Object.assign(tokens[tokens.length - 1], { type: 'variable', variable: math[i], endPos: i });
                }
                else if (tokens.length > 0 && tokens[tokens.length - 1].type === 'operator' && /[+-]/.test(tokens[tokens.length - 1].value)) {
                    Object.assign(tokens[tokens.length - 1], { type: 'variable', value: parseFloat(tokens[tokens.length - 1].value + 1), variable: math[i], endPos: i });
                }
                // v and affter num
                if (/[0-9]/.test(math[i + 1])) {
                    i++;
                    while (/[0-9]/.test(math[i]) && i < math.length) {
                        number += math[i];
                        i++;
                    }
                    tokens.push({ type: 'variable', variable: math[startPos], value: number, startPos: startPos, endPos: i - 1 });
                }
                // default
                if (!tokens.length > 0 || !tokens[tokens.length - 1].type === 'number') {
                    tokens.push({ type: 'variable', variable: math[startPos], value: 1, startPos: startPos, endPos: i - 1 });
                }
            }
        }
        if (unmatched > 0) {
            Error.push(`Unmatched opening bracket(s)\n`);
        }
        return { tokens: tokens, math: math };
    }
    function intID(partID, int) {
        let [baseID, subID = 0] = partID.split('.').map(Number);
        let [baseIN, subIN = 0] = String(int).split('.').map(Number);
        return `${baseID + baseIN}.${subID + subIN}`;
    }
    function safeToNumber(value) {
        for (let i = 0; i < value.length; i++) {
            if (typeof value[i] === 'string' && (value[i] === '(' || value[i] === ')')) {
                value = value.slice(0, i) + value.slice(i + 1);
                i--;
            }
        }
        const num = Number(value);
        return isNaN(num) ? 0 : num;
    }
    function operationsOrder(tokens) {
        let begin = -1, end = -1;
        let currentID = null;
        let checkedIDs = [];
        let operatorFound = false;
        // Find the innermost parentheses
        while (!operatorFound) {
            for (let i = 0; i < tokens.length; i++) {
                if (tokens[i].value === '(' && !checkedIDs.includes(tokens[i].id)) {
                    currentID = tokens[i].id;
                }
                if (tokens[i].value === '(' && tokens[i].id === currentID) {
                    begin = i;
                }
                if (tokens[i].value === ')' && tokens[i].id === currentID) {
                    end = i;
                    break;
                }
            }
            // If no more parentheses are found, process the whole expression
            if (!currentID) {
                begin = 0;
                end = tokens.length;
                operatorFound = true;
                break;
            }
            // Check if there's an operator between the current parentheses
            for (let i = begin + 1; i < end; i++) {
                if (tokens[i].type === 'operator') {
                    operatorFound = true;
                    break;
                }
            }
            // If no operator is found, mark this parentheses pair as checked
            if (!operatorFound) {
                checkedIDs.push(currentID);
                currentID = null;
            }
        }
        // Now prioritize operators based on the order of precedence
        let p1, p2, p3, p4, p5, p6;
        for (let i = begin; i < end; i++) {
            if (tokens[i].type === 'operator') {
                if (!p1 && /(\^|sqrt)/.test(tokens[i].value)) {
                    p1 = i;
                    continue;
                }
                else if (!p2 && /(frac|binom|sin|cos|tan|asin|acos|atan)/.test(tokens[i].value)) {
                    p2 = i;
                    continue;
                }
                else if (!p3 && /(\*|\/)/.test(tokens[i].value)) {
                    p3 = i;
                    continue;
                }
                else if (!p4 && /[+-]/.test(tokens[i].value)) {
                    p4 = i;
                    continue;
                }
                else if (/[=]/.test(tokens[i].value)) {
                    if (!tokens.slice(0, i).some(token => token.type === 'number') &&
                        !tokens.slice(i).some(token => token.type === 'variable')) {
                        return i;
                    }
                    else {
                        //her i beed to add the groping lojic
                    }
                }
            }
        }
        if (p1 !== undefined) {
            return p1;
        }
        else if (p2 !== undefined) {
            return p2;
        }
        else if (p3 !== undefined) {
            return p3;
        }
        else if (p4 !== undefined) {
            return p4;
        }
        else {
            return null;
        }
    }
    function parseLeft(tokens, index) {
        let breakChar = 0;
        let left = '';
        for (let i = index - 1; i >= 0; i--) {
            if (tokens[index - 1].type === 'paren') {
                if (i !== index - 2 && tokens[i + 1].type === 'paren' && tokens[i + 1].id === tokens[index - 1].id) {
                    breakChar = i + 1;
                    break;
                }
            }
            else {
                if (tokens[i].type !== 'number') {
                    breakChar = i + 1;
                    break;
                }
            }
        }
        for (let i = index - 1; i >= breakChar; i--) {
            left = tokens[i].value + left;
        }
        //addDebugInfo('left',left)
        return { value: safeToNumber(left), breakChar: breakChar };
    }
    function parseRight(tokens, index) {
        let breakChar = tokens.length;
        let right = '';
        for (let i = index + 1; i < tokens.length; i++) {
            if (tokens[index + 1].type === 'paren') {
                if (i !== index + 2 && tokens[i - 1].type === 'paren' && tokens[i - 1].id === tokens[index + 1].id) {
                    breakChar = i;
                    break;
                }
            }
            else {
                if (tokens[i].type !== 'number') {
                    breakChar = i;
                    break;
                }
            }
        }
        for (let i = index + 1; i < breakChar; i++) {
            right += tokens[i].value;
        }
        return { value: safeToNumber(right), breakChar: breakChar };
    }
    function praseVariable(tokens, index) {
        let breakChar = 0;
        let left = '';
        let variable = '';
        for (let i = index - 1; i >= 0; i--) {
            if (tokens[index - 1].type === 'paren') {
                if (i !== index - 2 && tokens[i + 1].type === 'paren' && tokens[i + 1].id === tokens[index - 1].id) {
                    breakChar = i + 1;
                    break;
                }
            }
            else {
                if (tokens[i].type !== 'variable') {
                    breakChar = i + 1;
                    break;
                }
            }
        }
        for (let i = index - 1; i >= breakChar; i--) {
            left = tokens[i].value + left;
            variable = tokens[i].variable;
        }
        return { variable: variable, value: safeToNumber(left), breakChar: breakChar };
    }
    function position(tokens) {
        let index = operationsOrder(tokens);
        if (index === null) {
            return null;
        }
        let leftObj, rightObj;
        if (tokens[index].value === '=') {
            leftObj = praseVariable(tokens, index);
            rightObj = parseRight(tokens, index);
            return {
                operator: tokens[index].value,
                left: leftObj ? leftObj.value : null,
                leftVariable: leftObj.variable,
                right: rightObj ? rightObj.value : null,
                leftBreak: leftObj ? leftObj.breakChar : index,
                rightBreak: rightObj ? rightObj.breakChar : tokens.length
            };
        }
        switch (tokens[index].value) {
            case '^':
            case '+':
            case '-':
            case '*':
                //case '=':
                leftObj = parseLeft(tokens, index);
                rightObj = parseRight(tokens, index);
                break;
            case 'sqrt':
            case 'sin':
            case 'cos':
            case 'tan':
            case 'asin':
            case 'acos':
            case 'atan':
                rightObj = parseRight(tokens, index);
                break;
            case 'frac':
            case 'binom':
                leftObj = parseRight(tokens, index);
                rightObj = parseRight(tokens, leftObj.breakChar);
                leftObj.breakChar = index;
                rightObj.breakChar += 1;
                break;
            default:
                return null;
        }
        return {
            operator: tokens[index].value,
            left: leftObj ? leftObj.value : null,
            right: rightObj ? rightObj.value : null,
            leftBreak: leftObj ? leftObj.breakChar : index,
            rightBreak: rightObj ? rightObj.breakChar : tokens.length
        };
    }
    function parse(operator, left, leftVar, right) {
        if (left !== null && left.length <= 0) {
            Error.push(`Error: Left side of an operator must have a value`);
            return null;
        }
        if (right !== null && right.length <= 0) {
            Error.push(`Error: Right side of an operator must have a value`);
            return null;
        }
        if (leftVar) {
            return `${leftVar} = ${(right) / (left)}`;
        }
        let solved;
        switch (operator) {
            case 'sqrt':
                solved = Math.sqrt(right);
                break;
            case '^':
                solved = Math.pow(left, right);
                break;
            case 'frac':
                solved = (left) / (right);
                break;
            case '*':
                solved = left * right;
                break;
            case '+':
                solved = left + right;
                break;
            case '-':
                solved = left - right;
                break;
            case 'binom':
                if (Number.isNaN(left) || Number.isNaN(right) || left < 0 || right < 0) {
                    return null;
                }
                if (right > left) {
                    solved = 0;
                    break;
                }
                if (right === 0 || right === left) {
                    solved = 1;
                    break;
                }
                if (right === 1 || right === left - 1) {
                    solved = left;
                    break;
                }
                let k = right;
                if (right > left - right) {
                    k = left - right;
                }
                let res = 1;
                for (let i = 1; i <= k; i++) {
                    res = res * (left - i + 1) / i;
                }
                solved = res;
                break;
            case '=':
                solved = left === right;
                break;
            case 'sin':
                solved = (Math.sin(right * Math.PI / 180));
                break;
            case 'cos':
                solved = (Math.cos(right * Math.PI / 180));
                break;
            case 'tan':
                solved = (Math.tan(right * Math.PI / 180));
                break;
            case 'asin':
                solved = (Math.asin(right) * (180 / Math.PI));
                break;
            case 'acos':
                solved = (Math.acos(right) * (180 / Math.PI));
                break;
            case 'atan':
                solved = (Math.atan(right) * (180 / Math.PI));
                break;
            default:
                return null;
        }
        return typeof solved === 'number' ? Math.round(solved * 100000) / 100000 : solved;
    }
    function controller(math) {
        addmathInfo(`${math}\n`);
        let tokensArr = tokenize(math);
        let tokens = tokensArr.tokens;
        math = tokensArr.math;
        let expression = position(tokens);
        if (expression === null && !(tokens.some(token => token.type === 'operator' && token.value !== '=')) && tokens.some(token => token.type === 'variable')) {
            return math;
        }
        else if (expression === null) {
            return Math.round(parseFloat(math) * 10000) / 10000;
        }
        let solved = parse(expression.operator, expression.left !== null ? expression.left : null, expression.leftVariable !== null ? expression.leftVariable : null, expression.right !== null ? expression.right : null);
        addSolutionInfo(`${expression.left} ${expression.operator} ${expression.right} -> ${solved}\n`);
        if (solved === null) {
            return null;
        }
        if (typeof solved === `string`) {
            return solved;
        }
        let leftPos = tokens[expression.leftBreak].startPos;
        let rightPos = tokens[expression.rightBreak - 1].endPos + 1;
        math = math.slice(0, leftPos) + solved + math.slice(rightPos);
        return math !== 'true' && math !== 'false' ? controller(math) : math;
    }
    Solution = controller(math);
    if (Error.length > 0) {
        return Error;
    }
    else {
        return { Solution: Solution, info: mathInfo, SolutionInfo: SolutionInfo };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21hdGhFbmdpbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxVQUFVLFVBQVUsQ0FBQyxjQUFjO0lBQ3JDLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztJQUNmLElBQUksUUFBUSxHQUFHLEVBQUUsQ0FBQztJQUNsQixJQUFJLFlBQVksR0FBRyxFQUFFLENBQUM7SUFFdEIsSUFBSSxJQUFJLEdBQUcsR0FBRyxjQUFjLEVBQUU7U0FDL0IsT0FBTyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQztTQUMvQixPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQztTQUNsQixPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQztTQUNsQixPQUFPLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQztTQUN6QixPQUFPLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQztTQUNwQixPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQztTQUN2QixPQUFPLENBQUMsc0RBQXNELEVBQUUsTUFBTSxDQUFDLENBQUM7SUFHekUsU0FBUyxXQUFXLENBQUMsS0FBSztRQUN4QixRQUFRLElBQUksS0FBSyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxTQUFTLGVBQWUsQ0FBQyxLQUFLO1FBQzVCLFlBQVksSUFBSSxLQUFLLENBQUM7SUFDMUIsQ0FBQztJQUVDLGNBQWM7SUFDZCxTQUFTLFFBQVEsQ0FBQyxJQUFJO1FBQ2xCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLFFBQVEsR0FBRyxDQUFDLEVBQUUsU0FBUyxHQUFHLENBQUMsRUFBRSxVQUFVLEdBQUcsRUFBRSxDQUFDO1FBQ2pELElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztRQUVaLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lB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QUM7SUFDRCxRQUFRLEdBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzFCLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFBRSxPQUFPLEtBQUssQ0FBQztLQUFFO1NBQ2xDO1FBQ1QsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFDLENBQUM7S0FBQztBQUMxRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGNvbnRyb2xsZXIobWF0aEV4cHJlc3Npb24pIHtcclxuICAgIGxldCBFcnJvciA9IFtdO1xyXG4gICAgbGV0IG1hdGhJbmZvID0gJyc7IFxyXG4gICAgbGV0IFNvbHV0aW9uSW5mbyA9ICcnOyBcclxuXHJcbiAgICBsZXQgbWF0aCA9IGAke21hdGhFeHByZXNzaW9ufWBcclxuICAucmVwbGFjZSgvKFxcc3xfXFx7W1xcd10qXFx9KS9nLCBcIlwiKSBcclxuICAucmVwbGFjZSgvey9nLCBcIihcIikgXHJcbiAgLnJlcGxhY2UoL30vZywgXCIpXCIpXHJcbiAgLnJlcGxhY2UoL1xcXFxcXFxcY2RvdC9nLCBcIipcIilcclxuICAucmVwbGFjZSgvYXJjL2csIFwiYVwiKVxyXG4gIC5yZXBsYWNlKC9NYXRoLi9nLCBcIlxcXFxcIilcclxuICAucmVwbGFjZSgvKD88IVxcXFwpKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58c3FydCkvZywgXCJcXFxcJDFcIik7XHJcbiAgICBcclxuICBcclxuICBmdW5jdGlvbiBhZGRtYXRoSW5mbyh2YWx1ZSkge1xyXG4gICAgbWF0aEluZm8gKz0gdmFsdWU7XHJcbiAgfVxyXG4gIGZ1bmN0aW9uIGFkZFNvbHV0aW9uSW5mbyh2YWx1ZSkge1xyXG4gICAgU29sdXRpb25JbmZvICs9IHZhbHVlO1xyXG59XHJcbiAgXHJcbiAgLy9yZXR1cm4gbWF0aDtcclxuICBmdW5jdGlvbiB0b2tlbml6ZShtYXRoKSB7XHJcbiAgICAgIGxldCB0b2tlbnMgPSBbXTtcclxuICAgICAgbGV0IGJyYWNrZXRzID0gMCwgdW5tYXRjaGVkID0gMCwgbGV2ZWxDb3VudCA9IHt9O1xyXG4gICAgICBsZXQgcG9zID0gMDsgXHJcbiAgICAgIFxyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgIGxldCBudW1iZXIgPSAnJywgbnVtU3RhcnQgPSBpLCBzdGFydFBvcyA9IGk7XHJcbiAgXHJcbiAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gJygnKSB7XHJcbiAgICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xyXG4gICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XHJcbiAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAncGFyZW4nLCB2YWx1ZTogJygnLCBpZDogYnJhY2tldHMgKyAnLicgKyBJRCwgc3RhcnRQb3M6IGksIGVuZFBvczogaSB9KTtcclxuICAgICAgICAgICAgICBicmFja2V0cysrOyAgXHJcbiAgICAgICAgICAgICAgdW5tYXRjaGVkKys7XHJcbiAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gJyknKSB7XHJcbiAgICAgICAgICAgICAgdW5tYXRjaGVkLS07XHJcbiAgICAgICAgICAgICAgaWYgKHVubWF0Y2hlZCA8IDApIHtcclxuICAgICAgICAgICAgICAgICAgRXJyb3IucHVzaChgVW5tYXRjaGVkIGNsb3NpbmcgYnJhY2tldCBhdCBwb3NpdGlvbiBgICsgaSArIGBcXG5gKTtcclxuICAgICAgICAgICAgICAgICAgdW5tYXRjaGVkID0gMDsgXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGJyYWNrZXRzLS07IFxyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIGlmIChicmFja2V0cyA8IDApIHtcclxuICAgICAgICAgICAgICAgICAgRXJyb3IucHVzaChgTW9yZSBjbG9zaW5nIGJyYWNrZXRzIHRoYW4gb3BlbmluZyBicmFja2V0cyBhdCBwb3NpdGlvbiBgICsgaSArIGBcXG5gKTtcclxuICAgICAgICAgICAgICAgICAgYnJhY2tldHMgPSAwOyBcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xyXG4gICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogJ3BhcmVuJywgdmFsdWU6ICcpJywgaWQ6IGJyYWNrZXRzICsgJy4nICsgKElEID49IDAgPyBJRCA6IDApLCBzdGFydFBvczogaSwgZW5kUG9zOiBpIH0pO1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIGlmIChtYXRoW2krMV0gPT09ICcoJyYmIS8oZnJhY3xiaW5vbSkvLnRlc3QodG9rZW5zW3Rva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uaWQpLmluZGV4T2YodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5pZCktMV0udmFsdWUpKSB7XHJcbiAgICAgICAgICAgICAgaSsrOyBcclxuICAgICAgICAgICAgICBtYXRoID0gbWF0aC5zbGljZSgwLCBpKSArICcqJyArIG1hdGguc2xpY2UoaSk7XHJcbiAgICAgICAgICAgICAgaS0tOyBcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICAvLyBIYW5kbGUgb3BlcmF0b3JzXHJcbiAgICAgICAgICBpZiAoL1srXFwqLVxcL149XS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSAnLScgJiYgKHRva2Vucy5sZW5ndGggPT09IDAgfHwgdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS50eXBlID09PSAnb3BlcmF0b3InIHx8IHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09ICcoJykpIHtcclxuICAgICAgICAgICAgICAgICAgbGV0IG51bWJlciA9ICctJztcclxuICAgICAgICAgICAgICAgICAgc3RhcnRQb3MgPSBpOyBcclxuICAgICAgICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICAgICAgICB3aGlsZSAoL1swLTkuXS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbnVtYmVyICs9IG1hdGhbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICBpKys7XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAnbnVtYmVyJywgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKSwgc3RhcnRQb3M6IHN0YXJ0UG9zLCBlbmRQb3M6IGkgLSAxIH0pO1xyXG4gICAgICAgICAgICAgICAgICBpLS07IFxyXG4gICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogJ29wZXJhdG9yJywgdmFsdWU6IG1hdGhbaV0sIHN0YXJ0UG9zOiBpLCBlbmRQb3M6IGkgfSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgfVxyXG4gIFxyXG4gICAgICAgICAgLy8gSGFuZGxlIExhVGVYLXN0eWxlIG9wZXJhdG9yc1xyXG4gICAgICAgICAgaWYgKG1hdGhbaV0gPT09ICdcXFxcJykgeyAgXHJcbiAgICAgICAgICAgIHN0YXJ0UG9zID0gaTsgIFxyXG4gICAgICAgICAgICBpKz0xOyAgXHJcbiAgICAgICAgICAgIGxldCBvcGVyYXRvciA9ICcnO1xyXG4gICAgICAgICAgICB3aGlsZSAoaSA8IG1hdGgubGVuZ3RoICYmIC9bYS16QS1aXS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgb3BlcmF0b3IgKz0gbWF0aFtpXTtcclxuICAgICAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6ICdvcGVyYXRvcicsIHZhbHVlOiBvcGVyYXRvciwgc3RhcnRQb3M6IHN0YXJ0UG9zLCBlbmRQb3M6IGkgLSAxIH0pO1xyXG4gICAgICAgICAgICBpLS07XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICBcclxuICAgICAgICAgIC8vIEhhbmRsZSBudW1iZXJzXHJcbiAgICAgICAgICB3aGlsZSAoL1swLTkuXS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgIG51bWJlciArPSBtYXRoW2ldO1xyXG4gICAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIGlmIChudW1iZXIpIHtcclxuICAgICAgICAgICAgICBpZiAobWF0aFtudW1TdGFydC0xXSA9PT0gJyknKSB7XHJcbiAgICAgICAgICAgICAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIG51bVN0YXJ0KSArICcqJyArIG1hdGguc2xpY2UobnVtU3RhcnQpOyAgXHJcbiAgICAgICAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAnbnVtYmVyJywgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKSwgc3RhcnRQb3M6IG51bVN0YXJ0LCBlbmRQb3M6IGkgLSAxIH0pO1xyXG4gICAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSAnKCcpIHtcclxuICAgICAgICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgaSkgKyAnKicgKyBtYXRoLnNsaWNlKGkpOyAgXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGVsc2UgaWYgKC9cXFxcLy50ZXN0KG1hdGhbaV0pKXtcclxuICAgICAgICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgaSkgKyAnKicgKyBtYXRoLnNsaWNlKGkpO1xyXG4gICAgICAgICAgICAgICAgICBpICs9IDE7IFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBpLS07ICBcclxuICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIC8vIEhhbmRsZSB2YXJpYWJsZXNcclxuICAgICAgICAgIGlmICgvW2EtekEtWl0vLnRlc3QobWF0aFtpXSkpIHtcclxuICAgICAgICAgICAgICAvLyB2IGFuZCBiZWZvciBudW1cclxuICAgICAgICAgICAgICBpZiAodG9rZW5zLmxlbmd0aCA+IDEgJiZ0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDJdLnR5cGU9PT0nb3BlcmF0b3InJiYvWystXS8udGVzdCh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDJdLnZhbHVlKSkgXHJcbiAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGggLSAyXSwgeyB0eXBlOiAndmFyaWFibGUnLHZhbHVlOiBwYXJzZUZsb2F0KHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMl0udmFsdWUrdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS52YWx1ZSksIHZhcmlhYmxlOiBtYXRoW2ldLCBlbmRQb3M6IGkgIH0pO1xyXG4gICAgICAgICAgICAgIHRva2Vucy5wb3AoKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAodG9rZW5zLmxlbmd0aCA+IDAgJiYgdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS50eXBlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXSwgeyB0eXBlOiAndmFyaWFibGUnLCB2YXJpYWJsZTogbWF0aFtpXSwgZW5kUG9zOiBpICB9KTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAodG9rZW5zLmxlbmd0aCA+IDAgJiZ0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnR5cGU9PT0nb3BlcmF0b3InJiYvWystXS8udGVzdCh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXSwgeyB0eXBlOiAndmFyaWFibGUnLHZhbHVlOiBwYXJzZUZsb2F0KHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUrMSksIHZhcmlhYmxlOiBtYXRoW2ldLCBlbmRQb3M6IGkgIH0pO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAvLyB2IGFuZCBhZmZ0ZXIgbnVtXHJcbiAgICAgICAgICBpZiAoL1swLTldLy50ZXN0KG1hdGhbaSsxXSkpIHtcclxuICAgICAgICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICAgICAgICB3aGlsZSAoL1swLTldLy50ZXN0KG1hdGhbaV0pICYmIGkgPCBtYXRoLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbnVtYmVyICs9IG1hdGhbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICBpKys7XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goe3R5cGU6ICd2YXJpYWJsZScsdmFyaWFibGU6IG1hdGhbc3RhcnRQb3NdLHZhbHVlOiBudW1iZXIsIHN0YXJ0UG9zOiBzdGFydFBvcyxlbmRQb3M6IGkgLSAxfSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgLy8gZGVmYXVsdFxyXG4gICAgICAgICAgaWYgICghdG9rZW5zLmxlbmd0aCA+IDB8fCF0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnR5cGUgPT09ICdudW1iZXInKXtcclxuICAgICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goe3R5cGU6ICd2YXJpYWJsZScsdmFyaWFibGU6IG1hdGhbc3RhcnRQb3NdLHZhbHVlOiAxLHN0YXJ0UG9zOiBzdGFydFBvcyxlbmRQb3M6IGkgLSAxfSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIGlmICh1bm1hdGNoZWQgPiAwKSB7XHJcbiAgICAgICAgICBFcnJvci5wdXNoKGBVbm1hdGNoZWQgb3BlbmluZyBicmFja2V0KHMpXFxuYCk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgcmV0dXJuIHsgdG9rZW5zOiB0b2tlbnMsIG1hdGg6IG1hdGggfTtcclxuICB9IFxyXG4gIFxyXG4gIGZ1bmN0aW9uIGludElEKHBhcnRJRCwgaW50KSB7XHJcbiAgICAgIGxldCBbYmFzZUlELCBzdWJJRCA9IDBdID0gcGFydElELnNwbGl0KCcuJykubWFwKE51bWJlcik7XHJcbiAgICAgIGxldCBbYmFzZUlOLCBzdWJJTiA9IDBdID0gU3RyaW5nKGludCkuc3BsaXQoJy4nKS5tYXAoTnVtYmVyKTtcclxuICAgICAgcmV0dXJuIGAke2Jhc2VJRCArIGJhc2VJTn0uJHtzdWJJRCArIHN1YklOfWA7XHJcbiAgfVxyXG4gIFxyXG4gIGZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSAnc3RyaW5nJyAmJiAodmFsdWVbaV0gPT09ICcoJyB8fCB2YWx1ZVtpXSA9PT0gJyknKSkge1xyXG4gICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XHJcbiAgICAgICAgICAgICAgaS0tOyAgXHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xyXG4gIHJldHVybiBpc05hTihudW0pID8gMCA6IG51bTtcclxuICB9XHJcbiAgXHJcbiAgZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2Vucykge1xyXG4gICAgICBsZXQgYmVnaW4gPSAtMSwgZW5kID0gLTE7XHJcbiAgICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgIGxldCBjaGVja2VkSURzID0gW107ICBcclxuICAgICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTsgIFxyXG4gIFxyXG4gICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgICAgd2hpbGUgKCFvcGVyYXRvckZvdW5kKSB7XHJcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcoJyAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnNbaV0uaWQpKSB7XHJcbiAgICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IHRva2Vuc1tpXS5pZDsgIFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnKCcgJiYgdG9rZW5zW2ldLmlkID09PSBjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgICAgICAgYmVnaW4gPSBpOyAgXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcpJyAmJiB0b2tlbnNbaV0uaWQgPT09IGN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICAgICAgICBlbmQgPSBpOyAgXHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIC8vIElmIG5vIG1vcmUgcGFyZW50aGVzZXMgYXJlIGZvdW5kLCBwcm9jZXNzIHRoZSB3aG9sZSBleHByZXNzaW9uXHJcbiAgICAgICAgICBpZiAoIWN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICAgIGJlZ2luID0gMDtcclxuICAgICAgICAgICAgICBlbmQgPSB0b2tlbnMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgIG9wZXJhdG9yRm91bmQgPSB0cnVlOyAgXHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSdzIGFuIG9wZXJhdG9yIGJldHdlZW4gdGhlIGN1cnJlbnQgcGFyZW50aGVzZXNcclxuICAgICAgICAgIGZvciAobGV0IGkgPSBiZWdpbiArIDE7IGkgPCBlbmQ7IGkrKykge1xyXG4gICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udHlwZSA9PT0gJ29wZXJhdG9yJykge1xyXG4gICAgICAgICAgICAgICAgICBvcGVyYXRvckZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gIFxyXG4gICAgICAgICAgLy8gSWYgbm8gb3BlcmF0b3IgaXMgZm91bmQsIG1hcmsgdGhpcyBwYXJlbnRoZXNlcyBwYWlyIGFzIGNoZWNrZWRcclxuICAgICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQpOyAgXHJcbiAgICAgICAgICAgICAgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIC8vIE5vdyBwcmlvcml0aXplIG9wZXJhdG9ycyBiYXNlZCBvbiB0aGUgb3JkZXIgb2YgcHJlY2VkZW5jZVxyXG4gICAgICBsZXQgcDEsIHAyLCBwMywgcDQsIHA1LCBwNjtcclxuICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDwgZW5kOyBpKyspIHtcclxuICAgICAgICAgIGlmICh0b2tlbnNbaV0udHlwZSA9PT0gJ29wZXJhdG9yJykge1xyXG4gICAgICAgICAgICAgIGlmICghcDEgJiYgLyhcXF58c3FydCkvLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICBwMSA9IGk7ICBjb250aW51ZTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAoIXAyICYmIC8oZnJhY3xiaW5vbXxzaW58Y29zfHRhbnxhc2lufGFjb3N8YXRhbikvLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICBwMiA9IGk7ICBjb250aW51ZTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAoIXAzICYmIC8oXFwqfFxcLykvLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICBwMyA9IGk7ICBjb250aW51ZTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAoIXA0ICYmIC9bKy1dLy50ZXN0KHRva2Vuc1tpXS52YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgICAgcDQgPSBpOyAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGVsc2UgaWYgKC9bPV0vLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAhdG9rZW5zLnNsaWNlKDAsIGkpLnNvbWUodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gJ251bWJlcicpICYmIFxyXG4gICAgICAgICAgICAgICAgICAgICAgIXRva2Vucy5zbGljZShpKS5zb21lKHRva2VuID0+IHRva2VuLnR5cGUgPT09ICd2YXJpYWJsZScpXHJcbiAgICAgICAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGk7XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAvL2hlciBpIGJlZWQgdG8gYWRkIHRoZSBncm9waW5nIGxvamljXHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHAxICE9PSB1bmRlZmluZWQpIHtyZXR1cm4gcDE7fSBcclxuICAgICAgZWxzZSBpZiAocDIgIT09IHVuZGVmaW5lZCkge3JldHVybiBwMjt9IFxyXG4gICAgICBlbHNlIGlmIChwMyAhPT0gdW5kZWZpbmVkKSB7cmV0dXJuIHAzO30gXHJcbiAgICAgIGVsc2UgaWYgKHA0ICE9PSB1bmRlZmluZWQpIHtyZXR1cm4gcDQ7fSBcclxuICAgICAgZWxzZSB7cmV0dXJuIG51bGw7IH1cclxuICB9XHJcbiAgXHJcbiAgZnVuY3Rpb24gcGFyc2VMZWZ0KHRva2VucywgaW5kZXgpIHtcclxuICAgICAgbGV0IGJyZWFrQ2hhciA9IDA7XHJcbiAgICAgIGxldCBsZWZ0ID0gJyc7XHJcbiAgXHJcbiAgICAgIGZvciAobGV0IGkgPSBpbmRleCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICBpZiAodG9rZW5zW2luZGV4IC0gMV0udHlwZSA9PT0gJ3BhcmVuJykge1xyXG4gICAgICAgICAgICAgIGlmIChpIT09aW5kZXgtMiYmdG9rZW5zW2krMV0udHlwZSA9PT0gJ3BhcmVuJyYmdG9rZW5zW2krMV0uaWQ9PT10b2tlbnNbaW5kZXggLSAxXS5pZCkge1xyXG4gICAgICAgICAgICAgICAgICBicmVha0NoYXIgPSBpICsgMTtcclxuICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldLnR5cGUgIT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrQ2hhciA9IGkgKyAxO1xyXG4gICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChsZXQgaSA9IGluZGV4IC0gMTsgaSA+PSBicmVha0NoYXI7IGktLSkge1xyXG4gICAgICAgICAgbGVmdCA9IHRva2Vuc1tpXS52YWx1ZSArIGxlZnQ7IFxyXG4gICAgICB9XHJcbiAgICAgIC8vYWRkRGVidWdJbmZvKCdsZWZ0JyxsZWZ0KVxyXG4gICAgICByZXR1cm4geyB2YWx1ZTogc2FmZVRvTnVtYmVyKGxlZnQpLCBicmVha0NoYXI6IGJyZWFrQ2hhciB9O1xyXG4gIH1cclxuICBcclxuICBmdW5jdGlvbiBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpIHtcclxuICAgICAgbGV0IGJyZWFrQ2hhciA9IHRva2Vucy5sZW5ndGg7IFxyXG4gICAgICBsZXQgcmlnaHQgPSAnJzsgXHJcbiAgXHJcbiAgICAgIGZvciAobGV0IGkgPSBpbmRleCArIDE7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgaWYgKHRva2Vuc1tpbmRleCArIDFdLnR5cGUgPT09ICdwYXJlbicpIHtcclxuICAgICAgICAgIGlmIChpIT09aW5kZXgrMiYmdG9rZW5zW2ktMV0udHlwZSA9PT0gJ3BhcmVuJyYmdG9rZW5zW2ktMV0uaWQ9PT10b2tlbnNbaW5kZXggKyAxXS5pZCkge1xyXG4gICAgICAgICAgICAgIGJyZWFrQ2hhciA9IGk7XHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpZiAodG9rZW5zW2ldLnR5cGUgIT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgYnJlYWtDaGFyID0gaTtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIGZvciAobGV0IGkgPSBpbmRleCArIDE7IGkgPCBicmVha0NoYXI7IGkrKykge1xyXG4gICAgICAgICAgcmlnaHQgKz0gdG9rZW5zW2ldLnZhbHVlOyBcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4geyB2YWx1ZTogc2FmZVRvTnVtYmVyKHJpZ2h0KSwgYnJlYWtDaGFyOiBicmVha0NoYXIgfTsgXHJcbiAgfVxyXG4gIGZ1bmN0aW9uIHByYXNlVmFyaWFibGUodG9rZW5zLCBpbmRleCkge1xyXG4gICAgICBsZXQgYnJlYWtDaGFyID0gMDtcclxuICAgICAgbGV0IGxlZnQgPSAnJztcclxuICAgICAgbGV0IHZhcmlhYmxlPScnO1xyXG4gICAgICBmb3IgKGxldCBpID0gaW5kZXggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09ICdwYXJlbicpIHtcclxuICAgICAgICAgICAgICBpZiAoaSE9PWluZGV4LTImJnRva2Vuc1tpKzFdLnR5cGUgPT09ICdwYXJlbicmJnRva2Vuc1tpKzFdLmlkPT09dG9rZW5zW2luZGV4IC0gMV0uaWQpIHtcclxuICAgICAgICAgICAgICAgICAgYnJlYWtDaGFyID0gaSArIDE7XHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS50eXBlICE9PSAndmFyaWFibGUnKSB7XHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrQ2hhciA9IGkgKyAxO1xyXG4gICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgZm9yIChsZXQgaSA9IGluZGV4IC0gMTsgaSA+PSBicmVha0NoYXI7IGktLSkge1xyXG4gICAgICAgICAgbGVmdCA9IHRva2Vuc1tpXS52YWx1ZSArIGxlZnQ7IFxyXG4gICAgICAgICAgdmFyaWFibGU9dG9rZW5zW2ldLnZhcmlhYmxlO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB7dmFyaWFibGU6IHZhcmlhYmxlLCB2YWx1ZTogc2FmZVRvTnVtYmVyKGxlZnQpLCBicmVha0NoYXI6IGJyZWFrQ2hhciB9O1xyXG4gIH1cclxuICBmdW5jdGlvbiBwb3NpdGlvbih0b2tlbnMpIHtcclxuICAgICAgbGV0IGluZGV4ID0gb3BlcmF0aW9uc09yZGVyKHRva2Vucyk7XHJcbiAgICAgIGlmIChpbmRleD09PW51bGwpe3JldHVybiBudWxsfVxyXG4gICAgICBsZXQgbGVmdE9iaiwgcmlnaHRPYmo7XHJcbiAgICAgIGlmICh0b2tlbnNbaW5kZXhdLnZhbHVlPT09Jz0nKXtcclxuICAgICAgICAgIGxlZnRPYmogPSBwcmFzZVZhcmlhYmxlKHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgcmlnaHRPYmogPSBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgcmV0dXJuIHsgXHJcbiAgICAgICAgICAgICAgb3BlcmF0b3I6IHRva2Vuc1tpbmRleF0udmFsdWUsIFxyXG4gICAgICAgICAgICAgIGxlZnQ6IGxlZnRPYmogPyBsZWZ0T2JqLnZhbHVlIDogbnVsbCxcclxuICAgICAgICAgICAgICBsZWZ0VmFyaWFibGU6IGxlZnRPYmoudmFyaWFibGUsXHJcbiAgICAgICAgICAgICAgcmlnaHQ6cmlnaHRPYmogPyByaWdodE9iai52YWx1ZSA6IG51bGwsIFxyXG4gICAgICAgICAgICAgIGxlZnRCcmVhazogIGxlZnRPYmogPyBsZWZ0T2JqLmJyZWFrQ2hhciA6IGluZGV4LCBcclxuICAgICAgICAgICAgICByaWdodEJyZWFrOnJpZ2h0T2JqID9yaWdodE9iai5icmVha0NoYXI6IHRva2Vucy5sZW5ndGhcclxuICAgICAgICAgIH07IFxyXG4gICAgICB9XHJcbiAgICAgIHN3aXRjaCAodG9rZW5zW2luZGV4XS52YWx1ZSkge1xyXG4gICAgICAgICAgY2FzZSAnXic6XHJcbiAgICAgICAgICBjYXNlICcrJzpcclxuICAgICAgICAgIGNhc2UgJy0nOlxyXG4gICAgICAgICAgY2FzZSAnKic6XHJcbiAgICAgICAgICAvL2Nhc2UgJz0nOlxyXG4gICAgICAgICAgICAgIGxlZnRPYmogPSBwYXJzZUxlZnQodG9rZW5zLCBpbmRleCk7XHJcbiAgICAgICAgICAgICAgcmlnaHRPYmogPSBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnc3FydCc6XHJcbiAgICAgICAgICBjYXNlICdzaW4nOlxyXG4gICAgICAgICAgY2FzZSAnY29zJzpcclxuICAgICAgICAgIGNhc2UgJ3Rhbic6XHJcbiAgICAgICAgICBjYXNlICdhc2luJzpcclxuICAgICAgICAgIGNhc2UgJ2Fjb3MnOlxyXG4gICAgICAgICAgY2FzZSAnYXRhbic6XHJcbiAgICAgICAgICAgICAgcmlnaHRPYmogPSBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnZnJhYyc6XHJcbiAgICAgICAgICBjYXNlICdiaW5vbSc6XHJcbiAgICAgICAgICAgICAgbGVmdE9iaj1wYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpXHJcbiAgICAgICAgICAgICAgcmlnaHRPYmo9cGFyc2VSaWdodCh0b2tlbnMsIGxlZnRPYmouYnJlYWtDaGFyKVxyXG4gICAgICAgICAgICAgIGxlZnRPYmouYnJlYWtDaGFyPWluZGV4O1xyXG4gICAgICAgICAgICAgIHJpZ2h0T2JqLmJyZWFrQ2hhcis9MTtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB7IFxyXG4gICAgICAgICAgb3BlcmF0b3I6IHRva2Vuc1tpbmRleF0udmFsdWUsIFxyXG4gICAgICAgICAgbGVmdDogbGVmdE9iaiA/IGxlZnRPYmoudmFsdWUgOiBudWxsLFxyXG4gICAgICAgICAgcmlnaHQ6cmlnaHRPYmogPyByaWdodE9iai52YWx1ZSA6IG51bGwsIFxyXG4gICAgICAgICAgbGVmdEJyZWFrOiAgbGVmdE9iaiA/IGxlZnRPYmouYnJlYWtDaGFyIDogaW5kZXgsIFxyXG4gICAgICAgICAgcmlnaHRCcmVhazpyaWdodE9iaiA/cmlnaHRPYmouYnJlYWtDaGFyOiB0b2tlbnMubGVuZ3RoXHJcbiAgICAgIH07IFxyXG4gIH1cclxuICBcclxuICBmdW5jdGlvbiBwYXJzZShvcGVyYXRvciwgbGVmdCwgbGVmdFZhciwgcmlnaHQpIHsgXHJcbiAgICAgIGlmIChsZWZ0IT09bnVsbCYmbGVmdC5sZW5ndGggPD0gMCkge1xyXG4gICAgICAgICAgRXJyb3IucHVzaChgRXJyb3I6IExlZnQgc2lkZSBvZiBhbiBvcGVyYXRvciBtdXN0IGhhdmUgYSB2YWx1ZWApO1xyXG4gICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHJpZ2h0IT09bnVsbCYmcmlnaHQubGVuZ3RoIDw9IDApIHtcclxuICAgICAgICAgIEVycm9yLnB1c2goYEVycm9yOiBSaWdodCBzaWRlIG9mIGFuIG9wZXJhdG9yIG11c3QgaGF2ZSBhIHZhbHVlYCk7XHJcbiAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgICBpZiAobGVmdFZhcil7XHJcbiAgICAgICAgICByZXR1cm4gYCR7bGVmdFZhcn0gPSAkeyhyaWdodCkvKGxlZnQpfWA7XHJcbiAgICAgIH1cclxuICAgICAgbGV0IHNvbHZlZDsgXHJcbiAgICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcclxuICAgICAgICAgIGNhc2UgJ3NxcnQnOlxyXG4gICAgICAgICAgICAgIHNvbHZlZCA9IE1hdGguc3FydChyaWdodCk7XHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICBjYXNlICdeJzpcclxuICAgICAgICAgICAgICBzb2x2ZWQgPSBNYXRoLnBvdyhsZWZ0LHJpZ2h0KTtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIGNhc2UgJ2ZyYWMnOlxyXG4gICAgICAgICAgICAgIHNvbHZlZCA9IChsZWZ0KS8ocmlnaHQpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnKic6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gbGVmdCAqIHJpZ2h0O1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnKyc6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gbGVmdCArIHJpZ2h0O1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnLSc6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gbGVmdCAtIHJpZ2h0O1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnYmlub20nOlxyXG4gICAgICAgICAgICAgIGlmIChOdW1iZXIuaXNOYU4obGVmdCkgfHwgTnVtYmVyLmlzTmFOKHJpZ2h0KSB8fCBsZWZ0IDwgMCB8fCByaWdodCA8IDApIHtyZXR1cm4gbnVsbDsgfVxyXG4gICAgICAgICAgICAgIGlmIChyaWdodCA+IGxlZnQpIHtzb2x2ZWQgPSAwO2JyZWFrO31cclxuICAgICAgICAgICAgICBpZiAocmlnaHQgPT09IDAgfHwgcmlnaHQgPT09IGxlZnQpIHtzb2x2ZWQgPSAxO2JyZWFrO31cclxuICAgICAgICAgICAgICBpZiAocmlnaHQgPT09IDEgfHwgcmlnaHQgPT09IGxlZnQgLSAxKSB7c29sdmVkID0gbGVmdDticmVhazt9XHJcbiAgICAgICAgICAgICAgbGV0IGsgPSByaWdodDtpZiAocmlnaHQgPiBsZWZ0IC0gcmlnaHQpIHtrID0gbGVmdCAtIHJpZ2h0O31cclxuICBcclxuICAgICAgICAgICAgICBsZXQgcmVzID0gMTtcclxuICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBrOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgcmVzID0gcmVzICogKGxlZnQgLSBpICsgMSkgLyBpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBzb2x2ZWQgPSByZXM7XHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICBjYXNlICc9JzpcclxuICAgICAgICAgICAgICBzb2x2ZWQgPSBsZWZ0ID09PSByaWdodDtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIGNhc2UgJ3Npbic6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguc2luKHJpZ2h0Kk1hdGguUEkgLyAxODApKTtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIGNhc2UgJ2Nvcyc6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguY29zKHJpZ2h0Kk1hdGguUEkgLyAxODApKVxyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAndGFuJzpcclxuICAgICAgICAgICAgICBzb2x2ZWQgPSAoTWF0aC50YW4ocmlnaHQqTWF0aC5QSSAvIDE4MCkpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnYXNpbic6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguYXNpbihyaWdodCkgKiAoMTgwIC8gTWF0aC5QSSkpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnYWNvcyc6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguYWNvcyhyaWdodCkgKiAoMTgwIC8gTWF0aC5QSSkpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnYXRhbic6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguYXRhbihyaWdodCkgKiAoMTgwIC8gTWF0aC5QSSkpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICByZXR1cm4gbnVsbDsgXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHR5cGVvZiBzb2x2ZWQgPT09ICdudW1iZXInID8gTWF0aC5yb3VuZChzb2x2ZWQgKiAxMDAwMDApIC8gMTAwMDAwIDogc29sdmVkO1xyXG4gIH1cclxuICBcclxuICBmdW5jdGlvbiBjb250cm9sbGVyKG1hdGgpIHtcclxuICAgICAgXHJcbiAgICBhZGRtYXRoSW5mbyhgJHttYXRofVxcbmApO1xyXG4gIFxyXG4gICAgICBsZXQgdG9rZW5zQXJyPXRva2VuaXplKG1hdGgpO1xyXG4gICAgICBsZXQgdG9rZW5zID0gdG9rZW5zQXJyLnRva2VuczsgXHJcbiAgICAgIG1hdGg9dG9rZW5zQXJyLm1hdGg7XHJcbiAgICAgIFxyXG4gICAgICBsZXQgZXhwcmVzc2lvbiA9IHBvc2l0aW9uKHRva2Vucyk7IFxyXG4gIFxyXG4gICAgICBpZiAoZXhwcmVzc2lvbiA9PT0gbnVsbCAmJiAhKHRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnR5cGUgPT09ICdvcGVyYXRvcicgJiYgdG9rZW4udmFsdWUgIT09ICc9JykpJiYgdG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gJ3ZhcmlhYmxlJykpIFxyXG4gICAgICB7XHJcbiAgICAgICAgICByZXR1cm4gbWF0aDtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIGlmIChleHByZXNzaW9uID09PSBudWxsKXtcclxuICAgICAgICAgIHJldHVybiBNYXRoLnJvdW5kKHBhcnNlRmxvYXQobWF0aCkgKiAxMDAwMCkgLyAxMDAwMDtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgbGV0IHNvbHZlZCA9IHBhcnNlXHJcbiAgICAgIChcclxuICAgICAgICAgIGV4cHJlc3Npb24ub3BlcmF0b3IsICBcclxuICAgICAgICAgIGV4cHJlc3Npb24ubGVmdCAhPT0gbnVsbCA/IGV4cHJlc3Npb24ubGVmdCA6IG51bGwsXHJcbiAgICAgICAgICBleHByZXNzaW9uLmxlZnRWYXJpYWJsZSAhPT0gbnVsbCA/IGV4cHJlc3Npb24ubGVmdFZhcmlhYmxlIDogbnVsbCwgXHJcbiAgICAgICAgICBleHByZXNzaW9uLnJpZ2h0ICE9PSBudWxsID9leHByZXNzaW9uLnJpZ2h0IDogbnVsbClcclxuICAgICAgO1xyXG4gIFxyXG4gICAgICBhZGRTb2x1dGlvbkluZm8oYCR7ZXhwcmVzc2lvbi5sZWZ0fSAke2V4cHJlc3Npb24ub3BlcmF0b3J9ICR7ZXhwcmVzc2lvbi5yaWdodH0gLT4gJHtzb2x2ZWR9XFxuYClcclxuICBcclxuICAgICAgaWYgKHNvbHZlZCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgcmV0dXJuIG51bGw7ICBcclxuICAgICAgfVxyXG4gICAgICBpZiAodHlwZW9mIHNvbHZlZD09PWBzdHJpbmdgKSB7XHJcbiAgICAgICAgICByZXR1cm4gc29sdmVkOyAgXHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGxldCBsZWZ0UG9zID10b2tlbnNbZXhwcmVzc2lvbi5sZWZ0QnJlYWtdLnN0YXJ0UG9zO1xyXG4gICAgICBsZXQgcmlnaHRQb3MgPSB0b2tlbnNbZXhwcmVzc2lvbi5yaWdodEJyZWFrLTFdLmVuZFBvcysxO1xyXG4gIFxyXG4gICAgICBtYXRoID0gbWF0aC5zbGljZSgwLCBsZWZ0UG9zKSArIHNvbHZlZCArIG1hdGguc2xpY2UocmlnaHRQb3MpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIG1hdGghPT0ndHJ1ZScmJm1hdGghPT0nZmFsc2UnP2NvbnRyb2xsZXIobWF0aCk6bWF0aDtcclxuICAgIH1cclxuICAgIFNvbHV0aW9uPWNvbnRyb2xsZXIobWF0aCk7XHJcbiAgICBpZiAoRXJyb3IubGVuZ3RoID4gMCkgeyByZXR1cm4gRXJyb3I7IH0gXHJcbiAgICBlbHNlIHsgXHJcbnJldHVybiB7IFNvbHV0aW9uOiBTb2x1dGlvbiwgaW5mbzogbWF0aEluZm8sIFNvbHV0aW9uSW5mbzogU29sdXRpb25JbmZvfTt9XHJcbn0iXX0=