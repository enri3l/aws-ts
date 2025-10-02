/**
 * @module ssm/document-schemas
 * Document Manager Zod schemas for document operations
 *
 * Provides validation schemas for SSM document discovery
 * and information retrieval.
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "../schemas.js";
import { DocumentNameSchema } from "./ssm-schemas.js";

/**
 * Document type filter validation
 *
 * @public
 */
export const DocumentTypeSchema = z.enum([
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
]);

/**
 * Document owner filter validation
 *
 * @public
 */
export const DocumentOwnerSchema = z.enum(["Self", "Amazon", "All", "ThirdParty"]);

/**
 * List documents input validation
 *
 * @public
 */
export const ListDocumentsInputSchema = z.object({
  documentType: DocumentTypeSchema.optional(),
  owner: DocumentOwnerSchema.default("All"),
  platformType: z.string().optional(),
  maxResults: z.number().int().min(1).max(50).optional(),
  nextToken: z.string().optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),
  verbose: z.boolean().optional(),
});

/**
 * List documents input type
 *
 * @public
 */
export type ListDocumentsInput = z.infer<typeof ListDocumentsInputSchema>;

/**
 * Describe document input validation
 *
 * @public
 */
export const DescribeDocumentInputSchema = z.object({
  name: DocumentNameSchema,
  documentVersion: z.string().optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),
  verbose: z.boolean().optional(),
});

/**
 * Describe document input type
 *
 * @public
 */
export type DescribeDocumentInput = z.infer<typeof DescribeDocumentInputSchema>;
