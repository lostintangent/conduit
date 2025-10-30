import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 200;
const PREVIEW_SCALE = 0.35;

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

    mountTabInPreview(preview.tabId, previewContainerRef.current);

    return unmountTabFromPreview;
  }, [preview]);

  if (!preview) return null;

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
          <div
            ref={previewContainerRef}
            className="pointer-events-none flex w-full h-full min-h-0 min-w-0"
            style={{
              width: PREVIEW_WIDTH / PREVIEW_SCALE,
              height: PREVIEW_HEIGHT / PREVIEW_SCALE,
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
