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
