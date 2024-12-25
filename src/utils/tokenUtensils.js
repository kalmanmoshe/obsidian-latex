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
    compare(Paren){return this.depth===Paren.depth&&this.depthID===Paren.depthID}
    addDepth(num){this.depth+=num}
    adddepthID(num){this.depthID+=num}
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



export function findParenIndex(id,index,tokens){
    id=id?id:tokens[index];

    const openIndex=tokens.findIndex(
        token=>open.includes(token.type)
        &&id.compare(token)
    )
    const closeIndex=tokens.findLastIndex(
        token=>close.includes(token.type)
        &&id.compare(token)
    )
    return{open: openIndex,close: closeIndex,id:id}
}