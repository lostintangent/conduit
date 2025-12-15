/**
 * CommitReviewPane - Full commit review with all file diffs.
 *
 * Displays a read-only view of all changes in a commit:
 * - Header with commit metadata (subject, author, date, stats)
 * - Scrollable list of file diffs
 * - Loading and error states
 *
 * This is the historical counterpart to ChangesReviewPane, but for
 * viewing past commits instead of working tree changes.
 *
 * @example
 * ```tsx
 * <CommitReviewPane
 *   commitId="abc123"
 *   parentCommitId="def456"
 *   git={git}
 *   onExit={() => setViewMode({ type: 'editor' })}
 * />
 * ```
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { Loader2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { GitV2API } from "@/api/GitV2API";
import { CommitReviewHeader } from "./CommitReviewHeader";
import { CommitReviewFileItem } from "./CommitReviewFileItem";
import { useCommitDetails } from "./hooks";
import { Button } from "@/components/ui/button";

export interface CommitReviewPaneProps {
  /** Commit ID to review */
  commitId: string;

  /** Parent commit ID for comparison */
  parentCommitId: string;

  /** Git API instance */
  git: GitV2API;

  /** Callback to exit review mode */
  onExit?: () => void;

  /** Optional file path to scroll to and expand */
  selectedFilePath?: string;
}

/**
 * Full commit review pane with all file diffs.
 */
export function CommitReviewPane({
  commitId,
  parentCommitId,
  git,
  onExit,
  selectedFilePath,
}: CommitReviewPaneProps) {
  // Fetch commit details
  const { commit, files, isLoading, error, stats } = useCommitDetails(
    commitId,
    git,
  );

  // ---------------------------------------------------------------------------
  // Expanded Files State
  // ---------------------------------------------------------------------------

  // Track which files are expanded
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => {
    // If a file is pre-selected, start with it expanded
    return selectedFilePath ? new Set([selectedFilePath]) : new Set();
  });

  // Track if we've done the initial expansion
  const [hasInitialExpanded, setHasInitialExpanded] = useState(false);

  // Expand all files by default when first loaded
  useEffect(() => {
    if (!hasInitialExpanded && files.length > 0) {
      setExpandedFiles(new Set(files.map((f) => f.path)));
      setHasInitialExpanded(true);
    }
  }, [files, hasInitialExpanded]);

  // Toggle a file's expansion state
  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  // Expand all files
  const expandAll = useCallback(() => {
    setExpandedFiles(new Set(files.map((f) => f.path)));
  }, [files]);

  // Collapse all files
  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  // Check if all files are expanded
  const allExpanded = useMemo(() => {
    return files.length > 0 && files.every((f) => expandedFiles.has(f.path));
  }, [files, expandedFiles]);

  // Check if any files are expanded
  const anyExpanded = useMemo(() => {
    return expandedFiles.size > 0;
  }, [expandedFiles]);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div
        className="flex flex-col h-full w-full bg-background"
        data-testid="commit-review-pane"
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span>Loading commit...</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------

  if (error || !commit) {
    return (
      <div
        className="flex flex-col h-full w-full bg-background"
        data-testid="commit-review-pane"
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center p-4">
            <AlertCircle size={24} className="text-destructive" />
            <p className="text-destructive">
              {error || "Failed to load commit"}
            </p>
            {onExit && (
              <Button variant="outline" size="sm" onClick={onExit}>
                Go back
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------

  if (files.length === 0) {
    return (
      <div
        className="flex flex-col h-full w-full bg-background"
        data-testid="commit-review-pane"
      >
        <CommitReviewHeader
          subject={commit.subject}
          shortId={commit.shortId}
          fullId={commit.id}
          author={commit.author}
          timestamp={commit.timestamp}
          stats={stats}
          onBack={onExit}
        />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">
            No files changed in this commit
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main Content
  // ---------------------------------------------------------------------------

  return (
    <div
      className="flex flex-col h-full w-full bg-background"
      data-testid="commit-review-pane"
    >
      {/* Header */}
      <CommitReviewHeader
        subject={commit.subject}
        shortId={commit.shortId}
        fullId={commit.id}
        author={commit.author}
        timestamp={commit.timestamp}
        stats={stats}
        onBack={onExit}
      />

      {/* Expand/Collapse controls */}
      <div className="flex items-center justify-end gap-2 px-3 py-1 border-b text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={allExpanded ? collapseAll : expandAll}
        >
          {allExpanded ? (
            <>
              <ChevronRight size={12} className="mr-1" />
              Collapse All
            </>
          ) : (
            <>
              <ChevronDown size={12} className="mr-1" />
              Expand All
            </>
          )}
        </Button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {files.map((file) => (
          <CommitReviewFileItem
            key={file.path}
            file={file}
            commitId={commitId}
            parentCommitId={parentCommitId}
            git={git}
            isExpanded={expandedFiles.has(file.path)}
            onToggle={() => toggleFile(file.path)}
          />
        ))}
      </div>
    </div>
  );
}
