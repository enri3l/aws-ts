/**
 * Registry for managing diagnostic check implementations
 *
 * Provides centralized registration and discovery of check implementations
 * with support for filtering by stage or category. Ensures check ID uniqueness
 * and provides efficient lookup capabilities for the doctor service.
 *
 */

import type { CheckStage, ICheck, ICheckRegistry } from "./types.js";

/**
 * Concrete implementation of check registry
 *
 * Manages diagnostic check registration with in-memory storage and efficient
 * lookup capabilities. Validates check uniqueness and provides stage-based
 * filtering for progressive validation execution.
 *
 * @public
 */
export class CheckRegistry implements ICheckRegistry {
  private readonly checks = new Map<string, ICheck>();
  private readonly stageChecks = new Map<CheckStage, ICheck[]>();

  /**
   * Create a new check registry instance
   */
  constructor() {
    // Initialize stage maps for efficient lookup
    this.stageChecks.set("environment", []);
    this.stageChecks.set("configuration", []);
    this.stageChecks.set("authentication", []);
    this.stageChecks.set("connectivity", []);
  }

  /**
   * Register a new diagnostic check
   *
   * Validates check uniqueness and adds the check to both ID-based and
   * stage-based lookup structures for efficient retrieval during execution.
   *
   * @param check - Check implementation to register
   * @throws When check ID conflicts with existing registration
   */
  register(check: ICheck): void {
    if (this.checks.has(check.id)) {
      throw new Error(`Check with ID '${check.id}' is already registered`);
    }

    // Validate check properties
    if (!check.id || typeof check.id !== "string") {
      throw new Error("Check must have a valid string ID");
    }

    if (!check.name || typeof check.name !== "string") {
      throw new Error("Check must have a valid string name");
    }

    if (!check.description || typeof check.description !== "string") {
      throw new Error("Check must have a valid string description");
    }

    if (!this.isValidStage(check.stage as string)) {
      throw new Error(`Invalid check stage: ${check.stage as string}`);
    }

    if (typeof check.execute !== "function") {
      throw new TypeError("Check must implement execute method");
    }

    // Register check in both lookup structures
    this.checks.set(check.id, check);
    this.stageChecks.get(check.stage)!.push(check);
  }

  /**
   * Get all registered checks for a specific stage
   *
   * Returns checks in registration order for predictable execution sequence.
   * Useful for progressive validation where stage dependencies matter.
   *
   * @param stage - Validation stage to filter by
   * @returns Array of checks for the specified stage
   */
  getChecksForStage(stage: CheckStage): readonly ICheck[] {
    const checks = this.stageChecks.get(stage);
    return checks ? [...checks] : [];
  }

  /**
   * Get a specific check by ID
   *
   * Provides efficient O(1) lookup for individual check retrieval,
   * useful for targeted execution or detailed inspection.
   *
   * @param id - Unique check identifier
   * @returns Check implementation or undefined if not found
   */
  getCheck(id: string): ICheck | undefined {
    return this.checks.get(id);
  }

  /**
   * Get all registered check IDs
   *
   * Returns all check identifiers in registration order for inventory
   * and validation purposes.
   *
   * @returns Array of all registered check identifiers
   */
  getAllCheckIds(): readonly string[] {
    return [...this.checks.keys()];
  }

  /**
   * Get total number of registered checks
   *
   * @returns Total count of registered checks
   */
  getCheckCount(): number {
    return this.checks.size;
  }

  /**
   * Get checks grouped by stage for overview purposes
   *
   * @returns Map of stage to check count for diagnostic purposes
   */
  getStageDistribution(): Map<CheckStage, number> {
    const distribution = new Map<CheckStage, number>();

    for (const [stage, checks] of this.stageChecks.entries()) {
      distribution.set(stage, checks.length);
    }

    return distribution;
  }

  /**
   * Clear all registered checks
   *
   * Removes all checks from the registry. Primarily useful for testing
   * scenarios where clean registry state is required.
   *
   * @internal
   */
  clear(): void {
    this.checks.clear();
    for (const stageChecks of this.stageChecks.values()) {
      stageChecks.length = 0;
    }
  }

  /**
   * Validate if stage is supported
   *
   * @param stage - Stage to validate
   * @returns True if stage is valid
   * @internal
   */
  private isValidStage(stage: string): stage is CheckStage {
    return ["environment", "configuration", "authentication", "connectivity"].includes(stage);
  }
}
