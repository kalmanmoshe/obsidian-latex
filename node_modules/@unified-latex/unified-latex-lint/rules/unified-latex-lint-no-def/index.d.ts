import * as Ast from "@unified-latex/unified-latex-types";
export declare const DESCRIPTION = "## Lint Rule\n\nAvoid using `\\def\\macro{val}` to define a macro. Use `\\newcommand{\\macro}{val}` or\n`\\NewDocumentCommand{\\macro}{}{val}` from the `xparse` package.\n\n### See\n\nCTAN l2tabuen Section 1.7\n";
export declare const unifiedLatexLintNoDef: import('unified').Plugin<void[] | [[boolean | import('unified-lint-rule/lib').Label | import('unified-lint-rule/lib').Severity, undefined?] | undefined], Ast.Root, Ast.Root>;
//# sourceMappingURL=index.d.ts.map