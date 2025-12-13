/**
 * ViewAllButton Component
 *
 * A small icon button that opens the full commit review pane.
 * Shows an eye icon to indicate "view all changes".
 *
 * Positioned at the right end of the commit row, it provides
 * quick access to the detailed commit view without expanding
 * the row inline.
 *
 * @example
 * ```tsx
 * <ViewAllButton
 *   onClick={() => openCommitReview(commitId)}
 * />
 * ```
 */

import { memo } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";

// =============================================================================
// Props
// =============================================================================

export interface ViewAllButtonProps {
  /** Called when the button is clicked */
  onClick: () => void;

  /** Optional className for the button */
  className?: string;

  /** Whether the button is disabled */
  disabled?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * ViewAllButton renders an eye icon button for viewing all commit changes.
 *
 * Uses ghost styling to be subtle until hovered, matching the
 * overall design of the commit row.
 */
function ViewAllButtonComponent({
  onClick,
  className,
  disabled = false,
}: ViewAllButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation(); // Don't trigger row expansion
            onClick();
          }}
          disabled={disabled}
          className={cn(
            "h-6 w-6 flex-shrink-0",
            "text-muted-foreground hover:text-foreground",
            "opacity-0 group-hover:opacity-100 focus:opacity-100",
            "transition-opacity duration-150",
            className,
          )}
          aria-label="View all changes in this commit"
          data-testid="view-all-button"
        >
          <Eye size={14} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        View all changes
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Memoized ViewAllButton component.
 * Re-renders only when props change.
 */
export const ViewAllButton = memo(ViewAllButtonComponent);

export default ViewAllButton;
