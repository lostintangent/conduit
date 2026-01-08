/**
 * Shared components for Editor v2.
 *
 * Components in this directory are used across multiple editor components
 * to avoid duplication.
 */

export { GitBadge, getStatusConfig } from "./GitBadge";
export type { GitBadgeProps, StatusConfig } from "./GitBadge";
export { aggregateFolderStatus } from "./gitFolderAggregation";
export { EditorActionButtons } from "./EditorActionButtons";
export type { EditorActionButtonsProps } from "./EditorActionButtons";
export { DiffModeToggle } from "./DiffModeToggle";
export type { DiffModeToggleProps } from "./DiffModeToggle";
export { PreviewModeToggle } from "./PreviewModeToggle";
export type { PreviewModeToggleProps } from "./PreviewModeToggle";
