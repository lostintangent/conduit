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
 *   git={git}
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
import type { GitV2API } from "@/api/GitV2API";
import {
  DiffEditorWrapper,
  RegularEditorWrapper,
  DEFAULT_AUTO_SIZE_CONFIG,
} from "../EditorViewPanel";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { GitBadge } from "../shared";

export interface FileChangeDiffProps {
  /** Relative file path from git root */
  filePath: string;

  /** Working directory */
  cwd: string;

  /** Git API instance (shared from parent) */
  git: GitV2API;

  /** Git status for this file */
  status: GitFileStatus;

  /** Git ref for original content (default: 'HEAD') */
  baseBranch?: string;

  /** Whether the diff is expanded */
  isExpanded: boolean;

  /** Toggle expansion callback */
  onToggle: () => void;
}

/**
 * Individual file diff with collapsible header and action buttons.
 */
export function FileChangeDiff({
  filePath,
  cwd,
  git,
  status,
  baseBranch,
  isExpanded,
  onToggle,
}: FileChangeDiffProps) {
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

  /**
   * Handle revert with confirmation dialog.
   * Only reverts if user confirms the action.
   */
  const handleRevert = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      // Show confirmation dialog before reverting
      const confirmed = window.confirm(
        `Discard changes to "${filePath}"?\n\nThis action cannot be undone.`,
      );

      if (!confirmed) {
        return;
      }

      try {
        await git.revert([filePath]);
      } catch (error) {
        console.error("Failed to revert file:", error);
      }
    },
    [git, filePath],
  );

  // Determine if revert button should be shown
  // Don't show revert for untracked files (they have nothing to revert to)
  const canRevert = status.status !== "untracked";

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
              {canRevert && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:text-destructive"
                  onClick={handleRevert}
                  title="Discard Changes"
                  data-testid="revert-button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* Git Status Badge */}
        <GitBadge status={status} />
      </div>

      {/* Editor (expanded only) - height is auto-sized */}
      {/* Use regular editor for new files (untracked/added), diff editor for modified files */}
      {isExpanded && (
        <div className="bg-background" data-testid="file-change-diff-content">
          <EditorErrorBoundary filePath={filePath}>
            {status.status === "untracked" || status.status === "added" ? (
              <RegularEditorWrapper
                editorId={editorId}
                cwd={cwd}
                filePath={fullFilePath}
                autoSize={DEFAULT_AUTO_SIZE_CONFIG}
              />
            ) : (
              <DiffEditorWrapper
                editorId={editorId}
                cwd={cwd}
                filePath={fullFilePath}
                baseBranch={baseBranch}
                autoSize={DEFAULT_AUTO_SIZE_CONFIG}
              />
            )}
          </EditorErrorBoundary>
        </div>
      )}
    </div>
  );
}
