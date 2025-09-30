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

All commands implement **structured error handling** with:

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
- Data preservation
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

## Additional Command Reference

Complete reference for all AWS service commands.

## API Gateway Commands

### `apigw:describe-api`

Get detailed information about a specific API Gateway API

**Usage:**

```bash
aws-ts apigw:describe-api [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts apigw:describe-api --region us-west-2
```

---

### `apigw:get-api-config`

Get configuration details for an API Gateway API

**Usage:**

```bash
aws-ts apigw:get-api-config [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts apigw:get-api-config --region us-west-2
```

---

### `apigw:list-apis`

List all API Gateway APIs across REST, HTTP, and WebSocket types

**Usage:**

```bash
aws-ts apigw:list-apis [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts apigw:list-apis --region us-west-2
```

---

## DynamoDB Commands

### `dynamodb:batch-get-item`

Get multiple items from DynamoDB tables in batch

**Usage:**

```bash
aws-ts dynamodb:batch-get-item [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:batch-get-item --region us-west-2
```

---

### `dynamodb:batch-write-item`

Batch write (put/delete) items to a DynamoDB table

**Usage:**

```bash
aws-ts dynamodb:batch-write-item [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:batch-write-item --region us-west-2
```

---

### `dynamodb:describe-table`

Show detailed information about a DynamoDB table

**Usage:**

```bash
aws-ts dynamodb:describe-table [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:describe-table --region us-west-2
```

---

### `dynamodb:get-item`

Get a single item from a DynamoDB table by primary key

**Usage:**

```bash
aws-ts dynamodb:get-item [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:get-item --region us-west-2
```

---

### `dynamodb:list-tables`

List all DynamoDB tables in the region

**Usage:**

```bash
aws-ts dynamodb:list-tables [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:list-tables --region us-west-2
```

---

### `dynamodb:put-item`

Put (create/replace) an item in a DynamoDB table

**Usage:**

```bash
aws-ts dynamodb:put-item [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:put-item --region us-west-2
```

---

### `dynamodb:query-index`

Query a DynamoDB Global or Local Secondary Index

**Usage:**

```bash
aws-ts dynamodb:query-index [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:query-index --region us-west-2
```

---

### `dynamodb:query`

Query a DynamoDB table using key conditions

**Usage:**

```bash
aws-ts dynamodb:query [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:query --region us-west-2
```

---

### `dynamodb:scan`

Scan a DynamoDB table or index

**Usage:**

```bash
aws-ts dynamodb:scan [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:scan --region us-west-2
```

---

### `dynamodb:update-item`

Update an existing item in a DynamoDB table

**Usage:**

```bash
aws-ts dynamodb:update-item [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts dynamodb:update-item --region us-west-2
```

---

## Lambda Commands

### `lambda:create-alias`

Create an alias for a Lambda function

**Usage:**

```bash
aws-ts lambda:create-alias [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:create-alias --region us-west-2
```

---

### `lambda:create-function`

Create a new Lambda function

**Usage:**

```bash
aws-ts lambda:create-function [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:create-function --region us-west-2
```

---

### `lambda:delete-function`

Delete a Lambda function

**Usage:**

```bash
aws-ts lambda:delete-function [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:delete-function --region us-west-2
```

---

### `lambda:describe-function`

Show detailed information about a Lambda function

**Usage:**

```bash
aws-ts lambda:describe-function [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:describe-function --region us-west-2
```

---

### `lambda:get-function-configuration`

Get Lambda function configuration details

**Usage:**

```bash
aws-ts lambda:get-function-configuration [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:get-function-configuration --region us-west-2
```

---

### `lambda:invoke`

Invoke a Lambda function with optional payload

**Usage:**

```bash
aws-ts lambda:invoke [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:invoke --region us-west-2
```

---

### `lambda:list-functions`

List all Lambda functions in the region

**Usage:**

```bash
aws-ts lambda:list-functions [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:list-functions --region us-west-2
```

---

### `lambda:list-versions`

List all versions of a Lambda function

**Usage:**

