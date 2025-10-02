/**
 * @module ssm/document-manager
 * Document Manager service for SSM document operations
 *
 * Provides a specialized service for AWS Systems Manager document operations
 * including list and describe with filtering support.
 */

import {
  DescribeDocumentCommand,
  paginateListDocuments,
  SSMClient,
  type DescribeDocumentCommandOutput,
  type DocumentIdentifier,
  type DocumentKeyValuesFilter,
} from "@aws-sdk/client-ssm";
import { BaseAwsService, type BaseServiceOptions } from "../../lib/base-aws-service.js";
import { retryWithBackoff } from "../../lib/retry.js";
import { SSMDocumentError } from "../../lib/ssm/ssm-errors.js";
import type { AwsClientConfig } from "../credential-service.js";

/**
 * Configuration options for Document Manager service
 *
 * @public
 */
export type DocumentManagerServiceOptions = BaseServiceOptions;

/**
 * Parameters for listing documents
 *
 * @public
 */
export interface ListDocumentsParameters {
  documentType?: string;
  owner?: "Self" | "Amazon" | "All" | "ThirdParty";
  platformType?: string;
  maxResults?: number;
}

/**
 * Parameters for describing a document
 *
 * @public
 */
export interface DescribeDocumentParameters {
  name: string;
  documentVersion?: string;
}

/**
 * Document Manager service for SSM document operations
 *
 * Provides a unified interface for document operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class DocumentManagerService extends BaseAwsService<SSMClient> {
  /**
   * Create a new Document Manager service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: DocumentManagerServiceOptions = {}) {
    super(SSMClient, options);
  }

  /**
   * List SSM documents with optional filtering
   *
   * @param config - AWS client configuration
   * @param parameters - Document listing parameters
   * @returns List of document identifiers
   */
  async listDocuments(
    config: AwsClientConfig,
    parameters: ListDocumentsParameters = {},
  ): Promise<DocumentIdentifier[]> {
    const { documentType, owner = "All", platformType, maxResults = 50 } = parameters;
    const spinner = this.createSpinner("Listing SSM documents...");

    try {
      const client = await this.getClient(config);
      const filters: DocumentKeyValuesFilter[] = [];

      if (documentType) {
        filters.push({
          Key: "DocumentType",
          Values: [documentType],
        });
      }

      if (owner && owner !== "All") {
        filters.push({
          Key: "Owner",
          Values: [owner],
        });
      }

      if (platformType) {
        filters.push({
          Key: "PlatformTypes",
          Values: [platformType],
        });
      }

      const paginatorConfig = { client };
      const input = {
        Filters: filters.length > 0 ? filters : undefined,
        MaxResults: maxResults,
      };

      const allDocuments: DocumentIdentifier[] = [];
      const paginator = paginateListDocuments(paginatorConfig, input);

      for await (const page of paginator) {
        const documents = page.DocumentIdentifiers || [];
        for (const document of documents) {
          allDocuments.push(document);
        }
      }

      const documentCount = allDocuments.length;
      const documentPlural = documentCount === 1 ? "" : "s";
      spinner.succeed(`Found ${documentCount} document${documentPlural}`);
      return allDocuments;
    } catch (error) {
      spinner.fail("Failed to list documents");
      throw new SSMDocumentError(
        `Failed to list SSM documents: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        "list-documents",
        error,
      );
    }
  }

  /**
   * Describe a specific SSM document
   *
   * @param config - AWS client configuration
   * @param parameters - Document description parameters
   * @returns Document information
   */
  async describeDocument(
    config: AwsClientConfig,
    parameters: DescribeDocumentParameters,
  ): Promise<DescribeDocumentCommandOutput> {
    const { name, documentVersion } = parameters;
    const spinner = this.createSpinner(`Describing document ${name}...`);

    try {
      const client = await this.getClient(config);
      const command = new DescribeDocumentCommand({
        Name: name,
        DocumentVersion: documentVersion,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying describe document (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Found document ${name}`);
      return response;
    } catch (error) {
      spinner.fail("Failed to describe document");
      throw new SSMDocumentError(
        `Failed to describe document ${name}: ${error instanceof Error ? error.message : String(error)}`,
        name,
        documentVersion,
        "describe-document",
        error,
      );
    }
  }
}
