/**
 * Pane Actions Registry
 *
 * Manages the current set of pane actions and notifies listeners of changes.
 * Based on: docs/pane-actions-schema.md
 */

import type { Action, ResolvedActionConfig } from './types';
import { getDefaultActions } from './defaults';
import { resolveAction } from '../resolution/resolveAction';
import { readPaneActionsFile } from '../io/fileOperations';
import { watchPaneActionsFile, type PaneActionsWatcher } from '../io/watchPaneActions';

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
   * Resolve an action's configuration for a given current working directory
   *
   * Applies path-based overrides when applicable.
   *
   * @param actionName - Name of the action to resolve
   * @param cwd - Current working directory
   * @returns Resolved pane type and configuration, or null if action not found
   */
  resolveActionByName(
    actionName: string,
    cwd: string
  ): ResolvedActionConfig | null {
    const action = this.actions.find((a) => a.name === actionName);
    if (!action) {
      return null;
    }

    return resolveAction(action, cwd);
  }

  /**
   * Resolve an action's configuration by index
   *
   * Applies path-based overrides when applicable.
   *
   * @param actionIndex - Index of the action in the actions array
   * @param cwd - Current working directory
   * @returns Resolved pane type and configuration, or null if index out of bounds
   */
  resolveActionByIndex(
    actionIndex: number,
    cwd: string
  ): ResolvedActionConfig | null {
    const action = this.actions[actionIndex];
    if (!action) {
      return null;
    }

    return resolveAction(action, cwd);
  }

  /**
   * Load actions from file
   *
   * If file exists and is valid, loads actions and updates registry.
   * If file doesn't exist, keeps current actions (defaults).
   * If file is invalid, throws error.
   *
   * @param filePath - Path to pane actions file
   * @returns true if file was loaded, false if file doesn't exist
   * @throws Error if file is invalid
   */
  async loadFromFile(filePath: string): Promise<boolean> {
    const actions = await readPaneActionsFile(filePath);

    if (actions === null) {
      // File doesn't exist, keep current actions
      return false;
    }

    // File exists and is valid, update registry
    this.setActions(actions);
    return true;
  }

  /**
   * Reset to default actions
   *
   * Replaces current actions with defaults and notifies listeners.
   */
  resetToDefaults(): void {
    this.setActions(getDefaultActions());
  }

  /**
   * Watch a file for changes and auto-reload
   *
   * When the file changes:
   * - If valid: updates registry and notifies listeners
   * - If invalid or deleted: calls onError callback (if provided)
   *
   * @param filePath - Path to file to watch
   * @param onError - Optional callback for errors
   * @returns Watcher handle with dispose() method
   */
  watchFile(
    filePath: string,
    onError?: (error: Error) => void
  ): PaneActionsWatcher {
    return watchPaneActionsFile({
      filePath,
      onChange: (actions) => {
        this.setActions(actions);
      },
      onError,
    });
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
