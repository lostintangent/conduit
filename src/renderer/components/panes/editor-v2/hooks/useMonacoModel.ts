/**
 * useMonacoModel Hook
 *
 * Provides a Monaco text model for a file path, managing the lifecycle
 * through the MonacoModelRegistry. Handles reference counting automatically
 * to ensure models are properly cleaned up when no longer needed.
 *
 * Uses useSyncExternalStore for optimal performance - the model is read
 * synchronously during render when cached, eliminating extra render cycles.
 *
 * @example
 * ```tsx
 * function Editor({ editorId, filePath, cwd }: Props) {
 *   const model = useMonacoModel(editorId, filePath, cwd);
 *
 *   useEffect(() => {
 *     if (model) {
 *       editor.setModel(model);
 *     }
 *   }, [model]);
 *
 *   return <div ref={editorRef} />;
 * }
 * ```
 */

import type * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { MonacoModelRegistry, createModelKey } from "../registry";

/**
 * Hook to get a Monaco text model for a file.
 *
 * The model is obtained from MonacoModelRegistry, which ensures:
 * - One model per file URI (shared across editors)
 * - Reference counting for cleanup
 * - Version-based dirty tracking
 * - External change detection
 *
 * OPTIMIZATION: Uses useSyncExternalStore to read the model synchronously
 * during render when cached. This eliminates the ~150ms extra render cycle
 * that occurs with useState + useEffect patterns.
 *
 * IMPORTANT: The editorId MUST be the same ID used for EditorRegistry
 * to ensure proper coordination between model and editor lifecycles.
 *
 * @param editorId - Unique editor ID (must match EditorRegistry ID)
 * @param filePath - Absolute path to the file, or null for no model
 * @param cwd - Working directory for file operations
 * @param sandboxId - Optional sandbox ID for VM file operations
 * @returns The Monaco text model, or null if filePath is null or loading
 */
export function useMonacoModel(
  editorId: string,
  filePath: string | null,
  cwd: string,
  sandboxId?: string,
): monaco.editor.ITextModel | null {
  const registry = MonacoModelRegistry.getInstance();
  const modelKey = filePath ? createModelKey(filePath, sandboxId) : null;

  // Track previous modelKey for reference cleanup on file change
  const prevModelKeyRef = useRef<string | null>(null);

  // Track if we've added a reference for the current model
  const hasReferenceRef = useRef(false);

  // ---------------------------------------------------------------------------
  // useSyncExternalStore - synchronous model reads during render
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to model availability changes.
   * Called by useSyncExternalStore to register for updates.
   */
  const subscribe = useCallback(
    (callback: () => void): (() => void) => {
      if (!modelKey) {
        // No model key - return no-op unsubscribe
        return () => {};
      }
      return registry.subscribeToModelAvailability(modelKey, callback);
    },
    [registry, modelKey],
  );

  /**
   * Get current snapshot of the model.
   * Called synchronously during render.
   */
  const getSnapshot = useCallback((): monaco.editor.ITextModel | null => {
    if (!modelKey) {
      return null;
    }
    const model = registry.getModel(modelKey);
    if (model && !model.isDisposed()) {
      return model;
    }
    return null;
  }, [registry, modelKey]);

  // useSyncExternalStore reads the model synchronously during render
  // When model becomes available (via event), it triggers re-render
  const model = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // ---------------------------------------------------------------------------
  // Reference Counting & Loading (useEffect)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const currentModelKey = modelKey;
    const prevModelKey = prevModelKeyRef.current;

    // Update ref for next render
    prevModelKeyRef.current = currentModelKey;

    // Track if we need to clean up on unmount/deps change
    let loadingAborted = false;

    // ---------------------------------------------------------------------------
    // Release previous model reference if filePath changed
    // ---------------------------------------------------------------------------
    if (
      prevModelKey !== null &&
      prevModelKey !== currentModelKey &&
      hasReferenceRef.current
    ) {
      registry.removeReference(prevModelKey, editorId);
      hasReferenceRef.current = false;
    }

    // If no file path, nothing more to do
    if (!currentModelKey || !filePath) {
      return;
    }

    // ---------------------------------------------------------------------------
    // Add reference if model is already cached (sync path)
    // ---------------------------------------------------------------------------
    const cachedModel = registry.getModel(currentModelKey);
    if (cachedModel && !cachedModel.isDisposed()) {
      registry.addReference(currentModelKey, editorId);
      hasReferenceRef.current = true;

      // Cleanup on unmount or deps change
      return () => {
        if (hasReferenceRef.current) {
          registry.removeReference(currentModelKey, editorId);
          hasReferenceRef.current = false;
        }
      };
    }

    // ---------------------------------------------------------------------------
    // Model not cached - trigger async load
    // ---------------------------------------------------------------------------
    const loadModel = async () => {
      try {
        // Get or create the model (this adds it to registry and fires event)
        await registry.getOrCreateModel(filePath, cwd, sandboxId);

        // Check if this effect was cleaned up while loading
        if (loadingAborted) {
          return;
        }

        // Add reference for this editor
        registry.addReference(currentModelKey, editorId);
        hasReferenceRef.current = true;

        // Note: useSyncExternalStore will automatically re-render because
        // the registry fires _onModelAvailabilityChanged when model is added
      } catch (error) {
        console.error(`Failed to load model for ${filePath}:`, error);
      }
    };

    loadModel();

    // Cleanup on unmount or deps change
    return () => {
      loadingAborted = true;
      if (hasReferenceRef.current) {
        registry.removeReference(currentModelKey, editorId);
        hasReferenceRef.current = false;
      }
    };
  }, [filePath, cwd, editorId, sandboxId, modelKey, registry]);

  return model;
}

/**
 * Re-export utilities for convenience
 */
export { createModelKey, pathToUri, uriToPath } from "../registry";
