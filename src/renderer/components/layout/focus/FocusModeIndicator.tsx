import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { exitFocusMode } from "@/store/actions/focusMode";
import { activatePane } from "@/store/actions/pane";
import { focusTab } from "@/store/actions/tab";
import { activeTabAtom, activeTabIdAtom, tabsAtom } from "@/store/atoms";
import { tabLabelsAtom } from "@/store/tabLabels";
import { shallow, useSelector } from "@tanstack/react-store";
import { ArrowLeft, ArrowRight, Shrink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FocusModeMiniMap } from "./FocusModeMiniMap";

export function FocusModeIndicator() {
  const [isVisible, setIsVisible] = useState(false);
  const activeTabId = useSelector(activeTabIdAtom);
  const totalTabs = useSelector(tabsAtom, (tabs) => tabs.length);
  const activeTabIndex = useSelector(tabsAtom, (tabs) =>
    tabs.findIndex((tab) => tab.id === activeTabId),
  );
  // Pane titles change constantly, so select only what the indicator shows
  const activeTab = useSelector(
    activeTabAtom,
    (tab) =>
      tab && {
        layout: tab.layout,
        activePaneId: tab.activePaneId,
        paneCount: Object.keys(tab.panes).length,
      },
    { compare: shallow },
  );
  const activeTabLabel = useSelector(
    tabLabelsAtom,
    (labels) => labels.find((tab) => tab.id === activeTabId)?.name ?? "",
  );

  const hasMultipleTabs = totalTabs > 1;
  const canGoPrev = hasMultipleTabs && activeTabIndex > 0;
  const canGoNext =
    hasMultipleTabs && activeTabIndex >= 0 && activeTabIndex < totalTabs - 1;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const navigateToAdjacentTab = useCallback(
    (direction: "prev" | "next") => {
      if (activeTabIndex === -1) {
        return;
      }

      if (direction === "prev") {
        if (!canGoPrev) {
          return;
        }
        focusTab(tabsAtom.get()[activeTabIndex - 1].id);
        return;
      }

      if (!canGoNext) {
        return;
      }

      focusTab(tabsAtom.get()[activeTabIndex + 1].id);
    },
    [activeTabIndex, canGoNext, canGoPrev],
  );

  const handleSelectPane = useCallback(
    (paneId: string) => {
      if (!activeTabId) {
        return;
      }

      activatePane(activeTabId, paneId);
    },
    [activeTabId],
  );

  const hasMultiplePanes = (activeTab?.paneCount ?? 0) > 1;

  const miniMap = useMemo(() => {
    if (!activeTab || !hasMultiplePanes) {
      return null;
    }

    return (
      <FocusModeMiniMap
        layout={activeTab.layout}
        activePaneId={activeTab.activePaneId}
        onSelectPane={handleSelectPane}
      />
    );
  }, [activeTab, hasMultiplePanes, handleSelectPane]);

  if (!activeTab) {
    return null;
  }

  let tabInfo = activeTabLabel;
  if (hasMultipleTabs) {
    tabInfo = `${activeTabIndex + 1}/${totalTabs}`;
    if (activeTabLabel) {
      tabInfo += ` (${activeTabLabel})`;
    }
  }

  return (
    <div
      className={`absolute bottom-3 right-3 z-[60] flex items-center gap-2 text-white transition-opacity duration-200 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-end gap-2">
        {miniMap}
        <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 shadow-lg backdrop-blur">
          {tabInfo && (
            <span className="text-xs text-white/90 font-medium">{tabInfo}</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10 disabled:hover:text-white/80"
                onClick={() => navigateToAdjacentTab("prev")}
                aria-label="Previous tab"
                disabled={!canGoPrev}
              >
                <ArrowLeft size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Previous tab</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10 disabled:hover:text-white/80"
                onClick={() => navigateToAdjacentTab("next")}
                aria-label="Next tab"
                disabled={!canGoNext}
              >
                <ArrowRight size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Next tab</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={() => exitFocusMode()}
                aria-label="Exit focus mode"
              >
                <Shrink size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Exit focus mode (⌘⌥F)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
