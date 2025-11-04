import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { focusTab } from "@/store/actions/tab";
import { applicationModeAtom } from "@/store/atoms";
import type { TabLabelDescriptor } from "@/hooks/useTabLabels";
import { useCallback, useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { TabPreviewItem } from "./TabPreviewItem";

type TabsOverviewProps = {
  tabLabels: Pick<TabLabelDescriptor, "id" | "label">[];
};

export function TabsOverview({ tabLabels }: TabsOverviewProps) {
  const { mountTabsInPreview, unmountTabsFromPreview } = useTabContentPortal();
  const allTabsContainerRefs = useRef<Record<string, HTMLDivElement>>({});
  const setApplicationMode = useSetAtom(applicationModeAtom);

  const handleRefSet = useCallback(
    (tabId: string, el: HTMLDivElement | null) => {
      if (el) {
        allTabsContainerRefs.current[tabId] = el;
      } else {
        delete allTabsContainerRefs.current[tabId];
      }

      const allReady = tabLabels.every(
        (tab) => allTabsContainerRefs.current[tab.id],
      );

      if (allReady && Object.keys(allTabsContainerRefs.current).length > 0) {
        mountTabsInPreview(allTabsContainerRefs.current);
      }
    },
    [tabLabels, mountTabsInPreview],
  );

  const handleTabClick = useCallback(
    (tabId: string) => {
      focusTab(tabId);
      setApplicationMode("normal");
    },
    [setApplicationMode],
  );

  useEffect(() => {
    if (tabLabels.length === 0) {
      unmountTabsFromPreview();
      allTabsContainerRefs.current = {};
    }
  }, [tabLabels.length, unmountTabsFromPreview]);

  useEffect(() => {
    return () => {
      unmountTabsFromPreview();
      allTabsContainerRefs.current = {};
    };
  }, [unmountTabsFromPreview]);

  return (
    <div className="flex flex-1 overflow-auto bg-surface min-h-0">
      <div className="mx-auto flex w-full max-w-[90vw] flex-wrap gap-4 self-start px-6 py-8 justify-center">
        {tabLabels.map((tab) => {
          const focusThisTab = () => handleTabClick(tab.id);

          return (
            <div key={tab.id} className="flex flex-col gap-2 items-center">
              <TabPreviewItem
                tabId={tab.id}
                onRefSet={handleRefSet}
                onClick={handleTabClick}
                scale={0.6}
              />
              <button
                type="button"
                onClick={focusThisTab}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-1 truncate max-w-[320px]"
                title={tab.label}
              >
                {tab.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
