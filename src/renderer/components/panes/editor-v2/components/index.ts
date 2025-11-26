/**
 * Editor v2 components barrel export.
 *
 * Phase 3 components:
 * - EditorViewPanel: Main editor orchestrator
 * - MonacoEditorWrapper: Monaco standalone editor wrapper
 * - DiffEditorWrapper: Monaco diff editor wrapper
 * - ExternalChangeWarning: External change warning banner
 * - EditorToolbar: Editor toolbar with actions
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
export { EditorToolbar } from "./Toolbar";
export type { EditorToolbarProps } from "./Toolbar";
