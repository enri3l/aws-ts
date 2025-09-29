# Architecture

Deep dive into the modular CQRS architecture, service layer design, and
component interactions.

## Architectural Overview

The AWS TypeScript CLI implements a **modular CQRS architecture** with
service layer coordination, following the project's commitment to
**type safety**, **maintainability**, and **structured error handling**.

## CQRS Pattern Implementation

### Command Query Responsibility Segregation

The CLI enforces clear separation between **commands** (write operations)
and **queries** (read operations):

```typescript
// Query Operations (read-only)
interface QueryOperation {
  readonly operation: "query";
  readonly sideEffects: false;
}

// Examples: auth:status, auth:profiles
const statusQuery: QueryOperation = {
  operation: "query",
  sideEffects: false,
};

// Command Operations (state-changing)
interface CommandOperation {
  readonly operation: "command";
  readonly sideEffects: true;
}

// Examples: auth:login, auth:logout
const loginCommand: CommandOperation = {
  operation: "command",
  sideEffects: true,
};
```

### Command Implementation Pattern

Commands follow consistent orchestration through `AuthService`:

```typescript
// Command: auth:login
export class LoginCommand extends Command {
  async run(): Promise<void> {
    const { flags } = await this.parse(LoginCommand);

    // Delegate to service layer
    const authService = new AuthService({
      enableDebugLogging: flags.verbose,
      enableProgressIndicators: true,
    });

    // Service orchestrates the workflow
    await authService.login({
      profile: flags.profile,
      force: flags.force,
      ssoConfig: flags.configure
        ? {
            startUrl: flags["sso-start-url"],
            region: flags["sso-region"],
            accountId: flags["sso-account-id"],
            roleName: flags["sso-role-name"],
          }
        : undefined,
    });
  }
}
```

### Query Implementation Pattern

Queries provide read-only access to authentication state:

```typescript
// Query: auth:status
export class StatusCommand extends Command {
  async run(): Promise<void> {
    const { flags } = await this.parse(StatusCommand);

    const authService = new AuthService({
      enableDebugLogging: flags.verbose,
    });

    // Query operation - no state modification
    const status = await authService.getStatus({
      profile: flags.profile,
      allProfiles: flags["all-profiles"],
      detailed: flags.detailed,
    });

    // Output formatting only
    this.displayStatus(status, flags.format);
  }
}
```

## Service Layer Architecture

### Service Coordination Pattern

The architecture implements **composition over inheritance** with clear service boundaries:

```typescript
class AuthService {
  private readonly cliWrapper: AuthCliWrapper;
  private readonly credentialService: CredentialService;
  private readonly profileManager: ProfileManager;
  private readonly tokenManager: TokenManager;

  constructor(options: AuthServiceOptions) {
    // Dependency injection through composition
    this.cliWrapper = new AuthCliWrapper(options.cliWrapper);
    this.credentialService = new CredentialService(options.credentialService);
    this.profileManager = new ProfileManager(options.profileManager);
    this.tokenManager = new TokenManager(options.tokenManager);
  }

  // Orchestrates complex workflows
  async login(input: AuthLogin): Promise<void> {
    // 1. Check AWS CLI installation
    await this.cliWrapper.checkInstallation();

    // 2. Profile validation and configuration
    const profileName = input.profile ?? this.credentialService.getActiveProfile();

    // 3. SSO authentication workflow
    await this.cliWrapper.ssoLogin(profileName);

    // 4. Credential validation
    await this.credentialService.validateCredentials(profileName);

    // 5. State management
    this.credentialService.setActiveProfile(profileName);
  }
}
```

### Single Responsibility Principle

Each service has a focused responsibility:

#### AuthService - Orchestration

```typescript
/**
 * High-level authentication service for user-facing operations
 *
 * Orchestrates authentication workflows by coordinating AWS CLI wrapper,
 * credential service, profile manager, and token manager.
 */
class AuthService {
  // Coordinates between services
  // Provides user-facing API
  // Handles progress indicators
  // Implements structured error handling
}
```

#### ProfileManager - Configuration Management

```typescript
/**
 * AWS profile manager for multi-profile management
 *
 * Handles AWS profile discovery from configuration files, profile validation,
 * and profile switching operations with structured error handling.
 */
class ProfileManager {
  // Parses AWS config files
  // Resolves SSO session inheritance
  // Manages profile type detection
  // Implements graceful error handling for file access
}
```

#### TokenManager - Token Lifecycle

