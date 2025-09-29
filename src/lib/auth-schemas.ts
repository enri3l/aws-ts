/**
 * Authentication-specific Zod schemas for input validation
 *
 * Provides validation schemas for authentication commands
 * and operations with automatic TypeScript type generation.
 *
 */

import { z } from "zod";
import { AwsProfileSchema } from "./schemas.js";

/**
 * SSO configuration schema for interactive setup
 *
 * @public
 */
export const SsoConfigSchema = z.object({
  /**
   * SSO start URL for the organization
   */
  ssoStartUrl: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "SSO start URL must be a valid HTTPS URL"),

  /**
   * SSO region where the identity store is located
   */
  ssoRegion: z
    .string()
    .min(1, "SSO region is required")
    .regex(/^[a-z0-9-]+$/, "SSO region must contain only lowercase letters, numbers, and hyphens"),

  /**
   * SSO account ID to authenticate with
   */
  ssoAccountId: z.string().regex(/^\d{12}$/, "SSO account ID must be a 12-digit number"),

  /**
   * SSO role name to assume
   */
  ssoRoleName: z
    .string()
    .min(1, "SSO role name is required")
    .max(64, "SSO role name must be 64 characters or less"),
});

/**
 * Authentication login command schema
 *
 * @public
 */
export const AuthLoginSchema = z.object({
  /**
   * AWS profile name to authenticate
   */
  profile: AwsProfileSchema.optional(),

  /**
   * Force re-authentication even if already logged in
   */
  force: z.boolean().default(false),

  /**
   * Interactive SSO configuration setup
   */
  configure: z.boolean().default(false),

  /**
   * SSO configuration for new profile setup
   */
  ssoConfig: SsoConfigSchema.optional(),
});

/**
 * Authentication status command schema
 *
 * @public
 */
export const AuthStatusSchema = z.object({
  /**
   * AWS profile name to check status for
   */
  profile: AwsProfileSchema.optional(),

  /**
   * Show detailed status information
   */
  detailed: z.boolean().default(false),

  /**
   * Check all configured profiles
   */
  allProfiles: z.boolean().default(false),
});

/**
 * Authentication logout command schema
 *
 * @public
 */
export const AuthLogoutSchema = z.object({
  /**
   * AWS profile name to logout from
   */
  profile: AwsProfileSchema.optional(),

  /**
   * Logout from all configured profiles
   */
  allProfiles: z.boolean().default(false),
});

/**
 * Profile listing command schema
 *
 * @public
 */
export const AuthProfilesSchema = z.object({
  /**
   * Show detailed profile information
   */
  detailed: z.boolean().default(false),

  /**
   * Show only active profiles
   */
  activeOnly: z.boolean().default(false),

  /**
   * Output format for profile listing
   */
  format: z.enum(["table", "json", "csv"]).default("table"),
});

/**
 * Profile switching command schema
 *
 * @public
 */
export const AuthSwitchSchema = z.object({
  /**
   * Target AWS profile name to switch to
   */
  profile: AwsProfileSchema,

  /**
   * Validate credentials after switching
   */
  validate: z.boolean().default(true),

  /**
   * Set as default profile for the session
   */
  setDefault: z.boolean().default(false),
});

/**
 * Profile information schema for status responses
 *
 * @public
 */
export const ProfileInfoSchema = z.object({
  /**
   * Profile name
   */
  name: z.string(),

  /**
   * Profile type (sso, iam, or credentials)
   */
  type: z.enum(["sso", "iam", "credentials"]),

  /**
   * Whether the profile is currently active
   */
  active: z.boolean(),

  /**
   * Whether credentials are valid
   */
  credentialsValid: z.boolean(),

  /**
   * Token expiry time for SSO profiles
   */
  tokenExpiry: z.date().optional(),

  /**
   * AWS region for the profile
   */
  region: z.string().optional(),

  /**
   * Output format for the profile
   */
  output: z.string().optional(),

  /**
   * SSO start URL for SSO profiles
   */
  ssoStartUrl: z
    .string()
    .refine((value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, "SSO start URL must be a valid URL")
    .optional(),

  /**
   * SSO region for SSO profiles
   */
  ssoRegion: z.string().optional(),

  /**
   * SSO account ID for SSO profiles
   */
  ssoAccountId: z.string().optional(),

  /**
   * SSO role name for SSO profiles
   */
  ssoRoleName: z.string().optional(),

  /**
   * SSO session name for SSO profiles
   */
  ssoSession: z.string().optional(),

  /**
   * IAM role ARN for role-based profiles
   */
  roleArn: z.string().optional(),

  /**
   * Source profile for role-based profiles
   */
  sourceProfile: z.string().optional(),
});

/**
 * Authentication status response schema
 *
 * @public
 */
export const AuthStatusResponseSchema = z.object({
  /**
   * Current active profile
   */
  activeProfile: z.string().optional(),

  /**
   * List of all configured profiles
   */
  profiles: z.array(ProfileInfoSchema),

  /**
   * Overall authentication status
   */
  authenticated: z.boolean(),

  /**
   * AWS CLI installation status
   */
  awsCliInstalled: z.boolean(),

  /**
   * AWS CLI version
   */
  awsCliVersion: z.string().optional(),
});

/**
 * Inferred TypeScript types from authentication schemas
 */
export type SsoConfig = z.infer<typeof SsoConfigSchema>;
export type AuthLogin = z.infer<typeof AuthLoginSchema>;
export type AuthStatus = z.infer<typeof AuthStatusSchema>;
export type AuthLogout = z.infer<typeof AuthLogoutSchema>;
export type AuthProfiles = z.infer<typeof AuthProfilesSchema>;
export type AuthSwitch = z.infer<typeof AuthSwitchSchema>;
export type ProfileInfo = z.infer<typeof ProfileInfoSchema>;
export type AuthStatusResponse = z.infer<typeof AuthStatusResponseSchema>;

/**
 * Validation helper for SSO configuration
 *
 * @param config - SSO configuration to validate
 * @returns Validated SSO configuration
 * @throws When SSO configuration validation fails
 *
 * @public
 */
export function validateSsoConfig(config: unknown): SsoConfig {
  return SsoConfigSchema.parse(config);
}

/**
 * Validation helper for profile information
 *
 * @param profileInfo - Profile information to validate
 * @returns Validated profile information
 * @throws When profile information validation fails
 *
 * @public
 */
export function validateProfileInfo(profileInfo: unknown): ProfileInfo {
  return ProfileInfoSchema.parse(profileInfo);
}
