# Configuration

Setting up AWS configuration files, SSO sessions, and profile management for
CLI usage.

## Modern SSO Session Configuration

### Problem: Setting up SSO with Modern Configuration

You need to configure AWS SSO using the `sso_session` approach for better
token management and multiple account access.

**Solution:**

1. **Create SSO Session Configuration** in `~/.aws/config`:

```ini
[sso-session my-org]
sso_start_url = https://my-org.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

1. **Create Profile Using SSO Session:**

```ini
[profile dev-account]
sso_session = my-org
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = us-west-2
output = json

[profile prod-account]
sso_session = my-org
sso_account_id = 987654321098
sso_role_name = ReadOnlyAccess
region = us-east-1
output = json
```

1. **Verify Configuration:**

```bash
# Check profile discovery
aws-ts auth:profiles

# Verify SSO session inheritance
aws-ts auth:status --all-profiles --detailed
```

## Multiple AWS Accounts Management

### Problem: Managing Profiles Across Multiple AWS Accounts

You work with development, staging, and production accounts and need organized
profile management.

**Solution:**

1. **Organize Profiles by Environment Pattern:**

```ini
# ~/.aws/config
[sso-session company]
sso_start_url = https://company.awsapps.com/start
sso_region = us-east-1

# Development Environment
[profile dev-app1]
sso_session = company
sso_account_id = 111111111111
sso_role_name = DeveloperAccess
region = us-west-2

[profile dev-app2]
sso_session = company
sso_account_id = 111111111111
sso_role_name = DeveloperAccess
region = us-west-2

# Production Environment
[profile prod-app1]
sso_session = company
sso_account_id = 999999999999
sso_role_name = ReadOnlyAccess
region = us-east-1

[profile prod-app2]
sso_session = company
sso_account_id = 999999999999
sso_role_name = ReadOnlyAccess
region = us-east-1
```

1. **Verify Profile Structure:**

```bash
# List all profiles with type information
aws-ts auth:profiles

# Check specific environment
aws-ts auth:status --profile dev-app1 --detailed
```

**Design Rationale:** This naming convention follows the project's **DRY
principle** by sharing SSO session configuration while maintaining clear
environment separation.

## Troubleshooting Profile Discovery

### Problem: Profiles Not Appearing in Status Output

Your AWS profiles exist but aren't discovered by the CLI's profile detection.

**Diagnosis Steps:**

1. **Check Configuration File Syntax:**

```bash
# Verify config file exists and is readable
ls -la ~/.aws/config ~/.aws/credentials

# Check for syntax errors with verbose logging
aws-ts auth:profiles --verbose
```

1. **Common Configuration Issues:**

**Missing `profile` prefix in config file:**

```ini
# ❌ Wrong - missing 'profile' prefix
[my-profile]
region = us-east-1

# ✅ Correct - includes 'profile' prefix
[profile my-profile]
region = us-east-1
```

**Invalid SSO session reference:**

```ini
# ❌ Wrong - SSO session doesn't exist
[profile my-app]
sso_session = nonexistent-session

# ✅ Correct - SSO session defined above
[sso-session my-org]
sso_start_url = https://my-org.awsapps.com/start

[profile my-app]
sso_session = my-org
```

1. **Verify File Permissions:**

```bash
# Check file permissions
ls -la ~/.aws/
# Should be readable by user (600 or 644)

# Fix permissions if needed
chmod 644 ~/.aws/config ~/.aws/credentials
```

## Converting Legacy Credentials to SSO

### Problem: Migrating from Access Keys to SSO

You have existing access key profiles and want to convert to SSO for better
security and token management.

**Migration Steps:**

1. **Backup Existing Configuration:**

```bash
# Create backup of current configuration
cp ~/.aws/config ~/.aws/config.backup
cp ~/.aws/credentials ~/.aws/credentials.backup
```

1. **Identify Legacy Profiles:**

```bash
# Check current profile types
aws-ts auth:profiles
# Look for 'credentials' type profiles
```

1. **Create SSO Session Configuration:**

```ini
# Add to ~/.aws/config
[sso-session your-org]
sso_start_url = https://your-org.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

