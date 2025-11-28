/**
 * EditorPaneSwitcher - Conditional wrapper for editor pane implementations.
 *
 * Reads the `useEditorV2` feature flag from user settings and renders
 * either the legacy EditorPane (v1) or the new EditorPaneV2.
 *
 * This enables gradual rollout of the new editor implementation while
 * maintaining backward compatibility with the existing system.
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
 */

import { useAtomValue } from "jotai";
import { userSettingsAtom } from "@/store/atoms";
import type { EditorTreeMode } from "@/types";
import type { FileTreeNode } from "@shared/types";
import { EditorPane } from "./EditorPane";
import { EditorPaneV2 } from "../editor-v2";

// ============================================================================
// Types
// ============================================================================

export interface EditorPaneSwitcherProps {
  /** Pane identifier */
  paneId: string;

  /** Working directory */
  cwd: string;

  /** Currently open file path */
  filePath?: string;

  /** Agent session ID (for worktree/branch integration) */
  agentSessionId?: string | null;

  /** Tree view mode ('all' or 'changes') */
  treeMode?: EditorTreeMode;

  /** Callback when file changes */
  onFileChange?: (fileData: {
    filePath: string;
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
  filePath,
  agentSessionId,
  treeMode,
  onFileChange,
  onClearFile,
  onCwdChange,
  onFileOpen,
  onTreeModeChange,
  isLocked,
  onSave,
  hideIndividualSandboxIndicator,
}: EditorPaneSwitcherProps) {
  const { useEditorV2 } = useAtomValue(userSettingsAtom);

  // Use EditorPaneV2 when feature flag is enabled
  if (useEditorV2) {
    // Construct the pane object for EditorPaneV2
    const pane = {
      id: paneId,
      type: "editor" as const,
      cwd,
      filePath,
      treeMode,
      agentSessionId: agentSessionId ?? undefined,
    };

    return (
      <EditorPaneV2
        pane={pane}
        onFileChange={onFileChange}
        onClearFile={onClearFile}
        onCwdChange={onCwdChange}
        onFileOpen={onFileOpen}
        onTreeModeChange={onTreeModeChange}
        onSave={onSave}
      />
    );
  }

  // Use legacy EditorPane (v1)
  return (
    <EditorPane
      paneId={paneId}
      cwd={cwd}
      filePath={filePath}
      agentSessionId={agentSessionId}
      treeMode={treeMode}
      onFileChange={onFileChange}
      onClearFile={onClearFile}
      onCwdChange={onCwdChange}
      onFileOpen={onFileOpen}
      onTreeModeChange={onTreeModeChange}
      isLocked={isLocked}
      onSave={onSave}
      hideIndividualSandboxIndicator={hideIndividualSandboxIndicator}
    />
  );
}
