import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { applicationModeAtom } from "@/store/atoms";
import { getHashedColor } from "@/utils/color";
import { useAtomValue } from "jotai";
import { GitMerge, Trash2 } from "lucide-react";
import { useMemo } from "react";

type SandboxIndicatorProps = {
  agentSessionId?: string | null;
  onCompleteAgentSession?: () => void;
  onDeleteAgentSession?: () => void;
  overlayStyle?: React.CSSProperties;
};

export function SandboxIndicator({
  agentSessionId,
  onCompleteAgentSession,
  onDeleteAgentSession,
  overlayStyle: providedOverlayStyle,
}: SandboxIndicatorProps) {
  const applicationMode = useAtomValue(applicationModeAtom);
  const isSandboxVisibleMode =
    applicationMode === "normal" || applicationMode === "design";

  const showAgentControls = isSandboxVisibleMode && !!agentSessionId;
  const overlayKey = showAgentControls ? agentSessionId : null;

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

  if (!showAgentControls) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 w-fit h-fit flex flex-col items-end gap-2 text-white z-10">
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
          <TooltipContent side="top">Merge changes</TooltipContent>
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
          <TooltipContent side="top">Delete worktree</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
