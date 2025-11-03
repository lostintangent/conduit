import type { LayoutNode } from "@/types";
import { ArrowLeft, ArrowRight, Shrink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FocusModeMiniMap } from "./FocusModeMiniMap";

type FocusModeIndicatorProps = {
  onExit: () => void;
  onPrevious: () => void;
  onNext: () => void;
  currentPaneIndex?: number;
  totalPanes?: number;
  layout: LayoutNode;
  activePaneId: string;
  onSelectPane: (paneId: string) => void;
};

export function FocusModeIndicator({
  onExit,
  onPrevious,
  onNext,
  currentPaneIndex,
  totalPanes,
  layout,
  activePaneId,
  onSelectPane,
}: FocusModeIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);
  const hasMultiplePanes = (totalPanes ?? 0) > 1;

  useEffect(() => {
    // Fade in animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const paneInfo =
    currentPaneIndex !== undefined && totalPanes !== undefined
      ? `${currentPaneIndex + 1} of ${totalPanes}`
      : "";

  const miniMap = useMemo(
    () =>
      hasMultiplePanes ? (
        <FocusModeMiniMap
          layout={layout}
          activePaneId={activePaneId}
          onSelectPane={onSelectPane}
        />
      ) : null,
    [activePaneId, hasMultiplePanes, layout, onSelectPane],
  );

  return (
    <div
      className={`absolute bottom-3 right-3 z-[1000] flex items-center gap-2 text-white transition-opacity duration-200 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-end gap-2">
        {miniMap}
        <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-xs text-white/90 font-medium">{paneInfo}</span>
          <button
            type="button"
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10 disabled:hover:text-white/80"
            onClick={onPrevious}
            aria-label="Previous pane"
            title="Previous pane (⌘←)"
            disabled={!hasMultiplePanes}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10 disabled:hover:text-white/80"
            onClick={onNext}
            aria-label="Next pane"
            title="Next pane (⌘→)"
            disabled={!hasMultiplePanes}
          >
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            onClick={onExit}
            aria-label="Exit focus mode"
            title="Exit focus mode (⌘⌥F)"
          >
            <Shrink size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
