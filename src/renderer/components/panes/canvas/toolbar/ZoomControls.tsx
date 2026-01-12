import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Maximize2, Minus, Plus } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

type ZoomControlsProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToFit: () => void;
  isEmpty?: boolean;
};

// =============================================================================
// Component
// =============================================================================

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToFit,
  isEmpty,
}: ZoomControlsProps) {
  const zoomPercentage = Math.round(zoom * 100);

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onZoomOut}
            className="p-1 rounded hover:bg-foreground/10 transition-colors shrink-0"
          >
            <Minus size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom out</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onResetZoom}
            className="px-1.5 py-0.5 rounded hover:bg-foreground/10 transition-colors text-xs min-w-[45px] text-center"
          >
            {zoomPercentage}%
          </button>
        </TooltipTrigger>
        <TooltipContent>Reset to 100%</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onZoomIn}
            className="p-1 rounded hover:bg-foreground/10 transition-colors shrink-0"
          >
            <Plus size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onZoomToFit}
            disabled={isEmpty}
            className="p-1 rounded hover:bg-foreground/10 transition-colors shrink-0 ml-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Maximize2 size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom to fit (Ctrl+0)</TooltipContent>
      </Tooltip>
    </div>
  );
}
