"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
const unifiedLatexUtilPegjs = require("@unified-latex/unified-latex-util-pegjs");
function parseTexGlue(source) {
  try {
    return unifiedLatexUtilPegjs.GluePegParser.parse(source);
  } catch {
  }
  return null;
}
function printGlue(glue) {
  const ret = [
    { type: "string", content: `${glue.fixed.value}${glue.fixed.unit}` }
  ];
  if (glue.stretchable) {
    ret.push({ type: "whitespace" });
    ret.push({ type: "string", content: "plus" });
    ret.push({ type: "whitespace" });
    ret.push({
      type: "string",
      content: `${glue.stretchable.value}${glue.stretchable.unit}`
    });
  }
  if (glue.shrinkable) {
    ret.push({ type: "whitespace" });
    ret.push({ type: "string", content: "minus" });
    ret.push({ type: "whitespace" });
    ret.push({
      type: "string",
      content: `${glue.shrinkable.value}${glue.shrinkable.unit}`
    });
  }
  return ret;
}
function findGlue(nodes, startIndex) {
  let searchString = "";
  const sourceIndices = [];
  for (let i = startIndex; i < nodes.length; i++) {
    const node = nodes[i];
    if (unifiedLatexUtilMatch.match.whitespace(node) || unifiedLatexUtilMatch.match.comment(node)) {
      continue;
    }
    if (!unifiedLatexUtilMatch.match.anyString(node)) {
      break;
    }
    searchString += node.content;
    node.content.split("").forEach(() => sourceIndices.push(i));
  }
  const glue = parseTexGlue(searchString);
  if (!glue) {
    return null;
  }
  const printedGlue = printGlue(glue);
  const glueLen = glue.position.end.offset;
  const firstInstanceOfNodeIndex = sourceIndices.indexOf(
    sourceIndices[glueLen]
  );
  return {
    printedGlue,
    endIndex: sourceIndices[glueLen - 1],
    partialSliceLen: glueLen - firstInstanceOfNodeIndex
  };
}
function extractFormattedGlue(nodes, startIndex) {
  const glue = findGlue(nodes, startIndex);
  if (!glue) {
    return null;
  }
  let trailingStrings = [];
  const retNodes = glue.printedGlue;
  const lastString = nodes[glue.endIndex];
  if (lastString.type !== "string") {
    throw new Error(`Expect string node, but found "${lastString.type}"`);
  }
  if (lastString.content.length > glue.partialSliceLen) {
    trailingStrings.push({
      type: "string",
      content: lastString.content.slice(glue.partialSliceLen)
    });
  }
  return {
    glue: retNodes,
    span: { start: startIndex, end: glue.endIndex },
    trailingStrings
  };
}
exports.extractFormattedGlue = extractFormattedGlue;
exports.findGlue = findGlue;
exports.parseTexGlue = parseTexGlue;
exports.printGlue = printGlue;
//# sourceMappingURL=index.cjs.map
