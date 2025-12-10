/**
 * Shared types and constants for ChangesReviewPane components.
 */

import type { editor } from "monaco-editor";

/**
 * Fixed height for expanded diff views (in pixels).
 * Used consistently across all FileChangeDiff instances.
 */
export const DIFF_VIEW_HEIGHT = 300;

/**
 * Default diff editor options for inline diff views.
 * These options optimize for read-only diff viewing within the changes review.
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
export type ChangesSectionType = "staged" | "unstaged";

/**
 * Props passed through to FileChangeDiff from ChangesSection.
 */
export interface FileChangeDiffPassthroughProps {
  cwd: string;
  baseBranch?: string;
}
