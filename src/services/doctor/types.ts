/**
 * @module types
 * Type definitions for doctor command system
 *
 * Provides interfaces and types for health checks, diagnostics, and validation
 * operations. Integrates with existing service layer patterns for consistency
 * and follows dependency injection patterns established in the codebase.
 *
 */

import type { AuthServiceOptions } from "../auth-service.js";
import type { CredentialServiceOptions } from "../credential-service.js";
import type { ProfileManagerOptions } from "../profile-manager.js";
import type { TokenManagerOptions } from "../token-manager.js";

/**
 * Validation stage for progressive check execution
 *
 * Stages are executed sequentially with dependency relationships:
 * - Environment: Basic system requirements (parallel execution)
 * - Configuration: AWS configuration validation (depends on Environment)
 * - Authentication: Credential and token validation (depends on Configuration)
 * - Connectivity: AWS service endpoint validation (depends on Authentication)
 *
 * @public
 */
export type CheckStage = "environment" | "configuration" | "authentication" | "connectivity";

/**
 * Check execution result status
 *
 * - pass: Check completed successfully
 * - warn: Check completed with warnings or non-critical issues
 * - fail: Check failed with critical issues requiring attention
 *
 * @public
 */
export type CheckStatus = "pass" | "warn" | "fail";

/**
 * Result of executing a diagnostic check
 *
 * Provides structured output for individual check operations including
 * status, messaging, and optional remediation guidance for failed checks.
 *
 * @public
 */
export interface CheckResult {
  /**
   * Execution status of the check
   */
  readonly status: CheckStatus;

  /**
   * Human-readable result message
   */
  readonly message: string;

  /**
   * Additional check-specific details
   */
  readonly details?: Record<string, unknown>;

  /**
   * Remediation guidance for failed or warning checks
   */
  readonly remediation?: string;

  /**
   * Check execution duration in milliseconds
   */
  readonly duration?: number;
}

/**
 * Shared context for check execution
 *
 * Provides access to validated information from previous stages and
 * shared configuration to avoid duplicate validation operations.
 *
 * @public
 */
export interface DoctorContext {
  /**
   * Active AWS profile name
   */
  readonly profile?: string;

  /**
   * Environment validation results from previous stage
   */
  readonly environment?: {
    nodeVersion: string;
    awsCliVersion?: string;
    nodeModulesExists: boolean;
  };

  /**
   * Configuration validation results from previous stage
   */
  readonly configuration?: {
    configFileExists: boolean;
    credentialsFileExists: boolean;
    profilesDiscovered: string[];
  };

  /**
   * Authentication validation results from previous stage
   */
  readonly authentication?: {
    credentialsValid: boolean;
    tokenValid: boolean;
    activeProfile: string;
  };

  /**
   * Enable detailed diagnostic output
   */
  readonly detailed?: boolean;

  /**
   * Enable interactive repair mode
   */
  readonly interactive?: boolean;

  /**
   * Enable automatic fix mode
   */
  readonly autoFix?: boolean;
}

/**
 * Interface for diagnostic check implementations
 *
 * Defines the contract for individual health check operations that can be
 * executed as part of the doctor command validation pipeline.
 *
 * @public
 */
export interface ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id: string;

  /**
   * Human-readable name for this check
   */
  readonly name: string;

  /**
   * Description of what this check validates
   */
  readonly description: string;

  /**
   * Validation stage this check belongs to
   */
  readonly stage: CheckStage;

  /**
   * Execute the diagnostic check
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with status and details
   * @throws When check execution fails unexpectedly
   */
  execute(context: DoctorContext): Promise<CheckResult>;
}

/**
 * Configuration options for doctor service
 *
 * Follows established dependency injection patterns from existing services
 * to enable consistent service integration and testing capabilities.
 *
 * @public
 */
export interface DoctorServiceOptions {
  /**
   * Authentication service configuration
   */
  authService?: AuthServiceOptions;

  /**
   * Profile manager configuration
   */
  profileManager?: ProfileManagerOptions;

  /**
   * Token manager configuration
   */
  tokenManager?: TokenManagerOptions;

  /**
   * Credential service configuration
   */
  credentialService?: CredentialServiceOptions;

  /**
   * Enable debug logging for diagnostic operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for check execution
   */
  enableProgressIndicators?: boolean;

  /**
   * Default timeout for network operations in milliseconds
   */
  networkTimeout?: number;

  /**
   * Maximum concurrent checks per stage
   */
  maxConcurrency?: number;
}

/**
 * Registry for managing available diagnostic checks
 *
 * Provides centralized registration and discovery of check implementations
 * with support for filtering by stage or category.
 *
 * @public
 */
export interface ICheckRegistry {
  /**
   * Register a new diagnostic check
   *
   * @param check - Check implementation to register
   * @throws When check ID conflicts with existing registration
   */
  register(check: ICheck): void;

  /**
   * Get all registered checks for a specific stage
   *
   * @param stage - Validation stage to filter by
   * @returns Array of checks for the specified stage
   */
  getChecksForStage(stage: CheckStage): readonly ICheck[];

  /**
   * Get a specific check by ID
   *
   * @param id - Unique check identifier
   * @returns Check implementation or undefined if not found
   */
  getCheck(id: string): ICheck | undefined;

  /**
   * Get all registered check IDs
   *
   * @returns Array of all registered check identifiers
   */
  getAllCheckIds(): readonly string[];
}
