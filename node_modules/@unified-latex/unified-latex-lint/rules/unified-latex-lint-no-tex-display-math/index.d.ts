import * as Ast from "@unified-latex/unified-latex-types";
export declare const DESCRIPTION = "## Lint Rule\n\nAvoid using TeX display math command `$$...$$`. Instead prefer `\\[...\\] `.\n\nWhen printing processed latex, `$$...$$` is automatically replaced with `\\[...\\] `.\n\n### See\n\nCTAN l2tabuen Section 1.7";
export declare const unifiedLatexLintNoTexDisplayMath: import('unified').Plugin<void[] | [[boolean | import('unified-lint-rule/lib').Label | import('unified-lint-rule/lib').Severity, undefined?] | undefined], Ast.Root, Ast.Root>;
//# sourceMappingURL=index.d.ts.map