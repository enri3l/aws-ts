/**
 * Lambda invoke command
 *
 * Executes a Lambda function with optional payload and supports both
 * synchronous and asynchronous invocation modes.
 *
 */

import type { InvokeCommandOutput } from "@aws-sdk/client-lambda";
import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getLambdaErrorGuidance } from "../../lib/lambda-errors.js";
import type { LambdaInvoke } from "../../lib/lambda-schemas.js";
import { LambdaInvokeSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";

/**
 * Extended invocation result with index signature for data processing
 *
 * @internal
 */
interface ExtendedInvokeCommandOutput extends InvokeCommandOutput {
  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * Lambda invoke command for function execution
 *
 * Executes a Lambda function with optional payload and supports
 * various invocation types and output formats.
 *
 * @public
 */
export default class LambdaInvokeCommand extends Command {
  static override readonly description = "Invoke a Lambda function with optional payload";

  static override readonly examples = [
    {
      description: "Invoke a function synchronously",
      command: "<%= config.bin %> <%= command.id %> my-function",
    },
    {
      description: "Invoke a function with JSON payload",
      command: '<%= config.bin %> <%= command.id %> my-function --payload \'{"key": "value"}\'',
    },
    {
      description: "Invoke a function asynchronously",
      command: "<%= config.bin %> <%= command.id %> my-function --invocation-type Event",
    },
    {
      description: "Invoke a specific function version",
      command: "<%= config.bin %> <%= command.id %> my-function --qualifier v1",
    },
    {
      description: "Invoke with payload from file",
      command: "<%= config.bin %> <%= command.id %> my-function --payload-file input.json",
    },
    {
      description: "Dry run validation",
      command: "<%= config.bin %> <%= command.id %> my-function --invocation-type DryRun",
    },
    {
      description: "Invoke with client context",
      command:
        '<%= config.bin %> <%= command.id %> my-function --client-context \'{"custom": "data"}\'',
    },
  ];

  static override readonly args = {
    functionName: Args.string({
      name: "functionName",
      description: "Name or ARN of the Lambda function to invoke",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region containing the function",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for invocation response",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    qualifier: Flags.string({
      char: "q",
      description: "Function version or alias to invoke",
      helpValue: "VERSION_OR_ALIAS",
    }),

    "invocation-type": Flags.string({
      description: "Invocation type",
      options: ["RequestResponse", "Event", "DryRun"],
      default: "RequestResponse",
    }),

    payload: Flags.string({
      description: "JSON payload to send to the function",
      helpValue: "JSON_STRING",
    }),

    "payload-file": Flags.string({
      description: "File containing JSON payload",
      helpValue: "FILE_PATH",
    }),

    "client-context": Flags.string({
      description: "Client context information as JSON",
      helpValue: "JSON_STRING",
    }),

    "log-type": Flags.string({
      description: "Log type for the invocation",
      options: ["None", "Tail"],
      default: "None",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda invoke command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaInvokeCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaInvoke = LambdaInvokeSchema.parse({
        functionName: args.functionName,
        qualifier: flags.qualifier,
        invocationType: flags["invocation-type"],
        payload: flags.payload,
        payloadFile: flags["payload-file"],
        clientContext: flags["client-context"],
        logType: flags["log-type"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create Lambda service instance
      const lambdaService = new LambdaService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Invoke the Lambda function
      const invocationResult = await lambdaService.invoke(
        {
          functionName: input.functionName,
          ...(input.qualifier && { qualifier: input.qualifier }),
          invocationType: input.invocationType,
          ...(input.payload && { payload: input.payload }),
          ...(input.clientContext && { clientContext: input.clientContext }),
          logType: input.logType,
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(invocationResult, input.format, input.functionName);
    } catch (error) {
      const formattedError = this.formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the invocation result output
   *
   * @param invocationResult - Invocation result to display
   * @param format - Output format to use
   * @param functionName - Function name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    invocationResult: InvokeCommandOutput,
    format: string,
    functionName: string,
  ): void {
    switch (format) {
      case "table": {
        this.displayTableFormat(invocationResult, functionName);
        break;
      }
      case "json": {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([
          { data: invocationResult as ExtendedInvokeCommandOutput, index: 0 },
        ]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([
          { data: invocationResult as ExtendedInvokeCommandOutput, index: 0 },
        ]);
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten invocation result for CSV output
        const flattenedData = {
          StatusCode: invocationResult?.StatusCode ?? "",
          ExecutedVersion: invocationResult?.ExecutedVersion ?? "",
          FunctionError: invocationResult?.FunctionError ?? "",
          LogResultAvailable: invocationResult?.LogResult ? "true" : "false",
          PayloadSize: invocationResult?.Payload ? Buffer.byteLength(invocationResult.Payload) : 0,
          HasError: invocationResult?.FunctionError ? "true" : "false",
        };

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput([{ data: flattenedData, index: 0 }]);
        this.log(output);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display invocation result in table format
   *
   * @param invocationResult - Invocation result to display
   * @param functionName - Function name for display
   * @internal
   */
  private displayTableFormat(invocationResult: InvokeCommandOutput, functionName: string): void {
    this.log(`Function Invocation Result: ${functionName}\n`);
    this.displayExecutionInfo(invocationResult);
    this.displayPayloadResponse(invocationResult);
    this.displayLogOutput(invocationResult);
  }

  /**
   * Display execution information section
   *
   * @param invocationResult - Invocation result to display
   * @internal
   */
  private displayExecutionInfo(invocationResult: InvokeCommandOutput): void {
    this.log("Execution Information:");
    const executionInfo = [
      ["Status Code", invocationResult?.StatusCode ?? "N/A"],
      ["Executed Version", invocationResult?.ExecutedVersion ?? "N/A"],
      ["Function Error", invocationResult?.FunctionError ?? "None"],
      ["Log Result", invocationResult?.LogResult ? "Available" : "None"],
    ];

    for (const [key, value] of executionInfo) {
      this.log(`  ${key}: ${value}`);
    }
  }

  /**
   * Display payload response section
   *
   * @param invocationResult - Invocation result to display
   * @internal
   */
  private displayPayloadResponse(invocationResult: InvokeCommandOutput): void {
    if (invocationResult?.Payload) {
      this.log("\n📄 Response Payload:");
      try {
        const payload = invocationResult.Payload;
        const payloadString =
          typeof payload === "string" ? payload : Buffer.from(payload).toString();

        // Try to pretty-print JSON
        try {
          const parsed: unknown = JSON.parse(payloadString);
          this.log(`  ${JSON.stringify(parsed, undefined, 2)}`);
        } catch {
          this.log(`  ${payloadString}`);
        }
      } catch (error) {
        this.log(
          `  Error parsing payload: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }

  /**
   * Display log output section
   *
   * @param invocationResult - Invocation result to display
   * @internal
   */
  private displayLogOutput(invocationResult: InvokeCommandOutput): void {
    if (invocationResult?.LogResult) {
      this.log("\nLog Output:");
      try {
        const logData = Buffer.from(invocationResult.LogResult, "base64").toString();
        this.log(`  ${logData}`);
      } catch (error) {
        this.log(
          `  Error decoding logs: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }

  /**
   * Format Lambda-specific errors with user guidance
   *
   * @param error - The error to format
   * @param verbose - Whether to include verbose error details
   * @returns Formatted error message with guidance
   * @internal
   */
  private formatLambdaError(error: unknown, verbose: boolean): string {
    const guidance = getLambdaErrorGuidance(error);

    if (verbose && error instanceof Error) {
      return `${error.message}\n\n${guidance}`;
    }

    if (error instanceof Error) {
      return `${error.message}\n\n${guidance}`;
    }

    return `An unknown error occurred\n\n${guidance}`;
  }
}
