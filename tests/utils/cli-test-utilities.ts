/**
 * Test utilities for CLI command testing
 *
 * Provides utilities for testing Oclif CLI commands with mocked dependencies,
 * captured output, and assertion helpers for comprehensive CLI testing.
 *
 */

import type { Command, Config } from "@oclif/core";
import { vi } from "vitest";

/**
 * Captured CLI output for testing assertions
 *
 * @public
 */
export interface CapturedOutput {
  /**
   * Captured stdout content
   */
  stdout: string;

  /**
   * Captured stderr content
   */
  stderr: string;

  /**
   * Exit code from command execution
   */
  exitCode: number;

  /**
   * Command execution error if thrown
   */
  error?: Error;
}

/**
 * CLI test context for command execution
 *
 * @public
 */
export interface CliTestContext {
  /**
   * Mock Oclif config for testing
   */
  config: Config;

  /**
   * Captured output streams
   */
  output: CapturedOutput;

  /**
   * Reset captured output
   */
  resetOutput(): void;
}

/**
 * Create a test context for CLI command testing
 *
 * @returns Promise resolving to test context
 *
 * @public
 */
export async function createCliTestContext(): Promise<CliTestContext> {
  const { Config } = await import("@oclif/core");

  const config = await Config.load({
    root: process.cwd(),
    devPlugins: false,
  });

  const output: CapturedOutput = {
    stdout: "",
    stderr: "",
    exitCode: 0,
  };

  const resetOutput = () => {
    output.stdout = "";
    output.stderr = "";
    output.exitCode = 0;
    output.error = undefined;
  };

  return {
    config,
    output,
    resetOutput,
  };
}

/**
 * Execute a CLI command with captured output
 *
 * @param commandClass - The command class to execute
 * @param arguments_ - Command arguments
 * @param context - CLI test context
 * @returns Promise resolving to captured output
 *
 * @public
 */
export async function runCommand(
  commandClass: typeof Command,
  arguments_: string[] = [],
  context: CliTestContext,
): Promise<CapturedOutput> {
  context.resetOutput();

  // Spy on console.log and console.error to capture OCLIF command output
  const logSpy = vi.spyOn(console, "log").mockImplementation((...arguments__) => {
    context.output.stdout += arguments__.join(" ") + "\n";
  });

  const errorSpy = vi.spyOn(console, "error").mockImplementation((...arguments__) => {
    context.output.stderr += arguments__.join(" ") + "\n";
  });

  try {
    const command = new commandClass(arguments_, context.config) as Command;
    await command.run();
    context.output.exitCode = 0;
  } catch (error: unknown) {
    context.output.error = error instanceof Error ? error : new Error(String(error));
    context.output.exitCode =
      error instanceof Error && "exitCode" in error ? (error.exitCode as number) : 1;
  } finally {
    // Restore original console methods
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }

  return { ...context.output };
}

/**
 * Assert command executed successfully
 *
 * @param output - Captured command output
 * @param expectedExitCode - Expected exit code (default: 0)
 * @throws When command execution fails or exit code doesn't match expected
 *
 * @public
 */
export function assertCommandSuccess(output: CapturedOutput, expectedExitCode = 0): void {
  if (output.error) {
    throw new Error(`Command failed with error: ${output.error.message}`);
  }

  if (output.exitCode !== expectedExitCode) {
    throw new Error(
      `Command exited with code ${output.exitCode}, expected ${expectedExitCode}\n` +
        `stdout: ${output.stdout}\n` +
        `stderr: ${output.stderr}`,
    );
  }
}

/**
 * Assert command failed with expected error
 *
 * @param output - Captured command output
 * @param expectedErrorPattern - Expected error message pattern
 * @param expectedExitCode - Expected exit code (default: 1)
 * @throws When command succeeds unexpectedly or error pattern doesn't match
 *
 * @public
 */
export function assertCommandFailure(
  output: CapturedOutput,
  expectedErrorPattern?: string | RegExp,
  expectedExitCode = 1,
): void {
  if (output.exitCode === 0) {
    throw new Error(
      `Command succeeded but was expected to fail\n` +
        `stdout: ${output.stdout}\n` +
        `stderr: ${output.stderr}`,
    );
  }

  if (output.exitCode !== expectedExitCode) {
    throw new Error(`Command exited with code ${output.exitCode}, expected ${expectedExitCode}`);
  }

  if (expectedErrorPattern && output.error) {
    const errorMessage = output.error.message;
    const matches =
      typeof expectedErrorPattern === "string"
        ? errorMessage.includes(expectedErrorPattern)
        : expectedErrorPattern.test(errorMessage);

    if (!matches) {
      throw new Error(
        `Error message "${errorMessage}" does not match expected pattern "${expectedErrorPattern}"`,
      );
    }
  }
}

/**
 * Assert output contains expected text
 *
 * @param output - Captured command output
 * @param expectedText - Expected text in stdout
 * @param stream - Stream to check (default: "stdout")
 * @throws When expected text is not found in the specified stream
 *
 * @public
 */
export function assertOutputContains(
  output: CapturedOutput,
  expectedText: string,
  stream: "stdout" | "stderr" = "stdout",
): void {
  const streamContent = output[stream];

  if (!streamContent.includes(expectedText)) {
    throw new Error(
      `Expected ${stream} to contain "${expectedText}"\n` + `Actual ${stream}: ${streamContent}`,
    );
  }
}

/**
 * Assert output matches pattern
 *
 * @param output - Captured command output
 * @param pattern - Expected pattern in stdout
 * @param stream - Stream to check (default: "stdout")
 * @throws When output doesn't match the expected pattern
 *
 * @public
 */
export function assertOutputMatches(
  output: CapturedOutput,
  pattern: RegExp,
  stream: "stdout" | "stderr" = "stdout",
): void {
  const streamContent = output[stream];

  if (!pattern.test(streamContent)) {
    throw new Error(
      `Expected ${stream} to match pattern ${pattern}\n` + `Actual ${stream}: ${streamContent}`,
    );
  }
}

/**
 * Mock environment variables for testing
 *
 * @param environmentVariables - Environment variables to set
 * @returns Function to restore original environment
 *
 * @public
 */
export function mockEnvironment(environmentVariables: Record<string, string>): () => void {
  const originalEnvironment: Record<string, string | undefined> = {};

  // Store original values and set new ones
  for (const [key, value] of Object.entries(environmentVariables)) {
    originalEnvironment[key] = process.env[key];
    process.env[key] = value;
  }

  // Return restore function
  return () => {
    for (const [key, originalValue] of Object.entries(originalEnvironment)) {
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  };
}
