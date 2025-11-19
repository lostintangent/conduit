import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowRight, Filter, GitCompare } from "lucide-react";

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

  const toggleButtonClass = "h-auto px-1 py-1 min-w-0 [&_svg]:size-3.5";

  return (
    <div className="px-3 py-1.5 text-xs flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
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

      <Separator
        orientation="vertical"
        className="bg-elevated-border mr-1 h-4"
      />

      {branchLabel}
    </div>
  );
}
