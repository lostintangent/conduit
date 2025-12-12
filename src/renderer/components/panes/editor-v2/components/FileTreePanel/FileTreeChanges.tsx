/**
 * FileTreeChanges - Git changes view showing modified files.
 *
 * Displays changed files grouped by staging status:
 * - Staged Changes section
 * - Changes (unstaged) section
 *
 * Supports two view modes:
 * - Flat: Shows files in a flat list with folder path as subtext
 * - Nested: Shows files nested within their folder hierarchy
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

import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import { useGitAvailable } from "@/hooks/useGitAvailable";
import { useGitV2 } from "@/hooks/useGitV2";
import { cn } from "@/utils";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScrollPersistence } from "../../hooks/useScrollPersistence";
import type { FileNode } from "../../types";
import { getParentPaths, pathsEqual } from "../../utils";
import { GitBadge, getStatusConfig } from "../shared";

export interface FileTreeChangesProps {
  /** Editor pane ID (for scroll persistence) */
  paneId: string;

  /** Working directory */
  cwd: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** Currently selected file (null if none) */
  selectedFile: FileNode | null;

  /** Callback when a file is selected */
  onFileSelect: (file: FileNode) => void;

  /** View mode for changes list (flat or nested) - controlled by parent */
  viewMode?: "flat" | "nested";

  /**
   * Git status from parent (source of truth).
   * When provided, component uses this instead of fetching its own.
   */
  gitStatus?: Map<string, GitFileStatus> | null;

  /**
   * Whether we're comparing to a branch (not HEAD).
   * When true: hides action buttons, combines staged/unstaged sections.
   */
  isComparingToBranch?: boolean;

  /** Base branch name for display (e.g., "main") */
  baseBranchName?: string | null;
}

/** A file entry with its status */
interface FileEntry {
  path: string;
  name: string;
  status: GitFileStatus;
}

/** A folder node in the nested tree */
interface FolderNode {
  name: string;
  path: string;
  files: FileEntry[];
  folders: Map<string, FolderNode>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the directory path from a file path.
 * Returns empty string for root-level files.
 */
function getDirectoryPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : filePath.slice(0, lastSlash);
}

/**
 * Build a nested tree structure from a flat list of file paths.
 * Groups files by their directory hierarchy.
 */
function buildFolderTree(
  files: Array<[string, GitFileStatus]>,
): Map<string, FolderNode> {
  const rootFolders = new Map<string, FolderNode>();

  for (const [rawPath, status] of files) {
    // Skip paths that are directories (end with trailing slash) - git status
    // can return these for untracked directories, but they shouldn't be treated as files
    if (rawPath.endsWith("/")) {
      continue;
    }

    const path = rawPath;
    const parts = path.split("/");
    const fileName = parts.pop()!;

    // Skip empty filenames (shouldn't happen after filtering trailing slashes, but defensive)
    if (!fileName) {
      continue;
    }

    // Navigate/create folder structure
    let currentLevel = rootFolders;
    let currentPath = "";

    for (const folderName of parts) {
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

      if (!currentLevel.has(folderName)) {
        currentLevel.set(folderName, {
          name: folderName,
          path: currentPath,
          files: [],
          folders: new Map(),
        });
      }

      const folder = currentLevel.get(folderName)!;
      currentLevel = folder.folders;
    }

    // Add file to appropriate location
    if (parts.length === 0) {
      // Root level file - create a virtual "root" folder
      if (!rootFolders.has("")) {
        rootFolders.set("", {
          name: "",
          path: "",
          files: [],
          folders: new Map(),
        });
      }
      rootFolders.get("")!.files.push({ path, name: fileName, status });
    } else {
      // Navigate back to the correct folder and add file
      let targetLevel = rootFolders;
      for (const folderName of parts) {
        targetLevel = targetLevel.get(folderName)!.folders;
      }
      // Go up one level to get the parent folder
      let parentLevel = rootFolders;
      for (let i = 0; i < parts.length - 1; i++) {
        parentLevel = parentLevel.get(parts[i])!.folders;
      }
      const parentFolder = parentLevel.get(parts[parts.length - 1])!;
      parentFolder.files.push({ path, name: fileName, status });
    }
  }

  return rootFolders;
}

// ============================================================================
// Action Buttons Component
// ============================================================================

