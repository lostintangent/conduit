/**
 * FileSystemV2APIService - Shared instance management for FileSystemV2API.
 *
 * This singleton service ensures that React components sharing the same working
 * directory (cwd) reuse a single FileSystemV2API instance. This is critical for:
 *
 * - **Reduced IPC Overhead**: One subscription per cwd, not per component
 * - **Consistent State**: All components see the same file system events
 * - **Memory Efficiency**: Shared instances are properly disposed when unused
 *
 * Design Decisions:
 *
 * 1. **Reference Counting**: Each `acquire()` increments refCount, each `release()`
 *    decrements it. This tracks how many components are using each instance.
 *
 * 2. **Grace Period**: When refCount reaches 0, we wait 5 seconds before disposal.
 *    This prevents thrashing during rapid component mount/unmount cycles (e.g.,
 *    tab switching). If re-acquired during grace period, disposal is cancelled.
 *
 * 3. **Path Normalization**: Trailing slashes are removed so "/project" and
 *    "/project/" map to the same instance.
 *
 * Usage:
 * ```typescript
 * // In a React hook or component
 * const service = FileSystemV2APIService.getInstance();
 *
 * // Acquire instance (refCount: 0 → 1)
 * const api = service.acquire('/path/to/project');
 *
 * // Use the API
 * const files = await api.readDirectory('/path/to/project/src');
 *
 * // Release when done (refCount: 1 → 0, starts grace period)
 * service.release('/path/to/project');
 *
 * // After 5 seconds with no re-acquire, instance is disposed
 * ```
 *
 * @see FileSystemProviderService - Backend equivalent with same pattern
 * @see useFileSystemV2 - React hook that wraps this service
 */

import { FileSystemV2API } from "../api/FileSystemV2API";

// ============================================================================
// Types
// ============================================================================

/**
 * Internal tracking for a managed FileSystemV2API instance.
 *
 * Each unique cwd gets one ManagedInstance that tracks:
 * - The actual API instance
 * - How many components are currently using it (refCount)
 * - Whether it's scheduled for disposal (disposeTimer)
 */
interface ManagedInstance {
  /** The FileSystemV2API instance for this cwd */
  api: FileSystemV2API;

  /** Number of active references (components using this instance) */
  refCount: number;

  /** Timer for grace period disposal (set when refCount reaches 0) */
  disposeTimer?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Constants
// ============================================================================

/** Grace period before disposing unused instances (matches backend) */
const GRACE_PERIOD_MS = 5000;

// ============================================================================
// Service
// ============================================================================

/**
 * Singleton service for managing shared FileSystemV2API instances.
 */
export class FileSystemV2APIService {
  private static instance: FileSystemV2APIService | null = null;

  /** Map of cwd → managed instance */
  private instances = new Map<string, ManagedInstance>();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton service instance.
   */
  static getInstance(): FileSystemV2APIService {
    if (!FileSystemV2APIService.instance) {
      FileSystemV2APIService.instance = new FileSystemV2APIService();
    }
    return FileSystemV2APIService.instance;
  }

  /**
   * Reset the singleton instance.
   * Primarily for testing - disposes all instances and clears state.
   */
  static resetInstance(): void {
    if (FileSystemV2APIService.instance) {
      FileSystemV2APIService.instance.disposeAll();
      FileSystemV2APIService.instance = null;
    }
  }

  /**
   * Acquire an API instance for the given cwd.
   *
   * - If an instance exists, increments refCount and returns it
   * - If instance is in grace period, cancels disposal timer
   * - If no instance exists, creates a new one
   *
   * @param cwd - Working directory to scope operations to
   * @returns The FileSystemV2API instance
   */
  acquire(cwd: string): FileSystemV2API {
    const normalizedCwd = this.normalizePath(cwd);
    const existing = this.instances.get(normalizedCwd);

    if (existing) {
      // Cancel any pending disposal
      if (existing.disposeTimer) {
        clearTimeout(existing.disposeTimer);
        existing.disposeTimer = undefined;
      }

      existing.refCount++;
      return existing.api;
    }

    // Create new instance
    const api = new FileSystemV2API(cwd);
    this.instances.set(normalizedCwd, {
      api,
      refCount: 1,
    });

    return api;
  }

  /**
   * Release a reference to an API instance.
   *
   * Decrements refCount. When refCount reaches 0, starts a grace period
   * timer. If not re-acquired during grace period, the instance is disposed.
   *
   * @param cwd - Working directory of the instance to release
   */
  release(cwd: string): void {
    const normalizedCwd = this.normalizePath(cwd);
    const managed = this.instances.get(normalizedCwd);

    if (!managed) {
      // Already disposed or never existed - not an error
      return;
    }

    managed.refCount--;

    if (managed.refCount <= 0) {
      // Start grace period
      managed.disposeTimer = setTimeout(() => {
        this.dispose(normalizedCwd);
      }, GRACE_PERIOD_MS);
    }
  }

  /**
   * Get the current reference count for a cwd.
   * Useful for debugging and testing.
   *
   * @param cwd - Working directory to check
   * @returns Reference count, or 0 if no instance exists
   */
  getRefCount(cwd: string): number {
    const normalizedCwd = this.normalizePath(cwd);
    return this.instances.get(normalizedCwd)?.refCount ?? 0;
  }

  /**
   * Check if an instance exists for a cwd (even if in grace period).
   *
   * @param cwd - Working directory to check
   * @returns True if instance exists
   */
  hasInstance(cwd: string): boolean {
    const normalizedCwd = this.normalizePath(cwd);
    return this.instances.has(normalizedCwd);
  }

  /**
   * Get statistics about managed instances.
   * Useful for debugging.
   */
  getStats(): { instanceCount: number; totalRefCount: number } {
    let totalRefCount = 0;
    for (const managed of this.instances.values()) {
      totalRefCount += managed.refCount;
    }
    return {
      instanceCount: this.instances.size,
      totalRefCount,
    };
  }

  /**
   * Dispose a specific instance immediately.
   */
  private dispose(normalizedCwd: string): void {
    const managed = this.instances.get(normalizedCwd);
    if (!managed) {
      return;
    }

    // Clear any pending timer
    if (managed.disposeTimer) {
      clearTimeout(managed.disposeTimer);
    }

    // Release the API instance
    managed.api.release();

    // Remove from map
    this.instances.delete(normalizedCwd);
  }

  /**
   * Dispose all instances immediately.
   * Used during service reset.
   */
  private disposeAll(): void {
    for (const [cwd] of this.instances) {
      this.dispose(cwd);
    }
  }

  /**
   * Normalize a path for consistent map keys.
   * Removes trailing slashes.
   */
  private normalizePath(path: string): string {
    return path.replace(/\/+$/, "");
  }
}
