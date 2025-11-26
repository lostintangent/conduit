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

    // Async function to get or create the model
    const loadModel = async () => {
      try {
        const uri = pathToUri(filePath);

        // Get or create the model
        const newModel = await registry.getOrCreateModel(filePath, cwd);

        // Add reference for this editor
        registry.addReference(uri, editorId);

        // Only update state if still mounted and filePath hasn't changed
        if (isMountedRef.current && prevFilePathRef.current === filePath) {
          setModel(newModel);
        } else if (prevFilePathRef.current !== filePath) {
          // File changed while loading - release the reference we just added
          registry.removeReference(uri, editorId);
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
      if (filePath !== null) {
        const uri = pathToUri(filePath);
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
