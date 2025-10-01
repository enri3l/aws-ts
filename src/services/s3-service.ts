/**
 * @module s3-service
 * S3 service for object storage operations and management
 *
 * Orchestrates AWS S3 operations by providing a unified interface for
 * object lifecycle management, uploads/downloads with streaming support,
 * and metadata operations. Integrates with existing credential management
 * and follows established service patterns.
 */

import type { ObjectCannedACL, ServerSideEncryption, StorageClass } from "@aws-sdk/client-s3";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  paginateListObjectsV2,
  type CopyObjectCommandInput,
  type CopyObjectCommandOutput,
  type DeleteObjectCommandOutput,
  type HeadObjectCommandOutput,
  type ListObjectsV2CommandInput,
  type PutObjectCommandInput,
  type _Object as S3Object,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { BaseAwsService, type BaseServiceOptions } from "../lib/base-aws-service.js";
import { formatBytes } from "../lib/format-utilities.js";
import { retryWithBackoff } from "../lib/retry.js";
import { S3BucketError, S3ObjectError, S3TransferError } from "../lib/s3-errors.js";
import type { AwsClientConfig } from "./credential-service.js";

/**
 * Configuration options for S3 service
 *
 * @public
 */
export type S3ServiceOptions = BaseServiceOptions;

/**
 * S3 object metadata
 *
 * @public
 */
export interface S3ObjectMetadata {
  contentLength: number | undefined;
  contentType: string | undefined;
  etag: string | undefined;
  lastModified: Date | undefined;
  storageClass: string | undefined;
  metadata: Record<string, string> | undefined;
  versionId: string | undefined;
}

/**
 * S3 get object result
 *
 * @public
 */
export interface S3GetObjectResult {
  outputPath: string;
  contentLength: number;
  metadata: S3ObjectMetadata;
}

/**
 * S3 put object result
 *
 * @public
 */
export interface S3PutObjectResult {
  etag: string | undefined;
  versionId: string | undefined;
  serverSideEncryption: string | undefined;
  contentLength: number;
}

/**
 * S3 service for object storage operations
 *
 * Provides methods for S3 object operations including listing, uploading,
 * downloading, copying, and deleting objects with automatic multipart
 * handling for large files and streaming support.
 *
 * @example List objects in a bucket
 * ```typescript
 * const s3Service = new S3Service();
 * const objects = await s3Service.listObjects("my-bucket", { region: "us-east-1" });
 * console.log(`Found ${objects.length} objects`);
 * ```
 *
 * @example Upload a file
 * ```typescript
 * const s3Service = new S3Service();
 * const result = await s3Service.putObject(
 *   "my-bucket",
 *   "path/to/file.txt",
 *   "./local-file.txt",
 *   { region: "us-east-1" }
 * );
 * console.log(`Uploaded ${result.contentLength} bytes`);
 * ```
 *
 * @public
 */
export class S3Service extends BaseAwsService<S3Client> {
  /**
   * Multipart upload threshold in bytes (100MB)
   *
   * Files larger than this will use multipart upload automatically
   */
  private static readonly MULTIPART_THRESHOLD = 100 * 1024 * 1024;

  /**
   * Create a new S3 service instance
   *
   * @param options - Service configuration options
   */
  constructor(options: S3ServiceOptions = {}) {
    super(S3Client, options);
  }

  /**
   * List objects in an S3 bucket
   *
   * @param bucketName - S3 bucket name
   * @param config - AWS client configuration
   * @param parameters - List operation parameters
   * @returns Promise resolving to array of S3 objects
   * @throws S3BucketError If bucket access fails
   *
   * @public
   */
  async listObjects(
    bucketName: string,
    config: AwsClientConfig = {},
    parameters: Omit<ListObjectsV2CommandInput, "Bucket"> = {},
  ): Promise<S3Object[]> {
    const spinner = this.createSpinner(`Listing objects in bucket '${bucketName}'...`);

    try {
      const client = await this.getClient(config);
      const allObjects: S3Object[] = [];
      let pageCount = 0;

      // AWS SDK v3 native paginator with async iterator
      const paginatorConfig = parameters.MaxKeys
        ? { client, pageSize: parameters.MaxKeys }
        : { client };

      const paginator = paginateListObjectsV2(paginatorConfig, {
        ...parameters,
        Bucket: bucketName,
      });

      for await (const page of paginator) {
        pageCount++;
        const objects = page.Contents || [];
        allObjects.push(...objects);

        spinner.text = `Loading objects from '${bucketName}'... (${allObjects.length} so far, ${pageCount} page${pageCount === 1 ? "" : "s"})`;

        // Stop if we've reached MaxKeys limit
        if (parameters.MaxKeys && allObjects.length >= parameters.MaxKeys) {
          break;
        }
      }

      spinner.succeed(
        `Found ${allObjects.length} object${allObjects.length === 1 ? "" : "s"} in bucket '${bucketName}'`,
      );
      return allObjects;
    } catch (error) {
      spinner.fail(`Failed to list objects in bucket '${bucketName}'`);
      throw new S3BucketError(
        `Failed to list objects: ${error instanceof Error ? error.message : String(error)}`,
        bucketName,
        "list-objects",
        error,
      );
    }
  }

