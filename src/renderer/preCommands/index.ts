/**
 * Pre-Commands System
 *
 * Provides lightweight handlers that execute before terminal pane creation.
 * Pre-commands can perform setup, validation, or configuration tasks.
 */

export * from "./types";
export { PreCommandRegistry } from "./registry";
export { registerDefaultPreCommands } from "./defaults";
export { usePreCommands, usePreCommand } from "./hooks/usePreCommands";
