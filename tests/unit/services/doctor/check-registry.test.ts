/**
 * Unit tests for CheckRegistry
 *
 * Tests check registration, lookup, and management functionality with
 * comprehensive validation of registry operations and error handling.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckRegistry } from "../../../../src/services/doctor/check-registry.js";
import type { CheckStage, ICheck } from "../../../../src/services/doctor/types.js";

/**
 * Mock check implementation for testing
 */
class MockCheck implements ICheck {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly stage: CheckStage,
  ) {}

  execute(): Promise<any> {
    return Promise.resolve({
      status: "pass" as const,
      message: `Mock check ${this.id} executed successfully`,
    });
  }
}

describe("CheckRegistry", () => {
  let registry: CheckRegistry;

  beforeEach(() => {
    registry = new CheckRegistry();
  });

  describe("constructor", () => {
    it("should initialize with empty registry", () => {
      expect(registry.getCheckCount()).toBe(0);
      expect(registry.getAllCheckIds()).toEqual([]);
    });

    it("should initialize stage maps correctly", () => {
      const stages: CheckStage[] = [
        "environment",
        "configuration",
        "authentication",
        "connectivity",
      ];

      for (const stage of stages) {
        expect(registry.getChecksForStage(stage)).toEqual([]);
      }
    });
  });

  describe("register", () => {
    it("should register a valid check successfully", () => {
      const check = new MockCheck("test-check", "Test Check", "A test check", "environment");

      registry.register(check);

      expect(registry.getCheckCount()).toBe(1);
      expect(registry.getAllCheckIds()).toContain("test-check");
      expect(registry.getCheck("test-check")).toBe(check);
    });

    it("should add check to correct stage", () => {
      const environmentCheck = new MockCheck(
        "env-check",
        "Environment Check",
        "Test env",
        "environment",
      );
      const configCheck = new MockCheck(
        "config-check",
        "Config Check",
        "Test config",
        "configuration",
      );

      registry.register(environmentCheck);
      registry.register(configCheck);

      expect(registry.getChecksForStage("environment")).toContain(environmentCheck);
      expect(registry.getChecksForStage("configuration")).toContain(configCheck);
      expect(registry.getChecksForStage("environment")).not.toContain(configCheck);
    });

    it("should maintain registration order", () => {
      const check1 = new MockCheck("check-1", "Check 1", "First check", "environment");
      const check2 = new MockCheck("check-2", "Check 2", "Second check", "environment");
      const check3 = new MockCheck("check-3", "Check 3", "Third check", "environment");

      registry.register(check1);
      registry.register(check2);
      registry.register(check3);

      const stageChecks = registry.getChecksForStage("environment");
      expect(stageChecks[0]).toBe(check1);
      expect(stageChecks[1]).toBe(check2);
      expect(stageChecks[2]).toBe(check3);
    });

    it("should throw error for duplicate check ID", () => {
      const check1 = new MockCheck("duplicate-id", "Check 1", "First check", "environment");
      const check2 = new MockCheck("duplicate-id", "Check 2", "Second check", "configuration");

      registry.register(check1);

      expect(() => registry.register(check2)).toThrow(
        "Check with ID 'duplicate-id' is already registered",
      );
    });

    it("should throw error for invalid check ID", () => {
      const invalidChecks = [
        {
          id: "",
          name: "Valid Name",
          description: "Valid Description",
          stage: "environment" as CheckStage,
        },
        {
          id: undefined as any,
          name: "Valid Name",
          description: "Valid Description",
          stage: "environment" as CheckStage,
        },
        {
          id: undefined as any,
          name: "Valid Name",
          description: "Valid Description",
          stage: "environment" as CheckStage,
        },
        {
          id: 123 as any,
          name: "Valid Name",
          description: "Valid Description",
          stage: "environment" as CheckStage,
        },
      ];

      for (const checkData of invalidChecks) {
        const check = checkData as any;
        expect(() => registry.register(check)).toThrow("Check must have a valid string ID");
      }
    });

    it("should throw error for invalid check name", () => {
      const invalidChecks = [
        {
          id: "valid-id",
          name: "",
          description: "Valid Description",
          stage: "environment" as CheckStage,
        },
        {
          id: "valid-id",
          name: undefined as any,
          description: "Valid Description",
          stage: "environment" as CheckStage,
        },
        {
          id: "valid-id",
          name: undefined as any,
          description: "Valid Description",
          stage: "environment" as CheckStage,
        },
      ];

      for (const checkData of invalidChecks) {
        const check = checkData as any;
        expect(() => registry.register(check)).toThrow("Check must have a valid string name");
      }
    });

    it("should throw error for invalid check description", () => {
      const invalidChecks = [
        { id: "valid-id", name: "Valid Name", description: "", stage: "environment" as CheckStage },
        {
          id: "valid-id",
          name: "Valid Name",
          description: undefined as any,
          stage: "environment" as CheckStage,
        },
        {
          id: "valid-id",
          name: "Valid Name",
          description: undefined as any,
          stage: "environment" as CheckStage,
        },
      ];

      for (const checkData of invalidChecks) {
        const check = checkData as any;
        expect(() => registry.register(check)).toThrow(
          "Check must have a valid string description",
        );
      }
    });

    it("should throw error for invalid stage", () => {
      const invalidStages = ["invalid-stage", "", undefined, undefined, 123];

      for (const stage of invalidStages) {
        const check = {
          id: "valid-id",
          name: "Valid Name",
          description: "Valid Description",
          stage: stage as any,
          execute: vi.fn(),
        };

        expect(() => registry.register(check)).toThrow(`Invalid check stage: ${stage}`);
      }
    });

    it("should throw error for missing execute method", () => {
      const checkWithoutExecute = {
        id: "valid-id",
        name: "Valid Name",
        description: "Valid Description",
        stage: "environment" as CheckStage,
      };

      expect(() => registry.register(checkWithoutExecute as any)).toThrow(
        "Check must implement execute method",
      );
    });

    it("should throw error for non-function execute method", () => {
      const checkWithInvalidExecute = {
        id: "valid-id",
        name: "Valid Name",
        description: "Valid Description",
        stage: "environment" as CheckStage,
        execute: "not-a-function" as any,
      };

      expect(() => registry.register(checkWithInvalidExecute)).toThrow(
        "Check must implement execute method",
      );
    });
  });

  describe("getChecksForStage", () => {
    beforeEach(() => {
      const checks = [
        new MockCheck("env-1", "Env Check 1", "Environment check 1", "environment"),
        new MockCheck("env-2", "Env Check 2", "Environment check 2", "environment"),
        new MockCheck("config-1", "Config Check 1", "Configuration check 1", "configuration"),
        new MockCheck("auth-1", "Auth Check 1", "Authentication check 1", "authentication"),
        new MockCheck("conn-1", "Conn Check 1", "Connectivity check 1", "connectivity"),
      ];

      for (const check of checks) {
        registry.register(check);
      }
    });

    it("should return checks for specified stage", () => {
      const environmentChecks = registry.getChecksForStage("environment");
      expect(environmentChecks).toHaveLength(2);
      expect(environmentChecks.map((c) => c.id)).toEqual(["env-1", "env-2"]);
    });

    it("should return empty array for stage with no checks", () => {
      const emptyRegistry = new CheckRegistry();
      expect(emptyRegistry.getChecksForStage("environment")).toEqual([]);
    });

    it("should return readonly array", () => {
      const environmentChecks = registry.getChecksForStage("environment");
      expect(Array.isArray(environmentChecks)).toBe(true);

      // Verify it's a copy (mutations don't affect registry)
      const originalLength = environmentChecks.length;
      environmentChecks.push(new MockCheck("new-check", "New Check", "Added check", "environment"));

      expect(registry.getChecksForStage("environment")).toHaveLength(originalLength);
    });

    it("should handle all valid stages", () => {
      const stages: CheckStage[] = [
        "environment",
        "configuration",
        "authentication",
        "connectivity",
      ];

      for (const stage of stages) {
        const checks = registry.getChecksForStage(stage);
        expect(Array.isArray(checks)).toBe(true);
      }
    });
  });

  describe("getCheck", () => {
    beforeEach(() => {
      const checks = [
        new MockCheck("check-1", "Check 1", "First check", "environment"),
        new MockCheck("check-2", "Check 2", "Second check", "configuration"),
      ];

      for (const check of checks) {
        registry.register(check);
      }
    });

    it("should return check by ID", () => {
      const check = registry.getCheck("check-1");
      expect(check).toBeDefined();
      expect(check!.id).toBe("check-1");
      expect(check!.name).toBe("Check 1");
    });

    it("should return undefined for non-existent check", () => {
      expect(registry.getCheck("non-existent")).toBeUndefined();
    });

    it("should be case-sensitive", () => {
      expect(registry.getCheck("CHECK-1")).toBeUndefined();
      expect(registry.getCheck("check-1")).toBeDefined();
    });
  });

  describe("getAllCheckIds", () => {
    it("should return empty array for empty registry", () => {
      expect(registry.getAllCheckIds()).toEqual([]);
    });

    it("should return all check IDs in registration order", () => {
      const checks = [
        new MockCheck("third", "Third Check", "Third", "environment"),
        new MockCheck("first", "First Check", "First", "configuration"),
        new MockCheck("second", "Second Check", "Second", "authentication"),
      ];

      for (const check of checks) {
        registry.register(check);
      }

      expect(registry.getAllCheckIds()).toEqual(["third", "first", "second"]);
    });

    it("should return readonly array", () => {
      const check = new MockCheck("test", "Test", "Test", "environment");
      registry.register(check);

      const ids = registry.getAllCheckIds();
      const originalLength = ids.length;
      ids.push("new-id");

      expect(registry.getAllCheckIds()).toHaveLength(originalLength);
    });
  });

  describe("getCheckCount", () => {
    it("should return 0 for empty registry", () => {
      expect(registry.getCheckCount()).toBe(0);
    });

    it("should return correct count after registrations", () => {
      expect(registry.getCheckCount()).toBe(0);

      registry.register(new MockCheck("check-1", "Check 1", "First", "environment"));
      expect(registry.getCheckCount()).toBe(1);

      registry.register(new MockCheck("check-2", "Check 2", "Second", "configuration"));
      expect(registry.getCheckCount()).toBe(2);

      registry.register(new MockCheck("check-3", "Check 3", "Third", "authentication"));
      expect(registry.getCheckCount()).toBe(3);
    });
  });

  describe("getStageDistribution", () => {
    it("should return zero counts for empty registry", () => {
      const distribution = registry.getStageDistribution();

      expect(distribution.get("environment")).toBe(0);
      expect(distribution.get("configuration")).toBe(0);
      expect(distribution.get("authentication")).toBe(0);
      expect(distribution.get("connectivity")).toBe(0);
    });

    it("should return correct distribution", () => {
      const checks = [
        new MockCheck("env-1", "Env 1", "Environment 1", "environment"),
        new MockCheck("env-2", "Env 2", "Environment 2", "environment"),
        new MockCheck("config-1", "Config 1", "Configuration 1", "configuration"),
        new MockCheck("auth-1", "Auth 1", "Authentication 1", "authentication"),
        new MockCheck("auth-2", "Auth 2", "Authentication 2", "authentication"),
        new MockCheck("auth-3", "Auth 3", "Authentication 3", "authentication"),
      ];

      for (const check of checks) {
        registry.register(check);
      }

      const distribution = registry.getStageDistribution();
      expect(distribution.get("environment")).toBe(2);
      expect(distribution.get("configuration")).toBe(1);
      expect(distribution.get("authentication")).toBe(3);
      expect(distribution.get("connectivity")).toBe(0);
    });
  });

  describe("clear", () => {
    beforeEach(() => {
      const checks = [
        new MockCheck("check-1", "Check 1", "First", "environment"),
        new MockCheck("check-2", "Check 2", "Second", "configuration"),
        new MockCheck("check-3", "Check 3", "Third", "authentication"),
      ];

      for (const check of checks) {
        registry.register(check);
      }
    });

    it("should clear all registered checks", () => {
      expect(registry.getCheckCount()).toBe(3);

      registry.clear();

      expect(registry.getCheckCount()).toBe(0);
      expect(registry.getAllCheckIds()).toEqual([]);
    });

    it("should clear all stage mappings", () => {
      registry.clear();

      const stages: CheckStage[] = [
        "environment",
        "configuration",
        "authentication",
        "connectivity",
      ];
      for (const stage of stages) {
        expect(registry.getChecksForStage(stage)).toEqual([]);
      }
    });

    it("should allow re-registration after clear", () => {
      registry.clear();

      const newCheck = new MockCheck("new-check", "New Check", "New", "environment");
      registry.register(newCheck);

      expect(registry.getCheckCount()).toBe(1);
      expect(registry.getCheck("new-check")).toBe(newCheck);
    });

    it("should reset stage distribution", () => {
      registry.clear();

      const distribution = registry.getStageDistribution();
      expect(distribution.get("environment")).toBe(0);
      expect(distribution.get("configuration")).toBe(0);
      expect(distribution.get("authentication")).toBe(0);
      expect(distribution.get("connectivity")).toBe(0);
    });
  });
});
