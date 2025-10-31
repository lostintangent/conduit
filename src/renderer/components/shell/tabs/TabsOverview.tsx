import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { focusTab } from "@/store/actions/tab";
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

  const handleTabClick = useCallback(
    (tabId: string) => {
      focusTab(tabId);
      onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) {
      unmountAllTabsFromPreview();
      allTabsContainerRefs.current = {};
    }
  }, [isOpen, unmountAllTabsFromPreview]);

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
              <TabPreviewItem
                tabId={tab.id}
                onRefSet={handleRefSet}
                onClick={handleTabClick}
                clickable={true}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
