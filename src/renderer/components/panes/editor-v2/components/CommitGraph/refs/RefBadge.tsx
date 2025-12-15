/**
 * RefBadge Component
 *
 * Renders a badge for a git reference (branch or tag) in the commit graph.
 * Styled to match VS Code's git graph reference badges.
 *
 * Badge styles by type:
 * - HEAD (current branch): Prominent accent color, shows branch name
 * - Local branch: Subtle background, branch icon
 * - Remote branch: Subtle background, shows remote/branch
 * - Tag: Different color, tag icon
 *
 * @example
 * ```tsx
 * <RefBadge ref={{ type: "head", name: "main", isHead: true }} />
 * <RefBadge ref={{ type: "remote", name: "main", remote: "origin" }} />
 * <RefBadge ref={{ type: "tag", name: "v1.0.0" }} />
 * ```
 */

import { memo } from "react";
import { GitBranch, Tag } from "lucide-react";
import { cn } from "@/utils";
import type { GitRef } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface RefBadgeProps {
  /** The git reference to display */
  gitRef: GitRef;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Badge displaying a git reference.
 *
 * Uses compact styling to fit inline with commit messages.
 * Color and icon vary based on ref type.
 */
function RefBadgeComponent({ gitRef, className }: RefBadgeProps) {
  const { type, name, remote, isHead } = gitRef;

  // Build display text
  const displayText = type === "remote" && remote ? `${remote}/${name}` : name;

  // Determine icon
  const Icon = type === "tag" ? Tag : GitBranch;

  // Base styles - compact inline badge
  const baseStyles = cn(
    "inline-flex items-center gap-1",
    "px-1.5 py-0.5",
    "rounded text-[11px] font-medium",
    "leading-none whitespace-nowrap",
    "max-w-[150px]", // Prevent very long branch names from breaking layout
  );

  // Type-specific styles
  const typeStyles = cn({
    // HEAD (current branch) - prominent accent styling
    "bg-accent/20 text-accent border border-accent/30": isHead,

    // Local branch - subtle foreground styling
    "bg-foreground/10 text-foreground/80": type === "head" && !isHead,

    // Remote branch - even more subtle
    "bg-foreground/5 text-foreground/60": type === "remote",

    // Tag - distinct color
    "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400": type === "tag",
  });

  return (
    <span
      className={cn(baseStyles, typeStyles, className)}
      title={displayText}
      data-testid={`ref-badge-${type}`}
      data-ref-name={name}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{displayText}</span>
    </span>
  );
}

export const RefBadge = memo(RefBadgeComponent);

// =============================================================================
// RefBadgeList Component
// =============================================================================

export interface RefBadgeListProps {
  /** Array of git references to display */
  refs: GitRef[];

  /** Maximum number of refs to show before collapsing */
  maxVisible?: number;

  /** Optional additional class names */
  className?: string;
}

/**
 * List of ref badges with optional overflow handling.
 *
 * When there are more refs than maxVisible, shows a "+N more" indicator.
 */
function RefBadgeListComponent({
  refs,
  maxVisible = 3,
  className,
}: RefBadgeListProps) {
  if (refs.length === 0) {
    return null;
  }

  const visibleRefs = refs.slice(0, maxVisible);
  const overflowCount = refs.length - maxVisible;

  return (
    <span
      className={cn("inline-flex items-center gap-1 flex-wrap", className)}
      data-testid="ref-badge-list"
    >
      {visibleRefs.map((ref, index) => (
        <RefBadge
          key={`${ref.type}-${ref.remote || ""}-${ref.name}-${index}`}
          gitRef={ref}
        />
      ))}
      {overflowCount > 0 && (
        <span
          className="text-[11px] text-muted-foreground px-1"
          title={refs
            .slice(maxVisible)
            .map((r) => (r.remote ? `${r.remote}/${r.name}` : r.name))
            .join(", ")}
        >
          +{overflowCount}
        </span>
      )}
    </span>
  );
}

export const RefBadgeList = memo(RefBadgeListComponent);

export default RefBadge;
