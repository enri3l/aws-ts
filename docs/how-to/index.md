# How-To Guides

Problem-oriented guides for specific tasks with the AWS TypeScript CLI.

## Problem-Solving Approach

These guides address specific scenarios you may encounter when working with
AWS. Each guide provides **concrete solutions** with step-by-step instructions
and troubleshooting guidance.

## Available How-To Guides

### [Configuration](./configuration)

Setting up AWS configuration files, SSO sessions, and profile management for
CLI usage.

**Scenarios Covered:**

- Creating SSO session configurations
- Managing multiple AWS accounts and regions
- Troubleshooting profile discovery issues
- Converting legacy credentials to SSO

### [Authentication](./authentication)

Resolving authentication issues, token management, and credential validation workflows.

**Scenarios Covered:**

- Fixing SSO login failures and browser issues
- Resolving expired token warnings
- Managing credential cache corruption
- Switching between multiple authenticated profiles

## Design Principles Applied

The solutions in these guides reflect the project's **quality standards**:

- **Fail-fast validation** - Early detection of configuration issues with
  clear error messages
- **Graceful degradation** - Partial functionality when some profiles are
  misconfigured
- **Error handling** - User-friendly messages with actionable
  resolution steps
- **SOLID principles** - Each service has single responsibility with clear boundaries

## Problem Categories

### Configuration Problems

- Malformed AWS config files
- Missing SSO session definitions
- Profile inheritance issues
- Region and output format configuration

### Authentication Problems

- SSO login failures
- Token expiry and refresh
- Credential validation errors
- Multi-profile authentication state

### Integration Problems

- AWS CLI version compatibility
- Browser-based SSO flow issues
- Network connectivity problems
- Cache corruption and cleanup

## When to Use How-To Guides

- **You have a specific problem** that needs immediate resolution
- **You're troubleshooting** authentication or configuration issues
- **You need to implement** a particular workflow or setup
- **You're migrating** from existing AWS CLI configurations

## Relationship to Other Documentation

- **Start with [Tutorials](/tutorials/)** for foundational understanding
- **Use How-To Guides** for specific problem-solving
- **Reference [Commands](/reference/commands)** for flag and option details
- **Explore [Architecture](/explanation/architecture)** for deeper system understanding

Each how-to guide includes links to relevant reference documentation and
architectural explanations for context.
