/**
 * @module base-check
 * Base class for diagnostic checks
 *
 * Provides common error handling and execution patterns for all ICheck implementations.
 * Eliminates duplicated try/catch blocks and standardizes error handling across
 * the doctor check system using the template method pattern.
 */

import { CheckExecutionError } from "../../../lib/diagnostic-errors.js";
import type { CheckResult, CheckStage, DoctorContext, ICheck } from "../types.js";

/**
 * Abstract base class for diagnostic checks
 *
 * Implements common error handling and execution patterns using template method.
 * All check classes should extend this base to eliminate error handling duplication.
 *
 * @example
 * ```typescript
 * export class MyCheck extends BaseCheck {
 *   readonly id = "my-check";
 *   readonly name = "My Check";
 *   readonly description = "Validates something important";
 *   readonly stage = "environment" as const;
 *
 *   protected async run(context: DoctorContext): Promise<CheckResult> {
 *     // Implementation logic here
 *     return { status: "pass", message: "Check passed" };
 *   }
 * }
 * ```
 */
export abstract class BaseCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  abstract readonly id: string;

  /**
   * Human-readable name for this check
   */
  abstract readonly name: string;

  /**
   * Description of what this check validates
   */
  abstract readonly description: string;

  /**
   * Validation stage this check belongs to
   */
  abstract readonly stage: CheckStage;

  /**
   * Execute the diagnostic check with standardized error handling
   *
   * Uses template method pattern to provide consistent error handling
   * across all check implementations. Subclasses implement run() method.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with status and details
   * @throws CheckExecutionError when check execution fails unexpectedly
   */
  async execute(context: DoctorContext): Promise<CheckResult> {
    try {
      return await this.run(context);
    } catch (error) {
      throw new CheckExecutionError(`Failed to execute ${this.name}`, this.id, this.stage, error);
    }
  }

  /**
   * Run the specific check logic
   *
   * Subclasses implement this method with their specific validation logic.
   * Error handling is automatically provided by the base execute() method.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with status and details
   */
  protected abstract run(context: DoctorContext): Promise<CheckResult>;
}
