---
title: API Reference
---

## API Reference

Welcome to the API reference for `@monte3l/aws-ts`. This documentation is auto-generated from TSDoc comments
and provides detailed information about the project's public APIs.

## Architecture Overview

The codebase follows a layered CQRS architecture with clear separation of concerns:

- **Commands** (`src/commands/`) - OCLIF CLI command implementations for user-facing operations
- **Services** (`src/services/`) - Business logic orchestration layer with dependency injection
- **Lib** (`src/lib/`) - Core utilities, schemas, error handling, and data processing
- **Handlers** (`src/handlers/`) - CQRS command/query handlers with factory pattern

## Key Components

### Authentication System

AWS authentication workflow with multi-profile SSO support:

- `AuthService` - High-level authentication orchestration
- `CredentialService` - AWS credential validation and management
- `ProfileManager` - Multi-profile configuration handling
- `TokenManager` - Session and token lifecycle management

### Data Processing Engine

Unified data processing for CLI input/output:

- `DataProcessor` - Multi-format processing (JSON, CSV, JSONL, TSV)
- Support for streaming large datasets with memory efficiency
- Type inference and validation with structured error handling

### Error Management

Structured error handling with user guidance:

- `BaseError` hierarchy with contextual metadata
- Authentication-specific errors with resolution guidance
- Sanitization and contextual help systems

## Getting Started

Start with the main entry point in `src/index.ts` and explore:

1. **CLI Commands**: Browse `src/commands/auth/` for user-facing operations
2. **Service Layer**: Examine `src/services/` for business logic patterns
3. **Core Utilities**: Review `src/lib/` for reusable components

## Documentation Standards

All public APIs follow Microsoft's TSDoc standard with:

- Parameter and return type documentation
- Usage examples for complex operations
- Error condition documentation
- Architectural context and design decisions
