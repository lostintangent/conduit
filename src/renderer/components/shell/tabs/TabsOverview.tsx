import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCallback, useEffect, useRef } from "react";
import { TabPreviewItem } from "./TabPreviewItem";

type TabInfo = {
  id: string;
  label: string;
};

type TabsOverviewProps = {
  isOpen: boolean;
  onClose: () => void;
  tabs: TabInfo[];
};

export function TabsOverview({ isOpen, onClose, tabs }: TabsOverviewProps) {
  const { mountAllTabsForPreview, unmountAllTabsFromPreview } = useTabContentPortal();
  const allTabsContainerRefs = useRef<Record<string, HTMLDivElement>>({});
  const isOpenRef = useRef(isOpen);

  // Track isOpen state
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const handleRefSet = useCallback(
    (tabId: string, el: HTMLDivElement | null) => {
      if (el && isOpenRef.current) {
        allTabsContainerRefs.current[tabId] = el;

        // Check if all containers are now ready
        const allReady = tabs.every(
          (tab) => allTabsContainerRefs.current[tab.id]
        );

        if (allReady) {
          const tabIds = tabs.map((tab) => tab.id);
          mountAllTabsForPreview(tabIds, allTabsContainerRefs.current);
        }
      }
    },
    [tabs, mountAllTabsForPreview]
  );

  useEffect(() => {
    if (!isOpen) {
      // Clean up refs first
      allTabsContainerRefs.current = {};
      // Then unmount from preview which will trigger re-render of tab content
      unmountAllTabsFromPreview();
    }
  }, [isOpen, unmountAllTabsFromPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      allTabsContainerRefs.current = {};
      unmountAllTabsFromPreview();
    };
  }, [unmountAllTabsFromPreview]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] bg-surface-elevated border-border overflow-auto">
        <DialogHeader>
          <DialogTitle>Tab overview</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-4">
          {tabs.map((tab) => (
            <div key={tab.id} className="flex flex-col gap-2">
              <div className="text-sm text-muted-foreground px-1 truncate max-w-[320px]">
                {tab.label}
              </div>
              <TabPreviewItem tabId={tab.id} onRefSet={handleRefSet} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
