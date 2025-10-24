import { CommandPalette } from "@/components/CommandPalette";
import { SessionNameDialog } from "@/components/SessionNameDialog";
import { SessionPickerDialog } from "@/components/SessionPickerDialog";
import { TabLayout } from "@/components/tabs/layout/TabLayout";
import { TabStrip } from "@/components/tabs/TabStrip";
import { TabTitleDialog } from "@/components/tabs/TabTitleDialog";
import { TerminalDialog } from "@/components/TerminalDialog";
import { TitleBar } from "@/components/TitleBar";
import { UrlDialog } from "@/components/UrlDialog";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAppPreferences } from "@/hooks/useAppPreferences";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useGlobalKeyHandlers } from "@/hooks/useGlobalKeyHandlers";
import { useLayoutResizing } from "@/hooks/useLayoutResizing";
import { openWebViewPane, removePane, splitPane } from "@/store/actions/pane";
import {
  closeTab,
  openTab,
  openTabFromExistingSession,
  registerTabEventHandlers,
  updateTabProperty,
} from "@/store/actions/tab";
import { tabsAtom } from "@/store/atoms";
import { disposeSession } from "@/store/terminals";
import { enqueueNotification, updateNotification } from "@/store/notifications";
import type { Command } from "@/types";
import type { SavedSession } from "@shared/types";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";

