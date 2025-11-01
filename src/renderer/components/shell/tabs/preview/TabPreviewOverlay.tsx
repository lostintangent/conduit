import { useRef } from "react";
import { createPortal } from "react-dom";
import { usePreviewParents } from "./usePreviewParents";
import { TabPreviewItem } from "./TabPreviewItem";

type TabPreviewOverlayProps = {
  preview: {
    tabId: string;
    left: number;
    top: number;
  } | null;
  onPreviewHoverChange?: (isHovering: boolean) => void;
};

export function TabPreviewOverlay({ preview, onPreviewHoverChange }: TabPreviewOverlayProps) {
  const registerPreviewParent = usePreviewParents(!!preview);
  const outerContainerRef = useRef<HTMLDivElement | null>(null);

  if (!preview) return null;

  // Single tab preview mode - overlay wrapper with positioning
  return createPortal(
    <div
      ref={outerContainerRef}
      className="pointer-events-auto fixed z-[9999] transition-all duration-150 bg-surface shadow-xl backdrop-blur-sm rounded-lg border border-white/[0.08] hover:border-blueprint/50 hover:shadow-2xl cursor-pointer"
      style={{
        left: preview.left,
        top: preview.top,
        transform: "translate3d(0, calc(-106%), 0)",
        // Add padding to extend the hover area and bridge the gap to the tab
        padding: "0.5rem",
      }}
      onMouseEnter={() => {
        onPreviewHoverChange?.(true);
      }}
      onMouseLeave={(e) => {
        // Check if we're actually leaving the container, or just moving to a child element
        const relatedTarget = e.relatedTarget as Node | null;
        const isLeavingToChild = relatedTarget && outerContainerRef.current?.contains(relatedTarget);

        // Only trigger hover change if we're actually leaving the container
        if (!isLeavingToChild) {
          onPreviewHoverChange?.(false);
        }
      }}
    >
      <TabPreviewItem
        tabId={preview.tabId}
        onParentChange={registerPreviewParent}
      />
    </div>,
    document.body
  );
}
