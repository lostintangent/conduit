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
  ActionOverride,
  Action,
  PaneActionsConfig,
  ResolvedActionConfig,
} from './core/types';

// Registry
export { PaneActionsRegistry } from './core/PaneActionsRegistry';

// Defaults
export { getDefaultActions } from './core/defaults';

// Resolution utilities
export { resolveAction } from './resolution/resolveAction';
export { normalizePath, isPrefixOf, findLongestMatch } from './resolution/pathUtils';

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

export {
  useResolvedAction,
  useResolvedActionByName,
  useResolvedActionByIndex,
} from './hooks/useResolvedAction';
