/**
 * Diagnostic-specific error types for doctor command system
 *
 * Extends the base error hierarchy with diagnostic-specific error types
 * that provide structured error handling and user guidance for health check
 * and validation operations.
 *
 */

import type { CheckStage, CheckStatus } from "../services/doctor/types.js";
import { BaseError } from "./errors.js";

/**
 * Diagnostic error for health check and validation failures
 *
 * Used when diagnostic checks fail or encounter unexpected errors during
 * execution. Includes check-specific context and remediation guidance.
 *
 * @public
 */
export class DiagnosticError extends BaseError {
  /**
   * Create a new diagnostic error
   *
   * @param message - User-friendly diagnostic error message
   * @param checkId - Unique identifier of the check that failed
   * @param stage - Validation stage where the error occurred
   * @param severity - Severity level of the diagnostic issue
   * @param metadata - Additional diagnostic context
   */
  constructor(
    message: string,
    checkId?: string,
    stage?: CheckStage,
    severity?: CheckStatus,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "DIAGNOSTIC_ERROR", {
      checkId,
      stage,
      severity,
      ...metadata,
    });
  }
}

/**
 * Check execution error for individual check failures
 *
 * Used when specific diagnostic checks fail to execute properly due to
 * system issues, missing dependencies, or unexpected runtime conditions.
 *
 * @public
 */
export class CheckExecutionError extends BaseError {
  /**
   * Create a new check execution error
   *
   * @param message - User-friendly execution error message
   * @param checkId - Unique identifier of the check that failed to execute
   * @param stage - Validation stage where the execution failed
   * @param underlyingError - Original error that caused execution failure
   * @param metadata - Additional execution context
   */
  constructor(
    message: string,
    checkId: string,
    stage: CheckStage,
    underlyingError?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CHECK_EXECUTION_ERROR", {
      checkId,
      stage,
      underlyingError,
      ...metadata,
    });
  }
}

/**
 * Auto-repair error for failed repair operations
 *
 * Used when automatic repair operations fail or encounter issues during
 * execution. Includes repair context and safety guidance for manual resolution.
 *
 * @public
 */
export class AutoRepairError extends BaseError {
  /**
   * Create a new auto-repair error
   *
   * @param message - User-friendly repair error message
   * @param operation - The repair operation that failed
   * @param checkId - Check that triggered the repair operation
   * @param backupPath - Path to backup file if operation was partially completed
   * @param metadata - Additional repair context
   */
  constructor(
    message: string,
    operation?: string,
    checkId?: string,
    backupPath?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "AUTO_REPAIR_ERROR", {
      operation,
      checkId,
      backupPath,
      ...metadata,
    });
  }
}

/**
 * Check registry error for registration and lookup failures
 *
 * Used when check registration fails due to conflicts, invalid check
 * implementations, or registry corruption issues.
 *
 * @public
 */
export class CheckRegistryError extends BaseError {
  /**
   * Create a new check registry error
   *
   * @param message - User-friendly registry error message
   * @param operation - The registry operation that failed
   * @param checkId - Check ID involved in the failed operation
   * @param metadata - Additional registry context
   */
  constructor(
    message: string,
    operation?: string,
    checkId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CHECK_REGISTRY_ERROR", {
      operation,
      checkId,
      ...metadata,
    });
  }
}

/**
 * Format metadata fields for error guidance
 *
 * @param metadata - Error metadata object
 * @param keyName - Key to extract from metadata
 * @param displayLabel - Label to show in output
 * @returns Formatted metadata string or empty string
 * @internal
 */
function formatMetadataField(
  metadata: Record<string, unknown>,
  keyName: string,
  displayLabel: string,
): string {
  const value = metadata[keyName];
  return value && typeof value === "string" ? `${displayLabel}: ${value}\n` : "";
}

/**
 * Get guidance for DiagnosticError instances
 *
 * @param error - DiagnosticError instance
 * @returns Formatted guidance string
 * @internal
 */
