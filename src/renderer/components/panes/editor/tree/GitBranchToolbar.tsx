import { ArrowRight, Filter, GitBranch } from "lucide-react";

type GitBranchToolbarProps = {
  currentBranch: string | null;
  baseBranch: string | null;
  onClick?: () => void;
  showOnlyChangedFiles?: boolean;
  onFilterToggle?: () => void;
};

export function GitBranchToolbar({
  currentBranch,
  baseBranch,
  onClick,
  showOnlyChangedFiles,
  onFilterToggle,
}: GitBranchToolbarProps) {
  if (!currentBranch) {
    return null;
  }

  const branchText =
    baseBranch && baseBranch !== "HEAD" ? (
      <div className="flex items-center gap-1.5 truncate">
        <span className="text-white/60 truncate" title={baseBranch}>
          {baseBranch}
        </span>
        <ArrowRight className="w-3 h-3 flex-shrink-0 text-white/50" />
        <span
          className="text-white/80 font-medium truncate"
          title={currentBranch}
        >
          {currentBranch}
        </span>
      </div>
    ) : (
      <span className="text-white/80 truncate" title={currentBranch}>
        {currentBranch}
      </span>
    );

  return (
    <div className="border-t border-border bg-background/50 px-3 py-2 text-xs text-white/70 flex items-center gap-2 mt-auto">
      {/* Filter button - always show when onFilterToggle is provided */}
      {onFilterToggle && (
        <button
          type="button"
          onClick={onFilterToggle}
          className={`p-1 rounded transition-colors ${
            showOnlyChangedFiles
              ? "bg-foreground/20 hover:bg-foreground/25"
              : "hover:bg-foreground/10"
          }`}
          title={
            showOnlyChangedFiles
              ? "Show all files"
              : "Show only files with changes"
          }
        >
          <Filter size={14} />
        </button>
      )}

      {/* Branch icon button - clickable if onClick provided */}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`p-1 rounded transition-colors ${
            baseBranch && baseBranch !== "HEAD"
              ? "bg-foreground/20 hover:bg-foreground/25"
              : "hover:bg-foreground/10"
          }`}
          title={
            baseBranch && baseBranch !== "HEAD"
              ? `Comparing ${baseBranch} → ${currentBranch}. Click to change comparison branch.`
              : `Current branch: ${currentBranch}. Click to select comparison branch.`
          }
        >
          <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
        </button>
      ) : (
        <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
      )}

      {/* Branch text */}
      {branchText}
    </div>
  );
}
