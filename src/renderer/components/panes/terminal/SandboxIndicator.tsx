import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { applicationModeAtom } from "@/store/atoms";
import { getHashedColor } from "@/utils/theme";
import { useAtomValue } from "jotai";
import { Cloud, GitFork, GitMerge, Trash2 } from "lucide-react";
import { useMemo } from "react";

type SandboxIndicatorProps = {
  vmId?: string | null;
  agentSessionId?: string | null;
  onCompleteAgentSession?: () => void;
  onDeleteAgentSession?: () => void;
  onForkVM?: () => void;
  overlayStyle?: React.CSSProperties;
};

export function SandboxIndicator({
  vmId,
  agentSessionId,
  onCompleteAgentSession,
  onDeleteAgentSession,
  onForkVM,
  overlayStyle: providedOverlayStyle,
}: SandboxIndicatorProps) {
  const applicationMode = useAtomValue(applicationModeAtom);
  const isSandboxVisibleMode =
    applicationMode === "normal" || applicationMode === "design";

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
      providedOverlayStyle ??
      (overlayColor
        ? {
            backgroundColor: overlayColor,
          }
        : undefined),
    [overlayColor, providedOverlayStyle],
  );

  const vmTitle = useMemo(() => {
    if (!showVmIndicator || !vmId) {
      return undefined;
    }

    return `Connected to VM ${vmId}`;
  }, [showVmIndicator, vmId]);

  if (!showVmIndicator && !showAgentControls) {
    return null;
  }

  return (
    <>
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

      {showAgentControls && (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-full px-3 py-2 shadow-lg backdrop-blur opacity-80"
          style={overlayStyle}
        >
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
            <TooltipContent side="bottom" align="center">
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
            <TooltipContent side="bottom" align="center">
              Delete worktree
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </>
  );
}
