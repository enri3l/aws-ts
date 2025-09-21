/**
 * Global test setup configuration for unit and integration tests
 *
 * This file configures the testing environment with common utilities,
 * mock setup, and global test configuration that applies to all test types.
 *
 */

import * as awsSdkClientMockVitest from "aws-sdk-client-mock-vitest";
import { beforeEach, expect } from "vitest";

// Extend Vitest expect with AWS SDK client mock matchers
expect.extend(awsSdkClientMockVitest.allCustomMatcher);

/**
 * Global test setup that runs before each test
 *
 * Ensures clean test environment and consistent test isolation
 * across all test suites.
 */
beforeEach(() => {
  // Reset AWS environment variables to clean state
  delete process.env.AWS_REGION;
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
  delete process.env.AWS_CONFIG_FILE;
  delete process.env.AWS_SHARED_CREDENTIALS_FILE;
  delete process.env.AWS_DEFAULT_REGION;
  delete process.env.AWS_DEFAULT_PROFILE;

  // Set default test environment
  process.env.NODE_ENV = "test";
});
