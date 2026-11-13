/**
 * Pre-Commands System
 *
 * Provides lightweight handlers that execute before terminal pane creation.
 * Pre-commands can perform setup, validation, or configuration tasks.
 */

export * from "./types";
export { preCommands, runPreCommand } from "./registeredPreCommands";
