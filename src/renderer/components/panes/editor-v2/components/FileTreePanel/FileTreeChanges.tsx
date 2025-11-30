/**
 * FileTreeChanges - Git changes view showing modified files.
 *
 * Displays changed files grouped by staging status:
 * - Staged Changes section
 * - Changes (unstaged) section
 *
 * Each file has inline action buttons for:
 * - Stage / Unstage
 * - Revert (discard changes)
 *
 * @example
 * ```tsx
 * <FileTreeChanges
 *   cwd="/project"
 *   selectedFile={selectedFile}
 *   onFileSelect={(file) => openFile(file)}
 * />
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Minus,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  FileText,
  AlertCircle,
} from "lucide-react";
import { useGitV2 } from "@/hooks/useGitV2";
import { useGitAvailable } from "@/hooks/useGitAvailable";
import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import type { FileNode } from "../../types";
import { cn } from "@/utils";
import { GitBadge, getStatusConfig } from "../shared";

// ============================================================================
// Types
// ============================================================================

export interface FileTreeChangesProps {
  /** Working directory */
  cwd: string;

  /** Currently selected file (null if none) */
  selectedFile: FileNode | null;

  /** Callback when a file is selected */
  onFileSelect: (file: FileNode) => void;
}

// ============================================================================
// Change Item Component
// ============================================================================

interface ChangeItemProps {
  /** File path (relative) */
  path: string;

  /** Working directory */
  cwd: string;

  /** Git status for this file */
  status: GitFileStatus;

  /** Whether this item is selected */
  isSelected: boolean;

  /** Whether file is staged */
  isStaged: boolean;

  /** Callback when file is clicked */
  onSelect: () => void;

  /** Callback to stage file */
  onStage: () => void;

  /** Callback to unstage file */
  onUnstage: () => void;

  /** Callback to revert file */
  onRevert: () => void;
}

function ChangeItem({
  path,
  status,
  isSelected,
  isStaged,
  onSelect,
  onStage,
  onUnstage,
  onRevert,
}: ChangeItemProps) {
  const fileName = path.split("/").pop() ?? path;

  // Get text color class from git status
  const statusConfig = getStatusConfig(status);
  const textColorClass = statusConfig?.textColorClass ?? "text-foreground";
  const iconColorClass = statusConfig?.textColorClass ?? "text-foreground";

  return (
    <li>
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] text-left transition cursor-pointer",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
          isSelected
            ? "bg-accent/20 hover:bg-accent/25"
            : "hover:bg-foreground/10",
        )}
        onClick={onSelect}
        data-testid={`change-item-${fileName}`}
        data-path={path}
      >
        {/* File icon - colored based on git status */}
        <FileText className={cn("flex-shrink-0", iconColorClass)} size={12} />

        {/* File name - colored based on git status */}
        <span
          className={cn("min-w-0 flex-1 truncate", textColorClass)}
          title={path}
        >
          {fileName}
        </span>

        {/* Git status badge */}
        <GitBadge status={status} />

        {/* Action buttons (visible on hover) */}
        <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {isStaged ? (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onUnstage();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onUnstage();
                }
              }}
              className="p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
              title="Unstage"
              data-testid="unstage-button"
            >
              <Minus size={12} />
            </div>
          ) : (
            <>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onStage();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onStage();
                  }
                }}
                className="p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
                title="Stage changes"
                data-testid="stage-button"
              >
                <Plus size={12} />
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onRevert();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onRevert();
                  }
                }}
                className="p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
                title="Discard changes"
                data-testid="revert-button"
              >
                <RotateCcw size={12} />
              </div>
            </>
          )}
        </div>
      </button>
    </li>
  );
}

// ============================================================================
// Section Component
// ============================================================================

interface SectionProps {
  /** Section title */
  title: string;

  /** Number of items in section */
  count: number;

  /** Whether section is expanded */
  isExpanded: boolean;

  /** Toggle expansion */
  onToggle: () => void;

  /** Children to render when expanded */
  children: React.ReactNode;
}

