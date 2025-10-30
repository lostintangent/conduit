/**
 * Action Resolution Hook
 *
 * Hook for resolving action configurations based on current working directory.
 */

import { useMemo } from 'react';
import { resolveAction } from '../resolution/resolveAction';
import type { Action, ResolvedActionConfig } from '../core/types';

/**
 * Resolve an action's configuration for the current working directory
 *
 * Applies path-based overrides to return the effective paneType and config.
 *
 * @param action - The action to resolve
 * @param cwd - Current working directory
 * @returns Resolved configuration
 */
export function useResolvedAction(
  action: Action | undefined,
  cwd: string
): ResolvedActionConfig | null {
  return useMemo(() => {
    if (!action) {
      return null;
    }

    return resolveAction(action, cwd);
  }, [action, cwd]);
}

/**
 * Resolve an action's configuration by name
 *
 * Finds the action by name and resolves it for the given cwd.
 *
 * @param actions - All actions
 * @param actionName - Name of the action to resolve
 * @param cwd - Current working directory
 * @returns Resolved configuration, or null if action not found
 */
export function useResolvedActionByName(
  actions: Action[],
  actionName: string,
  cwd: string
): ResolvedActionConfig | null {
  return useMemo(() => {
    const action = actions.find((a) => a.name === actionName);

    if (!action) {
      return null;
    }

    return resolveAction(action, cwd);
  }, [actions, actionName, cwd]);
}

/**
 * Resolve an action's configuration by index
 *
 * Gets the action by index and resolves it for the given cwd.
 *
 * @param actions - All actions
 * @param actionIndex - Index of the action
 * @param cwd - Current working directory
 * @returns Resolved configuration, or null if index out of bounds
 */
export function useResolvedActionByIndex(
  actions: Action[],
  actionIndex: number,
  cwd: string
): ResolvedActionConfig | null {
  return useMemo(() => {
    const action = actions[actionIndex];

    if (!action) {
      return null;
    }

    return resolveAction(action, cwd);
  }, [actions, actionIndex, cwd]);
}
