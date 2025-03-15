import { ErrorRuleId } from '../log-parser/HumanReadableLogsRules';
import { Root,String, Whitespace,Parbreak,Comment, Macro,Environment, Argument, DisplayMath, Group, InlineMath, Verb, VerbatimEnvironment, Ast,Node, ContentNode } from './typs/ast-types-post';
import { migrateToClassStructure } from './typs/ast-types-pre';

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

export class LatexAbstractSyntaxTree{
    documentClass: Macro = new Macro(
        "documentclass", '\\', [
            new Argument(
                "{", "}", [
                    new String("standalone")
                ]
            )
        ]
    );
    preamble: Array<Macro>;
    document: Environment;
    content: Node[];
    constructor(content:Node[], documentClass?: Macro, preamble?: Array<Macro>, document?: Environment) {
        this.content = content;
        if(documentClass&&preamble&&document){
            this.documentClass = documentClass;
            this.preamble = preamble;
            this.document = document;
        }
    }
    static parse(latex: string){
        const autoAst=parse(latex);
        const classAst= migrateToClassStructure(autoAst);
        if(!(classAst instanceof Root))throw new Error("Root not found");
        //deleteComments(classAst);
        return new LatexAbstractSyntaxTree(classAst.content);
        /*
        const autoAst=parse(latex);
        const classAst= migrateToClassStructure(autoAst);
        if(!(classAst instanceof Root))throw new Error("Root not found");
        deleteComments(classAst);

        const content=classAst.content;
        const documentClass = content.shift();

        if(!documentClass||!(documentClass instanceof Macro))throw createLatexErrorMessage(ErrorRuleId.MISSING_DOCUMENT_CLASS);

        const docIndex=content.findIndex(node=>node instanceof Environment);
        const document=content[docIndex] as Environment|undefined;
        if(!document) throw new Error("Document not found");

        if(document.env!=="document")throw new Error("Document environment not found");
        const preamble=content.splice(0,docIndex);
        if(!preamble.every(node=>node instanceof Macro))
            throw new Error("Preamble contains non macro elements");
        if(content.length)throw new Error("Content not empty after document environment");
        return new LatexAbstractSyntaxTree(documentClass,preamble,document);*/
    }
    toString() {
        return this.content.map(node => node.toString()).join("\n");
        if (!this.documentClass) {
            throw new Error("Document class not found");
        }
        let string = "";
        string += this.documentClass.toString() + "\n";
        string += this.document.toString();
        return string;
    }
    usdExternalfiles(){

    }
    removeAllWhitespace(){
        
    }
    usdPackages(){}
    usdLibraries() { }
    usdInputFiles() {
        return findUsdInputFiles(this.getFullAst());
    }
    getFullAst(): Node[]{
        return [this.documentClass,...this.preamble,this.document];
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
    function action(ast: Node,index: number){
        if(!contentInNodeAndArray(ast))return;
        const node = ast.content[index].args;
        if (!node.length || node.length > 1)
            throw new Error("")
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



const latexErrors = {

}