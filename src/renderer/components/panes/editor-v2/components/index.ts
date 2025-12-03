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
 * - PanelViewPortToggle: Floating toggle for narrow viewport layout
 *
 * Phase 6 components:
 * - ChangesReviewPane: Multi-file changes review with inline diffs
 * - FileChangeDiff: Individual file diff with actions
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
export { EditorToolbar, PanelViewPortToggle } from "./Toolbar";
export type {
  EditorToolbarProps,
  PanelViewPortToggleProps,
  PanelView,
} from "./Toolbar";

// FileTreePanel components
export {
  FileTreePanel,
  FileTreeNormal,
  FileTreeChanges,
  FileTreeItem,
  GitOperationsToolbar,
  BranchSelector,
} from "./FileTreePanel";

export type {
  FileTreePanelProps,
  FileTreeNormalProps,
  FileTreeChangesProps,
  FileTreeItemProps,
  GitOperationsToolbarProps,
  BranchSelectorProps,
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

// Shared components
export { GitBadge, getStatusConfig } from "./shared";
export type { GitBadgeProps } from "./shared";

// Global container for editor panes (keeps editors alive across tab switches)
export { GlobalEditorContainer } from "./GlobalEditorContainer";
