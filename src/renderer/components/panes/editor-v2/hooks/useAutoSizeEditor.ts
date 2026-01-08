/**
 * useAutoSizeEditor Hook
 *
 * Provides auto-sizing behavior for Monaco editors embedded in scrollable containers.
 * The editor height grows with content up to a max height, then scrolls internally.
 *
 * Uses direct DOM manipulation to avoid React re-renders during height changes,
 * which prevents visual glitching when typing.
 */

import { useEffect, useRef, useCallback } from "react";
import type * as monaco from "monaco-editor";
import { EDITOR_MIN_HEIGHT } from "../components/EditorViewPanel/constants";

export interface UseAutoSizeEditorOptions {
  /** Regular Monaco editor instance */
  editor?: monaco.editor.IStandaloneCodeEditor | null;

  /** Monaco diff editor instance */
  diffEditor?: monaco.editor.IStandaloneDiffEditor | null;

  /**
   * Maximum height in pixels. When provided, the editor grows with content
   * up to this height, then scrolls internally.
   */
  maxHeight?: number;
}

export interface UseAutoSizeEditorResult {
  /** Whether auto-sizing is enabled */
  enabled: boolean;

  /** Ref to attach to the container element */
  containerRef: React.RefObject<HTMLDivElement>;
}

/**
 * Hook for auto-sizing Monaco editors based on content height.
 * Updates DOM directly to avoid re-render glitching.
 */
export function useAutoSizeEditor({
  editor,
  diffEditor,
  maxHeight,
}: UseAutoSizeEditorOptions): UseAutoSizeEditorResult {
  const enabled = maxHeight !== undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const disposablesRef = useRef<monaco.IDisposable[]>([]);
  const currentHeightRef = useRef<number>(0);

  const updateHeight = useCallback(() => {
    if (!enabled || !containerRef.current) return;

    let contentHeight = 0;
    let activeEditor: monaco.editor.ICodeEditor | null = null;

    if (diffEditor) {
      const modifiedHeight = diffEditor.getModifiedEditor().getContentHeight();
      const originalHeight = diffEditor.getOriginalEditor().getContentHeight();
      contentHeight = Math.max(modifiedHeight, originalHeight);
      // Use modified editor for scroll reset (it's the one being edited)
      activeEditor = diffEditor.getModifiedEditor();
    } else if (editor) {
      contentHeight = editor.getContentHeight();
      activeEditor = editor;
    }

    // Clamp height between min and max
    const clampedHeight = Math.max(
      EDITOR_MIN_HEIGHT,
      Math.min(contentHeight, maxHeight!),
    );

    // Only update DOM if height actually changed
    if (clampedHeight !== currentHeightRef.current && containerRef.current) {
      currentHeightRef.current = clampedHeight;
      containerRef.current.style.height = `${clampedHeight}px`;

      // If content fits in container (not clamped to max), reset scroll to top
      // This prevents the "scroll then resize" visual glitch
      if (contentHeight <= maxHeight! && activeEditor) {
        activeEditor.setScrollTop(0);
      }
    }
  }, [enabled, maxHeight, editor, diffEditor]);

  useEffect(() => {
    if (!enabled) return;

    // Set initial styles
    if (containerRef.current) {
      containerRef.current.style.width = "100%";
    }

    // Clean up previous listeners
    disposablesRef.current.forEach((d) => d.dispose());
    disposablesRef.current = [];

    if (diffEditor) {
      updateHeight();
      disposablesRef.current = [
        diffEditor.getModifiedEditor().onDidContentSizeChange(updateHeight),
        diffEditor.getOriginalEditor().onDidContentSizeChange(updateHeight),
      ];
    } else if (editor) {
      updateHeight();
      disposablesRef.current = [editor.onDidContentSizeChange(updateHeight)];
    }

    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, [enabled, maxHeight, editor, diffEditor, updateHeight]);

  return { enabled, containerRef };
}
