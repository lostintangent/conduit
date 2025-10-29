import { getKeybindingRegistry } from '@/commands';
import { keybindingsAtom } from '@/store/atoms';
import { getDefaultStore } from 'jotai';

/**
 * Update the keybindings atom with current keybindings from the registry
 *
 * This should be called:
 * - After initial command system setup
 * - After loading user keybindings
 * - When keybindings file changes (via file watcher)
 *
 * @example
 * await loadUserKeybindings(registry, path);
 * updateKeybindingsAtom(); // Notify React components
 */
export function updateKeybindingsAtom(): void {
  const keybindingRegistry = getKeybindingRegistry();
  const allKeybindings = keybindingRegistry.getAllKeybindings();

  // Update the global Jotai store
  const store = getDefaultStore();
  store.set(keybindingsAtom, allKeybindings);
}
