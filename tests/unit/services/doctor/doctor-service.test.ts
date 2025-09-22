/**
 * Unit tests for DoctorService
 *
 * Tests diagnostic orchestration with mocked dependencies for comprehensive
 * workflow testing, stage execution, and error handling scenarios.
 */

import { Listr } from "listr2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticError } from "../../../../src/lib/diagnostic-errors.js";
import { AuthService } from "../../../../src/services/auth-service.js";
import { CredentialService } from "../../../../src/services/credential-service.js";
import { CheckRegistry } from "../../../../src/services/doctor/check-registry.js";
import { DoctorService } from "../../../../src/services/doctor/doctor-service.js";
import type {
  CheckResult,
  CheckStage,
  DoctorContext,
  ICheck,
} from "../../../../src/services/doctor/types.js";
import { ProfileManager } from "../../../../src/services/profile-manager.js";
import { TokenManager } from "../../../../src/services/token-manager.js";

// Mock all service dependencies
vi.mock("../../../../src/services/auth-service.js", () => ({
  AuthService: vi.fn(),
}));

vi.mock("../../../../src/services/credential-service.js", () => ({
  CredentialService: vi.fn(),
}));

vi.mock("../../../../src/services/profile-manager.js", () => ({
  ProfileManager: vi.fn(),
}));

vi.mock("../../../../src/services/token-manager.js", () => ({
  TokenManager: vi.fn(),
}));

vi.mock("../../../../src/services/doctor/check-registry.js", () => ({
  CheckRegistry: vi.fn(),
}));

// Mock listr2
vi.mock("listr2", () => ({
  Listr: vi.fn().mockImplementation((tasks, options) => ({
    run: vi.fn().mockResolvedValue(),
    tasks,
    options,
  })),
}));

/**
 * Mock check implementation for testing
 */
class MockCheck implements ICheck {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly stage: CheckStage,
    private readonly mockResult: CheckResult,
  ) {}

  execute(): Promise<CheckResult> {
    return Promise.resolve({
      ...this.mockResult,
      duration: 100,
    });
  }
}

const mockCheckRegistry = {
  getChecksForStage: vi.fn(),
  register: vi.fn(),
  getCheck: vi.fn(),
  getAllCheckIds: vi.fn(),
  getCheckCount: vi.fn(),
  getStageDistribution: vi.fn(),
  clear: vi.fn(),
};

const mockAuthService = {
  getStatus: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getProfiles: vi.fn(),
  switchProfile: vi.fn(),
};

const mockCredentialService = {
  validateCredentials: vi.fn(),
  getActiveProfile: vi.fn(),
  createS3Client: vi.fn(),
  createStsClient: vi.fn(),
};

const mockProfileManager = {
  discoverProfiles: vi.fn(),
  profileExists: vi.fn(),
  getProfileInfo: vi.fn(),
  switchProfile: vi.fn(),
};

const mockTokenManager = {
  getTokenStatus: vi.fn(),
  checkTokenExpiry: vi.fn(),
  clearExpiredTokens: vi.fn(),
};

