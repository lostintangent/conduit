import {
  closeWorkspace as closeWorkspaceAction,
  openWorkspace,
} from "@features/workspaces/client/actions";
import {
  activeTabIdAtom,
  previousTabsSnapshotAtom,
  tabsAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
  workspaceStateAtom,
} from "@/store/atoms";
import { useSettings } from "@features/settings/client/queries";
import { useAtom, useSelector } from "@tanstack/react-store";
import { useCallback, useEffect, useRef, useState } from "react";

const workspace = window.conduit.workspaces;

export function useWorkspaces() {
  const [workspaceName, setWorkspaceName] = useAtom(workspaceNameAtom);
  const [workspaces, setWorkspaces] = useAtom(workspaceStateAtom);

  const tabs = useSelector(tabsAtom);
  const activeTabId = useSelector(activeTabIdAtom);
  const autoSaveWorkspaces = useSettings((s) => s.autoSaveWorkspaces);

  const setWorkspaceHasChanges = workspaceHasChangesAtom.set;
  const [previousTabsSnapshot, setPreviousTabsSnapshot] = useAtom(
    previousTabsSnapshotAtom,
  );

  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showCreateWorkspaceDialog, setShowCreateWorkspaceDialog] =
    useState(false);
  const [showRenameWorkspaceDialog, setShowRenameWorkspaceDialog] =
    useState(false);

  // Track workspace changes - compare tabs deeply to detect changes
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load workspaces on mount
  useEffect(() => {
    const loadWorkspaces = async () => {
      const workspaces = await workspace.getState();
      setWorkspaces(workspaces);
    };
    loadWorkspaces();

    const unsubscribeOpenWorkspace = window.conduit.onOpenWorkspaceRequest(
      (workspace) => openWorkspace(workspace),
    );

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      unsubscribeOpenWorkspace();
    };
  }, []);

  useEffect(() => {
    if (!workspaceName) {
      setWorkspaceHasChanges(false);
      return;
    }

    // Deep serialize tabs to detect any changes
    const currentTabsSnapshot = JSON.stringify(tabs);

    if (previousTabsSnapshot === "") {
      // First time tracking this workspace
      setPreviousTabsSnapshot(currentTabsSnapshot);
      setWorkspaceHasChanges(false);
    } else if (previousTabsSnapshot !== currentTabsSnapshot) {
      // Tabs have changed
      setWorkspaceHasChanges(true);

      // If auto-save is enabled, schedule a save
      if (workspaceName && autoSaveWorkspaces) {
        // Clear any existing timer
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }

        // Schedule auto-save after 2 seconds
        autoSaveTimerRef.current = setTimeout(() => {
          if (activeTabId) {
            workspace
              .saveWorkspace(workspaceName, tabs, activeTabId)
              .then((state) => {
                setWorkspaces(state);
                setPreviousTabsSnapshot(JSON.stringify(tabs));
                setWorkspaceHasChanges(false);
              })
              .catch((error) => {
                console.error("Auto-save failed:", error);
                // Clear timer reference on error
                autoSaveTimerRef.current = null;
              });
          }
        }, 2000);
      }
    }
  }, [
    tabs,
    workspaceName,
    activeTabId,
    autoSaveWorkspaces,
    setWorkspaceHasChanges,
    setWorkspaces,
    previousTabsSnapshot,
    setPreviousTabsSnapshot,
  ]);

  // Reset change tracking when workspace changes
  useEffect(() => {
    setPreviousTabsSnapshot("");

    // Clear auto-save timer when workspace changes
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [workspaceName, setPreviousTabsSnapshot]);

  const saveWorkspace = useCallback(
    async (
      customName: string,
      tabs: any[],
      activeTabId: string | undefined,
    ) => {
      let name = customName.trim();
      if (name.length === 0) {
        const now = new Date();
        name = `Layout ${now.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}`;
      }

      const state = await workspace.saveWorkspace(name, tabs, activeTabId);

      setWorkspaces(state);
      setShowCreateWorkspaceDialog(false);
      setWorkspaceName(name);
    },
    [setWorkspaceName, setWorkspaces],
  );

  const renameWorkspace = useCallback(
    async (newName: string) => {
      const trimmedName = newName.trim();
      if (
        !workspaceName ||
        trimmedName.length === 0 ||
        trimmedName === workspaceName
      ) {
        setShowRenameWorkspaceDialog(false);
        return;
      }

      try {
        const state = await workspace.renameWorkspace(
          workspaceName,
          trimmedName,
        );

        setWorkspaces(state);
        setWorkspaceName(trimmedName);
        setShowRenameWorkspaceDialog(false);
      } catch (error) {
        console.error("Failed to rename workspace:", error);
      }
    },
    [workspaceName, setWorkspaceName, setWorkspaces],
  );

  const closeWorkspace = useCallback(
    async (tabs: any[], activeTabId?: string) => {
      if (workspaceName && tabs.length > 0 && activeTabId) {
        const state = await workspace.saveWorkspace(
          workspaceName,
          tabs,
          activeTabId,
        );
        setWorkspaces(state);
      }

      closeWorkspaceAction();
    },
    [workspaceName, setWorkspaces],
  );

  return {
    workspaceName,
    hasLastWorkspace: Boolean(workspaces.lastWorkspace),

    showWorkspacePicker,
    setShowWorkspacePicker,
    showCreateWorkspaceDialog,
    setShowCreateWorkspaceDialog,
    showRenameWorkspaceDialog,
    setShowRenameWorkspaceDialog,

    saveWorkspace,
    renameWorkspace,
    closeWorkspace,
  };
}
