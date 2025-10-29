import { applicationModeAtom } from "@/store/atoms";
import { getHashedColor } from "@/utils/theme";
import { useAtomValue } from "jotai";
import { Check, Cloud, Trash2 } from "lucide-react";
import React, { useMemo } from "react";

type SandboxIndicatorProps = {
  vmId?: string | null;
  agentSessionId?: string | null;
  onCompleteAgentSession?: () => void;
  onDeleteAgentSession?: () => void;
};

export function SandboxIndicator({
  vmId,
  agentSessionId,
  onCompleteAgentSession,
  onDeleteAgentSession,
}: SandboxIndicatorProps) {
  const applicationMode = useAtomValue(applicationModeAtom);
  const isSandboxVisibleMode =
    applicationMode === "normal" || applicationMode === "design";

  const showVmIndicator = isSandboxVisibleMode && !!vmId;
  const showAgentControls = isSandboxVisibleMode && !!agentSessionId;
  const overlayKey = showVmIndicator ? vmId : showAgentControls ? agentSessionId : null;

  const overlayColor = useMemo(
    () => (overlayKey ? getHashedColor(overlayKey) : undefined),
    [overlayKey]
  );

  const overlayStyle = useMemo(
    () =>
      overlayColor
        ? {
          backgroundColor: overlayColor,
        }
        : undefined,
    [overlayColor]
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
    <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-2 text-white z-[1000]">
      {showVmIndicator && (
        <div
          className="flex items-center gap-2 rounded-full px-3 py-2 shadow-lg backdrop-blur text-white/90"
          style={overlayStyle}
          title={vmTitle}
        >
          <Cloud size={16} aria-hidden="true" />
        </div>
      )}

      {showAgentControls && (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-full px-3 py-2 shadow-lg backdrop-blur"
          style={overlayStyle}
        >
          <button
            type="button"
            onClick={onCompleteAgentSession}
            title="Complete agent session"
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={onDeleteAgentSession}
            title="Delete agent session"
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
