import { useCommandSystem } from "@/commands/hooks/useCommandSystem";
import { useKeybindingDispatch } from "@/commands/hooks/useKeybindingDispatch";
import { usePaneActionsSystem } from "@/commands/paneActions";
import { registerDefaultPreCommands } from "@/commands/preCommands";
import { TabContentPortalProvider } from "@/components/layout/normal/TabContentPortalContext";
import { TabLayout } from "@/components/layout/normal/TabLayout";
import { TabsOverview } from "@/components/layout/overview/TabsOverview";
import { FloatingTerminal } from "@/components/layout/quick/FloatingTerminal";
import {
  QuickDialog,
  type PaneDescriptor,
  type QuickPaneDescriptor,
} from "@/components/layout/quick/QuickDialog";
import {
  disposeSession,
  updateTerminalFonts,
  updateTerminalThemes,
} from "@/components/panes/terminal/xtermCache";
import { KeybindingsEditor } from "@/components/shell/keybindings/KeybindingsEditor";
import { NotificationCenter } from "@/components/shell/NotificationCenter";
import { AgentCleanupDialog } from "@/components/shell/palette/AgentCleanupDialog";
import { CommandPalette } from "@/components/shell/palette/CommandPalette";
import { WorkspacePicker } from "@/components/shell/palette/WorkspacePicker";
import { PaneActionsEditor } from "@/components/shell/paneActions";
import { DuplicateTabDialog } from "@/components/shell/tabs/DuplicateTabDialog";
import { RepositoryDialog } from "@/components/shell/tabs/RepositoryDialog";
import { TabStrip } from "@/components/shell/tabs/TabStrip";
import { TerminalFontSettingsDialog } from "@/components/shell/TerminalFontSettingsDialog";
import { TitleBar } from "@/components/shell/title/TitleBar";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { InputDialog } from "@/components/ui/input-dialog";
import { useAutoUpdater } from "@/hooks/useAutoUpdater";
import { useCliClient } from "@/hooks/useCliClient";
import { useCommands } from "@/hooks/useCommands";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useGlobalKeyHandlers } from "@/hooks/useGlobalKeyHandlers";
import { useLayoutResizing } from "@/hooks/useLayoutResizing";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import {
  dismissNotification,
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import { openWebViewPane, removePane } from "@/store/actions/pane";
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
  floatingTerminalAtom,
  keybindingsAtom,
  tabsAtom,
} from "@/store/atoms";
import type { EditorPane } from "@/types";
import { applyTheme, watchSystemTheme } from "@/utils/theme";
import type { AgentSessionInfo } from "@shared/types";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

const api = window.conduit;

