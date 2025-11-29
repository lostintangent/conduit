/**
 * FileChangeDiff - Individual file diff component for the changes review pane.
 *
 * Displays a collapsible diff view for a single changed file with:
 * - Collapsible header showing file path and git status
 * - Embedded diff editor (read-only) when expanded
 * - Inline action buttons: Stage, Unstage, Revert
 *
 * Used within ChangesReviewPane to show multiple file diffs in a scrollable list.
 *
 * @example
 * ```tsx
 * <FileChangeDiff
 *   filePath="src/components/Button.tsx"
 *   cwd="/project"
 *   status={{ path: "src/components/Button.tsx", status: "modified", staged: false }}
 *   isExpanded={true}
 *   onToggle={() => setExpanded(!expanded)}
 * />
 * ```
 */

import { useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Plus,
  Minus,
  RotateCcw,
} from "lucide-react";
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { useGitV2 } from "@/hooks/useGitV2";
import { DiffEditorWrapper } from "../EditorViewPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { GitBadge } from "../shared";

// ============================================================================
// Types
// ============================================================================

export interface FileChangeDiffProps {
  /** Relative file path from git root */
  filePath: string;

  /** Working directory */
  cwd: string;

  /** Git status for this file */
  status: GitFileStatus;

  /** Git ref for original content (default: 'HEAD') */
  baseBranch?: string;

  /** Whether the diff is expanded */
  isExpanded: boolean;

  /** Toggle expansion callback */
  onToggle: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Fixed height for expanded diff view */
const DIFF_HEIGHT = 300;

// ============================================================================
// Component
// ============================================================================

/**
 * Individual file diff with collapsible header and action buttons.
 */
export function FileChangeDiff({
  filePath,
  cwd,
  status,
  baseBranch,
  isExpanded,
  onToggle,
}: FileChangeDiffProps) {
  const git = useGitV2(cwd);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const fileName = useMemo(() => {
    return filePath.split("/").pop() ?? filePath;
  }, [filePath]);

  // Full path for the diff editor
  const fullFilePath = useMemo(() => {
    return cwd.endsWith("/") ? cwd + filePath : cwd + "/" + filePath;
  }, [cwd, filePath]);

  // Stable editor ID based on file path
  const editorId = useMemo(() => {
    return `file-change-diff-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
  }, [filePath]);

  const isStaged = status.staged;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await git.stage([filePath]);
      } catch (error) {
        console.error("Failed to stage file:", error);
      }
    },
    [git, filePath],
  );

  const handleUnstage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await git.unstage([filePath]);
      } catch (error) {
        console.error("Failed to unstage file:", error);
      }
    },
    [git, filePath],
  );

  const handleRevert = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await git.revert([filePath]);
      } catch (error) {
        console.error("Failed to revert file:", error);
      }
    },
    [git, filePath],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="border-b border-border last:border-b-0"
      data-testid={`file-change-diff-${fileName}`}
      data-filepath={filePath}
    >
      {/* Collapsible Header */}
      <div
        className={cn(
          "flex items-center gap-2 w-full py-2 px-3",
          "hover:bg-accent/50 transition-colors",
          "cursor-pointer",
        )}
        data-testid="file-change-diff-header"
      >
        {/* Clickable area for expand/collapse */}
        <div
          className="flex items-center gap-2 flex-1 min-w-0"
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          {/* Expand/Collapse Icon */}
          {isExpanded ? (
            <ChevronDown className="flex-shrink-0 w-4 h-4" />
          ) : (
            <ChevronRight className="flex-shrink-0 w-4 h-4" />
          )}

          {/* File Icon */}
          <File className="flex-shrink-0 w-4 h-4 text-muted-foreground" />

          {/* File Path */}
          <span className="flex-1 truncate text-sm" title={filePath}>
            {filePath}
          </span>

          {/* Git Status Badge */}
          <GitBadge status={status} />
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 flex items-center gap-1">
          {isStaged ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleUnstage}
              title="Unstage"
              data-testid="unstage-button"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleStage}
                title="Stage"
                data-testid="stage-button"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleRevert}
                title="Discard Changes"
                data-testid="revert-button"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Diff Editor (expanded only) */}
      {isExpanded && (
        <div
          className="bg-background"
          style={{ height: DIFF_HEIGHT }}
          data-testid="file-change-diff-content"
        >
          <DiffEditorWrapper
            editorId={editorId}
            cwd={cwd}
            filePath={fullFilePath}
            baseBranch={baseBranch}
            readOnly={true}
          />
        </div>
      )}
    </div>
  );
}
