/**
 * CommitReviewPane Components
 *
 * Components for viewing all changes in a historical commit:
 * - CommitReviewPane: Main orchestrator with file list and diffs
 * - CommitReviewHeader: Header with commit metadata
 * - CommitReviewFileItem: Individual file with collapsible diff
 *
 * Also exports hooks for extensibility:
 * - useCommitDetails: Fetches commit metadata and files
 */

// Main orchestrator
export { CommitReviewPane } from "./CommitReviewPane";
export type { CommitReviewPaneProps } from "./CommitReviewPane";

// Header component
export { CommitReviewHeader } from "./CommitReviewHeader";
export type { CommitReviewHeaderProps } from "./CommitReviewHeader";

// File item component
export { CommitReviewFileItem } from "./CommitReviewFileItem";
export type { CommitReviewFileItemProps } from "./CommitReviewFileItem";

// Hooks
export { useCommitDetails } from "./hooks";
export type { CommitDetailsResult } from "./hooks";
