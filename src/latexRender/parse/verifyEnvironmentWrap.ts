import { Root,String, Whitespace,Parbreak,Comment, Macro,Environment, Argument,Path, DisplayMath, Group, InlineMath, Verb, VerbatimEnvironment, Ast,Node, ContentNode, BaseNode } from './typs/ast-types-post';
import { migrateToClassStructure } from './autoParse/ast-types-pre';
import { LatexAbstractSyntaxTree } from './parse';

export function verifyEnvironmentWrap(ast: LatexAbstractSyntaxTree):Node[]{
    const content=ast.content;
    const envs=content.filter(node=>node instanceof Environment);
    if(envs.some(env=>env.env==="document"))return content;

    let arg=findEnvironmentArgs(content);

    //if no envs
    if(envs.length===0){
        return ast.content=[...createDocEnvironment(ast,content,arg)];
    }

    let firstNonPreambleMacro=content.findIndex(node=>{
        if(!(node instanceof Macro))return false;
        return node.content.match(/^(documentclass|usepackage|usetikzlibrary|include|bibliography)$/)===null;
    });
    if(firstNonPreambleMacro===-1)return content;
    const envContent = content.splice(firstNonPreambleMacro);
    const doc = createDocEnvironment(ast,envContent,arg);
    content.splice(firstNonPreambleMacro, 0, ...doc);
    return content;

}
function findEnvIndexs(content: Node[]){
    return content.map((node, index) => node instanceof Environment ? index : -1).filter(index => index !== -1);
}


function createDocEnvironment(ast: LatexAbstractSyntaxTree,content: Node[],args?:Argument[]){
    const preambleEndIndex=content.findIndex(node=>{
        if(node.isMacro()){
            if(/(documentclass|usetikzlibrary|usepackage)/.test(node.content))return false;
            if(node.content==="input"&&ast.dependencies.get(node.args![0].content.map(n=>n.toString()).join(""))?.autoUse)return false;
        }
        return true;
    })
    const index=preambleEndIndex===-1?0:preambleEndIndex;
    const preamble=ast.content.splice(0,index);
    const doc=[...preamble,new Environment(
        "environment",
        "document",
        [
            new Environment("environment","tikzpicture",ast.content,args)
        ],
    )];
    return doc;
}


function findEnvironmentArgs(ast: Node[]): Argument[]|undefined {
    let arg: Argument|undefined=undefined;
    const firstSquareBracketIndex=ast.findIndex(node=>node instanceof String&&node.content==="[");
    const controlIndexes=[
        ast.findIndex(node=>node instanceof Macro),
        ast.findIndex(node=>node instanceof Environment),
        firstSquareBracketIndex,
    ].filter(index=>index!==-1);
    
    if(
        firstSquareBracketIndex!==-1&&
        controlIndexes.length>0&&
        firstSquareBracketIndex===Math.min(...controlIndexes)
    ){
        const matchingBracketIndex=findMatchingBracket(ast,firstSquareBracketIndex);
        const options=ast.splice(firstSquareBracketIndex,(matchingBracketIndex-firstSquareBracketIndex)+1);
        const [first, last] = [options[0], options[options.length - 1]];
        if (first.isString() && first.content === "[" && last.isString() && last.content === "]") {
            options.shift();
            options.pop();
        }
        arg=new Argument("[","]",options);
    }
    return arg?[arg]:undefined;
}


const bracketPairs = {
    "(": ")",
    ")": "(",
    "[": "]",
    "]": "[",
    "{": "}",
    "}": "{",
}

function findMatchingBracket(content: Node[],index: number){
    if(!(content[index] instanceof String)|| !(content[index].content in bracketPairs))throw new Error("Not a bracket");
    const bracket=content[index].content;
    const bracketPair=bracketPairs[bracket as keyof typeof bracketPairs];
    let count=0;
    for(let i=index;i<content.length;i++){
        const node=content[i];
        if(!(node instanceof String))continue;
        if(node.content===bracket)count++;
        if(node.content===bracketPair)count--;
        if(count===0)return i+index;
    }
    throw new Error("No matching bracket found");
}