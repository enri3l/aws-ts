/**
 * High-level authentication service for user-facing operations
 *
 * Orchestrates authentication workflows by coordinating AWS CLI wrapper,
 * credential service, profile manager, and token manager. Provides
 * comprehensive authentication operations for CLI commands.
 *
 */

import ora from "ora";
import { AuthenticationError, ProfileError, getAuthErrorGuidance } from "../lib/auth-errors.js";
import type {
  AuthLogin,
  AuthLogout,
  AuthProfiles,
  AuthStatus,
  AuthStatusResponse,
  AuthSwitch,
  ProfileInfo,
} from "../lib/auth-schemas.js";
import { AuthCliWrapper, type AuthCliWrapperOptions } from "./auth-cli-wrapper.js";
import { CredentialService, type CredentialServiceOptions } from "./credential-service.js";
import { ProfileManager, type ProfileManagerOptions } from "./profile-manager.js";
import { TokenManager, type TokenManagerOptions } from "./token-manager.js";

/**
 * Spinner interface for progress indicators
 * @internal
 */
interface SpinnerInterface {
  text: string;
  succeed: (message?: string) => void;
  fail: (message?: string) => void;
  warn: (message?: string) => void;
}

/**
 * Configuration options for authentication service
 *
 * @public
 */
export interface AuthServiceOptions {
  /**
   * AWS CLI wrapper configuration
   */
  cliWrapper?: AuthCliWrapperOptions;

  /**
   * Credential service configuration
   */
  credentialService?: CredentialServiceOptions;

  /**
   * Profile manager configuration
   */
  profileManager?: ProfileManagerOptions;

  /**
   * Token manager configuration
   */
  tokenManager?: TokenManagerOptions;

  /**
   * Enable debug logging for authentication operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   */
  enableProgressIndicators?: boolean;
}

/**
 * Authentication service for high-level user operations
 *
 * Provides a unified interface for all authentication operations,
 * coordinating between AWS CLI, credential management, and profile handling.
 *
 * @public
 */
export class AuthService {
  private readonly cliWrapper: AuthCliWrapper;
  private readonly credentialService: CredentialService;
  private readonly profileManager: ProfileManager;
  private readonly tokenManager: TokenManager;
  private readonly options: AuthServiceOptions;

  /**
   * Create a new authentication service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: AuthServiceOptions = {}) {
    this.options = {
      ...options,
      enableProgressIndicators:
        options.enableProgressIndicators ??
        (process.env.NODE_ENV !== "test" && !process.env.CI && !process.env.VITEST),
    };

    this.cliWrapper = new AuthCliWrapper({
      enableDebugLogging: options.enableDebugLogging ?? false,
      ...options.cliWrapper,
    });

    this.credentialService = new CredentialService({
      enableDebugLogging: options.enableDebugLogging ?? false,
      ...options.credentialService,
    });

    this.profileManager = new ProfileManager({
      enableDebugLogging: options.enableDebugLogging ?? false,
      ...options.profileManager,
    });

    this.tokenManager = new TokenManager({
      enableDebugLogging: options.enableDebugLogging ?? false,
      ...options.tokenManager,
    });
  }

  /**
   * Perform authentication login
   *
   * @param input - Login command input
   * @returns Promise resolving when login is complete
   * @throws \{AuthenticationError\} When login fails
   */
  async login(input: AuthLogin): Promise<void> {
    const spinner = this.createSpinner("Authenticating with AWS...");

    try {
      /**
       * Verify AWS CLI availability before attempting authentication operations.
       * This validation ensures the underlying CLI tools required for SSO flows
       * are properly installed and accessible in the system PATH, preventing
       * runtime failures during authentication attempts.
       *
       * @internal
       */
      spinner.text = "Checking AWS CLI installation...";
      await this.cliWrapper.checkInstallation();

      const profileName = input.profile ?? this.credentialService.getActiveProfile();

      /**
       * Ensure target profile exists or create it when configuration is requested.
       * This conditional setup flow handles two scenarios:
       * 1. Explicit profile configuration via --configure flag
       * 2. Automatic profile creation when target profile doesn't exist
       *
       * Requires SSO configuration parameters to establish the profile's
       * authentication context and prevent incomplete profile setup.
       *
       * @internal
       */
      if (input.configure || !(await this.profileManager.profileExists(profileName))) {
        if (!input.ssoConfig) {
          throw new AuthenticationError(
            `Profile '${profileName}' not found. Use --configure flag with SSO configuration to set up a new profile`,
            "sso-login",
            profileName,
          );
        }

        spinner.text = `Configuring SSO for profile '${profileName}'...`;
        await this.cliWrapper.configureSso(profileName, input.ssoConfig);
      }

      /**
       * Skip re-authentication for valid existing credentials unless forced.
       * This optimization reduces unnecessary SSO round-trips and improves
       * user experience by leveraging cached valid credentials. Force flag
       * allows explicit credential refresh for troubleshooting scenarios.
       *
       * Even when credentials are already valid, the profile is set as active
       * to ensure consistent environment state for subsequent operations.
       *
       * @internal
       */
      if (!input.force) {
        spinner.text = "Checking existing authentication...";
        try {
          await this.credentialService.validateCredentials(profileName);
          /**
           * Set as active profile even when already authenticated to ensure
           * consistent environment state for subsequent operations.
           */
          this.credentialService.setActiveProfile(profileName);
          spinner.succeed(`Already authenticated with profile '${profileName}'`);
          return;
        } catch {
          /**
           * Continue with login flow if credential validation fails.
           * This ensures robust authentication recovery from invalid
           * or expired credential states.
           */
        }
      }

      /**
       * Execute SSO authentication flow through AWS CLI integration.
       * This delegates to the CLI wrapper which handles the complex SSO
       * browser-based authentication flow, token exchange, and credential
       * caching. The operation may open a browser window for user interaction.
       *
       * @internal
       */
      spinner.text = `Logging in with SSO for profile '${profileName}'...`;
      await this.cliWrapper.ssoLogin(profileName);

      spinner.text = "Validating credentials...";
      await this.credentialService.validateCredentials(profileName);

      this.credentialService.setActiveProfile(profileName);

      spinner.succeed(`Successfully authenticated with profile '${profileName}'`);
    } catch (error) {
      spinner.fail("Authentication failed");

      if (error instanceof AuthenticationError) {
        const guidance = getAuthErrorGuidance(error);
        throw new AuthenticationError(
          `${error.message}\n\nResolution: ${guidance}`,
          error.metadata.operation as string,
          error.metadata.profile as string,
          error,
        );
      }

      throw error;
    }
  }

