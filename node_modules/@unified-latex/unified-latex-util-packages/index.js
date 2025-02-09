import { match } from "@unified-latex/unified-latex-util-match";
import { visit } from "@unified-latex/unified-latex-util-visit";
import { printRaw } from "@unified-latex/unified-latex-util-print-raw";
import { trim } from "@unified-latex/unified-latex-util-trim";
function stripComments(nodes) {
  return nodes.filter((node) => node.type !== "comment");
}
function trimWithReturn(nodes) {
  trim(nodes);
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
  const ret = { type: "string", content: printRaw(nodes) };
  if (start && end) {
    Object.assign(ret, { position: { start, end } });
  }
  return ret;
}
function processCommaSeparatedList(nodes) {
  return splitOnComma(nodes).map(nodesToString);
}
const isUseOrRequirePackageMacro = match.createMacroMatcher([
  "usepackage",
  "RequirePackage"
]);
function listPackages(tree) {
  const ret = [];
  visit(
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
export {
  listPackages
};
//# sourceMappingURL=index.js.map
