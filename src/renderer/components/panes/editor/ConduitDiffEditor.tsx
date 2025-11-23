import { DiffEditor } from "@monaco-editor/react";
import type { DiffEditorProps } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { useEffect, useRef } from "react";

/**
 * A wrapper around Monaco's DiffEditor that properly handles cleanup
 * to prevent "TextModel got disposed before DiffEditorWidget model got reset" errors.
 *
 * This component ensures that when unmounting, the diff editor's model is reset
 * before the TextModels are disposed, preventing race conditions.
 */
export function ConduitDiffEditor(props: DiffEditorProps) {
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(
    null,
  );

  // Cleanup on unmount to prevent disposal race condition
  useEffect(() => {
    return () => {
      if (diffEditorRef.current) {
        try {
          diffEditorRef.current.setModel(null);
        } catch (error) {
          // Ignore if already disposed
        }
        diffEditorRef.current = null;
      }
    };
  }, []);

  const handleMount = (editor: monaco.editor.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor;
    // Call the original onMount if provided
    props.onMount?.(editor);
  };

  return <DiffEditor {...props} onMount={handleMount} />;
}
