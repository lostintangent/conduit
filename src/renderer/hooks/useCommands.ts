import {
  enqueueNotification,
  updateNotification
} from "@/store/actions/notifications";
import {
  completeAgentSession,
  deleteAgentSession,
} from "@/store/actions/pane";
import { closeTab, openTab } from "@/store/actions/tab";
import { activeTabAtom, tabsAtom, workspaceNameAtom } from "@/store/atoms";
import type { Command } from "@/types";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

const api = window.conduit;

interface UseCommandsProps {
  hasCustomLayout: (tabId: string) => boolean;
  resetLayoutSizes: (tabId: string) => void;
  setIsUrlDialogOpen: (open: boolean) => void;
  setIsVMRepoDialogOpen: (open: boolean) => void;
  setCleanupDialogSessions: (sessions: any[] | null) => void;
  hasWorkspaces: boolean;
  workspaces: any[];
  hasLastWorkspace: boolean;
  setShowWorkspacePicker: (show: boolean) => void;
  setShowRenameWorkspaceDialog: (show: boolean) => void;
  quickSaveWorkspace: (tabs: any[], activeTabId: string) => void;
  openLastWorkspace: () => void;
  closeWorkspace: (tabs: any[], activeTabId?: string) => void;
}

export function useCommands({
  hasCustomLayout,
  resetLayoutSizes,
  setIsUrlDialogOpen,
  setIsVMRepoDialogOpen,
  setCleanupDialogSessions,
  hasWorkspaces,
  workspaces,
  hasLastWorkspace,
  setShowWorkspacePicker,
  setShowRenameWorkspaceDialog,
  quickSaveWorkspace,
  openLastWorkspace,
  closeWorkspace,
}: UseCommandsProps) {
  const tabs = useAtomValue(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const workspaceName = useAtomValue(workspaceNameAtom);
  const commandItems = useMemo<Command[]>(() => {
    const items: Command[] = [];

    items.push({
      id: "new-tab",
      label: "New Tab",
      description: "Create a new terminal tab",
      run: () => void openTab(),
    });

    items.push({
      id: "save-session",
      label: "Save workspace",
      description: "Save current tab layout for later restoration",
      run: () => activeTab && quickSaveWorkspace(tabs, activeTab.id),
    });

    // Add "Continue last session" if a last workspace exists
    if (hasLastWorkspace) {
      items.push({
        id: "open-last-session",
        label: "Continue last session",
        description: "Restore your workspace from when you last closed the app",
        run: openLastWorkspace,
      });
    }

    // Only show "Restore saved layout" if sessions exist
    if (hasWorkspaces && workspaces.length > 0) {
      items.push({
        id: "restore-session",
        label: "Open workspace",
        description: "Restore tabs from a saved workspace",
        run: () => {
          setShowWorkspacePicker(true);
        },
      });
    }

    if (workspaceName) {
      items.push({
        id: "close-workspace",
        label: "Close workspace",
        description: "Close the current workspace",
        run: () => closeWorkspace(tabs, activeTab?.id),
      });

      items.push({
        id: "rename-workspace",
        label: "Rename workspace",
        description: "Change the name of the current workspace",
        run: () => setShowRenameWorkspaceDialog(true),
      });
    }

    items.push({
      id: "cleanup-agent-sessions",
      label: "Manage agent sessions…",
      description: "Remove one or all agent worktrees without merging",
      run: async () => {
        if (!api) {
          return;
        }

        try {
          const sessions = await api.listAgentSessions();
          if (sessions.length === 0) {
            enqueueNotification({
              kind: "info",
              message: "No agent sessions.",
              autoCloseMs: 2500,
            });
            return;
          }

          setCleanupDialogSessions(sessions);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          enqueueNotification({
            kind: "error",
            message: "Unable to list agent sessions",
            details: message,
            autoCloseMs: null,
          });
        }
      },
    });

    if (activeTab && activeTab.activePaneId) {
      items.push({
        id: "open-web-page",
        label: "Open web page",
        description: "Open a web page in a split view",
        run: () => setIsUrlDialogOpen(true),
      });

      items.push({
        id: "create-vm-terminal",
        label: "Create VM terminal",
        description: "Create a new terminal connected to a remote VM",
        run: () => setIsVMRepoDialogOpen(true),
      });
    }
    if (tabs.length > 1 && activeTab) {
      items.push({
        id: "close-tab",
        label: "Close Tab",
        description: "Close the currently active tab",
        run: () => closeTab(activeTab.id),
      });
    }

    if (activeTab && hasCustomLayout(activeTab.id)) {
      items.push({
        id: "reset-layout",
        label: "Reset layout",
        description: "Restore the default pane sizes for this tab",
        run: () => resetLayoutSizes(activeTab.id),
      });
    }

    const activePane =
      activeTab && activeTab.activePaneId
        ? activeTab.panes[activeTab.activePaneId]
        : undefined;

    if (activePane?.type === "terminal" && activePane.cwd) {
      const paneCwd = activePane.cwd;

      if (activePane.agentSessionId) {
        items.push({
          id: "finalize-agent-session",
          label: "Merge and close agent session",
          description: "Commit, merge, and close the isolated agent worktree",
          run: async () => {
            if (!api || !activeTab) {
              return;
            }

            const branchLabel = activePane.agentBranchName ?? "agent session";
            const notificationId = enqueueNotification({
              kind: "info",
              message: `Merging ${branchLabel}...`,
              persistent: true,
            });

            try {
              const result = await completeAgentSession(
                activeTab.id,
                activePane.agentSessionId
              );
              if (!result) {
                throw new Error("Unable to finalize agent session");
              }

              if (result.status === "conflict") {
                updateNotification(notificationId, {
                  kind: "error",
                  message: "Merge conflicts detected",
                  details: result.message,
                  autoCloseMs: null,
                });
                return;
              }

              updateNotification(notificationId, {
                kind: result.status === "noop" ? "info" : "success",
                message:
                  result.status === "noop"
                    ? "Agent session had no new commits."
                    : "Agent session merged successfully.",
                details: result.message,
                autoCloseMs: 5000,
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              updateNotification(notificationId, {
                kind: "error",
                message: "Failed to merge and close agent session",
                details: message,
                autoCloseMs: null,
              });
            }
          },
        });

        items.push({
          id: "cleanup-agent-session",
          label: "Terminate agent session",
          description: "Remove the isolated worktree without merging",
          run: async () => {
            if (!api || !activeTab) {
              return;
            }

            const branchLabel = activePane.agentBranchName ?? "agent session";
            const notificationId = enqueueNotification({
              kind: "info",
              message: `Cleaning up ${branchLabel}...`,
              persistent: true,
            });

            try {
              const result = await deleteAgentSession(
                activeTab.id,
                activePane.agentSessionId
              );
              if (!result) {
                throw new Error("Unable to clean up agent session");
              }

              updateNotification(notificationId, {
                kind: "success",
                message: "Agent session terminated",
                details: result.message,
                autoCloseMs: 4000,
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              updateNotification(notificationId, {
                kind: "error",
                message: "Failed to clean up agent session",
                details: message,
                autoCloseMs: null,
              });
            }
          },
        });
      }

      items.push({
        id: "open-in-vscode",
        label: "Open in VS Code",
        description: "Open the active directory in Visual Studio Code",
        run: async () => {
          if (!api) {
            return;
          }

          await api.runBackgroundCommand({
            command: "code-insiders",
            args: [paneCwd],
            cwd: paneCwd,
          });
        },
      });
    }

    return items;
  }, [
    activeTab,
    hasCustomLayout,
    hasLastWorkspace,
    hasWorkspaces,
    resetLayoutSizes,
    workspaces,
    tabs,
    workspaceName,
    quickSaveWorkspace,
    openLastWorkspace,
    closeWorkspace,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    setShowWorkspacePicker,
    setShowRenameWorkspaceDialog,
  ]);

  return commandItems;
}
