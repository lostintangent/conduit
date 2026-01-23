/**
 * EditorView - Editor view for the sidebar
 *
 * Renders the EditorPaneAnchor with file tree and editor.
 * Supports locked/unlocked modes:
 * - Unlocked: Tracks CWD changes, shows files for active terminal's directory
 * - Locked: Frozen at lock-time CWD, ignores terminal focus changes
 *
 * The `effectiveCwd` prop is the CWD to use (either current or locked).
 */

import { EditorPaneAnchor } from "@/components/panes/editor";
import {
  clearCwdEditorFile,
  closeSidebar,
  getCwdEditorFile,
  setCwdEditorFile,
  sidebarPaneIds,
} from "@/store/sidebarStore";
import type { EditorTreeMode } from "@/types";
import type { ChangesViewMode } from "@shared/types";
import { useCallback, useMemo } from "react";
import { usePersistedState } from "../hooks/usePersistedState";
import { useSidebarNavigation } from "../hooks/useSidebarNavigation";

const STORAGE_KEYS = {
  treeMode: "editor-sidebar-tree-mode",
  changesViewMode: "editor-sidebar-changes-view-mode",
} as const;

function isEditorTreeMode(value: string): value is EditorTreeMode {
  return value === "all" || value === "changes";
}

function isChangesViewMode(value: string): value is ChangesViewMode {
  return value === "flat" || value === "nested";
}

interface EditorViewProps {
  /** The effective CWD to display (respects lock state) */
  cwd: string;
}

export function EditorView({ cwd }: EditorViewProps) {
  // Persisted editor settings
  const [treeMode, setTreeMode] = usePersistedState<EditorTreeMode>(
    STORAGE_KEYS.treeMode,
    "all",
    isEditorTreeMode,
  );

  const [changesViewMode, setChangesViewMode] =
    usePersistedState<ChangesViewMode>(
      STORAGE_KEYS.changesViewMode,
      "flat",
      isChangesViewMode,
    );

  // Stable pane ID based on CWD - ensures editor state is cached per directory
  const paneId = useMemo(() => sidebarPaneIds.editor(cwd), [cwd]);

  // Current file - read from cache (survives view switches).
  // Not useState because EditorPaneAnchor manages the open file internally;
  // this just provides the initial file to restore after view switches.
  // Re-renders are triggered by: navigation clear (atom update) or CWD change (prop).
  const currentFile = getCwdEditorFile(cwd);

  // Consume navigation requests (tree mode and/or file)
  useSidebarNavigation((nav) => {
    if (!nav.editorTreeMode && !nav.editorFile) return undefined;
    if (nav.editorTreeMode) setTreeMode(nav.editorTreeMode);
    if (nav.editorFile) setCwdEditorFile(cwd, nav.editorFile);
    return true;
  });

  // File change handler - tracks file per CWD
  const handleFileChange = useCallback(
    (fileData: { file: string; language: string; content: string }) => {
      setCwdEditorFile(cwd, fileData.file);
    },
    [cwd],
  );

  // Clear file handler
  const handleClearFile = useCallback(() => {
    clearCwdEditorFile(cwd);
  }, [cwd]);

  // Construct pane object for EditorPaneAnchor
  const pane = useMemo(
    () => ({
      id: paneId,
      type: "editor" as const,
      cwd,
      file: currentFile,
      treeMode,
      changesViewMode,
    }),
    [paneId, cwd, currentFile, treeMode, changesViewMode],
  );

  return (
    <EditorPaneAnchor
      paneId={paneId}
      pane={pane}
      onFileChange={handleFileChange}
      onClearFile={handleClearFile}
      onTreeModeChange={setTreeMode}
      onChangesViewModeChange={setChangesViewMode}
      onClose={closeSidebar}
    />
  );
}
