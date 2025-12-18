/**
 * useEditorActions Hook
 *
 * Provides imperative actions for Monaco editor integration with toolbar buttons.
 * This hook wraps Monaco's native commands (undo, redo, find) and provides
 * accurate state tracking for button disabled states.
 *
 * The hook subscribes to the editor model's content changes to track
 * canUndo/canRedo state in real-time using Monaco's native APIs.
 *
 * The save action delegates to the provided callback, which should handle
 * persisting the model content via MonacoModelRegistry.
 *
 * @example
 * ```tsx
 * function EditorWithToolbar({ filePath, onSave }: Props) {
 *   const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
 *   const modelState = useModelState(filePath);
 *
 *   const actions = useEditorActions(
 *     editor,
 *     modelState,
 *     async () => {
 *       await MonacoModelRegistry.getInstance().saveModel(pathToUri(filePath));
 *     }
 *   );
 *
 *   return (
 *     <>
 *       <Toolbar
 *         onSave={actions.save}
 *         onUndo={actions.undo}
 *         onRedo={actions.redo}
 *         onFind={actions.find}
 *         canUndo={actions.canUndo}
 *         canRedo={actions.canRedo}
 *         isDirty={actions.isDirty}
 *       />
 *       <Editor onMount={setEditor} />
 *     </>
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useState } from "react";
import type * as monaco from "monaco-editor";
import type { ModelState } from "../types";

/**
 * Actions available for editor toolbar integration.
 */
export interface EditorActions {
  /**
   * Save the current file.
   * Calls the provided onSave callback.
   */
  save: () => Promise<void>;

  /**
   * Undo the last edit.
   * Uses Monaco's action system via editor.trigger().
   */
  undo: () => void;

  /**
   * Redo a previously undone edit.
   * Uses Monaco's action system via editor.trigger().
   */
  redo: () => void;

  /**
   * Open the find widget.
   * Triggers Monaco's native find action.
   */
  find: () => void;

  /**
   * Whether undo is available.
   * Tracked using Monaco's model.canUndo() API.
   */
  canUndo: boolean;

  /**
   * Whether redo is available.
   * Tracked using Monaco's model.canRedo() API.
   */
  canRedo: boolean;

  /**
   * Whether the model has unsaved changes.
   */
  isDirty: boolean;

  /**
   * Whether actions are available (editor exists).
   */
  isReady: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook providing editor actions for toolbar integration.
 *
 * @param editor - The Monaco editor instance (null when not yet mounted)
 * @param modelState - Current model state from useModelState
 * @param onSave - Callback to save the file content
 * @returns EditorActions object with action methods and state
 */
export function useEditorActions(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  modelState: ModelState | null,
  onSave: () => Promise<void>,
): EditorActions {
  // Track undo/redo availability using Monaco's APIs
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /**
   * Subscribe to model content changes to track undo/redo state.
   * Uses Monaco's model.canUndo() and model.canRedo() for accurate tracking.
   *
   * We subscribe to onDidChangeModel to handle the case where the model
   * is attached after the editor is created (which happens in RegularEditorWrapper).
   */
  useEffect(() => {
    if (!editor) {
      setCanUndo(false);
      setCanRedo(false);
      return;
    }

    const disposables: monaco.IDisposable[] = [];

    const setupModelSubscription = (model: monaco.editor.ITextModel | null) => {
      if (!model) {
        setCanUndo(false);
        setCanRedo(false);
        return null;
      }

      const updateUndoRedoState = () => {
        setCanUndo(model.canUndo());
        setCanRedo(model.canRedo());
      };

      // Initial state
      updateUndoRedoState();

      // Subscribe to content changes
      return model.onDidChangeContent(updateUndoRedoState);
    };

    // Set up subscription for current model (if any)
    let contentDisposable = setupModelSubscription(editor.getModel());
    if (contentDisposable) {
      disposables.push(contentDisposable);
    }

    // Listen for model changes (when model is attached/swapped)
    const modelChangeDisposable = editor.onDidChangeModel((e) => {
      // Clean up old content subscription
      if (contentDisposable) {
        contentDisposable.dispose();
      }
      // Set up new subscription for the new model
      contentDisposable = setupModelSubscription(
        e.newModelUrl ? editor.getModel() : null,
      );
      if (contentDisposable) {
        disposables.push(contentDisposable);
      }
    });
    disposables.push(modelChangeDisposable);

    return () => {
      disposables.forEach((d) => d.dispose());
    };
  }, [editor]);

  /**
   * Save the current file.
   */
  const save = useCallback(async () => {
    await onSave();
  }, [onSave]);

  /**
   * Undo the last edit using Monaco's action system.
   * This properly handles focus, selection, and all editor state.
   */
  const undo = useCallback(() => {
    if (editor) {
      editor.trigger("keyboard", "undo", null);
    }
  }, [editor]);

  /**
   * Redo a previously undone edit using Monaco's action system.
   * This properly handles focus, selection, and all editor state.
   */
  const redo = useCallback(() => {
    if (editor) {
      editor.trigger("keyboard", "redo", null);
    }
  }, [editor]);

  /**
   * Open Monaco's find widget.
   */
  const find = useCallback(() => {
    if (editor) {
      // Trigger the find action using Monaco's action system
      editor.trigger("toolbar", "actions.find", null);
    }
  }, [editor]);

  const isDirty = modelState?.isDirty ?? false;
  const isReady = editor !== null;

  return {
    save,
    undo,
    redo,
    find,
    canUndo,
    canRedo,
    isDirty,
    isReady,
  };
}
