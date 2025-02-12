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
class BaseNode {
    type: string;
    _renderInfo?: _renderInfo;
    position?: {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
    };
    constructor(type: string, renderInfo?: typeof this._renderInfo, position?: typeof this.position) {
        this.type = type;
        this._renderInfo = renderInfo;
        this.position = position;
    }
}

export class ContentNode extends BaseNode {
    content: Node[];
    constructor(type: string, content: Node[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super(type, renderInfo, position);
        this.content = content;
    }
}

// Actual nodes
export class Root extends ContentNode {
    type: "root" = "root";
    constructor(content: Node[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("root", content, renderInfo, position);
    }
}

export class String extends ContentNode {
    type: "string" = "string";
    constructor(content: Node[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("string", content, renderInfo, position);
    }
}

export class Whitespace extends BaseNode {
    type: "whitespace" = "whitespace";
    constructor(renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("whitespace", renderInfo, position);
    }
}

export class Parbreak extends BaseNode {
    type: "parbreak" = "parbreak";
    constructor(renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("parbreak", renderInfo, position);
    }
}

export class Comment extends BaseNode {
    type: "comment" = "comment";
    content: string;
    sameline?: boolean;
    suffixParbreak?: boolean;
    leadingWhitespace?: boolean;
    constructor(content: string, sameline?: boolean, suffixParbreak?: boolean, leadingWhitespace?: boolean, renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("comment", renderInfo, position);
        this.content = content;
        this.sameline = sameline;
        this.suffixParbreak = suffixParbreak;
        this.leadingWhitespace = leadingWhitespace;
    }
}

export class Macro extends BaseNode {
    type: "macro" = "macro";
    content: string;
    escapeToken?: string;
    args?: Argument[];
    constructor(content: string, escapeToken?: string, args?: Argument[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("macro", renderInfo, position);
        this.content = content;
        this.escapeToken = escapeToken;
        this.args = args;
    }
}

export class Environment extends ContentNode {
    type: "environment" | "mathenv";
    env: string;
    args?: Argument[];
    constructor(type: "environment" | "mathenv", env: string, content: Node[], args?: Argument[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super(type, content, renderInfo, position);
        this.env = env;
        this.args = args;
    }
}

export class VerbatimEnvironment extends BaseNode {
    type: "verbatim" = "verbatim";
    env: string;
    content: string;
    constructor(env: string, content: string, renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("verbatim", renderInfo, position);
        this.env = env;
        this.content = content;
    }
}

export class DisplayMath extends ContentNode {
    type: "displaymath" = "displaymath";
    constructor(content: Node[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("displaymath", content, renderInfo, position);
    }
}

export class Group extends ContentNode {
    type: "group" = "group";
    constructor(content: Node[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("group", content, renderInfo, position);
    }
}

export class InlineMath extends ContentNode {
    type: "inlinemath" = "inlinemath";
    constructor(content: Node[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("inlinemath", content, renderInfo, position);
    }
}

export class Verb extends BaseNode {
    type: "verb" = "verb";
    env: string;
    escape: string;
    content: string;
    constructor(env: string, escape: string, content: string, renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("verb", renderInfo, position);
        this.env = env;
        this.escape = escape;
        this.content = content;
    }
}

export class Argument extends ContentNode {
    type: "argument" = "argument";
    openMark: string;
    closeMark: string;
    constructor(openMark: string, closeMark: string, content: Node[], renderInfo?: typeof BaseNode.prototype._renderInfo, position?: typeof BaseNode.prototype.position) {
        super("argument", content, renderInfo, position);
        this.openMark = openMark;
        this.closeMark = closeMark;
    }
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
