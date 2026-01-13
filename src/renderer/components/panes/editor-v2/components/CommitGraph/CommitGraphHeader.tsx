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

import { memo } from "react";
import { RefreshCw } from "lucide-react";
import { FillingIcon } from "@/components/ui/filling-icon";
import { Toggle } from "@/components/ui/toggle";
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
  // Match GitBranchToolbar button styling
  const toggleButtonClass = "[&_svg]:size-3.5";

  return (
    <div
      className={cn(
        "flex items-center justify-between",
        "px-3 py-1.5",
        "bg-elevated",
        "text-[13px]",
        "border-b border-border",
        className,
      )}
      data-testid="commit-graph-header"
    >
      {/* Title */}
      <h3 className="font-medium text-foreground" data-testid="header-title">
        {title}
      </h3>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {onRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                pressed={false}
                onPressedChange={() => !isRefreshing && onRefresh()}
                disabled={isRefreshing}
                size="sm"
                className={toggleButtonClass}
                aria-label="Refresh commits"
                data-testid="refresh-button"
              >
                <FillingIcon icon={RefreshCw} isAnimating={isRefreshing} />
              </Toggle>
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
