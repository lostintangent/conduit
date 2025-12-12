/**
 * useMonacoModel Hook
 *
 * Provides a Monaco text model for a file path, managing the lifecycle
 * through the MonacoModelRegistry. Handles reference counting automatically
 * to ensure models are properly cleaned up when no longer needed.
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
import { useEffect, useRef, useState } from "react";
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
  // Debug logging
  console.log("[useMonacoModel] called:", {
    editorId,
    filePath,
    cwd,
    sandboxId,
  });

  // State for the model - starts as null
  const [model, setModel] = useState<monaco.editor.ITextModel | null>(null);

  // Track previous filePath to detect changes
  const prevFilePathRef = useRef<string | null>(null);

  // Track whether component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const registry = MonacoModelRegistry.getInstance();
    const prevFilePath = prevFilePathRef.current;

    // Track if this effect has been cleaned up (to handle async race conditions)
    let cleanedUp = false;
    // Track if we've added a reference (to know if cleanup needs to remove it)
    let referenceAdded = false;

    // Release previous model reference if filePath changed
    if (prevFilePath !== null && prevFilePath !== filePath) {
      const prevModelKey = createModelKey(prevFilePath, sandboxId);
      registry.removeReference(prevModelKey, editorId);
    }

    // Update tracked filePath
    prevFilePathRef.current = filePath;

    // If no file path, clear model
    if (filePath === null) {
      setModel(null);
      return;
    }

    const modelKey = createModelKey(filePath, sandboxId);

    // Async function to get or create the model
    const loadModel = async () => {
      try {
        // Get or create the model
        const newModel = await registry.getOrCreateModel(
          filePath,
          cwd,
          sandboxId,
        );

        // Check if cleanup was called while we were loading
        if (cleanedUp) {
          // Don't add reference - cleanup already ran
          return;
        }

        // Add reference for this editor
        registry.addReference(modelKey, editorId);
        referenceAdded = true;

        // Only update state if still mounted and filePath hasn't changed
        if (isMountedRef.current && prevFilePathRef.current === filePath) {
          setModel(newModel);
        } else {
          // Either unmounted or file changed while loading - release the reference
          registry.removeReference(modelKey, editorId);
          referenceAdded = false;
        }
      } catch (error) {
        console.error(`Failed to load model for ${filePath}:`, error);
        if (isMountedRef.current) {
          setModel(null);
        }
      }
    };

    loadModel();

    // Cleanup: remove reference when unmounting or filePath changes
    return () => {
      cleanedUp = true;
      // Only remove reference if we added one
      if (referenceAdded) {
        registry.removeReference(modelKey, editorId);
      }
    };
  }, [filePath, cwd, editorId, sandboxId]);

  return model;
}

/**
 * Re-export utilities for convenience
 */
export { createModelKey, pathToUri, uriToPath } from "../registry";
