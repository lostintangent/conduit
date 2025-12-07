import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePackageJsonScripts } from "@/hooks/usePackageJsonScripts";
import { applicationModeAtom } from "@/store/atoms";
import { getHashedColor } from "@/utils/theme";
import { useAtomValue } from "jotai";
import { Cloud, GitFork, GitMerge, Play, Trash2 } from "lucide-react";
import { useMemo } from "react";

type SandboxIndicatorProps = {
  vmId?: string | null;
  agentSessionId?: string | null;
  cwd?: string;
  onCompleteAgentSession?: () => void;
  onDeleteAgentSession?: () => void;
  onForkVM?: () => void;
  onRunScript?: (script: string) => void;
};

export function SandboxIndicator({
  vmId,
  agentSessionId,
  cwd,
  onCompleteAgentSession,
  onDeleteAgentSession,
  onForkVM,
  onRunScript,
}: SandboxIndicatorProps) {
  const applicationMode = useAtomValue(applicationModeAtom);
  const isSandboxVisibleMode =
    applicationMode === "normal" || applicationMode === "design";

  const { scripts, packageJsonPath, loading } = usePackageJsonScripts(cwd);
  const hasScripts = scripts && Object.keys(scripts).length > 0;

  const showVmIndicator = isSandboxVisibleMode && !!vmId;
  const showAgentControls = isSandboxVisibleMode && !!agentSessionId;
  const overlayKey = showVmIndicator
    ? vmId
    : showAgentControls
      ? agentSessionId
      : null;

  const overlayColor = useMemo(
    () => (overlayKey ? getHashedColor(overlayKey) : undefined),
    [overlayKey],
  );

  const overlayStyle = useMemo(
    () =>
      overlayColor
        ? {
            backgroundColor: overlayColor,
          }
        : undefined,
    [overlayColor],
  );

  const vmTitle = useMemo(() => {
    if (!showVmIndicator || !vmId) {
      return undefined;
    }

    return `Connected to VM ${vmId}`;
  }, [showVmIndicator, vmId]);

  if (!showVmIndicator && !showAgentControls && !hasScripts) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-2 text-white z-10">
      {showVmIndicator && (
        <div
          className="pointer-events-auto group flex items-center gap-2 rounded-full px-3 py-2 shadow-lg backdrop-blur text-white/90 transition-all duration-200 opacity-80"
          style={overlayStyle}
          title={vmTitle}
        >
          <Cloud size={16} aria-hidden="true" />
          {onForkVM && (
            <button
              type="button"
              onClick={onForkVM}
              title="Fork VM (split pane with clone)"
              className="w-0 opacity-0 group-hover:w-[26px] group-hover:opacity-100 overflow-hidden transition-all duration-200 rounded-full bg-white/10 p-1.5 text-white/80 hover:bg-white/20 hover:text-white"
            >
              <GitFork size={14} />
            </button>
          )}
        </div>
      )}

      {(showAgentControls || (hasScripts && onRunScript)) && (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-full px-3 py-2 shadow-lg backdrop-blur opacity-80"
          style={overlayStyle}
        >
          {showAgentControls && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onCompleteAgentSession}
                    className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
                  >
                    <GitMerge size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" align="center">
                  Merge changes
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onDeleteAgentSession}
                    className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
                  >
                    <Trash2 size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" align="center">
                  Delete worktree
                </TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Package.json Scripts Dropdown */}
          {hasScripts && onRunScript && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
                    >
                      <Play size={16} />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" align="center">
                  Run npm script
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                align="end"
                className="w-56 max-h-[400px] overflow-y-auto"
                side="left"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  npm scripts
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {Object.entries(scripts).map(([scriptName, scriptCommand]) => (
                  <DropdownMenuItem
                    key={scriptName}
                    onClick={() => onRunScript(scriptName)}
                    className="cursor-pointer"
                  >
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="font-medium">{scriptName}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {scriptCommand}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
