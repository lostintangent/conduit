import {
  type CommandRegistry,
  type ContextKeyService,
  getCommandRegistry,
  getContextKeyService,
  getKeybindingRegistry,
  type KeybindingRegistry,
} from "@/commands";
import {
  registerApplicationCommands,
  registerMenuContextBuilders,
} from "@/commands/applicationCommands";
import { updateKeybindingsAtom } from "@/commands/keybindings/updateKeybindingsAtom";
import {
  getUserKeybindingsPath,
  loadUserKeybindings,
} from "@/commands/keybindings/userKeybindings";
import { watchKeybindingsFile } from "@/commands/keybindings/watchKeybindings";
import type { ApplicationMode } from "@/store/atoms";
import { keybindingsAtom } from "@/store/atoms";
import { useEffect, useState } from "react";

export interface CommandSystemState {
  commandRegistry: CommandRegistry;
  keybindingRegistry: KeybindingRegistry;
  contextKeyService: ContextKeyService;
  isReady: boolean;
}

export interface UseCommandSystemOptions {
  activeTab: any;
  tabs: any[];
  applicationMode: ApplicationMode;
  setApplicationMode: (mode: ApplicationMode) => void;
  homeDirectory?: string | null;
  dotfilesRepo?: string;
  workspaceName?: string | null;
  // Context key data
  hasCustomLayout: (tabId: string) => boolean;
  hasLastWorkspace: boolean;
  // UI state setters
  setShowGeneralSettings: (show: boolean) => void;
  setShowKeybindingsEditor: (show: boolean) => void;
  setShowPaneActionsEditor: (show: boolean) => void;
  setShowAgentsEditor: (show: boolean) => void;
  setShowAgentLauncher: (show: boolean) => void;
  setShowRenameWorkspaceDialog: (show: boolean) => void;
  setShowWorkspacePicker: (show: boolean) => void;
  setIsUrlDialogOpen: (open: boolean) => void;
  setCleanupDialogSessions: (sessions: any[] | null) => void;
  setShowCreateWorkspaceDialog: (show: boolean) => void;
  setShowDuplicateWorkspaceDialog: (show: boolean) => void;
  setShowDuplicateTabWithCwdDialog: (tabId: string) => void;
  setTitleModal: (tabId: string, value: string) => void;
  setIsQuickOpenOpen: (open: boolean) => void;
  setQuickOpenInitialValue: (value: string) => void;
}

/**
 * Initializes and manages the command system
 *
 * This hook:
 * - Initializes the command registry and keybinding registry
 * - Registers application commands
 * - Sets up the context builder with current app state
 * - Manages the keybindings atom for reactive updates
 *
 * @returns Command system state with registries and ready flag
 */
