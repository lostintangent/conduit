import type { GitFileStatus } from "@shared/types";

type GitStatusBadgeProps = {
  status: GitFileStatus;
  isFolder?: boolean;
};

type StatusConfig = {
  letter: string;
  colorClass: string;
  label: string;
  weight: number;
};

/**
 * Get status configuration following VS Code's exact mapping
 * Reference: VSCODE_GIT_STATUS_MAPPING.md
 */
function getStatusConfig(status: GitFileStatus): StatusConfig | null {
  const { status: fileStatus, staged } = status;

  switch (fileStatus) {
    case "modified":
      return {
        letter: "M",
        colorClass: "bg-git-modified",
        label: staged ? "Modified (staged)" : "Modified",
        weight: 2, // VS Code weight for modified files
      };
    case "added":
      return {
        letter: "A",
        colorClass: "bg-git-added",
        label: staged ? "Added (staged)" : "Added",
        weight: 3, // VS Code weight for added files
      };
    case "deleted":
      return {
        letter: "D",
        colorClass: staged ? "bg-git-deleted-staged" : "bg-git-deleted",
        label: staged ? "Deleted (staged)" : "Deleted",
        weight: 3, // VS Code weight for deleted files
      };
    case "renamed":
      return {
        letter: "R",
        colorClass: "bg-git-renamed",
        label: "Renamed",
        weight: 2, // VS Code weight for renamed files
      };
    case "copied":
      return {
        letter: "C",
        colorClass: "bg-git-copied",
        label: "Copied",
        weight: 2, // VS Code weight for copied files
      };
    case "untracked":
      return {
        letter: "U",
        colorClass: "bg-git-untracked",
        label: "Untracked",
        weight: 1, // VS Code weight for untracked files
      };
    case "conflict":
      return {
        letter: "!",
        colorClass: "bg-git-conflict",
        label: "Conflict",
        weight: 4, // VS Code weight for conflicts (highest priority)
      };
    case "type-changed":
      return {
        letter: "T",
        colorClass: "bg-git-type-changed",
        label: "Type Changed",
        weight: 2, // VS Code weight for type changed files
      };
    case "ignored":
      return {
        letter: "I",
        colorClass: "bg-git-ignored",
        label: "Ignored",
        weight: 0, // VS Code weight for ignored files
      };
    case "unmodified":
      return null;
    default:
      return null;
  }
}

/**
 * Git status badge for files - shows letter (M, A, D, R, C, U, T, I, !)
 * For folders, use GitFolderIndicator instead
 */
export function GitStatusBadge({
  status,
  isFolder = false,
}: GitStatusBadgeProps) {
  const config = getStatusConfig(status);

  if (!config) return null;

  // Folders should only show a dot, not a letter
  if (isFolder) {
    return (
      <div
        className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${config.colorClass}`}
        title={config.label}
      />
    );
  }

  // Files show a letter badge
  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center text-[10px] font-semibold leading-none w-[14px] h-[14px] rounded-sm text-background ${config.colorClass}`}
      title={config.label}
    >
      {config.letter}
    </div>
  );
}

// Export the config getter for use in folder aggregation logic
export { getStatusConfig };
