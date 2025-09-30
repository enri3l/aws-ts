/**
 * @module auth-guidance
 * Authentication error guidance system for AWS CLI operations
 *
 * Provides user-friendly resolution guidance for authentication-specific errors.
 * Separated from error definitions to avoid circular imports.
 *
 */

/**
 * Error-like interface for structural typing
 *
 * Allows guidance functions to work with any error object that has
 * the required code and metadata properties, avoiding circular imports.
 */
interface ErrorLike {
  code: string;
  metadata: Record<string, unknown>;
}

/**
 * Get guidance for AuthenticationError
 *
 * @param error - The authentication error
 * @returns Formatted guidance message
 * @internal
 */
function getAuthenticationErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const profile = error.metadata.profile as string;
  const profileInfo = profile ? ` --profile ${profile}` : "";

  switch (operation) {
    case "sso-login": {
      return [
        "SSO login failed. Here's how to resolve it:",
        "1. Configure SSO profile: aws configure sso" + profileInfo,
        "2. Login to SSO: aws sso login" + profileInfo,
        "3. Verify access: aws sts get-caller-identity" + profileInfo,
        "",
        "Note: Ensure your SSO start URL and region are correct in ~/.aws/config",
      ].join("\n");
    }
    case "credential-validation": {
      return [
        "Your AWS credentials have expired or are invalid:",
        "1. Refresh SSO credentials: aws sso login" + profileInfo,
        "2. For IAM users: aws configure" + profileInfo,
        "3. Test credentials: aws sts get-caller-identity" + profileInfo,
        "",
        "Note: SSO tokens typically expire after 8 hours",
      ].join("\n");
    }
    case "sso-configure": {
      return [
        "SSO configuration failed:",
        "1. Ensure you have the correct SSO start URL from your admin",
        "2. Check your network connection to the SSO portal",
        "3. Verify the SSO region matches your organization's setup",
        "4. Try: aws configure sso" + profileInfo + " --no-browser",
        "",
        "Note: Contact your AWS administrator if SSO details are unknown",
      ].join("\n");
    }
    case "token-refresh": {
      return [
        "Token refresh failed:",
        "1. Clear SSO cache: aws sso logout" + profileInfo,
        "2. Re-authenticate: aws sso login" + profileInfo,
        "3. If still failing, reconfigure: aws configure sso" + profileInfo,
        "",
        "Note: This often happens when SSO configuration has changed",
      ].join("\n");
    }
    default: {
      return [
        "Authentication error occurred:",
        "1. Check profile configuration: aws configure list" + profileInfo,
        "2. For SSO: aws sso login" + profileInfo,
        "3. For IAM: aws configure" + profileInfo,
        "",
        "Tip: Run 'aws-ts auth status --detailed' for more information",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for ProfileError
 *
 * @param error - The profile error
 * @returns Formatted guidance message
 * @internal
 */
function getProfileErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const profile = error.metadata.profileName as string;

  switch (operation) {
    case "profile-discovery": {
      return [
        "No AWS profiles found:",
        "1. Create AWS config directory: mkdir -p ~/.aws",
        "2. Configure first profile: aws configure sso",
        "3. Or set up IAM credentials: aws configure",
        "",
        "Note: Your AWS config file should be at ~/.aws/config",
      ].join("\n");
    }
    case "profile-switch": {
      return [
        "Profile switch failed:",
        "1. List available profiles: aws-ts auth profiles",
        profile
          ? `2. Check profile exists: aws configure list --profile ${profile}`
          : "2. Verify profile name spelling",
        "3. Create missing profile: aws configure sso",
        "",
        "Note: Profile names are case-sensitive",
      ].join("\n");
    }
    case "profile-lookup": {
      return [
        "Profile not found:",
        "1. List profiles: aws-ts auth profiles",
        "2. Create profile: aws configure sso",
        profile ? `3. Or check spelling of '${profile}'` : "3. Verify profile name",
        "",
        "Tip: Use 'default' if no specific profile is needed",
      ].join("\n");
    }
    default: {
      return [
        "Profile configuration error:",
        "1. Check ~/.aws/config file exists and is readable",
        "2. Verify profile syntax: [profile name] for named profiles",
        "3. Recreate profile: aws configure sso",
        "",
        "Tip: Run 'aws configure list' to see current configuration",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for TokenError
 *
 * @param error - The token error
 * @returns Formatted guidance message
 * @internal
 */
function getTokenErrorGuidance(error: ErrorLike): string {
  const tokenType = error.metadata.tokenType as string;

  if (tokenType === "sso-token") {
    return [
      "Your SSO token has expired:",
      "1. Login again: aws sso login --profile <profile>",
      "2. If login fails: aws sso logout then aws sso login",
      "3. For persistent issues: aws configure sso",
      "",
      "Note: SSO tokens expire automatically for security",
    ].join("\n");
  }

  return [
    "Token error occurred:",
    "1. Refresh credentials: aws sso login --profile <profile>",
    "2. Clear token cache: aws sso logout",
    "3. Reconfigure if needed: aws configure",
    "",
    "Tip: Check token expiry with 'aws-ts auth status'",
  ].join("\n");
}

/**
 * Get guidance for AwsCliError
 *
 * @param error - The AWS CLI error
 * @returns Formatted guidance message
 * @internal
 */
function getAwsCliErrorGuidance(error: ErrorLike): string {
  const exitCode = error.metadata.exitCode as number;
  const command = error.metadata.command as string;

  if (exitCode === 127) {
    return [
      "AWS CLI not found:",
      "1. Install AWS CLI v2: https://aws.amazon.com/cli/",
      "2. Add to PATH: export PATH=$PATH:/usr/local/bin/aws",
      "3. Verify installation: aws --version",
      "",
      "Note: AWS CLI v2 is required for SSO support",
    ].join("\n");
  }

  if (exitCode === 255) {
    return [
      "AWS CLI authentication failed:",
      "1. Check network connectivity to AWS",
      "2. Verify credentials: aws sts get-caller-identity",
      "3. For SSO: aws sso login --profile <profile>",
      "4. Check region: aws configure get region",
      "",
      "Note: Some regions may be disabled in your account",
    ].join("\n");
  }

  if (command?.includes("sso")) {
    return [
      "SSO command failed:",
      "1. Check SSO URL is reachable in browser",
      "2. Verify SSO region: aws configure get sso_region",
      "3. Try: aws sso login --no-browser",
      "4. Contact admin if SSO portal is down",
      "",
      "Note: SSO requires browser authentication by default",
    ].join("\n");
  }

  return [
    "AWS CLI operation failed:",
    "1. Check command syntax and parameters",
    "2. Verify AWS service availability",
    "3. Review error details above",
    "4. Try with --debug for more information",
    "",
    "Note: Some operations require specific IAM permissions",
  ].join("\n");
}

/**
 * Get guidance for generic errors
 *
 * @returns Formatted guidance message
 * @internal
 */
function getGenericErrorGuidance(): string {
  return [
    "Unknown authentication error:",
    "1. Check AWS configuration: aws configure list",
    "2. Test basic access: aws sts get-caller-identity",
    "3. For SSO: aws sso login",
    "4. Get detailed status: aws-ts auth status --detailed",
    "",
    "Note: Contact your AWS administrator if issues persist",
  ].join("\n");
}

/**
 * Get user-friendly resolution guidance for authentication errors
 *
 * @param error - The authentication error to get guidance for
 * @returns Resolution guidance message
 *
 * @public
 */
export function getAuthErrorGuidance(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const typedError = error as ErrorLike;
    switch (typedError.code) {
      case "AUTHENTICATION_ERROR": {
        return getAuthenticationErrorGuidance(typedError);
      }
      case "PROFILE_ERROR": {
        return getProfileErrorGuidance(typedError);
      }
      case "TOKEN_ERROR": {
        return getTokenErrorGuidance(typedError);
      }
      case "AWS_CLI_ERROR": {
        return getAwsCliErrorGuidance(typedError);
      }
    }
  }
  return getGenericErrorGuidance();
}
