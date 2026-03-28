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
 * The returned API instance is shared across all components using the same cwd
 * and sandboxId combination. When cwd or sandboxId changes, the old reference is released
 * and a new one is acquired. On unmount, the reference is released (instance may
 * be kept alive by other users).
 *
 * @param cwd - Working directory to scope operations to
 * @param sandboxId - Optional sandbox ID for cloud VM operations
 * @returns GitV2API instance (shared)
 */
export function useGitV2(cwd: string, sandboxId?: string): GitV2API {
  const service = GitV2APIService.getInstance();

  // Normalize path to match service's normalization
  const normalizedCwd = normalizePath(cwd);

  // Create a key for tracking (includes sandboxId if present)
  const key = sandboxId ? `${normalizedCwd}::vm:${sandboxId}` : normalizedCwd;

  // Use ref to hold the API instance - avoids recreating on every render
  const apiRef = useRef<GitV2API | null>(null);

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
  BranchChangedCallback,
  Cleanup,
  CommitCreatedCallback,
  HeadChangedCallback,
  StatusChangedCallback,
} from "../api/GitV2API";

export { GitV2API } from "../api/GitV2API";
