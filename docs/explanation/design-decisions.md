# Design Decisions

Rationale behind key architectural choices and trade-offs made during development.

## SSO-Focused Authentication Strategy

### Decision: Prioritize SSO Over Traditional Access Keys

**Context:** AWS offers multiple authentication methods including long-lived
access keys, temporary credentials, and SSO-based authentication.

**Decision:** The CLI prioritizes SSO authentication as the primary workflow,
with traditional access key support as secondary.

**Rationale:**

**Security Benefits:**

- **Temporary credentials** with automatic expiry (typically 8 hours)
- **No long-lived secrets** stored in configuration files
- **Centralized access management** through organizational SSO
- **Browser-based authentication** leveraging existing security controls

**Operational Benefits:**

- **Unified authentication** across multiple AWS accounts
- **Simplified credential rotation** managed by SSO provider
- **Audit trail** through SSO authentication events
- **Reduced credential sprawl** in development environments

**Implementation:**

```typescript
// Modern SSO session configuration
[sso-session company]
sso_start_url = https://company.awsapps.com/start
sso_region = us-east-1

[profile dev-account]
sso_session = company
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
```

**Trade-offs:**

- **Requires AWS CLI v2** as dependency
- **Browser dependency** for authentication flow
- **Network connectivity** required for SSO portal access
- **Initial setup complexity** for SSO configuration

**Measurable Benefits:**

- **Zero long-lived credentials** in configuration files
- **Token management** with expiry warnings
- **Graceful degradation** when SSO is unavailable

---

## Composition Over Inheritance

### Decision: Service Composition Instead of Class Hierarchies

**Context:** The authentication domain involves multiple concerns: profile
management, credential validation, token handling, and AWS CLI integration.

**Decision:** Implement services through composition with dependency injection
rather than inheritance hierarchies.

**Architecture Pattern:**

```typescript
class AuthService {
  private readonly cliWrapper: AuthCliWrapper;
  private readonly credentialService: CredentialService;
  private readonly profileManager: ProfileManager;
  private readonly tokenManager: TokenManager;

  constructor(options: AuthServiceOptions) {
    // Composition through constructor injection
    this.cliWrapper = new AuthCliWrapper(options.cliWrapper);
    this.credentialService = new CredentialService(options.credentialService);
    this.profileManager = new ProfileManager(options.profileManager);
    this.tokenManager = new TokenManager(options.tokenManager);
  }

  // Orchestrates services without tight coupling
  async login(input: AuthLogin): Promise<void> {
    await this.cliWrapper.checkInstallation();
    await this.cliWrapper.ssoLogin(profileName);
    await this.credentialService.validateCredentials(profileName);
    this.credentialService.setActiveProfile(profileName);
  }
}
```

**Benefits:**

**Testing Advantages:**

- **Easy mocking** of individual services for unit tests
- **Isolated testing** of each service's responsibilities
- **Integration testing** through service composition
- **TestContainers support** for realistic integration scenarios

**Maintenance Benefits:**

- **Single responsibility** for each service
- **Clear boundaries** between authentication concerns
- **Independent evolution** of service implementations
- **Reduced coupling** between authentication workflows

**Type Safety:**

- **Interface segregation** enables focused contracts
- **Dependency injection** supports polymorphic testing
- **Explicit dependencies** improve code comprehension

**Alternative Rejected:** Traditional inheritance hierarchies would create tight
coupling and make testing complex.

---

## AWS CLI Delegation Strategy

### Decision: Delegate to AWS CLI Instead of Custom Implementation

**Context:** AWS authentication involves complex flows including SSO browser
authentication, token management, and credential provider chains.

**Decision:** Delegate authentication operations to AWS CLI v2 rather than
implementing custom SSO flows.

**Implementation Pattern:**

```typescript
class AuthCliWrapper {
  async ssoLogin(profileName: string): Promise<void> {
    // Delegate to AWS CLI for proven authentication flow
    const result = await this.executeCommand(`aws sso login --profile ${profileName}`);

    if (result.exitCode !== 0) {
      throw new AuthenticationError("SSO login failed", "sso-login", profileName);
    }
  }

  async checkInstallation(): Promise<AwsCliInstallation> {
    // Verify AWS CLI v2 availability and version
    const result = await this.executeCommand("aws --version");
    return this.parseInstallationInfo(result.stdout);
  }
}
```

**Rationale:**

**Reliability Benefits:**

