/**
 * React Hook for Git v2 API
 *
 * Provides a convenient way to use the GitV2API in React components.
 * Uses GitV2APIService to share instances across components with the
 * same cwd, reducing duplicate IPC subscriptions.
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
import { GitV2APIService } from "../services/GitV2APIService";

/**
 * Normalize a path for consistent comparison.
 * Removes trailing slashes to match service normalization.
 */
function normalizePath(path: string): string {
  return path.replace(/\/+$/, "");
}

/**
 * Hook to acquire a shared GitV2API instance.
 *
 * The returned API instance is shared across all components using the same cwd.
 * When cwd changes, the old reference is released and a new one is acquired.
 * On unmount, the reference is released (instance may be kept alive by other users).
 *
 * @param cwd - Working directory to scope operations to
 * @returns GitV2API instance (shared)
 */
export function useGitV2(cwd: string): GitV2API {
  const service = GitV2APIService.getInstance();

  // Normalize path to match service's normalization
  const normalizedCwd = normalizePath(cwd);

  // Use ref to hold the API instance - avoids recreating on every render
  const apiRef = useRef<GitV2API | null>(null);

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
  StatusChangedCallback,
  BranchChangedCallback,
  CommitCreatedCallback,
  HeadChangedCallback,
  Cleanup,
} from "../api/GitV2API";

export { GitV2API } from "../api/GitV2API";
