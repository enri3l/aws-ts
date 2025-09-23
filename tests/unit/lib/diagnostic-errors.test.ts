/**
 * Unit tests for diagnostic error system
 *
 * Tests the structured error types for doctor command system with
 * diagnostic-specific error handling and user guidance.
 */

import { describe, expect, it } from "vitest";
import {
  AutoRepairError,
  CheckExecutionError,
  CheckRegistryError,
  DiagnosticError,
  getDiagnosticErrorGuidance,
} from "../../../src/lib/diagnostic-errors.js";
import type { CheckStage, CheckStatus } from "../../../src/services/doctor/types.js";

describe("Diagnostic Error System", () => {
  describe("DiagnosticError", () => {
    it("should create diagnostic error with minimal parameters", () => {
      const error = new DiagnosticError("Diagnostic check failed");

      expect(error.message).toBe("Diagnostic check failed");
      expect(error.code).toBe("DIAGNOSTIC_ERROR");
      expect(error.metadata.checkId).toBeUndefined();
      expect(error.metadata.stage).toBeUndefined();
      expect(error.metadata.severity).toBeUndefined();
    });

    it("should create diagnostic error with all parameters", () => {
      const error = new DiagnosticError(
        "Environment check failed",
        "env-check-001",
        "validation" as CheckStage,
        "error" as CheckStatus,
        { environment: "production" },
      );

      expect(error.message).toBe("Environment check failed");
      expect(error.code).toBe("DIAGNOSTIC_ERROR");
      expect(error.metadata.checkId).toBe("env-check-001");
      expect(error.metadata.stage).toBe("validation");
      expect(error.metadata.severity).toBe("error");
      expect(error.metadata.environment).toBe("production");
    });

    it("should extend BaseError correctly", () => {
      const error = new DiagnosticError("Test diagnostic error");

      expect(error instanceof DiagnosticError).toBe(true);
      expect(error.name).toBe("DiagnosticError");
    });
  });

  describe("CheckExecutionError", () => {
    it("should create check execution error with minimal parameters", () => {
      const error = new CheckExecutionError("Check execution failed");

      expect(error.message).toBe("Check execution failed");
      expect(error.code).toBe("CHECK_EXECUTION_ERROR");
      expect(error.metadata.checkId).toBeUndefined();
    });

    it("should create check execution error with all parameters", () => {
      const error = new CheckExecutionError(
        "AWS CLI check failed",
        "aws-cli-check",
        "validation" as CheckStage,
        new Error("Command not found"),
        { command: "aws --version" },
      );

      expect(error.message).toBe("AWS CLI check failed");
      expect(error.metadata.checkId).toBe("aws-cli-check");
      expect(error.metadata.stage).toBe("validation");
      expect(error.metadata.underlyingError).toBeInstanceOf(Error);
      expect(error.metadata.command).toBe("aws --version");
    });
  });

  describe("AutoRepairError", () => {
    it("should create auto repair error with minimal parameters", () => {
      const error = new AutoRepairError("Auto repair failed");

      expect(error.message).toBe("Auto repair failed");
      expect(error.code).toBe("AUTO_REPAIR_ERROR");
      expect(error.metadata.repairId).toBeUndefined();
    });

    it("should create auto repair error with all parameters", () => {
      const error = new AutoRepairError(
        "SSO token refresh failed",
        "sso-token-refresh",
        "aws-cli-check",
        "/backup/path",
        { profile: "dev-profile", timeout: 30_000 },
      );

      expect(error.message).toBe("SSO token refresh failed");
      expect(error.metadata.operation).toBe("sso-token-refresh");
      expect(error.metadata.checkId).toBe("aws-cli-check");
      expect(error.metadata.backupPath).toBe("/backup/path");
      expect(error.metadata.profile).toBe("dev-profile");
      expect(error.metadata.timeout).toBe(30_000);
    });
  });

  describe("CheckRegistryError", () => {
    it("should create check registry error with minimal parameters", () => {
      const error = new CheckRegistryError("Registry operation failed");

      expect(error.message).toBe("Registry operation failed");
      expect(error.code).toBe("CHECK_REGISTRY_ERROR");
      expect(error.metadata.registryId).toBeUndefined();
    });

    it("should create check registry error with all parameters", () => {
      const error = new CheckRegistryError(
        "Check registration failed",
        "duplicate-check",
        "connectivity-001",
        { category: "network", registry: "main-registry" },
      );

      expect(error.message).toBe("Check registration failed");
      expect(error.metadata.operation).toBe("duplicate-check");
      expect(error.metadata.checkId).toBe("connectivity-001");
      expect(error.metadata.category).toBe("network");
      expect(error.metadata.registry).toBe("main-registry");
    });
  });

  describe("getDiagnosticErrorGuidance", () => {
    it("should provide guidance for DiagnosticError", () => {
      const error = new DiagnosticError(
        "Environment validation failed",
        "env-check",
        "validation" as CheckStage,
        "error" as CheckStatus,
      );

      const guidance = getDiagnosticErrorGuidance(error);
      expect(guidance).toContain("Environment validation failed");
    });

    it("should provide guidance for CheckExecutionError", () => {
      const error = new CheckExecutionError(
        "AWS CLI check failed",
        "aws-cli-check",
        "validation" as CheckStage,
        new Error("Command not found"),
      );

      const guidance = getDiagnosticErrorGuidance(error);
      expect(guidance).toContain("AWS CLI check failed");
    });

    it("should provide guidance for AutoRepairError", () => {
      const error = new AutoRepairError("Token refresh failed", "sso-refresh", "aws-cli-check");

      const guidance = getDiagnosticErrorGuidance(error);
      expect(guidance).toContain("Token refresh failed");
    });

    it("should provide guidance for CheckRegistryError", () => {
      const error = new CheckRegistryError(
        "Check registration failed",
        "duplicate-check",
        "connectivity-001",
      );

      const guidance = getDiagnosticErrorGuidance(error);
      expect(guidance).toContain("Check registration failed");
    });

    it("should provide generic guidance for unknown error types", () => {
      const error = new Error("Unknown error");

      const guidance = getDiagnosticErrorGuidance(error);
      expect(guidance).toContain("Unknown error");
    });
  });

  describe("Error inheritance and type checking", () => {
    it("should work with instanceof checks", () => {
      const diagnosticError = new DiagnosticError("Test");
      const checkError = new CheckExecutionError("Test");
      const repairError = new AutoRepairError("Test");
      const registryError = new CheckRegistryError("Test");

      expect(diagnosticError instanceof DiagnosticError).toBe(true);
      expect(checkError instanceof CheckExecutionError).toBe(true);
      expect(repairError instanceof AutoRepairError).toBe(true);
      expect(registryError instanceof CheckRegistryError).toBe(true);

      // Cross-type checks should be false
      expect(diagnosticError instanceof CheckExecutionError).toBe(false);
      expect(checkError instanceof AutoRepairError).toBe(false);
      expect(repairError instanceof CheckRegistryError).toBe(false);
    });

    it("should maintain error properties through inheritance", () => {
      const error = new CheckExecutionError("Test execution", "test-check", 1000);

      expect(error.message).toBe("Test execution");
      expect(error.code).toBe("CHECK_EXECUTION_ERROR");
      expect(error.name).toBe("CheckExecutionError");
      expect(error.stack).toBeDefined();
    });
  });
});
