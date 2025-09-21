# Explanation

Architecture and design decisions for the AWS TypeScript CLI.

## Understanding-Oriented Approach

This section provides **comprehensive architectural context** and **business logic
documentation** that explains the reasoning behind the CLI's design decisions,
following the project's TSDoc standards for architectural understanding.

## Available Explanations

### [Architecture](./architecture)

Deep dive into the modular CQRS architecture, service layer design, and component
interactions.

**Topics Covered:**

- CQRS command/query separation patterns
- Service layer orchestration and dependency coordination
- Error handling architecture with fail-fast validation
- Authentication workflow design and token management
- Type safety implementation with comprehensive TypeScript usage

### [Design Decisions](./design-decisions)

Rationale behind key architectural choices and trade-offs made during development.

**Topics Covered:**

- Why SSO-focused authentication over traditional access keys
- Composition over inheritance in service design
- AWS CLI delegation vs custom implementation
- Error handling strategy with graceful degradation
- Testing strategy with comprehensive coverage requirements

## Architectural Context

The CLI strives to follow the project's **quality standards**:

### SOLID Principles Implementation

- **Single Responsibility**: Each service handles one aspect of authentication
- **Open/Closed**: Extension through composition, not modification
- **Liskov Substitution**: Service interfaces enable testing and mocking
- **Interface Segregation**: Focused interfaces for specific capabilities
- **Dependency Inversion**: High-level modules don't depend on low-level details

### Design Philosophy Application

- **Prefer simplicity over sophistication** - Clear service boundaries over
  complex inheritance
- **Add complexity only with measurable benefits** - Every abstraction
  justified by concrete needs
- **No over-engineering** - Direct solutions without unnecessary indirection
- **Comprehensive documentation** - Every design decision documented with rationale

## Business Logic Documentation

### Authentication Domain Logic

The explanations cover **non-obvious decisions** in authentication workflows:

- Why browser-based SSO is preferred over programmatic flows
- How profile inheritance from SSO sessions reduces configuration duplication
- Why token expiry warnings use 15-minute thresholds
- How credential cache management balances security and usability

### Error Handling Philosophy

Detailed coverage of **comprehensive error handling** principles:

- When to use graceful degradation vs fail-fast validation
- How error messages provide actionable resolution guidance
- Why verbose mode includes architectural context without overwhelming users
- How structured error types enable programmatic handling

## Concrete Usage Examples

Each explanation includes **concrete code examples** showing:

- Service interaction patterns in real authentication scenarios
- How CQRS separation manifests in command implementations
- Error handling patterns with actual error messages and resolutions
- Configuration inheritance examples with specific file formats

## Relationship to Implementation

### Service Layer Architecture

Explanations map directly to implementation:

- `AuthService` - High-level orchestration patterns
- `ProfileManager` - Configuration parsing and inheritance logic
- `TokenManager` - SSO token lifecycle management
- `CredentialService` - AWS credential validation strategies

### Quality Standards Integration

Each explanation demonstrates:

- How **TSDoc documentation** standards apply to architectural decisions
- Why **fail-fast validation** improves user experience
- How **graceful degradation** maintains functionality during partial failures
- Why **composition over inheritance** enables better testing and maintenance

## Design Decision Context

### Technology Choices

Explanations cover rationale for:

- TypeScript v5.9 + Node.js v24 for runtime type safety
- OCLIF v4.5 for CLI framework with modular commands
- AWS SDK v3 for modern credential provider chain integration
- Vitest v3.2 for comprehensive testing with TestContainers

### Architecture Patterns

Deep analysis of:

- Why CQRS fits CLI command patterns better than traditional MVC
- How service layer coordination reduces coupling between components
- Why dependency injection through constructor patterns enables testing
- How comprehensive error handling patterns improve reliability

## Understanding Development Philosophy

The explanations reveal the **development philosophy** behind:

- **Don't Repeat Yourself** without compromising clarity
- **Unit tests > integration tests > E2E tests** with documented strategies
- **Type safety, maintainability, readability** as primary goals
- **Robust error handling** with user-friendly messages

These explanations provide the **architectural context** and **business logic
documentation** necessary to understand, maintain, and extend the CLI while
preserving its design integrity.
