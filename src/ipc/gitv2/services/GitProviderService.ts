/**
 * GitProviderService - Lifecycle management for git providers.
 *
 * This service manages DiskGitProvider instances with reference counting
 * and graceful disposal. Unlike FileSystemProviderService which is
 * CWD-scoped, this service is repository-scoped - multiple CWDs within
 * the same git repository share a single provider instance.
 *
 * Key Features:
 * 1. **Repository-Scoped**: Providers are keyed by git root, not CWD
 * 2. **Git Root Discovery**: Automatically finds the repository root
 * 3. **Reference Counting**: Tracks how many consumers use each provider
 * 4. **Grace Period**: 5-second delay before disposing unused providers
 *
 * Usage Pattern:
 * ```typescript
 * const service = GitProviderService.getInstance();
 *
 * // Get provider for a directory (finds git root automatically)
 * const provider = await service.getProvider('/project/src/components');
 * // Returns provider for /project (the git root)
 *
 * // Release when done
 * service.releaseProvider('/project'); // Use the gitRoot, not cwd
 * ```
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { simpleGit } from "simple-git";
import { DiskGitProvider } from "../providers/DiskGitProvider";

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
  /** The git provider instance */
  provider: DiskGitProvider;

  /** Current number of active references */
  refCount: number;

  /** Pending disposal timer (set when refCount reaches 0) */
  disposeTimer?: NodeJS.Timeout;
}

// ============================================================================
// GitProviderService
// ============================================================================

/**
 * Service for managing git provider lifecycles.
 *
 * This is a singleton service that should be accessed via `getInstance()`.
 * It handles provider creation, reference counting, and graceful disposal.
 *
 * @example
 * ```typescript
 * const service = GitProviderService.getInstance();
 *
 * // Get provider for any directory within a repo
 * const provider = await service.getProvider('/project/src');
 *
 * // Same repo returns same instance
 * const provider2 = await service.getProvider('/project/tests');
 * console.log(provider === provider2); // true (same git root)
 *
 * // Release references (use the gitRoot)
 * service.releaseProvider('/project');
 * service.releaseProvider('/project');
 *
 * // After 5 seconds with no references, provider is disposed
 * ```
 */
export class GitProviderService {
  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------

  private static instance: GitProviderService | null = null;

  /**
   * Get the singleton instance of the service.
   */
  static getInstance(): GitProviderService {
    if (!GitProviderService.instance) {
      GitProviderService.instance = new GitProviderService();
    }
    return GitProviderService.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   *
   * This disposes all providers and clears the singleton.
   * Should only be used in test cleanup.
   */
  static resetInstance(): void {
    if (GitProviderService.instance) {
      GitProviderService.instance.disposeAll();
      GitProviderService.instance = null;
    }
  }

  // -------------------------------------------------------------------------
  // Internal State
  // -------------------------------------------------------------------------

  /** Map of git roots to provider entries */
  private providers = new Map<string, ProviderEntry>();

  /** Cached result of git availability check */
  private gitAvailableCache: boolean | undefined = undefined;

  /** Private constructor - use getInstance() */
  private constructor() {}

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /**
   * Get a git provider for the specified directory.
   *
   * Automatically finds the git repository root containing the directory.
   * If a provider already exists for this repository, the reference count
   * is incremented and the existing provider is returned.
   *
   * @param cwd - The working directory (any directory within a git repo)
   * @returns The git provider instance and the git root path
   * @throws If the directory is not within a git repository
   */
  async getProvider(
    cwd: string,
  ): Promise<{ provider: DiskGitProvider; gitRoot: string }> {
    const gitRoot = await this.findGitRoot(cwd);

    if (!gitRoot) {
      throw new Error(`Not a git repository: ${cwd}`);
    }

    const normalizedRoot = this.normalizePath(gitRoot);
    const existing = this.providers.get(normalizedRoot);

    if (existing) {
      // Cancel any pending disposal
      if (existing.disposeTimer) {
        clearTimeout(existing.disposeTimer);
        existing.disposeTimer = undefined;
      }

      // Increment reference count
      existing.refCount++;

      return { provider: existing.provider, gitRoot: normalizedRoot };
    }

    // Create new provider
    const provider = new DiskGitProvider(normalizedRoot, cwd);

    // Start watching for git changes
    await provider.startWatching();

    // Store entry with initial refCount of 1
    this.providers.set(normalizedRoot, {
      provider,
      refCount: 1,
    });

    return { provider, gitRoot: normalizedRoot };
  }

  /**
   * Release a reference to a git provider.
   *
   * Decrements the reference count for the provider at the specified git root.
   * When the count reaches zero, a grace period timer is started. If no new
   * references are acquired within the grace period, the provider is disposed.
   *
   * @param gitRoot - The git repository root path
   */
  releaseProvider(gitRoot: string): void {
    const normalizedRoot = this.normalizePath(gitRoot);
    const entry = this.providers.get(normalizedRoot);

    if (!entry) {
      console.warn(
        `[GitProviderService] Attempted to release unknown provider: ${normalizedRoot}`,
      );
      return;
    }

    // Decrement reference count
    entry.refCount--;

    if (entry.refCount <= 0) {
      // Start grace period timer
      entry.disposeTimer = setTimeout(() => {
        this.disposeProvider(normalizedRoot);
      }, DISPOSE_GRACE_PERIOD_MS);
    }
  }

  /**
   * Immediately dispose a provider without waiting for grace period.
   *
   * This is primarily useful for testing or forced cleanup scenarios.
   *
   * @param gitRoot - The git repository root path
   */
  async forceDispose(gitRoot: string): Promise<void> {
    const normalizedRoot = this.normalizePath(gitRoot);
    await this.disposeProvider(normalizedRoot);
  }

  /**
   * Find the git repository root for a given path.
   *
   * Walks up the directory tree looking for a .git directory or file.
   *
   * @param startPath - The starting directory path
   * @returns The git root path, or null if not in a git repository
   */
  async findGitRoot(startPath: string): Promise<string | null> {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      const gitPath = path.join(currentPath, ".git");

      try {
        await fs.promises.access(gitPath);
        return currentPath;
      } catch {
        // .git doesn't exist at this level, go up
        currentPath = path.dirname(currentPath);
      }
    }

    // Check root directory as well
    const rootGitPath = path.join(root, ".git");
    try {
      await fs.promises.access(rootGitPath);
      return root;
    } catch {
      return null;
    }
  }

