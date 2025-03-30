import { Argument, Ast, Macro, Path,Node, ContentNode } from "./typs/ast-types-post";

/**
 * the main cleanUpAst function that will be used to clean up the AST
 * @param ast 
 * @param condition 
 * @param action 
 * @returns 
 */
function cleanUpAst(
    ast: Ast,
    condition: (node: Node) => boolean,
    action: (node: Node, index: number) => void
) {
    if (ast instanceof Array) {
        ast.forEach((node: Node) => cleanUpAst(node, condition, action));
        return;
    }
    if(ast instanceof Argument)throw new Error("Argument not allowed");
    if (!contentInNodeAndArray(ast)) return;
    const indices:number[] = ast.content
        .map((node:Node, index:number) => (condition(node) ? index : -1))
        .filter((index:number) => index !== -1)
        .reverse();

    indices.forEach(index => action(ast, index));
    ast.content.forEach((child: Node) => cleanUpAst(child, condition, action));
}


export function claenUpPaths(ast: Ast){
    const condition=(node: Node)=>node instanceof Macro && !!node.content.match(pathMatchRegex);
    function action(ast: Node, index: number){
        if(!contentInNodeAndArray(ast))return;
        const matchIndex=ast.content.findIndex((node, i) => i > index && node.isString() && node.content === ";");
        if (matchIndex === -1) {
            const el:Macro = ast.content[index] as Macro;
            if(el.args&&el.args.length>0&&el.args[el.args.length-1].closeMark===';'){  
                if(el.args.length!==1)throw new Error("Path with args but no semicolon found");
                ast.content[index]=new Path((ast.content[index] as Macro).content , el.args[0].content);
                return;
            }
            else{
                throw new Error("at claen up paths action: found path but no semiolon giving up in this path");
            }
            
        }
        if (!ast.isContentNode()||!Array.isArray(ast.content)) { throw new Error("Content must be an array"); }
        ast.content=ast.content as typeof ContentNode.prototype.content;

        const pathContent = ast.content.slice(index, matchIndex + 1);
        const content = pathContent.shift() as Macro;
        pathContent.pop();
        const path = new Path(content.content, pathContent);
        ast.content.splice(index, lengthBetweenIndexes(index, matchIndex), path);
    }
    cleanUpAst(ast,condition,action);
}

function contentInNodeAndArray<T extends Node>(node: T): node is T & { content: Node[] } {
    return "content" in node && Array.isArray(node.content);
}

const pathMatchRegex = /^(path|draw)$/;

const lengthBetweenIndexes = (index1: number, index2: number)=> {
    if (index1 > index2) {
        throw new Error("Index 1 must be smaller than index 2");
    }
    return (index2 - index1)+1;
}