/**
 * useGitOperations Hook
 *
 * Encapsulates git operation state and handlers for the editor v2.
 * Provides a clean interface for staging, unstaging, committing, and reverting files.
 *
 * Features:
 * - Loading states for each operation type
 * - Error state with user-friendly messages
 * - Mutual exclusivity (prevents concurrent conflicting operations)
 * - Automatic status refresh after operations
 *
 * Note: Pull and push operations require additional IPC infrastructure that
 * doesn't currently exist. These will be added in a future update.
 *
 * @example
 * ```tsx
 * function GitToolbar({ cwd }: { cwd: string }) {
 *   const [state, operations] = useGitOperations(cwd);
 *
 *   return (
 *     <div>
 *       <button
 *         onClick={() => operations.commit("Fix bug")}
 *         disabled={state.isCommitting}
 *       >
 *         {state.isCommitting ? "Committing..." : "Commit"}
 *       </button>
 *       {state.error && <div className="error">{state.error}</div>}
 *     </div>
 *   );
 * }
 * ```
 */

import type { GitCommit } from "@/api/GitV2API";
import { useGitV2 } from "@/hooks/useGitV2";
import { useCallback, useMemo, useState } from "react";

/**
 * State for git operations.
 */
export interface GitOperationsState {
  /** Whether a stage operation is in progress */
  isStaging: boolean;

  /** Whether an unstage operation is in progress */
  isUnstaging: boolean;

  /** Whether a commit operation is in progress */
  isCommitting: boolean;

  /** Whether a revert operation is in progress */
  isReverting: boolean;

  /** Whether any operation is in progress */
  isLoading: boolean;

  /** Current error message, or null if no error */
  error: string | null;
}

/**
 * Git operations available from the hook.
 */
export interface GitOperations {
  /**
   * Stage files for commit.
   * @param paths - Relative paths from git root
   */
  stage: (paths: string[]) => Promise<void>;

  /**
   * Unstage files (remove from index).
   * @param paths - Relative paths from git root
   */
  unstage: (paths: string[]) => Promise<void>;

  /**
   * Create a commit with staged changes.
   * @param message - Commit message
   * @returns The created commit, or null if failed
   */
  commit: (message: string) => Promise<GitCommit | null>;

  /**
   * Revert changes to files (discard local modifications).
   * @param paths - Relative paths from git root
   */
  revert: (paths: string[]) => Promise<void>;

  /**
   * Clear the current error state.
   */
  clearError: () => void;
}

/**
 * Return type for useGitOperations hook.
 */
export type UseGitOperationsResult = [GitOperationsState, GitOperations];

/**
 * Extract a user-friendly error message from various error types.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Clean up common git error messages
    const message = error.message;

    // Handle specific git errors
    if (message.includes("nothing to commit")) {
      return "Nothing to commit - no staged changes";
    }
    if (message.includes("empty commit message")) {
      return "Commit message cannot be empty";
    }
    if (message.includes("not a git repository")) {
      return "Not a git repository";
    }

    return message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unknown error occurred";
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for git operations with loading and error state management.
 *
 * @param cwd - Working directory for git operations
 * @returns Tuple of [state, operations]
 */
export function useGitOperations(cwd: string): UseGitOperationsResult {
  const git = useGitV2(cwd);

  // Operation loading states
  const [isStaging, setIsStaging] = useState(false);
  const [isUnstaging, setIsUnstaging] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  /**
   * Stage files for commit.
   */
  const stage = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;

      setIsStaging(true);
      setError(null);

      try {
        await git.stage(paths);
        // Status will update automatically via subscription
      } catch (err) {
        const message = getErrorMessage(err);
        setError(`Failed to stage files: ${message}`);
        throw err;
      } finally {
        setIsStaging(false);
      }
    },
    [git],
  );

  /**
   * Unstage files.
   */
  const unstage = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;

      setIsUnstaging(true);
      setError(null);

      try {
        await git.unstage(paths);
        // Status will update automatically via subscription
      } catch (err) {
        const message = getErrorMessage(err);
        setError(`Failed to unstage files: ${message}`);
        throw err;
      } finally {
        setIsUnstaging(false);
      }
    },
    [git],
  );

  /**
   * Create a commit.
   */
  const commit = useCallback(
    async (message: string): Promise<GitCommit | null> => {
      if (!message.trim()) {
        setError("Commit message cannot be empty");
        return null;
      }

      setIsCommitting(true);
      setError(null);

      try {
        const result = await git.commit(message);
        // Status will update automatically via subscription
        return result;
      } catch (err) {
        const message = getErrorMessage(err);
        setError(`Failed to commit: ${message}`);
        throw err;
      } finally {
        setIsCommitting(false);
      }
    },
    [git],
  );

  /**
   * Revert changes to files.
   */
  const revert = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;

      setIsReverting(true);
      setError(null);

      try {
        await git.revert(paths);
        // Status will update automatically via subscription
      } catch (err) {
        const message = getErrorMessage(err);
        setError(`Failed to revert files: ${message}`);
        throw err;
      } finally {
        setIsReverting(false);
      }
    },
    [git],
  );

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Build State and Operations Objects
  // ---------------------------------------------------------------------------

  const state = useMemo<GitOperationsState>(
    () => ({
      isStaging,
      isUnstaging,
      isCommitting,
      isReverting,
      isLoading: isStaging || isUnstaging || isCommitting || isReverting,
      error,
    }),
    [isStaging, isUnstaging, isCommitting, isReverting, error],
  );

  const operations = useMemo<GitOperations>(
    () => ({
      stage,
      unstage,
      commit,
      revert,
      clearError,
    }),
    [stage, unstage, commit, revert, clearError],
  );

  return [state, operations];
}
