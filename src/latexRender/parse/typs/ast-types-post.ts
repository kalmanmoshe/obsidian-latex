import { EnvRenderInfo, MacroRenderInfo, RenderInfo } from "./info-specs";

export type GenericAst = GenericNode | GenericNode[];

export interface GenericNode {
  [x: string]: any;
  type: string;
  renderInfo?: object;
}

type Position = {
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
};

export class BaseNode {
  type: string;
  renderInfo?: RenderInfo;
  position?: Position;
  constructor(
    type: string,
    renderInfo?: typeof this.renderInfo,
    position?: typeof this.position,
  ) {
    this.type = type;
    if (renderInfo) this.renderInfo = renderInfo;
    if (position) this.position = position;
  }
  clone(): this {
    const clone = new (this.constructor as new (...args: any[]) => this)(
      this.type,
      this.renderInfo,
      this.position,
    );
    Object.assign(clone, this);
    return clone;
  }
  isMacro(): this is Macro {
    return this instanceof Macro;
  }
  isString(): this is String {
    return this instanceof String;
  }
  isWhitespaceLike(): this is Whitespace | Parbreak | Comment {
    return (
      this instanceof Whitespace ||
      this instanceof Parbreak ||
      this instanceof Comment
    );
  }
  isContentNode(): this is ContentNode {
    return this instanceof ContentNode;
  }
  hasChildren(): boolean {
    return this.isMacro() || this.isContentNode();
  }
  getNodeChildren(): Node[] {
    const children = this.getChildren();
    if (children[0] instanceof Argument) {
      return children
        .map((child) => (child instanceof Argument ? child.content : child))
        .flat();
    }
    return children as Node[];
  }
  getChildren(): Node[] | Argument[] {
    if (this.isMacro() && this.args) {
      return this.args;
    } else if (this.isContentNode()) {
      return this.content;
    }
    return [];
  }
  getMacroDef(): null | any {
    if (!this.isMacro()) return null;
    if (this.content !== "def") return null;
    return this.content;
  }
}

export class ContentNode extends BaseNode {
  content: Node[];
  constructor(
    type: string,
    content: Node[],
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super(type, renderInfo, position);
    this.content = content;
  }
}

// Actual nodes
export class Root extends ContentNode {
  type: "root" = "root";
  constructor(
    content: Node[],
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("root", content, renderInfo, position);
  }
  toString(): any {
    return this.content.map((node) => node.toString());
  }
}

export class String extends BaseNode {
  type: "string" = "string";
  content: string;
  constructor(
    content: string,
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("string", renderInfo, position);
    this.content = content;
  }
  toString(): string {
    return this.content;
  }
  getNumber() {
    return Number(this.content);
  }
}

export class Whitespace extends BaseNode {
  type: "whitespace" = "whitespace";
  constructor(
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("whitespace", renderInfo, position);
  }
  toString(): string {
    let length = 1;
    if (this.position?.start && this.position?.end)
      length = this.position?.end.offset - this.position?.start.offset;
    return " ".repeat(Math.abs(length));
  }
}

