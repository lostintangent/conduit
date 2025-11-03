/**
 * Pane Actions System Hook
 *
 * Initializes the pane actions system: loads from file, sets up file watching,
 * and syncs with Jotai atom.
 */

import { useEffect, useState, useRef } from "react";
import { useSetAtom } from "jotai";
import { paneActionsAtom } from "@/store/atoms";
import { PaneActionsRegistry } from "../core/PaneActionsRegistry";
import { getUserPaneActionsPath } from "../io/fileOperations";
import type { PaneActionsWatcher } from "../io/watchPaneActions";

/**
 * Options for pane actions system initialization
 */
export interface UsePaneActionsSystemOptions {
  /**
   * Home directory for resolving config file path
   * If not provided, uses default from os.homedir()
   */
  homeDirectory?: string | null;
}

/**
 * System hook return value
 */
export interface PaneActionsSystem {
  /**
   * The pane actions registry instance
   */
  registry: PaneActionsRegistry;

  /**
   * Whether the system is ready (file loaded or determined not to exist)
   */
  isReady: boolean;
}

/**
 * Initialize the pane actions system
 *
 * This hook should be called once at the app level.
 *
 * Responsibilities:
 * - Creates registry (with defaults)
 * - Loads user config from ~/.conduit/paneactions.json (if exists)
 * - Sets up file watcher for external changes
 * - Syncs registry state with Jotai atom
 *
 * @param options - Initialization options
 * @returns System state (registry and ready flag)
 */
export function usePaneActionsSystem(
  options: UsePaneActionsSystemOptions = {},
): PaneActionsSystem | null {
  const { homeDirectory } = options;

  // Create registry once (persists across re-renders)
  const [registry] = useState(() => new PaneActionsRegistry());

  // Track ready state
  const [isReady, setIsReady] = useState(false);

  // Jotai atom setter
  const setPaneActions = useSetAtom(paneActionsAtom);

  // Track watcher for cleanup
  const watcherRef = useRef<PaneActionsWatcher | null>(null);

  // Sync registry to atom whenever actions change
  useEffect(() => {
    // Initial sync
    setPaneActions(registry.getActions());

    // Listen for changes
    const unsubscribe = registry.onChange(() => {
      setPaneActions(registry.getActions());
    });

    return unsubscribe;
  }, [registry, setPaneActions]);

  // Load from file and set up watching
  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      // Wait for homeDirectory to be available
      if (!homeDirectory) {
        return;
      }

      try {
        // Get config file path
        const filePath = getUserPaneActionsPath(homeDirectory);

        // Try to load user config
        const loaded = await registry.loadFromFile(filePath);

        if (!isMounted) return;

        if (loaded) {
          console.log("[PaneActions] Loaded user configuration");
        } else {
          console.log("[PaneActions] Using default configuration");
        }

        // Set up file watcher for external changes
        watcherRef.current = registry.watchFile(filePath, (error) => {
          console.error("[PaneActions] Config file error:", error.message);
          // Optionally reset to defaults on error
          // registry.resetToDefaults();
        });

        // Mark as ready
        setIsReady(true);
      } catch (error) {
        console.error("[PaneActions] Failed to initialize:", error);

        // Still mark as ready (using defaults)
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    initialize();

    return () => {
      isMounted = false;

      // Cleanup watcher
      if (watcherRef.current) {
        watcherRef.current.dispose();
        watcherRef.current = null;
      }
    };
  }, [registry, homeDirectory]);

  // Don't return system until we have a valid homeDirectory
  if (!homeDirectory) {
    return null;
  }

  return {
    registry,
    isReady,
  };
}
