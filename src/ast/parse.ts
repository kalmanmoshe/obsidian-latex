import {
  Root,
  String,
  Macro,
  Argument,
  Ast,
  Node,
} from "./typs/ast-types-post";
import { migrateToClassStructure, parse } from "./autoParse/ast-types-pre";
import { claenUpPaths } from "./cleanUpAst";
import { EnvironmentWrap } from "./verifyEnvironmentWrap";
import { extractBasenameAndExtension } from "src/latexRender/resolvers/paths";

/**
 * Assignments:
 * - Auto load librarys
 * - Auto load packages
 */

function insureRenderInfoexists(node: Node) {
  if (!node.renderInfo) node.renderInfo = {};
}
/**
 * Dependencies themselves and the final source of the AST are not referenced by the path but only by base name and extension.IE. somePath/dir/file.tex -> file.tex So if multiple files are referenced.With same names.This will cause a conflict and they will be overridden.Even if the paths are different.This is just because I was lazy and I didn't want to implement.Directories in the VFS. 
 */
export interface LatexDependency {
  content: string;
  basename: string;
  /**
   * The path to the file relative to the vault root.
   */
  path: string;
  extension: string;
  ast?: LatexAbstractSyntaxTree;
  isTex: boolean;
  autoUse?: boolean;
}

export class LatexAbstractSyntaxTree {
  content: Node[];
  dependencies: Map<string, LatexDependency> = new Map();
  constructor(content: Node[], dependencies?: Map<string, LatexDependency>) {
    this.content = content;
    if (dependencies) this.dependencies = dependencies;
  }
  static parse(latex: string) {
    const autoAst = parse(latex);
    const classAst = migrateToClassStructure(autoAst);
    if (!(classAst instanceof Root)) throw new Error("Root not found");
    const content = classAst.content;
    return new LatexAbstractSyntaxTree(content);
  }
  verifyProperDocumentStructure() {
    this.content = new EnvironmentWrap(this).verify();
    this.verifyDocumentclass();
    this.cleanUp();
  }
  verifydocstructure() { }
  parseArguments() { }
  hasDocumentclass() {
    return this.content.some(
      (node) => node instanceof Macro && node.content === "documentclass",
    );
  }
  verifyDocumentclass() {
    const documentclass = this.content.find(
      (node) => node instanceof Macro && node.content === "documentclass",
    ); /*[this,...Array.from(this.dependencies.values()).map(dep=>dep.ast)]
        .find(ast=> ast?.content.find(node=>node instanceof Macro&&node.content==="documentclass"))*/
    if (!documentclass) {
      this.content.unshift(
        new Macro("documentclass", undefined, [
          new Argument("[", "]", [new String("tikz,border=2mm")]),
          new Argument("{", "}", [new String("standalone")]),
        ]),
      );
    }
  }
  toString() {
    return this.content.map((node) => node.toString()).join("");
  }
  addInputFileToPramble(filePath: string, index?: number) {
    const input = new Macro("input", undefined, [
      new Argument("{", "}", [new String(filePath)]),
    ]);
    if (index) {
      this.content.splice(index, 0, input);
      return;
    }
    const startIndex = this.content.findIndex(
      (node) =>
        !(
          node.isMacro() &&
          (node.content === "documentclass" || node.content === "input")
        ),
    );
    if (startIndex === -1) {
      this.content.push(input);
      return;
    }
    this.content.splice(startIndex, 0, input);
  }
  addDependency(dpendency: LatexDependency) {
    const name = dpendency.basename + "." + dpendency.extension;
    if (!this.isInputFile(name)) {
      throw new Error("File not found in input files");
    }
    this.dependencies.set(name, dpendency);
  }
  cleanUp() {
    claenUpPaths(this.content);
  }
  removeAllWhitespace() { }
  /**
   * In latex empty lines can cause errors
   * This methd remove all empty lines from the document.
   */
  removeEmptyLines() { }
  usdPackages() { }
  usdLibraries() { }
  usdInputFiles() {
    return findUsdInputFiles(this.content);
  }
  getInputFilesPaths() {
    return this.usdInputFiles().map((input) => {
      const args = input.args;
      if (!args || args.length !== 1)
        throw new Error("Unexpected input file format");
      return args[0].content
        .map((node) => node.toString())
        .filter(Boolean)
        .join("")
        .trim();
    });
  }
  isInputFile(filePath: string) {
    return this.getInputFilesPaths().some((path) => filePath === path.trim());
  }
  usdCommands() { }
  usdEnvironments() { }
  clone() {
    return new LatexAbstractSyntaxTree(
      this.content.map((node) => node.clone()),
      cloneMap(this.dependencies),
    );
  }
}

function cloneMap<T, V>(map: Map<T, V>): Map<T, V> {
  const newMap = new Map<T, V>();
  for (const [key, value] of map.entries()) {
    newMap.set(key, value);
  }
  return newMap;
}

//a

//a Macro is in esins in emplmntsin of a newCommand

class DefineMacro {
  //type
}
const texExtensions = [
  "latex",
  "tex",
  "sty",
  "cls",
  "texlive",
  "texmf",
  "texmf",
  "cnf",
];
export function isExtensionTex(extension: string) {
  return extension
    .split(".")
    .some((ext) => texExtensions.includes(ext.toLowerCase()));
}



export function createDpendency(
  source: string,
  path: string,
  config: { isTex?: boolean; ast?: LatexAbstractSyntaxTree; autoUse?: boolean; } = {}
): LatexDependency {
  let { isTex, ast, autoUse } = config;
  const {basename, extension} = extractBasenameAndExtension(path);
  isTex = isTex || isExtensionTex(extension);
  if (isTex && !ast) ast = LatexAbstractSyntaxTree.parse(source);
  return { content: source, ast, isTex, path, basename, extension, autoUse };
}




function findUsdInputFiles(ast: Ast): Macro[] {
  const inputMacros: Macro[] = [];
  if (ast instanceof Macro && ast.content === "input") inputMacros.push(ast);
  if (Array.isArray(ast)) {
    inputMacros.push(...ast.map(findUsdInputFiles).flat());
  }
  if ("content" in ast && ast.content && Array.isArray(ast.content)) {
    inputMacros.push(...ast.content.map(findUsdInputFiles).flat());
  }
  if ("args" in ast && ast.args) {
    inputMacros.push(...ast.args.map(findUsdInputFiles).flat());
  }
  return inputMacros;
}
