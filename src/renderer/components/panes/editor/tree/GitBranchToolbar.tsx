import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowRight, GitCompare } from "lucide-react";
import { GitStatusSummary } from "./GitStatusSummary";
import type { GitStatusMap } from "@shared/types";

type GitBranchToolbarProps = {
  currentBranch: string | null;
  baseBranch: string | null;
  showOnlyChangedFiles: boolean;
  changedFilesCount?: number;
  gitStatus?: GitStatusMap | null;
  onFilterToggle: () => void;
  onOpenBranchPicker: () => void;
};

export function GitBranchToolbar({
  currentBranch,
  baseBranch,
  showOnlyChangedFiles,
  changedFilesCount = 0,
  gitStatus,
  onFilterToggle,
  onOpenBranchPicker,
}: GitBranchToolbarProps) {
  if (!currentBranch) {
    return null;
  }

  const branchLabel =
    baseBranch && baseBranch !== "HEAD" ? (
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span title={baseBranch}>{baseBranch}</span>
        <ArrowRight className="w-3 h-3 flex-shrink-0" />
        <span className="truncate" title={currentBranch}>
          {currentBranch}
        </span>
      </div>
    ) : (
      <span className="truncate" title={currentBranch}>
        {currentBranch}
      </span>
    );

  const toggleButtonClass = "[&_svg]:size-3.5";

  return (
    <div className="px-3 py-1.5 text-xs flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            pressed={baseBranch !== null && baseBranch !== "HEAD"}
            onPressedChange={() => onOpenBranchPicker()}
            size="sm"
            className={toggleButtonClass}
          >
            <GitCompare />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          {baseBranch && baseBranch !== "HEAD"
            ? `Comparing ${baseBranch} → ${currentBranch}`
            : "Comparing against HEAD"}
        </TooltipContent>
      </Tooltip>
      <div className="flex flex-1 truncate">{branchLabel}</div>

      {changedFilesCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              pressed={showOnlyChangedFiles}
              onPressedChange={() => onFilterToggle()}
              size="sm"
              className={`text-xs px-2 pr-3 py-0.5 h-auto ${showOnlyChangedFiles ? "border border-border bg-primary/10" : ""}`}
            >
              <GitStatusSummary
                gitStatus={gitStatus}
                changedFilesCount={changedFilesCount}
              />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>
            {showOnlyChangedFiles
              ? "Showing only changed files • Click to show all files"
              : `Show only ${changedFilesCount} changed ${changedFilesCount === 1 ? "file" : "files"}`}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
