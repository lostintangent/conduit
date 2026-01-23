/**
 * EmptyState Component
 *
 * Displayed when the repository has no commits yet.
 * Shows a friendly message with guidance for the user.
 *
 * @example
 * ```tsx
 * if (nodes.length === 0 && !isLoading) {
 *   return <EmptyState />;
 * }
 * ```
 */

import { memo } from "react";
import { GitCommitHorizontal } from "lucide-react";
import { cn } from "@/utils";

// =============================================================================
// Types
// =============================================================================

export interface EmptyStateProps {
  /** Custom title to display (default: "No commits yet") */
  title?: string;

  /** Custom description to display */
  description?: string;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Empty state for the commit graph panel.
 *
 * Shown when there are no commits to display.
 * Provides helpful guidance about getting started.
 */
function EmptyStateComponent({
  title = "No commits yet",
  description = "This repository doesn't have any commits. Create your first commit to see the history.",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        "py-8 px-4 text-center",
        className,
      )}
      data-testid="commit-graph-empty"
    >
      <GitCommitHorizontal
        className="h-10 w-10 text-muted-foreground/50 mb-4"
        aria-hidden="true"
      />

      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>

      <p className="text-xs text-muted-foreground max-w-[200px]">
        {description}
      </p>
    </div>
  );
}

export const EmptyState = memo(EmptyStateComponent);

export default EmptyState;
