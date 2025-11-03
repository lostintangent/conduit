import {
  activeTabIdAtom,
  tabsAtom,
  userSettingsAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
  workspacesAtom,
  previousTabsSnapshotAtom,
} from "@/store/atoms";
import type { Workspace } from "@shared/types";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

const api = window.conduit;

export function useWorkspaces() {
  const [workspaceName, setWorkspaceName] = useAtom(workspaceNameAtom);
  const [workspaces, setWorkspaces] = useAtom(workspacesAtom);
  const tabs = useAtomValue(tabsAtom);
  const activeTabId = useAtomValue(activeTabIdAtom);
  const userSettings = useAtomValue(userSettingsAtom);
  const setWorkspaceHasChanges = useSetAtom(workspaceHasChangesAtom);
  const [previousTabsSnapshot, setPreviousTabsSnapshot] = useAtom(
    previousTabsSnapshotAtom,
  );
  const [hasWorkspaces, setHasWorkspaces] = useState(false);
  const [hasLastWorkspace, setHasLastWorkspace] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showCreateWorkspaceDialog, setShowCreateWorkspaceDialog] =
    useState(false);
  const [showRenameWorkspaceDialog, setShowRenameWorkspaceDialog] =
    useState(false);

  // Track workspace changes - compare tabs deeply to detect changes
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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
      if (workspaceName && userSettings.autoSaveWorkspaces) {
        // Clear any existing timer
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }

        // Schedule auto-save after 2 seconds
        autoSaveTimerRef.current = setTimeout(() => {
          if (activeTabId) {
            api
              .saveSession(workspaceName, tabs, activeTabId)
              .then((sessions) => {
                setWorkspaces(sessions as Workspace[]);
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
    userSettings.autoSaveWorkspaces,
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const checkSessions = async () => {
      const hasSessions = await api.hasSessions();
      setHasWorkspaces(hasSessions);

      if (hasSessions) {
        const sessions = (await api.loadSessions()) as Workspace[];
        setWorkspaces(sessions);
      }

      const hasLast = await api.hasLastWorkspace();
      setHasLastWorkspace(hasLast);
    };

    void checkSessions();
  }, []);

  const saveWorkspace = useCallback(
    async (customName: string, tabs: any[], activeTabId: string) => {
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

      const sessions = (await api.saveSession(
        name,
        tabs,
        activeTabId,
      )) as Workspace[];

      setWorkspaces(sessions);
      setHasWorkspaces(true);
      setShowCreateWorkspaceDialog(false);
      setWorkspaceName(name);
    },
    [setWorkspaceName],
  );

  const renameWorkspace = useCallback(
    async (newName: string) => {
      const trimmedName = newName.trim();
      if (trimmedName.length === 0 || trimmedName === workspaceName) {
        setShowRenameWorkspaceDialog(false);
        return;
      }

      try {
        const sessions = (await api.renameWorkspace(
          workspaceName,
          trimmedName,
        )) as Workspace[];

        setWorkspaces(sessions);
        setWorkspaceName(trimmedName);
        setShowRenameWorkspaceDialog(false);
      } catch (error) {
        console.error("Failed to rename workspace:", error);
      }
    },
    [workspaceName, setWorkspaceName],
  );

  const updateWorkspaces = useCallback((sessions: Workspace[]) => {
    setWorkspaces(sessions);
    setHasWorkspaces(sessions.length > 0);
  }, []);

  const closeWorkspace = useCallback(
    async (tabs: any[], activeTabId?: string) => {
      if (workspaceName && tabs.length > 0 && activeTabId) {
        const sessions = (await api.saveSession(
          workspaceName,
          tabs,
          activeTabId,
        )) as Workspace[];
        updateWorkspaces(sessions);
      }

      const { closeWorkspace: closeWorkspaceAction } = await import(
        "@/store/actions/workspace"
      );
      closeWorkspaceAction();
    },
    [workspaceName, updateWorkspaces],
  );

  return {
    workspaceName,
    hasWorkspaces,
    workspaces,
    hasLastWorkspace,
    showWorkspacePicker,
    setShowWorkspacePicker,
    showCreateWorkspaceDialog,
    setShowCreateWorkspaceDialog,
    showRenameWorkspaceDialog,
    setShowRenameWorkspaceDialog,
    saveWorkspace,
    renameWorkspace,
    updateWorkspaces,
    closeWorkspace,
  };
}
