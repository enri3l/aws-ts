/**
 * @module ssm/document/list
 * SSM list documents command
 *
 * Lists SSM documents with filtering by type and owner.
 */

import type { DocumentIdentifier } from "@aws-sdk/client-ssm";
import { Flags } from "@oclif/core";
import {
  ListDocumentsInputSchema,
  type ListDocumentsInput,
} from "../../../lib/ssm/document-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { DocumentManagerService } from "../../../services/ssm/document-manager.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM list documents command
 *
 * @public
 */
export default class SSMDocumentListCommand extends BaseCommand {
  static override readonly description = "List SSM documents with filtering";

  static override readonly examples = [
    {
      description: "List all documents",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List AWS-owned documents",
      command: "<%= config.bin %> <%= command.id %> --owner Amazon",
    },
    {
      description: "List automation documents",
      command: "<%= config.bin %> <%= command.id %> --document-type Automation",
    },
    {
      description: "List session documents for Linux",
      command: "<%= config.bin %> <%= command.id %> --document-type Session --platform-type Linux",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "document-type": Flags.string({
      description: "Filter by document type",
      options: [
        "Command",
        "Automation",
        "Policy",
        "Session",
        "Package",
        "ApplicationConfiguration",
        "ApplicationConfigurationSchema",
        "DeploymentStrategy",
        "ChangeCalendar",
        "ChangeTemplate",
      ],
      helpValue: "TYPE",
    }),

    owner: Flags.string({
      description: "Filter by document owner",
      options: ["Self", "Amazon", "All", "ThirdParty"],
      default: "All",
      helpValue: "OWNER",
    }),

    "platform-type": Flags.string({
      description: "Filter by platform type",
      helpValue: "PLATFORM",
    }),

    "max-results": Flags.integer({
      description: "Maximum number of documents to return",
      min: 1,
      max: 50,
      helpValue: "NUMBER",
    }),
  };

  /**
   * Execute the SSM list documents command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(SSMDocumentListCommand);

    try {
      const input: ListDocumentsInput = ListDocumentsInputSchema.parse({
        documentType: flags["document-type"],
        owner: flags.owner,
        platformType: flags["platform-type"],
        maxResults: flags["max-results"],
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

      const documents = await documentManager.listDocuments(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.documentType && { documentType: input.documentType }),
          owner: input.owner,
          ...(input.platformType && { platformType: input.platformType }),
          ...(input.maxResults && { maxResults: input.maxResults }),
        },
      );

      // Display documents with proper formatting
      this.displayOutput(documents, input.format, {
        transform: (document: unknown) => {
          const documentData = document as DocumentIdentifier;
          return {
            Name: documentData.Name || "N/A",
            DocumentType: documentData.DocumentType || "N/A",
            Owner: documentData.Owner || "N/A",
            PlatformTypes: documentData.PlatformTypes?.join(", ") || "N/A",
            DocumentVersion: documentData.DocumentVersion || "N/A",
            VersionName: documentData.VersionName || "N/A",
          };
        },
        emptyMessage: "No documents found",
      });
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:document:list");
      this.error(formattedError, { exit: 1 });
    }
  }
}
