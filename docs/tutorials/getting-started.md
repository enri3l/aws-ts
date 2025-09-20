# Getting Started

Setup and first-time configuration of the AWS TypeScript CLI.

## Prerequisites

Before starting, ensure you have the required dependencies:

```bash
# Check Node.js version (requires v24+)
node --version

# Check pnpm version (requires v10+)
pnpm --version

# Verify AWS CLI v2 installation
aws --version
```

## Installation and Build

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/enri3l/aws-ts.git
cd aws-ts

# Install dependencies with pnpm
pnpm install
```

### 2. Build the CLI

```bash
# Build TypeScript to JavaScript
pnpm build

# Verify build completed successfully
ls -la dist/
```

**Expected Output:**

```text
dist/
├── index.js
├── commands/
│   └── auth/
├── services/
└── lib/
```

### 3. Install CLI Command

```bash
# Link for global usage (development mode)
pnpm link --global

# Verify CLI is available globally
aws-ts --help

# Check authentication commands
aws-ts auth --help
```

## Architecture Introduction

The CLI follows a **modular CQRS architecture** with clear separation of concerns:

### Service Layer Components

- **`AuthService`** - High-level orchestration of authentication workflows
- **`ProfileManager`** - AWS profile discovery and configuration management
- **`TokenManager`** - SSO token lifecycle and expiry management
- **`CredentialService`** - AWS credential validation and caching

### Command Structure

Authentication commands follow the `auth:` namespace pattern:

```bash
# Query operations (read-only)
auth:status    # Check authentication state
auth:profiles  # List available profiles

# Command operations (state-changing)
auth:login     # Perform SSO authentication
auth:logout    # Clear authentication state
```

## First Status Check

Run your first authentication command to verify the CLI is working:

```bash
# Check current authentication status
aws-ts auth:status
```

**Expected Output (no authentication):**

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

## Understanding the Output

### AWS CLI Status

- **Installed**: Confirms AWS CLI v2 is available and functional
- **Version**: Shows AWS CLI version for compatibility verification

### Authentication Status

- **Overall Status**: Global authentication state across all profiles
- **Active Profile**: Currently selected AWS profile (`AWS_PROFILE` environment variable)

### Profile Status Table

- **Profile**: AWS profile name from `~/.aws/config` or `~/.aws/credentials`
- **Type**: Profile type (`sso`, `iam`, or `credentials`)
- **Active**: Whether this profile is currently active (✓ or empty)
- **Credentials Valid**: Whether stored credentials are valid and not expired

## Error Handling Design

The CLI implements **comprehensive error handling** with user-friendly messages:

```bash
# Run with verbose flag for detailed debugging
aws-ts auth:status --verbose
```

**Design Principles:**

- **Graceful degradation** - Missing config files don't crash the application
- **Informative messages** - Clear explanations of what went wrong and how to
  fix it
- **Debug logging** - Verbose mode provides technical details without
  overwhelming normal users
- **Fail-fast validation** - Input validation catches errors early with helpful guidance

## Next Steps

After completing the setup:

1. **Configure AWS profiles** - Set up your SSO or credential-based profiles
2. **Try authentication** - Follow the [First Commands](./first-commands) tutorial
3. **Explore configuration** - Review [Configuration How-To Guide](/how-to/configuration)
4. **Understand architecture** - Read [Architecture Explanation](/explanation/architecture)

The CLI is now ready for authentication workflows with AWS services.
