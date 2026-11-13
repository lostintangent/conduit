/**
 * Pane Actions Public API
 *
 * This module exports the public API for the pane actions system.
 */

// Core types
export type {
  PaneType,
  IconId,
  TerminalConfig,
  EditorConfig,
  BrowserConfig,
  CanvasConfig,
  PaneConfig,
  Action,
} from "./core/types";

// Type guards
export {
  isTerminalConfig,
  isEditorConfig,
  isBrowserConfig,
} from "./core/types";

// Registry
export { PaneActionsRegistry } from "./core/PaneActionsRegistry";

// Defaults
export { getDefaultActions } from "./core/defaults";

// File I/O
export {
  getUserPaneActionsPath,
  readPaneActionsFile,
  writePaneActionsFile,
  parsePaneActionsContent,
  readPaneActionsFileOrNull,
} from "./io/fileOperations";

// User actions (save/reset)
export {
  savePaneActions,
  resetPaneActionsToDefaults,
  hasUserPaneActionsFile,
} from "./io/userPaneActions";

// Atom updates
export { updatePaneActionsAtom } from "./io/updatePaneActionsAtom";

// Validation
export { validatePaneActionsConfig, ValidationError } from "./io/validation";

// File watching
export {
  watchPaneActionsFile,
  type PaneActionsWatcher,
  type FileChangeCallback,
  type FileErrorCallback,
  type WatchPaneActionsOptions,
} from "./io/watchPaneActions";

// React hooks
export {
  usePaneActionsSystem,
  type UsePaneActionsSystemOptions,
  type PaneActionsSystem,
} from "./hooks/usePaneActionsSystem";

export {
  usePaneActions,
  useEnabledPaneActions,
} from "./hooks/usePaneActions";

// UI components
export {
  PaneActionIcon,
  PANE_ACTION_ICON_MAP,
  getAvailableIconIds,
} from "./ui/PaneActionIcon";
