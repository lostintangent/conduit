import { workspaceNameAtom } from "@/store/atoms";
import type { Workspace } from "@shared/types";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

const api = window.conduit;

export function useWorkspaces() {
  const [workspaceName, setWorkspaceName] = useAtom(workspaceNameAtom);
  const [hasWorkspaces, setHasWorkspaces] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [hasLastWorkspace, setHasLastWorkspace] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showCreateWorkspaceDialog, setShowCreateWorkspaceDialog] =
    useState(false);
  const [showRenameWorkspaceDialog, setShowRenameWorkspaceDialog] =
    useState(false);

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
        activeTabId
      )) as Workspace[];

      setWorkspaces(sessions);
      setHasWorkspaces(true);
      setShowCreateWorkspaceDialog(false);
      setWorkspaceName(name);
    },
    [setWorkspaceName]
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
          trimmedName
        )) as Workspace[];

        setWorkspaces(sessions);
        setWorkspaceName(trimmedName);
        setShowRenameWorkspaceDialog(false);
      } catch (error) {
        console.error("Failed to rename workspace:", error);
      }
    },
    [workspaceName, setWorkspaceName]
  );

  const updateWorkspaces = useCallback((sessions: Workspace[]) => {
    setWorkspaces(sessions);
    setHasWorkspaces(sessions.length > 0);
  }, []);

  const closeWorkspace = useCallback(async (tabs: any[], activeTabId?: string) => {
    if (workspaceName && tabs.length > 0 && activeTabId) {
      const sessions = (await api.saveSession(
        workspaceName,
        tabs,
        activeTabId
      )) as Workspace[];
      updateWorkspaces(sessions);
    }
    
    const { closeWorkspace: closeWorkspaceAction } = await import("@/store/actions/workspace");
    closeWorkspaceAction();
  }, [workspaceName, updateWorkspaces]);

  const quickSaveWorkspace = useCallback(async (tabs: any[], activeTabId: string) => {
    if (workspaceName) {
      const sessions = (await api.saveSession(
        workspaceName,
        tabs,
        activeTabId
      )) as Workspace[];
      updateWorkspaces(sessions);
    } else {
      setShowCreateWorkspaceDialog(true);
    }
  }, [workspaceName, updateWorkspaces]);

  const openLastWorkspace = useCallback(async () => {
    const lastWorkspace = (await api.loadLastWorkspace()) as Workspace | null;
    if (lastWorkspace) {
      const { openWorkspace } = await import("@/store/actions/workspace");
      await openWorkspace(lastWorkspace);
    }
  }, []);

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
    quickSaveWorkspace,
    openLastWorkspace,
  };
}
