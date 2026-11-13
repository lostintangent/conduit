/**
 * Pane Actions Consumption Hooks
 *
 * Hooks for consuming pane actions in components.
 */

import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { paneActionsAtom } from "@/store/atoms";
import type { Action } from "../core/types";

/**
 * Get all pane actions
 *
 * Returns all actions (enabled and disabled) from the Jotai atom.
 *
 * @returns All actions
 */
export function usePaneActions(): Action[] {
  return useAtomValue(paneActionsAtom);
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
  const actions = useAtomValue(paneActionsAtom);

  return useMemo(() => {
    return actions.filter((action) => action.enabled);
  }, [actions]);
}