```bash
aws-ts lambda:list-versions [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:list-versions --region us-west-2
```

---

### `lambda:publish-version`

Publish a new Lambda function version

**Usage:**

```bash
aws-ts lambda:publish-version [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:publish-version --region us-west-2
```

---

### `lambda:update-function-code`

Update Lambda function code

**Usage:**

```bash
aws-ts lambda:update-function-code [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:update-function-code --region us-west-2
```

---

### `lambda:update-function-configuration`

Update Lambda function configuration

**Usage:**

```bash
aws-ts lambda:update-function-configuration [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts lambda:update-function-configuration --region us-west-2
```

---

## EventBridge Commands

### `eventbridge:delete-rule`

Delete an EventBridge rule

**Usage:**

```bash
aws-ts eventbridge:delete-rule [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:delete-rule --region us-west-2
```

---

### `eventbridge:describe-rule`

Show detailed information about an EventBridge rule

**Usage:**

```bash
aws-ts eventbridge:describe-rule [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:describe-rule --region us-west-2
```

---

### `eventbridge:disable-rule`

Disable an EventBridge rule

**Usage:**

```bash
aws-ts eventbridge:disable-rule [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:disable-rule --region us-west-2
```

---

### `eventbridge:enable-rule`

Enable an EventBridge rule

**Usage:**

```bash
aws-ts eventbridge:enable-rule [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:enable-rule --region us-west-2
```

---

### `eventbridge:list-rules`

List all EventBridge rules with filtering and pagination

**Usage:**

```bash
aws-ts eventbridge:list-rules [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:list-rules --region us-west-2
```

---

### `eventbridge:list-targets-by-rule`

List all targets for an EventBridge rule

**Usage:**

```bash
aws-ts eventbridge:list-targets-by-rule [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:list-targets-by-rule --region us-west-2
```

---

### `eventbridge:put-rule`

Create or update an EventBridge rule

**Usage:**

```bash
aws-ts eventbridge:put-rule [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:put-rule --region us-west-2
```

---

### `eventbridge:put-targets`

Add or update targets for an EventBridge rule

**Usage:**

```bash
aws-ts eventbridge:put-targets [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:put-targets --region us-west-2
```

---

### `eventbridge:remove-targets`

Remove targets from an EventBridge rule

**Usage:**

```bash
aws-ts eventbridge:remove-targets [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts eventbridge:remove-targets --region us-west-2
```

---

## ECS Commands

### `ecs:cluster:create`

Create a new ECS cluster

**Usage:**

```bash
aws-ts ecs:cluster:create [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:cluster:create --region us-west-2
```

---

### `ecs:cluster:delete`

Delete an ECS cluster

**Usage:**

```bash
aws-ts ecs:cluster:delete [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:cluster:delete --region us-west-2
```

---

### `ecs:cluster:describe`

Describe ECS clusters with detailed configuration information

**Usage:**

```bash
aws-ts ecs:cluster:describe [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:cluster:describe --region us-west-2
```

---

### `ecs:cluster:list`

List all ECS clusters in the region

**Usage:**

```bash
aws-ts ecs:cluster:list [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:cluster:list --region us-west-2
```

---

### `ecs:cluster:update`

Update an ECS cluster configuration

**Usage:**

```bash
aws-ts ecs:cluster:update [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:cluster:update --region us-west-2
```

---

### `ecs:service:create`

Create a new ECS service

**Usage:**

```bash
aws-ts ecs:service:create [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:create --region us-west-2
```

---

### `ecs:service:delete`

Delete an ECS service

**Usage:**

```bash
aws-ts ecs:service:delete [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:delete --region us-west-2
```

---

### `ecs:service:describe`

Describe ECS services in detail

**Usage:**

```bash
aws-ts ecs:service:describe [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:describe --region us-west-2
```

---

### `ecs:service:list`

List ECS services in a cluster

**Usage:**

```bash
aws-ts ecs:service:list [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:list --region us-west-2
```

---

### `ecs:service:logs`

View logs from ECS service tasks

