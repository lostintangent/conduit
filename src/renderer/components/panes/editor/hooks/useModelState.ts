/**
 * useModelState Hook
 *
 * Provides reactive access to the state of a Monaco model (dirty, orphaned,
 * external changes). Subscribes to the MonacoModelRegistry's state change
 * events and filters by the specified file path.
 *
 * @example
 * ```tsx
 * function EditorTab({ filePath }: Props) {
 *   const state = useModelState(filePath);
 *
 *   return (
 *     <div className="tab">
 *       {filePath}
 *       {state?.isDirty && <span className="dirty-indicator">●</span>}
 *       {state?.isOrphaned && <span className="deleted">(deleted)</span>}
 *     </div>
 *   );
 * }
 * ```
 */

import { useEffect, useState } from "react";
import { MonacoModelRegistry, createModelKey } from "../registry";
import type { ModelState, ModelStateEvent } from "../types";

/**
 * Hook to subscribe to model state changes for a file.
 *
 * Returns the current state (dirty, orphaned, hasExternalChanges) and
 * updates automatically when the state changes in the registry.
 *
 * @param filePath - Absolute path to the file, or null for no state
 * @returns The current model state, or null if no model exists for this path
 */
export function useModelState(filePath: string | null): ModelState | null {
  const [state, setState] = useState<ModelState | null>(() => {
    // Initialize with current state from registry
    if (filePath === null) return null;

    const registry = MonacoModelRegistry.getInstance();
    const modelKey = createModelKey(filePath);
    return registry.getModelState(modelKey);
  });

  useEffect(() => {
    if (filePath === null) {
      setState(null);
      return;
    }

    const registry = MonacoModelRegistry.getInstance();
    const modelKey = createModelKey(filePath);

    // Get initial state
    const initialState = registry.getModelState(modelKey);
    setState(initialState);

    // Subscribe to state changes
    const disposable = registry.onModelStateChanged(
      (event: ModelStateEvent) => {
        // Filter events by our file's model key
        // Note: renamed events have oldUri/newUri, not uri
        if (event.type === "renamed") {
          // Renamed events don't affect our model state tracking
          // The model registry handles renaming internally
          return;
        }
        if (event.uri !== modelKey) return;

        // Update state based on event type
        setState((prevState) => {
          if (prevState === null) {
            // Model was just created - get full state
            return registry.getModelState(modelKey);
          }

          // Update the specific property that changed
          switch (event.type) {
            case "dirty":
              return { ...prevState, isDirty: event.isDirty };

            case "orphaned":
              return { ...prevState, isOrphaned: event.isOrphaned };

            case "externalChange":
              return { ...prevState, hasExternalChanges: event.hasConflict };

            case "saved":
              // After save, no longer dirty or has external changes
              return {
                ...prevState,
                isDirty: false,
                hasExternalChanges: false,
              };

            case "reloaded":
              // After reload, no longer has external changes
              return { ...prevState, hasExternalChanges: false };

            case "fileSizeWarning":
              // File size warning doesn't change model state
              return prevState;

            default:
              return prevState;
          }
        });
      },
    );

    // Cleanup subscription
    return () => {
      disposable.dispose();
    };
  }, [filePath]);

  return state;
}
