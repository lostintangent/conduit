/**
 * CommitSubject Component
 *
 * Displays the commit message subject (first line) with optional
 * tooltip showing the full message if it was truncated or has
 * additional body content.
 *
 * The subject is the primary text in a commit row and is styled
 * to be the most prominent element.
 *
 * @example
 * ```tsx
 * <CommitSubject
 *   subject="Fix authentication bug in login flow"
 *   message="Fix authentication bug in login flow\n\nThis fixes issue #123..."
 * />
 * ```
 */

import { memo, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
import { getFirstLine } from "./utils";

// =============================================================================
// Props
// =============================================================================

export interface CommitSubjectProps {
  /** First line of commit message */
  subject: string;

  /**
   * Full commit message (including body).
   * If longer than subject, a tooltip will show the full message.
   */
  message: string;

  /** Optional className for the container */
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum characters to display in the tooltip.
 * Prevents extremely long messages from creating unusable tooltips.
 */
const MAX_TOOLTIP_LENGTH = 500;

// =============================================================================
// Component
// =============================================================================

/**
 * CommitSubject displays the commit's subject line.
 *
 * Features:
 * - Truncates with ellipsis via CSS if too long
 * - Shows tooltip with full message if there's more content
 * - Styled as the primary text in the commit row
 */
function CommitSubjectComponent({
  subject,
  message,
  className,
}: CommitSubjectProps) {
  // Check if there's additional message content beyond the subject
  const hasMoreContent = useMemo(() => {
    const firstLine = getFirstLine(message);
    return message.length > firstLine.length;
  }, [message]);

  // Format tooltip content
  const tooltipContent = useMemo(() => {
    if (!hasMoreContent) return null;

    if (message.length > MAX_TOOLTIP_LENGTH) {
      return message.slice(0, MAX_TOOLTIP_LENGTH) + "…";
    }
    return message;
  }, [message, hasMoreContent]);

  // The subject element with truncation
  const subjectElement = (
    <span
      className={cn("block truncate text-sm text-foreground", className)}
      data-testid="commit-subject"
    >
      {subject}
    </span>
  );

  // If there's more content, wrap in a tooltip
  if (hasMoreContent && tooltipContent) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block min-w-0 cursor-default">{subjectElement}</span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-sm whitespace-pre-wrap text-xs"
        >
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  }

  // No additional content, just render the subject
  return subjectElement;
}

/**
 * Memoized CommitSubject component.
 * Re-renders only when props change.
 */
export const CommitSubject = memo(CommitSubjectComponent);

export default CommitSubject;
