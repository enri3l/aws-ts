/**
 * ECS-specific Zod validation schemas for AWS ECS operations
 *
 * Provides comprehensive input validation for ECS cluster, service, and task operations
 * with AWS constraint validation and TypeScript type generation.
 *
 */

import { z } from "zod";

/**
 * AWS region validation schema
 * @internal
 */
const AwsRegionSchema = z
  .string()
  .min(1, "AWS region is required")
  .regex(/^[a-z0-9-]+$/, "Invalid AWS region format");

/**
 * AWS profile validation schema
 * @internal
 */
const AwsProfileSchema = z
  .string()
  .min(1, "AWS profile name is required")
  .max(64, "AWS profile name must be 64 characters or less");

/**
 * Common data format schema for output formatting
 * @internal
 */
const DataFormatSchema = z.enum(["json", "jsonl", "csv", "table"]).default("table");

/**
 * ECS cluster name validation with AWS constraints
 *
 * @public
 */
export const ECSClusterNameSchema = z
  .string()
  .min(1, "Cluster name is required")
  .max(255, "Cluster name must be 255 characters or less")
  .regex(
    /^[a-zA-Z0-9-_]+$/,
    "Cluster name can only contain letters, numbers, hyphens, and underscores",
  );

/**
 * ECS service name validation with AWS constraints
 *
 * @public
 */
export const ECSServiceNameSchema = z
  .string()
  .min(1, "Service name is required")
  .max(255, "Service name must be 255 characters or less")
  .regex(
    /^[a-zA-Z0-9-_]+$/,
    "Service name can only contain letters, numbers, hyphens, and underscores",
  );

/**
 * ECS task ARN validation
 *
 * @public
 */
export const ECSTaskArnSchema = z
  .string()
  .regex(
    /^arn:aws:ecs:[a-z0-9-]+:\d{12}:task\/([a-zA-Z0-9-_]+\/)?[a-f0-9]{32}$/,
    "Invalid ECS task ARN format",
  );

/**
 * ECS task definition ARN validation
 *
 * @public
 */
export const ECSTaskDefinitionArnSchema = z
  .string()
  .regex(
    /^arn:aws:ecs:[a-z0-9-]+:\d{12}:task-definition\/[a-zA-Z0-9-_:]+:\d+$/,
    "Invalid ECS task definition ARN format",
  );

/**
 * Common ECS configuration schema
 *
 * @public
 */
export const ECSConfigSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  format: DataFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * ECS list clusters operation schema
 *
 * @public
 */
export const ECSListClustersSchema = ECSConfigSchema.extend({
  maxItems: z.number().min(1).max(100).optional(),
});

/**
 * ECS describe clusters operation schema
 *
 * @public
 */
export const ECSDescribeClustersSchema = ECSConfigSchema.extend({
  clusterNames: z.array(ECSClusterNameSchema).min(1, "At least one cluster name is required"),
  include: z
    .array(z.enum(["ATTACHMENTS", "CONFIGURATIONS", "SETTINGS", "STATISTICS", "TAGS"]))
    .optional(),
});

/**
 * ECS create cluster operation schema
 *
 * @public
 */
