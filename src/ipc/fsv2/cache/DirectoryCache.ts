/**
 * DirectoryCache - High-performance LRU cache for directory listings.
 *
 * This module provides a module-level singleton cache for directory entries.
 * It's designed to make file tree rendering instant by avoiding repeated
 * disk I/O for frequently accessed directories.
 *
 * Key Design Decisions:
 *
 * 1. **Module-level singleton**: The cache persists across component
 *    mount/unmount cycles. If a user closes and reopens a file tree,
 *    the cache is still warm.
 *
 * 2. **Version-based invalidation**: Instead of deleting stale entries,
 *    we increment a version number. This allows returning stale data
 *    immediately while fresh data is fetched in the background.
 *
 * 3. **LRU eviction**: Limits memory usage by evicting least-recently-used
 *    entries when the cache is full. Frequently accessed directories
 *    (like /src) stay cached, rarely accessed ones get evicted.
 *
 * 4. **Path normalization**: Handles trailing slashes and ensures
 *    consistent cache keys regardless of how paths are formatted.
 *
 * Memory Budget:
 * - Average directory: ~20 files × 50 bytes = 1KB
 * - 500 directories = ~500KB
 * - Reasonable for long-running editor sessions
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import type { DirectoryEntry, Disposable } from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * A cached directory entry with metadata for cache management.
 */
export interface CacheEntry {
  /** The cached directory entries */
  entries: DirectoryEntry[];

  /**
   * Version number for invalidation tracking.
   *
   * Incremented when:
   * - Entry is updated via `set()`
   * - Entry is invalidated via `invalidate()`
   *
   * Consumers can compare versions to detect stale data.
   */
  version: number;

  /**
   * Timestamp when this entry was last updated.
   * Used for debugging and potential TTL-based expiration in the future.
   */
  timestamp: number;
}

/**
 * Listener callback for cache change notifications.
 */
export type CacheChangeListener = (
  path: string,
  entry: CacheEntry | null,
) => void;

// ============================================================================
// Implementation
// ============================================================================

/**
 * LRU cache for directory listings.
 *
 * This class is instantiated once at module level and exported as a singleton.
 * All providers share the same cache instance.
 *
 * @example
 * ```typescript
 * import { DirectoryCache } from './cache/DirectoryCache';
 *
 * // Set entries
 * DirectoryCache.set('/project/src', [
 *   { name: 'index.ts', type: 'file' },
 *   { name: 'utils', type: 'directory' },
 * ]);
 *
 * // Get entries (returns CacheEntry with version info)
 * const cached = DirectoryCache.get('/project/src');
 * if (cached) {
 *   console.log('Entries:', cached.entries);
 *   console.log('Version:', cached.version);
 * }
 *
 * // Invalidate when files change
 * DirectoryCache.invalidate('/project/src');
 * ```
 */
class DirectoryCacheImpl {
  /**
   * The main cache storage.
   * Key: normalized absolute path
   * Value: CacheEntry with entries, version, and timestamp
   */
  private cache = new Map<string, CacheEntry>();

  /**
   * Listeners for cache changes.
   * Key: path pattern (or '*' for all)
   * Value: Set of listener callbacks
   */
  private listeners = new Map<string, Set<CacheChangeListener>>();

  /**
   * Tracks access order for LRU eviction.
   * Most recently accessed paths are at the end.
   */
  private accessOrder: string[] = [];

  /**
   * Maximum number of entries before LRU eviction kicks in.
   * Can be configured via setMaxSize() for testing.
   */
  private maxSize = 500;

  // -------------------------------------------------------------------------
  // Core Operations
  // -------------------------------------------------------------------------

  /**
   * Get a cached directory entry.
   *
   * Updates access order for LRU tracking (this path becomes most-recently-used).
   *
   * @param dirPath - Absolute path to the directory
   * @returns CacheEntry if found, undefined if not cached
   */
  get(dirPath: string): CacheEntry | undefined {
    const normalizedPath = this.normalizePath(dirPath);
    const entry = this.cache.get(normalizedPath);

    if (entry) {
      // Update LRU: move to end (most recently used)
      this.updateAccessOrder(normalizedPath);
    }

    return entry;
  }

