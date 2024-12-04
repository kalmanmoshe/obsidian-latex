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
}
const open=['Parentheses_open','Curly_brackets_open','Square_brackets_open'];
const close=['Parentheses_close','Curly_brackets_close','Square_brackets_close'];

export function idParentheses(tokens) {
    let depth = 0;
    const depthCounts = {};
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        
        if (open.includes(token.name)) {
            if (!depthCounts[depth]) {
                depthCounts[depth] = 0;
            }

            const depthID = depthCounts[depth]++;
            token.value = new Paren(depth, depthID,token.value);

            // Increase depth for nested parentheses
            depth++;
            continue;
        }

        if (close.includes(token.name)) {
            // Decrease depth and check for unmatched closing parenthesis
            depth--;
            if (depth < 0) {
                console.error(token.value,tokens)
                throw new Error("Unmatched closing parenthesis detected.");
            }

            // Assign a unique ID to the closing parenthesis
            const depthID = depthCounts[depth] - 1;
            token.value = new Paren(depth, depthID,token.value);
        }
    }

    // Check for unmatched opening parentheses
    if (depth !== 0) {
        console.error(tokens)
        throw new Error(`Unmatched opening parenthesis(es) detected: depth=${depth}`);
    }
}
export function mapBrackets(type,tokens){
    return tokens
        .map((token, index) => 
            token.name === type
                ? findParenIndex(token.value, undefined, tokens) 
                : null
        )
        .filter((t) => t !== null);
}

export function findParenIndex(id,index,tokens){
    id=id?id:tokens[index].value;

    const openIndex=tokens.findIndex(
        token=>open.includes(token.name)
        &&token.value?.compare(id)
    )
    const closeIndex=tokens.findLastIndex(
        token=>close.includes(token.name)
        &&token.value?.compare(id)
    )
    return{open: openIndex,close: closeIndex,id:id}
}