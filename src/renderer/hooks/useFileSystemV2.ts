/**
 * React Hook for FileSystem v2 API
 *
 * Provides a convenient way to use the FileSystemV2API in React components.
 * Uses FileSystemV2APIService to share instances across components with the
 * same cwd, reducing duplicate IPC subscriptions.
 *
 * @example
 * ```tsx
 * function FileExplorer({ projectPath }: { projectPath: string }) {
 *   const fs = useFileSystemV2(projectPath);
 *
 *   const [entries, setEntries] = useState<DirectoryEntry[]>([]);
 *
 *   useEffect(() => {
 *     // Load directory contents
 *     fs.readDirectory(projectPath).then(setEntries);
 *
 *     // Subscribe to changes
 *     const cleanup = fs.onDirectoryListingChanged(projectPath, setEntries);
 *     return cleanup;
 *   }, [fs, projectPath]);
 *
 *   return <ul>{entries.map(e => <li key={e.name}>{e.name}</li>)}</ul>;
 * }
 * ```
 */

import { useEffect, useRef } from "react";
import { FileSystemV2API } from "../api/FileSystemV2API";
import { FileSystemV2APIService } from "../services/FileSystemV2APIService";

/**
 * Normalize a path for consistent comparison.
 * Removes trailing slashes to match service normalization.
 */
function normalizePath(path: string): string {
  return path.replace(/\/+$/, "");
}

/**
 * Hook to acquire a shared FileSystemV2API instance.
 *
 * The returned API instance is shared across all components using the same cwd
 * and sandboxId combination. When cwd or sandboxId changes, the old reference is released
 * and a new one is acquired. On unmount, the reference is released (instance may
 * be kept alive by other users).
 *
 * @param cwd - Working directory to scope operations to
 * @param sandboxId - Optional sandbox ID for cloud VM operations
 * @returns FileSystemV2API instance (shared)
 */
export function useFileSystemV2(
  cwd: string,
  sandboxId?: string,
): FileSystemV2API {
  const service = FileSystemV2APIService.getInstance();

  // Normalize path to match service's normalization
  const normalizedCwd = normalizePath(cwd);

  // Create a key for tracking (includes sandboxId if present)
  const key = sandboxId ? `${normalizedCwd}::vm:${sandboxId}` : normalizedCwd;

  // Use ref to hold the API instance - avoids recreating on every render
  const apiRef = useRef<FileSystemV2API | null>(null);

  // Track the key we acquired (for releasing the correct one)
  const acquiredKeyRef = useRef<{ cwd: string; sandboxId?: string } | null>(
    null,
  );

  // Acquire instance or re-acquire if key changed
  const currentKey = acquiredKeyRef.current
    ? acquiredKeyRef.current.sandboxId
      ? `${normalizePath(acquiredKeyRef.current.cwd)}::vm:${acquiredKeyRef.current.sandboxId}`
      : normalizePath(acquiredKeyRef.current.cwd)
    : null;

  if (apiRef.current === null || currentKey !== key) {
    // Release previous reference if we had one
    if (acquiredKeyRef.current !== null) {
      service.release(
        acquiredKeyRef.current.cwd,
        acquiredKeyRef.current.sandboxId,
      );
    }

    // Acquire new instance via service
    apiRef.current = service.acquire(normalizedCwd, sandboxId);
    acquiredKeyRef.current = { cwd: normalizedCwd, sandboxId };
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Release our reference via service
      if (acquiredKeyRef.current !== null) {
        service.release(
          acquiredKeyRef.current.cwd,
          acquiredKeyRef.current.sandboxId,
        );
        acquiredKeyRef.current = null;
        apiRef.current = null;
      }
    };
  }, []); // Empty deps - only runs on unmount

  // Return the current API instance
  return apiRef.current;
}

/**
 * Re-export types for convenience
 */
export type {
  Cleanup,
  DirectoryListingChangedCallback,
  FileContentChangedCallback,
  FileDeletedCallback,
  FileRenamedCallback,
} from "../api/FileSystemV2API";

export { FileSystemV2API } from "../api/FileSystemV2API";
