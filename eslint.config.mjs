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
      "**/*.config.mjs",
    ],
  },
  {
    files: ["src/**/*.ts"],

    languageOptions: {
      parser: typescriptEslintParser,

      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },

      ecmaVersion: "latest",
      sourceType: "module",

      globals: {
        ...globals.browser,
        ...globals.node,
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
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-function": "off",

      "no-prototype-builtins": "off",
      "no-undef": "off",
      quotes: "off",
    },
  },
];