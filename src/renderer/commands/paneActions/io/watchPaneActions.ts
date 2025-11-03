/**
 * File watching for pane actions configuration
 *
 * Detects external changes to ~/.conduit/paneactions.json and reloads.
 */

import type { Action } from "../core/types";
import { readPaneActionsFile } from "./fileOperations";
import { ValidationError } from "./validation";

/**
 * Callback when file changes and is successfully reloaded
 */
export type FileChangeCallback = (actions: Action[]) => void;

/**
 * Callback when file change is detected but load fails
 */
export type FileErrorCallback = (error: Error) => void;

/**
 * Options for file watching
 */
export interface WatchPaneActionsOptions {
  /**
   * Path to pane actions file to watch
   */
  filePath: string;

  /**
   * Callback when file changes and is successfully reloaded
   */
  onChange: FileChangeCallback;

  /**
   * Optional callback when file change is detected but load fails
   * (e.g., file was deleted, became invalid JSON, etc.)
   */
  onError?: FileErrorCallback;
}

/**
 * Watcher handle with cleanup
 */
export interface PaneActionsWatcher {
  /**
   * Stop watching the file
   */
  dispose: () => void;
}

/**
 * Watch pane actions file for external changes
 *
 * When the file changes:
 * 1. Reads and validates the file
 * 2. If valid, calls onChange with new actions
 * 3. If invalid or error, calls onError (if provided)
 *
 * File deletion is treated as an error (onError called with appropriate error).
 *
 * @param options - Watch options
 * @returns Watcher handle with dispose method
 */
export function watchPaneActionsFile(
  options: WatchPaneActionsOptions,
): PaneActionsWatcher {
  const { filePath, onChange, onError } = options;

  // Track whether we're currently processing a change
  // This helps with debouncing (some editors trigger multiple change events)
  let isProcessing = false;
  let debounceTimer: NodeJS.Timeout | null = null;

  // Handler when file changes
  const handleFileChange = async () => {
    // Debounce: Clear any pending change processing
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set a short debounce delay (100ms)
    debounceTimer = setTimeout(async () => {
      // Skip if already processing
      if (isProcessing) {
        return;
      }

      isProcessing = true;

      try {
        // Read and validate the file
        const actions = await readPaneActionsFile(filePath);

        if (actions === null) {
          // File was deleted
          if (onError) {
            onError(new Error("Pane actions file was deleted"));
          }
        } else {
          // File is valid, notify listener
          onChange(actions);
        }
      } catch (error) {
        // File exists but is invalid
        if (onError) {
          if (error instanceof ValidationError) {
            onError(error);
          } else {
            onError(
              new Error(
                `Failed to load pane actions: ${(error as Error).message}`,
              ),
            );
          }
        }
      } finally {
        isProcessing = false;
      }
    }, 100);
  };

  // Set up file watcher using window.conduit.watchFile
  const watcher = window.conduit.watchFile(filePath, handleFileChange);

  return {
    dispose: () => {
      // Clear any pending debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      // Dispose the underlying watcher
      watcher.dispose();
    },
  };
}
