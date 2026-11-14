/**
 * Editor components barrel export.
 *
 * Phase 3 components:
 * - EditorPane: Main editor orchestrator
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
 * - ReviewWorkingPane: Multi-file working changes with inline diffs
 * - ReviewCommitPane: Read-only view of historical commit changes
 */

// EditorPane and related components
export {
  DiffEditorWrapper,
  EditorPane,
  ExternalChangeWarning,
  RegularEditorWrapper,
} from "./EditorPane";

export type {
  DiffEditorWrapperProps,
  EditorPaneProps,
  ExternalChangeWarningProps,
  RegularEditorWrapperProps,
} from "./EditorPane";

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
  FileTreePanelHandle,
  FileTreePanelProps,
} from "./FileTreePanel";

// Layout components
export { TreeResizer } from "./TreeResizer";
export type { TreeResizerProps } from "./TreeResizer";

// ReviewWorking components (working changes review)
export { ReviewWorkingPane } from "./ReviewWorking";
export type { ReviewWorkingPaneProps } from "./ReviewWorking";

// ReviewCommitPane (historical commit review)
export { ReviewCommitPane } from "./ReviewCommit";
export type { CommitMetadata, ReviewCommitPaneProps } from "./ReviewCommit";

// Shared components
export { FileEditor, getStatusConfig, GitBadge } from "./shared";
export type { FileEditorProps, GitBadgeProps } from "./shared";

// FileDiffStats - Per-file diff statistics display
export {
  FileDiffStats,
  FileDiffStatsProvider,
  useFileDiffStats,
} from "./FileDiffStats";
export type {
  FileDiffStat,
  FileDiffStatsProps,
  FileDiffStatsProviderProps,
} from "./FileDiffStats";

// Global container for editor panes (keeps editors alive across tab switches)
export { GlobalEditorContainer } from "./GlobalEditorContainer";
