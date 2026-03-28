/**
 * CommitTooltip Component
 *
 * Displays a rich tooltip for commits in the commit graph,
 * similar to VS Code's commit hover display.
 *
 * Layout (matches VS Code):
 * 1. Author name + email + relative/absolute date
 * 2. Full commit message (subject + body)
 * 3. Refs (branches/tags pointing to this commit)
 * 4. Commit hash
 *
 * @example
 * ```tsx
 * <CommitTooltip commit={commit}>
 *   <div>Hover me to see commit details</div>
 * </CommitTooltip>
 * ```
 */

import { memo, useMemo, type ReactNode } from "react";
import { User, Clock, GitCommit } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HistoryCommit } from "../types";
import type { TrackedBranchInfo } from "@/api/GitV2API";
import { formatRelativeTime } from "../../../utils";
import {
  parseRefs,
  filterRefsForDisplay,
  RefBadgeList,
  buildTrackedBranchBadges,
  type RefWithColorHint,
} from "../refs";

// =============================================================================
// Types
// =============================================================================

export interface CommitTooltipProps {
  /** The commit to display in the tooltip */
  commit: HistoryCommit;

  /** Whether this is the HEAD commit */
  isHead?: boolean;

  /**
   * Tracked branch information for colored badges.
   * When provided, shows colored badges matching the commit list.
   */
  trackedBranches?: TrackedBranchInfo | null;

  /** The element that triggers the tooltip on hover */
  children: ReactNode;

  /** Side of the trigger element to show the tooltip */
  side?: "top" | "right" | "bottom" | "left";

  /** Delay before showing the tooltip (in ms) */
  delayDuration?: number;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a timestamp as a full date string.
 * @param timestamp - Unix timestamp in seconds
 */
function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Parse commit message into subject and body.
 * The subject is the first line, body is everything after the first blank line.
 */
function parseCommitMessage(message: string): {
  subject: string;
  body: string;
} {
  const lines = message.split("\n");
  const subject = lines[0] || "";

  // Body starts after the first blank line (or after subject if no blank line)
  let bodyStartIndex = 1;
  if (lines[1] === "") {
    bodyStartIndex = 2;
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim();

  return { subject, body };
}

// =============================================================================
// Component
// =============================================================================

function CommitTooltipComponent({
  commit,
  isHead = false,
  trackedBranches,
  children,
  side = "right",
  delayDuration = 400,
}: CommitTooltipProps) {
  const { subject, body } = parseCommitMessage(commit.message);

  // Convert timestamp from milliseconds to seconds for formatting functions
  const timestampSeconds = Math.floor(commit.timestamp / 1000);
  const relativeTime = formatRelativeTime(timestampSeconds);
  const fullDate = formatFullDate(timestampSeconds);

  // Build refs with color hints (matching the commit list badges)
  const refs = useMemo(() => {
    // Try to build colored badges from tracked branches first
    // Don't use iconOnly - show full text in tooltip
    const trackedBadges = buildTrackedBranchBadges(
      commit.id,
      isHead,
      trackedBranches,
    );

    if (trackedBadges.length > 0) {
      return trackedBadges;
    }

    // Fallback: parse refs from commit without color hints
    if (!commit.refs?.length) return [];
    return filterRefsForDisplay(parseRefs(commit.refs)).map(
      (ref): RefWithColorHint => ({ ref }),
    );
  }, [commit.id, commit.refs, isHead, trackedBranches]);

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align="start"
        className="max-w-md p-0 overflow-hidden"
      >
        <div className="p-3 space-y-2">
          {/* Author + Date (VS Code style) */}
          <div className="flex items-center gap-1.5 text-[13px]">
            <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold">{commit.author},</span>
            <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">
              {relativeTime} ({fullDate})
            </span>
          </div>

          {/* Message */}
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
            {subject}
            {body && (
              <>
                {"\n\n"}
                {body}
              </>
            )}
          </p>

          {/* Refs (branches/tags) - if any */}
          {refs.length > 0 && (
            <div className="pt-2 border-t border-border">
              <RefBadgeList refs={refs} maxVisible={5} />
            </div>
          )}

          {/* Commit hash */}
          <div className="pt-2 border-t border-border flex items-center gap-2 text-[13px] text-muted-foreground">
            <GitCommit className="w-4 h-4 flex-shrink-0" />
            <code className="font-mono text-[12px]">{commit.shortId}</code>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export const CommitTooltip = memo(CommitTooltipComponent);

export default CommitTooltip;
