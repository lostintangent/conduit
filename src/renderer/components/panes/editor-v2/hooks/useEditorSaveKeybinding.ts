/**
 * useEditorSaveKeybinding - Hook to register Cmd+S keybinding on Monaco editors.
 *
 * Handles:
 * - Registering Cmd+S (Ctrl+S on Windows) keybinding when editor mounts
 * - Cleanup of keybinding on unmount or when editor changes
 * - Avoiding stale closures via ref pattern
 *
 * @example
 * ```tsx
 * const { registerSaveKeybinding } = useEditorSaveKeybinding(handleSave, editorId);
 *
 * const handleEditorMount = (editor) => {
 *   editorRef.current = editor;
 *   registerSaveKeybinding(editor);
 * };
 * ```
 */

import { useCallback, useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import type { IDisposable } from "monaco-editor";

export interface UseEditorSaveKeybindingResult {
  /**
   * Register the Cmd+S keybinding on an editor.
   * Call this in your editor's onMount handler.
   */
  registerSaveKeybinding: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

/**
 * Hook to manage Cmd+S save keybinding for Monaco editors.
 *
 * @param onSave - Callback to trigger when Cmd+S is pressed
 * @param editorId - Unique ID for the editor (used in action ID to avoid conflicts)
 * @returns Object with registerSaveKeybinding function
 */
export function useEditorSaveKeybinding(
  onSave: () => void,
  editorId: string,
): UseEditorSaveKeybindingResult {
  // Ref to always get latest onSave (avoids stale closure in keybinding)
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Ref for keybinding disposable (cleanup)
  const disposableRef = useRef<IDisposable | null>(null);

  // Register keybinding on editor
  const registerSaveKeybinding = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      // Clean up any existing keybinding
      if (disposableRef.current) {
        disposableRef.current.dispose();
        disposableRef.current = null;
      }

      // Add Monaco action for Cmd+S to trigger save
      const actionDisposable = editor.addAction({
        id: `conduit.save.${editorId}`,
        label: "Save",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          onSaveRef.current();
        },
      });

      disposableRef.current = actionDisposable;
    },
    [editorId],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (disposableRef.current) {
        disposableRef.current.dispose();
        disposableRef.current = null;
      }
    };
  }, []);

  return { registerSaveKeybinding };
}
