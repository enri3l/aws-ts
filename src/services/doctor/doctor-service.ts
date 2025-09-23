/**
 * Doctor service for comprehensive system health checks and diagnostics
 *
 * Orchestrates progressive validation stages by coordinating existing services
 * for environment, configuration, authentication, and connectivity checks.
 * Provides auto-repair capabilities with safety-first backup patterns.
 *
 */

import { Listr } from "listr2";
import { AuthService } from "../auth-service.js";
import { CredentialService } from "../credential-service.js";
import { ProfileManager } from "../profile-manager.js";
import { TokenManager } from "../token-manager.js";
import type {
  CheckResult,
  CheckStage,
  CheckStatus,
  DoctorContext,
  DoctorServiceOptions,
  ICheck,
  ICheckRegistry,
} from "./types.js";

/**
 * Task interface for listr2 progress indication
 * @internal
 */
interface DiagnosticTask {
  title: string;
  task: () => Promise<CheckResult>;
}

/**
 * Diagnostic execution summary
 *
 * @public
 */
export interface DiagnosticSummary {
  /**
   * Total number of checks executed
   */
  readonly totalChecks: number;

  /**
   * Number of checks that passed
   */
  readonly passedChecks: number;

  /**
   * Number of checks with warnings
   */
  readonly warningChecks: number;

  /**
   * Number of checks that failed
   */
  readonly failedChecks: number;

  /**
   * Overall diagnostic status
   */
  readonly overallStatus: CheckStatus;

  /**
   * Detailed results for each check
   */
  readonly results: Map<string, CheckResult>;

  /**
   * Total execution time in milliseconds
   */
  readonly executionTime: number;
}

/**
 * Doctor service for system health validation and auto-repair
 *
 * Provides comprehensive diagnostic capabilities through progressive validation
 * stages with integration to existing authentication infrastructure. Supports
 * both automated and interactive repair modes with backup-first safety patterns.
 *
 * @public
 */
export class DoctorService {
  private readonly authService: AuthService;
  private readonly credentialService: CredentialService;
  private readonly profileManager: ProfileManager;
  private readonly tokenManager: TokenManager;
  private readonly checkRegistry: ICheckRegistry;
  private readonly options: Required<DoctorServiceOptions>;

  /**
   * Create a new doctor service instance
   *
   * @param checkRegistry - Registry containing all available diagnostic checks
   * @param options - Configuration options for the service
   */
  constructor(checkRegistry: ICheckRegistry, options: DoctorServiceOptions = {}) {
    this.options = {
      authService: {},
      profileManager: {},
      tokenManager: {},
      credentialService: {},
      enableDebugLogging: false,
      enableProgressIndicators:
        process.env.NODE_ENV !== "test" && !process.env.CI && !process.env.VITEST,
      networkTimeout: 30_000,
      maxConcurrency: 5,
      ...options,
    };

    this.checkRegistry = checkRegistry;

    this.authService = new AuthService({
      enableProgressIndicators: false, // Disable UI for diagnostic checks
      enableDebugLogging: this.options.enableDebugLogging,
      ...this.options.authService,
    });

    this.credentialService = new CredentialService({
      enableDebugLogging: this.options.enableDebugLogging,
      ...this.options.credentialService,
    });

    this.profileManager = new ProfileManager({
      enableDebugLogging: this.options.enableDebugLogging,
      ...this.options.profileManager,
    });

    this.tokenManager = new TokenManager({
      enableDebugLogging: this.options.enableDebugLogging,
      ...this.options.tokenManager,
    });
  }

  /**
   * Execute comprehensive diagnostic checks across all stages
   *
   * Runs progressive validation from environment through connectivity stages,
   * providing detailed results and optional auto-repair capabilities.
   *
   * @param context - Execution context with configuration options
   * @returns Promise resolving to complete diagnostic summary
   * @throws When diagnostic execution fails unexpectedly
   */
  async runDiagnostics(context: DoctorContext): Promise<DiagnosticSummary> {
    const startTime = Date.now();
    const results = new Map<string, CheckResult>();

    try {
      const stages: CheckStage[] = [
        "environment",
        "configuration",
        "authentication",
        "connectivity",
      ];

      for (const stage of stages) {
        const stageResults = await this.executeStage(stage, context);

        for (const [checkId, result] of stageResults.entries()) {
          results.set(checkId, result);
        }

        this.updateContextWithStageResults(context, stage, stageResults);

        if (this.shouldStopExecution(stage, stageResults)) {
          break;
        }
      }

      return this.createDiagnosticSummary(results, Date.now() - startTime);
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error(`Diagnostic execution failed: ${String(error)}`);
    }
  }

