import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PREVIEW_HEIGHT, PREVIEW_SCALE, PREVIEW_WIDTH, TabPreviewItem } from "./TabPreviewItem";

type TabPreviewProps = {
  preview: {
    tabId: string;
    left: number;
    top: number;
  } | null;
};

export function TabPreview({ preview }: TabPreviewProps) {
  const { mountTabInPreview, unmountTabFromPreview } = useTabContentPortal();

  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!preview) {
      unmountTabFromPreview();
      return;
    }

    mountTabInPreview(preview.tabId, previewContainerRef.current!);

    return unmountTabFromPreview;
  }, [preview, mountTabInPreview, unmountTabFromPreview]);

  if (!preview) return null;

  const handleRefSet = (tabId: string, el: HTMLDivElement | null) => {
    if (el) {
      previewContainerRef.current = el;
    }
  };

  // Single tab preview mode
  return createPortal(
    <div
      className="pointer-events-none fixed z-[9999] transition-opacity duration-150"
      style={{
        left: preview.left,
        top: preview.top,
        transform: "translate3d(0, calc(-106%), 0)",
      }}
    >
      <div
        className="pointer-events-none flex overflow-hidden rounded-lg border border-white/[0.12] bg-surface shadow-xl backdrop-blur-sm"
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
        }}
      >
        <div
          className="pointer-events-none flex"
          style={{
            transform: `scale(${PREVIEW_SCALE})`,
            transformOrigin: "top left",
            width: PREVIEW_WIDTH / PREVIEW_SCALE,
            height: PREVIEW_HEIGHT / PREVIEW_SCALE,
          }}
        >
          <TabPreviewItem tabId={preview.tabId} onRefSet={handleRefSet} />
        </div>
      </div>
    </div>,
    document.body
  );
}