**Usage:**

```bash
aws-ts ecs:service:logs [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:logs --region us-west-2
```

---

### `ecs:service:restart`

Restart an ECS service by forcing a new deployment

**Usage:**

```bash
aws-ts ecs:service:restart [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:restart --region us-west-2
```

---

### `ecs:service:scale`

Scale an ECS service to a desired count

**Usage:**

```bash
aws-ts ecs:service:scale [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:scale --region us-west-2
```

---

### `ecs:service:start`

Start a stopped ECS service

**Usage:**

```bash
aws-ts ecs:service:start [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:start --region us-west-2
```

---

### `ecs:service:stop`

Stop an ECS service by scaling to zero tasks

**Usage:**

```bash
aws-ts ecs:service:stop [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:stop --region us-west-2
```

---

### `ecs:service:update`

Update an ECS service configuration

**Usage:**

```bash
aws-ts ecs:service:update [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:service:update --region us-west-2
```

---

### `ecs:task:describe`

Describe ECS tasks in detail

**Usage:**

```bash
aws-ts ecs:task:describe [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:describe --region us-west-2
```

---

### `ecs:task:events`

View ECS task events and state changes

**Usage:**

```bash
aws-ts ecs:task:events [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:events --region us-west-2
```

---

### `ecs:task:exec`

Execute commands in running ECS task containers

**Usage:**

```bash
aws-ts ecs:task:exec [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:exec --region us-west-2
```

---

### `ecs:task:kill`

Forcefully terminate ECS tasks immediately

**Usage:**

```bash
aws-ts ecs:task:kill [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:kill --region us-west-2
```

---

### `ecs:task:list`

List ECS tasks in a cluster

**Usage:**

```bash
aws-ts ecs:task:list [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:list --region us-west-2
```

---

### `ecs:task:logs`

View logs from ECS task containers

**Usage:**

```bash
aws-ts ecs:task:logs [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:logs --region us-west-2
```

---

### `ecs:task:run`

Run a standalone ECS task

**Usage:**

```bash
aws-ts ecs:task:run [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:run --region us-west-2
```

---

### `ecs:task:stop`

Stop running ECS tasks

**Usage:**

```bash
aws-ts ecs:task:stop [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:stop --region us-west-2
```

---

### `ecs:task:wait`

Wait for ECS tasks to reach a specified state

**Usage:**

```bash
aws-ts ecs:task:wait [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts ecs:task:wait --region us-west-2
```

---

## CloudWatch Logs Commands

### `cloudwatch:logs:analyze-patterns`

Analyzes log patterns in a CloudWatch log group to identify recurring patterns,
detect anomalies, and provide operational insights for debugging and monitoring.

The command performs intelligent pattern extraction by normalizing log messages
and grouping them by structural similarity. It identifies frequent patterns,
calculates coverage statistics, and detects anomalies that may indicate issues.

PATTERN ANALYSIS FEATURES:
• Automatic pattern detection with configurable thresholds
• Anomaly detection for unusual frequency patterns
• Pattern coverage and occurrence statistics
• Time-based pattern analysis with first/last occurrence tracking
• Configurable sample size for large datasets

**Examples:**

```bash
# Analyze patterns in the last 24 hours
aws-ts cloudwatch:logs:analyze-patterns /aws/lambda/my-function

# Analyze with custom time range and sample size
aws-ts cloudwatch:logs:analyze-patterns /aws/lambda/my-function --start-time
```

**Usage:**

```bash
aws-ts cloudwatch:logs:analyze-patterns [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:analyze-patterns --region us-west-2
```

---

## `cloudwatch:logs:describe-group`

Show detailed information about a CloudWatch log group

**Usage:**

```bash
aws-ts cloudwatch:logs:describe-group [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:describe-group --region us-west-2
```

---

### `cloudwatch:logs:favorites`

Manages favorite log groups and queries for quick access and team collaboration.
Provides local storage with usage analytics, export/import capabilities, and
smart suggestions for optimizing monitoring workflows.

