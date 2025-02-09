"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
const unifiedLatexUtilVisit = require("@unified-latex/unified-latex-util-visit");
const unifiedLatexUtilPrintRaw = require("@unified-latex/unified-latex-util-print-raw");
const unifiedLatexUtilTrim = require("@unified-latex/unified-latex-util-trim");
function stripComments(nodes) {
  return nodes.filter((node) => node.type !== "comment");
}
function trimWithReturn(nodes) {
  unifiedLatexUtilTrim.trim(nodes);
  return nodes;
}
function splitOnComma(nodes) {
  const ret = [];
  let curr = [];
  for (const node of stripComments(nodes)) {
    if (node.type === "string" && node.content === ",") {
      ret.push(curr);
      curr = [];
    } else {
      curr.push(node);
    }
  }
  if (curr.length > 0) {
    ret.push(curr);
  }
  return ret.map(trimWithReturn);
}
function nodesToString(nodes) {
  var _a, _b;
  if (nodes.length === 0) {
    return { type: "string", content: "" };
  }
  if (nodes.length === 1 && nodes[0].type === "string") {
    return nodes[0];
  }
  const start = (_a = nodes[0].position) == null ? void 0 : _a.start;
  const end = (_b = nodes[nodes.length - 1].position) == null ? void 0 : _b.end;
  const ret = { type: "string", content: unifiedLatexUtilPrintRaw.printRaw(nodes) };
  if (start && end) {
    Object.assign(ret, { position: { start, end } });
  }
  return ret;
}
function processCommaSeparatedList(nodes) {
  return splitOnComma(nodes).map(nodesToString);
}
const isUseOrRequirePackageMacro = unifiedLatexUtilMatch.match.createMacroMatcher([
  "usepackage",
  "RequirePackage"
]);
function listPackages(tree) {
  const ret = [];
  unifiedLatexUtilVisit.visit(
    tree,
    (node) => {
      if (node.content === "usepackage") {
        const packages = processCommaSeparatedList(
          node.args ? node.args[1].content : []
        );
        ret.push(...packages);
      }
      if (node.content === "RequirePackage") {
        const packages = processCommaSeparatedList(
          node.args ? node.args[1].content : []
        );
        ret.push(...packages);
      }
    },
    { test: isUseOrRequirePackageMacro }
  );
  return ret;
}
exports.listPackages = listPackages;
//# sourceMappingURL=index.cjs.map
