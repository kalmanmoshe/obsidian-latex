import { ErrorRuleId } from '../log-parser/HumanReadableLogsRules';
import { Root,String, Whitespace,Parbreak,Comment, Macro,Environment, Argument,Path, DisplayMath, Group, InlineMath, Verb, VerbatimEnvironment, Ast,Node, ContentNode, BaseNode } from './typs/ast-types-post';
import { migrateToClassStructure, parse } from './autoParse/ast-types-pre';
import { claenUpPaths } from './cleanUpAst';
import { verifyEnvironmentWrap } from './verifyEnvironmentWrap';


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
        ast.content = verifyEnvironmentWrap(ast.content);
        ast.verifyDocumentclass();
        console.log("finest verifyDocumentclass");
        ast.cleanUp();
        console.log("Finished cleanUp");
        console.warn("ast",ast);
        return ast;
    }
    verifydocstructure(){
        
    }
    parseArguments(){
        
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




function cleanUpTikzSet(ast: any) {
    
}

/*
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


*/