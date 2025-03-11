import { Root,String, Whitespace,Parbreak,Comment, Macro,Environment, Argument, DisplayMath, Group, InlineMath, Verb, VerbatimEnvironment, Ast,Node, ContentNode } from './typs/ast-types';

/**
 * Parse the string into an AST.
 */
export let parse: (str: string)=> any;
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

export function migrate(ast: any):Ast {
    if (Array.isArray(ast)) {
        const nodes = ast.map(migrate);
        if (nodes.some(node => Array.isArray(node))) {
            throw new Error("Array of nodes must not contain arrays of nodes");
        }
        return nodes as Node[];
    }
    switch (ast.type) {
        case "root":
            return new Root(ast.content?.map(migrate), ast._renderInfo, ast.position);
        case "string":
            return new String(ast.content, ast._renderInfo, ast.position);
        case "whitespace":
            return new Whitespace(ast._renderInfo, ast.position);
        case "parbreak":
            return new Parbreak(ast._renderInfo, ast.position);
        case "comment":
            return new Comment(ast.content, ast.sameline, ast.suffixParbreak, ast.leadingWhitespace, ast._renderInfo, ast.position);
        case "macro":
            return new Macro(ast.content,ast.escapeToken, ast.args?.map(migrate), ast._renderInfo, ast.position);
        case "environment":
            return new Environment(ast.type,ast.env,ast.content?.map(migrate), ast._renderInfo, ast.position);
        case "verbatimenvironment":
            return new VerbatimEnvironment(ast.env,ast.content?.map(migrate), ast._renderInfo, ast.position);
        case "displaymath":
            return new DisplayMath(ast.content?.map(migrate), ast._renderInfo, ast.position);
        case "inlinemath":
            return new InlineMath(ast.content?.map(migrate), ast._renderInfo, ast.position);
        case "group":
            return new Group(ast.content?.map(migrate), ast._renderInfo, ast.position);
        case "argument":
            return new Argument(ast.openMark,ast.closeMark,ast.content?.map(migrate), ast._renderInfo, ast.position);
        case "verb":
            return new Verb(ast.env,ast.escape, ast._renderInfo, ast.position);
        default:
            throw new Error(`Unknown node type: ${ast.type}`);
    }
}

export class LatexAbstractSyntaxTree{
    documentClass: string;
    packages: Array<string>;
    libraries: Array<string>;
    ast: any;
    myAst: Root;
    parse(latex: string){
        this.ast = parse(latex);
    }
    parseMath(latex: string){
        this.ast=parseMath(latex)
    }
    toString(){
        return toString(this.ast);
    }
    deleteComments(){
        deleteComments(this.ast);
    }
    usdExternalfiles(){

    }
    a() {
        const a=migrate(this.ast)
        if (a instanceof Root) {
            this.myAst=a
        }
        else{
            throw new Error("Root not found");
        }
    }
    cleanUp(){
        this.removeAllWhitespace();
        cleanUpDefs(this.myAst);
        cleanUpInputs(this.myAst);
    }
    removeAllWhitespace(){
        
    }
    usdPackages(){}
    usdLibraries(){}
    usdCommands(){}
    usdEnvironments(){}   
}

function cleanUpInputs(ast: Node){
    const condition=(node: Node)=>node instanceof Macro && node.content==="input";
    function action(ast: Node,index: number){
        if(!contentInNodeAndArray(ast))return;
        const node=ast.content[index];
        //ast.content.splice(index,2,);
    }
    cleanUpAst(ast,condition,action);
}
class Input{
    name: string;
    content: string;
    constructor(content: string){
        this.name="input";
        this.content=content;
    }
    toString() {
        return `\\input{${this.content}}`;
    }
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
        ast.content.splice(index, params.endIndex - index + 1, new Def(defCaller.content,items,params.placeholdersNum));
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
    
    while (i < ast.content.length &&ast.content[i] instanceof String &&ast.content[i].content === "#") {
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
    
}

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



