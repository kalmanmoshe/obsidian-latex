export function controller(mathExpression) {
    let Error = [];
    let debugInfo = '', mathInfo = '', solutionInfo=''; 
    let mathPattern=[]// "Big tokens" These will be implemented. in replacement?
    let replacementCell=''; //Remember replacement cell strategy
    //let latex= await tp.system.clipboard();
    let latex = String.raw`2 \frac{(5-3)34}{\sqrt{2^{2}}}0.5`;
    //const latex = String.raw`1-0.00887*0.455^{4}(1-0.455)^{2}-0.19095*0.455^{4}(1-0.455)^{2}`;
    
    function addDebugInfo(msg, value) {
        debugInfo += (typeof msg==="object"?JSON.stringify(msg):msg)+` : `+(typeof value==="object"?JSON.stringify(value):value)+ `\n `;
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
        let number=0,  startPos = i,vari='';
        if (/[+-]/.test(math[i])||i+math.slice(i).search(/[0-9.]+([a-zA-Z])/)===i){continue;}
        // Multiplication before parentheses
        if (math[i] === '(') {
            if (tokens.length-1>=0&&/(number|variable)/.test(tokens[tokens.length-1].type)) {
                math = math.slice(0, i) + '*' + math.slice(i);
                i--; continue;
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
            // Multiplication between parentheses. and multiplication after parentheses
            const lastIndex = tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id) - 1;
            if ((math[i+1] === '('&&(lastIndex<0||!/(frac|binom)/.test(tokens[lastIndex].value)))
                ||(i+1<math.length&&/[0-9A-Za-z.]/.test(math[i+1]))) {
            math = math.slice(0, i+1) + '*' + math.slice(i+1);
            }
            continue;
        }
        if (/[\*\/^=]/.test(math[i])) {
            tokens.push({ type: 'operator', value: math[i], index: tokens.length?tokens.length:0 });
            continue;
        }
        if (math[i] === '\\') {  
            if (tokens.length>0&&/(number)/.test(tokens[tokens.length-1].type)) {
                math = math.slice(0, i) + '*' + math.slice(i);
                i--; continue;
            }
            i+=1;  
            let operator = (math.slice(i).match(/[a-zA-Z]+/) || [""])[0]
            
            tokens.push({ type: 'operator', value: operator, index: tokens.length });
            i+=operator.length;
            if (tokens[tokens.length - 1].value === 'sqrt' && math[i] === '[' && i < math.length - 2) {
                let temp=math.slice(i,i+1+math.slice(i).search(/[\]]/));
                i+=temp.length
                Object.assign(tokens[tokens.length-1],{specialChar: safeToNumber(temp),})
            }
            i--;
            continue;
        }
    
        if (i+math.slice(i).search(/[0-9.]+(?![a-zA-Z])/)===i)
        {
            number=(math.slice(i).match(/[0-9.]+(?![a-zA-Z])/)||0)[0]
    
            i+=number.length>1?number.length-1:0;
            if(/[+-]/.test(math[startPos-1])){number=math[startPos-1]+number}
            
            
            if (math[i+1]&&/[a-zA-Z]/.test(math[i+1])){continue;}
            if (1===2&&math[startPos-1] === ')') {
                
                math = math.slice(0, startPos) + '*' + math.slice(startPos);  
                i++;
            }
            tokens.push({ type: 'number', value: parseFloat(number), index: tokens.length?tokens.length:0 });
            continue;
        }
        
        if (/[a-zA-Z]/.test(math[i])) {
            vari= (math.slice(i).match(/[a-zA-Z]+/) || [""])[0];
            if (vari&&vari.length===0){vari=math.slice(i,math.length)}
            number=math.slice(i+vari.length,vari.length+i+math.slice(i+vari.length).search(/[^0-9]/))
            
            i+=vari.length+number.length-1;
            number=safeToNumber(number.length>0?number:1);
            if (/[0-9]/.test(math[startPos>0?startPos-1:0])&&tokens)
            {
                number=(math.slice(0,startPos).match(/[0-9]+(?=[^0-9]*$)/)|| [""])[0];
                number=math[startPos-number.length-1]&&math[startPos-number.length-1]==='-'?'-'+number:number;
            }
            else if(/[-]/.test(math[startPos-1])){number=math[startPos-1]+number}
            tokens.push({type: 'variable',variable: vari,value: safeToNumber(number), index: tokens.length});
            
            continue;
        }
        Error.push(`Unknown char "${math[i]}"`);
    }
        if (brackets!==0)
        {
            Error.push(`Error: Unmatched opening bracket(s)`);
        }
        
    
    addDebugInfo('Tokens after tokenize', tokens);
    function safeToNumber(value) {
        if (!typeof value === `tring`){return value}
        if (value==='+'){return 0}
        if (value==='-'){return -1}
        if (/[a-zA-Z]/.test(value)){return 1}
        if(/[\(\[]/.test(value[0])){value = value.slice(1)}
        if(/[\)\]]/.test(value[value.length-1])){value = value.slice(0,value.length-1)}
        for (let i = 0; i >0; i++) {
            if (typeof value[i] === 'string' && /[\(\)\[\]]/.test(value[i])) {
                value = value.slice(0, i) + value.slice(i + 1);
                i--;
            }
        }
    const num = Number(value);
    return isNaN(num) ? value.length>0?value:0 : num;
    }
    
    function intID(partID, int) {
        let [baseID, subID = 0] = partID.split('.').map(Number);
        let [baseIN, subIN = 0] = String(int).split('.').map(Number);
        return `${baseID + baseIN}.${subID + subIN}`;
    }
    
    function operationsOrder(tokens) {
        function findOperatorIndex(begin, end, tokens, regex) {
            while (begin < end && begin < tokens.length) {
                let index;
                
                if (regex) {
                    index = tokens.slice(begin, end).findIndex(token => token.type === 'operator' && regex.test(token.value));
                } else {
                    index = tokens.slice(begin, end).findIndex(token => token.type === 'operator');
                }
        
                if (index === -1) return -1;
        
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
        if (temp >= 0) {return temp;}
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
            operatorFound = findOperatorIndex(begin,end,tokens)!==-1;
    
            // If no operator is found, mark this parentheses pair as checked
            if (!operatorFound) {
                checkedIDs.push(currentID);  
                currentID = null;  
            }
        }
        
        tokenSlice=tokens.slice(begin , end)
        // Find indices based on operator precedence
        let priority1 = findOperatorIndex(begin , end,tokens,/(\^|sqrt)/);
        let priority2 = findOperatorIndex(begin , end,tokens, /(frac|binom|sin|cos|tan|asin|acos|atan)/);
        let priority3 = findOperatorIndex(begin , end,tokens, /(\*|\/)/);
        let priority4 = findOperatorIndex(begin , end,tokens, /[+-]/);
        let priority5 = findOperatorIndex(begin , end,tokens, /=/);
        
        return [priority1, priority2, priority3, priority4, priority5].find(index => index !== -1)??null;
        
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
        } else {
            left = tokens[index - 1];
        }
    
        if (!left) {
            return null; // If no valid left token is found, return null
        }
    
        return {
            type: left.pow? 'powerVariable':left.variable? 'variable': 'number',
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
            right = tokens.slice(index, breakChar).find(item => /(number|variable|powerVariable)/.test(item.type))
        } else {
            right = tokens[index + 1];
        }
        if (!right) {
            return null; 
        }
        return {
            type: right.pow? 'powerVariable':right.variable? 'variable': 'number',
            variable: right.variable,
            value: safeToNumber(right.value),
            pow: right.pow,
            multiStep: breakChar - index >= 4,
            breakChar: breakChar !== index ? breakChar + 1 : right.index + 1,
        };
    }
    
    function position(tokens) {
        let index = operationsOrder(tokens), leftObj = null, rightObj = null;
    
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
            ...(typeof leftObj === 'object'
                ? { left: leftObj.value, leftType: leftObj.type,leftVariable: leftObj.variable, leftPow: leftObj.pow, leftMultiStep: leftObj.multiStep, leftBreak: leftObj.breakChar }
                : { left: null, leftBreak: leftObj }),
            ...rightObj && { right: rightObj.value, rightType: rightObj.type, rightVariable: rightObj.variable, rightPow: rightObj.pow, rightMultiStep: rightObj.multiStep, rightBreak: rightObj.breakChar },
        };
    }
    
    function parse(operator,specialChar, left, leftVar, right, rightVar,rightPow) { 
        if (!left&&!/(sqrt|cos|sin|tan)/.test(operator)) {
            Error.push(`Error: Left side of `+operator+` must have a value`);
            return null;
        }
        if (!right) {
            Error.push(`Error: Right side of `+operator+` must have a value`);
            return null;
        }
        let solved={value: 0,variable: '',pow: ''}; 
        switch (operator) {
            case 'sqrt':
                solved.value = Math.pow(right,specialChar!==null?(1)/(specialChar):0.5);
                break;
            case '^':
                if (leftVar||rightVar)
                {
                    solved.variable=leftVar||leftVar===rightVar?leftVar:rightVar?rightVar:'';
                    solved.pow=right
                }
                solved.value = Math.pow(left,right);
                break;
            case 'frac':
            case '/':
                solved.value = (left)/(right);
                break;
            case '*':
                solved.value = left * right;
                if (leftVar&&!rightVar){solved.variable=leftVar}
                else if (!leftVar&&rightVar){solved.variable=rightVar}
                else if (leftVar&&rightVar){solved.variable=rightVar;solved.pow=2}
                break;
            case '+':
                solved.value = left + right;
                solved.variable=leftVar?leftVar:rightVar;
                break;
            case '-':
                solved.value = left - right;
                solved.variable=leftVar?leftVar:rightVar;
                break;
            case 'binom':
                if (Number.isNaN(left) || Number.isNaN(right) || left < 0 || right < 0) {return null;}
                if (right > left) {solved.value = 0;break;}
                if (right === 0 || right === left) {solved.value = 1;break;}
                if (right === 1 || right === left - 1) {solved.value = left;break;}
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
                solved.value = (Math.sin(right*Math.PI / 180));
                break;
            case 'cos':
                solved.value = (Math.cos(right*Math.PI / 180))
                break;
            case 'tan':
                if (right>=90){Error.push('tan Must be smaller than 90');}
                solved.value = (Math.tan(right*Math.PI / 180));
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
            type: solved.pow? 'powerVariable':solved.variable? 'variable': 'number',
            value: typeof solved.value === 'number' ? Math.round(solved.value * 100000) / 100000 : solved.value, 
            variable: solved.variable?solved.variable:'',
            pow: solved.pow?solved.pow:'',
        };
    }
    
    function controller(tokens) {
        tokens=connect(tokens);
        tokens=reorder(tokens);
        math=reconstruct(tokens);
        addDebugInfo('//math', math);
        addmathInfo(`${math}\n`);
        if (
            Array.isArray(tokens) 
            && tokens.some(token => token.type === 'variable') 
            && !tokens.some(token => token.value === '=')
        ) 
        {return Infinity}
        //return tokens;
        let expression = position(tokens); 
        addDebugInfo('Parsed expression', JSON.stringify(expression, null, 0.01));
        //if (expression !== null && !(tokens.some(token => token.type === 'operator' && token.value !== '='))&& tokens.some(token => token.type === 'variable')) {return math;}
    
        if (expression === null){
            return Math.round(parseFloat(math) * 10000) / 10000;
        }
        const readyForFinalPraising = tokens.every(token => !/(operator)/.test(token.type)||/(=)/.test(token.value));
        const allNumbers = tokens.every(token => /(number)/.test(token.type)||/(=)/.test(token.value));
        
        if ((readyForFinalPraising&&!allNumbers))
        {
            
            tokens=simplifiy(tokens)
            addDebugInfo(`simplifiy(tokens)`,tokens)
            const numberIndex= (tokens.filter(item => item.type === "number"))[0];
            const variableIndex= (tokens.filter(item => item.type === "variable"))[0];
            const powIndex = tokens.filter(item => item.type === "powerVariable");
           
            if (powIndex.length===1&&powIndex[0].pow===2)
            {
                return quad(
                    powIndex[0] ? powIndex[0].value  : 0,
                    variableIndex ? variableIndex.value : 0,
                    numberIndex ? numberIndex.value * -1: 0,
                    powIndex[0].variable,
                );
            }
            else if (tokens.some(token => token.type !== 'powerVariable'))
            {
                return `${variableIndex.variable} = ${(numberIndex.value)/(variableIndex.value)}`
            }
        }
        if (expression.rightMultiStep||expression.leftMultiStep)
        {
            return controller(expandExpression(tokens,expression))
            
            //return `i need to delete this.`
        }
        let leftPos =expression.leftBreak;
        let rightPos = expression.rightBreak;
        
        let solved = parse
        (
            expression.operator,
            expression.specialChar,
            expression.left ,
            expression.leftVariable ,
            expression.right,
            expression.rightVariable,
            expression.rightPow,
        );
        
        if (solved === null) {return null; }
        if (typeof solved===`string`) {return solved;  }
        addDebugInfo('solved',solved)
        addDebugInfo('solved',addSolution(expression,solved))
    
        addSolutionInfo (addSolution(expression,solved)+`\n`)
        tokens.splice(leftPos,rightPos-leftPos,solved)
        return tokens.length>1?controller(tokens):reconstruct(tokens);
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
        tokens.splice(expression.leftBreak, expression.rightBreak -  expression.leftBreak, ...replacementCell);
        tokens=reorder(tokens)
        return tokens;
    }
    
    function addSolution(expression,solved){
        let solution=[];
        solution.push(solved)
        let left=expression.left?reconstruct([{type: expression.leftType, value: expression.left, variable: expression.leftVariable, pow: expression.leftPow}]):'';
        let right=expression.right?reconstruct([{type: expression.rightType, value: expression.right, variable: expression.rightVariable, pow: expression.rightPow}]):'';
        switch (expression.operator){
            case '^':
                return  `${left} ^ {${right}} = ${reconstruct(solution)}`
            case '+':
            case '-':
            case '*':
                return  `${left} ${expression.operator.replace(/\*/g, "\\cdot")} ${right} = ${reconstruct(solution)}`
            case '=':
                return `\\frac{${left}}{${right}} = ${reconstruct(solution)}`
            case 'sqrt':
                return  `\\${expression.operator}{${right}} = ${reconstruct(solution)}`
            case 'sin':
            case 'cos':
            case 'tan':
            case 'asin':
            case 'acos':
            case 'atan':
            case 'arcsin':
            case 'arccos':
            case 'arctan':
                return  `\\${expression.operator} (${right}) = ${reconstruct(solution)}`
            case 'binom':
            case 'frac':
            case '/':
                return `\\${expression.operator}{${left}}{${right}} = ${reconstruct(solution)}`
        }
        return null
    }
    
    function reconstruct(tokens){
        let math = '';
        for (let i=0;i<tokens.length;i++){
            if (tokens[i].value==='('&&tokens[tokens.findLastIndex((token, index) => token.id === tokens[i].id&&tokens[index+1])+1].value==='/')
            {
                math+='\\frac'
            }
            switch (tokens[i].type){
                case 'number':
                    math+=(tokens[i].value>=0&&tokens[i-1]&&/(number|variable|powerVariable)/.test(tokens[i-1].type)?'+':'')+tokens[i].value;
                    break;
                case 'paren':
                    let temp=tokens[tokens.findIndex(token => token.id === tokens[i].id)-1]
                    //addDebugInfo(temp,/(frac|sqrt|\^)/.test(temp.value))
                    if ((temp&&/(frac|sqrt|\^|\/)/.test(temp.value)||!temp))
                    {
                        math+=tokens[i].value.replace(/\(/,'\{').replace(/\)/,'\}');break;
                    }
                    else if (/\)/.test(temp.value)&&/(frac|sqrt|\^|\/)/.test(tokens[tokens.findIndex(token => token.id === temp.id)-1].value))
                    {
                        math+=tokens[i].value.replace(/\(/,'\{').replace(/\)/,'\}');break;
                    }
                    math+=tokens[i].value;
                    break;
                case 'operator':
                    math+=(tokens[i].value).replace(/([^\*\^=\/])/,"\\$1").replace(/\*/g,`\\cdot `);
                    break;
                case 'variable':
                    math+=(tokens[i].value>=0&&tokens[i-1]&&/(number|variable|powerVariable)/.test(tokens[i-1].type)?'+':'')+(tokens[i].value!==1?tokens[i].value:'')+tokens[i].variable;
                    break;
                case 'powerVariable':
                    math+=(tokens[i].value>=0&&tokens[i-1]&&/(number|variable|powerVariable)/.test(tokens[i-1].type)?'+':'')+(tokens[i].value!==1?tokens[i].value:'')+tokens[i].variable+`^{${tokens[i].pow}}`;
                    break;
                default:
                    continue;
            }
        }
        return math
    }
    function reorder(tokens){
        let newTokens = [];
        for (let i = 0; i < tokens.length; i++) {
            let newToken = { ...tokens[i], index: i };
            newTokens.push(newToken);
        }
    
        return newTokens;
    }
    
    function connect(tokens){
        let i=0,moreConnectedTokens=true;
        while (i<100&&moreConnectedTokens)
        {
            i++;
            let index = tokens.findIndex((token, index) =>
                (!tokens[index+2]||!/(cdot|\*)/.test(tokens[index+2].value))
                &&((token.type === 'number' && token.type===tokens[index + 1]?.type)
                ||(token.type === 'variable' && token.type===tokens[index + 1]?.type&&token.variable===tokens[index + 1]?.variable))
            );
            if(index===-1){break;}
            tokens[index].value+=tokens[index+1].value
            tokens.splice(index+1, 1);
        }
        return tokens;
    }
    function simplifiy(tokens){
        let i=0,newTokens=[];
        while (i<=100&&tokens.some(token => (/(number|variable|powerVariable)/).test(token.type)))
        {
            i++;
            let eqindex=tokens.findIndex(token => token.value === '=');
            let OperationIndex = tokens.findIndex((token) => (/(number|variable|powerVariable)/).test(token.type));
            if (OperationIndex===-1){addDebugInfo(i);return tokens;}
            let currentToken={type: tokens[OperationIndex].type , value: tokens[OperationIndex].value,variable: tokens[OperationIndex].variable ,pow: tokens[OperationIndex].pow}
    
            let numberGroup = tokens
            .map((token, i) => ({ token, originalIndex: i })) 
            .filter(item => item.token.type===currentToken.type) 
            .reduce((sum, item) => {
            let multiplier=(tokens[item.originalIndex - 1] && tokens[item.originalIndex - 1].value === '-') ? -1 : 1;
            multiplier *= (item.originalIndex <= eqindex) ? -1 : 1; 
            if (!(/(number)/).test(item.token.type)){multiplier*=-1}
            return sum + (item.token.value * multiplier);
            }, 0); 
            
            newTokens.push({ 
                type: currentToken.type, 
                value: numberGroup,
                variable: currentToken.variable,
                pow: currentToken.pow,
            })
    
            tokens= tokens.filter(token => {
                return !(token.type === tokens[OperationIndex].type &&
                          (!token.variable || token.variable === currentToken.variable) &&
                          (!token.pow || token.pow === currentToken.pow));
              });
        }
        return newTokens;
    }
    
    function quad(a,b,c,variable) {
        addDebugInfo('quad',`a = ${a}, b = ${b}, c = ${c}`)
        let x1 = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
        let x2 = (-b - Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
        x1=Math.round(x1 * 10000) / 10000
        x2=Math.round(x2 * 10000) / 10000
        return x1===x2?`${variable} = ${x1}`:`${variable}_1 = ${x1}, ${variable}_2 = ${x2.toFixed(3)}`;
    }
        solution=controller(tokens);
    
        if (Error.length > 0) 
        { 
            return Error
        }
        else { 
            return { solution: solution, info: mathInfo, solutionInfo: solutionInfo, debugInfo:debugInfo};
        }
}