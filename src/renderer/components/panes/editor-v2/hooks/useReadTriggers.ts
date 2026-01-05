/**
 * useReadTriggers Hook
 *
 * Centralizes the registry of actions that mark a file as "seen" (read).
 * This provides a single source of truth for what user actions should clear
 * the "unseen" indicator on a file.
 *
 * Benefits:
 * - Single source of truth: All read triggers defined in READ_TRIGGER_ACTIONS
 * - Self-documenting: triggerRead('file:stage', path) is clearer than onInteract?.()
 * - Easy to extend: Adding a new trigger = one line in the array
 * - Type-safe: Invalid action names caught at compile time
 * - Auditable: Can easily grep for all usages of each action type
 *
 * @example
 * ```tsx
 * function FileComponent({ filePath, markSeen }) {
 *   const { triggerRead } = useReadTriggers(markSeen);
 *
 *   const handleStage = () => {
 *     triggerRead('file:stage', filePath);
 *     // ... staging logic
 *   };
 *
 *   const handleFocus = () => {
 *     triggerRead('file:focus', filePath);
 *   };
 *
 *   return <Editor onFocus={handleFocus} />;
 * }
 * ```
 */

import { useCallback } from "react";

/**
 * Centralized registry of actions that mark a file as "seen".
 * Add new read triggers here - this is the single source of truth.
 */
export const READ_TRIGGER_ACTIONS = [
  "file:select", // User selects file in tree
  "file:focus", // User focuses editor
  "file:stage", // User stages file
  "file:unstage", // User unstages file
  "file:revert", // User reverts file
  "file:collapse", // User collapses expanded file
] as const;

/**
 * Valid action types for read triggers.
 */
export type ReadTriggerAction = (typeof READ_TRIGGER_ACTIONS)[number];

/**
 * Return type for useReadTriggers hook.
 */
export interface ReadTriggerResult {
  /**
   * Trigger a read action for a file.
   * This marks the file as "seen" in the tracking system.
   *
   * @param action - The action that triggered the read (e.g., 'file:focus')
   * @param path - The file path (relative to cwd)
   */
  triggerRead: (action: ReadTriggerAction, path: string) => void;
}

/**
 * Hook that provides a typed interface for triggering "read" actions on files.
 *
 * @param markSeen - Function to mark a file as seen (from useFileChangeTracking)
 * @returns Object with triggerRead function
 */
export function useReadTriggers(
  markSeen: ((path: string) => void) | undefined,
): ReadTriggerResult {
  const triggerRead = useCallback(
    (action: ReadTriggerAction, path: string) => {
      // Action parameter is for documentation/debugging purposes
      // All actions currently have the same effect: mark the file as seen
      // In the future, we could log actions for analytics or handle them differently
      void action;
      markSeen?.(path);
    },
    [markSeen],
  );

  return { triggerRead };
}
