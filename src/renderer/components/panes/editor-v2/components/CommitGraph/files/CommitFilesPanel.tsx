/**
 * CommitFilesPanel Component
 *
 * Container component that displays the list of files changed in a commit.
 * Shown when a commit row is expanded in the commit graph.
 *
 * Features:
 * - Header with file count and total line changes
 * - Scrollable list of file items
 * - Loading state while files are being fetched
 * - Empty state when no files
 *
 * Layout:
 * ```
 * ┌────────────────────────────────────────┐
 * │ 3 files changed  +25 / -10            │
 * ├────────────────────────────────────────┤
 * │ 📄 src/index.ts           +12 -3  [M] │
 * │ 📄 src/utils/helper.ts    +8 -5   [M] │
 * │ 📄 README.md              +5 -2   [M] │
 * └────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <CommitFilesPanel
 *   files={node.files}
 *   isLoading={node.isLoadingFiles}
 *   selectedFilePath={selectedPath}
 *   onFileSelect={(file) => viewFileDiff(file, commitId)}
 * />
 * ```
 */

import { memo, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils";
import type { CommitFile } from "../types";
import { CommitFilesHeader } from "./CommitFilesHeader";
import { CommitFileItem } from "./CommitFileItem";

// =============================================================================
// Types
// =============================================================================

export interface CommitFilesPanelProps {
  /** List of files changed in the commit */
  files?: CommitFile[];

  /** Whether files are currently being loaded */
  isLoading?: boolean;

  /** Currently selected file path (for highlighting) */
  selectedFilePath?: string;

  /** Callback when a file is clicked */
  onFileSelect?: (file: CommitFile) => void;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calculate total additions and deletions across all files.
 */
function calculateTotals(files: CommitFile[]): {
  totalAdditions: number;
  totalDeletions: number;
} {
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const file of files) {
    if (file.additions !== undefined) {
      totalAdditions += file.additions;
    }
    if (file.deletions !== undefined) {
      totalDeletions += file.deletions;
    }
  }

  return { totalAdditions, totalDeletions };
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Loading state with spinner.
 */
function LoadingState() {
  return (
    <div
      className="flex items-center justify-center py-3 text-muted-foreground text-[12px]"
      data-testid="files-loading"
    >
      <Loader2 className="h-3 w-3 animate-spin mr-2" />
      Loading files...
    </div>
  );
}

/**
 * Empty state when no files.
 */
function EmptyState() {
  return (
    <div
      className="py-3 text-center text-muted-foreground text-[12px]"
      data-testid="files-empty"
    >
      No files changed
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

/**
 * Panel displaying the list of files changed in a commit.
 *
 * Handles loading, empty, and populated states.
 * File items are clickable to view the file diff.
 */
function CommitFilesPanelComponent({
  files,
  isLoading = false,
  selectedFilePath,
  onFileSelect,
  className,
}: CommitFilesPanelProps) {
  // Calculate totals for the header
  const { totalAdditions, totalDeletions } = useMemo(
    () => calculateTotals(files ?? []),
    [files],
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn("bg-background/50 rounded-sm", className)}
        data-testid="commit-files-panel"
      >
        <LoadingState />
      </div>
    );
  }

  // Empty state
  if (!files || files.length === 0) {
    return (
      <div
        className={cn("bg-background/50 rounded-sm", className)}
        data-testid="commit-files-panel"
      >
        <EmptyState />
      </div>
    );
  }

  // Populated state
  return (
    <div
      className={cn("bg-background/50 rounded-sm", className)}
      data-testid="commit-files-panel"
    >
      {/* Header with summary */}
      <CommitFilesHeader
        fileCount={files.length}
        totalAdditions={totalAdditions}
        totalDeletions={totalDeletions}
      />

      {/* File list */}
      <ul
        className="py-0.5"
        role="list"
        aria-label="Changed files"
        data-testid="commit-files-list"
      >
        {files.map((file) => (
          <CommitFileItem
            key={file.path}
            file={file}
            isSelected={selectedFilePath === file.path}
            onClick={onFileSelect}
          />
        ))}
      </ul>
    </div>
  );
}

export const CommitFilesPanel = memo(CommitFilesPanelComponent);

export default CommitFilesPanel;
