/**
 * FileSystemProviderService - Lifecycle management for filesystem providers.
 *
 * This service manages DiskFileSystemProvider instances with reference counting
 * and graceful disposal. It ensures that:
 *
 * 1. **Single Instance Per Path**: Multiple consumers of the same directory
 *    share a single provider instance for efficiency.
 *
 * 2. **Reference Counting**: Tracks how many consumers are using each provider.
 *    When the count drops to zero, the provider enters a grace period.
 *
 * 3. **Grace Period**: Providers are not immediately disposed when released.
 *    A 5-second grace period allows for quick re-acquisition if the same
 *    directory is needed again (e.g., tab switching, view changes).
 *
 * 4. **Path Normalization**: All paths are normalized to ensure consistent
 *    provider lookup regardless of how the path is specified.
 *
 * Usage Pattern:
 * ```typescript
 * const service = FileSystemProviderService.getInstance();
 *
 * // Acquire a provider (creates new or increments refCount)
 * const provider = await service.getProvider('/project/src');
 *
 * // Use the provider...
 * const entries = await provider.readDirectory('/project/src');
 *
 * // Release when done (decrements refCount, may start grace timer)
 * service.releaseProvider('/project/src');
 * ```
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import * as path from "node:path";
import { DiskFileSystemProvider } from "../providers/DiskFileSystemProvider";

// ============================================================================
// Constants
// ============================================================================

/** Grace period before disposing a provider with zero references (ms) */
const DISPOSE_GRACE_PERIOD_MS = 5000;

// ============================================================================
// Types
// ============================================================================

/**
 * Internal entry tracking a provider instance and its lifecycle state.
 */
interface ProviderEntry {
  /** The filesystem provider instance */
  provider: DiskFileSystemProvider;

  /** Current number of active references */
  refCount: number;

  /** Pending disposal timer (set when refCount reaches 0) */
  disposeTimer?: NodeJS.Timeout;
}

// ============================================================================
// FileSystemProviderService
// ============================================================================

/**
 * Service for managing filesystem provider lifecycles.
 *
 * This is a singleton service that should be accessed via `getInstance()`.
 * It handles provider creation, reference counting, and graceful disposal.
 *
 * @example
 * ```typescript
 * const service = FileSystemProviderService.getInstance();
 *
 * // Acquire provider (refCount: 0 -> 1)
 * const provider1 = await service.getProvider('/project');
 *
 * // Same path returns same instance (refCount: 1 -> 2)
 * const provider2 = await service.getProvider('/project');
 * console.log(provider1 === provider2); // true
 *
 * // Release references
 * service.releaseProvider('/project'); // refCount: 2 -> 1
 * service.releaseProvider('/project'); // refCount: 1 -> 0, starts grace timer
 *
 * // After 5 seconds with no new references, provider is disposed
 * ```
 */
export class FileSystemProviderService {
  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------

  private static instance: FileSystemProviderService | null = null;