1. **Convert Profiles to SSO:**

**Before (legacy credentials):**

```ini
# ~/.aws/credentials
[old-profile]
aws_access_key_id = AKIA...
aws_secret_access_key = ...

# ~/.aws/config
[profile old-profile]
region = us-west-2
output = json
```

**After (SSO configuration):**

```ini
# ~/.aws/config only
[profile new-sso-profile]
sso_session = your-org
sso_account_id = 123456789012
sso_role_name = YourRoleName
region = us-west-2
output = json
```

1. **Test SSO Authentication:**

```bash
# Test new SSO profile
aws-ts auth:login --profile new-sso-profile

# Verify credentials work
aws-ts auth:status --profile new-sso-profile
```

1. **Clean Up Legacy Credentials:**

```bash
# Remove old credentials after verification
# Edit ~/.aws/credentials to remove access keys
```

**Security Benefits:** SSO provides temporary credentials with automatic expiry,
eliminating long-lived access keys and improving security posture.

## Environment-Specific Configuration

### Problem: Managing Different Configurations per Environment

You need different AWS configurations for local development, CI/CD, and
production environments.

**Solution:**

1. **Use Environment Variables for Overrides:**

```bash
# Local development
export AWS_PROFILE=dev-profile
export AWS_REGION=us-west-2

# CI/CD environment
export AWS_PROFILE=ci-profile
export AWS_REGION=us-east-1

# Check current environment
aws-ts auth:status
```

1. **Create Environment-Specific Profiles:**

```ini
# ~/.aws/config
[profile local-dev]
sso_session = company
sso_account_id = 111111111111
sso_role_name = DeveloperAccess
region = us-west-2
output = json

[profile ci-automation]
sso_session = company
sso_account_id = 222222222222
sso_role_name = CIRole
region = us-east-1
output = json
```

1. **Environment Detection in Scripts:**

```bash
#!/bin/bash
# deployment-script.sh

# Automatically select profile based on environment
if [ "$ENV" = "production" ]; then
    export AWS_PROFILE=prod-profile
elif [ "$ENV" = "staging" ]; then
    export AWS_PROFILE=staging-profile
else
    export AWS_PROFILE=dev-profile
fi

# Verify authentication
aws-ts auth:status
```

## Configuration Validation

### Problem: Ensuring Configuration Integrity

You want to validate your AWS configuration setup before deployment or sharing
with team members.

**Validation Checklist:**

1. **Profile Discovery Validation:**

```bash
# Verify all expected profiles are discovered
aws-ts auth:profiles

# Check specific profile configuration
aws-ts auth:status --profile your-profile --detailed
```

1. **SSO Session Validation:**

```bash
# Test SSO authentication for critical profiles
aws-ts auth:login --profile prod-profile
aws-ts auth:login --profile dev-profile

# Verify token functionality
aws-ts auth:status --all-profiles
```

1. **Configuration Consistency Check:**

```bash
# Check for configuration issues with verbose logging
aws-ts auth:profiles --verbose 2>&1 | grep -i error

# Verify no dead configuration references
aws-ts auth:status --all-profiles --verbose
```

## Common Configuration Patterns

### Team Configuration Standard

For team environments, establish consistent configuration patterns:

```ini
# Recommended team standard
[sso-session company-name]
sso_start_url = https://company-name.awsapps.com/start
sso_region = us-east-1

# Naming convention: {env}-{service}-{role}
[profile dev-app-developer]
[profile staging-app-developer]
[profile prod-app-readonly]
```

This pattern ensures **maintainability** and **clarity** across team members
while leveraging the CLI's comprehensive profile discovery and management
capabilities.
