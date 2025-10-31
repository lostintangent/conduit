import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PREVIEW_HEIGHT, PREVIEW_SCALE, PREVIEW_WIDTH, TabPreviewItem } from "./TabPreviewItem";

type TabPreviewProps = {
  preview: {
    tabId: string;
    left: number;
    top: number;
    allTabIds?: string[]; // For all-tabs preview mode
  } | null;
};

export function TabPreview({ preview }: TabPreviewProps) {
  const { mountTabInPreview, unmountTabFromPreview, mountAllTabsForPreview, unmountAllTabsFromPreview } = useTabContentPortal();

  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const allTabsContainerRefs = useRef<Record<string, HTMLDivElement>>({});

  useEffect(() => {
    if (!preview) {
      unmountTabFromPreview();
      unmountAllTabsFromPreview();
      return;
    }

    // Single tab preview mode
    if (preview.tabId && previewContainerRef.current) {
      mountTabInPreview(preview.tabId, previewContainerRef.current);
      return unmountTabFromPreview;
    }

    // All tabs preview mode - cleanup
    if (!preview.tabId && preview.allTabIds) {
      return () => {
        unmountAllTabsFromPreview();
        allTabsContainerRefs.current = {};
      };
    }
  }, [preview, mountTabInPreview, unmountTabFromPreview, mountAllTabsForPreview, unmountAllTabsFromPreview]);

  if (!preview) return null;

  // All tabs preview mode (when tabId is empty and allTabIds is provided)
  if (!preview.tabId && preview.allTabIds) {
    const handleRefSet = useCallback(
      (tabId: string, el: HTMLDivElement | null) => {
        if (el && preview.allTabIds) {
          allTabsContainerRefs.current[tabId] = el;

          // Check if all containers are now ready
          const allReady = preview.allTabIds.every(
            (id) => allTabsContainerRefs.current[id]
          );

          if (allReady) {
            mountAllTabsForPreview(preview.allTabIds, allTabsContainerRefs.current);
          }
        }
      },
      [preview.allTabIds, mountAllTabsForPreview]
    );

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
          className="pointer-events-none flex flex-wrap gap-2 overflow-hidden rounded-lg border border-white/[0.12] bg-surface shadow-xl backdrop-blur-sm p-2"
        >
          {preview.allTabIds.map((tabId) => (
            <TabPreviewItem key={tabId} tabId={tabId} onRefSet={handleRefSet} />
          ))}
        </div>
      </div>,
      document.body
    );
  }

  // Single tab preview mode (existing behavior)
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
