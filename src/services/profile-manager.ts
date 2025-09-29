/**
 * AWS profile manager for multi-profile management
 *
 * Provides comprehensive AWS profile discovery, validation, and management
 * capabilities. Reads from standard AWS configuration files and manages
 * profile switching with credential validation.
 *
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProfileError } from "../lib/auth-errors.js";
import type { ProfileInfo } from "../lib/auth-schemas.js";

/**
 * Configuration options for profile manager
 *
 * @public
 */
export interface ProfileManagerOptions {
  /**
   * Path to AWS config file
   */
  configFilePath?: string;

  /**
   * Path to AWS credentials file
   */
  credentialsFilePath?: string;

  /**
   * Enable debug logging for profile operations
   */
  enableDebugLogging?: boolean;

  /**
   * Cache profile information for improved performance
   */
  enableProfileCache?: boolean;

  /**
   * Profile cache TTL in milliseconds
   */
  profileCacheTtl?: number;
}

/**
 * SSO session configuration from config files
 *
 * @public
 */
export interface SsoSessionConfig {
  /**
   * SSO session name
   */
  name: string;

  /**
   * SSO start URL for the session
   */
  ssoStartUrl: string;

  /**
   * SSO region for the session
   */
  ssoRegion: string;

  /**
   * SSO registration scopes for OAuth 2.0
   */
  ssoRegistrationScopes?: string;
}

/**
 * AWS profile configuration from config files
 *
 * @public
 */
export interface AwsProfileConfig {
  /**
   * Profile name
   */
  name: string;

  /**
   * AWS region for the profile
   */
  region?: string;

  /**
   * Output format for the profile
   */
  output?: string;

  /**
   * SSO session name reference for modern SSO configuration
   */
  ssoSession?: string;

  /**
   * SSO start URL for SSO profiles (legacy configuration)
   */
  ssoStartUrl?: string;

  /**
   * SSO region for SSO profiles (legacy configuration)
   */
  ssoRegion?: string;

  /**
   * SSO account ID for SSO profiles
   */
  ssoAccountId?: string;

  /**
   * SSO role name for SSO profiles
   */
  ssoRoleName?: string;

  /**
   * IAM role ARN for role-based profiles
   */
  roleArn?: string;

  /**
   * Source profile for role-based profiles
   */
  sourceProfile?: string;

  /**
   * MFA serial for role-based profiles
   */
  mfaSerial?: string;

  /**
   * AWS access key ID for credentials-based profiles
   */
  awsAccessKeyId?: string;

  /**
   * Whether AWS secret access key is present
   */
  hasSecretAccessKey?: boolean;
}

/**
 * Cached profile information
 *
 * @internal
 */
interface CachedProfile {
  profile: AwsProfileConfig;
  timestamp: number;
}

/**
 * AWS profile manager for multi-profile management
 *
 * Handles AWS profile discovery from configuration files, profile validation,
 * and profile switching operations with comprehensive error handling.
 *
 * @public
 */
export class ProfileManager {
  private readonly options: Required<ProfileManagerOptions>;
  private readonly profileCache = new Map<string, CachedProfile>();
  private readonly ssoSessionCache = new Map<string, SsoSessionConfig>();

  /**
   * Create a new profile manager instance
   *
   * @param options - Configuration options for the manager
   */
  constructor(options: ProfileManagerOptions = {}) {
    const homeDirectory = os.homedir();
    this.options = {
      configFilePath: options.configFilePath ?? path.join(homeDirectory, ".aws", "config"),
      credentialsFilePath:
        options.credentialsFilePath ?? path.join(homeDirectory, ".aws", "credentials"),
      enableDebugLogging: options.enableDebugLogging ?? false,
      enableProfileCache: options.enableProfileCache ?? true,
      profileCacheTtl: options.profileCacheTtl ?? 300_000, // 5 minutes
    };
  }

