/**
 * @module s3/delete-object
 * S3 delete object command
 *
 * Deletes an object from S3 with support for versioned objects.
 */

import { Args, Flags } from "@oclif/core";
import { formatS3Error } from "../../lib/s3-errors.js";
import { S3DeleteObjectSchema } from "../../lib/s3-schemas.js";
import { S3Service } from "../../services/s3-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * S3 delete object command for removing objects
 *
 * Provides object deletion with support for versioned buckets
 * and version-specific deletion.
 *
 * @public
 */
export default class S3DeleteObjectCommand extends BaseCommand {
  static override readonly description = "Delete an object from an S3 bucket";

  static override readonly examples = [
    {
      description: "Delete an object",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt",
    },
    {
      description: "Delete specific version",
      command: "<%= config.bin %> <%= command.id %> my-bucket path/to/file.txt --version-id abc123",
    },
    {
      description: "Delete from specific region",
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
   * Execute S3 delete object command
   *
   * @returns Promise that resolves when command completes
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(S3DeleteObjectCommand);

    try {
      // Validate inputs
      const input = S3DeleteObjectSchema.parse({
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

      // Delete object
      const clientConfig: { region?: string; profile?: string } = {};
      if (input.region) clientConfig.region = input.region;
      if (input.profile) clientConfig.profile = input.profile;
      const result = await s3Service.deleteObject(
        input.bucketName,
        input.key,
        clientConfig,
        input.versionId,
      );

      // Display success
      this.log(`Deleted '${input.key}' from bucket '${input.bucketName}'`);

      if (flags.verbose) {
        if (result.DeleteMarker) {
          this.log("Delete marker created");
        }
        if (result.VersionId) {
          this.log(`Version ID: ${result.VersionId}`);
        }
      }
    } catch (error) {
      const formattedError = formatS3Error(error, flags.verbose, "delete object");
      this.error(formattedError, { exit: 1 });
    }
  }
}
