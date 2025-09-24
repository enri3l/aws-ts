/**
 * Test utilities for doctor check classes
 *
 * Provides common testing patterns and assertions for ICheck implementations
 * to reduce test code duplication and improve maintainability.
 */

import type { expect } from "vitest";
import type { DoctorContext, ICheck } from "../../src/services/doctor/types.js";

/**
 * Expected metadata for a check
 */
export interface CheckMetadata {
  id: string;
  name: string;
  description: string;
  stage: string;
}

/**
 * Test helper to validate check metadata properties
 *
 * Replaces duplicated property testing across all check test files
 *
 * @param check - Check instance to validate
 * @param expected - Expected metadata values
 */
export function testCheckProperties(check: ICheck, expected: CheckMetadata): void {
  expect(check.id).toBe(expected.id);
  expect(check.name).toBe(expected.name);
  expect(check.description).toBe(expected.description);
  expect(check.stage).toBe(expected.stage);
}

/**
 * Create default test context for doctor checks
 *
 * @param overrides - Optional context overrides
 * @returns Standard test context
 */
export function createTestContext(overrides: Partial<DoctorContext> = {}): DoctorContext {
  return {
    profile: "test-profile",
    detailed: false,
    ...overrides,
  };
}
