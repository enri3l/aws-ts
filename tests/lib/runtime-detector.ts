/**
 * Container runtime detection utility for TestContainers
 *
 * Automatically detects and configures the appropriate container runtime
 * (Docker vs Podman) across different platforms and environments.
 */

import fs from "node:fs";
import os from "node:os";

export interface RuntimeConfig {
  CONTAINER_RUNTIME: "docker" | "podman";
  DOCKER_HOST?: string;
  TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE?: string;
}

/**
 * Detects the available container runtime and returns appropriate configuration
 *
 * @returns Runtime configuration for TestContainers
 */
export function detectContainerRuntime(): RuntimeConfig {
  const platform = os.platform();

  // CI Environment Detection - most CI systems use Docker
  if (process.env.CI) {
    return {
      CONTAINER_RUNTIME: "docker",
      DOCKER_HOST: "unix:///var/run/docker.sock",
    };
  }

  // Platform-specific detection
  switch (platform) {
    case "linux": {
      return detectLinuxRuntime();
    }
    case "darwin": {
      return detectMacRuntime();
    }
    case "win32": {
      return detectWindowsRuntime();
    }
    default: {
      return { CONTAINER_RUNTIME: "docker" };
    }
  }
}

/**
 * Detects container runtime on Linux systems
 *
 * @returns Runtime configuration for Linux systems
 */
function detectLinuxRuntime(): RuntimeConfig {
  try {
    // Dynamic UID detection for rootless Podman
    const uid = process.getuid?.() || 1000;

    // Check rootless Podman socket
    const rootlessPodman = `/run/user/${uid}/podman/podman.sock`;
    if (fs.existsSync(rootlessPodman)) {
      return {
        DOCKER_HOST: `unix://${rootlessPodman}`,
        TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: rootlessPodman,
        CONTAINER_RUNTIME: "podman",
      };
    }

    // Check rootful Podman socket
    const rootfulPodman = "/run/podman/podman.sock";
    if (fs.existsSync(rootfulPodman)) {
      return {
        DOCKER_HOST: `unix://${rootfulPodman}`,
        TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: rootfulPodman,
        CONTAINER_RUNTIME: "podman",
      };
    }

    // Fallback to Docker socket
    return {
      DOCKER_HOST: "unix:///var/run/docker.sock",
      CONTAINER_RUNTIME: "docker",
    };
  } catch {
    // If detection fails, default to Docker
    return { CONTAINER_RUNTIME: "docker" };
  }
}

/**
 * Detects container runtime on macOS systems
 *
 * @returns Runtime configuration for macOS systems
 */
function detectMacRuntime(): RuntimeConfig {
  try {
    // macOS Podman machine socket
    const podmanMachine = `${os.homedir()}/.local/share/containers/podman/machine/qemu/podman.sock`;
    if (fs.existsSync(podmanMachine)) {
      return {
        DOCKER_HOST: `unix://${podmanMachine}`,
        TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: podmanMachine,
        CONTAINER_RUNTIME: "podman",
      };
    }

    // Docker Desktop or Colima
    return { CONTAINER_RUNTIME: "docker" };
  } catch {
    return { CONTAINER_RUNTIME: "docker" };
  }
}

/**
 * Detects container runtime on Windows systems
 *
 * @returns Runtime configuration for Windows systems
 */
function detectWindowsRuntime(): RuntimeConfig {
  // Windows typically uses Docker Desktop
  return { CONTAINER_RUNTIME: "docker" };
}

/**
 * Gets the appropriate image name based on container runtime
 *
 * @param shortName - Short image name (e.g., "amazon/dynamodb-local:latest")
 * @returns Fully qualified image name for the detected runtime
 */
export function getQualifiedImageName(shortName: string): string {
  const runtime = process.env.CONTAINER_RUNTIME;

  // Podman typically needs fully qualified names from docker.io
  if (runtime === "podman" && !shortName.includes("docker.io/")) {
    return `docker.io/${shortName}`;
  }

  return shortName;
}
