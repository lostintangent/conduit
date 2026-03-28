/**
 * ReviewCommitPane - Read-only view of historical commit changes.
 *
 * A focused component for displaying files changed in a commit.
 * Unlike ReviewWorkingPane (working changes), this is entirely read-only.
 *
 * Uses shared FileEditor component (from ../shared) for consistent
 * file rendering with ReviewWorkingPane.
 */

// Main pane
export { ReviewCommitPane } from "./ReviewCommitPane";
export type { CommitMetadata, ReviewCommitPaneProps } from "./ReviewCommitPane";

// Header component
export { ReviewCommitPaneHeader } from "./ReviewCommitPaneHeader";
export type { ReviewCommitPaneHeaderProps } from "./ReviewCommitPaneHeader";

// Footer component
export { ReviewCommitPaneFooter } from "./ReviewCommitPaneFooter";
export type { ReviewCommitPaneFooterProps } from "./ReviewCommitPaneFooter";
