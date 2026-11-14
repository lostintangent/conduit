/**
 * FileSystemProviderService - Lifecycle management for filesystem providers.
 *
 * Multiple consumers of the same directory share one ref-counted
 * DiskFileSystemProvider (see ProviderPool for the grace period and path
 * normalization).
 *
 * Git integration: while a provider is referenced, it forwards file content
 * changes to GitProviderService and holds a git provider reference for its
 * repository, so git status refreshes when files change. Both are released
 * as soon as the last reference goes, rather than after the grace period.
 *
 * Usage Pattern:
 * ```typescript
 * const service = FileSystemProviderService.getInstance();
 *
 * // Acquire a provider (creates new or increments refCount)
 * const provider = await service.getProvider('/project/src');
 *
 * // Release when done (decrements refCount, may start grace timer)
 * service.releaseProvider('/project/src');
 * ```
 */

import * as fs from "node:fs";
import { GitProviderService } from "@features/git/main/GitProviderService";
import { ProviderPool } from "../../../ipc/ProviderPool";
import { DiskFileSystemProvider } from "./DiskFileSystemProvider";

interface ProviderEntry {
  provider: DiskFileSystemProvider;

  /** Forwards file content changes to GitProviderService */
  fileChangeDisposable?: { dispose: () => void };

  /** Git root this provider holds a git provider reference for */
  gitRoot?: string;
}

function forwardFileChangesToGit(entry: ProviderEntry): void {
  entry.fileChangeDisposable ??= entry.provider.onFileContentChanged(
    (event) => {
      GitProviderService.getInstance()
        .notifyFileChanged(event.path)
        .catch(() => {
          // Silently ignore errors - git notification is best-effort
        });
    },
  );
}

async function acquireGitProvider(
  entry: ProviderEntry,
  cwd: string,
): Promise<void> {
  try {
    const result = await GitProviderService.getInstance().getProvider(cwd);
    entry.gitRoot = result.gitRoot;
  } catch {
    // Not in a git repo - no git integration needed
  }
}

function detachFromGit(entry: ProviderEntry): void {
  entry.fileChangeDisposable?.dispose();
  entry.fileChangeDisposable = undefined;
  if (entry.gitRoot) {
    GitProviderService.getInstance().releaseProvider(entry.gitRoot);
    entry.gitRoot = undefined;
  }
}

export class FileSystemProviderService {
  private static instance: FileSystemProviderService | null = null;

  static getInstance(): FileSystemProviderService {
    FileSystemProviderService.instance ??= new FileSystemProviderService();
    return FileSystemProviderService.instance;
  }

  /** Dispose all providers and clear the singleton (for testing only). */
  static resetInstance(): void {
    FileSystemProviderService.instance?.pool.disposeAll();
    FileSystemProviderService.instance = null;
  }

  private pool = new ProviderPool<ProviderEntry>("FileSystemProviderService", {
    onIdle: detachFromGit,
    onRevive: (entry, cwd) => {
      forwardFileChangesToGit(entry);
      if (!entry.gitRoot) {
        void acquireGitProvider(entry, cwd);
      }
    },
    dispose: async (entry) => {
      detachFromGit(entry);
      await entry.provider.dispose();
    },
  });

  private constructor() {}

  /**
   * Acquire a filesystem provider for the specified directory, which starts
   * a recursive watcher on it.
   *
   * Used by subscriptions, and briefly by directory listings and writes when
   * no subscription holds one. Plain reads never acquire a provider.
   */
  async getProvider(cwd: string): Promise<DiskFileSystemProvider> {
    const entry = await this.pool.acquire(cwd, async (resolvedPath) => {
      // Don't attempt to watch paths that don't exist locally
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(
          `Cannot create local filesystem provider for non-existent path: ${resolvedPath}.`,
        );
      }

      const entry: ProviderEntry = {
        provider: new DiskFileSystemProvider(resolvedPath),
      };
      await entry.provider.startWatching();
      forwardFileChangesToGit(entry);
      await acquireGitProvider(entry, resolvedPath);
      return entry;
    });
    return entry.provider;
  }

  /** Release a reference, starting the grace period when it was the last. */
  releaseProvider(cwd: string): void {
    this.pool.release(cwd);
  }

  /** Get an existing provider without incrementing its reference count. */
  getExistingProvider(cwd: string): DiskFileSystemProvider | null {
    return this.pool.get(cwd)?.provider ?? null;
  }
}
