/**
 * @module s3/list-objects
 * S3 list objects command
 *
 * Lists objects in an S3 bucket with support for prefix filtering,
 * pagination, and multiple output formats.
 */

import { Args, Flags } from "@oclif/core";
import { formatBytes } from "../../lib/format-utilities.js";
import { formatS3Error } from "../../lib/s3-errors.js";
import { S3ListObjectsSchema } from "../../lib/s3-schemas.js";
import { S3Service } from "../../services/s3-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * S3 list objects command for bucket object listing
 *
 * Provides object listing with prefix filtering, pagination control,
 * and multiple output format support.
 *
 * @public
 */
export default class S3ListObjectsCommand extends BaseCommand {
  static override readonly description = "List objects in an S3 bucket";

  static override readonly examples = [
    {
      description: "List all objects in a bucket",
      command: "<%= config.bin %> <%= command.id %> my-bucket",
    },
    {
      description: "List objects with a specific prefix",
      command: "<%= config.bin %> <%= command.id %> my-bucket --prefix photos/",
    },
    {
      description: "List objects with pagination",
      command: "<%= config.bin %> <%= command.id %> my-bucket --max-keys 100",
    },
    {
      description: "List objects with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-bucket --format json",
    },
    {
      description: "List objects from specific region",
      command: "<%= config.bin %> <%= command.id %> my-bucket --region us-west-2",
    },
  ];

  static override readonly args = {
    bucketName: Args.string({
      name: "bucketName",
      description: "Name of the S3 bucket to list objects from",
      required: true,
    }),
  };

  static override readonly flags = {
    prefix: Flags.string({
      description: "Object key prefix to filter results",
      helpValue: "PREFIX",
    }),

    delimiter: Flags.string({
      description: "Delimiter for grouping keys (typically '/')",
      helpValue: "DELIMITER",
    }),

    "max-keys": Flags.integer({
      description: "Maximum number of objects to return",
      helpValue: "NUMBER",
      default: 1000,
    }),

    "start-after": Flags.string({
      description: "Start listing after this key (pagination)",
      helpValue: "KEY",
    }),

    ...BaseCommand.commonFlags,
  };

  /**
   * Execute S3 list objects command
   *
   * @returns Promise that resolves when command completes
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(S3ListObjectsCommand);

    try {
      // Validate inputs
      const input = S3ListObjectsSchema.parse({
        bucketName: args.bucketName,
        prefix: flags.prefix,
        delimiter: flags.delimiter,
        maxKeys: flags["max-keys"],
        startAfter: flags["start-after"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create service
      const serviceConfig: { verbose?: boolean; region?: string; profile?: string } = {
        verbose: flags.verbose,
      };
      if (flags.region) serviceConfig.region = flags.region;
      if (flags.profile) serviceConfig.profile = flags.profile;
      const s3Service = new S3Service(this.getServiceConfig(serviceConfig));

      // List objects
      const clientConfig: { region?: string; profile?: string } = {};
      if (input.region) clientConfig.region = input.region;
      if (input.profile) clientConfig.profile = input.profile;

      const objects = await s3Service.listObjects(input.bucketName, clientConfig, {
        Prefix: input.prefix,
        Delimiter: input.delimiter,
        MaxKeys: input.maxKeys,
        StartAfter: input.startAfter,
      });

      // Transform for display
      const displayObjects = objects.map((object) => ({
        Key: object.Key,
        Size: formatBytes(object.Size || 0),
        LastModified: object.LastModified?.toISOString(),
        StorageClass: object.StorageClass,
        ETag: object.ETag?.replaceAll('"', ""),
      }));

      // Display output
      this.displayOutput(displayObjects, flags.format as "table" | "json" | "jsonl" | "csv", {
        emptyMessage: `No objects found in bucket '${input.bucketName}'`,
      });
    } catch (error) {
      const formattedError = formatS3Error(error, flags.verbose, "list objects");
      this.error(formattedError, { exit: 1 });
    }
  }
}