- **Proven implementation** with extensive real-world usage
- **Browser flow handling** including popup management and callbacks
- **Token cache management** with secure storage
- **Cross-platform compatibility** for authentication flows

**Maintenance Benefits:**

- **No custom browser integration** reduces complexity
- **AWS CLI updates** automatically improve authentication flows
- **Established token formats** ensure compatibility
- **Error handling** for authentication edge cases

**Integration Benefits:**

- **Consistent behavior** with existing AWS CLI workflows
- **Shared token cache** enables interoperability
- **Standard configuration** follows AWS CLI conventions

**Trade-offs:**

- **External dependency** on AWS CLI v2 installation
- **Version compatibility** requirements for CLI features
- **Limited customization** of authentication flows
- **Debugging complexity** across process boundaries

**Alternative Rejected:** Custom SSO implementation would require significant
development effort and risk introducing authentication vulnerabilities.

---

## Graceful Error Handling Strategy

### Decision: Comprehensive Error Handling with User Guidance

**Context:** CLI tools often fail with cryptic error messages that don't
help users resolve issues.

**Decision:** Implement structured error handling with structured error types,
user-friendly messages, and actionable resolution guidance.

**Error Architecture:**

```typescript
// Structured error types with context
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
      return (
        "Try running 'aws configure sso' to set up your SSO profile," +
        " then 'aws sso login --profile <profile>'"
      );
    case "credential-validation":
      return "Run 'aws sso login --profile <profile>' to refresh your credentials";
    case "profile-discovery":
      return "Check your AWS configuration files (~/.aws/config) for syntax errors";
    default:
      return "Check your AWS configuration and try again";
  }
}
```

**Graceful Degradation Pattern:**

```typescript
async parseConfigFile(): Promise<AwsProfileConfig[]> {
  try {
    await fs.access(this.options.configFilePath);
  } catch (error) {
    // Graceful degradation for expected errors
    if (error instanceof Error && error.message.includes('ENOENT')) {
      if (this.options.enableDebugLogging) {
        console.debug(`AWS config file not found: ${this.options.configFilePath}`);
      }
      return []; // Continue with empty configuration
    }

    // Fail fast for unexpected errors
    throw new ProfileError(
      'Failed to access config file',
      undefined,
      'config-access',
      this.options.configFilePath,
      { error }
    );
  }
}
```

**Benefits:**

**User Experience:**

- **Clear error messages** with specific failure context
- **Actionable guidance** for resolving common issues
- **Debug information** available through verbose mode
- **Graceful degradation** maintains partial functionality

**Developer Experience:**

- **Structured error types** enable programmatic handling
- **Comprehensive logging** aids in troubleshooting
- **Error categorization** helps identify failure patterns
- **Context preservation** through error chaining

**Operational Benefits:**

- **Reduced support burden** through self-service resolution
- **Diagnostic information** for complex failure scenarios
- **Consistent error patterns** across all commands

**Alternative Rejected:** Generic error handling would provide poor user
experience and increase support overhead.

---

## Testing Strategy Design

### Decision: Testing with Service Layer Focus

**Context:** CLI tools require testing at multiple levels including unit,
integration, and end-to-end scenarios.

**Decision:** Implement multi-level testing strategy prioritizing service
layer testing with TestContainers for integration scenarios.

**Testing Hierarchy:**

```typescript
// Unit Tests - Service Layer Focus
describe("AuthService", () => {
  let authService: AuthService;
  let mockServices: MockServices;

  beforeEach(() => {
    mockServices = createMockServices();
    authService = new AuthService({
      cliWrapper: mockServices.cliWrapper,
      credentialService: mockServices.credentialService,
      profileManager: mockServices.profileManager,
      tokenManager: mockServices.tokenManager,
    });
  });

  it("should orchestrate login workflow correctly", async () => {
    // Fast, isolated testing of service coordination
  });
});

// Integration Tests - TestContainers
describe("ProfileManager Integration", () => {
  let container: StartedTestContainer;
  let profileManager: ProfileManager;

  beforeAll(async () => {
    // Real AWS configuration scenarios
    container = await new GenericContainer("alpine:latest").withExposedPorts(22).start();
  });

  it("should handle real configuration files", async () => {
    // Realistic configuration parsing scenarios
  });
});

// E2E Tests - CLI Commands
describe("CLI Authentication E2E", () => {
  it("should run full authentication workflow", async () => {
    // Full command execution with captured output
    const result = await oclif.test(["auth:status", "--verbose"]);
    expect(result.stdout).toContain("AWS CLI Status");
  });
});
```

