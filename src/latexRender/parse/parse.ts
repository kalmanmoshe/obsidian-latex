import { ErrorRuleId } from '../log-parser/HumanReadableLogsRules';
import { Root,String, Whitespace,Parbreak,Comment, Macro,Environment, Argument,Path, DisplayMath, Group, InlineMath, Verb, VerbatimEnvironment, Ast,Node, ContentNode, BaseNode } from './typs/ast-types-post';
import { migrateToClassStructure } from './typs/ast-types-pre';
/**
 * Parse the string into an AST.
 */

export let parse: (str: string) => any;

/**
 * Parse str into an AST. Parsing starts in math mode and a list of nodes is returned (instead of a "root" node).
 */

export let parseMath: any;
export let deleteComments: any;
export let toString: any;
export let createMatchers:any;
export let parsePgfkeys:any;
export let pgfkeysArgToObject:any;


interface utilMacros{
    LATEX_NEWCOMMAND: Set<string>;
    XPARSE_NEWCOMMAND: Set<string>;
}


import('@unified-latex/unified-latex-util-to-string').then(module => {
	toString = module.toString;
});
import('@unified-latex/unified-latex-util-comments').then(module => {
	deleteComments = module.deleteComments;
});
import('@unified-latex/unified-latex-util-parse').then(module => {
	parse = module.parse;
    parseMath=module.parseMath
});

import('@unified-latex/unified-latex-util-pgfkeys').then(module => {
	createMatchers = module.createMatchers;
    parsePgfkeys = module.parsePgfkeys;
    pgfkeysArgToObject = module.pgfkeysArgToObject;
});

/**
 * Assignments:
 * - Auto load librarys
 * - Auto load packages
*/

function insureRenderInfoexists(node: Node){
    if(!node._renderInfo)node._renderInfo={};
}

export class LatexAbstractSyntaxTree{
    content: Node[];
    constructor(content: Node[]){
        this.content=content;
    }
    static parse(latex: string){
        const autoAst=parse(latex);
        console.log("autoAst",autoAst);
        const classAst= migrateToClassStructure(autoAst);
        if (!(classAst instanceof Root)) throw new Error("Root not found");
        const content=classAst.content
        const ast=new LatexAbstractSyntaxTree(content);
        ast.verifyEnvironmentWrap()
        ast.verifyDocumentclass();
        ast.cleanUp();
        return ast;
    }
    verifydocstructure(){
        
    }
    parseArguments(){
        
    }
    verifyEnvironmentWrap(){
        const envs=this.content.filter(node=>node instanceof Environment);
        if(envs.length===0){
            let arg=findEnvironmentArgs(this.content);
            const doc=new Environment(
                "environment",
                "document",
                [
                    new Environment("environment","tikzpicture",this.content,arg)
                ],
            );
            this.content=[doc];
            return;
        }
        //if no doc
        else if(envs.every((env)=>env.env!=="document")){
            let envIndexs = this.content.map((node, index) => node instanceof Environment ? index : -1).filter(index => index !== -1);
            if (envIndexs.every((idx, index) => !envIndexs[index + 1] || idx === envIndexs[index + 1] - 1)) {
                let arg=findEnvironmentArgs(this.content);
                envIndexs=this.content.map((node, index) => node instanceof Environment ? index : -1).filter(index => index !== -1);
                const envContent = this.content.splice(envIndexs[0], (envIndexs[envIndexs.length - 1] - envIndexs[0]) + 1);
                const doc = new Environment(
                    "environment",
                    "document",
                    [new Environment(
                        "environment",
                        "tikzpicture",
                        envContent,
                        arg
                    )],
                );
                console.log("doc",doc,envContent,arg);
                this.content.splice(envIndexs[0], 0, doc);
                return;
            }
        }
    }
    verifyDocumentclass(){
        const documentclass=this.content.find(node=>node instanceof Macro&&node.content==="documentclass");
        if(!documentclass){
            this.content.unshift(new Macro("documentclass",undefined,[
                new Argument("{","}",[new String("standalone")])
            ]));
        }
    }
    toString() {
        return this.content.map(node => node.toString()).join("");
    }
    addInputFileToPramble(filePath: string, index?: number){
        const input=new Macro("input",undefined,[new Argument("{","}",[new String(filePath)])]);
        if(index){
            this.content.splice(index,0,input);
            return;
        }
        const startIndex=this.content.findIndex(node=>!(node.isMacro()&&(node.content==="documentclass"||node.content==="input")));
        if(startIndex===-1){
            this.content.push(input);
            return;
        }
        this.content.splice(startIndex,0,input);
    }
    cleanUp(){
        claenUpPaths(this.content);
    }
    removeAllWhitespace(){
        
    }
    /**
     * In latex empty lines can cause errors
     * This methd remove all empty lines from the document.
     */
    removeEmptyLines() { 

    }
    usdPackages(){}
    usdLibraries() {}
    usdInputFiles() {
        return findUsdInputFiles(this.content);
    }
    usdCommands(){}
    usdEnvironments(){}   
}


