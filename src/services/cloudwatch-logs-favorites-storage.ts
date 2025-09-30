/**
 * CloudWatch Logs Favorites storage service for local persistence
 *
 * Provides file-based storage for CloudWatch Logs favorites and saved queries
 * using JSON format with automatic directory creation and error handling.
 *
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Favorite, SavedQuery } from "../lib/cloudwatch-logs-schemas.js";

/**
 * Storage configuration options
 *
 * @public
 */
export interface StorageOptions {
  /**
   * Base directory for storage (defaults to ~/.aws-ts/cloudwatch-logs)
   */
  baseDirectory?: string;

  /**
   * Enable automatic backup of storage files before writing
   */
  enableBackup?: boolean;
}

/**
 * Storage service for CloudWatch Logs favorites and saved queries
 *
 * Provides local file-based storage using JSON format with automatic
 * directory creation and error handling.
 *
 * @public
 */
export class CloudWatchLogsFavoritesStorage {
  private readonly baseDirectory: string;
  private readonly favoritesFile: string;
  private readonly savedQueriesFile: string;
  private readonly options: StorageOptions;

  /**
   * Create a new favorites storage service
   *
   * @param options - Storage configuration options
   */
  constructor(options: StorageOptions = {}) {
    this.options = options;
    this.baseDirectory =
      options.baseDirectory || path.join(homedir(), ".aws-ts", "cloudwatch-logs");
    this.favoritesFile = path.join(this.baseDirectory, "favorites.json");
    this.savedQueriesFile = path.join(this.baseDirectory, "saved-queries.json");
  }

  /**
   * Initialize storage directory structure
   *
   * Creates the base directory if it doesn't exist
   *
   * @throws When directory creation fails
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.baseDirectory)) {
      await mkdir(this.baseDirectory, { recursive: true });
    }
  }

  /**
   * Get all favorites
   *
   * @returns Array of favorite entries
   * @throws When reading favorites fails
   */
  async getFavorites(): Promise<Favorite[]> {
    await this.initialize();

    if (!existsSync(this.favoritesFile)) {
      return [];
    }

    const content = await readFile(this.favoritesFile, "utf8");
    return JSON.parse(content) as Favorite[];
  }

  /**
   * Save favorites to storage
   *
   * @param favorites - Array of favorites to save
   * @throws When writing favorites fails
   */
  async saveFavorites(favorites: Favorite[]): Promise<void> {
    await this.initialize();

    // Backup existing file if enabled
    if (this.options.enableBackup && existsSync(this.favoritesFile)) {
      const backupFile = `${this.favoritesFile}.bak`;
      const existingContent = await readFile(this.favoritesFile, "utf8");
      await writeFile(backupFile, existingContent, "utf8");
    }

    await writeFile(this.favoritesFile, JSON.stringify(favorites, undefined, 2), "utf8");
  }

  /**
   * Add a favorite to storage
   *
   * @param favorite - Favorite entry to add
   * @throws When adding favorite fails or favorite name already exists
   */
  async addFavorite(favorite: Favorite): Promise<void> {
    const favorites = await this.getFavorites();

    // Check for duplicate name
    if (favorites.some((f) => f.name === favorite.name)) {
      throw new Error(`Favorite with name '${favorite.name}' already exists`);
    }

    favorites.push(favorite);
    await this.saveFavorites(favorites);
  }

  /**
   * Remove a favorite from storage by name
   *
   * @param name - Name of the favorite to remove
   * @throws When removing favorite fails or favorite not found
   */
  async removeFavorite(name: string): Promise<void> {
    const favorites = await this.getFavorites();
    const index = favorites.findIndex((f) => f.name === name);

    if (index === -1) {
      throw new Error(`Favorite with name '${name}' not found`);
    }

    favorites.splice(index, 1);
    await this.saveFavorites(favorites);
  }

  /**
   * Get a specific favorite by name
   *
   * @param name - Name of the favorite to retrieve
   * @returns The favorite entry or undefined if not found
   */
  async getFavorite(name: string): Promise<Favorite | undefined> {
    const favorites = await this.getFavorites();
    return favorites.find((f) => f.name === name);
  }

  /**
   * Update a favorite's access statistics
   *
   * @param name - Name of the favorite to update
   * @throws When updating favorite fails or favorite not found
   */
  async updateFavoriteAccess(name: string): Promise<void> {
    const favorites = await this.getFavorites();
    const favorite = favorites.find((f) => f.name === name);

    if (!favorite) {
      throw new Error(`Favorite with name '${name}' not found`);
    }

    favorite.lastAccessedAt = new Date().toISOString();
    favorite.accessCount = (favorite.accessCount || 0) + 1;
    await this.saveFavorites(favorites);
  }

  /**
   * Get all saved queries
   *
   * @returns Array of saved query entries
   * @throws When reading saved queries fails
   */
  async getSavedQueries(): Promise<SavedQuery[]> {
    await this.initialize();

    if (!existsSync(this.savedQueriesFile)) {
      return [];
    }

    const content = await readFile(this.savedQueriesFile, "utf8");
    return JSON.parse(content) as SavedQuery[];
  }

  /**
   * Save queries to storage
   *
   * @param queries - Array of saved queries to save
   * @throws When writing saved queries fails
   */
  async saveSavedQueries(queries: SavedQuery[]): Promise<void> {
    await this.initialize();

    // Backup existing file if enabled
    if (this.options.enableBackup && existsSync(this.savedQueriesFile)) {
      const backupFile = `${this.savedQueriesFile}.bak`;
      const existingContent = await readFile(this.savedQueriesFile, "utf8");
      await writeFile(backupFile, existingContent, "utf8");
    }

    await writeFile(this.savedQueriesFile, JSON.stringify(queries, undefined, 2), "utf8");
  }

  /**
   * Add a saved query to storage
   *
   * @param query - Saved query to add
   * @throws When adding query fails or query name already exists
   */
  async addSavedQuery(query: SavedQuery): Promise<void> {
    const queries = await this.getSavedQueries();

    // Check for duplicate name
    if (queries.some((q) => q.name === query.name)) {
      throw new Error(`Saved query with name '${query.name}' already exists`);
    }

    queries.push(query);
    await this.saveSavedQueries(queries);
  }

  /**
   * Remove a saved query from storage by name
   *
   * @param name - Name of the saved query to remove
   * @throws When removing query fails or query not found
   */
  async removeSavedQuery(name: string): Promise<void> {
    const queries = await this.getSavedQueries();
    const index = queries.findIndex((q) => q.name === name);

    if (index === -1) {
      throw new Error(`Saved query with name '${name}' not found`);
    }

    queries.splice(index, 1);
    await this.saveSavedQueries(queries);
  }

  /**
   * Get a specific saved query by name
   *
   * @param name - Name of the saved query to retrieve
   * @returns The saved query or undefined if not found
   */
  async getSavedQuery(name: string): Promise<SavedQuery | undefined> {
    const queries = await this.getSavedQueries();
    return queries.find((q) => q.name === name);
  }

  /**
   * Update a saved query's usage statistics
   *
   * @param name - Name of the saved query to update
   * @throws When updating query fails or query not found
   */
  async updateQueryUsage(name: string): Promise<void> {
    const queries = await this.getSavedQueries();
    const query = queries.find((q) => q.name === name);

    if (!query) {
      throw new Error(`Saved query with name '${name}' not found`);
    }

    query.lastUsedAt = new Date().toISOString();
    query.usageCount = (query.usageCount || 0) + 1;
    await this.saveSavedQueries(queries);
  }
}
