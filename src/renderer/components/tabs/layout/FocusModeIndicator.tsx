import { ArrowBigUp, ArrowLeft, ArrowRight } from "lucide-react";
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

  return (
    <div
      className={`absolute bottom-3 right-3 z-[1000] flex items-center gap-2 text-white transition-opacity duration-200 ${isVisible ? "opacity-100" : "opacity-0"
        }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 shadow-lg backdrop-blur">
        <span className="text-xs text-white/90 font-medium">
          Focus Mode{paneInfo}
        </span>
        <button
          type="button"
          className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          onClick={onPrevious}
          aria-label="Previous pane"
          title="Previous pane (⌘←)"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          onClick={onNext}
          aria-label="Next pane"
          title="Next pane (⌘→)"
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          onClick={onExit}
          aria-label="Exit focus mode"
          title="Exit focus mode (⌘⇧F)"
        >
          <ArrowBigUp size={16} />
        </button>
      </div>
    </div>
  );
}
