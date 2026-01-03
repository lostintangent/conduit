import { useAtomValue } from "jotai";
import { Cable } from "lucide-react";

import { workspaceNameAtom } from "@/store/atoms";

import { Separator } from "@/components/ui/separator";
import { SettingsMenu } from "./SettingsMenu";
import { WindowControls } from "./WindowControls";
import { WorkspaceMenu } from "./WorkspaceMenu";

const api = window.conduit;

// On Windows, we use titleBarOverlay for native window controls
// All platforms now use custom frameless window with rounded corners
const isWindows = api.platform === "win32";
const isMac = api.platform === "darwin";

export const TitleBar = () => {
  const workspaceName = useAtomValue(workspaceNameAtom);

  // Windows: add padding for overlay (~140px), regular size rounding to match system
  // macOS/Linux: xl-rounded corners on both top sides
  const titleBarClasses = isWindows
    ? "h-[30px] flex items-center justify-between pl-3 pr-[140px] text-[0.8rem] rounded-tl rounded-tr font-medium bg-elevated mb-[1px] [app-region:drag]"
    : "h-[30px] flex items-center justify-between px-3 text-[0.8rem] font-medium bg-elevated mb-[1px] [app-region:drag]";

  const workspaceSettingsClasses = isWindows
    ? "flex-1 flex justify-start pr-[140px]"
    : "flex-1 flex justify-end";
  const WorkspaceSettings = (
    <div className={workspaceSettingsClasses}>
      <div className="flex gap-2 [app-region:no-drag]">
        <SettingsMenu />
        <Separator
          orientation="vertical"
          className="h-4.5 mt-[3px] bg-elevated-border"
        />
        <WorkspaceMenu />
        {/* Only show custom window controls on Linux (macOS has traffic lights, Windows uses native frame) */}
        {!isMac && !isWindows && (
          <>
            <Separator
              orientation="vertical"
              className="h-4.5 mt-[3px] bg-elevated-border"
            />
            <WindowControls />
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={titleBarClasses}>
      {/* Left area: dragging or workspace settings */}
      {isWindows ? WorkspaceSettings : <div className="flex-1" />}

      {/* Center (Title and workspace name) */}
      <div className="flex gap-2 items-center">
        <Cable size={14} />
        Conduit
        <span className="text-muted-foreground/70">
          {workspaceName && ` (${workspaceName})`}
        </span>
      </div>

      {/* Right area Workspace settings, optional window controls or (Drag area) */}
      {isWindows ? <div className="flex-1" /> : WorkspaceSettings}
    </div>
  );
};
