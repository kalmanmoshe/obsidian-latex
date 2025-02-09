import * as Ast from "@unified-latex/unified-latex-types";
type PluginOptions = {
    preferredStyle: "tex" | "latex";
} | undefined;
export declare const DESCRIPTION = "## Lint Rule\n\nAvoid mixing TeX-style inline math `$...$` with LaTeX-style `\\(...\\)` inline math.\n";
export declare const unifiedLatexLintConsistentInlineMath: import('unified').Plugin<void[] | [PluginOptions | [boolean | import('unified-lint-rule/lib').Label | import('unified-lint-rule/lib').Severity, PluginOptions?]], Ast.Root, Ast.Root>;
export {};
//# sourceMappingURL=index.d.ts.map