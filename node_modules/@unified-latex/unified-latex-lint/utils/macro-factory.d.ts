import * as Ast from "@unified-latex/unified-latex-types";
/**
 * Factory function that returns a wrapper which wraps the passed in `content`
 * as an arg to a macro named `macroName`.
 *
 * E.g.
 * ```
 * f = singleArgumentMacroFactory("foo");
 *
 * // Gives "\\foo{bar}"
 * printRaw(f("bar"));
 * ```
 */
export declare function singleArgMacroFactory(macroName: string): (content: Ast.Node | Ast.Node[]) => Ast.Macro;
//# sourceMappingURL=macro-factory.d.ts.map