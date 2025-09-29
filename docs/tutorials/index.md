# Tutorials

Learning-oriented lessons to get you started with the AWS TypeScript CLI
authentication workflows.

## Getting Started with Authentication

These tutorials guide you through the fundamental concepts and practical usage of
the AWS TypeScript CLI, with concrete examples and step-by-step instructions.

## Available Tutorials

### [Getting Started](./getting-started)

Setup and first-time configuration of the CLI with authentication
system introduction.

**Learning Objectives:**

- Install and build the CLI from source
- Understand the authentication architecture
- Verify AWS CLI dependency requirements
- Run your first authentication status check

### [First Commands](./first-commands)

Hands-on walkthrough of essential authentication commands with SSO profile examples.

**Learning Objectives:**

- Configure SSO session profiles
- Perform SSO login workflows
- Check authentication status across profiles
- Manage profile switching and logout operations

## Architecture Context

The **CQRS command/query pattern** used throughout the CLI:

- **Commands** (`auth:login`, `auth:logout`) - Write operations that modify
  authentication state
- **Queries** (`auth:status`, `auth:profiles`) - Read operations that display
  current state

The **service layer architecture** (`AuthService`, `ProfileManager`,
`TokenManager`) coordinates AWS SDK v3 operations with CLI interfaces.

## Prerequisites

- Node.js v24+ and pnpm v10+
- AWS CLI v2 installed and accessible
- Basic understanding of AWS SSO concepts
- AWS account with SSO configuration
