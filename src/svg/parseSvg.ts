import {
  INode,
  IStringifyOptions,
  parse as parseToJson,
  stringify,
} from "svgson";
import { genericNode, svgNode, SVGroot } from "./nodes";

export async function parse(svg: string) {
  const json = await parseToJson(svg);
  return migrat(json);
}

function migrat(svg: INode): svgNode {
  const { name, type, value, attributes, children } = svg;
  switch (name) {
    case "svg":
      return new SVGroot(name, type, value, attributes, children.map(migrat));
      break;
  }
  return new genericNode(name, type, value, attributes, children.map(migrat));
}
