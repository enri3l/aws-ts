/**
 * @module cloudwatch-logs-favorites-service
 * CloudWatch Logs Favorites service for managing favorites and saved queries
 *
 * Provides high-level operations for managing CloudWatch Logs favorites
 * and saved queries with validation, storage, and query execution capabilities.
 *
 */

import type { Favorite, SavedQuery } from "../lib/cloudwatch-logs-schemas.js";
import {
  CloudWatchLogsFavoritesStorage,
  type StorageOptions,
} from "./cloudwatch-logs-favorites-storage.js";
import type { CloudWatchLogsService, QueryResult } from "./cloudwatch-logs-service.js";
import type { AwsClientConfig } from "./credential-service.js";

/**
 * Configuration options for CloudWatch Logs Favorites service
 *
 * @public
 */
export interface CloudWatchLogsFavoritesServiceOptions {
  /**
   * Storage configuration options
   */
  storageOptions?: StorageOptions;
}

/**
 * CloudWatch Logs Favorites service for managing favorites and saved queries
 *
 * Provides operations for managing CloudWatch Logs favorites (log groups)
 * and saved queries with local storage persistence and query execution.
 *
 * @public
 */
export class CloudWatchLogsFavoritesService {
  private readonly storage: CloudWatchLogsFavoritesStorage;

  /**
   * Create a new CloudWatch Logs Favorites service instance
   *
   * @param managementService - CloudWatch Logs management service for log group validation and query execution
   * @param options - Configuration options for the favorites service
   */
  constructor(
    private readonly managementService: CloudWatchLogsService,
    options: CloudWatchLogsFavoritesServiceOptions = {},
  ) {
    this.storage = new CloudWatchLogsFavoritesStorage(options.storageOptions);
  }

  /**
   * Add a new favorite log group or query
   *
   * @param favorite - Favorite entry to add
   * @throws When favorite validation or storage fails
   */
  async addFavorite(favorite: Omit<Favorite, "createdAt" | "accessCount">): Promise<void> {
    // Add metadata
    const completeFavorite: Favorite = {
      ...favorite,
      createdAt: new Date().toISOString(),
      accessCount: 0,
    };

    // Validate log group exists if it's a log-group favorite
    if (completeFavorite.type === "log-group" && completeFavorite.logGroupName) {
      try {
        await this.managementService.describeLogGroup(completeFavorite.logGroupName);
      } catch {
        throw new Error(
          `Cannot add favorite: log group '${completeFavorite.logGroupName}' does not exist`,
        );
      }
    }

    // Validate query reference if it's a query favorite
    if (completeFavorite.type === "query" && completeFavorite.queryName) {
      const query = await this.storage.getSavedQuery(completeFavorite.queryName);
      if (!query) {
        throw new Error(
          `Cannot add favorite: saved query '${completeFavorite.queryName}' does not exist`,
        );
      }
    }

    await this.storage.addFavorite(completeFavorite);
  }

  /**
   * Remove a favorite by name
   *
   * @param name - Name of the favorite to remove
   * @throws When removing favorite fails
   */
  async removeFavorite(name: string): Promise<void> {
    await this.storage.removeFavorite(name);
  }

  /**
   * List all favorites
   *
   * @param type - Optional filter by favorite type
   * @returns Array of favorite entries
   * @throws When reading favorites fails
   */
  async listFavorites(type?: "log-group" | "query"): Promise<Favorite[]> {
    const favorites = await this.storage.getFavorites();

    if (type) {
      return favorites.filter((f) => f.type === type);
    }

    return favorites;
  }

  /**
   * Get a specific favorite by name
   *
   * @param name - Name of the favorite to retrieve
   * @returns The favorite entry or undefined if not found
   */
  async getFavorite(name: string): Promise<Favorite | undefined> {
    const favorite = await this.storage.getFavorite(name);

    // Update access statistics
    if (favorite) {
      await this.storage.updateFavoriteAccess(name);
    }

    return favorite;
  }

  /**
   * Add a new saved query
   *
   * @param query - Saved query to add (without timestamps)
   * @throws When query validation or storage fails
   */
  async addSavedQuery(
    query: Omit<SavedQuery, "createdAt" | "usageCount" | "lastUsedAt">,
  ): Promise<void> {
    // Add metadata
    const completeQuery: SavedQuery = {
      ...query,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };

    await this.storage.addSavedQuery(completeQuery);
  }

  /**
   * Remove a saved query by name
   *
   * @param name - Name of the saved query to remove
   * @throws When removing query fails
   */
  async removeSavedQuery(name: string): Promise<void> {
    await this.storage.removeSavedQuery(name);
  }

  /**
   * List all saved queries
   *
   * @param sortBy - Optional sort criteria (usage, name, created)
   * @returns Array of saved query entries
   * @throws When reading saved queries fails
   */
  async listSavedQueries(sortBy?: "usage" | "name" | "created"): Promise<SavedQuery[]> {
    const queries = await this.storage.getSavedQueries();

    switch (sortBy) {
      case "usage": {
        return queries.toSorted((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
      }
      case "name": {
        return queries.toSorted((a, b) => a.name.localeCompare(b.name));
      }
      case "created": {
        return queries.toSorted(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      }
      // No default
    }

    return queries;
  }

  /**
   * Get a specific saved query by name
   *
   * @param name - Name of the saved query to retrieve
   * @returns The saved query or undefined if not found
   */
  async getSavedQuery(name: string): Promise<SavedQuery | undefined> {
    return await this.storage.getSavedQuery(name);
  }

  /**
   * Execute a saved query
   *
   * @param name - Name of the saved query to execute
   * @param config - AWS client configuration options
   * @param options - Query execution options
   * @returns Promise resolving to query results
   * @throws When query execution fails or query not found
   */
  async executeSavedQuery(
    name: string,
    config: AwsClientConfig = {},
    options: {
      logGroupNames?: string[];
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    } = {},
  ): Promise<QueryResult> {
    // Get saved query
    const query = await this.storage.getSavedQuery(name);
    if (!query) {
      throw new Error(`Saved query with name '${name}' not found`);
    }

    // Update usage statistics
    await this.storage.updateQueryUsage(name);

    // Execute query using management service
    const endTime = options.endTime || new Date();
    const startTime = options.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours

    return await this.managementService.executeQuery(
      {
        logGroupNames: options.logGroupNames || query.defaultLogGroups || [],
        query: query.query,
        startTime,
        endTime,
        ...(options.limit !== undefined && { limit: options.limit }),
      },
      config,
    );
  }
}
