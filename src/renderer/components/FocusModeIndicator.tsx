import { ArrowBigUp, ArrowLeft, ArrowRight, Command } from "lucide-react";
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
      ? ` (${currentPaneIndex + 1} of ${totalPanes})`
      : "";

  const baseButtonClass =
    "rounded bg-white/10 px-1 py-1 text-white/80 items-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 hover:bg-white/20 cursor-pointer flex";

  return (
    <div
      className={`absolute top-2 right-3 z-[1000] flex items-center gap-2 rounded-lg border border-blue-500/40 bg-black/80 px-3 py-2 text-xs text-white/90 shadow-lg backdrop-blur-sm transition-opacity duration-200 ${isVisible ? "opacity-100" : "opacity-0"
        }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-1">
        <div className="font-semibold text-blue-400">Focus Mode{paneInfo}</div>
        <div className="flex gap-1 items-center">
          <button
            type="button"
            className={baseButtonClass}
            onClick={onPrevious}
            aria-label="Previous pane"
          >
            <Command size={12} />
            <ArrowLeft size={12} />
          </button>
          {" / "}
          <button
            type="button"
            className={baseButtonClass}
            onClick={onNext}
            aria-label="Next pane"
          >
            <Command size={12} />
            <ArrowRight size={12} />
          </button>
          {" / "}
          <button
            type="button"
            className={baseButtonClass}
            onClick={onExit}
            aria-label="Exit focus mode"
          >
            <Command size={12} />
            <ArrowBigUp size={12} />F (Exit)
          </button>
        </div>
      </div>
    </div>
  );
}
