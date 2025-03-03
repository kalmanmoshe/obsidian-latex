import * as Ast from "@unified-latex/unified-latex-types";
/**
 * Returns whether there is a parbreak in `nodes` (either a parsed parbreak,
 * or the macro `\par`)
 */
export declare function hasParbreak(nodes: Ast.Node[]): boolean;
/**
 * Is there a parbreak or a macro/environment that acts like a parbreak (e.g. \section{...})
 * in the array?
 */
export declare function hasBreakingNode(nodes: Ast.Node[], options?: {
    macrosThatBreakPars?: string[];
    environmentsThatDontBreakPars?: string[];
}): boolean;
//# sourceMappingURL=has-parbreak.d.ts.map