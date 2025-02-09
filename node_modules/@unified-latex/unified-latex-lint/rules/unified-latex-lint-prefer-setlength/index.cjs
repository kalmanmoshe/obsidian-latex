"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const unifiedLatexBuilder = require("@unified-latex/unified-latex-builder");
const unifiedLatexUtilGlue = require("@unified-latex/unified-latex-util-glue");
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
const unifiedLatexUtilPrintRaw = require("@unified-latex/unified-latex-util-print-raw");
const unifiedLatexUtilScan = require("@unified-latex/unified-latex-util-scan");
const unifiedLatexUtilVisit = require("@unified-latex/unified-latex-util-visit");
const index = require("../../index-CvNqyD-G.cjs");
const LENGTH_MACROS = [
  "abovecaptionskip",
  "arraycolsep",
  "arrayrulewidth",
  "belowcaptionskip",
  "captionindent",
  "columnsep",
  "columnseprule",
  "doublerulsep",
  "fboxrule",
  "fboxsep",
  "itemsep",
  "itemindent",
  "labelsep",
  "labelwidth",
  "leftmargin",
  "leftmargini",
  "leftmarginii",
  "leftmarginiii",
  "leftmarginiv",
  "leftmarginv",
  "leftmarginvi",
  "lineskip",
  "linewidth",
  "listparindent",
  "marginparsep",
  "marginparwidth",
  "@mpfootins",
  "normallineskip",
  "overfullrule",
  "paperwidth",
  "paperheight",
  "parsep",
  "partopsep",
  "parskip",
  "parindent",
  "parfillskip",
  "tabbingsep",
  "tabcolsep"
];
const isLengthMacro = unifiedLatexUtilMatch.match.createMacroMatcher(LENGTH_MACROS);
const DESCRIPTION = `## Lint Rule

Avoid using TeX-style \`\\parskip=1em\` length assignments and instead
use LaTeX-style \`\\setlength{\\parskip}{1em}\`.

### See

CTAN l2tabuen Section 1.5
`;
const unifiedLatexLintPreferSetlength = index.lintRule({ origin: "unified-latex-lint:prefer-setlength" }, (tree, file, options) => {
  unifiedLatexUtilVisit.visit(
    tree,
    (node, info) => {
      if (info.index == null) {
        return;
      }
      const containingArray = info.containingArray;
      if (!containingArray) {
        return;
      }
      const equalsIndex = unifiedLatexUtilScan.scan(containingArray, "=", {
        startIndex: info.index + 1,
        onlySkipWhitespaceAndComments: true
      });
      if (equalsIndex == null) {
        return;
      }
      file.message(
        `TeX-style assignment to length \`${unifiedLatexUtilPrintRaw.printRaw(
          node
        )}\`; prefer LaTeX \`\\setlength{${unifiedLatexUtilPrintRaw.printRaw(node)}}{...}\``,
        node
      );
      if (options == null ? void 0 : options.fix) {
        const glue = unifiedLatexUtilGlue.extractFormattedGlue(
          containingArray,
          equalsIndex + 1
        );
        if (!glue) {
          console.warn(
            "Expected to find glue following `=` but couldn't"
          );
          return;
        }
        const numReplacements = glue.span.end - info.index + 1;
        containingArray.splice(
          info.index,
          numReplacements,
          ...[
            unifiedLatexBuilder.m("setlength", [unifiedLatexBuilder.arg(node), unifiedLatexBuilder.arg(glue.glue)]),
            ...glue.trailingStrings
          ]
        );
        return info.index + 1;
      }
    },
    { test: isLengthMacro }
  );
});
exports.DESCRIPTION = DESCRIPTION;
exports.unifiedLatexLintPreferSetlength = unifiedLatexLintPreferSetlength;
//# sourceMappingURL=index.cjs.map
