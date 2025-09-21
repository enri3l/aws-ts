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
      // TSDoc/JSDoc Documentation Rules
      "tsdoc/syntax": "warn",
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
        },
      ],
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-returns-description": "warn",
      "jsdoc/require-throws": "warn",
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
          ],
        },
      ],
      "jsdoc/check-types": "off", // TypeScript handles type checking
      "jsdoc/require-param-type": "off", // TypeScript provides types
      "jsdoc/require-returns-type": "off", // TypeScript provides types
      "jsdoc/no-types": "error", // Prevent redundant type annotations
      "jsdoc/tag-lines": "off", // Allow multiple lines for @remarks
      "jsdoc/newline-after-description": "off", // Allow @remarks after description
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
  },

  // Test-specific configuration
  {
    files: ["**/*.test.ts", "**/tests/**/*.ts"],
    rules: {
      // Relax TypeScript safety rules for test files where mocking is common
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/unbound-method": "off",
      // Allow nested functions in tests for better organization
      "sonarjs/no-nested-functions": "off",
      // Relax JSDoc requirements for test files
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-throws": "off",
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
