import { Position } from "./mathEngine";

export function expandExpression(tokens, position) {
    if (position.checkFrac(tokens)){goodByFraction(tokens, position);return;}
    let left = tokens.tokens.slice(position.left.breakChar, position.index).filter(item => /(number|variable|powerVariable)/.test(item.type));
    let right = tokens.tokens.slice(position.index, position.right.breakChar).filter(item => /(number|variable|powerVariable)/.test(item.type));
    const isLeftMultiStep=position.left.multiStep===undefined;

    if (position.operator==="-"&&isLeftMultiStep){
        left = [{ "type": "number", "value": -1, "index": 0 }]
        
    }
    let replacementCell = [];
    for (let i = 0; i < left.length; i++) {
        for (let j = 0; j < right.length; j++) {
            replacementCell.push(left[i]);
            replacementCell.push({ "type": "operator", "value": "*", "index": 0 });
            replacementCell.push(right[j]);
        }
    }

    const is=position.operator==="-"&&isLeftMultiStep;
    const start=is?position.index:position.left.breakChar
    const length=position.right.breakChar-(is?position.index:position.left.breakChar)
    tokens.insertTokens(start, length+(isLeftMultiStep?0:1), replacementCell);
    tokens.reIDparentheses();
}

export const curlyBracketsRegex = new RegExp("(frac|sqrt|\\^|\\/|binom)")



function goodByFraction(tokens, position) {
    let replacementTokens = [];
    /*We rely on the denominator to already possess parentheses
    We rely on the fact. that both the nominator and the denominator both have parentheses and closing them 
    All calculations are according to that.
    */
    let denominator = tokens.tokens.slice(position.transition, position.right.breakChar);

    for (let i = 0; i < tokens.tokens.length; i++) {
        // Had to change i = position.right.breakChar -->to--> i = position.right.breakChar-1;
        //console.log(tokens.tokens[i].value)
        if (i >= position.index && i < position.right.breakChar) {
            replacementTokens.push(...tokens.tokens.slice(position.index+1,position.transition))
            i = position.right.breakChar-1;
            continue;
        }

        if (/(=)/.test(tokens.tokens[i].value)) {
            replacementTokens.push(tokens.tokens[i]);
            continue;
        }
        
        let replacement = tokens.tokens.slice(i,i+1)
        let whereAmI = i;
        let rest=[];
        console.log('denominator',denominator)
        if (tokens.tokens[i].value === "frac") {
            whereAmI = new Position(tokens, i);
            replacementTokens.push(...tokens.tokens.slice(whereAmI.index,whereAmI.index+2))
            //nominator
            rest=tokens.tokens.slice(whereAmI.transition-1,whereAmI.right.breakChar)
            // denominator
            replacement = tokens.tokens.slice(i + 2, whereAmI.transition-1);
        }
        else{
            whereAmI=i+tokens.tokens.slice(i).findIndex(token => /(=|frac)/.test(token.value))
            whereAmI=whereAmI<i?tokens.tokens.length:whereAmI;
            replacement = tokens.tokens.slice(i,whereAmI);
        }
        replacementTokens.push(
            ...denominator,
            {"type": "operator", "value": "*"},
            {"type": "paren", "value": "(", "id": 0, "index": 0},
            ...replacement,
            {"type": "paren", "value": ")", "id": 0, "index": 0},
            ...rest
        );
        i = typeof whereAmI === "object" ? whereAmI.right.breakChar-1 : whereAmI-1;
    }
    //console.log(replacementTokens)
    tokens.tokens=replacementTokens;
    tokens.reIDparentheses();
}