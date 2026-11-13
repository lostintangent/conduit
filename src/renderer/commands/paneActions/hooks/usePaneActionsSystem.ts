/**
 * Pane Actions System Hook
 *
 * Loads user pane actions from file into the Jotai atom and keeps them in
 * sync with external file changes. The atom starts with the default actions.
 */

import { useEffect } from "react";
import {
  getUserPaneActionsPath,
  readPaneActionsFile,
} from "../io/fileOperations";
import { updatePaneActionsAtom } from "../io/updatePaneActionsAtom";
import {
  type PaneActionsWatcher,
  watchPaneActionsFile,
} from "../io/watchPaneActions";

/**
 * Options for pane actions system initialization
 */
export interface UsePaneActionsSystemOptions {
  /**
   * Home directory for resolving config file path
   */
  homeDirectory?: string | null;
}

/**
 * Initialize the pane actions system
 *
 * This hook should be called once at the app level.
 */
export function usePaneActionsSystem(
  options: UsePaneActionsSystemOptions = {},
): void {
  const { homeDirectory } = options;

  useEffect(() => {
    // Wait for homeDirectory to be available
    if (!homeDirectory) {
      return;
    }

    let isMounted = true;
    let watcher: PaneActionsWatcher | null = null;

    async function initialize(filePath: string) {
      try {
        // Keep the defaults when the user config file doesn't exist
        const actions = await readPaneActionsFile(filePath);
        if (actions !== null) {
          updatePaneActionsAtom(actions);
        }

        if (!isMounted) return;

        // Set up file watcher for external changes
        watcher = watchPaneActionsFile({
          filePath,
          onChange: updatePaneActionsAtom,
          onError: (error) => {
            console.error("[PaneActions] Config file error:", error.message);
          },
        });
      } catch (error) {
        console.error("[PaneActions] Failed to initialize:", error);
      }
    }

    initialize(getUserPaneActionsPath(homeDirectory));

    return () => {
      isMounted = false;
      watcher?.dispose();
    };
  }, [homeDirectory]);
}
