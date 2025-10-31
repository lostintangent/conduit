import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import {
  Dialog,
  DialogContent,
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
  const { mountTabsForPreview, unmountTabsFromPreview } = useTabContentPortal();
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
          mountTabsForPreview(allTabsContainerRefs.current);
        }
      }
    },
    [tabs, mountTabsForPreview]
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
      unmountTabsFromPreview();
      allTabsContainerRefs.current = {};
    }
  }, [isOpen, unmountTabsFromPreview]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] bg-surface-elevated border-border overflow-auto flex flex-col">
        <div className="flex flex-wrap gap-4 justify-center items-center flex-1">
          {tabs.map((tab) => (
            <div key={tab.id} className="flex flex-col gap-2">
              <div className="text-sm text-muted-foreground px-1 truncate max-w-[320px]">
                {tab.label}
              </div>
              <TabPreviewItem
                tabId={tab.id}
                onRefSet={handleRefSet}
                onClick={handleTabClick}
                scale={0.6}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
