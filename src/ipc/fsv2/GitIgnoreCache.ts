/**
 * GitIgnoreCache - Shared cache for gitignore lookups using the `ignore` npm package.
 *
 * Provides efficient gitignore matching with:
 * - Pure JavaScript regex matching (no git process spawning)
 * - Cached matchers per git root
 * - Support for nested .gitignore files (discovered during traversal)
 * - Automatic invalidation when .gitignore changes
 *
 * This is a singleton used by both handlers.ts (direct reads) and
 * DiskFileSystemProvider (subscription-based reads).
 */

import ignore, { type Ignore } from "ignore";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// GitIgnoreCache
// ============================================================================

class GitIgnoreCacheImpl {
  /**
   * Cache of directory path -> git root path (or null if not in a repo).
   * This rarely changes, so we cache indefinitely.
   */
  private gitRootCache = new Map<string, string | null>();

  /**
   * Cache of git root -> ignore matcher instance.
   * The matcher contains all rules from .gitignore files in that repo.
   */
  private matcherCache = new Map<string, Ignore>();

  /**
   * Tracks which .gitignore files have been loaded for each git root.
   * Key: gitRoot, Value: Set of .gitignore file paths that have been loaded.
   */
  private loadedGitignoreFiles = new Map<string, Set<string>>();

  // -------------------------------------------------------------------------
  // Git Root Lookup
  // -------------------------------------------------------------------------

  /**
   * Find the git root for a directory, with caching.
   */
  async getGitRoot(dirPath: string): Promise<string | null> {
    const normalized = path.resolve(dirPath);

    // Check cache
    if (this.gitRootCache.has(normalized)) {
      return this.gitRootCache.get(normalized) ?? null;
    }

    // Find git root
    const gitRoot = await this.findGitRoot(normalized);
    this.gitRootCache.set(normalized, gitRoot);

    // Also cache all parent directories up to git root
    if (gitRoot) {
      let current = path.dirname(normalized);
      while (current.length >= gitRoot.length) {
        this.gitRootCache.set(current, gitRoot);
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }

    return gitRoot;
  }

  private findGitRoot(dirPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const child = spawn("git", ["rev-parse", "--show-toplevel"], {
          cwd: dirPath,
          stdio: ["ignore", "pipe", "ignore"],
        });

        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
        });

        child.once("error", () => {
          resolve(null);
        });

