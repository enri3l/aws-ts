/**
 * @module s3/head-object
 * S3 head object command
 *
 * Retrieves object metadata without downloading the object content.
 */

import { Args, Flags } from "@oclif/core";
import { formatS3Error } from "../../lib/s3-errors.js";
import { S3HeadObjectSchema } from "../../lib/s3-schemas.js";
import { S3Service } from "../../services/s3-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * S3 head object command for metadata retrieval
 *
 * Provides object metadata retrieval without downloading content,
 * useful for checking existence and getting object properties.
 *
 * @public
 */
export default class S3HeadObjectCommand extends BaseCommand {
  static override readonly description = "Get object metadata without downloading content";

  static override readonly examples = [
    {
      description: "Get object metadata",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt",
    },
    {
      description: "Get metadata for specific version",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt --version-id abc123",
    },
    {
      description: "Get metadata with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt --format json",
    },
    {
      description: "Get metadata from specific region",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt --region us-west-2",
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
  };

  static override readonly flags = {
    "version-id": Flags.string({
      description: "Version ID for versioned objects",
      helpValue: "VERSION_ID",
    }),

    ...BaseCommand.commonFlags,
  };

  /**
   * Execute S3 head object command
   *
   * @returns Promise that resolves when command completes
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(S3HeadObjectCommand);

    try {
      // Validate inputs
      const input = S3HeadObjectSchema.parse({
        bucketName: args.bucketName,
        key: args.key,
        versionId: flags["version-id"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create service
      const serviceConfig: { verbose?: boolean; region?: string; profile?: string } = {};
      if (flags.verbose) serviceConfig.verbose = flags.verbose;
      if (flags.region) serviceConfig.region = flags.region;
      if (flags.profile) serviceConfig.profile = flags.profile;
      const s3Service = new S3Service(this.getServiceConfig(serviceConfig));

      // Get object metadata
      const clientConfig: { region?: string; profile?: string } = {};
      if (input.region) clientConfig.region = input.region;
      if (input.profile) clientConfig.profile = input.profile;
      const result = await s3Service.headObject(
        input.bucketName,
        input.key,
        clientConfig,
        input.versionId,
      );

      // Transform for display
      const metadata = {
        Key: input.key,
        ContentLength: this.formatBytes(result.ContentLength || 0),
        ContentType: result.ContentType,
        ETag: result.ETag?.replaceAll('"', ""),
        LastModified: result.LastModified?.toISOString(),
        StorageClass: result.StorageClass,
        VersionId: result.VersionId,
        ServerSideEncryption: result.ServerSideEncryption,
        Metadata: result.Metadata,
      };

      // Display output
      this.displaySingleObject(metadata, flags.format as "table" | "json" | "jsonl" | "csv");
    } catch (error) {
      const formattedError = formatS3Error(error, flags.verbose, "get object metadata");
      this.error(formattedError, { exit: 1 });
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
