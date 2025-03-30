import { EnvInfo, MacroInfo } from "../typs/info-specs";


/**
 * Parse the string into an AST.
 */

export let parse: (str: string) => any;
/**
 * Parse str into an AST. Parsing starts in math mode and a list of nodes is returned (instead of a "root" node).
 */
export let parseMath: any;
let deleteComments: any;
let toString: any;
let createMatchers:any;
let parsePgfkeys:any;
let pgfkeysArgToObject:any;

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

import { 
    Root as RootClass ,
    String as StringClass, 
    Whitespace as WhitespaceClass,
    Parbreak as ParbreakClass,
    Comment as CommentClass, 
    Macro as MacroClass,
    Environment as EnvironmentClass, 
    Argument as ArgumentClass, 
    DisplayMath as DisplayMathClass,
    Group as GroupClass, 
    InlineMath as InlineMathClass, 
    Verb as VerbClass, 
    VerbatimEnvironment as VerbatimEnvironmentClass,
    Ast as AstClass,
    Node as NodeClass,
    BaseNode as BaseNodeClass,
} from '../typs/ast-types-post';


export type GenericAst = GenericNode | GenericNode[];

export interface GenericNode {
    [x: string]: any;
    type: string;
    _renderInfo?: object;
}

// Abstract nodes
interface BaseNode {
    type: string;
    _renderInfo?: (MacroInfo["renderInfo"] | EnvInfo["renderInfo"]) & {
        defaultArg?: string;
    } & Record<string, unknown>;
    position?: {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
    };
}

interface ContentNode extends BaseNode {
    content: Node[];
}

// Actual nodes
export interface Root extends ContentNode {
    type: "root";
}
export interface String extends BaseNode {
    type: "string";
    content: string;
}

export interface Whitespace extends BaseNode {
    type: "whitespace";
}

export interface Parbreak extends BaseNode {
    type: "parbreak";
}

export interface Comment extends BaseNode {
    type: "comment";
    content: string;
    sameline?: boolean;
    suffixParbreak?: boolean;
    leadingWhitespace?: boolean;
}

export interface Macro extends BaseNode {
    type: "macro";
    content: string;
    escapeToken?: string;
    args?: Argument[];
}

export interface Environment extends ContentNode {
    type: "environment" | "mathenv";
    env: string;
    args?: Argument[];
}

export interface VerbatimEnvironment extends BaseNode {
    type: "verbatim";
    env: string;
    content: string;
}

export interface DisplayMath extends ContentNode {
    type: "displaymath";
}

export interface Group extends ContentNode {
    type: "group";
}

export interface InlineMath extends ContentNode {
    type: "inlinemath";
}

export interface Verb extends BaseNode {
    type: "verb";
    env: string;
    escape: string;
    content: string;
}

export interface Argument extends ContentNode {
    type: "argument";
    openMark: string;
    closeMark: string;
}

export type Node =
    | Root
    | String
    | Whitespace
    | Parbreak
    | Comment
    | Macro
    | Environment
    | VerbatimEnvironment
    | InlineMath
    | DisplayMath
    | Group
    | Verb;

export type Ast = Node | Argument | Node[];




function isNodeClassArray(content: any[]): content is NodeClass[] {
    return content.every(node => node instanceof BaseNodeClass);
}

function isArgumentClassArray(content: any[]): content is ArgumentClass[] {
    return content.every(node => node instanceof ArgumentClass);
}

function validateNodeContent<T extends BaseNodeClass>(
    ast: ContentNode,
    errorMessagePrefix: string
): NodeClass[] {
    const content = ast.content.map(migrateToClassStructure);
    if (!isNodeClassArray(content)) {
        throw new Error(errorMessagePrefix+" node content must be an array of BaseNode instances/children, got: "+content);
    }
    return content;
}


export function migrateToClassStructure(ast: Ast): AstClass {
    if (Array.isArray(ast)) {
        const nodes: NodeClass[] = ast.map(migrateToClassStructure).map(node => {
            if(Array.isArray(node)||node instanceof ArgumentClass) {
                throw new Error("Array of nodes must contain only BaseNode instances/children");
            }
            return node;
        });
        return nodes;
    }
    switch (ast.type) {
        case "root":
            return new RootClass(validateNodeContent(ast, "root"), ast._renderInfo, ast.position);
        case "string":
            return new StringClass(ast.content, ast._renderInfo, ast.position);
        case "whitespace":
            return new WhitespaceClass(ast._renderInfo, ast.position);
        case "parbreak":
            return new ParbreakClass(ast._renderInfo, ast.position);
        case "comment":
            return new CommentClass(ast.content, ast.sameline, ast.suffixParbreak, ast.leadingWhitespace, ast._renderInfo, ast.position);
        case "macro":
            const macroArgs = ast.args?.map(migrateToClassStructure);
            if (macroArgs && !isArgumentClassArray(macroArgs)) {
                throw new Error("macro node args must be an array of Arguments");
            }
            return new MacroClass(ast.content, ast.escapeToken, macroArgs, undefined, ast.position);
        case "environment":
            const envArgs = ast.args?.map(migrateToClassStructure);
            if (envArgs && !isArgumentClassArray(envArgs)) {
                throw new Error("environment node args must be an array of Arguments");
            }
            return new EnvironmentClass(ast.type, ast.env, validateNodeContent(ast,"anv"), envArgs, ast._renderInfo, ast.position);
        case "verbatim":
            return new VerbatimEnvironmentClass(ast.env, ast.content, ast._renderInfo, ast.position);
        case "displaymath":
            return new DisplayMathClass(validateNodeContent(ast, "displaymath"), ast._renderInfo, ast.position);
       case "inlinemath":
            return new InlineMathClass(validateNodeContent(ast, "inlinemath"), ast._renderInfo, ast.position);
       case "group":
            return new GroupClass(validateNodeContent(ast, "group"), ast._renderInfo, ast.position);
        case "argument":
            return new ArgumentClass(ast.openMark, ast.closeMark, validateNodeContent(ast, "argument"), ast._renderInfo, ast.position);
       case "verb":
            return new VerbClass(ast.env, ast.escape, ast.content, ast._renderInfo, ast.position);
        default:
            throw new Error(`Unknown node type: ${ast.type}`);
    }
}
