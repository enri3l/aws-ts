/**
 * @module ssm/session-schemas
 * Session Manager Zod schemas for session operations
 *
 * Provides validation schemas for SSM Session Manager operations
 * including interactive sessions, SSH connections, and port forwarding.
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "../schemas.js";
import {
  DocumentNameSchema,
  InstanceIdSchema,
  PortNumberSchema,
  SessionIdSchema,
  SessionReasonSchema,
  SessionStateSchema,
} from "./ssm-schemas.js";

/**
 * Start session input validation
 *
 * @public
 */
export const StartSessionInputSchema = z.object({
  instanceId: InstanceIdSchema,
  document: DocumentNameSchema.default("SSM-SessionManagerRunShell"),
  reason: SessionReasonSchema,
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  verbose: z.boolean().optional(),
});

/**
 * Start session input type
 *
 * @public
 */
export type StartSessionInput = z.infer<typeof StartSessionInputSchema>;

/**
 * Terminate session input validation
 *
 * @public
 */
export const TerminateSessionInputSchema = z.object({
  sessionId: SessionIdSchema,
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  verbose: z.boolean().optional(),
});

/**
 * Terminate session input type
 *
 * @public
 */
export type TerminateSessionInput = z.infer<typeof TerminateSessionInputSchema>;

/**
 * Describe sessions input validation
 *
 * @public
 */
export const DescribeSessionsInputSchema = z.object({
  state: SessionStateSchema.default("Active"),
  maxResults: z.number().int().min(1).max(50).optional(),
  nextToken: z.string().optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),
  verbose: z.boolean().optional(),
});

/**
 * Describe sessions input type
 *
 * @public
 */
export type DescribeSessionsInput = z.infer<typeof DescribeSessionsInputSchema>;

/**
 * SSH connection input validation
 *
 * @public
 */
export const SshConnectionInputSchema = z.object({
  instanceId: InstanceIdSchema,
  keyPath: z.string().optional(),
  username: z.string().optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  verbose: z.boolean().optional(),
});

/**
 * SSH connection input type
 *
 * @public
 */
export type SshConnectionInput = z.infer<typeof SshConnectionInputSchema>;

/**
 * Port forwarding input validation
 *
 * @public
 */
export const PortForwardingInputSchema = z.object({
  instanceId: InstanceIdSchema,
  remotePort: PortNumberSchema,
  localPort: PortNumberSchema.optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  verbose: z.boolean().optional(),
});

/**
 * Port forwarding input type
 *
 * @public
 */
export type PortForwardingInput = z.infer<typeof PortForwardingInputSchema>;

/**
 * Remote port forwarding input validation
 *
 * @public
 */
export const RemotePortForwardingInputSchema = z.object({
  instanceId: InstanceIdSchema,
  remoteHost: z.string().min(1, "Remote host is required"),
  remotePort: PortNumberSchema,
  localPort: PortNumberSchema.optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  verbose: z.boolean().optional(),
});

/**
 * Remote port forwarding input type
 *
 * @public
 */
export type RemotePortForwardingInput = z.infer<typeof RemotePortForwardingInputSchema>;
