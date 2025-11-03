import { getUserPaneActionsPath, writePaneActionsFile } from "./fileOperations";
import { updatePaneActionsAtom } from "./updatePaneActionsAtom";
import { getDefaultActions } from "../core/defaults";
import type { Action } from "../core/types";

/**
 * Save pane actions to file and update the atom
 *
 * This will:
 * 1. Validate the actions
 * 2. Write to file
 * 3. Update the global atom for immediate reactive updates
 *
 * @param actions - The actions to save
 * @param homeDirectory - Home directory path
 */
export async function savePaneActions(
  actions: Action[],
  homeDirectory: string,
): Promise<void> {
  const filePath = getUserPaneActionsPath(homeDirectory);

  // Write to file (this validates the actions)
  await writePaneActionsFile(filePath, actions);

  // Update global atom for immediate reactive updates
  updatePaneActionsAtom(actions);
}

/**
 * Reset pane actions to defaults
 *
 * This will:
 * 1. Delete the user configuration file
 * 2. Update the global atom with default actions
 *
 * @param homeDirectory - Home directory path
 */
export async function resetPaneActionsToDefaults(
  homeDirectory: string,
): Promise<void> {
  const filePath = getUserPaneActionsPath(homeDirectory);

  // Delete the user config file
  const api = window.conduit;
  if (!api?.deleteFile) {
    throw new Error("Conduit API not available");
  }

  await api.deleteFile(filePath);

  // Update global atom with defaults for immediate reactive updates
  const defaults = getDefaultActions();
  updatePaneActionsAtom(defaults);
}

/**
 * Check if user configuration file exists
 *
 * @param homeDirectory - Home directory path
 * @returns true if file exists, false otherwise
 */
export async function hasUserPaneActionsFile(
  homeDirectory: string,
): Promise<boolean> {
  const filePath = getUserPaneActionsPath(homeDirectory);
  const api = window.conduit;

  if (!api?.readFile) {
    return false;
  }

  try {
    await api.readFile(filePath);
    return true;
  } catch (error) {
    // File doesn't exist
    return false;
  }
}
