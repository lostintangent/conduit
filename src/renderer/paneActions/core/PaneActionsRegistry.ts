/**
 * Pane Actions Registry
 *
 * Manages the current set of pane actions and notifies listeners of changes.
 * Based on: docs/pane-actions-schema.md
 */

import type { Action } from './types';
import { getDefaultActions } from './defaults';

/**
 * Registry for pane actions
 *
 * Responsibilities:
 * - Store current action configurations (defaults or user-defined)
 * - Notify listeners when actions change
 * - Provide immutable access to actions
 */
export class PaneActionsRegistry {
  private actions: Action[] = [];
  private listeners: Array<() => void> = [];

  constructor() {
    // Initialize with defaults
    this.actions = getDefaultActions();
  }

  /**
   * Get all actions
   *
   * Returns a copy to prevent external mutations
   */
  getActions(): Action[] {
    return [...this.actions];
  }

  /**
   * Set actions (replaces all current actions)
   *
   * Used when loading from file or resetting to defaults.
   * Notifies all listeners of the change.
   */
  setActions(actions: Action[]): void {
    this.actions = actions;
    this.notifyListeners();
  }

  /**
   * Subscribe to action changes
   *
   * @param listener - Callback function to invoke when actions change
   * @returns Unsubscribe function
   */
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners that actions have changed
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
