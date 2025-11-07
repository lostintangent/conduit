import {
  getCommandRegistry,
  getContextKeyService,
  getKeybindingRegistry,
  initializeCommandSystem,
  type ICommandRegistry,
  type IContextKeyService,
  type KeybindingRegistry,
} from "@/commands";
import { registerApplicationCommands } from "@/commands/applicationCommands";
import { updateKeybindingsAtom } from "@/commands/keybindings/updateKeybindingsAtom";
import {
  getUserKeybindingsPath,
  loadUserKeybindings,
} from "@/commands/keybindings/userKeybindings";
import { watchKeybindingsFile } from "@/commands/keybindings/watchKeybindings";
import type { ApplicationMode } from "@/store/atoms";
import { keybindingsAtom } from "@/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";

export interface CommandSystemState {
  commandRegistry: ICommandRegistry;
  keybindingRegistry: KeybindingRegistry;
  contextKeyService: IContextKeyService;
  isReady: boolean;
}

export interface UseCommandSystemOptions {
  activeTab: any;
  tabs: any[];
  applicationMode: ApplicationMode;
  setApplicationMode: (mode: ApplicationMode) => void;
  homeDirectory?: string;
  workspaceName?: string;
  // Context key data
  hasCustomLayout: (tabId: string) => boolean;
  hasLastWorkspace: boolean;
  // UI state setters
  setShowKeybindingsEditor: (show: boolean) => void;
  setShowPaneActionsEditor: (show: boolean) => void;
  setIsCommandPaletteOpenOverride: (open: boolean) => void;
  setShowRenameWorkspaceDialog: (show: boolean) => void;
  setShowWorkspacePicker: (show: boolean) => void;
  setIsUrlDialogOpen: (open: boolean) => void;
  setCleanupDialogSessions: (sessions: any[] | null) => void;
  setShowCreateWorkspaceDialog: (show: boolean) => void;
  setShowDuplicateWorkspaceDialog: (show: boolean) => void;
  setShowDuplicateTabWithCwdDialog: (show: boolean) => void;
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
  options: UseCommandSystemOptions
): CommandSystemState | null {
  const {
    activeTab,
    tabs,
    applicationMode,
    setApplicationMode,
    homeDirectory,
    workspaceName,
    hasCustomLayout,
    hasLastWorkspace,
    setShowKeybindingsEditor,
    setShowPaneActionsEditor,
    setIsCommandPaletteOpenOverride,
    setShowRenameWorkspaceDialog,
    setShowWorkspacePicker,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    setShowCreateWorkspaceDialog,
    setShowDuplicateWorkspaceDialog,
    setShowDuplicateTabWithCwdDialog,
  } = options;
  const setKeybindings = useSetAtom(keybindingsAtom);

  const [commandSystem, setCommandSystem] = useState<{
    commandRegistry: ICommandRegistry;
    keybindingRegistry: KeybindingRegistry;
    contextKeyService: IContextKeyService;
  } | null>(null);

  const [contextBuilderReady, setContextBuilderReady] = useState(false);

  // Initialize command system ONCE
  useEffect(() => {
    const initialize = async () => {
      initializeCommandSystem();

      const commandRegistry = getCommandRegistry();
      const keybindingRegistry = getKeybindingRegistry();
      const contextKeyService = getContextKeyService();

      // Register application-level commands
      registerApplicationCommands(commandRegistry);

      // Load user keybindings if homeDirectory is available
      if (homeDirectory) {
        const keybindingsPath = getUserKeybindingsPath(homeDirectory);
        await loadUserKeybindings(keybindingRegistry, keybindingsPath);
      }

      // Populate keybindings atom with initial bindings (including user overrides)
      const allKeybindings = keybindingRegistry.getAllKeybindings();
      setKeybindings(allKeybindings);

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
      },

      // Agent service
      agent: {
        showManageSessionsDialog: setCleanupDialogSessions,
      },

      // State accessors - fresh data on each command execution
      activeTab,
      activePaneId: activeTab?.activePaneId ?? null,
      workspaceName,
      allTabs: tabs,

      // Application mode
      applicationMode,
      setApplicationMode,

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
      setShowDuplicateTabWithCwdDialog,
    }));

    // Signal that context builder is ready - this causes keyboard listener to attach on next render
    setContextBuilderReady(true);
  }, [
    commandSystem,
    activeTab,
    tabs,
    applicationMode,
    setApplicationMode,
    workspaceName,
    setShowKeybindingsEditor,
    setShowPaneActionsEditor,
    setIsCommandPaletteOpenOverride,
    setShowRenameWorkspaceDialog,
    setShowWorkspacePicker,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    setShowCreateWorkspaceDialog,
    setShowDuplicateWorkspaceDialog,
    setShowDuplicateTabWithCwdDialog,
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
      !!(activeTab && activeTab.activePaneId)
    );

    // Update hasCustomLayout context key
    if (activeTab && hasCustomLayout) {
      contextKeyService.setGlobal(
        "hasCustomLayout",
        hasCustomLayout(activeTab.id)
      );
    } else {
      contextKeyService.setGlobal("hasCustomLayout", false);
    }

    // Update pane-level context keys for active pane
    if (activeTab?.activePaneId) {
      const activePane = activeTab.panes?.[activeTab.activePaneId];
      if (activePane) {
        contextKeyService.setGlobal("activePaneType", activePane.type || "");
        contextKeyService.setGlobal(
          "isInAgentSession",
          !!activePane.agentSessionId
        );
        contextKeyService.setGlobal(
          "hasCwd",
          !!(activePane.type === "terminal" && activePane.cwd)
        );
      } else {
        // Clear pane context keys if no active pane
        contextKeyService.setGlobal("activePaneType", "");
        contextKeyService.setGlobal("isInAgentSession", false);
        contextKeyService.setGlobal("hasCwd", false);
      }
    } else {
      // Clear pane context keys if no active pane
      contextKeyService.setGlobal("activePaneType", "");
      contextKeyService.setGlobal("isInAgentSession", false);
      contextKeyService.setGlobal("hasCwd", false);
    }
  }, [
    commandSystem,
    workspaceName,
    hasLastWorkspace,
    tabs,
    activeTab,
    hasCustomLayout,
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
          keybindingsPath
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

  // Return null until ready to prevent premature keyboard listener attachment
  if (!commandSystem || !contextBuilderReady) {
    return null;
  }

  return {
    commandRegistry: commandSystem.commandRegistry,
    keybindingRegistry: commandSystem.keybindingRegistry,
    contextKeyService: commandSystem.contextKeyService,
    isReady: true,
  };
}
