/**
 * React Hook for Git v2 API
 *
 * Provides a convenient way to use the GitV2API in React components.
 * Handles lifecycle management automatically - creates API instance on mount
 * and releases it on unmount. Also handles CWD changes by releasing the old
 * instance and creating a new one.
 *
 * @example
 * ```tsx
 * function GitStatus({ projectPath }: { projectPath: string }) {
 *   const git = useGitV2(projectPath);
 *
 *   const [status, setStatus] = useState<GitStatus | null>(null);
 *
 *   useEffect(() => {
 *     // Load initial status
 *     git.getStatus().then(setStatus);
 *
 *     // Subscribe to status changes
 *     const cleanup = git.onStatusChanged((event) => {
 *       setStatus(event.status);
 *     });
 *     return cleanup;
 *   }, [git]);
 *
 *   if (!status) return <div>Loading...</div>;
 *
 *   return (
 *     <div>
 *       <div>Branch: {status.branch}</div>
 *       <div>Changed files: {status.files.size}</div>
 *     </div>
 *   );
 * }
 * ```
 */

import { useEffect, useRef } from "react";
import { GitV2API } from "../api/GitV2API";

/**
 * Hook to create and manage a GitV2API instance.
 *
 * The returned API instance is stable for the same `cwd` value.
 * When `cwd` changes, the old instance is released and a new one is created.
 * On unmount, the instance is automatically released.
 *
 * @param cwd - Working directory to scope operations to
 * @returns GitV2API instance
 */
export function useGitV2(cwd: string): GitV2API {
  // Use ref to hold the API instance - avoids recreating on every render
  const apiRef = useRef<GitV2API | null>(null);

  // Track the current CWD to detect changes
  const cwdRef = useRef<string>(cwd);

  // Create initial instance or recreate if CWD changed
  if (apiRef.current === null || cwdRef.current !== cwd) {
    // Release previous instance if it exists
    if (apiRef.current !== null) {
      apiRef.current.release();
    }

    // Create new instance
    apiRef.current = new GitV2API(cwd);
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
  StatusChangedCallback,
  BranchChangedCallback,
  CommitCreatedCallback,
  HeadChangedCallback,
  Cleanup,
} from "../api/GitV2API";

export { GitV2API } from "../api/GitV2API";
