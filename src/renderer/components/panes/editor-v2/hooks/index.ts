/**
 * Editor v2 Hooks
 *
 * React hooks for integrating with the editor registries and APIs.
 *
 * @see docs/architecture/editor-v2-design-narrative.md
 */

export { useMonacoModel, pathToUri, uriToPath } from "./useMonacoModel";
export { useModelState } from "./useModelState";
export { useDiffContent } from "./useDiffContent";
export type { DiffContent, DiffError, DiffErrorType } from "./useDiffContent";
export { useResponsiveLayout } from "./useResponsiveLayout";
export type { LayoutMode } from "./useResponsiveLayout";
export { useEditorActions } from "./useEditorActions";
export type { EditorActions } from "./useEditorActions";
export { useGitOperations } from "./useGitOperations";
export type {
  GitOperationsState,
  GitOperations,
  UseGitOperationsResult,
} from "./useGitOperations";
export { useEditorTheme } from "./useEditorTheme";
export { useEditorVisibility } from "./useEditorVisibility";
export type { UseEditorVisibilityOptions } from "./useEditorVisibility";
export { useScrollPersistence } from "./useScrollPersistence";
export { useExpandedPaths } from "./useExpandedPaths";
export type {
  UseExpandedPathsOptions,
  UseExpandedPathsResult,
} from "./useExpandedPaths";
