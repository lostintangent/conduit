import { GitStatusBadge, getStatusConfig } from "./GitStatusBadge";
import type { GitFileStatus, GitStatusMap } from "@shared/types";
import { useState } from "react";

type GitStatusSummaryProps = {
  gitStatus: GitStatusMap | null;
  changedFilesCount: number;
};

export function GitStatusSummary({
  gitStatus,
  changedFilesCount,
}: GitStatusSummaryProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate unique status badges and counts (one per status type)
  const statusCounts = new Map<string, number>();
  const uniqueStatuses: GitFileStatus[] = [];

  if (gitStatus) {
    gitStatus.forEach((status) => {
      // Count by status type only (not staged state)
      statusCounts.set(
        status.status,
        (statusCounts.get(status.status) || 0) + 1,
      );

      // Add to unique statuses if this status type isn't already present
      if (!uniqueStatuses.some((s) => s.status === status.status)) {
        uniqueStatuses.push(status);
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
    <div
      className="flex items-center gap-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!isHovered && (
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
              className="flex items-center transition-all duration-300 ease-out"
              style={{
                marginLeft:
                  index > 0 ? (isHovered ? "0.25rem" : "-0.125rem") : 0,
              }}
            >
              <div className="flex items-center">
                <GitStatusBadge status={status} isFolder={true} />
                <span
                  className="text-xs transition-all duration-300 ease-out origin-left"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    transform: isHovered ? "scaleX(1)" : "scaleX(0)",
                    width: isHovered ? "auto" : 0,
                    marginLeft: isHovered ? "0.25rem" : 0,
                    marginRight: isHovered ? "0.125rem" : 0,
                  }}
                >
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
