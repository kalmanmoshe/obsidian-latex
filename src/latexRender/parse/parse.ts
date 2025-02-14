import { Root,String, Whitespace,Parbreak,Comment, Macro,Environment, Argument, DisplayMath, Group, InlineMath, Verb, VerbatimEnvironment } from './typs/ast-types';

let parse: any, deleteComments: any,toString:any,createMatchers:any,parsePgfkeys:any,pgfkeysArgToObject:any;

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

interface ast{

}
function migrate(ast: any) {
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

export class LatexabstractSyntaxTree{
    
    packages: Array<string>;
    libraries: Array<string>;
    ast: any;
    myAst: Root;
    prase(latex: string){
        this.ast = parse(latex);
    }
    toString(){
        return toString(this.ast);
    }
    deleteComments(){
        deleteComments(this.ast);
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
        this.ast.find
    }
    usdPackages(){}
    usdLibraries(){}
    usdCommands(){}
    usdEnvironments(){}   
}

function cleanUpTikzSet(ast: any) {
    
}
function cleanUpDefs(ast:any) {
    const defMap = ast.map((node: any, index: number) => node instanceof Macro && node.content === "def" ? index : null).filter((index: any) => index !== null).reverse();
    defMap.forEach((index: number) => {
        if (!(ast[index + 1] instanceof Macro)) {
            throw new Error("Def must be followed by a macro");
        }
    });


}
function cleanUpDef(ast: any,index:number) {
    const fondDef = ast[index] instanceof Macro && ast[index].content === "def";
    if (!fondDef) {throw new Error("Def not found");}
    const defCaller = ast[index + 1];
    if (!(defCaller instanceof Macro)) { throw new Error("Def must be followed by a macro"); }
    

}
function a(ast, index) {
    let count = 0,endIndex=index;
    for (let i = index; i < ast.length; i += 2) {
        if(ast[i] instanceof Macro && ast[i].content === "def"){
            if(!(ast[i+1] instanceof Macro)){
                throw new Error("Def must be followed by a macro");
            }
        }
    }
}



class unit{

}