import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowRight, Filter, GitBranch } from "lucide-react";

type GitBranchToolbarProps = {
  currentBranch: string | null;
  baseBranch: string | null;
  showOnlyChangedFiles: boolean;
  onFilterToggle: () => void;
  onOpenBranchPicker: () => void;
};

export function GitBranchToolbar({
  currentBranch,
  baseBranch,
  showOnlyChangedFiles,
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

  const toggleButtonClass = "h-auto px-1.5 py-1 min-w-0 [&_svg]:size-3.5";

  return (
    <div className="border-t bg-elevated px-3 py-2 text-xs flex items-center gap-2 mt-auto">
      <Tooltip>
        <TooltipTrigger>
          <Toggle
            pressed={showOnlyChangedFiles}
            onPressedChange={() => onFilterToggle()}
            size="sm"
            className={toggleButtonClass}
          >
            <Filter />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          {showOnlyChangedFiles
            ? "Show all files"
            : "Show only files with changes"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          <Toggle
            pressed={baseBranch !== null && baseBranch !== "HEAD"}
            onPressedChange={() => onOpenBranchPicker()}
            size="sm"
            className={toggleButtonClass}
          >
            <GitBranch />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          {baseBranch && baseBranch !== "HEAD"
            ? `Comparing ${baseBranch} → ${currentBranch}`
            : `Current branch: ${currentBranch}`}
        </TooltipContent>
      </Tooltip>

      <Separator
        orientation="vertical"
        className="bg-elevated-border mr-1 h-5"
      />

      {branchLabel}
    </div>
  );
}
