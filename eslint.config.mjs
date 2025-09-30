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
            "author",
            "private",
            "typeParam",
            "module",
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

      // Disable JSDoc dotted parameter rules that conflict with TSDoc standards
      //
      // ARCHITECTURAL DECISION: TSDoc over JSDoc for parameter documentation
      //
      // Problem: JSDoc and TSDoc have incompatible approaches to documenting object parameters:
      //
      // JSDoc approach (traditional):
      //   @param config - Configuration object
      //   @param config.region - AWS region setting
      //   @param config.profile - AWS profile name
      //
      // TSDoc approach (Microsoft standard):
      //   @param config - Configuration object with region and profile properties
      //
      // Conflict: TSDoc parser rejects dotted notation as "invalid parameter names" while
      // JSDoc demands explicit documentation of each object property. This creates an
      // impossible situation where satisfying one standard violates the other.
      //
      // Resolution: Prioritize TSDoc:
      // "TSDoc standard with ESLint enforcement" for TypeScript-native documentation.
      //
      // Trade-off: Less granular parameter documentation in exchange for:
      // - Compliance with Microsoft's official TypeScript documentation standard
      // - Simplified maintenance (no dual documentation standards)
      // - Approach aligned with TypeScript ecosystem direction
      "jsdoc/require-param": "off", // Demands dotted notation that TSDoc syntax checker rejects
      "jsdoc/check-param-names": "off", // Validates dotted parameters that break TSDoc compliance

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
