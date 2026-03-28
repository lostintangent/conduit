/**
 * WorkingFooter - Summary footer for the changes review pane.
 *
 * Displays a summary of staged, unstaged, and total file counts
 * at the bottom of the changes review pane.
 *
 * @example
 * ```tsx
 * <WorkingFooter
 *   stagedCount={3}
 *   unstagedCount={5}
 *   totalCount={8}
 * />
 * // Renders: "3 staged • 5 unstaged • 8 total changes"
 * ```
 */

export interface ReviewWorkingPaneFooterProps {
  /** Number of staged files */
  stagedCount: number;

  /** Number of unstaged files */
  unstagedCount: number;

  /** Total number of changed files */
  totalCount: number;
}

/**
 * Summary footer showing file counts by status.
 */
export function ReviewWorkingPaneFooter({
  stagedCount,
  unstagedCount,
  totalCount,
}: ReviewWorkingPaneFooterProps) {
  return (
    <div
      className="px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground"
      data-testid="changes-footer"
    >
      {stagedCount > 0 && (
        <span className="text-green-500">{stagedCount} staged</span>
      )}
      {stagedCount > 0 && unstagedCount > 0 && <span className="mx-2">•</span>}
      {unstagedCount > 0 && (
        <span className="text-yellow-500">{unstagedCount} unstaged</span>
      )}
      <span className="mx-2">•</span>
      <span>{totalCount} total changes</span>
    </div>
  );
}
