import { GitStatusBadge, getStatusConfig } from "./GitStatusBadge";
import type { GitFileStatus, GitStatusMap } from "@shared/types";

type GitStatusSummaryProps = {
  gitStatus: GitStatusMap | null;
  changedFilesCount: number;
  showOnlyChangedFiles?: boolean;
  isHovered?: boolean;
};

export function GitStatusSummary({
  gitStatus,
  changedFilesCount,
  showOnlyChangedFiles = false,
  isHovered = false,
}: GitStatusSummaryProps) {
  // Show expanded state (letter badges) when filter is active or when hovered
  const isExpanded = showOnlyChangedFiles || isHovered;

  // Calculate unique status badges and counts (one per status type)
  // Count both staged and unstaged statuses separately
  const statusCounts = new Map<string, number>();
  const uniqueStatuses: GitFileStatus[] = [];

  if (gitStatus) {
    gitStatus.forEach((status) => {
      // Count staged status if present
      if (status.stagedStatus) {
        statusCounts.set(
          status.stagedStatus,
          (statusCounts.get(status.stagedStatus) || 0) + 1,
        );

        // Add to unique statuses if this status type isn't already present
        if (!uniqueStatuses.some((s) => s.status === status.stagedStatus)) {
          uniqueStatuses.push({ ...status, status: status.stagedStatus });
        }
      }

      // Count unstaged status if present
      if (status.unstagedStatus) {
        statusCounts.set(
          status.unstagedStatus,
          (statusCounts.get(status.unstagedStatus) || 0) + 1,
        );

        // Add to unique statuses if this status type isn't already present
        if (!uniqueStatuses.some((s) => s.status === status.unstagedStatus)) {
          uniqueStatuses.push({ ...status, status: status.unstagedStatus });
        }
      }

      // Fallback to old behavior if stagedStatus/unstagedStatus not set
      if (!status.stagedStatus && !status.unstagedStatus) {
        statusCounts.set(
          status.status,
          (statusCounts.get(status.status) || 0) + 1,
        );

        if (!uniqueStatuses.some((s) => s.status === status.status)) {
          uniqueStatuses.push(status);
        }
      }
    });
  }

  // Sort statuses by weight (priority)
  uniqueStatuses.sort((a, b) => {
    const configA = getStatusConfig(a);
    const configB = getStatusConfig(b);
    return (configB?.weight || 0) - (configA?.weight || 0);
  });

  return (
    <div className="flex items-center gap-1">
      {!isExpanded && (
        <div className="relative">
          <span
            className="block transition-opacity duration-300 ease-out"
            style={{
              opacity: 0.8,
            }}
          >
            {changedFilesCount}
          </span>
        </div>
      )}
      <div className="flex items-center">
        {uniqueStatuses.map((status, index) => {
          const count = statusCounts.get(status.status) || 0;
          return (
            <div
              key={status.status}
              className="flex items-center"
              style={{
                marginLeft:
                  index > 0 ? (isExpanded ? "0.25rem" : "-0.125rem") : 0,
                transition: "margin-left 300ms ease-out",
              }}
            >
              <div className="flex items-center">
                <span
                  className="text-xs origin-left overflow-hidden whitespace-nowrap"
                  style={{
                    opacity: isExpanded ? 1 : 0,
                    transform: isExpanded
                      ? "scaleX(1) translateZ(0)"
                      : "scaleX(0) translateZ(0)",
                    width: isExpanded ? "auto" : 0,
                    marginLeft: isExpanded ? "0.25rem" : 0,
                    marginRight: isExpanded ? "0.125rem" : 0,
                    transition:
                      "opacity 300ms ease-out, transform 300ms ease-out, width 300ms ease-out, margin 300ms ease-out",
                    willChange: "transform, opacity",
                  }}
                >
                  {count}
                </span>
                {/* Morph between dot and letter badge */}
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    width: isExpanded ? "14px" : "6px",
                    height: isExpanded ? "14px" : "6px",
                    transition: "width 300ms ease-out, height 300ms ease-out",
                  }}
                >
                  {/* Dot (visible when not expanded) */}
                  <div
                    className="absolute flex items-center justify-center"
                    style={{
                      opacity: isExpanded ? 0 : 1,
                      transform: isExpanded
                        ? "scale(0.5) translateZ(0)"
                        : "scale(1) translateZ(0)",
                      transition:
                        "opacity 300ms ease-out, transform 300ms ease-out",
                      willChange: "transform, opacity",
                    }}
                  >
                    <GitStatusBadge status={status} isFolder={true} />
                  </div>
                  {/* Letter badge (visible when expanded) */}
                  <div
                    className="absolute flex items-center justify-center"
                    style={{
                      opacity: isExpanded ? 1 : 0,
                      transform: isExpanded
                        ? "scale(1) translateZ(0)"
                        : "scale(0.5) translateZ(0)",
                      transition:
                        "opacity 300ms ease-out, transform 300ms ease-out",
                      willChange: "transform, opacity",
                    }}
                  >
                    <GitStatusBadge status={status} isFolder={false} />
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
