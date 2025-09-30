/**
 * @module favorites-storage-service
 * Favorites storage service for CloudWatch Logs
 *
 * Manages local storage of favorite log groups and queries with usage analytics,
 * export/import capabilities, and team collaboration features.
 *
 */

import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CloudWatchLogsError } from "../lib/cloudwatch-logs-errors.js";
import { FavoriteSchema, type Favorite, type SavedQuery } from "../lib/cloudwatch-logs-schemas.js";

/**
 * Storage configuration options
 *
 * @public
 */
export interface FavoritesStorageOptions {
  /**
   * Custom storage directory (defaults to ~/.aws-ts/)
   */
  storageDir?: string;

  /**
   * Enable debug logging
   */
  enableDebugLogging?: boolean;

  /**
   * Enable automatic backup
   */
  enableBackup?: boolean;
}

/**
 * Favorites collection interface
 *
 * @public
 */
export interface FavoritesCollection {
  /**
   * Favorite log groups and queries
   */
  favorites: Favorite[];

  /**
   * Saved query definitions
   */
  savedQueries: SavedQuery[];

  /**
   * Collection metadata
   */
  metadata: {
    version: string;
    createdAt: string;
    lastModifiedAt: string;
    totalFavorites: number;
    totalQueries: number;
  };
}

/**
 * Export/import format for team collaboration
 *
 * @public
 */
export interface FavoritesExport {
  /**
   * Export metadata
   */
  exportInfo: {
    exportedAt: string;
    exportedBy?: string;
    version: string;
    description?: string;
  };

  /**
   * Exported favorites
   */
  favorites: Favorite[];

  /**
   * Exported saved queries
   */
  savedQueries: SavedQuery[];
}

/**
 * Favorites storage service for local file system management
 *
 * Provides persistent storage for favorite log groups and queries with
 * usage analytics, validation, and team collaboration features.
 *
 * @public
 */
export class FavoritesStorageService {
  private readonly storageDir: string;
  private readonly favoritesFile: string;
  private readonly backupDir: string;
  private readonly options: FavoritesStorageOptions;

  /**
   * Create a new favorites storage service
   *
   * @param options - Storage configuration options
   */
  constructor(options: FavoritesStorageOptions = {}) {
    this.options = options;
    this.storageDir = options.storageDir || path.join(homedir(), ".aws-ts", "favorites");
    this.favoritesFile = path.join(this.storageDir, "favorites.json");
    this.backupDir = path.join(this.storageDir, "backups");

    if (this.options.enableDebugLogging) {
      console.debug(`Favorites storage initialized: ${this.storageDir}`);
    }
  }

  /**
   * Initialize storage directory and files
   *
   * @returns Promise resolving when initialization is complete
   * @throws When initialization fails
   */
  async initialize(): Promise<void> {
    try {
      // Create storage directory
      await fs.mkdir(this.storageDir, { recursive: true });

      // Create backup directory if enabled
      if (this.options.enableBackup) {
        await fs.mkdir(this.backupDir, { recursive: true });
      }

      // Create initial favorites file if it doesn't exist
      try {
        await fs.access(this.favoritesFile);
      } catch {
        const initialCollection: FavoritesCollection = {
          favorites: [],
          savedQueries: [],
          metadata: {
            version: "1.0.0",
            createdAt: new Date().toISOString(),
            lastModifiedAt: new Date().toISOString(),
            totalFavorites: 0,
            totalQueries: 0,
          },
        };
        await this.saveCollection(initialCollection);
      }

      if (this.options.enableDebugLogging) {
        console.debug("Favorites storage initialized successfully");
      }
    } catch (error) {
      throw new CloudWatchLogsError(
        `Failed to initialize favorites storage: ${error instanceof Error ? error.message : String(error)}`,
        "initialize-storage",
        undefined,
        error,
      );
    }
  }