**Quality Standards:**

- **90% test coverage** minimum with 100% coverage for error paths
- **Service layer focus** for unit testing with dependency injection
- **TestContainers integration** for realistic scenarios
- **E2E coverage** for critical user workflows

**Benefits:**

**Development Quality:**

- **Fast feedback loops** through unit testing
- **Realistic integration testing** with actual AWS configurations
- **Regression prevention** through coverage
- **Refactoring confidence** through extensive test suites

**Architecture Validation:**

- **Service boundaries** verified through isolated testing
- **Error handling** comprehensively tested across scenarios
- **Integration patterns** validated through TestContainers
- **User workflows** verified through E2E testing

**Alternative Rejected:** Manual testing would be insufficient for the
complexity of authentication workflows and error scenarios.

---

## Type Safety Implementation

### Decision: Strict TypeScript with Schemas

**Context:** CLI tools involve complex configuration parsing, user input
validation, and service coordination.

**Decision:** Implement strict TypeScript v5.9 with Zod schemas for runtime
validation and type coverage.

**Type Safety Pattern:**

```typescript
// Compile-time type safety with runtime validation
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
}
```

**Configuration Validation:**

```typescript
// Strict TypeScript configuration
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**Benefits:**

**Development Benefits:**

- **Compile-time error detection** prevents runtime failures
- **IDE integration** provides autocomplete and refactoring
- **Runtime validation** catches configuration errors early
- **Type inference** reduces boilerplate while maintaining safety

**Maintenance Benefits:**

- **Refactoring confidence** through type checking
- **API contract enforcement** between service layers
- **Configuration validation** prevents deployment issues
- **Error reduction** through strict type requirements

**Quality Benefits:**

- **Zero ESLint violations** achieved through strict typing
- **Documentation** through TSDoc integration
- **Test safety** through typed mock interfaces
- **Build-time validation** prevents invalid configurations

**Alternative Rejected:** Loose typing would sacrifice the reliability and
maintainability benefits essential for production CLI tools.

---

## Configuration Inheritance Design

### Decision: SSO Session Property Inheritance

**Context:** Modern AWS SSO configuration uses session-based inheritance to
reduce duplication across multiple profiles.

**Decision:** Implement property inheritance from SSO sessions
to profiles with clear precedence rules.

**Inheritance Logic:**

```typescript
private resolveSsoSessionProperties(profile: AwsProfileConfig): {
  ssoStartUrl?: string;
  region?: string;
} {
  let resolvedSsoStartUrl = profile.ssoStartUrl;
  let resolvedRegion = profile.region;

  if (profile.ssoSession) {
    const ssoSession = this.ssoSessionCache.get(profile.ssoSession);
    if (ssoSession) {
      // Inherit SSO start URL if not directly specified
      if (!resolvedSsoStartUrl) {
        resolvedSsoStartUrl = ssoSession.ssoStartUrl;
      }
      // Inherit region from SSO session if not specified in profile
      if (!resolvedRegion) {
        resolvedRegion = ssoSession.ssoRegion;
      }
    }
  }

  const result: { ssoStartUrl?: string; region?: string } = {};
  if (resolvedSsoStartUrl) result.ssoStartUrl = resolvedSsoStartUrl;
  if (resolvedRegion) result.region = resolvedRegion;
  return result;
}
```

**Precedence Rules:**

1. **Direct profile properties** (highest precedence)
2. **SSO session properties**
3. **Default values** (lowest precedence)

**Benefits:**

**Configuration Benefits:**

- **DRY principle** applied to SSO configuration
- **Centralized SSO settings** across multiple profiles
- **Simplified multi-account setup** through session reuse
- **Clear inheritance hierarchy** for troubleshooting

**Maintenance Benefits:**

- **Single source of truth** for SSO portal URLs
- **Consistent configuration** across team environments
- **Reduced configuration errors** through centralization
- **Easy SSO portal migration** through session updates

**User Experience:**

- **Modern AWS CLI compatibility** with standard patterns
- **Intuitive configuration structure** following AWS conventions
- **Clear error messages** for inheritance issues
- **Validation** of inheritance chains

**Alternative Rejected:** Requiring SSO properties in every profile would
violate DRY principles and increase configuration maintenance burden.

These design decisions demonstrate the CLI's commitment to **security**,
**maintainability**, **type safety**, and **user experience** while providing
**measurable benefits** and **documented architectural rationale** for each
choice.
