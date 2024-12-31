export class Paren{
    type;
    depth;
    depthID;
    
    constructor(depth,depthID,type){
        this.depth=depth;
        this.depthID=depthID;
        this.type=type
    }
    toString(){this.id=this.depth + "." + this.depthID}
    compare(paren){
        if(!(paren instanceof Paren)) return false;
        return this.depth===paren.depth&&this.depthID===paren.depthID
    }
    addDepth(num){this.depth+=num}
    isOpen(){return open.includes(this.type)}
    adddepthID(num){this.depthID+=num}
    clone(){return new Paren(this.depth,this.depthID,this.type)}
}
const open=['Parentheses_open','Curly_brackets_open','Square_brackets_open'];
const close=['Parentheses_close','Curly_brackets_close','Square_brackets_close'];

export function idParentheses(tokens) {
    let depth = 0;
    const depthCounts = {};
    
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (open.includes(token.value)) {
            if (!depthCounts[depth]) {
                depthCounts[depth] = 0;
            }

            const depthID = depthCounts[depth]++;
            const paren = new Paren(depth, depthID,token.value);
            tokens.splice(i,1,paren)
            // Increase depth for nested parentheses
            depth++;
            continue;
        }

        if (close.includes(token.value)) {
            depth--;
            if (depth < 0) {
                console.error(token.value,tokens)
                throw new Error("Unmatched closing parenthesis detected.");
            }

            // Assign a unique ID to the closing parenthesis
            const depthID = depthCounts[depth] - 1;
            const paren = new Paren(depth, depthID,token.value);
            tokens.splice(i,1,paren)
        }
    }

    // Check for unmatched opening parentheses
    if (depth !== 0) {
        console.error(tokens)
        throw new Error(`Unmatched opening parenthesis(es) detected: depth=${depth}`);
    }
    return tokens
}

export function mapBrackets(type,tokens){
    return tokens
        .map((token, index) => 
            token.name === type
                ? /*findParenIndex(token.value, undefined, tokens) */'errMoshe'
                : null
        )
        .filter((t) => t !== null);
}
export const isOpenParen=(item)=>{
    if(!(item instanceof Paren)||!item.type)return false
    return open.includes(item.type)
}
export const isClosedParen=(item)=>{
    if(!(item instanceof Paren)||!item.type)return false
    return close.includes(item.type)
}

export function findModifiedParenIndex(id, index, tokens, depth, depthID, filter) {
    // Initialize `id` as a new instance if not already provided
    id = id
        ? new Paren(id.depth, id.depthID)
        : new Paren(tokens[index].value.depth, tokens[index].value.depthID);

    if (depth !== undefined && depthID !== undefined) {
        id.depth += depth || 0;
        id.depthID += depthID || 0;
    }

    const openIndex = tokens.findIndex(token => {
        if (open.includes(token.name) && token.value?.compare(id)) {
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
            close.includes(token.name) &&
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
export function findParenIndex(id, tokens) {
    const index = typeof id === "number" ? id : null;
    id = index !== null ? tokens[index] : id;

    if (!(id instanceof Paren)) {
        throw new TypeError("Invalid ID: Expected a Paren object or a valid index.");
    }
    const openIndex = tokens.findIndex(
        (token) => isOpenParen(token) && id.compare(token)
    );

    const closeIndex = tokens.findLastIndex(
        (token) => isClosedParen(token) && id.compare(token)
    );
    if(openIndex===-1||closeIndex===-1)throw new Error('Parentheses not found')
    return { open: openIndex, close: closeIndex, id };
}

export function findDeepestParenthesesScope(tokens) {
    let begin = 0,
        end = tokens.length;
    let deepestScope = null;
    let currentScope = null; // Define currentScope in the outer scope of the loop

    for (let i = 0; i < tokens.length; i++) {
        if (isOpenParen(tokens[i])) {
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

