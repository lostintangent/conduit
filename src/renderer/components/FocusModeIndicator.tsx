import { X } from "lucide-react";
import { useEffect, useState } from "react";

type FocusModeIndicatorProps = {
  onExit: () => void;
  currentPaneIndex?: number;
  totalPanes?: number;
};

export function FocusModeIndicator({
  onExit,
  currentPaneIndex,
  totalPanes,
}: FocusModeIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade in animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const paneInfo =
    currentPaneIndex !== undefined && totalPanes !== undefined
      ? ` • ${currentPaneIndex + 1} of ${totalPanes}`
      : "";

  return (
    <div
      className={`absolute top-2 right-3 z-[1000] flex items-center gap-2 rounded-lg border border-blue-500/40 bg-black/80 px-3 py-2 text-xs text-white/90 shadow-lg backdrop-blur-sm transition-opacity duration-200 ${isVisible ? "opacity-100" : "opacity-0"
        }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-0.5">
        <div className="font-semibold text-blue-400">Focus Mode{paneInfo}</div>
        <div className="text-white/60">
          <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px]">⌘←</kbd>
          {" / "}
          <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px]">⌘→</kbd>
          {" navigate • "}
          <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px]">⌘⇧F</kbd>
          {" exit"}
        </div>
      </div>
      <button
        type="button"
        onClick={onExit}
        title="Exit focus mode (⌘⇧F)"
        className="ml-1 rounded-md p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <X size={14} />
      </button>
    </div>
  );
}
