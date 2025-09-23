/**
 * Cross-platform authentication utilities
 *
 * Provides platform-specific utilities for authentication operations including
 * path resolution, process detection, and environment variable management
 * across Windows, macOS, and Linux platforms.
 *
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Platform detection utilities
 *
 * @public
 */
export interface PlatformInfo {
  /**
   * Current platform identifier
   */
  platform: "windows" | "macos" | "linux" | "unknown";

  /**
   * Whether the platform is Windows
   */
  isWindows: boolean;

  /**
   * Whether the platform is macOS
   */
  isMacOS: boolean;

  /**
   * Whether the platform is Linux
   */
  isLinux: boolean;

  /**
   * Home directory path for the current user
   */
  homeDirectory: string;

  /**
   * AWS configuration directory path
   */
  awsConfigDirectory: string;
}

/**
 * AWS CLI installation information
 *
 * @public
 */
export interface AwsCliInfo {
  /**
   * Whether AWS CLI is installed and accessible
   */
  installed: boolean;

  /**
   * Path to AWS CLI executable
   */
  path?: string;

  /**
   * AWS CLI version if detected
   */
  version?: string;

  /**
   * Installation method detected
   */
  installMethod?: "system" | "user" | "conda" | "pip" | "unknown";
}

/**
 * Get current platform information
 *
 * @returns Platform information object
 *
 * @public
 */
export function getPlatformInfo(): PlatformInfo {
  const platform = os.platform();
  const homeDirectory = os.homedir();

  let platformType: PlatformInfo["platform"];
  switch (platform) {
    case "win32": {
      platformType = "windows";
      break;
    }
    case "darwin": {
      platformType = "macos";
      break;
    }
    case "linux": {
      platformType = "linux";
      break;
    }
    default: {
      platformType = "unknown";
    }
  }

  return {
    platform: platformType,
    isWindows: platformType === "windows",
    isMacOS: platformType === "macos",
    isLinux: platformType === "linux",
    homeDirectory,
    awsConfigDirectory: path.join(homeDirectory, ".aws"),
  };
}

/**
 * Get AWS CLI executable paths for platform detection
 *
 * @returns Array of possible AWS CLI executable paths
 *
 * @public
 */
export function getAwsCliPaths(): string[] {
  const platformInfo = getPlatformInfo();

  if (platformInfo.isWindows) {
    return [
      "aws.exe",
      "aws",
      path.join(
        process.env.PROGRAMFILES || String.raw`C:\Program Files`,
        "Amazon",
        "AWSCLIV2",
        "aws.exe",
      ),
      path.join(
        process.env["PROGRAMFILES(X86)"] || String.raw`C:\Program Files (x86)`,
        "Amazon",
        "AWSCLIV2",
        "aws.exe",
      ),
      path.join(
        platformInfo.homeDirectory,
        "AppData",
        "Local",
        "Programs",
        "Amazon",
        "AWSCLIV2",
        "aws.exe",
      ),
    ];
  }

  return [
    "aws",
    "/usr/local/bin/aws",
    "/usr/bin/aws",
    "/opt/homebrew/bin/aws",
    path.join(platformInfo.homeDirectory, ".local", "bin", "aws"),
    path.join(platformInfo.homeDirectory, "bin", "aws"),
  ];
}

/**
 * Detect AWS CLI installation
 *
 * @returns Promise resolving to AWS CLI installation information
 *
 * @public
 */
export async function detectAwsCli(): Promise<AwsCliInfo> {
  const paths = getAwsCliPaths();

  for (const awsPath of paths) {
    try {
      const stats = await fs.stat(awsPath);
      if (stats.isFile()) {
        return {
          installed: true,
          path: awsPath,
          installMethod: determineInstallMethod(awsPath),
        };
      }
    } catch {
      // Path doesn't exist, continue to next path
    }
  }

  return {
    installed: false,
  };
}

/**
 * Determine AWS CLI installation method based on path
 *
 * @param awsPath - Path to AWS CLI executable
 * @returns Installation method identifier
 *
 * @internal
 */
function determineInstallMethod(awsPath: string): NonNullable<AwsCliInfo["installMethod"]> {
  const lowerPath = awsPath.toLowerCase();

  if (lowerPath.includes("program files") || lowerPath.includes("programfiles")) {
    return "system";
  }

  if (lowerPath.includes("homebrew") || lowerPath.includes("/opt/homebrew")) {
    return "system";
  }

  if (
    lowerPath.includes("conda") ||
    lowerPath.includes("miniconda") ||
    lowerPath.includes("anaconda")
  ) {
    return "conda";
  }

  if (lowerPath.includes("pip") || lowerPath.includes("python")) {
    return "pip";
  }

  if (lowerPath.includes(os.homedir())) {
    return "user";
  }

  if (lowerPath.startsWith("/usr/") || lowerPath.startsWith("/opt/")) {
    return "system";
  }

  return "unknown";
}

