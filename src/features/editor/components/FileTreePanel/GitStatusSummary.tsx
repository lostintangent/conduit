/**
 * GitStatusSummary - Compact git status badge summary.
 *
 * Displays aggregated git status counts with animated morphing between:
 * - Collapsed: Small dots with total count
 * - Expanded: Letter badges with per-status counts
 *
 * The summary shows unique status types sorted by priority (weight).
 *
 * @example
 * ```tsx
 * <GitStatusSummary
 *   gitStatus={gitStatus}
 *   changedFilesCount={5}
 *   isExpanded={showOnlyChangedFiles}
 *   isHovered={isHovered}
 * />
 * ```
 */

import type { GitFileStatus } from "@features/git/model";
import { useMemo } from "react";
import { GitBadge, getStatusConfig } from "../shared";

export interface GitStatusSummaryProps {
  /** Git status map (relative paths to status) */
  gitStatus: Map<string, GitFileStatus> | null;

  /** Total number of changed files */
  changedFilesCount: number;

  /** Whether to show expanded view (letter badges) */
  isExpanded?: boolean;

  /** Whether the summary is being hovered (temporarily expands) */
  isHovered?: boolean;
}

/**
 * Compact git status summary with animated morphing.
 *
 * Shows aggregated status counts that morph between dots and letter badges
 * based on the expanded state.
 */
export function GitStatusSummary({
  gitStatus,
  changedFilesCount,
  isExpanded = false,
  isHovered = false,
}: GitStatusSummaryProps) {
  const showExpanded = isExpanded || isHovered;

  /**
   * Calculate unique status types and their counts.
   */
  const { statusCounts, uniqueStatuses } = useMemo(() => {
    const counts = new Map<string, number>();
    const statuses: GitFileStatus[] = [];

    if (gitStatus) {
      for (const status of gitStatus.values()) {
        // Count each status type
        const statusCode = status.status;
        counts.set(statusCode, (counts.get(statusCode) || 0) + 1);

        // Track unique status types
        if (!statuses.some((s) => s.status === statusCode)) {
          statuses.push(status);
        }
      }
    }

    // Sort statuses by weight (priority) - highest first
    statuses.sort((a, b) => {
      const configA = getStatusConfig(a);
      const configB = getStatusConfig(b);
      return (configB?.weight || 0) - (configA?.weight || 0);
    });

    return { statusCounts: counts, uniqueStatuses: statuses };
  }, [gitStatus]);

  // Show "0" with grey dot when no changes
  if (changedFilesCount === 0) {
    return (
      <div className="flex items-center gap-1" data-testid="git-status-summary">
        <span
          className="block transition-opacity duration-300 ease-out"
          style={{ opacity: 0.5 }}
        >
          0
        </span>
        <div
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" data-testid="git-status-summary">
      {/* Total count - visible when collapsed */}
      {!showExpanded && (
        <div className="relative">
          <span
            className="block transition-opacity duration-300 ease-out"
            style={{ opacity: 0.8 }}
          >
            {changedFilesCount}
          </span>
        </div>
      )}

      {/* Status badges */}
      <div className="flex items-center">
        {uniqueStatuses.map((status, index) => {
          const count = statusCounts.get(status.status) || 0;

          return (
            <div
              key={status.status}
              className="flex items-center"
              style={{
                marginLeft:
                  index > 0 ? (showExpanded ? "0.25rem" : "-0.125rem") : 0,
                transition: "margin-left 300ms ease-out",
              }}
            >
              <div className="flex items-center">
                {/* Per-status count - visible when expanded */}
                <span
                  className="origin-left overflow-hidden whitespace-nowrap"
                  style={{
                    opacity: showExpanded ? 0.8 : 0,
                    transform: showExpanded
                      ? "scaleX(1) translateZ(0)"
                      : "scaleX(0) translateZ(0)",
                    width: showExpanded ? "auto" : 0,
                    marginLeft: showExpanded ? "0.25rem" : 0,
                    marginRight: showExpanded ? "0.125rem" : 0,
                    transition:
                      "opacity 300ms ease-out, transform 300ms ease-out, width 300ms ease-out, margin 300ms ease-out",
                    willChange: "transform, opacity",
                  }}
                >
                  {count}
                </span>

                {/* Morphing badge container */}
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    width: showExpanded ? "14px" : "6px",
                    height: showExpanded ? "14px" : "6px",
                    transition: "width 300ms ease-out, height 300ms ease-out",
                  }}
                >
                  {/* Dot (visible when not expanded) */}
                  <div
                    className="absolute flex items-center justify-center"
                    style={{
                      opacity: showExpanded ? 0 : 1,
                      transform: showExpanded
                        ? "scale(0.5) translateZ(0)"
                        : "scale(1) translateZ(0)",
                      transition:
                        "opacity 300ms ease-out, transform 300ms ease-out",
                      willChange: "transform, opacity",
                    }}
                  >
                    <GitBadge status={status} isFolder={true} />
                  </div>

                  {/* Letter badge (visible when expanded) */}
                  <div
                    className="absolute flex items-center justify-center"
                    style={{
                      opacity: showExpanded ? 1 : 0,
                      transform: showExpanded
                        ? "scale(1) translateZ(0)"
                        : "scale(0.5) translateZ(0)",
                      transition:
                        "opacity 300ms ease-out, transform 300ms ease-out",
                      willChange: "transform, opacity",
                    }}
                  >
                    <GitBadge status={status} isFolder={false} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
