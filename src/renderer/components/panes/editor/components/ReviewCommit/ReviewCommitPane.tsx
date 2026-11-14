/**
 * ReviewCommitPane - Read-only view of all changes in a historical commit.
 *
 * Displays a list of files changed in a commit with inline diffs.
 * This is a focused, read-only component - no staging, editing, or git operations.
 *
 * Uses shared FileEditor component in commit mode for consistent
 * rendering with ReviewWorkingPane.
 *
 * @example
 * ```tsx
 * <ReviewCommitPane
 *   cwd="/project"
 *   commitId="abc1234567890"
 *   parentCommitId="def0987654321"
 *   files={commitFiles}
 *   commitMetadata={{ subject: "Fix bug", author: "Jane", ... }}
 *   onClose={handleClose}
 * />
 * ```
 */

import type { CommitFile } from "@/api/GitV2API";
import { GitCommit } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { FileEditor } from "../shared";
import { ReviewCommitPaneFooter } from "./ReviewCommitPaneFooter";
import { ReviewCommitPaneHeader } from "./ReviewCommitPaneHeader";

// ============================================================================
// Types
// ============================================================================

export interface CommitMetadata {
  /** Short commit hash (7 characters) */
  shortId: string;
  /** Full commit hash */
  fullId: string;
  /** Commit subject (first line of message) */
  subject: string;
  /** Author name */
  author: string;
  /** Unix timestamp (seconds since epoch) */
  timestamp: number;
}

export interface ReviewCommitPaneProps {
  /** Working directory */
  cwd: string;

  /** Commit ID (the "after" state) */
  commitId: string;

  /** Parent commit ID (the "before" state) */
  parentCommitId: string;

  /** Files changed in this commit */
  files: CommitFile[];

  /** Commit metadata for the header */
  commitMetadata?: CommitMetadata;

  /** Callback when close button is clicked */
  onClose?: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Read-only pane for viewing all changes in a historical commit.
 */
export function ReviewCommitPane({
  cwd,
  commitId,
  parentCommitId,
  files,
  commitMetadata,
  onClose,
}: ReviewCommitPaneProps) {
  // Sort files alphabetically
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  // Files start expanded, so track the ones the user collapsed
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(
    () => new Set(),
  );

  // Toggle file expansion
  const toggleFile = useCallback((path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Empty state
  if (files.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2"
        data-testid="commit-changes-pane-empty"
      >
        <GitCommit className="w-8 h-8 opacity-50" />
        <span>No files in this commit</span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="commit-changes-pane"
    >
      {/* Commit Header */}
      <ReviewCommitPaneHeader
        shortId={commitMetadata?.shortId ?? commitId.slice(0, 7)}
        subject={commitMetadata?.subject ?? "Commit details"}
        onClose={onClose}
      />

      {/* Scrollable File List */}
      <div className="flex-1 overflow-auto" data-testid="changes-list">
        {sortedFiles.map((file) => (
          <FileEditor
            key={file.path}
            layout="inline"
            context="commit"
            filePath={file.path}
            cwd={cwd}
            commitFile={file}
            commitId={commitId}
            parentCommitId={parentCommitId}
            isExpanded={!collapsedFiles.has(file.path)}
            onToggle={() => toggleFile(file.path)}
          />
        ))}
      </div>

      {/* Footer */}
      <ReviewCommitPaneFooter
        fileCount={files.length}
        author={commitMetadata?.author}
        timestamp={commitMetadata?.timestamp}
      />
    </div>
  );
}
