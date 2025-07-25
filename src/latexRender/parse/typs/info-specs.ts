import * as Ast from "./ast-types-post";

export type ArgumentParser = (
  nodes: Ast.Node[],
  startPos: number,
) => { args: Ast.Argument[]; nodesRemoved: number };

export type EnvRenderInfo = {
  /**
   * Whether the body of the environment should be treated as math mode
   *
   * @type {boolean}
   */
  inMathMode?: boolean;
  /**
   * Whether to align the environment contents based on `&` and `\\` delimiters
   * (like a matrix or tabular environment).
   *
   * @type {boolean}
   */
  alignContent?: boolean;
  /**
   * Whether the arguments should be treated as pgfkeys-type arguments.
   *
   * @type {boolean}
   */
  pgfkeysArgs?: boolean;
  /**
   * A list of names to be given to each argument when processing. This list should
   * be the same length as the number of arguments. `null` can appear any number of times
   * for "un-named" arguments.
   *
   * This allows a consistent reference to macro arguments even if the macro signatures are redefined between
   * packages.
   *
   * @type {((string|null)[])}
   */
  namedArguments?: (string | null)[];
  /**
   * Whether the body is tikz-environment like (e.g., a `tikzpicture` or `scope`, etc.)
   *
   * @type {boolean}
   */
  tikzEnvironment?: boolean;
};
export type EnvInfo = {
  renderInfo?: EnvRenderInfo;
  /**
   * Function to process the body of an environment. The return value of `processContent`
   * is treated as the new body.
   *
   */
  processContent?: (ast: Ast.Node[]) => Ast.Node[];
  /**
   * The environment signature as an xparse argument specification string.
   *
   * @type {string}
   */
  signature?: string;
};

export type MacroRenderInfo = {
  /**
   * Whether the macro's contents wraps along with the current
   * paragraph or displays as it's own block.
   *
   * @type {boolean}
   */
  inParMode?: boolean;
  /**
   * Whether the arguments should be processed as pgfkeys-type arguments.
   *
   * @type {boolean}
   */
  pgfkeysArgs?: boolean;
  /**
   * Whether there should be line breaks after the macro
   * (e.g., like the `\\` command.)
   *
   * @type {boolean}
   */
  breakAfter?: boolean;
  /**
   * Whether there should be line breaks before and after the macro
   * (e.g., like the `\section{...}` command.)
   *
   * @type {boolean}
   */
  breakAround?: boolean;
  /**
   * Whether there should be line breaks before the macro.
   *
   * @type {boolean}
   */
  breakBefore?: boolean;
  /**
   * Whether the contents of the macro should be assumed to be in math mode.
   *
   * @type {boolean}
   */
  inMathMode?: boolean;
  /**
   * Whether the arguments should be rendered with a hanging indent when the wrap
   * (like the arguments to \item in an enumerate environment.)
   *
   * @type {boolean}
   */
  hangingIndent?: boolean;
  /**
   * A list of names to be given to each argument when processing. This list should
   * be the same length as the number of arguments. `null` can appear any number of times
   * for "un-named" arguments.
   *
   * This allows a consistent reference to macro arguments even if the macro signatures are redefined between
   * packages.
   *
   * @type {((string|null)[])}
   */
  namedArguments?: (string | null)[];
  /**
   * Whether the macro represents a tikz path command (e.g. `\draw (0,0) -- (1,1);`).
   *
   * @type {boolean}
   */
  tikzPathCommand?: boolean;
  /**
   * If `\sysdelims` is present, this contains the global information about the delimiters.
   */
  sysdelims?: (Ast.Node[] | null)[];
};
export type MacroInfo = {
  renderInfo?: MacroRenderInfo
  /**
   * The macro signature as an xparse argument specification string.
   *
   * @type {string}
   */
  signature?: string;
  /**
   * Some special macros like `^` and `_` don't use
   * an escape token. When matching against these macros,
   * care must be taken to match the macro contents and the macro's
   * escape token.
   */
  escapeToken?: string;
  /**
   * Custom argument parser. If present, function overrides the default argument
   * parsing of `signature`. An array of nodes is passed as well as the position
   * of the first node **after** the macro. This function is expected to _mutate_
   * the input array, removing any nodes that are part of the macro's argument.
   *
   * This function will only be called on a macro if it has no existing `args`.
   *
   * Note: for stability when printing/accessing a node's arguments, this function
   * should always return an argument array of the same length, regardless of
   * whether optional arguments are present. For example, if this function parses
   * a node with signature `o m`, it should ways return a length-two array of arguments.
   * A "blank" argument (one that does not show up during printing) can be created
   * with `args([], { openMark: "", closeMark: "" })`, using the `unified-latex-builder` package.
   */
  argumentParser?: ArgumentParser;
};

export type RenderInfo = (MacroRenderInfo | EnvRenderInfo) & {
  defaultArg?: string;
  escapeToken?: string;
} & Record<string, unknown>;
export type EnvInfoRecord = Record<string, EnvInfo>;
export type MacroInfoRecord = Record<string, MacroInfo>;
