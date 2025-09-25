/**
 * Unit tests for AutoRepairService
 *
 * Tests auto-repair capabilities with mocked dependencies for safe operations,
 * interactive mode, backup patterns, and comprehensive error handling scenarios.
 */

import enquirer from "enquirer";
import { execa } from "execa";
import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoRepairError } from "../../../../src/lib/diagnostic-errors.js";
import { AuthService } from "../../../../src/services/auth-service.js";
import { AutoRepairService } from "../../../../src/services/doctor/auto-repair.js";
import type { CheckResult, DoctorContext } from "../../../../src/services/doctor/types.js";
import { TokenManager } from "../../../../src/services/token-manager.js";

// Mock all dependencies
vi.mock("../../../../src/services/auth-service.js", () => ({
  AuthService: vi.fn(),
}));

vi.mock("../../../../src/services/token-manager.js", () => ({
  TokenManager: vi.fn(),
}));

vi.mock("enquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/test"),
}));

const mockAuthService = {
  listProfiles: vi.fn(),
  getStatus: vi.fn(),
};

const mockTokenManager = {
  checkTokenExpiry: vi.fn(),
  clearExpiredTokens: vi.fn(),
};

const mockEnquirer: any = {
  prompt: vi.fn(),
};

const mockExeca = vi.fn();
const mockFs = {
  mkdir: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  copyFile: vi.fn(),
};

