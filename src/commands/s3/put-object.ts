/**
 * @module s3/put-object
 * S3 put object command
 *
 * Uploads an object to S3 with automatic multipart handling for large files
 * and progress indicators.
 */

import { Args, Flags } from "@oclif/core";
import path from "node:path";
import { parseJsonStringInput } from "../../lib/parsing.js";
import { formatS3Error } from "../../lib/s3-errors.js";
import {
  S3ACLSchema,
  S3PutObjectSchema,
  S3ServerSideEncryptionSchema,
  S3StorageClassSchema,
} from "../../lib/s3-schemas.js";
import { S3Service } from "../../services/s3-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * S3 put object command for uploading objects
 *
 * Provides object upload with automatic multipart handling for large files
 * and support for metadata, storage classes, and encryption.
 *
 * @public
 */
export default class S3PutObjectCommand extends BaseCommand {
  static override readonly description = "Upload an object to an S3 bucket";

  static override readonly examples = [
    {
      description: "Upload a file",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt ./local-file.txt",
    },
    {
      description: "Upload with content type",
      command:
        "<%= config.bin %> <%= command.id %> my-bucket file.json ./data.json --content-type application/json",
    },
    {
      description: "Upload with custom metadata",
      command:
        '<%= config.bin %> <%= command.id %> my-bucket file.txt ./file.txt --metadata \'{"author":"John","version":"1.0"}\'',
    },
    {
      description: "Upload to GLACIER storage class",
      command:
        "<%= config.bin %> <%= command.id %> my-bucket archive.zip ./archive.zip --storage-class GLACIER",
    },
    {
      description: "Upload with server-side encryption",
      command:
        "<%= config.bin %> <%= command.id %> my-bucket secret.txt ./secret.txt --encryption AES256",
    },
  ];

  static override readonly args = {
    bucketName: Args.string({
      name: "bucketName",
      description: "Name of the S3 bucket",
      required: true,
    }),
    key: Args.string({
      name: "key",
      description: "Object key (path) in the bucket",
      required: true,
    }),
    filePath: Args.string({
      name: "filePath",
      description: "Local file path to upload",
      required: true,
    }),
  };

  static override readonly flags = {
    "content-type": Flags.string({
      description: "Content-Type (MIME type)",
      helpValue: "TYPE",
    }),

    metadata: Flags.string({
      description: "Custom metadata (JSON object)",
      helpValue: "JSON",
    }),

    "storage-class": Flags.string({
      description: "Storage class",
      options: S3StorageClassSchema.options,
      helpValue: "CLASS",
    }),

    acl: Flags.string({
      description: "Access control list",
      options: S3ACLSchema.options,
      helpValue: "ACL",
    }),

    encryption: Flags.string({
      description: "Server-side encryption",
      options: S3ServerSideEncryptionSchema.options,
      helpValue: "ENCRYPTION",
    }),

    "kms-key-id": Flags.string({
      description: "KMS key ID for encryption (when using aws:kms)",
      helpValue: "KEY_ID",
    }),

    ...BaseCommand.commonFlags,
  };

  /**
   * Execute S3 put object command
   *
   * @returns Promise that resolves when command completes
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(S3PutObjectCommand);

    try {
      // Parse metadata if provided
      const metadata = flags.metadata
        ? parseJsonStringInput(flags.metadata, "metadata")
        : undefined;

      // Validate inputs
      const input = S3PutObjectSchema.parse({
        bucketName: args.bucketName,
        key: args.key,
        filePath: path.resolve(process.cwd(), args.filePath),
        contentType: flags["content-type"],
        metadata,
        storageClass: flags["storage-class"],
        acl: flags.acl,
        serverSideEncryption: flags.encryption,
        sseKmsKeyId: flags["kms-key-id"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create service
      const serviceConfig = {
        ...(flags.verbose && { verbose: flags.verbose }),
        ...(flags.region && { region: flags.region }),
        ...(flags.profile && { profile: flags.profile }),
      };
      const s3Service = new S3Service(this.getServiceConfig(serviceConfig));

      // Upload object
      const clientConfig = {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      };

      const putOptions = {
        ...(input.contentType && { contentType: input.contentType }),
        ...(input.metadata && { metadata: input.metadata }),
        ...(input.storageClass && { storageClass: input.storageClass }),
        ...(input.acl && { acl: input.acl }),
        ...(input.serverSideEncryption && { serverSideEncryption: input.serverSideEncryption }),
        ...(input.sseKmsKeyId && { sseKmsKeyId: input.sseKmsKeyId }),
      };

      const result = await s3Service.putObject(
        input.bucketName,
        input.key,
        input.filePath,
        clientConfig,
        putOptions,
      );

      // Display success
      const sizeFormatted = this.formatBytes(result.contentLength);
      this.log(`Uploaded ${sizeFormatted} to s3://${input.bucketName}/${input.key}`);

      if (flags.verbose) {
        this.displayVerboseOutput(result);
      }
    } catch (error) {
      const formattedError = formatS3Error(error, flags.verbose, "upload object");
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display verbose output for upload result
   *
   * @param result - Upload result from S3 service
   *
   * @private
   */
  private displayVerboseOutput(result: {
    etag: string | undefined;
    versionId: string | undefined;
    serverSideEncryption: string | undefined;
  }): void {
    this.log(`ETag: ${result.etag}`);
    if (result.versionId) {
      this.log(`Version ID: ${result.versionId}`);
    }
    if (result.serverSideEncryption) {
      this.log(`Encryption: ${result.serverSideEncryption}`);
    }
  }

  /**
   * Format bytes to human-readable string
   *
   * @param bytes - Number of bytes
   * @returns Formatted string with appropriate unit
   *
   * @private
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** index).toFixed(2)} ${sizes[index]}`;
  }
}