  /**
   * Get the current reference count for a provider.
   *
   * Returns 0 if no provider exists for the path.
   *
   * @param gitRoot - The git repository root path
   * @returns The current reference count
   */
  getRefCount(gitRoot: string): number {
    const normalizedRoot = this.normalizePath(gitRoot);
    const entry = this.providers.get(normalizedRoot);
    return entry?.refCount ?? 0;
  }

  /**
   * Check if a provider exists for the given git root.
   *
   * @param gitRoot - The git repository root path
   * @returns True if a provider exists (regardless of refCount)
   */
  hasProvider(gitRoot: string): boolean {
    const normalizedRoot = this.normalizePath(gitRoot);
    return this.providers.has(normalizedRoot);
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

    for (const [gitRoot, entry] of this.providers) {
      stats.set(gitRoot, {
        refCount: entry.refCount,
        hasPendingDispose: entry.disposeTimer !== null,
      });
    }

    return { providers: stats };
  }

  /**
   * Check if git is available on the system.
   *
   * Tests by running `git --version`. Result is cached for performance.
   *
   * @returns True if git is installed and accessible
   */
  async isGitAvailable(): Promise<boolean> {
    // Use cached result if available
    if (this.gitAvailableCache !== undefined) {
      return this.gitAvailableCache;
    }

    try {
      const git = simpleGit();
      await git.version();
      this.gitAvailableCache = true;
      return true;
    } catch {
      this.gitAvailableCache = false;
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Internal Methods
  // -------------------------------------------------------------------------

  /**
   * Normalize a path for consistent lookup.
   */
  private normalizePath(filePath: string): string {
    return path.resolve(filePath);
  }

  /**
   * Dispose a provider and remove it from the map.
   */
  private async disposeProvider(normalizedRoot: string): Promise<void> {
    const entry = this.providers.get(normalizedRoot);

    if (!entry) {
      return;
    }

    // Clear any pending timer
    if (entry.disposeTimer) {
      clearTimeout(entry.disposeTimer);
    }

    // Remove from map
    this.providers.delete(normalizedRoot);

    // Dispose the provider
    entry.provider.dispose();
  }

  /**
   * Dispose all providers (used during service shutdown/reset).
   */
  private disposeAll(): void {
    for (const [normalizedRoot, entry] of this.providers) {
      // Clear any pending timer
      if (entry.disposeTimer) {
        clearTimeout(entry.disposeTimer);
      }

      // Dispose provider
      try {
        entry.provider.dispose();
      } catch (error) {
        console.error(
          `[GitProviderService] Error disposing provider ${normalizedRoot}:`,
          error,
        );
      }
    }

    this.providers.clear();
  }
}