  /**
   * Execute checks for a specific validation stage
   *
   * @param stage - Validation stage to execute
   * @param context - Shared execution context
   * @returns Promise resolving to stage execution results
   * @throws When stage execution fails
   */
  async executeStage(stage: CheckStage, context: DoctorContext): Promise<Map<string, CheckResult>> {
    const checks = this.checkRegistry.getChecksForStage(stage);
    const results = new Map<string, CheckResult>();

    if (checks.length === 0) {
      return results;
    }

    const tasks = checks.map(
      (check): DiagnosticTask => ({
        title: check.name,
        task: () => this.executeCheck(check, context),
      }),
    );

    if (this.options.enableProgressIndicators) {
      const listr = new Listr(
        tasks.map((task) => ({
          title: task.title,
          task: async (context_, listrTask) => {
            const result = await task.task();
            results.set(checks.find((c) => c.name === task.title)!.id, result);

            if (result.status === "pass") {
              listrTask.title = `${task.title} ✓`;
            } else if (result.status === "warn") {
              listrTask.title = `${task.title} ⚠`;
            } else {
              listrTask.title = `${task.title} ✗`;
            }
          },
        })),
        {
          concurrent: Math.min(this.options.maxConcurrency, checks.length),
          exitOnError: false,
        },
      );

      await listr.run();
    } else {
      for (const task of tasks) {
        const check = checks.find((c) => c.name === task.title)!;
        const result = await task.task();
        results.set(check.id, result);
      }
    }

    return results;
  }

  /**
   * Execute an individual diagnostic check with error handling
   *
   * @param check - Check implementation to execute
   * @param context - Shared execution context
   * @returns Promise resolving to check execution result
   * @internal
   */
  private async executeCheck(check: ICheck, context: DoctorContext): Promise<CheckResult> {
    const startTime = Date.now();

    try {
      const result = await check.execute(context);

      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: "fail",
        message: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
        remediation: "Review system logs and retry the operation",
      };
    }
  }

  /**
   * Update execution context with stage results
   *
   * @param context - Mutable execution context
   * @param stage - Completed validation stage
   * @param _results - Stage execution results
   * @internal
   */
  private updateContextWithStageResults(
    context: DoctorContext,
    stage: CheckStage,
    // Results parameter reserved for future stage-specific context updates
    // Currently unused but part of the method signature for future extensibility
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _results: Map<string, CheckResult>,
  ): void {
    switch (stage) {
      case "environment": {
        break;
      }
      case "configuration": {
        break;
      }
      case "authentication": {
        break;
      }
      case "connectivity": {
        break;
      }
    }
  }

  /**
   * Determine if execution should stop based on stage results
   *
   * @param stage - Completed validation stage
   * @param results - Stage execution results
   * @returns True if execution should stop due to critical failures
   * @internal
   */
  private shouldStopExecution(stage: CheckStage, results: Map<string, CheckResult>): boolean {
    if (stage === "environment") {
      return [...results.values()].some((result) => result.status === "fail");
    }

    return false;
  }

  /**
   * Create diagnostic summary from execution results
   *
   * @param results - All check execution results
   * @param executionTime - Total execution time in milliseconds
   * @returns Comprehensive diagnostic summary
   * @public
   */
  createDiagnosticSummary(
    results: Map<string, CheckResult>,
    executionTime: number,
  ): DiagnosticSummary {
    const totalChecks = results.size;
    let passedChecks = 0;
    let warningChecks = 0;
    let failedChecks = 0;

    for (const result of results.values()) {
      switch (result.status) {
        case "pass": {
          passedChecks++;
          break;
        }
        case "warn": {
          warningChecks++;
          break;
        }
        case "fail": {
          failedChecks++;
          break;
        }
      }
    }

    let overallStatus: CheckStatus = "pass";
    if (failedChecks > 0) {
      overallStatus = "fail";
    } else if (warningChecks > 0) {
      overallStatus = "warn";
    }

    return {
      totalChecks,
      passedChecks,
      warningChecks,
      failedChecks,
      overallStatus,
      results,
      executionTime,
    };
  }
}
