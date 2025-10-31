import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { tabsAtom } from "@/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { TabPreviewItem } from "./TabPreviewItem";

type TabsOverviewProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function TabsOverview({ isOpen, onClose }: TabsOverviewProps) {
  const { mountAllTabsForPreview, unmountAllTabsFromPreview } = useTabContentPortal();
  const tabs = useAtomValue(tabsAtom);
  const allTabsContainerRefs = useRef<Record<string, HTMLDivElement>>({});

  const handleRefSet = useCallback(
    (tabId: string, el: HTMLDivElement | null) => {
      if (el) {
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
      unmountAllTabsFromPreview();
      allTabsContainerRefs.current = {};
    }
  }, [isOpen, unmountAllTabsFromPreview]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] bg-surface-elevated border-border overflow-auto">
        <DialogHeader>
          <DialogTitle>All Tabs ({tabs.length})</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-4 p-4">
          {tabs.map((tab) => (
            <TabPreviewItem key={tab.id} tabId={tab.id} onRefSet={handleRefSet} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
