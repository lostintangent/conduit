/**
 * ReviewWorking components barrel export.
 *
 * Provides the multi-file working changes review feature:
 * - ReviewWorkingPane: Main orchestrator showing all changed files with inline diffs
 * - ReviewWorkingPaneHeader: Commit controls header
 * - ReviewWorkingPaneSection: Collapsible section for staged/unstaged files
 * - ReviewWorkingPaneFooter: Summary footer with file counts
 *
 * File rendering uses shared FileEditor component (from ../shared)
 * for consistency with ReviewCommitPane.
 */

// Main orchestrator
export { ReviewWorkingPane } from "./ReviewWorkingPane";
export type { ReviewWorkingPaneProps } from "./ReviewWorkingPane";

// Header component
export { ReviewWorkingPaneHeader } from "./ReviewWorkingPaneHeader";
export type { ReviewWorkingPaneHeaderProps } from "./ReviewWorkingPaneHeader";

// Section component
export { ReviewWorkingPaneSection } from "./ReviewWorkingPaneSection";
export type { ReviewWorkingPaneSectionProps } from "./ReviewWorkingPaneSection";

// Footer component
export { ReviewWorkingPaneFooter } from "./ReviewWorkingPaneFooter";
export type { ReviewWorkingPaneFooterProps } from "./ReviewWorkingPaneFooter";

// Hooks
export { useExpandedFiles } from "./hooks";
export type { UseExpandedFilesResult } from "./hooks";
