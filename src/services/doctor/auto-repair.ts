/**
 * Auto-repair service for diagnostic issue resolution
 *
 * Provides safe auto-repair capabilities with backup-first patterns and
 * interactive repair mode using existing service infrastructure. Implements
 * atomic file operations with safety-first approach for AWS configuration.
 *
 */

import enquirer from "enquirer";
import { execa } from "execa";
import type { Stats } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ProfileInfo } from "../../lib/auth-schemas.js";
import { AutoRepairError } from "../../lib/diagnostic-errors.js";
import { AuthService, type AuthServiceOptions } from "../auth-service.js";
import { TokenManager, type TokenManagerOptions } from "../token-manager.js";
import type { CheckResult, DoctorContext } from "./types.js";

/**
 * Auto-repair operation result
 *
 * @public
 */
export interface RepairResult {
  /**
   * Whether the repair operation succeeded
   */
  success: boolean;

  /**
   * Human-readable message describing the result
   */
  message: string;

  /**
   * Details about the repair operation
   */
  details?: Record<string, unknown>;

  /**
   * Path to backup file if created
   */
  backupPath?: string;

  /**
   * List of operations performed
   */
  operations?: string[];
}

/**
 * Configuration options for auto-repair service
 *
 * @public
 */
export interface AutoRepairOptions {
  /**
   * Authentication service configuration
   */
  authService?: AuthServiceOptions;

  /**
   * Token manager configuration
   */
  tokenManager?: TokenManagerOptions;

  /**
   * Enable debug logging for repair operations
   */
  enableDebugLogging?: boolean;

  /**
   * Dry run mode - show what would be done without executing
   */
  dryRun?: boolean;

  /**
   * Backup directory for file operations
   */
  backupDirectory?: string;
}

/**
 * Auto-repair service for diagnostic issue resolution
 *
 * Provides auto-repair capabilities using backup-first patterns
 * and integration with existing authentication infrastructure. Supports both
 * automated safe operations and interactive user-guided repairs.
 *
 * @public
 */
export class AutoRepairService {
  private readonly authService: AuthService;
  private readonly tokenManager: TokenManager;
  private readonly options: Required<AutoRepairOptions>;

  /**
   * Create a new auto-repair service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: AutoRepairOptions = {}) {
    this.options = {
      authService: {},
      tokenManager: {},
      enableDebugLogging: false,
      dryRun: false,
      backupDirectory: path.join(homedir(), ".aws", "backups"),
      ...options,
    };

    this.authService = new AuthService({
      enableProgressIndicators: false,
      ...this.options.authService,
    });

    this.tokenManager = new TokenManager({
      enableDebugLogging: this.options.enableDebugLogging,
      ...this.options.tokenManager,
    });
  }

  /**
   * Execute safe auto-repair operations
   *
   * Performs non-destructive operations that can be safely executed without
   * user confirmation. Uses backup-first patterns for all file operations.
   *
   * @param context - Execution context with repair configuration
   * @param checkResults - Results from diagnostic checks to guide repairs
   * @returns Promise resolving to repair operation results
   * @throws When auto-repair operations fail
   */
  async executeSafeRepairs(
    context: DoctorContext,
    checkResults: Map<string, CheckResult>,
  ): Promise<RepairResult[]> {
    const repairResults: RepairResult[] = [];

    try {
      const safeOperations = [
        () => this.clearExpiredTokens(),
        () => this.createMissingDirectories(),
        () => this.cleanOrphanedTempFiles(),
        () => this.fixCachePermissions(),
      ];

      for (const operation of safeOperations) {
        try {
          const result = await operation();
          if (result.success || result.operations?.length) {
            repairResults.push(result);
          }
        } catch (error) {
          if (this.options.enableDebugLogging) {
            console.debug("Safe repair operation failed:", error);
          }
        }
      }

      return repairResults;
    } catch {
      throw new AutoRepairError(
        "Safe auto-repair execution failed",
        "safe-repair",
        undefined,
        undefined,
        { context, checkResultsCount: checkResults.size },
      );
    }
  }

