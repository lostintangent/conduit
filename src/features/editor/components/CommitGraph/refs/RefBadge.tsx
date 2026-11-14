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
import { getColorCss } from "../graph/colors";

// =============================================================================
// Types
// =============================================================================

/**
 * Color hint for tracked branch badges.
 * Used to override the default styling for VS Code-style coloring.
 */
export type RefBadgeColorHint = "current" | "upstream" | "base";

export interface RefBadgeProps {
  /** The git reference to display */
  gitRef: GitRef;

  /**
   * Optional color hint for tracked branch visualization.
   * When set, overrides the default type-based coloring:
   * - "current": Blue (current branch)
   * - "upstream": Purple (upstream/remote tracking)
   * - "base": Orange (base branch like origin/main)
   */
  colorHint?: RefBadgeColorHint;

  /**
   * When true, shows only the icon without the branch name.
   *
   * Used for VS Code-style badge display where the first badge
   * shows full text and subsequent badges show only icons.
   * This avoids redundant text when multiple refs point to the same commit.
   */
  iconOnly?: boolean;

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
 * Color and icon vary based on ref type, with optional colorHint override.
 */
function RefBadgeComponent({
  gitRef,
  colorHint,
  iconOnly = false,
  className,
}: RefBadgeProps) {
  const { type, name, remote, isHead } = gitRef;

  // Build display text (used for title tooltip even when iconOnly)
  const displayText = type === "remote" && remote ? `${remote}/${name}` : name;

  // Determine icon
  const Icon = type === "tag" ? Tag : GitBranch;

  // Base styles - compact inline badge
  // When iconOnly, remove gap and use symmetric padding
  const baseStyles = cn(
    "inline-flex items-center",
    iconOnly ? "p-1" : "gap-1 px-1.5 py-0.5",
    "rounded text-[11px] font-medium",
    "leading-none whitespace-nowrap",
    !iconOnly && "max-w-[150px]", // Only limit width when showing text
  );

  // Color hint styles (for tracked branch visualization)
  // These override the default type-based coloring
  // Note: base uses inline style to match swimlane color exactly
  const colorHintStyles = colorHint
    ? cn({
        // Current branch - Blue
        "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30":
          colorHint === "current",

        // Upstream branch - Purple
        "bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30":
          colorHint === "upstream",

        // Base branch - Orange background/border (text via inline style)
        "bg-orange-500/20 border border-orange-500/30": colorHint === "base",
      })
    : null;

  // Inline style for base color to exactly match swimlane
  const inlineStyle =
    colorHint === "base" ? { color: getColorCss("base") } : undefined;

  // Type-specific styles (used when no colorHint)
  const typeStyles = !colorHint
    ? cn({
        // HEAD (current branch) - prominent accent styling
        "bg-accent/20 text-accent border border-accent/30": isHead,

        // Local branch - subtle foreground styling
        "bg-foreground/10 text-foreground/80": type === "head" && !isHead,

        // Remote branch - even more subtle
        "bg-foreground/5 text-foreground/60": type === "remote",

        // Tag - distinct color
        "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400": type === "tag",
      })
    : null;

  return (
    <span
      className={cn(baseStyles, colorHintStyles, typeStyles, className)}
      style={inlineStyle}
      title={displayText}
      data-testid={`ref-badge-${type}`}
      data-ref-name={name}
      data-color-hint={colorHint}
      data-icon-only={iconOnly || undefined}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      {!iconOnly && <span className="truncate">{displayText}</span>}
    </span>
  );
}

export const RefBadge = memo(RefBadgeComponent);

// =============================================================================
// RefBadgeList Component
// =============================================================================

/**
 * A ref with optional display hints for tracked branch visualization.
 */
export interface RefWithColorHint {
  ref: GitRef;
  colorHint?: RefBadgeColorHint;
  /**
   * When true, shows only the icon without the branch name.
   * Used when multiple refs point to the same commit to avoid redundancy.
   */
  iconOnly?: boolean;
}

export interface RefBadgeListProps {
  /** Array of git references to display (can include color hints) */
  refs: GitRef[] | RefWithColorHint[];

  /** Maximum number of refs to show before collapsing */
  maxVisible?: number;

  /** Optional additional class names */
  className?: string;
}

/**
 * Type guard to check if an item is RefWithColorHint
 */
function isRefWithColorHint(
  item: GitRef | RefWithColorHint,
): item is RefWithColorHint {
  return "ref" in item;
}

/**
 * Normalize a ref item to get the GitRef and optional display hints
 */
function normalizeRefItem(item: GitRef | RefWithColorHint): {
  gitRef: GitRef;
  colorHint?: RefBadgeColorHint;
  iconOnly?: boolean;
} {
  if (isRefWithColorHint(item)) {
    return {
      gitRef: item.ref,
      colorHint: item.colorHint,
      iconOnly: item.iconOnly,
    };
  }
  return { gitRef: item };
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
      {visibleRefs.map((item, index) => {
        const { gitRef, colorHint, iconOnly } = normalizeRefItem(item);
        return (
          <RefBadge
            key={`${gitRef.type}-${gitRef.remote || ""}-${gitRef.name}-${index}`}
            gitRef={gitRef}
            colorHint={colorHint}
            iconOnly={iconOnly}
          />
        );
      })}
      {overflowCount > 0 && (
        <span
          className="text-[11px] text-muted-foreground px-1"
          title={refs
            .slice(maxVisible)
            .map((item) => {
              const { gitRef } = normalizeRefItem(item);
              return gitRef.remote
                ? `${gitRef.remote}/${gitRef.name}`
                : gitRef.name;
            })
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
