/**
 * CommitGraphHeader Component
 *
 * Header bar for the commit graph panel.
 * Displays the panel title and provides a refresh button.
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────┐
 * │ Commits                            [⟳] │
 * └─────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <CommitGraphHeader
 *   onRefresh={refreshCommits}
 *   isRefreshing={isLoading}
 * />
 * ```
 */

import { memo, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";

// =============================================================================
// Types
// =============================================================================

export interface CommitGraphHeaderProps {
  /** Called when the refresh button is clicked */
  onRefresh?: () => void;

  /** Whether a refresh is in progress */
  isRefreshing?: boolean;

  /** Optional title override (default: "Commits") */
  title?: string;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Header component for the commit graph panel.
 *
 * Features:
 * - Panel title ("Commits")
 * - Refresh button with loading state
 * - Tooltip for refresh button
 */
function CommitGraphHeaderComponent({
  onRefresh,
  isRefreshing = false,
  title = "Commits",
  className,
}: CommitGraphHeaderProps) {
  const handleRefresh = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isRefreshing) {
        onRefresh?.();
      }
    },
    [onRefresh, isRefreshing],
  );

  return (
    <div
      className={cn(
        "flex items-center justify-between",
        "px-3 py-2",
        "border-b border-border/50",
        "bg-background/50",
        className,
      )}
      data-testid="commit-graph-header"
    >
      {/* Title */}
      <h3
        className="text-xs font-medium text-foreground"
        data-testid="header-title"
      >
        {title}
      </h3>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {onRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleRefresh}
                disabled={isRefreshing}
                aria-label="Refresh commits"
                data-testid="refresh-button"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Refresh commits</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export const CommitGraphHeader = memo(CommitGraphHeaderComponent);

export default CommitGraphHeader;
