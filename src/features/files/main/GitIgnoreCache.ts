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
import * as path from "node:path";
import {
  isPathOutside,
  normalizePathForComparison,
  safeRelativePath,
  toCallerPath,
} from "./pathUtils";

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
   * Normalize a path for cache key (case-insensitive on macOS/Windows).
   */
  private normalizeCacheKey(filePath: string): string {
    return normalizePathForComparison(path.resolve(filePath));
  }

  /**
   * Find the git root for a directory, with caching.
   */
  async getGitRoot(dirPath: string): Promise<string | null> {
    const cacheKey = this.normalizeCacheKey(dirPath);

    // Check cache
    if (this.gitRootCache.has(cacheKey)) {
      return this.gitRootCache.get(cacheKey) ?? null;
    }

    // Find git root
    const resolved = path.resolve(dirPath);
    const toplevel = await this.findGitRoot(resolved);
    const gitRoot = toplevel && (await toCallerPath(toplevel, resolved));
    this.gitRootCache.set(cacheKey, gitRoot);

    // Also cache all parent directories up to git root
    if (gitRoot) {
      let current = path.dirname(resolved);
      while (current.length >= gitRoot.length) {
        this.gitRootCache.set(this.normalizeCacheKey(current), gitRoot);
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
  private getOrCreateMatcher(gitRoot: string): Ignore {
    // Normalize git root for case-insensitive cache key on macOS/Windows
    const normalizedRoot = normalizePathForComparison(gitRoot);

    let matcher = this.matcherCache.get(normalizedRoot);
    if (!matcher) {
      matcher = ignore();
      this.matcherCache.set(normalizedRoot, matcher);
      this.loadedGitignoreFiles.set(normalizedRoot, new Set());

      // Load root .gitignore (use original gitRoot for filesystem access)
      this.loadGitignoreFile(
        normalizedRoot,
        gitRoot,
        path.join(gitRoot, ".gitignore"),
      );
    }
    return matcher;
  }

  /**
   * Load a .gitignore file and add its rules to the matcher.
   * Rules are prefixed with the relative directory path to handle nested .gitignore files.
   *
   * @param normalizedRoot - Normalized cache key for lookups (case-insensitive on macOS/Windows)
   * @param originalGitRoot - Original git root path for filesystem operations
   * @param gitignorePath - Path to the .gitignore file to load
   */
  private loadGitignoreFile(
    normalizedRoot: string,
    originalGitRoot: string,
    gitignorePath: string,
  ): void {
    const loadedFiles = this.loadedGitignoreFiles.get(normalizedRoot);
    if (!loadedFiles || loadedFiles.has(gitignorePath)) {
      return; // Already loaded
    }

    if (!fs.existsSync(gitignorePath)) {
      return; // File doesn't exist
    }

    try {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      const matcher = this.matcherCache.get(normalizedRoot);
      if (!matcher) return;

      // Get the directory containing this .gitignore relative to git root
      const gitignoreDir = path.dirname(gitignorePath);
      const relativeDir = path.relative(originalGitRoot, gitignoreDir);

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

    // Get relative path from git root to this directory
    // Uses case-aware comparison to handle macOS/Windows case-insensitivity
    const relativeDir = safeRelativePath(resolvedGitRoot, dirPath);

    // If the directory is outside the git root, nothing is ignored
    // (path.relative returns "../.." paths which the ignore library rejects)
    if (isPathOutside(relativeDir)) {
      return new Set();
    }

    // Get the matcher (creates one if needed, loads root .gitignore)
    const matcher = this.getOrCreateMatcher(resolvedGitRoot);
    const normalizedRoot = normalizePathForComparison(resolvedGitRoot);

    // Check for .gitignore in this directory and load if present
    const localGitignore = path.join(dirPath, ".gitignore");
    this.loadGitignoreFile(normalizedRoot, resolvedGitRoot, localGitignore);

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
    // Uses case-aware comparison to handle macOS/Windows case-insensitivity
    const relativePath = safeRelativePath(gitRoot, filePath);
    if (isPathOutside(relativePath)) {
      return false;
    }

    // Get or create matcher (loads root .gitignore if needed)
    const matcher = this.getOrCreateMatcher(gitRoot);
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

    // Find the git root for this .gitignore (use normalized key for lookup)
    const cacheKey = this.normalizeCacheKey(gitignoreDir);
    const gitRoot = this.gitRootCache.get(cacheKey);

    if (gitRoot) {
      // Clear the matcher and loaded files - will be rebuilt on next access
      // Use normalized git root as key (matcherCache uses normalized keys)
      const normalizedGitRoot = normalizePathForComparison(gitRoot);
      this.matcherCache.delete(normalizedGitRoot);
      this.loadedGitignoreFiles.delete(normalizedGitRoot);
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
