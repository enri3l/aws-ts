// eslint.config.mjs
import eslint from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import sonarjs from "eslint-plugin-sonarjs";
import tsdoc from "eslint-plugin-tsdoc";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/cc-sessions/**",
      "**/.claude/**",
      "**/docs/.vitepress/cache/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      unicorn.configs["flat/recommended"],
      sonarjs.configs.recommended,
      jsdoc.configs["flat/recommended-typescript"],
    ],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      tsdoc,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      // Allow underscore-prefixed unused parameters (common pattern for intentionally unused parameters)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // TSDoc/JSDoc Documentation Rules
      "tsdoc/syntax": "error", // Enforce TSDoc syntax compliance
      "jsdoc/require-jsdoc": [
        "error", // Enforce JSDoc/TSDoc on public APIs
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
          contexts: [
            "TSModuleDeclaration", // Require @module tags on module declarations
          ],
        },
      ],
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns-description": "error",
      "jsdoc/require-throws": "error",
      "jsdoc/check-tag-names": [
        "error",
        {
          definedTags: [
            "remarks",
            "example",
            "see",
            "since",
            "internal",
            "public",
            "beta",
            "deprecated",
            "file",
            "author",
            "private",
            "typeParam",
            "module",
          ],
        },
      ],
      // Disable JSDoc type annotations since TypeScript provides compile-time type checking
      // and eliminates the maintenance burden of keeping JSDoc types in sync with TypeScript types
      "jsdoc/check-types": "off",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",
      "jsdoc/require-throws-type": "off", // Conflicts with TSDoc syntax and creates redundancy with TypeScript error types
      "jsdoc/no-types": "error", // Enforce removal of redundant type annotations that duplicate TypeScript information

      "jsdoc/require-param": "off", // Demands dotted notation that TSDoc syntax checker rejects
      "jsdoc/check-param-names": "off", // Validates dotted parameters that break TSDoc compliance

      // Allow flexible JSDoc formatting to support comprehensive architectural documentation
      "jsdoc/tag-lines": "off", // Permit multi-line @remarks for detailed implementation context
      "jsdoc/newline-after-description": "off", // Allow @remarks immediately after description for better flow

      // Enforce nullish coalescing over logical OR for boolean defaults
      // ?? is more precise than || as it only coalesces null/undefined, not all falsy values
      "no-restricted-syntax": [
        "error",
        {
          selector: "LogicalExpression[operator='||'][right.value=false]",
          message:
            "Use nullish coalescing (?? false) instead of logical OR (|| false) for boolean defaults. The ?? operator only coalesces null/undefined, while || coalesces all falsy values including 0 and empty string.",
        },
      ],
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
  },

  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [eslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: false },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
);
