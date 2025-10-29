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
import { loadUserKeybindings } from '@/commands/keybindings/userKeybindings';
import { keybindingsAtom } from '@/store/atoms';
import { enterFocusMode } from '@/store/actions/focusMode';
import type { ApplicationMode } from '@/store/atoms';

export interface CommandSystemState {
  commandRegistry: ICommandRegistry;
  keybindingRegistry: KeybindingRegistry;
  isReady: boolean;
}

export interface UseCommandSystemOptions {
  activeTab: any;
  applicationMode: ApplicationMode;
  setApplicationMode: (mode: ApplicationMode) => void;
  homeDirectory?: string;
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
  const { activeTab, applicationMode, setApplicationMode, homeDirectory } = options;
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
        const keybindingsPath = `${homeDirectory}/.conduit/keybindings.json`;
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
      tabs: null as any,
      panes: null as any,
      terminals: null as any,
      workspaces: null as any,
      commands: null as any,
      dialogs: null as any,
      notifications: null as any,
      settings: null as any,
      contextKeys: null as any,

      // View service
      view: {
        enterFocusMode: (tabId: string, paneId: string) => {
          enterFocusMode(tabId, paneId);
        },
        togglePaneControls: () => {
          const current = applicationMode;
          setApplicationMode(current === 'design' ? 'normal' : 'design');
        },
      },

      // State accessors - these will be fresh on each command execution
      activeTab,
      activePaneId: activeTab?.activePaneId ?? null,
      workspaceName: undefined,
    }));

    // Signal that context builder is ready - this causes keyboard listener to attach on next render
    setContextBuilderReady(true);
  }, [commandSystem, activeTab, applicationMode, setApplicationMode]);

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