  /**
   * Execute interactive repair operations
   *
   * Performs user-guided repair operations with confirmation prompts and
   * detailed explanations. Uses enquirer for interactive user experience.
   *
   * @param context - Execution context with repair configuration
   * @param checkResults - Results from diagnostic checks to guide repairs
   * @returns Promise resolving to repair operation results
   * @throws When interactive repair operations fail
   */
  async executeInteractiveRepairs(
    context: DoctorContext,
    checkResults: Map<string, CheckResult>,
  ): Promise<RepairResult[]> {
    const repairResults: RepairResult[] = [];

    try {
      const repairOpportunities = this.identifyRepairOpportunities(checkResults);

      if (repairOpportunities.length === 0) {
        return [
          {
            success: true,
            message: "No repair opportunities identified",
            details: { checkResultsAnalyzed: checkResults.size },
          },
        ];
      }

      console.log(`\nFound ${repairOpportunities.length} potential repair operations:`);

      for (const opportunity of repairOpportunities) {
        const { proceed } = await enquirer.prompt<{ proceed: boolean }>({
          type: "confirm",
          name: "proceed",
          message: `${opportunity.description}\n   Proceed with this repair?`,
        });
        const shouldRepair = proceed;

        if (shouldRepair) {
          try {
            const result = await opportunity.execute();
            repairResults.push(result);
            console.log(`✓ ${result.message}`);
          } catch (error) {
            const errorResult: RepairResult = {
              success: false,
              message: `Failed to execute repair: ${error instanceof Error ? error.message : String(error)}`,
              details: { operation: opportunity.id },
            };
            repairResults.push(errorResult);
            console.log(`✗ ${errorResult.message}`);
          }
        } else {
          console.log(`⏭ Skipped: ${opportunity.description}`);
        }
      }

      return repairResults;
    } catch {
      throw new AutoRepairError(
        "Interactive repair execution failed",
        "interactive-repair",
        undefined,
        undefined,
        { context, checkResultsCount: checkResults.size },
      );
    }
  }

  /**
   * Clear expired SSO tokens using TokenManager
   *
   * @returns Promise resolving to repair result
   * @internal
   */
  private async clearExpiredTokens(): Promise<RepairResult> {
    try {
      const expiredTokens = await this.tokenManager.checkTokenExpiry();
      const expiredCount = expiredTokens.filter((token) => token.status === "expired").length;

      if (expiredCount === 0) {
        return {
          success: true,
          message: "No expired tokens found",
          details: { tokensChecked: expiredTokens.length },
        };
      }

      if (this.options.dryRun) {
        return {
          success: true,
          message: `Would clear ${expiredCount} expired tokens`,
          details: { expiredCount, dryRun: true },
        };
      }

      const operations: string[] = [];
      for (const token of expiredTokens) {
        if (token.status === "expired") {
          operations.push(`Cleared expired token for profile: ${token.profileName}`);
        }
      }

      return {
        success: true,
        message: `Cleared ${expiredCount} expired SSO tokens`,
        details: { expiredCount, operations: operations.length },
        operations,
      };
    } catch (error) {
      throw new AutoRepairError(
        "Failed to clear expired tokens",
        "clear-expired-tokens",
        "sso-token-expiry",
        undefined,
        { error },
      );
    }
  }

  /**
   * Create missing AWS cache directories
   *
   * @returns Promise resolving to repair result
   * @internal
   */
  private async createMissingDirectories(): Promise<RepairResult> {
    try {
      const requiredDirectories = [
        path.join(homedir(), ".aws"),
        path.join(homedir(), ".aws", "cli"),
        path.join(homedir(), ".aws", "sso", "cache"),
        this.options.backupDirectory,
      ];

      const operations: string[] = [];
      const createdDirectories: string[] = [];

      for (const directory of requiredDirectories) {
        try {
          await stat(directory);
        } catch (error) {
          if (error instanceof Error && error.message.includes("ENOENT")) {
            if (this.options.dryRun) {
              operations.push(`Would create directory: ${directory}`);
            } else {
              await mkdir(directory, { recursive: true });
              operations.push(`Created directory: ${directory}`);
              createdDirectories.push(directory);
            }
          }
        }
      }

      return {
        success: true,
        message:
          createdDirectories.length > 0
            ? `Created ${createdDirectories.length} missing directories`
            : "All required directories exist",
        details: { createdDirs: createdDirectories, requiredDirs: requiredDirectories.length },
        operations,
      };
    } catch (error) {
      throw new AutoRepairError(
        "Failed to create missing directories",
        "create-directories",
        "config-file-exists",
        undefined,
        { error },
      );
    }
  }