function Section({
  title,
  count,
  isExpanded,
  onToggle,
  children,
}: SectionProps) {
  return (
    <div data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <button
        type="button"
        className="flex items-center gap-1.5 w-full py-1 px-1.5 hover:bg-foreground/10 rounded-md text-[13px] font-medium text-foreground transition cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        onClick={onToggle}
        data-testid="section-toggle"
      >
        {isExpanded ? (
          <ChevronDown className="text-foreground" size={12} />
        ) : (
          <ChevronRight className="text-foreground" size={12} />
        )}
        <span>{title}</span>
        <span className="text-foreground/50 ml-1">({count})</span>
      </button>
      {isExpanded && <ul className="space-y-0.5 ml-2">{children}</ul>}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * Git changes view showing modified files grouped by staging status.
 */
export function FileTreeChanges({
  cwd,
  selectedFile,
  onFileSelect,
}: FileTreeChangesProps) {
  const { isAvailable: isGitAvailable, isLoading: isCheckingGit } =
    useGitAvailable();
  const git = useGitV2(cwd);

  // State
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotGitRepo, setIsNotGitRepo] = useState(false);

  // ---------------------------------------------------------------------------
  // Initial Load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      // Don't load if git is not available
      if (!isGitAvailable || isCheckingGit) {
        return;
      }

      setIsLoading(true);
      setIsNotGitRepo(false);
      try {
        const status = await git.getStatus();
        if (!cancelled) {
          if (status === null) {
            // null means not a git repository
            setIsNotGitRepo(true);
          } else {
            setGitStatus(status);
          }
        }
      } catch (error) {
        console.error("Failed to load git status:", error);
        if (!cancelled) {
          setIsNotGitRepo(true);
        }
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
  }, [git, isGitAvailable, isCheckingGit]);

  // ---------------------------------------------------------------------------
  // Git Status Subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const cleanup = git.onStatusChanged((event) => {
      setGitStatus(event.status);
    });

    return cleanup;
  }, [git]);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  /**
   * Group files by staging status.
   */
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

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSelect = useCallback(
    (path: string) => {
      const fullPath = cwd.endsWith("/") ? cwd + path : cwd + "/" + path;
      const name = path.split("/").pop() ?? path;
      onFileSelect({ path: fullPath, name, type: "file" });
    },
    [cwd, onFileSelect],
  );

  const handleStage = useCallback(
    async (path: string) => {
      try {
        await git.stage([path]);
      } catch (error) {
        console.error("Failed to stage file:", error);
      }
    },
    [git],
  );

  const handleUnstage = useCallback(
    async (path: string) => {
      try {
        await git.unstage([path]);
      } catch (error) {
        console.error("Failed to unstage file:", error);
      }
    },
    [git],
  );

  const handleRevert = useCallback(
    async (path: string) => {
      try {
        await git.revert([path]);
      } catch (error) {
        console.error("Failed to revert file:", error);
      }
    },
    [git],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Git not installed
  if (!isCheckingGit && !isGitAvailable) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2 px-4"
        data-testid="file-tree-changes-git-unavailable"
      >
        <AlertCircle className="w-8 h-8 text-muted-foreground/60" />
        <span className="text-center">Git is not installed</span>
        <span className="text-xs text-center text-muted-foreground/70">
          Install Git to track changes
        </span>
      </div>
    );
  }

  // Not a git repository
  if (isNotGitRepo) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2 px-4"
        data-testid="file-tree-changes-not-repo"
      >
        <AlertCircle className="w-8 h-8 text-muted-foreground/60" />
        <span className="text-center">Not a Git repository</span>
        <span className="text-xs text-center text-muted-foreground/70">
          Run &quot;git init&quot; to start tracking
        </span>
      </div>
    );
  }

  // Loading state
  if (isLoading || isCheckingGit) {
    return (
      <div
        className="flex items-center justify-center h-full text-muted-foreground text-sm"
        data-testid="file-tree-changes-loading"
      >
        Loading...
      </div>
    );
  }

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  if (!hasChanges) {
    return (
      <div
        className="flex items-center justify-center h-full text-muted-foreground text-sm"
        data-testid="file-tree-changes-empty"
      >
        No changes
      </div>
    );
  }

  // Get selected path relative to cwd for comparison
  const selectedRelativePath = selectedFile?.path
    ? selectedFile.path.startsWith(cwd)
      ? selectedFile.path.slice(cwd.length).replace(/^\//, "")
      : selectedFile.path
    : null;

  return (
    <nav
      className="overflow-auto h-full px-3 text-[13px] text-white/80"
      data-testid="file-tree-changes"
    >
      {/* Staged Changes Section */}
      {stagedFiles.length > 0 && (
        <Section
          title="Staged Changes"
          count={stagedFiles.length}
          isExpanded={stagedExpanded}
          onToggle={() => setStagedExpanded(!stagedExpanded)}
        >
          {stagedFiles.map(([path, status]) => (
            <ChangeItem
              key={path}
              path={path}
              cwd={cwd}
              status={status}
              isSelected={selectedRelativePath === path}
              isStaged={true}
              onSelect={() => handleSelect(path)}
              onStage={() => handleStage(path)}
              onUnstage={() => handleUnstage(path)}
              onRevert={() => handleRevert(path)}
            />
          ))}
        </Section>
      )}

      {/* Unstaged Changes Section */}
      {unstagedFiles.length > 0 && (
        <Section
          title="Changes"
          count={unstagedFiles.length}
          isExpanded={changesExpanded}
          onToggle={() => setChangesExpanded(!changesExpanded)}
        >
          {unstagedFiles.map(([path, status]) => (
            <ChangeItem
              key={path}
              path={path}
              cwd={cwd}
              status={status}
              isSelected={selectedRelativePath === path}
              isStaged={false}
              onSelect={() => handleSelect(path)}
              onStage={() => handleStage(path)}
              onUnstage={() => handleUnstage(path)}
              onRevert={() => handleRevert(path)}
            />
          ))}
        </Section>
      )}
    </nav>
  );
}
