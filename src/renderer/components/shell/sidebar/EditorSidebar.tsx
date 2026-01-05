/**
 * EditorSidebar - A persistent editor panel that overlays from the right side
 *
 * Features:
 * - Slides in/out with animation (toggled via Cmd+E)
 * - Resizable width with drag handle (persisted to localStorage)
 * - CWD synced to active terminal/editor pane
 * - Full editor functionality (file tree, editor, changes view)
 * - Tree mode and changes view mode persisted to localStorage
 * - Open file tracked per CWD (restored when returning to a directory)
 */

import { EditorPaneAnchor } from "@/components/panes/editor-v2";
import { applicationModeAtom, isSidebarOpenAtom } from "@/store/atoms";
import type { EditorTreeMode } from "@/types";
import type { ChangesViewMode } from "@shared/types";
import { generateId } from "@shared/utils";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResizablePanel } from "./ResizablePanel";
import { useCwdFileTracking } from "./hooks/useCwdFileTracking";
import { usePersistedState } from "./hooks/usePersistedState";

const STORAGE_KEYS = {
  width: "editor-sidebar-width-percent",
  treeMode: "editor-sidebar-tree-mode",
  changesViewMode: "editor-sidebar-changes-view-mode",
} as const;

function isEditorTreeMode(value: string): value is EditorTreeMode {
  return value === "all" || value === "changes";
}

function isChangesViewMode(value: string): value is ChangesViewMode {
  return value === "flat" || value === "nested";
}

interface EditorSidebarProps {
  cwd: string;
}

export function EditorSidebar({ cwd }: EditorSidebarProps) {
  // Sidebar visibility state
  const isOpen = useAtomValue(isSidebarOpenAtom);
  const setIsOpen = useSetAtom(isSidebarOpenAtom);
  const applicationMode = useAtomValue(applicationModeAtom);

  // Close sidebar when application mode changes (skip initial mount)
  const prevApplicationModeRef = useRef(applicationMode);
  useEffect(() => {
    if (prevApplicationModeRef.current !== applicationMode) {
      setIsOpen(false);
      prevApplicationModeRef.current = applicationMode;
    }
  }, [applicationMode, setIsOpen]);

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

  // Stable pane ID for the editor - generated once per mount
  const [paneId] = useState(() => `editor-sidebar-${generateId()}`);

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
    <ResizablePanel storageKey={STORAGE_KEYS.width} isOpen={isOpen}>
      <EditorPaneAnchor
        paneId={paneId}
        pane={pane}
        onFileChange={handleFileChange}
        onClearFile={clearFile}
        onTreeModeChange={setTreeMode}
        onChangesViewModeChange={setChangesViewMode}
      />
    </ResizablePanel>
  );
}
