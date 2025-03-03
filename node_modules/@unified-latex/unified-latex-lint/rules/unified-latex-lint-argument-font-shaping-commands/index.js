import { lintRule } from "unified-lint-rule";
import { m, s } from "@unified-latex/unified-latex-builder";
import { printRaw } from "@unified-latex/unified-latex-util-print-raw";
import { match } from "@unified-latex/unified-latex-util-match";
import { visit } from "@unified-latex/unified-latex-util-visit";
import { replaceStreamingCommand, replaceNodeDuringVisit, firstSignificantNode } from "@unified-latex/unified-latex-util-replace";
import { h as hasBreakingNode } from "../../has-parbreak-DuSi3V4y.js";
import { trimStart, trimEnd } from "@unified-latex/unified-latex-util-trim";
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
const isReplaceable = match.createMacroMatcher(REPLACEMENTS);
function groupStartsWithMacroAndHasNoParbreak(group) {
  if (!match.group(group)) {
    return false;
  }
  let firstNode = firstSignificantNode(group.content);
  return isReplaceable(firstNode) && !hasBreakingNode(group.content);
}
const DESCRIPTION = `## Lint Rule

Prefer using text shaping commands with arguments (e.g. \`\\textbf{foo bar}\`) over in-stream text shaping commands
(e.g. \`{\\bfseries foo bar}\`) if the style does not apply for multiple paragraphs.
This rule is useful when parsing LaTeX into other tree structures (e.g., when converting from LaTeX to HTML). 


This rule flags any usage of \`${Object.keys(REPLACEMENTS).map((r) => printRaw(m(r))).join("` `")}\`
`;
const unifiedLatexLintArgumentFontShapingCommands = lintRule(
  { origin: "unified-latex-lint:argument-font-shaping-commands" },
  (tree, file, options) => {
    const lintedNodes = /* @__PURE__ */ new Set();
    visit(
      tree,
      (group, info) => {
        const nodes = group.content;
        for (const node of nodes) {
          if (isReplaceable(node) && !lintedNodes.has(node)) {
            lintedNodes.add(node);
            const macroName = node.content;
            file.message(
              `Replace "${printRaw(group)}" with "${printRaw(
                REPLACEMENTS[macroName](s("..."))
              )}"`,
              node
            );
            break;
          }
        }
        if (options == null ? void 0 : options.fix) {
          let fixed = replaceStreamingCommand(
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
          if (match.whitespaceLike(prevToken) && match.whitespaceLike(fixed[0])) {
            trimStart(fixed);
          }
          if (match.whitespaceLike(nextToken) && match.whitespaceLike(fixed[fixed.length - 1])) {
            trimEnd(fixed);
          }
          replaceNodeDuringVisit(fixed, info);
        }
      },
      { test: groupStartsWithMacroAndHasNoParbreak }
    );
    visit(
      tree,
      (nodes) => {
        if (hasBreakingNode(nodes)) {
          return;
        }
        let hasReplaceableContent = false;
        for (const node of nodes) {
          if (isReplaceable(node) && !lintedNodes.has(node)) {
            lintedNodes.add(node);
            hasReplaceableContent = true;
            const macroName = node.content;
            file.message(
              `Replace "${printRaw(nodes)}" with "${printRaw(
                REPLACEMENTS[macroName](s("..."))
              )}"`,
              node
            );
          }
        }
        if (hasReplaceableContent && (options == null ? void 0 : options.fix)) {
          replaceStreamingCommand(
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
export {
  DESCRIPTION,
  unifiedLatexLintArgumentFontShapingCommands
};
//# sourceMappingURL=index.js.map
