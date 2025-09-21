# CLI Installation and Setup

Complete guide for installing and configuring the AWS TypeScript CLI to use the
`aws-ts` command instead of `node dist/index.js`.

## Installation Methods

### Method 1: Development Mode (Recommended for Contributors)

For development and local testing, link the package globally using pnpm:

**1. Ensure pnpm is configured for global packages:**

```bash
# Setup pnpm global directory (one-time setup)
pnpm setup

# Apply configuration to current session
source ~/.zshrc  # or ~/.bashrc for bash users
```

**2. Build and link the CLI:**

```bash
# Build the TypeScript project
pnpm build

# Link the package globally for development
pnpm link --global
```

**3. Update your PATH (if needed):**

If `aws-ts` command is not found, ensure pnpm's global bin directory is in your PATH:

```bash
# Add to your shell profile (~/.zshrc, ~/.bashrc, etc.)
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Apply changes
source ~/.zshrc  # or your shell profile
```

**4. Verify installation:**

```bash
# Test the global command
aws-ts --help

# Test authentication commands
aws-ts auth:status
```

### Method 2: Package Installation (Production Use)

Install from the built package tarball:

**1. Create package tarball:**

```bash
# Build and package the CLI
pnpm build
pnpm pack
# Creates: aws-ts-cli-0.1.0.tgz
```

**2. Install globally from tarball:**

```bash
# Install the generated tarball globally
npm install -g ./aws-ts-cli-0.1.0.tgz

# Or with pnpm
pnpm add -g ./aws-ts-cli-0.1.0.tgz
```

**3. Verify installation:**

```bash
# Check version and help
aws-ts --version
aws-ts --help

# Test authentication functionality
aws-ts auth:status
```

### Method 3: Direct Execution (No Installation)

Execute the CLI directly without global installation:

**1. Build the project:**

```bash
pnpm build
```

**2. Create an alias or script:**

```bash
# Add to your shell profile for convenience
alias aws-ts='node /path/to/aws-ts/dist/index.js'

# Or create a wrapper script
echo '#!/bin/bash\nnode /path/to/aws-ts/dist/index.js "$@"' > ~/bin/aws-ts
chmod +x ~/bin/aws-ts
```

**3. Usage:**

```bash
# Use the alias or script
aws-ts auth:status
```

## Verification and Troubleshooting

### Verify Installation Success

After installation, all these commands should work:

```bash
# Version information
aws-ts --version
# Expected: aws-ts-cli/0.1.0 linux-x64 node-v24.6.0

# Command help
aws-ts --help
# Expected: CLI usage information

# Authentication commands
aws-ts auth --help
# Expected: Authentication command listing

# Status check
aws-ts auth:status
# Expected: AWS CLI and authentication status
```

### Common Issues and Solutions

#### Issue: "command not found: aws-ts"

**Cause**: Binary not in PATH or installation incomplete.

**Solution:**

```bash
# Check if binary exists
find ~/.local/share/pnpm -name "aws-ts" 2>/dev/null
find /usr/local/bin -name "aws-ts" 2>/dev/null

# If found, add directory to PATH
export PATH="/path/to/pnpm/bin:$PATH"

# If not found, reinstall
pnpm link --global  # for development
# or
npm install -g ./aws-ts-cli-0.1.0.tgz  # for package installation
```

#### Issue: "Permission denied" when executing

**Cause**: Binary lacks execute permissions.

**Solution:**

```bash
# Find and fix permissions
chmod +x ~/.local/share/pnpm/aws-ts
# or
chmod +x /usr/local/bin/aws-ts
```

#### Issue: "Module not found" errors

**Cause**: Dependencies not installed or incorrect build.

**Solution:**

```bash
# Rebuild with dependencies
pnpm install
pnpm build

# Re-link or reinstall
pnpm unlink --global
pnpm link --global
```

### Development Workflow

For active development, use this workflow:

```bash
# 1. Make code changes
# ... edit source files ...

# 2. Rebuild
pnpm build

# 3. Test changes (global link updates automatically)
aws-ts auth:status

# 4. Run tests
pnpm test:run

# 5. Validate changes
pnpm validate
```

The global link automatically reflects source changes after rebuilding, making development efficient.

## Package Configuration Details

The CLI binary configuration is defined in `package.json`:

```json
{
  "name": "aws-ts-cli",
  "bin": {
    "aws-ts": "./dist/index.js"
  },
  "oclif": {
    "bin": "aws-ts",
    "dirname": "aws-ts",
    "commands": "./dist/commands"
  }
}
```

**Key points:**

- **Binary name**: `aws-ts` (defined in both `bin` and `oclif.bin`)
- **Entry point**: `./dist/index.js` (includes proper shebang `#!/usr/bin/env node`)
- **Commands directory**: `./dist/commands` (OCLIF auto-discovery)
- **Topic separator**: `:` (enables `auth:status` syntax)

## Integration with Documentation

After successful installation, all documentation examples work with `aws-ts`:

```bash
# Tutorial examples
aws-ts auth:status --all-profiles
aws-ts auth:login --profile development

# Reference commands
aws-ts auth:profiles --format json
aws-ts auth:logout --all-profiles

# Configuration workflows
aws-ts auth:switch production
```

This provides a seamless experience matching the documented command patterns throughout the project documentation.

## Production Deployment

For production environments or team distribution:

**1. Package for distribution:**

```bash
# Create production-ready package
pnpm build
pnpm pack
```

**2. Distribute and install:**

```bash
# Team members install from shared package
npm install -g aws-ts-cli-0.1.0.tgz
```

**3. Verify consistent behavior:**

```bash
# All team members can use
aws-ts auth:status
aws-ts auth:profiles
```

This ensures consistent CLI experience across development and production environments.