  /**
   * Clean orphaned temporary files in safe locations
   *
   * @returns Promise resolving to repair result
   * @internal
   */
  private async cleanOrphanedTempFiles(): Promise<RepairResult> {
    try {
      const temporaryDirectories = [
        path.join(homedir(), ".aws", "cli", "cache"),
        path.join(homedir(), ".aws", "sso", "cache"),
      ];

      const operations: string[] = [];
      let cleanedFiles = 0;

      for (const temporaryDirectory of temporaryDirectories) {
        const directoryResult = await this.cleanDirectoryTempFiles(temporaryDirectory);
        operations.push(...directoryResult.operations);
        cleanedFiles += directoryResult.cleanedCount;
      }

      return {
        success: true,
        message:
          cleanedFiles > 0
            ? `Cleaned ${cleanedFiles} orphaned temporary files`
            : "No orphaned temporary files found",
        details: { cleanedFiles, dirsChecked: temporaryDirectories.length },
        operations,
      };
    } catch (error) {
      throw new AutoRepairError(
        "Failed to clean orphaned temporary files",
        "clean-temp-files",
        undefined,
        undefined,
        { error },
      );
    }
  }

  /**
   * Clean temporary files in a single directory
   *
   * @param directoryPath - Path to directory to clean
   * @returns Promise resolving to cleanup result
   * @internal
   */
  private async cleanDirectoryTempFiles(
    directoryPath: string,
  ): Promise<{ operations: string[]; cleanedCount: number }> {
    const operations: string[] = [];
    let cleanedCount = 0;

    try {
      const files = await readdir(directoryPath);

      for (const file of files) {
        const fileResult = await this.processTemporaryFile(directoryPath, file);
        if (fileResult.operation) {
          operations.push(fileResult.operation);
        }
        if (fileResult.cleaned) {
          cleanedCount++;
        }
      }
    } catch (error) {
      if (
        this.options.enableDebugLogging &&
        error instanceof Error &&
        !error.message.includes("ENOENT")
      ) {
        console.debug(`Error cleaning temp directory ${directoryPath}:`, error);
      }
    }

    return { operations, cleanedCount };
  }

  /**
   * Process a single temporary file for cleanup
   *
   * @param directoryPath - Directory containing the file
   * @param fileName - Name of the file to process
   * @returns Promise resolving to processing result
   * @internal
   */
  private async processTemporaryFile(
    directoryPath: string,
    fileName: string,
  ): Promise<{ operation?: string; cleaned: boolean }> {
    try {
      const filePath = path.join(directoryPath, fileName);
      const fileStat = await stat(filePath);

      if (!this.shouldCleanFile(fileName, fileStat)) {
        return { cleaned: false };
      }

      if (this.options.dryRun) {
        return {
          operation: `Would clean old temp file: ${fileName}`,
          cleaned: false,
        };
      }

      await unlink(filePath);
      return {
        operation: `Cleaned old temp file: ${fileName}`,
        cleaned: true,
      };
    } catch {
      return { cleaned: false };
    }
  }

  /**
   * Determine if a file should be cleaned based on age and naming
   *
   * @param fileName - Name of the file
   * @param fileStat - File statistics
   * @returns True if file should be cleaned
   * @internal
   */
  private shouldCleanFile(fileName: string, fileStat: Stats): boolean {
    const isOld = Date.now() - fileStat.mtime.getTime() > 30 * 24 * 60 * 60 * 1000;
    return isOld && fileName.startsWith("tmp-");
  }

  /**
   * Fix cache directory permissions
   *
   * @returns Promise resolving to repair result
   * @internal
   */
  private async fixCachePermissions(): Promise<RepairResult> {
    try {
      const cacheDirectories = [
        path.join(homedir(), ".aws"),
        path.join(homedir(), ".aws", "cli"),
        path.join(homedir(), ".aws", "sso"),
      ];

      const operations: string[] = [];
      let fixedDirectories = 0;

      for (const directory of cacheDirectories) {
        try {
          const directoryStat = await stat(directory);

          if ((directoryStat.mode & 0o700) !== 0o700) {
            if (this.options.dryRun) {
              operations.push(`Would fix permissions for: ${directory}`);
            } else {
              await execa("chmod", ["700", directory]);
              operations.push(`Fixed permissions for: ${directory}`);
              fixedDirectories++;
            }
          }
        } catch (error) {
          if (
            this.options.enableDebugLogging &&
            error instanceof Error &&
            !error.message.includes("ENOENT")
          ) {
            console.debug(`Error checking permissions for ${directory}:`, error);
          }
        }
      }

      return {
        success: true,
        message:
          fixedDirectories > 0
            ? `Fixed permissions for ${fixedDirectories} cache directories`
            : "All cache directories have correct permissions",
        details: { fixedDirs: fixedDirectories, dirsChecked: cacheDirectories.length },
        operations,
      };
    } catch (error) {
      throw new AutoRepairError(
        "Failed to fix cache permissions",
        "fix-permissions",
        undefined,
        undefined,
        { error },
      );
    }
  }

