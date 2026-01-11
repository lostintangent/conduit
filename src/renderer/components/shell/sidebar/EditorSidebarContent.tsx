/**
 * EditorSidebarContent - Editor view for the sidebar
 *
 * Renders the EditorPaneAnchor with file tree and editor.
 * Tracks the current file per CWD and persists editor settings.
 */

import { EditorPaneAnchor } from "@/components/panes/editor-v2";
import type { EditorTreeMode } from "@/types";
import type { ChangesViewMode } from "@shared/types";
import { useCallback, useMemo } from "react";
import { useCwdFileTracking } from "./hooks/useCwdFileTracking";
import { usePersistedState } from "./hooks/usePersistedState";

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEYS = {
  treeMode: "editor-sidebar-tree-mode",
  changesViewMode: "editor-sidebar-changes-view-mode",
} as const;

// =============================================================================
// Type Guards
// =============================================================================

function isEditorTreeMode(value: string): value is EditorTreeMode {
  return value === "all" || value === "changes";
}

function isChangesViewMode(value: string): value is ChangesViewMode {
  return value === "flat" || value === "nested";
}

// =============================================================================
// Types
// =============================================================================

interface EditorSidebarContentProps {
  cwd: string;
}

// =============================================================================
// Main Component
// =============================================================================

export function EditorSidebarContent({ cwd }: EditorSidebarContentProps) {
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

  // Track current file per CWD
  const { currentFile, setFile, clearFile } = useCwdFileTracking(cwd);

  // Stable pane ID based on CWD - ensures editor state is cached per directory
  const paneId = useMemo(() => `sidebar-editor-${cwd}`, [cwd]);

  // File change handler - tracks file per CWD
  const handleFileChange = useCallback(
    (fileData: { file: string; language: string; content: string }) => {
      setFile(fileData.file);
    },
    [setFile],
  );

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
      onClearFile={clearFile}
      onTreeModeChange={setTreeMode}
      onChangesViewModeChange={setChangesViewMode}
    />
  );
}
