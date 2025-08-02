import { parse } from "./parseSvg";
import { stringify } from "./stringifySvgAst";
export const SVG_ID_KEY = "data-id";
export type svgNode = genericNode | SVGroot;

export class genericNode {
  name: string;
  type: string;
  value: string;
  attributes: Record<string, string>;
  children: svgNode[];
  constructor(
    name: string,
    type: string,
    value: string,
    attributes: Record<string, string>,
    children: genericNode[],
  ) {
    this.name = name;
    this.type = type;
    this.value = value;
    this.attributes = attributes;
    this.children = children;
  }
}

class Attributes {}

class svgPath {}

export class SVGroot {
  private name: string;
  private type: string;
  private value: string;
  private attributes: Record<string, string>;
  private children: svgNode[];
  constructor(
    name: string,
    type: string,
    value: string,
    attributes: Record<string, string>,
    children: svgNode[],
  ) {
    this.name = name;
    this.type = type;
    this.value = value;
    this.attributes = attributes;
    this.children = children;
  }
  static async parse(svgString: string): Promise<SVGroot> {
    const parsedSvg = await parse(svgString);
    if (!(parsedSvg instanceof SVGroot)) {
      throw new Error("Root not found");
    }
    return parsedSvg;
  }
  toString() {
    return stringify(this);
  }
  idSvg(id: string) {
    this.attributes["data-id"] = id;
  }

}
