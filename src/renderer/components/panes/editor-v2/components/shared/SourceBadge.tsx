/**
 * SourceBadge - Indicator for git content source.
 *
 * Displays a small badge showing which git ref or commit the content
 * is from (e.g., "abc1234" for a commit, "HEAD" for head).
 *
 * @example
 * ```tsx
 * <SourceBadge label="abc1234" />
 * <SourceBadge label="HEAD" tooltip="Current HEAD commit" />
 * ```
 */

import { GitCommit } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";

export interface SourceBadgeProps {
  /** Label to display (e.g., short commit ID or ref name) */
  label: string;

  /** Optional tooltip text */
  tooltip?: string;

  /** Optional additional class names */
  className?: string;
}

/**
 * Git source indicator badge for editors.
 *
 * Shows a git commit icon with a label (typically a short commit ID
 * or ref name) to indicate where the content comes from.
 */
export function SourceBadge({ label, tooltip, className }: SourceBadgeProps) {
  const badge = (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded",
        "bg-muted/80 text-xs font-mono text-muted-foreground",
        "cursor-default select-none",
        className,
      )}
      data-testid="source-badge"
    >
      <GitCommit size={12} />
      <span>{label}</span>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
