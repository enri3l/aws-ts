# Commands

CLI command reference with flags, options, and examples.

## Command Overview

The AWS TypeScript CLI implements namespaces for all operations, following
the **CQRS pattern** with clear separation between read operations (queries)
and write operations (commands).

## Global Options

All commands support these global options:

| Flag              | Description                      | Default |
| ----------------- | -------------------------------- | ------- |
| `--help`          | Display command help information | -       |
| `--verbose`, `-v` | Enable verbose debug logging     | `false` |

## Authentication Commands

### `auth:status`

Check AWS authentication status for profiles and display credential validity.

**Usage:**

```bash
aws-ts auth:status [FLAGS]
```

**Flags:**

| Flag                   | Description               | Type            | Default |
| ---------------------- | ------------------------- | --------------- | ------- |
| `--profile`, `-p`      | AWS profile name to check | `string`        | Active  |
| `--all-profiles`, `-a` | Show status for all profs | `boolean`       | `false` |
| `--detailed`, `-d`     | Show detailed profile inf | `boolean`       | `false` |
| `--format`             | Output format             | `table \| json` | `table` |

**Examples:**

```bash
# Check status for active profile
aws-ts auth:status

# Check specific profile with details
aws-ts auth:status --profile production --detailed

# Check all profiles in JSON format
aws-ts auth:status --all-profiles --format json

# Verbose debugging for troubleshooting
aws-ts auth:status --verbose
```

**Output Format (Table):**

```text
=== AWS CLI Status ===
Installed: ✓
Version: 2.30.5

=== Authentication Status ===
Overall Status: ✓ Authenticated
Active Profile: dev-profile

=== Profile Status ===
┌─────────┬─────────────────┬───────┬────────┬───────────────────┐
│ (index) │ Profile         │ Type  │ Active │ Credentials Valid │
├─────────┼─────────────────┼───────┼────────┼───────────────────┤
│ 0       │ 'dev-profile'   │ 'sso' │ '✓'    │ '✓'               │
└─────────┴─────────────────┴───────┴────────┴───────────────────┘
```

**Output Format (JSON):**

```json
{
  "activeProfile": "dev-profile",
  "authenticated": true,
  "awsCliInstalled": true,
  "awsCliVersion": "2.30.5",
  "profiles": [
    {
      "name": "dev-profile",
      "type": "sso",
      "active": true,
      "credentialsValid": true,
      "region": "us-west-2",
      "ssoStartUrl": "https://company.awsapps.com/start"
    }
  ]
}
```

---

### `auth:login`

Authenticate with AWS using SSO profiles and manage session establishment.

**Usage:**

```bash
aws-ts auth:login [FLAGS]
```

**Flags:**

| Flag                | Description               | Type      | Default |
| ------------------- | ------------------------- | --------- | ------- |
| `--profile`, `-p`   | AWS profile name to auth  | `string`  | Active  |
| `--force`, `-f`     | Force re-authentication   | `boolean` | `false` |
| `--configure`, `-c` | Configure new SSO profile | `boolean` | `false` |
| `--sso-start-url`   | SSO start URL for config  | `string`  | -       |
| `--sso-region`      | SSO region for config     | `string`  | -       |
| `--sso-account-id`  | SSO account ID            | `string`  | -       |
| `--sso-role-name`   | SSO role name             | `string`  | -       |

**Examples:**

```bash
# Login to existing profile
aws-ts auth:login --profile production

# Force re-authentication
aws-ts auth:login --profile dev --force

# Configure and login to new SSO profile
aws-ts auth:login --configure \
  --sso-start-url https://company.awsapps.com/start \
  --sso-region us-east-1 \
  --sso-account-id 123456789012 \
  --sso-role-name DeveloperAccess

# Login with verbose logging
aws-ts auth:login --profile staging --verbose
```

**Authentication Flow:**

1. AWS CLI installation verification
1. Profile existence and configuration validation
1. Browser-based SSO authentication initiation
1. Credential validation and caching
1. Active profile setting

---

### `auth:logout`

Clear authentication sessions and remove cached credentials.

**Usage:**

```bash
aws-ts auth:logout [FLAGS]
```

**Flags:**

| Flag                   | Description                  | Type      | Default |
| ---------------------- | ---------------------------- | --------- | ------- |
| `--profile`, `-p`      | AWS profile to logout from   | `string`  | Active  |
| `--all-profiles`, `-a` | Logout from all SSO profiles | `boolean` | `false` |

**Examples:**

```bash
# Logout from active profile
aws-ts auth:logout

# Logout from specific profile
aws-ts auth:logout --profile production

# Logout from all SSO profiles
aws-ts auth:logout --all-profiles

# Logout with verbose logging
aws-ts auth:logout --all-profiles --verbose
```

