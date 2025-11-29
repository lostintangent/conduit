/**
 * useMonacoModel Hook
 *
 * Provides a Monaco text model for a file path, managing the lifecycle
 * through the MonacoModelRegistry. Handles reference counting automatically
 * to ensure models are properly cleaned up when no longer needed.
 *
 * @example
 * ```tsx
 * function Editor({ filePath, cwd }: Props) {
 *   const model = useMonacoModel(filePath, cwd);
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

import { useEffect, useRef, useState, useId } from "react";
import type * as monaco from "monaco-editor";
import { MonacoModelRegistry, pathToUri } from "../registry";

/**
 * Hook to get a Monaco text model for a file.
 *
 * The model is obtained from MonacoModelRegistry, which ensures:
 * - One model per file URI (shared across editors)
 * - Reference counting for cleanup
 * - Version-based dirty tracking
 * - External change detection
 *
 * @param filePath - Absolute path to the file, or null for no model
 * @param cwd - Working directory for file operations
 * @returns The Monaco text model, or null if filePath is null or loading
 */
export function useMonacoModel(
  filePath: string | null,
  cwd: string,
): monaco.editor.ITextModel | null {
  // Generate stable editor ID for reference counting
  // useId() provides a stable ID across renders for this component instance
  const editorId = useId();

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
      const prevUri = pathToUri(prevFilePath);
      registry.removeReference(prevUri, editorId);
    }

    // Update tracked filePath
    prevFilePathRef.current = filePath;

    // If no file path, clear model
    if (filePath === null) {
      setModel(null);
      return;
    }

    const uri = pathToUri(filePath);

    // Async function to get or create the model
    const loadModel = async () => {
      try {
        // Get or create the model
        const newModel = await registry.getOrCreateModel(filePath, cwd);

        // Check if cleanup was called while we were loading
        if (cleanedUp) {
          // Don't add reference - cleanup already ran
          return;
        }

        // Add reference for this editor
        registry.addReference(uri, editorId);
        referenceAdded = true;

        // Only update state if still mounted and filePath hasn't changed
        if (isMountedRef.current && prevFilePathRef.current === filePath) {
          setModel(newModel);
        } else {
          // Either unmounted or file changed while loading - release the reference
          registry.removeReference(uri, editorId);
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
        registry.removeReference(uri, editorId);
      }
    };
  }, [filePath, cwd, editorId]);

  return model;
}

/**
 * Re-export utilities for convenience
 */
export { pathToUri, uriToPath } from "../registry";