export function App() {
  const {
    tabPosition,
    alwaysShowTabStrip,
    commandHistory,
    recordCommandHistoryEntry,
    removeCommandHistoryEntry,
  } = useAppPreferences();

  const { isCommandPaletteOpen, openCommandPalette, closeCommandPalette } =
    useGlobalKeyHandlers();

  const { resizingNode, handleResizeStart, hasCustomLayout, resetLayoutSizes } =
    useLayoutResizing();

  const [tabs, setTabs] = useAtom(tabsAtom);
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
  const [hasSessionsAvailable, setHasSessionsAvailable] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showSessionNameDialog, setShowSessionNameDialog] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

  useEffect(() => {
    const cleanup = registerTabEventHandlers();
    openTab();

    return cleanup;
  }, []);

  // Check if sessions are available on mount
  useEffect(() => {
    const checkSessions = async () => {
      const api = window.conduit;
      if (!api) {
        return;
      }

      const hasSessions = await api.hasSessions();
      setHasSessionsAvailable(hasSessions);

      if (hasSessions) {
        const sessions = (await api.loadSessions()) as SavedSession[];
        setSavedSessions(sessions);
      }
    };

    void checkSessions();
  }, []);

  useEffect(() => {
    const api = window.conduit;
    if (!api) {
      return () => {};
    }

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
        return alwaysShowTabStrip;
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

  const handleShellCommand = useCallback(
    async (rawCommand: string) => {
      await runShellCommand(rawCommand, { trackHistory: true });
    },
    [runShellCommand]
  );

  const handleOpenWebPage = useCallback(
    (url: string) => {
      const activeTab = tabs.find((tab) => tab.isActive);
      if (!activeTab) {
        return;
      }

      const activePaneId = activeTab.activePaneId;
      if (!activePaneId) {
        return;
      }

      openWebViewPane(activeTab.id, activePaneId, url);
      setIsUrlDialogOpen(false);
    },
    [tabs]
  );

  const handleSaveSession = useCallback(
    async (customName: string) => {
      const api = window.conduit;
      if (!api) {
        return;
      }

      // Use custom name if provided, otherwise generate date-based name
      let layoutName = customName.trim();
      if (layoutName.length === 0) {
        const now = new Date();
        layoutName = `Layout ${now.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}`;
      }

      const sessions = (await api.saveSession(
        layoutName,
        tabs
      )) as SavedSession[];

      setSavedSessions(sessions);
      setHasSessionsAvailable(true);
      setShowSessionNameDialog(false);
    },
    [tabs]
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
      label: "Save tab layout",
      description: "Save current tab layout for later restoration",
      run: () => {
        setShowSessionNameDialog(true);
      },
    });

    // Only show "Restore saved layout" if sessions exist
    if (hasSessionsAvailable && savedSessions.length > 0) {
      items.push({
        id: "restore-session",
        label: "Restore saved layout",
        description: "Restore tabs from a saved layout",
        run: () => {
          setShowSessionPicker(true);
        },
      });
    }

    const activeTab = tabs.find((tab) => tab.isActive);

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

      items.push({
        id: "spawn-agent-session",
        label: "Spawn agent session",
        description: "Split the pane with an isolated Git worktree",
        run: async () => {
          const api = window.conduit;
          if (!api) {
            return;
          }

          try {
            const session = await api.spawnAgentSession({ cwd: paneCwd });
            if (!session) {
              return;
            }

            await splitPane(activeTab.id, activePane.id, "column", false, {
              terminalOptions: { cwd: session.worktreePath },
              agentSession: session,
            });
          } catch (error) {
            console.error("Failed to spawn agent session", error);
          }
        },
      });

      if (activePane.agentSessionId) {
        items.push({
          id: "finalize-agent-session",
          label: "Finalize agent session",
          description:
            "Commit, merge, and close the isolated agent worktree for this pane",
          run: async () => {
            const api = window.conduit;
            if (!api) {
              return;
            }

            const branchLabel =
              activePane.agentBranchName ?? "agent session";
            const notificationId = enqueueNotification({
              kind: "info",
              message: `Finalizing ${branchLabel}...`,
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
                message: "Failed to finalize agent session",
                details: message,
                autoCloseMs: null,
              });
            }
          },
        });

        items.push({
          id: "cleanup-agent-session",
          label: "Abandon agent session",
          description: "Remove the isolated worktree without merging",
          run: async () => {
            const api = window.conduit;
            if (!api) {
              return;
            }

            const branchLabel =
              activePane.agentBranchName ?? "agent session";
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
                message: "Agent session removed",
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
    closeTab,
    hasCustomLayout,
    openTab,
    resetLayoutSizes,
    tabs,
    hasSessionsAvailable,
    savedSessions,
    closePane,
    splitPane,
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

  const shouldShowTabStrip =
    tabs.length > 0 && (alwaysShowTabStrip || tabs.length > 1);

  const titleBarBg =
    shouldShowTabStrip && tabPosition === "top"
      ? "bg-surface-muted"
      : "bg-surface";

  return (
    <div className="flex-1 flex flex-col bg-inherit min-h-0 rounded-xl">
      <TitleBar backgroundClass={titleBarBg} />

      {shouldShowTabStrip && tabPosition === "top" && (
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

      {shouldShowTabStrip && tabPosition === "bottom" && (
        <TabStrip
          onOpenCommandPalette={openCommandPalette}
          onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
          position={tabPosition}
        />
      )}

      <TabTitleDialog
        isOpen={titleModalState !== null}
        initialValue={titleModalState?.initialValue ?? ""}
        onClose={() => setTitleModalState(null)}
        onSave={handleTitleModalSave}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        commandItems={commandItems}
        onRunShellCommand={handleShellCommand}
        shellHistory={commandHistory}
        onRemoveShellHistoryEntry={removeCommandHistoryEntry}
      />

      {terminalModalState && (
        <TerminalDialog
          sessionId={terminalModalState.sessionId}
          cwd={terminalModalState.cwd}
          onClose={handleCloseTerminalModal}
          onOpenAsTab={handleOpenModalAsTab}
        />
      )}

      <UrlDialog
        isOpen={isUrlDialogOpen}
        onClose={() => setIsUrlDialogOpen(false)}
        onSubmit={handleOpenWebPage}
      />

      <SessionNameDialog
        isOpen={showSessionNameDialog}
        onClose={() => setShowSessionNameDialog(false)}
        onSave={handleSaveSession}
      />

      <SessionPickerDialog
        isOpen={showSessionPicker}
        onClose={() => setShowSessionPicker(false)}
        sessions={savedSessions}
        onSessionsUpdate={(sessions) => {
          setSavedSessions(sessions);
          setHasSessionsAvailable(sessions.length > 0);
        }}
      />
      <NotificationCenter />
    </div>
  );
}
