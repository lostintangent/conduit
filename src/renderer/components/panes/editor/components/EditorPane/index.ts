/**
 * EditorPane components barrel export.
 *
 * Exports the main EditorPane and its sub-components:
 * - EditorPane: Main orchestrator component
 * - RegularEditorWrapper: Wrapper for Monaco standalone editor
 * - DiffEditorWrapper: Wrapper for Monaco diff editor
 * - ExternalChangeWarning: Warning banner for external changes
 * - MarkdownPreview: Markdown preview using streamdown
 *
 * Also exports shared constants for editor configuration:
 * - EDITOR_MAX_HEIGHT: Max height for auto-sizing
 * - DEFAULT_AUTO_SIZE_CONFIG: Default auto-size configuration
 */

export { EditorPane } from "./EditorPane";
export type { EditorPaneProps } from "./EditorPane";

export { RegularEditorWrapper } from "./RegularEditorWrapper";
export type { RegularEditorWrapperProps } from "./RegularEditorWrapper";

export { DiffEditorWrapper } from "./DiffEditorWrapper";
export type { DiffEditorWrapperProps } from "./DiffEditorWrapper";

export { ExternalChangeWarning } from "./ExternalChangeWarning";
export type { ExternalChangeWarningProps } from "./ExternalChangeWarning";

export { DeletedFileBanner } from "./DeletedFileBanner";

export { MarkdownPreview } from "./MarkdownPreview";
export type { MarkdownPreviewProps } from "./MarkdownPreview";

export { ImagePreview } from "./ImagePreview";
export type { ImagePreviewProps } from "./ImagePreview";

// Constants
export { EDITOR_MIN_HEIGHT, EDITOR_MAX_HEIGHT } from "./constants";
