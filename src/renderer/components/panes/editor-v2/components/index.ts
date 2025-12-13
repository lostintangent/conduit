/**
 * Editor v2 components barrel export.
 *
 * Phase 3 components:
 * - EditorViewPanel: Main editor orchestrator
 * - RegularEditorWrapper: Monaco standalone editor wrapper
 * - DiffEditorWrapper: Monaco diff editor wrapper
 * - ExternalChangeWarning: External change warning banner
 * - EditorToolbar: Editor toolbar with actions
 *
 * Phase 4 components:
 * - FileTreePanel: Main file tree container with view mode toggle
 * - FileTreeNormal: Normal directory tree view
 * - FileTreeChanges: Git changes view (staged/unstaged)
 * - FileTreeItem: Individual tree item component
 *
 * Phase 5 components:
 * - TreeResizer: Draggable divider for tree panel resizing
 *
 * Phase 6 components:
 * - ChangesReviewPane: Multi-file changes review with inline diffs
 * - FileChangeDiff: Individual file diff with actions
 */

// EditorViewPanel and related components
export {
  DiffEditorWrapper,
  EditorViewPanel,
  ExternalChangeWarning,
  RegularEditorWrapper,
} from "./EditorViewPanel";

export type {
  DiffEditorWrapperProps,
  EditorViewPanelProps,
  ExternalChangeWarningProps,
  RegularEditorWrapperProps,
} from "./EditorViewPanel";

// Toolbar components
export { EditorToolbar } from "./Toolbar";
export type { EditorToolbarProps } from "./Toolbar";

// FileTreePanel components
export {
  BranchSelector,
  BranchSwitcher,
  FileTreeChanges,
  FileTreeItem,
  FileTreeNormal,
  FileTreePanel,
} from "./FileTreePanel";

export type {
  BranchSelectorProps,
  BranchSwitcherProps,
  FileTreeChangesProps,
  FileTreeItemProps,
  FileTreeNormalProps,
  FileTreePanelProps,
} from "./FileTreePanel";

// Layout components
export { TreeResizer } from "./TreeResizer";
export type { TreeResizerProps } from "./TreeResizer";

// ChangesReviewPane components
export { ChangesReviewPane, FileChangeDiff } from "./ChangesReviewPane";
export type {
  ChangesReviewPaneProps,
  FileChangeDiffProps,
} from "./ChangesReviewPane";

// CommitReviewPane components
export { CommitReviewPane } from "./CommitReviewPane";
export type { CommitReviewPaneProps } from "./CommitReviewPane";

// Shared components
export { getStatusConfig, GitBadge } from "./shared";
export type { GitBadgeProps } from "./shared";

// Global container for editor panes (keeps editors alive across tab switches)
export { GlobalEditorContainer } from "./GlobalEditorContainer";
