/**
 * @module ssm/ssh-config-manager
 * SSH configuration management for Session Manager integration
 *
 * Provides utilities for generating and managing SSH configuration
 * to enable seamless SSH connections through Session Manager.
 */

import { constants } from "node:fs";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * SSH configuration entry for Session Manager
 *
 * @public
 */
export interface SshConfigEntry {
  /**
   * Host pattern to match (e.g., "i-* mi-*")
   */
  hostPattern: string;

  /**
   * ProxyCommand to use for Session Manager
   */
  proxyCommand: string;

  /**
   * AWS profile to use (optional)
   */
  profile?: string;

  /**
   * AWS region to use (optional)
   */
  region?: string;

  /**
   * User to connect as (optional)
   */
  user?: string;

  /**
   * Path to SSH private key (optional)
   */
  identityFile?: string;
}

/**
 * Default SSH config path
 */
const DEFAULT_SSH_CONFIG_PATH = path.join(homedir(), ".ssh", "config");

/**
 * Generate ProxyCommand for Session Manager
 *
 * @param profile - AWS profile to use
 * @param region - AWS region to use
 * @returns ProxyCommand string
 *
 * @public
 */
export function generateProxyCommand(profile?: string, region?: string): string {
  const parts = ["sh", "-c", '"aws', "ssm", "start-session"];
  parts.push("--target", "%h", "--document-name", "AWS-StartSSHSession");

  if (region) {
    parts.push("--region", region);
  }

  if (profile) {
    parts.push("--profile", profile);
  }

  parts.push('"');

  return parts.join(" ");
}

/**
 * Generate SSH config block for Session Manager
 *
 * @param entry - SSH configuration entry
 * @returns SSH config block as string
 *
 * @public
 */
export function generateSshConfigBlock(entry: SshConfigEntry): string {
  const lines: string[] = [];

  lines.push(
    `# AWS SSM Session Manager configuration`,
    `Host ${entry.hostPattern}`,
    `  ProxyCommand ${entry.proxyCommand}`,
  );

  if (entry.user) {
    lines.push(`  User ${entry.user}`);
  }

  if (entry.identityFile) {
    lines.push(`  IdentityFile ${entry.identityFile}`);
  }

  lines.push(`  StrictHostKeyChecking no`, `  UserKnownHostsFile /dev/null`, "");

  return lines.join("\n");
}

/**
 * Check if SSH config file exists
 *
 * @param configPath - Path to SSH config file
 * @returns Promise resolving to true if file exists
 *
 * @public
 */
export async function sshConfigExists(
  configPath: string = DEFAULT_SSH_CONFIG_PATH,
): Promise<boolean> {
  try {
    await access(configPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read SSH config file
 *
 * @param configPath - Path to SSH config file
 * @returns Promise resolving to config file content
 *
 * @public
 */
export async function readSshConfig(configPath: string = DEFAULT_SSH_CONFIG_PATH): Promise<string> {
  try {
    return await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

/**
 * Check if SSH config already contains Session Manager configuration
 *
 * @param config - SSH config content
 * @param hostPattern - Host pattern to check
 * @returns True if configuration exists
 *
 * @public
 */
export function hasSessionManagerConfig(config: string, hostPattern: string): boolean {
  const escapedPattern = hostPattern.replaceAll("*", String.raw`\*`);
  const pattern = new RegExp(`Host\\s+${escapedPattern}`, "i");
  return pattern.test(config);
}

/**
 * Backup SSH config file
 *
 * @param configPath - Path to SSH config file
 * @returns Promise resolving to backup file path
 *
 * @public
 */
export async function backupSshConfig(
  configPath: string = DEFAULT_SSH_CONFIG_PATH,
): Promise<string> {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const backupPath = `${configPath}.backup.${timestamp}`;

  const exists = await sshConfigExists(configPath);
  if (exists) {
    await copyFile(configPath, backupPath);
  }

  return backupPath;
}

/**
 * Update SSH config with Session Manager configuration
 *
 * @param entry - SSH configuration entry to add
 * @param configPath - Path to SSH config file
 * @returns Promise resolving when config is updated
 *
 * @public
 */
export async function updateSshConfig(
  entry: SshConfigEntry,
  configPath: string = DEFAULT_SSH_CONFIG_PATH,
): Promise<void> {
  // Read existing config
  const existingConfig = await readSshConfig(configPath);

  // Check if already configured
  if (hasSessionManagerConfig(existingConfig, entry.hostPattern)) {
    throw new Error(
      `SSH config already contains configuration for host pattern "${entry.hostPattern}"`,
    );
  }

  // Generate new config block
  const newBlock = generateSshConfigBlock(entry);

  // Combine configs
  const updatedConfig = existingConfig ? `${existingConfig}\n${newBlock}` : newBlock;

  // Write updated config
  await writeFile(configPath, updatedConfig, { mode: 0o600 });
}

/**
 * Validate SSH private key file
 *
 * @param keyPath - Path to SSH private key
 * @returns Promise resolving when validation is complete
 * @throws Error if key file is invalid or has incorrect permissions
 *
 * @public
 */
export async function validateSshKey(keyPath: string): Promise<void> {
  try {
    await access(keyPath, constants.R_OK);
  } catch {
    throw new Error(`SSH key file not found or not readable: ${keyPath}`);
  }

  // Read file content to validate it's a private key
  const content = await readFile(keyPath, "utf8");

  if (!content.includes("BEGIN") || !content.includes("PRIVATE KEY")) {
    throw new Error(`File does not appear to be a valid SSH private key: ${keyPath}`);
  }
}

/**
 * Get default SSH key path
 *
 * @returns Default SSH key path (~/.ssh/id_rsa)
 *
 * @public
 */
export function getDefaultSshKeyPath(): string {
  return path.join(homedir(), ".ssh", "id_rsa");
}