        child.once("close", (code) => {
          if (code === 0 && output.trim()) {
            resolve(output.trim());
          } else {
            resolve(null);
          }
        });
      } catch {
        // Handle spawn errors (e.g., ENOTDIR when cwd doesn't exist)
        resolve(null);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Ignore Matcher Management
  // -------------------------------------------------------------------------

  /**
   * Get or create the ignore matcher for a git root.
   * Automatically loads the root .gitignore if not already loaded.
   */
  private async getOrCreateMatcher(gitRoot: string): Promise<Ignore> {
    let matcher = this.matcherCache.get(gitRoot);
    if (!matcher) {
      matcher = ignore();
      this.matcherCache.set(gitRoot, matcher);
      this.loadedGitignoreFiles.set(gitRoot, new Set());

      // Load root .gitignore
      await this.loadGitignoreFile(gitRoot, path.join(gitRoot, ".gitignore"));
    }
    return matcher;
  }

  /**
   * Load a .gitignore file and add its rules to the matcher.
   * Rules are prefixed with the relative directory path to handle nested .gitignore files.
   */
  private async loadGitignoreFile(
    gitRoot: string,
    gitignorePath: string,
  ): Promise<void> {
    const loadedFiles = this.loadedGitignoreFiles.get(gitRoot);
    if (!loadedFiles || loadedFiles.has(gitignorePath)) {
      return; // Already loaded
    }

    try {
      // Check if file exists before reading (async stat)
      await fsPromises.access(gitignorePath, fs.constants.R_OK);
    } catch {
      return; // File doesn't exist or isn't readable
    }

    try {
      const content = await fsPromises.readFile(gitignorePath, "utf-8");
      const matcher = this.matcherCache.get(gitRoot);
      if (!matcher) return;

      // Get the directory containing this .gitignore relative to git root
      const gitignoreDir = path.dirname(gitignorePath);
      const relativeDir = path.relative(gitRoot, gitignoreDir);

      // Parse and prefix rules for nested .gitignore files
      const rules = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));

      if (relativeDir) {
        // Nested .gitignore - prefix rules with the relative directory
        const prefixedRules = rules.map((rule) => {
          // Handle negation patterns
          if (rule.startsWith("!")) {
            const pattern = rule.slice(1);
            return `!${relativeDir}/${pattern}`;
          }
          return `${relativeDir}/${rule}`;
        });
        matcher.add(prefixedRules);
      } else {
        // Root .gitignore - add rules as-is
        matcher.add(rules);
      }

      loadedFiles.add(gitignorePath);
    } catch {
      // Ignore read errors
    }
  }

  // -------------------------------------------------------------------------
  // Gitignore Checking
  // -------------------------------------------------------------------------

  /**
   * Check if entries are gitignored using the ignore package (no git spawning).
   * Returns a Set of entry names that are ignored.
   *
   * @param dirPath - Directory containing the entries
   * @param entries - Entries to check, with name and whether they're directories
   * @param gitRoot - Optional pre-resolved git root (avoids lookup if provided)
   */
  async getIgnoredEntries(
    dirPath: string,
    entries: Array<{ name: string; isDirectory: boolean }>,
    gitRoot?: string | null,
  ): Promise<Set<string>> {
    // Use provided git root or look it up
    const resolvedGitRoot =
      gitRoot !== undefined ? gitRoot : await this.getGitRoot(dirPath);
    if (!resolvedGitRoot) {
      return new Set();
    }

    // Get the matcher (creates one if needed, loads root .gitignore)
    const matcher = await this.getOrCreateMatcher(resolvedGitRoot);

    // Check for .gitignore in this directory and load if present
    const localGitignore = path.join(dirPath, ".gitignore");
    await this.loadGitignoreFile(resolvedGitRoot, localGitignore);

    // Get relative path from git root to this directory
    const relativeDir = path.relative(resolvedGitRoot, dirPath);

    // Check each entry
    const ignored = new Set<string>();
    for (const { name, isDirectory } of entries) {
      // Build the relative path from git root
      // Add trailing slash for directories - required by ignore library for patterns like "dir/"
      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
      const pathToCheck = isDirectory ? `${relativePath}/` : relativePath;

      if (matcher.ignores(pathToCheck)) {
        ignored.add(name);
      }
    }

    return ignored;
  }

  /**
   * Check if a single path is ignored (synchronous, for watcher filtering).
   * Requires git root to be pre-resolved.
   *
   * Note: This uses only the currently loaded .gitignore rules. If the file
   * is in a directory that hasn't been traversed yet, nested .gitignore files
   * for that directory won't be loaded. This is acceptable for watcher filtering
   * since we err on the side of not filtering (showing events for potentially
   * ignored files is better than missing events for non-ignored files).
   *
   * @param gitRoot - The git root directory
   * @param filePath - Absolute path to check
   * @returns true if the path is ignored
   */
  isIgnored(gitRoot: string, filePath: string): boolean {
    const relativePath = path.relative(gitRoot, filePath);
    if (relativePath.startsWith("..")) {
      return false;
    }

    // Get existing matcher only (don't create if it doesn't exist)
    // This is synchronous and only uses already-loaded rules
    const matcher = this.matcherCache.get(gitRoot);
    if (!matcher) {
      // No matcher loaded yet, assume not ignored
      return false;
    }
    return matcher.ignores(relativePath);
  }

  // -------------------------------------------------------------------------
  // Cache Invalidation
  // -------------------------------------------------------------------------

  /**
   * Invalidate gitignore cache when .gitignore changes (created/modified/deleted).
   * Rebuilds the matcher for the affected git root.
   *
   * @param gitignorePath - Path to the .gitignore file that changed
   */
  invalidateForGitignore(gitignorePath: string): void {
    const gitignoreDir = path.dirname(gitignorePath);

    // Find the git root for this .gitignore
    const gitRoot = this.gitRootCache.get(gitignoreDir);

    if (gitRoot) {
      // Clear the matcher and loaded files - will be rebuilt on next access
      this.matcherCache.delete(gitRoot);
      this.loadedGitignoreFiles.delete(gitRoot);
    } else {
      // If we don't know the git root, clear everything to be safe
      this.matcherCache.clear();
      this.loadedGitignoreFiles.clear();
    }
  }

  /**
   * Clear all caches.
   */
  clear(): void {
    this.gitRootCache.clear();
    this.matcherCache.clear();
    this.loadedGitignoreFiles.clear();
  }

  /**
   * Get cache statistics for debugging.
   */
  getStats(): {
    gitRootEntries: number;
    matcherCount: number;
    loadedGitignoreFiles: number;
  } {
    let totalLoadedFiles = 0;
    for (const files of this.loadedGitignoreFiles.values()) {
      totalLoadedFiles += files.size;
    }
    return {
      gitRootEntries: this.gitRootCache.size,
      matcherCount: this.matcherCache.size,
      loadedGitignoreFiles: totalLoadedFiles,
    };
  }
}

// Singleton instance
export const GitIgnoreCache = new GitIgnoreCacheImpl();
