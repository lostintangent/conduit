/**
 * Editor Hooks
 *
 * React hooks for integrating with the editor registries and APIs.
 */

export { useAutoOpenFile } from "./useAutoOpenFile";
export type { UseAutoOpenFileOptions } from "./useAutoOpenFile";
export { useAutoSizeEditor } from "./useAutoSizeEditor";
export type {
  UseAutoSizeEditorOptions,
  UseAutoSizeEditorResult,
} from "./useAutoSizeEditor";
export { useDiffContent } from "./useDiffContent";
export type { DiffContent, DiffError, DiffErrorType } from "./useDiffContent";
export { useDiffModeTransition } from "./useDiffModeTransition";
export type { UseDiffModeTransitionResult } from "./useDiffModeTransition";
export { useEditorActions } from "./useEditorActions";
export type { EditorActions } from "./useEditorActions";
export { useEditorSaveKeybinding } from "./useEditorSaveKeybinding";
export type { UseEditorSaveKeybindingResult } from "./useEditorSaveKeybinding";
export { useEditorTheme } from "./useEditorTheme";
export { useEditorVisibility } from "./useEditorVisibility";
export type { UseEditorVisibilityOptions } from "./useEditorVisibility";
export { useExpandedPaths } from "./useExpandedPaths";
export type {
  UseExpandedPathsOptions,
  UseExpandedPathsResult,
} from "./useExpandedPaths";
export { useFilePrefetch } from "./useFilePrefetch";
export type {
  UseFilePrefetchOptions,
  UseFilePrefetchResult,
} from "./useFilePrefetch";
export { useGitContent } from "./useGitContent";
export type {
  GitContentError,
  GitContentErrorType,
  GitContentResult,
} from "./useGitContent";
export { useFileTreeContextMenu } from "./useFileTreeContextMenu";
export type {
  UseFileTreeContextMenuOptions,
  UseFileTreeContextMenuResult,
} from "./useFileTreeContextMenu";
export { useFileTreeChangesContextMenu } from "./useFileTreeChangesContextMenu";
export type {
  ShowContextMenuOptions as FileTreeChangesShowContextMenuOptions,
  UseFileTreeChangesContextMenuOptions,
  UseFileTreeChangesContextMenuResult,
} from "./useFileTreeChangesContextMenu";
export { useGitOperations } from "./useGitOperations";
export type {
  GitOperations,
  GitOperationsState,
  UseGitOperationsResult,
} from "./useGitOperations";
export {
  getMimeType,
  isBinaryImage,
  isSvg,
  uint8ArrayToBase64,
  useImagePreview,
} from "./useImagePreview";
export type { UseImagePreviewResult } from "./useImagePreview";
export { useMarkdownPreview } from "./useMarkdownPreview";
export type {
  MermaidConfig,
  UseMarkdownPreviewResult,
} from "./useMarkdownPreview";
export { useModelState } from "./useModelState";
export { pathToUri, uriToPath, useMonacoModel } from "./useMonacoModel";
export { usePreventFocusScroll } from "./usePreventFocusScroll";
export { useResponsiveLayout } from "./useResponsiveLayout";
export type { LayoutMode } from "./useResponsiveLayout";
export { useReviewModeState } from "./useReviewModeState";
export type { UseReviewModeStateResult } from "./useReviewModeState";
export { usePanelHeight } from "./usePanelHeight";
export type {
  UsePanelHeightOptions,
  UsePanelHeightResult,
} from "./usePanelHeight";
export { useScrollPersistence } from "./useScrollPersistence";
export {
  DISABLED_TRACKING,
  useFileChangeTracking,
} from "./useFileChangeTracking";
export type { FileChangeTrackingResult } from "./useFileChangeTracking";
export { READ_TRIGGER_ACTIONS, useReadTriggers } from "./useReadTriggers";
export type {
  ReadTriggerAction,
  ReadTriggerResult,
} from "./useReadTriggers";
export {
  DISABLED_UNSEEN_TRACKING,
  useUnseenTracking,
} from "./useUnseenTracking";
export type {
  UnseenTrackingResult,
  UseUnseenTrackingOptions,
} from "./useUnseenTracking";
export { useCommitGraph } from "./useCommitGraph";
export type {
  CommitGraphActions,
  CommitGraphState,
  UseCommitGraphOptions,
  UseCommitGraphResult,
} from "./useCommitGraph";
export { useCommitDetails } from "./useCommitDetails";
export type { CommitDetailsResult } from "./useCommitDetails";
