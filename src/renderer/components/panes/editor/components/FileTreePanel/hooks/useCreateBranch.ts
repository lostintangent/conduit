/**
 * useCreateBranch - Hook for creating new branches.
 *
 * Encapsulates the state and logic for creating a new branch from
 * within a dropdown or other UI component. Handles:
 * - Input state management
 * - Branch creation via GitV2API
 * - Keyboard handling (Enter to create, Escape to cancel)
 * - Auto-focus and state reset
 *
 * Used by BranchSwitcher to provide inline branch creation.
 *
 * @example
 * ```tsx
 * const {
 *   isCreating,
 *   branchName,
 *   setBranchName,
 *   error,
 *   inputRef,
 *   isSubmitting,
 *   startCreating,
 *   handleKeyDown,
 *   cancel,
 * } = useCreateBranch(git, {
 *   isOpen: dropdownOpen,
 *   onBranchCreated: (name) => console.log(`Created ${name}`),
 * });
 * ```
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { gitMutations } from "@features/git/client/queries";
import type { GitV2API } from "@features/git/client/GitV2API";

export interface UseCreateBranchOptions {
  /** Whether the parent container (e.g., dropdown) is open */
  isOpen: boolean;

  /** Callback after successful branch creation */
  onBranchCreated?: (branchName: string) => void;
}

export interface UseCreateBranchResult {
  /** Whether the create input is visible */
  isCreating: boolean;

  /** Current branch name input value */
  branchName: string;

  /** Update branch name input value */
  setBranchName: (name: string) => void;

  /** Error message if creation failed */
  error: string | null;

  /** Ref for the input element (for focus management) */
  inputRef: React.RefObject<HTMLInputElement | null>;

  /** Whether a creation is in progress */
  isSubmitting: boolean;

  /** Show the create input */
  startCreating: () => void;

  /** Submit and create the branch */
  submit: () => Promise<void>;

  /**
   * Keyboard handler for the input.
   * Stops propagation to prevent parent menu navigation.
   * Enter submits, Escape cancels.
   */
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  /** Cancel creation and hide the input */
  cancel: () => void;
}

/**
 * Hook for managing branch creation state and logic.
 */
export function useCreateBranch(
  git: GitV2API,
  options: UseCreateBranchOptions,
): UseCreateBranchResult {
  const { isOpen, onBranchCreated } = options;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [isCreating, setIsCreating] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: createBranch, isPending: isSubmitting } = useMutation(
    gitMutations.createBranch(git.cwd),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Focus input when create mode is activated
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  // Reset state when parent closes
  useEffect(() => {
    if (!isOpen) {
      setIsCreating(false);
      setBranchName("");
      setError(null);
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const startCreating = useCallback(() => {
    setIsCreating(true);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    setIsCreating(false);
    setBranchName("");
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    const trimmedName = branchName.trim();
    if (!trimmedName) return;

    setError(null);

    try {
      await createBranch(trimmedName);
      setIsCreating(false);
      setBranchName("");
      onBranchCreated?.(trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [createBranch, branchName, onBranchCreated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Stop propagation for all keys to prevent parent menu
      // from intercepting keystrokes for navigation (type-ahead search)
      e.stopPropagation();

      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [submit, cancel],
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    isCreating,
    branchName,
    setBranchName,
    error,
    inputRef,
    isSubmitting,
    startCreating,
    submit,
    handleKeyDown,
    cancel,
  };
}
