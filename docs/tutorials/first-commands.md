# First Commands

Hands-on walkthrough of essential authentication commands with SSO profile examples.

## Overview

This tutorial demonstrates the authentication workflow using concrete examples
with AWS SSO.

## Prerequisites

- Completed [Getting Started](./getting-started) tutorial
- AWS CLI v2 installed and configured
- Access to an AWS SSO instance or existing AWS profiles

## Understanding Authentication Commands

### Command vs Query Pattern

The CLI follows **CQRS (Command Query Responsibility Segregation)**:

**Queries** (read operations):

- `auth:status` - Display current authentication state
- `auth:profiles` - List available profiles with status

**Commands** (write operations):

- `auth:login` - Authenticate with AWS SSO
- `auth:logout` - Clear authentication tokens and sessions

## Step 1: Check Current Status

Start by examining your current authentication state:

```bash
# Basic status check
aws-ts auth:status

# Detailed status with verbose logging
aws-ts auth:status --verbose
```

**Expected Output (no SSO configuration):**

```text
=== AWS CLI Status ===
Installed: ✓
Version: 2.30.5

=== Authentication Status ===
Overall Status: ✗ Not Authenticated
Active Profile: default

=== Profile Status ===
┌─────────┬───────────┬───────────────┬────────┬───────────────────┐
│ (index) │ Profile   │ Type          │ Active │ Credentials Valid │
├─────────┼───────────┼───────────────┼────────┼───────────────────┤
│ 0       │ 'default' │ 'credentials' │ '✓'    │ '✗'               │
└─────────┴───────────┴───────────────┴────────┴───────────────────┘
```

### Understanding the Status Output

- **AWS CLI Status**: Verifies AWS CLI v2 dependency is available
- **Overall Status**: Global authentication state across all profiles
- **Profile Status Table**: Shows all discovered profiles with their
  authentication state

## Step 2: Discover Available Profiles

List all AWS profiles discovered by the **ProfileManager** service:

```bash
# List all profiles
aws-ts auth:profiles

# List with verbose debugging
aws-ts auth:profiles --verbose
```

**Example Output with SSO Profiles:**

```text
=== AWS Profiles (16 found) ===

┌─────────┬────────────────────────┬───────┬────────┬───────┐
│ (index) │ Profile                │ Type  │ Active │ Valid │
├─────────┼────────────────────────┼───────┼────────┼───────┤
│ 0       │ 'sso-session test'     │ 'sso' │ ''     │ '✗'   │
│ 1       │ 'profile-test'         │ 'sso' │ ''     │ '✗'   │
│ 2       │ 'profile-prod'         │ 'sso' │ ''     │ '✗'   │
└─────────┴────────────────────────┴───────┴────────┴───────┘

=== Summary ===
Total profiles: 3
Active profiles: 0
Profiles with valid credentials: 0
SSO profiles: 3
```

### Profile Types Explained

- **`sso`**: SSO profiles using `sso_session` configuration
- **`iam`**: IAM role-based profiles with `role_arn`
- **`credentials`**: Traditional access key profiles

## Step 3: SSO Login Workflow

Authenticate with an SSO profile using the **AuthService** orchestration:

```bash
# Login to specific SSO profile
aws-ts auth:login --profile profile-test

# Login with verbose logging for debugging
aws-ts auth:login --profile profile-test --verbose
```

**Authentication Flow:**

1. **AWS CLI Check**: Verifies AWS CLI v2 installation
2. **Profile Validation**: Confirms profile exists and is properly configured
3. **SSO Login**: Initiates browser-based SSO authentication
4. **Credential Validation**: Verifies obtained credentials are valid
5. **Profile Activation**: Sets as active profile for subsequent commands

**Successful Login Output:**

```text
✓ Successfully authenticated with profile 'profile-test'
```

### Browser-Based SSO Flow

The login command triggers AWS CLI's SSO flow:

1. Browser opens to your organization's SSO portal
2. Authentication in browser
3. CLI receives and validates SSO tokens
4. Credentials cached locally for subsequent use