export function useCommandSystem(
  options: UseCommandSystemOptions,
): CommandSystemState | null {
  const {
    activeTab,
    tabs,
    applicationMode,
    setApplicationMode,
    homeDirectory,
    dotfilesRepo,
    workspaceName,
    hasCustomLayout,
    hasLastWorkspace,
    setShowGeneralSettings,
    setShowKeybindingsEditor,
    setShowPaneActionsEditor,
    setShowAgentsEditor,
    setShowAgentLauncher,
    setShowRenameWorkspaceDialog,
    setShowWorkspacePicker,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    setShowCreateWorkspaceDialog,
    setShowDuplicateWorkspaceDialog,
    setShowDuplicateTabWithCwdDialog,
    setTitleModal,
    setIsQuickOpenOpen,
    setQuickOpenInitialValue,
  } = options;
  const setKeybindings = keybindingsAtom.set;

  const [commandSystem, setCommandSystem] = useState<{
    commandRegistry: CommandRegistry;
    keybindingRegistry: KeybindingRegistry;
    contextKeyService: ContextKeyService;
  } | null>(null);

  // Initialize command system ONCE
  useEffect(() => {
    const initialize = async () => {
      const commandRegistry = getCommandRegistry();
      const keybindingRegistry = getKeybindingRegistry();
      const contextKeyService = getContextKeyService();

      // Register application-level commands
      registerApplicationCommands(commandRegistry);

      // Register menu context builders
      registerMenuContextBuilders();

      // Load user keybindings if homeDirectory is available
      if (homeDirectory) {
        const keybindingsPath = getUserKeybindingsPath(homeDirectory);
        await loadUserKeybindings(keybindingRegistry, keybindingsPath);
      }

      // Populate keybindings atom with initial bindings (including user overrides)
      const allKeybindings = keybindingRegistry.getAllKeybindings();
      setKeybindings(allKeybindings);

      // Set up initial context builder immediately so keybinding listener can attach.
      // The context builder will be updated with fresh state in a subsequent effect,
      // but commands can execute with this initial context right away.
      commandRegistry.setContextBuilder(() => ({
        // Services (placeholder)
        commands: null as any,
        dialogs: null as any,
        notifications: null as any,
        settings: null as any,
        contextKeys: null as any,
        workspaces: null as any,
        tabs: null as any,
        panes: null as any,
        terminals: null as any,
        workspace: null as any,
        view: null as any,
        agent: null as any,
        // State - will be updated by subsequent effect
        activeTab: null,
        activePaneId: null,
        workspaceName: null,
        allTabs: [],
        applicationMode: "normal" as ApplicationMode,
        setApplicationMode: () => {},
        // UI state setters - no-ops until real context is set
        setShowGeneralSettings: () => {},
        setShowKeybindingsEditor: () => {},
        setShowPaneActionsEditor: () => {},
        setShowAgentsEditor: () => {},
        setShowAgentLauncher: () => {},
        setShowRenameWorkspaceDialog: () => {},
        setShowWorkspacePicker: () => {},
        setIsUrlDialogOpen: () => {},
        setCleanupDialogSessions: () => {},
        setShowCreateWorkspaceDialog: () => {},
        setShowDuplicateWorkspaceDialog: () => {},
        setShowDuplicateTabWithCwdDialog: () => {},
        setTitleModal: () => {},
        setIsQuickOpenOpen: () => {},
        setQuickOpenInitialValue: () => {},
      }));

      setCommandSystem({
        commandRegistry,
        keybindingRegistry,
        contextKeyService,
      });
    };

    initialize();
  }, [setKeybindings, homeDirectory]);

  // Update context builder whenever state changes
  useEffect(() => {
    if (!commandSystem?.commandRegistry) {
      return;
    }

    // Set up context builder to provide current app state to commands
    commandSystem.commandRegistry.setContextBuilder(() => ({
      // Services (placeholder)
      commands: null as any,
      dialogs: null as any,
      notifications: null as any,
      settings: null as any,
      contextKeys: null as any,
      workspaces: null as any,
      tabs: null as any,
      panes: null as any,
      terminals: null as any,
      workspace: null as any,

      // View service
      view: {
        openPaneActions: () => {
          setShowPaneActionsEditor(true);
        },
        openAgents: () => {
          setShowAgentsEditor(true);
        },
        openKeyboardShortcuts: () => {
          setShowKeybindingsEditor(true);
        },
        openSettings: (
          tab?: "general" | "keybindings" | "paneActions" | "agents",
        ) => {
          if (tab === "general") {
            setShowGeneralSettings(true);
          } else if (tab === "keybindings") {
            setShowKeybindingsEditor(true);
          } else if (tab === "paneActions") {
            setShowPaneActionsEditor(true);
          } else if (tab === "agents") {
            setShowAgentsEditor(true);
          } else {
            setShowGeneralSettings(true);
          }
        },
      },

      // Agent service
      agent: {
        showManageSessionsDialog: setCleanupDialogSessions,
      },

      // State accessors - fresh data on each command execution
      activeTab,
      activePaneId: activeTab?.activePaneId ?? null,
      workspaceName: workspaceName ?? null,
      allTabs: tabs,

      // Application mode
      applicationMode,
      setApplicationMode,

      // UI state setters
      setShowGeneralSettings,
      setShowKeybindingsEditor,
      setShowPaneActionsEditor,
      setShowAgentsEditor,
      setShowAgentLauncher,
      setShowRenameWorkspaceDialog,
      setShowWorkspacePicker,
      setIsUrlDialogOpen,
      setCleanupDialogSessions,
      setShowCreateWorkspaceDialog,
      setShowDuplicateWorkspaceDialog,
      setShowDuplicateTabWithCwdDialog,
      setTitleModal,
      setIsQuickOpenOpen,
      setQuickOpenInitialValue,
    }));
  }, [
    commandSystem,
    activeTab,
    tabs,
    applicationMode,
    setApplicationMode,
    workspaceName,
    setShowGeneralSettings,
    setShowKeybindingsEditor,
    setShowPaneActionsEditor,
    setShowAgentsEditor,
    setShowAgentLauncher,
    setShowRenameWorkspaceDialog,
    setShowWorkspacePicker,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    setShowCreateWorkspaceDialog,
    setShowDuplicateWorkspaceDialog,
    setShowDuplicateTabWithCwdDialog,
    setTitleModal,
    setIsQuickOpenOpen,
    setQuickOpenInitialValue,
  ]);

  // Update context keys whenever app state changes
  useEffect(() => {
    if (!commandSystem?.contextKeyService) {
      return;
    }

    const contextKeyService = commandSystem.contextKeyService;

    // Update global context keys
    contextKeyService.setGlobal("hasWorkspace", !!workspaceName);
    contextKeyService.setGlobal("hasLastWorkspace", hasLastWorkspace ?? false);
    contextKeyService.setGlobal("tabCount", tabs?.length ?? 0);
    contextKeyService.setGlobal(
      "hasActivePane",
      !!(activeTab && activeTab.activePaneId),
    );
    contextKeyService.setGlobal("tabIsLocked", Boolean(activeTab?.locked));
    contextKeyService.setGlobal("dotfilesEnabled", !!dotfilesRepo);

    contextKeyService.setGlobal(
      "hasCustomLayout",
      activeTab && hasCustomLayout ? hasCustomLayout(activeTab.id) : false,
    );

    // Pane-level context keys for the active pane (cleared when there is none)
    const panes = activeTab?.panes;
    const activePane = activeTab?.activePaneId
      ? panes?.[activeTab.activePaneId]
      : undefined;
    contextKeyService.setGlobal("activePaneType", activePane?.type || "");
    contextKeyService.setGlobal(
      "isInAgentSession",
      !!activePane?.agentSessionId,
    );
    contextKeyService.setGlobal(
      "hasCwd",
      !!(activePane?.type === "terminal" && activePane.cwd),
    );
    // Active pane is never collapsed (you can't interact with collapsed panes)
    contextKeyService.setGlobal("paneIsCollapsed", false);
    // For command palette, assume pane can be collapsed if there are multiple panes
    contextKeyService.setGlobal(
      "paneCanBeCollapsed",
      !!activePane && Object.keys(panes || {}).length > 1,
    );
  }, [
    commandSystem,
    workspaceName,
    hasLastWorkspace,
    tabs,
    activeTab,
    hasCustomLayout,
    dotfilesRepo,
  ]);

  // Watch keybindings file for external changes
  useEffect(() => {
    if (!commandSystem?.keybindingRegistry || !homeDirectory) {
      return;
    }

    const keybindingsPath = getUserKeybindingsPath(homeDirectory);

    const unwatch = watchKeybindingsFile(keybindingsPath, async () => {
      try {
        console.log("Keybindings file changed, reloading...");
        // Reload keybindings from file
        await loadUserKeybindings(
          commandSystem.keybindingRegistry,
          keybindingsPath,
        );
        // Update global atom for reactive components
        updateKeybindingsAtom();
      } catch (error) {
        console.error("Failed to reload keybindings after file change:", error);
      }
    });

    return () => {
      unwatch();
    };
  }, [commandSystem, homeDirectory]);

  // Return null until command system is initialized
  if (!commandSystem) {
    return null;
  }

  return {
    commandRegistry: commandSystem.commandRegistry,
    keybindingRegistry: commandSystem.keybindingRegistry,
    contextKeyService: commandSystem.contextKeyService,
    isReady: true,
  };
}
