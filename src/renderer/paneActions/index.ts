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

// Validation
export { validatePaneActionsConfig, ValidationError } from './io/validation';
