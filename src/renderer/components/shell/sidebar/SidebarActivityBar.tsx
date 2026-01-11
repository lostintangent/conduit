/**
 * SidebarActivityBar - Vertical icon bar for switching between sidebar views
 *
 * Displays icons for editor and canvas views. Clicking an icon switches
 * the sidebar content. Uses elevated background with right border styling.
 */

import { cn } from "@/utils";
import type { SidebarView } from "@/store/atoms";
import { FolderTree, Palette, PanelRightClose } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// =============================================================================
// Types
// =============================================================================

interface SidebarActivityBarProps {
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  onClose: () => void;
}

// =============================================================================
// Sub-components
// =============================================================================

interface ActivityBarButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  active: boolean;
  onClick: () => void;
}

function ActivityBarButton({
  icon,
  tooltip,
  active,
  onClick,
}: ActivityBarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "p-1 rounded transition-colors",
            active
              ? "bg-accent text-accent-foreground"
              : "hover:bg-foreground/10",
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SidebarActivityBar({
  view,
  onViewChange,
  onClose,
}: SidebarActivityBarProps) {
  return (
    <div className="flex flex-col items-center justify-between px-1.5 py-2 bg-elevated border-r border-border shrink-0">
      <div className="flex flex-col items-center gap-1">
        <ActivityBarButton
          icon={<FolderTree size={14} />}
          tooltip="File Explorer"
          active={view === "editor"}
          onClick={() => onViewChange("editor")}
        />
        <ActivityBarButton
          icon={<Palette size={14} />}
          tooltip="Drawing Canvas"
          active={view === "canvas"}
          onClick={() => onViewChange("canvas")}
        />
      </div>

      <ActivityBarButton
        icon={<PanelRightClose size={14} />}
        tooltip="Close Sidebar"
        active={false}
        onClick={onClose}
      />
    </div>
  );
}
