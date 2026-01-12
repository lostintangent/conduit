import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SidebarView } from "@/store/sidebarStore";
import { cn } from "@/utils";
import {
  FolderTree,
  Globe,
  Lock,
  Maximize,
  Minimize,
  Palette,
  PanelRightClose,
  Unlock,
} from "lucide-react";

interface SidebarActivityBarProps {
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  isLocked: boolean;
  onLockToggle: () => void;
  isExpanded: boolean;
  onExpandToggle: () => void;
  onClose: () => void;
}

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

export function SidebarActivityBar({
  view,
  onViewChange,
  isLocked,
  onLockToggle,
  isExpanded,
  onExpandToggle,
  onClose,
}: SidebarActivityBarProps) {
  return (
    <div className="flex flex-col items-center justify-between px-1.5 py-2 bg-elevated border-r border-border shrink-0">
      <div className="flex flex-col items-center gap-3">
        <ActivityBarButton
          icon={<FolderTree size={14} />}
          tooltip="File Explorer"
          active={view === "editor"}
          onClick={() => onViewChange("editor")}
        />
        <ActivityBarButton
          icon={<Globe size={14} />}
          tooltip="Browser"
          active={view === "browser"}
          onClick={() => onViewChange("browser")}
        />
        <ActivityBarButton
          icon={<Palette size={14} />}
          tooltip="Drawing Canvas"
          active={view === "canvas"}
          onClick={() => onViewChange("canvas")}
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        <ActivityBarButton
          icon={isLocked ? <Lock size={14} /> : <Unlock size={14} />}
          tooltip={isLocked ? "Unlock from CWD" : "Lock to CWD"}
          active={isLocked}
          onClick={onLockToggle}
        />

        {/* Separator */}
        <div className="w-4 h-px bg-elevated-border" />

        <ActivityBarButton
          icon={isExpanded ? <Minimize size={14} /> : <Maximize size={14} />}
          tooltip={isExpanded ? "Collapse" : "Expand"}
          active={false}
          onClick={onExpandToggle}
        />
        <ActivityBarButton
          icon={<PanelRightClose size={14} />}
          tooltip="Close Sidebar"
          active={false}
          onClick={onClose}
        />
      </div>
    </div>
  );
}
