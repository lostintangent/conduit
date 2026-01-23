import { useCommand } from "@/commands/hooks/useCommand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApplicationCommands } from "@shared/commands";
import {
  Check,
  Copy,
  Grid3x3,
  ImagePlus,
  Minimize2,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

type ActionsMenuProps = {
  onCopyToClipboard: () => void;
  onAddImage: () => void;
  onClear: () => void;
  showCopySuccess?: boolean;
  showDotGrid: boolean;
  onToggleDotGrid: () => void;
  tabId?: string;
  isEmpty?: boolean;
};

// =============================================================================
// Component
// =============================================================================

export function ActionsMenu({
  onCopyToClipboard,
  onAddImage,
  onClear,
  showCopySuccess,
  showDotGrid,
  onToggleDotGrid,
  tabId,
  isEmpty,
}: ActionsMenuProps) {
  const collapsePane = useCommand(ApplicationCommands.PANE_COLLAPSE);
  const closePane = useCommand(ApplicationCommands.PANE_CLOSE);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1 rounded hover:bg-foreground/10 transition-colors shrink-0"
            >
              {showCopySuccess ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <MoreHorizontal size={14} />
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onCopyToClipboard} disabled={isEmpty}>
          <Copy size={14} className="mr-2" />
          Copy to clipboard
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAddImage}>
          <ImagePlus size={14} className="mr-2" />
          Insert image
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleDotGrid}>
          <Grid3x3 size={14} className="mr-2" />
          Show dot grid
          {showDotGrid && <Check size={14} className="ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClear} disabled={isEmpty}>
          <Trash2 size={14} className="mr-2" />
          Clear canvas
        </DropdownMenuItem>
        {tabId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={collapsePane.execute}>
              <Minimize2 size={14} className="mr-2" />
              Collapse canvas
            </DropdownMenuItem>
            <DropdownMenuItem onClick={closePane.execute}>
              <X size={14} className="mr-2" />
              Close canvas
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
