import { BasicMathJaxToken, BasicTikzToken } from "src/mathParser/basicToken";
import { BracketState, BracketType } from "src/staticData/encasings";
export class Paren{
    type: BracketType;
    state: BracketState;
    depth: number;
    depthID: number;
    
    constructor(type: BracketType,state: BracketState,depth: number,depthID: number){
        this.type=type;
        this.state=state;
        this.depth=depth;
        this.depthID=depthID;
    }
    static create(data: string, depth: number, depthID: number): Paren {
        const capitalize = (str: string): string =>str.charAt(0).toUpperCase() + str.slice(1);

        const [type, state] = data.split('_');
        const normalizedType = capitalize(type);
        const normalizedState = capitalize(state);
    
        if (!(normalizedType in BracketType) || !(normalizedState in BracketState)) {
            throw new Error(`Invalid type or state: ${normalizedType}, ${normalizedState}`);
        }
        return new Paren(
            BracketType[normalizedType as keyof typeof BracketType],
            BracketState[normalizedState as keyof typeof BracketState],
            depth,
            depthID
        );
    }
    
    clone(){return new Paren(this.type,this.state,this.depth,this.depthID)}
    toString(){return this.depth + "." + this.depthID}
    compare(paren: Paren){
        if(!(paren instanceof Paren)) return false;
        return this.depth===paren.depth&&this.depthID===paren.depthID
    }
    addDepth(num: any){this.depth+=num}
    isOpen(){return this.state===BracketState.Open}
    adddepthID(num: number){this.depthID+=num}
    
}

export function idParentheses(tokens: (BasicMathJaxToken|Paren|BasicTikzToken)[]): any[] {
    const newTokens=[]
    let depth = 0;
    const depthCounts: Record<number, number> = {};
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (parenState(token,true)&&!(token instanceof Paren)&&token.isValueString()) {
            if (!depthCounts[depth]) {
                depthCounts[depth] = 0;
            }
            const depthID = depthCounts[depth]++;
            const paren = Paren.create(token.value,depth,depthID);
            newTokens.push(paren);
            depth++;
            continue;
        }

        if (parenState(token)&&!(token instanceof Paren)&&token.isValueString()) {
            depth--;
            if (depth < 0) {
                console.error(token.getValue(), tokens);
                throw new Error("Unmatched closing parenthesis detected.");
            }

            // Assign a unique ID to the closing parenthesis
            const depthID = depthCounts[depth] - 1;
            const paren = Paren.create(token.value,depth,depthID);
            newTokens.push(paren);
            continue;
        }
        newTokens.push(token.clone());
    }

    if (depth !== 0) {
        console.error(tokens);
        throw new Error(`Unmatched opening parenthesis(es) detected: depth=${depth}`);
    }

    return newTokens;
}


export function mapBrackets(type: string,tokens: any[]){
    return tokens
        .map((token: { name: any; }, index: any) => 
            token.name === type
                ? /*findParenIndex(token.value, undefined, tokens) */'errMoshe'
                : null
        )
        .filter((t: null) => t !== null);
}

export const parenState=(item: Paren|BasicMathJaxToken|BasicTikzToken,open: boolean=false):boolean=>{
    let isOpen;
    switch (true){
        case item instanceof Paren:
            isOpen = item.isOpen()
            break;
        case (item instanceof BasicMathJaxToken||item instanceof BasicTikzToken)&&item.isValueString()&&item.getStringValue().split('_')[1]!==undefined:
            isOpen = item.getStringValue().split('_')[1]===BracketState.Open;
            break;
    }
    if(isOpen!==undefined){
        return open?isOpen:!isOpen
    }
    return false
}

export function findModifiedParenIndex(id: Paren|number, tokens: any[], depth?: number, depthID?: number, filter?: any) {

    id = (id instanceof Paren?id.clone(): tokens[id].clone())as Paren

    if (depth !== undefined && depthID !== undefined) {
        id.depth += depth || 0;
        id.depthID += depthID || 0;
    }

    const openIndex = tokens.findIndex(token => {
        if (parenState(token,true)&& token.value?.compare(id)) {
            if (filter && !token.name.startsWith(filter)) {
                id.depth = token.value.depth + (depth || 0)
                id.depthID=token.value.depthID + (depthID || 0)
                return false;
            }
            return true;
        }
        return false;
    });

    const closeIndex = tokens.findLastIndex(
        token =>
            parenState(token,true) &&
            token.value?.compare(id)
    );

    return { open: openIndex, close: closeIndex, id };
}


/**
 * Finds the indices of the opening and closing parentheses based on the given ID.
 * @param {Paren|number} id - The identifier to compare tokens. Defaults to the token at the given index if a number is provided.
 * @param {Array} tokens - The array of tokens to search within.
 * @returns {{open: number, close: number, id: Paren}} An object containing the indices of the opening and closing parentheses and the matched ID.
 * - `open`: The index of the first matching opening parenthesis.
 * - `close`: The index of the last matching closing parenthesis.
 * - `id`: The identifier used for comparison.
 */

export function findParenIndex(id: number | Paren, tokens: any[]): { open: number; close: number; id: Paren; } {
    if(!(id instanceof Paren)){
        id = tokens[id];
        if(!(id instanceof Paren))
            throw new TypeError("Invalid ID: Expected a Paren object or a valid index.");
    }

    const openIndex = tokens.findIndex(
        (token: Paren) => parenState(token,true) && id.compare(token)
    );

    const closeIndex = tokens.findLastIndex(
        (token: Paren) => parenState(token) && id.compare(token)
    );
    if(openIndex===-1||closeIndex===-1)throw new Error('Parentheses not found')
    return { open: openIndex, close: closeIndex, id };
}

export function findDeepestParenthesesScope(tokens: any[]) {
    let begin = 0, end = tokens.length;
    let deepestScope = null;
    let currentScope = null;

    for (let i = 0; i < tokens.length; i++) {
        if (parenState(tokens[i],true)) {
            currentScope = findParenIndex(tokens[i],tokens);  
        }
        if (currentScope!==null&&i===currentScope.close) {
            [begin,end]=[currentScope.open,currentScope.close]
            deepestScope=currentScope.id
            break;
        }
    }

    return { begin, end, deepestParenthesesScope: deepestScope ?? null };
}

