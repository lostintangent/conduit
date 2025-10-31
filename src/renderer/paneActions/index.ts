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
  PaneConfig,
  Action,
  PaneActionsConfig,
} from './core/types';

// Registry
export { PaneActionsRegistry } from './core/PaneActionsRegistry';

// Defaults
export { getDefaultActions } from './core/defaults';

// File I/O
export {
  getUserPaneActionsPath,
  readPaneActionsFile,
  writePaneActionsFile,
  parsePaneActionsContent,
  readPaneActionsFileOrNull,
} from './io/fileOperations';

// User actions (save/reset)
export {
  savePaneActions,
  resetPaneActionsToDefaults,
  hasUserPaneActionsFile,
} from './io/userPaneActions';

// Atom updates
export { updatePaneActionsAtom } from './io/updatePaneActionsAtom';

// Validation
export { validatePaneActionsConfig, ValidationError } from './io/validation';

// File watching
export {
  watchPaneActionsFile,
  type PaneActionsWatcher,
  type FileChangeCallback,
  type FileErrorCallback,
  type WatchPaneActionsOptions,
} from './io/watchPaneActions';

// React hooks
export {
  usePaneActionsSystem,
  type UsePaneActionsSystemOptions,
  type PaneActionsSystem,
} from './hooks/usePaneActionsSystem';

export {
  usePaneActions,
  useEnabledPaneActions,
  usePaneAction,
  usePaneActionByIndex,
} from './hooks/usePaneActions';
