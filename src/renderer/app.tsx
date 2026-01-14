import {
  launchAgentsInSameFolder,
  launchAgentsInWorktrees,
} from "@/agents/worktreeLauncher";
import { useCliClient } from "@/cli/useCliClient";
import { useCommandSystem } from "@/commands/hooks/useCommandSystem";
import { useKeybindingDispatch } from "@/commands/hooks/useKeybindingDispatch";
import { usePaneActionsSystem } from "@/commands/paneActions";
import { registerDefaultPreCommands } from "@/commands/preCommands";
import { TabContentPortalProvider } from "@/components/layout/normal/TabContentPortalContext";
import { TabLayout } from "@/components/layout/normal/TabLayout";
import { TabsOverview } from "@/components/layout/overview/TabsOverview";
import { HyperTerminal } from "@/components/layout/quick/HyperTerminal";
import {
  QuickPaneDialog,
  type PaneDescriptor,
} from "@/components/layout/quick/QuickPaneDialog";
import { GlobalEditorContainer } from "@/components/panes/editor-v2";
import {
  disposeSession,
  updateTerminalThemes,
} from "@/components/panes/terminal/state/xtermCache";
import { Sidebar } from "@/components/shell/sidebar/Sidebar";
import { NotificationCenter } from "@/components/shell/NotificationCenter";
import { AgentCleanupDialog } from "@/components/shell/palette/AgentCleanupDialog";
import { AgentLauncherDialog } from "@/components/shell/palette/AgentLauncherDialog";
import { CommandPalette } from "@/components/shell/palette/CommandPalette";
import { WorkspacePicker } from "@/components/shell/palette/WorkspacePicker";
import { QuickOpenDialog } from "@/components/dialogs/QuickOpenDialog";
import { SettingsDialog } from "@/components/shell/settings/SettingsDialog";
import { DuplicateTabDialog } from "@/components/shell/tabs/DuplicateTabDialog";
import { RepositoryDialog } from "@/components/shell/tabs/RepositoryDialog";
import { TabStrip } from "@/components/shell/tabs/TabStrip";
import { TitleBar } from "@/components/shell/title/TitleBar";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { InputDialog } from "@/components/ui/input-dialog";
import { useAutoUpdater } from "@/hooks/useAutoUpdater";
import { useCommands } from "@/hooks/useCommands";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useGlobalKeyHandlers } from "@/hooks/useGlobalKeyHandlers";
import { useLayoutResizing } from "@/hooks/useLayoutResizing";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import {
  closeHyperTerminal,
  handleHyperTerminalExit,
  maximizeHyperTerminal,
  minimizeHyperTerminal,
  moveHyperTerminalToTab,
  openHyperTerminal,
  updateHyperTerminalPosition,
} from "@/store/actions/hyperTerminal";
import { updatePaneProperty } from "@/store/actions/pane";
import {
  dismissNotification,
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import { openBrowserPane, removePane } from "@/store/actions/pane";
import {
  duplicateTab,
  generateIncrementedTabTitle,
  getActiveTabCwd,
  openTab,
  openTabFromPaneDescriptor,
  registerTabEventHandlers,
  updateTabProperty,
} from "@/store/actions/tab";
import {
  activeTabAtom,
  applicationModeAtom,
  hyperTerminalsAtom,
  keybindingsAtom,
  quickPaneAtom,
  tabsAtom,
} from "@/store/atoms";
import { sidebarStateAtom } from "@/store/sidebarStore";
import type { EditorPane } from "@/types";
import { applyTheme, watchSystemTheme } from "@/utils/theme";
import type { AgentSessionInfo } from "@shared/types";
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import path from "path-browserify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const api = window.conduit;
const store = getDefaultStore();

export function App() {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const [applicationMode, setApplicationMode] = useAtom(applicationModeAtom);
  const setKeybindings = useSetAtom(keybindingsAtom);
  const hyperTerminals = useAtomValue(hyperTerminalsAtom);

  const userSettings = useUserSettings();
  const {
    tabPosition,
    alwaysShowTabs,
    commandHistory,
    homeDirectory,
    theme,
    themeOverrides,
    terminalFontFamily,
    terminalFontSize,
    agents,
    launchGroups,
    updateSettings,
    addCommandHistoryEntry: recordCommandHistoryEntry,
    removeCommandHistoryEntry,
  } = userSettings;

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme, themeOverrides);
    // Update terminal colors for all active terminals
    updateTerminalThemes();
  }, [theme, themeOverrides]);

  // Watch for system theme changes when in "system" mode
  useEffect(() => {
    return watchSystemTheme(theme, () => {
      applyTheme(theme, themeOverrides);
      // Update terminal colors for all active terminals
      updateTerminalThemes();
    });
  }, [theme, themeOverrides]);

  const { isCommandPaletteOpen, openCommandPalette, closeCommandPalette } =
    useGlobalKeyHandlers();

  const [isCommandPaletteOpenOverride, setIsCommandPaletteOpenOverride] =
    useState(false);
  const commandPaletteOpen =
    isCommandPaletteOpen || isCommandPaletteOpenOverride;

  const { resizingNode, handleResizeStart, hasCustomLayout, resetLayoutSizes } =
    useLayoutResizing();

  const [titleModalState, setTitleModalState] = useState<{
    tabId: string;
    initialValue: string;
  } | null>(null);
  const [quickPaneState, setQuickPaneState] = useAtom(quickPaneAtom);
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);

  // DEBUG: Log Quick Open state changes
  useEffect(() => {
    console.log("[App] isQuickOpenOpen changed to:", isQuickOpenOpen);
  }, [isQuickOpenOpen]);
  const [isVMRepoDialogOpen, setIsVMRepoDialogOpen] = useState(false);
  const [cleanupDialogSessions, setCleanupDialogSessions] = useState<
    AgentSessionInfo[] | null
  >(null);
  const [isTabDrawerOpen, setIsTabDrawerOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    "general" | "keybindings" | "paneActions" | "agents" | null
  >(null);
  const [showAgentLauncher, setShowAgentLauncher] = useState(false);

  const {
    workspaceName,
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
  } = useWorkspaces();

  const [showDuplicateWorkspaceDialog, setShowDuplicateWorkspaceDialog] =
    useState(false);
  const [duplicateTabWithCwdDialogState, setDuplicateTabWithCwdDialogState] =
    useState<{ tabId: string } | null>(null);

  // Active CWD - tracks the active pane's CWD with "sticky" behavior.
  // When the active pane is a terminal or editor, use its CWD and remember it.
  // When the active pane is a browser or other type, keep the last known CWD.
  // This is used by components that need to know the "current" directory context.
  const lastKnownCwdRef = useRef<string | null>(null);

  const activeCwd = useMemo(() => {
    if (!activeTab) {
      return lastKnownCwdRef.current ?? homeDirectory ?? "/";
    }

    const activePane = activeTab.panes[activeTab.activePaneId];

    // Terminal and editor panes have a CWD - use it
    if (activePane?.type === "terminal" || activePane?.type === "editor") {
      return activePane.cwd ?? homeDirectory ?? "/";
    }

    // Browser or other pane types: keep previous CWD (sticky)
    return lastKnownCwdRef.current ?? homeDirectory ?? "/";
  }, [activeTab, homeDirectory]);

  // Update the sticky CWD ref as a proper side effect (not inside useMemo)
  useEffect(() => {
    if (!activeTab) return;

    const activePane = activeTab.panes[activeTab.activePaneId];
    if (activePane?.type === "terminal" || activePane?.type === "editor") {
      lastKnownCwdRef.current = activePane.cwd ?? homeDirectory ?? "/";
    }
  }, [activeTab, homeDirectory]);

  useCliClient(activeCwd);

  // TODO: Once we ship a web variant of Conduit, this should
  // be conditioned on whether we're running in Electron or not.
  useAutoUpdater();

  // Initialize command system and wire up keyboard dispatch
  const commandSystem = useCommandSystem({
    activeTab,
    tabs,
    applicationMode,
    setApplicationMode,
    homeDirectory,
    dotfilesRepo: userSettings.dotfilesRepo,
    workspaceName,
    // Context key data
    hasCustomLayout,
    hasLastWorkspace,
    // UI state setters
    setShowGeneralSettings: (show: boolean) =>
      setSettingsTab(show ? "general" : null),
    setShowKeybindingsEditor: (show: boolean) =>
      setSettingsTab(show ? "keybindings" : null),
    setShowPaneActionsEditor: (show: boolean) =>
      setSettingsTab(show ? "paneActions" : null),
    setShowAgentsEditor: (show: boolean) =>
      setSettingsTab(show ? "agents" : null),
    setShowAgentLauncher,
    setIsCommandPaletteOpenOverride,
    setShowRenameWorkspaceDialog,
    setShowWorkspacePicker,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    setShowCreateWorkspaceDialog,
    setShowDuplicateWorkspaceDialog,
    setShowDuplicateTabWithCwdDialog: (tabId: string) =>
      setDuplicateTabWithCwdDialogState({ tabId }),
    setTitleModal: (tabId: string, value: string) =>
      setTitleModalState({ tabId, initialValue: value }),
    setIsQuickOpenOpen,
  });

  // Initialize pane actions system
  const paneActionsSystem = usePaneActionsSystem({
    homeDirectory,
  });

  // Register pre-commands
  useEffect(() => {
    registerDefaultPreCommands();
  }, []);

  useKeybindingDispatch(
    commandSystem?.commandRegistry,
    commandSystem?.keybindingRegistry,
  );

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

  // Keep refs to tabs/activeTab for the beforeClose handler so the effect
  // doesn't need to re-run when tabs change (avoiding IPC listener churn)
  const tabsRef = useRef(tabs);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabRef.current = activeTab;
  }, [tabs, activeTab]);

  useEffect(() => {
    const unsubscribeExit = api.onExit(({ sessionId }) => {
      // Handle quick pane exit
      setQuickPaneState((current) => {
        if (
          !current ||
          current.type !== "terminal" ||
          current.sessionId !== sessionId
        ) {
          return current;
        }

        disposeSession(sessionId);
        return null;
      });

      // Handle floating terminal exit
      handleHyperTerminalExit(sessionId);
    });

    const unsubscribeNotification = api.onShowNotification((payload) => {
      enqueueNotification({
        kind: payload.type,
        message: payload.message,
        autoCloseMs: payload.timeout,
      });
    });

    const unsubscribeBeforeClose = api.onBeforeClose(() => {
      // Save the current workspace state as "last workspace"
      if (tabsRef.current.length > 0) {
        void api.workspace.saveLastWorkspace(
          tabsRef.current,
          activeTabRef.current?.id,
        );
      }
    });

    return () => {
      unsubscribeExit();
      unsubscribeNotification();
      unsubscribeBeforeClose();
    };
  }, []);

  const handleTitleModalSave = useCallback(
    (title: string) => {
      if (!titleModalState) {
        return;
      }

      updateTabProperty(titleModalState.tabId, {
        name: title.length > 0 ? title : undefined,
      });

      setTitleModalState(null);
    },
    [titleModalState, updateTabProperty],
  );

  const handleBrowserUpdate = useCallback(
    (
      tabId: string,
      paneId: string,
      updates: {
        url?: string;
        title?: string;
      },
    ) => {
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }

          const pane = tab.panes[paneId];
          if (!pane || pane.type !== "browser") {
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
        }),
      );
    },
    [setTabs],
  );

  const handleEditorUpdate = useCallback(
    (tabId: string, paneId: string, updates: Partial<EditorPane>) => {
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }

          const pane = tab.panes[paneId];
          if (!pane || pane.type !== "editor") {
            return tab;
          }

          const nextPane = {
            ...pane,
            ...updates,
          };

          return {
            ...tab,
            panes: {
              ...tab.panes,
              [paneId]: nextPane,
            },
          };
        }),
      );
    },
    [setTabs],
  );

  const handleContextMenu = useContextMenu({
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
      options: { cwd?: string; trackHistory?: boolean } = {},
    ) => {
      const command = rawCommand.trim();
      if (command.length === 0) {
        return;
      }

      if (quickPaneState?.type === "terminal") {
        api.closeTerminal(quickPaneState.sessionId);
        disposeSession(quickPaneState.sessionId);
        setQuickPaneState(null);
      }

      const requestedCwd =
        typeof options.cwd === "string" && options.cwd.length > 0
          ? options.cwd
          : undefined;

      const result = await api.createTerminal({
        cwd: requestedCwd,
        command,
      });
      if (!result) {
        return;
      }

      setQuickPaneState({
        type: "terminal",
        sessionId: result.sessionId,
        cwd: result.cwd ?? requestedCwd ?? null,
      });

      if (options.trackHistory) {
        await recordCommandHistoryEntry(command);
      }
    },
    [recordCommandHistoryEntry, quickPaneState],
  );

  const handleVMRepoSubmit = useCallback(
    async (repo?: { owner: string; name: string }) => {
      const notificationId = enqueueNotification({
        kind: "info",
        message: "Creating VM...",
        persistent: true,
      });

      try {
        const result = await api.createTerminal({
          isRemoteVM: true,
          githubRepo: repo,
        });

        if (!result) {
          throw new Error("Failed to create VM terminal");
        }

        dismissNotification(notificationId);

        // Open a new tab with the VM terminal session
        const { openTabFromExistingSession } = await import(
          "@/store/actions/tab"
        );
        openTabFromExistingSession({
          sessionId: result.sessionId,
          cwd: result.cwd,
          title: result.title,
          sandboxId: result.sandboxId ?? undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateNotification(notificationId, {
          kind: "error",
          message: "Failed to create VM terminal",
          details: message,
          autoCloseMs: null,
        });
      }
    },
    [],
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
    [tabs],
  );

  const handleAgentSessionOpen = useCallback(
    async (session: AgentSessionInfo) => {
      const { openTabFromExistingAgentSession } = await import(
        "@/store/actions/tab"
      );
      await openTabFromExistingAgentSession(session);
    },
    [],
  );

  const handleAgentSessionCleanup = useCallback(
    async (sessionIds: string[]) => {
      const api = window.conduit;
      if (!api || !cleanupDialogSessions || sessionIds.length === 0) {
        setCleanupDialogSessions(null);
        return;
      }

      const lookup = new Map(
        cleanupDialogSessions.map((session) => [session.id, session]),
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
            `${session.branchName} [${session.id.slice(0, 8)}]: ${message}`,
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
          message: `Failed to remove ${failures.length} session${
            failures.length > 1 ? "s" : ""
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
    ],
  );

  const handleOpenWebPage = useCallback(
    (url: string) => {
      if (!activeTab || !activeTab.activePaneId) {
        return;
      }

      openBrowserPane(activeTab.id, activeTab.activePaneId, url);
      setIsUrlDialogOpen(false);
    },
    [activeTab],
  );

  const handleDuplicateWorkspace = useCallback(
    async (name: string) => {
      if (!workspaceName || !activeTab) {
        return;
      }

      // Save the current tabs as a new workspace with the provided name
      await saveWorkspace(name, tabs, activeTab.id);
      setShowDuplicateWorkspaceDialog(false);
    },
    [workspaceName, activeTab, tabs, saveWorkspace],
  );

  const handleDuplicateTabWithCwd = useCallback(
    async (cwd: string, title?: string) => {
      if (!duplicateTabWithCwdDialogState) {
        return;
      }

      const targetTab = tabs.find(
        (t) => t.id === duplicateTabWithCwdDialogState.tabId,
      );
      if (!targetTab) {
        return;
      }

      const trimmedCwd = cwd.trim();
      if (trimmedCwd.length === 0) {
        setDuplicateTabWithCwdDialogState(null);
        return;
      }

      // Validate that the directory exists
      try {
        await api.listDirectory(trimmedCwd);
      } catch (error) {
        enqueueNotification({
          kind: "error",
          message: `Directory not found: ${trimmedCwd}`,
        });
        return;
      }

      // Duplicate the tab with the specified CWD and optional title
      await duplicateTab(duplicateTabWithCwdDialogState.tabId, {
        cwd: trimmedCwd,
        title: title || undefined,
      });
      setDuplicateTabWithCwdDialogState(null);
    },
    [duplicateTabWithCwdDialogState, tabs],
  );

  // Get commands from registry (or empty array if command system not ready)
  const commandItems = useCommands(
    commandSystem?.commandRegistry,
    commandSystem?.keybindingRegistry,
    commandSystem?.contextKeyService,
  );

  const handleCloseQuickPane = useCallback(() => {
    setQuickPaneState((current) => {
      if (!current) {
        return current;
      }

      current.onClose?.();

      if (current.type === "terminal") {
        const api = window.conduit;
        if (api) {
          api.closeTerminal(current.sessionId);
        }
        disposeSession(current.sessionId);
      }

      return null;
    });
  }, []);

  const handleOpenQuickPaneAsTab = useCallback(
    async (descriptor: PaneDescriptor) => {
      // Close quick pane without disposing terminal sessions
      // since they will be reused in the new tab
      setQuickPaneState((current) => {
        if (current) {
          current.onClose?.();
        }
        return null;
      });
      await openTabFromPaneDescriptor(descriptor);
    },
    [],
  );

  const handleOpenQuickPaneAsFloating = useCallback(
    (terminalId: string, paneId: string) => {
      // Transfer terminal from quick pane to floating overlay.
      setQuickPaneState((current) => {
        if (!current || current.type !== "terminal") {
          return null;
        }

        const cwd = current.cwd;

        current.onClose?.();

        openHyperTerminal(terminalId, paneId, cwd);

        return null;
      });
    },
    [openHyperTerminal],
  );

  const handleMaximizeHyperTerminal = useCallback(
    (terminalId: string, cwd: string | null) => {
      // Transfer terminal from floating overlay back to quick dialog.
      const quickPaneDescriptor = maximizeHyperTerminal(terminalId, cwd);
      setQuickPaneState(quickPaneDescriptor);
    },
    [maximizeHyperTerminal, setQuickPaneState],
  );

  const shouldUseDrawer = !alwaysShowTabs;

  // Custom frameless window with CSS rounded corners
  // Windows will conditionally use rounded or not based on the phase of the moon
  const isWindows = api.platform === "win32";

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 overflow-hidden ${isWindows ? "rounded" : "rounded-xl"}`}
    >
      <TitleBar />

      <TabContentPortalProvider>
        {/* Global container for editor panes - keeps editors alive across tab switches */}
        <GlobalEditorContainer />

        {/* Main content area - relative container for sidebar overlay */}
        <div className="relative flex-1 flex flex-col min-h-0">
          {/* Top positioned tabs */}
          {tabPosition === "top" && !shouldUseDrawer && (
            <TabStrip
              onOpenCommandPalette={openCommandPalette}
              onTabContextMenu={handleContextMenu}
              position={tabPosition}
            />
          )}

          {shouldUseDrawer && tabPosition === "top" && (
            <Drawer open={isTabDrawerOpen} onOpenChange={setIsTabDrawerOpen}>
              <DrawerContent side="top">
                <TabStrip
                  onOpenCommandPalette={openCommandPalette}
                  onTabContextMenu={handleContextMenu}
                  position={tabPosition}
                />
              </DrawerContent>
            </Drawer>
          )}

          <div className="relative flex-1 flex min-h-0">
            <div
              className={`flex-1 flex min-h-0 ${
                applicationMode === "overview"
                  ? "opacity-0 pointer-events-none"
                  : ""
              }`}
              aria-hidden={applicationMode === "overview" ? true : undefined}
            >
              <TabLayout
                handleContextMenu={handleContextMenu}
                handleResizeStart={handleResizeStart}
                resizingNode={resizingNode}
                handleBrowserUpdate={handleBrowserUpdate}
                handleEditorUpdate={handleEditorUpdate}
                onOpenPaneActions={() => setSettingsTab("paneActions")}
              />
            </div>

            {applicationMode === "overview" ? (
              <div className="absolute inset-0 flex min-h-0">
                <TabsOverview />
              </div>
            ) : null}
          </div>

          {/* Bottom positioned tabs */}
          {tabPosition === "bottom" && !shouldUseDrawer && (
            <TabStrip
              onOpenCommandPalette={openCommandPalette}
              onTabContextMenu={handleContextMenu}
              position={tabPosition}
            />
          )}

          {shouldUseDrawer && tabPosition === "bottom" && (
            <Drawer open={isTabDrawerOpen} onOpenChange={setIsTabDrawerOpen}>
              <DrawerContent side="bottom">
                <TabStrip
                  onOpenCommandPalette={openCommandPalette}
                  onTabContextMenu={handleContextMenu}
                  position={tabPosition}
                />
              </DrawerContent>
            </Drawer>
          )}

          {/* Sidebar overlay - covers tab strip and content but not title bar */}
          <Sidebar cwd={activeCwd} />
        </div>
      </TabContentPortalProvider>

      {/* Global UI */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => {
          closeCommandPalette();
          setIsCommandPaletteOpenOverride(false);
        }}
        commandItems={commandItems}
        onRunShellCommand={(command) =>
          runShellCommand(command, { trackHistory: true })
        }
        shellHistory={commandHistory}
        onRemoveShellHistoryEntry={removeCommandHistoryEntry}
        cwd={activeTab ? getActiveTabCwd(activeTab, homeDirectory) : null}
        onOpenFile={(filePath) => {
          if (!activeTab || !activeTab.activePaneId) {
            return;
          }

          // Extract directory from file path
          const cwd = path.dirname(filePath);

          // Get sandboxId from active pane if it's a terminal or editor with VM
          const activePane = activeTab.panes[activeTab.activePaneId];
          const sandboxId =
            activePane?.type === "terminal"
              ? activePane.sandboxId
              : activePane?.type === "editor"
                ? activePane.sandboxId
                : undefined;

          // Create a quick pane with the file
          setQuickPaneState({
            type: "editor",
            cwd,
            file: filePath,
            sandboxId,
          });
        }}
      />

      <NotificationCenter />

      {/* Dialogs */}

      <InputDialog
        isOpen={titleModalState !== null}
        initialValue={titleModalState?.initialValue ?? ""}
        onClose={() => setTitleModalState(null)}
        onSave={handleTitleModalSave}
        title="Rename tab"
        placeholder="Enter a name..."
      />

      {quickPaneState && (
        <QuickPaneDialog
          paneDescriptor={quickPaneState}
          onClose={handleCloseQuickPane}
          onOpenAsTab={handleOpenQuickPaneAsTab}
          onOpenAsFloating={handleOpenQuickPaneAsFloating}
        />
      )}

      {isQuickOpenOpen && (
        <QuickOpenDialog
          open={isQuickOpenOpen}
          cwd={activeCwd}
          onOpenChange={setIsQuickOpenOpen}
          onSelectFile={(filePath) => {
            if (!activeTab || !activeTab.activePaneId) {
              return;
            }

            const activePane = activeTab.panes[activeTab.activePaneId];

            // Strategy 1: If active pane is a tab editor, open in that editor
            if (activePane?.type === "editor") {
              updatePaneProperty(activeTab.id, activeTab.activePaneId, {
                file: filePath,
              });
            }
            // Strategy 2: Active pane is NOT an editor - look for editor with matching CWD
            else {
              // Get the active pane's CWD (if it's a terminal)
              const activePaneCwd =
                activePane?.type === "terminal" ? activePane.cwd : null;

              // Look for editor panes in the same tab with matching CWD
              let matchingEditorPaneId: string | null = null;

              if (activePaneCwd) {
                for (const [paneId, pane] of Object.entries(activeTab.panes)) {
                  if (pane.type === "editor" && pane.cwd === activePaneCwd) {
                    matchingEditorPaneId = paneId;
                    break;
                  }
                }
              }

              if (matchingEditorPaneId) {
                // Strategy 2a: Open in matching editor pane
                updatePaneProperty(activeTab.id, matchingEditorPaneId, {
                  file: filePath,
                });
              } else {
                // Strategy 2b: No matching editor, open in sidebar
                store.set(sidebarStateAtom, {
                  isOpen: true,
                  view: "editor",
                  navigation: {
                    cwd: activeCwd,
                    editorFile: filePath,
                    editorTreeMode: "all",
                  },
                });
              }
            }
          }}
        />
      )}

      {hyperTerminals
        .filter((terminal) => terminal.state === "visible")
        .map((terminal, index) => (
          <HyperTerminal
            key={terminal.terminalId}
            terminal={terminal}
            index={index}
            hidden={applicationMode !== "normal"}
            onClose={() => closeHyperTerminal(terminal.terminalId)}
            onMinimize={() => minimizeHyperTerminal(terminal.terminalId)}
            onMaximize={() =>
              handleMaximizeHyperTerminal(terminal.terminalId, terminal.cwd)
            }
            onOpenAsTab={() =>
              moveHyperTerminalToTab(terminal.terminalId, terminal.cwd)
            }
            onPositionChange={(position) =>
              updateHyperTerminalPosition(terminal.terminalId, position)
            }
          />
        ))}

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

      <InputDialog
        isOpen={showDuplicateWorkspaceDialog}
        initialValue=""
        onClose={() => setShowDuplicateWorkspaceDialog(false)}
        onSave={handleDuplicateWorkspace}
        title="Duplicate workspace"
        placeholder="Enter name for the duplicated workspace..."
      />

      <DuplicateTabDialog
        isOpen={duplicateTabWithCwdDialogState !== null}
        initialCwd={
          duplicateTabWithCwdDialogState
            ? getActiveTabCwd(
                tabs.find((t) => t.id === duplicateTabWithCwdDialogState.tabId),
                homeDirectory ?? "",
              )
            : ""
        }
        initialTitle={
          duplicateTabWithCwdDialogState
            ? (generateIncrementedTabTitle(
                tabs.find((t) => t.id === duplicateTabWithCwdDialogState.tabId)
                  ?.name,
                tabs,
              ) ?? "")
            : ""
        }
        onClose={() => setDuplicateTabWithCwdDialogState(null)}
        onSave={handleDuplicateTabWithCwd}
      />

      <WorkspacePicker
        isOpen={showWorkspacePicker}
        onClose={() => setShowWorkspacePicker(false)}
        workspaces={workspaces.workspaces}
        onSessionsUpdate={updateWorkspaces}
      />

      <AgentCleanupDialog
        isOpen={cleanupDialogSessions !== null}
        sessions={cleanupDialogSessions ?? []}
        onClose={() => setCleanupDialogSessions(null)}
        onRemove={handleAgentSessionCleanup}
        onOpen={handleAgentSessionOpen}
      />

      <RepositoryDialog
        isOpen={isVMRepoDialogOpen}
        onClose={() => setIsVMRepoDialogOpen(false)}
        onSubmit={handleVMRepoSubmit}
      />

      {settingsTab && commandSystem && paneActionsSystem && homeDirectory ? (
        <SettingsDialog
          onClose={() => setSettingsTab(null)}
          commandRegistry={commandSystem.commandRegistry}
          keybindingRegistry={commandSystem.keybindingRegistry}
          homeDirectory={homeDirectory}
          initialTab={settingsTab}
          onUpdateSettings={userSettings.updateSettings}
          userSettings={userSettings}
        />
      ) : settingsTab ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
            <h2 className="text-white text-xl mb-4">System not initialized</h2>
            <p className="text-gray-400 mb-4">
              The system is still initializing. Please try again.
            </p>
            <button
              onClick={() => setSettingsTab(null)}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <AgentLauncherDialog
        isOpen={showAgentLauncher}
        agents={agents || []}
        launchGroups={launchGroups || []}
        defaultAgentId={agents?.find((agent: any) => agent.isDefault)?.id}
        onClose={() => setShowAgentLauncher(false)}
        onLaunch={async (payload) => {
          try {
            const cwd = getActiveTabCwd(activeTab);
            if (!cwd) {
              throw new Error("No working directory found in active pane");
            }

            console.log("[App] Launching agents:", {
              payload,
              agents: agents || [],
            });

            if (payload.launchTarget === "worktree") {
              await launchAgentsInWorktrees(payload, {
                cwd,
                agents: agents || [],
                api,
                onClose: () => setShowAgentLauncher(false),
              });
            } else if (payload.launchTarget === "same-folder") {
              await launchAgentsInSameFolder(payload, {
                cwd,
                agents: agents || [],
                api,
                onClose: () => setShowAgentLauncher(false),
              });
            } else {
              enqueueNotification({
                kind: "error",
                message: `Launch target "${payload.launchTarget}" is not yet implemented`,
              });
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            enqueueNotification({
              kind: "error",
              message: `Launch failed: ${errorMessage}`,
            });
          }
        }}
      />
    </div>
  );
}
