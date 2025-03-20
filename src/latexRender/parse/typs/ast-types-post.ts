import { Def } from "../parse";
import { EnvInfo, MacroInfo } from "./info-specs";

export type GenericAst = GenericNode | GenericNode[];

export interface GenericNode {
    [x: string]: any;
    type: string;
    _renderInfo?: object;
}
type _renderInfo=(MacroInfo["renderInfo"] | EnvInfo["renderInfo"]) & {
        defaultArg?: string;
} & Record<string, unknown>
type Position={
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
    };
    
export class BaseNode {
    type: string;
    _renderInfo?: _renderInfo;
    position?: Position;
    constructor(type: string, renderInfo?: typeof this._renderInfo, position?: typeof this.position) {
        this.type = type;
        if(renderInfo)this._renderInfo = renderInfo;
        if(position)this.position = position;
    }
    isMacro(): this is Macro { return this instanceof Macro; }
    getMacroDef():null|any {
        if (!this.isMacro()) return null;
        if(this.content!=="def")return null;
        return this.content;
    }
}

export class ContentNode extends BaseNode {
    content: Node[];
    constructor(type: string, content: Node[], renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super(type, renderInfo, position);
        this.content = content;
    }
}

// Actual nodes
export class Root extends ContentNode {
    type: "root" = "root";
    constructor(content: Node[], renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("root", content, renderInfo, position);
    }
    toString():any {
        return this.content.map(node => node.toString())
    }
    
}

export class String extends BaseNode {
    type: "string" = "string";
    content: string;
    constructor(content: string, renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("string", renderInfo, position);
        this.content = content;
    }
    toString(): string {
        return this.content
    }
    getNumber(){return Number(this.content)}
}

export class Whitespace extends BaseNode {
    type: "whitespace" = "whitespace";
    constructor(renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("whitespace", renderInfo, position);
    }
    toString(): string {
        let length = 1;
        if (this.position?.start.line&&this.position?.end.line)
            length = this.position?.end.column - this.position?.start.column;
        return " ".repeat(Math.abs(length));
    }
}

export class Parbreak extends BaseNode {
    type: "parbreak" = "parbreak";
    constructor(renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("parbreak", renderInfo, position);
    }
    toString(): string {
        return "\n";
    }
}

export class Comment extends BaseNode {
    type: "comment" = "comment";
    content: string;
    sameline?: boolean;
    suffixParbreak?: boolean;
    leadingWhitespace?: boolean;
    constructor(content: string, sameline?: boolean, suffixParbreak?: boolean, leadingWhitespace?: boolean, renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("comment", renderInfo, position);
        this.content = content;
        if(sameline)this.sameline = sameline;
        if(suffixParbreak)this.suffixParbreak = suffixParbreak;
        if(leadingWhitespace)this.leadingWhitespace = leadingWhitespace;
    }
    toString(): string {
        return `%${this.content}\n`;
    }
}

export class Macro extends BaseNode {
    type= "macro";
    content: string;
    escapeToken?: string;
    args?: Argument[];
    _renderInfo?: MacroInfo;
    constructor(content: string, escapeToken?: string, args?: Argument[], renderInfo?: MacroInfo, position?: Position) {
        renderInfo=renderInfo||getDefaultMacroInfoConfig(content);
        super("macro", renderInfo, position);
        this.content = content;
        if(escapeToken)this.escapeToken = escapeToken;
        if(args)this.args = args;
    }
    toString(): string {
        const prefix=this._renderInfo?.escapeToken||"";
        return prefix+this.content+(this.args ? this.args.map(arg => arg.toString()).join("") : "")+(this._renderInfo?.renderInfo?.breakAfter?"\n":"")
    }
    
}
const macrosNotToescapeRegex = /(_|\^)/;
const getDefaultMacroInfoConfig=(content: string):MacroInfo|undefined=>{
    let macroInfo: MacroInfo = {}
    if (!macrosNotToescapeRegex.test(content)){
        macroInfo.escapeToken = "\\";
    }
    macroInfo.renderInfo = {
        breakAfter: true,
    };
    return Object.keys(macroInfo).length === 0?undefined:macroInfo
}
type RenderInfo = _renderInfo;

export class Environment extends ContentNode {
    type: "environment" | "mathenv";
    env: string;
    args?: Argument[];
    constructor(type: "environment" | "mathenv", env: string, content: Node[], args?: Argument[], renderInfo?: RenderInfo, position?: typeof BaseNode.prototype.position) {
        super(type, content, renderInfo, position);
        this.env = env;
        if(args)this.args = args;
    }
    toString(args: ToStringConfig={}): string {
        if(args.inline) return `\\begin{${this.env}}\t${this.content.map(node => node.toString()).join("")}\\end{${this.env}}`
        return `\\begin{${this.env}}\n\t${this.content.map(node => node.toString()).join("")}\n\\end{${this.env}}`;
    }
}

export class VerbatimEnvironment extends BaseNode {
    type: "verbatim" = "verbatim";
    env: string;
    content: string;
    constructor(env: string, content: string, renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("verbatim", renderInfo, position);
        this.env = env;
        this.content = content;
    }
    toString(args: ToStringConfig={}): string {
        return `\\begin{${this.env}}${this.content}\\end{${this.env}}`
    }
}

export class DisplayMath extends ContentNode {
    type: "displaymath" = "displaymath";
    constructor(content: Node[], renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("displaymath", content, renderInfo, position);
    }
    toString(args: ToStringConfig={}): string {
        return "$$"+this.content.map(node => node.toString()).join("")+"$$"
    }
}

export class Group extends ContentNode {
    type: "group" = "group";
    constructor(content: Node[], renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("group", content, renderInfo, position);
    }
    toString(args: ToStringConfig={}): string {
        return `{${this.content.map(node => node.toString()).join("")}}`
    }
}

export class InlineMath extends ContentNode {
    type: "inlinemath" = "inlinemath";
    constructor(content: Node[], renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("inlinemath", content, renderInfo, position);
    }
    toString(args: ToStringConfig={}): string {
        return "\$"+this.content.map(node => node.toString()).join("")+"\$"
    }
}

export class Verb extends BaseNode {
    type: "verb" = "verb";
    env: string;
    escape: string;
    content: string;
    constructor(env: string, escape: string, content: string, renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("verb", renderInfo, position);
        this.env = env;
        this.escape = escape;
        this.content = content;
    }
    toString(): string {
        return `\\${this.env}${this.escape}${this.content}${this.escape}`
    }
}

export class Argument extends ContentNode {
    type: "argument" = "argument";
    openMark: string;
    closeMark: string;
    constructor(openMark: string, closeMark: string, content: Node[], renderInfo?: _renderInfo, position?: typeof BaseNode.prototype.position) {
        super("argument", content, renderInfo, position);
        this.openMark = openMark;
        this.closeMark = closeMark;
    }
    toString(args: ToStringConfig={}): string {
        let string=this.content.map(node => node.toString()).join("")
        if(!args.removeOpenCloseMarks)
            string=this.openMark+string+this.closeMark
        return string
    }
}

export interface ToStringConfig{
    removeWhitespace?: boolean;
    removeComments?: boolean;
    removeParbreaks?: boolean;
    removeEmptyGroups?: boolean;
    removeOpenCloseMarks?: boolean;
    removeEmptyArguments?: boolean;
    recursive?: boolean;
    inline?: boolean;
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
    | Verb
    //| Def;

export type Ast = Node | Argument | Node[];
