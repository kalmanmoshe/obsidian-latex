import * as Ast from "@unified-latex/unified-latex-types";
type PluginOptions = {
    /**
     * Whether or not to fix the lint
     *
     * @type {boolean}
     */
    fix?: boolean;
} | undefined;
export declare const DESCRIPTION: string;
export declare const unifiedLatexLintNoTexFontShapingCommands: import('unified').Plugin<void[] | [PluginOptions | [boolean | import('unified-lint-rule/lib').Label | import('unified-lint-rule/lib').Severity, PluginOptions?]], Ast.Root, Ast.Root>;
export {};
//# sourceMappingURL=index.d.ts.map