export class Parbreak extends BaseNode {
  type: "parbreak" = "parbreak";
  constructor(
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
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
  constructor(
    content: string,
    sameline?: boolean,
    suffixParbreak?: boolean,
    leadingWhitespace?: boolean,
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("comment", renderInfo, position);
    this.content = content;
    if (sameline) this.sameline = sameline;
    if (suffixParbreak) this.suffixParbreak = suffixParbreak;
    if (leadingWhitespace) this.leadingWhitespace = leadingWhitespace;
  }
  toString(): string {
    return `%${this.content}\n`;
  }
}

export class Macro extends BaseNode {
  type = "macro";
  content: string;
  escapeToken?: string;
  args?: Argument[];
  renderInfo?: RenderInfo;
  constructor(
    content: string,
    escapeToken?: string,
    args?: Argument[],
    renderInfo?: RenderInfo,
    position?: Position,
  ) {
    renderInfo = renderInfo || getDefaultMacroRenderInfoConfig(content);
    super("macro", renderInfo, position);
    this.content = content;
    if (escapeToken) this.escapeToken = escapeToken;
    if (args) this.args = args;
  }
  toString(): string {
    const prefix = this.renderInfo?.escapeToken || "";
    return (
      prefix +
      this.content +
      (this.args ? this.args.map((arg) => arg.toString()).join("") : "") +
      (this.renderInfo?.breakAfter ? "\n" : "")
    );
  }
}

export class Path extends Macro {
  components: Node[];
  constructor(
    content: string,
    components: Node[],
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    renderInfo = modifyPathMacroInfo(renderInfo);
    super(content, "\\", undefined, renderInfo, position);
    this.components = components;
  }
  toString(): string {
    let string = this.renderInfo?.escapeToken || "";
    string += this.content;
    if (this.args) {
      string += this.args.map((arg) => arg.toString()).join("");
    }
    string += this.components.map((node) => node.toString()).join("");
    string += this.renderInfo?.tikzPathCommand ? ";" : "";
    string += this.renderInfo?.breakAfter ? "\n" : "";
    return string;
  }
}

export class Pathf extends Macro {
  pathType?: string;
  name?: string;
  //components Array<segment:Path|Coordinate>;
}
/*
export class Coordinate extends Argument {
    readonly openMark="(";
    readonly closeMark=")";
    constructor(content: Node[], renderInfo?: renderInfo, position?: typeof BaseNode.prototype.position) {
        super("(",")",content, renderInfo, position);
    }
}*/

const macrosNotToescapeRegex = /(_|\^)/;
const getDefaultMacroRenderInfoConfig = (content: string): RenderInfo | undefined => {
  let info: RenderInfo = {};
  if (!macrosNotToescapeRegex.test(content)) {
    info.escapeToken = "\\";
  }
  if (content.match(/pgf/)) {
    info.pgfkeysArgs = true;
  }
  if (content.match(/input|documentclass/))
    info.breakAfter = true;
  return Object.keys(info).length === 0 ? undefined : info;
};

const modifyPathMacroInfo = (info?: RenderInfo) => {
  if (!info) {
    info = getDefaultMacroRenderInfoConfig("path") ?? {};
  }
  info.tikzPathCommand = true;
  return info;
};

export class Environment extends ContentNode {
  type: "environment" | "mathenv";
  env: string;
  args?: Argument[];
  renderInfo?: EnvRenderInfo;
  constructor(
    type: "environment" | "mathenv",
    env: string,
    content: Node[],
    args?: Argument[],
    renderInfo?: RenderInfo,
    position?: Position,
  ) {
    super(type, content, renderInfo, position);
    this.env = env;
    if (args) this.args = args;
  }
  toString(): string {
    let string = `\\begin{${this.env}}`;
    if (this.args) {
      string += this.args.map((arg) => arg.toString()).join("");
    }
    string +=
      "\n" +
      indentString(this.content.map((node) => node.toString()).join("")) +
      "\n";
    string += `\\end{${this.env}}\n`;
    return string;
  }
}
function indentString(input: string, indent: string = "\t"): string {
  return input
    .split("\n")
    .map((line) => indent + line)
    .join("\n");
}

export class VerbatimEnvironment extends BaseNode {
  type: "verbatim" = "verbatim";
  env: string;
  content: string;
  constructor(
    env: string,
    content: string,
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("verbatim", renderInfo, position);
    this.env = env;
    this.content = content;
  }
  toString(): string {
    return `\\begin{${this.env}}${this.content}\\end{${this.env}}`;
  }
}

export class DisplayMath extends ContentNode {
  type: "displaymath" = "displaymath";
  constructor(
    content: Node[],
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("displaymath", content, renderInfo, position);
  }
  toString(): string {
    return "$$" + this.content.map((node) => node.toString()).join("") + "$$";
  }
}

export class Group extends ContentNode {
  type: "group" = "group";
  constructor(
    content: Node[],
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("group", content, renderInfo, position);
  }
  toString(): string {
    return `{${this.content.map((node) => node.toString()).join("")}}`;
  }
}

export class InlineMath extends ContentNode {
  type: "inlinemath" = "inlinemath";
  constructor(
    content: Node[],
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("inlinemath", content, renderInfo, position);
  }
  toString(): string {
    return "\$" + this.content.map((node) => node.toString()).join("") + "\$";
  }
}

export class Verb extends BaseNode {
  type: "verb" = "verb";
  env: string;
  escape: string;
  content: string;
  constructor(
    env: string,
    escape: string,
    content: string,
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("verb", renderInfo, position);
    this.env = env;
    this.escape = escape;
    this.content = content;
  }
  toString(): string {
    return `\\${this.env}${this.escape}${this.content}${this.escape}`;
  }
}

export class Argument extends ContentNode {
  type: "argument" = "argument";
  openMark: string;
  closeMark: string;
  constructor(
    openMark: string,
    closeMark: string,
    content: Node[],
    renderInfo?: RenderInfo,
    position?: typeof BaseNode.prototype.position,
  ) {
    super("argument", content, renderInfo, position);
    this.openMark = openMark;
    this.closeMark = closeMark;
  }
  toString(): string {
    let string =
      this.openMark +
      this.content.map((node) => node.toString()).join("") +
      this.closeMark;
    return string;
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