function getDiagnosticErrorDetails(error: DiagnosticError): string {
  const { severity } = error.metadata;

  let guidance = `Diagnostic check failed: ${error.message}\n\n`;
  guidance += formatMetadataField(error.metadata, "checkId", "Check ID");
  guidance += formatMetadataField(error.metadata, "stage", "Validation stage");
  guidance += "\nRecommended actions:\n";

  switch (severity) {
    case "fail": {
      guidance += "• This is a critical issue that requires immediate attention\n";
      guidance += "• Review the error details and remediation suggestions\n";
      guidance += "• Consider using --interactive mode for guided repair\n";
      break;
    }
    case "warn": {
      guidance += "• This is a non-critical issue that should be addressed\n";
      guidance += "• The system may still function but with reduced reliability\n";
      guidance += "• Consider fixing when convenient\n";
      break;
    }
    default: {
      guidance += "• Review the diagnostic output for specific recommendations\n";
      guidance += "• Check system logs for additional context\n";
      break;
    }
  }

  return guidance;
}

/**
 * Get guidance for CheckExecutionError instances
 *
 * @param error - CheckExecutionError instance
 * @returns Formatted guidance string
 * @internal
 */
function getCheckExecutionErrorDetails(error: CheckExecutionError): string {
  let guidance = `Check execution failed: ${error.message}\n\n`;
  guidance += formatMetadataField(error.metadata, "checkId", "Failed check");
  guidance += formatMetadataField(error.metadata, "stage", "Stage");
  guidance += "\nTroubleshooting steps:\n";
  guidance += "• Verify system requirements are met\n";
  guidance += "• Check that all dependencies are properly installed\n";
  guidance += "• Review system permissions and access rights\n";
  guidance += "• Try running the diagnostic with --detailed flag for more information\n";
  return guidance;
}

/**
 * Get guidance for AutoRepairError instances
 *
 * @param error - AutoRepairError instance
 * @returns Formatted guidance string
 * @internal
 */
function getAutoRepairErrorDetails(error: AutoRepairError): string {
  let guidance = `Auto-repair failed: ${error.message}\n\n`;
  guidance += formatMetadataField(error.metadata, "operation", "Failed operation");
  guidance += formatMetadataField(error.metadata, "backupPath", "Backup available at");
  guidance += "\nRecovery steps:\n";
  guidance += "• Review the error details to understand what failed\n";
  guidance += "• If a backup was created, consider manually restoring it\n";
  guidance += "• Try using --interactive mode for guided manual repair\n";
  guidance += "• Contact support if the issue persists\n";
  return guidance;
}

/**
 * Get guidance for CheckRegistryError instances
 *
 * @param error - CheckRegistryError instance
 * @returns Formatted guidance string
 * @internal
 */
function getCheckRegistryErrorDetails(error: CheckRegistryError): string {
  let guidance = `Check registry error: ${error.message}\n\n`;
  guidance += formatMetadataField(error.metadata, "operation", "Failed operation");
  guidance += formatMetadataField(error.metadata, "checkId", "Check ID");
  guidance += "\nResolution steps:\n";
  guidance += "• This indicates an internal system error\n";
  guidance += "• Try restarting the application\n";
  guidance += "• If the issue persists, this may indicate a bug\n";
  guidance += "• Contact support with the error details\n";
  return guidance;
}

/**
 * Get generic error guidance for unknown error types
 *
 * @param error - Unknown error instance
 * @returns Formatted guidance string
 * @internal
 */
function getGenericErrorDetails(error: unknown): string {
  return (
    `Diagnostic operation failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
    "General troubleshooting:\n" +
    "• Check system requirements and dependencies\n" +
    "• Verify AWS CLI installation and configuration\n" +
    "• Review system permissions and network connectivity\n" +
    "• Try running with --detailed flag for more information\n"
  );
}

/**
 * Get diagnostic error guidance for user resolution
 *
 * Provides contextual guidance and remediation steps based on the type
 * and details of diagnostic errors. Extends existing error guidance patterns
 * with diagnostic-specific resolution instructions.
 *
 * @param error - Error to provide guidance for
 * @returns Human-readable guidance message
 * @public
 */
export function getDiagnosticErrorGuidance(error: unknown): string {
  if (error instanceof DiagnosticError) {
    return getDiagnosticErrorDetails(error);
  }

  if (error instanceof CheckExecutionError) {
    return getCheckExecutionErrorDetails(error);
  }

  if (error instanceof AutoRepairError) {
    return getAutoRepairErrorDetails(error);
  }

  if (error instanceof CheckRegistryError) {
    return getCheckRegistryErrorDetails(error);
  }

  return getGenericErrorDetails(error);
}
