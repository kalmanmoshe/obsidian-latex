import { Root,String, Whitespace,Parbreak,Comment, Macro,Environment, Argument,Path, DisplayMath, Group, InlineMath, Verb, VerbatimEnvironment, Ast,Node, ContentNode, BaseNode } from './typs/ast-types-post';
import { migrateToClassStructure } from './autoParse/ast-types-pre';

export function verifyEnvironmentWrap(content: Node[]):Node[]{
    const envs=content.filter(node=>node instanceof Environment);
    if(envs.some(env=>env.env==="document"))return content;

    //if no envs
    if(envs.length===0){
        let arg=findEnvironmentArgs(content);
        return content=[createDocEnvironment(content,arg)];
    }

    let arg=findEnvironmentArgs(content);
    let firstNonPreambleMacro=content.findIndex(node=>{
        if(!(node instanceof Macro))return false;
        return node.content.match(/^(documentclass|usepackage|usetikzlibrary|include|bibliography)$/)===null;
    });
    if(firstNonPreambleMacro===-1)return content;
    const envContent = content.splice(firstNonPreambleMacro);
    const doc = createDocEnvironment(envContent,arg);
    content.splice(firstNonPreambleMacro, 0, doc);
    return content;



    let envIndexs=findEnvIndexs(content);

    //if all envs are in a row
    if (envIndexs.every((idx, index) => !envIndexs[index + 1] || idx === envIndexs[index + 1] - 1)) {
        let arg=findEnvironmentArgs(content);
        envIndexs=content.map((node, index) => node instanceof Environment ? index : -1).filter(index => index !== -1);


        const envContent = content.splice(envIndexs[0], (envIndexs[envIndexs.length - 1] - envIndexs[0]) + 1);
        const doc = createDocEnvironment(envContent,arg);
        content.splice(envIndexs[0], 0, doc);
        return;
    }
}
function findEnvIndexs(content: Node[]){
    return content.map((node, index) => node instanceof Environment ? index : -1).filter(index => index !== -1);
}


function createDocEnvironment(content: Node[],args?:Argument[]){
    const doc=new Environment(
        "environment",
        "document",
        [
            new Environment("environment","tikzpicture",content,args)
        ],
    );
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