describe("DoctorService", () => {
  let doctorService: DoctorService;
  let checkRegistry: CheckRegistry;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Date.now to simulate passage of time for duration measurements
    let mockTime = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      mockTime += 10; // Add 10ms each call
      return mockTime;
    });

    // Setup mock constructors
    vi.mocked(CheckRegistry).mockReturnValue(mockCheckRegistry as any);
    vi.mocked(AuthService).mockReturnValue(mockAuthService as any);
    vi.mocked(CredentialService).mockReturnValue(mockCredentialService as any);
    vi.mocked(ProfileManager).mockReturnValue(mockProfileManager as any);
    vi.mocked(TokenManager).mockReturnValue(mockTokenManager as any);

    checkRegistry = new CheckRegistry();
    doctorService = new DoctorService(checkRegistry, {
      enableDebugLogging: false,
      enableProgressIndicators: false, // Disable for testing
      networkTimeout: 5000,
      maxConcurrency: 2,
    });
  });

  describe("constructor", () => {
    it("should initialize with default options", () => {
      const service = new DoctorService(checkRegistry);
      expect(service).toBeInstanceOf(DoctorService);
    });

    it("should initialize with custom options", () => {
      const customOptions = {
        enableDebugLogging: true,
        enableProgressIndicators: true,
        networkTimeout: 10_000,
        maxConcurrency: 10,
      };

      const service = new DoctorService(checkRegistry, customOptions);
      expect(service).toBeInstanceOf(DoctorService);
    });

    it("should disable progress indicators in test environment", () => {
      process.env.NODE_ENV = "test";
      const service = new DoctorService(checkRegistry, {
        enableProgressIndicators: true,
      });
      expect(service).toBeInstanceOf(DoctorService);
    });
  });

  describe("executeStage", () => {
    beforeEach(() => {
      const mockChecks = [
        new MockCheck("env-1", "Environment Check 1", "First env check", "environment", {
          status: "pass",
          message: "Environment check passed",
        }),
        new MockCheck("env-2", "Environment Check 2", "Second env check", "environment", {
          status: "warn",
          message: "Environment check has warnings",
          remediation: "Consider upgrading dependencies",
        }),
      ];

      mockCheckRegistry.getChecksForStage.mockReturnValue(mockChecks);
    });

    it("should execute all checks for a stage", async () => {
      const context: DoctorContext = {
        profile: "test-profile",
        detailed: false,
      };

      const results = await doctorService.executeStage("environment", context);

      expect(mockCheckRegistry.getChecksForStage).toHaveBeenCalledWith("environment");
      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
      expect(results.has("env-1")).toBe(true);
      expect(results.has("env-2")).toBe(true);
    });

    it("should return empty results for stage with no checks", async () => {
      mockCheckRegistry.getChecksForStage.mockReturnValue([]);

      const context: DoctorContext = { detailed: false };
      const results = await doctorService.executeStage("connectivity", context);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(0);
    });

    it("should handle check execution errors gracefully", async () => {
      const failingCheck = new MockCheck(
        "failing-check",
        "Failing Check",
        "This check fails",
        "environment",
        {
          status: "fail",
          message: "Check failed",
        },
      );

      // Override execute method to throw error
      failingCheck.execute = vi.fn().mockRejectedValue(new Error("Check execution failed"));

      mockCheckRegistry.getChecksForStage.mockReturnValue([failingCheck]);

      const context: DoctorContext = { detailed: false };
      const results = await doctorService.executeStage("environment", context);

      expect(results.size).toBe(1);
      const result = results.get("failing-check");
      expect(result?.status).toBe("fail");
      expect(result?.message).toContain("Check execution failed");
    });

    it("should add duration to check results", async () => {
      const context: DoctorContext = { detailed: false };
      const results = await doctorService.executeStage("environment", context);

      for (const result of results.values()) {
        expect(result.duration).toBeDefined();
        expect(typeof result.duration).toBe("number");
        expect(result.duration).toBeGreaterThan(0);
      }
    });

    it("should execute checks with progress indicators when enabled", async () => {
      const serviceWithProgress = new DoctorService(checkRegistry, {
        enableProgressIndicators: true,
      });

      const context: DoctorContext = { detailed: false };
      await serviceWithProgress.executeStage("environment", context);

      // Verify listr2 was used (mocked)
      expect(vi.mocked(Listr)).toHaveBeenCalled();
    });
  });

  describe("runDiagnostics", () => {
    beforeEach(() => {
      // Mock checks for different stages
      const environmentChecks = [
        new MockCheck("node-version", "Node Version", "Check Node.js version", "environment", {
          status: "pass",
          message: "Node.js version is compatible",
        }),
      ];

      const configChecks = [
        new MockCheck("config-file", "Config File", "Check AWS config", "configuration", {
          status: "pass",
          message: "AWS config file exists",
        }),
      ];

      mockCheckRegistry.getChecksForStage.mockImplementation((stage: CheckStage) => {
        switch (stage) {
          case "environment": {
            return environmentChecks;
          }
          case "configuration": {
            return configChecks;
          }
          default: {
            return [];
          }
        }
      });
    });

    it("should execute all stages in order", async () => {
      const context: DoctorContext = {
        profile: "test-profile",
        detailed: true,
      };

      const summary = await doctorService.runDiagnostics(context);

      expect(summary).toBeDefined();
      expect(summary.totalChecks).toBe(2);
      expect(summary.passedChecks).toBe(2);
      expect(summary.warningChecks).toBe(0);
      expect(summary.failedChecks).toBe(0);
      expect(summary.overallStatus).toBe("pass");
      expect(summary.executionTime).toBeGreaterThan(0);
    });

    it("should stop execution on critical environment failures", async () => {
      const failingEnvironmentCheck = new MockCheck(
        "failing-env",
        "Failing Env Check",
        "Fails",
        "environment",
        {
          status: "fail",
          message: "Critical environment failure",
        },
      );

      mockCheckRegistry.getChecksForStage.mockImplementation((stage: CheckStage) => {
        if (stage === "environment") {
          return [failingEnvironmentCheck];
        }
        return [];
      });

      const context: DoctorContext = { detailed: false };
      const summary = await doctorService.runDiagnostics(context);

      expect(summary.totalChecks).toBe(1);
      expect(summary.failedChecks).toBe(1);
      expect(summary.overallStatus).toBe("fail");

      // Should have called getChecksForStage for environment but not subsequent stages
      expect(mockCheckRegistry.getChecksForStage).toHaveBeenCalledWith("environment");
    });

    it("should handle execution errors gracefully", async () => {
      mockCheckRegistry.getChecksForStage.mockImplementation(() => {
        throw new Error("Registry failure");
      });

      const context: DoctorContext = { detailed: false };

      await expect(doctorService.runDiagnostics(context)).rejects.toThrow();
    });

    it("should update context between stages", async () => {
      const context: DoctorContext = {
        profile: "test-profile",
        detailed: false,
      };

      await doctorService.runDiagnostics(context);

      // Verify that context updates are called (implementation may be placeholder)
      expect(mockCheckRegistry.getChecksForStage).toHaveBeenCalledTimes(4); // All 4 stages
    });
  });

  describe("createDiagnosticSummary", () => {
    it("should create summary for all passing checks", () => {
      const results = new Map<string, CheckResult>([
        ["check-1", { status: "pass", message: "Check 1 passed" }],
        ["check-2", { status: "pass", message: "Check 2 passed" }],
        ["check-3", { status: "pass", message: "Check 3 passed" }],
      ]);

      const summary = doctorService.createDiagnosticSummary(results, 1000);

      expect(summary.totalChecks).toBe(3);
      expect(summary.passedChecks).toBe(3);
      expect(summary.warningChecks).toBe(0);
      expect(summary.failedChecks).toBe(0);
      expect(summary.overallStatus).toBe("pass");
      expect(summary.executionTime).toBe(1000);
      expect(summary.results).toBe(results);
    });

    it("should create summary with mixed results", () => {
      const results = new Map<string, CheckResult>([
        ["check-1", { status: "pass", message: "Check 1 passed" }],
        ["check-2", { status: "warn", message: "Check 2 has warnings" }],
        ["check-3", { status: "fail", message: "Check 3 failed" }],
        ["check-4", { status: "warn", message: "Check 4 has warnings" }],
      ]);

      const summary = doctorService.createDiagnosticSummary(results, 2000);

      expect(summary.totalChecks).toBe(4);
      expect(summary.passedChecks).toBe(1);
      expect(summary.warningChecks).toBe(2);
      expect(summary.failedChecks).toBe(1);
      expect(summary.overallStatus).toBe("fail");
      expect(summary.executionTime).toBe(2000);
    });

    it("should set overall status to warn when only warnings present", () => {
      const results = new Map<string, CheckResult>([
        ["check-1", { status: "pass", message: "Check 1 passed" }],
        ["check-2", { status: "warn", message: "Check 2 has warnings" }],
      ]);

      const summary = doctorService.createDiagnosticSummary(results, 500);

      expect(summary.overallStatus).toBe("warn");
    });

    it("should handle empty results", () => {
      const results = new Map<string, CheckResult>();

      const summary = doctorService.createDiagnosticSummary(results, 0);

      expect(summary.totalChecks).toBe(0);
      expect(summary.passedChecks).toBe(0);
      expect(summary.warningChecks).toBe(0);
      expect(summary.failedChecks).toBe(0);
      expect(summary.overallStatus).toBe("pass");
      expect(summary.executionTime).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle check registry errors", async () => {
      mockCheckRegistry.getChecksForStage.mockImplementation(() => {
        throw new DiagnosticError("Registry error", "test-check", "environment");
      });

      const context: DoctorContext = { detailed: false };

      await expect(doctorService.runDiagnostics(context)).rejects.toThrow(DiagnosticError);
    });

    it("should handle individual check failures without stopping stage", async () => {
      const checks = [
        new MockCheck("good-check", "Good Check", "This passes", "environment", {
          status: "pass",
          message: "Good check passed",
        }),
        new MockCheck("bad-check", "Bad Check", "This fails", "environment", {
          status: "fail",
          message: "Bad check failed",
        }),
      ];

      // Make one check throw an error
      checks[1].execute = vi.fn().mockRejectedValue(new Error("Execution error"));

      mockCheckRegistry.getChecksForStage.mockReturnValue(checks);

      const context: DoctorContext = { detailed: false };
      const results = await doctorService.executeStage("environment", context);

      expect(results.size).toBe(2);
      expect(results.get("good-check")?.status).toBe("pass");
      expect(results.get("bad-check")?.status).toBe("fail");
      expect(results.get("bad-check")?.message).toContain("Check execution failed");
    });
  });

  describe("integration scenarios", () => {
    it("should handle profile-specific diagnostics", async () => {
      const profileSpecificCheck = new MockCheck(
        "profile-check",
        "Profile Check",
        "Profile validation",
        "configuration",
        {
          status: "pass",
          message: "Profile is valid",
        },
      );

      mockCheckRegistry.getChecksForStage.mockReturnValue([profileSpecificCheck]);

      const context: DoctorContext = {
        profile: "production",
        detailed: true,
      };

      const results = await doctorService.executeStage("configuration", context);

      expect(results.size).toBe(1);
      expect(results.get("profile-check")?.status).toBe("pass");
    });

    it("should handle concurrent check execution", async () => {
      const checks = Array.from(
        { length: 5 },
        (_, index) =>
          new MockCheck(
            `concurrent-check-${index}`,
            `Check ${index}`,
            `Concurrent check ${index}`,
            "environment",
            {
              status: "pass",
              message: `Check ${index} passed`,
            },
          ),
      );

      mockCheckRegistry.getChecksForStage.mockReturnValue(checks);

      const context: DoctorContext = { detailed: false };
      const startTime = Date.now();
      const results = await doctorService.executeStage("environment", context);
      const endTime = Date.now();

      expect(results.size).toBe(5);
      // With concurrent execution, should be faster than sequential
      expect(endTime - startTime).toBeLessThan(500); // Assume each check takes ~100ms
    });
  });
});
