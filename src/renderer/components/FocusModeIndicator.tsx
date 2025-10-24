import { useEffect, useState } from "react";

type FocusModeIndicatorProps = {
  onExit: () => void;
  onPrevious: () => void;
  onNext: () => void;
  currentPaneIndex?: number;
  totalPanes?: number;
};

export function FocusModeIndicator({
  onExit,
  onPrevious,
  onNext,
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

  const baseButtonClass =
    "rounded bg-white/10 px-1 py-0.5 text-[13px] text-white/80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 hover:bg-white/20 cursor-pointer";

  return (
    <div
      className={`absolute top-2 right-3 z-[1000] flex items-center gap-2 rounded-lg border border-blue-500/40 bg-black/80 px-3 py-2 text-xs text-white/90 shadow-lg backdrop-blur-sm transition-opacity duration-200 ${isVisible ? "opacity-100" : "opacity-0"
        }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        <div className="font-semibold text-blue-400">Focus Mode{paneInfo}</div>
        <div>
          <button
            type="button"
            className={baseButtonClass}
            onClick={onPrevious}
            aria-label="Previous pane"
          >
            ⌘←
          </button>
          {" / "}
          <button
            type="button"
            className={baseButtonClass}
            onClick={onNext}
            aria-label="Next pane"
          >
            ⌘→
          </button>
          {" / "}
          <button
            type="button"
            className={baseButtonClass}
            onClick={() => onExit()}
            aria-label="Exit focus mode"
          >
            ⌘⇧F (Exit)
          </button>
        </div>
      </div>
    </div>
  );
}
