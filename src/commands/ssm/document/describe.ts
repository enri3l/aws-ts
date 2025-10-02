/**
 * @module ssm/document/describe
 * SSM describe document command
 *
 * Shows detailed information about a specific SSM document.
 */

import type { DocumentDescription, DocumentParameter } from "@aws-sdk/client-ssm";
import { Args, Flags } from "@oclif/core";
import {
  DescribeDocumentInputSchema,
  type DescribeDocumentInput,
} from "../../../lib/ssm/document-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { DocumentManagerService } from "../../../services/ssm/document-manager.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM describe document command
 *
 * @public
 */
export default class SSMDocumentDescribeCommand extends BaseCommand {
  static override readonly description = "Show detailed information about an SSM document";

  static override readonly examples = [
    {
      description: "Describe a document",
      command: "<%= config.bin %> <%= command.id %> AWS-RunShellScript",
    },
    {
      description: "Describe a specific document version",
      command: "<%= config.bin %> <%= command.id %> AWS-RunShellScript --version 1",
    },
    {
      description: "Describe document with JSON output",
      command: "<%= config.bin %> <%= command.id %> AWS-RunShellScript --format json",
    },
  ];

  static override readonly args = {
    name: Args.string({
      description: "Document name",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    version: Flags.string({
      description: "Document version to describe",
      helpValue: "VERSION",
    }),
  };

  /**
   * Execute the SSM describe document command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMDocumentDescribeCommand);

    try {
      const input: DescribeDocumentInput = DescribeDocumentInputSchema.parse({
        name: args.name,
        documentVersion: flags.version,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const documentManager = new DocumentManagerService({
        enableDebugLogging: input.verbose || false,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const response = await documentManager.describeDocument(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          name: input.name,
          ...(input.documentVersion && { documentVersion: input.documentVersion }),
        },
      );

      if (!response.Document) {
        this.error(`Document not found: ${input.name}`, { exit: 1 });
      }

      const document = response.Document;

      // Display document details
      if (input.format === "table") {
        this.displayDocumentTable(document, input.verbose || false);
      } else {
        this.displaySingleObject(document, input.format);
      }
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:document:describe");
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display document details in table format
   *
   * @param document - Document description
   * @param verbose - Whether to show verbose output
   */
  private displayDocumentTable(document: DocumentDescription, verbose: boolean): void {
    this.log("\nDocument Details:");
    this.log(`  Name: ${document.Name || "N/A"}`);
    this.log(`  Document Type: ${document.DocumentType || "N/A"}`);
    this.log(`  Document Version: ${document.DocumentVersion || "N/A"}`);
    this.log(`  Version Name: ${document.VersionName || "N/A"}`);
    this.log(`  Owner: ${document.Owner || "N/A"}`);
    this.log(`  Status: ${document.Status || "N/A"}`);
    this.log(`  Created Date: ${document.CreatedDate?.toISOString() || "N/A"}`);
    this.log(`  Platform Types: ${document.PlatformTypes?.join(", ") || "N/A"}`);
    this.log(`  Document Format: ${document.DocumentFormat || "N/A"}`);
    this.log(`  Schema Version: ${document.SchemaVersion || "N/A"}`);

    if (document.Description) {
      this.log(`  Description: ${document.Description}`);
    }

    this.displayDocumentParameters(document.Parameters);

    if (verbose && document.Hash) {
      this.log(`\n  Hash: ${document.Hash}`);
      this.log(`  Hash Type: ${document.HashType || "N/A"}`);
    }

    this.log("");
  }

  /**
   * Display document parameters
   *
   * @param parameters - Document parameters
   */
  private displayDocumentParameters(parameters: DocumentParameter[] | undefined): void {
    if (!parameters || parameters.length === 0) {
      return;
    }

    this.log(`\n  Parameters (${parameters.length}):`);
    for (const parameter of parameters) {
      const defaultValueText = parameter.DefaultValue ? `(default: ${parameter.DefaultValue})` : "";
      this.log(`    - ${parameter.Name}: ${parameter.Type} ${defaultValueText}`);
      if (parameter.Description) {
        this.log(`      ${parameter.Description}`);
      }
    }
  }
}
