/**
 * Pane Actions File I/O Operations
 *
 * Read/write operations for ~/.conduit/paneactions.json
 * Based on: docs/pane-actions-schema.md
 */

import type { Action } from "../core/types";
import { validatePaneActionsConfig, ValidationError } from "./validation";

/**
 * Get the path to the user's pane actions configuration file
 *
 * @param homeDirectory - Home directory path
 * @returns Path to ~/.conduit/paneactions.json
 */
export function getUserPaneActionsPath(homeDirectory: string): string {
  return `${homeDirectory}/.conduit/paneactions.json`;
}

/**
 * Read and parse the user's pane actions configuration file
 *
 * @param filePath - Path to the pane actions file
 * @returns Parsed and validated actions, or null if file doesn't exist
 * @throws ValidationError if file content is invalid
 * @throws Error for other file system errors
 */
export async function readPaneActionsFile(
  filePath: string,
): Promise<Action[] | null> {
  const api = window.conduit;
  if (!api) {
    throw new Error("Conduit API not available");
  }

  try {
    const content = await api.readFile(filePath, "local");
    return parsePaneActionsContent(content);
  } catch (error) {
    // File doesn't exist - this is expected on first run
    if (
      (error as Error).message?.includes("ENOENT") ||
      (error as Error).message?.includes("no such file")
    ) {
      return null;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Parse and validate pane actions JSON content
 *
 * @param content - Raw JSON string
 * @returns Parsed and validated actions
 * @throws ValidationError if content is invalid
 */
export function parsePaneActionsContent(content: string): Action[] {
  let parsed: unknown;

  // Parse JSON
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ValidationError(
      `Invalid JSON: ${(error as Error).message}`,
      "JSON parsing",
    );
  }

  // Validate structure and content
  return validatePaneActionsConfig(parsed);
}

/**
 * Write pane actions to file with pretty formatting
 *
 * Creates parent directory if it doesn't exist.
 *
 * @param filePath - Path to the pane actions file
 * @param actions - Actions to write
 * @throws Error if write fails
 */
export async function writePaneActionsFile(
  filePath: string,
  actions: Action[],
): Promise<void> {
  const api = window.conduit;
  if (!api) {
    throw new Error("Conduit API not available");
  }

  // Validate before writing
  validatePaneActionsConfig(actions);

  // Write with pretty formatting (2 space indent)
  const content = JSON.stringify(actions, null, 2);
  await api.writeFile(filePath, content, "local");
}

/**
 * Read pane actions file or return null if it doesn't exist
 *
 * Convenience wrapper that swallows ENOENT errors.
 *
 * @param filePath - Path to the pane actions file
 * @returns Parsed actions or null
 * @throws ValidationError if file content is invalid
 * @throws Error for other file system errors
 */
export async function readPaneActionsFileOrNull(
  filePath: string,
): Promise<Action[] | null> {
  try {
    return await readPaneActionsFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