  /**
   * Load favorites collection from storage
   *
   * @returns Promise resolving to favorites collection
   * @throws When loading fails
   */
  async loadCollection(): Promise<FavoritesCollection> {
    try {
      const data = await fs.readFile(this.favoritesFile, "utf8");
      const collection = JSON.parse(data) as FavoritesCollection;

      // Validate collection structure
      if (!collection.favorites || !collection.savedQueries || !collection.metadata) {
        throw new Error("Invalid favorites collection format");
      }

      return collection;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, initialize and return empty collection
        await this.initialize();
        return this.loadCollection();
      }

      throw new CloudWatchLogsError(
        `Failed to load favorites collection: ${error instanceof Error ? error.message : String(error)}`,
        "load-collection",
        undefined,
        error,
      );
    }
  }

  /**
   * Save favorites collection to storage
   *
   * @param collection - Favorites collection to save
   * @returns Promise resolving when save is complete
   * @throws When saving fails
   */
  async saveCollection(collection: FavoritesCollection): Promise<void> {
    try {
      // Create backup if enabled
      if (this.options.enableBackup) {
        await this.createBackup();
      }

      // Update metadata timestamps and counts to reflect current state before persisting to disk.
      collection.metadata.lastModifiedAt = new Date().toISOString();
      collection.metadata.totalFavorites = collection.favorites.length;
      collection.metadata.totalQueries = collection.savedQueries.length;

      // Save to file
      const data = JSON.stringify(collection, undefined, 2);
      await fs.writeFile(this.favoritesFile, data, "utf8");

      if (this.options.enableDebugLogging) {
        console.debug(
          `Saved ${collection.favorites.length} favorites and ${collection.savedQueries.length} queries`,
        );
      }
    } catch (error) {
      throw new CloudWatchLogsError(
        `Failed to save favorites collection: ${error instanceof Error ? error.message : String(error)}`,
        "save-collection",
        undefined,
        error,
      );
    }
  }

  /**
   * Add favorite log group
   *
   * @param name - Favorite name/alias
   * @param logGroupName - Log group name
   * @param description - Optional description
   * @returns Promise resolving when favorite is added
   * @throws When adding fails or favorite already exists
   */
  async addLogGroupFavorite(
    name: string,
    logGroupName: string,
    description?: string,
  ): Promise<void> {
    const collection = await this.loadCollection();

    // Check if favorite already exists
    if (collection.favorites.some((fav) => fav.name === name)) {
      throw new CloudWatchLogsError(
        `Favorite with name '${name}' already exists`,
        "add-favorite",
        logGroupName,
      );
    }

    // Create and validate favorite
    const favorite: Favorite = FavoriteSchema.parse({
      name,
      type: "log-group",
      logGroupName,
      description,
      createdAt: new Date().toISOString(),
      accessCount: 0,
    });

    collection.favorites.push(favorite);
    await this.saveCollection(collection);
  }

  /**
   * Add favorite query
   *
   * @param name - Favorite name
   * @param queryName - Reference to saved query
   * @param description - Optional description
   * @returns Promise resolving when favorite is added
   * @throws When adding fails or favorite already exists
   */
  async addQueryFavorite(name: string, queryName: string, description?: string): Promise<void> {
    const collection = await this.loadCollection();

    // Check if favorite already exists
    if (collection.favorites.some((fav) => fav.name === name)) {
      throw new CloudWatchLogsError(
        `Favorite with name '${name}' already exists`,
        "add-favorite",
        undefined,
      );
    }

    // Check if referenced query exists
    if (!collection.savedQueries.some((query) => query.name === queryName)) {
      throw new CloudWatchLogsError(
        `Saved query '${queryName}' not found`,
        "add-favorite",
        undefined,
      );
    }

    // Create and validate favorite
    const favorite: Favorite = FavoriteSchema.parse({
      name,
      type: "query",
      queryName,
      description,
      createdAt: new Date().toISOString(),
      accessCount: 0,
    });

    collection.favorites.push(favorite);
    await this.saveCollection(collection);
  }

  /**
   * List favorites with optional filtering
   *
   * @param type - Optional type filter (log-group or query)
   * @returns Promise resolving to array of favorites
   */
  async listFavorites(type?: "log-group" | "query"): Promise<Favorite[]> {
    const collection = await this.loadCollection();

    if (type) {
      return collection.favorites.filter((fav) => fav.type === type);
    }

    return collection.favorites;
  }

  /**
   * Get favorite by name
   *
   * @param name - Favorite name
   * @returns Promise resolving to favorite or undefined if not found
   */
  async getFavorite(name: string): Promise<Favorite | undefined> {
    const collection = await this.loadCollection();
    return collection.favorites.find((fav) => fav.name === name);
  }

  /**
   * Remove favorite by name
   *
   * @param name - Favorite name to remove
   * @returns Promise resolving to true if removed, false if not found
   */
  async removeFavorite(name: string): Promise<boolean> {
    const collection = await this.loadCollection();
    const initialLength = collection.favorites.length;

    collection.favorites = collection.favorites.filter((fav) => fav.name !== name);

    if (collection.favorites.length < initialLength) {
      await this.saveCollection(collection);
      return true;
    }

    return false;
  }

  /**
   * Update favorite access statistics
   *
   * @param name - Favorite name
   * @returns Promise resolving when access is recorded
   */
  async recordAccess(name: string): Promise<void> {
    const collection = await this.loadCollection();
    const favorite = collection.favorites.find((fav) => fav.name === name);

    if (favorite) {
      favorite.accessCount = (favorite.accessCount || 0) + 1;
      favorite.lastAccessedAt = new Date().toISOString();
      await this.saveCollection(collection);
    }
  }

  /**
   * Export favorites for team collaboration
   *
   * @param description - Optional export description
   * @returns Promise resolving to export data
   */
  async exportFavorites(description?: string): Promise<FavoritesExport> {
    const collection = await this.loadCollection();

    return {
      exportInfo: {
        exportedAt: new Date().toISOString(),
        version: "1.0.0",
        ...(description && { description }),
      },
      favorites: collection.favorites,
      savedQueries: collection.savedQueries,
    };
  }

  /**
   * Import favorites from export data
   *
   * @param exportData - Export data to import
   * @param mergeStrategy - How to handle conflicts (overwrite, skip, rename)
   * @returns Promise resolving to import summary
   */
  async importFavorites(
    exportData: FavoritesExport,
    mergeStrategy: "overwrite" | "skip" | "rename" = "skip",
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const collection = await this.loadCollection();
    const summary = { imported: 0, skipped: 0, errors: [] as string[] };

    // Import favorites
    this.importItemsWithMergeStrategy(
      exportData.favorites,
      collection.favorites,
      mergeStrategy,
      summary,
      "favorite",
    );

    // Import saved queries
    this.importItemsWithMergeStrategy(
      exportData.savedQueries,
      collection.savedQueries,
      mergeStrategy,
      summary,
      "query",
    );

    await this.saveCollection(collection);
    return summary;
  }

  /**
   * Generic method to import items with merge strategy
   *
   * @param importItems - Items to import
   * @param targetCollection - Target collection to import into
   * @param mergeStrategy - How to handle conflicts
   * @param summary - Import summary to update
   * @param itemType - Type of item for error messages
   * @internal
   */
  private importItemsWithMergeStrategy<T extends { name: string }>(
    importItems: T[],
    targetCollection: T[],
    mergeStrategy: "overwrite" | "skip" | "rename",
    summary: { imported: number; skipped: number; errors: string[] },
    itemType: string,
  ): void {
    for (const importedItem of importItems) {
      try {
        const existingIndex = targetCollection.findIndex((item) => item.name === importedItem.name);

        if (existingIndex === -1) {
          targetCollection.push(importedItem);
          summary.imported++;
        } else {
          switch (mergeStrategy) {
            case "overwrite": {
              targetCollection[existingIndex] = importedItem;
              summary.imported++;
              break;
            }
            case "rename": {
              const newName = `${importedItem.name}_imported_${Date.now()}`;
              targetCollection.push({ ...importedItem, name: newName });
              summary.imported++;
              break;
            }
            default: {
              summary.skipped++;
              break;
            }
          }
        }
      } catch (error) {
        summary.errors.push(
          `Failed to import ${itemType} '${importedItem.name}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Create backup of current favorites
   *
   * @returns Promise resolving when backup is created
   * @internal
   */
  private async createBackup(): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
      const backupFile = path.join(this.backupDir, `favorites-${timestamp}.json`);

      const data = await fs.readFile(this.favoritesFile, "utf8");
      await fs.writeFile(backupFile, data, "utf8");

      // Keep only last 10 backups
      const backupFiles = await fs.readdir(this.backupDir);
      const sortedBackups = backupFiles
        .filter((file) => file.startsWith("favorites-") && file.endsWith(".json"))
        .toSorted((a, b) => a.localeCompare(b))
        .toReversed();

      for (const file of sortedBackups.slice(10)) {
        await fs.unlink(path.join(this.backupDir, file));
      }
    } catch (error) {
      // Log error but don't fail the main operation
      if (this.options.enableDebugLogging) {
        console.debug(
          `Backup creation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Get storage directory path
   *
   * @returns Storage directory path
   */
  getStorageDir(): string {
    return this.storageDir;
  }

  /**
   * Get usage statistics
   *
   * @returns Promise resolving to usage statistics
   */
  async getUsageStats(): Promise<{
    totalFavorites: number;
    totalQueries: number;
    mostAccessedFavorite: string | undefined;
    leastRecentlyUsed: string | undefined;
  }> {
    const collection = await this.loadCollection();

    let mostAccessedFavorite: string | undefined;
    let maxAccess = 0;

    let leastRecentlyUsed: string | undefined;
    let oldestAccess = Date.now();

    for (const favorite of collection.favorites) {
      if ((favorite.accessCount || 0) > maxAccess) {
        maxAccess = favorite.accessCount || 0;
        mostAccessedFavorite = favorite.name;
      }

      const lastAccess = favorite.lastAccessedAt
        ? new Date(favorite.lastAccessedAt).getTime()
        : new Date(favorite.createdAt).getTime();

      if (lastAccess < oldestAccess) {
        oldestAccess = lastAccess;
        leastRecentlyUsed = favorite.name;
      }
    }

    return {
      totalFavorites: collection.favorites.length,
      totalQueries: collection.savedQueries.length,
      mostAccessedFavorite,
      leastRecentlyUsed,
    };
  }
}
