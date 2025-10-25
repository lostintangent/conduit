import { CommandPalette } from "@/components/CommandPalette";
import { AgentCleanupDialog } from "@/components/dialogs/AgentCleanupDialog";
import { OpenUrlDialog } from "@/components/dialogs/OpenUrlDialog";
import { SaveWorkspaceDialog } from "@/components/dialogs/SaveWorkspaceDialog";
import { TabTitleDialog } from "@/components/dialogs/TabTitleDialog";
import { TerminalDialog } from "@/components/dialogs/TerminalDialog";
import { WorkspacePickerDialog } from "@/components/dialogs/WorkspacePickerDialog";
import { TabLayout } from "@/components/tabs/layout/TabLayout";
import { TabStrip } from "@/components/tabs/TabStrip";
import { TitleBar } from "@/components/TitleBar";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useGlobalKeyHandlers } from "@/hooks/useGlobalKeyHandlers";
import { useLayoutResizing } from "@/hooks/useLayoutResizing";
import { useUserSettings } from "@/hooks/useUserSettings";
import { enqueueNotification, updateNotification } from "@/store/actions/notifications";
import { openWebViewPane, removePane, splitPane } from "@/store/actions/pane";
import {
  closeTab,
  openTab,
  openTabFromExistingSession,
  registerTabEventHandlers,
  updateTabProperty,
} from "@/store/actions/tab";
import { activeTabAtom, tabsAtom, workspaceNameAtom } from "@/store/atoms";
import { disposeSession } from "@/store/terminals";
import type { Command } from "@/types";
import type { AgentSessionInfo, Workspace } from "@shared/types";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotificationCenter } from "./components/NotificationCenter";
import { closeWorkspace } from "./store/actions/workspace";

const api = window.conduit;

