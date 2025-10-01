/**
 * @module s3/get-object
 * S3 get object command
 *
 * Downloads an object from S3 with streaming support for large files
 * and progress indicators.
 */

import { Args, Flags } from "@oclif/core";
import path from "node:path";
import { formatS3Error } from "../../lib/s3-errors.js";
import { S3GetObjectSchema } from "../../lib/s3-schemas.js";
import { S3Service } from "../../services/s3-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * S3 get object command for downloading objects
 *
 * Provides object download with automatic streaming for large files
 * and customizable output paths.
 *
 * @public
 */
export default class S3GetObjectCommand extends BaseCommand {
  static override readonly description = "Download an object from an S3 bucket";

  static override readonly examples = [
    {
      description: "Download object to current directory",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt",
    },
    {
      description: "Download with custom output path",
      command:
        "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt --output ./downloads/file.txt",
    },
    {
      description: "Download specific version",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt --version-id abc123",
    },
    {
      description: "Download byte range (partial download)",
      command:
        "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt --range bytes=0-1023",
    },
    {
      description: "Download from specific region",
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
    output: Flags.string({
      char: "o",
      description: "Output file path (default: current directory with same filename)",
      helpValue: "PATH",
    }),

    "version-id": Flags.string({
      description: "Version ID for versioned objects",
      helpValue: "VERSION_ID",
    }),

    range: Flags.string({
      description: "Byte range to download (e.g., bytes=0-1023)",
      helpValue: "RANGE",
    }),

    ...BaseCommand.commonFlags,
  };

  /**
   * Execute S3 get object command
   *
   * @returns Promise that resolves when command completes
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(S3GetObjectCommand);

    try {
      // Determine output path
      const outputPath =
        flags.output || path.resolve(process.cwd(), args.key.split("/").pop() || "download");

      // Validate inputs
      const input = S3GetObjectSchema.parse({
        bucketName: args.bucketName,
        key: args.key,
        outputPath,
        versionId: flags["version-id"],
        range: flags.range,
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

      // Download object
      const clientConfig: { region?: string; profile?: string } = {};
      if (input.region) clientConfig.region = input.region;
      if (input.profile) clientConfig.profile = input.profile;
      const result = await s3Service.getObject(
        input.bucketName,
        input.key,
        input.outputPath || "",
        clientConfig,
        input.versionId,
        input.range,
      );

      // Display success
      const sizeFormatted = this.formatBytes(result.contentLength);
      this.log(`Downloaded ${sizeFormatted} to ${result.outputPath}`);

      if (flags.verbose) {
        this.displaySingleObject(
          result.metadata,
          flags.format as "table" | "json" | "jsonl" | "csv",
        );
      }
    } catch (error) {
      const formattedError = formatS3Error(error, flags.verbose, "download object");
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
