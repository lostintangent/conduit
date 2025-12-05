/**
 * ChangesReviewPane - Multi-file changes review with inline diffs.
 *
 * Displays all changed files in a scrollable list, each with:
 * - Collapsible header showing file path and status
 * - Inline diff view when expanded
 * - Stage/unstage/revert actions
 *
 * Also includes:
 * - Expand/collapse all controls
 * - Commit UI at the bottom (message input + commit button)
 * - Real-time updates via git status subscription
 *
 * This is an alternative to the file tree + single file view,
 * useful for reviewing all changes before committing.
 *
 * @example
 * ```tsx
 * <ChangesReviewPane
 *   cwd="/project"
 *   baseBranch="main"
 * />
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  GitCommit,
  ChevronsUpDown,
  AlertCircle,
  X,
} from "lucide-react";
import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import { useGitV2 } from "@/hooks/useGitV2";
import { FileChangeDiff } from "./FileChangeDiff";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

export interface ChangesReviewPaneProps {
  /** Working directory */
  cwd: string;

  /** Git ref for original content comparison (default: 'HEAD') */
  baseBranch?: string;
}

// ============================================================================
// Section Header Component
// ============================================================================

interface SectionHeaderProps {
  /** Section title */
  title: string;

  /** Number of files in section */
  count: number;

  /** Whether section is expanded */
  isExpanded: boolean;

  /** Toggle section expansion */
  onToggle: () => void;
}

function SectionHeader({
  title,
  count,
  isExpanded,
  onToggle,
}: SectionHeaderProps) {
  return (
    <button
      className={cn(
        "flex items-center gap-2 w-full py-2 px-3",
        "bg-muted/50 hover:bg-muted/70 transition-colors",
        "text-sm font-medium text-left",
        "border-b border-border",
      )}
      onClick={onToggle}
      data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {isExpanded ? (
        <ChevronDown className="w-4 h-4" />
      ) : (
        <ChevronRight className="w-4 h-4" />
      )}
      <span>{title}</span>
      <span className="text-muted-foreground">({count})</span>
    </button>
  );
}

// ============================================================================
// Commit Form Component
// ============================================================================

interface CommitFormProps {
  /** Number of staged files */
  stagedCount: number;

  /** Callback to commit */
  onCommit: (message: string) => Promise<void>;

  /** Whether commit is in progress */
  isCommitting: boolean;
}

