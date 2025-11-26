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
export type { DiffContent } from "./useDiffContent";
export { useEditorMode } from "./useEditorMode";
export type { UseEditorModeResult } from "./useEditorMode";
export { useResponsiveLayout } from "./useResponsiveLayout";
export type { LayoutMode } from "./useResponsiveLayout";
