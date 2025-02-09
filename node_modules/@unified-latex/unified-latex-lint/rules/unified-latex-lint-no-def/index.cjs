"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
const unifiedLatexUtilVisit = require("@unified-latex/unified-latex-util-visit");
const index = require("../../index-CvNqyD-G.cjs");
const isDefMacro = unifiedLatexUtilMatch.match.createMacroMatcher(["def"]);
const DESCRIPTION = `## Lint Rule

Avoid using \`\\def\\macro{val}\` to define a macro. Use \`\\newcommand{\\macro}{val}\` or
\`\\NewDocumentCommand{\\macro}{}{val}\` from the \`xparse\` package.

### See

CTAN l2tabuen Section 1.7
`;
const unifiedLatexLintNoDef = index.lintRule(
  { origin: "unified-latex-lint:no-def" },
  (tree, file) => {
    unifiedLatexUtilVisit.visit(
      tree,
      (node) => {
        file.message(
          `Do not use \`\\def\\macro{val}\` to define a macro. Use \`\\newcommand{\\macro}{val}\` or \`\\NewDocumentCommand{\\macro}{}{val}\` from the \`xparse\` package.`,
          node
        );
      },
      { test: isDefMacro }
    );
  }
);
exports.DESCRIPTION = DESCRIPTION;
exports.unifiedLatexLintNoDef = unifiedLatexLintNoDef;
//# sourceMappingURL=index.cjs.map
