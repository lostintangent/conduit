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
export { ReadOnlyBadge } from "./ReadOnlyBadge";
export type { ReadOnlyBadgeProps } from "./ReadOnlyBadge";
export { SourceBadge } from "./SourceBadge";
export type { SourceBadgeProps } from "./SourceBadge";
export { ReviewPaneFile } from "./ReviewPaneFile";
export type { ReviewPaneFileProps } from "./ReviewPaneFile";
