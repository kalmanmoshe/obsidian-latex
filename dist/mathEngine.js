export function controller(mathExpression) {
    let processedinput = '', debugInfo = '', mathInfo = [], solutionInfo = [];
    let latex = String.raw ``;
    // Remember function  remove dumbAss parentheses.
    function addDebugInfo(msg, value) {
        debugInfo += (typeof msg === "object" ? JSON.stringify(msg) : msg) + ` : ` + (typeof value === "object" ? JSON.stringify(value) : value) + `\n `;
    }
    //error
    let math = `${mathExpression}`
        .replace(/(\s|_\{[\w]*\})/g, "")
        .replace(/{/g, "(")
        .replace(/}/g, ")")
        .replace(/(\\cdot|cdot)/g, "*")
        .replace(/Math./g, "\\")
        .replace(/(?<!\\|[a-zA-Z])(tan|sin|cos|binom|frac|asin|acos|atan|arccos|arcsin|arctan|cdot)/g, "\\$1");
    //addDebugInfo(`//math`,math)
    let tokens = [];
    let brackets = 0, levelCount = {};
    let j = 0;
    for (let i = 0; i < math.length; i++) {
        j++;
        if (j > 500) {
            break;
        }
        let number = 0, startPos = i, vari = '';
        if (/[+-]/.test(math[i]) || i + math.slice(i).search(/[0-9.]+([a-zA-Z])/) === i) {
            continue;
        }
        // Multiplication before parentheses
        if (math[i] === '(') {
            if (tokens.length - 1 >= 0 && /(number|variable)/.test(tokens[tokens.length - 1].type) && math[i - 1] && !/[+-=]/.test(math[i - 1])) {
                math = math.slice(0, i) + '*' + math.slice(i);
                i--;
                continue;
            }
            else if (i > 0 && math[i - 1] === '-') {
                math = math.slice(0, i - 1) + '-1*' + math.slice(i);
                i -= 2;
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
                throw new Error("Unmatched closing bracket at position");
                brackets = 0;
            }
            let ID = levelCount[brackets] - 1;
            tokens.push({ type: 'paren', value: ')', id: brackets + '.' + (ID >= 0 ? ID : 0), index: tokens.length });
            // Multiplication between parentheses. and multiplication after parentheses
            const lastIndex = tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id) - 1;
            if ((math[i + 1] === '(' && (lastIndex < 0 || !/(frac|binom)/.test(tokens[lastIndex].value)))
                || (i + 1 < math.length && /[0-9A-Za-z.]/.test(math[i + 1]))) {
                math = math.slice(0, i + 1) + '*' + math.slice(i + 1);
            }
            else if (i + 1 < math.length && math[i + 1] === '-') {
                math = math.slice(0, i + 1) + '*-1' + math.slice(i + 1);
            }
            continue;
        }
        if (/[\*\/^=]/.test(math[i])) {
            tokens.push({ type: 'operator', value: math[i], index: tokens.length ? tokens.length : 0 });
            continue;
        }
        if (math[i] === '\\') {
            if (i !== 0 && math.length > 0 && !/[-+]/.test(math[i - 1]) && /[1-9A-Za-z]/.test(math[i - 1])) {
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
        throw new Error("Unknown char \"${math[i]}\"");
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
        if (!left && !/(sqrt|cos|sin|tan)/.test(operator)) {
            throw new Error(`Left side of ` + operator + ` must have a value`);
            return null;
        }
        if (!right) {
            throw new Error(`Right side of ` + operator + ` must have a value`);
            return null;
        }
        //const readyForFinalPraising = tokens.every(token => !/(operator)/.test(token.type)||/(=)/.test(token.value));
        //const allNumbers = tokens.every(token => /(number)/.test(token.type)||/(=)/.test(token.value));
        const areThereOperators = tokens.some(token => /(operator)/.test(token.type) && !/(=)/.test(token.value));
        //(readyForFinalPraising&&!allNumbers)
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
                addDebugInfo(`${variableIndex[0].variable} = ${(numberIndex[0].value) / (variableIndex[0].value)}`);
                return `${variableIndex[0].variable} = ${(numberIndex[0].value) / (variableIndex[0].value)}`;
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
            return solution(tokens);
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
        let replacementCell = [];
        let left = tokens.slice(expression.leftBreak, expression.index).filter(item => /(number|variable|powerVariable)/.test(item.type));
        let right = tokens.slice(expression.index, expression.rightBreak).filter(item => /(number|variable|powerVariable)/.test(item.type));
        for (let i = 0; i < left.length; i++) {
            for (let j = 0; j < right.length; j++) {
                replacementCell.push(left[i]);
                replacementCell.push({ "type": "operator", "value": "*", "index": 0 });
                replacementCell.push(right[j]);
            }
        }
        tokens.splice(expression.leftBreak, expression.rightBreak - expression.leftBreak, ...replacementCell);
        tokens = reorder(tokens);
        addDebugInfo(`expandExpression`, reconstruct(tokens));
        solutionInfo.puse(reconstruct(tokens));
        return tokens;
    }
    function addSolution(expression, solved) {
        let solution = reconstruct([solved]);
        let left = expression.left ? reconstruct([{ type: expression.leftType, value: expression.left, variable: expression.leftVariable, pow: expression.leftPow }]) : '';
        let right = expression.right ? reconstruct([{ type: expression.rightType, value: expression.right, variable: expression.rightVariable, pow: expression.rightPow }]) : '';
        switch (expression.operator) {
            case '^':
                return `${left} ^ {${right}} = ${solution}`;
            case '+':
            case '-':
            case '*':
                return `${left} ${expression.operator.replace(/\*/g, "\\cdot")} ${right} = ${reconstruct(solution)}`;
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
                    if ((typeof temp !== "undefined" && /(frac|sqrt|\^|\/)/.test(temp.value))) {
                        math += tokens[i].value.replace(/\(/, '\{').replace(/\)/, '\}');
                        break;
                    }
                    else if (typeof temp !== "undefined" && /\)/.test(temp.value) && /(frac|sqrt|\^|\/)/.test(tokens[tokens.findIndex(token => token.id === temp.id) - 1].value)) {
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
                        math += (tokens[i].value).replace(/([^\*\^=\/])/, "\\$1").replace(/\*/g, `\\cdot `);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aEVuZ2luZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21hdGhFbmdpbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxVQUFVLFVBQVUsQ0FBQyxjQUFjO0lBRXpDLElBQUksY0FBYyxHQUFDLEVBQUUsRUFBRyxTQUFTLEdBQUcsRUFBRSxFQUFFLFFBQVEsR0FBRyxFQUFFLEVBQUUsWUFBWSxHQUFDLEVBQUUsQ0FBQTtJQUN0RSxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFBLEVBQUUsQ0FBQztJQUN6QixpREFBaUQ7SUFDakQsU0FBUyxZQUFZLENBQUMsR0FBRyxFQUFFLEtBQUs7UUFDNUIsU0FBUyxJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUcsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQSxHQUFHLENBQUMsR0FBQyxLQUFLLEdBQUMsQ0FBQyxPQUFPLEtBQUssS0FBRyxRQUFRLENBQUEsQ0FBQyxDQUFBLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQyxHQUFFLEtBQUssQ0FBQztJQUNwSSxDQUFDO0lBQ0QsT0FBTztJQUNQLElBQUksSUFBSSxHQUFHLEdBQUcsY0FBYyxFQUFFO1NBQzNCLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUM7U0FDL0IsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUM7U0FDbEIsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUM7U0FDbEIsT0FBTyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQztTQUM5QixPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQztTQUN2QixPQUFPLENBQUMsb0ZBQW9GLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFekcsNkJBQTZCO0lBRTdCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNoQixJQUFJ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QUFDLEVBQUM7Z0JBQUMsTUFBTSxHQUFDLElBQUksQ0FBQyxRQUFRLEdBQUMsQ0FBQyxDQUFDLEdBQUMsTUFBTSxDQUFBO2FBQUM7WUFHakUsSUFBSSxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDO2dCQUFDLFNBQVM7YUFBQztZQUNyRCxJQUFJLENBQUMsS0FBRyxDQUFDLElBQUUsSUFBSSxDQUFDLFFBQVEsR0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUU7Z0JBRWpDLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUQsQ0FBQyxFQUFFLENBQUM7YUFDUDtZQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUEsQ0FBQyxDQUFBLE1BQU0sQ0FBQyxNQUFNLENBQUEsQ0FBQyxDQUFBLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDakcsU0FBUztTQUNaO1FBRUQsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzFCLElBQUksR0FBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRCxJQUFJLElBQUksSUFBRSxJQUFJLENBQUMsTUFBTSxLQUFHLENBQUMsRUFBQztnQkFBQyxJQUFJLEdBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFB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aEV4cHJlc3Npb24pIHtcclxuICAgIFxyXG5sZXQgcHJvY2Vzc2VkaW5wdXQ9JycsICBkZWJ1Z0luZm8gPSAnJywgbWF0aEluZm8gPSBbXSwgc29sdXRpb25JbmZvPVtdIFxyXG5sZXQgbGF0ZXggPSBTdHJpbmcucmF3YGA7XHJcbi8vIFJlbWVtYmVyIGZ1bmN0aW9uICByZW1vdmUgZHVtYkFzcyBwYXJlbnRoZXNlcy5cclxuZnVuY3Rpb24gYWRkRGVidWdJbmZvKG1zZywgdmFsdWUpIHtcclxuICAgIGRlYnVnSW5mbyArPSAodHlwZW9mIG1zZz09PVwib2JqZWN0XCI/SlNPTi5zdHJpbmdpZnkobXNnKTptc2cpK2AgOiBgKyh0eXBlb2YgdmFsdWU9PT1cIm9iamVjdFwiP0pTT04uc3RyaW5naWZ5KHZhbHVlKTp2YWx1ZSkrIGBcXG4gYDtcclxufVxyXG4vL2Vycm9yXHJcbmxldCBtYXRoID0gYCR7bWF0aEV4cHJlc3Npb259YFxyXG4gIC5yZXBsYWNlKC8oXFxzfF9cXHtbXFx3XSpcXH0pL2csIFwiXCIpIFxyXG4gIC5yZXBsYWNlKC97L2csIFwiKFwiKSBcclxuICAucmVwbGFjZSgvfS9nLCBcIilcIilcclxuICAucmVwbGFjZSgvKFxcXFxjZG90fGNkb3QpL2csIFwiKlwiKVxyXG4gIC5yZXBsYWNlKC9NYXRoLi9nLCBcIlxcXFxcIilcclxuICAucmVwbGFjZSgvKD88IVxcXFx8W2EtekEtWl0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58YXJjY29zfGFyY3NpbnxhcmN0YW58Y2RvdCkvZywgXCJcXFxcJDFcIik7XHJcbiAgXHJcbi8vYWRkRGVidWdJbmZvKGAvL21hdGhgLG1hdGgpXHJcblxyXG5sZXQgdG9rZW5zID0gW107XHJcbmxldCBicmFja2V0cyA9IDAsICBsZXZlbENvdW50ID0ge307XHJcbmxldCBqPTA7XHJcbmZvciAobGV0IGkgPSAwOyBpIDwgbWF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgaisrO1xyXG4gICAgaWYoaj41MDApe2JyZWFrO31cclxuICAgIGxldCBudW1iZXI9MCwgIHN0YXJ0UG9zID0gaSx2YXJpPScnO1xyXG4gICAgaWYgKC9bKy1dLy50ZXN0KG1hdGhbaV0pfHxpK21hdGguc2xpY2UoaSkuc2VhcmNoKC9bMC05Ll0rKFthLXpBLVpdKS8pPT09aSl7Y29udGludWU7fVxyXG4gICAgLy8gTXVsdGlwbGljYXRpb24gYmVmb3JlIHBhcmVudGhlc2VzXHJcbiAgICBpZiAobWF0aFtpXSA9PT0gJygnKSB7XHJcbiAgICAgICAgaWYgKHRva2Vucy5sZW5ndGgtMT49MCYmLyhudW1iZXJ8dmFyaWFibGUpLy50ZXN0KHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLnR5cGUpJiZtYXRoW2ktMV0mJiEvWystPV0vLnRlc3QobWF0aFtpLTFdKSkge1xyXG4gICAgICAgICAgICBtYXRoID0gbWF0aC5zbGljZSgwLCBpKSArICcqJyArIG1hdGguc2xpY2UoaSk7XHJcbiAgICAgICAgICAgIGktLTsgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYoaT4wJiZtYXRoW2ktMV09PT0nLScpe1xyXG4gICAgICAgICAgICBtYXRoID0gbWF0aC5zbGljZSgwLCBpLTEpICsgJy0xKicgKyBtYXRoLnNsaWNlKGkpO1xyXG4gICAgICAgICAgICBpLT0yOyBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xyXG4gICAgICAgICAgICBsZXZlbENvdW50W2JyYWNrZXRzXSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XHJcbiAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAncGFyZW4nLCB2YWx1ZTogJygnLCBpZDogYnJhY2tldHMgKyAnLicgKyBJRCwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XHJcbiAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGlmIChtYXRoW2ldID09PSAnKScpIHtcclxuICAgICAgICBicmFja2V0cy0tOyBcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYnJhY2tldHMgPCAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVubWF0Y2hlZCBjbG9zaW5nIGJyYWNrZXQgYXQgcG9zaXRpb25cIik7XHJcbiAgICAgICAgICAgIGJyYWNrZXRzID0gMDsgXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdIC0gMTtcclxuICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6ICdwYXJlbicsIHZhbHVlOiAnKScsIGlkOiBicmFja2V0cyArICcuJyArIChJRCA+PSAwID8gSUQgOiAwKSwgaW5kZXg6IHRva2Vucy5sZW5ndGggfSk7XHJcbiAgICAgICAgLy8gTXVsdGlwbGljYXRpb24gYmV0d2VlbiBwYXJlbnRoZXNlcy4gYW5kIG11bHRpcGxpY2F0aW9uIGFmdGVyIHBhcmVudGhlc2VzXHJcbiAgICAgICAgY29uc3QgbGFzdEluZGV4ID0gdG9rZW5zLm1hcCh0b2tlbiA9PiB0b2tlbi5pZCkuaW5kZXhPZih0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLmlkKSAtIDE7XHJcbiAgICAgICAgaWYgKChtYXRoW2krMV0gPT09ICcoJyYmKGxhc3RJbmRleDwwfHwhLyhmcmFjfGJpbm9tKS8udGVzdCh0b2tlbnNbbGFzdEluZGV4XS52YWx1ZSkpKVxyXG4gICAgICAgICAgICB8fChpKzE8bWF0aC5sZW5ndGgmJi9bMC05QS1aYS16Ll0vLnRlc3QobWF0aFtpKzFdKSkpIHtcclxuICAgICAgICBtYXRoID0gbWF0aC5zbGljZSgwLCBpKzEpICsgJyonICsgbWF0aC5zbGljZShpKzEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmKGkrMTxtYXRoLmxlbmd0aCYmbWF0aFtpKzFdPT09Jy0nKXtcclxuICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgaSsxKSArICcqLTEnICsgbWF0aC5zbGljZShpKzEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGlmICgvW1xcKlxcL149XS8udGVzdChtYXRoW2ldKSkge1xyXG4gICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogJ29wZXJhdG9yJywgdmFsdWU6IG1hdGhbaV0sIGluZGV4OiB0b2tlbnMubGVuZ3RoP3Rva2Vucy5sZW5ndGg6MCB9KTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGlmIChtYXRoW2ldID09PSAnXFxcXCcpIHsgIFxyXG4gICAgICAgIGlmIChpIT09MCYmbWF0aC5sZW5ndGg+MCYmIS9bLStdLy50ZXN0KG1hdGhbaS0xXSkmJi9bMS05QS1aYS16XS8udGVzdChtYXRoW2ktMV0pKSB7XHJcbiAgICAgICAgICAgIG1hdGggPSBtYXRoLnNsaWNlKDAsIGkpICsgJyonICsgbWF0aC5zbGljZShpKTtcclxuICAgICAgICAgICAgaS0tOyBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaSs9MTsgIFxyXG4gICAgICAgIGxldCBvcGVyYXRvciA9IChtYXRoLnNsaWNlKGkpLm1hdGNoKC9bYS16QS1aXSsvKSB8fCBbXCJcIl0pWzBdXHJcbiAgICAgICAgXHJcbiAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiAnb3BlcmF0b3InLCB2YWx1ZTogb3BlcmF0b3IsIGluZGV4OiB0b2tlbnMubGVuZ3RoIH0pO1xyXG4gICAgICAgIGkrPW9wZXJhdG9yLmxlbmd0aDtcclxuICAgICAgICBpZiAodG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS52YWx1ZSA9PT0gJ3NxcnQnICYmIG1hdGhbaV0gPT09ICdbJyAmJiBpIDwgbWF0aC5sZW5ndGggLSAyKSB7XHJcbiAgICAgICAgICAgIGxldCB0ZW1wPW1hdGguc2xpY2UoaSxpKzErbWF0aC5zbGljZShpKS5zZWFyY2goL1tcXF1dLykpO1xyXG4gICAgICAgICAgICBpKz10ZW1wLmxlbmd0aFxyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRva2Vuc1t0b2tlbnMubGVuZ3RoLTFdLHtzcGVjaWFsQ2hhcjogc2FmZVRvTnVtYmVyKHRlbXApLH0pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGktLTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaSttYXRoLnNsaWNlKGkpLnNlYXJjaCgvWzAtOS5dKyg/IVthLXpBLVpdKS8pPT09aSlcclxuICAgIHtcclxuICAgICAgICBudW1iZXI9KG1hdGguc2xpY2UoaSkubWF0Y2goL1swLTkuXSsoPyFbYS16QS1aXSkvKXx8MClbMF1cclxuXHJcbiAgICAgICAgaSs9bnVtYmVyLmxlbmd0aD4xP251bWJlci5sZW5ndGgtMTowO1xyXG4gICAgICAgIGlmKC9bKy1dLy50ZXN0KG1hdGhbc3RhcnRQb3MtMV0pKXtudW1iZXI9bWF0aFtzdGFydFBvcy0xXStudW1iZXJ9XHJcbiAgICAgICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1hdGhbaSsxXSYmL1thLXpBLVpdLy50ZXN0KG1hdGhbaSsxXSkpe2NvbnRpbnVlO31cclxuICAgICAgICBpZiAoMT09PTImJm1hdGhbc3RhcnRQb3MtMV0gPT09ICcpJykge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbWF0aCA9IG1hdGguc2xpY2UoMCwgc3RhcnRQb3MpICsgJyonICsgbWF0aC5zbGljZShzdGFydFBvcyk7ICBcclxuICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6ICdudW1iZXInLCB2YWx1ZTogcGFyc2VGbG9hdChudW1iZXIpLCBpbmRleDogdG9rZW5zLmxlbmd0aD90b2tlbnMubGVuZ3RoOjAgfSk7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICgvW2EtekEtWl0vLnRlc3QobWF0aFtpXSkpIHtcclxuICAgICAgICB2YXJpPSAobWF0aC5zbGljZShpKS5tYXRjaCgvW2EtekEtWl0rLykgfHwgW1wiXCJdKVswXTtcclxuICAgICAgICBpZiAodmFyaSYmdmFyaS5sZW5ndGg9PT0wKXt2YXJpPW1hdGguc2xpY2UoaSxtYXRoLmxlbmd0aCl9XHJcbiAgICAgICAgbnVtYmVyPW1hdGguc2xpY2UoaSt2YXJpLmxlbmd0aCx2YXJpLmxlbmd0aCtpK21hdGguc2xpY2UoaSt2YXJpLmxlbmd0aCkuc2VhcmNoKC9bXjAtOV0vKSlcclxuICAgICAgICBcclxuICAgICAgICBpKz12YXJpLmxlbmd0aCtudW1iZXIubGVuZ3RoLTE7XHJcbiAgICAgICAgbnVtYmVyPXNhZmVUb051bWJlcihudW1iZXIubGVuZ3RoPjA/bnVtYmVyOjEpO1xyXG4gICAgICAgIGlmICgvWzAtOV0vLnRlc3QobWF0aFtzdGFydFBvcz4wP3N0YXJ0UG9zLTE6MF0pJiZ0b2tlbnMpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBudW1iZXI9KG1hdGguc2xpY2UoMCxzdGFydFBvcykubWF0Y2goL1swLTldKyg/PVteMC05XSokKS8pfHwgW1wiXCJdKVswXTtcclxuICAgICAgICAgICAgbnVtYmVyPW1hdGhbc3RhcnRQb3MtbnVtYmVyLmxlbmd0aC0xXSYmbWF0aFtzdGFydFBvcy1udW1iZXIubGVuZ3RoLTFdPT09Jy0nPyctJytudW1iZXI6bnVtYmVyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmKC9bLV0vLnRlc3QobWF0aFtzdGFydFBvcy0xXSkpe251bWJlcj1tYXRoW3N0YXJ0UG9zLTFdK251bWJlcn1cclxuICAgICAgICB0b2tlbnMucHVzaCh7dHlwZTogJ3ZhcmlhYmxlJyx2YXJpYWJsZTogdmFyaSx2YWx1ZTogc2FmZVRvTnVtYmVyKG51bWJlciksIGluZGV4OiB0b2tlbnMubGVuZ3RofSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIGNoYXIgXFxcIiR7bWF0aFtpXX1cXFwiXCIpO1xyXG59XHJcblxyXG5pZiAoYnJhY2tldHMhPT0wKVxyXG57XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IgKCdVbm1hdGNoZWQgb3BlbmluZyBicmFja2V0KHMpJylcclxufVxyXG5hZGREZWJ1Z0luZm8oJ1Rva2VucyBhZnRlciB0b2tlbml6ZScsIHRva2Vucyk7XHJcblxyXG5mdW5jdGlvbiBzYWZlVG9OdW1iZXIodmFsdWUpIHtcclxuICAgIGlmICghdHlwZW9mIHZhbHVlID09PSBgdHJpbmdgKXtyZXR1cm4gdmFsdWV9XHJcbiAgICBpZiAodmFsdWU9PT0nKycpe3JldHVybiAwfVxyXG4gICAgaWYgKHZhbHVlPT09Jy0nKXtyZXR1cm4gLTF9XHJcbiAgICBpZiAoL1thLXpBLVpdLy50ZXN0KHZhbHVlKSl7cmV0dXJuIDF9XHJcbiAgICBpZigvW1xcKFxcW10vLnRlc3QodmFsdWVbMF0pKXt2YWx1ZSA9IHZhbHVlLnNsaWNlKDEpfVxyXG4gICAgaWYoL1tcXClcXF1dLy50ZXN0KHZhbHVlW3ZhbHVlLmxlbmd0aC0xXSkpe3ZhbHVlID0gdmFsdWUuc2xpY2UoMCx2YWx1ZS5sZW5ndGgtMSl9XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA+MDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVtpXSA9PT0gJ3N0cmluZycgJiYgL1tcXChcXClcXFtcXF1dLy50ZXN0KHZhbHVlW2ldKSkge1xyXG4gICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsIGkpICsgdmFsdWUuc2xpY2UoaSArIDEpO1xyXG4gICAgICAgICAgICBpLS07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5jb25zdCBudW0gPSBOdW1iZXIodmFsdWUpO1xyXG5yZXR1cm4gaXNOYU4obnVtKSA/IHZhbHVlLmxlbmd0aD4wP3ZhbHVlOjAgOiBudW07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGludElEKHBhcnRJRCwgaW50KSB7XHJcbiAgICBsZXQgW2Jhc2VJRCwgc3ViSUQgPSAwXSA9IHBhcnRJRC5zcGxpdCgnLicpLm1hcChOdW1iZXIpO1xyXG4gICAgbGV0IFtiYXNlSU4sIHN1YklOID0gMF0gPSBTdHJpbmcoaW50KS5zcGxpdCgnLicpLm1hcChOdW1iZXIpO1xyXG4gICAgcmV0dXJuIGAke2Jhc2VJRCArIGJhc2VJTn0uJHtzdWJJRCArIHN1YklOfWA7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9wZXJhdGlvbnNPcmRlcih0b2tlbnMpIHtcclxuICAgIGZ1bmN0aW9uIGZpbmRPcGVyYXRvckluZGV4KGJlZ2luLCBlbmQsIHRva2VucywgcmVnZXgpIHtcclxuICAgICAgICB3aGlsZSAoYmVnaW4gPCBlbmQgJiYgYmVnaW4gPCB0b2tlbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGxldCBpbmRleDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChyZWdleCkge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09ICdvcGVyYXRvcicgJiYgcmVnZXgudGVzdCh0b2tlbi52YWx1ZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0b2tlbnMuc2xpY2UoYmVnaW4sIGVuZCkuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09ICdvcGVyYXRvcicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuIC0xO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGluZGV4ICs9IGJlZ2luO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmICghL1srLV0vLnRlc3QodG9rZW5zW2luZGV4XS52YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPiAwICYmIGluZGV4IDwgdG9rZW5zLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaW5kZXggLSAxXS50eXBlID09PSB0b2tlbnNbaW5kZXggKyAxXS50eXBlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJlZ2luID0gaW5kZXggKyAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gLTE7XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGJlZ2luID0gMCwgZW5kID0gdG9rZW5zLmxlbmd0aDtcclxuICAgIGxldCBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICBsZXQgY2hlY2tlZElEcyA9IFtdOyAgXHJcbiAgICBsZXQgb3BlcmF0b3JGb3VuZCA9IGZhbHNlO1xyXG4gICAgbGV0IHRlbXAgPSB0b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLnR5cGUgPT09ICdvcGVyYXRvcicgJiYgdG9rZW4udmFsdWUgPT09ICcvJyk7XHJcbiAgICBpZiAodGVtcCA+PSAwKSB7cmV0dXJuIHRlbXA7fVxyXG4gICAgLy8gRmluZCB0aGUgaW5uZXJtb3N0IHBhcmVudGhlc2VzXHJcbiAgICB3aGlsZSAoIW9wZXJhdG9yRm91bmQpIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnKCcgJiYgIWNoZWNrZWRJRHMuaW5jbHVkZXModG9rZW5zW2ldLmlkKSkge1xyXG4gICAgICAgICAgICAgICAgY3VycmVudElEID0gdG9rZW5zW2ldLmlkOyAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHRva2Vuc1tpXS52YWx1ZSA9PT0gJygnICYmIHRva2Vuc1tpXS5pZCA9PT0gY3VycmVudElEKSB7XHJcbiAgICAgICAgICAgICAgICBiZWdpbiA9IGk7ICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnKScgJiYgdG9rZW5zW2ldLmlkID09PSBjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgICAgIGVuZCA9IGk7ICBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElmIG5vIG1vcmUgcGFyZW50aGVzZXMgYXJlIGZvdW5kLCBwcm9jZXNzIHRoZSB3aG9sZSBleHByZXNzaW9uXHJcbiAgICAgICAgaWYgKCFjdXJyZW50SUQpIHtcclxuICAgICAgICAgICAgYmVnaW4gPSAwO1xyXG4gICAgICAgICAgICBlbmQgPSB0b2tlbnMubGVuZ3RoO1xyXG4gICAgICAgICAgICBvcGVyYXRvckZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG9wZXJhdG9yRm91bmQgPSBmaW5kT3BlcmF0b3JJbmRleChiZWdpbixlbmQsdG9rZW5zKSE9PS0xO1xyXG5cclxuICAgICAgICAvLyBJZiBubyBvcGVyYXRvciBpcyBmb3VuZCwgbWFyayB0aGlzIHBhcmVudGhlc2VzIHBhaXIgYXMgY2hlY2tlZFxyXG4gICAgICAgIGlmICghb3BlcmF0b3JGb3VuZCkge1xyXG4gICAgICAgICAgICBjaGVja2VkSURzLnB1c2goY3VycmVudElEKTsgIFxyXG4gICAgICAgICAgICBjdXJyZW50SUQgPSBudWxsOyAgXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0b2tlblNsaWNlPXRva2Vucy5zbGljZShiZWdpbiAsIGVuZClcclxuICAgIC8vIEZpbmQgaW5kaWNlcyBiYXNlZCBvbiBvcGVyYXRvciBwcmVjZWRlbmNlXHJcbiAgICBsZXQgcHJpb3JpdHkxID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLC8oXFxefHNxcnQpLyk7XHJcbiAgICBsZXQgcHJpb3JpdHkyID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKGZyYWN8Ymlub218c2lufGNvc3x0YW58YXNpbnxhY29zfGF0YW4pLyk7XHJcbiAgICBsZXQgcHJpb3JpdHkzID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvKFxcKnxcXC8pLyk7XHJcbiAgICBsZXQgcHJpb3JpdHk0ID0gZmluZE9wZXJhdG9ySW5kZXgoYmVnaW4gLCBlbmQsdG9rZW5zLCAvWystXS8pO1xyXG4gICAgbGV0IHByaW9yaXR5NSA9IGZpbmRPcGVyYXRvckluZGV4KGJlZ2luICwgZW5kLHRva2VucywgLz0vKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIFtwcmlvcml0eTEsIHByaW9yaXR5MiwgcHJpb3JpdHkzLCBwcmlvcml0eTQsIHByaW9yaXR5NV0uZmluZChpbmRleCA9PiBpbmRleCAhPT0gLTEpPz9udWxsO1xyXG4gICAgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlTGVmdCh0b2tlbnMsIGluZGV4KSB7XHJcbiAgICBsZXQgYnJlYWtDaGFyID0gaW5kZXgsIGxlZnQ7XHJcblxyXG4gICAgaWYgKGluZGV4IDw9IDAgfHwgIXRva2Vuc1tpbmRleCAtIDFdKSB7XHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIG5vIHRva2VucyB0byB0aGUgbGVmdFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0b2tlbnNbaW5kZXggLSAxXS50eXBlID09PSAncGFyZW4nKSB7XHJcbiAgICAgICAgLy8gRmluZCB0aGUgbWF0Y2hpbmcgb3BlbiBwYXJlbnRoZXNpc1xyXG4gICAgICAgIGJyZWFrQ2hhciA9IHRva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4uaWQgPT09IHRva2Vuc1tpbmRleCAtIDFdLmlkKTtcclxuICAgICAgICAvLyBFeHRyYWN0IHRoZSByZWxldmFudCB0b2tlbiB3aXRoaW4gdGhlIHBhcmVudGhlc2VzXHJcbiAgICAgICAgbGVmdCA9IHRva2Vucy5zbGljZShicmVha0NoYXIsIGluZGV4KS5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxlZnQgPSB0b2tlbnNbaW5kZXggLSAxXTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWxlZnQpIHtcclxuICAgICAgICByZXR1cm4gbnVsbDsgLy8gSWYgbm8gdmFsaWQgbGVmdCB0b2tlbiBpcyBmb3VuZCwgcmV0dXJuIG51bGxcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IGxlZnQucG93PyAncG93ZXJWYXJpYWJsZSc6bGVmdC52YXJpYWJsZT8gJ3ZhcmlhYmxlJzogJ251bWJlcicsXHJcbiAgICAgICAgdmFyaWFibGU6IGxlZnQudmFyaWFibGUsXHJcbiAgICAgICAgdmFsdWU6IHNhZmVUb051bWJlcihsZWZ0LnZhbHVlKSxcclxuICAgICAgICBwb3c6IGxlZnQucG93LFxyXG4gICAgICAgIG11bHRpU3RlcDogaW5kZXggLSBicmVha0NoYXIgPj0gNCxcclxuICAgICAgICBicmVha0NoYXI6IGJyZWFrQ2hhciAhPT0gaW5kZXggPyBicmVha0NoYXIgOiBsZWZ0LmluZGV4LFxyXG4gICAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VSaWdodCh0b2tlbnMsIGluZGV4KSB7XHJcbiAgICBsZXQgYnJlYWtDaGFyID0gaW5kZXgsIHJpZ2h0O1xyXG5cclxuICAgIGlmIChpbmRleCA+PSB0b2tlbnMubGVuZ3RoIC0gMSB8fCAhdG9rZW5zW2luZGV4ICsgMV0pIHtcclxuICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgbm8gdG9rZW5zIHRvIHRoZSByaWdodFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgaWYgKHRva2Vuc1tpbmRleCArIDFdLnR5cGUgPT09ICdwYXJlbicpIHtcclxuICAgICAgICBicmVha0NoYXIgPSB0b2tlbnMuZmluZExhc3RJbmRleCgodG9rZW4sIGlkeCkgPT4gaWR4ID4gaW5kZXggJiYgdG9rZW4uaWQgPT09IHRva2Vuc1tpbmRleCArIDFdLmlkKTtcclxuICAgICAgICByaWdodCA9IHRva2Vucy5zbGljZShpbmRleCwgYnJlYWtDaGFyKS5maW5kKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmlnaHQgPSB0b2tlbnNbaW5kZXggKyAxXTtcclxuICAgIH1cclxuICAgIGlmICghcmlnaHQpIHtcclxuICAgICAgICByZXR1cm4gbnVsbDsgXHJcbiAgICB9XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IHJpZ2h0LnBvdz8gJ3Bvd2VyVmFyaWFibGUnOnJpZ2h0LnZhcmlhYmxlPyAndmFyaWFibGUnOiAnbnVtYmVyJyxcclxuICAgICAgICB2YXJpYWJsZTogcmlnaHQudmFyaWFibGUsXHJcbiAgICAgICAgdmFsdWU6IHNhZmVUb051bWJlcihyaWdodC52YWx1ZSksXHJcbiAgICAgICAgcG93OiByaWdodC5wb3csXHJcbiAgICAgICAgbXVsdGlTdGVwOiBicmVha0NoYXIgLSBpbmRleCA+PSA0LFxyXG4gICAgICAgIGJyZWFrQ2hhcjogYnJlYWtDaGFyICE9PSBpbmRleCA/IGJyZWFrQ2hhciArIDEgOiByaWdodC5pbmRleCArIDEsXHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBwb3NpdGlvbih0b2tlbnMsaW5kZXgpIHtcclxuICAgIGxldCBsZWZ0T2JqID0gbnVsbCwgcmlnaHRPYmogPSBudWxsLHRyYW5zaXRpb249aW5kZXg7XHJcbiAgICBpbmRleD1pbmRleD09PW51bGw/b3BlcmF0aW9uc09yZGVyKHRva2Vucyk6aW5kZXg7XHJcblxyXG4gICAgaWYgKGluZGV4ID09PSBudWxsIHx8IGluZGV4ID09PSB0b2tlbnMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgIHJldHVybiBudWxsOyBcclxuICAgIH1cclxuXHJcbiAgICBzd2l0Y2ggKHRva2Vuc1tpbmRleF0udmFsdWUpIHtcclxuICAgICAgICBjYXNlICdeJzpcclxuICAgICAgICBjYXNlICcrJzpcclxuICAgICAgICBjYXNlICctJzpcclxuICAgICAgICBjYXNlICcqJzpcclxuICAgICAgICBjYXNlICcvJzpcclxuICAgICAgICBjYXNlICc9JzpcclxuICAgICAgICAgICAgbGVmdE9iaiA9IHBhcnNlTGVmdCh0b2tlbnMsIGluZGV4KTtcclxuICAgICAgICAgICAgcmlnaHRPYmogPSBwYXJzZVJpZ2h0KHRva2VucywgaW5kZXgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICdzcXJ0JzpcclxuICAgICAgICBjYXNlICdzaW4nOlxyXG4gICAgICAgIGNhc2UgJ2Nvcyc6XHJcbiAgICAgICAgY2FzZSAndGFuJzpcclxuICAgICAgICBjYXNlICdhc2luJzpcclxuICAgICAgICBjYXNlICdhY29zJzpcclxuICAgICAgICBjYXNlICdhdGFuJzpcclxuICAgICAgICBjYXNlICdhcmNzaW4nOlxyXG4gICAgICAgIGNhc2UgJ2FyY2Nvcyc6XHJcbiAgICAgICAgY2FzZSAnYXJjdGFuJzpcclxuICAgICAgICAgICAgbGVmdE9iaiA9IGluZGV4O1xyXG4gICAgICAgICAgICByaWdodE9iaiA9IHBhcnNlUmlnaHQodG9rZW5zLCBpbmRleCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ2ZyYWMnOlxyXG4gICAgICAgIGNhc2UgJ2Jpbm9tJzpcclxuICAgICAgICAgICAgbGVmdE9iaiA9IHBhcnNlUmlnaHQodG9rZW5zLCBpbmRleCk7XHJcbiAgICAgICAgICAgIHRyYW5zaXRpb249bGVmdE9iai5icmVha0NoYXJcclxuICAgICAgICAgICAgcmlnaHRPYmogPSBwYXJzZVJpZ2h0KHRva2VucywgdHJhbnNpdGlvbik7XHJcbiAgICAgICAgICAgIGxlZnRPYmouYnJlYWtDaGFyID0gaW5kZXg7XHJcbiAgICAgICAgICAgIHJpZ2h0T2JqLmJyZWFrQ2hhciArPSAxO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDsgXHJcbiAgICB9XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIG9wZXJhdG9yOiB0b2tlbnNbaW5kZXhdLnZhbHVlLFxyXG4gICAgICAgIGluZGV4OiBpbmRleCxcclxuICAgICAgICB0cmFuc2l0aW9uOiB0cmFuc2l0aW9uLFxyXG4gICAgICAgIHNwZWNpYWxDaGFyOiB0b2tlbnNbaW5kZXhdLnNwZWNpYWxDaGFyID8gdG9rZW5zW2luZGV4XS5zcGVjaWFsQ2hhciA6IG51bGwsXHJcbiAgICAgICAgLi4uKHR5cGVvZiBsZWZ0T2JqID09PSAnb2JqZWN0J1xyXG4gICAgICAgICAgICA/IHsgbGVmdDogbGVmdE9iai52YWx1ZSwgbGVmdFR5cGU6IGxlZnRPYmoudHlwZSxsZWZ0VmFyaWFibGU6IGxlZnRPYmoudmFyaWFibGUsIGxlZnRQb3c6IGxlZnRPYmoucG93LCBsZWZ0TXVsdGlTdGVwOiBsZWZ0T2JqLm11bHRpU3RlcCwgbGVmdEJyZWFrOiBsZWZ0T2JqLmJyZWFrQ2hhciB9XHJcbiAgICAgICAgICAgIDogeyBsZWZ0OiBudWxsLCBsZWZ0QnJlYWs6IGxlZnRPYmogfSksXHJcbiAgICAgICAgLi4ucmlnaHRPYmogJiYgeyByaWdodDogcmlnaHRPYmoudmFsdWUsIHJpZ2h0VHlwZTogcmlnaHRPYmoudHlwZSwgcmlnaHRWYXJpYWJsZTogcmlnaHRPYmoudmFyaWFibGUsIHJpZ2h0UG93OiByaWdodE9iai5wb3csIHJpZ2h0TXVsdGlTdGVwOiByaWdodE9iai5tdWx0aVN0ZXAsIHJpZ2h0QnJlYWs6IHJpZ2h0T2JqLmJyZWFrQ2hhciB9LFxyXG4gICAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2UodG9rZW5zLG9wZXJhdG9yLHNwZWNpYWxDaGFyLCBsZWZ0LCBsZWZ0VmFyLCByaWdodCwgcmlnaHRWYXIscmlnaHRQb3cpIHtcclxuICAgIGlmICghbGVmdCYmIS8oc3FydHxjb3N8c2lufHRhbikvLnRlc3Qob3BlcmF0b3IpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBMZWZ0IHNpZGUgb2YgYCtvcGVyYXRvcitgIG11c3QgaGF2ZSBhIHZhbHVlYCk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBpZiAoIXJpZ2h0KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSaWdodCBzaWRlIG9mIGArb3BlcmF0b3IrYCBtdXN0IGhhdmUgYSB2YWx1ZWApO1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgLy9jb25zdCByZWFkeUZvckZpbmFsUHJhaXNpbmcgPSB0b2tlbnMuZXZlcnkodG9rZW4gPT4gIS8ob3BlcmF0b3IpLy50ZXN0KHRva2VuLnR5cGUpfHwvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSk7XHJcbiAgICAvL2NvbnN0IGFsbE51bWJlcnMgPSB0b2tlbnMuZXZlcnkodG9rZW4gPT4gLyhudW1iZXIpLy50ZXN0KHRva2VuLnR5cGUpfHwvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSk7XHJcbiAgICBjb25zdCBhcmVUaGVyZU9wZXJhdG9ycz10b2tlbnMuc29tZSh0b2tlbj0+LyhvcGVyYXRvcikvLnRlc3QodG9rZW4udHlwZSkmJiEvKD0pLy50ZXN0KHRva2VuLnZhbHVlKSlcclxuICAgIC8vKHJlYWR5Rm9yRmluYWxQcmFpc2luZyYmIWFsbE51bWJlcnMpXHJcbiAgICBpZiAoIWFyZVRoZXJlT3BlcmF0b3JzKVxyXG4gICAge1xyXG4gICAgICAgIHRva2Vucz1zaW1wbGlmaXkodG9rZW5zKVxyXG4gICAgICAgIGFkZERlYnVnSW5mbyhgc2ltcGxpZml5KHRva2VucylgLHRva2VucylcclxuICAgICAgICBjb25zdCBudW1iZXJJbmRleD0gKHRva2Vucy5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgPT09IFwibnVtYmVyXCIpKTtcclxuICAgICAgICBjb25zdCB2YXJpYWJsZUluZGV4PSAodG9rZW5zLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSA9PT0gXCJ2YXJpYWJsZVwiKSk7XHJcbiAgICAgICAgY29uc3QgcG93SW5kZXggPSB0b2tlbnMuZmlsdGVyKGl0ZW0gPT4gaXRlbS50eXBlID09PSBcInBvd2VyVmFyaWFibGVcIik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHBvd0luZGV4Lmxlbmd0aD09PTEmJnBvd0luZGV4WzBdLnBvdz09PTIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXR1cm4gcXVhZChcclxuICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdID8gcG93SW5kZXhbMF0udmFsdWUgIDogMCxcclxuICAgICAgICAgICAgICAgIHZhcmlhYmxlSW5kZXhbMF0gPyB2YXJpYWJsZUluZGV4WzBdLnZhbHVlIDogMCxcclxuICAgICAgICAgICAgICAgIG51bWJlckluZGV4WzBdID8gbnVtYmVySW5kZXhbMF0udmFsdWUgKiAtMTogMCxcclxuICAgICAgICAgICAgICAgIHBvd0luZGV4WzBdLnZhcmlhYmxlLFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocG93SW5kZXgubGVuZ3RoPT09MCYmdmFyaWFibGVJbmRleC5sZW5ndGghPT0wJiZudW1iZXJJbmRleCE9PTApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhZGREZWJ1Z0luZm8oYCR7dmFyaWFibGVJbmRleFswXS52YXJpYWJsZX0gPSAkeyhudW1iZXJJbmRleFswXS52YWx1ZSkvKHZhcmlhYmxlSW5kZXhbMF0udmFsdWUpfWApXHJcbiAgICAgICAgICAgIHJldHVybiBgJHt2YXJpYWJsZUluZGV4WzBdLnZhcmlhYmxlfSA9ICR7KG51bWJlckluZGV4WzBdLnZhbHVlKS8odmFyaWFibGVJbmRleFswXS52YWx1ZSl9YFxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGxldCBzb2x2ZWQ9e3ZhbHVlOiAwLHZhcmlhYmxlOiAnJyxwb3c6ICcnfTtcclxuICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcclxuICAgICAgICBjYXNlICdzcXJ0JzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gTWF0aC5wb3cocmlnaHQsc3BlY2lhbENoYXIhPT1udWxsPygxKS8oc3BlY2lhbENoYXIpOjAuNSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ14nOlxyXG4gICAgICAgICAgICBpZiAobGVmdFZhcnx8cmlnaHRWYXIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHNvbHZlZC52YXJpYWJsZT1sZWZ0VmFyfHxsZWZ0VmFyPT09cmlnaHRWYXI/bGVmdFZhcjpyaWdodFZhcj9yaWdodFZhcjonJztcclxuICAgICAgICAgICAgICAgIHNvbHZlZC5wb3c9cmlnaHRcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBNYXRoLnBvdyhsZWZ0LHJpZ2h0KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnZnJhYyc6XHJcbiAgICAgICAgY2FzZSAnLyc6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChsZWZ0KS8ocmlnaHQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICcqJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdCAqIHJpZ2h0O1xyXG4gICAgICAgICAgICBpZiAobGVmdFZhciYmIXJpZ2h0VmFyKXtzb2x2ZWQudmFyaWFibGU9bGVmdFZhcn1cclxuICAgICAgICAgICAgZWxzZSBpZiAoIWxlZnRWYXImJnJpZ2h0VmFyKXtzb2x2ZWQudmFyaWFibGU9cmlnaHRWYXJ9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGxlZnRWYXImJnJpZ2h0VmFyKXtzb2x2ZWQudmFyaWFibGU9cmlnaHRWYXI7c29sdmVkLnBvdz0yfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICcrJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdCArIHJpZ2h0O1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdFZhcj9sZWZ0VmFyOnJpZ2h0VmFyO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICctJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gbGVmdCAtIHJpZ2h0O1xyXG4gICAgICAgICAgICBzb2x2ZWQudmFyaWFibGU9bGVmdFZhcj9sZWZ0VmFyOnJpZ2h0VmFyO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICdiaW5vbSc6XHJcbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNOYU4obGVmdCkgfHwgTnVtYmVyLmlzTmFOKHJpZ2h0KSB8fCBsZWZ0IDwgMCB8fCByaWdodCA8IDApIHtyZXR1cm4gbnVsbDt9XHJcbiAgICAgICAgICAgIGlmIChyaWdodCA+IGxlZnQpIHtzb2x2ZWQudmFsdWUgPSAwO2JyZWFrO31cclxuICAgICAgICAgICAgaWYgKHJpZ2h0ID09PSAwIHx8IHJpZ2h0ID09PSBsZWZ0KSB7c29sdmVkLnZhbHVlID0gMTticmVhazt9XHJcbiAgICAgICAgICAgIGlmIChyaWdodCA9PT0gMSB8fCByaWdodCA9PT0gbGVmdCAtIDEpIHtzb2x2ZWQudmFsdWUgPSBsZWZ0O2JyZWFrO31cclxuICAgICAgICAgICAgbGV0IGsgPSByaWdodCA+IGxlZnQgLSByaWdodCA/IGxlZnQgLSByaWdodCA6IHJpZ2h0O1xyXG4gICAgICAgICAgICBsZXQgcmVzID0gMTtcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gazsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICByZXMgPSAocmVzICogKGxlZnQgLSBpICsgMSkpIC8gaTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSByZXM7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJz0nOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSBsZWZ0ID09PSByaWdodDtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnc2luJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGguc2luKHJpZ2h0Kk1hdGguUEkgLyAxODApKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnY29zJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGguY29zKHJpZ2h0Kk1hdGguUEkgLyAxODApKVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICd0YW4nOlxyXG4gICAgICAgICAgICBpZiAocmlnaHQ+PTkwKXt0aHJvdyBuZXcgRXJyb3IoJ3RhbiBNdXN0IGJlIHNtYWxsZXIgdGhhbiA5MCcpO31cclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGgudGFuKHJpZ2h0Kk1hdGguUEkgLyAxODApKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnYXNpbic6XHJcbiAgICAgICAgY2FzZSAnYXJjc2luJzpcclxuICAgICAgICAgICAgc29sdmVkLnZhbHVlID0gKE1hdGguYXNpbihyaWdodCkgKiAoMTgwIC8gTWF0aC5QSSkpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICdhY29zJzpcclxuICAgICAgICBjYXNlICdhcmNjb3MnOlxyXG4gICAgICAgICAgICBzb2x2ZWQudmFsdWUgPSAoTWF0aC5hY29zKHJpZ2h0KSAqICgxODAgLyBNYXRoLlBJKSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ2F0YW4nOlxyXG4gICAgICAgIGNhc2UgJ2FyY3Rhbic6XHJcbiAgICAgICAgICAgIHNvbHZlZC52YWx1ZSA9IChNYXRoLmF0YW4ocmlnaHQpICogKDE4MCAvIE1hdGguUEkpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IFxyXG4gICAgfVxyXG4gICAgLy9hZGREZWJ1Z0luZm8oc29sdmVkLnZhbHVlLHNvbHZlZC52YXJpYWJsZSlcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogc29sdmVkLnBvdz8gJ3Bvd2VyVmFyaWFibGUnOnNvbHZlZC52YXJpYWJsZT8gJ3ZhcmlhYmxlJzogJ251bWJlcicsXHJcbiAgICAgICAgdmFsdWU6IHR5cGVvZiBzb2x2ZWQudmFsdWUgPT09ICdudW1iZXInID8gTWF0aC5yb3VuZChzb2x2ZWQudmFsdWUgKiAxMDAwMDApIC8gMTAwMDAwIDogc29sdmVkLnZhbHVlLCBcclxuICAgICAgICB2YXJpYWJsZTogc29sdmVkLnZhcmlhYmxlP3NvbHZlZC52YXJpYWJsZTonJyxcclxuICAgICAgICBwb3c6IHNvbHZlZC5wb3c/c29sdmVkLnBvdzonJyxcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbnRyb2xsZXIodG9rZW5zKSB7XHJcbiAgICBpZiAoIXByb2Nlc3NlZGlucHV0KXtwcm9jZXNzZWRpbnB1dD1yZWNvbnN0cnVjdCh0b2tlbnMpO31cclxuICAgIHRva2Vucz1jb25uZWN0KHRva2Vucyk7XHJcbiAgICBtYXRoPXJlY29uc3RydWN0KHRva2Vucyk7XHJcbiAgICBhZGREZWJ1Z0luZm8oJy8vbWF0aCcsIG1hdGgpOyBtYXRoSW5mby5wdXNoKG1hdGgpO1xyXG4gICAgaWYgKFxyXG4gICAgICAgIEFycmF5LmlzQXJyYXkodG9rZW5zKSBcclxuICAgICAgICAmJiB0b2tlbnMuc29tZSh0b2tlbiA9PiAvKHZhcmlhYmxlfHBvd1ZhcmlhYmxlKS8udGVzdCh0b2tlbi50eXBlKSkgXHJcbiAgICAgICAgJiYgIXRva2Vucy5zb21lKHRva2VuID0+IHRva2VuLnZhbHVlID09PSAnPScpXHJcbiAgICApIFxyXG4gICAge3JldHVybiBJbmZpbml0eX1cclxuXHJcbiAgICBsZXQgZXhwcmVzc2lvbiA9IHBvc2l0aW9uKHRva2VucyxudWxsKTsgXHJcbiAgICBhZGREZWJ1Z0luZm8oJ1BhcnNlZCBleHByZXNzaW9uJywgSlNPTi5zdHJpbmdpZnkoZXhwcmVzc2lvbiwgbnVsbCwgMC4wMSkpO1xyXG4gICAgaWYgKGV4cHJlc3Npb24gPT09IG51bGwmJnRva2Vucy5sZW5ndGg+MSl7XHJcbiAgICAgICAgcmV0dXJuIHNvbHV0aW9uKHRva2Vucyk7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChleHByZXNzaW9uID09PSBudWxsKXtcclxuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChwYXJzZUZsb2F0KHJlY29uc3RydWN0KHRva2VucykpICogMTAwMDApIC8gMTAwMDA7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICgvKGZyYWMpLy50ZXN0KGV4cHJlc3Npb24ub3BlcmF0b3IpJiYoZXhwcmVzc2lvbi5yaWdodFZhcmlhYmxlfHxleHByZXNzaW9uLmxlZnRWYXJpYWJsZSkpXHJcbiAgICB7XHJcbiAgICAgICAgLy9hZGREZWJ1Z0luZm8oZ29vZEJ5RnJhY3Rpb24odG9rZW5zLGV4cHJlc3Npb24pKVxyXG4gICAgICAgIHJldHVybiBjb250cm9sbGVyKGdvb2RCeUZyYWN0aW9uKHRva2VucyxleHByZXNzaW9uKSk7XHJcbiAgICB9XHJcbiAgICBpZiAoZXhwcmVzc2lvbi5yaWdodE11bHRpU3RlcHx8ZXhwcmVzc2lvbi5sZWZ0TXVsdGlTdGVwKVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBjb250cm9sbGVyKGV4cGFuZEV4cHJlc3Npb24odG9rZW5zLGV4cHJlc3Npb24pKVxyXG4gICAgfVxyXG4gICAgbGV0IHNvbHZlZCA9IHBhcnNlXHJcbiAgICAoXHJcbiAgICAgICAgdG9rZW5zLFxyXG4gICAgICAgIGV4cHJlc3Npb24ub3BlcmF0b3IsXHJcbiAgICAgICAgZXhwcmVzc2lvbi5zcGVjaWFsQ2hhcixcclxuICAgICAgICBleHByZXNzaW9uLmxlZnQgLFxyXG4gICAgICAgIGV4cHJlc3Npb24ubGVmdFZhcmlhYmxlICxcclxuICAgICAgICBleHByZXNzaW9uLnJpZ2h0LFxyXG4gICAgICAgIGV4cHJlc3Npb24ucmlnaHRWYXJpYWJsZSxcclxuICAgICAgICBleHByZXNzaW9uLnJpZ2h0UG93LFxyXG4gICAgKTtcclxuICAgIGlmIChzb2x2ZWQgPT09IG51bGwpIHtyZXR1cm4gbnVsbDsgfVxyXG4gICAgaWYgKHR5cGVvZiBzb2x2ZWQ9PT1gc3RyaW5nYCkge3JldHVybiBzb2x2ZWQ7ICB9XHJcbiAgICBhZGREZWJ1Z0luZm8oJ3NvbHZlZCcsc29sdmVkKVxyXG4gICAgYWRkRGVidWdJbmZvKCdzb2x2ZWQnLGFkZFNvbHV0aW9uKGV4cHJlc3Npb24sc29sdmVkKSlcclxuICAgIHNvbHV0aW9uSW5mby5wdXNoKGFkZFNvbHV0aW9uKGV4cHJlc3Npb24sc29sdmVkKSlcclxuICAgIC8vYWRkU29sdXRpb25JbmZvIChhZGRTb2x1dGlvbihleHByZXNzaW9uLHNvbHZlZCkrYFxcbmApXHJcbiAgICB0b2tlbnMuc3BsaWNlKGV4cHJlc3Npb24ubGVmdEJyZWFrLGV4cHJlc3Npb24ucmlnaHRCcmVhay1leHByZXNzaW9uLmxlZnRCcmVhayxzb2x2ZWQpXHJcbiAgICByZXR1cm4gdG9rZW5zLmxlbmd0aD4xP2NvbnRyb2xsZXIodG9rZW5zKTpyZWNvbnN0cnVjdCh0b2tlbnMpO1xyXG59XHJcbmZ1bmN0aW9uIGdvb2RCeUZyYWN0aW9uKHRva2VucywgZXhwcmVzc2lvbikge1xyXG4gICAgbGV0IHJlcGxhY2VtZW50VG9rZW5zID0gW107XHJcbiAgICBsZXQgZGVub21pbmF0b3IgPSB0b2tlbnMuc2xpY2UoZXhwcmVzc2lvbi50cmFuc2l0aW9uLCBleHByZXNzaW9uLnJpZ2h0QnJlYWspO1xyXG4gICAgXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG5cclxuICAgICAgICAvLyBTa2lwIHRva2VucyBpZiB3ZSBoYXZlIGFscmVhZHkgcHJvY2Vzc2VkIHRoaXMgc2VjdGlvblxyXG4gICAgICAgIGlmIChpID49IGV4cHJlc3Npb24uaW5kZXggJiYgaSA8IGV4cHJlc3Npb24ucmlnaHRCcmVhaykge1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudFRva2Vucy5wdXNoKC4uLnRva2Vucy5zbGljZShleHByZXNzaW9uLmluZGV4KzEsZXhwcmVzc2lvbi50cmFuc2l0aW9uKSlcclxuICAgICAgICAgICAgaSA9IGV4cHJlc3Npb24ucmlnaHRCcmVhay0xO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKC8oPSkvLnRlc3QodG9rZW5zW2ldLnZhbHVlKSkge1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudFRva2Vucy5wdXNoKHRva2Vuc1tpXSk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsZXQgcmVwbGFjZW1lbnQgPSB0b2tlbnMuc2xpY2UoaSxpKzEpXHJcbiAgICAgICAgbGV0IHdoZXJlQW1JID0gaTtcclxuICAgICAgICBsZXQgcmVzdD1bXTtcclxuICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnZnJhYycpIHtcclxuICAgICAgICAgICAgd2hlcmVBbUkgPSBwb3NpdGlvbih0b2tlbnMsIGkpO1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudFRva2Vucy5wdXNoKC4uLnRva2Vucy5zbGljZSh3aGVyZUFtSS5pbmRleCx3aGVyZUFtSS5pbmRleCsyKSlcclxuICAgICAgICAgICAgcmVzdD10b2tlbnMuc2xpY2Uod2hlcmVBbUkudHJhbnNpdGlvbi0xLHdoZXJlQW1JLnJpZ2h0QnJlYWspXHJcbiAgICAgICAgICAgIHJlcGxhY2VtZW50ID0gdG9rZW5zLnNsaWNlKGkgKyAyLCB3aGVyZUFtSS50cmFuc2l0aW9uLTEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB3aGVyZUFtST1pK3Rva2Vucy5zbGljZShpKS5maW5kSW5kZXgodG9rZW4gPT4gLyg9fGZyYWMpLy50ZXN0KHRva2VuLnZhbHVlKSlcclxuICAgICAgICAgICAgd2hlcmVBbUk9d2hlcmVBbUk8aT90b2tlbnMubGVuZ3RoOndoZXJlQW1JO1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudCA9IHRva2Vucy5zbGljZShpLHdoZXJlQW1JKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVwbGFjZW1lbnRUb2tlbnMucHVzaChcclxuICAgICAgICAgICAgLi4uZGVub21pbmF0b3IsXHJcbiAgICAgICAgICAgIHtcInR5cGVcIjogXCJvcGVyYXRvclwiLCBcInZhbHVlXCI6IFwiKlwifSxcclxuICAgICAgICAgICAge1widHlwZVwiOiBcInBhcmVuXCIsIFwidmFsdWVcIjogXCIoXCIsIFwiaWRcIjogMCwgXCJpbmRleFwiOiAwfSxcclxuICAgICAgICAgICAgLi4ucmVwbGFjZW1lbnQsXHJcbiAgICAgICAgICAgIHtcInR5cGVcIjogXCJwYXJlblwiLCBcInZhbHVlXCI6IFwiKVwiLCBcImlkXCI6IDAsIFwiaW5kZXhcIjogMH0sXHJcbiAgICAgICAgICAgIC4uLnJlc3RcclxuICAgICAgICApO1xyXG4gICAgICAgIGkgPSB0eXBlb2Ygd2hlcmVBbUkgPT09ICdvYmplY3QnID8gd2hlcmVBbUkucmlnaHRCcmVhay0xIDogd2hlcmVBbUktMTtcclxuICAgIH1cclxuICAgIHJlcGxhY2VtZW50VG9rZW5zPWNvbm5lY3QocmVwbGFjZW1lbnRUb2tlbnMpXHJcbiAgICBhZGREZWJ1Z0luZm8oYGdvb2RCeUZyYWN0aW9uYCxyZWNvbnN0cnVjdChyZXBsYWNlbWVudFRva2VucykpXHJcbiAgICBzb2x1dGlvbkluZm8ucHVzaChyZWNvbnN0cnVjdChyZXBsYWNlbWVudFRva2VucykpXHJcbiAgICByZXR1cm4gcmVwbGFjZW1lbnRUb2tlbnM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlSURwYXJlbnRoZXNlcyh0b2tlbnMpIHtcclxuICAgIGxldCBicmFja2V0cyA9IDAsIGxldmVsQ291bnQgPSB7fTtcclxuICAgIFxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnKCcpIHtcclxuICAgICAgICAgICAgaWYgKCFsZXZlbENvdW50W2JyYWNrZXRzXSkge1xyXG4gICAgICAgICAgICAgICAgbGV2ZWxDb3VudFticmFja2V0c10gPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGxldCBJRCA9IGxldmVsQ291bnRbYnJhY2tldHNdKys7XHJcbiAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxyXG4gICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgJy4nICsgSUQgfTtcclxuICAgICAgICAgICAgYnJhY2tldHMrKztcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgPT09ICcpJykge1xyXG4gICAgICAgICAgICBicmFja2V0cy0tO1xyXG4gICAgICAgICAgICBsZXQgSUQgPSBsZXZlbENvdW50W2JyYWNrZXRzXSAtIDE7XHJcbiAgICAgICAgICAgIC8vIFJlYXNzaWduIHRoZSBvYmplY3Qgd2l0aCB0aGUgbmV3IGlkIHRvIGVuc3VyZSBwZXJzaXN0ZW5jZVxyXG4gICAgICAgICAgICB0b2tlbnNbaV0gPSB7IC4uLnRva2Vuc1tpXSwgaWQ6IGJyYWNrZXRzICsgJy4nICsgKElEID49IDAgPyBJRCA6IDApIH07XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB0b2tlbnM7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBleHBhbmRFeHByZXNzaW9uKHRva2VucywgZXhwcmVzc2lvbikge1xyXG4gICAgbGV0IHJlcGxhY2VtZW50Q2VsbCA9IFtdO1xyXG4gICAgbGV0IGxlZnQgPSB0b2tlbnMuc2xpY2UoZXhwcmVzc2lvbi5sZWZ0QnJlYWssIGV4cHJlc3Npb24uaW5kZXgpLmZpbHRlcihpdGVtID0+IC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KGl0ZW0udHlwZSkpO1xyXG4gICAgbGV0IHJpZ2h0ID0gdG9rZW5zLnNsaWNlKGV4cHJlc3Npb24uaW5kZXgsIGV4cHJlc3Npb24ucmlnaHRCcmVhaykuZmlsdGVyKGl0ZW0gPT4gLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QoaXRlbS50eXBlKSk7XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZWZ0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCByaWdodC5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgICByZXBsYWNlbWVudENlbGwucHVzaChsZWZ0W2ldKTtcclxuICAgICAgICAgICAgcmVwbGFjZW1lbnRDZWxsLnB1c2goeyBcInR5cGVcIjogXCJvcGVyYXRvclwiLCBcInZhbHVlXCI6IFwiKlwiLCBcImluZGV4XCI6IDAgfSk7XHJcbiAgICAgICAgICAgIHJlcGxhY2VtZW50Q2VsbC5wdXNoKHJpZ2h0W2pdKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICB0b2tlbnMuc3BsaWNlKGV4cHJlc3Npb24ubGVmdEJyZWFrLCBleHByZXNzaW9uLnJpZ2h0QnJlYWsgLSAgZXhwcmVzc2lvbi5sZWZ0QnJlYWssIC4uLnJlcGxhY2VtZW50Q2VsbCk7XHJcbiAgICB0b2tlbnM9cmVvcmRlcih0b2tlbnMpXHJcbiAgICBhZGREZWJ1Z0luZm8oYGV4cGFuZEV4cHJlc3Npb25gLHJlY29uc3RydWN0KHRva2VucykpXHJcbiAgICBzb2x1dGlvbkluZm8ucHVzZShyZWNvbnN0cnVjdCh0b2tlbnMpKVxyXG4gICAgcmV0dXJuIHRva2VucztcclxufVxyXG5cclxuZnVuY3Rpb24gYWRkU29sdXRpb24oZXhwcmVzc2lvbixzb2x2ZWQpe1xyXG4gICAgbGV0IHNvbHV0aW9uPXJlY29uc3RydWN0KFtzb2x2ZWRdKTtcclxuICAgIGxldCBsZWZ0PWV4cHJlc3Npb24ubGVmdD9yZWNvbnN0cnVjdChbe3R5cGU6IGV4cHJlc3Npb24ubGVmdFR5cGUsIHZhbHVlOiBleHByZXNzaW9uLmxlZnQsIHZhcmlhYmxlOiBleHByZXNzaW9uLmxlZnRWYXJpYWJsZSwgcG93OiBleHByZXNzaW9uLmxlZnRQb3d9XSk6Jyc7XHJcbiAgICBsZXQgcmlnaHQ9ZXhwcmVzc2lvbi5yaWdodD9yZWNvbnN0cnVjdChbe3R5cGU6IGV4cHJlc3Npb24ucmlnaHRUeXBlLCB2YWx1ZTogZXhwcmVzc2lvbi5yaWdodCwgdmFyaWFibGU6IGV4cHJlc3Npb24ucmlnaHRWYXJpYWJsZSwgcG93OiBleHByZXNzaW9uLnJpZ2h0UG93fV0pOicnO1xyXG4gICAgc3dpdGNoIChleHByZXNzaW9uLm9wZXJhdG9yKXtcclxuICAgICAgICBjYXNlICdeJzpcclxuICAgICAgICAgICAgcmV0dXJuICBgJHtsZWZ0fSBeIHske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICBjYXNlICcrJzpcclxuICAgICAgICBjYXNlICctJzpcclxuICAgICAgICBjYXNlICcqJzpcclxuICAgICAgICAgICAgcmV0dXJuICBgJHtsZWZ0fSAke2V4cHJlc3Npb24ub3BlcmF0b3IucmVwbGFjZSgvXFwqL2csIFwiXFxcXGNkb3RcIil9ICR7cmlnaHR9ID0gJHtyZWNvbnN0cnVjdChzb2x1dGlvbil9YFxyXG4gICAgICAgIGNhc2UgJz0nOlxyXG4gICAgICAgICAgICByZXR1cm4gYFxcXFxmcmFjeyR7bGVmdH19eyR7cmlnaHR9fSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgIGNhc2UgJ3NxcnQnOlxyXG4gICAgICAgICAgICByZXR1cm4gIGBcXFxcJHtleHByZXNzaW9uLm9wZXJhdG9yfXske3JpZ2h0fX0gPSAke3NvbHV0aW9ufWBcclxuICAgICAgICBjYXNlICdzaW4nOlxyXG4gICAgICAgIGNhc2UgJ2Nvcyc6XHJcbiAgICAgICAgY2FzZSAndGFuJzpcclxuICAgICAgICBjYXNlICdhc2luJzpcclxuICAgICAgICBjYXNlICdhY29zJzpcclxuICAgICAgICBjYXNlICdhdGFuJzpcclxuICAgICAgICBjYXNlICdhcmNzaW4nOlxyXG4gICAgICAgIGNhc2UgJ2FyY2Nvcyc6XHJcbiAgICAgICAgY2FzZSAnYXJjdGFuJzpcclxuICAgICAgICAgICAgcmV0dXJuICBgXFxcXCR7ZXhwcmVzc2lvbi5vcGVyYXRvcn0gKCR7cmlnaHR9KSA9ICR7c29sdXRpb259YFxyXG4gICAgICAgIGNhc2UgJ2Jpbm9tJzpcclxuICAgICAgICBjYXNlICdmcmFjJzpcclxuICAgICAgICBjYXNlICcvJzpcclxuICAgICAgICAgICAgcmV0dXJuIGBcXFxcJHtleHByZXNzaW9uLm9wZXJhdG9yLnJlcGxhY2UoJy8nLFwiZnJhY1wiKX17JHtsZWZ0fX17JHtyaWdodH19ID0gJHtzb2x1dGlvbn1gXHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbFxyXG59XHJcblxyXG5mdW5jdGlvbiByZWNvbnN0cnVjdCh0b2tlbnMpe1xyXG4gICAgbGV0IG1hdGggPSAnJztcclxuICAgIGZvciAobGV0IGk9MDtpPHRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICBpZiAodG9rZW5zW2ldLnZhbHVlPT09JygnJiZ0b2tlbnNbdG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuLCBpbmRleCkgPT4gdG9rZW4uaWQgPT09IHRva2Vuc1tpXS5pZCYmdG9rZW5zW2luZGV4KzFdKSsxXS52YWx1ZT09PScvJylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG1hdGgrPSdcXFxcZnJhYydcclxuICAgICAgICB9XHJcbiAgICAgICAgc3dpdGNoICh0b2tlbnNbaV0udHlwZSl7XHJcbiAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XHJcbiAgICAgICAgICAgICAgICBtYXRoKz0odG9rZW5zW2ldLnZhbHVlPj0wJiZ0b2tlbnNbaS0xXSYmKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLy50ZXN0KHRva2Vuc1tpLTFdLnR5cGUpfHx0b2tlbnNbaS0xXS52YWx1ZT09PScpJyk/JysnOicnKSt0b2tlbnNbaV0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICBtYXRoKz1pKzE8dG9rZW5zLmxlbmd0aCYmLyhmcmFjKS8udGVzdCh0b2tlbnNbaSsxXS52YWx1ZSk/JysnOicnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ3BhcmVuJzpcclxuICAgICAgICAgICAgICAgIGxldCB0ZW1wPXRva2Vuc1t0b2tlbnMuZmluZEluZGV4KHRva2VuID0+IHRva2VuLmlkID09PSB0b2tlbnNbaV0uaWQpLTFdXHJcbiAgICAgICAgICAgICAgICBpZiAoKHR5cGVvZiB0ZW1wICE9PSBcInVuZGVmaW5lZFwiJiYvKGZyYWN8c3FydHxcXF58XFwvKS8udGVzdCh0ZW1wLnZhbHVlKSkpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0udmFsdWUucmVwbGFjZSgvXFwoLywnXFx7JykucmVwbGFjZSgvXFwpLywnXFx9Jyk7YnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgdGVtcCAhPT0gXCJ1bmRlZmluZWRcIiYmL1xcKS8udGVzdCh0ZW1wLnZhbHVlKSYmLyhmcmFjfHNxcnR8XFxefFxcLykvLnRlc3QodG9rZW5zW3Rva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4uaWQgPT09IHRlbXAuaWQpLTFdLnZhbHVlKSlcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0udmFsdWUucmVwbGFjZSgvXFwoLywnXFx7JykucmVwbGFjZSgvXFwpLywnXFx9Jyk7YnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpPjAmJnRva2Vuc1tpXS52YWx1ZT09PScoJyYmdG9rZW5zW2ktMV0/LnZhbHVlPT09JyknKXttYXRoKz0nKyd9XHJcbiAgICAgICAgICAgICAgICBtYXRoKz10b2tlbnNbaV0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnb3BlcmF0b3InOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbaV0udmFsdWUgIT09ICcvJykge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWUpLnJlcGxhY2UoLyhbXlxcKlxcXj1cXC9dKS8sXCJcXFxcJDFcIikucmVwbGFjZSgvXFwqL2csYFxcXFxjZG90IGApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICd2YXJpYWJsZSc6XHJcbiAgICAgICAgICAgICAgICBtYXRoKz0odG9rZW5zW2ldLnZhbHVlPj0wJiZ0b2tlbnNbaS0xXSYmLyhudW1iZXJ8dmFyaWFibGV8cG93ZXJWYXJpYWJsZSkvLnRlc3QodG9rZW5zW2ktMV0udHlwZSk/JysnOicnKSsodG9rZW5zW2ldLnZhbHVlIT09MT90b2tlbnNbaV0udmFsdWU6JycpK3Rva2Vuc1tpXS52YXJpYWJsZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdwb3dlclZhcmlhYmxlJzpcclxuICAgICAgICAgICAgICAgIG1hdGgrPSh0b2tlbnNbaV0udmFsdWU+PTAmJnRva2Vuc1tpLTFdJiYvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8udGVzdCh0b2tlbnNbaS0xXS50eXBlKT8nKyc6JycpKyh0b2tlbnNbaV0udmFsdWUhPT0xP3Rva2Vuc1tpXS52YWx1ZTonJykrdG9rZW5zW2ldLnZhcmlhYmxlK2BeeyR7dG9rZW5zW2ldLnBvd319YDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG1hdGhcclxufVxyXG5mdW5jdGlvbiByZW9yZGVyKHRva2Vucyl7XHJcbiAgICBsZXQgbmV3VG9rZW5zID0gW107XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGxldCBuZXdUb2tlbiA9IHsgLi4udG9rZW5zW2ldLCBpbmRleDogaSB9O1xyXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKG5ld1Rva2VuKTtcclxuICAgIH1cclxuICAgIHJldHVybiBuZXdUb2tlbnM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbm5lY3QodG9rZW5zKXtcclxuICAgIGxldCBpPTAsbW9yZUNvbm5lY3RlZFRva2Vucz10cnVlO1xyXG4gICAgd2hpbGUgKGkgPCAxMDAgJiYgbW9yZUNvbm5lY3RlZFRva2Vucykge1xyXG4gICAgICAgIGkrKztcclxuICAgICAgICBsZXQgaW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbiwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICghdG9rZW5zW2luZGV4ICsgMl0gfHwgdG9rZW5zW2luZGV4ICsgMl0udHlwZSE9PSdvcGVyYXRvcicpICYmXHJcbiAgICAgICAgICAgICgodG9rZW4udHlwZSA9PT0gJ251bWJlcicgJiYgdG9rZW4udHlwZSA9PT0gdG9rZW5zW2luZGV4ICsgMV0/LnR5cGUpIHx8XHJcbiAgICAgICAgICAgICh0b2tlbi50eXBlID09PSAndmFyaWFibGUnICYmIHRva2VuLnR5cGUgPT09IHRva2Vuc1tpbmRleCArIDFdPy50eXBlICYmIHRva2VuLnZhcmlhYmxlID09PSB0b2tlbnNbaW5kZXggKyAxXT8udmFyaWFibGUpKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICB0b2tlbnNbaW5kZXhdLnZhbHVlKz10b2tlbnNbaW5kZXgrMV0udmFsdWVcclxuICAgICAgICAgICAgdG9rZW5zLnNwbGljZShpbmRleCArIDEsIDEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBsZXQgb3BlblBhcmVuSW5kZXg9LTEsY2xvc2VQYXJlbkluZGV4PS0xO1xyXG4gICAgICAgIGxldCBjaGVja3RQYXJlbj0tMTtcclxuICAgICAgICB3aGlsZSAoaTwxMDApIHtcclxuICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICBvcGVuUGFyZW5JbmRleCA9IHRva2Vucy5maW5kSW5kZXgoKHRva2VuLCBpbmRleCkgPT5cclxuICAgICAgICAgICAgICAgIHRva2VuLnZhbHVlID09PSAnKCcgJiYgaW5kZXggPiBjaGVja3RQYXJlbiAmJlxyXG4gICAgICAgICAgICAgICAgKGluZGV4ID09PSAwIHx8ICAvLyBIYW5kbGUgY2FzZSBmb3IgZmlyc3QgdG9rZW5cclxuICAgICAgICAgICAgICAgIChpbmRleCAtIDEgPj0gMCAmJiB0b2tlbnNbaW5kZXggLSAxXSAmJiAoIS8ob3BlcmF0b3J8cGFyZW4pLy50ZXN0KHRva2Vuc1tpbmRleCAtIDFdLnR5cGUpIHx8IC9bPV0vLnRlc3QodG9rZW5zW2luZGV4IC0gMV0udmFsdWUpKSkpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjbG9zZVBhcmVuSW5kZXggPSBvcGVuUGFyZW5JbmRleCA9PT0gLTE/LTE6dG9rZW5zLmZpbmRMYXN0SW5kZXgoKHRva2VuLCBpbmRleCkgPT5cclxuICAgICAgICAgICAgICAgIHRva2VuLnZhbHVlID09PSAnKScgJiZcclxuICAgICAgICAgICAgICAgIHRva2VuLmlkID09PSB0b2tlbnNbb3BlblBhcmVuSW5kZXhdLmlkICYmXHJcbiAgICAgICAgICAgICAgICAoKHRva2Vucy5sZW5ndGgtMT5pbmRleCAgJiYodG9rZW5zW2luZGV4ICsgMV0udHlwZSAhPT0gJ29wZXJhdG9yJ3x8L1s9XS8udGVzdCh0b2tlbnNbaW5kZXggKyAxXS52YWx1ZSkpfHwgdG9rZW5zLmxlbmd0aC0xPT09aW5kZXgpXHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBpZiAob3BlblBhcmVuSW5kZXg9PT0tMXx8Y2xvc2VQYXJlbkluZGV4IT09LTEpe2JyZWFrO31cclxuICAgICAgICAgICAgY2hlY2t0UGFyZW49b3BlblBhcmVuSW5kZXg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjbG9zZVBhcmVuSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgIHRva2VucyA9IHRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT5cclxuICAgICAgICAgICAgICAgIGlkeCAhPT0gb3BlblBhcmVuSW5kZXggJiYgaWR4ICE9PSBjbG9zZVBhcmVuSW5kZXhcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGluZGV4ID09PSAtMSAmJiBjbG9zZVBhcmVuSW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHRva2Vucz1yZW9yZGVyKHRva2VucylcclxuICAgIHRva2Vucz1yZUlEcGFyZW50aGVzZXModG9rZW5zKVxyXG4gICAgcmV0dXJuIHRva2VucztcclxufVxyXG5mdW5jdGlvbiBzaW1wbGlmaXkodG9rZW5zKXtcclxuICAgIGxldCBpPTAsbmV3VG9rZW5zPVtdO1xyXG4gICAgd2hpbGUgKGk8PTEwMCYmdG9rZW5zLnNvbWUodG9rZW4gPT4gKC8obnVtYmVyfHZhcmlhYmxlfHBvd2VyVmFyaWFibGUpLykudGVzdCh0b2tlbi50eXBlKSkpXHJcbiAgICB7XHJcbiAgICAgICAgaSsrO1xyXG4gICAgICAgIGxldCBlcWluZGV4PXRva2Vucy5maW5kSW5kZXgodG9rZW4gPT4gdG9rZW4udmFsdWUgPT09ICc9Jyk7XHJcbiAgICAgICAgbGV0IE9wZXJhdGlvbkluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW4pID0+ICgvKG51bWJlcnx2YXJpYWJsZXxwb3dlclZhcmlhYmxlKS8pLnRlc3QodG9rZW4udHlwZSkpO1xyXG4gICAgICAgIGlmIChPcGVyYXRpb25JbmRleD09PS0xKXthZGREZWJ1Z0luZm8oaSk7cmV0dXJuIHRva2Vuczt9XHJcbiAgICAgICAgbGV0IGN1cnJlbnRUb2tlbj17dHlwZTogdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICwgdmFsdWU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFsdWUsdmFyaWFibGU6IHRva2Vuc1tPcGVyYXRpb25JbmRleF0udmFyaWFibGUgLHBvdzogdG9rZW5zW09wZXJhdGlvbkluZGV4XS5wb3d9XHJcblxyXG4gICAgICAgIGxldCBudW1iZXJHcm91cCA9IHRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpKSA9PiAoeyB0b2tlbiwgb3JpZ2luYWxJbmRleDogaSB9KSkgXHJcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0udG9rZW4udHlwZT09PWN1cnJlbnRUb2tlbi50eXBlKSBcclxuICAgICAgICAucmVkdWNlKChzdW0sIGl0ZW0pID0+IHtcclxuICAgICAgICBsZXQgbXVsdGlwbGllcj0odG9rZW5zW2l0ZW0ub3JpZ2luYWxJbmRleCAtIDFdICYmIHRva2Vuc1tpdGVtLm9yaWdpbmFsSW5kZXggLSAxXS52YWx1ZSA9PT0gJy0nKSA/IC0xIDogMTtcclxuICAgICAgICBtdWx0aXBsaWVyICo9IChpdGVtLm9yaWdpbmFsSW5kZXggPD0gZXFpbmRleCkgPyAtMSA6IDE7IFxyXG4gICAgICAgIGlmICghKC8obnVtYmVyKS8pLnRlc3QoaXRlbS50b2tlbi50eXBlKSl7bXVsdGlwbGllcio9LTF9XHJcbiAgICAgICAgcmV0dXJuIHN1bSArIChpdGVtLnRva2VuLnZhbHVlICogbXVsdGlwbGllcik7XHJcbiAgICAgICAgfSwgMCk7IFxyXG4gICAgICAgIFxyXG4gICAgICAgIG5ld1Rva2Vucy5wdXNoKHsgXHJcbiAgICAgICAgICAgIHR5cGU6IGN1cnJlbnRUb2tlbi50eXBlLCBcclxuICAgICAgICAgICAgdmFsdWU6IG51bWJlckdyb3VwLFxyXG4gICAgICAgICAgICB2YXJpYWJsZTogY3VycmVudFRva2VuLnZhcmlhYmxlLFxyXG4gICAgICAgICAgICBwb3c6IGN1cnJlbnRUb2tlbi5wb3csXHJcbiAgICAgICAgfSlcclxuXHJcbiAgICAgICAgdG9rZW5zPSB0b2tlbnMuZmlsdGVyKHRva2VuID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuICEodG9rZW4udHlwZSA9PT0gdG9rZW5zW09wZXJhdGlvbkluZGV4XS50eXBlICYmXHJcbiAgICAgICAgICAgICAgICAgICAgKCF0b2tlbi52YXJpYWJsZSB8fCB0b2tlbi52YXJpYWJsZSA9PT0gY3VycmVudFRva2VuLnZhcmlhYmxlKSAmJlxyXG4gICAgICAgICAgICAgICAgICAgICghdG9rZW4ucG93IHx8IHRva2VuLnBvdyA9PT0gY3VycmVudFRva2VuLnBvdykpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ld1Rva2VucztcclxufVxyXG5cclxuZnVuY3Rpb24gcXVhZChhLGIsYyx2YXJpYWJsZSkge1xyXG4gICAgYWRkRGVidWdJbmZvKCdxdWFkJyxgYSA9ICR7YX0sIGIgPSAke2J9LCBjID0gJHtjfWApXHJcbiAgICBzb2x1dGlvbkluZm8ucHVzaChgYSA9ICR7YX0sIGIgPSAke2J9LCBjID0gJHtjfWApXHJcbiAgICBsZXQgeDEgPSAoLWIgKyBNYXRoLnNxcnQoTWF0aC5wb3coYiwgMikgLSA0ICogYSAqIGMpKSAvICgyICogYSk7XHJcbiAgICBsZXQgeDIgPSAoLWIgLSBNYXRoLnNxcnQoTWF0aC5wb3coYiwgMikgLSA0ICogYSAqIGMpKSAvICgyICogYSk7XHJcbiAgICB4MT1NYXRoLnJvdW5kKHgxICogMTAwMDApIC8gMTAwMDBcclxuICAgIHgyPU1hdGgucm91bmQoeDIgKiAxMDAwMCkgLyAxMDAwMFxyXG4gICAgcmV0dXJuIHgxPT09eDI/YCR7dmFyaWFibGV9ID0gJHt4MX1gOmAke3ZhcmlhYmxlfV8xID0gJHt4MX0sJHt2YXJpYWJsZX1fMiA9ICR7eDIudG9GaXhlZCgzKX1gO1xyXG59XHJcbiAgICBzb2x1dGlvbj1jb250cm9sbGVyKHRva2Vucyk7XHJcbiAgICBcclxuICAgIGlmICh0eXBlb2YgbWF0aEV4cHJlc3Npb24gPT09IFwidW5kZWZpbmVkXCIpXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGBsYXRleDogJHtsYXRleH0sXFxucHJvY2Vzc2VkaW5wdXQ6ICR7cHJvY2Vzc2VkaW5wdXR9LFxcbkxlbmd0aDogJHtsYXRleC5sZW5ndGh9LFxcblRva2VuczogJHt0b2tlbnMubGVuZ3RofVxcbnNvbHV0aW9uOiAke3NvbHV0aW9ufVxcbkRlYnVnIEluZm86XFxuJHtkZWJ1Z0luZm99YDsgXHJcbiAgICB9XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHNvbHV0aW9uOiBzb2x1dGlvbixcclxuICAgICAgICBwcm9jZXNzZWRpbnB1dDogcHJvY2Vzc2VkaW5wdXQgfHwgJycsXHJcbiAgICAgICAgbWF0aEluZm86IG1hdGhJbmZvIHx8ICcnLCAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHNvbHV0aW9uSW5mbzogc29sdXRpb25JbmZvIHx8ICcnLCBcclxuICAgICAgICBkZWJ1Z0luZm86IGRlYnVnSW5mbyB8fCAnJywgICAgXHJcbiAgICB9O1xyXG59Il19