/**
 * Get standard AWS configuration file paths
 *
 * @returns Object containing standard AWS configuration file paths
 *
 * @public
 */
export function getAwsConfigPaths(): {
  configFile: string;
  credentialsFile: string;
  ssoCache: string;
} {
  const platformInfo = getPlatformInfo();

  return {
    configFile: path.join(platformInfo.awsConfigDirectory, "config"),
    credentialsFile: path.join(platformInfo.awsConfigDirectory, "credentials"),
    ssoCache: path.join(platformInfo.awsConfigDirectory, "sso", "cache"),
  };
}

/**
 * Check if AWS configuration directory exists
 *
 * @returns Promise resolving to true if AWS config directory exists
 *
 * @public
 */
export async function hasAwsConfig(): Promise<boolean> {
  const platformInfo = getPlatformInfo();

  try {
    const stats = await fs.stat(platformInfo.awsConfigDirectory);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Ensure AWS configuration directory exists
 *
 * @returns Promise resolving when directory creation is complete
 *
 * @public
 */
export async function ensureAwsConfigDirectory(): Promise<void> {
  const platformInfo = getPlatformInfo();

  try {
    await fs.mkdir(platformInfo.awsConfigDirectory, { recursive: true });
  } catch (error) {
    throw new Error(
      `Failed to create AWS config directory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get environment variables for subprocess execution
 *
 * @param additionalVariables - Additional environment variables to include
 * @returns Environment variables object for subprocess
 *
 * @public
 */
export function getSubprocessEnvironment(
  additionalVariables: Record<string, string> = {},
): Record<string, string> {
  const platformInfo = getPlatformInfo();

  const environment = { ...process.env };

  if (!environment.AWS_CONFIG_FILE) {
    environment.AWS_CONFIG_FILE = path.join(platformInfo.awsConfigDirectory, "config");
  }

  if (!environment.AWS_SHARED_CREDENTIALS_FILE) {
    environment.AWS_SHARED_CREDENTIALS_FILE = path.join(
      platformInfo.awsConfigDirectory,
      "credentials",
    );
  }

  if (platformInfo.isWindows) {
    const commonPaths = [
      path.join(process.env.PROGRAMFILES || String.raw`C:\Program Files`, "Amazon", "AWSCLIV2"),
      path.join(
        process.env["PROGRAMFILES(X86)"] || String.raw`C:\Program Files (x86)`,
        "Amazon",
        "AWSCLIV2",
      ),
    ];

    const currentPath = environment.PATH || environment.Path || "";
    const additionalPaths = commonPaths.filter((p) => !currentPath.includes(p));

    if (additionalPaths.length > 0) {
      environment.PATH = [currentPath, ...additionalPaths].join(";");
    }
  }

  Object.assign(environment, additionalVariables);

  return environment as Record<string, string>;
}

/**
 * Sanitize subprocess arguments for security
 *
 * @param arguments_ - Command arguments to sanitize
 * @returns Sanitized arguments array
 *
 * @public
 */
export function sanitizeSubprocessArguments(arguments_: string[]): string[] {
  return arguments_.map((argument) => {
    const sanitized = argument.replaceAll(/[;&|`$(){}[\]]/g, "");

    return sanitized.trim() || '""';
  });
}

/**
 * Format subprocess command for logging
 *
 * @param command - Command to format
 * @param arguments_ - Command arguments
 * @returns Formatted command string for logging
 *
 * @public
 */
export function formatSubprocessCommand(command: string, arguments_: string[]): string {
  const sanitizedArguments = arguments_.map((argument) => {
    if (argument.includes(" ") || argument.includes("\t") || argument.includes("\n")) {
      // String escaping requires nested template literals for proper quote handling in shell commands.
      // SonarJS flags this pattern but it's necessary for secure subprocess argument sanitization.
      // eslint-disable-next-line sonarjs/no-nested-template-literals
      return `"${argument.replaceAll('"', String.raw`\"`)}"`;
    }
    return argument;
  });

  return [command, ...sanitizedArguments].join(" ");
}

/**
 * Get timeout value for subprocess operations
 *
 * @param operation - Type of operation for timeout selection
 * @returns Timeout in milliseconds
 *
 * @public
 */
export function getSubprocessTimeout(operation: "quick" | "interactive" | "long"): number {
  switch (operation) {
    case "quick": {
      return 30_000; // 30 seconds for version checks, status commands
    }
    case "interactive": {
      return 300_000; // 5 minutes for SSO login flows
    }
    case "long": {
      return 600_000; // 10 minutes for complex operations
    }
    default: {
      return 30_000;
    }
  }
}
