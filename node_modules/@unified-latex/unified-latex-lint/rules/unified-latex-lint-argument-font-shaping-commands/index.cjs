"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const unifiedLatexBuilder = require("@unified-latex/unified-latex-builder");
const unifiedLatexUtilPrintRaw = require("@unified-latex/unified-latex-util-print-raw");
const unifiedLatexUtilMatch = require("@unified-latex/unified-latex-util-match");
const unifiedLatexUtilVisit = require("@unified-latex/unified-latex-util-visit");
const unifiedLatexUtilReplace = require("@unified-latex/unified-latex-util-replace");
const hasParbreak = require("../../has-parbreak-B-AJW5Bm.cjs");
const unifiedLatexUtilTrim = require("@unified-latex/unified-latex-util-trim");
const index = require("../../index-CvNqyD-G.cjs");
function singleArgMacroFactory(macroName) {
  return (content) => {
    if (!Array.isArray(content)) {
      content = [content];
    }
    return {
      type: "macro",
      content: macroName,
      args: [
        {
          type: "argument",
          openMark: "{",
          closeMark: "}",
          content
        }
      ],
      _renderInfo: { inParMode: true }
    };
  };
}
const REPLACEMENTS = {
  bfseries: singleArgMacroFactory("textbf"),
  itshape: singleArgMacroFactory("textit"),
  rmfamily: singleArgMacroFactory("textrm"),
  scshape: singleArgMacroFactory("textsc"),
  sffamily: singleArgMacroFactory("textsf"),
  slshape: singleArgMacroFactory("textsl"),
  ttfamily: singleArgMacroFactory("texttt"),
  em: singleArgMacroFactory("emph")
};
const isReplaceable = unifiedLatexUtilMatch.match.createMacroMatcher(REPLACEMENTS);
function groupStartsWithMacroAndHasNoParbreak(group) {
  if (!unifiedLatexUtilMatch.match.group(group)) {
    return false;
  }
  let firstNode = unifiedLatexUtilReplace.firstSignificantNode(group.content);
  return isReplaceable(firstNode) && !hasParbreak.hasBreakingNode(group.content);
}
const DESCRIPTION = `## Lint Rule

Prefer using text shaping commands with arguments (e.g. \`\\textbf{foo bar}\`) over in-stream text shaping commands
(e.g. \`{\\bfseries foo bar}\`) if the style does not apply for multiple paragraphs.
This rule is useful when parsing LaTeX into other tree structures (e.g., when converting from LaTeX to HTML). 


This rule flags any usage of \`${Object.keys(REPLACEMENTS).map((r) => unifiedLatexUtilPrintRaw.printRaw(unifiedLatexBuilder.m(r))).join("` `")}\`
`;
const unifiedLatexLintArgumentFontShapingCommands = index.lintRule(
  { origin: "unified-latex-lint:argument-font-shaping-commands" },
  (tree, file, options) => {
    const lintedNodes = /* @__PURE__ */ new Set();
    unifiedLatexUtilVisit.visit(
      tree,
      (group, info) => {
        const nodes = group.content;
        for (const node of nodes) {
          if (isReplaceable(node) && !lintedNodes.has(node)) {
            lintedNodes.add(node);
            const macroName = node.content;
            file.message(
              `Replace "${unifiedLatexUtilPrintRaw.printRaw(group)}" with "${unifiedLatexUtilPrintRaw.printRaw(
                REPLACEMENTS[macroName](unifiedLatexBuilder.s("..."))
              )}"`,
              node
            );
            break;
          }
        }
        if (options == null ? void 0 : options.fix) {
          let fixed = unifiedLatexUtilReplace.replaceStreamingCommand(
            group,
            isReplaceable,
            (content, command) => {
              return REPLACEMENTS[command.content](content);
            }
          );
          if (!info.containingArray || info.index == null) {
            return;
          }
          const prevToken = info.containingArray[info.index - 1];
          const nextToken = info.containingArray[info.index + 1];
          if (unifiedLatexUtilMatch.match.whitespaceLike(prevToken) && unifiedLatexUtilMatch.match.whitespaceLike(fixed[0])) {
            unifiedLatexUtilTrim.trimStart(fixed);
          }
          if (unifiedLatexUtilMatch.match.whitespaceLike(nextToken) && unifiedLatexUtilMatch.match.whitespaceLike(fixed[fixed.length - 1])) {
            unifiedLatexUtilTrim.trimEnd(fixed);
          }
          unifiedLatexUtilReplace.replaceNodeDuringVisit(fixed, info);
        }
      },
      { test: groupStartsWithMacroAndHasNoParbreak }
    );
    unifiedLatexUtilVisit.visit(
      tree,
      (nodes) => {
        if (hasParbreak.hasBreakingNode(nodes)) {
          return;
        }
        let hasReplaceableContent = false;
        for (const node of nodes) {
          if (isReplaceable(node) && !lintedNodes.has(node)) {
            lintedNodes.add(node);
            hasReplaceableContent = true;
            const macroName = node.content;
            file.message(
              `Replace "${unifiedLatexUtilPrintRaw.printRaw(nodes)}" with "${unifiedLatexUtilPrintRaw.printRaw(
                REPLACEMENTS[macroName](unifiedLatexBuilder.s("..."))
              )}"`,
              node
            );
          }
        }
        if (hasReplaceableContent && (options == null ? void 0 : options.fix)) {
          unifiedLatexUtilReplace.replaceStreamingCommand(
            nodes,
            isReplaceable,
            (content, command) => {
              return REPLACEMENTS[command.content](content);
            }
          );
        }
      },
      { includeArrays: true, test: Array.isArray }
    );
  }
);
exports.DESCRIPTION = DESCRIPTION;
exports.unifiedLatexLintArgumentFontShapingCommands = unifiedLatexLintArgumentFontShapingCommands;
//# sourceMappingURL=index.cjs.map