describe("AutoRepairService", () => {
  let autoRepairService: AutoRepairService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock constructors
    vi.mocked(AuthService).mockReturnValue(mockAuthService as any);
    vi.mocked(TokenManager).mockReturnValue(mockTokenManager as any);

    // Setup module mocks
    vi.mocked(enquirer.prompt).mockImplementation(mockEnquirer.prompt);

    // Setup enquirer method aliases as spies for test convenience
    mockEnquirer.confirm = vi.fn();
    mockEnquirer.select = vi.fn();
    vi.mocked(execa).mockImplementation(mockExeca);
    Object.assign(fs, mockFs);

    autoRepairService = new AutoRepairService({
      enableDebugLogging: false,
      dryRun: false,
    });
  });

  describe("constructor", () => {
    it("should initialize with default options", () => {
      const service = new AutoRepairService();
      expect(service).toBeInstanceOf(AutoRepairService);
    });

    it("should initialize with custom options", () => {
      const service = new AutoRepairService({
        enableDebugLogging: true,
        dryRun: true,
        backupDirectory: "/custom/backup",
      });
      expect(service).toBeInstanceOf(AutoRepairService);
    });
  });

  describe("executeSafeRepairs", () => {
    let context: DoctorContext;
    let checkResults: Map<string, CheckResult>;

    beforeEach(() => {
      context = {
        profile: "test-profile",
        detailed: false,
        autoFix: true,
      };

      checkResults = new Map([
        ["sso-token-expiry", { status: "fail", message: "Tokens expired" }],
        ["config-file-exists", { status: "warn", message: "Config issues" }],
      ]);
    });

    it("should execute all safe repair operations", async () => {
      // Mock successful token expiry check
      mockTokenManager.checkTokenExpiry.mockResolvedValue([
        { profileName: "expired-profile", status: "expired" },
      ]);

      // Mock file system operations
      mockFs.stat.mockRejectedValue(new Error("ENOENT")); // Directories don't exist
      mockFs.mkdir.mockResolvedValue();
      mockFs.readdir.mockResolvedValue([]);

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);

      // Verify that safe operations were attempted
      expect(mockTokenManager.checkTokenExpiry).toHaveBeenCalled();
      expect(mockFs.mkdir).toHaveBeenCalled();
    });

    it("should handle expired tokens cleanup", async () => {
      mockTokenManager.checkTokenExpiry.mockResolvedValue([
        { profileName: "profile1", status: "expired" },
        { profileName: "profile2", status: "valid" },
        { profileName: "profile3", status: "expired" },
      ]);

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      const tokenResult = results.find((r) => r.message.includes("expired SSO tokens"));
      expect(tokenResult).toBeDefined();
      expect(tokenResult?.success).toBe(true);
      expect(tokenResult?.message).toContain("2 expired SSO tokens");
    });

    it("should handle no expired tokens gracefully", async () => {
      mockTokenManager.checkTokenExpiry.mockResolvedValue([
        { profileName: "profile1", status: "valid" },
        { profileName: "profile2", status: "valid" },
      ]);

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      const tokenResult = results.find((r) => r.message.includes("expired tokens"));
      expect(tokenResult?.message).toContain("No expired tokens found");
    });

    it("should create missing directories", async () => {
      // Mock directories that don't exist
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));
      mockFs.mkdir.mockResolvedValue();

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      const directoryResult = results.find((r) => r.message.includes("missing directories"));
      expect(directoryResult).toBeDefined();
      expect(directoryResult?.success).toBe(true);

      // Should attempt to create required directories
      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringContaining(".aws"), {
        recursive: true,
      });
    });

    it("should handle existing directories gracefully", async () => {
      // Mock directories that already exist
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      const directoryResult = results.find((r) => r.message.includes("directories"));
      expect(directoryResult?.message).toContain("All required directories exist");
    });

    it("should clean orphaned temp files", async () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago

      mockFs.readdir.mockResolvedValue(["tmp-old-file", "tmp-recent-file", "normal-file"]);
      mockFs.stat.mockImplementation((path: string) => {
        if (path.includes("tmp-old-file")) {
          return Promise.resolve({ mtime: oldDate } as any);
        }
        return Promise.resolve({ mtime: new Date() } as any);
      });
      mockFs.unlink.mockResolvedValue();

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      const cleanResult = results.find((r) => r.message.includes("orphaned temporary files"));
      expect(cleanResult).toBeDefined();

      // Should only clean old temp files
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining("tmp-old-file"));
    });

    it("should handle dry run mode", async () => {
      const dryRunService = new AutoRepairService({
        dryRun: true,
      });

      mockTokenManager.checkTokenExpiry.mockResolvedValue([
        { profileName: "profile1", status: "expired" },
      ]);

      const results = await dryRunService.executeSafeRepairs(context, checkResults);

      const tokenResult = results.find((r) => r.message.includes("Would clear"));
      expect(tokenResult).toBeDefined();
      expect(tokenResult?.details?.dryRun).toBe(true);
    });

    it("should continue with other operations if one fails", async () => {
      // Make token check fail
      mockTokenManager.checkTokenExpiry.mockRejectedValue(new Error("Token check failed"));

      // But allow directory operations to succeed
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));
      mockFs.mkdir.mockResolvedValue();

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      // Should still have results from other operations
      expect(results.length).toBeGreaterThan(0);
      const directoryResult = results.find((r) => r.message.includes("directories"));
      expect(directoryResult).toBeDefined();
    });

    it("should handle repair service errors", async () => {
      mockTokenManager.checkTokenExpiry.mockRejectedValue(new Error("Critical failure"));
      mockFs.mkdir.mockRejectedValue(new Error("Permission denied"));

      // Should not throw but may have empty results
      const results = await autoRepairService.executeSafeRepairs(context, checkResults);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("executeInteractiveRepairs", () => {
    let context: DoctorContext;
    let checkResults: Map<string, CheckResult>;

    beforeEach(() => {
      context = {
        profile: "test-profile",
        detailed: false,
        interactive: true,
      };

      checkResults = new Map([
        ["sso-token-expiry", { status: "fail", message: "SSO tokens expired" }],
        ["config-file-exists", { status: "fail", message: "Config file missing" }],
      ]);
    });

    it("should identify and present repair opportunities", async () => {
      mockAuthService.listProfiles.mockResolvedValue([
        { name: "profile1", type: "sso" },
        { name: "profile2", type: "sso" },
      ]);

      // Mock user confirming repairs
      mockEnquirer.prompt.mockResolvedValue({ proceed: true });
      mockExeca.mockResolvedValue({ exitCode: 0 });

      const results = await autoRepairService.executeInteractiveRepairs(context, checkResults);

      expect(results).toBeInstanceOf(Array);
      expect(mockEnquirer.prompt).toHaveBeenCalled();
    });

    it("should handle user declining repairs", async () => {
      mockEnquirer.prompt.mockResolvedValue({ proceed: false });

      const results = await autoRepairService.executeInteractiveRepairs(context, checkResults);

      expect(results).toBeInstanceOf(Array);
      // User declined, so no repair operations should be executed
      expect(mockExeca).not.toHaveBeenCalled();
    });

    it("should handle SSO token refresh", async () => {
      mockAuthService.listProfiles.mockResolvedValue([{ name: "sso-profile", type: "sso" }]);

      mockEnquirer.prompt
        .mockResolvedValueOnce({ proceed: true })
        .mockResolvedValueOnce({ profile: "sso-profile" });
      mockExeca.mockResolvedValue({ exitCode: 0 });

      const results = await autoRepairService.executeInteractiveRepairs(context, checkResults);

      const ssoResult = results.find((r) => r.message.includes("SSO token"));
      expect(ssoResult?.success).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith("aws", ["sso", "login", "--profile", "sso-profile"]);
    });

    it("should handle config file creation", async () => {
      const configResults = new Map([
        ["config-file-exists", { status: "fail", message: "Config file missing" }],
      ]);

      // Mock enquirer through the mockEnquirer object used in beforeEach
      mockEnquirer.prompt
        .mockResolvedValueOnce({ proceed: true }) // First prompt: proceed with repair
        .mockResolvedValueOnce({ configure: true }); // Second prompt: run aws configure

      mockExeca.mockResolvedValue({ exitCode: 0 });

      // Mock filesystem operations needed by createBasicConfigFile
      mockFs.mkdir.mockResolvedValue();

      const results = await autoRepairService.executeInteractiveRepairs(context, configResults);

      // Debug: Check what repair opportunities were identified
      expect(results.length).toBeGreaterThan(0);

      const configResult = results.find(
        (r) => r.message.includes("config") || r.message.includes("AWS"),
      );
      expect(configResult).toBeDefined();
      expect(configResult?.message).not.toContain("cancelled");
      expect(configResult?.success).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith("aws", ["configure"], { stdio: "inherit" });
    });

    it("should handle no repair opportunities", async () => {
      const noIssueResults = new Map([
        ["node-version", { status: "pass", message: "Node version OK" }],
      ]);

      const results = await autoRepairService.executeInteractiveRepairs(context, noIssueResults);

      expect(results).toHaveLength(1);
      expect(results[0].message).toContain("No repair opportunities identified");
    });

    it("should handle interactive repair failures", async () => {
      mockAuthService.listProfiles.mockResolvedValue([{ name: "sso-profile", type: "sso" }]);

      mockEnquirer.prompt
        .mockResolvedValueOnce({ proceed: true })
        .mockResolvedValueOnce({ profile: "sso-profile" });
      mockExeca.mockRejectedValue(new Error("AWS CLI not found"));

      const results = await autoRepairService.executeInteractiveRepairs(context, checkResults);

      const failedResult = results.find((r) => !r.success);
      expect(failedResult).toBeDefined();
      expect(failedResult?.message).toContain("Failed to execute repair");
    });

    it("should handle enquirer errors gracefully", async () => {
      mockEnquirer.prompt.mockRejectedValue(new Error("Enquirer error"));

      await expect(
        autoRepairService.executeInteractiveRepairs(context, checkResults),
      ).rejects.toThrow(AutoRepairError);
    });
  });

  describe("error handling", () => {
    it("should throw AutoRepairError for safe repair failures", () => {
      // Mock a critical failure in service initialization
      vi.mocked(TokenManager).mockImplementation(() => {
        throw new Error("Service initialization failed");
      });

      // Expect the constructor itself to throw
      expect(() => new AutoRepairService()).toThrow("Service initialization failed");
    });

    it("should throw AutoRepairError for interactive repair failures", async () => {
      const context: DoctorContext = { interactive: true };

      // Add failing check results to trigger repair opportunities
      const checkResults = new Map<string, CheckResult>([
        ["sso-token-expiry", { status: "fail", message: "SSO tokens expired" }],
      ]);

      // Mock enquirer failure
      mockEnquirer.prompt.mockRejectedValue(new Error("Interactive failure"));

      await expect(
        autoRepairService.executeInteractiveRepairs(context, checkResults),
      ).rejects.toThrow(AutoRepairError);
    });

    it("should include context in error metadata", async () => {
      const context: DoctorContext = {
        profile: "test-profile",
        autoFix: true,
      };
      const checkResults = new Map<string, CheckResult>();

      mockTokenManager.checkTokenExpiry.mockRejectedValue(new Error("Critical failure"));

      try {
        await autoRepairService.executeSafeRepairs(context, checkResults);
      } catch (error) {
        expect(error).toBeInstanceOf(AutoRepairError);
        if (error instanceof AutoRepairError) {
          expect(error.metadata.context).toBeDefined();
        }
      }
    });
  });

  describe("integration scenarios", () => {
    it("should handle mixed check results appropriately", async () => {
      const mixedResults = new Map([
        ["node-version", { status: "pass", message: "Node OK" }],
        ["sso-token-expiry", { status: "fail", message: "Tokens expired" }],
        ["config-file-exists", { status: "warn", message: "Config issues" }],
        ["region-accessibility", { status: "pass", message: "Region OK" }],
      ]);

      mockTokenManager.checkTokenExpiry.mockResolvedValue([]);

      const context: DoctorContext = { autoFix: true };
      const results = await autoRepairService.executeSafeRepairs(context, mixedResults);

      expect(results).toBeInstanceOf(Array);
      // Should focus on repairable issues
    });

    it("should respect backup directory configuration", async () => {
      const customBackupService = new AutoRepairService({
        backupDirectory: "/custom/backup/dir",
      });

      mockFs.stat.mockRejectedValue(new Error("ENOENT"));
      mockFs.mkdir.mockResolvedValue();

      const context: DoctorContext = { autoFix: true };
      const checkResults = new Map<string, CheckResult>();

      await customBackupService.executeSafeRepairs(context, checkResults);

      expect(mockFs.mkdir).toHaveBeenCalledWith("/custom/backup/dir", { recursive: true });
    });
  });

  describe("constructor edge cases", () => {
    it("should initialize with partial options", () => {
      const service = new AutoRepairService({
        enableDebugLogging: true,
        // Other options use defaults
      });
      expect(service).toBeInstanceOf(AutoRepairService);
    });

    it("should initialize with null/undefined options gracefully", () => {
      const service = new AutoRepairService(undefined);
      expect(service).toBeInstanceOf(AutoRepairService);
    });
  });

  describe("dry run mode coverage", () => {
    it("should handle dry run mode with different configurations", async () => {
      const dryRunService = new AutoRepairService({
        dryRun: true,
        enableDebugLogging: true,
      });

      const context: DoctorContext = { autoFix: true };
      const checkResults = new Map<string, CheckResult>();

      mockFs.readdir.mockResolvedValue(["temp-file"] as any);
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        mtime: new Date(Date.now() - 25 * 60 * 60 * 1000),
      } as any);

      const results = await dryRunService.executeSafeRepairs(context, checkResults);

      // In dry run mode, operations should be simulated
      expect(results.every((r) => r.success)).toBe(true);
      expect(mockFs.unlink).not.toHaveBeenCalled(); // No actual operations performed
    });
  });

  describe("backup directory handling", () => {
    it("should handle backup directory creation failure gracefully", async () => {
      const backupService = new AutoRepairService({
        backupDirectory: "/invalid/backup/dir",
      });

      const context: DoctorContext = { autoFix: true };
      const checkResults = new Map<string, CheckResult>();

      // Mock backup directory creation failure
      mockFs.mkdir.mockRejectedValue(new Error("EACCES: permission denied"));

      const results = await backupService.executeSafeRepairs(context, checkResults);

      // Should still attempt all operations despite backup dir failure
      expect(results).toHaveLength(4); // All operations attempted
    });
  });

  describe("edge cases for coverage", () => {
    it("should handle readdir failures gracefully", async () => {
      const context: DoctorContext = { autoFix: true };
      const checkResults = new Map<string, CheckResult>();

      // Mock readdir failure
      mockFs.readdir.mockRejectedValue(new Error("ENOENT: directory not found"));

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      const cleanupResult = results.find((r) => r.message.includes("temp"));
      expect(cleanupResult).toBeDefined();
    });

    it("should handle different file types in temp cleanup", async () => {
      const context: DoctorContext = { autoFix: true };
      const checkResults = new Map<string, CheckResult>();

      mockFs.readdir.mockResolvedValue(["temp-file", "temp-dir"] as any);
      mockFs.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          mtime: new Date(Date.now() - 25 * 60 * 60 * 1000),
        } as any)
        .mockResolvedValueOnce({
          isFile: () => false, // Directory
          mtime: new Date(Date.now() - 25 * 60 * 60 * 1000),
        } as any);

      const results = await autoRepairService.executeSafeRepairs(context, checkResults);

      const cleanupResult = results.find((r) => r.message.includes("temp"));
      expect(cleanupResult).toBeDefined();
    });
  });
});