**Logout Operations:**

- Single profile: Clears SSO tokens and credential cache for specified profile
- All profiles: Iterates through all SSO profiles with batch clearing
- Cache management: Delegates to AWS CLI for token management

---

### `auth:profiles`

List and discover available AWS profiles with authentication status.

**Usage:**

```bash
aws-ts auth:profiles [FLAGS]
```

**Flags:**

| Flag            | Description               | Type            | Default |
| --------------- | ------------------------- | --------------- | ------- |
| `--active-only` | Show only active profiles | `boolean`       | `false` |
| `--format`      | Output format             | `table \| json` | `table` |

**Examples:**

```bash
# List all profiles
aws-ts auth:profiles

# Show only active profiles
aws-ts auth:profiles --active-only

# JSON output for scripting
aws-ts auth:profiles --format json

# Verbose profile discovery
aws-ts auth:profiles --verbose
```

**Output Format (Table):**

```text
=== AWS Profiles (16 found) ===

┌─────────┬────────────────────────┬───────┬────────┬───────┐
│ (index) │ Profile                │ Type  │ Active │ Valid │
├─────────┼────────────────────────┼───────┼────────┼───────┤
│ 0       │ 'dev-profile'          │ 'sso' │ '✓'    │ '✓'   │
│ 1       │ 'staging-profile'      │ 'sso' │ ''     │ '✗'   │
│ 2       │ 'prod-readonly'        │ 'sso' │ ''     │ '✓'   │
└─────────┴────────────────────────┴───────┴────────┴───────┘

=== Summary ===
Total profiles: 3
Active profiles: 1
Profiles with valid credentials: 2
SSO profiles: 3
```

**Profile Types:**

- `sso`: Modern SSO profiles with `sso_session` configuration
- `iam`: IAM role-based profiles with `role_arn`
- `credentials`: Traditional access key profiles

---

### `auth:switch`

Switch active AWS profile and optionally validate credentials.

**Usage:**

```bash
aws-ts auth:switch PROFILE [FLAGS]
```

**Arguments:**

| Argument  | Description                   | Type     | Required |
| --------- | ----------------------------- | -------- | -------- |
| `PROFILE` | AWS profile name to switch to | `string` | Yes      |

**Flags:**

| Flag            | Description                | Type      | Default |
| --------------- | -------------------------- | --------- | ------- |
| `--no-validate` | Skip credential validation | `boolean` | `false` |
| `--set-default` | Set as default profile     | `boolean` | `false` |

**Examples:**

```bash
# Switch to production profile
aws-ts auth:switch production

# Switch without credential validation
aws-ts auth:switch development --no-validate

# Switch and set as session default
aws-ts auth:switch staging --set-default

# Switch with verbose logging
aws-ts auth:switch admin-profile --verbose
```

**Switch Operations:**

1. Profile existence verification
1. Environment variable setting (`AWS_PROFILE`)
1. Optional credential validation
1. Active profile state update

## Exit Codes

All commands follow consistent exit code patterns:

| Code | Description                                                   |
| ---- | ------------------------------------------------------------- |
| `0`  | Success                                                       |
| `1`  | General error (authentication failure, invalid configuration) |
| `2`  | Invalid command usage (missing arguments, unknown flags)      |

## Error Handling

All commands implement **comprehensive error handling** with:

- **Structured error types**: `AUTHENTICATION_ERROR`, `PROFILE_ERROR`, `TOKEN_ERROR`
- **User-friendly messages**: Clear descriptions with resolution guidance
- **Debug logging**: Verbose mode provides architectural context
- **Graceful degradation**: Partial functionality when possible

**Example Error Output:**

```text
✖ Authentication failed
Error: AUTHENTICATION_ERROR: Profile 'nonexistent' not found

Resolution: Try running 'aws configure sso' to set up your SSO profile,
then 'aws sso login --profile <profile>'
```

## Output Formats

### Table Format (Default)

- Human-readable tabular display
- Color-coded status indicators
- Summary information sections
- Progress indicators for operations

### JSON Format

- Machine-readable structured output
- Complete data preservation
- Suitable for scripting and automation
- Consistent schema across commands

### Verbose Mode

- Detailed debug logging
- Service layer interaction traces
- AWS SDK operation context
- Configuration parsing details

## Integration Patterns

### Scripting Usage

```bash
#!/bin/bash
# Check if authenticated before proceeding
if ! aws-ts auth:status --format json | jq -e '.authenticated' > /dev/null; then
  echo "Authentication required"
  aws-ts auth:login --profile "$AWS_PROFILE"
fi
```

### Environment Integration

```bash
# Profile switching function
switch_aws_profile() {
  aws-ts auth:switch "$1" && export AWS_PROFILE="$1"
}
```
