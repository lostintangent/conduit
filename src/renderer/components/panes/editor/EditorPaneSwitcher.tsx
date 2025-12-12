/**
 * EditorPaneSwitcher - Conditional wrapper for editor pane implementations.
 *
 * Reads the `useEditorV2` feature flag from user settings and renders
 * either the legacy EditorPane (v1) or the new EditorPaneV2 via the
 * global container pattern (EditorPaneAnchor).
 *
 * When useEditorV2 is enabled:
 * - Renders EditorPaneAnchor (lightweight anchor component)
 * - The actual EditorPaneV2 is rendered in GlobalEditorContainer
 * - EditorPaneAnchor.attach() moves the editor DOM to this location
 * - This prevents mount/unmount during tab switches (no flashing)
 *
 * @example
 * ```tsx
 * // Used in TabLayout and QuickDialog
 * <EditorPaneSwitcher
 *   paneId={pane.id}
 *   cwd={pane.cwd}
 *   filePath={pane.filePath}
 *   agentSessionId={pane.agentSessionId}
 *   treeMode={pane.treeMode}
 *   // ... other props
 * />
 * ```
 *
 * @see docs/architecture/editor-global-container-plan.md
 */

import { userSettingsAtom } from "@/store/atoms";
import type { EditorTreeMode } from "@/types";
import type { FileTreeNode } from "@shared/types";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { EditorPaneAnchor, EditorPaneRegistry } from "../editor-v2";
import { EditorPane } from "./EditorPane";

// ============================================================================
// Types
// ============================================================================

export interface EditorPaneSwitcherProps {
  /** Pane identifier */
  paneId: string;

  /** Working directory */
  cwd: string;

  /** Currently open file path */
  file?: string;

  /** Agent session ID (for worktree/branch integration) */
  agentSessionId?: string | null;

  /** Tree view mode ('all' or 'changes') */
  treeMode?: EditorTreeMode;

  /** sandbox ID for cloud editor panes (routes file ops through VM) */
  sandboxId?: string;

  /** Callback when file changes */
  onFileChange?: (fileData: {
    file: string;
    language: string;
    content: string;
  }) => void;

  /** Callback when file is cleared */
  onClearFile?: () => void;

  /** Callback when cwd changes */
  onCwdChange?: (cwd: string) => void;

  /** Callback when a file is opened */
  onFileOpen?: (node: FileTreeNode) => void;

  /** Callback when tree mode changes */
  onTreeModeChange?: (mode: EditorTreeMode) => void;

  /** Whether the pane is locked */
  isLocked?: boolean;

  /** Callback when save is triggered */
  onSave?: () => void;

  /** Hide sandbox indicator for this pane */
  hideIndividualSandboxIndicator?: boolean;

  /**
   * Whether this editor is being shown in a preview context (tab hover, overview).
   * When true, an overlay is added to prevent editor interactions.
   */
  isInPreview?: boolean;

  /**
   * Callback fired when hover state changes on the editor.
   * Required for design mode hover detection, passed through to both v1 and v2
   * editor implementations.
   */
  onHover?: (isHovering: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Editor pane switcher - conditionally renders v1 or v2 based on feature flag.
 */
export function EditorPaneSwitcher({
  paneId,
  cwd,
  file,
  agentSessionId,
  treeMode,
  sandboxId,
  onFileChange,
  onClearFile,
  onCwdChange,
  onFileOpen,
  onTreeModeChange,
  isLocked,
  onSave,
  hideIndividualSandboxIndicator,
  isInPreview,
  onHover,
}: EditorPaneSwitcherProps) {
  const { useEditorV2 } = useAtomValue(userSettingsAtom);

  // Track previous value to detect v2 → v1 transitions
  const prevUseEditorV2Ref = useRef(useEditorV2);

  // Dispose all v2 editors when switching from v2 to v1
  // This ensures subscriptions are properly cleaned up
  useEffect(() => {
    const wasV2 = prevUseEditorV2Ref.current;
    const isV2 = useEditorV2;

    // Update ref for next render
    prevUseEditorV2Ref.current = isV2;

    // If switching from v2 to v1, dispose all v2 editors
    if (wasV2 && !isV2) {
      const registry = EditorPaneRegistry.getInstance();
      console.log(
        "[EditorPaneSwitcher] Switching to v1, disposing all v2 editors",
      );
      registry.disposeAll();
    }
  }, [useEditorV2]);

  // Use EditorPaneV2 via global container pattern when feature flag is enabled
  if (useEditorV2) {
    // Construct the pane object for EditorPaneAnchor
    // The actual EditorPaneV2 is rendered in GlobalEditorContainer
    const pane = {
      id: paneId,
      type: "editor" as const,
      cwd,
      file,
      treeMode,
      agentSessionId: agentSessionId ?? undefined,
      sandboxId,
    };

    return (
      <EditorPaneAnchor
        paneId={paneId}
        pane={pane}
        onFileChange={onFileChange}
        onClearFile={onClearFile}
        onCwdChange={onCwdChange}
        onFileOpen={onFileOpen}
        onTreeModeChange={onTreeModeChange}
        onSave={onSave}
        onHover={onHover}
        isInPreview={isInPreview}
        className="h-full w-full"
      />
    );
  }

  // Use legacy EditorPane (v1)
  return (
    <EditorPane
      paneId={paneId}
      cwd={cwd}
      file={file}
      agentSessionId={agentSessionId}
      treeMode={treeMode}
      sandboxId={sandboxId}
      onFileChange={onFileChange}
      onClearFile={onClearFile}
      onCwdChange={onCwdChange}
      onFileOpen={onFileOpen}
      onTreeModeChange={onTreeModeChange}
      isLocked={isLocked}
      onSave={onSave}
      hideIndividualSandboxIndicator={hideIndividualSandboxIndicator}
      onHover={onHover}
    />
  );
}
