/**
 * ReviewCommitPaneFooter - Summary footer for the commit pane.
 *
 * Displays a summary of the file count at the bottom of the commit pane.
 *
 * @example
 * ```tsx
 * <ReviewCommitPaneFooter fileCount={5} />
 * // Renders: "5 files changed"
 * ```
 */

export interface ReviewCommitPaneFooterProps {
  /** Number of files changed in the commit */
  fileCount: number;
}

/**
 * Summary footer showing file count.
 */
export function ReviewCommitPaneFooter({
  fileCount,
}: ReviewCommitPaneFooterProps) {
  return (
    <div
      className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground bg-muted/30"
      data-testid="commit-footer"
    >
      {fileCount} file{fileCount !== 1 ? "s" : ""} changed
    </div>
  );
}