export const ECSCreateClusterSchema = ECSConfigSchema.extend({
  clusterName: ECSClusterNameSchema,
  capacityProviders: z.array(z.string()).optional(),
  defaultCapacityProviderStrategy: z
    .array(
      z.object({
        capacityProvider: z.string(),
        weight: z.number().min(0).max(1000).optional(),
        base: z.number().min(0).max(100_000).optional(),
      }),
    )
    .optional(),
  tags: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

/**
 * ECS update cluster operation schema
 *
 * @public
 */
export const ECSUpdateClusterSchema = ECSConfigSchema.extend({
  clusterName: ECSClusterNameSchema,
  settings: z
    .array(
      z.object({
        name: z.enum(["containerInsights"]),
        value: z.string(),
      }),
    )
    .optional(),
  configuration: z
    .object({
      executeCommandConfiguration: z
        .object({
          kmsKeyId: z.string().optional(),
          logging: z.enum(["NONE", "DEFAULT", "OVERRIDE"]).optional(),
          logConfiguration: z
            .object({
              cloudWatchLogGroupName: z.string().optional(),
              cloudWatchEncryptionEnabled: z.boolean().optional(),
              s3BucketName: z.string().optional(),
              s3EncryptionEnabled: z.boolean().optional(),
              s3KeyPrefix: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * ECS delete cluster operation schema
 *
 * @public
 */
export const ECSDeleteClusterSchema = ECSConfigSchema.extend({
  clusterName: ECSClusterNameSchema,
  force: z.boolean().default(false),
});

/**
 * ECS list services operation schema
 *
 * @public
 */
export const ECSListServicesSchema = ECSConfigSchema.extend({
  clusterName: ECSClusterNameSchema.optional(),
  launchType: z.enum(["EC2", "FARGATE", "EXTERNAL"]).optional(),
  schedulingStrategy: z.enum(["REPLICA", "DAEMON"]).optional(),
  maxItems: z.number().min(1).max(100).optional(),
});

/**
 * ECS describe services operation schema
 *
 * @public
 */
export const ECSDescribeServicesSchema = ECSConfigSchema.extend({
  serviceNames: z.array(ECSServiceNameSchema).min(1, "At least one service name is required"),
  clusterName: ECSClusterNameSchema.optional(),
  include: z.array(z.enum(["TAGS"])).optional(),
});

/**
 * ECS create service operation schema
 *
 * @public
 */
export const ECSCreateServiceSchema = ECSConfigSchema.extend({
  serviceName: ECSServiceNameSchema,
  clusterName: ECSClusterNameSchema,
  taskDefinition: z.string().min(1, "Task definition is required"),
  desiredCount: z.number().min(0).max(10_000).default(1),
  launchType: z.enum(["EC2", "FARGATE", "EXTERNAL"]).optional(),
  capacityProviderStrategy: z
    .array(
      z.object({
        capacityProvider: z.string(),
        weight: z.number().min(0).max(1000).optional(),
        base: z.number().min(0).max(100_000).optional(),
      }),
    )
    .optional(),
  networkConfiguration: z
    .object({
      awsvpcConfiguration: z
        .object({
          subnets: z.array(z.string()).min(1, "At least one subnet is required"),
          securityGroups: z.array(z.string()).optional(),
          assignPublicIp: z.enum(["ENABLED", "DISABLED"]).optional(),
        })
        .optional(),
    })
    .optional(),
  loadBalancers: z
    .array(
      z.object({
        targetGroupArn: z.string().optional(),
        loadBalancerName: z.string().optional(),
        containerName: z.string(),
        containerPort: z.number().min(1).max(65_535),
      }),
    )
    .optional(),
  serviceRegistries: z
    .array(
      z.object({
        registryArn: z.string(),
        port: z.number().min(1).max(65_535).optional(),
        containerName: z.string().optional(),
        containerPort: z.number().min(1).max(65_535).optional(),
      }),
    )
    .optional(),
  tags: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

/**
 * ECS update service operation schema
 *
 * @public
 */
export const ECSUpdateServiceSchema = ECSConfigSchema.extend({
  serviceName: ECSServiceNameSchema,
  clusterName: ECSClusterNameSchema.optional(),
  taskDefinition: z.string().optional(),
  desiredCount: z.number().min(0).max(10_000).optional(),
  capacityProviderStrategy: z
    .array(
      z.object({
        capacityProvider: z.string(),
        weight: z.number().min(0).max(1000).optional(),
        base: z.number().min(0).max(100_000).optional(),
      }),
    )
    .optional(),
  networkConfiguration: z
    .object({
      awsvpcConfiguration: z
        .object({
          subnets: z.array(z.string()).min(1, "At least one subnet is required"),
          securityGroups: z.array(z.string()).optional(),
          assignPublicIp: z.enum(["ENABLED", "DISABLED"]).optional(),
        })
        .optional(),
    })
    .optional(),
  forceNewDeployment: z.boolean().default(false),
});

/**
 * ECS delete service operation schema
 *
 * @public
 */
export const ECSDeleteServiceSchema = ECSConfigSchema.extend({
  serviceName: ECSServiceNameSchema,
  clusterName: ECSClusterNameSchema.optional(),
  force: z.boolean().default(false),
});

/**
 * ECS list tasks operation schema
 *
 * @public
 */
export const ECSListTasksSchema = ECSConfigSchema.extend({
  clusterName: ECSClusterNameSchema.optional(),
  serviceName: ECSServiceNameSchema.optional(),
  family: z.string().optional(),
  startedBy: z.string().optional(),
  desiredStatus: z.enum(["RUNNING", "PENDING", "STOPPED"]).optional(),
  launchType: z.enum(["EC2", "FARGATE", "EXTERNAL"]).optional(),
  maxItems: z.number().min(1).max(100).optional(),
});

/**
 * ECS describe tasks operation schema
 *
 * @public
 */
export const ECSDescribeTasksSchema = ECSConfigSchema.extend({
  taskArns: z.array(ECSTaskArnSchema).min(1, "At least one task ARN is required"),
  clusterName: ECSClusterNameSchema.optional(),
  include: z.array(z.enum(["TAGS"])).optional(),
});

/**
 * ECS run task operation schema
 *
 * @public
 */
export const ECSRunTaskSchema = ECSConfigSchema.extend({
  taskDefinition: z.string().min(1, "Task definition is required"),
  clusterName: ECSClusterNameSchema.optional(),
  count: z.number().min(1).max(10).default(1),
  launchType: z.enum(["EC2", "FARGATE", "EXTERNAL"]).optional(),
  capacityProviderStrategy: z
    .array(
      z.object({
        capacityProvider: z.string(),
        weight: z.number().min(0).max(1000).optional(),
        base: z.number().min(0).max(100_000).optional(),
      }),
    )
    .optional(),
  networkConfiguration: z
    .object({
      awsvpcConfiguration: z
        .object({
          subnets: z.array(z.string()).min(1, "At least one subnet is required"),
          securityGroups: z.array(z.string()).optional(),
          assignPublicIp: z.enum(["ENABLED", "DISABLED"]).optional(),
        })
        .optional(),
    })
    .optional(),
  overrides: z
    .object({
      containerOverrides: z
        .array(
          z.object({
            name: z.string(),
            command: z.array(z.string()).optional(),
            environment: z
              .array(
                z.object({
                  name: z.string(),
                  value: z.string(),
                }),
              )
              .optional(),
            cpu: z.number().min(0).optional(),
            memory: z.number().min(0).optional(),
            memoryReservation: z.number().min(0).optional(),
          }),
        )
        .optional(),
      cpu: z.string().optional(),
      memory: z.string().optional(),
      taskRoleArn: z.string().optional(),
      executionRoleArn: z.string().optional(),
    })
    .optional(),
  startedBy: z.string().optional(),
  group: z.string().optional(),
  tags: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

/**
 * ECS stop task operation schema
 *
 * @public
 */
export const ECSStopTaskSchema = ECSConfigSchema.extend({
  taskArn: ECSTaskArnSchema,
  clusterName: ECSClusterNameSchema.optional(),
  reason: z.string().optional(),
});

/**
 * Type exports for TypeScript integration
 */
export type ECSConfig = z.infer<typeof ECSConfigSchema>;
export type ECSListClusters = z.infer<typeof ECSListClustersSchema>;
export type ECSDescribeClusters = z.infer<typeof ECSDescribeClustersSchema>;
export type ECSCreateCluster = z.infer<typeof ECSCreateClusterSchema>;
export type ECSUpdateCluster = z.infer<typeof ECSUpdateClusterSchema>;
export type ECSDeleteCluster = z.infer<typeof ECSDeleteClusterSchema>;
export type ECSListServices = z.infer<typeof ECSListServicesSchema>;
export type ECSDescribeServices = z.infer<typeof ECSDescribeServicesSchema>;
export type ECSCreateService = z.infer<typeof ECSCreateServiceSchema>;
export type ECSUpdateService = z.infer<typeof ECSUpdateServiceSchema>;
export type ECSDeleteService = z.infer<typeof ECSDeleteServiceSchema>;
export type ECSListTasks = z.infer<typeof ECSListTasksSchema>;
export type ECSDescribeTasks = z.infer<typeof ECSDescribeTasksSchema>;
export type ECSRunTask = z.infer<typeof ECSRunTaskSchema>;
export type ECSStopTask = z.infer<typeof ECSStopTaskSchema>;
