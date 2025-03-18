import { ErrorRuleId } from '../log-parser/HumanReadableLogsRules';
import { Root,String, Whitespace,Parbreak,Comment, Macro,Environment, Argument, DisplayMath, Group, InlineMath, Verb, VerbatimEnvironment, Ast,Node, ContentNode, BaseNode } from './typs/ast-types-post';
import { migrateToClassStructure } from './typs/ast-types-pre';
import { VirtualFile } from 'src/obsidian/file_watch';
import { MacroInfo } from './typs/info-specs';
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
const macrosNotToescapeRegex = /(_|\^)/;
function insureRenderInfoexists(node: Node){
    if(!node._renderInfo)node._renderInfo={};
}
export function assignRenderInfoToNode(ast: Ast): void{
    if (Array.isArray(ast)) ast.forEach(assignRenderInfoToNode);
    if (ast instanceof ContentNode){
        ast.content.forEach(assignRenderInfoToNode);
        switch (ast.type) {
            case "root":
                break;
            case "environment":
                ast = ast as Environment;
                ast.args?.forEach(assignRenderInfoToNode);
                break;
            case "mathenv":
                break;
            case "inlinemath":
                break;
            case "displaymath":
                break;
            case "group":
                break;
            case "argument":
                break;
            default:
                throw new Error(`Unknown node type: ${ast["type"]}`);
        }
    }
    else if (ast instanceof BaseNode){
        switch (ast.type) {
            case "macro":
                if(!ast.isMacro()) return;
                ast.args?.forEach(assignRenderInfoToNode);
                if (!macrosNotToescapeRegex.test(ast.content)){
                    insureRenderInfoexists(ast);
                    ast._renderInfo!.escapeToken = "\\";
                }
                break;
        }
    }
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
        return new LatexAbstractSyntaxTree(content);
    }
    verifydocstructure(){
        
    }
    verifyEnvironmentWrap(){
        const envs=this.content.filter(node=>node instanceof Environment);
        if(envs.length===0){
            const doc=new Environment(
                "environment",
                "document",
                [
                    new Environment("environment","tikzpicture",this.content)
                ],
            );
            this.content=[doc];
            return;
        }
        else if(envs.every((env)=>env.env!=="document")){
            const envIndexs = this.content.map((node, index) => node instanceof Environment ? index : -1).filter(index => index !== -1);
            if (envIndexs.every((idx, index) => !envIndexs[index + 1] || idx === envIndexs[index + 1] - 1)) {
                const envContent = this.content.splice(envIndexs[0], envIndexs[envIndexs.length - 1] - envIndexs[0] + 1);
                const doc = new Environment(
                    "environment",
                    "document",
                    envContent,
                );
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
            ],autoMacroInfo));
        }
    }
    toString() {
        assignRenderInfoToNode(this.content);
        return this.content.map(node => node.toString()).join("");
    }
    addInputFileToPramble(filePath: string, index?: number){
        const input=new Macro("input",undefined,[new Argument("{","}",[new String(filePath)])],autoMacroInfo);
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
        console.log(ast,ast.args,typeof ast.args)
        inputMacros.push(...ast.args.map(findUsdInputFiles).flat())
    }
    return inputMacros
}

function cleanUpInputs(ast: Node){
    const condition=(node: Node)=>node instanceof Macro && node.content==="input";
    function action(ast: Node, index: number){
        if(!contentInNodeAndArray(ast))return;
        const node = ast.content[index].args;
        if (!node.length || node.length > 1)
            throw new Error("");
        //const input=new Input(node)
       // ast.content.splice(index,1,input);
    }
    cleanUpAst(ast,condition,action);
}


class Input{
    name: string;
    content: string;
    constructor(content: string){
        this.name="input";
        this.content = content;
    }
    toString() {
        return `\\input{${this.content}}`;
    }
}
const autoMacroInfo: MacroInfo={
    renderInfo:{
        breakAfter: true,
    },
    escapeToken: "\\",
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
    ast: Node,
    condition: (node: Node) => boolean,
    action: (node: Node, index: number) => void
) {
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

class Path{

}
class Draw extends Path{
    content: any[];
    args: any[];
    constructor(content: any[]){
        super();
        this.content=content;
    }
}


class unit{

}



const latexErrors = {

}