The favorites system enables you to save frequently accessed log groups and
queries with usage tracking, team sharing, and validation features.

SUBCOMMANDS:
• add-group `<log-group-name>` [alias] - Add log group to favorites with optional alias
• add-query `<name>`

**Usage:**

```bash
aws-ts cloudwatch:logs:favorites [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:favorites --region us-west-2
```

---

### `cloudwatch:logs:filter-events`

Advanced filtering of CloudWatch log events with complex expressions

**Usage:**

```bash
aws-ts cloudwatch:logs:filter-events [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:filter-events --region us-west-2
```

---

### `cloudwatch:logs:follow`

Follow specific log streams with pattern matching and auto-reconnect

**Usage:**

```bash
aws-ts cloudwatch:logs:follow [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:follow --region us-west-2
```

---

### `cloudwatch:logs:interactive-query`

Interactive CloudWatch Logs query builder with templates and field discovery

**Usage:**

```bash
aws-ts cloudwatch:logs:interactive-query [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:interactive-query --region us-west-2
```

---

### `cloudwatch:logs:list-groups`

List all CloudWatch log groups in the region

**Usage:**

```bash
aws-ts cloudwatch:logs:list-groups [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:list-groups --region us-west-2
```

---

### `cloudwatch:logs:metrics`

Extracts metrics and analytics from CloudWatch log data including error rates,
performance metrics, volume analysis, and custom metric extraction using
CloudWatch Logs Insights queries.

The command supports multiple metric types with automatic trend analysis,
summary statistics, and export capabilities for further analysis and monitoring.

METRIC TYPES:
• error-rate: Extract error patterns and calculate error rates over time
• performance: Analyze timing metrics like latency, duration, response time
• volume: Analyze log volume trends and patterns over time
• custom: Execute custom CloudWatch Logs Insights queries for specific metrics

FEATURES:
• Time-series data with configurable grouping (minute, hour, day)
• Trend analysis with direction, magnitude, and confidence levels
• Summary statistics including min, max, average, and trend direction
• Export capabilities for integration with monitoring and analysis tools
• Cost analysis with bytes scanned and query optimization recommendations

**Examples:**

```bash
# Extract error rate metrics for the last 24 hours
aws-ts cloudwatch:logs:metrics /aws/lambda/my-function --metric-type error-rate

# Analyze performance metrics with custom error patterns
aws-ts cloudwatch:logs:metrics /aws/lambda/my-function --metric-type error-rate --error-patterns
```

**Usage:**

```bash
aws-ts cloudwatch:logs:metrics [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:metrics --region us-west-2
```

---

## `cloudwatch:logs:query`

Execute CloudWatch Logs Insights queries with filtering

**Usage:**

```bash
aws-ts cloudwatch:logs:query [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:query --region us-west-2
```

---

### `cloudwatch:logs:saved-queries`

Manage saved CloudWatch Logs Insights queries

**Usage:**

```bash
aws-ts cloudwatch:logs:saved-queries [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:saved-queries --region us-west-2
```

---

### `cloudwatch:logs:search`

Fast text search across CloudWatch log events with regex and highlighting

**Usage:**

```bash
aws-ts cloudwatch:logs:search [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:search --region us-west-2
```

---

### `cloudwatch:logs:tail`

Stream CloudWatch log events in real-time using live tail

**Usage:**

```bash
aws-ts cloudwatch:logs:tail [OPTIONS]
```

**Common Flags:**

- `--region`, `-r`: AWS region

- `--profile`, `-p`: AWS profile for authentication

- `--format`, `-f`: Output format (table/json/jsonl/csv)

- `--verbose`, `-v`: Enable verbose debug output

**Example:**

```bash
aws-ts cloudwatch:logs:tail --region us-west-2
```

---

## Common Command Flags

All commands support these standard AWS CLI flags:

- `--region`: Override default AWS region

- `--profile`: Use specific AWS credential profile

- `--format`: Choose output format (table, json, jsonl, csv)

- `--verbose`: Enable detailed debug logging

- `--help`: Display command-specific help
