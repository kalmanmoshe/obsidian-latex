export function controller(mathExpression) {
    let Error = [];
    let debugInfo = '', mathInfo = '', solutionInfo = '';
    let mathPattern = []; // "Big tokens" These will be implemented. in replacement?
    let replacementCell = ''; //Remember replacement cell strategy
    //let latex= await tp.system.clipboard();
    let latex = String.raw `2 \frac{(5-3)34}{\sqrt{2^{2}}}0.5`;
    //const latex = String.raw`1-0.00887*0.455^{4}(1-0.455)^{2}-0.19095*0.455^{4}(1-0.455)^{2}`;
    function addDebugInfo(msg, value) {
        debugInfo += (typeof msg === "object" ? JSON.stringify(msg) : msg) + ` : ` + (typeof value === "object" ? JSON.stringify(value) : value) + `\n `;
    }
    function addmathInfo(value) {
        mathInfo += value;
    }
    function addSolutionInfo(value) {
        solutionInfo += value;
    }
    let math = `${mathExpression}`
        .replace(/(\s|_\{[\w]*\})/g, "")
        .replace(/{/g, "(")
        .replace(/}/g, ")")
        .replace(/(\\cdot|cdot)/g, "*")
        .replace(/Math./g, "\\")
        .replace(/(?<!\\|[a-zA-Z])(tan|sin|cos|binom|frac|asin|acos|atan|arccos|arcsin|arctan|cdot)/g, "\\$1");
    let tokens = [];
    let brackets = 0, unmatched = 0, levelCount = {};
    for (let i = 0; i < math.length; i++) {
        let number = 0, startPos = i, vari = '';
        if (/[+-]/.test(math[i]) || i + math.slice(i).search(/[0-9.]+([a-zA-Z])/) === i) {
            continue;
        }
        if (math[i] === '(') {
            if (tokens.length - 1 > 0 && /(number|variable)/.test(tokens[tokens.length - 1].type)) {
                math = math.slice(0, i) + '*' + math.slice(i);
                i--;
                continue;
            }
            if (!levelCount[brackets]) {
                levelCount[brackets] = 0;
            }
            let ID = levelCount[brackets]++;
            tokens.push({ type: 'paren', value: '(', id: brackets + '.' + ID, index: tokens.length });
            brackets++;
            continue;
        }
        if (math[i] === ')') {
            brackets--;
            if (brackets < 0) {
                Error.push(`Error: Unmatched closing bracket at position ` + i);
                brackets = 0;
            }
            let ID = levelCount[brackets] - 1;
            tokens.push({ type: 'paren', value: ')', id: brackets + '.' + (ID >= 0 ? ID : 0), index: tokens.length });
            if ((math[i + 1] === '(' && !/(frac|binom)/.test(tokens[tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id) - 1].value)) || (math[i + 1] && /[0-9A-Za-z.]/.test(math[i + 1]))) {
                i++;
                math = math.slice(0, i) + '*' + math.slice(i);
                i--;
            }
            continue;
        }
        if (/[\*\/^=]/.test(math[i])) {
            tokens.push({ type: 'operator', value: math[i], index: tokens.length ? tokens.length : 0 });
            continue;
        }
        if (math[i] === '\\') {
            if (tokens.length > 0 && /(number)/.test(tokens[tokens.length - 1].type)) {
                math = math.slice(0, i) + '*' + math.slice(i);
                i--;
                continue;
            }
            i += 1;
            let operator = (math.slice(i).match(/[a-zA-Z]+/) || [""])[0];
            tokens.push({ type: 'operator', value: operator, index: tokens.length });
            i += operator.length;
            if (tokens[tokens.length - 1].value === 'sqrt' && math[i] === '[' && i < math.length - 2) {
                let temp = math.slice(i, i + 1 + math.slice(i).search(/[\]]/));
                i += temp.length;
                Object.assign(tokens[tokens.length - 1], { specialChar: safeToNumber(temp), });
            }
            i--;
            continue;
        }
        if (i + math.slice(i).search(/[0-9.]+(?![a-zA-Z])/) === i) {
            number = (math.slice(i).match(/[0-9.]+(?![a-zA-Z])/) || 0)[0];
            i += number.length > 1 ? number.length - 1 : 0;
            if (/[+-]/.test(math[startPos - 1])) {
                number = math[startPos - 1] + number;
            }
            if (math[i + 1] && /[a-zA-Z]/.test(math[i + 1])) {
                continue;
            }
            if (1 === 2 && math[startPos - 1] === ')') {
                math = math.slice(0, startPos) + '*' + math.slice(startPos);
                i++;
            }
            tokens.push({ type: 'number', value: parseFloat(number), index: tokens.length ? tokens.length : 0 });
            continue;
        }
        if (/[a-zA-Z]/.test(math[i])) {
            vari = (math.slice(i).match(/[a-zA-Z]+/) || [""])[0];
            if (vari && vari.length === 0) {
                vari = math.slice(i, math.length);
            }
            number = math.slice(i + vari.length, vari.length + i + math.slice(i + vari.length).search(/[^0-9]/));
            i += vari.length + number.length - 1;
            number = safeToNumber(number.length > 0 ? number : 1);
            if (/[0-9]/.test(math[startPos > 0 ? startPos - 1 : 0]) && tokens) {
                number = (math.slice(0, startPos).match(/[0-9]+(?=[^0-9]*$)/) || [""])[0];
                number = math[startPos - number.length - 1] && math[startPos - number.length - 1] === '-' ? '-' + number : number;
            }
            else if (/[-]/.test(math[startPos - 1])) {
                number = math[startPos - 1] + number;
            }
            tokens.push({ type: 'variable', variable: vari, value: safeToNumber(number), index: tokens.length });
            continue;
        }
        Error.push(`Unknown char "${math[i]}"`);
    }
    if (brackets !== 0) {
        Error.push(`Error: Unmatched opening bracket(s)`);
    }
    addDebugInfo('Tokens after tokenize', tokens);
    function safeToNumber(value) {
        if (!typeof value === `tring`) {
            return value;
        }
        if (value === '+') {
            return 0;
        }
        if (value === '-') {
            return -1;
        }
        if (/[a-zA-Z]/.test(value)) {
            return 1;
        }
        if (/[\(\[]/.test(value[0])) {
            value = value.slice(1);
        }
        if (/[\)\]]/.test(value[value.length - 1])) {
            value = value.slice(0, value.length - 1);
        }
        for (let i = 0; i > 0; i++) {
            if (typeof value[i] === 'string' && /[\(\)\[\]]/.test(value[i])) {
                value = value.slice(0, i) + value.slice(i + 1);
                i--;
            }
        }
        const num = Number(value);
        return isNaN(num) ? value.length > 0 ? value : 0 : num;
    }
    function intID(partID, int) {
        let [baseID, subID = 0] = partID.split('.').map(Number);
        let [baseIN, subIN = 0] = String(int).split('.').map(Number);
        return `${baseID + baseIN}.${subID + subIN}`;
    }
    function operationsOrder(tokens) {
        var _a;
        function findOperatorIndex(begin, end, tokens, regex) {
            while (begin < end && begin < tokens.length) {
                let index;
                if (regex) {
                    index = tokens.slice(begin, end).findIndex(token => token.type === 'operator' && regex.test(token.value));
                }
                else {
                    index = tokens.slice(begin, end).findIndex(token => token.type === 'operator');
                }
                if (index === -1)
                    return -1;
                index += begin;
                if (!/[+-]/.test(tokens[index].value)) {
                    return index;
                }
                if (index > 0 && index < tokens.length - 1) {
                    if (tokens[index - 1].type === tokens[index + 1].type) {
                        return index;
                    }
                }
                begin = index + 1;
            }
            return -1;
        }
        let begin = 0, end = tokens.length;
        let currentID = null;
        let checkedIDs = [];
        let operatorFound = false;
        let temp = tokens.findIndex(token => token.type === 'operator' && token.value === '/');
        if (temp >= 0) {
            return temp;
        }
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
            operatorFound = findOperatorIndex(begin, end, tokens) !== -1;
            // If no operator is found, mark this parentheses pair as checked
            if (!operatorFound) {
                checkedIDs.push(currentID);
                currentID = null;
            }
        }
        tokenSlice = tokens.slice(begin, end);
        // Find indices based on operator precedence
        let priority1 = findOperatorIndex(begin, end, tokens, /(\^|sqrt)/);
        let priority2 = findOperatorIndex(begin, end, tokens, /(frac|binom|sin|cos|tan|asin|acos|atan)/);
        let priority3 = findOperatorIndex(begin, end, tokens, /(\*|\/)/);
        let priority4 = findOperatorIndex(begin, end, tokens, /[+-]/);
        let priority5 = findOperatorIndex(begin, end, tokens, /=/);
        return (_a = [priority1, priority2, priority3, priority4, priority5].find(index => index !== -1)) !== null && _a !== void 0 ? _a : null;
    }
    function parseLeft(tokens, index) {
        let breakChar = 0, left = '', char;
        for (let i = index - 1; i >= 0; i--) {
            if (tokens[index - 1].type === 'paren') {
                if (i !== index - 2 && tokens[i + 1].type === 'paren' && tokens[i + 1].id === tokens[index - 1].id) {
                    breakChar = i + 1;
                    break;
                }
            }
            else if (!char) {
                char = tokens[i].type;
            }
            else if (tokens[i].type !== char) {
                breakChar = i + 1;
                break;
            }
        }
        left = tokens.slice(breakChar, index).filter(item => item.type === "number" || item.type === "variable" || item.type === "powerVariable");
        if (left.length === 0) {
            return null;
        }
        return {
            variable: left[0].variable,
            value: safeToNumber(left[0].value),
            pow: left[0].pow,
            multiStep: tokens[index - 1].type === 'paren' && left.length > 1,
            breakChar: left.length > 1 || tokens[index - 1].type !== 'paren' ? left[left.length - 1].index : breakChar,
        };
    }
    function parseRight(tokens, index) {
        let breakChar = tokens.length, right, char;
        if (index === breakChar - 1) {
            return null;
        }
        for (let i = index + 1; i < tokens.length; i++) {
            if (tokens[index + 1].type === 'paren') {
                if (i !== index + 2 && tokens[i - 1].type === 'paren' && tokens[i - 1].id === tokens[index + 1].id) {
                    breakChar = i;
                    break;
                }
            }
            else if (!char) {
                char = tokens[i].type;
            }
            else if (tokens[i].type !== char) {
                breakChar = i;
                break;
            }
        }
        right = tokens.slice(index, breakChar).filter(item => item.type === "number" || item.type === "variable" || item.type === "powerVariable");
        if (right.length === 0) {
            return null;
        }
        return {
            variable: right[0].variable,
            value: safeToNumber(right[0].value),
            pow: right[0].pow,
            multiStep: tokens[index + 1].type === 'paren' && right.length > 1,
            breakChar: right.length > 1 ? right[0].index : breakChar,
        };
    }
    function position(tokens) {
        let index = operationsOrder(tokens), leftObj, rightObj;
        if (index === null) {
            return null;
        }
        switch (tokens[index].value) {
            case '^':
            case '+':
            case '-':
            case '*':
            case '/':
            case '=':
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
            case 'arcsin':
            case 'arccos':
            case 'arctan':
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
            index: index,
            specialChar: tokens[index].specialChar ? tokens[index].specialChar : null,
            left: leftObj ? leftObj.value : null,
            leftVariable: leftObj ? leftObj.variable : null,
            leftPow: leftObj ? leftObj.pow : null,
            leftMultiStep: leftObj ? leftObj.multiStep : null,
            leftBreak: leftObj ? leftObj.breakChar : index,
            right: rightObj ? rightObj.value : null,
            rightVariable: rightObj ? rightObj.variable : null,
            rightPow: rightObj ? rightObj.pow : null,
            rightMultiStep: rightObj ? rightObj.multiStep : null,
            rightBreak: rightObj ? rightObj.breakChar : tokens.length,
        };
    }
    function parse(operator, specialChar, left, leftVar, right, rightVar, rightPow) {
        if (!left && !/(sqrt|cos|sin|tan)/.test(operator)) {
            Error.push(`Error: Left side of ` + operator + ` must have a value`);
            return null;
        }
        if (!right) {
            Error.push(`Error: Right side of ` + operator + ` must have a value`);
            return null;
        }
        let solved = { value: 0, variable: '', pow: '' };
        switch (operator) {
            case 'sqrt':
                solved.value = Math.pow(right, specialChar !== null ? (1) / (specialChar) : 0.5);
                break;
            case '^':
                solved.value = Math.pow(left, right);
                break;
            case 'frac':
            case '/':
                solved.value = (left) / (right);
                break;
            case '*':
                solved.value = left * right;
                if (leftVar && !rightVar) {
                    solved.variable = leftVar;
                }
                else if (!leftVar && rightVar) {
                    solved.variable = rightVar;
                }
                else if (leftVar && rightVar) {
                    solved.variable = rightVar;
                    solved.pow = 2;
                }
                break;
            case '+':
                solved.value = left + right;
                solved.variable = leftVar ? leftVar : rightVar;
                break;
            case '-':
                solved.value = left - right;
                solved.variable = leftVar ? leftVar : rightVar;
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
                solved.value = res;
                break;
            case '=':
                solved.value = left === right;
                break;
            case 'sin':
                solved.value = (Math.sin(right * Math.PI / 180));
                break;
            case 'cos':
                solved.value = (Math.cos(right * Math.PI / 180));
                break;
            case 'tan':
                if (right >= 90) {
                    Error.push('tan Must be smaller than 90');
                }
                solved.value = (Math.tan(right * Math.PI / 180));
                break;
            case 'asin':
            case 'arcsin':
                solved.value = (Math.asin(right) * (180 / Math.PI));
                break;
            case 'acos':
            case 'arccos':
                solved.value = (Math.acos(right) * (180 / Math.PI));
                break;
            case 'atan':
            case 'arctan':
                solved.value = (Math.atan(right) * (180 / Math.PI));
                break;
            default:
                return null;
        }
        //addDebugInfo(solved.value,solved.variable)
        return {
            type: solved.pow ? 'powerVariable' : solved.variable ? 'variable' : 'number',
            value: typeof solved.value === 'number' ? Math.round(solved.value * 100000) / 100000 : solved.value,
            variable: solved.variable ? solved.variable : '',
            pow: solved.pow ? solved.pow : '',
        };
    }
    function controller(tokens) {
        tokens = connect(tokens);
        tokens = reorder(tokens);
        math = reconstruct(tokens);
        addDebugInfo('//math', math);
        addmathInfo(`${math}\n`);
        if (Array.isArray(tokens)
            && tokens.some(token => token.type === 'variable')
            && !tokens.some(token => token.value === '=')) {
            return Infinity;
        }
        //return tokens;
        let expression = position(tokens);
        addDebugInfo('Parsed expression', JSON.stringify(expression, null, 0.01));
        //if (expression !== null && !(tokens.some(token => token.type === 'operator' && token.value !== '='))&& tokens.some(token => token.type === 'variable')) {return math;}
        if (expression === null) {
            return Math.round(parseFloat(math) * 10000) / 10000;
        }
        const readyForFinalPraising = tokens.every(token => !/(operator)/.test(token.type) || /(=)/.test(token.value));
        const allNumbers = tokens.every(token => /(number)/.test(token.type) || /(=)/.test(token.value));
        if ((readyForFinalPraising && !allNumbers)) {
            tokens = simplifiy(tokens);
            addDebugInfo(`simplifiy(tokens)`, tokens);
            const numberIndex = (tokens.filter(item => item.type === "number"))[0];
            const variableIndex = (tokens.filter(item => item.type === "variable"))[0];
            const powIndex = tokens.filter(item => item.type === "powerVariable");
            if (powIndex.length === 1 && powIndex[0].pow === 2) {
                return quad(variableIndex.value, numberIndex.value, powIndex[0].value * -1);
            }
            else if (tokens.some(token => token.type !== 'powerVariable')) {
                return `${variableIndex.variable} = ${(numberIndex.value) / (variableIndex.value)}`;
            }
        }
        let leftPos = expression.leftBreak;
        let rightPos = expression.rightBreak;
        let solved = parse(expression.operator, expression.specialChar, expression.left, expression.leftVariable, expression.right, expression.rightVariable, expression.rightPow);
        if (solved === null) {
            return null;
        }
        if (typeof solved === `string`) {
            return solved;
        }
        //addDebugInfo('solved', `${expression.left+ (expression.leftVariable ? expression.leftVariable : '')} ${expression.operator} ${expression.right+(expression.rightVariable ? expression.rightVariable : '')} --> ${solved.value+solved.variable+(solved.pow?`^(${solved.pow})`:'')}`)
        addSolutionInfo(`${expression.left + (expression.leftVariable ? expression.leftVariable : '')} ${expression.operator} ${expression.right + (expression.rightVariable ? expression.rightVariable : '')} --> ${solved.value + solved.variable + (solved.pow ? `^(${solved.pow})` : '')}\n`);
        if (expression.rightMultiStep && !expression.leftMultiStep) {
            tokens.splice(rightPos, 1);
            tokens.splice(0, 0, solved);
        }
        else if (1 === 2 && expression.rightMultiStep && !expression.leftMultiStep) {
        }
        else {
            tokens.splice(leftPos, rightPos - leftPos, solved);
        }
        return tokens.length > 1 ? controller(tokens) : reconstruct(tokens);
    }
    function reconstruct(tokens) {
        let math = '';
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].value === '(' && tokens[tokens.findLastIndex((token, index) => token.id === tokens[i].id && tokens[index + 1]) + 1].value === '/') {
                math += '\\frac';
            }
            switch (tokens[i].type) {
                case 'number':
                    math += tokens[i].value;
                    break;
                case 'paren':
                    let temp = tokens[tokens.findIndex(token => token.id === tokens[i].id) - 1];
                    //addDebugInfo(temp,/(frac|sqrt|\^)/.test(temp.value))
                    if ((temp && /(frac|sqrt|\^|\/)/.test(temp.value) || !temp)) {
                        math += tokens[i].value.replace(/\(/, '\{').replace(/\)/, '\}');
                        break;
                    }
                    else if (/\)/.test(temp.value) && /(frac|sqrt|\^|\/)/.test(tokens[tokens.findIndex(token => token.id === temp.id) - 1].value)) {
                        math += tokens[i].value.replace(/\(/, '\{').replace(/\)/, '\}');
                        break;
                    }
                    math += tokens[i].value;
                    break;
                case 'operator':
                    math += (tokens[i].value).replace(/([^\*\^=\/])/, "\\$1").replace(/\*/g, `\\cdot `);
                    break;
                case 'variable':
                    math += (tokens[i].value < 0 ? '-' : tokens[i - 1] && /(number|variable|powerVariable)/.test(tokens[i - 1].type) ? '+' : '') + tokens[i].value + tokens[i].variable;
                    break;
                case 'powerVariable':
                    math += (tokens[i].value < 0 ? '-' : tokens[i - 1] && /(number|variable|powerVariable)/.test(tokens[i - 1].type) ? '+' : '') + tokens[i].value + tokens[i].variable + `^{${tokens[i].pow}}`;
                    break;
                default:
                    continue;
            }
        }
        return math;
    }
    function reorder(tokens) {
        for (let i = 0; i < tokens.length; i++) {
            tokens[i].index = i;
        }
        return tokens;
    }
    function connect(tokens) {
        let i = 0, moreConnectedTokens = true;
        while (i < 100 && moreConnectedTokens) {
            i++;
            let index = tokens.findIndex((token, index) => {
                var _a, _b, _c;
                return (!tokens[index + 2] || !/(cdot|\*)/.test(tokens[index + 2].value))
                    && ((token.type === 'number' && token.type === ((_a = tokens[index + 1]) === null || _a === void 0 ? void 0 : _a.type))
                        || (token.type === 'variable' && token.type === ((_b = tokens[index + 1]) === null || _b === void 0 ? void 0 : _b.type) && token.variable === ((_c = tokens[index + 1]) === null || _c === void 0 ? void 0 : _c.variable)));
            });
            if (index === -1) {
                break;
            }
            tokens[index].value += tokens[index + 1].value;
            tokens.splice(index + 1, 1);
        }
        return tokens;
    }
    function simplifiy(tokens) {
        let i = 0, newTokens = [];
        while (i <= 100 && tokens.some(token => (/(number|variable|powerVariable)/).test(token.type))) {
            i++;
            let eqindex = tokens.findIndex(token => token.value === '=');
            let OperationIndex = tokens.findIndex((token) => (/(number|variable|powerVariable)/).test(token.type));
            if (OperationIndex === -1) {
                addDebugInfo(i);
                return tokens;
            }
            let currentToken = { type: tokens[OperationIndex].type, value: tokens[OperationIndex].value, variable: tokens[OperationIndex].variable, pow: tokens[OperationIndex].pow };
            let numberGroup = tokens
                .map((token, i) => ({ token, originalIndex: i }))
                .filter(item => item.token.type === currentToken.type)
                .reduce((sum, item) => {
                let multiplier = (tokens[item.originalIndex - 1] && tokens[item.originalIndex - 1].value === '-') ? -1 : 1;
                multiplier *= (item.originalIndex <= eqindex) ? -1 : 1;
                if (!(/(number)/).test(item.token.type)) {
                    multiplier *= -1;
                }
                return sum + (item.token.value * multiplier);
            }, 0);
            newTokens.push({
                type: currentToken.type,
                value: numberGroup,
                variable: currentToken.variable,
                pow: currentToken.pow,
            });
            tokens = tokens.filter(token => {
                return !(token.type === tokens[OperationIndex].type &&
                    (!token.variable || token.variable === currentToken.variable) &&
                    (!token.pow || token.pow === currentToken.pow));
            });
        }
        return newTokens;
    }
    function quad(a, b, c) {
        let x1 = (b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
        let x2 = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
        return `x1 = ${x1.toFixed(3)}, x2 = ${x2.toFixed(3)}`;
    }
    solution = controller(tokens);
    if (Error.length > 0) {
        return Error;
    }
    else {
        return { solution: solution, info: mathInfo, solutionInfo: solutionInfo, debugInfo: debugInfo };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21hdGhFbmdpbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxVQUFVLFVBQVUsQ0FBQyxjQUFjO0lBQ3JDLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztJQUNmLElBQUksU0FBUyxHQUFHLEVBQUUsRUFBRSxRQUFRLEdBQUcsRUFBRSxFQUFFLFlBQVksR0FBQyxFQUFFLENBQUM7SUFDbkQsSUFBSSxXQUFXLEdBQUMsRUFBRSxDQUFBLENBQUEsMERBQTBEO0lBQzVFLElBQUksZUFBZSxHQUFDLEVBQUUsQ0FBQyxDQUFDLG9DQUFvQztJQUM1RCx5Q0FBeUM7SUFDekMsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQSxtQ0FBbUMsQ0FBQztJQUMxRCw0RkFBNEY7SUFFNUYsU0FBUyxZQUFZLENBQUMsR0FBRyxFQUFFLEtBQUs7UUFDNUIsU0FBUyxJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUcsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQSxHQUFHLENBQUMsR0FBQyxLQUFLLEdBQUMsQ0FBQyxPQUFPLEtBQUssS0FBRyxRQUFRLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQyxHQUFFLEtBQUssQ0FBQztJQUNwSSxDQUFDO0lBQ0QsU0FBUyxXQUFXLENBQUMsS0FBSztRQUN0QixRQUFRLElBQUksS0FBSyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxTQUFTLGVBQWUsQ0FBQyxLQUFLO1FBQzVCLFlBQVksSUFBSSxLQUFLLENBQUM7SUFDMUIsQ0FBQztJQUVELElBQUksSUFBSSxHQUFHLEdBQUcsY0FBYyxFQUFFO1NBQzdCLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUM7U0FDL0IsT0FBTyxDQUFDLElB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S0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxLQUFHLENBQUMsRUFDckQ7WUFDSSxNQUFNLEdBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBRXpELENBQUMsSUFBRSxNQUFNLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQSxDQUFDLENBQUEsTUFBTSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFBLENBQUMsQ0FBQztZQUNyQyxJQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDO2dCQUFDLE1BQU0sR0FBQyxJQUFJLENBQUMsUUFBUSxHQUFDLENBQUMsQ0FBQyxHQUFDLE1BQU0sQ0FBQTthQUFDO1lBR2pFLElBQUksSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQztnQkFBQyxTQUFTO2FBQUM7WUFDckQsSUFBSSxDQUFDLEtBQUcsQ0FBQyxJQUFFLElBQUksQ0FBQyxRQUFRLEdBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFO2dCQUVqQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzVELENBQUMsRUFBRSxDQUFDO2FBQ1A7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFBLENBQUMsQ0FBQSxNQUFNLENBQUMsTUFBTSxDQUFBLENBQUMs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QztRQUNsRCxPQUFPLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDMUQsQ0FBQztJQUNHLFFBQVEsR0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFNUIsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFDcEI7UUFDSSxPQUFPLEtBQUssQ0FBQTtLQUNmO1NBQ0k7UUFDRCxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFDLFNBQVMsRUFBQyxDQUFDO0tBQ2pHO0FBQ1QsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBmdW5jdGlvbiBjb250cm9sbGVyKG1hdGhFeHByZXNzaW9uKSB7XHJcbiAgICBsZXQgRXJyb3IgPSBbXTtcclxuICAgIGxldCBkZWJ1Z0luZm8gPSAnJywgbWF0aEluZm8gPSAnJywgc29sdXRpb25JbmZvPScnOyBcclxuICAgIGxldCBtYXRoUGF0dGVybj1bXS8vIFwiQmlnIHRva2Vuc1wiIFRoZXNlIHdpbGwgYmUgaW1wbGVtZW50ZWQuIGluIHJlcGxhY2VtZW50P1xyXG4gICAgbGV0IHJlcGxhY2VtZW50Q2VsbD0nJzsgLy9SZW1lbWJlciByZXBsYWNlbWVudCBjZWxsIHN0cmF0ZWd5XHJcbiAgICAvL2xldCBsYXRleD0gYXdhaXQgdHAuc3lzdGVtLmNsaXBib2FyZCgpO1xyXG4gICAgbGV0IGxhdGV4ID0gU3RyaW5nLnJhd2AyIFxcZnJhY3soNS0zKTM0fXtcXHNxcnR7Ml57Mn19fTAuNWA7XHJcbiAgICAvL2NvbnN0IGxhdGV4ID0gU3RyaW5nLnJhd2AxLTAuMDA4ODcqMC40NTVeezR9KDEtMC40NTUpXnsyfS0wLjE5MDk1KjAuNDU1Xns0fSgxLTAuNDU1KV57Mn1gO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhZGREZWJ1Z0luZm8obXNnLCB2YWx1ZSkge1xyXG4gICAgICAgIGRlYnVnSW5mbyArPSAodHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK2AgOiBgKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlKTp2YWx1ZSkrIGBcXG4gYDtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIGFkZG1hdGhJbmZvKHZhbHVlKSB7XHJcbiAgICAgICAgbWF0aEluZm8gKz0gdmFsdWU7XHJcbiAgICAgIH1cclxuICAgICAgZnVuY3Rpb24gYWRkU29sdXRpb25JbmZvKHZhbHVlKSB7XHJcbiAgICAgICAgc29sdXRpb25JbmZvICs9IHZhbHVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsZXQgbWF0aCA9IGAke21hdGhFeHByZXNzaW9ufWBcclxuICAgIC5yZXBsYWNlKC8oXFxzfF9cXHtbXFx3XSpcXH0pL2csIFwiXCIpIFxyXG4gICAgLnJlcGxhY2UoL3svZywgXCIoXCIpIFxyXG4gICAgLnJlcGxhY2UoL30vZywgXCIpXCIpXHJcbiAgICAucmVwbGFjZSgvKFxcXFxjZG90fGNkb3QpL2csIFwiKlwiKVxyXG4gICAgLnJlcGxhY2UoL01hdGguL2csIFwiXFxcXFwiKVxyXG4gICAgLnJlcGxhY2UoLyg/PCFcXFxcfFthLXpBLVpdKSh0YW58c2lufGNvc3xiaW5vbXxmcmFjfGFzaW58YWNvc3xhdGFufGFyY2Nvc3xhcmNzaW58YXJjdGFufGNkb3QpL2csIFwiXFxcXCQxXCIpO1xyXG4gICAgXHJcbiAgICBcclxuICAgIGxldCB0b2tlbnMgPSBbXTtcclxuICAgIGxldCBicmFja2V0cyA9IDAsIHVubWF0Y2hlZCA9IDAsIGxldmVsQ291bnQgPSB7fTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGxldCBudW1iZXI9MCwgIHN0YXJ0UG9zID0gaSx2YXJpPScnO1xyXG4gICAgICAgIGlmICgvWystXS8udGVzdChtYXRoW2ldKXx8aSttYXRoLnNsaWNlKGkpLnNlYXJjaCgvWzAtOS5dKyhbYS16QS1aXSkvKT09PWkpe2NvbnRpbnVlO31cclxuICAgICAgICBcclxuICAgICAgICBpZiAobWF0aFtpXSA9PT0gJygnKSB7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnMubGVuZ3RoLTE+MCYmLyhudW1iZXJ8dmFyaWFibGUpLy50ZXN0KHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLnR5cGUpKSB7XHJcbiAgICAgICAgICAgICAgICBtYXRoID0gbWF0aC5zbGljZSgwLCBpKSArICcqJyArIG1hdGguc2xpY2UoaSk7XHJcbiAgICAgICAgICAgICAgICBpLS07IGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICghbGV2ZWxDb3VudFticmFja2V0c10pIHtcclxuICAgICAgICAgICAgICAgIGxldmVsQ291bnRbYnJhY2tldHNdID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSsrO1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6ICdwYXJlbicsIHZhbHVlOiAnKCcsIGlkOiBicmFja2V0cyArICcuJyArIElELCBpbmRleDogdG9rZW5zLmxlbmd0aCB9KTtcclxuICAgICAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChtYXRoW2ldID09PSAnKScpIHtcclxuICAgICAgICAgICAgYnJhY2tldHMtLTsgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYnJhY2tldHMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICBFcnJvci5wdXNoKGBFcnJvcjogVW5tYXRjaGVkIGNsb3NpbmcgYnJhY2tldCBhdCBwb3NpdGlvbiBgICsgaSk7XHJcbiAgICAgICAgICAgICAgICBicmFja2V0cyA9IDA7IFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdIC0gMTtcclxuICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAncGFyZW4nLCB2YWx1ZTogJyknLCBpZDogYnJhY2tldHMgKyAnLicgKyAoSUQgPj0gMCA/IElEIDogMCksIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKChtYXRoW2krMV0gPT09ICcoJyYmIS8oZnJhY3xiaW5vbSkvLnRlc3QodG9rZW5zW3Rva2Vucy5tYXAodG9rZW4gPT4gdG9rZW4uaWQpLmluZGV4T2YodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5pZCktMV0udmFsdWUpKXx8KG1hdGhbaSsxXSYmL1swLTlBLVphLXouXS8udGVzdChtYXRoW2krMV0pKSkge1xyXG4gICAgICAgICAgICBpKys7XHJcbiAgICAgICAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIGkpICsgJyonICsgbWF0aC5zbGljZShpKTtcclxuICAgICAgICAgICAgaS0tOyBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKC9bXFwqXFwvXj1dLy50ZXN0KG1hdGhbaV0pKSB7XHJcbiAgICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogJ29wZXJhdG9yJywgdmFsdWU6IG1hdGhbaV0sIGluZGV4OiB0b2tlbnMubGVuZ3RoP3Rva2Vucy5sZW5ndGg6MCB9KTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChtYXRoW2ldID09PSAnXFxcXCcpIHsgIFxyXG4gICAgICAgICAgICBpZiAodG9rZW5zLmxlbmd0aD4wJiYvKG51bWJlcikvLnRlc3QodG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0udHlwZSkpIHtcclxuICAgICAgICAgICAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIGkpICsgJyonICsgbWF0aC5zbGljZShpKTtcclxuICAgICAgICAgICAgICAgIGktLTsgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaSs9MTsgIFxyXG4gICAgICAgICAgICBsZXQgb3BlcmF0b3IgPSAobWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rLykgfHwgW1wiXCJdKVswXVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAnb3BlcmF0b3InLCB2YWx1ZTogb3BlcmF0b3IsIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xyXG4gICAgICAgICAgICBpKz1vcGVyYXRvci5sZW5ndGg7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnZhbHVlID09PSAnc3FydCcgJiYgbWF0aFtpXSA9PT0gJ1snICYmIGkgPCBtYXRoLmxlbmd0aCAtIDIpIHtcclxuICAgICAgICAgICAgICAgIGxldCB0ZW1wPW1hdGguc2xpY2UoaSxpKzErbWF0aC5zbGljZShpKS5zZWFyY2goL1tcXF1dLykpO1xyXG4gICAgICAgICAgICAgICAgaSs9dGVtcC5sZW5ndGhcclxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odG9rZW5zW3Rva2Vucy5sZW5ndGgtMV0se3NwZWNpYWxDaGFyOiBzYWZlVG9OdW1iZXIodGVtcCksfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpLS07XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIGlmIChpK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bMC05Ll0rKD8hW2EtekEtWl0pLyk9PT1pKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbnVtYmVyPShtYXRoLnNsaWNlKGkpLm1hdGNoKC9bMC05Ll0rKD8hW2EtekEtWl0pLyl8fDApWzBdXHJcbiAgICBcclxuICAgICAgICAgICAgaSs9bnVtYmVyLmxlbmd0aD4xP251bWJlci5sZW5ndGgtMTowO1xyXG4gICAgICAgICAgICBpZigvWystXS8udGVzdChtYXRoW3N0YXJ0UG9zLTFdKSl7bnVtYmVyPW1hdGhbc3RhcnRQb3MtMV0rbnVtYmVyfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtYXRoW2krMV0mJi9bYS16QS1aXS8udGVzdChtYXRoW2krMV0pKXtjb250aW51ZTt9XHJcbiAgICAgICAgICAgIGlmICgxPT09MiYmbWF0aFtzdGFydFBvcy0xXSA9PT0gJyknKSB7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIHN0YXJ0UG9zKSArICcqJyArIG1hdGguc2xpY2Uoc3RhcnRQb3MpOyAgXHJcbiAgICAgICAgICAgICAgICBpKys7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAnbnVtYmVyJywgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKSwgaW5kZXg6IHRva2Vucy5sZW5ndGg/dG9rZW5zLmxlbmd0aDowIH0pO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKC9bYS16QS1aXS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgICAgICB2YXJpPSAobWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rLykgfHwgW1wiXCJdKVswXTtcclxuICAgICAgICAgICAgaWYgKHZhcmkmJnZhcmkubGVuZ3RoPT09MCl7dmFyaT1tYXRoLnNsaWNlKGksbWF0aC5sZW5ndGgpfVxyXG4gICAgICAgICAgICBudW1iZXI9bWF0aC5zbGljZShpK3ZhcmkubGVuZ3RoLHZhcmkubGVuZ3RoK2krbWF0aC5zbGljZShpK3ZhcmkubGVuZ3RoKS5zZWFyY2goL1teMC05XS8pKVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaSs9dmFyaS5sZW5ndGgrbnVtYmVyLmxlbmd0aC0xO1xyXG4gICAgICAgICAgICBudW1iZXI9c2FmZVRvTnVtYmVyKG51bWJlci5sZW5ndGg+MD9udW1iZXI6MSk7XHJcbiAgICAgICAgICAgIGlmICgvWzAtOV0vLnRlc3QobWF0aFtzdGFydFBvcz4wP3N0YXJ0UG9zLTE6MF0pJiZ0b2tlbnMpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG51bWJlcj0obWF0aC5zbGljZSgwLHN0YXJ0UG9zKS5tYXRjaCgvWzAtOV0rKD89W14wLTldKiQpLyl8fCBbXCJcIl0pWzBdO1xyXG4gICAgICAgICAgICAgICAgbnVtYmVyPW1hdGhbc3RhcnRQb3MtbnVtYmVyLmxlbmd0aC0xXSYmbWF0aFtzdGFydFBvcy1udW1iZXIubGVuZ3RoLTFdPT09Jy0nPyctJytudW1iZXI6bnVtYmVyO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYoL1stXS8udGVzdChtYXRoW3N0YXJ0UG9zLTFdKSl7bnVtYmVyPW1hdGhbc3RhcnRQb3MtMV0rbnVtYmVyfVxyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7dHlwZTogJ3ZhcmlhYmxlJyx2YXJpYWJsZTogdmFyaSx2YWx1ZTogc2FmZVRvTnVtYmVyKG51bWJlciksIGluZGV4OiB0b2tlbnMubGVuZ3RofSk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBFcnJvci5wdXNoKGBVbmtub3duIGNoYXIgXCIke21hdGhbaV19XCJgKTtcclxuICAgIH1cclxuICAgICAgICBpZiAoYnJhY2tldHMhPT0wKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgRXJyb3IucHVzaChgRXJyb3I6IFVubWF0Y2hlZCBvcGVuaW5nIGJyYWNrZXQocylgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICBcclxuICAgIGFkZERlYnVnSW5mbygnVG9rZW5zIGFmdGVyIHRva2VuaXplJywgdG9rZW5zKTtcclxuICAgIGZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xyXG4gICAgICAgIGlmICghdHlwZW9mIHZhbHVlID09PSBgdHJpbmdgKXtyZXR1cm4gdmFsdWV9XHJcbiAgICAgICAgaWYgKHZhbHVlPT09JysnKXtyZXR1cm4gMH1cclxuICAgICAgICBpZiAodmFsdWU9PT0nLScpe3JldHVybiAtMX1cclxuICAgICAgICBpZiAoL1thLXpBLVpdLy50ZXN0KHZhbHVlKSl7cmV0dXJuIDF9XHJcbiAgICAgICAgaWYoL1tcXChcXFtdLy50ZXN0KHZhbHVlWzBdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgxKX1cclxuICAgICAgICBpZigvW1xcKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA+MDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWVbaV0gPT09ICdzdHJpbmcnICYmIC9bXFwoXFwpXFxbXFxdXS8udGVzdCh2YWx1ZVtpXSkpIHtcclxuICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XHJcbiAgICAgICAgICAgICAgICBpLS07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICBjb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bSkgPyB2YWx1ZS5sZW5ndGg+MD92YWx1ZTowIDogbnVtO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpbnRJRChwYXJ0SUQsIGludCkge1xyXG4gICAgICAgIGxldCBbYmFzZUlELCBzdWJJRCA9IDBdID0gcGFydElELnNwbGl0KCcuJykubWFwKE51bWJlcik7XHJcbiAgICAgICAgbGV0IFtiYXNlSU4sIHN1YklOID0gMF0gPSBTdHJpbmcoaW50KS5zcGxpdCgnLicpLm1hcChOdW1iZXIpO1xyXG4gICAgICAgIHJldHVybiBgJHtiYXNlSUQgKyBiYXNlSU59LiR7c3ViSUQgKyBzdWJJTn1gO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSB7XHJcbiAgICAgICAgZnVuY3Rpb24gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sIGVuZCwgdG9rZW5zLCByZWdleCkge1xyXG4gICAgICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgaW5kZXg7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChyZWdleCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ID0gdG9rZW5zLnNsaWNlKGJlZ2luLCBlbmQpLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi50eXBlID09PSAnb3BlcmF0b3InICYmIHJlZ2V4LnRlc3QodG9rZW4udmFsdWUpKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09ICdvcGVyYXRvcicpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIC0xO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaW5kZXggKz0gYmVnaW47XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoIS9bKy1dLy50ZXN0KHRva2Vuc1tpbmRleF0udmFsdWUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMCAmJiBpbmRleCA8IHRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJlZ2luID0gaW5kZXggKyAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiAtMTtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMubGVuZ3RoO1xyXG4gICAgICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgICAgbGV0IGNoZWNrZWRJRHMgPSBbXTsgIFxyXG4gICAgICAgIGxldCBvcGVyYXRvckZvdW5kID0gZmFsc2U7XHJcbiAgICAgICAgbGV0IHRlbXAgPSB0b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09ICdvcGVyYXRvcicgJiYgdG9rZW4udmFsdWUgPT09ICcvJyk7XHJcbiAgICAgICAgaWYgKHRlbXAgPj0gMCkge3JldHVybiB0ZW1wO31cclxuICAgICAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgICAgICB3aGlsZSAoIW9wZXJhdG9yRm91bmQpIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcoJyAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnNbaV0uaWQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudElEID0gdG9rZW5zW2ldLmlkOyAgXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnKCcgJiYgdG9rZW5zW2ldLmlkID09PSBjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgICAgICAgICBiZWdpbiA9IGk7ICBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcpJyAmJiB0b2tlbnNbaV0uaWQgPT09IGN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGVuZCA9IGk7ICBcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIElmIG5vIG1vcmUgcGFyZW50aGVzZXMgYXJlIGZvdW5kLCBwcm9jZXNzIHRoZSB3aG9sZSBleHByZXNzaW9uXHJcbiAgICAgICAgICAgIGlmICghY3VycmVudElEKSB7XHJcbiAgICAgICAgICAgICAgICBiZWdpbiA9IDA7XHJcbiAgICAgICAgICAgICAgICBlbmQgPSB0b2tlbnMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgb3BlcmF0b3JGb3VuZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvcGVyYXRvckZvdW5kID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sZW5kLHRva2VucykhPT0tMTtcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxyXG4gICAgICAgICAgICBpZiAoIW9wZXJhdG9yRm91bmQpIHtcclxuICAgICAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQpOyAgXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdG9rZW5TbGljZT10b2tlbnMuc2xpY2UoYmVnaW4gLCBlbmQpXHJcbiAgICAgICAgLy8gRmluZCBpbmRpY2VzIGJhc2VkIG9uIG9wZXJhdG9yIHByZWNlZGVuY2VcclxuICAgICAgICBsZXQgcHJpb3JpdHkxID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLC8oXFxefHNxcnQpLyk7XHJcbiAgICAgICAgbGV0IHByaW9yaXR5MiA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLyhmcmFjfGJpbm9tfHNpbnxjb3N8dGFufGFzaW58YWNvc3xhdGFuKS8pO1xyXG4gICAgICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oXFwqfFxcLykvKTtcclxuICAgICAgICBsZXQgcHJpb3JpdHk0ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvWystXS8pO1xyXG4gICAgICAgIGxldCBwcmlvcml0eTUgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC89Lyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NV0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHBhcnNlTGVmdCh0b2tlbnMsIGluZGV4KSB7XHJcbiAgICAgICAgbGV0IGJyZWFrQ2hhciA9IDAsbGVmdCA9ICcnLGNoYXI7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IGluZGV4IC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09ICdwYXJlbicpIHtcclxuICAgICAgICAgICAgICAgIGlmIChpIT09aW5kZXgtMiYmdG9rZW5zW2krMV0udHlwZSA9PT0gJ3BhcmVuJyYmdG9rZW5zW2krMV0uaWQ9PT10b2tlbnNbaW5kZXggLSAxXS5pZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrQ2hhciA9IGkgKyAxO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYoIWNoYXIpe2NoYXI9dG9rZW5zW2ldLnR5cGV9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHRva2Vuc1tpXS50eXBlICE9PSBjaGFyKSB7XHJcbiAgICAgICAgICAgICAgICBicmVha0NoYXIgPSBpICsgMTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZWZ0PXRva2Vucy5zbGljZShicmVha0NoYXIsaW5kZXgpLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSA9PT0gXCJudW1iZXJcInx8aXRlbS50eXBlID09PSBcInZhcmlhYmxlXCJ8fGl0ZW0udHlwZSA9PT0gXCJwb3dlclZhcmlhYmxlXCIpXHJcbiAgICAgICAgaWYgKGxlZnQubGVuZ3RoPT09MCl7cmV0dXJuIG51bGx9XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdmFyaWFibGU6IGxlZnRbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgIHZhbHVlOiBzYWZlVG9OdW1iZXIobGVmdFswXS52YWx1ZSksXHJcbiAgICAgICAgICAgIHBvdzogbGVmdFswXS5wb3csXHJcbiAgICAgICAgICAgIG11bHRpU3RlcDogdG9rZW5zW2luZGV4LTFdLnR5cGU9PT0ncGFyZW4nJiZsZWZ0Lmxlbmd0aD4xLFxyXG4gICAgICAgICAgICBicmVha0NoYXI6IGxlZnQubGVuZ3RoPjF8fHRva2Vuc1tpbmRleC0xXS50eXBlIT09J3BhcmVuJz9sZWZ0W2xlZnQubGVuZ3RoLTFdLmluZGV4OmJyZWFrQ2hhcixcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHBhcnNlUmlnaHQodG9rZW5zLCBpbmRleCkge1xyXG4gICAgICAgIGxldCBicmVha0NoYXIgPSB0b2tlbnMubGVuZ3RoLHJpZ2h0LGNoYXI7XHJcbiAgICAgICAgaWYoaW5kZXg9PT1icmVha0NoYXItMSl7cmV0dXJuIG51bGx9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IGluZGV4ICsgMTsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmICh0b2tlbnNbaW5kZXggKyAxXS50eXBlID09PSAncGFyZW4nKSB7XHJcbiAgICAgICAgICAgIGlmIChpIT09aW5kZXgrMiYmdG9rZW5zW2ktMV0udHlwZSA9PT0gJ3BhcmVuJyYmdG9rZW5zW2ktMV0uaWQ9PT10b2tlbnNbaW5kZXggKyAxXS5pZCkge1xyXG4gICAgICAgICAgICAgICAgYnJlYWtDaGFyID0gaTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYoIWNoYXIpe2NoYXI9dG9rZW5zW2ldLnR5cGV9XHJcbiAgICAgICAgZWxzZSBpZiAodG9rZW5zW2ldLnR5cGUgIT09IGNoYXIpIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrQ2hhciA9IGk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByaWdodD10b2tlbnMuc2xpY2UoaW5kZXgsYnJlYWtDaGFyKS5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgPT09IFwibnVtYmVyXCJ8fGl0ZW0udHlwZSA9PT0gXCJ2YXJpYWJsZVwifHxpdGVtLnR5cGUgPT09IFwicG93ZXJWYXJpYWJsZVwiKVxyXG4gICAgICAgIGlmIChyaWdodC5sZW5ndGg9PT0wKXtyZXR1cm4gbnVsbH1cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB2YXJpYWJsZTogcmlnaHRbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgIHZhbHVlOiBzYWZlVG9OdW1iZXIocmlnaHRbMF0udmFsdWUpLFxyXG4gICAgICAgICAgICBwb3c6IHJpZ2h0WzBdLnBvdyxcclxuICAgICAgICAgICAgbXVsdGlTdGVwOiB0b2tlbnNbaW5kZXgrMV0udHlwZT09PSdwYXJlbicmJnJpZ2h0Lmxlbmd0aD4xLFxyXG4gICAgICAgICAgICBicmVha0NoYXI6IHJpZ2h0Lmxlbmd0aD4xP3JpZ2h0WzBdLmluZGV4OmJyZWFrQ2hhcixcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwb3NpdGlvbih0b2tlbnMpIHtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgaW5kZXggPSBvcGVyYXRpb25zT3JkZXIodG9rZW5zKSxsZWZ0T2JqLCByaWdodE9iajtcclxuICAgICAgICBpZiAoaW5kZXg9PT1udWxsKXtyZXR1cm4gbnVsbH1cclxuICAgICAgICBzd2l0Y2ggKHRva2Vuc1tpbmRleF0udmFsdWUpIHtcclxuICAgICAgICAgICAgY2FzZSAnXic6XHJcbiAgICAgICAgICAgIGNhc2UgJysnOlxyXG4gICAgICAgICAgICBjYXNlICctJzpcclxuICAgICAgICAgICAgY2FzZSAnKic6XHJcbiAgICAgICAgICAgIGNhc2UgJy8nOlxyXG4gICAgICAgICAgICBjYXNlICc9JzpcclxuICAgICAgICAgICAgICAgIGxlZnRPYmogPSBwYXJzZUxlZnQodG9rZW5zLCBpbmRleCk7XHJcbiAgICAgICAgICAgICAgICByaWdodE9iaiA9IHBhcnNlUmlnaHQodG9rZW5zLCBpbmRleCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnc3FydCc6XHJcbiAgICAgICAgICAgIGNhc2UgJ3Npbic6XHJcbiAgICAgICAgICAgIGNhc2UgJ2Nvcyc6XHJcbiAgICAgICAgICAgIGNhc2UgJ3Rhbic6XHJcbiAgICAgICAgICAgIGNhc2UgJ2FzaW4nOlxyXG4gICAgICAgICAgICBjYXNlICdhY29zJzpcclxuICAgICAgICAgICAgY2FzZSAnYXRhbic6XHJcbiAgICAgICAgICAgIGNhc2UgJ2FyY3Npbic6XHJcbiAgICAgICAgICAgIGNhc2UgJ2FyY2Nvcyc6XHJcbiAgICAgICAgICAgIGNhc2UgJ2FyY3Rhbic6XHJcbiAgICAgICAgICAgICAgICByaWdodE9iaiA9IHBhcnNlUmlnaHQodG9rZW5zLCBpbmRleCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnZnJhYyc6XHJcbiAgICAgICAgICAgIGNhc2UgJ2Jpbm9tJzpcclxuICAgICAgICAgICAgICAgIGxlZnRPYmo9cGFyc2VSaWdodCh0b2tlbnMsIGluZGV4KVxyXG4gICAgICAgICAgICAgICAgcmlnaHRPYmo9cGFyc2VSaWdodCh0b2tlbnMsIGxlZnRPYmouYnJlYWtDaGFyKVxyXG4gICAgICAgICAgICAgICAgbGVmdE9iai5icmVha0NoYXI9aW5kZXg7XHJcbiAgICAgICAgICAgICAgICByaWdodE9iai5icmVha0NoYXIrPTE7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsOyBcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHsgXHJcbiAgICAgICAgICAgIG9wZXJhdG9yOiB0b2tlbnNbaW5kZXhdLnZhbHVlLFxyXG4gICAgICAgICAgICBpbmRleDogaW5kZXgsXHJcbiAgICAgICAgICAgIHNwZWNpYWxDaGFyOiB0b2tlbnNbaW5kZXhdLnNwZWNpYWxDaGFyP3Rva2Vuc1tpbmRleF0uc3BlY2lhbENoYXI6bnVsbCwgXHJcbiAgICAgICAgICAgIGxlZnQ6IGxlZnRPYmogPyBsZWZ0T2JqLnZhbHVlIDogbnVsbCwgXHJcbiAgICAgICAgICAgIGxlZnRWYXJpYWJsZTogbGVmdE9iaiA/bGVmdE9iai52YXJpYWJsZTpudWxsLFxyXG4gICAgICAgICAgICBsZWZ0UG93OiBsZWZ0T2JqID8gbGVmdE9iai5wb3c6bnVsbCxcclxuICAgICAgICAgICAgbGVmdE11bHRpU3RlcDogbGVmdE9iaiA/IGxlZnRPYmoubXVsdGlTdGVwOm51bGwsXHJcbiAgICAgICAgICAgIGxlZnRCcmVhazogIGxlZnRPYmogPyBsZWZ0T2JqLmJyZWFrQ2hhciA6IGluZGV4LFxyXG4gICAgICAgICAgICByaWdodDpyaWdodE9iaiA/IHJpZ2h0T2JqLnZhbHVlIDogbnVsbCwgXHJcbiAgICAgICAgICAgIHJpZ2h0VmFyaWFibGU6IHJpZ2h0T2JqID9yaWdodE9iai52YXJpYWJsZTpudWxsLFxyXG4gICAgICAgICAgICByaWdodFBvdzogcmlnaHRPYmogP3JpZ2h0T2JqLnBvdzpudWxsLFxyXG4gICAgICAgICAgICByaWdodE11bHRpU3RlcDogcmlnaHRPYmogP3JpZ2h0T2JqLm11bHRpU3RlcDpudWxsLFxyXG4gICAgICAgICAgICByaWdodEJyZWFrOnJpZ2h0T2JqID9yaWdodE9iai5icmVha0NoYXI6IHRva2Vucy5sZW5ndGgsXHJcbiAgICAgICAgfTsgXHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBwYXJzZShvcGVyYXRvcixzcGVjaWFsQ2hhciwgbGVmdCwgbGVmdFZhciwgcmlnaHQsIHJpZ2h0VmFyLHJpZ2h0UG93KSB7IFxyXG4gICAgICAgIGlmICghbGVmdCYmIS8oc3FydHxjb3N8c2lufHRhbikvLnRlc3Qob3BlcmF0b3IpKSB7XHJcbiAgICAgICAgICAgIEVycm9yLnB1c2goYEVycm9yOiBMZWZ0IHNpZGUgb2YgYCtvcGVyYXRvcitgIG11c3QgaGF2ZSBhIHZhbHVlYCk7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoIXJpZ2h0KSB7XHJcbiAgICAgICAgICAgIEVycm9yLnB1c2goYEVycm9yOiBSaWdodCBzaWRlIG9mIGArb3BlcmF0b3IrYCBtdXN0IGhhdmUgYSB2YWx1ZWApO1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IHNvbHZlZD17dmFsdWU6IDAsdmFyaWFibGU6ICcnLHBvdzogJyd9OyBcclxuICAgICAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ3NxcnQnOlxyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cocmlnaHQsc3BlY2lhbENoYXIhPT1udWxsPygxKS8oc3BlY2lhbENoYXIpOjAuNSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnXic6XHJcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhsZWZ0LHJpZ2h0KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdmcmFjJzpcclxuICAgICAgICAgICAgY2FzZSAnLyc6XHJcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAobGVmdCkvKHJpZ2h0KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICcqJzpcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQgKiByaWdodDtcclxuICAgICAgICAgICAgICAgIGlmIChsZWZ0VmFyJiYhcmlnaHRWYXIpe3NvbHZlZC52YXJpYWJsZT1sZWZ0VmFyfVxyXG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoIWxlZnRWYXImJnJpZ2h0VmFyKXtzb2x2ZWQudmFyaWFibGU9cmlnaHRWYXJ9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChsZWZ0VmFyJiZyaWdodFZhcil7c29sdmVkLnZhcmlhYmxlPXJpZ2h0VmFyO3NvbHZlZC5wb3c9Mn1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICcrJzpcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IGxlZnQgKyByaWdodDtcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0VmFyP2xlZnRWYXI6cmlnaHRWYXI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnLSc6XHJcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0IC0gcmlnaHQ7XHJcbiAgICAgICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdFZhcj9sZWZ0VmFyOnJpZ2h0VmFyO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Jpbm9tJzpcclxuICAgICAgICAgICAgICAgIGlmIChOdW1iZXIuaXNOYU4obGVmdCkgfHwgTnVtYmVyLmlzTmFOKHJpZ2h0KSB8fCBsZWZ0IDwgMCB8fCByaWdodCA8IDApIHtyZXR1cm4gbnVsbDsgfVxyXG4gICAgICAgICAgICAgICAgaWYgKHJpZ2h0ID4gbGVmdCkge3NvbHZlZCA9IDA7YnJlYWs7fVxyXG4gICAgICAgICAgICAgICAgaWYgKHJpZ2h0ID09PSAwIHx8IHJpZ2h0ID09PSBsZWZ0KSB7c29sdmVkID0gMTticmVhazt9XHJcbiAgICAgICAgICAgICAgICBpZiAocmlnaHQgPT09IDEgfHwgcmlnaHQgPT09IGxlZnQgLSAxKSB7c29sdmVkID0gbGVmdDticmVhazt9XHJcbiAgICAgICAgICAgICAgICBsZXQgayA9IHJpZ2h0O1xyXG4gICAgICAgICAgICAgICAgaWYgKHJpZ2h0ID4gbGVmdCAtIHJpZ2h0KSB7ayA9IGxlZnQgLSByaWdodDt9XHJcbiAgICBcclxuICAgICAgICAgICAgICAgIGxldCByZXMgPSAxO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gazsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzID0gcmVzICogKGxlZnQgLSBpICsgMSkgLyBpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gcmVzO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJz0nOlxyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdCA9PT0gcmlnaHQ7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnc2luJzpcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLnNpbihyaWdodCpNYXRoLlBJIC8gMTgwKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnY29zJzpcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLmNvcyhyaWdodCpNYXRoLlBJIC8gMTgwKSlcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICd0YW4nOlxyXG4gICAgICAgICAgICAgICAgaWYgKHJpZ2h0Pj05MCl7RXJyb3IucHVzaCgndGFuIE11c3QgYmUgc21hbGxlciB0aGFuIDkwJyk7fVxyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKHJpZ2h0Kk1hdGguUEkgLyAxODApKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdhc2luJzpcclxuICAgICAgICAgICAgY2FzZSAnYXJjc2luJzpcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLmFzaW4ocmlnaHQpICogKDE4MCAvIE1hdGguUEkpKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdhY29zJzpcclxuICAgICAgICAgICAgY2FzZSAnYXJjY29zJzpcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLmFjb3MocmlnaHQpICogKDE4MCAvIE1hdGguUEkpKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdhdGFuJzpcclxuICAgICAgICAgICAgY2FzZSAnYXJjdGFuJzpcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLmF0YW4ocmlnaHQpICogKDE4MCAvIE1hdGguUEkpKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxyXG4gICAgICAgIH1cclxuICAgICAgICAvL2FkZERlYnVnSW5mbyhzb2x2ZWQudmFsdWUsc29sdmVkLnZhcmlhYmxlKVxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHR5cGU6IHNvbHZlZC5wb3c/ICdwb3dlclZhcmlhYmxlJzpzb2x2ZWQudmFyaWFibGU/ICd2YXJpYWJsZSc6ICdudW1iZXInLFxyXG4gICAgICAgICAgICB2YWx1ZTogdHlwZW9mIHNvbHZlZC52YWx1ZSA9PT0gJ251bWJlcicgPyBNYXRoLnJvdW5kKHNvbHZlZC52YWx1ZSAqIDEwMDAwMCkgLyAxMDAwMDAgOiBzb2x2ZWQudmFsdWUsIFxyXG4gICAgICAgICAgICB2YXJpYWJsZTogc29sdmVkLnZhcmlhYmxlP3NvbHZlZC52YXJpYWJsZTonJyxcclxuICAgICAgICAgICAgcG93OiBzb2x2ZWQucG93P3NvbHZlZC5wb3c6JycsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY29udHJvbGxlcih0b2tlbnMpIHtcclxuICAgICAgICB0b2tlbnM9Y29ubmVjdCh0b2tlbnMpO1xyXG4gICAgICAgIHRva2Vucz1yZW9yZGVyKHRva2Vucyk7XHJcbiAgICAgICAgbWF0aD1yZWNvbnN0cnVjdCh0b2tlbnMpO1xyXG4gICAgICAgIGFkZERlYnVnSW5mbygnLy9tYXRoJywgbWF0aCk7XHJcbiAgICAgICAgYWRkbWF0aEluZm8oYCR7bWF0aH1cXG5gKTtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkodG9rZW5zKSBcclxuICAgICAgICAgICAgJiYgdG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gJ3ZhcmlhYmxlJykgXHJcbiAgICAgICAgICAgICYmICF0b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi52YWx1ZSA9PT0gJz0nKVxyXG4gICAgICAgICkgXHJcbiAgICAgICAge3JldHVybiBJbmZpbml0eX1cclxuICAgICAgICAvL3JldHVybiB0b2tlbnM7XHJcbiAgICAgICAgbGV0IGV4cHJlc3Npb24gPSBwb3NpdGlvbih0b2tlbnMpOyBcclxuICAgICAgICBhZGREZWJ1Z0luZm8oJ1BhcnNlZCBleHByZXNzaW9uJywgSlNPTi5zdHJpbmdpZnkoZXhwcmVzc2lvbiwgbnVsbCwgMC4wMSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vaWYgKGV4cHJlc3Npb24gIT09IG51bGwgJiYgISh0b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi50eXBlID09PSAnb3BlcmF0b3InICYmIHRva2VuLnZhbHVlICE9PSAnPScpKSYmIHRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnR5cGUgPT09ICd2YXJpYWJsZScpKSB7cmV0dXJuIG1hdGg7fVxyXG4gICAgXHJcbiAgICAgICAgaWYgKGV4cHJlc3Npb24gPT09IG51bGwpe1xyXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChwYXJzZUZsb2F0KG1hdGgpICogMTAwMDApIC8gMTAwMDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHJlYWR5Rm9yRmluYWxQcmFpc2luZyA9IHRva2Vucy5ldmVyeSh0b2tlbiA9PiAhLyhvcGVyYXRvcikvLnRlc3QodG9rZW4udHlwZSl8fC8oPSkvLnRlc3QodG9rZW4udmFsdWUpKTtcclxuICAgICAgICBjb25zdCBhbGxOdW1iZXJzID0gdG9rZW5zLmV2ZXJ5KHRva2VuID0+IC8obnVtYmVyKS8udGVzdCh0b2tlbi50eXBlKXx8Lyg9KS8udGVzdCh0b2tlbi52YWx1ZSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICgocmVhZHlGb3JGaW5hbFByYWlzaW5nJiYhYWxsTnVtYmVycykpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0b2tlbnM9c2ltcGxpZml5KHRva2VucylcclxuICAgICAgICAgICAgYWRkRGVidWdJbmZvKGBzaW1wbGlmaXkodG9rZW5zKWAsdG9rZW5zKVxyXG4gICAgICAgICAgICBjb25zdCBudW1iZXJJbmRleD0gKHRva2Vucy5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgPT09IFwibnVtYmVyXCIpKVswXTtcclxuICAgICAgICAgICAgY29uc3QgdmFyaWFibGVJbmRleD0gKHRva2Vucy5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgPT09IFwidmFyaWFibGVcIikpWzBdO1xyXG4gICAgICAgICAgICBjb25zdCBwb3dJbmRleCA9IHRva2Vucy5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgPT09IFwicG93ZXJWYXJpYWJsZVwiKTtcclxuICAgICAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXgudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVySW5kZXgudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFsdWUqLTFcclxuICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmICh0b2tlbnMuc29tZSh0b2tlbiA9PiB0b2tlbi50eXBlICE9PSAncG93ZXJWYXJpYWJsZScpKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYCR7dmFyaWFibGVJbmRleC52YXJpYWJsZX0gPSAkeyhudW1iZXJJbmRleC52YWx1ZSkvKHZhcmlhYmxlSW5kZXgudmFsdWUpfWBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsZXQgbGVmdFBvcyA9ZXhwcmVzc2lvbi5sZWZ0QnJlYWs7XHJcbiAgICAgICAgbGV0IHJpZ2h0UG9zID0gZXhwcmVzc2lvbi5yaWdodEJyZWFrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBzb2x2ZWQgPSBwYXJzZVxyXG4gICAgICAgIChcclxuICAgICAgICAgICAgZXhwcmVzc2lvbi5vcGVyYXRvcixcclxuICAgICAgICAgICAgZXhwcmVzc2lvbi5zcGVjaWFsQ2hhcixcclxuICAgICAgICAgICAgZXhwcmVzc2lvbi5sZWZ0ICxcclxuICAgICAgICAgICAgZXhwcmVzc2lvbi5sZWZ0VmFyaWFibGUgLFxyXG4gICAgICAgICAgICBleHByZXNzaW9uLnJpZ2h0LFxyXG4gICAgICAgICAgICBleHByZXNzaW9uLnJpZ2h0VmFyaWFibGUsXHJcbiAgICAgICAgICAgIGV4cHJlc3Npb24ucmlnaHRQb3csXHJcbiAgICAgICAgKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoc29sdmVkID09PSBudWxsKSB7cmV0dXJuIG51bGw7IH1cclxuICAgICAgICBpZiAodHlwZW9mIHNvbHZlZD09PWBzdHJpbmdgKSB7cmV0dXJuIHNvbHZlZDsgIH1cclxuICAgICAgICAvL2FkZERlYnVnSW5mbygnc29sdmVkJywgYCR7ZXhwcmVzc2lvbi5sZWZ0KyAoZXhwcmVzc2lvbi5sZWZ0VmFyaWFibGUgPyBleHByZXNzaW9uLmxlZnRWYXJpYWJsZSA6ICcnKX0gJHtleHByZXNzaW9uLm9wZXJhdG9yfSAke2V4cHJlc3Npb24ucmlnaHQrKGV4cHJlc3Npb24ucmlnaHRWYXJpYWJsZSA/IGV4cHJlc3Npb24ucmlnaHRWYXJpYWJsZSA6ICcnKX0gLS0+ICR7c29sdmVkLnZhbHVlK3NvbHZlZC52YXJpYWJsZSsoc29sdmVkLnBvdz9gXigke3NvbHZlZC5wb3d9KWA6JycpfWApXHJcbiAgICAgICAgYWRkU29sdXRpb25JbmZvIChgJHtleHByZXNzaW9uLmxlZnQgKyAoZXhwcmVzc2lvbi5sZWZ0VmFyaWFibGUgPyBleHByZXNzaW9uLmxlZnRWYXJpYWJsZSA6ICcnKX0gJHtleHByZXNzaW9uLm9wZXJhdG9yfSAke2V4cHJlc3Npb24ucmlnaHQrKGV4cHJlc3Npb24ucmlnaHRWYXJpYWJsZSA/IGV4cHJlc3Npb24ucmlnaHRWYXJpYWJsZSA6ICcnKX0gLS0+ICR7c29sdmVkLnZhbHVlK3NvbHZlZC52YXJpYWJsZSsoc29sdmVkLnBvdz9gXigke3NvbHZlZC5wb3d9KWA6JycpfVxcbmApXHJcbiAgICAgICAgaWYgKGV4cHJlc3Npb24ucmlnaHRNdWx0aVN0ZXAmJiFleHByZXNzaW9uLmxlZnRNdWx0aVN0ZXApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0b2tlbnMuc3BsaWNlKHJpZ2h0UG9zLDEpXHJcbiAgICAgICAgICAgIHRva2Vucy5zcGxpY2UoMCwwLHNvbHZlZClcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoMT09PTImJmV4cHJlc3Npb24ucmlnaHRNdWx0aVN0ZXAmJiFleHByZXNzaW9uLmxlZnRNdWx0aVN0ZXApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgdG9rZW5zLnNwbGljZShsZWZ0UG9zLHJpZ2h0UG9zLWxlZnRQb3Msc29sdmVkKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdG9rZW5zLmxlbmd0aD4xP2NvbnRyb2xsZXIodG9rZW5zKTpyZWNvbnN0cnVjdCh0b2tlbnMpO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gcmVjb25zdHJ1Y3QodG9rZW5zKXtcclxuICAgICAgICBsZXQgbWF0aCA9ICcnO1xyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPHRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZT09PScoJyYmdG9rZW5zW3Rva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaW5kZXgpID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQmJnRva2Vuc1tpbmRleCsxXSkrMV0udmFsdWU9PT0nLycpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG1hdGgrPSdcXFxcZnJhYydcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzd2l0Y2ggKHRva2Vuc1tpXS50eXBlKXtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9dG9rZW5zW2ldLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGFyZW4nOlxyXG4gICAgICAgICAgICAgICAgICAgIGxldCB0ZW1wPXRva2Vuc1t0b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQpLTFdXHJcbiAgICAgICAgICAgICAgICAgICAgLy9hZGREZWJ1Z0luZm8odGVtcCwvKGZyYWN8c3FydHxcXF4pLy50ZXN0KHRlbXAudmFsdWUpKVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICgodGVtcCYmLyhmcmFjfHNxcnR8XFxefFxcLykvLnRlc3QodGVtcC52YWx1ZSl8fCF0ZW1wKSlcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCdcXHsnKS5yZXBsYWNlKC9cXCkvLCdcXH0nKTticmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoL1xcKS8udGVzdCh0ZW1wLnZhbHVlKSYmLyhmcmFjfHNxcnR8XFxefFxcLykvLnRlc3QodG9rZW5zW3Rva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4uaWQgPT09IHRlbXAuaWQpLTFdLnZhbHVlKSlcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCdcXHsnKS5yZXBsYWNlKC9cXCkvLCdcXH0nKTticmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9dG9rZW5zW2ldLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnb3BlcmF0b3InOlxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWUpLnJlcGxhY2UoLyhbXlxcKlxcXj1cXC9dKS8sXCJcXFxcJDFcIikucmVwbGFjZSgvXFwqL2csYFxcXFxjZG90IGApO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAndmFyaWFibGUnOlxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWU8MD8nLSc6dG9rZW5zW2ktMV0mJi8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2Vuc1tpLTFdLnR5cGUpPycrJzonJykrdG9rZW5zW2ldLnZhbHVlK3Rva2Vuc1tpXS52YXJpYWJsZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3Bvd2VyVmFyaWFibGUnOlxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWU8MD8nLSc6dG9rZW5zW2ktMV0mJi8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2Vuc1tpLTFdLnR5cGUpPycrJzonJykrdG9rZW5zW2ldLnZhbHVlK3Rva2Vuc1tpXS52YXJpYWJsZStgXnske3Rva2Vuc1tpXS5wb3d9fWA7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRoXHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiByZW9yZGVyKHRva2Vucyl7XHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8dG9rZW5zLmxlbmd0aDtpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0b2tlbnNbaV0uaW5kZXg9aVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdG9rZW5zO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjb25uZWN0KHRva2Vucyl7XHJcbiAgICAgICAgbGV0IGk9MCxtb3JlQ29ubmVjdGVkVG9rZW5zPXRydWU7XHJcbiAgICAgICAgd2hpbGUgKGk8MTAwJiZtb3JlQ29ubmVjdGVkVG9rZW5zKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICBsZXQgaW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICAoIXRva2Vuc1tpbmRleCsyXXx8IS8oY2RvdHxcXCopLy50ZXN0KHRva2Vuc1tpbmRleCsyXS52YWx1ZSkpXHJcbiAgICAgICAgICAgICAgICAmJigodG9rZW4udHlwZSA9PT0gJ251bWJlcicgJiYgdG9rZW4udHlwZT09PXRva2Vuc1tpbmRleCArIDFdPy50eXBlKVxyXG4gICAgICAgICAgICAgICAgfHwodG9rZW4udHlwZSA9PT0gJ3ZhcmlhYmxlJyAmJiB0b2tlbi50eXBlPT09dG9rZW5zW2luZGV4ICsgMV0/LnR5cGUmJnRva2VuLnZhcmlhYmxlPT09dG9rZW5zW2luZGV4ICsgMV0/LnZhcmlhYmxlKSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWYoaW5kZXg9PT0tMSl7YnJlYWs7fVxyXG4gICAgICAgICAgICB0b2tlbnNbaW5kZXhdLnZhbHVlKz10b2tlbnNbaW5kZXgrMV0udmFsdWVcclxuICAgICAgICAgICAgdG9rZW5zLnNwbGljZShpbmRleCsxLCAxKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRva2VucztcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHNpbXBsaWZpeSh0b2tlbnMpe1xyXG4gICAgICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xyXG4gICAgICAgIHdoaWxlIChpPD0xMDAmJnRva2Vucy5zb21lKHRva2VuID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnZhbHVlID09PSAnPScpO1xyXG4gICAgICAgICAgICBsZXQgT3BlcmF0aW9uSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbikgPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSk7XHJcbiAgICAgICAgICAgIGlmIChPcGVyYXRpb25JbmRleD09PS0xKXthZGREZWJ1Z0luZm8oaSk7cmV0dXJuIHRva2Vuczt9XHJcbiAgICAgICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxyXG4gICAgXHJcbiAgICAgICAgICAgIGxldCBudW1iZXJHcm91cCA9IHRva2Vuc1xyXG4gICAgICAgICAgICAubWFwKCh0b2tlbiwgaSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxyXG4gICAgICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbS50b2tlbi50eXBlPT09Y3VycmVudFRva2VuLnR5cGUpIFxyXG4gICAgICAgICAgICAucmVkdWNlKChzdW0sIGl0ZW0pID0+IHtcclxuICAgICAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09ICctJykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIG11bHRpcGxpZXIgKj0gKGl0ZW0ub3JpZ2luYWxJbmRleCA8PSBlcWluZGV4KSA/IC0xIDogMTsgXHJcbiAgICAgICAgICAgIGlmICghKC8obnVtYmVyKS8pLnRlc3QoaXRlbS50b2tlbi50eXBlKSl7bXVsdGlwbGllcio9LTF9XHJcbiAgICAgICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xyXG4gICAgICAgICAgICB9LCAwKTsgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBuZXdUb2tlbnMucHVzaCh7IFxyXG4gICAgICAgICAgICAgICAgdHlwZTogY3VycmVudFRva2VuLnR5cGUsIFxyXG4gICAgICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwLFxyXG4gICAgICAgICAgICAgICAgdmFyaWFibGU6IGN1cnJlbnRUb2tlbi52YXJpYWJsZSxcclxuICAgICAgICAgICAgICAgIHBvdzogY3VycmVudFRva2VuLnBvdyxcclxuICAgICAgICAgICAgfSlcclxuICAgIFxyXG4gICAgICAgICAgICB0b2tlbnM9IHRva2Vucy5maWx0ZXIodG9rZW4gPT4ge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuICEodG9rZW4udHlwZSA9PT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgKCF0b2tlbi52YXJpYWJsZSB8fCB0b2tlbi52YXJpYWJsZSA9PT0gY3VycmVudFRva2VuLnZhcmlhYmxlKSAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICghdG9rZW4ucG93IHx8IHRva2VuLnBvdyA9PT0gY3VycmVudFRva2VuLnBvdykpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbmV3VG9rZW5zO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBxdWFkKGEsYixjKSB7XHJcbiAgICAgICAgbGV0IHgxPSAoYitNYXRoLnNxcnQoTWF0aC5wb3coYiwyKS00KmEqYykpLygyKmEpO1xyXG4gICAgICAgIGxldCB4Mj0gKC1iK01hdGguc3FydChNYXRoLnBvdyhiLDIpLTQqYSpjKSkvKDIqYSk7XHJcbiAgICAgICAgcmV0dXJuIGB4MSA9ICR7eDEudG9GaXhlZCgzKX0sIHgyID0gJHt4Mi50b0ZpeGVkKDMpfWA7XHJcbiAgICB9XHJcbiAgICAgICAgc29sdXRpb249Y29udHJvbGxlcih0b2tlbnMpO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKEVycm9yLmxlbmd0aCA+IDApIFxyXG4gICAgICAgIHsgXHJcbiAgICAgICAgICAgIHJldHVybiBFcnJvclxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHsgXHJcbiAgICAgICAgICAgIHJldHVybiB7IHNvbHV0aW9uOiBzb2x1dGlvbiwgaW5mbzogbWF0aEluZm8sIHNvbHV0aW9uSW5mbzogc29sdXRpb25JbmZvLCBkZWJ1Z0luZm86ZGVidWdJbmZvfTtcclxuICAgICAgICB9XHJcbn0iXX0=