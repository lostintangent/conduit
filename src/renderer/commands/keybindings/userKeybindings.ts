import { parseKeybindingsFile, isRemovalBinding, getRemovalCommandId } from './keybindingsFile';
import type { KeybindingRegistry } from './KeybindingRegistry';

/**
 * Load user keybindings from file
 *
 * Note: window.conduit API is defined globally in src/renderer/global.d.ts
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
        // Unregister all existing keybindings for this command first
        // (removes defaults so only the user's binding is active)
        keybindingRegistry.unregister(binding.command);

        // Add keybinding with high weight (user bindings override defaults)
        keybindingRegistry.register(
          binding.command,
          { key: binding.key },
          1000 // High weight for user bindings
        );
      }
    }
  } catch (error: any) {
    // Don't log error if file doesn't exist yet - that's expected on first run
    if (!error?.message?.includes('ENOENT')) {
      console.error('Failed to load user keybindings:', error);
    }
  }
}
