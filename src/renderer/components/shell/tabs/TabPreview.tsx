import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { TabPreviewItem } from "./TabPreviewItem";

type TabPreviewProps = {
  preview: {
    tabId: string;
    left: number;
    top: number;
  } | null;
};

export function TabPreview({ preview }: TabPreviewProps) {
  const { mountTabsInPreview, unmountTabsFromPreview } = useTabContentPortal();

  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!preview) {
      unmountTabsFromPreview();
      return;
    }

    mountTabsInPreview({ [preview.tabId]: previewContainerRef.current! });

    return unmountTabsFromPreview;
  }, [preview, mountTabsInPreview, unmountTabsFromPreview]);

  if (!preview) return null;

  const handleRefSet = (tabId: string, el: HTMLDivElement | null) => {
    if (el) {
      previewContainerRef.current = el;
    }
  };

  // Single tab preview mode - overlay wrapper with positioning
  return createPortal(
    <div
      className="pointer-events-none fixed z-[9999] transition-opacity duration-150 bg-surface shadow-xl backdrop-blur-sm rounded-lg"
      style={{
        left: preview.left,
        top: preview.top,
        transform: "translate3d(0, calc(-106%), 0)",
      }}
    >
      <TabPreviewItem tabId={preview.tabId} onRefSet={handleRefSet} />
    </div>,
    document.body
  );
}
