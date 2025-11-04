import { activatePane } from "@/store/actions/pane";
import { exitFocusMode, getAllPaneIds } from "@/store/actions/focusMode";
import { focusTab } from "@/store/actions/tab";
import {
  activeTabAtom,
  activeTabIdAtom,
  tabsAtom,
} from "@/store/atoms";
import { ArrowLeft, ArrowRight, ZoomOut } from "lucide-react";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FocusModeMiniMap } from "./FocusModeMiniMap";

export function FocusModeIndicator() {
  const [isVisible, setIsVisible] = useState(false);
  const tabs = useAtomValue(tabsAtom);
  const activeTabId = useAtomValue(activeTabIdAtom);
  const activeTab = useAtomValue(activeTabAtom);

  const totalTabs = tabs.length;
  const activeTabIndex = useMemo(() => {
    if (!activeTabId) {
      return -1;
    }
    return tabs.findIndex((tab) => tab.id === activeTabId);
  }, [tabs, activeTabId]);

  const activeTabPaneIds = useMemo(() => {
    if (!activeTab) {
      return [];
    }
    return getAllPaneIds(activeTab);
  }, [activeTab]);

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
        focusTab(tabs[activeTabIndex - 1].id);
        return;
      }

      if (!canGoNext) {
        return;
      }

      focusTab(tabs[activeTabIndex + 1].id);
    },
    [activeTabIndex, canGoNext, canGoPrev, tabs],
  );

  const handleSelectPane = useCallback(
    (paneId: string) => {
      if (!activeTab) {
        return;
      }

      activatePane(activeTab.id, paneId);
    },
    [activeTab],
  );

  const miniMap = useMemo(() => {
    if (!activeTab || activeTabPaneIds.length <= 1) {
      return null;
    }

    return (
      <FocusModeMiniMap
        key={activeTabPaneIds.join("|")}
        layout={activeTab.layout}
        activePaneId={activeTab.activePaneId}
        onSelectPane={handleSelectPane}
      />
    );
  }, [activeTab, activeTabPaneIds, handleSelectPane]);

  if (!activeTab) {
    return null;
  }

  const tabInfo =
    totalTabs > 0 && activeTabIndex >= 0
      ? `${activeTabIndex + 1} of ${totalTabs}`
      : "";

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
          <span className="text-xs text-white/90 font-medium">{tabInfo}</span>
          <button
            type="button"
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10 disabled:hover:text-white/80"
            onClick={() => navigateToAdjacentTab("prev")}
            aria-label="Previous tab"
            title="Previous tab (⌘←)"
            disabled={!canGoPrev}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10 disabled:hover:text-white/80"
            onClick={() => navigateToAdjacentTab("next")}
            aria-label="Next tab"
            title="Next tab (⌘→)"
            disabled={!canGoNext}
          >
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            onClick={() => exitFocusMode()}
            aria-label="Exit focus mode"
            title="Exit focus mode (⌘⌥F)"
          >
            <ZoomOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