```typescript
/**
 * SSO token manager for token lifecycle management
 *
 * Manages SSO token expiry detection, refresh operations, and cache
 * integration with AWS CLI SSO mechanisms.
 */
class TokenManager {
  // Reads SSO token cache
  // Detects token expiry
  // Provides expiry warnings
  // Integrates with AWS CLI cache management
}
```

#### CredentialService - Validation

```typescript
/**
 * AWS credential validation and active profile management
 *
 * Validates AWS credentials using SDK credential provider chain
 * and manages active profile state for CLI operations.
 */
class CredentialService {
  // Validates AWS credentials
  // Manages active profile state
  // Integrates with AWS SDK credential providers
  // Handles credential cache management
}
```

## Error Handling Architecture

### Fail-Fast Validation Strategy

The architecture implements **fail-fast validation** at service boundaries:

```typescript
// Input validation at service entry points
class AuthService {
  async login(input: AuthLogin): Promise<void> {
    // Validate input immediately
    const validatedInput = AuthLoginSchema.parse(input);

    try {
      // Early AWS CLI check
      await this.cliWrapper.checkInstallation();

      // Early profile validation
      const profileName = validatedInput.profile ?? this.credentialService.getActiveProfile();
      if (!(await this.profileManager.profileExists(profileName))) {
        throw new AuthenticationError(
          `Profile '${profileName}' not found`,
          "sso-login",
          profileName,
        );
      }

      // Continue with validated inputs
    } catch (error) {
      // Structured error handling with guidance
      throw this.enhanceError(error);
    }
  }
}
```

### Graceful Degradation Patterns

Services implement **graceful degradation** for non-critical failures:

```typescript
class ProfileManager {
  async parseConfigFile(): Promise<AwsProfileConfig[]> {
    try {
      await fs.access(this.options.configFilePath);
    } catch (error) {
      // Graceful degradation for missing files
      if (error instanceof Error && error.message.includes("ENOENT")) {
        if (this.options.enableDebugLogging) {
          console.debug(`AWS config file not found: ${this.options.configFilePath}`);
        }
        return []; // Continue with empty configuration
      }

      // Fail fast for unexpected errors
      throw error;
    }

    // Continue with file parsing...
  }
}
```

### Structured Error Types

The architecture provides **structured error handling** with structured types:

```typescript
// Base error with architectural context
class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly profile?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

// Error enhancement with resolution guidance
function getAuthErrorGuidance(error: AuthenticationError): string {
  switch (error.operation) {
    case "sso-login":
      return "Try running 'aws configure sso' to set up your SSO profile";
    case "credential-validation":
      return "Run 'aws sso login --profile <profile>' to refresh your credentials";
    default:
      return "Check your AWS configuration and try again";
  }
}
```

## Type Safety Implementation

### TypeScript Usage

The architecture leverages **TypeScript v5.9** for type safety:

```typescript
// Strict input validation with Zod schemas
const AuthLoginSchema = z.object({
  profile: z.string().optional(),
  force: z.boolean().optional().default(false),
  configure: z.boolean().optional().default(false),
  ssoConfig: z
    .object({
      startUrl: z.string().url(),
      region: z.string(),
      accountId: z.string(),
      roleName: z.string(),
    })
    .optional(),
});

type AuthLogin = z.infer<typeof AuthLoginSchema>;

// Service interfaces with type coverage
interface AuthService {
  login(input: AuthLogin): Promise<void>;
  getStatus(input: AuthStatus): Promise<AuthStatusResponse>;
  logout(input: AuthLogout): Promise<void>;
  listProfiles(input: AuthProfiles): Promise<ProfileInfo[]>;
  switchProfile(input: AuthSwitch): Promise<void>;
}
```

### Interface Segregation

Services expose focused interfaces following the **Interface Segregation Principle**:

```typescript
// Focused interfaces for specific capabilities
interface ProfileDiscovery {
  discoverProfiles(): Promise<AwsProfileConfig[]>;
  getProfileInfo(profileName: string): Promise<ProfileInfo>;
  profileExists(profileName: string): Promise<boolean>;
}

interface TokenLifecycle {
  getTokenInfo(startUrl: string): Promise<SsoTokenInfo | undefined>;
  getTokenStatus(profileName: string, startUrl: string): Promise<TokenStatus>;
  checkTokenExpiry(): Promise<TokenExpiryResult[]>;
}

interface CredentialValidation {
  validateCredentials(profileName: string): Promise<void>;
  getActiveProfile(): string;
  setActiveProfile(profileName: string): void;
}
```

