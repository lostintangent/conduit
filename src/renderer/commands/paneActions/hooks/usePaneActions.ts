/**
 * Pane Actions Consumption Hooks
 *
 * Hooks for consuming pane actions in components.
 */

import { useSelector } from "@tanstack/react-store";
import { useMemo } from "react";
import { paneActionsAtom } from "@/store/atoms";
import type { Action } from "../core/types";

/**
 * Get all pane actions
 *
 * Returns all actions (enabled and disabled) from the store atom.
 *
 * @returns All actions
 */
export function usePaneActions(): Action[] {
  return useSelector(paneActionsAtom);
}

/**
 * Get only enabled pane actions
 *
 * Filters actions to return only those with enabled=true.
 * Most UI components should use this hook.
 *
 * @returns Enabled actions only
 */
export function useEnabledPaneActions(): Action[] {
  const actions = useSelector(paneActionsAtom);

  return useMemo(() => {
    return actions.filter((action) => action.enabled);
  }, [actions]);
}
