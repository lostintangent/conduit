/**
 * Editor v2 components barrel export.
 *
 * Phase 3 components:
 * - EditorViewPanel: Main editor orchestrator
 * - MonacoEditorWrapper: Monaco standalone editor wrapper
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
 * - MobileViewToggle: Floating toggle for mobile layout
 *
 * Phase 6 components:
 * - ChangesReviewPane: Multi-file changes review with inline diffs
 * - FileChangeDiff: Individual file diff with actions
 *
 * Phase 7 components:
 * - BranchSelector: Dropdown for selecting comparison branch
 */

// EditorViewPanel and related components
export {
  EditorViewPanel,
  MonacoEditorWrapper,
  DiffEditorWrapper,
  ExternalChangeWarning,
} from "./EditorViewPanel";

export type {
  EditorViewPanelProps,
  MonacoEditorWrapperProps,
  DiffEditorWrapperProps,
  ExternalChangeWarningProps,
} from "./EditorViewPanel";

// Toolbar components
export { EditorToolbar, MobileViewToggle } from "./Toolbar";
export type {
  EditorToolbarProps,
  MobileViewToggleProps,
  MobileView,
} from "./Toolbar";

// FileTreePanel components
export {
  FileTreePanel,
  FileTreeNormal,
  FileTreeChanges,
  FileTreeItem,
} from "./FileTreePanel";

export type {
  FileTreePanelProps,
  FileTreeNormalProps,
  FileTreeChangesProps,
  FileTreeItemProps,
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

// Branch comparison components
export { BranchSelector } from "./BranchSelector";
export type { BranchSelectorProps } from "./BranchSelector";

// Shared components
export { GitBadge, getStatusConfig } from "./shared";
export type { GitBadgeProps } from "./shared";
