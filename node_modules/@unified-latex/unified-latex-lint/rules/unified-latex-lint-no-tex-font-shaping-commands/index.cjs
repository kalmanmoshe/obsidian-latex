"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const unifiedLatexBuilder = require("@unified-latex/unified-latex-builder");
const unifiedLatexUtilPrintRaw = require("@unified-latex/unified-latex-util-print-raw");
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
const unifiedLatexUtilVisit = require("@unified-latex/unified-latex-util-visit");
const unifiedLatexUtilReplace = require("@unified-latex/unified-latex-util-replace");
const index = require("../../index-CvNqyD-G.cjs");
const REPLACEMENTS = {
  bf: "bfseries",
  it: "itshape",
  rm: "rmfamily",
  sc: "scshape",
  sf: "sffamily",
  sl: "slshape",
  tt: "ttfamily"
};
const isReplaceable = unifiedLatexUtilMatch.match.createMacroMatcher(REPLACEMENTS);
const DESCRIPTION = `## Lint Rule

Avoid using TeX font changing commands like \\bf, \\it, etc. Prefer LaTeX \\bfseries, \\itshape, etc.. 

This rule flags any usage of \`${Object.keys(REPLACEMENTS).map((r) => unifiedLatexUtilPrintRaw.printRaw(unifiedLatexBuilder.m(r))).join("` `")}\`

### See

CTAN l2tabuen Section 2.`;
const unifiedLatexLintNoTexFontShapingCommands = index.lintRule(
  { origin: "unified-latex-lint:no-tex-font-shaping-commands" },
  (tree, file, options) => {
    unifiedLatexUtilVisit.visit(
      tree,
      (node, info) => {
        const macroName = node.content;
        file.message(
          `Replace "${unifiedLatexUtilPrintRaw.printRaw(node)}" with "${unifiedLatexUtilPrintRaw.printRaw(
            unifiedLatexBuilder.m(REPLACEMENTS[macroName])
          )}"`,
          node
        );
        if (options == null ? void 0 : options.fix) {
          unifiedLatexUtilReplace.replaceNodeDuringVisit(unifiedLatexBuilder.m(REPLACEMENTS[macroName]), info);
        }
      },
      { test: isReplaceable }
    );
  }
);
exports.DESCRIPTION = DESCRIPTION;
exports.unifiedLatexLintNoTexFontShapingCommands = unifiedLatexLintNoTexFontShapingCommands;
//# sourceMappingURL=index.cjs.map
