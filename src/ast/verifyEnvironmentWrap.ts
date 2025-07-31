import {
  Macro,
  Environment,
  Argument,
  Node,
} from "./typs/ast-types-post";
import { LatexAbstractSyntaxTree } from "./parse";
import { Notice } from "obsidian";
export class EnvironmentWrap {
  ast: LatexAbstractSyntaxTree;
  content: Node[] = [];
  envs: Environment[] = [];
  args: Argument[];
  constructor(ast: LatexAbstractSyntaxTree) {
    this.ast = ast;
    this.content = this.ast.content;
  }
  verify() {
    this.envs = this.getEnvironments(this.content);
    if (this.envs.some((env) => env.env === "document")) return this.content;
    this.args = this.findEnvironmentArgs() || [];

    //if no envs
    if (this.envs.length === 0) {
      return this.createDocEnvironment();
    }

    let firstNonPreambleMacro = this.content.findIndex((node) => {
      if (!(node instanceof Macro)) return false;
      return (
        node.content.match(
          /^(documentclass|usepackage|usetikzlibrary|include|bibliography)$/,
        ) === null
      );
    });
    if (firstNonPreambleMacro === -1) return this.content;
    const doc = this.createDocEnvironment();
    return doc;
  }
  getEnvironments(nodes: Node[]): Environment[] {
    const envs: Environment[] = [];
    for (const node of nodes) {
      if (node instanceof Environment) {
        envs.push(node);
      } else if (node.hasChildren()) {
        envs.push(...this.getEnvironments(node.getNodeChildren()));
      }
    }
    return envs;
  }
  createDocEnvironment() {
    const preambleEndIndex = this.content.findIndex((node) => {
      if (node.isMacro()) {
        if (/(documentclass|usetikzlibrary|usepackage)/.test(node.content)) return false;
        if (
          node.content === "input" &&
          this.ast.dependencies.get(
            node.args![0].content.map((n) => n.toString()).join(""),
          )?.autoUse
        )
          return false;
      }
      return true;
    });
    const index = preambleEndIndex === -1 ? this.content.length : preambleEndIndex;
    const preamble = this.ast.content.slice(0, index);
    const envContent = this.ast.content.slice(index);
    const sortedEnvs = this.getEnvironmentStructure().filter((env) => !env.inAst,);
    let envs = new Environment("environment", "dummy", []);
    const diff = this.args.length - sortedEnvs.length;
    if (diff > 0) {
      new Notice("Too many arguments for environments, the last " + diff + " will be ignored.");
      this.args.splice(-diff);
    }
    let current = envs;
    while (sortedEnvs.length > 0) {
      const env = sortedEnvs.shift();
      if (!env) break;
      let arg: [Argument] | undefined = undefined;
      // Check if the environment has arguments
      if (this.args && this.args.length === sortedEnvs.length + 1) {
        const poppedArg = this.args.shift();
        arg = poppedArg ? [poppedArg] : undefined;
      }
      const newEnv = new Environment("environment", env.value, [], arg);
      current.content.push(newEnv);
      current = newEnv;
    }
    current.content.push(...envContent);
    envs = envs.content[0] as Environment;
    const doc = [...preamble, envs];
    return doc;
  }
  findEnvironmentArgs(): Argument[] | undefined {
    const firstBracketIndex = this.content.findIndex(
      (node) => node.isString?.() && node.content === "["
    );

    const controlIndexes = [
      this.content.findIndex((node) => {
        if (!(node instanceof Macro)) return false;
        if (node.content !== "input") return true;

        const name = node.args?.[0]?.content.map((n) => n.toString()).join("");
        return name === undefined || this.ast.dependencies.get(name)?.autoUse !== false;
      }),
      this.content.findIndex((node) => node instanceof Environment),
      firstBracketIndex,
    ].filter((i) => i !== -1);

    const isArgListLikely = firstBracketIndex !== -1 &&
      controlIndexes.length > 0 &&
      firstBracketIndex === Math.min(...controlIndexes);

    if (!isArgListLikely) return undefined;

    const args: Argument[] = [];
    let openIndex = firstBracketIndex;

    while (openIndex !== -1) {
      const closeIndex = findMatchingBracket(this.content, openIndex);
      if (closeIndex === -1) break;

      const rawNodes = this.content.splice(openIndex, 1 + closeIndex - openIndex);
      const start = rawNodes.findIndex((n) => !n.isWhitespaceLike?.());
      const end = rawNodes.findLastIndex((n) => !n.isWhitespaceLike?.());

      rawNodes.shift(); // Remove "["
      rawNodes.pop(); // Remove "]"
      // Trim leading/trailing whitespace
      while (rawNodes[0]?.isWhitespaceLike?.()) rawNodes.shift();
      while (rawNodes[rawNodes.length - 1]?.isWhitespaceLike?.()) rawNodes.pop();
      args.push(new Argument("[", "]", rawNodes));
      openIndex = this.content.findIndex((node) => node.isString?.() && node.content === "[");
      const range = this.content.slice(firstBracketIndex, openIndex);
      if (openIndex !== -1 && !range.every((n) => n.isWhitespaceLike?.())) break;
    }

    return args;
  }
  getEnvironmentStructure() {
    const envs = this.envs.map((env) => env.env);
    const sortedEnvs: {
      parent: string | null;
      value: string;
      inAst: boolean;
    }[] = [];
    for (const env of envs) {
      let parent = envDepthStructure[env];
      if (parent === undefined) {
        console.warn(
          `Environment ${env} not found in envDepthStructure, assuming root level`,
        );
      }
      parent = !parent && env != "document" ? "document" : parent || null;

      sortedEnvs.push({ parent, value: env, inAst: true });
    }
    if (sortedEnvs.length === 0) {
      sortedEnvs.push({
        parent: "document",
        value: "tikzpicture",
        inAst: false,
      }); // Default environment if none found
    }
    let unknownEnv: string | null = null;
    do {
      unknownEnv =
        sortedEnvs.find(
          (env) =>
            env.parent !== null &&
            !sortedEnvs.some((e) => e.value === env.parent),
        )?.parent || null;
      if (unknownEnv) {
        const parentEnv = envDepthStructure[unknownEnv] || null;
        if (parentEnv === undefined) {
          console.warn(
            `Environment ${unknownEnv} not found in envDepthStructure, assuming root level`,
          );
        }
        sortedEnvs.push({ parent: parentEnv, value: unknownEnv, inAst: false });
      }
    } while (unknownEnv !== null);
    sortedEnvs.sort((a, b) => {
      if (a.parent === null && b.parent !== null) return -1;
      if (a.parent !== null && b.parent === null) return 1;
      if (a.parent === b.parent) return 0;
      return a.value.localeCompare(b.value);
    });
    return sortedEnvs;
  }
}

const bracketPairs = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
};

function findMatchingBracket(content: Node[], index: number) {
  if (!content[index].isString() || !(content[index].content in bracketPairs))
    throw new Error("Not a bracket");
  const bracket = content[index].content;
  const bracketPair = bracketPairs[bracket as keyof typeof bracketPairs];
  let count = 0;
  for (let i = index; i < content.length; i++) {
    const node = content[i];
    if (!node.isString()) continue;
    if (node.content === bracket) count++;
    if (node.content === bracketPair) count--;
    if (count === 0) return i + index;
  }
  throw new Error("No matching bracket found");
}

/**
 * Maps LaTeX environment names to their required parent environments.
 * Null if root level.
 */
const envDepthStructure: Record<string, null | string> = {
  document: null,
  tikzpicture: "document",
  axis: "tikzpicture",
  scope: "tikzpicture",
};
