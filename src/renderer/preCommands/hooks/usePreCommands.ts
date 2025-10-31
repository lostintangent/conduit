import { useMemo } from "react";
import { PreCommandRegistry } from "../registry";
import type { PreCommand } from "../types";

/**
 * Get all registered pre-commands
 * @returns Array of all registered pre-commands
 */
export function usePreCommands(): PreCommand[] {
  return useMemo(() => {
    const registry = PreCommandRegistry.getInstance();
    return registry.getAll();
  }, []);
}

/**
 * Get a specific pre-command by ID
 * @param id The pre-command ID to find
 * @returns The pre-command or undefined if not found
 */
export function usePreCommand(id?: string): PreCommand | undefined {
  return useMemo(() => {
    if (!id) return undefined;
    const registry = PreCommandRegistry.getInstance();
    return registry.get(id);
  }, [id]);
}
