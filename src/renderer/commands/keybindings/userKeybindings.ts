import { parseKeybindingsFile, isRemovalBinding, getRemovalCommandId } from './keybindingsFile';
import type { KeybindingRegistry } from './KeybindingRegistry';

/**
 * Conduit API interface (exposed via Electron preload)
 */
declare global {
  interface Window {
    conduit?: {
      readFile?: (filePath: string) => Promise<string | null>;
      watchFile?: (filePath: string, callback: () => void) => { dispose: () => void } | undefined;
    };
  }
}

/**
 * Load user keybindings from file
 */
export async function loadUserKeybindings(
  keybindingRegistry: KeybindingRegistry,
  filePath: string
): Promise<void> {
  try {
    // Read file (use fs in Electron main process)
    const content = await window.conduit?.readFile?.(filePath);
    if (!content) return;

    const userBindings = parseKeybindingsFile(content);

    // Apply user keybindings with higher weight
    for (const binding of userBindings) {
      if (isRemovalBinding(binding.command)) {
        // Remove keybinding for this command
        const commandId = getRemovalCommandId(binding.command);
        keybindingRegistry.unregister(commandId);
      } else {
        // Add keybinding with high weight (user bindings override defaults)
        keybindingRegistry.register(
          binding.command,
          { key: binding.key },
          1000 // High weight for user bindings
        );
      }
    }
  } catch (error) {
    console.error('Failed to load user keybindings:', error);
  }
}