function CommitForm({ stagedCount, onCommit, isCommitting }: CommitFormProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim() || stagedCount === 0) return;

      await onCommit(message.trim());
      setMessage("");
    },
    [message, stagedCount, onCommit],
  );

  const canCommit =
    message.trim().length > 0 && stagedCount > 0 && !isCommitting;

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border p-3 bg-muted/30"
      data-testid="commit-form"
    >
      <div className="flex flex-col gap-2">
        {/* Commit message input */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message..."
          className={cn(
            "w-full px-3 py-2 text-sm rounded-md resize-none",
            "bg-background border border-input",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "placeholder:text-muted-foreground",
          )}
          rows={3}
          disabled={isCommitting}
          data-testid="commit-message-input"
        />

        {/* Commit button */}
        <Button
          type="submit"
          disabled={!canCommit}
          className="w-full"
          data-testid="commit-button"
        >
          <GitCommit className="w-4 h-4 mr-2" />
          {isCommitting
            ? "Committing..."
            : `Commit ${stagedCount} file${stagedCount !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </form>
  );
}

/**
 * Multi-file changes review pane with inline diffs and commit UI.
 */
export function ChangesReviewPane({ cwd, baseBranch }: ChangesReviewPaneProps) {
  const git = useGitV2(cwd);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Section expansion state
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);

  // Track which individual files are expanded
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Initial Load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setIsLoading(true);
      try {
        // Wait for git API to be ready before querying
        await git.whenReady();

        if (cancelled) return;

        const status = await git.getStatus();
        if (!cancelled) {
          setGitStatus(status);
        }
      } catch (error) {
        console.error("Failed to load git status:", error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [git]);

  // ---------------------------------------------------------------------------
  // Git Status Subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const cleanup = git.onStatusChanged((event) => {
      setGitStatus(event.status);
    });

    return cleanup;
  }, [git]);

  const { stagedFiles, unstagedFiles } = useMemo(() => {
    const staged: Array<[string, GitFileStatus]> = [];
    const unstaged: Array<[string, GitFileStatus]> = [];

    if (gitStatus?.files) {
      for (const [path, status] of gitStatus.files) {
        if (status.staged) {
          staged.push([path, status]);
        } else {
          unstaged.push([path, status]);
        }
      }
    }

    // Sort alphabetically by path
    staged.sort((a, b) => a[0].localeCompare(b[0]));
    unstaged.sort((a, b) => a[0].localeCompare(b[0]));

    return { stagedFiles: staged, unstagedFiles: unstaged };
  }, [gitStatus]);

  const allFiles = useMemo(() => {
    return [...stagedFiles, ...unstagedFiles].map(([path]) => path);
  }, [stagedFiles, unstagedFiles]);

  const allExpanded =
    allFiles.length > 0 && allFiles.every((f) => expandedFiles.has(f));
  const noneExpanded = expandedFiles.size === 0;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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

  const expandAll = useCallback(() => {
    setExpandedFiles(new Set(allFiles));
  }, [allFiles]);

  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  const handleCommit = useCallback(
    async (message: string) => {
      setIsCommitting(true);
      setCommitError(null);
      try {
        await git.commit(message);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        setCommitError(`Failed to commit: ${errorMessage}`);
        console.error("Failed to commit:", error);
      } finally {
        setIsCommitting(false);
      }
    },
    [git],
  );

  const handleDismissError = useCallback(() => {
    setCommitError(null);
  }, []);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full text-muted-foreground text-sm"
        data-testid="changes-review-pane-loading"
      >
        Loading changes...
      </div>
    );
  }

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  if (!hasChanges) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2"
        data-testid="changes-review-pane-empty"
      >
        <GitCommit className="w-8 h-8 opacity-50" />
        <span>No changes to review</span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="changes-review-pane"
    >
      {/* Error Banner */}
      {commitError && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2",
            "bg-destructive/10 text-destructive text-sm",
            "border-b border-destructive/20",
          )}
          data-testid="commit-error-banner"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{commitError}</span>
          <button
            className="p-1 hover:bg-destructive/20 rounded transition-colors"
            onClick={handleDismissError}
            title="Dismiss"
            data-testid="dismiss-error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-sm font-medium">Changes Review</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={allExpanded ? collapseAll : expandAll}
          title={allExpanded ? "Collapse All" : "Expand All"}
          data-testid="toggle-all-button"
        >
          <ChevronsUpDown className="w-4 h-4 mr-1" />
          {allExpanded ? "Collapse All" : "Expand All"}
        </Button>
      </div>

      {/* Scrollable File List */}
      <div className="flex-1 overflow-auto" data-testid="changes-list">
        {/* Staged Changes Section */}
        {stagedFiles.length > 0 && (
          <div data-testid="staged-section">
            <SectionHeader
              title="Staged Changes"
              count={stagedFiles.length}
              isExpanded={stagedExpanded}
              onToggle={() => setStagedExpanded(!stagedExpanded)}
            />
            {stagedExpanded && (
              <div>
                {stagedFiles.map(([path, status]) => (
                  <FileChangeDiff
                    key={path}
                    filePath={path}
                    cwd={cwd}
                    status={status}
                    baseBranch={baseBranch}
                    isExpanded={expandedFiles.has(path)}
                    onToggle={() => toggleFile(path)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unstaged Changes Section */}
        {unstagedFiles.length > 0 && (
          <div data-testid="unstaged-section">
            <SectionHeader
              title="Changes"
              count={unstagedFiles.length}
              isExpanded={changesExpanded}
              onToggle={() => setChangesExpanded(!changesExpanded)}
            />
            {changesExpanded && (
              <div>
                {unstagedFiles.map(([path, status]) => (
                  <FileChangeDiff
                    key={path}
                    filePath={path}
                    cwd={cwd}
                    status={status}
                    baseBranch={baseBranch}
                    isExpanded={expandedFiles.has(path)}
                    onToggle={() => toggleFile(path)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Commit Form */}
      <CommitForm
        stagedCount={stagedFiles.length}
        onCommit={handleCommit}
        isCommitting={isCommitting}
      />
    </div>
  );
}
