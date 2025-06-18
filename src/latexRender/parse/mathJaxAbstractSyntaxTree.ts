import { parseMath, migrateToClassStructure } from "./autoParse/ast-types-pre";
import {
  Whitespace,
  Parbreak,
  Macro,
  Argument,
  Ast,
  Node,
} from "./typs/ast-types-post";

export class MathJaxAbstractSyntaxTree {
  ast: Node[];
  parse(latex: string) {
    const ast = migrateToClassStructure(parseMath(latex));
    if (ast instanceof Array) {
      this.ast = ast;
    } else {
      throw new Error("Root not found it is not in Array, got: " + ast);
    }
  }
  reverseRtl() {
    const args = findTextMacros(this.ast);
    for (const arg of args) {
      const text = arg.toString();
      let tokens = text.match(/([א-ת]+|\s+|[^א-ת\s]+)/g) as string[] | null;
      if (!tokens) continue;
      tokens = mergeHebrewTokens(tokens);
      const newNodeArr = migrateToClassStructure(
        parseMath(
          tokens
            .map((t) => (/[א-ת]/.test(t) ? [...t].reverse().join("") : t))
            .join(""),
        ),
      );
      if (newNodeArr instanceof Array) {
        arg.content = newNodeArr;
      } else {
        throw new Error(
          "Root not found it is not in Array, got: " + newNodeArr,
        );
      }
    }
  }

  toString(): string {
    return this.ast
      .map((node) => {
        return node.toString();
      })
      .join("");
  }
}

// Define Instance (replace with your actual type if available)
type Instance = Ast;

function removeInstanceFromAst(ast: Ast, instance: Instance): void {
  if (Array.isArray(ast)) {
    for (let i = ast.length - 1; i >= 0; i--) {
      ast[i] === instance
        ? ast.splice(i, 1)
        : removeInstanceFromAst(ast[i], instance);
    }
  }
  if (ast && typeof ast === "object") {
    for (const key of ["content", "args"]) {
      if (!(key in ast)) {
        continue;
      }
      let node = ast[key as keyof typeof ast];
      if (!node) continue;

      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) {
          if (node[i] === instance) {
            node.splice(i, 1);
          } else {
            removeInstanceFromAst(node[i], instance);
          }
        }
      }
    }
  }
}

function mergeHebrewTokens(tokens: string[]): string[] {
  const isHeb = (s: string) => /^[\u05D0-\u05EA]+$/.test(s);
  const res: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (isHeb(tokens[i])) {
      let merged = tokens[i++];
      while (
        i + 1 < tokens.length &&
        /^\s+$/.test(tokens[i]) &&
        isHeb(tokens[i + 1])
      ) {
        merged += tokens[i] + tokens[i + 1];
        i += 2;
      }
      res.push(merged);
    } else {
      res.push(tokens[i++]);
    }
  }
  return res;
}

function findTextMacros(ast: Ast): Argument[] {
  const macros: Argument[] = [];
  if (Array.isArray(ast)) {
    for (const node of ast) {
      macros.push(...findTextMacros(node));
    }
  } else if (ast instanceof Macro && ast.args) {
    if (ast.content === "text") macros.push(...ast.args);
    else {
      for (const arg of ast.args) {
        macros.push(...findTextMacros(arg));
      }
    }
  } else if (
    !(ast instanceof Whitespace || ast instanceof Parbreak) &&
    Array.isArray(ast.content)
  ) {
    for (const node of ast.content) {
      macros.push(...findTextMacros(node));
    }
  }

  return macros;
}