interface ActionButtonsProps {
  /** Whether file is staged */
  isStaged: boolean;
  /** Whether file can be reverted (false for untracked files) */
  canRevert: boolean;
  /** Callback to stage file */
  onStage: () => void;
  /** Callback to unstage file */
  onUnstage: () => void;
  /** Callback to revert file */
  onRevert: () => void;
}

/**
 * Inline action buttons for stage/unstage/revert operations.
 * Visible on hover.
 */
function ActionButtons({
  isStaged,
  canRevert,
  onStage,
  onUnstage,
  onRevert,
}: ActionButtonsProps) {
  return (
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
          {canRevert && (
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
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Flat View Change Item Component
// ============================================================================

interface FlatChangeItemProps {
  /** File path (relative) */
  path: string;
  /** Git status for this file */
  status: GitFileStatus;
  /** Whether this item is selected */
  isSelected: boolean;
  /** Whether file is staged */
  isStaged: boolean;
  /** Whether file can be reverted (false for untracked files) */
  canRevert: boolean;
  /** Callback when file is clicked */
  onSelect: () => void;
  /** Callback to stage file (optional - if undefined, no action buttons shown) */
  onStage?: () => void;
  /** Callback to unstage file (optional) */
  onUnstage?: () => void;
  /** Callback to revert file (optional) */
  onRevert?: () => void;
}

/**
 * Change item for flat view mode.
 * Shows file name with folder path as subtext.
 */
function FlatChangeItem({
  path,
  status,
  isSelected,
  isStaged,
  canRevert,
  onSelect,
  onStage,
  onUnstage,
  onRevert,
}: FlatChangeItemProps) {
  const fileName = path.split("/").pop() ?? path;
  const folderPath = getDirectoryPath(path);

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

        {/* File name and folder path */}
        <div className="min-w-0 flex-1 flex items-baseline gap-1.5 truncate">
          <span className={cn("truncate", textColorClass)} title={path}>
            {fileName}
          </span>
          {folderPath && (
            <span
              className="text-[11px] text-foreground/40 truncate"
              title={folderPath}
            >
              {folderPath}
            </span>
          )}
        </div>

        {/* Action buttons (visible on hover) - only shown when handlers provided */}
        {onStage && onUnstage && onRevert && (
          <ActionButtons
            isStaged={isStaged}
            canRevert={canRevert}
            onStage={onStage}
            onUnstage={onUnstage}
            onRevert={onRevert}
          />
        )}

        {/* Git status badge - always rightmost */}
        <GitBadge status={status} />
      </button>
    </li>
  );
}

// ============================================================================
// Nested View Components
// ============================================================================

interface NestedFileItemProps {
  /** File entry */
  file: FileEntry;
  /** Whether this item is selected */
  isSelected: boolean;
  /** Whether file is staged */
  isStaged: boolean;
  /** Whether file can be reverted (false for untracked files) */
  canRevert: boolean;
  /** Callback when file is clicked */
  onSelect: () => void;
  /** Callback to stage file (optional - if undefined, no action buttons shown) */
  onStage?: () => void;
  /** Callback to unstage file (optional) */
  onUnstage?: () => void;
  /** Callback to revert file (optional) */
  onRevert?: () => void;
}

/**
 * File item for nested view mode.
 * Shows just the file name (folder context provided by parent).
 */
function NestedFileItem({
  file,
  isSelected,
  isStaged,
  canRevert,
  onSelect,
  onStage,
  onUnstage,
  onRevert,
}: NestedFileItemProps) {
  // Get text color class from git status
  const statusConfig = getStatusConfig(file.status);
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
        data-testid={`nested-file-${file.name}`}
        data-path={file.path}
      >
        {/* Spacer to align with folder chevrons */}
        <div style={{ width: 12 }} />

        {/* File icon - colored based on git status */}
        <FileText className={cn("flex-shrink-0", iconColorClass)} size={12} />

        {/* File name - colored based on git status */}
        <span
          className={cn("min-w-0 flex-1 truncate", textColorClass)}
          title={file.path}
        >
          {file.name}
        </span>

        {/* Action buttons (visible on hover) - only shown when handlers provided */}
        {onStage && onUnstage && onRevert && (
          <ActionButtons
            isStaged={isStaged}
            canRevert={canRevert}
            onStage={onStage}
            onUnstage={onUnstage}
            onRevert={onRevert}
          />
        )}

        {/* Git status badge - always rightmost */}
        <GitBadge status={file.status} />
      </button>
    </li>
  );
}

interface NestedFolderItemProps {
  /** Folder node */
  folder: FolderNode;
  /** Set of expanded folder paths */
  expandedFolders: Set<string>;
  /** Toggle folder expansion */
  onToggleFolder: (path: string) => void;
  /** Selected file path (relative) */
  selectedPath: string | null;
  /** Whether files in this folder are staged */
  isStaged: boolean;
  /** Callback when file is clicked */
  onFileSelect: (path: string) => void;
  /** Callback to stage file (optional - if undefined, no action buttons shown) */
  onStage?: (path: string) => void;
  /** Callback to unstage file (optional) */
  onUnstage?: (path: string) => void;
  /** Callback to revert file (optional) */
  onRevert?: (path: string) => void;
}

/**
 * Folder item for nested view mode.
 * Shows folder with expandable children.
 */
function NestedFolderItem({
  folder,
  expandedFolders,
  onToggleFolder,
  selectedPath,
  isStaged,
  onFileSelect,
  onStage,
  onUnstage,
  onRevert,
}: NestedFolderItemProps) {
  const isExpanded = expandedFolders.has(folder.path);
  const FolderIcon = isExpanded ? FolderOpen : Folder;

  // Sort files and subfolders
  const sortedFiles = [...folder.files].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedFolders = [...folder.folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <li data-testid={`nested-folder-${folder.name}`}>
      {/* Folder row */}
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] text-left transition cursor-pointer",
          "hover:bg-foreground/10",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
        )}
        onClick={() => onToggleFolder(folder.path)}
        data-testid={`folder-toggle-${folder.name}`}
      >
        {/* Expand/collapse chevron */}
        <span className="flex-shrink-0 flex items-center justify-center">
          {isExpanded ? (
            <ChevronDown className="text-foreground" size={12} />
          ) : (
            <ChevronRight className="text-foreground" size={12} />
          )}
        </span>

        {/* Folder icon */}
        <FolderIcon className="flex-shrink-0 text-foreground" size={12} />

        {/* Folder name */}
        <span className="min-w-0 flex-1 truncate text-foreground">
          {folder.name}
        </span>
      </button>

      {/* Children (when expanded) */}
      {isExpanded && (
        <ul className="mt-0.5 border-l border-border pl-2 space-y-0.5">
          {/* Subfolders first */}
          {sortedFolders.map((subfolder) => (
            <NestedFolderItem
              key={subfolder.path}
              folder={subfolder}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              selectedPath={selectedPath}
              isStaged={isStaged}
              onFileSelect={onFileSelect}
              onStage={onStage}
              onUnstage={onUnstage}
              onRevert={onRevert}
            />
          ))}

          {/* Then files */}
          {sortedFiles.map((file) => (
            <NestedFileItem
              key={file.path}
              file={file}
              isSelected={pathsEqual(selectedPath, file.path)}
              isStaged={isStaged}
              canRevert={file.status.status !== "untracked"}
              onSelect={() => onFileSelect(file.path)}
              onStage={onStage ? () => onStage(file.path) : undefined}
              onUnstage={onUnstage ? () => onUnstage(file.path) : undefined}
              onRevert={onRevert ? () => onRevert(file.path) : undefined}
            />
          ))}
        </ul>
      )}
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

/**
 * Collapsible section for grouping changes.
 */
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
// Custom Hook: useChangesViewState
// ============================================================================

/**
 * Hook to manage changes view state including section expansion
 * and folder expansion for nested view.
 */
function useChangesViewState() {
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  /**
   * Toggle a folder's expansion state.
   */
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  /**
   * Expand folders containing the given file paths.
   *
   * @param filePaths - File paths whose parent folders should be expanded
   * @param replace - If true, replaces all expanded folders. If false, adds to existing (default: false)
   */
  const expandFoldersForFiles = useCallback(
    (filePaths: string[], replace = false) => {
      if (filePaths.length === 0 && !replace) return;

      setExpandedFolders((prev) => {
        const next = replace ? new Set<string>() : new Set(prev);
        for (const filePath of filePaths) {
          for (const folder of getParentPaths(filePath)) {
            next.add(folder);
          }
        }
        return next;
      });
    },
    [],
  );

  return {
    stagedExpanded,
    setStagedExpanded,
    changesExpanded,
    setChangesExpanded,
    expandedFolders,
    toggleFolder,
    expandFoldersForFiles,
  };
}

/**
 * Optimistic update types for immediate UI feedback.
 */
interface OptimisticUpdate {
  path: string;
  action: "stage" | "unstage";
  timestamp: number;
}

/**
 * Hook to manage git status loading, subscriptions, and optimistic updates.
 * Optimistic updates provide immediate UI feedback while git operations complete.
 *
 * @param cwd - Working directory
 * @param sandboxId - Optional sandbox ID for cloud VM operations
 * @param skip - If true, skip all fetching and subscriptions (for when parent provides status)
 */
function useGitStatus(cwd: string, sandboxId?: string, skip = false) {
  const { isAvailable: isGitAvailable, isLoading: isCheckingGit } =
    useGitAvailable();
  const git = useGitV2(cwd, sandboxId);

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [isNotGitRepo, setIsNotGitRepo] = useState(false);

  // Optimistic updates for immediate UI feedback
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    OptimisticUpdate[]
  >([]);

  // Initial load (skip when parent provides status)
  useEffect(() => {
    // Skip fetching when parent provides status
    if (skip) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadStatus() {
      if (!isGitAvailable || isCheckingGit) {
        return;
      }

      setIsLoading(true);
      setIsNotGitRepo(false);
      try {
        // Wait for git API to be ready before querying
        // This is important for the global container pattern where the component
        // might mount before the git API has received its initial data from IPC
        await git.whenReady();

        if (cancelled) return;

        const status = await git.getStatus();
        if (!cancelled) {
          if (status === null) {
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
  }, [git, isGitAvailable, isCheckingGit, skip]);

  // Subscribe to status changes and clear optimistic updates (skip when parent provides status)
  useEffect(() => {
    // Skip subscription when parent provides status
    if (skip) {
      return;
    }

    const cleanup = git.onStatusChanged((event) => {
      setGitStatus(event.status);
      // Clear all optimistic updates when real status arrives
      setOptimisticUpdates([]);
    });

    return cleanup;
  }, [git, skip]);

  /**
   * Apply an optimistic update for immediate UI feedback.
   */
  const applyOptimisticUpdate = useCallback(
    (path: string, action: "stage" | "unstage") => {
      setOptimisticUpdates((prev) => [
        ...prev.filter((u) => u.path !== path), // Remove any existing update for this path
        { path, action, timestamp: Date.now() },
      ]);
    },
    [],
  );

  /**
   * Revert an optimistic update (on failure).
   */
  const revertOptimisticUpdate = useCallback((path: string) => {
    setOptimisticUpdates((prev) => prev.filter((u) => u.path !== path));
  }, []);

  /**
   * Get the effective git status with optimistic updates applied.
   * This merges the real git status with any pending optimistic updates.
   */
  const effectiveGitStatus = useMemo((): GitStatus | null => {
    if (!gitStatus || optimisticUpdates.length === 0) {
      return gitStatus;
    }

    // Clone the files map with optimistic updates applied
    const newFiles = new Map(gitStatus.files);

    for (const update of optimisticUpdates) {
      const currentStatus = newFiles.get(update.path);
      if (currentStatus) {
        // Create a new status with the staged flag flipped
        newFiles.set(update.path, {
          ...currentStatus,
          staged: update.action === "stage",
        });
      }
    }

    return {
      ...gitStatus,
      files: newFiles,
    };
  }, [gitStatus, optimisticUpdates]);

  return {
    git,
    gitStatus: effectiveGitStatus,
    isLoading,
    isNotGitRepo,
    isGitAvailable,
    isCheckingGit,
    applyOptimisticUpdate,
    revertOptimisticUpdate,
  };
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Git changes view showing modified files grouped by staging status.
 *
 * Supports two view modes:
 * - Flat: Files listed with folder path as subtext
 * - Nested: Files organized in expandable folder hierarchy
 */
export function FileTreeChanges({
  paneId,
  cwd,
  sandboxId,
  selectedFile,
  onFileSelect,
  viewMode = "flat",
  gitStatus: gitStatusFromParent,
  isComparingToBranch = false,
  baseBranchName,
}: FileTreeChangesProps) {
  // Whether parent is providing git status (we skip internal fetching)
  const hasParentStatus = gitStatusFromParent !== undefined;

  // Show action buttons only when NOT comparing to a branch
  const showActionButtons = !isComparingToBranch;
  // ---------------------------------------------------------------------------
  // Scroll Persistence
  // ---------------------------------------------------------------------------

  // Callback ref for scroll persistence across DOM moves
  const scrollContainerRef = useScrollPersistence(paneId, "changesTree");

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  // Internal git status hook - only used when parent doesn't provide status
  // Note: Hook always runs (React rules), but we ignore results when parent provides status
  const {
    git,
    gitStatus: gitStatusFromHook,
    isLoading: isLoadingInternal,
    isNotGitRepo,
    isGitAvailable,
    isCheckingGit,
    applyOptimisticUpdate,
    revertOptimisticUpdate,
  } = useGitStatus(cwd, sandboxId, hasParentStatus);

  // Use parent's status when provided, otherwise use internal hook
  const gitStatus = hasParentStatus
    ? { files: gitStatusFromParent }
    : gitStatusFromHook;

  // Only show loading state when using internal hook
  const isLoading = hasParentStatus ? false : isLoadingInternal;

  const {
    stagedExpanded,
    setStagedExpanded,
    changesExpanded,
    setChangesExpanded,
    expandedFolders,
    toggleFolder,
    expandFoldersForFiles,
  } = useChangesViewState();

  /**
   * Group files by staging status.
   * When comparing to a branch, all files go into unstagedFiles since
   * staged/unstaged distinction doesn't apply to branch comparisons.
   */
  const { stagedFiles, unstagedFiles } = useMemo(() => {
    const staged: Array<[string, GitFileStatus]> = [];
    const unstaged: Array<[string, GitFileStatus]> = [];

    if (gitStatus?.files) {
      for (const [path, status] of gitStatus.files) {
        // Skip paths that end with "/" - these are directories from git status
        // that shouldn't be rendered as individual file entries
        if (path.endsWith("/")) {
          continue;
        }
        // In branch comparison mode, treat all files as unstaged (no staging separation)
        if (isComparingToBranch) {
          unstaged.push([path, status]);
        } else if (status.staged) {
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
  }, [gitStatus, isComparingToBranch]);

  /**
   * Build folder trees for nested view.
   */
  const { stagedTree, unstagedTree } = useMemo(() => {
    return {
      stagedTree: buildFolderTree(stagedFiles),
      unstagedTree: buildFolderTree(unstagedFiles),
    };
  }, [stagedFiles, unstagedFiles]);

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
    (path: string) => {
      // Apply optimistic update immediately for instant UI feedback
      applyOptimisticUpdate(path, "stage");
      // Fire and forget - don't await, let the status subscription handle confirmation
      git.stage([path]).catch((error) => {
        console.error("Failed to stage file:", error);
        // Revert optimistic update on failure
        revertOptimisticUpdate(path);
      });
    },
    [git, applyOptimisticUpdate, revertOptimisticUpdate],
  );

  const handleUnstage = useCallback(
    (path: string) => {
      // Apply optimistic update immediately for instant UI feedback
      applyOptimisticUpdate(path, "unstage");
      // Fire and forget - don't await, let the status subscription handle confirmation
      git.unstage([path]).catch((error) => {
        console.error("Failed to unstage file:", error);
        // Revert optimistic update on failure
        revertOptimisticUpdate(path);
      });
    },
    [git, applyOptimisticUpdate, revertOptimisticUpdate],
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

  /**
   * Auto-expand folders in nested view mode.
   *
   * Handles two scenarios:
   * 1. Switching TO nested view: expand all folders (replace mode)
   * 2. New files appearing while in nested view: expand their folders (additive mode)
   *
   * This ensures deeply nested new dirty files are always visible without
   * collapsing folders the user manually collapsed.
   */
  const prevStateRef = useRef<{ viewMode: string; filePaths: Set<string> }>({
    viewMode,
    filePaths: new Set(),
  });

  useEffect(() => {
    const allFilePaths = [
      ...stagedFiles.map(([p]) => p),
      ...unstagedFiles.map(([p]) => p),
    ];
    const currentPaths = new Set(allFilePaths);
    const wasNestedView = prevStateRef.current.viewMode === "nested";
    const isNestedView = viewMode === "nested";

    if (isNestedView) {
      if (!wasNestedView) {
        // Switching TO nested view: expand all folders (replace mode)
        expandFoldersForFiles(allFilePaths, true);
      } else {
        // Already in nested view: expand only new files' folders (additive)
        const newPaths = allFilePaths.filter(
          (p) => !prevStateRef.current.filePaths.has(p),
        );
        if (newPaths.length > 0) {
          expandFoldersForFiles(newPaths, false);
        }
      }
    }

    // Update tracking for next render
    prevStateRef.current = { viewMode, filePaths: currentPaths };
  }, [viewMode, stagedFiles, unstagedFiles, expandFoldersForFiles]);

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  /**
   * Render files in flat view mode.
   * In branch comparison mode, action buttons are hidden.
   */
  const renderFlatFiles = (
    files: Array<[string, GitFileStatus]>,
    isStaged: boolean,
  ) => {
    return files.map(([path, status]) => (
      <FlatChangeItem
        key={path}
        path={path}
        status={status}
        isSelected={pathsEqual(selectedRelativePath, path)}
        isStaged={isStaged}
        canRevert={showActionButtons && status.status !== "untracked"}
        onSelect={() => handleSelect(path)}
        onStage={showActionButtons ? () => handleStage(path) : undefined}
        onUnstage={showActionButtons ? () => handleUnstage(path) : undefined}
        onRevert={showActionButtons ? () => handleRevert(path) : undefined}
      />
    ));
  };

  /**
   * Render files in nested view mode.
   * In branch comparison mode, action buttons are hidden.
   */
  const renderNestedFiles = (
    tree: Map<string, FolderNode>,
    isStaged: boolean,
  ) => {
    // Get root-level files (if any)
    const rootFolder = tree.get("");
    const rootFiles = rootFolder?.files ?? [];

    // Get top-level folders (excluding the virtual root)
    const folders = [...tree.values()]
      .filter((f) => f.name !== "")
      .sort((a, b) => a.name.localeCompare(b.name));

    return (
      <>
        {/* Folders first */}
        {folders.map((folder) => (
          <NestedFolderItem
            key={folder.path}
            folder={folder}
            expandedFolders={expandedFolders}
            onToggleFolder={toggleFolder}
            selectedPath={selectedRelativePath}
            isStaged={isStaged}
            onFileSelect={handleSelect}
            onStage={showActionButtons ? handleStage : undefined}
            onUnstage={showActionButtons ? handleUnstage : undefined}
            onRevert={showActionButtons ? handleRevert : undefined}
          />
        ))}

        {/* Root-level files */}
        {rootFiles
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((file) => (
            <NestedFileItem
              key={file.path}
              file={file}
              isSelected={pathsEqual(selectedRelativePath, file.path)}
              isStaged={isStaged}
              canRevert={
                showActionButtons && file.status.status !== "untracked"
              }
              onSelect={() => handleSelect(file.path)}
              onStage={
                showActionButtons ? () => handleStage(file.path) : undefined
              }
              onUnstage={
                showActionButtons ? () => handleUnstage(file.path) : undefined
              }
              onRevert={
                showActionButtons ? () => handleRevert(file.path) : undefined
              }
            />
          ))}
      </>
    );
  };

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
    <div className="flex flex-col h-full" data-testid="file-tree-changes">
      {/* Changes content */}
      <nav
        ref={scrollContainerRef}
        className="overflow-auto flex-1 h-full px-3 text-[13px] text-white/80"
      >
        {/* Staged Changes Section */}
        {stagedFiles.length > 0 && (
          <Section
            title="Staged Changes"
            count={stagedFiles.length}
            isExpanded={stagedExpanded}
            onToggle={() => setStagedExpanded(!stagedExpanded)}
          >
            {viewMode === "flat"
              ? renderFlatFiles(stagedFiles, true)
              : renderNestedFiles(stagedTree, true)}
          </Section>
        )}

        {/* Unstaged Changes Section (or all changes in branch comparison mode) */}
        {unstagedFiles.length > 0 && (
          <Section
            title={
              isComparingToBranch ? `Changes from ${baseBranchName}` : "Changes"
            }
            count={unstagedFiles.length}
            isExpanded={changesExpanded}
            onToggle={() => setChangesExpanded(!changesExpanded)}
          >
            {viewMode === "flat"
              ? renderFlatFiles(unstagedFiles, false)
              : renderNestedFiles(unstagedTree, false)}
          </Section>
        )}
      </nav>
    </div>
  );
}