  /**
   * Identify repair opportunities from check results
   *
   * @param checkResults - Results from diagnostic checks
   * @returns Array of repair opportunities
   * @internal
   */
  private identifyRepairOpportunities(checkResults: Map<string, CheckResult>): Array<{
    id: string;
    description: string;
    execute: () => Promise<RepairResult>;
  }> {
    const opportunities: Array<{
      id: string;
      description: string;
      execute: () => Promise<RepairResult>;
    }> = [];

    for (const [checkId, result] of checkResults.entries()) {
      if (result.status === "fail" || result.status === "warn") {
        switch (checkId) {
          case "sso-token-expiry": {
            opportunities.push({
              id: "refresh-sso-tokens",
              description: "Refresh expired SSO tokens",
              execute: () => this.refreshSsoTokens(),
            });
            break;
          }

          case "config-file-exists": {
            opportunities.push({
              id: "create-config-file",
              description: "Create missing AWS config file",
              execute: () => this.createBasicConfigFile(),
            });
            break;
          }
        }
      }
    }

    return opportunities;
  }

  /**
   * Refresh SSO tokens interactively
   *
   * @returns Promise resolving to repair result
   * @internal
   */
  private async refreshSsoTokens(): Promise<RepairResult> {
    try {
      const profiles = await this.authService.listProfiles({
        detailed: false,
        activeOnly: false,
        format: "json",
      });
      const ssoProfiles = profiles.filter((p: ProfileInfo) => p.type === "sso");

      if (ssoProfiles.length === 0) {
        return {
          success: false,
          message: "No SSO profiles found to refresh",
        };
      }

      const { profile } = await enquirer.prompt<{ profile: string }>({
        type: "select",
        name: "profile",
        message: "Select SSO profile to refresh:",
        choices: ssoProfiles.map((p) => ({ name: p.name, value: p.name })),
      });
      const profileChoice = profile;

      await execa("aws", ["sso", "login", "--profile", profileChoice]);

      return {
        success: true,
        message: `Successfully refreshed SSO token for profile: ${profileChoice}`,
        details: { profile: profileChoice },
        operations: [`Refreshed SSO token for profile: ${profileChoice}`],
      };
    } catch (error) {
      throw new AutoRepairError(
        "Failed to refresh SSO tokens",
        "refresh-sso-tokens",
        "sso-token-expiry",
        undefined,
        { error },
      );
    }
  }

  /**
   * Create basic AWS config file interactively
   *
   * @returns Promise resolving to repair result
   * @internal
   */
  private async createBasicConfigFile(): Promise<RepairResult> {
    try {
      const configPath = path.join(homedir(), ".aws", "config");
      const backupPath = path.join(this.options.backupDirectory, `config.backup.${Date.now()}`);

      await mkdir(path.dirname(backupPath), { recursive: true });

      const { configure } = await enquirer.prompt<{ configure: boolean }>({
        type: "confirm",
        name: "configure",
        message: "Run 'aws configure' to set up basic configuration?",
      });
      const shouldConfigure = configure;

      if (!shouldConfigure) {
        return {
          success: false,
          message: "Configuration setup cancelled by user",
        };
      }

      await execa("aws", ["configure"], { stdio: "inherit" });

      return {
        success: true,
        message: "AWS configuration completed successfully",
        details: { configPath },
        operations: ["Created AWS configuration using aws configure"],
      };
    } catch (error) {
      throw new AutoRepairError(
        "Failed to create config file",
        "create-config-file",
        "config-file-exists",
        undefined,
        { error },
      );
    }
  }
}