  /**
   * Cache a directory listing.
   *
   * If an entry already exists, its version is incremented.
   * If the cache is full, the least-recently-used entry is evicted.
   *
   * @param dirPath - Absolute path to the directory
   * @param entries - Directory entries to cache
   */
  set(dirPath: string, entries: DirectoryEntry[]): void {
    const normalizedPath = this.normalizePath(dirPath);
    const existing = this.cache.get(normalizedPath);

    // Evict LRU entry if at capacity and this is a new entry
    if (!existing && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const newEntry: CacheEntry = {
      entries,
      version: (existing?.version ?? 0) + 1,
      timestamp: Date.now(),
    };

    this.cache.set(normalizedPath, newEntry);
    this.updateAccessOrder(normalizedPath);
    this.notifyListeners(normalizedPath, newEntry);
  }

  /**
   * Check if a directory is cached.
   *
   * Does NOT update access order (peek operation).
   *
   * @param dirPath - Absolute path to the directory
   * @returns true if the directory is in the cache
   */
  has(dirPath: string): boolean {
    const normalizedPath = this.normalizePath(dirPath);
    return this.cache.has(normalizedPath);
  }

  /**
   * Get the version number of a cached entry.
   *
   * Useful for comparing if data has changed since last read.
   *
   * @param dirPath - Absolute path to the directory
   * @returns Version number, or 0 if not cached
   */
  getVersion(dirPath: string): number {
    const normalizedPath = this.normalizePath(dirPath);
    return this.cache.get(normalizedPath)?.version ?? 0;
  }

  // -------------------------------------------------------------------------
  // In-Place Updates
  // -------------------------------------------------------------------------

  /**
   * Add a single entry to a cached directory listing.
   *
   * If the directory is not cached, this is a no-op.
   * If an entry with the same name already exists, it is replaced.
   *
   * @param dirPath - Absolute path to the directory
   * @param entry - The entry to add
   */
  addEntry(dirPath: string, entry: DirectoryEntry): void {
    const normalizedPath = this.normalizePath(dirPath);
    const cached = this.cache.get(normalizedPath);

    if (!cached) {
      return; // Directory not cached, nothing to update
    }

    // Remove existing entry with same name if present
    const entries = cached.entries.filter((e) => e.name !== entry.name);
    entries.push(entry);

    // Sort entries: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    cached.entries = entries;
    cached.version++;
    cached.timestamp = Date.now();

    this.notifyListeners(normalizedPath, cached);
  }

  /**
   * Remove a single entry from a cached directory listing.
   *
   * If the directory is not cached or the entry doesn't exist, this is a no-op.
   *
   * @param dirPath - Absolute path to the directory
   * @param entryName - Name of the entry to remove
   */
  removeEntry(dirPath: string, entryName: string): void {
    const normalizedPath = this.normalizePath(dirPath);
    const cached = this.cache.get(normalizedPath);

    if (!cached) {
      return; // Directory not cached, nothing to update
    }

    const originalLength = cached.entries.length;
    cached.entries = cached.entries.filter((e) => e.name !== entryName);

    // Only update version if something was actually removed
    if (cached.entries.length !== originalLength) {
      cached.version++;
      cached.timestamp = Date.now();
      this.notifyListeners(normalizedPath, cached);
    }
  }

  // -------------------------------------------------------------------------
  // Invalidation
  // -------------------------------------------------------------------------

  /**
   * Invalidate a cached entry without removing it.
   *
   * This increments the version number, signaling that the data may be stale.
   * The entry remains in cache so stale data can be returned immediately
   * while fresh data is fetched in the background.
   *
   * @param dirPath - Absolute path to the directory
   */
  invalidate(dirPath: string): void {
    const normalizedPath = this.normalizePath(dirPath);
    const entry = this.cache.get(normalizedPath);

    if (entry) {
      entry.version++;
      entry.timestamp = Date.now();
      this.notifyListeners(normalizedPath, entry);
    }
  }

  /**
   * Remove a cached entry completely.
   *
   * Use this when a directory is deleted or you want to force a fresh read.
   * For normal invalidation (file changed), prefer `invalidate()`.
   *
   * @param dirPath - Absolute path to the directory
   */
  delete(dirPath: string): void {
    const normalizedPath = this.normalizePath(dirPath);

    if (this.cache.delete(normalizedPath)) {
      // Remove from access order
      const index = this.accessOrder.indexOf(normalizedPath);
      if (index !== -1) {
        this.accessOrder.splice(index, 1);
      }
      this.notifyListeners(normalizedPath, null);
    }
  }

  /**
   * Clear the entire cache.
   *
   * Use sparingly - typically only needed for testing or major CWD changes.
   */
  clear(): void {
    const paths = [...this.cache.keys()];
    this.cache.clear();
    this.accessOrder = [];

    // Notify all listeners
    for (const path of paths) {
      this.notifyListeners(path, null);
    }
  }

  // -------------------------------------------------------------------------
  // Subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to cache changes for a specific path.
   *
   * @param dirPath - Path to watch, or '*' for all changes
   * @param listener - Callback when cache changes
   * @returns Disposable to unsubscribe
   */
  subscribe(dirPath: string, listener: CacheChangeListener): Disposable {
    const normalizedPath = dirPath === "*" ? "*" : this.normalizePath(dirPath);

    let pathListeners = this.listeners.get(normalizedPath);
    if (!pathListeners) {
      pathListeners = new Set();
      this.listeners.set(normalizedPath, pathListeners);
    }

    pathListeners.add(listener);

    return {
      dispose: () => {
        const listeners = this.listeners.get(normalizedPath);
        if (listeners) {
          listeners.delete(listener);
          if (listeners.size === 0) {
            this.listeners.delete(normalizedPath);
          }
        }
      },
    };
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Set the maximum cache size.
   *
   * If the new size is smaller than current cache size,
   * LRU entries will be evicted immediately.
   *
   * @param size - Maximum number of entries
   */
  setMaxSize(size: number): void {
    this.maxSize = size;

    // Evict entries if we're over the new limit
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Get the current cache size (number of entries).
   */
  get size(): number {
    return this.cache.size;
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /**
   * Normalize a path for consistent cache keys.
   *
   * - Removes trailing slashes (except for root '/')
   * - Ensures consistent format
   */
  private normalizePath(dirPath: string): string {
    // Remove trailing slash unless it's the root
    if (dirPath.length > 1 && dirPath.endsWith("/")) {
      return dirPath.slice(0, -1);
    }
    return dirPath;
  }

  /**
   * Update access order for LRU tracking.
   *
   * Moves the path to the end of accessOrder (most recently used).
   */
  private updateAccessOrder(normalizedPath: string): void {
    const index = this.accessOrder.indexOf(normalizedPath);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(normalizedPath);
  }

  /**
   * Evict the least-recently-used entry.
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruPath = this.accessOrder.shift();
    if (lruPath) {
      this.cache.delete(lruPath);
      this.notifyListeners(lruPath, null);
    }
  }

  /**
   * Notify listeners about a cache change.
   */
  private notifyListeners(path: string, entry: CacheEntry | null): void {
    // Notify path-specific listeners
    const pathListeners = this.listeners.get(path);
    if (pathListeners) {
      for (const listener of pathListeners) {
        try {
          listener(path, entry);
        } catch (error) {
          console.error("[DirectoryCache] Listener threw an error:", error);
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get("*");
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(path, entry);
        } catch (error) {
          console.error("[DirectoryCache] Listener threw an error:", error);
        }
      }
    }
  }
}

// ============================================================================
// Module-Level Singleton Export
// ============================================================================

/**
 * The global directory cache instance.
 *
 * All providers and components share this single cache.
 * This ensures cache hits across different parts of the application
 * and prevents duplicate caching of the same directories.
 */
export const DirectoryCache = new DirectoryCacheImpl();
