export function controller(mathExpression) {
    let Error = [];
    let mathInfo = '';
    let SolutionInfo = '';
    let debugInfo = '';
    addDebugInfo('mathExpression', mathExpression);
    let math = `${mathExpression}`
        .replace(/(\s|_\{[\w]*\}|:)/g, "")
        .replace(/{/g, "(")
        .replace(/}/g, ")")
        .replace(/\\cdot/g, "*")
        .replace(/arc/g, "a")
        .replace(/Math./g, "\\")
        .replace(/(?<!\\)(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\$1");
    addDebugInfo('math', math);
    function addDebugInfo(msg, value) {
        debugInfo += `${msg}: ${JSON.stringify(value)}\n`;
    }
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
        addDebugInfo('tokens', tokens);
        math = tokensArr.math;
        let expression = position(tokens);
        addDebugInfo('expression', expression);
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
        return { Solution: Solution, info: mathInfo, SolutionInfo: SolutionInfo, debugInfo: debugInfo };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21hdGhFbmdpbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxVQUFVLFVBQVUsQ0FBQyxjQUFjO0lBQ3JDLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztJQUNmLElBQUksUUFBUSxHQUFHLEVBQUUsQ0FBQztJQUNsQixJQUFJLFlBQVksR0FBRyxFQUFFLENBQUM7SUFDdEIsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBRW5CLFlBQVksQ0FBQyxnQkFBZ0IsRUFBQyxjQUFjLENBQUMsQ0FBQztJQUM5QyxJQUFJLElBQUksR0FBRyxHQUFHLGNBQWMsRUFBRTtTQUMvQixPQUFPLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxDQUFDO1NBQ2pDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO1NBQ2xCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO1NBQ2xCLE9BQU8sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDO1NBQ3ZCLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDO1NBQ3BCLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDO1NBQ3ZCLE9BQU8sQ0FBQyxzREFBc0QsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUV6RSxZQUFZLENBQUMsTUFBTSxFQUFDLElBQUksQ0FBQyxDQUFBO0lBQ3pCLFNBQVMsWUFBWSxDQUFDLEdBQUcsRUFBRSxLQUFLO1FBQzlCLFNBQVMsSUFBSSxHQUFHLEdBQUcsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDdEQsQ0FBQztJQUNDLFNBQVMsV0FBVyxDQUFDLEtBQUs7UUFDeEIsUUFBUSxJQUFJLEtBQUssQ0FBQztJQUNwQixDQUFDO0lBQ0QsU0FBUyxlQUFlLENBQUMsS0FBSztRQUM1QixZQUFZLElBQUksS0FBSyxDQUFDO0lBQzFCLENBQUM7SUFFQyxjQUFjO0lBQ2QsU0FBUyxRQUFRLENBQUMsSUFBSTtRQUNsQixJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDaEIsSUFBSSxRQUFRLEdBQUcsQ0FBQyxFQUFFLFNBQVMsR0FBRyxDQUFDLEVBQUUsVUFBVSxHQUFHLEVBQUUsQ0FBQztRQUNqRCxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFFWixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNsQyxJQUFJLE1BQU0sR0FBRyxFQUFFLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRLEdBQUcsQ0FBQyxDQUFDO1lBRTVDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtnQkFDakIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRTtvQkFDdkIsVUFBVSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDNUI7Z0JBQ0QsSUFBSSxFQUFFLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLFFBQVEsR0FBRyxHQUFHLEdBQUcsRUFBRSxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzVGLFFBQVEsRUFBRSxDQUFDO2dCQUNYLFNBQVMsRUFBRSxDQUFDO2dCQUNaLFNBQVM7YUFDWjtZQUVELElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtnQkFDakIsU0FBUyxFQUFFLENBQUM7Z0JBQ1osSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFO29CQUNmLEtBQUssQ0FBQyxJQUFJLENBQUMsd0NBQXdDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO29CQUNoRSxTQUFTLEdBQUcsQ0FBQyxDQUFDO2lCQUNqQjtnQkFDRCxRQUFRLEVBQUUsQ0FBQztnQkFFWCxJQUFJLFFBQVEsR0FBRyxDQUFDLEVBQUU7b0JBQ2QsS0FBSyxDQUFDLElBQUksQ0FBQywwREFBMEQsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7b0JBQ2xGLFFBQVEsR0FBRyxDQUFDLENBQUM7aUJBQ2hCO2dCQUNELElBQUksRUFBRSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2xDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLFFBQVEsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBRTVHLElBQUksSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDbEksQ0FBQyxFQUFFLENBQUM7b0JBQ0osSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUM5QyxDQUFDLEVBQUUsQ0FBQztpQkFDSDtnQkFDRCxTQUFTO2FBQ1o7WUFFRCxtQkFBbUI7WUFDbkIsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUM1QixJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsRUFBRTtvQkFDdEksSUFBSSxNQUFNLEdBQUcsR0FBRyxDQUFDO29CQUNqQixRQUFRLEdBQUcsQ0FBQyxDQUFDO29CQUNiLENBQUMsRUFBRSxDQUFDO29CQUNKLE9BQU8sUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTt3QkFDM0IsTUFBTSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDbEIsQ0FBQyxFQUFFLENBQUM7cUJBQ1A7b0JBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDOUYsQ0FBQyxFQUFFLENBQUM7aUJBQ1A7cUJBQU07b0JBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2lCQUM3RTtnQkFDRCxTQUFTO2FBQ1o7WUFFRCwrQkFBK0I7WUFDL0IsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFO2dCQUNwQixRQUFRLEdBQUcsQ0FBQyxDQUFDO2dCQUNiLENBQUMsSUFBRSxDQUFDLENBQUM7Z0JBQ0wsSUFBSSxRQUFRLEdBQUcsRUFBRSxDQUFDO2dCQUNsQixPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7b0JBQ2hELFFBQVEsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3BCLENBQUMsRUFBRSxDQUFDO2lCQUNQO2dCQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3RGLENBQUMsRUFBRSxDQUFDO2dCQUNKLFNBQVM7YUFDWjtZQUVDLGlCQUFpQjtZQUNqQixPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQzNCLE1BQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xCLENBQUMsRUFBRSxDQUFDO2FBQ1A7WUFFRCxJQUFJLE1BQU0sRUFBRTtnQkFDUixJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFO29CQUMxQixJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQzVELENBQUMsRUFBRSxDQUFDO2lCQUNQO2dCQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzlGLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtvQkFDakIsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2lCQUNqRDtxQkFDSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUM7b0JBQ3hCLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDOUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDVjtnQkFDRCxDQUFDLEVBQUUsQ0FBQztnQkFDSixTQUFTO2FBQ1o7WUFFRCxtQkFBbUI7WUFDbkIsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUMxQixrQkFBa0I7Z0JBQ2xCLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFHLFVBQVUsSUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUNqSDtvQkFDQSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUcsQ0FBQyxDQUFDO29CQUNqTCxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7aUJBQ1o7cUJBRUksSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFO29CQUMzRSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUcsQ0FBQyxDQUFDO2lCQUM3RjtxQkFDSSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBRyxVQUFVLElBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDeEgsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFHLENBQUMsQ0FBQztpQkFDbEo7Z0JBQ0QsbUJBQW1CO2dCQUN2QixJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO29CQUNyQixDQUFDLEVBQUUsQ0FBQztvQkFDSixPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUU7d0JBQzdDLE1BQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2xCLENBQUMsRUFBRSxDQUFDO3FCQUNQO29CQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFDLENBQUMsQ0FBQztpQkFDNUc7Z0JBQ0wsVUFBVTtnQkFDVixJQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFDO29CQUM5RCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUMsSUFBSSxFQUFFLFVBQVUsRUFBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFDLEtBQUssRUFBRSxDQUFDLEVBQUMsUUFBUSxFQUFFLFFBQVEsRUFBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBQyxDQUFDLENBQUM7aUJBQ3RHO2FBQ0o7U0FDSjtRQUVELElBQUksU0FBUyxHQUFHLENBQUMsRUFBRTtZQUNmLEtBQUssQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztTQUNoRDtRQUVELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRUQsU0FBUyxLQUFLLENBQUMsTUFBTSxFQUFFLEdBQUc7UUFDdEIsSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEQsSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0QsT0FBTyxHQUFHLE1BQU0sR0FBRyxNQUFNLElBQUksS0FBSyxHQUFHLEtBQUssRUFBRSxDQUFDO0lBQ2pELENBQUM7SUFFRCxTQUFTLFlBQVksQ0FBQyxLQUFLO1FBQ3ZCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ25DLElBQUksT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUU7Z0JBQ3hFLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDL0MsQ0FBQyxFQUFFLENBQUM7YUFDUDtTQUNKO1FBQ0wsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzFCLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUM1QixDQUFDO0lBRUQsU0FBUyxlQUFlLENBQUMsTUFBTTtRQUMzQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDekIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ3JCLElBQUksVUFBVSxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLGFBQWEsR0FBRyxLQUFLLENBQUM7UUFFMUIsaUNBQWlDO1FBQ2pDLE9BQU8sQ0FBQyxhQUFhLEVBQUU7WUFDbkIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQ3BDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRTtvQkFDL0QsU0FBUyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7aUJBQzVCO2dCQUNELElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxHQUFHLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUU7b0JBQ3ZELEtBQUssR0FBRyxDQUFDLENBQUM7aUJBQ2I7Z0JBQ0QsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLFNBQVMsRUFBRTtvQkFDdkQsR0FBRyxHQUFHLENBQUMsQ0FBQztvQkFDUixNQUFNO2lCQUNUO2FBQ0o7WUFFRCxpRUFBaUU7WUFDakUsSUFBSSxDQUFDLFNBQVMsRUFBRTtnQkFDWixLQUFLLEdBQUcsQ0FBQyxDQUFDO2dCQUNWLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUNwQixhQUFhLEdBQUcsSUFBSSxDQUFDO2dCQUNyQixNQUFNO2FBQ1Q7WUFFRCwrREFBK0Q7WUFDL0QsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQ2xDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUU7b0JBQy9CLGFBQWEsR0FBRyxJQUFJLENBQUM7b0JBQ3JCLE1BQU07aUJBQ1Q7YUFDSjtZQUVELGlFQUFpRTtZQUNqRSxJQUFJLENBQUMsYUFBYSxFQUFFO2dCQUNoQixVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMzQixTQUFTLEdBQUcsSUFBSSxDQUFDO2FBQ3BCO1NBQ0o7UUFDRCw0REFBNEQ7UUFDNUQsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUMzQixLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQzlCLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUU7Z0JBQy9CLElBQUksQ0FBQyxFQUFFLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUU7b0JBQzFDLEVBQUUsR0FBRyxDQUFDLENBQUM7b0JBQUUsU0FBUztpQkFDckI7cUJBQ0ksSUFBSSxDQUFDLEVBQUUsSUFBSSx5Q0FBeUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFO29CQUM3RSxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUFFLFNBQVM7aUJBQ3JCO3FCQUNJLElBQUksQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUU7b0JBQzdDLEVBQUUsR0FBRyxDQUFDLENBQUM7b0JBQUUsU0FBUztpQkFDckI7cUJBQ0ksSUFBSSxDQUFDLEVBQUUsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDMUMsRUFBRSxHQUFHLENBQUMsQ0FBQztvQkFBRSxTQUFTO2lCQUNyQjtxQkFDSSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFO29CQUNsQyxJQUNJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLENBQUM7d0JBQzFELENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQyxFQUMzRDt3QkFDRSxPQUFPLENBQUMsQ0FBQztxQkFDWjt5QkFDSTt3QkFDRCxxQ0FBcUM7cUJBQ3hDO2lCQUNKO2FBQ0o7U0FDSjtRQUNELElBQUksRUFBRSxLQUFLLFNBQVMsRUFBRTtZQUFDLE9BQU8sRUFBRSxDQUFDO1NBQUM7YUFDN0IsSUFBSSxFQUFFLEtBQUssU0FBUyxFQUFFO1lBQUMsT0FBTyxFQUFFLENBQUM7U0FBQzthQUNsQyxJQUFJLEVBQUUsS0FBSyxTQUFTLEVBQUU7WUFBQyxPQUFPLEVBQUUsQ0FBQztTQUFDO2FBQ2xDLElBQUksRUFBRSxLQUFLLFNBQVMsRUFBRTtZQUFDLE9BQU8sRUFBRSxDQUFDO1NBQUM7YUFDbEM7WUFBQyxPQUFPLElBQUksQ0FBQztTQUFFO0lBQ3hCLENBQUM7SUFFRCxTQUFTLFNBQVMsQ0FBQyxNQUFNLEVBQUUsS0FBSztRQUM1QixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDbEIsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRWQsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDakMsSUFBSSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUU7Z0JBQ3BDLElBQUksQ0FBQyxLQUFHLEtBQUssR0FBQyxDQUFDLElBQUUsTUFBTSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFFLE1BQU0sQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFHLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO29CQUNsRixTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDbEIsTUFBTTtpQkFDVDthQUNKO2lCQUFNO2dCQUNILElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUU7b0JBQzdCLFNBQVMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNsQixNQUFNO2lCQUNUO2FBQ0o7U0FDSjtRQUNELEtBQUssSUFBSSxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ3pDLElBQUksR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztTQUNqQztRQUNELDJCQUEyQjtRQUMzQixPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLENBQUM7SUFDL0QsQ0FBQztJQUVELFNBQVMsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLO1FBQzdCLElBQUksU0FBUyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDOUIsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBRWYsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2hELElBQUksTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFO2dCQUNwQyxJQUFJLENBQUMsS0FBRyxLQUFLLEdBQUMsQ0FBQyxJQUFFLE1BQU0sQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBRSxNQUFNLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtvQkFDbEYsU0FBUyxHQUFHLENBQUMsQ0FBQztvQkFDZCxNQUFNO2lCQUNUO2FBQ0o7aUJBQU07Z0JBQ0gsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRTtvQkFDN0IsU0FBUyxHQUFHLENBQUMsQ0FBQztvQkFDZCxNQUFNO2lCQUNUO2FBQ0o7U0FDQTtRQUVELEtBQUssSUFBSSxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ3hDLEtBQUssSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1NBQzVCO1FBQ0QsT0FBTyxFQUFFLEtBQUssRUFBRSxZQUFZLENBQUMsS0FBSyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxDQUFDO0lBQ2hFLENBQUM7SUFDRCxTQUFTLGFBQWEsQ0FBQyxNQUFNLEVBQUUsS0FBSztRQUNoQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDbEIsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ2QsSUFBSSxRQUFRLEdBQUMsRUFBRSxDQUFDO1FBQ2hCLEtBQUssSUFBSSxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2pDLElBQUksTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFO2dCQUNwQyxJQUFJLENBQUMsS0FBRyxLQUFLLEdBQUMsQ0FBQyxJQUFFLE1BQU0sQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBRSxNQUFNLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBRyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtvQkFDbEYsU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ2xCLE1BQU07aUJBQ1Q7YUFDSjtpQkFBTTtnQkFDSCxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFO29CQUMvQixTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDbEIsTUFBTTtpQkFDVDthQUNKO1NBQ0o7UUFFRCxLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN6QyxJQUFJLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7WUFDOUIsUUFBUSxHQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7U0FDL0I7UUFDRCxPQUFPLEVBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUNsRixDQUFDO0lBQ0QsU0FBUyxRQUFRLENBQUMsTUFBTTtRQUNwQixJQUFJLEtBQUssR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEMsSUFBSSxLQUFLLEtBQUcsSUFBSSxFQUFDO1lBQUMsT0FBTyxJQUFJLENBQUE7U0FBQztRQUM5QixJQUFJLE9BQU8sRUFBRSxRQUFRLENBQUM7UUFDdEIsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxLQUFHLEdBQUcsRUFBQztZQUMxQixPQUFPLEdBQUcsYUFBYSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2QyxRQUFRLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyQyxPQUFPO2dCQUNILFFBQVEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSztnQkFDN0IsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSTtnQkFDcEMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxRQUFRO2dCQUM5QixLQUFLLEVBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJO2dCQUN0QyxTQUFTLEVBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLO2dCQUMvQyxVQUFVLEVBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQSxRQUFRLENBQUMsU0FBUyxDQUFBLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTTthQUN6RCxDQUFDO1NBQ0w7UUFDRCxRQUFRLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLEVBQUU7WUFDekIsS0FBSyxHQUFHLENBQUM7WUFDVCxLQUFLLEdBQUcsQ0FBQztZQUNULEtBQUssR0FBRyxDQUFDO1lBQ1QsS0FBSyxHQUFHO2dCQUNSLFdBQVc7Z0JBQ1AsT0FBTyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ25DLFFBQVEsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNyQyxNQUFNO1lBQ1YsS0FBSyxNQUFNLENBQUM7WUFDWixLQUFLLEtBQUssQ0FBQztZQUNYLEtBQUssS0FBSyxDQUFDO1lBQ1gsS0FBSyxLQUFLLENBQUM7WUFDWCxLQUFLLE1BQU0sQ0FBQztZQUNaLEtBQUssTUFBTSxDQUFDO1lBQ1osS0FBSyxNQUFNO2dCQUNQLFFBQVEsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNyQyxNQUFNO1lBQ1YsS0FBSyxNQUFNLENBQUM7WUFDWixLQUFLLE9BQU87Z0JBQ1IsT0FBTyxHQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUE7Z0JBQ2pDLFFBQVEsR0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQTtnQkFDOUMsT0FBTyxDQUFDLFNBQVMsR0FBQyxLQUFLLENBQUM7Z0JBQ3hCLFFBQVEsQ0FBQyxTQUFTLElBQUUsQ0FBQyxDQUFDO2dCQUN0QixNQUFNO1lBQ1Y7Z0JBQ0ksT0FBTyxJQUFJLENBQUM7U0FDbkI7UUFDRCxPQUFPO1lBQ0gsUUFBUSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLO1lBQzdCLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUk7WUFDcEMsS0FBSyxFQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSTtZQUN0QyxTQUFTLEVBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLO1lBQy9DLFVBQVUsRUFBQyxRQUFRLENBQUMsQ0FBQyxDQUFBLFFBQVEsQ0FBQyxTQUFTLENBQUEsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNO1NBQ3pELENBQUM7SUFDTixDQUFDO0lBRUQsU0FBUyxLQUFLLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSztRQUN6QyxJQUFJLElBQUksS0FBRyxJQUFJLElBQUUsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7WUFDL0IsS0FBSyxDQUFDLElBQUksQ0FBQyxtREFBbUQsQ0FBQyxDQUFDO1lBQ2hFLE9BQU8sSUFBSSxDQUFDO1NBQ2Y7UUFDRCxJQUFJLEtBQUssS0FBRyxJQUFJLElBQUUsS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7WUFDakMsS0FBSyxDQUFDLElBQUksQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1lBQ2pFLE9BQU8sSUFBSSxDQUFDO1NBQ2Y7UUFDRCxJQUFJLE9BQU8sRUFBQztZQUNSLE9BQU8sR0FBRyxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7U0FDM0M7UUFDRCxJQUFJLE1BQU0sQ0FBQztRQUNYLFFBQVEsUUFBUSxFQUFFO1lBQ2QsS0FBSyxNQUFNO2dCQUNQLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMxQixNQUFNO1lBQ1YsS0FBSyxHQUFHO2dCQUNKLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBQyxLQUFLLENBQUMsQ0FBQztnQkFDOUIsTUFBTTtZQUNWLEtBQUssTUFBTTtnQkFDUCxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN4QixNQUFNO1lBQ1YsS0FBSyxHQUFHO2dCQUNKLE1BQU0sR0FBRyxJQUFJLEdBQUcsS0FBSyxDQUFDO2dCQUN0QixNQUFNO1lBQ1YsS0FBSyxHQUFHO2dCQUNKLE1BQU0sR0FBRyxJQUFJLEdBQUcsS0FBSyxDQUFDO2dCQUN0QixNQUFNO1lBQ1YsS0FBSyxHQUFHO2dCQUNKLE1BQU0sR0FBRyxJQUFJLEdBQUcsS0FBSyxDQUFDO2dCQUN0QixNQUFNO1lBQ1YsS0FBSyxPQUFPO2dCQUNSLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsRUFBRTtvQkFBQyxPQUFPLElBQUksQ0FBQztpQkFBRTtnQkFDdkYsSUFBSSxLQUFLLEdBQUcsSUFBSSxFQUFFO29CQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7b0JBQUEsTUFBTTtpQkFBQztnQkFDckMsSUFBSSxLQUFLLEtBQUssQ0FBQyxJQUFJLEtBQUssS0FBSyxJQUFJLEVBQUU7b0JBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztvQkFBQSxNQUFNO2lCQUFDO2dCQUN0RCxJQUFJLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxLQUFLLElBQUksR0FBRyxDQUFDLEVBQUU7b0JBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztvQkFBQSxNQUFNO2lCQUFDO2dCQUM3RCxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUM7Z0JBQUEsSUFBSSxLQUFLLEdBQUcsSUFBSSxHQUFHLEtBQUssRUFBRTtvQkFBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQztpQkFBQztnQkFFM0QsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO2dCQUNaLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQ3pCLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDbEM7Z0JBQ0QsTUFBTSxHQUFHLEdBQUcsQ0FBQztnQkFDYixNQUFNO1lBQ1YsS0FBSyxHQUFHO2dCQUNKLE1BQU0sR0FBRyxJQUFJLEtBQUssS0FBSyxDQUFDO2dCQUN4QixNQUFNO1lBQ1YsS0FBSyxLQUFLO2dCQUNOLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDekMsTUFBTTtZQUNWLEtBQUssS0FBSztnQkFDTixNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUE7Z0JBQ3hDLE1BQU07WUFDVixLQUFLLEtBQUs7Z0JBQ04sTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN6QyxNQUFNO1lBQ1YsS0FBSyxNQUFNO2dCQUNQLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLE1BQU07WUFDVixLQUFLLE1BQU07Z0JBQ1AsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDOUMsTUFBTTtZQUNWLEtBQUssTUFBTTtnQkFDUCxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM5QyxNQUFNO1lBQ1Y7Z0JBQ0ksT0FBTyxJQUFJLENBQUM7U0FDbkI7UUFDRCxPQUFPLE9BQU8sTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDdEYsQ0FBQztJQUVELFNBQVMsVUFBVSxDQUFDLElBQUk7UUFFdEIsV0FBVyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQztRQUV2QixJQUFJLFNBQVMsR0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0IsSUFBSSxNQUFNLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQztRQUM5QixZQUFZLENBQUMsUUFBUSxFQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQzdCLElBQUksR0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO1FBRXBCLElBQUksVUFBVSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQyxZQUFZLENBQUMsWUFBWSxFQUFDLFVBQVUsQ0FBQyxDQUFBO1FBQ3JDLElBQUksVUFBVSxLQUFLLElBQUksSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssVUFBVSxJQUFJLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLENBQUMsSUFBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsRUFDdEo7WUFDSSxPQUFPLElBQUksQ0FBQztTQUNmO2FBQ0ksSUFBSSxVQUFVLEtBQUssSUFBSSxFQUFDO1lBQ3pCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO1NBQ3ZEO1FBRUQsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUVkLFVBQVUsQ0FBQyxRQUFRLEVBQ25CLFVBQVUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQ2pELFVBQVUsQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQ2pFLFVBQVUsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQSxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FDdEQ7UUFFRCxlQUFlLENBQUMsR0FBRyxVQUFVLENBQUMsSUFBSSxJQUFJLFVBQVUsQ0FBQyxRQUFRLElBQUksVUFBVSxDQUFDLEtBQUssT0FBTyxNQUFNLElBQUksQ0FBQyxDQUFBO1FBRS9GLElBQUksTUFBTSxLQUFLLElBQUksRUFBRTtZQUNqQixPQUFPLElBQUksQ0FBQztTQUNmO1FBQ0QsSUFBSSxPQUFPLE1BQU0sS0FBRyxRQUFRLEVBQUU7WUFDMUIsT0FBTyxNQUFNLENBQUM7U0FDakI7UUFFRCxJQUFJLE9BQU8sR0FBRSxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUNuRCxJQUFJLFFBQVEsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFVBQVUsR0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDO1FBRXhELElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU5RCxPQUFPLElBQUksS0FBRyxNQUFNLElBQUUsSUFBSSxLQUFHLE9BQU8sQ0FBQSxDQUFDLENBQUEsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUM7SUFDN0QsQ0FBQztJQUNELFFBQVEsR0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDMUIsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtRQUFFLE9BQU8sS0FBSyxDQUFDO0tBQUU7U0FDbEM7UUFDVCxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFDLFNBQVMsRUFBQyxDQUFDO0tBQUM7QUFDL0YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBmdW5jdGlvbiBjb250cm9sbGVyKG1hdGhFeHByZXNzaW9uKSB7XHJcbiAgICBsZXQgRXJyb3IgPSBbXTtcclxuICAgIGxldCBtYXRoSW5mbyA9ICcnOyBcclxuICAgIGxldCBTb2x1dGlvbkluZm8gPSAnJzsgXHJcbiAgICBsZXQgZGVidWdJbmZvID0gJyc7IFxyXG5cclxuICAgIGFkZERlYnVnSW5mbygnbWF0aEV4cHJlc3Npb24nLG1hdGhFeHByZXNzaW9uKTtcclxuICAgIGxldCBtYXRoID0gYCR7bWF0aEV4cHJlc3Npb259YFxyXG4gIC5yZXBsYWNlKC8oXFxzfF9cXHtbXFx3XSpcXH18OikvZywgXCJcIikgXHJcbiAgLnJlcGxhY2UoL3svZywgXCIoXCIpIFxyXG4gIC5yZXBsYWNlKC99L2csIFwiKVwiKVxyXG4gIC5yZXBsYWNlKC9cXFxcY2RvdC9nLCBcIipcIilcclxuICAucmVwbGFjZSgvYXJjL2csIFwiYVwiKVxyXG4gIC5yZXBsYWNlKC9NYXRoLi9nLCBcIlxcXFxcIilcclxuICAucmVwbGFjZSgvKD88IVxcXFwpKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58c3FydCkvZywgXCJcXFxcJDFcIik7XHJcblxyXG4gIGFkZERlYnVnSW5mbygnbWF0aCcsbWF0aClcclxuICBmdW5jdGlvbiBhZGREZWJ1Z0luZm8obXNnLCB2YWx1ZSkge1xyXG4gICAgZGVidWdJbmZvICs9IGAke21zZ306ICR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfVxcbmA7XHJcbn1cclxuICBmdW5jdGlvbiBhZGRtYXRoSW5mbyh2YWx1ZSkge1xyXG4gICAgbWF0aEluZm8gKz0gdmFsdWU7XHJcbiAgfVxyXG4gIGZ1bmN0aW9uIGFkZFNvbHV0aW9uSW5mbyh2YWx1ZSkge1xyXG4gICAgU29sdXRpb25JbmZvICs9IHZhbHVlO1xyXG59XHJcbiAgXHJcbiAgLy9yZXR1cm4gbWF0aDtcclxuICBmdW5jdGlvbiB0b2tlbml6ZShtYXRoKSB7XHJcbiAgICAgIGxldCB0b2tlbnMgPSBbXTtcclxuICAgICAgbGV0IGJyYWNrZXRzID0gMCwgdW5tYXRjaGVkID0gMCwgbGV2ZWxDb3VudCA9IHt9O1xyXG4gICAgICBsZXQgcG9zID0gMDsgXHJcbiAgICAgIFxyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGgubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgIGxldCBudW1iZXIgPSAnJywgbnVtU3RhcnQgPSBpLCBzdGFydFBvcyA9IGk7XHJcbiAgXHJcbiAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gJygnKSB7XHJcbiAgICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xyXG4gICAgICAgICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XHJcbiAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAncGFyZW4nLCB2YWx1ZTogJygnLCBpZDogYnJhY2tldHMgKyAnLicgKyBJRCwgc3RhcnRQb3M6IGksIGVuZFBvczogaSB9KTtcclxuICAgICAgICAgICAgICBicmFja2V0cysrOyAgXHJcbiAgICAgICAgICAgICAgdW5tYXRjaGVkKys7XHJcbiAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICBpZiAobWF0aFtpXSA9PT0gJyknKSB7XHJcbiAgICAgICAgICAgICAgdW5tYXRjaGVkLS07XHJcbiAgICAgICAgICAgICAgaWYgKHVubWF0Y2hlZCA8IDApIHtcclxuICAgICAgICAgICAgICAgICAgRXJyb3IucHVzaChgVW5tYXRjaGVkIGNsb3NpbmcgYnJhY2tldCBhdCBwb3NpdGlvbiBgICsgaSArIGBcXG5gKTtcclxuICAgICAgICAgICAgICAgICAgdW5tYXRjaGVkID0gMDsgXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGJyYWNrZXRzLS07IFxyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIGlmIChicmFja2V0cyA8IDApIHtcclxuICAgICAgICAgICAgICAgICAgRXJyb3IucHVzaChgTW9yZSBjbG9zaW5nIGJyYWNrZXRzIHRoYW4gb3BlbmluZyBicmFja2V0cyBhdCBwb3NpdGlvbiBgICsgaSArIGBcXG5gKTtcclxuICAgICAgICAgICAgICAgICAgYnJhY2tldHMgPSAwOyBcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgbGV0IElEID0gbGV2ZWxDb3VudFticmFja2V0c10gLSAxO1xyXG4gICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogJ3BhcmVuJywgdmFsdWU6ICcpJywgaWQ6IGJyYWNrZXRzICsgJy4nICsgKElEID49IDAgPyBJRCA6IDApLCBzdGFydFBvczogaSwgZW5kUG9zOiBpIH0pO1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIGlmIChtYXRoW2krMV0gPT09ICcoJyYmIS8oZnJhY3xiaW5vbSkvLnRlc3QodG9rZW5zW3Rva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uaWQpLmluZGV4T2YodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5pZCktMV0udmFsdWUpKSB7XHJcbiAgICAgICAgICAgICAgaSsrOyBcclxuICAgICAgICAgICAgICBtYXRoID0gbWF0aC5zbGljZSgwLCBpKSArICcqJyArIG1hdGguc2xpY2UoaSk7XHJcbiAgICAgICAgICAgICAgaS0tOyBcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICAvLyBIYW5kbGUgb3BlcmF0b3JzXHJcbiAgICAgICAgICBpZiAoL1srXFwqLVxcL149XS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSAnLScgJiYgKHRva2Vucy5sZW5ndGggPT09IDAgfHwgdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS50eXBlID09PSAnb3BlcmF0b3InIHx8IHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09ICcoJykpIHtcclxuICAgICAgICAgICAgICAgICAgbGV0IG51bWJlciA9ICctJztcclxuICAgICAgICAgICAgICAgICAgc3RhcnRQb3MgPSBpOyBcclxuICAgICAgICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICAgICAgICB3aGlsZSAoL1swLTkuXS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbnVtYmVyICs9IG1hdGhbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICBpKys7XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAnbnVtYmVyJywgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKSwgc3RhcnRQb3M6IHN0YXJ0UG9zLCBlbmRQb3M6IGkgLSAxIH0pO1xyXG4gICAgICAgICAgICAgICAgICBpLS07IFxyXG4gICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogJ29wZXJhdG9yJywgdmFsdWU6IG1hdGhbaV0sIHN0YXJ0UG9zOiBpLCBlbmRQb3M6IGkgfSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgfVxyXG4gIFxyXG4gICAgICAgICAgLy8gSGFuZGxlIExhVGVYLXN0eWxlIG9wZXJhdG9yc1xyXG4gICAgICAgICAgaWYgKG1hdGhbaV0gPT09ICdcXFxcJykgeyAgXHJcbiAgICAgICAgICAgIHN0YXJ0UG9zID0gaTsgIFxyXG4gICAgICAgICAgICBpKz0xOyAgXHJcbiAgICAgICAgICAgIGxldCBvcGVyYXRvciA9ICcnO1xyXG4gICAgICAgICAgICB3aGlsZSAoaSA8IG1hdGgubGVuZ3RoICYmIC9bYS16QS1aXS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgb3BlcmF0b3IgKz0gbWF0aFtpXTtcclxuICAgICAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6ICdvcGVyYXRvcicsIHZhbHVlOiBvcGVyYXRvciwgc3RhcnRQb3M6IHN0YXJ0UG9zLCBlbmRQb3M6IGkgLSAxIH0pO1xyXG4gICAgICAgICAgICBpLS07XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICBcclxuICAgICAgICAgIC8vIEhhbmRsZSBudW1iZXJzXHJcbiAgICAgICAgICB3aGlsZSAoL1swLTkuXS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICAgIG51bWJlciArPSBtYXRoW2ldO1xyXG4gICAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIGlmIChudW1iZXIpIHtcclxuICAgICAgICAgICAgICBpZiAobWF0aFtudW1TdGFydC0xXSA9PT0gJyknKSB7XHJcbiAgICAgICAgICAgICAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIG51bVN0YXJ0KSArICcqJyArIG1hdGguc2xpY2UobnVtU3RhcnQpOyAgXHJcbiAgICAgICAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAnbnVtYmVyJywgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKSwgc3RhcnRQb3M6IG51bVN0YXJ0LCBlbmRQb3M6IGkgLSAxIH0pO1xyXG4gICAgICAgICAgICAgIGlmIChtYXRoW2ldID09PSAnKCcpIHtcclxuICAgICAgICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgaSkgKyAnKicgKyBtYXRoLnNsaWNlKGkpOyAgXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGVsc2UgaWYgKC9cXFxcLy50ZXN0KG1hdGhbaV0pKXtcclxuICAgICAgICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgaSkgKyAnKicgKyBtYXRoLnNsaWNlKGkpO1xyXG4gICAgICAgICAgICAgICAgICBpICs9IDE7IFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBpLS07ICBcclxuICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIC8vIEhhbmRsZSB2YXJpYWJsZXNcclxuICAgICAgICAgIGlmICgvW2EtekEtWl0vLnRlc3QobWF0aFtpXSkpIHtcclxuICAgICAgICAgICAgICAvLyB2IGFuZCBiZWZvciBudW1cclxuICAgICAgICAgICAgICBpZiAodG9rZW5zLmxlbmd0aCA+IDEgJiZ0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDJdLnR5cGU9PT0nb3BlcmF0b3InJiYvWystXS8udGVzdCh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDJdLnZhbHVlKSkgXHJcbiAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGggLSAyXSwgeyB0eXBlOiAndmFyaWFibGUnLHZhbHVlOiBwYXJzZUZsb2F0KHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMl0udmFsdWUrdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS52YWx1ZSksIHZhcmlhYmxlOiBtYXRoW2ldLCBlbmRQb3M6IGkgIH0pO1xyXG4gICAgICAgICAgICAgIHRva2Vucy5wb3AoKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAodG9rZW5zLmxlbmd0aCA+IDAgJiYgdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS50eXBlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXSwgeyB0eXBlOiAndmFyaWFibGUnLCB2YXJpYWJsZTogbWF0aFtpXSwgZW5kUG9zOiBpICB9KTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAodG9rZW5zLmxlbmd0aCA+IDAgJiZ0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnR5cGU9PT0nb3BlcmF0b3InJiYvWystXS8udGVzdCh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXSwgeyB0eXBlOiAndmFyaWFibGUnLHZhbHVlOiBwYXJzZUZsb2F0KHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUrMSksIHZhcmlhYmxlOiBtYXRoW2ldLCBlbmRQb3M6IGkgIH0pO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAvLyB2IGFuZCBhZmZ0ZXIgbnVtXHJcbiAgICAgICAgICBpZiAoL1swLTldLy50ZXN0KG1hdGhbaSsxXSkpIHtcclxuICAgICAgICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICAgICAgICB3aGlsZSAoL1swLTldLy50ZXN0KG1hdGhbaV0pICYmIGkgPCBtYXRoLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbnVtYmVyICs9IG1hdGhbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICBpKys7XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goe3R5cGU6ICd2YXJpYWJsZScsdmFyaWFibGU6IG1hdGhbc3RhcnRQb3NdLHZhbHVlOiBudW1iZXIsIHN0YXJ0UG9zOiBzdGFydFBvcyxlbmRQb3M6IGkgLSAxfSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgLy8gZGVmYXVsdFxyXG4gICAgICAgICAgaWYgICghdG9rZW5zLmxlbmd0aCA+IDB8fCF0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnR5cGUgPT09ICdudW1iZXInKXtcclxuICAgICAgICAgICAgICAgICAgdG9rZW5zLnB1c2goe3R5cGU6ICd2YXJpYWJsZScsdmFyaWFibGU6IG1hdGhbc3RhcnRQb3NdLHZhbHVlOiAxLHN0YXJ0UG9zOiBzdGFydFBvcyxlbmRQb3M6IGkgLSAxfSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIGlmICh1bm1hdGNoZWQgPiAwKSB7XHJcbiAgICAgICAgICBFcnJvci5wdXNoKGBVbm1hdGNoZWQgb3BlbmluZyBicmFja2V0KHMpXFxuYCk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgcmV0dXJuIHsgdG9rZW5zOiB0b2tlbnMsIG1hdGg6IG1hdGggfTtcclxuICB9IFxyXG4gIFxyXG4gIGZ1bmN0aW9uIGludElEKHBhcnRJRCwgaW50KSB7XHJcbiAgICAgIGxldCBbYmFzZUlELCBzdWJJRCA9IDBdID0gcGFydElELnNwbGl0KCcuJykubWFwKE51bWJlcik7XHJcbiAgICAgIGxldCBbYmFzZUlOLCBzdWJJTiA9IDBdID0gU3RyaW5nKGludCkuc3BsaXQoJy4nKS5tYXAoTnVtYmVyKTtcclxuICAgICAgcmV0dXJuIGAke2Jhc2VJRCArIGJhc2VJTn0uJHtzdWJJRCArIHN1YklOfWA7XHJcbiAgfVxyXG4gIFxyXG4gIGZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSAnc3RyaW5nJyAmJiAodmFsdWVbaV0gPT09ICcoJyB8fCB2YWx1ZVtpXSA9PT0gJyknKSkge1xyXG4gICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XHJcbiAgICAgICAgICAgICAgaS0tOyAgXHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xyXG4gIHJldHVybiBpc05hTihudW0pID8gMCA6IG51bTtcclxuICB9XHJcbiAgXHJcbiAgZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2Vucykge1xyXG4gICAgICBsZXQgYmVnaW4gPSAtMSwgZW5kID0gLTE7XHJcbiAgICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgIGxldCBjaGVja2VkSURzID0gW107ICBcclxuICAgICAgbGV0IG9wZXJhdG9yRm91bmQgPSBmYWxzZTsgIFxyXG4gIFxyXG4gICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgICAgd2hpbGUgKCFvcGVyYXRvckZvdW5kKSB7XHJcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcoJyAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnNbaV0uaWQpKSB7XHJcbiAgICAgICAgICAgICAgICAgIGN1cnJlbnRJRCA9IHRva2Vuc1tpXS5pZDsgIFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnKCcgJiYgdG9rZW5zW2ldLmlkID09PSBjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgICAgICAgYmVnaW4gPSBpOyAgXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcpJyAmJiB0b2tlbnNbaV0uaWQgPT09IGN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICAgICAgICBlbmQgPSBpOyAgXHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIC8vIElmIG5vIG1vcmUgcGFyZW50aGVzZXMgYXJlIGZvdW5kLCBwcm9jZXNzIHRoZSB3aG9sZSBleHByZXNzaW9uXHJcbiAgICAgICAgICBpZiAoIWN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICAgIGJlZ2luID0gMDtcclxuICAgICAgICAgICAgICBlbmQgPSB0b2tlbnMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgIG9wZXJhdG9yRm91bmQgPSB0cnVlOyAgXHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSdzIGFuIG9wZXJhdG9yIGJldHdlZW4gdGhlIGN1cnJlbnQgcGFyZW50aGVzZXNcclxuICAgICAgICAgIGZvciAobGV0IGkgPSBiZWdpbiArIDE7IGkgPCBlbmQ7IGkrKykge1xyXG4gICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udHlwZSA9PT0gJ29wZXJhdG9yJykge1xyXG4gICAgICAgICAgICAgICAgICBvcGVyYXRvckZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gIFxyXG4gICAgICAgICAgLy8gSWYgbm8gb3BlcmF0b3IgaXMgZm91bmQsIG1hcmsgdGhpcyBwYXJlbnRoZXNlcyBwYWlyIGFzIGNoZWNrZWRcclxuICAgICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQpOyAgXHJcbiAgICAgICAgICAgICAgY3VycmVudElEID0gbnVsbDsgIFxyXG4gICAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIC8vIE5vdyBwcmlvcml0aXplIG9wZXJhdG9ycyBiYXNlZCBvbiB0aGUgb3JkZXIgb2YgcHJlY2VkZW5jZVxyXG4gICAgICBsZXQgcDEsIHAyLCBwMywgcDQsIHA1LCBwNjtcclxuICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDwgZW5kOyBpKyspIHtcclxuICAgICAgICAgIGlmICh0b2tlbnNbaV0udHlwZSA9PT0gJ29wZXJhdG9yJykge1xyXG4gICAgICAgICAgICAgIGlmICghcDEgJiYgLyhcXF58c3FydCkvLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICBwMSA9IGk7ICBjb250aW51ZTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAoIXAyICYmIC8oZnJhY3xiaW5vbXxzaW58Y29zfHRhbnxhc2lufGFjb3N8YXRhbikvLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICBwMiA9IGk7ICBjb250aW51ZTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAoIXAzICYmIC8oXFwqfFxcLykvLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICBwMyA9IGk7ICBjb250aW51ZTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZWxzZSBpZiAoIXA0ICYmIC9bKy1dLy50ZXN0KHRva2Vuc1tpXS52YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgICAgcDQgPSBpOyAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGVsc2UgaWYgKC9bPV0vLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAhdG9rZW5zLnNsaWNlKDAsIGkpLnNvbWUodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gJ251bWJlcicpICYmIFxyXG4gICAgICAgICAgICAgICAgICAgICAgIXRva2Vucy5zbGljZShpKS5zb21lKHRva2VuID0+IHRva2VuLnR5cGUgPT09ICd2YXJpYWJsZScpXHJcbiAgICAgICAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGk7XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAvL2hlciBpIGJlZWQgdG8gYWRkIHRoZSBncm9waW5nIGxvamljXHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHAxICE9PSB1bmRlZmluZWQpIHtyZXR1cm4gcDE7fSBcclxuICAgICAgZWxzZSBpZiAocDIgIT09IHVuZGVmaW5lZCkge3JldHVybiBwMjt9IFxyXG4gICAgICBlbHNlIGlmIChwMyAhPT0gdW5kZWZpbmVkKSB7cmV0dXJuIHAzO30gXHJcbiAgICAgIGVsc2UgaWYgKHA0ICE9PSB1bmRlZmluZWQpIHtyZXR1cm4gcDQ7fSBcclxuICAgICAgZWxzZSB7cmV0dXJuIG51bGw7IH1cclxuICB9XHJcbiAgXHJcbiAgZnVuY3Rpb24gcGFyc2VMZWZ0KHRva2VucywgaW5kZXgpIHtcclxuICAgICAgbGV0IGJyZWFrQ2hhciA9IDA7XHJcbiAgICAgIGxldCBsZWZ0ID0gJyc7XHJcbiAgXHJcbiAgICAgIGZvciAobGV0IGkgPSBpbmRleCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICBpZiAodG9rZW5zW2luZGV4IC0gMV0udHlwZSA9PT0gJ3BhcmVuJykge1xyXG4gICAgICAgICAgICAgIGlmIChpIT09aW5kZXgtMiYmdG9rZW5zW2krMV0udHlwZSA9PT0gJ3BhcmVuJyYmdG9rZW5zW2krMV0uaWQ9PT10b2tlbnNbaW5kZXggLSAxXS5pZCkge1xyXG4gICAgICAgICAgICAgICAgICBicmVha0NoYXIgPSBpICsgMTtcclxuICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldLnR5cGUgIT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrQ2hhciA9IGkgKyAxO1xyXG4gICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChsZXQgaSA9IGluZGV4IC0gMTsgaSA+PSBicmVha0NoYXI7IGktLSkge1xyXG4gICAgICAgICAgbGVmdCA9IHRva2Vuc1tpXS52YWx1ZSArIGxlZnQ7IFxyXG4gICAgICB9XHJcbiAgICAgIC8vYWRkRGVidWdJbmZvKCdsZWZ0JyxsZWZ0KVxyXG4gICAgICByZXR1cm4geyB2YWx1ZTogc2FmZVRvTnVtYmVyKGxlZnQpLCBicmVha0NoYXI6IGJyZWFrQ2hhciB9O1xyXG4gIH1cclxuICBcclxuICBmdW5jdGlvbiBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpIHtcclxuICAgICAgbGV0IGJyZWFrQ2hhciA9IHRva2Vucy5sZW5ndGg7IFxyXG4gICAgICBsZXQgcmlnaHQgPSAnJzsgXHJcbiAgXHJcbiAgICAgIGZvciAobGV0IGkgPSBpbmRleCArIDE7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgaWYgKHRva2Vuc1tpbmRleCArIDFdLnR5cGUgPT09ICdwYXJlbicpIHtcclxuICAgICAgICAgIGlmIChpIT09aW5kZXgrMiYmdG9rZW5zW2ktMV0udHlwZSA9PT0gJ3BhcmVuJyYmdG9rZW5zW2ktMV0uaWQ9PT10b2tlbnNbaW5kZXggKyAxXS5pZCkge1xyXG4gICAgICAgICAgICAgIGJyZWFrQ2hhciA9IGk7XHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpZiAodG9rZW5zW2ldLnR5cGUgIT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgYnJlYWtDaGFyID0gaTtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIGZvciAobGV0IGkgPSBpbmRleCArIDE7IGkgPCBicmVha0NoYXI7IGkrKykge1xyXG4gICAgICAgICAgcmlnaHQgKz0gdG9rZW5zW2ldLnZhbHVlOyBcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4geyB2YWx1ZTogc2FmZVRvTnVtYmVyKHJpZ2h0KSwgYnJlYWtDaGFyOiBicmVha0NoYXIgfTsgXHJcbiAgfVxyXG4gIGZ1bmN0aW9uIHByYXNlVmFyaWFibGUodG9rZW5zLCBpbmRleCkge1xyXG4gICAgICBsZXQgYnJlYWtDaGFyID0gMDtcclxuICAgICAgbGV0IGxlZnQgPSAnJztcclxuICAgICAgbGV0IHZhcmlhYmxlPScnO1xyXG4gICAgICBmb3IgKGxldCBpID0gaW5kZXggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09ICdwYXJlbicpIHtcclxuICAgICAgICAgICAgICBpZiAoaSE9PWluZGV4LTImJnRva2Vuc1tpKzFdLnR5cGUgPT09ICdwYXJlbicmJnRva2Vuc1tpKzFdLmlkPT09dG9rZW5zW2luZGV4IC0gMV0uaWQpIHtcclxuICAgICAgICAgICAgICAgICAgYnJlYWtDaGFyID0gaSArIDE7XHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS50eXBlICE9PSAndmFyaWFibGUnKSB7XHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrQ2hhciA9IGkgKyAxO1xyXG4gICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgZm9yIChsZXQgaSA9IGluZGV4IC0gMTsgaSA+PSBicmVha0NoYXI7IGktLSkge1xyXG4gICAgICAgICAgbGVmdCA9IHRva2Vuc1tpXS52YWx1ZSArIGxlZnQ7IFxyXG4gICAgICAgICAgdmFyaWFibGU9dG9rZW5zW2ldLnZhcmlhYmxlO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB7dmFyaWFibGU6IHZhcmlhYmxlLCB2YWx1ZTogc2FmZVRvTnVtYmVyKGxlZnQpLCBicmVha0NoYXI6IGJyZWFrQ2hhciB9O1xyXG4gIH1cclxuICBmdW5jdGlvbiBwb3NpdGlvbih0b2tlbnMpIHtcclxuICAgICAgbGV0IGluZGV4ID0gb3BlcmF0aW9uc09yZGVyKHRva2Vucyk7XHJcbiAgICAgIGlmIChpbmRleD09PW51bGwpe3JldHVybiBudWxsfVxyXG4gICAgICBsZXQgbGVmdE9iaiwgcmlnaHRPYmo7XHJcbiAgICAgIGlmICh0b2tlbnNbaW5kZXhdLnZhbHVlPT09Jz0nKXtcclxuICAgICAgICAgIGxlZnRPYmogPSBwcmFzZVZhcmlhYmxlKHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgcmlnaHRPYmogPSBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgcmV0dXJuIHsgXHJcbiAgICAgICAgICAgICAgb3BlcmF0b3I6IHRva2Vuc1tpbmRleF0udmFsdWUsIFxyXG4gICAgICAgICAgICAgIGxlZnQ6IGxlZnRPYmogPyBsZWZ0T2JqLnZhbHVlIDogbnVsbCxcclxuICAgICAgICAgICAgICBsZWZ0VmFyaWFibGU6IGxlZnRPYmoudmFyaWFibGUsXHJcbiAgICAgICAgICAgICAgcmlnaHQ6cmlnaHRPYmogPyByaWdodE9iai52YWx1ZSA6IG51bGwsIFxyXG4gICAgICAgICAgICAgIGxlZnRCcmVhazogIGxlZnRPYmogPyBsZWZ0T2JqLmJyZWFrQ2hhciA6IGluZGV4LCBcclxuICAgICAgICAgICAgICByaWdodEJyZWFrOnJpZ2h0T2JqID9yaWdodE9iai5icmVha0NoYXI6IHRva2Vucy5sZW5ndGhcclxuICAgICAgICAgIH07IFxyXG4gICAgICB9XHJcbiAgICAgIHN3aXRjaCAodG9rZW5zW2luZGV4XS52YWx1ZSkge1xyXG4gICAgICAgICAgY2FzZSAnXic6XHJcbiAgICAgICAgICBjYXNlICcrJzpcclxuICAgICAgICAgIGNhc2UgJy0nOlxyXG4gICAgICAgICAgY2FzZSAnKic6XHJcbiAgICAgICAgICAvL2Nhc2UgJz0nOlxyXG4gICAgICAgICAgICAgIGxlZnRPYmogPSBwYXJzZUxlZnQodG9rZW5zLCBpbmRleCk7XHJcbiAgICAgICAgICAgICAgcmlnaHRPYmogPSBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnc3FydCc6XHJcbiAgICAgICAgICBjYXNlICdzaW4nOlxyXG4gICAgICAgICAgY2FzZSAnY29zJzpcclxuICAgICAgICAgIGNhc2UgJ3Rhbic6XHJcbiAgICAgICAgICBjYXNlICdhc2luJzpcclxuICAgICAgICAgIGNhc2UgJ2Fjb3MnOlxyXG4gICAgICAgICAgY2FzZSAnYXRhbic6XHJcbiAgICAgICAgICAgICAgcmlnaHRPYmogPSBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnZnJhYyc6XHJcbiAgICAgICAgICBjYXNlICdiaW5vbSc6XHJcbiAgICAgICAgICAgICAgbGVmdE9iaj1wYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpXHJcbiAgICAgICAgICAgICAgcmlnaHRPYmo9cGFyc2VSaWdodCh0b2tlbnMsIGxlZnRPYmouYnJlYWtDaGFyKVxyXG4gICAgICAgICAgICAgIGxlZnRPYmouYnJlYWtDaGFyPWluZGV4O1xyXG4gICAgICAgICAgICAgIHJpZ2h0T2JqLmJyZWFrQ2hhcis9MTtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB7IFxyXG4gICAgICAgICAgb3BlcmF0b3I6IHRva2Vuc1tpbmRleF0udmFsdWUsIFxyXG4gICAgICAgICAgbGVmdDogbGVmdE9iaiA/IGxlZnRPYmoudmFsdWUgOiBudWxsLFxyXG4gICAgICAgICAgcmlnaHQ6cmlnaHRPYmogPyByaWdodE9iai52YWx1ZSA6IG51bGwsIFxyXG4gICAgICAgICAgbGVmdEJyZWFrOiAgbGVmdE9iaiA/IGxlZnRPYmouYnJlYWtDaGFyIDogaW5kZXgsIFxyXG4gICAgICAgICAgcmlnaHRCcmVhazpyaWdodE9iaiA/cmlnaHRPYmouYnJlYWtDaGFyOiB0b2tlbnMubGVuZ3RoXHJcbiAgICAgIH07IFxyXG4gIH1cclxuICBcclxuICBmdW5jdGlvbiBwYXJzZShvcGVyYXRvciwgbGVmdCwgbGVmdFZhciwgcmlnaHQpIHsgXHJcbiAgICAgIGlmIChsZWZ0IT09bnVsbCYmbGVmdC5sZW5ndGggPD0gMCkge1xyXG4gICAgICAgICAgRXJyb3IucHVzaChgRXJyb3I6IExlZnQgc2lkZSBvZiBhbiBvcGVyYXRvciBtdXN0IGhhdmUgYSB2YWx1ZWApO1xyXG4gICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHJpZ2h0IT09bnVsbCYmcmlnaHQubGVuZ3RoIDw9IDApIHtcclxuICAgICAgICAgIEVycm9yLnB1c2goYEVycm9yOiBSaWdodCBzaWRlIG9mIGFuIG9wZXJhdG9yIG11c3QgaGF2ZSBhIHZhbHVlYCk7XHJcbiAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgICBpZiAobGVmdFZhcil7XHJcbiAgICAgICAgICByZXR1cm4gYCR7bGVmdFZhcn0gPSAkeyhyaWdodCkvKGxlZnQpfWA7XHJcbiAgICAgIH1cclxuICAgICAgbGV0IHNvbHZlZDsgXHJcbiAgICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcclxuICAgICAgICAgIGNhc2UgJ3NxcnQnOlxyXG4gICAgICAgICAgICAgIHNvbHZlZCA9IE1hdGguc3FydChyaWdodCk7XHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICBjYXNlICdeJzpcclxuICAgICAgICAgICAgICBzb2x2ZWQgPSBNYXRoLnBvdyhsZWZ0LHJpZ2h0KTtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIGNhc2UgJ2ZyYWMnOlxyXG4gICAgICAgICAgICAgIHNvbHZlZCA9IChsZWZ0KS8ocmlnaHQpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnKic6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gbGVmdCAqIHJpZ2h0O1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnKyc6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gbGVmdCArIHJpZ2h0O1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnLSc6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gbGVmdCAtIHJpZ2h0O1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnYmlub20nOlxyXG4gICAgICAgICAgICAgIGlmIChOdW1iZXIuaXNOYU4obGVmdCkgfHwgTnVtYmVyLmlzTmFOKHJpZ2h0KSB8fCBsZWZ0IDwgMCB8fCByaWdodCA8IDApIHtyZXR1cm4gbnVsbDsgfVxyXG4gICAgICAgICAgICAgIGlmIChyaWdodCA+IGxlZnQpIHtzb2x2ZWQgPSAwO2JyZWFrO31cclxuICAgICAgICAgICAgICBpZiAocmlnaHQgPT09IDAgfHwgcmlnaHQgPT09IGxlZnQpIHtzb2x2ZWQgPSAxO2JyZWFrO31cclxuICAgICAgICAgICAgICBpZiAocmlnaHQgPT09IDEgfHwgcmlnaHQgPT09IGxlZnQgLSAxKSB7c29sdmVkID0gbGVmdDticmVhazt9XHJcbiAgICAgICAgICAgICAgbGV0IGsgPSByaWdodDtpZiAocmlnaHQgPiBsZWZ0IC0gcmlnaHQpIHtrID0gbGVmdCAtIHJpZ2h0O31cclxuICBcclxuICAgICAgICAgICAgICBsZXQgcmVzID0gMTtcclxuICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBrOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgcmVzID0gcmVzICogKGxlZnQgLSBpICsgMSkgLyBpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBzb2x2ZWQgPSByZXM7XHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICBjYXNlICc9JzpcclxuICAgICAgICAgICAgICBzb2x2ZWQgPSBsZWZ0ID09PSByaWdodDtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIGNhc2UgJ3Npbic6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguc2luKHJpZ2h0Kk1hdGguUEkgLyAxODApKTtcclxuICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIGNhc2UgJ2Nvcyc6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguY29zKHJpZ2h0Kk1hdGguUEkgLyAxODApKVxyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAndGFuJzpcclxuICAgICAgICAgICAgICBzb2x2ZWQgPSAoTWF0aC50YW4ocmlnaHQqTWF0aC5QSSAvIDE4MCkpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnYXNpbic6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguYXNpbihyaWdodCkgKiAoMTgwIC8gTWF0aC5QSSkpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnYWNvcyc6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguYWNvcyhyaWdodCkgKiAoMTgwIC8gTWF0aC5QSSkpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnYXRhbic6XHJcbiAgICAgICAgICAgICAgc29sdmVkID0gKE1hdGguYXRhbihyaWdodCkgKiAoMTgwIC8gTWF0aC5QSSkpO1xyXG4gICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICByZXR1cm4gbnVsbDsgXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHR5cGVvZiBzb2x2ZWQgPT09ICdudW1iZXInID8gTWF0aC5yb3VuZChzb2x2ZWQgKiAxMDAwMDApIC8gMTAwMDAwIDogc29sdmVkO1xyXG4gIH1cclxuICBcclxuICBmdW5jdGlvbiBjb250cm9sbGVyKG1hdGgpIHtcclxuICAgICAgXHJcbiAgICBhZGRtYXRoSW5mbyhgJHttYXRofVxcbmApO1xyXG4gIFxyXG4gICAgICBsZXQgdG9rZW5zQXJyPXRva2VuaXplKG1hdGgpO1xyXG4gICAgICBsZXQgdG9rZW5zID0gdG9rZW5zQXJyLnRva2VuczsgXHJcbiAgICAgIGFkZERlYnVnSW5mbygndG9rZW5zJyx0b2tlbnMpXHJcbiAgICAgIG1hdGg9dG9rZW5zQXJyLm1hdGg7XHJcbiAgICAgIFxyXG4gICAgICBsZXQgZXhwcmVzc2lvbiA9IHBvc2l0aW9uKHRva2Vucyk7IFxyXG4gICAgICBhZGREZWJ1Z0luZm8oJ2V4cHJlc3Npb24nLGV4cHJlc3Npb24pXHJcbiAgICAgIGlmIChleHByZXNzaW9uID09PSBudWxsICYmICEodG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gJ29wZXJhdG9yJyAmJiB0b2tlbi52YWx1ZSAhPT0gJz0nKSkmJiB0b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi50eXBlID09PSAndmFyaWFibGUnKSkgXHJcbiAgICAgIHtcclxuICAgICAgICAgIHJldHVybiBtYXRoO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2UgaWYgKGV4cHJlc3Npb24gPT09IG51bGwpe1xyXG4gICAgICAgICAgcmV0dXJuIE1hdGgucm91bmQocGFyc2VGbG9hdChtYXRoKSAqIDEwMDAwKSAvIDEwMDAwO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBsZXQgc29sdmVkID0gcGFyc2VcclxuICAgICAgKFxyXG4gICAgICAgICAgZXhwcmVzc2lvbi5vcGVyYXRvciwgIFxyXG4gICAgICAgICAgZXhwcmVzc2lvbi5sZWZ0ICE9PSBudWxsID8gZXhwcmVzc2lvbi5sZWZ0IDogbnVsbCxcclxuICAgICAgICAgIGV4cHJlc3Npb24ubGVmdFZhcmlhYmxlICE9PSBudWxsID8gZXhwcmVzc2lvbi5sZWZ0VmFyaWFibGUgOiBudWxsLCBcclxuICAgICAgICAgIGV4cHJlc3Npb24ucmlnaHQgIT09IG51bGwgP2V4cHJlc3Npb24ucmlnaHQgOiBudWxsKVxyXG4gICAgICA7XHJcbiAgXHJcbiAgICAgIGFkZFNvbHV0aW9uSW5mbyhgJHtleHByZXNzaW9uLmxlZnR9ICR7ZXhwcmVzc2lvbi5vcGVyYXRvcn0gJHtleHByZXNzaW9uLnJpZ2h0fSAtPiAke3NvbHZlZH1cXG5gKVxyXG4gIFxyXG4gICAgICBpZiAoc29sdmVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICByZXR1cm4gbnVsbDsgIFxyXG4gICAgICB9XHJcbiAgICAgIGlmICh0eXBlb2Ygc29sdmVkPT09YHN0cmluZ2ApIHtcclxuICAgICAgICAgIHJldHVybiBzb2x2ZWQ7ICBcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgbGV0IGxlZnRQb3MgPXRva2Vuc1tleHByZXNzaW9uLmxlZnRCcmVha10uc3RhcnRQb3M7XHJcbiAgICAgIGxldCByaWdodFBvcyA9IHRva2Vuc1tleHByZXNzaW9uLnJpZ2h0QnJlYWstMV0uZW5kUG9zKzE7XHJcbiAgXHJcbiAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIGxlZnRQb3MpICsgc29sdmVkICsgbWF0aC5zbGljZShyaWdodFBvcyk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gbWF0aCE9PSd0cnVlJyYmbWF0aCE9PSdmYWxzZSc/Y29udHJvbGxlcihtYXRoKTptYXRoO1xyXG4gICAgfVxyXG4gICAgU29sdXRpb249Y29udHJvbGxlcihtYXRoKTtcclxuICAgIGlmIChFcnJvci5sZW5ndGggPiAwKSB7IHJldHVybiBFcnJvcjsgfSBcclxuICAgIGVsc2UgeyBcclxucmV0dXJuIHsgU29sdXRpb246IFNvbHV0aW9uLCBpbmZvOiBtYXRoSW5mbywgU29sdXRpb25JbmZvOiBTb2x1dGlvbkluZm8sIGRlYnVnSW5mbzpkZWJ1Z0luZm99O31cclxufSJdfQ==