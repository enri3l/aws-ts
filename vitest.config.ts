/**
 * Vitest multi-project configuration for comprehensive testing
 *
 * Uses the modern 'projects' format to organize unit, integration, and E2E tests
 * with appropriate setup files and configurations for each test type.
 *
 */

import { defineConfig } from "vitest/config";
import { detectContainerRuntime } from "./tests/lib/runtime-detector.js";

export default defineConfig({
  test: {
    // Global test configuration
    globals: true,
    environment: "node",
    disableConsoleIntercept: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,

    // Multi-project configuration using projects format
    projects: [
      // Unit tests project
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup.ts"],
          coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "junit"],
            exclude: [
              "node_modules/",
              "tests/",
              "cc-sessions/",
              "dist/",
              "**/*.d.ts",
              "**/*.config.*",
            ],
            thresholds: {
              lines: 90,
              branches: 85,
              functions: 90,
              statements: 90,
            },
          },
        },
      },

      // Integration tests project
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup.ts", "./tests/integration-setup.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          // Run integration tests sequentially to avoid container conflicts
          pool: "forks",
          poolOptions: {
            forks: {
              singleFork: true,
            },
          },
          // Ensure timeout is applied at all levels
          timeout: 120_000,
          env: {
            AWS_INTEGRATION_TEST: "true",
            // Enable TestContainers reuse for performance
            TESTCONTAINERS_REUSE_ENABLE: "true",
            // Auto-detected container runtime configuration
            ...detectContainerRuntime(),
          },
        },
      },

      // E2E tests project
      {
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup.ts"],
          testTimeout: 180_000,
          hookTimeout: 120_000,
          // Run E2E tests sequentially for stability
          pool: "forks",
          poolOptions: {
            forks: {
              singleFork: true,
            },
          },
          // Ensure timeout is applied at all levels
          timeout: 180_000,
        },
      },
    ],
  },
});
