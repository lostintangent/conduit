import { useAtomValue } from "jotai";
import { Cable } from "lucide-react";

import { workspaceNameAtom } from "@/store/atoms";
import type { UserSettings } from "@shared/types";

import { cn } from "@/utils";
import { SettingsMenu } from "./SettingsMenu";
import { WorkspaceMenu } from "./WorkspaceMenu";

const api = window.conduit;

type TitleBarProps = {
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
};

export const TitleBar = ({
  onUpdateSettings,
}: TitleBarProps) => {
  if (api.platform !== "darwin") return null;

  const workspaceName = useAtomValue(workspaceNameAtom);

  return (
    <div
      className="h-[28px] flex items-center justify-between px-3 text-[0.8rem] text-white/40 font-medium rounded-tl-xl rounded-tr-xl bg-surface-muted mb-[1px] [app-region:drag]"
    >
      {/* Left area (Drag area) */}
      <div className="flex-1" />

      {/* Center () */}
      <div className="flex gap-2 items-center">
        <Cable size={14} />
        Conduit
        {workspaceName && ` (${workspaceName})`}
      </div>

      {/* Right area (Workspace/Settings menu) */}
      <div className="flex-1 flex justify-end gap-2">
        <div className="flex gap-2 [app-region:no-drag]">
          <WorkspaceMenu />

          {/* Vertical divider */}
          <div className="h-5 w-px bg-white/10 mt-[6px]" />

          <SettingsMenu onUpdateSettings={onUpdateSettings} />
        </div>
      </div>
    </div>
  );
};
