/**
 * Editor v2 Hooks
 *
 * React hooks for integrating with the editor registries and APIs.
 *
 * @see docs/architecture/editor-v2-design-narrative.md
 */

export { useDiffContent } from "./useDiffContent";
export type { DiffContent, DiffError, DiffErrorType } from "./useDiffContent";
export { useEditorActions } from "./useEditorActions";
export type { EditorActions } from "./useEditorActions";
export { useEditorTheme } from "./useEditorTheme";
export { useEditorVisibility } from "./useEditorVisibility";
export type { UseEditorVisibilityOptions } from "./useEditorVisibility";
export { useExpandedPaths } from "./useExpandedPaths";
export type {
  UseExpandedPathsOptions,
  UseExpandedPathsResult,
} from "./useExpandedPaths";
export { useGitOperations } from "./useGitOperations";
export type {
  GitOperations,
  GitOperationsState,
  UseGitOperationsResult,
} from "./useGitOperations";
export { useResponsiveLayout } from "./useResponsiveLayout";
export type { LayoutMode } from "./useResponsiveLayout";
export { useReviewModeState } from "./useReviewModeState";
export { useScrollPersistence } from "./useScrollPersistence";

export { useAutoSizeEditor } from "./useAutoSizeEditor";
export { useModelState } from "./useModelState";
export {
  createModelKey,
  pathToUri,
  uriToPath,
  useMonacoModel,
} from "./useMonacoModel";
