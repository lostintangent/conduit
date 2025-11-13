import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { TabPreviewItem } from "./TabPreviewItem";

type TabPreviewOverlayProps = {
  preview: {
    tabId: string;
    left: number;
    top: number;
  } | null;
  onPreviewHoverChange?: (isHovering: boolean) => void;
};

export function TabPreviewOverlay({
  preview,
  onPreviewHoverChange,
}: TabPreviewOverlayProps) {
  const { mountTabsInPreview, unmountTabsFromPreview } = useTabContentPortal();

  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const outerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!preview) {
      unmountTabsFromPreview();
      return;
    }

    mountTabsInPreview({ [preview.tabId]: previewContainerRef.current! });

    return unmountTabsFromPreview;
  }, [preview, mountTabsInPreview, unmountTabsFromPreview]);

  if (!preview) return null;

  const handleRefSet = (_tabId: string, el: HTMLDivElement | null) => {
    if (el) {
      previewContainerRef.current = el;
    }
  };

  // Single tab preview mode - overlay wrapper with positioning
  return createPortal(
    <div
      ref={outerContainerRef}
      className="pointer-events-auto fixed z-[9999] bg-surface shadow-xl backdrop-blur-sm  hover:border-accent/50 hover:shadow-2xl cursor-pointer"
      style={{
        left: preview.left,
        top: preview.top,
        transform: "translate3d(0, calc(-106%), 0)",
      }}
      onMouseEnter={() => {
        onPreviewHoverChange?.(true);
      }}
      onMouseLeave={(e) => {
        // Check if we're actually leaving the container, or just moving to a child element
        const relatedTarget = e.relatedTarget as Node | null;
        const isLeavingToChild =
          relatedTarget && outerContainerRef.current?.contains(relatedTarget);

        // Only trigger hover change if we're actually leaving the container
        if (!isLeavingToChild) {
          onPreviewHoverChange?.(false);
        }
      }}
    >
      <TabPreviewItem tabId={preview.tabId} onRefSet={handleRefSet} />
    </div>,
    document.body,
  );
}
