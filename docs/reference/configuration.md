# Configuration

Configuration reference for AWS files, environment variables, and CLI settings.

## Configuration Hierarchy

The CLI follows strict configuration precedence rules with **hierarchical resolution**:

1. **Command-line flags** (highest precedence)
2. **Environment variables**
3. **AWS configuration files**
4. **Default values** (lowest precedence)

## Environment Variables

### AWS Standard Variables

| Variable                      | Description         | Example         | Used By  |
| ----------------------------- | ------------------- | --------------- | -------- |
| `AWS_PROFILE`                 | Active profile name | `production`    | All      |
| `AWS_REGION`                  | Default region      | `us-west-2`     | All      |
| `AWS_CONFIG_FILE`             | Config file path    | `~/.aws/config` | Profiles |
| `AWS_SHARED_CREDENTIALS_FILE` | Credentials path    | `~/.aws/creds`  | Profiles |

### CLI-Specific Variables

| Variable    | Description         | Type                           | Default |
| ----------- | ------------------- | ------------------------------ | ------- |
| `NODE_ENV`  | Node.js environment | `string`                       | -       |
| `LOG_LEVEL` | Logging verbosity   | `DEBUG \| INFO \| WARN \| ERR` | `INFO`  |

### Architecture Context Variables

| Variable | Description                      | Impact                       |
| -------- | -------------------------------- | ---------------------------- |
| `CI`     | Continuous integration detection | Disables progress indicators |
| `VITEST` | Test environment detection       | Disables progress indicators |

## AWS Configuration Files

### Config File Format (`~/.aws/config`)

**Standard Profile:**

```ini
[profile profile-name]
region = us-west-2
output = json
```

**SSO Profile (Legacy):**

```ini
[profile legacy-sso]
sso_start_url = https://company.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = us-west-2
output = json
```

**Modern SSO Configuration:**

```ini
[sso-session company]
sso_start_url = https://company.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile modern-sso]
sso_session = company
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = us-west-2
output = json
```

**IAM Role Profile:**

```ini
[profile cross-account]
role_arn = arn:aws:iam::987654321098:role/CrossAccountRole
source_profile = base-profile
region = us-east-1
```

### Credentials File Format (`~/.aws/credentials`)

**Access Key Profile:**

```ini
[profile-name]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
aws_session_token = ...  # Optional for temporary credentials
```

**Note:** SSO profiles should not have entries in the credentials file.

## Configuration Parsing Rules

### Profile Name Resolution

The `ProfileManager` follows these rules:

1. **Config file profiles**: Strip `profile` prefix from section names
2. **Credentials file profiles**: Use section names directly
3. **Merge strategy**: Config file takes precedence for overlapping properties

### SSO Session Resolution

```typescript
// Inheritance priority:
// 1. Direct profile properties
// 2. SSO session properties
// 3. Default values
```

**Resolution Logic:**

1. Profile references SSO session via `sso_session = session-name`
2. SSO session provides `sso_start_url` and `sso_region`
3. Profile inherits missing properties from session
4. Direct profile properties override session properties

### Property Inheritance

| Property        | Source Priority                 | Description               |
| --------------- | ------------------------------- | ------------------------- |
| `region`        | Profile → SSO Session → Default | AWS region                |
| `output`        | Profile → Default               | Output format             |
| `sso_start_url` | Profile → SSO Session           | SSO portal URL            |
| `sso_region`    | Profile → SSO Session           | SSO authentication region |

## Profile Types

### Type Detection Logic

The CLI automatically detects profile types using `ProfileManager.determineProfileType()`:

```typescript
if (resolvedSsoStartUrl || profile.ssoSession) {
  return "sso";
}
if (profile.roleArn) {
  return "iam";
}
return "credentials";
```

### SSO Profile Configuration

**Required Properties:**

- `sso_session` (modern) OR `sso_start_url` (legacy)
- `sso_account_id`
- `sso_role_name`

