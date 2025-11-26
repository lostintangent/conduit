/**
 * useEditorMode Hook
 *
 * Provides reactive access to the editor mode (regular editor or diff view)
 * for a file. Subscribes to EditorModeRegistry changes so all editors showing
 * the same file stay synchronized (same-file same-mode policy).
 *
 * @example
 * ```tsx
 * function EditorPanel({ filePath }: Props) {
 *   const [mode, setMode] = useEditorMode(filePath);
 *
 *   return (
 *     <div>
 *       <button onClick={() => setMode({ type: 'editor' })}>
 *         Code
 *       </button>
 *       <button onClick={() => setMode({ type: 'diff' })}>
 *         Diff
 *       </button>
 *
 *       {mode.type === 'editor' ? (
 *         <MonacoEditor filePath={filePath} />
 *       ) : (
 *         <DiffEditor filePath={filePath} baseBranch={mode.baseBranch} />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */

import { useEffect, useState, useCallback } from "react";
import type { EditorMode, EditorModeChangedEvent } from "../types";
import { EditorModeRegistry } from "../registry";

/** Default editor mode when no mode is set */
const DEFAULT_MODE: EditorMode = { type: "editor" };

/**
 * Return type for useEditorMode hook.
 *
 * Tuple of [currentMode, setMode] similar to useState.
 */
export type UseEditorModeResult = [
  mode: EditorMode,
  setMode: (mode: EditorMode) => void,
];

/**
 * Hook to get and set the editor mode for a file.
 *
 * Integrates with EditorModeRegistry to ensure the same-file same-mode policy:
 * all editors showing the same file will display in the same mode.
 *
 * @param filePath - Absolute path to the file, or null for default mode
 * @returns Tuple of [currentMode, setMode]
 */
export function useEditorMode(filePath: string | null): UseEditorModeResult {
  const [mode, setModeState] = useState<EditorMode>(() => {
    // Initialize with current mode from registry
    if (filePath === null) return DEFAULT_MODE;

    const registry = EditorModeRegistry.getInstance();
    return registry.getMode(filePath);
  });

  // Callback to update mode in registry (which notifies all subscribers)
  const setMode = useCallback(
    (newMode: EditorMode) => {
      if (filePath === null) return;

      const registry = EditorModeRegistry.getInstance();
      registry.setMode(filePath, newMode);
      // Note: Local state will be updated via the subscription below
    },
    [filePath],
  );

  useEffect(() => {
    if (filePath === null) {
      setModeState(DEFAULT_MODE);
      return;
    }

    const registry = EditorModeRegistry.getInstance();

    // Get initial mode
    const initialMode = registry.getMode(filePath);
    setModeState(initialMode);

    // Subscribe to mode changes
    const disposable = registry.onModeChanged(
      (event: EditorModeChangedEvent) => {
        // Filter events by our file path
        if (event.filePath !== filePath) return;

        setModeState(event.newMode);
      },
    );

    // Cleanup subscription
    return () => {
      disposable.dispose();
    };
  }, [filePath]);

  return [mode, setMode];
}