  /**
   * Get authentication status
   *
   * @param input - Status command input
   * @returns Promise resolving to authentication status
   */
  async getStatus(input: AuthStatus): Promise<AuthStatusResponse> {
    const spinner = this.createSpinner("Checking authentication status...");

    try {
      const cliCheck = await this.checkAwsCliStatus();

      if (input.allProfiles) {
        const profiles = await this.profileManager.discoverProfiles();
        const profileInfos: ProfileInfo[] = [];

        for (const profile of profiles) {
          const profileInfo = await this.getProfileStatus(profile.name);
          profileInfos.push(profileInfo);
        }

        const activeProfile = this.credentialService.getActiveProfile();
        const authenticated = profileInfos.some((p) => p.active && p.credentialsValid);

        spinner.succeed("Status check complete");

        return {
          activeProfile,
          profiles: profileInfos,
          authenticated,
          awsCliInstalled: cliCheck.installed,
          awsCliVersion: cliCheck.version,
        };
      } else {
        const profileName = input.profile ?? this.credentialService.getActiveProfile();
        const profileInfo = await this.getProfileStatus(profileName);

        spinner.succeed("Status check complete");

        return {
          activeProfile: profileName,
          profiles: [profileInfo],
          authenticated: profileInfo.credentialsValid,
          awsCliInstalled: cliCheck.installed,
          awsCliVersion: cliCheck.version,
        };
      }
    } catch (error) {
      spinner.fail("Status check failed");
      throw error;
    }
  }

  /**
   * Perform authentication logout
   *
   * @param input - Logout command input
   * @returns Promise resolving when logout is complete
   */
  async logout(input: AuthLogout): Promise<void> {
    const spinner = this.createSpinner("Logging out...");

    try {
      await (input.allProfiles
        ? this.logoutAllProfiles(spinner)
        : this.logoutSingleProfile(input, spinner));
    } catch (error) {
      spinner.fail("Logout failed");
      throw error;
    }
  }

  /**
   * Logout from all SSO profiles
   *
   * @param spinner - Progress spinner
   * @returns Promise resolving when all logouts complete
   * @internal
   */
  private async logoutAllProfiles(spinner: SpinnerInterface): Promise<void> {
    const ssoProfiles = await this.profileManager.getSsoProfiles();

    for (const profileName of ssoProfiles) {
      spinner.text = `Logging out from profile '${profileName}'...`;
      await this.attemptProfileLogout(profileName);
    }

    this.credentialService.clearAllCredentialCaches();
    spinner.succeed(`Logged out from ${ssoProfiles.length} SSO profiles`);
  }

  /**
   * Logout from a single profile
   *
   * @param input - Logout command input
   * @param spinner - Progress spinner
   * @returns Promise resolving when logout completes
   * @internal
   */
  private async logoutSingleProfile(input: AuthLogout, spinner: SpinnerInterface): Promise<void> {
    const profileName = input.profile ?? this.credentialService.getActiveProfile();

    spinner.text = `Logging out from profile '${profileName}'...`;
    await this.cliWrapper.ssoLogout(profileName);

    this.credentialService.clearCredentialCache(profileName);
    spinner.succeed(`Successfully logged out from profile '${profileName}'`);
  }