## Step 4: Verify Authentication

Check authentication status after login:

```bash
# Check status after login
aws-ts auth:status --profile profile-test

# Detailed view with all profiles
aws-ts auth:status --all-profiles --detailed
```

**Expected Output (authenticated):**

```text
=== Authentication Status ===
Overall Status: ✓ Authenticated
Active Profile: profile-test

=== Profile Status ===
┌─────────┬─────────────────┬───────┬────────┬───────────────────┐
│ (index) │ Profile         │ Type  │ Active │ Credentials Valid │
├─────────┼─────────────────┼───────┼────────┼───────────────────┤
│ 0       │ 'profile-test'  │ 'sso' │ '✓'    │ '✓'               │
└─────────┴─────────────────┴───────┴────────┴───────────────────┘
```

### Detailed Status Information

With `--detailed` flag, SSO profiles show additional information:

- **Region**: Inherited from SSO session configuration
- **Output**: Configured output format preference
- **SSO Start URL**: Organization's SSO portal URL
- **Token Expiry**: Time until SSO token expires

## Step 5: Profile Management

Switch between profiles and manage multiple authentications:

```bash
# Switch to different profile
aws-ts auth:switch production-profile

# Login to multiple profiles
aws-ts auth:login --profile profile-test
aws-ts auth:login --profile profile-prod

# Check all authenticated profiles
aws-ts auth:status --all-profiles
```

## Step 6: Token Management

The **TokenManager** service handles SSO token lifecycle:

```bash
# Check for expiring tokens (automatic warnings)
aws-ts auth:status --all-profiles --detailed
```

**Token Expiry Warnings:**

```text
⚠ Tokens expiring soon: profile-test
Consider refreshing these tokens soon

⚠ Expired tokens: profile-prod
Run 'aws-ts auth login --profile <profile>' to refresh expired tokens
```

## Step 7: Logout Operations

Clear authentication state when finished:

```bash
# Logout from specific profile
aws-ts auth:logout --profile profile-test

# Logout from all SSO profiles
aws-ts auth:logout --all-profiles

# Logout with verbose logging
aws-ts auth:logout --all-profiles --verbose
```

**Multi-Profile Logout Output:**

```text
✓ Logged out from 16 SSO profiles
```

## Error Handling in Practice

The CLI implements **graceful error handling** throughout authentication workflows:

### Common Error Scenarios

```bash
# Missing profile
aws-ts auth:login --profile non-existent
# Output: Clear error with resolution guidance

# Network connectivity issues
aws-ts auth:login --profile my-profile
# Output: Specific error with troubleshooting steps

# Expired tokens
aws-ts auth:status --verbose
# Output: Clean debug messages, no stack traces
```

### Debug Output Benefits

Verbose mode provides:

- **Service layer interactions**: How AuthService coordinates with
  ProfileManager and TokenManager
- **AWS SDK operations**: Credential provider chain resolution
- **Configuration parsing**: How profiles are discovered and resolved
- **Error context**: Specific failure points with actionable guidance

## Architecture in Action

This tutorial demonstrates the **service layer architecture**:

1. **Commands** (`auth:login`, `auth:logout`) use `AuthService.login()` and
   `AuthService.logout()`
2. **Queries** (`auth:status`, `auth:profiles`) use `AuthService.getStatus()`
   and `AuthService.listProfiles()`
3. **ProfileManager** handles AWS config file parsing and SSO session
   resolution
4. **TokenManager** manages SSO token caching and expiry detection
5. **CredentialService** validates AWS credentials and manages active profile
   state

## Next Steps

After mastering basic authentication commands:

1. **Configuration Management** - [Configuration How-To](/how-to/configuration)
2. **Authentication** - [Authentication How-To](/how-to/authentication)
3. **Command Reference** - [Commands Reference](/reference/commands)
4. **Architecture Deep Dive** - [Architecture Explanation](/explanation/architecture)

You now understand the fundamental authentication workflows and command patterns
used throughout the CLI.
