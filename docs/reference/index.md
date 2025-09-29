# Reference

Information-oriented technical reference for commands and configuration options.

## Technical Reference Overview

This section provides reference material for the AWS TypeScript
CLI, to serve as authoritative specification for commands, configuration, and
system behavior.

## Available References

### [Commands](./commands)

CLI command reference with all authentication commands, flags, options,
and examples.

**Coverage:**

- `auth:status` - Authentication status checking with output formats
- `auth:login` - SSO authentication with configuration options
- `auth:logout` - Session termination with multi-profile support
- `auth:profiles` - Profile discovery and listing functionality
- `auth:switch` - Profile switching operations

### [Configuration](./configuration)

Configuration reference for AWS files, environment variables,
and CLI settings.

**Coverage:**

- Environment variable precedence and usage
- AWS configuration file formats and syntax
- SSO session configuration specifications
- Profile inheritance and resolution rules
- Cache and token management settings

## Architecture Reference Context

The reference documentation reflects the **service layer architecture** with
clear boundaries:

- **Command Layer** (`src/commands/auth/`) - OCLIF command implementations
  with flag parsing and output formatting
- **Service Layer** (`src/services/`) - Business logic coordination with
  structured error handling
- **Library Layer** (`src/lib/`) - Schemas, error types, and utilities with
  strict TypeScript typing

## Design Principles Applied

Reference documentation follows the project's **quality standards**:

- **Type Safety**: All command signatures and configuration options strictly typed
- **Coverage**: Every flag, option, and configuration parameter
  documented
- **Error Documentation**: Error codes and resolution guidance
- **Architectural Context**: Each command fits into the broader CQRS pattern

## Command Reference Patterns

All commands follow consistent patterns:

### Command Structure

```bash
aws-ts <topic>:<command> [arguments] [flags]
```

### Flag Conventions

- **Short flags**: Single character with `-` (e.g., `-p`, `-v`)
- **Long flags**: Descriptive names with `--` (e.g., `--profile`, `--verbose`)
- **Boolean flags**: No arguments required (e.g., `--all-profiles`, `--detailed`)
- **Value flags**: Require arguments (e.g., `--profile <name>`, `--format <type>`)

### Output Formats

- **Table format**: Human-readable tabular output (default)
- **JSON format**: Machine-readable structured output
- **Verbose mode**: Debug logging with architectural context

## Configuration Reference Patterns

Configuration follows hierarchical resolution:

1. **Command-line flags** (highest precedence)
2. **Environment variables**
3. **AWS configuration files**
4. **Default values** (lowest precedence)

### File Locations

- **AWS Config**: `~/.aws/config`
- **AWS Credentials**: `~/.aws/credentials`
- **SSO Cache**: `~/.aws/sso/cache/`
- **CLI Cache**: `~/.aws/cli/cache/`

## Error Reference Context

All errors include:

- **Error Code**: Structured error type for programmatic handling
- **Error Message**: Human-readable description
- **Resolution Guidance**: Specific steps to resolve the issue
- **Context**: Relevant configuration or state information

**Error Categories:**

- `AUTHENTICATION_ERROR`: SSO login and credential validation failures
- `PROFILE_ERROR`: Profile discovery and configuration issues
- `TOKEN_ERROR`: SSO token management and expiry problems
- `CONFIGURATION_ERROR`: Configuration file and setup issues

## Usage Patterns

### Information Lookup

Reference documentation serves for:

- Exact command syntax and flag combinations
- Configuration file format requirements
- Environment variable names and values
- Error codes and resolution procedures

### Integration Reference

For programmatic integration:

- JSON output schemas for all commands
- Exit codes and error handling patterns
- Environment variable detection and precedence
- Configuration file parsing behavior

## Relationship to Other Documentation

- **Tutorials** provide step-by-step learning paths using these references
- **How-To Guides** demonstrate practical applications of reference material
- **Explanations** provide architectural context for reference specifications
- **API Documentation** covers TypeScript interfaces and service implementations