**Optional Properties:**

- `region` (inherited from SSO session if not specified)
- `output`
- `sso_region` (for legacy configuration)

### IAM Role Profile Configuration

**Required Properties:**

- `role_arn`
- `source_profile`

**Optional Properties:**

- `region`
- `output`
- `mfa_serial`

### Credentials Profile Configuration

**Required Properties:**

- `aws_access_key_id`
- `aws_secret_access_key`

**Optional Properties:**

- `aws_session_token`
- `region`
- `output`

## File Locations

### Standard Locations

| File        | Default Path         | Purpose                               |
| ----------- | -------------------- | ------------------------------------- |
| Config      | `~/.aws/config`      | Profile and SSO session configuration |
| Credentials | `~/.aws/credentials` | Access key storage                    |
| SSO Cache   | `~/.aws/sso/cache/`  | SSO token storage                     |
| CLI Cache   | `~/.aws/cli/cache/`  | AWS CLI credential cache              |

### Custom Locations

Override default paths using environment variables:

```bash
export AWS_CONFIG_FILE=/custom/path/config
export AWS_SHARED_CREDENTIALS_FILE=/custom/path/credentials
```

## Configuration Validation

### Syntax Validation

The CLI performs comprehensive validation:

**INI Format Rules:**

- Section headers: `[section-name]` or `[profile profile-name]`
- Key-value pairs: `key = value`
- Comments: Lines starting with `#` or `;`
- Whitespace: Leading/trailing whitespace trimmed

**Common Syntax Errors:**

```ini
# ❌ Missing equals sign
region us-west-2

# ❌ Invalid section header
[profile-missing-space]

# ✅ Correct format
[profile correct-name]
region = us-west-2
```

### Reference Validation

**SSO Session References:**

```ini
# ❌ Undefined SSO session reference
[profile broken]
sso_session = nonexistent-session

# ✅ Valid SSO session reference
[sso-session valid-session]
sso_start_url = https://company.awsapps.com/start

[profile working]
sso_session = valid-session
```

## Error Handling

### File Access Errors

The CLI implements **graceful degradation** for file access issues:

| Error Type              | Behavior            | Debug Output            |
| ----------------------- | ------------------- | ----------------------- |
| `ENOENT` (Missing file) | Continue with empty | "Config file not found" |
| `EACCES` (Permission)   | Continue with empty | "Config access failed"  |
| `EISDIR` (Path is dir)  | Throw error         | Full error details      |

### Parsing Errors

**Malformed Configuration:**

- Skips invalid lines with debug logging
- Continues parsing remainder of file
- Reports warnings in verbose mode

## Security Considerations

### File Permissions

**Recommended Permissions:**

```bash
# Configuration files
chmod 644 ~/.aws/config
chmod 600 ~/.aws/credentials

# Cache directories
chmod 700 ~/.aws/sso/
chmod 700 ~/.aws/cli/
```

### Credential Storage

**Best Practices:**

- Use SSO profiles instead of long-lived access keys
- Avoid storing credentials in version control
- Regularly rotate access keys when required
- Use IAM roles for cross-account access

### SSO Security

**Token Management:**

- SSO tokens automatically expire (typically 8 hours)
- CLI provides expiry warnings and refresh guidance
- Token cache managed by AWS CLI with secure storage

## Configuration Examples

### Multi-Environment Setup

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
[profile prod-readonly]
sso_session = company
sso_account_id = 999999999999
sso_role_name = ReadOnlyAccess
region = us-east-1
```

### Cross-Account Role Chain

```ini
# Base authentication profile
[profile base-account]
sso_session = company
sso_account_id = 123456789012
sso_role_name = DeveloperAccess

# Cross-account role assumption
[profile target-account]
role_arn = arn:aws:iam::987654321098:role/CrossAccountRole
source_profile = base-account
region = us-east-1
```
