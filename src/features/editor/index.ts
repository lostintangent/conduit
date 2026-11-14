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
export { EditorPaneV2 } from "./components/EditorPaneV2";
export type {
  EditorPaneV2Props,
  FileChangeData,
} from "./components/EditorPaneV2";

// Anchor component for global container pattern
export {
  disposeEditorPane,
  EditorPaneAnchor,
} from "./components/EditorPaneAnchor";
export type { EditorPaneAnchorProps } from "./components/EditorPaneAnchor";

// Re-export types
export type {
  ContentSource,
  FileNode,
  ModelState,
  ModelStateEvent,
  TreeViewMode,
  ViewMode,
} from "./model";

// Re-export content source utilities
export { contentSourceToGitRef, isGitSource } from "./model";

// Re-export hooks
export {
  useDiffContent,
  useGitContent,
  useModelState,
  useMonacoModel,
  useResponsiveLayout,
} from "./components/hooks";

export type {
  DiffContent,
  GitContentResult,
  LayoutMode,
} from "./components/hooks";

// Re-export registries
export {
  EditorPaneRegistry,
  MonacoModelRegistry,
  ViewStateRegistry,
} from "./client";

export type { EditorPaneConfig, EditorPaneRegistryEvent } from "./client";

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