## Authentication Workflow Design

### SSO Authentication Flow

The architecture implements a SSO workflow:

```typescript
async login(input: AuthLogin): Promise<void> {
  const spinner = this.createSpinner("Authenticating with AWS...");

  try {
    // Phase 1: Environment Validation
    spinner.text = "Checking AWS CLI installation...";
    await this.cliWrapper.checkInstallation();

    // Phase 2: Profile Resolution
    const profileName = input.profile ?? this.credentialService.getActiveProfile();

    // Phase 3: Configuration Setup (if needed)
    if (input.configure ||
        !(await this.profileManager.profileExists(profileName))) {
      spinner.text = `Configuring SSO for profile '${profileName}'...`;
      await this.cliWrapper.configureSso(profileName, input.ssoConfig);
    }

    // Phase 4: Authentication Check
    if (!input.force) {
      spinner.text = "Checking existing authentication...";
      try {
        await this.credentialService.validateCredentials(profileName);
        this.credentialService.setActiveProfile(profileName);
        spinner.succeed(`Already authenticated with profile '${profileName}'`);
        return;
      } catch {
        // Continue with login if validation fails
      }
    }

    // Phase 5: SSO Login
    spinner.text = `Logging in with SSO for profile '${profileName}'...`;
    await this.cliWrapper.ssoLogin(profileName);

    // Phase 6: Validation and State Setting
    spinner.text = "Validating credentials...";
    await this.credentialService.validateCredentials(profileName);
    this.credentialService.setActiveProfile(profileName);

    spinner.succeed(`Successfully authenticated with profile '${profileName}'`);
  } catch (error) {
    spinner.fail("Authentication failed");
    throw this.enhanceErrorWithGuidance(error);
  }
}
```

### Token Management Integration

The architecture integrates SSO token lifecycle management:

```typescript
// Token status checking with architectural context
async getProfileStatus(profileName: string): Promise<ProfileInfo> {
  const profileInfo = await this.profileManager.getProfileInfo(profileName);

  // Credential validation
  let credentialsValid = false;
  try {
    await this.credentialService.validateCredentials(profileName);
    credentialsValid = true;
  } catch {
    credentialsValid = false;
  }

  // Token status for SSO profiles
  let tokenExpiry: Date | undefined;
  if (profileInfo.type === 'sso' && profileInfo.ssoStartUrl) {
    const tokenStatus = await this.tokenManager.getTokenStatus(
      profileName,
      profileInfo.ssoStartUrl
    );
    tokenExpiry = tokenStatus.expiresAt;
  }

  return {
    ...profileInfo,
    credentialsValid,
    tokenExpiry,
  };
}
```

## Testing Architecture

### Service Layer Testing Strategy

The architecture enables multi-level testing through **dependency injection**:

```typescript
// Service testing with mocked dependencies
describe("AuthService", () => {
  let authService: AuthService;
  let mockCliWrapper: MockAuthCliWrapper;
  let mockCredentialService: MockCredentialService;

  beforeEach(() => {
    mockCliWrapper = new MockAuthCliWrapper();
    mockCredentialService = new MockCredentialService();

    authService = new AuthService({
      cliWrapper: mockCliWrapper,
      credentialService: mockCredentialService,
      enableProgressIndicators: false, // Disable for testing
    });
  });

  it("should orchestrate login workflow correctly", async () => {
    // Arrange
    mockCliWrapper.checkInstallation.mockResolvedValue({ installed: true });
    mockCredentialService.validateCredentials.mockResolvedValue();

    // Act
    await authService.login({ profile: "test-profile" });

    // Assert
    expect(mockCliWrapper.ssoLogin).toHaveBeenCalledWith("test-profile");
    expect(mockCredentialService.setActiveProfile).toHaveBeenCalledWith("test-profile");
  });
});
```

### Integration Testing Architecture

The architecture supports **integration testing** with TestContainers:

```typescript
// Integration testing with real AWS services
describe("ProfileManager Integration", () => {
  let profileManager: ProfileManager;
  let tempConfigPath: string;

  beforeEach(async () => {
    // Create temporary AWS config for testing
    tempConfigPath = await createTempAwsConfig();

    profileManager = new ProfileManager({
      configFilePath: tempConfigPath,
      enableDebugLogging: true,
    });
  });

  it("should discover profiles from real config files", async () => {
    const profiles = await profileManager.discoverProfiles();
    expect(profiles).toHaveLength(3);
    expect(profiles[0].type).toBe("sso");
  });
});
```