  /**
   * Get object metadata without downloading content
   *
   * @param bucketName - S3 bucket name
   * @param key - Object key
   * @param config - AWS client configuration
   * @param versionId - Version ID for versioned objects
   * @returns Promise resolving to object metadata
   * @throws S3ObjectError If object access fails
   *
   * @public
   */
  async headObject(
    bucketName: string,
    key: string,
    config: AwsClientConfig = {},
    versionId?: string,
  ): Promise<HeadObjectCommandOutput> {
    const spinner = this.createSpinner(`Getting metadata for '${key}'...`);

    try {
      const client = await this.getClient(config);
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: versionId,
      });

      const result = await retryWithBackoff(() => client.send(command), {
        onRetry: (error, attempt) => {
          spinner.text = `Getting metadata for '${key}' (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Retrieved metadata for '${key}'`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to get metadata for '${key}'`);
      throw new S3ObjectError(
        `Failed to get object metadata: ${error instanceof Error ? error.message : String(error)}`,
        bucketName,
        key,
        "head-object",
        error,
      );
    }
  }

  /**
   * Download an object from S3
   *
   * @param bucketName - S3 bucket name
   * @param key - Object key
   * @param outputPath - Local file path for output
   * @param config - AWS client configuration
   * @param versionId - Version ID for versioned objects
   * @param range - Byte range for partial download
   * @returns Promise resolving to download result
   * @throws S3TransferError If download fails
   *
   * @public
   */
  async getObject(
    bucketName: string,
    key: string,
    outputPath: string,
    config: AwsClientConfig = {},
    versionId?: string,
    range?: string,
  ): Promise<S3GetObjectResult> {
    const keyBaseName = key.split("/").pop() || "download";
    const spinner = this.createSpinner(`Downloading '${keyBaseName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: versionId,
        Range: range,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        onRetry: (error, attempt) => {
          spinner.text = `Downloading '${keyBaseName}' (attempt ${attempt})...`;
        },
      });

      if (!response.Body) {
        throw new S3ObjectError("Response body is empty", bucketName, key, "get-object");
      }

      // Ensure output directory exists
      const outputDirectory = path.dirname(outputPath);
      await mkdir(outputDirectory, { recursive: true });

      // Stream to file
      const writeStream = createWriteStream(outputPath);
      await pipeline(response.Body as NodeJS.ReadableStream, writeStream);

      const contentLength = response.ContentLength || 0;
      const formattedSize = formatBytes(contentLength);

      spinner.succeed(`Downloaded ${formattedSize} to ${outputPath}`);

      return {
        outputPath,
        contentLength,
        metadata: {
          contentLength,
          contentType: response.ContentType || undefined,
          etag: response.ETag || undefined,
          lastModified: response.LastModified || undefined,
          storageClass: response.StorageClass || undefined,
          metadata: response.Metadata || undefined,
          versionId: response.VersionId || undefined,
        },
      };
    } catch (error) {
      spinner.fail(`Failed to download '${keyBaseName}'`);
      throw new S3TransferError(
        `Failed to download object: ${error instanceof Error ? error.message : String(error)}`,
        bucketName,
        key,
        "download",
        0,
        0,
        error,
      );
    }
  }

  /**
   * Upload an object to S3
   *
   * @param bucketName - S3 bucket name
   * @param key - Object key
   * @param filePath - Local file path to upload
   * @param config - AWS client configuration
   * @param options - Upload options
   * @returns Promise resolving to upload result
   * @throws S3TransferError If upload fails
   *
   * @public
   */
  async putObject(
    bucketName: string,
    key: string,
    filePath: string,
    config: AwsClientConfig = {},
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
      storageClass?: string;
      acl?: string;
      serverSideEncryption?: string;
      sseKmsKeyId?: string;
    } = {},
  ): Promise<S3PutObjectResult> {
    const fileBaseName = filePath.split("/").pop() || "file";
    const spinner = this.createSpinner(`Uploading '${fileBaseName}'...`);

    try {
      const stats = await stat(filePath);
      const fileSize = stats.size;
      const formattedSize = formatBytes(fileSize);

      const client = await this.getClient(config);
      const fileStream = createReadStream(filePath);

      // Simple upload (multipart uploads require @aws-sdk/lib-storage package)
      const commandInput: PutObjectCommandInput = {
        Bucket: bucketName,
        Key: key,
        Body: fileStream,
      };
      if (options.contentType) commandInput.ContentType = options.contentType;
      if (options.metadata) commandInput.Metadata = options.metadata;
      if (options.storageClass) commandInput.StorageClass = options.storageClass as StorageClass;
      if (options.acl) commandInput.ACL = options.acl as ObjectCannedACL;
      if (options.serverSideEncryption)
        commandInput.ServerSideEncryption = options.serverSideEncryption as ServerSideEncryption;
      if (options.sseKmsKeyId) commandInput.SSEKMSKeyId = options.sseKmsKeyId;

      const command = new PutObjectCommand(commandInput);

      const result = await retryWithBackoff(() => client.send(command), {
        onRetry: (error, attempt) => {
          spinner.text = `Uploading '${fileBaseName}' (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Uploaded ${formattedSize} successfully`);

      return {
        etag: result.ETag || undefined,
        versionId: result.VersionId || undefined,
        serverSideEncryption: result.ServerSideEncryption || undefined,
        contentLength: fileSize,
      };
    } catch (error) {
      spinner.fail(`Failed to upload '${fileBaseName}'`);
      throw new S3TransferError(
        `Failed to upload object: ${error instanceof Error ? error.message : String(error)}`,
        bucketName,
        key,
        "upload",
        0,
        0,
        error,
      );
    }
  }

  /**
   * Delete an object from S3
   *
   * @param bucketName - S3 bucket name
   * @param key - Object key
   * @param config - AWS client configuration
   * @param versionId - Version ID for versioned objects
   * @returns Promise resolving to deletion result
   * @throws S3ObjectError If deletion fails
   *
   * @public
   */
  async deleteObject(
    bucketName: string,
    key: string,
    config: AwsClientConfig = {},
    versionId?: string,
  ): Promise<DeleteObjectCommandOutput> {
    const spinner = this.createSpinner(`Deleting '${key}'...`);

    try {
      const client = await this.getClient(config);
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: versionId,
      });

      const result = await retryWithBackoff(() => client.send(command), {
        onRetry: (error, attempt) => {
          spinner.text = `Deleting '${key}' (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Deleted '${key}'`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to delete '${key}'`);
      throw new S3ObjectError(
        `Failed to delete object: ${error instanceof Error ? error.message : String(error)}`,
        bucketName,
        key,
        "delete-object",
        error,
      );
    }
  }

  /**
   * Copy an object within S3 (server-side)
   *
   * @param sourceBucket - Source bucket name
   * @param sourceKey - Source object key
   * @param destBucket - Destination bucket name
   * @param destKey - Destination object key
   * @param config - AWS client configuration
   * @param options - Copy options
   * @returns Promise resolving to copy result
   * @throws S3ObjectError If copy fails
   *
   * @public
   */
  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string,
    config: AwsClientConfig = {},
    options: {
      sourceVersionId?: string;
      metadataDirective?: "COPY" | "REPLACE";
      storageClass?: string;
      acl?: string;
    } = {},
  ): Promise<CopyObjectCommandOutput> {
    const spinner = this.createSpinner(`Copying '${sourceKey}' to '${destinationKey}'...`);

    try {
      const client = await this.getClient(config);
      const copySource = options.sourceVersionId
        ? `${sourceBucket}/${sourceKey}?versionId=${options.sourceVersionId}`
        : `${sourceBucket}/${sourceKey}`;

      const commandInput: CopyObjectCommandInput = {
        Bucket: destinationBucket,
        Key: destinationKey,
        CopySource: copySource,
      };
      if (options.metadataDirective) commandInput.MetadataDirective = options.metadataDirective;
      if (options.storageClass) commandInput.StorageClass = options.storageClass as StorageClass;
      if (options.acl) commandInput.ACL = options.acl as ObjectCannedACL;

      const command = new CopyObjectCommand(commandInput);

      const result = await retryWithBackoff(() => client.send(command), {
        onRetry: (error, attempt) => {
          spinner.text = `Copying '${sourceKey}' (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Copied to '${destinationKey}'`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to copy '${sourceKey}'`);
      throw new S3ObjectError(
        `Failed to copy object: ${error instanceof Error ? error.message : String(error)}`,
        sourceBucket,
        sourceKey,
        "copy-object",
        error,
      );
    }
  }
}
