/**
 * Unit tests for DoctorCommand
 *
 * Tests command interface, flag parsing, diagnostic orchestration, and output formatting
 * using mocked dependencies for isolated command testing scenarios.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import DoctorCommand from "../../../src/commands/doctor.js";
import { ApiError, TimeoutError } from "../../../src/lib/errors.js";
import { AutoRepairService } from "../../../src/services/doctor/auto-repair.js";
import { CheckRegistry } from "../../../src/services/doctor/check-registry.js";
import { DoctorService } from "../../../src/services/doctor/doctor-service.js";
import type { DiagnosticSummary, RepairResult } from "../../../src/services/doctor/types.js";
import {
  createCliTestContext,
  runCommand,
  type CliTestContext,
} from "../../utils/cli-test-utilities.js";

// Mock all service dependencies
vi.mock("../../../src/services/doctor/check-registry.js", () => ({
  CheckRegistry: vi.fn(),
}));

vi.mock("../../../src/services/doctor/doctor-service.js", () => ({
  DoctorService: vi.fn(),
}));

vi.mock("../../../src/services/doctor/auto-repair.js", () => ({
  AutoRepairService: vi.fn(),
}));

// Mock all check implementations
vi.mock("../../../src/services/doctor/checks/environment-checks.js", () => ({
  AwsCliInstallationCheck: vi.fn().mockImplementation(() => ({ id: "aws-cli", name: "AWS CLI" })),
  NodeModulesCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "node-modules", name: "Node Modules" })),
  NodeVersionCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "node-version", name: "Node Version" })),
}));

vi.mock("../../../src/services/doctor/checks/configuration-checks.js", () => ({
  ConfigFileExistsCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "config-file", name: "Config File" })),
  CredentialsFileCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "credentials-file", name: "Credentials File" })),
  ProfileValidationCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "profile-validation", name: "Profile Validation" })),
}));

vi.mock("../../../src/services/doctor/checks/authentication-checks.js", () => ({
  CredentialValidationCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "credential-validation", name: "Credential Validation" })),
  ProfileSwitchCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "profile-switch", name: "Profile Switch" })),
  SsoTokenExpiryCheck: vi.fn().mockImplementation(() => ({ id: "sso-token", name: "SSO Token" })),
}));

vi.mock("../../../src/services/doctor/checks/connectivity-checks.js", () => ({
  RegionAccessibilityCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "region-access", name: "Region Access" })),
  ServiceEndpointCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "service-endpoint", name: "Service Endpoint" })),
  StsCredentialCheck: vi
    .fn()
    .mockImplementation(() => ({ id: "sts-credential", name: "STS Credential" })),
}));

const mockCheckRegistry = {
  register: vi.fn(),
  getChecksForStage: vi.fn(),
  getCheckCount: vi.fn(),
  getAllCheckIds: vi.fn(),
  getStageDistribution: vi.fn(),
  clear: vi.fn(),
};

const mockDoctorService = {
  runDiagnostics: vi.fn(),
  executeStage: vi.fn(),
  createDiagnosticSummary: vi.fn(),
};

const mockAutoRepairService = {
  executeSafeRepairs: vi.fn(),
  executeInteractiveRepairs: vi.fn(),
};

describe("DoctorCommand", () => {
  let cliContext: CliTestContext;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup CLI test context
    cliContext = await createCliTestContext();

    // Setup mock constructors to return mock instances
    vi.mocked(CheckRegistry).mockImplementation(() => mockCheckRegistry as any);
    vi.mocked(DoctorService).mockImplementation(() => mockDoctorService as any);
    vi.mocked(AutoRepairService).mockImplementation(() => mockAutoRepairService as any);

    // Setup default mock responses
    mockCheckRegistry.getChecksForStage.mockReturnValue([]);
    mockDoctorService.runDiagnostics.mockResolvedValue({
      totalChecks: 0,
      passedChecks: 0,
      warningChecks: 0,
      failedChecks: 0,
      overallStatus: "pass",
      executionTime: 0,
      results: new Map(),
    });
    mockDoctorService.executeStage.mockResolvedValue(new Map());
    mockDoctorService.createDiagnosticSummary.mockReturnValue({
      totalChecks: 0,
      passedChecks: 0,
      warningChecks: 0,
      failedChecks: 0,
      overallStatus: "pass",
      executionTime: 0,
      results: new Map(),
    });
    mockAutoRepairService.executeSafeRepairs.mockResolvedValue([]);
    mockAutoRepairService.executeInteractiveRepairs.mockResolvedValue([]);
  });

  describe("flag parsing", () => {
    it("should parse all available flags correctly", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 5,
        passedChecks: 5,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 1000,
        results: new Map(),
      };

      const mockResults = new Map([
        ["test-check", { status: "pass" as const, message: "Test passed" }],
      ]);

      mockDoctorService.executeStage.mockResolvedValue(mockResults);
      mockDoctorService.createDiagnosticSummary.mockReturnValue(mockSummary);

      const { stdout } = await runCommand(
        DoctorCommand,
        [
          "--profile",
          "test-profile",
          "--detailed",
          "--verbose",
          "--json",
          "--category",
          "environment",
        ],
        cliContext,
      );

      expect(stdout).toContain("totalChecks");
      expect(mockDoctorService.executeStage).toHaveBeenCalledWith(
        "environment",
        expect.objectContaining({
          profile: "test-profile",
          detailed: true,
        }),
      );
    });

    it("should handle boolean flags correctly", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 3,
        passedChecks: 2,
        warningChecks: 1,
        failedChecks: 0,
        overallStatus: "warn",
        executionTime: 800,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      await runCommand(DoctorCommand, ["--fix", "--interactive"], cliContext);

      expect(vi.mocked(AutoRepairService)).toHaveBeenCalledWith({
        enableDebugLogging: false,
        dryRun: false,
      });
    });

    it("should validate category flag options", async () => {
      const output = await runCommand(
        DoctorCommand,
        ["--category", "invalid-category"],
        cliContext,
      );

      expect(output.error).toBeDefined();
      expect(output.error?.message).toContain("Expected --category=invalid-category to be one of");
      expect(output.exitCode).toBe(1);
    });
  });

  describe("diagnostic execution", () => {
    it("should run full diagnostics when no category specified", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 12,
        passedChecks: 10,
        warningChecks: 2,
        failedChecks: 0,
        overallStatus: "warn",
        executionTime: 2500,
        results: new Map([
          ["node-version", { status: "pass", message: "Node.js version compatible" }],
          ["config-file", { status: "warn", message: "Config file has issues" }],
        ]),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      const { stdout } = await runCommand(DoctorCommand, [], cliContext);

      expect(mockDoctorService.runDiagnostics).toHaveBeenCalledWith({
        profile: undefined,
        detailed: false,
        interactive: false,
        autoFix: false,
      });

      expect(stdout).toContain("Diagnostic Summary");
      expect(stdout).toContain("Total Checks: 12");
      expect(stdout).toContain("Passed: 10 | Warnings: 2 | Failed: 0");
    });

    it("should run stage-specific diagnostics when category specified", async () => {
      const mockResults = new Map([
        ["node-version", { status: "pass", message: "Node.js version compatible" }],
        ["aws-cli", { status: "pass", message: "AWS CLI installed" }],
      ]);

      const mockSummary: DiagnosticSummary = {
        totalChecks: 2,
        passedChecks: 2,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 500,
        results: mockResults,
      };

      mockDoctorService.executeStage.mockResolvedValue(mockResults);
      mockDoctorService.createDiagnosticSummary.mockReturnValue(mockSummary);

      const { stdout } = await runCommand(DoctorCommand, ["--category", "environment"], cliContext);

      expect(mockDoctorService.executeStage).toHaveBeenCalledWith(
        "environment",
        expect.objectContaining({
          detailed: false,
          interactive: false,
          autoFix: false,
        }),
      );

      expect(mockDoctorService.createDiagnosticSummary).toHaveBeenCalledWith(
        mockResults,
        expect.any(Number),
      );

      expect(stdout).toContain("All Checks Passed");
    });

    it("should include profile in context when specified", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 1,
        passedChecks: 1,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 300,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      await runCommand(DoctorCommand, ["--profile", "production"], cliContext);

      expect(mockDoctorService.runDiagnostics).toHaveBeenCalledWith({
        profile: "production",
        detailed: false,
        interactive: false,
        autoFix: false,
      });
    });
  });

  describe("auto-repair execution", () => {
    beforeEach(() => {
      const mockSummaryWithIssues: DiagnosticSummary = {
        totalChecks: 4,
        passedChecks: 2,
        warningChecks: 1,
        failedChecks: 1,
        overallStatus: "fail",
        executionTime: 1500,
        results: new Map([
          ["node-version", { status: "pass", message: "Node.js OK" }],
          ["config-file", { status: "warn", message: "Config issues" }],
          ["sso-tokens", { status: "fail", message: "Tokens expired" }],
        ]),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummaryWithIssues);
      mockDoctorService.executeStage.mockResolvedValue(mockSummaryWithIssues.results);
      mockDoctorService.createDiagnosticSummary.mockReturnValue(mockSummaryWithIssues);
    });

    it("should execute safe repairs when --fix flag is used", async () => {
      const mockRepairResults: RepairResult[] = [
        {
          success: true,
          message: "Cleared 2 expired SSO tokens",
          operations: [
            "Cleared expired token for profile: dev",
            "Cleared expired token for profile: test",
          ],
        },
        {
          success: true,
          message: "Created 1 missing directory",
          operations: ["Created directory: /home/user/.aws/sso/cache"],
        },
      ];

      mockAutoRepairService.executeSafeRepairs.mockResolvedValue(mockRepairResults);

      const { stdout } = await runCommand(DoctorCommand, ["--fix"], cliContext);

      expect(mockAutoRepairService.executeSafeRepairs).toHaveBeenCalledWith(
        expect.objectContaining({ autoFix: true }),
        expect.any(Map),
      );

      expect(stdout).toContain("Repair Results");
      expect(stdout).toContain("Total Repairs: 2");
      expect(stdout).toContain("Successful: 2 | Failed: 0");
      expect(stdout).toContain("Cleared 2 expired SSO tokens");
    });

    it("should execute interactive repairs when --interactive flag is used", async () => {
      const mockRepairResults: RepairResult[] = [
        {
          success: true,
          message: "Successfully refreshed SSO token for profile: production",
          details: { profile: "production" },
          operations: ["Refreshed SSO token for profile: production"],
        },
      ];

      mockAutoRepairService.executeInteractiveRepairs.mockResolvedValue(mockRepairResults);

      const { stdout } = await runCommand(DoctorCommand, ["--interactive"], cliContext);

      expect(mockAutoRepairService.executeInteractiveRepairs).toHaveBeenCalledWith(
        expect.objectContaining({ interactive: true }),
        expect.any(Map),
      );

      expect(stdout).toContain("Repair Results");
      expect(stdout).toContain("Successfully refreshed SSO token");
    });

    it("should execute both safe and interactive repairs when both flags are used", async () => {
      const safeRepairs: RepairResult[] = [
        { success: true, message: "Safe repair completed", operations: ["Safe operation"] },
      ];

      const interactiveRepairs: RepairResult[] = [
        {
          success: true,
          message: "Interactive repair completed",
          operations: ["Interactive operation"],
        },
      ];

      mockAutoRepairService.executeSafeRepairs.mockResolvedValue(safeRepairs);
      mockAutoRepairService.executeInteractiveRepairs.mockResolvedValue(interactiveRepairs);

      const { stdout } = await runCommand(DoctorCommand, ["--fix", "--interactive"], cliContext);

      expect(mockAutoRepairService.executeSafeRepairs).toHaveBeenCalled();
      expect(mockAutoRepairService.executeInteractiveRepairs).toHaveBeenCalled();
      expect(stdout).toContain("Total Repairs: 2");
    });

    it("should not execute repairs when no issues found", async () => {
      const mockSummaryAllPassed: DiagnosticSummary = {
        totalChecks: 3,
        passedChecks: 3,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 800,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummaryAllPassed);

      const { stdout } = await runCommand(DoctorCommand, ["--fix"], cliContext);

      expect(mockAutoRepairService.executeSafeRepairs).not.toHaveBeenCalled();
      expect(stdout).not.toContain("Repair Results");
    });

    it("should handle repair execution failures gracefully", async () => {
      mockAutoRepairService.executeSafeRepairs.mockRejectedValue(
        new Error("Repair service failed"),
      );

      const { stdout } = await runCommand(DoctorCommand, ["--fix"], cliContext);

      expect(stdout).toContain("Repair execution failed");
      expect(stdout).toContain("Repair service failed");
    });
  });

  describe("output formatting", () => {
    const mockSummary: DiagnosticSummary = {
      totalChecks: 4,
      passedChecks: 2,
      warningChecks: 1,
      failedChecks: 1,
      overallStatus: "fail",
      executionTime: 1200,
      results: new Map([
        [
          "node-version",
          {
            status: "pass",
            message: "Node.js version compatible",
            duration: 50,
          },
        ],
        [
          "config-file",
          {
            status: "warn",
            message: "Config file has issues",
            remediation: "Run aws configure to set up basic configuration",
            duration: 100,
          },
        ],
        [
          "sso-tokens",
          {
            status: "fail",
            message: "SSO tokens expired",
            remediation: "Run aws sso login to refresh tokens",
            duration: 200,
          },
        ],
      ]),
    };

    beforeEach(() => {
      // Mock check registry to return checks for stage output
      mockCheckRegistry.getChecksForStage.mockImplementation((stage) => {
        const mockChecks = [
          { id: "node-version", name: "Node Version", stage: "environment" },
          { id: "config-file", name: "Config File", stage: "configuration" },
          { id: "sso-tokens", name: "SSO Token Status", stage: "authentication" },
        ].filter((check) => check.stage === stage);
        return mockChecks;
      });
    });

    it("should output results in table format by default", async () => {
      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      const { stdout } = await runCommand(DoctorCommand, [], cliContext);

      expect(stdout).toContain("=== Diagnostic Summary ===");
      expect(stdout).toContain("Overall Status: ✗ Critical Issues Found");
      expect(stdout).toContain("Total Checks: 4");
      expect(stdout).toContain("Passed: 2 | Warnings: 1 | Failed: 1");
      expect(stdout).toContain("Execution Time: 1s");
      expect(stdout).toContain("✓ Node Version: Node.js version compatible");
      expect(stdout).toContain("⚠ Config File: Config file has issues");
      expect(stdout).toContain("✗ SSO Token Status: SSO tokens expired");
    });

    it("should show remediation suggestions for non-passing checks", async () => {
      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      const { stdout } = await runCommand(DoctorCommand, [], cliContext);

      expect(stdout).toContain("💡 Run aws configure to set up basic configuration");
      expect(stdout).toContain("💡 Run aws sso login to refresh tokens");
    });

    it("should include detailed information when --detailed flag is used", async () => {
      const detailedResult = {
        status: "warn" as const,
        message: "Config file has issues",
        details: {
          path: "/home/user/.aws/config",
          size: "1.2KB",
          lastModified: "2025-01-01",
        },
        remediation: "Run aws configure to set up basic configuration",
        duration: 100,
      };

      const detailedSummary: DiagnosticSummary = {
        ...mockSummary,
        results: new Map([["config-file", detailedResult]]),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(detailedSummary);
      mockCheckRegistry.getChecksForStage.mockReturnValue([
        { id: "config-file", name: "Config File", stage: "configuration" },
      ]);

      const { stdout } = await runCommand(DoctorCommand, ["--detailed"], cliContext);

      expect(stdout).toContain("path: /home/user/.aws/config");
      expect(stdout).toContain("size: 1.2KB");
      expect(stdout).toContain("lastModified: 2025-01-01");
    });

    it("should output results in JSON format when --json flag is used", async () => {
      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      const { stdout } = await runCommand(DoctorCommand, ["--json"], cliContext);

      const jsonOutput = JSON.parse(stdout);

      expect(jsonOutput.summary.totalChecks).toBe(4);
      expect(jsonOutput.summary.passedChecks).toBe(2);
      expect(jsonOutput.summary.warningChecks).toBe(1);
      expect(jsonOutput.summary.failedChecks).toBe(1);
      expect(jsonOutput.summary.overallStatus).toBe("fail");
      expect(jsonOutput.summary.executionTime).toBe(1200);

      expect(jsonOutput.results["node-version"].status).toBe("pass");
      expect(jsonOutput.results["config-file"].status).toBe("warn");
      expect(jsonOutput.results["sso-tokens"].status).toBe("fail");
    });

    it("should include repair results in JSON output", async () => {
      const repairResults: RepairResult[] = [
        {
          success: true,
          message: "Repair completed successfully",
          details: { operation: "clear-tokens" },
          operations: ["Cleared expired tokens"],
          backupPath: "/home/user/.aws/backups/backup.json",
        },
      ];

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);
      mockAutoRepairService.executeSafeRepairs.mockResolvedValue(repairResults);

      const { stdout } = await runCommand(DoctorCommand, ["--fix", "--json"], cliContext);

      const jsonOutput = JSON.parse(stdout);

      expect(jsonOutput.repairs.totalRepairs).toBe(1);
      expect(jsonOutput.repairs.successfulRepairs).toBe(1);
      expect(jsonOutput.repairs.failedRepairs).toBe(0);
      expect(jsonOutput.repairs.results[0].success).toBe(true);
      expect(jsonOutput.repairs.results[0].message).toBe("Repair completed successfully");
      expect(jsonOutput.repairs.results[0].backupPath).toBe("/home/user/.aws/backups/backup.json");
    });

    it("should show summary guidance based on results", async () => {
      const passingSummary: DiagnosticSummary = {
        totalChecks: 3,
        passedChecks: 3,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 800,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(passingSummary);

      const { stdout } = await runCommand(DoctorCommand, [], cliContext);

      expect(stdout).toContain(
        "🎉 All checks passed! Your AWS CLI environment is properly configured.",
      );
    });

    it("should show recommended actions for failing checks", async () => {
      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      const { stdout } = await runCommand(DoctorCommand, [], cliContext);

      expect(stdout).toContain("=== Recommended Actions ===");
      expect(stdout).toContain(
        "• Address failed checks first as they may prevent proper operation",
      );
      expect(stdout).toContain("• Use --interactive flag for guided repair assistance");
      expect(stdout).toContain("• Use --fix flag to automatically resolve safe issues");
      expect(stdout).toContain("• Review warning checks for potential improvements");
    });
  });

  describe("exit codes", () => {
    it("should exit with code 0 for passing results", async () => {
      const passingResults: DiagnosticSummary = {
        totalChecks: 3,
        passedChecks: 3,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 500,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(passingResults);

      const { exitCode } = await runCommand(DoctorCommand, [], cliContext);

      expect(exitCode).toBe(0);
    });

    it("should exit with code 0 for warning results", async () => {
      const warningResults: DiagnosticSummary = {
        totalChecks: 3,
        passedChecks: 2,
        warningChecks: 1,
        failedChecks: 0,
        overallStatus: "warn",
        executionTime: 500,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(warningResults);

      const { exitCode } = await runCommand(DoctorCommand, [], cliContext);

      expect(exitCode).toBe(0);
    });

    it("should exit with code 1 for failing results", async () => {
      const failingResults: DiagnosticSummary = {
        totalChecks: 3,
        passedChecks: 1,
        warningChecks: 1,
        failedChecks: 1,
        overallStatus: "fail",
        executionTime: 500,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(failingResults);

      const result = await runCommand(DoctorCommand, [], cliContext);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should handle diagnostic execution errors gracefully", async () => {
      const diagnosticError = new Error("Diagnostic execution failed");
      mockDoctorService.runDiagnostics.mockRejectedValue(diagnosticError);

      const result = await runCommand(DoctorCommand, [], cliContext);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Diagnostic execution failed");
    });

    it("should handle TimeoutError with specialized guidance", async () => {
      const { TimeoutError } = await import("../../../src/lib/errors.js");
      const timeoutError = new TimeoutError("Operation timed out", "AWS_TIMEOUT", {
        operation: "sts-get-caller-identity",
        timeoutMs: 30_000,
      });
      mockDoctorService.runDiagnostics.mockRejectedValue(timeoutError);

      const result = await runCommand(DoctorCommand, [], cliContext);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain(
        'Network operation timed out after {"operation":"sts-get-caller-identity","timeoutMs":30000}ms',
      );
      expect(result.error?.message).toContain("Operation: AWS_TIMEOUT");
    });

    it("should handle ApiError with specialized guidance", async () => {
      const { ApiError } = await import("../../../src/lib/errors.js");
      const apiError = new ApiError("API request failed", "AWS_API_ERROR", {
        apiName: "STS",
        operation: "GetCallerIdentity",
        httpStatusCode: 403,
      });
      mockDoctorService.runDiagnostics.mockRejectedValue(apiError);

      const result = await runCommand(DoctorCommand, [], cliContext);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("AWS API error (Unknown)");
      expect(result.error?.message).toContain("Service: AWS_API_ERROR");
      expect(result.error?.message).toContain(
        'Operation: {"apiName":"STS","operation":"GetCallerIdentity","httpStatusCode":403}',
      );
    });

    it("should handle unknown error types", async () => {
      const unknownError = { message: "Unknown error type", code: "UNKNOWN" };
      mockDoctorService.runDiagnostics.mockRejectedValue(unknownError);

      const result = await runCommand(DoctorCommand, [], cliContext);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("[object Object]");
    });

    it("should show verbose error information when --verbose flag is used", async () => {
      const detailedError = new Error("Detailed diagnostic failure");
      detailedError.stack = "Error: Detailed diagnostic failure\n    at test:1:1";
      mockDoctorService.runDiagnostics.mockRejectedValue(detailedError);

      const result = await runCommand(DoctorCommand, ["--verbose"], cliContext);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
    });

    it("should handle repair service initialization errors", async () => {
      const mockSummaryWithIssues: DiagnosticSummary = {
        totalChecks: 2,
        passedChecks: 1,
        warningChecks: 0,
        failedChecks: 1,
        overallStatus: "fail",
        executionTime: 500,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummaryWithIssues);
      vi.mocked(AutoRepairService).mockImplementation(() => {
        throw new Error("Auto-repair service initialization failed");
      });

      const result = await runCommand(DoctorCommand, ["--fix"], cliContext);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
    });
  });

  describe("service configuration", () => {
    it("should configure DoctorService with correct options", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 1,
        passedChecks: 1,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 300,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      await runCommand(DoctorCommand, ["--verbose"], cliContext);

      expect(vi.mocked(DoctorService)).toHaveBeenCalledWith(expect.any(Object), {
        enableDebugLogging: true,
        enableProgressIndicators: true,
        networkTimeout: 30_000,
        maxConcurrency: 5,
      });
    });

    it("should disable progress indicators for JSON output", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 1,
        passedChecks: 1,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 300,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      await runCommand(DoctorCommand, ["--json"], cliContext);

      expect(vi.mocked(DoctorService)).toHaveBeenCalledWith(expect.any(Object), {
        enableDebugLogging: false,
        enableProgressIndicators: false,
        networkTimeout: 30_000,
        maxConcurrency: 5,
      });
    });

    it("should configure AutoRepairService with correct options", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 2,
        passedChecks: 1,
        warningChecks: 0,
        failedChecks: 1,
        overallStatus: "fail",
        executionTime: 500,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);
      mockAutoRepairService.executeSafeRepairs.mockResolvedValue([]);

      await runCommand(DoctorCommand, ["--fix", "--verbose"], cliContext);

      expect(vi.mocked(AutoRepairService)).toHaveBeenCalledWith({
        enableDebugLogging: true,
        dryRun: false,
      });
    });

    it("should register all diagnostic checks in correct order", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 12,
        passedChecks: 12,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 1000,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      await runCommand(DoctorCommand, [], cliContext);

      // Verify all check types are registered
      expect(mockCheckRegistry.register).toHaveBeenCalledTimes(12);
    });
  });

  describe("utility method edge cases", () => {
    it("should handle unknown status in formatOverallStatus", async () => {
      const mockSummary: DiagnosticSummary = {
        totalChecks: 1,
        passedChecks: 1,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "unknown",
        executionTime: 300,
        results: new Map(),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);

      const { stdout } = await runCommand(DoctorCommand, [], cliContext);

      expect(stdout).toContain("Overall Status: unknown");
    });

    it("should handle unknown status in formatCheckStatus", async () => {
      const mockResult = {
        status: "unknown" as const,
        message: "Unknown check status",
        duration: 50,
      };

      const mockSummary: DiagnosticSummary = {
        totalChecks: 1,
        passedChecks: 0,
        warningChecks: 0,
        failedChecks: 0,
        overallStatus: "pass",
        executionTime: 300,
        results: new Map([["unknown-check", mockResult]]),
      };

      mockDoctorService.runDiagnostics.mockResolvedValue(mockSummary);
      mockCheckRegistry.getChecksForStage.mockReturnValue([
        { id: "unknown-check", name: "Unknown Check", stage: "environment" },
      ]);

      const { stdout } = await runCommand(DoctorCommand, [], cliContext);

      expect(stdout).toContain("? Unknown Check: Unknown check status");
    });
  });

  describe("implementation coverage tests", () => {
    let command: DoctorCommand;

    beforeEach(() => {
      command = new DoctorCommand([], cliContext.config);
    });

    describe("initializeCheckRegistry", () => {
      it("should register all check types in correct order", () => {
        // Setup mock registry instance
        const mockRegister = vi.fn();
        (CheckRegistry as any).mockImplementation(() => ({
          register: mockRegister,
        }));

        // Call the actual implementation method
        (command as any).initializeCheckRegistry();

        expect(CheckRegistry).toHaveBeenCalledWith();

        // Should be called multiple times for all check types (actual count is 12)
        expect(mockRegister).toHaveBeenCalledTimes(12);
      });
    });

    describe("formatOverallStatus", () => {
      it("should format pass status with green checkmark", () => {
        const result = (command as any).formatOverallStatus("pass");
        expect(result).toContain("✓");
        expect(result).toContain("All Checks Passed");
      });

      it("should format fail status with red X", () => {
        const result = (command as any).formatOverallStatus("fail");
        expect(result).toContain("✗");
        expect(result).toContain("Issues Found");
      });

      it("should format warn status with yellow warning", () => {
        const result = (command as any).formatOverallStatus("warn");
        expect(result).toContain("⚠");
        expect(result).toContain("Some Issues Found");
      });

      it("should handle unknown status", () => {
        const result = (command as any).formatOverallStatus("unknown");
        expect(result).toBe("unknown");
      });
    });

    describe("formatCheckStatus", () => {
      it("should format pass status with green checkmark", () => {
        const result = (command as any).formatCheckStatus("pass");
        expect(result).toContain("✓");
      });

      it("should format fail status with red X", () => {
        const result = (command as any).formatCheckStatus("fail");
        expect(result).toContain("✗");
      });

      it("should format warn status with yellow warning", () => {
        const result = (command as any).formatCheckStatus("warn");
        expect(result).toContain("⚠");
      });

      it("should format error status with question mark", () => {
        const result = (command as any).formatCheckStatus("error");
        expect(result).toContain("?");
      });

      it("should handle unknown status with question mark", () => {
        const result = (command as any).formatCheckStatus("unknown");
        expect(result).toContain("?");
      });
    });

    describe("capitalizeStage", () => {
      it("should capitalize environment stage", () => {
        const result = (command as any).capitalizeStage("environment");
        expect(result).toBe("Environment");
      });

      it("should capitalize configuration stage", () => {
        const result = (command as any).capitalizeStage("configuration");
        expect(result).toBe("Configuration");
      });

      it("should capitalize authentication stage", () => {
        const result = (command as any).capitalizeStage("authentication");
        expect(result).toBe("Authentication");
      });

      it("should capitalize connectivity stage", () => {
        const result = (command as any).capitalizeStage("connectivity");
        expect(result).toBe("Connectivity");
      });
    });

    describe("outputJsonResults", () => {
      it("should output JSON format with summary and repair results", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation();

        const mockSummary: DiagnosticSummary = {
          totalChecks: 3,
          passedChecks: 2,
          warningChecks: 1,
          failedChecks: 0,
          overallStatus: "warn",
          executionTime: 500,
          results: new Map([
            ["test-check", { status: "pass", message: "Test passed", duration: 100 }],
          ]),
        };

        const mockRepairResults = [
          { checkId: "test-check", success: true, message: "Repair successful", duration: 200 },
        ];

        (command as any).outputJsonResults(mockSummary, mockRepairResults);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"totalChecks": 3'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"repairs"'));

        consoleSpy.mockRestore();
      });

      it("should output JSON format without repair results", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation();

        const mockSummary: DiagnosticSummary = {
          totalChecks: 1,
          passedChecks: 1,
          warningChecks: 0,
          failedChecks: 0,
          overallStatus: "pass",
          executionTime: 300,
          results: new Map(),
        };

        (command as any).outputJsonResults(mockSummary);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"totalChecks": 1'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.not.stringContaining('"repairs"'));

        consoleSpy.mockRestore();
      });
    });

    describe("exitWithAppropriateCode", () => {
      it("should not call exit for pass status", () => {
        const exitSpy = vi.spyOn(command, "exit").mockImplementation(() => undefined as never);

        const mockSummary: DiagnosticSummary = {
          totalChecks: 1,
          passedChecks: 1,
          warningChecks: 0,
          failedChecks: 0,
          overallStatus: "pass",
          executionTime: 300,
          results: new Map(),
        };

        (command as any).exitWithAppropriateCode(mockSummary);
        expect(exitSpy).not.toHaveBeenCalled();

        exitSpy.mockRestore();
      });

      it("should not call exit for warn status", () => {
        const exitSpy = vi.spyOn(command, "exit").mockImplementation(() => undefined as never);

        const mockSummary: DiagnosticSummary = {
          totalChecks: 2,
          passedChecks: 1,
          warningChecks: 1,
          failedChecks: 0,
          overallStatus: "warn",
          executionTime: 300,
          results: new Map(),
        };

        (command as any).exitWithAppropriateCode(mockSummary);
        expect(exitSpy).not.toHaveBeenCalled();

        exitSpy.mockRestore();
      });

      it("should exit with code 1 for fail status", () => {
        const exitSpy = vi.spyOn(command, "exit").mockImplementation(() => undefined as never);

        const mockSummary: DiagnosticSummary = {
          totalChecks: 2,
          passedChecks: 0,
          warningChecks: 0,
          failedChecks: 2,
          overallStatus: "fail",
          executionTime: 300,
          results: new Map(),
        };

        (command as any).exitWithAppropriateCode(mockSummary);
        expect(exitSpy).toHaveBeenCalledWith(1);

        exitSpy.mockRestore();
      });
    });

    describe("handleDiagnosticError", () => {
      it("should handle TimeoutError with specialized guidance", () => {
        const errorSpy = vi.spyOn(command, "error").mockImplementation(() => undefined as never);

        const timeoutError = new TimeoutError("Operation timed out", 5000);
        (command as any).handleDiagnosticError(timeoutError, false);

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Diagnostic execution failed"),
          { exit: 1 },
        );

        errorSpy.mockRestore();
      });

      it("should handle ApiError with specialized guidance", () => {
        const errorSpy = vi.spyOn(command, "error").mockImplementation(() => undefined as never);

        const apiError = new ApiError("API call failed", "TestService", "testOperation");
        (command as any).handleDiagnosticError(apiError, false);

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Diagnostic execution failed"),
          { exit: 1 },
        );

        errorSpy.mockRestore();
      });

      it("should show verbose error information when verbose flag is true", () => {
        const errorSpy = vi.spyOn(command, "error").mockImplementation(() => undefined as never);

        const genericError = new Error("Generic error with stack");
        genericError.stack = "Error stack trace";

        (command as any).handleDiagnosticError(genericError, true);

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Diagnostic execution failed"),
          { exit: 1 },
        );

        errorSpy.mockRestore();
      });

      it("should handle unknown error types", () => {
        const errorSpy = vi.spyOn(command, "error").mockImplementation(() => undefined as never);

        const unknownError = "string error";
        (command as any).handleDiagnosticError(unknownError, false);

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Diagnostic execution failed"),
          { exit: 1 },
        );

        errorSpy.mockRestore();
      });
    });

    describe("outputSummaryGuidance", () => {
      it("should output success message for all checks passed", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation();

        const mockSummary: DiagnosticSummary = {
          totalChecks: 3,
          passedChecks: 3,
          warningChecks: 0,
          failedChecks: 0,
          overallStatus: "pass",
          executionTime: 500,
          results: new Map(),
        };

        (command as any).outputSummaryGuidance(mockSummary);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("All checks passed"));

        consoleSpy.mockRestore();
      });

      it("should output recommended actions for failing checks", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation();

        const mockSummary: DiagnosticSummary = {
          totalChecks: 3,
          passedChecks: 1,
          warningChecks: 1,
          failedChecks: 1,
          overallStatus: "fail",
          executionTime: 500,
          results: new Map(),
        };

        (command as any).outputSummaryGuidance(mockSummary);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Recommended Actions"));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Address failed checks"));

        consoleSpy.mockRestore();
      });
    });

    describe("outputRepairResults", () => {
      it("should output successful repair results", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation();

        const mockRepairResults = [
          { checkId: "test-check-1", success: true, message: "Repair successful", duration: 200 },
          { checkId: "test-check-2", success: false, message: "Repair failed", duration: 100 },
        ];

        (command as any).outputRepairResults(mockRepairResults);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("=== Repair Results ==="));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("✓"));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("✗"));

        consoleSpy.mockRestore();
      });

      it("should handle empty repair results", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation();

        (command as any).outputRepairResults([]);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("=== Repair Results ==="));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Total Repairs: 0"));

        consoleSpy.mockRestore();
      });
    });
  });
});
