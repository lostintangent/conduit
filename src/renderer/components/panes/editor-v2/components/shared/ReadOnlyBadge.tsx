/**
 * ReadOnlyBadge - Indicator for read-only editor content.
 *
 * Displays a small badge with an eye icon to indicate that the
 * editor content is read-only (e.g., historical commit content).
 *
 * @example
 * ```tsx
 * <ReadOnlyBadge />
 * <ReadOnlyBadge tooltip="Historical content from commit abc123" />
 * ```
 */

import { Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";

export interface ReadOnlyBadgeProps {
  /** Custom tooltip text */
  tooltip?: string;

  /** Optional additional class names */
  className?: string;
}

/**
 * Read-only indicator badge for editors.
 *
 * Shows an eye icon with "Read-only" text, with a tooltip explaining
 * why the content cannot be edited.
 */
export function ReadOnlyBadge({
  tooltip = "Read-only content",
  className,
}: ReadOnlyBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded",
            "bg-muted/80 text-xs text-muted-foreground",
            "cursor-default select-none",
            className,
          )}
          data-testid="read-only-badge"
        >
          <Eye size={12} />
          <span>Read-only</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