export function App() {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const [applicationMode, setApplicationMode] = useAtom(applicationModeAtom);
  const setKeybindings = useSetAtom(keybindingsAtom);
  const [floatingTerminal, setFloatingTerminal] = useAtom(floatingTerminalAtom);

  const {
    tabPosition,
    alwaysShowTabs,
    commandHistory,
    homeDirectory,
    theme,
    themeOverrides,
    terminalFontFamily,
    terminalFontSize,
    updateSettings,
    addCommandHistoryEntry: recordCommandHistoryEntry,
    removeCommandHistoryEntry,
  } = useUserSettings();

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
  const [quickPaneState, setQuickPaneState] =
    useState<QuickPaneDescriptor | null>(null);
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);
  const [isVMRepoDialogOpen, setIsVMRepoDialogOpen] = useState(false);
  const [cleanupDialogSessions, setCleanupDialogSessions] = useState<
    AgentSessionInfo[] | null
  >(null);
  const [isTabDrawerOpen, setIsTabDrawerOpen] = useState(false);
  const [showKeybindingsEditor, setShowKeybindingsEditor] = useState(false);
  const [showPaneActionsEditor, setShowPaneActionsEditor] = useState(false);
  const [showTerminalFontSettings, setShowTerminalFontSettings] =
    useState(false);

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

  useCliClient({
    onOpenFile: setQuickPaneState,
  });

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
    workspaceName,
    // Context key data
    hasCustomLayout,
    hasLastWorkspace,
    // UI state setters
    setShowKeybindingsEditor,
    setShowPaneActionsEditor,
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

  useEffect(() => {
    const closeTerminalSession = (sessionId: string) => {
      disposeSession(sessionId);
    };

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

        closeTerminalSession(sessionId);
        return null;
      });

      // Handle floating terminal exit
      setFloatingTerminal((current) => {
        if (!current || current.terminalId !== sessionId) {
          return current;
        }

        closeTerminalSession(sessionId);
        return null;
      });
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
      if (tabs.length > 0) {
        void api.workspace.saveLastWorkspace(tabs, activeTab?.id);
      }
    });

    const unsubscribeOpenTerminalFontSettings = api.onOpenTerminalFontSettings(
      () => {
        setShowTerminalFontSettings(true);
      },
    );

    return () => {
      unsubscribeExit();
      unsubscribeNotification();
      unsubscribeBeforeClose();
      unsubscribeOpenTerminalFontSettings();
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
    [titleModalState, updateTabProperty],
  );

  const handleWebViewUpdate = useCallback(
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

      const result = await api.createTerminal(
        requestedCwd ? { cwd: requestedCwd } : undefined,
      );
      if (!result) {
        return;
      }

      const commandWithNewline =
        command.endsWith("\n") || command.endsWith("\r")
          ? command
          : `${command}\n`;
      api.sendKeypress(result.sessionId, commandWithNewline);

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
          vmMetadata: result.vmMetadata ?? undefined,
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

  const handleShellCommand = useCallback(
    async (rawCommand: string) => {
      await runShellCommand(rawCommand, { trackHistory: true });
    },
    [runShellCommand],
  );

  const handleOpenWebPage = useCallback(
    (url: string) => {
      if (!activeTab || !activeTab.activePaneId) {
        return;
      }

      openWebViewPane(activeTab.id, activeTab.activePaneId, url);
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

  const handleOpenQuickPane = useCallback((descriptor: PaneDescriptor) => {
    setQuickPaneState(descriptor);
  }, []);

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

        setFloatingTerminal({ terminalId, paneId, cwd });

        return null;
      });
    },
    [setFloatingTerminal],
  );

  const handleOpenFloatingTerminal = useCallback(
    (terminalId: string, paneId: string, cwd: string | null) => {
      // Directly open terminal in floating overlay.
      setFloatingTerminal({ terminalId, paneId, cwd });
    },
    [setFloatingTerminal],
  );

  const handleCloseFloatingTerminal = useCallback(() => {
    setFloatingTerminal((current) => {
      if (!current) {
        return current;
      }

      api.closeTerminal(current.terminalId);
      disposeSession(current.terminalId);

      return null;
    });
  }, [setFloatingTerminal]);

  const handleMaximizeFloatingTerminal = useCallback(
    (terminalId: string, cwd: string | null) => {
      // Transfer terminal from floating overlay back to quick dialog.
      setFloatingTerminal(null);
      setQuickPaneState({
        type: "terminal",
        sessionId: terminalId,
        cwd,
      });
    },
    [setFloatingTerminal, setQuickPaneState],
  );

  const handleOpenFloatingTerminalAsTab = useCallback(
    async (terminalId: string, cwd: string | null) => {
      // Transfer terminal from floating overlay to new tab.
      setFloatingTerminal(null);

      const { openTabFromExistingSession } = await import(
        "@/store/actions/tab"
      );
      await openTabFromExistingSession({
        sessionId: terminalId,
        cwd,
      });
    },
    [setFloatingTerminal],
  );

  const shouldUseDrawer = !alwaysShowTabs;

  return (
    <div className="flex-1 flex flex-col min-h-0 rounded-xl overflow-hidden">
      <TitleBar
        onUpdateSettings={updateSettings}
        onOpenTerminalFontSettings={() => setShowTerminalFontSettings(true)}
      />

      <TabContentPortalProvider>
        {/* Top positioned tabs */}
        {tabPosition === "top" && !shouldUseDrawer && (
          <TabStrip
            onOpenCommandPalette={openCommandPalette}
            onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
            onOpenQuickPane={handleOpenQuickPane}
            onOpenFloatingTerminal={handleOpenFloatingTerminal}
            position={tabPosition}
          />
        )}

        {shouldUseDrawer && tabPosition === "top" && (
          <Drawer open={isTabDrawerOpen} onOpenChange={setIsTabDrawerOpen}>
            <DrawerContent side="top">
              <TabStrip
                onOpenCommandPalette={openCommandPalette}
                onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
                onOpenQuickPane={handleOpenQuickPane}
                onOpenFloatingTerminal={handleOpenFloatingTerminal}
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
              handleWebViewUpdate={handleWebViewUpdate}
              handleEditorUpdate={handleEditorUpdate}
              onOpenQuickPane={handleOpenQuickPane}
              onOpenPaneActions={() => setShowPaneActionsEditor(true)}
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
            onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
            onOpenQuickPane={handleOpenQuickPane}
            onOpenFloatingTerminal={handleOpenFloatingTerminal}
            position={tabPosition}
          />
        )}

        {shouldUseDrawer && tabPosition === "bottom" && (
          <Drawer open={isTabDrawerOpen} onOpenChange={setIsTabDrawerOpen}>
            <DrawerContent side="bottom">
              <TabStrip
                onOpenCommandPalette={openCommandPalette}
                onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
                onOpenQuickPane={handleOpenQuickPane}
                onOpenFloatingTerminal={handleOpenFloatingTerminal}
                position={tabPosition}
              />
            </DrawerContent>
          </Drawer>
        )}
      </TabContentPortalProvider>

      {/* Global UI */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => {
          closeCommandPalette();
          setIsCommandPaletteOpenOverride(false);
        }}
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

      {quickPaneState && (
        <QuickDialog
          paneDescriptor={quickPaneState}
          onClose={handleCloseQuickPane}
          onOpenAsTab={handleOpenQuickPaneAsTab}
          onOpenAsFloating={handleOpenQuickPaneAsFloating}
        />
      )}

      {floatingTerminal && (
        <FloatingTerminal
          terminalId={floatingTerminal.terminalId}
          paneId={floatingTerminal.paneId}
          cwd={floatingTerminal.cwd}
          onClose={handleCloseFloatingTerminal}
          onMaximize={() =>
            handleMaximizeFloatingTerminal(
              floatingTerminal.terminalId,
              floatingTerminal.cwd,
            )
          }
          onOpenAsTab={() =>
            handleOpenFloatingTerminalAsTab(
              floatingTerminal.terminalId,
              floatingTerminal.cwd,
            )
          }
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
                  ?.title,
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

      {showKeybindingsEditor && commandSystem && homeDirectory ? (
        <KeybindingsEditor
          onClose={() => setShowKeybindingsEditor(false)}
          commandRegistry={commandSystem.commandRegistry}
          keybindingRegistry={commandSystem.keybindingRegistry}
          homeDirectory={homeDirectory}
          onOpenQuickPane={handleOpenQuickPane}
        />
      ) : showKeybindingsEditor ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
            <h2 className="text-white text-xl mb-4">
              Command system not initialized
            </h2>
            <p className="text-gray-400 mb-4">
              The command system is still initializing. Please try again.
            </p>
            <button
              onClick={() => setShowKeybindingsEditor(false)}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {showPaneActionsEditor && paneActionsSystem && homeDirectory ? (
        <PaneActionsEditor
          onClose={() => setShowPaneActionsEditor(false)}
          homeDirectory={homeDirectory}
          onOpenQuickPane={handleOpenQuickPane}
        />
      ) : showPaneActionsEditor ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
            <h2 className="text-white text-xl mb-4">
              Pane actions system not initialized
            </h2>
            <p className="text-gray-400 mb-4">
              The pane actions system is still initializing. Please try again.
            </p>
            <button
              onClick={() => setShowPaneActionsEditor(false)}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <TerminalFontSettingsDialog
        isOpen={showTerminalFontSettings}
        initialFontFamily={terminalFontFamily}
        initialFontSize={terminalFontSize}
        onClose={() => setShowTerminalFontSettings(false)}
        onSave={async (fontFamily, fontSize) => {
          await updateSettings({
            terminalFontFamily: fontFamily,
            terminalFontSize: fontSize,
          });
          updateTerminalFonts(fontFamily, fontSize);
        }}
      />
    </div>
  );
}
