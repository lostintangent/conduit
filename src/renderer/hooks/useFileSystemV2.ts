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
 * The returned API instance is shared across all components using the same cwd.
 * When cwd changes, the old reference is released and a new one is acquired.
 * On unmount, the reference is released (instance may be kept alive by other users).
 *
 * @param cwd - Working directory to scope operations to
 * @returns FileSystemV2API instance (shared)
 */
export function useFileSystemV2(cwd: string): FileSystemV2API {
  const service = FileSystemV2APIService.getInstance();

  // Normalize path to match service's normalization
  const normalizedCwd = normalizePath(cwd);

  // Use ref to hold the API instance - avoids recreating on every render
  const apiRef = useRef<FileSystemV2API | null>(null);

  // Track the CWD we acquired (for releasing the correct one)
  const acquiredCwdRef = useRef<string | null>(null);

  // Acquire instance or re-acquire if CWD changed
  if (apiRef.current === null || acquiredCwdRef.current !== normalizedCwd) {
    // Release previous reference if we had one
    if (acquiredCwdRef.current !== null) {
      service.release(acquiredCwdRef.current);
    }

    // Acquire new instance via service
    apiRef.current = service.acquire(normalizedCwd);
    acquiredCwdRef.current = normalizedCwd;
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Release our reference via service
      if (acquiredCwdRef.current !== null) {
        service.release(acquiredCwdRef.current);
        acquiredCwdRef.current = null;
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
  DirectoryListingChangedCallback,
  FileContentChangedCallback,
  FileDeletedCallback,
  FileRenamedCallback,
  Cleanup,
} from "../api/FileSystemV2API";

export { FileSystemV2API } from "../api/FileSystemV2API";
