/**
 * @module s3/copy-object
 * S3 copy object command
 *
 * Copies an object within S3 (server-side) with support for
 * cross-bucket copying and metadata handling.
 */

import { Args, Flags } from "@oclif/core";
import { formatS3Error } from "../../lib/s3-errors.js";
import { S3ACLSchema, S3CopyObjectSchema, S3StorageClassSchema } from "../../lib/s3-schemas.js";
import { S3Service } from "../../services/s3-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * S3 copy object command for server-side object copying
 *
 * Provides server-side object copying within S3 with support for
 * cross-bucket copies, metadata handling, and storage class changes.
 *
 * @public
 */
export default class S3CopyObjectCommand extends BaseCommand {
  static override readonly description = "Copy an object within S3 (server-side)";

  static override readonly examples = [
    {
      description: "Copy within same bucket",
      command: "<%= config.bin %> <%= command.id %> my-bucket source.txt my-bucket destination.txt",
    },
    {
      description: "Copy to different bucket",
      command: "<%= config.bin %> <%= command.id %> source-bucket file.txt dest-bucket file.txt",
    },
    {
      description: "Copy specific version",
      command:
        "<%= config.bin %> <%= command.id %> my-bucket source.txt my-bucket dest.txt --source-version-id abc123",
    },
    {
      description: "Copy and replace metadata",
      command:
        "<%= config.bin %> <%= command.id %> my-bucket source.txt my-bucket dest.txt --metadata-directive REPLACE",
    },
    {
      description: "Copy to different storage class",
      command:
        "<%= config.bin %> <%= command.id %> my-bucket source.txt my-bucket dest.txt --storage-class GLACIER",
    },
  ];

  static override readonly args = {
    sourceBucket: Args.string({
      name: "sourceBucket",
      description: "Source bucket name",
      required: true,
    }),
    sourceKey: Args.string({
      name: "sourceKey",
      description: "Source object key",
      required: true,
    }),
    destBucket: Args.string({
      name: "destBucket",
      description: "Destination bucket name",
      required: true,
    }),
    destKey: Args.string({
      name: "destKey",
      description: "Destination object key",
      required: true,
    }),
  };

  static override readonly flags = {
    "source-version-id": Flags.string({
      description: "Source version ID for versioned objects",
      helpValue: "VERSION_ID",
    }),

    "metadata-directive": Flags.string({
      description: "Metadata directive (COPY or REPLACE)",
      options: ["COPY", "REPLACE"],
      helpValue: "DIRECTIVE",
    }),

    "storage-class": Flags.string({
      description: "Storage class for destination",
      options: S3StorageClassSchema.options,
      helpValue: "CLASS",
    }),

    acl: Flags.string({
      description: "ACL for destination",
      options: S3ACLSchema.options,
      helpValue: "ACL",
    }),

    ...BaseCommand.commonFlags,
  };

  /**
   * Execute S3 copy object command
   *
   * @returns Promise that resolves when command completes
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(S3CopyObjectCommand);

    try {
      // Validate inputs
      const input = S3CopyObjectSchema.parse({
        sourceBucket: args.sourceBucket,
        sourceKey: args.sourceKey,
        destBucket: args.destBucket,
        destKey: args.destKey,
        sourceVersionId: flags["source-version-id"],
        metadataDirective: flags["metadata-directive"],
        storageClass: flags["storage-class"],
        acl: flags.acl,
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

      // Copy object
      const clientConfig: { region?: string; profile?: string } = {};
      if (input.region) clientConfig.region = input.region;
      if (input.profile) clientConfig.profile = input.profile;

      const copyOptions: {
        sourceVersionId?: string;
        metadataDirective?: "COPY" | "REPLACE";
        storageClass?: string;
        acl?: string;
      } = {};
      if (input.sourceVersionId) copyOptions.sourceVersionId = input.sourceVersionId;
      if (input.metadataDirective) copyOptions.metadataDirective = input.metadataDirective;
      if (input.storageClass) copyOptions.storageClass = input.storageClass;
      if (input.acl) copyOptions.acl = input.acl;

      const result = await s3Service.copyObject(
        input.sourceBucket,
        input.sourceKey,
        input.destBucket, // destinationBucket
        input.destKey, // destinationKey
        clientConfig,
        copyOptions,
      );

      // Display success
      this.log(
        `Copied 's3://${input.sourceBucket}/${input.sourceKey}' to 's3://${input.destBucket}/${input.destKey}'`,
      );

      if (flags.verbose) {
        this.log(`ETag: ${result.CopyObjectResult?.ETag}`);
        if (result.VersionId) {
          this.log(`Version ID: ${result.VersionId}`);
        }
      }
    } catch (error) {
      const formattedError = formatS3Error(error, flags.verbose, "copy object");
      this.error(formattedError, { exit: 1 });
    }
  }
}
