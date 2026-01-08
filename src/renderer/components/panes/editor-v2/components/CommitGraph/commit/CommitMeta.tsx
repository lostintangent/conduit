/**
 * CommitMeta Component
 *
 * Displays commit metadata: relative time, author, and short hash.
 * This is the secondary information line in a commit row, providing
 * context without dominating the display.
 *
 * Layout: "2h ago · John Doe · abc1234"
 *
 * @example
 * ```tsx
 * <CommitMeta
 *   timestamp={1702400000}
 *   author="John Doe"
 *   shortId="abc1234"
 * />
 * ```
 */

import { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
import { formatRelativeTime, formatFullDate } from "../../../utils";

// =============================================================================
// Props
// =============================================================================

export interface CommitMetaProps {
  /** Unix timestamp in seconds */
  timestamp: number;

  /** Author name */
  author: string;

  /** Short commit hash (7 characters) */
  shortId: string;

  /** Optional className for the container */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * CommitMeta displays the secondary line of commit information.
 *
 * Uses subtle text styling to not compete with the commit subject.
 * The relative time has a tooltip showing the full date.
 */
function CommitMetaComponent({
  timestamp,
  author,
  shortId,
  className,
}: CommitMetaProps) {
  const relativeTime = formatRelativeTime(timestamp);
  const fullDate = formatFullDate(timestamp);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        "truncate min-w-0",
        className,
      )}
      data-testid="commit-meta"
    >
      {/* Relative time with tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="flex-shrink-0 cursor-default"
            data-testid="commit-meta-time"
          >
            {relativeTime}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {fullDate}
        </TooltipContent>
      </Tooltip>

      <span className="text-muted-foreground/50">·</span>

      {/* Author name - truncates if needed */}
      <span
        className="truncate min-w-0"
        title={author}
        data-testid="commit-meta-author"
      >
        {author}
      </span>

      <span className="text-muted-foreground/50">·</span>

      {/* Short hash - monospace for consistency */}
      <span
        className="flex-shrink-0 font-mono text-[11px]"
        data-testid="commit-meta-hash"
      >
        {shortId}
      </span>
    </div>
  );
}

/**
 * Memoized CommitMeta component.
 * Re-renders only when props change.
 */
export const CommitMeta = memo(CommitMetaComponent);

export default CommitMeta;
