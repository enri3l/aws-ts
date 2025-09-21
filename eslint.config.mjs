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
      // Disable JSDoc type annotations since TypeScript provides superior compile-time type checking
      // and eliminates the maintenance burden of keeping JSDoc types in sync with TypeScript types
      "jsdoc/check-types": "off",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",
      "jsdoc/require-throws-type": "off", // Conflicts with TSDoc syntax and creates redundancy with TypeScript error types
      "jsdoc/no-types": "error", // Enforce removal of redundant type annotations that duplicate TypeScript information

      // Allow flexible JSDoc formatting to support comprehensive architectural documentation
      "jsdoc/tag-lines": "off", // Permit multi-line @remarks for detailed implementation context
      "jsdoc/newline-after-description": "off", // Allow @remarks immediately after description for better flow
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
  },

  // Test-specific configuration: Relaxed rules for testing environments
  {
    files: ["**/*.test.ts", "**/tests/**/*.ts"],
    rules: {
      // TypeScript safety rules relaxed for test files where mocking frameworks require dynamic typing
      // and test utilities often need to access internal implementation details for verification
      "@typescript-eslint/no-unsafe-assignment": "off", // Mock objects and test fixtures require flexible assignment
      "@typescript-eslint/no-unsafe-member-access": "off", // Testing internal state and private methods
      "@typescript-eslint/no-unsafe-call": "off", // Dynamic mock method invocation
      "@typescript-eslint/no-unsafe-return": "off", // Test helpers returning mock data structures
      "@typescript-eslint/no-unsafe-argument": "off", // Passing test data that may not match exact types
      "@typescript-eslint/no-explicit-any": "off", // Test utilities legitimately need 'any' for maximum flexibility
      "@typescript-eslint/unbound-method": "off", // Jest mocks and spies often unbind methods from their context

      // Code organization rules adapted for test file patterns
      "sonarjs/no-nested-functions": "off", // Test suites benefit from nested describe/it blocks and helper functions

      // Documentation requirements relaxed for test files since test names should be self-documenting
      // and test implementation details don't require the same API documentation standards
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
