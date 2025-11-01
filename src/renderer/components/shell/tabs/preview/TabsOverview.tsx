import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { focusTab } from "@/store/actions/tab";
import { useCallback } from "react";
import { TabPreviewItem } from "./TabPreviewItem";
import { usePreviewParents } from "./usePreviewParents";

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
  const registerPreviewParent = usePreviewParents(isOpen);

  const handleTabClick = useCallback(
    (tabId: string) => {
      focusTab(tabId);
      onClose();
    },
    [onClose]
  );

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
                onParentChange={registerPreviewParent}
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
