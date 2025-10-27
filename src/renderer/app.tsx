import { AgentCleanupDialog } from "@/components/shell/AgentCleanupDialog";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { QuickTerminal } from "@/components/shell/QuickTerminal";
import { TitleBar } from "@/components/shell/TitleBar";
import { WorkspacePicker } from "@/components/shell/WorkspacePicker";
import { TabLayout } from "@/components/tabs/layout/TabLayout";
import { TabStrip } from "@/components/tabs/TabStrip";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { InputDialog } from "@/components/ui/input-dialog";
import { useCommands } from "@/hooks/useCommands";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useGlobalKeyHandlers } from "@/hooks/useGlobalKeyHandlers";
import { useLayoutResizing } from "@/hooks/useLayoutResizing";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import {
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import { openWebViewPane, removePane } from "@/store/actions/pane";
import {
  closeTab,
  openTab,
  openTabFromExistingSession,
  registerTabEventHandlers,
  updateTabProperty,
} from "@/store/actions/tab";
import { activeTabAtom, tabsAtom } from "@/store/atoms";
import { disposeSession } from "@/store/terminals";
import type { AgentSessionInfo } from "@shared/types";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationCenter } from "./components/shell/NotificationCenter";

const api = window.conduit;

export function App() {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);

  const {
    tabPosition,
    alwaysShowTabs,
    showTerminalRuler,
    autoSaveWorkspaces,
    commandHistory,
    updateSettings,
    addCommandHistoryEntry: recordCommandHistoryEntry,
    removeCommandHistoryEntry,
  } = useUserSettings();

  const { isCommandPaletteOpen, openCommandPalette, closeCommandPalette } =
    useGlobalKeyHandlers();

  const { resizingNode, handleResizeStart, hasCustomLayout, resetLayoutSizes } =
    useLayoutResizing();

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
  const [cleanupDialogSessions, setCleanupDialogSessions] = useState<
    AgentSessionInfo[] | null
  >(null);
  const [isTabDrawerOpen, setIsTabDrawerOpen] = useState(false);

  const {
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
  } = useWorkspaces();

  useEffect(() => {
    return registerTabEventHandlers();
  }, []);

  // Mouse position tracking for auto-hiding drawer
  useEffect(() => {
    // Only track mouse if we're using drawer mode (not alwaysShowTabs)
    if (alwaysShowTabs) {
      setIsTabDrawerOpen(false);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const TRIGGER_ZONE_HEIGHT = 30; // 30px from top or bottom
      const windowHeight = window.innerHeight;

      if (tabPosition === "top") {
        // Show drawer when mouse is in top 30px
        setIsTabDrawerOpen(e.clientY <= TRIGGER_ZONE_HEIGHT);
      } else {
        // Show drawer when mouse is in bottom 30px
        setIsTabDrawerOpen(e.clientY >= windowHeight - TRIGGER_ZONE_HEIGHT);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [alwaysShowTabs, tabPosition]);

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

    const unsubscribeBeforeClose = api.onBeforeClose(() => {
      // Save the current workspace state as "last workspace"
      if (tabs.length > 0) {
        void api.saveLastWorkspace(tabs, activeTab?.id);
      }
    });

    return () => {
      unsubscribeExit();
      unsubscribeBeforeClose();
    };
  }, [tabs, activeTab]);

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

  const commandItems = useCommands({
    hasCustomLayout,
    resetLayoutSizes,
    closePane,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    hasWorkspaces,
    workspaces,
    hasLastWorkspace,
    setShowWorkspacePicker,
    setShowRenameWorkspaceDialog,
    quickSaveWorkspace,
    openLastWorkspace,
    closeWorkspace,
  });

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

  const shouldUseDrawer = !alwaysShowTabs;

  const titleBarBg =
    tabPosition === "top" ? "bg-surface-muted" : "bg-surface";

  return (
    <div className="flex-1 flex flex-col bg-inherit min-h-0 rounded-xl">
      <TitleBar
        backgroundClass={titleBarBg}
        onSaveWorkspace={async () => {
          if (activeTab) {
            await quickSaveWorkspace(tabs, activeTab.id);
          }
        }}
        onRenameWorkspace={() => setShowRenameWorkspaceDialog(true)}
        onCloseWorkspace={() => closeWorkspace(tabs, activeTab?.id)}
        tabPosition={tabPosition}
        alwaysShowTabs={alwaysShowTabs}
        showTerminalRuler={showTerminalRuler}
        autoSaveWorkspaces={autoSaveWorkspaces}
        onUpdateSettings={updateSettings}
      />

      {/* Top positioned tabs */}
      {tabPosition === "top" && !shouldUseDrawer && (
        <TabStrip
          onOpenCommandPalette={openCommandPalette}
          onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
          position={tabPosition}
        />
      )}
      {shouldUseDrawer && tabPosition === "top" && (
        <Drawer open={isTabDrawerOpen} onOpenChange={setIsTabDrawerOpen}>
          <DrawerContent side="top">
            <TabStrip
              onOpenCommandPalette={openCommandPalette}
              onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
              position={tabPosition}
            />
          </DrawerContent>
        </Drawer>
      )}

      <TabLayout
        handleContextMenu={handleContextMenu}
        handleResizeStart={handleResizeStart}
        resizingNode={resizingNode}
        handleWebViewUpdate={handleWebViewUpdate}
      />

      {/* Bottom positioned tabs */}
      {tabPosition === "bottom" && !shouldUseDrawer && (
        <TabStrip
          onOpenCommandPalette={openCommandPalette}
          onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
          position={tabPosition}
        />
      )}
      {shouldUseDrawer && tabPosition === "bottom" && (
        <Drawer open={isTabDrawerOpen} onOpenChange={setIsTabDrawerOpen}>
          <DrawerContent side="bottom">
            <TabStrip
              onOpenCommandPalette={openCommandPalette}
              onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
              position={tabPosition}
            />
          </DrawerContent>
        </Drawer>
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

      <InputDialog
        isOpen={titleModalState !== null}
        initialValue={titleModalState?.initialValue ?? ""}
        onClose={() => setTitleModalState(null)}
        onSave={handleTitleModalSave}
        title="Change tab title"
        placeholder="Enter a title..."
      />

      {terminalModalState && (
        <QuickTerminal
          sessionId={terminalModalState.sessionId}
          cwd={terminalModalState.cwd}
          onClose={handleCloseTerminalModal}
          onOpenAsTab={handleOpenModalAsTab}
        />
      )}

      <InputDialog
        isOpen={isUrlDialogOpen}
        onClose={() => setIsUrlDialogOpen(false)}
        onSave={(url) => handleOpenWebPage(url.trim())}
        title="Open URL"
        placeholder="Enter URL to open..."
        initialValue=""
      />

      <InputDialog
        isOpen={showCreateWorkspaceDialog}
        initialValue=""
        onClose={() => setShowCreateWorkspaceDialog(false)}
        onSave={(name) => saveWorkspace(name, tabs, activeTab.id)}
        title="Save workspace"
        placeholder="e.g., Frontend Dev, API Testing..."
      />

      <InputDialog
        isOpen={showRenameWorkspaceDialog}
        initialValue={workspaceName ?? ""}
        onClose={() => setShowRenameWorkspaceDialog(false)}
        onSave={renameWorkspace}
        title="Rename workspace"
        placeholder="Enter new worspace name..."
      />

      <WorkspacePicker
        isOpen={showWorkspacePicker}
        onClose={() => setShowWorkspacePicker(false)}
        workspaces={workspaces}
        onSessionsUpdate={updateWorkspaces}
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
