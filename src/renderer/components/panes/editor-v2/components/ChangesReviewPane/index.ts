/**
 * ChangesReviewPane components barrel export.
 *
 * Provides the multi-file changes review feature:
 * - ChangesReviewPane: Main orchestrator showing all changed files with inline diffs
 * - ChangesReviewToolbar: Commit controls toolbar
 * - ChangesSection: Collapsible section for staged/unstaged files
 * - FileChangeDiff: Individual file diff component with actions
 * - ChangesFooter: Summary footer with file counts
 *
 * Also exports hooks and types for extensibility:
 * - useExpandedFiles: File expansion state management
 * - DIFF_VIEW_HEIGHT, DIFF_EDITOR_OPTIONS: Shared constants
 */

// Main orchestrator
export { ChangesReviewPane } from "./ChangesReviewPane";
export type { ChangesReviewPaneProps } from "./ChangesReviewPane";

// Toolbar component
export { ChangesReviewToolbar } from "./ChangesReviewToolbar";
export type { ChangesReviewToolbarProps } from "./ChangesReviewToolbar";

// Section component
export { ChangesSection } from "./ChangesSection";
export type { ChangesSectionProps } from "./ChangesSection";

// Individual file diff component
export { FileChangeDiff } from "./FileChangeDiff";
export type { FileChangeDiffProps } from "./FileChangeDiff";

// Footer component
export { ChangesFooter } from "./ChangesFooter";
export type { ChangesFooterProps } from "./ChangesFooter";

// Hooks
export { useExpandedFiles } from "./hooks";
export type { UseExpandedFilesResult } from "./hooks";

// Types and constants
export {
  DIFF_VIEW_HEIGHT,
  DIFF_EDITOR_OPTIONS,
  type ChangesSectionType,
  type FileChangeDiffPassthroughProps,
} from "./types";