export function App() {
  const {
    tabPosition,
    alwaysShowTabs,
    commandHistory,
    recordCommandHistoryEntry,
    removeCommandHistoryEntry,
  } = useUserSettings();

  const { isCommandPaletteOpen, openCommandPalette, closeCommandPalette } =
    useGlobalKeyHandlers();

  const { resizingNode, handleResizeStart, hasCustomLayout, resetLayoutSizes } =
    useLayoutResizing();

  const [tabs, setTabs] = useAtom(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const [workspaceName, setWorkspaceName] = useAtom(workspaceNameAtom);

  const [titleModalState, setTitleModalState] = useState<{
    tabId: string;
    initialValue: string;
  } | null>(null);
  const [terminalModalState, setTerminalModalState] = useState<{
    sessionId: string;
    cwd: string | null;
    title: string;
    command: string;
  } | null>(null);
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);

  const [hasWorkspaces, setHasWorkspaces] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showCreateWorkspaceDialog, setShowCreateWorkspaceDialog] = useState(false);
  const [cleanupDialogSessions, setCleanupDialogSessions] = useState<
    AgentSessionInfo[] | null
  >(null);

  useEffect(() => {
    return registerTabEventHandlers();
  }, []);

  const hasInitializedTabsRef = useRef(false);

  useEffect(() => {
    if (hasInitializedTabsRef.current) {
      return;
    }

    hasInitializedTabsRef.current = true;

    if (tabs.length === 0) {
      void openTab();
    }
  }, [tabs, openTab]);

  // Check if sessions are available on mount
  useEffect(() => {
    const checkSessions = async () => {
      const hasSessions = await api.hasSessions();
      setHasWorkspaces(hasSessions);

      if (hasSessions) {
        const sessions = (await api.loadSessions()) as Workspace[];
        setWorkspaces(sessions);
      }
    };

    void checkSessions();
  }, []);

  useEffect(() => {
    const unsubscribeExit = api.onExit(({ sessionId }) => {
      setTerminalModalState((current) => {
        if (!current || current.sessionId !== sessionId) {
          return current;
        }

        disposeSession(sessionId);
        return null;
      });
    });

    return () => {
      unsubscribeExit();
    };
  }, []);

  const handleTitleModalSave = useCallback(
    (title: string) => {
      if (!titleModalState) {
        return;
      }

      updateTabProperty(titleModalState.tabId, {
        title: title.length > 0 ? title : undefined,
      });

      setTitleModalState(null);
    },
    [titleModalState, updateTabProperty]
  );

  const handleWebViewUpdate = useCallback(
    (
      tabId: string,
      paneId: string,
      updates: {
        url?: string;
        title?: string;
      }
    ) => {
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }

          const pane = tab.panes[paneId];
          if (!pane || pane.type !== "webview") {
            return tab;
          }

          const nextPane = {
            ...pane,
            url: updates.url ?? pane.url,
            title: updates.title ?? pane.title,
          };

          if (nextPane.url === pane.url && nextPane.title === pane.title) {
            return tab;
          }

          return {
            ...tab,
            panes: {
              ...tab.panes,
              [paneId]: nextPane,
            },
          };
        })
      );
    },
    [setTabs]
  );

  const closePane = useCallback(
    (tabId: string, paneId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) {
        return;
      }

      if (Object.keys(tab.panes).length === 1) {
        closeTab(tabId);
        return;
      }

      removePane(tabId, paneId);
    },
    [tabs, closeTab, removePane]
  );

  const handleContextMenu = useContextMenu({
    closePane,
    setTitleModal: (tabId: string, value: string) => {
      setTitleModalState({ tabId, initialValue: value });
    },
    canChangeTitle: (tabId: string) => {
      if (tabs.length > 1) {
        return true;
      }

      if (tabs.length === 1) {
        return alwaysShowTabs;
      }

      return false;
    },
  });

  const runShellCommand = useCallback(
    async (
      rawCommand: string,
      options: { cwd?: string; trackHistory?: boolean } = {}
    ) => {
      const command = rawCommand.trim();
      if (command.length === 0) {
        return;
      }

      const api = window.conduit;
      if (!api) {
        return;
      }

      if (terminalModalState) {
        api.closeTerminal(terminalModalState.sessionId);
        disposeSession(terminalModalState.sessionId);
        setTerminalModalState(null);
      }

      const requestedCwd =
        typeof options.cwd === "string" && options.cwd.length > 0
          ? options.cwd
          : undefined;

      const result = await api.createTerminal(
        requestedCwd ? { cwd: requestedCwd } : undefined
      );
      if (!result) {
        return;
      }

      const commandWithNewline =
        command.endsWith("\n") || command.endsWith("\r")
          ? command
          : `${command}\n`;
      api.sendKeypress(result.sessionId, commandWithNewline);

      setTerminalModalState({
        sessionId: result.sessionId,
        cwd: result.cwd ?? requestedCwd ?? null,
        title: result.title,
        command,
      });

      if (options.trackHistory) {
        await recordCommandHistoryEntry(command);
      }
    },
    [recordCommandHistoryEntry, terminalModalState]
  );

  const closeAgentSessionPanes = useCallback(
    (sessionId: string) => {
      tabs.forEach((tab) => {
        Object.entries(tab.panes).forEach(([paneId, pane]) => {
          if (pane.type === "terminal" && pane.agentSessionId === sessionId) {
            removePane(tab.id, paneId);
          }
        });
      });
    },
    [tabs]
  );

  const handleAgentSessionCleanup = useCallback(
    async (sessionIds: string[]) => {
      const api = window.conduit;
      if (!api || !cleanupDialogSessions || sessionIds.length === 0) {
        setCleanupDialogSessions(null);
        return;
      }

      const lookup = new Map(
        cleanupDialogSessions.map((session) => [session.id, session])
      );
      const targets = sessionIds
        .map((id) => lookup.get(id))
        .filter((session): session is AgentSessionInfo => Boolean(session));

      if (targets.length === 0) {
        setCleanupDialogSessions(null);
        return;
      }

      const plural = targets.length > 1;
      const notificationId = enqueueNotification({
        kind: "info",
        message: plural
          ? "Removing selected agent sessions..."
          : `Removing ${targets[0].branchName}...`,
        persistent: true,
      });

      let successCount = 0;
      const failures: string[] = [];

      for (const session of targets) {
        try {
          await api.cleanupAgentSession({ sessionId: session.id });
          closeAgentSessionPanes(session.id);
          successCount += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          failures.push(
            `${session.branchName} [${session.id.slice(0, 8)}]: ${message}`
          );
        }
      }

      if (failures.length === 0) {
        updateNotification(notificationId, {
          kind: "success",
          message: plural
            ? `Removed ${successCount} agent sessions.`
            : "Agent session removed.",
          autoCloseMs: 3500,
        });
      } else {
        updateNotification(notificationId, {
          kind: "error",
          message: `Failed to remove ${failures.length} session${failures.length > 1 ? "s" : ""
            }`,
          details: failures.join("\n"),
          autoCloseMs: null,
        });
      }

      setCleanupDialogSessions(null);
    },
    [
      cleanupDialogSessions,
      closeAgentSessionPanes,
      enqueueNotification,
      updateNotification,
    ]
  );

  const handleShellCommand = useCallback(
    async (rawCommand: string) => {
      await runShellCommand(rawCommand, { trackHistory: true });
    },
    [runShellCommand]
  );

  const handleOpenWebPage = useCallback(
    (url: string) => {
      if (!activeTab || !activeTab.activePaneId) {
        return;
      }

      openWebViewPane(activeTab.id, activeTab.activePaneId, url);
      setIsUrlDialogOpen(false);
    },
    [activeTab]
  );

  const handleSaveSession = useCallback(
    async (customName: string) => {
      const api = window.conduit;
      if (!api) {
        return;
      }

      // Use custom name if provided, otherwise generate date-based name
      let workspaceName = customName.trim();
      if (workspaceName.length === 0) {
        const now = new Date();
        workspaceName = `Layout ${now.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}`;
      }

      const sessions = (await api.saveSession(
        workspaceName,
        tabs,
        activeTab.id
      )) as Workspace[];

      setWorkspaces(sessions);
      setHasWorkspaces(true);
      setShowCreateWorkspaceDialog(false);
      setWorkspaceName(workspaceName);
    },
    [tabs, activeTab]
  );

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
      run: () => {
        // TODO: If the user is already in a workspace, them simply update it
        setShowCreateWorkspaceDialog(true);
      },
    });

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
        run: () => closeWorkspace()
      });
    }

    items.push({
      id: "cleanup-agent-sessions",
      label: "Manage agent sessions…",
      description: "Remove one or all agent worktrees without merging",
      run: async () => {
        const api = window.conduit;
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
            const api = window.conduit;
            if (!api) {
              return;
            }

            const branchLabel = activePane.agentBranchName ?? "agent session";
            const notificationId = enqueueNotification({
              kind: "info",
              message: `Merging ${branchLabel}...`,
              persistent: true,
            });

            try {
              const result = await api.finalizeAgentSession({
                sessionId: activePane.agentSessionId,
              });

              if (result.status === "conflict") {
                updateNotification(notificationId, {
                  kind: "error",
                  message: "Merge conflicts detected",
                  details: result.message,
                  autoCloseMs: null,
                });
                return;
              }

              closePane(activeTab.id, activePane.id);
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
            const api = window.conduit;
            if (!api) {
              return;
            }

            const branchLabel = activePane.agentBranchName ?? "agent session";
            const notificationId = enqueueNotification({
              kind: "info",
              message: `Cleaning up ${branchLabel}...`,
              persistent: true,
            });

            try {
              const result = await api.cleanupAgentSession({
                sessionId: activePane.agentSessionId,
              });

              closePane(activeTab.id, activePane.id);
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
          const api = window.conduit;
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
    closeTab,
    closePane,
    enqueueNotification,
    hasCustomLayout,
    hasWorkspaces,
    openTab,
    resetLayoutSizes,
    workspaces,
    splitPane,
    tabs,
    updateNotification,
  ]);

  const handleCloseTerminalModal = useCallback(() => {
    setTerminalModalState((current) => {
      if (!current) {
        return current;
      }

      const { sessionId } = current;
      const api = window.conduit;
      if (api) {
        api.closeTerminal(sessionId);
      }
      disposeSession(sessionId);
      return null;
    });
  }, []);

  const handleOpenModalAsTab = useCallback(() => {
    setTerminalModalState((current) => {
      if (!current) {
        return current;
      }

      openTabFromExistingSession({
        sessionId: current.sessionId,
        cwd: current.cwd,
        title: current.title,
      });

      return null;
    });
  }, []);

  const shouldShowTabs =
    tabs.length > 0 && (alwaysShowTabs || tabs.length > 1);

  const titleBarBg =
    shouldShowTabs && tabPosition === "top"
      ? "bg-surface-muted"
      : "bg-surface";

  return (
    <div className="flex-1 flex flex-col bg-inherit min-h-0 rounded-xl">
      <TitleBar backgroundClass={titleBarBg} />

      {shouldShowTabs && tabPosition === "top" && (
        <TabStrip
          onOpenCommandPalette={openCommandPalette}
          onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
          position={tabPosition}
        />
      )}

      <TabLayout
        handleContextMenu={handleContextMenu}
        handleResizeStart={handleResizeStart}
        resizingNode={resizingNode}
        handleWebViewUpdate={handleWebViewUpdate}
      />

      {shouldShowTabs && tabPosition === "bottom" && (
        <TabStrip
          onOpenCommandPalette={openCommandPalette}
          onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
          position={tabPosition}
        />
      )}

      {/* Global UI */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        commandItems={commandItems}
        onRunShellCommand={handleShellCommand}
        shellHistory={commandHistory}
        onRemoveShellHistoryEntry={removeCommandHistoryEntry}
      />

      <NotificationCenter />

      {/* Dialogs */}

      <TabTitleDialog
        isOpen={titleModalState !== null}
        initialValue={titleModalState?.initialValue ?? ""}
        onClose={() => setTitleModalState(null)}
        onSave={handleTitleModalSave}
      />

      {terminalModalState && (
        <TerminalDialog
          sessionId={terminalModalState.sessionId}
          cwd={terminalModalState.cwd}
          onClose={handleCloseTerminalModal}
          onOpenAsTab={handleOpenModalAsTab}
        />
      )}

      <OpenUrlDialog
        isOpen={isUrlDialogOpen}
        onClose={() => setIsUrlDialogOpen(false)}
        onSubmit={handleOpenWebPage}
      />

      <SaveWorkspaceDialog
        isOpen={showCreateWorkspaceDialog}
        onClose={() => setShowCreateWorkspaceDialog(false)}
        onSave={handleSaveSession}
      />

      <WorkspacePickerDialog
        isOpen={showWorkspacePicker}
        onClose={() => setShowWorkspacePicker(false)}
        sessions={workspaces}
        onSessionsUpdate={(sessions) => {
          setWorkspaces(sessions);
          setHasWorkspaces(sessions.length > 0);
        }}
      />

      <AgentCleanupDialog
        isOpen={cleanupDialogSessions !== null}
        sessions={cleanupDialogSessions ?? []}
        onClose={() => setCleanupDialogSessions(null)}
        onRemove={handleAgentSessionCleanup}
      />
    </div>
  );
}
