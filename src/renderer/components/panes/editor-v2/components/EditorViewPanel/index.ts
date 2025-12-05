/**
 * EditorViewPanel components barrel export.
 *
 * Exports the main EditorViewPanel and its sub-components:
 * - EditorViewPanel: Main orchestrator component
 * - RegularEditorWrapper: Wrapper for Monaco standalone editor
 * - DiffEditorWrapper: Wrapper for Monaco diff editor
 * - ExternalChangeWarning: Warning banner for external changes
 */

export { EditorViewPanel } from "./EditorViewPanel";
export type { EditorViewPanelProps } from "./EditorViewPanel";

export { RegularEditorWrapper } from "./RegularEditorWrapper";
export type { RegularEditorWrapperProps } from "./RegularEditorWrapper";

export { DiffEditorWrapper } from "./DiffEditorWrapper";
export type { DiffEditorWrapperProps } from "./DiffEditorWrapper";

export { ExternalChangeWarning } from "./ExternalChangeWarning";
export type { ExternalChangeWarningProps } from "./ExternalChangeWarning";
