/**
 * CommitReviewFileItem - Individual file item in the commit review pane.
 *
 * Displays a collapsible file entry showing:
 * - File path with status badge
 * - Change statistics (+/-)
 * - Inline historical diff when expanded (read-only)
 *
 * Unlike FileChangeDiff, this is entirely read-only since it shows
 * historical content from a commit, not working tree changes.
 *
 * @example
 * ```tsx
 * <CommitReviewFileItem
 *   file={{ path: "src/index.ts", status: "modified", additions: 10, deletions: 3 }}
 *   commitId="abc123"
 *   parentCommitId="def456"
 *   git={git}
 *   isExpanded={true}
 *   onToggle={() => setExpanded(!expanded)}
 * />
 * ```
 */

import { useMemo } from "react";
import { ChevronRight, ChevronDown, FileText } from "lucide-react";
import type { GitV2API } from "@/api/GitV2API";
import type { CommitFile, GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { HistoricalDiffViewer } from "../EditorViewPanel/HistoricalDiffViewer";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import { GitBadge } from "../shared";
import { cn } from "@/utils";

export interface CommitReviewFileItemProps {
  /** File changed in the commit */
  file: CommitFile;

  /** Commit ID (for the "after" state) */
  commitId: string;

  /** Parent commit ID (for the "before" state) */
  parentCommitId: string;

  /** Git API instance */
  git: GitV2API;

  /** Whether the diff is expanded */
  isExpanded: boolean;

  /** Toggle expansion callback */
  onToggle: () => void;
}

/**
 * Map CommitFile to GitFileStatus format for GitBadge.
 */
function mapToGitFileStatus(file: CommitFile): GitFileStatus {
  // Map commit file statuses to the format GitBadge expects
  // For historical commits, staged doesn't apply - we use true
  // to show the "committed" color variant
  const mappedStatus = file.status === "copied" ? "renamed" : file.status;
  return {
    status: mappedStatus,
    staged: true, // Historical commits are "staged" (committed)
    path: file.path,
  };
}

/**
 * Individual file item with collapsible historical diff.
 */
export function CommitReviewFileItem({
  file,
  commitId,
  parentCommitId,
  git,
  isExpanded,
  onToggle,
}: CommitReviewFileItemProps) {
  // Extract file name from path
  const fileName = useMemo(() => {
    return file.path.split("/").pop() ?? file.path;
  }, [file.path]);

  // Directory path (everything except file name)
  const dirPath = useMemo(() => {
    const lastSlash = file.path.lastIndexOf("/");
    return lastSlash > 0 ? file.path.slice(0, lastSlash) : "";
  }, [file.path]);

  // Stable editor ID
  const editorId = useMemo(() => {
    return `commit-review-${commitId.slice(0, 7)}-${file.path.replace(/[^a-zA-Z0-9]/g, "-")}`;
  }, [commitId, file.path]);

  // Stats display
  const additions = file.additions ?? 0;
  const deletions = file.deletions ?? 0;

  return (
    <div
      className="border-b border-border/50"
      data-testid="commit-review-file-item"
    >
      {/* Collapsible header */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 text-left text-sm",
          "hover:bg-muted/50 transition-colors",
          isExpanded && "bg-muted/30",
        )}
        data-testid="file-header"
      >
        {/* Expand/collapse chevron */}
        {isExpanded ? (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}

        {/* File icon */}
        <FileText size={14} className="text-muted-foreground shrink-0" />

        {/* File path */}
        <span className="flex items-baseline gap-1 min-w-0 truncate">
          {dirPath && (
            <span className="text-muted-foreground truncate">{dirPath}/</span>
          )}
          <span className="font-medium truncate">{fileName}</span>
        </span>

        {/* Renamed indicator */}
        {file.originalPath && (
          <span className="text-xs text-muted-foreground truncate shrink-0">
            (from {file.originalPath})
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status badge */}
        <GitBadge status={mapToGitFileStatus(file)} />

        {/* Stats */}
        {(additions > 0 || deletions > 0) && (
          <span className="flex items-center gap-1 text-xs shrink-0">
            {additions > 0 && (
              <span className="text-green-500">+{additions}</span>
            )}
            {deletions > 0 && (
              <span className="text-red-500">-{deletions}</span>
            )}
          </span>
        )}
      </button>

      {/* Expanded diff content */}
      {isExpanded && (
        <div className="border-t border-border/50" data-testid="file-diff">
          <EditorErrorBoundary filePath={file.path}>
            <HistoricalDiffViewer
              editorId={editorId}
              commitId={commitId}
              parentCommitId={parentCommitId}
              filePath={file.path}
              git={git}
            />
          </EditorErrorBoundary>
        </div>
      )}
    </div>
  );
}
