import type { GitFileStatus } from "@shared/types";

type GitStatusBadgeProps = {
  status: GitFileStatus;
};

type StatusConfig = {
  color: string | null;
  label: string;
};

function getStatusConfig(status: GitFileStatus): StatusConfig {
  const { status: fileStatus, staged } = status;

  switch (fileStatus) {
    case "modified":
      return {
        color: staged ? "var(--git-modified-staged)" : "var(--git-modified)",
        label: staged ? "Modified (staged)" : "Modified",
      };
    case "added":
      return {
        color: "var(--git-added)",
        label: staged ? "Added (staged)" : "Added",
      };
    case "deleted":
      return {
        color: "var(--git-deleted)",
        label: staged ? "Deleted (staged)" : "Deleted",
      };
    case "renamed":
      return {
        color: "var(--git-renamed)",
        label: "Renamed",
      };
    case "copied":
      return {
        color: "var(--git-renamed)",
        label: "Copied",
      };
    case "untracked":
      return {
        color: "var(--git-untracked)",
        label: "Untracked",
      };
    default:
      return { color: null, label: "" };
  }
}

export function GitStatusBadge({ status }: GitStatusBadgeProps) {
  const config = getStatusConfig(status);

  if (!config.color) return null;

  return (
    <div
      className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
      style={{ backgroundColor: config.color }}
      title={config.label}
    />
  );
}
