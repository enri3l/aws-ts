#!/usr/bin/env node

/**
 * AWS TypeScript CLI - Main entry point
 *
 * Oclif-based command-line interface for AWS operations with TypeScript.
 * Provides modular command structure with CQRS pattern, structured
 * error types, and contextual logging.
 *
 */

import { execute } from "@oclif/core";

/**
 * CLI application entry point
 *
 * Initializes the Oclif CLI framework and executes the requested command.
 * Handles global error cases and ensures proper exit codes.
 */
async function run(): Promise<void> {
  await execute({ dir: import.meta.url });
}

/**
 * Execute the CLI with proper error handling
 *
 * Catches and formats any unhandled errors that escape the Oclif
 * error handling system, ensuring clean exit behavior.
 */
try {
  await run();
} catch (error: unknown) {
  const { handle } = await import("@oclif/core/handle");
  await handle(error as Error);
}
