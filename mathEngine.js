export function controller(mathExpression) {
    let Error = [];
    let mathInfo = ''; 
    let SolutionInfo = ''; 
    let debugInfo = ''; 

    addDebugInfo('mathExpression',mathExpression);
    let math = `${mathExpression}`
  .replace(/(\s|_\{[\w]*\}|:)/g, "") 
  .replace(/{/g, "(") 
  .replace(/}/g, ")")
  .replace(/\\cdot/g, "*")
  .replace(/arc/g, "a")
  .replace(/Math./g, "\\")
  .replace(/(?<!\\)(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\$1");

  addDebugInfo('math',math)
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
              
              if (math[i+1] === '('&&!/(frac|binom)/.test(tokens[tokens.map(token => token.id).indexOf(tokens[tokens.length - 1].id)-1].value)) {
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
              } else {
                  tokens.push({ type: 'operator', value: math[i], startPos: i, endPos: i });
              }
              continue;
          }
  
          // Handle LaTeX-style operators
          if (math[i] === '\\') {  
            startPos = i;  
            i+=1;  
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
              if (math[numStart-1] === ')') {
                  math = math.slice(0, numStart) + '*' + math.slice(numStart);  
                  i++;
              }
              tokens.push({ type: 'number', value: parseFloat(number), startPos: numStart, endPos: i - 1 });
              if (math[i] === '(') {
                  math = math.slice(0, i) + '*' + math.slice(i);  
              }
              else if (/\\/.test(math[i])){
                  math = math.slice(0, i) + '*' + math.slice(i);
                  i += 1; 
              }
              i--;  
              continue;
          }
  
          // Handle variables
          if (/[a-zA-Z]/.test(math[i])) {
              // v and befor num
              if (tokens.length > 1 &&tokens[tokens.length - 2].type==='operator'&&/[+-]/.test(tokens[tokens.length - 2].value)) 
              {
              Object.assign(tokens[tokens.length - 2], { type: 'variable',value: parseFloat(tokens[tokens.length - 2].value+tokens[tokens.length - 1].value), variable: math[i], endPos: i  });
              tokens.pop();
              }
  
              else if (tokens.length > 0 && tokens[tokens.length - 1].type === 'number') {
              Object.assign(tokens[tokens.length - 1], { type: 'variable', variable: math[i], endPos: i  });
              }
              else if (tokens.length > 0 &&tokens[tokens.length - 1].type==='operator'&&/[+-]/.test(tokens[tokens.length - 1].value)) {
              Object.assign(tokens[tokens.length - 1], { type: 'variable',value: parseFloat(tokens[tokens.length - 1].value+1), variable: math[i], endPos: i  });
              }
              // v and affter num
          if (/[0-9]/.test(math[i+1])) {
                  i++;
                  while (/[0-9]/.test(math[i]) && i < math.length) {
                      number += math[i];
                      i++;
                  }
                  tokens.push({type: 'variable',variable: math[startPos],value: number, startPos: startPos,endPos: i - 1});
              }
          // default
          if  (!tokens.length > 0||!tokens[tokens.length - 1].type === 'number'){
                  tokens.push({type: 'variable',variable: math[startPos],value: 1,startPos: startPos,endPos: i - 1});
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
                  p1 = i;  continue;
              }
              else if (!p2 && /(frac|binom|sin|cos|tan|asin|acos|atan)/.test(tokens[i].value)) {
                  p2 = i;  continue;
              }
              else if (!p3 && /(\*|\/)/.test(tokens[i].value)) {
                  p3 = i;  continue;
              }
              else if (!p4 && /[+-]/.test(tokens[i].value)) {
                  p4 = i;  continue;
              }
              else if (/[=]/.test(tokens[i].value)) {
                  if (
                      !tokens.slice(0, i).some(token => token.type === 'number') && 
                      !tokens.slice(i).some(token => token.type === 'variable')
                  ) {
                      return i;
                  }
                  else {
                      //her i beed to add the groping lojic
                  }
              }
          }
      }
      if (p1 !== undefined) {return p1;} 
      else if (p2 !== undefined) {return p2;} 
      else if (p3 !== undefined) {return p3;} 
      else if (p4 !== undefined) {return p4;} 
      else {return null; }
  }
  
  function parseLeft(tokens, index) {
      let breakChar = 0;
      let left = '';
  
      for (let i = index - 1; i >= 0; i--) {
          if (tokens[index - 1].type === 'paren') {
              if (i!==index-2&&tokens[i+1].type === 'paren'&&tokens[i+1].id===tokens[index - 1].id) {
                  breakChar = i + 1;
                  break;
              }
          } else {
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
          if (i!==index+2&&tokens[i-1].type === 'paren'&&tokens[i-1].id===tokens[index + 1].id) {
              breakChar = i;
              break;
          }
      } else {
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
      let variable='';
      for (let i = index - 1; i >= 0; i--) {
          if (tokens[index - 1].type === 'paren') {
              if (i!==index-2&&tokens[i+1].type === 'paren'&&tokens[i+1].id===tokens[index - 1].id) {
                  breakChar = i + 1;
                  break;
              }
          } else {
              if (tokens[i].type !== 'variable') {
                  breakChar = i + 1;
                  break;
              }
          }
      }
  
      for (let i = index - 1; i >= breakChar; i--) {
          left = tokens[i].value + left; 
          variable=tokens[i].variable;
      }
      return {variable: variable, value: safeToNumber(left), breakChar: breakChar };
  }
  function position(tokens) {
      let index = operationsOrder(tokens);
      if (index===null){return null}
      let leftObj, rightObj;
      if (tokens[index].value==='='){
          leftObj = praseVariable(tokens, index);
          rightObj = parseRight(tokens, index);
          return { 
              operator: tokens[index].value, 
              left: leftObj ? leftObj.value : null,
              leftVariable: leftObj.variable,
              right:rightObj ? rightObj.value : null, 
              leftBreak:  leftObj ? leftObj.breakChar : index, 
              rightBreak:rightObj ?rightObj.breakChar: tokens.length
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
              leftObj=parseRight(tokens, index)
              rightObj=parseRight(tokens, leftObj.breakChar)
              leftObj.breakChar=index;
              rightObj.breakChar+=1;
              break;
          default:
              return null; 
      }
      return { 
          operator: tokens[index].value, 
          left: leftObj ? leftObj.value : null,
          right:rightObj ? rightObj.value : null, 
          leftBreak:  leftObj ? leftObj.breakChar : index, 
          rightBreak:rightObj ?rightObj.breakChar: tokens.length
      }; 
  }
  
  function parse(operator, left, leftVar, right) { 
      if (left!==null&&left.length <= 0) {
          Error.push(`Error: Left side of an operator must have a value`);
          return null;
      }
      if (right!==null&&right.length <= 0) {
          Error.push(`Error: Right side of an operator must have a value`);
          return null;
      }
      if (leftVar){
          return `${leftVar} = ${(right)/(left)}`;
      }
      let solved; 
      switch (operator) {
          case 'sqrt':
              solved = Math.sqrt(right);
              break;
          case '^':
              solved = Math.pow(left,right);
              break;
          case 'frac':
              solved = (left)/(right);
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
              if (Number.isNaN(left) || Number.isNaN(right) || left < 0 || right < 0) {return null; }
              if (right > left) {solved = 0;break;}
              if (right === 0 || right === left) {solved = 1;break;}
              if (right === 1 || right === left - 1) {solved = left;break;}
              let k = right;if (right > left - right) {k = left - right;}
  
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
              solved = (Math.sin(right*Math.PI / 180));
              break;
          case 'cos':
              solved = (Math.cos(right*Math.PI / 180))
              break;
          case 'tan':
              solved = (Math.tan(right*Math.PI / 180));
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
  
      let tokensArr=tokenize(math);
      let tokens = tokensArr.tokens; 
      addDebugInfo('tokens',tokens)
      math=tokensArr.math;
      
      let expression = position(tokens); 
      addDebugInfo('expression',expression)
      if (expression === null && !(tokens.some(token => token.type === 'operator' && token.value !== '='))&& tokens.some(token => token.type === 'variable')) 
      {
          return math;
      }
      else if (expression === null){
          return Math.round(parseFloat(math) * 10000) / 10000;
      }
      
      let solved = parse
      (
          expression.operator,  
          expression.left !== null ? expression.left : null,
          expression.leftVariable !== null ? expression.leftVariable : null, 
          expression.right !== null ?expression.right : null)
      ;
  
      addSolutionInfo(`${expression.left} ${expression.operator} ${expression.right} -> ${solved}\n`)
  
      if (solved === null) {
          return null;  
      }
      if (typeof solved===`string`) {
          return solved;  
      }
      
      let leftPos =tokens[expression.leftBreak].startPos;
      let rightPos = tokens[expression.rightBreak-1].endPos+1;
  
      math = math.slice(0, leftPos) + solved + math.slice(rightPos);
      
      return math!=='true'&&math!=='false'?controller(math):math;
    }
    Solution=controller(math);
    if (Error.length > 0) { return Error; } 
    else { 
return { Solution: Solution, info: mathInfo, SolutionInfo: SolutionInfo, debugInfo:debugInfo};}
}