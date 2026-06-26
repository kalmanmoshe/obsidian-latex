import typescriptEslintParser from "@typescript-eslint/parser";
import typescriptEslintPlugin from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "package.json",
      "manifest.json",
      "versions.json",
      "*.config.mjs",
      "eslint.config.mjs",
    ],
  },

  {
  files: ["**/*.ts"],

  languageOptions: {
    parser: typescriptEslintParser,
    ecmaVersion: "latest",
    sourceType: "module",

    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: import.meta.dirname,
    },

    globals: {
      ...globals.browser,
      ...globals.node,
      console: "readonly",
      app: "readonly",
    },
  },

  plugins: {
    "@typescript-eslint": typescriptEslintPlugin,
    obsidianmd,
  },

  rules: {
    ...obsidianmd.configs.recommended[0].rules,

    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_" },
    ],

    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-empty-function": "off",

    "no-prototype-builtins": "off",
    "quotes": ["warn", "double"],

    // Obsidian plugins often need these:
    "no-undef": "off",
  },
}
];