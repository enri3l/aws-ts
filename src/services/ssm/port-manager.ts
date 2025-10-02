/**
 * @module ssm/port-manager
 * Port availability and management utilities for SSM port forwarding
 *
 * Provides utilities for checking port availability and finding free ports
 * for Session Manager port forwarding operations.
 */

import { createServer } from "node:net";

/**
 * Port range configuration for finding available ports
 *
 * @public
 */
export interface PortRange {
  /**
   * Minimum port number (inclusive)
   */
  min: number;

  /**
   * Maximum port number (inclusive)
   */
  max: number;
}

/**
 * Default port range for dynamic port allocation
 * Uses ephemeral port range to avoid conflicts with well-known services
 */
const DEFAULT_PORT_RANGE: PortRange = {
  min: 49_152,
  max: 65_535,
};

/**
 * Check if a specific port is available on localhost
 *
 * @param port - Port number to check
 * @returns Promise resolving to true if port is available, false otherwise
 *
 * @public
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      // For any error (including EADDRINUSE), consider port unavailable
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, "127.0.0.1");
  });
}

/**
 * Find an available port within the specified range
 *
 * @param preferredPort - Preferred port to try first (optional)
 * @param range - Port range to search (defaults to ephemeral range 49152-65535)
 * @returns Promise resolving to an available port number
 * @throws Error if no available port found in range
 *
 * @public
 */
export async function findAvailablePort(
  preferredPort?: number,
  range: PortRange = DEFAULT_PORT_RANGE,
): Promise<number> {
  // Try preferred port first if specified
  if (preferredPort !== undefined && preferredPort >= range.min && preferredPort <= range.max) {
    const isAvailable = await isPortAvailable(preferredPort);
    if (isAvailable) {
      return preferredPort;
    }
  }

  // Try random ports in the range
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Using Math.random() for port selection is acceptable for this use case
    // eslint-disable-next-line sonarjs/pseudo-random
    const port = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
    const isAvailable = await isPortAvailable(port);
    if (isAvailable) {
      return port;
    }
  }

  throw new Error(
    `Failed to find available port in range ${range.min}-${range.max} after ${maxAttempts} attempts`,
  );
}

/**
 * Validate port number
 *
 * @param port - Port number to validate
 * @throws Error if port is invalid
 *
 * @public
 */
export function validatePort(port: number): void {
  if (!Number.isInteger(port)) {
    throw new TypeError(`Port must be an integer, got ${port}`);
  }

  if (port < 1 || port > 65_535) {
    throw new Error(`Port must be between 1 and 65535, got ${port}`);
  }
}

/**
 * Common service ports for reference
 *
 * @public
 */
export const COMMON_PORTS = {
  HTTP: 80,
  HTTPS: 443,
  SSH: 22,
  RDP: 3389,
  MYSQL: 3306,
  POSTGRESQL: 5432,
  MONGODB: 27_017,
  REDIS: 6379,
  ELASTICSEARCH: 9200,
} as const;
