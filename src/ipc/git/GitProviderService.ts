/**
 * GitProviderService - Lifecycle management for git providers.
 *
 * Unlike FileSystemProviderService, which is CWD-scoped, this service is
 * repository-scoped: multiple CWDs within the same git repository share a
 * single provider instance.
 *
 * Providers are ref-counted by ProviderPool, which also owns the grace
 * period. This service adds git root discovery and receives file change
 * events from FileSystemProviderService to trigger status refreshes.
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
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ProviderPool } from "../ProviderPool";
import { createGit } from "./createGit";
import { DiskGitProvider } from "./DiskGitProvider";

export class GitProviderService {
  private static instance: GitProviderService | null = null;

  static getInstance(): GitProviderService {
    GitProviderService.instance ??= new GitProviderService();
    return GitProviderService.instance;
  }

  /** Dispose all providers and clear the singleton (for testing only). */
  static resetInstance(): void {
    GitProviderService.instance?.pool.disposeAll();
    GitProviderService.instance = null;
  }

  /** Providers keyed by git root */
  private pool = new ProviderPool<DiskGitProvider>("GitProviderService", {
    dispose: (provider) => provider.dispose(),
  });

  /** Cached result of git availability check */
  private gitAvailableCache: boolean | undefined = undefined;

  private constructor() {}

  /**
   * Acquire the git provider for the repository containing `cwd`.
   *
   * @returns The provider and its git root, which is the key to pass to
   *   `releaseProvider`
   * @throws If the directory is not within a git repository
   */
  async getProvider(
    cwd: string,
  ): Promise<{ provider: DiskGitProvider; gitRoot: string }> {
    const gitRoot = await this.findGitRoot(cwd);

    if (!gitRoot) {
      throw new Error(`Not a git repository: ${cwd}`);
    }

    const provider = await this.pool.acquire(gitRoot, async (resolvedRoot) => {
      const provider = new DiskGitProvider(resolvedRoot, cwd);
      await provider.startWatching();
      return provider;
    });
    return { provider, gitRoot };
  }

  /** Release a reference, starting the grace period when it was the last. */
  releaseProvider(gitRoot: string): void {
    this.pool.release(gitRoot);
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
   * Get an existing provider without incrementing reference count.
   *
   * Use this for operations that rely on an active subscription holding
   * the provider reference. Returns null if no provider exists.
   *
   * @param gitRoot - The git repository root path
   * @returns The provider if it exists, null otherwise
   */
  getExistingProvider(gitRoot: string): DiskGitProvider | null {
    return this.pool.get(gitRoot) ?? null;
  }

  /**
   * Get an existing provider by cwd without incrementing reference count.
   *
   * Finds the git root for the cwd and returns the provider if one exists.
   * Use this for operations that rely on an active subscription holding
   * the provider reference.
   *
   * @param cwd - The working directory (any directory within a git repo)
   * @returns The provider and git root if they exist, null otherwise
   */
  async getExistingProviderByCwd(
    cwd: string,
  ): Promise<{ provider: DiskGitProvider; gitRoot: string } | null> {
    const gitRoot = await this.findGitRoot(cwd);

    if (!gitRoot) {
      return null;
    }

    const provider = this.pool.get(gitRoot);
    return provider ? { provider, gitRoot } : null;
  }

  /**
   * Notify that a file has changed in the working directory.
   *
   * This is called by FileSystemProviderService when files are modified.
   * If the file is within a git repository with an active provider,
   * it will trigger a status refresh.
   *
   * @param filePath - The absolute path to the changed file
   */
  async notifyFileChanged(filePath: string): Promise<void> {
    const gitRoot = await this.findGitRoot(filePath);

    if (!gitRoot) {
      // File is not in a git repository - silently ignore
      return;
    }

    // Silently ignore files in repos without active providers
    this.pool.get(gitRoot)?.triggerStatusRefresh();
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
      const git = createGit();
      await git.version();
      this.gitAvailableCache = true;
      return true;
    } catch {
      this.gitAvailableCache = false;
      return false;
    }
  }
}
