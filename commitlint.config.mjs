// commitlint.config.mjs
import * as functionRules from "commitlint-plugin-function-rules";

export default {
  plugins: [functionRules],
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "auth",
        "commands",
        "services",
        "doctor",
        "handlers",
        "lib",
        "queries",
        "ci",
        "docs",
        "deps",
        "tests",
        "config",
        "build",
      ],
    ],
    "header-max-length": [2, "always", 72],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "function-rules/subject-empty": [
      2,
      "never",
      (parsed) => {
        const forbiddenWords = [
          "comprehensive",
          "complete",
          "production-ready",
          "significantly",
          "amazing",
          "revolutionary",
          "cutting-edge",
          "state-of-the-art",
          "seamless",
          "robust",
          "powerful",
          "advanced",
          "sophisticated",
          "elegant",
        ];
        const subject = parsed.subject || "";
        const foundWords = forbiddenWords.filter((word) =>
          subject.toLowerCase().includes(word.toLowerCase()),
        );

        if (foundWords.length > 0) {
          return [
            false,
            `Subject contains marketing language: ${foundWords.join(", ")}. ` +
              `Use technical, factual descriptions instead.`,
          ];
        }

        return [true];
      },
    ],
  },
};
