/**
 * AWS CLI doctor command for health checks and diagnostics
 *
 * Performs system validation including environment checks,
 * configuration validation, authentication status, and AWS service connectivity.
 * Provides auto-repair capabilities and interactive troubleshooting guidance.
 *
 */

import { Flags } from "@oclif/core";
import { getDiagnosticErrorGuidance } from "../lib/diagnostic-errors.js";
import { ApiError, formatError, TimeoutError } from "../lib/errors.js";
import { toSafeString } from "../lib/type-utilities.js";
import { AutoRepairService, type RepairResult } from "../services/doctor/auto-repair.js";
import { CheckRegistry } from "../services/doctor/check-registry.js";
import {
  CredentialValidationCheck,
  ProfileSwitchCheck,
  SsoTokenExpiryCheck,
} from "../services/doctor/checks/authentication-checks.js";
import {
  ConfigFileExistsCheck,
  CredentialsFileCheck,
  ProfileValidationCheck,
} from "../services/doctor/checks/configuration-checks.js";
import {
  RegionAccessibilityCheck,
  ServiceEndpointCheck,
  StsCredentialCheck,
} from "../services/doctor/checks/connectivity-checks.js";
import {
  AwsCliInstallationCheck,
  NodeModulesCheck,
  NodeVersionCheck,
} from "../services/doctor/checks/environment-checks.js";
import { DoctorService, type DiagnosticSummary } from "../services/doctor/doctor-service.js";
import type { CheckStage, DoctorContext } from "../services/doctor/types.js";
import { BaseCommand } from "./base-command.js";

/**
 * Doctor command for system health checks
 *
 * Provides progressive validation across environment, configuration, authentication,
 * and connectivity stages with detailed diagnostics and auto-repair capabilities.
 * Integrates with existing authentication infrastructure for validation.
 *
 * @public
 */
export default class DoctorCommand extends BaseCommand {
  static override readonly description = "Run health checks and diagnostics";

  static override readonly summary =
    "Validate environment, configuration, authentication, and connectivity";

  static override readonly examples = [
    {
      description: "Run all diagnostic checks",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Run checks for a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "Run only environment checks",
      command: "<%= config.bin %> <%= command.id %> --category environment",
    },
    {
      description: "Run checks with detailed output",
      command: "<%= config.bin %> <%= command.id %> --detailed",
    },
    {
      description: "Enable automatic fixing of safe issues",
      command: "<%= config.bin %> <%= command.id %> --fix",
    },
    {
      description: "Interactive mode with guided repairs",
      command: "<%= config.bin %> <%= command.id %> --interactive",
    },
    {
      description: "Output results in JSON format",
      command: "<%= config.bin %> <%= command.id %> --json",
    },
    {
      description: "Run checks for specific profile with auto-fix",
      command: "<%= config.bin %> <%= command.id %> --profile staging --fix --detailed",
    },
  ];

