/**
 * useAutoSizeEditor Hook
 *
 * Provides auto-sizing behavior for Monaco editors embedded in scrollable containers.
 * The editor height adjusts based on content, clamped between min and max bounds.
 *
 * This hook supports both regular editors and diff editors:
 * - Regular editor: Pass a single editor via `editor` prop
 * - Diff editor: Pass a diff editor via `diffEditor` prop (uses max of both sides)
 *
 * @example
 * ```tsx
 * // Regular editor
 * function MyEditor() {
 *   const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>(null);
 *   const { height, containerStyle } = useAutoSizeEditor({
 *     editor: editorRef.current,
 *     config: { minHeight: 100, maxHeight: 400 },
 *   });
 *   return <div style={containerStyle}>...</div>;
 * }
 *
 * // Diff editor
 * function MyDiffEditor() {
 *   const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor>(null);
 *   const { height, containerStyle } = useAutoSizeEditor({
 *     diffEditor: diffEditorRef.current,
 *     config: { minHeight: 100, maxHeight: 400 },
 *   });
 *   return <div style={containerStyle}>...</div>;
 * }
 * ```
 */

import { useEffect, useState, useRef, useMemo } from "react";
import type * as monaco from "monaco-editor";
import type { AutoSizeConfig } from "../components/EditorViewPanel/constants";

// ============================================================================
// Types
// ============================================================================

export interface UseAutoSizeEditorOptions {
  /**
   * Regular Monaco editor instance.
   * Mutually exclusive with `diffEditor`.
   */
  editor?: monaco.editor.IStandaloneCodeEditor | null;

  /**
   * Monaco diff editor instance.
   * Mutually exclusive with `editor`.
   */
  diffEditor?: monaco.editor.IStandaloneDiffEditor | null;

  /**
   * Auto-size configuration with min/max height bounds.
   * If not provided, auto-sizing is disabled.
   */
  config?: AutoSizeConfig;

  /**
   * Additional dependencies that should trigger height recalculation.
   * Useful when content changes outside of Monaco's change events.
   */
  deps?: unknown[];
}

export interface UseAutoSizeEditorResult {
  /**
   * Current computed height in pixels.
   * Will be the minHeight if no editor is provided or config is missing.
   */
  height: number;

  /**
   * Whether auto-sizing is currently enabled.
   */
  enabled: boolean;

  /**
   * Style object for the container element.
   * Apply this to the wrapper div for proper sizing.
   */
  containerStyle: React.CSSProperties;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for auto-sizing Monaco editors based on content height.
 *
 * Handles both regular and diff editors with the same API.
 * Returns computed height clamped between configured min/max bounds.
 */
export function useAutoSizeEditor({
  editor,
  diffEditor,
  config,
  deps = [],
}: UseAutoSizeEditorOptions): UseAutoSizeEditorResult {
  // Auto-sizing is only enabled when config is provided
  const enabled = config !== undefined;
  const minHeight = config?.minHeight ?? 100;
  const maxHeight = config?.maxHeight ?? 400;

  // Height state - starts at minHeight
  const [height, setHeight] = useState(minHeight);

  // Track previous height to detect actual changes
  const previousHeightRef = useRef(minHeight);

  // Track disposables for cleanup
  const disposablesRef = useRef<monaco.IDisposable[]>([]);

  // Debounce timer ref for height updates
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track if mouse is currently pressed (to skip height updates during clicks)
  const isMouseDownRef = useRef(false);

  // Track pending height update while mouse is down
  const pendingUpdateRef = useRef(false);

  // Set up global mouse tracking to prevent height updates during mouse interactions
  useEffect(() => {
    const handleMouseDown = () => {
      isMouseDownRef.current = true;
    };

    const handleMouseUp = () => {
      isMouseDownRef.current = false;
      // If there was a pending update while mouse was down, apply it now
      if (pendingUpdateRef.current) {
        pendingUpdateRef.current = false;
        // Trigger a re-check after a short delay
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          // The actual update will happen via the content size change listener
          // We just need to signal that updates are allowed again
        }, 50);
      }
    };

    // Use capture phase to catch events before Monaco
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mouseup", handleMouseUp, true);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
    };
  }, []);

  // Compute height from editor content
  useEffect(() => {
    if (!enabled) return;

    // Clean up previous listeners
    disposablesRef.current.forEach((d) => d.dispose());
    disposablesRef.current = [];

    // Function to calculate and update height
    const updateHeight = () => {
      // Skip updates while mouse is down to prevent content shifting during clicks
      if (isMouseDownRef.current) {
        pendingUpdateRef.current = true;
        return;
      }

      // Clear any pending update
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Small debounce to batch rapid changes
      debounceTimerRef.current = setTimeout(() => {
        // Double-check mouse isn't down (could have changed during timeout)
        if (isMouseDownRef.current) {
          pendingUpdateRef.current = true;
          return;
        }

        let contentHeight = 0;

        if (diffEditor) {
          // For diff editors, use the larger of the two sides
          const modifiedHeight = diffEditor
            .getModifiedEditor()
            .getContentHeight();
          const originalHeight = diffEditor
            .getOriginalEditor()
            .getContentHeight();
          contentHeight = Math.max(modifiedHeight, originalHeight);
        } else if (editor) {
          contentHeight = editor.getContentHeight();
        }

        // Clamp between min and max
        const clampedHeight = Math.min(
          Math.max(contentHeight, minHeight),
          maxHeight,
        );

        // Only update if height actually changed to avoid unnecessary re-renders
        if (clampedHeight === previousHeightRef.current) {
          return;
        }

        previousHeightRef.current = clampedHeight;
        setHeight(clampedHeight);

        // Note: Monaco's automaticLayout:true option handles calling layout()
        // when the container size changes, so we don't need to do it manually.
      }, 50); // Short debounce to batch rapid changes
    };

    // Set up listeners based on editor type
    if (diffEditor) {
      // Initial calculation
      updateHeight();

      // Listen to both editors for content size changes
      const modifiedDisposable = diffEditor
        .getModifiedEditor()
        .onDidContentSizeChange(updateHeight);
      const originalDisposable = diffEditor
        .getOriginalEditor()
        .onDidContentSizeChange(updateHeight);

      disposablesRef.current = [modifiedDisposable, originalDisposable];
    } else if (editor) {
      // Initial calculation
      updateHeight();

      // Listen for content size changes
      const disposable = editor.onDidContentSizeChange(updateHeight);
      disposablesRef.current = [disposable];
    }

    // Cleanup on unmount or dependency change
    return () => {
      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Dispose Monaco listeners
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, [enabled, minHeight, maxHeight, editor, diffEditor, deps]);

  // Container style for proper sizing
  const containerStyle = useMemo<React.CSSProperties>(
    () =>
      enabled ? { height, width: "100%" } : { height: "100%", width: "100%" },
    [enabled, height],
  );

  return {
    height,
    enabled,
    containerStyle,
  };
}
