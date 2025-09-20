# AWS TypeScript CLI

Production-ready AWS TypeScript CLI tool with comprehensive architecture,
testing infrastructure, and TSDoc documentation standards.

## Narrative Summary

This application provides a command-line interface for AWS operations built on
OCLIF framework with TypeScript v5.9. The implementation features a modular
CQRS architecture with comprehensive quality gates, testing infrastructure,
and CI/CD pipelines. All foundation components with zero ESLint violations
and comprehensive TSDoc documentation.

## Implementation Status

**FOUNDATION** - All core infrastructure and quality systems operational:

- ✅ Zero ESLint/TSDoc compliance issues (51 → 0 violations resolved)
- ✅ Comprehensive testing infrastructure with Vitest and TestContainers
- ✅ CI/CD pipelines with quality gates and automated workflows
- ✅ CQRS handler architecture with dependency injection
- ✅ Multi-format data processing (JSON/JSONL/CSV/TSV)
- ✅ Error handling and validation with Zod schemas
- ✅ Repository published and deployed to GitHub with full documentation

**AUTHENTICATION SYSTEM** - AWS authentication with SSO support:

- ✅ SSO session configuration with `sso_session` support
- ✅ Profile management and discovery (`auth:status`, `auth:profiles`)
- ✅ Graceful error handling with clean debug output
- ✅ Token management with expiry detection and warnings
- ✅ Multi-profile logout support (`auth:logout --all-profiles`)

## Tech Stack

- **Runtime**: TypeScript v5.9 + Node.js v24 with strict type checking
- **CLI Framework**: OCLIF v4.5 with modular command architecture
- **AWS**: SDK for JavaScript v3 with SSO credential provider integration
- **Data Processing**: Support for JSON/JSONL/CSV/TSV with streaming
- **Validation**: Zod v4.1 for comprehensive schema validation
- **Testing**: Vitest v3.2 with TestContainers for integration testing
- **Documentation**: TSDoc standard with ESLint enforcement and automated
  API docs
- **Tools**: pnpm v10, ESLint v9 (with JSDoc rules), Prettier v3.6
- **CI/CD**: GitHub Actions with semantic-release, commitlint, lefthook
- **Quality Gates**: 90% test coverage, zero linting violations, automated
  security audits

## Quick Start

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Check authentication status
aws-ts auth:status

# Login with SSO profile
aws-ts auth:login --profile your-profile

# View all profiles
aws-ts auth:profiles
```

## Documentation Structure

This documentation follows the [Diataxis framework](https://diataxis.fr/) for
clear, structured technical communication:

- **[Tutorials](/tutorials/)** - Learning-oriented lessons to get you started
  with usage and workflows
- **[How-To Guides](/how-to/)** - Problem-oriented guides for specific tasks
- **[Reference](/reference/)** - Information-oriented technical reference for
  commands and configuration
- **[Explanation](/explanation/)** - Understanding-oriented discussion of
  architecture and design decisions

## API Documentation

API documentation is generated from TSDoc comments in the source code using
TypeDoc. Key services include `AuthService`, `ProfileManager`, and
`TokenManager` with comprehensive architectural context.
