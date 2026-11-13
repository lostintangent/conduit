import { useAtomValue } from "jotai";
import { Cable } from "lucide-react";

import { workspaceNameAtom } from "@/store/atoms";

import { Separator } from "@/components/ui/separator";
import { SettingsMenu } from "./SettingsMenu";
import { WorkspaceMenu } from "./WorkspaceMenu";

export const TitleBar = () => {
  const workspaceName = useAtomValue(workspaceNameAtom);

  return (
    <div className="h-[30px] flex items-center justify-between px-3 text-[0.8rem] font-medium bg-elevated mb-[1px] [app-region:drag]">
      {/* Left drag area (macOS traffic lights sit here) */}
      <div className="flex-1" />

      {/* Center (Title and workspace name) */}
      <div className="flex gap-2 items-center">
        <Cable size={14} />
        Conduit
        <span className="text-muted-foreground/70">
          {workspaceName && ` (${workspaceName})`}
        </span>
      </div>

      {/* Right area: workspace settings */}
      <div className="flex-1 flex justify-end">
        <div className="flex gap-2 [app-region:no-drag]">
          <SettingsMenu />
          <Separator
            orientation="vertical"
            className="h-4.5 mt-[3px] bg-elevated-border"
          />
          <WorkspaceMenu />
        </div>
      </div>
    </div>
  );
};
