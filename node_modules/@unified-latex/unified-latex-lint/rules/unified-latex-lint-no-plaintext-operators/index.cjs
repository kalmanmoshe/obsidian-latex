"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
const unifiedLatexUtilScan = require("@unified-latex/unified-latex-util-scan");
const unifiedLatexUtilVisit = require("@unified-latex/unified-latex-util-visit");
const index = require("../../index-CvNqyD-G.cjs");
const pointStart = point("start");
const pointEnd = point("end");
function point(type) {
  return point2;
  function point2(node) {
    const point3 = node && node.position && node.position[type] || {};
    return {
      // @ts-expect-error: in practice, null is allowed.
      line: point3.line || null,
      // @ts-expect-error: in practice, null is allowed.
      column: point3.column || null,
      // @ts-expect-error: in practice, null is allowed.
      offset: point3.offset > -1 ? point3.offset : null
    };
  }
}
const OPERATOR_NAMES = [
  "Pr",
  "arccos",
  "arcctg",
  "arcsin",
  "arctan",
  "arctg",
  "arg",
  "argmax",
  "argmin",
  "ch",
  "cos",
  "cosec",
  "cosh",
  "cot",
  "cotg",
  "coth",
  "csc",
  "ctg",
  "cth",
  "deg",
  "det",
  "dim",
  "exp",
  "gcd",
  "hom",
  "inf",
  "injlim",
  "ker",
  "lg",
  "lim",
  "liminf",
  "limsup",
  "ln",
  "log",
  "max",
  "min",
  "plim",
  "projlim",
  "sec",
  "sh",
  "sin",
  "sinh",
  "sup",
  "tan",
  "tanh",
  "tg",
  "th",
  "varinjlim",
  "varliminf",
  "varlimsup",
  "varprojlim"
];
const prefixTree = unifiedLatexUtilScan.Trie(OPERATOR_NAMES);
function matchesAtPos(nodes, index2) {
  const prevNode = nodes[index2 - 1];
  if (unifiedLatexUtilMatch.match.string(prevNode) && prevNode.content.match(/^[a-zA-Z]/)) {
    return null;
  }
  const matched = unifiedLatexUtilScan.prefixMatch(nodes, prefixTree, {
    startIndex: index2,
    // In math mode, all string nodes should be single characters. If they're
    // not, we have mangled them via some other process and the shouldn't be treated
    // normally
    assumeOneCharStrings: true
  });
  if (!matched) {
    return null;
  }
  const nextNode = nodes[matched.endNodeIndex + 1];
  if (unifiedLatexUtilMatch.match.string(nextNode) && nextNode.content.match(/^[a-zA-Z]/)) {
    return null;
  }
  return matched;
}
const DESCRIPTION = `## Lint Rule

Avoid writing operators in plaintext. For example, instead of \`$sin(2)$\` write \`$\\sin(2)$\`.

### See

ChkTeX Warning 35
`;
const unifiedLatexLintNoPlaintextOperators = index.lintRule(
  { origin: "unified-latex-lint:no-plaintext-operators" },
  (tree, file, options) => {
    unifiedLatexUtilVisit.visit(
      tree,
      (nodes, info) => {
        if (!info.context.inMathMode) {
          return;
        }
        for (let i = 0; i < nodes.length; i++) {
          const matched = matchesAtPos(nodes, i);
          if (matched) {
            file.message(
              `Use "\\${matched.match}" instead of the string "${matched.match}" to specify an operator name in math mode`,
              {
                start: pointStart(nodes[i]),
                end: pointEnd(nodes[matched.endNodeIndex])
              }
            );
            if (options == null ? void 0 : options.fix) {
              nodes.splice(i, matched.endNodeIndex - i + 1, {
                type: "macro",
                content: matched.match
              });
              i++;
            }
          }
        }
      },
      { test: Array.isArray, includeArrays: true }
    );
  }
);
exports.DESCRIPTION = DESCRIPTION;
exports.unifiedLatexLintNoPlaintextOperators = unifiedLatexLintNoPlaintextOperators;
//# sourceMappingURL=index.cjs.map
