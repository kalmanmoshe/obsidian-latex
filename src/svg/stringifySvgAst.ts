import { INode, TEscape } from "svgson"
import { svgNode } from "./nodes"

interface IStringifyOptions {
  transformAttr?: (key: string, value: string, escape: TEscape) => string
  transformNode?: (node: svgNode) => svgNode
  selfClose?: boolean
  indent?: string       // string used for one level of indentation (default: tab)
  newline?: string      // string used for newlines (default: "\n")
}

export function stringify(_ast: svgNode, options: IStringifyOptions = {}): string {
  const {
    transformAttr = (key, value, escape) => `${key}="${escape(value)}"`,
    transformNode = (node) => node,
    selfClose = true,
    indent = '\t',  // default indent is a tab character
    newline = '\n'
  } = options

  function _stringify(node: svgNode, currentIndent: string): string {
    if (Array.isArray(node)) {
      return node.map(n => _stringify(n, currentIndent)).join(newline)
    }

    node = transformNode(node)

    if (node.type === 'text') {
      return currentIndent + escapeText(node.value)
    }

    let attributes = ''
    for (const attr in node.attributes) {
      const attrStr = transformAttr(attr, node.attributes[attr], escapeAttr)
      attributes += attrStr ? ` ${attrStr}` : ''
    }

    if ((node.children && node.children.length > 0) || !selfClose) {
      const children = node.children
        .map(child => _stringify(child, currentIndent + indent))
        .join(newline)
      return `${currentIndent}<${node.name}${attributes}>${newline}${children}${newline}${currentIndent}</${node.name}>`
    }
    return `${currentIndent}<${node.name}${attributes}/>`
  }

  return _stringify(_ast, '')
}

const escapeText = (text: string) => {
  if (text) {
    const str = String(text)
    return /[&<>]/.test(str)
      ? `<![CDATA[${str.replace(/]]>/, ']]]]><![CDATA[>')}]]>`
      : str
  }
  return ''
}

export const escapeAttr = (attr: any) => {
  return String(attr)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
