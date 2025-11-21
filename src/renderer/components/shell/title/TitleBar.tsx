import { useAtomValue } from "jotai";
import { Cable } from "lucide-react";

import { workspaceNameAtom } from "@/store/atoms";
import type { UserSettings } from "@shared/types";

import { Separator } from "@/components/ui/separator";
import { SettingsMenu } from "./SettingsMenu";
import { WindowControls } from "./WindowControls";
import { WorkspaceMenu } from "./WorkspaceMenu";

const api = window.conduit;

type TitleBarProps = {
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
  onOpenTerminalFontSettings: () => void;
};

export const TitleBar = ({
  onUpdateSettings,
  onOpenTerminalFontSettings,
}: TitleBarProps) => {
  const workspaceName = useAtomValue(workspaceNameAtom);

  return (
    <div className="h-[30px] flex items-center justify-between px-3 text-[0.8rem] font-medium rounded-tl-xl rounded-tr-xl bg-elevated mb-[1px] [app-region:drag]">
      {/* Left area (Drag area) */}
      <div className="flex-1" />

      {/* Center (Title and workspace name) */}
      <div className="flex gap-2 items-center">
        <Cable size={14} />
        Conduit
        <span className="text-muted-foreground/70">
          {workspaceName && ` (${workspaceName})`}
        </span>
      </div>

      {/* Right area (Workspace/Settings menu + optional window controls) */}
      <div className="flex-1 flex justify-end">
        <div className="flex gap-2 [app-region:no-drag]">
          <WorkspaceMenu />
          <Separator
            orientation="vertical"
            className="h-4.5 mt-[3px] bg-elevated-border"
          />
          <SettingsMenu
            onUpdateSettings={onUpdateSettings}
            onOpenTerminalFontSettings={onOpenTerminalFontSettings}
          />
          {api.platform !== "darwin" && <WindowControls />}
        </div>
      </div>
    </div>
  );
};