  /**
   * Attempt to logout from a profile with graceful error handling
   *
   * @param profileName - Name of the profile to logout from
   * @returns Promise resolving when attempt completes
   * @internal
   */
  private async attemptProfileLogout(profileName: string): Promise<void> {
    try {
      await this.cliWrapper.ssoLogout(profileName);
    } catch (error) {
      if (this.options.enableDebugLogging) {
        if (error instanceof Error && error.message.includes("not found")) {
          console.debug(`Profile '${profileName}' logout skipped - ${error.message}`);
        } else {
          console.debug(`Failed to logout from profile '${profileName}':`, error);
        }
      }
    }
  }

  /**
   * List available profiles
   *
   * @param input - Profiles command input
   * @returns Promise resolving to array of profile information
   */
  async listProfiles(input: AuthProfiles): Promise<ProfileInfo[]> {
    const spinner = this.createSpinner("Discovering profiles...");

    try {
      const profiles = await this.profileManager.discoverProfiles();
      const profileInfos: ProfileInfo[] = [];

      for (const profile of profiles) {
        const profileInfo = await this.getProfileStatus(profile.name);

        if (input.activeOnly && !profileInfo.active) {
          continue;
        }

        profileInfos.push(profileInfo);
      }

      spinner.succeed(`Found ${profileInfos.length} profiles`);
      return profileInfos;
    } catch (error) {
      spinner.fail("Profile discovery failed");
      throw error;
    }
  }

  /**
   * Switch to a different profile
   *
   * @param input - Switch command input
   * @returns Promise resolving when switch is complete
   */
  async switchProfile(input: AuthSwitch): Promise<void> {
    const spinner = this.createSpinner(`Switching to profile '${input.profile}'...`);

    try {
      // Check if target profile exists
      const profileExists = await this.profileManager.profileExists(input.profile);
      if (!profileExists) {
        throw new ProfileError(
          `Profile '${input.profile}' not found`,
          input.profile,
          "profile-switch",
        );
      }

      // Switch profile
      await this.profileManager.switchProfile(input.profile);
      this.credentialService.setActiveProfile(input.profile);

      // Validate credentials if requested
      if (input.validate) {
        spinner.text = "Validating credentials...";
        try {
          await this.credentialService.validateCredentials(input.profile);
        } catch (error) {
          const guidance = getAuthErrorGuidance(error);
          spinner.warn(`Switched to profile '${input.profile}' but credentials are invalid`);
          throw new AuthenticationError(
            `Profile switched but credentials are invalid: ${guidance}`,
            "credential-validation",
            input.profile,
            error,
          );
        }
      }

      spinner.succeed(`Successfully switched to profile '${input.profile}'`);
    } catch (error) {
      spinner.fail("Profile switch failed");
      throw error;
    }
  }

  /**
   * Get detailed status for a specific profile
   *
   * @param profileName - Name of the profile to check
   * @returns Promise resolving to profile information
   * @internal
   */
  private async getProfileStatus(profileName: string): Promise<ProfileInfo> {
    try {
      const profileInfo = await this.profileManager.getProfileInfo(profileName);

      // Check credential validity
      let credentialsValid = false;
      let tokenExpiry: Date | undefined;

      try {
        await this.credentialService.validateCredentials(profileName);
        credentialsValid = true;
      } catch {
        credentialsValid = false;
      }

      // Check token status for SSO profiles
      if (profileInfo.type === "sso" && profileInfo.ssoStartUrl) {
        const tokenStatus = await this.tokenManager.getTokenStatus(
          profileName,
          profileInfo.ssoStartUrl,
        );
        if (tokenStatus.expiresAt) {
          tokenExpiry = tokenStatus.expiresAt;
        }
      }

      return {
        ...profileInfo,
        credentialsValid,
        tokenExpiry,
      };
    } catch {
      // Return minimal profile info if detailed check fails
      return {
        name: profileName,
        type: "credentials",
        active: profileName === this.credentialService.getActiveProfile(),
        credentialsValid: false,
      };
    }
  }

  /**
   * Check AWS CLI installation status
   *
   * @returns Promise resolving to CLI status information
   * @internal
   */
  private async checkAwsCliStatus(): Promise<{ installed: boolean; version?: string }> {
    try {
      const installation = await this.cliWrapper.checkInstallation();
      return {
        installed: installation.installed,
        version: installation.version,
      };
    } catch {
      return { installed: false };
    }
  }

  /**
   * Create a progress spinner if enabled
   *
   * @param text - Initial spinner text
   * @returns Spinner instance or mock object
   * @internal
   */
  private createSpinner(text: string): SpinnerInterface {
    return (this.options.enableProgressIndicators ?? true)
      ? ora(text).start()
      : {
          text,
          succeed: (message?: string) => console.log(`✓ ${message ?? text}`),
          fail: (message?: string) => console.error(`✗ ${message ?? text}`),
          warn: (message?: string) => console.warn(`⚠ ${message ?? text}`),
        };
  }
}
