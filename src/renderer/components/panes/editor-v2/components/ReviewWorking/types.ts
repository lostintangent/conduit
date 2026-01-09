/**
 * Shared types and constants for ReviewWorking components.
 */

import type { editor } from "monaco-editor";

/**
 * Default diff editor options for inline diff views.
 * These options optimize for read-only diff viewing within the working tree.
 */
export const DIFF_EDITOR_OPTIONS: editor.IDiffEditorOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderSideBySide: false,
  lineNumbers: "on",
  fontSize: 12,
  wordWrap: "on",
  automaticLayout: true,
  diffWordWrap: "on",
  renderOverviewRuler: false,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  renderLineHighlight: "none",
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  hideUnchangedRegions: {
    enabled: true,
  },
};

/**
 * Section type for staged vs unstaged changes.
 */
export type ReviewWorkingSectionType = "staged" | "unstaged";

/**
 * Props passed through to ReviewWorkingPaneFile from ReviewWorkingPaneSection.
 */
export interface ReviewWorkingPaneFilePassthroughProps {
  cwd: string;
  baseBranch?: string;
}
