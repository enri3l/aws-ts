# AWS TypeScript CLI

[![CI](https://github.com/monte3l/aws-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/monte3l/aws-ts/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=monte3l_aws-ts&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=monte3l_aws-ts)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=monte3l_aws-ts&metric=coverage)](https://sonarcloud.io/summary/new_code?id=monte3l_aws-ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24.6+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-ff6b35.svg)](https://claude.ai/code)

Modern TypeScript-based command-line interface for AWS operations with
CQRS architecture.

## Features

- **TypeScript-First**: Built with TypeScript v5.9 and strict type checking
- **Modular Architecture**: CQRS pattern with clean separation of concerns
- **AWS SDK v3**: Latest AWS SDK with SSO credential provider integration
- **TSDoc Documentation**: Machine-readable documentation with automated API docs
- **Quality Tooling**: ESLint, Prettier, and automated quality gates
- **Developer Experience**: Hot reload, debug support, and semantic versioning
- **AWS Authentication**: SSO session management and multi-profile support
- **Input Validation**: Zod schemas for input validation
- **Error Handling**: Structured error types with user-friendly messages

## Quick Start

### Prerequisites

- **Node.js** 24.6+
- **pnpm** 10+

### Installation

For development and local testing:

```bash
# Clone and setup for development
git clone https://github.com/monte3l/aws-ts.git
cd aws-ts
pnpm install
pnpm build

# Link globally for development use
pnpm link --global

# Verify installation
aws-ts --help
```

For production installation (when available):

```bash
# Install from JSR registry
npx jsr add @monte3l/aws-ts

# Or using pnpm
pnpm dlx jsr add @monte3l/aws-ts

# Or using deno
deno add @monte3l/aws-ts
```

### Basic Usage

```bash
# Display help
aws-ts --help

# Check your current AWS authentication status
aws-ts auth:status

# List all available AWS profiles
aws-ts auth:profiles

# Log in using a specific SSO profile
aws-ts auth:login --profile my-sso-profile

# S3 object operations
aws-ts s3:list-objects my-bucket
aws-ts s3:get-object my-bucket path/to/file.txt --output ./local-file.txt
aws-ts s3:put-object my-bucket path/to/file.txt ./local-file.txt
aws-ts s3:delete-object my-bucket path/to/file.txt
aws-ts s3:copy-object source-bucket file.txt dest-bucket file.txt
aws-ts s3:head-object my-bucket path/to/file.txt
```

## Documentation

This project follows the [Diataxis framework](https://diataxis.fr/) for
documentation:

- **[Documentation Site](https://enri3l.github.io/aws-ts/)** - Complete documentation
- **[Tutorials](https://enri3l.github.io/aws-ts/tutorials/)** - Step-by-step
  learning guides
- **[How-To Guides](https://enri3l.github.io/aws-ts/how-to/)** - Problem-solving
  guides
- **[API Reference](https://enri3l.github.io/aws-ts/api/)** - Complete API
  documentation
- **[Architecture](https://enri3l.github.io/aws-ts/explanation/)** - Design
  decisions and concepts

## Architecture

This CLI is built on [Oclif](https://oclif.io/) and follows modern software design
principles, emphasizing a clear separation of concerns between commands and core
business logic. The authentication functionality is encapsulated within a dedicated
`AuthService`, ensuring modularity and testability.

For a detailed breakdown of the design patterns, CQRS principles, and architectural
decisions, please see the **[full Architecture documentation](https://enri3l.github.io/aws-ts/explanation/)**.

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/monte3l/aws-ts.git
cd aws-ts

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run in development mode
pnpm dev
```

### Available Scripts

```bash
# Development
pnpm dev                    # Watch mode with hot reload
pnpm dev:debug             # Debug mode with inspector

# Building
pnpm build                 # Production build
pnpm clean                 # Clean build artifacts

# Quality
pnpm typecheck             # TypeScript type checking
pnpm lint                  # ESLint + Markdownlint
pnpm lint:fix              # Auto-fix linting issues
pnpm format                # Prettier formatting check
pnpm format:fix            # Auto-fix formatting
pnpm validate              # Full validation pipeline

# Documentation
pnpm docs:dev              # Start documentation server
pnpm docs:build            # Build documentation
pnpm docs:api              # Generate API docs

# Publishing
pnpm publish:jsr           # Publish to JSR registry
pnpm publish:jsr:dry-run   # Test publish to JSR (dry run)
```

## Configuration

### Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=my-profile

# Development
NODE_ENV=development
LOG_LEVEL=DEBUG
NO_COLOR=false
```

### CLI Configuration

```bash
# Global configuration
aws-ts config set --region us-east-1 --profile production

# Command-specific options
aws-ts dynamo tables list --region us-west-2 --output json
```

## Contributing

We welcome contributions!

### Development Workflow

1. **Fork and Clone**: Fork the repository and clone your fork
2. **Branch**: Create a feature branch (`git checkout -b feature/amazing-feature`)
3. **Develop**: Make your changes following our coding standards
4. **Validate**: Ensure code passes validation (`pnpm validate`)
5. **Commit**: Use conventional commits (`git commit -m 'feat: add amazing feature'`)
6. **Push**: Push to your branch (`git push origin feature/amazing-feature`)
7. **PR**: Open a Pull Request with a clear description

### Code Standards

- **TypeScript**: Strict mode with type safety
- **ESLint**: Enforced code quality rules with TSDoc validation
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Semantic commit messages for automated versioning

## Requirements

- **Node.js**: 24.6.0 or higher
- **pnpm**: 10.0 or higher
- **TypeScript**: 5.9 or higher

## Dependencies

### Core Dependencies

- **[@oclif/core](https://oclif.io/)**: CLI framework
- **[@aws-sdk/client-sts](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/)**:
  AWS SDK v3 for credential validation
- **[@aws-sdk/credential-providers](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/)**:
  AWS credential provider chain
- **[zod](https://zod.dev/)**: Schema validation
- **[ora](https://github.com/sindresorhus/ora)**: Terminal spinners

### Development Dependencies

- **[typescript-eslint](https://typescript-eslint.io/)**: TypeScript linting
- **[semantic-release](https://semantic-release.gitbook.io/)**: Automated versioning

## AI Development

This project was developed with assistance from [Claude Code](https://claude.ai/code),
Anthropic's agentic coding tool that understands codebases and helps with:

- **Architecture Design**: CQRS patterns and modular structure
- **Code Generation**: TypeScript handlers and validation schemas
- **Documentation**: TSDoc standards and README
- **Quality Assurance**: Linting rules and quality gates

## License

This project is licensed under the [Apache License 2.0](LICENSE) - see the
LICENSE file for details.

## Acknowledgments

- **[Oclif](https://oclif.io/)** - Excellent CLI framework
- **[AWS SDK Team](https://aws.amazon.com/sdk-for-javascript/)** -
  AWS integration
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety and developer
  experience
- **[Claude Code](https://claude.ai/code)** - AI-assisted development

---

**Built by [Enrico Lionello](https://github.com/enri3l) and [Claude Code](https://claude.ai/code)**

For questions, issues, or contributions, please visit our
[GitHub repository](https://github.com/monte3l/aws-ts).
