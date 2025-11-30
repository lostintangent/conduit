/**
 * Editor v2 - Main entry point.
 *
 * This module provides the Editor v2 system, a complete rewrite of the
 * editor pane with improved architecture:
 *
 * - Global registries for editor/model management
 * - React hooks for state integration
 * - Component-based architecture with clear responsibilities
 * - Real-time updates via event subscriptions
 *
 * @see docs/architecture/editor-v2-design-narrative.md
 * @see docs/architecture/editor-v2-implementation-plan.md
 */

// Main orchestrator component
export { EditorPaneV2 } from "./EditorPaneV2";
export type { EditorPaneV2Props, FileChangeData } from "./EditorPaneV2";

// Re-export types
export type {
  FileNode,
  ViewMode,
  TreeViewMode,
  EditorMode,
  ModelState,
  ModelStateEvent,
} from "./types";

// Re-export hooks
export {
  useMonacoModel,
  useModelState,
  useDiffContent,
  useResponsiveLayout,
} from "./hooks";

export type { DiffContent, LayoutMode } from "./hooks";

// Re-export registries
export {
  EditorRegistry,
  MonacoModelRegistry,
  ViewStateRegistry,
} from "./registry";

// Re-export components for advanced usage
export {
  EditorViewPanel,
  FileTreePanel,
  TreeResizer,
  PanelViewPortToggle,
  EditorToolbar,
  ChangesReviewPane,
  FileChangeDiff,
  BranchSelector,
} from "./components";

export type { BranchSelectorProps } from "./components";