  static override readonly flags = {
    profile: Flags.string({
      char: "p",
      description: "AWS profile name to check",
      helpValue: "PROFILE_NAME",
    }),

    interactive: Flags.boolean({
      char: "i",
      description: "Enable interactive repair mode",
      default: false,
    }),

    fix: Flags.boolean({
      description: "Automatically fix safe issues",
      default: false,
    }),

    json: Flags.boolean({
      description: "Output results in JSON format",
      default: false,
    }),

    category: Flags.string({
      description: "Run checks for specific category",
      options: ["environment", "configuration", "authentication", "connectivity"],
    }),

    detailed: Flags.boolean({
      char: "d",
      description: "Show detailed diagnostic information",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Doctor service for diagnostic operations
   */
  private doctorService!: DoctorService;

  /**
   * Check registry with all available checks
   */
  private checkRegistry!: CheckRegistry;

  /**
   * Auto-repair service for issue resolution
   */
  private autoRepairService!: AutoRepairService;

  /**
   * Execute the doctor command
   *
   * Performs diagnostic checks across all validation stages
   * with optional auto-repair capabilities and multiple output formats.
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(DoctorCommand);

    let summary: DiagnosticSummary;
    try {
      this.initializeCheckRegistry();

      this.doctorService = new DoctorService(this.checkRegistry, {
        enableDebugLogging: flags.verbose,
        enableProgressIndicators: !flags.json,
        networkTimeout: 30_000,
        maxConcurrency: 5,
      });

      if (flags.fix || flags.interactive) {
        this.autoRepairService = new AutoRepairService({
          enableDebugLogging: flags.verbose,
          dryRun: false,
        });
      }

      const context: DoctorContext = {
        ...(flags.profile && { profile: flags.profile }),
        detailed: flags.detailed,
        interactive: flags.interactive,
        autoFix: flags.fix,
      };

      summary = await this.executeDiagnostics(context, flags.category as CheckStage | undefined);

      let repairResults: RepairResult[] = [];
      if (
        (flags.fix || flags.interactive) &&
        (summary.failedChecks > 0 || summary.warningChecks > 0)
      ) {
        repairResults = await this.executeRepairs(
          context,
          summary,
          flags.fix,
          flags.interactive,
          flags.json,
        );
      }

      if (flags.json) {
        this.outputJsonResults(summary, repairResults);
      } else {
        this.outputTableResults(summary, flags.detailed);
        if (repairResults.length > 0) {
          this.outputRepairResults(repairResults);
        }
      }
    } catch (error) {
      this.handleDiagnosticError(error, flags.verbose);
      return;
    }

    this.exitWithAppropriateCode(summary);
  }

  /**
   * Initialize check registry with all available diagnostic checks
   *
   * Registers checks for all validation stages following the progressive
   * validation model with proper dependency relationships.
   *
   * @internal
   */
  private initializeCheckRegistry(): void {
    this.checkRegistry = new CheckRegistry();

    this.checkRegistry.register(new NodeVersionCheck());
    this.checkRegistry.register(new AwsCliInstallationCheck());
    this.checkRegistry.register(new NodeModulesCheck());

    this.checkRegistry.register(new ConfigFileExistsCheck());
    this.checkRegistry.register(new ProfileValidationCheck());
    this.checkRegistry.register(new CredentialsFileCheck());

    this.checkRegistry.register(new CredentialValidationCheck());
    this.checkRegistry.register(new SsoTokenExpiryCheck());
    this.checkRegistry.register(new ProfileSwitchCheck());

    this.checkRegistry.register(new StsCredentialCheck());
    this.checkRegistry.register(new ServiceEndpointCheck());
    this.checkRegistry.register(new RegionAccessibilityCheck());
  }

  /**
   * Execute diagnostic checks with stage filtering
   *
   * @param context - Execution context with configuration options
   * @param categoryFilter - Optional stage filter for targeted diagnostics
   * @returns Promise resolving to diagnostic summary
   * @internal
   */
  private async executeDiagnostics(
    context: DoctorContext,
    categoryFilter?: CheckStage,
  ): Promise<DiagnosticSummary> {
    if (categoryFilter) {
      const startTime = Date.now();
      const results = await this.doctorService.executeStage(categoryFilter, context);
      const executionTime = Date.now() - startTime;
      return this.doctorService.createDiagnosticSummary(results, executionTime);
    }

    return await this.doctorService.runDiagnostics(context);
  }

  /**
   * Execute repair operations based on diagnostic results
   *
   * @param context - Execution context
   * @param summary - Diagnostic summary with issues to repair
   * @param autoFix - Whether to execute safe auto-repairs
   * @param interactive - Whether to execute interactive repairs
   * @param jsonMode - Whether JSON output mode is enabled
   * @returns Promise resolving to repair results
   * @internal
   */
  private async executeRepairs(
    context: DoctorContext,
    summary: DiagnosticSummary,
    autoFix: boolean,
    interactive: boolean,
    jsonMode: boolean,
  ): Promise<RepairResult[]> {
    const allRepairResults: RepairResult[] = [];

    try {
      if (autoFix) {
        if (!jsonMode) {
          this.log("\nExecuting safe auto-repair operations...");
        }
        const safeRepairs = await this.autoRepairService.executeSafeRepairs(
          context,
          summary.results,
        );
        allRepairResults.push(...safeRepairs);
      }

      if (interactive) {
        if (!jsonMode) {
          this.log("\nStarting interactive repair mode...");
        }
        const interactiveRepairs = await this.autoRepairService.executeInteractiveRepairs(
          context,
          summary.results,
        );
        allRepairResults.push(...interactiveRepairs);
      }

      return allRepairResults;
    } catch (error) {
      if (!jsonMode) {
        this.log(
          `\nRepair execution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return allRepairResults;
    }
  }

  /**
   * Output diagnostic results in JSON format
   *
   * @param summary - Diagnostic execution summary
   * @param repairResults - Optional repair operation results
   * @internal
   */
  private outputJsonResults(summary: DiagnosticSummary, repairResults?: RepairResult[]): void {
    const jsonOutput = {
      summary: {
        totalChecks: summary.totalChecks,
        passedChecks: summary.passedChecks,
        warningChecks: summary.warningChecks,
        failedChecks: summary.failedChecks,
        overallStatus: summary.overallStatus,
        executionTime: summary.executionTime,
      },
      results: Object.fromEntries(
        [...summary.results.entries()].map(([checkId, result]) => [
          checkId,
          {
            status: result.status,
            message: result.message,
            details: result.details || {},
            remediation: result.remediation,
            duration: result.duration,
          },
        ]),
      ),
      ...(repairResults &&
        repairResults.length > 0 && {
          repairs: {
            totalRepairs: repairResults.length,
            successfulRepairs: repairResults.filter((r) => r.success).length,
            failedRepairs: repairResults.filter((r) => !r.success).length,
            results: repairResults.map((repair) => ({
              success: repair.success,
              message: repair.message,
              details: repair.details || {},
              operations: repair.operations || [],
              backupPath: repair.backupPath,
            })),
          },
        }),
    };

    this.log(JSON.stringify(jsonOutput, undefined, 2));
  }

  /**
   * Output diagnostic results in table format
   *
   * @param summary - Diagnostic execution summary
   * @param detailed - Whether to show detailed information
   * @internal
   */
  private outputTableResults(summary: DiagnosticSummary, detailed: boolean): void {
    // Overall summary
    this.log("=== Diagnostic Summary ===");
    this.log(`Overall Status: ${this.formatOverallStatus(summary.overallStatus)}`);
    this.log(`Total Checks: ${summary.totalChecks}`);
    this.log(
      `Passed: ${summary.passedChecks} | Warnings: ${summary.warningChecks} | Failed: ${summary.failedChecks}`,
    );
    this.log(`Execution Time: ${Math.round(summary.executionTime / 1000)}s`);
    this.log("");

    const stages: CheckStage[] = ["environment", "configuration", "authentication", "connectivity"];

    for (const stage of stages) {
      this.outputStageResults(stage, summary, detailed);
    }

    this.outputSummaryGuidance(summary);
  }

  /**
   * Output results for a specific validation stage
   *
   * @param stage - Validation stage to display
   * @param summary - Diagnostic execution summary
   * @param detailed - Whether to show detailed information
   * @internal
   */
  private outputStageResults(
    stage: CheckStage,
    summary: DiagnosticSummary,
    detailed: boolean,
  ): void {
    const stageChecks = this.checkRegistry.getChecksForStage(stage);
    const stageResults = stageChecks
      .map((check) => ({ check, result: summary.results.get(check.id) }))
      .filter(({ result }) => result !== undefined);

    if (stageResults.length === 0) return;

    this.log(`=== ${this.capitalizeStage(stage)} Checks ===`);

    for (const { check, result } of stageResults) {
      if (!result) continue;

      const status = this.formatCheckStatus(result.status);
      this.log(`${status} ${check.name}: ${result.message}`);

      if (detailed && result.details) {
        const details = Object.entries(result.details)
          .map(([key, value]) => `  ${key}: ${String(value)}`)
          .join("\n");
        if (details) {
          this.log(details);
        }
      }

      if (result.status !== "pass" && result.remediation) {
        this.log(`  ${result.remediation}`);
      }
    }

    this.log("");
  }

  /**
   * Output summary guidance based on diagnostic results
   *
   * @param summary - Diagnostic execution summary
   * @internal
   */
  private outputSummaryGuidance(summary: DiagnosticSummary): void {
    if (summary.overallStatus === "pass") {
      this.log("All checks passed! Your AWS CLI environment is properly configured.");
      return;
    }

    this.log("=== Recommended Actions ===");

    if (summary.failedChecks > 0) {
      this.log("• Address failed checks first as they may prevent proper operation");
      this.log("• Use --interactive flag for guided repair assistance");
      this.log("• Use --fix flag to automatically resolve safe issues");
    }

    if (summary.warningChecks > 0) {
      this.log("• Review warning checks for potential improvements");
      this.log("• Consider addressing warnings to ensure optimal performance");
    }

    this.log("• Run with --detailed flag for more diagnostic information");
    this.log("• Use --category flag to focus on specific areas");
  }

  /**
   * Output repair operation results
   *
   * @param repairResults - Results from repair operations
   * @internal
   */
  private outputRepairResults(repairResults: RepairResult[]): void {
    this.log("\n=== Repair Results ===");

    const successfulRepairs = repairResults.filter((r) => r.success);
    const failedRepairs = repairResults.filter((r) => !r.success);

    this.log(`Total Repairs: ${repairResults.length}`);
    this.log(`Successful: ${successfulRepairs.length} | Failed: ${failedRepairs.length}`);
    this.log("");

    for (const result of repairResults) {
      const status = result.success ? "✓" : "✗";
      this.log(`${status} ${result.message}`);

      if (result.operations && result.operations.length > 0) {
        for (const operation of result.operations) {
          this.log(`  • ${operation}`);
        }
      }

      if (result.backupPath) {
        this.log(`  Backup: ${result.backupPath}`);
      }
    }

    if (failedRepairs.length > 0) {
      this.log("\nSome repairs failed. Review the errors above and consider manual intervention.");
    } else if (successfulRepairs.length > 0) {
      this.log("\nAll repairs completed successfully!");
    }
  }

  /**
   * Handle diagnostic execution errors
   *
   * @param error - Error that occurred during execution
   * @param verbose - Whether to show verbose error information
   * @internal
   */
  private handleDiagnosticError(error: unknown, verbose: boolean): void {
    // Handle timeout-specific errors with specialized guidance
    if (error instanceof TimeoutError) {
      const guidance = getDiagnosticErrorGuidance(error);
      this.error(
        `Diagnostic execution failed: Network operation timed out after ${toSafeString(error.metadata.timeoutMs)}ms\n` +
          `Operation: ${toSafeString(error.metadata.operation)}\n\n${guidance}`,
        { exit: 1 },
      );
    } else if (error instanceof ApiError) {
      const guidance = getDiagnosticErrorGuidance(error);
      this.error(
        `Diagnostic execution failed: AWS API error (${toSafeString(error.metadata.httpStatusCode)})\n` +
          `Service: ${toSafeString(error.metadata.apiName)}\n` +
          `Operation: ${toSafeString(error.metadata.operation)}\n\n${guidance}`,
        { exit: 1 },
      );
    } else if (error instanceof Error) {
      const errorMessage = formatError(error, verbose);
      const guidance = getDiagnosticErrorGuidance(error);

      this.error(`Diagnostic execution failed: ${errorMessage}\n\n${guidance}`, {
        exit: 1,
      });
    } else {
      this.error(`Diagnostic execution failed: ${String(error)}`, { exit: 1 });
    }
  }

  /**
   * Exit with appropriate code based on diagnostic results
   *
   * @param summary - Diagnostic execution summary
   * @internal
   */
  private exitWithAppropriateCode(summary: DiagnosticSummary): void {
    if (summary.overallStatus === "fail") {
      this.exit(1);
    }
  }

  /**
   * Format overall status for display
   *
   * @param status - Overall diagnostic status
   * @returns Formatted status string
   * @internal
   */
  private formatOverallStatus(status: string): string {
    switch (status) {
      case "pass": {
        return "✓ All Checks Passed";
      }
      case "warn": {
        return "Some Issues Found";
      }
      case "fail": {
        return "✗ Critical Issues Found";
      }
      default: {
        return status;
      }
    }
  }

  /**
   * Format individual check status for display
   *
   * @param status - Check execution status
   * @returns Formatted status indicator
   * @internal
   */
  private formatCheckStatus(status: string): string {
    switch (status) {
      case "pass": {
        return "✓";
      }
      case "warn": {
        return "⚠";
      }
      case "fail": {
        return "✗";
      }
      default: {
        return "?";
      }
    }
  }

  /**
   * Capitalize stage name for display
   *
   * @param stage - Validation stage
   * @returns Capitalized stage name
   * @internal
   */
  private capitalizeStage(stage: CheckStage): string {
    return stage.charAt(0).toUpperCase() + stage.slice(1);
  }
}
