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

  // Windows: no rounded corners in css (Windows 11 handles rounding), add padding for overlay (~140px)
  // macOS/Linux: rounded corners on both top sides
  const titleBarClasses = isWindows
    ? "h-[30px] flex items-center justify-between pl-3 pr-[140px] pl-[140px] text-[0.8rem] font-medium bg-elevated mb-[1px] [app-region:drag]"
    : "h-[30px] flex items-center justify-between px-3 text-[0.8rem] font-medium rounded-tl-xl rounded-tr-xl bg-elevated mb-[1px] [app-region:drag]";

  return (
    <div className={titleBarClasses}>
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
    </div>
  );
};
