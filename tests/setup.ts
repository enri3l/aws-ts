/**
 * Global test setup configuration for unit and integration tests
 *
 * This file configures the testing environment with common utilities,
 * mock setup, and global test configuration that applies to all test types.
 *
 */

import { beforeEach } from "vitest";

/**
 * Global test setup that runs before each test
 *
 * Ensures clean test environment and consistent test isolation
 * across all test suites.
 */
beforeEach(() => {
  // Reset environment variables to clean state
  delete process.env.AWS_REGION;
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;

  // Set default test environment
  process.env.NODE_ENV = "test";
});
