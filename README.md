# AWS TypeScript CLI

[![Build Status](https://github.com/enri3l/aws-ts/workflows/CI/badge.svg)](https://github.com/enri3l/aws-ts/actions)
[![Coverage Status](https://img.shields.io/codecov/c/github/enri3l/aws-ts)](https://codecov.io/gh/enri3l/aws-ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24.6+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-ff6b35.svg)](https://claude.ai/code)

Modern TypeScript-based command-line interface for AWS operations with
comprehensive architecture and testing infrastructure.

## ✨ Features

- **🔧 TypeScript-First**: Built with TypeScript v5.9 and strict type checking
- **🏗️ Modular Architecture**: CQRS pattern with clean separation of concerns
- **🧪 Comprehensive Testing**: Unit, integration, and E2E testing with TestContainers
- **⚡ AWS SDK v3**: Latest AWS SDK with SSO credential provider integration
- **📚 TSDoc Documentation**: Machine-readable documentation with automated API docs
- **🔍 Quality Tooling**: ESLint, Prettier, and automated quality gates
- **🚀 Developer Experience**: Hot reload, debug support, and semantic versioning
- **📊 Data Processing**: Built-in support for JSON, JSONL, CSV, and TSV formats
- **🔐 Input Validation**: Zod schemas for comprehensive input validation
- **🎯 Error Handling**: Structured error types with user-friendly messages

## 🚀 Quick Start

### Prerequisites

- **Node.js** 24.6+
- **pnpm** 10+

### Installation

```bash
# Install globally
npm install -g aws-ts-cli

# Or use directly with npx
npx aws-ts-cli --help
```

### Basic Usage

```bash
# Display help
aws-ts --help

# Set AWS configuration
aws-ts config set --region us-east-1 --profile my-profile

# List DynamoDB tables
aws-ts dynamo tables list

# Export table data
aws-ts dynamo table export MyTable --format json --output data.json
```

## 📖 Documentation

This project follows the [Diataxis framework](https://diataxis.fr/) for
comprehensive documentation:

- **[📚 Documentation Site](https://enri3l.github.io/aws-ts/)** - Complete documentation
- **[🎓 Tutorials](https://enri3l.github.io/aws-ts/tutorials/)** - Step-by-step
  learning guides
- **[📋 How-To Guides](https://enri3l.github.io/aws-ts/how-to/)** - Problem-solving
  guides
- **[📖 API Reference](https://enri3l.github.io/aws-ts/api/)** - Complete API
  documentation
- **[💡 Architecture](https://enri3l.github.io/aws-ts/explanation/)** - Design
  decisions and concepts

## 🏗️ Architecture

This CLI follows modern software architecture principles:

```text
src/
├── commands/           # Oclif command definitions
├── handlers/          # CQRS command/query handlers
├── lib/
│   ├── data-processing.ts  # Multi-format data processing
│   ├── errors.ts          # Structured error handling
│   ├── logger.ts          # Structured logging
│   └── schemas.ts         # Zod validation schemas
└── index.ts           # CLI entry point
```

### Key Patterns

- **CQRS (Command Query Responsibility Segregation)**: Separate read and write operations
- **Factory Pattern**: Centralized handler creation with dependency injection
- **Strategy Pattern**: Pluggable data processing for multiple formats
- **Validation Layer**: Comprehensive input validation with Zod schemas

## 🛠️ Development

### Setup

```bash
# Clone the repository
git clone https://github.com/enri3l/aws-ts.git
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

# Testing
pnpm test                  # Interactive test mode
pnpm test:run              # Run all tests once
pnpm test:coverage         # Run tests with coverage
pnpm test:integration      # Run integration tests

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
```

## 🧪 Testing Strategy

The project implements a comprehensive testing approach:

### Test Types

- **Unit Tests**: Fast, isolated tests for individual components
- **Integration Tests**: TestContainers with DynamoDB Local for AWS integration
- **E2E Tests**: Full CLI command testing with captured output

### Running Tests

```bash
# Run specific test types
pnpm test --project unit
pnpm test --project integration
pnpm test --project e2e

# Coverage reporting
pnpm test:coverage
```

### Test Structure

```text
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests with TestContainers
├── e2e/              # End-to-end CLI tests
├── setup.ts          # Global test setup
└── utils/            # Test utilities and helpers
```

## 🔧 Configuration

### Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=my-profile

# Development
NODE_ENV=development
LOG_LEVEL=DEBUG
NO_COLOR=false

# Testing
DYNAMODB_ENDPOINT=http://localhost:8000
```

### CLI Configuration

```bash
# Global configuration
aws-ts config set --region us-east-1 --profile production

# Command-specific options
aws-ts dynamo tables list --region us-west-2 --output json
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md)
for details.

### Development Workflow

1. **Fork and Clone**: Fork the repository and clone your fork
2. **Branch**: Create a feature branch (`git checkout -b feature/amazing-feature`)
3. **Develop**: Make your changes following our coding standards
4. **Test**: Ensure all tests pass (`pnpm validate`)
5. **Commit**: Use conventional commits (`git commit -m 'feat: add amazing feature'`)
6. **Push**: Push to your branch (`git push origin feature/amazing-feature`)
7. **PR**: Open a Pull Request with a clear description

### Code Standards

- **TypeScript**: Strict mode with comprehensive type safety
- **ESLint**: Enforced code quality rules with TSDoc validation
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Semantic commit messages for automated versioning
- **Test Coverage**: Minimum 90% coverage for new code

## 📋 Requirements

- **Node.js**: 24.6.0 or higher
- **pnpm**: 10.0 or higher
- **TypeScript**: 5.9 or higher

## 📦 Dependencies

### Core Dependencies

- **[@oclif/core](https://oclif.io/)**: CLI framework
- **[@aws-sdk/client-dynamodb](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/)**:
  AWS SDK v3
- **[zod](https://zod.dev/)**: Schema validation
- **[ora](https://github.com/sindresorhus/ora)**: Terminal spinners

### Development Dependencies

- **[vitest](https://vitest.dev/)**: Testing framework
- **[testcontainers](https://testcontainers.com/)**: Integration testing
- **[typescript-eslint](https://typescript-eslint.io/)**: TypeScript linting
- **[semantic-release](https://semantic-release.gitbook.io/)**: Automated versioning

## 🤖 AI Development

This project was developed with assistance from [Claude Code](https://claude.ai/code),
Anthropic's agentic coding tool that understands codebases and helps with:

- **Architecture Design**: CQRS patterns and modular structure
- **Code Generation**: TypeScript handlers and validation schemas
- **Documentation**: TSDoc standards and comprehensive README
- **Quality Assurance**: Linting rules and testing strategies

## 📝 License

This project is licensed under the [Apache License 2.0](LICENSE) - see the
LICENSE file for details.

## 🙏 Acknowledgments

- **[Oclif](https://oclif.io/)** - Excellent CLI framework
- **[AWS SDK Team](https://aws.amazon.com/sdk-for-javascript/)** -
  Comprehensive AWS integration
- **[Vitest](https://vitest.dev/)** - Fast and modern testing framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety and developer
  experience
- **[Claude Code](https://claude.ai/code)** - AI-assisted development

---

**Built with ❤️ by [Enrico Lionello](https://github.com/enri3l) and 🤖 [Claude Code](https://claude.ai/code)**

For questions, issues, or contributions, please visit our
[GitHub repository](https://github.com/enri3l/aws-ts).
