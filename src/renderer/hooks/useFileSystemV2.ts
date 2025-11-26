/**
 * React Hook for FileSystem v2 API
 *
 * Provides a convenient way to use the FileSystemV2API in React components.
 * Handles lifecycle management automatically - creates API instance on mount
 * and releases it on unmount. Also handles CWD changes by releasing the old
 * instance and creating a new one.
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

/**
 * Hook to create and manage a FileSystemV2API instance.
 *
 * The returned API instance is stable for the same `cwd` value.
 * When `cwd` changes, the old instance is released and a new one is created.
 * On unmount, the instance is automatically released.
 *
 * @param cwd - Working directory to scope operations to
 * @returns FileSystemV2API instance
 */
export function useFileSystemV2(cwd: string): FileSystemV2API {
  // Use ref to hold the API instance - avoids recreating on every render
  const apiRef = useRef<FileSystemV2API | null>(null);

  // Track the current CWD to detect changes
  const cwdRef = useRef<string>(cwd);

  // Create initial instance or recreate if CWD changed
  if (apiRef.current === null || cwdRef.current !== cwd) {
    // Release previous instance if it exists
    if (apiRef.current !== null) {
      apiRef.current.release();
    }

    // Create new instance
    apiRef.current = new FileSystemV2API(cwd);
    cwdRef.current = cwd;
  }

  // Cleanup on unmount
  useEffect(() => {
    // Return cleanup function
    return () => {
      if (apiRef.current !== null) {
        apiRef.current.release();
        apiRef.current = null;
      }
    };
  }, []); // Empty deps - only runs on unmount

  // Return the current API instance
  // We know it's not null because we create it above if it is
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
