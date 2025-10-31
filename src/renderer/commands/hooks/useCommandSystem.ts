import { useState, useEffect } from 'react';
import { useSetAtom } from 'jotai';
import {
  initializeCommandSystem,
  getCommandRegistry,
  getKeybindingRegistry,
  type ICommandRegistry,
  type KeybindingRegistry,
} from '@/commands';
import { registerApplicationCommands } from '@/commands/applicationCommands';
import { loadUserKeybindings, getUserKeybindingsPath } from '@/commands/keybindings/userKeybindings';
import { watchKeybindingsFile } from '@/commands/keybindings/watchKeybindings';
import { updateKeybindingsAtom } from '@/commands/keybindings/updateKeybindingsAtom';
import { keybindingsAtom } from '@/store/atoms';
import { toggleFocusMode } from '@/store/actions/focusMode';
import type { ApplicationMode } from '@/store/atoms';

export interface CommandSystemState {
  commandRegistry: ICommandRegistry;
  keybindingRegistry: KeybindingRegistry;
  isReady: boolean;
}

export interface UseCommandSystemOptions {
  activeTab: any;
  tabs: any[];
  applicationMode: ApplicationMode;
  setApplicationMode: (mode: ApplicationMode) => void;
  homeDirectory?: string;
  workspaceName?: string;
  // UI state setters
  setShowKeybindingsEditor: (show: boolean) => void;
  setIsCommandPaletteOpenOverride: (open: boolean) => void;
  setShowRenameWorkspaceDialog: (show: boolean) => void;
  setShowWorkspacePicker: (show: boolean) => void;
  setIsUrlDialogOpen: (open: boolean) => void;
  setCleanupDialogSessions: (sessions: any[] | null) => void;
  setShowCreateWorkspaceDialog: (show: boolean) => void;
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
export function useCommandSystem(options: UseCommandSystemOptions): CommandSystemState | null {
  const {
    activeTab,
    tabs,
    applicationMode,
    setApplicationMode,
    homeDirectory,
    workspaceName,
    setShowKeybindingsEditor,
    setIsCommandPaletteOpenOverride,
    setShowRenameWorkspaceDialog,
    setShowWorkspacePicker,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    setShowCreateWorkspaceDialog,
  } = options;
  const setKeybindings = useSetAtom(keybindingsAtom);

  const [commandSystem, setCommandSystem] = useState<{
    commandRegistry: ICommandRegistry;
    keybindingRegistry: KeybindingRegistry;
  } | null>(null);

  const [contextBuilderReady, setContextBuilderReady] = useState(false);

  // Initialize command system ONCE
  useEffect(() => {
    const initialize = async () => {
      initializeCommandSystem();

      const commandRegistry = getCommandRegistry();
      const keybindingRegistry = getKeybindingRegistry();

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
      view: null as any,
      workspace: null as any,
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
      setIsCommandPaletteOpenOverride,
      setShowRenameWorkspaceDialog,
      setShowWorkspacePicker,
      setIsUrlDialogOpen,
      setCleanupDialogSessions,
      setShowCreateWorkspaceDialog,
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
    setIsCommandPaletteOpenOverride,
    setShowRenameWorkspaceDialog,
    setShowWorkspacePicker,
    setIsUrlDialogOpen,
    setCleanupDialogSessions,
    setShowCreateWorkspaceDialog,
  ]);

  // Watch keybindings file for external changes
  useEffect(() => {
    if (!commandSystem?.keybindingRegistry || !homeDirectory) {
      return;
    }

    const keybindingsPath = getUserKeybindingsPath(homeDirectory);

    const unwatch = watchKeybindingsFile(keybindingsPath, async () => {
      try {
        console.log('Keybindings file changed, reloading...');
        // Reload keybindings from file
        await loadUserKeybindings(commandSystem.keybindingRegistry, keybindingsPath);
        // Update global atom for reactive components
        updateKeybindingsAtom();
      } catch (error) {
        console.error('Failed to reload keybindings after file change:', error);
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
    isReady: true,
  };
}