  /**
   * Get the singleton instance of the service.
   */
  static getInstance(): FileSystemProviderService {
    if (!FileSystemProviderService.instance) {
      FileSystemProviderService.instance = new FileSystemProviderService();
    }
    return FileSystemProviderService.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   *
   * This disposes all providers and clears the singleton.
   * Should only be used in test cleanup.
   */
  static resetInstance(): void {
    if (FileSystemProviderService.instance) {
      FileSystemProviderService.instance.disposeAll();
      FileSystemProviderService.instance = null;
    }
  }

  // -------------------------------------------------------------------------
  // Internal State
  // -------------------------------------------------------------------------

  /** Map of normalized paths to provider entries */
  private providers = new Map<string, ProviderEntry>();

  /** Private constructor - use getInstance() */
  private constructor() {}

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /**
   * Get a filesystem provider for the specified directory.
   *
   * If a provider already exists for this path, the reference count is
   * incremented and the existing provider is returned. If a provider is
   * in the grace period awaiting disposal, the timer is cancelled and
   * the provider is reused.
   *
   * @param cwd - The working directory path
   * @returns The filesystem provider instance
   */
  async getProvider(cwd: string): Promise<DiskFileSystemProvider> {
    const normalizedPath = this.normalizePath(cwd);
    const existing = this.providers.get(normalizedPath);

    if (existing) {
      // Cancel any pending disposal
      if (existing.disposeTimer) {
        clearTimeout(existing.disposeTimer);
        existing.disposeTimer = undefined;
      }

      // Increment reference count
      existing.refCount++;

      return existing.provider;
    }

    // Create new provider
    const provider = new DiskFileSystemProvider(normalizedPath);

    // Start watching for file changes
    await provider.startWatching();

    // Store entry with initial refCount of 1
    this.providers.set(normalizedPath, {
      provider,
      refCount: 1,
    });

    return provider;
  }

  /**
   * Release a reference to a filesystem provider.
   *
   * Decrements the reference count for the provider at the specified path.
   * When the count reaches zero, a grace period timer is started. If no
   * new references are acquired within the grace period, the provider
   * is disposed.
   *
   * @param cwd - The working directory path
   */
  releaseProvider(cwd: string): void {
    const normalizedPath = this.normalizePath(cwd);
    const entry = this.providers.get(normalizedPath);

    if (!entry) {
      console.warn(
        `[FileSystemProviderService] Attempted to release unknown provider: ${normalizedPath}`,
      );
      return;
    }

    // Decrement reference count
    entry.refCount--;

    if (entry.refCount <= 0) {
      // Start grace period timer
      entry.disposeTimer = setTimeout(() => {
        this.disposeProvider(normalizedPath);
      }, DISPOSE_GRACE_PERIOD_MS);
    }
  }

  /**
   * Immediately dispose a provider without waiting for grace period.
   *
   * This is primarily useful for testing or forced cleanup scenarios.
   *
   * @param cwd - The working directory path
   */
  async forceDispose(cwd: string): Promise<void> {
    const normalizedPath = this.normalizePath(cwd);
    await this.disposeProvider(normalizedPath);
  }

  /**
   * Get the current reference count for a provider.
   *
   * Returns 0 if no provider exists for the path.
   *
   * @param cwd - The working directory path
   * @returns The current reference count
   */
  getRefCount(cwd: string): number {
    const normalizedPath = this.normalizePath(cwd);
    const entry = this.providers.get(normalizedPath);
    return entry?.refCount ?? 0;
  }

  /**
   * Check if a provider exists for the given path.
   *
   * @param cwd - The working directory path
   * @returns True if a provider exists (regardless of refCount)
   */
  hasProvider(cwd: string): boolean {
    const normalizedPath = this.normalizePath(cwd);
    return this.providers.has(normalizedPath);
  }

  /**
   * Get the number of active providers.
   *
   * @returns The count of providers currently managed by this service
   */
  get providerCount(): number {
    return this.providers.size;
  }

  /**
   * Force dispose all providers immediately.
   *
   * This is primarily useful for testing or forced cleanup scenarios
   * such as application shutdown.
   */
  forceDisposeAll(): void {
    this.disposeAll();
  }

  /**
   * Get statistics about active providers.
   *
   * Useful for debugging and monitoring.
   *
   * @returns Object containing provider statistics
   */
  getStats(): {
    providers: Map<string, { refCount: number; hasPendingDispose: boolean }>;
  } {
    const stats = new Map<
      string,
      { refCount: number; hasPendingDispose: boolean }
    >();

    for (const [path, entry] of this.providers) {
      stats.set(path, {
        refCount: entry.refCount,
        hasPendingDispose: entry.disposeTimer !== null,
      });
    }

    return { providers: stats };
  }

  // -------------------------------------------------------------------------
  // Internal Methods
  // -------------------------------------------------------------------------

  /**
   * Normalize a path for consistent lookup.
   *
   * Resolves to absolute path and handles platform-specific normalization.
   */
  private normalizePath(filePath: string): string {
    return path.resolve(filePath);
  }

  /**
   * Dispose a provider and remove it from the map.
   */
  private async disposeProvider(normalizedPath: string): Promise<void> {
    const entry = this.providers.get(normalizedPath);

    if (!entry) {
      return;
    }

    // Clear any pending timer
    if (entry.disposeTimer) {
      clearTimeout(entry.disposeTimer);
    }

    // Remove from map
    this.providers.delete(normalizedPath);

    // Dispose the provider
    await entry.provider.dispose();
  }

  /**
   * Dispose all providers (used during service shutdown/reset).
   */
  private disposeAll(): void {
    for (const [normalizedPath, entry] of this.providers) {
      // Clear any pending timer
      if (entry.disposeTimer) {
        clearTimeout(entry.disposeTimer);
      }

      // Dispose provider (fire-and-forget since we're shutting down)
      entry.provider.dispose().catch((error) => {
        console.error(
          `[FileSystemProviderService] Error disposing provider ${normalizedPath}:`,
          error,
        );
      });
    }

    this.providers.clear();
  }
}
