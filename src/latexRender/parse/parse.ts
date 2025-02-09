let parse: any, deleteComments: any,toString:any,createMatchers:any,parsePgfkeys:any,pgfkeysArgToObject:any;


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

class Environment{
    
    env:string;
    //args: Array<Argument>;
}
