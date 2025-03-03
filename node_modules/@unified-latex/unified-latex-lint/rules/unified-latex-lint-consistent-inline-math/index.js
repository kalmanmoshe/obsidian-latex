import { lintRule } from "unified-lint-rule";
import { match } from "@unified-latex/unified-latex-util-match";
import { visit } from "@unified-latex/unified-latex-util-visit";
const DESCRIPTION = `## Lint Rule

Avoid mixing TeX-style inline math \`$...$\` with LaTeX-style \`\\(...\\)\` inline math.
`;
const unifiedLatexLintConsistentInlineMath = lintRule(
  { origin: "unified-latex-lint:consistent-inline-math" },
  (tree, file, options) => {
    const inlineMath = {
      tex: [],
      latex: []
    };
    visit(
      tree,
      (node) => {
        if (node.type !== "inlinemath" || node.position == null) {
          return;
        }
        if (file.value && file.value.slice(
          node.position.start.offset,
          node.position.start.offset + 1
        ) === "$") {
          inlineMath.tex.push(node);
        } else {
          inlineMath.latex.push(node);
        }
      },
      { test: match.math }
    );
    if (options == null ? void 0 : options.preferredStyle) {
      if (options.preferredStyle === "tex") {
        for (const node of inlineMath.latex) {
          file.message(
            `Prefer TeX-style $...$ inline math to LaTeX-style \\(...\\)`,
            node
          );
        }
      }
      if (options.preferredStyle === "latex") {
        for (const node of inlineMath.latex) {
          file.message(
            `Prefer LaTeX-style \\(...\\) inline math to LaTeX-style $...$`,
            node
          );
        }
      }
    } else {
      const numTex = inlineMath.tex.length;
      const numLatex = inlineMath.latex.length;
      if (numTex > 0 && numLatex > 0) {
        if (numLatex > numTex) {
          for (const node of inlineMath.tex) {
            file.message(
              `Inconsistent inline-math style. This document uses LaTeX-style \\(...\\) inline math more than TeX-style $...$ inline math`,
              node
            );
          }
        } else {
          for (const node of inlineMath.latex) {
            file.message(
              `Inconsistent inline-math style. This document uses TeX-style $...$ inline math more than LaTeX-style \\(...\\) inline math`,
              node
            );
          }
        }
      }
    }
  }
);
export {
  DESCRIPTION,
  unifiedLatexLintConsistentInlineMath
};
//# sourceMappingURL=index.js.map