//a 

//a Macro is in esins in emplmntsin of a newCommand

class DefineMacro{
    //type

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


function findUsdInputFiles(ast: Ast):Macro[] {
    const inputMacros: Macro[] = [];
    if (ast instanceof Macro && ast.content === "input")
        inputMacros.push(ast)
    if (Array.isArray(ast)) {
        inputMacros.push(...ast.map(findUsdInputFiles).flat());
    };
    if ("content" in ast&&ast.content&&Array.isArray(ast.content)) {
        inputMacros.push(...ast.content.map(findUsdInputFiles).flat())
    }
    if ("args" in ast && ast.args) {
        inputMacros.push(...ast.args.map(findUsdInputFiles).flat())
    }
    return inputMacros
}
const pathMatchRegex = /^(path|draw)$/;

const lengthBetweenIndexes = (index1: number, index2: number)=> {
    if (index1 > index2) {
        throw new Error("Index 1 must be smaller than index 2");
    }
    return (index2 - index1)+1;
}
function claenUpPaths(ast: Ast){
    const condition=(node: Node)=>node instanceof Macro && !!node.content.match(pathMatchRegex);
    function action(ast: Node, index: number){
        if(!contentInNodeAndArray(ast))return;
        const matchIndex=ast.content.findIndex((node, i) => i > index && node.isString() && node.content === ";");
        if (matchIndex === -1) { throw new Error("No match found"); }
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



function cleanUpTikzSet(ast: any) {
    
}


function cleanUpDefs(ast:Node) {
    const condition = (node: Node) => node instanceof Macro && node.content === "def";
    function action(ast: Node,index:number) {
        if(!contentInNodeAndArray(ast))return;
        const fondDef = ast.content[index] instanceof Macro && ast.content[index].content === "def";
        if (!fondDef) {throw new Error("Def not found");}
        const defCaller = ast.content[index + 1];
        if (!(defCaller instanceof Macro)) { throw new Error("Def must be followed by a macro"); }
        const params=parsePlaceholders(ast, index + 2);
        const items = ast.content.slice(params.endIndex,params.endIndex+1); 
        //ast.content.splice(index, params.endIndex - index + 1, new Def(defCaller.content,items,params.placeholdersNum));
    }
    cleanUpAst(ast, condition, action);
}


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




function contentInNodeAndArray<T extends Node>(node: T): node is T & { content: Node[] } {
    return "content" in node && Array.isArray(node.content);
}





function parsePlaceholders(ast: Node, startIndex: number) {
    let i = startIndex;
    const placeholders: number[] = [];
    
    while ("content" in ast&&i < ast.content.length &&ast.content[i] instanceof String &&ast.content[i].content === "#") {
      if (i + 1 >= ast.content.length) {throw new Error(`Expected parameter after marker at index ${i}.`);}
      const param = ast.content[i + 1];
      if (!(param instanceof String)) {throw new Error(`Invalid parameter at index ${i + 1}.`);}
      const num = param.getNumber();
      if (isNaN(num)) {throw new Error(`Invalid placeholder at index ${i + 1}: not a number.`);}
      placeholders.push(num);
      i += 2;
    }
    if (!placeholders.every((num, index, arr) => index === 0 || num === arr[index - 1] + 1)) {
        throw new Error("Placeholders must be in ascending order");
    }
    if (placeholders.length && placeholders[0] !== 1) {
        throw new Error("First placeholder must be 1");
    }
    return { placeholdersNum: Math.max(...placeholders), endIndex: i };
}



/*
export class Def{
    name: string;
    content: any[];
    params: number;
    constructor(name: string,content: any[],params: number){
        this.name=name;
        this.content=content;
        this.params=params;
    }
    toString() {
        let paramsStr = "";
        for (let i = 1; i <= this.params + 1; i++) {
            paramsStr += "#" + i;
        }
        const string = `\\def\\${this.name}${paramsStr}{${this.content.map(el => el.toString()).join("")}}`;
        return string;
    }
    
}*/



class unit{

}



const latexErrors = {

}