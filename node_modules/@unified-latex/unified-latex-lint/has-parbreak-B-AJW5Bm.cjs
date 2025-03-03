"use strict";
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
function hasParbreak(nodes) {
  return nodes.some(
    (node) => unifiedLatexUtilMatch.match.parbreak(node) || unifiedLatexUtilMatch.match.macro(node, "par")
  );
}
function hasBreakingNode(nodes, options) {
  if (hasParbreak(nodes)) {
    return true;
  }
  const {
    macrosThatBreakPars = [
      "part",
      "chapter",
      "section",
      "subsection",
      "subsubsection",
      "vspace",
      "smallskip",
      "medskip",
      "bigskip",
      "hfill"
    ],
    environmentsThatDontBreakPars = []
  } = {};
  const macroMatcher = unifiedLatexUtilMatch.match.createMacroMatcher(macrosThatBreakPars);
  const envMatcher = unifiedLatexUtilMatch.match.createEnvironmentMatcher(
    environmentsThatDontBreakPars
  );
  return nodes.some(
    (node) => macroMatcher(node) || unifiedLatexUtilMatch.match.anyEnvironment(node) && !envMatcher(node)
  );
}
exports.hasBreakingNode = hasBreakingNode;
exports.hasParbreak = hasParbreak;
//# sourceMappingURL=has-parbreak-B-AJW5Bm.cjs.map
