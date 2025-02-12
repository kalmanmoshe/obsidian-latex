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
            return new Root(ast.content.map(migrate), ast._renderInfo, ast.position);
        case "string":
            return new String(ast.content.map(migrate), ast._renderInfo, ast.position);
        case "whitespace":
            return new Whitespace(ast._renderInfo, ast.position);
        case "parbreak":
            return new Parbreak(ast._renderInfo, ast.position);
        case "comment":
            return new Comment(ast.content.map(migrate), ast.sameline, ast.suffixParbreak, ast.leadingWhitespace, ast._renderInfo, ast.position);
        case "Macro":
            return new Macro(ast.name, ast.args.map(migrate), ast._renderInfo, ast.position);
        case "Environment":
            return new Environment(ast.name, ast.args.map(migrate), ast.content.map(migrate), ast._renderInfo, ast.position);
        case "VerbatimEnvironment":
            return new VerbatimEnvironment(ast.name, ast.args.map(migrate), ast.content.map(migrate), ast._renderInfo, ast.position);
        case "DisplayMath":
            return new DisplayMath(ast.content.map(migrate), ast._renderInfo, ast.position);
        case "InlineMath":
            return new InlineMath(ast.content.map(migrate), ast._renderInfo, ast.position);
        case "Group":
            return new Group(ast.content.map(migrate), ast._renderInfo, ast.position);
        case "Argument":
            return new Argument(ast.content.map(migrate), ast._renderInfo, ast.position);
        case "Verb":
            return new Verb(ast.content.map(migrate), ast._renderInfo, ast.position);
        default:
            throw new Error(`Unknown node type: ${ast.type}`);
    }
}

export class LatexabstractSyntaxTree{
    
    packages: Array<string>;
    libraries: Array<string>;
    ast: any;
    prase(latex: string){
        this.ast = parse(latex);
    }
    toString(){
        return toString(this.ast);
    }
    deleteComments(){
        deleteComments(this.ast);
    }
    usdPackages(){}
    usdLibraries(){}
    usdCommands(){}
    usdEnvironments(){}   
}
