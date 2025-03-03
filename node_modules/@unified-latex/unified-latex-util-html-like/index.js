import { m, arg } from "@unified-latex/unified-latex-builder";
import { match } from "@unified-latex/unified-latex-util-match";
import { printRaw } from "@unified-latex/unified-latex-util-print-raw";
function tagName(tag) {
  return `html-tag:${tag}`;
}
function attributeName(attribute) {
  return `html-attr:${attribute}`;
}
function getTagNameFromString(tagName2) {
  const match2 = tagName2.match(/:.*/);
  if (match2) {
    return match2[0].slice(1);
  }
  throw new Error(`Could not find tag name in ${tagName2}`);
}
function getAttributeNameFromString(tagName2) {
  const match2 = tagName2.match(/:.*/);
  if (match2) {
    return match2[0].slice(1);
  }
  throw new Error(`Could not find attribute name in ${tagName2}`);
}
function htmlLike({
  tag,
  content,
  attributes
}) {
  if (!content) {
    content = [];
  }
  if (content && !Array.isArray(content)) {
    content = [content];
  }
  attributes = attributes || {};
  const attrs = Object.entries(attributes).map(
    ([name, value]) => {
      value = JSON.stringify(value);
      return m(attributeName(name), arg(value));
    }
  );
  return m(tagName(tag), arg(attrs.concat(content)));
}
function extractFromHtmlLike(macro) {
  if (!isHtmlLikeTag(macro)) {
    throw new Error(
      "Attempting to extract html contents from a node that is not html-like."
    );
  }
  const args = macro.args || [];
  if (args.length > 1) {
    throw new Error(
      `html-like macros should have 0 or 1 args, but ${args.length} found`
    );
  }
  const argContent = args.length > 0 ? args[0].content : [];
  const tag = getTagNameFromString(macro.content);
  const attributes = {};
  let i = 0;
  for (; i < argContent.length; i++) {
    const node = argContent[i];
    if (isHtmlLikeAttribute(node)) {
      const attrName = getAttributeNameFromString(node.content);
      let attrValue = true;
      if (node.args && node.args.length > 0) {
        attrValue = JSON.parse(printRaw(node.args[0].content));
      }
      attributes[attrName] = attrValue;
      continue;
    }
    break;
  }
  return { tag, attributes, content: argContent.slice(i) };
}
function isHtmlLike(node) {
  return match.macro(node) && node.content.startsWith("html-");
}
function isHtmlLikeTag(node) {
  return match.macro(node) && node.content.startsWith("html-tag:");
}
function isHtmlLikeAttribute(node) {
  return match.macro(node) && node.content.startsWith("html-attr:");
}
export {
  extractFromHtmlLike,
  htmlLike,
  isHtmlLike,
  isHtmlLikeAttribute,
  isHtmlLikeTag
};
//# sourceMappingURL=index.js.map
