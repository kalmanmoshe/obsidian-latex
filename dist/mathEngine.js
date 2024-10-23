const settings = require('./data.json');
export function controller(mathExpression) {
    let processedinput = '', debugInfo = '', mathInfo = [], solutionInfo = [];
    let latex = String.raw ``;
    // Remember function  remove dumbAss parentheses.
    function addDebugInfo(msg, value) {
        debugInfo += (typeof msg === "object" ? JSON.stringify(msg) : msg) + ` : ` + (typeof value === "object" ? JSON.stringify(value) : value) + `\n `;
    }
    let math = `${mathExpression}`
        .replace(/(\s)/g, "")
        .replace(/{/g, "(")
        .replace(/}/g, ")")
        .replace(/(\\cdot|cdot)/g, "*")
        .replace(/Math./g, "\\")
        .replace(/(?<!\\|[a-zA-Z])(tan|sin|cos|binom|frac|asin|acos|atan|arccos|arcsin|arctan|cdot)/g, "\\$1");
    addDebugInfo(math);
    let tokens = [];
    let brackets = 0, levelCount = {};
    let j = 0;
    for (let i = 0; i < math.length; i++) {
        j++;
        if (j > 500) {
            break;
        }
        let number = 0, startPos = i, vari = '';
        if (/[(\\]/.test(math[i]) && i > 0) {
            const beforeParentheses = /(number|variable|powVariable)/.test(tokens[tokens.length - 1].type);
            const lastIndex = tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id) - 1;
            const betweenParentheses = math[i - 1] === ')' && (lastIndex < 0 || !/(frac|binom|)/.test(tokens[lastIndex].value));
            if ((tokens.length - 1 >= 0 && beforeParentheses) || (betweenParentheses)) {
                if (math[i - 1] === '-') {
                    math = math.slice(0, i) + '1' + math.slice(i);
                }
                tokens.push({ type: 'operator', value: '*', index: tokens.length ? tokens.length : 0 });
                if (math[i + 1] === '-') {
                    math = math.slice(0, i) + '1' + math.slice(i);
                }
            }
        }
        if (math[i] === '(') {
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
                throw new Error("Unmatched closing bracket at position");
            }
            let ID = levelCount[brackets] - 1;
            tokens.push({ type: 'paren', value: ')', id: brackets + '.' + (ID >= 0 ? ID : 0), index: tokens.length });
            if (i + 1 < math.length && /[0-9A-Za-z.]/.test(math[i + 1])) {
                math = math.slice(0, i + 1) + '*' + math.slice(i + 1);
            }
            continue;
        }
        if (math[i] === '\\') {
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
        let match = math.slice(i).match(/^([0-9.]+)([a-zA-Z]?)/);
        if (match && !match[2]) {
            number = match[0];
            i += number.length > 1 ? number.length - 1 : 0;
            if (/[+-]/.test(math[startPos - 1])) {
                number = math[startPos - 1] + number;
            }
            if (math[i + 1] && /[a-zA-Z]/.test(math[i + 1])) {
                continue;
            }
            tokens.push({ type: 'number', value: parseFloat(number), index: tokens.length ? tokens.length : 0 });
            continue;
        }
        if (/[a-zA-Z]/.test(math[i])) {
            vari = (math.slice(i).match(/[a-zA-Z]+(_\([a-zA-Z0-9]*\))*/) || [""])[0];
            if (vari && vari.length === 0) {
                vari = math.slice(i, math.length);
            }
            number = math.slice(i + vari.length, vari.length + i + math.slice(i + vari.length).search(/[^0-9]/));
            i += vari.length + number.length - 1;
            number = safeToNumber(number.length > 0 ? number : 1);
            if (/[0-9]/.test(math[startPos > 0 ? startPos - 1 : 0]) && tokens) {
                number = (math.slice(0, startPos).match(/[0-9.]+(?=[^0-9.]*$)/) || [""])[0];
                number = math[startPos - number.length - 1] && math[startPos - number.length - 1] === '-' ? '-' + number : number;
            }
            else if (/[-]/.test(math[startPos - 1])) {
                number = math[startPos - 1] + number;
            }
            tokens.push({ type: 'variable', variable: vari.replace('(', '{').replace(')', '}'), value: safeToNumber(number), index: tokens.length });
            continue;
        }
        if (/[\*\/\^=]/.test(math[i]) || (!/[a-zA-Z0-9]/.test(math[i + 1]) && /[+-]/.test(math[i]))) {
            tokens.push({ type: 'operator', value: math[i], index: tokens.length ? tokens.length : 0 });
            continue;
        }
        if (/[+-]/.test(math[i])) {
            continue;
        }
        //throw new Error(`Unknown char \"${math[i]}\"`);
    }
    if (brackets !== 0) {
        throw new Error('Unmatched opening bracket(s)');
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
        let breakChar = index, left;
        if (index <= 0 || !tokens[index - 1]) {
            // Check if there are no tokens to the left
            return null;
        }
        if (tokens[index - 1].type === 'paren') {
            // Find the matching open parenthesis
            breakChar = tokens.findIndex(token => token.id === tokens[index - 1].id);
            // Extract the relevant token within the parentheses
            left = tokens.slice(breakChar, index).find(item => /(number|variable|powerVariable)/.test(item.type));
        }
        else {
            left = tokens[index - 1];
        }
        if (!left) {
            return null; // If no valid left token is found, return null
        }
        return {
            type: left.pow ? 'powerVariable' : left.variable ? 'variable' : 'number',
            variable: left.variable,
            value: safeToNumber(left.value),
            pow: left.pow,
            multiStep: index - breakChar >= 4,
            breakChar: breakChar !== index ? breakChar : left.index,
        };
    }
    function parseRight(tokens, index) {
        let breakChar = index, right;
        if (index >= tokens.length - 1 || !tokens[index + 1]) {
            // Check if there are no tokens to the right
            return null;
        }
        if (tokens[index + 1].type === 'paren') {
            breakChar = tokens.findLastIndex((token, idx) => idx > index && token.id === tokens[index + 1].id);
            right = tokens.slice(index, breakChar).find(item => /(number|variable|powerVariable)/.test(item.type));
        }
        else {
            right = tokens[index + 1];
        }
        if (!right) {
            return null;
        }
        return {
            type: right.pow ? 'powerVariable' : right.variable ? 'variable' : 'number',
            variable: right.variable,
            value: safeToNumber(right.value),
            pow: right.pow,
            multiStep: breakChar - index >= 4,
            breakChar: breakChar !== index ? breakChar + 1 : right.index + 1,
        };
    }
    function position(tokens, index) {
        let leftObj = null, rightObj = null, transition = index;
        index = index === null ? operationsOrder(tokens) : index;
        if (index === null || index === tokens.length - 1) {
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
                leftObj = index;
                rightObj = parseRight(tokens, index);
                break;
            case 'frac':
            case 'binom':
                leftObj = parseRight(tokens, index);
                transition = leftObj.breakChar;
                rightObj = parseRight(tokens, transition);
                leftObj.breakChar = index;
                rightObj.breakChar += 1;
                break;
            default:
                return null;
        }
        return Object.assign(Object.assign({ operator: tokens[index].value, index: index, transition: transition, specialChar: tokens[index].specialChar ? tokens[index].specialChar : null }, (typeof leftObj === 'object'
            ? { left: leftObj.value, leftType: leftObj.type, leftVariable: leftObj.variable, leftPow: leftObj.pow, leftMultiStep: leftObj.multiStep, leftBreak: leftObj.breakChar }
            : { left: null, leftBreak: leftObj })), rightObj && { right: rightObj.value, rightType: rightObj.type, rightVariable: rightObj.variable, rightPow: rightObj.pow, rightMultiStep: rightObj.multiStep, rightBreak: rightObj.breakChar });
    }
    function parse(tokens, operator, specialChar, left, leftVar, right, rightVar, rightPow) {
        if (typeof operator === 'string' && typeof right !== `number` && !/(sqrt|cos|sin|tan)/.test(operator)) {
            throw new Error(`Left side of ` + operator + ` must have a value`);
        }
        if (typeof operator === 'string' && typeof right !== `number`) {
            throw new Error(`Right side of ` + operator + ` must have a value`);
        }
        //const readyForFinalPraising = tokens.every(token => !/(operator)/.test(token.type)||/(=)/.test(token.value));
        //const allNumbers = tokens.every(token => /(number)/.test(token.type)||/(=)/.test(token.value));
        const areThereOperators = tokens.some(token => /(operator)/.test(token.type) && !/(=)/.test(token.value));
        //(readyForFinalPraising&&!allNumbers)
        //addDebugInfo(areThereOperators)
        if (!areThereOperators) {
            tokens = simplifiy(tokens);
            addDebugInfo(`simplifiy(tokens)`, tokens);
            const numberIndex = (tokens.filter(item => item.type === "number"));
            const variableIndex = (tokens.filter(item => item.type === "variable"));
            const powIndex = tokens.filter(item => item.type === "powerVariable");
            if (powIndex.length === 1 && powIndex[0].pow === 2) {
                return quad(powIndex[0] ? powIndex[0].value : 0, variableIndex[0] ? variableIndex[0].value : 0, numberIndex[0] ? numberIndex[0].value * -1 : 0, powIndex[0].variable);
            }
            if (powIndex.length === 0 && variableIndex.length !== 0 && numberIndex !== 0) {
                addDebugInfo(`${variableIndex[0].variable} = \\frac{${numberIndex[0].value}}{${variableIndex[0].value}} = ${(numberIndex[0].value) / (variableIndex[0].value)}`);
                solutionInfo.push(`${variableIndex[0].variable} = \\frac{${numberIndex[0].value}}{${variableIndex[0].value}} = ${(numberIndex[0].value) / (variableIndex[0].value)}`);
                return `${variableIndex[0].variable} = ${(numberIndex[0].value) / (variableIndex[0].value)}`;
            }
            else if (tokens.length === 1 && numberIndex) {
                return JSON.stringify(numberIndex.value === 0);
            }
        }
        let solved = { value: 0, variable: '', pow: '' };
        switch (operator) {
            case 'sqrt':
                solved.value = Math.pow(right, specialChar !== null ? (1) / (specialChar) : 0.5);
                break;
            case '^':
                if (leftVar || rightVar) {
                    solved.variable = leftVar || leftVar === rightVar ? leftVar : rightVar ? rightVar : '';
                    solved.pow = right;
                }
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
                    solved.value = 0;
                    break;
                }
                if (right === 0 || right === left) {
                    solved.value = 1;
                    break;
                }
                if (right === 1 || right === left - 1) {
                    solved.value = left;
                    break;
                }
                let k = right > left - right ? left - right : right;
                let res = 1;
                for (let i = 1; i <= k; i++) {
                    res = (res * (left - i + 1)) / i;
                }
                solved.value = res;
                break;
            case 'sin':
                solved.value = (Math.sin(right * Math.PI / 180));
                break;
            case 'cos':
                solved.value = (Math.cos(right * Math.PI / 180));
                break;
            case 'tan':
                if (right >= 90) {
                    throw new Error('tan Must be smaller than 90');
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
        if (!processedinput) {
            processedinput = reconstruct(tokens);
        }
        tokens = connect(tokens);
        math = reconstruct(tokens);
        addDebugInfo('//math', math);
        mathInfo.push(math);
        if (Array.isArray(tokens)
            && tokens.some(token => /(variable|powVariable)/.test(token.type))
            && !tokens.some(token => token.value === '=')) {
            return Infinity;
        }
        let expression = position(tokens, null);
        addDebugInfo('Parsed expression', JSON.stringify(expression, null, 0.01));
        if (expression === null && tokens.length > 1) {
            addDebugInfo(`parse(tokens)`, parse(tokens));
            return `d`;
            // return solution(tokens);
        }
        else if (expression === null) {
            return Math.round(parseFloat(reconstruct(tokens)) * 10000) / 10000;
        }
        if (/(frac)/.test(expression.operator) && (expression.rightVariable || expression.leftVariable)) {
            //addDebugInfo(goodByFraction(tokens,expression))
            return controller(goodByFraction(tokens, expression));
        }
        if (expression.rightMultiStep || expression.leftMultiStep) {
            return controller(expandExpression(tokens, expression));
        }
        let solved = parse(tokens, expression.operator, expression.specialChar, expression.left, expression.leftVariable, expression.right, expression.rightVariable, expression.rightPow);
        if (solved === null) {
            return null;
        }
        if (typeof solved === `string`) {
            return solved;
        }
        addDebugInfo('solved', solved);
        addDebugInfo('solved', addSolution(expression, solved));
        solutionInfo.push(addSolution(expression, solved));
        //addSolutionInfo (addSolution(expression,solved)+`\n`)
        tokens.splice(expression.leftBreak, expression.rightBreak - expression.leftBreak, solved);
        return tokens.length > 1 ? controller(tokens) : reconstruct(tokens);
    }
    function goodByFraction(tokens, expression) {
        let replacementTokens = [];
        let denominator = tokens.slice(expression.transition, expression.rightBreak);
        for (let i = 0; i < tokens.length; i++) {
            // Skip tokens if we have already processed this section
            if (i >= expression.index && i < expression.rightBreak) {
                replacementTokens.push(...tokens.slice(expression.index + 1, expression.transition));
                i = expression.rightBreak - 1;
                continue;
            }
            if (/(=)/.test(tokens[i].value)) {
                replacementTokens.push(tokens[i]);
                continue;
            }
            let replacement = tokens.slice(i, i + 1);
            let whereAmI = i;
            let rest = [];
            if (tokens[i].value === 'frac') {
                whereAmI = position(tokens, i);
                replacementTokens.push(...tokens.slice(whereAmI.index, whereAmI.index + 2));
                rest = tokens.slice(whereAmI.transition - 1, whereAmI.rightBreak);
                replacement = tokens.slice(i + 2, whereAmI.transition - 1);
            }
            else {
                whereAmI = i + tokens.slice(i).findIndex(token => /(=|frac)/.test(token.value));
                whereAmI = whereAmI < i ? tokens.length : whereAmI;
                replacement = tokens.slice(i, whereAmI);
            }
            replacementTokens.push(...denominator, { "type": "operator", "value": "*" }, { "type": "paren", "value": "(", "id": 0, "index": 0 }, ...replacement, { "type": "paren", "value": ")", "id": 0, "index": 0 }, ...rest);
            i = typeof whereAmI === 'object' ? whereAmI.rightBreak - 1 : whereAmI - 1;
        }
        replacementTokens = connect(replacementTokens);
        addDebugInfo(`goodByFraction`, reconstruct(replacementTokens));
        solutionInfo.push(reconstruct(replacementTokens));
        return replacementTokens;
    }
    function reIDparentheses(tokens) {
        let brackets = 0, levelCount = {};
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].value === '(') {
                if (!levelCount[brackets]) {
                    levelCount[brackets] = 0;
                }
                let ID = levelCount[brackets]++;
                // Reassign the object with the new id to ensure persistence
                tokens[i] = Object.assign(Object.assign({}, tokens[i]), { id: brackets + '.' + ID });
                brackets++;
                continue;
            }
            if (tokens[i].value === ')') {
                brackets--;
                let ID = levelCount[brackets] - 1;
                // Reassign the object with the new id to ensure persistence
                tokens[i] = Object.assign(Object.assign({}, tokens[i]), { id: brackets + '.' + (ID >= 0 ? ID : 0) });
                continue;
            }
        }
        return tokens;
    }
    function expandExpression(tokens, expression) {
        let left = tokens.slice(expression.leftBreak, expression.index).filter(item => /(number|variable|powerVariable)/.test(item.type));
        let right = tokens.slice(expression.index, expression.rightBreak).filter(item => /(number|variable|powerVariable)/.test(item.type));
        if (expression.operator === '-' && expandExpression.leftMultiStep === undefined) {
            left = [{ "type": "number", "value": -1, "index": 0 }];
        }
        let replacementCell = [];
        for (let i = 0; i < left.length; i++) {
            for (let j = 0; j < right.length; j++) {
                replacementCell.push(left[i]);
                replacementCell.push({ "type": "operator", "value": "*", "index": 0 });
                replacementCell.push(right[j]);
            }
        }
        if (expression.operator === '-' && expandExpression.leftMultiStep === undefined) {
            tokens.splice(expression.index, expression.rightBreak - expression.index, ...replacementCell);
        }
        else {
            tokens.splice(expression.leftBreak, expression.rightBreak - expression.leftBreak, ...replacementCell);
        }
        tokens = reorder(tokens);
        addDebugInfo(`expandExpression`, reconstruct(tokens));
        solutionInfo.push(reconstruct(tokens));
        return tokens;
    }
    function addSolution(expression, solved) {
        let solution = reconstruct([solved]);
        let left = expression.left ? reconstruct([{ type: expression.leftType, value: expression.left, variable: expression.leftVariable, pow: expression.leftPow }]) : '';
        let right = typeof expression.right === 'number' ? reconstruct([{ type: expression.rightType, value: expression.right, variable: expression.rightVariable, pow: expression.rightPow }]) : '';
        switch (expression.operator) {
            case '^':
                return `${left} ^ {${right}} = ${solution}`;
            case '+':
            case '-':
            case '*':
                return `${left} ${expression.operator.replace(/\*/g, "\\cdot")} ${right} = ${solution}`;
            case '=':
                return `\\frac{${left}}{${right}} = ${solution}`;
            case 'sqrt':
                return `\\${expression.operator}{${right}} = ${solution}`;
            case 'sin':
            case 'cos':
            case 'tan':
            case 'asin':
            case 'acos':
            case 'atan':
            case 'arcsin':
            case 'arccos':
            case 'arctan':
                return `\\${expression.operator} (${right}) = ${solution}`;
            case 'binom':
            case 'frac':
            case '/':
                return `\\${expression.operator.replace('/', "frac")}{${left}}{${right}} = ${solution}`;
        }
        return null;
    }
    function curlyBracketsValidityCheck(check) {
        return /(frac|sqrt|\^|\/|binom)/.test(check);
    }
    function reconstruct(tokens) {
        var _a;
        let math = '';
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].value === '(' && tokens[tokens.findLastIndex((token, index) => token.id === tokens[i].id && tokens[index + 1]) + 1].value === '/') {
                math += '\\frac';
            }
            switch (tokens[i].type) {
                case 'number':
                    math += (tokens[i].value >= 0 && tokens[i - 1] && (/(number|variable|powerVariable)/.test(tokens[i - 1].type) || tokens[i - 1].value === ')') ? '+' : '') + tokens[i].value;
                    math += i + 1 < tokens.length && /(frac)/.test(tokens[i + 1].value) ? '+' : '';
                    break;
                case 'paren':
                    let temp = tokens[tokens.findIndex(token => token.id === tokens[i].id) - 1];
                    if ((typeof temp !== "undefined" && curlyBracketsValidityCheck(temp.value))) {
                        math += tokens[i].value.replace(/\(/, '\{').replace(/\)/, '\}');
                        break;
                    }
                    else if (typeof temp !== "undefined" && /\)/.test(temp.value) && curlyBracketsValidityCheck(tokens[tokens.findIndex(token => token.id === temp.id) - 1].value)) {
                        math += tokens[i].value.replace(/\(/, '\{').replace(/\)/, '\}');
                        break;
                    }
                    else if (i > 0 && tokens[i].value === '(' && ((_a = tokens[i - 1]) === null || _a === void 0 ? void 0 : _a.value) === ')') {
                        math += '+';
                    }
                    math += tokens[i].value;
                    break;
                case 'operator':
                    if (tokens[i].value !== '/') {
                        math += (tokens[i].value).replace(/([^\*\^=\/+-])/, "\\$1").replace(/\*/g, `\\cdot `);
                    }
                    break;
                case 'variable':
                    math += (tokens[i].value >= 0 && tokens[i - 1] && /(number|variable|powerVariable)/.test(tokens[i - 1].type) ? '+' : '') + (tokens[i].value !== 1 ? tokens[i].value : '') + tokens[i].variable;
                    break;
                case 'powerVariable':
                    math += (tokens[i].value >= 0 && tokens[i - 1] && /(number|variable|powerVariable)/.test(tokens[i - 1].type) ? '+' : '') + (tokens[i].value !== 1 ? tokens[i].value : '') + tokens[i].variable + `^{${tokens[i].pow}}`;
                    break;
                default:
                    continue;
            }
        }
        return math;
    }
    function reorder(tokens) {
        let newTokens = [];
        for (let i = 0; i < tokens.length; i++) {
            let newToken = Object.assign(Object.assign({}, tokens[i]), { index: i });
            newTokens.push(newToken);
        }
        return newTokens;
    }
    function connect(tokens) {
        let i = 0, moreConnectedTokens = true;
        while (i < 100 && moreConnectedTokens) {
            i++;
            let index = tokens.findIndex((token, index) => {
                var _a, _b, _c;
                return (!tokens[index + 2] || tokens[index + 2].type !== 'operator') &&
                    ((token.type === 'number' && token.type === ((_a = tokens[index + 1]) === null || _a === void 0 ? void 0 : _a.type)) ||
                        (token.type === 'variable' && token.type === ((_b = tokens[index + 1]) === null || _b === void 0 ? void 0 : _b.type) && token.variable === ((_c = tokens[index + 1]) === null || _c === void 0 ? void 0 : _c.variable)));
            });
            if (index !== -1) {
                tokens[index].value += tokens[index + 1].value;
                tokens.splice(index + 1, 1);
            }
            let openParenIndex = -1, closeParenIndex = -1;
            let checktParen = -1;
            while (i < 100) {
                i++;
                openParenIndex = tokens.findIndex((token, index) => token.value === '(' && index > checktParen &&
                    (index === 0 || // Handle case for first token
                        (index - 1 >= 0 && tokens[index - 1] && (!/(operator|paren)/.test(tokens[index - 1].type) || /[=]/.test(tokens[index - 1].value)))));
                closeParenIndex = openParenIndex === -1 ? -1 : tokens.findLastIndex((token, index) => token.value === ')' &&
                    token.id === tokens[openParenIndex].id &&
                    ((tokens.length - 1 > index && (tokens[index + 1].type !== 'operator' || /[=]/.test(tokens[index + 1].value)) || tokens.length - 1 === index)));
                if (openParenIndex === -1 || closeParenIndex !== -1) {
                    break;
                }
                checktParen = openParenIndex;
            }
            if (closeParenIndex !== -1) {
                tokens = tokens.filter((_, idx) => idx !== openParenIndex && idx !== closeParenIndex);
            }
            if (index === -1 && closeParenIndex === -1) {
                break;
            }
        }
        tokens = reorder(tokens);
        tokens = reIDparentheses(tokens);
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
    function quad(a, b, c, variable) {
        addDebugInfo('quad', `a = ${a}, b = ${b}, c = ${c}`);
        solutionInfo.push(`a = ${a}, b = ${b}, c = ${c}`);
        let x1 = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
        let x2 = (-b - Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
        x1 = Math.round(x1 * 10000) / 10000;
        x2 = Math.round(x2 * 10000) / 10000;
        return x1 === x2 ? `${variable} = ${x1}` : `${variable}_1 = ${x1},${variable}_2 = ${x2.toFixed(3)}`;
    }
    solution = controller(tokens);
    if (typeof mathExpression === "undefined") {
        return `latex: ${latex},\nprocessedinput: ${processedinput},\nLength: ${latex.length},\nTokens: ${tokens.length}\nsolution: ${solution}\nDebug Info:\n${debugInfo}`;
    }
    return {
        solution: solution,
        processedinput: processedinput || '',
        mathInfo: mathInfo || '',
        solutionInfo: solutionInfo || '',
        debugInfo: debugInfo || '',
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21hdGhFbmdpbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ3hDLE1BQU0sVUFBVSxVQUFVLENBQUMsY0FBYztJQUV6QyxJQUFJLGNBQWMsR0FBQyxFQUFFLEVBQUcsU0FBUyxHQUFHLEVBQUUsRUFBRSxRQUFRLEdBQUcsRUFBRSxFQUFFLFlBQVksR0FBQyxFQUFFLENBQUE7SUFDdEUsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQSxFQUFFLENBQUM7SUFDekIsaURBQWlEO0lBQ2pELFNBQVMsWUFBWSxDQUFDLEdBQUcsRUFBRSxLQUFLO1FBQzVCLFNBQVMsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFHLFFBQVEsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUEsR0FBRyxDQUFDLEdBQUMsS0FBSyxHQUFDLENBQUMsT0FBTyxLQUFLLEtBQUcsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUMsQ0FBQSxLQUFLLENBQUMsR0FBRSxLQUFLLENBQUM7SUFDcEksQ0FBQztJQUdELElBQUksSUFBSSxHQUFHLEdBQUcsY0FBYyxFQUFFO1NBQzdCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO1NBQ3BCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO1NBQ2xCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO1NBQ2xCLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUM7U0FDOUIsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUM7U0FDdkIsT0FBTyxDQUFDLG9GQUFvRixFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBRXZHLFlBQVksQ0FBQyxJQUFJ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Y0FBYyxLQUFLLFdBQVcsRUFDekM7UUFDSSxPQUFPLFVBQVUsS0FBSyxzQkFBc0IsY0FBYyxjQUFjLEtBQUssQ0FBQyxNQUFNLGNBQWMsTUFBTSxDQUFDLE1BQU0sZUFBZSxRQUFRLGtCQUFrQixTQUFTLEVBQUUsQ0FBQztLQUN2SztJQUNELE9BQU87UUFDSCxRQUFRLEVBQUUsUUFBUTtRQUNsQixjQUFjLEVBQUUsY0FBYyxJQUFJLEVBQUU7UUFDcEMsUUFBUSxFQUFFLFFBQVEsSUFBSSxFQUFFO1FBQ3hCLFlBQVksRUFBRSxZQUFZLElBQUksRUFBRTtRQUNoQyxTQUFTLEVBQUUsU0FBUyxJQUFJLEVBQUU7S0FDN0IsQ0FBQztBQUNOLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBzZXR0aW5ncyA9IHJlcXVpcmUoJy4vZGF0YS5qc29uJyk7XHJcbmV4cG9ydCBmdW5jdGlvbiBjb250cm9sbGVyKG1hdGhFeHByZXNzaW9uKSB7XHJcbiAgICBcclxubGV0IHByb2Nlc3NlZGlucHV0PScnLCAgZGVidWdJbmZvID0gJycsIG1hdGhJbmZvID0gW10sIHNvbHV0aW9uSW5mbz1bXSBcclxubGV0IGxhdGV4ID0gU3RyaW5nLnJhd2BgO1xyXG4vLyBSZW1lbWJlciBmdW5jdGlvbiAgcmVtb3ZlIGR1bWJBc3MgcGFyZW50aGVzZXMuXHJcbmZ1bmN0aW9uIGFkZERlYnVnSW5mbyhtc2csIHZhbHVlKSB7XHJcbiAgICBkZWJ1Z0luZm8gKz0gKHR5cGVvZiBtc2c9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KG1zZyk6bXNnKStgIDogYCsodHlwZW9mIHZhbHVlPT09XCJvYmplY3RcIj9KU09OLnN0cmluZ2lmeSh2YWx1ZSk6dmFsdWUpKyBgXFxuIGA7XHJcbn1cclxuXHJcblxyXG5sZXQgbWF0aCA9IGAke21hdGhFeHByZXNzaW9ufWBcclxuLnJlcGxhY2UoLyhcXHMpL2csIFwiXCIpIFxyXG4ucmVwbGFjZSgvey9nLCBcIihcIikgXHJcbi5yZXBsYWNlKC99L2csIFwiKVwiKVxyXG4ucmVwbGFjZSgvKFxcXFxjZG90fGNkb3QpL2csIFwiKlwiKVxyXG4ucmVwbGFjZSgvTWF0aC4vZywgXCJcXFxcXCIpXHJcbi5yZXBsYWNlKC8oPzwhXFxcXHxbYS16QS1aXSkodGFufHNpbnxjb3N8Ymlub218ZnJhY3xhc2lufGFjb3N8YXRhbnxhcmNjb3N8YXJjc2lufGFyY3RhbnxjZG90KS9nLCBcIlxcXFwkMVwiKTtcclxuXHJcbmFkZERlYnVnSW5mbyhtYXRoKVxyXG5cclxuXHJcbmxldCB0b2tlbnMgPSBbXTtcclxubGV0IGJyYWNrZXRzID0gMCwgIGxldmVsQ291bnQgPSB7fTtcclxubGV0IGo9MDtcclxuZm9yIChsZXQgaSA9IDA7IGkgPCBtYXRoLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBqKys7XHJcbiAgICBpZihqPjUwMCl7YnJlYWs7fVxyXG4gICAgbGV0IG51bWJlcj0wLCAgc3RhcnRQb3MgPSBpLHZhcmk9Jyc7XHJcblxyXG4gICAgaWYoL1soXFxcXF0vLnRlc3QobWF0aFtpXSkmJmk+MCl7XHJcbiAgICAgICAgY29uc3QgYmVmb3JlUGFyZW50aGVzZXM9LyhudW1iZXJ8dmFyaWFibGV8cG93VmFyaWFibGUpLy50ZXN0KHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLnR5cGUpXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbGFzdEluZGV4ID0gdG9rZW5zLm1hcCh0b2tlbiA9PiB0b2tlbi5pZCkuaW5kZXhPZih0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLmlkKSAtIDE7XHJcbiAgICAgICAgY29uc3QgYmV0d2VlblBhcmVudGhlc2VzPW1hdGhbaS0xXSA9PT0gJyknJiYobGFzdEluZGV4PDB8fCEvKGZyYWN8Ymlub218KS8udGVzdCh0b2tlbnNbbGFzdEluZGV4XS52YWx1ZSkpXHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCh0b2tlbnMubGVuZ3RoLTE+PTAmJmJlZm9yZVBhcmVudGhlc2VzKXx8KGJldHdlZW5QYXJlbnRoZXNlcykpIHtcclxuICAgICAgICAgICAgaWYobWF0aFtpLTFdPT09Jy0nKXttYXRoID0gbWF0aC5zbGljZSgwLCBpKSsgJzEnICttYXRoLnNsaWNlKGkpfVxyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6ICdvcGVyYXRvcicsIHZhbHVlOiAnKicsIGluZGV4OiB0b2tlbnMubGVuZ3RoP3Rva2Vucy5sZW5ndGg6MCB9KTtcclxuICAgICAgICAgICAgaWYobWF0aFtpKzFdPT09Jy0nKXttYXRoID0gbWF0aC5zbGljZSgwLCBpKSsgJzEnICttYXRoLnNsaWNlKGkpfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAobWF0aFtpXSA9PT0gJygnKSB7XHJcbiAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xyXG4gICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XHJcbiAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAncGFyZW4nLCB2YWx1ZTogJygnLCBpZDogYnJhY2tldHMgKyAnLicgKyBJRCwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XHJcbiAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGlmIChtYXRoW2ldID09PSAnKScpIHtcclxuICAgICAgICBicmFja2V0cy0tOyBcclxuICAgICAgICBpZiAoYnJhY2tldHMgPCAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVubWF0Y2hlZCBjbG9zaW5nIGJyYWNrZXQgYXQgcG9zaXRpb25cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdIC0gMTtcclxuICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6ICdwYXJlbicsIHZhbHVlOiAnKScsIGlkOiBicmFja2V0cyArICcuJyArIChJRCA+PSAwID8gSUQgOiAwKSwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGkrMTxtYXRoLmxlbmd0aCYmL1swLTlBLVphLXouXS8udGVzdChtYXRoW2krMV0pKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgaSsxKSArICcqJyArIG1hdGguc2xpY2UoaSsxKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG1hdGhbaV0gPT09ICdcXFxcJykge1xyXG4gICAgICAgIGkrPTE7ICBcclxuICAgICAgICBsZXQgb3BlcmF0b3IgPSAobWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rLykgfHwgW1wiXCJdKVswXVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogJ29wZXJhdG9yJywgdmFsdWU6IG9wZXJhdG9yLCBpbmRleDogdG9rZW5zLmxlbmd0aCB9KTtcclxuICAgICAgICBpKz1vcGVyYXRvci5sZW5ndGg7XHJcbiAgICAgICAgaWYgKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udmFsdWUgPT09ICdzcXJ0JyAmJiBtYXRoW2ldID09PSAnWycgJiYgaSA8IG1hdGgubGVuZ3RoIC0gMikge1xyXG4gICAgICAgICAgICBsZXQgdGVtcD1tYXRoLnNsaWNlKGksaSsxK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bXFxdXS8pKTtcclxuICAgICAgICAgICAgaSs9dGVtcC5sZW5ndGhcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0b2tlbnNbdG9rZW5zLmxlbmd0aC0xXSx7c3BlY2lhbENoYXI6IHNhZmVUb051bWJlcih0ZW1wKSx9KVxyXG4gICAgICAgIH1cclxuICAgICAgICBpLS07XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICBsZXQgbWF0Y2ggPSBtYXRoLnNsaWNlKGkpLm1hdGNoKC9eKFswLTkuXSspKFthLXpBLVpdPykvKTtcclxuICAgIGlmIChtYXRjaCYmIW1hdGNoWzJdKVxyXG4gICAge1xyXG4gICAgICAgIG51bWJlcj1tYXRjaFswXVxyXG4gICAgICAgIGkrPW51bWJlci5sZW5ndGg+MT9udW1iZXIubGVuZ3RoLTE6MDtcclxuICAgICAgICBpZigvWystXS8udGVzdChtYXRoW3N0YXJ0UG9zLTFdKSl7bnVtYmVyPW1hdGhbc3RhcnRQb3MtMV0rbnVtYmVyfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtYXRoW2krMV0mJi9bYS16QS1aXS8udGVzdChtYXRoW2krMV0pKXtjb250aW51ZTt9XHJcbiAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAnbnVtYmVyJywgdmFsdWU6IHBhcnNlRmxvYXQobnVtYmVyKSwgaW5kZXg6IHRva2Vucy5sZW5ndGg/dG9rZW5zLmxlbmd0aDowIH0pO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoL1thLXpBLVpdLy50ZXN0KG1hdGhbaV0pKSB7XHJcbiAgICAgICAgdmFyaT0gKG1hdGguc2xpY2UoaSkubWF0Y2goL1thLXpBLVpdKyhfXFwoW2EtekEtWjAtOV0qXFwpKSovKSB8fCBbXCJcIl0pWzBdO1xyXG4gICAgICAgIGlmICh2YXJpJiZ2YXJpLmxlbmd0aD09PTApe3Zhcmk9bWF0aC5zbGljZShpLG1hdGgubGVuZ3RoKX1cclxuICAgICAgICBudW1iZXI9bWF0aC5zbGljZShpK3ZhcmkubGVuZ3RoLHZhcmkubGVuZ3RoK2krbWF0aC5zbGljZShpK3ZhcmkubGVuZ3RoKS5zZWFyY2goL1teMC05XS8pKVxyXG4gICAgICAgIFxyXG4gICAgICAgIGkrPXZhcmkubGVuZ3RoK251bWJlci5sZW5ndGgtMTtcclxuICAgICAgICBudW1iZXI9c2FmZVRvTnVtYmVyKG51bWJlci5sZW5ndGg+MD9udW1iZXI6MSk7XHJcbiAgICAgICAgaWYgKC9bMC05XS8udGVzdChtYXRoW3N0YXJ0UG9zPjA/c3RhcnRQb3MtMTowXSkmJnRva2VucylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG51bWJlcj0obWF0aC5zbGljZSgwLHN0YXJ0UG9zKS5tYXRjaCgvWzAtOS5dKyg/PVteMC05Ll0qJCkvKXx8IFtcIlwiXSlbMF07XHJcbiAgICAgICAgICAgIG51bWJlcj1tYXRoW3N0YXJ0UG9zLW51bWJlci5sZW5ndGgtMV0mJm1hdGhbc3RhcnRQb3MtbnVtYmVyLmxlbmd0aC0xXT09PSctJz8nLScrbnVtYmVyOm51bWJlcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZigvWy1dLy50ZXN0KG1hdGhbc3RhcnRQb3MtMV0pKXtudW1iZXI9bWF0aFtzdGFydFBvcy0xXStudW1iZXJ9XHJcbiAgICAgICAgdG9rZW5zLnB1c2goe3R5cGU6ICd2YXJpYWJsZScsdmFyaWFibGU6IHZhcmkucmVwbGFjZSgnKCcsJ3snKS5yZXBsYWNlKCcpJywnfScpLHZhbHVlOiBzYWZlVG9OdW1iZXIobnVtYmVyKSwgaW5kZXg6IHRva2Vucy5sZW5ndGh9KTtcclxuICAgICAgICBcclxuICAgICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGlmICgvW1xcKlxcL1xcXj1dLy50ZXN0KG1hdGhbaV0pfHwoIS9bYS16QS1aMC05XS8udGVzdChtYXRoW2krMV0pJiYvWystXS8udGVzdChtYXRoW2ldKSkpIHtcclxuICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6ICdvcGVyYXRvcicsIHZhbHVlOiBtYXRoW2ldLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICBpZiAoL1srLV0vLnRlc3QobWF0aFtpXSkpe2NvbnRpbnVlO31cclxuICAgIC8vdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGNoYXIgXFxcIiR7bWF0aFtpXX1cXFwiYCk7XHJcbn1cclxuXHJcbmlmIChicmFja2V0cyE9PTApXHJcbntcclxuICAgIHRocm93IG5ldyBFcnJvciAoJ1VubWF0Y2hlZCBvcGVuaW5nIGJyYWNrZXQocyknKVxyXG59XHJcbmFkZERlYnVnSW5mbygnVG9rZW5zIGFmdGVyIHRva2VuaXplJywgdG9rZW5zKTtcclxuXHJcbmZ1bmN0aW9uIHNhZmVUb051bWJlcih2YWx1ZSkge1xyXG4gICAgaWYgKCF0eXBlb2YgdmFsdWUgPT09IGB0cmluZ2Ape3JldHVybiB2YWx1ZX1cclxuICAgIGlmICh2YWx1ZT09PScrJyl7cmV0dXJuIDB9XHJcbiAgICBpZiAodmFsdWU9PT0nLScpe3JldHVybiAtMX1cclxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QodmFsdWUpKXtyZXR1cm4gMX1cclxuICAgIGlmKC9bXFwoXFxbXS8udGVzdCh2YWx1ZVswXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMSl9XHJcbiAgICBpZigvW1xcKVxcXV0vLnRlc3QodmFsdWVbdmFsdWUubGVuZ3RoLTFdKSl7dmFsdWUgPSB2YWx1ZS5zbGljZSgwLHZhbHVlLmxlbmd0aC0xKX1cclxuICAgIGZvciAobGV0IGkgPSAwOyBpID4wOyBpKyspIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldID09PSAnc3RyaW5nJyAmJiAvW1xcKFxcKVxcW1xcXV0vLnRlc3QodmFsdWVbaV0pKSB7XHJcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc2xpY2UoMCwgaSkgKyB2YWx1ZS5zbGljZShpICsgMSk7XHJcbiAgICAgICAgICAgIGktLTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbmNvbnN0IG51bSA9IE51bWJlcih2YWx1ZSk7XHJcbnJldHVybiBpc05hTihudW0pID8gdmFsdWUubGVuZ3RoPjA/dmFsdWU6MCA6IG51bTtcclxufVxyXG5cclxuZnVuY3Rpb24gaW50SUQocGFydElELCBpbnQpIHtcclxuICAgIGxldCBbYmFzZUlELCBzdWJJRCA9IDBdID0gcGFydElELnNwbGl0KCcuJykubWFwKE51bWJlcik7XHJcbiAgICBsZXQgW2Jhc2VJTiwgc3ViSU4gPSAwXSA9IFN0cmluZyhpbnQpLnNwbGl0KCcuJykubWFwKE51bWJlcik7XHJcbiAgICByZXR1cm4gYCR7YmFzZUlEICsgYmFzZUlOfS4ke3N1YklEICsgc3ViSU59YDtcclxufVxyXG5cclxuZnVuY3Rpb24gb3BlcmF0aW9uc09yZGVyKHRva2Vucykge1xyXG4gICAgZnVuY3Rpb24gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4sIGVuZCwgdG9rZW5zLCByZWdleCkge1xyXG4gICAgICAgIHdoaWxlIChiZWdpbiA8IGVuZCAmJiBiZWdpbiA8IHRva2Vucy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgbGV0IGluZGV4O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHJlZ2V4KSB7XHJcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gJ29wZXJhdG9yJyAmJiByZWdleC50ZXN0KHRva2VuLnZhbHVlKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRva2Vucy5zbGljZShiZWdpbiwgZW5kKS5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gJ29wZXJhdG9yJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm4gLTE7XHJcbiAgICBcclxuICAgICAgICAgICAgaW5kZXggKz0gYmVnaW47XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKCEvWystXS8udGVzdCh0b2tlbnNbaW5kZXhdLnZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbmRleCA+IDAgJiYgaW5kZXggPCB0b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09IHRva2Vuc1tpbmRleCArIDFdLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYmVnaW4gPSBpbmRleCArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiAtMTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYmVnaW4gPSAwLCBlbmQgPSB0b2tlbnMubGVuZ3RoO1xyXG4gICAgbGV0IGN1cnJlbnRJRCA9IG51bGw7ICBcclxuICAgIGxldCBjaGVja2VkSURzID0gW107ICBcclxuICAgIGxldCBvcGVyYXRvckZvdW5kID0gZmFsc2U7XHJcbiAgICBsZXQgdGVtcCA9IHRva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udHlwZSA9PT0gJ29wZXJhdG9yJyAmJiB0b2tlbi52YWx1ZSA9PT0gJy8nKTtcclxuICAgIGlmICh0ZW1wID49IDApIHtyZXR1cm4gdGVtcDt9XHJcbiAgICAvLyBGaW5kIHRoZSBpbm5lcm1vc3QgcGFyZW50aGVzZXNcclxuICAgIHdoaWxlICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcoJyAmJiAhY2hlY2tlZElEcy5pbmNsdWRlcyh0b2tlbnNbaV0uaWQpKSB7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50SUQgPSB0b2tlbnNbaV0uaWQ7ICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnKCcgJiYgdG9rZW5zW2ldLmlkID09PSBjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgICAgIGJlZ2luID0gaTsgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcpJyAmJiB0b2tlbnNbaV0uaWQgPT09IGN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICAgICAgZW5kID0gaTsgIFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSWYgbm8gbW9yZSBwYXJlbnRoZXNlcyBhcmUgZm91bmQsIHByb2Nlc3MgdGhlIHdob2xlIGV4cHJlc3Npb25cclxuICAgICAgICBpZiAoIWN1cnJlbnRJRCkge1xyXG4gICAgICAgICAgICBiZWdpbiA9IDA7XHJcbiAgICAgICAgICAgIGVuZCA9IHRva2Vucy5sZW5ndGg7XHJcbiAgICAgICAgICAgIG9wZXJhdG9yRm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgb3BlcmF0b3JGb3VuZCA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLGVuZCx0b2tlbnMpIT09LTE7XHJcblxyXG4gICAgICAgIC8vIElmIG5vIG9wZXJhdG9yIGlzIGZvdW5kLCBtYXJrIHRoaXMgcGFyZW50aGVzZXMgcGFpciBhcyBjaGVja2VkXHJcbiAgICAgICAgaWYgKCFvcGVyYXRvckZvdW5kKSB7XHJcbiAgICAgICAgICAgIGNoZWNrZWRJRHMucHVzaChjdXJyZW50SUQpOyAgXHJcbiAgICAgICAgICAgIGN1cnJlbnRJRCA9IG51bGw7ICBcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRva2VuU2xpY2U9dG9rZW5zLnNsaWNlKGJlZ2luICwgZW5kKVxyXG4gICAgLy8gRmluZCBpbmRpY2VzIGJhc2VkIG9uIG9wZXJhdG9yIHByZWNlZGVuY2VcclxuICAgIGxldCBwcmlvcml0eTEgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsLyhcXF58c3FydCkvKTtcclxuICAgIGxldCBwcmlvcml0eTIgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oZnJhY3xiaW5vbXxzaW58Y29zfHRhbnxhc2lufGFjb3N8YXRhbikvKTtcclxuICAgIGxldCBwcmlvcml0eTMgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC8oXFwqfFxcLykvKTtcclxuICAgIGxldCBwcmlvcml0eTQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbiAsIGVuZCx0b2tlbnMsIC9bKy1dLyk7XHJcbiAgICBsZXQgcHJpb3JpdHk1ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvPS8pO1xyXG4gICAgXHJcbiAgICByZXR1cm4gW3ByaW9yaXR5MSwgcHJpb3JpdHkyLCBwcmlvcml0eTMsIHByaW9yaXR5NCwgcHJpb3JpdHk1XS5maW5kKGluZGV4ID0+IGluZGV4ICE9PSAtMSk/P251bGw7XHJcbiAgICBcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VMZWZ0KHRva2VucywgaW5kZXgpIHtcclxuICAgIGxldCBicmVha0NoYXIgPSBpbmRleCwgbGVmdDtcclxuXHJcbiAgICBpZiAoaW5kZXggPD0gMCB8fCAhdG9rZW5zW2luZGV4IC0gMV0pIHtcclxuICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgbm8gdG9rZW5zIHRvIHRoZSBsZWZ0XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRva2Vuc1tpbmRleCAtIDFdLnR5cGUgPT09ICdwYXJlbicpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBtYXRjaGluZyBvcGVuIHBhcmVudGhlc2lzXHJcbiAgICAgICAgYnJlYWtDaGFyID0gdG9rZW5zLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi5pZCA9PT0gdG9rZW5zW2luZGV4IC0gMV0uaWQpO1xyXG4gICAgICAgIC8vIEV4dHJhY3QgdGhlIHJlbGV2YW50IHRva2VuIHdpdGhpbiB0aGUgcGFyZW50aGVzZXNcclxuICAgICAgICBsZWZ0ID0gdG9rZW5zLnNsaWNlKGJyZWFrQ2hhciwgaW5kZXgpLmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbGVmdCA9IHRva2Vuc1tpbmRleCAtIDFdO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghbGVmdCkge1xyXG4gICAgICAgIHJldHVybiBudWxsOyAvLyBJZiBubyB2YWxpZCBsZWZ0IHRva2VuIGlzIGZvdW5kLCByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogbGVmdC5wb3c/ICdwb3dlclZhcmlhYmxlJzpsZWZ0LnZhcmlhYmxlPyAndmFyaWFibGUnOiAnbnVtYmVyJyxcclxuICAgICAgICB2YXJpYWJsZTogbGVmdC52YXJpYWJsZSxcclxuICAgICAgICB2YWx1ZTogc2FmZVRvTnVtYmVyKGxlZnQudmFsdWUpLFxyXG4gICAgICAgIHBvdzogbGVmdC5wb3csXHJcbiAgICAgICAgbXVsdGlTdGVwOiBpbmRleCAtIGJyZWFrQ2hhciA+PSA0LFxyXG4gICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyICE9PSBpbmRleCA/IGJyZWFrQ2hhciA6IGxlZnQuaW5kZXgsXHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpIHtcclxuICAgIGxldCBicmVha0NoYXIgPSBpbmRleCwgcmlnaHQ7XHJcblxyXG4gICAgaWYgKGluZGV4ID49IHRva2Vucy5sZW5ndGggLSAxIHx8ICF0b2tlbnNbaW5kZXggKyAxXSkge1xyXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBubyB0b2tlbnMgdG8gdGhlIHJpZ2h0XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBpZiAodG9rZW5zW2luZGV4ICsgMV0udHlwZSA9PT0gJ3BhcmVuJykge1xyXG4gICAgICAgIGJyZWFrQ2hhciA9IHRva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaWR4KSA9PiBpZHggPiBpbmRleCAmJiB0b2tlbi5pZCA9PT0gdG9rZW5zW2luZGV4ICsgMV0uaWQpO1xyXG4gICAgICAgIHJpZ2h0ID0gdG9rZW5zLnNsaWNlKGluZGV4LCBicmVha0NoYXIpLmZpbmQoaXRlbSA9PiAvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdChpdGVtLnR5cGUpKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByaWdodCA9IHRva2Vuc1tpbmRleCArIDFdO1xyXG4gICAgfVxyXG4gICAgaWYgKCFyaWdodCkge1xyXG4gICAgICAgIHJldHVybiBudWxsOyBcclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogcmlnaHQucG93PyAncG93ZXJWYXJpYWJsZSc6cmlnaHQudmFyaWFibGU/ICd2YXJpYWJsZSc6ICdudW1iZXInLFxyXG4gICAgICAgIHZhcmlhYmxlOiByaWdodC52YXJpYWJsZSxcclxuICAgICAgICB2YWx1ZTogc2FmZVRvTnVtYmVyKHJpZ2h0LnZhbHVlKSxcclxuICAgICAgICBwb3c6IHJpZ2h0LnBvdyxcclxuICAgICAgICBtdWx0aVN0ZXA6IGJyZWFrQ2hhciAtIGluZGV4ID49IDQsXHJcbiAgICAgICAgYnJlYWtDaGFyOiBicmVha0NoYXIgIT09IGluZGV4ID8gYnJlYWtDaGFyICsgMSA6IHJpZ2h0LmluZGV4ICsgMSxcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBvc2l0aW9uKHRva2VucyxpbmRleCkge1xyXG4gICAgbGV0IGxlZnRPYmogPSBudWxsLCByaWdodE9iaiA9IG51bGwsdHJhbnNpdGlvbj1pbmRleDtcclxuICAgIGluZGV4PWluZGV4PT09bnVsbD9vcGVyYXRpb25zT3JkZXIodG9rZW5zKTppbmRleDtcclxuXHJcbiAgICBpZiAoaW5kZXggPT09IG51bGwgfHwgaW5kZXggPT09IHRva2Vucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7IFxyXG4gICAgfVxyXG5cclxuICAgIHN3aXRjaCAodG9rZW5zW2luZGV4XS52YWx1ZSkge1xyXG4gICAgICAgIGNhc2UgJ14nOlxyXG4gICAgICAgIGNhc2UgJysnOlxyXG4gICAgICAgIGNhc2UgJy0nOlxyXG4gICAgICAgIGNhc2UgJyonOlxyXG4gICAgICAgIGNhc2UgJy8nOlxyXG4gICAgICAgIGNhc2UgJz0nOlxyXG4gICAgICAgICAgICBsZWZ0T2JqID0gcGFyc2VMZWZ0KHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgICByaWdodE9iaiA9IHBhcnNlUmlnaHQodG9rZW5zLCBpbmRleCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ3NxcnQnOlxyXG4gICAgICAgIGNhc2UgJ3Npbic6XHJcbiAgICAgICAgY2FzZSAnY29zJzpcclxuICAgICAgICBjYXNlICd0YW4nOlxyXG4gICAgICAgIGNhc2UgJ2FzaW4nOlxyXG4gICAgICAgIGNhc2UgJ2Fjb3MnOlxyXG4gICAgICAgIGNhc2UgJ2F0YW4nOlxyXG4gICAgICAgIGNhc2UgJ2FyY3Npbic6XHJcbiAgICAgICAgY2FzZSAnYXJjY29zJzpcclxuICAgICAgICBjYXNlICdhcmN0YW4nOlxyXG4gICAgICAgICAgICBsZWZ0T2JqID0gaW5kZXg7XHJcbiAgICAgICAgICAgIHJpZ2h0T2JqID0gcGFyc2VSaWdodCh0b2tlbnMsIGluZGV4KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnZnJhYyc6XHJcbiAgICAgICAgY2FzZSAnYmlub20nOlxyXG4gICAgICAgICAgICBsZWZ0T2JqID0gcGFyc2VSaWdodCh0b2tlbnMsIGluZGV4KTtcclxuICAgICAgICAgICAgdHJhbnNpdGlvbj1sZWZ0T2JqLmJyZWFrQ2hhclxyXG4gICAgICAgICAgICByaWdodE9iaiA9IHBhcnNlUmlnaHQodG9rZW5zLCB0cmFuc2l0aW9uKTtcclxuICAgICAgICAgICAgbGVmdE9iai5icmVha0NoYXIgPSBpbmRleDtcclxuICAgICAgICAgICAgcmlnaHRPYmouYnJlYWtDaGFyICs9IDE7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsOyBcclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgb3BlcmF0b3I6IHRva2Vuc1tpbmRleF0udmFsdWUsXHJcbiAgICAgICAgaW5kZXg6IGluZGV4LFxyXG4gICAgICAgIHRyYW5zaXRpb246IHRyYW5zaXRpb24sXHJcbiAgICAgICAgc3BlY2lhbENoYXI6IHRva2Vuc1tpbmRleF0uc3BlY2lhbENoYXIgPyB0b2tlbnNbaW5kZXhdLnNwZWNpYWxDaGFyIDogbnVsbCxcclxuICAgICAgICAuLi4odHlwZW9mIGxlZnRPYmogPT09ICdvYmplY3QnXHJcbiAgICAgICAgICAgID8geyBsZWZ0OiBsZWZ0T2JqLnZhbHVlLCBsZWZ0VHlwZTogbGVmdE9iai50eXBlLGxlZnRWYXJpYWJsZTogbGVmdE9iai52YXJpYWJsZSwgbGVmdFBvdzogbGVmdE9iai5wb3csIGxlZnRNdWx0aVN0ZXA6IGxlZnRPYmoubXVsdGlTdGVwLCBsZWZ0QnJlYWs6IGxlZnRPYmouYnJlYWtDaGFyIH1cclxuICAgICAgICAgICAgOiB7IGxlZnQ6IG51bGwsIGxlZnRCcmVhazogbGVmdE9iaiB9KSxcclxuICAgICAgICAuLi5yaWdodE9iaiAmJiB7IHJpZ2h0OiByaWdodE9iai52YWx1ZSwgcmlnaHRUeXBlOiByaWdodE9iai50eXBlLCByaWdodFZhcmlhYmxlOiByaWdodE9iai52YXJpYWJsZSwgcmlnaHRQb3c6IHJpZ2h0T2JqLnBvdywgcmlnaHRNdWx0aVN0ZXA6IHJpZ2h0T2JqLm11bHRpU3RlcCwgcmlnaHRCcmVhazogcmlnaHRPYmouYnJlYWtDaGFyIH0sXHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZSh0b2tlbnMsb3BlcmF0b3Isc3BlY2lhbENoYXIsIGxlZnQsIGxlZnRWYXIsIHJpZ2h0LCByaWdodFZhcixyaWdodFBvdykge1xyXG4gICAgaWYgKHR5cGVvZiBvcGVyYXRvcj09PSdzdHJpbmcnJiZ0eXBlb2YgcmlnaHQhPT1gbnVtYmVyYCYmIS8oc3FydHxjb3N8c2lufHRhbikvLnRlc3Qob3BlcmF0b3IpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBMZWZ0IHNpZGUgb2YgYCtvcGVyYXRvcitgIG11c3QgaGF2ZSBhIHZhbHVlYCk7XHJcbiAgICB9XHJcbiAgICBpZiAodHlwZW9mIG9wZXJhdG9yPT09J3N0cmluZycmJnR5cGVvZiByaWdodCE9PWBudW1iZXJgKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSaWdodCBzaWRlIG9mIGArb3BlcmF0b3IrYCBtdXN0IGhhdmUgYSB2YWx1ZWApO1xyXG4gICAgfVxyXG4gICAgLy9jb25zdCByZWFkeUZvckZpbmFsUHJhaXNpbmcgPSB0b2tlbnMuZXZlcnkodG9rZW4gPT4gIS8ob3BlcmF0b3IpLy50ZXN0KHRva2VuLnR5cGUpfHwvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSk7XHJcbiAgICAvL2NvbnN0IGFsbE51bWJlcnMgPSB0b2tlbnMuZXZlcnkodG9rZW4gPT4gLyhudW1iZXIpLy50ZXN0KHRva2VuLnR5cGUpfHwvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSk7XHJcbiAgICBjb25zdCBhcmVUaGVyZU9wZXJhdG9ycz10b2tlbnMuc29tZSh0b2tlbj0+LyhvcGVyYXRvcikvLnRlc3QodG9rZW4udHlwZSkmJiEvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSlcclxuICAgIC8vKHJlYWR5Rm9yRmluYWxQcmFpc2luZyYmIWFsbE51bWJlcnMpXHJcbiAgICAvL2FkZERlYnVnSW5mbyhhcmVUaGVyZU9wZXJhdG9ycylcclxuICAgIGlmICghYXJlVGhlcmVPcGVyYXRvcnMpXHJcbiAgICB7XHJcbiAgICAgICAgdG9rZW5zPXNpbXBsaWZpeSh0b2tlbnMpXHJcbiAgICAgICAgYWRkRGVidWdJbmZvKGBzaW1wbGlmaXkodG9rZW5zKWAsdG9rZW5zKVxyXG4gICAgICAgIGNvbnN0IG51bWJlckluZGV4PSAodG9rZW5zLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSA9PT0gXCJudW1iZXJcIikpO1xyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlSW5kZXg9ICh0b2tlbnMuZmlsdGVyKGl0ZW0gPT4gaXRlbS50eXBlID09PSBcInZhcmlhYmxlXCIpKTtcclxuICAgICAgICBjb25zdCBwb3dJbmRleCA9IHRva2Vucy5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgPT09IFwicG93ZXJWYXJpYWJsZVwiKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MSYmcG93SW5kZXhbMF0ucG93PT09MilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBxdWFkKFxyXG4gICAgICAgICAgICAgICAgcG93SW5kZXhbMF0gPyBwb3dJbmRleFswXS52YWx1ZSAgOiAwLFxyXG4gICAgICAgICAgICAgICAgdmFyaWFibGVJbmRleFswXSA/IHZhcmlhYmxlSW5kZXhbMF0udmFsdWUgOiAwLFxyXG4gICAgICAgICAgICAgICAgbnVtYmVySW5kZXhbMF0gPyBudW1iZXJJbmRleFswXS52YWx1ZSAqIC0xOiAwLFxyXG4gICAgICAgICAgICAgICAgcG93SW5kZXhbMF0udmFyaWFibGUsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwb3dJbmRleC5sZW5ndGg9PT0wJiZ2YXJpYWJsZUluZGV4Lmxlbmd0aCE9PTAmJm51bWJlckluZGV4IT09MClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFkZERlYnVnSW5mbyhgJHt2YXJpYWJsZUluZGV4WzBdLnZhcmlhYmxlfSA9IFxcXFxmcmFjeyR7bnVtYmVySW5kZXhbMF0udmFsdWV9fXske3ZhcmlhYmxlSW5kZXhbMF0udmFsdWV9fSA9ICR7KG51bWJlckluZGV4WzBdLnZhbHVlKS8odmFyaWFibGVJbmRleFswXS52YWx1ZSl9YClcclxuICAgICAgICAgICAgc29sdXRpb25JbmZvLnB1c2goYCR7dmFyaWFibGVJbmRleFswXS52YXJpYWJsZX0gPSBcXFxcZnJhY3ske251bWJlckluZGV4WzBdLnZhbHVlfX17JHt2YXJpYWJsZUluZGV4WzBdLnZhbHVlfX0gPSAkeyhudW1iZXJJbmRleFswXS52YWx1ZSkvKHZhcmlhYmxlSW5kZXhbMF0udmFsdWUpfWApXHJcbiAgICAgICAgICAgIHJldHVybiBgJHt2YXJpYWJsZUluZGV4WzBdLnZhcmlhYmxlfSA9ICR7KG51bWJlckluZGV4WzBdLnZhbHVlKS8odmFyaWFibGVJbmRleFswXS52YWx1ZSl9YFxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmKHRva2Vucy5sZW5ndGg9PT0xJiZudW1iZXJJbmRleCl7XHJcbiAgICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShudW1iZXJJbmRleC52YWx1ZT09PTApXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgbGV0IHNvbHZlZD17dmFsdWU6IDAsdmFyaWFibGU6ICcnLHBvdzogJyd9O1xyXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xyXG4gICAgICAgIGNhc2UgJ3NxcnQnOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhyaWdodCxzcGVjaWFsQ2hhciE9PW51bGw/KDEpLyhzcGVjaWFsQ2hhcik6MC41KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnXic6XHJcbiAgICAgICAgICAgIGlmIChsZWZ0VmFyfHxyaWdodFZhcilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgc29sdmVkLnZhcmlhYmxlPWxlZnRWYXJ8fGxlZnRWYXI9PT1yaWdodFZhcj9sZWZ0VmFyOnJpZ2h0VmFyP3JpZ2h0VmFyOicnO1xyXG4gICAgICAgICAgICAgICAgc29sdmVkLnBvdz1yaWdodFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IE1hdGgucG93KGxlZnQscmlnaHQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICdmcmFjJzpcclxuICAgICAgICBjYXNlICcvJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKGxlZnQpLyhyaWdodCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJyonOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0ICogcmlnaHQ7XHJcbiAgICAgICAgICAgIGlmIChsZWZ0VmFyJiYhcmlnaHRWYXIpe3NvbHZlZC52YXJpYWJsZT1sZWZ0VmFyfVxyXG4gICAgICAgICAgICBlbHNlIGlmICghbGVmdFZhciYmcmlnaHRWYXIpe3NvbHZlZC52YXJpYWJsZT1yaWdodFZhcn1cclxuICAgICAgICAgICAgZWxzZSBpZiAobGVmdFZhciYmcmlnaHRWYXIpe3NvbHZlZC52YXJpYWJsZT1yaWdodFZhcjtzb2x2ZWQucG93PTJ9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJysnOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0ICsgcmlnaHQ7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0VmFyP2xlZnRWYXI6cmlnaHRWYXI7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJy0nOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0IC0gcmlnaHQ7XHJcbiAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0VmFyP2xlZnRWYXI6cmlnaHRWYXI7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ2Jpbm9tJzpcclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc05hTihsZWZ0KSB8fCBOdW1iZXIuaXNOYU4ocmlnaHQpIHx8IGxlZnQgPCAwIHx8IHJpZ2h0IDwgMCkge3JldHVybiBudWxsO31cclxuICAgICAgICAgICAgaWYgKHJpZ2h0ID4gbGVmdCkge3NvbHZlZC52YWx1ZSA9IDA7YnJlYWs7fVxyXG4gICAgICAgICAgICBpZiAocmlnaHQgPT09IDAgfHwgcmlnaHQgPT09IGxlZnQpIHtzb2x2ZWQudmFsdWUgPSAxO2JyZWFrO31cclxuICAgICAgICAgICAgaWYgKHJpZ2h0ID09PSAxIHx8IHJpZ2h0ID09PSBsZWZ0IC0gMSkge3NvbHZlZC52YWx1ZSA9IGxlZnQ7YnJlYWs7fVxyXG4gICAgICAgICAgICBsZXQgayA9IHJpZ2h0ID4gbGVmdCAtIHJpZ2h0ID8gbGVmdCAtIHJpZ2h0IDogcmlnaHQ7XHJcbiAgICAgICAgICAgIGxldCByZXMgPSAxO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBrOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIHJlcyA9IChyZXMgKiAobGVmdCAtIGkgKyAxKSkgLyBpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IHJlcztcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnc2luJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGguc2luKHJpZ2h0Kk1hdGguUEkgLyAxODApKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnY29zJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGguY29zKHJpZ2h0Kk1hdGguUEkgLyAxODApKVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICd0YW4nOlxyXG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoJ3RhbiBNdXN0IGJlIHNtYWxsZXIgdGhhbiA5MCcpO31cclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKHJpZ2h0Kk1hdGguUEkgLyAxODApKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnYXNpbic6XHJcbiAgICAgICAgY2FzZSAnYXJjc2luJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGguYXNpbihyaWdodCkgKiAoMTgwIC8gTWF0aC5QSSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICdhY29zJzpcclxuICAgICAgICBjYXNlICdhcmNjb3MnOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC5hY29zKHJpZ2h0KSAqICgxODAgLyBNYXRoLlBJKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ2F0YW4nOlxyXG4gICAgICAgIGNhc2UgJ2FyY3Rhbic6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLmF0YW4ocmlnaHQpICogKDE4MCAvIE1hdGguUEkpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxyXG4gICAgfVxyXG4gICAgLy9hZGREZWJ1Z0luZm8oc29sdmVkLnZhbHVlLHNvbHZlZC52YXJpYWJsZSlcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogc29sdmVkLnBvdz8gJ3Bvd2VyVmFyaWFibGUnOnNvbHZlZC52YXJpYWJsZT8gJ3ZhcmlhYmxlJzogJ251bWJlcicsXHJcbiAgICAgICAgdmFsdWU6IHR5cGVvZiBzb2x2ZWQudmFsdWUgPT09ICdudW1iZXInID8gTWF0aC5yb3VuZChzb2x2ZWQudmFsdWUgKiAxMDAwMDApIC8gMTAwMDAwIDogc29sdmVkLnZhbHVlLCBcclxuICAgICAgICB2YXJpYWJsZTogc29sdmVkLnZhcmlhYmxlP3NvbHZlZC52YXJpYWJsZTonJyxcclxuICAgICAgICBwb3c6IHNvbHZlZC5wb3c/c29sdmVkLnBvdzonJyxcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbnRyb2xsZXIodG9rZW5zKSB7XHJcbiAgICBcclxuICAgIGlmICghcHJvY2Vzc2VkaW5wdXQpe3Byb2Nlc3NlZGlucHV0PXJlY29uc3RydWN0KHRva2Vucyk7fVxyXG4gICAgdG9rZW5zPWNvbm5lY3QodG9rZW5zKTtcclxuICAgIG1hdGg9cmVjb25zdHJ1Y3QodG9rZW5zKTtcclxuICAgIGFkZERlYnVnSW5mbygnLy9tYXRoJywgbWF0aCk7IG1hdGhJbmZvLnB1c2gobWF0aCk7XHJcbiAgICBpZiAoXHJcbiAgICAgICAgQXJyYXkuaXNBcnJheSh0b2tlbnMpIFxyXG4gICAgICAgICYmIHRva2Vucy5zb21lKHRva2VuID0+IC8odmFyaWFibGV8cG93VmFyaWFibGUpLy50ZXN0KHRva2VuLnR5cGUpKSBcclxuICAgICAgICAmJiAhdG9rZW5zLnNvbWUodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09ICc9JylcclxuICAgICkgXHJcbiAgICB7cmV0dXJuIEluZmluaXR5fVxyXG5cclxuICAgIGxldCBleHByZXNzaW9uID0gcG9zaXRpb24odG9rZW5zLG51bGwpOyBcclxuICAgIGFkZERlYnVnSW5mbygnUGFyc2VkIGV4cHJlc3Npb24nLCBKU09OLnN0cmluZ2lmeShleHByZXNzaW9uLCBudWxsLCAwLjAxKSk7XHJcbiAgICBpZiAoZXhwcmVzc2lvbiA9PT0gbnVsbCYmdG9rZW5zLmxlbmd0aD4xKXtcclxuICAgICAgICBhZGREZWJ1Z0luZm8oYHBhcnNlKHRva2VucylgLHBhcnNlKHRva2VucykpXHJcbiAgICAgICAgcmV0dXJuIGBkYFxyXG4gICAgICAgLy8gcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChleHByZXNzaW9uID09PSBudWxsKXtcclxuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChwYXJzZUZsb2F0KHJlY29uc3RydWN0KHRva2VucykpICogMTAwMDApIC8gMTAwMDA7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICgvKGZyYWMpLy50ZXN0KGV4cHJlc3Npb24ub3BlcmF0b3IpJiYoZXhwcmVzc2lvbi5yaWdodFZhcmlhYmxlfHxleHByZXNzaW9uLmxlZnRWYXJpYWJsZSkpXHJcbiAgICB7XHJcbiAgICAgICAgLy9hZGREZWJ1Z0luZm8oZ29vZEJ5RnJhY3Rpb24odG9rZW5zLGV4cHJlc3Npb24pKVxyXG4gICAgICAgIHJldHVybiBjb250cm9sbGVyKGdvb2RCeUZyYWN0aW9uKHRva2VucyxleHByZXNzaW9uKSk7XHJcbiAgICB9XHJcbiAgICBpZiAoZXhwcmVzc2lvbi5yaWdodE11bHRpU3RlcHx8ZXhwcmVzc2lvbi5sZWZ0TXVsdGlTdGVwKVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBjb250cm9sbGVyKGV4cGFuZEV4cHJlc3Npb24odG9rZW5zLGV4cHJlc3Npb24pKVxyXG4gICAgfVxyXG4gICAgbGV0IHNvbHZlZCA9IHBhcnNlXHJcbiAgICAoXHJcbiAgICAgICAgdG9rZW5zLFxyXG4gICAgICAgIGV4cHJlc3Npb24ub3BlcmF0b3IsXHJcbiAgICAgICAgZXhwcmVzc2lvbi5zcGVjaWFsQ2hhcixcclxuICAgICAgICBleHByZXNzaW9uLmxlZnQgLFxyXG4gICAgICAgIGV4cHJlc3Npb24ubGVmdFZhcmlhYmxlICxcclxuICAgICAgICBleHByZXNzaW9uLnJpZ2h0LFxyXG4gICAgICAgIGV4cHJlc3Npb24ucmlnaHRWYXJpYWJsZSxcclxuICAgICAgICBleHByZXNzaW9uLnJpZ2h0UG93LFxyXG4gICAgKTtcclxuICAgIGlmIChzb2x2ZWQgPT09IG51bGwpIHtyZXR1cm4gbnVsbDsgfVxyXG4gICAgaWYgKHR5cGVvZiBzb2x2ZWQ9PT1gc3RyaW5nYCkge3JldHVybiBzb2x2ZWQ7ICB9XHJcbiAgICBhZGREZWJ1Z0luZm8oJ3NvbHZlZCcsc29sdmVkKVxyXG4gICAgYWRkRGVidWdJbmZvKCdzb2x2ZWQnLGFkZFNvbHV0aW9uKGV4cHJlc3Npb24sc29sdmVkKSlcclxuICAgIHNvbHV0aW9uSW5mby5wdXNoKGFkZFNvbHV0aW9uKGV4cHJlc3Npb24sc29sdmVkKSlcclxuICAgIC8vYWRkU29sdXRpb25JbmZvIChhZGRTb2x1dGlvbihleHByZXNzaW9uLHNvbHZlZCkrYFxcbmApXHJcbiAgICB0b2tlbnMuc3BsaWNlKGV4cHJlc3Npb24ubGVmdEJyZWFrLGV4cHJlc3Npb24ucmlnaHRCcmVhay1leHByZXNzaW9uLmxlZnRCcmVhayxzb2x2ZWQpXHJcbiAgICByZXR1cm4gdG9rZW5zLmxlbmd0aD4xP2NvbnRyb2xsZXIodG9rZW5zKTpyZWNvbnN0cnVjdCh0b2tlbnMpO1xyXG59XHJcbmZ1bmN0aW9uIGdvb2RCeUZyYWN0aW9uKHRva2VucywgZXhwcmVzc2lvbikge1xyXG4gICAgbGV0IHJlcGxhY2VtZW50VG9rZW5zID0gW107XHJcbiAgICBsZXQgZGVub21pbmF0b3IgPSB0b2tlbnMuc2xpY2UoZXhwcmVzc2lvbi50cmFuc2l0aW9uLCBleHByZXNzaW9uLnJpZ2h0QnJlYWspO1xyXG4gICAgXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG5cclxuICAgICAgICAvLyBTa2lwIHRva2VucyBpZiB3ZSBoYXZlIGFscmVhZHkgcHJvY2Vzc2VkIHRoaXMgc2VjdGlvblxyXG4gICAgICAgIGlmIChpID49IGV4cHJlc3Npb24uaW5kZXggJiYgaSA8IGV4cHJlc3Npb24ucmlnaHRCcmVhaykge1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudFRva2Vucy5wdXNoKC4uLnRva2Vucy5zbGljZShleHByZXNzaW9uLmluZGV4KzEsZXhwcmVzc2lvbi50cmFuc2l0aW9uKSlcclxuICAgICAgICAgICAgaSA9IGV4cHJlc3Npb24ucmlnaHRCcmVhay0xO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKC8oPSkvLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudFRva2Vucy5wdXNoKHRva2Vuc1tpXSk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsZXQgcmVwbGFjZW1lbnQgPSB0b2tlbnMuc2xpY2UoaSxpKzEpXHJcbiAgICAgICAgbGV0IHdoZXJlQW1JID0gaTtcclxuICAgICAgICBsZXQgcmVzdD1bXTtcclxuICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnZnJhYycpIHtcclxuICAgICAgICAgICAgd2hlcmVBbUkgPSBwb3NpdGlvbih0b2tlbnMsIGkpO1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudFRva2Vucy5wdXNoKC4uLnRva2Vucy5zbGljZSh3aGVyZUFtSS5pbmRleCx3aGVyZUFtSS5pbmRleCsyKSlcclxuICAgICAgICAgICAgcmVzdD10b2tlbnMuc2xpY2Uod2hlcmVBbUkudHJhbnNpdGlvbi0xLHdoZXJlQW1JLnJpZ2h0QnJlYWspXHJcbiAgICAgICAgICAgIHJlcGxhY2VtZW50ID0gdG9rZW5zLnNsaWNlKGkgKyAyLCB3aGVyZUFtSS50cmFuc2l0aW9uLTEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB3aGVyZUFtST1pK3Rva2Vucy5zbGljZShpKS5maW5kSW5kZXgodG9rZW4gPT4gLyg9fGZyYWMpLy50ZXN0KHRva2VuLnZhbHVlKSlcclxuICAgICAgICAgICAgd2hlcmVBbUk9d2hlcmVBbUk8aT90b2tlbnMubGVuZ3RoOndoZXJlQW1JO1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudCA9IHRva2Vucy5zbGljZShpLHdoZXJlQW1JKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVwbGFjZW1lbnRUb2tlbnMucHVzaChcclxuICAgICAgICAgICAgLi4uZGVub21pbmF0b3IsXHJcbiAgICAgICAgICAgIHtcInR5cGVcIjogXCJvcGVyYXRvclwiLCBcInZhbHVlXCI6IFwiKlwifSxcclxuICAgICAgICAgICAge1widHlwZVwiOiBcInBhcmVuXCIsIFwidmFsdWVcIjogXCIoXCIsIFwiaWRcIjogMCwgXCJpbmRleFwiOiAwfSxcclxuICAgICAgICAgICAgLi4ucmVwbGFjZW1lbnQsXHJcbiAgICAgICAgICAgIHtcInR5cGVcIjogXCJwYXJlblwiLCBcInZhbHVlXCI6IFwiKVwiLCBcImlkXCI6IDAsIFwiaW5kZXhcIjogMH0sXHJcbiAgICAgICAgICAgIC4uLnJlc3RcclxuICAgICAgICApO1xyXG4gICAgICAgIGkgPSB0eXBlb2Ygd2hlcmVBbUkgPT09ICdvYmplY3QnID8gd2hlcmVBbUkucmlnaHRCcmVhay0xIDogd2hlcmVBbUktMTtcclxuICAgIH1cclxuICAgIHJlcGxhY2VtZW50VG9rZW5zPWNvbm5lY3QocmVwbGFjZW1lbnRUb2tlbnMpXHJcbiAgICBhZGREZWJ1Z0luZm8oYGdvb2RCeUZyYWN0aW9uYCxyZWNvbnN0cnVjdChyZXBsYWNlbWVudFRva2VucykpXHJcbiAgICBzb2x1dGlvbkluZm8ucHVzaChyZWNvbnN0cnVjdChyZXBsYWNlbWVudFRva2VucykpXHJcbiAgICByZXR1cm4gcmVwbGFjZW1lbnRUb2tlbnM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlSURwYXJlbnRoZXNlcyh0b2tlbnMpIHtcclxuICAgIGxldCBicmFja2V0cyA9IDAsIGxldmVsQ291bnQgPSB7fTtcclxuICAgIFxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnKCcpIHtcclxuICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xyXG4gICAgICAgICAgICAgICAgbGV2ZWxDb3VudFticmFja2V0c10gPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XHJcbiAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxyXG4gICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgJy4nICsgSUQgfTtcclxuICAgICAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcpJykge1xyXG4gICAgICAgICAgICBicmFja2V0cy0tO1xyXG4gICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XHJcbiAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxyXG4gICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgJy4nICsgKElEID49IDAgPyBJRCA6IDApIH07XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB0b2tlbnM7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBleHBhbmRFeHByZXNzaW9uKHRva2VucywgZXhwcmVzc2lvbikge1xyXG4gICAgbGV0IGxlZnQgPSB0b2tlbnMuc2xpY2UoZXhwcmVzc2lvbi5sZWZ0QnJlYWssIGV4cHJlc3Npb24uaW5kZXgpLmZpbHRlcihpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpO1xyXG4gICAgbGV0IHJpZ2h0ID0gdG9rZW5zLnNsaWNlKGV4cHJlc3Npb24uaW5kZXgsIGV4cHJlc3Npb24ucmlnaHRCcmVhaykuZmlsdGVyKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSk7XHJcbiAgICBpZiAoZXhwcmVzc2lvbi5vcGVyYXRvcj09PSctJyYmZXhwYW5kRXhwcmVzc2lvbi5sZWZ0TXVsdGlTdGVwPT09dW5kZWZpbmVkKXtcclxuICAgICAgICBsZWZ0ID0gW3sgXCJ0eXBlXCI6IFwibnVtYmVyXCIsIFwidmFsdWVcIjogLTEsIFwiaW5kZXhcIjogMCB9XVxyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgbGV0IHJlcGxhY2VtZW50Q2VsbCA9IFtdO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZWZ0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCByaWdodC5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudENlbGwucHVzaChsZWZ0W2ldKTtcclxuICAgICAgICAgICAgcmVwbGFjZW1lbnRDZWxsLnB1c2goeyBcInR5cGVcIjogXCJvcGVyYXRvclwiLCBcInZhbHVlXCI6IFwiKlwiLCBcImluZGV4XCI6IDAgfSk7XHJcbiAgICAgICAgICAgIHJlcGxhY2VtZW50Q2VsbC5wdXNoKHJpZ2h0W2pdKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoZXhwcmVzc2lvbi5vcGVyYXRvcj09PSctJyYmZXhwYW5kRXhwcmVzc2lvbi5sZWZ0TXVsdGlTdGVwPT09dW5kZWZpbmVkKXtcclxuICAgICAgICB0b2tlbnMuc3BsaWNlKGV4cHJlc3Npb24uaW5kZXgsIGV4cHJlc3Npb24ucmlnaHRCcmVhayAtICBleHByZXNzaW9uLmluZGV4LCAuLi5yZXBsYWNlbWVudENlbGwpO1xyXG4gICAgfVxyXG4gICAgZWxzZXtcclxuICAgICAgICB0b2tlbnMuc3BsaWNlKGV4cHJlc3Npb24ubGVmdEJyZWFrLCBleHByZXNzaW9uLnJpZ2h0QnJlYWsgLSAgZXhwcmVzc2lvbi5sZWZ0QnJlYWssIC4uLnJlcGxhY2VtZW50Q2VsbCk7XHJcbiAgICB9XHJcbiAgICB0b2tlbnM9cmVvcmRlcih0b2tlbnMpXHJcbiAgICBhZGREZWJ1Z0luZm8oYGV4cGFuZEV4cHJlc3Npb25gLHJlY29uc3RydWN0KHRva2VucykpXHJcbiAgICBzb2x1dGlvbkluZm8ucHVzaChyZWNvbnN0cnVjdCh0b2tlbnMpKVxyXG4gICAgcmV0dXJuIHRva2VucztcclxufVxyXG5cclxuZnVuY3Rpb24gYWRkU29sdXRpb24oZXhwcmVzc2lvbixzb2x2ZWQpe1xyXG4gICAgbGV0IHNvbHV0aW9uPXJlY29uc3RydWN0KFtzb2x2ZWRdKTtcclxuICAgIGxldCBsZWZ0PWV4cHJlc3Npb24ubGVmdD9yZWNvbnN0cnVjdChbe3R5cGU6IGV4cHJlc3Npb24ubGVmdFR5cGUsIHZhbHVlOiBleHByZXNzaW9uLmxlZnQsIHZhcmlhYmxlOiBleHByZXNzaW9uLmxlZnRWYXJpYWJsZSwgcG93OiBleHByZXNzaW9uLmxlZnRQb3d9XSk6Jyc7XHJcbiAgICBsZXQgcmlnaHQ9dHlwZW9mIGV4cHJlc3Npb24ucmlnaHQ9PT0nbnVtYmVyJz9yZWNvbnN0cnVjdChbe3R5cGU6IGV4cHJlc3Npb24ucmlnaHRUeXBlLCB2YWx1ZTogZXhwcmVzc2lvbi5yaWdodCwgdmFyaWFibGU6IGV4cHJlc3Npb24ucmlnaHRWYXJpYWJsZSwgcG93OiBleHByZXNzaW9uLnJpZ2h0UG93fV0pOicnO1xyXG4gICAgc3dpdGNoIChleHByZXNzaW9uLm9wZXJhdG9yKXtcclxuICAgICAgICBjYXNlICdeJzpcclxuICAgICAgICAgICAgcmV0dXJuICBgJHtsZWZ0fSBeIHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICBjYXNlICcrJzpcclxuICAgICAgICBjYXNlICctJzpcclxuICAgICAgICBjYXNlICcqJzpcclxuICAgICAgICAgICAgcmV0dXJuICBgJHtsZWZ0fSAke2V4cHJlc3Npb24ub3BlcmF0b3IucmVwbGFjZSgvXFwqL2csIFwiXFxcXGNkb3RcIil9ICR7cmlnaHR9ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgY2FzZSAnPSc6XHJcbiAgICAgICAgICAgIHJldHVybiBgXFxcXGZyYWN7JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgY2FzZSAnc3FydCc6XHJcbiAgICAgICAgICAgIHJldHVybiAgYFxcXFwke2V4cHJlc3Npb24ub3BlcmF0b3J9eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgIGNhc2UgJ3Npbic6XHJcbiAgICAgICAgY2FzZSAnY29zJzpcclxuICAgICAgICBjYXNlICd0YW4nOlxyXG4gICAgICAgIGNhc2UgJ2FzaW4nOlxyXG4gICAgICAgIGNhc2UgJ2Fjb3MnOlxyXG4gICAgICAgIGNhc2UgJ2F0YW4nOlxyXG4gICAgICAgIGNhc2UgJ2FyY3Npbic6XHJcbiAgICAgICAgY2FzZSAnYXJjY29zJzpcclxuICAgICAgICBjYXNlICdhcmN0YW4nOlxyXG4gICAgICAgICAgICByZXR1cm4gIGBcXFxcJHtleHByZXNzaW9uLm9wZXJhdG9yfSAoJHtyaWdodH0pID0gJHtzb2x1dGlvbn1gXHJcbiAgICAgICAgY2FzZSAnYmlub20nOlxyXG4gICAgICAgIGNhc2UgJ2ZyYWMnOlxyXG4gICAgICAgIGNhc2UgJy8nOlxyXG4gICAgICAgICAgICByZXR1cm4gYFxcXFwke2V4cHJlc3Npb24ub3BlcmF0b3IucmVwbGFjZSgnLycsXCJmcmFjXCIpfXske2xlZnR9fXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsXHJcbn1cclxuZnVuY3Rpb24gY3VybHlCcmFja2V0c1ZhbGlkaXR5Q2hlY2soY2hlY2spe1xyXG4gICAgcmV0dXJuIC8oZnJhY3xzcXJ0fFxcXnxcXC98Ymlub20pLy50ZXN0KGNoZWNrKVxyXG59XHJcbmZ1bmN0aW9uIHJlY29uc3RydWN0KHRva2Vucyl7XHJcbiAgICBsZXQgbWF0aCA9ICcnO1xyXG4gICAgZm9yIChsZXQgaT0wO2k8dG9rZW5zLmxlbmd0aDtpKyspe1xyXG4gICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWU9PT0nKCcmJnRva2Vuc1t0b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW4sIGluZGV4KSA9PiB0b2tlbi5pZCA9PT0gdG9rZW5zW2ldLmlkJiZ0b2tlbnNbaW5kZXgrMV0pKzFdLnZhbHVlPT09Jy8nKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWF0aCs9J1xcXFxmcmFjJ1xyXG4gICAgICAgIH1cclxuICAgICAgICBzd2l0Y2ggKHRva2Vuc1tpXS50eXBlKXtcclxuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcclxuICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWU+PTAmJnRva2Vuc1tpLTFdJiYoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW5zW2ktMV0udHlwZSl8fHRva2Vuc1tpLTFdLnZhbHVlPT09JyknKT8nKyc6JycpK3Rva2Vuc1tpXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgIG1hdGgrPWkrMTx0b2tlbnMubGVuZ3RoJiYvKGZyYWMpLy50ZXN0KHRva2Vuc1tpKzFdLnZhbHVlKT8nKyc6Jyc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAncGFyZW4nOlxyXG4gICAgICAgICAgICAgICAgbGV0IHRlbXA9dG9rZW5zW3Rva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4uaWQgPT09IHRva2Vuc1tpXS5pZCktMV1cclxuICAgICAgICAgICAgICAgIGlmICgodHlwZW9mIHRlbXAgIT09IFwidW5kZWZpbmVkXCImJmN1cmx5QnJhY2tldHNWYWxpZGl0eUNoZWNrKHRlbXAudmFsdWUpKSlcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCdcXHsnKS5yZXBsYWNlKC9cXCkvLCdcXH0nKTticmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVvZiB0ZW1wICE9PSBcInVuZGVmaW5lZFwiJiYvXFwpLy50ZXN0KHRlbXAudmFsdWUpJiZjdXJseUJyYWNrZXRzVmFsaWRpdHlDaGVjayh0b2tlbnNbdG9rZW5zLmZpbmRJbmRleCh0b2tlbiA9PiB0b2tlbi5pZCA9PT0gdGVtcC5pZCktMV0udmFsdWUpKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXS52YWx1ZS5yZXBsYWNlKC9cXCgvLCdcXHsnKS5yZXBsYWNlKC9cXCkvLCdcXH0nKTticmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGk+MCYmdG9rZW5zW2ldLnZhbHVlPT09JygnJiZ0b2tlbnNbaS0xXT8udmFsdWU9PT0nKScpe21hdGgrPScrJ31cclxuICAgICAgICAgICAgICAgIG1hdGgrPXRva2Vuc1tpXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdvcGVyYXRvcic6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSAhPT0gJy8nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0aCs9KHRva2Vuc1tpXS52YWx1ZSkucmVwbGFjZSgvKFteXFwqXFxePVxcLystXSkvLFwiXFxcXCQxXCIpLnJlcGxhY2UoL1xcKi9nLGBcXFxcY2RvdCBgKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAndmFyaWFibGUnOlxyXG4gICAgICAgICAgICAgICAgbWF0aCs9KHRva2Vuc1tpXS52YWx1ZT49MCYmdG9rZW5zW2ktMV0mJi8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2Vuc1tpLTFdLnR5cGUpPycrJzonJykrKHRva2Vuc1tpXS52YWx1ZSE9PTE/dG9rZW5zW2ldLnZhbHVlOicnKSt0b2tlbnNbaV0udmFyaWFibGU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAncG93ZXJWYXJpYWJsZSc6XHJcbiAgICAgICAgICAgICAgICBtYXRoKz0odG9rZW5zW2ldLnZhbHVlPj0wJiZ0b2tlbnNbaS0xXSYmLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW5zW2ktMV0udHlwZSk/JysnOicnKSsodG9rZW5zW2ldLnZhbHVlIT09MT90b2tlbnNbaV0udmFsdWU6JycpK3Rva2Vuc1tpXS52YXJpYWJsZStgXnske3Rva2Vuc1tpXS5wb3d9fWA7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBtYXRoXHJcbn1cclxuZnVuY3Rpb24gcmVvcmRlcih0b2tlbnMpe1xyXG4gICAgbGV0IG5ld1Rva2VucyA9IFtdO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBsZXQgbmV3VG9rZW4gPSB7IC4uLnRva2Vuc1tpXSwgaW5kZXg6IGkgfTtcclxuICAgICAgICBuZXdUb2tlbnMucHVzaChuZXdUb2tlbik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV3VG9rZW5zO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb25uZWN0KHRva2Vucyl7XHJcbiAgICBsZXQgaT0wLG1vcmVDb25uZWN0ZWRUb2tlbnM9dHJ1ZTtcclxuICAgIHdoaWxlIChpIDwgMTAwICYmIG1vcmVDb25uZWN0ZWRUb2tlbnMpIHtcclxuICAgICAgICBpKys7XHJcbiAgICAgICAgbGV0IGluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAoIXRva2Vuc1tpbmRleCArIDJdIHx8IHRva2Vuc1tpbmRleCArIDJdLnR5cGUhPT0nb3BlcmF0b3InKSAmJlxyXG4gICAgICAgICAgICAoKHRva2VuLnR5cGUgPT09ICdudW1iZXInICYmIHRva2VuLnR5cGUgPT09IHRva2Vuc1tpbmRleCArIDFdPy50eXBlKSB8fFxyXG4gICAgICAgICAgICAodG9rZW4udHlwZSA9PT0gJ3ZhcmlhYmxlJyAmJiB0b2tlbi50eXBlID09PSB0b2tlbnNbaW5kZXggKyAxXT8udHlwZSAmJiB0b2tlbi52YXJpYWJsZSA9PT0gdG9rZW5zW2luZGV4ICsgMV0/LnZhcmlhYmxlKSlcclxuICAgICAgICApO1xyXG4gICAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgdG9rZW5zW2luZGV4XS52YWx1ZSs9dG9rZW5zW2luZGV4KzFdLnZhbHVlXHJcbiAgICAgICAgICAgIHRva2Vucy5zcGxpY2UoaW5kZXggKyAxLCAxKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IG9wZW5QYXJlbkluZGV4PS0xLGNsb3NlUGFyZW5JbmRleD0tMTtcclxuICAgICAgICBsZXQgY2hlY2t0UGFyZW49LTE7XHJcbiAgICAgICAgd2hpbGUgKGk8MTAwKSB7XHJcbiAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgICAgb3BlblBhcmVuSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICB0b2tlbi52YWx1ZSA9PT0gJygnICYmIGluZGV4ID4gY2hlY2t0UGFyZW4gJiZcclxuICAgICAgICAgICAgICAgIChpbmRleCA9PT0gMCB8fCAgLy8gSGFuZGxlIGNhc2UgZm9yIGZpcnN0IHRva2VuXHJcbiAgICAgICAgICAgICAgICAoaW5kZXggLSAxID49IDAgJiYgdG9rZW5zW2luZGV4IC0gMV0gJiYgKCEvKG9wZXJhdG9yfHBhcmVuKS8udGVzdCh0b2tlbnNbaW5kZXggLSAxXS50eXBlKSB8fCAvWz1dLy50ZXN0KHRva2Vuc1tpbmRleCAtIDFdLnZhbHVlKSkpKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2xvc2VQYXJlbkluZGV4ID0gb3BlblBhcmVuSW5kZXggPT09IC0xPy0xOnRva2Vucy5maW5kTGFzdEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICB0b2tlbi52YWx1ZSA9PT0gJyknICYmXHJcbiAgICAgICAgICAgICAgICB0b2tlbi5pZCA9PT0gdG9rZW5zW29wZW5QYXJlbkluZGV4XS5pZCAmJlxyXG4gICAgICAgICAgICAgICAgKCh0b2tlbnMubGVuZ3RoLTE+aW5kZXggICYmKHRva2Vuc1tpbmRleCArIDFdLnR5cGUgIT09ICdvcGVyYXRvcid8fC9bPV0vLnRlc3QodG9rZW5zW2luZGV4ICsgMV0udmFsdWUpKXx8IHRva2Vucy5sZW5ndGgtMT09PWluZGV4KVxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgaWYgKG9wZW5QYXJlbkluZGV4PT09LTF8fGNsb3NlUGFyZW5JbmRleCE9PS0xKXticmVhazt9XHJcbiAgICAgICAgICAgIGNoZWNrdFBhcmVuPW9wZW5QYXJlbkluZGV4O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2xvc2VQYXJlbkluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICB0b2tlbnMgPSB0b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+XHJcbiAgICAgICAgICAgICAgICBpZHggIT09IG9wZW5QYXJlbkluZGV4ICYmIGlkeCAhPT0gY2xvc2VQYXJlbkluZGV4XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpbmRleCA9PT0gLTEgJiYgY2xvc2VQYXJlbkluZGV4ID09PSAtMSkge1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICB0b2tlbnM9cmVvcmRlcih0b2tlbnMpXHJcbiAgICB0b2tlbnM9cmVJRHBhcmVudGhlc2VzKHRva2VucylcclxuICAgIHJldHVybiB0b2tlbnM7XHJcbn1cclxuZnVuY3Rpb24gc2ltcGxpZml5KHRva2Vucyl7XHJcbiAgICBsZXQgaT0wLG5ld1Rva2Vucz1bXTtcclxuICAgIHdoaWxlIChpPD0xMDAmJnRva2Vucy5zb21lKHRva2VuID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpKVxyXG4gICAge1xyXG4gICAgICAgIGkrKztcclxuICAgICAgICBsZXQgZXFpbmRleD10b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnZhbHVlID09PSAnPScpO1xyXG4gICAgICAgIGxldCBPcGVyYXRpb25JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuKSA9PiAoLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvKS50ZXN0KHRva2VuLnR5cGUpKTtcclxuICAgICAgICBpZiAoT3BlcmF0aW9uSW5kZXg9PT0tMSl7YWRkRGVidWdJbmZvKGkpO3JldHVybiB0b2tlbnM7fVxyXG4gICAgICAgIGxldCBjdXJyZW50VG9rZW49e3R5cGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAsIHZhbHVlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhbHVlLHZhcmlhYmxlOiB0b2tlbnNbT3BlcmF0aW9uSW5kZXhdLnZhcmlhYmxlICxwb3c6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0ucG93fVxyXG5cclxuICAgICAgICBsZXQgbnVtYmVyR3JvdXAgPSB0b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbiwgaSkgPT4gKHsgdG9rZW4sIG9yaWdpbmFsSW5kZXg6IGkgfSkpIFxyXG4gICAgICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtLnRva2VuLnR5cGU9PT1jdXJyZW50VG9rZW4udHlwZSkgXHJcbiAgICAgICAgLnJlZHVjZSgoc3VtLCBpdGVtKSA9PiB7XHJcbiAgICAgICAgbGV0IG11bHRpcGxpZXI9KHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXSAmJiB0b2tlbnNbaXRlbS5vcmlnaW5hbEluZGV4IC0gMV0udmFsdWUgPT09ICctJykgPyAtMSA6IDE7XHJcbiAgICAgICAgbXVsdGlwbGllciAqPSAoaXRlbS5vcmlnaW5hbEluZGV4IDw9IGVxaW5kZXgpID8gLTEgOiAxOyBcclxuICAgICAgICBpZiAoISgvKG51bWJlcikvKS50ZXN0KGl0ZW0udG9rZW4udHlwZSkpe211bHRpcGxpZXIqPS0xfVxyXG4gICAgICAgIHJldHVybiBzdW0gKyAoaXRlbS50b2tlbi52YWx1ZSAqIG11bHRpcGxpZXIpO1xyXG4gICAgICAgIH0sIDApOyBcclxuICAgICAgICBcclxuICAgICAgICBuZXdUb2tlbnMucHVzaCh7IFxyXG4gICAgICAgICAgICB0eXBlOiBjdXJyZW50VG9rZW4udHlwZSwgXHJcbiAgICAgICAgICAgIHZhbHVlOiBudW1iZXJHcm91cCxcclxuICAgICAgICAgICAgdmFyaWFibGU6IGN1cnJlbnRUb2tlbi52YXJpYWJsZSxcclxuICAgICAgICAgICAgcG93OiBjdXJyZW50VG9rZW4ucG93LFxyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIHRva2Vucz0gdG9rZW5zLmZpbHRlcih0b2tlbiA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiAhKHRva2VuLnR5cGUgPT09IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udHlwZSAmJlxyXG4gICAgICAgICAgICAgICAgICAgICghdG9rZW4udmFyaWFibGUgfHwgdG9rZW4udmFyaWFibGUgPT09IGN1cnJlbnRUb2tlbi52YXJpYWJsZSkgJiZcclxuICAgICAgICAgICAgICAgICAgICAoIXRva2VuLnBvdyB8fCB0b2tlbi5wb3cgPT09IGN1cnJlbnRUb2tlbi5wb3cpKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiBuZXdUb2tlbnM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHF1YWQoYSxiLGMsdmFyaWFibGUpIHtcclxuICAgIGFkZERlYnVnSW5mbygncXVhZCcsYGEgPSAke2F9LCBiID0gJHtifSwgYyA9ICR7Y31gKVxyXG4gICAgc29sdXRpb25JbmZvLnB1c2goYGEgPSAke2F9LCBiID0gJHtifSwgYyA9ICR7Y31gKVxyXG4gICAgbGV0IHgxID0gKC1iICsgTWF0aC5zcXJ0KE1hdGgucG93KGIsIDIpIC0gNCAqIGEgKiBjKSkgLyAoMiAqIGEpO1xyXG4gICAgbGV0IHgyID0gKC1iIC0gTWF0aC5zcXJ0KE1hdGgucG93KGIsIDIpIC0gNCAqIGEgKiBjKSkgLyAoMiAqIGEpO1xyXG4gICAgeDE9TWF0aC5yb3VuZCh4MSAqIDEwMDAwKSAvIDEwMDAwXHJcbiAgICB4Mj1NYXRoLnJvdW5kKHgyICogMTAwMDApIC8gMTAwMDBcclxuICAgIHJldHVybiB4MT09PXgyP2Ake3ZhcmlhYmxlfSA9ICR7eDF9YDpgJHt2YXJpYWJsZX1fMSA9ICR7eDF9LCR7dmFyaWFibGV9XzIgPSAke3gyLnRvRml4ZWQoMyl9YDtcclxufVxyXG4gICAgc29sdXRpb249Y29udHJvbGxlcih0b2tlbnMpO1xyXG4gICAgaWYgKHR5cGVvZiBtYXRoRXhwcmVzc2lvbiA9PT0gXCJ1bmRlZmluZWRcIilcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYGxhdGV4OiAke2xhdGV4fSxcXG5wcm9jZXNzZWRpbnB1dDogJHtwcm9jZXNzZWRpbnB1dH0sXFxuTGVuZ3RoOiAke2xhdGV4Lmxlbmd0aH0sXFxuVG9rZW5zOiAke3Rva2Vucy5sZW5ndGh9XFxuc29sdXRpb246ICR7c29sdXRpb259XFxuRGVidWcgSW5mbzpcXG4ke2RlYnVnSW5mb31gOyBcclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgc29sdXRpb246IHNvbHV0aW9uLFxyXG4gICAgICAgIHByb2Nlc3NlZGlucHV0OiBwcm9jZXNzZWRpbnB1dCB8fCAnJyxcclxuICAgICAgICBtYXRoSW5mbzogbWF0aEluZm8gfHwgJycsICAgICAgICAgICAgICAgXHJcbiAgICAgICAgc29sdXRpb25JbmZvOiBzb2x1dGlvbkluZm8gfHwgJycsIFxyXG4gICAgICAgIGRlYnVnSW5mbzogZGVidWdJbmZvIHx8ICcnLCAgICBcclxuICAgIH07XHJcbn0iXX0=