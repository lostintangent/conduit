import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { focusTab, openTab } from "@/store/actions/tab";
import { applicationModeAtom } from "@/store/atoms";
import { tabLabelsAtom } from "@/store/tabLabels";
import { useAtomValue, useSetAtom } from "jotai";
import { Minimize2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TabPreviewItem } from "./TabPreviewItem";

export function TabsOverview() {
  const { mountTabsInPreview, unmountTabsFromPreview } = useTabContentPortal();

  const tabLabels = useAtomValue(tabLabelsAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);

  const allTabsContainerRefs = useRef<Record<string, HTMLDivElement>>({});
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);

  const handleRefSet = useCallback(
    (tabId: string, el: HTMLDivElement | null) => {
      if (el) {
        allTabsContainerRefs.current[tabId] = el;
      } else {
        delete allTabsContainerRefs.current[tabId];
      }

      const allReady = tabLabels.every(
        (tab) => allTabsContainerRefs.current[tab.id]
      );

      if (allReady && Object.keys(allTabsContainerRefs.current).length > 0) {
        mountTabsInPreview(allTabsContainerRefs.current);
      }
    },
    [tabLabels, mountTabsInPreview]
  );

  // Unmount tabs from preview whenever
  // this component is unmounted
  useEffect(() => {
    return () => {
      unmountTabsFromPreview();
      allTabsContainerRefs.current = {};
    };
  }, []);

  return (
    <div className="relative flex flex-1 overflow-auto bg-surface min-h-0">
      <div className="mx-auto flex w-full max-w-[90vw] flex-wrap gap-4 self-start px-6 py-8 justify-center">
        {tabLabels.map((tab) => (
          <div key={tab.id} className="flex flex-col gap-2 items-center">
            <TabPreviewItem
              tabId={tab.id}
              onRefSet={handleRefSet}
              onClick={() => focusTab(tab.id)}
              scale={0.6}
              isHovered={hoveredTabId === tab.id}
            />

            <button
              type="button"
              onClick={() => focusTab(tab.id)}
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId(null)}
              onFocus={() => setHoveredTabId(tab.id)}
              onBlur={() => setHoveredTabId(null)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-1 truncate max-w-[320px]"
              title={tab.label}
            >
              {tab.label}
            </button>
          </div>
        ))}
      </div>

      {/* Floating action buttons */}
      <div className="pointer-events-none fixed bottom-3 right-3 z-[1000] flex items-center">
        <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 shadow-lg backdrop-blur pointer-events-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={() => openTab()}
                aria-label="New tab"
              >
                <Plus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">New tab (⌘T)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={() => setApplicationMode("normal")}
                aria-label="Exit tab overview"
              >
                <Minimize2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Exit tab overview</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
