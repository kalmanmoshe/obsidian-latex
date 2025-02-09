import * as Ast from "@unified-latex/unified-latex-types";
type PluginOptions = {
    fix?: boolean;
} | undefined;
export declare const DESCRIPTION = "## Lint Rule\n\nAvoid using TeX-style `\\parskip=1em` length assignments and instead\nuse LaTeX-style `\\setlength{\\parskip}{1em}`.\n\n### See\n\nCTAN l2tabuen Section 1.5\n";
export declare const unifiedLatexLintPreferSetlength: import('unified').Plugin<void[] | [PluginOptions | [boolean | import('unified-lint-rule/lib').Label | import('unified-lint-rule/lib').Severity, PluginOptions?]], Ast.Root, Ast.Root>;
export {};
//# sourceMappingURL=index.d.ts.map