  /**
   * Discover all available AWS profiles
   *
   * @returns Promise resolving to array of discovered profiles
   * @throws When profile discovery fails
   */
  async discoverProfiles(): Promise<AwsProfileConfig[]> {
    try {
      const [configProfiles, credentialProfiles] = await Promise.all([
        this.parseConfigFile(),
        this.parseCredentialsFile(),
      ]);

      const profileMap = new Map<string, AwsProfileConfig>();

      for (const profile of credentialProfiles) {
        profileMap.set(profile.name, profile);
      }

      for (const profile of configProfiles) {
        const existing = profileMap.get(profile.name);
        if (existing) {
          profileMap.set(profile.name, { ...existing, ...profile });
        } else {
          profileMap.set(profile.name, profile);
        }
      }

      const profiles = [...profileMap.values()];

      if (this.options.enableDebugLogging) {
        console.debug(`Discovered ${profiles.length} AWS profiles`);
      }

      return profiles;
    } catch (error) {
      throw new ProfileError(
        "Failed to discover AWS profiles",
        undefined,
        "profile-discovery",
        undefined,
        { error },
      );
    }
  }

  /**
   * Get detailed information about a specific profile
   *
   * @param profileName - Name of the profile to get information for
   * @returns Promise resolving to profile information
   * @throws When profile is not found or invalid
   */
  async getProfileInfo(profileName: string): Promise<ProfileInfo> {
    try {
      const profiles = await this.discoverProfiles();
      const profile = profiles.find((p) => p.name === profileName);

      if (!profile) {
        throw new ProfileError(`Profile '${profileName}' not found`, profileName, "profile-lookup");
      }

      const resolvedProperties = this.resolveSsoSessionProperties(profile);
      const profileType = this.determineProfileType(profile, resolvedProperties.ssoStartUrl);
      const isActive = this.isActiveProfile(profileName);

      const profileInfo: ProfileInfo = {
        name: profileName,
        type: profileType,
        active: isActive,
        credentialsValid: false, // Will be validated separately
        region: resolvedProperties.region,
        output: profile.output,
        ssoStartUrl: resolvedProperties.ssoStartUrl,
        ssoRegion: resolvedProperties.ssoRegion,
        ssoAccountId: profile.ssoAccountId,
        ssoRoleName: profile.ssoRoleName,
        ssoSession: profile.ssoSession,
        roleArn: profile.roleArn,
        sourceProfile: profile.sourceProfile,
      };

      if (this.options.enableDebugLogging) {
        console.debug(`Retrieved profile info for: ${profileName}`, { type: profileType });
      }

      return profileInfo;
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }

      throw new ProfileError(
        `Failed to get profile information for '${profileName}'`,
        profileName,
        "profile-info",
        undefined,
        { error },
      );
    }
  }

  /**
   * Resolve SSO session properties for a profile
   *
   * @param profile - Profile to resolve properties for
   * @returns Resolved SSO start URL and region
   * @internal
   */
  private resolveSsoSessionProperties(profile: AwsProfileConfig): {
    ssoStartUrl?: string;
    region?: string;
    ssoRegion?: string;
  } {
    let resolvedSsoStartUrl = profile.ssoStartUrl;
    let resolvedRegion = profile.region;
    let resolvedSsoRegion = profile.ssoRegion;

    if (profile.ssoSession) {
      const ssoSession = this.ssoSessionCache.get(profile.ssoSession);
      if (ssoSession) {
        if (!resolvedSsoStartUrl) {
          resolvedSsoStartUrl = ssoSession.ssoStartUrl;
        }
        if (!resolvedSsoRegion) {
          resolvedSsoRegion = ssoSession.ssoRegion;
        }
        if (!resolvedRegion) {
          resolvedRegion = ssoSession.ssoRegion;
        }
      }
    }

    const result: { ssoStartUrl?: string; region?: string; ssoRegion?: string } = {};
    if (resolvedSsoStartUrl) {
      result.ssoStartUrl = resolvedSsoStartUrl;
    }
    if (resolvedRegion) {
      result.region = resolvedRegion;
    }
    if (resolvedSsoRegion) {
      result.ssoRegion = resolvedSsoRegion;
    }
    return result;
  }

  /**
   * Determine the profile type based on configuration
   *
   * @param profile - Profile configuration
   * @param resolvedSsoStartUrl - Resolved SSO start URL
   * @returns Profile type
   * @internal
   */
  private determineProfileType(
    profile: AwsProfileConfig,
    resolvedSsoStartUrl?: string,
  ): "sso" | "iam" | "credentials" {
    if (resolvedSsoStartUrl || profile.ssoSession) {
      return "sso";
    }
    if (profile.roleArn) {
      return "iam";
    }
    return "credentials";
  }

  /**
   * Check if a profile is the currently active profile
   *
   * @param profileName - Name of the profile to check
   * @returns True if the profile is active
   * @internal
   */
  private isActiveProfile(profileName: string): boolean {
    const activeProfile = process.env.AWS_PROFILE ?? "default";
    return profileName === activeProfile;
  }

  /**
   * Check if a profile exists
   *
   * @param profileName - Name of the profile to check
   * @returns Promise resolving to true if profile exists
   */
  async profileExists(profileName: string): Promise<boolean> {
    try {
      await this.getProfileInfo(profileName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current active profile name
   *
   * @returns The currently active AWS profile name
   */
  getActiveProfileName(): string {
    return process.env.AWS_PROFILE ?? "default";
  }

  /**
   * Switch to a different AWS profile
   *
   * @param profileName - Name of the profile to switch to
   * @returns Promise resolving when profile switch is complete
   * @throws When profile switch fails
   */
  async switchProfile(profileName: string): Promise<void> {
    try {
      const profileExists = await this.profileExists(profileName);
      if (!profileExists) {
        throw new ProfileError(
          `Cannot switch to profile '${profileName}': profile not found`,
          profileName,
          "profile-switch",
        );
      }

      process.env.AWS_PROFILE = profileName;

      if (this.options.enableDebugLogging) {
        console.debug(`Switched to profile: ${profileName}`);
      }
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }

      throw new ProfileError(
        `Failed to switch to profile '${profileName}'`,
        profileName,
        "profile-switch",
        undefined,
        { error },
      );
    }
  }

  /**
   * Get SSO profiles that may need token refresh
   *
   * @returns Promise resolving to array of SSO profile names
   */
  async getSsoProfiles(): Promise<string[]> {
    try {
      const profiles = await this.discoverProfiles();
      return profiles
        .filter((profile) => profile.ssoStartUrl || profile.ssoSession)
        .map((profile) => profile.name);
    } catch (error) {
      throw new ProfileError(
        "Failed to get SSO profiles",
        undefined,
        "sso-profile-discovery",
        undefined,
        { error },
      );
    }
  }

  /**
   * Clear profile cache
   */
  clearCache(): void {
    this.profileCache.clear();
    this.ssoSessionCache.clear();

    if (this.options.enableDebugLogging) {
      console.debug("Cleared profile cache");
    }
  }

  /**
   * Parse AWS config file
   *
   * @returns Promise resolving to array of profiles from config file
   * @throws When config file parsing fails
   * @internal
   */
  private async parseConfigFile(): Promise<AwsProfileConfig[]> {
    try {
      await fs.access(this.options.configFilePath);
    } catch (error) {
      if (this.options.enableDebugLogging) {
        if (error instanceof Error && error.message.includes("ENOENT")) {
          console.debug(`AWS config file not found: ${this.options.configFilePath}`);
        } else {
          console.debug(`AWS config file access failed: ${this.options.configFilePath}`, error);
        }
      }

      if (error instanceof Error) {
        if (error.message.includes("ENOENT") || error.message.includes("no such file")) {
          return [];
        }
        throw error;
      }

      return [];
    }

    try {
      const content = await fs.readFile(this.options.configFilePath, "utf8");
      this.parseSsoSessions(content);
      return this.parseIniFile(content, "config");
    } catch (error) {
      throw new ProfileError(
        "Failed to parse AWS config file",
        undefined,
        "config-parsing",
        this.options.configFilePath,
        { error },
      );
    }
  }

  /**
   * Parse AWS credentials file
   *
   * @returns Promise resolving to array of profiles from credentials file
   * @throws When credentials file parsing fails
   * @internal
   */
  private async parseCredentialsFile(): Promise<AwsProfileConfig[]> {
    try {
      await fs.access(this.options.credentialsFilePath);
    } catch (error) {
      if (this.options.enableDebugLogging) {
        if (error instanceof Error && error.message.includes("ENOENT")) {
          console.debug(`AWS credentials file not found: ${this.options.credentialsFilePath}`);
        } else {
          console.debug(
            `AWS credentials file access failed: ${this.options.credentialsFilePath}`,
            error,
          );
        }
      }

      if (error instanceof Error) {
        if (error.message.includes("ENOENT") || error.message.includes("no such file")) {
          return [];
        }
        throw error;
      }

      return [];
    }

    try {
      const content = await fs.readFile(this.options.credentialsFilePath, "utf8");
      return this.parseIniFile(content, "credentials");
    } catch (error) {
      throw new ProfileError(
        "Failed to parse AWS credentials file",
        undefined,
        "credentials-parsing",
        this.options.credentialsFilePath,
        { error },
      );
    }
  }

  /**
   * Check if a line contains meaningful content
   *
   * @param line - Line to check
   * @returns True if line is meaningful, false if empty or comment
   * @internal
   */
  private isMeaningfulLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed !== "" && !trimmed.startsWith("#") && !trimmed.startsWith(";");
  }

  /**
   * Parse a key-value pair from an INI line
   *
   * @param line - Line to parse
   * @returns Tuple of [key, value] or undefined if invalid
   * @internal
   */
  private parseKeyValuePair(line: string): [string, string] | undefined {
    const keyValueRegex = /^([^=]+)=(.*)$/;
    const match = keyValueRegex.exec(line);

    if (!match) {
      return undefined;
    }

    const key = match[1]?.trim();
    const value = match[2]?.trim();

    return key && value ? [key, value] : undefined;
  }

  /**
   * Save current profile to profiles array if valid
   *
   * @param profiles - Array to save profile to
   * @param currentProfile - Profile to save
   * @internal
   */
  private saveCurrentProfile(
    profiles: AwsProfileConfig[],
    currentProfile: Partial<AwsProfileConfig> | undefined,
  ): void {
    if (currentProfile?.name) {
      profiles.push(currentProfile as AwsProfileConfig);
    }
  }

  /**
   * Parse INI-style AWS configuration file
   *
   * @param content - File content to parse
   * @param fileType - Type of file being parsed
   * @returns Array of parsed profiles
   * @internal
   */
  private parseIniFile(content: string, fileType: "config" | "credentials"): AwsProfileConfig[] {
    const profiles: AwsProfileConfig[] = [];
    const lines = content.split("\n").filter(this.isMeaningfulLine.bind(this));
    let currentProfile: Partial<AwsProfileConfig> | undefined;

    for (const line of lines) {
      const trimmedLine = line.trim();

      try {
        const newProfile = this.parseProfileSection(trimmedLine, fileType);
        if (newProfile) {
          this.saveCurrentProfile(profiles, currentProfile);
          currentProfile = newProfile;
          continue;
        }

        const keyValuePair = this.parseKeyValuePair(trimmedLine);
        if (keyValuePair && currentProfile) {
          const [key, value] = keyValuePair;
          this.setProfileProperty(currentProfile, key, value);
        }
      } catch (error) {
        if (this.options.enableDebugLogging) {
          console.warn(
            `Configuration parsing: Skipping invalid line in ${fileType}`,
            { line: trimmedLine, suggestion: "Check file syntax and formatting" },
            error,
          );
        }
      }
    }

    this.saveCurrentProfile(profiles, currentProfile);
    return profiles;
  }

  /**
   * Parse profile section header from INI line
   *
   * @param line - Line to parse
   * @param fileType - Type of file being parsed
   * @returns Partial profile object or undefined
   * @internal
   */
  private parseProfileSection(
    line: string,
    fileType: "config" | "credentials",
  ): Partial<AwsProfileConfig> | undefined {
    const sectionRegex = /^\[(.+)\]$/;
    const sectionMatch = sectionRegex.exec(line);

    if (!sectionMatch) {
      return undefined;
    }

    let profileName = sectionMatch[1];
    if (!profileName) {
      return undefined;
    }

    if (fileType === "config" && profileName.startsWith("profile ")) {
      profileName = profileName.slice(8);
    }

    return { name: profileName };
  }

  /**
   * Parse SSO sessions from config file content
   *
   * @param content - Config file content
   * @internal
   */
  private parseSsoSessions(content: string): void {
    const lines = content.split("\n").filter(this.isMeaningfulLine.bind(this));
    let currentSession: Partial<SsoSessionConfig> | undefined;

    for (const line of lines) {
      const trimmedLine = line.trim();

      const sessionMatch = this.parseSsoSessionHeader(trimmedLine);
      if (sessionMatch) {
        this.saveCurrentSsoSession(currentSession);
        currentSession = { name: sessionMatch };
        continue;
      }

      this.parseSsoSessionProperty(currentSession, trimmedLine);
    }

    this.saveCurrentSsoSession(currentSession);
  }

  /**
   * Parse SSO session header from line
   *
   * @param line - Line to parse
   * @returns Session name if found, undefined otherwise
   * @internal
   */
  private parseSsoSessionHeader(line: string): string | undefined {
    if (!line.startsWith("[sso-session ") || !line.endsWith("]")) {
      return undefined;
    }

    const sessionName = line.slice(13, -1).trim();
    return sessionName || undefined;
  }

  /**
   * Parse SSO session property from line
   *
   * @param currentSession - Current session being parsed
   * @param line - Line to parse
   * @internal
   */
  private parseSsoSessionProperty(
    currentSession: Partial<SsoSessionConfig> | undefined,
    line: string,
  ): void {
    if (!currentSession) return;

    const keyValuePair = this.parseKeyValuePair(line);
    if (!keyValuePair) return;

    const [key, value] = keyValuePair;
    const normalizedKey = key.toLowerCase().replaceAll("_", "");

    switch (normalizedKey) {
      case "ssostarturl": {
        currentSession.ssoStartUrl = value;
        break;
      }
      case "ssoregion": {
        currentSession.ssoRegion = value;
        break;
      }
      case "ssoregistrationscopes": {
        currentSession.ssoRegistrationScopes = value;
        break;
      }
    }
  }

  /**
   * Save current SSO session if complete
   *
   * @param session - Session to save
   * @internal
   */
  private saveCurrentSsoSession(session: Partial<SsoSessionConfig> | undefined): void {
    if (session?.name && session.ssoStartUrl && session.ssoRegion) {
      this.ssoSessionCache.set(session.name, session as SsoSessionConfig);
    }
  }

  /**
   * Set profile property based on configuration key
   *
   * @param profile - Profile to update
   * @param key - Configuration key
   * @param value - Configuration value
   * @internal
   */
  private setProfileProperty(profile: Partial<AwsProfileConfig>, key: string, value: string): void {
    const normalizedKey = key.toLowerCase().replaceAll("_", "");

    switch (normalizedKey) {
      case "region": {
        profile.region = value;
        break;
      }
      case "output": {
        profile.output = value;
        break;
      }
      case "ssostarturl": {
        profile.ssoStartUrl = value;
        break;
      }
      case "ssoregion": {
        profile.ssoRegion = value;
        break;
      }
      case "ssoaccountid": {
        profile.ssoAccountId = value;
        break;
      }
      case "ssorolename": {
        profile.ssoRoleName = value;
        break;
      }
      case "rolearn": {
        profile.roleArn = value;
        break;
      }
      case "sourceprofile": {
        profile.sourceProfile = value;
        break;
      }
      case "mfaserial": {
        profile.mfaSerial = value;
        break;
      }
      case "awsaccesskeyid": {
        profile.awsAccessKeyId = value;
        break;
      }
      case "awssecretaccesskey": {
        profile.hasSecretAccessKey = Boolean(value);
        break;
      }
      case "ssosession": {
        profile.ssoSession = value;
        break;
      }
    }
  }
}
