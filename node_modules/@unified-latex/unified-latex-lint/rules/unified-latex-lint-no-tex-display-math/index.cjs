"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
const unifiedLatexUtilVisit = require("@unified-latex/unified-latex-util-visit");
const index = require("../../index-CvNqyD-G.cjs");
const DESCRIPTION = `## Lint Rule

Avoid using TeX display math command \`$$...$$\`. Instead prefer \`\\[...\\] \`.

When printing processed latex, \`$$...$$\` is automatically replaced with \`\\[...\\] \`.

### See

CTAN l2tabuen Section 1.7`;
const unifiedLatexLintNoTexDisplayMath = index.lintRule(
  { origin: "unified-latex-lint:no-tex-display-math" },
  (tree, file, options) => {
    unifiedLatexUtilVisit.visit(
      tree,
      (node) => {
        if (node.type !== "displaymath" || node.position == null) {
          return;
        }
        if (file.value && file.value.slice(
          node.position.start.offset,
          node.position.start.offset + 2
        ) === "$$") {
          file.message(
            `Avoid using $$...$$ for display math; prefer \\[...\\]`,
            node
          );
        }
      },
      { test: unifiedLatexUtilMatch.match.math }
    );
  }
);
exports.DESCRIPTION = DESCRIPTION;
exports.unifiedLatexLintNoTexDisplayMath = unifiedLatexLintNoTexDisplayMath;
//# sourceMappingURL=index.cjs.map
