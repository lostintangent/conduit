import { paneActionsAtom } from '@/store/atoms';
import { getDefaultStore } from 'jotai';
import type { Action } from '../core/types';

/**
 * Update the paneActions atom with new actions
 *
 * This should be called:
 * - After saving pane actions to file
 * - After resetting to defaults
 * - When pane actions file changes (via file watcher)
 *
 * This provides immediate UI updates without waiting for file watcher.
 *
 * @param actions - The new actions to set in the atom
 *
 * @example
 * await writePaneActionsFile(path, updatedActions);
 * updatePaneActionsAtom(updatedActions); // Notify React components immediately
 */
export function updatePaneActionsAtom(actions: Action[]): void {
  // Update the global Jotai store
  const store = getDefaultStore();
  store.set(paneActionsAtom, actions);
}
