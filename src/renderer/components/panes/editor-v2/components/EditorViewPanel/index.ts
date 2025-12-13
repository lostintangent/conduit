/**
 * EditorViewPanel components barrel export.
 *
 * Exports the main EditorViewPanel and its sub-components:
 * - EditorViewPanel: Main orchestrator component
 * - RegularEditorWrapper: Wrapper for Monaco standalone editor
 * - DiffEditorWrapper: Wrapper for Monaco diff editor
 * - DeletedFileViewer: Read-only viewer for deleted files (shows git content)
 * - ExternalChangeWarning: Warning banner for external changes
 *
 * Also exports shared constants for editor configuration:
 * - EDITOR_MIN_HEIGHT, EDITOR_MAX_HEIGHT: Height bounds for auto-sizing
 * - DEFAULT_AUTO_SIZE_CONFIG: Default auto-size configuration
 */

export { EditorViewPanel } from "./EditorViewPanel";
export type { EditorViewPanelProps } from "./EditorViewPanel";

export { RegularEditorWrapper } from "./RegularEditorWrapper";
export type { RegularEditorWrapperProps } from "./RegularEditorWrapper";

export { DiffEditorWrapper } from "./DiffEditorWrapper";
export type { DiffEditorWrapperProps } from "./DiffEditorWrapper";

export { DeletedFileViewer } from "./DeletedFileViewer";
export type { DeletedFileViewerProps } from "./DeletedFileViewer";

export { ExternalChangeWarning } from "./ExternalChangeWarning";
export type { ExternalChangeWarningProps } from "./ExternalChangeWarning";

export { HistoricalDiffViewer } from "./HistoricalDiffViewer";
export type { HistoricalDiffViewerProps } from "./HistoricalDiffViewer";

// Constants
export {
  EDITOR_MIN_HEIGHT,
  EDITOR_MAX_HEIGHT,
  DEFAULT_AUTO_SIZE_CONFIG,
} from "./constants";
export type { AutoSizeConfig } from "./constants";
