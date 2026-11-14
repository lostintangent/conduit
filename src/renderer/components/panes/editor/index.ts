/**
 * Editor - Main entry point.
 *
 * This module provides the editor pane:
 *
 * - Global registries for editor/model management
 * - React hooks for state integration
 * - Component-based architecture with clear responsibilities
 * - Real-time updates via event subscriptions
 */

// Main orchestrator component
export { EditorPaneV2 } from "./EditorPaneV2";
export type { EditorPaneV2Props, FileChangeData } from "./EditorPaneV2";

// Anchor component for global container pattern
export { disposeEditorPane, EditorPaneAnchor } from "./EditorPaneAnchor";
export type { EditorPaneAnchorProps } from "./EditorPaneAnchor";

// Re-export types
export type {
  ContentSource,
  FileNode,
  ModelState,
  ModelStateEvent,
  TreeViewMode,
  ViewMode,
} from "./types";

// Re-export content source utilities
export { contentSourceToGitRef, isGitSource } from "./types";

// Re-export hooks
export {
  useDiffContent,
  useGitContent,
  useModelState,
  useMonacoModel,
  useResponsiveLayout,
} from "./hooks";

export type { DiffContent, GitContentResult, LayoutMode } from "./hooks";

// Re-export registries
export {
  EditorPaneRegistry,
  MonacoModelRegistry,
  ViewStateRegistry,
} from "./registry";

export type { EditorPaneConfig, EditorPaneRegistryEvent } from "./registry";

// Re-export components for advanced usage
export {
  EditorPane,
  EditorToolbar,
  FileEditor,
  FileTreePanel,
  GlobalEditorContainer,
  ReviewCommitPane,
  ReviewWorkingPane,
  TreeResizer,
} from "./components";
