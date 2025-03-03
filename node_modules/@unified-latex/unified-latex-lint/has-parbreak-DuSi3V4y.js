import { match } from "@unified-latex/unified-latex-util-match";
function hasParbreak(nodes) {
  return nodes.some(
    (node) => match.parbreak(node) || match.macro(node, "par")
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
  const macroMatcher = match.createMacroMatcher(macrosThatBreakPars);
  const envMatcher = match.createEnvironmentMatcher(
    environmentsThatDontBreakPars
  );
  return nodes.some(
    (node) => macroMatcher(node) || match.anyEnvironment(node) && !envMatcher(node)
  );
}
export {
  hasParbreak as a,
  hasBreakingNode as h
};
//# sourceMappingURL=has-parbreak-DuSi3V4y.js.map
